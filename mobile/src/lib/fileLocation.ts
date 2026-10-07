export function containingFolder(
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  let clean = path;
  if (path.startsWith("file://")) {
    try {
      clean = decodeURIComponent(path.slice(7));
    } catch {
      return null;
    }
  }
  if (!clean.startsWith("/") || clean.endsWith("/")) return null;
  const slash = clean.lastIndexOf("/");
  return slash === 0 ? "/" : clean.slice(0, slash);
}
