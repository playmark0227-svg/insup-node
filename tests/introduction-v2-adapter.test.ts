import test from "node:test";
import assert from "node:assert/strict";
import { blankInterviewFields, type CandidateProfile } from "../lib/candidate-intake.ts";
import { blankIntroductionCareer, blankIntroductionV2Profile } from "../lib/introduction-v2.ts";
import { buildCandidateProfilesForAnalysis, candidateAnalysisV2Source, introductionV2ToInterviewFields, parseIntroductionV2SnapshotEntries, type IntroductionV2SnapshotEntry } from "../lib/introduction-v2-adapter.ts";
import { assertSnapshot, type CandidateRecord, type SheetSnapshot } from "../lib/sheets-client.ts";
import { answerCandidateFacts, buildCandidateChatContext, selectCandidateChatContext } from "../lib/candidate-chat.ts";
import { buildCandidateChatGuidance } from "../lib/candidate-chat-guidance.ts";
import { filterCandidateGroups, groupCandidates } from "../lib/candidate-groups.ts";
import { blankWorkJob, compareCandidateToJob, type WorkJob } from "../lib/sales-workflow.ts";
import { projectSnapshotForCache } from "../lib/snapshot-cache.ts";

const stamp="2026-11-06T09:00:00.000Z",revision="V".repeat(43),profileId="fictional-shared-profile-00001";
function record(id="fictional-record-000001",owner="ND-001"):CandidateRecord {
 const values:CandidateRecord["values"]=Array(26).fill("");values[0]="2026-11-01";values[1]="架空の提案先";values[2]="架空確認甲";
 return {recordId:id,profileId,rowVersion:"row-version",row:2,playerId:owner,candidateName:"架空確認甲",source:"",values,formulaColumns:[]};
}
function entry(records=[record()]):IntroductionV2SnapshotEntry {
 const profile=blankIntroductionV2Profile("架空確認甲");
 Object.assign(profile.basic,{monthlyHours:"月160",daysPerWeek:"週4日",timeWindow:"9001800",pcEnvironment:"win",networkEnvironment:"回線OK",shareableAttendanceNote:"なし",desiredRate:{amount:"2000",unit:"hour",tax:"exclusive"}});
 profile.careers=[{...blankIntroductionCareer("employer-a"),company:"架空A社",product:"機器",period:"2022/4〜2024/3",salesStyle:"BtoB・テレアポ",duties:["架電業務を担当。"],achievements:["本人申告：月間120件の架電、月間8件のアポ。"],tips:["質問項目を通話前に整理する。"]},{...blankIntroductionCareer("employer-b"),company:"架空B社",product:"研修",period:"2024/4〜2025/3",salesStyle:"BtoC・商談",duties:["問い合わせへの応対。"],achievements:["本人申告：年間9件の契約。"],tips:[]}];
 profile.tools=["SF","表計算入力"];profile.internalMemo="本人・担当者だけで確認する架空の内部事情";
 return {draftKey:profileId,playerId:records[0].playerId,recordIds:records.map(r=>r.recordId),profile,version:revision,updatedAt:stamp};
}
function legacy(records=[record()]):CandidateProfile{return {profileId,playerId:"ND-001",recordIds:records.map(r=>r.recordId),version:"legacy-version",updatedAt:stamp,introduction:"過去の生成文章を証拠として使わない",fields:{...blankInterviewFields(),monthlyHours:"40時間",workHistory:"古い職歴の内容",workStyle:"過去の在宅希望",additionalNotes:"旧社内メモ"}};}
function snapshot(records=[record()]):SheetSnapshot{return {self:{playerId:"ND-001",role:"player"},players:[{id:"ND-001",name:"架空担当",target:20,team:"NODE",bio:"",color:"blue"}],activities:[],counts:{},records,syncedAt:stamp,warnings:[],writesEnabled:true,introductionV2Feature:true,candidateIntroductionV2:[entry(records)]};}

test("independent V2 snapshots require owner-safe complete bindings, exact schema and revision",()=>{
 const records=[record(),record("fictional-record-000002")],own=entry(records);assert.deepEqual(parseIntroductionV2SnapshotEntries([own],records,{playerId:"ND-001",role:"player"}),[own]);assert.doesNotThrow(()=>assertSnapshot(snapshot(records)));
 for(const change of [
  (value:any)=>{value.playerId="ND-002";},(value:any)=>{value.recordIds.pop();},(value:any)=>{value.recordIds.push("unlinked");},
  (value:any)=>{value.version="missing-revision";},(value:any)=>{value.profile.candidateName="別の架空候補者";},(value:any)=>{value.profile.unknownPrivateData="not-in-schema";},(value:any)=>{value.unexpected="not-in-schema";},
 ]){const changed=structuredClone(own);change(changed);assert.equal(parseIntroductionV2SnapshotEntries([changed],records,{playerId:"ND-001",role:"player"}),null);}
 assert.equal(parseIntroductionV2SnapshotEntries([own,own],records,{playerId:"ADMIN",role:"admin"}),null);
 const crossOwner=[records[0],{...records[1],playerId:"ND-002"}];assert.equal(parseIntroductionV2SnapshotEntries([own],crossOwner,{playerId:"ADMIN",role:"admin"}),null);
 const disabled=snapshot();delete disabled.introductionV2Feature;assert.throws(()=>assertSnapshot(disabled),{code:"INVALID_RESPONSE"});
 const foreign=snapshot();foreign.candidateIntroductionV2![0].playerId="ND-002";assert.throws(()=>assertSnapshot(foreign),{code:"INVALID_RESPONSE"});
});

