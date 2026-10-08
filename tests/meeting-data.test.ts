import test from "node:test";
import assert from "node:assert/strict";
import { previousMeetingMonth, proposalAchievement, meetingCsv, meetingCsvFilename } from "../lib/meeting-data.ts";

test("meeting comparison only accepts a calendar month and handles the year boundary", () => {
  assert.equal(previousMeetingMonth("2026-10"), "2026-09");
  assert.equal(previousMeetingMonth("2026-01"), "2025-12");
  for (const period of ["all", "2026-10-08", "2026-00", "2026-13", "2026-1", "<script>"]) assert.equal(previousMeetingMonth(period), null);
});

test("proposal targets show attainment over 100 percent and do not divide by an unset target", () => {
  assert.equal(proposalAchievement(24, 20), 120);
  assert.equal(proposalAchievement(0, 20), 0);
  for (const target of [0, -1, NaN, Infinity]) assert.equal(proposalAchievement(4, target), null);
});

test("meeting export preserves six metric counts and signed monthly differences without inventing an evaluation score", () => {
  const metrics = [
    { stage: "候補者面談", label: "面談実施" }, { stage: "提案", label: "提案数" },
    { stage: "C面談予約", label: "C面談予約" }, { stage: "クライアント面談", label: "C面談実施" },
    { stage: "内定承諾", label: "マッチ数" }, { stage: "稼働開始", label: "稼働開始" },
  ] as const;
  const row = { id: "ND-001", name: "越前祐美", target: 20, counts: { "候補者面談": 9, "提案": 24, "C面談予約": 10, "クライアント面談": 8, "内定承諾": 3, "稼働開始": 2 }, previous: { "候補者面談": 10, "提案": 20, "C面談予約": 8, "クライアント面談": 8, "内定承諾": 2, "稼働開始": 1 } };
  const csv = meetingCsv([row], metrics, "2026-10");
  assert.equal(csv.split("\r\n").length, 2);
  assert.ok(csv.endsWith('"9","24","10","8","3","2","-1","4","2","0","1","1","20","120"'));
  assert.ok(!csv.includes("総合点"));
  const cumulative = meetingCsv([row], metrics, "all");
  assert.ok(!cumulative.includes("前月差"));
  assert.ok(!cumulative.includes("月間提案目標"));
  assert.ok(cumulative.endsWith('"9","24","10","8","3","2"'));
});

test("CSV export quotes multiline names and neutralizes editable spreadsheet formulas", () => {
  const metrics = [{ stage: "提案", label: "提案数" }] as const;
  const row = { id: "ND-001", name: '  =HYPERLINK("x")\n,', target: 0, counts: { "提案": 2 }, previous: { "提案": 0 } };
  assert.ok(meetingCsv([row], metrics, "2026-10").includes('"\'  =HYPERLINK(""x"")\n,"'));
  assert.ok(meetingCsv([row], metrics, "2026-10").endsWith('"未設定","未設定"'));
  assert.equal(meetingCsvFilename("../../bad"), "insup-node-meeting-period.csv");
  assert.equal(meetingCsvFilename("2026-10"), "insup-node-meeting-2026-10.csv");
});
