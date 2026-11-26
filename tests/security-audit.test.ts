import { createTestSession } from "./fixtures";
import { authenticateParent } from "./fixtures";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { POST as postMailSend } from "../src/app/api/mail/send/route";
import { POST as postSmtpSend } from "../src/app/api/smtp/send/route";
import { POST as postLogin } from "../src/app/api/auth/login/route";
import { POST as postCashfreeOrder } from "../src/app/api/cashfree/order/route";
import { POST as postCashfreeWebhook } from "../src/app/api/cashfree/webhook/route";
import {
  GET as getNotificationStatus,
  POST as postNotificationStatus,
} from "../src/app/api/notifications/status/route";
import { GET as getCron, POST as postCron } from "../src/app/api/cron/route";
import { dbManager } from "../backend/database/client";
import { hashPassword } from "../backend/auth/crypto";
import {
  getSessionSecret,
  createSessionToken,
  verifySessionToken,
} from "../src/lib/auth-session";
import {
  getSessionSecretEdge,
  verifySessionTokenEdge,
} from "../src/lib/auth-edge";

describe("[SEC-01] Open Email Relay Prevention Guard", () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalInternalKey = process.env.INTERNAL_API_KEY;

  beforeEach(() => {
    process.env.CRON_SECRET = "test_cron_secret_high_entropy_2026";
    process.env.INTERNAL_API_KEY = "test_internal_api_key_2026_xyz";
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret;
    process.env.INTERNAL_API_KEY = originalInternalKey;
  });

  it("1. Rejects unauthenticated live email dispatch with 401 and ERR_UNAUTHORIZED_MAIL_RELAY", async () => {
    const req = new Request("http://localhost:3000/api/mail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "victim@example.com",
        subject: "Spam Phishing Attempt",
        html: "<p>Malicious Link</p>",
      }),
    });

    const res = await postMailSend(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.code).toBe("ERR_UNAUTHORIZED_MAIL_RELAY");
    expect(data.error).toContain("Outbound email dispatch requires a valid admin/tutor session or internal API secret");
  });

  it("2. /api/smtp/send alias also enforces the SEC-01 open relay guard", async () => {
    const req = new Request("http://localhost:3000/api/smtp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "victim@example.com",
        subject: "Spam Phishing Attempt",
        html: "<p>Malicious Link</p>",
      }),
    });

    const res = await postSmtpSend(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.code).toBe("ERR_UNAUTHORIZED_MAIL_RELAY");
  });

  it("3. Allows previewOnly requests without credentials to render templates safely", async () => {
    const req = new Request("http://localhost:3000/api/mail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template: "principalOutreach",
        previewOnly: true,
        data: {
          principalName: "Ramesh Kulkarni",
          schoolName: "St. Mary's High School",
          city: "Pune",
          role: "Principal",
        },
      }),
    });

    const res = await postMailSend(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("rendered_success");
    expect(data.subject).toContain("St. Mary's High School");
    expect(data.html).toContain("Dear Principal Kulkarni,");
  });

  it("4. Allows live dispatch when valid CRON_SECRET is supplied in Authorization header", async () => {
    const req = new Request("http://localhost:3000/api/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test_cron_secret_high_entropy_2026",
      },
      body: JSON.stringify({
        to: "parent@example.com",
        subject: "Class Schedule Reminder",
        html: "<p>Your child's class starts tomorrow at 10 AM.</p>",
      }),
    });

    const res = await postMailSend(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(["success", "queued_simulated"]).toContain(data.status);
    expect(data.to).toBe("parent@example.com");
  });

  it("5. Allows live dispatch when valid x-internal-secret header is supplied", async () => {
    const req = new Request("http://localhost:3000/api/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": "test_internal_api_key_2026_xyz",
      },
      body: JSON.stringify({
        to: "parent@example.com",
        subject: "Class Schedule Reminder",
        html: "<p>Your child's class starts tomorrow at 10 AM.</p>",
      }),
    });

    const res = await postMailSend(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(["success", "queued_simulated"]).toContain(data.status);
  });

  it("6. Allows live dispatch when authenticated as SUPER_ADMIN or TUTOR", async () => {
    const adminToken = await createTestSession({
      userId: "usr_admin_test_1",
      email: "admin@thinkova.ai",
      username: "admin1",
      fullName: "Super Admin",
      role: "SUPER_ADMIN",
    });

    const req = new Request("http://localhost:3000/api/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `thinkova_session=${adminToken}`,
      },
      body: JSON.stringify({
        to: "student@example.com",
        subject: "Certificate of Completion",
        html: "<p>Congratulations on completing Level 1!</p>",
      }),
    });

    const res = await postMailSend(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(["success", "queued_simulated"]).toContain(data.status);
  });

  it("7. Rejects live dispatch when authenticated user role is PARENT", async () => {
    const parentToken = await createTestSession({
      userId: "usr_parent_test_1",
      email: "parent@example.com",
      username: "parent1",
      fullName: "Parent User",
      role: "PARENT",
    });

    const req = new Request("http://localhost:3000/api/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `thinkova_session=${parentToken}`,
      },
      body: JSON.stringify({
        to: "other@example.com",
        subject: "Unauthorized outbound relay",
        html: "<p>Spam</p>",
      }),
    });

    const res = await postMailSend(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.code).toBe("ERR_UNAUTHORIZED_MAIL_RELAY");
    expect(data.error).toContain("Forbidden: role 'PARENT' is not authorized");
  });
});

