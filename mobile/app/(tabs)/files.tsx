import { useState, useMemo } from "react";
import { View, Text, Pressable, ScrollView, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn, SlideInRight } from "react-native-reanimated";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon, CategoryIcons, type IconName } from "@/components/ui/Icon";
import { useAppStore, useSelectedBytes } from "@/stores/useAppStore";
import { CategoryColors } from "@/theme/colors";
import { formatSizeCompact, formatRelativeTime, formatCount } from "@/lib/format";
import { track } from "@/lib/analytics";
import type { CategoryKey, ScannedFile, AppItem } from "@/lib/types";

type Section = "large" | "whatsapp" | "apps";

const SECTIONS: { key: Section; label: string; icon: IconName; color: string }[] = [
  { key: "large", label: "Large Files", icon: "cube", color: CategoryColors.videos },
  { key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp", color: CategoryColors.whatsapp },
  { key: "apps", label: "App Manager", icon: "apps", color: CategoryColors.apps },
];

const SIZE_FILTERS = [
  { key: "all", label: "All", min: 0 },
  { key: "100mb", label: "> 100 MB", min: 100 * 1024 ** 2 },
  { key: "500mb", label: "> 500 MB", min: 500 * 1024 ** 2 },
  { key: "1gb", label: "> 1 GB", min: 1024 ** 3 },
] as const;

type SizeFilterKey = (typeof SIZE_FILTERS)[number]["key"];

export default function FilesScreen() {
  const [section, setSection] = useState<Section>("large");
  const insets = useSafeAreaInsets();

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
                  <Icon name={s.icon} size={15} color={active ? s.color : "rgb(var(--muted-foreground))"} />
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
  const { scanResult, selectedFileIds, toggleFile } = useAppStore();
  const selectedBytes = useSelectedBytes();
  const [filter, setFilter] = useState<SizeFilterKey>("100mb");

  const files = useMemo(() => {
    if (!scanResult) return [];
    const min = SIZE_FILTERS.find((f) => f.key === filter)?.min ?? 0;
    return scanResult.largeFiles
      .filter((f) => f.sizeBytes >= min)
      .sort((a, b) => b.sizeBytes - a.sizeBytes);
  }, [scanResult, filter]);

  const totalBytes = files.reduce((s, f) => s + f.sizeBytes, 0);
  const selectedCount = files.filter((f) => selectedFileIds.has(f.id)).length;

  if (!scanResult) return <NoScanState />;

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Summary + filters */}
        <View className="px-4">
          <Card className="mb-3">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-muted-foreground text-xs">Showing</Text>
                <Text className="text-foreground text-xl font-bold">
                  {formatSizeCompact(totalBytes)}
                </Text>
                <Text className="text-muted-foreground text-xs">{formatCount(files.length)} files</Text>
              </View>
              <View className="w-12 h-12 rounded-xl items-center justify-center" style={{ backgroundColor: `${CategoryColors.videos}20` }}>
                <Icon name="cube" size={24} color={CategoryColors.videos} />
              </View>
            </View>
          </Card>

          {/* Size filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
            <View className="flex-row gap-2">
              {SIZE_FILTERS.map((f) => {
                const active = f.key === filter;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    className={`px-3.5 py-1.5 rounded-full border ${active ? "bg-primary border-primary" : "bg-card border-border"}`}
                  >
                    <Text className={`text-xs font-medium ${active ? "text-primary-foreground" : "text-muted-foreground"}`}>
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* File list */}
        <View className="px-4 gap-2">
          {files.map((f, i) => (
            <FileRow key={f.id} file={f} selected={selectedFileIds.has(f.id)} onToggle={() => toggleFile(f.id)} delay={i * 30} />
          ))}
        </View>
      </ScrollView>

      {selectedCount > 0 && (
        <SelectionBar
          count={selectedCount}
          bytes={selectedBytes}
          insets={insets}
          onReview={() => router.push("/review")}
        />
      )}
    </View>
  );
}

/* ─── WhatsApp ─────────────────────────────────────────────────────────── */

