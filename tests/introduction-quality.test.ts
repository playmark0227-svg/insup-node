import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blankInterviewFields,normalizeInterviewFields } from "../lib/candidate-intake.ts";
import { reviewIntroductionSource,reviewIntroductionQuality,introductionEvidenceIssues } from "../lib/introduction-review.ts";
import { buildIntroductionPlan,composeIntroductionPlan,introductionEditorialInstructions } from "../lib/introduction-plan.ts";
import { defaultWritingPreferences } from "../lib/on-device-ai.ts";
const fixtures=JSON.parse(readFileSync(new URL("./fixtures/introduction-quality-cases.json",import.meta.url),"utf8"));

test("five fictional acceptance cases retain material facts without padding or company attribution changes",()=>{
 for(const item of fixtures){
  const raw=normalizeInterviewFields(item.profile),before=structuredClone(raw),review=reviewIntroductionSource(raw,[item.candidateName]),settings={...defaultWritingPreferences(),includeSummary:item.includeSummary!==false};
  const plan=buildIntroductionPlan(item.candidateName,review.fields,settings);
  const bodies:Record<string,string>={};let current="";
  for(const line of item.modelOutput.split("\n")){
   const heading=line.match(/^【(.+)】$/)?.[1];
   if(heading){current=({"営業経験・職務経歴":"experience","営業における強み":"results","総評":"summary"} as Record<string,string>)[heading];bodies[current]="";}
   else if(current)bodies[current]+=(bodies[current]?"\n":"")+line;
  }
  const draft=composeIntroductionPlan(plan,bodies);
  for(const needle of item.mustRetain)assert.ok(draft.includes(needle),`${item.id}: ${needle}`);
  for(const needle of item.mustNotContain)assert.ok(!draft.includes(needle),`${item.id}: ${needle}`);
  assert.deepEqual(introductionEvidenceIssues(draft,item.candidateName,review.fields),[],item.id);
  assert.deepEqual(reviewIntroductionQuality(draft,review.fields,settings).issues,[],item.id);
  assert.ok([...draft].length<=1000,item.id);
  assert.deepEqual(raw,before);
 }
});

test("editorial brief requests complete factual sentences and adapts sparse material without a minimum length",()=>{
 const settings=defaultWritingPreferences(),sparse=buildIntroductionPlan("架空",{...blankInterviewFields(),workHistory:"受付で案内。"},settings);
 const rich=buildIntroductionPlan("架空",{...blankInterviewFields(),workHistory:"法人向けに架電を2年担当。リスト作成とヒアリングを行う。",strengths:"質問をメモに残す。",achievements:"本人申告で月間最大9件の商談設定。"},settings);
 const brief=introductionEditorialInstructions(sparse),long=introductionEditorialInstructions(rich);
 assert.match(brief,/事実が一つしかないときは一文で十分/);assert.match(brief,/自然な丁寧語/);assert.match(brief,/水増ししません/);
 assert.match(long,/複数の事実を読みやすい数文/);assert.match(long,/会社や期間が変わる場所では段落/);assert.match(long,/期間・最大・平均・目標・本人申告/);
 assert.doesNotMatch(brief+long,/最低\d+文字|必ず\d+文字|架電を2年|9件|架空/);
 const plain=introductionEditorialInstructions({...rich,tone:"plain"});assert.match(plain,/簡潔な常体/);assert.doesNotMatch(plain,/自然な丁寧語/);
});

test("a merely shortened rewrite reports missing experience coverage, duration and requested sections",()=>{
 const fields={...blankInterviewFields(),workHistory:"検証A社で法人向けSaaSのテレアポを2年。リスト作成とヒアリング。",strengths:"架電前に事業内容を確認する。"};
 const quality=reviewIntroductionQuality("【営業経験・職務経歴】\n営業を担当していました。",fields,defaultWritingPreferences());
 assert.equal(quality.issues.filter(issue=>issue.code==="missing-section").length,2);
 const coverage=quality.issues.find(issue=>issue.code==="source-coverage");assert.ok(coverage);assert.match(coverage.detail,/法人向け|SaaS/);assert.match(coverage.detail,/検証A社|A社/);
 assert.deepEqual(quality.checkedSections,["営業経験・職務経歴","営業における強み","総評"]);
});

test("complete paraphrases are accepted, note fragments and copied sentences are review prompts",()=>{
 const fields={...blankInterviewFields(),workHistory:"法人向けテレアポを1年。リスト作成。ヒアリング。"},settings={tone:"formal" as const,includeSummary:false};
 const good="【営業経験・職務経歴】\n法人向けの電話による営業を1年間担当していました。リストの作成と、希望の聞き取りを行っています。";
 assert.deepEqual(reviewIntroductionQuality(good,fields,settings).issues,[]);
 const raw="【営業経験・職務経歴】\n法人向けテレアポを1年。リスト作成。ヒアリング。";
 assert.ok(reviewIntroductionQuality(raw,fields,settings).issues.some(issue=>issue.code==="note-fragments"));
 const sentence="法人向けのテレアポを1年間担当していました。";
 const repeated=`【営業経験・職務経歴】\n${sentence}リスト作成とヒアリングを行っています。\n【総評】\n${sentence}`;
 assert.ok(reviewIntroductionQuality(repeated,fields,{...settings,includeSummary:true}).issues.some(issue=>issue.code==="repeated-sentence"));
 assert.ok(!reviewIntroductionQuality(raw,fields,{...settings,tone:"plain"}).issues.some(issue=>issue.code==="note-fragments"));
});

test("editorial checks do not inspect attributes, private notes, unrelated advice or mutate source data",()=>{
 const fields={...blankInterviewFields(),workHistory:"受付で来訪者を案内。",age:"非公開年齢",gender:"非公開属性",residence:"非公開所在地",attendanceConcerns:"家庭の事情",interviewMemo:"担当者の主観",interviewAdvice:"古いAI助言"},before=structuredClone(fields);
 const result=reviewIntroductionQuality("【営業経験・職務経歴】\n受付で来訪者を案内していました。",fields,{tone:"formal",includeSummary:false});
 assert.deepEqual(result.issues,[]);assert.doesNotMatch(JSON.stringify(result),/非公開|家庭の事情|担当者の主観|古いAI助言/);assert.deepEqual(fields,before);
});
