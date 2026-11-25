import { getSessionFromRequest } from "@/lib/auth-session";
import { tutorAssigned } from "@/lib/student-access";
import { requireStudentAccess } from "@/lib/student-access";
import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";

interface TutorQuestion {
  id: string;
  studentId: string;
  studentName: string;
  lessonTitle: string;
  questionText: string;
  attachmentName?: string;
  status: "submitted" | "answered";
  createdAt: string;
  tutorReply?: {
    tutorName: string;
    tutorRole: string;
    repliedAt: string;
    message: string;
  };
}

// In-memory questions store (can be persisted to MongoDB Atlas)
const tutorQuestionsStore: TutorQuestion[] = [];

export async function GET(req: NextRequest) {
  try {
    const isAll = req.nextUrl.searchParams.get("all") === "true";
    const studentId = req.nextUrl.searchParams.get("studentId");
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (isAll) {
      if (session.role !== "TUTOR" && session.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const questions = [];
      for (const q of tutorQuestionsStore) {
        if (session.role === "SUPER_ADMIN" || await tutorAssigned(q.studentId, session.email)) questions.push(q);
      }
      return NextResponse.json({ success: true, questions });
    }
    const denied = await requireStudentAccess(req, studentId);
    if (denied) return denied;
    const courseId = req.nextUrl.searchParams.get("courseId");

    // Fetch tutor info dynamically from student's enrolled course / batch
    let tutorInfo = {
      name: "School STEM Mentor",
      role: "Lead Lab Instructor",
      school: "ThinkOva Partner School",
      availability: "Replies during in-school lab hours",
      avatarUrl: "/avatars/tutors/mentor.png",
    };

    if (studentId) {
      const student = await dbManager.commerce.getStudentById(studentId);
      if (student?.schoolName) {
        tutorInfo.school = student.schoolName;
      }
      const enrollments = await dbManager.commerce.getEnrollmentsByStudentId(studentId);
      const activeEnr = enrollments.find((e) => e.status === "ENROLLED") || enrollments[0];
      if (activeEnr?.cohortBatchId) {
        const batch = await dbManager.schools.getBatch(activeEnr.cohortBatchId);
        if (batch?.tutorId) {
          const tutor = await dbManager.schools.getTutor(batch.tutorId);
          if (tutor) {
            tutorInfo = {
              name: tutor.fullName,
              role: tutor.bio?.slice(0, 40) || "Lead Educator",
              school: student?.schoolName || "ThinkOva Partner School",
              availability: "Available during weekly lab session",
              avatarUrl: tutor.photoUrl || "/avatars/tutors/mentor.png",
            };
          }
        }
      } else if (courseId || activeEnr?.courseId) {
        const course = await dbManager.schools.getCourseById(courseId || activeEnr?.courseId || "");
        if (course?.tutor) {
          tutorInfo = {
            name: course.tutor.name,
            role: course.tutor.title || "Course Instructor",
            school: student?.schoolName || "ThinkOva Partner School",
            availability: "Replies within 24 hours",
            avatarUrl: course.tutor.avatar || "/avatars/tutors/mentor.png",
          };
        }
      }
    }

    const studentQuestions = isAll || !studentId
      ? tutorQuestionsStore
      : tutorQuestionsStore.filter((q) => q.studentId === studentId);

    return NextResponse.json({
      success: true,
      questions: studentQuestions,
      tutor: tutorInfo,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Tutor reply action from Tutor Dashboard
    if (body.action === "reply" && body.questionId) {
      const q = tutorQuestionsStore.find((item) => item.id === body.questionId);
      if (!q) {
        return NextResponse.json({ error: "Question not found" }, { status: 404 });
      }

      const session = await getSessionFromRequest(req);
      if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      if (session.role !== "SUPER_ADMIN" && !(session.role === "TUTOR" && await tutorAssigned(q.studentId, session.email))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const tutorName = session.fullName;
      const tutorRole = String(body.tutorRole || "Lab Mentor").trim();
      const message = String(body.message || "").trim();

      if (!message) {
        return NextResponse.json({ error: "Reply message cannot be empty." }, { status: 400 });
      }

      q.status = "answered";
      q.tutorReply = {
        tutorName,
        tutorRole,
        repliedAt: new Date().toISOString(),
        message,
      };

      return NextResponse.json({
        success: true,
        message: "Reply sent to student portal.",
        question: q,
      });
    }

    const studentId = String(body.studentId || "").trim();
    const denied = await requireStudentAccess(req, studentId);
    if (denied) return denied;
    if (!studentId) {
      return NextResponse.json(
        { error: "Missing required studentId parameter." },
        { status: 400 }
      );
    }

    // Resolve real student name from MongoDB Atlas if not provided
    let studentName = String(body.studentName || "").trim();
    if (!studentName) {
      const student = await dbManager.commerce.getStudentById(studentId);
      studentName = student?.fullName || "Student";
    }

    const lessonTitle = String(body.lessonTitle || "Studio Lesson").trim();
    const questionText = String(body.questionText || "").trim();
    const attachmentName = body.attachmentName ? String(body.attachmentName).trim() : undefined;

    if (!questionText) {
      return NextResponse.json(
        { error: "Question text cannot be empty." },
        { status: 400 }
      );
    }

    const newQuestionId = `tq-${Date.now()}`;

    const questionEntry: TutorQuestion = {
      id: newQuestionId,
      studentId,
      studentName,
      lessonTitle,
      questionText,
      attachmentName,
      status: "submitted",
      createdAt: new Date().toISOString(),
    };

    tutorQuestionsStore.unshift(questionEntry);

    return NextResponse.json({
      success: true,
      message: "Question successfully delivered to your mentor. Awaiting tutor reply.",
      notificationSent: true,
      question: questionEntry,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
