import { requireNativeModule } from "expo-modules-core";

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
      const module = requireNativeModule("HashWorker");
      return await module.hashFile(path);
    } catch {
      return null;
    }
  },
  async hashFiles(paths: string[]): Promise<Array<{ path: string; hash: string | null }>> {
    try {
      const module = requireNativeModule("HashWorker");
      return await module.hashFiles(paths);
    } catch {
      return paths.map((p) => ({ path: p, hash: null }));
    }
  },
  async computeDHash(path: string): Promise<string | null> {
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
    try {
      const module = requireNativeModule("HashWorker");
      return await module.hashPhotos(paths);
    } catch {
      return paths.map((p) => ({ path: p, sha256: null, dhash: null }));
    }
  },
};
