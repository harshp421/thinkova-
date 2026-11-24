import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";
import { createSessionToken, setSessionCookie } from "@/lib/auth-session";
import { verifyPassword, hashPassword } from "@/../backend/auth/crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const identifier = String(body.identifier || body.email || body.phone || "").trim();
    const password = String(body.password || "").trim();

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

    // [SEC-03] Passwordless Account Takeover Prevention:
    // If an account lacks a passwordHash (e.g. imported lead/pre-registered roster),
    // callers MUST NOT be allowed to log in without verified password setup via the forgot-password email flow.
    if (!user.passwordHash) {
      return NextResponse.json(
        {
          error: "Password setup is required for this account. Please use 'Forgot password?' to set up your password securely via your registered email.",
          code: "PASSWORD_SETUP_REQUIRED",
        },
        { status: 403 }
      );
    }

    if (!password) {
      return NextResponse.json(
        {
          error: "Please enter your password.",
          code: "PASSWORD_REQUIRED",
        },
        { status: 400 }
      );
    }

    const isMatch = verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return NextResponse.json(
        {
          error: "Incorrect password. Please try again or click 'Forgot password?'.",
          code: "INVALID_CREDENTIALS",
        },
        { status: 401 }
      );
    }

    // Resolve appropriate redirect path based on user role and onboarding status
    let redirectTo = "/who-is-learning";
    if (user.role === "TUTOR" || user.role === "SUPER_ADMIN") {
      redirectTo = "/tutor";
    } else {
      const students = await dbManager.commerce.getStudentsByParentId(user.id);
      redirectTo = students.length > 0 ? "/who-is-learning" : "/tell-us-child";
    }

    const students = user.role === "PARENT"
      ? await dbManager.commerce.getStudentsByParentId(user.id)
      : [];

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      fullName: (user as { fullName?: string }).fullName || user.username,
      phone: user.phone,
      role: user.role,
    });

    // Strip sensitive fields before returning
    const { passwordHash: _ph, resetPasswordToken: _rt, resetPasswordExpires: _re, ...safeUser } = user;

    const response = NextResponse.json({
      success: true,
      user: safeUser,
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
