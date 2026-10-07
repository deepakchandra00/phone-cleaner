import { KEYS, storage } from "@/lib/storage";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { ThemeColors } from "@/theme/colors";

export default function Index() {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void storage.waitForHydration().then(() => {
      if (active)
        setTarget(
          storage.getBoolean(KEYS.onboardingComplete)
            ? "/(tabs)/home"
            : "/onboarding",
        );
    });
    return () => {
      active = false;
    };
  }, []);
  if (!target)
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={ThemeColors.primary} />
      </View>
    );
  return <Redirect href={target as any} />;
}
