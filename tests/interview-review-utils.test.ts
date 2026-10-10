import test from "node:test";
import assert from "node:assert/strict";
import { draftDirty, eligibleReviewRecords, reportCopyText, reviewAggregateFingerprint } from "../lib/interview-review-utils.ts";
import type { CandidateRecord } from "../lib/sheets-client.ts";

function record(id: string, interviewedAt: string, matchedAt = "", startedAt = ""): CandidateRecord {
  const values = Array(26).fill("");
  values[16] = interviewedAt;
  values[21] = matchedAt;
  values[23] = startedAt;
  return { recordId: id, rowVersion: "v1", row: 2, playerId: "ND-001", candidateName: "候補者", source: "", values, formulaColumns: [] };
}

test("review candidates follow C interview month or day and remove later matches and starts", () => {
  const records = [
    record("october", "2026-10-09"), record("same-person-proposal", "2026-10-10"),
    record("september", "2026-09-09"), record("not-interviewed", ""),
    record("matched", "2026-10-09", "2026-10-10"), record("started", "2026-10-09", "", "2026-10-11"),
  ];
  assert.deepEqual(eligibleReviewRecords(records, "2026-10").map(value => value.recordId), ["october", "same-person-proposal"]);
  assert.deepEqual(eligibleReviewRecords(records, "2026-10-09").map(value => value.recordId), ["october"]);
  assert.deepEqual(eligibleReviewRecords(records, "all").map(value => value.recordId), ["october", "same-person-proposal", "september"]);
  assert.deepEqual(eligibleReviewRecords(records, "2026-").map(value => value.recordId), []);
});

test("aggregate fingerprint ignores display ordering and zero categories but tracks changed counts", () => {
  const original = [{ category: "条件のずれ", count: 2 }, { category: "事前確認不足", count: 1 }];
  const reordered = [{ category: "事前確認不足", count: 1 }, { category: "条件のずれ", count: 1 }, { category: "条件のずれ", count: 1 }, { category: "その他", count: 0 }];
  assert.equal(reviewAggregateFingerprint(original), reviewAggregateFingerprint(reordered));
  assert.notEqual(reviewAggregateFingerprint(original), reviewAggregateFingerprint([{ category: "条件のずれ", count: 1 }, { category: "事前確認不足", count: 2 }]));
  assert.deepEqual(original, [{ category: "条件のずれ", count: 2 }, { category: "事前確認不足", count: 1 }]);
});

test("draft change detection distinguishes an untouched new reason from unsaved category or text changes", () => {
  const empty = { category: "理由未確認", memo: "", nextAction: "" };
  assert.equal(draftDirty(empty), false);
  assert.equal(draftDirty({ ...empty, category: "条件のずれ" }), true);
  const saved = { category: "条件のずれ", memo: "勤務条件を確認", nextAction: "面談前に照合" };
  assert.equal(draftDirty({ ...saved }, saved), false);
  assert.equal(draftDirty({ ...saved, memo: "勤務条件を確認済み" }, saved), true);
  assert.equal(draftDirty({ ...saved, nextAction: "" }, saved), true);
  assert.equal(draftDirty({ ...saved, memo: `${saved.memo}\n` }, saved), true);
});

test("meeting copy includes the source period and ordered actions with a Japan time date", () => {
  const text = reportCopyText({ summary: "条件のずれが最多です。", actions: ["提案前に勤務条件を照合する", "面談後に認識の差を確認する"], count: 4, generatedAt: "2026-10-10T17:04:00.000Z" }, "2026年10月");
  assert.ok(text.includes("対象期間：2026年10月"));
  assert.ok(text.includes("対象：4件の理由記録"));
  assert.ok(text.includes("生成日時：2026年10月11日 02:04（日本時間）"));
  assert.ok(text.includes("1. 提案前に勤務条件を照合する\n2. 面談後に認識の差を確認する"));
  assert.ok(text.includes("理由の分類と件数から作成した改善案"));
});

test("copied report handles an unavailable generation date without displaying an invalid date", () => {
  const text = reportCopyText({ summary: "傾向", actions: [], count: 1, generatedAt: "" }, "全期間");
  assert.ok(text.includes("生成日時：日時不明"));
  assert.ok(!text.includes("Invalid Date"));
});
