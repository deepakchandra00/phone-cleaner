import { Platform } from "react-native";
import mobileAds, {
  InterstitialAd,
  AdEventType,
  TestIds,
  MaxAdContentRating,
} from "react-native-google-mobile-ads";
import { usePremiumStore } from "@/stores/usePremiumStore";

type AdUnit = "banner" | "native" | "interstitial" | "rewarded";

const PLACEMENT_CAPS: Record<AdUnit, { minIntervalMs: number }> = {
  banner: { minIntervalMs: 0 },
  native: { minIntervalMs: 0 },
  interstitial: { minIntervalMs: 5 * 60 * 1000 }, // 1 per 5 min
  rewarded: { minIntervalMs: 0 },
};

const lastShown: Record<AdUnit, number> = {
  banner: 0,
  native: 0,
  interstitial: 0,
  rewarded: 0,
};

let adsInitialised = false;
let interstitialAd: InterstitialAd | null = null;

export async function initAds(): Promise<void> {
  if (adsInitialised || Platform.OS !== "android") return;
  try {
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
    });
    await mobileAds().initialize();
    adsInitialised = true;

    // Pre-load interstitial
    preloadInterstitial();
  } catch (err) {
    console.warn("[ads] Failed to initialize mobileAds:", err);
  }
}

function preloadInterstitial() {
  if (usePremiumStore.getState().isPro) return;
  try {
    interstitialAd = InterstitialAd.createForAdRequest(TestIds.INTERSTITIAL, {
      requestNonPersonalizedAdsOnly: true,
    });
    interstitialAd.addAdEventListener(AdEventType.LOADED, () => {
      // Interstitial is ready
    });
    interstitialAd.addAdEventListener(AdEventType.CLOSED, () => {
      preloadInterstitial();
    });
    interstitialAd.load();
  } catch (e) {
    console.warn("[ads] Error loading interstitial:", e);
  }
}

export function canShowAd(unit: AdUnit): boolean {
  const isPro = usePremiumStore.getState().isPro;
  if (isPro) return false;
  const cap = PLACEMENT_CAPS[unit];
  if (cap.minIntervalMs === 0) return true;
  return Date.now() - lastShown[unit] >= cap.minIntervalMs;
}

export function recordAdShown(unit: AdUnit) {
  lastShown[unit] = Date.now();
}

/**
 * Show an interstitial after cleanup, respecting the 5-minute cap.
 * Called from the success screen.
 */
export function maybeShowInterstitial(): void {
  if (!canShowAd("interstitial")) return;
  try {
    if (interstitialAd && interstitialAd.loaded) {
      interstitialAd.show();
      recordAdShown("interstitial");
    } else {
      preloadInterstitial();
    }
  } catch (err) {
    console.warn("[ads] Failed to show interstitial:", err);
  }
}
