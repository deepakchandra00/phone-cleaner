import { Ionicons } from "@expo/vector-icons";
import { type ComponentProps } from "react";

export type IconName = ComponentProps<typeof Ionicons>["name"];

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
}

export function Icon({ name, size = 24, color = "rgb(var(--foreground))" }: IconProps) {
  return <Ionicons name={name} size={size} color={color} />;
}

/** Category → icon mapping used across screens. */
export const CategoryIcons: Record<string, IconName> = {
  photos: "images",
  videos: "videocam",
  apps: "apps",
  audio: "musical-notes",
  documents: "document-text",
  downloads: "cloud-download",
  junk: "trash",
  duplicates: "copy",
  whatsapp: "logo-whatsapp",
  other: "cube",
};
