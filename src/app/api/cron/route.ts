import crypto from "crypto";
import { NextResponse } from "next/server";
import { getScheduler } from "../../../../backend/cron/scheduler";
import { defaultDispatcher } from "../../../../backend/notifications/dispatcher";

export const runtime = "nodejs";

function safeTokenEquals(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verifies caller authorization for cron execution and unmasked diagnostics.
 * Fails closed (503) if neither CRON_SECRET nor INTERNAL_API_KEY is configured.
 */
function verifyCronAuthorization(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const internalKey = process.env.INTERNAL_API_KEY?.trim();

  if (!cronSecret && !internalKey) {
    return NextResponse.json(
      {
        error: "Cron execution unavailable: CRON_SECRET is not configured on the server.",
        code: "ERR_CRON_SECRET_UNSET",
      },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization")?.trim();
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
  const internalSecret =
    request.headers.get("x-internal-secret")?.trim() ||
    request.headers.get("x-api-key")?.trim();

  const isAuthorized =
    safeTokenEquals(bearerToken, cronSecret) ||
    safeTokenEquals(bearerToken, internalKey) ||
    safeTokenEquals(internalSecret, cronSecret) ||
    safeTokenEquals(internalSecret, internalKey);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

/**
 * GET /api/cron
 * - When called with ?run=true or by Vercel Cron: runs all jobs and returns execution logs.
 * - When called without parameters: returns engine health, registered jobs, and recent outbox.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shouldRun = searchParams.get("run") === "true" || searchParams.get("action") === "run";

  const scheduler = getScheduler();

  if (shouldRun) {
    const authError = verifyCronAuthorization(request);
    if (authError) {
      return authError;
    }

    const results = await scheduler.runAllJobs();
    return NextResponse.json({
      status: "success",
      executedAt: new Date().toISOString(),
      executedJobsCount: results.length,
      results,
    });
  }

  const health = scheduler.getHealth();
  const jobs = scheduler.getAllJobs().map((j) => ({
    id: j.id,
    name: j.name,
    description: j.description,
    trigger: j.trigger,
    status: scheduler.getJobStatus(j.id),
  }));

  // Fetch persistent notifications from MongoDB Atlas (with in-memory ledger fallback)
  // [SEC-10] PII Masking: Mask email addresses and phone numbers on public diagnostics unless authorized via CRON_SECRET / INTERNAL_API_KEY
  const isAuthorized = verifyCronAuthorization(request) === null;

  const maskEmail = (email?: string) => {
    if (!email) return "";
    if (isAuthorized) return email;
    const parts = email.split("@");
    if (parts.length !== 2) return "***";
    const name = parts[0] || "";
    const visible = name.slice(0, 2);
    return `${visible}***@${parts[1]}`;
  };

  const maskPhone = (phone?: string) => {
    if (!phone) return "";
    if (isAuthorized) return phone;
    const clean = phone.replace(/\s+/g, "");
    if (clean.length < 6) return "***";
    return `${clean.slice(0, 3)}****${clean.slice(-3)}`;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentNotifications: any[] = await defaultDispatcher.getPersistentNotifications({ limit: 20 });
  const emailOutbox = recentNotifications.filter((n: any) => n.channel === "EMAIL");
  const whatsAppOutbox = recentNotifications.filter((n: any) => n.channel === "WHATSAPP");

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    health,
    jobs,
    recentNotifications: {
      storageSource: "MONGODB_ATLAS",
      totalEmailsSent: emailOutbox.length,
      totalWhatsAppSent: whatsAppOutbox.length,
      emails: emailOutbox.map((e: any) => ({
        id: e.id,
        to: maskEmail(e.recipient || e.to),
        subject: e.subject,
        status: e.status,
        transport: e.transport,
        sentAt: e.sentAt,
      })),
      whatsApp: whatsAppOutbox.map((w: any) => ({
        id: w.id,
        to: maskPhone(w.recipient || w.to),
        template: w.templateName,
        status: w.status,
        transport: w.transport,
        sentAt: w.sentAt,
      })),
    },
  });
}

/**
 * POST /api/cron
 * Allows manual or webhook-triggered execution of a specific cron job.
 * Body: { "jobId": "job.abandoned_cart_recovery" } or { "runAll": true }
 */
export async function POST(request: Request) {
  const authError = verifyCronAuthorization(request);
  if (authError) {
    return authError;
  }

  let body: { jobId?: string; runAll?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scheduler = getScheduler();

  if (body.runAll) {
    const results = await scheduler.runAllJobs();
    return NextResponse.json({ status: "success", executedJobsCount: results.length, results });
  }

  const { jobId } = body;
  if (!jobId) {
    return NextResponse.json({ error: "Missing required 'jobId' or 'runAll' in request body" }, { status: 422 });
  }

  const job = scheduler.getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: `Job with id '${jobId}' not found` }, { status: 404 });
  }

  try {
    const log = await scheduler.runJobNow(jobId);
    return NextResponse.json({
      status: "success",
      jobId,
      executionLog: log,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", jobId, error: message }, { status: 500 });
  }
}
