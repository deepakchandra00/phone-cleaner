/**
 * Human-friendly byte formatting. All internal sizes are bytes (number).
 * Format depends on magnitude: KB / MB / GB / TB.
 */

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    units.length - 1,
  );
  const value = bytes / Math.pow(k, i);
  const dm = i === 0 ? 0 : decimals;
  return `${value.toFixed(dm)} ${units[i]}`;
}

/** Compact form for tight UI: "8.7 GB", "1.2 GB" — always 1 decimal above KB. */
export function formatSizeCompact(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    units.length - 1,
  );
  if (i === 0) return `${bytes} B`;
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i >= 2 ? 1 : 0)} ${units[i]}`;
}

/** Round GB to one decimal for headline numbers. */
export function bytesToGB(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

/**
 * Splits size into value and unit for headline displays.
 * Automatically chooses appropriate unit (GB, MB, KB) so sizes like 3.5 MB
 * never get truncated to "0.0 GB".
 */
export function formatHeadlineSize(bytes: number): { value: string; unit: string } {
  if (bytes <= 0) return { value: "0", unit: "MB" };
  const GB = 1024 ** 3;
  const MB = 1024 ** 2;
  const KB = 1024;

  if (bytes >= GB) {
    return { value: (bytes / GB).toFixed(1), unit: "GB" };
  }
  if (bytes >= MB) {
    return { value: (bytes / MB).toFixed(1), unit: "MB" };
  }
  if (bytes >= KB) {
    return { value: (bytes / KB).toFixed(0), unit: "KB" };
  }
  return { value: String(bytes), unit: "B" };
}

export function gbToBytes(gb: number): number {
  return Math.round(gb * 1024 ** 3);
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "just now";
  if (diff < hour) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString();
}
