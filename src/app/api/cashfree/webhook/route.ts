import { dbRouter } from "@/../backend/database/router/db-router";
import { NextResponse } from "next/server";
import { cashfreeClient } from "../../../../../backend/payments/cashfree";
import { dbManager } from "../../../../../backend/database/client";

export const runtime = "nodejs";

/**
 * GET /api/cashfree/webhook
 * Health check endpoint for Cashfree dashboard test ping and connectivity verification.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "ThinkOva Cashfree Webhook Listener",
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/cashfree/webhook
 * Receives payment status webhooks from Cashfree, verifies signature, updates orders, and dispatches alerts.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("x-webhook-signature") || "";
  const timestamp = request.headers.get("x-webhook-timestamp") || "";

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Failed to read request payload" }, { status: 400 });
  }

  // Handle Cashfree dashboard setup test ping gracefully
  if (!signature && (!rawBody || rawBody === "{}" || rawBody === JSON.stringify({ test: true }))) {
    return NextResponse.json({ status: "ok", message: "Cashfree test ping acknowledged" });
  }

  // 1. [SEC-05] Strict Webhook Signature Enforcement:
  // Reject unverified webhooks if server secret is not configured, or if signature/timestamp is missing or invalid.
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!secretKey || secretKey.trim().length === 0) {
    console.error(
      "[Cashfree Webhook] Webhook secret key (CASHFREE_SECRET_KEY) is not configured on server. Rejecting unverified payload."
    );
    return NextResponse.json(
      {
        error: "Webhook signature verification unavailable: CASHFREE_SECRET_KEY is not configured.",
        code: "ERR_WEBHOOK_SECRET_UNSET",
      },
      { status: 401 }
    );
  }

  if (!signature || !timestamp) {
    console.warn(
      "[Cashfree Webhook] Rejected incoming payload: missing x-webhook-signature or x-webhook-timestamp header."
    );
    return NextResponse.json(
      {
        error: "Missing required webhook authentication headers (x-webhook-signature, x-webhook-timestamp).",
        code: "ERR_MISSING_WEBHOOK_SIGNATURE",
      },
      { status: 401 }
    );
  }

  const isValid = cashfreeClient.verifyWebhookSignature(signature, rawBody, timestamp);
  if (!isValid) {
    console.warn(
      "[Cashfree Webhook] Rejected incoming payload with invalid HMAC signature or expired timestamp."
    );
    return NextResponse.json(
      {
        error: "Invalid webhook signature or expired timestamp.",
        code: "ERR_INVALID_WEBHOOK_SIGNATURE",
      },
      { status: 401 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 });
  }

  // Support both Cashfree v2023-08-01 nested structure and legacy payload formats
  const eventType: string = payload?.type || payload?.event || "";
  const refundData = payload?.data?.refund || payload?.refund || null;

  // Handle Cashfree Refund Status Webhooks (REFUND_STATUS_WEBHOOK)
  if (eventType === "REFUND_STATUS_WEBHOOK" || refundData) {
    const merchantRefundId: string = String(refundData?.refund_id || payload?.refundId || "").trim();
    const cfRefundId: string = String(refundData?.cf_refund_id || "").trim();
    const rawRefundStatus: string = String(refundData?.refund_status || "").toUpperCase();

    console.info(
      `[Cashfree Webhook] Refund event '${eventType}' received for Refund '${merchantRefundId || cfRefundId}' (Status: ${rawRefundStatus})`
    );

    if (!merchantRefundId && !cfRefundId) {
      return NextResponse.json({ error: "Missing refund_id in refund webhook data" }, { status: 422 });
    }

    const existingRefund =
      (merchantRefundId ? await dbManager.commerce.getRefundById(merchantRefundId) : null) ||
      (cfRefundId ? await dbManager.commerce.getRefundByGatewayId(cfRefundId) : null);

    if (!existingRefund) {
      return NextResponse.json({ error: "Unknown refund" }, { status: 404 });
    }

    const mappedStatus =
      rawRefundStatus === "SUCCESS"
        ? "COMPLETED"
        : rawRefundStatus === "CANCELLED" || rawRefundStatus === "FAILED"
        ? "FAILED"
        : "PROCESSING";

    try {
      const updated = await dbRouter.commerceTransaction(async () => {
        return await dbManager.commerce.applyRefundLifecycleStatus({
          refundId: existingRefund.id,
          status: mappedStatus,
          gatewayRefundId: cfRefundId || existingRefund.gatewayRefundId,
        });
      });

      return NextResponse.json({
        status: "success",
        event: "REFUND_STATUS_UPDATED",
        refundId: existingRefund.id,
        refundStatus: updated?.status || mappedStatus,
      });
    } catch {
      return NextResponse.json({ error: "Refund status update pending" }, { status: 503 });
    }
  }

  const orderData = payload?.data?.order || payload?.order || {};
  const paymentData = payload?.data?.payment || payload?.payment || {};

  const orderId: string = orderData?.order_id || payload?.orderId || "";
  const paymentStatus: string = paymentData?.payment_status || orderData?.order_status || "";
  const paymentId: string = String(paymentData?.cf_payment_id || "");
  const amountPaidInPaise: number = Math.round(
    Number(paymentData?.payment_amount) * 100
  );

  console.info(
    `[Cashfree Webhook] Event '${eventType}' received for Order '${orderId}' (Status: ${paymentStatus})`
  );

  if (!orderId) {
    return NextResponse.json({ error: "Missing order_id in webhook data" }, { status: 422 });
  }

  // Check order in dynamic database
  const order = await dbManager.commerce.getOrderById(orderId).catch(() => undefined);
  if (order === undefined) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  if (!order) return NextResponse.json({ error: "Unknown order" }, { status: 404 });
  if (paymentStatus !== "SUCCESS") return NextResponse.json({ status: "acknowledged" });
  if (eventType !== "PAYMENT_SUCCESS_WEBHOOK" || !paymentId || amountPaidInPaise !== order.amountInPaise || paymentData.payment_currency !== "INR" || (orderData.order_currency && orderData.order_currency !== "INR")) {
    return NextResponse.json({ error: "Payment does not match order" }, { status: 422 });
  }
  try {
    await dbRouter.commerceTransaction(async () => {
      const current = await dbManager.commerce.getOrderById(orderId);
      if (!current) throw new Error("Order unavailable");
      if (current.status === "PAID") return;
      await dbManager.commerce.confirmOrderAndEnrollment({
        orderId, paymentId, amountInPaise: amountPaidInPaise,
        gatewayOrderId: String(orderData.cf_order_id || orderId),
        paymentMethod: paymentData.payment_group,
      });
    });
  } catch {
    return NextResponse.json({ error: "Payment confirmation pending" }, { status: 503 });
  }
  return NextResponse.json({ status: "success", event: "PAYMENT_CONFIRMED", orderId });
}
