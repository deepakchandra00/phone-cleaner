import test from "node:test";
import assert from "node:assert/strict";
import { withStorageOperation } from "../lib/storageOperation.ts";

test("scanning blocks cleanup until the scan has completed", async () => {
  let release!: () => void;
  const running = withStorageOperation(
    "scan",
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await assert.rejects(
    withStorageOperation("cleanup", async () => 1),
    /scan to finish/,
  );
  release();
  await running;
  assert.equal(await withStorageOperation("cleanup", async () => 42), 42);
});

test("a failed operation releases the gate so retry can proceed", async () => {
  await assert.rejects(
    withStorageOperation("cleanup", async () => {
      throw new Error("permission denied");
    }),
    /permission denied/,
  );
  assert.equal(
    await withStorageOperation("scan", async () => "retried"),
    "retried",
  );
});

test("compression excludes scans and cleanup until its resources are released", async () => {
  let release!: () => void;
  const running = withStorageOperation(
    "compression",
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await assert.rejects(
    withStorageOperation("scan", async () => 1),
    /compression/,
  );
  await assert.rejects(
    withStorageOperation("cleanup", async () => 1),
    /compression/,
  );
  release();
  await running;
  assert.equal(await withStorageOperation("scan", async () => 2), 2);
});
