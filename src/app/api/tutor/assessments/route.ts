import { getSessionFromRequest } from "@/lib/auth-session";
import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";
import { AssessmentEntity } from "@/../backend/database/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!["TUTOR", "SUPER_ADMIN"].includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = req.nextUrl;
    const batchId = searchParams.get("batchId");
    const studentId = searchParams.get("studentId");

    let assessments: AssessmentEntity[] = [];

    if (batchId) {
      assessments = await dbManager.commerce.getAssessmentsByBatchId(batchId);
    } else if (studentId) {
      assessments = await dbManager.commerce.getAssessmentsByStudentId(studentId);
    } else {
      assessments = (await dbManager.commerce.getUnsentAssessments()).map((r) => r.assessment);
    }

    if (session.role === "TUTOR") {
      const tutor = (await dbManager.schools.listAllTutors()).find(item => item.email.toLowerCase() === session.email.toLowerCase());
      const allowed = new Set(tutor ? (await dbManager.schools.listBatchesByTutorId(tutor.id)).map(b => b.id) : []);
      assessments = assessments.filter(item => allowed.has(item.cohortBatchId));
    }
    return NextResponse.json({
      success: true,
      count: assessments.length,
      assessments,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!["TUTOR", "SUPER_ADMIN"].includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json();

    const studentId = String(body.studentId || "").trim();
    const cohortBatchId = String(body.cohortBatchId || "batch_pune_campus_01").trim();
    const levelNumber = Number(body.levelNumber || 1);
    const levelTitle = String(body.levelTitle || `Level ${levelNumber} Assessment`).trim();
    const attendance = (body.attendance === "ABSENT" ? "ABSENT" : "PRESENT") as "PRESENT" | "ABSENT";
    const projectTitle = String(body.projectTitle || "Lab Project Milestone").trim();
    const projectArtifactUrl = String(body.projectArtifactUrl || "").trim();
    const tutorScore = Math.min(5, Math.max(1, Number(body.tutorScore || 5)));
    const tutorFeedback = String(body.tutorFeedback || "Great participation in lab session.").trim();
    const safetyPledgeVerified = Boolean(body.safetyPledgeVerified ?? true);

    if (!studentId) {
      return NextResponse.json({ error: "Missing required studentId parameter." }, { status: 400 });
    }

    if (session.role === "TUTOR") {
      const batch = await dbManager.schools.getBatch(cohortBatchId);
      const tutor = batch && await dbManager.schools.getTutor(batch.tutorId);
      const roster = await dbManager.commerce.getEnrollmentsByBatchId(cohortBatchId);
      if (tutor?.email.toLowerCase() !== session.email.toLowerCase() || !roster.some(e => e.studentId === studentId && e.status === "ENROLLED")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const assessmentId = `asm_${studentId}_lvl${levelNumber}_${Date.now()}`;

    const assessment: AssessmentEntity = {
      id: assessmentId,
      studentId,
      cohortBatchId,
      levelNumber,
      levelTitle,
      attendance,
      projectTitle,
      projectArtifactUrl: projectArtifactUrl || `/artifacts/${studentId}/level-${levelNumber}`,
      tutorScore,
      tutorFeedback,
      safetyPledgeVerified,
      createdAt: new Date(),
    };

    // 1. Persist Assessment to MongoDB Atlas
    await dbManager.commerce.upsertAssessment(assessment);

    // 2. Synchronize Milestone progress with CourseProgress in DB
    try {
      const progress = await dbManager.commerce.getCourseProgressByStudent(studentId);
      if (progress && attendance === "PRESENT" && tutorScore >= 3) {
        const updatedMilestones = (progress.milestones || []).map((m) => {
          if (m.weekNumber === levelNumber) {
            return {
              ...m,
              completed: true,
              completedAt: new Date(),
              score: tutorScore,
              tutorNote: tutorFeedback,
              artifactUrl: projectArtifactUrl,
            };
          }
          return m;
        });

        const completedCount = updatedMilestones.filter((m) => m.completed).length;
        const total = updatedMilestones.length || 6;
        const pct = Math.round((completedCount / total) * 100);

        await dbManager.commerce.upsertCourseProgress({
          ...progress,
          currentWeek: Math.min(total, levelNumber + 1),
          completionPercentage: pct,
          milestones: updatedMilestones,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        });
      }
    } catch (progressErr) {
      console.warn("[Tutor API] Progress sync warning (non-fatal):", progressErr);
    }

    return NextResponse.json({
      success: true,
      message: `Weekly assessment for student successfully recorded in MongoDB Atlas!`,
      assessment,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
