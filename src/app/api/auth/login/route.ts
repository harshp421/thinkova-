import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";
import { createSessionToken, setSessionCookie } from "@/lib/auth-session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const identifier = String(body.identifier || body.email || body.phone || "").trim();

    if (!identifier) {
      return NextResponse.json({ error: "Please enter your email or mobile number." }, { status: 400 });
    }

    let user = null;
    if (identifier.includes("@")) {
      user = await dbManager.commerce.getUserByEmail(identifier.toLowerCase());
    } else {
      user = await dbManager.commerce.getUserByPhone(identifier);
    }

    // Check if user exists in dynamic database layer. If not, reject login and prompt signup.
    if (!user) {
      return NextResponse.json(
        {
          error: "No account found with this email. Please sign up to create your parent account.",
          code: "ACCOUNT_NOT_FOUND",
        },
        { status: 404 }
      );
    }

    // Check for saved students
    const students = await dbManager.commerce.getStudentsByParentId(user.id);
    const redirectTo = students.length > 0 ? "/who-is-learning" : "/tell-us-child";

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      fullName: (user as { fullName?: string }).fullName || user.username,
      phone: user.phone,
      role: user.role,
    });

    const response = NextResponse.json({
      success: true,
      user,
      students,
      redirectTo,
    });

    setSessionCookie(response, token);
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
