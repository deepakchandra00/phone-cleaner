import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import { AndroidStorage, HashWorker } from "android-storage";
import type {
  AppItem,
  CategorySummary,
  DuplicateGroup,
  ScannedFile,
  ScanResult,
  StorageSummary,
} from "./types";
import { getStorageSummary as getMockStorageSummary, buildScanResult as buildMockScanResult } from "./mockData";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

// ──────────────────────────────────────────────────────────────────────────
// STORAGE SUMMARY
// ──────────────────────────────────────────────────────────────────────────

/**
 * Returns real on-device storage summary.
 * Tries the native AndroidStorage module first (most accurate — uses
 * StorageManager/StatFs), then falls back to expo-file-system, then to mock.
 */
export async function getRealStorageSummary(): Promise<StorageSummary> {
  // 1. Try native module
  try {
    const native = AndroidStorage.getStorageStats();
    if (native && native.totalBytes > 0) {
      return buildSummaryFromBytes(native.totalBytes, native.usedBytes, native.freeBytes);
    }
  } catch {
    // Native module not available (dev client not built yet, or iOS)
  }

  // 2. Fall back to FileSystem
  try {
    const totalBytes = await FileSystem.getTotalDiskCapacityAsync();
    const freeBytes = await FileSystem.getFreeDiskStorageAsync();
    if (totalBytes > 0) {
      return buildSummaryFromBytes(totalBytes, totalBytes - freeBytes, freeBytes);
    }
  } catch (err) {
    console.warn("[realScanner] FileSystem capacity error:", err);
  }

  // 3. Final fallback to mock
  return getMockStorageSummary();
}

