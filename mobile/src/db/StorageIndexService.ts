import {
  STORAGE_BATCH_SIZE,
  storageBatchSql,
  storageItemBindings,
} from "../lib/storageIndexBatch.ts";
import * as SQLite from "expo-sqlite";
import {
  DatabaseWriteQueue,
  databaseTransaction,
  isDatabaseBusy,
} from "../lib/databaseWrites";
import {
  CREATE_STORAGE_ITEMS_TABLE_SQL,
  mapRowToStorageItem,
  type DashboardCategoryAggregate,
  type DashboardSummary,
  type StorageCategory,
  type StorageItem,
  type StorageItemRow,
  type StorageSource,
  type WhatsAppType,
} from "./schema";

export interface StorageQueryParams {
  category?: StorageCategory;
  jpegOnly?: boolean;
  parentPath?: string;
  prioritizeId?: string;
  source?: StorageSource;
  minSizeBytes?: number;
  maxSizeBytes?: number;
  isLarge?: boolean;
  isJunk?: boolean;
  junkType?: string;
  isSent?: boolean;
  duplicateGroupId?: string;
  whatsappType?: WhatsAppType;
  search?: string;
  sortBy?: "size_desc" | "size_asc" | "date_desc" | "date_asc" | "name_asc";
  limit?: number;
  offset?: number;
}

export interface StorageQueryResult {
  items: StorageItem[];
  totalCount: number;
  totalBytes: number;
}

class StorageIndexServiceImpl {
  private db: SQLite.SQLiteDatabase | null = null;
  private initialized = false;
  private writer: Promise<SQLite.SQLiteDatabase> | null = null;
  private writes = new DatabaseWriteQueue();

  private async write<T>(
    operation: (db: SQLite.SQLiteDatabase) => Promise<T>,
  ): Promise<T> {
    this.getDb(); // Set up schema/WAL before any writer opens.
    return this.writes.run(async () => {
      if (!this.writer)
        this.writer = SQLite.openDatabaseAsync("phone_cleaner.db", {
          useNewConnection: true,
        })
          .then(async (db) => {
            try {
              await db.execAsync("PRAGMA busy_timeout = 1500;");
              return db;
            } catch (error) {
              await db.closeAsync().catch(() => {});
              throw error;
            }
          })
          .catch((error) => {
            this.writer = null;
            throw error;
          });
      return operation(await this.writer);
    });
  }

  public resetConnection(): void {
    try {
      if (this.db) {
        this.db.closeSync();
      }
    } catch {}
    this.db = null;
    this.initialized = false;
  }

