import test from "node:test";
import assert from "node:assert/strict";
import { blankInterviewFields, unicodeLength } from "../lib/candidate-intake.ts";
import { buildIntroductionPlan, composeIntroductionPlan, type IntroductionPlanSettings } from "../lib/introduction-plan.ts";

const settings = (): IntroductionPlanSettings => ({
  sectionOrder: ["basic", "experience", "results", "tools", "availability", "summary"],
  tone: "formal", targetLength: 1000, includeSummary: true,
});

test("fixed facts remain exact while only writing evidence enters the native task", () => {
  const fields = { ...blankInterviewFields(), age: "41歳", gender: "", residence: "架空県みずいろ市",
    availableFrom: "11月下旬（回線準備が完了した場合）", timeWindow: "火・木 10:15〜16:45（休憩を含む）",
    daysPerWeek: "週2日", monthlyHours: "月52.5時間", workStyle: "在宅", desiredHourlyRate: "1,975円／時（税込）",
    sideJob: "勤務時間外に別業務あり", pcEnvironment: "Windows", networkEnvironment: "有線回線",
    pcSkills: "表計算への入力", crmTools: ["kintone", "その他"], crmOther: "独自CRM",
    chatTools: ["Slack", "その他"], chatOther: "独自連絡ツール", interviewAvailability: "11/12 15:30〜16:00（調整中）",
    workHistory: "法人向けに機器の案内を担当。", achievements: "本人申告：月間最大7件。", strengths: "質問を記録する。",
    attendanceConcerns: "社内だけの配慮事項", additionalNotes: "社内用の補足", interviewMemo: "共有しない面談メモ",
    selfReflection: "担当者の反省", interviewAdvice: "過去のAI回答" };
  const before = structuredClone(fields), prefs = settings(), beforePrefs = structuredClone(prefs);
  const plan = buildIntroductionPlan("架空確認丙", fields, prefs);
  assert.deepEqual(plan.narrativeFacts, { 職歴: fields.workHistory, 実績: fields.achievements, 強み: fields.strengths });
  assert.doesNotMatch(JSON.stringify(plan.narrativeFacts), /41歳|架空県|1975|1,975|52.5|配慮|補足|面談メモ|反省|過去のAI/);
  const text = composeIntroductionPlan(plan, { experience: "法人向けに機器を案内していました。", results: "月間最大7件の実績。", summary: "機器の案内を経験しています。" });
  for (const value of [fields.availableFrom, fields.timeWindow, fields.monthlyHours, fields.desiredHourlyRate, fields.interviewAvailability]) assert.ok(text.includes(value));
  assert.match(text, /稼働開始可能日（希望）：11月下旬/); assert.doesNotMatch(text, /稼働開始済み|性別：|社内だけ|面談メモ|過去のAI/);
  assert.match(text, /CRM：kintone\nその他のCRM：独自CRM\nチャット：Slack\nその他のチャット：独自連絡ツール/);
  assert.deepEqual(fields, before); assert.deepEqual(prefs, beforePrefs);
});

test("basic conditions alone produce an immediate factual document without a model narrative", () => {
  const fields = { ...blankInterviewFields(), gender: "回答しない", availableFrom: "即日（希望）", daysPerWeek: "週3日", pcEnvironment: "MacBook" };
  const plan = buildIntroductionPlan("架空確認丁", fields, settings());
  assert.deepEqual(plan.narrativeSections, []); assert.deepEqual(plan.narrativeFacts, {});
  const text = composeIntroductionPlan(plan, { summary: "記載のない営業経験を作る不正な追加" });
  assert.match(text, /氏名：架空確認丁/); assert.match(text, /稼働開始可能日（希望）：即日（希望）/);
  assert.doesNotMatch(text, /総評|職務経歴|強み|性別|不正な追加|記載した基本情報に基づく/);
});

test("provenance is attached only to the narrative fields that contain self reports", () => {
  const plan = buildIntroductionPlan("架空確認戊", { ...blankInterviewFields(), residence: "架空市",
    workHistory: "確認済みの接客経歴。", achievements: "本人申告：月間最大9件の提案。", strengths: "確認事項をメモする。" }, settings());
  assert.equal(plan.attributionNotes.experience, "");
  assert.equal(plan.attributionNotes.results, "実績には本人申告の内容を含みます。");
  assert.equal(plan.attributionNotes.summary, "総評の実績に関する記載には本人申告を含みます。");
  assert.doesNotMatch(plan.fixed.basic, /本人申告/);
  const text = composeIntroductionPlan(plan, { experience: "接客業務を経験。", results: "月間最大9件の提案。", summary: "接客経験と提案実績を記載しています。" });
  assert.match(text, /【営業経験・職務経歴】\n接客業務を経験。/);
  assert.match(text, /【営業における強み】\n実績には本人申告の内容を含みます。/);
  const all = buildIntroductionPlan("架空確認己", { ...blankInterviewFields(), workHistory: "本人申告：架電を担当。", achievements: "本人申告：目標を達成。", strengths: "本人申告：記録を残す。" }, settings());
  assert.equal(all.attributionNotes.experience, "職歴には本人申告の内容を含みます。");
  assert.match(all.attributionNotes.results, /^実績・強みには本人申告/);
  assert.match(all.attributionNotes.summary, /^総評の職歴・実績・強みに関する記載には本人申告/);
});

