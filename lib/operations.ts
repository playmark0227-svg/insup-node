import {parseTeamWorkspaceExport} from "./team-workspace.ts";
import {parseRewards} from "./rewards.ts";
import {safeMigrationAttachmentUrl,validSlackThreadId} from "./migration.ts";
import {validMetricGoal, type MetricGoal} from "./metric-goals.ts";
import {parseSalesWorkflow, type WorkJob, type ProposalPlan, type MatchReport} from "./sales-workflow.ts";
import {parseIntroductionV2Profile, parseIntroductionV2Settings, type IntroductionV2Profile, type IntroductionV2Settings} from "./introduction-v2.ts";
export type ManagedAccount = {id:string;name:string;team:string;role:"admin"|"player";active:boolean;sheetNames:string[];target:number;version:string;hasCredentials:boolean};
export type AccountManagement = {checkedAt:string;accounts:ManagedAccount[];canManageAccounts:boolean};
export type AccountAction = "stop"|"resume"|"revokeSessions";
export type AccountCommand = {playerId:string;action:AccountAction;expectedVersion:string};
export type AccountResult = {managed:true;operationId:string;playerId:string;action:AccountAction;active:boolean;version:string;replayed:boolean};
export type OperationEntry = {row:number;committedAt:string;actorId:string;action:string;summary:string};
export type OperationHistory = {checkedAt:string;entries:OperationEntry[];nextCursor:number|null};
export type OperationalRead = <T>(action:"readAccountManagement"|"readOperationHistory"|"readDataExport",payload?:unknown)=>Promise<T>;

const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
export function assertAccountManagement(value:unknown):asserts value is AccountManagement {
 if(!object(value)||typeof value.canManageAccounts!=="boolean"||typeof value.checkedAt!=="string"||!Array.isArray(value.accounts)||value.accounts.length>1000)throw new Error("利用状況を確認できませんでした。再取得してください。");
 const ids=new Set<string>();
 for(const a of value.accounts){if(!object(a)||typeof a.id!=="string"||!a.id||ids.has(a.id)||typeof a.name!=="string"||typeof a.team!=="string"||!["admin","player"].includes(String(a.role))||typeof a.active!=="boolean"||typeof a.version!=="string"||!a.version||typeof a.hasCredentials!=="boolean"||!Number.isSafeInteger(a.target)||!Array.isArray(a.sheetNames)||a.sheetNames.some(v=>typeof v!=="string"))throw new Error("利用状況の形式を確認できませんでした。");ids.add(a.id);}
}
export function assertAccountResult(value:unknown,command:AccountCommand,operationId:string):asserts value is AccountResult {
 if(!object(value)||value.managed!==true||value.operationId!==operationId||value.playerId!==command.playerId||value.action!==command.action||typeof value.active!=="boolean"||typeof value.version!=="string"||typeof value.replayed!=="boolean")throw new Error("操作結果を確認できませんでした。同じ操作で結果を確認してください。");
}
export function assertOperationHistory(value:unknown):asserts value is OperationHistory {
 if(!object(value)||typeof value.checkedAt!=="string"||!Array.isArray(value.entries)||value.entries.length>50||!(value.nextCursor===null||Number.isSafeInteger(value.nextCursor)&&Number(value.nextCursor)>=2))throw new Error("操作履歴の形式を確認できませんでした。");
 for(const row of value.entries)if(!object(row)||!Number.isSafeInteger(row.row)||Number(row.row)<2||["committedAt","actorId","action","summary"].some(k=>typeof row[k]!=="string"))throw new Error("操作履歴を確認できませんでした。");
}

