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
  other: "#94a3b8", // slate-400
} as const;

export type CategoryKey = keyof typeof CategoryColors;

export const StatusColors = {
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#14b8a6",
} as const;
