import { requireNativeModule } from "expo-modules-core";
import * as FileSystem from "expo-file-system/legacy";

export interface NativeStorageStats {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
}

export interface NativeAppInfo {
  packageName: string;
  label: string;
  sizeBytes: number;
  cacheBytes: number;
  lastUsedAt: number;
  isSystem: boolean;
  iconUri: string | null;
}

export interface NativeScannedFile {
  id: string;
  path: string;
  name: string;
  sizeBytes: number;
  category: string;
  subType?: string;
  mimeType?: string;
  modifiedAt: number;
  isSent?: boolean;
}

export interface NativeVideoItem {
  id: string;
  uri: string;
  path: string;
  name: string;
  sizeBytes: number;
  modifiedAt: number;
  durationSec: number;
  mimeType: string;
  width: number;
  height: number;
}

export interface NativeDeleteResult {
  deletedCount: number;
  freedBytes: number;
  deletedPaths: string[];
  failedPaths: string[];
}

export interface NativeMemoryInfo {
  totalMemBytes: number;
  availMemBytes: number;
  usedMemBytes: number;
  usedPercent: number;
  lowMemory: boolean;
}

export interface NativeBoostResult {
  freedBytes: number;
  killedCount: number;
  availMemBytes: number;
  totalMemBytes: number;
}

export const AndroidStorage = {
  getStorageStats(): NativeStorageStats | null {
    try {
      const module = requireNativeModule("AndroidStorage");
      return module.getStorageStats();
    } catch {
      return null;
    }
  },
  isExternalStorageManager(): boolean {
    try {
      const module = requireNativeModule("AndroidStorage");
      return Boolean(module.isExternalStorageManager());
    } catch {
      return true;
    }
  },
  async requestManageAllFilesAccess(): Promise<boolean> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.requestManageAllFilesAccess();
    } catch {
      return false;
    }
  },
  getInstalledApps(): NativeAppInfo[] {
    try {
      const module = requireNativeModule("AndroidStorage");
      return module.getInstalledApps();
    } catch {
      return [];
    }
  },
  async uninstallApp(packageName: string): Promise<boolean> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.uninstallApp(packageName);
    } catch {
      return false;
    }
  },
  async scanJunkFiles(): Promise<NativeScannedFile[]> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.scanJunkFiles();
    } catch {
      return [];
    }
  },
  async scanWhatsAppMedia(): Promise<NativeScannedFile[]> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.scanWhatsAppMedia();
    } catch {
      return [];
    }
  },
  async scanDownloads(): Promise<NativeScannedFile[]> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.scanDownloads();
    } catch {
      return [];
    }
  },
  async scanMediaStoreVideos(): Promise<NativeVideoItem[]> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.scanMediaStoreVideos();
    } catch {
      return [];
    }
  },
  async openFile(uriOrPath: string, mimeType?: string): Promise<boolean> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.openFile(uriOrPath, mimeType ?? null);
    } catch {
      return false;
    }
  },
  async locateFile(uriOrPath: string): Promise<boolean> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.locateFile(uriOrPath);
    } catch {
      return false;
    }
  },
  async deleteNativeFiles(paths: string[]): Promise<NativeDeleteResult> {
    try {
      const module = requireNativeModule("AndroidStorage");
      const res = await module.deleteNativeFiles(paths);
      return {
        deletedCount: res.deletedCount ?? 0,
        freedBytes: res.freedBytes ?? 0,
        deletedPaths: res.deletedPaths ?? [],
        failedPaths: res.failedPaths ?? [],
      };
    } catch {
      return { deletedCount: 0, freedBytes: 0, deletedPaths: [], failedPaths: paths };
    }
  },
  copyToClipboard(text: string): boolean {
    try {
      const module = requireNativeModule("AndroidStorage");
      return Boolean(module.copyToClipboard(text));
    } catch {
      return false;
    }
  },
  isUsageAccessGranted(): boolean {
    try {
      const module = requireNativeModule("AndroidStorage");
      return Boolean(module.isUsageAccessGranted());
    } catch {
      return false;
    }
  },
  async requestUsageAccess(): Promise<boolean> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.requestUsageAccess();
    } catch {
      return false;
    }
  },
  getMemoryInfo(): NativeMemoryInfo {
    try {
      const module = requireNativeModule("AndroidStorage");
      return (
        module.getMemoryInfo() ?? {
          totalMemBytes: 0,
          availMemBytes: 0,
          usedMemBytes: 0,
          usedPercent: 0,
          lowMemory: false,
        }
      );
    } catch {
      return {
        totalMemBytes: 0,
        availMemBytes: 0,
        usedMemBytes: 0,
        usedPercent: 0,
        lowMemory: false,
      };
    }
  },
  async boostRam(): Promise<NativeBoostResult> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.boostRam();
    } catch {
      return { freedBytes: 0, killedCount: 0, availMemBytes: 0, totalMemBytes: 0 };
    }
  },
  async scanEmptyFolders(): Promise<NativeScannedFile[]> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.scanEmptyFolders();
    } catch {
      return [];
    }
  },
  async deleteEmptyFolders(paths: string[]): Promise<{ deletedCount: number }> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.deleteEmptyFolders(paths);
    } catch {
      return { deletedCount: 0 };
    }
  },
  async scanTrashedFiles(): Promise<NativeScannedFile[]> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.scanTrashedFiles();
    } catch {
      return [];
    }
  },
  async scanBrowserCaches(): Promise<NativeScannedFile[]> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.scanBrowserCaches();
    } catch {
      return [];
    }
  },
  async scanApkFiles(): Promise<Array<NativeScannedFile & { appLabel?: string; packageName?: string; versionName?: string; isInstalled?: boolean }>> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.scanApkFiles();
    } catch {
      return [];
    }
  },
  async verifyFilesExistence(targets: string[]): Promise<Record<string, boolean>> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.verifyFilesExistence(targets);
    } catch {
      const fallback: Record<string, boolean> = {};
      for (const t of targets) fallback[t] = true;
      return fallback;
    }
  },
};

