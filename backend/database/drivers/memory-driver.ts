import type {
  IDatabaseDriver,
  SupportedDialect,
  DatabaseDriverStatus,
  QueryFilter,
  QueryOptions,
} from "./interface";

declare global {
  // eslint-disable-next-line no-var
  var __THINKOVA_GLOBAL_MEMORY_STORE__: Map<string, Map<string, unknown>> | undefined;
}

function matchesFilter(record: unknown, entries: [string, unknown][]): boolean {
  const fields = record as Record<string, unknown>;
  for (const [key, expected] of entries) {
    if (expected === undefined) continue;
    const actual = fields[key];

    if (expected !== null && typeof expected === "object" && !(expected instanceof Date)) {
      const operators = expected as Record<string, unknown>;
      if (operators.$gt !== undefined && !((actual as number) > (operators.$gt as number))) return false;
      if (operators.$gte !== undefined && !((actual as number) >= (operators.$gte as number))) return false;
      if (operators.$lt !== undefined && !((actual as number) < (operators.$lt as number))) return false;
      if (operators.$lte !== undefined && !((actual as number) <= (operators.$lte as number))) return false;
      if (operators.$ne !== undefined && actual === operators.$ne) return false;
      if (Array.isArray(operators.$in) && !operators.$in.includes(actual)) return false;
    } else if (Array.isArray(actual)) {
      if (!actual.includes(expected)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

/**
 * High-Performance In-Memory Driver
 * Zero-dependency, thread-safe, synchronous/asynchronous in-memory engine.
 * Used by default for instant local development, automated testing, and zero-downtime fallback.
 */
export class MemoryDatabaseDriver implements IDatabaseDriver {
  public readonly name: string = "in-memory";
  public readonly dialect: SupportedDialect = "memory";

  // Collection name -> Map<id, Record>
  private store: Map<string, Map<string, unknown>>;
  private isConnected: boolean = true;

  constructor() {
    this.isConnected = true;
    if (!globalThis.__THINKOVA_GLOBAL_MEMORY_STORE__) {
      globalThis.__THINKOVA_GLOBAL_MEMORY_STORE__ = new Map();
    }
    this.store = globalThis.__THINKOVA_GLOBAL_MEMORY_STORE__;
  }

  public async connect(): Promise<boolean> {
    this.isConnected = true;
    return true;
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  public async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    return { ok: this.isConnected, latencyMs: 0.1 };
  }

  public getStatus(): DatabaseDriverStatus {
    let totalRecords = 0;
    for (const coll of this.store.values()) {
      totalRecords += coll.size;
    }

    return {
      name: this.name,
      dialect: this.dialect,
      connected: this.isConnected,
      latencyMs: 0.1,
      uriProtocol: "memory://",
      isFallback: false,
      activeRecordsCount: totalRecords,
      lastChecked: new Date().toISOString(),
    };
  }

  private getCollection(name: string): Map<string, unknown> {
    let coll = this.store.get(name);
    if (!coll) {
      coll = new Map();
      this.store.set(name, coll);
    }
    return coll;
  }

  public async get<T>(collection: string, id: string): Promise<T | null> {
    const coll = this.getCollection(collection);
    const item = coll.get(id);
    if (!item) return null;
    return structuredClone(item) as T;
  }

  public async find<T>(
    collection: string,
    filter?: QueryFilter,
    options?: QueryOptions
  ): Promise<T[]> {
    const coll = this.getCollection(collection);
    const results: T[] = [];
    const entries = Object.entries(filter ?? {});

    for (const record of coll.values()) {
      if (matchesFilter(record, entries)) {
        results.push(structuredClone(record) as T);
      }
    }

    // Sort if requested
    if (options?.sort) {
      const [field, direction] = Object.entries(options.sort)[0] || [];
      if (field) {
        results.sort((a, b) => {
          const valA = String((a as Record<string, unknown>)[field] ?? "");
          const valB = String((b as Record<string, unknown>)[field] ?? "");
          if (valA === valB) return 0;
          const order = direction === "desc" ? -1 : 1;
          return valA > valB ? order : -order;
        });
      }
    }

    // Offset and Limit
    const offset = options?.offset || 0;
    const limit = options?.limit !== undefined ? options.limit : results.length;
    return results.slice(offset, offset + limit);
  }

  public async count(collection: string, filter?: QueryFilter): Promise<number> {
    const records = this.store.get(collection);
    if (!records) return 0;
    const entries = Object.entries(filter ?? {});
    if (entries.length === 0) return records.size;

    let total = 0;
    for (const record of records.values()) {
      if (matchesFilter(record, entries)) total++;
    }
    return total;
  }

  public async upsert<T extends { id: string }>(collection: string, record: T): Promise<void> {
    const coll = this.getCollection(collection);
    coll.set(record.id, structuredClone(record));
  }

  public async update<T>(collection: string, id: string, partial: Partial<T>): Promise<void> {
    const coll = this.getCollection(collection);
    const existing = coll.get(id) as Record<string, unknown> | undefined;
    if (existing) {
      const merged = { ...existing, ...partial };
      coll.set(id, structuredClone(merged));
    }
  }

  public async delete(collection: string, id: string): Promise<boolean> {
    const coll = this.getCollection(collection);
    return coll.delete(id);
  }

  public clearSync(collection?: string): void {
    if (collection) {
      this.store.get(collection)?.clear();
    } else {
      this.store.clear();
    }
  }

  public async clear(collection?: string): Promise<void> {
    this.clearSync(collection);
  }

  /**
   * Diagnostic helper to inspect raw collections
   */
  public getRawStore(): Map<string, Map<string, unknown>> {
    return this.store;
  }
}
