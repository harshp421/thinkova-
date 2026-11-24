import { NextRequest, NextResponse } from "next/server";
import { openwaClient } from "../../../../../backend/notifications/openwa";
import { defaultDispatcher } from "../../../../../backend/notifications/dispatcher";
import { graphMailer } from "../../../../../backend/notifications/graph-mailer";
import { smtpMailer } from "../../../../../backend/notifications/smtp";
import { dbRouter } from "../../../../../backend/database/router/db-router";
import { verifySessionToken } from "@/lib/auth-session";

export const runtime = "nodejs";

/**
 * [SEC-06] Gateway Authorization Guard
 * Prevents unauthenticated WhatsApp/Email dispatch and unauthorized inspection of
 * notification ledger and customer PII.
 * Requires:
 * 1. Bearer token matching CRON_SECRET or INTERNAL_API_KEY, OR
 * 2. Header x-internal-secret / x-api-key matching INTERNAL_API_KEY or CRON_SECRET, OR
 * 3. Authenticated session token with SUPER_ADMIN, SCHOOL_ADMIN, or TUTOR role.
 */
async function verifyGatewayAuthorization(
  req: NextRequest | Request
): Promise<{ authorized: boolean; reason?: string; statusCode?: number }> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const internalApiKey = process.env.INTERNAL_API_KEY?.trim();

  const authHeader = req.headers.get("authorization")?.trim();
  const internalSecretHeader =
    req.headers.get("x-internal-secret")?.trim() ||
    req.headers.get("x-api-key")?.trim();

  // 1. Verify internal system credentials
  if (cronSecret || internalApiKey) {
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return { authorized: true };
    }
    if (internalApiKey && authHeader === `Bearer ${internalApiKey}`) {
      return { authorized: true };
    }
    if (internalSecretHeader) {
      if (cronSecret && internalSecretHeader === cronSecret) return { authorized: true };
      if (internalApiKey && internalSecretHeader === internalApiKey) return { authorized: true };
    }
  }

  // 2. Verify authenticated administrative or tutor session
  try {
    let token: string | undefined;

    // Check cookies from NextRequest or cookie header
    if ("cookies" in req && typeof (req as NextRequest).cookies?.get === "function") {
      token = (req as NextRequest).cookies.get("thinkova_session")?.value;
    }

    if (!token) {
      const cookieHeader = req.headers.get("cookie");
      if (cookieHeader) {
        const match = cookieHeader.match(/thinkova_session=([^;]+)/);
        if (match && match[1]) {
          token = match[1].trim();
        }
      }
    }

    // Check Authorization: Bearer <sessionToken>
    if (!token && authHeader?.startsWith("Bearer ")) {
      const candidate = authHeader.slice(7).trim();
      if (candidate !== cronSecret && candidate !== internalApiKey) {
        token = candidate;
      }
    }

    if (token) {
      const session = await verifySessionToken(token);
      if (session) {
        const allowedRoles = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TUTOR"];
        if (allowedRoles.includes(session.role)) {
          return { authorized: true };
        }
        return {
          authorized: false,
          statusCode: 403,
          reason: `Forbidden: role '${session.role}' is not authorized to access notification gateway diagnostics or trigger dispatches.`,
        };
      }
    }
  } catch {
    // Session token verification failure
  }

  return {
    authorized: false,
    statusCode: 401,
    reason:
      "Unauthorized: Access to notification gateway diagnostics and manual dispatches requires an administrative session or internal API secret (CRON_SECRET / INTERNAL_API_KEY).",
  };
}

/**
 * GET /api/notifications/status
 * Real-time diagnostic and health check for automated WhatsApp and Email notifications.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyGatewayAuthorization(req);
  if (!auth.authorized) {
    return NextResponse.json(
      {
        error: auth.reason || "Unauthorized",
        code: "ERR_UNAUTHORIZED_NOTIFICATION_GATEWAY",
      },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const testPhone = searchParams.get("testPhone");

    const openwaConfigured = openwaClient.isConfigured();
    const openwaSession = await openwaClient.getSessionStatus();
    const graphConfigured = graphMailer.isConfigured();
    const smtpConfigured = smtpMailer.isConfigured();

    // Check recent persistent notifications from MongoDB Atlas
    const recentNotifications = await defaultDispatcher.getPersistentNotifications({ limit: 10 });

    // Optional on-demand test dispatch
    let testDispatchResult = null;
    if (testPhone) {
      testDispatchResult = await defaultDispatcher.sendWhatsApp({
        to: testPhone,
        templateName: "diagnostic_test_ping",
        fallbackText: `⚡ [ThinkOva Diagnostics] Automated WhatsApp ping verified at ${new Date().toISOString()}. Your automated notifications are active!`,
        metadata: { diagnostic: true, triggeredBy: "GET /api/notifications/status" },
      });
    }

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      channels: {
        whatsapp: {
          configured: openwaConfigured,
          session: openwaSession,
          activeBaseUrl: (openwaClient as any).baseUrl,
          mode: openwaSession.isSimulation ? "SIMULATION" : "LIVE",
        },
        email: {
          microsoftGraphConfigured: graphConfigured,
          smtpConfigured: smtpConfigured,
          resendConfigured: Boolean(process.env.RESEND_API_KEY),
        },
      },
      database: {
        persistentOutboxCount: recentNotifications.length,
        telemetry: dbRouter.getRouterTelemetry(),
      },
      recentNotifications,
      testDispatchResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}

/**
 * POST /api/notifications/status
 * Manually trigger a test notification to verify end-to-end dispatch and DB persistence.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyGatewayAuthorization(req);
  if (!auth.authorized) {
    return NextResponse.json(
      {
        error: auth.reason || "Unauthorized",
        code: "ERR_UNAUTHORIZED_NOTIFICATION_GATEWAY",
      },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    const body = await req.json();
    const phone = String(body.phone || body.to || "").trim();
    const email = String(body.email || "").trim();
    const text = String(body.text || body.message || "ThinkOva Automated Notification Test").trim();

    const results: Record<string, unknown> = {};

    if (phone) {
      results.whatsapp = await defaultDispatcher.sendWhatsApp({
        to: phone,
        templateName: "test_notification",
        fallbackText: text,
        metadata: { manualTest: true },
      });
    }

    if (email) {
      results.email = await defaultDispatcher.sendEmail({
        to: email,
        subject: "ThinkOva Notification System Test",
        text,
        html: `<p>${text}</p>`,
        metadata: { manualTest: true },
      });
    }

    return NextResponse.json({
      status: "ok",
      dispatched: results,
      recentLedger: await defaultDispatcher.getPersistentNotifications({ limit: 5 }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
