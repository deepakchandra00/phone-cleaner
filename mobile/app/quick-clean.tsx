import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { formatSizeCompact } from "@/lib/format";
import { useAppStore } from "@/stores/useAppStore";
import { ThemeColors } from "@/theme/colors";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShallow } from "zustand/react/shallow";

export default function QuickCleanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    scanResult,
    selectedFileIds,
    selectedGroupIds,
    toggleFile,
    toggleGroup,
    selectAllFiles,
    deselectAllFiles,
  } = useAppStore(
    useShallow((s) => ({
      scanResult: s.scanResult,
      selectedFileIds: s.selectedFileIds,
      selectedGroupIds: s.selectedGroupIds,
      toggleFile: s.toggleFile,
      toggleGroup: s.toggleGroup,
      selectAllFiles: s.selectAllFiles,
      deselectAllFiles: s.deselectAllFiles,
    })),
  );

  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    trash: true,
  });

  const selectedBytes = useAppStore((s) => s.selectedBytes);
  const toggleExpand = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Safe unneeded files
  const visibleCaches = useMemo(() => {
    return (scanResult?.junkFiles ?? []).filter(
      (f) =>
        !f.source?.includes("Trash") &&
        !f.source?.includes("Thumbnail") &&
        !f.name.endsWith(".apk") &&
        (f as any).junkType !== "empty_folder" &&
        f.source !== "Empty Folder",
    );
  }, [scanResult]);

  const installedApks = useMemo(() => {
    return scanResult?.obsoleteApks ?? [];
  }, [scanResult]);

  const emptyFolders = useMemo(() => {
    return (scanResult?.junkFiles ?? []).filter(
      (f) =>
        f.source === "Empty Folder" || (f as any).junkType === "empty_folder",
    );
  }, [scanResult]);

  const thumbnails = useMemo(() => {
    return (scanResult?.junkFiles ?? []).filter(
      (f) =>
        f.source?.includes("Thumbnail") || (f as any).junkType === "thumbnail",
    );
  }, [scanResult]);

  const browserData = useMemo(() => {
    return (scanResult?.junkFiles ?? []).filter(
      (f) => f.source?.includes("Browser") || (f as any).junkType === "browser",
    );
  }, [scanResult]);

  // Files to review
  const trashedMedia = useMemo(() => {
    return (scanResult?.junkFiles ?? []).filter(
      (f) => f.source?.includes("Trash") || f.name.startsWith(".trashed-"),
    );
  }, [scanResult]);

  const duplicateGroups = useMemo(() => {
    return scanResult?.duplicateGroups ?? [];
  }, [scanResult]);

  const largeVideos = useMemo(() => {
    return (scanResult?.allVideos ?? []).filter(
      (v) => v.sizeBytes >= 20 * 1024 * 1024,
    );
  }, [scanResult]);

  // Category selection helpers
  const isCategoryAllSelected = (files: { id: string }[]) => {
    if (files.length === 0) return false;
    return files.every((f) => selectedFileIds.has(f.id));
  };

  const toggleCategorySelection = (
    files: { id: string; sizeBytes: number }[],
  ) => {
    if (isCategoryAllSelected(files)) {
      deselectAllFiles(files.map((f) => f.id));
    } else {
      selectAllFiles(files);
    }
  };

  const selectedCount = selectedFileIds.size;
  const handleFinishCleaning = () => {
    if (selectedCount > 0) router.push("/review");
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Quick Clean"
        showBack
        rightIcon="settings-outline"
        onRightPress={() => router.push("/(tabs)/settings")}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Section: UNNEEDED FILES */}
        <Text className="text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider mt-2 mb-2">
          Unneeded files
        </Text>

        {/* Visible Caches (Default: Checked) */}
        <CleanCategoryCard
          title="Visible caches"
          subtitle={`${visibleCaches.length} items`}
          selectedBytes={visibleCaches.reduce((s, f) => s + f.sizeBytes, 0)}
          checked={isCategoryAllSelected(visibleCaches)}
          onToggleCheck={() => toggleCategorySelection(visibleCaches)}
          expanded={Boolean(expandedSections.visible_caches)}
          onToggleExpand={() => toggleExpand("visible_caches")}
        >
          {visibleCaches.slice(0, 15).map((f) => (
            <FileRow
              key={f.id}
              name={f.name}
              size={f.sizeBytes}
              selected={selectedFileIds.has(f.id)}
              onToggle={() => toggleFile(f.id, f.sizeBytes)}
              icon="document-text"
            />
          ))}
        </CleanCategoryCard>

        {/* Installed APKs (Default: Checked) */}
        <CleanCategoryCard
          title="Installed APKs"
          subtitle={`${installedApks.length} items`}
          selectedBytes={installedApks.reduce((s, f) => s + f.sizeBytes, 0)}
          checked={isCategoryAllSelected(installedApks)}
          onToggleCheck={() => toggleCategorySelection(installedApks)}
          expanded={Boolean(expandedSections.apks)}
          onToggleExpand={() => toggleExpand("apks")}
        >
          {installedApks.map((f) => (
            <FileRow
              key={f.id}
              name={f.name}
              size={f.sizeBytes}
              selected={selectedFileIds.has(f.id)}
              onToggle={() => toggleFile(f.id, f.sizeBytes)}
              icon="cube"
              iconBadge="APK"
            />
          ))}
        </CleanCategoryCard>

        {/* Empty Folders (Default: Checked) */}
        <CleanCategoryCard
          title="Empty folders"
          subtitle={`${emptyFolders.length} items`}
          selectedBytes={emptyFolders.reduce((s, f) => s + f.sizeBytes, 0)}
          checked={isCategoryAllSelected(emptyFolders)}
          onToggleCheck={() => toggleCategorySelection(emptyFolders)}
          expanded={Boolean(expandedSections.empty_folders)}
          onToggleExpand={() => toggleExpand("empty_folders")}
        >
          {emptyFolders.slice(0, 15).map((f) => (
            <FileRow
              key={f.id}
              name={f.name}
              size={f.sizeBytes}
              selected={selectedFileIds.has(f.id)}
              onToggle={() => toggleFile(f.id, f.sizeBytes)}
              icon="folder"
            />
          ))}
        </CleanCategoryCard>

        {/* Thumbnails */}
        {thumbnails.length > 0 && (
          <CleanCategoryCard
            title="Thumbnails"
            subtitle={`${thumbnails.length} items`}
            selectedBytes={thumbnails.reduce((s, f) => s + f.sizeBytes, 0)}
            checked={isCategoryAllSelected(thumbnails)}
            onToggleCheck={() => toggleCategorySelection(thumbnails)}
            expanded={Boolean(expandedSections.thumbnails)}
            onToggleExpand={() => toggleExpand("thumbnails")}
          >
            {thumbnails.slice(0, 15).map((f) => (
              <FileRow
                key={f.id}
                name={f.name}
                size={f.sizeBytes}
                selected={selectedFileIds.has(f.id)}
                onToggle={() => toggleFile(f.id, f.sizeBytes)}
                icon="images"
              />
            ))}
          </CleanCategoryCard>
        )}

        {/* Browser Data */}
        {browserData.length > 0 && (
          <CleanCategoryCard
            title="Browser data"
            subtitle={`${browserData.length} items`}
            selectedBytes={browserData.reduce((s, f) => s + f.sizeBytes, 0)}
            checked={isCategoryAllSelected(browserData)}
            onToggleCheck={() => toggleCategorySelection(browserData)}
            expanded={Boolean(expandedSections.browser)}
            onToggleExpand={() => toggleExpand("browser")}
          >
            {browserData.slice(0, 10).map((f) => (
              <FileRow
                key={f.id}
                name={f.name}
                size={f.sizeBytes}
                selected={selectedFileIds.has(f.id)}
                onToggle={() => toggleFile(f.id, f.sizeBytes)}
                icon="globe"
              />
            ))}
          </CleanCategoryCard>
        )}

        {/* Section: FILES TO REVIEW */}
        <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider mt-6 mb-2">
          Files to review
        </Text>

        {/* Trash / Trashed Media (.trashed-* files) */}
        {trashedMedia.length > 0 && (
          <CleanCategoryCard
            title="Trash"
            subtitle={`${trashedMedia.length} items`}
            selectedBytes={trashedMedia.reduce((s, f) => s + f.sizeBytes, 0)}
            checked={isCategoryAllSelected(trashedMedia)}
            onToggleCheck={() => toggleCategorySelection(trashedMedia)}
            expanded={Boolean(expandedSections.trash)}
            onToggleExpand={() => toggleExpand("trash")}
          >
            {trashedMedia.slice(0, 25).map((f) => (
              <FileRow
                key={f.id}
                name={f.name}
                size={f.sizeBytes}
                selected={selectedFileIds.has(f.id)}
                onToggle={() => toggleFile(f.id, f.sizeBytes)}
                previewUri={f.path || f.uri}
                icon="trash"
              />
            ))}
          </CleanCategoryCard>
        )}

        {/* Duplicate Photos (With informative callout) */}
        <CleanCategoryCard
          title="Duplicate photos"
          subtitle={`${duplicateGroups.length} groups detected`}
          selectedBytes={duplicateGroups.reduce(
            (s, g) => s + g.recoverableBytes,
            0,
          )}
          checked={
            duplicateGroups.length > 0 &&
            duplicateGroups.every((g) => selectedGroupIds.has(g.id))
          }
          onToggleCheck={() => {
            for (const g of duplicateGroups) toggleGroup(g.id);
          }}
          expanded={Boolean(expandedSections.duplicates)}
          onToggleExpand={() => toggleExpand("duplicates")}
        >
          <View className="bg-primary/10 rounded-xl p-3 mb-2 flex-row items-center gap-2">
            <Icon
              name="information-circle"
              size={18}
              color={ThemeColors.primary}
            />
            <Text className="text-primary text-xs flex-1">
              Deep pixel scan compares photos across your gallery (takes ~10–15s
              extra). Your best photo is always safely kept.
            </Text>
          </View>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => router.push("/(tabs)/photos")}
            rightIcon={<Icon name="arrow-forward" size={14} color="#0f172a" />}
          >
            Review duplicate photos in Gallery
          </Button>
        </CleanCategoryCard>

        {/* Large Videos */}
        {largeVideos.length > 0 && (
          <CleanCategoryCard
            title="Large videos"
            subtitle={`${largeVideos.length} videos > 20 MB`}
            selectedBytes={largeVideos.reduce((s, v) => s + v.sizeBytes, 0)}
            checked={isCategoryAllSelected(largeVideos)}
            onToggleCheck={() => toggleCategorySelection(largeVideos)}
            expanded={Boolean(expandedSections.videos)}
            onToggleExpand={() => toggleExpand("videos")}
          >
            {largeVideos.slice(0, 10).map((v) => (
              <FileRow
                key={v.id}
                name={v.name}
                size={v.sizeBytes}
                selected={selectedFileIds.has(v.id)}
                onToggle={() => toggleFile(v.id, v.sizeBytes)}
                previewUri={v.uri}
                icon="videocam"
              />
            ))}
          </CleanCategoryCard>
        )}
      </ScrollView>

      {/* Sticky Bottom Bar */}
      <View
        className="absolute left-0 right-0 bottom-0 bg-card border-t border-border px-5 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom + 10, 24) }}
      >
        <Text className="text-primary font-bold text-xs uppercase tracking-wider mb-2">
          {selectedCount} selected · {formatSizeCompact(selectedBytes)}
        </Text>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={selectedCount === 0}
          onPress={handleFinishCleaning}
        >
          Review selected files
        </Button>
      </View>
    </View>
  );
}

