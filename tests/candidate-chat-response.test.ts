import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCandidateChatAnswer } from "../lib/candidate-chat-response.ts";
import type { CandidateChatContext } from "../lib/candidate-chat.ts";

const recordId = "2a13614a-7b30-4aa5-b959-843b2efef7d1";
const profileId = "profile:ae2e01fc-9560-4a0d-b34c-f96ab200e2a7";
const context = (rate = "3000円"): CandidateChatContext => ({ candidateName: "架空候補者", omittedRecords: 0, sources: [
  { id: recordId, label: "未提案・面談 2026-10-21", kind: "record", facts: [{ label: "ステータス", value: "提案候補" }] },
  { id: profileId, label: "面談基本情報", kind: "profile", facts: [{ label: "希望単価", value: rate }, { label: "稼働開始", value: "2026-11-01" }, { label: "月間稼働時間", value: "80時間" }] },
] });
const invalid = (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "INVALID_RESPONSE";
const answer = (text: string, sourceIds = [recordId]) => ({ answer: text, sourceIds });

test("normal prose and quoted original amounts stay unchanged without changing input or evidence", () => {
  const source = context(), before = JSON.stringify(source), body = answer("希望単価は「3000円」です。単位が未記録なので、時給・日給・月額のどれか本人に確認してください。");
  assert.deepEqual(normalizeCandidateChatAnswer(body, source), body);
  assert.equal(JSON.stringify(source), before);
  assert.notEqual(normalizeCandidateChatAnswer(body, source).sourceIds, body.sourceIds);
});

test("only a terminal known citation array is repaired and source IDs are unioned once", () => {
  for (const tail of [
    `sourceIds：[${recordId}, ${profileId}]`, `sourceIds: ["${recordId}", "${profileId}"]`,
    `"sourceIds": ["${profileId}"]`, `'sourceIds': ['${profileId}']`, `参照ID：[${profileId}]。`,
    `引用IDs: [“${profileId}”]`, `source_ids: []`,
  ]) {
    const body = answer(`希望単価の単位を確認してください。\n${tail}`), before = JSON.stringify(body);
    const result = normalizeCandidateChatAnswer(body, context());
    assert.equal(result.answer, "希望単価の単位を確認してください。", tail);
    assert.deepEqual(result.sourceIds, tail.includes(profileId) ? [recordId, profileId] : [recordId]);
    assert.equal(JSON.stringify(body), before);
  }
});

test("unknown, middle, malformed, repeated metadata and literal source IDs are never shown as prose", () => {
  for (const text of [
    "確認してください。sourceIds：[other-candidate-id]", `sourceIds：[${recordId}]\n確認してください。`,
    `確認してください。sourceIds：[${recordId}]\n補足します。`, `確認してください。sourceIds：${recordId}`,
    `確認してください。sourceIds：[${recordId},]`, `確認してください。sourceIds：[${recordId}] sourceIds：[]`,
    `確認してください。参照ID：${profileId}`, `記録 ${recordId} を確認してください。`,
    `answer：希望条件を確認してください。`, `{"answer":"希望条件を確認してください。","sourceIds":[]}`,
    "確認してください。sourceIds [unknown-id]", '補足：{"希望単価":"3000円"}',
    "確認してください。\n```json\n{\"summary\":\"内部資料\"}\n```", '"{\\"summary\\":\\"内部資料\\"}"',
  ]) assert.throws(() => normalizeCandidateChatAnswer(answer(text), context()), invalid, text);
});

test("both existing and repaired source references are strictly bounded to the provided candidate", () => {
  assert.throws(() => normalizeCandidateChatAnswer(answer("確認してください。", ["other-candidate"]), context()), invalid);
  assert.throws(() => normalizeCandidateChatAnswer(answer("確認してください。", [recordId, recordId]), context()), invalid);
  const many = context();
  many.sources = Array.from({ length: 14 }, (_, index) => ({ ...many.sources[0], id: `qa-source-${index}` }));
  assert.throws(() => normalizeCandidateChatAnswer(answer(`確認してください。sourceIds：[${many.sources.slice(1, 14).map(source => source.id).join(",")}]`, [many.sources[0].id]), many), invalid);
  assert.throws(() => normalizeCandidateChatAnswer(answer(`確認してください。sourceIds：[${many.sources.slice(1, 13).map(source => source.id).join(",")}]`, [many.sources[0].id]), many), invalid);
});

test("a unitless amount never acquires a pay period or an invented monthly calculation", () => {
  for (const text of [
    "希望単価は月3000円です。", "希望単価は月3000です。", "希望単価は時給3000円です。", "希望単価は日額3000円です。",
    "希望単価は3000円/月です。", "希望単価は3000円月です。", "希望単価は年額3000円です。",
    "希望単価は1件あたり3000円です。", "希望単価は時給3000円で、月80時間のため月額24万円です。",
    "時給3000円なので本人に確認してください。", "月額3000円を希望していますので確認してください。",
    "時給３，０００円です。", "希望単価は3,000円（時）です。", "時給3000円です、そうですよね？",
  ]) assert.throws(() => normalizeCandidateChatAnswer(answer(text, [profileId]), context()), invalid, text);
});

test("payment-unit questions and explicit unknowns are allowed without silently asserting a unit", () => {
  for (const text of [
    "希望単価「3000円」は時給か月額か、本人に確認してください。", "時給3000円ですか？",
    "月額は未記録です。", "希望単価の単位は未確認です。時給・月額のどれか確認してください。",
    "希望単価は「3000円」です。週5日・月80時間の希望時間帯を確認してください。",
    "営業経験の期間と実績を追記してください。",
  ]) assert.equal(normalizeCandidateChatAnswer(answer(text, [profileId]), context()).answer, text);
});

test("an explicit source unit may be rephrased but does not authorize another period", () => {
  assert.equal(normalizeCandidateChatAnswer(answer("希望単価は時給3000円です。", [profileId]), context("3,000円/時")).answer, "希望単価は時給3000円です。");
  assert.equal(normalizeCandidateChatAnswer(answer("希望単価は月額30万円です。", [profileId]), context("月30万円")).answer, "希望単価は月額30万円です。");
  assert.throws(() => normalizeCandidateChatAnswer(answer("時給3000円、月80時間なので月額24万円です。", [profileId]), context("時給3000円")), invalid);
  const multiple = context("時給3000円");
  multiple.sources.push({ ...multiple.sources[1], id: "profile:second-profile", facts: [{ label: "希望単価", value: "3000円" }] });
  assert.throws(() => normalizeCandidateChatAnswer(answer("希望単価は時給3000円です。", [profileId]), multiple), invalid);
});

test("a profile start availability is not promoted to a confirmed work-start date", () => {
  for (const text of ["稼働開始は2026年11月1日です。", "稼働開始は2026年11月01日です。", "2026-11-01に稼働を開始します。", "勤務開始日は2026/11/01です。", "稼働開始可能日は2026年11月1日ですが、稼働開始は2026年11月1日です。"]) {
    assert.throws(() => normalizeCandidateChatAnswer(answer(text, [profileId]), context()), invalid, text);
  }
  for (const text of ["稼働開始可能日は2026年11月1日です。", "2026-11-01から稼働可能と記録されています。", "稼働開始は2026年11月1日を希望しています。", "稼働開始日が2026年11月1日でよいか確認してください。"]) {
    assert.equal(normalizeCandidateChatAnswer(answer(text, [profileId]), context()).answer, text);
  }
  const actual = context(); actual.sources[0].facts.push({ label: "稼働開始日", value: "2026-11-01" });
  assert.equal(normalizeCandidateChatAnswer(answer("稼働開始は2026年11月1日です。"), actual).answer, "稼働開始は2026年11月1日です。");
});

test("the reported response cannot pass by merely separating its valid source metadata", () => {
  const text = `架空候補者の現在の状況をご説明します。稼働開始は2026年11月1日です。希望単価は月3000円です。sourceIds：[${recordId}, ${profileId}]`;
  assert.throws(() => normalizeCandidateChatAnswer(answer(text), context()), invalid);
});
