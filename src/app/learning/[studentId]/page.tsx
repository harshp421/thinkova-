"use client";

import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { BookOpen, ArrowRight } from "lucide-react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { TASK_DEFINITIONS } from "@/data/learning-tasks";
import {
  BEFORE_YOU_JOIN_ITEMS,
  PAST_RECORDINGS,
  LiveClassSession,
  BeforeJoinCheckItem,
  ReplayItem,
} from "@/data/live-classes";
import {
  ActiveTab,
  CourseSubTab,
  TutorQnAItem,
  CourseRoadmapSection,
  LiveClassesSection,
  ProgressCertificatesSection,
  LessonPlayerSection,
  QuizSection,
  BuildTaskSection,
  AskTutorModal,
  RecordingModal,
} from "@/components/learning";
import { LoadingSessionOverlay } from "@/components/ui/LoadingSessionOverlay";

export default function MyLearningPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user, activeStudent, isLoading: authLoading } = useAuth();

  // Authentication Guard: require login to view learning content
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?redirectTo=/learning");
    }
  }, [authLoading, user, router]);

  const studentId = String(params?.studentId || activeStudent?.id || "student");
  const studentName = activeStudent?.fullName || user?.fullName || "Learner";
  const studentFirstName = studentName.split(" ")[0] || "Learner";
  const studentGrade = activeStudent?.currentGrade || 6;

  const [completedLevels, setCompletedLevels] = useState<number>(0);
  const [isEnrolled, setIsEnrolled] = useState<boolean>(Boolean(activeStudent?.isEnrolled));
  const [activeCourseTitle, setActiveCourseTitle] = useState<string>("ThinkOva Studio Course");

  useEffect(() => {
    async function fetchStudentProgress() {
      if (!studentId) return;
      try {
        const res = await fetch(`/api/learning/progress?studentId=${studentId}`);
        if (res.ok) {
          const data = await res.json();
          const hasEnrolment = Boolean(data.isEnrolled);
          setIsEnrolled(hasEnrolment);
          if (data.progress?.courseTitle) {
            setActiveCourseTitle(data.progress.courseTitle);
          } else if (data.activeEnrollments?.[0]?.courseTitle) {
            setActiveCourseTitle(data.activeEnrollments[0].courseTitle);
          }
          if (data.progress?.milestones) {
            const done = data.progress.milestones.filter((m: { completed: boolean }) => m.completed).length;
            setCompletedLevels(done);
          } else if (data.detailedProgress) {
            setCompletedLevels(data.detailedProgress.levelsDone || 0);
          }
        }
      } catch {
        // Fallback default 0 for new students
      }
    }
    fetchStudentProgress();
  }, [studentId]);

  const currentLevel = Math.min(8, completedLevels + 1);
  const defaultInitialTask = completedLevels === 0 ? "level-1-problem-map" : "level-6-memory";

  // Dynamic URL query parameters for unique ID variations & state restoration
  const initialLesson = searchParams.get("lesson");
  const initialQuiz = searchParams.get("quiz");
  const initialViewParam = searchParams.get("view");
  const initialTabParam = searchParams.get("tab") as CourseSubTab | null;
  const initialTaskId = searchParams.get("taskId") || defaultInitialTask;

  const [activeView, setActiveView] = useState<ActiveTab>(
    initialViewParam === "build-task"
      ? "build-task"
      : initialQuiz
      ? "quiz"
      : initialLesson
      ? "lesson"
      : "course"
  );
  const [courseSubTab, setCourseSubTab] = useState<CourseSubTab>(
    initialTabParam === "live" || initialTabParam === "progress" ? initialTabParam : "courses"
  );
  const [activeTaskId, setActiveTaskId] = useState<string>(initialTaskId);
  const [isLessonCompleted, setIsLessonCompleted] = useState(false);

  // Live classes & recordings state
  const [beforeJoinList, setBeforeJoinList] = useState<BeforeJoinCheckItem[]>(BEFORE_YOU_JOIN_ITEMS);
  const [activeRecordingModal, setActiveRecordingModal] = useState<LiveClassSession | null>(null);

  // "Ask a Question" Modal & Real-time Tutor Sync
  const [isAskModalOpen, setIsAskModalOpen] = useState(false);
  const [tutorQnAList, setTutorQnAList] = useState<TutorQnAItem[]>([
    {
      id: "q-seed-1",
      question:
        "How do I make sure the agent remembers what subject was mentioned in step 1 when it answers in step 2?",
      askedAt: "2 hours ago",
      tutorName: "Ms Ananya Rao",
      tutorRole: "AI & Robotics Mentor",
      reply:
        "Hi Aarav! In Lesson 3 at 04:10, we pass the memory state object across sequential steps. Make sure your step 2 function takes `context.previousTurn` as an argument before crafting its reply!",
      repliedAt: "1 hour ago",
    },
  ]);

  // Dynamic navigation router with unique ID variations & browser history push
  const navigateView = (
    view: ActiveTab,
    opts?: {
      taskId?: string;
      tab?: CourseSubTab;
      lessonId?: string;
      quizId?: string;
    }
  ) => {
    setActiveView(view);
    if (opts?.tab) {
      setCourseSubTab(opts.tab);
    }
    if (opts?.taskId) {
      setActiveTaskId(opts.taskId);
    }

    // Synchronize URL query params so each state has a unique address
    const sp = new URLSearchParams();
    if (view !== "course") {
      sp.set("view", view);
    }
    if (view === "course" && (opts?.tab || courseSubTab) !== "courses") {
      sp.set("tab", opts?.tab || courseSubTab);
    }
    if (opts?.taskId) {
      sp.set("taskId", opts.taskId);
    }
    if (opts?.lessonId) {
      sp.set("lesson", opts.lessonId);
    }
    if (opts?.quizId) {
      sp.set("quiz", opts.quizId);
    }
    const q = sp.toString();
    const url = q ? `/learning/${studentId}?${q}` : `/learning/${studentId}`;
    window.history.pushState({}, "", url);
  };

  // Sync state on popstate (browser back/forward button)
  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const v = (sp.get("view") as ActiveTab) || "course";
      const t = (sp.get("tab") as CourseSubTab) || "courses";
      const tid = sp.get("taskId") || "level-6-memory";
      setActiveView(v);
      setCourseSubTab(t);
      if (tid && TASK_DEFINITIONS[tid]) {
        setActiveTaskId(tid);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Toggle Before You Join checklist item
  const handleToggleBeforeJoin = (id: string) => {
    setBeforeJoinList((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  // Open replay recording modal
  const handleOpenRecording = (replay: ReplayItem) => {
    const session =
      PAST_RECORDINGS.find(
        (r) =>
          r.title.toLowerCase().includes(replay.title.toLowerCase().slice(0, 10)) ||
          r.id === replay.id
      ) ||
      PAST_RECORDINGS[0] ||
      null;
    setActiveRecordingModal(session);
  };

  if (authLoading && !user) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center bg-[#F4F3EE]">
        <LoadingSessionOverlay
          isOpen={true}
          message="Opening student portal..."
          subMessage="Loading your lessons, build quests, and live lab timings."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-[#F4F3EE] text-[#0B0C0F] selection:bg-[#FF6026] selection:text-white">
      {/* App Sidebar v2 */}
      <AppSidebar activeItem="my-learning" />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 p-6 sm:p-10 lg:p-12 overflow-y-auto">
        <div className="mx-auto max-w-[1140px]">

          {/* ========================================================================= */}
          {/* VIEW A: MAIN COURSE ROADMAP & SUBTABS                                     */}
          {/* ========================================================================= */}
          {activeView === "course" && (
            <div className="space-y-7">
              {/* Header Title & Subtabs */}
              <div>
                <h1 className="font-display text-[32px] sm:text-[36px] font-semibold text-[#0B0C0F] tracking-tight">
                  My learning
                </h1>

                {/* Sub-Tabs (Courses, Live classes, Progress and certificates) */}
                <div className="mt-5 flex items-center gap-8 border-b border-[#E3E0D9]">
                  <button
                    type="button"
                    onClick={() => navigateView("course", { tab: "courses" })}
                    className={cn(
                      "pb-3 text-sm font-semibold transition-all duration-200 cursor-pointer relative",
                      courseSubTab === "courses"
                        ? "text-[#0B0C0F] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#FF6026]"
                        : "text-[#5A5F6B] hover:text-[#0B0C0F]"
                    )}
                  >
                    Courses
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateView("course", { tab: "live" })}
                    className={cn(
                      "pb-3 text-sm font-semibold transition-all duration-200 cursor-pointer relative",
                      courseSubTab === "live"
                        ? "text-[#0B0C0F] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#FF6026]"
                        : "text-[#5A5F6B] hover:text-[#0B0C0F]"
                    )}
                  >
                    Live classes
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateView("course", { tab: "progress" })}
                    className={cn(
                      "pb-3 text-sm font-semibold transition-all duration-200 cursor-pointer relative",
                      courseSubTab === "progress"
                        ? "text-[#0B0C0F] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#FF6026]"
                        : "text-[#5A5F6B] hover:text-[#0B0C0F]"
                    )}
                  >
                    Progress and certificates
                  </button>
                </div>
              </div>

              {!isEnrolled ? (
                <div className="rounded-[28px] border border-dashed border-[#DCD8CF] bg-white p-8 text-center sm:p-14 shadow-sm">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#FFF2EB] text-[#FF6026]">
                    <BookOpen className="size-7" />
                  </div>

                  <span className="mt-4 inline-block rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800">
                    No active course registered
                  </span>

                  <h2 className="mt-3 font-display text-[24px] sm:text-[30px] font-semibold text-[#0B0C0F] tracking-tight">
                    Enrol in a course to start {studentFirstName}&apos;s learning
                  </h2>

                  <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[#5A5F6B]">
                    {studentName} is registered in Grade {studentGrade}, but has not enrolled in a course yet. Enrol in an AI, Robotics, or Coding track to unlock live in-school lab sessions, tutor coaching, and weekly interactive worlds.
                  </p>

                  <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                    <button
                      type="button"
                      onClick={() => router.push(`/explore?grade=${studentGrade}`)}
                      className="inline-flex items-center gap-2 rounded-full bg-[#FF6026] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(255,96,38,0.3)] transition hover:bg-[#E8531C] active:scale-95 cursor-pointer"
                    >
                      <span>Enrol in a course to start your learning</span>
                      <ArrowRight className="size-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push("/home")}
                      className="rounded-full border border-[#DCD8CF] bg-white px-6 py-3.5 text-sm font-semibold text-[#0B0C0F] hover:bg-[#F8F7F4] transition cursor-pointer"
                    >
                      Return to Dashboard
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Subtab 1: Courses Roadmap */}
                  {courseSubTab === "courses" && (
                    <CourseRoadmapSection
                      isLessonCompleted={isLessonCompleted}
                      completedLevels={completedLevels}
                      currentLevel={currentLevel}
                      courseTitle={activeCourseTitle}
                      onNavigateLesson={() => navigateView("lesson")}
                      onNavigateQuiz={() => navigateView("quiz")}
                      onNavigateBuildTask={(tid) =>
                        navigateView("build-task", { taskId: tid || defaultInitialTask })
                      }
                    />
                  )}

                  {/* Subtab 2: Live Classes View */}
                  {courseSubTab === "live" && (
                    <LiveClassesSection
                      beforeJoinList={beforeJoinList}
                      onToggleBeforeJoin={handleToggleBeforeJoin}
                      onOpenRecording={handleOpenRecording}
                    />
                  )}

                  {/* Subtab 3: Progress and Certificates */}
                  {courseSubTab === "progress" && (
                    <ProgressCertificatesSection
                      studentId={studentId}
                      studentName={studentName}
                      onNavigateBuildTask={(tid) =>
                        navigateView("build-task", { taskId: tid || "level-6-memory" })
                      }
                      onNavigateLesson={() => navigateView("lesson")}
                    />
                  )}
                </>
              )}

            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW B: INTERACTIVE LESSON VIDEO PLAYER                                   */}
          {/* ========================================================================= */}
          {activeView === "lesson" && (
            <LessonPlayerSection
              studentId={studentId}
              isLessonCompleted={isLessonCompleted}
              setIsLessonCompleted={setIsLessonCompleted}
              onNavigateRoadmap={() => navigateView("course")}
              onNavigateQuiz={() => navigateView("quiz")}
              onNavigateBuildTask={(tid) =>
                navigateView("build-task", { taskId: tid || "level-6-memory" })
              }
              onOpenAskModal={() => setIsAskModalOpen(true)}
              tutorQnAList={tutorQnAList}
            />
          )}

          {/* ========================================================================= */}
          {/* VIEW C: TEST QUIZ ENGINE                                                  */}
          {/* ========================================================================= */}
          {activeView === "quiz" && (
            <QuizSection
              studentId={studentId}
              onCloseQuiz={() => navigateView("course")}
              onNextLesson={() => navigateView("course")}
              onReviewLesson={() => navigateView("lesson")}
              onQuizPassed={() => setIsLessonCompleted(true)}
            />
          )}

          {/* ========================================================================= */}
          {/* VIEW D: BUILD TASK WORKSPACE                                              */}
          {/* ========================================================================= */}
          {activeView === "build-task" && (
            <BuildTaskSection
              studentId={studentId}
              activeTaskId={activeTaskId}
              onCloseTask={() => navigateView("course")}
              onNavigateLive={() => navigateView("course", { tab: "live" })}
            />
          )}

          {/* ========================================================================= */}
          {/* MODALS                                                                    */}
          {/* ========================================================================= */}
          <AskTutorModal
            isOpen={isAskModalOpen}
            onClose={() => setIsAskModalOpen(false)}
            studentId={studentId}
            studentName={studentName}
            onQuestionSubmitted={(newItem) =>
              setTutorQnAList((prev) => [newItem, ...prev])
            }
          />

          <RecordingModal
            recording={activeRecordingModal}
            onClose={() => setActiveRecordingModal(null)}
          />

        </div>
      </main>
    </div>
  );
}
