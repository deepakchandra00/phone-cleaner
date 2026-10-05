import { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon, CategoryIcons, type IconName } from "@/components/ui/Icon";
import { useAppStore, useSelectedBytes } from "@/stores/useAppStore";
import { CategoryColors, ThemeColors } from "@/theme/colors";
import { formatSizeCompact, formatRelativeTime } from "@/lib/format";
import { track } from "@/lib/analytics";
import type { CategoryKey, ScannedFile } from "@/lib/types";

const CATEGORY_LABELS: Record<string, string> = {
  photos: "Photos",
  videos: "Videos",
  apps: "Apps",
  audio: "Audio",
  documents: "Documents",
  downloads: "Downloads",
  junk: "Junk files",
  duplicates: "Duplicate photos",
  whatsapp: "WhatsApp media",
  other: "Other",
};

export default function CategoryDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanResult, selectedFileIds, toggleFile } = useAppStore();
  const selectedBytes = useSelectedBytes();

  const categoryKey = (key ?? "other") as CategoryKey;
  const label = CATEGORY_LABELS[categoryKey] ?? "Category";
  const color = CategoryColors[categoryKey] ?? CategoryColors.other;
  const iconName = (CategoryIcons[categoryKey] ?? "cube") as IconName;

  const files: ScannedFile[] = useMemo(() => {
    if (!scanResult) return [];
    switch (categoryKey) {
      case "videos":
        return scanResult.largeFiles.filter((f) => f.category === "videos");
      case "downloads":
        return scanResult.largeFiles.filter((f) => f.category === "downloads");
      case "documents":
        return scanResult.largeFiles.filter((f) => f.category === "documents");
      case "audio":
        return scanResult.largeFiles.filter((f) => f.category === "audio");
      case "whatsapp":
        return scanResult.whatsappFiles;
      case "junk":
        return scanResult.junkFiles;
      case "photos":
        return scanResult.largeFiles.filter((f) => f.category === "photos");
      default:
        return scanResult.largeFiles;
    }
  }, [scanResult, categoryKey]);

  const totalBytes = files.reduce((s, f) => s + f.sizeBytes, 0);
  const selectedCount = files.filter((f) => selectedFileIds.has(f.id)).length;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title={label} subtitle={`${files.length} items · ${formatSizeCompact(totalBytes)}`} showBack />

      {files.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-full bg-accent items-center justify-center mb-4">
            <Icon name={iconName} size={36} color={ThemeColors.primary} />
          </View>
          <Text className="text-foreground font-semibold">Nothing here</Text>
          <Text className="text-muted-foreground text-sm text-center mt-1">
            No large files found in this category during the last scan.
          </Text>
        </View>
      ) : (
        <Animated.ScrollView
          entering={FadeInDown.springify()}
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          <View className="px-4 gap-2">
            <Text className="text-xs text-muted-foreground px-1 mb-1">
              Tap to select items for cleanup
            </Text>
            {files.map((f, i) => {
              const selected = selectedFileIds.has(f.id);
              return (
                <Pressable
                  key={f.id}
                  onPress={() => toggleFile(f.id)}
                  className={`flex-row items-center gap-3 p-3 rounded-xl border ${
                    selected ? "border-primary bg-primary/5" : "border-border bg-card"
                  } active:opacity-95`}
                >
                  <View
                    className="w-11 h-11 rounded-xl items-center justify-center"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <Icon name={iconName} size={20} color={color} />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
                      {f.name}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                      {formatSizeCompact(f.sizeBytes)} · {formatRelativeTime(f.modifiedAt)}
                      {f.source ? ` · ${f.source}` : ""}
                    </Text>
                  </View>
                  <View
                    className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                      selected ? "bg-primary border-primary" : "border-muted-foreground/30"
                    }`}
                  >
                    {selected && <Icon name="checkmark" size={14} color="#fff" />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Animated.ScrollView>
      )}

      {/* Sticky selection bar */}
      {selectedCount > 0 && (
        <View
          className="absolute left-0 right-0 bg-card border-t border-border px-4 pt-3"
          style={{ bottom: 0, paddingBottom: Math.max(insets.bottom + 12, 24) }}
        >
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-foreground text-sm">
              <Text className="font-bold">{selectedCount}</Text> selected
            </Text>
            <Text className="text-primary font-bold">{formatSizeCompact(selectedBytes)}</Text>
          </View>
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              size="md"
              className="flex-1"
              onPress={() => {
                files.forEach((f) => selectedFileIds.has(f.id) && toggleFile(f.id));
              }}
            >
              Clear
            </Button>
            <Button
              variant="primary"
              size="md"
              className="flex-[2]"
              rightIcon={<Icon name="arrow-forward" size={18} color="#fff" />}
              onPress={() => {
                track("cleanup_review_opened", { source: "category" });
                router.push("/review");
              }}
            >
              Review cleanup
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
