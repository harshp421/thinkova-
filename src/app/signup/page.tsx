"use client";

import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { LoadingSessionOverlay } from "@/components/ui/LoadingSessionOverlay";
import { safeAuthRedirect } from "@/lib/auth-redirect";
import { useAuth } from "@/lib/auth-context";

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledEmail = searchParams?.get("email") || "";
  const redirect = safeAuthRedirect(searchParams.get("redirectTo"));
  const { signup } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(prefilledEmail);
  const [phone, setPhone] = useState("");
  const [whatsappUpdates, setWhatsappUpdates] = useState(true);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (prefilledEmail && !email) {
      setEmail(prefilledEmail);
    }
  }, [prefilledEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMessage("Please enter parent's full name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      setErrorMessage("Please enter a valid 10-digit WhatsApp phone number.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    const result = await signup({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: cleanPhone,
      password,
      whatsappUpdates,
    });

    setIsLoading(false);

    if (result.success) {
      router.push(redirect || result.redirectTo || "/tell-us-child");
    } else {
      setErrorMessage(result.error || "Signup could not be completed. Please try again.");
    }
  };


  return (
    <div className="relative flex min-h-screen w-full flex-col lg:flex-row bg-[#F8F7F4] text-[#0B0C0F]">
      <LoadingSessionOverlay
        isOpen={isLoading}
        message="Creating your parent account..."
        subMessage="Setting up safety guardrails and preparing your child's track."
      />

      {/* Left Column: Dark Photo Showcase matching Figma Image 2 */}
      <div className="relative flex w-full flex-col justify-between overflow-hidden bg-[#0B0C0F] p-8 sm:p-12 lg:w-1/2 lg:min-h-screen lg:p-16">
        <Image
          src="/images/auth-rover-girl.jpg"
          alt="Student holding robotics rover"
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

      {/* Right Column: Clean Signup Form matching Figma Image 2 */}
      <div className="flex w-full flex-col items-center justify-center p-6 sm:p-12 lg:w-1/2 lg:min-h-screen lg:p-16">
        <div className="w-full max-w-[420px]">
          {/* Top Pill Toggle (Log in inactive / Sign up active) */}
          <div className="inline-flex w-full rounded-full bg-[#EAE6DE] p-1">
            <Link
              href={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login"}
              className="w-1/2 rounded-full py-2.5 text-center text-sm font-semibold text-[#5A5F6B] hover:text-[#0B0C0F] transition"
            >
              Log in
            </Link>
            <button
              type="button"
              className="w-1/2 rounded-full bg-white py-2.5 text-center text-sm font-semibold text-[#0B0C0F] shadow-sm transition"
            >
              Sign up
            </button>
          </div>

          {/* Step Tag */}
          <div className="mt-8 text-[11px] font-bold uppercase tracking-wider text-[#FF6026]">
            Step 1 of 2
          </div>

          {/* Heading */}
          <h1 className="mt-1.5 text-[32px] font-bold tracking-tight text-[#0B0C0F]">
            Create a parent account
          </h1>
          <p className="mt-1.5 text-sm leading-[22px] text-[#667085]">
            You&apos;ll add your child on the next step.
          </p>

          {errorMessage && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-700">
              {errorMessage}
            </div>
          )}

          {/* Signup Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="parentName" className="block text-xs font-semibold text-[#0B0C0F] mb-1.5">
                Parent&apos;s full name
              </label>
              <input
                id="parentName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                required
                className="w-full rounded-xl border border-[#DCD8CF] bg-white px-4 py-3 text-sm text-[#0B0C0F] placeholder-[#8F94A0] shadow-sm outline-none transition focus:border-[#FF6026] focus:ring-2 focus:ring-[#FF6026]/15"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-[#0B0C0F] mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-xl border border-[#DCD8CF] bg-white px-4 py-3 text-sm text-[#0B0C0F] placeholder-[#8F94A0] shadow-sm outline-none transition focus:border-[#FF6026] focus:ring-2 focus:ring-[#FF6026]/15"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-xs font-semibold text-[#0B0C0F] mb-1.5">
                WhatsApp Phone Number
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-xs font-bold text-[#8F94A0] select-none">
                  +91
                </span>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="98765 43210"
                  required
                  className="w-full rounded-xl border border-[#DCD8CF] bg-white py-3 pl-12 pr-4 text-sm text-[#0B0C0F] placeholder-[#8F94A0] shadow-sm outline-none transition focus:border-[#FF6026] focus:ring-2 focus:ring-[#FF6026]/15"
                />
              </div>
              <p className="mt-1 text-[11px] text-[#8F94A0]">
                We&apos;ll send your welcome orientation and child&apos;s weekly lab reports here.
              </p>
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

            <div className="flex items-center gap-2 pt-1">
              <input
                id="waUpdates"
                type="checkbox"
                checked={whatsappUpdates}
                onChange={(e) => setWhatsappUpdates(e.target.checked)}
                className="size-4 rounded accent-[#FF6026]"
              />
              <label htmlFor="waUpdates" className="text-xs text-[#5A5F6B] cursor-pointer">
                Send welcome guide & child reports on WhatsApp
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF6026] py-3.5 px-6 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(255,96,38,0.28)] transition hover:bg-[#E8531C] active:scale-[0.99] disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin text-white" />
                  Creating account...
                </>
              ) : (
                "Create account →"
              )}
            </button>
          </form>



          {/* Footer Disclaimer */}
          <p className="mt-8 text-center text-xs leading-[18px] text-[#8F94A0]">
            By creating an account you agree to the{" "}
            <Link href="/legal/terms" className="underline hover:text-[#0B0C0F]">
              Parent agreement
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline hover:text-[#0B0C0F]">
              Privacy policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="relative flex min-h-screen w-full items-center justify-center bg-[#F8F7F4]">
          <LoadingSessionOverlay isOpen={true} />
        </div>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}
