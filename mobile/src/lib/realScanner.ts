import { recoverPhotoHashes } from "./photoHashRecovery.ts";
import { uniqueFiles } from "./fileIdentity.ts";
import { withStorageOperation } from "./storageOperation";
import { buildDuplicateGroups } from "./duplicateGrouping.ts";
import { KEYS, storage } from "./storage";
import type { StorageCategory, StorageItem } from "@/db/schema";
import { StorageIndexService } from "@/db/StorageIndexService";
import { DeleteCoordinator } from "@/services/DeleteCoordinator";
import { AndroidStorage, HashWorker } from "android-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import { isSafeToCleanAutomatically } from "./safety";
import type {
  AppItem,
  CategoryKey,
  CategorySummary,
  DuplicateGroup,
  ScannedFile,
  ScanResult,
  StorageSummary,
} from "./types";

const MB = 1024 ** 2;

// ──────────────────────────────────────────────────────────────────────────
// STORAGE SUMMARY (SQLITE-DRIVEN)
// ──────────────────────────────────────────────────────────────────────────

const CATEGORY_DISPLAY_LABELS: Record<string, string> = {
  photos: "Photos",
  videos: "Videos",
  apps: "Apps",
  audio: "Audio",
  documents: "Documents",
  downloads: "Downloads & Files",
  junk: "Junk & Cache",
  duplicates: "Duplicate photos",
  whatsapp: "WhatsApp media",
  apks: "Installation packages",
  other: "Other files",
};

/**
 * Returns real on-device storage summary backed by Android StatFs and SQLite.
 * Zero fake estimates, zero synthetic percentages.
 */
