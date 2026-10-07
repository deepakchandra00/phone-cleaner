import {
  notificationRoute,
  type NotificationRoute,
} from "@/lib/notificationPolicy";
import { syncReminders } from "@/lib/notifications";
import { KEYS, storage } from "@/lib/storage";
import * as Notifications from "expo-notifications";
import { useNavigationContainerRef, usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

export function NotificationObserver() {
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  const pathname = usePathname();
  const [pending, setPending] = useState<{
    route: NotificationRoute;
    key: string;
  } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const handled = useRef<string | null>(null);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    let active = true;
    const receive = (response: Notifications.NotificationResponse) => {
      if (
        !active ||
        response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
      )
        return;
      const key = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      const route = notificationRoute(
        response.notification.request.content.data?.route,
      );
      if (route) setPending({ route, key });
    };
    const listener =
      Notifications.addNotificationResponseReceivedListener(receive);
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) receive(response);
      })
      .catch(() => {});
    void storage
      .waitForHydration()
      .then(() => {
        if (active) setHydrated(true);
        return syncReminders();
      })
      .catch((error) =>
        console.warn("[Notifications] Could not synchronize reminders", error),
      );
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void syncReminders().catch((error) =>
          console.warn(
            "[Notifications] Could not synchronize reminders",
            error,
          ),
        );
    });
    return () => {
      active = false;
      listener.remove();
      appState.remove();
    };
  }, []);
  useEffect(() => {
    // Let the normal cold-start/onboarding redirect finish before opening a review.
    if (
      !pending ||
      handled.current === pending.key ||
      !hydrated ||
      pathname === "/" ||
      pathname === "/onboarding" ||
      !storage.getBoolean(KEYS.onboardingComplete) ||
      !navigation.isReady()
    )
      return;
    handled.current = pending.key;
    router.push(pending.route);
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [pending, hydrated, pathname, navigation, router]);
  return null;
}
