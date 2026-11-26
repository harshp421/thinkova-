import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { dbManager, dbRouter } from "@/../backend/database/client";
import { cashfreeClient } from "@/../backend/payments/cashfree";
import { getSessionFromRequest } from "@/lib/auth-session";

async function getInstallment(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const enrollmentId = new URL(request.url).searchParams.get("enrollmentId")?.trim();
  const enrollment = enrollmentId && await dbManager.commerce.getEnrollmentById(enrollmentId);
  const student = enrollment && await dbManager.commerce.getStudentById(enrollment.studentId);
  if (!enrollment || !student || student.parentUserId !== session.userId) {
    return NextResponse.json({ error: "Enrollment unavailable" }, { status: 404 });
  }

  const amountInPaise = await dbManager.commerce.getInstallmentBalance(enrollment, session.userId);
  if (!amountInPaise) return NextResponse.json({ error: "There is no payable second installment." }, { status: 409 });
  return { enrollment, student, session, amountInPaise };
}

export async function GET(request: Request) {
  const result = await getInstallment(request);
  if (result instanceof NextResponse) return result;
  const batch = await dbManager.schools.getBatch(result.enrollment.cohortBatchId);
  return NextResponse.json({
    amount: result.amountInPaise / 100,
    studentName: result.student.fullName,
    dueDate: batch?.level5Date,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  try {
    const result = await getInstallment(request);
    if (result instanceof NextResponse) return result;

    const { enrollment, session, amountInPaise } = result;
    const user = await dbManager.commerce.getUserById(session.userId);
    if (!user?.phone) return NextResponse.json({ error: "Add a phone number to your account before paying." }, { status: 422 });
    const orderBase = "part2_" + createHash("sha256").update(enrollment.id).digest("hex").slice(0, 32);
    for (let attempt = 0; attempt < 5; attempt++) {
      const orderId = attempt === 0 ? orderBase : `${orderBase}_${attempt}`;
      const savedOrder = await dbRouter.commerceTransaction(async () => {
        const existing = await dbManager.commerce.getOrderById(orderId);
        if (existing) return existing;
        const order = {
          id: orderId, enrollmentId: enrollment.id, userId: user.id, orderType: "INSTALLMENT_2" as const,
          amountInPaise, status: "AWAITING_PAYMENT" as const, checkoutUrl: "",
          createdAt: new Date(), expiresAt: new Date(Date.now() + 86400000),
        };
        await dbManager.commerce.upsertOrder(order);
        return order;
      });
      if (savedOrder.status === "PAID") return NextResponse.json({ error: "This installment has been paid." }, { status: 409 });
      if (savedOrder.status === "FAILED") continue;
      const input = {
        orderId, orderAmount: savedOrder.amountInPaise / 100, orderCurrency: "INR",
        customer: { customerId: user.id, customerName: user.fullName || user.username, customerEmail: user.email, customerPhone: user.phone },
        orderNote: "ThinkOva second installment",
      };
      // Cashfree enforces one gateway order per ID. Reuse it if a previous request created it.
      try {
        const payment = await cashfreeClient.createOrder(input);
        if (!payment.paymentSessionId) throw new Error("Installment checkout unavailable");
        return NextResponse.json({ paymentSessionId: payment.paymentSessionId, environment: payment.environment });
      } catch {
        const existing = await cashfreeClient.getOrder(orderId);
        if (["EXPIRED", "TERMINATED"].includes(existing.orderStatus)) {
          await dbRouter.commerceTransaction(async () => {
            const current = await dbManager.commerce.getOrderById(orderId);
            if (current?.status === "AWAITING_PAYMENT") await dbManager.commerce.updateOrderStatus(orderId, "FAILED");
          });
          continue;
        }
        const sessionId = existing.raw?.payment_session_id;
        if (existing.orderStatus !== "ACTIVE" || existing.orderAmount !== input.orderAmount || typeof sessionId !== "string" || !sessionId) {
          throw new Error("Installment checkout unavailable");
        }
        return NextResponse.json({ paymentSessionId: sessionId, environment: cashfreeClient.getConfigSummary().mode });
      }
    }
    return NextResponse.json({ error: "Contact ThinkOva support to reopen installment checkout." }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "Unable to start installment checkout. Please try again." }, { status: 502 });
  }
}
