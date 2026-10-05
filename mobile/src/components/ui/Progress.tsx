import { View } from "react-native";
import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number; // 0..1
  className?: string;
  barClassName?: string;
  height?: number;
  color?: string;
  trackColor?: string;
}

import { ThemeColors } from "@/theme/colors";

export function Progress({
  value,
  className,
  barClassName,
  height = 8,
  color,
  trackColor,
}: ProgressProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      className={cn("w-full rounded-full overflow-hidden", className)}
      style={{ height, backgroundColor: trackColor ?? ThemeColors.muted }}
    >
      <View
        className={cn("h-full rounded-full", barClassName)}
        style={{
          width: `${pct}%`,
          backgroundColor: color ?? ThemeColors.primary,
        }}
      />
    </View>
  );
}
