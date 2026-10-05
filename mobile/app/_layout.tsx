import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useColorScheme } from "react-native";
import "../global.css";

import { useAppStore } from "@/stores/useAppStore";
import { usePremiumStore } from "@/stores/usePremiumStore";
import { initRevenueCat } from "@/lib/revenuecat";
import { initAds } from "@/lib/ads";
import { track } from "@/lib/analytics";

import * as SplashScreen from "expo-splash-screen";
import { View, Text } from "react-native";
import { Button } from "@/components/ui/Button";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000 } },
});

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={{ color: "#fff", fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>Phone Cleaner</Text>
      <Text style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", marginBottom: 24 }}>
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
        await Promise.allSettled([loadStorage(), loadCached()]);
      } finally {
        await SplashScreen.hideAsync().catch(() => {});
      }
    })();
    initRevenueCat().catch(() => {});
    initAds().catch(() => {});
    track("app_open");
  }, [loadStorage, loadCached]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
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
            <Stack.Screen name="premium" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
            <Stack.Screen name="scan-progress" options={{ animation: "fade" }} />
            <Stack.Screen name="review" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
            <Stack.Screen name="success" options={{ animation: "fade" }} />
            <Stack.Screen name="category/[key]" />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
