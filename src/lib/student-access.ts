import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";
import { getSessionFromRequest } from "@/lib/auth-session";

export async function tutorAssigned(studentId: string, email: string) {
  const enrollments = await dbManager.commerce.getEnrollmentsByStudentId(studentId);
  for (const enrollment of enrollments) {
    if (enrollment.status !== "ENROLLED") continue;
    const batch = await dbManager.schools.getBatch(enrollment.cohortBatchId);
    const tutor = batch && await dbManager.schools.getTutor(batch.tutorId);
    if (tutor?.email.toLowerCase() === email.toLowerCase()) return true;
  }
  return false;
}

export async function requireStudentAccess(req: NextRequest, studentId: string | null, tutorOnly = false) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!studentId) return NextResponse.json({ error: "Student required" }, { status: 400 });
  const student = await dbManager.commerce.getStudentById(studentId);
  if (student && session.role === "SUPER_ADMIN") return null;
  if (student && tutorOnly && session.role === "TUTOR" && await tutorAssigned(studentId, session.email)) return null;
  if (student && !tutorOnly && student.parentUserId === session.userId) return null;
  return NextResponse.json({ error: "Student unavailable" }, { status: 404 });
}
