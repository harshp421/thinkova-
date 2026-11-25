import { getSessionFromRequest } from "@/lib/auth-session";
import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";
import { StudentEntity, EnrollmentEntity } from "@/../backend/database/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!["SUPER_ADMIN", "TUTOR"].includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const tutors = await dbManager.schools.listAllTutors();
    const tutor = session.role === "TUTOR"
      ? tutors.find(item => item.email.toLowerCase() === session.email.toLowerCase())
      : tutors.find(item => item.id === req.nextUrl.searchParams.get("tutorId")) || tutors[0];
    const batches = tutor ? await dbManager.schools.listBatchesByTutorId(tutor.id) : [];

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