function WhatsAppSection() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanResult, selectedFileIds, toggleFile } = useAppStore();
  const selectedBytes = useSelectedBytes();

  if (!scanResult) return <NoScanState />;

  const files = scanResult.whatsappFiles;
  const totalBytes = files.reduce((s, f) => s + f.sizeBytes, 0);

  // Group by source (WhatsApp Images / Video / Documents / Audio)
  const bySource = new Map<string, ScannedFile[]>();
  for (const f of files) {
    const arr = bySource.get(f.source ?? "Other") ?? [];
    arr.push(f);
    bySource.set(f.source ?? "Other", arr);
  }
  const sources = Array.from(bySource.entries()).sort((a, b) => {
    const sa = a[1].reduce((s, f) => s + f.sizeBytes, 0);
    const sb = b[1].reduce((s, f) => s + f.sizeBytes, 0);
    return sb - sa;
  });

  const selectedCount = files.filter((f) => selectedFileIds.has(f.id)).length;

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 110 }}>
        {/* WhatsApp summary card */}
        <View className="px-4 mb-3">
          <Pressable
            className="rounded-2xl p-4 active:opacity-95"
            style={{ backgroundColor: "#0b4f3c" }}
          >
            <View className="flex-row items-center gap-3">
              <View className="w-12 h-12 rounded-xl bg-white/15 items-center justify-center">
                <Icon name="logo-whatsapp" size={26} color="#25D366" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-base">WhatsApp is using</Text>
                <Text className="text-white/80 text-xs">{formatCount(files.length)} media files</Text>
              </View>
              <Text className="text-white text-2xl font-bold">{formatSizeCompact(totalBytes)}</Text>
            </View>
          </Pressable>
        </View>

        {/* By source */}
        <View className="px-4 gap-3">
          {sources.map(([source, sFiles], si) => {
            const sBytes = sFiles.reduce((s, f) => s + f.sizeBytes, 0);
            const kind = source.replace("WhatsApp ", "");
            const iconName = (kind === "Video" ? "videocam" : kind === "Audio" ? "musical-notes" : kind === "Documents" ? "document-text" : "images") as IconName;
            return (
              <Animated.View key={source} entering={FadeInDown.delay(si * 60).springify()}>
                <Card className="p-0 overflow-hidden">
                  <View className="flex-row items-center gap-3 p-3.5">
                    <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: `${CategoryColors.whatsapp}20` }}>
                      <Icon name={iconName} size={18} color={CategoryColors.whatsapp} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground font-semibold text-sm">{kind}</Text>
                      <Text className="text-muted-foreground text-xs">{formatCount(sFiles.length)} files · {formatSizeCompact(sBytes)}</Text>
                    </View>
                  </View>
                  {sFiles.slice(0, 5).map((f, i) => (
                    <FileRow
                      key={f.id}
                      file={f}
                      selected={selectedFileIds.has(f.id)}
                      onToggle={() => toggleFile(f.id)}
                      compact
                      delay={i * 20}
                    />
                  ))}
                  {sFiles.length > 5 && (
                    <Pressable
                      onPress={() => router.push(`/category/whatsapp`)}
                      className="px-4 py-3 border-t border-border active:bg-muted"
                    >
                      <Text className="text-primary text-xs font-medium">View all {sFiles.length}</Text>
                    </Pressable>
                  )}
                </Card>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      {selectedCount > 0 && (
        <SelectionBar
          count={selectedCount}
          bytes={selectedBytes}
          insets={insets}
          onReview={() => router.push("/review")}
        />
      )}
    </View>
  );
}

/* ─── App Manager ──────────────────────────────────────────────────────── */

function AppsSection() {
  const { scanResult } = useAppStore();
  const [sort, setSort] = useState<"size" | "unused">("size");

  if (!scanResult) return <NoScanState />;

  const apps = [...scanResult.apps].sort((a, b) =>
    sort === "size" ? b.sizeBytes - a.sizeBytes : a.lastUsedAt - b.lastUsedAt,
  );

  const totalSize = apps.reduce((s, a) => s + a.sizeBytes, 0);
  const unusedCount = apps.filter((a) => Date.now() - a.lastUsedAt > 90 * 86400000).length;
  const unusedBytes = apps
    .filter((a) => Date.now() - a.lastUsedAt > 90 * 86400000)
    .reduce((s, a) => s + a.sizeBytes, 0);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 110 }}>
      {/* Summary */}
      <View className="px-4 mb-3">
        <Card>
          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-muted-foreground text-xs">Installed apps</Text>
              <Text className="text-foreground text-2xl font-bold">{apps.length}</Text>
              <Text className="text-muted-foreground text-xs">using {formatSizeCompact(totalSize)}</Text>
            </View>
            <View className="w-12 h-12 rounded-xl items-center justify-center" style={{ backgroundColor: `${CategoryColors.apps}20` }}>
              <Icon name="apps" size={24} color={CategoryColors.apps} />
            </View>
          </View>
          <View className="flex-row gap-2 pt-3 border-t border-border">
            <View className="flex-1 bg-warning/10 rounded-lg p-2.5">
              <Text className="text-warning-foreground text-xs">Unused (90d+)</Text>
              <Text className="text-foreground font-bold mt-0.5">{unusedCount} apps</Text>
              <Text className="text-muted-foreground text-xs">{formatSizeCompact(unusedBytes)}</Text>
            </View>
            <View className="flex-1 bg-muted rounded-lg p-2.5">
              <Text className="text-muted-foreground text-xs">Cache</Text>
              <Text className="text-foreground font-bold mt-0.5">
                {formatSizeCompact(apps.reduce((s, a) => s + a.cacheBytes, 0))}
              </Text>
              <Text className="text-muted-foreground text-xs">reclaimable</Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Sort toggle */}
      <View className="px-4 mb-3 flex-row gap-2">
        {(["size", "unused"] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => setSort(s)}
            className={`flex-1 py-2 rounded-lg items-center ${sort === s ? "bg-primary" : "bg-muted"}`}
          >
            <Text className={`text-xs font-medium ${sort === s ? "text-primary-foreground" : "text-muted-foreground"}`}>
              {s === "size" ? "Largest" : "Least used"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* App list */}
      <View className="px-4 gap-2">
        {apps.map((a, i) => (
          <AppRow key={a.packageName} app={a} delay={i * 25} />
        ))}
      </View>

      <View className="px-4 mt-4 flex-row items-center gap-2">
        <Icon name="information-circle-outline" size={13} color="rgb(var(--muted-foreground))" />
        <Text className="text-xs text-muted-foreground">
          Uninstalling opens Android's system uninstall flow.
        </Text>
      </View>
    </ScrollView>
  );
}

