import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";
import { StudentEntity, EnrollmentEntity } from "@/../backend/database/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const tutorId = searchParams.get("tutorId") || "tutor_lead_01";

    // 1. Fetch Tutor Profile from MongoDB Atlas
    let tutor = await dbManager.schools.getTutor(tutorId);
    if (!tutor) {
      const allTutors = await dbManager.schools.listAllTutors();
      if (allTutors.length > 0 && allTutors[0]) {
        tutor = allTutors[0];
      }
    }

    // 2. Fetch Batches for this tutor or all active batches
    const effectiveTutorId = tutor?.id || tutorId;
    let batches = await dbManager.schools.listBatchesByTutorId(effectiveTutorId);
    if (!batches || batches.length === 0) {
      batches = await dbManager.schools.listAllBatches();
    }

    // 3. For the active batch, resolve School details
    const activeBatch = batches && batches.length > 0 ? batches[0] : null;
    const school = activeBatch?.schoolId
      ? await dbManager.schools.findByUid(activeBatch.schoolId)
      : null;

    // 4. Resolve real enrolled students in this batch from MongoDB Atlas
    const dbEnrollments = activeBatch
      ? await dbManager.commerce.getEnrollmentsByBatchId(activeBatch.id)
      : [];

    const roster: Array<{
      student: StudentEntity;
      enrollment: EnrollmentEntity;
      parentName?: string;
      parentPhone?: string;
      parentEmail?: string;
      trackTitle?: string;
    }> = [];

    if (dbEnrollments.length > 0) {
      for (const enr of dbEnrollments) {
        const student = await dbManager.commerce.getStudentById(enr.studentId);
        if (student) {
          const parent = await dbManager.commerce.getUserById(student.parentUserId);
          roster.push({
            student,
            enrollment: enr,
            parentName: parent?.fullName || parent?.username || "Parent",
            parentPhone: parent?.phone,
            parentEmail: parent?.email,
            trackTitle: enr.courseId || student.preferredTrack || "STEM Track",
          });
        }
      }
    }

    // 5. Fetch Assessments for this batch
    const assessments = activeBatch
      ? await dbManager.commerce.getAssessmentsByBatchId(activeBatch.id)
      : [];

    return NextResponse.json({
      success: true,
      tutor,
      batches,
      activeBatch: activeBatch
        ? {
            ...activeBatch,
            schoolName: school?.officialName || "ThinkOva Partner School",
            schoolCity: school?.city || "Pune",
            labRoom: school?.labRoomNumber || "Science & Innovation Lab",
          }
        : null,
      roster,
      assessments,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
