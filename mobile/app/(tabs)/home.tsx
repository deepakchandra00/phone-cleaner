import { useEffect, useRef } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { StorageRing, CategoryBar } from "@/components/ui/StorageRing";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon, CategoryIcons } from "@/components/ui/Icon";
import { useAppStore } from "@/stores/useAppStore";
import { usePremiumStore } from "@/stores/usePremiumStore";
import { CategoryColors, ThemeColors } from "@/theme/colors";
import { formatSizeCompact, bytesToGB } from "@/lib/format";
import { track } from "@/lib/analytics";
import type { CategoryKey } from "@/lib/types";

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { storage, scanResult, loadStorage } = useAppStore();
  const isPro = usePremiumStore((s) => s.isPro);
  const showPaywall = usePremiumStore((s) => s.showPaywall);
  const refreshing = useRef(false);

  useEffect(() => {
    loadStorage();
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
    router.push("/scan-progress");
  };

  const onCategoryPress = (key: string) => {
    track("category_viewed", { category: key });
    router.push(`/category/${key}`);
  };

  const featuredCategories = storage.categories.filter((c) =>
    ["duplicates", "junk", "downloads", "whatsapp"].includes(c.key) || c.cleanableBytes > 0.5 * 1024 ** 3,
  ).slice(0, 4);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={
        <RefreshControl refreshing={refreshing.current} onRefresh={loadStorage} tintColor={ThemeColors.primary} />
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
                  {bytesToGB(storage.cleanableBytes).toFixed(1)} GB
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

      {/* One-tap smart clean CTA */}
      {scanResult && storage.cleanableBytes > 0 && (
        <Animated.View entering={FadeInDown.delay(120).springify()} className="px-4 mt-3">
          <Pressable
            onPress={() => router.push("/review")}
            className="bg-gradient-to-br from-primary to-teal-600 rounded-2xl p-4 active:opacity-95"
            style={{
              shadowColor: "#10b981",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.25,
              shadowRadius: 16,
              elevation: 6,
            }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-white font-bold text-lg">Smart Clean</Text>
                <Text className="text-white/80 text-sm mt-0.5">
                  Free up {formatSizeCompact(storage.cleanableBytes)} in one tap
                </Text>
              </View>
              <View className="bg-white/20 rounded-full w-12 h-12 items-center justify-center">
                <Icon name="arrow-forward" size={22} color="#fff" />
              </View>
            </View>
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
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
