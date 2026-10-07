import Constants from "expo-constants";
import { openAdPrivacyChoices } from "@/lib/ads";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { setAnalyticsEnabled } from "@/lib/analytics";
import {
  registerScheduledScanTask,
  unregisterScheduledScanTask,
} from "@/lib/backgroundTasks";
import {
  allowReminders,
  cancelCleanerReminders,
  getReminderPreferences,
  syncReminders,
} from "@/lib/notifications";
import { parseReminderTime } from "@/lib/notificationPolicy";
import * as Notifications from "expo-notifications";
import { formatRelativeTime, formatSizeCompact } from "@/lib/format";
import { KEYS, storage } from "@/lib/storage";
import { usePremiumStore } from "@/stores/usePremiumStore";
import { ThemeColors } from "@/theme/colors";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

interface Row {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  rightIcon?: boolean;
}

function SettingRow({
  icon,
  label,
  value,
  onPress,
  destructive,
  rightIcon = true,
}: Row) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 py-3 ${onPress ? "active:opacity-70" : ""}`}
    >
      <View
        className={`w-9 h-9 rounded-lg items-center justify-center ${destructive ? "bg-destructive/10" : "bg-muted"}`}
      >
        <Icon
          name={icon}
          size={16}
          color={destructive ? ThemeColors.destructive : ThemeColors.foreground}
        />
      </View>
      <Text
        className={`flex-1 text-sm font-medium ${destructive ? "text-destructive" : "text-foreground"}`}
      >
        {label}
      </Text>
      {value && <Text className="text-muted-foreground text-sm">{value}</Text>}
      {rightIcon && onPress && (
        <Icon
          name="chevron-forward"
          size={16}
          color={ThemeColors.mutedForeground}
        />
      )}
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  value,
  onToggle,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      className="flex-row items-center gap-3 py-3 active:opacity-70"
    >
      <View className="w-9 h-9 rounded-lg bg-muted items-center justify-center">
        <Icon name={icon} size={16} color={ThemeColors.foreground} />
      </View>
      <Text className="flex-1 text-sm font-medium text-foreground">
        {label}
      </Text>
      <View
        className={`w-11 h-6 rounded-full p-0.5 justify-center ${value ? "bg-primary" : "bg-muted"}`}
        style={{ alignItems: value ? "flex-end" : "flex-start" }}
      >
        <View className="w-5 h-5 rounded-full bg-white" />
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const permissions = usePermissions();
  const [, setPermissionVersion] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setPermissionVersion((v) => v + 1);
    });
    return () => sub.remove();
  }, []);
  const router = useRouter();
  const { isPro, entitlement } = usePremiumStore();
  const [analyticsOn, setAnalyticsOn] = useState(
    storage.getBoolean(KEYS.analyticsEnabled) ?? true,
  );
  const [scheduledOn, setScheduledOn] = useState(
    storage.getBoolean(KEYS.scheduledScanEnabled) ?? false,
  );

  const [reminders, setReminders] = useState(getReminderPreferences);
  const [alertsOn, setAlertsOn] = useState(
    storage.getBoolean(KEYS.cleanupAlertsEnabled) ?? true,
  );
  const [notificationsAllowed, setNotificationsAllowed] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [timeInput, setTimeInput] = useState(
    () =>
      `${reminders.hour.toString().padStart(2, "0")}:${reminders.minute.toString().padStart(2, "0")}`,
  );
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      await storage.waitForHydration();
      const permission = await Notifications.getPermissionsAsync();
      if (active) setNotificationsAllowed(permission.granted);
    };
    void refresh().catch(() => {});
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh().catch(() => {});
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  const requestReminderPermission = async () => {
    const allowed = await allowReminders();
    setNotificationsAllowed(allowed);
    if (!allowed)
      Alert.alert(
        "Notifications are off",
        "Allow SmartCare notifications in Android Settings to receive reminders.",
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
    return allowed;
  };
  const changeReminder = async (key: "weekly" | "daily") => {
    if (reminderBusy) return;
    setReminderBusy(true);
    const storageKey =
      key === "weekly" ? KEYS.weeklyReminderEnabled : KEYS.dailyReminderEnabled;
    const previous = reminders[key];
    try {
      if (!previous && !(await requestReminderPermission())) return;
      storage.set(storageKey, !previous);
      await syncReminders();
      setReminders(getReminderPreferences());
    } catch {
      storage.set(storageKey, previous);
      await syncReminders().catch(() => {});
      Alert.alert(
        "Reminder unavailable",
        "The reminder could not be scheduled. Please try again.",
      );
    } finally {
      setReminderBusy(false);
    }
  };
  const saveReminderTime = async () => {
    const time = parseReminderTime(timeInput);
    if (!time) {
      Alert.alert(
        "Check the time",
        "Enter a time in 24-hour format, such as 09:00 or 18:30.",
      );
      return;
    }
    if (reminderBusy) return;
    setReminderBusy(true);
    const previous = getReminderPreferences();
    try {
      storage.set(KEYS.dailyReminderHour, time.hour);
      storage.set(KEYS.dailyReminderMinute, time.minute);
      await syncReminders();
      setReminders(getReminderPreferences());
      setTimeInput(
        `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`,
      );
      Alert.alert(
        "Reminder time saved",
        "Your daily reminder time has been updated.",
      );
    } catch {
      storage.set(KEYS.dailyReminderHour, previous.hour);
      storage.set(KEYS.dailyReminderMinute, previous.minute);
      await syncReminders().catch(() => {});
      Alert.alert("Time not saved", "Please try again.");
    } finally {
      setReminderBusy(false);
    }
  };
  const changeAlerts = async () => {
    if (reminderBusy) return;
    setReminderBusy(true);
    try {
      if (!alertsOn && !(await requestReminderPermission())) return;
      storage.set(KEYS.cleanupAlertsEnabled, !alertsOn);
      setAlertsOn(!alertsOn);
    } catch {
      Alert.alert("Notifications unavailable", "Please try again.");
    } finally {
      setReminderBusy(false);
    }
  };

  const totalFreed = storage.getNumber(KEYS.totalFreedBytes) ?? 0;
  const cleanupCount = storage.getNumber(KEYS.cleanupCount) ?? 0;
  const lastScan = storage.getNumber(KEYS.lastScanTs);

  const handleToggleAnalytics = () => {
    const next = !analyticsOn;
    setAnalyticsOn(next);
    setAnalyticsEnabled(next);
  };

  const handleToggleScheduled = async () => {
    if (!isPro) {
      Alert.alert("Pro feature", "Scheduled scans are part of SmartCare Pro.", [
        { text: "Cancel", style: "cancel" },
        { text: "Upgrade", onPress: () => router.push("/premium") },
      ]);
      return;
    }
    const next = !scheduledOn;
    const succeeded = next
      ? await registerScheduledScanTask()
      : await unregisterScheduledScanTask();
    if (!succeeded) {
      Alert.alert(
        "Scheduled scan unavailable",
        "Android could not update background scanning. Please try again.",
      );
      return;
    }
    setScheduledOn(next);
    storage.set(KEYS.scheduledScanEnabled, next);
  };

  const handleReset = () => {
    Alert.alert(
      "Reset app data",
      "This clears your scan history, cleanup stats, and preferences. Your files are NOT touched.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await cancelCleanerReminders();
              if (!(await unregisterScheduledScanTask()))
                throw new Error("Unable to stop background scans");
              storage.clearAll();
              router.replace("/onboarding");
            } catch {
              Alert.alert(
                "Reset interrupted",
                "Unable to cancel reminders or background scans. Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: 110 }}
    >
      <ScreenHeader title="Settings" />

      {/* Pro status card */}
      <View className="px-4 mb-4">
        <Card>
          <View className="flex-row items-center gap-3">
            <View
              className={`w-12 h-12 rounded-xl items-center justify-center ${isPro ? "bg-primary/10" : "bg-muted"}`}
            >
              <Icon
                name="diamond"
                size={24}
                color={
                  isPro ? ThemeColors.primary : ThemeColors.mutedForeground
                }
              />
            </View>
            <View className="flex-1">
              <Text className="text-foreground font-bold">
                {isPro ? "SmartCare Pro" : "Free plan"}
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                {isPro
                  ? `Active · ${entitlement.plan === "pro_yearly" ? "Yearly" : "Monthly"} subscription`
                  : "Upgrade for similar photos, scheduled scans & more"}
              </Text>
            </View>
            {!isPro && (
              <Button
                variant="primary"
                size="sm"
                onPress={() => router.push("/premium")}
              >
                Upgrade
              </Button>
            )}
          </View>
        </Card>
      </View>

      {/* Stats */}
      <View className="px-4 mb-4">
        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
          Your impact
        </Text>
        <Card>
          <View className="flex-row gap-4">
            <View className="flex-1 items-center">
              <Text className="text-2xl font-bold text-primary">
                {formatSizeCompact(totalFreed)}
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                total freed
              </Text>
            </View>
            <View className="w-px bg-border" />
            <View className="flex-1 items-center">
              <Text className="text-2xl font-bold text-foreground">
                {cleanupCount}
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                cleanups
              </Text>
            </View>
            <View className="w-px bg-border" />
            <View className="flex-1 items-center">
              <Text className="text-2xl font-bold text-foreground">
                {lastScan ? formatRelativeTime(lastScan).split(" ")[0] : "—"}
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                last scan
              </Text>
            </View>
          </View>
        </Card>
      </View>

      <View className="px-4 mb-4">
        <Text className="text-xs font-semibold text-muted-foreground uppercase mb-2">
          Device permissions
        </Text>
        <Card>
          <SettingRow
            icon="folder-open"
            label="All files access"
            value={permissions.checkStorageManager() ? "Allowed" : "Enable"}
            onPress={permissions.requestStorageManager}
          />
          <SettingRow
            icon="apps"
            label="App usage access"
            value={permissions.checkUsageAccess() ? "Allowed" : "Enable"}
            onPress={permissions.requestUsageAccess}
          />
          <SettingRow
            icon="images"
            label="Photo & video access"
            value="Manage"
            onPress={permissions.openSystemSettings}
          />
          <Text className="text-muted-foreground text-xs mt-2">
            Usage access shows app storage sizes. Android controls permissions;
            return here to check the status.
          </Text>
        </Card>
      </View>
      {/* Preferences */}
      <View className="px-4 mb-4">
        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
          Preferences
        </Text>
        <Card>
          <ToggleRow
            icon="bar-chart"
            label="Usage analytics"
            value={analyticsOn}
            onToggle={handleToggleAnalytics}
          />
          <View className="h-px bg-border" />
          <ToggleRow
            icon="calendar"
            label="Weekly scheduled scan"
            value={scheduledOn}
            onToggle={handleToggleScheduled}
          />
          {!isPro && scheduledOn === false && (
            <View className="flex-row items-center gap-1.5 px-1 pb-2">
              <Icon
                name="lock-closed"
                size={11}
                color={ThemeColors.mutedForeground}
              />
              <Text className="text-muted-foreground text-xs">Pro feature</Text>
            </View>
          )}
        </Card>
      </View>

      <View className="px-4 mb-4">
        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
          Notifications
        </Text>
        <Card>
          <Text className="text-muted-foreground text-xs mb-2">
            {notificationsAllowed
              ? "Notifications allowed. Every cleanup opens review; nothing is deleted automatically."
              : "Notifications are off in system settings. Allow them to activate your chosen reminders."}
          </Text>
          {!notificationsAllowed && (
            <Button
              size="sm"
              variant="secondary"
              loading={reminderBusy}
              onPress={async () => {
                if (reminderBusy) return;
                setReminderBusy(true);
                try {
                  await requestReminderPermission();
                } catch {
                  Alert.alert("Notifications unavailable", "Please try again.");
                } finally {
                  setReminderBusy(false);
                }
              }}
            >
              Allow notifications
            </Button>
          )}
          <ToggleRow
            icon="calendar"
            label="Sunday WhatsApp review · 11:00"
            value={reminders.weekly}
            disabled={reminderBusy}
            onToggle={() => {
              void changeReminder("weekly");
            }}
          />
          <View className="h-px bg-border" />
          <ToggleRow
            icon="notifications"
            label="Daily storage reminder"
            value={reminders.daily}
            disabled={reminderBusy}
            onToggle={() => {
              void changeReminder("daily");
            }}
          />
          {reminders.daily && (
            <View className="pb-3">
              <Text className="text-muted-foreground text-xs mb-2">
                Daily time (24-hour format)
                {reminders.weekly ? ". Sunday uses the weekly review." : "."}
              </Text>
              <View className="flex-row gap-3 items-center">
                <TextInput
                  accessibilityLabel="Daily reminder time in 24-hour format"
                  value={timeInput}
                  onChangeText={setTimeInput}
                  placeholder="09:00"
                  maxLength={5}
                  keyboardType="numbers-and-punctuation"
                  editable={!reminderBusy}
                  className="flex-1 bg-muted text-foreground rounded-lg px-3 py-3"
                />
                <Button
                  size="sm"
                  loading={reminderBusy}
                  onPress={() => {
                    void saveReminderTime();
                  }}
                >
                  Save time
                </Button>
              </View>
            </View>
          )}
          <View className="h-px bg-border" />
          <ToggleRow
            icon="folder-open"
            label="Measured cleanup alerts"
            value={alertsOn}
            disabled={reminderBusy}
            onToggle={() => {
              void changeAlerts();
            }}
          />
          <Text className="text-muted-foreground text-xs mb-2">
            Reminder times are approximate and delivery may be delayed by your
            phone.
          </Text>
          <Text className="text-muted-foreground text-xs">
            Sent only after a scheduled scan finds at least 300 MB of cache
            candidates, at most once per 24 hours. Enable Weekly scheduled scan
            above to receive these alerts.
          </Text>
        </Card>
      </View>

      {/* About */}
      <View className="px-4 mb-4">
        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
          About
        </Text>
        <Card>
          <SettingRow
            icon="options"
            label="Ad privacy choices"
            onPress={() => {
              void openAdPrivacyChoices()
                .then((shown) => {
                  if (!shown)
                    Alert.alert(
                      "Ad privacy choices",
                      "No ad privacy form is currently required or available for this device. Ads follow your available consent choices.",
                    );
                })
                .catch(() =>
                  Alert.alert(
                    "Privacy form unavailable",
                    "Try again when connected to the internet.",
                  ),
                );
            }}
          />
          <View className="h-px bg-border" />
          <SettingRow
            icon="shield-checkmark"
            label="Privacy policy"
            onPress={() => {
              const url = Constants.expoConfig?.extra?.privacyPolicyUrl;
              if (typeof url !== "string" || !/^https:\/\//i.test(url)) {
                Alert.alert(
                  "Privacy policy",
                  "This document is not available in this build yet.",
                );
                return;
              }
              void Linking.openURL(url).catch(() =>
                Alert.alert(
                  "Unable to open",
                  "Please try again when connected to the internet.",
                ),
              );
            }}
          />
          <View className="h-px bg-border" />
          <SettingRow
            icon="document-text"
            label="Terms of service"
            onPress={() => {
              const url = Constants.expoConfig?.extra?.termsUrl;
              if (typeof url !== "string" || !/^https:\/\//i.test(url)) {
                Alert.alert(
                  "Terms of service",
                  "This document is not available in this build yet.",
                );
                return;
              }
              void Linking.openURL(url).catch(() =>
                Alert.alert(
                  "Unable to open",
                  "Please try again when connected to the internet.",
                ),
              );
            }}
          />
          <View className="h-px bg-border" />
          <SettingRow
            icon="information-circle"
            label="Version"
            value="1.0.0"
            onPress={undefined}
            rightIcon={false}
          />
          <View className="h-px bg-border" />
          <SettingRow
            icon="star"
            label="Rate SmartCare"
            onPress={() =>
              Linking.openURL("market://details?id=com.phonecleaner.app")
            }
          />
        </Card>
      </View>

      {/* Privacy promise */}
      <View className="px-4 mb-4">
        <View className="flex-row items-start gap-2 bg-accent/50 border border-primary/20 rounded-xl p-3.5">
          <Icon name="lock-closed" size={16} color={ThemeColors.primary} />
          <Text className="text-accent-foreground text-xs flex-1 leading-5">
            SmartCare never uploads your files. All scanning happens on your
            device. No account, no cloud, no tracking of your photos.
          </Text>
        </View>
      </View>

      {/* Danger zone */}
      <View className="px-4">
        <Card>
          <SettingRow
            icon="trash"
            label="Reset app data"
            onPress={handleReset}
            destructive
          />
        </Card>
      </View>
    </ScrollView>
  );
}
