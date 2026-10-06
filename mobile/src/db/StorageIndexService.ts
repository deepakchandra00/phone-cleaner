import * as SQLite from "expo-sqlite";
import {
  CREATE_STORAGE_ITEMS_TABLE_SQL,
  mapRowToStorageItem,
  type StorageCategory,
  type StorageItem,
  type StorageItemRow,
  type StorageSource,
  type WhatsAppType,
  type DashboardSummary,
  type DashboardCategoryAggregate,
} from "./schema";

export interface StorageQueryParams {
  category?: StorageCategory;
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

  public getDb(): SQLite.SQLiteDatabase {
    if (!this.db) {
      this.db = SQLite.openDatabaseSync("phone_cleaner.db");
    }
    if (!this.initialized) {
      try {
        const tableSql = this.db.getFirstSync<{ sql: string }>(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='storage_items';"
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
   * Bulk upserts an array of storage items into SQLite inside a fast transaction.
   */
  public upsertItemsBatch(items: StorageItem[]): void {
    if (items.length === 0) return;
    const db = this.getDb();

    // Deduplicate items by ID keeping latest
    const uniqueMap = new Map<string, StorageItem>();
    for (const item of items) {
      uniqueMap.set(item.id, item);
    }
    const uniqueItems = Array.from(uniqueMap.values());

    db.withTransactionSync(() => {
      const stmt = db.prepareSync(`
        INSERT OR REPLACE INTO storage_items (
          id, uri, path, name, size_bytes, mime_type, extension,
          category, source, modified_at, is_large, is_junk, junk_type, junk_reason,
          duplicate_group_id, can_open, can_preview, can_delete, requires_permission,
          width, height, duration_ms, whatsapp_type, is_sent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);

      try {
        for (const item of uniqueItems) {
          stmt.executeSync([
            item.id,
            item.uri,
            item.path ?? null,
            item.name,
            item.sizeBytes,
            item.mimeType ?? null,
            item.extension ?? null,
            item.category,
            item.source,
            item.modifiedAt,
            item.isLarge ? 1 : 0,
            item.isJunk ? 1 : 0,
            item.junkType ?? null,
            item.junkReason ?? null,
            item.duplicateGroupId ?? null,
            item.canOpen ? 1 : 0,
            item.canPreview ? 1 : 0,
            item.canDelete ? 1 : 0,
            item.requiresPermission ? 1 : 0,
            item.width ?? null,
            item.height ?? null,
            item.durationMs ?? null,
            item.whatsappType ?? null,
            item.isSent ? 1 : 0,
          ]);
        }
      } finally {
        stmt.finalizeSync();
      }
    });
  }

  /**
   * Fast paginated, sorted, and filtered query over the storage items table.
   */
  public getItems(params: StorageQueryParams = {}): StorageQueryResult {
    const db = this.getDb();
    const conditions: string[] = [];
    const args: any[] = [];

    if (params.category) {
      conditions.push("category = ?");
      args.push(params.category);
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Get totals
    const countSql = `SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_bytes FROM storage_items ${whereClause}`;
    const countRow = db.getFirstSync<{ count: number; total_bytes: number }>(countSql, args) ?? {
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
    const querySql = `SELECT * FROM storage_items ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    const queryArgs = [...args, limit, offset];

    const rows = db.getAllSync<StorageItemRow>(querySql, queryArgs);
    const items = rows.map(mapRowToStorageItem);

    return {
      items,
      totalCount: countRow.count,
      totalBytes: countRow.total_bytes,
    };
  }

  /**
   * Retrieves a single item by ID.
   */
  public getItemById(id: string): StorageItem | null {
    const db = this.getDb();
    const row = db.getFirstSync<StorageItemRow>("SELECT * FROM storage_items WHERE id = ? LIMIT 1", [id]);
    return row ? mapRowToStorageItem(row) : null;
  }

  /**
   * Retrieves multiple items by their IDs.
   */
  public getItemsByIds(ids: string[]): StorageItem[] {
    if (ids.length === 0) return [];
    const db = this.getDb();
    const items: StorageItem[] = [];
    const chunkSize = 200;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db.getAllSync<StorageItemRow>(
        `SELECT * FROM storage_items WHERE id IN (${placeholders})`,
        chunk
      );
      items.push(...rows.map(mapRowToStorageItem));
    }

    return items;
  }

  /**
   * Deletes records by ID from SQLite in safe batches.
   */
  public deleteItemsByIds(ids: string[]): number {
    if (ids.length === 0) return 0;
    const db = this.getDb();
    let deleted = 0;
    const chunkSize = 200;

    db.withTransactionSync(() => {
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(",");
        const res = db.runSync(`DELETE FROM storage_items WHERE id IN (${placeholders})`, chunk);
        deleted += res.changes;
      }
    });

    return deleted;
  }

  /**
   * Computes unified dashboard aggregates derived purely from SQLite.
   */
  public getDashboardAggregates(
    storageStats: { totalBytes: number; usedBytes: number; freeBytes: number },
    appsStats: { count: number; bytes: number }
  ): DashboardSummary {
    const db = this.getDb();

    // 1. By physical category
    const catRows = db.getAllSync<{ category: string; file_count: number; total_bytes: number }>(`
      SELECT category, COUNT(*) as file_count, COALESCE(SUM(size_bytes), 0) as total_bytes
      FROM storage_items
      GROUP BY category;
    `);

    const categoriesMap = new Map<StorageCategory, { count: number; bytes: number }>();
    for (const r of catRows) {
      categoriesMap.set(r.category as StorageCategory, { count: r.file_count, bytes: r.total_bytes });
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
    const dupStats = db.getFirstSync<{ group_count: number; file_count: number; total_bytes: number }>(`
      SELECT COUNT(DISTINCT duplicate_group_id) as group_count,
             COUNT(*) as file_count,
             COALESCE(SUM(size_bytes), 0) as total_bytes
      FROM storage_items
      WHERE duplicate_group_id IS NOT NULL;
    `) ?? { group_count: 0, file_count: 0, total_bytes: 0 };

    const duplicateRecoverableBytes = Math.max(0, Math.floor(dupStats.total_bytes * 0.5));

    const ALL_CATEGORIES: StorageCategory[] = [
      "photos",
      "videos",
      "audio",
      "documents",
      "downloads",
      "apks",
      "other",
    ];

    const categoryAggregates: DashboardCategoryAggregate[] = ALL_CATEGORIES.map((cat) => {
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

    const totalScannedBytes = Array.from(categoriesMap.values()).reduce((sum, c) => sum + c.bytes, 0);
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
  }

  /**
   * Returns total count of indexed items.
   */
  public getItemCount(): number {
    const db = this.getDb();
    const row = db.getFirstSync<{ count: number }>("SELECT COUNT(*) as count FROM storage_items;");
    return row?.count ?? 0;
  }

  /**
   * Retrieves cached SHA-256 and dHash values for files that have not changed
   * (matching path, exact size, and modification timestamp).
   */
  public getCachedHashes(
    items: Array<{ pathOrUri: string; sizeBytes: number; modifiedAt: number }>,
  ): Map<string, { sha256: string | null; dhash: string | null }> {
    const result = new Map<string, { sha256: string | null; dhash: string | null }>();
    if (items.length === 0) return result;
    const db = this.getDb();
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
          result.set(row.path_or_uri, { sha256: row.sha256, dhash: row.dhash });
        }
      }
    }
    return result;
  }

  /**
   * Persists computed hashes into SQLite file_hashes table for incremental caching.
   */
  public saveCachedHashes(
    hashes: Array<{
      pathOrUri: string;
      sizeBytes: number;
      modifiedAt: number;
      sha256: string | null;
      dhash: string | null;
    }>,
  ): void {
    if (hashes.length === 0) return;
    const db = this.getDb();

    db.withTransactionSync(() => {
      const stmt = db.prepareSync(`
        INSERT OR REPLACE INTO file_hashes (
          path_or_uri, size_bytes, modified_at, sha256, dhash, cached_at
        ) VALUES (?, ?, ?, ?, ?, ?);
      `);
      try {
        const now = Date.now();
        for (const h of hashes) {
          stmt.executeSync([
            h.pathOrUri,
            h.sizeBytes,
            h.modifiedAt,
            h.sha256 ?? null,
            h.dhash ?? null,
            now,
          ]);
        }
      } finally {
        stmt.finalizeSync();
      }
    });
  }

  /**
   * Resets database table.
   */
  public clearAll(): void {
    const db = this.getDb();
    db.execSync("DELETE FROM storage_items;");
  }
}

export const StorageIndexService = new StorageIndexServiceImpl();
