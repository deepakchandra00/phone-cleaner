import test from "node:test";
import assert from "node:assert/strict";
import { isUnusedApp } from "../lib/appUsage.ts";
const now = 1800000000000;
const day = 86400000;
test("unknown, future and system app usage never implies unused", () => {
  for (const app of [
    { lastUsedAt: 0, isSystem: false },
    { lastUsedAt: now + day, isSystem: false },
    { lastUsedAt: now - 100 * day, isSystem: true },
  ])
    assert.equal(isUnusedApp(app, 30, now), false);
});
test("unused suggestions honor the threshold and recent installation", () => {
  const app = { lastUsedAt: now - 50 * day, isSystem: false };
  assert.equal(isUnusedApp(app, 30, now), true);
  assert.equal(isUnusedApp(app, 60, now), false);
  assert.equal(
    isUnusedApp({ ...app, installedAt: now - 2 * day }, 30, now),
    false,
  );
});
