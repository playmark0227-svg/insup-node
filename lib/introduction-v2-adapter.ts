import { blankInterviewFields, interviewFieldLabels, type CandidateProfile, type InterviewFields } from "./candidate-intake.ts";
import { formatIntroductionRate, parseIntroductionV2Profile, type IntroductionV2Profile } from "./introduction-v2.ts";
import { normalizeIntroductionValue } from "./introduction-normalization.ts";
import type { CandidateRecord } from "./sheets-client.ts";

export type IntroductionV2SnapshotEntry = { draftKey:string;playerId:string;recordIds:string[];profile:IntroductionV2Profile;version:string;updatedAt:string };
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);
const sameDisplayName=(a:string,b:string)=>a.normalize("NFKC").replace(/[\s\u3000]/g,"").toLowerCase()===b.normalize("NFKC").replace(/[\s\u3000]/g,"").toLowerCase();
const sameShape=(raw:unknown,parsed:unknown):boolean=>{
 if(Array.isArray(parsed))return Array.isArray(raw)&&raw.length===parsed.length&&parsed.every((value,index)=>sameShape(raw[index],value));
 if(object(parsed))return object(raw)&&Object.keys(raw).length===Object.keys(parsed).length&&Object.keys(parsed).every(key=>Object.hasOwn(raw,key)&&sameShape(raw[key],parsed[key]));
 return Object.is(raw,parsed);
};
/** A private snapshot must prove every record relationship. Names never bind
 * profiles, and a partial or cross-owner group is not accepted as canonical. */
export function parseIntroductionV2SnapshotEntries(value:unknown,records:readonly CandidateRecord[],self:{playerId:string;role:"admin"|"player"}):IntroductionV2SnapshotEntry[]|null {
 if(!Array.isArray(value)||value.length>5000)return null;
 const seen=new Set<string>(),claimed=new Set<string>(),recordIds=new Set<string>();
 for(const record of records){if(recordIds.has(record.recordId))return null;recordIds.add(record.recordId);}
 const result:IntroductionV2SnapshotEntry[]=[];
 for(const raw of value){
  if(!object(raw)||Object.keys(raw).length!==6||Object.keys(raw).some(key=>!["draftKey","playerId","recordIds","profile","version","updatedAt"].includes(key))||typeof raw.draftKey!=="string"||!raw.draftKey||raw.draftKey.length>200||seen.has(raw.draftKey)||typeof raw.playerId!=="string"||!/^ND-\d+$/.test(raw.playerId)||self.role==="player"&&raw.playerId!==self.playerId||!Array.isArray(raw.recordIds)||!raw.recordIds.length||raw.recordIds.length>5000||raw.recordIds.some(id=>typeof id!=="string"||!id||id.length>200)||new Set(raw.recordIds).size!==raw.recordIds.length||typeof raw.version!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(raw.version)||typeof raw.updatedAt!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(raw.updatedAt)||!Number.isFinite(Date.parse(raw.updatedAt)))return null;
  const profile=parseIntroductionV2Profile(raw.profile);if(!profile||!sameShape(raw.profile,profile))return null;const linkedIds=raw.recordIds as string[];
  const bound=records.filter(record=>(record.profileId||record.recordId)===raw.draftKey);
  if(!bound.length||bound.some(record=>record.playerId!==raw.playerId||!sameDisplayName(profile.candidateName,record.candidateName))||bound.length!==linkedIds.length||bound.some(record=>!linkedIds.includes(record.recordId)))return null;
  for(const id of raw.recordIds){if(claimed.has(id))return null;claimed.add(id);}
  seen.add(raw.draftKey);result.push({draftKey:raw.draftKey,playerId:raw.playerId,recordIds:[...raw.recordIds] as string[],profile,version:raw.version,updatedAt:raw.updatedAt});
 }
 return result;
}

const lines=(values:readonly string[])=>values.map(value=>value.trim()).filter(Boolean).join("\n");
const careerHistory=(career:IntroductionV2Profile["careers"][number])=>lines([
 `■${career.company.trim()||"社名未確認"}${career.product.trim()?`／${career.product.trim()}`:""}`,
 career.period.trim()?`期間：${career.period.trim()}`:"期間：未確認",
 career.product.trim()?`商材：${career.product.trim()}`:"商材：未確認",
 career.salesStyle.trim()?`営業スタイル：${career.salesStyle.trim()}`:"営業スタイル：未確認",
 ...career.duties.map(value=>value.trim()?`・${value.trim()}`:""),
]);
/** Read-only adapter for existing filters and objective job-condition checks.
 * It is never saved as CandidateProfile.fields; missing V2 facts stay missing. */
