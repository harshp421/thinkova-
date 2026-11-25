import { createSessionToken } from "../src/lib/auth-session";
import { dbManager, dbRouter } from "../backend/database/client";

export async function seedDynamicTestData(driver = "memory") {
  dbRouter.setDomainRoute("schools", driver);
  dbRouter.setDomainRoute("commerce", driver);
  dbRouter.setDomainRoute("default", driver);
  dbManager.memory.clearAll();

  // 1. Dynamic School
  await dbManager.schools.upsertSchool({
    id: "sch_dps_01",
    schoolUid: "DPS-PUN-01",
    officialName: "Delhi Public School, Pune",
    slug: "dps-pune",
    city: "Pune",
    state: "Maharashtra",
    board: "CBSE",
    labCapacity: 30,
    partnerCommissionPct: 15.0,
    status: "ACTIVE",
    createdAt: new Date(),
  });

  // 2. Dynamic Tutor
  await dbManager.schools.upsertTutor({
    id: "tut_01",
    fullName: "Rohan Kulkarni (M.Tech CS)",
    email: "rohan@thinkova.ai",
    phone: "+919800011122",
    backgroundVerified: true,
    status: "ACTIVE",
    createdAt: new Date(),
  });

  // 2.5 Dynamic Course
  await dbManager.schools.upsertCourse({
    id: "robotics-starter",
    title: "Robotics & Hardware Engineering",
    trackId: "robotics",
    trackName: "Robotics",
    grades: "Grades 5–8",
    minGrade: 5,
    maxGrade: 8,
    targetGrades: [5, 6, 7, 8],
    duration: "6 weeks",
    weeklyPlan: [
      { week: 1, title: "Microcontroller Basics", subtitle: "Getting started with circuit design" },
      { week: 4, title: "Autonomous Obstacle Detection Rover", subtitle: "Bring ultrasonic sensors and breadboard" },
    ],
    status: "ACTIVE",
    createdAt: new Date(),
  });

  // 3. Dynamic Cohort Batch
  await dbManager.schools.upsertBatch({
    id: "batch_dps_01",
    schoolId: "sch_dps_01",
    tutorId: "tut_01",
    batchCode: "DPS-PUN-B1",
    gradeLevels: [5, 6, 7, 8],
    dayOfWeek: "Wednesday",
    startTime: "14:30",
    endTime: "16:00",
    maxCapacity: 25,
    confirmedStudentsCount: 21, // 4 seats remaining!
    startDate: new Date(),
    level5Date: new Date(Date.now() + 2.5 * 24 * 3600 * 1000), // Due in 2.5 days
    demoDayDate: new Date(Date.now() + 45 * 24 * 3600 * 1000),
    status: "RUNNING",
    createdAt: new Date(),
  });

  // 4. Dynamic Parent User
  await dbManager.commerce.upsertUser({
    id: "usr_parent_01",
    phone: "+919876543210",
    email: "sandeep.v@example.com",
    username: "Sandeep Verma",
    role: "PARENT",
    isPhoneVerified: true,
    isEmailVerified: true,
    consentTimestamp: new Date(),
    createdAt: new Date(),
  });

  // 5. Dynamic Student
  await dbManager.commerce.upsertStudent({
    id: "stu_01",
    parentUserId: "usr_parent_01",
    fullName: "Arjun Verma",
    schoolUid: "DPS-PUN-01",
    currentGrade: 6,
    createdAt: new Date(),
  });

  // 6. Dynamic Enrollment
  await dbManager.commerce.upsertEnrollment({
    id: "enr_01",
    studentId: "stu_01",
    cohortBatchId: "batch_dps_01",
    courseId: "robotics-starter",
    schoolUid: "DPS-PUN-01",
    paymentPlan: "INSTALLMENTS",
    status: "ENROLLED",
    currentLevel: 4,
    enrolledAt: new Date(),
    installment2Paid: false,
  });

  // 7. Dynamic Abandoned Order (> 70 mins old)
  await dbManager.commerce.upsertOrder({
    id: "ord_ab_101",
    enrollmentId: "enr_01",
    userId: "usr_parent_01",
    orderType: "FULL_PAYMENT",
    amountInPaise: 499900,
    status: "AWAITING_PAYMENT",
    checkoutUrl: "https://thinkova.ai/enrol/checkout?orderId=ord_ab_101",
    expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
    createdAt: new Date(Date.now() - 70 * 60 * 1000),
  });

  // 8. Dynamic Newly Paid Order
  await dbManager.commerce.upsertOrder({
    id: "ord_paid_202",
    enrollmentId: "enr_01",
    userId: "usr_parent_01",
    orderType: "FULL_PAYMENT",
    amountInPaise: 499900,
    status: "PAID",
    checkoutUrl: "https://thinkova.ai/enrol/checkout?orderId=ord_paid_202",
    expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
    createdAt: new Date(Date.now() - 5 * 60 * 1000),
  });

  // 9. Dynamic Unsent Weekly Assessment / Evaluation
  await dbManager.commerce.upsertAssessment({
    id: "ass_01",
    studentId: "stu_01",
    cohortBatchId: "batch_dps_01",
    levelNumber: 3,
    levelTitle: "Voice-AI Interactive Assistant",
    attendance: "PRESENT",
    projectTitle: "School Homework Voice Agent",
    projectArtifactUrl: "https://thinkova.ai/showcase/arjun/level-3",
    tutorScore: 5,
    tutorFeedback: "Arjun demonstrated remarkable mastery of prompt chaining and connected his agent to weather and math APIs.",
    safetyPledgeVerified: true,
    createdAt: new Date(),
  });
}


export async function authenticateParent(request: Request, id = "fixture-parent") {
  const body = request.method === "POST" ? await request.clone().json() : {};
  const user = { id, email: body.parentEmail || "parent@example.test", username: body.parentName || "Parent",
    fullName: body.parentName || "Parent", phone: body.parentPhone || "9876543210", role: "PARENT" as const,
    isEmailVerified: true, isPhoneVerified: true, createdAt: new Date(), consentTimestamp: new Date() };
  await dbManager.commerce.upsertUser(user);
  const token = await createSessionToken({ ...user, userId: id });
  request.headers.set("Authorization", "Bearer " + token);
}

export async function createTestSession(payload: Parameters<typeof createSessionToken>[0]) {
  await dbManager.commerce.upsertUser({ ...payload, id: payload.userId, isPhoneVerified: true,
    isEmailVerified: true, consentTimestamp: new Date(), createdAt: new Date() });
  return createSessionToken(payload);
}
