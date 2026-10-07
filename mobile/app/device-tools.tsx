import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { formatSizeCompact } from "@/lib/format";
import {
  AndroidStorage,
  DeviceTools,
  type DataUsageReport,
  type WifiStatus,
} from "android-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, AppState, FlatList, Linking, Text, View } from "react-native";
export default function DeviceToolsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<"battery" | "wifi" | "data">("battery");
  const [battery, setBattery] = useState(DeviceTools.battery);
  const [wifi, setWifi] = useState<WifiStatus | null>(null);
  const [report, setReport] = useState<DataUsageReport | null>(null);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [usageAllowed, setUsageAllowed] = useState(
    AndroidStorage.isUsageAccessGranted,
  );
  const active = useRef(false);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    setBusy(true);
    setError("");
    setReport(null);
    try {
      setUsageAllowed(AndroidStorage.isUsageAccessGranted());
      if (!DeviceTools.available()) return;
      if (tab === "battery") setBattery(DeviceTools.battery());
      if (tab === "wifi") {
        const result = await DeviceTools.wifi();
        if (active.current && id === request.current) setWifi(result);
      }
      if (tab === "data" && AndroidStorage.isUsageAccessGranted()) {
        const end = Date.now();
        const result = await DeviceTools.dataUsage(end - days * 86400000, end);
        if (active.current && id === request.current) setReport(result);
      }
    } catch (e) {
      if (active.current && id === request.current)
        setError(
          e instanceof Error
            ? e.message
            : "Information unavailable. Try again.",
        );
    } finally {
      if (active.current && id === request.current) setBusy(false);
    }
  }, [tab, days]);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void refresh();
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") void refresh();
      });
      return () => {
        active.current = false;
        request.current++;
        sub.remove();
      };
    }, [refresh]),
  );
  const reading = (value: number | null | undefined, suffix: string) =>
    value == null
      ? "Unavailable"
      : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Device care"
        subtitle="Measured information and tools"
        showBack
      />
      <FlatList
        data={tab === "data" ? (report?.apps ?? []) : []}
        keyExtractor={(row) => String(row.uid)}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={3}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <Card className="mb-2">
            <Text className="text-foreground font-semibold">{item.label}</Text>
            <Text className="text-muted-foreground text-sm">
              Mobile {formatSizeCompact(item.mobileBytes)} · Wi-Fi{" "}
              {formatSizeCompact(item.wifiBytes)}
            </Text>
            {item.sharedUid && (
              <Text className="text-muted-foreground text-xs">
                Combined usage for apps sharing a system UID.
              </Text>
            )}
          </Card>
        )}
        ListHeaderComponent={
          <View className="gap-3 mb-3">
            <View className="flex-row gap-2">
              {(["battery", "wifi", "data"] as const).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  className="flex-1"
                  variant={tab === value ? "primary" : "secondary"}
                  onPress={() => setTab(value)}
                >
                  {value === "battery"
                    ? "Battery"
                    : value === "wifi"
                      ? "Wi-Fi"
                      : "Data"}
                </Button>
              ))}
            </View>
            {!DeviceTools.available() ? (
              <Card>
                <Text className="text-foreground">
                  These tools need the updated native Android app. An older APK
                  cannot receive them through a JavaScript update.
                </Text>
              </Card>
            ) : (
              <>
                {tab === "battery" && (
                  <Card>
                    <Text className="text-foreground text-2xl font-bold">
                      {reading(battery.levelPercent, "%")}
                    </Text>
                    <Text className="text-foreground mt-2">
                      {!battery.available
                        ? "Battery reading unavailable"
                        : battery.charging
                          ? "Charging"
                          : "Not charging"}
                    </Text>
                    <Text className="text-foreground mt-2">
                      Temperature: {reading(battery.temperatureC, " °C")}
                    </Text>
                    <Text className="text-foreground mt-2">
                      Voltage: {reading(battery.voltageMv, " mV")}
                    </Text>
                    <Text className="text-foreground mt-2">
                      Current:{" "}
                      {reading(
                        battery.currentMa == null
                          ? null
                          : Math.abs(battery.currentMa),
                        " mA",
                      )}
                    </Text>
                    <Text className="text-foreground mt-2">
                      System health status: {battery.healthStatus ?? "Unknown"}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-3">
                      Health status is not remaining battery capacity. Current
                      is an instantaneous device reading, not per-app drain.
                      Refresh for a new reading; no continuous background
                      polling.
                    </Text>
                  </Card>
                )}
                {tab === "wifi" && (
                  <Card>
                    <Text className="text-foreground text-lg font-bold">
                      {wifi?.connected
                        ? wifi.security
                        : "No active Wi-Fi connection"}
                    </Text>
                    {wifi?.connected && (
                      <>
                        <Text className="text-muted-foreground mt-2">
                          {wifi.warning}
                        </Text>
                        <Text className="text-muted-foreground mt-2">
                          Wi-Fi link speed:{" "}
                          {reading(wifi.linkSpeedMbps, " Mbps")} (not internet
                          speed)
                        </Text>
                      </>
                    )}
                    <Text className="text-muted-foreground text-xs mt-3">
                      This checks available connection information. It does not
                      scan for attackers, prove safety or provide VPN
                      protection.
                    </Text>
                    <Button
                      variant="outline"
                      className="mt-3"
                      onPress={() =>
                        void Linking.sendIntent(
                          "android.settings.WIFI_SETTINGS",
                        ).catch(() =>
                          Alert.alert(
                            "Wi-Fi settings",
                            "Open Wi-Fi from Android Settings.",
                          ),
                        )
                      }
                    >
                      Open Wi-Fi settings
                    </Button>
                  </Card>
                )}
                {tab === "data" && (
                  <Card>
                    <Text className="text-foreground font-bold">
                      Which apps use your data?
                    </Text>
                    <View className="flex-row gap-2 my-3">
                      {[7, 30, 90].map((value) => (
                        <Button
                          size="sm"
                          key={value}
                          variant={days === value ? "primary" : "secondary"}
                          className="flex-1"
                          onPress={() => setDays(value)}
                        >
                          {value} days
                        </Button>
                      ))}
                    </View>
                    {!usageAllowed ? (
                      <Button
                        onPress={() =>
                          void AndroidStorage.requestUsageAccess().then(
                            (ok) => {
                              if (!ok)
                                Alert.alert(
                                  "Usage access",
                                  "Open Android Settings and search for Usage access.",
                                );
                            },
                          )
                        }
                      >
                        Enable usage access
                      </Button>
                    ) : (
                      <Text className="text-muted-foreground text-sm">
                        System-recorded totals, largest first. Sampling, shared
                        UIDs, app visibility and permissions can limit results.
                        These are not carrier billing totals.
                      </Text>
                    )}
                    {report && (
                      <Text className="text-foreground mt-2">
                        {formatSizeCompact(
                          report.apps.reduce((n, a) => n + a.totalBytes, 0),
                        )}{" "}
                        across {report.apps.length} visible UID records
                      </Text>
                    )}
                    {!!report?.unavailable.length && (
                      <Text className="text-muted-foreground mt-2">
                        Unavailable: {report.unavailable.join(", ")}. Remaining
                        totals are partial.
                      </Text>
                    )}
                  </Card>
                )}
                <Button
                  variant="outline"
                  loading={busy}
                  onPress={() => void refresh()}
                >
                  Refresh information
                </Button>
              </>
            )}
            {!!error && (
              <Text
                accessibilityLiveRegion="polite"
                className="text-destructive"
              >
                {error}
              </Text>
            )}
            <Button
              variant="secondary"
              onPress={() => router.push("/photo-compress")}
            >
              Compress photos
            </Button>
            <Button
              variant="secondary"
              onPress={() => router.push("/speed-test")}
            >
              Test internet speed
            </Button>
          </View>
        }
      />
    </View>
  );
}
