import { NextResponse } from "next/server";
import { cashfreeClient } from "../../../../../backend/payments/cashfree";
import { dbManager } from "../../../../../backend/database/client";
import { defaultDispatcher } from "../../../../../backend/notifications/dispatcher";
import { emailTemplates } from "../../../../../backend/templates/email-templates";
import { whatsappTemplates } from "../../../../../backend/templates/whatsapp-templates";

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
  if (!signature && (!rawBody || rawBody === "{}" || rawBody.toLowerCase().includes("test"))) {
    return NextResponse.json({ status: "ok", message: "Cashfree test ping acknowledged" });
  }

  // 1. Verify Webhook Signature (Dynamic: enforces when credentials exist, allows test pings in simulation)
  if (cashfreeClient.isConfigured()) {
    const isValid = cashfreeClient.verifyWebhookSignature(signature, rawBody, timestamp);
    if (!isValid) {
      console.warn("[Cashfree Webhook] Rejected incoming payload with invalid HMAC signature.");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
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
  const orderData = payload?.data?.order || payload?.order || {};
  const paymentData = payload?.data?.payment || payload?.payment || {};

  const orderId: string = orderData?.order_id || payload?.orderId || "";
  const paymentStatus: string = paymentData?.payment_status || orderData?.order_status || "";
  const paymentId: string = String(paymentData?.cf_payment_id || `cf_pay_${Date.now()}`);
  const amountPaidInPaise: number = Math.round(
    (paymentData?.payment_amount || orderData?.order_amount || 4999) * 100
  );

  console.info(
    `[Cashfree Webhook] Event '${eventType}' received for Order '${orderId}' (Status: ${paymentStatus})`
  );

  if (!orderId) {
    return NextResponse.json({ error: "Missing order_id in webhook data" }, { status: 422 });
  }

  // Check order in dynamic database
  const order = await dbManager.commerce.getOrderById(orderId);
  const enrollment = order ? await dbManager.commerce.getEnrollmentById(order.enrollmentId) : null;
  const user = order ? await dbManager.commerce.getUserById(order.userId) : null;
  const student = enrollment ? await dbManager.commerce.getStudentById(enrollment.studentId) : null;

  // 2. Handle Payment Success
  if (
    eventType === "PAYMENT_SUCCESS_WEBHOOK" ||
    paymentStatus === "SUCCESS" ||
    paymentStatus === "PAID"
  ) {
    // Confirm order, record payment, activate enrollment, and initialize curriculum milestones & progress
    const joined = await dbManager.commerce.confirmOrderAndEnrollment({
      orderId,
      gatewayOrderId: String(orderData?.cf_order_id || orderId),
      paymentId,
      paymentMethod: (paymentData?.payment_group as any) || "UPI",
      amountInPaise: amountPaidInPaise,
    });

    const enrolledUser = joined.user;
    const enrolledStudent = joined.student;
    const enrolledEnrollment = joined.enrollment;
    const enrolledBatch = joined.batch;
    const enrolledCourse = joined.course;

    // Dispatch Confirmation Notifications
    if (enrolledUser && enrolledStudent && enrolledEnrollment) {
      const school = await dbManager.schools.findByUid(enrolledEnrollment.schoolUid);
      const tutor = enrolledBatch ? await dbManager.schools.getTutor(enrolledBatch.tutorId) : null;

      const email = emailTemplates.enrolmentSuccess({
        parentName: enrolledUser.username || "Parent",
        studentName: enrolledStudent.fullName,
        currentGrade: enrolledStudent.currentGrade,
        schoolName: school?.officialName || enrolledEnrollment.schoolUid,
        batchSchedule: enrolledBatch ? `${enrolledBatch.dayOfWeek}s ${enrolledBatch.startTime}` : "Weekly Lab Sessions",
        tutorName: tutor?.fullName || "Lead AI Mentor",
        amountPaid: `₹${(amountPaidInPaise / 100).toLocaleString("en-IN")}`,
        orderId,
      });

      const wa = whatsappTemplates.enrolmentConfirmed({
        parentPhone: enrolledUser.phone,
        parentName: enrolledUser.username || "Parent",
        studentName: enrolledStudent.fullName,
        schoolName: school?.officialName || enrolledEnrollment.schoolUid,
        grade: enrolledStudent.currentGrade,
        orderId,
        amountPaid: `₹${(amountPaidInPaise / 100).toLocaleString("en-IN")}`,
        startDate: enrolledBatch ? `${enrolledBatch.dayOfWeek}s ${enrolledBatch.startTime}` : "Next Session",
      });

      // Dispatch Email via SMTP / Graph
      await defaultDispatcher.sendEmail({
        to: enrolledUser.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        metadata: { orderId, eventType, gateway: "CASHFREE", courseId: enrolledCourse?.id },
      });

      // Dispatch WhatsApp
      await defaultDispatcher.sendWhatsApp({
        to: enrolledUser.phone,
        templateName: wa.templateName,
        fallbackText: wa.fallbackText,
        components: wa.components,
        metadata: { orderId, eventType, gateway: "CASHFREE", courseId: enrolledCourse?.id },
      });

      await dbManager.commerce.markAlertSent("ENROLMENT", orderId);
    }

    return NextResponse.json({
      status: "success",
      event: "PAYMENT_CONFIRMED",
      orderId,
      studentId: enrolledStudent?.id,
      courseId: enrolledCourse?.id,
      processedAt: new Date().toISOString(),
    });
  }

  // 3. Handle Payment Failure
  if (
    eventType === "PAYMENT_FAILED_WEBHOOK" ||
    paymentStatus === "FAILED" ||
    paymentStatus === "USER_DROPPED"
  ) {
    const failureReason = paymentData?.payment_message || "Transaction declined by issuing bank/UPI";
    await dbManager.commerce.updateOrderStatus(orderId, "FAILED", failureReason);

    if (user && student && order) {
      const email = emailTemplates.paymentFailure({
        parentName: user.username || "Parent",
        studentName: student.fullName,
        amount: `₹${(order.amountInPaise / 100).toLocaleString("en-IN")}`,
        failureReason,
        retryUrl: order.checkoutUrl,
      });

      await defaultDispatcher.sendEmail({
        to: user.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        metadata: { orderId, failureReason, gateway: "CASHFREE" },
      });

      await dbManager.commerce.markAlertSent("PAYMENT_FAILURE", orderId);
    }

    return NextResponse.json({
      status: "acknowledged",
      event: "PAYMENT_FAILED",
      orderId,
      failureReason,
    });
  }

  return NextResponse.json({
    status: "acknowledged",
    event: eventType,
    orderId,
  });
}
