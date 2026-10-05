import { create } from "zustand";
import { storage, KEYS, getJSON, setJSON } from "@/lib/storage";

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

const DEFAULT_ENTITLEMENT: Entitlement = {
  isActive: false,
  plan: "free",
};

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface PremiumState {
  entitlement: Entitlement;
  isPro: boolean;
  isLoading: boolean;
  paywallVisible: boolean;

  setEntitlement: (e: Entitlement) => void;
  syncFromRevenueCat: (e: Partial<Entitlement>) => void;
  loadCached: () => void;
  showPaywall: () => void;
  hidePaywall: () => void;
}

export const usePremiumStore = create<PremiumState>((set) => ({
  entitlement: getJSON<Entitlement>(KEYS.premiumEntitlement, DEFAULT_ENTITLEMENT),
  isPro: getJSON<Entitlement>(KEYS.premiumEntitlement, DEFAULT_ENTITLEMENT).isActive,
  isLoading: false,
  paywallVisible: false,

  setEntitlement: (e) => {
    setJSON(KEYS.premiumEntitlement, e);
    storage.set(KEYS.premiumCacheTs, Date.now());
    set({ entitlement: e, isPro: e.isActive });
  },

  syncFromRevenueCat: (e) => {
    // Called from Purchases.addCustomerInfoUpdateListener
    const entitlement: Entitlement = {
      isActive: e.isActive ?? false,
      plan: e.plan ?? "free",
      purchasedAt: e.purchasedAt,
      expiresAt: e.expiresAt,
    };
    setJSON(KEYS.premiumEntitlement, entitlement);
    storage.set(KEYS.premiumCacheTs, Date.now());
    set({ entitlement, isPro: entitlement.isActive });
  },

  loadCached: () => {
    const cached = getJSON<Entitlement>(KEYS.premiumEntitlement, DEFAULT_ENTITLEMENT);
    const ts = storage.getNumber(KEYS.premiumCacheTs) ?? 0;
    if (Date.now() - ts > CACHE_TTL) {
      // Stale — treat as free until RevenueCat confirms.
      set({ entitlement: DEFAULT_ENTITLEMENT, isPro: false });
      return;
    }
    set({ entitlement: cached, isPro: cached.isActive });
  },

  showPaywall: () => set({ paywallVisible: true }),
  hidePaywall: () => set({ paywallVisible: false }),
}));

/** Feature gating helper. */
export function useFeatureGate() {
  const isPro = usePremiumStore((s) => s.isPro);
  return {
    isPro,
    canUseSimilarPhotos: isPro,
    canUseScheduledScans: isPro,
    canUseStorageAlerts: isPro,
    canUseAdvancedWhatsApp: isPro,
    canUseSmartRules: isPro,
  };
}
