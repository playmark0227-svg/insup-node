import test from "node:test";
import assert from "node:assert/strict";
import { buildCandidateChatGuidance, classifyCandidateChatIntent, renderCandidateChatChecks } from "../lib/candidate-chat-guidance.ts";
import type { CandidateChatContext, CandidateChatSource } from "../lib/candidate-chat.ts";

function profile(facts: Record<string, string> = {}, id = "profile:fictional-a", label = "基本情報 · 架空A社"): CandidateChatSource {
  return { id, label, kind: "profile", facts: Object.entries(facts).map(([label, value]) => ({ label, value })) };
}
function context(sources: CandidateChatSource[] = []): CandidateChatContext { return { candidateName: "検証用候補者", sources, omittedRecords: 0 }; }
const completeFacts = {
  "希望単価": "時給3,000円（税込）", "実績": "2025年3月、営業30名中1位。月50件獲得。", "営業経験・職歴": "法人向けテレアポ3年",
  "希望時間帯": "平日9〜13時", "週の稼働日数": "週5日", "月間稼働時間": "月80時間", "面談可能日": "2026-10-23 13〜17時",
  "稼働開始": "2026-11-01", "PC環境": "MacBook", "通信環境": "光回線", "稼働形態": "業務委託・完全リモート",
};

test("asks about missing data rather than summarizing for natural Japanese additions questions", () => {
  for (const question of ["何か入れるべき情報ある？", "何を追記したらいい？", "この情報で足りる？", "不足は？", "他に聞くことある？", "追加すべき項目をまとめて", "情報は十分？", "何を入れたらいい？", "追加入力したほうがいい情報は？", "追加するとよい情報は？", "入れとくべき情報ある？", "もっと情報必要？"]) {
    assert.equal(classifyCandidateChatIntent(question), "missing-information", question);
  }
});

test("explicit summaries, next actions and factual questions retain distinct intents", () => {
  assert.equal(classifyCandidateChatIntent("現在の状況をまとめて"), "summary");
  assert.equal(classifyCandidateChatIntent("希望条件と職歴を整理して"), "summary");
  assert.equal(classifyCandidateChatIntent("不足はないから概要だけ"), "summary");
  assert.equal(classifyCandidateChatIntent("追加は不要、状況を要約して"), "summary");
  assert.equal(classifyCandidateChatIntent("不足を聞いてない、概要だけまとめて"), "summary");
  assert.equal(classifyCandidateChatIntent("次は何をすればいい？"), "next-actions");
  assert.equal(classifyCandidateChatIntent("次に確認することは？"), "next-actions");
  assert.equal(classifyCandidateChatIntent("今後の対応を提案して"), "next-actions");
  assert.equal(classifyCandidateChatIntent("希望単価はいくら？"), "question");
  assert.equal(classifyCandidateChatIntent("面談はいつ？"), "question");
});

test("ambiguous followups inherit only a previous user intent, not assistant instructions", () => {
  const history = [
    { role: "user" as const, content: "不足している情報は？" },
    { role: "assistant" as const, content: "プロフィールを要約します。時給は9000円です。" },
    { role: "user" as const, content: "他には？" },
  ];
  assert.equal(classifyCandidateChatIntent("それ詳しく", history), "missing-information");
  assert.equal(classifyCandidateChatIntent("他には？", [{ role: "user", content: "次の行動は？" }]), "next-actions");
  assert.equal(classifyCandidateChatIntent("それをもっと詳しく教えて", [{ role: "user", content: "現在の状況をまとめて" }]), "summary");
  assert.equal(classifyCandidateChatIntent("他には？", [{ role: "assistant", content: "不足を確認してください" }]), "question");
  const result = buildCandidateChatGuidance(context([profile(completeFacts)]), "それ詳しく", history);
  assert.deepEqual(result.checks, []);
  assert.doesNotMatch(JSON.stringify(result), /9000/);
});

