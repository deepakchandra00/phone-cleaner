import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAppStore, useAutoCleanableBytes } from "@/stores/useAppStore";
import { formatSizeCompact } from "@/lib/format";
import {
  AndroidStorage,
  DeviceTools,
  type NotificationPackage,
} from "android-storage";
import { useRouter } from "expo-router";
import { useEffect, useState, useCallback } from "react";
import { Alert, AppState, ScrollView, Text, View } from "react-native";

export default function QuickActions() {
  const router = useRouter();
  const bytes = useAutoCleanableBytes();
  const scanning = useAppStore((s) => s.scanPhase === "scanning");
  const hasScan = useAppStore((s) => Boolean(s.scanResult));
  const [status, setStatus] = useState(
    AndroidStorage.getNotificationCleanupStatus,
  );
  const [packages, setPackages] = useState<NotificationPackage[]>(
    DeviceTools.notificationPackages,
  );
  const [packagePage, setPackagePage] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const refresh = useCallback(() => {
    setStatus(AndroidStorage.getNotificationCleanupStatus());
    setPackages(DeviceTools.notificationPackages());
    setPackagePage(0);
  }, []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  const selectedCount = packages
    .filter((p) => !excluded.has(p.packageName))
    .reduce((n, p) => n + p.count, 0);
  const dismiss = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await DeviceTools.dismissNotifications(
        packages
          .filter((p) => !excluded.has(p.packageName))
          .map((p) => p.packageName),
      );
      if (!result.available) {
        setMessage(
          "Notification access is not connected yet. Return from Settings and try again.",
        );
        return;
      }
      // Do not count a submitted request as an acknowledged dismissal.
      await new Promise((resolve) => setTimeout(resolve, 600));
      const after = AndroidStorage.getNotificationCleanupStatus();
      setStatus(after);
      setPackages(DeviceTools.notificationPackages());
      setPackagePage(0);
      setMessage(
        result.requestedCount
          ? `Dismissal requested for ${result.requestedCount} notifications. ${after.clearableCount} dismissible notifications remain.`
          : "No dismissible notifications to clear.",
      );
    } catch {
      setMessage(
        "Notification cleanup is unavailable. Update the Android app or reconnect notification access.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <ScreenHeader
        title="Quick cleanup"
        subtitle="Storage review and notification cleanup"
        showBack
      />
      <View className="px-4 gap-4">
        <Card>
          <Text className="text-foreground text-lg font-bold mb-2">
            Review storage cleanup
          </Text>
          <Text className="text-muted-foreground text-sm mb-4">
            {hasScan
              ? `${formatSizeCompact(bytes)} of cache candidates from the latest scan. Review the files before confirming deletion.`
              : "Scan first to find accessible cache and photo copies. Nothing is deleted during a scan."}
          </Text>
          <Button
            onPress={() => {
              if (scanning) {
                router.push("/scan-progress");
                return;
              }
              if (hasScan) {
                router.push("/quick-clean");
                return;
              }
              useAppStore.getState().prepareScan();
              router.push("/scan-progress");
            }}
          >
            {scanning
              ? "View current scan"
              : hasScan
                ? "Review cleanup"
                : "Scan storage"}
          </Button>
        </Card>
        <Card>
          <Text className="text-foreground text-lg font-bold mb-2">
            Clear dismissible notifications
          </Text>
          <Text className="text-muted-foreground text-sm mb-4">
            Optional notification access lets SmartCare dismiss notifications
            when you tap this button. Ongoing notifications stay. Dismissing
            notifications does not close apps or free storage.
          </Text>
          {status.enabled && DeviceTools.available() && (
            <View className="gap-2 mb-3">
              <Text className="text-muted-foreground text-xs">
                Uncheck apps whose notifications you want to keep. This clears
                current notifications; future notifications are still allowed.
              </Text>
              <Button
                variant="outline"
                onPress={() => {
                  refresh();
                  setExcluded(new Set());
                }}
              >
                Refresh and select all
              </Button>
              {packages
                .slice(packagePage * 20, (packagePage + 1) * 20)
                .map((p) => (
                  <Button
                    key={p.packageName}
                    size="sm"
                    disabled={busy}
                    variant={
                      excluded.has(p.packageName) ? "outline" : "secondary"
                    }
                    onPress={() =>
                      setExcluded((old) => {
                        const next = new Set(old);
                        if (next.has(p.packageName)) next.delete(p.packageName);
                        else next.add(p.packageName);
                        return next;
                      })
                    }
                  >
                    {excluded.has(p.packageName) ? "☐" : "☑"} {p.label} (
                    {p.count})
                  </Button>
                ))}
              <Text className="text-muted-foreground text-xs">
                All listed apps are selected initially, including other pages.{" "}
                {packages.length} apps with clearable notifications.
              </Text>
              <View className="flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={busy || packagePage === 0}
                  onPress={() => setPackagePage(Math.max(0, packagePage - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={busy || (packagePage + 1) * 20 >= packages.length}
                  onPress={() => setPackagePage(packagePage + 1)}
                >
                  Next
                </Button>
              </View>
            </View>
          )}
          {!status.nativeAvailable || !DeviceTools.available() ? (
            <Text className="text-muted-foreground text-sm">
              This feature needs the updated Android app. Storage review is
              available above.
            </Text>
          ) : status.enabled ? (
            <Button
              loading={busy}
              disabled={status.connected && selectedCount === 0}
              onPress={() => {
                refresh();
                if (status.connected) void dismiss();
              }}
            >
              {status.connected
                ? `Clear selected (${selectedCount})`
                : "Check notification connection"}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onPress={() =>
                Alert.alert(
                  "Allow notification cleanup?",
                  "Android notification access can expose notification content to this app. SmartCare uses it only to dismiss notifications you choose to clear; it does not save or upload their contents.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Open access settings",
                      onPress: async () => {
                        if (
                          !(await AndroidStorage.requestNotificationCleanupAccess())
                        )
                          Alert.alert(
                            "Settings unavailable",
                            "Open Android Settings and search for Notification access. Allow SmartCare notification cleanup.",
                          );
                      },
                    },
                  ],
                )
              }
            >
              Enable optional notification access
            </Button>
          )}
          {!!message && (
            <Text
              accessibilityLiveRegion="polite"
              className="text-muted-foreground text-xs mt-3"
            >
              {message}
            </Text>
          )}
        </Card>
        <Text className="text-muted-foreground text-xs">
          Android manages running apps and RAM. These actions do not force-close
          other apps or claim a speed boost.
        </Text>
      </View>
    </ScrollView>
  );
}
