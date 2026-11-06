import test from "node:test";
import assert from "node:assert/strict";
import { blankInterviewFields } from "../lib/candidate-intake.ts";
import { normalizeIntroductionValue, introductionStartDateState } from "../lib/introduction-normalization.ts";
import { blankIntroductionCareer, blankIntroductionV2Profile, blankIntroductionV2Settings, composeIntroductionV2,
  compareIntroductionV2Bodies, introductionV2FromLegacy, introductionV2SourceKey, inspectIntroductionV2ClientText,
  parseIntroductionV2Profile, parseIntroductionV2Settings, parseIntroductionRate, suggestIntroductionExperienceTotal,
  type IntroductionV2Profile } from "../lib/introduction-v2.ts";
import { generateIntroductionV2, introductionV2NarrativeIssues } from "../lib/introduction-v2-ai.ts";

// All people, employers, dates, metrics and notes below are synthetic.
function fixture(): IntroductionV2Profile {
  const profile = blankIntroductionV2Profile("架空確認甲");
  profile.source = "架空紹介元";
  Object.assign(profile.basic, { age: "34", residence: "福岡", availableFrom: "2027/12/1", timeWindow: "9001800", monthlyHours: "月160", pcEnvironment: "win", networkEnvironment: "回線OK", shareableAttendanceNote: "なし", desiredRate: { amount: "2000", unit: "hour", tax: "exclusive" } });
  profile.careers = [{ ...blankIntroductionCareer("employer-a"), company: "架空機器会社", product: "機器", period: "2022/4〜2024/3", salesStyle: "BtoB・テレアポ", duties: ["架電業務を担当。"], achievements: ["本人申告：月間120件架電、月間8件のアポイント。"], tips: ["通話の前に質問項目を整理する。", "応対の内容を記録して次の確認に使う。"] }];
  profile.experienceTotal = "2年"; profile.tools = ["SF", "chatwork"];
  profile.internalMemo = "社内限定の原稿確認メモ";
  return profile;
}

test("field-aware normalization covers the supplied formats while preserving raw input", () => {
  for (const [field, raw, expected] of [
    ...["900〜1800", "900-1800", "0900-1800", "９００～１８００", "9-18", "9時から18時", "9001800", "09001800"].map(value => ["timeWindow", value, "9:00〜18:00"]),
    ["timeWindow", "930-1830", "9:30〜18:30"], ["timeWindow", "1800", "18:00"], ["timeWindow", "1800-2000", "18:00〜20:00"],
    ["rate", "2000", "2,000円"], ["rate", "2000円", "2,000円"], ["rate", "1800-2000", "1,800円〜2,000円"],
    ["monthlyHours", "160", "160時間"], ["monthlyHours", "月160", "160時間"], ["age", "34", "34歳"],
    ["residence", "東京", "東京都"], ["residence", "大阪", "大阪府"], ["residence", "福岡", "福岡県"],
    ["availableFrom", "12/1", "12月1日"], ["pcEnvironment", "mac", "Mac"], ["pcEnvironment", "win", "Windows"],
    ["networkEnvironment", "回線OK", "問題なし"], ["attendanceNote", "懸念なし", "特になし"], ["tool", "salesforce", "Salesforce"], ["tool", "SF", "Salesforce"],
  ] as const) {
    const result = normalizeIntroductionValue(field as Parameters<typeof normalizeIntroductionValue>[0], raw);
    assert.equal(result.value, expected, `${field}: ${raw}`); assert.equal(result.raw, raw); assert.notEqual(result.status, "needs-confirmation");
  }
});

