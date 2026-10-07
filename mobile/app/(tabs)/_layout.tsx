import { BottomNav } from "@/components/ui/BottomNav";
import { Stack, useSegments } from "expo-router";
import { View } from "react-native";

const TAB_KEYS: Record<string, string> = {
  home: "home",
  photos: "photos",
  scan: "scan",
  files: "files",
  settings: "settings",
};

export default function TabsLayout() {
  const segments = useSegments();
  const last = segments[segments.length - 1] as string | undefined;
  const activeKey = (last && TAB_KEYS[last]) ?? "home";

  return (
    <View className="flex-1 bg-background">
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      >
        <Stack.Screen name="home" />
        <Stack.Screen name="photos" />
        <Stack.Screen name="scan" />
        <Stack.Screen name="files" />
        <Stack.Screen name="settings" />
      </Stack>
      <BottomNav activeKey={activeKey} />
    </View>
  );
}
