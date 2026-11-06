/** The shared workspace contains explicit publication copies, never private candidate fields. */
export type TeamPlayer = {id:string;name:string;role:"admin"|"player"};
export type TeamCandidatePublication = {
  publicationId:string;ownerId:string;candidateName:string;introduction:string;
  published:boolean;version:string;createdAt:string;updatedAt:string;publishedAt:string;canManage:boolean;
  /** These source references are returned only to the owner or an administrator. */
  sourceRecordId?:string;sourceProfileId?:string;sourceRowVersion?:string;sourceProfileVersion?:string;
};
export const teamJobStatuses = ["open","paused","closed"] as const;
export type TeamJobStatus = typeof teamJobStatuses[number];
export type TeamJob = {jobId:string;company:string;title:string;description:string;requirements:string;workConditions:string;
  status:TeamJobStatus;version:string;createdBy:string;updatedBy:string;createdAt:string;updatedAt:string};
export type TeamComment = {commentId:string;publicationId:string;parentId:string;authorId:string;body:string;mentionIds:string[];
  deleted:boolean;version:string;createdAt:string;updatedAt:string;canManage:boolean};
export type TeamWorkspaceData = {feature:true;candidates:TeamCandidatePublication[];jobs:TeamJob[];comments:TeamComment[];players:TeamPlayer[]};
/** Administrator archive, including withdrawn publications. Deleted comment prose stays redacted. */
export type TeamWorkspaceExport = Omit<TeamWorkspaceData,"players"> & {scope:"all-saved-internal-shares";deletedCommentBodiesRedacted:true;players:(TeamPlayer&{active:boolean})[]};
export type PublishTeamCandidateInput = {recordId:string;rowVersion:string;profileVersion:string;publicationId?:string;version?:string;confirmPublication:true};
export type UnpublishTeamCandidateInput = {publicationId:string;version:string};
export type SaveTeamCommentInput = {publicationId:string;commentId?:string;version?:string;body?:string;parentId?:string;mentionIds?:string[];deleted?:boolean};
export type SaveTeamJobInput = Pick<TeamJob,"company"|"title"|"description"|"requirements"|"workConditions"|"status"> & {jobId?:string;version?:string};

