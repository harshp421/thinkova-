/**
 * Entity Types for Dual-Database Backend:
 * - schools_db (Institutional & Facility Management)
 * - students_commerce_db (Parents, Students & Commercial Ledger)
 */

// ==========================================
// 1. schools_db Entities
// ==========================================

export interface SchoolEntity {
  id: string;
  schoolUid: string;
  officialName: string;
  slug: string;
  city: string;
  state: string;
  board: "CBSE" | "ICSE" | "STATE" | "IB";
  labRoomNumber?: string;
  labCapacity: number;
  coordinatorName?: string;
  coordinatorPhone?: string;
  coordinatorEmail?: string;
  partnerCommissionPct: number;
  status: "ACTIVE" | "PENDING" | "ARCHIVED";
  createdAt: Date;
}

export interface SchoolAliasEntity {
  id: string;
  schoolId: string;
  aliasName: string;
}

export interface TutorEntity {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  bio?: string;
  photoUrl?: string;
  backgroundVerified: boolean;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
}

export interface CohortBatchEntity {
  id: string;
  schoolId: string;
  tutorId: string;
  batchCode: string;
  gradeLevels: number[];
  dayOfWeek: string;
  startTime: string; // e.g. "14:30"
  endTime: string;   // e.g. "16:00"
  maxCapacity: number; // default: 25
  confirmedStudentsCount: number;
  startDate: Date;
  level5Date: Date;
  demoDayDate: Date;
  status: "UPCOMING" | "RUNNING" | "COMPLETED";
  createdAt: Date;
}

export interface CourseWeeklyPlanItem {
  week: number;
  title: string;
  subtitle: string;
  tags?: string[];
  videoUrl?: string;
  recordingDuration?: string;
  uploadedAt?: Date;
}

