import type {
  UserEntity,
  StudentEntity,
  EnrollmentEntity,
  OrderEntity,
  PaymentEntity,
  RefundEntity,
  AssessmentEntity,
  NotificationEntity,
  CourseProgressEntity,
  LearningStateAnalysisEntity,
  CourseEntity,
  CohortBatchEntity,
  CourseVideoEntity,
  CourseWeeklyPlanItem,
  CourseMilestone,
  OrderWithFullDetails,
} from "../types";
import { PreSchemaValidator } from "../schema/validator";
import { dbRouter, type DatabaseRouter } from "../router/db-router";

export interface OrderWithRelations {
  order: OrderEntity;
  user: UserEntity;
  student: StudentEntity;
  enrollment: EnrollmentEntity;
}

export interface InstallmentDueWithRelations {
  enrollment: EnrollmentEntity;
  student: StudentEntity;
  user: UserEntity;
  batchId: string;
}

export interface RefundWithRelations {
  refund: RefundEntity;
  user: UserEntity;
  student: StudentEntity;
}

export interface AssessmentWithRelations {
  assessment: AssessmentEntity;
  student: StudentEntity;
  user: UserEntity;
}

export interface ICommerceRepository {
  getOrdersAwaitingPayment(thresholdMinutes: number): Promise<OrderWithRelations[]>;
  getInstallmentsDue(daysAhead: number): Promise<InstallmentDueWithRelations[]>;
  getNewlyPaidOrders(): Promise<OrderWithRelations[]>;
  getFailedOrders(): Promise<Array<{ order: OrderEntity; user: UserEntity; student: StudentEntity }>>;
  getPendingRefunds(): Promise<RefundWithRelations[]>;
  getUnsentAssessments(batchId?: string, levelNumber?: number): Promise<AssessmentWithRelations[]>;
  markAlertSent(
    type: "ABANDONED_CART" | "ENROLMENT" | "PAYMENT_FAILURE" | "INSTALLMENT" | "REFUND" | "ASSESSMENT",
    id: string
  ): Promise<void>;
  upsertUser(user: UserEntity): Promise<void>;
  upsertStudent(student: StudentEntity): Promise<void>;
  upsertEnrollment(enrollment: EnrollmentEntity): Promise<void>;
  upsertOrder(order: OrderEntity): Promise<void>;
  upsertRefund(refund: RefundEntity): Promise<void>;
  getRefundById(refundId: string): Promise<RefundEntity | null>;
  getRefundsByEnrollmentId(enrollmentId: string): Promise<RefundEntity[]>;
  getRefundByGatewayId(gatewayRefundId: string): Promise<RefundEntity | null>;
  applyRefundLifecycleStatus(params: {
    refundId: string;
    status: RefundEntity["status"];
    gatewayRefundId?: string;
  }): Promise<RefundEntity | null>;
  upsertAssessment(assessment: AssessmentEntity): Promise<void>;
  getOrderById(orderId: string): Promise<OrderEntity | null>;
  getEnrollmentById(enrollmentId: string): Promise<EnrollmentEntity | null>;
  getUserById(userId: string): Promise<UserEntity | null>;
  getUserByEmail(email: string): Promise<UserEntity | null>;
  getUserByPhone(phone: string): Promise<UserEntity | null>;
  getStudentById(studentId: string): Promise<StudentEntity | null>;
  getStudentsByParentId(parentUserId: string): Promise<StudentEntity[]>;
  getEnrollmentsByStudentId(studentId: string): Promise<EnrollmentEntity[]>;
  getEnrollmentsByBatchId(batchId: string): Promise<EnrollmentEntity[]>;
  getActiveLearningEnrollments(): Promise<
    Array<{
      enrollment: EnrollmentEntity;
      student: StudentEntity;
      user: UserEntity;
      progress?: CourseProgressEntity | null;
    }>
  >;
  getAssessmentsByBatchId(batchId: string): Promise<AssessmentEntity[]>;
  getAssessmentsByStudentId(studentId: string): Promise<AssessmentEntity[]>;
  deleteStudent(studentId: string): Promise<void>;
  upsertPayment(payment: PaymentEntity): Promise<void>;
  updateOrderStatus(orderId: string, status: OrderEntity["status"], failureReason?: string): Promise<void>;
  updateEnrollmentStatus(enrollmentId: string, status: EnrollmentEntity["status"]): Promise<void>;
  getCourseProgressByStudent(studentId: string, courseId?: string): Promise<CourseProgressEntity | null>;
  upsertCourseProgress(progress: Partial<CourseProgressEntity>): Promise<CourseProgressEntity>;
  getLearningAnalysis(studentId: string): Promise<LearningStateAnalysisEntity | null>;
  saveLearningAnalysis(analysis: Partial<LearningStateAnalysisEntity>): Promise<LearningStateAnalysisEntity>;
  getPaymentByOrderId(orderId: string): Promise<PaymentEntity | null>;
  getOrderWithJoinedDetails(orderId: string): Promise<OrderWithFullDetails | null>;
  confirmOrderAndEnrollment(params: {
    orderId: string;
    paymentId?: string;
    gatewayOrderId?: string;
    paymentMethod?: string;
    amountInPaise?: number;
  }): Promise<OrderWithFullDetails>;
  getSharedCurriculum(courseId: string, batchId?: string): Promise<{
    course: CourseEntity | null;
    batch: CohortBatchEntity | null;
    weeklyPlan: CourseWeeklyPlanItem[];
    videos: CourseVideoEntity[];
  }>;
  saveNotification(notification: Partial<NotificationEntity>): Promise<NotificationEntity>;
  getNotifications(filter?: { recipient?: string; channel?: "WHATSAPP" | "EMAIL"; limit?: number }): Promise<NotificationEntity[]>;
}

