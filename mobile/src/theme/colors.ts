/**
 * Centralised colour palette for charts and category accents.
 * Avoids indigo/blue. "Clean" semantic = emerald/teal with warm accents.
 */

export const CategoryColors = {
  photos: "#10b981", // emerald-500
  videos: "#14b8a6", // teal-500
  apps: "#f59e0b", // amber-500
  audio: "#ec4899", // pink-500
  documents: "#8b5cf6", // violet — used sparingly for docs only
  downloads: "#ef4444", // red-500
  junk: "#64748b", // slate-500
  duplicates: "#f97316", // orange-500
  whatsapp: "#22c55e", // green-500 (brand-adjacent)
  apks: "#e11d48", // rose-600
  other: "#94a3b8", // slate-400
} as const;

export type CategoryKey = keyof typeof CategoryColors;

export const StatusColors = {
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#14b8a6",
} as const;

export const ThemeColors = {
  primary: "#15803d",
  primaryDark: "#166534",
  background: "#f7fcf8",
  backgroundDark: "#061b11",
  card: "#ffffff",
  cardDark: "#0c291b",
  foreground: "#123524",
  foregroundDark: "#f0fdf4",
  muted: "#e8f5ec",
  mutedDark: "#163c29",
  mutedForeground: "#4b6656",
  mutedForegroundDark: "#b0ccba",
  border: "#d4e7d9",
  borderDark: "#275138",
  destructive: "#dc2626",
  warning: "#f59e0b",
  accent: "#dcfce7",
} as const;
