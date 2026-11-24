import { NextResponse } from "next/server";
import { graphMailer } from "../../../../../backend/notifications/graph-mailer";

export const runtime = "nodejs";

/**
 * GET /api/mail/verify & POST /api/mail/verify
 * Tests and verifies Azure AD OAuth2 authentication and Microsoft Graph mailbox connectivity.
 */
export async function GET(request: Request) {
  return handleVerification(request);
}

export async function POST(request: Request) {
  return handleVerification(request);
}

async function handleVerification(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const internalKey = process.env.INTERNAL_API_KEY?.trim();
  const authHeader = request.headers.get("authorization")?.trim();
  const internalSecretHeader =
    request.headers.get("x-internal-secret")?.trim() ||
    request.headers.get("x-api-key")?.trim();

  if (cronSecret || internalKey) {
    const isCronMatch = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isInternalMatch = internalKey && authHeader === `Bearer ${internalKey}`;
    const isHeaderMatch =
      internalSecretHeader &&
      (internalSecretHeader === cronSecret || internalSecretHeader === internalKey);

    if (!isCronMatch && !isInternalMatch && !isHeaderMatch) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await graphMailer.verifyConnection();

    if (!result.success) {
      return NextResponse.json(
        {
          status: "error",
          message: result.message,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      status: "ok",
      provider: "Microsoft Graph API",
      message: result.message,
      details: result.details,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        status: "error",
        message: "Failed to verify Microsoft Graph connectivity",
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}