function CleanCategoryCard({
  title,
  subtitle,
  selectedBytes,
  checked,
  onToggleCheck,
  expanded,
  onToggleExpand,
  children,
}: {
  title: string;
  subtitle: string;
  selectedBytes: number;
  checked: boolean;
  onToggleCheck: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View className="bg-card rounded-2xl border border-border overflow-hidden mb-3">
      <View className="flex-row items-center p-4">
        {/* Checkbox */}
        <Pressable
          onPress={onToggleCheck}
          hitSlop={8}
          className={`w-6 h-6 rounded-md items-center justify-center mr-3 border ${
            checked
              ? "bg-primary border-primary"
              : "border-muted-foreground/40 bg-transparent"
          }`}
        >
          {checked && <Icon name="checkmark" size={16} color="#fff" />}
        </Pressable>

        {/* Title and subtitle */}
        <Pressable onPress={onToggleExpand} className="flex-1">
          <Text className="text-foreground font-bold text-base">{title}</Text>
          <Text className="text-muted-foreground text-xs mt-0.5">
            {formatSizeCompact(selectedBytes)} · {subtitle}
          </Text>
        </Pressable>

        {/* Expand / Collapse arrow */}
        <Pressable onPress={onToggleExpand} hitSlop={12} className="p-1">
          <Icon
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={ThemeColors.mutedForeground}
          />
        </Pressable>
      </View>

      {/* Expanded items */}
      {expanded && children && (
        <View className="border-t border-border/60 bg-muted/20 px-4 py-3">
          {children}
        </View>
      )}
    </View>
  );
}

