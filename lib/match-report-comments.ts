/** Owner/admin-only discussions, independent of company-wide candidate sharing. */
export type MatchReportComment={commentId:string;reportId:string;parentId:string;authorId:string;body:string;deleted:boolean;version:string;createdAt:string;updatedAt:string;canManage:boolean};
export type ReadMatchReportCommentsInput={reportId:string;cursor?:string;limit?:number};
export type MatchReportCommentsData={feature:true;schemaVersion:1;reportId:string;comments:MatchReportComment[];parents:MatchReportComment[];nextCursor:string;total:number;checkedAt:string};
export type SaveMatchReportCommentInput={reportId:string;commentId?:string;version?:string;parentId?:string;body:string};
export type DeleteMatchReportCommentInput={reportId:string;commentId:string;version:string};
export type MatchReportCommentAction="saveMatchReportComment"|"deleteMatchReportComment";
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=="object"||Array.isArray(v))throw Error("マッチ報告コメントの形式を確認できませんでした。");return v as Record<string,unknown>;};
const text=(v:unknown,max:number,required=false)=>{if(typeof v!=="string"||v.length>max||required&&!v.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))throw Error("マッチ報告コメントの項目を確認できませんでした。");return v;};
const id=(v:unknown)=>{const s=text(v,128,true);if(!/^[A-Za-z0-9_-]{16,128}$/.test(s))throw Error("マッチ報告コメントのIDを確認できませんでした。");return s;};
const flag=(v:unknown)=>{if(typeof v!=="boolean")throw Error("マッチ報告コメントの状態を確認できませんでした。");return v;};
const stamp=(v:unknown)=>{const s=text(v,40,true);if(!/^\d{4}-\d{2}-\d{2}T/.test(s)||!Number.isFinite(Date.parse(s)))throw Error("マッチ報告コメントの日時を確認できませんでした。");return s;};
function comment(v:unknown,reportId:string):MatchReportComment{const p=object(v),deleted=flag(p.deleted),authorId=text(p.authorId,30,true);if(!/^[A-Za-z0-9_-]{1,30}$/.test(authorId)||p.reportId!==reportId)throw Error("マッチ報告コメントの共有範囲を確認できませんでした。");if(deleted&&p.body!=="")throw Error("削除済みコメントの本文は表示できません。");return {commentId:id(p.commentId),reportId,parentId:p.parentId?id(p.parentId):"",authorId,body:deleted?"":text(p.body,2000,true),deleted,version:id(p.version),createdAt:stamp(p.createdAt),updatedAt:stamp(p.updatedAt),canManage:flag(p.canManage)};}
export function parseMatchReportComments(value:unknown,expectedReportId?:string):MatchReportCommentsData{
 const p=object(value),reportId=id(p.reportId);if(p.feature!==true||p.schemaVersion!==1||expectedReportId&&reportId!==expectedReportId)throw Error("マッチ報告コメントの連携・共有範囲を確認してください。");
 if(!Array.isArray(p.comments)||p.comments.length>100||!Array.isArray(p.parents)||p.parents.length>100||!Number.isInteger(p.total)||(p.total as number)<p.comments.length||(p.total as number)>5000)throw Error("マッチ報告コメントの件数を確認できませんでした。");
 const comments=p.comments.map(v=>comment(v,reportId)),parents=p.parents.map(v=>comment(v,reportId)),all=[...comments,...parents],ids=new Map(all.map(c=>[c.commentId,c]));
 if(ids.size!==all.length||comments.some(c=>c.parentId&&(!ids.has(c.parentId)||c.parentId===c.commentId)))throw Error("マッチ報告コメントの返信先を確認できませんでした。");
 for(const item of all){const visited=new Set<string>();let cursor:MatchReportComment|undefined=item;while(cursor){if(visited.has(cursor.commentId))throw Error("マッチ報告コメントの返信先が循環しています。");visited.add(cursor.commentId);cursor=cursor.parentId?ids.get(cursor.parentId):undefined;}}
 const nextCursor=text(p.nextCursor,160);if(nextCursor&&!/^\d{1,4}_[A-Za-z0-9_-]+$/.test(nextCursor))throw Error("マッチ報告コメントの取得位置を確認できませんでした。");return {feature:true,schemaVersion:1,reportId,comments,parents,nextCursor,total:p.total as number,checkedAt:stamp(p.checkedAt)};
}
/** A fresh first page replaces the list; later pages preserve earlier rows. */
export function mergeMatchReportCommentPage(previous:MatchReportCommentsData|null,next:MatchReportCommentsData,append=false):MatchReportCommentsData{
 if(!append||!previous)return next;if(previous.reportId!==next.reportId||previous.total!==next.total)throw Error("別のマッチ報告のコメントは結合できません。");const comments=[...previous.comments,...next.comments],ids=new Set(comments.map(c=>c.commentId));if(ids.size!==comments.length||comments.length>next.total)throw Error("コメントの取得位置が重複しています。先頭から読み直してください。");const parents=[...new Map([...previous.parents,...next.parents].filter(c=>!ids.has(c.commentId)).map(c=>[c.commentId,c])).values()];return {...next,comments,parents};
}
