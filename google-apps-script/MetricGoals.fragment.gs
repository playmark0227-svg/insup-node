/* Seven monthly targets. Included in Code.gs at release; no Google service is called at file load.
 * Integration: authenticated/read-budgeted readMetricGoals -> readMetricGoals_;
 * saveMetricGoals -> saveMetricGoals_ (also add it to nodeStorageMutation_).
 * Snapshot metadata metricGoalsFeature=true must only be enabled with both routes deployed.
 */
var METRIC_GOALS_TAB='_NODE_metric_goals';
var METRIC_GOALS_HEADERS=['playerId','month','targets','dailyBasis','customBusinessDays','version','updatedAt','actorId'];
var METRIC_GOAL_STAGES=['候補者面談','提案','C面談予約','クライアント面談','内定','内定承諾','稼働開始'];
function metricGoalMonth_(value){if(typeof value!=='string'||!/^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value))fail_('VALIDATION','目標の年月を1900年〜2100年で指定してください。');return value;}
function metricGoalDays_(month){metricGoalMonth_(month);var p=month.split('-').map(Number);return new Date(Date.UTC(p[0],p[1],0)).getUTCDate();}
function metricGoalTargets_(value){writingObject_(value,METRIC_GOAL_STAGES);if(Object.keys(value).length!==METRIC_GOAL_STAGES.length)fail_('VALIDATION','7工程の目標を指定してください。');var targets={};METRIC_GOAL_STAGES.forEach(function(stage){var n=value[stage];if(n!==null&&(!Number.isSafeInteger(n)||n<0||n>9999))fail_('VALIDATION','目標は0〜9999の整数、未設定は空欄にしてください。');targets[stage]=n;});return targets;}
function metricGoalBasis_(basis,customDays,month){var valid=(basis==='calendar'||basis==='weekdays')?customDays===null:basis==='custom'&&Number.isInteger(customDays)&&customDays>=1&&customDays<=metricGoalDays_(month);if(!valid)fail_('VALIDATION','日割り基準と指定営業日数を確認してください。');return basis;}
function metricGoalTable_(book){
 var state=intakeTable_(book,METRIC_GOALS_TAB,METRIC_GOALS_HEADERS),seen=Object.create(null);
 state.entries=state.rows.map(function(row,index){
  if(row.every(function(v){return v===''||v===null;}))return null;
  var month,targets,basis;try{month=metricGoalMonth_(row[1]);targets=metricGoalTargets_(JSON.parse(row[2]));basis=metricGoalBasis_(row[3],row[4]===''?null:row[4],month);}catch(_){fail_('SCHEMA_MISMATCH','7工程目標の年月・数値・日割り基準を確認してください。');}
  var key=row[0]+'|'+month;if(typeof row[0]!=='string'||!/^ND-\d+$/.test(row[0])||seen[key]||typeof row[5]!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(row[5])||typeof row[6]!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(row[6])||!isFinite(Date.parse(row[6]))||typeof row[7]!=='string'||!/^[A-Za-z0-9_-]{1,30}$/.test(row[7]))fail_('SCHEMA_MISMATCH','7工程目標の担当者・重複・保存状態を確認してください。');
  seen[key]=true;return {playerId:row[0],month:month,targets:targets,dailyBasis:basis,customBusinessDays:row[4]===''?null:row[4],version:row[5],updatedAt:row[6],row:index+2};
 }).filter(Boolean);return state;
}
function publicMetricGoal_(goal,proposal){return {playerId:goal.playerId,month:goal.month,targets:Object.assign({},goal.targets,{'提案':proposal?proposal.target:null}),dailyBasis:goal.dailyBasis,customBusinessDays:goal.customBusinessDays,version:goal.version,updatedAt:goal.updatedAt};}
function metricGoalCounts_(all,players){var result={};players.forEach(function(player){result[player.id]={};METRIC_GOAL_STAGES.forEach(function(stage){var n=all&&all[player.id]&&all[player.id][stage];result[player.id][stage]=Number.isSafeInteger(n)&&n>=0?n:0;});});return result;}
function readMetricGoals_(request){
 var session=authenticate_(request.token,false,request.background===true),accounts=readAccountStore_(),actor=activeActor_(accounts,session),payload=request.payload||{};writingObject_(payload,['month']);var month=metricGoalMonth_(payload.month),store=readStore_({readOnly:true},accounts),state=metricGoalTable_(store.book),legacy=monthlyTargetTable_(store.book),players=store.players.filter(function(p){return p.role==='player';}),ids=players.map(function(p){return p.id;}),counts=countActivities_(activities_(store),players),daily={};
 Object.keys(counts).forEach(function(period){if(period.length===10&&period.slice(0,7)===month)daily[period]=metricGoalCounts_(counts[period],players);});
 var result={feature:true,month:month,today:today_(),checkedAt:new Date().toISOString(),players:players.map(function(p){return {id:p.id,name:p.name,active:p.active};}),goals:state.entries.filter(function(g){return g.month===month&&ids.indexOf(g.playerId)>=0;}).map(function(g){return publicMetricGoal_(g,legacy.entries.find(function(p){return p.playerId===g.playerId&&p.month===month;}));}),legacyProposalGoals:legacy.entries.filter(function(g){return g.month===month&&ids.indexOf(g.playerId)>=0;}).map(publicMonthlyGoal_),counts:metricGoalCounts_(counts[month],players),dailyCounts:daily};
 // Recheck both tables and the actor after reading. No candidate name, rate, memo or source is returned.
 if(metricGoalTable_(store.book).fingerprint!==state.fingerprint||monthlyTargetTable_(store.book).fingerprint!==legacy.fingerprint)fail_('BUSY','月別目標が更新されています。最新の情報を取得してください。');snapshotActor_(store,request.token);return result;
}
function metricGoalPayload_(payload){
 writingObject_(payload,['playerId','month','targets','dailyBasis','customBusinessDays','expectedVersion','expectedProposalVersion']);var playerId=shortText_(payload.playerId,30,true),month=metricGoalMonth_(payload.month),targets=metricGoalTargets_(payload.targets),basis=metricGoalBasis_(payload.dailyBasis,payload.customBusinessDays,month);
 ['expectedVersion','expectedProposalVersion'].forEach(function(key){if(typeof payload[key]!=='string'||payload[key]!==''&&!/^[A-Za-z0-9_-]{43}$/.test(payload[key]))fail_('VALIDATION','最新の目標の保存状態を取得してください。');});
 return {playerId:playerId,month:month,targets:targets,dailyBasis:basis,customBusinessDays:payload.customBusinessDays,expectedVersion:payload.expectedVersion,expectedProposalVersion:payload.expectedProposalVersion};
}
function metricGoalOwner_(store,actor,playerId){var owner=store.players.find(function(player){return player.id===playerId&&player.role==='player'&&(actor.role==='admin'||player.active);});if(!owner||actor.role!=='admin'&&actor.id!==playerId)fail_('FORBIDDEN','本人または管理者だけ月別目標を変更できます。');return owner;}
function planMetricGoals_(store,actor,raw){
 var payload=metricGoalPayload_(raw);guardProbeBusinessMutation_(store,actor,'saveMetricGoals',payload);if(probeReservation_(store,payload.playerId,false))fail_('FORBIDDEN','検証専用アカウントの目標は変更できません。');metricGoalOwner_(store,actor,payload.playerId);var state=metricGoalTable_(store.book),legacy=monthlyTargetTable_(store.book),old=state.entries.find(function(g){return g.playerId===payload.playerId&&g.month===payload.month;}),proposal=legacy.entries.find(function(g){return g.playerId===payload.playerId&&g.month===payload.month;});
 if((old?old.version:'')!==payload.expectedVersion||(proposal?proposal.version:'')!==payload.expectedProposalVersion)fail_('CONFLICT','月別目標が更新されています。入力は保持したまま、最新の内容と比較してください。');
 var now=new Date().toISOString(),version=random256_(),plan={requests:[],result:{playerId:payload.playerId,month:payload.month}};
 intakeWritePlan_(store,plan,METRIC_GOALS_TAB,METRIC_GOALS_HEADERS,state,old?old.row:state.rows.length+2,[payload.playerId,payload.month,JSON.stringify(payload.targets),payload.dailyBasis,payload.customBusinessDays===null?'':payload.customBusinessDays,version,now,actor.id]);
 // Never perform a second API write: the compatibility proposal and operation receipt
 // commit in the SAME Sheets batch / Firestore transaction as the seven-stage row.
 var legacyRow=proposal?proposal.row:legacy.sheet?legacy.sheet.getLastRow()+1:2;
 if(payload.targets['提案']!==null||proposal)intakeWritePlan_(store,plan,NODE.monthlyTargetsTab,NODE.monthlyTargetHeaders,legacy,legacyRow,payload.targets['提案']===null?Array(NODE.monthlyTargetHeaders.length).fill(''):[payload.playerId,payload.month,payload.targets['提案'],version,now,actor.id]);
 else {plan.intakeTableChecks.push({title:NODE.monthlyTargetsTab,headers:NODE.monthlyTargetHeaders,fingerprint:legacy.fingerprint,sheetId:legacy.sheet?legacy.sheet.getSheetId():null});}
 return plan;
}
function saveMetricGoals_(request){
 return withLock_(function(){
  var session=authenticate_(request.token),store=readStore_({readOnly:true}),actor=activeActor_(store,session);assertManagedBook_(store.book);if(!writesEnabled_(store.config))fail_('WRITES_DISABLED','現在は読み取り専用です。');if(store.book.getSpreadsheetTimeZone()!=='Asia/Tokyo')fail_('TIMEZONE','保存先のタイムゾーンを確認してください。');
  var payload=metricGoalPayload_(request.payload||{});guardProbeBusinessMutation_(store,actor,'saveMetricGoals',payload);if(probeReservation_(store,payload.playerId,false))fail_('FORBIDDEN','検証専用アカウントの目標は変更できません。');metricGoalOwner_(store,actor,payload.playerId);var operationId=shortText_(request.operationId,128,true);if(!/^[A-Za-z0-9_-]{16,128}$/.test(operationId))fail_('BAD_REQUEST','保存操作のIDが必要です。');
  var payloadHash=hash_(stableJson_({action:'saveMetricGoals',payload:payload})),previous=operation_(store,operationId);
  if(previous){if(previous.actorId!==actor.id||previous.action!=='saveMetricGoals'||previous.payloadHash!==payloadHash)fail_('OPERATION_CONFLICT','同じ保存IDを別の内容に使うことはできません。');snapshotActor_(store,request.token);return {committed:true,operationId:operationId};}
  var plan=planMetricGoals_(store,actor,payload);commit_(store,actor,'saveMetricGoals',operationId,payloadHash,plan,request.token);
  try {snapshotActor_(store,request.token);}catch(error){if(['AUTH_REQUIRED','UNAUTHENTICATED','UNAUTHORIZED','SESSION_EXPIRED'].indexOf(error.nodeCode)>=0)throw error;fail_('INTERNAL','保存結果を再確認してください。同じ保存IDで再試行できます。');}
  return {committed:true,operationId:operationId};
 });
}
