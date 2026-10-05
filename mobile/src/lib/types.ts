/**
 * Type definitions for the scanner output.
 * These mirror the data shape returned by the (future) native
 * AndroidStorageModule / MediaStore cursor and stored in SQLite.
 */

export type CategoryKey =
  | "photos"
  | "videos"
  | "apps"
  | "audio"
  | "documents"
  | "downloads"
  | "junk"
  | "duplicates"
  | "whatsapp"
  | "other";

export interface StorageSummary {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
  /** Bytes reclaimable based on last scan. */
  cleanableBytes: number;
  categories: CategorySummary[];
}

export interface CategorySummary {
  key: CategoryKey;
  label: string;
  bytes: number;
  fileCount: number;
  cleanableBytes: number;
  cleanableCount: number;
}

export interface ScannedFile {
  id: string;
  path: string;
  name: string;
  category: CategoryKey;
  sizeBytes: number;
  mimeType: string;
  modifiedAt: number; // epoch ms
  /** For media: dimensions. */
  width?: number;
  height?: number;
  /** Duration for audio/video, seconds. */
  durationSec?: number;
  /** Hash once computed. */
  hash?: string;
  /** Duplicate group id (files sharing same hash). */
  duplicateGroupId?: string;
  /** Source: e.g. WhatsApp Received, Downloads, Camera. */
  source?: string;
}

export interface DuplicateGroup {
  id: string;
  kind: "exact" | "similar";
  files: ScannedFile[];
  totalBytes: number;
  recoverableBytes: number;
  /** Recommended file to keep. */
  keepId: string;
}

export interface AppItem {
  packageName: string;
  label: string;
  sizeBytes: number;
  cacheBytes: number;
  lastUsedAt: number;
  isSystem: boolean;
  iconUri?: string;
}

export interface ScanResult {
  startedAt: number;
  completedAt: number;
  durationMs: number;
  totalCleanableBytes: number;
  filesScanned: number;
  categories: CategorySummary[];
  largeFiles: ScannedFile[];
  duplicateGroups: DuplicateGroup[];
  apps: AppItem[];
  junkFiles: ScannedFile[];
  whatsappFiles: ScannedFile[];
}

export interface CleanupRecord {
  id: string;
  completedAt: number;
  freedBytes: number;
  fileCount: number;
  category: CategoryKey | "mixed";
}
