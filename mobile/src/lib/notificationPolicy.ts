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
export const DAILY_THEMES: Record<
  number,
  { title: string; body: string; route: NotificationRoute }
> = {
  1: {
    title: "📊 Sunday Storage Summary",
    body: "Your weekly storage check is ready. Review and choose what to clean.",
    route: "/(tabs)/home",
  },
  2: {
    title: "⚡ Start your week fresh",
    body: "Quick storage check to keep your phone fast and clutter-free.",
    route: "/(tabs)/home",
  },
  3: {
    title: "📸 Duplicate Photo Audit",
    body: "Find and compress similar & duplicate photos taking up space.",
    route: "/(tabs)/scan",
  },
  4: {
    title: "🧹 Cache & Junk Review",
    body: "Temporary app files accumulate over time. Review and clear them safely.",
    route: "/(tabs)/scan",
  },
  5: {
    title: "🎬 Space Hogs Detected",
    body: "Check for large videos and heavy downloads hiding in your storage.",
    route: "/(tabs)/scan",
  },
  6: {
    title: "💬 WhatsApp Media Clean",
    body: "Review forwarded media and duplicate sent files before the weekend.",
    route: "/category/whatsapp",
  },
  7: {
    title: "🚀 Weekend Storage Boost",
    body: "Free up storage for your weekend photos and new apps.",
    route: "/(tabs)/home",
  },
};

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
    // With both options enabled, Sunday has only the weekly review.
    if (prefs.weekly)
      for (let weekday = 2; weekday <= 7; weekday++) {
        const theme = DAILY_THEMES[weekday] ?? {
          title: "Ready for a quick storage check?",
          body: "Review your storage and choose what to clean. Nothing is deleted automatically.",
          route: "/(tabs)/home",
        };
        plan.push({
          id: `${REMINDER_PREFIX}daily-${weekday}`,
          weekday,
          hour: time.hour,
          minute: time.minute,
          title: theme.title,
          body: theme.body,
          route: theme.route,
        });
      }
    else
      plan.push({
        id: `${REMINDER_PREFIX}daily`,
        hour: time.hour,
        minute: time.minute,
        title: "Ready for a quick storage check?",
        body: "Review your storage and choose what to clean. Nothing is deleted automatically.",
        route: "/(tabs)/home" as const,
      });
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
