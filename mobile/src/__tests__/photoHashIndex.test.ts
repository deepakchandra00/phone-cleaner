import test from "node:test";
import assert from "node:assert/strict";
import {
  createPhotoHashIndex,
  hammingDistance,
} from "../lib/photoHashIndex.ts";

test("hash distance validates hashes and measures bit differences", () => {
  assert.equal(hammingDistance("0000000000000000", "00000000000000ff"), 8);
  assert.equal(hammingDistance("0000000000000000", "ffffffffffffffff"), 64);
  assert.equal(hammingDistance("not-a-hash", "not-a-hash"), 64);
});

test("photo index preserves every match within eight bits", () => {
  const hashes = [
    "0000000000000000",
    "00000000000000ff",
    "ffffffffffffffff",
    "0101010101010101",
  ];
  const lookup = createPhotoHashIndex(hashes);
  hashes.forEach((a) =>
    hashes.forEach((b, i) => {
      if (hammingDistance(a, b) <= 8) assert.ok(lookup(a).includes(i));
    }),
  );
  assert.deepEqual(lookup("invalid"), []);
});

test("optimized popcount agrees with a bit-by-bit reference across randomized hashes", () => {
  let state = 123456789;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0).toString(16).padStart(8, "0");
  };
  for (let i = 0; i < 2000; i++) {
    const a = random() + random(),
      b = random() + random();
    let expected = 0;
    for (let j = 0; j < 16; j++) {
      const bits = parseInt(a[j], 16) ^ parseInt(b[j], 16);
      expected += bits.toString(2).replace(/0/g, "").length;
    }
    assert.equal(hammingDistance(a, b), expected);
  }
});
