import { NextRequest, NextResponse } from "next/server";
import { verifySessionTokenEdge, SESSION_COOKIE_NAME } from "@/lib/auth-edge";
import {
  checkRateLimit,
  createRateLimitExceededResponse,
} from "@/lib/rate-limiter";

/**
 * ThinkOva Edge Proxy with Role-Based Access Control (RBAC) & Rate Limiting
 * Modern Next.js 16 file convention replacing deprecated middleware.
 * Protects public endpoints from bot attacks, credential abuse, and card testing,
 * while enforcing RBAC on tutor portals and student learning environments.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // =========================================================================
  // 1. RATE LIMITING ON PUBLIC AUTH & PAYMENT ENDPOINTS
  // Prevents bot signup attacks, credential brute-forcing, and carding abuse.
  // =========================================================================
  const rateLimitResult = checkRateLimit(pathname, req.headers);
  if (rateLimitResult && !rateLimitResult.allowed) {
    return createRateLimitExceededResponse(rateLimitResult);
  }

  // =========================================================================
  // 2. EXTRACT & VERIFY SESSION TOKEN
  // =========================================================================
  let token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }
  }

  const session = token ? await verifySessionTokenEdge(token) : null;
  const isApi = pathname.startsWith("/api/");
  const isTutorRoute =
    pathname === "/tutor" ||
    pathname.startsWith("/tutor/") ||
    pathname.startsWith("/api/tutor");

  // =========================================================================
  // 3. TUTOR DOMAIN RBAC ENFORCEMENT (/tutor, /api/tutor/*)
  // Required roles: "TUTOR" or "SUPER_ADMIN"
  // =========================================================================
  if (isTutorRoute) {
    if (!session) {
      if (isApi) {
        return NextResponse.json(
          { error: "Authentication required. Please log in as an instructor." },
          { status: 401 }
        );
      }
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("role", "tutor");
      loginUrl.searchParams.set("redirect", pathname + search);
      return NextResponse.redirect(loginUrl);
    }

    const isAuthorizedTutor =
      session.role === "TUTOR" || session.role === "SUPER_ADMIN";

    if (!isAuthorizedTutor) {
      if (isApi) {
        return NextResponse.json(
          { error: "Forbidden: Tutor or Administrator credentials required." },
          { status: 403 }
        );
      }
      // Redirect unauthorized parents attempting to access the tutor portal
      const fallbackUrl = new URL("/who-is-learning", req.url);
      fallbackUrl.searchParams.set("error", "tutor_access_required");
      return NextResponse.redirect(fallbackUrl);
    }
  }

  // =========================================================================
  // 4. PARENT & STUDENT DOMAIN PROTECTION (/learning/*, /profile/*, etc.)
  // Required: Any valid authenticated session
  // =========================================================================
  const isParentProtectedRoute =
    pathname.startsWith("/learning") ||
    pathname.startsWith("/profile") ||
    pathname === "/who-is-learning" ||
    pathname.startsWith("/who-is-learning/") ||
    pathname === "/tell-us-child" ||
    pathname.startsWith("/tell-us-child/");

  if (isParentProtectedRoute && !session) {
    if (isApi) {
      return NextResponse.json(
        { error: "Authentication required. Please log in to access this resource." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // =========================================================================
  // 5. AUTHORIZED PASS-THROUGH WITH INJECTED CONTEXT & RATE LIMIT HEADERS
  // =========================================================================
  const requestHeaders = new Headers(req.headers);
  if (session) {
    requestHeaders.set("x-user-id", session.userId);
    requestHeaders.set("x-user-role", session.role);
    requestHeaders.set("x-user-email", session.email);
    requestHeaders.set(
      "x-user-name",
      encodeURIComponent(session.fullName || session.username)
    );
  }

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (session) {
    res.headers.set("x-user-id", session.userId);
    res.headers.set("x-user-role", session.role);
    res.headers.set("x-user-email", session.email);
    res.headers.set(
      "x-user-name",
      encodeURIComponent(session.fullName || session.username)
    );
  }

  if (rateLimitResult) {
    res.headers.set("X-RateLimit-Limit", String(rateLimitResult.limit));
    res.headers.set(
      "X-RateLimit-Remaining",
      String(rateLimitResult.remaining)
    );
    res.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(rateLimitResult.resetTimeMs / 1000))
    );
  }

  return res;
}

// Backward-compatible named and default export
export default proxy;
export { proxy as middleware };

/**
 * Configure which paths the proxy executes on.
 * Excludes static assets, public marketing pages, and webhook endpoints automatically.
 */
export const config = {
  matcher: [
    "/tutor/:path*",
    "/api/tutor/:path*",
    "/learning/:path*",
    "/profile/:path*",
    "/who-is-learning/:path*",
    "/tell-us-child/:path*",
    "/api/auth/signup",
    "/api/auth/login",
    "/api/cashfree/order",
    "/api/cashfree/order/:path*",
  ],
};
