import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createOrderHandler, GET as getOrderHandler } from "../src/app/api/cashfree/order/route";
import { POST as createRefundHandler, GET as getRefundHandler } from "../src/app/api/cashfree/refund/route";
import { POST as webhookHandler } from "../src/app/api/cashfree/webhook/route";
import { dbManager, dbRouter } from "../backend/database/client";
import { defaultDispatcher } from "../backend/notifications/dispatcher";
import { graphMailer } from "../backend/notifications/graph-mailer";
import { openwaClient } from "../backend/notifications/openwa";
import { smtpMailer } from "../backend/notifications/smtp";
import { CronEngine } from "../backend/cron/engine";
import { enrollmentSuccessJob, refundStatusJob } from "../backend/jobs";
import { preAggregators } from "../backend/aggregators";
import { authenticateParent, createTestSession, seedDynamicTestData } from "./fixtures";

describe("End-to-End Payment + Cashfree Refund Pipeline, Dispatcher & DB Load", () => {
  const originalEnv = { ...process.env };
  const testSecret = "cf_sec_key_refund_pipeline_test";

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.CASHFREE_APP_ID = "CF_APP_REFUND_TEST";
    process.env.CASHFREE_SECRET_KEY = testSecret;
    process.env.CASHFREE_ENV = "SANDBOX";
    process.env.CASHFREE_SITE_URL = "https://sandbox.example.test";
    delete process.env.RESEND_API_KEY;
    delete process.env.WATI_BEARER_TOKEN;

    vi.spyOn(graphMailer, "isConfigured").mockReturnValue(false);
    vi.spyOn(smtpMailer, "isConfigured").mockReturnValue(false);
    vi.spyOn(openwaClient, "isConfigured").mockReturnValue(false);

    // Mock Cashfree createOrder & createRefund HTTP endpoints
    const mockFetch = vi.fn().mockImplementation(async (url: unknown, opts?: { body?: string }) => {
      const urlStr = String(url || "");
      let body: Record<string, unknown> = {};
      try {
        if (opts?.body) body = JSON.parse(opts.body);
      } catch {
        // ignore
      }

      if (urlStr.includes("/refunds")) {
        return new Response(
          JSON.stringify({
            order_id: urlStr.split("/orders/")[1]?.split("/refunds")[0] || "ord_refund_test",
            refund_id: body.refund_id || "ref_cf_test",
            cf_refund_id: "CF_REF_998877",
            refund_amount: body.refund_amount || 4499,
            refund_currency: "INR",
            refund_status: "PENDING",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          order_id: body.order_id || "ord_refund_test",
          cf_order_id: 9876543,
          order_status: "ACTIVE",
          order_amount: body.order_amount || 4499,
          order_currency: "INR",
          payment_session_id: "session_refund_pipeline_test",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", mockFetch);

    await seedDynamicTestData();
    defaultDispatcher.clearOutbox();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function signWebhook(payloadObj: Record<string, unknown>) {
    const rawBody = JSON.stringify(payloadObj);
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto.createHmac("sha256", testSecret).update(`${ts}${rawBody}`).digest("base64");
    return new Request("http://localhost:3000/api/cashfree/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-timestamp": ts,
        "x-webhook-signature": sig,
      },
      body: rawBody,
    });
  }

  it("1. Runs complete Payment -> Webhook -> Refund API -> Dispatcher -> Refund Webhook -> DB Lifecycle", async () => {
    // 1. Create Cashfree Order
    const createReq = new Request("http://localhost:3000/api/cashfree/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        termsAccepted: true,
        studentName: "Kabir Mehta",
        parentName: "Anjali Mehta",
        parentEmail: "anjali.mehta@example.com",
        parentPhone: "9811223344",
        schoolUid: "DPS-PUN-01",
        grade: 7,
        paymentPlan: "FULL",
        courseId: "ai-study-helper",
        amountInRupees: 4499,
      }),
    });
    await authenticateParent(createReq);
    const parentAuth = createReq.headers.get("authorization") || "";
    const createRes = await createOrderHandler(createReq);
    expect(createRes.status).toBe(200);
    const { orderId, enrollmentId } = await createRes.json();

    // 2. Confirm Payment via Signed Webhook
    const payWebhookRes = await webhookHandler(
      signWebhook({
        type: "PAYMENT_SUCCESS_WEBHOOK",
        data: {
          order: { order_id: orderId, cf_order_id: 9876543, order_amount: 4499, order_currency: "INR" },
          payment: {
            cf_payment_id: "cf_pay_refund_999",
            payment_status: "SUCCESS",
            payment_amount: 4499,
            payment_currency: "INR",
            payment_group: "UPI",
          },
        },
      })
    );
    expect(payWebhookRes.status).toBe(200);

    // Verify GET /api/cashfree/order shows PAID
    const orderStatusRes = await getOrderHandler(
      new Request(`http://localhost:3000/api/cashfree/order?orderId=${encodeURIComponent(orderId)}`, {
        headers: { authorization: parentAuth },
      })
    );
    expect(orderStatusRes.status).toBe(200);
    expect((await orderStatusRes.json()).isPaid).toBe(true);

    const staffToken = await createTestSession({ userId: "refund-admin", email: "staff@example.test", username: "staff", fullName: "Staff", role: "SUPER_ADMIN" });
    const staffAuth = "Bearer " + staffToken;
    const unapproved = await createRefundHandler(new Request("http://localhost:3000/api/cashfree/refund", {
      method: "POST", headers: { authorization: staffAuth },
      body: JSON.stringify({ orderId, reason: "DEMO_DAY_GUARANTEE", demoDayFailed: true }),
    }));
    expect(unapproved.status).toBe(409);

    // 3. Initiate Refund via POST /api/cashfree/refund
    const refundRes = await createRefundHandler(
      new Request("http://localhost:3000/api/cashfree/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: staffAuth },
        body: JSON.stringify({ orderId, reason: "CLIENT_WITHDRAWAL", refundAmountInRupees: 4499 }),
      })
    );
    expect(refundRes.status).toBe(200);
    const refundJson = await refundRes.json();
    expect(refundJson.status).toBe("success");
    expect(refundJson.refund.status).toBe("INITIATED");
    expect(refundJson.refund.gatewayRefundId).toBe("CF_REF_998877");
    const refundId: string = refundJson.refund.id;

    // 4. Duplicate Refund Attempt Must Be Blocked With 409 Conflict
    const dupRefundRes = await createRefundHandler(
      new Request("http://localhost:3000/api/cashfree/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: staffAuth },
        body: JSON.stringify({ orderId, reason: "CLIENT_WITHDRAWAL", refundAmountInRupees: 4499 }),
      })
    );
    expect(dupRefundRes.status).toBe(409);
    expect((await dupRefundRes.json()).code).toBe("REFUND_ALREADY_EXISTS");

    // 5. Run Refund Status Cron Job & Verify Dispatcher + Idempotency
    defaultDispatcher.clearOutbox();
    const engine = new CronEngine();
    engine.registerJob(enrollmentSuccessJob);
    engine.registerJob(refundStatusJob);

    const refundLog = await engine.runJobNow("job.refund_status_notification");
    expect(refundLog.status).toBe("SUCCESS");
    expect(refundLog.recordsProcessed).toBe(1);

    const emails = defaultDispatcher.getEmailOutbox("anjali.mehta@example.com");
    const whatsApps = defaultDispatcher.getWhatsAppOutbox("9811223344");
    expect(emails).toHaveLength(1);
    expect(emails[0]?.text).toContain("CF_REF_998877");
    expect(whatsApps).toHaveLength(1);
    expect(whatsApps[0]?.fallbackText).toContain("₹4,499");

    // Second run must send 0 duplicates
    const secondRun = await engine.runJobNow("job.refund_status_notification");
    expect(secondRun.recordsProcessed).toBe(0);
    expect(defaultDispatcher.getEmailOutbox("anjali.mehta@example.com")).toHaveLength(1);

    // 6. Trigger Cashfree REFUND_STATUS_WEBHOOK (SUCCESS) -> Lifecycle Transition
    const refundWebhookRes = await webhookHandler(
      signWebhook({
        type: "REFUND_STATUS_WEBHOOK",
        data: {
          refund: {
            order_id: orderId,
            refund_id: refundId,
            cf_refund_id: "CF_REF_998877",
            refund_amount: 4499,
            refund_currency: "INR",
            refund_status: "SUCCESS",
          },
        },
      })
    );
    expect(refundWebhookRes.status).toBe(200);
    const refundWebhookJson = await refundWebhookRes.json();
    expect(refundWebhookJson.event).toBe("REFUND_STATUS_UPDATED");
    expect(refundWebhookJson.refundStatus).toBe("COMPLETED");

    // Verify DB records transitioned: refund COMPLETED, enrollment REFUNDED, payment REFUNDED
    const finalRefund = await dbManager.commerce.getRefundById(refundId);
    const finalEnrollment = await dbManager.commerce.getEnrollmentById(enrollmentId);
    const finalPayment = await dbManager.commerce.getPaymentByOrderId(orderId);
    expect(finalRefund?.status).toBe("COMPLETED");
    expect(finalRefund?.completedAt).toBeDefined();
    expect(finalEnrollment?.status).toBe("REFUNDED");
    expect(finalPayment?.status).toBe("REFUNDED");

    // 7. Verify GET /api/cashfree/refund returns COMPLETED & REFUNDED
    const getRefRes = await getRefundHandler(
      new Request(`http://localhost:3000/api/cashfree/refund?refundId=${encodeURIComponent(refundId)}`, {
        headers: { authorization: parentAuth },
      })
    );
    expect(getRefRes.status).toBe(200);
    const getRefJson = await getRefRes.json();
    expect(getRefJson.refund.status).toBe("COMPLETED");
    expect(getRefJson.enrollmentStatus).toBe("REFUNDED");
  });

  it("2. Enforces auth, ownership, and refund amount bounds on /api/cashfree/refund", async () => {
    const createReq = new Request("http://localhost:3000/api/cashfree/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        termsAccepted: true,
        studentName: "Mira Nair",
        parentName: "Deepa Nair",
        parentEmail: "deepa.nair@example.com",
        parentPhone: "9822334455",
        schoolUid: "DPS-PUN-01",
        grade: 6,
        paymentPlan: "FULL",
        courseId: "ai-study-helper",
        amountInRupees: 4499,
      }),
    });
    await authenticateParent(createReq, "owner-parent");
    const ownerAuth = createReq.headers.get("authorization") || "";
    const { orderId } = await (await createOrderHandler(createReq)).json();

    await webhookHandler(
      signWebhook({
        type: "PAYMENT_SUCCESS_WEBHOOK",
        data: {
          order: { order_id: orderId, cf_order_id: 9876543, order_amount: 4499, order_currency: "INR" },
          payment: {
            cf_payment_id: "cf_pay_auth_test",
            payment_status: "SUCCESS",
            payment_amount: 4499,
            payment_currency: "INR",
            payment_group: "UPI",
          },
        },
      })
    );

    // Unauthenticated -> 401
    const unauthRes = await createRefundHandler(
      new Request("http://localhost:3000/api/cashfree/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      })
    );
    expect(unauthRes.status).toBe(401);

    // Different parent -> 404 (IDOR blocked)
    const otherToken = await createTestSession({
      userId: "other-parent",
      email: "other@example.com",
      username: "other",
      fullName: "Other Parent",
      role: "PARENT",
    });
    const idorRes = await createRefundHandler(
      new Request("http://localhost:3000/api/cashfree/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${otherToken}` },
        body: JSON.stringify({ orderId }),
      })
    );
    expect(idorRes.status).toBe(404);

    const ownerRefund = await createRefundHandler(new Request("http://localhost:3000/api/cashfree/refund", {
      method: "POST", headers: { authorization: ownerAuth }, body: JSON.stringify({ orderId }),
    }));
    expect(ownerRefund.status).toBe(403);
    const adminToken = await createTestSession({ userId: "refund-admin", email: "staff@example.test", username: "staff", fullName: "Staff", role: "SUPER_ADMIN" });
    // Over-refund tampering -> 400
    const tamperRes = await createRefundHandler(
      new Request("http://localhost:3000/api/cashfree/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: "Bearer " + adminToken },
        body: JSON.stringify({ orderId, reason: "CLIENT_WITHDRAWAL", refundAmountInRupees: 99999 }),
      })
    );
    expect(tamperRes.status).toBe(400);
    expect((await tamperRes.json()).code).toBe("INVALID_REFUND_AMOUNT");
  });

  it("3. Skips WhatsApp when parentPhone is empty and avoids duplicate emails on partial failure", async () => {
    await dbManager.commerce.upsertUser({
      id: "usr_nophone",
      email: "nophone@example.com",
      phone: "",
      username: "NoPhone Parent",
      role: "PARENT",
      isPhoneVerified: false,
      isEmailVerified: true,
      consentTimestamp: new Date(),
      createdAt: new Date(),
    });
    await dbManager.commerce.upsertStudent({
      id: "stu_nophone",
      parentUserId: "usr_nophone",
      fullName: "Riya",
      schoolUid: "DPS-PUN-01",
      currentGrade: 6,
      createdAt: new Date(),
    });
    await dbManager.commerce.upsertEnrollment({
      id: "enr_nophone",
      studentId: "stu_nophone",
      cohortBatchId: "batch_dps_01",
      schoolUid: "DPS-PUN-01",
      paymentPlan: "FULL",
      status: "ENROLLED",
      currentLevel: 1,
      enrolledAt: new Date(),
      installment2Paid: true,
    });
    await dbManager.commerce.upsertOrder({
      id: "ord_nophone",
      enrollmentId: "enr_nophone",
      userId: "usr_nophone",
      orderType: "FULL_PAYMENT",
      amountInPaise: 449900,
      status: "PAID",
      checkoutUrl: "https://sandbox.example.test/checkout",
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    });
    await dbManager.commerce.upsertPayment({
      id: "pay_nophone",
      orderId: "ord_nophone",
      gateway: "CASHFREE",
      gatewayOrderId: "ord_nophone",
      gatewayPaymentId: "cf_pay_nophone",
      paymentMethod: "UPI",
      amountInPaise: 449900,
      status: "SUCCESS",
      paidAt: new Date(),
    });
    await dbManager.commerce.upsertRefund({
      id: "ref_nophone",
      paymentId: "pay_nophone",
      enrollmentId: "enr_nophone",
      amountInPaise: 449900,
      reason: "CLIENT_WITHDRAWAL",
      initiatedBy: "CLIENT",
      gatewayRefundId: "CF_REF_NOPHONE",
      status: "INITIATED",
      estimatedCreditDays: "5–7 business days",
      initiatedAt: new Date(),
    });

    const waSpy = vi.spyOn(defaultDispatcher, "sendWhatsApp");
    const engine = new CronEngine();
    engine.registerJob(refundStatusJob);

    const log = await engine.runJobNow("job.refund_status_notification");
    expect(log.recordsProcessed).toBe(1);
    expect(defaultDispatcher.getEmailOutbox("nophone@example.com")).toHaveLength(1);
    expect(waSpy).not.toHaveBeenCalled();
  });

  it("4. Verifies batched $in DB load optimization across 25 concurrent pending refunds (constant 4 reads)", async () => {
    const batchCount = 25;
    for (let i = 0; i < batchCount; i++) {
      const uid = `usr_load_${i}`;
      const sid = `stu_load_${i}`;
      const eid = `enr_load_${i}`;
      await dbManager.commerce.upsertUser({
        id: uid,
        email: `parent_${i}@example.com`,
        phone: `98000000${String(i).padStart(2, "0")}`,
        username: `Parent ${i}`,
        role: "PARENT",
        isPhoneVerified: true,
        isEmailVerified: true,
        consentTimestamp: new Date(),
        createdAt: new Date(),
      });
      await dbManager.commerce.upsertStudent({
        id: sid,
        parentUserId: uid,
        fullName: `Student ${i}`,
        schoolUid: "DPS-PUN-01",
        currentGrade: 6,
        createdAt: new Date(),
      });
      await dbManager.commerce.upsertEnrollment({
        id: eid,
        studentId: sid,
        cohortBatchId: "batch_dps_pun_01",
        schoolUid: "DPS-PUN-01",
        paymentPlan: "FULL",
        status: "ENROLLED",
        currentLevel: 2,
        enrolledAt: new Date(),
        installment2Paid: true,
      });
      await dbManager.commerce.upsertOrder({
        id: `ord_load_${i}`,
        enrollmentId: eid,
        userId: uid,
        orderType: "FULL_PAYMENT",
        amountInPaise: 499900,
        status: "PAID",
        checkoutUrl: "https://sandbox.example.test/checkout",
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
      });
      await dbManager.commerce.upsertPayment({
        id: `pay_load_${i}`,
        orderId: `ord_load_${i}`,
        gateway: "CASHFREE",
        gatewayOrderId: `ord_load_${i}`,
        gatewayPaymentId: `cf_pay_load_${i}`,
        paymentMethod: "UPI",
        amountInPaise: 499900,
        status: "SUCCESS",
        paidAt: new Date(),
      });
      await dbManager.commerce.upsertRefund({
        id: `ref_load_${i}`,
        paymentId: `pay_load_${i}`,
        enrollmentId: eid,
        amountInPaise: 499900,
        reason: "BATCH_CANCELLED",
        initiatedBy: "MANAGEMENT",
        gatewayRefundId: `CF_REF_LOAD_${i}`,
        status: "INITIATED",
        estimatedCreditDays: "5–7 business days",
        initiatedAt: new Date(),
      });
    }

    const findSpy = vi.spyOn(dbRouter, "find");
    const getSpy = vi.spyOn(dbRouter, "get");

    const preAgg = await preAggregators.pendingRefunds();
    expect(preAgg.count).toBe(batchCount);

    // Batched $in queries: refunds + enrollments + payments + orders + students + users = constant 6 reads, 0 N+1 gets!
    expect(findSpy.mock.calls.length).toBe(6);
    expect(getSpy.mock.calls.length).toBe(0);

    console.info("[OPTIMIZED 25-REFUND PRE-AGG DB LOAD]", {
      refundCount: batchCount,
      findCalls: findSpy.mock.calls.length,
      getCalls: getSpy.mock.calls.length,
      previousNPlus1Reads: 1 + 3 * batchCount,
    });
  });

  it("5. Blocks enrollment_deliveries and refund_deliveries when payment/enrollment is unregistered or Cashfree throws", async () => {
    // A. Gateway failure leaves an audit record but releases the seat.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Cashfree Gateway Error", { status: 502 }))
    );

    const beforeEnrollments = (await dbRouter.find("enrollments", undefined, undefined, "commerce")).length;
    const beforeOrders = (await dbRouter.find("orders", undefined, undefined, "commerce")).length;

    const failedOrderReq = new Request("http://localhost:3000/api/cashfree/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        termsAccepted: true,
        studentName: "Throw Guard Student",
        parentName: "Throw Guard Parent",
        parentEmail: "throw.guard@example.com",
        parentPhone: "9833445566",
        schoolUid: "PARTNER SCHOOL",
        grade: 6,
        paymentPlan: "FULL",
        courseId: "ai-study-helper",
        amountInRupees: 4499,
      }),
    });
    await authenticateParent(failedOrderReq, "usr_throw_guard");
    const failedOrderRes = await createOrderHandler(failedOrderReq);
    expect(failedOrderRes.status).toBe(500);

    expect((await dbRouter.find("enrollments", undefined, undefined, "commerce")).length).toBe(beforeEnrollments + 1);
    expect(await dbRouter.find("enrollments", { status: "DROPPED" }, undefined, "commerce")).toHaveLength(1);
    expect((await dbRouter.find("orders", undefined, undefined, "commerce")).length).toBe(beforeOrders + 1);
    expect(await dbRouter.find("orders", { status: "FAILED" }, undefined, "commerce")).toHaveLength(1);

    // B. Unregistered (PENDING_PAYMENT) / REFUNDED enrollment & missing payment -> 0 enrollment_deliveries written
    // Mark seeded ord_paid_202 as already sent so we isolate only our invalid records
    await dbManager.commerce.markAlertSent("ENROLMENT", "ord_paid_202");

    await dbManager.commerce.upsertEnrollment({
      id: "enr_unpaid_guard",
      studentId: "stu_01",
      cohortBatchId: "batch_dps_01",
      schoolUid: "DPS-PUN-01",
      paymentPlan: "FULL",
      status: "PENDING_PAYMENT",
      currentLevel: 1,
      enrolledAt: new Date(),
    });
    await dbManager.commerce.upsertOrder({
      id: "ord_unpaid_guard",
      enrollmentId: "enr_unpaid_guard",
      userId: "usr_parent_01",
      orderType: "FULL_PAYMENT",
      amountInPaise: 449900,
      status: "PAID", // Even if order is marked PAID without registration/payment
      checkoutUrl: "https://sandbox.example.test/checkout",
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    });

    // Refunded enrollment whose order is still PAID
    await dbManager.commerce.upsertEnrollment({
      id: "enr_already_refunded",
      studentId: "stu_01",
      cohortBatchId: "batch_dps_01",
      schoolUid: "DPS-PUN-01",
      paymentPlan: "FULL",
      status: "REFUNDED",
      currentLevel: 1,
      enrolledAt: new Date(),
    });
    await dbManager.commerce.upsertOrder({
      id: "ord_already_refunded",
      enrollmentId: "enr_already_refunded",
      userId: "usr_parent_01",
      orderType: "FULL_PAYMENT",
      amountInPaise: 449900,
      status: "PAID",
      checkoutUrl: "https://sandbox.example.test/checkout",
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    });
    await dbManager.commerce.upsertPayment({
      id: "pay_already_refunded",
      orderId: "ord_already_refunded",
      gateway: "CASHFREE",
      gatewayOrderId: "ord_already_refunded",
      gatewayPaymentId: "cf_already_refunded",
      paymentMethod: "UPI",
      amountInPaise: 449900,
      status: "REFUNDED",
      paidAt: new Date(),
    });

    // C. Uninitiated refund (no gatewayRefundId) & refund on PENDING_PAYMENT enrollment -> 0 refund_deliveries written
    await dbManager.commerce.upsertRefund({
      id: "ref_no_gateway",
      paymentId: "pay_paid_202",
      enrollmentId: "enr_01",
      amountInPaise: 499900,
      reason: "DEMO_DAY_GUARANTEE",
      initiatedBy: "CLIENT",
      status: "INITIATED", // Missing gatewayRefundId!
      estimatedCreditDays: "5–7 business days",
      initiatedAt: new Date(),
    });
    await dbManager.commerce.upsertRefund({
      id: "ref_unpaid_enr",
      paymentId: "pay_missing",
      enrollmentId: "enr_unpaid_guard",
      amountInPaise: 449900,
      reason: "DEMO_DAY_GUARANTEE",
      initiatedBy: "CLIENT",
      gatewayRefundId: "CF_FAKE_REF",
      status: "INITIATED",
      estimatedCreditDays: "5–7 business days",
      initiatedAt: new Date(),
    });

    const engine = new CronEngine();
    engine.registerJob(enrollmentSuccessJob);
    engine.registerJob(refundStatusJob);

    const enrLog = await engine.runJobNow("job.enrollment_success_dispatch");
    const refLog = await engine.runJobNow("job.refund_status_notification");

    expect(enrLog.recordsProcessed).toBe(0);
    expect(refLog.recordsProcessed).toBe(0);
    expect(await dbRouter.find("enrollment_deliveries", undefined, undefined, "commerce")).toHaveLength(0);
    expect(await dbRouter.find("refund_deliveries", undefined, undefined, "commerce")).toHaveLength(0);
  });
});
