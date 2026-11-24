import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";
import { notificationDispatcher } from "@/../backend/notifications/dispatcher";
import { createSessionToken, setSessionCookie } from "@/lib/auth-session";
import { hashPassword } from "@/../backend/auth/crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").toLowerCase().trim();
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "").trim();
    const whatsappUpdates = Boolean(body.whatsappUpdates ?? true);

    if (!fullName || fullName.length < 2) {
      return NextResponse.json({ error: "Please enter your full name." }, { status: 400 });
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    if (!phone || phone.replace(/\D/g, "").length < 10) {
      return NextResponse.json({ error: "Please enter a valid 10-digit mobile number." }, { status: 400 });
    }

    if (password && password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    // 1. Check if user with this email already exists
    const existingEmail = await dbManager.commerce.getUserByEmail(email);
    if (existingEmail) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please log in instead." },
        { status: 409 }
      );
    }

    // 2. Check if user with this mobile number already exists (prevent MongoDB E11000 duplicate key)
    const cleanPhone = phone.replace(/\D/g, "");
    const phone10 = cleanPhone.length === 12 && cleanPhone.startsWith("91") ? cleanPhone.slice(2) : cleanPhone;
    const phone12 = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const existingPhone =
      (await dbManager.commerce.getUserByPhone(cleanPhone)) ||
      (await dbManager.commerce.getUserByPhone(phone10)) ||
      (await dbManager.commerce.getUserByPhone(phone12));

    if (existingPhone) {
      return NextResponse.json(
        { error: "An account with this mobile number already exists. Please log in instead or use another number." },
        { status: 409 }
      );
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const username = (fullName.split(" ")[0] || "parent").toLowerCase() + Math.floor(Math.random() * 899 + 100);
    const passwordHash = password ? hashPassword(password) : undefined;
    const user = {
      id: userId,
      fullName,
      username,
      email,
      phone,
      role: "PARENT" as const,
      isPhoneVerified: true,
      isEmailVerified: true,
      consentTimestamp: new Date(),
      createdAt: new Date(),
      passwordHash,
    };

    // Save to dynamic database layer
    await dbManager.commerce.upsertUser(user);
    console.log(`[Auth Signup] User persisted to database: ${user.id} (${user.email})`);

    // Automation: Dispatch welcome email & optional WhatsApp confirmation
    try {
      const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.thinkova.ai").replace(/\/$/, "");

      await notificationDispatcher.sendEmail({
        to: email,
        subject: `Welcome to ThinkOva, ${fullName}! Set up your child's profile`,
        text: `Hello ${fullName},\n\nThank you for creating your parent account at ThinkOva. The next step is to tell us about your child so we can tailor their learning track.\n\nVisit: ${baseUrl}/tell-us-child\n\nWarm regards,\nThe ThinkOva Team`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0B0C0F; background: #F4F3EE; border-radius: 16px;">
            <div style="background: #0B0C0F; padding: 20px 24px; border-radius: 12px; margin-bottom: 24px; text-align: left;">
              <span style="font-size: 22px; font-weight: bold; color: #FFFFFF; letter-spacing: -0.5px;">Think<span style="color: #FF6B2C;">Ova</span></span>
            </div>
            <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 16px; color: #0B0C0F;">Welcome to ThinkOva, ${fullName}!</h1>
            <p style="font-size: 15px; line-height: 24px; color: #5A5F6B; margin-bottom: 20px;">
              Your parent account has been created successfully. Now, let's set up your child's learning profile to customize course tracks and tutor support.
            </p>
            <div style="margin: 28px 0;">
              <a href="${baseUrl}/tell-us-child" style="background: #FF6B2C; color: #ffffff; padding: 12px 28px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
                Tell us about your child &rarr;
              </a>
            </div>
            <p style="font-size: 12px; color: #8F94A0; margin-top: 32px; border-top: 1px solid #E3E1D9; pt: 16px;">
              ThinkOva Education · Practical STEM, AI & Robotics for Grades 5–11.
            </p>
          </div>
        `,
        metadata: { userId, event: "PARENT_SIGNUP" },
      });

      if (whatsappUpdates) {
        await notificationDispatcher.sendWhatsApp({
          to: phone,
          templateName: "welcome_parent_orientation",
          fallbackText: `Hi ${fullName}, welcome to ThinkOva! We'll send your child's weekly milestone reports and batch timings here. Add your child's details at ${baseUrl}/tell-us-child to begin.`,
          metadata: { userId, event: "PARENT_SIGNUP" },
        });
      }
    } catch (dispatchErr) {
      console.warn("[Auth Signup] Notification dispatch non-fatal warning:", dispatchErr);
    }

    // Issue session token
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
    });

    // Strip sensitive fields before returning
    const { passwordHash: _ph, ...safeUser } = user;

    const response = NextResponse.json({
      success: true,
      user: safeUser,
      redirectTo: "/tell-us-child",
    });

    setSessionCookie(response, token);
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    if (message.includes("E11000") || message.includes("duplicate key")) {
      return NextResponse.json(
        { error: "An account with this email or mobile number already exists. Please log in instead." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
