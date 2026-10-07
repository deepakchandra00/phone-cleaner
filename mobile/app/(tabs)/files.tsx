import { isUnusedApp } from "@/lib/appUsage";
import { useMemoryDiagnostics } from "@/hooks/useMemoryDiagnostics";
import { FileDetailModal } from "@/components/FileDetailModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CategoryIcons, Icon, type IconName } from "@/components/ui/Icon";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import type { StorageItem } from "@/db/schema";
import { StorageIndexService } from "@/db/StorageIndexService";
import { track } from "@/lib/analytics";
import {
  formatCount,
  formatRelativeTime,
  formatSizeCompact,
} from "@/lib/format";
import type { AppItem, CategoryKey } from "@/lib/types";
import { DeleteCoordinator } from "@/services/DeleteCoordinator";
import {
  registerFileSizes,
  useAppStore,
  useSelectedBytes,
} from "@/stores/useAppStore";
import { CategoryColors, StatusColors, ThemeColors } from "@/theme/colors";
import { FlashList } from "@shopify/flash-list";
import { AndroidStorage } from "android-storage";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShallow } from "zustand/react/shallow";

type Section = "large" | "whatsapp" | "apps";

const SECTIONS: {
  key: Section;
  label: string;
  icon: IconName;
  color: string;
}[] = [
  {
    key: "large",
    label: "Space Hogs",
    icon: "cube",
    color: CategoryColors.videos,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: "logo-whatsapp",
    color: CategoryColors.whatsapp,
  },
  {
    key: "apps",
    label: "App Manager",
    icon: "apps",
    color: CategoryColors.apps,
  },
];

const SIZE_FILTERS = [
  { key: "all", label: "All", min: 0 },
  { key: "10mb", label: "> 10 MB", min: 10 * 1024 ** 2 },
  { key: "50mb", label: "> 50 MB", min: 50 * 1024 ** 2 },
  { key: "100mb", label: "> 100 MB", min: 100 * 1024 ** 2 },
  { key: "500mb", label: "> 500 MB", min: 500 * 1024 ** 2 },
] as const;

type SizeFilterKey = (typeof SIZE_FILTERS)[number]["key"];

