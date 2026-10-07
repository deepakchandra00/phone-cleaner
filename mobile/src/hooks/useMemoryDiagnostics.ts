import { AndroidStorage } from "android-storage";
import { useEffect } from "react";
/** Development-only snapshots for repeated navigation testing; no content or file paths. */
export function useMemoryDiagnostics(screen: string) {
  useEffect(() => {
    if (!__DEV__) return;
    const sample = () => {
      const memory = AndroidStorage.getAppMemoryDiagnostics();
      if (memory) console.debug("[memory]", screen, memory);
    };
    const timer = setTimeout(sample, 1200);
    return () => {
      clearTimeout(timer);
      sample();
    };
  }, [screen]);
}
