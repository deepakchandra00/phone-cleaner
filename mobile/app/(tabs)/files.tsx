import React, { useState, useMemo, useCallback, useEffect } from "react";
import { View, Text, Pressable, TextInput, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import Animated, { SlideInRight } from "react-native-reanimated";
import { AndroidStorage } from "android-storage";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon, CategoryIcons, type IconName } from "@/components/ui/Icon";
import { FileDetailModal } from "@/components/FileDetailModal";
import { useAppStore, useSelectedBytes } from "@/stores/useAppStore";
import { StorageIndexService } from "@/db/StorageIndexService";
import { DeleteCoordinator } from "@/services/DeleteCoordinator";
import { CategoryColors, ThemeColors, StatusColors } from "@/theme/colors";
import { formatSizeCompact, formatRelativeTime, formatCount } from "@/lib/format";
import { track } from "@/lib/analytics";
import type { StorageItem } from "@/db/schema";
import type { CategoryKey, AppItem } from "@/lib/types";

type Section = "large" | "whatsapp" | "apps";

const SECTIONS: { key: Section; label: string; icon: IconName; color: string }[] = [
  { key: "large", label: "Large Files", icon: "cube", color: CategoryColors.videos },
  { key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp", color: CategoryColors.whatsapp },
  { key: "apps", label: "App Manager", icon: "apps", color: CategoryColors.apps },
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

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Files" subtitle="Large files, WhatsApp & apps" />
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
                className={`flex-1 py-2 rounded-lg items-center ${active ? "bg-card shadow-sm" : ""}`}
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: active ? 0.1 : 0,
                  shadowRadius: 2,
                  elevation: active ? 1 : 0,
                }}
              >
                <View className="flex-row items-center gap-1.5">
                  <Icon name={s.icon} size={15} color={active ? s.color : ThemeColors.mutedForeground} />
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

      <Animated.View key={section} entering={SlideInRight.springify().delay(40)} className="flex-1">
        {section === "large" && <LargeFilesSection />}
        {section === "whatsapp" && <WhatsAppSection />}
        {section === "apps" && <AppsSection />}
      </Animated.View>
    </View>
  );
}

/* ─── Large Files ─────────────────────────────────────────────────────── */