export const SAFBridge = {
  async listFiles(treeUri: string, folderPath = ""): Promise<any[]> {
    try {
      const module = requireNativeModule("SAFBridge");
      return await module.listFiles(treeUri, folderPath);
    } catch {
      return [];
    }
  },
  async deleteDocument(documentUri: string): Promise<boolean> {
    try {
      const module = requireNativeModule("SAFBridge");
      return await module.deleteDocument(documentUri);
    } catch {
      return false;
    }
  },
};

export const HashWorker = {
  async hashFile(path: string): Promise<string | null> {
    try {
      const storageModule = requireNativeModule("AndroidStorage");
      if (typeof storageModule.hashFile === "function") {
        const res = await storageModule.hashFile(path);
        if (res) return res;
      }
    } catch {}
    try {
      const module = requireNativeModule("HashWorker");
      return await module.hashFile(path);
    } catch {
      try {
        const info = await FileSystem.getInfoAsync(path, { md5: true });
        return info.exists && (info as any).md5 ? (info as any).md5 : null;
      } catch {
        return null;
      }
    }
  },
  async hashFiles(paths: string[]): Promise<Array<{ path: string; hash: string | null }>> {
    try {
      const storageModule = requireNativeModule("AndroidStorage");
      if (typeof storageModule.hashFiles === "function") {
        const res = await storageModule.hashFiles(paths);
        if (res && res.length > 0) return res;
      }
    } catch {}
    try {
      const module = requireNativeModule("HashWorker");
      return await module.hashFiles(paths);
    } catch {
      const out: Array<{ path: string; hash: string | null }> = [];
      for (const p of paths) {
        try {
          const info = await FileSystem.getInfoAsync(p, { md5: true });
          out.push({ path: p, hash: info.exists && (info as any).md5 ? (info as any).md5 : null });
        } catch {
          out.push({ path: p, hash: null });
        }
      }
      return out;
    }
  },
  async computeDHash(path: string): Promise<string | null> {
    try {
      const storageModule = requireNativeModule("AndroidStorage");
      if (typeof storageModule.computeDHash === "function") {
        const res = await storageModule.computeDHash(path);
        if (res) return res;
      }
    } catch {}
    try {
      const module = requireNativeModule("HashWorker");
      return await module.computeDHash(path);
    } catch {
      return null;
    }
  },
  async hashPhotos(
    paths: string[],
  ): Promise<Array<{ path: string; sha256: string | null; dhash: string | null }>> {
    // 1. Primary: AndroidStorage native module
    try {
      const storageModule = requireNativeModule("AndroidStorage");
      if (typeof storageModule.hashPhotos === "function") {
        const res = await storageModule.hashPhotos(paths);
        if (res && res.length > 0 && res.some((r: any) => r.sha256 || r.dhash)) {
          return res;
        }
      }
    } catch {}

    // 2. Secondary: HashWorker native module
    try {
      const module = requireNativeModule("HashWorker");
      if (typeof module.hashPhotos === "function") {
        const res = await module.hashPhotos(paths);
        if (res && res.length > 0 && res.some((r: any) => r.sha256 || r.dhash)) {
          return res;
        }
      }
    } catch {}

    // 3. Resilient Fallback: Built-in FileSystem MD5 calculation
    const fallbackResults: Array<{ path: string; sha256: string | null; dhash: string | null }> = [];
    for (const p of paths) {
      try {
        const info = await FileSystem.getInfoAsync(p, { md5: true });
        fallbackResults.push({
          path: p,
          sha256: info.exists && (info as any).md5 ? (info as any).md5 : null,
          dhash: null,
        });
      } catch {
        fallbackResults.push({ path: p, sha256: null, dhash: null });
      }
    }
    return fallbackResults;
  },
};

