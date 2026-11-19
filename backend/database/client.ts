import type {
  AssessmentEntity,
  CohortBatchEntity,
  CourseEntity,
  EnrollmentEntity,
  OrderEntity,
  PaymentEntity,
  RefundEntity,
  SchoolEntity,
  StudentEntity,
  TrackEntity,
  TutorEntity,
  UserEntity,
} from "./types";
import {
  PreSchemaSchoolsRepository,
  type ISchoolsRepository,
} from "./repositories/schools-repo";
import {
  PreSchemaCommerceRepository,
  type ICommerceRepository,
  type OrderWithRelations,
  type InstallmentDueWithRelations,
  type RefundWithRelations,
  type AssessmentWithRelations,
} from "./repositories/commerce-repo";
import { dbRouter, DatabaseRouter } from "./router/db-router";
import { PreSchemaValidator } from "./schema/validator";
import { UniversalSchemaMapper } from "./schema/mapper";

export type {
  ISchoolsRepository,
  ICommerceRepository,
  OrderWithRelations,
  InstallmentDueWithRelations,
  RefundWithRelations,
  AssessmentWithRelations,
};

export { dbRouter, DatabaseRouter, PreSchemaValidator, UniversalSchemaMapper };

/**
 * Backwards-compatible Dynamic In-Memory Store Proxy
 * Delegates to the Router's fallback memory driver.
 */
class MemoryProxyStore {
  private getStore() {
    return dbRouter.getMemoryDriver().getRawStore();
  }

  private getCollectionMap<T>(collection: string): Map<string, T> {
    const raw = this.getStore();
    let map = raw.get(collection);
    if (!map) {
      map = new Map();
      raw.set(collection, map);
    }
    return map as Map<string, T>;
  }

  public get schools(): Map<string, SchoolEntity> {
    return this.getCollectionMap<SchoolEntity>("schools");
  }

  public get batches(): Map<string, CohortBatchEntity> {
    return this.getCollectionMap<CohortBatchEntity>("batches");
  }

  public get tutors(): Map<string, TutorEntity> {
    return this.getCollectionMap<TutorEntity>("tutors");
  }

  public get courses(): Map<string, CourseEntity> {
    return this.getCollectionMap<CourseEntity>("courses");
  }

  public get tracks(): Map<string, TrackEntity> {
    return this.getCollectionMap<TrackEntity>("tracks");
  }

  public get users(): Map<string, UserEntity> {
    return this.getCollectionMap<UserEntity>("users");
  }

  public get students(): Map<string, StudentEntity> {
    return this.getCollectionMap<StudentEntity>("students");
  }

  public get enrollments(): Map<string, EnrollmentEntity> {
    return this.getCollectionMap<EnrollmentEntity>("enrollments");
  }

  public get orders(): Map<string, OrderEntity> {
    return this.getCollectionMap<OrderEntity>("orders");
  }

  public get payments(): Map<string, PaymentEntity> {
    return this.getCollectionMap<PaymentEntity>("payments");
  }

  public get refunds(): Map<string, RefundEntity> {
    return this.getCollectionMap<RefundEntity>("refunds");
  }

  public get assessments(): Map<string, AssessmentEntity> {
    return this.getCollectionMap<AssessmentEntity>("assessments");
  }

  public clearAll() {
    dbRouter.getMemoryDriver().clearSync();
  }
}

/**
 * Dynamic Database Manager (Unified Facade)
 * High-stability routing layer supporting any DB system added now or in the future:
 * PostgreSQL, MongoDB, SQLite, In-Memory, MySQL, DynamoDB, or custom micro-drivers.
 */
export class DynamicDatabaseManager {
  public router: DatabaseRouter = dbRouter;
  public schools: ISchoolsRepository;
  public commerce: ICommerceRepository;
  public memory: MemoryProxyStore = new MemoryProxyStore();

  constructor(router: DatabaseRouter = dbRouter) {
    this.router = router;
    this.schools = new PreSchemaSchoolsRepository(this.router);
    this.commerce = new PreSchemaCommerceRepository(this.router);
  }

  /**
   * Diagnostic and health status metadata exposed via /api/db
   */
  public async getDatabaseStatus() {
    const isSchoolsConfigured = Boolean(process.env.SCHOOLS_DATABASE_URL);
    const isCommerceConfigured = Boolean(process.env.STUDENTS_COMMERCE_DATABASE_URL);

    // Warm-up connections if not connected
    const schoolsDriver = this.router.getDriver("schools_db");
    if (schoolsDriver && !schoolsDriver.getStatus().connected) {
      await schoolsDriver.connect().catch(() => {});
    }
    const commerceDriver = this.router.getDriver("commerce_db");
    if (commerceDriver && !commerceDriver.getStatus().connected) {
      await commerceDriver.connect().catch(() => {});
    }

    const telemetry = this.router.getRouterTelemetry();
    const isSchoolsConnected = telemetry.drivers.schools_db?.connected;
    const isCommerceConnected = telemetry.drivers.commerce_db?.connected;

    let driverLabel = "Dynamic Universal Adapter (Memory)";
    if (isSchoolsConnected && isCommerceConnected) {
      driverLabel = "MONGODB ATLAS (thinkova_schools + thinkova_commerce)";
    } else if (isSchoolsConnected || isCommerceConnected) {
      driverLabel = "MONGODB ATLAS (Partial Managed Connection)";
    }

    let coursesCount = 0;
    let tracksCount = 0;
    let usersCount = 0;
    let studentsCount = 0;
    let ordersCount = 0;
    let paymentsCount = 0;

    try {
      const courses = await this.router.find("courses", undefined, undefined, "schools").catch(() => []);
      coursesCount = courses.length;
      const tracks = await this.router.find("tracks", undefined, undefined, "schools").catch(() => []);
      tracksCount = tracks.length;
      const users = await this.router.find("users", undefined, undefined, "commerce").catch(() => []);
      usersCount = users.length;
      const students = await this.router.find("students", undefined, undefined, "commerce").catch(() => []);
      studentsCount = students.length;
      const orders = await this.router.find("orders", undefined, undefined, "commerce").catch(() => []);
      ordersCount = orders.length;
      const payments = await this.router.find("payments", undefined, undefined, "commerce").catch(() => []);
      paymentsCount = payments.length;
    } catch {
      coursesCount = this.memory.courses.size;
      tracksCount = this.memory.tracks.size;
      usersCount = this.memory.users.size;
      studentsCount = this.memory.students.size;
      ordersCount = this.memory.orders.size;
      paymentsCount = this.memory.payments.size;
    }

    return {
      status: "STABILIZED",
      architecture: "Pre-High Stable Database Router with Pre-Schema Normalization",
      schoolsDbConfigured: isSchoolsConfigured,
      commerceDbConfigured: isCommerceConfigured,
      activeDriver: driverLabel,
      telemetry,
      activeEntities: {
        schools: this.memory.schools.size,
        batches: this.memory.batches.size,
        tutors: this.memory.tutors.size,
        courses: coursesCount,
        tracks: tracksCount,
        users: usersCount,
        students: studentsCount,
        orders: ordersCount,
        payments: paymentsCount,
      },
    };
  }
}

export const dbManager = new DynamicDatabaseManager();
