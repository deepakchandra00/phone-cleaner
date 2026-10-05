import { Redirect } from "expo-router";
import { storage, KEYS } from "@/lib/storage";

export default function Index() {
  const onboardingComplete = storage.getBoolean(KEYS.onboardingComplete);
  if (!onboardingComplete) {
    return <Redirect href="/onboarding" />;
  }
  return <Redirect href="/(tabs)/home" />;
}
