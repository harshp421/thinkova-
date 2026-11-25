import { dbRouter } from "@/../backend/database/router/db-router";
import { NextResponse } from "next/server";
import { clearSessionCookie, getSessionFromRequest } from "@/lib/auth-session";

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (session) await dbRouter.delete("sessions", session.sessionId, "commerce");
  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  clearSessionCookie(response);
  return response;
}

