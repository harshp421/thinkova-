import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { MongoDatabaseDriver } from "../backend/database/drivers/mongo-driver";
import { createHmac } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { dbManager, dbRouter } from "../backend/database/client";
import { CronEngine } from "../backend/cron/engine";
import { refundStatusJob } from "../backend/jobs";
import type { RefundEntity } from "../backend/database/types";
import { graphMailer } from "../backend/notifications/graph-mailer";
import { smtpMailer } from "../backend/notifications/smtp";
import { POST as createRefund } from "../src/app/api/cashfree/refund/route";
import { POST as processWebhook } from "../src/app/api/cashfree/webhook/route";
import { createTestSession, seedDynamicTestData } from "./fixtures";

vi.mock("../backend/notifications/openwa", async importOriginal => {
  const module = await importOriginal<typeof import("../backend/notifications/openwa")>();
  return {
    ...module,
    openwaClient: new module.OpenWAClient("virtual-openwa-key", "https://openwa.example.test/api", "virtual-session"),
  };
});

let auditDriver: MongoDatabaseDriver | undefined;

afterEach(async () => {
  if (auditDriver) {
    dbRouter.setDomainRoute("commerce", "memory");
    dbRouter.setDomainRoute("schools", "memory");
    dbRouter.setDomainRoute("default", "memory");
    await auditDriver.disconnect();
    auditDriver = undefined;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("records a virtual Cashfree refund, sends its OpenWA notice once, and persists completion", async () => {
  const secret = "virtual-refund-test-secret";
  vi.stubEnv("CASHFREE_APP_ID", "virtual-test-app");
  vi.stubEnv("CASHFREE_SECRET_KEY", secret);
  vi.stubEnv("CASHFREE_ENV", "SANDBOX");
  vi.stubEnv("OPENWA_API_KEY", "virtual-openwa-key");
  vi.stubEnv("OPENWA_API_URL", "https://openwa.example.test/api");
  vi.stubEnv("OPENWA_SESSION_ID", "virtual-session");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.spyOn(graphMailer, "isConfigured").mockReturnValue(false);
  vi.spyOn(smtpMailer, "isConfigured").mockReturnValue(false);

  const whatsappRequests: unknown[] = [];
  const requestProvider = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "sandbox.cashfree.com" && url.pathname.endsWith("/orders/ord_paid_202/refunds")) {
      const body = JSON.parse(String(options?.body));
      expect(options?.method).toBe("POST");
      expect(body.refund_amount).toBe(2499);
      return Response.json({
        refund_id: body.refund_id, cf_refund_id: "virtual-cf-refund", refund_status: "PENDING",
        refund_amount: 2499, refund_currency: "INR",
      });
    }
    if (url.hostname === "openwa.example.test" && url.pathname === "/api/sessions") {
      return Response.json([{ id: "virtual-session", status: "WORKING" }]);
    }
    if (url.hostname === "openwa.example.test" && url.pathname === "/api/sessions/virtual-session/messages/send-text") {
      expect(options?.method).toBe("POST");
      whatsappRequests.push(JSON.parse(String(options?.body)));
      return Response.json({ id: "virtual-wa-message" });
    }
    throw new Error("Unexpected external request: " + url.hostname);
  });
  vi.stubGlobal("fetch", requestProvider);

  if (process.env.RUN_VIRTUAL_REFUND_MONGO === "1") {
    const config = parseEnv(readFileSync(".env", "utf8"));
    const source = config.STUDENTS_COMMERCE_DATABASE_URL;
    const parts = source?.match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)\/[^?]*(\?.*)?$/);
    if (!parts) throw new Error("MongoDB connection configuration unavailable");
    const databaseName = "thinkova_refund_audit_" + Date.now();
    auditDriver = new MongoDatabaseDriver(parts[1] + "/" + databaseName + (parts[2] || ""));
    if (!await auditDriver.connect()) throw new Error("Could not connect to the isolated audit database");
    dbRouter.registerDriver("refund-audit-mongo", auditDriver);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "virtual-refund-test-only-auth-secret-2026");
    await auditDriver.get("refunds", "virtual-refund-permission-check");

  }

  await seedDynamicTestData(auditDriver ? "refund-audit-mongo" : "memory");
  if (auditDriver) expect(dbRouter.getDriverForDomain("commerce")).toBe(auditDriver);
  const token = await createTestSession({
    userId: "usr_parent_01", email: "parent@example.test", username: "Test Parent",
    fullName: "Test Parent", role: "PARENT", phone: "9000000000",
  });
  await dbManager.commerce.upsertPayment({
    id: "virtual-refund-payment", orderId: "ord_paid_202", gateway: "CASHFREE",
    gatewayOrderId: "ord_paid_202", gatewayPaymentId: "virtual-payment-id",
    paymentMethod: "UPI", amountInPaise: 499900, status: "SUCCESS", paidAt: new Date(),
  });

  const response = await createRefund(new Request("https://thinkova.example.test/api/cashfree/refund", {
    method: "POST", headers: { authorization: "Bearer " + token },
    body: JSON.stringify({ orderId: "ord_paid_202", refundAmountInRupees: 2499, reason: "DEMO_DAY_GUARANTEE" }),
  }));
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(200);
  const id = result.refund.id;
  const readRefund = () => dbRouter.get<RefundEntity>("refunds", id, "commerce");
  expect(await readRefund()).toMatchObject({
    status: "INITIATED", amountInPaise: 249900, gatewayRefundId: "virtual-cf-refund",
  });

  const engine = new CronEngine();
  engine.registerJob(refundStatusJob);
  const notice = await engine.runJobNow(refundStatusJob.id);
  expect(notice).toMatchObject({ status: "SUCCESS", recordsProcessed: 1 });
  expect(whatsappRequests).toEqual([{
    chatId: "919000000000@c.us",
    text: expect.stringMatching(/₹2,499.*virtual-cf-refund/),
  }]);
  expect(await dbRouter.get("refund_deliveries", id + ":whatsapp", "commerce")).toMatchObject({ status: "SENT" });
  expect(await readRefund()).toMatchObject({ refundAlertSentAt: expect.any(Date) });
  expect((await engine.runJobNow(refundStatusJob.id)).recordsProcessed).toBe(0);
  expect(whatsappRequests).toHaveLength(1);

  const body = JSON.stringify({ type: "REFUND_STATUS_WEBHOOK", data: { refund: {
    refund_id: id, cf_refund_id: "virtual-cf-refund", refund_status: "SUCCESS",
  } } });
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret).update(timestamp + body).digest("base64");
  const completed = await processWebhook(new Request("https://thinkova.example.test/api/cashfree/webhook", {
    method: "POST", headers: { "x-webhook-timestamp": timestamp, "x-webhook-signature": signature }, body,
  }));
  expect(completed.status).toBe(200);
  expect(await readRefund()).toMatchObject({
    status: "COMPLETED", completedAt: expect.any(Date), refundAlertSentAt: expect.any(Date),
  });
  expect((await dbManager.commerce.getPaymentByOrderId("ord_paid_202"))?.status).toBe("REFUNDED");
  expect((await dbManager.commerce.getEnrollmentById("enr_01"))?.status).toBe("REFUNDED");
  if (auditDriver) {
    const persisted = await auditDriver.get<RefundEntity>("refunds", id);
    expect(persisted).toMatchObject({ status: "COMPLETED", refundAlertSentAt: expect.any(Date) });
    console.info("Verified MongoDB refund document:", id);
  }
});
