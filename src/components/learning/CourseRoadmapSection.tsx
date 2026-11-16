"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Lock, Download, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface LevelLesson {
  title: string;
  type: string;
  duration: string;
  action?: "done" | "resume" | "quiz" | "up_next";
}

interface LevelMeta {
  levelNumber: number;
  title: string;
  weekLabel: string;
  description: string;
  taskId: string;
  taskTitle: string;
  lessons: LevelLesson[];
}

const ALL_LEVELS: LevelMeta[] = [
  {
    levelNumber: 1,
    title: "Problem map & safety pledge",
    weekLabel: "Week 1",
    description: "Map out the problem your bot solves and establish child-safe privacy guardrails.",
    taskId: "level-1-problem-map",
    taskTitle: "Problem map and safety pledge",
    lessons: [
      { title: "1. From ideas to real outcomes", type: "Video", duration: "10 min", action: "resume" },
      { title: "2. Exploring AI outputs & tools", type: "Video", duration: "12 min", action: "up_next" },
      { title: "3. The safety pledge & ethics", type: "Video", duration: "15 min", action: "up_next" },
      { title: "4. Problem framing quiz", type: "Quiz", duration: "10 min", action: "quiz" },
      { title: "5. First build plan outline", type: "Build task", duration: "14 min", action: "up_next" },
    ],
  },
  {
    levelNumber: 2,
    title: "Agent persona & prompt tests",
    weekLabel: "Week 2",
    description: "Design bot personality, tone, and systematically test prompt inputs.",
    taskId: "level-2-prompts",
    taskTitle: "Five tested prompts",
    lessons: [
      { title: "1. Crafting agent personas", type: "Video", duration: "12 min" },
      { title: "2. Prompt engineering basics", type: "Video", duration: "14 min" },
      { title: "3. Testing edge case questions", type: "Interactive", duration: "16 min" },
      { title: "4. Persona verification quiz", type: "Quiz", duration: "10 min", action: "quiz" },
    ],
  },
  {
    levelNumber: 3,
    title: "Simple action & story generator",
    weekLabel: "Week 3",
    description: "Build an interactive generative tool with conditional branching logic.",
    taskId: "level-3-story",
    taskTitle: "A story generator",
    lessons: [
      { title: "1. Structuring story arcs", type: "Video", duration: "15 min" },
      { title: "2. Dynamic variable insertion", type: "Video", duration: "12 min" },
      { title: "3. Branching story paths", type: "Interactive", duration: "18 min" },
      { title: "4. Branching test quiz", type: "Quiz", duration: "12 min", action: "quiz" },
    ],
  },
  {
    levelNumber: 4,
    title: "Interactive flow & quiz",
    weekLabel: "Week 4",
    description: "Design interactive multi-turn quiz chains for classmates.",
    taskId: "level-4-quiz",
    taskTitle: "Quiz flow for your class",
    lessons: [
      { title: "1. Multi-turn chat flows", type: "Video", duration: "14 min" },
      { title: "2. Score evaluation rules", type: "Video", duration: "16 min" },
      { title: "3. Real-time answer checks", type: "Interactive", duration: "15 min" },
      { title: "4. Flow quiz", type: "Quiz", duration: "10 min", action: "quiz" },
    ],
  },
  {
    levelNumber: 5,
    title: "Agent blueprint & logic flow",
    weekLabel: "Week 5",
    description: "Architect comprehensive state diagrams and conversation fallback routes.",
    taskId: "level-5-blueprint",
    taskTitle: "Agent blueprint",
    lessons: [
      { title: "1. System architecture basics", type: "Video", duration: "16 min" },
      { title: "2. Error fallbacks & guards", type: "Video", duration: "14 min" },
      { title: "3. Building the visual blueprint", type: "Interactive", duration: "20 min" },
      { title: "4. Blueprint readiness check", type: "Quiz", duration: "10 min", action: "quiz" },
    ],
  },
  {
    levelNumber: 6,
    title: "Chaining & Testing Two Tasks",
    weekLabel: "Week 6",
    description: "Connect inputs, memories, and safety checks into one smooth flow.",
    taskId: "level-6-memory",
    taskTitle: "Give your agent a memory",
    lessons: [
      { title: "1. Why order matters", type: "Video", duration: "14 min", action: "done" },
      { title: "2. Agent instructions", type: "Video", duration: "12 min", action: "done" },
      { title: "3. Connect the steps", type: "Video", duration: "18 min", action: "resume" },
      { title: "4. Test two tasks", type: "Quiz", duration: "14 min", action: "quiz" },
      { title: "5. Improve and protect", type: "Video", duration: "16 min", action: "up_next" },
    ],
  },
  {
    levelNumber: 7,
    title: "Improve and polish",
    weekLabel: "Week 7",
    description: "Harden agent guardrails, conduct peer reviews, and refine user experience.",
    taskId: "level-7-polish",
    taskTitle: "Safety audit & peer test",
    lessons: [
      { title: "1. Real-world edge case testing", type: "Video", duration: "15 min" },
      { title: "2. Peer review rubric", type: "Video", duration: "12 min" },
      { title: "3. Final polishing and bug fixes", type: "Interactive", duration: "20 min" },
    ],
  },
  {
    levelNumber: 8,
    title: "Demo for parents",
    weekLabel: "Week 8",
    description: "Showcase working agent live to parents and tutors to graduate.",
    taskId: "level-8-demo",
    taskTitle: "Demo Day Presentation",
    lessons: [
      { title: "1. Pitching your creation", type: "Video", duration: "15 min" },
      { title: "2. Live demonstration defense", type: "Video", duration: "20 min" },
      { title: "3. Graduation ceremony & badge", type: "Interactive", duration: "30 min" },
    ],
  },
];

