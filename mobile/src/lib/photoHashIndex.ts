/** 64-bit visual hashes. Nine disjoint bands guarantee that hashes differing
 * in at most eight bits share at least one band. Only those need comparison. */
export function hammingDistance(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/i.test(a) || !/^[0-9a-f]{16}$/i.test(b)) return 64;
  return wordDistance(
    parseInt(a.slice(0, 8), 16),
    parseInt(a.slice(8), 16),
    parseInt(b.slice(0, 8), 16),
    parseInt(b.slice(8), 16),
  );
}

function popcount(value: number): number {
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
export function wordDistance(
  aHigh: number,
  aLow: number,
  bHigh: number,
  bLow: number,
): number {
  return popcount(aHigh ^ bHigh) + popcount(aLow ^ bLow);
}

function bands(hash: string): string[] {
  if (!/^[0-9a-f]{16}$/i.test(hash)) return [];
  const bits = [...hash]
    .map((c) => parseInt(c, 16).toString(2).padStart(4, "0"))
    .join("");
  return Array.from(
    { length: 9 },
    (_, i) =>
      `${i}:${bits.slice(Math.floor((i * 64) / 9), Math.floor(((i + 1) * 64) / 9))}`,
  );
}

export function createPhotoHashIndex(hashes: (string | null | undefined)[]) {
  const index = new Map<string, number[]>();
  hashes.forEach((hash, i) => {
    for (const band of bands(hash ?? "")) {
      const bucket = index.get(band) ?? [];
      bucket.push(i);
      index.set(band, bucket);
    }
  });
  return (hash: string): number[] => {
    const matches = new Set<number>();
    for (const band of bands(hash))
      for (const i of index.get(band) ?? []) matches.add(i);
    return [...matches].sort((a, b) => a - b);
  };
}
