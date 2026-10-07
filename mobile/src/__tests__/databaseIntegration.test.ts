import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DatabaseWriteQueue,
  databaseTransaction,
} from "../lib/databaseWrites.ts";
function connections() {
  const directory = mkdtempSync(join(tmpdir(), "smartcare-sqlite-"));
  const path = join(directory, "index.db");
  const reader = new DatabaseSync(path),
    writer = new DatabaseSync(path);
  reader.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE items(id TEXT PRIMARY KEY); INSERT INTO items VALUES ('previous');",
  );
  return {
    reader,
    writer,
    path,
    close: () => {
      reader.close();
      writer.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
test("WAL reader sees last committed index throughout replacement and rollback", async () => {
  const c = connections();
  const db = {
    execAsync: async (sql: string) => {
      c.writer.exec(sql);
    },
  };
  const rows = () =>
    c.reader
      .prepare("SELECT id FROM items ORDER BY id")
      .all()
      .map((r) => r.id);
  try {
    await assert.rejects(
      databaseTransaction(db, async () => {
        c.writer.exec(
          "DELETE FROM items; INSERT INTO items VALUES ('incomplete');",
        );
        assert.deepEqual(rows(), ["previous"]);
        throw new Error("index interrupted");
      }),
      /interrupted/,
    );
    assert.deepEqual(rows(), ["previous"]);
    await databaseTransaction(db, async () => {
      c.writer.exec(
        "DELETE FROM items; INSERT INTO items VALUES ('complete');",
      );
      assert.deepEqual(rows(), ["previous"]);
    });
    assert.deepEqual(rows(), ["complete"]);
  } finally {
    c.close();
  }
});
test("queue recovers from genuine SQLite writer contention without reopening a connection", async () => {
  const c = connections();
  const competing = new DatabaseSync(c.path);
  competing.exec("BEGIN IMMEDIATE; INSERT INTO items VALUES ('external');");
  const release = setTimeout(() => competing.exec("COMMIT;"), 20);
  try {
    await new DatabaseWriteQueue().run(() =>
      databaseTransaction(
        {
          execAsync: async (sql: string) => {
            c.writer.exec(sql);
          },
        },
        async () => {
          c.writer.exec("INSERT INTO items VALUES ('queued');");
        },
      ),
    );
    assert.equal(
      c.reader.prepare("SELECT COUNT(*) AS count FROM items").get()?.count,
      3,
    );
  } finally {
    clearTimeout(release);
    competing.close();
    c.close();
  }
});
