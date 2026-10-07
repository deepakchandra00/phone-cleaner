import test from "node:test";
import assert from "node:assert/strict";
import {
  recoverPhotoHashes,
  groupExactPhotoHashes,
} from "../lib/photoHashRecovery.ts";

test("partial cache retries missing hashes and inaccessible paths retry content URIs", async () => {
  const calls: string[][] = [];
  const result = await recoverPhotoHashes(
    [
      { path: "/a", uri: "content://a" },
      { path: "/b", uri: "content://b" },
    ],
    new Map([["/a", { sha256: "same", dhash: null }]]),
    async (paths) => {
      calls.push(paths);
      return paths.map((path) => ({
        path,
        sha256: path.startsWith("content:") ? "same" : null,
        dhash: path.startsWith("content:") ? "0000000000000001" : null,
      }));
    },
  );
  assert.deepEqual(calls, [
    ["/a", "/b"],
    ["content://a", "content://b"],
  ]);
  assert.equal(result.get("/a")?.sha256, "same");
  assert.equal(result.get("/b")?.dhash, "0000000000000001");
});

test("small photos and differing or absent metadata do not exclude exact copies", () => {
  const photos = [
    { path: "/a", sizeBytes: 100, width: 0 },
    { path: "/b", sizeBytes: 9000, width: 10 },
    { path: "/c", sizeBytes: 100, width: 0 },
  ];
  const hashes = new Map(
    photos.map((f) => [
      f.path,
      { sha256: f.path === "/c" ? null : "same", dhash: null },
    ]),
  );
  assert.deepEqual(groupExactPhotoHashes(photos, hashes), [
    [photos[0], photos[1]],
  ]);
});

test("complete cached hashes require no native reads; failed hashes create no duplicates", async () => {
  const hashes = await recoverPhotoHashes(
    [{ path: "/a" }],
    new Map([["/a", { sha256: "abc", dhash: "0000000000000000" }]]),
    async () => {
      throw new Error("unexpected read");
    },
  );
  assert.equal(hashes.get("/a")?.sha256, "abc");
  assert.deepEqual(
    groupExactPhotoHashes([{ path: "/a" }, { path: "/b" }], new Map()),
    [],
  );
});
