"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

export interface StudentProfile {
  id: string;
  fullName: string;
  parentUserId: string;
  schoolUid: string;
  schoolName?: string;
  currentGrade: number;
  section?: string;
  preferredTrack?: string;
  priorExperience?: string;
  isEnrolled?: boolean;
  activeEnrollment?: {
    id: string;
    courseId?: string;
    status: string;
    currentLevel?: number;
    paymentPlan?: string;
  } | null;
}

export interface ParentUser {
  id: string;
  fullName?: string;
  username: string;
  email: string;
  phone: string;
  role: string;
}

interface AuthContextType {
  user: ParentUser | null;
  students: StudentProfile[];
  activeStudent: StudentProfile | null;
  isLoading: boolean;
  login: (identifier: string, password?: string) => Promise<{ success: boolean; redirectTo: string; error?: string }>;
  signup: (payload: { fullName: string; email: string; phone: string; password?: string; whatsappUpdates?: boolean }) => Promise<{ success: boolean; redirectTo: string; error?: string }>;
  logout: () => Promise<void>;
  addStudent: (studentData: { fullName: string; currentGrade: number; schoolName: string; preferredTrack?: string; priorExperience?: string }) => Promise<{ success: boolean; student?: StudentProfile; recommendedEnrollUrl?: string; error?: string }>;
  setActiveStudent: (student: StudentProfile | null) => void;
  updateUserProfile: (data: { fullName?: string; phone?: string }) => void;
  refreshStudents: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_USER_KEY = "thinkova_parent_profile";
const LOCAL_STORAGE_ACTIVE_STUDENT_KEY = "thinkova_active_student_profile";
const LOCAL_STORAGE_STUDENTS_KEY = "thinkova_students_list";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ParentUser | null>(null);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [activeStudent, setActiveStudentState] = useState<StudentProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const initialRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    for (const key of Object.keys(localStorage)) {
      if ([LOCAL_STORAGE_USER_KEY, LOCAL_STORAGE_STUDENTS_KEY, LOCAL_STORAGE_ACTIVE_STUDENT_KEY, "thinkova_enrolled_courses"].includes(key) || key.startsWith("thinkova_sub_")) localStorage.removeItem(key);
    }
    const controller = new AbortController();
    initialRequest.current = controller;
    async function load() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store", signal: controller.signal });
        const data = res.ok ? await res.json() : null;
        if (controller.signal.aborted) return;
        const roster: StudentProfile[] = data?.students || [];
        setUser(data?.user || null);
        setStudents(roster);
        setActiveStudentState(roster[0] || null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    const reloadSession = (event: StorageEvent) => {
      if (event.key === "thinkova_session_change") window.location.reload();
    };
    const restorePage = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", restorePage);
    window.addEventListener("storage", reloadSession);
    void load().catch(() => {});
    return () => {
      controller.abort();
      window.removeEventListener("storage", reloadSession);
      window.removeEventListener("pageshow", restorePage);
    };
  }, []);

  const setActiveStudent = (student: StudentProfile | null) => {
    setActiveStudentState(student);
    if (student) {
      setStudents((prev) => {
        if (!prev.some((s) => s.id === student.id)) {
          const updated = [...prev, student];
          return updated;
        }
        return prev;
      });
    }

  };

  const updateUserProfile = (updated: { fullName?: string; phone?: string }) => {
    setUser((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updated };
      return next;
    });
  };

  const refreshStudents = async () => {
    try {
      const res = await fetch("/api/students", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.students) {
          setStudents(data.students);
        }
      }
    } catch (e) {
      console.warn("[Auth Context] Error refreshing students:", e);
    }
  };

  const login = async (identifier: string, password?: string) => {
    initialRequest.current?.abort();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, redirectTo: "", error: data.error || "Login failed" };
      }
      localStorage.setItem("thinkova_session_change", crypto.randomUUID());
      setUser(data.user);
      setStudents(data.students || []);
      setActiveStudentState(data.students?.[0] || null);
      return { success: true, redirectTo: data.redirectTo || "/who-is-learning" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      return { success: false, redirectTo: "", error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (payload: { fullName: string; email: string; phone: string; password?: string; whatsappUpdates?: boolean }) => {
    initialRequest.current?.abort();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, redirectTo: "", error: data.error || "Signup failed" };
      }
      localStorage.setItem("thinkova_session_change", crypto.randomUUID());
      setUser(data.user);
      setStudents([]);
      setActiveStudentState(null);
      return { success: true, redirectTo: data.redirectTo || "/tell-us-child" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      return { success: false, redirectTo: "", error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    initialRequest.current?.abort();
    const result = await fetch("/api/auth/logout", { method: "POST" });
    if (!result.ok) throw new Error("Sign-out failed. Please try again.");
    setUser(null);
    setStudents([]);
    setActiveStudent(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      localStorage.removeItem(LOCAL_STORAGE_ACTIVE_STUDENT_KEY);
      localStorage.removeItem(LOCAL_STORAGE_STUDENTS_KEY);
    }
    localStorage.setItem("thinkova_session_change", crypto.randomUUID());
    router.push("/login");
  };

  const addStudent = async (studentData: {
    fullName: string;
    currentGrade: number;
    schoolName: string;
    preferredTrack?: string;
    priorExperience?: string;
  }) => {
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(studentData),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Failed to save student profile" };
      }

      const newStudent: StudentProfile = {
        ...data.student,
        isEnrolled: false,
        activeEnrollment: null,
      };

      setStudents((prev) => {
        const next = [...prev, newStudent];
        return next;
      });
      setActiveStudent(newStudent);

      return {
        success: true,
        student: newStudent,
        recommendedEnrollUrl: data.recommendedEnrollUrl,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      return { success: false, error: msg };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        students,
        activeStudent,
        isLoading,
        login,
        signup,
        logout,
        updateUserProfile,
        addStudent,
        setActiveStudent,
        refreshStudents,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

