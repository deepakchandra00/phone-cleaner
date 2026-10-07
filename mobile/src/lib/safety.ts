import type { StorageItem } from "@/db/schema";
import type { ScannedFile } from "./types";

/**
 * Central Safety Engine
 * Explicit, auditable safety policies for Phone Cleaner cleanup operations.
 */

/**
 * Determines whether an indexed storage item is safe for automated Smart Clean selection.
 * Personal photos, camera videos, downloads, and user documents require explicit manual selection.
 */
export function isSafeToCleanAutomatically(
  item: StorageItem | ScannedFile,
): boolean {
  if ("canDelete" in item && item.canDelete === false) {
    return false;
  }

  const path = (item.path || "").toLowerCase();
  const category = (item.category || "").toLowerCase();
  // A junk label, filename suffix, APK or sent media is not evidence of safety.
  // Personal content and downloads always require explicit selection.
  if (
    [
      "photos",
      "videos",
      "audio",
      "documents",
      "downloads",
      "apks",
      "whatsapp",
    ].includes(category)
  ) {
    return false;
  }
  if (
    path.includes("/download/") ||
    path.includes("/downloads/") ||
    path.includes("/whatsapp/") ||
    path.includes("/camera/")
  )
    return false;
  return /\/(?:cache|\.cache|\.thumbnails)\//.test(path);
}

/**
 * Ranks photos in a duplicate cluster to deterministically select the single best photo to keep.
 * Scoring priority:
 * 1. Image Resolution (Megapixels): Higher resolution preserved.
 * 2. File Size (Bytes): Higher file size (less compression/higher detail) preserved.
 * 3. Chronological Priority: Preserves the original capture.
 */
export function rankBestPhotoToKeep(files: ScannedFile[]): {
  keepId: string;
  sortedFiles: ScannedFile[];
} {
  const sorted = [...files].sort((a, b) => {
    const resA = (a.width ?? 0) * (a.height ?? 0);
    const resB = (b.width ?? 0) * (b.height ?? 0);
    if (resB !== resA) return resB - resA;

    if (b.sizeBytes !== a.sizeBytes) return b.sizeBytes - a.sizeBytes;

    return a.modifiedAt - b.modifiedAt;
  });

  return {
    keepId: sorted[0]?.id ?? "",
    sortedFiles: sorted,
  };
}
