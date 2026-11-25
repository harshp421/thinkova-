import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { cashfreeClient } from "../../../../../backend/payments/cashfree";
import { dbManager, dbRouter } from "../../../../../backend/database/client";
import type { RefundEntity } from "../../../../../backend/database/types";

export const runtime = "nodejs";

const ALLOWED_REASONS = new Set<RefundEntity["reason"]>([
  "DEMO_DAY_GUARANTEE",
  "CLIENT_WITHDRAWAL",
  "BATCH_CANCELLED",
]);

interface CreateRefundBody {
  orderId?: string;
  reason?: RefundEntity["reason"];
  refundAmountInRupees?: number;
  refundSpeed?: "STANDARD" | "INSTANT";
  note?: string;
}

/**
 * POST /api/cashfree/refund
 * Initiates a verified Cashfree refund for a PAID order, enforces single-refund idempotency,
 * persists the RefundEntity atomically, and updates enrollment/payment state if immediately completed.
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    let body: CreateRefundBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const orderId = String(body.orderId || "").trim();
    if (!orderId) {
      return NextResponse.json({ error: "Missing required field: orderId" }, { status: 422 });
    }

    if (!cashfreeClient.isConfigured()) {
      return NextResponse.json(
        {
          status: "error",
          message: "Cashfree payment gateway is not configured on the server.",
        },
        { status: 503 }
      );
    }

    const order = await dbManager.commerce.getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const isAdmin = session.role === "SUPER_ADMIN";
    if (!isAdmin && order.userId !== session.userId) {
      return NextResponse.json({ error: "Order unavailable" }, { status: 404 });
    }

    if (order.status !== "PAID") {
      return NextResponse.json(
        { error: `Order ${orderId} is not eligible for refund (status: ${order.status}).` },
        { status: 409 }
      );
    }

    const [payment, enrollment] = await Promise.all([
      dbManager.commerce.getPaymentByOrderId(orderId),
      dbManager.commerce.getEnrollmentById(order.enrollmentId),
    ]);

    if (!payment || payment.status === "FAILED") {
      return NextResponse.json(
        { error: "No successful payment record found for this order." },
        { status: 409 }
      );
    }

    if (!enrollment) {
      return NextResponse.json({ error: "Enrollment not found for this order." }, { status: 404 });
    }

    const maxRefundRupees = order.amountInPaise / 100;
    const refundAmountRupees =
      body.refundAmountInRupees !== undefined ? Number(body.refundAmountInRupees) : maxRefundRupees;

    if (!Number.isFinite(refundAmountRupees) || refundAmountRupees <= 0 || refundAmountRupees > maxRefundRupees) {
      return NextResponse.json(
        {
          error: `Invalid refund amount: must be greater than 0 and at most ₹${maxRefundRupees}.`,
          code: "INVALID_REFUND_AMOUNT",
        },
        { status: 400 }
      );
    }

    const reason: RefundEntity["reason"] =
      body.reason && ALLOWED_REASONS.has(body.reason) ? body.reason : "DEMO_DAY_GUARANTEE";
    const initiatedBy: RefundEntity["initiatedBy"] = isAdmin ? "MANAGEMENT" : "CLIENT";
    const refundSpeed: "STANDARD" | "INSTANT" = body.refundSpeed === "INSTANT" ? "INSTANT" : "STANDARD";
    const refundId = `ref_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const amountInPaise = Math.round(refundAmountRupees * 100);

    // Atomically guard against concurrent double-refunds before calling Cashfree
    const claimed = await dbRouter.commerceTransaction(async () => {
      const existingRefunds = await dbManager.commerce.getRefundsByEnrollmentId(enrollment.id);
      const activeRefund = existingRefunds.find(
        (r) => r.status === "INITIATED" || r.status === "PROCESSING" || r.status === "COMPLETED"
      );
      if (activeRefund) {
        return { conflict: activeRefund };
      }

      const initialRefund: RefundEntity = {
        id: refundId,
        paymentId: payment.id,
        enrollmentId: enrollment.id,
        amountInPaise,
        reason,
        initiatedBy,
        status: "INITIATED",
        estimatedCreditDays: refundSpeed === "INSTANT" ? "1–2 business days" : "5–7 business days",
        initiatedAt: new Date(),
      };
      await dbManager.commerce.upsertRefund(initialRefund);
      return { conflict: null, refund: initialRefund };
    });

    if (claimed.conflict) {
      return NextResponse.json(
        {
          error: `A refund (${claimed.conflict.id}) is already ${claimed.conflict.status.toLowerCase()} for this enrollment.`,
          code: "REFUND_ALREADY_EXISTS",
          refundId: claimed.conflict.id,
        },
        { status: 409 }
      );
    }

    // Invoke Cashfree Refunds API; roll refund status to FAILED if gateway rejects
    let cfRefund;
    try {
      cfRefund = await cashfreeClient.createRefund({
        orderId,
        refundId,
        refundAmount: refundAmountRupees,
        refundNote: body.note || `ThinkOva Refund (${reason})`,
        refundSpeed,
      });
    } catch (gatewayErr: unknown) {
      await dbManager.commerce.applyRefundLifecycleStatus({
        refundId,
        status: "FAILED",
      });
      const message = gatewayErr instanceof Error ? gatewayErr.message : String(gatewayErr);
      return NextResponse.json({ status: "error", message }, { status: 502 });
    }

    const nextStatus: RefundEntity["status"] =
      cfRefund.refundStatus === "SUCCESS"
        ? "COMPLETED"
        : cfRefund.refundStatus === "FAILED" || cfRefund.refundStatus === "CANCELLED"
        ? "FAILED"
        : "INITIATED";

    const updatedRefund = await dbRouter.commerceTransaction(async () => {
      return await dbManager.commerce.applyRefundLifecycleStatus({
        refundId,
        status: nextStatus,
        gatewayRefundId: cfRefund.cfRefundId || refundId,
      });
    });

    return NextResponse.json({
      status: "success",
      refund: updatedRefund,
      gateway: {
        cfRefundId: cfRefund.cfRefundId,
        refundStatus: cfRefund.refundStatus,
        refundAmount: cfRefund.refundAmount,
        refundCurrency: cfRefund.refundCurrency,
        environment: cfRefund.environment,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Cashfree Refund API Error]:", err);
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}

/**
 * GET /api/cashfree/refund?refundId=... or ?orderId=...
 * Returns refund status for the owning parent or SUPER_ADMIN.
 */
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const refundId = searchParams.get("refundId")?.trim();
  const orderId = searchParams.get("orderId")?.trim();
  const isAdmin = session.role === "SUPER_ADMIN";

  if (refundId) {
    const refund = await dbManager.commerce.getRefundById(refundId);
    if (!refund) {
      return NextResponse.json({ error: "Refund unavailable" }, { status: 404 });
    }
    const enrollment = await dbManager.commerce.getEnrollmentById(refund.enrollmentId);
    const student = enrollment ? await dbManager.commerce.getStudentById(enrollment.studentId) : null;
    if (!isAdmin && student?.parentUserId !== session.userId) {
      return NextResponse.json({ error: "Refund unavailable" }, { status: 404 });
    }
    return NextResponse.json({
      status: "ok",
      refund,
      enrollmentStatus: enrollment?.status || null,
    });
  }

  if (orderId) {
    const order = await dbManager.commerce.getOrderById(orderId);
    if (!order || (!isAdmin && order.userId !== session.userId)) {
      return NextResponse.json({ error: "Order unavailable" }, { status: 404 });
    }
    const [refunds, enrollment] = await Promise.all([
      dbManager.commerce.getRefundsByEnrollmentId(order.enrollmentId),
      dbManager.commerce.getEnrollmentById(order.enrollmentId),
    ]);
    return NextResponse.json({
      status: "ok",
      orderId,
      refunds,
      enrollmentStatus: enrollment?.status || null,
    });
  }

  return NextResponse.json({ error: "Provide refundId or orderId query parameter." }, { status: 400 });
}
