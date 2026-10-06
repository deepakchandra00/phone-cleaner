import { create } from "zustand";
import { storage, KEYS } from "@/lib/storage";
import { getRealStorageSummary, runRealScan, performRealCleanup } from "@/lib/realScanner";
import { getStorageSummary } from "@/lib/mockData";
import { StorageIndexService } from "@/db/StorageIndexService";
import { DeleteCoordinator } from "@/services/DeleteCoordinator";
import { isSafeToCleanAutomatically } from "@/lib/safety";
import type { ScanResult, StorageSummary, CategoryKey } from "@/lib/types";
import { track } from "@/lib/analytics";

export const fileSizesCache = new Map<string, number>();

export function registerFileSizes(items: { id: string; sizeBytes: number }[]): void {
  for (const item of items) {
    fileSizesCache.set(item.id, item.sizeBytes);
  }
}

type ScanPhase = "idle" | "scanning" | "done" | "error";

interface AppState {
  storage: StorageSummary | null;
  scanResult: ScanResult | null;
  scanPhase: ScanPhase;
  scanProgress: number; // 0..1
  scanStage: string;

  selectedFileIds: Set<string>;
  selectedGroupIds: Set<string>;
  selectedFileBytesMap: Map<string, number>;
  selectedBytes: number;

  lastFreedBytes: number | null; // for the success animation

  loadStorage: () => Promise<void>;
  startScan: (options?: { includeDuplicates?: boolean }) => Promise<ScanResult | null>;
  prepareScan: () => void;
  selectSmartCleanable: () => number;
  toggleFile: (id: string, sizeBytes?: number) => void;
  toggleGroup: (id: string) => void;
  selectAllFiles: (itemsOrIds: { id: string; sizeBytes: number }[] | string[]) => void;
  deselectAllFiles: (ids: string[]) => void;
  clearSelection: () => void;
  applyCleanup: (freedBytes: number, fileCount: number) => void;
  executeCleanup: () => Promise<{
    freedBytes: number;
    fileCount: number;
    requestedCount: number;
    failedCount: number;
    permissionBlockedCount: number;
    missingPermission?: "manage_external_storage" | "media_library" | "saf" | null;
  }>;
  resetScan: () => void;
}

