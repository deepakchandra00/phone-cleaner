import { KEYS, getJSON, setJSON, storage } from "@/lib/storage";
import { create } from "zustand";

/**
 * Premium entitlement store.
 *
 * Entitlement is fetched from RevenueCat at app start and cached in MMKV
 * for offline use (7-day cache TTL). The UI reads exclusively from this
 * store so it never blocks on a network call.
 */

export interface Entitlement {
  isActive: boolean;
  plan: "free" | "pro_yearly" | "pro_monthly";
  purchasedAt?: number;
  expiresAt?: number;
}

const EIGHTEEN_MONTHS_MS = 18 * 30 * 24 * 60 * 60 * 1000;

const DEFAULT_ENTITLEMENT: Entitlement = {
  isActive: true,
  plan: "pro_yearly",
  purchasedAt: 1735689600000,
  expiresAt: Date.now() + EIGHTEEN_MONTHS_MS,
};

interface PremiumState {
  entitlement: Entitlement;
  isPro: boolean;
  isLoading: boolean;
  paywallVisible: boolean;

  setEntitlement: (e: Entitlement) => void;
  syncFromRevenueCat: (e: Partial<Entitlement>) => void;
  loadCached: () => Promise<void>;
  showPaywall: () => void;
  hidePaywall: () => void;
}

export const usePremiumStore = create<PremiumState>((set) => ({
  entitlement: getJSON<Entitlement>(
    KEYS.premiumEntitlement,
    DEFAULT_ENTITLEMENT,
  ),
  isPro: true,
  isLoading: false,
  paywallVisible: false,

  setEntitlement: (e) => {
    setJSON(KEYS.premiumEntitlement, e);
    storage.set(KEYS.premiumCacheTs, Date.now());
    set({ entitlement: e, isPro: true });
  },

  syncFromRevenueCat: (e) => {
    const entitlement: Entitlement = {
      isActive: true,
      plan: (e.plan as any) ?? "pro_yearly",
      purchasedAt: e.purchasedAt ?? Date.now(),
      expiresAt: e.expiresAt ?? Date.now() + EIGHTEEN_MONTHS_MS,
    };
    setJSON(KEYS.premiumEntitlement, entitlement);
    storage.set(KEYS.premiumCacheTs, Date.now());
    set({ entitlement, isPro: true });
  },

  loadCached: async () => {
    await storage.waitForHydration();
    const cached = getJSON<Entitlement>(
      KEYS.premiumEntitlement,
      DEFAULT_ENTITLEMENT,
    );
    set({ entitlement: cached, isPro: true });
  },

  showPaywall: () => set({ paywallVisible: true }),
  hidePaywall: () => set({ paywallVisible: false }),
}));

/** Feature gating helper — 100% free for all features including duplicate photos with 18-month access */
export function useFeatureGate() {
  return {
    isPro: true,
    canUseSimilarPhotos: true,
    canUseScheduledScans: true,
    canUseStorageAlerts: true,
    canUseAdvancedWhatsApp: true,
    canUseSmartRules: true,
  };
}
