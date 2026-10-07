export type PhotoHashes = { sha256: string | null; dhash: string | null };
type PhotoTarget = { path?: string; uri?: string };
type HashRow = PhotoHashes & { path: string };

// A partial cache or batch result must not prevent retrying a missing hash.
export async function recoverPhotoHashes(
  files: PhotoTarget[],
  cached: Map<string, PhotoHashes>,
  hashBatch: (paths: string[]) => Promise<HashRow[]>,
): Promise<Map<string, PhotoHashes>> {
  const results = new Map<string, PhotoHashes>();
  const pending: PhotoTarget[] = [];
  for (const file of files) {
    const key = file.path || file.uri;
    if (!key) continue;
    const value = cached.get(key) ?? { sha256: null, dhash: null };
    results.set(key, value);
    if (!value.sha256 || !value.dhash) pending.push(file);
  }
  const merge = (key: string, row: PhotoHashes) => {
    const previous = results.get(key)!;
    results.set(key, {
      sha256: row.sha256 || previous.sha256,
      dhash: row.dhash || previous.dhash,
    });
  };
  if (pending.length) {
    const rows = await hashBatch(pending.map((f) => (f.path || f.uri)!));
    for (const row of rows) if (results.has(row.path)) merge(row.path, row);
    const retries = pending.filter((f) => {
      const value = results.get((f.path || f.uri)!)!;
      return (!value.sha256 || !value.dhash) && f.uri && f.uri !== f.path;
    });
    if (retries.length) {
      const retryRows = new Map(
        (await hashBatch(retries.map((f) => f.uri!))).map((row) => [
          row.path,
          row,
        ]),
      );
      for (const file of retries) {
        const row = retryRows.get(file.uri!);
        if (row) merge((file.path || file.uri)!, row);
      }
    }
  }
  return results;
}

// Hashes, rather than estimated dimensions or sizes, decide exact matches.
export function groupExactPhotoHashes<T extends PhotoTarget>(
  files: T[],
  hashes: Map<string, PhotoHashes>,
): T[][] {
  const groups = new Map<string, T[]>();
  for (const file of files) {
    const hash =
      (file.path ? hashes.get(file.path)?.sha256 : null) ??
      (file.uri ? hashes.get(file.uri)?.sha256 : null) ??
      hashes.get(file.path || file.uri || "")?.sha256;
    if (!hash) continue;
    const group = groups.get(hash) ?? [];
    group.push(file);
    groups.set(hash, group);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}
