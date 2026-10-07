import { useMemoryDiagnostics } from "@/hooks/useMemoryDiagnostics";
import { duplicateCounts } from "@/lib/duplicateGrouping.ts";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { track } from "@/lib/analytics";
import { formatSizeCompact } from "@/lib/format";
import type { DuplicateGroup } from "@/lib/types";
import { useAppStore } from "@/stores/useAppStore";
import { useFeatureGate } from "@/stores/usePremiumStore";
import { ThemeColors } from "@/theme/colors";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Dimensions, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShallow } from "zustand/react/shallow";

const { width } = Dimensions.get("window");
const THUMB = (width - 48 - 12) / 3; // 3-up grid with gaps

export default function PhotosScreen() {
  useMemoryDiagnostics("Photos");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    scanResult,
    selectedGroupIds,
    toggleGroup,
    toggleFile,
    selectedFileIds,
  } = useAppStore(
    useShallow((s) => ({
      scanResult: s.scanResult,
      selectedGroupIds: s.selectedGroupIds,
      toggleGroup: s.toggleGroup,
      toggleFile: s.toggleFile,
      selectedFileIds: s.selectedFileIds,
    })),
  );
  useFocusEffect(
    useCallback(
      () => () => {
        void Image.clearMemoryCache().catch(() => {});
      },
      [],
    ),
  );
  const gate = useFeatureGate();
  const [showStages, setShowStages] = useState(false);

  const groups = useMemo(
    () => scanResult?.duplicateGroups ?? [],
    [scanResult?.duplicateGroups],
  );
  const counts = useMemo(() => duplicateCounts(groups), [groups]);
  const coverage = scanResult?.duplicateCoverage;
  const coverageText = coverage
    ? `${coverage.exactChecked.toLocaleString()} of ${coverage.total.toLocaleString()} accessible photos checked for exact copies; ${coverage.visualChecked.toLocaleString()} checked visually.`
    : "A photo scan checks only images Android allows this app to read.";
  const stages = [
    "Read every accessible photo, including small images",
    "Compare file hashes to verify identical copies",
    "Compare visual hashes for similar photos",
    "Keep one recommended photo; review each selection",
  ];
  const photoSelectedCount = groups.reduce(
    (sum, g) => sum + g.files.filter((f) => selectedFileIds.has(f.id)).length,
    0,
  );
  const photoSelectedBytes = groups.reduce(
    (sum, g) =>
      sum +
      g.files
        .filter((f) => selectedFileIds.has(f.id))
        .reduce((n, f) => n + f.sizeBytes, 0),
    0,
  );
  const similarGroups = groups.filter((g) => g.kind === "similar");

  const totalRecoverable = groups.reduce((s, g) => s + g.recoverableBytes, 0);

  // "Select all keep-best" — adds every group's recoverable (non-keep) files
  const selectAllKeepBest = () => {
    useAppStore
      .getState()
      .selectAllFiles(
        groups
          .filter((g) => g.kind === "exact" || gate.canUseSimilarPhotos)
          .flatMap((g) => g.files.filter((f) => f.id !== g.keepId)),
      );
    track("duplicate_scan_completed", { groups: groups.length });
  };

  if (!scanResult || groups.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader
          title="Duplicate photos"
          subtitle="Find exact & similar copies to free space"
        />
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-full bg-accent items-center justify-center mb-4">
            <Icon name="images" size={36} color={ThemeColors.primary} />
          </View>
          <Text className="text-foreground font-semibold text-lg">
            No duplicates found
          </Text>
          <Text className="text-muted-foreground text-sm text-center mt-1">
            {coverageText} Run a photo scan after granting access to all photos.
          </Text>
          <Button
            variant="primary"
            size="md"
            className="mt-5"
            onPress={() => {
              useAppStore.getState().prepareScan();
              router.push({
                pathname: "/scan-progress",
                params: { includeDuplicates: "true" },
              });
            }}
          >
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
        subtitle={`${counts.groups} groups · ${counts.copies} extra copies · ${formatSizeCompact(totalRecoverable)}`}
        rightIcon="information-circle-outline"
        onRightPress={() => setShowStages((v) => !v)}
      />

      {coverage && coverage.visualChecked < coverage.total && (
        <Text className="text-warning-foreground text-xs px-4 pb-3">
          {coverage.total - coverage.visualChecked} photos could not be compared
          visually.{" "}
          {coverage.visualChecked === 0
            ? "Update SmartCare to compare similar photos."
            : "Check photo access or unsupported image formats, then scan again."}
        </Text>
      )}
      {/* Pipeline explanation (collapsible) */}
      {showStages && (
        <Animated.View entering={FadeInDown.springify()} className="px-4 mb-2">
          <Card>
            <Text className="text-foreground font-semibold text-sm mb-2">
              Photo scan details
            </Text>
            <Text className="text-muted-foreground text-xs mb-2">
              {coverageText}
            </Text>
            {stages.map((s, i) => (
              <View key={s} className="flex-row items-center gap-2 py-1.5">
                <View className="w-6 h-6 rounded-full bg-primary/10 items-center justify-center">
                  <Text className="text-primary text-xs font-bold">
                    {i + 1}
                  </Text>
                </View>
                <Text className="text-foreground text-xs flex-1">{s}</Text>
              </View>
            ))}
            <View className="mt-2 pt-2 border-t border-border">
              <Text className="text-muted-foreground text-xs">
                Similar photos can differ in content. Preview them before
                selecting. Android photo permissions determine which photos can
                be checked.
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
            <Icon
              name="chevron-forward"
              size={14}
              color={ThemeColors.primary}
            />
          </Pressable>
        </View>
      )}

      <View className="flex-1 px-4">
        <FlashList
          data={groups}
          drawDistance={120}
          maxItemsInRecyclePool={3}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ paddingBottom: 260 }}
          ListHeaderComponent={
            <View className="pt-2 pb-4">
              <Text className="text-foreground font-semibold text-base mb-1">
                Choose copies to remove
              </Text>
              <Text className="text-muted-foreground text-sm mb-3">
                Tap a photo to select it. One original stays protected in each
                group. Nothing is deleted until you review and confirm.
              </Text>
              <Button variant="secondary" fullWidth onPress={selectAllKeepBest}>
                Select extra copies
              </Button>
              {photoSelectedCount > 0 && (
                <Button
                  variant="ghost"
                  fullWidth
                  onPress={() =>
                    useAppStore
                      .getState()
                      .deselectAllFiles(
                        groups.flatMap((g) => g.files.map((f) => f.id)),
                      )
                  }
                >
                  Clear photo selection
                </Button>
              )}
            </View>
          }
          renderItem={({ item: g }) => (
            <View className="mb-3">
              <DuplicateGroupCard
                group={g}
                isPro={gate.canUseSimilarPhotos}
                selected={selectedGroupIds.has(g.id)}
                onToggleGroup={() => {
                  if (g.kind === "exact" || gate.canUseSimilarPhotos)
                    toggleGroup(g.id);
                  else router.push("/premium");
                }}
                selectedFileIds={selectedFileIds}
                onToggleFile={(id, bytes) => {
                  if (g.kind === "exact" || gate.canUseSimilarPhotos)
                    toggleFile(id, bytes);
                  else router.push("/premium");
                }}
              />
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* Sticky selection bar */}
      {
        <View
          className="absolute left-0 right-0 bg-card border-t border-border px-4 pt-3"
          style={{ bottom: 72 + Math.max(insets.bottom, 8), paddingBottom: 12 }}
        >
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-foreground text-sm">
              <Text className="font-bold">{photoSelectedCount}</Text> photos
              selected
            </Text>
            <Text className="text-primary font-bold">
              {formatSizeCompact(photoSelectedBytes)}
            </Text>
          </View>
          <Button
            disabled={photoSelectedCount === 0}
            variant="primary"
            size="lg"
            fullWidth
            rightIcon={<Icon name="arrow-forward" size={18} color="#fff" />}
            onPress={() => {
              track("cleanup_review_opened", { source: "photos" });
              router.push("/review");
            }}
          >
            {photoSelectedCount > 0
              ? `Review ${photoSelectedCount} selected photos`
              : "Select photos to review"}
          </Button>
        </View>
      }
    </View>
  );
}

