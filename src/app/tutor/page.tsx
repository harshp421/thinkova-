"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Check,
  Star,
  User,
  Clock,
  Calendar,
  Award,
  AlertCircle,
  MessageSquare,
  Send,
  ShieldCheck,
  Layers,
  ChevronRight,
  Sparkles,
  School,
  ExternalLink,
  RefreshCw,
  Video,
  Play,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

interface TutorBatch {
  id: string;
  batchCode: string;
  schoolId: string;
  schoolName: string;
  schoolCity: string;
  labRoom: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  gradeLevels: number[];
  confirmedStudentsCount: number;
  status: string;
}

interface RosterStudent {
  student: {
    id: string;
    fullName: string;
    currentGrade: number;
    section?: string;
    preferredTrack?: string;
    priorExperience?: string;
  };
  enrollment: {
    id: string;
    currentLevel: number;
    status: string;
    paymentPlan: string;
  };
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  trackTitle?: string;
}

interface AssessmentRecord {
  id: string;
  studentId: string;
  cohortBatchId: string;
  levelNumber: number;
  levelTitle: string;
  attendance: "PRESENT" | "ABSENT";
  projectTitle: string;
  projectArtifactUrl: string;
  tutorScore: number;
  tutorFeedback: string;
  safetyPledgeVerified: boolean;
  createdAt: string;
}

interface TutorQuestion {
  id: string;
  studentId: string;
  studentName: string;
  lessonTitle: string;
  questionText: string;
  attachmentName?: string;
  status: "submitted" | "answered";
  createdAt: string;
  tutorReply?: {
    tutorName: string;
    tutorRole: string;
    repliedAt: string;
    message: string;
  };
}

