import type {
  IDatabaseDriver,
  SupportedDialect,
  DatabaseDriverStatus,
  QueryFilter,
  QueryOptions,
} from "../drivers/interface";
import { MemoryDatabaseDriver } from "../drivers/memory-driver";
import { MongoDatabaseDriver } from "../drivers/mongo-driver";
import { UniversalSchemaMapper } from "../schema/mapper";

export type DomainPartition = "schools" | "commerce" | "default";

export interface DatabaseRouterConfig {
  defaultDriver?: string;
  fallbackToMemory?: boolean;
  circuitBreakerThreshold?: number; // consecutive failures before failover
}

/**
 * Routes database domains to MongoDB, memory, or an explicitly registered driver.
 */
export class DatabaseRouter {
  private drivers: Map<string, IDatabaseDriver> = new Map();
  private domainRoutes: Map<DomainPartition, string> = new Map();
  private fallbackDriver: MemoryDatabaseDriver;
  private failureCounts: Map<string, number> = new Map();
  private circuitBreakerTripped: Map<string, boolean> = new Map();
  private config: Required<DatabaseRouterConfig>;

  constructor(config?: DatabaseRouterConfig) {
    this.config = {
      defaultDriver: config?.defaultDriver || "memory",
      fallbackToMemory: config?.fallbackToMemory ?? (process.env.NODE_ENV !== "production"),
      circuitBreakerThreshold: config?.circuitBreakerThreshold ?? 3,
    };

    // Always register high-performance fallback in-memory driver
    this.fallbackDriver = new MemoryDatabaseDriver();
    this.registerDriver("memory", this.fallbackDriver);

    // Initialize auto-detected drivers from environment
    this.initDriversFromEnv();
  }

