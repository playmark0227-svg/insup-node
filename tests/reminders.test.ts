import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { buildReminderTasks, claimReminderDeliveries, defaultReminderSettings, readReminderSettings, releaseReminderDeliveries, reminderBusinessClock, reminderHash, reminderNotice, reminderTaskPending, writeReminderSettings } from "../lib/reminders.ts";
import type { CandidateRecord } from "../lib/sheets-client.ts";

const now = Date.parse("2026-11-06T00:00:00Z");
function record(id = "record-one", owner = "ND-001"): CandidateRecord { const values = Array(26).fill(""); values[9] = "2026-11-07"; values[10] = "14:00"; return { recordId: id, playerId: owner, candidateName: "通知に含めない候補者", row: 2, rowVersion: "version", source: "", formulaColumns: [], values }; }
test("tomorrow uses Japan time across year and leap-day boundaries", () => {
  assert.deepEqual(reminderBusinessClock(Date.parse("2026-12-31T15:00:00Z")), { day: "2027-01-01", tomorrow: "2027-01-02", hour: 0, minute: 0 });
  assert.equal(reminderBusinessClock(Date.parse("2028-02-28T00:00:00Z")).tomorrow, "2028-02-29");
});
test("only the current owner's unfinished next-day plans are reminders; status and achievements remain separate", () => {
  const own = record(), other = record("other", "ND-002"), unknown = record("unmapped", ""), done = record("done"), ended = record("ended"), start = record("start");
  done.values[16] = "2026-11-07"; ended.values[6] = "辞退（本人希望）"; start.values[9] = ""; start.values[22] = "2026-11-07";
  const all = [own, other, unknown, done, ended, start];
  assert.deepEqual(buildReminderTasks(all, "ND-001", false, now).map(task => task.recordId), [start.recordId, own.recordId]);
  assert.equal(buildReminderTasks(all, "ADMIN", true, now).length, 3);
  const task = buildReminderTasks([own], "ND-001", false, now)[0]; assert.equal(JSON.stringify(task).includes(own.candidateName), false);
  own.values[16] = "2026-11-07"; assert.equal(buildReminderTasks([own], "ND-001", false, now).length, 0);
});
test("task IDs change when a plan's date or time changes", () => {
  const original = record(), a = buildReminderTasks([original], "ND-001", false, now)[0]; original.values[10] = "15:00";
  const b = buildReminderTasks([original], "ND-001", false, now)[0]; assert.notEqual(a.id, b.id);
  original.values[9] = "2026-11-08"; assert.equal(buildReminderTasks([original], "ND-001", false, now).length, 0);
});
test("preferences persist only a whitelisted shape with hashed keys and are isolated by login", async () => {
  const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const scope = await reminderHash("player:ND-001"), other = await reminderHash("player:ND-002"), task = await reminderHash("private-record-id");
  const settings = { enabled: true, hour: 9, actions: { [task]: { kind: "done" as const, until: 0, expires: now + 86400000 } }, candidateName: "must-not-persist" };
  assert.equal(writeReminderSettings(scope, settings, storage), true);
  assert.deepEqual(readReminderSettings(scope, now, storage), { enabled: true, hour: 9, actions: settings.actions });
  assert.deepEqual(readReminderSettings(other, now, storage), defaultReminderSettings());
  assert.equal([...values.values()].join("").includes("must-not-persist"), false); assert.equal([...values.values()].join("").includes("private-record-id"), false);
  assert.equal(Object.keys(readReminderSettings(scope, now + 2 * 86400000, storage).actions).length, 0);
});
test("malformed settings fail safely and done/snooze never mutate business records", () => {
  const key = "a".repeat(64), scope = "b".repeat(64), malformed = { enabled: true, hour: 999, actions: { [key]: { kind: "snooze", until: Infinity, expires: now + 100 }, "private-record-id": { kind: "done", until: 0, expires: now + 100 } } };
  const loaded = readReminderSettings(scope, now, { getItem: () => JSON.stringify(malformed) }); assert.equal(loaded.hour, 9); assert.equal(Object.keys(loaded.actions).length, 0);
  const settings = defaultReminderSettings(); settings.actions[key] = { kind: "snooze", until: now + 900000, expires: now + 86400000 };
  assert.equal(reminderTaskPending(key, settings, now), false); assert.equal(reminderTaskPending(key, settings, now + 900000), true);
  settings.actions[key] = { kind: "done", until: 0, expires: now + 86400000 }; assert.equal(reminderTaskPending(key, settings, now), false);
});
test("simultaneous tabs claim each notification once, and snooze/failure can deliberately release the claim", async () => {
  const factory = new IDBFactory(), scope = "a".repeat(64), first = "b".repeat(64), second = "c".repeat(64);
  const claims = await Promise.all([claimReminderDeliveries(scope, [first, second], now, factory), claimReminderDeliveries(scope, [first, second], now, factory)]);
  assert.equal(claims.flat().length, 2); assert.equal(new Set(claims.flat()).size, 2);
  assert.equal((await claimReminderDeliveries(scope, [first], now + 1000, factory)).length, 0);
  await releaseReminderDeliveries(scope, [first], factory); assert.deepEqual(await claimReminderDeliveries(scope, [first], now + 2000, factory), [first]);
  assert.deepEqual(await claimReminderDeliveries("d".repeat(64), [first], now, factory), [first]);
  assert.deepEqual(await claimReminderDeliveries(scope, [second], now + 4 * 86400000, factory), [second]);
});
test("OS notice contains only an aggregate and delivery storage rejects raw identifiers", async () => {
  const notice = reminderNotice(2); assert.match(notice.body, /2件/); assert.equal(JSON.stringify(notice).includes("候補者"), false);
  await assert.rejects(claimReminderDeliveries("player:ND-001", ["record-private"], now, new IDBFactory()), /識別/);
});
