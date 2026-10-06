import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useState, useEffect } from "react";
import { storage, KEYS } from "@/lib/storage";
import { ThemeColors } from "@/theme/colors";

export default function Index() {
  const [target] = useState<string>(() => {
    try {
      const onboardingComplete = storage.getBoolean(KEYS.onboardingComplete);
      return onboardingComplete ? "/(tabs)/home" : "/onboarding";
    } catch {
      return "/onboarding";
    }
  });

  return <Redirect href={target as any} />;
}
