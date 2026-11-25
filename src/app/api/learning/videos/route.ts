import { requireStudentAccess } from "@/lib/student-access";
import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";

export async function GET(req: NextRequest) {
  try {
    const requestedCourse = req.nextUrl.searchParams.get("courseId");
    const weekNumber = Number(req.nextUrl.searchParams.get("weekNumber") || 1);
    const studentId = req.nextUrl.searchParams.get("studentId");
    const denied = await requireStudentAccess(req, studentId);
    if (denied) return denied;

    const enrollments = await dbManager.commerce.getEnrollmentsByStudentId(studentId!);
    const enrolled = enrollments.find(e => e.status === "ENROLLED" && (!requestedCourse || e.courseId === requestedCourse));
    if (!enrolled?.courseId) return NextResponse.json({ error: "Enrollment required" }, { status: 403 });
    const courseId = enrolled.courseId;
    const studentProgress = await dbManager.commerce.getCourseProgressByStudent(studentId!, courseId);

    // Dynamic fetch from thinkova_schools.course_videos & shared curriculum
    const [video, shared] = await Promise.all([
      dbManager.schools.getCourseVideoByWeek(courseId, weekNumber),
      dbManager.commerce.getSharedCurriculum(courseId),
    ]);

    const hasUploadedVideo = Boolean(video?.videoUrl);

    return NextResponse.json({
      success: true,
      courseId,
      weekNumber,
      isEnrolled: true,
      courseTitle: shared.course?.title || "ThinkOva Lab Studio",
      hasUploadedVideo,
      video: hasUploadedVideo ? video : null,
      weeklyPlan: shared.weeklyPlan,
      currentMilestone: studentProgress?.milestones.find((m) => m.weekNumber === weekNumber) || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