  public getDb(): SQLite.SQLiteDatabase {
    if (!this.db) {
      this.db = SQLite.openDatabaseSync("phone_cleaner.db", {
        useNewConnection: true,
      });
    }
    if (!this.initialized) {
      this.db.execSync("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 100;");
      try {
        const tableSql = this.db.getFirstSync<{ sql: string }>(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='storage_items';",
        );
        if (
          tableSql &&
          (tableSql.sql.includes("uri TEXT NOT NULL UNIQUE") ||
            !tableSql.sql.includes("junk_type") ||
            !tableSql.sql.includes("is_sent"))
        ) {
          this.db.execSync("DROP TABLE IF EXISTS storage_items;");
        }
      } catch {}

      this.db.execSync(CREATE_STORAGE_ITEMS_TABLE_SQL);
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS file_hashes (
          path_or_uri TEXT PRIMARY KEY,
          size_bytes INTEGER NOT NULL,
          modified_at INTEGER NOT NULL,
          sha256 TEXT,
          dhash TEXT,
          cached_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_file_hashes_lookup ON file_hashes(path_or_uri, size_bytes, modified_at);
      `);
      this.initialized = true;
    }
    return this.db;
  }

  /**
   * Resilient execution wrapper that self-heals stale JNI database handles on Android.
   */
  public executeWithRetry<T>(operation: (db: SQLite.SQLiteDatabase) => T): T {
    try {
      const db = this.getDb();
      return operation(db);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (isDatabaseBusy(err)) throw err;
      if (
        this.writes.pending === 0 &&
        /database.*closed|closed.*database|NullPointerException/i.test(msg)
      ) {
        console.warn(
          "[StorageIndexService] Database connection stale or failed, resetting connection...",
          err,
        );
        this.resetConnection();
        const freshDb = this.getDb();
        return operation(freshDb);
      }
      throw err;
    }
  }

  public async replaceItemsAsync(
    items: StorageItem[],
    onProgress?: (count: number) => void,
  ): Promise<void> {
    // SQLite resolves repeated IDs in order; avoid full-library Map/array copies.

    await this.write((txn) =>
      databaseTransaction(txn, async () => {
        await txn.execAsync("DELETE FROM storage_items;");
        // 32 rows × 24 columns stays below SQLite's conservative 999-bind limit.
        // Reuse one statement per batch shape, always finalized within the transaction.
        const statements = new Map<number, SQLite.SQLiteStatement>();
        try {
          for (
            let offset = 0;
            offset < items.length;
            offset += STORAGE_BATCH_SIZE
          ) {
            const batch = items.slice(offset, offset + STORAGE_BATCH_SIZE);
            let stmt = statements.get(batch.length);
            if (!stmt) {
              stmt = await txn.prepareAsync(storageBatchSql(batch.length));
              statements.set(batch.length, stmt);
            }
            await stmt.executeAsync(batch.flatMap(storageItemBindings));
            onProgress?.(offset + batch.length);
          }
        } finally {
          for (const stmt of statements.values()) await stmt.finalizeAsync();
        }
      }),
    );
  }

  /**
   * Fast paginated, sorted, and filtered query over the storage items table.
   */
  public getItems(params: StorageQueryParams = {}): StorageQueryResult {
    return this.executeWithRetry((db) => {
      const conditions: string[] = [];
      const args: any[] = [];
      if (params.jpegOnly) {
        conditions.push(
          "(mime_type = 'image/jpeg' OR lower(extension) IN ('jpg', 'jpeg') OR lower(name) LIKE '%.jpg' OR lower(name) LIKE '%.jpeg')",
        );
      }
      if (params.parentPath) {
        const prefix = params.parentPath.replace(/\/+$/, "") + "/";
        conditions.push(
          "substr(path, 1, ?) = ? AND instr(substr(path, ?), '/') = 0",
        );
        args.push(prefix.length, prefix, prefix.length + 1);
      }

      if (params.category) {
        if ((params.category as string) === "junk") {
          conditions.push("is_junk = 1");
        } else {
          conditions.push("category = ?");
          args.push(params.category);
        }
      }
      if (params.source) {
        conditions.push("source = ?");
        args.push(params.source);
      }
      if (params.minSizeBytes !== undefined) {
        conditions.push("size_bytes >= ?");
        args.push(params.minSizeBytes);
      }
      if (params.maxSizeBytes !== undefined) {
        conditions.push("size_bytes <= ?");
        args.push(params.maxSizeBytes);
      }
      if (params.isLarge !== undefined) {
        conditions.push("is_large = ?");
        args.push(params.isLarge ? 1 : 0);
      }
      if (params.isJunk !== undefined) {
        conditions.push("is_junk = ?");
        args.push(params.isJunk ? 1 : 0);
      }
      if (params.junkType) {
        conditions.push("junk_type = ?");
        args.push(params.junkType);
      }
      if (params.isSent !== undefined) {
        conditions.push("is_sent = ?");
        args.push(params.isSent ? 1 : 0);
      }
      if (params.duplicateGroupId) {
        conditions.push("duplicate_group_id = ?");
        args.push(params.duplicateGroupId);
      }
      if (params.whatsappType) {
        if (params.whatsappType === "sent") {
          conditions.push("is_sent = 1");
        } else {
          conditions.push("whatsapp_type = ?");
          args.push(params.whatsappType);
        }
      }
      if (params.search) {
        conditions.push("name LIKE ?");
        args.push(`%${params.search}%`);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // 1. Get totals
      const countSql = `SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_bytes FROM storage_items ${whereClause}`;
      const countRow = db.getFirstSync<{ count: number; total_bytes: number }>(
        countSql,
        args,
      ) ?? {
        count: 0,
        total_bytes: 0,
      };

      // 2. Determine sorting
      let orderBy = "size_bytes DESC";
      switch (params.sortBy) {
        case "size_asc":
          orderBy = "size_bytes ASC";
          break;
        case "date_desc":
          orderBy = "modified_at DESC";
          break;
        case "date_asc":
          orderBy = "modified_at ASC";
          break;
        case "name_asc":
          orderBy = "name COLLATE NOCASE ASC";
          break;
        case "size_desc":
        default:
          orderBy = "size_bytes DESC";
          break;
      }

      // 3. Paginate
      const limit = Math.min(params.limit ?? 50, 200);
      const offset = params.offset ?? 0;
      const focusOrder = params.prioritizeId
        ? "CASE WHEN id = ? THEN 0 ELSE 1 END, "
        : "";
      const querySql = `SELECT * FROM storage_items ${whereClause} ORDER BY ${focusOrder}${orderBy} LIMIT ? OFFSET ?`;
      const queryArgs = [
        ...args,
        ...(params.prioritizeId ? [params.prioritizeId] : []),
        limit,
        offset,
      ];

      const rows = db.getAllSync<StorageItemRow>(querySql, queryArgs);
      const items = rows.map(mapRowToStorageItem);

      return {
        items,
        totalCount: countRow.count,
        totalBytes: countRow.total_bytes,
      };
    });
  }

  /**
   * Retrieves a single item by ID.
   */
  public getItemsByTargets(targets: string[]): StorageItem[] {
    if (!targets.length) return [];
    return this.executeWithRetry((db) => {
      const items: StorageItem[] = [];
      for (let i = 0; i < targets.length; i += 200) {
        const chunk = targets.slice(i, i + 200);
        const placeholders = chunk.map(() => "?").join(",");
        items.push(
          ...db
            .getAllSync<StorageItemRow>(
              `SELECT * FROM storage_items WHERE path IN (${placeholders}) OR uri IN (${placeholders})`,
              [...chunk, ...chunk],
            )
            .map(mapRowToStorageItem),
        );
      }
      return [...new Map(items.map((item) => [item.id, item])).values()];
    });
  }

  public getItemById(id: string): StorageItem | null {
    return this.executeWithRetry((db) => {
      const row = db.getFirstSync<StorageItemRow>(
        "SELECT * FROM storage_items WHERE id = ? LIMIT 1",
        [id],
      );
      return row ? mapRowToStorageItem(row) : null;
    });
  }

  /**
   * Retrieves multiple items by their IDs.
   */
  public getItemsByIds(ids: string[]): StorageItem[] {
    if (ids.length === 0) return [];
    return this.executeWithRetry((db) => {
      const items: StorageItem[] = [];
      const chunkSize = 200;

      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(",");
        const rows = db.getAllSync<StorageItemRow>(
          `SELECT * FROM storage_items WHERE id IN (${placeholders})`,
          chunk,
        );
        items.push(...rows.map(mapRowToStorageItem));
      }

      return items;
    });
  }

  /**
   * Deletes records by ID from SQLite in safe batches.
   */
  public async deleteItemsByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    return this.write((db) =>
      databaseTransaction(db, async () => {
        let deleted = 0;
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          const result = await db.runAsync(
            `DELETE FROM storage_items WHERE id IN (${chunk.map(() => "?").join(",")})`,
            chunk,
          );
          deleted += result.changes;
        }
        return deleted;
      }),
    );
  }

  /**
   * Computes unified dashboard aggregates derived purely from SQLite with fallback.
   */
  public getDashboardAggregates(
    storageStats: { totalBytes: number; usedBytes: number; freeBytes: number },
    appsStats: { count: number; bytes: number },
  ): DashboardSummary {
    const ALL_CATEGORIES: StorageCategory[] = [
      "photos",
      "videos",
      "audio",
      "documents",
      "downloads",
      "apks",
      "other",
    ];

    try {
      return this.executeWithRetry((db) => {
        // 1. By physical category
        const catRows = db.getAllSync<{
          category: string;
          file_count: number;
          total_bytes: number;
        }>(`
          SELECT category, COUNT(*) as file_count, COALESCE(SUM(size_bytes), 0) as total_bytes
          FROM storage_items
          GROUP BY category;
        `);

        const categoriesMap = new Map<
          StorageCategory,
          { count: number; bytes: number }
        >();
        for (const r of catRows) {
          categoriesMap.set(r.category as StorageCategory, {
            count: r.file_count,
            bytes: r.total_bytes,
          });
        }

        // 2. Junk cleanable
        const junkStats = db.getFirstSync<{ count: number; bytes: number }>(`
          SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as bytes
          FROM storage_items
          WHERE is_junk = 1;
        `) ?? { count: 0, bytes: 0 };

        // 3. Large files (>= 10 MB)
        const largeStats = db.getFirstSync<{ count: number; bytes: number }>(`
          SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as bytes
          FROM storage_items
          WHERE is_large = 1;
        `) ?? { count: 0, bytes: 0 };

        // 4. WhatsApp files
        const waStats = db.getFirstSync<{ count: number; bytes: number }>(`
          SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as bytes
          FROM storage_items
          WHERE source = 'whatsapp';
        `) ?? { count: 0, bytes: 0 };

        // 5. Duplicates recoverable
        const dupStats = db.getFirstSync<{
          group_count: number;
          file_count: number;
          total_bytes: number;
        }>(`
          SELECT COUNT(DISTINCT duplicate_group_id) as group_count,
                 COUNT(*) as file_count,
                 COALESCE(SUM(size_bytes), 0) as total_bytes
          FROM storage_items
          WHERE duplicate_group_id IS NOT NULL;
        `) ?? { group_count: 0, file_count: 0, total_bytes: 0 };

        const duplicateRecoverableBytes = Math.max(
          0,
          Math.floor(dupStats.total_bytes * 0.5),
        );

        const categoryAggregates: DashboardCategoryAggregate[] =
          ALL_CATEGORIES.map((cat) => {
            const data = categoriesMap.get(cat) ?? { count: 0, bytes: 0 };
            let cleanable = 0;
            if (cat === "downloads" || cat === "apks") {
              cleanable = data.bytes;
            }
            return {
              category: cat,
              fileCount: data.count,
              totalBytes: data.bytes,
              cleanableBytes: cleanable,
            };
          });

        const totalScannedBytes = Array.from(categoriesMap.values()).reduce(
          (sum, c) => sum + c.bytes,
          0,
        );
        const totalCleanableBytes = junkStats.bytes + duplicateRecoverableBytes;

        return {
          totalStorageBytes: storageStats.totalBytes,
          usedStorageBytes: storageStats.usedBytes,
          freeStorageBytes: storageStats.freeBytes,
          totalScannedBytes,
          totalCleanableBytes,
          categories: categoryAggregates,
          largeFilesCount: largeStats.count,
          largeFilesBytes: largeStats.bytes,
          junkFilesCount: junkStats.count,
          junkFilesBytes: junkStats.bytes,
          whatsappFilesCount: waStats.count,
          whatsappFilesBytes: waStats.bytes,
          duplicateGroupsCount: dupStats.group_count,
          duplicateFilesCount: dupStats.file_count,
          duplicateRecoverableBytes,
          appsCount: appsStats.count,
          appsBytes: appsStats.bytes,
          lastScannedAt: Date.now(),
        };
      });
    } catch (err) {
      console.warn(
        "[StorageIndexService] getDashboardAggregates fallback due to error:",
        err,
      );
      return {
        totalStorageBytes: storageStats.totalBytes,
        usedStorageBytes: storageStats.usedBytes,
        freeStorageBytes: storageStats.freeBytes,
        totalScannedBytes: 0,
        totalCleanableBytes: 0,
        categories: ALL_CATEGORIES.map((cat) => ({
          category: cat,
          fileCount: 0,
          totalBytes: 0,
          cleanableBytes: 0,
        })),
        largeFilesCount: 0,
        largeFilesBytes: 0,
        junkFilesCount: 0,
        junkFilesBytes: 0,
        whatsappFilesCount: 0,
        whatsappFilesBytes: 0,
        duplicateGroupsCount: 0,
        duplicateFilesCount: 0,
        duplicateRecoverableBytes: 0,
        appsCount: appsStats.count,
        appsBytes: appsStats.bytes,
        lastScannedAt: Date.now(),
      };
    }
  }

  /**
   * Returns total count of indexed items.
   */
  public getItemCount(): number {
    return this.executeWithRetry((db) => {
      const row = db.getFirstSync<{ count: number }>(
        "SELECT COUNT(*) as count FROM storage_items;",
      );
      return row?.count ?? 0;
    });
  }

  /**
   * Retrieves cached SHA-256 and dHash values for files that have not changed
   * (matching path, exact size, and modification timestamp).
   */
  public async clearPhotoHashCache(): Promise<void> {
    await this.write((db) => db.execAsync("DELETE FROM file_hashes;"));
  }

  public getCachedHashes(
    items: { pathOrUri: string; sizeBytes: number; modifiedAt: number }[],
  ): Map<string, { sha256: string | null; dhash: string | null }> {
    const result = new Map<
      string,
      { sha256: string | null; dhash: string | null }
    >();
    if (items.length === 0) return result;

    return this.executeWithRetry((db) => {
      const chunkSize = 150;

      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(",");
        const paths = chunk.map((c) => c.pathOrUri);
        const rows = db.getAllSync<{
          path_or_uri: string;
          size_bytes: number;
          modified_at: number;
          sha256: string | null;
          dhash: string | null;
        }>(
          `SELECT path_or_uri, size_bytes, modified_at, sha256, dhash FROM file_hashes WHERE path_or_uri IN (${placeholders});`,
          paths,
        );

        for (const row of rows) {
          const match = chunk.find(
            (c) =>
              c.pathOrUri === row.path_or_uri &&
              c.sizeBytes === row.size_bytes &&
              c.modifiedAt === row.modified_at,
          );
          if (match) {
            result.set(row.path_or_uri, {
              sha256: row.sha256,
              dhash: row.dhash,
            });
          }
        }
      }
      return result;
    });
  }

  /**
   * Persists computed hashes into SQLite file_hashes table for incremental caching.
   */
  public async saveCachedHashes(
    hashes: {
      pathOrUri: string;
      sizeBytes: number;
      modifiedAt: number;
      sha256: string | null;
      dhash: string | null;
    }[],
  ): Promise<void> {
    if (hashes.length === 0) return;

    await this.write((db) =>
      databaseTransaction(db, async () => {
        const stmt = await db.prepareAsync(`
          INSERT OR REPLACE INTO file_hashes (
            path_or_uri, size_bytes, modified_at, sha256, dhash, cached_at
          ) VALUES (?, ?, ?, ?, ?, ?);
        `);
        try {
          const now = Date.now();
          for (const h of hashes) {
            await stmt.executeAsync([
              h.pathOrUri,
              h.sizeBytes,
              h.modifiedAt,
              h.sha256 ?? null,
              h.dhash ?? null,
              now,
            ]);
          }
        } finally {
          await stmt.finalizeAsync();
        }
      }),
    );
  }

  /**
   * Resets database table.
   */
  public async clearAll(): Promise<void> {
    await this.write((db) => db.execAsync("DELETE FROM storage_items;"));
  }
}

export const StorageIndexService = new StorageIndexServiceImpl();
