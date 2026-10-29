import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {liveCount} from "../lib/sheets-client.ts";

// Load the real backend without supplying any Google services: these tests must
// stay read-only and must not depend on a calendar-triggered Sheet mutation.
const backend = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8"), backend);
const players = [
  {id: "ND-001", active: true, role: "player"},
  {id: "ND-002", active: true, role: "player"},
  {id: "ND-003", active: false, role: "player"},
  {id: "ADMIN", active: true, role: "admin"},
];
const activity = (stage, date, extra = {}) => ({
  stage, date, playerId: "ND-001", recordId: "row-1", candidateId: "candidate-1", candidateName: "候補者", ...extra,
});
const count = rows => backend.countActivities_(rows, players);
const record = (dates, status = "面談実施（合否待ち）") => {
  const values = Array(26).fill("");
  values[1] = "会社";
  values[6] = status;
  return {recordId: "row-1", candidateId: "candidate-1", playerId: "ND-001", name: "候補者", dates, values, version: "row-version", source: ""};
};
const recorded = [
  activity("候補者面談", "2026-09-30"),
  activity("提案", "2026-10-01"),
  activity("C面談予約", "2026-10-31"),
  activity("クライアント面談", "2026-11-01"),
  activity("内定承諾", "2026-12-31"),
  activity("稼働開始", "2027-01-01"),
];

test("all six outcomes belong to their own recorded month, including stages of the same candidate", () => {
  const counts = count(recorded);
  for (const step of recorded) {
    assert.equal(liveCount(counts, step.date.slice(0, 7), step.stage, "ND-001"), 1);
    for (const other of recorded.filter(item => item.date.slice(0, 7) !== step.date.slice(0, 7))) {
      assert.equal(liveCount(counts, other.date.slice(0, 7), step.stage, "ND-001"), 0);
    }
  }
});

test("December and January are separate annual buckets while cumulative history remains", () => {
  const counts = count(recorded);
  assert.equal(liveCount(counts, "2026-12", "内定承諾", null), 1);
  assert.equal(liveCount(counts, "2027-01", "内定承諾", null), 0);
  assert.equal(liveCount(counts, "2027-01", "稼働開始", null), 1);
  assert.equal(liveCount(counts, "2026-12", "稼働開始", null), 0);
  assert.equal(liveCount(counts, "all", "内定承諾", null), 1);
  assert.equal(liveCount(counts, "all", "稼働開始", null), 1);
});

test("a new month with no outcomes displays zero without inserting or resetting Sheet rows", () => {
  const rows = structuredClone(recorded), counts = count(rows);
  assert.equal(counts["2027-02"], undefined);
  for (const stage of backend.NODE.stages) {
    assert.equal(liveCount(counts, "2027-02", stage, "ND-001"), 0);
    assert.equal(liveCount(counts, "2027-02", stage, null), 0);
  }
  assert.deepEqual(rows, recorded);
});

test("a completely empty workbook still displays monthly and cumulative zero for every active player", () => {
  const counts = count([]);
  for (const player of players.filter(item => item.active && item.role === "player")) {
    for (const stage of backend.NODE.stages) {
      assert.equal(liveCount(counts, "all", stage, player.id), 0);
      assert.equal(liveCount(counts, "2027-01", stage, player.id), 0);
    }
  }
});

test("a later status change does not remove historical outcomes or move them into the current month", () => {
  const original = record(["2026-09-30", "2026-10-01", "2026-10-31", "2026-11-01", "", "", "", ""]);
  const before = count(backend.activities_({records: [original], schemaCompatible: true}));
  const changed = {...original, values: [...original.values]};
  changed.values[6] = "辞退（本人希望）";
  const store = {records: [changed], schemaCompatible: true};
  const preserved = structuredClone(store);
  const after = count(backend.activities_(store));
  assert.deepEqual(after, before);
  assert.deepEqual(store, preserved);
  assert.equal(changed.values[6], "辞退（本人希望）");
  assert.equal(liveCount(after, "2026-11", "クライアント面談", "ND-001"), 1);
  assert.equal(liveCount(after, "2026-12", "クライアント面談", "ND-001"), 0);
});

test("same-day interview duplicates are excluded while another month's actual interview is retained", () => {
  const counts = count([
    activity("候補者面談", "2026-10-31"),
    activity("候補者面談", "2026-10-31", {recordId: "row-2", candidateName: "候 補 者"}),
    activity("候補者面談", "2026-11-01", {recordId: "row-3"}),
  ]);
  assert.equal(liveCount(counts, "2026-10", "候補者面談", "ND-001"), 1);
  assert.equal(liveCount(counts, "2026-11", "候補者面談", "ND-001"), 1);
  assert.equal(liveCount(counts, "all", "候補者面談", "ND-001"), 2);
});

test("introduction uniqueness is scoped to each month and cumulative unique candidates", () => {
  const counts = count([
    activity("提案", "2026-10-30"),
    activity("提案", "2026-10-31", {recordId: "row-2"}),
    activity("提案", "2026-11-01", {recordId: "row-3"}),
  ]);
  assert.equal(liveCount(counts, "2026-10", "提案", "ND-001"), 2);
  assert.equal(liveCount(counts, "2026-10", "紹介人数", "ND-001"), 1);
  assert.equal(liveCount(counts, "2026-11", "提案", "ND-001"), 1);
  assert.equal(liveCount(counts, "2026-11", "紹介人数", "ND-001"), 1);
  assert.equal(liveCount(counts, "all", "提案", "ND-001"), 3);
  assert.equal(liveCount(counts, "all", "紹介人数", "ND-001"), 1);
});

test("admin monthly counts retain stopped players while player rankings expose only active members", () => {
  const rows = [
    ...recorded,
    activity("提案", "2026-10-01", {playerId: "ND-003", recordId: "inactive-row"}),
    activity("提案", "2026-10-01", {playerId: "ADMIN", recordId: "admin-row"}),
  ];
  const adminCounts = count(rows);
  assert.equal(liveCount(adminCounts, "2026-10", "提案", "ND-003"), 1, "Stopping login does not erase historical work");
  assert.equal(adminCounts["2026-10"].ADMIN, undefined);
  assert.equal(liveCount(adminCounts, "2026-10", "提案", null), 2);
  // buildSnapshot_ passes active members only for a player-facing ranking.
  const playerCounts = backend.countActivities_(rows, players.filter(player => player.active));
  assert.equal(liveCount(playerCounts, "2026-10", "提案", "ND-002"), 0);
  assert.equal(playerCounts["2026-10"]["ND-003"], undefined);
  assert.equal(playerCounts["2026-10"].ADMIN, undefined);
  assert.equal(liveCount(playerCounts, "2026-10", "提案", null), 1);
});

test("a current status label and a planned start do not invent next-month actual outcomes", () => {
  const candidate = record(["2026-10-01", "2026-10-02", "", "", "", "", "2026-11-01", ""], "稼働開始");
  const counts = count(backend.activities_({records: [candidate], schemaCompatible: true}));
  assert.equal(liveCount(counts, "2026-10", "候補者面談", "ND-001"), 1);
  assert.equal(liveCount(counts, "2026-10", "提案", "ND-001"), 1);
  assert.equal(liveCount(counts, "2026-11", "稼働開始予定", "ND-001"), 1);
  assert.equal(liveCount(counts, "2026-11", "稼働開始", "ND-001"), 0);
  assert.equal(liveCount(counts, "all", "稼働開始", "ND-001"), 0);
});
