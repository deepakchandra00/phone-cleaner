import test from "node:test";
import assert from "node:assert/strict";
import {
  reminderPlan,
  parseReminderTime,
  notificationRoute,
  shouldSendCleanupAlert,
} from "../lib/notificationPolicy.ts";

test("weekly review and daily reminders never overlap on Sunday", () => {
  const plan = reminderPlan({
    weekly: true,
    daily: true,
    hour: 18,
    minute: 30,
  });
  assert.equal(plan.length, 7);
  assert.equal(plan.filter((p) => p.weekday === 1).length, 1);
  assert.equal(new Set(plan.map((p) => p.id)).size, 7);
  assert.ok(
    plan
      .filter((p) => p.weekday !== 1)
      .every((p) => p.hour === 18 && p.minute === 30),
  );
});
test("disabled reminders produce no schedules; daily alone repeats at chosen time", () => {
  assert.deepEqual(
    reminderPlan({ weekly: false, daily: false, hour: 9, minute: 0 }),
    [],
  );
  const [daily] = reminderPlan({
    weekly: false,
    daily: true,
    hour: 7,
    minute: 45,
  });
  assert.equal(daily.weekday, undefined);
  assert.equal(daily.hour, 7);
  assert.equal(daily.minute, 45);
});
test("notification routes cannot invoke cleanup or navigate to an external destination", () => {
  for (const route of [
    "/review",
    "/success",
    "https://example.com",
    "javascript:alert(1)",
    null,
    {},
    "/category/photos",
  ])
    assert.equal(notificationRoute(route), null);
  assert.equal(notificationRoute("/category/whatsapp"), "/category/whatsapp");
  assert.equal(notificationRoute("/(tabs)/home"), "/(tabs)/home");
});
test("reminder time accepts midnight and late evening, rejects invalid times", () => {
  assert.deepEqual(parseReminderTime("00:00"), { hour: 0, minute: 0 });
  assert.deepEqual(parseReminderTime("23:59"), { hour: 23, minute: 59 });
  for (const time of ["24:00", "12:60", "-1:00", "9", "12:3", "abc"])
    assert.equal(parseReminderTime(time), null);
});
test("measured alerts enforce a size threshold and 24-hour cooldown", () => {
  const day = 86400000,
    threshold = 300 * 1024 * 1024;
  assert.equal(shouldSendCleanupAlert(threshold - 1, day, 0), false);
  assert.equal(shouldSendCleanupAlert(threshold, day - 1, 0), false);
  assert.equal(shouldSendCleanupAlert(threshold, day, 0), true);
  assert.equal(shouldSendCleanupAlert(NaN, day, 0), false);
});