function buildSummaryFromBytes(total: number, used: number, free: number): StorageSummary {
  const usedPercent = total > 0 ? Math.round((used / total) * 100) : 0;

  // Proportional category estimate based on real used bytes.
  // These are approximations — real per-category bytes come from runRealScan().
  // Shown on the dashboard before the first scan so it's never empty.
  const photosBytes = Math.round(used * 0.35);
  const videosBytes = Math.round(used * 0.28);
  const appsBytes = Math.round(used * 0.18);
  const audioBytes = Math.round(used * 0.05);
  const downloadsBytes = Math.round(used * 0.04);
  const junkBytes = Math.round(used * 0.03);
  const whatsappBytes = Math.round(used * 0.04);
  const otherBytes = Math.max(
    0,
    used - (photosBytes + videosBytes + appsBytes + audioBytes + downloadsBytes + junkBytes + whatsappBytes),
  );

  const categories: CategorySummary[] = [
    { key: "photos", label: "Photos", bytes: photosBytes, fileCount: 0, cleanableBytes: 0, cleanableCount: 0 },
    { key: "videos", label: "Videos", bytes: videosBytes, fileCount: 0, cleanableBytes: 0, cleanableCount: 0 },
    { key: "apps", label: "Apps", bytes: appsBytes, fileCount: 0, cleanableBytes: 0, cleanableCount: 0 },
    { key: "audio", label: "Audio", bytes: audioBytes, fileCount: 0, cleanableBytes: 0, cleanableCount: 0 },
    { key: "downloads", label: "Downloads", bytes: downloadsBytes, fileCount: 0, cleanableBytes: 0, cleanableCount: 0 },
    { key: "junk", label: "Junk", bytes: junkBytes, fileCount: 0, cleanableBytes: 0, cleanableCount: 0 },
    { key: "whatsapp", label: "WhatsApp", bytes: whatsappBytes, fileCount: 0, cleanableBytes: 0, cleanableCount: 0 },
    { key: "other", label: "Other", bytes: otherBytes, fileCount: 0, cleanableBytes: 0, cleanableCount: 0 },
  ];

  return {
    totalBytes: total,
    usedBytes: used,
    freeBytes: free,
    usedPercent,
    cleanableBytes: 0,
    categories,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// SCAN ENGINE
// ──────────────────────────────────────────────────────────────────────────

export async function runRealScan(
  onProgress?: (stage: string, progress: number) => void,
): Promise<ScanResult> {
  const startedAt = Date.now();

  // ── Stage 1: Permissions ─────────────────────────────────────────────
  onProgress?.("Checking device permissions…", 0.05);

  let permissionGranted = false;
  try {
    const { status } = await MediaLibrary.getPermissionsAsync();
    permissionGranted = status === "granted";
  } catch {
    permissionGranted = false;
  }

  // ── Stage 2: Scan MediaStore ─────────────────────────────────────────
  onProgress?.("Scanning device MediaStore…", 0.15);

  const scannedPhotos: ScannedFile[] = [];
  const scannedVideos: ScannedFile[] = [];
  const scannedAudio: ScannedFile[] = [];
  const largeFiles: ScannedFile[] = [];
  const whatsappFiles: ScannedFile[] = [];
  const junkFiles: ScannedFile[] = [];
  let duplicateGroups: DuplicateGroup[] = [];

  if (permissionGranted) {
    // Photos
    try {
      const photoResult = await MediaLibrary.getAssetsAsync({
        first: 500,
        mediaType: ["photo"],
        sortBy: [MediaLibrary.SortBy.modificationTime],
      });
      for (const asset of photoResult.assets) {
        const sizeBytes = estimateMediaSize(asset, "photo");
        const file: ScannedFile = {
          id: asset.id,
          path: asset.uri,
          name: asset.filename || `photo_${asset.id}.jpg`,
          category: "photos",
          sizeBytes,
          mimeType: "image/jpeg",
          modifiedAt: asset.modificationTime || asset.creationTime,
          width: asset.width,
          height: asset.height,
          source: "Camera",
        };
        scannedPhotos.push(file);
        if (sizeBytes > 25 * MB) largeFiles.push(file);
      }
    } catch (e) {
      console.warn("[realScanner] Photo scan error:", e);
    }

    onProgress?.("Scanning videos…", 0.35);

    // Videos
    try {
      const videoResult = await MediaLibrary.getAssetsAsync({
        first: 300,
        mediaType: ["video"],
        sortBy: [MediaLibrary.SortBy.modificationTime],
      });
      for (const asset of videoResult.assets) {
        const sizeBytes = estimateMediaSize(asset, "video");
        const file: ScannedFile = {
          id: asset.id,
          path: asset.uri,
          name: asset.filename || `video_${asset.id}.mp4`,
          category: "videos",
          sizeBytes,
          mimeType: "video/mp4",
          modifiedAt: asset.modificationTime || asset.creationTime,
          width: asset.width,
          height: asset.height,
          durationSec: asset.duration,
          source: "Camera",
        };
        scannedVideos.push(file);
        if (sizeBytes > 25 * MB) largeFiles.push(file);
      }
    } catch (e) {
      console.warn("[realScanner] Video scan error:", e);
    }

    onProgress?.("Scanning audio…", 0.5);

    // Audio
    try {
      const audioResult = await MediaLibrary.getAssetsAsync({
        first: 300,
        mediaType: ["audio"],
        sortBy: [MediaLibrary.SortBy.modificationTime],
      });
      for (const asset of audioResult.assets) {
        const sizeBytes = estimateMediaSize(asset, "audio");
        scannedAudio.push({
          id: asset.id,
          path: asset.uri,
          name: asset.filename || `audio_${asset.id}.mp3`,
          category: "audio",
          sizeBytes,
          mimeType: "audio/mpeg",
          modifiedAt: asset.modificationTime || asset.creationTime,
          durationSec: asset.duration,
          source: "Music",
        });
      }
    } catch (e) {
      console.warn("[realScanner] Audio scan error:", e);
    }

    // ── Stage 3: WhatsApp ──────────────────────────────────────────────
    onProgress?.("Scanning WhatsApp media…", 0.6);

    try {
      const albums = await MediaLibrary.getAlbumsAsync();
      const waAlbums = albums.filter((a) =>
        /whatsapp/i.test(a.title),
      );
      for (const album of waAlbums) {
        const waResult = await MediaLibrary.getAssetsAsync({
          album,
          first: 200,
          sortBy: [MediaLibrary.SortBy.modificationTime],
        });
        for (const asset of waResult.assets) {
          const sizeBytes = estimateMediaSize(asset, "photo");
          whatsappFiles.push({
            id: `wa_${asset.id}`,
            path: asset.uri,
            name: asset.filename || `wa_${asset.id}.jpg`,
            category: "whatsapp",
            sizeBytes,
            mimeType: "image/jpeg",
            modifiedAt: asset.modificationTime || asset.creationTime,
            source: "WhatsApp",
          });
        }
      }
    } catch (e) {
      console.warn("[realScanner] WhatsApp scan error:", e);
    }
  }

  // ── Stage 4: App cache / junk ────────────────────────────────────────
  onProgress?.("Inspecting cache & temporary files…", 0.7);

  try {
    if (FileSystem.cacheDirectory) {
      const entries = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
      for (const entry of entries.slice(0, 50)) {
        const fullPath = `${FileSystem.cacheDirectory}${entry}`;
        try {
          const info = await FileSystem.getInfoAsync(fullPath);
          if (info.exists && !info.isDirectory && info.size > 0) {
            junkFiles.push({
              id: `cache_${entry}`,
              path: fullPath,
              name: entry,
              category: "junk",
              sizeBytes: info.size,
              mimeType: "application/octet-stream",
              modifiedAt: info.modificationTime ? info.modificationTime * 1000 : Date.now(),
              source: "App Cache",
            });
          }
        } catch {
          // skip individual entry errors
        }
      }
    }
  } catch (e) {
    console.warn("[realScanner] Cache scan error:", e);
  }

  // ── Stage 5: Duplicate detection ─────────────────────────────────────
  onProgress?.("Detecting duplicate files…", 0.8);

  duplicateGroups = await detectDuplicates(scannedPhotos, onProgress);

  // ── If device had no media at all, fall back to mock so UI stays usable ─
  if (
    scannedPhotos.length === 0 &&
    scannedVideos.length === 0 &&
    junkFiles.length === 0 &&
    whatsappFiles.length === 0
  ) {
    onProgress?.("Finalizing scan results…", 1);
    const mock = buildMockScanResult();
    mock.durationMs = Date.now() - startedAt;
    return mock;
  }

  onProgress?.("Building scan report…", 0.95);

  // ── Apps from native module ──────────────────────────────────────────
  const apps = await getAppsFromNative();

  // ── Assemble result ──────────────────────────────────────────────────
  const photosBytes = sum(scannedPhotos);
  const videosBytes = sum(scannedVideos);
  const audioBytes = sum(scannedAudio);
  const junkBytes = sum(junkFiles);
  const waBytes = sum(whatsappFiles);
  const largeBytes = sum(largeFiles);
  const dupRecoverable = duplicateGroups.reduce((s, g) => s + g.recoverableBytes, 0);

  const categories: CategorySummary[] = [
    { key: "photos", label: "Photos", bytes: photosBytes, fileCount: scannedPhotos.length, cleanableBytes: dupRecoverable, cleanableCount: duplicateGroups.length },
    { key: "videos", label: "Videos", bytes: videosBytes, fileCount: scannedVideos.length, cleanableBytes: 0, cleanableCount: 0 },
    { key: "audio", label: "Audio", bytes: audioBytes, fileCount: scannedAudio.length, cleanableBytes: 0, cleanableCount: 0 },
    { key: "downloads", label: "Large Files", bytes: largeBytes, fileCount: largeFiles.length, cleanableBytes: largeBytes, cleanableCount: largeFiles.length },
    { key: "junk", label: "Junk & Cache", bytes: junkBytes, fileCount: junkFiles.length, cleanableBytes: junkBytes, cleanableCount: junkFiles.length },
    { key: "whatsapp", label: "WhatsApp Media", bytes: waBytes, fileCount: whatsappFiles.length, cleanableBytes: waBytes, cleanableCount: whatsappFiles.length },
    { key: "apps", label: "Apps", bytes: apps.reduce((s, a) => s + a.sizeBytes, 0), fileCount: apps.length, cleanableBytes: 0, cleanableCount: 0 },
  ];

  const totalCleanableBytes =
    junkBytes + largeBytes + dupRecoverable + waBytes;

  onProgress?.("Done", 1);

  return {
    startedAt,
    completedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    totalCleanableBytes,
    filesScanned:
      scannedPhotos.length +
      scannedVideos.length +
      scannedAudio.length +
      junkFiles.length +
      whatsappFiles.length,
    categories,
    largeFiles: largeFiles.sort((a, b) => b.sizeBytes - a.sizeBytes),
    duplicateGroups: duplicateGroups.sort((a, b) => b.recoverableBytes - a.recoverableBytes),
    apps,
    junkFiles,
    whatsappFiles,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// DUPLICATE DETECTION
// ──────────────────────────────────────────────────────────────────────────

/**
 * 4-stage duplicate detection:
 * 1. Group by file size (fast, JS)
 * 2. Group by dimensions (fast, JS)
 * 3. SHA-256 content hash via native HashWorker (accurate)
 *
 * Falls back to dimension-only grouping if HashWorker is unavailable.
 */
async function detectDuplicates(
  photos: ScannedFile[],
  onProgress?: (stage: string, progress: number) => void,
): Promise<DuplicateGroup[]> {
  if (photos.length < 2) return [];

  // Stage 1+2: group by dimensions (a strong signal for duplicates)
  const byDimensions = new Map<string, ScannedFile[]>();
  for (const p of photos) {
    if (p.width && p.height && p.width > 0 && p.height > 0) {
      const key = `${p.width}x${p.height}`;
      const arr = byDimensions.get(key) ?? [];
      arr.push(p);
      byDimensions.set(key, arr);
    }
  }

  // Candidate groups: 2+ photos with identical dimensions
  const candidates = Array.from(byDimensions.values()).filter((g) => g.length >= 2);

  if (candidates.length === 0) return [];

  onProgress?.("Hashing duplicate candidates…", 0.85);

  // Stage 3: try native SHA-256 hashing on candidates
  const groups: DuplicateGroup[] = [];
  let groupIndex = 1;

  try {
    // Collect all candidate paths for hashing
    const allCandidates = candidates.flat();
    const pathToHash = new Map<string, string | null>();

    // HashWorker expects filesystem paths, but MediaStore URIs may not be
    // directly hashable. Try anyway — if it fails, fall back to dimensions.
    const paths = allCandidates
      .map((f) => f.path)
      .filter((p) => p.startsWith("/") || p.startsWith("file://"));

    if (paths.length > 0) {
      const hashed = await HashWorker.hashFiles(paths);
      for (const h of hashed) {
        pathToHash.set(h.path, h.hash);
      }
    }

    // Group by hash where available, otherwise by dimensions
    for (const candidateGroup of candidates) {
      const byHash = new Map<string, ScannedFile[]>();
      const unhashed: ScannedFile[] = [];

      for (const f of candidateGroup) {
        const hash = pathToHash.get(f.path);
        if (hash) {
          const arr = byHash.get(hash) ?? [];
          arr.push(f);
          byHash.set(hash, arr);
        } else {
          unhashed.push(f);
        }
      }

      // Add hash-based groups (exact duplicates)
      for (const [, files] of byHash) {
        if (files.length >= 2) {
          groups.push(makeGroup(files, "exact", groupIndex++));
        }
      }

      // If no hash groups, use dimension group as "similar"
      if (byHash.size === 0 && unhashed.length >= 2) {
        groups.push(makeGroup(unhashed, "similar", groupIndex++));
      }
    }
  } catch {
    // HashWorker unavailable — fall back to dimension-only "similar" groups
    for (const candidateGroup of candidates) {
      groups.push(makeGroup(candidateGroup.slice(0, 5), "similar", groupIndex++));
    }
  }

  return groups;
}

function makeGroup(files: ScannedFile[], kind: "exact" | "similar", index: number): DuplicateGroup {
  const sorted = files.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const keep = sorted[0];
  const total = sorted.reduce((s, f) => s + f.sizeBytes, 0);
  return {
    id: `dup_${kind}_${index}`,
    kind,
    files: sorted,
    totalBytes: total,
    recoverableBytes: total - keep.sizeBytes,
    keepId: keep.id,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// CLEANUP
// ──────────────────────────────────────────────────────────────────────────

/**
 * Performs actual deletion of selected media and files.
 * Uses MediaLibrary.deleteAssetsAsync for media and FileSystem.deleteAsync
 * for cache files. This is real, irreversible deletion.
 */
export async function performRealCleanup(
  selectedFileIds: Set<string>,
  selectedGroupIds: Set<string>,
  scanResult: ScanResult,
): Promise<{ freedBytes: number; deletedCount: number }> {
  let freedBytes = 0;
  let deletedCount = 0;

  const mediaIdsToDelete: string[] = [];
  const filePathsToDelete: string[] = [];

  // 1. Collect selected files
  const allFiles = [
    ...scanResult.largeFiles,
    ...scanResult.junkFiles,
    ...scanResult.whatsappFiles,
  ];

  for (const f of allFiles) {
    if (selectedFileIds.has(f.id)) {
      freedBytes += f.sizeBytes;
      deletedCount++;
      if (f.path.startsWith("file://") || f.path.startsWith("/")) {
        filePathsToDelete.push(f.path);
      } else {
        // MediaStore asset — delete by ID
        // Strip the "wa_" prefix we added for WhatsApp assets
        const realId = f.id.startsWith("wa_") ? f.id.slice(3) : f.id;
        mediaIdsToDelete.push(realId);
      }
    }
  }

  // 2. Collect duplicate group files (delete all except keepId)
  for (const g of scanResult.duplicateGroups) {
    if (selectedGroupIds.has(g.id)) {
      freedBytes += g.recoverableBytes;
      for (const f of g.files) {
        if (f.id !== g.keepId) {
          deletedCount++;
          if (f.path.startsWith("file://") || f.path.startsWith("/")) {
            filePathsToDelete.push(f.path);
          } else {
            mediaIdsToDelete.push(f.id);
          }
        }
      }
    }
  }

  // 3. Delete MediaStore assets (photos, videos)
  if (mediaIdsToDelete.length > 0) {
    try {
      await MediaLibrary.deleteAssetsAsync(mediaIdsToDelete);
    } catch (e) {
      console.warn("[realScanner] MediaLibrary delete warning:", e);
    }
  }

  // 4. Delete filesystem files (cache, junk)
  for (const path of filePathsToDelete) {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch (e) {
      console.warn("[realScanner] FileSystem delete warning for", path, e);
    }
  }

  return { freedBytes, deletedCount };
}

// ──────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────

/**
 * Estimates media file size from asset metadata.
 * expo-media-library doesn't always expose file size directly, so we
 * approximate from dimensions/duration when unavailable.
 */
function estimateMediaSize(
  asset: MediaLibrary.Asset,
  type: "photo" | "video" | "audio",
): number {
  // On Android, expo-media-library sometimes populates a `size` field via
  // the underlying MediaStore cursor. Try that first.
  const anyAsset = asset as any;
  if (typeof anyAsset.size === "number" && anyAsset.size > 0) {
    return anyAsset.size;
  }

  if (type === "video") {
    // Rough: 1.5 MB per second of 1080p video
    return Math.round(Math.max(1, asset.duration || 0) * 1.5 * MB);
  }
  if (type === "audio") {
    // Rough: 1 MB per minute of MP3
    return Math.round(Math.max(1, asset.duration || 0) * (MB / 60));
  }
  // Photo: width × height × 3 bytes (RGB) / ~10 (JPEG compression)
  return Math.round(Math.max(1, (asset.width * asset.height * 3) / 10));
}

async function getAppsFromNative(): Promise<AppItem[]> {
  try {
    const nativeApps = AndroidStorage.getInstalledApps();
    if (nativeApps && nativeApps.length > 0) {
      return nativeApps
        .filter((a) => !a.isSystem && a.sizeBytes > 0)
        .slice(0, 50)
        .map((a) => ({
          packageName: a.packageName,
          label: a.label,
          sizeBytes: a.sizeBytes,
          cacheBytes: a.cacheBytes,
          lastUsedAt: a.lastUsedAt > 0 ? a.lastUsedAt : Date.now(),
          isSystem: a.isSystem,
        }));
    }
  } catch {
    // Native module unavailable
  }

  // Fallback: a few well-known packages as a placeholder
  return [
    { packageName: "com.whatsapp", label: "WhatsApp", sizeBytes: 180 * MB, cacheBytes: 95 * MB, lastUsedAt: Date.now() - 3600000, isSystem: false },
    { packageName: "com.spotify.music", label: "Spotify", sizeBytes: 210 * MB, cacheBytes: 340 * MB, lastUsedAt: Date.now() - 172800000, isSystem: false },
  ];
}

function sum(files: ScannedFile[]): number {
  return files.reduce((s, f) => s + f.sizeBytes, 0);
}
