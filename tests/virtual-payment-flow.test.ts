import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createOrderHandler } from "../src/app/api/cashfree/order/route";
import { POST as webhookHandler } from "../src/app/api/cashfree/webhook/route";
import { dbManager } from "../backend/database/client";
import { defaultDispatcher } from "../backend/notifications/dispatcher";
import { CronEngine } from "../backend/cron/engine";
import { abandonedCartJob } from "../backend/jobs";
import { seedDynamicTestData } from "./fixtures";
import crypto from "crypto";

const nativeFetch = globalThis.fetch;

describe("Cashfree Live Payment & Automated Email Pipeline", () => {
  const originalEnv = { ...process.env };
  const testSecret = "cf_sec_key_abcdef123456";

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.CASHFREE_APP_ID = "CF_APP_TEST_123456";
    process.env.CASHFREE_SECRET_KEY = testSecret;
    process.env.CASHFREE_ENV = "SANDBOX";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFetch = vi.fn().mockImplementation(async (url: any, opts?: any) => {
      const urlStr = typeof url === "string" ? url : (typeof url?.url === "string" ? url.url : (url?.toString ? url.toString() : ""));
      if (urlStr.includes("cashfree") || urlStr.includes("/orders")) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let body: any = {};
        try {
          if (opts?.body) body = JSON.parse(opts.body);
        } catch {
          // empty
        }
        return new Response(
          JSON.stringify({
            order_id: body.order_id || "ord_test_cf",
            cf_order_id: 1234567,
            order_status: "ACTIVE",
            order_amount: body.order_amount || 4499.0,
            order_currency: "INR",
            payment_session_id: "session_live_test_session",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      return nativeFetch(url, opts);
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

  it("1. Creates a real Cashfree gateway order and stores user, student, and order in dynamic database", async () => {
    const orderPayload = {
      studentName: "Aarav Sharma",
      parentName: "Priya Sharma",
      parentEmail: "priya.sharma@example.com",
      parentPhone: "9820143210",
      schoolUid: "10245",
      grade: 6,
      paymentPlan: "FULL",
      amountInRupees: 4499,
    };

    const req = new Request("http://localhost:3000/api/cashfree/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });

    const res = await createOrderHandler(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("success");
    expect(data.orderId).toBeDefined();
    expect(data.amount).toBe(4499);
    expect(data.paymentSessionId).toBe("session_live_test_session");

    // Check DB state before payment
    const order = await dbManager.commerce.getOrderById(data.orderId);
    expect(order).toBeDefined();
    expect(order?.status).toBe("AWAITING_PAYMENT");
    expect(order?.amountInPaise).toBe(449900);

    const enrollment = await dbManager.commerce.getEnrollmentById(order!.enrollmentId);
    expect(enrollment).toBeDefined();
    expect(enrollment?.status).toBe("PENDING_PAYMENT");

    const user = await dbManager.commerce.getUserById(order!.userId);
    expect(user?.email).toBe("priya.sharma@example.com");
    expect(user?.phone).toBe("9820143210");
  });

  it("2. Completes real payment via Cashfree webhook and automatically generates Enrolment Success email & WhatsApp", async () => {
    // A. Create the order
    const orderReq = new Request("http://localhost:3000/api/cashfree/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: "Rohan Verma",
        parentName: "Suresh Verma",
        parentEmail: "suresh.verma@example.com",
        parentPhone: "9876543211",
        schoolUid: "DPS-PUN-01",
        grade: 7,
        paymentPlan: "FULL",
        amountInRupees: 4499,
      }),
    });

    const orderRes = await createOrderHandler(orderReq);
    expect(orderRes.status).toBe(200);
    const orderData = await orderRes.json();
    const orderId = orderData.orderId;

    // B. Real Cashfree Webhook callback: PAYMENT_SUCCESS_WEBHOOK with valid HMAC
    const webhookPayload = {
      type: "PAYMENT_SUCCESS_WEBHOOK",
      data: {
        order: {
          order_id: orderId,
          order_amount: 4499,
          order_currency: "INR",
          cf_order_id: `cf_order_${Date.now()}`,
        },
        payment: {
          cf_payment_id: `cf_pay_${Date.now()}`,
          payment_status: "SUCCESS",
          payment_amount: 4499,
          payment_time: new Date().toISOString(),
          payment_method: { upi: { channel: "gpay", upi_id: "suresh@okhdfc" } },
        },
      },
    };

    const rawBody = JSON.stringify(webhookPayload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac("sha256", testSecret)
      .update(`${timestamp}${rawBody}`)
      .digest("base64");

    const webhookReq = new Request("http://localhost:3000/api/cashfree/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-timestamp": timestamp,
        "x-webhook-signature": signature,
      },
      body: rawBody,
    });

    const webhookRes = await webhookHandler(webhookReq);
    expect(webhookRes.status).toBe(200);

    const webhookData = await webhookRes.json();
    expect(webhookData.status).toBe("success");
    expect(webhookData.event).toBe("PAYMENT_CONFIRMED");

    // C. Verify Database status after payment
    const updatedOrder = await dbManager.commerce.getOrderById(orderId);
    expect(updatedOrder?.status).toBe("PAID");

    const updatedEnrollment = await dbManager.commerce.getEnrollmentById(updatedOrder!.enrollmentId);
    expect(updatedEnrollment?.status).toBe("ENROLLED");

    // D. Verify Automated Email Generation
    const emails = defaultDispatcher.getEmailOutbox("suresh.verma@example.com");
    expect(emails.length).toBe(1);

    const email = emails[0]!;
    expect(email.to).toBe("suresh.verma@example.com");
    expect(email.status).toBe("SENT");
    expect(email.subject).toContain("Enrolment Confirmed");
    expect(email.subject).toContain("Rohan Verma");

    // Verify rich contents inside the generated email
    expect(email.html).toContain("Suresh Verma");
    expect(email.html).toContain("Rohan Verma");
    expect(email.html).toContain("Grade 7");
    expect(email.html).toContain("₹4,499");
    expect(email.html).toContain(orderId);

    // E. Verify Automated WhatsApp message generation
    const whatsapps = defaultDispatcher.getWhatsAppOutbox("9876543211");
    expect(whatsapps.length).toBe(1);
    expect(whatsapps[0]!.fallbackText).toContain("Rohan Verma");
    expect(whatsapps[0]!.fallbackText).toContain("Delhi Public School, Pune");
  });

  it("3. Handles Cashfree payment failure webhook and automatically generates Payment Failure email alert", async () => {
    // A. Create the order
    const orderReq = new Request("http://localhost:3000/api/cashfree/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: "Ananya Iyer",
        parentName: "Karthik Iyer",
        parentEmail: "karthik.iyer@example.com",
        parentPhone: "9820011223",
        schoolUid: "10245",
        grade: 5,
        paymentPlan: "FULL",
        amountInRupees: 4499,
      }),
    });

    const orderRes = await createOrderHandler(orderReq);
    expect(orderRes.status).toBe(200);
    const orderData = await orderRes.json();
    const orderId = orderData.orderId;

    // B. Cashfree Webhook callback: PAYMENT_FAILED_WEBHOOK with valid HMAC
    const failPayload = {
      type: "PAYMENT_FAILED_WEBHOOK",
      data: {
        order: {
          order_id: orderId,
          order_amount: 4499,
        },
        payment: {
          cf_payment_id: `cf_fail_${Date.now()}`,
          payment_status: "FAILED",
          payment_message: "Bank server declined transaction: Insufficient funds or UPI limit exceeded",
        },
      },
    };

    const rawBody = JSON.stringify(failPayload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac("sha256", testSecret)
      .update(`${timestamp}${rawBody}`)
      .digest("base64");

    const webhookReq = new Request("http://localhost:3000/api/cashfree/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-timestamp": timestamp,
        "x-webhook-signature": signature,
      },
      body: rawBody,
    });

    const webhookRes = await webhookHandler(webhookReq);
    expect(webhookRes.status).toBe(200);

    const failData = await webhookRes.json();
    expect(failData.event).toBe("PAYMENT_FAILED");

    // Verify DB updated to FAILED
    const order = await dbManager.commerce.getOrderById(orderId);
    expect(order?.status).toBe("FAILED");
    expect(order?.failureReason).toContain("declined");

    // Verify Automated Payment Failure email alert generated
    const emails = defaultDispatcher.getEmailOutbox("karthik.iyer@example.com");
    expect(emails.length).toBe(1);

    const email = emails[0]!;
    expect(email.subject).toContain("Action Required");
    expect(email.subject).toContain("unsuccessful");
    expect(email.html).toContain("Karthik Iyer");
    expect(email.html).toContain("Ananya Iyer");
    expect(email.html).toContain("Insufficient funds or UPI limit exceeded");
    expect(email.html).toContain(order!.checkoutUrl);
  });

  it("4. Automatically generates Abandoned Cart Recovery email when order is awaiting payment for > 1 hour", async () => {
    const abandonedOrderId = "ord_abandoned_virtual_90m";
    const userId = "usr_parent_abandoned";
    const studentId = "stu_abandoned";
    const enrollmentId = "enr_abandoned";

    await dbManager.commerce.upsertUser({
      id: userId,
      phone: "+919988776655",
      email: "abandoned.parent@example.com",
      username: "Meera Patel",
      role: "PARENT",
      isPhoneVerified: true,
      isEmailVerified: true,
      consentTimestamp: new Date(),
      createdAt: new Date(),
    });

    await dbManager.commerce.upsertStudent({
      id: studentId,
      parentUserId: userId,
      fullName: "Kabir Patel",
      schoolUid: "DPS-PUN-01",
      currentGrade: 6,
      createdAt: new Date(),
    });

    await dbManager.commerce.upsertEnrollment({
      id: enrollmentId,
      studentId,
      cohortBatchId: "batch_dps_01",
      schoolUid: "DPS-PUN-01",
      paymentPlan: "FULL",
      status: "PENDING_PAYMENT",
      currentLevel: 1,
      enrolledAt: new Date(Date.now() - 90 * 60 * 1000),
      installment2Paid: false,
    });

    await dbManager.commerce.upsertOrder({
      id: abandonedOrderId,
      enrollmentId,
      userId,
      orderType: "FULL_PAYMENT",
      amountInPaise: 449900,
      status: "AWAITING_PAYMENT",
      checkoutUrl: `https://thinkova.ai/enrol/checkout?orderId=${abandonedOrderId}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      createdAt: new Date(Date.now() - 90 * 60 * 1000), // 90 mins ago (> 1 hour)
    });

    // Run the Cron recovery job
    const engine = new CronEngine();
    engine.registerJob(abandonedCartJob);
    await engine.runJobNow("job.abandoned_cart_recovery");

    // Verify recovery email generated
    const emails = defaultDispatcher.getEmailOutbox("abandoned.parent@example.com");
    expect(emails.length).toBe(1);

    const email = emails[0]!;
    expect(email.subject).toContain("Complete Kabir Patel's ThinkOva registration");
    expect(email.html).toContain("Meera Patel");
    expect(email.html).toContain("Kabir Patel");
    expect(email.html).toContain("Delhi Public School, Pune");
    expect(email.html).toContain(abandonedOrderId);
    expect(email.html).toContain("Resume & Complete Enrolment");
  });

  it("5. Rejects order creation with 503 error when Cashfree credentials are missing on server", async () => {
    delete process.env.CASHFREE_APP_ID;
    delete process.env.CASHFREE_SECRET_KEY;

    const req = new Request("http://localhost:3000/api/cashfree/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: "Unconfigured Test",
        parentName: "Test Parent",
        parentEmail: "test@example.com",
        parentPhone: "9820143210",
        schoolUid: "10245",
      }),
    });

    const res = await createOrderHandler(req);
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.status).toBe("error");
    expect(data.message).toContain("Cashfree payment gateway is not configured");
  });
});
