import { create } from "zustand";
import { storage, KEYS } from "@/lib/storage";
import { getRealStorageSummary, runRealScan, performRealCleanup } from "@/lib/realScanner";
import { getStorageSummary } from "@/lib/mockData";
import { StorageIndexService } from "@/db/StorageIndexService";
import { DeleteCoordinator } from "@/services/DeleteCoordinator";
import { isSafeToCleanAutomatically } from "@/lib/safety";
import type { ScanResult, StorageSummary, CategoryKey } from "@/lib/types";
import { track } from "@/lib/analytics";

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
  startScan: () => Promise<ScanResult | null>;
  selectSmartCleanable: () => number;
  toggleFile: (id: string, sizeBytes?: number) => void;
  toggleGroup: (id: string) => void;
  selectAllFiles: (itemsOrIds: { id: string; sizeBytes: number }[] | string[]) => void;
  deselectAllFiles: (ids: string[]) => void;
  clearSelection: () => void;
  applyCleanup: (freedBytes: number, fileCount: number) => void;
  executeCleanup: () => Promise<{ freedBytes: number; fileCount: number }>;
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

    startScan: async () => {
      set({ scanPhase: "scanning", scanProgress: 0, scanStage: "Preparing scan…" });
      track("scan_started");

      try {
        const result = await runRealScan((stage, progress) => {
          set({ scanStage: stage, scanProgress: progress });
        });

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
        // Safe cleanable files verified against central safety policy
        for (const j of scanResult.junkFiles) {
          if (isSafeToCleanAutomatically(j)) {
            fileIds.add(j.id);
            bytesMap.set(j.id, j.sizeBytes);
            totalBytes += j.sizeBytes;
          }
        }
        for (const a of scanResult.obsoleteApks) {
          if (isSafeToCleanAutomatically(a)) {
            fileIds.add(a.id);
            bytesMap.set(a.id, a.sizeBytes);
            totalBytes += a.sizeBytes;
          }
        }
        for (const w of scanResult.whatsappFiles) {
          if (isSafeToCleanAutomatically(w)) {
            fileIds.add(w.id);
            bytesMap.set(w.id, w.sizeBytes);
            totalBytes += w.sizeBytes;
          }
        }
        // Redundant duplicate photos (groups ensure keepId is never deleted)
        for (const g of scanResult.duplicateGroups) {
          groupIds.add(g.id);
          totalBytes += g.recoverableBytes;
        }
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
        const removedSize = curMap.get(id) ?? sizeBytes ?? 0;
        curMap.delete(id);
        curBytes = Math.max(0, curBytes - removedSize);
      } else {
        curIds.add(id);
        // Fast path: use passed sizeBytes or lookup from map
        let size = sizeBytes;
        if (size === undefined) {
          const item = StorageIndexService.getItemsByIds([id])[0];
          size = item?.sizeBytes ?? 0;
        }
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
          }
        }
      } else {
        const ids = itemsOrIds as string[];
        const needed = ids.filter((id) => !curIds.has(id));
        if (needed.length > 0) {
          const fetched = StorageIndexService.getItemsByIds(needed);
          for (const item of fetched) {
            curIds.add(item.id);
            curMap.set(item.id, item.sizeBytes);
            curBytes += item.sizeBytes;
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
      if (!scanResult) return { freedBytes: 0, fileCount: 0 };

      const { freedBytes, deletedCount } = await performRealCleanup(
        selectedFileIds,
        selectedGroupIds,
        scanResult,
      );

      applyCleanup(freedBytes, deletedCount);
      return { freedBytes, fileCount: deletedCount };
    },

    resetScan: () => {
      set({
        scanPhase: "idle",
        scanProgress: 0,
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

export type { CategoryKey };
