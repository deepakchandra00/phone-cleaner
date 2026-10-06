import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { StorageRing, CategoryBar } from "@/components/ui/StorageRing";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon, CategoryIcons } from "@/components/ui/Icon";
import { useAppStore, useAutoCleanableBytes } from "@/stores/useAppStore";
import { usePremiumStore } from "@/stores/usePremiumStore";
import { LinearGradient } from "expo-linear-gradient";
import { CategoryColors, ThemeColors } from "@/theme/colors";
import { formatSizeCompact, formatHeadlineSize, bytesToGB } from "@/lib/format";
import { track } from "@/lib/analytics";
import type { CategoryKey } from "@/lib/types";
import { AndroidStorage } from "android-storage";

import { PreScanSheet, type PreScanOptions } from "@/components/scan/PreScanSheet";

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { storage, scanResult, loadStorage } = useAppStore();
  const autoCleanableBytes = useAutoCleanableBytes();
  const isPro = usePremiumStore((s) => s.isPro);
  const showPaywall = usePremiumStore((s) => s.showPaywall);
  const [refreshing, setRefreshing] = useState(false);
  const [memory, setMemory] = useState(() => AndroidStorage.getMemoryInfo());
  const [boosting, setBoosting] = useState(false);
  const [preScanVisible, setPreScanVisible] = useState(false);

  const onBoostRam = useCallback(async () => {
    setBoosting(true);
    try {
      const res = await AndroidStorage.boostRam();
      const updated = AndroidStorage.getMemoryInfo();
      setMemory(updated);
      Alert.alert(
        "Phone Boosted! ⚡",
        `Freed ${formatSizeCompact(res.freedBytes)} RAM and closed ${res.killedCount} background processes to optimize performance.`,
        [{ text: "Great" }],
      );
    } catch (err) {
      console.warn("Boost error:", err);
    } finally {
      setBoosting(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) {
        await loadStorage();
        setMemory(AndroidStorage.getMemoryInfo());
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [loadStorage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStorage();
    setMemory(AndroidStorage.getMemoryInfo());
    setRefreshing(false);
  }, [loadStorage]);

  if (!storage) {
    return <View className="flex-1 bg-background" />;
  }

  const cleanableGB = bytesToGB(storage.cleanableBytes);
  const ringSegments = storage.categories
    .filter((c) => c.key !== "junk")
    .map((c) => ({
      key: c.key as CategoryKey,
      bytes: c.bytes,
      color: CategoryColors[c.key as CategoryKey] ?? CategoryColors.other,
    }));

  const onScan = () => {
    setPreScanVisible(true);
  };

  const handleStartScan = (options: PreScanOptions) => {
    setPreScanVisible(false);
    useAppStore.getState().prepareScan();
    router.push({
      pathname: "/scan-progress",
      params: { includeDuplicates: String(options.includeDuplicates) },
    });
  };

  const onCategoryPress = (key: string) => {
    track("category_viewed", { category: key });
    if (key === "duplicates") {
      router.push("/(tabs)/photos");
    } else if (key === "apps") {
      router.push("/(tabs)/files");
    } else {
      router.push(`/category/${key}`);
    }
  };

  const featuredCategories = storage.categories.filter((c) =>
    ["duplicates", "junk", "downloads", "whatsapp"].includes(c.key) || c.cleanableBytes > 0.5 * 1024 ** 3,
  ).slice(0, 4);

  return (
    <>
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ paddingBottom: 100, paddingTop: insets.top > 0 ? insets.top : 12 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ThemeColors.primary} />
        }
      >
      {/* Greeting */}
      <Animated.View entering={FadeIn} className="px-4 pt-2 pb-1">
        <Text className="text-sm text-muted-foreground">
          {greeting()} 👋
        </Text>
      </Animated.View>

      {/* Hero card: storage ring + cleanable headline */}
      <Animated.View entering={FadeInDown.delay(60).springify()} className="px-4 mt-2">
        <Card className="p-5 items-center">
          <StorageRing
            totalBytes={storage.totalBytes}
            usedBytes={storage.usedBytes}
            segments={ringSegments}
            cleanableBytes={storage.cleanableBytes}
            size={236}
          />

          <View className="mt-5 w-full">
            {storage.cleanableBytes > 0 ? (
              <View className="items-center">
                <Text className="text-3xl font-bold text-primary">
                  {formatHeadlineSize(storage.cleanableBytes).value}{" "}
                  <Text className="text-xl font-semibold">
                    {formatHeadlineSize(storage.cleanableBytes).unit}
                  </Text>
                </Text>
                <Text className="text-sm text-muted-foreground mt-0.5">can be cleaned</Text>
              </View>
            ) : (
              <View className="items-center">
                <Text className="text-2xl font-bold text-success">All clean!</Text>
                <Text className="text-sm text-muted-foreground mt-0.5">Your phone is tidy</Text>
              </View>
            )}
          </View>

          <Button
            variant={scanResult ? "secondary" : "primary"}
            size="lg"
            fullWidth
            className="mt-5"
            leftIcon={<Icon name="sparkles" size={20} color="#fff" />}
            onPress={onScan}
          >
            {scanResult ? "Re-scan My Phone" : "Scan Now"}
          </Button>
        </Card>
      </Animated.View>

      {/* RAM Booster Card */}
      <Animated.View entering={FadeInDown.delay(90).springify()} className="px-4 mt-3">
        <Card className="p-4">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2.5">
              <View className="w-10 h-10 rounded-xl bg-blue-500/10 items-center justify-center">
                <Icon name="speedometer" size={20} color="#3b82f6" />
              </View>
              <View>
                <Text className="text-foreground font-bold text-base">RAM Memory</Text>
                <Text className="text-muted-foreground text-xs">
                  {memory.usedPercent}% used · {formatSizeCompact(memory.availMemBytes)} free
                </Text>
              </View>
            </View>
            <Button
              variant="primary"
              size="sm"
              loading={boosting}
              onPress={onBoostRam}
              leftIcon={<Icon name="flash" size={14} color="#fff" />}
            >
              Boost RAM
            </Button>
          </View>
          <View className="h-2 bg-muted rounded-full overflow-hidden">
            <View
              className="h-full rounded-full"
              style={{
                width: `${Math.min(Math.max(memory.usedPercent, 5), 100)}%`,
                backgroundColor: memory.usedPercent > 80 ? "#ef4444" : "#3b82f6",
              }}
            />
          </View>
        </Card>
      </Animated.View>

      {/* One-tap smart clean CTA */}
      {scanResult && autoCleanableBytes > 0 && (
        <Animated.View entering={FadeInDown.delay(120).springify()} className="px-4 mt-4 mb-1">
          <Pressable
            onPress={() => {
              const count = useAppStore.getState().selectSmartCleanable();
              if (count > 0) {
                router.push("/review");
              } else {
                router.push("/(tabs)/scan");
              }
            }}
            className="rounded-2xl active:opacity-95 overflow-hidden"
            style={{
              shadowColor: "#10b981",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 16,
              elevation: 6,
            }}
          >
            <LinearGradient
              colors={["#10b981", "#0d9488"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="p-5 border border-emerald-400/20 rounded-2xl"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4">
                  <View className="flex-row items-center gap-2 mb-1.5">
                    <Icon name="flash" size={20} color="#fff" />
                    <Text className="text-white font-bold text-lg">Smart Clean</Text>
                  </View>
                  <Text className="text-white/90 text-sm leading-5">
                    Free up {formatSizeCompact(autoCleanableBytes)} safely in one tap
                  </Text>
                </View>
                <View className="bg-white/20 rounded-full w-12 h-12 items-center justify-center border border-white/20 shadow-sm">
                  <Icon name="arrow-forward" size={20} color="#fff" />
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}

      {/* Category quick actions */}
      <Animated.View entering={FadeInDown.delay(180).springify()} className="px-4 mt-5">
        <Text className="text-base font-semibold text-foreground mb-2">What's using space</Text>
        <View className="flex-row flex-wrap gap-3">
          {featuredCategories.map((c) => {
            const color = CategoryColors[c.key as CategoryKey] ?? CategoryColors.other;
            const iconName = CategoryIcons[c.key] ?? "cube";
            return (
              <Pressable
                key={c.key}
                onPress={() => onCategoryPress(c.key)}
                className="flex-1 min-w-[44%] bg-card rounded-2xl border border-border p-4 active:opacity-95"
              >
                <View className="flex-row items-center justify-between">
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <Icon name={iconName as any} size={20} color={color} />
                  </View>
                  {c.cleanableBytes > 0 && (
                    <View
                      className="px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${color}20` }}
                    >
                      <Text className="text-xs font-semibold" style={{ color }}>
                        {formatSizeCompact(c.cleanableBytes)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="text-foreground font-semibold mt-2.5">{c.label}</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  {formatSizeCompact(c.bytes)} · {c.fileCount.toLocaleString()} files
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {/* Storage breakdown bars */}
      <Animated.View entering={FadeInDown.delay(240).springify()} className="px-4 mt-5">
        <Card>
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-base font-semibold text-foreground">Storage breakdown</Text>
            <Text className="text-xs text-muted-foreground">{bytesToGB(storage.totalBytes)} GB total</Text>
          </View>
          {storage.categories.map((c) => (
            <CategoryBar
              key={c.key}
              category={c.key as CategoryKey}
              label={c.label}
              bytes={c.bytes}
              totalBytes={storage.totalBytes}
              rightLabel={formatSizeCompact(c.bytes)}
            />
          ))}
        </Card>
      </Animated.View>

      {/* Trust banner */}
      <Animated.View entering={FadeInDown.delay(300).springify()} className="px-4 mt-4">
        <View className="flex-row items-center gap-2 px-1">
          <Icon name="shield-checkmark" size={14} color={ThemeColors.mutedForeground} />
          <Text className="text-xs text-muted-foreground">
            No login · On-device scanning · Your files stay private
          </Text>
        </View>
      </Animated.View>

      {/* Pro upsell (only for free users) */}
      {!isPro && (
        <Animated.View entering={FadeInDown.delay(360).springify()} className="px-4 mt-4">
          <Pressable
            onPress={() => {
              track("premium_view", { source: "home_banner" });
              showPaywall();
              router.push("/premium");
            }}
            className="bg-card border border-primary/30 rounded-2xl p-4 active:opacity-95"
          >
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
                <Icon name="diamond" size={20} color={ThemeColors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-foreground font-semibold">Upgrade to Pro</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  Similar photos, scheduled scans, no ads
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={ThemeColors.mutedForeground} />
            </View>
          </Pressable>
        </Animated.View>
      )}
      </ScrollView>
      <PreScanSheet
        visible={preScanVisible}
        onClose={() => setPreScanVisible(false)}
        onStartScan={handleStartScan}
      />
    </>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
