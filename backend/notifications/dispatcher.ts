import { graphMailer } from "./graph-mailer";
import { openwaClient } from "./openwa";
import { smtpMailer } from "./smtp";
import { dbRouter } from "../database/router/db-router";

/**
 * Unified Dispatcher & Outbox Ledger for Emails and WhatsApp Messages
 */

export interface DispatchedEmail {
  id: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  sentAt: Date;
  status: "SENT" | "FAILED";
  metadata?: Record<string, unknown>;
}

export interface DispatchedWhatsApp {
  id: string;
  to: string;
  templateName: string;
  fallbackText: string;
  components?: unknown[];
  sentAt: Date;
  status: "SENT" | "FAILED";
  metadata?: Record<string, unknown>;
}

export class NotificationDispatcher {
  private emailOutbox: DispatchedEmail[] = [];
  private whatsAppOutbox: DispatchedWhatsApp[] = [];
  private maxOutboxSize = 200;

  /**
   * Dispatches an email and stores it in the outbox ledger
   */
  public async sendEmail(payload: {
    to: string;
    subject: string;
    html: string;
    text: string;
    metadata?: Record<string, unknown>;
  }): Promise<DispatchedEmail> {
    const record: DispatchedEmail = {
      id: `em_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      sentAt: new Date(),
      status: "SENT",
      metadata: payload.metadata,
    };

    // 1. Prioritize Microsoft Graph API automation if configured:
    if (graphMailer.isConfigured()) {
      try {
        const info = await graphMailer.sendEmail({
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        });

        record.metadata = {
          ...record.metadata,
          transport: "MICROSOFT_GRAPH",
          messageId: info.messageId,
          sender: info.sender,
          deliveredLive: true,
        };
        console.info(`[Dispatcher] Live email dispatched via Microsoft Graph to ${payload.to} (MessageID: ${info.messageId})`);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Dispatcher] Microsoft Graph dispatch error to ${payload.to}:`, errorMsg);
        record.status = "FAILED";
        record.metadata = { ...record.metadata, transport: "MICROSOFT_GRAPH", error: errorMsg };
      }
    } else if (smtpMailer.isConfigured()) {
      // 2. SMTP Transport (Zoho / Custom SMTP client)
      try {
        const info = await smtpMailer.sendMail({
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        });

        record.metadata = {
          ...record.metadata,
          transport: "SMTP",
          messageId: info.messageId,
          deliveredLive: true,
        };
        console.info(`[Dispatcher] Live email dispatched via SMTP to ${payload.to} (MessageID: ${info.messageId})`);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Dispatcher] SMTP dispatch error to ${payload.to}:`, errorMsg);
        record.status = "FAILED";
        record.metadata = { ...record.metadata, transport: "SMTP", error: errorMsg };
      }
    } else if (process.env.RESEND_API_KEY) {
      // 3. Fallback to Resend HTTP API if configured:
      try {
        const fromAddress = process.env.RESEND_FROM_EMAIL || "Thinkova <info@thinkova.ai>";
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddress,
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`[Dispatcher] Resend API error (${res.status}): ${errText}`);
          record.status = "FAILED";
          record.metadata = { ...record.metadata, transport: "RESEND", providerError: errText, statusCode: res.status };
        } else {
          const resData = (await res.json()) as { id?: string };
          record.metadata = { ...record.metadata, transport: "RESEND", resendId: resData?.id, deliveredLive: true };
          console.info(`[Dispatcher] Live email dispatched via Resend to ${payload.to} (ID: ${resData?.id})`);
        }
      } catch (err) {
        console.error(`[Dispatcher] Network error sending live email via Resend:`, err);
        record.status = "FAILED";
      }
    } else {
      record.metadata = { ...record.metadata, deliveredLive: false, mode: "SIMULATED_OUTBOX" };
    }

    this.emailOutbox.unshift(record);
    if (this.emailOutbox.length > this.maxOutboxSize) {
      this.emailOutbox.pop();
    }

    // Persist to MongoDB Atlas asynchronously:
    try {
      await dbRouter.upsert("notifications", {
        id: record.id,
        channel: "EMAIL",
        recipient: record.to,
        subject: record.subject,
        content: record.text,
        status: record.status === "FAILED" ? "FAILED" : (record.metadata?.mode === "SIMULATED_OUTBOX" ? "SIMULATION" : "SENT"),
        transport: (record.metadata?.transport as any) || (record.metadata?.mode === "SIMULATED_OUTBOX" ? "SIMULATION" : "MICROSOFT_GRAPH"),
        messageId: (record.metadata?.messageId as string) || (record.metadata?.resendId as string) || undefined,
        error: (record.metadata?.error as string) || (record.metadata?.providerError as string) || undefined,
        metadata: record.metadata,
        sentAt: record.sentAt,
        createdAt: new Date(),
      }, "commerce");
    } catch (dbErr) {
      console.warn("[Dispatcher] Failed to persist email notification to database:", dbErr);
    }

    return record;
  }

  /**
   * Dispatches a WhatsApp message and stores it in the outbox ledger
   */
  public async sendWhatsApp(payload: {
    to: string;
    templateName: string;
    fallbackText: string;
    components?: unknown[];
    metadata?: Record<string, unknown>;
  }): Promise<DispatchedWhatsApp> {
    const record: DispatchedWhatsApp = {
      id: `wa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      to: payload.to,
      templateName: payload.templateName,
      fallbackText: payload.fallbackText,
      components: payload.components,
      sentAt: new Date(),
      status: "SENT",
      metadata: payload.metadata,
    };

    // 1. Prioritize self-hosted OpenWA gateway if configured:
    if (openwaClient.isConfigured()) {
      try {
        const waResult = await openwaClient.sendText(payload.to, payload.fallbackText);
        record.metadata = {
          ...record.metadata,
          transport: "OPENWA",
          messageId: waResult.messageId,
          recipientJid: waResult.recipientJid,
          deliveredLive: !waResult.isSimulation,
        };
        if (waResult.status === "FAILED") {
          record.status = "FAILED";
          record.metadata.error = waResult.error;
        } else {
          console.info(`[Dispatcher] Live WhatsApp dispatched via OpenWA to ${payload.to}`);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Dispatcher] OpenWA dispatch error to ${payload.to}:`, errorMsg);
        record.status = "FAILED";
        record.metadata = { ...record.metadata, transport: "OPENWA", error: errorMsg };
      }
    } else if (process.env.WATI_API_ENDPOINT && process.env.WATI_BEARER_TOKEN) {
      // 2. Fallback to external WhatsApp provider (WATI/Interakt) if configured:
      try {
        await fetch(`${process.env.WATI_API_ENDPOINT}/api/v1/sendTemplateMessage`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.WATI_BEARER_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            whatsappNumber: payload.to,
            template_name: payload.templateName,
            broadcast_name: "thinkova_notification",
          }),
        });
      } catch (err) {
        console.error(`[Dispatcher] Failed to dispatch live WhatsApp via WATI:`, err);
      }
    } else {
      record.metadata = { ...record.metadata, deliveredLive: false, mode: "SIMULATED_OUTBOX" };
    }

    this.whatsAppOutbox.unshift(record);
    if (this.whatsAppOutbox.length > this.maxOutboxSize) {
      this.whatsAppOutbox.pop();
    }

    // Persist to MongoDB Atlas asynchronously:
    try {
      await dbRouter.upsert("notifications", {
        id: record.id,
        channel: "WHATSAPP",
        recipient: record.to,
        templateName: record.templateName,
        content: record.fallbackText,
        status: record.status === "FAILED" ? "FAILED" : (record.metadata?.mode === "SIMULATED_OUTBOX" ? "SIMULATION" : "SENT"),
        transport: (record.metadata?.transport as any) || (record.metadata?.mode === "SIMULATED_OUTBOX" ? "SIMULATION" : "OPENWA"),
        messageId: (record.metadata?.messageId as string) || undefined,
        error: (record.metadata?.error as string) || undefined,
        metadata: record.metadata,
        sentAt: record.sentAt,
        createdAt: new Date(),
      }, "commerce");
    } catch (dbErr) {
      console.warn("[Dispatcher] Failed to persist WhatsApp notification to database:", dbErr);
    }

    return record;
  }

  /**
   * Retrieves notification ledger from MongoDB Atlas (with in-memory fallback)
   */
  public async getPersistentNotifications(filter?: {
    recipient?: string;
    channel?: "WHATSAPP" | "EMAIL";
    limit?: number;
  }) {
    try {
      const query: Record<string, unknown> = {};
      if (filter?.recipient) query.recipient = filter.recipient;
      if (filter?.channel) query.channel = filter.channel;
      const docs = await dbRouter.find("notifications", query, { limit: filter?.limit || 50 }, "commerce");
      if (docs && docs.length > 0) {
        return docs.sort((a: any, b: any) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
      }
    } catch {
      // Fallback to in-memory ledger
    }

    if (filter?.channel === "WHATSAPP") {
      return this.getWhatsAppOutbox(filter?.recipient);
    }
    if (filter?.channel === "EMAIL") {
      return this.getEmailOutbox(filter?.recipient);
    }
    return [...this.whatsAppOutbox, ...this.emailOutbox].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }

  public getEmailOutbox(recipient?: string): DispatchedEmail[] {
    if (recipient) {
      return this.emailOutbox.filter((e) => e.to.toLowerCase() === recipient.toLowerCase());
    }
    return [...this.emailOutbox];
  }

  public getWhatsAppOutbox(phone?: string): DispatchedWhatsApp[] {
    if (phone) {
      return this.whatsAppOutbox.filter((w) => w.to === phone);
    }
    return [...this.whatsAppOutbox];
  }

  public clearOutbox(): void {
    this.emailOutbox = [];
    this.whatsAppOutbox = [];
  }
}

export const defaultDispatcher = new NotificationDispatcher();
export const notificationDispatcher = defaultDispatcher;
