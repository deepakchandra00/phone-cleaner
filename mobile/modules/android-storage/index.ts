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

export const AndroidStorage = {
  getStorageStats(): NativeStorageStats | null {
    try {
      const module = requireNativeModule("AndroidStorage");
      return module.getStorageStats();
    } catch {
      return null;
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
};