test("unlabelled ambiguous values ask instead of picking time or rate; invalid hours retain the exact source", () => {
  for (const input of ["1800-2000", "1800", "9-18"]) assert.equal(normalizeIntroductionValue("freeText", input).status, "needs-confirmation");
  assert.equal(normalizeIntroductionValue("freeText", "900〜1800").value, "9:00〜18:00");
  assert.equal(normalizeIntroductionValue("freeText", "0900-1800").value, "9:00〜18:00");
  assert.equal(normalizeIntroductionValue("freeText", "希望1800").value, "1,800円");
  assert.equal(normalizeIntroductionValue("freeText", "2500-3000").value, "2,500円〜3,000円");
  for (const input of ["2500", "25-30", "18-9", "9960-1830"]) {
    const result = normalizeIntroductionValue("timeWindow", input); assert.equal(result.status, "needs-confirmation"); assert.equal(result.value, input);
  }
  assert.equal(normalizeIntroductionValue("availableFrom", "2/30").status, "needs-confirmation");
});

test("past-date validation uses JST and never supplies an absent year", () => {
  const now = new Date("2026-11-05T16:00:00Z");
  assert.equal(introductionStartDateState("2026/11/5", now), "past");
  assert.equal(introductionStartDateState("2026/11/6", now), "not-past");
  assert.equal(introductionStartDateState("11/5", now), "year-unknown");
  assert.equal(normalizeIntroductionValue("availableFrom", "12/1").value, "12月1日");
});

test("fixed headings, career ownership, numeric periods and source are preserved in both outputs", () => {
  const profile = fixture(), settings = { ...blankIntroductionV2Settings(), sources: ["正式紹介元"], sourceAliases: { 架空紹介元: "正式紹介元" } };
  profile.careers.push({ ...blankIntroductionCareer("employer-b"), company: "架空研修会社", product: "研修", period: "2024/4〜2025/3", salesStyle: "BtoC・商談", duties: ["問い合わせへの応対。"], achievements: ["本人申告：年間9件の契約。"] });
  const before = structuredClone(profile), doc = composeIntroductionV2(profile, settings);
  const headings = [...doc.internalBody.matchAll(/【([^】]+)】/g)].map(match => match[1]);
  assert.deepEqual(headings, ["基本情報", "営業経験・職務経歴", "成果を出すための工夫", "使用ツール・環境", "総評"]);
  assert.equal(doc.headingLine, "架空確認甲（正式紹介元）");
  assert.match(doc.internalBody, /■架空機器会社／機器\n期間：2022\/4〜2024\/3/);
  assert.match(doc.internalBody, /■架空研修会社／研修\n期間：2024\/4〜2025\/3/);
  assert.ok(doc.internalBody.includes(profile.careers[0].achievements[0])); assert.ok(doc.internalBody.includes(profile.careers[1].achievements[0]));
  assert.equal(doc.internalBody, doc.client.body); assert.equal(doc.canCopyClient, true);
  assert.deepEqual(profile, before); assert.doesNotMatch(JSON.stringify(doc), /社内限定の原稿確認メモ/);
  assert.ok(doc.factRefs.some(ref => ref.path === "careers.employer-b.achievements.0"));
});

test("sparse information produces questions and 未確認, without padding or invented evidence", () => {
  const doc = composeIntroductionV2(blankIntroductionV2Profile("架空確認乙"));
  assert.match(doc.internalBody, /年齢：未確認/); assert.match(doc.internalBody, /■社名不明/); assert.match(doc.internalBody, /勤怠懸念：未確認/);
  assert.ok(doc.questions.some(question => question.field === "careers")); assert.ok(doc.questions.some(question => question.field === "tips"));
  assert.ok(doc.volume.bodyChars < 764); assert.equal(doc.canCopyClient, true);
  assert.doesNotMatch(doc.internalBody, /達成|優秀|即戦力|Salesforce|時給|1位|\d+歳/);
});

