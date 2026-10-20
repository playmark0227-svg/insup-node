import test from "node:test";
import assert from "node:assert/strict";
import { introductionStyleGuide, formatIntroductionHeadings } from "../lib/introduction-style.ts";
import { blankInterviewFields, composeCandidateIntroduction } from "../lib/candidate-intake.ts";

test("the approved reusable structure is factual guidance without sample candidates or credentials", () => {
  for (const heading of ["基本情報", "営業経験・職務経歴", "営業における強み", "使用ツール", "総評"]) assert.ok(introductionStyleGuide.includes(`【${heading}】`));
  assert.match(introductionStyleGuide, /入力に事実がある場合だけ/);
  assert.doesNotMatch(introductionStyleGuide, /https?:|パスワード|APIキー|\d+歳|株式会社|サンプル太郎/);
});

test("formatting fixes known headings and bullet markers without changing source prose or unknown headings", () => {
  const value = "## 架空の候補者様\n**基本情報・稼働条件**\n氏名：架空の候補者\n###営業経験・職歴\n- 本人申告：架電6か月\n【独自の項目】\n* 内容にある営業経験・職歴という語はそのまま";
  const expected = "## 架空の候補者様\n【基本情報】\n氏名：架空の候補者\n【営業経験・職務経歴】\n・本人申告：架電6か月\n【独自の項目】\n・内容にある営業経験・職歴という語はそのまま";
  assert.equal(formatIntroductionHeadings(value), expected); assert.equal(formatIntroductionHeadings(expected), expected);
});

test("successive candidate introductions reuse the registered structure and retain only their own facts", () => {
  const first = composeCandidateIntroduction("架空候補者一", { ...blankInterviewFields(), workHistory: "会社Aで架電を担当", strengths: "記録の習慣", crmTools: ["Salesforce"] }).text;
  const next = composeCandidateIntroduction("架空候補者二", { ...blankInterviewFields(), workHistory: "会社Bで訪問営業を担当", strengths: "日程の確認", crmTools: ["kintone"] }).text;
  const headings = (text: string) => text.match(/^【.+】$/gmu);
  assert.deepEqual(headings(first), ["【基本情報】", "【営業経験・職務経歴】", "【営業における強み】", "【使用ツール】"]);
  assert.deepEqual(headings(next), headings(first));
  assert.doesNotMatch(next, /架空候補者一|会社A|Salesforce|記録の習慣/);
  assert.match(next, /架空候補者二/); assert.match(next, /会社B/);
});
