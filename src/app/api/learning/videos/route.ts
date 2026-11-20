import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";

export async function GET(req: NextRequest) {
  try {
    const courseId = req.nextUrl.searchParams.get("courseId") || "robotics-starter";
    const weekNumber = Number(req.nextUrl.searchParams.get("weekNumber") || 1);
    const studentId = req.nextUrl.searchParams.get("studentId");

    let isEnrolled = false;
    let studentProgress = null;

    if (studentId) {
      const enrollments = await dbManager.commerce.getEnrollmentsByStudentId(studentId);
      isEnrolled = enrollments.some(
        (e) => (e.courseId === courseId || !e.courseId) && e.status === "ENROLLED"
      );
      studentProgress = await dbManager.commerce.getCourseProgressByStudent(studentId, courseId);
    }

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
      isEnrolled,
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
