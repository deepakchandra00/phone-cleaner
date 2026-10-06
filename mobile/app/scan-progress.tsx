import { useEffect } from "react";
import { View, Text } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  FadeIn,
} from "react-native-reanimated";
import { useAppStore } from "@/stores/useAppStore";
import { formatSizeCompact } from "@/lib/format";
import { CategoryColors } from "@/theme/colors";
import { Icon, type IconName } from "@/components/ui/Icon";

const STAGE_META: Record<string, { icon: IconName; color: string }> = {
  "Reading MediaStore…": { icon: "reader", color: CategoryColors.photos },
  "Indexing large files…": { icon: "cube", color: CategoryColors.videos },
  "Detecting duplicates…": { icon: "copy", color: CategoryColors.duplicates },
  "Scanning WhatsApp media…": { icon: "logo-whatsapp", color: CategoryColors.whatsapp },
  "Computing reclaimable space…": { icon: "calculator", color: CategoryColors.apps },
  "Preparing scan…": { icon: "sync", color: CategoryColors.other },
};

export default function ScanProgress() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { includeDuplicates: incDupsParam } = useLocalSearchParams<{ includeDuplicates?: string }>();
  const includeDuplicates = incDupsParam === "true";
  const { scanPhase, scanProgress, scanStage, startScan, storage } = useAppStore();

  // Radar pulse animation
  const pulse = useSharedValue(0);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0.6);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    ringScale.value = withRepeat(
      withTiming(1.8, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    ringOpacity.value = withRepeat(
      withTiming(0, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [pulse, ringScale, ringOpacity]);

  useEffect(() => {
    if (scanPhase === "idle") {
      startScan({ includeDuplicates });
    }
    if (scanPhase === "done") {
      // Wait briefly so the user sees 100% then go to scan results
      const t = setTimeout(() => {
        router.replace("/(tabs)/scan");
      }, 800);
      return () => clearTimeout(t);
    }
  }, [scanPhase, startScan, router, includeDuplicates]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + pulse.value * 0.4 }],
    opacity: 1 - pulse.value * 0.3,
  }));

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value * 0.85 }],
    opacity: ringOpacity.value * 0.75,
  }));

  const meta = STAGE_META[scanStage] ?? STAGE_META["Preparing scan…"];
  const pct = Math.round(scanProgress * 100);

  return (
    <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top }}>
      {/* Radar visual */}
      <View className="items-center justify-center" style={{ width: 280, height: 280 }}>
        {/* Pulsing rings */}
        <Animated.View
          style={[ring1Style, { borderColor: meta.color }]}
          className="absolute w-32 h-32 rounded-full border-2"
        />
        <Animated.View
          style={[ring2Style, { borderColor: meta.color }]}
          className="absolute w-32 h-32 rounded-full border"
        />
        {/* Core circle */}
        <Animated.View
          style={[pulseStyle, { backgroundColor: `${meta.color}20` }]}
          className="w-32 h-32 rounded-full items-center justify-center"
        >
          <View
            className="w-20 h-20 rounded-full items-center justify-center"
            style={{ backgroundColor: `${meta.color}30` }}
          >
            <Icon name={meta.icon} size={36} color={meta.color} />
          </View>
        </Animated.View>
      </View>

      {/* Progress text */}
      <Animated.View entering={FadeIn} className="items-center mt-8 px-8">
        <Text className="text-foreground text-2xl font-bold">{pct}%</Text>
        <Text className="text-muted-foreground text-sm mt-2 text-center" numberOfLines={2}>
          {scanStage || "Starting…"}
        </Text>
      </Animated.View>

      {/* Progress bar */}
      <View className="w-64 h-1.5 rounded-full bg-muted mt-6 overflow-hidden">
        <Animated.View
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: meta.color,
          }}
        />
      </View>

      {/* Hint about what's being found */}
      {storage && scanProgress > 0.5 && (
        <Animated.View entering={FadeIn.delay(200)} className="mt-10 px-8">
          <Text className="text-muted-foreground text-xs text-center">
            Found{" "}
            <Text className="text-primary font-semibold">
              {formatSizeCompact(storage.cleanableBytes)}
            </Text>{" "}
            potentially reclaimable so far
          </Text>
        </Animated.View>
      )}
    </View>
  );
}
