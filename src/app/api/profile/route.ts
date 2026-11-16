import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, createSessionToken, setSessionCookie } from "@/lib/auth-session";
import { dbManager } from "@/../backend/database/client";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await dbManager.commerce.getUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const students = await dbManager.commerce.getStudentsByParentId(user.id);

    return NextResponse.json({
      success: true,
      user,
      students,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session?.userId) {
      return NextResponse.json({ error: "Please log in to update your profile." }, { status: 401 });
    }

    const body = await req.json();
    const {
      fullName,
      phone,
      studentId,
      studentName,
      grade,
      schoolName,
      persona,
      reminders,
    } = body;

    const existingUser = await dbManager.commerce.getUserById(session.userId);
    if (!existingUser) {
      return NextResponse.json({ error: "User profile not found." }, { status: 404 });
    }

    const updatedPhone = phone !== undefined ? String(phone).trim() : existingUser.phone;
    const updatedFullName = fullName !== undefined ? String(fullName).trim() : existingUser.fullName;

    // Validate phone if provided
    if (phone !== undefined) {
      const cleanDigits = updatedPhone.replace(/\D/g, "");
      if (cleanDigits.length < 10) {
        return NextResponse.json(
          { error: "Please enter a valid 10-digit mobile number." },
          { status: 400 }
        );
      }
    }

    // Update parent user in database
    const updatedUser = {
      ...existingUser,
      fullName: updatedFullName,
      phone: updatedPhone,
      updatedAt: new Date(),
    };
    await dbManager.commerce.upsertUser(updatedUser);

    // If student info was provided, update student profile as well
    let updatedStudent = null;
    if (studentId) {
      const student = await dbManager.commerce.getStudentById(studentId);
      if (student && student.parentUserId === session.userId) {
        const gradeNum = typeof grade === "number" ? grade : parseInt(String(grade).replace(/\D/g, ""), 10) || student.currentGrade;
        updatedStudent = {
          ...student,
          fullName: studentName ? String(studentName).trim() : student.fullName,
          schoolName: schoolName ? String(schoolName).trim() : student.schoolName,
          currentGrade: gradeNum,
          preferredTrack: persona || student.preferredTrack,
        };
        await dbManager.commerce.upsertStudent(updatedStudent);
      }
    }

    // Refresh the session token with new phone and name
    const token = await createSessionToken({
      userId: updatedUser.id,
      email: updatedUser.email,
      username: updatedUser.username,
      fullName: updatedUser.fullName || updatedUser.username,
      phone: updatedUser.phone || "",
      role: updatedUser.role,
    });

    const response = NextResponse.json({
      success: true,
      message: "Profile updated successfully.",
      user: updatedUser,
      student: updatedStudent,
      reminders,
    });

    setSessionCookie(response, token);
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
