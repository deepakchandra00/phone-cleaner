import { Pressable, type PressableProps, Text, View, ActivityIndicator } from "react-native";
import { type ReactNode, isValidElement } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "success";
type Size = "sm" | "md" | "lg" | "xl";

interface ButtonProps extends Omit<PressableProps, "children"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
  className?: string;
  fullWidth?: boolean;
}

const variants: Record<Variant, string> = {
  primary: "bg-primary active:bg-primary/90",
  secondary: "bg-secondary active:bg-secondary/80",
  outline: "border border-border bg-transparent active:bg-muted",
  ghost: "bg-transparent active:bg-muted",
  destructive: "bg-destructive active:bg-destructive/90",
  success: "bg-success active:bg-success/90",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 rounded-lg",
  md: "h-11 px-4 rounded-xl",
  lg: "h-14 px-6 rounded-2xl",
  xl: "h-16 px-8 rounded-2xl",
};

const textSizes: Record<Size, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  children,
  className,
  fullWidth = false,
  disabled,
  ...props
}: ButtonProps) {
  const isPrimary = variant === "primary" || variant === "destructive" || variant === "success";

  const renderChildren = () => {
    if (children == null || typeof children === "boolean") return null;
    if (isValidElement(children)) {
      return children;
    }
    return (
      <Text
        className={cn(
          "font-semibold",
          textSizes[size],
          isPrimary ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {children}
      </Text>
    );
  };

  return (
    <Pressable
      disabled={disabled || loading}
      className={cn(
        "flex-row items-center justify-center gap-2",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        disabled && "opacity-50",
        className,
      )}
      style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#fff" : "#0f172a"} size="small" />
      ) : (
        <>
          {leftIcon}
          {renderChildren()}
          {rightIcon}
        </>
      )}
    </Pressable>
  );
}
