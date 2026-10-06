import { useRef, useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, Dimensions, AppState } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PagerView from "react-native-pager-view";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { storage, KEYS } from "@/lib/storage";
import { track } from "@/lib/analytics";
import { usePermissions, type PermissionStatus } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CategoryColors, ThemeColors } from "@/theme/colors";

const { width } = Dimensions.get("window");

interface Slide {
  icon: IconName;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  bullets?: { icon: IconName; text: string }[];
}

const SLIDES: Slide[] = [
  {
    icon: "sparkles",
    iconBg: `${CategoryColors.photos}20`,
    iconColor: CategoryColors.photos,
    title: "Free up space\nin seconds",
    description:
      "Phone Cleaner finds what's eating your storage — large files, duplicates, junk — so you can free up gigabytes with one tap.",
    bullets: [
      { icon: "flash", text: "Scan in seconds, not minutes" },
      { icon: "cube", text: "See exactly what's using space" },
      { icon: "checkmark-done", text: "Review before anything is deleted" },
    ],
  },
  {
    icon: "shield-checkmark",
    iconBg: `${CategoryColors.downloads}20`,
    iconColor: CategoryColors.downloads,
    title: "Private by design",
    description:
      "Your files never leave your phone. No login, no cloud upload, no tracking your photos. All scanning happens on-device.",
    bullets: [
      { icon: "lock-closed", text: "No account required" },
      { icon: "phone-portrait", text: "On-device scanning" },
      { icon: "eye-off", text: "We never see your files" },
    ],
  },
  {
    icon: "images",
    iconBg: `${CategoryColors.duplicates}20`,
    iconColor: CategoryColors.duplicates,
    title: "Photos access",
    description:
      "To find duplicate photos, similar selfies, and large videos, we need read access to your media. We only read metadata — your photos stay on your device.",
    bullets: [
      { icon: "copy", text: "Find exact & similar duplicates" },
      { icon: "videocam", text: "Surface the biggest videos" },
      { icon: "trash", text: "You choose what to delete" },
    ],
  },
];

