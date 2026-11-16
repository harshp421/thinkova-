import { NextResponse } from "next/server";
import { cashfreeClient } from "../../../../../backend/payments/cashfree";
import { dbManager } from "../../../../../backend/database/client";
import { defaultDispatcher } from "../../../../../backend/notifications/dispatcher";
import { emailTemplates } from "../../../../../backend/templates/email-templates";
import { whatsappTemplates } from "../../../../../backend/templates/whatsapp-templates";

export const runtime = "nodejs";

/**
 * POST /api/cashfree/simulate
 * Explicitly simulates a test payment callback for dev/staging environments
 * when Cashfree credentials are not configured in Azure.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId = body.orderId;
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    if (cashfreeClient.isConfigured()) {
      return NextResponse.json(
        { error: "Simulation not permitted when live Cashfree credentials are configured" },
        { status: 403 }
      );
    }

    const order = await dbManager.commerce.getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await dbManager.commerce.updateOrderStatus(orderId, "PAID");
    if (order.enrollmentId) {
      await dbManager.commerce.updateEnrollmentStatus(order.enrollmentId, "ENROLLED");
    }

    await dbManager.commerce.upsertPayment({
      id: `pay_${Date.now()}_sim`,
      orderId,
      gateway: "CASHFREE",
      gatewayOrderId: orderId,
      gatewayPaymentId: `cf_pay_sim_${Date.now()}`,
      paymentMethod: "UPI",
      amountInPaise: order.amountInPaise,
      status: "SUCCESS",
      paidAt: new Date(),
    });

    const user = await dbManager.commerce.getUserById(order.userId);
    const enrollment = order.enrollmentId
      ? await dbManager.commerce.getEnrollmentById(order.enrollmentId)
      : null;
    const student = enrollment
      ? await dbManager.commerce.getStudentById(enrollment.studentId)
      : null;

    if (user && student && enrollment) {
      const email = emailTemplates.enrolmentSuccess({
        parentName: user.username || "Parent",
        studentName: student.fullName,
        currentGrade: student.currentGrade,
        schoolName: student.schoolUid,
        batchSchedule: "Weekly Computer Lab Sessions",
        tutorName: "Lead AI Mentor",
        amountPaid: `₹${(order.amountInPaise / 100).toLocaleString("en-IN")}`,
        orderId,
      });

      await defaultDispatcher.sendEmail({
        to: user.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        metadata: { orderId, type: "ENROLMENT_RECEIPT" },
      });

      const wa = whatsappTemplates.enrolmentConfirmed({
        parentPhone: user.phone,
        parentName: user.username || "Parent",
        studentName: student.fullName,
        schoolName: student.schoolUid,
        grade: student.currentGrade,
        orderId,
        amountPaid: `₹${(order.amountInPaise / 100).toLocaleString("en-IN")}`,
        startDate: "the upcoming Saturday batch",
      });

      await defaultDispatcher.sendWhatsApp({
        to: user.phone,
        templateName: "thinkova_enrolment_confirmed",
        fallbackText: wa.fallbackText,
        metadata: { orderId, type: "ENROLMENT_RECEIPT" },
      });
    }

    return NextResponse.json({ success: true, orderId, status: "PAID" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
