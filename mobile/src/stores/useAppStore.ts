import { fileIdentity } from "@/lib/fileIdentity.ts";
import { track } from "@/lib/analytics";
import {
  reconcileDeleted,
  selectedGroups,
  smartCleanCandidates,
} from "@/lib/cleanupState";
import {
  getRealStorageSummary,
  performRealCleanup,
  runRealScan,
} from "@/lib/realScanner";
import { KEYS, storage } from "@/lib/storage";
import type { CategoryKey, ScanResult, StorageSummary } from "@/lib/types";
import { DeleteCoordinator } from "@/services/DeleteCoordinator";
import { create } from "zustand";
import { Image } from "expo-image";

export const fileSizesCache = new Map<string, number>();
const fileTargetsCache = new Map<string, string>();

function selectedByteTotal(
  ids: Set<string>,
  sizes: Map<string, number>,
): number {
  const targets = new Map<string, number>();
  for (const id of ids)
    targets.set(
      fileTargetsCache.get(id) ?? id,
      sizes.get(id) ?? fileSizesCache.get(id) ?? 0,
    );
  return [...targets.values()].reduce((s, n) => s + n, 0);
}

export function registerFileSizes(
  items: { id: string; sizeBytes: number; path?: string; uri?: string }[],
): void {
  for (const item of items) {
    fileSizesCache.set(item.id, item.sizeBytes);
    fileTargetsCache.set(item.id, fileIdentity(item));
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
  startScan: (options?: {
    includeDuplicates?: boolean;
    requestPermissions?: boolean;
  }) => Promise<ScanResult | null>;
  prepareScan: () => void;
  selectSmartCleanable: () => number;
  toggleFile: (id: string, sizeBytes?: number) => void;
  toggleGroup: (id: string) => void;
  selectAllFiles: (
    itemsOrIds: { id: string; sizeBytes: number }[] | string[],
  ) => void;
  deselectAllFiles: (ids: string[]) => void;
  clearSelection: () => void;
  applyCleanup: (freedBytes: number, fileCount: number) => void;
  executeCleanup: () => Promise<{
    freedBytes: number;
    fileCount: number;
    requestedCount: number;
    failedCount: number;
    permissionBlockedCount: number;
    missingPermission?:
      "manage_external_storage" | "media_library" | "saf" | null;
  }>;
  resetScan: () => void;
}

export const useAppStore = create<AppState>((set, get) => {
  // Listen for deletions from DeleteCoordinator to keep Zustand in sync
  DeleteCoordinator.addListener((deletedIds, deletedItems) => {
    const curFiles = new Set(get().selectedFileIds);
    const curMap = new Map(get().selectedFileBytesMap);

    for (const id of deletedIds) {
      curFiles.delete(id);
      curMap.delete(id);
    }
    const scanResult = reconcileDeleted(
      get().scanResult,
      new Set(deletedIds),
      deletedItems,
    );
    deletedIds.forEach((id) => fileSizesCache.delete(id));
    set({
      scanResult,
      selectedFileIds: curFiles,
      selectedFileBytesMap: curMap,
      selectedBytes: selectedByteTotal(curFiles, curMap),
      selectedGroupIds: selectedGroups(
        scanResult?.duplicateGroups ?? [],
        curFiles,
      ),
    });
    get().loadStorage();
  });

  return {
    storage: null,
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
      if (get().scanPhase === "scanning") return;
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
      if (get().scanPhase === "scanning") return null;
      fileSizesCache.clear();
      fileTargetsCache.clear();
      get().clearSelection();
      set({
        scanPhase: "scanning",
        scanProgress: 0,
        scanStage: "Preparing scan…",
      });
      track("scan_started");

      try {
        await Image.clearMemoryCache().catch(() => false);
        let lastUpdate = 0;
        const result = await runRealScan((stage, progress) => {
          const now = Date.now();
          if (now - lastUpdate >= 150 || progress >= 1) {
            lastUpdate = now;
            set({ scanStage: stage, scanProgress: progress });
          }
        }, options);

        // Register deletion targets only when selected, not for the entire library.

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
        set({
          scanPhase: "error",
          scanStage:
            err instanceof Error ? err.message : "Scan failed. Please retry.",
        });
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

      for (const file of smartCleanCandidates(scanResult)) {
        fileIds.add(file.id);
        bytesMap.set(file.id, file.sizeBytes);
        totalBytes += file.sizeBytes;
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
      if (get().scanResult?.duplicateGroups.some((g) => g.keepId === id))
        return;
      const curIds = new Set(get().selectedFileIds);
      const curMap = new Map(get().selectedFileBytesMap);

      if (curIds.has(id)) {
        curIds.delete(id);

        curMap.delete(id);
      } else {
        curIds.add(id);
        // Fast path: use passed sizeBytes or lookup from in-memory cache with zero blocking
        const size = sizeBytes ?? curMap.get(id) ?? fileSizesCache.get(id) ?? 0;
        curMap.set(id, size);
      }

      set({
        selectedFileIds: curIds,
        selectedFileBytesMap: curMap,
        selectedBytes: selectedByteTotal(curIds, curMap),
        selectedGroupIds: selectedGroups(
          get().scanResult?.duplicateGroups ?? [],
          curIds,
        ),
      });
    },

    toggleGroup: (id) => {
      const group = get().scanResult?.duplicateGroups.find((g) => g.id === id);
      if (!group) return;
      const files = group.files.filter((f) => f.id !== group.keepId);
      if (files.every((f) => get().selectedFileIds.has(f.id)))
        get().deselectAllFiles(files.map((f) => f.id));
      else get().selectAllFiles(files);
    },

    selectAllFiles: (itemsOrIds) => {
      const curIds = new Set(get().selectedFileIds);
      const curMap = new Map(get().selectedFileBytesMap);

      const keepIds = new Set(
        get().scanResult?.duplicateGroups.map((g) => g.keepId),
      );
      if (itemsOrIds.length > 0 && typeof itemsOrIds[0] === "object") {
        const items = itemsOrIds as { id: string; sizeBytes: number }[];
        registerFileSizes(items);
        for (const item of items) {
          if (keepIds.has(item.id)) continue;
          if (!curIds.has(item.id)) {
            curIds.add(item.id);
            curMap.set(item.id, item.sizeBytes);

            fileSizesCache.set(item.id, item.sizeBytes);
          }
        }
      } else {
        const ids = itemsOrIds as string[];
        for (const id of ids) {
          if (keepIds.has(id)) continue;
          if (!curIds.has(id)) {
            const size = fileSizesCache.get(id) ?? 0;
            curIds.add(id);
            curMap.set(id, size);
          }
        }
      }

      set({
        selectedFileIds: curIds,
        selectedFileBytesMap: curMap,
        selectedBytes: selectedByteTotal(curIds, curMap),
        selectedGroupIds: selectedGroups(
          get().scanResult?.duplicateGroups ?? [],
          curIds,
        ),
      });
    },

    deselectAllFiles: (ids) => {
      const curIds = new Set(get().selectedFileIds);
      const curMap = new Map(get().selectedFileBytesMap);

      for (const id of ids) {
        if (curIds.has(id)) {
          curIds.delete(id);
          curMap.delete(id);
        }
      }

      set({
        selectedFileIds: curIds,
        selectedFileBytesMap: curMap,
        selectedBytes: selectedByteTotal(curIds, curMap),
        selectedGroupIds: selectedGroups(
          get().scanResult?.duplicateGroups ?? [],
          curIds,
        ),
      });
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
      if (fileCount === 0) return;
      const prev = storage.getNumber(KEYS.totalFreedBytes) ?? 0;
      storage.set(KEYS.totalFreedBytes, prev + freedBytes);
      const count = storage.getNumber(KEYS.cleanupCount) ?? 0;
      storage.set(KEYS.cleanupCount, count + 1);
      track("cleanup_completed", {
        freed_bytes: freedBytes,
        file_count: fileCount,
      });
      track("files_deleted", { count: fileCount });

      // DeleteCoordinator already reconciled confirmed IDs through its listener.
      // Keep failed files selected so the user can inspect or retry them.
      get().loadStorage();
    },

    executeCleanup: async () => {
      if (get().scanPhase === "scanning")
        throw new Error("Wait for the scan to finish before cleaning.");
      const { scanResult, selectedFileIds, selectedGroupIds, applyCleanup } =
        get();
      if (!scanResult && selectedFileIds.size === 0) {
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
  return smartCleanCandidates(scanResult).reduce(
    (sum, file) => sum + file.sizeBytes,
    0,
  );
}

export function useAutoCleanableBytes(): number {
  return useAppStore((s) => getAutoCleanableBytes(s.scanResult));
}

export type { CategoryKey };
