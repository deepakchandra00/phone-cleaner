import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon, CategoryIcons, type IconName } from "@/components/ui/Icon";
import { useAppStore } from "@/stores/useAppStore";
import { CategoryColors, ThemeColors } from "@/theme/colors";
import { formatSizeCompact, formatHeadlineSize, bytesToGB, formatCount, formatRelativeTime } from "@/lib/format";
import { track } from "@/lib/analytics";
import type { CategoryKey } from "@/lib/types";

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanResult, storage, startScan, scanPhase } = useAppStore();

  if (scanPhase === "scanning") {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-muted-foreground">Scanning…</Text>
      </View>
    );
  }

  if (!scanResult) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Scan" subtitle="Find what's using your storage" />
        <EmptyScan onScan={() => router.push("/scan-progress")} />
      </View>
    );
  }

  const totalCleanable = scanResult.totalCleanableBytes;
  const topCategories = [...scanResult.categories]
    .filter((c) => c.cleanableBytes > 0)
    .sort((a, b) => b.cleanableBytes - a.cleanableBytes);

  const highlights = [
    {
      key: "duplicates" as CategoryKey,
      label: "Duplicate photos",
      icon: "copy" as IconName,
      color: CategoryColors.duplicates,
      bytes: scanResult.duplicateGroups.reduce((s, g) => s + g.recoverableBytes, 0),
      count: scanResult.duplicateGroups.length,
      route: "/(tabs)/photos",
    },
    {
      key: "videos" as CategoryKey,
      label: "Videos",
      icon: "videocam" as IconName,
      color: CategoryColors.videos,
      bytes: scanResult.categories.find((c) => c.key === "videos")?.bytes ?? 0,
      count: scanResult.categories.find((c) => c.key === "videos")?.fileCount ?? 0,
      route: "/category/videos",
    },
    {
      key: "whatsapp" as CategoryKey,
      label: "WhatsApp media",
      icon: "logo-whatsapp" as IconName,
      color: CategoryColors.whatsapp,
      bytes: scanResult.whatsappFiles.reduce((s, f) => s + f.sizeBytes, 0),
      count: scanResult.whatsappFiles.length,
      route: "/category/whatsapp",
    },
    {
      key: "junk" as CategoryKey,
      label: "Junk files",
      icon: "trash" as IconName,
      color: CategoryColors.junk,
      bytes: scanResult.junkFiles.reduce((s, f) => s + f.sizeBytes, 0),
      count: scanResult.junkFiles.length,
      route: "/category/junk",
    },
  ].filter((h) => h.bytes > 0);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: 110 }}
    >
      <ScreenHeader
        title="Scan results"
        subtitle={`${formatRelativeTime(scanResult.completedAt)} · ${formatCount(scanResult.filesScanned)} files scanned`}
        rightIcon="refresh"
        onRightPress={() => {
          track("scan_started", { source: "results_refresh" });
          router.push("/scan-progress");
        }}
      />

      {/* Hero: total reclaimable */}
      <Animated.View entering={FadeIn.springify()} className="px-4">
        <Card className="items-center py-6">
          <Text className="text-muted-foreground text-sm">You can free up to</Text>
          <Text className="text-primary text-5xl font-bold mt-1">
            {formatHeadlineSize(totalCleanable).value}{" "}
            <Text className="text-3xl font-semibold">{formatHeadlineSize(totalCleanable).unit}</Text>
          </Text>
          <Text className="text-muted-foreground text-xs mt-2">
            Scan took {(scanResult.durationMs / 1000).toFixed(1)}s · {formatCount(scanResult.filesScanned)} files
          </Text>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-5"
            leftIcon={<Icon name="sparkles" size={20} color="#fff" />}
            onPress={() => {
              track("cleanup_review_opened", { source: "scan_results" });
              router.push("/review");
            }}
          >
            Review & Clean
          </Button>
        </Card>
      </Animated.View>

      {/* Highlights grid */}
      <Animated.View entering={FadeInDown.delay(80).springify()} className="px-4 mt-5">
        <Text className="text-base font-semibold text-foreground mb-2">Biggest opportunities</Text>
        <View className="flex-row flex-wrap gap-3">
          {highlights.map((h) => (
            <Pressable
              key={h.key}
              onPress={() => {
                track("category_viewed", { category: h.key });
                router.push(h.route as any);
              }}
              className="flex-1 min-w-[47%] bg-card rounded-2xl border border-border p-4 active:opacity-95"
            >
              <View className="flex-row items-center justify-between">
                <View
                  className="w-11 h-11 rounded-xl items-center justify-center"
                  style={{ backgroundColor: `${h.color}20` }}
                >
                  <Icon name={h.icon} size={22} color={h.color} />
                </View>
                <Icon name="chevron-forward" size={16} color={ThemeColors.mutedForeground} />
              </View>
              <Text className="text-foreground font-semibold mt-3">{h.label}</Text>
              <Text className="text-2xl font-bold mt-0.5" style={{ color: h.color }}>
                {formatSizeCompact(h.bytes)}
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                {formatCount(h.count)} {h.count === 1 ? "item" : "items"}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>

      {/* Category breakdown */}
      <Animated.View entering={FadeInDown.delay(160).springify()} className="px-4 mt-5">
        <Text className="text-base font-semibold text-foreground mb-2">By category</Text>
        <Card>
          {topCategories.map((c, i) => {
            const color = CategoryColors[c.key as CategoryKey] ?? CategoryColors.other;
            const iconName = (CategoryIcons[c.key] ?? "cube") as IconName;
            return (
              <Pressable
                key={c.key}
                onPress={() => {
                  if (c.key === "duplicates") router.push("/(tabs)/photos");
                  else if (c.key === "apps") router.push("/(tabs)/files");
                  else router.push(`/category/${c.key}`);
                }}
                className={`flex-row items-center gap-3 py-3 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <View
                  className="w-10 h-10 rounded-xl items-center justify-center"
                  style={{ backgroundColor: `${color}20` }}
                >
                  <Icon name={iconName} size={18} color={color} />
                </View>
                <View className="flex-1">
                  <Text className="text-foreground font-medium">{c.label}</Text>
                  <Text className="text-muted-foreground text-xs">
                    {formatSizeCompact(c.bytes)} · {formatCount(c.fileCount)} files
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="font-semibold" style={{ color }}>
                    {formatSizeCompact(c.cleanableBytes)}
                  </Text>
                  <Text className="text-muted-foreground text-xs">cleanable</Text>
                </View>
                <Icon name="chevron-forward" size={16} color={ThemeColors.mutedForeground} />
              </Pressable>
            );
          })}
        </Card>
      </Animated.View>

      {/* Rescan hint */}
      <View className="px-4 mt-4 flex-row items-center gap-2">
        <Icon name="time-outline" size={14} color={ThemeColors.mutedForeground} />
        <Text className="text-xs text-muted-foreground">
          Results are cached. Rescan to detect newly added files.
        </Text>
      </View>
    </ScrollView>
  );
}

function EmptyScan({ onScan }: { onScan: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-24 h-24 rounded-full bg-accent items-center justify-center mb-6">
        <Icon name="scan" size={48} color={ThemeColors.primary} />
      </View>
      <Text className="text-foreground text-xl font-bold text-center">No scan yet</Text>
      <Text className="text-muted-foreground text-sm text-center mt-2">
        Run a smart scan to find large files, duplicates, and junk you can safely remove.
      </Text>
      <Button
        variant="primary"
        size="lg"
        className="mt-6"
        leftIcon={<Icon name="flash" size={20} color="#fff" />}
        onPress={onScan}
      >
        Scan My Phone
      </Button>
    </View>
  );
}
