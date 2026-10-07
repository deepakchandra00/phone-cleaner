import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { formatSizeCompact } from "@/lib/format";
import {
  DeviceTools,
  InternetSpeed,
  type SpeedTestResult,
} from "android-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, AppState, Linking, ScrollView, Text, View } from "react-native";
export default function SpeedTest() {
  const [result, setResult] = useState<SpeedTestResult | null>(null);
  const [busy, setBusy] = useState(false),
    [stage, setStage] = useState("Ready"),
    [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const active = useRef(false),
    runId = useRef<string | null>(null);
  const cancel = useCallback(() => {
    if (runId.current) {
      InternetSpeed.cancel(runId.current);
      if (active.current) setStage("Cancelling current request…");
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      const subscription = InternetSpeed.listen((event) => {
        if (active.current && event.id === runId.current) {
          setStage(event.stage);
          setPercent(event.percent);
        }
      });
      const app = AppState.addEventListener("change", (state) => {
        if (state !== "active") cancel();
      });
      return () => {
        active.current = false;
        cancel();
        subscription.remove();
        app.remove();
      };
    }, [cancel]),
  );
  const start = async () => {
    if (runId.current) return;
    const id = `${Date.now()}-${Math.random()}`;
    runId.current = id;
    setBusy(true);
    setResult(null);
    setError("");
    setPercent(0);
    setStage("Connecting");
    try {
      const value = await InternetSpeed.run(id);
      if (active.current) setResult(value);
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error
            ? e.message
            : "The test could not finish. Try another connection.",
        );
    } finally {
      runId.current = null;
      if (active.current) setBusy(false);
    }
  };
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <ScreenHeader
        title="Internet speed"
        subtitle="A bounded connection estimate"
        showBack
      />
      <View className="px-4 gap-4">
        <Card>
          <Text className="text-foreground text-lg font-bold">
            Test your current connection
          </Text>
          <Text className="text-muted-foreground mt-3">
            Uses about 8 MB of test traffic, plus network overhead. The HTTPS
            requests go to Cloudflare's measurement servers, which receive your
            IP address and request information. Mobile-data charges may apply.
          </Text>
          <Text className="text-muted-foreground text-xs mt-3">
            Three download/upload samples and five request-latency samples.
            Small, single-connection tests can underestimate fast connections.
            Results are not a guaranteed ISP speed or a Wi-Fi link-speed
            reading.
          </Text>
          <Button
            variant="outline"
            className="mt-3"
            onPress={() =>
              void Linking.openURL("https://www.cloudflare.com/privacypolicy/")
            }
          >
            Provider privacy information
          </Button>
        </Card>
        {!DeviceTools.available() && (
          <Text className="text-destructive">
            This feature needs the updated native Android app.
          </Text>
        )}
        {busy ? (
          <Card>
            <Text accessibilityLiveRegion="polite" className="text-foreground">
              {stage} · {percent}%
            </Text>
            <View className="h-2 bg-muted rounded-full my-3">
              <View
                className="h-2 bg-primary rounded-full"
                style={{ width: `${percent}%` }}
              />
            </View>
            <Button variant="outline" onPress={cancel}>
              Cancel test
            </Button>
          </Card>
        ) : (
          <Button
            disabled={!DeviceTools.available()}
            onPress={() =>
              Alert.alert(
                "Start internet test?",
                "This sends about 8 MB of test traffic to Cloudflare. Continue on your current connection?",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Start test", onPress: () => void start() },
                ],
              )
            }
          >
            Start speed test
          </Button>
        )}
        {!!error && (
          <Text accessibilityLiveRegion="polite" className="text-destructive">
            {error}
          </Text>
        )}
        {result && (
          <Card>
            <Text className="text-foreground text-xl font-bold">
              Download{" "}
              {result.downloadMbps.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}{" "}
              Mbps
            </Text>
            <Text className="text-foreground text-xl font-bold mt-3">
              Upload{" "}
              {result.uploadMbps.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}{" "}
              Mbps
            </Text>
            <Text className="text-foreground mt-3">
              Request latency{" "}
              {result.latencyMs.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}{" "}
              ms
            </Text>
            <Text className="text-muted-foreground text-xs mt-3">
              {result.provider} · {result.method} ·{" "}
              {formatSizeCompact(result.transferredBytes)} payload transferred.
              Results include request/server overhead.
            </Text>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
