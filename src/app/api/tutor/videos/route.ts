import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";

export async function GET(req: NextRequest) {
  try {
    const courseId = req.nextUrl.searchParams.get("courseId") || "robotics-starter";
    const batchId = req.nextUrl.searchParams.get("batchId") || undefined;

    const shared = await dbManager.commerce.getSharedCurriculum(courseId, batchId);

    return NextResponse.json({
      success: true,
      courseId,
      batchId: batchId || null,
      courseTitle: shared.course?.title || "Course Studio",
      weeklyPlan: shared.weeklyPlan,
      videos: shared.videos,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const courseId = String(body.courseId || "").trim();
    const weekNumber = Number(body.weekNumber || 1);
    const videoUrl = String(body.videoUrl || "").trim();
    const title = String(body.title || `Level ${weekNumber} Lab Recording`).trim();
    const tutorName = String(body.tutorName || "Ms Ananya").trim();
    const tutorId = String(body.tutorId || "tutor_lead_01").trim();
    const duration = String(body.duration || "18 min").trim();
    const notes = body.notes ? String(body.notes).trim() : undefined;
    const batchId = body.batchId ? String(body.batchId).trim() : undefined;

    if (!courseId) {
      return NextResponse.json({ error: "Missing required 'courseId' parameter" }, { status: 400 });
    }
    if (!videoUrl) {
      return NextResponse.json({ error: "Missing required 'videoUrl' parameter" }, { status: 400 });
    }

    const videoEntity = {
      id: `vid_${courseId}_w${weekNumber}`,
      courseId,
      batchId,
      weekNumber,
      title,
      videoUrl,
      tutorId,
      tutorName,
      duration,
      notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 1. Save video entity & sync into thinkova_schools.courses weeklyPlan
    await dbManager.schools.upsertCourseVideo(videoEntity);

    // 2. Real-time sync into all active student course_progress in thinkova_commerce
    const enrollments = await dbManager.commerce.getEnrollmentsByBatchId(batchId || `batch_pune_campus_01`);
    for (const enr of enrollments) {
      const progress = await dbManager.commerce.getCourseProgressByStudent(enr.studentId, courseId);
      if (progress && progress.milestones) {
        let changed = false;
        const updatedMilestones = progress.milestones.map((m) => {
          if (m.weekNumber === weekNumber) {
            changed = true;
            return { ...m, videoUrl };
          }
          return m;
        });
        if (changed) {
          await dbManager.commerce.upsertCourseProgress({
            ...progress,
            milestones: updatedMilestones,
            updatedAt: new Date(),
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Video uploaded and synchronized in real time for ${courseId} (Level ${weekNumber})!`,
      video: videoEntity,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
