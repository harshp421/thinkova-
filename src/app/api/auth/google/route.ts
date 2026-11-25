import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Google sign-in is unavailable. Use your email and password." }, { status: 503 });
}
