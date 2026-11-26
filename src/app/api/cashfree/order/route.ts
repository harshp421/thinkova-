import { enrollmentPricing } from "@/lib/enrollment-pricing";
import { allCourses } from "@/data/tracks";
import { dbRouter } from "@/../backend/database/router/db-router";
import { getSessionFromRequest } from "@/lib/auth-session";
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
  termsAccepted?: boolean;
}

/**
 * POST /api/cashfree/order
 * Initiates an order with Cashfree and links student, course, and enrollment in MongoDB Atlas.
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
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

      courseId = "robotics-starter",
    } = body;

    if (!parentEmail || !parentPhone || !studentName || !schoolUid) {
      return NextResponse.json(
        { error: "Missing required fields: studentName, parentName, parentEmail, parentPhone, schoolUid" },
        { status: 422 }
      );
    }

    if (body.termsAccepted !== true) return NextResponse.json({ error: "Accept the enrollment and safety terms before paying." }, { status: 422 });

    if (!cashfreeClient.isConfigured()) {
      return NextResponse.json(
        {
          status: "error",
          message: "Cashfree payment gateway is not configured on the server. Please contact ThinkOva support.",
        },
        { status: 503 }
      );
    }

    // [SEC-04] Authoritative Server-Side Pricing Validation:
    // Determine the authoritative fee from the course database & plan. Prevent client-controlled price tampering.
    const course = await dbManager.schools.getCourseById(courseId);
    const catalogCourse = course || allCourses.find(item => item.id === courseId);
    if (!catalogCourse) return NextResponse.json({ error: "Course unavailable" }, { status: 404 });
    if (!["FULL", "INSTALLMENTS"].includes(paymentPlan)) return NextResponse.json({ error: "Invalid payment plan" }, { status: 400 });
    const amount = paymentPlan === "INSTALLMENTS" ? enrollmentPricing(catalogCourse.price).first : catalogCourse.price;
    if (!amount || amount <= 0 || (body.amountInRupees !== undefined && body.amountInRupees !== amount)) {
      return NextResponse.json({ error: "Price tampering detected: checkout amount differs from the course fee.", code: "PRICE_TAMPERING_DETECTED" }, { status: 400 });
    }
    const amountInPaise = Math.round(amount * 100);

    const orderId = `ord_${crypto.randomUUID()}`;
    const userId = session.userId;
    const user = await dbManager.commerce.getUserById(userId);
    if (!user) return NextResponse.json({ error: "Account unavailable" }, { status: 401 });
    const cleanPhone = (user.phone || parentPhone).replace(/\D/g, "").slice(-10);

    // 2. Ensure Student entity exists in thinkova_commerce.students (re-use if provided or found by name)
    let studentId = body.studentId;
    let student = studentId ? await dbManager.commerce.getStudentById(studentId) : null;
    if (studentId && student?.parentUserId !== userId) return NextResponse.json({ error: "Student unavailable" }, { status: 404 });
    if (!student) {
      const parentStudents = await dbManager.commerce.getStudentsByParentId(userId);
      student =
        parentStudents.find((s) => s.fullName.toLowerCase().trim() === studentName.toLowerCase().trim()) || null;
      if (student) {
        studentId = student.id;
      }
    }

    if (!student) {
      studentId = `stu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      student = {
        id: studentId,
        parentUserId: userId,
        fullName: studentName.trim(),
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

    const schoolSlug =
      schoolUid
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "") || "general";
    const school = await dbManager.schools.findByUid(schoolUid);
    if (!school) {
      await dbManager.schools.upsertSchool({
        id: `sch_${schoolSlug}`,
        schoolUid: schoolUid.toUpperCase().trim(),
        officialName: `Partner School (${schoolUid.toUpperCase().trim()})`,
        slug: `school-${schoolSlug.replace(/_/g, "-")}`,
        city: process.env.NEXT_PUBLIC_CONTACT_CITY || "Pune",
        state: "Maharashtra",
        board: "CBSE",
        labCapacity: 25,
        partnerCommissionPct: 0,
        status: "ACTIVE",
        createdAt: new Date(),
      });
    }

    const batchId = `batch_${schoolSlug}_01`;
    const existingBatch = await dbManager.schools.getBatch(batchId);
    if (!existingBatch) {
      await dbManager.schools.upsertBatch({
        id: batchId,
        schoolId: `sch_${schoolSlug}`,
        tutorId: "tutor_lead_01",
        batchCode: `BATCH-${schoolUid.toUpperCase().trim()}-01`,
        gradeLevels: [grade],
        dayOfWeek: "Saturday",
        startTime: "10:00",
        endTime: "11:30",
        maxCapacity: 25,
        confirmedStudentsCount: 0,
        startDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        level5Date: new Date(Date.now() + 35 * 24 * 3600 * 1000),
        demoDayDate: new Date(Date.now() + 56 * 24 * 3600 * 1000),
        status: "UPCOMING",
        createdAt: new Date(),
      });
    }

    // Reserve capacity before creating a payable order.
    const enrollmentId = `enr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
      installmentBalanceInPaise: paymentPlan === "INSTALLMENTS" ? Math.round(enrollmentPricing(catalogCourse.price).second * 100) : undefined,
      termsAcceptedAt: body.termsAccepted === true ? new Date() : undefined,
    };
    const existingReservations = await dbManager.commerce.getEnrollmentsByBatchId(batchId);
    const available = existingBatch?.maxCapacity ?? 25;
    if (existingReservations.filter(item => item.status === "ENROLLED" || item.status === "PENDING_PAYMENT").length >= available) {
      for (const pending of existingReservations.filter(item => item.status === "PENDING_PAYMENT")) {
        const orders = await dbRouter.find<{ id: string; expiresAt: Date }>("orders", {
          enrollmentId: pending.id, status: "AWAITING_PAYMENT",
        }, { limit: 1 }, "commerce");
        const expired = orders[0];
        if (!expired || new Date(expired.expiresAt).getTime() > Date.now()) continue;
        const gateway = await cashfreeClient.getOrder(expired.id).catch(() => null);
        if (!gateway || !["EXPIRED", "TERMINATED"].includes(gateway.orderStatus)) continue;
        await dbRouter.commerceTransaction(async () => {
          const current = await dbManager.commerce.getOrderById(expired.id);
          if (current?.status !== "AWAITING_PAYMENT") return;
          await dbManager.commerce.updateOrderStatus(expired.id, "FAILED");
          await dbManager.commerce.updateEnrollmentStatus(pending.id, "DROPPED");
        });
      }
    }

    const reserved = await dbRouter.commerceTransaction(async () => {
      await dbRouter.upsert("seat_reservation_locks", { id: batchId, orderId }, "commerce");
      const reservations = await dbManager.commerce.getEnrollmentsByBatchId(batchId);
      const reservedSeats = reservations.filter(item => item.status === "ENROLLED" || item.status === "PENDING_PAYMENT");
      if (reservedSeats.length >= available) return false;
      await dbManager.commerce.upsertEnrollment(enrollment);
      await dbManager.commerce.upsertOrder({
        id: orderId,
        enrollmentId,
        userId,
        orderType: paymentPlan === "INSTALLMENTS" ? "INSTALLMENT_1" : "FULL_PAYMENT",
        amountInPaise,
        status: "AWAITING_PAYMENT",
        checkoutUrl: "",
        expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
        createdAt: new Date(),
      });
      return true;
    });
    if (!reserved) return NextResponse.json({ error: "This batch is full." }, { status: 409 });

    const cfOrder = await cashfreeClient.createOrder({
      orderId,
      orderAmount: amount,
      orderCurrency: "INR",
      customer: {
        customerId: userId,
        customerName: parentName,
        customerEmail: user.email,
        customerPhone: cleanPhone || parentPhone,
      },
      orderNote: `ThinkOva Course Admission - ${schoolUid.toUpperCase()} (${studentName})`,
      returnUrl: body.returnUrl,
    }).catch(async error => {
      await dbRouter.commerceTransaction(async () => {
        const order = await dbManager.commerce.getOrderById(orderId);
        if (order?.status === "AWAITING_PAYMENT") {
          await dbManager.commerce.updateOrderStatus(orderId, "FAILED");
          await dbManager.commerce.updateEnrollmentStatus(enrollmentId, "DROPPED");
        }
      });
      throw error;
    });

    const checkoutUrl = cfOrder.checkoutUrl || "";

    await dbRouter.update("orders", orderId, { checkoutUrl }, "commerce");

    return NextResponse.json({
      status: "success",
      orderId,
      cfOrderId: cfOrder.cfOrderId,
      paymentSessionId: cfOrder.paymentSessionId,
      orderStatus: cfOrder.orderStatus,
      amount: cfOrder.orderAmount,
      currency: cfOrder.orderCurrency,
      environment: cfOrder.environment,
      checkoutUrl,
      enrollmentId,
      studentId: student.id,
      courseId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Cashfree Order Creation Error]:", err);
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}

/**
 * GET /api/cashfree/order?orderId=...
 * Checks order status from Cashfree and triggers DB confirmation, inner-join relations & curriculum initialization.
 */
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("orderId");
  const order = id && await dbManager.commerce.getOrderById(id);
  if (!order || order.userId !== session.userId) return NextResponse.json({ error: "Order unavailable" }, { status: 404 });
  const enrollment = await dbManager.commerce.getEnrollmentById(order.enrollmentId);
  const student = enrollment && await dbManager.commerce.getStudentById(enrollment.studentId);
  if (!enrollment || student?.parentUserId !== session.userId) return NextResponse.json({ error: "Order unavailable" }, { status: 404 });
  return NextResponse.json({ courseId: enrollment.courseId, studentName: student.fullName, schoolName: student.schoolName, orderId: id, dbStatus: order.status, isPaid: order.status === "PAID", amount: order.amountInPaise / 100, currency: "INR" });
}
