import { create } from "zustand";
import { storage, KEYS } from "@/lib/storage";
import { getRealStorageSummary, runRealScan, performRealCleanup } from "@/lib/realScanner";
import { getStorageSummary } from "@/lib/mockData";
import type { ScanResult, StorageSummary, CategoryKey } from "@/lib/types";
import { track } from "@/lib/analytics";

/**
 * Global app store: storage summary + last scan result + selection state.
 *
 * Selection state is keyed by ScannedFile.id. The user toggles files for
 * deletion across category screens; the Review screen aggregates them.
 */

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
  clearSelection: () => void;
  applyCleanup: (freedBytes: number, fileCount: number) => void;
  executeCleanup: () => Promise<{ freedBytes: number; fileCount: number }>;
  resetScan: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
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

      // If we have a scan result, merge real per-category bytes + cleanable
      const existing = get().scanResult;
      if (existing) {
        summary.cleanableBytes = existing.totalCleanableBytes;
        // Replace estimated categories with real scanned ones
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
    set({ selectedFileIds: new Set(), selectedGroupIds: new Set() });
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
}));

/** Convenience selector helpers */
export function useSelectedCount() {
  return useAppStore((s) => s.selectedFileIds.size + s.selectedGroupIds.size);
}

export function useSelectedBytes(): number {
  const { scanResult, selectedFileIds, selectedGroupIds } = useAppStore();
  if (!scanResult) return 0;
  let bytes = 0;
  const allFiles = [
    ...scanResult.largeFiles,
    ...scanResult.junkFiles,
    ...scanResult.whatsappFiles,
  ];
  for (const f of allFiles) {
    if (selectedFileIds.has(f.id)) bytes += f.sizeBytes;
  }
  for (const g of scanResult.duplicateGroups) {
    if (selectedGroupIds.has(g.id)) bytes += g.recoverableBytes;
  }
  return bytes;
}

export type { CategoryKey };
