"use client";

import { useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { LoadingSessionOverlay } from "@/components/ui/LoadingSessionOverlay";
import { useAuth } from "@/lib/auth-context";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const roleParam = searchParams.get("role");
  const errorParam = searchParams.get("error");
  const { login, loginWithGoogle } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);

  const isTutorRequested = roleParam === "tutor" || errorParam === "tutor_only";

  const handleSuccessfulAuth = (defaultRedirect: string) => {
    if (redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")) {
      router.push(redirectParam);
    } else {
      router.push(defaultRedirect || "/who-is-learning");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage("Please enter your registered email.");
      setShowSignupPrompt(false);
      return;
    }

    setErrorMessage(null);
    setShowSignupPrompt(false);
    setIsLoading(true);

    const result = await login(email.trim());
    setIsLoading(false);

    if (result.success) {
      handleSuccessfulAuth(result.redirectTo);
    } else {
      const err = result.error || "Login failed. Please check your credentials.";
      setErrorMessage(err);
      if (err.toLowerCase().includes("not found") || err.toLowerCase().includes("sign up")) {
        setShowSignupPrompt(true);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    const result = await loginWithGoogle();
    setIsLoading(false);

    if (result.success) {
      handleSuccessfulAuth(result.redirectTo);
    } else {
      setErrorMessage(result.error || "Google sign-in could not be completed.");
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col lg:flex-row bg-[#F8F7F4] text-[#0B0C0F]">
      <LoadingSessionOverlay
        isOpen={isLoading}
        message="Logging into Thinkova..."
        subMessage="Checking your account and loading your learning session."
      />

      {/* Left Column: Dark Photo Showcase matching Figma Image 1 */}
      <div className="relative flex w-full flex-col justify-between overflow-hidden bg-[#0B0C0F] p-8 sm:p-12 lg:w-1/2 lg:min-h-screen lg:p-16">
        <Image
          src="/images/auth-lab.jpg"
          alt="Students building circuits in lab"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover opacity-60"
        />

        {/* Smooth dark vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0F] via-[#0B0C0F]/50 to-transparent" />

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

      {/* Right Column: Clean Login Form matching Figma Image 1 */}
      <div className="flex w-full flex-col items-center justify-center p-6 sm:p-12 lg:w-1/2 lg:min-h-screen lg:p-16">
        <div className="w-full max-w-[420px]">
          {/* Top Pill Toggle (Log in active / Sign up inactive) */}
          <div className="inline-flex w-full rounded-full bg-[#EAE6DE] p-1">
            <button
              type="button"
              className="w-1/2 rounded-full bg-white py-2.5 text-center text-sm font-semibold text-[#0B0C0F] shadow-sm transition"
            >
              Log in
            </button>
            <Link
              href="/signup"
              className="w-1/2 rounded-full py-2.5 text-center text-sm font-semibold text-[#5A5F6B] hover:text-[#0B0C0F] transition"
            >
              Sign up
            </Link>
          </div>

          {/* Heading */}
          <h1 className="mt-8 text-[32px] font-bold tracking-tight text-[#0B0C0F]">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm leading-[22px] text-[#667085]">
            {isTutorRequested
              ? "Tutors access cohort rosters, assessments, and lab schedules."
              : "Parents manage the account. Children pick their profile next."}
          </p>

          {isTutorRequested && (
            <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-indigo-200/80 bg-indigo-50/80 p-3.5 text-xs text-indigo-900 shadow-sm">
              <ShieldCheck className="size-4 shrink-0 text-indigo-600" />
              <span>
                <strong>Tutor Portal:</strong> Please sign in with your ThinkOva Instructor credentials to access class rosters and evaluations.
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-800 shadow-sm">
              <div className="font-bold text-red-900 mb-0.5">
                {showSignupPrompt ? "Account not found" : "Login error"}
              </div>
              <p className="leading-relaxed text-red-700">
                {errorMessage}
              </p>
              {showSignupPrompt && (
                <div className="mt-3 pt-2.5 border-t border-red-200/60">
                  <Link
                    href={`/signup?email=${encodeURIComponent(email.trim())}`}
                    className="inline-flex items-center gap-1 font-bold text-[#FF6026] hover:underline"
                  >
                    <span>Click here to sign up with {email.trim()} &rarr;</span>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-[#0B0C0F] mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isTutorRequested ? "rohit.tutor@thinkova.ai" : "priya.sharma@gmail.com"}
                required
                className="w-full rounded-xl border border-[#DCD8CF] bg-white px-4 py-3 text-sm text-[#0B0C0F] placeholder-[#8F94A0] shadow-sm outline-none transition focus:border-[#FF6026] focus:ring-2 focus:ring-[#FF6026]/15"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-[#0B0C0F] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  className="w-full rounded-xl border border-[#DCD8CF] bg-white px-4 py-3 pr-14 text-sm text-[#0B0C0F] placeholder-[#8F94A0] shadow-sm outline-none transition focus:border-[#FF6026] focus:ring-2 focus:ring-[#FF6026]/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#667085] hover:text-[#0B0C0F] transition"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="text-left pt-0.5">
              <button
                type="button"
                onClick={() => alert("Password reset link sent to " + email)}
                className="text-xs font-semibold text-[#FF6026] hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF6026] py-3.5 px-6 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(255,96,38,0.28)] transition hover:bg-[#E8531C] active:scale-[0.99] disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin text-white" />
                  Logging in...
                </>
              ) : (
                "Log in →"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E3DFD5]" />
            </div>
            <span className="relative bg-[#F8F7F4] px-4 text-xs font-medium text-[#8F94A0]">
              or
            </span>
          </div>

          {/* Continue with Google */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[#DCD8CF] bg-white py-3.5 px-6 text-sm font-semibold text-[#0B0C0F] shadow-sm transition hover:bg-[#F2EFE9] active:scale-[0.99]"
          >
            Continue with Google
          </button>

          {/* Footer Link */}
          <p className="mt-8 text-center text-xs text-[#5A5F6B]">
            New to Thinkova?{" "}
            <Link href="/signup" className="font-semibold text-[#FF6026] hover:underline">
              Create a parent account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8F7F4]" />}>
      <LoginForm />
    </Suspense>
  );
}
