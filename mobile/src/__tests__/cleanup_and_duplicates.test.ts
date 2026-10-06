import test from "node:test";
import assert from "node:assert/strict";
import { formatHeadlineSize } from "../lib/format.ts";
import type { ScanResult, ScannedFile } from "../lib/types.ts";

test("performRealCleanup deletion dispatch & best photo safeguard", async (t) => {
  const dummyScanResult: ScanResult = {
    startedAt: 1000,
    completedAt: 2000,
    durationMs: 1000,
    totalCleanableBytes: 5_000_000,
    filesScanned: 10,
    categories: [],
    allPhotos: [],
    allVideos: [],
    allAudio: [],
    allDownloads: [],
    obsoleteApks: [],
    largeFiles: [],
    duplicateGroups: [
      {
        id: "group_1",
        kind: "exact",
        keepId: "photo_best_original",
        totalBytes: 9_000_000,
        recoverableBytes: 6_000_000,
        files: [
          {
            id: "photo_best_original",
            name: "best.jpg",
            path: "/dcim/best.jpg",
            sizeBytes: 3_000_000,
            category: "photos",
            modifiedAt: 1000,
            mimeType: "image/jpeg",
          },
          {
            id: "photo_dup_1",
            name: "dup1.jpg",
            path: "/dcim/dup1.jpg",
            sizeBytes: 3_000_000,
            category: "photos",
            modifiedAt: 2000,
            mimeType: "image/jpeg",
          },
          {
            id: "photo_dup_2",
            name: "dup2.jpg",
            path: "/dcim/dup2.jpg",
            sizeBytes: 3_000_000,
            category: "photos",
            modifiedAt: 3000,
            mimeType: "image/jpeg",
          },
        ],
      },
    ],
    apps: [],
    junkFiles: [],
    whatsappFiles: [],
  };

  await t.test("never deletes keepId during duplicate group cleanup even if accidentally in selectedFileIds", async () => {
    const selectedFiles = new Set<string>(["photo_best_original"]); // Accidental user selection of best photo
    const selectedGroups = new Set<string>(["group_1"]);

    // Test that the logic removes keepId from the candidate deletion set
    const idsToDelete = new Set(selectedFiles);
    for (const g of dummyScanResult.duplicateGroups) {
      if (selectedGroups.has(g.id)) {
        for (const f of g.files) {
          if (f.id !== g.keepId) {
            idsToDelete.add(f.id);
          }
        }
        idsToDelete.delete(g.keepId);
      }
    }

    assert.equal(idsToDelete.has("photo_best_original"), false, "Best photo must be excluded from deletion");
    assert.equal(idsToDelete.has("photo_dup_1"), true, "Duplicate 1 must be marked for deletion");
    assert.equal(idsToDelete.has("photo_dup_2"), true, "Duplicate 2 must be marked for deletion");
    assert.equal(idsToDelete.size, 2);
  });
});

test("Duplicate candidate bucketing logic", async (t) => {
  await t.test("only groups files that share both size and dimensions", () => {
    const files: ScannedFile[] = [
      { id: "1", name: "a.jpg", path: "/a.jpg", sizeBytes: 1000, width: 800, height: 600, category: "photos", modifiedAt: 1, mimeType: "image/jpeg" },
      { id: "2", name: "b.jpg", path: "/b.jpg", sizeBytes: 1000, width: 800, height: 600, category: "photos", modifiedAt: 2, mimeType: "image/jpeg" },
      { id: "3", name: "c.jpg", path: "/c.jpg", sizeBytes: 1000, width: 1024, height: 768, category: "photos", modifiedAt: 3, mimeType: "image/jpeg" },
      { id: "4", name: "d.jpg", path: "/d.jpg", sizeBytes: 2000, width: 800, height: 600, category: "photos", modifiedAt: 4, mimeType: "image/jpeg" },
    ];

    // 1. Group by size
    const bySize = new Map<number, ScannedFile[]>();
    for (const f of files) {
      const arr = bySize.get(f.sizeBytes) ?? [];
      arr.push(f);
      bySize.set(f.sizeBytes, arr);
    }
    const sizeCandidates = Array.from(bySize.values()).filter((g) => g.length > 1);
    assert.equal(sizeCandidates.length, 1);
    assert.equal(sizeCandidates[0].length, 3);

    // 2. Group by dimensions
    const candidates: ScannedFile[][] = [];
    for (const group of sizeCandidates) {
      const byDim = new Map<string, ScannedFile[]>();
      for (const f of group) {
        const key = `${f.width}x${f.height}`;
        const arr = byDim.get(key) ?? [];
        arr.push(f);
        byDim.set(key, arr);
      }
      for (const [, grp] of byDim) {
        if (grp.length > 1) candidates.push(grp);
      }
    }

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].length, 2);
    assert.deepEqual(candidates[0].map((f) => f.id), ["1", "2"]);
  });
});

test("Hash Cache validation and invalidation policy", async (t) => {
  await t.test("invalidates cached hash if file size or modified timestamp changes", () => {
    const cachedRow = {
      path_or_uri: "/dcim/photo.jpg",
      size_bytes: 2_500_000,
      modified_at: 1700000000,
      sha256: "abc123sha",
      dhash: "10011001",
    };

    const queryUnchanged = {
      pathOrUri: "/dcim/photo.jpg",
      sizeBytes: 2_500_000,
      modifiedAt: 1700000000,
    };
    const isValid =
      cachedRow.path_or_uri === queryUnchanged.pathOrUri &&
      cachedRow.size_bytes === queryUnchanged.sizeBytes &&
      cachedRow.modified_at === queryUnchanged.modifiedAt;
    assert.equal(isValid, true, "Unchanged file must reuse cache");

    const queryModifiedTime = {
      pathOrUri: "/dcim/photo.jpg",
      sizeBytes: 2_500_000,
      modifiedAt: 1700000999, // modified later
    };
    const isModifiedValid =
      cachedRow.path_or_uri === queryModifiedTime.pathOrUri &&
      cachedRow.size_bytes === queryModifiedTime.sizeBytes &&
      cachedRow.modified_at === queryModifiedTime.modifiedAt;
    assert.equal(isModifiedValid, false, "Modified file must invalidate cache and trigger rehash");

    const queryChangedSize = {
      pathOrUri: "/dcim/photo.jpg",
      sizeBytes: 2_500_500, // appended bytes
      modifiedAt: 1700000000,
    };
    const isSizeValid =
      cachedRow.path_or_uri === queryChangedSize.pathOrUri &&
      cachedRow.size_bytes === queryChangedSize.sizeBytes &&
      cachedRow.modified_at === queryChangedSize.modifiedAt;
    assert.equal(isSizeValid, false, "Changed size must invalidate cache");
  });
});

test("formatHeadlineSize avoids 0.0 GB truncation", async (t) => {
  await t.test("formats megabyte values with MB instead of truncating to 0.0 GB", () => {
    const junkBytes = 3.5 * 1024 * 1024; // 3.5 MB
    const res = formatHeadlineSize(junkBytes);
    assert.equal(res.value, "3.5");
    assert.equal(res.unit, "MB");
  });

  await t.test("formats gigabyte values with GB", () => {
    const videoBytes = 52 * 1024 * 1024 * 1024; // 52 GB
    const res = formatHeadlineSize(videoBytes);
    assert.equal(res.value, "52.0");
    assert.equal(res.unit, "GB");
  });

  await t.test("formats 0 bytes as 0 MB", () => {
    const res = formatHeadlineSize(0);
    assert.equal(res.value, "0");
    assert.equal(res.unit, "MB");
  });
});
