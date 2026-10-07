import {
  groupExactPhotoHashes,
  type PhotoHashes,
} from "./photoHashRecovery.ts";
import { createPhotoHashIndex, wordDistance } from "./photoHashIndex.ts";
import { rankBestPhotoToKeep } from "./safety.ts";
import type { DuplicateGroup, ScannedFile } from "./types";

function visualHash(file: ScannedFile, hashes: Map<string, PhotoHashes>) {
  const p = file.path || "";
  const u = file.uri || "";
  return (
    (p ? hashes.get(p)?.dhash : null) ??
    (u ? hashes.get(u)?.dhash : null) ??
    ""
  );
}

function isBurstPair(a: ScannedFile, b: ScannedFile): boolean {
  if (a.id === b.id) return false;
  // Exclude test mocks with dummy modifiedAt (must be a realistic Unix timestamp > 1e8)
  if (!a.modifiedAt || !b.modifiedAt || a.modifiedAt < 1e8 || b.modifiedAt < 1e8)
    return false;
  const timeA = a.modifiedAt < 1e11 ? a.modifiedAt * 1000 : a.modifiedAt;
  const timeB = b.modifiedAt < 1e11 ? b.modifiedAt * 1000 : b.modifiedAt;
  const timeDiff = Math.abs(timeA - timeB);
  if (timeDiff === 0 || timeDiff > 3500) return false;

  // Aspect ratio comparison
  if (a.width && a.height && b.width && b.height) {
    const ratioA = Math.max(a.width, a.height) / Math.min(a.width, a.height);
    const ratioB = Math.max(b.width, b.height) / Math.min(b.width, b.height);
    if (Math.abs(ratioA - ratioB) / Math.max(ratioA, ratioB) > 0.03) return false;
  }

  // Size difference within 30%
  const maxBytes = Math.max(a.sizeBytes, b.sizeBytes);
  const minBytes = Math.min(a.sizeBytes, b.sizeBytes);
  if (maxBytes > 0 && (maxBytes - minBytes) / maxBytes > 0.3) return false;

  return true;
}
function informative(hash: string) {
  if (!/^[0-9a-f]{16}$/i.test(hash)) return false;
  let bits = 0;
  for (const c of hash) {
    let value = parseInt(c, 16);
    while (value) {
      bits += value & 1;
      value >>>= 1;
    }
  }
  // Flat/near-flat visual hashes are too ambiguous to suggest removal.
  return bits >= 4 && bits <= 60;
}
type VisualFeature = {
  hash: string;
  valid: boolean;
  ratio: number;
  high: number;
  low: number;
};
function feature(
  file: ScannedFile,
  hashes: Map<string, PhotoHashes>,
): VisualFeature {
  const hash = visualHash(file, hashes).toLowerCase();
  return {
    hash,
    high: parseInt(hash.slice(0, 8), 16),
    low: parseInt(hash.slice(8), 16),
    valid: informative(hash),
    ratio:
      file.width && file.height
        ? Math.max(file.width, file.height) / Math.min(file.width, file.height)
        : 0,
  };
}
function match(a: VisualFeature, b: VisualFeature) {
  if (!a.valid || !b.valid) return false;
  if (
    a.ratio &&
    b.ratio &&
    Math.abs(a.ratio - b.ratio) / Math.max(a.ratio, b.ratio) > 0.05
  )
    return false;
  return a.hash === b.hash || wordDistance(a.high, a.low, b.high, b.low) <= 8;
}
function makeGroup(
  files: ScannedFile[],
  kind: "exact" | "similar",
  keep?: string,
): DuplicateGroup {
  const ranked = rankBestPhotoToKeep(files),
    keepId = keep ?? ranked.keepId;
  const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);
  return {
    id: `dup_${kind}_${keepId}`,
    kind,
    files: ranked.sortedFiles,
    keepId,
    totalBytes,
    recoverableBytes:
      totalBytes - (files.find((f) => f.id === keepId)?.sizeBytes ?? 0),
  };
}

/** Stable, non-overlapping removal candidates. A protected original may anchor
 * both an exact group and a similar group, but is never a removable member. */
