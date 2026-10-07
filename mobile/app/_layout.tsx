import { NotificationObserver } from "@/components/NotificationObserver";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";
import { unregisterLegacyRamTask } from "@/lib/backgroundTasks";

import { initAds } from "@/lib/ads";
import { track } from "@/lib/analytics";
import { initRevenueCat } from "@/lib/revenuecat";
import { useAppStore } from "@/stores/useAppStore";
import { usePremiumStore } from "@/stores/usePremiumStore";

import { Button } from "@/components/ui/Button";
import * as SplashScreen from "expo-splash-screen";
import { Text, View } from "react-native";

// Disable Reanimated strict mode to prevent false positive reading/writing warnings on layout animations
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000 } },
});

export function ErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0F172A",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Text
        style={{
          color: "#fff",
          fontSize: 20,
          fontWeight: "bold",
          marginBottom: 12,
        }}
      >
        SmartCare
      </Text>
      <Text
        style={{
          color: "#94a3b8",
          fontSize: 14,
          textAlign: "center",
          marginBottom: 24,
        }}
      >
        {error?.message || "An error occurred while loading the app."}
      </Text>
      <Button variant="primary" size="md" onPress={retry}>
        Try Again
      </Button>
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const loadStorage = useAppStore((s) => s.loadStorage);
  const loadCached = usePremiumStore((s) => s.loadCached);

  useEffect(() => {
    (async () => {
      try {
        void loadStorage();
        await loadCached();
      } finally {
        await SplashScreen.hideAsync().catch(() => {});
      }
    })();
    void unregisterLegacyRamTask().catch(() => {});
    initRevenueCat().catch(() => {});
    initAds().catch(() => {});
    track("app_open");
  }, [loadStorage, loadCached]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
          <NotificationObserver />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: colorScheme === "dark" ? "#020617" : "#f8fafc",
              },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="premium"
              options={{
                presentation: "modal",
                animation: "slide_from_bottom",
              }}
            />
            <Stack.Screen
              name="scan-progress"
              options={{ animation: "fade" }}
            />
            <Stack.Screen name="quick-clean" />
            <Stack.Screen
              name="review"
              options={{
                presentation: "modal",
                animation: "slide_from_bottom",
              }}
            />
            <Stack.Screen name="success" options={{ animation: "fade" }} />
            <Stack.Screen name="category/[key]" />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
