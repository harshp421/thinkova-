import crypto from "crypto";

export interface CashfreeCustomerDetails {
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

export interface CashfreeCreateOrderInput {
  orderId: string;
  orderAmount: number; // in INR (e.g. 4999.00 or 2499.00)
  orderCurrency?: string; // defaults to INR
  customer: CashfreeCustomerDetails;
  orderNote?: string;
  returnUrl?: string;
  notifyUrl?: string;
}

export interface CashfreeOrderResult {
  orderId: string;
  cfOrderId: string;
  paymentSessionId: string;
  orderStatus: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED";
  orderAmount: number;
  orderCurrency: string;
  environment: "SANDBOX" | "PRODUCTION";
  isSimulation?: false;
  checkoutUrl?: string;
}

export interface CashfreeGetOrderResult {
  orderId: string;
  cfOrderId: string;
  orderStatus: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED";
  orderAmount: number;
  orderCurrency: string;
  isSimulation?: false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw?: any;
}

export class CashfreeClient {
  /**
   * Checks whether live credentials have been added to environment
   */
  public isConfigured(): boolean {
    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    return Boolean(appId && secretKey && appId.trim().length > 0 && secretKey.trim().length > 0);
  }

  /**
   * Resolves target Cashfree API base endpoint
   */
  public getBaseUrl(): string {
    const env = (process.env.CASHFREE_ENV || "SANDBOX").toUpperCase();
    if (env === "PRODUCTION" || env === "PROD") {
      return "https://api.cashfree.com/pg";
    }
    return "https://sandbox.cashfree.com/pg";
  }

  public getApiVersion(): string {
    return process.env.CASHFREE_API_VERSION || "2023-08-01";
  }

  /**
   * Sanitized summary for diagnostics and monitoring
   */
  public getConfigSummary() {
    const configured = this.isConfigured();
    const env = (process.env.CASHFREE_ENV || "SANDBOX").toUpperCase();
    const appId = process.env.CASHFREE_APP_ID;
    const maskedAppId = appId ? `${appId.slice(0, 4)}...${appId.slice(-4)}` : undefined;

    return {
      configured,
      mode: configured ? env : "UNCONFIGURED",
      environment: env,
      apiVersion: this.getApiVersion(),
      appIdMasked: maskedAppId,
      baseUrl: this.getBaseUrl(),
      instructions: configured
        ? "Cashfree live credentials active."
        : "Add CASHFREE_APP_ID and CASHFREE_SECRET_KEY to Azure environment variables to activate live gateway.",
    };
  }

  /**
   * Creates an order with Cashfree.
   * Calls the live Cashfree PG Orders API v2023-08-01.
   */
  public async createOrder(input: CashfreeCreateOrderInput): Promise<CashfreeOrderResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "Cashfree payment gateway credentials are not configured on the server. CASHFREE_APP_ID and CASHFREE_SECRET_KEY must be set in server environment variables."
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.thinkova.ai";
    const isProd = (process.env.CASHFREE_ENV || "").toUpperCase() === "PRODUCTION";

    let returnUrl =
      input.returnUrl ||
      (siteUrl.startsWith("https://")
        ? `${siteUrl}/confirmation?order_id={order_id}`
        : "https://www.thinkova.ai/confirmation?order_id={order_id}");

