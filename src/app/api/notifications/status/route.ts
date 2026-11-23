import { NextRequest, NextResponse } from "next/server";
import { openwaClient } from "../../../../../backend/notifications/openwa";
import { defaultDispatcher } from "../../../../../backend/notifications/dispatcher";
import { graphMailer } from "../../../../../backend/notifications/graph-mailer";
import { smtpMailer } from "../../../../../backend/notifications/smtp";
import { dbRouter } from "../../../../../backend/database/router/db-router";

export const runtime = "nodejs";

/**
 * GET /api/notifications/status
 * Real-time diagnostic and health check for automated WhatsApp and Email notifications.
 */
export async function GET(req: NextRequest) {
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
