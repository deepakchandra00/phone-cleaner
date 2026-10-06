import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { runRealScan } from "./realScanner";
import { storage, KEYS } from "./storage";
import { formatSizeCompact } from "./format";
import { AndroidStorage } from "android-storage";

export const SCHEDULED_SCAN_TASK = "BACKGROUND_SCHEDULED_SCAN";
export const DAILY_RAM_TASK = "BACKGROUND_DAILY_RAM";

// ── Notification channels (Android) ──────────────────────────────────────
async function ensureNotificationChannels() {
  try {
    await Notifications.setNotificationChannelAsync("cleaner-alerts", {
      name: "Cleaner Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#22c55e",
    });
    await Notifications.setNotificationChannelAsync("ram-boost", {
      name: "RAM Booster Reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#3b82f6",
    });
  } catch {}
}

// ── 1. Scheduled Background Scan & Sunday WhatsApp Reminder ─────────────
try {
  TaskManager.defineTask(SCHEDULED_SCAN_TASK, async () => {
    try {
      const isEnabled = storage.getBoolean(KEYS.scheduledScanEnabled);
      if (!isEnabled) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      await ensureNotificationChannels();
      const result = await runRealScan();
      storage.set(KEYS.lastScanTs, Date.now());

      const now = new Date();
      const isSunday = now.getDay() === 0;

      // Sunday WhatsApp Cache reminder
      if (isSunday && result && result.whatsappFiles.length > 0) {
        const waBytes = result.whatsappFiles.reduce((s, f) => s + f.sizeBytes, 0);
        if (waBytes > 50 * 1024 * 1024) {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: "WhatsApp Sunday Cleanup",
                body: `You have ${formatSizeCompact(waBytes)} of WhatsApp media. Tap to review and clean.`,
                data: { route: "/category/whatsapp" },
              },
              trigger: null,
            });
          } catch {}
        }
      }

      // General junk alert
      if (result && result.totalCleanableBytes > 300 * 1024 * 1024) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Phone Cleaner — Junk Detected",
              body: `Found ${formatSizeCompact(result.totalCleanableBytes)} of cleanable files. Free up space now.`,
              data: { route: "/(tabs)/scan" },
            },
            trigger: null,
          });
        } catch {}
      }

      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (err) {
      console.warn("[BackgroundTasks] Scheduled scan error:", err);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
} catch {}

// ── 2. Daily RAM Boost Task ──────────────────────────────────────────────
try {
  TaskManager.defineTask(DAILY_RAM_TASK, async () => {
    try {
      await ensureNotificationChannels();
      try {
        const mem = AndroidStorage.getMemoryInfo();
        const pctUsed = mem.totalMemBytes > 0
          ? Math.round(((mem.totalMemBytes - mem.availMemBytes) / mem.totalMemBytes) * 100)
          : 65;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Daily RAM Optimizer",
            body: `Your phone RAM is ${pctUsed}% full. Tap to boost performance.`,
            data: { route: "/(tabs)/home" },
          },
          trigger: null,
        });
      } catch {
        // Fallback notification without native memory query
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Morning Boost",
            body: "Speed up your phone today. Tap to boost RAM and free up space.",
            data: { route: "/(tabs)/home" },
          },
          trigger: null,
        });
      }
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
} catch {}

// ── Registration Helpers ─────────────────────────────────────────────────

export async function scheduleDailyRamNotification(): Promise<void> {
  try {
    await ensureNotificationChannels();
    // Schedule repeating daily notification at 9:00 AM
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Daily RAM Optimizer",
        body: "Start your morning with a faster phone. Tap to optimize RAM.",
        data: { route: "/(tabs)/home" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 9,
        minute: 0,
      },
    });
  } catch (err) {
    console.warn("[BackgroundTasks] scheduleDailyRamNotification error:", err);
  }
}

export async function scheduleSundayWhatsAppReminder(): Promise<void> {
  try {
    await ensureNotificationChannels();
    // Schedule weekly Sunday 11:00 AM notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Sunday WhatsApp Cleanup",
        body: "Check and clean your WhatsApp voice notes, media, and sent files.",
        data: { route: "/category/whatsapp" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 1, // Sunday
        hour: 11,
        minute: 0,
      },
    });
  } catch (err) {
    console.warn("[BackgroundTasks] scheduleSundayWhatsAppReminder error:", err);
  }
}

export async function registerScheduledScanTask(): Promise<boolean> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(SCHEDULED_SCAN_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(SCHEDULED_SCAN_TASK, {
        minimumInterval: 60 * 60 * 24 * 3, // 3 days
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
    await scheduleDailyRamNotification();
    await scheduleSundayWhatsAppReminder();
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
