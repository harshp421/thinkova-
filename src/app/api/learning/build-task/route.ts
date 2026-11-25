import { dbRouter } from "@/../backend/database/router/db-router";
import { requireStudentAccess } from "@/lib/student-access";
import { NextRequest, NextResponse } from "next/server";
import {
  TASK_DEFINITIONS,
  SubmittedFile,
  BuildSubmissionRecord,
} from "@/data/learning-tasks";


export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId") || "";
  const denied = await requireStudentAccess(req, studentId);
  if (denied) return denied;
  const taskId = req.nextUrl.searchParams.get("taskId") || "level-1-problem-map";

  const taskDef = TASK_DEFINITIONS[taskId] || TASK_DEFINITIONS["level-6-memory"]!;
  const key = `${studentId}:${taskId}`;

  const existing = await dbRouter.get<BuildSubmissionRecord>("build_submissions", key, "commerce") || {
    submissionId: `sub_${studentId}_${taskId}`,
    studentId,
    taskId,
    taskTitle: taskDef.title,
    files: [taskDef.defaultFile],
    note: taskDef.defaultNote,
    status: "draft_saved",
    savedAt: "2 min ago",
  };

  return NextResponse.json({
    success: true,
    task: taskDef,
    submission: existing,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "save_draft"; // "save_draft" | "submit_build" | "review"
    const studentId = String(body.studentId || "");
    const denied = await requireStudentAccess(req, studentId, action === "review");
    if (denied) return denied;
    const taskId = String(body.taskId || "level-1-problem-map");
    const taskDef = TASK_DEFINITIONS[taskId] || TASK_DEFINITIONS["level-6-memory"]!;
    const key = `${studentId}:${taskId}`;

    if (action === "review") {
      // Tutor review action
      const tutorName = body.tutorName || "Ms Ananya";
      const grade = body.grade || "Pass";
      const feedback =
        body.feedback ||
        "Clear blueprint. Next time, write down one thing that could go wrong and how your agent should handle it.";

      const existing = await dbRouter.get<BuildSubmissionRecord>("build_submissions", key, "commerce") || {
        submissionId: `sub_${studentId}_${taskId}`,
        studentId,
        taskId,
        taskTitle: taskDef.title,
        files: [taskDef.defaultFile],
        note: taskDef.defaultNote,
        status: "submitted",
        savedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
      };

      existing.status = "reviewed";
      existing.reviewedAt = new Date().toISOString();
      existing.review = {
        tutorName,
        tutorAvatar: "AR",
        grade,
        feedback,
      };

      await dbRouter.upsert("build_submissions", { ...existing, id: key }, "commerce");

      return NextResponse.json({
        success: true,
        message: `Submission reviewed by ${tutorName}.`,
        submission: existing,
      });
    }

    const files: SubmittedFile[] =
      body.files && body.files.length > 0
        ? body.files
        : [taskDef.defaultFile];
    const note = typeof body.note === "string" ? body.note : taskDef.defaultNote;
    const isSubmit = action === "submit_build";

    const record: BuildSubmissionRecord = {
      submissionId: `sub_${studentId}_${taskId}`,
      studentId,
      taskId,
      taskTitle: taskDef.title,
      files,
      note,
      status: isSubmit ? "submitted" : "draft_saved",
      savedAt: isSubmit ? "Submitted just now" : "Draft saved just now",
      submittedAt: isSubmit ? new Date().toISOString() : undefined,
    };

    await dbRouter.upsert("build_submissions", { ...record, id: key }, "commerce");

    return NextResponse.json({
      success: true,
      message: isSubmit
        ? "Build task submitted for tutor review!"
        : "Draft saved successfully.",
      submission: record,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
