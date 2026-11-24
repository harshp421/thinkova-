"use client";

import { useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const prefilledEmail = searchParams?.get("email") || "";

  const [email, setEmail] = useState(prefilledEmail);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Failed to process password reset.");
      } else {
        setIsSubmitted(true);
      }
    } catch {
      setErrorMessage("Network error. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col lg:flex-row bg-[#F8F7F4] text-[#0B0C0F]">
      {/* Left Column: Visual Showcase */}
      <div className="relative flex w-full flex-col justify-between overflow-hidden bg-[#0B0C0F] p-8 sm:p-12 lg:w-1/2 lg:min-h-screen lg:p-16">
        <Image
          src="/images/auth-lab.jpg"
          alt="Students building circuits in lab"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover opacity-60"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0F] via-[#0B0C0F]/50 to-transparent" />

        <div className="relative z-10">
          <Logo className="inline-block" />
        </div>

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

      {/* Right Column: Forgot Password Form */}
      <div className="flex w-full flex-col items-center justify-center p-6 sm:p-12 lg:w-1/2 lg:min-h-screen lg:p-16">
        <div className="w-full max-w-[420px]">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#5A5F6B] hover:text-[#0B0C0F] transition mb-6"
          >
            <ArrowLeft className="size-3.5" />
            Back to Log in
          </Link>

          <h1 className="text-[32px] font-bold tracking-tight text-[#0B0C0F]">
            Reset password
          </h1>
          <p className="mt-2 text-sm leading-[22px] text-[#667085]">
            Enter your registered email address and we&apos;ll send you a secure link to reset your password via email and WhatsApp.
          </p>

          {isSubmitted ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-6 text-center shadow-sm">
              <CheckCircle2 className="mx-auto size-10 text-emerald-600 mb-3" />
              <h3 className="font-bold text-emerald-900 text-base">Check your inbox & WhatsApp</h3>
              <p className="mt-2 text-xs sm:text-sm text-emerald-700 leading-relaxed">
                If an account exists with <strong>{email}</strong>, we have dispatched a password reset link. The link is active for <strong>1 hour</strong>.
              </p>
              <div className="mt-6">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-2xl bg-[#0B0C0F] px-6 py-3 text-xs font-semibold text-white shadow-sm hover:bg-[#252830] transition"
                >
                  Return to Log in
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              {errorMessage && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-800 shadow-sm">
                  <p>{errorMessage}</p>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-[#0B0C0F] mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="priya.sharma@gmail.com"
                  required
                  className="w-full rounded-xl border border-[#DCD8CF] bg-white px-4 py-3 text-sm text-[#0B0C0F] placeholder-[#8F94A0] shadow-sm outline-none transition focus:border-[#FF6026] focus:ring-2 focus:ring-[#FF6026]/15"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF6026] py-3.5 px-6 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(255,96,38,0.28)] transition hover:bg-[#E8531C] active:scale-[0.99] disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin text-white" />
                    Sending link...
                  </>
                ) : (
                  "Send reset link →"
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8F7F4]" />}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
