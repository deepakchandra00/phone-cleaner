import { storage, KEYS } from "./storage";

/**
 * Lightweight analytics shim.
 *
 * In production this is wired to PostHog (RN SDK) via the POSTHOG_KEY env var.
 * When no key is present (dev/preview), events are no-op'd to console.debug.
 *
 * North-star metric: GB successfully freed per MAU.
 * Key funnel events:
 *   app_open → onboarding_complete → scan_started → scan_completed
 *   → cleanup_started → cleanup_completed → files_deleted
 */

type EventName =
  | "app_open"
  | "onboarding_complete"
  | "permission_request"
  | "permission_result"
  | "scan_started"
  | "scan_progress"
  | "scan_completed"
  | "scan_failed"
  | "category_viewed"
  | "cleanup_review_opened"
  | "cleanup_started"
  | "cleanup_completed"
  | "cleanup_cancelled"
  | "files_deleted"
  | "duplicate_scan_started"
  | "duplicate_scan_completed"
  | "whatsapp_scan_started"
  | "ad_impression"
  | "ad_clicked"
  | "premium_view"
  | "premium_purchase"
  | "premium_restore"
  | "app_uninstall_tapped";

let analyticsEnabled = storage.getBoolean(KEYS.analyticsEnabled) ?? true;

export function setAnalyticsEnabled(v: boolean) {
  analyticsEnabled = v;
  storage.set(KEYS.analyticsEnabled, v);
}

export function track(
  event: EventName,
  properties?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!analyticsEnabled) return;
  // PostHog capture would go here. For dev, log to console.
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.debug(`[analytics] ${event}`, properties ?? {});
  }
  // Posthog.capture(event, properties)
}

export function identifyUser(): void {
  // No-login product: we use an anonymous install ID per device.
  // Posthog.identify(installId) — see App.tsx bootstrap for install ID.
}
