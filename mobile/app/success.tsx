import { useEffect, useMemo } from "react";
import { View, Text } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
  SlideInDown,
  interpolate,
} from "react-native-reanimated";
import { useAppStore } from "@/stores/useAppStore";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { storage, KEYS } from "@/lib/storage";
import { bytesToGB, formatSizeCompact, formatHeadlineSize } from "@/lib/format";
import { maybeShowInterstitial } from "@/lib/ads";

const CONFETTI_COLORS = ["#10b981", "#14b8a6", "#f59e0b", "#ec4899", "#f97316", "#22c55e"];

interface ConfettiPieceItem {
  id: number;
  color: string;
  x: number;
  delay: number;
  duration: number;
  rotation: number;
  size: number;
}

const STATIC_CONFETTI: ConfettiPieceItem[] = Array.from({ length: 40 }, (_, i) => {
  const seed = ((i * 9301 + 49297) % 233280) / 233280;
  const seed2 = (((i + 13) * 9301 + 49297) % 233280) / 233280;
  const seed3 = (((i + 27) * 9301 + 49297) % 233280) / 233280;
  return {
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    x: (i / 40) * 100 + (seed * 6 - 3),
    delay: seed2 * 400,
    duration: 1400 + seed3 * 800,
    rotation: seed * 720 - 360,
    size: 6 + seed2 * 8,
  };
});

export default function Success() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isPurchase = mode === "purchase";
  const { lastFreedBytes, loadStorage } = useAppStore();

  const freedGB = lastFreedBytes ? bytesToGB(lastFreedBytes) : 0;
  const totalFreed = storage.getNumber(KEYS.totalFreedBytes) ?? 0;
  const cleanupCount = storage.getNumber(KEYS.cleanupCount) ?? 0;

  const checkScale = useSharedValue(0);
  const numberScale = useSharedValue(0);

  useEffect(() => {
    checkScale.value = withSpring(1, { damping: 12, stiffness: 200 });
    numberScale.value = withDelay(300, withSpring(1, { damping: 14, stiffness: 180 }));
    // Refresh storage so the dashboard reflects the freed space
    loadStorage();

    if (!isPurchase) {
      const adTimer = setTimeout(() => {
        maybeShowInterstitial();
      }, 1200);
      return () => clearTimeout(adTimer);
    }
  }, [checkScale, numberScale, loadStorage, isPurchase]);

  const confetti = STATIC_CONFETTI;

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: interpolate(checkScale.value, [0, 0.5, 1], [0, 0.5, 1]),
  }));

  const numberStyle = useAnimatedStyle(() => ({
    transform: [{ scale: numberScale.value }],
    opacity: numberScale.value,
  }));

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Confetti layer */}
      <View className="absolute inset-0 overflow-hidden" pointerEvents="none">
        {confetti.map((c) => (
          <ConfettiPiece key={c.id} piece={c} />
        ))}
      </View>

      <View className="flex-1 items-center justify-center px-8">
        {/* Checkmark */}
        <Animated.View
          style={checkStyle}
          className="w-28 h-28 rounded-full bg-success items-center justify-center"
        >
          <Icon name={isPurchase ? "diamond" : "checkmark"} size={isPurchase ? 56 : 64} color="#fff" />
        </Animated.View>

        {/* Freed amount / purchase confirmation */}
        <Animated.View style={numberStyle} className="items-center mt-8">
          {isPurchase ? (
            <>
              <Text className="text-muted-foreground text-base">Welcome to</Text>
              <Text className="text-primary text-4xl font-bold mt-1">Phone Cleaner Pro</Text>
              <Text className="text-muted-foreground text-sm mt-2 text-center">
                All Pro features are now unlocked. Enjoy the ad-free experience.
              </Text>
            </>
          ) : (
            <>
              <Text className="text-muted-foreground text-base">You freed up</Text>
              <Text className="text-primary text-6xl font-bold mt-1">
                {formatHeadlineSize(lastFreedBytes ?? 0).value}
              </Text>
              <Text className="text-primary text-2xl font-semibold">
                {formatHeadlineSize(lastFreedBytes ?? 0).unit}
              </Text>
            </>
          )}
        </Animated.View>

        {!isPurchase && (
          <Animated.View entering={SlideInDown.delay(800).springify()} className="mt-3">
            <Text className="text-muted-foreground text-sm text-center">
              That's about {Math.round(freedGB * 250)} photos or {Math.round(freedGB * 4)} hours of video worth of space.
            </Text>
          </Animated.View>
        )}

        {/* Stats */}
        {!isPurchase && (
          <Animated.View entering={FadeIn.delay(1000)} className="mt-8 w-full">
            <View className="flex-row gap-3">
              <View className="flex-1 bg-card border border-border rounded-2xl p-4 items-center">
                <Text className="text-2xl font-bold text-foreground">{formatSizeCompact(totalFreed)}</Text>
                <Text className="text-muted-foreground text-xs mt-1">total freed</Text>
              </View>
              <View className="flex-1 bg-card border border-border rounded-2xl p-4 items-center">
                <Text className="text-2xl font-bold text-foreground">{cleanupCount}</Text>
                <Text className="text-muted-foreground text-xs mt-1">cleanups</Text>
              </View>
            </View>
          </Animated.View>
        )}
      </View>

      {/* Actions */}
      <Animated.View
        entering={FadeIn.delay(1200)}
        style={{ paddingBottom: Math.max(insets.bottom + 24, 40) }}
        className="px-6"
      >
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onPress={() => router.replace("/(tabs)/home")}
        >
          Done
        </Button>
        <Button
          variant="ghost"
          size="md"
          fullWidth
          className="mt-2"
          onPress={() => router.replace("/(tabs)/scan")}
        >
          Scan again
        </Button>
      </Animated.View>
    </View>
  );
}

function ConfettiPiece({ piece }: { piece: ConfettiPieceItem }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withTiming(1, { duration: piece.duration, easing: Easing.in(Easing.quad) }),
    );
  }, [piece.delay, piece.duration, progress]);

  const style = useAnimatedStyle(() => {
    const y = interpolate(progress.value, [0, 1], [0, 700]);
    const rot = interpolate(progress.value, [0, 1], [0, piece.rotation]);
    const opacity = interpolate(progress.value, [0, 0.7, 1], [1, 1, 0]);
    return {
      transform: [{ translateY: y }, { rotate: `${rot}deg` }],
      opacity,
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: -20,
          left: `${piece.x}%`,
          width: piece.size,
          height: piece.size * 0.4,
          backgroundColor: piece.color,
          borderRadius: 2,
        },
        style,
      ]}
    />
  );
}