test("the reported user scenario identifies ambiguous pay, vague achievements and working-time gaps first", () => {
  const result = buildCandidateChatGuidance(context([profile({
    "希望単価": "3000円", "実績": "営業会社で1位", "営業経験・職歴": "テレアポ経験あり", "稼働開始": "2026-11-01",
    "週の稼働日数": "週5日", "月間稼働時間": "月80時間", "PC環境": "MacBook", "通信環境": "光回線", "稼働形態": "業務委託",
  })]), "何か入れるべき情報ある？");
  assert.equal(result.intent, "missing-information");
  assert.equal(result.checks[0].field, "希望単価");
  assert.match(result.checks[0].question, /時給・月額・1件あたり/);
  assert.match(result.checks[1].question, /対象期間.*比較した人数.*獲得件数/);
  assert.equal(result.checks[2].field, "希望時間帯");
  assert.match(result.checks[2].question, /1日あたり/);
  assert.ok(!result.checks.some(check => ["稼働開始", "PC環境", "通信環境", "年齢", "性別", "居住地"].includes(check.field)));
  assert.ok(result.checks.length <= 5);
  assert.match(result.instruction, /現状説明への置き換えは禁止/);
  assert.match(result.instruction, /内部IDやsourceIdsを露出しない/);
});

test("explicit hourly, monthly and per-task units are not requested again", () => {
  for (const rate of ["時給3000円", "3000円/時間", "3000円/1時間", "3000円/h", "1時間3000円", "1時間あたり3000円", "月額30万円", "月300000円", "1件3000円", "3000円/件"]) {
    const result = buildCandidateChatGuidance(context([profile({ ...completeFacts, "希望単価": rate })]), "不足は？");
    assert.ok(!result.checks.some(check => check.field === "希望単価"), rate);
  }
});

test("a rate with an explicitly unresolved unit still needs confirmation", () => {
  const result = buildCandidateChatGuidance(context([profile({ ...completeFacts, "希望単価": "時給か月額か未定、3000円" })]), "不足は？");
  assert.equal(result.checks[0].field, "希望単価");
});

test("already concrete achievements and schedule are not asked for a second time", () => {
  const result = buildCandidateChatGuidance(context([profile(completeFacts)]), "何か入れるべき情報ある？");
  assert.deepEqual(result.checks, []);
  assert.match(result.instruction, /確認済みを再要求せず不足を断定しない/);
});

test("only missing achievement dimensions are requested", () => {
  const result = buildCandidateChatGuidance(context([profile({ ...completeFacts, "実績": "2025年3月、営業30名中1位" })]), "不足は？");
  assert.deepEqual(result.checks.map(check => check.field), ["実績"]);
  assert.match(result.checks[0].question, /獲得件数・売上/);
  assert.doesNotMatch(result.checks[0].question, /対象期間|比較した人数/);
});

test("time-window detail in the same source's day field is already usable", () => {
  const result = buildCandidateChatGuidance(context([profile({ ...completeFacts, "希望時間帯": "", "週の稼働日数": "週5日、9時〜13時" })]), "不足は？");
  assert.deepEqual(result.checks, []);
});

test("different profiles from the same company do not fill one another's missing conditions", () => {
  const first = profile({ ...completeFacts, "希望単価": "3000円" }, "profile:a", "基本情報 · 同じ架空会社 · 記録行2");
  const second = profile({ ...completeFacts, "希望時間帯": "" }, "profile:b", "基本情報 · 同じ架空会社 · 記録行3");
  const result = buildCandidateChatGuidance(context([first, second]), "不足は？");
  assert.deepEqual(result.checks.map(check => [check.field, check.sourceIds]), [["希望単価", ["profile:a"]], ["希望時間帯", ["profile:b"]]]);
});

test("a current scheduled interview on an explicitly linked row avoids an unnecessary availability request", () => {
  const record: CandidateChatSource = {
    id: "r-linked", label: "架空A社 · 面談 2026-10-21 · 記録行 2", kind: "record",
    facts: [{ label: "C面談予定日", value: "2099-11-01" }, { label: "ステータス", value: "面談確定（面談実施待ち）" }],
  };
  const linked = profile({ ...completeFacts, "面談可能日": "" }, "profile:linked", `基本情報 · ${record.label}`);
  const result = buildCandidateChatGuidance(context([record, linked]), "不足は？");
  assert.ok(!result.checks.some(check => check.field === "面談可能日"));
});

