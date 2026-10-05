import { useState } from "react";
import { View, Text, Pressable, Dimensions, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useAppStore, useSelectedBytes } from "@/stores/useAppStore";
import { useFeatureGate } from "@/stores/usePremiumStore";
import { formatSizeCompact } from "@/lib/format";
import { getDuplicateStages } from "@/lib/mockData";
import { ThemeColors } from "@/theme/colors";
import { track } from "@/lib/analytics";
import type { DuplicateGroup } from "@/lib/types";

const { width } = Dimensions.get("window");
const THUMB = (width - 48 - 12) / 3; // 3-up grid with gaps

export default function PhotosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanResult, selectedGroupIds, toggleGroup, toggleFile, selectedFileIds } = useAppStore();
  const selectedBytes = useSelectedBytes();
  const gate = useFeatureGate();
  const [showStages, setShowStages] = useState(false);

  const groups = scanResult?.duplicateGroups ?? [];
  const stages = getDuplicateStages();
  const similarGroups = groups.filter((g) => g.kind === "similar");
  const exactGroups = groups.filter((g) => g.kind === "exact");

  const totalRecoverable = groups.reduce((s, g) => s + g.recoverableBytes, 0);

  // "Select all keep-best" — adds every group's recoverable (non-keep) files
  const selectAllKeepBest = () => {
    for (const g of groups) {
      if (!selectedGroupIds.has(g.id)) toggleGroup(g.id);
    }
    track("duplicate_scan_completed", { groups: groups.length });
  };

  if (!scanResult || groups.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Duplicate photos" subtitle="Find exact & similar copies" />
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-full bg-accent items-center justify-center mb-4">
            <Icon name="images" size={36} color={ThemeColors.primary} />
          </View>
          <Text className="text-foreground font-semibold text-lg">No duplicates found</Text>
          <Text className="text-muted-foreground text-sm text-center mt-1">
            Run a scan to detect exact and similar photos you can clean up.
          </Text>
          <Button variant="primary" size="md" className="mt-5" onPress={() => router.push("/scan-progress")}>
            Scan now
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Duplicate photos"
        subtitle={`${groups.length} groups · ${formatSizeCompact(totalRecoverable)} recoverable`}
        rightIcon="information-circle-outline"
        onRightPress={() => setShowStages((v) => !v)}
      />

      {/* Pipeline explanation (collapsible) */}
      {showStages && (
        <Animated.View entering={FadeInDown.springify()} className="px-4 mb-2">
          <Card>
            <Text className="text-foreground font-semibold text-sm mb-2">How we detect duplicates</Text>
            {stages.map((s, i) => (
              <View key={s.id} className="flex-row items-center gap-2 py-1.5">
                <View className="w-6 h-6 rounded-full bg-primary/10 items-center justify-center">
                  <Text className="text-primary text-xs font-bold">{i + 1}</Text>
                </View>
                <Text className="text-foreground text-xs flex-1">{s.label}</Text>
                <Text className="text-muted-foreground text-xs">{(s.durationMs / 1000).toFixed(1)}s</Text>
              </View>
            ))}
            <View className="mt-2 pt-2 border-t border-border">
              <Text className="text-muted-foreground text-xs">
                Stage 4 (perceptual hash) finds *similar* photos — that's a Pro feature.
              </Text>
            </View>
          </Card>
        </Animated.View>
      )}

      {/* Pro gate banner for similar photos */}
      {similarGroups.length > 0 && !gate.canUseSimilarPhotos && (
        <View className="px-4 mb-2">
          <Pressable
            onPress={() => router.push("/premium")}
            className="flex-row items-center gap-2 bg-primary/10 border border-primary/30 rounded-xl p-3 active:opacity-95"
          >
            <Icon name="diamond" size={16} color={ThemeColors.primary} />
            <Text className="text-primary text-xs font-medium flex-1">
              {similarGroups.length} similar-photo groups are a Pro feature
            </Text>
            <Icon name="chevron-forward" size={14} color={ThemeColors.primary} />
          </Pressable>
        </View>
      )}

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Quick action: keep best for all */}
        <View className="px-4 mb-3">
          <Pressable
            onPress={selectAllKeepBest}
            className="bg-gradient-to-br from-primary to-teal-600 rounded-2xl p-3.5 flex-row items-center justify-between active:opacity-95"
          >
            <View className="flex-row items-center gap-2">
              <Icon name="sparkles" size={18} color="#fff" />
              <View>
                <Text className="text-white font-semibold text-sm">Keep best, delete rest</Text>
                <Text className="text-white/80 text-xs">Auto-select across all {groups.length} groups</Text>
              </View>
            </View>
            <Icon name="arrow-forward" size={16} color="#fff" />
          </Pressable>
        </View>

        {/* Groups */}
        <View className="px-4 gap-4">
          {groups.map((g, idx) => (
            <Animated.View key={g.id} entering={FadeInDown.delay(idx * 40).springify()}>
              <DuplicateGroupCard
                group={g}
                isPro={gate.canUseSimilarPhotos}
                selected={selectedGroupIds.has(g.id)}
                onToggleGroup={() => toggleGroup(g.id)}
                selectedFileIds={selectedFileIds}
                onToggleFile={toggleFile}
              />
            </Animated.View>
          ))}
        </View>
      </ScrollView>

      {/* Sticky selection bar */}
      {selectedGroupIds.size + selectedFileIds.size > 0 && (
        <View
          className="absolute left-0 right-0 bg-card border-t border-border px-4 pt-3"
          style={{ bottom: 0, paddingBottom: Math.max(insets.bottom + 12, 24) }}
        >
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-foreground text-sm">
              <Text className="font-bold">{selectedGroupIds.size}</Text> groups selected
            </Text>
            <Text className="text-primary font-bold">{formatSizeCompact(selectedBytes)}</Text>
          </View>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            rightIcon={<Icon name="arrow-forward" size={18} color="#fff" />}
            onPress={() => {
              track("cleanup_review_opened", { source: "photos" });
              router.push("/review");
            }}
          >
            Review cleanup
          </Button>
        </View>
      )}
    </View>
  );
}

