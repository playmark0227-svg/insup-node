import test from "node:test";
import assert from "node:assert/strict";
import { assertSnapshot, type SheetSnapshot } from "../lib/sheets-client.ts";
import { blankIntroductionV2Settings } from "../lib/introduction-v2.ts";
import { projectSnapshotForCache } from "../lib/snapshot-cache.ts";
import { pendingSaveResources } from "../lib/pending-saves.ts";

function fixture(): SheetSnapshot {
  return { self: { playerId: "ND-001", role: "player" }, players: [{ id: "ND-001", name: "架空担当", target: 20, color: "blue", team: "NODE", bio: "" }], activities: [], records: [], counts: {}, syncedAt: "2026-11-10T00:00:00Z", warnings: [], writesEnabled: true, introductionV2Feature: true, candidateIntroductionV2: [], introductionV2Settings: { ...blankIntroductionV2Settings(), blockedTerms: ["非公開の禁止語"], clients: [{ id: "private-client", name: "非公開企業設定", mentions: ["@非公開宛先"], rate: { amount: "987654", unit: "hour", tax: "exclusive" } }] } };
}

test("an authorized full snapshot can seed introductions, while the disk projection excludes every shared setting", () => {
  const snapshot = fixture();
  assertSnapshot(snapshot);
  const projection = projectSnapshotForCache(snapshot), text = JSON.stringify(projection);
  for (const value of ["introductionV2Settings", "candidateIntroductionV2", "非公開の禁止語", "非公開企業設定", "@非公開宛先", "987654"]) assert.equal(text.includes(value), false, value);
  assert.equal(projection.writesEnabled, false);
  assert.deepEqual(projection.records, []);
});

test("introduction settings require the matching feature and valid rate structure", () => {
  const disabled = fixture(); disabled.introductionV2Feature = undefined;
  assert.throws(() => assertSnapshot(disabled));
  const malformed = fixture(); malformed.introductionV2Settings!.clients[0].rate!.unit = "invalid" as never;
  assert.throws(() => assertSnapshot(malformed));
});

test("independent save targets can queue, while introduction settings and publication updates retain overlapping locks", () => {
  const snapshot = fixture();
  const first = pendingSaveResources("saveMetricGoals", { playerId: "ND-001", month: "2026-11" }, snapshot);
  const next = pendingSaveResources("saveMetricGoals", { playerId: "ND-001", month: "2026-12" }, snapshot);
  assert.equal(first.some(resource => next.includes(resource)), false);
  assert.deepEqual(pendingSaveResources("saveIntroductionSettings", {}, snapshot), ["*"]);
  const update = pendingSaveResources("publishIntroductionV2", { recordId: "record-a", publicationId: "publication-a" }, snapshot);
  const withdraw = pendingSaveResources("unpublishTeamCandidate", { publicationId: "publication-a" }, snapshot);
  assert.ok(update.some(resource => withdraw.includes(resource)));
});
