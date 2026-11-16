"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
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
  login: (identifier: string) => Promise<{ success: boolean; redirectTo: string; error?: string }>;
  signup: (payload: { fullName: string; email: string; phone: string; whatsappUpdates?: boolean }) => Promise<{ success: boolean; redirectTo: string; error?: string }>;
  loginWithGoogle: (payload?: { email?: string; name?: string }) => Promise<{ success: boolean; redirectTo: string; error?: string }>;
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
  const [user, setUser] = useState<ParentUser | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return null;
  });

  const [students, setStudents] = useState<StudentProfile[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_STUDENTS_KEY);
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return [];
  });

  const [activeStudent, setActiveStudentState] = useState<StudentProfile | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_ACTIVE_STUDENT_KEY);
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
        if (cached) return false;
      } catch {}
    }
    return true;
  });
  const router = useRouter();

  // Load active session from server and synchronize device localStorage
  const initSession = useCallback(async () => {
    // 1. Initial immediate restore from local storage to prevent UI flash
    if (typeof window !== "undefined") {
      try {
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
        if (cachedUser) {
          setUser(JSON.parse(cachedUser));
          setIsLoading(false);
        }
        const cachedStudents = localStorage.getItem(LOCAL_STORAGE_STUDENTS_KEY);
        let parsedStudents: StudentProfile[] = [];
        if (cachedStudents) {
          try {
            parsedStudents = JSON.parse(cachedStudents);
            setStudents(parsedStudents);
          } catch {
            // ignore
          }
        }
        const cachedActiveStudent = localStorage.getItem(LOCAL_STORAGE_ACTIVE_STUDENT_KEY);
        if (cachedActiveStudent) {
          try {
            const parsedActive = JSON.parse(cachedActiveStudent);
            setActiveStudentState(parsedActive);
            if (parsedStudents.length === 0 && parsedActive) {
              setStudents([parsedActive]);
              localStorage.setItem(LOCAL_STORAGE_STUDENTS_KEY, JSON.stringify([parsedActive]));
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // Safe fallback
      }
    }

    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);

          let resolvedStudents: StudentProfile[] = data.students || [];

          // Preserve cached students if server in-memory store returned empty (e.g. server hot-reload)
          if (resolvedStudents.length === 0 && typeof window !== "undefined") {
            const cachedStudentsStr = localStorage.getItem(LOCAL_STORAGE_STUDENTS_KEY);
            if (cachedStudentsStr) {
              try {
                const parsedCached = JSON.parse(cachedStudentsStr);
                if (Array.isArray(parsedCached) && parsedCached.length > 0) {
                  resolvedStudents = parsedCached;
                }
              } catch {
                // ignore
              }
            }
          }

          // Restore active student from localStorage if available
          let resolvedActiveStudent: StudentProfile | null = null;
          const savedActiveStudent = typeof window !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_ACTIVE_STUDENT_KEY) : null;
          if (savedActiveStudent) {
            try {
              const parsed = JSON.parse(savedActiveStudent);
              const matched = resolvedStudents.find((s: StudentProfile) => s.id === parsed.id);
              resolvedActiveStudent = matched || parsed;
            } catch {
              // ignore
            }
          }

          if (!resolvedActiveStudent && resolvedStudents.length > 0) {
            resolvedActiveStudent = resolvedStudents[0] || null;
          }

          if (resolvedActiveStudent && !resolvedStudents.some((s: StudentProfile) => s.id === resolvedActiveStudent?.id)) {
            resolvedStudents = [...resolvedStudents, resolvedActiveStudent];
          }

          setStudents(resolvedStudents);
          setActiveStudentState(resolvedActiveStudent);

          if (typeof window !== "undefined") {
            localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(data.user));
            localStorage.setItem(LOCAL_STORAGE_STUDENTS_KEY, JSON.stringify(resolvedStudents));
            if (resolvedActiveStudent) {
              localStorage.setItem(LOCAL_STORAGE_ACTIVE_STUDENT_KEY, JSON.stringify(resolvedActiveStudent));
            }
          }
          return;
        }
      }
    } catch (e) {
      console.warn("[Auth Context] Failed to fetch /api/auth/me:", e);
    }
  }, []);

  useEffect(() => {
    initSession().finally(() => setIsLoading(false));
  }, [initSession]);

  const setActiveStudent = (student: StudentProfile | null) => {
    setActiveStudentState(student);
    if (student) {
      setStudents((prev) => {
        if (!prev.some((s) => s.id === student.id)) {
          const updated = [...prev, student];
          if (typeof window !== "undefined") {
            localStorage.setItem(LOCAL_STORAGE_STUDENTS_KEY, JSON.stringify(updated));
          }
          return updated;
        }
        return prev;
      });
    }
    if (typeof window !== "undefined") {
      if (student) {
        localStorage.setItem(LOCAL_STORAGE_ACTIVE_STUDENT_KEY, JSON.stringify(student));
      } else {
        localStorage.removeItem(LOCAL_STORAGE_ACTIVE_STUDENT_KEY);
      }
    }
  };

  const updateUserProfile = (updated: { fullName?: string; phone?: string }) => {
    setUser((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updated };
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(next));
      }
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
          if (typeof window !== "undefined") {
            localStorage.setItem(LOCAL_STORAGE_STUDENTS_KEY, JSON.stringify(data.students));
          }
        }
      }
    } catch (e) {
      console.warn("[Auth Context] Error refreshing students:", e);
    }
  };

  const login = async (identifier: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, redirectTo: "", error: data.error || "Login failed" };
      }
      setUser(data.user);
      setStudents(data.students || []);
      if (data.students?.length > 0) {
        setActiveStudent(data.students[0]);
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(data.user));
        localStorage.setItem(LOCAL_STORAGE_STUDENTS_KEY, JSON.stringify(data.students || []));
      }
      return { success: true, redirectTo: data.redirectTo || "/who-is-learning" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      return { success: false, redirectTo: "", error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (payload: { fullName: string; email: string; phone: string; whatsappUpdates?: boolean }) => {
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
      setUser(data.user);
      setStudents([]);
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(data.user));
      }
      return { success: true, redirectTo: data.redirectTo || "/tell-us-child" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      return { success: false, redirectTo: "", error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (payload?: { email?: string; name?: string }) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, redirectTo: "", error: data.error || "Google sign-in failed" };
      }
      setUser(data.user);
      setStudents(data.students || []);
      if (data.students?.length > 0) {
        setActiveStudent(data.students[0]);
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(data.user));
      }
      return { success: true, redirectTo: data.redirectTo || "/who-is-learning" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      return { success: false, redirectTo: "", error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }
    setUser(null);
    setStudents([]);
    setActiveStudent(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      localStorage.removeItem(LOCAL_STORAGE_ACTIVE_STUDENT_KEY);
      localStorage.removeItem(LOCAL_STORAGE_STUDENTS_KEY);
    }
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
        if (typeof window !== "undefined") {
          localStorage.setItem(LOCAL_STORAGE_STUDENTS_KEY, JSON.stringify(next));
        }
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
        loginWithGoogle,
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

