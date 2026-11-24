import { NextResponse } from "next/server";
import { getScheduler } from "../../../../backend/cron/scheduler";
import { defaultDispatcher } from "../../../../backend/notifications/dispatcher";

export const runtime = "nodejs";

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
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        to: e.recipient || e.to,
        subject: e.subject,
        status: e.status,
        transport: e.transport,
        sentAt: e.sentAt,
      })),
      whatsApp: whatsAppOutbox.map((w: any) => ({
        id: w.id,
        to: w.recipient || w.to,
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
  // Optional security check
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