/**
 * Pre-Schema Routed Commerce & Student Repository
 * Manages parent accounts, student profiles, orders, payments, refunds, and assessments
 * across ANY storage system via the universal database router.
 */
export class PreSchemaCommerceRepository implements ICommerceRepository {
  private router: DatabaseRouter;

  constructor(router: DatabaseRouter = dbRouter) {
    this.router = router;
  }

  async getOrdersAwaitingPayment(thresholdMinutes: number): Promise<OrderWithRelations[]> {
    const now = Date.now();
    const thresholdMs = thresholdMinutes * 60 * 1000;
    const orders = await this.router.find<OrderEntity>("orders", { status: "AWAITING_PAYMENT" }, undefined, "commerce");
    const results: OrderWithRelations[] = [];

    for (const order of orders) {
      const createdAtMs = order.createdAt instanceof Date ? order.createdAt.getTime() : new Date(order.createdAt).getTime();
      const ageMs = now - createdAtMs;

      if (ageMs >= thresholdMs && !order.abandonedAlertSentAt) {
        const enrollment = await this.router.get<EnrollmentEntity>("enrollments", order.enrollmentId, "commerce");
        const student = enrollment ? await this.router.get<StudentEntity>("students", enrollment.studentId, "commerce") : null;
        const user = await this.router.get<UserEntity>("users", order.userId, "commerce");

        if (enrollment && student && user) {
          results.push({ order, enrollment, student, user });
        }
      }
    }

    return results;
  }

