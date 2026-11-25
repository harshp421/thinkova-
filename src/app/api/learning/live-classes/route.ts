import { requireStudentAccess } from "@/lib/student-access";
import { NextRequest, NextResponse } from "next/server";
import { LIVE_SESSIONS, PAST_RECORDINGS, type LiveClassSession } from "@/data/live-classes";
import { dbManager } from "@/../backend/database/client";

export async function GET(req: NextRequest) {
  try {
    const studentId = req.nextUrl.searchParams.get("studentId");
    const denied = await requireStudentAccess(req, studentId);
    if (denied) return denied;

    if (!studentId) {
      return NextResponse.json({
        success: true,
        studentId: null,
        isEnrolled: false,
        nextLiveClass: null,
        upcomingSchedule: [],
        pastRecordings: [],
      });
    }

    // Query enrollments in MongoDB Atlas for this student
    const enrollments = await dbManager.commerce.getEnrollmentsByStudentId(studentId);
    const activeEnrollment = enrollments.find(
      (e) => e.status === "ENROLLED"
    );

    // If student has no active enrollment, no live classes should be shown
    if (!activeEnrollment) {
      return NextResponse.json({
        success: true,
        studentId,
        isEnrolled: false,
        nextLiveClass: null,
        upcomingSchedule: [],
        pastRecordings: [],
      });
    }

    // Look up assigned cohort batch and tutor
    let batch = null;
    let tutor = null;
    const batchId = activeEnrollment.cohortBatchId;
    if (batchId) {
      batch = await dbManager.schools.getBatch(batchId);
      if (batch?.tutorId) {
        tutor = await dbManager.schools.getTutor(batch.tutorId);
      }
    }

    const course = activeEnrollment.courseId
      ? await dbManager.schools.getCourseById(activeEnrollment.courseId)
      : null;

    const level = activeEnrollment.currentLevel || 1;
    const dateDisplay = batch?.dayOfWeek || (course?.classSchedule ? course.classSchedule.split(",")[0]?.trim() : "Thu");
    const timeDisplay = batch ? `${batch.startTime} - ${batch.endTime}` : (course?.classSchedule && course.classSchedule.includes(",") ? course.classSchedule.split(",")[1]?.trim() : "6:00 PM");

    const isLiveNow = batch?.status === "RUNNING";

    const tutorName = tutor?.fullName || course?.tutor?.name || "Ms Ananya";
    const tutorRole = course?.tutor?.title || "Lead AI & Robotics Educator";
    const tutorAvatar = tutor?.photoUrl || course?.tutor?.avatar || "/avatars/tutors/ananya.png";

    const liveSession: LiveClassSession = {
      id: `live-${activeEnrollment.id}-${level}`,
      levelNumber: level,
      title: `Level ${level}: ${course?.title || "Live Cohort Studio"}`,
      topicDescription: `Hands-on in-school lab session with ${tutorName}.`,
      dateDisplay: dateDisplay || "Upcoming Session",
      timeDisplay: timeDisplay || "6:00 PM",
      durationMinutes: 90,
      tutorName,
      tutorRole,
      tutorAvatar,
      status: isLiveNow ? "LIVE_NOW" : "UPCOMING",
      meetUrl: "https://meet.google.com/thinkova-ai-demo",
      prepNotes: [
        `Review Level ${Math.max(1, level - 1)} deliverables before entering the lab`,
        "Bring your school hardware kit or laptop",
        "Tutor support available during live lab hours",
      ],
    };

    return NextResponse.json({
      success: true,
      studentId,
      isEnrolled: true,
      nextLiveClass: liveSession,
      upcomingSchedule: [liveSession],
      pastRecordings: [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
