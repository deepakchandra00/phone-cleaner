import { isSafeToCleanAutomatically } from "./safety.ts";
import type { DuplicateGroup, ScanResult, ScannedFile } from "./types";

export function smartCleanCandidates(result: ScanResult | null): ScannedFile[] {
  if (!result) return [];
  return [
    ...new Map(
      result.junkFiles.filter(isSafeToCleanAutomatically).map((f) => [f.id, f]),
    ).values(),
  ];
}

export function selectedGroups(
  groups: DuplicateGroup[],
  ids: Set<string>,
): Set<string> {
  return new Set(
    groups
      .filter((g) =>
        g.files.filter((f) => f.id !== g.keepId).every((f) => ids.has(f.id)),
      )
      .map((g) => g.id),
  );
}

/** Reconcile only acknowledged deletions, including partial duplicate groups. */
export function reconcileDeleted(
  result: ScanResult | null,
  deleted: Set<string>,
  deletedItems: { id: string; sizeBytes: number; category: string }[] = [],
): ScanResult | null {
  if (!result) return null;
  const remaining = (files: ScannedFile[]) =>
    files.filter((f) => !deleted.has(f.id));
  const duplicateGroups = result.duplicateGroups.flatMap((g) => {
    const files = remaining(g.files);
    if (files.length < 2) return [];
    const keepId = files.some((f) => f.id === g.keepId)
      ? g.keepId
      : files[0].id;
    const totalBytes = files.reduce((s, f) => s + f.sizeBytes, 0);
    return [
      {
        ...g,
        files,
        keepId,
        totalBytes,
        recoverableBytes:
          totalBytes - files.find((f) => f.id === keepId)!.sizeBytes,
      },
    ];
  });
  const arrays = {
    allPhotos: remaining(result.allPhotos),
    allVideos: remaining(result.allVideos),
    allAudio: remaining(result.allAudio),
    allDownloads: remaining(result.allDownloads),
    largeFiles: remaining(result.largeFiles),
    junkFiles: remaining(result.junkFiles),
    obsoleteApks: remaining(result.obsoleteApks),
    whatsappFiles: remaining(result.whatsappFiles),
  };
  const duplicates = duplicateGroups.reduce(
    (s, g) => s + g.recoverableBytes,
    0,
  );
  const candidates = new Map(
    smartCleanCandidates({ ...result, ...arrays }).map((f) => [f.id, f]),
  );
  const categories = result.categories.map((c) => {
    if (c.key === "apps") return c;
    const removed = [...deleted]
      .map((id) => {
        for (const files of [
          result.allPhotos,
          result.allVideos,
          result.allAudio,
          result.allDownloads,
          result.junkFiles,
          result.whatsappFiles,
        ]) {
          const f = files.find((f) => f.id === id);
          if (
            f &&
            (f.category === c.key ||
              (c.key === "junk" && result.junkFiles.some((j) => j.id === id)) ||
              (c.key === "whatsapp" &&
                result.whatsappFiles.some((w) => w.id === id)))
          )
            return f;
        }
        const item = deletedItems.find(
          (f) => f.id === id && f.category === c.key,
        );
        return item ? ({ ...item } as ScannedFile) : null;
      })
      .filter((f): f is ScannedFile => Boolean(f));
    const cleanableBytes =
      c.key === "photos" || c.key === "duplicates"
        ? duplicates
        : [...candidates.values()]
            .filter((f) =>
              c.key === "junk"
                ? arrays.junkFiles.some((j) => j.id === f.id)
                : f.category === c.key,
            )
            .reduce((s, f) => s + f.sizeBytes, 0);
    return {
      ...c,
      bytes: Math.max(
        0,
        c.bytes - removed.reduce((s, f) => s + f.sizeBytes, 0),
      ),
      fileCount: Math.max(0, c.fileCount - removed.length),
      cleanableBytes,
    };
  });
  return {
    ...result,
    ...arrays,
    duplicateGroups,
    categories,
    totalCleanableBytes:
      [...candidates.values()].reduce((s, f) => s + f.sizeBytes, 0) +
      duplicates,
  };
}
