export const REMINDER_PREFIX = "phone-cleaner-reminder-";
export const NOTIFICATION_ROUTES = [
  "/(tabs)/home",
  "/(tabs)/scan",
  "/category/whatsapp",
] as const;
export type NotificationRoute = (typeof NOTIFICATION_ROUTES)[number];
export function notificationRoute(value: unknown): NotificationRoute | null {
  return typeof value === "string" &&
    NOTIFICATION_ROUTES.some((route) => route === value)
    ? (value as NotificationRoute)
    : null;
}
export function parseReminderTime(
  value: string,
): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]),
    minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}
export interface ReminderPreferences {
  weekly: boolean;
  daily: boolean;
  hour: number;
  minute: number;
}
export function reminderPlan(prefs: ReminderPreferences) {
  const plan: {
    id: string;
    weekday?: number;
    hour: number;
    minute: number;
    title: string;
    body: string;
    route: NotificationRoute;
  }[] = [];
  if (prefs.weekly)
    plan.push({
      id: `${REMINDER_PREFIX}weekly`,
      weekday: 1,
      hour: 11,
      minute: 0,
      title: "Your Sunday storage review",
      body: "Review your WhatsApp media and choose what to keep or remove.",
      route: "/category/whatsapp",
    });
  if (prefs.daily) {
    const time = parseReminderTime(
      `${prefs.hour}:${String(prefs.minute).padStart(2, "0")}`,
    ) ?? { hour: 9, minute: 0 };
    const daily = {
      ...time,
      title: "Ready for a quick storage check?",
      body: "Review your storage and choose what to clean. Nothing is deleted automatically.",
      route: "/(tabs)/home" as const,
    };
    // With both options enabled, Sunday has only the weekly review.
    if (prefs.weekly)
      for (let weekday = 2; weekday <= 7; weekday++)
        plan.push({
          id: `${REMINDER_PREFIX}daily-${weekday}`,
          weekday,
          ...daily,
        });
    else plan.push({ id: `${REMINDER_PREFIX}daily`, ...daily });
  }
  return plan;
}
export function shouldSendCleanupAlert(
  bytes: number,
  now: number,
  lastAlert: number,
): boolean {
  return (
    Number.isFinite(bytes) &&
    bytes >= 300 * 1024 * 1024 &&
    now - lastAlert >= 24 * 60 * 60 * 1000
  );
}
