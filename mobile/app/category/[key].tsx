import React, { useMemo, useState, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
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
  downloads: "Downloads & Files",
  junk: "Junk & Cache",
  duplicates: "Duplicate photos",
  whatsapp: "WhatsApp media",
  apks: "Installation packages (APKs)",
  other: "Large Files",
};

const SIZE_FILTERS = [
  { key: "all", label: "All", min: 0 },
  { key: "10mb", label: "> 10 MB", min: 10 * 1024 ** 2 },
  { key: "50mb", label: "> 50 MB", min: 50 * 1024 ** 2 },
  { key: "100mb", label: "> 100 MB", min: 100 * 1024 ** 2 },
  { key: "500mb", label: "> 500 MB", min: 500 * 1024 ** 2 },
] as const;

type SortOrder = "size_desc" | "date_desc" | "date_asc";

export default function CategoryDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanResult, selectedFileIds, toggleFile } = useAppStore();
  const selectedBytes = useSelectedBytes();

  const categoryKey = (key ?? "other") as CategoryKey;
  const label = CATEGORY_LABELS[categoryKey] ?? "Files";
  const color = CategoryColors[categoryKey] ?? CategoryColors.other;
  const iconName = (CategoryIcons[categoryKey] ?? "cube") as IconName;

  const [sizeFilter, setSizeFilter] = useState<string>("all");
  const [subTypeFilter, setSubTypeFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("size_desc");

  // Map category to true scanned collections
  const rawFiles: ScannedFile[] = useMemo(() => {
    if (!scanResult) return [];
    switch (categoryKey) {
      case "photos":
        return scanResult.allPhotos ?? [];
      case "videos":
        return scanResult.allVideos ?? [];
      case "audio":
        return scanResult.allAudio ?? [];
      case "downloads":
      case "documents":
        return (scanResult.allDownloads && scanResult.allDownloads.length > 0)
          ? scanResult.allDownloads
          : scanResult.largeFiles.filter((f) => f.category === "downloads" || f.category === "documents");
      case "junk":
        return scanResult.junkFiles ?? [];
      case "whatsapp":
        return scanResult.whatsappFiles ?? [];
      case "duplicates":
        return scanResult.duplicateGroups ? scanResult.duplicateGroups.flatMap((g) => g.files.slice(1)) : [];
      case "apks":
        return scanResult.obsoleteApks ?? [];
      default:
        return scanResult.largeFiles ?? [];
    }
  }, [scanResult, categoryKey]);

  // Subtype chips for Junk / WhatsApp
  const subTypes = useMemo(() => {
    const set = new Set<string>();
    for (const f of rawFiles) {
      if (f.source) set.add(f.source);
    }
    return Array.from(set);
  }, [rawFiles]);

  // Filtered & sorted files
  const filteredFiles = useMemo(() => {
    const minBytes = SIZE_FILTERS.find((f) => f.key === sizeFilter)?.min ?? 0;
    let list = rawFiles.filter((f) => f.sizeBytes >= minBytes);

    if (subTypeFilter !== "all") {
      list = list.filter((f) => f.source === subTypeFilter);
    }

    return list.sort((a, b) => {
      if (sortOrder === "size_desc") return b.sizeBytes - a.sizeBytes;
      if (sortOrder === "date_desc") return b.modifiedAt - a.modifiedAt;
      return a.modifiedAt - b.modifiedAt;
    });
  }, [rawFiles, sizeFilter, subTypeFilter, sortOrder]);

  const totalBytes = useMemo(() => {
    return filteredFiles.reduce((s, f) => s + f.sizeBytes, 0);
  }, [filteredFiles]);

  const selectedCount = useMemo(() => {
    return filteredFiles.filter((f) => selectedFileIds.has(f.id)).length;
  }, [filteredFiles, selectedFileIds]);

  const isAllSelected = filteredFiles.length > 0 && selectedCount === filteredFiles.length;

  const handleSelectAllToggle = useCallback(() => {
    if (isAllSelected) {
      filteredFiles.forEach((f) => {
        if (selectedFileIds.has(f.id)) toggleFile(f.id);
      });
    } else {
      filteredFiles.forEach((f) => {
        if (!selectedFileIds.has(f.id)) toggleFile(f.id);
      });
    }
  }, [isAllSelected, filteredFiles, selectedFileIds, toggleFile]);

  const renderItem = useCallback(
    ({ item }: { item: ScannedFile }) => {
      const selected = selectedFileIds.has(item.id);
      const isMedia = item.mimeType.startsWith("image/") || item.mimeType.startsWith("video/");
      const hasPreview = isMedia && (item.path.startsWith("content://") || item.path.startsWith("file://") || item.path.startsWith("/"));

      return (
        <Pressable
          onPress={() => toggleFile(item.id)}
          className={`flex-row items-center gap-3 p-3 mb-2 rounded-2xl border ${
            selected ? "border-primary bg-primary/10" : "border-border bg-card"
          } active:opacity-90`}
        >
          {/* Thumbnail / Icon preview */}
          <View
            className="w-12 h-12 rounded-xl overflow-hidden items-center justify-center"
            style={{ backgroundColor: `${color}15` }}
          >
            {hasPreview ? (
              <Image
                source={{ uri: item.path }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                transition={100}
              />
            ) : (
              <Icon name={iconName} size={22} color={color} />
            )}
          </View>

          {/* Details */}
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
              {item.name}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-1">
              <Text className="text-primary font-bold text-xs">
                {formatSizeCompact(item.sizeBytes)}
              </Text>
              <Text className="text-muted-foreground text-xs">·</Text>
              <Text className="text-muted-foreground text-xs">
                {formatRelativeTime(item.modifiedAt)}
              </Text>
              {item.source && (
                <>
                  <Text className="text-muted-foreground text-xs">·</Text>
                  <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                    {item.source}
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Checkbox indicator */}
          <View
            className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
              selected ? "bg-primary border-primary" : "border-muted-foreground/30"
            }`}
          >
            {selected && <Icon name="checkmark" size={14} color="#fff" />}
          </View>
        </Pressable>
      );
    },
    [selectedFileIds, color, iconName, toggleFile],
  );

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title={label}
        subtitle={`${filteredFiles.length} items · ${formatSizeCompact(totalBytes)}`}
        showBack
      />

      {/* Filter and batch action toolbar */}
      <View className="px-4 pb-2">
        {/* Quick batch select row */}
        <View className="flex-row items-center justify-between py-1 mb-2">
          <Pressable
            onPress={handleSelectAllToggle}
            className="flex-row items-center gap-2 py-1 px-2.5 rounded-lg bg-card border border-border"
          >
            <View
              className={`w-4 h-4 rounded border items-center justify-center ${
                isAllSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
              }`}
            >
              {isAllSelected && <Icon name="checkmark" size={10} color="#fff" />}
            </View>
            <Text className="text-foreground text-xs font-semibold">
              {isAllSelected ? "Deselect all" : "Select all"}
            </Text>
          </Pressable>

          {/* Sort toggle */}
          <Pressable
            onPress={() => {
              setSortOrder((cur) =>
                cur === "size_desc" ? "date_desc" : cur === "date_desc" ? "date_asc" : "size_desc",
              );
            }}
            className="flex-row items-center gap-1.5 py-1 px-2.5 rounded-lg bg-card border border-border"
          >
            <Icon name="swap-vertical" size={14} color={ThemeColors.primary} />
            <Text className="text-foreground text-xs font-medium">
              {sortOrder === "size_desc" ? "Largest first" : sortOrder === "date_desc" ? "Newest first" : "Oldest first"}
            </Text>
          </Pressable>
        </View>

        {/* Size filter chips */}
        <View className="flex-row gap-1.5 flex-wrap">
          {SIZE_FILTERS.map((f) => {
            const active = sizeFilter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setSizeFilter(f.key)}
                className={`px-3 py-1 rounded-full border ${
                  active ? "bg-primary border-primary" : "bg-card border-border"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    active ? "text-primary-foreground font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Subtype filter chips (if multiple sources exist) */}
        {subTypes.length > 1 && (
          <View className="flex-row gap-1.5 flex-wrap mt-2">
            <Pressable
              onPress={() => setSubTypeFilter("all")}
              className={`px-2.5 py-0.5 rounded-full border ${
                subTypeFilter === "all" ? "bg-accent border-primary" : "bg-card border-border"
              }`}
            >
              <Text className="text-[11px] text-foreground font-medium">All Types</Text>
            </Pressable>
            {subTypes.map((st) => {
              const active = subTypeFilter === st;
              return (
                <Pressable
                  key={st}
                  onPress={() => setSubTypeFilter(st)}
                  className={`px-2.5 py-0.5 rounded-full border ${
                    active ? "bg-accent border-primary" : "bg-card border-border"
                  }`}
                >
                  <Text className="text-[11px] text-foreground font-medium" numberOfLines={1}>
                    {st}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* Main Virtualized List */}
      {filteredFiles.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-full bg-accent items-center justify-center mb-4">
            <Icon name={iconName} size={36} color={ThemeColors.primary} />
          </View>
          <Text className="text-foreground font-semibold text-lg">No files match</Text>
          <Text className="text-muted-foreground text-sm text-center mt-1">
            Try switching size filters or run a re-scan.
          </Text>
        </View>
      ) : (
        <View className="flex-1 px-4">
          <FlashList
            data={filteredFiles}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 130 }}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

      {/* Sticky Action Footer */}
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
                filteredFiles.forEach((f) => {
                  if (selectedFileIds.has(f.id)) toggleFile(f.id);
                });
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
                track("cleanup_review_opened", { source: "category_detail" });
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
