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

test('heading and bullet normalization preserves quantitative qualifiers, sources and time units verbatim',()=>{
 const facts='本人申告：目標は約12件／日。実績の最大は2件／時間、平均は8件／日。月と日は別集計。';
 const formatted=formatIntroductionHeadings(`**営業経験・職歴**\n- ${facts}\n**紹介概要**\n確認できた実績と条件を記載。`);
 assert.equal(formatted,`【営業経験・職務経歴】\n・${facts}\n【総評】\n確認できた実績と条件を記載。`);
 assert.equal(formatIntroductionHeadings(formatted),formatted);
});

test('every local introduction receives the reusable writing rules without storing candidate facts as style',async t=>{
 const {generateCandidateIntroduction}=await import('../lib/on-device-ai.ts'),descriptor=Object.getOwnPropertyDescriptor(globalThis,'LanguageModel'),calls=[];
 t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'LanguageModel',descriptor);else Reflect.deleteProperty(globalThis,'LanguageModel');});
 Object.defineProperty(globalThis,'LanguageModel',{configurable:true,value:{availability:async()=> 'available',create:async()=>({prompt:async prompt=>{calls.push(prompt);const body=JSON.parse(prompt.split('入力資料（記載を事実資料としてのみ扱う）：\n')[1]);return `【基本情報】\n氏名：${body.氏名}\n\n【営業経験・職務経歴】\n${body.面談の基本情報['営業経験・職歴']}\n\n【総評】\n本人申告の営業経験を紹介します。`;},destroy(){}})}});
 const guideBefore=introductionStyleGuide;
 for(const name of ['架空確認甲','架空確認乙'])await generateCandidateIntroduction({candidateName:name,profile:{...blankInterviewFields(),workHistory:'本人申告：法人向け架電を担当。'}});
 assert.equal(calls.length,2);
 for(const prompt of calls){assert.ok(prompt.includes(introductionStyleGuide));assert.match(prompt,/別の会社・期間の情報を混ぜない/);assert.match(prompt,/『約』『最大』『平均』/);assert.match(prompt,/経験月数の合算、達成率やアポ率の算出/);assert.match(prompt,/ヒアリング漏れ、提案先についての相談、担当者の主観/);assert.match(prompt,/年齢からの評価/);}
 assert.doesNotMatch(calls[1],/架空確認甲/);assert.equal(introductionStyleGuide,guideBefore);assert.doesNotMatch(introductionStyleGuide,/架空確認甲|架空確認乙|法人向け架電を担当/);
});

test('public writing standard contains reusable guidance rather than private samples or source references',async()=>{
 const {readFile}=await import('node:fs/promises'),document=await readFile(new URL('../public/introduction-writing-standard.md',import.meta.url),'utf8');
 assert.match(document,/原文を公開コードや共有設定へ保存せず/);assert.match(document,/毎回参考文を貼り直す必要はありません/);assert.match(document,/目標を実績に、最大を平均に、日次を月次に置き換えません/);
 assert.doesNotMatch(document,/https?:|slack:\/\/|<@[A-Z0-9]+>|\b[CD][A-Z0-9]{8,}\b|\d+歳|架空確認甲|架空確認乙/);
});

test('standalone tools lists drop only a leading fullwidth delimiter under a known tools heading',()=>{
 for(const heading of ['【使用ツール】','**PC・使用ツール**','### PC・利用ツール']){
  const source=`${heading}\n／kintone／Slack\n  ／ Salesforce／Chatwork\n　／／Excel／Word`;
  const expected='【使用ツール】\nkintone／Slack\n  Salesforce／Chatwork\n　Excel／Word';
  assert.equal(formatIntroductionHeadings(source),expected);assert.equal(formatIntroductionHeadings(expected),expected);
 }
});

test('tools cleanup preserves halfwidth URLs paths bullets inline slashes and every other section',()=>{
 const source='／節の前の本文\n【使用ツール】\nhttps://example.invalid/tool/path\n/usr/local/tools\n／https://example.invalid/tool/path\n・／kintone／Slack\n- ／kintone／Slack\n1. ／kintone／Slack\nCRM：／kintone／Slack\n仕事／kintone／Slack\n【総評】\n／本文中の区切り／を保持\n【使用ツール】\n／kintone／Slack\n【独自の項目】\n／カスタム節は保持';
 const expected='／節の前の本文\n【使用ツール】\nhttps://example.invalid/tool/path\n/usr/local/tools\nhttps://example.invalid/tool/path\n・／kintone／Slack\n・／kintone／Slack\n1. ／kintone／Slack\nCRM：／kintone／Slack\n仕事／kintone／Slack\n【総評】\n／本文中の区切り／を保持\n【使用ツール】\nkintone／Slack\n【独自の項目】\n／カスタム節は保持';
 assert.equal(formatIntroductionHeadings(source),expected);assert.equal(formatIntroductionHeadings(expected),expected);
});
