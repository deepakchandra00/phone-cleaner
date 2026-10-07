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
  installedAt?: number;
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
      return false;
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
  async getInstalledApps(): Promise<NativeAppInfo[]> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.getInstalledApps();
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
  async getMediaMetadata(
    uris: string[],
  ): Promise<
    Array<{ uri: string; path?: string; sizeBytes: number; mimeType?: string }>
  > {
    try {
      return await requireNativeModule("AndroidStorage").getMediaMetadata(uris);
    } catch {
      return [];
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
      return {
        deletedCount: 0,
        freedBytes: 0,
        deletedPaths: [],
        failedPaths: paths,
      };
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
  getUsageAccessStatus(): {
    granted: boolean;
    nativeAvailable: boolean;
    declared: boolean | null;
    packageName: string | null;
  } {
    try {
      const module = requireNativeModule("AndroidStorage");
      if (typeof module.getUsageAccessStatus === "function") {
        const status = module.getUsageAccessStatus();
        return {
          granted: Boolean(status.granted),
          nativeAvailable: true,
          declared: Boolean(status.declared),
          packageName: status.packageName || null,
        };
      }
      return {
        granted: Boolean(module.isUsageAccessGranted?.()),
        nativeAvailable: true,
        declared: null,
        packageName: null,
      };
    } catch {
      return {
        granted: false,
        nativeAvailable: false,
        declared: null,
        packageName: null,
      };
    }
  },
  async openAppSettings(packageName: string): Promise<boolean> {
    try {
      const module = requireNativeModule("AndroidStorage");
      return (
        typeof module.openAppSettings === "function" &&
        Boolean(await module.openAppSettings(packageName))
      );
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
  getNotificationCleanupStatus(): {
    nativeAvailable: boolean;
    enabled: boolean;
    connected: boolean;
    clearableCount: number;
  } {
    try {
      const module = requireNativeModule("AndroidStorage");
      if (typeof module.getNotificationCleanupStatus !== "function")
        throw new Error("App update required");
      return {
        nativeAvailable: true,
        ...module.getNotificationCleanupStatus(),
      };
    } catch {
      return {
        nativeAvailable: false,
        enabled: false,
        connected: false,
        clearableCount: 0,
      };
    }
  },
  async requestNotificationCleanupAccess(): Promise<boolean> {
    try {
      return Boolean(
        await requireNativeModule(
          "AndroidStorage",
        ).requestNotificationCleanupAccess(),
      );
    } catch {
      return false;
    }
  },
  async dismissClearableNotifications(): Promise<{
    available: boolean;
    requestedCount: number;
  }> {
    try {
      return await requireNativeModule(
        "AndroidStorage",
      ).dismissClearableNotifications();
    } catch {
      return { available: false, requestedCount: 0 };
    }
  },
  getAppMemoryDiagnostics(): {
    javaHeapUsedBytes: number;
    javaHeapMaxBytes: number;
    nativeHeapAllocatedBytes: number;
  } | null {
    try {
      const module = requireNativeModule("AndroidStorage");
      return typeof module.getAppMemoryDiagnostics === "function"
        ? module.getAppMemoryDiagnostics()
        : null;
    } catch {
      return null;
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
  async scanApkFiles(): Promise<
    Array<
      NativeScannedFile & {
        appLabel?: string;
        packageName?: string;
        versionName?: string;
        isInstalled?: boolean;
      }
    >
  > {
    try {
      const module = requireNativeModule("AndroidStorage");
      return await module.scanApkFiles();
    } catch {
      return [];
    }
  },
  async verifyFilesExistence(
    targets: string[],
  ): Promise<Record<string, boolean>> {
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
  getPhotoHashVersion(): number {
    for (const name of ["AndroidStorage", "HashWorker"]) {
      try {
        const module = requireNativeModule(name);
        if (typeof module.getPhotoHashVersion === "function")
          return module.getPhotoHashVersion();
      } catch {}
    }
    return 1;
  },
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
  async hashFiles(
    paths: string[],
  ): Promise<Array<{ path: string; hash: string | null }>> {
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
          out.push({
            path: p,
            hash: info.exists && (info as any).md5 ? (info as any).md5 : null,
          });
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
  ): Promise<
    Array<{ path: string; sha256: string | null; dhash: string | null }>
  > {
    const results = new Map(
      paths.map((path) => [
        path,
        { path, sha256: null as string | null, dhash: null as string | null },
      ]),
    );
    // Recover each incomplete row, rather than accepting a whole partial batch.
    for (const name of ["AndroidStorage", "HashWorker"]) {
      const pending = paths.filter(
        (path) => !results.get(path)!.sha256 || !results.get(path)!.dhash,
      );
      if (!pending.length) break;
      try {
        const module = requireNativeModule(name);
        if (typeof module.hashPhotos !== "function") continue;
        const rows = await module.hashPhotos(pending);
        for (const row of rows ?? []) {
          const previous = results.get(row.path);
          if (previous)
            results.set(row.path, {
              path: row.path,
              sha256: row.sha256 || previous.sha256,
              dhash: row.dhash || previous.dhash,
            });
        }
      } catch {}
    }
    for (const path of paths) {
      const previous = results.get(path)!;
      if (previous.sha256) continue;
      try {
        const uri = path.startsWith("/") ? `file://${path}` : path;
        const info = await FileSystem.getInfoAsync(uri, { md5: true });
        if (info.exists && "md5" in info && info.md5) {
          results.set(path, { ...previous, sha256: `md5:${info.md5}` });
        }
      } catch {}
    }
    return [...results.values()];
  },
};

export interface BatteryStatus {
  available: boolean;
  levelPercent?: number | null;
  charging?: boolean;
  temperatureC?: number | null;
  voltageMv?: number | null;
  currentMa?: number | null;
  healthStatus?: string;
}
export interface WifiStatus {
  connected: boolean;
  security: string;
  warning?: string;
  linkSpeedMbps?: number | null;
}
export interface DataUsageRow {
  uid: number;
  label: string;
  packages: string[];
  mobileBytes: number;
  wifiBytes: number;
  totalBytes: number;
  sharedUid: boolean;
}
export interface DataUsageReport {
  apps: DataUsageRow[];
  unavailable: string[];
  start: number;
  end: number;
}
export interface CompressedPhoto {
  uri: string | null;
  originalBytes: number;
  sizeBytes: number;
  width: number;
  height: number;
}
export interface NotificationPackage {
  packageName: string;
  label: string;
  count: number;
}
export const DeviceTools = {
  async discardDraft(uri: string): Promise<boolean> {
    try {
      return Boolean(
        await requireNativeModule("AndroidStorage").discardCompressedPhoto(uri),
      );
    } catch {
      return false;
    }
  },
  available(): boolean {
    try {
      return requireNativeModule("AndroidStorage").getDeviceToolsVersion() >= 1;
    } catch {
      return false;
    }
  },
  battery(): BatteryStatus {
    try {
      return requireNativeModule("AndroidStorage").getBatteryStatus();
    } catch {
      return { available: false };
    }
  },
  async wifi(): Promise<WifiStatus> {
    return requireNativeModule("AndroidStorage").getWifiStatus();
  },
  async dataUsage(start: number, end: number): Promise<DataUsageReport> {
    return requireNativeModule("AndroidStorage").getAppDataUsage(start, end);
  },
  async compress(
    uri: string,
    quality: number,
    maxSide: number,
  ): Promise<CompressedPhoto> {
    return requireNativeModule("AndroidStorage").compressPhoto(
      uri,
      quality,
      maxSide,
    );
  },
  notificationPackages(): NotificationPackage[] {
    try {
      return requireNativeModule("AndroidStorage").getNotificationPackages();
    } catch {
      return [];
    }
  },
  async dismissNotifications(
    packages: string[],
  ): Promise<{ available: boolean; requestedCount: number }> {
    return requireNativeModule("AndroidStorage").dismissSelectedNotifications(
      packages,
    );
  },
};

export interface SpeedTestResult {
  latencyMs: number;
  downloadMbps: number;
  uploadMbps: number;
  transferredBytes: number;
  provider: string;
  method: string;
}
export const InternetSpeed = {
  async run(id: string): Promise<SpeedTestResult> {
    return requireNativeModule("AndroidStorage").runSpeedTest(id);
  },
  cancel(id: string): void {
    try {
      requireNativeModule("AndroidStorage").cancelSpeedTest(id);
    } catch {}
  },
  listen(
    callback: (event: { id: string; stage: string; percent: number }) => void,
  ): { remove: () => void } {
    try {
      return requireNativeModule("AndroidStorage").addListener(
        "speedTestProgress",
        callback,
      );
    } catch {
      return { remove: () => {} };
    }
  },
};
