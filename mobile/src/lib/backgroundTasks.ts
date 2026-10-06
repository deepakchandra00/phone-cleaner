import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { runRealScan } from "./realScanner";
import { storage, KEYS } from "./storage";

export const SCHEDULED_SCAN_TASK = "BACKGROUND_SCHEDULED_SCAN";

try {
  TaskManager.defineTask(SCHEDULED_SCAN_TASK, async () => {
    try {
      const isEnabled = storage.getBoolean(KEYS.scheduledScanEnabled);
      if (!isEnabled) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      await runRealScan();
      storage.set(KEYS.lastScanTs, Date.now());
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (err) {
      console.warn("[BackgroundTasks] Scheduled scan task error:", err);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
} catch {
  // Task definition may fail in dev environments without native background fetch
}

export async function registerScheduledScanTask(): Promise<boolean> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(SCHEDULED_SCAN_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(SCHEDULED_SCAN_TASK, {
        minimumInterval: 60 * 60 * 24 * 7, // 7 days (weekly)
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
    return true;
  } catch (err) {
    console.warn("[BackgroundTasks] register error:", err);
    return false;
  }
}

export async function unregisterScheduledScanTask(): Promise<boolean> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(SCHEDULED_SCAN_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(SCHEDULED_SCAN_TASK);
    }
    return true;
  } catch (err) {
    console.warn("[BackgroundTasks] unregister error:", err);
    return false;
  }
}