describe("[SEC-02] Session Secret Cryptographic Strength & Production Fallback Enforcement", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAuthSecret = process.env.AUTH_SECRET;

  afterEach(() => {
    (process.env as Record<string, string | undefined>)["NODE_ENV"] = originalNodeEnv;
    process.env.AUTH_SECRET = originalAuthSecret;
  });

  it("1. Throws in production if AUTH_SECRET is not defined", () => {
    (process.env as Record<string, string | undefined>)["NODE_ENV"] = "production";
    delete process.env.AUTH_SECRET;
    delete process.env.SESSION_SECRET;

    expect(() => getSessionSecret()).toThrowError(/missing or shorter than 32 characters in production/);
    expect(() => getSessionSecretEdge()).toThrowError(/missing or shorter than 32 characters in production/);
  });

  it("2. Throws in production if AUTH_SECRET is shorter than 32 characters", () => {
    (process.env as Record<string, string | undefined>)["NODE_ENV"] = "production";
    process.env.AUTH_SECRET = "too_short_secret";

    expect(() => getSessionSecret()).toThrowError(/missing or shorter than 32 characters in production/);
    expect(() => getSessionSecretEdge()).toThrowError(/missing or shorter than 32 characters in production/);
  });

  it("3. Throws in production if AUTH_SECRET uses the historical repository default", () => {
    (process.env as Record<string, string | undefined>)["NODE_ENV"] = "production";
    process.env.AUTH_SECRET = "thinkova_secure_parent_session_secret_key_2026";

    expect(() => getSessionSecret()).toThrowError(/insecure default AUTH_SECRET detected in production/i);
    expect(() => getSessionSecretEdge()).toThrowError(/insecure default AUTH_SECRET detected in production/i);
  });

  it("4. Accepts a cryptographically strong secret in production (>= 32 chars)", () => {
    (process.env as Record<string, string | undefined>)["NODE_ENV"] = "production";
    process.env.AUTH_SECRET = "production_ultra_secure_secret_key_994827510482_thinkova";

    const secret = getSessionSecret();
    expect(secret).toBe("production_ultra_secure_secret_key_994827510482_thinkova");

    const edgeSecret = getSessionSecretEdge();
    expect(edgeSecret).toBe("production_ultra_secure_secret_key_994827510482_thinkova");
  });

  it("5. createSessionToken and verifySessionToken work seamlessly with dynamic strong secret", async () => {
    process.env.AUTH_SECRET = "super_strong_custom_session_secret_key_99999_xyz";

    const token = await createTestSession({
      userId: "usr_dynamic_test",
      email: "secure@thinkova.ai",
      username: "secuser",
      fullName: "Security User",
      role: "TUTOR",
    });

    const decoded = await verifySessionToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe("usr_dynamic_test");
    expect(decoded?.role).toBe("TUTOR");

    const decodedEdge = await verifySessionTokenEdge(token);
    expect(decodedEdge).not.toBeNull();
    expect(decodedEdge?.userId).toBe("usr_dynamic_test");
    expect(decodedEdge?.role).toBe("TUTOR");
  });

  it("6. Tokens fail verification when verified against an incorrect secret", async () => {
    process.env.AUTH_SECRET = "initial_secret_key_must_be_32_characters_long_111";

    const token = await createTestSession({
      userId: "usr_attacker",
      email: "attacker@thinkova.ai",
      username: "attacker",
      fullName: "Attacker User",
      role: "SUPER_ADMIN",
    });

    // Switch secret
    process.env.AUTH_SECRET = "different_secret_key_must_be_32_characters_long_222";

    const decoded = await verifySessionToken(token);
    expect(decoded).toBeNull();

    const decodedEdge = await verifySessionTokenEdge(token);
    expect(decodedEdge).toBeNull();
  });
});

