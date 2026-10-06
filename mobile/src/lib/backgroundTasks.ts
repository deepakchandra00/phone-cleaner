import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { runRealScan } from "./realScanner";
import { storage, KEYS } from "./storage";

import * as Notifications from "expo-notifications";
import { formatSizeCompact } from "./format";

export const SCHEDULED_SCAN_TASK = "BACKGROUND_SCHEDULED_SCAN";

try {
  TaskManager.defineTask(SCHEDULED_SCAN_TASK, async () => {
    try {
      const isEnabled = storage.getBoolean(KEYS.scheduledScanEnabled);
      if (!isEnabled) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const result = await runRealScan();
      storage.set(KEYS.lastScanTs, Date.now());

      if (result && result.totalCleanableBytes > 500 * 1024 * 1024) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Phone Cleaner — Junk Detected",
              body: `Found ${formatSizeCompact(result.totalCleanableBytes)} of junk files. Tap to quick clean.`,
            },
            trigger: null,
          });
        } catch {}
      }

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
