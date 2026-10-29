import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blankInterviewFields, linkedCandidateProfile, composeCandidateIntroduction, normalizeInterviewFields, unicodeLength,
  introductionLimit, interviewStringFields, interviewFieldLimits, crmOptions, chatOptions } from "../lib/candidate-intake.ts";

test("profile prefill requires the exact record owner and authoritative profile ID",()=>{
 const make=(profileId:string,playerId='ND-001',recordIds=['record-a'])=>({profileId,playerId,recordIds,version:profileId,updatedAt:'2026-10-30T00:00:00Z',fields:blankInterviewFields(),introduction:''});
 const stale=make('stale'),current=make('current'),foreign=make('current','ND-002'),outside=make('current','ND-001',['outside']);
 const profiles=[stale,foreign,outside,current],record={recordId:'record-a',playerId:'ND-001',profileId:'current'};
 const before=JSON.stringify(profiles);assert.equal(linkedCandidateProfile(profiles,record),current);assert.equal(JSON.stringify(profiles),before);
 assert.equal(linkedCandidateProfile([stale,foreign,outside],record),undefined);
 assert.equal(linkedCandidateProfile(profiles,undefined),undefined);
});

test("legacy rows can prefill only one linked profile and never choose the first ambiguous profile",()=>{
 const make=(profileId:string)=>({profileId,playerId:'ND-001',recordIds:['record-a'],version:profileId,updatedAt:'2026-10-30T00:00:00Z',fields:blankInterviewFields(),introduction:''});
 const a=make('a'),b=make('b'),record={recordId:'record-a',playerId:'ND-001'};
 assert.equal(linkedCandidateProfile([a],record),a);assert.equal(linkedCandidateProfile([a,b],record),undefined);
 assert.equal(linkedCandidateProfile([b,a],record),undefined);assert.equal(linkedCandidateProfile([],record),undefined);
});

test("browser intake limits and multiple-choice schemas match the Apps Script source contract",()=>{
 const source=readFileSync(new URL("../google-apps-script/Code.gs",import.meta.url),"utf8");
 const limitsLiteral=source.match(/var INTERVIEW_FIELD_LIMITS=(\{[^;]+\});/)?.[1];
 assert.ok(limitsLiteral,"Apps Script must define an intake field limit contract");
 const limits=JSON.parse(limitsLiteral.replace(/([A-Za-z][A-Za-z0-9]*):/g,'"$1":'));
 assert.deepEqual(limits,interviewFieldLimits);
 assert.deepEqual(Object.keys(limits).sort(),[...interviewStringFields].sort());
 for(const [key,options] of [["INTERVIEW_CRM_TOOLS",crmOptions],["INTERVIEW_CHAT_TOOLS",chatOptions]] as const){
  const literal=source.match(new RegExp(`var ${key}=(\\[[^;]+\\]);`))?.[1];
  assert.ok(literal,`Apps Script must define ${key}`);
  assert.deepEqual(JSON.parse(literal.replaceAll("'",'"')),options);
 }
});

test("new candidate forms do not share tool selections and normalization retains source text", () => {
  const first = blankInterviewFields(), second = blankInterviewFields();
  first.crmTools.push("kintone");
  assert.deepEqual(second.crmTools, []);
  const original = "営業経験を本人確認済み\r\n" + "経歴".repeat(3500);
  const result = normalizeInterviewFields({ workHistory: original, desiredHourlyRate: "2,000円/時", unknown: "discard",
    crmTools: ["Salesforce", "Salesforce", 12, " kintone "] });
  assert.equal(result.workHistory, original.replace(/\r\n/g, "\n"));
  assert.equal(result.desiredHourlyRate, "2,000円/時");
  assert.deepEqual(result.crmTools, ["Salesforce", "kintone"]);
  assert.equal(Object.hasOwn(result, "unknown"), false);
  assert.equal(interviewStringFields.length, 24);
  const privateNotes=normalizeInterviewFields({interviewMemo:"本人に確認するメモ",selfReflection:"聞き方の振り返り",interviewAdvice:"確認して保存した準備案"});
  assert.equal(privateNotes.interviewMemo,"本人に確認するメモ");
  assert.equal(privateNotes.selfReflection,"聞き方の振り返り");
  assert.equal(privateNotes.interviewAdvice,"確認して保存した準備案");
  assert.doesNotMatch(composeCandidateIntroduction("架空の候補者",privateNotes).text,/本人に確認するメモ|聞き方の振り返り|確認して保存した準備案/);
});

