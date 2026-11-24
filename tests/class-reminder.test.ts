import { describe, it, expect, beforeEach } from "vitest";
import { classReminderJob, clearSentRemindersCache } from "../backend/jobs/class-reminder-job";
import { preAggregators } from "../backend/aggregators";
import { whatsappTemplates } from "../backend/templates/whatsapp-templates";
import { GET, POST } from "../src/app/api/cron/class-reminders/route";
import { NextRequest } from "next/server";
import type { CronTrigger } from "../backend/cron/types";
import { seedDynamicTestData } from "./fixtures";
import { dbManager } from "../backend/database/client";

describe("OpenWA Daily Class Reminder Automation", () => {
  beforeEach(async () => {
    clearSentRemindersCache();
    await seedDynamicTestData();
  });

  it("1. Configures the daily class reminder job with correct cron schedule and timezone", () => {
    expect(classReminderJob.id).toBe("job.class_reminder_daily");
    expect(classReminderJob.trigger.type).toBe("cron");
    const cron = classReminderJob.trigger as CronTrigger;
    expect(cron.expression).toBe("0 9 * * *"); // 09:00 AM daily
    expect(cron.timezone).toBe("Asia/Kolkata");
    expect(classReminderJob.enabled).toBe(true);
  });

  it("2. Formats WhatsApp class reminder template with accurate class timing, mentor, and preparation notes", () => {
    const wa = whatsappTemplates.classReminder({
      parentPhone: "+919876543210",
      parentName: "Sandeep Verma",
      studentName: "Arjun Verma",
      className: "Level 4: Autonomous Obstacle Detection Rover",
      levelNumber: 4,
      classDate: "Wed 25 Nov",
      classTime: "14:30 – 16:00 IST",
      tutorName: "Rohan Kulkarni (M.Tech CS)",
      prepItem: "Bring ultrasonic sensors and breadboard",
      joinUrl: "https://thinkova.ai/learning/lab-session?studentId=stu_01&courseId=robotics-starter&level=4",
    });

    expect(wa.to).toBe("+919876543210");
    expect(wa.templateName).toBe("thinkova_class_reminder_daily_v1");
    expect(wa.fallbackText).toContain("CLASS REMINDER TODAY");
    expect(wa.fallbackText).toContain("Arjun Verma");
    expect(wa.fallbackText).toContain("Level 4: Autonomous Obstacle Detection Rover");
    expect(wa.fallbackText).toContain("14:30 – 16:00 IST");
    expect(wa.fallbackText).toContain("Rohan Kulkarni (M.Tech CS)");
    expect(wa.fallbackText).toContain("Bring ultrasonic sensors and breadboard");
  });

  it("3. Pre-aggregates daily class reminders strictly from real database records (never static mock numbers)", async () => {
    const result = await preAggregators.classReminders("Wednesday");
    expect(result.count).toBe(1);
    const first = result.data[0];
    expect(first).toBeDefined();
    expect(first?.className).toContain("Level 4");
    expect(first?.studentName).toBe("Arjun Verma");
    expect(first?.parentPhone).toBe("+919876543210");
    expect(first?.tutorName).toBe("Rohan Kulkarni (M.Tech CS)");
  });

  it("4. Returns 0 records and dispatches nothing when no enrolled students exist in database", async () => {
    // Clear all dynamic data
    dbManager.memory.clearAll();

    const emptyResult = await preAggregators.classReminders();
    expect(emptyResult.count).toBe(0);
    expect(emptyResult.data).toEqual([]);
  });

  it("5. Enforces idempotency and prevents over-logging duplicate events", async () => {
    const testRecords = await preAggregators.classReminders("Wednesday");
    expect(testRecords.data.length).toBeGreaterThan(0);

    // Initial run dispatches reminders
    const firstRunSummary = await classReminderJob.handler(testRecords.data, {
      jobId: "job.class_reminder_daily",
      runId: "run_test_1",
      scheduledTime: new Date(),
      attempt: 1,
    });
    expect(firstRunSummary.recordsProcessed).toBeGreaterThan(0);

    // Second run immediately on same day: should skip duplicates without re-sending
    const secondRunSummary = await classReminderJob.handler(testRecords.data, {
      jobId: "job.class_reminder_daily",
      runId: "run_test_2",
      scheduledTime: new Date(),
      attempt: 1,
    });
    expect(secondRunSummary.recordsProcessed).toBe(0);
  });

  it("6. API Route GET handler returns structured execution summary and supports status query", async () => {
    const getAuthHeaders = () => {
      const token = process.env.CRON_SECRET || process.env.INTERNAL_API_KEY || "thinkova_cron_secret_key_2026";
      return { Authorization: `Bearer ${token}` };
    };

    // Status query
    const statusReq = new NextRequest("http://localhost:3000/api/cron/class-reminders?status=true", {
      headers: getAuthHeaders(),
    });
    const statusRes = await GET(statusReq);
    expect(statusRes.status).toBe(200);
    const statusData = await statusRes.json();
    expect(statusData.channel).toBe("OPENWA");
    expect(statusData.schedule.frequency).toBe("DAILY");

    // Execution query for specific date
    const runReq = new NextRequest("http://localhost:3000/api/cron/class-reminders?date=Wednesday&force=true", {
      headers: getAuthHeaders(),
    });
    const runRes = await GET(runReq);
    expect(runRes.status).toBe(200);
    const runData = await runRes.json();
    expect(runData.success).toBe(true);
    expect(runData.automation).toBe("OpenWA Daily Class Reminders");
    expect(runData.summary.dispatched).toBeGreaterThan(0);
    expect(runData.quietMode).toBe(true);
  });

  it("7. API Route POST handler handles JSON body with target date and force bypass", async () => {
    const token = process.env.CRON_SECRET || process.env.INTERNAL_API_KEY || "thinkova_cron_secret_key_2026";
    const postReq = new NextRequest("http://localhost:3000/api/cron/class-reminders", {
      method: "POST",
      body: JSON.stringify({
        date: "Wednesday",
        force: true,
        studentId: "stu_01",
      }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const postRes = await POST(postReq);
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.success).toBe(true);
    expect(postData.summary.totalEligible).toBe(1);
    expect(postData.summary.dispatched).toBe(1);
  });
});