function FileRow({
  name,
  size,
  selected,
  onToggle,
  previewUri,
  icon,
  iconBadge,
}: {
  name: string;
  size: number;
  selected: boolean;
  onToggle: () => void;
  previewUri?: string;
  icon?: string;
  iconBadge?: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      className="flex-row items-center py-2.5 border-b border-border/40 last:border-b-0"
    >
      {/* Thumbnail or Icon */}
      {previewUri ? (
        <Image
          source={{ uri: previewUri }}
          style={{ width: 40, height: 40, borderRadius: 8 }}
          contentFit="cover"
        />
      ) : (
        <View className="w-10 h-10 rounded-lg bg-accent items-center justify-center">
          {iconBadge ? (
            <Text className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
              {iconBadge}
            </Text>
          ) : (
            <Icon
              name={(icon as any) || "document"}
              size={20}
              color={ThemeColors.primary}
            />
          )}
        </View>
      )}

      {/* Name and size */}
      <View className="flex-1 ml-3 mr-2">
        <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
          {name}
        </Text>
        <Text className="text-muted-foreground text-xs mt-0.5">
          {formatSizeCompact(size)}
        </Text>
      </View>

      {/* Checkbox */}
      <View
        className={`w-5 h-5 rounded items-center justify-center border ${
          selected
            ? "bg-primary border-primary"
            : "border-muted-foreground/40 bg-transparent"
        }`}
      >
        {selected && <Icon name="checkmark" size={13} color="#fff" />}
      </View>
    </Pressable>
  );
}
