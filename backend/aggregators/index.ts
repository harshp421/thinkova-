import type { PreAggregatorResult } from "../cron/types";
import type {
  AbandonedCartRecord,
  ClassReminderRecord,
  EnrolmentSuccessRecord,
  InstallmentDueRecord,
  PaymentFailureRecord,
  PreAggregatorCollection,
  RefundRecord,
  WeeklyAssessmentRecord,
} from "./types";
import { dbManager } from "../database/client";

function formatPaiseToRupees(amountInPaise: number): string {
  const rupees = Math.round(amountInPaise / 100);
  return `₹${rupees.toLocaleString("en-IN")}`;
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://thinkova.ai";

export const preAggregators: PreAggregatorCollection = {
  /**
   * Pre-aggregates abandoned carts (> thresholdMinutes old without payment and no alert sent)
   */
  abandonedCarts: async (thresholdMinutes: number = 60): Promise<PreAggregatorResult<AbandonedCartRecord>> => {
    const rawOrders = await dbManager.commerce.getOrdersAwaitingPayment(thresholdMinutes);
    const records: AbandonedCartRecord[] = [];

    for (const item of rawOrders) {
      const school = await dbManager.schools.findByUid(item.student.schoolUid);
      const batch = await dbManager.schools.getBatch(item.enrollment.cohortBatchId);

      const maxCap = batch?.maxCapacity ?? 25;
      const confirmed = batch?.confirmedStudentsCount ?? 0;
      const seatsRemaining = Math.max(0, maxCap - confirmed);

      records.push({
        orderId: item.order.id,
        parentName: item.user.username || item.user.email,
        parentEmail: item.user.email,
        parentPhone: item.user.phone || "",
        studentName: item.student.fullName,
        schoolName: school?.officialName || item.student.schoolUid,
        seatsRemaining,
        checkoutUrl: item.order.checkoutUrl || `${siteUrl}/enrol/checkout?orderId=${item.order.id}`,
        holdExpiresAt: item.order.expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        createdAt: item.order.createdAt,
      });
    }

    return {
      data: records,
      count: records.length,
      metadata: { thresholdMinutes, queryExecutedAt: new Date().toISOString() },
    };
  },

  /**
   * Pre-aggregates students due for Installment 2 within daysAhead of Level 5
   */
  installmentDues: async (daysAhead: number = 3): Promise<PreAggregatorResult<InstallmentDueRecord>> => {
    const rawInstallments = await dbManager.commerce.getInstallmentsDue(daysAhead);
    const records: InstallmentDueRecord[] = [];

    for (const item of rawInstallments) {
      const school = await dbManager.schools.findByUid(item.student.schoolUid);
      const batch = await dbManager.schools.getBatch(item.batchId);

      const dueDate = batch?.level5Date
        ? batch.level5Date.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "Upcoming Level 5";

      records.push({
        enrollmentId: item.enrollment.id,
        batchId: item.batchId,
        parentName: item.user.username || item.user.email,
        parentEmail: item.user.email,
        parentPhone: item.user.phone || "",
        studentName: item.student.fullName,
        schoolName: school?.officialName || item.student.schoolUid,
        installmentAmount: "₹2,499",
        dueDate,
        levelStartName: "Think like an agent designer",
        paymentUrl: `${siteUrl}/parent/payments?enrollmentId=${item.enrollment.id}`,
      });
    }

    return {
      data: records,
      count: records.length,
      metadata: { daysAhead, queryExecutedAt: new Date().toISOString() },
    };
  },

  /**
   * Pre-aggregates newly confirmed enrolments ready for school roster sync & welcome email
   */
  enrolmentSuccess: async (): Promise<PreAggregatorResult<EnrolmentSuccessRecord>> => {
    const rawPaid = await dbManager.commerce.getNewlyPaidOrders();
    const records: EnrolmentSuccessRecord[] = [];

    for (const item of rawPaid) {
      const school = await dbManager.schools.findByUid(item.student.schoolUid);
      const batch = await dbManager.schools.getBatch(item.enrollment.cohortBatchId);
      const tutor = batch?.tutorId ? await dbManager.schools.getTutor(batch.tutorId) : null;

      const batchSchedule = batch
        ? `${batch.dayOfWeek}s ${batch.startTime} – ${batch.endTime}`
        : "School Computer Lab Session";

      records.push({
        parentName: item.user.username || item.user.email,
        parentEmail: item.user.email,
        parentPhone: item.user.phone || "",
        studentName: item.student.fullName,
        currentGrade: item.student.currentGrade,
        schoolName: school?.officialName || item.student.schoolUid,
        schoolUid: item.student.schoolUid,
        batchSchedule,
        tutorName: tutor?.fullName || "Assigned ThinkOva Tutor",
        amountPaid: formatPaiseToRupees(item.order.amountInPaise),
        orderId: item.order.id,
      });
    }

    return {
      data: records,
      count: records.length,
      metadata: { queryExecutedAt: new Date().toISOString() },
    };
  },

  /**
   * Pre-aggregates payment failure records requiring immediate notification
   */
  paymentFailures: async (): Promise<PreAggregatorResult<PaymentFailureRecord>> => {
    const rawFailed = await dbManager.commerce.getFailedOrders();
    const records: PaymentFailureRecord[] = [];

    for (const item of rawFailed) {
      records.push({
        orderId: item.order.id,
        parentName: item.user.username || item.user.email,
        parentEmail: item.user.email,
        parentPhone: item.user.phone || "",
        studentName: item.student.fullName,
        amount: formatPaiseToRupees(item.order.amountInPaise),
        failureReason: item.order.failureReason || "Transaction declined or gateway timeout",
        retryUrl: item.order.checkoutUrl || `${siteUrl}/enrol/checkout?orderId=${item.order.id}`,
      });
    }

    return {
      data: records,
      count: records.length,
      metadata: { queryExecutedAt: new Date().toISOString() },
    };
  },

  /**
   * Pre-aggregates pending refunds requiring client notification & bank tracking
   */
  pendingRefunds: async (): Promise<PreAggregatorResult<RefundRecord>> => {
    const rawRefunds = await dbManager.commerce.getPendingRefunds();
    const records: RefundRecord[] = [];

    for (const item of rawRefunds) {
      records.push({
        refundId: item.refund.id,
        parentName: item.user.username || item.user.email,
        parentEmail: item.user.email,
        parentPhone: item.user.phone || "",
        studentName: item.student.fullName,
        refundAmount: formatPaiseToRupees(item.refund.amountInPaise),
        refundReference: item.refund.gatewayRefundId || item.refund.id,
        reason: item.refund.reason,
        initiatedBy: item.refund.initiatedBy,
        estimatedCreditDays: item.refund.estimatedCreditDays || "5–7 business days",
      });
    }

    return {
      data: records,
      count: records.length,
      metadata: { queryExecutedAt: new Date().toISOString() },
    };
  },

  /**
   * Pre-aggregates weekly student assessments for automated Email & WhatsApp progress dispatch
   */
  weeklyAssessments: async (
    batchId?: string,
    levelNumber?: number
  ): Promise<PreAggregatorResult<WeeklyAssessmentRecord>> => {
    const rawAssessments = await dbManager.commerce.getUnsentAssessments(batchId, levelNumber);
    const records: WeeklyAssessmentRecord[] = [];

    for (const item of rawAssessments) {
      const batch = await dbManager.schools.getBatch(item.assessment.cohortBatchId);
      const school = await dbManager.schools.findByUid(item.student.schoolUid);
      const tutor = batch ? await dbManager.schools.getTutor(batch.tutorId) : undefined;

      records.push({
        assessmentId: item.assessment.id,
        studentId: item.student.id,
        batchId: item.assessment.cohortBatchId,
        schoolUid: item.student.schoolUid,
        schoolName: school?.officialName || "Thinkova Partner School",
        parentName: item.user.username || item.user.email,
        parentPhone: item.user.phone || "",
        parentEmail: item.user.email,
        studentName: item.student.fullName,
        levelNumber: item.assessment.levelNumber,
        levelTitle: item.assessment.levelTitle,
        projectCreated: item.assessment.projectTitle,
        tutorName: tutor?.fullName,
        tutorFeedback: item.assessment.tutorFeedback,
        reportUrl: item.assessment.projectArtifactUrl || `${siteUrl}/parent/progress/${item.student.id}?level=${item.assessment.levelNumber}`,
      });
    }

    return {
      data: records,
      count: records.length,
      metadata: { batchId, levelNumber, queryExecutedAt: new Date().toISOString() },
    };
  },

  /**
   * Pre-aggregates daily class reminders for classes occurring on the target date.
   */
  /**
   * Pre-aggregates daily class reminders strictly for enrolled students with learning in progress.
   * Pulls real student enrolments, course progress, and parent phone numbers directly from MongoDB.
   * Never injects static, hardcoded, or mock phone numbers.
   */
  classReminders: async (
    targetDateStr?: string
  ): Promise<PreAggregatorResult<ClassReminderRecord>> => {
    const now = new Date();
    const istDayOfWeek = now.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "long", // e.g. "Wednesday"
    });
    const istDateString = now.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
    }); // e.g. "Wed 25 Nov"

    const filter = targetDateStr?.trim().toLowerCase();

    // Query strictly real active enrolled learners with learning in progress from database
    const activeLearners = await dbManager.commerce.getActiveLearningEnrollments();

    // If no active enrolled students exist in MongoDB, return empty immediately (NEVER fallback to static numbers)
    if (!activeLearners || activeLearners.length === 0) {
      return {
        data: [],
        count: 0,
        metadata: {
          filterDate: targetDateStr || "today",
          resolvedDateDisplay: istDateString,
          matchedSessionsCount: 0,
          queryExecutedAt: new Date().toISOString(),
          notice: "No enrolled learners found in database.",
        },
      };
    }

    const records: ClassReminderRecord[] = [];

    for (const learner of activeLearners) {
      const { enrollment, student, user, progress } = learner;

      // 1. Resolve student's batch schedule
      const batch = enrollment.cohortBatchId
        ? await dbManager.schools.getBatch(enrollment.cohortBatchId)
        : null;

      const batchDay = (batch?.dayOfWeek || "").toLowerCase();

      // 2. Resolve schedule availability:
      // If a target date/filter was provided, match against batch dayOfWeek, date, or "all"
      // Otherwise match against today's day of the week in IST or RUNNING batch.
      const isDayMatch = !filter || filter === "today" || filter === "current"
        ? (batchDay === istDayOfWeek.toLowerCase() || batch?.status === "RUNNING")
        : (
            batchDay.includes(filter) ||
            filter === "all" ||
            filter === "force" ||
            (batch?.batchCode && batch.batchCode.toLowerCase().includes(filter)) ||
            (enrollment.courseId && enrollment.courseId.toLowerCase().includes(filter)) ||
            (student.fullName && student.fullName.toLowerCase().includes(filter))
          );

      if (!isDayMatch && batch) {
        continue;
      }

      // 3. Resolve student's course and curriculum level in progress
      const courseId = enrollment.courseId || "robotics-starter";
      const course = await dbManager.schools.getCourseById(courseId);
      const currentLevel = progress?.currentWeek || enrollment.currentLevel || 1;

      const planItem = course?.weeklyPlan?.find((w) => w.week === currentLevel);
      const className = planItem?.title
        ? `Level ${currentLevel}: ${planItem.title}`
        : `${course?.title || "STEM & Robotics Program"} - Level ${currentLevel}: Hands-on Lab`;

      const tutor = batch ? await dbManager.schools.getTutor(batch.tutorId) : null;
      const classTime = batch?.startTime && batch?.endTime
        ? `${batch.startTime} – ${batch.endTime} IST`
        : "5:00 PM – 6:30 PM IST";

      const prepItem = planItem?.subtitle || "Bring your project kit and charged laptop";
      const joinUrl = `${siteUrl}/learning/lab-session?studentId=${student.id}&courseId=${courseId}&level=${currentLevel}`;

      records.push({
        studentId: student.id,
        sessionId: `session_${enrollment.cohortBatchId || "batch"}_lvl_${currentLevel}`,
        parentPhone: user.phone!,
        parentName: user.fullName || user.username || "Parent",
        parentEmail: user.email,
        studentName: student.fullName,
        schoolName: student.schoolName || student.schoolUid || "ThinkOva Partner School",
        className,
        levelNumber: currentLevel,
        classDate: targetDateStr && targetDateStr !== "today" && targetDateStr !== "current"
          ? targetDateStr
          : istDateString,
        classTime,
        tutorName: tutor?.fullName || "ThinkOva Lead Tutor",
        prepItem,
        joinUrl,
      });
    }

    return {
      data: records,
      count: records.length,
      metadata: {
        filterDate: targetDateStr || "today",
        resolvedDateDisplay: istDateString,
        matchedSessionsCount: records.length,
        queryExecutedAt: new Date().toISOString(),
      },
    };
  },
};
