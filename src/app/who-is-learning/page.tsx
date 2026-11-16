"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, LogOut, Check } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useAuth, StudentProfile } from "@/lib/auth-context";
import { StudentAvatar } from "@/components/ui/StudentAvatar";
import { LoadingSessionOverlay } from "@/components/ui/LoadingSessionOverlay";

export default function WhoIsLearningPage() {
  const router = useRouter();
  const { user, students, activeStudent, setActiveStudent, logout, refreshStudents, isLoading: authLoading } = useAuth();
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    refreshStudents();
  }, []);

  // Ensure effective list of students even if students array is still synchronizing
  const effectiveStudents = useMemo(() => {
    if (students.length > 0) return students;
    if (activeStudent) return [activeStudent];
    return [];
  }, [students, activeStudent]);

  // Strictly stay on who-is-learning. Only redirect to login if unauthenticated.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (effectiveStudents.length > 0 && !selectedId) {
      setSelectedId(activeStudent?.id || effectiveStudents[0]?.id || "");
    }
  }, [effectiveStudents, activeStudent, selectedId]);

  // Display only dynamically registered students for this authenticated parent
  const displayStudents: Array<{
    id: string;
    fullName: string;
    gradeText: string;
    trackTitle: string;
    interestBadge: string;
    isEnrolled: boolean;
  }> = effectiveStudents.map((s) => {
    const isEnrolled = Boolean(s.isEnrolled);
    const preferredTrackName =
      s.preferredTrack === "robotics"
        ? "Robotics"
        : s.preferredTrack === "electronics"
        ? "IoT & Circuits"
        : s.preferredTrack === "ai"
        ? "AI & Agents"
        : s.preferredTrack === "games"
        ? "Game Dev"
        : "Practical STEM";

    return {
      id: s.id,
      fullName: s.fullName,
      gradeText: `Grade ${s.currentGrade || 6} · ${isEnrolled ? "Enrolled" : "Profile Active"}`,
      interestBadge: `Curious about ${preferredTrackName}`,
      trackTitle: isEnrolled
        ? (s.preferredTrack === "robotics"
            ? "Robotics: Build a Rover"
            : s.preferredTrack === "electronics"
            ? "IoT: Smart Home Device"
            : s.preferredTrack === "ai"
            ? "AI for Young Creators"
            : "STEM Track")
        : "Not enrolled yet · View profile & enrol →",
      isEnrolled,
    };
  });

  const handleSelectStudent = (studentId: string, fullName: string) => {
    setSelectedId(studentId);
    const found = effectiveStudents.find((s) => s.id === studentId);
    if (found) {
      setActiveStudent(found);
    }
    // Route to home with ward's profile
    router.push("/home");
  };

  const handleAddChild = () => {
    router.push("/tell-us-child?sibling=true");
  };

  const parentDisplayName = user?.fullName || user?.username || "Parent";

  if (authLoading && !user) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center bg-[#0B0C0F]">
        <LoadingSessionOverlay isOpen={true} />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full bg-[#0B0C0F] text-white selection:bg-[#FF6026] selection:text-white flex flex-col justify-between p-6 sm:p-10">
      {/* Background Subtle Pattern matching Figma */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Top Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-[1240px] items-center justify-between">
        <Logo className="inline-block" />
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white/70 hover:border-white/30 hover:text-white transition"
        >
          <LogOut className="size-3.5" />
          Sign out
        </button>
      </header>

      {/* Center Main Content */}
      <main className="relative z-10 mx-auto my-auto flex w-full max-w-[960px] flex-col items-center py-10">
        <h1 className="font-display text-[36px] sm:text-[46px] font-normal leading-[1.1] tracking-[-0.025em] text-white text-center">
          Who&apos;s learning today?
        </h1>

        {/* 3 Profile Cards Row matching Figma Image 4 */}
        <div className="mt-12 flex w-full flex-wrap items-center justify-center gap-6">
          {displayStudents.map((student, idx) => {
            const isSelected = selectedId === student.id || (idx === 0 && !selectedId);

            return (
              <div
                key={student.id}
                onClick={() => handleSelectStudent(student.id, student.fullName)}
                className={`group relative flex w-[240px] cursor-pointer flex-col items-center rounded-[28px] p-7 text-center transition-all duration-200 hover:scale-[1.03] ${
                  isSelected
                    ? "bg-[#151820] border-2 border-[#FF6026] shadow-[0_8px_30px_rgba(255,96,38,0.18)]"
                    : "bg-[#151820] border border-[#262A34] hover:border-white/30"
                }`}
              >
                {/* Avatar */}
                <div className="relative mb-4 overflow-hidden rounded-full shadow-inner">
                  <StudentAvatar name={student.fullName} size={92} />
                </div>

                {/* Name */}
                <h2 className="text-[20px] font-bold text-white tracking-tight">
                  {student.fullName}
                </h2>

                {/* Subtitle */}
                <p className="mt-1 text-xs text-[#98A2B3]">
                  {student.gradeText}
                </p>

                {!student.isEnrolled && (
                  <span className="mt-2 inline-block rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-[10px] text-white/80">
                    {student.interestBadge}
                  </span>
                )}

                {/* Highlight Track Tag / Action */}
                <span
                  className={`mt-2.5 text-xs font-semibold transition group-hover:underline ${
                    student.isEnrolled ? "text-[#FF6026]" : "text-[#FF8B4E]"
                  }`}
                >
                  {student.trackTitle}
                </span>
              </div>
            );
          })}

          {/* Add Child Card matching Figma Image 4 */}
          <div
            onClick={handleAddChild}
            className="group flex min-h-[258px] w-[240px] cursor-pointer flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-[#2B303C] p-7 text-center transition-all duration-200 hover:border-[#FF6026]/70 hover:bg-white/[0.02] hover:scale-[1.03]"
          >
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[#20232B] text-white/90 transition group-hover:bg-[#FF6026] group-hover:text-white">
              <Plus className="size-6 stroke-[2.5]" />
            </div>

            <h3 className="text-base font-semibold text-white tracking-tight">
              Add child
            </h3>
            <p className="mt-1 text-xs text-[#717680]">
              Up to 4 on one account
            </p>
          </div>
        </div>
      </main>

      {/* Bottom Footer Info matching Figma Image 4 */}
      <footer className="relative z-10 mx-auto text-center text-xs text-[#717680]">
        Parent account · {parentDisplayName} ·{" "}
        <button
          type="button"
          onClick={() => router.push("/#tracks")}
          className="hover:text-white transition underline"
        >
          Manage profiles
        </button>
      </footer>
    </div>
  );
}