function LargeFilesSection() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedFileIds, toggleFile, selectAllFiles, deselectAllFiles } = useAppStore();
  const selectedBytes = useSelectedBytes();
  const [filter, setFilter] = useState<SizeFilterKey>("10mb");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modalItem, setModalItem] = useState<StorageItem | null>(null);
  const [files, setFiles] = useState<StorageItem[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadData = useCallback(() => {
    const min = SIZE_FILTERS.find((f) => f.key === filter)?.min ?? 10 * 1024 ** 2;
    const res = StorageIndexService.getItems({
      isLarge: true,
      minSizeBytes: min,
      search: debouncedSearch.trim() || undefined,
      sortBy: "size_desc",
      limit: 100,
    });
    setFiles(res.items);
    setTotalBytes(res.totalBytes);
  }, [filter, debouncedSearch]);

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
  const allCurrentSelected = files.length > 0 && files.every((f) => selectedFileIds.has(f.id));

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
          onToggle={() => toggleFile(item.id)}
          onPress={() => setModalItem(item)}
        />
      </View>
    ),
    [selectedFileIds, toggleFile]
  );

  return (
    <View className="flex-1">
      <FlashList
        data={files}
        keyExtractor={(item) => item.id}
        renderItem={renderFileRow}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <View className="px-4 pb-2">
            <Card className="mb-3">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-muted-foreground text-xs">Total large files</Text>
                  <Text className="text-foreground text-xl font-bold">
                    {formatSizeCompact(totalBytes)}
                  </Text>
                  <Text className="text-muted-foreground text-xs">{formatCount(files.length)} files</Text>
                </View>
                <View
                  className="w-12 h-12 rounded-xl items-center justify-center"
                  style={{ backgroundColor: `${CategoryColors.videos}20` }}
                >
                  <Icon name="cube" size={24} color={CategoryColors.videos} />
                </View>
              </View>
            </Card>

            {/* Real-time search */}
            <View className="flex-row items-center bg-card rounded-xl px-3 py-2 mb-2 border border-border">
              <Icon name="search" size={15} color={ThemeColors.mutedForeground} />
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
                  <Icon name="close-circle" size={16} color={ThemeColors.mutedForeground} />
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
                    onPress={() => setFilter(f.key)}
                    className={`px-3 py-1.5 rounded-full border ${active ? "bg-primary border-primary" : "bg-card border-border"}`}
                  >
                    <Text className={`text-xs font-medium ${active ? "text-primary-foreground font-semibold" : "text-muted-foreground"}`}>
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Select All Toggle Header */}
            <View className="flex-row items-center justify-between pt-1">
              <Pressable onPress={toggleSelectAll} className="flex-row items-center gap-1.5 py-1">
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
          <View className="py-12 items-center justify-center">
            <Icon name="checkmark-circle" size={44} color={StatusColors.success} />
            <Text className="text-foreground font-semibold text-base mt-2">No large files found</Text>
            <Text className="text-muted-foreground text-xs mt-1">Try selecting a different filter above</Text>
          </View>
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
  const { selectedFileIds, toggleFile, selectAllFiles, deselectAllFiles } = useAppStore();
  const selectedBytes = useSelectedBytes();
  const [selectedSubtype, setSelectedSubtype] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modalItem, setModalItem] = useState<StorageItem | null>(null);
  const [files, setFiles] = useState<StorageItem[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadData = useCallback(() => {
    const res = StorageIndexService.getItems({
      source: "whatsapp",
      whatsappType: selectedSubtype !== "all" ? (selectedSubtype as any) : undefined,
      search: debouncedSearch.trim() || undefined,
      sortBy: "size_desc",
      limit: 100,
    });
    setFiles(res.items);
    setTotalBytes(res.totalBytes);
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
  const allCurrentSelected = files.length > 0 && files.every((f) => selectedFileIds.has(f.id));

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
          onToggle={() => toggleFile(item.id)}
          onPress={() => setModalItem(item)}
        />
      </View>
    ),
    [selectedFileIds, toggleFile]
  );

  return (
    <View className="flex-1">
      <FlashList
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
                  <Text className="text-white font-bold text-base">WhatsApp media</Text>
                  <Text className="text-white/80 text-xs">{formatCount(files.length)} files found</Text>
                </View>
                <Text className="text-white text-2xl font-bold">{formatSizeCompact(totalBytes)}</Text>
              </View>
            </Pressable>

            {/* Real-time search */}
            <View className="flex-row items-center bg-card rounded-xl px-3 py-2 mb-2 border border-border">
              <Icon name="search" size={15} color={ThemeColors.mutedForeground} />
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
                  <Icon name="close-circle" size={16} color={ThemeColors.mutedForeground} />
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
                      active ? "bg-primary border-primary" : "bg-card border-border"
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        active ? "text-primary-foreground font-semibold" : "text-muted-foreground"
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
              <Pressable onPress={toggleSelectAll} className="flex-row items-center gap-1.5 py-1">
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
          <View className="py-12 items-center justify-center">
            <Icon name="logo-whatsapp" size={44} color={CategoryColors.whatsapp} />
            <Text className="text-foreground font-semibold text-base mt-2">No WhatsApp files found</Text>
            <Text className="text-muted-foreground text-xs mt-1">
              WhatsApp images, voice notes and videos will appear here
            </Text>
          </View>
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
  const { scanResult } = useAppStore();
  const [sort, setSort] = useState<"size" | "unused">("size");

  const apps = useMemo(() => {
    const list = scanResult?.apps ?? [];
    return [...list].sort((a, b) =>
      sort === "size" ? b.sizeBytes - a.sizeBytes : a.lastUsedAt - b.lastUsedAt,
    );
  }, [scanResult?.apps, sort]);

  const [currentTimestamp] = useState(() => Date.now());
  const totalSize = useMemo(() => apps.reduce((s, a) => s + a.sizeBytes, 0), [apps]);
  const unusedApps = useMemo(
    () => apps.filter((a) => currentTimestamp - a.lastUsedAt > 90 * 86400000),
    [apps, currentTimestamp],
  );
  const unusedBytes = useMemo(() => unusedApps.reduce((s, a) => s + a.sizeBytes, 0), [unusedApps]);
  const totalCacheBytes = useMemo(() => apps.reduce((s, a) => s + a.cacheBytes, 0), [apps]);

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
      <FlashList
        data={apps}
        keyExtractor={(item) => item.packageName}
        renderItem={renderAppRow}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <View className="px-4 pb-2">
            <Card className="mb-3">
              <View className="flex-row items-center justify-between mb-3">
                <View>
                  <Text className="text-muted-foreground text-xs">Installed apps</Text>
                  <Text className="text-foreground text-2xl font-bold">{apps.length}</Text>
                  <Text className="text-muted-foreground text-xs">using {formatSizeCompact(totalSize)}</Text>
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
                  <Text className="text-warning-foreground text-xs">Unused (90d+)</Text>
                  <Text className="text-foreground font-bold mt-0.5">{unusedApps.length} apps</Text>
                  <Text className="text-muted-foreground text-xs">{formatSizeCompact(unusedBytes)}</Text>
                </View>
                <View className="flex-1 bg-muted rounded-lg p-2.5">
                  <Text className="text-muted-foreground text-xs">Cache</Text>
                  <Text className="text-foreground font-bold mt-0.5">
                    {formatSizeCompact(totalCacheBytes)}
                  </Text>
                  <Text className="text-muted-foreground text-xs">reclaimable</Text>
                </View>
              </View>
            </Card>

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
            <Icon name="information-circle-outline" size={13} color={ThemeColors.mutedForeground} />
            <Text className="text-xs text-muted-foreground">
              Uninstalling opens Android's system package uninstaller flow.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View className="py-12 items-center justify-center">
            <Icon name="apps" size={44} color={CategoryColors.apps} />
            <Text className="text-foreground font-semibold text-base mt-2">No apps scanned</Text>
            <Text className="text-muted-foreground text-xs mt-1">Run a scan to manage installed apps</Text>
          </View>
        }
      />
    </View>
  );
}

