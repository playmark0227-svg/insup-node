/* Private report discussions. Never copied to candidate publications or AI input.
 * Dispatch readMatchReportComments_, planMatchReportComment_, planDeleteMatchReportComment_.
 * commit_ must call revalidateMatchReportCommentsPlan_ before its final actor check.
 * All mutations use the normal atomic batch / operation receipt path.
 */
var MATCH_REPORT_COMMENT_TAB='_NODE_match_report_comments';
var MATCH_REPORT_COMMENT_HEADERS=['commentId','reportId','parentId','authorId','body','deleted','version','createdAt','updatedAt'];
var MATCH_REPORT_COMMENT_PAGE_LIMIT=100;
function matchReportCommentsMutationAction_(action){return ['saveMatchReportComment','deleteMatchReportComment'].indexOf(action)>=0;}
function matchReportCommentObject_(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(function(k){return keys.indexOf(k)<0;}))fail_('VALIDATION','マッチ報告コメントの入力項目を確認してください。');return value;}
function matchReportCommentTable_(book){
 var state=intakeTable_(book,MATCH_REPORT_COMMENT_TAB,MATCH_REPORT_COMMENT_HEADERS),seen=Object.create(null);
 state.entries=state.rows.map(function(row,index){return teamSchema_(function(){
  var id=teamId_(row[0]);if(seen[id]||typeof row[5]!=='boolean')fail_('SCHEMA_MISMATCH','マッチ報告コメントのID・状態を確認してください。');seen[id]=true;
  return {commentId:id,reportId:teamId_(row[1]),parentId:row[2]?teamId_(row[2]):'',authorId:teamAccount_(row[3]),body:teamText_(row[4],2000,true),deleted:row[5],version:teamId_(row[6]),createdAt:teamTime_(row[7]),updatedAt:teamTime_(row[8]),row:index+2};
 });});
 var byId=Object.create(null);state.entries.forEach(function(c){byId[c.commentId]=c;});
 state.entries.forEach(function(c){if(c.parentId){var parent=byId[c.parentId];if(!parent||parent.reportId!==c.reportId||parent.row>=c.row)fail_('SCHEMA_MISMATCH','マッチ報告コメントの返信先を確認してください。');}});return state;
}
function matchReportCommentAccess_(store,user,reports,reportId){
 teamId_(reportId);var report=reports.entries.find(function(r){return r.reportId===reportId;});
 // Missing reports and removed business records never reveal retained comment prose.
 if(!report)fail_('NOT_FOUND','マッチ報告が見つかりません。');
 if(user.role!=='admin'&&report.ownerId!==user.id)fail_('FORBIDDEN','このマッチ報告のコメントは閲覧・変更できません。');
 var record=findRecord_(store,report.recordId);if(!record||record.playerId!==report.ownerId||report.profileId&&(record.profileId||'')!==report.profileId)fail_('NOT_FOUND','マッチ報告の対象を確認できません。');
 return {report:report,record:record};
}
function matchReportCommentPublic_(comment,user){return {commentId:comment.commentId,reportId:comment.reportId,parentId:comment.parentId,authorId:comment.authorId,body:comment.deleted?'':comment.body,deleted:comment.deleted,version:comment.version,createdAt:comment.createdAt,updatedAt:comment.updatedAt,canManage:user.role==='admin'||comment.authorId===user.id};}
function matchReportCommentChecks_(plan,reports,state,access){salesTableCheck_(plan,SALES_MATCH_TAB,reports);teamTableCheck_(plan,MATCH_REPORT_COMMENT_TAB,MATCH_REPORT_COMMENT_HEADERS,state);addProfileRecordChecks_(plan,[access.record]);plan.matchReportCommentAccess={reportId:access.report.reportId,ownerId:access.report.ownerId,recordId:access.record.recordId};}
function readMatchReportComments_(request){
 var payload=matchReportCommentObject_(request.payload||{},['reportId','cursor','limit']),session=authenticate_(request.token,false,request.background===true),accounts=readAccountStore_(),user=activeActor_(accounts,session),store=readStore_({readOnly:true},accounts),reports=salesTable_(store.book,SALES_MATCH_TAB,'report'),access=matchReportCommentAccess_(store,user,reports,payload.reportId),state=matchReportCommentTable_(store.book),limit=payload.limit===undefined?50:payload.limit;
 if(typeof limit!=='number'||!isFinite(limit)||Math.floor(limit)!==limit||limit<1||limit>MATCH_REPORT_COMMENT_PAGE_LIMIT)fail_('VALIDATION','コメントの取得件数は1〜100件で指定してください。');
 var signature=hash_(stableJson_([access.report.reportId,state.fingerprint])),offset=0;
 if(payload.cursor!==undefined&&payload.cursor!==''){
  if(typeof payload.cursor!=='string'||payload.cursor.length>160||!/^\d{1,4}_[A-Za-z0-9_-]+$/.test(payload.cursor))fail_('VALIDATION','コメントの続きの取得位置を確認してください。');
  var separator=payload.cursor.indexOf('_');offset=Number(payload.cursor.slice(0,separator));if(payload.cursor.slice(separator+1)!==signature)fail_('CONFLICT','コメントが更新されました。先頭から読み直してください。');
 }
 var all=state.entries.filter(function(c){return c.reportId===access.report.reportId;}).sort(function(a,b){return a.row-b.row;}),page=all.slice(offset,offset+limit);
 if(offset>all.length)fail_('VALIDATION','コメントの続きの取得位置を確認してください。');
 var pageIds=new Set(page.map(function(c){return c.commentId;})),parentIds=new Set(page.map(function(c){return c.parentId;}).filter(Boolean)),parents=all.filter(function(c){return parentIds.has(c.commentId)&&!pageIds.has(c.commentId);});
 var result={feature:true,schemaVersion:1,reportId:access.report.reportId,comments:page.map(function(c){return matchReportCommentPublic_(c,user);}),parents:parents.map(function(c){return matchReportCommentPublic_(c,user);}),nextCursor:offset+page.length<all.length?String(offset+page.length)+'_'+signature:'',total:all.length,checkedAt:new Date().toISOString()},checks={};
 matchReportCommentChecks_(checks,reports,state,access);revalidateManagementPlan_(store,user,checks);revalidateIntakePlan_(store,user,checks);snapshotActor_(store,request.token);return result;
}
function matchReportCommentPlan_(store,user,payload,deleting){
 matchReportCommentObject_(payload,deleting?['reportId','commentId','version']:['reportId','commentId','version','parentId','body']);
 if(payload.commentId!==undefined&&payload.commentId!=='')teamId_(payload.commentId);if(payload.parentId!==undefined&&payload.parentId!=='')teamId_(payload.parentId);
 var actor=activeActor_({players:readPlayers_(store.playerSheet)},user),reports=salesTable_(store.book,SALES_MATCH_TAB,'report'),access=matchReportCommentAccess_(store,actor,reports,payload.reportId),state=matchReportCommentTable_(store.book),previous=payload.commentId?state.entries.find(function(c){return c.commentId===teamId_(payload.commentId);}):null;
 if(payload.commentId&&!previous)fail_('NOT_FOUND','コメントが見つかりません。');if(deleting&&!previous)fail_('VALIDATION','削除するコメントを指定してください。');
 if(previous){
  if(previous.reportId!==access.report.reportId||actor.role!=='admin'&&previous.authorId!==actor.id)fail_('FORBIDDEN','このコメントを変更できません。');
  if(payload.version!==previous.version)fail_('CONFLICT','コメントが更新されています。入力を保持して、最新版を確認してください。');
  if(previous.deleted)fail_('VALIDATION','削除済みのコメントは編集・削除できません。');
 }else if(payload.version!==undefined&&payload.version!=='')fail_('CONFLICT','新しいコメントに古いバージョンは指定できません。');
 var parentId=payload.parentId===undefined?(previous?previous.parentId:''):payload.parentId?teamId_(payload.parentId):'';
 if(previous&&parentId!==previous.parentId)fail_('VALIDATION','コメントの返信先は変更できません。');
 if(parentId){var parent=state.entries.find(function(c){return c.commentId===parentId;});if(!parent||parent.reportId!==access.report.reportId||!previous&&parent.deleted)fail_('VALIDATION','同じマッチ報告の削除されていないコメントに返信してください。');}
 var now=new Date().toISOString(),next={commentId:previous?previous.commentId:Utilities.getUuid(),reportId:access.report.reportId,parentId:parentId,authorId:previous?previous.authorId:actor.id,body:deleting?previous.body:teamText_(payload.body,2000,true),deleted:deleting,version:Utilities.getUuid(),createdAt:previous?previous.createdAt:now,updatedAt:now},plan={requests:[],result:{commentId:next.commentId,reportId:next.reportId}};
 intakeWritePlan_(store,plan,MATCH_REPORT_COMMENT_TAB,MATCH_REPORT_COMMENT_HEADERS,state,previous?previous.row:state.rows.length+2,[next.commentId,next.reportId,next.parentId,next.authorId,next.body,next.deleted,next.version,next.createdAt,next.updatedAt]);matchReportCommentChecks_(plan,reports,state,access);if(previous)plan.matchReportCommentAccess.authorId=previous.authorId;return plan;
}
function planMatchReportComment_(store,user,payload){return matchReportCommentPlan_(store,user,payload,false);}
function planDeleteMatchReportComment_(store,user,payload){return matchReportCommentPlan_(store,user,payload,true);}
function revalidateMatchReportCommentsPlan_(store,user,plan){
 if(!plan.matchReportCommentAccess)return;var check=plan.matchReportCommentAccess,actor=activeActor_({players:readPlayers_(store.playerSheet)},user);
 if(actor.role!=='admin'&&(check.ownerId!==actor.id||check.authorId&&check.authorId!==actor.id))fail_('FORBIDDEN','このマッチ報告のコメントを変更できません。');
}
