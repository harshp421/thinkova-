import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { dbManager } from "@/../backend/database/client";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    let user = await dbManager.commerce.getUserById(session.userId);
    if (!user) {
      // Re-create user from verified HMAC-SHA256 session token to prevent false 401 on server reloads
      const restoredUser = {
        id: session.userId,
        email: session.email,
        username: session.username || session.email.split("@")[0] || "parent",
        fullName: session.fullName || "Parent",
        phone: session.phone || "",
        role: session.role || "PARENT",
        isPhoneVerified: Boolean(session.phone),
        isEmailVerified: true,
        consentTimestamp: new Date(),
        createdAt: new Date(session.createdAt || Date.now()),
      };
      await dbManager.commerce.upsertUser(restoredUser);
      user = restoredUser;
    }

    const students = await dbManager.commerce.getStudentsByParentId(user.id);

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

