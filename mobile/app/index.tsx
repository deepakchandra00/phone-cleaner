import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useState, useEffect } from "react";
import { storage, KEYS } from "@/lib/storage";
import { ThemeColors } from "@/theme/colors";

export default function Index() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    try {
      const onboardingComplete = storage.getBoolean(KEYS.onboardingComplete);
      setTarget(onboardingComplete ? "/(tabs)/home" : "/onboarding");
    } catch {
      setTarget("/onboarding");
    }
  }, []);

  if (!target) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={ThemeColors.primary} />
      </View>
    );
  }

  return <Redirect href={target as any} />;
}
