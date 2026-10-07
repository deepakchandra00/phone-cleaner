import Constants from "expo-constants";
import { AppState, Platform } from "react-native";
import mobileAds, {
  InterstitialAd,
  AdEventType,
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  TestIds,
  MaxAdContentRating,
} from "react-native-google-mobile-ads";
import { usePremiumStore } from "@/stores/usePremiumStore";
type AdUnit = "banner" | "native" | "interstitial" | "rewarded";
const lastShown: Record<AdUnit, number> = {
  banner: 0,
  native: 0,
  interstitial: 0,
  rewarded: 0,
};
let initialized = false;
let initializing: Promise<void> | null = null;
let consentAllowsAds = false;
let interstitial: InterstitialAd | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let showing = false;
let opportunity: { expires: number; active: boolean } | null = null;
function dispose() {
  interstitial?.removeAllListeners();
  interstitial = null;
}
export function canShowAd(unit: AdUnit): boolean {
  return (
    !usePremiumStore.getState().isPro &&
    (unit !== "interstitial" || Date.now() - lastShown.interstitial >= 300000)
  );
}
export function recordAdShown(unit: AdUnit) {
  lastShown[unit] = Date.now();
}
function showIfReady() {
  if (
    AppState.currentState !== "active" ||
    !opportunity?.active ||
    Date.now() > opportunity.expires ||
    !canShowAd("interstitial") ||
    !consentAllowsAds ||
    !interstitial?.loaded ||
    showing
  )
    return;
  opportunity.active = false;
  showing = true;
  void interstitial.show().catch((error) => {
    showing = false;
    dispose();
    console.warn("[ads] Show failed", error);
  });
}
function preload() {
  if (
    !initialized ||
    !consentAllowsAds ||
    !canShowAd("banner") ||
    interstitial ||
    retryTimer
  )
    return;
  if (!__DEV__ && !Constants.expoConfig?.extra?.admobProductionConfigured) {
    console.warn(
      "[ads] Production AdMob app ID missing or still a test ID; ads disabled.",
    );
    return;
  }
  const id = __DEV__
    ? TestIds.INTERSTITIAL
    : process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID;
  if (!id) {
    console.warn("[ads] Production interstitial ID missing; ads disabled.");
    return;
  }
  try {
    const ad = InterstitialAd.createForAdRequest(id, {
      requestNonPersonalizedAdsOnly: true,
    });
    interstitial = ad;
    ad.addAdEventListener(AdEventType.LOADED, () => {
      failures = 0;
      showIfReady();
    });
    ad.addAdEventListener(AdEventType.OPENED, () =>
      recordAdShown("interstitial"),
    );
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      showing = false;
      dispose();
      preload();
    });
    ad.addAdEventListener(AdEventType.ERROR, (error) => {
      console.warn("[ads] Load failed", error.message);
      showing = false;
      dispose();
      if (++failures <= 3)
        retryTimer = setTimeout(() => {
          retryTimer = null;
          preload();
        }, failures * 10000);
    });
    ad.load();
  } catch (error) {
    dispose();
    console.warn("[ads] Preload failed", error);
  }
}
export async function initAds(): Promise<void> {
  if (initialized || Platform.OS !== "android") return;
  if (initializing) return initializing;
  initializing = (async () => {
    try {
      try {
        await AdsConsent.gatherConsent();
      } catch (error) {
        console.warn("[ads] Consent update unavailable", error);
      }
      consentAllowsAds = (await AdsConsent.getConsentInfo()).canRequestAds;
      if (!consentAllowsAds) {
        console.debug("[ads] Waiting for consent before requesting ads.");
        return;
      }
      await mobileAds().setRequestConfiguration({
        maxAdContentRating: MaxAdContentRating.PG,
        tagForChildDirectedTreatment: false,
      });
      await mobileAds().initialize();
      initialized = true;
      preload();
    } catch (error) {
      console.warn("[ads] Initialization failed", error);
    }
  })().finally(() => {
    initializing = null;
  });
  return initializing;
}
/** A short, cancellable success-screen opportunity; never displays later on another screen. */
export function maybeShowInterstitial(): () => void {
  if (!canShowAd("interstitial")) return () => {};
  const current = { active: true, expires: Date.now() + 5000 };
  opportunity = current;
  void initAds().then(() => {
    preload();
    showIfReady();
  });
  showIfReady();
  const timer = setTimeout(() => {
    current.active = false;
  }, 5000);
  return () => {
    current.active = false;
    clearTimeout(timer);
  };
}
export async function openAdPrivacyChoices(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const info = await AdsConsent.getConsentInfo();
  if (
    info.privacyOptionsRequirementStatus !==
    AdsConsentPrivacyOptionsRequirementStatus.REQUIRED
  )
    return false;
  await AdsConsent.showPrivacyOptionsForm();
  consentAllowsAds = (await AdsConsent.getConsentInfo()).canRequestAds;
  dispose();
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (consentAllowsAds) {
    if (!initialized) await initAds();
    else preload();
  }
  return true;
}