/** Export parsers may not silently drop a new/unknown field from a backup. */
function assertExportShape(raw:unknown,parsed:unknown):void {
 if(Array.isArray(parsed)){if(!Array.isArray(raw)||raw.length!==parsed.length)throw new Error("書き出しデータの配列を確認できませんでした。");parsed.forEach((value,index)=>assertExportShape(raw[index],value));return;}
 if(object(parsed)){if(!object(raw)||Object.keys(raw).length!==Object.keys(parsed).length||Object.keys(raw).some(key=>!Object.prototype.hasOwnProperty.call(parsed,key)))throw new Error("書き出しに想定外の情報、または欠けた項目があります。");for(const [key,value] of Object.entries(parsed))assertExportShape(raw[key],value);return;}
 if(typeof raw!==typeof parsed||raw===null&&parsed!==null)throw new Error("書き出しデータの値を確認できませんでした。");
}
function validateMigrationExport(value:unknown):Record<string,unknown>[] {
 if(!Array.isArray(value)||value.length>5000)throw new Error("移行原文の書き出し件数を確認できませんでした。");
 const fields={id:128,sourceKey:43,workspace:100,channel:100,sourceId:12020,sourceUrl:300,postedAt:40,author:100,body:12000,candidateName:60,state:20,recordId:100,version:128,updatedAt:40,sourceThreadId:40},ids=new Set<string>(),sourceKeys=new Set<string>();
 const timestamp=(text:string,empty=false)=>empty&&text===""||/^\d{4}-\d{2}-\d{2}T/.test(text)&&Number.isFinite(Date.parse(text));
 return value.map(entry=>{
  if(!object(entry)||Object.keys(entry).length!==Object.keys(fields).length+1||Object.keys(entry).some(key=>key!=="attachmentLinks"&&!Object.prototype.hasOwnProperty.call(fields,key)))throw new Error("移行原文の書き出し項目を確認できませんでした。");
  for(const [key,max] of Object.entries(fields))if(typeof entry[key]!=="string"||String(entry[key]).length>max)throw new Error("移行原文の書き出し形式を確認できませんでした。");
  const item=entry as Record<keyof typeof fields,string>;
  if(!/^[A-Za-z0-9_-]{16,128}$/.test(item.id)||!/^[A-Za-z0-9_-]{16,128}$/.test(item.version)||!/^[A-Za-z0-9_-]{43}$/.test(item.sourceKey)||ids.has(item.id)||sourceKeys.has(item.sourceKey)||!item.workspace.trim()||!item.channel.trim()||!item.sourceId.trim()||!item.body.trim()||!["staged","imported","ignored"].includes(item.state)||!timestamp(item.updatedAt)||!timestamp(item.postedAt,true)||item.sourceUrl&&!/^https:\/\/[a-z0-9-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+$/.test(item.sourceUrl)||item.state==="imported"&&!/^[A-Za-z0-9_-]{16,100}$/.test(item.recordId))throw new Error("移行原文の保存状態を確認できませんでした。");
  if(!validSlackThreadId(item.sourceThreadId)||!Array.isArray(entry.attachmentLinks)||entry.attachmentLinks.length>20||new Set(entry.attachmentLinks).size!==entry.attachmentLinks.length||entry.attachmentLinks.some(link=>!safeMigrationAttachmentUrl(link)))throw new Error("移行原文の返信先・添付参照を確認できませんでした。");
  ids.add(item.id);sourceKeys.add(item.sourceKey);return {...item,attachmentLinks:[...entry.attachmentLinks]};
 });
}

export type WorkflowEvidenceExport = {
 evidenceId:string;ownerId:string;recordId:string;profileId:string;kind:"candidate"|"client";
 mime:"image/png"|"image/jpeg"|"image/webp";size:number;status:"pending"|"completed";generation:string;
 createdAt:string;expiresAt:string;completedAt:string;version:string;updatedAt:string;
};
export type WorkflowDataExport = {
 feature:true;schemaVersion:1;scope:"all-saved-private-workflows";
 metricGoals:Array<MetricGoal&{actorId:string}>;
 salesWorkflow:{jobs:WorkJob[];plans:ProposalPlan[];reports:MatchReport[]};
 matchReportComments?:{schemaVersion:1;comments:Array<{commentId:string;reportId:string;parentId:string;authorId:string;body:string;deleted:boolean;version:string;createdAt:string;updatedAt:string}>};
 introductionV2:{drafts:Array<{draftKey:string;playerId:string;profile:IntroductionV2Profile;version:string;updatedAt:string;actorId:string}>;settings:Array<{id:"shared";settings:IntroductionV2Settings;version:string;updatedAt:string;actorId:string}>};
 matchEvidence:{scope:"metadata-only";files:WorkflowEvidenceExport[]};
};
/** Full private business data for an explicitly requested administrator backup.
 * Reject unknown fields; a backup must not silently omit a newly added field. */
export function validateWorkflowDataExport(value:unknown):WorkflowDataExport {
 const bad=():never=>{throw new Error("営業管理・紹介文・合意資料の書き出し形式を確認できませんでした。最新の連携コードで再取得してください。");};
 const exact=(item:unknown,keys:readonly string[]):Record<string,unknown>=>{if(!object(item)||Object.keys(item).length!==keys.length||Object.keys(item).some(key=>!keys.includes(key)))return bad();return item;};
 const rows=(item:unknown):unknown[]=>{if(!Array.isArray(item)||item.length>5000)return bad();return item;};
 const string=(item:unknown,max=200):item is string=>typeof item==="string"&&item.length<=max;
 const id=(item:unknown,empty=false):item is string=>empty&&item===""||typeof item==="string"&&/^[A-Za-z0-9_-]{16,128}$/.test(item);
 const actor=(item:unknown):item is string=>typeof item==="string"&&/^[A-Za-z0-9_-]{1,30}$/.test(item);
 const stamp=(item:unknown,empty=false):item is string=>empty&&item===""||typeof item==="string"&&/^\d{4}-\d{2}-\d{2}T/.test(item)&&Number.isFinite(Date.parse(item));
 const p=exact(value,["feature","schemaVersion","scope","metricGoals","salesWorkflow","introductionV2","matchEvidence",...(object(value)&&Object.hasOwn(value,"matchReportComments")?["matchReportComments"]:[])]);
 if(p.feature!==true||p.schemaVersion!==1||p.scope!=="all-saved-private-workflows")return bad();
 const goalKeys=new Set<string>();
 const metricGoals=rows(p.metricGoals).map(raw=>{
  const goal=exact(raw,["playerId","month","targets","dailyBasis","customBusinessDays","version","updatedAt","actorId"]),actorId=goal.actorId;
  if(!validMetricGoal(goal)||!/^[A-Za-z0-9_-]{43}$/.test(goal.version)||!actor(actorId)||goalKeys.has(`${goal.playerId}:${goal.month}`))return bad();
  goalKeys.add(`${goal.playerId}:${goal.month}`);return {playerId:goal.playerId,month:goal.month,targets:{...goal.targets},dailyBasis:goal.dailyBasis,customBusinessDays:goal.customBusinessDays,version:goal.version,updatedAt:goal.updatedAt,actorId};
 });
 const sales=exact(p.salesWorkflow,["jobs","plans","reports"]);
 const parsedSales=parseSalesWorkflow({feature:true,schemaVersion:1,period:'all',jobs:sales.jobs,plans:sales.plans,reports:sales.reports,companyCounts:[],checkedAt:"1970-01-01T00:00:00.000Z"});
 const salesWorkflow={jobs:parsedSales.jobs,plans:parsedSales.plans,reports:parsedSales.reports};assertExportShape(sales,salesWorkflow);
 const intro=exact(p.introductionV2,["drafts","settings"]),draftKeys=new Set<string>();
 const drafts=rows(intro.drafts).map(raw=>{
  const entry=exact(raw,["draftKey","playerId","profile","version","updatedAt","actorId"]),profile=parseIntroductionV2Profile(entry.profile);
  if(!string(entry.draftKey)||!entry.draftKey||!string(entry.playerId)||!/^ND-\d+$/.test(entry.playerId)||!profile||!string(entry.version)||!/^[A-Za-z0-9_-]{43}$/.test(entry.version)||!stamp(entry.updatedAt)||!actor(entry.actorId)||draftKeys.has(entry.draftKey))return bad();
  assertExportShape(entry.profile,profile);draftKeys.add(entry.draftKey);return {draftKey:entry.draftKey,playerId:entry.playerId,profile,version:entry.version,updatedAt:entry.updatedAt,actorId:entry.actorId};
 });
 const settingRows=rows(intro.settings);if(settingRows.length>1)return bad();
 const settings=settingRows.map(raw=>{
  const entry=exact(raw,["id","settings","version","updatedAt","actorId"]),settings=parseIntroductionV2Settings(entry.settings);
  if(entry.id!=="shared"||!settings||!string(entry.version)||!/^[A-Za-z0-9_-]{43}$/.test(entry.version)||settings.version!==entry.version||!stamp(entry.updatedAt)||!actor(entry.actorId))return bad();
  assertExportShape(entry.settings,settings);return {id:"shared" as const,settings,version:entry.version,updatedAt:entry.updatedAt,actorId:entry.actorId};
 });
 const evidence=exact(p.matchEvidence,["scope","files"]),evidenceIds=new Set<string>();if(evidence.scope!=="metadata-only")return bad();
 const files=rows(evidence.files).map(raw=>{
  const e=exact(raw,["evidenceId","ownerId","recordId","profileId","kind","mime","size","status","generation","createdAt","expiresAt","completedAt","version","updatedAt"]);
  if(!id(e.evidenceId)||evidenceIds.has(e.evidenceId)||!string(e.ownerId)||!/^ND-\d+$/.test(e.ownerId)||!id(e.recordId)||!id(e.profileId,true)||!["candidate","client"].includes(String(e.kind))||!["image/png","image/jpeg","image/webp"].includes(String(e.mime))||typeof e.size!=="number"||!Number.isInteger(e.size)||e.size<1||e.size>5*1024*1024||!["pending","completed"].includes(String(e.status))||!string(e.generation,30)||!stamp(e.createdAt)||!stamp(e.expiresAt)||!stamp(e.completedAt,true)||!id(e.version)||!stamp(e.updatedAt))return bad();
  if(e.status==="pending"&&(e.generation!==""||e.completedAt!=="")||e.status==="completed"&&(!/^[1-9][0-9]{0,29}$/.test(e.generation)||!e.completedAt))return bad();
  evidenceIds.add(e.evidenceId);return {...e} as WorkflowEvidenceExport;
 });
 let matchReportComments:WorkflowDataExport["matchReportComments"];
 if(p.matchReportComments!==undefined){
  const state=exact(p.matchReportComments,["schemaVersion","comments"]),seen=new Set<string>();if(state.schemaVersion!==1)return bad();
  const comments=rows(state.comments).map(raw=>{const c=exact(raw,["commentId","reportId","parentId","authorId","body","deleted","version","createdAt","updatedAt"]);
   if(!id(c.commentId)||seen.has(c.commentId)||!id(c.reportId)||!id(c.parentId,true)||c.parentId===c.commentId||!actor(c.authorId)||!string(c.body,2000)||typeof c.deleted!=="boolean"||c.deleted&&c.body!==""||!c.deleted&&!c.body.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(c.body)||!id(c.version)||!stamp(c.createdAt)||!stamp(c.updatedAt))return bad();
   seen.add(c.commentId);return {commentId:c.commentId,reportId:c.reportId,parentId:c.parentId,authorId:c.authorId,body:c.body,deleted:c.deleted,version:c.version,createdAt:c.createdAt,updatedAt:c.updatedAt};});
  matchReportComments={schemaVersion:1,comments};
 }
 return {feature:true,schemaVersion:1,scope:"all-saved-private-workflows",metricGoals,salesWorkflow,...(matchReportComments?{matchReportComments}:{}),introductionV2:{drafts,settings},matchEvidence:{scope:"metadata-only",files}};
}

/** Export is data for safekeeping, never an executable workbook or credential backup. */
export function validateDataExport(value:unknown):Record<string,unknown> {
 if(!object(value)||value.schemaVersion!==1||value.scope!=="application-data"||typeof value.exportedAt!=="string"||!object(value.snapshot)||!Array.isArray(value.managementTables)||!object(value.limits))throw new Error("書き出しデータの形式を確認できませんでした。");
 const allowed=["workflow","rewards","migrationArchive","schemaVersion","exportedAt","scope","snapshot","managementTables","limits","teamWorkspace"];
 if(Object.keys(value).some(k=>!allowed.includes(k)))throw new Error("書き出しに想定外の情報が含まれています。");
 const forbidden=new Set(["outboxKey","destination","credentials","password","token","deviceToken","pepper","apiKey","authRecord","cacheAccess","secret","uploadUrl","uploadURL","signedUrl","downloadUrl","resumableUrl","base64","bucket","objectName","objectPath"]);
 const stack:{value:unknown;depth:number}[]=[{value,depth:0}];let visited=0;
 while(stack.length){const item=stack.pop()!;if(++visited>1000000||item.depth>32)throw new Error("書き出しデータが上限を超えています。");if(item.value&&typeof item.value==="object")for(const [key,child] of Object.entries(item.value)){if(forbidden.has(key))throw new Error("認証情報を含むデータは書き出せません。");stack.push({value:child,depth:item.depth+1});}}
 if(JSON.stringify(value).length>2000000)throw new Error("書き出しデータが上限を超えています。");
 let result=value;
 if(value.teamWorkspace!==undefined)result={...result,teamWorkspace:parseTeamWorkspaceExport(value.teamWorkspace)};
 if(value.rewards!==undefined){const rewards=parseRewards(value.rewards);assertExportShape(value.rewards,rewards);result={...result,rewards};}
 if(value.migrationArchive!==undefined)result={...result,migrationArchive:validateMigrationExport(value.migrationArchive)};
 if(value.workflow!==undefined)result={...result,workflow:validateWorkflowDataExport(value.workflow)};
 return result;
}
export const accountActionLabels:Record<AccountAction,string>={stop:"利用を停止",resume:"利用を再開",revokeSessions:"全端末からログアウト"};
export const operationLabels:Record<string,string>={saveMetricGoals:"月別・工程別目標",saveWorkJob:"募集案件",saveProposalPlan:"提案予定",recordProposalSent:"提案送付の記録",saveMatchReport:"マッチング報告",saveIntroductionV2:"候補者の紹介文・確認事項",saveIntroductionSettings:"紹介文の共有設定",completeMatchEvidence:"合意確認資料",mutateRewards:"ポイント・特典",stageMigrationBatch:"原文の保管",applyMigrationItem:"過去データの移行",publishTeamCandidate:"紹介文を社内共有",unpublishTeamCandidate:"社内共有を停止",saveTeamComment:"社内コメント",saveTeamJob:"募集案件",saveActivity:"成果登録",updateStatus:"進捗更新",updateProfile:"プロフィール更新",createPlayer:"ID発行",createCandidate:"候補者登録",updateRecord:"候補者の記録更新",deleteCandidate:"候補者削除",cancelAchievement:"成果の取り消し",restoreChange:"変更の復元",saveManagementRow:"管理表更新",saveInterviewReview:"振り返り保存",saveCandidateProfile:"基本情報保存",saveClient:"取引先更新",manageAccount:"利用状況の変更",saveMonthlyTarget:"月別目標の保存"};