  async getInstallmentsDue(daysAhead: number): Promise<InstallmentDueWithRelations[]> {
    const now = Date.now();
    const windowMs = daysAhead * 24 * 3600 * 1000;
    const enrollments = await this.router.find<EnrollmentEntity>("enrollments", { paymentPlan: "INSTALLMENTS" }, undefined, "commerce");
    const results: InstallmentDueWithRelations[] = [];

    for (const enr of enrollments) {
      if (!enr.installment2Paid && !enr.installmentReminderSentAt) {
        // Query batch from schools domain via router
        const batch = await this.router.get<{ id: string; level5Date: Date | string }>("batches", enr.cohortBatchId, "schools");
        if (batch) {
          const l5Time = batch.level5Date instanceof Date ? batch.level5Date.getTime() : new Date(batch.level5Date).getTime();
          const diffMs = l5Time - now;

          if (diffMs > 0 && diffMs <= windowMs) {
            const student = await this.router.get<StudentEntity>("students", enr.studentId, "commerce");
            const user = student ? await this.router.get<UserEntity>("users", student.parentUserId, "commerce") : null;

            if (student && user) {
              results.push({ enrollment: enr, student, user, batchId: batch.id });
            }
          }
        }
      }
    }

    return results;
  }

  async getNewlyPaidOrders(): Promise<OrderWithRelations[]> {
    const orders = await this.router.find<OrderEntity>("orders", { status: "PAID" }, undefined, "commerce");
    const results: OrderWithRelations[] = [];

    for (const order of orders) {
      if (!order.enrolmentNotificationSentAt) {
        const enrollment = await this.router.get<EnrollmentEntity>("enrollments", order.enrollmentId, "commerce");
        const student = enrollment ? await this.router.get<StudentEntity>("students", enrollment.studentId, "commerce") : null;
        const user = student ? await this.router.get<UserEntity>("users", student.parentUserId, "commerce") : null;

        if (enrollment && student && user) {
          results.push({ order, enrollment, student, user });
        }
      }
    }

    return results;
  }

  async getFailedOrders(): Promise<Array<{ order: OrderEntity; user: UserEntity; student: StudentEntity }>> {
    const orders = await this.router.find<OrderEntity>("orders", { status: "FAILED" }, undefined, "commerce");
    const results: Array<{ order: OrderEntity; user: UserEntity; student: StudentEntity }> = [];

    for (const order of orders) {
      if (!order.failureAlertSentAt) {
        const enrollment = await this.router.get<EnrollmentEntity>("enrollments", order.enrollmentId, "commerce");
        const student = enrollment ? await this.router.get<StudentEntity>("students", enrollment.studentId, "commerce") : null;
        const user = student ? await this.router.get<UserEntity>("users", student.parentUserId, "commerce") : null;

        if (student && user) {
          results.push({ order, user, student });
        }
      }
    }

    return results;
  }

