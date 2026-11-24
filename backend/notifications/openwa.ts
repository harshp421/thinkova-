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

/**
 * Safely resolves environment variables with fallback.
 */
function getEnvFresh(key: string, defaultValue: string = ""): string {
  const envVal = process.env[key]?.trim();
  if (envVal) {
    if (envVal.includes("127.0.0.1") || envVal.includes("localhost")) {
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

  constructor(apiKey?: string, baseUrl?: string, sessionId?: string) {
    this.apiKey = apiKey !== undefined ? apiKey : getEnvFresh("OPENWA_API_KEY", "");
    this.baseUrl = this.normalizeUrl(baseUrl || getEnvFresh("OPENWA_API_URL", "http://172.169.233.17:8008/api"));
    this.sessionId = sessionId || getEnvFresh("OPENWA_SESSION_ID", "thinkova-notifications");
  }

  private normalizeUrl(url: string): string {
    let clean = (url || "").trim().replace(/\/$/, "");
    if (!clean) return "http://172.169.233.17:8008/api";
    if (clean.includes("127.0.0.1") || clean.includes("localhost")) {
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
    if (this.apiKey !== undefined && this.apiKey !== "") return this.apiKey.trim();
    if (this.apiKey === "") return "";
    return getEnvFresh("OPENWA_API_KEY", "").trim();
  }

  private getSessionId(): string {
    if (this.sessionId !== undefined && this.sessionId !== "") return this.sessionId.trim();
    return getEnvFresh("OPENWA_SESSION_ID", "thinkova-notifications").trim();
  }

  private getCandidateBaseUrls(): string[] {
    const configured = this.getBaseUrl();
    const urls: string[] = [configured];

    // Deployed production VM WhatsApp gateway endpoint
    urls.push("http://172.169.233.17:8008/api");

    return Array.from(new Set(urls.map((u) => this.normalizeUrl(u))));
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
        const headers: Record<string, string> = {};
        if (apiKey) headers["X-API-Key"] = apiKey;
        const res = await fetch(`${baseUrl}/sessions`, {
          headers,
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const raw: any = await res.json().catch(() => null);
          const list: any[] = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? [raw] : []);
          const found =
            list.find((s) => s.id === configuredSessionId || s.name === configuredSessionId) ||
            list.find((s) => s.status === "WORKING" || s.status === "ready" || s.status === "connected") ||
            list[0];
          if (found) {
            // OpenWA session routes strictly require the session UUID id, NOT the name
            this.resolvedSessionId = found.id || found.name;
            this.baseUrl = baseUrl;
            return this.resolvedSessionId as string;
          }
        }
      } catch {
        // Try next candidate base URL
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
        this.baseUrl = baseUrl;
        return {
          messageId: data?.id || data?.messageId || `wa_${Date.now()}`,
          status: "SENT",
          recipientJid: chatId,
          isSimulation: false,
        };
      } catch (err: unknown) {
        const cause = (err as any)?.cause?.code || (err as any)?.cause?.message || "";
        lastError = cause ? `${(err as Error).message} (${cause} on ${url})` : (err as Error).message;

        // If it's a 4xx error (e.g. invalid phone number) other than 404 session not found, don't keep cycling
        if (lastError.includes("OpenWA HTTP 4") && !lastError.includes("404") && !lastError.includes("not active")) {
          break;
        }
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

    const apiKey = this.getApiKey();
    const targetSessionId = await this.getActiveSessionId();
    const candidates = this.getCandidateBaseUrls();
    let lastError = "";

    for (const baseUrl of candidates) {
      const url = `${baseUrl}/sessions/${encodeURIComponent(targetSessionId)}/messages/send-media`;
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (apiKey) headers["X-API-Key"] = apiKey;
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            chatId,
            mediaUrl,
            filename,
            caption: caption || filename,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`OpenWA HTTP ${res.status}: ${errText}`);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json().catch(() => ({}));
        this.baseUrl = baseUrl;
        return {
          messageId: data?.id || `wa_media_${Date.now()}`,
          status: "SENT",
          recipientJid: chatId,
          isSimulation: false,
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
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

    const targetSessionId = await this.getActiveSessionId();
    const candidates = this.getCandidateBaseUrls();

    for (const baseUrl of candidates) {
      const url = `${baseUrl}/sessions/${encodeURIComponent(targetSessionId)}`;
      try {
        const headers: Record<string, string> = {};
        if (apiKey) headers["X-API-Key"] = apiKey;
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data: any = await res.json();
          this.baseUrl = baseUrl;
          const rawStatus = data?.status;
          let mappedStatus: OpenWASessionStatus["status"] = "CONNECTED";
          if (rawStatus === "ready" || rawStatus === "WORKING" || rawStatus === "connected") {
            mappedStatus = "WORKING";
          } else if (rawStatus === "QR_READY" || rawStatus === "SCAN_QR_CODE") {
            mappedStatus = "QR_READY";
          } else if (rawStatus === "STARTING") {
            mappedStatus = "STARTING";
          } else if (rawStatus === "STOPPED") {
            mappedStatus = "STOPPED";
          } else if (rawStatus === "DISCONNECTED") {
            mappedStatus = "DISCONNECTED";
          }

          return {
            sessionId: targetSessionId,
            status: mappedStatus,
            phone: data?.phone || data?.me?.id,
            isSimulation: false,
          };
        }
      } catch {
        // Try next candidate
      }
    }

    return { sessionId: targetSessionId, status: "DISCONNECTED", isSimulation: false };
  }
}

export const openwaClient = new OpenWAClient();

