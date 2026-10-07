import test from "node:test";
import assert from "node:assert/strict";
import {
  smartCleanCandidates,
  selectedGroups,
  reconcileDeleted,
} from "../lib/cleanupState.ts";
import { isSafeToCleanAutomatically } from "../lib/safety.ts";
import type { ScanResult, ScannedFile } from "../lib/types.ts";

const file = (
  id: string,
  bytes: number,
  path = "/storage/emulated/0/DCIM/Camera/a.jpg",
  category: ScannedFile["category"] = "photos",
): ScannedFile => ({
  id,
  name: id,
  sizeBytes: bytes,
  path,
  category,
  mimeType: "image/jpeg",
  modifiedAt: 1,
});
const original = file("original", 10);
const copyA = file("copyA", 10);
const copyB = file("copyB", 10);
const cache = file(
  "cache",
  20,
  "/storage/emulated/0/Android/media/app/cache/data",
  "junk",
);
const result: ScanResult = {
  startedAt: 1,
  completedAt: 2,
  durationMs: 1,
  filesScanned: 4,
  totalCleanableBytes: 40,
  categories: [
    {
      key: "photos",
      label: "Photos",
      bytes: 30,
      fileCount: 3,
      cleanableBytes: 20,
      cleanableCount: 2,
    },
  ],
  allPhotos: [original, copyA, copyB],
  allVideos: [],
  allAudio: [],
  allDownloads: [],
  obsoleteApks: [],
  largeFiles: [],
  apps: [],
  whatsappFiles: [],
  junkFiles: [cache],
  duplicateGroups: [
    {
      id: "group",
      kind: "exact",
      keepId: original.id,
      totalBytes: 30,
      recoverableBytes: 20,
      files: [original, copyA, copyB],
    },
  ],
};

test("Smart Clean suggests only deduplicated verified cache files", () => {
  const personal = { ...copyA, category: "junk" as const };
  const apk = file(
    "installer.apk",
    100,
    "/storage/emulated/0/Download/installer.apk",
    "apks",
  );
  const candidates = smartCleanCandidates({
    ...result,
    junkFiles: [cache, cache, personal, apk],
  });
  assert.deepEqual(
    candidates.map((f) => f.id),
    [cache.id],
  );
  assert.equal(
    candidates.reduce((s, f) => s + f.sizeBytes, 0),
    20,
  );
});

test("personal data mislabeled as junk is never suggested", () => {
  assert.equal(
    isSafeToCleanAutomatically({ ...original, category: "junk" }),
    false,
  );
  assert.equal(
    isSafeToCleanAutomatically({ ...cache, category: "documents" }),
    false,
  );
  assert.equal(
    isSafeToCleanAutomatically({ ...cache, canDelete: false } as any),
    false,
  );
});

test("group selection is derived from actual selected copies", () => {
  assert.equal(
    selectedGroups(result.duplicateGroups, new Set([copyA.id])).size,
    0,
  );
  assert.deepEqual(
    [...selectedGroups(result.duplicateGroups, new Set([copyA.id, copyB.id]))],
    ["group"],
  );
  assert.equal(
    selectedGroups(result.duplicateGroups, new Set([original.id])).size,
    0,
  );
});

test("partial deletion preserves failed copies and original, recalculates group bytes", () => {
  const next = reconcileDeleted(result, new Set([copyA.id]))!;
  assert.deepEqual(
    next.allPhotos.map((f) => f.id),
    [original.id, copyB.id],
  );
  assert.deepEqual(
    next.duplicateGroups[0].files.map((f) => f.id),
    [original.id, copyB.id],
  );
  assert.equal(next.duplicateGroups[0].recoverableBytes, 10);
  assert.equal(next.totalCleanableBytes, 30);
  assert.equal(next.categories[0].bytes, 20);
  assert.equal(result.allPhotos.length, 3);
});

test("complete duplicate cleanup removes group but preserves original", () => {
  const next = reconcileDeleted(result, new Set([copyA.id, copyB.id]))!;
  assert.equal(next.duplicateGroups.length, 0);
  assert.deepEqual(
    next.allPhotos.map((f) => f.id),
    [original.id],
  );
  assert.equal(next.totalCleanableBytes, 20);
});

test("SQLite-only files reconcile totals using acknowledged deleted records", () => {
  const next = reconcileDeleted(
    { ...result, allPhotos: [], duplicateGroups: [] },
    new Set([original.id]),
    [original],
  )!;
  assert.equal(next.categories[0].bytes, 20);
  assert.equal(next.categories[0].fileCount, 2);
});

test("failed or empty deletion leaves original result contents intact", () => {
  const next = reconcileDeleted(result, new Set())!;
  assert.deepEqual(next.allPhotos, result.allPhotos);
  assert.equal(next.duplicateGroups[0].recoverableBytes, 20);
  assert.equal(reconcileDeleted(null, new Set()), null);
});
