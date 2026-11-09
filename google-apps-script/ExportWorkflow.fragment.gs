/* Full administrator backup of all saved workflow months, states and drafts.
 * readDataExport_ incorporates .data, .checks and .cells, then revalidates the
 * actor and every table fingerprint before returning. This never writes data.
 * Evidence is metadata only: no upload URL, GCS object name, bucket or file bytes.
 */
function workflowDataExport_(store,actor){
 requireAdmin_(actor);
 var checks=[],cells=0;
 function table(title,headers,reader){
  var state;
  if(typeof reader!=='function'){
   state=intakeTable_(store.book,title,headers);
   if(state.sheet||state.rows.length)fail_('NOT_CONFIGURED','保存済み業務データを完全に書き出すには連携コードの更新が必要です。');
   state.entries=[];
  }else state=reader(store.book);
  if(!state||!Array.isArray(state.rows)||!Array.isArray(state.entries)||typeof state.fingerprint!=='string')fail_('SCHEMA_MISMATCH','書き出す業務データの保存状態を確認してください。');
  checks.push({title:title,headers:headers.slice(),fingerprint:state.fingerprint,sheetId:state.sheet?state.sheet.getSheetId():null});
  cells+=(state.rows.length+(state.sheet?1:0))*headers.length;
  return state;
 }
 // Table names/headers are fixed schema, including safe empty exports before a
 // feature's first save. Missing storage must never be initialized by a read.
 var metric=table('_NODE_metric_goals',['playerId','month','targets','dailyBasis','customBusinessDays','version','updatedAt','actorId'],typeof metricGoalTable_==='function'?metricGoalTable_:null);
 var salesAvailable=typeof salesTable_==='function';
 var jobs=table('_NODE_work_jobs',['id','body','version','updatedAt'],salesAvailable?function(book){return salesTable_(book,'_NODE_work_jobs','job');}:null);
 var plans=table('_NODE_proposal_plans',['id','body','version','updatedAt'],salesAvailable?function(book){return salesTable_(book,'_NODE_proposal_plans','plan');}:null);
 var reports=table('_NODE_match_reports',['id','body','version','updatedAt'],salesAvailable?function(book){return salesTable_(book,'_NODE_match_reports','report');}:null);
 var draftHeaders=['draftKey','playerId','json0','json1','json2','json3','json4','json5','json6','json7','json8','json9','version','updatedAt','actorId'];
 var settingHeaders=['id','json0','json1','json2','json3','json4','json5','json6','json7','json8','json9','version','updatedAt','actorId'];
 var drafts=table('_NODE_introduction_v2',draftHeaders,typeof introductionV2Table_==='function'?introductionV2Table_:null);
 var settings=table('_NODE_introduction_settings',settingHeaders,typeof introductionSettingsTable_==='function'?introductionSettingsTable_:null);
 var evidence=table('_NODE_match_evidence',['id','body','version','updatedAt'],typeof matchEvidenceTable_==='function'?matchEvidenceTable_:null);
 function body(entry){var out=Object.assign({},entry);delete out.row;return out;}
 var evidenceFields=['evidenceId','ownerId','recordId','profileId','kind','mime','size','status','generation','createdAt','expiresAt','completedAt','version','updatedAt'];
 var data={feature:true,schemaVersion:1,scope:'all-saved-private-workflows',
  metricGoals:metric.entries.map(function(entry){var out=body(entry);out.actorId=metric.rows[entry.row-2][7];return out;}),
  salesWorkflow:{jobs:jobs.entries.map(body),plans:plans.entries.map(body),reports:reports.entries.map(body)},
  introductionV2:{drafts:drafts.entries.map(function(entry){return {draftKey:entry.draftKey,playerId:entry.playerId,profile:entry.profile,version:entry.version,updatedAt:entry.updatedAt,actorId:drafts.rows[entry.row-2][14]};}),settings:settings.entries.map(function(entry){return {id:'shared',settings:entry.settings,version:entry.version,updatedAt:entry.updatedAt,actorId:settings.rows[entry.row-2][13]};})},
  matchEvidence:{scope:'metadata-only',files:evidence.entries.map(function(entry){var out={};evidenceFields.forEach(function(key){if(!Object.prototype.hasOwnProperty.call(entry,key))fail_('SCHEMA_MISMATCH','合意資料の書き出し項目が不足しています。');out[key]=entry[key];});return out;})}
 };
 return {data:data,checks:checks,cells:cells};
}
