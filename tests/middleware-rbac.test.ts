import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { createSessionToken } from "../src/lib/auth-session";
import { verifySessionTokenEdge, SESSION_COOKIE_NAME } from "../src/lib/auth-edge";

describe("Next.js Edge Proxy & Role-Based Access Control (RBAC)", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "thinkova_secure_parent_session_secret_key_2026";
  });

  it("1. Edge Web Crypto helper correctly validates and decodes valid session tokens", async () => {
    const token = await createSessionToken({
      userId: "usr_parent_edge_1",
      email: "parent@thinkova.ai",
      username: "parent1",
      fullName: "Priya Sharma",
      role: "PARENT",
    });

    const session = await verifySessionTokenEdge(token);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe("usr_parent_edge_1");
    expect(session?.role).toBe("PARENT");
    expect(session?.email).toBe("parent@thinkova.ai");
  });

  it("2. Edge Web Crypto helper rejects tampered tokens", async () => {
    const token = await createSessionToken({
      userId: "usr_parent_edge_1",
      email: "parent@thinkova.ai",
      username: "parent1",
      fullName: "Priya Sharma",
      role: "PARENT",
    });

    // Tamper with the token payload
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}xyz.${parts[2]}`;
    const result = await verifySessionTokenEdge(tampered);
    expect(result).toBeNull();
  });

  it("3. Unauthenticated request to /tutor redirects to /login with tutor role flag", async () => {
    const req = new NextRequest("https://www.thinkova.ai/tutor");
    const res = await proxy(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("role=tutor");
    expect(location).toContain("redirect=%2Ftutor");
  });

  it("4. Unauthenticated request to /api/tutor/* returns HTTP 401 Unauthorized JSON", async () => {
    const req = new NextRequest("https://www.thinkova.ai/api/tutor/batches");
    const res = await proxy(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Authentication required");
  });

  it("5. Authenticated PARENT accessing /tutor is redirected away to /who-is-learning", async () => {
    const parentToken = await createSessionToken({
      userId: "usr_parent_403",
      email: "parent@gmail.com",
      username: "parent403",
      fullName: "Sanjay Patel",
      role: "PARENT",
    });

    const req = new NextRequest("https://www.thinkova.ai/tutor", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${parentToken}`,
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/who-is-learning");
    expect(location).toContain("error=tutor_access_required");
  });

  it("6. Authenticated PARENT accessing /api/tutor/batches receives HTTP 403 Forbidden JSON", async () => {
    const parentToken = await createSessionToken({
      userId: "usr_parent_403",
      email: "parent@gmail.com",
      username: "parent403",
      fullName: "Sanjay Patel",
      role: "PARENT",
    });

    const req = new NextRequest("https://www.thinkova.ai/api/tutor/batches", {
      headers: {
        authorization: `Bearer ${parentToken}`,
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");
    expect(body.error).toContain("Tutor or Administrator");
  });

  it("7. Authenticated TUTOR accessing /tutor is allowed and receives injected context headers", async () => {
    const tutorToken = await createSessionToken({
      userId: "tutor_lead_01",
      email: "rohit.tutor@thinkova.ai",
      username: "rohit_tutor",
      fullName: "Er. Rohit Kulkarni",
      role: "TUTOR",
    });

    const req = new NextRequest("https://www.thinkova.ai/tutor", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${tutorToken}`,
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(200);
    // Verified user headers injected for downstream renderers
    expect(res.headers.get("x-user-id")).toBe("tutor_lead_01");
    expect(res.headers.get("x-user-role")).toBe("TUTOR");
    expect(res.headers.get("x-user-email")).toBe("rohit.tutor@thinkova.ai");
  });

  it("8. Authenticated SUPER_ADMIN accessing /api/tutor/batches is allowed through", async () => {
    const adminToken = await createSessionToken({
      userId: "admin_01",
      email: "admin@thinkova.ai",
      username: "superadmin",
      fullName: "ThinkOva Admin",
      role: "SUPER_ADMIN",
    });

    const req = new NextRequest("https://www.thinkova.ai/api/tutor/batches", {
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-user-role")).toBe("SUPER_ADMIN");
  });

  it("9. Unauthenticated request to /learning/std_anvith_01 redirects to /login with return URL", async () => {
    const req = new NextRequest("https://www.thinkova.ai/learning/std_anvith_01?view=lesson");
    const res = await proxy(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("redirect=%2Flearning%2Fstd_anvith_01%3Fview%3Dlesson");
  });

  it("10. Authenticated PARENT accessing /learning/std_anvith_01 is allowed through", async () => {
    const parentToken = await createSessionToken({
      userId: "usr_parent_anvith",
      email: "gunvanth@thinkova.ai",
      username: "gunvanth",
      fullName: "Gunvanth Madabattula",
      role: "PARENT",
    });

    const req = new NextRequest("https://www.thinkova.ai/learning/std_anvith_01", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${parentToken}`,
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-user-id")).toBe("usr_parent_anvith");
    expect(res.headers.get("x-user-role")).toBe("PARENT");
  });
});
