"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Check,
  RotateCcw,
  Pause,
  Play,
  Maximize2,
  CheckCircle2,
  MessageSquare,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LessonSubTab, NoteItem, BuildCheckItem, TutorQnAItem } from "./types";
import { tutorAudio } from "@/lib/tutor-audio";

export interface LessonPlayerSectionProps {
  onNavigateRoadmap: () => void;
  onNavigateQuiz: () => void;
  onNavigateBuildTask: (taskId?: string) => void;
  onOpenAskModal: () => void;
  tutorQnAList: TutorQnAItem[];
  isLessonCompleted: boolean;
  setIsLessonCompleted: React.Dispatch<React.SetStateAction<boolean>>;
  studentId?: string;
}

const TOTAL_LESSON_DURATION = 1125; // 18 min 45 sec

const CHAPTERS = [
  { id: 0, title: "Why order matters", startSec: 0, endSec: 250, startDisplay: "00:00" },
  { id: 1, title: "Connecting two steps", startSec: 250, endSec: 690, startDisplay: "04:10" },
  { id: 2, title: "Test it with a real question", startSec: 690, endSec: 1125, startDisplay: "11:30" },
];

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function LessonPlayerSection({
  onNavigateRoadmap,
  onNavigateQuiz,
  onNavigateBuildTask,
  onOpenAskModal,
  tutorQnAList,
  isLessonCompleted,
  setIsLessonCompleted,
  studentId = "aarav",
}: LessonPlayerSectionProps) {
  const [lessonSubTab, setLessonSubTab] = useState<LessonSubTab>("overview");
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(272); // Starts at 04:32 (matches Figma & notes active pill)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [countdown, setCountdown] = useState(8);
  const [isPausedCountdown, setIsPausedCountdown] = useState(false);

  // Notes state matching Image 3
  const [noteInputText, setNoteInputText] = useState("");
  const [savedNotes, setSavedNotes] = useState<NoteItem[]>([
    { id: "n1", timeSec: 108, timeDisplay: "01:48", text: "Steps run from top to bottom, one at a time." },
    { id: "n2", timeSec: 185, timeDisplay: "03:05", text: "If a step gets no answer, the agent should ask again, not guess." },
  ]);

  // Build task preview state matching Image 2
  const [buildChecks, setBuildChecks] = useState<BuildCheckItem[]>([
    { id: "c1", label: "The three steps run in order", passed: true },
    { id: "c2", label: "Two questions answered", passed: false },
    { id: "c3", label: "Safety step checks every reply", passed: false },
  ]);

  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [lastNarratedChapter, setLastNarratedChapter] = useState<number | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const CHAPTER_NARRATIONS: Record<number, string> = {
    0: "Welcome to Lesson 3: Connect the steps. In this module, we will explore why sequence and order matter when chaining AI and robotics actions.",
    1: "Now let's connect two steps together. When sensor data arrives, the controller checks obstacle proximity before moving forward.",
    2: "Great job! Now let's test our system with a real question. Watch how the safety fallback handles unexpected edge cases.",
  };

  // Dynamic video timeline advancement (Lesson moving animation)
  useEffect(() => {
    if (!isPlaying || isLessonCompleted) return;
    const interval = setInterval(() => {
      setCurrentTimeSeconds((prev) => {
        const next = prev + playbackSpeed;
        if (next >= TOTAL_LESSON_DURATION) {
          setIsLessonCompleted(true);
          setIsPlaying(false);
          return TOTAL_LESSON_DURATION;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, isLessonCompleted, playbackSpeed, setIsLessonCompleted]);

  // Audio synchronization effect
  useEffect(() => {
    if (isPlaying && !isLessonCompleted) {
      tutorAudio.startAmbient();
      const chap = CHAPTERS.find(
        (c) => currentTimeSeconds >= c.startSec && currentTimeSeconds < c.endSec
      ) || CHAPTERS[0]!;
      if (lastNarratedChapter !== chap.id) {
        setLastNarratedChapter(chap.id);
        tutorAudio.speak(CHAPTER_NARRATIONS[chap.id] || chap.title);
      }
    } else {
      tutorAudio.stopAmbient();
      tutorAudio.stopSpeech();
    }
  }, [isPlaying, isLessonCompleted, currentTimeSeconds, lastNarratedChapter]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      tutorAudio.stopAmbient();
      tutorAudio.stopSpeech();
    };
  }, []);

  // Auto countdown to quiz upon completion (Image 5)
  useEffect(() => {
    if (!isLessonCompleted || isPausedCountdown) return;
    if (countdown <= 0) {
      onNavigateQuiz();
      return;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isLessonCompleted, isPausedCountdown, countdown, onNavigateQuiz]);

  const handleWatchAgain = () => {
    setCurrentTimeSeconds(0);
    setIsLessonCompleted(false);
    setIsPlaying(true);
    setCountdown(8);
    setIsPausedCountdown(false);
  };

  const handleSkipToEnd = () => {
    setCurrentTimeSeconds(TOTAL_LESSON_DURATION);
    setIsLessonCompleted(true);
    setIsPlaying(false);
    setCountdown(8);
  };

  const handleSaveNote = () => {
    if (!noteInputText.trim()) return;
    const newNote: NoteItem = {
      id: `note-${Date.now()}`,
      timeSec: currentTimeSeconds,
      timeDisplay: formatTime(currentTimeSeconds),
      text: noteInputText.trim(),
    };
    setSavedNotes((prev) => [newNote, ...prev]);
    setNoteInputText("");
  };

  const handleToggleCheck = async (index: number) => {
    const updated = [...buildChecks];
    const item = updated[index];
    if (!item) return;

    item.passed = !item.passed;
    setBuildChecks(updated);

    try {
      await fetch("/api/learning/build-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          checkId: item.id,
        }),
      });
    } catch {
      // Safe fallback
    }
  };

  const currentChapter =
    CHAPTERS.find(
      (c) => currentTimeSeconds >= c.startSec && currentTimeSeconds < c.endSec
    ) || CHAPTERS[CHAPTERS.length - 1]!;

  // Canvas visual rendering animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const render = () => {
      t += 0.05;
      const w = canvas.width;
      const h = canvas.height;

      // Dark futuristic lab backdrop
      ctx.fillStyle = "#0B0C0F";
      ctx.fillRect(0, 0, w, h);

      // Subtle cybernetic grid lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;
      const gridSize = 32;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Title & Telemetry Header
      ctx.fillStyle = "#FF6B2C";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillText("THINKOVA LABS · AUTONOMOUS ROVER PIPELINE", 24, 32);

      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "11px monospace";
      ctx.fillText(`FPS: 60 | CH: ${currentChapter.title.toUpperCase()} | TIME: ${formatTime(currentTimeSeconds)}`, 24, 48);

      // Step nodes architecture
      const nodes = [
        { label: "1. Ultrasonic Lidar", sub: "Sensor Feed" },
        { label: "2. Chained AI Step", sub: "Logic Decision" },
        { label: "3. Dual Motors", sub: "Safety Action" },
      ];

      const startX = 60;
      const nodeW = (w - 120 - 60) / 3;
      const nodeH = 68;
      const nodeY = h / 2 - 40;

      // Draw connection lines
      ctx.strokeStyle = isPlaying ? "#FF6B2C" : "rgba(255, 107, 44, 0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX + nodeW, nodeY + nodeH / 2);
      ctx.lineTo(startX + nodeW + 30, nodeY + nodeH / 2);
      ctx.moveTo(startX + 2 * nodeW + 30, nodeY + nodeH / 2);
      ctx.lineTo(startX + 2 * nodeW + 60, nodeY + nodeH / 2);
      ctx.stroke();

      // Moving data packets
      if (isPlaying) {
        const p1 = (t * 40) % (nodeW + 30);
        ctx.fillStyle = "#FF8B4E";
        ctx.beginPath();
        ctx.arc(startX + nodeW + (p1 % 30), nodeY + nodeH / 2, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(startX + 2 * nodeW + 30 + (p1 % 30), nodeY + nodeH / 2, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw nodes
      nodes.forEach((node, i) => {
        const nx = startX + i * (nodeW + 30);
        const isActive = currentChapter.id === i;

        // Node card background
        ctx.fillStyle = isActive ? "rgba(255, 107, 44, 0.15)" : "rgba(255, 255, 255, 0.05)";
        ctx.strokeStyle = isActive ? "#FF6B2C" : "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = isActive ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(nx, nodeY, nodeW, nodeH, 12);
        ctx.fill();
        ctx.stroke();

        // Node text
        ctx.fillStyle = isActive ? "#FFFFFF" : "rgba(255, 255, 255, 0.7)";
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.fillText(node.label, nx + 14, nodeY + 28);

        ctx.fillStyle = isActive ? "#FF8B4E" : "rgba(255, 255, 255, 0.4)";
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillText(node.sub, nx + 14, nodeY + 48);

        if (isActive && isPlaying) {
          // Pulsing glow ring
          ctx.strokeStyle = `rgba(255, 107, 44, ${0.4 + 0.3 * Math.sin(t * 3)})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(nx - 2, nodeY - 2, nodeW + 4, nodeH + 4);
        }
      });

      // Bottom dynamic audio waveform visualizer
      const bars = 24;
      const barW = (w - 48) / bars;
      for (let b = 0; b < bars; b++) {
        const barH = isPlaying && !isMuted ? (Math.sin(t * 3 + b * 0.4) * 0.5 + 0.5) * 22 + 4 : 4;
        ctx.fillStyle = isPlaying ? `rgba(255, 107, 44, ${0.3 + (barH / 26) * 0.7})` : "rgba(255, 255, 255, 0.1)";
        ctx.fillRect(24 + b * barW, h - 36 - barH, barW - 2, barH);
      }

      // Tutor PIP camera preview in top right
      const pipW = 120;
      const pipH = 50;
      const pipX = w - pipW - 20;
      const pipY = 16;
      ctx.fillStyle = "rgba(20, 22, 29, 0.85)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pipX, pipY, pipW, pipH, 8);
      ctx.fill();
      ctx.stroke();

      // Pulsing green audio status dot
      ctx.fillStyle = isPlaying && !isMuted ? "#1F9D55" : "rgba(255, 255, 255, 0.3)";
      ctx.beginPath();
      ctx.arc(pipX + 12, pipY + 16, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillText("Ms. Ananya", pipX + 22, pipY + 19);

      ctx.fillStyle = isPlaying ? "#FF8B4E" : "rgba(255, 255, 255, 0.4)";
      ctx.font = "9px system-ui, sans-serif";
      ctx.fillText(isPlaying ? (isMuted ? "Audio Muted" : "Speaking...") : "Paused", pipX + 12, pipY + 38);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, isMuted, currentChapter, currentTimeSeconds]);

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs text-[#5A5F6B]">
        <button
          type="button"
          onClick={onNavigateRoadmap}
          className="hover:text-[#0B0C0F] transition cursor-pointer"
        >
          My learning
        </button>
        <span className="text-[#A7ACB8]">/</span>
        <span>AI for Young Creators</span>
        <span className="text-[#A7ACB8]">/</span>
        <span className="font-semibold text-[#0B0C0F]">Level 6</span>
      </div>

      {/* Lesson Title & Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-semibold text-[#0B0C0F]">
            Connect the steps
          </h1>
          <p className="text-xs sm:text-sm text-[#5A5F6B]">
            Lesson 3 of 5 · 18 min · Ms Ananya Rao
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNavigateRoadmap}
            className="rounded-xl border border-[#E3E0D9] bg-white px-4 py-2 text-xs font-semibold text-[#5A5F6B] hover:text-[#0B0C0F] transition cursor-pointer"
          >
            ‹ Roadmap
          </button>
          <button
            type="button"
            onClick={onNavigateQuiz}
            className="rounded-xl bg-[#0B0C0F] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#202228] transition cursor-pointer"
          >
            Next lesson ›
          </button>
        </div>
      </div>

      {/* Main Lesson Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Cols: Video Player & Subtabs */}
        <div className="lg:col-span-8 space-y-5">
          {/* Video Player Card */}
          <div
            ref={playerContainerRef}
            className="relative overflow-hidden rounded-[24px] bg-[#0B0C0F] shadow-lg aspect-video flex flex-col justify-between p-6 select-none"
          >
            {isLessonCompleted ? (
              /* Lesson Complete Overlay matching Image 5 */
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-black/85 backdrop-blur-md">
                {/* Background Graphic */}
                <div className="absolute inset-0 -z-10 opacity-25">
                  <Image
                    src="/images/auth-lab.jpg"
                    alt="Lab Completed"
                    fill
                    className="object-cover"
                  />
                </div>

                {/* Green Check Circle Badge */}
                <div className="size-16 sm:size-20 rounded-full bg-[#1F9D55] text-white flex items-center justify-center shadow-lg mb-4">
                  <Check className="size-8 sm:size-10 stroke-[3]" />
                </div>

                {/* Heading */}
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  Lesson complete
                </h2>

                {/* Subtitle */}
                <p className="mt-1.5 text-xs sm:text-sm text-white/80">
                  Up next: Test two tasks · Quiz · 14 min
                </p>

                {/* Action Buttons */}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={onNavigateQuiz}
                    className="rounded-full bg-[#FF6026] hover:bg-[#E8531C] px-7 py-3 text-xs sm:text-sm font-semibold text-white shadow-lg transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Start quiz</span>
                    <span className="leading-none">→</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleWatchAgain}
                    className="rounded-full border border-white/30 bg-white/10 hover:bg-white/20 px-6 py-3 text-xs sm:text-sm font-semibold text-white transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>Watch again</span>
                  </button>
                </div>

                {/* Countdown text */}
                <div className="mt-4 flex items-center gap-2 text-xs text-white/60">
                  <span>Starts in {countdown} seconds</span>
                  <button
                    type="button"
                    onClick={() => setIsPausedCountdown((prev) => !prev)}
                    className="underline hover:text-white transition cursor-pointer"
                  >
                    {isPausedCountdown ? "Resume" : "Pause"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Active Dynamic Lesson Video & Visuals Canvas */}
                <canvas
                  ref={canvasRef}
                  width={960}
                  height={540}
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="absolute inset-0 w-full h-full object-cover cursor-pointer"
                  title="Click video to Play/Pause"
                />

                {/* Top Overlay Badge showing current dynamic chapter */}
                <div className="relative z-10 inline-flex self-start rounded-full bg-black/70 border border-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                  {currentChapter.title}
                </div>

                {/* Bottom Controls Bar */}
                <div className="relative z-10 space-y-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 -mx-6 -mb-6 rounded-b-[24px]">
                  {/* Interactive Scrubbable Timeline Bar */}
                  <div
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickPos = (e.clientX - rect.left) / rect.width;
                      const newSec = Math.round(
                        Math.max(0, Math.min(1, clickPos)) * TOTAL_LESSON_DURATION
                      );
                      setCurrentTimeSeconds(newSec);
                      if (newSec >= TOTAL_LESSON_DURATION) {
                        setIsLessonCompleted(true);
                        setIsPlaying(false);
                      }
                    }}
                    className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden cursor-pointer relative hover:h-2 transition-all"
                    title="Click to seek"
                  >
                    <div
                      className="h-full bg-[#FF6B2C] rounded-full transition-all duration-300"
                      style={{
                        width: `${(currentTimeSeconds / TOTAL_LESSON_DURATION) * 100}%`,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-white pt-1">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <button
                        type="button"
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="p-1 hover:text-[#FF6B2C] transition cursor-pointer"
                        title={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentTimeSeconds((prev) => Math.max(0, prev - 10))}
                        className="p-1 text-[11px] font-mono hover:text-[#FF6B2C] transition cursor-pointer"
                        title="Rewind 10s"
                      >
                        ↺ 10
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentTimeSeconds((prev) =>
                            Math.min(TOTAL_LESSON_DURATION, prev + 10)
                          )
                        }
                        className="p-1 text-[11px] font-mono hover:text-[#FF6B2C] transition cursor-pointer"
                        title="Forward 10s"
                      >
                        ↻ 10
                      </button>
                      <span className="text-[11px] font-mono text-white/80">
                        {formatTime(currentTimeSeconds)} / 18:45
                      </span>

                      {/* Volume & Audio Controls */}
                      <div className="flex items-center gap-1.5 ml-1">
                        <button
                          type="button"
                          onClick={() => {
                            const muted = tutorAudio.toggleMute();
                            setIsMuted(muted);
                          }}
                          className="p-1 hover:text-[#FF6B2C] transition cursor-pointer"
                          title={isMuted ? "Unmute" : "Mute audio"}
                        >
                          {isMuted ? (
                            <VolumeX className="size-4 text-red-400" />
                          ) : (
                            <Volume2 className="size-4 text-white" />
                          )}
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={isMuted ? 0 : volume}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setVolume(v);
                            tutorAudio.setVolume(v);
                            if (isMuted && v > 0) {
                              setIsMuted(false);
                              tutorAudio.toggleMute();
                            }
                          }}
                          className="w-14 h-1 accent-[#FF6B2C] bg-white/20 rounded-full cursor-pointer hidden sm:block"
                          title="Tutor volume"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-semibold text-white/80">
                      {/* Speed toggle */}
                      <button
                        type="button"
                        onClick={() => {
                          setPlaybackSpeed((prev) =>
                            prev === 1 ? 2 : prev === 2 ? 5 : 1
                          );
                        }}
                        className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 hover:text-white cursor-pointer"
                        title="Playback speed"
                      >
                        {playbackSpeed}x
                      </button>

                      {/* Quick Skip to Complete button */}
                      <button
                        type="button"
                        onClick={handleSkipToEnd}
                        className="text-[10px] uppercase font-bold text-[#FF6B2C] hover:underline cursor-pointer"
                        title="Skip to lesson complete"
                      >
                        Finish lesson →
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!playerContainerRef.current) return;
                          if (document.fullscreenElement) {
                            document.exitFullscreen();
                          } else {
                            playerContainerRef.current.requestFullscreen();
                          }
                        }}
                        className="p-1 hover:text-white transition cursor-pointer"
                        title="Toggle Fullscreen"
                      >
                        <Maximize2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sub-tabs below Video */}
          <div className="flex items-center gap-6 border-b border-[#E3E0D9]">
            <button
              type="button"
              onClick={() => setLessonSubTab("overview")}
              className={cn(
                "pb-2.5 text-xs sm:text-sm font-semibold transition cursor-pointer relative",
                lessonSubTab === "overview"
                  ? "text-[#0B0C0F] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#0B0C0F]"
                  : "text-[#5A5F6B] hover:text-[#0B0C0F]"
              )}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setLessonSubTab("notes")}
              className={cn(
                "pb-2.5 text-xs sm:text-sm font-semibold transition cursor-pointer relative",
                lessonSubTab === "notes"
                  ? "text-[#0B0C0F] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#0B0C0F]"
                  : "text-[#5A5F6B] hover:text-[#0B0C0F]"
              )}
            >
              Notes
            </button>
            <button
              type="button"
              onClick={() => setLessonSubTab("materials")}
              className={cn(
                "pb-2.5 text-xs sm:text-sm font-semibold transition cursor-pointer relative",
                lessonSubTab === "materials"
                  ? "text-[#0B0C0F] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#0B0C0F]"
                  : "text-[#5A5F6B] hover:text-[#0B0C0F]"
              )}
            >
              Materials
            </button>
            <button
              type="button"
              onClick={() => setLessonSubTab("build-task")}
              className={cn(
                "pb-2.5 text-xs sm:text-sm font-semibold transition cursor-pointer relative",
                lessonSubTab === "build-task"
                  ? "text-[#0B0C0F] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#0B0C0F]"
                  : "text-[#5A5F6B] hover:text-[#0B0C0F]"
              )}
            >
              Build task
            </button>
          </div>

          {/* Subtab 1: Overview Tab Content with Dynamic Chapters */}
          {lessonSubTab === "overview" && (
            <div className="space-y-4">
              <p className="text-xs sm:text-sm text-[#5A5F6B] leading-relaxed">
                Your agent can now read a question. In this lesson you join two steps so the
                answer from the first step feeds the second. Then you test it with a real
                question from your class.
              </p>

              {/* Video Chapters List dynamically updating with video playback */}
              <div className="rounded-2xl border border-[#E3E0D9] bg-white divide-y divide-[#E3E0D9] overflow-hidden">
                {CHAPTERS.map((ch) => {
                  const isWatched = currentTimeSeconds >= ch.endSec;
                  const isCurrentPlaying =
                    currentTimeSeconds >= ch.startSec && currentTimeSeconds < ch.endSec;
                  const isUpcoming = currentTimeSeconds < ch.startSec;

                  return (
                    <div
                      key={ch.id}
                      onClick={() => {
                        setCurrentTimeSeconds(ch.startSec);
                        setIsPlaying(true);
                      }}
                      className={cn(
                        "flex items-center justify-between p-3.5 text-xs transition cursor-pointer",
                        isCurrentPlaying ? "bg-[#FFF8F5]" : "hover:bg-[#FAF9F5]"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[#5A5F6B]">{ch.startDisplay}</span>
                        <span
                          className={cn(
                            "font-semibold",
                            isCurrentPlaying ? "text-[#0B0C0F]" : "text-[#15171C]"
                          )}
                        >
                          {ch.title}
                        </span>
                      </div>
                      {isWatched && (
                        <span className="font-medium text-[#1F9D55]">✓ Watched</span>
                      )}
                      {isCurrentPlaying && (
                        <span className="font-bold text-[#FF6B2C]">▶ Playing</span>
                      )}
                      {isUpcoming && <span className="text-[#A7ACB8]">Upcoming</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Subtab 2: Notes Tab Content matching Image 3 */}
          {lessonSubTab === "notes" && (
            <div className="space-y-4">
              {/* Active timestamp note box with orange border */}
              <div className="rounded-[20px] border-2 border-[#FF6B2C] bg-white p-5 space-y-3 shadow-xs">
                <div className="flex items-center">
                  <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-[#FDF0EB] text-[#B24514]">
                    {formatTime(currentTimeSeconds)}
                  </span>
                </div>

                <textarea
                  rows={2}
                  value={noteInputText}
                  onChange={(e) => setNoteInputText(e.target.value)}
                  placeholder="Write a note for this moment..."
                  className="w-full bg-transparent text-xs sm:text-sm text-[#0B0C0F] placeholder-[#A7ACB8] resize-none outline-none leading-relaxed"
                />

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleSaveNote}
                    className="rounded-full bg-[#0B0C0F] hover:bg-[#202228] px-5 py-2 text-xs font-semibold text-white transition active:scale-95 cursor-pointer"
                  >
                    Save note
                  </button>
                </div>
              </div>

              {/* Saved Notes Section */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs sm:text-sm font-bold text-[#0B0C0F]">Your notes</h4>
                  <span className="text-xs text-[#5A5F6B]">Only you can see these</span>
                </div>

                <div className="space-y-2.5">
                  {savedNotes.map((note) => (
                    <div
                      key={note.id}
                      onClick={() => {
                        setCurrentTimeSeconds(note.timeSec);
                        setIsPlaying(true);
                      }}
                      className="flex items-center gap-3.5 rounded-full border border-[#E3E0D9] bg-white px-5 py-3 text-xs sm:text-[13px] shadow-xs hover:border-[#FF6026] transition cursor-pointer"
                      title="Click to jump to this moment in the video"
                    >
                      <span className="font-semibold text-[#FF6B2C] shrink-0">
                        {note.timeDisplay}
                      </span>
                      <span className="text-[#15171C]">{note.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Subtab 3: Materials Tab Content matching Image 4 */}
          {lessonSubTab === "materials" && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between pb-1">
                <h4 className="text-xs sm:text-sm font-bold text-[#0B0C0F]">
                  For this lesson
                </h4>
                <span className="text-xs text-[#5A5F6B]">3 files</span>
              </div>

              {/* File Card 1: Steps worksheet */}
              <div className="flex items-center justify-between rounded-[20px] border border-[#E3E0D9] bg-white p-4 sm:p-5 shadow-xs">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-10 items-center justify-center rounded-full bg-[#FDF0EB] text-[#B24514] font-bold text-sm">
                    s
                  </div>
                  <div>
                    <h5 className="text-xs sm:text-sm font-bold text-[#0B0C0F]">
                      Steps worksheet
                    </h5>
                    <p className="text-[11px] sm:text-xs text-[#5A5F6B]">
                      PDF · 2 pages · print or fill on screen
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => alert("Downloading Steps worksheet (PDF)...")}
                  className="rounded-full border border-[#E3E0D9] bg-white px-5 py-1.5 text-xs font-semibold text-[#0B0C0F] hover:bg-[#F4F3EE] hover:border-[#D5D0C5] transition active:scale-95 cursor-pointer"
                >
                  Download
                </button>
              </div>

              {/* File Card 2: Starter agent template */}
              <div className="flex items-center justify-between rounded-[20px] border border-[#E3E0D9] bg-white p-4 sm:p-5 shadow-xs">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-10 items-center justify-center rounded-full bg-[#FDF0EB] text-[#B24514] font-bold text-sm">
                    s
                  </div>
                  <div>
                    <h5 className="text-xs sm:text-sm font-bold text-[#0B0C0F]">
                      Starter agent template
                    </h5>
                    <p className="text-[11px] sm:text-xs text-[#5A5F6B]">
                      Opens in the builder
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateBuildTask("level-6-memory")}
                  className="rounded-full border border-[#E3E0D9] bg-white px-5 py-1.5 text-xs font-semibold text-[#0B0C0F] hover:bg-[#F4F3EE] hover:border-[#D5D0C5] transition active:scale-95 cursor-pointer"
                >
                  Open
                </button>
              </div>

              {/* File Card 3: Safety checklist */}
              <div className="flex items-center justify-between rounded-[20px] border border-[#E3E0D9] bg-white p-4 sm:p-5 shadow-xs">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-10 items-center justify-center rounded-full bg-[#FDF0EB] text-[#B24514] font-bold text-sm">
                    s
                  </div>
                  <div>
                    <h5 className="text-xs sm:text-sm font-bold text-[#0B0C0F]">
                      Safety checklist
                    </h5>
                    <p className="text-[11px] sm:text-xs text-[#5A5F6B]">
                      PDF · 1 page · use before you share
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => alert("Downloading Safety checklist (PDF)...")}
                  className="rounded-full border border-[#E3E0D9] bg-white px-5 py-1.5 text-xs font-semibold text-[#0B0C0F] hover:bg-[#F4F3EE] hover:border-[#D5D0C5] transition active:scale-95 cursor-pointer"
                >
                  Download
                </button>
              </div>
            </div>
          )}

          {/* Subtab 4: Build Task Tab Content matching Image 2 */}
          {lessonSubTab === "build-task" && (
            <div className="rounded-[24px] border border-[#E3E0D9] bg-white p-6 sm:p-7 shadow-xs space-y-4">
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center rounded-full bg-[#FDF0EB] px-3 py-1 text-xs font-semibold text-[#B24514]">
                  Due Friday, 9:00 PM
                </span>
                <span className="inline-flex items-center rounded-full bg-[#EFECE6] px-3 py-1 text-xs font-semibold text-[#5A5F6B]">
                  Part of your level 6 build
                </span>
              </div>

              {/* Heading & Subtitle */}
              <div>
                <h3 className="text-[22px] sm:text-[24px] font-semibold text-[#0B0C0F] tracking-tight">
                  Connect three steps and test them
                </h3>
                <p className="mt-2 text-xs sm:text-[13px] text-[#5A5F6B] leading-relaxed max-w-2xl">
                  Join the read, pick and reply steps in your agent. Ask it two different
                  questions and check the safety step runs on every reply.
                </p>
              </div>

              {/* 3 Checklist Items matching Image 2 */}
              <div className="space-y-3 pt-1">
                {buildChecks.map((check, idx) => (
                  <div
                    key={check.id}
                    onClick={() => handleToggleCheck(idx)}
                    className="flex items-center gap-3 transition cursor-pointer select-none group"
                  >
                    {check.passed ? (
                      <div className="flex size-5 items-center justify-center rounded-full bg-[#E3F5E8] text-[#1F9D55] shrink-0">
                        <Check className="size-3 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="size-5 rounded-full bg-[#EFEDE6] group-hover:bg-[#E3E0D9] shrink-0 transition" />
                    )}
                    <span className="text-xs sm:text-[13px] font-medium text-[#15171C]">
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action Bar */}
              <div className="pt-3 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onNavigateBuildTask("level-6-memory")}
                  className="rounded-full bg-[#FF6026] hover:bg-[#E8531C] px-6 py-3 text-xs sm:text-sm font-semibold text-white shadow-xs transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <span>Open build task</span>
                  <span className="leading-none">→</span>
                </button>

                <span className="text-xs text-[#5A5F6B]">
                  {buildChecks.filter((c) => c.passed).length} of 3 done · draft saved
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right 4 Cols: Lesson Progress List & Tutor Help Card */}
        <div className="lg:col-span-4 space-y-5">
          <div className="rounded-[24px] bg-white p-5 shadow-[0px_8px_24px_0px_rgba(26,20,13,0.07)] border border-[#E3E0D9]">
            <div className="flex items-center justify-between border-b border-[#E3E0D9] pb-3 text-xs">
              <span className="font-bold text-[#0B0C0F]">Level 6 lessons</span>
              <span className="text-[#5A5F6B]">
                {isLessonCompleted ? "3 of 5 done" : "2 of 5 done"}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#FAF9F5]">
                <div className="flex items-center gap-3">
                  <div className="flex size-6 items-center justify-center rounded-full bg-[#E3F5E8] text-[#1F9D55] text-xs font-bold">✓</div>
                  <div className="text-xs">
                    <p className="font-semibold text-[#0B0C0F]">Starter template</p>
                    <p className="text-[11px] text-[#5A5F6B]">12 min</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#1F9D55]">✓ Done</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-[#FAF9F5]">
                <div className="flex items-center gap-3">
                  <div className="flex size-6 items-center justify-center rounded-full bg-[#E3F5E8] text-[#1F9D55] text-xs font-bold">✓</div>
                  <div className="text-xs">
                    <p className="font-semibold text-[#0B0C0F]">Agent instructions</p>
                    <p className="text-[11px] text-[#5A5F6B]">15 min</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#1F9D55]">✓ Done</span>
              </div>

              {/* Lesson 3: Connect the steps (Dynamic state) */}
              {isLessonCompleted ? (
                <div className="flex items-center justify-between p-2 rounded-xl bg-[#FAF9F5]">
                  <div className="flex items-center gap-3">
                    <div className="flex size-6 items-center justify-center rounded-full bg-[#E3F5E8] text-[#1F9D55] text-xs font-bold">✓</div>
                    <div className="text-xs">
                      <p className="font-semibold text-[#0B0C0F]">Connect the steps</p>
                      <p className="text-[11px] text-[#5A5F6B]">18 min</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[#1F9D55]">✓ Done</span>
                </div>
              ) : (
                <div className="flex items-center justify-between p-2 rounded-xl bg-[#FFEDE4] border border-[#FF6B2C]/20">
                  <div className="flex items-center gap-3">
                    <div className="flex size-6 items-center justify-center rounded-full bg-[#FF6B2C] text-white text-xs font-bold">3</div>
                    <div className="text-xs">
                      <p className="font-bold text-[#0B0C0F]">Connect the steps</p>
                      <p className="text-[11px] text-[#B24514]">18 min · Playing</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-[#FF6B2C]">▶ Playing</span>
                </div>
              )}

              {/* Lesson 4: Test two tasks (Quiz) */}
              <div
                onClick={onNavigateQuiz}
                className={cn(
                  "flex items-center justify-between p-2 rounded-xl transition cursor-pointer",
                  isLessonCompleted
                    ? "bg-[#FFEDE4] border border-[#FF6B2C]/30 shadow-xs"
                    : "hover:bg-[#FAF9F5]"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs font-bold",
                      isLessonCompleted
                        ? "bg-[#FF6B2C] text-white"
                        : "bg-[#EFEDE6] text-[#5A5F6B]"
                    )}
                  >
                    4
                  </div>
                  <div className="text-xs">
                    <p className={cn("font-semibold", isLessonCompleted ? "text-[#0B0C0F] font-bold" : "text-[#0B0C0F]")}>
                      Test two tasks (Quiz)
                    </p>
                    <p className="text-[11px] text-[#5A5F6B]">
                      {isLessonCompleted ? "14 min · Ready to take" : "14 min"}
                    </p>
                  </div>
                </div>

                {isLessonCompleted ? (
                  <span className="rounded-full bg-[#FF6026] px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-xs">
                    Start quiz →
                  </span>
                ) : (
                  <span className="text-xs text-[#5A5F6B] hover:text-[#0B0C0F]">Take quiz</span>
                )}
              </div>

              {/* Lesson 5: Improve and protect */}
              <div className="flex items-center justify-between p-2 rounded-xl text-[#A7ACB8]">
                <div className="flex items-center gap-3">
                  <div className="flex size-6 items-center justify-center rounded-full bg-[#EFEDE6] text-xs font-bold">5</div>
                  <div className="text-xs">
                    <p className="font-semibold">Improve and protect</p>
                    <p className="text-[11px]">16 min</p>
                  </div>
                </div>
                <span className="text-xs text-[#A7ACB8]">Up next</span>
              </div>
            </div>
          </div>

          {/* Tutor Help & Real-time Q&A Card (Figma Node 731:2027) */}
          <div className="rounded-[24px] bg-white p-5 shadow-[0px_8px_24px_0px_rgba(26,20,13,0.07)] border border-[#E3E0D9] space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-full bg-[#FFEDE4] text-[#FF6B2C] font-bold text-xs flex items-center justify-center">
                  AR
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-[#0B0C0F]">
                    Ms Ananya Rao
                  </h4>
                  <p className="text-[11px] text-[#5A5F6B]">Lead AI Tutor</p>
                </div>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E3F5E8] text-[#1F9D55]">
                ● Online
              </span>
            </div>

            {/* Live Tutor Conversation Thread */}
            {tutorQnAList[0] && (
              <div className="rounded-xl bg-[#FAF9F5] border border-[#E3E0D9] p-3 text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] text-[#5A5F6B]">
                  <span className="font-semibold text-[#0B0C0F]">Your latest question:</span>
                  <span>{tutorQnAList[0].askedAt}</span>
                </div>
                <p className="text-[#15171C] italic">
                  &quot;{tutorQnAList[0].question}&quot;
                </p>
                {tutorQnAList[0].reply && (
                  <div className="mt-2 pt-2 border-t border-[#E3E0D9]/60">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#1F9D55] mb-1">
                      <CheckCircle2 className="size-3.5" />
                      <span>Ms Ananya replied ({tutorQnAList[0].repliedAt}):</span>
                    </div>
                    <p className="text-[#0B0C0F] bg-white p-2.5 rounded-lg border border-[#E3E0D9] leading-relaxed">
                      {tutorQnAList[0].reply}
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onOpenAskModal}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#E3E0D9] bg-[#FBFBFA] px-4 py-2.5 text-xs font-semibold text-[#0B0C0F] hover:border-[#FF6026] hover:bg-[#FFF8F5] transition cursor-pointer"
            >
              <MessageSquare className="size-3.5 text-[#FF6B2C]" />
              <span>Ask a question</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