    // Cashfree PG Orders API strictly mandates that order_meta.return_url MUST be https://
    if (!returnUrl.startsWith("https://")) {
      if (returnUrl.startsWith("http://localhost") || returnUrl.startsWith("http://127.0.0.1")) {
        const query = returnUrl.includes("?") ? returnUrl.slice(returnUrl.indexOf("?")) : "?order_id={order_id}";
        returnUrl = `https://www.thinkova.ai/confirmation${query}`;
      } else {
        returnUrl = returnUrl.replace(/^http:\/\//i, "https://");
      }
    }

    let notifyUrl =
      input.notifyUrl ||
      (siteUrl.startsWith("https://")
        ? `${siteUrl}/api/cashfree/webhook`
        : "https://www.thinkova.ai/api/cashfree/webhook");

    if (notifyUrl && !notifyUrl.startsWith("https://")) {
      notifyUrl = notifyUrl.replace(/^http:\/\//i, "https://");
    }

    // Clean customer phone strictly to valid 10-digit Indian domestic mobile number
    const rawDigits = (input.customer.customerPhone || "").replace(/\D/g, "");
    let cleanPhone = rawDigits;
    if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
      cleanPhone = cleanPhone.slice(2);
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith("0")) {
      cleanPhone = cleanPhone.slice(1);
    }
    if (cleanPhone.length > 10) {
      cleanPhone = cleanPhone.slice(-10);
    }
    if (cleanPhone.length < 10) {
      cleanPhone = cleanPhone.padStart(10, "9");
    }

    // Clean customer name and ID
    const customerName = (input.customer.customerName || "ThinkOva Parent").trim() || "ThinkOva Parent";
    const customerId = (input.customer.customerId || `cust_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);

    // Live Cashfree PG Orders API v2023-08-01
    const url = `${this.getBaseUrl()}/orders`;
    const payload = {
      order_id: input.orderId,
      order_amount: input.orderAmount,
      order_currency: input.orderCurrency || "INR",
      customer_details: {
        customer_id: customerId,
        customer_name: customerName,
        customer_email: input.customer.customerEmail,
        customer_phone: cleanPhone,
      },
      order_meta: {
        return_url: returnUrl,
        notify_url: notifyUrl,
        payment_methods: "upi,cc,dc,nb",
      },
      order_note: input.orderNote || "ThinkOva AI Program Admission",
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-version": this.getApiVersion(),
        "x-client-id": process.env.CASHFREE_APP_ID || "",
        "x-client-secret": process.env.CASHFREE_SECRET_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Cashfree] Failed to create order (${res.status}): ${errText}`);
      throw new Error(`Cashfree Order Creation Failed (${res.status}): ${errText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;

    const directCheckoutUrl = isProd
      ? `https://payments.cashfree.com/order/#${data.payment_session_id}`
      : `https://payments-test.cashfree.com/order/#${data.payment_session_id}`;

    return {
      orderId: data.order_id,
      cfOrderId: String(data.cf_order_id),
      paymentSessionId: data.payment_session_id,
      orderStatus: data.order_status || "ACTIVE",
      orderAmount: data.order_amount,
      orderCurrency: data.order_currency || "INR",
      environment: isProd ? "PRODUCTION" : "SANDBOX",
      isSimulation: false,
      checkoutUrl: directCheckoutUrl,
    };
  }

  /**
   * Retrieves order status from Cashfree
   */
  public async getOrder(orderId: string): Promise<CashfreeGetOrderResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "Cashfree payment gateway credentials are not configured on the server."
      );
    }

    const url = `${this.getBaseUrl()}/orders/${encodeURIComponent(orderId)}`;
    const res = await fetch(url, {
      headers: {
        "x-api-version": this.getApiVersion(),
        "x-client-id": process.env.CASHFREE_APP_ID || "",
        "x-client-secret": process.env.CASHFREE_SECRET_KEY || "",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cashfree Get Order Failed (${res.status}): ${errText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    return {
      orderId: data.order_id,
      cfOrderId: String(data.cf_order_id),
      orderStatus: data.order_status,
      orderAmount: data.order_amount,
      orderCurrency: data.order_currency,
      isSimulation: false,
      raw: data,
    };
  }

  /**
   * Verifies Cashfree webhook signature using HMAC-SHA256 and validates
   * timestamp freshness within a 5-minute window to prevent replay attacks.
   */
  public verifyWebhookSignature(
    signature: string,
    rawBody: string,
    timestamp: string,
    maxAgeMs: number = 5 * 60 * 1000
  ): boolean {
    const secret = process.env.CASHFREE_SECRET_KEY;
    if (!secret) {
      return false;
    }

    // 1. Replay attack prevention: validate timestamp freshness (5-minute sliding window)
    if (maxAgeMs > 0) {
      const tsNum = Number(timestamp);
      if (!timestamp || isNaN(tsNum) || tsNum <= 0) {
        console.warn("[Cashfree] Missing or invalid webhook timestamp:", timestamp);
        return false;
      }

      // Support both epoch seconds (10-digit) and epoch milliseconds (13-digit)
      const tsMs = tsNum > 1e11 ? tsNum : tsNum * 1000;
      const ageMs = Math.abs(Date.now() - tsMs);

      if (ageMs > maxAgeMs) {
        console.warn(
          `[Cashfree] Webhook timestamp expired: age ${Math.round(ageMs / 1000)}s exceeds tolerance ${maxAgeMs / 1000}s`
        );
        return false;
      }
    }

    // 2. Cryptographic signature verification using timing-safe comparison
    try {
      const signatureData = `${timestamp}${rawBody}`;
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(signatureData)
        .digest("base64");

      const expectedBuf = Buffer.from(expectedSignature, "base64");
      const actualBuf = Buffer.from(signature, "base64");

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch (err) {
      console.error("[Cashfree] Signature verification exception:", err);
      return false;
    }
  }
}

export const cashfreeClient = new CashfreeClient();