test("analysis adapts current V2 facts without changing legacy storage or filling blanks from stale values",()=>{
 const records=[record()],old=legacy(records),before=structuredClone(old),v2=entry(records),profiles=buildCandidateProfilesForAnalysis([old],[v2],records);
 assert.equal(profiles.length,1);const current=profiles[0];assert.equal(current.fields.monthlyHours,"160時間");assert.equal(current.fields.workStyle,"");assert.equal(current.fields.additionalNotes,"");assert.equal(current.fields.interviewMemo,"");assert.equal(current.introduction,"");assert.match(current.version,/^analysis-v2:/);
 assert.ok(current.fields.workHistory.includes("架空A社"));assert.ok(current.fields.achievements.includes("月間120件"));assert.ok(current.fields.achievements.includes("年間9件"));assert.equal(current.fields.pcEnvironment,"Windows");assert.deepEqual(current.fields.crmTools,["Salesforce"]);
 assert.deepEqual(old,before);assert.doesNotMatch(JSON.stringify(profiles),/架空の内部事情|過去の生成文章|旧社内メモ|古い職歴/);assert.ok(candidateAnalysisV2Source(current)?.profile.internalMemo.includes("架空の内部事情"));
 v2.profile.basic.monthlyHours="";assert.equal(buildCandidateProfilesForAnalysis([old],[v2],records)[0].fields.monthlyHours,"");
});

test("search and objective job checks use V2 updates, with unknown values remaining review items",()=>{
 const records=[record()],profiles=buildCandidateProfilesForAnalysis([legacy(records)],[entry(records)],records),groups=groupCandidates(records,"registration-desc");
 assert.equal(filterCandidateGroups(groups,{owner:"all",status:"all",search:"",experienceKeyword:"架空B社"},"2026-11-06",profiles).length,1);
 assert.equal(filterCandidateGroups(groups,{owner:"all",status:"all",search:"古い職歴"},"2026-11-06",profiles).length,0);
 const job={...blankWorkJob(),minMonthlyHours:120,minWeeklyDays:3} as WorkJob;
 assert.equal(compareCandidateToJob(profiles[0].fields,job).find(row=>row.field==="monthlyHours")?.state,"meets");
 const unknown=entry(records);unknown.profile.basic.monthlyHours="";assert.equal(compareCandidateToJob(introductionV2ToInterviewFields(unknown.profile),job).find(row=>row.field==="monthlyHours")?.state,"review");
});

test("chat receives employer-specific source blocks and current conditions, never prior generated copy",()=>{
 const records=[record()],profiles=buildCandidateProfilesForAnalysis([legacy(records)],[entry(records)],records),group=groupCandidates(records,"registration-desc")[0],context=buildCandidateChatContext({group,profiles});
 const careerSources=context.sources.filter(source=>source.id.includes(":career:"));assert.equal(careerSources.length,2);
 assert.match(JSON.stringify(careerSources[0]),/架空A社|120件|8件/);assert.doesNotMatch(JSON.stringify(careerSources[0]),/架空B社|年間9件/);
 assert.match(JSON.stringify(careerSources[1]),/架空B社|年間9件/);assert.doesNotMatch(JSON.stringify(careerSources[1]),/架空A社|120件/);
 assert.match(JSON.stringify(context),/160時間/);assert.doesNotMatch(JSON.stringify(context),/40時間|古い職歴|過去の生成文章|旧社内メモ/);
 const focused=selectCandidateChatContext(context,"架空B社の職歴と実績は？");assert.match(JSON.stringify(focused),/年間9件/);assert.doesNotMatch(JSON.stringify(focused),/120件|架空A社/);
  const direct=answerCandidateFacts(context,"架空B社の実績は？");assert.match(direct.text,/年間9件/);assert.doesNotMatch(direct.text,/120件|架空A社/);
 const missing=buildCandidateChatGuidance(context,"追加入力した方がいい情報は？");assert.equal(missing.checks.some(check=>check.field==="希望単価"||check.field==="希望時間帯"||check.field==="週の稼働日数"),false);
 assert.equal(missing.checks.some(check=>check.field==="営業経験・職歴"&&check.reason.includes("期間が読み取れません")),false);
});

test("local private chat notes remain exact-scope and are only selected for internal-note questions",()=>{
 const own=record(),other=record("fictional-record-other-00001","ND-002");other.profileId="fictional-other-profile-00001";const ownEntry=entry([own]),otherEntry={...entry([other]),draftKey:other.profileId!,profile:{...entry([other]).profile,internalMemo:"別担当者の非公開の原文"}};
 const profiles=buildCandidateProfilesForAnalysis([], [ownEntry,otherEntry],[own,other]),group=groupCandidates([own],"registration-desc")[0],context=buildCandidateChatContext({group,profiles});
 assert.match(JSON.stringify(selectCandidateChatContext(context,"社内メモには何がある？")),/架空の内部事情/);assert.doesNotMatch(JSON.stringify(context),/別担当者の非公開/);
 assert.doesNotMatch(JSON.stringify(selectCandidateChatContext(context,"この候補者の概要をまとめて")),/架空の内部事情/);
});

test("V2 without a legacy profile still becomes an exact linked analysis source and never enters the display cache",()=>{
 const r=record();delete r.profileId;const v2={...entry([r]),draftKey:r.recordId};const profiles=buildCandidateProfilesForAnalysis([], [v2],[r]);assert.equal(profiles[0].profileId,r.recordId);
 const context=buildCandidateChatContext({group:groupCandidates([r],"registration-desc")[0],profiles});assert.ok(context.sources.some(source=>source.id.includes(":career:")));assert.equal(context.identityIssue,undefined);
 const projected=projectSnapshotForCache(snapshot());assert.equal(projected.candidateIntroductionV2,undefined);assert.doesNotMatch(JSON.stringify(projected),/架空の内部事情|120件|V{43}/);
});
