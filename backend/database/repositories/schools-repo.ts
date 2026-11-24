import type {
  SchoolEntity,
  CohortBatchEntity,
  TutorEntity,
  CourseEntity,
  TrackEntity,
  CourseVideoEntity,
} from "../types";
import { PreSchemaValidator } from "../schema/validator";
import { dbRouter, type DatabaseRouter } from "../router/db-router";

export interface ISchoolsRepository {
  findByUid(schoolUid: string): Promise<SchoolEntity | null>;
  searchByNameOrAlias(query: string): Promise<SchoolEntity[]>;
  listAll(limit?: number): Promise<SchoolEntity[]>;
  listActive(limit?: number): Promise<SchoolEntity[]>;
  getBatch(batchId: string): Promise<CohortBatchEntity | null>;
  getTutor(tutorId: string): Promise<TutorEntity | null>;
  listAllTutors(): Promise<TutorEntity[]>;
  upsertSchool(school: SchoolEntity): Promise<void>;
  upsertBatch(batch: CohortBatchEntity): Promise<void>;
  upsertTutor(tutor: TutorEntity): Promise<void>;
  listBatchesByTutorId(tutorId: string): Promise<CohortBatchEntity[]>;
  listAllBatches(): Promise<CohortBatchEntity[]>;

  // Courses & Tracks by Student Grades
  getCourseById(courseId: string): Promise<CourseEntity | null>;
  getCoursesByGrade(grade: number): Promise<CourseEntity[]>;
  listAllCourses(trackId?: string): Promise<CourseEntity[]>;
  upsertCourse(course: Partial<CourseEntity>): Promise<void>;
  listAllTracks(): Promise<TrackEntity[]>;
  getTrackById(trackId: string): Promise<TrackEntity | null>;
  upsertTrack(track: TrackEntity): Promise<void>;

  // Real-time Course Video Management (Tutor uploads & Student sync)
  upsertCourseVideo(video: CourseVideoEntity): Promise<void>;
  getCourseVideos(courseId: string, batchId?: string): Promise<CourseVideoEntity[]>;
  getCourseVideoByWeek(courseId: string, weekNumber: number): Promise<CourseVideoEntity | null>;
}

/**
 * Pre-Schema Routed Schools Repository
 * Validates, normalizes, and routes school domain data to any database engine through the universal router.
 */
export class PreSchemaSchoolsRepository implements ISchoolsRepository {
  private router: DatabaseRouter;

  constructor(router: DatabaseRouter = dbRouter) {
    this.router = router;
  }

  async findByUid(schoolUid: string): Promise<SchoolEntity | null> {
    const normalizedUid = schoolUid.trim().toUpperCase();
    const schools = await this.router.find<SchoolEntity>("schools", { schoolUid: normalizedUid }, undefined, "schools");
    if (schools.length > 0) return schools[0] || null;

    // Case-insensitive fallback scan
    const all = await this.router.find<SchoolEntity>("schools", undefined, undefined, "schools");
    return all.find((s) => s.schoolUid.toUpperCase() === normalizedUid) || null;
  }

  async searchByNameOrAlias(query: string): Promise<SchoolEntity[]> {
    const q = query.trim().toLowerCase();
    const all = await this.router.find<SchoolEntity>("schools", undefined, undefined, "schools");
    return all.filter(
      (s) => s.officialName.toLowerCase().includes(q) || s.city.toLowerCase().includes(q)
    );
  }

  async listAll(limit = 50): Promise<SchoolEntity[]> {
    return await this.router.find<SchoolEntity>("schools", undefined, { limit, sort: { createdAt: "desc" } }, "schools");
  }

  async listActive(limit = 50): Promise<SchoolEntity[]> {
    return await this.router.find<SchoolEntity>("schools", { status: "ACTIVE" }, { limit, sort: { createdAt: "desc" } }, "schools");
  }

  async getBatch(batchId: string): Promise<CohortBatchEntity | null> {
    return await this.router.get<CohortBatchEntity>("batches", batchId, "schools");
  }

  async getTutor(tutorId: string): Promise<TutorEntity | null> {
    return await this.router.get<TutorEntity>("tutors", tutorId, "schools");
  }

  async listAllTutors(): Promise<TutorEntity[]> {
    return await this.router.find<TutorEntity>("tutors", undefined, undefined, "schools");
  }

  async upsertSchool(school: SchoolEntity): Promise<void> {
    // 1. Pre-Schema Validation & Normalization
    const valid = PreSchemaValidator.normalizeSchool(school);
    // 2. Routed Storage
    await this.router.upsert("schools", valid, "schools");
  }