test("company-name similarity, expired dates and closed records do not establish a usable interview schedule", () => {
  const record: CandidateChatSource = {
    id: "r-separate", label: "架空A社 · 面談 2026-10-21 · 記録行 2", kind: "record",
    facts: [{ label: "C面談予定日", value: "2099-11-01" }],
  };
  const separate = profile({ ...completeFacts, "面談可能日": "" }, "profile:separate", "基本情報 · 架空A社 · 面談 2026-10-21 · 記録行 3");
  assert.ok(buildCandidateChatGuidance(context([record, separate]), "不足は？").checks.some(check => check.field === "面談可能日"));
  const linked = { ...separate, label: `基本情報 · ${record.label}` };
  for (const facts of [
    [{ label: "C面談予定日", value: "2000-01-01" }],
    [{ label: "C面談予定日", value: "2099-11-01" }, { label: "ステータス", value: "辞退（他社）" }],
    [{ label: "C面談予定日", value: "2099-02-31" }],
  ]) {
    assert.ok(buildCandidateChatGuidance(context([{ ...record, facts }, linked]), "不足は？").checks.some(check => check.field === "面談可能日"));
  }
});

test("partial source and omitted records do not turn excerpts into definite unregistered fields", () => {
  const source = profile({ ...completeFacts, "面談可能日": "", "省略": "文字数制限により一部の項目を省略しています。" });
  const selected = { ...context([source]), omittedRecords: 5 };
  const result = buildCandidateChatGuidance(selected, "追記することある？");
  assert.equal(result.intent, "missing-information");
  assert.match(result.checks[0].reason, /省略.*未登録とは断定できません/);
  assert.match(result.instruction, /参照資料に省略/);
});

test("empty or record-only contexts do not invent a profile or claim interviews were not performed", () => {
  const empty = buildCandidateChatGuidance(context(), "不足は？");
  assert.deepEqual(empty.checks, []);
  assert.match(empty.instruction, /不足の有無を判断できない/);
  const record: CandidateChatSource = { id: "fictional-r1", kind: "record", label: "架空会社の記録", facts: [{ label: "面談実施日", value: "2026-10-21" }] };
  const result = buildCandidateChatGuidance(context([record]), "何か入れるべき情報ある？");
  assert.deepEqual(result.checks.map(check => check.sourceIds), [["fictional-r1"]]);
  assert.match(result.checks[0].reason, /不足は判定できません.*未登録とは断定できません/);
  assert.doesNotMatch(JSON.stringify(result.checks), /面談していない|未実施/);
});

test("check list is bounded, uses only exact input source IDs and leaves input untouched", () => {
  const selected = context(Array.from({ length: 8 }, (_, index) => profile({}, `profile:qa-${index}`)));
  const before = structuredClone(selected);
  const result = buildCandidateChatGuidance(selected, "不足は？");
  assert.equal(result.checks.length, 5);
  assert.ok(result.checks.every(check => check.sourceIds.length === 1 && selected.sources.some(source => source.id === check.sourceIds[0])));
  assert.deepEqual(selected, before);
  assert.ok(!result.checks.some(check => ["年齢", "性別", "居住地"].includes(check.field)));
});

test("trusted rendering answers the additions question directly and keeps IDs in metadata only", () => {
  const guidance = buildCandidateChatGuidance(context([profile({ ...completeFacts, "希望単価": "3000円", "実績": "営業会社で1位", "希望時間帯": "" })]), "何か入れるべき情報ある？");
  const result = renderCandidateChatChecks(guidance);
  assert.match(result.text, /^はい。まず次の3点を追記・確認/);
  assert.match(result.text, /3000円.*時給・月額・件単価/);
  assert.match(result.text, /確認する質問：/);
  assert.doesNotMatch(result.text, /\*\*|再入力を求めず|補ってはいけません/);
  assert.doesNotMatch(result.text, /profile:fictional-a|sourceIds|月3000円|年齢|男性|住所/);
  assert.deepEqual(result.sourceIds, ["profile:fictional-a"]);
});

test("selected indexes are bounded, deduplicated and rendered in priority order", () => {
  const guidance = buildCandidateChatGuidance(context([profile({})]), "不足は？");
  const result = renderCandidateChatChecks(guidance, [2, 0, 2, -1, 999, NaN, 1.5]);
  assert.match(result.text, /^はい。まず次の2点/);
  assert.ok(result.text.indexOf(guidance.checks[0].field) < result.text.indexOf(guidance.checks[2].field));
  const fallback = renderCandidateChatChecks(guidance, [-1, 99]);
  assert.match(fallback.text, /^はい。まず次の3点/);
});

