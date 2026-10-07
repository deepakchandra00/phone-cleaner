import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  REMINDER_PREFIX,
  reminderPlan,
  type ReminderPreferences,
  shouldSendCleanupAlert,
} from "./notificationPolicy";
import { KEYS, storage } from "./storage";
import { formatSizeCompact } from "./format";

export const REMINDER_CHANNEL = "storage-reminders";
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});
export function getReminderPreferences(): ReminderPreferences {
  return {
    weekly: storage.getBoolean(KEYS.weeklyReminderEnabled) ?? true,
    daily: storage.getBoolean(KEYS.dailyReminderEnabled) ?? false,
    hour: storage.getNumber(KEYS.dailyReminderHour) ?? 9,
    minute: storage.getNumber(KEYS.dailyReminderMinute) ?? 0,
  };
}
export async function ensureReminderChannel() {
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: "Storage reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      enableVibrate: false,
      sound: null,
    });
}
let syncing: Promise<void> = Promise.resolve();
export function syncReminders(): Promise<void> {
  // Serialize schedule changes so rapid toggles cannot restore an old schedule.
  const next = syncing
    .catch(() => {})
    .then(async () => {
      await storage.waitForHydration();
      await ensureReminderChannel();
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const item of scheduled)
        if (
          item.identifier.startsWith(REMINDER_PREFIX) ||
          item.identifier === "phone-cleaner-weekly-review"
        )
          await Notifications.cancelScheduledNotificationAsync(item.identifier);
      if (!(await Notifications.getPermissionsAsync()).granted) return;
      for (const reminder of reminderPlan(getReminderPreferences())) {
        await Notifications.scheduleNotificationAsync({
          identifier: reminder.id,
          content: {
            title: reminder.title,
            body: reminder.body,
            sound: false,
            data: { route: reminder.route },
          },
          trigger: reminder.weekday
            ? {
                type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
                weekday: reminder.weekday,
                hour: reminder.hour,
                minute: reminder.minute,
                channelId: REMINDER_CHANNEL,
              }
            : {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: reminder.hour,
                minute: reminder.minute,
                channelId: REMINDER_CHANNEL,
              },
        });
      }
    });
  syncing = next;
  return next;
}
export async function allowReminders(): Promise<boolean> {
  await ensureReminderChannel();
  const existing = await Notifications.getPermissionsAsync();
  const permission =
    existing.granted ||
    (existing.canAskAgain &&
      (await Notifications.requestPermissionsAsync()).granted);
  if (!permission) return false;
  await syncReminders();
  return true;
}
export async function sendMeasuredCleanupAlert(
  safeCacheBytes: number,
): Promise<void> {
  await storage.waitForHydration();
  if (storage.getBoolean(KEYS.cleanupAlertsEnabled) === false) return;
  const now = Date.now();
  if (
    !shouldSendCleanupAlert(
      safeCacheBytes,
      now,
      storage.getNumber(KEYS.lastCleanupAlertTs) ?? 0,
    )
  )
    return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await ensureReminderChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Storage scan complete",
      body: `The latest scan found ${formatSizeCompact(safeCacheBytes)} of cache candidates. Tap to review before deleting.`,
      sound: false,
      data: { route: "/(tabs)/scan" },
    },
    trigger: { channelId: REMINDER_CHANNEL },
  });
  storage.set(KEYS.lastCleanupAlertTs, now);
}
export async function cancelCleanerReminders(): Promise<void> {
  // Keep the disable operation serialized with any in-flight scheduling work.
  storage.set(KEYS.weeklyReminderEnabled, false);
  storage.set(KEYS.dailyReminderEnabled, false);
  await syncReminders();
}
