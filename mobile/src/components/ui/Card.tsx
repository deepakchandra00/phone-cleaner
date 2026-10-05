import { type ReactNode } from "react";
import { Pressable, View, Text } from "react-native";
import { cn } from "@/lib/utils";

interface CardProps {
  children: ReactNode;
  className?: string;
  onPress?: () => void;
  activeOpacity?: number;
}

export function Card({ children, className, onPress }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className={cn("bg-card rounded-2xl border border-border p-4 active:opacity-95", className)}
      >
        {children}
      </Pressable>
    );
  }
  return <View className={cn("bg-card rounded-2xl border border-border p-4", className)}>{children}</View>;
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn("mb-3", className)}>{children}</View>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <Text className={cn("text-lg font-bold text-foreground", className)}>{children}</Text>;
}

export function CardDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <Text className={cn("text-sm text-muted-foreground mt-1", className)}>{children}</Text>;
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn("", className)}>{children}</View>;
}
