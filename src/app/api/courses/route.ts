import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/../backend/database/client";
import { allCourses, tracksData } from "@/data/tracks";

export const runtime = "nodejs";

/**
 * GET /api/courses
 * Queries courses and tracks tailored to student grade levels and learning tracks.
 * Query Parameters:
 *   - grade: number (e.g. 5, 6, 7, 8, 9, 10, 11) - filters courses suitable for that student grade
 *   - trackId: string (e.g. "robotics", "electronics", "ai", "games", "design")
 *   - courseId: string (e.g. "robotics-starter")
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const gradeParam = searchParams.get("grade");
    const trackId = searchParams.get("trackId")?.trim().toLowerCase();
    const courseId = searchParams.get("courseId")?.trim().toLowerCase();

    // 1. Query by specific course ID
    if (courseId) {
      let course = await dbManager.schools.getCourseById(courseId);
      if (!course) {
        // Fallback to static catalog if DB is empty
        const found = allCourses.find((c) => c.id.toLowerCase() === courseId);
        course = found ? (found as unknown as typeof course) : null;
      }

      if (!course) {
        return NextResponse.json({ error: `Course "${courseId}" not found.` }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        course,
      });
    }

    // 2. Query courses from Database
    let courses = await dbManager.schools.listAllCourses(trackId);
    let tracks = await dbManager.schools.listAllTracks();

    // Fallback to static catalog if DB is yet unseeded
    if (!courses || courses.length === 0) {
      let filtered = allCourses;
      if (trackId) {
        filtered = filtered.filter((c) => c.trackId.toLowerCase() === trackId);
      }
      courses = filtered.map((c) => ({
        ...c,
        kitIncluded: Boolean(c.kitIncluded),
        targetGrades: Array.from(
          { length: c.maxGrade - c.minGrade + 1 },
          (_, i) => c.minGrade + i
        ),
        status: "ACTIVE" as const,
        createdAt: new Date(),
      }));
    }

    if (!tracks || tracks.length === 0) {
      tracks = tracksData.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        filterLabel: t.filterLabel,
        tagline: t.tagline,
        description: t.description,
        priceRange: t.priceRange,
        minPrice: t.minPrice,
        gradeRange: t.gradeRange,
        image: t.image,
        courseIds: t.courses.map((c) => c.id),
        status: "ACTIVE" as const,
        createdAt: new Date(),
      }));
    }

    // 3. Filter by Student Grade if requested
    if (gradeParam) {
      const grade = Number(gradeParam);
      if (isNaN(grade) || grade < 1 || grade > 12) {
        return NextResponse.json(
          { error: "Invalid grade parameter. Expected an integer between 1 and 12." },
          { status: 400 }
        );
      }

      courses = courses.filter((c) => {
        if (Array.isArray(c.targetGrades) && c.targetGrades.includes(grade)) return true;
        return grade >= c.minGrade && grade <= c.maxGrade;
      });
    }

    return NextResponse.json({
      success: true,
      grade: gradeParam ? Number(gradeParam) : undefined,
      trackId: trackId || undefined,
      count: courses.length,
      courses,
      tracks,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