describe("[SEC-03] Passwordless Account Takeover Prevention", () => {
  beforeEach(async () => {
    dbManager.memory.clearAll();

    // 1. Account WITHOUT passwordHash (e.g. imported student roster / lead)
    await dbManager.commerce.upsertUser({
      id: "usr_legacy_no_pw",
      email: "victim@example.com",
      username: "victim",
      phone: "9123456780",
      role: "PARENT",
      isPhoneVerified: true,
      isEmailVerified: true,
      consentTimestamp: new Date(),
      createdAt: new Date(),
    });

    // 2. Account WITH passwordHash
    await dbManager.commerce.upsertUser({
      id: "usr_has_pw",
      email: "secureparent@example.com",
      username: "secureparent",
      phone: "9876543210",
      passwordHash: hashPassword("MyCorrectPassword123"),
      role: "PARENT",
      isPhoneVerified: true,
      isEmailVerified: true,
      consentTimestamp: new Date(),
      createdAt: new Date(),
    });
  });

  it("1. Rejects login attempts on accounts without passwordHash with 403 and PASSWORD_SETUP_REQUIRED", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "victim@example.com",
        password: "AttackerPassword123",
      }),
    });

    const res = await postLogin(req);
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.code).toBe("PASSWORD_SETUP_REQUIRED");
    expect(data.error).toContain("Password setup is required");
  });

  it("2. Rejects empty password on accounts without passwordHash", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "victim@example.com",
      }),
    });

    const res = await postLogin(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("PASSWORD_SETUP_REQUIRED");
  });

  it("3. Enforces correct password verification on accounts with passwordHash", async () => {
    // Incorrect password
    const wrongReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "secureparent@example.com",
        password: "WrongPassword999",
      }),
    });
    const wrongRes = await postLogin(wrongReq);
    expect(wrongRes.status).toBe(401);
    const wrongData = await wrongRes.json();
    expect(wrongData.code).toBe("INVALID_CREDENTIALS");

    // Correct password
    const correctReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "secureparent@example.com",
        password: "MyCorrectPassword123",
      }),
    });
    const correctRes = await postLogin(correctReq);
    expect(correctRes.status).toBe(200);
    const correctData = await correctRes.json();
    expect(correctData.success).toBe(true);
    expect(correctData.user.email).toBe("secureparent@example.com");
  });
});

describe("[SEC-04] Client-Controlled Pricing Tampering in Cashfree Order Creation", () => {
  beforeEach(async () => {
    dbManager.memory.clearAll();
    process.env.CASHFREE_APP_ID = "CF_APP_TEST_123456";
    process.env.CASHFREE_SECRET_KEY = "cf_sec_key_abcdef123456";
    process.env.CASHFREE_ENV = "SANDBOX";
    process.env.CASHFREE_SITE_URL = "https://sandbox.example.test";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("cashfree") || urlStr.includes("/orders")) {
        return new Response(
          JSON.stringify({
            order_id: "ord_cf_sec_test",
            cf_order_id: 99887766,
            payment_session_id: "session_mock_pricing",
            order_status: "ACTIVE",
            order_amount: 4999,
            order_currency: "INR",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return fetch(url);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Rejects tampered order amounts (e.g. ₹1) with 400 and PRICE_TAMPERING_DETECTED", async () => {
    const req = new Request("http://localhost:3000/api/cashfree/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        termsAccepted: true,
        studentName: "Aditya Sharma",
        parentName: "Sanjay Sharma",
        parentEmail: "sanjay@example.com",
        parentPhone: "9876543210",
        schoolUid: "DPS-PUN-01",
        amountInRupees: 1, // Malicious tamper
      }),
    });

    await authenticateParent(req);
    const res = await postCashfreeOrder(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.code).toBe("PRICE_TAMPERING_DETECTED");
    expect(data.error).toContain("Price tampering detected");
  });

  it("2. Rejects arbitrary fractional or unauthorized amounts (e.g. ₹50)", async () => {
    const req = new Request("http://localhost:3000/api/cashfree/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        termsAccepted: true,
        studentName: "Aditya Sharma",
        parentName: "Sanjay Sharma",
        parentEmail: "sanjay@example.com",
        parentPhone: "9876543210",
        schoolUid: "DPS-PUN-01",
        amountInRupees: 50, // Malicious tamper
      }),
    });

    await authenticateParent(req);
    const res = await postCashfreeOrder(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("PRICE_TAMPERING_DETECTED");
  });

  it("3. Accepts authorized course fees (e.g. ₹4,499 promotional or ₹4,999 standard)", async () => {
    const req = new Request("http://localhost:3000/api/cashfree/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        termsAccepted: true,
        studentName: "Aditya Sharma",
        parentName: "Sanjay Sharma",
        parentEmail: "sanjay@example.com",
        parentPhone: "9876543210",
        schoolUid: "DPS-PUN-01",
        courseId: "ai-study-helper",
        amountInRupees: 4499,
      }),
    });

    await authenticateParent(req);
    const res = await postCashfreeOrder(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("success");
    expect(data.orderId).toBeDefined();
  });
});

