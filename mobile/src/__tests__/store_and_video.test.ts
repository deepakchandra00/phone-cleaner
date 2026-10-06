import test from "node:test";
import assert from "node:assert/strict";

const MB = 1024 * 1024;

// Replicate media sizing logic to test edge cases
function estimateMediaSizeTest(
  asset: { size?: number; duration?: number; width?: number; height?: number },
  type: "photo" | "video" | "audio"
): number {
  if (typeof asset.size === "number" && asset.size > 0) {
    return asset.size;
  }
  if (type === "video") {
    let durSec = asset.duration || 0;
    if (durSec > 1000) {
      durSec = durSec / 1000;
    }
    return Math.round(Math.max(1, durSec) * 1.2 * MB);
  }
  if (type === "audio") {
    let durSec = asset.duration || 0;
    if (durSec > 1000) {
      durSec = durSec / 1000;
    }
    return Math.round(Math.max(1, durSec) * (MB / 60));
  }
  return Math.round(Math.max(1, ((asset.width || 100) * (asset.height || 100) * 3) / 10));
}

test("Video duration sanitization & sizing", async (t) => {
  await t.test("sanitizes duration in milliseconds to prevent 50+ GB ballooning", () => {
    // 35 seconds reported as 35,000 milliseconds from MediaStore
    const rawAsset = { duration: 35000 };
    const size = estimateMediaSizeTest(rawAsset, "video");
    // 35 * 1.2 MB is approx 42 MB, NOT 50+ GB
    assert.ok(size < 100 * MB, `Size was ${size}, expected under 100 MB`);
    assert.equal(size, Math.round(35 * 1.2 * MB));
  });

  await t.test("prioritizes exact asset.size when available", () => {
    const rawAsset = { size: 15_500_000, duration: 120 };
    const size = estimateMediaSizeTest(rawAsset, "video");
    assert.equal(size, 15_500_000);
  });

  await t.test("handles standard duration in seconds accurately", () => {
    const rawAsset = { duration: 10 };
    const size = estimateMediaSizeTest(rawAsset, "video");
    assert.equal(size, Math.round(10 * 1.2 * MB));
  });
});

test("In-memory selection arithmetic simulation", async (t) => {
  const selectedFileIds = new Set<string>();
  const selectedFileBytesMap = new Map<string, number>();
  let selectedBytes = 0;

  function toggleFile(id: string, sizeBytes: number) {
    if (selectedFileIds.has(id)) {
      selectedFileIds.delete(id);
      const removed = selectedFileBytesMap.get(id) ?? sizeBytes;
      selectedFileBytesMap.delete(id);
      selectedBytes = Math.max(0, selectedBytes - removed);
    } else {
      selectedFileIds.add(id);
      selectedFileBytesMap.set(id, sizeBytes);
      selectedBytes += sizeBytes;
    }
  }

  function selectAllFiles(items: { id: string; sizeBytes: number }[]) {
    for (const item of items) {
      if (!selectedFileIds.has(item.id)) {
        selectedFileIds.add(item.id);
        selectedFileBytesMap.set(item.id, item.sizeBytes);
        selectedBytes += item.sizeBytes;
      }
    }
  }

  function deselectAllFiles(ids: string[]) {
    for (const id of ids) {
      if (selectedFileIds.has(id)) {
        selectedFileIds.delete(id);
        const size = selectedFileBytesMap.get(id) ?? 0;
        selectedFileBytesMap.delete(id);
        selectedBytes = Math.max(0, selectedBytes - size);
      }
    }
  }

  await t.test("toggles item on and off with exact byte tracking", () => {
    toggleFile("file_1", 5_000_000);
    assert.equal(selectedFileIds.size, 1);
    assert.equal(selectedBytes, 5_000_000);

    toggleFile("file_2", 3_000_000);
    assert.equal(selectedFileIds.size, 2);
    assert.equal(selectedBytes, 8_000_000);

    toggleFile("file_1", 5_000_000);
    assert.equal(selectedFileIds.size, 1);
    assert.equal(selectedBytes, 3_000_000);
  });

  await t.test("bulk select and deselect operations maintain exact sums", () => {
    const batch = [
      { id: "a", sizeBytes: 10_000 },
      { id: "b", sizeBytes: 20_000 },
      { id: "c", sizeBytes: 30_000 },
    ];
    selectAllFiles(batch);
    assert.equal(selectedFileIds.size, 4); // file_2 + 3 new
    assert.equal(selectedBytes, 3_000_000 + 60_000);

    deselectAllFiles(["a", "b"]);
    assert.equal(selectedFileIds.size, 2);
    assert.equal(selectedBytes, 3_000_000 + 30_000);
  });
});
