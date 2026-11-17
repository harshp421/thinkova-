import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";
import { allCourses, getCourseById } from "@/data/tracks";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const { studentId } = await params;
    const requestedCourseId = req.nextUrl.searchParams.get("courseId") || undefined;

    // 1. Fetch student from MongoDB Atlas
    const student = await dbManager.commerce.getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    // 2. Query active enrollments for this student
    const enrollments = await dbManager.commerce.getEnrollmentsByStudentId(student.id);
    const activeEnrollments = (enrollments || []).filter(
      (e) => e.status === "ENROLLED" || e.status === "PENDING_PAYMENT"
    );
    const activeEnrollment = requestedCourseId
      ? activeEnrollments.find((e) => e.courseId === requestedCourseId) || activeEnrollments[0]
      : activeEnrollments.find((e) => e.status === "ENROLLED") || activeEnrollments[0];

    // If the student has no active enrollments yet, return a clean unenrolled state
    if (!activeEnrollment || activeEnrollment.status !== "ENROLLED") {
      return NextResponse.json({
        success: true,
        student,
        course: null,
        isEnrolled: false,
        activeLevelNumber: 0,
        progressPercentage: 0,
        nextLiveClass: null,
        levels: [],
        activeBuildTask: null,
        materials: [],
        otherCourses: allCourses.slice(0, 3).map((c) => ({
          id: c.id,
          title: c.title,
          batchDate: c.nextBatch,
          image: c.image,
        })),
      });
    }

    const courseId = activeEnrollment.courseId || "robotics-starter";
    const [dbCourse, tutorVideos, courseProgress, assessments] = await Promise.all([
      dbManager.schools.getCourseById(courseId),
      dbManager.schools.getCourseVideos(courseId),
      dbManager.commerce.getCourseProgressByStudent(student.id, courseId),
      dbManager.commerce.getAssessmentsByStudentId(student.id),
    ]);

    const fallbackCourse = getCourseById(courseId) || allCourses[0];
    const course = dbCourse || fallbackCourse;

    const videoMap = new Map(tutorVideos.map((v) => [v.weekNumber, v.videoUrl]));
    const weeklyPlan = dbCourse?.weeklyPlan || fallbackCourse?.weeklyPlan || [];

    // Derive completed milestones from MongoDB Atlas
    const completedSet = new Set<number>();
    if (courseProgress?.milestones) {
      courseProgress.milestones.forEach((m) => {
        if (m.completed) completedSet.add(m.weekNumber);
      });
    }
    if (assessments) {
      assessments.forEach((a) => {
        if (a.attendance === "PRESENT" && a.tutorScore >= 3) {
          completedSet.add(a.levelNumber);
        }
      });
    }

    const currentActiveLevel = courseProgress?.currentWeek || (completedSet.size + 1);

    // Build levels dynamically from real weeklyPlan
    const levels = weeklyPlan.map((wp) => {
      const planItem = wp as unknown as { week: number; title: string; subtitle?: string; videoUrl?: string; recordingDuration?: string };
      const isCompleted = completedSet.has(planItem.week);
      const isActive = planItem.week === currentActiveLevel && !isCompleted;
      const isLocked = planItem.week > currentActiveLevel;

      const weekVideo = videoMap.get(planItem.week) || (planItem.videoUrl ? planItem.videoUrl : undefined);

      return {
        levelNumber: planItem.week,
        title: `Level ${planItem.week} · ${planItem.title}`,
        weekTitle: isCompleted
          ? `Week ${planItem.week} · completed`
          : isActive
          ? `Week ${planItem.week} · in progress`
          : `Week ${planItem.week} · opens after level ${planItem.week - 1}`,
        status: isCompleted ? "completed" : isActive ? "in_progress" : "locked",
        score: isCompleted ? 95 : undefined,
        actionLabel: isCompleted ? "Review" : isActive ? "In progress" : undefined,
        lessons: [
          {
            id: `lesson-${planItem.week}-1`,
            lessonNumber: 1,
            title: planItem.title,
            type: "Video",
            duration: planItem.recordingDuration || "18 min",
            status: isCompleted ? "done" : isActive ? "resume" : "up_next",
            videoUrl: weekVideo,
          },
          {
            id: `lesson-${planItem.week}-2`,
            lessonNumber: 2,
            title: `${planItem.title} · Build Quest`,
            type: "Build task",
            duration: "20 min",
            status: isCompleted ? "done" : "up_next",
          },
        ],
      };
    });

    // Derive active build task
    const activeBuildTask = {
      title: `Level ${currentActiveLevel} Build Quest`,
      dueDate: "Due before Saturday's lab",
      statusText: "Ready for workspace",
      checks: [
        { id: "c1", label: "Core logic implemented in project editor", passed: false },
        { id: "c2", label: "Tested with sample input parameters", passed: false },
      ],
    };

    // Materials
    const materials = [
      { id: "m1", title: `Level ${currentActiveLevel} Lab Guide`, type: "PDF · In-school lab", filename: `Level-${currentActiveLevel}-Guide.pdf` },
      { id: "m2", title: "Safety and Ethics Checklist", type: "PDF · 1 page", filename: "Safety-Checklist.pdf" },
    ];

    // Live Class Schedule from Batch in Atlas
    let nextLiveClass = null;
    if (activeEnrollment.cohortBatchId) {
      const batch = await dbManager.schools.getBatch(activeEnrollment.cohortBatchId);
      if (batch) {
        const tutor = batch.tutorId ? await dbManager.schools.getTutor(batch.tutorId) : null;
        nextLiveClass = {
          time: `${batch.dayOfWeek || "Saturday"}, ${batch.startTime || "10:00"}`,
          tutor: tutor?.fullName || "Assigned Lab Mentor",
          topic: `Level ${currentActiveLevel} · In-School Studio Lab`,
        };
      }
    }

    const progressPercentage = levels.length > 0
      ? Math.round((completedSet.size / levels.length) * 100)
      : 0;

    return NextResponse.json({
      success: true,
      student,
      course,
      isEnrolled: true,
      activeLevelNumber: currentActiveLevel,
      progressPercentage,
      nextLiveClass,
      levels,
      activeBuildTask,
      materials,
      otherCourses: allCourses
        .filter((c) => c.id !== course.id)
        .slice(0, 2)
        .map((c) => ({
          id: c.id,
          title: c.title,
          batchDate: c.nextBatch,
          image: c.image,
        })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
