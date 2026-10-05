import { create } from "zustand";
import { storage, KEYS } from "@/lib/storage";
import { getRealStorageSummary, runRealScan, performRealCleanup } from "@/lib/realScanner";
import { getStorageSummary } from "@/lib/mockData";
import { StorageIndexService } from "@/db/StorageIndexService";
import { DeleteCoordinator } from "@/services/DeleteCoordinator";
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

  lastFreedBytes: number | null; // for the success animation

  loadStorage: () => Promise<void>;
  startScan: () => Promise<ScanResult | null>;
  toggleFile: (id: string) => void;
  toggleGroup: (id: string) => void;
  selectAllFiles: (ids: string[]) => void;
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
    for (const id of deletedIds) {
      curFiles.delete(id);
    }
    set({ selectedFileIds: curFiles });
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
    lastFreedBytes: null,

    loadStorage: async () => {
      try {
        const summary = await getRealStorageSummary();
        const totalFreed = storage.getNumber(KEYS.totalFreedBytes) ?? 0;
        if (totalFreed > 0) {
          summary.usedBytes = Math.max(0, summary.usedBytes - totalFreed);
          summary.freeBytes = summary.totalBytes - summary.usedBytes;
          summary.usedPercent = summary.totalBytes > 0 ? Math.round((summary.usedBytes / summary.totalBytes) * 100) : 0;
        }

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

    toggleFile: (id) => {
      const cur = new Set(get().selectedFileIds);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      set({ selectedFileIds: cur });
    },

    toggleGroup: (id) => {
      const cur = new Set(get().selectedGroupIds);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      set({ selectedGroupIds: cur });
    },

    selectAllFiles: (ids) => {
      const cur = new Set(get().selectedFileIds);
      for (const id of ids) cur.add(id);
      set({ selectedFileIds: cur });
    },

    deselectAllFiles: (ids) => {
      const cur = new Set(get().selectedFileIds);
      for (const id of ids) cur.delete(id);
      set({ selectedFileIds: cur });
    },

    clearSelection: () => {
      set({ selectedFileIds: new Set(), selectedGroupIds: new Set() });
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
        updatedResult = {
          ...currentResult,
          totalCleanableBytes: Math.max(0, currentResult.totalCleanableBytes - freedBytes),
          allPhotos: currentResult.allPhotos.filter((f) => !deletedFileIds.has(f.id)),
          allVideos: currentResult.allVideos.filter((f) => !deletedFileIds.has(f.id)),
          allAudio: currentResult.allAudio.filter((f) => !deletedFileIds.has(f.id)),
          allDownloads: currentResult.allDownloads.filter((f) => !deletedFileIds.has(f.id)),
          obsoleteApks: currentResult.obsoleteApks.filter((f) => !deletedFileIds.has(f.id)),
          largeFiles: currentResult.largeFiles.filter((f) => !deletedFileIds.has(f.id)),
          junkFiles: currentResult.junkFiles.filter((f) => !deletedFileIds.has(f.id)),
          whatsappFiles: currentResult.whatsappFiles.filter((f) => !deletedFileIds.has(f.id)),
          duplicateGroups: currentResult.duplicateGroups.filter((g) => !deletedGroupIds.has(g.id)),
        };
      }

      set({
        scanResult: updatedResult,
        selectedFileIds: new Set(),
        selectedGroupIds: new Set(),
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
      set({ scanPhase: "idle", scanProgress: 0, scanStage: "" });
    },
  };
});

/** Convenience selector helpers */
export function useSelectedCount() {
  return useAppStore((s) => s.selectedFileIds.size + s.selectedGroupIds.size);
}

export function useSelectedBytes(): number {
  const { scanResult, selectedFileIds, selectedGroupIds } = useAppStore();
  if (selectedFileIds.size === 0 && selectedGroupIds.size === 0) return 0;

  // Exact sum from SQLite
  const items = StorageIndexService.getItemsByIds(Array.from(selectedFileIds));
  let bytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);

  if (scanResult) {
    for (const g of scanResult.duplicateGroups) {
      if (selectedGroupIds.has(g.id)) bytes += g.recoverableBytes;
    }
  }

  return bytes;
}

export type { CategoryKey };
