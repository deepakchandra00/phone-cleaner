import { useEffect } from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { formatSizeCompact, bytesToGB } from "@/lib/format";
import { CategoryColors, ThemeColors, type CategoryKey } from "@/theme/colors";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface RingSegment {
  key: CategoryKey;
  bytes: number;
  color: string;
}

interface StorageRingProps {
  totalBytes: number;
  usedBytes: number;
  segments: RingSegment[];
  size?: number;
  strokeWidth?: number;
  cleanableBytes?: number;
}

/**
 * Concentric storage visualisation:
 * - Outer ring: usage percentage (used / total).
 * - The used arc is broken into category-coloured segments proportional to
 *   each category's share of the used space.
 * - A subtle dashed overlay marks the "cleanable" portion.
 */
export function StorageRing({
  totalBytes,
  usedBytes,
  segments,
  size = 240,
  strokeWidth = 18,
  cleanableBytes = 0,
}: StorageRingProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(usedBytes / totalBytes, {
      duration: 900,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [usedBytes, totalBytes, progress]);

  const animatedProps = useAnimatedProps(() => {
    const r = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;
    const dash = circumference * progress.value;
    return {
      strokeDasharray: `${dash} ${circumference}`,
    };
  });

  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  // Pre-render category segments as a single ring (static, behind animated track).
  const totalUsed = segments.reduce((s, x) => s + x.bytes, 0) || 1;

  return (
    <View className="items-center justify-center">
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={ThemeColors.muted}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Category segments — drawn proportionally on the same circle */}
        {segments
          .reduce<{ offset: number; nodes: React.ReactNode[] }>(
            (acc, seg) => {
              const frac = seg.bytes / totalUsed;
              const dashLen = circumference * frac;
              const gap = circumference - dashLen;
              const rot = (acc.offset / circumference) * 360 - 90;
              const node = (
                <Circle
                  key={seg.key}
                  cx={cx}
                  cy={cy}
                  r={r}
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${dashLen} ${gap}`}
                  rotation={rot}
                  origin={`${cx}, ${cy}`}
                  strokeLinecap="butt"
                />
              );
              return {
                offset: acc.offset + dashLen,
                nodes: [...acc.nodes, node],
              };
            },
            { offset: 0, nodes: [] },
          )
          .nodes}

        {/* Animated overlay: re-draws the used portion with a smooth sweep.
            We keep it transparent so the category colours show through but
            still animate the visible fraction. */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={r}
          stroke="transparent"
          strokeWidth={strokeWidth}
          fill="none"
          animatedProps={animatedProps}
          strokeLinecap="round"
        />
      </Svg>

      {/* Centre content */}
      <View
        className="absolute items-center justify-center"
        style={{ width: size - strokeWidth * 2 - 20 }}
      >
        <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Storage
        </Text>
        <Text className="text-foreground text-4xl font-bold mt-1">
          {Math.round((usedBytes / totalBytes) * 100)}%
        </Text>
        <Text className="text-muted-foreground text-sm mt-1">
          {bytesToGB(usedBytes)} / {bytesToGB(totalBytes)} GB
        </Text>
      </View>
    </View>
  );
}

interface CategoryBarProps {
  category: CategoryKey;
  label: string;
  bytes: number;
  totalBytes: number;
  rightLabel?: string;
}

export function CategoryBar({ category, label, bytes, totalBytes, rightLabel }: CategoryBarProps) {
  const color = CategoryColors[category];
  const pct = Math.max(0.02, bytes / totalBytes);
  return (
    <View className="flex-row items-center gap-3 py-2">
      <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      <Text className="text-foreground text-sm font-medium flex-1">{label}</Text>
      <View className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <View className="h-full rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
      </View>
      <Text className="text-muted-foreground text-sm font-mono w-16 text-right">
        {rightLabel ?? formatSizeCompact(bytes)}
      </Text>
    </View>
  );
}
