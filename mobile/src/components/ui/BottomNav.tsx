import { cn } from "@/lib/utils";
import { ThemeColors } from "@/theme/colors";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";

interface TabItem {
  key: string;
  label: string;
  icon: IconName;
  activeIcon: IconName;
  route: string;
}

const TABS: TabItem[] = [
  {
    key: "home",
    label: "Home",
    icon: "home-outline",
    activeIcon: "home",
    route: "/(tabs)/home",
  },
  {
    key: "photos",
    label: "Photos",
    icon: "images-outline",
    activeIcon: "images",
    route: "/(tabs)/photos",
  },
  {
    key: "scan",
    label: "Scan",
    icon: "scan-outline",
    activeIcon: "scan",
    route: "/(tabs)/scan",
  },
  {
    key: "files",
    label: "Files",
    icon: "folder-open-outline",
    activeIcon: "folder-open",
    route: "/(tabs)/files",
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings-outline",
    activeIcon: "settings",
    route: "/(tabs)/settings",
  },
];

interface BottomNavProps {
  activeKey: string;
}

export function BottomNav({ activeKey }: BottomNavProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      className="absolute bottom-0 left-0 right-0 bg-card border-t border-border"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      <View className="flex-row items-stretch px-2 pt-2">
        {TABS.map((tab) => {
          const isActive = tab.key === activeKey;
          const isScan = tab.key === "scan";
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
              onPress={() => {
                if (!isActive) router.replace(tab.route as any);
              }}
              className="flex-1 items-center justify-center py-1.5"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              {isScan ? (
                <View
                  className={cn(
                    "w-12 h-12 rounded-full items-center justify-center -mt-4 shadow-lg",
                    isActive ? "bg-primary" : "bg-primary/90",
                  )}
                  style={{ elevation: 6 }}
                >
                  <Icon
                    name={isActive ? tab.activeIcon : tab.icon}
                    size={26}
                    color="#fff"
                  />
                </View>
              ) : (
                <Icon
                  name={isActive ? tab.activeIcon : tab.icon}
                  size={24}
                  color={
                    isActive ? ThemeColors.primary : ThemeColors.mutedForeground
                  }
                />
              )}
              <Text
                className={cn(
                  "text-[10px] mt-1 font-medium",
                  isActive ? "text-primary" : "text-muted-foreground",
                  isScan && "mt-0.5",
                )}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