export interface CourseVideoEntity {
  id: string;
  courseId: string;
  batchId?: string;
  weekNumber: number;
  lessonNumber?: number;
  title: string;
  videoUrl: string;
  tutorId?: string;
  tutorName?: string;
  duration?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseEntity {
  id: string; // e.g. "robotics-starter"
  title: string;
  trackId: string; // "robotics", "electronics", "ai", "games", "design"
  trackName: string;
  grades: string; // "Grades 5–7"
  minGrade: number; // 5
  maxGrade: number; // 7
  targetGrades: number[]; // [5, 6, 7]
  duration: string; // "6 weeks"
  price: number; // 5499
  priceFormatted: string; // "₹5,499"
  twoPartsPriceFormatted: string; // "₹5,999"
  firstPartFormatted: string; // "₹3,000"
  secondPartFormatted: string; // "₹2,999"
  nextBatch: string; // "Starts 6 Dec"
  summary: string;
  whatTheyBuild: string;
  image: string;
  heroImage?: string;
  popularTag?: string;
  kitIncluded?: boolean;
  classSchedule?: string;
  location?: string;
  seatsLeft?: number;
  demoDayPromise?: string;
  demoDayTests?: string[];
  tutor?: {
    name: string;
    title: string;
    bio: string;
    avatar?: string;
  };
  weeklyPlan?: CourseWeeklyPlanItem[];
  status: "ACTIVE" | "ARCHIVED";
  createdAt: Date;
  updatedAt?: Date;
}

export interface TrackEntity {
  id: string; // "robotics", "electronics", "ai", "games", "design"
  name: string;
  slug: string;
  filterLabel: string;
  tagline: string;
  description: string;
  priceRange: string;
  minPrice: number;
  gradeRange: string;
  image: string;
  courseIds: string[];
  status: "ACTIVE" | "ARCHIVED";
  createdAt: Date;
}

// ==========================================
// 2. students_commerce_db Entities
// ==========================================

export interface UserEntity {
  id: string;
  phone?: string;
  email: string;
  username: string;
  fullName?: string;
  role: "PARENT" | "TUTOR" | "SCHOOL_ADMIN" | "SUPER_ADMIN";
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  consentTimestamp: Date;
  createdAt: Date;
}

export interface StudentEntity {
  id: string;
  parentUserId: string;
  fullName: string;
  schoolUid: string;
  schoolName?: string;
  currentGrade: number; // 5, 6, 7, 8, 9, 10, 11
  section?: string;
  preferredTrack?: string;
  priorExperience?: string;
  avatarUrl?: string;
  createdAt: Date;
}

export interface EnrollmentEntity {
  id: string;
  studentId: string;
  cohortBatchId: string;
  courseId?: string;
  schoolUid: string;
  paymentPlan: "FULL" | "INSTALLMENTS";
  status: "PENDING_PAYMENT" | "ENROLLED" | "DROPPED" | "REFUNDED";
  currentLevel: number;
  enrolledAt: Date;
  installment2Paid?: boolean;
  installmentReminderSentAt?: Date;
}

export interface OrderEntity {
  id: string;
  enrollmentId: string;
  userId: string;
  orderType: "FULL_PAYMENT" | "INSTALLMENT_1" | "INSTALLMENT_2";
  amountInPaise: number;
  status: "AWAITING_PAYMENT" | "PAID" | "FAILED" | "EXPIRED";
  failureReason?: string;
  checkoutUrl: string;
  expiresAt: Date;
  createdAt: Date;
  abandonedAlertSentAt?: Date;
  enrolmentNotificationSentAt?: Date;
  failureAlertSentAt?: Date;
}

export interface PaymentEntity {
  id: string;
  orderId: string;
  gateway: "RAZORPAY" | "CASHFREE";
  gatewayOrderId: string;
  gatewayPaymentId: string;
  paymentMethod: "UPI" | "CARD" | "NETBANKING";
  amountInPaise: number;
  status: "SUCCESS" | "FAILED" | "REFUNDED";
  paidAt: Date;
}

export interface RefundEntity {
  id: string;
  paymentId: string;
  enrollmentId: string;
  amountInPaise: number;
  reason: "DEMO_DAY_GUARANTEE" | "CLIENT_WITHDRAWAL" | "BATCH_CANCELLED";
  initiatedBy: "CLIENT" | "MANAGEMENT";
  gatewayRefundId?: string;
  status: "INITIATED" | "PROCESSING" | "COMPLETED" | "FAILED";
  estimatedCreditDays: string;
  initiatedAt: Date;
  completedAt?: Date;
  refundAlertSentAt?: Date;
}

export interface AssessmentEntity {
  id: string;
  studentId: string;
  cohortBatchId: string;
  levelNumber: number;
  levelTitle: string;
  attendance: "PRESENT" | "ABSENT";
  projectTitle: string;
  projectArtifactUrl: string;
  tutorScore: number; // 1-5
  tutorFeedback: string;
  safetyPledgeVerified: boolean;
  reportSentAt?: Date;
  createdAt: Date;
}

// ==========================================
// 3. Learning State & Multi-State Analytics
// ==========================================

export type StudentPersona =
  | "BUILDER"        // Hands-on kit experimentation, circuits & hardware
  | "EXPLORER"       // Breadth over depth, samples multiple tracks
  | "LOGICIAN"       // Algorithmic focus, prompt engineering & state trees
  | "CREATOR"        // Game design, sprites, UI aesthetics & storytelling
  | "PERFECTIONIST"; // Iterative refinement until 100% demo tests pass

export interface CourseMilestone {
  id: string;
  weekNumber: number;
  title: string;
  summary: string;
  completed: boolean;
  score?: number;
  completedAt?: Date;
  artifactUrl?: string;
  tutorNote?: string;
  videoUrl?: string;
}

export interface OrderWithFullDetails {
  order: OrderEntity;
  payment: PaymentEntity | null;
  enrollment: EnrollmentEntity;
  student: StudentEntity;
  user: UserEntity;
  course: CourseEntity | null;
  batch: CohortBatchEntity | null;
}

export interface CourseProgressEntity {
  id: string;
  studentId: string;
  courseId: string;
  courseTitle: string;
  trackId: string;
  enrollmentId: string;
  parentUserId: string;
  status: "ACTIVE" | "COMPLETED" | "PAUSED";
  currentWeek: number;
  totalWeeks: number;
  frequencyPerWeek: number; // in labs/sessions
  frequencyLabel: string;   // e.g. "1 live lab/week + weekly challenge"
  completedMinutes: number;
  totalEstimatedMinutes: number;
  lengthLeftMinutes: number;
  completionPercentage: number; // 0 - 100
  persona: StudentPersona;
  milestones: CourseMilestone[];
  streakDays: number;
  lastActiveAt: Date;
  nextSessionAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LearningStateAnalysisEntity {
  id: string;
  studentId: string;
  courseId: string;
  persona: StudentPersona;
  frequencyScore: number;       // 0 - 100 regularity index
  completionVelocity: number;   // % progress vs timeline ratio (e.g. 1.15 is ahead)
  lengthLeftWeeks: number;
  projectedDemoDay: Date;
  followRoute: "ACCELERATED" | "STANDARD" | "REINFORCEMENT";
  strengths: string[];
  areasOfGrowth: string[];
  recommendedNextTrack?: string;
  parentReportPill: string;     // e.g. "Excellent progress · Ready for Demo Day test 2"
  analyzedAt: Date;
}