const DuplicateGroupCard = React.memo(function DuplicateGroupCard({
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
  onToggleFile: (id: string, sizeBytes?: number) => void;
}) {
  const router = useRouter();
  const keepId = group.keepId;
  const groupSelectedFiles = group.files.filter(
    (f) => f.id !== keepId && selectedFileIds.has(f.id),
  ).length;

  return (
    <Card className="p-0 overflow-hidden">
      {/* Group header */}
      <View className="flex-row items-center gap-3 p-3.5">
        <Pressable
          onPress={onToggleGroup}
          className="flex-row items-center gap-3 flex-1"
        >
          <View
            className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
              selected
                ? "bg-primary border-primary"
                : "border-muted-foreground/30"
            }`}
          >
            {selected && <Icon name="checkmark" size={14} color="#fff" />}
          </View>
          <View className="flex-1">
            <Text className="text-foreground font-semibold text-sm">
              {group.files.length}{" "}
              {group.kind === "similar" ? "similar" : "identical"} photos
            </Text>
            <Text className="text-muted-foreground text-xs">
              {formatSizeCompact(group.recoverableBytes)} recoverable
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Photo grid */}
      <View className="flex-row flex-wrap gap-1.5 px-3.5 pb-3.5">
        {group.files.slice(0, 6).map((f) => {
          const isKeep = f.id === keepId;
          const isSelected = selectedFileIds.has(f.id);
          return (
            <Pressable
              key={f.id}
              accessibilityRole="checkbox"
              accessibilityLabel={
                isKeep
                  ? `Protected original: ${f.name}`
                  : `Select ${f.name} for cleanup`
              }
              accessibilityState={{ checked: isSelected, disabled: isKeep }}
              onPress={() => !isKeep && onToggleFile(f.id, f.sizeBytes)}
              style={{ width: THUMB, height: THUMB }}
              className="relative rounded-lg overflow-hidden"
            >
              {/* Thumbnail */}
              <View
                className="absolute inset-0 items-center justify-center"
                style={{
                  backgroundColor: isKeep
                    ? "#dcfce7"
                    : isSelected
                      ? "#fee2e2"
                      : "#f1f5f9",
                }}
              >
                {f.path ? (
                  <Image
                    source={{
                      uri:
                        f.uri ||
                        (f.path.startsWith("/") ? `file://${f.path}` : f.path),
                    }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                    transition={0}
                    cachePolicy="disk"
                    recyclingKey={f.id}
                    decodeFormat="rgb"
                  />
                ) : (
                  <Icon
                    name="image"
                    size={28}
                    color={
                      isKeep ? "#16a34a" : isSelected ? "#ef4444" : "#94a3b8"
                    }
                  />
                )}
              </View>

              {/* Keep badge */}
              {isKeep && (
                <View className="absolute top-1 left-1 bg-success rounded-md px-1.5 py-0.5 flex-row items-center gap-0.5">
                  <Icon name="star" size={9} color="#fff" />
                  <Text className="text-white text-[9px] font-bold">KEEP</Text>
                </View>
              )}

              {/* Selected checkmark */}
              {!isKeep && (
                <View className="absolute top-1 right-1 w-6 h-6 rounded-full border-2 border-white bg-black/50 items-center justify-center">
                  {isSelected && (
                    <Icon name="checkmark" size={14} color="#fff" />
                  )}
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
            : `Original protected from deletion (${formatSizeCompact(group.files.find((f) => f.id === keepId)?.sizeBytes ?? 0)})`}
        </Text>
      </View>
      {
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/photo-group/[id]",
              params: { id: group.id },
            })
          }
          className="p-4 border-t border-border items-center"
        >
          <Text className="text-primary text-sm font-semibold">
            View all {group.files.length} photos
          </Text>
        </Pressable>
      }
    </Card>
  );
});