describe("[SEC-05] Missing Webhook Signature Enforcement when Secret is Unset", () => {
  const originalSecret = process.env.CASHFREE_SECRET_KEY;
  const testSecret = "cf_sec_key_abcdef123456";

  afterEach(() => {
    process.env.CASHFREE_SECRET_KEY = originalSecret;
  });

  it("1. Rejects webhook with 401 and ERR_WEBHOOK_SECRET_UNSET when CASHFREE_SECRET_KEY is unset", async () => {
    delete process.env.CASHFREE_SECRET_KEY;

    const req = new Request("http://localhost:3000/api/cashfree/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-timestamp": Math.floor(Date.now() / 1000).toString(),
        "x-webhook-signature": "some_sig",
      },
      body: JSON.stringify({
        type: "PAYMENT_SUCCESS_WEBHOOK",
        data: { order: { order_id: "ord_unverified" } },
      }),
    });

    const res = await postCashfreeWebhook(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.code).toBe("ERR_WEBHOOK_SECRET_UNSET");
    expect(data.error).toContain("CASHFREE_SECRET_KEY is not configured");
  });

  it("2. Rejects webhook with 401 when signature or timestamp headers are missing", async () => {
    process.env.CASHFREE_SECRET_KEY = testSecret;

    const req = new Request("http://localhost:3000/api/cashfree/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "PAYMENT_SUCCESS_WEBHOOK",
        data: { order: { order_id: "ord_no_sig" } },
      }),
    });

    const res = await postCashfreeWebhook(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe("ERR_MISSING_WEBHOOK_SIGNATURE");
  });

  it("3. Rejects webhook with 401 when signature is invalid/tampered", async () => {
    process.env.CASHFREE_SECRET_KEY = testSecret;

    const req = new Request("http://localhost:3000/api/cashfree/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-timestamp": Math.floor(Date.now() / 1000).toString(),
        "x-webhook-signature": "forged_base64_signature_here",
      },
      body: JSON.stringify({
        type: "PAYMENT_SUCCESS_WEBHOOK",
        data: { order: { order_id: "ord_forged" } },
      }),
    });

    const res = await postCashfreeWebhook(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe("ERR_INVALID_WEBHOOK_SIGNATURE");
  });

  it("4. Allows Cashfree dashboard test ping without updating orders", async () => {
    process.env.CASHFREE_SECRET_KEY = testSecret;

    const req = new Request("http://localhost:3000/api/cashfree/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    });

    const res = await postCashfreeWebhook(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toContain("test ping acknowledged");
  });
});