test("the legacy import retains all private notes without publishing attendance or guessing employers", () => {
  const fields = { ...blankInterviewFields(), attendanceConcerns: "社内限定の稼働確認事項", additionalNotes: "共有禁止の補足情報", interviewMemo: "面談時の内部確認内容", selfReflection: "担当者の内部振り返り", interviewAdvice: "過去の内部AI助言", desiredHourlyRate: "時給2000円（税込）", workHistory: "架空の営業業務を担当。", achievements: "本人申告：7件。" };
  const profile = introductionV2FromLegacy("架空確認丙", fields), doc = composeIntroductionV2(profile);
  assert.equal(profile.basic.shareableAttendanceNote, ""); assert.equal(profile.careers[0].company, "");
  assert.deepEqual(profile.basic.desiredRate, { amount: "2,000円", unit: "hour", tax: "inclusive" });
  for (const privateText of [fields.attendanceConcerns, fields.additionalNotes, fields.interviewMemo, fields.selfReflection, fields.interviewAdvice]) { assert.ok(profile.internalMemo.includes(privateText)); assert.ok(!JSON.stringify(doc).includes(privateText)); }
});

test("client overrides affect only the configured rate and keep candidate expectations intact", () => {
  const profile = fixture(), before = structuredClone(profile), settings = blankIntroductionV2Settings();
  settings.clients = [{ id: "client-a", name: "架空提案先A", mentions: ["@架空宛先"], rate: { amount: "2800", unit: "hour", tax: "inclusive" } }, { id: "client-b", name: "架空提案先B", mentions: [], rate: { amount: "3200", unit: "hour", tax: "exclusive" } }];
  const a = composeIntroductionV2(profile, settings, "client-a"), b = composeIntroductionV2(profile, settings, "client-b");
  assert.match(a.internalBody, /希望単価：2,000円／時（税抜）/); assert.match(a.client.body, /希望単価：2,800円／時（税込）/);
  assert.match(b.client.body, /希望単価：3,200円／時（税抜）/); assert.equal(a.client.mentions, "@架空宛先");
  assert.ok(a.client.text.indexOf(a.client.closing) < a.client.text.indexOf(a.headingLine));
  assert.ok(compareIntroductionV2Bodies(a.internalBody, a.client.body, profile.basic.desiredRate, settings.clients[0].rate));
  assert.equal(compareIntroductionV2Bodies(a.internalBody, a.client.body.replace("34歳", "35歳"), profile.basic.desiredRate, settings.clients[0].rate), false);
  assert.deepEqual(profile, before); assert.equal(composeIntroductionV2(profile, settings, "unknown").canCopyClient, false);
});

test("unknown monetary units or tax are explicit and never inferred from a bare number", () => {
  const profile = fixture(); profile.basic.desiredRate = parseIntroductionRate("2000");
  const doc = composeIntroductionV2(profile);
  assert.match(doc.internalBody, /2,000円（単位未確認）（税区分未確認）/);
  assert.ok(doc.questions.some(question => question.field === "basic.desiredRate.unit")); assert.ok(doc.checks.some(check => check.code === "tax-unknown"));
  assert.equal(parseIntroductionRate("月額120000円（税抜）").unit, "month");
});

test("client copy is blocked for configured terms, private-note leakage and personal reasons", () => {
  const profile = fixture(), settings = blankIntroductionV2Settings(); settings.blockedTerms = ["架空機器会社"];
  const doc = composeIntroductionV2(profile, settings); assert.equal(doc.canCopyClient, false); assert.ok(doc.checks.some(check => check.code === "blocked-term"));
  const clean = blankIntroductionV2Settings();
  assert.ok(inspectIntroductionV2ClientText("社内限定の原稿確認メモを共有", profile, clean).some(check => check.code === "private-memo-leak"));
  profile.basic.shareableAttendanceNote = "持病の治療をしています。";
  assert.equal(composeIntroductionV2(profile, clean).canCopyClient, false);
  profile.internalMemo = "特になし"; profile.basic.shareableAttendanceNote = "なし";
  assert.equal(composeIntroductionV2(profile, clean).canCopyClient, true);
});

