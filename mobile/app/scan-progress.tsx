import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useAppStore } from "@/stores/useAppStore";
import { ThemeColors } from "@/theme/colors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShallow } from "zustand/react/shallow";

const STEPS = [
  { label: "Check permissions", threshold: 0 },
  { label: "Photos, videos & audio", threshold: 0.15 },
  { label: "Downloads & WhatsApp", threshold: 0.55 },
  { label: "Temporary files & cache", threshold: 0.75 },
  { label: "Compare photo copies", threshold: 0.85 },
  { label: "Build your review report", threshold: 0.92 },
];

export default function ScanProgress() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { includeDuplicates } = useLocalSearchParams<{
    includeDuplicates?: string;
  }>();
  const { scanPhase, scanProgress, scanStage } = useAppStore(
    useShallow((s) => ({
      scanPhase: s.scanPhase,
      scanProgress: s.scanProgress,
      scanStage: s.scanStage,
    })),
  );
  const started = useRef(false);
  const startedAt = useRef(0);
  const [seconds, setSeconds] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(0);
  const pulse = useSharedValue(1);
  const progress = useSharedValue(0);
  const running = scanPhase === "scanning";
  useEffect(() => {
    progress.value = withTiming(Math.max(0, Math.min(1, scanProgress)), {
      duration: reducedMotion ? 0 : 350,
    });
  }, [scanProgress, progress, reducedMotion]);
  useEffect(() => {
    if (running && !reducedMotion) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 2400, easing: Easing.linear }),
        -1,
      );
      pulse.value = withRepeat(
        withTiming(1.12, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(rotation);
      cancelAnimation(pulse);
      pulse.value = 1;
    }
    return () => {
      cancelAnimation(rotation);
      cancelAnimation(pulse);
    };
  }, [running, reducedMotion, rotation, pulse]);
  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 0.4 + (1.12 - pulse.value) * 3,
  }));
  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      startedAt.current = Date.now();
      if (useAppStore.getState().scanPhase !== "scanning") {
        useAppStore.getState().prepareScan();
        void useAppStore
          .getState()
          .startScan({ includeDuplicates: includeDuplicates === "true" });
      }
    }
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [includeDuplicates]);
  useEffect(() => {
    if (scanPhase !== "done") return;
    const timer = setTimeout(() => router.replace("/(tabs)/scan"), 1400);
    return () => clearTimeout(timer);
  }, [scanPhase, router]);
  const pct = Math.min(100, Math.round(scanProgress * 100));
  const failed = scanPhase === "error";
  const steps = STEPS.filter(
    (s) => includeDuplicates === "true" || s.threshold !== 0.85,
  );
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 32,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
      }}
    >
      <View className="items-center mb-6">
        <View
          style={{
            width: 156,
            height: 156,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <Animated.View
            style={[
              {
                position: "absolute",
                width: 130,
                height: 130,
                borderRadius: 65,
                borderWidth: 1,
                borderColor: ThemeColors.primary,
              },
              pulseStyle,
            ]}
          />
          <Animated.View
            style={[
              {
                position: "absolute",
                width: 150,
                height: 150,
                borderRadius: 75,
                borderWidth: 3,
                borderColor: `${ThemeColors.primary}25`,
                borderTopColor: ThemeColors.primary,
                borderRightColor: ThemeColors.primary,
              },
              orbitStyle,
            ]}
          />
          <View className="w-24 h-24 rounded-full bg-primary/10 items-center justify-center">
            <Icon
              name={
                failed ? "warning" : scanPhase === "done" ? "checkmark" : "scan"
              }
              size={32}
              color={ThemeColors.primary}
            />
            <Text className="text-primary text-xl font-bold mt-1">{pct}%</Text>
          </View>
        </View>
        <Text className="text-foreground text-2xl font-bold">
          {failed
            ? "Scan interrupted"
            : scanPhase === "done"
              ? "Your report is ready"
              : "Finding space for you"}
        </Text>
        <Text className="text-muted-foreground text-sm text-center mt-2">
          {failed
            ? "Please check permissions and try again."
            : "Your files stay on this phone. Nothing is deleted during a scan."}
        </Text>
      </View>
      <View className="bg-card border border-border rounded-2xl p-5 mb-5">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-primary text-3xl font-bold">{pct}%</Text>
          <Text className="text-muted-foreground text-sm">
            {Math.floor(seconds / 60)}m {seconds % 60}s elapsed
          </Text>
        </View>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Storage scan"
          accessibilityValue={{ min: 0, max: 100, now: pct }}
          className="h-2 bg-muted rounded-full overflow-hidden mb-3"
        >
          <Animated.View
            style={[
              {
                backgroundColor: ThemeColors.primary,
                height: 8,
                borderRadius: 4,
              },
              barStyle,
            ]}
          />
        </View>
        <Text
          accessibilityLiveRegion="polite"
          className="text-foreground text-sm"
        >
          {scanStage || "Preparing scan…"}
        </Text>
        {seconds > 20 && !failed && (
          <Text className="text-muted-foreground text-xs mt-3">
            Large libraries and photo comparisons take longer. You can view the
            dashboard while this scan continues.
          </Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetails }}
        onPress={() => setShowDetails((v) => !v)}
        className="flex-row items-center justify-between py-3"
      >
        <Text className="text-foreground font-semibold text-sm">
          What is being checked?
        </Text>
        <Icon
          name={showDetails ? "chevron-up" : "chevron-down"}
          size={18}
          color={ThemeColors.mutedForeground}
        />
      </Pressable>
      {showDetails && (
        <Text className="text-muted-foreground text-xs mb-3">
          We read accessible files, compare photo contents, then save a report
          for your review. Photo comparison takes longer for large libraries.
          Android permissions determine what can be checked.
        </Text>
      )}
      {steps.map((step, i) => {
        const next = steps[i + 1]?.threshold ?? 1;
        const complete = scanProgress >= next;
        const active = running && scanProgress >= step.threshold && !complete;
        return (
          <View
            key={step.label}
            className="flex-row items-center gap-3 py-3 border-b border-border"
          >
            {active ? (
              <Animated.View style={orbitStyle}>
                <Icon name="sync" size={20} color={ThemeColors.primary} />
              </Animated.View>
            ) : (
              <Icon
                name={complete ? "checkmark-circle" : "ellipse-outline"}
                size={20}
                color={
                  complete ? ThemeColors.primary : ThemeColors.mutedForeground
                }
              />
            )}
            <Text
              className={
                active
                  ? "text-primary font-semibold text-sm"
                  : "text-muted-foreground text-sm"
              }
            >
              {step.label}
            </Text>
          </View>
        );
      })}
      <View className="mt-6 gap-3">
        {failed && (
          <Button
            onPress={() => {
              startedAt.current = Date.now();
              setSeconds(0);
              useAppStore.getState().prepareScan();
              void useAppStore
                .getState()
                .startScan({ includeDuplicates: includeDuplicates === "true" });
            }}
          >
            Retry scan
          </Button>
        )}
        <Button
          variant="secondary"
          onPress={() => router.replace("/(tabs)/home")}
        >
          {failed ? "Back to dashboard" : "View dashboard"}
        </Button>
      </View>
    </ScrollView>
  );
}
