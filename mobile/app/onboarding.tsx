import { useRef, useState } from "react";
import { View, Text, Pressable, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PagerView from "react-native-pager-view";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { storage, KEYS } from "@/lib/storage";
import { track } from "@/lib/analytics";
import { usePermissions, type PermissionStatus } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CategoryColors } from "@/theme/colors";

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
  const { requestMedia, openSystemSettings } = usePermissions();

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
    // Last slide — request media permission then finish.
    setRequesting(true);
    const status = await requestMedia();
    setMediaStatus(status);
    setRequesting(false);
    if (status === "granted" || status === "denied") {
      // Even if denied, let them in — they can grant later from the feature.
      finish();
    }
    // If blocked, show the open-settings CTA.
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
                {s.title}
              </Animated.Text>

              {/* Description */}
              <Animated.Text
                entering={FadeInDown.delay(300).springify()}
                className="text-muted-foreground text-base text-center mt-4 leading-6"
              >
                {s.description}
              </Animated.Text>

              {/* Bullets */}
              {s.bullets && (
                <Animated.View entering={FadeInDown.delay(400).springify()} className="mt-8 gap-3">
                  {s.bullets.map((b, bi) => (
                    <View key={bi} className="flex-row items-center gap-3 bg-card border border-border rounded-xl p-3.5">
                      <View className="w-9 h-9 rounded-lg bg-accent items-center justify-center">
                        <Icon name={b.icon} size={18} color="rgb(var(--primary))" />
                      </View>
                      <Text className="text-foreground text-sm font-medium flex-1">{b.text}</Text>
                    </View>
                  ))}
                </Animated.View>
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
                    <Icon name="open-outline" size={14} color="rgb(var(--primary))" />
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
                backgroundColor: i === page ? "rgb(var(--primary))" : "rgb(var(--muted))",
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
