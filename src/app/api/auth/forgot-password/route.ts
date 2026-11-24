import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";
import { notificationDispatcher } from "@/../backend/notifications/dispatcher";
import { generatePasswordResetToken } from "@/../backend/auth/crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").toLowerCase().trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const user = await dbManager.commerce.getUserByEmail(email);

    // If user exists, generate reset token and dispatch notifications
    if (user) {
      const { token, expiresAt } = generatePasswordResetToken(1); // 1 hour validity
      user.resetPasswordToken = token;
      user.resetPasswordExpires = expiresAt;

      await dbManager.commerce.upsertUser(user);

      const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.thinkova.ai").replace(/\/$/, "");
      const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`;

      try {
        await notificationDispatcher.sendEmail({
          to: user.email,
          subject: "Reset your ThinkOva password",
          text: `Hello ${user.fullName || "ThinkOva Parent"},\n\nWe received a request to reset your ThinkOva password. Click the link below to choose a new password:\n\n${resetUrl}\n\nThis link is valid for 1 hour. If you did not request this, you can safely ignore this email.\n\nWarm regards,\nThe ThinkOva Team`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0B0C0F; background: #F8F7F4; border-radius: 16px;">
              <div style="background: #0B0C0F; padding: 20px 24px; border-radius: 12px; margin-bottom: 24px; text-align: left;">
                <span style="font-size: 22px; font-weight: bold; color: #FFFFFF; letter-spacing: -0.5px;">Think<span style="color: #FF6026;">Ova</span></span>
              </div>
              <h1 style="font-size: 22px; font-weight: bold; margin-bottom: 16px; color: #0B0C0F;">Reset your password</h1>
              <p style="font-size: 15px; line-height: 24px; color: #5A5F6B; margin-bottom: 24px;">
                Hello ${user.fullName || "there"},<br/><br/>
                We received a request to reset the password for your ThinkOva parent account (<strong>${user.email}</strong>). Click the button below to choose a new secure password:
              </p>
              <div style="margin: 28px 0;">
                <a href="${resetUrl}" style="background: #FF6026; color: #ffffff; padding: 13px 32px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 14px rgba(255,96,38,0.28);">
                  Reset Password &rarr;
                </a>
              </div>
              <p style="font-size: 13px; color: #8F94A0; line-height: 20px; margin-top: 24px;">
                This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email — your account remains completely secure.
              </p>
              <p style="font-size: 12px; color: #8F94A0; margin-top: 32px; border-top: 1px solid #E3DFD5; padding-top: 16px;">
                ThinkOva Education · Practical STEM, AI & Robotics for Grades 5–11.
              </p>
            </div>
          `,
          metadata: { userId: user.id, event: "PASSWORD_RESET_REQUEST" },
        });

        if (user.phone) {
          await notificationDispatcher.sendWhatsApp({
            to: user.phone,
            templateName: "password_reset_request",
            fallbackText: `Hi ${user.fullName || "there"}, you requested to reset your ThinkOva password. Click here to reset: ${resetUrl} (link valid for 1 hour). If you didn't request this, please ignore.`,
            metadata: { userId: user.id, event: "PASSWORD_RESET_REQUEST" },
          });
        }
      } catch (notifyErr) {
        console.warn("[Forgot Password] Notification dispatch non-fatal warning:", notifyErr);
      }
    }

    // Always return success for security (prevents user enumeration)
    return NextResponse.json({
      success: true,
      message: "If an account is associated with this email, we have dispatched a password reset link to your email and WhatsApp.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
