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

export class OpenWAClient {
  private baseUrl: string;
  private apiKey: string;
  private sessionId: string;
  private resolvedSessionId?: string;

  constructor() {
    this.baseUrl = (process.env.OPENWA_API_URL || "http://172.169.233.17:8008/api").replace(/\/$/, "");
    this.apiKey = process.env.OPENWA_API_KEY || "";
    this.sessionId = process.env.OPENWA_SESSION_ID || "thinkova-notifications";
  }

  private getBaseUrl(): string {
    return (process.env.OPENWA_API_URL || this.baseUrl || "http://172.169.233.17:8008/api").replace(/\/$/, "");
  }

  private getApiKey(): string {
    return (process.env.OPENWA_API_KEY || this.apiKey || "").trim();
  }

  private getSessionId(): string {
    return (process.env.OPENWA_SESSION_ID || this.sessionId || "thinkova-notifications").trim();
  }

  private getCandidateBaseUrls(): string[] {
    const configured = this.getBaseUrl();
    const urls = [configured];
    if (configured.includes("172.169.233.17") || !configured.includes("127.0.0.1")) {
      urls.push("http://127.0.0.1:8008/api");
      urls.push("http://localhost:8008/api");
    }
    return Array.from(new Set(urls));
  }

  /**
   * Automatically resolves session identifier from friendly name (e.g. "thinkova-notifications")
   */
  public async getActiveSessionId(): Promise<string> {
    if (this.resolvedSessionId) return this.resolvedSessionId;

    const apiKey = this.getApiKey();
    const configuredSessionId = this.getSessionId();
    const candidates = this.getCandidateBaseUrls();

    for (const baseUrl of candidates) {
      try {
        const res = await fetch(`${baseUrl}/sessions`, {
          headers: { "X-API-Key": apiKey },
          signal: AbortSignal.timeout(3000),
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
            this.baseUrl = baseUrl;
            return this.resolvedSessionId as string;
          }
        }
      } catch {
        // Try next candidate
      }
    }

    return configuredSessionId;
  }

  /**
   * Returns true when real OpenWA API credentials are configured.
   */
  public isConfigured(): boolean {
    const key = this.getApiKey();
    return Boolean(key && key.length > 0);
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

    const apiKey = this.getApiKey();
    const targetSessionId = await this.getActiveSessionId();
    const candidates = this.getCandidateBaseUrls();
    let lastError = "";

    for (const baseUrl of candidates) {
      const url = `${baseUrl}/sessions/${encodeURIComponent(targetSessionId)}/messages/send-text`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify({ chatId, text }),
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`OpenWA HTTP ${res.status}: ${errText}`);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json().catch(() => ({}));
        this.baseUrl = baseUrl;
        return {
          messageId: data?.id || data?.messageId || `wa_${Date.now()}`,
          status: "SENT",
          recipientJid: chatId,
          isSimulation: false,
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    if (lastError.includes("is not registered")) {
      console.warn(`[OpenWA] Recipient ${chatId} does not have an active WhatsApp account.`);
    } else {
      console.error(`[OpenWA] Failed to dispatch text to ${chatId}:`, lastError);
    }
    return {
      messageId: "",
      status: "FAILED",
      recipientJid: chatId,
      isSimulation: false,
      error: lastError,
    };
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
    if (!this.isConfigured()) {
      return {
        sessionId: this.sessionId,
        status: "SIMULATION",
        isSimulation: true,
      };
    }

    const baseUrl = this.getBaseUrl();
    const apiKey = this.getApiKey();
    const sessionId = this.getSessionId();
    const targetSessionId = await this.getActiveSessionId();
    const url = `${baseUrl}/sessions/${encodeURIComponent(targetSessionId)}`;
    try {
      const res = await fetch(url, {
        headers: { "X-API-Key": apiKey },
      });
      if (!res.ok) {
        return { sessionId, status: "DISCONNECTED", isSimulation: false };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      return {
        sessionId,
        status: data?.status || "CONNECTED",
        phone: data?.phone || data?.me?.id,
        isSimulation: false,
      };
    } catch {
      return { sessionId, status: "DISCONNECTED", isSimulation: false };
    }
  }
}

export const openwaClient = new OpenWAClient();

