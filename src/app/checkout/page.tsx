"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  Check,
  Loader2,
  ShieldCheck,
  CreditCard,
  Smartphone,
  Building,
  ArrowRight,
} from "lucide-react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { StudentAvatar } from "@/components/ui/StudentAvatar";
import { useAuth } from "@/lib/auth-context";
import { getCourseById } from "@/data/tracks";
import { cn } from "@/lib/utils";
import { LoadingSessionOverlay } from "@/components/ui/LoadingSessionOverlay";

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, activeStudent, students, isLoading: authLoading } = useAuth();

  // Selected course from URL or default to game design matching Image 3
  const courseId = searchParams.get("courseId") || "game-design-starter";
  const course = getCourseById(courseId);

  const studentIdParam = searchParams.get("studentId");

  // Task 6: Mandatory signup/login check before checkout / enrolment
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace(`/signup?redirectTo=${encodeURIComponent(`/checkout?courseId=${courseId}`)}`);
      }
    }
  }, [authLoading, user, courseId, router]);

  const targetStudent = useMemo(() => {
    if (studentIdParam) {
      const match = students.find((s) => s.id === studentIdParam);
      if (match) return match;
    }
    if (activeStudent) return activeStudent;
    if (students.length > 0 && students[0]) return students[0];
    if (user) {
      return {
        id: `std_${user.id}`,
        fullName: user.fullName || "Learner",
        currentGrade: 6,
        schoolName: "ThinkOva Partner School",
        schoolUid: "SCH_GENERAL",
        isEnrolled: false,
        activeEnrollment: null,
      };
    }
    return null;
  }, [studentIdParam, activeStudent, students, user]);

  const studentName = targetStudent?.fullName || user?.fullName || "Learner";
  const studentFirstName = studentName.split(" ")[0] || "Learner";
  const studentGrade = targetStudent?.currentGrade || 6;

  // Plan state
  const [paymentPlan, setPaymentPlan] = useState<"full" | "installments">("full");

  // Parent form state (pre-filled with real authenticated parent details)
  const [parentName, setParentName] = useState(user?.fullName || "");
  const [parentEmail, setParentEmail] = useState(user?.email || "");
  const [parentPhone, setParentPhone] = useState(user?.phone || "");
  const [schoolName, setSchoolName] = useState(
    targetStudent?.schoolName || "ThinkOva Partner School"
  );

  useEffect(() => {
    if (user) {
      if (user.fullName) setParentName(user.fullName);
      if (user.email) setParentEmail(user.email);
      if (user.phone) setParentPhone(user.phone);
    }
  }, [user]);

  useEffect(() => {
    if (targetStudent?.schoolName) {
      setSchoolName(targetStudent.schoolName);
    }
  }, [targetStudent]);

  // Payment method state (matching Image 4)
  const [paymentMethod, setPaymentMethod] = useState<"upi" | "card" | "netbanking">("upi");
  const [upiId, setUpiId] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [selectedBank, setSelectedBank] = useState("HDFC Bank");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fullPrice = course.price || 3999;
  const payTodayAmount = paymentPlan === "full" ? fullPrice : 3000;
  const secondPartAmount = fullPrice - 3000 + 500; // ₹500 more in total

  const handlePayAndEnrol = async () => {
    if (!user) {
      router.push(`/signup?redirectTo=${encodeURIComponent(`/checkout?courseId=${course.id}`)}`);
      return;
    }

    setIsProcessing(true);
    setErrorMessage("");

    try {
      const effectiveStudentId = targetStudent?.id || (user ? `std_${user.id}` : "student");
      const siteOrigin =
        typeof window !== "undefined" && window.location.protocol === "https:"
          ? window.location.origin
          : "https://www.thinkova.ai";
      const returnUrl = `${siteOrigin}/confirmation?order_id={order_id}&courseId=${encodeURIComponent(
        course.id
      )}&studentId=${encodeURIComponent(effectiveStudentId)}&plan=${paymentPlan}&paid=${payTodayAmount}`;

      // 1. Invoke Cashfree Backend Order Generation
      const cashfreeRes = await fetch("/api/cashfree/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: effectiveStudentId,
          studentName,
          parentName: parentName || user.fullName,
          parentEmail: parentEmail || user.email,
          parentPhone: parentPhone || user.phone,
          schoolUid: schoolName || "PUNE_CAMPUS",
          grade: studentGrade,
          paymentPlan: paymentPlan === "full" ? "FULL" : "INSTALLMENTS",
          amountInRupees: payTodayAmount,
          courseId: course.id,
          courseTitle: course.title,
          returnUrl,
        }),
      });

      const cfData = await cashfreeRes.json().catch(() => ({}));

      if (!cashfreeRes.ok || cfData.status !== "success" || !cfData.paymentSessionId) {
        throw new Error(
          cfData.message || cfData.error || "Failed to initialize Cashfree payment order. Please try again."
        );
      }

      // 2. Live Cashfree SDK Checkout v3
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loadCashfreeSdk = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((window as any).Cashfree) {
            const mode = (cfData.environment || "PRODUCTION").toLowerCase();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolve((window as any).Cashfree({ mode }));
            return;
          }
          const script = document.createElement("script");
          script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
          script.async = true;
          script.onload = () => {
            const mode = (cfData.environment || "PRODUCTION").toLowerCase();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolve((window as any).Cashfree({ mode }));
          };
          script.onerror = () =>
            reject(
              new Error("Cashfree Checkout SDK failed to load. Please disable ad-blockers and try again.")
            );
          document.body.appendChild(script);
        });
      };

      try {
        const cashfree = await loadCashfreeSdk();
        await cashfree.checkout({
          paymentSessionId: cfData.paymentSessionId,
          redirectTarget: "_self",
        });
        return;
      } catch (sdkErr) {
        console.warn("[Cashfree Checkout SDK non-fatal, redirecting to hosted gateway]", sdkErr);
        if (cfData.checkoutUrl) {
          window.location.href = cfData.checkoutUrl;
          return;
        }
        throw sdkErr;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment processing error";
      setErrorMessage(msg);
      setIsProcessing(false);
    }
  };

  if (authLoading && !user) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center bg-[#F4F3EE]">
        <LoadingSessionOverlay
          isOpen={true}
          message="Loading checkout session..."
          subMessage="Retrieving enrolment details and tuition summary."
        />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full bg-[#F4F3EE] text-[#0B0C0F] selection:bg-[#FF6026] selection:text-white">
      <LoadingSessionOverlay
        isOpen={isProcessing}
        message="Connecting to Payment Gateway..."
        subMessage="Preparing secure payment session with Cashfree. Please do not refresh."
      />

      {/* Shared Dark Sidebar */}
      <AppSidebar activeItem="explore" />

      {/* Main Checkout Area */}
      <main className="flex-1 min-w-0 p-6 sm:p-10 lg:p-12 overflow-y-auto">
        <div className="mx-auto max-w-[1140px]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left 7 Columns: Form Steps */}
            <div className="lg:col-span-7 space-y-6">

              {/* Step 1: Learner */}
              <section className="rounded-[28px] border border-[#E3E0D9] bg-white p-6 sm:p-7 shadow-[0px_4px_20px_rgba(0,0,0,0.03)]">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-6 items-center justify-center rounded-full bg-[#0B0C0F] text-xs font-bold text-white">
                    1
                  </div>
                  <h2 className="text-[17px] font-semibold text-[#0B0C0F]">
                    Learner
                  </h2>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#FBFBFA] border border-[#ECE9E2] p-4">
                  <div className="flex items-center gap-3.5">
                    <StudentAvatar
                      name={studentName}
                      size={44}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-semibold text-[#0B0C0F]">
                          {studentName}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#E3F5E8] px-2.5 py-0.5 text-[11px] font-semibold text-[#1F9D55]">
                          <Check className="size-3 stroke-[2.5]" />
                          Right level
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[#5A5F6B]">
                        Grade {studentGrade} · fits Grades {course.grades.replace("Grades ", "")}
                      </p>
                    </div>
                  </div>

                  <Link
                    href="/who-is-learning"
                    className="text-xs font-semibold text-[#FF6026] hover:underline transition"
                  >
                    Change
                  </Link>
                </div>
              </section>

              {/* Step 2: How would you like to pay? */}
              <section className="rounded-[28px] border border-[#E3E0D9] bg-white p-6 sm:p-7 shadow-[0px_4px_20px_rgba(0,0,0,0.03)]">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-6 items-center justify-center rounded-full bg-[#0B0C0F] text-xs font-bold text-white">
                    2
                  </div>
                  <h2 className="text-[17px] font-semibold text-[#0B0C0F]">
                    How would you like to pay?
                  </h2>
                </div>
                <p className="mt-1 text-xs text-[#5A5F6B]">
                  Same course either way. Two parts costs ₹500 more in total.
                </p>

                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Pay in full */}
                  <div
                    onClick={() => setPaymentPlan("full")}
                    className={cn(
                      "cursor-pointer rounded-2xl p-5 transition-all duration-200 border-2 relative",
                      paymentPlan === "full"
                        ? "border-[#FF6026] bg-white shadow-sm"
                        : "border-[#ECE9E2] bg-white hover:border-[#D5D0C5]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#0B0C0F]">
                        Pay in full
                      </span>
                      <div
                        className={cn(
                          "size-5 rounded-full border flex items-center justify-center",
                          paymentPlan === "full"
                            ? "border-[#FF6026] bg-[#FF6026]"
                            : "border-[#D5D0C5]"
                        )}
                      >
                        {paymentPlan === "full" && (
                          <div className="size-2 rounded-full bg-white" />
                        )}
                      </div>
                    </div>
                    <div className="mt-3 text-2xl font-bold tracking-tight text-[#0B0C0F]">
                      ₹{fullPrice.toLocaleString("en-IN")}
                    </div>
                    <p className="mt-1 text-xs text-[#5A5F6B]">
                      One payment · kit included
                    </p>
                  </div>

                  {/* Two parts */}
                  <div
                    onClick={() => setPaymentPlan("installments")}
                    className={cn(
                      "cursor-pointer rounded-2xl p-5 transition-all duration-200 border-2 relative",
                      paymentPlan === "installments"
                        ? "border-[#FF6026] bg-white shadow-sm"
                        : "border-[#ECE9E2] bg-white hover:border-[#D5D0C5]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#0B0C0F]">
                        Two parts
                      </span>
                      <div
                        className={cn(
                          "size-5 rounded-full border flex items-center justify-center",
                          paymentPlan === "installments"
                            ? "border-[#FF6026] bg-[#FF6026]"
                            : "border-[#D5D0C5]"
                        )}
                      >
                        {paymentPlan === "installments" && (
                          <div className="size-2 rounded-full bg-white" />
                        )}
                      </div>
                    </div>
                    <div className="mt-3 text-2xl font-bold tracking-tight text-[#0B0C0F]">
                      ₹3,000 <span className="text-base font-normal text-[#5A5F6B]">today</span>
                    </div>
                    <p className="mt-1 text-xs text-[#5A5F6B]">
                      Then ₹{secondPartAmount.toLocaleString("en-IN")} before Week 4
                    </p>
                  </div>
                </div>
              </section>

              {/* Step 3: Parent details */}
              <section className="rounded-[28px] border border-[#E3E0D9] bg-white p-6 sm:p-7 shadow-[0px_4px_20px_rgba(0,0,0,0.03)]">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-6 items-center justify-center rounded-full bg-[#0B0C0F] text-xs font-bold text-white">
                    3
                  </div>
                  <h2 className="text-[17px] font-semibold text-[#0B0C0F]">
                    Parent details
                  </h2>
                </div>
                <p className="mt-1 text-xs text-[#5A5F6B]">
                  Receipts and class links go here.
                </p>

                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-[#0B0C0F]">
                      Parent&apos;s full name
                    </label>
                    <input
                      type="text"
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[#E3E0D9] bg-[#FBFBFA] px-3.5 py-2.5 text-sm font-medium text-[#0B0C0F] outline-none focus:border-[#FF6026] focus:bg-white transition"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#0B0C0F]">
                      Email
                    </label>
                    <input
                      type="email"
                      value={parentEmail}
                      onChange={(e) => setParentEmail(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[#E3E0D9] bg-[#FBFBFA] px-3.5 py-2.5 text-sm font-medium text-[#0B0C0F] outline-none focus:border-[#FF6026] focus:bg-white transition"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[#0B0C0F]">
                        WhatsApp number
                      </label>
                      <span className="text-[11px] text-[#5A5F6B]">
                        For class reminders
                      </span>
                    </div>
                    <input
                      type="tel"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[#E3E0D9] bg-[#FBFBFA] px-3.5 py-2.5 text-sm font-medium text-[#0B0C0F] outline-none focus:border-[#FF6026] focus:bg-white transition"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#0B0C0F]">
                      School (for kit delivery)
                    </label>
                    <input
                      type="text"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[#E3E0D9] bg-[#FBFBFA] px-3.5 py-2.5 text-sm font-medium text-[#0B0C0F] outline-none focus:border-[#FF6026] focus:bg-white transition"
                    />
                  </div>
                </div>
              </section>

              {/* Step 4: Payment method (Matching Image 4) */}
              <section className="rounded-[28px] border border-[#E3E0D9] bg-white p-6 sm:p-7 shadow-[0px_4px_20px_rgba(0,0,0,0.03)]">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-6 items-center justify-center rounded-full bg-[#0B0C0F] text-xs font-bold text-white">
                    4
                  </div>
                  <h2 className="text-[17px] font-semibold text-[#0B0C0F]">
                    Payment method
                  </h2>
                </div>

                {/* Method Tabs matching Image 4 */}
                <div className="mt-5 inline-flex p-1 rounded-2xl bg-[#EFECE6] gap-1">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("upi")}
                    className={cn(
                      "px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer",
                      paymentMethod === "upi"
                        ? "bg-white text-[#0B0C0F] shadow-sm"
                        : "text-[#5A5F6B] hover:text-[#0B0C0F]"
                    )}
                  >
                    UPI
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod("card")}
                    className={cn(
                      "px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer",
                      paymentMethod === "card"
                        ? "bg-white text-[#0B0C0F] shadow-sm"
                        : "text-[#5A5F6B] hover:text-[#0B0C0F]"
                    )}
                  >
                    Card
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod("netbanking")}
                    className={cn(
                      "px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer",
                      paymentMethod === "netbanking"
                        ? "bg-white text-[#0B0C0F] shadow-sm"
                        : "text-[#5A5F6B] hover:text-[#0B0C0F]"
                    )}
                  >
                    Net banking
                  </button>
                </div>

                {/* Tab 1: UPI */}
                {paymentMethod === "upi" && (
                  <div className="mt-5 space-y-3">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        placeholder="e.g. mobile@upi or username@okhdfcbank"
                        className="w-full rounded-2xl border border-[#E3E0D9] bg-[#FBFBFA] px-4 py-3.5 pr-28 text-sm font-medium text-[#0B0C0F] outline-none focus:border-[#FF6026] focus:bg-white transition"
                      />
                      {upiId.includes("@") && upiId.length >= 5 && (
                        <div className="absolute right-3 inline-flex items-center gap-1 rounded-full bg-[#E3F5E8] px-3 py-1 text-xs font-semibold text-[#1F9D55]">
                          <Check className="size-3.5 stroke-[2.5]" />
                          Valid
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-[#5A5F6B]">
                      Enter your UPI ID or choose Google Pay / PhonePe / QR on the next step. Real-time bank settlement via Cashfree.
                    </p>
                  </div>
                )}

                {/* Tab 2: Card */}
                {paymentMethod === "card" && (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-[#0B0C0F]">Card number</label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-[#E3E0D9] bg-[#FBFBFA] px-3.5 py-2.5 text-sm font-medium text-[#0B0C0F] outline-none focus:border-[#FF6026] focus:bg-white transition"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-[#0B0C0F]">Expires</label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[#E3E0D9] bg-[#FBFBFA] px-3.5 py-2.5 text-sm font-medium text-[#0B0C0F] outline-none focus:border-[#FF6026] focus:bg-white transition"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-[#0B0C0F]">CVV</label>
                        <input
                          type="password"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[#E3E0D9] bg-[#FBFBFA] px-3.5 py-2.5 text-sm font-medium text-[#0B0C0F] outline-none focus:border-[#FF6026] focus:bg-white transition"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 3: Net banking */}
                {paymentMethod === "netbanking" && (
                  <div className="mt-5 space-y-3">
                    <p className="text-xs font-medium text-[#5A5F6B]">Choose your bank:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank", "Other Banks"].map(
                        (bank) => (
                          <button
                            key={bank}
                            type="button"
                            onClick={() => setSelectedBank(bank)}
                            className={cn(
                              "rounded-xl border p-3 text-xs font-semibold text-left transition cursor-pointer",
                              selectedBank === bank
                                ? "border-[#FF6026] bg-[#FF6026]/5 text-[#FF6026]"
                                : "border-[#E3E0D9] bg-[#FBFBFA] text-[#0B0C0F] hover:border-[#D5D0C5]"
                            )}
                          >
                            {bank}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* Right 5 Columns: Sticky Order Summary matching Image 3 */}
            <aside className="lg:col-span-5 lg:sticky lg:top-8 space-y-6">
              <div className="rounded-[28px] border border-[#E3E0D9] bg-white p-6 sm:p-7 shadow-[0px_4px_20px_rgba(0,0,0,0.03)]">
                
                {/* Course Image Preview */}
                <div className="relative h-[180px] w-full rounded-2xl bg-[#F4F3EE] overflow-hidden flex items-center justify-center p-4">
                  <Image
                    src={course.image || "/images/tracks-games.png"}
                    alt={course.title}
                    width={220}
                    height={160}
                    className="object-contain"
                  />
                </div>

                {/* Track Badge & Title */}
                <div className="mt-5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF6026]">
                    {course.trackName.toUpperCase()} · {course.grades.toUpperCase()}
                  </span>
                  <h3 className="mt-1 text-[20px] font-bold text-[#0B0C0F] leading-tight">
                    {course.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-[#5A5F6B] leading-relaxed">
                    6 weekly live classes, 90 min each · Saturdays 10:00 AM · starts 6 Dec
                  </p>
                </div>

                {/* Price Breakdown */}
                <div className="mt-6 space-y-2.5 border-t border-[#ECE9E2] pt-5 text-xs text-[#5A5F6B]">
                  <div className="flex justify-between">
                    <span>Course fee</span>
                    <span className="font-semibold text-[#0B0C0F]">
                      ₹{fullPrice.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rover kit</span>
                    <span className="font-semibold text-[#1F9D55]">Included</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Extra fees</span>
                    <span className="font-semibold text-[#0B0C0F]">₹0</span>
                  </div>
                </div>

                {/* Pay Today Amount */}
                <div className="mt-5 border-t border-[#ECE9E2] pt-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#0B0C0F]">
                    Pay today
                  </span>
                  <span className="text-2xl font-bold tracking-tight text-[#0B0C0F]">
                    ₹{payTodayAmount.toLocaleString("en-IN")}
                  </span>
                </div>

                {/* OUR PROMISE Box matching Image 3 */}
                <div className="mt-6 rounded-2xl border border-[#FFE5D8] bg-[#FFF8F5] p-4 text-xs">
                  <div className="font-bold uppercase tracking-wider text-[#FF6026] text-[10px]">
                    OUR PROMISE
                  </div>
                  <p className="mt-1 text-[#5A5F6B] leading-relaxed">
                    Half the fee back if {studentFirstName} attends at least 3 in 4 classes
                    and doesn&apos;t have a working project.
                  </p>
                </div>

                {/* Pay Button */}
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handlePayAndEnrol}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF6026] to-[#FF7A45] px-6 py-4 text-sm font-semibold text-white shadow-[0px_4px_16px_rgba(255,96,38,0.35)] transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Connecting to Cashfree...
                    </>
                  ) : (
                    <>
                      Pay ₹{payTodayAmount.toLocaleString("en-IN")} and enrol
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </button>

                {errorMessage && (
                  <p className="mt-2 text-center text-xs text-red-600">
                    {errorMessage}
                  </p>
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