test("a factual introduction retains units and no assessment is invented from age or gender", () => {
  const fields = { ...blankInterviewFields(), age: "40", gender: "回答しない", residence: "架空県",
    desiredHourlyRate: "2,000円/時", workHistory: "法人向けの架電を6か月担当。", achievements: "本人申告：アポ3件。",
    strengths: "本人申告：記録をこまめに残す。", crmTools: ["Salesforce", "HubSpot", "その他"], crmOther: "社内CRM",
    chatTools: ["Chatwork"], interviewAvailability: "平日午後。要調整。" };
  const result = composeCandidateIntroduction("架空の候補者", fields);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.omittedFields, []);
  assert.match(result.text, /希望単価：2,000円\/時/);
  assert.match(result.text, /CRM：Salesforce・HubSpot・その他：社内CRM/);
  assert.match(result.text, /本人申告：アポ3件。/);
  assert.ok(result.text.indexOf("【基本情報】") < result.text.indexOf("【営業経験・職務経歴】"));
  assert.ok(result.text.indexOf("【営業経験・職務経歴】") < result.text.indexOf("【営業における強み】"));
  assert.ok(result.text.indexOf("【営業における強み】") < result.text.indexOf("【使用ツール】"));
  assert.ok(result.text.indexOf("【使用ツール】") < result.text.indexOf("【面談可能日】"));
  assert.doesNotMatch(result.text, /おすすめ|推薦|優秀|適性|即戦力|AI/);
});

test("missing information stays absent rather than becoming a plausible-sounding fact", () => {
  assert.deepEqual(composeCandidateIntroduction("", blankInterviewFields()), { text: "", truncated: false, omittedFields: [] });
  const result = composeCandidateIntroduction("架空の候補者", { ...blankInterviewFields(), crmOther: "独自ツール" });
  assert.match(result.text, /その他：独自ツール/);
  assert.doesNotMatch(result.text, /年齢|性別|居住地|強み|経験豊富|未確認/);
  assert.deepEqual(result.omittedFields, []);
});

test("long Unicode source fits the budget, keeps each populated section and explicitly reports shortening", () => {
  const fields = blankInterviewFields();
  for (const key of interviewStringFields) fields[key] = "確認済みの入力🧑‍💻".repeat(key === "workHistory" ? 700 : 100);
  fields.crmTools = ["Salesforce", "kintone"];
  fields.chatTools = ["Slack", "Chatwork"];
  const source = JSON.stringify(fields), result = composeCandidateIntroduction("架空の候補者🧑‍💻", fields);
  assert.ok(unicodeLength(result.text) <= introductionLimit);
  assert.equal(result.truncated, true);
  assert.ok(result.omittedFields.includes("workHistory"));
  assert.ok(result.omittedFields.includes("crmOther"));
  for (const section of ["基本情報", "営業経験・職務経歴", "営業における強み", "使用ツール", "面談可能日"]) assert.ok(result.text.includes(`【${section}】`));
  assert.equal(JSON.stringify(fields), source);
  assert.doesNotMatch(result.text, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  assert.deepEqual(composeCandidateIntroduction("架空の候補者🧑‍💻", fields), result);
});

test("private attendance concerns, original notes and saved AI work stay in source but never enter client introductions",()=>{
 const olderFields={workHistory:"法人営業を担当。",interviewAvailability:"平日午後"};
 assert.equal(normalizeInterviewFields(olderFields).additionalNotes,"");
 assert.equal(blankInterviewFields().additionalNotes,"");
 const notes="元シート21行：本人から追加説明あり。\n元シート22行：条件は次回確認。";
 const fields={...normalizeInterviewFields(olderFields),additionalNotes:notes,attendanceConcerns:"社内だけで確認する稼働上の配慮",interviewMemo:"社内面談メモの原文",selfReflection:"担当者自身の振り返り原文",interviewAdvice:"以前のAIによる準備案"};
 const original=JSON.stringify(fields);
 const result=composeCandidateIntroduction("架空の候補者",fields);
 assert.equal(result.truncated,false);assert.doesNotMatch(result.text,/補足|元シート|社内だけ|社内面談メモ|担当者自身|以前のAI/);
 assert.match(result.text,/法人営業を担当/);assert.match(result.text,/平日午後/);
 assert.equal(JSON.stringify(fields),original);
 assert.equal(fields.additionalNotes,notes);assert.doesNotMatch(result.text,/おすすめ|優秀|即戦力/);
 const long={...fields,additionalNotes:"補".repeat(2000)};
 const assembled=composeCandidateIntroduction("架空の候補者",long);
 assert.equal(long.additionalNotes.length,2000);assert.ok(!assembled.omittedFields.includes("additionalNotes"));
 assert.equal(assembled.text,result.text);assert.ok(unicodeLength(assembled.text)<=1000);
 const empty=composeCandidateIntroduction("",{...blankInterviewFields(),attendanceConcerns:fields.attendanceConcerns,additionalNotes:notes});
 assert.equal(empty.text,"");assert.equal(empty.truncated,false);
});

test("private candidate formatting never adds an external request or an AI execution claim", () => {
  const component = readFileSync(new URL("../components/candidate-intake.tsx", import.meta.url), "utf8");
  const utility = readFileSync(new URL("../lib/candidate-intake.ts", import.meta.url), "utf8");
  assert.doesNotMatch(component + utility, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|generativelanguage|api[_-]?key/i);
  assert.match(component, /入力から整形/);
  assert.match(component, /現在の編集文/);
  assert.match(component, /外部AIには送信しません/);
});