export default function TutorDashboardPage() {
  const [activeTab, setActiveTab] = useState<"roster" | "assessments" | "doubts" | "schedule" | "curriculum-videos">("roster");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [batch, setBatch] = useState<TutorBatch | null>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [questions, setQuestions] = useState<TutorQuestion[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, "PRESENT" | "ABSENT">>({});

  // Curriculum & Video Management State
  const [curriculumCourseId, setCurriculumCourseId] = useState<string>("robotics-starter");
  const [sharedWeeklyPlan, setSharedWeeklyPlan] = useState<Array<{
    week: number;
    title: string;
    subtitle: string;
    videoUrl?: string;
    recordingDuration?: string;
  }>>([]);
  const [isLoadingCurriculum, setIsLoadingCurriculum] = useState<boolean>(false);
  const [selectedEditWeek, setSelectedEditWeek] = useState<number | null>(null);
  const [uploadVideoUrl, setUploadVideoUrl] = useState<string>("");
  const [uploadVideoTitle, setUploadVideoTitle] = useState<string>("");
  const [uploadVideoDuration, setUploadVideoDuration] = useState<string>("18 min");
  const [uploadVideoNotes, setUploadVideoNotes] = useState<string>("");
  const [isSavingVideo, setIsSavingVideo] = useState<boolean>(false);

  const fetchSharedCurriculum = useCallback(async (cId: string) => {
    setIsLoadingCurriculum(true);
    try {
      const res = await fetch(`/api/tutor/videos?courseId=${encodeURIComponent(cId)}`);
      if (res.ok) {
        const data = await res.json();
        setSharedWeeklyPlan(data.weeklyPlan || []);
      }
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingCurriculum(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "curriculum-videos") {
      fetchSharedCurriculum(curriculumCourseId);
    }
  }, [activeTab, curriculumCourseId, fetchSharedCurriculum]);

  const handleSaveVideo = async (weekNumber: number) => {
    if (!uploadVideoUrl.trim()) return;
    setIsSavingVideo(true);
    try {
      const res = await fetch("/api/tutor/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: curriculumCourseId,
          weekNumber,
          title: uploadVideoTitle || `Level ${weekNumber} Studio Lab Session`,
          videoUrl: uploadVideoUrl.trim(),
          duration: uploadVideoDuration,
          notes: uploadVideoNotes,
          tutorName: "Aakash Mehta",
          batchId: batch?.id || "batch_pune_campus_01",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          text: `✓ Video for Level ${weekNumber} saved & synced in real time to all enrolled students!`,
          type: "success",
        });
        setSelectedEditWeek(null);
        setUploadVideoUrl("");
        fetchSharedCurriculum(curriculumCourseId);
      } else {
        setStatusMessage({ text: data.error || "Failed to save video.", type: "error" });
      }
    } catch {
      setStatusMessage({ text: "Network error saving video.", type: "error" });
    } finally {
      setIsSavingVideo(false);
    }
  };

  // Assessment Form State
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [levelNumber, setLevelNumber] = useState<number>(1);
  const [levelTitle, setLevelTitle] = useState<string>("Level 1: Explore AI and digital safety");
  const [tutorScore, setTutorScore] = useState<number>(5);
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [projectArtifactUrl, setProjectArtifactUrl] = useState<string>("");
  const [tutorFeedback, setTutorFeedback] = useState<string>("");
  const [safetyPledgeVerified, setSafetyPledgeVerified] = useState<boolean>(true);
  const [isSubmittingAssessment, setIsSubmittingAssessment] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Doubts Form State
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});
  const [isReplying, setIsReplying] = useState<string | null>(null);

  const fetchTutorData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch batches and roster from MongoDB Atlas
      const res = await fetch("/api/tutor/batches");
      const data = await res.json();

      if (data.success) {
        setBatch(data.activeBatch);
        setRoster(data.roster || []);
        setAssessments(data.assessments || []);

        // Initialize attendance map
        const initialAttendance: Record<string, "PRESENT" | "ABSENT"> = {};
        (data.roster || []).forEach((item: RosterStudent) => {
          initialAttendance[item.student.id] = "PRESENT";
        });
        setAttendanceMap(initialAttendance);

        if (data.roster?.length > 0 && !selectedStudentId) {
          setSelectedStudentId(data.roster[0].student.id);
          setProjectTitle(`${data.roster[0].student.fullName.split(" ")[0]}'s Working Rover Milestone`);
        }
      }

      // 2. Fetch student doubts
      const qRes = await fetch("/api/learning/tutor-question?all=true");
      const qData = await qRes.json();
      if (qData.success && Array.isArray(qData.questions)) {
        setQuestions(qData.questions);
      }
    } catch (err) {
      console.error("Failed to load tutor data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTutorData();
  }, []);

  const toggleAttendance = (studentId: string) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: prev[studentId] === "PRESENT" ? "ABSENT" : "PRESENT",
    }));
  };

  const handleStudentSelect = (studentId: string) => {
    setSelectedStudentId(studentId);
    const studentItem = roster.find((r) => r.student.id === studentId);
    if (studentItem) {
      setProjectTitle(`${studentItem.student.fullName.split(" ")[0]}'s Level ${levelNumber} Project`);
      // Prefill with existing assessment if already evaluated
      const existing = assessments.find(
        (a) => a.studentId === studentId && a.levelNumber === levelNumber
      );
      if (existing) {
        setTutorScore(existing.tutorScore);
        setTutorFeedback(existing.tutorFeedback);
        setProjectTitle(existing.projectTitle);
        setProjectArtifactUrl(existing.projectArtifactUrl);
        setSafetyPledgeVerified(existing.safetyPledgeVerified);
      } else {
        setTutorScore(5);
        setTutorFeedback(`Strong initiative during lab. Successfully tested circuit components and demonstrated safety compliance.`);
      }
    }
  };

  const handleSaveAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) return;

    setIsSubmittingAssessment(true);
    setStatusMessage(null);

    const payload = {
      studentId: selectedStudentId,
      cohortBatchId: batch?.id || "batch_pune_campus_01",
      levelNumber,
      levelTitle,
      attendance: attendanceMap[selectedStudentId] || "PRESENT",
      projectTitle: projectTitle || "Weekly Lab Project Milestone",
      projectArtifactUrl: projectArtifactUrl || `/artifacts/${selectedStudentId}/level-${levelNumber}`,
      tutorScore,
      tutorFeedback: tutorFeedback || "Student completed practical hands-on tasks and verified safety protocols.",
      safetyPledgeVerified,
    };

    try {
      const res = await fetch("/api/tutor/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          text: `Assessment for ${roster.find((r) => r.student.id === selectedStudentId)?.student.fullName} saved to MongoDB Atlas! Auto-queued for Saturday 6 PM parent report email & WhatsApp.`,
          type: "success",
        });

        // Refresh assessments list
        setAssessments((prev) => {
          const filtered = prev.filter(
            (a) => !(a.studentId === selectedStudentId && a.levelNumber === levelNumber)
          );
          return [data.assessment, ...filtered];
        });
      } else {
        setStatusMessage({ text: data.error || "Failed to save assessment.", type: "error" });
      }
    } catch {
      setStatusMessage({ text: "Network error saving assessment.", type: "error" });
    } finally {
      setIsSubmittingAssessment(false);
    }
  };

  const handleSendReply = async (questionId: string) => {
    const text = replyTextMap[questionId];
    if (!text || text.trim().length === 0) return;

    setIsReplying(questionId);
    try {
      const res = await fetch("/api/learning/tutor-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          questionId,
          message: text,
          tutorName: "Aakash Mehta",
          tutorRole: "Lead STEM & AI Mentor",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setQuestions((prev) =>
          prev.map((q) => (q.id === questionId ? data.question : q))
        );
        setReplyTextMap((prev) => ({ ...prev, [questionId]: "" }));
      }
    } catch (err) {
      console.error("Failed to post tutor reply:", err);
    } finally {
      setIsReplying(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F3EE] text-[#0B0C0F] font-sans">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E3E0D9] px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo />
            <div className="h-5 w-[1px] bg-stone-300 hidden sm:block" />
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FF6026]/10 text-[#FF6026]">
              <Sparkles className="w-3.5 h-3.5" />
              Tutor Lab Portal
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2.5 bg-[#F4F3EE] px-3.5 py-1.5 rounded-full border border-stone-200">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-stone-700">
                Connected to MongoDB Atlas
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#0B0C0F] text-white flex items-center justify-center font-bold text-xs">
                AM
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-bold leading-none">Aakash Mehta</p>
                <p className="text-[11px] text-stone-500 leading-tight">Lead STEM Mentor</p>
              </div>
            </div>

            <Link
              href="/who-is-learning"
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 border border-stone-300 px-3 py-1.5 rounded-lg hover:bg-stone-50 transition"
            >
              Exit to Student View
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
        {/* Batch Overview Banner */}
        <section className="bg-white rounded-2xl border border-[#E3E0D9] p-6 lg:p-8 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-[#0B0C0F] text-white uppercase tracking-wider">
                  {batch?.batchCode || "BATCH-PUNE-01"}
                </span>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  ● Active In-School Batch
                </span>
                <span className="text-xs text-stone-500">
                  Grades 5, 6, 7, 8
                </span>
              </div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">
                {batch?.schoolName || "The Banyan Grove School (Pune Campus)"}
              </h1>
              <p className="text-sm text-stone-600 flex flex-wrap items-center gap-4 pt-1">
                <span className="flex items-center gap-1.5">
                  <School className="w-4 h-4 text-stone-400" />
                  {batch?.labRoom || "Innovation & Robotics Lab 2"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-stone-400" />
                  Every {batch?.dayOfWeek || "Saturday"}, {batch?.startTime || "10:00"} – {batch?.endTime || "11:30"} AM
                </span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchTutorData}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl border border-stone-200 text-stone-700 bg-stone-50 hover:bg-stone-100 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                Sync Atlas DB
              </button>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-stone-100">
            <div className="bg-[#F8F7F4] p-4 rounded-xl">
              <p className="text-xs font-medium text-stone-500">Enrolled Learners</p>
              <p className="text-2xl font-bold text-[#0B0C0F] mt-1">{roster.length}</p>
            </div>
            <div className="bg-[#F8F7F4] p-4 rounded-xl">
              <p className="text-xs font-medium text-stone-500">Today's Attendance</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {Object.values(attendanceMap).filter((v) => v === "PRESENT").length} / {roster.length}
              </p>
            </div>
            <div className="bg-[#F8F7F4] p-4 rounded-xl">
              <p className="text-xs font-medium text-stone-500">Assessments Logged</p>
              <p className="text-2xl font-bold text-[#FF6026] mt-1">{assessments.length}</p>
            </div>
            <div className="bg-[#F8F7F4] p-4 rounded-xl">
              <p className="text-xs font-medium text-stone-500">Pending Student Doubts</p>
              <p className="text-2xl font-bold text-indigo-600 mt-1">
                {questions.filter((q) => q.status !== "answered").length}
              </p>
            </div>
          </div>
        </section>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 border-b border-stone-200 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("roster")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === "roster"
                ? "bg-[#0B0C0F] text-white shadow-sm"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
            }`}
          >
            1. Lab Attendance & Roster ({roster.length})
          </button>
          <button
            onClick={() => setActiveTab("assessments")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === "assessments"
                ? "bg-[#0B0C0F] text-white shadow-sm"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
            }`}
          >
            2. Weekly Assessments & Parent Dispatch
          </button>
          <button
            onClick={() => setActiveTab("doubts")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === "doubts"
                ? "bg-[#0B0C0F] text-white shadow-sm"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
            }`}
          >
            3. Student Doubts Inbox
            {questions.filter((q) => q.status !== "answered").length > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#FF6026] text-white text-[10px] font-bold flex items-center justify-center">
                {questions.filter((q) => q.status !== "answered").length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("schedule")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === "schedule"
                ? "bg-[#0B0C0F] text-white shadow-sm"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
            }`}
          >
            4. Lab Schedule & Kit Inventory
          </button>
          <button
            onClick={() => setActiveTab("curriculum-videos")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === "curriculum-videos"
                ? "bg-[#0B0C0F] text-white shadow-sm"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
            }`}
          >
            <Video className="w-4 h-4 text-[#FF6026]" />
            5. Curriculum & Lesson Videos
          </button>
        </div>

        {/* TAB 1: Roster & Attendance */}
        {activeTab === "roster" && (
          <div className="bg-white rounded-2xl border border-[#E3E0D9] overflow-hidden shadow-sm">
            <div className="p-6 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Class Roster & Physical Lab Attendance</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Click the toggle to mark learners Present or Absent for this session.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const allPresent: Record<string, "PRESENT" | "ABSENT"> = {};
                    roster.forEach((r) => (allPresent[r.student.id] = "PRESENT"));
                    setAttendanceMap(allPresent);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition"
                >
                  Mark All Present
                </button>
              </div>
            </div>

            <div className="divide-y divide-stone-100">
              {roster.map((item) => {
                const isPresent = attendanceMap[item.student.id] === "PRESENT";
                return (
                  <div
                    key={item.student.id}
                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-stone-50/60 transition"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-full bg-orange-100 text-[#FF6026] flex items-center justify-center font-bold text-sm">
                        {item.student.fullName.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-[#0B0C0F]">{item.student.fullName}</p>
                          <span className="text-[11px] font-semibold bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
                            Grade {item.student.currentGrade} ({item.student.section || "Sec A"})
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">
                          Track: <strong className="text-stone-700">{item.trackTitle}</strong> · Level {item.enrollment.currentLevel}
                        </p>
                        <p className="text-[11px] text-stone-400 mt-0.5">
                          Parent: {item.parentName} ({item.parentPhone || "Verified"})
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleAttendance(item.student.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                          isPresent
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-rose-100 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {isPresent ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Present in Lab
                          </>
                        ) : (
                          "Marked Absent"
                        )}
                      </button>

                      <button
                        onClick={() => {
                          handleStudentSelect(item.student.id);
                          setActiveTab("assessments");
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 transition"
                      >
                        Assess &rarr;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: Assessments */}
        {activeTab === "assessments" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form Column */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E3E0D9] p-6 lg:p-8 shadow-sm">
              <div className="border-b border-stone-100 pb-4 mb-6">
                <h2 className="text-lg font-bold">Record Weekly Lab Evaluation</h2>
                <p className="text-xs text-stone-500 mt-1">
                  Evaluations saved here are stored in MongoDB Atlas and auto-dispatched to parents on Saturdays at 18:00 IST via WhatsApp & Email.
                </p>
              </div>

              {statusMessage && (
                <div
                  className={`p-4 rounded-xl text-xs font-medium mb-6 flex items-start gap-3 ${
                    statusMessage.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-rose-50 text-rose-800 border border-rose-200"
                  }`}
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{statusMessage.text}</span>
                </div>
              )}

              <form onSubmit={handleSaveAssessment} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                      Select Student
                    </label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => handleStudentSelect(e.target.value)}
                      className="w-full bg-[#F8F7F4] border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6026]"
                    >
                      {roster.map((r) => (
                        <option key={r.student.id} value={r.student.id}>
                          {r.student.fullName} (Grade {r.student.currentGrade})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                      Curriculum Level
                    </label>
                    <select
                      value={levelNumber}
                      onChange={(e) => {
                        const num = Number(e.target.value);
                        setLevelNumber(num);
                        setLevelTitle(`Level ${num} Milestone`);
                      }}
                      className="w-full bg-[#F8F7F4] border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6026]"
                    >
                      <option value={1}>Level 1 · Digital Safety & Problem Map</option>
                      <option value={2}>Level 2 · Prompt Engineering & Circuits</option>
                      <option value={3}>Level 3 · Ultrasonic Sensors & Build</option>
                      <option value={4}>Level 4 · Logic Decision Trees</option>
                      <option value={5}>Level 5 · Guided Agent Blueprint</option>
                      <option value={6}>Level 6 · Complete Working Prototype</option>
                    </select>
                  </div>
                </div>

                {/* Rating Stars */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                    Tutor Score (1 to 5 Stars)
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setTutorScore(star)}
                        className={`p-2 rounded-xl transition ${
                          tutorScore >= star
                            ? "text-amber-500 bg-amber-50"
                            : "text-stone-300 bg-stone-100 hover:text-stone-400"
                        }`}
                      >
                        <Star className="w-6 h-6 fill-current" />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-stone-600 ml-2">
                      {tutorScore === 5 ? "Exceptional Mastery" : tutorScore >= 4 ? "Proficient" : "Needs Review"}
                    </span>
                  </div>
                </div>

                {/* Project Details */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                    Project / Milestone Title
                  </label>
                  <input
                    type="text"
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    placeholder="e.g. Wall Evasion Rover with Distance Sensor"
                    className="w-full bg-[#F8F7F4] border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6026]"
                  />
                </div>

                {/* Artifact Link */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                    Project Artifact URL (Simulator / Code / Video)
                  </label>
                  <input
                    type="text"
                    value={projectArtifactUrl}
                    onChange={(e) => setProjectArtifactUrl(e.target.value)}
                    placeholder="https://thinkova.ai/artifacts/aarav/rover-v1"
                    className="w-full bg-[#F8F7F4] border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6026]"
                  />
                </div>

                {/* Tutor Feedback */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                    Personalized Mentor Feedback (Visible to Parents)
                  </label>
                  <textarea
                    rows={3}
                    value={tutorFeedback}
                    onChange={(e) => setTutorFeedback(e.target.value)}
                    placeholder="Write constructive notes on what went well and what the student should review..."
                    className="w-full bg-[#F8F7F4] border border-stone-200 rounded-xl p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6026]"
                  />
                </div>

                {/* Safety Pledge */}
                <div className="flex items-center gap-3 bg-stone-50 p-4 rounded-xl border border-stone-200">
                  <input
                    type="checkbox"
                    id="safetyPledge"
                    checked={safetyPledgeVerified}
                    onChange={(e) => setSafetyPledgeVerified(e.target.checked)}
                    className="w-4 h-4 text-[#FF6026] rounded border-stone-300 focus:ring-[#FF6026]"
                  />
                  <label htmlFor="safetyPledge" className="text-xs font-medium text-stone-700 cursor-pointer">
                    Verified hardware safety pledge: Child safely disconnected power and handled soldering/cables under supervision.
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAssessment}
                  className="w-full py-3.5 rounded-xl font-bold text-sm bg-[#FF6026] text-white hover:bg-[#e05420] transition shadow-md flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {isSubmittingAssessment ? "Saving to Atlas..." : "Save Assessment to MongoDB Atlas"}
                </button>
              </form>
            </div>

            {/* Past Evaluations Sidebar */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-[#E3E0D9] p-5 shadow-sm">
                <h3 className="text-sm font-bold text-stone-800 mb-3 flex items-center gap-2">
                  <Award className="w-4 h-4 text-[#FF6026]" />
                  Recorded Evaluations in Atlas ({assessments.length})
                </h3>
                {assessments.length === 0 ? (
                  <p className="text-xs text-stone-400 py-4 text-center">
                    No assessments submitted yet for this batch.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {assessments.map((asm) => {
                      const studentName = roster.find((r) => r.student.id === asm.studentId)?.student.fullName || asm.studentId;
                      return (
                        <div key={asm.id} className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-stone-900">{studentName}</span>
                            <span className="text-amber-500 font-bold">★ {asm.tutorScore}/5</span>
                          </div>
                          <p className="font-semibold text-stone-700">{asm.levelTitle}</p>
                          <p className="text-stone-500 text-[11px] line-clamp-2">"{asm.tutorFeedback}"</p>
                          <div className="pt-1 flex items-center justify-between text-[10px] text-stone-400">
                            <span>Status: {asm.attendance}</span>
                            <span>{new Date(asm.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Student Doubts Inbox */}
        {activeTab === "doubts" && (
          <div className="bg-white rounded-2xl border border-[#E3E0D9] p-6 lg:p-8 shadow-sm space-y-6">
            <div className="border-b border-stone-100 pb-4">
              <h2 className="text-lg font-bold">Student Doubts & Questions Inbox</h2>
              <p className="text-xs text-stone-500 mt-1">
                Questions asked by learners in the online learning player are routed here so you can unblock their build tasks.
              </p>
            </div>

            <div className="space-y-4">
              {questions.map((q) => (
                <div key={q.id} className="p-5 rounded-2xl border border-stone-200 bg-stone-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                        {q.studentName.charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs font-bold">{q.studentName}</p>
                        <p className="text-[11px] text-stone-400">{q.lessonTitle}</p>
                      </div>
                    </div>

                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        q.status === "answered"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {q.status === "answered" ? "Answered" : "Needs Reply"}
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-stone-200 text-xs font-medium text-stone-800">
                    <p className="font-semibold text-stone-500 text-[10px] uppercase tracking-wider mb-1">
                      Student Question:
                    </p>
                    "{q.questionText}"
                    {q.attachmentName && (
                      <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                        Attachment: {q.attachmentName}
                      </span>
                    )}
                  </div>

                  {q.tutorReply ? (
                    <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 text-xs">
                      <p className="font-bold text-emerald-900 text-[10px] uppercase tracking-wider mb-1">
                        Your Reply ({q.tutorReply.tutorName}):
                      </p>
                      <p className="text-emerald-800">{q.tutorReply.message}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-2">
                      <textarea
                        rows={2}
                        placeholder="Write mentor guidance for this student..."
                        value={replyTextMap[q.id] || ""}
                        onChange={(e) =>
                          setReplyTextMap({ ...replyTextMap, [q.id]: e.target.value })
                        }
                        className="w-full bg-white border border-stone-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF6026]"
                      />
                      <button
                        onClick={() => handleSendReply(q.id)}
                        disabled={isReplying === q.id}
                        className="px-4 py-2 bg-[#0B0C0F] text-white text-xs font-bold rounded-xl hover:bg-stone-800 transition flex items-center gap-1.5"
                      >
                        <Send className="w-3 h-3" />
                        {isReplying === q.id ? "Sending..." : "Send Reply to Student"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: Schedule & Hardware Inventory */}
        {activeTab === "schedule" && (
          <div className="bg-white rounded-2xl border border-[#E3E0D9] p-6 lg:p-8 shadow-sm space-y-6">
            <div>
              <h2 className="text-lg font-bold">Lab Hardware & Campus Inventory</h2>
              <p className="text-xs text-stone-500 mt-1">
                Kits stay permanently at {batch?.schoolName}. Check stock before Saturday's build session.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-stone-200 bg-stone-50">
                <p className="text-xs font-bold text-stone-500 uppercase">Rover Chassis & Motors</p>
                <p className="text-2xl font-extrabold text-stone-900 mt-1">25 Units</p>
                <p className="text-[11px] text-emerald-600 mt-1">● 100% Tested & Verified</p>
              </div>
              <div className="p-4 rounded-xl border border-stone-200 bg-stone-50">
                <p className="text-xs font-bold text-stone-500 uppercase">Ultrasonic HC-SR04 Sensors</p>
                <p className="text-2xl font-extrabold text-stone-900 mt-1">30 Units</p>
                <p className="text-[11px] text-emerald-600 mt-1">● Calibration Completed</p>
              </div>
              <div className="p-4 rounded-xl border border-stone-200 bg-stone-50">
                <p className="text-xs font-bold text-stone-500 uppercase">9V Battery Packs</p>
                <p className="text-2xl font-extrabold text-stone-900 mt-1">50 Units</p>
                <p className="text-[11px] text-emerald-600 mt-1">● Full Charge Available</p>
              </div>
            </div>

            <div className="p-5 bg-orange-50 border border-orange-200 rounded-xl">
              <h3 className="font-bold text-sm text-[#FF6026] flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Demo Day Schedule Notice
              </h3>
              <p className="text-xs text-stone-700 mt-1 leading-relaxed">
                Demo Day is scheduled for Saturday, 56 days from batch commencement. Parents will attend the final 30 minutes of lab to witness learners' rovers sprint 2 metres and automatically dodge obstacles.
              </p>
            </div>
          </div>
        )}

        {/* TAB 5: Curriculum & Lesson Videos (Shared ThinkOva to School & Real-time Tutor Uploads) */}
        {activeTab === "curriculum-videos" && (
          <div className="bg-white rounded-2xl border border-[#E3E0D9] p-6 lg:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-5">
              <div>
                <h2 className="text-lg font-bold">Shared Course Curriculum & Studio Videos</h2>
                <p className="text-xs text-stone-500 mt-1">
                  Outer-joined curriculum between ThinkOva master courses and campus cohort batches. Uploaded videos instantly stream on the student portal.
                </p>
              </div>

              {/* Course Selector */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-stone-500">Course:</span>
                <select
                  value={curriculumCourseId}
                  onChange={(e) => {
                    setCurriculumCourseId(e.target.value);
                    fetchSharedCurriculum(e.target.value);
                  }}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 shadow-sm outline-none focus:border-[#FF6026]"
                >
                  <option value="robotics-starter">Smart Robots with Sensors (Grades 5-7)</option>
                  <option value="ai-for-young-creators">AI for Young Creators (Grades 5-7)</option>
                  <option value="iot-smart-home">IoT: Build a Smart Home Device (Grades 8-11)</option>
                  <option value="ai-agents-starter">Autonomous Agents & Fact Checkers (Grades 8-11)</option>
                </select>
                <button
                  type="button"
                  onClick={() => fetchSharedCurriculum(curriculumCourseId)}
                  disabled={isLoadingCurriculum}
                  className="p-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 transition"
                  title="Refresh Curriculum"
                >
                  <RefreshCw className={cn("w-4 h-4", isLoadingCurriculum && "animate-spin")} />
                </button>
              </div>
            </div>

            {/* Curriculum Week-by-Week Grid */}
            <div className="space-y-4">
              {sharedWeeklyPlan.length === 0 && !isLoadingCurriculum && (
                <div className="p-8 text-center text-xs text-stone-500 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                  Loading shared curriculum from ThinkOva...
                </div>
              )}

              {sharedWeeklyPlan.map((item) => {
                const isEditing = selectedEditWeek === item.week;
                const hasVideo = Boolean(item.videoUrl);

                return (
                  <div
                    key={item.week}
                    className="p-5 rounded-2xl border border-stone-200 bg-stone-50/50 hover:bg-white transition space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#0B0C0F] text-xs font-bold text-white shadow-sm">
                          W{item.week}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-stone-900">{item.title}</h3>
                            {hasVideo ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                Live Video Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                Awaiting Upload
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-stone-600 mt-0.5">{item.subtitle}</p>
                          {hasVideo && (
                            <p className="text-[11px] text-[#FF6026] font-mono mt-1 flex items-center gap-1 truncate max-w-lg">
                              <ExternalLink className="size-3 shrink-0" />
                              <span className="truncate">{item.videoUrl}</span>
                              {item.recordingDuration && <span className="text-stone-400">({item.recordingDuration})</span>}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setSelectedEditWeek(null);
                            } else {
                              setSelectedEditWeek(item.week);
                              setUploadVideoTitle(`Level ${item.week}: ${item.title}`);
                              setUploadVideoUrl(item.videoUrl || "");
                              setUploadVideoDuration(item.recordingDuration || "18 min");
                            }
                          }}
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-stone-300 bg-white hover:bg-stone-100 transition shadow-sm cursor-pointer"
                        >
                          {isEditing ? "Close" : hasVideo ? "Update Video URL" : "+ Upload Video"}
                        </button>
                      </div>
                    </div>

                    {/* Inline Video Upload Form */}
                    {isEditing && (
                      <div className="mt-4 p-5 rounded-xl bg-white border border-[#FF6026]/30 shadow-inner space-y-4 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-[#FF6026] uppercase tracking-wider">
                            Upload Lab Recording for Week {item.week}
                          </h4>
                          <span className="text-[11px] text-stone-400">Synchronizes live to enrolled student portal</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11px] font-bold text-stone-700 mb-1">
                              Video Recording URL (YouTube, Vimeo, MP4 or Cloud Link) *
                            </label>
                            <input
                              type="url"
                              value={uploadVideoUrl}
                              onChange={(e) => setUploadVideoUrl(e.target.value)}
                              placeholder="https://www.youtube.com/watch?v=... or https://cdn.thinkova.ai/lab-w1.mp4"
                              className="w-full rounded-xl border border-stone-300 p-2.5 text-xs font-mono outline-none focus:border-[#FF6026] focus:ring-1 focus:ring-[#FF6026]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-stone-700 mb-1">
                              Lesson Duration
                            </label>
                            <input
                              type="text"
                              value={uploadVideoDuration}
                              onChange={(e) => setUploadVideoDuration(e.target.value)}
                              placeholder="e.g. 18 min"
                              className="w-full rounded-xl border border-stone-300 p-2.5 text-xs outline-none focus:border-[#FF6026]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-stone-700 mb-1">
                            Tutor Qualitative Lab Notes (optional)
                          </label>
                          <textarea
                            rows={2}
                            value={uploadVideoNotes}
                            onChange={(e) => setUploadVideoNotes(e.target.value)}
                            placeholder="Key takeaways, wiring diagrams to review, or safety checks..."
                            className="w-full rounded-xl border border-stone-300 p-2.5 text-xs outline-none focus:border-[#FF6026]"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => setSelectedEditWeek(null)}
                            className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveVideo(item.week)}
                            disabled={isSavingVideo || !uploadVideoUrl.trim()}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#FF6026] hover:bg-[#E8531C] px-5 py-2 text-xs font-semibold text-white shadow-sm transition active:scale-95 disabled:opacity-50 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>{isSavingVideo ? "Publishing to Students..." : "Save & Publish to Students"}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
