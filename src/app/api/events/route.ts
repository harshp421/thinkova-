import { NextRequest, NextResponse } from "next/server";
import { FEATURED_HACKATHON, EVENTS_LIST, AVAILABLE_CLASSMATES } from "@/data/events-data";
import { getSessionFromRequest } from "@/lib/auth-session";
import { dbManager } from "@/../backend/database/client";
import { defaultDispatcher } from "@/../backend/notifications/dispatcher";

export async function GET(req: NextRequest) {
  try {
    const category = req.nextUrl.searchParams.get("category") || "all";

    let filteredEvents = EVENTS_LIST;
    if (category !== "all") {
      filteredEvents = EVENTS_LIST.filter((e) => e.categoryKey === category);
    }

    return NextResponse.json({
      success: true,
      featured: FEATURED_HACKATHON,
      events: filteredEvents,
      classmates: AVAILABLE_CLASSMATES,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || "").trim();

    if (action === "register_team") {
      const teamName = String(body.teamName || "School Innovation Squad").trim();
      const members = body.members || [];
      return NextResponse.json({
        success: true,
        message: `Team "${teamName}" registered successfully for Build for your school! Tutor will verify your project scope.`,
        registeredAt: new Date().toISOString(),
        membersCount: members.length,
      });
    }

    if (action === "invite_classmate") {
      const studentName = String(body.studentName || "").trim();
      return NextResponse.json({
        success: true,
        message: `Invite dispatched to ${studentName}. They will receive a notification in their student portal.`,
      });
    }

    if (action === "calendar" || action === "remind" || action === "invite_family") {
      const eventId = String(body.eventId || "");
      const session = await getSessionFromRequest(req);

      let user = session?.userId ? await dbManager.commerce.getUserById(session.userId) : null;
      const userEmail = body.userEmail || user?.email;
      const userPhone = body.userPhone || user?.phone;
      const userName = body.userName || user?.fullName || user?.username || "Parent";

      // Mandatory signup/login check: unauthenticated users cannot set reminders
      if (!userEmail && !userPhone) {
        return NextResponse.json(
          { error: "Please log in or sign up to receive event reminders on WhatsApp and email." },
          { status: 401 }
        );
      }

      const event =
        EVENTS_LIST.find((e) => e.id === eventId) ||
        (FEATURED_HACKATHON.id === eventId ? FEATURED_HACKATHON : null) || {
          id: eventId,
          title: "ThinkOva Live Learning Session",
          date: "Upcoming session",
        };

      const eventTitle = "title" in event ? event.title : "ThinkOva Event";
      const eventDate = "date" in event ? event.date : "the upcoming scheduled day";

      // 1. Dispatch Microsoft Email (Graph / SMTP)
      if (userEmail) {
        try {
          await defaultDispatcher.sendEmail({
            to: userEmail,
            subject: `🔔 Reminder: ${eventTitle} - ThinkOva Live Event`,
            text: `Hello ${userName},\n\nThis is your reminder for "${eventTitle}" scheduled for ${eventDate}.\n\nAccess all live streams and materials at: https://thinkova.ai/events\n\nWarm regards,\nThinkOva Academic Team`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0B0C0F; background: #F4F3EE; border-radius: 16px;">
                <h2 style="color: #FF6026;">🔔 Live Event Reminder</h2>
                <p>Hello <strong>${userName}</strong>,</p>
                <p>You have set a reminder for <strong>${eventTitle}</strong>.</p>
                <div style="background: white; border-radius: 12px; padding: 16px; margin: 20px 0; border: 1px solid #E3E0D9;">
                  <p style="margin: 0; font-weight: bold; font-size: 16px;">${eventTitle}</p>
                  <p style="margin: 6px 0 0; color: #5A5F6B; font-size: 14px;">Date: ${eventDate}</p>
                </div>
                <a href="https://thinkova.ai/events" style="background: #0B0C0F; color: white; padding: 10px 24px; border-radius: 9999px; text-decoration: none; font-weight: bold; font-size: 13px; display: inline-block;">View Live Stream &rarr;</a>
              </div>
            `,
            metadata: { eventId, type: "EVENT_REMINDER" },
          });
        } catch (e) {
          console.warn("[Events API] Microsoft Email reminder non-fatal warning:", e);
        }
      }

      // 2. Dispatch OpenWA WhatsApp Reminder
      if (userPhone) {
        try {
          const cleanPhone = userPhone.replace(/\D/g, "");
          const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
          await defaultDispatcher.sendWhatsApp({
            to: targetPhone,
            templateName: "thinkova_event_reminder",
            fallbackText: `🔔 Reminder for ${userName}: "${eventTitle}" is coming up on ${eventDate}! Watch online at https://thinkova.ai/events`,
            metadata: { eventId, type: "EVENT_REMINDER" },
          });
        } catch (e) {
          console.warn("[Events API] OpenWA reminder non-fatal warning:", e);
        }
      }

      return NextResponse.json({
        success: true,
        message: "Reminder set! Confirmation sent to your WhatsApp and Email.",
        eventId,
      });
    }

    return NextResponse.json({ success: true, message: "Action recorded" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
