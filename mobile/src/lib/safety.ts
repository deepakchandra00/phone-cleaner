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
export function isSafeToCleanAutomatically(item: StorageItem | ScannedFile): boolean {
  if ("canDelete" in item && item.canDelete === false) {
    return false;
  }

  const name = item.name.toLowerCase();
  const path = (item.path || "").toLowerCase();

  // 1. App caches, temp files, and logs
  if ("isJunk" in item && item.isJunk) {
    return true;
  }
  if (
    name.endsWith(".tmp") ||
    name.endsWith(".temp") ||
    name.endsWith(".log") ||
    path.endsWith(".tmp") ||
    path.endsWith(".log")
  ) {
    return true;
  }

  // 2. Thumbnail caches (restricted to actual cache directories or hidden thumb files)
  if (
    path.includes("/.thumbnails/") ||
    path.includes("/thumbnails/") ||
    name.endsWith(".thumb") ||
    name === ".thumbnails" ||
    name.startsWith(".thumb_")
  ) {
    return true;
  }

  // 3. Obsolete standalone Android installation packages (.apk) in public downloads
  if (name.endsWith(".apk") || ("junkType" in item && item.junkType === "apk")) {
    return true;
  }

  // 4. WhatsApp Sent media (duplicates generated when forwarding/sending media)
  if (
    ("isSent" in item && item.isSent) ||
    path.includes("/sent/")
  ) {
    return true;
  }

  return false;
}

/**
 * Ranks photos in a duplicate cluster to deterministically select the single best photo to keep.
 * Scoring priority:
 * 1. Image Resolution (Megapixels): Higher resolution preserved.
 * 2. File Size (Bytes): Higher file size (less compression/higher detail) preserved.
 * 3. Chronological Priority: Preserves the original capture.
 */
export function rankBestPhotoToKeep(files: ScannedFile[]): { keepId: string; sortedFiles: ScannedFile[] } {
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
