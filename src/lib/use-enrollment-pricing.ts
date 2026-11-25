"use client";

import { useEffect, useState } from "react";
import { enrollmentPricing } from "./enrollment-pricing";

export function useEnrollmentPricing(courseId: string) {
  const [quote, setQuote] = useState<{ courseId: string; price?: number }>({ courseId: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/courses?courseId=${encodeURIComponent(courseId)}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("Course price unavailable");
      const { course } = await response.json();
      if (course?.id !== courseId || !Number.isFinite(course.price) || course.price <= 0) {
        throw new Error("Course price unavailable");
      }
      if (!controller.signal.aborted) setQuote({ courseId, price: course.price });
    }).catch(() => {
      if (!controller.signal.aborted) setQuote({ courseId });
    });
    return () => controller.abort();
  }, [courseId, attempt]);

  return {
    pricing: quote.courseId === courseId && quote.price ? enrollmentPricing(quote.price) : null,
    unavailable: quote.courseId === courseId && !quote.price,
    refresh: () => {
      setQuote({ courseId: "" });
      setAttempt(value => value + 1);
    },
  };
}
