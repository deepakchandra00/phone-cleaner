import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useAppStore } from "@/stores/useAppStore";
import { track } from "@/lib/analytics";
import { maybeShowInterstitial } from "@/lib/ads";

/**
 * Centralised scan trigger. Components call `runScan()` and the user is
 * navigated to the animated scan-progress screen; the store handles the
 * staged pipeline.
 */
export function useScanEngine() {
  const router = useRouter();
  const startScan = useAppStore((s) => s.startScan);
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
