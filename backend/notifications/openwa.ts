/**
 * OpenWA (Open-Source WhatsApp API Gateway) Client Singleton
 * Connects LvlUp to self-hosted OpenWA instance for free automated WhatsApp messaging.
 */

export interface OpenWASendResult {
  messageId: string;
  status: "SENT" | "PENDING" | "FAILED";
  recipientJid: string;
  isSimulation: boolean;
  error?: string;
}

export interface OpenWASessionStatus {
  sessionId: string;
  status: "CONNECTED" | "WORKING" | "QR_READY" | "SCAN_QR_CODE" | "DISCONNECTED" | "STARTING" | "STOPPED" | "SIMULATION";
  phone?: string;
  isSimulation: boolean;
}

import fs from "fs";
import path from "path";

/**
 * Safely resolves environment variables with live disk check fallback.
 * Bypasses Node.js stale process.env caching when .env is updated while dev server runs.
 */
function getEnvFresh(key: string, defaultValue: string = ""): string {
  // 1. Check live disk file (.env.local, then .env) first for most up-to-date values
  try {
    const candidates = [
      path.resolve(process.cwd(), ".env.local"),
      path.resolve(process.cwd(), ".env"),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, "utf8");
        const regex = new RegExp(`^${key}\\s*=\\s*["']?([^"'\\r\\n]+)["']?`, "m");
        const match = content.match(regex);
        if (match && match[1]) {
          const diskVal = match[1].trim();
          if (diskVal) return diskVal;
        }
      }
    }
  } catch {
    // fs access fallback
  }

  // 2. Check process.env
  const envVal = process.env[key]?.trim();
  if (envVal) {
    // If running on Windows local dev and env points to loopback where no container exists, use production IP
    if (process.platform === "win32" && (envVal.includes("127.0.0.1") || envVal.includes("localhost"))) {
      return "http://172.169.233.17:8008/api";
    }
    return envVal;
  }

  return defaultValue;
}

export class OpenWAClient {
  private baseUrl: string;
  private apiKey: string;
  private sessionId: string;
  private resolvedSessionId?: string;

  constructor() {
    this.baseUrl = this.normalizeUrl(getEnvFresh("OPENWA_API_URL", "http://172.169.233.17:8008/api"));
    this.apiKey = getEnvFresh("OPENWA_API_KEY", "");
    this.sessionId = getEnvFresh("OPENWA_SESSION_ID", "thinkova-notifications");
  }

  private normalizeUrl(url: string): string {
    let clean = (url || "").trim().replace(/\/$/, "");
    if (!clean) return "http://172.169.233.17:8008/api";
    // If pointing to localhost/127.0.0.1 on Windows dev, automatically redirect to deployed VM
    if (process.platform === "win32" && (clean.includes("127.0.0.1") || clean.includes("localhost"))) {
      clean = "http://172.169.233.17:8008/api";
    }
    if (!clean.endsWith("/api")) {
      clean = `${clean}/api`;
    }
    return clean;
  }

  private getBaseUrl(): string {
    const fresh = getEnvFresh("OPENWA_API_URL", this.baseUrl || "http://172.169.233.17:8008/api");
    return this.normalizeUrl(fresh);
  }

  private getApiKey(): string {
    return getEnvFresh("OPENWA_API_KEY", this.apiKey || "").trim();
  }

  private getSessionId(): string {
    return getEnvFresh("OPENWA_SESSION_ID", this.sessionId || "thinkova-notifications").trim();
  }

  /**
   * Automatically resolves session identifier from friendly name (e.g. "thinkova-notifications")
   */
  public async getActiveSessionId(): Promise<string> {
    if (this.resolvedSessionId) return this.resolvedSessionId;

    const apiKey = this.getApiKey();
    const configuredSessionId = this.getSessionId();
    const baseUrl = this.getBaseUrl();

    try {
      const headers: Record<string, string> = {};
      if (apiKey) headers["X-API-Key"] = apiKey;
      const res = await fetch(`${baseUrl}/sessions`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sessions: any[] = await res.json();
        const found =
          sessions.find((s) => s.id === configuredSessionId || s.name === configuredSessionId) ||
          sessions.find((s) => s.status === "WORKING" || s.status === "ready" || s.status === "connected") ||
          sessions[0];
        if (found) {
          this.resolvedSessionId = found.id || found.name;
          return this.resolvedSessionId as string;
        }
      }
    } catch {
      // Use configured ID
    }

    return configuredSessionId;
  }

  /**
   * Returns true when real OpenWA API credentials are configured.
   */
  public isConfigured(): boolean {
    const key = this.getApiKey();
    return Boolean((key && key.length > 0) || process.env.OPENWA_API_URL || process.env.OPENWA_SESSION_ID);
  }

