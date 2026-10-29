import test from "node:test";
import assert from "node:assert/strict";
import { filterCandidateGroups, groupCandidates } from "../lib/candidate-groups.ts";
import type { CandidateRecord } from "../lib/sheets-client.ts";

function record(id: string, name: string, playerId = "ND-001", row = 2): CandidateRecord {
  const values: CandidateRecord["values"] = Array(26).fill("");
  values[2] = name;
  return { recordId: id, rowVersion: `version-${id}`, row, playerId, candidateName: name, source: "紹介元", values, formulaColumns: [] };
}
const all = { owner: "all", status: "all", search: "" };

test("same owner and whitespace-normalized name form one candidate while preserving every proposal and profile", () => {
  const first = { ...record("first", "山田 太郎", "ND-001", 3), candidateId: "C-first", profileId: "profile-first" };
  const second = { ...record("second", "山田　太郎", "ND-001", 4), candidateId: "C-second", profileId: "profile-second" };
  const third = { ...record("third", "山田\t太郎", "ND-001", 5), candidateId: "C-first", profileId: "profile-first" };
  const groups = groupCandidates([first, second, third], "registration-desc");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "山田太郎");
  assert.equal(groups[0].playerId, "ND-001");
  assert.deepEqual(groups[0].records, [third, second, first]);
  assert.strictEqual(groups[0].records[2], first);
  assert.equal(groups[0].records[2].rowVersion, "version-first");
  assert.equal(groups[0].records[0].profileId, "profile-first");
  assert.equal(groups[0].records[1].profileId, "profile-second");
});

test("identical names remain separate for different owners, including unmapped display owners", () => {
  const first = record("first", "山田太郎", "ND-001");
  const second = record("second", "山田太郎", "ND-002");
  const unmappedA = record("unmapped-a", "山田太郎", "");
  const unmappedASpaced = record("unmapped-a-spaced", "山田太郎", "");
  const unmappedB = record("unmapped-b", "山田太郎", "");
  const emptyOwner = record("empty-owner", "山田太郎", "");
  unmappedA.values[3] = "架空一郎";
  unmappedASpaced.values[3] = "架空 一郎";
  unmappedB.values[3] = "架空二郎";
  const groups = groupCandidates([first, second, unmappedA, unmappedASpaced, unmappedB, emptyOwner], "interview-desc");
  assert.equal(groups.length, 5);
  assert.equal(new Set(groups.map(group => group.key)).size, 5);
  assert.deepEqual(groups.find(group => group.records.some(row => row.recordId === "unmapped-a"))?.records.map(row => row.recordId), ["unmapped-a", "unmapped-a-spaced"]);
  assert.equal(filterCandidateGroups(groups, { ...all, owner: "ND-001" }).length, 1);
  assert.equal(filterCandidateGroups(groups, { ...all, owner: "unassigned" }).length, 3);
});

test("blank candidate names are kept as separate records rather than merged", () => {
  const groups = groupCandidates([record("blank-a", ""), record("blank-b", "　 \t"), record("named", "山田太郎")], "interview-desc");
  assert.equal(groups.length, 3);
  assert.equal(new Set(groups.map(group => group.key)).size, 3);
  assert.deepEqual(groups.map(group => group.records.length), [1, 1, 1]);
});

test("candidate group ordering follows the chosen sorted proposal order", () => {
  const old = record("old", "山田太郎", "ND-001", 2);
  const newest = record("newest", "山田太郎", "ND-001", 3);
  const middle = record("middle", "佐藤花子", "ND-001", 4);
  const undated = record("undated", "鈴木次郎", "ND-001", 5);
  old.values[0] = "2026-10-10";
  newest.values[0] = "2026-10-21";
  middle.values[0] = "2026-10-01";
  const rows = [old, newest, middle, undated];
  assert.deepEqual(groupCandidates(rows, "interview-desc").map(group => group.name), ["山田太郎", "佐藤花子", "鈴木次郎"]);
  assert.deepEqual(groupCandidates(rows, "interview-asc").map(group => group.name), ["佐藤花子", "山田太郎", "鈴木次郎"]);
  assert.deepEqual(groupCandidates(rows, "interview-asc")[1].records.map(row => row.recordId), ["old", "newest"]);
  assert.deepEqual(groupCandidates(rows, "registration-desc").map(group => group.name), ["鈴木次郎", "佐藤花子", "山田太郎"]);
});

test("status and search must match the same proposal, then the complete candidate stays visible", () => {
  const proposed = record("proposed", "山田太郎", "ND-001", 2);
  const declined = record("declined", "山田太郎", "ND-001", 3);
  const other = record("other", "佐藤花子", "ND-002", 4);
  proposed.values[1] = "Alpha Client";
  proposed.values[6] = "提案完了";
  declined.values[1] = "Beta Client";
  declined.values[6] = "辞退";
  other.values[1] = "Alpha Client";
  other.values[6] = "提案完了";
  const groups = groupCandidates([proposed, declined, other], "registration-desc");
  const matching = filterCandidateGroups(groups, { owner: "ND-001", status: "提案完了", search: " alpha " });
  assert.equal(matching.length, 1);
  assert.strictEqual(matching[0], groups[1]);
  assert.deepEqual(matching[0].records.map(row => row.recordId), ["declined", "proposed"]);
  assert.deepEqual(filterCandidateGroups(groups, { owner: "ND-001", status: "提案完了", search: "Beta" }), []);
  assert.equal(filterCandidateGroups(groups, { ...all, search: "山田太郎" }).length, 1);
  assert.equal(filterCandidateGroups(groups, { ...all, search: "紹介元" }).length, 0);
  assert.equal(filterCandidateGroups(groups, { ...all, search: "CLIENT" }).length, 2);
});

test("grouping and filtering leave the source records, their values and input order unchanged", () => {
  const first = record("first", "山田 太郎", "ND-001", 2);
  const second = record("second", "山田太郎", "ND-001", 3);
  const rows = [first, second];
  const before = structuredClone(rows);
  Object.freeze(first.values);
  Object.freeze(first);
  Object.freeze(second.values);
  Object.freeze(second);
  Object.freeze(rows);
  const groups = groupCandidates(rows, "registration-desc");
  const groupsBefore = structuredClone(groups);
  filterCandidateGroups(groups, { ...all, search: "山田" });
  assert.deepEqual(rows, before);
  assert.deepEqual(groups, groupsBefore);
});

test("group keys cannot collide when names or owner labels contain separator characters", () => {
  const first = record("first", "B|C", "A");
  const second = record("second", "C", "A|B");
  const third = record("third", "B|C", "");
  const fourth = record("fourth", "C", "");
  third.values[3] = "A";
  fourth.values[3] = "A|B";
  assert.equal(new Set(groupCandidates([first, second, third, fourth], "interview-desc").map(group => group.key)).size, 4);
});
