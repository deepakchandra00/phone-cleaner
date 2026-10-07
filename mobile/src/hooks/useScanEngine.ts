import { maybeShowInterstitial } from "@/lib/ads";
import { track } from "@/lib/analytics";
import { useAppStore } from "@/stores/useAppStore";
import { useRouter } from "expo-router";
import { useCallback } from "react";

/**
 * Centralised scan trigger. Components call `runScan()` and the user is
 * navigated to the animated scan-progress screen; the store handles the
 * staged pipeline.
 */
export function useScanEngine() {
  const router = useRouter();
  const scanPhase = useAppStore((s) => s.scanPhase);

  const runScan = useCallback(() => {
    track("scan_started", { source: "engine_hook" });
    router.push("/scan-progress");
  }, [router]);

  return { runScan, scanPhase };
}

/** Call after a successful cleanup — triggers post-cleanup interstitial. */
export function usePostCleanupAd() {
  return useCallback(() => {
    maybeShowInterstitial();
  }, []);
}
