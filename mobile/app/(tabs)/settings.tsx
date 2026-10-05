import { useState } from "react";
import { View, Text, Pressable, ScrollView, Linking, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { usePremiumStore } from "@/stores/usePremiumStore";
import { storage, KEYS } from "@/lib/storage";
import { setAnalyticsEnabled } from "@/lib/analytics";
import { formatSizeCompact, formatRelativeTime } from "@/lib/format";
import { ThemeColors } from "@/theme/colors";

interface Row {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  rightIcon?: boolean;
}

function SettingRow({ icon, label, value, onPress, destructive, rightIcon = true }: Row) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 py-3 ${onPress ? "active:opacity-70" : ""}`}
    >
      <View
        className={`w-9 h-9 rounded-lg items-center justify-center ${destructive ? "bg-destructive/10" : "bg-muted"}`}
      >
        <Icon name={icon} size={16} color={destructive ? ThemeColors.destructive : ThemeColors.foreground} />
      </View>
      <Text className={`flex-1 text-sm font-medium ${destructive ? "text-destructive" : "text-foreground"}`}>
        {label}
      </Text>
      {value && <Text className="text-muted-foreground text-sm">{value}</Text>}
      {rightIcon && onPress && <Icon name="chevron-forward" size={16} color={ThemeColors.mutedForeground} />}
    </Pressable>
  );
}

function ToggleRow({ icon, label, value, onToggle }: { icon: IconName; label: string; value: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} className="flex-row items-center gap-3 py-3 active:opacity-70">
      <View className="w-9 h-9 rounded-lg bg-muted items-center justify-center">
        <Icon name={icon} size={16} color={ThemeColors.foreground} />
      </View>
      <Text className="flex-1 text-sm font-medium text-foreground">{label}</Text>
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
  const router = useRouter();
  const { isPro, entitlement } = usePremiumStore();
  const [analyticsOn, setAnalyticsOn] = useState(storage.getBoolean(KEYS.analyticsEnabled) ?? true);
  const [scheduledOn, setScheduledOn] = useState(storage.getBoolean(KEYS.scheduledScanEnabled) ?? false);
  const [theme, setTheme] = useState<"system" | "light" | "dark">(storage.getString(KEYS.theme) as any ?? "system");

  const totalFreed = storage.getNumber(KEYS.totalFreedBytes) ?? 0;
  const cleanupCount = storage.getNumber(KEYS.cleanupCount) ?? 0;
  const lastScan = storage.getNumber(KEYS.lastScanTs);

  const handleToggleAnalytics = () => {
    const next = !analyticsOn;
    setAnalyticsOn(next);
    setAnalyticsEnabled(next);
  };

  const handleToggleScheduled = () => {
    if (!isPro) {
      Alert.alert(
        "Pro feature",
        "Scheduled scans are part of Phone Cleaner Pro.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Upgrade", onPress: () => router.push("/premium") },
        ],
      );
      return;
    }
    const next = !scheduledOn;
    setScheduledOn(next);
    storage.set(KEYS.scheduledScanEnabled, next);
    // In production: register/unregister expo-background-fetch task here.
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
          onPress: () => {
            storage.clearAll();
            router.replace("/onboarding");
          },
        },
      ],
    );
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 110 }}>
      <ScreenHeader title="Settings" />

      {/* Pro status card */}
      <View className="px-4 mb-4">
        <Card>
          <View className="flex-row items-center gap-3">
            <View className={`w-12 h-12 rounded-xl items-center justify-center ${isPro ? "bg-primary/10" : "bg-muted"}`}>
              <Icon name="diamond" size={24} color={isPro ? ThemeColors.primary : ThemeColors.mutedForeground} />
            </View>
            <View className="flex-1">
              <Text className="text-foreground font-bold">
                {isPro ? "Phone Cleaner Pro" : "Free plan"}
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                {isPro
                  ? `Active · ${entitlement.plan === "pro_yearly" ? "Yearly" : "Monthly"} subscription`
                  : "Upgrade for similar photos, scheduled scans & more"}
              </Text>
            </View>
            {!isPro && (
              <Button variant="primary" size="sm" onPress={() => router.push("/premium")}>
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
              <Text className="text-2xl font-bold text-primary">{formatSizeCompact(totalFreed)}</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">total freed</Text>
            </View>
            <View className="w-px bg-border" />
            <View className="flex-1 items-center">
              <Text className="text-2xl font-bold text-foreground">{cleanupCount}</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">cleanups</Text>
            </View>
            <View className="w-px bg-border" />
            <View className="flex-1 items-center">
              <Text className="text-2xl font-bold text-foreground">
                {lastScan ? formatRelativeTime(lastScan).split(" ")[0] : "—"}
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">last scan</Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Preferences */}
      <View className="px-4 mb-4">
        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
          Preferences
        </Text>
        <Card>
          <ToggleRow icon="bar-chart" label="Usage analytics" value={analyticsOn} onToggle={handleToggleAnalytics} />
          <View className="h-px bg-border" />
          <ToggleRow icon="calendar" label="Weekly scheduled scan" value={scheduledOn} onToggle={handleToggleScheduled} />
          {!isPro && scheduledOn === false && (
            <View className="flex-row items-center gap-1.5 px-1 pb-2">
              <Icon name="lock-closed" size={11} color={ThemeColors.mutedForeground} />
              <Text className="text-muted-foreground text-xs">Pro feature</Text>
            </View>
          )}
        </Card>
      </View>

      {/* About */}
      <View className="px-4 mb-4">
        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
          About
        </Text>
        <Card>
          <SettingRow icon="shield-checkmark" label="Privacy policy" onPress={() => Linking.openURL("https://phonecleaner.app/privacy")} />
          <View className="h-px bg-border" />
          <SettingRow icon="document-text" label="Terms of service" onPress={() => Linking.openURL("https://phonecleaner.app/terms")} />
          <View className="h-px bg-border" />
          <SettingRow icon="information-circle" label="Version" value="1.0.0" onPress={undefined} rightIcon={false} />
          <View className="h-px bg-border" />
          <SettingRow icon="star" label="Rate Phone Cleaner" onPress={() => Linking.openURL("market://details?id=com.phonecleaner.app")} />
        </Card>
      </View>

      {/* Privacy promise */}
      <View className="px-4 mb-4">
        <View className="flex-row items-start gap-2 bg-accent/50 border border-primary/20 rounded-xl p-3.5">
          <Icon name="lock-closed" size={16} color={ThemeColors.primary} />
          <Text className="text-accent-foreground text-xs flex-1 leading-5">
            Phone Cleaner never uploads your files. All scanning happens on your device. No account, no cloud, no tracking of your photos.
          </Text>
        </View>
      </View>

      {/* Danger zone */}
      <View className="px-4">
        <Card>
          <SettingRow icon="trash" label="Reset app data" onPress={handleReset} destructive />
        </Card>
      </View>
    </ScrollView>
  );
}
