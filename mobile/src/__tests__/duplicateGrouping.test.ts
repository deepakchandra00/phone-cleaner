import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDuplicateGroups,
  duplicateCounts,
} from "../lib/duplicateGrouping.ts";
import type { ScannedFile } from "../lib/types.ts";
const file = (id: string): ScannedFile => ({
  id,
  path: `/${id}.jpg`,
  name: id,
  category: "photos",
  sizeBytes: 100,
  width: 100,
  height: 100,
  mimeType: "image/jpeg",
  modifiedAt: 1,
});
const visual = "aaaaaaaaaaaaaaaa";
test("compressed copy matches an exact group's protected original without overlapping removal targets", async () => {
  const photos = [file("a"), file("b"), file("c")];
  const hashes = new Map(
    photos.map((f) => [
      f.path,
      { sha256: f.id === "c" ? "compressed" : "exact", dhash: visual },
    ]),
  );
  const groups = await buildDuplicateGroups(photos, hashes);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].kind, "exact");
  assert.equal(groups[1].kind, "similar");
  assert.equal(groups[0].keepId, groups[1].keepId);
  const removable = groups.flatMap((g) =>
    g.files.filter((f) => f.id !== g.keepId).map((f) => f.id),
  );
  assert.equal(new Set(removable).size, removable.length);
  assert.deepEqual(duplicateCounts(groups), {
    groups: 2,
    photos: 3,
    copies: 2,
  });
});
test("matching is stable across scan order and does not merge unrelated similarity chains", async () => {
  const photos = [file("a"), file("b"), file("c")];
  const hashes = new Map([
    [photos[0].path, { sha256: "a", dhash: visual }],
    [photos[1].path, { sha256: "b", dhash: "aaaaaaaaaaaaaa55" }],
    [photos[2].path, { sha256: "c", dhash: "aaaaaaaaaaaa5555" }],
  ]);
  const one = await buildDuplicateGroups(photos, hashes),
    two = await buildDuplicateGroups([...photos].reverse(), hashes);
  assert.deepEqual(one, two);
  assert.equal(one.length, 1);
  assert.deepEqual(
    one[0].files.map((f) => f.id),
    ["a", "b"],
  );
});
test("flat visual hashes and substantially different aspect ratios are not suggested as similar", async () => {
  const photos = [file("a"), { ...file("b"), height: 500 }, file("c")];
  assert.deepEqual(
    await buildDuplicateGroups(
      photos,
      new Map(
        photos.map((f) => [
          f.path,
          { sha256: f.id, dhash: "0000000000000000" },
        ]),
      ),
    ),
    [],
  );
  assert.deepEqual(
    await buildDuplicateGroups(
      photos.slice(0, 2),
      new Map(photos.map((f) => [f.path, { sha256: f.id, dhash: visual }])),
    ),
    [],
  );
});
test("a library larger than the reported one retains every verified exact copy", async () => {
  const photos = Array.from({ length: 5000 }, (_, i) =>
    file(`p${String(i).padStart(5, "0")}`),
  );
  const groups = await buildDuplicateGroups(
    photos,
    new Map(photos.map((f) => [f.path, { sha256: "identical", dhash: null }])),
  );
  assert.deepEqual(duplicateCounts(groups), {
    groups: 1,
    photos: 5000,
    copies: 4999,
  });
});

test("5000 visually identical recompressed photos retain every copy", async () => {
  const photos = Array.from({ length: 5000 }, (_, i) =>
    file(`v${String(i).padStart(5, "0")}`),
  );
  const groups = await buildDuplicateGroups(
    photos,
    new Map(photos.map((f) => [f.path, { sha256: f.id, dhash: visual }])),
  );
  assert.equal(groups[0].kind, "similar");
  assert.deepEqual(duplicateCounts(groups), {
    groups: 1,
    photos: 5000,
    copies: 4999,
  });
});

test("13,177-photo comparison keeps exact duplicates, yields to the UI, and protects originals", async (t) => {
  let state = 0x12345678;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0).toString(16).padStart(8, "0");
  };
  const photos = Array.from({ length: 13177 }, (_, i) =>
    file(`scale_${String(i).padStart(5, "0")}`),
  );
  const hashes = new Map(
    photos.map((f) => [f.path, { sha256: f.id, dhash: random() + random() }]),
  );
  hashes.set(photos[1].path, {
    ...hashes.get(photos[0].path)!,
    sha256: photos[0].id,
  });
  let ticks = 0;
  const heartbeat = setInterval(() => ticks++, 1),
    started = Date.now();
  try {
    const groups = await buildDuplicateGroups(photos, hashes);
    assert.ok(
      groups.some(
        (g) =>
          g.kind === "exact" &&
          g.files.some((f) => f.id === photos[0].id) &&
          g.files.some((f) => f.id === photos[1].id),
      ),
    );
    const keepers = new Set(groups.map((g) => g.keepId));
    const removed = groups.flatMap((g) =>
      g.files.filter((f) => f.id !== g.keepId).map((f) => f.id),
    );
    assert.equal(new Set(removed).size, removed.length);
    assert.ok(removed.every((id) => !keepers.has(id)));
    assert.ok(ticks > 0, "comparison must allow the event loop to run");
    t.diagnostic(
      `13,177 synthetic photos: ${Date.now() - started} ms, ${ticks} event-loop ticks (desktop, not Android)`,
    );
  } finally {
    clearInterval(heartbeat);
  }
});

test("rapid burst shots taken within 3 seconds are detected as similar photos even without dhash", async () => {
  const baseTime = 1712345678000;
  const burstPhotos: ScannedFile[] = [
    { ...file("shot1"), modifiedAt: baseTime, sizeBytes: 2500000, width: 4000, height: 3000 },
    { ...file("shot2"), modifiedAt: baseTime + 1200, sizeBytes: 2480000, width: 4000, height: 3000 },
    { ...file("shot3"), modifiedAt: baseTime + 2400, sizeBytes: 2520000, width: 4000, height: 3000 },
    { ...file("other"), modifiedAt: baseTime + 100000, sizeBytes: 2500000, width: 4000, height: 3000 },
  ];
  const emptyHashes = new Map(
    burstPhotos.map((f) => [f.path, { sha256: f.id, dhash: null }]),
  );
  const groups = await buildDuplicateGroups(burstPhotos, emptyHashes);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, "similar");
  assert.equal(groups[0].files.length, 3);
  assert.deepEqual(
    groups[0].files.map((f) => f.id).sort(),
    ["shot1", "shot2", "shot3"],
  );
});