describe("[SEC-06] Unauthenticated WhatsApp & Email Dispatch Guard (/api/notifications/status)", () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalInternalKey = process.env.INTERNAL_API_KEY;

  beforeEach(() => {
    process.env.CRON_SECRET = "cron_secret_auth_guard_2026_test";
    process.env.INTERNAL_API_KEY = "internal_api_key_gateway_test_2026";
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret;
    process.env.INTERNAL_API_KEY = originalInternalKey;
  });

  it("1. Rejects unauthenticated GET /api/notifications/status with 401 and ERR_UNAUTHORIZED_NOTIFICATION_GATEWAY", async () => {
    const req = new NextRequest("http://localhost:3000/api/notifications/status");
    const res = await getNotificationStatus(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.code).toBe("ERR_UNAUTHORIZED_NOTIFICATION_GATEWAY");
    expect(data.error).toContain("Access to notification gateway diagnostics and manual dispatches requires an administrative session");
  });

  it("2. Rejects unauthenticated GET testPhone dispatch attempt and does not trigger WhatsApp", async () => {
    const req = new NextRequest("http://localhost:3000/api/notifications/status?testPhone=919876543210");
    const res = await getNotificationStatus(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.code).toBe("ERR_UNAUTHORIZED_NOTIFICATION_GATEWAY");
  });

  it("3. Rejects unauthenticated POST /api/notifications/status manual dispatch attempt", async () => {
    const req = new NextRequest("http://localhost:3000/api/notifications/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "919999999999",
        email: "victim@example.com",
        text: "Unsolicited spam",
      }),
    });

    const res = await postNotificationStatus(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.code).toBe("ERR_UNAUTHORIZED_NOTIFICATION_GATEWAY");
  });

  it("4. Rejects PARENT role session with 403 Forbidden", async () => {
    const parentToken = await createTestSession({
      userId: "usr_parent_diag_test",
      email: "parent@example.com",
      username: "parentuser",
      fullName: "Parent User",
      role: "PARENT",
    });

    const req = new NextRequest("http://localhost:3000/api/notifications/status", {
      headers: {
        Cookie: `thinkova_session=${parentToken}`,
      },
    });

    const res = await getNotificationStatus(req);
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.code).toBe("ERR_UNAUTHORIZED_NOTIFICATION_GATEWAY");
    expect(data.error).toContain("Forbidden: role 'PARENT' is not authorized");
  });

  it("5. Allows GET /api/notifications/status when authenticated with internal API key", async () => {
    const req = new NextRequest("http://localhost:3000/api/notifications/status", {
      headers: {
        "x-internal-secret": "internal_api_key_gateway_test_2026",
      },
    });

    const res = await getNotificationStatus(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.channels).toBeDefined();
    expect(data.channels.whatsapp).toBeDefined();
    expect(data.channels.email).toBeDefined();
  });

  it("6. Allows POST /api/notifications/status manual dispatch when authenticated as SUPER_ADMIN", async () => {
    const adminToken = await createTestSession({
      userId: "usr_admin_diag_test",
      email: "admin@thinkova.ai",
      username: "adminuser",
      fullName: "Administrator",
      role: "SUPER_ADMIN",
    });

    const req = new NextRequest("http://localhost:3000/api/notifications/status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `thinkova_session=${adminToken}`,
      },
      body: JSON.stringify({
        phone: "919876543210",
        text: "Authorized Diagnostic WhatsApp Ping",
      }),
    });

    const res = await postNotificationStatus(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.dispatched).toBeDefined();
  });
});

describe("[SEC-07] Cron Execution Fail-Closed Guard (/api/cron)", () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalInternalKey = process.env.INTERNAL_API_KEY;

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret;
    process.env.INTERNAL_API_KEY = originalInternalKey;
  });

  it("1. Fails closed with 503 on GET /api/cron?run=true when CRON_SECRET and INTERNAL_API_KEY are unset", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.INTERNAL_API_KEY;

    const req = new Request("http://localhost:3000/api/cron?run=true");
    const res = await getCron(req);
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.code).toBe("ERR_CRON_SECRET_UNSET");
  });

  it("2. Fails closed with 503 on POST /api/cron when CRON_SECRET and INTERNAL_API_KEY are unset", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.INTERNAL_API_KEY;

    const req = new Request("http://localhost:3000/api/cron", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runAll: true }),
    });
    const res = await postCron(req);
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.code).toBe("ERR_CRON_SECRET_UNSET");
  });

  it("3. Rejects unauthenticated GET /api/cron?run=true and POST /api/cron with 401 when CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = "cron_secret_fail_closed_test_2026";
    delete process.env.INTERNAL_API_KEY;

    const getRes = await getCron(new Request("http://localhost:3000/api/cron?run=true"));
    expect(getRes.status).toBe(401);

    const postRes = await postCron(
      new Request("http://localhost:3000/api/cron", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong_secret",
        },
        body: JSON.stringify({ runAll: true }),
      })
    );
    expect(postRes.status).toBe(401);
  });

  it("4. Still allows unauthenticated GET /api/cron diagnostics without ?run=true", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.INTERNAL_API_KEY;

    const res = await getCron(new Request("http://localhost:3000/api/cron"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
  });
});
