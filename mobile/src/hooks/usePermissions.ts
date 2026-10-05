import { useState, useCallback } from "react";
import { Platform, Linking } from "react-native";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Notifications from "expo-notifications";
import { track } from "@/lib/analytics";

export type PermissionStatus = "undetermined" | "granted" | "denied" | "blocked";

export interface PermissionState {
  media: PermissionStatus;
  notifications: PermissionStatus;
}

/**
 * Just-in-time permission helper.
 *
 * Design principle: NEVER request all permissions upfront. Each feature
 * requests its own permission when the user enters that feature.
 *
 * Onboarding only *explains* permissions and requests the one permission
 * needed for the first scan: media library access.
 */
export function usePermissions() {
  const [state, setState] = useState<PermissionState>({
    media: "undetermined",
    notifications: "undetermined",
  });

  const requestMedia = useCallback(async (): Promise<PermissionStatus> => {
    track("permission_request", { permission: "media_library" });
    const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync();
    const mapped: PermissionStatus =
      status === "granted" ? "granted" : canAskAgain ? "denied" : "blocked";
    setState((s) => ({ ...s, media: mapped }));
    track("permission_result", { permission: "media_library", result: mapped });
    return mapped;
  }, []);

  const requestNotifications = useCallback(async (): Promise<PermissionStatus> => {
    track("permission_request", { permission: "notifications" });
    const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
    const mapped: PermissionStatus =
      status === "granted" ? "granted" : canAskAgain ? "denied" : "blocked";
    setState((s) => ({ ...s, notifications: mapped }));
    track("permission_result", { permission: "notifications", result: mapped });
    return mapped;
  }, []);

  const openSystemSettings = useCallback(() => {
    if (Platform.OS === "android") {
      Linking.openSettings();
    } else {
      Linking.openSettings();
    }
  }, []);

  return { state, requestMedia, requestNotifications, openSystemSettings };
}
