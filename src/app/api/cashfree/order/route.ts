import { NextResponse } from "next/server";
import { cashfreeClient } from "../../../../../backend/payments/cashfree";
import { dbManager } from "../../../../../backend/database/client";

export const runtime = "nodejs";

interface CreateCashfreeOrderBody {
  orderId?: string;
  studentId?: string;
  studentName: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  schoolUid: string;
  grade?: number;
  paymentPlan?: "FULL" | "INSTALLMENTS";
  orderType?: "FULL_PAYMENT" | "INSTALLMENT_1" | "INSTALLMENT_2";
  amountInRupees?: number;
  courseId?: string;
  courseTitle?: string;
  trackId?: string;
  autoConfirm?: boolean;
  returnUrl?: string;
}

/**
 * POST /api/cashfree/order
 * Initiates an order with Cashfree and links student, course, and enrollment in MongoDB Atlas.
 */
export async function POST(request: Request) {
  let body: CreateCashfreeOrderBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    studentName,
    parentName,
    parentEmail,
    parentPhone,
    schoolUid,
    grade = 6,
    paymentPlan = "FULL",
    orderType = paymentPlan === "INSTALLMENTS" ? "INSTALLMENT_1" : "FULL_PAYMENT",
    courseId = "robotics-starter",
  } = body;

  if (!parentEmail || !parentPhone || !studentName || !schoolUid) {
    return NextResponse.json(
      { error: "Missing required fields: studentName, parentName, parentEmail, parentPhone, schoolUid" },
      { status: 422 }
    );
  }

  if (!cashfreeClient.isConfigured()) {
    return NextResponse.json(
      {
        status: "error",
        message: "Cashfree payment gateway is not configured on the server. Please contact ThinkOva support.",
      },
      { status: 503 }
    );
  }

  const defaultAmount = orderType === "FULL_PAYMENT" ? 4999 : 2499;
  const amount = body.amountInRupees || defaultAmount;
  const amountInPaise = Math.round(amount * 100);

  const orderId = body.orderId || `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const userId = `usr_${parentPhone.replace(/\D/g, "")}`;
  const enrollmentId = `enr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // 1. Ensure Parent User entity exists in thinkova_commerce.users
  let user = await dbManager.commerce.getUserById(userId);
  if (!user) {
    const newUser = {
      id: userId,
      phone: parentPhone,
      email: parentEmail,
      username: parentName,
      role: "PARENT" as const,
      isPhoneVerified: false,
      isEmailVerified: false,
      consentTimestamp: new Date(),
      createdAt: new Date(),
    };
    await dbManager.commerce.upsertUser(newUser);
    user = newUser;
  }

  // 2. Ensure Student entity exists in thinkova_commerce.students (re-use if provided)
  let studentId = body.studentId;
  let student = studentId ? await dbManager.commerce.getStudentById(studentId) : null;
  if (!student) {
    studentId = `stu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    student = {
      id: studentId,
      parentUserId: userId,
      fullName: studentName,
      schoolUid: schoolUid.toUpperCase().trim(),
      currentGrade: grade,
      preferredTrack: body.trackId || "robotics",
      createdAt: new Date(),
    };
    await dbManager.commerce.upsertStudent(student);
  } else {
    student.schoolUid = schoolUid.toUpperCase().trim();
    student.currentGrade = grade;
    await dbManager.commerce.upsertStudent(student);
  }

  // 2.5 Ensure School and Batch exist dynamically
  const school = await dbManager.schools.findByUid(schoolUid);
  if (!school) {
    await dbManager.schools.upsertSchool({
      id: `sch_${schoolUid.toLowerCase()}`,
      schoolUid: schoolUid.toUpperCase().trim(),
      officialName: `Partner School (${schoolUid.toUpperCase().trim()})`,
      slug: `school-${schoolUid.toLowerCase().trim()}`,
      city: process.env.NEXT_PUBLIC_CONTACT_CITY || "Pune",
      state: "Maharashtra",
      board: "CBSE",
      labCapacity: 25,
      partnerCommissionPct: 0,
      status: "ACTIVE",
      createdAt: new Date(),
    });
  }

  const batchId = `batch_${schoolUid.toLowerCase()}_01`;
  const existingBatch = await dbManager.schools.getBatch(batchId);
  if (!existingBatch) {
    await dbManager.schools.upsertBatch({
      id: batchId,
      schoolId: `sch_${schoolUid.toLowerCase()}`,
      tutorId: "tutor_lead_01",
      batchCode: `BATCH-${schoolUid.toUpperCase().trim()}-01`,
      gradeLevels: [grade],
      dayOfWeek: "Saturday",
      startTime: "10:00",
      endTime: "11:30",
      maxCapacity: 25,
      confirmedStudentsCount: 1,
      startDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      level5Date: new Date(Date.now() + 35 * 24 * 3600 * 1000),
      demoDayDate: new Date(Date.now() + 56 * 24 * 3600 * 1000),
      status: "UPCOMING",
      createdAt: new Date(),
    });
  }

  // 3. Create Enrollment entity with courseId connection in thinkova_commerce.enrollments
  const enrollment = {
    id: enrollmentId,
    studentId: student.id,
    cohortBatchId: batchId,
    courseId,
    schoolUid: schoolUid.toUpperCase().trim(),
    paymentPlan,
    status: "PENDING_PAYMENT" as const,
    currentLevel: 1,
    enrolledAt: new Date(),
    installment2Paid: false,
  };
  await dbManager.commerce.upsertEnrollment(enrollment);

  // 4. Create Cashfree Gateway Order
  try {
    const cfOrder = await cashfreeClient.createOrder({
      orderId,
      orderAmount: amount,
      orderCurrency: "INR",
      customer: {
        customerId: userId,
        customerName: parentName,
        customerEmail: parentEmail,
        customerPhone: parentPhone,
      },
      orderNote: `ThinkOva Course Admission - ${schoolUid.toUpperCase()} (${studentName})`,
      returnUrl: body.returnUrl,
    });

    const checkoutUrl = cfOrder.checkoutUrl || "";

    // 5. Persist Order in thinkova_commerce.orders
    await dbManager.commerce.upsertOrder({
      id: orderId,
      enrollmentId,
      userId,
      orderType,
      amountInPaise,
      status: "AWAITING_PAYMENT",
      checkoutUrl,
      expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
      createdAt: new Date(),
    });

    return NextResponse.json({
      status: "success",
      orderId: cfOrder.orderId,
      cfOrderId: cfOrder.cfOrderId,
      paymentSessionId: cfOrder.paymentSessionId,
      orderStatus: cfOrder.orderStatus,
      amount: cfOrder.orderAmount,
      currency: cfOrder.orderCurrency,
      environment: cfOrder.environment,
      checkoutUrl,
      enrollmentId,
      studentId,
      courseId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}

/**
 * GET /api/cashfree/order?orderId=...
 * Checks order status from Cashfree and triggers DB confirmation, inner-join relations & curriculum initialization.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "Missing required 'orderId' query parameter" }, { status: 422 });
  }

  const dbOrder = await dbManager.commerce.getOrderById(orderId);
  const cfOrder = await cashfreeClient.getOrder(orderId);

  // Check if Cashfree verifies that order is PAID or DB is marked PAID
  const isPaid = cfOrder.orderStatus === "PAID" || dbOrder?.status === "PAID";
  let joinedDetails = null;

  if (isPaid) {
    // Triggers payment storage, order confirmation, student enrollment, and course curriculum progress
    joinedDetails = await dbManager.commerce.confirmOrderAndEnrollment({
      orderId,
      gatewayOrderId: cfOrder.cfOrderId || orderId,
      paymentId: `cf_${Date.now()}`,
      paymentMethod: "UPI",
      amountInPaise: Math.round((cfOrder.orderAmount || 4999) * 100),
    });
  } else {
    joinedDetails = await dbManager.commerce.getOrderWithJoinedDetails(orderId);
  }

  return NextResponse.json({
    status: "ok",
    orderId,
    dbStatus: isPaid ? "PAID" : dbOrder?.status || "NOT_FOUND",
    cashfreeStatus: cfOrder.orderStatus,
    amount: cfOrder.orderAmount,
    currency: cfOrder.orderCurrency,
    isPaid,
    joinedDetails,
  });
}