  async upsertBatch(batch: CohortBatchEntity): Promise<void> {
    const valid = PreSchemaValidator.normalizeCohortBatch(batch);
    await this.router.upsert("batches", valid, "schools");
  }

  async upsertTutor(tutor: TutorEntity): Promise<void> {
    const valid = PreSchemaValidator.normalizeTutor(tutor);
    await this.router.upsert("tutors", valid, "schools");
  }

  async listBatchesByTutorId(tutorId: string): Promise<CohortBatchEntity[]> {
    const batches = await this.router.find<CohortBatchEntity>("batches", { tutorId }, undefined, "schools");
    if (batches.length > 0) return batches;
    const all = await this.listAllBatches();
    const matched = all.filter((b) => b.tutorId === tutorId);
    return matched.length > 0 ? matched : all;
  }

  async listAllBatches(): Promise<CohortBatchEntity[]> {
    return await this.router.find<CohortBatchEntity>("batches", undefined, { sort: { createdAt: "desc" } }, "schools");
  }

  async getCourseById(courseId: string): Promise<CourseEntity | null> {
    const normalized = courseId.trim().toLowerCase();
    const course = await this.router.get<CourseEntity>("courses", normalized, "schools");
    if (course) return course;
    const all = await this.listAllCourses();
    return all.find((c) => c.id.toLowerCase() === normalized) || null;
  }

  async getCoursesByGrade(grade: number): Promise<CourseEntity[]> {
    const numGrade = Number(grade);
    const all = await this.listAllCourses();
    return all.filter((c) => {
      if (Array.isArray(c.targetGrades) && c.targetGrades.includes(numGrade)) return true;
      return numGrade >= c.minGrade && numGrade <= c.maxGrade;
    });
  }

  async listAllCourses(trackId?: string): Promise<CourseEntity[]> {
    const filter: Record<string, unknown> = { status: "ACTIVE" };
    if (trackId) {
      filter.trackId = trackId.trim().toLowerCase();
    }
    return await this.router.find<CourseEntity>("courses", filter, { sort: { minGrade: "asc" } }, "schools");
  }

  async upsertCourse(course: CourseEntity): Promise<void> {
    const valid = PreSchemaValidator.normalizeCourse(course);
    await this.router.upsert("courses", valid, "schools");
  }

  async listAllTracks(): Promise<TrackEntity[]> {
    return await this.router.find<TrackEntity>("tracks", { status: "ACTIVE" }, undefined, "schools");
  }

  async getTrackById(trackId: string): Promise<TrackEntity | null> {
    const normalized = trackId.trim().toLowerCase();
    const track = await this.router.get<TrackEntity>("tracks", normalized, "schools");
    if (track) return track;
    const all = await this.listAllTracks();
    return all.find((t) => t.id === normalized || t.slug === normalized) || null;
  }

  async upsertTrack(track: TrackEntity): Promise<void> {
    const valid = PreSchemaValidator.normalizeTrack(track);
    await this.router.upsert("tracks", valid, "schools");
  }

  async upsertCourseVideo(video: CourseVideoEntity): Promise<void> {
    const videoId = video.id || `vid_${video.courseId}_w${video.weekNumber}`;
    const payload = {
      ...video,
      id: videoId,
      updatedAt: new Date(),
      createdAt: video.createdAt ? new Date(video.createdAt) : new Date(),
    };
    await this.router.upsert("course_videos", payload, "schools");

    // Synchronize videoUrl into thinkova_schools.courses weeklyPlan
    const course = await this.getCourseById(video.courseId);
    if (course && course.weeklyPlan) {
      const updatedPlan = course.weeklyPlan.map((wp) =>
        wp.week === video.weekNumber
          ? {
              ...wp,
              videoUrl: video.videoUrl,
              recordingDuration: video.duration || wp.recordingDuration,
              uploadedAt: new Date(),
            }
          : wp
      );
      course.weeklyPlan = updatedPlan;
      await this.upsertCourse(course);
    }
  }

  async getCourseVideos(courseId: string, batchId?: string): Promise<CourseVideoEntity[]> {
    const filter: Record<string, unknown> = { courseId };
    if (batchId) filter.batchId = batchId;
    return await this.router.find<CourseVideoEntity>(
      "course_videos",
      filter,
      { sort: { weekNumber: "asc" } },
      "schools"
    );
  }

  async getCourseVideoByWeek(courseId: string, weekNumber: number): Promise<CourseVideoEntity | null> {
    const videos = await this.router.find<CourseVideoEntity>(
      "course_videos",
      { courseId, weekNumber: Number(weekNumber) },
      { limit: 1 },
      "schools"
    );
    return videos[0] || null;
  }
}
