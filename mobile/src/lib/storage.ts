import { MMKV } from "react-native-mmkv";

/**
 * Single MMKV instance for the whole app.
 * MMKV is synchronous and ~30x faster than AsyncStorage.
 * Used for: preferences, entitlement cache, onboarding state.
 *
 * Scan results and file lists are stored in SQLite (see src/lib/db.ts)
 * because they can be large and benefit from queryable storage.
 */
export const storage = new MMKV({
  id: "phone-cleaner-storage",
  encryptionKey: undefined, // enable in production after key bootstrap
});

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
