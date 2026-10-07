import test from "node:test";
import assert from "node:assert/strict";
import {
  DatabaseWriteQueue,
  databaseTransaction,
  isDatabaseBusy,
} from "../lib/databaseWrites.ts";
test("native lock rejection is contention, not a stale database handle", () => {
  assert.equal(
    isDatabaseBusy(
      new Error(
        "NativeStatement.finalizeSync has been rejected: database is locked",
      ),
    ),
    true,
  );
  assert.equal(isDatabaseBusy(new Error("SQLITE_BUSY")), true);
  assert.equal(isDatabaseBusy(new Error("database is closed")), false);
});
test("writer retries a rolled-back transaction before allowing the next write", async () => {
  const queue = new DatabaseWriteQueue();
  const events: string[] = [];
  let attempts = 0;
  const db = {
    execAsync: async (sql: string) => {
      events.push(sql);
    },
  };
  const first = queue.run(() =>
    databaseTransaction(db, async () => {
      events.push("first");
      if (++attempts === 1) throw new Error("database is locked");
      return 7;
    }),
  );
  const second = queue.run(async () => {
    events.push("second");
    return 8;
  });
  assert.equal(await first, 7);
  assert.equal(await second, 8);
  assert.deepEqual(events, [
    "BEGIN IMMEDIATE;",
    "first",
    "ROLLBACK;",
    "BEGIN IMMEDIATE;",
    "first",
    "COMMIT;",
    "second",
  ]);
});
test("non-lock failure rolls back and does not poison subsequent writes", async () => {
  const queue = new DatabaseWriteQueue();
  const events: string[] = [];
  const failed = queue.run(() =>
    databaseTransaction(
      {
        execAsync: async (sql) => {
          events.push(sql);
        },
      },
      async () => {
        throw new Error("disk full");
      },
    ),
  );
  const next = queue.run(async () => 9);
  await assert.rejects(failed, /disk full/);
  assert.equal(await next, 9);
  assert.deepEqual(events, ["BEGIN IMMEDIATE;", "ROLLBACK;"]);
});
test("persistent contention stops after four attempts", async () => {
  let attempts = 0;
  await assert.rejects(
    new DatabaseWriteQueue().run(async () => {
      attempts++;
      throw new Error("database is locked");
    }),
    /locked/,
  );
  assert.equal(attempts, 4);
});