interface CourseRoadmapSectionProps {
  isLessonCompleted: boolean;
  completedLevels?: number;
  currentLevel?: number;
  courseTitle?: string;
  onNavigateLesson: () => void;
  onNavigateQuiz: () => void;
  onNavigateBuildTask: (taskId?: string) => void;
}

export function CourseRoadmapSection({
  isLessonCompleted,
  completedLevels = 0,
  currentLevel: propCurrentLevel,
  courseTitle = "AI for Young Creators",
  onNavigateLesson,
  onNavigateQuiz,
  onNavigateBuildTask,
}: CourseRoadmapSectionProps) {
  // Determine dynamic level: for new learners with 0 completed levels, level is 1
  const activeLevelNumber = propCurrentLevel !== undefined ? propCurrentLevel : Math.min(8, completedLevels + 1);
  const activeLevelMeta: LevelMeta = ALL_LEVELS.find((l) => l.levelNumber === activeLevelNumber) || ALL_LEVELS[0]!;
  const progressPercent = Math.round((completedLevels / 8) * 100);

  return (
    <div className="space-y-7 animate-fade-in">
      {/* Course Hero Card (Dynamic level & progress) */}
      <div className="relative overflow-hidden rounded-[24px] bg-[#0B0C0F] p-8 sm:p-10 text-white shadow-md">
        {/* Background radial & pattern glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 top-0 h-96 w-96 rounded-full bg-[#FF6B2C]/15 blur-[100px]"
        />

        <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-7 space-y-4">
            <span className="text-[11px] font-bold uppercase tracking-[0.66px] text-[#FF6B2C]">
              AI &amp; AGENTS · GRADES 5–7
            </span>

            <h2 className="text-[30px] sm:text-[34px] font-medium leading-tight text-white tracking-[-0.68px]">
              {courseTitle}
            </h2>

            {/* Dynamic Progress Bar */}
            <div className="flex items-center gap-3 pt-1">
              <div className="h-1.5 w-52 sm:w-64 rounded-full bg-[#404047] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#FF6B2C] transition-all duration-500"
                  style={{ width: `${Math.max(4, progressPercent)}%` }}
                />
              </div>
              <span className="text-xs sm:text-[13px] font-medium text-white/75">
                Level {activeLevelNumber} of 8 · {progressPercent}%
              </span>
            </div>

            {/* Resume / Start Button & Time Left */}
            <div className="flex items-center gap-4 pt-3">
              <button
                type="button"
                onClick={onNavigateLesson}
                className="inline-flex items-center justify-center rounded-full bg-[#FF6B2C] px-6 py-3.5 text-[14px] sm:text-[15px] font-semibold text-white shadow-[0_4px_16px_rgba(255,107,44,0.35)] transition-all hover:bg-[#E8531C] active:scale-95 cursor-pointer"
              >
                {completedLevels === 0 ? "Start: Level 1 · Problem map" : `Resume: Level ${activeLevelNumber} · ${activeLevelMeta.title}`}
              </button>
              <span className="text-xs sm:text-[13px] font-medium text-white/60">
                {completedLevels === 0 ? "40 min left" : "12 min left"}
              </span>
            </div>
          </div>

          {/* Tablet Graphic */}
          <div className="md:col-span-5 relative h-[180px] sm:h-[220px] flex items-center justify-center select-none">
            <div className="relative h-full w-full">
              <Image
                src="/images/tracks-ai.png"
                alt={courseTitle}
                fill
                className="object-contain object-right"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout (Dynamic Level Path + Right Side Panels) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Level Path */}
        <div className="lg:col-span-7 rounded-[20px] bg-white p-2 sm:p-3 shadow-[0px_8px_24px_0px_rgba(26,20,13,0.07)] border border-[#E3E0D9]">
          {ALL_LEVELS.map((level, idx) => {
            const isCompleted = level.levelNumber <= completedLevels;
            const isActive = level.levelNumber === activeLevelNumber;
            const isLocked = level.levelNumber > activeLevelNumber;

            if (isCompleted) {
              return (
                <React.Fragment key={level.levelNumber}>
                  <div className="flex items-center justify-between px-4 py-3.5 transition hover:bg-[#FAF9F5] rounded-xl">
                    <div className="flex items-center gap-3.5">
                      <div className="flex size-7 items-center justify-center rounded-full bg-[#E3F5E8] text-[#1F9D55] text-xs font-bold">
                        ✓
                      </div>
                      <div>
                        <h4 className="text-[15px] font-semibold text-[#15171C]">
                          Level {level.levelNumber} · {level.title}
                        </h4>
                        <p className="text-xs text-[#5A5F6B]">
                          {level.weekLabel} · build task reviewed
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onNavigateLesson}
                      className="text-xs sm:text-[13px] font-semibold text-[#FF6B2C] hover:underline cursor-pointer"
                    >
                      Review
                    </button>
                  </div>
                  {idx < ALL_LEVELS.length - 1 && <div className="h-px w-full bg-[#E3E0D9]" />}
                </React.Fragment>
              );
            }

            if (isActive) {
              return (
                <React.Fragment key={level.levelNumber}>
                  <div className="mt-1 rounded-2xl bg-[#FFEDE4] p-2.5 transition">
                    <div className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-3.5">
                        <div className="flex size-7 items-center justify-center rounded-full bg-[#FF6B2C] text-xs font-bold text-white shadow-sm">
                          {level.levelNumber}
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-[0.6px] text-[#FF6B2C]">
                            {level.weekLabel.toUpperCase()} · CURRENT LEVEL
                          </span>
                          <h4 className="text-base font-semibold text-[#15171C]">
                            {level.title}
                          </h4>
                        </div>
                      </div>
                      <span className="rounded-full bg-[#FF6B2C] px-3 py-1 text-xs font-semibold text-white shadow-xs">
                        In progress
                      </span>
                    </div>

                    <p className="px-3 text-xs text-[#5A5F6B] leading-relaxed">
                      {level.description}
                    </p>

                    {/* Lessons List */}
                    <div className="mt-4 rounded-xl bg-white p-3 space-y-1 shadow-xs border border-[#E3E0D9]">
                      {level.lessons.map((lesson, lIdx) => (
                        <React.Fragment key={lesson.title}>
                          <div
                            className={cn(
                              "flex items-center justify-between py-2 text-xs",
                              lesson.action === "resume" && "rounded-lg bg-[#FFEDE4]/70 px-2"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <span className={cn("font-medium text-[#15171C]", lesson.action === "resume" && "font-bold")}>
                                {lesson.title}
                              </span>
                              <span className="text-[#5A5F6B]">
                                {lesson.type} · {lesson.duration}
                              </span>
                            </div>

                            {lesson.action === "done" && (
                              <div className="flex items-center gap-1.5 text-[#1F9D55] font-semibold">
                                <Check className="size-3.5 stroke-[2.5]" />
                                <span>Done</span>
                              </div>
                            )}

                            {lesson.action === "resume" && (
                              <button
                                type="button"
                                onClick={onNavigateLesson}
                                className="rounded-full bg-[#FF6B2C] px-3 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-[#E8531C] cursor-pointer"
                              >
                                {isLessonCompleted ? "Rewatch" : "Resume"}
                              </button>
                            )}

                            {lesson.action === "quiz" && (
                              <button
                                type="button"
                                onClick={onNavigateQuiz}
                                className={cn(
                                  "font-semibold cursor-pointer",
                                  isLessonCompleted
                                    ? "rounded-full bg-[#FF6026] text-white px-3 py-1 shadow-xs hover:bg-[#E8531C]"
                                    : "text-[#FF6B2C] hover:underline"
                                )}
                              >
                                {isLessonCompleted ? "Start quiz →" : "Take quiz"}
                              </button>
                            )}

                            {(!lesson.action || lesson.action === "up_next") && (
                              <span className="text-[#A7ACB8]">Up next</span>
                            )}
                          </div>
                          {lIdx < level.lessons.length - 1 && <div className="h-px w-full bg-[#E3E0D9]/50" />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  {idx < ALL_LEVELS.length - 1 && <div className="h-px w-full bg-[#E3E0D9]" />}
                </React.Fragment>
              );
            }

            // Locked Level
            return (
              <React.Fragment key={level.levelNumber}>
                <div className="flex items-center justify-between px-4 py-3.5 text-[#A7ACB8]">
                  <div className="flex items-center gap-3.5">
                    <div className="flex size-7 items-center justify-center rounded-full bg-[#EFEDE6] text-xs font-bold text-[#A7ACB8]">
                      {level.levelNumber}
                    </div>
                    <div>
                      <h4 className="text-[15px] font-semibold text-[#A7ACB8]">
                        Level {level.levelNumber} · {level.title}
                      </h4>
                      <p className="text-xs text-[#5A5F6B]">
                        {level.weekLabel} · opens after level {level.levelNumber - 1}
                      </p>
                    </div>
                  </div>
                  <Lock className="size-4 text-[#A7ACB8]" />
                </div>
                {idx < ALL_LEVELS.length - 1 && <div className="h-px w-full bg-[#E3E0D9]" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Right Column: Build Task Due + Level Test + Materials + Other Course */}
        <div className="lg:col-span-5 space-y-5">
          {/* Card 1: Build Task Due */}
          <div className="rounded-[24px] bg-white p-6 shadow-[0px_8px_24px_0px_rgba(26,20,13,0.07)] border border-[#E3E0D9]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF6B2C]">
              BUILD TASK · DUE FRI 9:00 PM
            </span>
            <h3 className="mt-1.5 text-lg font-bold text-[#0B0C0F]">
              {activeLevelMeta.taskTitle}
            </h3>
            <p className="mt-1 text-xs text-[#5A5F6B]">
              {completedLevels === 0 ? "New assignment ready · open to begin" : "1 of 3 checks done · draft saved"}
            </p>

            <div className="mt-4 flex items-center justify-between pt-2 border-t border-[#E3E0D9]">
              <span className="text-xs text-[#5A5F6B]">
                Part of your level {activeLevelNumber} build
              </span>
              <button
                type="button"
                onClick={() => onNavigateBuildTask(activeLevelMeta.taskId)}
                className="rounded-full bg-[#FF6B2C] hover:bg-[#E8531C] px-4 py-2 text-xs font-semibold text-white shadow-xs transition active:scale-95 cursor-pointer"
              >
                Open build task →
              </button>
            </div>
          </div>

          {/* Card 2: Level Test */}
          <div className="rounded-[24px] bg-white p-6 shadow-[0px_8px_24px_0px_rgba(26,20,13,0.07)] border border-[#E3E0D9]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF6B2C]">
                LEVEL TEST
              </span>
              <span className="text-xs text-[#5A5F6B]">
                Pass to unlock Level {Math.min(8, activeLevelNumber + 1)}
              </span>
            </div>
            <h3 className="mt-1.5 text-lg font-bold text-[#0B0C0F]">
              Level {activeLevelNumber} Checkpoint Quiz
            </h3>
            <p className="mt-1 text-xs text-[#5A5F6B]">
              5 multiple choice questions · 14 minutes · retakes allowed
            </p>

            <div className="mt-4 flex items-center justify-between pt-2 border-t border-[#E3E0D9]">
              <span className="text-xs text-[#5A5F6B]">
                {isLessonCompleted ? "Ready to test" : "Opens after Lesson 3"}
              </span>
              <button
                type="button"
                onClick={onNavigateQuiz}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-semibold shadow-xs transition cursor-pointer",
                  isLessonCompleted
                    ? "bg-[#0B0C0F] text-white hover:bg-[#202228] active:scale-95"
                    : "bg-[#EFECE6] text-[#A7ACB8] cursor-not-allowed"
                )}
              >
                Start quiz →
              </button>
            </div>
          </div>

          {/* Card 3: Materials & Downloads */}
          <div className="rounded-[24px] bg-white p-6 shadow-[0px_8px_24px_0px_rgba(26,20,13,0.07)] border border-[#E3E0D9] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B0C0F]">Course materials</h3>
              <a
                href="/downloads/ThinkOva-Eight-Week-Curriculum.pdf"
                download
                className="text-xs font-semibold text-[#FF6B2C] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Download className="size-3" />
                <span>Download all (PDF)</span>
              </a>
            </div>

            <div className="space-y-2">
              <a
                href="/downloads/ThinkOva-Eight-Week-Curriculum.pdf"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl border border-[#E3E0D9] bg-[#FAF9F5] text-xs hover:border-[#D5D0C5] transition cursor-pointer"
              >
                <span className="font-medium text-[#0B0C0F]">Course curriculum &amp; slides (PDF)</span>
                <span className="text-[11px] text-[#5A5F6B]">2.4 MB</span>
              </a>
              <a
                href="/downloads/ThinkOva-Eight-Week-Curriculum.pdf"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl border border-[#E3E0D9] bg-[#FAF9F5] text-xs hover:border-[#D5D0C5] transition cursor-pointer"
              >
                <span className="font-medium text-[#0B0C0F]">Safety step checklist (PDF)</span>
                <span className="text-[11px] text-[#5A5F6B]">1.1 MB</span>
              </a>
            </div>
          </div>

          {/* Card 4: Hardware / Secondary Track */}
          <div className="rounded-[24px] bg-white p-6 shadow-[0px_8px_24px_0px_rgba(26,20,13,0.07)] border border-[#E3E0D9] flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative size-14 rounded-2xl bg-[#F4F3EE] overflow-hidden shrink-0 flex items-center justify-center">
                <Image
                  src="/images/tracks-robotics.png"
                  alt="Robotics Starter"
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <span className="rounded-full bg-[#FAF9F5] border border-[#E3E0D9] px-2 py-0.5 text-[10px] font-bold text-[#5A5F6B] uppercase tracking-wider">
                  Robotics
                </span>
                <h4 className="text-sm font-bold text-[#0B0C0F] mt-1">
                  Robotics Starter: Build a Rover
                </h4>
                <p className="text-xs text-[#5A5F6B]">
                  Starts upcoming batch · kit waits at school
                </p>
              </div>
            </div>
            <ChevronRight className="size-5 text-[#5A5F6B]" />
          </div>
        </div>
      </div>
    </div>
  );
}