test("rank without period or denominator asks specifically instead of inventing a comparison scope", () => {
  const profile = fixture(); profile.careers[0].achievements = ["本人申告：営業1位。母数は未確認。"];
  const doc = composeIntroductionV2(profile);
  assert.ok(doc.questions.some(question => question.field === "careers.employer-a.rankContext"));
  assert.ok(doc.internalBody.includes(profile.careers[0].achievements[0])); assert.doesNotMatch(doc.internalBody, /10人中|月間1位|上位1%/);
});

test("a long truthful career history is not truncated to the advisory length", () => {
  const profile = fixture(); const lastFact = "最後の担当業務は本人申告で記録確認。";
  profile.careers[0].duties = ["本人申告：実際に行った確認の記録。".repeat(90) + lastFact];
  const doc = composeIntroductionV2(profile); assert.ok(doc.volume.bodyChars > 1125); assert.ok(doc.internalBody.includes(lastFact)); assert.doesNotMatch(doc.internalBody, /…/); assert.equal(doc.canCopyClient, true);
});

test("experience totals merge overlapping months and remain an explicit suggestion", () => {
  const profile = fixture(); profile.experienceTotal = "";
  profile.careers = [{ ...blankIntroductionCareer("a"), period: "2023/4〜2025/9" }, { ...blankIntroductionCareer("b"), period: "2020/10〜2023/3" }];
  assert.deepEqual(suggestIntroductionExperienceTotal(profile.careers), { value: "5年", months: 60, careerIds: ["a", "b"] });
  assert.match(composeIntroductionV2(profile).internalBody, /営業経験：未確認/);
  profile.careers[1].period = "2023/4〜2024/3"; assert.equal(suggestIntroductionExperienceTotal(profile.careers)?.months, 30);
  profile.careers[1].period = "期間未確認"; assert.equal(suggestIntroductionExperienceTotal(profile.careers), null);
});

test("persisted v2 schemas whitelist fields and reject duplicate employers or invalid rates", () => {
  const profile = fixture(); assert.deepEqual(parseIntroductionV2Profile({ ...profile, unrelatedPrivateDocument: "discard" }), profile);
  const duplicate = fixture(); duplicate.careers.push({ ...duplicate.careers[0] }); assert.equal(parseIntroductionV2Profile(duplicate), null);
  assert.equal(parseIntroductionV2Profile({ ...profile, basic: { ...profile.basic, desiredRate: { amount: "2000", unit: "anything", tax: "unknown" } } }), null);
  const settings = blankIntroductionV2Settings(); assert.deepEqual(parseIntroductionV2Settings({ ...settings, sourceText: "discard" }), settings);
  assert.equal(parseIntroductionV2Settings({ ...settings, sourceAliases: JSON.parse('{"__proto__":"bad"}') }), null);
  const key = introductionV2SourceKey(profile, settings); profile.careers[0].duties.push("追加の事実"); assert.notEqual(introductionV2SourceKey(profile, settings), key);
});

test("the narrative guard is employer-specific and protects every numerical or uncertain fact", () => {
  assert.deepEqual(introductionV2NarrativeIssues("架電業務を担当していました。", "架電業務を担当。"), []);
  assert.ok(introductionV2NarrativeIssues("架電業務を月120件担当。", "架電業務を担当。").length);
  assert.ok(introductionV2NarrativeIssues("月120件の架電。", "本人申告：月120件の架電。期間未確認。").length);
  assert.ok(introductionV2NarrativeIssues("架空研修会社の架電業務を担当。", "架電業務を担当。", ["架空研修会社"]).includes("employer-mixed"));
  assert.ok(introductionV2NarrativeIssues("Salesforceで架電業務を担当。", "架電業務を担当。").length);
  assert.ok(introductionV2NarrativeIssues("リーダーとして架電業務を担当。", "架電業務を担当。").length);
  assert.ok(introductionV2NarrativeIssues("優秀な人材であり採用すべきです。", "架電業務を担当。").length);
});