function DuplicateGroupCard({
  group,
  isPro,
  selected,
  onToggleGroup,
  selectedFileIds,
  onToggleFile,
}: {
  group: DuplicateGroup;
  isPro: boolean;
  selected: boolean;
  onToggleGroup: () => void;
  selectedFileIds: Set<string>;
  onToggleFile: (id: string) => void;
}) {
  const locked = group.kind === "similar" && !isPro;
  const keepId = group.keepId;
  const groupSelectedFiles = group.files.filter(
    (f) => f.id !== keepId && selectedFileIds.has(f.id),
  ).length;

  return (
    <Card className="p-0 overflow-hidden">
      {/* Group header */}
      <View className="flex-row items-center gap-3 p-3.5">
        <Pressable onPress={onToggleGroup} className="flex-row items-center gap-3 flex-1">
          <View
            className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
              selected ? "bg-primary border-primary" : "border-muted-foreground/30"
            }`}
          >
            {selected && <Icon name="checkmark" size={14} color="#fff" />}
          </View>
          <View className="flex-1">
            <Text className="text-foreground font-semibold text-sm">
              {group.files.length} {group.kind === "similar" ? "similar" : "identical"} photos
            </Text>
            <Text className="text-muted-foreground text-xs">
              {formatSizeCompact(group.recoverableBytes)} recoverable
            </Text>
          </View>
        </Pressable>
        {locked && (
          <View className="flex-row items-center gap-1 bg-primary/10 px-2 py-1 rounded-full">
            <Icon name="lock-closed" size={11} color={ThemeColors.primary} />
            <Text className="text-primary text-[10px] font-semibold">PRO</Text>
          </View>
        )}
      </View>

      {/* Photo grid */}
      <View className="flex-row flex-wrap gap-1.5 px-3.5 pb-3.5">
        {group.files.map((f) => {
          const isKeep = f.id === keepId;
          const isSelected = selectedFileIds.has(f.id);
          return (
            <Pressable
              key={f.id}
              disabled={locked}
              onPress={() => !isKeep && onToggleFile(f.id)}
              style={{ width: THUMB, height: THUMB }}
              className="relative rounded-lg overflow-hidden"
            >
              {/* Placeholder thumbnail (gradient + icon — no real image in demo) */}
              <View
                className="absolute inset-0 items-center justify-center"
                style={{
                  backgroundColor: isKeep ? "#dcfce7" : isSelected ? "#fee2e2" : "#f1f5f9",
                }}
              >
                <Icon
                  name="image"
                  size={28}
                  color={isKeep ? "#16a34a" : isSelected ? "#ef4444" : "#94a3b8"}
                />
              </View>

              {/* Keep badge */}
              {isKeep && (
                <View className="absolute top-1 left-1 bg-success rounded-md px-1.5 py-0.5 flex-row items-center gap-0.5">
                  <Icon name="star" size={9} color="#fff" />
                  <Text className="text-white text-[9px] font-bold">KEEP</Text>
                </View>
              )}

              {/* Selected checkmark */}
              {!isKeep && isSelected && (
                <View className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive items-center justify-center">
                  <Icon name="checkmark" size={12} color="#fff" />
                </View>
              )}

              {/* Locked overlay */}
              {locked && (
                <View className="absolute inset-0 bg-black/40 items-center justify-center">
                  <Icon name="lock-closed" size={18} color="#fff" />
                </View>
              )}

              {/* Size label */}
              <View className="absolute bottom-1 right-1 bg-black/50 rounded px-1">
                <Text className="text-white text-[9px] font-medium">
                  {formatSizeCompact(f.sizeBytes)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Keep-best explanation */}
      <View className="px-3.5 py-2.5 bg-accent/50 border-t border-border flex-row items-center gap-2">
        <Icon name="information-circle" size={13} color={ThemeColors.primary} />
        <Text className="text-accent-foreground text-xs flex-1">
          {groupSelectedFiles > 0
            ? `${groupSelectedFiles} of ${group.files.length - 1} marked for deletion`
            : `Best photo auto-selected to keep (${formatSizeCompact(group.files.find((f) => f.id === keepId)?.sizeBytes ?? 0)})`}
        </Text>
      </View>
    </Card>
  );
}
