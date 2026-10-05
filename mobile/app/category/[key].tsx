import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library/legacy";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Icon, CategoryIcons, type IconName } from "@/components/ui/Icon";
import { FileDetailModal } from "@/components/FileDetailModal";
import { useAppStore, useSelectedBytes } from "@/stores/useAppStore";
import { StorageIndexService, type StorageQueryParams } from "@/db/StorageIndexService";
import { DeleteCoordinator } from "@/services/DeleteCoordinator";
import { CategoryColors, ThemeColors, StatusColors } from "@/theme/colors";
import { formatSizeCompact, formatRelativeTime } from "@/lib/format";
import { track } from "@/lib/analytics";
import type { StorageItem, StorageCategory } from "@/db/schema";
import type { CategoryKey } from "@/lib/types";

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
  apks: "Installation packages",
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
  const { selectedFileIds, toggleFile, selectAllFiles, deselectAllFiles, scanPhase } = useAppStore();
  const selectedBytes = useSelectedBytes();

  const categoryKey = (key ?? "other") as CategoryKey;
  const label = CATEGORY_LABELS[categoryKey] ?? "Files";
  const color = CategoryColors[categoryKey] ?? CategoryColors.other;
  const iconName = (CategoryIcons[categoryKey] ?? "cube") as IconName;

  const [sizeFilter, setSizeFilter] = useState<string>("all");
  const [subTypeFilter, setSubTypeFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("size_desc");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [selectedModalItem, setSelectedModalItem] = useState<StorageItem | null>(null);

  // SQLite data state
  const [items, setItems] = useState<StorageItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalBytes, setTotalBytes] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Check permissions for media categories
  const checkPermissions = useCallback(async () => {
    if (categoryKey === "photos" || categoryKey === "videos" || categoryKey === "audio") {
      const { status } = await MediaLibrary.getPermissionsAsync();
      setPermissionDenied(status !== "granted");
    } else {
      setPermissionDenied(false);
    }
  }, [categoryKey]);

  // Query SQLite
  const loadData = useCallback(() => {
    setLoading(true);
    const minBytes = SIZE_FILTERS.find((f) => f.key === sizeFilter)?.min ?? 0;

    const queryParams: StorageQueryParams = {
      minSizeBytes: minBytes > 0 ? minBytes : undefined,
      sortBy: sortOrder,
      limit: 150,
      offset: 0,
    };

    if (categoryKey === "whatsapp") {
      queryParams.source = "whatsapp";
      if (subTypeFilter !== "all") {
        queryParams.whatsappType = subTypeFilter as any;
      }
    } else if (categoryKey === "junk") {
      queryParams.isJunk = true;
    } else if (categoryKey === "other") {
      queryParams.isLarge = true;
    } else if (categoryKey === "duplicates") {
      // Query items with duplicateGroupId
    } else if (
      ["photos", "videos", "audio", "documents", "downloads", "apks"].includes(categoryKey)
    ) {
      queryParams.category = categoryKey as StorageCategory;
    }

    const res = StorageIndexService.getItems(queryParams);

    let filtered = res.items;
    if (categoryKey === "duplicates") {
      filtered = res.items.filter((i) => !!i.duplicateGroupId);
    }

    setItems(filtered);
    setTotalCount(res.totalCount);
    setTotalBytes(res.totalBytes);
    setLoading(false);
  }, [categoryKey, sizeFilter, subTypeFilter, sortOrder]);

  useEffect(() => {
    checkPermissions();
    loadData();

    // Subscribe to DeleteCoordinator updates
    const unsubscribe = DeleteCoordinator.addListener(() => {
      loadData();
    });
    return () => unsubscribe();
  }, [checkPermissions, loadData]);

  const requestPermission = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status === "granted") {
      setPermissionDenied(false);
      loadData();
    }
  };

  // Subtype chips for WhatsApp
  const subTypes = useMemo(() => {
    if (categoryKey === "whatsapp") {
      return ["all", "image", "video", "audio", "document"];
    }
    return [];
  }, [categoryKey]);

  // Bulk actions
  const allCurrentSelected = items.length > 0 && items.every((f) => selectedFileIds.has(f.id));
  const selectedCount = items.filter((f) => selectedFileIds.has(f.id)).length;

  const toggleSelectAll = () => {
    const ids = items.map((f) => f.id);
    if (allCurrentSelected) {
      deselectAllFiles(ids);
    } else {
      selectAllFiles(ids);
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: StorageItem }) => {
      const selected = selectedFileIds.has(item.id);
      const isVisual =
        item.canPreview ||
        item.mimeType?.startsWith("image/") ||
        item.mimeType?.startsWith("video/") ||
        /\.(jpe?g|png|webp|gif|bmp|heic|mp4|mov|mkv|3gp)$/i.test(item.name || item.uri);

      const locationText = item.path
        ? item.path.replace(/^\/storage\/emulated\/0\/?/, "")
        : item.source;

      return (
        <Pressable
          onPress={() => setSelectedModalItem(item)}
          className={`flex-row items-center gap-3 p-3 rounded-2xl border mb-2 active:opacity-95 ${
            selected ? "border-primary bg-primary/5" : "border-border bg-card"
          }`}
        >
          {/* Thumbnail preview */}
          {isVisual ? (
            <View className="w-12 h-12 rounded-xl overflow-hidden bg-muted relative">
              <Image
                source={{ uri: item.uri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                transition={150}
              />
              {item.mimeType?.startsWith("video/") && (
                <View className="absolute inset-0 items-center justify-center bg-black/30">
                  <Icon name="videocam" size={16} color="#fff" />
                </View>
              )}
            </View>
          ) : (
            <View
              className="w-12 h-12 rounded-xl items-center justify-center"
              style={{ backgroundColor: `${color}15` }}
            >
              <Icon name={iconName} size={22} color={color} />
            </View>
          )}

          {/* Details */}
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
              {item.name}
            </Text>
            <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
              {formatSizeCompact(item.sizeBytes)} · {formatRelativeTime(item.modifiedAt)}
              {locationText ? ` · ${locationText}` : ""}
            </Text>
          </View>

          {/* Checkbox */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              toggleFile(item.id);
            }}
            hitSlop={8}
            className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
              selected ? "bg-primary border-primary" : "border-muted-foreground/40"
            }`}
          >
            {selected && <Icon name="checkmark" size={14} color="#fff" />}
          </Pressable>
        </Pressable>
      );
    },
    [selectedFileIds, toggleFile, color, iconName]
  );

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title={label}
        subtitle={`${items.length} files · ${formatSizeCompact(totalBytes)}`}
        showBack
        rightIcon={allCurrentSelected ? "close-circle" : "checkbox-outline"}
        onRightPress={toggleSelectAll}
      />

      {/* Filter Toolbar */}
      <View className="px-4 pb-2">
        {/* Size Filters */}
        <View className="flex-row flex-wrap gap-1.5 mb-2">
          {SIZE_FILTERS.map((f) => {
            const active = f.key === sizeFilter;
            return (
              <Pressable
                key={f.key}
                onPress={() => setSizeFilter(f.key)}
                className={`px-3 py-1.5 rounded-full border ${
                  active ? "bg-primary border-primary" : "bg-card border-border"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    active ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Subtype chips for WhatsApp */}
        {subTypes.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mb-2">
            {subTypes.map((type) => {
              const active = subTypeFilter === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => setSubTypeFilter(type)}
                  className={`px-3 py-1 rounded-full border ${
                    active ? "bg-secondary border-secondary" : "bg-card border-border"
                  }`}
                >
                  <Text
                    className={`text-xs capitalize font-medium ${
                      active ? "text-secondary-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {type}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Sort & Select all info */}
        <View className="flex-row items-center justify-between pt-1">
          <Pressable onPress={toggleSelectAll} className="flex-row items-center gap-1.5">
            <Icon
              name={allCurrentSelected ? "checkbox" : "square-outline"}
              size={16}
              color={ThemeColors.primary}
            />
            <Text className="text-xs font-semibold text-primary">
              {allCurrentSelected ? "Deselect all" : "Select all"}
            </Text>
          </Pressable>

          <View className="flex-row gap-1">
            {(
              [
                { key: "size_desc", label: "Largest" },
                { key: "date_desc", label: "Newest" },
                { key: "date_asc", label: "Oldest" },
              ] as const
            ).map((s) => (
              <Pressable
                key={s.key}
                onPress={() => setSortOrder(s.key)}
                className={`px-2 py-1 rounded-md ${sortOrder === s.key ? "bg-muted" : ""}`}
              >
                <Text
                  className={`text-xs font-medium ${
                    sortOrder === s.key ? "text-foreground font-bold" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Main Content Area: Multi-State handling */}
      {permissionDenied ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-full bg-accent items-center justify-center mb-4">
            <Icon name="shield-outline" size={40} color={ThemeColors.primary} />
          </View>
          <Text className="text-foreground font-bold text-lg text-center">Permission required</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            We need access to your {label.toLowerCase()} to discover files you can safely review and
            clean.
          </Text>
          <Button variant="primary" size="lg" className="mt-6" onPress={requestPermission}>
            Grant Access
          </Button>
        </View>
      ) : loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={ThemeColors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-full bg-accent items-center justify-center mb-4">
            <Icon name="checkmark-circle" size={44} color={StatusColors.success} />
          </View>
          <Text className="text-foreground font-bold text-lg text-center">You're all clear! 🎉</Text>
          <Text className="text-muted-foreground text-sm text-center mt-1">
            No {label.toLowerCase()} found matching your filters.
          </Text>
          <Button
            variant="secondary"
            size="md"
            className="mt-5"
            onPress={() => {
              setSizeFilter("all");
              setSubTypeFilter("all");
            }}
          >
            Reset Filters
          </Button>
        </View>
      ) : (
        <View className="flex-1 px-4">
          <FlashList
            data={items}
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
          <Button
            variant="primary"
            size="lg"
            fullWidth
            rightIcon={<Icon name="arrow-forward" size={18} color="#fff" />}
            onPress={() => router.push("/review")}
          >
            Review cleanup ({formatSizeCompact(selectedBytes)})
          </Button>
        </View>
      )}

      {/* File Details & Real Preview Modal */}
      <FileDetailModal
        item={selectedModalItem}
        visible={!!selectedModalItem}
        onClose={() => setSelectedModalItem(null)}
        onDeleted={() => {
          setSelectedModalItem(null);
          loadData();
        }}
      />
    </View>
  );
}