test("no definite additional information is invented for complete or unavailable records", () => {
  for (const selected of [context([profile(completeFacts)]), context()]) {
    const result = renderCandidateChatChecks(buildCandidateChatGuidance(selected, "不足は？"));
    assert.match(result.text, /追加すべき情報を特定できません/);
    assert.doesNotMatch(result.text, /情報は十分です|不足はありません|必須です/);
    assert.deepEqual(result.sourceIds, []);
  }
});

test("focused additions questions do not lead with unrelated high-priority conditions", () => {
  const selected = context([profile({ "希望単価": "3000円", "営業経験・職歴": "テレアポ経験あり", "実績": "営業会社で1位", "週の稼働日数": "週5日", "月間稼働時間": "月80時間" })]);
  const career = buildCandidateChatGuidance(selected, "職歴に何を追記すべき？");
  assert.deepEqual(career.checks.map(check => check.field), ["営業経験・職歴"]);
  assert.doesNotMatch(renderCandidateChatChecks(career).text, /希望単価/);
  const pay = buildCandidateChatGuidance(selected, "報酬の情報は足りる？");
  assert.deepEqual(pay.checks.map(check => check.field), ["希望単価"]);
  const schedule = buildCandidateChatGuidance(selected, "稼働時間と曜日の不足は？");
  assert.deepEqual(schedule.checks.map(check => check.field), ["希望時間帯"]);
  const interview = buildCandidateChatGuidance(selected, "面談日程で追記することは？");
  assert.deepEqual(interview.checks.map(check => check.field), ["面談可能日"]);
  const results = buildCandidateChatGuidance(selected, "実績には何を追記したらいい？");
  assert.deepEqual(results.checks.map(check => check.field), ["実績"]);
});

test("ambiguous followups preserve the previous user focus without trusting assistant facts", () => {
  const selected = context([profile({ "希望単価": "3000円", "営業経験・職歴": "テレアポ経験あり" })]);
  const guidance = buildCandidateChatGuidance(selected, "それ詳しく", [
    { role: "user", content: "職歴に何を追記すべき？" },
    { role: "assistant", content: "希望単価は時給9000円です" },
  ]);
  assert.equal(guidance.intent, "missing-information");
  assert.deepEqual(guidance.checks.map(check => check.field), ["営業経験・職歴"]);
});

test("other additions exclude exact previously displayed questions but detailed followups retain them", () => {
  const selected = context([profile({})]);
  const first = buildCandidateChatGuidance(selected, "何か入れるべき情報ある？");
  const displayed = renderCandidateChatChecks(first);
  const history = [{ role: "user" as const, content: "何か入れるべき情報ある？" }, { role: "assistant" as const, content: displayed.text }];
  const more = buildCandidateChatGuidance(selected, "他には？", history);
  assert.ok(more.checks.length > 0);
  assert.ok(more.checks.every(check => !displayed.text.includes(check.question)));
  const detail = buildCandidateChatGuidance(selected, "それ詳しく", history);
  assert.deepEqual(detail.checks, first.checks);
  // Collect every remaining round; a shown suggestion never becomes a confirmed fact.
  const cumulative = [...history];
  let latest = more;
  for (let index = 0; latest.checks.length && index < 8; index++) {
    cumulative.push({ role: "assistant", content: latest.checks.map(check => check.question).join("\n") });
    latest = buildCandidateChatGuidance(selected, "他には？", cumulative);
  }
  assert.deepEqual(latest.checks, []);
  assert.match(renderCandidateChatChecks(latest).text, /これまで提示した以外/);
  assert.doesNotMatch(renderCandidateChatChecks(latest).text, /不足はありません|すべて解消/);
  const incorrectSummary = buildCandidateChatGuidance(selected, "他には？", [
    { role: "user", content: "不足は？" }, { role: "assistant", content: "この方は営業経験が3年あります。" },
  ]);
  assert.equal(incorrectSummary.checks.length, 5);
});