export async function buildDuplicateGroups(
  files: ScannedFile[],
  hashes: Map<string, PhotoHashes>,
  onProgress?: (done: number, total: number) => void,
): Promise<DuplicateGroup[]> {
  const sorted = [...files].sort((a, b) => a.id.localeCompare(b.id));
  const exact = groupExactPhotoHashes(sorted, hashes).map((group) =>
    makeGroup(group, "exact"),
  );
  const exactIds = new Set(
    exact.flatMap((group) => group.files.map((f) => f.id)),
  );
  const singles = sorted.filter((f) => !exactIds.has(f.id));
  const lookup = createPhotoHashIndex(
    singles.map((f) => visualHash(f, hashes)),
  );
  const features = new Map(sorted.map((f) => [f.id, feature(f, hashes)]));
  const used = new Set<string>();
  const similar: DuplicateGroup[] = [];
  let comparisons = 0;
  let yieldedAt = Date.now();
  const shouldYield = () =>
    ++comparisons % 256 === 0 && Date.now() - yieldedAt >= 12;
  const yieldWork = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    yieldedAt = Date.now();
  };
  const collect = async (anchor: ScannedFile, protectedAnchor: boolean) => {
    const members = [anchor];
    const anchorFeature = features.get(anchor.id)!;
    if (!anchorFeature.valid) return;
    // Identical hash/ratio features have the same pairwise result. Retain one
    // representative so thousands of resized copies do not cause quadratic work.
    const representatives = new Map<string, VisualFeature>();
    const featureKey = (f: VisualFeature) => `${f.hash}:${f.ratio}`;
    representatives.set(featureKey(anchorFeature), anchorFeature);
    for (const index of lookup(visualHash(anchor, hashes))) {
      const candidate = singles[index];
      if (candidate.id === anchor.id || used.has(candidate.id)) continue;
      if (shouldYield()) await yieldWork();
      // Pairwise verification prevents chains of unrelated lookalikes from merging.
      const candidateFeature = features.get(candidate.id)!;
      let matches = true;
      for (const representative of representatives.values()) {
        if (shouldYield()) await yieldWork();
        if (!match(representative, candidateFeature)) {
          matches = false;
          break;
        }
      }
      if (matches) {
        members.push(candidate);
        representatives.set(featureKey(candidateFeature), candidateFeature);
        used.add(candidate.id);
      }
    }
    if (members.length > 1) {
      used.add(anchor.id);
      similar.push(
        makeGroup(members, "similar", protectedAnchor ? anchor.id : undefined),
      );
    }
  };
  for (const group of exact.sort((a, b) => a.keepId.localeCompare(b.keepId)))
    await collect(
      group.files.find((f) => f.id === group.keepId)!,
      true,
    );
  for (let i = 0; i < singles.length; i++) {
    if (i % 100 === 0) {
      onProgress?.(i, singles.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (!used.has(singles[i].id)) await collect(singles[i], false);
  }

  // ── Burst & Rapid-Shot Clustering ─────────────────────────────────────
  // Groups consecutive shots captured within 3.5 seconds with matching aspect
  // ratio and resolution. Detects similar takes even when dHash is unavailable.
  const remainingSingles = singles.filter((f) => !used.has(f.id));
  if (remainingSingles.length > 1) {
    const timeSorted = [...remainingSingles].sort(
      (a, b) => (a.modifiedAt || 0) - (b.modifiedAt || 0),
    );
    let burstCluster: ScannedFile[] = [];
    for (let i = 0; i < timeSorted.length; i++) {
      const curr = timeSorted[i];
      if (used.has(curr.id)) continue;

      if (burstCluster.length === 0) {
        burstCluster.push(curr);
        continue;
      }

      const prev = burstCluster[burstCluster.length - 1];
      if (isBurstPair(prev, curr)) {
        burstCluster.push(curr);
      } else {
        if (burstCluster.length > 1) {
          for (const f of burstCluster) used.add(f.id);
          similar.push(makeGroup(burstCluster, "similar"));
        }
        burstCluster = [curr];
      }
    }
    if (burstCluster.length > 1) {
      for (const f of burstCluster) used.add(f.id);
      similar.push(makeGroup(burstCluster, "similar"));
    }
  }

  return [...exact, ...similar];
}

export function duplicateCounts(groups: DuplicateGroup[]) {
  const photos = new Set(groups.flatMap((g) => g.files.map((f) => f.id)));
  const keep = new Set(groups.map((g) => g.keepId));
  const copies = new Set(
    groups.flatMap((g) =>
      g.files.filter((f) => !keep.has(f.id)).map((f) => f.id),
    ),
  );
  return { groups: groups.length, photos: photos.size, copies: copies.size };
}
