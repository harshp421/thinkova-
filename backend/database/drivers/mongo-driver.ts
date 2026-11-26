import { AsyncLocalStorage } from "node:async_hooks";
import { MongoClient, Db, type ClientSession } from "mongodb";
import type {
  IDatabaseDriver,
  SupportedDialect,
  DatabaseDriverStatus,
  QueryFilter,
  QueryOptions,
} from "./interface";

function mongoQuery(filter?: QueryFilter) {
  return Object.fromEntries(Object.entries(filter ?? {}).filter(([, value]) => value !== undefined));
}

/**
 * MongoDB Production Database Driver
 * High-performance driver for MongoDB Atlas and self-hosted MongoDB clusters.
 * Translates universal query filters into MongoDB BSON/JSON operations.
 */
export class MongoDatabaseDriver implements IDatabaseDriver {
  public readonly name: string = "mongodb";
  public readonly dialect: SupportedDialect = "mongodb";

  private transactionSession = new AsyncLocalStorage<ClientSession>();

  public async transaction<T>(operation: () => Promise<T>): Promise<T> {
    await this.getDb();
    const session = this.client!.startSession();
    try {
      return await session.withTransaction(() => this.transactionSession.run(session, operation));
    } finally {
      await session.endSession();
    }
  }

  private connectionUri: string;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isConnected: boolean = false;
  private connectPromise: Promise<boolean> | null = null;

  constructor(connectionUri: string) {
    this.connectionUri = (connectionUri || "").trim().replace(/^["']|["']$/g, "").trim();
  }

  public async connect(): Promise<boolean> {
    if (this.isConnected && this.client) return true;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = (async () => {
      try {
        if (!this.connectionUri || !this.connectionUri.startsWith("mongodb")) {
          console.warn("[MongoDatabaseDriver] Invalid or missing MongoDB connection URI");
          this.isConnected = false;
          return false;
        }

        this.client = new MongoClient(this.connectionUri, {
          connectTimeoutMS: 10000,
          serverSelectionTimeoutMS: 10000,
        });

        await this.client.connect();
        this.db = this.client.db();
        this.isConnected = true;
        console.log(`[MongoDatabaseDriver] Successfully connected to MongoDB Atlas (${this.db.databaseName})`);
        return true;
      } catch (err) {
        console.error("[MongoDatabaseDriver] Connection error:", err);
        this.isConnected = false;
        return false;
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
    this.isConnected = false;
  }

  public async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.connect();
      if (!this.db) return { ok: false, latencyMs: 0 };
      await this.db.command({ ping: 1 });
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  public getStatus(): DatabaseDriverStatus {
    return {
      name: this.name,
      dialect: this.dialect,
      connected: this.isConnected,
      latencyMs: this.isConnected ? 2.5 : undefined,
      uriProtocol: this.connectionUri.startsWith("mongodb+srv://") ? "mongodb+srv://" : "mongodb://",
      isFallback: false,
      lastChecked: new Date().toISOString(),
    };
  }

  private async getDb(): Promise<Db> {
    if (!this.isConnected || !this.db) {
      await this.connect();
    }
    if (!this.db) {
      throw new Error("[MongoDatabaseDriver] Not connected to database");
    }
    return this.db;
  }

  public async get<T>(collection: string, id: string): Promise<T | null> {
    const db = await this.getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await db.collection(collection).findOne({ $or: [{ id }, { _id: id as any }] } as any, { session: this.transactionSession.getStore() });
    if (!doc) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { _id, ...rest } = doc as any;
    return { id: rest.id || String(_id), ...rest } as T;
  }

  public async find<T>(collection: string, filter?: QueryFilter, options?: QueryOptions): Promise<T[]> {
    const db = await this.getDb();
    let cursor = db.collection(collection).find(mongoQuery(filter), { session: this.transactionSession.getStore() });

    if (options?.sort) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sortObj: any = {};
      for (const [k, v] of Object.entries(options.sort)) {
        sortObj[k] = v === "desc" ? -1 : 1;
      }
      cursor = cursor.sort(sortObj);
    }

    if (options?.offset) {
      cursor = cursor.skip(options.offset);
    }
    if (options?.limit) {
      cursor = cursor.limit(options.limit);
    }

    const docs = await cursor.toArray();
    return docs.map((doc) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { _id, ...rest } = doc as any;
      return { id: rest.id || String(_id), ...rest } as T;
    });
  }

  public async count(collection: string, filter?: QueryFilter): Promise<number> {
    const db = await this.getDb();
    return db.collection(collection).countDocuments(mongoQuery(filter), {
      session: this.transactionSession.getStore(),
    });
  }

  public async upsert<T extends { id: string }>(collection: string, record: T): Promise<void> {
    const db = await this.getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { _id, ...setFields } = record as any;
    const docId = record.id || (typeof _id === "string" ? _id : undefined);

    // Strip undefined keys so MongoDB does not write undefined/null values into sparse indexes
    for (const key of Object.keys(setFields)) {
      if (setFields[key] === undefined) {
        delete setFields[key];
      }
    }

    // Ensure id and _id are explicitly populated to guarantee deterministic upsert without $or ambiguity
    if (docId) {
      setFields.id = docId;
      setFields._id = docId;
    }

    await db.collection(collection).updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: docId } as any,
      { $set: setFields },
      { upsert: true, session: this.transactionSession.getStore() }
    );
  }

  public async update<T>(collection: string, id: string, partial: Partial<T>): Promise<void> {
    const db = await this.getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { _id, ...setFields } = partial as any;

    // Strip undefined keys so MongoDB does not write undefined/null values into sparse indexes
    for (const key of Object.keys(setFields)) {
      if (setFields[key] === undefined) {
        delete setFields[key];
      }
    }

    await db.collection(collection).updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { $or: [{ id }, { _id: id as any }] } as any,
      { $set: setFields },
      { session: this.transactionSession.getStore() }
    );
  }

  public async delete(collection: string, id: string): Promise<boolean> {
    const db = await this.getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await db.collection(collection).deleteOne({ $or: [{ id }, { _id: id as any }] } as any);
    return res.deletedCount > 0;
  }

  public async clear(collection?: string): Promise<void> {
    const db = await this.getDb();
    if (collection) {
      await db.collection(collection).deleteMany({});
    } else {
      const collections = await db.listCollections().toArray();
      for (const col of collections) {
        await db.collection(col.name).deleteMany({});
      }
    }
  }
}