  async getPendingRefunds(): Promise<RefundWithRelations[]> {
    const refunds = await this.router.find<RefundEntity>("refunds", { status: "INITIATED" }, undefined, "commerce");
    const unsent = refunds.filter((refund) => !refund.refundAlertSentAt);
    if (unsent.length === 0) return [];

    // Batched $in resolution eliminates N+1 sequential DB round-trips (constant 4 queries instead of 1 + 3N)
    const enrollmentIds = Array.from(new Set(unsent.map((r) => r.enrollmentId).filter(Boolean)));
    const enrollments =
      enrollmentIds.length > 0
        ? await this.router.find<EnrollmentEntity>("enrollments", { id: { $in: enrollmentIds } }, undefined, "commerce")
        : [];
    const enrollmentMap = new Map(enrollments.map((e) => [e.id, e]));

    const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId).filter(Boolean)));
    const students =
      studentIds.length > 0
        ? await this.router.find<StudentEntity>("students", { id: { $in: studentIds } }, undefined, "commerce")
        : [];
    const studentMap = new Map(students.map((s) => [s.id, s]));

    const userIds = Array.from(new Set(students.map((s) => s.parentUserId).filter(Boolean)));
    const users =
      userIds.length > 0
        ? await this.router.find<UserEntity>("users", { id: { $in: userIds } }, undefined, "commerce")
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const results: RefundWithRelations[] = [];
    for (const refund of unsent) {
      const enrollment = enrollmentMap.get(refund.enrollmentId);
      const student = enrollment ? studentMap.get(enrollment.studentId) : undefined;
      const user = student ? userMap.get(student.parentUserId) : undefined;
      if (student && user) {
        results.push({ refund, user, student });
      }
    }

    return results;
  }

  async getUnsentAssessments(batchId?: string, levelNumber?: number): Promise<AssessmentWithRelations[]> {
    const filter: Record<string, unknown> = {};
    if (batchId) filter.cohortBatchId = batchId;
    if (levelNumber) filter.levelNumber = levelNumber;

    const assessments = await this.router.find<AssessmentEntity>("assessments", filter, undefined, "commerce");
    const results: AssessmentWithRelations[] = [];

    for (const ass of assessments) {
      if (!ass.reportSentAt) {
        const student = await this.router.get<StudentEntity>("students", ass.studentId, "commerce");
        const user = student ? await this.router.get<UserEntity>("users", student.parentUserId, "commerce") : null;

        if (student && user) {
          results.push({ assessment: ass, student, user });
        }
      }
    }

    return results;
  }

  async markAlertSent(
    type: "ABANDONED_CART" | "ENROLMENT" | "PAYMENT_FAILURE" | "INSTALLMENT" | "REFUND" | "ASSESSMENT",
    id: string
  ): Promise<void> {
    const now = new Date();
    switch (type) {
      case "ABANDONED_CART": {
        await this.router.update<OrderEntity>("orders", id, { abandonedAlertSentAt: now }, "commerce");
        break;
      }
      case "ENROLMENT": {
        await this.router.update<OrderEntity>("orders", id, { enrolmentNotificationSentAt: now }, "commerce");
        break;
      }
      case "PAYMENT_FAILURE": {
        await this.router.update<OrderEntity>("orders", id, { failureAlertSentAt: now }, "commerce");
        break;
      }
      case "INSTALLMENT": {
        await this.router.update<EnrollmentEntity>("enrollments", id, { installmentReminderSentAt: now }, "commerce");
        break;
      }
      case "REFUND": {
        await this.router.update<RefundEntity>("refunds", id, { refundAlertSentAt: now }, "commerce");
        break;
      }
      case "ASSESSMENT": {
        await this.router.update<AssessmentEntity>("assessments", id, { reportSentAt: now }, "commerce");
        break;
      }
    }
  }

  async upsertUser(user: UserEntity): Promise<void> {
    const valid = PreSchemaValidator.normalizeUser(user);
    await this.router.upsert("users", valid, "commerce");
  }

  async upsertStudent(student: StudentEntity): Promise<void> {
    const valid = PreSchemaValidator.normalizeStudent(student);
    await this.router.upsert("students", valid, "commerce");
  }

  async upsertEnrollment(enrollment: EnrollmentEntity): Promise<void> {
    const valid = PreSchemaValidator.normalizeEnrollment(enrollment);
    await this.router.upsert("enrollments", valid, "commerce");
  }

  async upsertOrder(order: OrderEntity): Promise<void> {
    const valid = PreSchemaValidator.normalizeOrder(order);
    await this.router.upsert("orders", valid, "commerce");
  }

  async upsertRefund(refund: RefundEntity): Promise<void> {
    const valid = PreSchemaValidator.normalizeRefund(refund);
    await this.router.upsert("refunds", valid, "commerce");
  }

  async getRefundById(refundId: string): Promise<RefundEntity | null> {
    return await this.router.get<RefundEntity>("refunds", refundId, "commerce");
  }

  async getRefundsByEnrollmentId(enrollmentId: string): Promise<RefundEntity[]> {
    return await this.router.find<RefundEntity>("refunds", { enrollmentId }, undefined, "commerce");
  }

  async getRefundByGatewayId(gatewayRefundId: string): Promise<RefundEntity | null> {
    if (!gatewayRefundId) return null;
    const list = await this.router.find<RefundEntity>("refunds", { gatewayRefundId }, { limit: 1 }, "commerce");
    return list[0] || null;
  }

  async applyRefundLifecycleStatus(params: {
    refundId: string;
    status: RefundEntity["status"];
    gatewayRefundId?: string;
  }): Promise<RefundEntity | null> {
    const existing = await this.getRefundById(params.refundId);
    if (!existing) return null;

    const patch: Partial<RefundEntity> = {
      status: params.status,
      ...(params.gatewayRefundId ? { gatewayRefundId: params.gatewayRefundId } : {}),
      ...(params.status === "COMPLETED" ? { completedAt: existing.completedAt || new Date() } : {}),
    };
    await this.router.update<RefundEntity>("refunds", existing.id, patch, "commerce");

    if (params.status === "COMPLETED") {
      await this.updateEnrollmentStatus(existing.enrollmentId, "REFUNDED");
      if (existing.paymentId) {
        await this.router.update<PaymentEntity>("payments", existing.paymentId, { status: "REFUNDED" }, "commerce");
      }
    }

    return await this.getRefundById(existing.id);
  }

  async upsertAssessment(assessment: AssessmentEntity): Promise<void> {
    const valid = PreSchemaValidator.normalizeAssessment(assessment);
    await this.router.upsert("assessments", valid, "commerce");
  }

  async getOrderById(orderId: string): Promise<OrderEntity | null> {
    return await this.router.get<OrderEntity>("orders", orderId, "commerce");
  }

  async getEnrollmentById(enrollmentId: string): Promise<EnrollmentEntity | null> {
    return await this.router.get<EnrollmentEntity>("enrollments", enrollmentId, "commerce");
  }

  async getUserById(userId: string): Promise<UserEntity | null> {
    return await this.router.get<UserEntity>("users", userId, "commerce");
  }

  async getUserByEmail(email: string): Promise<UserEntity | null> {
    const list = await this.router.find<UserEntity>("users", { email: email.toLowerCase().trim() }, undefined, "commerce");
    return list.length > 0 && list[0] ? list[0] : null;
  }

  async getUserByPhone(phone: string): Promise<UserEntity | null> {
    if (!phone || !phone.trim()) return null;
    const list = await this.router.find<UserEntity>("users", { phone: phone.trim() }, undefined, "commerce");
    return list.length > 0 && list[0] ? list[0] : null;
  }

  async getStudentById(studentId: string): Promise<StudentEntity | null> {
    return await this.router.get<StudentEntity>("students", studentId, "commerce");
  }

  async getStudentsByParentId(parentUserId: string): Promise<StudentEntity[]> {
    return await this.router.find<StudentEntity>("students", { parentUserId }, undefined, "commerce");
  }

  async getEnrollmentsByStudentId(studentId: string): Promise<EnrollmentEntity[]> {
    return await this.router.find<EnrollmentEntity>("enrollments", { studentId }, undefined, "commerce");
  }

  async getEnrollmentsByBatchId(batchId: string): Promise<EnrollmentEntity[]> {
    return await this.router.find<EnrollmentEntity>("enrollments", { cohortBatchId: batchId }, undefined, "commerce");
  }

  async getActiveLearningEnrollments(): Promise<
    Array<{
      enrollment: EnrollmentEntity;
      student: StudentEntity;
      user: UserEntity;
      progress?: CourseProgressEntity | null;
    }>
  > {
    const allEnrollments = await this.router.find<EnrollmentEntity>("enrollments", {}, undefined, "commerce");

    // Also look up paid orders to capture confirmed enrolled learners
    const paidOrders = await this.router.find<OrderEntity>("orders", { status: "PAID" }, undefined, "commerce");
    const paidEnrollmentIds = new Set(paidOrders.map((o) => o.enrollmentId));

    const activeList = allEnrollments.filter((e) => {
      if (e.status === "DROPPED") return false;
      return e.status === "ENROLLED" || paidEnrollmentIds.has(e.id);
    });

    const results: Array<{
      enrollment: EnrollmentEntity;
      student: StudentEntity;
      user: UserEntity;
      progress?: CourseProgressEntity | null;
    }> = [];

    for (const enrollment of activeList) {
      const student = await this.router.get<StudentEntity>("students", enrollment.studentId, "commerce");
      if (!student) continue;

      const user = await this.router.get<UserEntity>("users", student.parentUserId, "commerce");
      // Must have valid registered parent phone number in database
      if (!user || !user.phone || user.phone.replace(/\D/g, "").length < 10) continue;

      const progress = enrollment.courseId
        ? await this.getCourseProgressByStudent(student.id, enrollment.courseId)
        : null;

      results.push({
        enrollment,
        student,
        user,
        progress,
      });
    }

    return results;
  }

  async getAssessmentsByBatchId(batchId: string): Promise<AssessmentEntity[]> {
    return await this.router.find<AssessmentEntity>("assessments", { cohortBatchId: batchId }, undefined, "commerce");
  }

  async getAssessmentsByStudentId(studentId: string): Promise<AssessmentEntity[]> {
    return await this.router.find<AssessmentEntity>("assessments", { studentId }, undefined, "commerce");
  }

  async deleteStudent(studentId: string): Promise<void> {
    await this.router.delete("students", studentId, "commerce");
  }

  async upsertPayment(payment: PaymentEntity): Promise<void> {
    const valid = PreSchemaValidator.normalizePayment(payment);
    await this.router.upsert("payments", valid, "commerce");
  }

  async updateOrderStatus(orderId: string, status: OrderEntity["status"], failureReason?: string): Promise<void> {
    const partial: Partial<OrderEntity> = { status };
    if (failureReason) partial.failureReason = failureReason;
    await this.router.update("orders", orderId, partial, "commerce");
  }

  async updateEnrollmentStatus(enrollmentId: string, status: EnrollmentEntity["status"]): Promise<void> {
    await this.router.update<EnrollmentEntity>("enrollments", enrollmentId, { status }, "commerce");
  }

  async getCourseProgressByStudent(studentId: string, courseId?: string): Promise<CourseProgressEntity | null> {
    const filter: Record<string, unknown> = { studentId };
    if (courseId) filter.courseId = courseId;
    const list = await this.router.find<CourseProgressEntity>("course_progress", filter, undefined, "commerce");
    return list.length > 0 && list[0] ? list[0] : null;
  }

  async upsertCourseProgress(progress: Partial<CourseProgressEntity>): Promise<CourseProgressEntity> {
    const valid = PreSchemaValidator.normalizeCourseProgress(progress);
    await this.router.upsert("course_progress", valid, "commerce");
    return valid;
  }

  async getLearningAnalysis(studentId: string): Promise<LearningStateAnalysisEntity | null> {
    const list = await this.router.find<LearningStateAnalysisEntity>("learning_analysis", { studentId }, undefined, "commerce");
    return list.length > 0 && list[0] ? list[0] : null;
  }

  async saveLearningAnalysis(analysis: Partial<LearningStateAnalysisEntity>): Promise<LearningStateAnalysisEntity> {
    const valid = PreSchemaValidator.normalizeLearningAnalysis(analysis);
    await this.router.upsert("learning_analysis", valid, "commerce");
    return valid;
  }

  async getPaymentByOrderId(orderId: string): Promise<PaymentEntity | null> {
    const list = await this.router.find<PaymentEntity>(
      "payments",
      { orderId },
      { sort: { paidAt: "desc" }, limit: 1 },
      "commerce"
    );
    return list[0] || null;
  }

  async getOrderWithJoinedDetails(orderId: string): Promise<OrderWithFullDetails | null> {
    const order = await this.getOrderById(orderId);
    if (!order) return null;

    const payment = await this.getPaymentByOrderId(orderId);
    const enrollment = await this.getEnrollmentById(order.enrollmentId);
    const user = await this.getUserById(order.userId);

    if (!enrollment || !user) return null;

    const student = await this.getStudentById(enrollment.studentId);
    if (!student) return null;

    let course: CourseEntity | null = null;
    if (enrollment.courseId) {
      course = await this.router.get<CourseEntity>("courses", enrollment.courseId, "schools");
    }

    let batch: CohortBatchEntity | null = null;
    if (enrollment.cohortBatchId) {
      batch = await this.router.get<CohortBatchEntity>("batches", enrollment.cohortBatchId, "schools");
    }

    return {
      order,
      payment,
      enrollment,
      student,
      user,
      course,
      batch,
    };
  }

  async confirmOrderAndEnrollment(params: {
    orderId: string;
    paymentId?: string;
    gatewayOrderId?: string;
    paymentMethod?: string;
    amountInPaise?: number;
  }): Promise<OrderWithFullDetails> {
    const order = await this.getOrderById(params.orderId);
    if (!order) {
      throw new Error(`Order ${params.orderId} not found in database.`);
    }

    // 2. Persist Payment Transaction in thinkova_commerce.payments
    const existingPayment = await this.getPaymentByOrderId(params.orderId);
    if (!existingPayment) {
      const paymentDoc: PaymentEntity = {
        id: `pay_${params.orderId}`,
        orderId: params.orderId,
        gateway: "CASHFREE",
        gatewayOrderId: params.gatewayOrderId || params.orderId,
        gatewayPaymentId: params.paymentId || `cf_${Date.now()}`,
        paymentMethod: (params.paymentMethod as PaymentEntity["paymentMethod"]) || "UPI",
        amountInPaise: params.amountInPaise || order.amountInPaise,
        status: "SUCCESS",
        paidAt: new Date(),
      };
      await this.upsertPayment(paymentDoc);
    }

    // 3. Confirm Enrollment (update status to ENROLLED)
    const enrollment = await this.getEnrollmentById(order.enrollmentId);
    if (!enrollment) {
      throw new Error(`Enrollment ${order.enrollmentId} not found for order ${params.orderId}.`);
    }
    await this.updateEnrollmentStatus(enrollment.id, "ENROLLED");

    // 4. Resolve Course details from thinkova_schools.courses
    const courseId = enrollment.courseId;
    let course: CourseEntity | null = null;
    if (courseId) {
      course = await this.router.get<CourseEntity>("courses", courseId, "schools");
    }

    // 5. Trigger Curriculum, Learnings, Steps & Videos initialization in thinkova_commerce.course_progress
    const student = await this.getStudentById(enrollment.studentId);
    const resolvedCourseId = courseId || course?.id || "course";
    const existingProgress = await this.getCourseProgressByStudent(enrollment.studentId, resolvedCourseId);
    if (!existingProgress) {
      // Build real milestones directly from course weekly plan in MongoDB Atlas
      const milestones: CourseMilestone[] = (course?.weeklyPlan || []).map((wp) => ({
        id: `m_${wp.week}`,
        weekNumber: wp.week,
        title: wp.title,
        summary: wp.subtitle,
        completed: false,
        videoUrl: wp.videoUrl || undefined,
      }));

      const totalWeeks = milestones.length > 0 ? milestones.length : (course?.weeklyPlan?.length || 6);
      const progressId = `prog_${enrollment.id}`;
      await this.upsertCourseProgress({
        id: progressId,
        studentId: enrollment.studentId,
        courseId: resolvedCourseId,
        courseTitle: course?.title || "Enrolled Course",
        trackId: course?.trackId || student?.preferredTrack || "general",
        enrollmentId: enrollment.id,
        parentUserId: order.userId,
        status: "ACTIVE",
        currentWeek: 1,
        totalWeeks,
        frequencyPerWeek: 1,
        frequencyLabel: "1 in-school lab/week + 90 min guided sandbox",
        completedMinutes: 0,
        totalEstimatedMinutes: totalWeeks * 90,
        lengthLeftMinutes: totalWeeks * 90,
        completionPercentage: 0,
        persona: (course?.trackId || student?.preferredTrack) === "robotics" ? "BUILDER" : (course?.trackId || student?.preferredTrack) === "ai" ? "LOGICIAN" : "CREATOR",
        milestones,
        streakDays: 1,
        lastActiveAt: new Date(),
        nextSessionAt: new Date(Date.now() + 7 * 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Initialize learning analysis
      await this.saveLearningAnalysis({
        id: `ana_${enrollment.id}`,
        studentId: enrollment.studentId,
        courseId: resolvedCourseId,
        persona: (course?.trackId || student?.preferredTrack) === "robotics" ? "BUILDER" : (course?.trackId || student?.preferredTrack) === "ai" ? "LOGICIAN" : "CREATOR",
        frequencyScore: 100,
        completionVelocity: 1.0,
        lengthLeftWeeks: milestones.length,
        projectedDemoDay: new Date(Date.now() + milestones.length * 7 * 86400000),
        followRoute: "STANDARD",
        strengths: ["Course Enrolled", "In-School Lab Access Enabled", "Active Mentorship"],
        areasOfGrowth: ["Begin Level 1 Orientation"],
        recommendedNextTrack: "ai",
        parentReportPill: `Enrolment confirmed · Level 1 ready for ${student?.fullName || "student"}`,
        analyzedAt: new Date(),
      });
    }

    await this.updateOrderStatus(params.orderId, "PAID");
    const fullDetails = await this.getOrderWithJoinedDetails(params.orderId);
    if (!fullDetails) {
      throw new Error(`Failed to retrieve joined details for order ${params.orderId}.`);
    }
    return fullDetails;
  }

  async getSharedCurriculum(courseId: string, batchId?: string): Promise<{
    course: CourseEntity | null;
    batch: CohortBatchEntity | null;
    weeklyPlan: CourseWeeklyPlanItem[];
    videos: CourseVideoEntity[];
  }> {
    const course = await this.router.get<CourseEntity>("courses", courseId, "schools");
    let batch: CohortBatchEntity | null = null;
    if (batchId) {
      batch = await this.router.get<CohortBatchEntity>("batches", batchId, "schools");
    }

    const videos = await this.router.find<CourseVideoEntity>(
      "course_videos",
      batchId ? { courseId, batchId } : { courseId },
      { sort: { weekNumber: "asc" } },
      "schools"
    );

    // Merge real videos into weeklyPlan
    const basePlan = course?.weeklyPlan || [];
    const mergedPlan: CourseWeeklyPlanItem[] = basePlan.map((wp) => {
      const matchingVideo = videos.find((v) => v.weekNumber === wp.week);
      return {
        ...wp,
        videoUrl: matchingVideo?.videoUrl || wp.videoUrl,
        recordingDuration: matchingVideo?.duration || wp.recordingDuration,
      };
    });

    return {
      course,
      batch,
      weeklyPlan: mergedPlan,
      videos,
    };
  }

  async saveNotification(notification: Partial<NotificationEntity>): Promise<NotificationEntity> {
    const valid = PreSchemaValidator.normalizeNotification(notification);
    await this.router.upsert("notifications", valid, "commerce");
    return valid;
  }

  async getNotifications(filter?: { recipient?: string; channel?: "WHATSAPP" | "EMAIL"; limit?: number }): Promise<NotificationEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter?.recipient) query.recipient = filter.recipient;
    if (filter?.channel) query.channel = filter.channel;
    const list = await this.router.find<NotificationEntity>("notifications", query, { limit: filter?.limit || 100 }, "commerce");
    return list.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  }
}

