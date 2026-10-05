import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";
import { cn } from "@/lib/utils";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  rightIcon?: IconName;
  onRightPress?: () => void;
  showBack?: boolean;
  centered?: boolean;
}

export function ScreenHeader({ title, subtitle, rightIcon, onRightPress, showBack, centered }: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View
      className="px-4 pb-3 pt-2 flex-row items-center"
      style={{ paddingTop: insets.top > 0 ? 4 : 8 }}
    >
      {showBack && (
        <Pressable
          onPress={() => router.back()}
          className="mr-3 w-9 h-9 items-center justify-center rounded-full bg-muted"
          hitSlop={12}
        >
          <Icon name="chevron-back" size={22} />
        </Pressable>
      )}
      <View className={cn("flex-1", centered && "items-center")}>
        <Text className="text-2xl font-bold text-foreground">{title}</Text>
        {subtitle && <Text className="text-sm text-muted-foreground mt-0.5">{subtitle}</Text>}
      </View>
      {rightIcon && (
        <Pressable
          onPress={onRightPress}
          className="w-9 h-9 items-center justify-center rounded-full bg-muted"
          hitSlop={12}
        >
          <Icon name={rightIcon} size={20} />
        </Pressable>
      )}
    </View>
  );
}