export async function getRealStorageSummary(): Promise<StorageSummary> {
  let totalBytes = 0;
  let usedBytes = 0;
  let freeBytes = 0;

  // 1. Try native module StatFs
  try {
    const native = AndroidStorage.getStorageStats();
    if (native && native.totalBytes > 0) {
      totalBytes = native.totalBytes;
      usedBytes = native.usedBytes;
      freeBytes = native.freeBytes;
    }
  } catch {
    // Native module not available
  }

  // 2. Fall back to FileSystem
  if (totalBytes === 0) {
    try {
      totalBytes = await FileSystem.getTotalDiskCapacityAsync();
      freeBytes = await FileSystem.getFreeDiskStorageAsync();
      usedBytes = Math.max(0, totalBytes - freeBytes);
    } catch (err) {
      console.warn("[realScanner] FileSystem capacity error:", err);
    }
  }

  // 3. Fallback mock if completely unavailable
  if (totalBytes === 0) {
    throw new Error(
      "Device storage is unavailable. Please retry on an Android device.",
    );
  }

  // 4. Installed Apps
  const apps = await getAppsFromNative();
  const appsBytes = apps.reduce((s, a) => s + a.sizeBytes, 0);

  // 5. Query SQLite for true scanned aggregates
  const dbAggregates = StorageIndexService.getDashboardAggregates(
    { totalBytes, usedBytes, freeBytes },
    { count: apps.length, bytes: appsBytes },
  );

  const usedPercent =
    totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

  const categories: CategorySummary[] = dbAggregates.categories.map((c) => ({
    key: c.category as CategoryKey,
    label: CATEGORY_DISPLAY_LABELS[c.category] ?? c.category,
    bytes: c.totalBytes,
    fileCount: c.fileCount,
    cleanableBytes: c.cleanableBytes,
    cleanableCount: c.fileCount,
  }));

  // Append derived dashboard categories
  categories.push({
    key: "junk",
    label: "Junk & Cache",
    bytes: dbAggregates.junkFilesBytes,
    fileCount: dbAggregates.junkFilesCount,
    cleanableBytes: dbAggregates.junkFilesBytes,
    cleanableCount: dbAggregates.junkFilesCount,
  });

  categories.push({
    key: "whatsapp",
    label: "WhatsApp Media",
    bytes: dbAggregates.whatsappFilesBytes,
    fileCount: dbAggregates.whatsappFilesCount,
    cleanableBytes: dbAggregates.whatsappFilesBytes,
    cleanableCount: dbAggregates.whatsappFilesCount,
  });

  categories.push({
    key: "duplicates",
    label: "Duplicate photos",
    bytes: dbAggregates.duplicateRecoverableBytes * 2,
    fileCount: dbAggregates.duplicateFilesCount,
    cleanableBytes: dbAggregates.duplicateRecoverableBytes,
    cleanableCount: dbAggregates.duplicateGroupsCount,
  });

  categories.push({
    key: "apps",
    label: "Apps",
    bytes: appsBytes,
    fileCount: apps.length,
    cleanableBytes: apps.reduce((s, a) => s + a.cacheBytes, 0),
    cleanableCount: apps.filter((a) => a.cacheBytes > 0).length,
  });

  return {
    totalBytes,
    usedBytes,
    freeBytes,
    usedPercent,
    cleanableBytes: dbAggregates.totalCleanableBytes,
    categories,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// SCAN ENGINE (INGESTS DIRECTLY INTO SQLITE)
// ──────────────────────────────────────────────────────────────────────────

export interface RealScanOptions {
  includeDuplicates?: boolean;
  requestPermissions?: boolean;
}

export async function runRealScan(
  onProgress?: (stage: string, progress: number) => void,
  options?: RealScanOptions,
): Promise<ScanResult> {
  return withStorageOperation("scan", () => scanStorage(onProgress, options));
}

async function scanStorage(
  onProgress?: (stage: string, progress: number) => void,
  options?: RealScanOptions,
): Promise<ScanResult> {
  const startedAt = Date.now();
  // Clear previous deletion index so stale items from old scans don't accumulate

  // ── Stage 1: Permissions ─────────────────────────────────────────────
  onProgress?.("Checking device permissions…", 0.05);

  let permissionGranted = false;
  try {
    let { status } = await MediaLibrary.getPermissionsAsync();
    if (status !== "granted" && options?.requestPermissions !== false) {
      const res = await MediaLibrary.requestPermissionsAsync();
      status = res.status;
    }
    permissionGranted = status === "granted";
  } catch (e) {
    console.warn("[realScanner] Permission request error:", e);
  }

  // ── Stage 2: Media Scanner (Photos, Videos, Audio) ─────────────────────
  onProgress?.("Scanning photos & gallery…", 0.15);

  const storageItems: StorageItem[] = [];
  const scannedPhotos: ScannedFile[] = [];
  let videoCount = 0,
    videosBytes = 0;
  let audioCount = 0,
    audioBytes = 0;
  let downloadCount = 0,
    downloadsBytes = 0;
  let photoCount = 0,
    photosBytes = 0;
  const whatsappFiles: ScannedFile[] = [];
  const junkFiles: ScannedFile[] = [];
  let duplicateGroups: DuplicateGroup[] = [];
  let duplicateCoverage: ScanResult["duplicateCoverage"];

  if (permissionGranted) {
    // Photos (full un-capped cursor pagination)
    try {
      let hasNext = true;
      let afterCursor: string | undefined = undefined;
      let count = 0;
      while (hasNext) {
        const photoResult = await MediaLibrary.getAssetsAsync({
          first: 300,
          after: afterCursor,
          mediaType: ["photo"],
          sortBy: [MediaLibrary.SortBy.modificationTime],
        });
        const metadata = new Map(
          (
            await AndroidStorage.getMediaMetadata(
              photoResult.assets.map((a) => a.uri),
            )
          ).map((m) => [m.uri, m]),
        );
        for (const asset of photoResult.assets) {
          const actual = metadata.get(asset.uri);
          const sizeBytes =
            actual?.sizeBytes ?? estimateMediaSize(asset, "photo");
          const ext =
            (asset.filename
              ? asset.filename.split(".").pop()?.toLowerCase()
              : "jpg") || "jpg";
          const file: ScannedFile = {
            id: asset.id,
            path: actual?.path || asset.uri,
            uri: asset.uri,
            name: asset.filename || `photo_${asset.id}.jpg`,
            category: "photos",
            sizeBytes,
            mimeType:
              actual?.mimeType || (ext === "png" ? "image/png" : "image/jpeg"),
            modifiedAt: asset.modificationTime || asset.creationTime,
            width: asset.width,
            height: asset.height,
            source: "Camera",
          };
          photoCount++;
          photosBytes += file.sizeBytes;
          if (options?.includeDuplicates) scannedPhotos.push(file);

          storageItems.push({
            id: asset.id,
            uri: asset.uri,
            path:
              actual?.path ||
              (asset.uri.startsWith("file://")
                ? asset.uri.replace("file://", "")
                : undefined),
            name: file.name,
            sizeBytes,
            mimeType: file.mimeType,
            extension: ext,
            category: "photos",
            source: "media_store",
            modifiedAt: file.modifiedAt,
            isLarge: sizeBytes >= 10 * MB,
            isJunk: false,
            canOpen: true,
            canPreview: true,
            canDelete: true,
            requiresPermission: true,
            width: asset.width,
            height: asset.height,
          });
        }
        count += photoResult.assets.length;
        hasNext = photoResult.hasNextPage && photoResult.assets.length > 0;
        afterCursor = photoResult.endCursor;
        if (count % 600 === 0) {
          onProgress?.(
            `Indexing photos (${count.toLocaleString()} found)…`,
            0.15,
          );
        }
      }
    } catch (e) {
      console.warn("[realScanner] Photo scan error:", e);
    }

    onProgress?.("Scanning videos…", 0.3);

    // Videos (exact physical size from native MediaStore with un-capped pagination fallback)
    try {
      const nativeVideos = await AndroidStorage.scanMediaStoreVideos();
      if (nativeVideos && nativeVideos.length > 0) {
        for (const nv of nativeVideos) {
          const ext =
            (nv.name ? nv.name.split(".").pop()?.toLowerCase() : "mp4") ||
            "mp4";
          const file: ScannedFile = {
            id: nv.id,
            path: nv.path,
            uri: nv.uri,
            name: nv.name,
            category: "videos",
            sizeBytes: nv.sizeBytes,
            mimeType: nv.mimeType || "video/mp4",
            modifiedAt: nv.modifiedAt,
            width: nv.width,
            height: nv.height,
            durationSec: nv.durationSec,
            source: "Camera",
          };
          videoCount++;
          videosBytes += file.sizeBytes;

          storageItems.push({
            id: nv.id,
            uri: nv.uri,
            path: nv.path.startsWith("file://")
              ? nv.path.replace("file://", "")
              : nv.path,
            name: file.name,
            sizeBytes: nv.sizeBytes,
            mimeType: nv.mimeType || "video/mp4",
            extension: ext,
            category: "videos",
            source: "media_store",
            modifiedAt: file.modifiedAt,
            isLarge: nv.sizeBytes >= 10 * MB,
            isJunk: false,
            canOpen: true,
            canPreview: true,
            canDelete: true,
            requiresPermission: true,
            width: nv.width,
            height: nv.height,
            durationMs: Math.round(nv.durationSec * 1000),
          });
        }
      } else {
        let hasNext = true;
        let afterCursor: string | undefined = undefined;
        let count = 0;
        while (hasNext) {
          const videoResult = await MediaLibrary.getAssetsAsync({
            first: 200,
            after: afterCursor,
            mediaType: ["video"],
            sortBy: [MediaLibrary.SortBy.modificationTime],
          });
          const metadata = new Map(
            (
              await AndroidStorage.getMediaMetadata(
                videoResult.assets.map((a) => a.uri),
              )
            ).map((m) => [m.uri, m]),
          );
          for (const asset of videoResult.assets) {
            const actual = metadata.get(asset.uri);
            const sizeBytes =
              actual?.sizeBytes ?? estimateMediaSize(asset, "video");
            const ext =
              (asset.filename
                ? asset.filename.split(".").pop()?.toLowerCase()
                : "mp4") || "mp4";
            const durSec =
              (asset.duration || 0) > 1000
                ? (asset.duration || 0) / 1000
                : asset.duration || 0;
            const file: ScannedFile = {
              id: asset.id,
              path: actual?.path || asset.uri,
              uri: asset.uri,
              name: asset.filename || `video_${asset.id}.mp4`,
              category: "videos",
              sizeBytes,
              mimeType: "video/mp4",
              modifiedAt: asset.modificationTime || asset.creationTime,
              width: asset.width,
              height: asset.height,
              durationSec: durSec,
              source: "Camera",
            };
            videoCount++;
            videosBytes += file.sizeBytes;

            storageItems.push({
              id: asset.id,
              uri: asset.uri,
              path:
                actual?.path ||
                (asset.uri.startsWith("file://")
                  ? asset.uri.replace("file://", "")
                  : undefined),
              name: file.name,
              sizeBytes,
              mimeType: "video/mp4",
              extension: ext,
              category: "videos",
              source: "media_store",
              modifiedAt: file.modifiedAt,
              isLarge: sizeBytes >= 10 * MB,
              isJunk: false,
              canOpen: true,
              canPreview: true,
              canDelete: true,
              requiresPermission: true,
              width: asset.width,
              height: asset.height,
              durationMs: Math.round(durSec * 1000),
            });
          }
          count += videoResult.assets.length;
          hasNext = videoResult.hasNextPage && videoResult.assets.length > 0;
          afterCursor = videoResult.endCursor;
          if (count % 300 === 0) {
            onProgress?.(
              `Indexing videos (${count.toLocaleString()} found)…`,
              0.35,
            );
          }
        }
      }
    } catch (e) {
      console.warn("[realScanner] Video scan error:", e);
    }

    onProgress?.("Scanning audio & music…", 0.45);

    // Audio (full un-capped cursor pagination)
    try {
      let hasNext = true;
      let afterCursor: string | undefined = undefined;
      while (hasNext) {
        const audioResult = await MediaLibrary.getAssetsAsync({
          first: 200,
          after: afterCursor,
          mediaType: ["audio"],
          sortBy: [MediaLibrary.SortBy.modificationTime],
        });
        const metadata = new Map(
          (
            await AndroidStorage.getMediaMetadata(
              audioResult.assets.map((a) => a.uri),
            )
          ).map((m) => [m.uri, m]),
        );
        for (const asset of audioResult.assets) {
          const actual = metadata.get(asset.uri);
          const sizeBytes =
            actual?.sizeBytes ?? estimateMediaSize(asset, "audio");
          const ext =
            (asset.filename
              ? asset.filename.split(".").pop()?.toLowerCase()
              : "mp3") || "mp3";
          const file: ScannedFile = {
            id: asset.id,
            path: actual?.path || asset.uri,
            uri: asset.uri,
            name: asset.filename || `audio_${asset.id}.mp3`,
            category: "audio",
            sizeBytes,
            mimeType: "audio/mpeg",
            modifiedAt: asset.modificationTime || asset.creationTime,
            durationSec: asset.duration,
            source: "Music",
          };
          audioCount++;
          audioBytes += file.sizeBytes;

          storageItems.push({
            id: asset.id,
            uri: asset.uri,
            path:
              actual?.path ||
              (asset.uri.startsWith("file://")
                ? asset.uri.replace("file://", "")
                : undefined),
            name: file.name,
            sizeBytes,
            mimeType: "audio/mpeg",
            extension: ext,
            category: "audio",
            source: "media_store",
            modifiedAt: file.modifiedAt,
            isLarge: sizeBytes >= 10 * MB,
            isJunk: false,
            canOpen: true,
            canPreview: false,
            canDelete: true,
            requiresPermission: true,
            durationMs: (asset.duration || 0) * 1000,
          });
        }
        hasNext = audioResult.hasNextPage && audioResult.assets.length > 0;
        afterCursor = audioResult.endCursor;
      }
    } catch (e) {
      console.warn("[realScanner] Audio scan error:", e);
    }
  }

  // ── Stage 3: Downloads & Public Files ────────────────────────────────
  onProgress?.("Scanning downloaded files…", 0.55);

  try {
    const rawDownloads = await AndroidStorage.scanDownloads();
    for (const d of rawDownloads) {
      const ext = d.name.split(".").pop()?.toLowerCase();
      const isApk = ext === "apk";
      const isDoc = [
        "pdf",
        "doc",
        "docx",
        "xls",
        "xlsx",
        "txt",
        "ppt",
        "pptx",
      ].includes(ext || "");
      const file: ScannedFile = {
        id: d.id,
        path: d.path,
        uri: `file://${d.path}`,
        name: d.name,
        category: isApk ? "apks" : isDoc ? "documents" : "downloads",
        sizeBytes: d.sizeBytes,
        mimeType:
          d.mimeType ||
          (isApk
            ? "application/vnd.android.package-archive"
            : "application/octet-stream"),
        modifiedAt: d.modifiedAt || Date.now(),
        source: "Downloads",
      };
      downloadCount++;
      downloadsBytes += file.sizeBytes;

      storageItems.push({
        id: d.id || d.path,
        uri: `file://${d.path}`,
        path: d.path,
        name: d.name,
        sizeBytes: d.sizeBytes,
        mimeType: file.mimeType,
        extension: ext,
        category: file.category as StorageCategory,
        source: "filesystem",
        modifiedAt: file.modifiedAt,
        isLarge: d.sizeBytes >= 10 * MB,
        isJunk: isApk,
        junkReason: isApk ? "Obsolete APK installer" : undefined,
        canOpen: true,
        canPreview: false,
        canDelete: true,
        requiresPermission: false,
      });
    }
  } catch (e) {
    console.warn("[realScanner] Downloads scan error:", e);
  }

  // ── Stage 4: WhatsApp Media ──────────────────────────────────────────
  onProgress?.("Scanning WhatsApp media…", 0.65);

  try {
    const rawWa = await AndroidStorage.scanWhatsAppMedia();
    if (rawWa && rawWa.length > 0) {
      for (const w of rawWa) {
        const ext = w.name.split(".").pop()?.toLowerCase();
        const isVid =
          w.category === "videos" || ["mp4", "mkv", "3gp"].includes(ext || "");
        const isAud =
          w.category === "audio" ||
          ["opus", "m4a", "aac", "mp3", "ogg"].includes(ext || "");
        const isDoc =
          w.category === "documents" ||
          ["pdf", "doc", "docx", "zip"].includes(ext || "");
        const category: StorageCategory = isVid
          ? "videos"
          : isAud
            ? "audio"
            : isDoc
              ? "documents"
              : "photos";

        const isSent = Boolean(
          w.isSent ||
          (w.path && (w.path.includes("/Sent/") || w.path.includes("/sent/"))),
        );
        const file: ScannedFile = {
          id: w.id || w.path,
          path: w.path,
          uri: `file://${w.path}`,
          name: w.name,
          category: category as any,
          sizeBytes: w.sizeBytes,
          mimeType:
            w.mimeType ||
            (isVid ? "video/mp4" : isAud ? "audio/ogg" : "image/jpeg"),
          modifiedAt: w.modifiedAt || Date.now(),
          source: isSent ? "WhatsApp Sent" : w.subType || "WhatsApp",
        };
        whatsappFiles.push(file);

        storageItems.push({
          id: w.id || w.path,
          uri: `file://${w.path}`,
          path: w.path,
          name: w.name,
          sizeBytes: w.sizeBytes,
          mimeType: file.mimeType,
          extension: ext,
          category,
          source: "whatsapp",
          modifiedAt: file.modifiedAt,
          isLarge: w.sizeBytes >= 10 * MB,
          isJunk: false,
          canOpen: true,
          canPreview: category === "photos" || category === "videos",
          canDelete: true,
          requiresPermission: false,
          whatsappType: isVid ? "video" : "image",
          isSent,
        });
      }
    }
  } catch (e) {
    console.warn("[realScanner] WhatsApp scan error:", e);
  }

  // MediaLibrary fallback for WhatsApp if native file scan returned empty
  if (whatsappFiles.length === 0 && permissionGranted) {
    try {
      const albums = await MediaLibrary.getAlbumsAsync();
      for (const album of albums) {
        if (/whatsapp/i.test(album.title)) {
          const albumAssets = await MediaLibrary.getAssetsAsync({
            album,
            first: 200,
            mediaType: ["photo", "video"],
            sortBy: [MediaLibrary.SortBy.modificationTime],
          });
          const metadata = new Map(
            (
              await AndroidStorage.getMediaMetadata(
                albumAssets.assets.map((a) => a.uri),
              )
            ).map((m) => [m.uri, m]),
          );
          for (const asset of albumAssets.assets) {
            const actual = metadata.get(asset.uri);
            const isVid = asset.mediaType === "video";
            const sizeBytes =
              actual?.sizeBytes ??
              estimateMediaSize(asset, isVid ? "video" : "photo");
            const ext =
              (asset.filename
                ? asset.filename.split(".").pop()?.toLowerCase()
                : isVid
                  ? "mp4"
                  : "jpg") || (isVid ? "mp4" : "jpg");
            const isSent =
              /sent/i.test(asset.uri) || /sent/i.test(asset.filename ?? "");
            const file: ScannedFile = {
              id: `wa_${asset.id}`,
              path: actual?.path || asset.uri,
              uri: asset.uri,
              name:
                asset.filename ||
                (isVid
                  ? `wa_video_${asset.id}.mp4`
                  : `wa_photo_${asset.id}.jpg`),
              category: isVid ? "videos" : "photos",
              sizeBytes,
              mimeType: isVid ? "video/mp4" : "image/jpeg",
              modifiedAt: asset.modificationTime || asset.creationTime,
              source: isSent ? "WhatsApp Sent" : album.title || "WhatsApp",
            };
            whatsappFiles.push(file);

            storageItems.push({
              id: `wa_${asset.id}`,
              uri: asset.uri,
              path:
                actual?.path ||
                (asset.uri.startsWith("file://")
                  ? asset.uri.replace("file://", "")
                  : undefined),
              name: file.name,
              sizeBytes,
              mimeType: file.mimeType,
              extension: ext,
              category: isVid ? "videos" : "photos",
              source: "whatsapp",
              modifiedAt: file.modifiedAt,
              isLarge: sizeBytes >= 10 * MB,
              isJunk: false,
              canOpen: true,
              canPreview: true,
              canDelete: true,
              requiresPermission: true,
              whatsappType: isVid ? "video" : "image",
              isSent,
            });
          }
        }
      }
    } catch (waErr) {
      console.warn(
        "[realScanner] MediaLibrary WhatsApp album scan error:",
        waErr,
      );
    }
  }

  // ── Stage 5: App cache, Obsolete APKs & Junk ──────────────────────────
  onProgress?.("Inspecting junk & cache files…", 0.75);

  try {
    const rawJunk = await AndroidStorage.scanJunkFiles();
    for (const j of rawJunk) {
      const ext = j.name.split(".").pop()?.toLowerCase();
      const isApk = ext === "apk" || j.subType === "apk";
      const isThumb = j.subType === "thumbnail" || ext === "thumbnails";
      const isTemp =
        j.subType === "temp" ||
        j.subType === "log" ||
        ["tmp", "temp", "log"].includes(ext || "");
      const junkType = isApk
        ? "apk"
        : isThumb
          ? "thumbnail"
          : isTemp
            ? "temp"
            : "cache";

      const file: ScannedFile = {
        id: j.id || j.path,
        path: j.path,
        uri: `file://${j.path}`,
        name: j.name,
        category: isApk ? "apks" : "junk",
        sizeBytes: j.sizeBytes,
        mimeType: j.mimeType || "application/octet-stream",
        modifiedAt: j.modifiedAt || Date.now(),
        source: isApk
          ? "Obsolete APK"
          : isThumb
            ? "Thumbnails"
            : isTemp
              ? "Temp / Log"
              : "App Cache",
      };
      junkFiles.push(file);

      storageItems.push({
        id: j.id || j.path,
        uri: `file://${j.path}`,
        path: j.path,
        name: j.name,
        sizeBytes: j.sizeBytes,
        mimeType: file.mimeType,
        extension: ext,
        category: isApk ? "apks" : "other",
        source: "filesystem",
        modifiedAt: file.modifiedAt,
        isLarge: j.sizeBytes >= 10 * MB,
        isJunk: true,
        junkType,
        junkReason: file.source || "Cache file",
        canOpen: isApk,
        canPreview: false,
        canDelete: true,
        requiresPermission: false,
      });
    }

    if (FileSystem.cacheDirectory) {
      const entries = await FileSystem.readDirectoryAsync(
        FileSystem.cacheDirectory,
      );
      for (const entry of entries.slice(0, 100)) {
        const fullPath = `${FileSystem.cacheDirectory}${entry}`;
        try {
          const info = await FileSystem.getInfoAsync(fullPath);
          if (info.exists && !info.isDirectory && info.size > 0) {
            junkFiles.push({
              id: `cache_${entry}`,
              path: fullPath,
              uri: fullPath,
              name: entry,
              category: "junk",
              sizeBytes: info.size,
              mimeType: "application/octet-stream",
              modifiedAt: info.modificationTime || Date.now(),
              source: "App Cache",
            });
            storageItems.push({
              id: `cache_${entry}`,
              uri: fullPath,
              path: fullPath,
              name: entry,
              sizeBytes: info.size,
              category: "other",
              source: "filesystem",
              modifiedAt: info.modificationTime || Date.now(),
              isLarge: false,
              isJunk: true,
              junkType: "cache",
              junkReason: "App Cache",
              canOpen: false,
              canPreview: false,
              canDelete: true,
              requiresPermission: false,
            });
          }
        } catch {}
      }
    }
    // Empty folders
    try {
      const rawEmpty = await AndroidStorage.scanEmptyFolders();
      for (const ef of rawEmpty) {
        const file: ScannedFile = {
          id: ef.id,
          path: ef.path,
          uri: `file://${ef.path}`,
          name: ef.name,
          category: "junk",
          sizeBytes: ef.sizeBytes || 4096,
          mimeType: "inode/directory",
          modifiedAt: ef.modifiedAt || Date.now(),
          source: "Empty Folder",
        };
        junkFiles.push(file);
        storageItems.push({
          id: ef.id,
          uri: `file://${ef.path}`,
          path: ef.path,
          name: ef.name,
          sizeBytes: file.sizeBytes,
          category: "other",
          source: "filesystem",
          modifiedAt: file.modifiedAt,
          isLarge: false,
          isJunk: true,
          junkType: "empty_folder",
          junkReason: "Empty folder",
          canOpen: false,
          canPreview: false,
          canDelete: true,
          requiresPermission: false,
        });
      }
    } catch {}

    // Trashed media (.trashed-* files)
    try {
      const rawTrash = await AndroidStorage.scanTrashedFiles();
      for (const tf of rawTrash) {
        const file: ScannedFile = {
          id: tf.id,
          path: tf.path,
          uri: `file://${tf.path}`,
          name: tf.name,
          category: "junk",
          sizeBytes: tf.sizeBytes,
          mimeType: "application/octet-stream",
          modifiedAt: tf.modifiedAt || Date.now(),
          source: "System Trash",
        };
        junkFiles.push(file);
        storageItems.push({
          id: tf.id,
          uri: `file://${tf.path}`,
          path: tf.path,
          name: tf.name,
          sizeBytes: file.sizeBytes,
          category: "other",
          source: "filesystem",
          modifiedAt: file.modifiedAt,
          isLarge: tf.sizeBytes >= 10 * MB,
          isJunk: true,
          junkType: "trash",
          junkReason: "System Trash",
          canOpen: false,
          canPreview: false,
          canDelete: true,
          requiresPermission: false,
        });
      }
    } catch {}

    // Browser cache & temp downloads
    try {
      const rawBrowser = await AndroidStorage.scanBrowserCaches();
      for (const bf of rawBrowser) {
        const file: ScannedFile = {
          id: bf.id,
          path: bf.path,
          uri: `file://${bf.path}`,
          name: bf.name,
          category: "junk",
          sizeBytes: bf.sizeBytes,
          mimeType: "application/octet-stream",
          modifiedAt: bf.modifiedAt || Date.now(),
          source: "Browser Cache",
        };
        junkFiles.push(file);
        storageItems.push({
          id: bf.id,
          uri: `file://${bf.path}`,
          path: bf.path,
          name: bf.name,
          sizeBytes: file.sizeBytes,
          category: "other",
          source: "filesystem",
          modifiedAt: file.modifiedAt,
          isLarge: false,
          isJunk: true,
          junkType: "browser",
          junkReason: "Browser temporary data",
          canOpen: false,
          canPreview: false,
          canDelete: true,
          requiresPermission: false,
        });
      }
    } catch {}
    // Dedicated comprehensive APK scan (detects all installed & obsolete APKs across device)
    try {
      const rawApks = await AndroidStorage.scanApkFiles();
      for (const a of rawApks) {
        const isInstalled = Boolean(a.isInstalled);
        const displayName = a.appLabel ? `${a.appLabel} (${a.name})` : a.name;
        const file: ScannedFile = {
          id: a.id || a.path,
          path: a.path,
          uri: `file://${a.path}`,
          name: displayName,
          category: "apks",
          sizeBytes: a.sizeBytes,
          mimeType: "application/vnd.android.package-archive",
          modifiedAt: a.modifiedAt || Date.now(),
          source: isInstalled ? "Installed APK" : "Obsolete APK",
        };
        if (!junkFiles.some((j) => j.path === a.path || j.id === file.id)) {
          junkFiles.push(file);
          storageItems.push({
            id: file.id,
            uri: file.uri || `file://${a.path}`,
            path: a.path,
            name: file.name,
            sizeBytes: a.sizeBytes,
            mimeType: file.mimeType,
            extension: "apk",
            category: "apks",
            source: "filesystem",
            modifiedAt: file.modifiedAt,
            isLarge: a.sizeBytes >= 10 * MB,
            isJunk: true,
            junkType: "apk",
            junkReason: isInstalled
              ? "Installed package installation file"
              : "Obsolete package installation file",
            canOpen: true,
            canPreview: false,
            canDelete: true,
            requiresPermission: false,
          });
        }
      }
    } catch (apkErr) {
      console.warn("[realScanner] APK scan error:", apkErr);
    }
  } catch (e) {
    console.warn("[realScanner] Junk scan error:", e);
  }

  // ── Apps from native module ──────────────────────────────────────────
  const apps = await getAppsFromNative();

  // ── Stage 6: Duplicate Photo Detection ────────────────────────────────
  if (options?.includeDuplicates === true && scannedPhotos.length >= 2) {
    onProgress?.("Detecting duplicate photos…", 0.85);
    try {
      duplicateGroups = await detectDuplicates(
        scannedPhotos,
        onProgress,
        (coverage) => {
          duplicateCoverage = coverage;
        },
      );
      scannedPhotos.length = 0;
      const groupIds = new Map<string, string>();
      for (const group of duplicateGroups)
        for (const file of group.files) groupIds.set(file.id, group.id);
      for (const item of storageItems)
        item.duplicateGroupId = groupIds.get(item.id);
    } catch (e) {
      console.warn("[realScanner] Duplicate detection error:", e);
      throw e; // Preserve the previous index/report when comparison fails.
    }
  } else {
    onProgress?.("Finalizing safe scan…", 0.88);
  }

  // ── Zero-Item Result (Permission Denied / Fresh Device) ────────────────
  if (storageItems.length === 0) {
    if (!permissionGranted && !AndroidStorage.isExternalStorageManager()) {
      throw new Error(
        "Allow photo access or all files access in Android Settings to scan your storage.",
      );
    }
    await StorageIndexService.replaceItemsAsync([]);

    onProgress?.("Done", 1);
    return {
      startedAt,
      completedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      totalCleanableBytes: 0,
      filesScanned: 0,
      categories: [
        {
          key: "photos",
          label: "Photos",
          bytes: 0,
          fileCount: 0,
          cleanableBytes: 0,
          cleanableCount: 0,
        },
        {
          key: "videos",
          label: "Videos",
          bytes: 0,
          fileCount: 0,
          cleanableBytes: 0,
          cleanableCount: 0,
        },
        {
          key: "downloads",
          label: "Downloads & Files",
          bytes: 0,
          fileCount: 0,
          cleanableBytes: 0,
          cleanableCount: 0,
        },
        {
          key: "junk",
          label: "Junk & Cache",
          bytes: 0,
          fileCount: 0,
          cleanableBytes: 0,
          cleanableCount: 0,
        },
        {
          key: "whatsapp",
          label: "WhatsApp Media",
          bytes: 0,
          fileCount: 0,
          cleanableBytes: 0,
          cleanableCount: 0,
        },
        {
          key: "audio",
          label: "Audio",
          bytes: 0,
          fileCount: 0,
          cleanableBytes: 0,
          cleanableCount: 0,
        },
        {
          key: "apps",
          label: "Apps",
          bytes: apps.reduce((s, a) => s + a.sizeBytes, 0),
          fileCount: apps.length,
          cleanableBytes: 0,
          cleanableCount: 0,
        },
      ],
      allPhotos: [],
      allVideos: [],
      allAudio: [],
      allDownloads: [],
      obsoleteApks: [],
      largeFiles: [],
      duplicateGroups: [],
      apps,
      junkFiles: [],
      whatsappFiles: [],
    };
  }

  // ── Ingest all items into SQLite Index ─────────────────────────────────
  onProgress?.("Indexing into database…", 0.92);
  await StorageIndexService.replaceItemsAsync(storageItems, (count) => {
    onProgress?.(
      `Saving file index (${count.toLocaleString()} / ${storageItems.length.toLocaleString()})…`,
      0.92 + (0.05 * count) / storageItems.length,
    );
  });

  onProgress?.("Finalizing report…", 0.98);

  const obsoleteApks = junkFiles.filter(
    (j) =>
      j.name.toLowerCase().endsWith(".apk") ||
      j.category === "apks" ||
      j.source === "Obsolete APK" ||
      j.source === "Installed APK",
  );

  // Release photo enumeration references before reporting; groups retain only matches.
  scannedPhotos.length = 0;
  const junkBytes = sum(junkFiles);
  const waBytes = sum(whatsappFiles);
  const dupRecoverable = duplicateGroups.reduce(
    (s, g) => s + g.recoverableBytes,
    0,
  );
  const safeJunk = junkFiles.filter(isSafeToCleanAutomatically);
  const safeJunkBytes = sum(safeJunk);

  const categories: CategorySummary[] = (
    [
      {
        key: "photos",
        label: "Photos",
        bytes: photosBytes,
        fileCount: photoCount,
        cleanableBytes: dupRecoverable,
        cleanableCount: duplicateGroups.length,
      },
      {
        key: "videos",
        label: "Videos",
        bytes: videosBytes,
        fileCount: videoCount,
        cleanableBytes: 0,
        cleanableCount: 0,
      },
      {
        key: "downloads",
        label: "Downloads & Files",
        bytes: downloadsBytes,
        fileCount: downloadCount,
        cleanableBytes: 0,
        cleanableCount: 0,
      },
      {
        key: "junk",
        label: "Junk & Cache",
        bytes: junkBytes,
        fileCount: junkFiles.length,
        cleanableBytes: safeJunkBytes,
        cleanableCount: safeJunk.length,
      },
      {
        key: "whatsapp",
        label: "WhatsApp Media",
        bytes: waBytes,
        fileCount: whatsappFiles.length,
        cleanableBytes: 0,
        cleanableCount: 0,
      },
      {
        key: "audio",
        label: "Audio",
        bytes: audioBytes,
        fileCount: audioCount,
        cleanableBytes: 0,
        cleanableCount: 0,
      },
      {
        key: "apps",
        label: "Apps",
        bytes: apps.reduce((s, a) => s + a.sizeBytes, 0),
        fileCount: apps.length,
        cleanableBytes: 0,
        cleanableCount: 0,
      },
    ] as CategorySummary[]
  ).filter((c) => c.bytes > 0 || c.fileCount > 0);

  // Only verified cache candidates and confirmed photo copies are suggestions.
  // Personal downloads and WhatsApp media require manual selection.
  const totalCleanableBytes = safeJunkBytes + dupRecoverable;

  onProgress?.("Done", 1);

  return {
    startedAt,
    completedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    totalCleanableBytes,
    filesScanned: storageItems.length,
    categories,
    allPhotos: [],
    allVideos: [],
    allAudio: [],
    allDownloads: [],
    obsoleteApks,
    largeFiles: [], // Files screens page large files directly from SQLite.
    duplicateCoverage,
    duplicateGroups: duplicateGroups.sort(
      (a, b) => b.recoverableBytes - a.recoverableBytes,
    ),
    apps,
    junkFiles: junkFiles.sort((a, b) => b.sizeBytes - a.sizeBytes),
    whatsappFiles: whatsappFiles.sort((a, b) => b.sizeBytes - a.sizeBytes),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// DUPLICATE DETECTION
// ──────────────────────────────────────────────────────────────────────────

async function detectDuplicates(
  photos: ScannedFile[],
  onProgress?: (stage: string, progress: number) => void,
  onCoverage?: (coverage: NonNullable<ScanResult["duplicateCoverage"]>) => void,
): Promise<DuplicateGroup[]> {
  // Check the complete accessible library; metadata estimates are not a safe prefilter.
  const allCandidateFiles = uniqueFiles(photos).filter(
    (file) => file.path || file.uri,
  );

  // 3. Incremental Hash Cache & Chunked Batched Verification
  try {
    if (allCandidateFiles.length > 0) {
      await storage.waitForHydration();
      const cacheVersion = `visual-${HashWorker.getPhotoHashVersion()}-group-3`;
      if (storage.getString(KEYS.photoHashVersion) !== cacheVersion) {
        await StorageIndexService.clearPhotoHashCache();
        storage.set(KEYS.photoHashVersion, cacheVersion);
      }
      // Step 3A: Check SQLite incremental cache
      const cachedHashes = new Map<
        string,
        { sha256: string | null; dhash: string | null }
      >();
      for (let offset = 0; offset < allCandidateFiles.length; offset += 200) {
        const queries = allCandidateFiles
          .slice(offset, offset + 200)
          .map((f) => ({
            pathOrUri: f.path || f.uri || "",
            sizeBytes: f.sizeBytes,
            modifiedAt: f.modifiedAt,
          }));
        for (const [path, hashes] of StorageIndexService.getCachedHashes(
          queries,
        ))
          cachedHashes.set(path, hashes);
      }

      const resultMap = new Map<
        string,
        { sha256: string | null; dhash: string | null }
      >();
      const uncachedFiles: ScannedFile[] = [];

      for (const file of allCandidateFiles) {
        const path = file.path || file.uri;
        if (!path) continue;
        const cached = cachedHashes.get(path);
        if (cached?.sha256 && cached?.dhash) {
          resultMap.set(path, cached);
        } else {
          uncachedFiles.push(file);
        }
      }

      // Step 3B: Compute hashes for uncached files in memory-safe chunks of 40
      const CHUNK_SIZE = 40;
      const newlyComputed: {
        pathOrUri: string;
        sizeBytes: number;
        modifiedAt: number;
        sha256: string | null;
        dhash: string | null;
      }[] = [];

      for (let i = 0; i < uncachedFiles.length; i += CHUNK_SIZE) {
        const chunk = uncachedFiles.slice(i, i + CHUNK_SIZE);
        const chunkPaths = chunk
          .map((f) => f.uri || f.path)
          .filter((p): p is string => Boolean(p));
        if (chunkPaths.length > 0) {
          onProgress?.(
            `Checking photo contents (${Math.min(i + CHUNK_SIZE, uncachedFiles.length).toLocaleString()} / ${uncachedFiles.length.toLocaleString()})…`,
            0.85 + 0.04 * Math.min(1, (i + CHUNK_SIZE) / uncachedFiles.length),
          );
          const recovered = await recoverPhotoHashes(
            chunk,
            cachedHashes,
            (paths) => HashWorker.hashPhotos(paths),
          );
          for (const [path, hashes] of recovered) {
            const res = { path, ...hashes };
            resultMap.set(res.path, { sha256: res.sha256, dhash: res.dhash });
            const matchedFile = chunk.find(
              (f) => f.path === res.path || f.uri === res.path,
            );
            if (matchedFile) {
              if (matchedFile.path) {
                resultMap.set(matchedFile.path, {
                  sha256: res.sha256,
                  dhash: res.dhash,
                });
              }
              if (matchedFile.uri) {
                resultMap.set(matchedFile.uri, {
                  sha256: res.sha256,
                  dhash: res.dhash,
                });
              }
              newlyComputed.push({
                pathOrUri: matchedFile.path || matchedFile.uri || res.path,
                sizeBytes: matchedFile.sizeBytes,
                modifiedAt: matchedFile.modifiedAt,
                sha256: res.sha256,
                dhash: res.dhash,
              });
            }
          }
          // Keep SQLite cache writes bounded so the UI can draw between batches.
          if (newlyComputed.length) {
            await StorageIndexService.saveCachedHashes(newlyComputed);
            newlyComputed.length = 0;
          }
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      let exactChecked = 0,
        visualChecked = 0;
      for (const hash of resultMap.values()) {
        if (hash.sha256) exactChecked++;
        if (hash.dhash) visualChecked++;
      }
      cachedHashes.clear();
      uncachedFiles.length = 0;
      onCoverage?.({
        total: allCandidateFiles.length,
        exactChecked,
        visualChecked,
      });
      return await buildDuplicateGroups(
        allCandidateFiles,
        resultMap,
        (done, total) => {
          onProgress?.(
            `Comparing photos (${done.toLocaleString()} / ${total.toLocaleString()})…`,
            0.89 + (0.02 * done) / Math.max(1, total),
          );
        },
      );
    }
  } catch (err) {
    console.warn("[realScanner] detectDuplicates error:", err);
    throw new Error(
      "Photo comparison could not finish. Your previous scan and files are unchanged. Please retry.",
      { cause: err },
    );
  }

  return [];
}

// ──────────────────────────────────────────────────────────────────────────
// CENTRALIZED REAL CLEANUP DISPATCH
// ──────────────────────────────────────────────────────────────────────────

export async function performRealCleanup(
  selectedFileIds: Set<string>,
  selectedGroupIds: Set<string>,
  scanResult: ScanResult | null,
): Promise<{
  freedBytes: number;
  deletedCount: number;
  requestedCount: number;
  failedCount: number;
  permissionBlockedCount: number;
  missingPermission?:
    "manage_external_storage" | "media_library" | "saf" | null;
}> {
  const idsToDelete = new Set(selectedFileIds);

  // Collect duplicate files (delete all except keepId)
  for (const g of scanResult?.duplicateGroups ?? []) {
    if (selectedGroupIds.has(g.id)) {
      for (const f of g.files) {
        if (f.id !== g.keepId) {
          idsToDelete.add(f.id);
        }
      }
      // Absolute guarantee: keepId is never deleted during group cleanup
      idsToDelete.delete(g.keepId);
    }
  }

  for (const g of scanResult?.duplicateGroups ?? [])
    idsToDelete.delete(g.keepId);

  const res = await DeleteCoordinator.deleteMany(Array.from(idsToDelete));
  return {
    freedBytes: res.freedBytes,
    deletedCount: res.deletedCount,
    requestedCount: res.requestedCount,
    failedCount: res.failedCount,
    permissionBlockedCount: res.permissionBlockedCount,
    missingPermission: res.missingPermission,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────

function estimateMediaSize(
  asset: MediaLibrary.Asset,
  type: "photo" | "video" | "audio",
): number {
  const anyAsset = asset as any;
  if (typeof anyAsset.size === "number" && anyAsset.size > 0) {
    return anyAsset.size;
  }
  if (type === "video") {
    let durSec = asset.duration || 0;
    if (durSec > 1000) {
      durSec = durSec / 1000;
    }
    return Math.round(Math.max(1, durSec) * 1.2 * MB);
  }
  if (type === "audio") {
    let durSec = asset.duration || 0;
    if (durSec > 1000) {
      durSec = durSec / 1000;
    }
    return Math.round(Math.max(1, durSec) * (MB / 60));
  }
  return Math.round(Math.max(1, (asset.width * asset.height * 3) / 10));
}

async function getAppsFromNative(): Promise<AppItem[]> {
  try {
    const raw = await AndroidStorage.getInstalledApps();
    if (!raw || raw.length === 0) return [];
    return raw.map((a) => ({
      packageName: a.packageName,
      label: a.label,
      sizeBytes: a.sizeBytes,
      cacheBytes: a.cacheBytes,
      lastUsedAt: a.lastUsedAt || 0,
      installedAt: a.installedAt,
      isSystem: a.isSystem,
      iconUri: a.iconUri ?? undefined,
    }));
  } catch {
    return [];
  }
}

function sum(files: ScannedFile[]): number {
  return files.reduce((s, f) => s + f.sizeBytes, 0);
}
