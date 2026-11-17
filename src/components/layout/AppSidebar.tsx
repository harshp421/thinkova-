"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Compass,
  BookOpen,
  Trophy,
  User,
  Radio,
  ChevronRight,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { StudentAvatar } from "@/components/ui/StudentAvatar";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { LiveClassSession } from "@/data/live-classes";

interface AppSidebarProps {
  activeItem?: "home" | "explore" | "my-learning" | "events" | "profile";
}

export function AppSidebar({ activeItem }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeStudent, user } = useAuth();

  const [liveClass, setLiveClass] = useState<LiveClassSession | null>(null);

  const studentName = activeStudent?.fullName || user?.fullName || "Learner";
  const studentGrade = activeStudent?.currentGrade || 6;

  // Query actual live class data only if student has an active course enrollment
  useEffect(() => {
    if (!activeStudent?.id || !activeStudent.isEnrolled) {
      setLiveClass(null);
      return;
    }

    let isMounted = true;
    fetch(`/api/learning/live-classes?studentId=${encodeURIComponent(activeStudent.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted) return;
        if (data?.isEnrolled && data?.nextLiveClass) {
          setLiveClass(data.nextLiveClass);
        } else {
          setLiveClass(null);
        }
      })
      .catch(() => {
        if (isMounted) setLiveClass(null);
      });

    return () => {
      isMounted = false;
    };
  }, [activeStudent?.id, activeStudent?.isEnrolled]);

  // Derive active navigation item from prop or pathname
  const currentNav =
    activeItem ||
    (pathname.startsWith("/home")
      ? "home"
      : pathname.startsWith("/explore") || pathname.startsWith("/courses") || pathname.startsWith("/checkout") || pathname.startsWith("/confirmation")
      ? "explore"
      : pathname.startsWith("/my-learning") || pathname.startsWith("/learning")
      ? "my-learning"
      : pathname.startsWith("/events")
      ? "events"
      : pathname.startsWith("/profile")
      ? "profile"
      : "explore");

  const navItems = [
    {
      id: "home",
      label: "Home",
      href: "/home",
      icon: Home,
    },
    {
      id: "explore",
      label: "Explore",
      href: "/explore",
      icon: Compass,
    },
    {
      id: "my-learning",
      label: "My learning",
      href: activeStudent?.id ? `/learning/${activeStudent.id}` : "/learning",
      icon: BookOpen,
      badge: liveClass?.status === "LIVE_NOW" ? 1 : undefined,
    },
    {
      id: "events",
      label: "Events",
      href: "/events",
      icon: Trophy,
    },
    {
      id: "profile",
      label: "Profile",
      href: "/profile",
      icon: User,
    },
  ];

  return (
    <aside className="hidden lg:flex w-[240px] shrink-0 flex-col justify-between border-r border-white/[0.08] bg-[#0B0C0F] p-5 text-white min-h-screen select-none sticky top-0 h-screen">
      {/* Top ThinkOva Brand */}
      <div className="space-y-8">
        <div className="px-2 pt-2">
          <Logo className="inline-block" />
        </div>

        {/* Navigation Items matching Figma exactly */}
        <nav className="space-y-1.5" aria-label="Portal Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentNav === item.id;

            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "group flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-white/[0.12] text-white shadow-sm font-semibold"
                    : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      "size-4 transition-colors",
                      isActive ? "text-[#FF6026]" : "text-white/60 group-hover:text-white"
                    )}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge !== undefined && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-[#FF6026] text-[10px] font-bold text-white shadow-sm">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Group: Next live class widget (if enrolled & active) + Active Student Profile */}
      <div className="space-y-3 pt-6 border-t border-white/[0.08]">
        {/* Next Live Class Card: Strictly conditional - shown ONLY when student is enrolled & live class is scheduled */}
        {liveClass && (
          <div
            onClick={() => router.push(activeStudent ? `/learning/${activeStudent.id}?tab=live` : "/who-is-learning")}
            className="group cursor-pointer rounded-2xl border border-white/[0.08] bg-[#14161D] p-3.5 shadow-inner transition hover:border-[#FF6026]/40 hover:bg-[#1A1C24]"
            title="Click to view Live classes schedule"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#FF8B4E]">
                <Radio className={cn("size-3 text-[#FF6026]", liveClass.status === "LIVE_NOW" && "animate-pulse")} />
                <span>{liveClass.status === "LIVE_NOW" ? "Class is Live Now" : "Next Live Class"}</span>
              </div>
              <ChevronRight className="size-3 text-white/30 group-hover:text-white/70 transition" />
            </div>
            <div className="mt-1.5 text-sm font-bold text-white group-hover:text-[#FF8B4E] transition">
              {liveClass.dateDisplay}{liveClass.timeDisplay ? `, ${liveClass.timeDisplay}` : ""}
            </div>
            <div className="mt-0.5 text-xs text-white/50">
              Level {liveClass.levelNumber} · {liveClass.tutorName}
            </div>
          </div>
        )}

        {/* Active Learner Pill (Gunvanth · switch learner) */}
        <div
          onClick={() => router.push("/who-is-learning")}
          className="group flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] p-2.5 transition hover:border-[#FF6026]/40 hover:bg-white/[0.09]"
          title="Click to switch learner"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <StudentAvatar name={studentName} size={34} />
            <div className="min-w-0">
              <div className="truncate text-xs font-bold text-white group-hover:text-[#FF8B4E] transition">
                {studentName}
              </div>
              <div className="truncate text-[11px] text-white/50">
                Grade {studentGrade} · switch learner
              </div>
            </div>
          </div>
          <ChevronRight className="size-3.5 text-white/30 group-hover:text-white/70 transition shrink-0 ml-1" />
        </div>
      </div>
    </aside>
  );
}
