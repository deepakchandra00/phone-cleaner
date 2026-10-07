export function fileIdentity(item: {
  id: string;
  path?: string;
  uri?: string;
}): string {
  const raw = item.path || item.uri;
  if (!raw) return item.id;
  if (raw.startsWith("file://")) {
    try {
      return decodeURIComponent(raw.slice(7));
    } catch {
      return raw;
    }
  }
  return raw;
}
export function uniqueFiles<
  T extends { id: string; path?: string; uri?: string },
>(items: T[]): T[] {
  return [...new Map(items.map((item) => [fileIdentity(item), item])).values()];
}
