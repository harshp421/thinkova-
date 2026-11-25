import { NextResponse } from "next/server";

export async function POST(_request: Request) {
  return NextResponse.json({ error: "Use checkout to enroll in a paid course." }, { status: 410 });
}