test("an unavailable native model yields a usable factual fallback and honestly names its method", async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "LanguageModel");
  try { Object.defineProperty(globalThis, "LanguageModel", { configurable: true, value: undefined }); const result = await generateIntroductionV2(fixture()); assert.equal(result.method, "deterministic"); assert.equal(result.appliedCount, 0); assert.match(result.notice, /AIによる文章生成は行っていません/); assert.ok(result.document.internalBody.includes("月間120件架電")); }
  finally { if (prior) Object.defineProperty(globalThis, "LanguageModel", prior); else Reflect.deleteProperty(globalThis, "LanguageModel"); }
});

test("a valid source atom can be polished while another employer's fabricated statement falls back alone", async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "LanguageModel"); let received = "", destroyed = 0;
  try {
    Object.defineProperty(globalThis, "LanguageModel", { configurable: true, value: { availability: async () => "available", create: async () => ({ prompt: async (prompt: string) => { received = prompt; const input = JSON.parse(prompt.slice(prompt.indexOf('{"atoms"'))); return JSON.stringify({ edits: input.atoms.map((atom: { factId: string; sourceText: string }) => ({ factId: atom.factId, text: atom.factId.includes(".duties.") ? "架電業務を担当していました。" : "Salesforceで月100件成約しました。" })) }); }, destroy: () => { destroyed++; } }) } });
    const result = await generateIntroductionV2(fixture()); assert.equal(result.method, "on-device"); assert.equal(result.appliedCount, 1); assert.ok(result.document.internalBody.includes("架電業務を担当していました。"));
    assert.ok(result.document.internalBody.includes("通話の前に質問項目を整理する。")); assert.doesNotMatch(result.document.internalBody, /100件|成約しました/);
    assert.doesNotMatch(received, /架空確認甲|社内限定|2,000円|34歳|福岡|月間120件/); assert.equal(destroyed, 1);
  } finally { if (prior) Object.defineProperty(globalThis, "LanguageModel", prior); else Reflect.deleteProperty(globalThis, "LanguageModel"); }
});

test("unvalidated or subsequently mutated edits cannot bypass the ordinary renderer", () => {
  const profile = fixture(), doc = composeIntroductionV2(profile, blankIntroductionV2Settings(), "", new Date(), [{ factId: "introduction:careers.employer-a.duties.0", text: "月500件成約しました。" }]);
  assert.doesNotMatch(doc.internalBody, /500件/); assert.ok(doc.checks.some(check => check.code === "narrative-rejected"));
});

test("client rate replacement targets its structured field, even if another field contains similar literal text", () => {
  const profile = fixture(), settings = blankIntroductionV2Settings();
  profile.candidateName = "架空確認・希望単価：2,000円／時（税抜）";
  settings.clients = [{ id: "literal", name: "架空企業", mentions: [], rate: { amount: "$&", unit: "hour", tax: "exclusive" } }];
  const doc = composeIntroductionV2(profile, settings, "literal");
  assert.ok(doc.client.body.includes(`氏名：${profile.candidateName}`)); assert.ok(doc.client.body.includes("\n希望単価：$&／時（税抜）\n"));
  assert.equal(doc.checks.some(check => check.code === "client-fact-mismatch"), false);
  assert.equal(parseIntroductionV2Profile({ ...profile, candidateName: "架空確認\n別人" }), null);
});

test("invisible formatting cannot bypass a configured private term", () => {
  const profile = fixture(), settings = blankIntroductionV2Settings(); settings.blockedTerms = ["共有禁止"];
  assert.ok(inspectIntroductionV2ClientText("共有\u200b禁止の内容", profile, settings).some(check => check.code === "blocked-term"));
  assert.ok(inspectIntroductionV2ClientText("持\u200b病の治療をしています", profile, settings).some(check => check.code === "source-private-detail"));
});