export function introductionV2ToInterviewFields(profile:IntroductionV2Profile):InterviewFields {
 const fields=blankInterviewFields(),basic=profile.basic;
 for(const key of ["age","residence","availableFrom","timeWindow","monthlyHours","pcEnvironment","networkEnvironment"] as const)fields[key]=normalizeIntroductionValue(key,basic[key]).value;
 fields.daysPerWeek=basic.daysPerWeek;fields.sideJob=basic.sideJob;fields.attendanceConcerns=normalizeIntroductionValue("attendanceNote",basic.shareableAttendanceNote).value;
 fields.desiredHourlyRate=basic.desiredRate.amount.trim()?formatIntroductionRate(basic.desiredRate):"";
 fields.workHistory=lines([profile.experienceTotal.trim()?`営業経験の通算：${profile.experienceTotal.trim()}`:"",...profile.careers.map(careerHistory)]);
 fields.achievements=lines(profile.careers.filter(career=>career.achievements.some(value=>value.trim())).map(career=>lines([`■${career.company.trim()||"社名未確認"}${career.product.trim()?`／${career.product.trim()}`:""}`,career.period.trim()?`期間：${career.period.trim()}`:"",...career.achievements])));
 fields.strengths=lines([...profile.tips,...profile.careers.flatMap(career=>career.tips.map(value=>value.trim()?`${career.company.trim()||"社名未確認"}：${value.trim()}`:""))]);
 const tools=[...new Set(profile.tools.map(value=>normalizeIntroductionValue("tool",value).value).filter(Boolean))];
 fields.crmTools=tools.filter(tool=>["Salesforce","kintone","HubSpot"].includes(tool));fields.chatTools=tools.filter(tool=>["Slack","Chatwork"].includes(tool));
 fields.pcSkills=tools.filter(tool=>!fields.crmTools.includes(tool)&&!fields.chatTools.includes(tool)).join("・");
 fields.interviewAvailability=profile.interviewAvailability;
 // gender/workStyle and private legacy notes have no V2 equivalent. Do not
 // fill them from a stale profile or put an internal memo into a shared field.
 return fields;
}

const analysisSources=new WeakMap<CandidateProfile,IntroductionV2SnapshotEntry>();
/** Metadata stays in memory and cannot be serialized into a legacy save. */
export function candidateAnalysisV2Source(profile:CandidateProfile):IntroductionV2SnapshotEntry|undefined{return analysisSources.get(profile);}
export function buildCandidateProfilesForAnalysis(legacy:readonly CandidateProfile[],entries:readonly IntroductionV2SnapshotEntry[],records:readonly CandidateRecord[]):CandidateProfile[]{
 const valid=parseIntroductionV2SnapshotEntries(entries,records,{playerId:"ADMIN",role:"admin"});if(!valid)throw Error("候補者の新しい基本情報と記録の関連を確認できません。最新の情報を取得してください。");
 const claimed=new Set(valid.flatMap(entry=>entry.recordIds));
 const result=legacy.flatMap(profile=>{const recordIds=profile.recordIds.filter(id=>!claimed.has(id));return !recordIds.length?[]:recordIds.length===profile.recordIds.length?[profile]:[{...profile,recordIds}];});
 for(const entry of valid){
  const profile:CandidateProfile={profileId:entry.draftKey,playerId:entry.playerId,recordIds:[...entry.recordIds],version:`analysis-v2:${entry.version}`,updatedAt:entry.updatedAt,fields:introductionV2ToInterviewFields(entry.profile),introduction:""};
  analysisSources.set(profile,entry);result.push(profile);
 }
 return result;
}

export type IntroductionV2ChatSection={id:string;section:"basic"|"career"|"internal";label:string;facts:Array<{label:string;value:string}>};
export function introductionV2ChatSection(id:string):"basic"|"career"|"internal"|null {
 return /^profile-v2:[A-Za-z0-9_-]{43}:basic$/.test(id)?"basic":/^profile-v2:[A-Za-z0-9_-]{43}:career:/.test(id)?"career":/^profile-v2:[A-Za-z0-9_-]{43}:internal$/.test(id)?"internal":null;
}
/** Exact employer-owned source blocks. Generated recommendation/summary copy
 * is deliberately absent. Private notes are separate, owner-local chat evidence. */
export function introductionV2ChatSections(entry:IntroductionV2SnapshotEntry):IntroductionV2ChatSection[]{
 const profile=entry.profile,fields=introductionV2ToInterviewFields(profile),prefix=`profile-v2:${entry.version}`;
 const basicKeys=["age","residence","availableFrom","timeWindow","daysPerWeek","monthlyHours","sideJob","desiredHourlyRate","pcEnvironment","networkEnvironment","attendanceConcerns","interviewAvailability","pcSkills"] as const;
 const basic:IntroductionV2ChatSection={id:`${prefix}:basic`,section:"basic",label:"基本情報（新しい紹介文の入力）",facts:[
  {label:"氏名",value:profile.candidateName},{label:"紹介元",value:profile.source},{label:"ふりがな",value:profile.basic.furigana},
  ...basicKeys.map(key=>({label:interviewFieldLabels[key],value:fields[key]})),{label:"稼働曜日",value:profile.basic.weekdays},{label:"PCカメラの有無",value:profile.basic.pcCamera},
  {label:"営業経験の通算",value:profile.experienceTotal},{label:"CRM",value:fields.crmTools.join("・")},{label:"チャット",value:fields.chatTools.join("・")},
  {label:"成果を出すための工夫",value:lines(profile.tips)},
 ].filter(fact=>fact.value.trim())};
 const careers=profile.careers.map(career=>({id:`${prefix}:career:${career.id}`,section:"career" as const,label:`職歴 · ${career.company.trim()||"社名未確認"}${career.product.trim()?`／${career.product.trim()}`:""}`,facts:[
  {label:"職歴の会社",value:career.company},{label:"商材",value:career.product},{label:"職歴の期間",value:career.period},{label:"営業スタイル",value:career.salesStyle},
  {label:"営業経験・職歴",value:careerHistory(career)},{label:"担当業務",value:lines(career.duties)},{label:"実績",value:lines(career.achievements)},{label:"成果を出すための工夫",value:lines(career.tips)},
 ].filter(fact=>fact.value.trim())}));
 return [basic,...careers,...(profile.internalMemo.trim()?[{id:`${prefix}:internal`,section:"internal" as const,label:"社内メモ（担当者・管理者向け）",facts:[{label:"その他・補足",value:profile.internalMemo}]}]:[])];
}
