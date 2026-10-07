import { useState } from "react";
import { View, Text, Pressable, ScrollView, Linking } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { usePremiumStore } from "@/stores/usePremiumStore";
import {
  PLANS,
  PRO_FEATURES,
  purchase,
  restorePurchases,
} from "@/lib/revenuecat";
import { track } from "@/lib/analytics";
import { ThemeColors } from "@/theme/colors";

type Plan = "yearly" | "monthly";

export default function Premium() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setEntitlement } = usePremiumStore();
  const [selected, setSelected] = useState<Plan>("yearly");
  const [loading, setLoading] = useState<"purchase" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async () => {
    setError(null);
    setLoading("purchase");
    try {
      const ent = await purchase(selected);
      if (ent.isActive) {
        setEntitlement(ent);
        track("premium_purchase", { plan: selected });
        router.replace("/success?mode=purchase");
      } else {
        setError("Purchase couldn't be completed. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const handleRestore = async () => {
    setError(null);
    setLoading("restore");
    try {
      const ent = await restorePurchases();
      if (ent.isActive) {
        setEntitlement(ent);
        track("premium_restore", { result: "restored" });
        router.replace("/success?mode=purchase");
      } else {
        setError("No previous purchases found on this account.");
      }
    } catch {
      setError("Restore failed. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <View className="flex-1 bg-background">
      {/* Close */}
      <Pressable
        onPress={() => router.back()}
        className="absolute top-12 right-4 z-10 w-9 h-9 rounded-full bg-muted items-center justify-center"
        style={{ top: insets.top + 8 }}
        hitSlop={12}
      >
        <Icon name="close" size={20} color={ThemeColors.foreground} />
      </Pressable>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {/* Hero */}
        <Animated.View
          entering={FadeIn.springify()}
          className="items-center px-6 mb-6"
        >
          <View
            className="w-20 h-20 rounded-3xl items-center justify-center mb-4"
            style={{ backgroundColor: "rgba(5,150,105,0.12)" }}
          >
            <Icon name="diamond" size={40} color={ThemeColors.primary} />
          </View>
          <Text className="text-foreground text-3xl font-bold text-center">
            SmartCare Pro
          </Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            Unlock the full power of the cleaner. One subscription, every
            feature.
          </Text>
        </Animated.View>

        {/* Feature list */}
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          className="px-6 mb-6"
        >
          {PRO_FEATURES.map((f, i) => (
            <View
              key={f.title}
              className={`flex-row items-center gap-3 py-3 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
                <Icon
                  name={f.icon as IconName}
                  size={18}
                  color={ThemeColors.primary}
                />
              </View>
              <View className="flex-1">
                <Text className="text-foreground font-semibold text-sm">
                  {f.title}
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  {f.desc}
                </Text>
              </View>
              <Icon
                name="checkmark-circle"
                size={18}
                color={ThemeColors.primary}
              />
            </View>
          ))}
        </Animated.View>

        {/* Plan selector */}
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          className="px-6 mb-4 gap-3"
        >
          {/* Yearly */}
          <Pressable
            onPress={() => setSelected("yearly")}
            className={`relative rounded-2xl p-4 border-2 ${selected === "yearly" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
          >
            <View className="absolute -top-2.5 left-4 bg-primary px-2 py-0.5 rounded-full">
              <Text className="text-primary-foreground text-[10px] font-bold">
                BEST VALUE · SAVE 58%
              </Text>
            </View>
            <View className="flex-row items-center justify-between mt-1">
              <View>
                <Text className="text-foreground font-bold text-base">
                  Yearly
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {PLANS.yearly.pricePerMonth}/mo · billed annually
                </Text>
              </View>
              <View className="flex-row items-center gap-3">
                <Text className="text-foreground text-xl font-bold">
                  {PLANS.yearly.price}
                </Text>
                <View
                  className={`w-6 h-6 rounded-full border-2 items-center justify-center ${selected === "yearly" ? "bg-primary border-primary" : "border-muted-foreground/30"}`}
                >
                  {selected === "yearly" && (
                    <Icon name="checkmark" size={14} color="#fff" />
                  )}
                </View>
              </View>
            </View>
          </Pressable>

          {/* Monthly */}
          <Pressable
            onPress={() => setSelected("monthly")}
            className={`rounded-2xl p-4 border-2 ${selected === "monthly" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
          >
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-foreground font-bold text-base">
                  Monthly
                </Text>
                <Text className="text-muted-foreground text-xs">
                  Cancel anytime
                </Text>
              </View>
              <View className="flex-row items-center gap-3">
                <Text className="text-foreground text-xl font-bold">
                  {PLANS.monthly.price}
                </Text>
                <View
                  className={`w-6 h-6 rounded-full border-2 items-center justify-center ${selected === "monthly" ? "bg-primary border-primary" : "border-muted-foreground/30"}`}
                >
                  {selected === "monthly" && (
                    <Icon name="checkmark" size={14} color="#fff" />
                  )}
                </View>
              </View>
            </View>
          </Pressable>
        </Animated.View>

        {error && (
          <View className="px-6 mb-3">
            <View className="bg-destructive/10 border border-destructive/30 rounded-xl p-3">
              <Text className="text-destructive text-xs">{error}</Text>
            </View>
          </View>
        )}

        {/* Actions */}
        <View className="px-6 gap-2">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={loading === "purchase"}
            onPress={handlePurchase}
            rightIcon={<Icon name="arrow-forward" size={20} color="#fff" />}
          >
            Continue with {selected === "yearly" ? "Yearly" : "Monthly"}
          </Button>
          <Button
            variant="ghost"
            size="md"
            fullWidth
            loading={loading === "restore"}
            onPress={handleRestore}
          >
            Restore purchases
          </Button>
        </View>

        {/* Legal */}
        <View className="px-6 mt-5">
          <Text className="text-muted-foreground text-[11px] text-center leading-4">
            Payment is charged to your Google Play account. Subscription
            auto-renews unless cancelled at least 24 hours before the end of the
            current period. Manage in Play Store settings.
          </Text>
          <View className="flex-row justify-center gap-4 mt-3">
            <Pressable
              onPress={() => {
                const url =
                  Constants.expoConfig?.extra?.termsUrl ||
                  "https://fieseros.com/phone-cleaner/terms";
                if (url) void Linking.openURL(url).catch(() => {});
              }}
            >
              <Text className="text-primary text-xs">Terms of Service</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const url =
                  Constants.expoConfig?.extra?.privacyPolicyUrl ||
                  "https://fieseros.com/phone-cleaner/privacy";
                if (url) void Linking.openURL(url).catch(() => {});
              }}
            >
              <Text className="text-primary text-xs">Privacy Policy</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
