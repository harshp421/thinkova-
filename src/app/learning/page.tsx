"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LoadingSessionOverlay } from "@/components/ui/LoadingSessionOverlay";

export default function LearningRedirectPage() {
  const router = useRouter();
  const { user, activeStudent, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace("/login?redirectTo=/learning");
      } else if (activeStudent?.id) {
        router.replace(`/learning/${activeStudent.id}`);
      } else {
        router.replace("/who-is-learning");
      }
    }
  }, [authLoading, user, activeStudent, router]);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-[#F4F3EE]">
      <LoadingSessionOverlay isOpen={true} />
    </div>
  );
}

