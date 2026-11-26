import { dbRouter } from "../database/router/db-router";
import type { JobDefinition } from "../cron/types";
import type { InstallmentDueRecord } from "../aggregators/types";
import { preAggregators } from "../aggregators";
import { dbManager } from "../database/client";
import { emailTemplates } from "../templates/email-templates";
import { defaultDispatcher } from "../notifications/dispatcher";

async function sendReminderOnce(id: string, send: () => Promise<{ status: string }>) {
  const claimed = await dbRouter.commerceTransaction(async () => {
    const previous = await dbRouter.get<{ status: string }>("installment_deliveries", id, "commerce");
    if (previous && previous.status !== "FAILED") return previous.status;
    await dbRouter.upsert("installment_deliveries", { id, status: "PENDING" }, "commerce");
    return "CLAIMED";
  });
  if (claimed !== "CLAIMED") return claimed === "SENT";
  const delivery = await send();
  await dbRouter.update("installment_deliveries", id, { status: delivery.status }, "commerce");
  return delivery.status === "SENT";
}

export const installmentDueJob: JobDefinition<InstallmentDueRecord> = {
  id: "job.installment_due_reminder",
  name: "Installment 2 Reminder (3 Days Prior)",
  description: "Detects students approaching Level 5 and reminds parents to pay the outstanding installment.",
  trigger: {
    type: "cron",
    expression: "0 9 * * *", // Runs every morning at 09:00 AM
    timezone: "Asia/Kolkata",
  },
  enabled: true,
  preventOverlap: true,
  retryLimit: 3,
  retryDelayMs: 5000,
  preAggregator: () => preAggregators.installmentDues(3),
  handler: async (records, context) => {
    let sentCount = 0;

    for (const record of records) {
      const email = emailTemplates.installmentReminder(record);

      // 1. Dispatch Email
      const emailSent = await sendReminderOnce(record.enrollmentId + ":email", () => defaultDispatcher.sendEmail({
        to: record.parentEmail,
        subject: email.subject,
        html: email.html,
        text: email.text,
        metadata: {
          jobId: context.jobId,
          enrollmentId: record.enrollmentId,
          studentName: record.studentName,
        },
      }));

      // 2. Dispatch WhatsApp Reminder
      const whatsappSent = !record.parentPhone || await sendReminderOnce(record.enrollmentId + ":whatsapp", () => defaultDispatcher.sendWhatsApp({
        to: record.parentPhone,
        templateName: "thinkova_installment_due_v1",
        fallbackText: `Hi ${record.parentName}, ${record.studentName} is reaching Level 5! Installment 2 (${record.installmentAmount}) is due by ${record.dueDate}. Pay online: ${record.paymentUrl}`,
        metadata: {
          enrollmentId: record.enrollmentId,
          dueDate: record.dueDate,
        },
      }));
      if (!emailSent || !whatsappSent) continue;

      // Mark in dynamic database
      await dbManager.commerce.markAlertSent("INSTALLMENT", record.enrollmentId);
      sentCount++;
    }

    return {
      recordsProcessed: sentCount,
      details: { runId: context.runId, daysAhead: 3 },
    };
  },
};
