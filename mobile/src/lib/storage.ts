import AsyncStorage from "@react-native-async-storage/async-storage";

interface IStorage {
  getString: (key: string) => string | undefined;
  getNumber: (key: string) => number | undefined;
  getBoolean: (key: string) => boolean | undefined;
  set: (key: string, value: string | number | boolean) => void;
  delete: (key: string) => void;
  clearAll: () => void;
}

class SafeStorage implements IStorage {
  private mmkvInstance: any = null;
  private memoryCache = new Map<string, any>();
  private initialized = false;

  constructor() {
    try {
      // Attempt MMKV initialization
      const { MMKV } = require("react-native-mmkv");
      this.mmkvInstance = new MMKV({
        id: "phone-cleaner-storage",
      });
      // Test read to confirm JSI bindings work
      this.mmkvInstance.getString("__test__");
    } catch (e) {
      // MMKV is not supported in Bridgeless / New Architecture mode; fall back safely
      this.mmkvInstance = null;
    }

    // Hydrate memory cache from AsyncStorage in background
    this.hydrateFromAsyncStorage();
  }

  private async hydrateFromAsyncStorage() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const prefixKeys = keys.filter((k) => k.startsWith("pc_"));
      if (prefixKeys.length > 0) {
        const pairs = await AsyncStorage.multiGet(prefixKeys);
        for (const [k, v] of pairs) {
          if (v !== null) {
            const rawKey = k.replace(/^pc_/, "");
            try {
              this.memoryCache.set(rawKey, JSON.parse(v));
            } catch {
              this.memoryCache.set(rawKey, v);
            }
          }
        }
      }
    } catch {
      /* ignore */
    } finally {
      this.initialized = true;
    }
  }

  getString(key: string): string | undefined {
    if (this.mmkvInstance) {
      try {
        return this.mmkvInstance.getString(key);
      } catch {
        /* fallback to memory */
      }
    }
    const val = this.memoryCache.get(key);
    return typeof val === "string" ? val : undefined;
  }

  getNumber(key: string): number | undefined {
    if (this.mmkvInstance) {
      try {
        return this.mmkvInstance.getNumber(key);
      } catch {
        /* fallback to memory */
      }
    }
    const val = this.memoryCache.get(key);
    return typeof val === "number" ? val : undefined;
  }

  getBoolean(key: string): boolean | undefined {
    if (this.mmkvInstance) {
      try {
        return this.mmkvInstance.getBoolean(key);
      } catch {
        /* fallback to memory */
      }
    }
    const val = this.memoryCache.get(key);
    return typeof val === "boolean" ? val : undefined;
  }

  set(key: string, value: string | number | boolean): void {
    if (this.mmkvInstance) {
      try {
        this.mmkvInstance.set(key, value);
      } catch {
        /* fallback to memory */
      }
    }
    this.memoryCache.set(key, value);
    // Persist to AsyncStorage asynchronously
    try {
      AsyncStorage.setItem(`pc_${key}`, JSON.stringify(value)).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  delete(key: string): void {
    if (this.mmkvInstance) {
      try {
        this.mmkvInstance.delete(key);
      } catch {
        /* fallback */
      }
    }
    this.memoryCache.delete(key);
    try {
      AsyncStorage.removeItem(`pc_${key}`).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  clearAll(): void {
    if (this.mmkvInstance) {
      try {
        this.mmkvInstance.clearAll();
      } catch {
        /* fallback */
      }
    }
    this.memoryCache.clear();
    try {
      AsyncStorage.getAllKeys().then((keys) => {
        const pcKeys = keys.filter((k) => k.startsWith("pc_"));
        if (pcKeys.length > 0) AsyncStorage.multiRemove(pcKeys).catch(() => {});
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }
}

export const storage = new SafeStorage();

export const KEYS = {
  onboardingComplete: "onboarding.complete",
  theme: "theme",
  premiumEntitlement: "premium.entitlement",
  premiumCacheTs: "premium.cacheTs",
  lastScanTs: "scan.lastTs",
  totalFreedBytes: "cleanup.totalFreed",
  cleanupCount: "cleanup.count",
  analyticsEnabled: "analytics.enabled",
  scheduledScanEnabled: "scan.scheduled",
} as const;

export type StorageKey = (typeof KEYS)[keyof typeof KEYS];

export function getJSON<T>(key: StorageKey, fallback: T): T {
  try {
    const raw = storage.getString(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setJSON<T>(key: StorageKey, value: T): void {
  try {
    storage.set(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}