export default function Onboarding() {
  const pagerRef = useRef<PagerView>(null);
  const [page, setPage] = useState(0);
  const [mediaStatus, setMediaStatus] = useState<PermissionStatus>("undetermined");
  const [requesting, setRequesting] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    requestMedia,
    openSystemSettings,
    checkStorageManager,
    requestStorageManager,
    checkUsageAccess,
    requestUsageAccess,
  } = usePermissions();

  const [hasAllFiles, setHasAllFiles] = useState(checkStorageManager());
  const [hasUsage, setHasUsage] = useState(checkUsageAccess());

  const refreshPerms = useCallback(() => {
    setHasAllFiles(checkStorageManager());
    setHasUsage(checkUsageAccess());
  }, [checkStorageManager, checkUsageAccess]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshPerms();
      }
    });
    return () => sub.remove();
  }, [refreshPerms]);

  const finish = () => {
    storage.set(KEYS.onboardingComplete, true);
    track("onboarding_complete");
    router.replace("/(tabs)/home");
  };

  const handlePrimary = async () => {
    if (page < SLIDES.length - 1) {
      pagerRef.current?.setPage(page + 1);
      return;
    }
    // Last slide — finish setup
    setRequesting(true);
    if (mediaStatus !== "granted") {
      const status = await requestMedia();
      setMediaStatus(status);
    }
    setRequesting(false);
    finish();
  };

  const isLast = page === SLIDES.length - 1;
  const slide = SLIDES[page];

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Skip button */}
      {!isLast && (
        <Pressable
          onPress={finish}
          className="absolute top-3 right-4 z-10 px-3 py-1.5"
          hitSlop={12}
        >
          <Text className="text-muted-foreground text-sm font-medium">Skip</Text>
        </Pressable>
      )}

      <PagerView
        ref={pagerRef}
        initialPage={0}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
        style={{ flex: 1 }}
        offscreenPageLimit={2}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={{ width }} className="flex-1 px-6">
            <View className="flex-1 justify-center">
              {/* Icon */}
              <Animated.View
                entering={FadeIn.delay(100).springify()}
                className="self-center w-24 h-24 rounded-3xl items-center justify-center mb-8"
                style={{ backgroundColor: s.iconBg }}
              >
                <Icon name={s.icon} size={48} color={s.iconColor} />
              </Animated.View>

              {/* Title */}
              <Animated.Text
                entering={FadeInDown.delay(200).springify()}
                className="text-foreground text-3xl font-bold text-center leading-tight"
              >
                {i === 2 ? "Give us access\nto clean your phone" : s.title}
              </Animated.Text>

              {/* Description */}
              <Animated.Text
                entering={FadeInDown.delay(300).springify()}
                className="text-muted-foreground text-base text-center mt-4 leading-6"
              >
                {i === 2
                  ? "To find and safely delete junk, WhatsApp media, and duplicate photos, grant the permissions below."
                  : s.description}
              </Animated.Text>

              {/* Bullets or Permission Cards */}
              {i === 2 ? (
                <Animated.View entering={FadeInDown.delay(400).springify()} className="mt-6 gap-3">
                  {/* All Files Access */}
                  <View className="bg-card border border-border rounded-2xl p-4 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-3 flex-1 mr-2">
                      <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
                        <Icon name="folder-open" size={20} color={ThemeColors.primary} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-foreground font-semibold text-sm">All files access</Text>
                        <Text className="text-muted-foreground text-xs">Clean junk, WhatsApp, APKs</Text>
                      </View>
                    </View>
                    {hasAllFiles ? (
                      <View className="bg-success/15 px-3 py-1.5 rounded-full flex-row items-center gap-1">
                        <Icon name="checkmark" size={14} color="#16a34a" />
                        <Text className="text-success text-xs font-semibold">Allowed</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => requestStorageManager()}
                        className="bg-primary px-3 py-1.5 rounded-full active:opacity-90"
                      >
                        <Text className="text-white text-xs font-semibold">Enable</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Usage Access */}
                  <View className="bg-card border border-border rounded-2xl p-4 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-3 flex-1 mr-2">
                      <View className="w-10 h-10 rounded-xl bg-accent items-center justify-center">
                        <Icon name="speedometer" size={20} color={ThemeColors.primary} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-foreground font-semibold text-sm">Usage access</Text>
                        <Text className="text-muted-foreground text-xs">Clean app caches & boost RAM</Text>
                      </View>
                    </View>
                    {hasUsage ? (
                      <View className="bg-success/15 px-3 py-1.5 rounded-full flex-row items-center gap-1">
                        <Icon name="checkmark" size={14} color="#16a34a" />
                        <Text className="text-success text-xs font-semibold">Allowed</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => requestUsageAccess()}
                        className="bg-primary px-3 py-1.5 rounded-full active:opacity-90"
                      >
                        <Text className="text-white text-xs font-semibold">Enable</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Media Access */}
                  <View className="bg-card border border-border rounded-2xl p-4 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-3 flex-1 mr-2">
                      <View className="w-10 h-10 rounded-xl bg-accent items-center justify-center">
                        <Icon name="images" size={20} color={ThemeColors.primary} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-foreground font-semibold text-sm">Photos & Media</Text>
                        <Text className="text-muted-foreground text-xs">Find duplicate & similar photos</Text>
                      </View>
                    </View>
                    {mediaStatus === "granted" ? (
                      <View className="bg-success/15 px-3 py-1.5 rounded-full flex-row items-center gap-1">
                        <Icon name="checkmark" size={14} color="#16a34a" />
                        <Text className="text-success text-xs font-semibold">Allowed</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={async () => {
                          const s = await requestMedia();
                          setMediaStatus(s);
                        }}
                        className="bg-primary px-3 py-1.5 rounded-full active:opacity-90"
                      >
                        <Text className="text-white text-xs font-semibold">Allow</Text>
                      </Pressable>
                    )}
                  </View>
                </Animated.View>
              ) : (
                s.bullets && (
                  <Animated.View entering={FadeInDown.delay(400).springify()} className="mt-8 gap-3">
                    {s.bullets.map((b, bi) => (
                      <View key={bi} className="flex-row items-center gap-3 bg-card border border-border rounded-xl p-3.5">
                        <View className="w-9 h-9 rounded-lg bg-accent items-center justify-center">
                          <Icon name={b.icon} size={18} color={ThemeColors.primary} />
                        </View>
                        <Text className="text-foreground text-sm font-medium flex-1">{b.text}</Text>
                      </View>
                    ))}
                  </Animated.View>
                )
              )}

              {/* Permission denied / blocked messaging on last slide */}
              {i === SLIDES.length - 1 && mediaStatus === "blocked" && (
                <View className="mt-6 bg-warning/10 border border-warning/30 rounded-xl p-4">
                  <Text className="text-warning-foreground font-semibold text-sm">
                    Photos access was blocked
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-1">
                    You can still use the app, but photo features won't work until you enable access in Settings.
                  </Text>
                  <Pressable onPress={openSystemSettings} className="mt-3 flex-row items-center gap-1">
                    <Icon name="open-outline" size={14} color={ThemeColors.primary} />
                    <Text className="text-primary text-sm font-semibold">Open Settings</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        ))}
      </PagerView>

      {/* Bottom controls */}
      <View style={{ paddingBottom: Math.max(insets.bottom, 24) }} className="px-6 pt-4">
        {/* Page indicators */}
        <View className="flex-row justify-center gap-2 mb-6">
          {SLIDES.map((_, i) => (
            <View
              key={i}
              className="h-2 rounded-full transition-all"
              style={{
                width: i === page ? 24 : 8,
                backgroundColor: i === page ? ThemeColors.primary : ThemeColors.muted,
              }}
            />
          ))}
        </View>

        <Button
          variant={isLast ? "primary" : "secondary"}
          size="lg"
          fullWidth
          loading={requesting}
          onPress={handlePrimary}
          rightIcon={<Icon name={isLast ? "checkmark" : "arrow-forward"} size={20} color="#fff" />}
        >
          {isLast
            ? mediaStatus === "blocked"
              ? "Continue without photos"
              : "Allow & Start"
            : "Continue"}
        </Button>

        {isLast && mediaStatus === "undetermined" && (
          <Pressable onPress={finish} className="mt-3 self-center">
            <Text className="text-muted-foreground text-sm">Maybe later</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
