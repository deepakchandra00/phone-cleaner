import { useAppStore } from "@/stores/useAppStore";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { sendMeasuredCleanupAlert } from "./notifications";
import { smartCleanCandidates } from "./cleanupState";
import { KEYS, storage } from "./storage";

export const SCHEDULED_SCAN_TASK = "BACKGROUND_SCHEDULED_SCAN";
// Android schedules background scans; calendar reminders are independent.
try {
  TaskManager.defineTask(SCHEDULED_SCAN_TASK, async () => {
    try {
      await storage.waitForHydration();
      const isEnabled = storage.getBoolean(KEYS.scheduledScanEnabled);
      if (!isEnabled) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const result = await useAppStore
        .getState()
        .startScan({ requestPermissions: false });
      if (!result) return BackgroundFetch.BackgroundFetchResult.NoData;
      storage.set(KEYS.lastScanTs, Date.now());

      await sendMeasuredCleanupAlert(
        smartCleanCandidates(result).reduce(
          (bytes, file) => bytes + file.sizeBytes,
          0,
        ),
      );

      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (err) {
      console.warn("[BackgroundTasks] Scheduled scan error:", err);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
} catch {}

export async function registerScheduledScanTask(): Promise<boolean> {
  try {
    const isRegistered =
      await TaskManager.isTaskRegisteredAsync(SCHEDULED_SCAN_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(SCHEDULED_SCAN_TASK, {
        minimumInterval: 60 * 60 * 24 * 7, // approximately weekly, scheduled by Android
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
    const isRegistered =
      await TaskManager.isTaskRegisteredAsync(SCHEDULED_SCAN_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(SCHEDULED_SCAN_TASK);
    }
    return true;
  } catch (err) {
    console.warn("[BackgroundTasks] unregister error:", err);
    return false;
  }
}

export async function unregisterLegacyRamTask(): Promise<void> {
  const legacy = "BACKGROUND_DAILY_RAM";
  if (await TaskManager.isTaskRegisteredAsync(legacy))
    await BackgroundFetch.unregisterTaskAsync(legacy);
}