const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("社内共有データの形式を確認できませんでした。");return value as Record<string,unknown>;};
const text=(value:unknown,max:number,required=false):string=>{if(typeof value!=="string"||value.length>max||required&&!value.trim())throw new Error("社内共有データの項目を確認できませんでした。");return value;};
const publicationText=(value:unknown):string=>{const result=text(value,40000,true);if(Array.from(result).length>20000)throw new Error("社内共有の紹介文が20,000文字を超えています。");return result;};
const id=(value:unknown)=>{const result=text(value,128,true);if(!/^[A-Za-z0-9_-]{16,128}$/.test(result))throw new Error("社内共有データの管理IDを確認できませんでした。");return result;};
const account=(value:unknown)=>{const result=text(value,30,true);if(!/^[A-Za-z0-9_-]{1,30}$/.test(result))throw new Error("社内共有データの担当者を確認できませんでした。");return result;};
const flag=(value:unknown)=>{if(typeof value!=="boolean")throw new Error("社内共有データの状態を確認できませんでした。");return value;};
const timestamp=(value:unknown,empty=false)=>{const result=text(value,40,!empty);if(result&&(!/^\d{4}-\d{2}-\d{2}T/.test(result)||!Number.isFinite(Date.parse(result))))throw new Error("社内共有データの更新日を確認できませんでした。");return result;};
const array=(value:unknown)=>{if(!Array.isArray(value)||value.length>5000)throw new Error("社内共有データの件数を確認できませんでした。");return value as unknown[];};
/** Build a fresh finite object: unknown backend fields cannot enter the shared UI or AI context. */
function parseWorkspace(value:unknown,includeWithdrawnComments:boolean):TeamWorkspaceData {
 const raw=object(value);if(raw.feature!==true)throw new Error("社内共有機能の連携コードを更新してください。");
 const candidates=array(raw.candidates).map(value=>{const p=object(value),candidate:TeamCandidatePublication={publicationId:id(p.publicationId),ownerId:account(p.ownerId),candidateName:text(p.candidateName,60,true),introduction:publicationText(p.introduction),published:flag(p.published),version:id(p.version),createdAt:timestamp(p.createdAt),updatedAt:timestamp(p.updatedAt),publishedAt:timestamp(p.publishedAt,true),canManage:flag(p.canManage)};
  if(candidate.canManage){if(p.sourceRecordId!==undefined)candidate.sourceRecordId=id(p.sourceRecordId);if(p.sourceProfileId!==undefined)candidate.sourceProfileId=id(p.sourceProfileId);if(p.sourceRowVersion!==undefined)candidate.sourceRowVersion=text(p.sourceRowVersion,128,true);if(p.sourceProfileVersion!==undefined)candidate.sourceProfileVersion=id(p.sourceProfileVersion);}return candidate;});
 const jobs=array(raw.jobs).map(value=>{const p=object(value);if(!teamJobStatuses.includes(p.status as TeamJobStatus))throw new Error("案件の募集状態を確認できませんでした。");return {jobId:id(p.jobId),company:text(p.company,100,true),title:text(p.title,120,true),description:text(p.description,3000),requirements:text(p.requirements,2000),workConditions:text(p.workConditions,2000),status:p.status as TeamJobStatus,version:id(p.version),createdBy:account(p.createdBy),updatedBy:account(p.updatedBy),createdAt:timestamp(p.createdAt),updatedAt:timestamp(p.updatedAt)};});
 const visible=new Set(candidates.filter(p=>includeWithdrawnComments||p.published).map(p=>p.publicationId));
 const comments=array(raw.comments).map(value=>{const p=object(value),deleted=flag(p.deleted),publicationId=id(p.publicationId);if(!visible.has(publicationId))throw new Error(includeWithdrawnComments?"書き出すコメントの共有先がありません。":"非公開候補者のコメントが含まれています。");const mentions=array(p.mentionIds);if(mentions.length>20)throw new Error("コメントの宛先を確認できませんでした。");return {commentId:id(p.commentId),publicationId,parentId:p.parentId?id(p.parentId):"",authorId:account(p.authorId),body:deleted?"":text(p.body,2000,true),mentionIds:deleted?[]:mentions.map(account),deleted,version:id(p.version),createdAt:timestamp(p.createdAt),updatedAt:timestamp(p.updatedAt),canManage:flag(p.canManage)};});
 const players=array(raw.players).map(value=>{const p=object(value);if(p.role!=="admin"&&p.role!=="player")throw new Error("社内メンバーを確認できませんでした。");return {id:account(p.id),name:text(p.name,40,true),role:p.role as TeamPlayer["role"]};});
 for(const rows of [candidates.map(p=>p.publicationId),jobs.map(p=>p.jobId),comments.map(p=>p.commentId),players.map(p=>p.id)])if(new Set(rows).size!==rows.length)throw new Error("社内共有データの管理IDが重複しています。");
 return {feature:true,candidates,jobs,comments,players};
}

/** Shared screens continue to reject comments for an unpublished candidate. */
export function parseTeamWorkspace(value:unknown):TeamWorkspaceData {return parseWorkspace(value,false);}
/** This archive contract is distinct from the public-screen parser: withdrawn
 * comments must be retained rather than silently filtered out. */
export function parseTeamWorkspaceExport(value:unknown):TeamWorkspaceExport {
 const raw=object(value);if(raw.scope!=="all-saved-internal-shares"||raw.deletedCommentBodiesRedacted!==true)throw new Error("社内共有の書き出し範囲を確認できませんでした。");
 for(const entry of array(raw.comments)){const comment=object(entry);if(comment.deleted===true&&(comment.body!==""||!Array.isArray(comment.mentionIds)||comment.mentionIds.length))throw new Error("削除済みコメントの本文を含むファイルは書き出せません。");}
 const result=parseWorkspace(raw,true),rawPlayers=array(raw.players);
 const commentIds=new Map(result.comments.map(comment=>[comment.commentId,comment]));
 if(result.comments.some(comment=>comment.parentId&&commentIds.get(comment.parentId)?.publicationId!==comment.publicationId))throw new Error("書き出すコメントの返信先が一致しません。");
 return {...result,scope:"all-saved-internal-shares",deletedCommentBodiesRedacted:true,players:result.players.map((player,index)=>({...player,active:flag(object(rawPlayers[index]).active)}))};
}

export const teamCommentsFor=(data:TeamWorkspaceData,publicationId:string):TeamComment[]=>data.candidates.some(p=>p.publicationId===publicationId&&p.published)?data.comments.filter(p=>p.publicationId===publicationId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.commentId.localeCompare(b.commentId)):[];