export default function FilesScreen() {
  const [section, setSection] = useState<Section>("large");
  useMemoryDiagnostics(`Files/${section}`);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Files"
        subtitle="Find space hogs, WhatsApp media & apps"
      />
      {/* Section switcher */}
      <View className="px-4 pb-2">
        <View className="flex-row gap-1.5 bg-muted rounded-xl p-1">
          {SECTIONS.map((s) => {
            const active = s.key === section;
            return (
              <Pressable
                key={s.key}
                onPress={() => {
                  setSection(s.key);
                  track("category_viewed", { category: s.key });
                }}
                className={`flex-1 py-2 rounded-lg items-center ${active ? "bg-card" : ""}`}
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: active ? 0.1 : 0,
                  shadowRadius: 2,
                  elevation: active ? 1 : 0,
                }}
              >
                <View className="flex-row items-center gap-1.5">
                  <Icon
                    name={s.icon}
                    size={15}
                    color={active ? s.color : ThemeColors.mutedForeground}
                  />
                  <Text
                    className={`text-xs font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {s.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="flex-1">
        {section === "large" && <LargeFilesSection />}
        {section === "whatsapp" && <WhatsAppSection />}
        {section === "apps" && <AppsSection />}
      </View>
    </View>
  );
}

/* ─── Large Files ─────────────────────────────────────────────────────── */

function LargeFilesSection() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedFileIds, toggleFile, selectAllFiles, deselectAllFiles } =
    useAppStore(
      useShallow((s) => ({
        selectedFileIds: s.selectedFileIds,
        toggleFile: s.toggleFile,
        selectAllFiles: s.selectAllFiles,
        deselectAllFiles: s.deselectAllFiles,
      })),
    );
  const selectedBytes = useSelectedBytes();
  const [filter, setFilter] = useState<SizeFilterKey>("10mb");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modalItem, setModalItem] = useState<StorageItem | null>(null);
  const [files, setFiles] = useState<StorageItem[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadData = useCallback(() => {
    setLoading(true);
    setError("");
    try {
      const min =
        SIZE_FILTERS.find((f) => f.key === filter)?.min ?? 10 * 1024 ** 2;
      const res = StorageIndexService.getItems({
        isLarge: true,
        minSizeBytes: min,
        search: debouncedSearch.trim() || undefined,
        sortBy: "size_desc",
        limit: 60,
        offset,
      });
      setFiles(res.items);
      setTotalBytes(res.totalBytes);
      setTotalCount(res.totalCount);
      registerFileSizes(res.items);
    } catch {
      setError("File index unavailable. Finish the current scan and retry.");
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch, offset]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) loadData();
    })();
    const unsub = DeleteCoordinator.addListener(() => {
      if (isMounted) loadData();
    });
    return () => {
      isMounted = false;
      unsub();
    };
  }, [loadData]);

  const selectedCount = files.filter((f) => selectedFileIds.has(f.id)).length;
  const allCurrentSelected =
    files.length > 0 && files.every((f) => selectedFileIds.has(f.id));

  const toggleSelectAll = () => {
    const ids = files.map((f) => f.id);
    if (allCurrentSelected) {
      deselectAllFiles(ids);
    } else {
      selectAllFiles(ids);
    }
  };

  const renderFileRow = useCallback(
    ({ item }: { item: StorageItem }) => (
      <View className="px-4 py-1">
        <FileRow
          file={item}
          selected={selectedFileIds.has(item.id)}
          onToggle={() => toggleFile(item.id, item.sizeBytes)}
          onPress={() => setModalItem(item)}
        />
      </View>
    ),
    [selectedFileIds, toggleFile],
  );

  return (
    <View className="flex-1">
      <FlashList
        drawDistance={150}
        maxItemsInRecyclePool={12}
        data={files}
        keyExtractor={(item) => item.id}
        renderItem={renderFileRow}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <View className="px-4 pb-2">
            <Card className="mb-3">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-muted-foreground text-xs">
                    Total space hogs
                  </Text>
                  <Text className="text-foreground text-xl font-bold">
                    {formatSizeCompact(totalBytes)}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    {formatCount(totalCount)} files
                  </Text>
                </View>
                <View
                  className="w-12 h-12 rounded-xl items-center justify-center"
                  style={{ backgroundColor: `${CategoryColors.videos}20` }}
                >
                  <Icon name="cube" size={24} color={CategoryColors.videos} />
                </View>
              </View>
            </Card>

            {!!error && (
              <Text
                accessibilityLiveRegion="polite"
                className="text-destructive mb-3"
              >
                {error}
              </Text>
            )}
            <Text className="text-muted-foreground text-xs mb-3">
              Largest accessible files first. Review contents before deleting;
              large does not mean unwanted.
            </Text>
            {/* Real-time search */}
            <View className="flex-row items-center bg-card rounded-xl px-3 py-2 mb-2 border border-border">
              <Icon
                name="search"
                size={15}
                color={ThemeColors.mutedForeground}
              />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search large files…"
                placeholderTextColor={ThemeColors.mutedForeground}
                className="flex-1 ml-2 text-foreground text-xs py-0"
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                  <Icon
                    name="close-circle"
                    size={16}
                    color={ThemeColors.mutedForeground}
                  />
                </Pressable>
              )}
            </View>

            {/* Size filters */}
            <View className="flex-row flex-wrap gap-2 mb-2">
              {SIZE_FILTERS.map((f) => {
                const active = f.key === filter;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => {
                      setFilter(f.key);
                      setOffset(0);
                    }}
                    className={`px-3 py-1.5 rounded-full border ${active ? "bg-primary border-primary" : "bg-card border-border"}`}
                  >
                    <Text
                      className={`text-xs font-medium ${active ? "text-primary-foreground font-semibold" : "text-muted-foreground"}`}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Select All Toggle Header */}
            <View className="flex-row items-center justify-between pt-1">
              <Pressable
                onPress={toggleSelectAll}
                className="flex-row items-center gap-1.5 py-1"
              >
                <Icon
                  name={allCurrentSelected ? "checkbox" : "square-outline"}
                  size={16}
                  color={ThemeColors.primary}
                />
                <Text className="text-xs font-semibold text-primary">
                  {allCurrentSelected ? "Deselect page" : "Select page"}
                </Text>
              </Pressable>
              <Text className="text-muted-foreground text-xs font-medium">
                {files.length} file{files.length === 1 ? "" : "s"}
              </Text>
            </View>
          </View>
        }
        ListFooterComponent={
          <View className="px-4 flex-row gap-2 mt-4">
            <Button
              variant="outline"
              className="flex-1"
              disabled={offset === 0}
              onPress={() => setOffset(Math.max(0, offset - 60))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              disabled={offset + 60 >= totalCount}
              onPress={() => setOffset(offset + 60)}
            >
              Next
            </Button>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View className="py-12 items-center justify-center">
              <Text className="text-muted-foreground text-sm">
                Scanning files…
              </Text>
            </View>
          ) : (
            <View className="py-12 items-center justify-center">
              <Icon
                name="checkmark-circle"
                size={44}
                color={StatusColors.success}
              />
              <Text className="text-foreground font-semibold text-base mt-2">
                No large files found
              </Text>
              <Text className="text-muted-foreground text-xs mt-1">
                Try selecting a different filter above
              </Text>
            </View>
          )
        }
      />

      {selectedCount > 0 && (
        <SelectionBar
          count={selectedCount}
          bytes={selectedBytes}
          insets={insets}
          onReview={() => router.push("/review")}
        />
      )}

      <FileDetailModal
        item={modalItem}
        visible={!!modalItem}
        onClose={() => setModalItem(null)}
        onDeleted={() => {
          setModalItem(null);
          loadData();
        }}
      />
    </View>
  );
}

/* ─── WhatsApp ─────────────────────────────────────────────────────────── */

function WhatsAppSection() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedFileIds, toggleFile, selectAllFiles, deselectAllFiles } =
    useAppStore(
      useShallow((s) => ({
        selectedFileIds: s.selectedFileIds,
        toggleFile: s.toggleFile,
        selectAllFiles: s.selectAllFiles,
        deselectAllFiles: s.deselectAllFiles,
      })),
    );
  const selectedBytes = useSelectedBytes();
  const [selectedSubtype, setSelectedSubtype] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modalItem, setModalItem] = useState<StorageItem | null>(null);
  const [files, setFiles] = useState<StorageItem[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const res = StorageIndexService.getItems({
        source: "whatsapp",
        whatsappType:
          selectedSubtype !== "all" ? (selectedSubtype as any) : undefined,
        search: debouncedSearch.trim() || undefined,
        sortBy: "size_desc",
        limit: 100,
      });
      setFiles(res.items);
      setTotalBytes(res.totalBytes);
      registerFileSizes(res.items);
    } finally {
      setLoading(false);
    }
  }, [selectedSubtype, debouncedSearch]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) loadData();
    })();
    const unsub = DeleteCoordinator.addListener(() => {
      if (isMounted) loadData();
    });
    return () => {
      isMounted = false;
      unsub();
    };
  }, [loadData]);

  const selectedCount = files.filter((f) => selectedFileIds.has(f.id)).length;
  const allCurrentSelected =
    files.length > 0 && files.every((f) => selectedFileIds.has(f.id));

  const toggleSelectAll = () => {
    const ids = files.map((f) => f.id);
    if (allCurrentSelected) {
      deselectAllFiles(ids);
    } else {
      selectAllFiles(ids);
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: StorageItem }) => (
      <View className="px-4 py-1">
        <FileRow
          file={item}
          selected={selectedFileIds.has(item.id)}
          onToggle={() => toggleFile(item.id, item.sizeBytes)}
          onPress={() => setModalItem(item)}
        />
      </View>
    ),
    [selectedFileIds, toggleFile],
  );

  return (
    <View className="flex-1">
      <FlashList
        drawDistance={150}
        maxItemsInRecyclePool={12}
        data={files}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <View className="px-4 pb-2">
            {/* WhatsApp summary card */}
            <Pressable
              className="rounded-2xl p-4 mb-3 active:opacity-95"
              style={{ backgroundColor: "#0b4f3c" }}
              onPress={() => router.push("/category/whatsapp")}
            >
              <View className="flex-row items-center gap-3">
                <View className="w-12 h-12 rounded-xl bg-white/15 items-center justify-center">
                  <Icon name="logo-whatsapp" size={26} color="#25D366" />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-bold text-base">
                    WhatsApp media
                  </Text>
                  <Text className="text-white/80 text-xs">
                    {formatCount(files.length)} files found
                  </Text>
                </View>
                <Text className="text-white text-2xl font-bold">
                  {formatSizeCompact(totalBytes)}
                </Text>
              </View>
            </Pressable>

            {/* Real-time search */}
            <View className="flex-row items-center bg-card rounded-xl px-3 py-2 mb-2 border border-border">
              <Icon
                name="search"
                size={15}
                color={ThemeColors.mutedForeground}
              />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search WhatsApp files…"
                placeholderTextColor={ThemeColors.mutedForeground}
                className="flex-1 ml-2 text-foreground text-xs py-0"
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                  <Icon
                    name="close-circle"
                    size={16}
                    color={ThemeColors.mutedForeground}
                  />
                </Pressable>
              )}
            </View>

            {/* Subtype Filter chips */}
            <View className="flex-row flex-wrap gap-2 mb-2">
              {[
                { key: "all", label: "All" },
                { key: "image", label: "Images" },
                { key: "video", label: "Videos" },
                { key: "audio", label: "Audio" },
                { key: "document", label: "Documents" },
                { key: "sent", label: "Sent files" },
              ].map((sub) => {
                const active = selectedSubtype === sub.key;
                return (
                  <Pressable
                    key={sub.key}
                    onPress={() => setSelectedSubtype(sub.key)}
                    className={`px-3 py-1.5 rounded-full border ${
                      active
                        ? "bg-primary border-primary"
                        : "bg-card border-border"
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        active
                          ? "text-primary-foreground font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {sub.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Select All Toggle Header */}
            <View className="flex-row items-center justify-between pt-1">
              <Pressable
                onPress={toggleSelectAll}
                className="flex-row items-center gap-1.5 py-1"
              >
                <Icon
                  name={allCurrentSelected ? "checkbox" : "square-outline"}
                  size={16}
                  color={ThemeColors.primary}
                />
                <Text className="text-xs font-semibold text-primary">
                  {allCurrentSelected ? "Deselect all" : "Select all"}
                </Text>
              </Pressable>
              <Text className="text-muted-foreground text-xs font-medium">
                {files.length} file{files.length === 1 ? "" : "s"}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View className="py-12 items-center justify-center">
              <Text className="text-muted-foreground text-sm">
                Scanning files…
              </Text>
            </View>
          ) : (
            <View className="py-12 items-center justify-center">
              <Icon
                name="logo-whatsapp"
                size={44}
                color={CategoryColors.whatsapp}
              />
              <Text className="text-foreground font-semibold text-base mt-2">
                No WhatsApp files found
              </Text>
              <Text className="text-muted-foreground text-xs mt-1">
                WhatsApp images, voice notes and videos will appear here
              </Text>
            </View>
          )
        }
      />

      {selectedCount > 0 && (
        <SelectionBar
          count={selectedCount}
          bytes={selectedBytes}
          insets={insets}
          onReview={() => router.push("/review")}
        />
      )}

      <FileDetailModal
        item={modalItem}
        visible={!!modalItem}
        onClose={() => setModalItem(null)}
        onDeleted={() => {
          setModalItem(null);
          loadData();
        }}
      />
    </View>
  );
}

/* ─── App Manager ──────────────────────────────────────────────────────── */

function AppsSection() {
  const { scanResult } = useAppStore(
    useShallow((s) => ({ scanResult: s.scanResult })),
  );
  const [sort, setSort] = useState<"size" | "unused">("size");
  const [unusedDays, setUnusedDays] = useState(90);
  const [onlyUnused, setOnlyUnused] = useState(false);

  const apps = useMemo(() => {
    const list = scanResult?.apps ?? [];
    return [...list].sort((a, b) =>
      sort === "size"
        ? b.sizeBytes - a.sizeBytes
        : (a.lastUsedAt || Number.MAX_SAFE_INTEGER) -
          (b.lastUsedAt || Number.MAX_SAFE_INTEGER),
    );
  }, [scanResult?.apps, sort]);

  const [currentTimestamp] = useState(() => Date.now());
  const totalSize = useMemo(
    () => apps.reduce((s, a) => s + a.sizeBytes, 0),
    [apps],
  );
  const unusedApps = useMemo(
    () => apps.filter((a) => isUnusedApp(a, unusedDays, currentTimestamp)),
    [apps, currentTimestamp, unusedDays],
  );
  const unusedBytes = useMemo(
    () => unusedApps.reduce((s, a) => s + a.sizeBytes, 0),
    [unusedApps],
  );
  const totalCacheBytes = useMemo(
    () => apps.reduce((s, a) => s + a.cacheBytes, 0),
    [apps],
  );

  const renderAppRow = useCallback(
    ({ item }: { item: AppItem }) => (
      <View className="px-4 py-1">
        <AppRow app={item} now={currentTimestamp} />
      </View>
    ),
    [currentTimestamp],
  );

  return (
    <View className="flex-1">
      <FlatList
        data={onlyUnused ? unusedApps : apps}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={3}
        updateCellsBatchingPeriod={80}
        removeClippedSubviews
        keyExtractor={(item) => item.packageName}
        renderItem={renderAppRow}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <View className="px-4 pb-2">
            <Card className="mb-3">
              <View className="flex-row items-center justify-between mb-3">
                <View>
                  <Text className="text-muted-foreground text-xs">
                    Visible installed apps
                  </Text>
                  <Text className="text-foreground text-2xl font-bold">
                    {apps.length}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    using {formatSizeCompact(totalSize)}
                  </Text>
                </View>
                <View
                  className="w-12 h-12 rounded-xl items-center justify-center"
                  style={{ backgroundColor: `${CategoryColors.apps}20` }}
                >
                  <Icon name="apps" size={24} color={CategoryColors.apps} />
                </View>
              </View>
              <View className="flex-row gap-2 pt-3 border-t border-border">
                <View className="flex-1 bg-warning/10 rounded-lg p-2.5">
                  <Text className="text-warning-foreground text-xs">
                    Not used ({unusedDays}d+)
                  </Text>
                  <Text className="text-foreground font-bold mt-0.5">
                    {unusedApps.length} apps
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    {formatSizeCompact(unusedBytes)}
                  </Text>
                </View>
                <View className="flex-1 bg-muted rounded-lg p-2.5">
                  <Text className="text-muted-foreground text-xs">
                    Reported cache
                  </Text>
                  <Text className="text-foreground font-bold mt-0.5">
                    {formatSizeCompact(totalCacheBytes)}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    review in Settings
                  </Text>
                </View>
              </View>
            </Card>

            <Text className="text-muted-foreground text-xs mb-2">
              Only recorded usage is considered. Unknown history and system apps
              are excluded from unused suggestions. Scan again after granting
              Usage access.
            </Text>
            {!AndroidStorage.isUsageAccessGranted() && (
              <Button
                variant="secondary"
                onPress={() =>
                  void AndroidStorage.requestUsageAccess().then((opened) => {
                    if (!opened)
                      Alert.alert(
                        "Usage access",
                        "Open Android Settings and search for Usage access.",
                      );
                  })
                }
              >
                Enable usage access
              </Button>
            )}
            <View className="flex-row gap-2 my-2">
              {[30, 60, 90].map((days) => (
                <Pressable
                  key={days}
                  accessibilityRole="button"
                  accessibilityState={{ selected: unusedDays === days }}
                  onPress={() => setUnusedDays(days)}
                  className="flex-1 bg-muted rounded-lg p-3"
                >
                  <Text
                    className={
                      unusedDays === days
                        ? "text-primary font-bold"
                        : "text-foreground"
                    }
                  >
                    {days} days
                  </Text>
                </Pressable>
              ))}
            </View>
            <Button
              variant="outline"
              onPress={() => setOnlyUnused(!onlyUnused)}
            >
              {onlyUnused ? "Show all visible apps" : "Show unused apps only"}
            </Button>
            {/* Sort toggle */}
            <View className="flex-row gap-2 mb-2">
              {(["size", "unused"] as const).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSort(s)}
                  className={`flex-1 py-2 rounded-lg items-center ${sort === s ? "bg-primary" : "bg-muted"}`}
                >
                  <Text
                    className={`text-xs font-medium ${sort === s ? "text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    {s === "size" ? "Largest first" : "Least used first"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListFooterComponent={
          <View className="px-4 mt-4 mb-6 flex-row items-center gap-2">
            <Icon
              name="information-circle-outline"
              size={13}
              color={ThemeColors.mutedForeground}
            />
            <Text className="text-xs text-muted-foreground">
              Usage access shows app statistics; it does not clear cache. Tap
              App settings, then Storage and Clear cache. Labels vary by phone.
              Avoid Clear data if you want to keep the app's saved data.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View className="py-12 items-center justify-center">
            <Icon name="apps" size={44} color={CategoryColors.apps} />
            <Text className="text-foreground font-semibold text-base mt-2">
              {onlyUnused ? "No recorded unused apps" : "No apps scanned"}
            </Text>
            <Text className="text-muted-foreground text-xs mt-1">
              Run a scan to manage installed apps
            </Text>
          </View>
        }
      />
    </View>
  );
}

/* ─── Shared rows ──────────────────────────────────────────────────────── */

const FileRow = React.memo(function FileRow({
  file,
  selected,
  onToggle,
  onPress,
}: {
  file: StorageItem;
  selected: boolean;
  onToggle: () => void;
  onPress?: () => void;
}) {
  const color =
    CategoryColors[file.category as CategoryKey] ?? CategoryColors.other;
  const iconName = (CategoryIcons[file.category as CategoryKey] ??
    "document") as IconName;

  const isVisual =
    file.canPreview ||
    file.mimeType?.startsWith("image/") ||
    file.mimeType?.startsWith("video/") ||
    /\.(jpe?g|png|webp|gif|bmp|heic|mp4|mov|mkv|3gp)$/i.test(
      file.name || file.uri,
    );

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 p-3 rounded-2xl border ${
        selected ? "border-primary bg-primary/5" : "border-border bg-card"
      } active:opacity-90`}
    >
      {isVisual ? (
        <View className="w-11 h-11 rounded-lg overflow-hidden bg-muted relative">
          <Image
            source={{ uri: file.uri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={0}
            cachePolicy="disk"
            recyclingKey={file.id}
            decodeFormat="rgb"
          />
          {file.mimeType?.startsWith("video/") && (
            <View className="absolute inset-0 items-center justify-center bg-black/30">
              <Icon name="videocam" size={16} color="#fff" />
            </View>
          )}
        </View>
      ) : (
        <View
          className="w-11 h-11 rounded-lg items-center justify-center"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon name={iconName} size={20} color={color} />
        </View>
      )}

      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
          {file.name}
        </Text>
        <Text
          className="text-muted-foreground text-xs mt-0.5"
          numberOfLines={1}
        >
          {formatSizeCompact(file.sizeBytes)} ·{" "}
          {formatRelativeTime(file.modifiedAt)}
          {file.path
            ? ` · ${file.path.replace(/^\/storage\/emulated\/0\/?/, "")}`
            : ""}
        </Text>
      </View>

      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        hitSlop={8}
        className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
          selected ? "bg-primary border-primary" : "border-muted-foreground/30"
        }`}
      >
        {selected && <Icon name="checkmark" size={14} color="#fff" />}
      </Pressable>
    </Pressable>
  );
});

function AppRow({ app, now }: { app: AppItem; now?: number }) {
  const referenceTime = now ?? app.lastUsedAt;
  const daysUnused = Math.floor((referenceTime - app.lastUsedAt) / 86400000);
  const isUnused = app.lastUsedAt > 0 && daysUnused > 90;

  return (
    <Card className="p-3">
      <View className="flex-row items-center gap-3">
        <View
          className="w-11 h-11 rounded-xl items-center justify-center"
          style={{ backgroundColor: `${CategoryColors.apps}20` }}
        >
          {app.iconUri ? (
            <Image
              source={{ uri: app.iconUri }}
              style={{ width: 32, height: 32, borderRadius: 8 }}
              contentFit="contain"
              cachePolicy="disk"
              recyclingKey={app.packageName}
              decodeFormat="rgb"
            />
          ) : (
            <Icon name="apps" size={22} color={CategoryColors.apps} />
          )}
        </View>
        <View className="flex-1 min-w-0">
          <Text
            className="text-foreground text-sm font-semibold"
            numberOfLines={1}
          >
            {app.label}
          </Text>
          <Text className="text-muted-foreground text-xs mt-0.5">
            {formatSizeCompact(app.sizeBytes)}
            {isUnused
              ? ` · unused ${daysUnused}d`
              : app.lastUsedAt > 0
                ? ` · ${formatRelativeTime(app.lastUsedAt)}`
                : " · usage unavailable"}
          </Text>
          <View className="h-1 rounded-full bg-muted mt-1.5 overflow-hidden">
            <View
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (app.cacheBytes / Math.max(1, app.sizeBytes)) * 100)}%`,
                backgroundColor: CategoryColors.apps,
              }}
            />
          </View>
        </View>
        <Pressable
          className="px-3 py-1.5 rounded-lg bg-destructive/10 active:opacity-70"
          onPress={async () => {
            track("app_uninstall_tapped", { package: app.packageName });
            const launched = await AndroidStorage.uninstallApp(app.packageName);
            if (!launched) {
              Linking.openURL(`package:${app.packageName}`).catch(() => {});
            }
          }}
        >
          <Text className="text-destructive text-xs font-semibold">
            Uninstall
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${app.label} settings to review cache`}
        className="mt-3 py-3 bg-muted rounded-lg items-center"
        onPress={async () => {
          const opened = await AndroidStorage.openAppSettings(app.packageName);
          if (!opened)
            Alert.alert(
              "Open app settings",
              `Open Android Settings, then Apps, then ${app.label}. Choose Storage and Clear cache. Your installed app version may need updating to open this screen directly.`,
            );
        }}
      >
        <Text className="text-foreground text-xs font-semibold">
          App settings · review cache
        </Text>
      </Pressable>
    </Card>
  );
}

/* ─── Shared bits ──────────────────────────────────────────────────────── */

function SelectionBar({
  count,
  bytes,
  insets,
  onReview,
}: {
  count: number;
  bytes: number;
  insets: { bottom: number };
  onReview: () => void;
}) {
  return (
    <View
      className="absolute left-0 right-0 bg-card border-t border-border px-4 pt-3"
      style={{ bottom: 0, paddingBottom: Math.max(insets.bottom + 12, 24) }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-foreground text-sm">
          <Text className="font-bold">{count}</Text> selected
        </Text>
        <Text className="text-primary font-bold">
          {formatSizeCompact(bytes)}
        </Text>
      </View>
      <Button
        variant="primary"
        size="lg"
        fullWidth
        rightIcon={<Icon name="arrow-forward" size={18} color="#fff" />}
        onPress={onReview}
      >
        Review cleanup
      </Button>
    </View>
  );
}
