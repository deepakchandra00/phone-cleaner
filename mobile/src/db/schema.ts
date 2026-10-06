export type StorageCategory =
  | "photos"
  | "videos"
  | "audio"
  | "documents"
  | "downloads"
  | "apks"
  | "other";

export type StorageSource =
  | "media_store"
  | "filesystem"
  | "saf"
  | "whatsapp";

export type WhatsAppType =
  | "image"
  | "video"
  | "audio"
  | "voice"
  | "document"
  | "sticker"
  | "sent";

export type JunkType = "cache" | "temp" | "apk" | "thumbnail" | "empty_folder" | "trash" | "browser" | "other";

export type DeleteStrategy =
  | "media_store"
  | "document_uri"
  | "filesystem"
  | "manage_external_storage"
  | "unsupported";

export interface StorageItem {
  id: string;
  uri: string;
  path?: string;
  name: string;
  sizeBytes: number;
  mimeType?: string;
  extension?: string;
  category: StorageCategory;
  source: StorageSource;
  modifiedAt: number; // epoch ms
  isLarge: boolean;
  isJunk: boolean;
  junkType?: JunkType;
  junkReason?: string;
  duplicateGroupId?: string;
  canOpen: boolean;
  canPreview: boolean;
  canDelete: boolean;
  deleteStrategy?: DeleteStrategy;
  requiresPermission: boolean;
  width?: number;
  height?: number;
  durationMs?: number;
  whatsappType?: WhatsAppType;
  isSent?: boolean;
}

export interface DashboardCategoryAggregate {
  category: StorageCategory;
  fileCount: number;
  totalBytes: number;
  cleanableBytes: number;
}

export interface DashboardSummary {
  totalStorageBytes: number;
  usedStorageBytes: number;
  freeStorageBytes: number;
  totalScannedBytes: number;
  totalCleanableBytes: number;
  categories: DashboardCategoryAggregate[];
  largeFilesCount: number;
  largeFilesBytes: number;
  junkFilesCount: number;
  junkFilesBytes: number;
  whatsappFilesCount: number;
  whatsappFilesBytes: number;
  duplicateGroupsCount: number;
  duplicateFilesCount: number;
  duplicateRecoverableBytes: number;
  appsCount: number;
  appsBytes: number;
  lastScannedAt: number;
}

export const CREATE_STORAGE_ITEMS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS storage_items (
    id TEXT PRIMARY KEY,
    uri TEXT NOT NULL,
    path TEXT,
    name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    mime_type TEXT,
    extension TEXT,
    category TEXT NOT NULL,
    source TEXT NOT NULL,
    modified_at INTEGER NOT NULL,
    is_large INTEGER NOT NULL DEFAULT 0,
    is_junk INTEGER NOT NULL DEFAULT 0,
    junk_reason TEXT,
    duplicate_group_id TEXT,
    can_open INTEGER NOT NULL DEFAULT 1,
    can_preview INTEGER NOT NULL DEFAULT 0,
    can_delete INTEGER NOT NULL DEFAULT 1,
    requires_permission INTEGER NOT NULL DEFAULT 0,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    whatsapp_type TEXT,
    junk_type TEXT,
    is_sent INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_storage_category ON storage_items(category);
CREATE INDEX IF NOT EXISTS idx_storage_size ON storage_items(size_bytes DESC);
CREATE INDEX IF NOT EXISTS idx_storage_modified ON storage_items(modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_storage_source ON storage_items(source);
CREATE INDEX IF NOT EXISTS idx_storage_large ON storage_items(is_large);
CREATE INDEX IF NOT EXISTS idx_storage_junk ON storage_items(is_junk);
CREATE INDEX IF NOT EXISTS idx_storage_junk_type ON storage_items(junk_type);
CREATE INDEX IF NOT EXISTS idx_storage_is_sent ON storage_items(is_sent);
CREATE INDEX IF NOT EXISTS idx_storage_duplicate ON storage_items(duplicate_group_id);
`;

export interface StorageItemRow {
  id: string;
  uri: string;
  path: string | null;
  name: string;
  size_bytes: number;
  mime_type: string | null;
  extension: string | null;
  category: string;
  source: string;
  modified_at: number;
  is_large: number;
  is_junk: number;
  junk_type: string | null;
  junk_reason: string | null;
  duplicate_group_id: string | null;
  can_open: number;
  can_preview: number;
  can_delete: number;
  requires_permission: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  whatsapp_type: string | null;
  is_sent: number;
}

export function determineDeleteStrategy(
  source: string,
  uri: string,
  path?: string,
  canDelete = true,
): DeleteStrategy {
  if (!canDelete) return "unsupported";
  if (source === "media_store" || uri.startsWith("content://media/")) {
    return "media_store";
  }
  if (source === "saf" || uri.startsWith("content://com.android.externalstorage.documents/")) {
    return "document_uri";
  }
  if (source === "filesystem" || source === "whatsapp") {
    return "filesystem";
  }
  return "filesystem";
}

export function mapRowToStorageItem(row: StorageItemRow): StorageItem {
  return {
    id: row.id,
    uri: row.uri,
    path: row.path ?? undefined,
    name: row.name,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type ?? undefined,
    extension: row.extension ?? undefined,
    category: row.category as StorageCategory,
    source: row.source as StorageSource,
    modifiedAt: row.modified_at,
    isLarge: row.is_large === 1,
    isJunk: row.is_junk === 1,
    junkType: (row.junk_type as JunkType) ?? undefined,
    junkReason: row.junk_reason ?? undefined,
    duplicateGroupId: row.duplicate_group_id ?? undefined,
    canOpen: row.can_open === 1,
    canPreview: row.can_preview === 1,
    canDelete: row.can_delete === 1,
    deleteStrategy: determineDeleteStrategy(row.source, row.uri, row.path ?? undefined, row.can_delete === 1),
    requiresPermission: row.requires_permission === 1,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    whatsappType: (row.whatsapp_type as WhatsAppType) ?? undefined,
    isSent: row.is_sent === 1,
  };
}