/* ─── Shared rows ──────────────────────────────────────────────────────── */

function FileRow({
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
  const color = CategoryColors[file.category as CategoryKey] ?? CategoryColors.other;
  const iconName = (CategoryIcons[file.category as CategoryKey] ?? "document") as IconName;

  const isVisual =
    file.canPreview ||
    file.mimeType?.startsWith("image/") ||
    file.mimeType?.startsWith("video/") ||
    /\.(jpe?g|png|webp|gif|bmp|heic|mp4|mov|mkv|3gp)$/i.test(file.name || file.uri);

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
            transition={150}
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
        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
          {formatSizeCompact(file.sizeBytes)} · {formatRelativeTime(file.modifiedAt)}
          {file.path ? ` · ${file.path.replace(/^\/storage\/emulated\/0\/?/, "")}` : ""}
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
}

function AppRow({ app, now }: { app: AppItem; now?: number }) {
  const referenceTime = now ?? app.lastUsedAt;
  const daysUnused = Math.floor((referenceTime - app.lastUsedAt) / 86400000);
  const isUnused = daysUnused > 90;

  return (
    <Card className="p-3">
      <View className="flex-row items-center gap-3">
        <View
          className="w-11 h-11 rounded-xl items-center justify-center"
          style={{ backgroundColor: `${CategoryColors.apps}20` }}
        >
          <Icon name={(app.iconUri as IconName) || "apps"} size={22} color={CategoryColors.apps} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
            {app.label}
          </Text>
          <Text className="text-muted-foreground text-xs mt-0.5">
            {formatSizeCompact(app.sizeBytes)}
            {isUnused ? ` · unused ${daysUnused}d` : ` · ${formatRelativeTime(app.lastUsedAt)}`}
          </Text>
          <View className="h-1 rounded-full bg-muted mt-1.5 overflow-hidden">
            <View
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (app.cacheBytes / app.sizeBytes) * 100)}%`,
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
          <Text className="text-destructive text-xs font-semibold">Uninstall</Text>
        </Pressable>
      </View>
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
        <Text className="text-primary font-bold">{formatSizeCompact(bytes)}</Text>
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
