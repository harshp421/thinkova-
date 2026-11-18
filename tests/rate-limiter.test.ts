import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  checkRateLimit,
  getClientIp,
  clearRateLimitStore,
  createRateLimitExceededResponse,
} from "../src/lib/rate-limiter";
import { proxy } from "../src/proxy";

describe("Public Endpoints Rate-Limiter & Bot / Carding Protection", () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  describe("1. Reliable IP Resolution", () => {
    it("Prioritizes Cloudflare CF-Connecting-IP header", () => {
      const headers = new Headers({
        "cf-connecting-ip": "203.0.113.195",
        "x-forwarded-for": "198.51.100.1, 10.0.0.1",
        "x-real-ip": "192.0.2.1",
      });
      expect(getClientIp(headers)).toBe("203.0.113.195");
    });

    it("Extracts the first client IP from X-Forwarded-For if CF header is absent", () => {
      const headers = new Headers({
        "x-forwarded-for": "49.37.150.22, 10.0.0.1",
      });
      expect(getClientIp(headers)).toBe("49.37.150.22");
    });

    it("Falls back to X-Real-IP if X-Forwarded-For is absent", () => {
      const headers = new Headers({
        "x-real-ip": "49.37.150.99",
      });
      expect(getClientIp(headers)).toBe("49.37.150.99");
    });

    it("Falls back to 127.0.0.1 when no forwarding headers exist", () => {
      const headers = new Headers();
      expect(getClientIp(headers)).toBe("127.0.0.1");
    });
  });

  describe("2. Signup Endpoint Protection (/api/auth/signup - Max 5 / min)", () => {
    it("Allows up to 5 signup attempts per minute per IP", () => {
      const headers = new Headers({ "cf-connecting-ip": "103.21.244.1" });

      for (let i = 1; i <= 5; i++) {
        const result = checkRateLimit("/api/auth/signup", headers);
        expect(result).not.toBeNull();
        expect(result?.allowed).toBe(true);
        expect(result?.remaining).toBe(5 - i);
      }
    });

    it("Rejects the 6th signup attempt from the same IP within 1 minute with HTTP 429", () => {
      const headers = new Headers({ "cf-connecting-ip": "103.21.244.2" });

      for (let i = 0; i < 5; i++) {
        checkRateLimit("/api/auth/signup", headers);
      }

      const blockedResult = checkRateLimit("/api/auth/signup", headers);
      expect(blockedResult).not.toBeNull();
      expect(blockedResult?.allowed).toBe(false);
      expect(blockedResult?.remaining).toBe(0);
      expect(blockedResult?.retryAfterSeconds).toBeGreaterThan(0);

      const response = createRateLimitExceededResponse(blockedResult!);
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBeDefined();
      expect(response.headers.get("X-RateLimit-Limit")).toBe("5");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    });

    it("Does not penalize distinct IP addresses", () => {
      const ipA = new Headers({ "cf-connecting-ip": "103.21.244.10" });
      const ipB = new Headers({ "cf-connecting-ip": "103.21.244.20" });

      for (let i = 0; i < 5; i++) {
        checkRateLimit("/api/auth/signup", ipA);
      }

      // ipA should now be blocked
      expect(checkRateLimit("/api/auth/signup", ipA)?.allowed).toBe(false);

      // ipB should still be permitted
      const resultB = checkRateLimit("/api/auth/signup", ipB);
      expect(resultB?.allowed).toBe(true);
      expect(resultB?.remaining).toBe(4);
    });
  });

  describe("3. Login Endpoint Protection (/api/auth/login - Max 10 / min)", () => {
    it("Allows up to 10 login attempts per minute per IP and blocks the 11th", () => {
      const headers = new Headers({ "cf-connecting-ip": "103.21.244.30" });

      for (let i = 0; i < 10; i++) {
        const res = checkRateLimit("/api/auth/login", headers);
        expect(res?.allowed).toBe(true);
      }

      const blocked = checkRateLimit("/api/auth/login", headers);
      expect(blocked?.allowed).toBe(false);
      expect(blocked?.limit).toBe(10);
    });
  });

  describe("4. Cashfree Carding Protection (/api/cashfree/order - Max 10 / min)", () => {
    it("Throttles rapid order creations to prevent card testing attacks", () => {
      const headers = new Headers({ "cf-connecting-ip": "103.21.244.50" });

      for (let i = 0; i < 10; i++) {
        const res = checkRateLimit("/api/cashfree/order", headers);
        expect(res?.allowed).toBe(true);
      }

      const blocked = checkRateLimit("/api/cashfree/order", headers);
      expect(blocked?.allowed).toBe(false);
      expect(blocked?.remaining).toBe(0);
      expect(blocked?.limit).toBe(10);
    });
  });

  describe("5. Edge Middleware End-to-End Interception", () => {
    it("Intercepts rapid /api/auth/signup requests and returns HTTP 429 with Retry-After header", async () => {
      const clientIp = "185.199.108.153";

      // Make 5 permitted requests
      for (let i = 0; i < 5; i++) {
        const req = new NextRequest("https://www.thinkova.ai/api/auth/signup", {
          method: "POST",
          headers: { "cf-connecting-ip": clientIp },
        });
        const res = await proxy(req);
        expect(res.status).toBe(200);
        expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
      }

      // 6th request from the same IP must be intercepted by proxy with 429
      const blockedReq = new NextRequest("https://www.thinkova.ai/api/auth/signup", {
        method: "POST",
        headers: { "cf-connecting-ip": clientIp },
      });
      const blockedRes = await proxy(blockedReq);

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get("Retry-After")).toBeDefined();
      expect(blockedRes.headers.get("X-RateLimit-Remaining")).toBe("0");

      const body = await blockedRes.json();
      expect(body.error).toContain("Too many requests");
      expect(body.retryAfter).toBeGreaterThan(0);
    });

    it("Intercepts rapid /api/cashfree/order requests and blocks carding floods at the edge", async () => {
      const cardingBotIp = "194.26.29.111";

      for (let i = 0; i < 10; i++) {
        const req = new NextRequest("https://www.thinkova.ai/api/cashfree/order", {
          method: "POST",
          headers: { "cf-connecting-ip": cardingBotIp },
        });
        const res = await proxy(req);
        expect(res.status).toBe(200);
      }

      const blockedReq = new NextRequest("https://www.thinkova.ai/api/cashfree/order", {
        method: "POST",
        headers: { "cf-connecting-ip": cardingBotIp },
      });
      const blockedRes = await proxy(blockedReq);

      expect(blockedRes.status).toBe(429);
      const json = await blockedRes.json();
      expect(json.message).toContain("Allowed 10 requests per window");
    });
  });
});