  /**
   * Automatically resolves driver implementations based on environment connection strings.
   */
  public initDriversFromEnv() {
    const defaultUri = (
      process.env.DATABASE_URL ||
      process.env.MONGODB_URI ||
      process.env.MONGO_URI ||
      ""
    ).trim().replace(/^["']|["']$/g, "").trim();

    const schoolsUri = (
      process.env.SCHOOLS_DATABASE_URL ||
      defaultUri
    ).trim().replace(/^["']|["']$/g, "").trim();

    const commerceUri = (
      process.env.STUDENTS_COMMERCE_DATABASE_URL ||
      process.env.COMMERCE_DATABASE_URL ||
      defaultUri
    ).trim().replace(/^["']|["']$/g, "").trim();

    const isTestEnv = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

    // 1. Resolve and register driver for Schools domain
    if (schoolsUri) {
      const driver = this.createDriverFromUri("schools_db", schoolsUri);
      if (driver) {
        this.registerDriver("schools_db", driver);
        if (!isTestEnv) {
          this.domainRoutes.set("schools", "schools_db");
        }
      }
    }

    // 2. Resolve and register driver for Commerce domain
    if (commerceUri) {
      const driver = this.createDriverFromUri("commerce_db", commerceUri);
      if (driver) {
        this.registerDriver("commerce_db", driver);
        if (!isTestEnv) {
          this.domainRoutes.set("commerce", "commerce_db");
        }
      }
    }

    // 3. Fallback to generic default driver if domain specific URIs are absent
    if (defaultUri && !this.domainRoutes.has("commerce") && !isTestEnv) {
      const driver = this.createDriverFromUri("primary_db", defaultUri);
      if (driver) {
        this.registerDriver("primary_db", driver);
        this.domainRoutes.set("default", "primary_db");
        this.domainRoutes.set("commerce", "primary_db");
        if (!this.domainRoutes.has("schools")) {
          this.domainRoutes.set("schools", "primary_db");
        }
      }
    }
  }

  /**
   * Factory that detects the database protocol and instantiates the proper driver.
   */
  public createDriverFromUri(name: string, rawUri: string): IDatabaseDriver | null {
    if (!rawUri) return null;
    const uri = rawUri.trim().replace(/^["']|["']$/g, "").trim();

    if (uri.startsWith("mongodb://") || uri.startsWith("mongodb+srv://")) {
      return new MongoDatabaseDriver(uri);
    }
    if (uri.startsWith("memory://")) {
      return new MemoryDatabaseDriver();
    }

    throw new Error(`Unsupported database URL for '${name}'. Use a MongoDB URL or memory:// for local development.`);
  }

  /**
   * Registers a new storage driver at runtime (e.g. DynamoDB, CouchDB, Redis, etc.)
   */
  public registerDriver(name: string, driver: IDatabaseDriver) {
    this.drivers.set(name, driver);
    this.failureCounts.set(name, 0);
    this.circuitBreakerTripped.set(name, false);
  }

  /**
   * Sets domain partitioning route (e.g. route 'schools' and 'commerce' to separate MongoDB databases)
   */
  public setDomainRoute(domain: DomainPartition, driverName: string) {
    if (!this.drivers.has(driverName)) {
      throw new Error(`[DatabaseRouter] Cannot route domain '${domain}' to unregistered driver '${driverName}'`);
    }
    this.domainRoutes.set(domain, driverName);
  }

  public getDriver(name: string): IDatabaseDriver | undefined {
    return this.drivers.get(name);
  }

  /**
   * Resolves the active driver for a given domain with circuit-breaker protection.
   */
  private getRouteName(domain: DomainPartition): string {
    let driverName = this.domainRoutes.get(domain) || this.domainRoutes.get("default") || this.config.defaultDriver;

    // If still using default memory driver, check if environment variables are now populated
    if (driverName === "memory" && (process.env.STUDENTS_COMMERCE_DATABASE_URL || process.env.SCHOOLS_DATABASE_URL)) {
      this.initDriversFromEnv();
      driverName = this.domainRoutes.get(domain) || this.domainRoutes.get("default") || this.config.defaultDriver;
    }

    return driverName;
  }

  public getDriverForDomain(domain: DomainPartition = "default"): IDatabaseDriver {
    return this.getActiveDriver(this.getRouteName(domain));
  }

  private getActiveDriver(driverName: string): IDatabaseDriver {
    // Check circuit breaker status
    if (this.circuitBreakerTripped.get(driverName)) {
      if (this.config.fallbackToMemory) {
        return this.fallbackDriver;
      }
    }

    const driver = this.drivers.get(driverName);
    return driver || this.fallbackDriver;
  }

  /**
   * Wraps driver execution with circuit-breaker failover protection.
   */
  private async executeWithFailover<T>(
    domain: DomainPartition,
    operation: (driver: IDatabaseDriver) => Promise<T>
  ): Promise<T> {
    const routeName = this.getRouteName(domain);
    const primaryDriver = this.getActiveDriver(routeName);

    if (domain === "commerce" && process.env.NODE_ENV === "production") {
      if (!(primaryDriver instanceof MongoDatabaseDriver)) throw new Error("Durable commerce database unavailable");
      return operation(primaryDriver);
    }
    try {
      const result = await operation(primaryDriver);
      // Reset failure counter on success
      if (!this.circuitBreakerTripped.get(routeName)) this.failureCounts.set(routeName, 0);
      return result;
    } catch (err: unknown) {
      // Client/Schema constraint violations (e.g. MongoDB E11000 duplicate key) are not driver outages.
      // Re-throw immediately without tripping circuit breaker or falling back to memory.
      const isConstraintError =
        (err as { code?: number })?.code === 11000 ||
        (err as Error)?.message?.includes("E11000 duplicate key") ||
        (err as Error)?.message?.includes("duplicate key error") ||
        (err as Error)?.message?.includes("unique constraint");

      if (isConstraintError) {
        throw err;
      }

      const failures = (this.failureCounts.get(routeName) || 0) + 1;
      this.failureCounts.set(routeName, failures);

      if (this.config.fallbackToMemory && failures >= this.config.circuitBreakerThreshold) {
        this.circuitBreakerTripped.set(routeName, true);
        console.warn(
          `[DatabaseRouter] [CIRCUIT BREAKER TRIPPED] Driver '${primaryDriver.name}' reached ${failures} consecutive failures. Failing over to Memory Driver.`
        );
      }

      if (this.config.fallbackToMemory && primaryDriver !== this.fallbackDriver) {
        console.error(`[DatabaseRouter] ERROR on '${primaryDriver.name}' (${domain}):`, (err as Error)?.message || err);
        if (err instanceof Error && err.stack) {
          console.error(err.stack);
        }
        console.warn(`[DatabaseRouter] Falling back to in-memory store for domain '${domain}'.`);
        return await operation(this.fallbackDriver);
      }

      throw err;
    }
  }

  // ==========================================
  // Universal Routed Operations
  // ==========================================

  private memoryTransaction: Promise<unknown> = Promise.resolve();

  public async commerceTransaction<T>(operation: () => Promise<T>): Promise<T> {
    const driver = this.getDriverForDomain("commerce");
    if (driver instanceof MongoDatabaseDriver) return driver.transaction(operation);
    if (process.env.NODE_ENV === "production") throw new Error("Durable commerce database unavailable");
    const result = this.memoryTransaction.then(operation);
    this.memoryTransaction = result.catch(() => undefined);
    return result;
  }

  public async get<T>(collection: string, id: string, domain: DomainPartition = "default"): Promise<T | null> {
    return this.executeWithFailover(domain, async (driver) => {
      const raw = await driver.get<Record<string, unknown>>(collection, id);
      if (!raw) return null;
      return UniversalSchemaMapper.fromStorage<T>(raw, collection, driver.dialect);
    });
  }

  public async find<T>(
    collection: string,
    filter?: QueryFilter,
    options?: QueryOptions,
    domain: DomainPartition = "default"
  ): Promise<T[]> {
    return this.executeWithFailover(domain, async (driver) => {
      const rawList = await driver.find<Record<string, unknown>>(collection, filter, options);
      return rawList.map((rec) => UniversalSchemaMapper.fromStorage<T>(rec, collection, driver.dialect));
    });
  }

  public async count(
    collection: string,
    filter?: QueryFilter,
    domain: DomainPartition = "default"
  ): Promise<number> {
    return this.executeWithFailover(domain, (driver) => driver.count(collection, filter));
  }

  public async upsert<T extends { id: string }>(
    collection: string,
    record: T,
    domain: DomainPartition = "default"
  ): Promise<void> {
    return this.executeWithFailover(domain, async (driver) => {
      const storageRecord = UniversalSchemaMapper.toStorage(record, collection, driver.dialect);
      await driver.upsert(collection, storageRecord as unknown as T);

      // Mirror to fallback store to keep state sync if failover occurs
      if (driver !== this.fallbackDriver && process.env.NODE_ENV !== "production") {
        await this.fallbackDriver.upsert(collection, record);
      }
    });
  }

  public async update<T>(
    collection: string,
    id: string,
    partial: Partial<T>,
    domain: DomainPartition = "default"
  ): Promise<void> {
    return this.executeWithFailover(domain, async (driver) => {
      await driver.update(collection, id, partial);
      if (driver !== this.fallbackDriver && process.env.NODE_ENV !== "production") {
        await this.fallbackDriver.update(collection, id, partial);
      }
    });
  }

  public async delete(collection: string, id: string, domain: DomainPartition = "default"): Promise<boolean> {
    return this.executeWithFailover(domain, async (driver) => {
      const res = await driver.delete(collection, id);
      if (driver !== this.fallbackDriver && process.env.NODE_ENV !== "production") {
        await this.fallbackDriver.delete(collection, id);
      }
      return res;
    });
  }

  public async clearAll(): Promise<void> {
    for (const driver of this.drivers.values()) {
      await driver.clear();
    }
    await this.fallbackDriver.clear();
    this.failureCounts.clear();
    this.circuitBreakerTripped.clear();
  }

  /**
   * Diagnostic telemetry for /api/db and monitoring systems
   */
  public getRouterTelemetry() {
    const driverStatuses: Record<string, DatabaseDriverStatus> = {};
    for (const [name, driver] of this.drivers.entries()) {
      driverStatuses[name] = driver.getStatus();
    }

    return {
      activeDomainRoutes: {
        schools: this.domainRoutes.get("schools") || "memory",
        commerce: this.domainRoutes.get("commerce") || "memory",
        default: this.domainRoutes.get("default") || this.config.defaultDriver,
      },
      registeredDriversCount: this.drivers.size,
      registeredDrivers: Array.from(this.drivers.keys()),
      fallbackDriverStatus: this.fallbackDriver.getStatus(),
      drivers: driverStatuses,
      circuitBreakerStatus: Object.fromEntries(this.circuitBreakerTripped.entries()),
      timestamp: new Date().toISOString(),
    };
  }

  public getMemoryDriver(): MemoryDatabaseDriver {
    return this.fallbackDriver;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __THINKOVA_DB_ROUTER__: DatabaseRouter | undefined;
}

export const dbRouter = globalThis.__THINKOVA_DB_ROUTER__ ?? new DatabaseRouter();
globalThis.__THINKOVA_DB_ROUTER__ = dbRouter;

