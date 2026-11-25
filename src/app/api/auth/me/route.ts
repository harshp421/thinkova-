import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { dbManager } from "@/../backend/database/client";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const account = await dbManager.commerce.getUserById(session.userId);
    if (!account) return NextResponse.json({ authenticated: false }, { status: 401 });
    const { id, fullName, username, email, phone, role } = account;
    const user = { id, fullName, username, email, phone, role };

    const rawStudents = await dbManager.commerce.getStudentsByParentId(user.id);
    const students = await Promise.all(
      rawStudents.map(async (student) => {
        const enrollments = await dbManager.commerce.getEnrollmentsByStudentId(student.id);
        const activeEnrollment = enrollments.find(
          (e) => e.status === "ENROLLED"
        );
        return {
          ...student,
          isEnrolled: Boolean(activeEnrollment && activeEnrollment.status === "ENROLLED"),
          activeEnrollment: activeEnrollment || null,
        };
      })
    );

    return NextResponse.json({
      authenticated: true,
      user,
      students,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