export const useAppStore = create<AppState>((set, get) => {
  // Listen for deletions from DeleteCoordinator to keep Zustand in sync
  DeleteCoordinator.addListener((deletedIds) => {
    const curFiles = new Set(get().selectedFileIds);
    const curMap = new Map(get().selectedFileBytesMap);
    let curBytes = get().selectedBytes;
    for (const id of deletedIds) {
      curFiles.delete(id);
      const size = curMap.get(id) ?? 0;
      curMap.delete(id);
      curBytes = Math.max(0, curBytes - size);
    }
    set({ selectedFileIds: curFiles, selectedFileBytesMap: curMap, selectedBytes: curBytes });
    get().loadStorage();
  });

  return {
    storage: getStorageSummary(),
    scanResult: null,
    scanPhase: "idle",
    scanProgress: 0,
    scanStage: "",
    selectedFileIds: new Set(),
    selectedGroupIds: new Set(),
    selectedFileBytesMap: new Map(),
    selectedBytes: 0,
    lastFreedBytes: null,

    loadStorage: async () => {
      try {
        const summary = await getRealStorageSummary();
        const existing = get().scanResult;
        if (existing) {
          summary.cleanableBytes = existing.totalCleanableBytes;
          summary.categories = existing.categories;
        }

        set({ storage: summary });
      } catch (e) {
        console.warn("[useAppStore] loadStorage error:", e);
      }
    },

    prepareScan: () => {
      set({
        scanPhase: "idle",
        scanProgress: 0,
        scanStage: "Preparing scan…",
        selectedFileIds: new Set(),
        selectedGroupIds: new Set(),
        selectedFileBytesMap: new Map(),
        selectedBytes: 0,
      });
    },

    startScan: async (options) => {
      set({ scanPhase: "scanning", scanProgress: 0, scanStage: "Preparing scan…" });
      track("scan_started");

      try {
        const result = await runRealScan((stage, progress) => {
          set({ scanStage: stage, scanProgress: progress });
        }, options);

        if (result) {
          const allItems: { id: string; sizeBytes: number }[] = [];
          for (const p of result.allPhotos) allItems.push({ id: p.id, sizeBytes: p.sizeBytes });
          for (const v of result.allVideos) allItems.push({ id: v.id, sizeBytes: v.sizeBytes });
          for (const d of result.allDownloads) allItems.push({ id: d.id, sizeBytes: d.sizeBytes });
          for (const j of result.junkFiles) allItems.push({ id: j.id, sizeBytes: j.sizeBytes });
          for (const w of result.whatsappFiles) allItems.push({ id: w.id, sizeBytes: w.sizeBytes });
          registerFileSizes(allItems);
        }

        set({
          scanResult: result,
          scanPhase: "done",
          scanProgress: 1,
          scanStage: "",
        });

        storage.set(KEYS.lastScanTs, Date.now());
        track("scan_completed", {
          duration_ms: result.durationMs,
          files_scanned: result.filesScanned,
          cleanable_bytes: result.totalCleanableBytes,
        });

        get().loadStorage();
        return result;
      } catch (err) {
        console.error("[useAppStore] Scan error:", err);
        set({ scanPhase: "error", scanStage: "Scan failed" });
        track("scan_failed");
        return null;
      }
    },

    selectSmartCleanable: () => {
      const { scanResult } = get();
      const fileIds = new Set<string>();
      const groupIds = new Set<string>();
      const bytesMap = new Map<string, number>();
      let totalBytes = 0;

      if (scanResult) {
        // 1. Visible & temporary app caches + empty folders (Safe Clean)
        for (const j of scanResult.junkFiles) {
          const isTrashOrThumb = Boolean(j.source && (j.source.includes("Trash") || j.source.includes("Thumbnail")));
          if (!isTrashOrThumb && isSafeToCleanAutomatically(j)) {
            fileIds.add(j.id);
            bytesMap.set(j.id, j.sizeBytes);
            totalBytes += j.sizeBytes;
          }
        }
        // 2. Installed / Obsolete APKs in Downloads (Safe Clean)
        for (const a of scanResult.obsoleteApks) {
          if (isSafeToCleanAutomatically(a)) {
            fileIds.add(a.id);
            bytesMap.set(a.id, a.sizeBytes);
            totalBytes += a.sizeBytes;
          }
        }
        // Note: Duplicate photos, WhatsApp media, and Trashed media remain unchecked
        // by default under "Files to Review" for safety, exactly matching CCleaner.
      }

      set({
        selectedFileIds: fileIds,
        selectedGroupIds: groupIds,
        selectedFileBytesMap: bytesMap,
        selectedBytes: totalBytes,
      });
      return fileIds.size + groupIds.size;
    },

    toggleFile: (id, sizeBytes) => {
      const curIds = new Set(get().selectedFileIds);
      const curMap = new Map(get().selectedFileBytesMap);
      let curBytes = get().selectedBytes;

      if (curIds.has(id)) {
        curIds.delete(id);
        const removedSize = curMap.get(id) ?? sizeBytes ?? fileSizesCache.get(id) ?? 0;
        curMap.delete(id);
        curBytes = Math.max(0, curBytes - removedSize);
      } else {
        curIds.add(id);
        // Fast path: use passed sizeBytes or lookup from in-memory cache with zero blocking
        const size = sizeBytes ?? curMap.get(id) ?? fileSizesCache.get(id) ?? 0;
        curMap.set(id, size);
        curBytes += size;
      }

      set({
        selectedFileIds: curIds,
        selectedFileBytesMap: curMap,
        selectedBytes: curBytes,
      });
    },

    toggleGroup: (id) => {
      const cur = new Set(get().selectedGroupIds);
      const { scanResult } = get();
      const group = scanResult?.duplicateGroups.find((g) => g.id === id);
      const groupBytes = group?.recoverableBytes ?? 0;
      let curBytes = get().selectedBytes;

      if (cur.has(id)) {
        cur.delete(id);
        curBytes = Math.max(0, curBytes - groupBytes);
      } else {
        cur.add(id);
        curBytes += groupBytes;
      }
      set({ selectedGroupIds: cur, selectedBytes: curBytes });
    },

    selectAllFiles: (itemsOrIds) => {
      const curIds = new Set(get().selectedFileIds);
      const curMap = new Map(get().selectedFileBytesMap);
      let curBytes = get().selectedBytes;

      if (itemsOrIds.length > 0 && typeof itemsOrIds[0] === "object") {
        const items = itemsOrIds as { id: string; sizeBytes: number }[];
        for (const item of items) {
          if (!curIds.has(item.id)) {
            curIds.add(item.id);
            curMap.set(item.id, item.sizeBytes);
            curBytes += item.sizeBytes;
            fileSizesCache.set(item.id, item.sizeBytes);
          }
        }
      } else {
        const ids = itemsOrIds as string[];
        for (const id of ids) {
          if (!curIds.has(id)) {
            const size = fileSizesCache.get(id) ?? 0;
            curIds.add(id);
            curMap.set(id, size);
            curBytes += size;
          }
        }
      }

      set({ selectedFileIds: curIds, selectedFileBytesMap: curMap, selectedBytes: curBytes });
    },

    deselectAllFiles: (ids) => {
      const curIds = new Set(get().selectedFileIds);
      const curMap = new Map(get().selectedFileBytesMap);
      let curBytes = get().selectedBytes;

      for (const id of ids) {
        if (curIds.has(id)) {
          curIds.delete(id);
          const size = curMap.get(id) ?? 0;
          curMap.delete(id);
          curBytes = Math.max(0, curBytes - size);
        }
      }

      set({ selectedFileIds: curIds, selectedFileBytesMap: curMap, selectedBytes: curBytes });
    },

    clearSelection: () => {
      set({
        selectedFileIds: new Set(),
        selectedGroupIds: new Set(),
        selectedFileBytesMap: new Map(),
        selectedBytes: 0,
      });
    },

    applyCleanup: (freedBytes, fileCount) => {
      set({ lastFreedBytes: freedBytes });
      const prev = storage.getNumber(KEYS.totalFreedBytes) ?? 0;
      storage.set(KEYS.totalFreedBytes, prev + freedBytes);
      const count = storage.getNumber(KEYS.cleanupCount) ?? 0;
      storage.set(KEYS.cleanupCount, count + 1);
      track("cleanup_completed", {
        freed_bytes: freedBytes,
        file_count: fileCount,
      });
      track("files_deleted", { count: fileCount });

      const currentResult = get().scanResult;
      const deletedFileIds = get().selectedFileIds;
      const deletedGroupIds = get().selectedGroupIds;

      let updatedResult: ScanResult | null = null;
      if (currentResult) {
        const remainingJunk = currentResult.junkFiles.filter((f) => !deletedFileIds.has(f.id));
        const remainingApks = currentResult.obsoleteApks.filter((f) => !deletedFileIds.has(f.id));
        const remainingLarge = currentResult.largeFiles.filter((f) => !deletedFileIds.has(f.id));
        const remainingWa = currentResult.whatsappFiles.filter((f) => !deletedFileIds.has(f.id));
        const remainingDups = currentResult.duplicateGroups.filter((g) => !deletedGroupIds.has(g.id));

        const junkBytes = remainingJunk.reduce((s, f) => s + f.sizeBytes, 0);
        const apksBytes = remainingApks.reduce((s, f) => s + f.sizeBytes, 0);
        const waSentBytes = remainingWa
          .filter((f) => f.source === "WhatsApp Sent" || f.path?.includes("/Sent/") || f.path?.includes("/sent/"))
          .reduce((s, f) => s + f.sizeBytes, 0);
        const dupRecoverable = remainingDups.reduce((s, g) => s + g.recoverableBytes, 0);

        const totalCleanable = junkBytes + apksBytes + waSentBytes + dupRecoverable;

        const updatedCategories = currentResult.categories.map((c) => {
          if (c.key === "junk") {
            return {
              ...c,
              bytes: junkBytes,
              fileCount: remainingJunk.length,
              cleanableBytes: junkBytes,
              cleanableCount: remainingJunk.length,
            };
          }
          if (c.key === "downloads") {
            return {
              ...c,
              cleanableBytes: apksBytes,
              cleanableCount: remainingApks.length,
            };
          }
          if (c.key === "whatsapp") {
            return {
              ...c,
              cleanableBytes: waSentBytes,
              cleanableCount: remainingWa.filter((f) => f.source === "WhatsApp Sent" || f.path?.includes("/Sent/") || f.path?.includes("/sent/")).length,
            };
          }
          if (c.key === "photos") {
            return {
              ...c,
              cleanableBytes: dupRecoverable,
              cleanableCount: remainingDups.length,
            };
          }
          return c;
        });

        updatedResult = {
          ...currentResult,
          totalCleanableBytes: totalCleanable,
          categories: updatedCategories,
          allPhotos: [],
          allVideos: [],
          allAudio: [],
          allDownloads: [],
          obsoleteApks: remainingApks,
          largeFiles: remainingLarge,
          junkFiles: remainingJunk,
          whatsappFiles: remainingWa,
          duplicateGroups: remainingDups,
        };
      }

      set({
        scanResult: updatedResult,
        selectedFileIds: new Set(),
        selectedGroupIds: new Set(),
        selectedFileBytesMap: new Map(),
        selectedBytes: 0,
      });
      get().loadStorage();
    },

    executeCleanup: async () => {
      const { scanResult, selectedFileIds, selectedGroupIds, applyCleanup } = get();
      if (!scanResult) {
        return {
          freedBytes: 0,
          fileCount: 0,
          requestedCount: 0,
          failedCount: 0,
          permissionBlockedCount: 0,
        };
      }

      const res = await performRealCleanup(
        selectedFileIds,
        selectedGroupIds,
        scanResult,
      );

      applyCleanup(res.freedBytes, res.deletedCount);
      return {
        freedBytes: res.freedBytes,
        fileCount: res.deletedCount,
        requestedCount: res.requestedCount,
        failedCount: res.failedCount,
        permissionBlockedCount: res.permissionBlockedCount,
        missingPermission: res.missingPermission,
      };
    },

    resetScan: () => {
      set({
        // Keep scanResult so scan tab shows results after navigate
        // Only reset progress/stage indicators and selection
        scanPhase: "done",
        scanProgress: 1,
        scanStage: "",
        selectedFileIds: new Set(),
        selectedGroupIds: new Set(),
        selectedFileBytesMap: new Map(),
        selectedBytes: 0,
      });
    },
  };
});

/** Convenience selector helpers */
export function useSelectedCount() {
  return useAppStore((s) => s.selectedFileIds.size + s.selectedGroupIds.size);
}

export function useSelectedBytes(): number {
  return useAppStore((s) => s.selectedBytes);
}

export function getAutoCleanableBytes(scanResult: ScanResult | null): number {
  if (!scanResult) return 0;
  let total = 0;
  for (const j of scanResult.junkFiles) {
    if (isSafeToCleanAutomatically(j)) total += j.sizeBytes;
  }
  for (const a of scanResult.obsoleteApks) {
    if (isSafeToCleanAutomatically(a)) total += a.sizeBytes;
  }
  for (const w of scanResult.whatsappFiles) {
    if (isSafeToCleanAutomatically(w)) total += w.sizeBytes;
  }
  for (const g of scanResult.duplicateGroups) {
    total += g.recoverableBytes;
  }
  return total;
}

export function useAutoCleanableBytes(): number {
  return useAppStore((s) => getAutoCleanableBytes(s.scanResult));
}

export type { CategoryKey };