/* ─── Shared rows ──────────────────────────────────────────────────────── */

function FileRow({
  file,
  selected,
  onToggle,
  compact = false,
  delay = 0,
}: {
  file: ScannedFile;
  selected: boolean;
  onToggle: () => void;
  compact?: boolean;
  delay?: number;
}) {
  const color = CategoryColors[file.category as CategoryKey] ?? CategoryColors.other;
  const iconName = (CategoryIcons[file.category] ?? "document") as IconName;
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()}>
      <Pressable
        onPress={onToggle}
        className={`flex-row items-center gap-3 ${compact ? "px-3.5 py-2 border-t border-border" : "p-3 rounded-xl border"} ${
          selected ? (compact ? "bg-primary/5" : "border-primary bg-primary/5") : compact ? "" : "border-border bg-card"
        } active:opacity-95`}
      >
        <View
          className={`${compact ? "w-9 h-9" : "w-11 h-11"} rounded-lg items-center justify-center`}
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon name={iconName} size={compact ? 16 : 20} color={color} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
            {file.name}
          </Text>
          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
            {formatSizeCompact(file.sizeBytes)} · {formatRelativeTime(file.modifiedAt)}
            {file.source ? ` · ${file.source}` : ""}
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
    </Animated.View>
  );
}

function AppRow({ app, delay }: { app: AppItem; delay: number }) {
  const daysUnused = Math.floor((Date.now() - app.lastUsedAt) / 86400000);
  const isUnused = daysUnused > 90;
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()}>
      <Card className="p-3">
        <View className="flex-row items-center gap-3">
          <View
            className="w-11 h-11 rounded-xl items-center justify-center"
            style={{ backgroundColor: `${CategoryColors.apps}20` }}
          >
            <Icon name={app.iconUri as IconName} size={22} color={CategoryColors.apps} />
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
                style={{ width: `${Math.min(100, (app.cacheBytes / app.sizeBytes) * 100)}%`, backgroundColor: CategoryColors.apps }}
              />
            </View>
          </View>
          <Pressable
            className="px-3 py-1.5 rounded-lg bg-destructive/10"
            onPress={() => {
              // In production: Linking.openURL(`package:${app.packageName}`) via ACTION_UNINSTALL
              track("app_uninstall_tapped", { package: app.packageName });
            }}
          >
            <Text className="text-destructive text-xs font-semibold">Uninstall</Text>
          </Pressable>
        </View>
      </Card>
    </Animated.View>
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
      <Button variant="primary" size="lg" fullWidth rightIcon={<Icon name="arrow-forward" size={18} color="#fff" />} onPress={onReview}>
        Review cleanup
      </Button>
    </View>
  );
}

function NoScanState() {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-20 h-20 rounded-full bg-accent items-center justify-center mb-4">
        <Icon name="folder-open" size={36} color="rgb(var(--primary))" />
      </View>
      <Text className="text-foreground font-semibold text-lg">No files yet</Text>
      <Text className="text-muted-foreground text-sm text-center mt-1">
        Run a scan to populate this section with large files, WhatsApp media, and your installed apps.
      </Text>
      <Button variant="primary" size="md" className="mt-5" onPress={() => router.push("/scan-progress")}>
        Scan now
      </Button>
    </View>
  );
}
