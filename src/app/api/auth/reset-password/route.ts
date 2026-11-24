import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";
import { notificationDispatcher } from "@/../backend/notifications/dispatcher";
import { hashPassword } from "@/../backend/auth/crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").toLowerCase().trim();
    const token = String(body.token || "").trim();
    const password = String(body.password || "").trim();

    if (!email || !token) {
      return NextResponse.json({ error: "Invalid or missing reset token parameters." }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const user = await dbManager.commerce.getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "Invalid password reset request." }, { status: 400 });
    }

    // Verify reset token match and expiration
    if (!user.resetPasswordToken || user.resetPasswordToken !== token) {
      return NextResponse.json(
        { error: "This password reset link is invalid or has already been used. Please request a new one." },
        { status: 400 }
      );
    }

    if (!user.resetPasswordExpires || new Date(user.resetPasswordExpires) < new Date()) {
      return NextResponse.json(
        { error: "This password reset link has expired (links are valid for 1 hour). Please request a new one." },
        { status: 400 }
      );
    }

    // Update password hash and invalidate reset token
    user.passwordHash = hashPassword(password);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await dbManager.commerce.upsertUser(user);
    console.log(`[Reset Password] Password successfully reset for user: ${user.id} (${user.email})`);

    // Dispatch confirmation notifications
    try {
      await notificationDispatcher.sendEmail({
        to: user.email,
        subject: "Your ThinkOva password was updated",
        text: `Hello ${user.fullName || "ThinkOva Parent"},\n\nYour ThinkOva password was successfully updated. You can now log into your parent portal.\n\nWarm regards,\nThe ThinkOva Team`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0B0C0F; background: #F8F7F4; border-radius: 16px;">
            <div style="background: #0B0C0F; padding: 20px 24px; border-radius: 12px; margin-bottom: 24px; text-align: left;">
              <span style="font-size: 22px; font-weight: bold; color: #FFFFFF; letter-spacing: -0.5px;">Think<span style="color: #FF6026;">Ova</span></span>
            </div>
            <h1 style="font-size: 22px; font-weight: bold; margin-bottom: 16px; color: #0B0C0F;">Password successfully updated</h1>
            <p style="font-size: 15px; line-height: 24px; color: #5A5F6B; margin-bottom: 24px;">
              Hello ${user.fullName || "there"},<br/><br/>
              Your ThinkOva password has been updated. You can now sign in to manage your child's courses and schedule.
            </p>
            <div style="margin: 28px 0;">
              <a href="https://www.thinkova.ai/login" style="background: #FF6026; color: #ffffff; padding: 13px 32px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
                Log In Now &rarr;
              </a>
            </div>
            <p style="font-size: 12px; color: #8F94A0; margin-top: 32px; border-top: 1px solid #E3DFD5; padding-top: 16px;">
              If you did not perform this change, please contact us immediately at info@thinkova.ai.
            </p>
          </div>
        `,
        metadata: { userId: user.id, event: "PASSWORD_RESET_SUCCESS" },
      });

      if (user.phone) {
        await notificationDispatcher.sendWhatsApp({
          to: user.phone,
          templateName: "password_reset_success",
          fallbackText: `Hi ${user.fullName || "there"}, your ThinkOva password was successfully updated. You can now log into your account. If you didn't do this, please contact support at info@thinkova.ai.`,
          metadata: { userId: user.id, event: "PASSWORD_RESET_SUCCESS" },
        });
      }
    } catch (notifyErr) {
      console.warn("[Reset Password] Notification dispatch non-fatal warning:", notifyErr);
    }

    return NextResponse.json({
      success: true,
      message: "Your password has been reset successfully. You can now log in.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
