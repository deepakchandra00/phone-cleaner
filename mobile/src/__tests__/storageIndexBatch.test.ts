import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  CREATE_STORAGE_ITEMS_TABLE_SQL,
  type StorageItem,
} from "../db/schema.ts";
import {
  storageBatchSql,
  storageItemBindings,
  STORAGE_BATCH_SIZE,
} from "../lib/storageIndexBatch.ts";
const item = (id: string, bytes = 1): StorageItem => ({
  id,
  uri: `content://photos/${id}`,
  name: `${id}.jpg`,
  sizeBytes: bytes,
  category: "photos",
  source: "media_store",
  modifiedAt: 1,
  isLarge: false,
  isJunk: false,
  canOpen: true,
  canPreview: true,
  canDelete: true,
  requiresPermission: true,
});
test("bounded batches persist 13,177 rows, tail rows, and repeated IDs in order", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(CREATE_STORAGE_ITEMS_TABLE_SQL);
    const rows = Array.from({ length: 13177 }, (_, i) => item(String(i)));
    rows.push(item("0", 77));
    let calls = 0;
    db.exec("BEGIN IMMEDIATE");
    for (let i = 0; i < rows.length; i += STORAGE_BATCH_SIZE) {
      const batch = rows.slice(i, i + STORAGE_BATCH_SIZE);
      const bindings = batch.flatMap(storageItemBindings);
      assert.ok(bindings.length <= 999);
      db.prepare(storageBatchSql(batch.length)).run(...bindings);
      calls++;
    }
    db.exec("COMMIT");
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM storage_items").get()?.n,
      13177,
    );
    assert.equal(
      db.prepare("SELECT size_bytes FROM storage_items WHERE id='0'").get()
        ?.size_bytes,
      77,
    );
    assert.equal(calls, 412);
    assert.throws(() => storageBatchSql(0));
    assert.throws(() => storageBatchSql(33));
  } finally {
    db.close();
  }
});
