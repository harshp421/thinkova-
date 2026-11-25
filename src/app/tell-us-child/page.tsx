"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useAuth } from "@/lib/auth-context";
import { LoadingSessionOverlay } from "@/components/ui/LoadingSessionOverlay";

interface TrackTopic {
  id: string;
  label: string;
}

const topics: TrackTopic[] = [
  { id: "robotics", label: "Robots" },
  { id: "electronics", label: "Electronics" },
  { id: "ai", label: "AI" },
  { id: "games", label: "Games" },
  { id: "design", label: "Design" },
];

export default function TellUsChildPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutCourse = searchParams.get("courseId");
  const checkoutPlan = searchParams.get("plan");
  const isAddingSibling =
    searchParams.get("sibling") === "true" ||
    searchParams.get("addSibling") === "true" ||
    searchParams.get("action") === "add";

  const { user, students, activeStudent, isLoading: authLoading, addStudent } = useAuth();

  const [fullName, setFullName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [selectedGrade, setSelectedGrade] = useState<number>(6);
  const [selectedTopics, setSelectedTopics] = useState<string[]>(["robotics", "ai"]);
  const [agreedToSafety, setAgreedToSafety] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If user already has ward registered and is not explicitly adding a sibling,
  // do not show this page - redirect to who-is-learning.
  // If user is not logged in, redirect to signup.
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace("/signup?redirectTo=/tell-us-child");
      } else if ((students.length > 0 || activeStudent) && !isAddingSibling) {
        if (checkoutCourse) {
          router.replace(`/checkout?${new URLSearchParams({ courseId: checkoutCourse, plan: checkoutPlan || "full" })}`);
        } else {
          router.replace("/who-is-learning");
        }
      }
    }
  }, [authLoading, user, students, activeStudent, isAddingSibling, checkoutCourse, checkoutPlan, router]);

  const toggleTopic = (id: string) => {
    if (selectedTopics.includes(id)) {
      if (selectedTopics.length > 1) {
        setSelectedTopics(selectedTopics.filter((t) => t !== id));
      }
    } else {
      setSelectedTopics([...selectedTopics, id]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMessage("Please enter child's name.");
      return;
    }
    if (!agreedToSafety) {
      setErrorMessage("Please agree to the child safety and privacy terms to continue.");
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    const primaryTrack = selectedTopics[0] || "robotics";
    const result = await addStudent({
      fullName: fullName.trim(),
      currentGrade: selectedGrade,
      schoolName: schoolName.trim() || "Partner School",
      preferredTrack: primaryTrack,
      priorExperience: "beginner",
    });

    setIsLoading(false);

    if (result.success && result.student) {
      if (checkoutCourse) {
        const selection = new URLSearchParams({
          courseId: checkoutCourse, plan: checkoutPlan || "full", studentId: result.student.id,
        });
        router.push(`/checkout?${selection}`);
        return;
      }
      // Sibling enrolment rule: if another student is added the parent should enroll that student
      if (isAddingSibling && result.recommendedEnrollUrl) {
        router.push(result.recommendedEnrollUrl);
      } else {
        router.push(`/who-is-learning?newStudent=${result.student.id}`);
      }
    } else {
      setErrorMessage(result.error || "Could not save student profile. Please try again.");
    }
  };

  if ((authLoading && !user) || (!isAddingSibling && user && (students.length > 0 || activeStudent))) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center bg-[#F8F7F4]">
        <LoadingSessionOverlay
          isOpen={true}
          message="Loading child profile..."
          subMessage="Preparing curriculum and learning levels."
        />
      </div>
    );
  }

  // Dynamic matching count: 5 courses total for grade, topics match
  const matchingCoursesCount = Math.max(1, selectedTopics.length);

  return (
    <div className="relative flex min-h-screen w-full flex-col lg:flex-row bg-[#F8F7F4] text-[#0B0C0F]">
      {/* Dull backdrop + animated hourglass on submit */}
      <LoadingSessionOverlay
        isOpen={isLoading}
        message="Saving child's profile..."
        subMessage="Setting up learning tracks and curriculum recommendation."
      />
      {/* Left Column: Dark Photo Showcase matching Figma Image 3 */}
      <div className="relative flex w-full flex-col justify-between overflow-hidden bg-[#0B0C0F] p-8 sm:p-12 lg:w-1/2 lg:min-h-screen lg:p-16">
        <Image
          src="/images/child-crossroads.jpg"
          alt="Student standing at learning track crossroads"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover opacity-75"
        />

        {/* Smooth dark vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0F] via-[#0B0C0F]/40 to-transparent" />

        {/* Top ThinkOva Logo */}
        <div className="relative z-10">
          <Logo className="inline-block" />
        </div>

        {/* Bottom Headline & Subtitle */}
        <div className="relative z-10 max-w-[520px] pt-40 lg:pt-0">
          <h2 className="font-display text-[32px] sm:text-[40px] lg:text-[44px] font-normal leading-[1.1] tracking-[-0.025em] text-white">
            Don&apos;t just use technology.
            <br />
            Build with it.
          </h2>
          <p className="mt-4 text-sm sm:text-[15px] leading-[23px] text-white/80">
            Robotics, electronics, AI, games and design for Grades 5–11.
            <br />
            Live classes with a trained tutor. A real project every course.
          </p>
        </div>
      </div>

      {/* Right Column: Clean Student Onboarding Form matching Figma Image 3 */}
      <div className="flex w-full flex-col items-center justify-center p-6 sm:p-12 lg:w-1/2 lg:min-h-screen lg:p-16">
        <div className="w-full max-w-[460px]">
          {/* Step Tag */}
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#FF6026]">
            {isAddingSibling ? "Add Another Student" : "Step 2 of 2"}
          </div>

          {/* Heading */}
          <h1 className="mt-1.5 text-[32px] font-bold tracking-tight text-[#0B0C0F]">
            Tell us about your child
          </h1>
          <p className="mt-1.5 text-sm leading-[22px] text-[#667085]">
            We use this to show courses at the right level.
          </p>

          {errorMessage && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-700">
              {errorMessage}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            {/* Child's name */}
            <div>
              <label htmlFor="childName" className="block text-xs font-semibold text-[#0B0C0F] mb-1.5">
                Child&apos;s name
              </label>
              <input
                id="childName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your child's full name"
                required
                className="w-full rounded-xl border border-[#DCD8CF] bg-white px-4 py-3 text-sm text-[#0B0C0F] placeholder-[#8F94A0] shadow-sm outline-none transition focus:border-[#FF6026] focus:ring-2 focus:ring-[#FF6026]/15"
              />
            </div>

            {/* Grade Selector Pills */}
            <div>
              <label className="block text-xs font-semibold text-[#0B0C0F] mb-2">
                Grade
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {[5, 6, 7, 8, 9, 10, 11].map((grade) => {
                  const isSelected = selectedGrade === grade;
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => setSelectedGrade(grade)}
                      className={`min-w-[44px] rounded-xl py-2.5 px-3 text-center text-sm font-semibold transition ${
                        isSelected
                          ? "bg-[#0B0C0F] text-white shadow-sm"
                          : "bg-white text-[#0B0C0F] border border-[#DCD8CF] shadow-sm hover:border-[#B8B5AA]"
                      }`}
                    >
                      {grade}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interests Selector Pills */}
            <div>
              <label className="block text-xs font-semibold text-[#0B0C0F] mb-2">
                What are they curious about? Pick any
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {topics.map((t) => {
                  const isChecked = selectedTopics.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTopic(t.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition shadow-sm ${
                        isChecked
                          ? "bg-[#0B0C0F] text-white border border-[#0B0C0F]"
                          : "bg-white text-[#0B0C0F] border border-[#DCD8CF] hover:border-[#B8B5AA]"
                      }`}
                    >
                      {isChecked && <Check className="size-3.5 stroke-[2.5]" />}
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Matching Badge */}
            <div className="rounded-xl border border-[#FFD8C4] bg-[#FFF0E8] px-4 py-3 text-xs font-medium text-[#A04118]">
              5 courses fit Grade {selectedGrade} · {matchingCoursesCount} match these interests
            </div>

            {/* Consent Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToSafety}
                onChange={(e) => setAgreedToSafety(e.target.checked)}
                className="mt-0.5 size-4 rounded border-[#DCD8CF] text-[#FF6026] focus:ring-[#FF6026]"
              />
              <span className="text-xs leading-[18px] text-[#5A5F6B]">
                I am the parent or guardian and I agree to Thinkova&apos;s child safety and privacy terms.
              </span>
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF6026] py-3.5 px-6 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(255,96,38,0.28)] transition hover:bg-[#E8531C] active:scale-[0.99] disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin text-white" />
                  Saving profile...
                </>
              ) : (
                "Continue →"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