test("saved order and summary setting control assembly and unsupported bodies cannot alter fixed facts", () => {
  const prefs = { ...settings(), sectionOrder: ["tools", "results", "basic", "availability", "experience", "summary"] as IntroductionPlanSettings["sectionOrder"], includeSummary: false };
  const plan = buildIntroductionPlan("架空確認庚", { ...blankInterviewFields(), pcEnvironment: "Windows", workHistory: "接客を担当。", strengths: "応対内容を記録。" }, prefs);
  assert.deepEqual(plan.narrativeSections, ["results", "experience"]);
  const text = composeIntroductionPlan(plan, { results: "記録を残す。", experience: "接客を担当していました。", summary: "不要な総評", basic: "氏名：別人" } as Parameters<typeof composeIntroductionPlan>[1]);
  assert.ok(text.indexOf("【使用ツール】") < text.indexOf("【営業における強み】"));
  assert.ok(text.indexOf("【基本情報】") < text.indexOf("【営業経験・職務経歴】"));
  assert.match(text, /氏名：架空確認庚/); assert.doesNotMatch(text, /別人|総評|面談可能日/);
  assert.doesNotMatch(composeIntroductionPlan(plan, {}), /職務経歴|強み|総評/);
});

test("fixed values are never shortened even when the plan overflows the saved length", () => {
  const end = "末尾の単価1,975円／時と希望日2027/04/09";
  const fields = { ...blankInterviewFields(), timeWindow: "条件".repeat(310) + end, desiredHourlyRate: "1,975円／時", availableFrom: "2027/04/09（希望）", workHistory: "案内業務を担当。" };
  const plan = buildIntroductionPlan("架空確認辛", fields, { ...settings(), targetLength: 600 });
  assert.equal(plan.overflow, true); assert.ok(plan.budget < 0);
  const text = composeIntroductionPlan(plan, { experience: "案内業務を担当。", summary: "入力した業務経験を紹介します。" });
  assert.ok(unicodeLength(text) > 600); assert.ok(text.includes(fields.timeWindow)); assert.ok(text.includes(end));
  assert.ok(text.includes(fields.desiredHourlyRate)); assert.ok(text.includes(fields.availableFrom)); assert.doesNotMatch(text, /…/);
});

test("narrative budget exactly reserves fixed facts, headings, separators and source notes", () => {
  const plan = buildIntroductionPlan("架空確認壬", { ...blankInterviewFields(), daysPerWeek: "週4日", workHistory: "本人申告の案内経歴", achievements: "本人申告の実績", interviewAvailability: "午後（候補）" }, settings());
  const bodies = Object.fromEntries(plan.narrativeSections.map(id => [id, "文"]));
  const text = composeIntroductionPlan(plan, bodies);
  assert.equal(unicodeLength(text), plan.limit - plan.budget + plan.narrativeSections.length);
  assert.equal(plan.overflow, false); assert.ok(plan.budget > 0);
});

test("plans own their arrays and facts and never borrow a previous candidate's writing", () => {
  const prefs = settings(), first = buildIntroductionPlan("架空確認癸", { ...blankInterviewFields(), workHistory: "最初の候補者の経験。" }, prefs);
  first.sectionOrder.reverse(); first.narrativeFacts.職歴 = "書き換えた計画";
  const next = buildIntroductionPlan("架空確認子", { ...blankInterviewFields(), strengths: "次の候補者の工夫。" }, prefs);
  assert.deepEqual(next.sectionOrder, prefs.sectionOrder); assert.deepEqual(next.narrativeSections, ["results", "summary"]);
  assert.doesNotMatch(JSON.stringify(next), /架空確認癸|最初の候補者|書き換えた計画/);
});

test("exact empty-field markers do not invoke narrative writing but experience denials and genuine prose remain evidence", () => {
  for (const marker of ["未確認", "未記入", "未入力", "記載なし", "情報なし", "空欄", "（未確認）", "【情報無し】", "未確認です。", "これから確認します。", "特になし", "確認中です。", "（未確認でした。）"]) {
    const fields = { ...blankInterviewFields(), workHistory: marker, achievements: marker, strengths: marker };
    const before = structuredClone(fields), plan = buildIntroductionPlan("架空確認丑", fields, settings());
    assert.deepEqual(plan.narrativeSections, []); assert.deepEqual(plan.narrativeFacts, {});
    assert.match(composeIntroductionPlan(plan, {}), /氏名：架空確認丑/); assert.deepEqual(fields, before);
  }
  for (const fact of ["営業未経験。", "未経験", "未確認部分をチェックする業務。", "空欄チェック機能を作成。", "未入力の申請を確認する業務。", "これから確認しますという連絡文を作る業務。"]) {
    const plan = buildIntroductionPlan("架空確認寅", { ...blankInterviewFields(), workHistory: fact }, settings());
    assert.deepEqual(plan.narrativeFacts, { 職歴: fact }); assert.deepEqual(plan.narrativeSections, ["experience", "summary"]);
  }
});
