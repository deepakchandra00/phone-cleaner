import { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon, CategoryIcons, type IconName } from "@/components/ui/Icon";
import { useAppStore, useSelectedBytes } from "@/stores/useAppStore";
import { CategoryColors } from "@/theme/colors";
import { formatSizeCompact, bytesToGB } from "@/lib/format";
import { track } from "@/lib/analytics";
import type { CategoryKey, ScannedFile } from "@/lib/types";

interface ReviewGroup {
  key: CategoryKey;
  label: string;
  icon: IconName;
  color: string;
  files: ScannedFile[];
  bytes: number;
  groupIds: string[];
  groupBytes: number;
}

export default function Review() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanResult, selectedFileIds, selectedGroupIds, toggleFile, toggleGroup, executeCleanup } =
    useAppStore();
  const selectedBytes = useSelectedBytes();
  const [cleaning, setCleaning] = useState(false);

  const groups: ReviewGroup[] = useMemo(() => {
    if (!scanResult) return [];
    const out: ReviewGroup[] = [];

    // Group selected files by their category
    const byCat = new Map<CategoryKey, ScannedFile[]>();
    const allFiles = [
      ...scanResult.largeFiles,
      ...scanResult.junkFiles,
      ...scanResult.whatsappFiles,
    ];
    for (const f of allFiles) {
      if (selectedFileIds.has(f.id)) {
        const arr = byCat.get(f.category) ?? [];
        arr.push(f);
        byCat.set(f.category, arr);
      }
    }
    for (const [cat, files] of byCat) {
      out.push({
        key: cat,
        label: labelFor(cat),
        icon: (CategoryIcons[cat] ?? "cube") as IconName,
        color: CategoryColors[cat] ?? CategoryColors.other,
        files,
        bytes: files.reduce((s, f) => s + f.sizeBytes, 0),
        groupIds: [],
        groupBytes: 0,
      });
    }

    // Add selected duplicate groups as a single pseudo-category
    const selGroups = scanResult.duplicateGroups.filter((g) => selectedGroupIds.has(g.id));
    if (selGroups.length > 0) {
      const allDupFiles = selGroups.flatMap((g) => g.files);
      out.push({
        key: "duplicates",
        label: "Duplicate photos",
        icon: "copy",
        color: CategoryColors.duplicates,
        files: allDupFiles,
        bytes: selGroups.reduce((s, g) => s + g.recoverableBytes, 0),
        groupIds: selGroups.map((g) => g.id),
        groupBytes: selGroups.reduce((s, g) => s + g.recoverableBytes, 0),
      });
    }

    return out.sort((a, b) => b.bytes - a.bytes);
  }, [scanResult, selectedFileIds, selectedGroupIds]);

  const totalFiles =
    groups.reduce((s, g) => s + g.files.length, 0) + groups.reduce((s, g) => s + g.groupIds.length, 0);

  const handleClean = () => {
    Alert.alert(
      "Confirm cleanup",
      `You're about to free up ${bytesToGB(selectedBytes).toFixed(1)} GB by removing ${totalFiles} item${totalFiles === 1 ? "" : "s"}. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clean",
          style: "destructive",
          onPress: async () => {
            setCleaning(true);
            track("cleanup_started", { bytes: selectedBytes, count: totalFiles });
            try {
              await executeCleanup();
            } catch (err) {
              console.warn("[review] cleanup error:", err);
            } finally {
              setCleaning(false);
              track("cleanup_completed");
              router.replace("/success");
            }
          },
        },
      ],
    );
  };

  if (groups.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Review cleanup" showBack />
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-full bg-accent items-center justify-center mb-4">
            <Icon name="checkmark-circle" size={40} color="rgb(var(--primary))" />
          </View>
          <Text className="text-foreground font-semibold text-lg">Nothing selected</Text>
          <Text className="text-muted-foreground text-sm text-center mt-1">
            Select files from any category to review them for cleanup here.
          </Text>
          <Button variant="secondary" size="md" className="mt-5" onPress={() => router.replace("/(tabs)/scan")}>
            Browse scan results
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Review cleanup" subtitle="Confirm before we delete" showBack />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Hero: total */}
        <Animated.View entering={FadeIn.springify()} className="px-4">
          <Card className="items-center py-6">
            <Text className="text-muted-foreground text-sm">You will free up</Text>
            <Text className="text-primary text-5xl font-bold mt-1">
              {bytesToGB(selectedBytes).toFixed(1)} GB
            </Text>
            <Text className="text-muted-foreground text-xs mt-2">
              {totalFiles} item{totalFiles === 1 ? "" : "s"} selected
            </Text>
          </Card>
        </Animated.View>

        {/* Warning */}
        <Animated.View entering={FadeInDown.delay(60).springify()} className="px-4 mt-3">
          <View className="flex-row items-start gap-2 bg-warning/10 border border-warning/30 rounded-xl p-3">
            <Icon name="warning" size={16} color="rgb(var(--warning))" />
            <Text className="text-warning-foreground text-xs flex-1 leading-5">
              Files will be permanently deleted. We never delete anything without your confirmation.
            </Text>
          </View>
        </Animated.View>

        {/* Groups */}
        <Animated.View entering={FadeInDown.delay(120).springify()} className="px-4 mt-4 gap-3">
          {groups.map((g) => (
            <Card key={g.key} className="p-0 overflow-hidden">
              <View className="flex-row items-center gap-3 p-4">
                <View
                  className="w-10 h-10 rounded-xl items-center justify-center"
                  style={{ backgroundColor: `${g.color}20` }}
                >
                  <Icon name={g.icon} size={18} color={g.color} />
                </View>
                <View className="flex-1">
                  <Text className="text-foreground font-semibold">{g.label}</Text>
                  <Text className="text-muted-foreground text-xs">
                    {g.files.length + g.groupIds.length} item{(g.files.length + g.groupIds.length) === 1 ? "" : "s"}
                  </Text>
                </View>
                <Text className="font-bold" style={{ color: g.color }}>
                  {formatSizeCompact(g.bytes + g.groupBytes)}
                </Text>
              </View>
              {/* File list preview (first 3) */}
              {g.files.slice(0, 3).map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => toggleFile(f.id)}
                  className="flex-row items-center gap-2 px-4 py-2 border-t border-border"
                >
                  <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: g.color }} />
                  <Text className="text-foreground text-xs flex-1" numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text className="text-muted-foreground text-xs">{formatSizeCompact(f.sizeBytes)}</Text>
                  <Icon name="close-circle" size={16} color="rgb(var(--muted-foreground))" />
                </Pressable>
              ))}
              {g.files.length > 3 && (
                <View className="px-4 py-2 border-t border-border">
                  <Text className="text-muted-foreground text-xs">
                    +{g.files.length - 3} more…
                  </Text>
                </View>
              )}
              {/* Remove entire group */}
              <Pressable
                onPress={() => {
                  g.files.forEach((f) => selectedFileIds.has(f.id) && toggleFile(f.id));
                  g.groupIds.forEach((id) => selectedGroupIds.has(id) && toggleGroup(id));
                }}
                className="px-4 py-3 border-t border-border active:bg-muted"
              >
                <Text className="text-destructive text-xs font-medium">Remove from cleanup</Text>
              </Pressable>
            </Card>
          ))}
        </Animated.View>
      </ScrollView>

      {/* Sticky action bar */}
      <View
        className="absolute left-0 right-0 bg-card border-t border-border px-4 pt-3"
        style={{ bottom: 0, paddingBottom: Math.max(insets.bottom + 12, 24) }}
      >
        <Button
          variant="destructive"
          size="lg"
          fullWidth
          loading={cleaning}
          leftIcon={<Icon name="trash" size={20} color="#fff" />}
          onPress={handleClean}
        >
          {cleaning ? "Cleaning…" : `Clean ${formatSizeCompact(selectedBytes)}`}
        </Button>
      </View>
    </View>
  );
}

function labelFor(key: CategoryKey): string {
  const m: Record<CategoryKey, string> = {
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
  return m[key] ?? key;
}
