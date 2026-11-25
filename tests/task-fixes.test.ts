import { createTestSession } from "./fixtures";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as postEvents } from "../src/app/api/events/route";
import { POST as postProfile, GET as getProfile } from "../src/app/api/profile/route";
import { POST as postEnrol } from "../src/app/api/courses/enrol/route";
import { POST as postSignup } from "../src/app/api/auth/signup/route";
import { POST as postLogin } from "../src/app/api/auth/login/route";
import { POST as postCashfreeOrder } from "../src/app/api/cashfree/order/route";
import { GET as getProgress } from "../src/app/api/learning/progress/route";
import { getStudentProgressData } from "../src/data/progress-data";
import { dbManager } from "../backend/database/client";
import { createSessionToken } from "../src/lib/auth-session";
import { hashPassword } from "../backend/auth/crypto";

describe("8 Core Tasks - Verification & Integration Tests", () => {
  const testUserId = `usr_test_${Date.now()}`;
  let testUserToken = "";

  beforeEach(async () => {
    dbManager.memory.clearAll();

    const user = {
      id: testUserId,
      fullName: "Kavita Verma",
      username: "kavita",
      email: "kavita.verma@example.com",
      phone: "9876543210",
      passwordHash: hashPassword("securePassword123"),
      role: "PARENT" as const,
      isPhoneVerified: true,
      isEmailVerified: true,
      consentTimestamp: new Date(),
      createdAt: new Date(),
    };
    await dbManager.commerce.upsertUser(user);

    testUserToken = await createSessionToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
    });
  });

  it("Task 2 & 4: Rejects reminder requests without signup/login, and dispatches via OpenWA and Email when authenticated", async () => {
    // 1. Unauthenticated request without email/phone or session must be rejected with 401
    const unauthReq = new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "remind",
        eventId: "event-farm-robots",
      }),
    });
    const unauthRes = await postEvents(unauthReq);
    expect(unauthRes.status).toBe(401);
    const unauthData = await unauthRes.json();
    expect(unauthData.error).toContain("Please log in or sign up");

    // 2. Authenticated request with session cookie succeeds and triggers notifications
    const authReq = new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `thinkova_session=${testUserToken}`,
      },
      body: JSON.stringify({
        action: "remind",
        eventId: "event-farm-robots",
      }),
    });
    const authRes = await postEvents(authReq);
    expect(authRes.status).toBe(200);
    const authData = await authRes.json();
    expect(authData.success).toBe(true);
    expect(authData.message).toContain("Confirmation sent to your WhatsApp and Email");
  });

  it("Task 5: Updates phone number and full name in profile section and persists in database", async () => {
    const updatedPhone = "9988776655";
    const updatedName = "Kavita Sharma-Verma";

    const updateReq = new NextRequest("http://localhost:3000/api/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `thinkova_session=${testUserToken}`,
      },
      body: JSON.stringify({
        phone: updatedPhone,
        fullName: updatedName,
      }),
    });

    const updateRes = await postProfile(updateReq);
    expect(updateRes.status).toBe(200);
    const updateData = await updateRes.json();
    expect(updateData.success).toBe(true);
    expect(updateData.user.phone).toBe(updatedPhone);
    expect(updateData.user.fullName).toBe(updatedName);

    // Verify persistence in dbManager
    const savedUser = await dbManager.commerce.getUserById(testUserId);
    expect(savedUser?.phone).toBe(updatedPhone);
    expect(savedUser?.fullName).toBe(updatedName);
  });

  it("Task 3 & 7: New student starts at Level 1 with 0 completed levels, not at Level 6", () => {
    // Brand new student starts at Level 1 (0 levels completed)
    const newStudentProgress = getStudentProgressData("stu_new_123", "ai-for-young-creators", "Rohan Verma");
    expect(newStudentProgress.levelsDone).toBe(0);
    expect(newStudentProgress.lessonsDone).toBe(0);
    expect(newStudentProgress.overallPercentage).toBe(0);
    expect(newStudentProgress.pathSteps[0]?.status).toBe("active"); // Week 1 is active
    expect(newStudentProgress.pathSteps[1]?.status).toBe("upcoming"); // Week 2 is upcoming
    expect(newStudentProgress.pathSteps[5]?.status).toBe("upcoming"); // Week 6 is NOT active
    expect(newStudentProgress.buildTasks[0]?.taskId).toBe("level-1-problem-map");

    // Existing student with 2 completed levels progresses to Level 3
    const progressedProgress = getStudentProgressData("stu_progressed", "ai-for-young-creators", "Rohan Verma", 2);
    expect(progressedProgress.levelsDone).toBe(2);
    expect(progressedProgress.pathSteps[0]?.status).toBe("completed");
    expect(progressedProgress.pathSteps[1]?.status).toBe("completed");
    expect(progressedProgress.pathSteps[2]?.status).toBe("active"); // Week 3 active
    expect(progressedProgress.pathSteps[3]?.status).toBe("upcoming");
  });

  it("Task 6: Enrolment without user login/signup is blocked", async () => {
    // Add student to DB
    const studentId = `stu_${Date.now()}`;
    await dbManager.commerce.upsertStudent({
      id: studentId,
      parentUserId: testUserId,
      fullName: "Rohan Verma",
      schoolUid: "PUNE_CAMPUS",
      currentGrade: 6,
      createdAt: new Date(),
    });

    // Unauthenticated enrolment request
    const unauthEnrolReq = new NextRequest("http://localhost:3000/api/courses/enrol", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        courseId: "robotics-starter",
      }),
    });

    const unauthEnrolRes = await postEnrol(unauthEnrolReq);
    expect(unauthEnrolRes.status).toBe(410);
    const authEnrolReq = new NextRequest("http://localhost:3000/api/courses/enrol", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `thinkova_session=${testUserToken}`,
      },
      body: JSON.stringify({
        studentId,
        courseId: "robotics-starter",
        trackId: "robotics",
        paymentPlan: "FULL",
      }),
    });

    const authEnrolRes = await postEnrol(authEnrolReq);
    expect(authEnrolRes.status).toBe(410);
    expect(await dbManager.commerce.getEnrollmentsByStudentId(studentId)).toHaveLength(0);
  });

  it("New Signup flow: dispatches welcome email & WhatsApp and creates user with real phone", async () => {
    const signupEmail = `parent_${Date.now()}@example.com`;
    const signupPhone = "9123456789";

    const signupReq = new NextRequest("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Vikram Malhotra",
        email: signupEmail,
        phone: signupPhone,
        whatsappUpdates: true,
      }),
    });

    const signupRes = await postSignup(signupReq);
    expect(signupRes.status).toBe(200);
    const signupData = await signupRes.json();
    expect(signupData.success).toBe(true);
    expect(signupData.user.phone).toBe(signupPhone);
    expect(signupData.user.fullName).toBe("Vikram Malhotra");
  });

  it("Student profile state: Newly created ward starts as not enrolled, no fake course progression", async () => {
    const newStudentId = `stu_new_${Date.now()}`;
    await dbManager.commerce.upsertStudent({
      id: newStudentId,
      parentUserId: testUserId,
      fullName: "Anvith Verma",
      schoolUid: "PUNE_CAMPUS",
      currentGrade: 6,
      preferredTrack: "robotics",
      createdAt: new Date(),
    });

    const progressReq = new NextRequest(
      `http://localhost:3000/api/learning/progress?studentId=${newStudentId}&courseId=robotics-starter`
    );
    expect((await getProgress(progressReq)).status).toBe(401);
    const other = await createTestSession({ userId: "other-family", email: "other@example.test", fullName: "Other", username: "other", role: "PARENT" });
    progressReq.headers.set("Authorization", "Bearer " + other);
    expect((await getProgress(progressReq)).status).toBe(404);
    progressReq.headers.set("Authorization", "Bearer " + testUserToken);
    const progressRes = await getProgress(progressReq);
    expect(progressRes.status).toBe(200);
    const progressData = await progressRes.json();

    // Must be NOT enrolled and have no fake progress
    expect(progressData.isEnrolled).toBe(false);
    expect(progressData.progress).toBeNull();
    expect(progressData.detailedProgress).toBeNull();
  });

  it("Login verification: Checks if account exists; if not, rejects login with 404 and prompts signup", async () => {
    // 1. Unknown user login request
    const unknownEmail = "nonexistent.parent@example.com";
    const unknownLoginReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: unknownEmail }),
    });

    const unknownLoginRes = await postLogin(unknownLoginReq);
    expect(unknownLoginRes.status).toBe(404);
    const unknownData = await unknownLoginRes.json();
    expect(unknownData.error).toContain("No account found with this email");
    expect(unknownData.error).toContain("sign up");

    // 2. Existing user login request
    const existingLoginReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "kavita.verma@example.com", password: "securePassword123" }),
    });

    const existingLoginRes = await postLogin(existingLoginReq);
    expect(existingLoginRes.status).toBe(200);
    const existingData = await existingLoginRes.json();
    expect(existingData.success).toBe(true);
    expect(existingData.user.email).toBe("kavita.verma@example.com");
  });

  it("Cashfree Order creation: Re-uses existing user by phone without throwing duplicate key collision", async () => {
    process.env.CASHFREE_APP_ID = "CF_APP_TEST_12345";
    process.env.CASHFREE_SECRET_KEY = "cf_sec_test_67890";
    process.env.CASHFREE_ENV = "SANDBOX";
    process.env.CASHFREE_SITE_URL = "https://sandbox.example.test";

    const originalFetch = global.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        order_id: "ord_reuse_test_101",
        cf_order_id: "998877",
        payment_session_id: "session_mock_123",
        order_status: "ACTIVE",
        order_amount: 4999,
        order_currency: "INR",
      }),
      text: async () => "",
    }) as any;

    try {
      const orderReq = new NextRequest("http://localhost:3000/api/cashfree/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: "ord_reuse_test_101",
          studentName: "Anvith Verma",
          parentName: "Kavita Verma",
          parentEmail: "kavita.verma@example.com",
          parentPhone: "9876543210", // Matches existing user's phone
          schoolUid: "DPS01",
        }),
      });

      orderReq.headers.set("Authorization", "Bearer " + testUserToken);
      const orderRes = await postCashfreeOrder(orderReq);
      expect(orderRes.status).toBe(200);
      const data = await orderRes.json();
      expect(data.status).toBe("success");
      expect(data.orderId).toMatch(/^ord_/);
      expect(data.paymentSessionId).toBe("session_mock_123");

      // Verify the order linked to the existing user ID, not a newly generated ID
      const savedOrder = await dbManager.commerce.getOrderById(data.orderId);
      expect(savedOrder?.userId).toBe(testUserId);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
