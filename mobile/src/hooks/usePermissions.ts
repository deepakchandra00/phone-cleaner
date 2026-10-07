import { track } from "@/lib/analytics";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Notifications from "expo-notifications";
import { useCallback, useState } from "react";
import { Alert, Linking, Platform } from "react-native";

/**
 * Just-in-time permission helper.
 *
 * Design principle: NEVER request all permissions upfront. Each feature
 * requests its own permission when the user enters that feature.
 *
 * Onboarding only *explains* permissions and requests the one permission
 * needed for the first scan: media library access.
 */
import { AndroidStorage } from "android-storage";

export type PermissionStatus =
  "undetermined" | "granted" | "denied" | "blocked";

export interface PermissionState {
  media: PermissionStatus;
  notifications: PermissionStatus;
}

export function usePermissions() {
  const [state, setState] = useState<PermissionState>({
    media: "undetermined",
    notifications: "undetermined",
  });

  const checkStorageManager = useCallback((): boolean => {
    if (Platform.OS !== "android") return true;
    return AndroidStorage.isExternalStorageManager();
  }, []);

  const requestStorageManager = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true;
    return await AndroidStorage.requestManageAllFilesAccess();
  }, []);

  const requestMedia = useCallback(async (): Promise<PermissionStatus> => {
    track("permission_request", { permission: "media_library" });
    const { status, canAskAgain } =
      await MediaLibrary.requestPermissionsAsync();
    const mapped: PermissionStatus =
      status === "granted" ? "granted" : canAskAgain ? "denied" : "blocked";
    setState((s) => ({ ...s, media: mapped }));
    track("permission_result", { permission: "media_library", result: mapped });
    return mapped;
  }, []);

  const requestNotifications =
    useCallback(async (): Promise<PermissionStatus> => {
      track("permission_request", { permission: "notifications" });
      const { status, canAskAgain } =
        await Notifications.requestPermissionsAsync();
      const mapped: PermissionStatus =
        status === "granted" ? "granted" : canAskAgain ? "denied" : "blocked";
      setState((s) => ({ ...s, notifications: mapped }));
      track("permission_result", {
        permission: "notifications",
        result: mapped,
      });
      return mapped;
    }, []);

  const openSystemSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  const checkUsageAccess = useCallback((): boolean => {
    if (Platform.OS !== "android") return true;
    return AndroidStorage.isUsageAccessGranted();
  }, []);

  const requestUsageAccess = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true;
    const status = AndroidStorage.getUsageAccessStatus();
    if (status.granted) return true;
    if (!status.nativeAvailable || status.declared === false) {
      Alert.alert(
        "App statistics unavailable",
        status.declared === false
          ? "This installed version does not declare usage access. Install the updated Android app when it is available. File and photo cleanup still work without usage access."
          : "App statistics require the installed Android version of Phone Cleaner. File and photo cleanup are still available.",
      );
      return false;
    }
    const opened = await AndroidStorage.requestUsageAccess();
    if (!opened) {
      Alert.alert(
        "Usage settings unavailable",
        "Open Android Settings, search for Usage access, select Phone Cleaner, and enable Allow usage access. Your device or administrator may restrict this permission.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open settings",
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ],
      );
    }
    return opened;
  }, []);

  return {
    state,
    requestMedia,
    requestNotifications,
    openSystemSettings,
    checkStorageManager,
    requestStorageManager,
    checkUsageAccess,
    requestUsageAccess,
  };
}
