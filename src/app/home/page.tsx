"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  ArrowRight,
  ClipboardList,
  Video,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useAuth } from "@/lib/auth-context";
import { allCourses, Course } from "@/data/tracks";
import { LoadingSessionOverlay } from "@/components/ui/LoadingSessionOverlay";

export default function HomePage() {
  const router = useRouter();
  const { user, activeStudent, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  // Authentication Guard: require login to view Home dashboard
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  const studentName = activeStudent?.fullName || user?.fullName || "Learner";
  const firstName = studentName.split(" ")[0];
  const studentGrade = activeStudent?.currentGrade || 6;
  const [completedLevels, setCompletedLevels] = useState<number>(0);
  const [isEnrolled, setIsEnrolled] = useState<boolean>(Boolean(activeStudent?.isEnrolled));
  const [activeEnrolledCourses, setActiveEnrolledCourses] = useState<Course[]>([]);

  useEffect(() => {
    async function loadProgress() {
      if (!activeStudent?.id) return;
      try {
        const res = await fetch(`/api/learning/progress?studentId=${activeStudent.id}`);
        if (res.ok) {
          const data = await res.json();
          const enrolled = Boolean(data.isEnrolled);
          setIsEnrolled(enrolled);
          if (data.progress?.milestones) {
            setCompletedLevels(data.progress.milestones.filter((m: { completed: boolean }) => m.completed).length);
          } else if (data.detailedProgress) {
            setCompletedLevels(data.detailedProgress.levelsDone || 0);
          }
          if (data.activeEnrollments?.length > 0) {
            const matched = data.activeEnrollments
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((enr: any) => allCourses.find((c) => c.id === enr.courseId || c.trackId === enr.trackId))
              .filter(Boolean) as Course[];
            setActiveEnrolledCourses(matched.length > 0 ? matched : [allCourses[0]!]);
          } else {
            setActiveEnrolledCourses([]);
          }
        }
      } catch {
        // Fallback
      }
    }
    loadProgress();
  }, [activeStudent]);

  const hasActiveEnrolment = isEnrolled || Boolean(activeStudent?.isEnrolled);

  const defaultCourse =
    allCourses.find((c) => studentGrade >= c.minGrade && studentGrade <= c.maxGrade) ||
    allCourses[0]!;

  const activeLevel = Math.min(8, completedLevels + 1);
  const activeLessonNumber = completedLevels === 0 ? 1 : 3;
  const lessonTitle = completedLevels === 0 ? "From ideas to real outcomes" : "Connect the steps";
  const courseTitle = activeEnrolledCourses[0]?.title || defaultCourse.title;
  const progressPercent = Math.round((completedLevels / 8) * 100);
  const currentStudentId = activeStudent?.id || "student";

  if (authLoading && !user) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center bg-[#F9F8F5]">
        <LoadingSessionOverlay
          isOpen={true}
          message="Loading your dashboard..."
          subMessage="Preparing your student learning tracks and course progress."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-[#F9F8F5] text-[#0B0C0F] selection:bg-[#FF6026] selection:text-white">
      {/* Shared Dark Sidebar */}
      <AppSidebar activeItem="home" />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col p-6 sm:p-10 lg:p-12 overflow-y-auto">
        {/* Top Header: Greeting + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-[32px] sm:text-[40px] font-normal leading-[1.1] tracking-[-0.025em] text-[#0B0C0F]">
              Good evening, {firstName}
            </h1>
            <p className="mt-1.5 text-sm sm:text-base text-[#667085]">
              {hasActiveEnrolment
                ? "One thing is due this week. Let's get it done."
                : `Enrol in a course for Grade ${studentGrade} to start learning.`}
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-[320px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#8F94A0]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search courses, tracks and lessons"
              className="w-full rounded-full border border-[#E3DFD5] bg-white py-2.5 pl-10 pr-4 text-xs sm:text-sm text-[#0B0C0F] placeholder-[#8F94A0] shadow-sm outline-none transition focus:border-[#FF6026] focus:ring-2 focus:ring-[#FF6026]/15"
            />
          </div>
        </div>

        {/* Top Grid: Hero Card + This Week (shown when enrolled) */}
        {hasActiveEnrolment && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Main Hero Card (Up Next · Active Course) */}
            <div className="lg:col-span-8 relative flex flex-col justify-between overflow-hidden rounded-[28px] bg-[#0E1015] p-7 sm:p-8 text-white shadow-xl min-h-[300px]">
              <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 overflow-hidden opacity-45 sm:opacity-65">
                <Image
                  src="/images/explore-student-ai.jpg"
                  alt="Student in lab"
                  fill
                  priority
                  className="object-cover object-left"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0E1015] via-[#0E1015]/60 to-transparent" />
              </div>

              <div className="relative z-10 max-w-[460px]">
                <span className="inline-block rounded-full bg-[#FF6026]/20 border border-[#FF6026]/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#FF8B4E]">
                  Up Next · {completedLevels === 0 ? "10 min" : "12 min"}
                </span>

                <h2 className="mt-3.5 font-display text-[28px] sm:text-[34px] font-medium leading-[1.1] tracking-tight text-white">
                  {lessonTitle}
                </h2>

                <p className="mt-2 text-xs sm:text-sm text-white/70">
                  {courseTitle} · Level {activeLevel}, lesson {activeLessonNumber} of 5
                </p>
              </div>

              <div className="relative z-10 mt-6 sm:mt-10 flex flex-col sm:flex-row sm:items-center gap-4">
                <button
                  type="button"
                  onClick={() => router.push(`/learning/${currentStudentId}?lesson=${activeLessonNumber}`)}
                  className="flex items-center justify-center gap-2 rounded-full bg-[#FF6026] px-6 py-3 text-xs sm:text-sm font-semibold text-white shadow-[0_4px_16px_rgba(255,96,38,0.35)] transition hover:bg-[#E8531C] active:scale-95 cursor-pointer"
                >
                  {completedLevels === 0 ? "Start lesson" : "Resume lesson"}
                </button>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-white/60">
                    Level {activeLevel} · {progressPercent}% done
                  </span>
                  <div className="h-1.5 w-24 sm:w-32 rounded-full bg-white/20 overflow-hidden">
                    <div className="h-full bg-[#FF6026] rounded-full" style={{ width: `${Math.max(4, progressPercent)}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* This Week Widget */}
            <div className="lg:col-span-4 rounded-[28px] border border-[#EAE6DE] bg-white p-6 shadow-sm flex flex-col justify-between">
              <h3 className="text-base font-bold text-[#0B0C0F] tracking-tight">
                This week
              </h3>

              <div className="mt-4 space-y-4">
                {/* Item 1: Build task */}
                <div
                  onClick={() =>
                    router.push(
                      `/learning/${currentStudentId}?view=build-task&taskId=${
                        completedLevels === 0 ? "level-1-problem-map" : "level-6-memory"
                      }`
                    )
                  }
                  className="group flex cursor-pointer items-start gap-3 rounded-xl p-1 transition hover:bg-[#FAF9F5]"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#FFF2EB] text-[#FF6026]">
                    <ClipboardList className="size-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold text-[#0B0C0F] group-hover:text-[#FF6026] transition">
                      Build task: {completedLevels === 0 ? "problem map and safety pledge" : "give your agent a memory"}
                    </h4>
                    <p className="text-[11px] text-[#8F94A0]">Due Fri, 9:00 PM</p>
                  </div>
                </div>

                {/* Item 2: Live class */}
                <div
                  onClick={() => router.push(`/learning/${currentStudentId}?tab=live`)}
                  className="group flex cursor-pointer items-start gap-3 rounded-xl p-1 transition hover:bg-[#FAF9F5]"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#FFF2EB] text-[#FF6026]">
                    <Video className="size-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold text-[#0B0C0F] group-hover:text-[#FF6026] transition">
                      Live class: {completedLevels === 0 ? "Lab Orientation & Setup" : "Personalise and improve"}
                    </h4>
                    <p className="text-[11px] text-[#8F94A0]">
                      Thu, 6:00 PM · {completedLevels === 0 ? "bring your curiosity" : `bring your Level ${activeLevel} agent`}
                    </p>
                  </div>
                </div>

                {/* Item 3: Lesson */}
                <div
                  onClick={() => router.push(`/learning/${currentStudentId}?lesson=${activeLessonNumber}`)}
                  className="group flex cursor-pointer items-start gap-3 rounded-xl p-1 transition hover:bg-[#FAF9F5]"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#F0FDF4] text-emerald-600">
                    <CheckCircle2 className="size-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold text-[#0B0C0F] group-hover:text-emerald-700 transition">
                      Lesson {activeLessonNumber}: {lessonTitle}
                    </h4>
                    <p className="text-[11px] text-[#8F94A0]">
                      {completedLevels === 0 ? "Ready to begin" : "In progress"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2 text-right">
                <span
                  onClick={() => router.push(`/learning/${currentStudentId}?tab=live`)}
                  className="text-[11px] font-semibold text-[#FF6026] hover:underline cursor-pointer"
                >
                  View calendar &rarr;
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Section: Your courses */}
        <div className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0B0C0F] tracking-tight">
              Your courses
            </h2>
            <Link
              href="/explore"
              className="text-xs font-semibold text-[#FF6026] hover:underline flex items-center gap-1"
            >
              Explore all courses <span>&rarr;</span>
            </Link>
          </div>

          {!hasActiveEnrolment || activeEnrolledCourses.length === 0 ? (
            <div className="mt-5 rounded-[24px] border border-dashed border-[#DCD8CF] bg-white p-8 text-center sm:p-10">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#FFF2EB] text-[#FF6026]">
                <BookOpen className="size-6" />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#0B0C0F]">
                No active course enrolment yet for {firstName}
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-xs sm:text-sm text-[#667085]">
                Enrol {firstName} in a course or explore the catalogue for Grade {studentGrade} to start learning.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push(`/explore?grade=${studentGrade}`)}
                  className="rounded-full bg-[#FF6026] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#E8531C] transition cursor-pointer"
                >
                  Explore Grade {studentGrade} courses &rarr;
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
              {activeEnrolledCourses.map((enrolledCourse) => (
                <div
                  key={enrolledCourse.id}
                  onClick={() => router.push(`/learning/${currentStudentId}`)}
                  className="group flex cursor-pointer overflow-hidden rounded-[24px] border border-[#EAE6DE] bg-white shadow-sm transition hover:border-[#FF6026]/40 hover:shadow-md"
                >
                  {/* Left Image Section */}
                  <div className="relative w-36 sm:w-44 shrink-0 bg-[#F4F3EE] flex items-center justify-center overflow-hidden">
                    <Image
                      src={enrolledCourse.image || "/images/rover-color.png"}
                      alt={enrolledCourse.title}
                      fill
                      className="object-contain p-1 grayscale transition-all duration-500 ease-out group-hover:grayscale-0 group-hover:scale-105"
                    />
                  </div>

                  {/* Right Details Section */}
                  <div className="flex flex-1 items-center justify-between p-5 sm:p-6 min-w-0 gap-4">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6026]">
                        {enrolledCourse.trackName || "STEM"}
                      </span>
                      <h3 className="mt-0.5 text-base sm:text-[17px] font-bold text-[#0B0C0F] truncate">
                        {enrolledCourse.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-[#8F94A0]">
                        Level {activeLevel} of 8 · {progressPercent}% done
                      </p>
                      <div className="mt-3 h-1.5 w-36 sm:w-44 rounded-full bg-[#EAE6DE] overflow-hidden">
                        <div
                          className="h-full bg-[#FF6026] rounded-full"
                          style={{ width: `${Math.max(4, progressPercent)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-xs font-bold text-[#0B0C0F] group-hover:text-[#FF6026] transition shrink-0">
                      <span>Continue</span>
                      <ArrowRight className="size-3.5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section: Try next, for Grade {studentGrade} */}
        <div className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0B0C0F] tracking-tight">
              Try next, for Grade {studentGrade}
            </h2>
            <Link
              href="/explore"
              className="text-xs font-semibold text-[#FF6026] hover:underline flex items-center gap-1"
            >
              Explore all courses <span>&rarr;</span>
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
            {allCourses
              .filter(
                (c) =>
                  studentGrade >= c.minGrade &&
                  studentGrade <= c.maxGrade &&
                  (!hasActiveEnrolment || !activeEnrolledCourses.some((ac) => ac.id === c.id))
              )
              .slice(0, 3)
              .map((suggestedCourse) => (
                <div
                  key={suggestedCourse.id}
                  onClick={() => router.push(`/courses/${suggestedCourse.id}`)}
                  className="group flex cursor-pointer items-center justify-between rounded-2xl border border-[#EAE6DE] bg-white p-4 shadow-sm transition hover:border-[#FF6026]/40 hover:shadow-md"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-[#F4F3EE]">
                      <Image
                        src={suggestedCourse.image || "/images/tracks-rover.png"}
                        alt={suggestedCourse.title}
                        fill
                        className="object-contain p-1"
                      />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-[#0B0C0F] truncate">
                        {suggestedCourse.title}
                      </h4>
                      <p className="text-[11px] text-[#8F94A0]">
                        {suggestedCourse.trackName} · {suggestedCourse.grades} · ₹
                        {suggestedCourse.price.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-[#8F94A0] group-hover:text-[#FF6026] transition shrink-0 ml-2" />
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

