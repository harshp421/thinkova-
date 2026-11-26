"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatEnrollmentAmount } from "@/lib/enrollment-pricing";

type CashfreeWindow = Window & { Cashfree?: (config: { mode: string }) => {
  checkout(options: { paymentSessionId: string; redirectTarget: string }): Promise<{ error?: { message?: string } } | void>;
} };

function InstallmentPayment() {
  const enrollmentId = useSearchParams().get("enrollmentId") || "";
  const endpoint = "/api/cashfree/installment?enrollmentId=" + encodeURIComponent(enrollmentId);
  const [quote, setQuote] = useState<{ amount: number; studentName: string }>();
  const [signIn, setSignIn] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setQuote(undefined);
    setError("");
    setSignIn(false);
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (response.status === 401) setSignIn(true);
        else if (response.ok) setQuote(data);
        else setError(data.error || "Unable to load this installment.");
      })
      .catch(() => { if (!controller.signal.aborted) setError("Unable to load this installment."); });
    return () => controller.abort();
  }, [endpoint]);

  async function pay() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to start checkout.");
      const browser = window as CashfreeWindow;
      if (!browser.Cashfree) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
          script.onload = () => resolve();
          script.onerror = () => { script.remove(); reject(new Error("Cashfree could not load.")); };
          document.head.appendChild(script);
        });
      }
      if (!browser.Cashfree) throw new Error("Cashfree could not load.");
      const result = await browser.Cashfree({ mode: String(data.environment).toLowerCase() })
        .checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: "_self" });
      if (result?.error) throw new Error(result.error.message || "Cashfree checkout failed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Second installment</h1>
      {signIn && <Link className="mt-4 inline-block underline" href={`/login?redirect=${encodeURIComponent("/parent/payments?enrollmentId=" + encodeURIComponent(enrollmentId))}`}>Sign in to view your installment</Link>}
      {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
      {!quote && !error && !signIn && <p className="mt-4">Loading your installment…</p>}
      {quote && (
        <>
          <p className="mt-4">Balance for {quote.studentName}</p>
          <button type="button" disabled={busy} onClick={pay} className="mt-6 rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
            {busy ? "Opening Cashfree…" : `Pay ${formatEnrollmentAmount(quote.amount)}`}
          </button>
        </>
      )}
    </main>
  );
}

export default function ParentPayments() {
  return <Suspense fallback={<p>Loading your installment…</p>}><InstallmentPayment /></Suspense>;
}