  /**
   * Formats Indian mobile numbers to WhatsApp JID format:
   * E.g. "+91 98201 43210" or "9820143210" -> "919820143210@c.us"
   */
  public formatChatId(phone: string): string {
    let digits = phone.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("0")) {
      digits = digits.slice(1);
    }
    if (digits.length === 10) {
      digits = `91${digits}`;
    }
    return `${digits}@c.us`;
  }

  /**
   * Dispatches text message via OpenWA REST API or Dynamic Simulation.
   */
  public async sendText(phone: string, text: string): Promise<OpenWASendResult> {
    const chatId = this.formatChatId(phone);

    if (!this.isConfigured()) {
      // Dynamic Simulation Mode (for testing without Docker container running)
      console.info(`[OpenWA] [SIMULATION] Message dispatched to ${chatId}: "${text.slice(0, 50)}…"`);
      return {
        messageId: `sim_wa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        status: "SENT",
        recipientJid: chatId,
        isSimulation: true,
      };
    }

    const baseUrl = this.getBaseUrl();
    const apiKey = this.getApiKey();
    const targetSessionId = await this.getActiveSessionId();
    const url = `${baseUrl}/sessions/${encodeURIComponent(targetSessionId)}/messages/send-text`;

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["X-API-Key"] = apiKey;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ chatId, text }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`OpenWA HTTP ${res.status}: ${errText}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json().catch(() => ({}));
      return {
        messageId: data?.id || data?.messageId || `wa_${Date.now()}`,
        status: "SENT",
        recipientJid: chatId,
        isSimulation: false,
      };
    } catch (err: unknown) {
      const cause = (err as any)?.cause?.code || (err as any)?.cause?.message || "";
      const errorMsg = cause ? `${(err as Error).message} (${cause} on ${url})` : (err as Error).message;

      if (errorMsg.includes("is not registered")) {
        console.warn(`[OpenWA] Recipient ${chatId} does not have an active WhatsApp account.`);
      } else {
        console.error(`[OpenWA] Failed to dispatch text to ${chatId}:`, errorMsg);
      }
      return {
        messageId: "",
        status: "FAILED",
        recipientJid: chatId,
        isSimulation: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Dispatches media or document attachment (e.g. PDF curriculum or student milestone report).
   */
  public async sendMedia(
    phone: string,
    mediaUrl: string,
    filename: string,
    caption?: string
  ): Promise<OpenWASendResult> {
    const chatId = this.formatChatId(phone);

    if (!this.isConfigured()) {
      console.info(`[OpenWA] [SIMULATION] Document dispatched (${filename}) to ${chatId}`);
      return {
        messageId: `sim_media_${Date.now()}`,
        status: "SENT",
        recipientJid: chatId,
        isSimulation: true,
      };
    }

    const baseUrl = this.getBaseUrl();
    const apiKey = this.getApiKey();
    const targetSessionId = await this.getActiveSessionId();
    const url = `${baseUrl}/sessions/${encodeURIComponent(targetSessionId)}/messages/send-media`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          chatId,
          mediaUrl,
          filename,
          caption: caption || filename,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`OpenWA HTTP ${res.status}: ${errText}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json().catch(() => ({}));
      return {
        messageId: data?.id || `wa_media_${Date.now()}`,
        status: "SENT",
        recipientJid: chatId,
        isSimulation: false,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        messageId: "",
        status: "FAILED",
        recipientJid: chatId,
        isSimulation: false,
        error: message,
      };
    }
  }

  /**
   * Retrieves active WhatsApp session health and connection status.
   */
  public async getSessionStatus(): Promise<OpenWASessionStatus> {
    const apiKey = this.getApiKey();
    const sessionId = this.getSessionId();

    if (!this.isConfigured()) {
      return {
        sessionId,
        status: "SIMULATION",
        isSimulation: true,
      };
    }

    const baseUrl = this.getBaseUrl();
    const targetSessionId = await this.getActiveSessionId();
    const url = `${baseUrl}/sessions/${encodeURIComponent(targetSessionId)}`;

    try {
      const headers: Record<string, string> = {};
      if (apiKey) headers["X-API-Key"] = apiKey;
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { sessionId: targetSessionId, status: "DISCONNECTED", isSimulation: false };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      return {
        sessionId: targetSessionId,
        status: data?.status || "CONNECTED",
        phone: data?.phone || data?.me?.id,
        isSimulation: false,
      };
    } catch {
      return { sessionId: targetSessionId, status: "DISCONNECTED", isSimulation: false };
    }
  }
}

export const openwaClient = new OpenWAClient();

