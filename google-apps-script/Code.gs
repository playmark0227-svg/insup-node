/** INSUP NODE — owner-executed Apps Script web app. No credentials belong in this file. */
var NODE = Object.freeze({
  protocol: 1,
  originalId: '1AnyvEoUtgUSTnuuJjIjA80XGHw_DaL9fSUoNCrYZ36s',
  matchingSheetId: 286330650,
  kpiSheetId: 2007683505,
  matchingTab: '2期目マッチングDB',
  kpiTab: '2期目月間KPI・KGI',
  destinationKey: 'NODE_DESTINATION_ID',
  verificationKey: 'NODE_VERIFICATION_ID',
  probeKey: 'NODE_COPY_PROBE',
  playersTab: '_NODE_players',
  operationsTab: '_NODE_operations',
  monthlyTargetsTab: '_NODE_monthly_targets',
  monthlyTargetHeaders: ['playerId','month','target','version','updatedAt','actorId'],
  recordKey: 'NODE_RECORD_ID',
  sourceKey: 'NODE_SOURCE',
  deletedKey: 'NODE_DELETED_CANDIDATE',
  candidateProfileKey: 'NODE_CANDIDATE_PROFILE_ID',
  configKey: 'NODE_CONFIG',
  pepperKey: 'NODE_PEPPER',
  // Owner switch, set to 'true' only after the frontend with the forced change screen is published.
  forceChangeKey: 'NODE_FORCE_PASSWORD_CHANGE',
  sessionHours: 6,
  // Idle sessions end server-side. lastSeenAt is rewritten at most once per sessionTouchMinutes,
  // so the effective idle window is 55-60 minutes. The 6-hour expiresAt is never extended.
  sessionIdleMinutes: 60,
  sessionTouchMinutes: 5,
  sessionsPerAccount: 8,
  deviceDays: 90,
  loginFailures: 5,
  loginAttemptsPerMinute: 60,
  // Login takes the write lock only for short counter and session sections, and gives up sooner than business writes.
  loginLockMs: 5000,
  // Stretched password hash rounds (PBKDF2-HMAC-SHA256). The byte-identical JS implementation
  // avoids a Utilities service call for every round; the pepper prehash still uses Utilities.
  // The owner should measure benchmarkNodePasswordHash in Apps Script before raising this.
  // Every record keeps its own round count and older records upgrade on their next login.
  // Keep this exact line form; the tests override the number. Do not lower it for speed.
  kdfIterations: 2000,
  stages: ['候補者面談','提案','C面談予約','クライアント面談','内定','内定承諾','稼働開始予定','稼働開始'],
  stageColumns: [1,8,9,17,21,22,23,24],
  positions: ['アポインター','FS','ディレクション','コールシステム','コンサル','その他'],
  statuses: ['提案候補','提案なし','提案完了（面談日確定待ち）','面談確定(面談実施待ち）','面談実施（合否待ち）','合格（シフト入力待ち）','稼働予定日確定（稼働開始待ち）','稼働開始','落選（面談後）','落選（面談前）','辞退（音信不通）','辞退（他決）','辞退（本人希望）','案件枠埋まり','合格後離脱','稼働後離脱','C面談リスケ','C面談ブッチ'],
  stageStatuses: ['提案候補','提案完了（面談日確定待ち）','面談確定(面談実施待ち）','面談実施（合否待ち）','合格（シフト入力待ち）','合格（シフト入力待ち）','稼働予定日確定（稼働開始待ち）','稼働開始'],
  inputColumns: [1,2,3,4,6,7,8,9,10,11,12,13,17,21,22,23,24,25,26],
  mappedHeaders: {
    1:['面談実施','面談実施日'],2:['会社名'],3:['候補者氏名（スペースなし）','氏名','候補者氏名\nスペースいれない'],4:['担当'],6:['担当ポジ','項目\n担当ポジ\n(アポインター/D/FS)'],7:['ステータス'],8:['提案完了日'],
    9:['C面談予約獲得日','C面談予約獲得日（アポ獲得日）'],10:['C面談予定日','C面談予定日 （予定がわかったら入力）'],11:['C面談予定開始時刻'],12:['ヨミ確度','ヨミ確度\nA:95％\nB:70％\nC:50％\nD:10％'],13:['メモ'],
    17:['C面談実施日','C面談実施日、実施したら入力','C面談実施日\n（実施したら入力）'],21:['クライアント側オファー日＝合格日'],22:['候補者承諾日＝マッチ日'],23:['稼働開始予定日'],24:['稼働開始日'],25:['離脱予定日'],26:['離脱日']
  },
  playerHeaders: ['id','name','team','color','target','bio','sheetNames','role','active'],
  operationHeaders: ['operationId','actorId','action','payloadHash','result','committedAt'],
  // Initial player names come from the owner-only NODE_SEED_PLAYERS property, never public source.
  seedPlayersKey: 'NODE_SEED_PLAYERS'
});

function doGet() { return doPost({postData:{contents:JSON.stringify({version:1,action:'health'})}}); }
function doPost(e) {
  var responseAfterMutation=false;
  try {
    var text = e && e.postData && e.postData.contents;
    if (typeof text !== 'string' || text.length > 400000) fail_('BAD_REQUEST', 'リクエストを確認してください。');
    var request;
    try { request = JSON.parse(text); } catch (_) { fail_('BAD_REQUEST', 'JSON形式を確認してください。'); }
    if(text.length>32768&&(!request||request.action!=='saveIntroductionV2'))fail_('BAD_REQUEST','リクエストを確認してください。');
    firestoreReset_(nodeStorageMutation_(request&&request.action));
    var data=nodeHandle_(request);
    responseAfterMutation=nodeStorageMutation_(request.action);
    if(nodeUsesFirestore_())firestoreAssertSnapshot_();
    return output_({ ok: true, data: data });
  } catch (error) {
    if((responseAfterMutation||firestoreCommitted_())&&['AUTH_REQUIRED','UNAUTHENTICATED','UNAUTHORIZED','SESSION_EXPIRED'].indexOf(error.nodeCode)<0){error=new Error('保存結果を再確認してください。入力は保持しています。同じ内容で再試行できます。');error.nodeCode='INTERNAL';}
    return output_({ ok: false, error: { code: error.nodeCode || 'INTERNAL', message: error.nodeCode ? error.message : '処理を完了できませんでした。入力を残したまま再試行してください。' } });
  } finally { try{firestoreClose_();}catch(_){} }
}
function output_(body) { return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code, message) { var error = new Error(message); error.nodeCode = code; throw error; }
function props_() { return PropertiesService.getScriptProperties(); }
// The endpoint and credential authority stay stable across a storage cutover.
// An invalid provider must never fall back to the old spreadsheet.
function nodeStorageProvider_() {
  var provider=props_().getProperty('NODE_STORAGE_PROVIDER'),migration=firestoreMigrationState_();
  if(migration&&migration.phase==='active'&&provider!=='firestore')fail_('NOT_CONFIGURED','Firebaseへの切替設定を確認してください。旧保存先への書き込みは停止しています。');
  if(provider===null||provider===undefined||provider===''||provider==='sheets')return 'sheets';
  if(provider==='firestore')return provider;
  fail_('NOT_CONFIGURED','保存先の設定を確認してください。');
}
function nodeUsesFirestore_(){return nodeStorageProvider_()==='firestore';}
/* New workflows only use the signed, active Firebase destination. An explicit
 * separately registered verification copy remains usable for bounded tests;
 * deploying compatible code never initializes new tables on production Sheets. */
var NODE_WORKFLOW_V2_ACTIONS=['readMetricGoals','saveMetricGoals','readSalesWorkflow','saveWorkJob','saveProposalPlan','recordProposalSent','saveMatchReport','readIntroductionV2','saveIntroductionV2','saveIntroductionSettings','publishIntroductionV2','beginMatchEvidence','completeMatchEvidence','readMatchEvidence'];
function nodeWorkflowV2Verification_(config){var verification=props_().getProperty(NODE.verificationKey),destination=props_().getProperty(NODE.destinationKey);return !!(config.purpose==='verification'&&verification&&destination&&config.spreadsheetId===verification&&verification!==destination&&verification!==NODE.originalId&&destination!==NODE.originalId);}
function nodeWorkflowV2Available_(config){
  config=config||config_();if(nodeWorkflowV2Verification_(config))return true;
  if(!nodeUsesFirestore_())return false;
  return firestoreMigrationReady_(config)===true;
}
function nodeStorageMutation_(action){return ['manageAccount','saveMonthlyTarget','saveActivity','updateStatus','updateProfile','createPlayer','updateRecord','deleteCandidate','cancelAchievement','restoreChange','saveManagementRow','createCandidate','saveInterviewReview','saveCandidateProfile','saveClient','saveWritingPreferences','publishTeamCandidate','unpublishTeamCandidate','saveTeamComment','saveTeamJob','stageMigrationBatch','applyMigrationItem','mutateRewards','saveMetricGoals','saveWorkJob','saveProposalPlan','recordProposalSent','saveMatchReport','saveIntroductionV2','saveIntroductionSettings','publishIntroductionV2','beginMatchEvidence','completeMatchEvidence'].indexOf(action)>=0;}
function nodeOpenBook_(config){if(!nodeUsesFirestore_())return SpreadsheetApp.openById(config.spreadsheetId);var book=firestoreOpenBook_(config);if(!firestoreMigrationReady_(config))fail_('NOT_CONFIGURED','Firebaseへの移行確認が完了していません。管理者が保存先を確認してください。');return book;}
function nodeFlush_(){if(!nodeUsesFirestore_())SpreadsheetApp.flush();}
function config_() {
  var raw = props_().getProperty(NODE.configKey);
  if (!raw) fail_('NOT_CONFIGURED', '管理者による連携設定が必要です。');
  var config = JSON.parse(raw);
  if (!config.spreadsheetId || config.matchingSheetId === config.kpiSheetId) fail_('NOT_CONFIGURED', '連携設定を確認してください。');
  return config;
}
function writesEnabled_(config) {
  if(firestoreMigrationFrozen_())return false;
  if(nodeUsesFirestore_()&&!firestoreMigrationReady_(config))return false;
  var destinationId=props_().getProperty(NODE.destinationKey),verificationId=props_().getProperty(NODE.verificationKey);
  if (config.writesEnabled !== true || config.spreadsheetId === NODE.originalId || !destinationId || destinationId===NODE.originalId) return false;
  if (config.purpose==='verification') return config.spreadsheetId===verificationId && verificationId!==destinationId;
  if (config.purpose!=='production'||config.spreadsheetId!==destinationId) return false;
  var proof=copyProof_();
  if(!config.destinationAuthorizedAt||!proof||config.verifiedCopyId!==proof.copyId||!validCopyProof_(proof,config.ownerEmail,Date.parse(config.destinationAuthorizedAt)))return false;
  return constantEqual_(config.destinationAuthorizationSeal,destinationAuthorization_(proof,config.ownerEmail,config.destinationAuthorizedAt));
}
function copyProof_() { var raw=props_().getProperty('NODE_COPY_PROOF');try{return raw?JSON.parse(raw):null;}catch(_){return null;} }
function makeCopyProof_(copyId,schemaHash,ownerEmail) {
  var config=config_();
  var proof={copyId:copyId,destinationId:props_().getProperty(NODE.destinationKey),matchingSheetId:Number(config.matchingSheetId),kpiSheetId:Number(config.kpiSheetId),schemaHash:schemaHash,verifiedAt:new Date().toISOString(),ownerEmail:ownerEmail,checks:['login','saveActivity','readBack','interviewDedupe','formulaProtection','cleanup']};
  proof.signature=hmac_(stableJson_(proof),props_().getProperty(NODE.pepperKey));return proof;
}
function validCopyProof_(proof,ownerEmail,referenceTime) {
  var destinationId=props_().getProperty(NODE.destinationKey),verificationId=props_().getProperty(NODE.verificationKey);
  if(!proof||!destinationId||destinationId===NODE.originalId||!verificationId||verificationId===NODE.originalId||verificationId===destinationId||proof.copyId!==verificationId||proof.destinationId!==destinationId||!Number.isInteger(proof.matchingSheetId)||!Number.isInteger(proof.kpiSheetId)||proof.matchingSheetId===proof.kpiSheetId||proof.ownerEmail!==ownerEmail||!proof.schemaHash)return false;
  if(!Array.isArray(proof.checks)||['login','saveActivity','readBack','interviewDedupe','formulaProtection','cleanup'].some(function(check){return proof.checks.indexOf(check)<0;}))return false;
  var age=(referenceTime===undefined?Date.now():referenceTime)-Date.parse(proof.verifiedAt);if(!isFinite(age)||age<0||age>7*86400000)return false;
  var signature=proof.signature,body=Object.assign({},proof);delete body.signature;
  return constantEqual_(signature,hmac_(stableJson_(body),props_().getProperty(NODE.pepperKey)));
}
function destinationAuthorization_(proof,ownerEmail,authorizedAt) { return hmac_(stableJson_({destinationId:props_().getProperty(NODE.destinationKey),proofSignature:proof.signature,ownerEmail:ownerEmail,authorizedAt:authorizedAt}),props_().getProperty(NODE.pepperKey)); }
function schemaHash_(sheet) {
  var rows=sheet.getRange(1,1,Math.min(40,Math.max(1,sheet.getLastRow())),26).getValues(),header=detectHeader_(rows);
  return hash_(stableJson_(rows[header-1].map(normalizeHeader_)));
}
function verifyDestinationReadiness_(config,proof,destination,ownerEmail) {
  assertManagedBook_(destination);
  if(destination.getId()!==props_().getProperty(NODE.destinationKey)||config.purpose!=='verification'||!validCopyProof_(proof,ownerEmail)||proof.copyId!==config.spreadsheetId||Number(config.matchingSheetId)!==proof.matchingSheetId||Number(config.kpiSheetId)!==proof.kpiSheetId)fail_('COPY_VERIFICATION_REQUIRED','別の検証用コピーでログイン・保存・読み戻しを完了してください。');
  var tabs=resolveBusinessTabs_(destination);
  if(schemaHash_(tabs.matching)!==proof.schemaHash)fail_('SCHEMA_MISMATCH','検証用コピーと新しい管理シートのヘッダーが一致しません。');
  return true;
}
function assertManagedBook_(book) {
  var id=typeof book==='string'?book:book.getId();
  if(id===NODE.originalId)fail_('PROTECTED_SOURCE','移行元の原本には一切書き込みません。');
  if(id!==props_().getProperty(NODE.destinationKey)&&id!==props_().getProperty(NODE.verificationKey))fail_('UNAPPROVED_DESTINATION','登録済みの新しい管理シートまたは検証用コピーだけを更新できます。');
  return id;
}
function resolveBusinessTabs_(book) {
  var matching=book.getSheetByName(NODE.matchingTab),kpi=book.getSheetByName(NODE.kpiTab);
  if(!matching||!kpi||matching.getSheetId()===kpi.getSheetId())fail_('SCHEMA_MISMATCH','2期目マッチングDB と 2期目月間KPI・KGI を元のタブ名のまま移してください。');
  var rows=matching.getRange(1,1,Math.min(40,Math.max(1,matching.getLastRow())),26).getValues(),header=detectHeader_(rows);
  if(!mappedHeadersMatch_(rows[header-1]))fail_('SCHEMA_MISMATCH','移行後の入力対象19列の見出しまたは順序が一致しません。セルは変更せず中止しました。');
  return {matching:matching,kpi:kpi,matchingSheetId:matching.getSheetId(),kpiSheetId:kpi.getSheetId()};
}
function health_() {
  var config;
  try { config = config_(); } catch (_) { return { configured: false, writesEnabled: false, protocol: NODE.protocol }; }
  // Public setup status is advisory and Properties-only. Never let anonymous
  // probes spend Firestore reads. Authenticated reads and writes still validate
  // the live migration manifest, proof, roster and document versions.
  return { configured: true, writesEnabled: healthWritesEnabled_(config), protocol: NODE.protocol };
}
function healthWritesEnabled_(config) {
  if(firestoreMigrationFrozen_())return false;
  if(nodeStorageProvider_()!=='firestore')return writesEnabled_(config);
  var state=firestoreMigrationState_(),target=firestoreConfig_();
  if(!state||state.phase!=='active'||state.sourceSpreadsheetId!==config.spreadsheetId||state.sourceSpreadsheetId===NODE.originalId||state.runtimeConfigHash!==firestoreRuntimeConfigHash_(config)||stableJson_(target)!==stableJson_(state.target))return false;
  var destinationId=props_().getProperty(NODE.destinationKey),verificationId=props_().getProperty(NODE.verificationKey);
  if(config.writesEnabled!==true||config.spreadsheetId===NODE.originalId||!destinationId||destinationId===NODE.originalId)return false;
  if(config.purpose==='verification')return config.spreadsheetId===verificationId&&verificationId!==destinationId;
  if(config.purpose!=='production'||config.spreadsheetId!==destinationId)return false;
  var proof=copyProof_();
  if(!config.destinationAuthorizedAt||!proof||config.verifiedCopyId!==proof.copyId||!validCopyProof_(proof,config.ownerEmail,Date.parse(config.destinationAuthorizedAt)))return false;
  return constantEqual_(config.destinationAuthorizationSeal,destinationAuthorization_(proof,config.ownerEmail,config.destinationAuthorizedAt));
}
/* touchSession_ reuses a held lock instead of taking it again: re-entrancy is undocumented, and
 * releasing an inner lock could release the mutation's own lock mid-write. */
var nodeLockDepth_ = 0;
function withLock_(fn, waitMs) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 20000)) fail_('BUSY', '別の処理が実行中です。少し待って再試行してください。');
  nodeLockDepth_++;
  try { return fn(); } finally { nodeLockDepth_--; lock.releaseLock(); }
}
/* Per-account read budgets: [per minute, per hour]. CacheService only, so there is
 * no lock and no property write. get/put is not atomic: parallel requests can lose
 * increments, so counts are approximate. A cache outage or eviction never blocks a
 * read, and rejected requests do not count. NODE_AI_QUOTA still governs Gemini.
 * Writes are not budgeted here; their reads are serialized by the script lock. A replayed operation
 * that answers with a snapshot writes nothing, so it is charged to the snapshot budget. */
var NODE_READ_BUCKETS = Object.freeze({ readMetricGoals:'table',readSalesWorkflow:'table',readIntroductionV2:'table',readMatchEvidence:'table',beginMatchEvidence:'upload',readRewards: 'table', readMigrationArchive:'table', readTeamWorkspace: 'table', snapshot: 'snapshot', resumeSession: 'snapshot', readInterviewAdvice: 'report', readWorkspaceInsights: 'report', analyzeInterviewReviews: 'report', analyzeWorkspaceInsights: 'report', auditSecurity: 'report', readAccountManagement:'report', readOperationHistory:'report', readDataExport:'export', managementTables: 'table', managementTable: 'table', readWritingKit: 'kit', readWritingPreferences: 'kit', generateWritingKit: 'kit' });
var NODE_READ_LIMITS = Object.freeze({ upload:[8,60], snapshot: [40, 900], report: [20, 300], table: [40, 600], kit: [60, 1200], export:[2,10] });
function readBudget_(id, action) {
  // id is always an ID the server already normalized (a session record or issueSession_), never request input.
  var bucket = NODE_READ_BUCKETS[action], limits = NODE_READ_LIMITS[bucket], now = Date.now(), minute = Math.floor(now / 60000), hour = Math.floor(now / 3600000), key = 'NODE_READ_' + bucket + '_' + id, cache, raw, state;
  try { cache = CacheService.getScriptCache(); raw = cache.get(key); } catch (_) { return; }
  try { state = JSON.parse(raw || 'null'); } catch (_) { state = null; }
  if (!Array.isArray(state) || state.length !== 4 || state.some(function (n) { return typeof n !== 'number' || !isFinite(n) || n < 0; })) state = [minute, 0, hour, 0];
  if (state[0] !== minute) { state[0] = minute; state[1] = 0; }
  if (state[2] !== hour) { state[2] = hour; state[3] = 0; }
  var kept = '表示中のデータと未同期の入力はそのまま残ります。';
  // When both windows are spent the hourly wait is the longer one, so report it first.
  if (state[3] >= limits[1]) fail_('RATE_LIMITED', '1時間あたりの読み込み上限に達しました。約' + Math.ceil((3600000 - now % 3600000) / 60000) + '分後に再試行してください。' + kept);
  if (state[1] >= limits[0]) fail_('RATE_LIMITED', '短時間の読み込みが多すぎます。約' + Math.ceil((60000 - now % 60000) / 1000) + '秒後に再試行してください。' + kept);
  state[1]++; state[3]++;
  try { cache.put(key, JSON.stringify(state), 3600); } catch (_) { /* Approximate budgets never block a read. */ }
}
function nodeHandle_(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || request.version !== 1 || typeof request.action !== 'string') fail_('BAD_REQUEST', 'APIバージョンと操作を確認してください。');
  if (request.responseMode !== undefined && request.responseMode !== 'receipt') fail_('BAD_REQUEST', '応答形式を確認してください。');
  if (request.background !== undefined && typeof request.background !== 'boolean') fail_('BAD_REQUEST', '同期の種別を確認してください。');
  var action = request.action;
  // Only an automatic snapshot poll or session check that says so is passive. Sessions from frontends built
  // before the idle timeout are never idle-checked (see sessionIdle_), so they keep today's 6-hour behavior.
  var passive = (action === 'snapshot' || action === 'touch' || action === 'readTeamWorkspace') && request.background === true;
  if (action === 'health') return health_();
  if (action === 'login') return login_(request.payload || {});
  if (action === 'changePassword') return changePassword_(request);
  // Existing browser versions already retain INTERNAL results under the same
  // encrypted operation ID. A temporary migration freeze must not discard input.
  if(nodeStorageMutation_(action)&&firestoreMigrationFrozen_()){authenticate_(request.token);fail_('INTERNAL','保存先を切り替えています。入力を保持したまま、同じ保存IDで後ほど再試行してください。');}
  // Budget expensive reads per account after authentication and before any sheet, AI or audit read.
  // hasOwnProperty keeps inherited names such as 'constructor' answering BAD_REQUEST below.
  // Upload initialization owns its rate budget; its subsequent readStore_ verifies
  // the live signed Firebase proof. Keep this precheck Properties-only so rejected
  // quota calls cannot start a Firestore transaction or spend the budget twice.
  if(action==='beginMatchEvidence'){authenticate_(request.token,false,passive);if(!nodeWorkflowV2Verification_(config_())&&!nodeUsesFirestore_())fail_('NOT_CONFIGURED','この機能はFirebaseへの移行が完了すると利用できます。現在のデータは変更していません。');return beginMatchEvidence_(request);}
  var budgeted = null;
  if (Object.prototype.hasOwnProperty.call(NODE_READ_BUCKETS, action)) { budgeted = authenticate_(request.token, false, passive); readBudget_(budgeted.id, action); }
  if(NODE_WORKFLOW_V2_ACTIONS.indexOf(action)>=0){authenticate_(request.token,false,passive);if(!nodeWorkflowV2Available_(config_()))fail_('NOT_CONFIGURED','この機能はFirebaseへの移行が完了すると利用できます。現在のデータは変更していません。');}
  if (action === 'resumeSession') {var accounts=readAccountStore_(),actor=activeActor_(accounts,budgeted);var access=snapshotCacheAccess_(accounts,actor);snapshotActor_(accounts,request.token);return {cacheAccess:access};}
  if (action === 'auditSecurity') return auditSecurity_(request);
  if (action === 'readAccountManagement') return readAccountManagement_(request);
  if (action === 'manageAccount') return manageAccount_(request);
  if (action === 'saveMonthlyTarget') return saveMonthlyTarget_(request);
  if (action === 'readOperationHistory') return readOperationHistory_(request);
  if (action === 'readDataExport') return readDataExport_(request);
  if (action === 'readTeamWorkspace') return readTeamWorkspace_(request);
  if (action === 'readMigrationArchive') return readMigrationArchive_(request);
  if (action === 'readRewards') return readRewards_(request);
  if(action==='readMetricGoals')return readMetricGoals_(request);
  if(action==='saveMetricGoals')return saveMetricGoals_(request);
  if(action==='readSalesWorkflow')return readSalesWorkflow_(request);
  if(action==='readIntroductionV2')return readIntroductionV2_(request);
  if(action==='saveIntroductionV2')return saveIntroductionV2_(request);
  if(action==='saveIntroductionSettings')return saveIntroductionSettings_(request);
  if(action==='publishIntroductionV2')return publishIntroductionV2_(request);
  if(action==='readMatchEvidence')return readMatchEvidence_(request);
  // Real input while an editor is open: records activity without reading the business table. A background
  // touch only checks the session (idle and absolute limits) while a pending save pauses the polls.
  // deferred: the due refresh was not written (busy lock), so the client keeps the input to report again.
  if (action === 'touch') { var touched = authenticate_(request.token, false, passive); return passive ? { touched: false } : touched.touchDeferred ? { touched: false, deferred: true } : { touched: true }; }
  if (['snapshot','logout','saveActivity','updateStatus','updateProfile','createPlayer','updateRecord','deleteCandidate','cancelAchievement','restoreChange','managementTables','managementTable','saveManagementRow','createCandidate','saveInterviewReview','saveCandidateProfile','saveClient','analyzeInterviewReviews','readInterviewAdvice','readWorkspaceInsights','analyzeWorkspaceInsights','readWritingKit','generateWritingKit','readWritingPreferences','saveWritingPreferences','publishTeamCandidate','unpublishTeamCandidate','saveTeamComment','saveTeamJob','stageMigrationBatch','applyMigrationItem','mutateRewards','saveWorkJob','saveProposalPlan','recordProposalSent','saveMatchReport','completeMatchEvidence'].indexOf(action) < 0) fail_('BAD_REQUEST', '対応していない操作です。');
  if (action === 'readWritingKit') return readWritingKit_(request);
  if (action === 'generateWritingKit') return generateWritingKit_(request);
  if (action === 'readWritingPreferences') return readWritingPreferences_(request);
  if (action === 'saveWritingPreferences') return saveWritingPreferences_(request);
  if (action === 'readWorkspaceInsights') return readWorkspaceInsights_(request);
  if (action === 'analyzeWorkspaceInsights') return analyzeWorkspaceInsights_(request);
  if (action === 'analyzeInterviewReviews') return analyzeInterviewReviews_(request);
  if (action === 'readInterviewAdvice') return readInterviewAdvice_(request);
  if (action === 'managementTables' || action === 'managementTable') {
    var session = authenticate_(request.token), accounts = readAccountStore_(), actor = activeActor_(accounts,session);
    requireAdmin_(actor);
    var data = action === 'managementTables' ? managementTables_(accounts.book) : managementTable_(accounts.book,request.payload || {});
    requireAdmin_(snapshotActor_(accounts,request.token)); return data;
  }
  if (action === 'snapshot') {
    // The read budget above has already authenticated this token before any sheet read.
    var unchanged = firestoreUnchangedSnapshot_(request, budgeted);
    if (unchanged) return unchanged;
    var snapshotStore = readStore_({ readOnly: true }), snapshot = authenticatedSnapshot_(snapshotStore, request.token);
    // Older frontends ignore this field; the current one reports the input again on the next poll.
    if (budgeted && budgeted.touchDeferred) snapshot.activityDeferred = true;
    return snapshot;
  }
  var committed = withLock_(function () {
    // A session that still holds an issued password may only log out here (see authenticate_).
    var user = authenticate_(request.token, action === 'logout', action === 'logout');
    if (action === 'logout') { props_().deleteProperty(sessionKey_(request.token)); return { loggedOut: true }; }
    var activity = request.payload && request.payload.activity;
    var existingRow = ['saveWorkJob','saveProposalPlan','saveMatchReport','completeMatchEvidence','publishTeamCandidate','unpublishTeamCandidate','saveTeamComment','saveTeamJob','stageMigrationBatch','applyMigrationItem','mutateRewards','saveInterviewReview','saveCandidateProfile','saveClient','updateStatus','updateRecord','deleteCandidate','cancelAchievement'].indexOf(action) >= 0 || action === 'saveActivity' && activity && activity.recordId;
    // Existing-row edits only need named candidate rows. New rows still inspect
    // the entire template, preserving blank-row and formula protection.
    if(action==='applyMigrationItem'&&request.payload&&request.payload.mode==='candidate')existingRow=false;
    var store = readStore_({ readOnly: !!existingRow });
    user = activeActor_(store, user);
    if (!store.schemaCompatible) fail_('SCHEMA_MISMATCH','入力対象19列の見出しまたは順序が一致しません。管理者が実際の列を確認してください。');
    if (!writesEnabled_(store.config)) fail_('WRITES_DISABLED', '現在は読み取り専用です。管理者による接続先の書き込み設定が必要です。');
    var operationId = shortText_(request.operationId, 128, true);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(operationId)) fail_('BAD_REQUEST', '保存操作のIDが必要です。');
    var payload = request.payload || {};
    guardProbeBusinessMutation_(store,user,action,payload);
    var payloadHash = hash_(stableJson_({ action: action, payload: payload }));
    var previous = operation_(store, operationId);
    if (previous) {
      if (previous.actorId !== user.id || previous.action !== action || previous.payloadHash !== payloadHash) fail_('OPERATION_CONFLICT', '同じ保存IDを別の内容に使うことはできません。');
      // A replay writes nothing, so a replay answered with a full snapshot is a read and spends the
      // snapshot budget. A receipt replay (the outbox retry) stays free, as genuine writes do.
      if ((!teamMutationAction_(action)&&request.responseMode !== 'receipt') || action === 'createPlayer') readBudget_(user.id, 'snapshot');
      return { user:user, result:previous.result, operationId:operationId, config:store.config };
    }
    var plan;
    if (action === 'stageMigrationBatch') plan = planMigrationBatch_(store,user,payload);
    if (action === 'applyMigrationItem') plan = planApplyMigration_(store,user,payload);
    if (action === 'mutateRewards') plan = planRewards_(store,user,payload);
    if(action==='saveWorkJob')plan=planWorkJob_(store,user,payload);
    if(action==='saveProposalPlan')plan=planProposalPlan_(store,user,payload);
    if(action==='recordProposalSent')plan=planProposalSent_(store,user,payload);
    if(action==='saveMatchReport')plan=planMatchReport_(store,user,payload);
    if(action==='completeMatchEvidence')plan=planCompleteMatchEvidence_(store,user,payload);
    if (action === 'saveInterviewReview') plan = planInterviewReview_(store,user,payload);
    if (action === 'saveActivity') plan = planActivity_(store, user, payload.activity);
    if (action === 'updateStatus') plan = planStatus_(store, user, payload);
    if (action === 'updateProfile') plan = planProfile_(store, user, payload.player);
    if (action === 'createPlayer') plan = planPlayer_(store, user, payload, operationId);
    if (action === 'createCandidate') plan = planCandidate_(store,user,payload);
    if (action === 'saveCandidateProfile') plan = planCandidateProfile_(store,user,payload);
    if (action === 'saveClient') plan = planClient_(store,user,payload);
    if (action === 'publishTeamCandidate') plan = planTeamCandidate_(store,user,payload);
    if (action === 'unpublishTeamCandidate') plan = planUnpublishTeamCandidate_(store,user,payload);
    if (action === 'saveTeamComment') plan = planTeamComment_(store,user,payload);
    if (action === 'saveTeamJob') plan = planTeamJob_(store,user,payload);
    if (action === 'updateRecord') plan = planRecord_(store,user,payload);
    if (action === 'deleteCandidate') plan = planDeleteCandidate_(store,user,payload,operationId);
    if (action === 'cancelAchievement') plan = planCancelAchievement_(store,user,payload);
    if (action === 'restoreChange') plan = planRestoreChange_(store,user,payload);
    if (action === 'saveManagementRow') plan = planManagementRow_(store,user,payload);
    commit_(store, user, action, operationId, payloadHash, plan, request.token);
    return { user:user, result:plan.result || {}, operationId:operationId, config:store.config, secret:plan.secret };
  });
  if (action === 'logout') return committed;
  try {
    if ((request.responseMode === 'receipt' || teamMutationAction_(action)) && action !== 'createPlayer') {
      // The atomic batch and its idempotency record have completed. Return a
      // receipt without making the caller wait for a second business-table scan.
      var accounts = readAccountStore_(), actor = activeActor_(accounts, authenticate_(request.token));
      if (actor.id !== committed.user.id || actor.role !== committed.user.role || stableJson_(accounts.config) !== stableJson_(committed.config)) fail_('INTERNAL', '保存結果を再確認してください。同じ内容で再試行できます。');
      var receipt = { committed:true, operationId:committed.operationId };
      if (committed.result.undo) receipt.changeId=committed.operationId;
      return receipt;
    }
    // The atomic write is complete. Do not make other writers wait for a fresh
    // dashboard read, and do not fetch thousands of formula-only template rows.
    var freshStore = readStore_({ readOnly:true });
    return mutationResponse_(freshStore, committed.user, action, committed.result, committed.operationId, request.token, committed.secret);
  } catch (error) {
    // A post-commit validation/read failure cannot prove that the write failed.
    // Keep its original operation ID for retry; expired sessions still log out.
    if (['AUTH_REQUIRED','UNAUTHENTICATED','UNAUTHORIZED','SESSION_EXPIRED'].indexOf(error.nodeCode) >= 0) throw error;
    fail_('INTERNAL', '保存結果を再確認してください。入力は保持しています。同じ内容で再試行できます。');
  }
}

/* Authentication is entirely server-side. Tokens and passwords are never stored in sheet cells. */
function hash_(text) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8)).replace(/=+$/, ''); }
function hmac_(text, key) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(text), String(key), Utilities.Charset.UTF_8)).replace(/=+$/, ''); }
function random256_() { return hash_(Utilities.getUuid() + '|' + Utilities.getUuid() + '|' + Utilities.getUuid() + '|' + Date.now()); }
function pepper_() { return props_().getProperty(NODE.pepperKey) || fail_('NOT_CONFIGURED', '認証設定が必要です。'); }
/* Legacy record hash (no kdf field). Kept byte-for-byte so existing records still verify. */
function passwordHash_(password, salt) { return hmac_(String(password) + '|' + salt, pepper_()); }
/* pbkdf2p1: PBKDF2-HMAC-SHA256, one 32-byte block, keyed by HMAC(pepper, password), so a copy of
 * the records alone cannot be attacked without the pepper. Salts written here are ASCII. */
function stretchedHash_(password, salt, iterations) {
  var signedKey=Utilities.computeHmacSha256Signature('kdf-v2|'+String(password),pepper_(),Utilities.Charset.UTF_8);
  var key=new Uint8Array(signedKey),saltBytes=new Uint8Array(salt.length),derived,signedOutput=[];
  for(var i=0;i<salt.length;i++)saltBytes[i]=salt.charCodeAt(i);
  try {
    derived=NODE_PASSWORD_KDF.derive(key,saltBytes,iterations);
    // Apps Script Byte[] uses signed bytes. Preserve the existing base64url encoding exactly.
    for(var j=0;j<derived.length;j++)signedOutput.push(derived[j]>127?derived[j]-256:derived[j]);
    return Utilities.base64EncodeWebSafe(signedOutput).replace(/=+$/,'');
  } finally {
    key.fill(0);if(derived)derived.fill(0);
    for(var k=0;k<signedKey.length;k++)signedKey[k]=0;
    for(var n=0;n<signedOutput.length;n++)signedOutput[n]=0;
  }
}
/* Records keep their own round count, so a corrupted value is bounded, yet a later lower constant never rejects a stronger record. */
function kdfMaxIterations_() { return Math.max(100000, NODE.kdfIterations * 10); }
function makeAuth_(password) { var salt = random256_(); return { salt: salt, hash: stretchedHash_(password, salt, NODE.kdfIterations), kdf: 'pbkdf2p1', iter: NODE.kdfIterations }; }
/* Server-generated random256_ secrets carry 256 bits, so stretching adds nothing and would hold
 * the script lock for every member during bulk issuance. They upgrade on first login.
 * An issued secret has been seen by the owner or an admin, so issuers mark it mustChange: it opens
 * only password change and logout until its holder replaces it. The fresh version makes every
 * session and device token from before the issue unable to match it, even one a scan missed.
 * Apps Script deploys before the frontend, and a frontend built before the forced change has no way
 * to reach its change screen, so the mark is written only once the owner sets the forceChangeKey
 * property after publishing the frontend. Until then an issued password works as it did before.
 * A record that already carries the mark stays enforced whatever the switch says. */
function forcedPasswordChange_() { return props_().getProperty(NODE.forceChangeKey) === 'true'; }
function makeGeneratedAuth_(secret, issued) { var salt = random256_(), auth = { salt: salt, hash: passwordHash_(secret, salt) }; if (issued === true) { auth.version = random256_(); if (forcedPasswordChange_()) auth.mustChange = true; } return auth; }
function passwordMatches_(password, auth) { return constantEqual_(auth.kdf === undefined ? passwordHash_(password, auth.salt) : stretchedHash_(password, auth.salt, auth.iter), auth.hash); }
/* Login verify. Unknown IDs, legacy records and current stretched records all cost one legacy HMAC
 * plus one stretch at NODE.kdfIterations. This equalizes KDF work, not total response timing;
 * the fresh-salt branches still perform additional UUID/digest work. The legacy
 * branch's stretch (fresh salt) is the record that replaces it after a successful login.
 * A stretched record below the constant pays its upgrade stretch whether or not the password is
 * right: it runs before the locked limits, so a correct guess that is then RATE_LIMITED must not
 * take longer than a wrong one. */
function verifyPassword_(password, auth) {
  var legacy = passwordHash_(password, auth ? auth.salt : 'unavailable');
  if (auth && auth.kdf !== undefined) { var valid = constantEqual_(stretchedHash_(password, auth.salt, auth.iter), auth.hash), upgrade = auth.iter < NODE.kdfIterations ? makeAuth_(password) : null; return { valid: valid, upgrade: valid ? upgrade : null }; }
  var upgrade = makeAuth_(password);
  return auth && constantEqual_(legacy, auth.hash) ? { valid: true, upgrade: upgrade } : { valid: false, upgrade: null };
}
/** Owner-only, editor-run before changing kdfIterations. Measure both the 500-round sample and
 * the actual current round count; do not extrapolate currentMs from the sample. No secret leaves
 * this function. The log contains numeric measurements only; overTarget is encoded as 0 or 1.
 * suggested keeps the existing 2000-round floor and never changes the configured constant. */
function benchmarkNodePasswordHash() {
  requireOwner_(); var sample=500,target=500,password=random256_(),salt=random256_(),started=Date.now();
  stretchedHash_(password,salt,sample);var ms=Math.max(1,Date.now()-started);
  var currentStarted=Date.now();stretchedHash_(password,salt,NODE.kdfIterations);
  var currentMs=Math.max(1,Date.now()-currentStarted),fit=Math.floor(target*NODE.kdfIterations/currentMs/500)*500,suggested=Math.max(2000,Math.min(20000,fit)),over=currentMs>target;
  Logger.log(JSON.stringify({sampleRounds:sample,sampleMs:ms,currentRounds:NODE.kdfIterations,currentMs:currentMs,targetMs:target,suggestedRounds:suggested,roundsForTarget:fit,overTarget:over?1:0}));
  return {sampleRounds:sample,ms:ms,suggested:suggested,current:NODE.kdfIterations,roundsForTarget:fit,currentMs:currentMs,targetMs:target,overTarget:over};
}
/** Owner-only compute probe. Fixtures exist in memory only: no real auth record, login, session,
 * business read, property/cache mutation or network call. These timings exclude the rest of login.
 * Each fixed case runs five times. p95 uses nearest rank (with five samples, it equals the maximum).
 * The output contains fixed case names and numeric timings/counts only; never fixture secrets. */
function benchmarkNodeAuthentication() {
  requireOwner_();
  var password=random256_(),wrong=password+'!',current=makeAuth_(password),legacy=makeGeneratedAuth_(password,false),count=5;
  var cases=[
    {name:'kdf-current-rounds',run:function(){var hash=stretchedHash_(password,current.salt,NODE.kdfIterations);if(typeof hash!=='string'||hash.length!==43)fail_('BENCHMARK_FAILED','認証計算の検証を完了できませんでした。');}},
    {name:'current-correct',auth:current,password:password,valid:true},
    {name:'current-wrong',auth:current,password:wrong,valid:false},
    {name:'legacy-correct',auth:legacy,password:password,valid:true},
    {name:'legacy-wrong',auth:legacy,password:wrong,valid:false},
    {name:'unknown',auth:null,password:wrong,valid:false}
  ];
  var result={rounds:NODE.kdfIterations,samplesPerCase:count,cases:cases.map(function(item){
    var samples=[];
    for(var i=0;i<count;i++){
      var started=Date.now();
      if(item.run)item.run();
      else {var check=verifyPassword_(item.password,item.auth);if(!check||check.valid!==item.valid)fail_('BENCHMARK_FAILED','認証計算の検証を完了できませんでした。');}
      samples.push(Math.max(0,Date.now()-started));
    }
    var sorted=samples.slice().sort(function(a,b){return a-b;});
    return {name:item.name,samplesMs:samples,minMs:sorted[0],medianMs:sorted[Math.floor(count/2)],p95Ms:sorted[Math.ceil(count*0.95)-1],maxMs:sorted[count-1]};
  })};
  Logger.log(JSON.stringify(result));return result;
}
function constantEqual_(a, b) {
  a = String(a || ''); b = String(b || ''); var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function sessionKey_(token) { return 'NODE_SESSION_' + hash_(token); }
function authRecord_(id) {
  var raw=props_().getProperty('NODE_AUTH_'+id),auth;
  try{auth=raw?JSON.parse(raw):null;}catch(_){return null;}
  if(!auth||typeof auth.salt!=='string'||typeof auth.hash!=='string'||auth.salt.length>200||auth.hash.length!==43||(auth.version!==undefined&&typeof auth.version!=='string')||(auth.mustChange!==undefined&&typeof auth.mustChange!=='boolean'))return null;
  // Stretched records: known scheme, ASCII salt and a bounded round count (a corrupted value cannot stall a login).
  if(auth.kdf!==undefined&&(auth.kdf!=='pbkdf2p1'||!/^[A-Za-z0-9_-]{43}$/.test(auth.salt)||typeof auth.iter!=='number'||auth.iter%1!==0||auth.iter<1||auth.iter>kdfMaxIterations_()))return null;
  if(auth.kdf===undefined&&auth.iter!==undefined)return null;
  return auth;
}
/* Only sessions opened by a frontend that reports activity (login with idleAware:true) are idle-checked.
 * Older bundles send nothing while a dialog is open or an input has focus, so idle-checking their
 * sessions would log out someone who is typing. Those sessions, and sessions issued before this
 * change, keep the 6-hour expiresAt only. */
function sessionLastSeen_(session) { return typeof session.lastSeenAt === 'number' && isFinite(session.lastSeenAt) ? session.lastSeenAt : null; }
function sessionIdle_(session, now) { var seen = sessionLastSeen_(session); return session.idleAware === true && seen !== null && now - seen >= NODE.sessionIdleMinutes * 60000; }
/* passive === true checks every limit but records no activity (background polls, re-checks, logout). */
function authenticate_(token, allowPasswordChange, passive) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail_('UNAUTHENTICATED', 'ログインしてください。');
  var key=sessionKey_(token),raw=props_().getProperty(key),session,now=Date.now();
  try{session=raw?JSON.parse(raw):null;}catch(_){session=null;}
  if (!session || typeof session.id!=='string' || typeof session.expiresAt!=='number' || !isFinite(session.expiresAt) || session.expiresAt <= now) { props_().deleteProperty(key); fail_('UNAUTHENTICATED', 'ログインの有効期限が切れました。'); }
  if (sessionIdle_(session, now)) { props_().deleteProperty(key); fail_('UNAUTHENTICATED', NODE.sessionIdleMinutes + '分以上操作がなかったため、ログアウトしました。もう一度ログインしてください。'); }
  var auth=authRecord_(session.id);
  if(!auth||(session.authVersion||null)!==(auth.version||null)){props_().deleteProperty(key);fail_('UNAUTHENTICATED','パスワードが更新されました。もう一度ログインしてください。');}
  // An issued password opens only password change and logout. Every other caller passes no flag and is
  // refused, including endpoints added later. The session is kept so its holder can still change it.
  if(auth.mustChange===true&&allowPasswordChange!==true)fail_('PASSWORD_CHANGE_REQUIRED','初期パスワードの変更が必要です。画面を再読み込みし、パスワードを変更してください。');
  var seen=sessionLastSeen_(session),result={ id: session.id };
  if(session.idleAware!==true)return result;
  // touchDeferred tells the caller a due refresh was not written, so its client reports the input again.
  if(passive!==true&&(seen===null||now-seen>=NODE.sessionTouchMinutes*60000)&&!touchSession_(key,raw,session,now))result.touchDeferred=true;
  return result;
}
/* Every revocation (logout, password change or reissue, cleanup, eviction, destination switch) runs
 * under the script lock, so a compare-and-set under that lock can never resurrect a deleted or
 * expiresAt:0 session. Reads never wait: a busy lock or failed write only defers the refresh.
 * Returns false only when the refresh was deferred. A session changed meanwhile is not deferred:
 * another request refreshed it, or it was revoked and the next request fails anyway. */
function touchSession_(key, raw, session, now) {
  var lock = nodeLockDepth_ > 0 ? null : LockService.getScriptLock();
  try {
    if (lock && !lock.tryLock(0)) { lock = null; return false; }
    if (props_().getProperty(key) !== raw) return true;
    session.lastSeenAt = now;
    props_().setProperty(key, JSON.stringify(session));
    return true;
  } catch (_) { return false;
  } finally { if (lock) lock.releaseLock(); }
}
function activeActor_(store, session) {
  var player = store.players.find(function (p) { return p.id === session.id && p.active; });
  if (!player) fail_('UNAUTHENTICATED', 'このアカウントは利用できません。');
  return { id: player.id, role: player.role };
}
function login_(payload) {
  // The stretched password check, device checks and the roster read run unlocked. Only
  // short sections for the rate counters and session registration take the write lock,
  // with a short wait, so a login flood fails fast instead of queueing behind saves.
  // Fetching the business table afterwards must not queue every player's login.
  var issued = issueSession_(payload);
  // An issued password grants no business data until its holder replaces it.
  if (issued.mustChange) return { token: issued.token, deviceToken: issued.deviceToken, mustChangePassword: true };
  if (payload.sessionOnly === true) {
    var result={token:issued.token,deviceToken:issued.deviceToken};
    if(payload.cacheSnapshot===true){var actor=activeActor_(issued.accountStore,authenticate_(issued.token));result.cacheAccess=snapshotCacheAccess_(issued.accountStore,actor);snapshotActor_(issued.accountStore,issued.token);}
    return result;
  }
  try {
    // Legacy logins return a full snapshot, so they share the snapshot budget. It is charged only
    // after the password check, so a wrong guess cannot spend another account's budget.
    readBudget_(issued.id, 'snapshot');
    var store = readStore_({ readOnly: true }, issued.accountStore);
    return { token: issued.token, deviceToken: issued.deviceToken, snapshot: authenticatedSnapshot_(store, issued.token) };
  } catch (error) { props_().deleteProperty(sessionKey_(issued.token)); throw error; }
}
/* A device that has logged in before carries a signed token. Its failures use a
 * separate bucket, so anonymous guessing against a public ID cannot lock the
 * owner out of a known device. The token is not a credential by itself. */
function deviceSignature_(id, authVersion, expiresAt, nonce) { return hmac_('device-v1|' + id + '|' + (authVersion || '') + '|' + expiresAt + '|' + nonce, props_().getProperty(NODE.pepperKey) || fail_('NOT_CONFIGURED', '認証設定が必要です。')); }
function makeDeviceToken_(id, auth) { var expiresAt = Date.now() + NODE.deviceDays * 86400000, nonce = random256_(); return ['d1', expiresAt, nonce, deviceSignature_(id, auth.version, expiresAt, nonce)].join('.'); }
function trustedDevice_(id, auth, token) {
  if (!auth || typeof token !== 'string' || token.length > 200) return false;
  var parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'd1' || !/^\d{13}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[3])) return false;
  var expiresAt = Number(parts[1]);
  if (expiresAt <= Date.now() || expiresAt > Date.now() + NODE.deviceDays * 86400000) return false;
  return constantEqual_(parts[3], deviceSignature_(id, auth.version, expiresAt, parts[2]));
}
function readRate_(key, now, windowMs, field) {
  var rate; try { rate = JSON.parse(props_().getProperty(key) || 'null'); } catch (_) { rate = null; }
  if (!rate || typeof rate.start !== 'number' || typeof rate[field] !== 'number' || now - rate.start >= windowMs) { rate = { start: now }; rate[field] = 0; }
  return rate;
}
/* An invented ID gets an account bucket's fixed window: it starts at the first counted attempt and ends
 * 15 minutes later however often the ID is retried, and an attempt that is already limited is not counted.
 * So an invented ID changes its answer at the same moments an account would. Cache entries expire on their
 * own (TTL = what is left of the window), so invented IDs never consume script properties. */
function unknownIdLimited_(id, now, globalLimited) {
  var windowMs = 15 * 60 * 1000;
  try {
    var cache = CacheService.getScriptCache(), key = 'NODE_LOGIN_ID_' + hash_(id), state;
    try { state = JSON.parse(cache.get(key) || 'null'); } catch (_) { state = null; }
    // A bare count was written before the fixed window; it starts one now.
    if (typeof state === 'number' && isFinite(state) && state >= 0) state = { start: now, failures: Math.floor(state) };
    if (!state || typeof state !== 'object' || typeof state.start !== 'number' || typeof state.failures !== 'number' || !isFinite(state.start) || !isFinite(state.failures) || state.start > now || now - state.start >= windowMs) state = { start: now, failures: 0 };
    if (globalLimited || state.failures >= NODE.loginFailures) return true;
    state.failures++;
    cache.put(key, JSON.stringify(state), Math.max(1, Math.ceil((state.start + windowMs - now) / 1000)));
    return false;
  } catch (_) { return globalLimited; }
}
function sameAuth_(a, b) { return !a && !b || !!a && !!b && a.salt === b.salt && a.hash === b.hash && (a.version || null) === (b.version || null) && (a.mustChange === true) === (b.mustChange === true); }
function dummyStretchAllowed_(now) {
  // Invented IDs pay the same KDF run as accounts, but from one script-wide budget per minute,
  // so a flood of new IDs cannot buy unbounded CPU. Past it they answer without the run.
  try { var cache = CacheService.getScriptCache(), key = 'NODE_LOGIN_KDF_' + Math.floor(now / 60000), count = (Number(cache.get(key)) || 0) + 1; cache.put(key, String(count), 120); return count <= NODE.loginAttemptsPerMinute; }
  catch (_) { return false; }
}
function issueSession_(payload) {
  var config = config_();
  var id = typeof payload.id === 'string' && payload.id.length <= 30 ? payload.id.trim().toUpperCase() : '';
  var password = typeof payload.password === 'string' && payload.password.length <= 200 ? payload.password : '';
  var auth = id ? authRecord_(id) : null, now = Date.now(), trusted = trustedDevice_(id, auth, payload.deviceToken);
  var rateKey = trusted ? 'NODE_RATE_DEV_' + hash_(payload.deviceToken) : auth ? 'NODE_RATE_' + hash_(id) : 'NODE_RATE_UNKNOWN';
  var limited = 'ログイン試行が多すぎます。時間をおいて再試行してください。', invalid = 'IDまたはパスワードを確認してください。', changed = 'ログイン情報が更新されました。もう一度ログインしてください。';
  var failureWindow = 15 * 60 * 1000, globalWindow = 60 * 1000, perMinute = NODE.loginAttemptsPerMinute;
  // Unlocked pre-checks read the counters the locked section re-reads. Counters only change
  // under the lock, so a rejection here is one the lock would also make, and a full bucket
  // costs neither a KDF run nor a lock wait.
  var rate = readRate_(rateKey, now, failureWindow, 'failures'), globalRate = readRate_('NODE_LOGIN_RATE', now, globalWindow, 'attempts');
  if (!auth) {
    // Answer an unknown ID exactly like an account: invalid for five tries, then limited until the window ends.
    if (unknownIdLimited_(id, now, globalRate.attempts >= perMinute)) fail_('RATE_LIMITED', limited);
  } else if (rate.failures >= NODE.loginFailures || !trusted && globalRate.attempts >= perMinute) fail_('RATE_LIMITED', limited);
  // The expensive check runs outside the lock and costs the same for unknown, legacy and stretched records.
  var costed = !!auth || dummyStretchAllowed_(now), check = costed ? verifyPassword_(password, auth) : { valid: false, upgrade: null };
  // A full shared bucket for invented IDs has nothing left to count.
  if (!auth && rate.failures >= NODE.loginFailures) fail_('INVALID_CREDENTIALS', invalid);
  withLock_(function () {
    // A reissue or password change may have landed during the unlocked check. Records reissued
    // before issued passwords carried a version have none, so the session version alone cannot reject the old password.
    if (!sameAuth_(id ? authRecord_(id) : null, auth)) fail_('BUSY', changed);
    var now = Date.now(), rate = readRate_(rateKey, now, failureWindow, 'failures'), globalRate = readRate_('NODE_LOGIN_RATE', now, globalWindow, 'attempts');
    if (!auth) {
      // The shared bucket bounds properties and the global budget for invented IDs.
      if (globalRate.attempts >= perMinute) fail_('RATE_LIMITED', limited);
      if (rate.failures < NODE.loginFailures) { globalRate.attempts++; props_().setProperty('NODE_LOGIN_RATE', JSON.stringify(globalRate)); rate.failures++; props_().setProperty(rateKey, JSON.stringify(rate)); }
      fail_('INVALID_CREDENTIALS', invalid);
    }
    if (rate.failures >= NODE.loginFailures || !trusted && globalRate.attempts >= perMinute) fail_('RATE_LIMITED', limited);
    if (!trusted) { globalRate.attempts++; props_().setProperty('NODE_LOGIN_RATE', JSON.stringify(globalRate)); }
    // Only a wrong password is counted here, so a correct one cannot lock its owner out even when the next section times out.
    if (!check.valid) { rate.failures++; props_().setProperty(rateKey, JSON.stringify(rate)); fail_('INVALID_CREDENTIALS', invalid); }
  }, NODE.loginLockMs);
  // Only a correct password reads the roster, so wrong guesses never spend the owner's Sheets quota.
  // A correct password for a disabled account is still answered and counted like a wrong one.
  var store = readAccountStore_(config), actor = store.players.find(function (p) { return p.id === id && p.active; });
  var token = withLock_(function () {
    var current = authRecord_(id);
    if (!sameAuth_(current, auth)) fail_('BUSY', changed);
    // A destination switch clears every session under this lock; never register one validated against the old roster.
    if (stableJson_(config_()) !== stableJson_(config)) fail_('BUSY', '管理設定が更新されました。もう一度ログインしてください。');
    if (!actor) { var rate = readRate_(rateKey, Date.now(), failureWindow, 'failures'); rate.failures++; props_().setProperty(rateKey, JSON.stringify(rate)); fail_('INVALID_CREDENTIALS', invalid); }
    props_().deleteProperty(rateKey);
    // Lazy upgrade keeps the credential version, so sessions and device tokens stay valid, and keeps
    // an issued password's change requirement. Best effort: the old record still verifies, so a failed
    // write only retries next login.
    if (check.upgrade) { if (current.version !== undefined) check.upgrade.version = current.version; if (current.mustChange === true) check.upgrade.mustChange = true; try { props_().setProperty('NODE_AUTH_' + id, JSON.stringify(check.upgrade)); } catch (_) {} }
    cleanupSessions_();
    var token = random256_();
    registerSession_(id, token, auth.version || null, payload.idleAware === true);
    return token;
  }, NODE.loginLockMs);
  return { id: id, token: token, deviceToken: makeDeviceToken_(id, auth), accountStore: store, mustChange: auth.mustChange === true };
}
function sessionIndexKey_(id) {return 'NODE_SESSIONS_INDEX_'+hash_(id);}
function parseSession_(raw) {try{var session=JSON.parse(raw),now=Date.now();return session&&typeof session.id==='string'&&typeof session.expiresAt==='number'&&isFinite(session.expiresAt)&&session.expiresAt>now&&!sessionIdle_(session,now)?session:null;}catch(_){return null;}}
function registerSession_(id,token,authVersion,idleAware) {
  var properties=props_(),index=[];
  try{index=JSON.parse(properties.getProperty(sessionIndexKey_(id))||'[]');}catch(_){}
  if(!Array.isArray(index))index=[];
  index=index.filter(function(key){if(typeof key!=='string'||!/^NODE_SESSION_[A-Za-z0-9_-]{43}$/.test(key))return false;var session=parseSession_(properties.getProperty(key));return session&&session.id===id;});
  while(index.length>=NODE.sessionsPerAccount)properties.deleteProperty(index.shift());
  var key=sessionKey_(token),now=Date.now();
  var record={id:id,issuedAt:now,lastSeenAt:now,expiresAt:now+NODE.sessionHours*3600000,authVersion:authVersion};if(idleAware===true)record.idleAware=true;
  properties.setProperty(key,JSON.stringify(record));
  index.push(key);
  try{properties.setProperty(sessionIndexKey_(id),JSON.stringify(index));}catch(error){properties.deleteProperty(key);throw error;}
}
function cleanupSessions_() {
  var now = Date.now(), last = Number(props_().getProperty('NODE_CLEANUP_AT'));
  if (isFinite(last) && last <= now && now - last < 60000) return;
  var all = props_().getProperties(),groups=Object.create(null);
  Object.keys(all).forEach(function (key) {
    if (!/^NODE_SESSION_[A-Za-z0-9_-]{43}$/.test(key)) return;
    var session=parseSession_(all[key]);
    if(!session){props_().deleteProperty(key);return;}
    if(!groups[session.id])groups[session.id]=[];
    // Over the per-account cap, the least recently used session goes first.
    groups[session.id].push({key:key,time:sessionLastSeen_(session)!==null?session.lastSeenAt:session.issuedAt||session.expiresAt-NODE.sessionHours*3600000});
  });
  Object.keys(groups).forEach(function(id){var sessions=groups[id].sort(function(a,b){return a.time-b.time;});while(sessions.length>NODE.sessionsPerAccount)props_().deleteProperty(sessions.shift().key);props_().setProperty(sessionIndexKey_(id),JSON.stringify(sessions.map(function(s){return s.key;})));});
  Object.keys(all).forEach(function (key) {
    if (!/^NODE_RATE_(?:DEV_)?[A-Za-z0-9_-]{43}$/.test(key) && key !== 'NODE_RATE_UNKNOWN') return;
    var rate; try { rate = JSON.parse(all[key]); } catch (_) { rate = null; }
    if (!rate || typeof rate.start !== 'number' || now - rate.start >= 15 * 60 * 1000) props_().deleteProperty(key);
  });
  props_().setProperty('NODE_CLEANUP_AT', String(now));
}
function changePassword_(request) {
  // Both KDF runs happen before the write lock, and only for a live session with a well-formed,
  // not rate-limited request, so the lock holds no stretch and anonymous calls buy none.
  // Password change is the one business action an issued password may perform.
  var early=request.payload||{},current=early.currentPassword,next=early.newPassword,session=authenticate_(request.token,true,true),seen=null,matches=false,prepared=null;
  if(typeof current==='string'&&current.length<=200&&typeof next==='string'&&next.length>=12&&next.length<=200&&!/[\u0000-\u001f\u007f]/.test(next)&&next!==current&&readRate_('NODE_RATE_'+hash_(session.id),Date.now(),15*60000,'failures').failures<5){seen=authRecord_(session.id);matches=!!seen&&passwordMatches_(current,seen);prepared=makeAuth_(next);}
  return withLock_(function(){
    var session=authenticate_(request.token,true,true),accounts=readAccountStore_(),user=activeActor_(accounts,session),payload=request.payload||{};
    var current=payload.currentPassword,next=payload.newPassword;
    if(typeof current!=='string'||current.length>200||typeof next!=='string'||next.length<12||next.length>200||/[\u0000-\u001f\u007f]/.test(next)||next===current)fail_('VALIDATION','新しいパスワードは現在と異なる12〜200文字で入力してください。');
    var properties=props_(),rateKey='NODE_RATE_'+hash_(user.id),rate;
    try{rate=JSON.parse(properties.getProperty(rateKey)||'null');}catch(_){rate=null;}
    if(!rate||typeof rate.start!=='number'||typeof rate.failures!=='number'||Date.now()-rate.start>=15*60000)rate={start:Date.now(),failures:0};
    if(rate.failures>=5)fail_('RATE_LIMITED','パスワードの確認回数が多すぎます。時間をおいて再試行してください。');
    var auth=authRecord_(user.id);
    // The unlocked check stands only while the record is unchanged; otherwise verify again here.
    var currentMatches=!!auth&&(user.id===session.id&&sameAuth_(auth,seen)?matches:passwordMatches_(current,auth));
    if(!currentMatches){rate.failures++;properties.setProperty(rateKey,JSON.stringify(rate));fail_('INVALID_CREDENTIALS','現在のパスワードを確認してください。');}
    snapshotActor_(accounts,request.token,true);
    var all=properties.getProperties(),revoke={};
    Object.keys(all).forEach(function(key){if(!/^NODE_SESSION_[A-Za-z0-9_-]{43}$/.test(key))return;var old=parseSession_(all[key]);if(old&&old.id===user.id)revoke[key]=JSON.stringify({id:user.id,expiresAt:0});});
    if(Object.keys(revoke).length){properties.setProperties(revoke,false);if(Object.keys(revoke).some(function(key){return properties.getProperty(key)!==revoke[key];}))fail_('INTERNAL','ログイン状態を更新できませんでした。もう一度ログインしてからパスワードを変更してください。');}
    // makeAuth_ writes no mustChange, so the new record clears the requirement and its version revokes the issued session.
    var updated=prepared||makeAuth_(next);updated.version=random256_();var serialized=JSON.stringify(updated),authKey='NODE_AUTH_'+user.id;
    // A credential version also revokes any legacy session missed by cleanup.
    // Check the persisted value if Google reports an ambiguous property write.
    try{properties.setProperty(authKey,serialized);}catch(error){if(properties.getProperty(authKey)!==serialized)throw error;}
    if(properties.getProperty(authKey)!==serialized)fail_('INTERNAL','パスワードの保存を確認できませんでした。新旧どちらかのパスワードでログインを確認してください。');
    properties.deleteProperty(rateKey);properties.deleteProperty(sessionIndexKey_(user.id));
    return {changed:true};
  });
}
/* Account administration keeps login availability separate from historical ownership. */
function accountRowFingerprint_(player) {return hash_(stableJson_([player.id,player.name,player.team,player.color,player.target,player.bio,player.sheetNames,player.role,player.active,player.row]));}
function accountManagementVersion_(player,auth) {return accountRowFingerprint_(player)+'.'+hash_(stableJson_(auth?[auth.salt,auth.hash,auth.kdf||'',auth.iter||0,auth.version||'',auth.mustChange===true]:null));}
function accountManagementStore_(token) {
  var session=authenticate_(token),accounts=readAccountStore_(),actor=activeActor_(accounts,session);requireAdmin_(actor);assertManagedBook_(accounts.book);
  var ids={};accounts.players.forEach(function(player){if(ids[player.id])fail_('SCHEMA_MISMATCH','名簿のIDが重複しています。');ids[player.id]=true;});
  accounts.operationSheet=accounts.book.getSheetByName(NODE.operationsTab);return {store:accounts,actor:actor};
}
function accountManagementEntry_(player) {var auth=authRecord_(player.id);return {id:player.id,name:player.name,team:player.team,role:player.role,active:player.active,sheetNames:player.sheetNames.slice(),target:player.target,version:accountManagementVersion_(player,auth),hasCredentials:!!auth};}
function readAccountManagement_(request) {
  var access=accountManagementStore_(request.token),store=access.store;
  var result={checkedAt:new Date().toISOString(),accounts:store.players.map(accountManagementEntry_),canManageAccounts:writesEnabled_(store.config)&&store.book.getSpreadsheetTimeZone()==='Asia/Tokyo'};
  requireAdmin_(snapshotActor_(store,request.token));return result;
}
function manageAccount_(request) {
  return withLock_(function(){
    var access=accountManagementStore_(request.token),store=access.store,actor=access.actor,payload=request.payload||{};
    if(!writesEnabled_(store.config))fail_('WRITES_DISABLED','現在は読み取り専用です。');
    if(store.book.getSpreadsheetTimeZone()!=='Asia/Tokyo')fail_('TIMEZONE','管理シートのタイムゾーンを確認してください。');
    var playerId=shortText_(payload.playerId,30,true),action=choice_(payload.action,['stop','resume','revokeSessions']),expected=shortText_(payload.expectedVersion,100,true),operationId=shortText_(request.operationId,128,true);
    if(!/^[A-Za-z0-9_-]{16,128}$/.test(operationId)||!/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(expected))fail_('VALIDATION','最新のアカウント情報と操作IDを確認してください。');
    var target=store.players.find(function(player){return player.id===playerId;});
    if(!target||target.role!=='player'||target.id===actor.id)fail_('FORBIDDEN','プレイヤーのアカウントだけ操作できます。');
    var payloadHash=hash_(stableJson_({action:'manageAccount',payload:{playerId:playerId,action:action,expectedVersion:expected}})),previous=operation_(store,operationId);
    if(previous){
      if(previous.actorId!==actor.id||previous.action!=='manageAccount'||previous.payloadHash!==payloadHash)fail_('OPERATION_CONFLICT','同じ操作IDを別の内容に使うことはできません。');
      requireAdmin_(snapshotActor_(store,request.token));var replayEntry=accountManagementEntry_(target);
      return {managed:true,operationId:operationId,playerId:playerId,action:action,active:replayEntry.active,version:replayEntry.version,replayed:true};
    }
    var auth=authRecord_(playerId),currentVersion=accountManagementVersion_(target,auth),revocationVersion=hmac_('account-action-v1|'+actor.id+'|'+operationId+'|'+payloadHash,pepper_());
    // A property write may have succeeded before a failed/ambiguous Sheets batch. Same-ID retries
    // resume only this exact revocation while the complete roster row still has its original fingerprint.
    var recovering=!!auth&&auth.version===revocationVersion&&expected.split('.')[0]===accountRowFingerprint_(target);
    if(currentVersion!==expected&&!recovering)fail_('CONFLICT','アカウント情報が更新されています。最新の情報を取得してください。');
    var active=action==='stop'?false:action==='resume'?true:target.active;
    if(action==='resume'){if(!auth)fail_('VALIDATION','認証情報が未設定のため復帰できません。所有者が設定を確認してください。');validateAliases_(store,target.sheetNames,target.id);}
    if(!auth&&action==='revokeSessions')fail_('VALIDATION','認証情報が未設定です。');
    if(store.playerSheet.getRange(target.row,1,1,NODE.playerHeaders.length).getFormulas()[0].some(Boolean))fail_('FORMULA_PROTECTED','アカウントの入力先に数式があります。');
    requireAdmin_(snapshotActor_(store,request.token));
    var fresh=readPlayers_(store.playerSheet).find(function(player){return player.id===playerId;});
    if(!fresh||accountRowFingerprint_(fresh)!==accountRowFingerprint_(target))fail_('CONFLICT','名簿が更新されています。再取得してください。');
    if(auth){
      if(!sameAuth_(authRecord_(playerId),auth))fail_('CONFLICT','認証情報が更新されています。再取得してください。');
      var updated=Object.assign({},auth,{version:revocationVersion}),serialized=JSON.stringify(updated),key='NODE_AUTH_'+playerId;
      try{props_().setProperty(key,serialized);}catch(error){if(props_().getProperty(key)!==serialized)throw error;}
      if(props_().getProperty(key)!==serialized)fail_('INTERNAL','ログインの失効を確認できませんでした。同じ操作IDで再試行してください。');
    }
    // Revocation precedes activation: even a manually stopped account cannot revive an old session.
    // No password/hash/salt changes. Old session and device tokens fail their credential-version check.
    var resulting=Object.assign({},target,{active:active}),result={playerId:playerId,accountAction:action,active:active,version:accountManagementVersion_(resulting,auth?updated:null)};
    requireAdmin_(snapshotActor_(store,request.token));
    fresh=readPlayers_(store.playerSheet).find(function(player){return player.id===playerId;});
    if(!fresh||accountRowFingerprint_(fresh)!==accountRowFingerprint_(target))fail_('CONFLICT','名簿が更新されています。再取得してください。');
    sheetsBatch_(store.config.spreadsheetId,[rowUpdateAccountActive_(store.playerSheet.getSheetId(),target.row,active),{appendCells:{sheetId:store.operationSheet.getSheetId(),rows:[{values:[operationId,actor.id,'manageAccount',payloadHash,JSON.stringify(result),new Date().toISOString()].map(cell_)}],fields:'userEnteredValue'}}]);
    var final=accountManagementStore_(request.token);if(stableJson_(final.store.config)!==stableJson_(store.config))fail_('BUSY','管理設定が更新されました。再取得してください。');
    var finalTarget=final.store.players.find(function(player){return player.id===playerId;});if(!finalTarget||finalTarget.role!=='player')fail_('CONFLICT','名簿が更新されています。再取得してください。');var entry=accountManagementEntry_(finalTarget);
    return {managed:true,operationId:operationId,playerId:playerId,action:action,active:entry.active,version:entry.version,replayed:false};
  });
}
function rowUpdateAccountActive_(sheetId,row,active){return {updateCells:{range:{sheetId:sheetId,startRowIndex:row-1,endRowIndex:row,startColumnIndex:8,endColumnIndex:9},rows:[{values:[cell_(active)]}],fields:'userEnteredValue'}};}
var NODE_OPERATION_SUMMARIES=Object.freeze({publishIntroductionV2:'保存した紹介文を社内共有',saveMetricGoals:'7工程の月別目標を更新',saveWorkJob:'案件条件を更新',saveProposalPlan:'提案先の検討を保存',recordProposalSent:'会社への提案実績を記録',saveMatchReport:'マッチ報告を更新',saveIntroductionV2:'紹介文の基本情報・職歴を保存',saveIntroductionSettings:'紹介文の共通設定を更新',beginMatchEvidence:'合意資料の添付を開始',completeMatchEvidence:'合意資料を非公開保存',stageMigrationBatch:'過去データの原文を保管',applyMigrationItem:'過去データを業務データへ登録',mutateRewards:'ポイント・特典を更新',publishTeamCandidate:'候補者紹介文を社内共有',unpublishTeamCandidate:'候補者の社内共有を停止',saveTeamComment:'社内コメントを更新',saveTeamJob:'募集案件を更新',saveActivity:'実績日を登録',updateStatus:'進捗を更新',updateProfile:'プロフィール・目標を更新',createPlayer:'プレイヤーIDを発行',createCandidate:'候補者を登録',saveCandidateProfile:'候補者の基本情報を更新',saveClient:'取引先を更新',updateRecord:'候補者の進捗・実績を更新',deleteCandidate:'候補者・提案を削除',cancelAchievement:'実績を取り消し',restoreChange:'変更を復元',saveManagementRow:'管理表を更新',saveInterviewReview:'面談の振り返りを保存',manageAccount:'アカウントの利用状態を管理',saveMonthlyTarget:'月別目標を更新'});
function readOperationHistory_(request) {
  var access=accountManagementStore_(request.token),store=access.store,payload=request.payload||{},limit=payload.limit===undefined?25:payload.limit,cursor=payload.cursor;
  if(!Number.isInteger(limit)||limit<1||limit>50||cursor!==undefined&&(!Number.isInteger(cursor)||cursor<2))fail_('VALIDATION','履歴の表示範囲を確認してください。');
  operationSheetHeader_(store.operationSheet);var last=store.operationSheet.getLastRow(),end=Math.min(last,cursor===undefined?last:cursor),start=Math.max(2,end-limit+1),rows=[],times=[];
  // Never load hashes, result bodies or undo content, even for an administrator's history page.
  if(end>=2){rows=store.operationSheet.getRange(start,2,end-start+1,2).getValues();times=store.operationSheet.getRange(start,6,end-start+1,1).getValues();}
  var entries=rows.map(function(row,i){var known=Object.prototype.hasOwnProperty.call(NODE_OPERATION_SUMMARIES,String(row[1])),time=times[i]&&times[i][0];return {row:start+i,committedAt:typeof time==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(time)&&isFinite(Date.parse(time))?new Date(time).toISOString():'',actorId:/^[A-Za-z0-9_-]{1,30}$/.test(String(row[0]||''))?String(row[0]):'unknown',action:known?String(row[1]):'unknown',summary:known?NODE_OPERATION_SUMMARIES[String(row[1])]:'業務データを更新'};}).reverse();
  requireAdmin_(snapshotActor_(store,request.token));return {checkedAt:new Date().toISOString(),entries:entries,nextCursor:start>2?start-1:null};
}
function readDataExport_(request) {
  var access=accountManagementStore_(request.token),store=readStore_({readOnly:true},access.store),maxCells=50000,maxCharacters=2000000,total=store.records.length*26,tables=[];
  if(total>maxCells)fail_('EXPORT_LIMIT','アプリデータの書き出し上限です。');
  var snapshot=buildSnapshot_(store,access.actor);delete snapshot.outboxKey;delete snapshot.cacheAccess;delete snapshot.destination;
  var teamExport=teamWorkspaceExport_(store,access.actor),rewardsState=rewardState_(store.book),migrationState=migrationTable_(store.book);
  var workflowExport=workflowDataExport_(store,access.actor);total+=workflowExport.cells;
  var extraChecks=workflowExport.checks.slice();[[REWARD_SETTINGS_TAB,REWARD_SETTINGS_HEADERS,rewardsState.settings],[REWARD_LEDGER_TAB,REWARD_LEDGER_HEADERS,rewardsState.ledger],[REWARD_REQUESTS_TAB,REWARD_REQUESTS_HEADERS,rewardsState.requests],[MIGRATION_TAB,MIGRATION_HEADERS,migrationState]].forEach(function(v){total+=(v[2].rows.length+(v[2].sheet?1:0))*v[1].length;extraChecks.push({title:v[0],headers:v[1],fingerprint:v[2].fingerprint,sheetId:v[2].sheet?v[2].sheet.getSheetId():null});});
  total+=teamExport.cells;if(total>maxCells)fail_('EXPORT_LIMIT','社内共有を含むアプリデータの書き出し上限です。');
  store.book.getSheets().filter(function(sheet){return managementTabAllowed_(sheet.getName());}).forEach(function(sheet){
    var rowCount=sheet.getLastRow(),columnCount=Math.min(100,sheet.getLastColumn()),rows=[];
    if(sheet.getLastColumn()>100||rowCount>2000||total+rowCount*columnCount>maxCells)fail_('EXPORT_LIMIT','アプリデータの書き出し上限です。管理表の範囲を整理してから再試行してください。');
    total+=rowCount*columnCount;
    for(var start=1;start<=rowCount;start+=100){var data=gridRead_(store.book,sheet,start,Math.min(100,rowCount-start+1));data.forEach(function(cells,i){rows.push({row:start+i,cells:cells.slice(0,columnCount).map(function(cell,j){var view=publicCell_(cell,j+1);view.formula=cell.userEnteredValue&&cell.userEnteredValue.formulaValue||'';return view;})});});}
    tables.push({sheetId:sheet.getSheetId(),title:sheet.getName(),rowCount:rowCount,columnCount:columnCount,rows:rows});
  });
  if(total>maxCells)fail_('EXPORT_LIMIT','アプリデータの書き出し上限です。');
  var result={schemaVersion:1,exportedAt:new Date().toISOString(),scope:'application-data',snapshot:snapshot,managementTables:tables,teamWorkspace:teamExport.data,rewards:rewardPublic_(rewardsState,access.actor,store.players),workflow:workflowExport.data,migrationArchive:migrationState.entries.map(function(e){var item=Object.assign({},e);delete item.row;return item;}),limits:{maxCells:maxCells,maxCharacters:maxCharacters}};
  if(JSON.stringify(result).length>maxCharacters)fail_('EXPORT_LIMIT','アプリデータが書き出し上限を超えています。');
  revalidateIntakePlan_(store,access.actor,{intakeTableChecks:teamExport.checks.concat(extraChecks)});requireAdmin_(snapshotActor_(store,request.token));return result;
}

/* Explicit monthly goals are historical business data. Missing and zero stay distinct. */
function monthlyTargetTable_(book) {
  var sheet=book.getSheetByName(NODE.monthlyTargetsTab);if(!sheet)return {sheet:null,entries:[],fingerprint:'missing'};
  if(sheet.getLastRow()>5001)fail_('MONTHLY_GOAL_LIMIT','月別目標の保存上限に達しました。管理者に確認してください。');
  var values=table_(sheet,NODE.monthlyTargetHeaders),formulas=sheet.getRange(1,1,values.length,NODE.monthlyTargetHeaders.length).getFormulas(),seen={};
  if(formulas.some(function(row){return row.some(Boolean);}))fail_('FORMULA_PROTECTED','月別目標の管理タブに数式があります。管理者に確認してください。');
  var entries=values.slice(1).map(function(row,i){
    if(row.every(function(cell){return cell===''||cell==null;}))return null;
    var key=String(row[0])+'|'+String(row[1]);
    if(typeof row[0]!=='string'||!/^ND-[0-9]+$/.test(row[0])||typeof row[1]!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(row[1])||!Number.isInteger(row[2])||row[2]<0||row[2]>9999||typeof row[3]!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(row[3])||typeof row[4]!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(row[4])||!isFinite(Date.parse(row[4]))||typeof row[5]!=='string'||!/^([A-Za-z0-9_-]{1,30})$/.test(row[5])||seen[key])fail_('SCHEMA_MISMATCH','月別目標のID・年月・数値・重複を確認してください。');
    seen[key]=true;return {playerId:row[0],month:row[1],target:row[2],version:row[3],updatedAt:row[4],actorId:row[5],row:i+2};
  }).filter(Boolean);
  return {sheet:sheet,entries:entries,fingerprint:hash_(stableJson_(values))};
}
function publicMonthlyGoal_(goal) {return {playerId:goal.playerId,month:goal.month,target:goal.target,version:goal.version,updatedAt:goal.updatedAt};}
function readMonthlyGoals_(store,user) {return monthlyTargetTable_(store.book).entries.filter(function(goal){return user.role==='admin'||goal.playerId===user.id;}).map(publicMonthlyGoal_);}
function saveMonthlyTarget_(request) {
  return withLock_(function(){
    var session=authenticate_(request.token),store=readAccountStore_(),actor=activeActor_(store,session),payload=request.payload||{};assertManagedBook_(store.book);
    if(!writesEnabled_(store.config))fail_('WRITES_DISABLED','現在は読み取り専用です。');
    if(store.book.getSpreadsheetTimeZone()!=='Asia/Tokyo')fail_('TIMEZONE','管理シートのタイムゾーンを確認してください。');
    var playerId=shortText_(payload.playerId,30,true),month=shortText_(payload.month,7,true),target=payload.target,expected=payload.expectedVersion,operationId=shortText_(request.operationId,128,true);
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!Number.isInteger(target)||target<0||target>9999||typeof expected!=='string'||expected!==''&&!/^[A-Za-z0-9_-]{43}$/.test(expected)||!/^[A-Za-z0-9_-]{16,128}$/.test(operationId))fail_('VALIDATION','年月・目標（0〜9999）・最新の保存状態を確認してください。');
    var owner=store.players.find(function(player){return player.id===playerId&&player.role==='player'&&(actor.role==='admin'||player.active);});
    if(!owner||actor.role!=='admin'&&actor.id!==playerId)fail_('FORBIDDEN','本人または管理者だけ月別目標を設定できます。');
    store.operationSheet=store.book.getSheetByName(NODE.operationsTab);
    var payloadHash=hash_(stableJson_({action:'saveMonthlyTarget',payload:{playerId:playerId,month:month,target:target,expectedVersion:expected}})),previous=operation_(store,operationId),state=monthlyTargetTable_(store.book),old=state.entries.find(function(goal){return goal.playerId===playerId&&goal.month===month;});
    if(previous){
      if(previous.actorId!==actor.id||previous.action!=='saveMonthlyTarget'||previous.payloadHash!==payloadHash)fail_('OPERATION_CONFLICT','同じ操作IDを別の内容に使うことはできません。');
      var committed=previous.result.goal;
      if(!committed||committed.playerId!==playerId||committed.month!==month||committed.target!==target||typeof committed.version!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(committed.version)||typeof committed.updatedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(committed.updatedAt)||!isFinite(Date.parse(committed.updatedAt)))fail_('SCHEMA_MISMATCH','月別目標の保存履歴を確認してください。');
      // Return the original acknowledgement; a separate snapshot supplies any later edit.
      snapshotActor_(store,request.token);return {saved:true,operationId:operationId,goal:publicMonthlyGoal_(committed),replayed:true};
    }
    if(old?old.version!==expected:expected!=='')fail_('CONFLICT','月別目標が更新されています。最新の情報を取得してください。');
    var goal={playerId:playerId,month:month,target:target,version:random256_(),updatedAt:new Date().toISOString()},row=old?old.row:state.sheet?state.sheet.getLastRow()+1:2,requests=[],sheetId;
    if(row>5001)fail_('MONTHLY_GOAL_LIMIT','月別目標の保存上限に達しました。管理者に確認してください。');
    if(!state.sheet){do{sheetId=Math.floor(Math.random()*1000000000)+1;}while(store.book.getSheets().some(function(sheet){return sheet.getSheetId()===sheetId;}));requests.push({addSheet:{properties:{sheetId:sheetId,title:NODE.monthlyTargetsTab,gridProperties:{rowCount:5001,columnCount:NODE.monthlyTargetHeaders.length}}}});requests.push(rowUpdateRequest_(sheetId,1,NODE.monthlyTargetHeaders));}
    else {sheetId=state.sheet.getSheetId();if(row>state.sheet.getMaxRows())requests.push({appendDimension:{sheetId:sheetId,dimension:'ROWS',length:row-state.sheet.getMaxRows()}});}
    requests.push(rowUpdateRequest_(sheetId,row,[playerId,month,target,goal.version,goal.updatedAt,actor.id]));
    requests.push({appendCells:{sheetId:store.operationSheet.getSheetId(),rows:[{values:[operationId,actor.id,'saveMonthlyTarget',payloadHash,JSON.stringify({goal:goal}),new Date().toISOString()].map(cell_)}],fields:'userEnteredValue'}});
    snapshotActor_(store,request.token);var current=monthlyTargetTable_(store.book);
    if(current.fingerprint!==state.fingerprint||(current.sheet?current.sheet.getSheetId():null)!==(state.sheet?state.sheet.getSheetId():null))fail_('CONFLICT','月別目標が保存前に更新されました。最新の情報を取得してください。');
    snapshotActor_(store,request.token);sheetsBatch_(store.config.spreadsheetId,requests);
    snapshotActor_(store,request.token);return {saved:true,operationId:operationId,goal:goal,replayed:false};
  });
}

function auditSecurity_(request) {
  var session=authenticate_(request.token),accounts=readAccountStore_(),user=activeActor_(accounts,session);requireAdmin_(user);
  var store=readStore_({readOnly:true},accounts),properties=props_(),all=properties.getProperties(),sessions=0;
  Object.keys(all).forEach(function(key){if(!/^NODE_SESSION_[A-Za-z0-9_-]{43}$/.test(key))return;var s=parseSession_(all[key]),account=s&&store.players.find(function(p){return p.id===s.id&&p.active;});if(account){var auth=authRecord_(s.id);if(auth&&(s.authVersion||null)===(auth.version||null))sessions++;}});
  var result={checkedAt:new Date().toISOString(),activePlayers:store.players.filter(function(p){return p.active&&p.role==='player';}).length,activeAdmins:store.players.filter(function(p){return p.active&&p.role==='admin';}).length,disabledAccounts:store.players.filter(function(p){return !p.active;}).length,activeSessions:sessions,sessionsPerAccountLimit:NODE.sessionsPerAccount,sessionHours:NODE.sessionHours,sessionIdleMinutes:NODE.sessionIdleMinutes,missingCredentials:store.players.filter(function(p){return p.active&&!authRecord_(p.id);}).length,unmappedRecords:store.records.filter(function(r){return !r.playerId;}).length,writesEnabled:store.schemaCompatible&&writesEnabled_(store.config)&&store.book.getSpreadsheetTimeZone()==='Asia/Tokyo',originalProtected:true,aiConfigured:!!properties.getProperty('NODE_GEMINI_API_KEY'),aiFreeTierConfirmed:properties.getProperty('NODE_GEMINI_FREE_TIER_CONFIRMED')==='true'};
  requireAdmin_(snapshotActor_(store,request.token));return result;
}
function snapshotActor_(store, token, allowPasswordChange) {
  // Re-checks after a read are passive, so they never turn a background poll into activity.
  var players = readPlayers_(store.playerSheet), actor = activeActor_({ players: players }, authenticate_(token, allowPasswordChange, true));
  function access(players) { return players.map(function (p) { return [p.id, p.role, p.active, p.sheetNames]; }); }
  // A direct sheet edit can occur while the unlocked read is in flight. Never
  // return records mapped through an obsolete owner/role configuration.
  if (stableJson_(config_()) !== stableJson_(store.config) || stableJson_(access(players)) !== stableJson_(access(store.players))) fail_('BUSY', '管理設定が更新されました。実績を再取得してください。');
  return actor;
}
function authenticatedSnapshot_(store, token) {
  var snapshot = buildSnapshot_(store, activeActor_(store, authenticate_(token, false, true)));
  // Aggregate computation and even book-title/timezone reads precede the final
  // authorization check, so a revocation during those reads cannot leak data.
  snapshotActor_(store, token);
  return snapshot;
}

/* Only the four observed header columns identify the business table. No guessed column writes. */
function normalizeHeader_(value) { return String(value || '').normalize('NFKC').replace(/[\s\u3000（）()【】\[\]：:・]/g, ''); }
function mappedHeadersMatch_(row) { return NODE.inputColumns.every(function(column){return NODE.mappedHeaders[column].map(normalizeHeader_).indexOf(normalizeHeader_(row[column-1]))>=0;}); }
function normalizeName_(value) { return String(value || '').replace(/[\s\u3000]/g, ''); }
function detectHeader_(rows) {
  for (var i = 0; i < Math.min(rows.length, 40); i++) {
    var r = rows[i] || [], a = normalizeHeader_(r[0]), b = normalizeHeader_(r[1]), c = normalizeHeader_(r[2]), d = normalizeHeader_(r[3]);
    if (a.indexOf('面談実施') >= 0 && b.indexOf('会社名') >= 0 && c.indexOf('氏名') >= 0 && (d === '担当' || d === '担当者')) return i + 1;
  }
  fail_('SCHEMA_MISMATCH', '面談実施・会社名・氏名・担当のヘッダーが見つかりません。接続先の列構成を確認してください。');
}
function table_(sheet, headers) {
  if (!sheet) fail_('NOT_CONFIGURED', 'アプリ用の管理タブがありません。');
  var values = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), headers.length).getValues();
  if (!values[0] || headers.some(function (header, i) { return values[0][i] !== header; })) fail_('SCHEMA_MISMATCH', 'アプリ用管理タブのヘッダーを確認してください。');
  return values;
}
function metadataMap_(sheet, key) {
  return metadataMaps_(sheet, [key])[key];
}
function metadataMaps_(sheet, keys) {
  if(nodeUsesFirestore_())return firestoreMetadataMaps_(sheet,keys);
  var maps = {}, response, sheetId = sheet.getSheetId();
  keys.forEach(function (key) { maps[key] = {}; });
  // A single Sheets API read avoids remote getters for every metadata entry.
  try {
    response = Sheets.Spreadsheets.DeveloperMetadata.search({ dataFilters: keys.map(function (key) { return { developerMetadataLookup: { metadataKey: key, locationType: 'ROW' } }; }) }, sheet.getParent().getId());
  } catch (_) { fail_('SHEET_READ_FAILED', '行の管理IDを取得できませんでした。入力を残したまま再試行してください。'); }
  if (!response || (response.matchedDeveloperMetadata !== undefined && !Array.isArray(response.matchedDeveloperMetadata))) fail_('SHEET_READ_FAILED', '行の管理IDの応答を確認できませんでした。');
  (response.matchedDeveloperMetadata || []).forEach(function (match) {
    var item = match.developerMetadata, range = item && item.location && item.location.dimensionRange;
    if (!item || keys.indexOf(item.metadataKey) < 0 || !range || range.sheetId !== sheetId || range.dimension !== 'ROWS') return;
    var start = range.startIndex == null ? 0 : range.startIndex;
    if (!Number.isInteger(start) || start < 0 || range.endIndex !== start + 1 || !Number.isInteger(item.metadataId) || item.metadataId <= 0) fail_('SHEET_READ_FAILED', '行の管理IDの位置を確認できませんでした。');
    var row = start + 1, map = maps[item.metadataKey];
    if (map[row]) fail_('METADATA_CONFLICT', '同じ行に重複した管理IDがあります。管理者が確認してください。');
    map[row] = { value: item.metadataValue == null ? null : item.metadataValue, metadataId: item.metadataId };
  });
  return maps;
}
function sheetRowCount_(sheet) {
  if(nodeUsesFirestore_())return firestoreRowCount_(sheet);
  var response;
  // REST writes can leave SpreadsheetApp.getMaxRows() stale during this execution.
  try { response = Sheets.Spreadsheets.get(sheet.getParent().getId(), { fields: 'sheets(properties(sheetId,gridProperties(rowCount)))' }); }
  catch (_) { fail_('SHEET_READ_FAILED', 'シートの現在の行数を取得できませんでした。入力を残したまま再試行してください。'); }
  var found = response && Array.isArray(response.sheets) && response.sheets.find(function (item) { return item.properties && item.properties.sheetId === sheet.getSheetId(); });
  var count = found && found.properties.gridProperties && found.properties.gridProperties.rowCount;
  if (!Number.isInteger(count) || count < 1) fail_('SHEET_READ_FAILED', 'シートの現在の行数を確認できませんでした。');
  return count;
}
function readPlayers_(playerSheet) {
  var playerRows = table_(playerSheet, NODE.playerHeaders);
  return playerRows.slice(1).map(function (r, i) {
    if (!r[0]) return null;
    var aliases;
    try { aliases = JSON.parse(String(r[6] || '[]')); } catch (_) { fail_('SCHEMA_MISMATCH', '担当者名の対応表を確認してください。'); }
    if (!Array.isArray(aliases) || aliases.some(function (v) { return typeof v !== 'string'; }) || ['admin','player'].indexOf(String(r[7])) < 0) fail_('SCHEMA_MISMATCH', 'プレイヤーの設定を確認してください。');
    return { id: String(r[0]), name: String(r[1]), team: String(r[2]), color: String(r[3]), target: Number(r[4]), bio: String(r[5] || ''), sheetNames: aliases, role: String(r[7]), active: r[8] === true || String(r[8]).toLowerCase() === 'true', row: i + 2 };
  }).filter(Boolean);
}
function readAccountStore_(config) {
  config = config || config_();
  var book = nodeOpenBook_(config), playerSheet = book.getSheetByName(NODE.playersTab);
  return { config: config, book: book, playerSheet: playerSheet, players: readPlayers_(playerSheet) };
}
function readStore_(options, accountStore) {
  var accounts = accountStore || readAccountStore_(), config = accounts.config, book = accounts.book, playerSheet = accounts.playerSheet, players = accounts.players;
  var matching = book.getSheetByName(NODE.matchingTab), kpi = book.getSheetByName(NODE.kpiTab);
  if (!matching || matching.getSheetId() !== Number(config.matchingSheetId) || !kpi || kpi.getSheetId() !== Number(config.kpiSheetId) || matching.getSheetId() === Number(config.kpiSheetId)) fail_('SCHEMA_MISMATCH', 'マッチングDBとKPIのタブ名・管理IDを確認してください。');
  var operationSheet = book.getSheetByName(NODE.operationsTab);
  var aliases = {};
  players.filter(function (p) { return p.role === 'player'; }).forEach(function (p) {
    p.sheetNames.forEach(function (name) {
      var key = normalizeName_(name);
      if (!key || aliases[key] && aliases[key] !== p.id) fail_('ALIAS_CONFLICT', '担当者名が複数のプレイヤーに対応しています。');
      aliases[key] = p.id;
    });
  });
  var length = Math.max(1, matching.getLastRow());
  if (length > 50000) fail_('DATA_LIMIT', 'データ量の確認が必要です。管理者に連絡してください。');
  var fullGridKey = 'NODE_FULL_GRID_' + hash_(config.spreadsheetId + '|' + matching.getSheetId() + '|' + length), fullGridCache, useFullGrid = false;
  try { fullGridCache = CacheService.getScriptCache(); useFullGrid = fullGridCache.get(fullGridKey) === '1'; } catch (_) { /* Cache is optional. */ }
  // This caches only a choice to read the entire grid, never a data snapshot or
  // a shortened boundary. Edits cannot be omitted by an outdated cache entry.
  if (options && options.readOnly && (nodeUsesFirestore_() || !useFullGrid)) {
    // Formula-filled template rows make getLastRow much larger than the actual
    // candidate table. A:D is enough to retain every named/unknown-owner row.
    // Mutations still load the full grid for blank-row and formula protection.
    var identityRows = matching.getRange(1, 1, length, 4).getValues(), lastCandidate = detectHeader_(identityRows);
    for (var i = identityRows.length - 1; i >= lastCandidate; i--) {
      if (normalizeName_(identityRows[i][2])) { lastCandidate = i + 1; break; }
    }
    if (lastCandidate === length && fullGridCache) { try { fullGridCache.put(fullGridKey, '1', 1800); } catch (_) { /* Reading remains available without cache. */ } }
    length = lastCandidate;
  }
  var range = matching.getRange(1, 1, length, 26), values = range.getValues(), formulas = range.getFormulas();
  var headerRow = detectHeader_(values),schemaCompatible=mappedHeadersMatch_(values[headerRow-1]);
  var metadata = metadataMaps_(matching, [NODE.recordKey, NODE.sourceKey, NODE.deletedKey, NODE.candidateProfileKey]), ids = metadata[NODE.recordKey], sources = metadata[NODE.sourceKey], records = [], warnings = [];
  Object.keys(metadata[NODE.candidateProfileKey]).forEach(function(row){if(!intakeId_(metadata[NODE.candidateProfileKey][row].value))fail_('METADATA_CONFLICT','面談情報の管理IDを確認してください。');});
  var unknown = 0, missingIds = 0, invalidDates = 0, seenIds = {};
  for (var n = headerRow; n < values.length; n++) {
    var row = values[n], name = normalizeName_(row[2]);
    if (!name || normalizeHeader_(row[0]).indexOf('面談実施') >= 0 && normalizeHeader_(row[2]).indexOf('氏名') >= 0) continue;
    var owner = aliases[normalizeName_(row[3])];
    if (!owner) unknown++;
    var recordId = ids[n + 1] && ids[n + 1].value;
    if (!recordId) { missingIds++; continue; }
    if (seenIds[recordId]) fail_('METADATA_CONFLICT', '管理IDが複数行に存在します。管理者が確認してください。');
    seenIds[recordId] = true;
    var dates = NODE.stageColumns.map(function (column) { var result = day_(row[column - 1]); if (!result && row[column - 1] !== '' && row[column - 1] != null) invalidDates++; return result; });
    var source = sources[n + 1] ? sources[n + 1].value : '';
    records.push({ row: n + 1, recordId: recordId, playerId: owner || '', candidateId: candidateId_(owner, name), name: name, values: row, formulas: formulas[n], dates: dates, source: source, sourceMetadataId: sources[n + 1] && sources[n + 1].metadataId, profileId: metadata[NODE.candidateProfileKey][n + 1] && metadata[NODE.candidateProfileKey][n + 1].value || '', version: rowVersion_(recordId, row, formulas[n], source) });
  }
  if (unknown) warnings.push('担当者IDに対応しない行が' + unknown + '行あります。管理者が別名の対応表を確認してください。');
  if(!schemaCompatible)warnings.push('入力対象19列の見出しまたは順序が未確認です。実績は表示せず、書き込みを停止しています。管理者が接続先の列を確認してください。');
  if (missingIds) warnings.push('管理IDのない行が' + missingIds + '行あります。管理者がメニューから行IDの同期を実行してください。');
  if (invalidDates) warnings.push('「停止」など日付以外の値は実績集計から除外しています。');
  warnings.push('紹介元の保存列が未確認のため、アプリの行メタデータに保存します。E列には書き込みません。');
  if (book.getSpreadsheetTimeZone() !== 'Asia/Tokyo') warnings.push('接続先スプレッドシートのタイムゾーンがAsia/Tokyoではないため、書き込みを停止しています。管理者が設定を確認してください。');
  if(config.spreadsheetId===NODE.originalId)warnings.push('現在の接続先は移行元の原本です。書き込みはできません。');
  else if(config.purpose==='production'&&config.spreadsheetId===props_().getProperty(NODE.destinationKey))warnings.push('現在の接続先は登録済みの新しい管理シートです。');
  else if(config.purpose==='verification'&&config.spreadsheetId===props_().getProperty(NODE.verificationKey))warnings.push('現在の接続先は独立した検証用コピーです。');
  else warnings.push('接続先の用途を確認できません。管理者が設定を確認してください。');
  return { config: config, book: book, matching: matching, playerSheet: playerSheet, operationSheet: operationSheet, players: players, values: values, formulas: formulas, headerRow: headerRow, schemaCompatible:schemaCompatible,recordMetadata:ids,archivedMetadata:metadata[NODE.deletedKey],profileMetadata:metadata[NODE.candidateProfileKey],records: records, warnings: warnings };
}
function day_(value) {
  if (value instanceof Date) return isFinite(value.getTime()) ? Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd') : '';
  if (typeof value !== 'string' || !value.trim()) return '';
  var match = value.trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!match) return '';
  var y = Number(match[1]), m = Number(match[2]), d = Number(match[3]), test = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || y > 2100 || test.getUTCFullYear() !== y || test.getUTCMonth() !== m - 1 || test.getUTCDate() !== d) return '';
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}
function dayDate_(ymd) { var day = day_(ymd); if (!day) fail_('INVALID_DATE', '有効な日付を指定してください。'); return new Date(day + 'T00:00:00+09:00'); }
function today_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'); }
function candidateId_(owner, name) { return 'C-' + hash_(owner + '|' + normalizeName_(name)).slice(0, 32); }
function valueKey_(value) { return value instanceof Date ? { date: isFinite(value.getTime()) ? value.toISOString() : 'invalid' } : value == null ? '' : value; }
function rowVersion_(recordId, values, formulas, source) {
  return hash_(stableJson_([recordId, values.map(function (value, i) { return formulas[i] ? { formula: formulas[i] } : valueKey_(value); }), source || '']));
}
function stableJson_(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableJson_).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + stableJson_(value[key]); }).join(',') + '}';
}
function activities_(store) {
  var all = [];
  if(store.schemaCompatible===false)return all;
  store.records.filter(function(record){return !!record.playerId;}).forEach(function (record) {
    record.dates.forEach(function (date, si) {
      if (!date || si > 0 && !String(record.values[1] || '').trim()) return;
      all.push({ id: record.recordId + ':' + si, recordId: record.recordId, rowVersion: record.version, playerId: record.playerId, candidateId: record.candidateId, candidateName: record.name, source: record.source, company: String(record.values[1] || ''), position: String(record.values[5] || ''), stage: NODE.stages[si], date: date, status: String(record.values[6] || ''), probability: String(record.values[11] || ''), memo: String(record.values[12] || ''), interviewScheduledDate: day_(record.values[9]) || undefined, clientInterviewScheduledTime: time_(record.values[10], false) || undefined });
    });
  });
  return all;
}
function countActivities_(activities, players) {
  var metrics = NODE.stages.concat(['紹介人数']), sets = {};
  activities.forEach(function (activity) {
    ['all',activity.date.slice(0,7),activity.date].forEach(function (period) {
      if (!sets[period]) sets[period] = {};
      if (!sets[period][activity.playerId]) sets[period][activity.playerId] = {};
      var target = sets[period][activity.playerId], key = activity.stage === '候補者面談' ? activity.date + '|' + activity.playerId + '|' + normalizeName_(activity.candidateName) : activity.recordId;
      if (!target[activity.stage]) target[activity.stage] = new Set();
      target[activity.stage].add(key);
      if (activity.stage === '提案') { if (!target['紹介人数']) target['紹介人数'] = new Set(); target['紹介人数'].add(activity.candidateId); }
    });
  });
  if (!sets.all) sets.all = {};
  var counts = {};
  Object.keys(sets).forEach(function (period) {
    counts[period] = {};
    players.filter(function (p) { return p.role === 'player'; }).forEach(function (player) {
      counts[period][player.id] = {};
      metrics.forEach(function (metric) { counts[period][player.id][metric] = sets[period][player.id] && sets[period][player.id][metric] ? sets[period][player.id][metric].size : 0; });
    });
  });
  return counts;
}
/** Keys unlock only an encrypted projection of shared ranking data, never candidate/private rows.
 * The grant is issued after normal authentication and is invalidated by destination, role,
 * roster/alias or credential-version changes. It grants no API capability on its own. */
function snapshotCacheAccess_(store,user) {
  var auth=authRecord_(user.id),pepper=props_().getProperty(NODE.pepperKey);if(!auth||!pepper)fail_('UNAUTHENTICATED','ログイン状態を確認してください。');
  var scope=hmac_('display-cache-scope-v1|'+stableJson_({version:1,config:store.config,self:user,roster:store.players,authVersion:auth.version||null,storageProvider:nodeStorageProvider_(),storageBinding:nodeUsesFirestore_()?firestoreConfig_():null}),pepper);
  return {version:1,self:{playerId:user.id,role:user.role},scope:scope,secret:hmac_('display-cache-encryption-v1|'+scope,pepper),expiresAt:Date.now()+3600000};
}
/* A stamp is only an authenticated cache validator, never a credential. Bump
 * this backend stamp when the full snapshot projection/meaning changes. */
var NODE_FIRESTORE_SNAPSHOT_STAMP='node-firestore-snapshot-v1-20261106';
function firestoreSnapshotVersion_(store,user,cacheAccess,preferences,evidenceEnabled,canWrite){
  if(!nodeUsesFirestore_())return '';
  var book=store.book,manifest=book&&book.manifest,pepper=props_().getProperty(NODE.pepperKey);
  if(!book||!book.transaction||!manifest||!Number.isSafeInteger(manifest.revision)||manifest.revision<0||!cacheAccess||!(/^[A-Za-z0-9_-]{43}$/).test(cacheAccess.scope)||cacheAccess.self.playerId!==user.id||cacheAccess.self.role!==user.role||!pepper)fail_('FIRESTORE_READ_FAILED','表示データの確認位置を検証できません。');
  return hmac_('authenticated-firestore-snapshot-v1|'+stableJson_({backend:NODE_FIRESTORE_SNAPSHOT_STAMP,revision:manifest.revision,scope:cacheAccess.scope,writingPreferences:preferences,evidenceEnabled:evidenceEnabled===true,writesEnabled:canWrite===true,refreshWindow:Math.floor(Date.now()/300000)}),pepper);
}
function firestoreSnapshotRequestVersion_(request){
  var payload=request.payload;
  // Older callers may send ignored role/player hints. They grant no authority;
  // preserve that behavior and interpret only the new explicit validator.
  if(!payload||typeof payload!=='object'||!Object.prototype.hasOwnProperty.call(payload,'ifSnapshotVersion'))return '';
  var value=payload.ifSnapshotVersion;if(typeof value!=='string'||!(/^[A-Za-z0-9_-]{43}$/).test(value))fail_('BAD_REQUEST','表示データの確認値を確認してください。');return value;
}
function firestoreUnchangedSnapshot_(request,session){
  var expected=firestoreSnapshotRequestVersion_(request);
  if(!expected||request.background!==true||!nodeUsesFirestore_())return null;
  // Only the current roster is read. Every response still passes the existing
  // outside-transaction roster/manifest proof in doPost before it is sent.
  var accounts=readAccountStore_(),actor=activeActor_(accounts,session||authenticate_(request.token,false,true)),access=snapshotCacheAccess_(accounts,actor),preferences=writingPreferences_(),evidence=matchEvidenceFeature_(),canWrite=writesEnabled_(accounts.config),version=firestoreSnapshotVersion_(accounts,actor,access,preferences,evidence,canWrite);
  if(!constantEqual_(expected,version))return null;
  snapshotActor_(accounts,request.token);
  var result={snapshotUnchanged:true,snapshotVersion:version,self:{playerId:actor.id,role:actor.role},syncedAt:new Date().toISOString(),cacheAccess:access};if(session&&session.touchDeferred)result.activityDeferred=true;return result;
}
function publicPlayer_(player,user) { var own=user.role==='admin'||user.id===player.id;return { id: player.id, name: player.name, team: player.team, color: player.color, target: player.target, bio: own?player.bio:'', sheetNames: own?player.sheetNames.slice():[], active:player.active }; }
function buildSnapshot_(store, user) {
  var all = activities_(store);
  var snapshot={ self: { playerId: user.id, role: user.role }, players: store.players.filter(function (p) { return p.role === 'player' && (user.role==='admin'||p.active); }).map(function(player){return publicPlayer_(player,user);}), activities: all.filter(function (a) { return user.role === 'admin' || a.playerId === user.id; }), counts: countActivities_(all, store.players.filter(function(p){return user.role==='admin'||p.active;})), syncedAt: new Date().toISOString(), warnings: store.warnings.slice(), writesEnabled: store.schemaCompatible&&writesEnabled_(store.config) && store.book.getSpreadsheetTimeZone() === 'Asia/Tokyo' };
  snapshot.interviewReviews=readInterviewReviews_(store,user);
  var workflowV2=nodeWorkflowV2Available_(store.config);if(workflowV2){snapshot.metricGoalsFeature=true;snapshot.salesWorkflowFeature=true;snapshot.introductionV2Feature=true;snapshot.candidateIntroductionV2=readIntroductionV2Profiles_(store,user);}snapshot.storageEvidenceFeature=workflowV2&&matchEvidenceFeature_()?true:undefined; snapshot.migrationFeature=true; snapshot.rewardsFeature=true; snapshot.candidateRegistrationFeature=true; snapshot.teamWorkspaceFeature=true; snapshot.intakeFeature=true; snapshot.candidateProfiles=readCandidateProfiles_(store,user); snapshot.clients=clientEntries_(store.book);
  snapshot.deletionFeature=true; snapshot.deletedCandidates=deletedCandidates_(store,user);
  snapshot.writingFeature=true; snapshot.writingPreferences=writingPreferences_();
  snapshot.reviewFeature=true; snapshot.monthlyGoalsFeature=true; snapshot.monthlyGoals=readMonthlyGoals_(store,user);
  snapshot.securityFeature=true; snapshot.workspaceFeature=true; snapshot.operationsFeature=true;
  var pepper=props_().getProperty(NODE.pepperKey);
  // Device drafts are encrypted with a key derived from this secret, so a browser
  // profile alone cannot decrypt them after the session ends.
  if(pepper)snapshot.cacheAccess=snapshotCacheAccess_(store,user);
  if(pepper)snapshot.outboxKey=hmac_('outbox-v2|'+store.config.spreadsheetId+'|'+user.role+'|'+user.id,pepper);
  snapshot.records=store.schemaCompatible ? store.records.filter(function(r){return user.role==='admin'||r.playerId===user.id;}).map(publicRecord_) : [];
  if(nodeUsesFirestore_()){snapshot.storageBackend=firestoreStorageInfo_();snapshot.snapshotVersion=firestoreSnapshotVersion_(store,user,snapshot.cacheAccess,snapshot.writingPreferences,snapshot.storageEvidenceFeature===true,snapshot.writesEnabled);}
  if(user.role==='admin'&&!nodeUsesFirestore_()){
    var prefix='https://docs.google.com/spreadsheets/d/'+encodeURIComponent(store.config.spreadsheetId)+'/edit#gid=';
    snapshot.destination={title:store.book.getName(),matchingUrl:prefix+Number(store.config.matchingSheetId),kpiUrl:prefix+Number(store.config.kpiSheetId)};
  }
  return snapshot;
}

/* All business writes are planned, revalidated, then applied in ONE Sheets atomic batch. */
function shortText_(value, maximum, required) {
  if (typeof value !== 'string') { if (required) fail_('VALIDATION', '入力項目を確認してください。'); return ''; }
  var text = value.trim();
  if (text.length > maximum || required && !text || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) || /^[=+]/.test(text.normalize('NFKC'))) fail_('VALIDATION', '文字数または入力形式を確認してください。');
  return text;
}
function target_(value) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 9999) fail_('VALIDATION', '目標は1〜9999の整数を指定してください。'); return value; }
function choice_(value, allowed) { if (allowed.indexOf(value) < 0) fail_('VALIDATION', '選択項目を確認してください。'); return value; }
function time_(value, strict) {
  if (value === '' || value == null) return '';
  if (value instanceof Date) return isFinite(value.getTime()) ? Utilities.formatDate(value, 'Asia/Tokyo', 'HH:mm') : '';
  var match = String(value).match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (match) return ('0' + match[1]).slice(-2) + ':' + match[2];
  if (strict) fail_('VALIDATION', '予定時刻を確認してください。');
  return '';
}
function actorOwns_(user, record) { if (!record || user.role !== 'admin' && record.playerId !== user.id) fail_('FORBIDDEN', 'このデータを更新できません。'); }
function findRecord_(store, id) { return store.records.find(function (record) { return record.recordId === id; }); }
function checkVersion_(record, expected) { if (typeof expected !== 'string' || expected !== record.version) fail_('CONFLICT', 'データが更新されています。同期してから再入力してください。'); }
function blankBusinessRow_(store) {
  for (var i = store.headerRow; i < store.values.length; i++) {
    if (store.archivedMetadata && store.archivedMetadata[i+1] || store.profileMetadata && store.profileMetadata[i+1]) continue;
    if (NODE.inputColumns.every(function (column) { return (store.values[i][column - 1] === '' || store.values[i][column - 1] == null) && !store.formulas[i][column - 1]; })) return i + 1;
  }
  return Math.max(store.headerRow + 1, store.values.length + 1);
}
function metadataCreate_(sheetId, row, key, value) { return { createDeveloperMetadata: { developerMetadata: { metadataKey: key, metadataValue: value, visibility: 'DOCUMENT', location: { dimensionRange: { sheetId: sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } } } }; }
function newPlan_(store, record, actorId, authenticatedId) {
  if (record) return { row: record.row, record: record, recordId: record.recordId, patches: {}, requests: [], result: {} };
  var reserved=takeProbeRow_(store,actorId,authenticatedId),row=reserved?reserved.row:blankBusinessRow_(store),id=reserved?reserved.recordId:Utilities.getUuid();
  return { row: row, recordId: id, patches: {}, requests: [metadataCreate_(store.matching.getSheetId(), row, NODE.recordKey, id)], result: {} };
}
function setPatch_(plan, column, value) { if (NODE.inputColumns.indexOf(column) < 0) fail_('PROTECTED_COLUMN', 'この列は書き込めません。'); plan.patches[column] = value; }
function planActivity_(store, user, activity) {
  if (!activity || typeof activity !== 'object' || Array.isArray(activity)) fail_('VALIDATION', '活動データが必要です。');
  var si = NODE.stages.indexOf(activity.stage);
  if (si < 0) fail_('VALIDATION', '活動の種類を確認してください。');
  var ownerId = shortText_(activity.playerId, 30, true);
  if (user.role !== 'admin' && ownerId !== user.id) fail_('FORBIDDEN', '本人の活動のみ登録できます。');
  var owner = store.players.find(function (p) { return p.id === ownerId && p.active && p.role === 'player'; });
  if (!owner || !owner.sheetNames.length) fail_('VALIDATION', '担当者名の対応表を確認してください。');
  var date = day_(activity.date);
  if (!date || typeof activity.date !== 'string' || date !== activity.date) fail_('INVALID_DATE', '有効な活動日を指定してください。');
  if (si !== 6 && date > today_()) fail_('INVALID_DATE', '実績には未来の日付を指定できません。');
  var name = shortText_(activity.candidateName, 60, true);
  if (normalizeName_(name) !== name) fail_('VALIDATION', '候補者氏名はスペースなしで入力してください。');
  var candidateId = candidateId_(ownerId, name), existing = activity.recordId ? findRecord_(store, activity.recordId) : null;
  if (activity.recordId && !existing) fail_('CONFLICT', '対象の提案行が見つかりません。同期してから選択してください。');
  if (existing) {
    actorOwns_(user, existing); checkVersion_(existing, activity.rowVersion);
    if (existing.playerId !== ownerId || existing.candidateId !== candidateId) fail_('CONFLICT', '対象の人材と担当を変更することはできません。');
    if (existing.values[NODE.stageColumns[si] - 1] !== '' && existing.values[NODE.stageColumns[si] - 1] != null) fail_('ALREADY_RECORDED', 'この活動はすでに記録されています。');
  } else if (si > 1) fail_('VALIDATION', '対象の提案行を選択してください。');
  var related = store.records.filter(function (r) { return r.playerId === ownerId && r.candidateId === candidateId; });
  var interview = existing && existing.dates[0] || related.map(function (r) { return r.dates[0]; }).filter(Boolean).sort()[0];
  if (si > 0 && !interview) fail_('VALIDATION', '候補者面談を先に登録してください。');
  if (si > 1 && (!existing || !existing.dates[1])) fail_('VALIDATION', 'このクライアントへの提案を先に登録してください。');
  var priorDates = existing ? existing.dates.slice(0, si).filter(function (v, i) { return i !== 6 && v; }) : si ? [interview] : [];
  if (si !== 6 && priorDates.some(function (prior) { return prior > date; })) fail_('INVALID_DATE', '前の工程より前の日付です。');
  if (si === 0 && related.some(function (r) { return r.dates[0] === date; })) fail_('ALREADY_RECORDED', 'この人材の同日の面談はすでに記録されています。');
  var company = si === 0 ? '' : shortText_(activity.company, 100, true);
  if (existing && si > 0 && existing.values[1] && String(existing.values[1]) !== company) fail_('CONFLICT', '対象の提案と会社名が一致しません。');
  if(activity.memo!==undefined&&typeof activity.memo!=='string')fail_('VALIDATION','メモは文字列で指定してください。');
  var position = choice_(activity.position, NODE.positions), memo = activity.memo===undefined?undefined:shortText_(activity.memo, 500, false), source = shortText_(activity.source, 100, false);
  var plan = newPlan_(store, existing, ownerId, user.id);
  if (!existing) {
    setPatch_(plan, 1, dayDate_(si === 0 ? date : interview)); setPatch_(plan, 2, company); setPatch_(plan, 3, name); setPatch_(plan, 4, owner.sheetNames[0]); setPatch_(plan, 6, position);
  } else if (si === 1 && !existing.values[1]) setPatch_(plan, 2, company);
  setPatch_(plan, NODE.stageColumns[si], dayDate_(date));
  setPatch_(plan, 7, NODE.stageStatuses[si]); if(memo!==undefined)setPatch_(plan, 13, memo);
  // Omitted means preserve; an explicit empty choice clears a previously recorded probability.
  if (si > 0 && activity.probability !== undefined) setPatch_(plan, 12, activity.probability === '' ? '' : choice_(activity.probability, ['Aヨミ','Bヨミ','Cヨミ','Dヨミ']));
  if (activity.interviewScheduledDate) { var scheduled = day_(activity.interviewScheduledDate); if (!scheduled) fail_('INVALID_DATE', 'C面談予定日を確認してください。'); setPatch_(plan, 10, dayDate_(scheduled)); }
  if (activity.clientInterviewScheduledTime) setPatch_(plan, 11, time_(activity.clientInterviewScheduledTime, true));
  if (source && source !== (existing && existing.source || '')) {
    plan.requests.push(existing && existing.sourceMetadataId ? { updateDeveloperMetadata: { dataFilters: [{ developerMetadataLookup: { metadataId: existing.sourceMetadataId } }], developerMetadata: { metadataValue: source }, fields: 'metadataValue' } } : metadataCreate_(store.matching.getSheetId(), plan.row, NODE.sourceKey, source));
  }
  plan.result = { recordId: plan.recordId };
  if (activity.interviewProfile !== undefined) {
    if (si !== 0) fail_('VALIDATION','面談プロフィールは候補者面談の登録時に保存してください。');
    addCandidateProfileToPlan_(store,user,plan,existing,ownerId,activity.interviewProfile);
  }
  if (activity.profileSourceRecordId !== undefined) {
    if (si !== 1 || existing || typeof activity.profileSourceRecordId !== 'string') fail_('VALIDATION','プロフィールの引継ぎ元は新しい提案に指定してください。');
    linkCandidateProfileToPlan_(store,user,plan,ownerId,candidateId,activity.profileSourceRecordId);
  }
  return plan;
}
function planStatus_(store, user, payload) {
  var record = findRecord_(store, shortText_(payload.recordId, 100, true));
  actorOwns_(user, record); checkVersion_(record, payload.rowVersion);
  var plan = newPlan_(store, record); setPatch_(plan, 7, choice_(payload.status, NODE.statuses)); plan.result = { recordId: record.recordId }; return plan;
}
function aliases_(value, fallback) {
  var aliases = value === undefined ? [fallback] : value;
  if (!Array.isArray(aliases) || !aliases.length || aliases.length > 20) fail_('VALIDATION', 'シートの担当者名を1〜20件指定してください。');
  return Array.from(new Set(aliases.map(function (alias) { return shortText_(alias, 40, true); })));
}
function validateAliases_(store, aliases, id) {
  var used = {};
  store.players.filter(function (p) { return p.id !== id; }).forEach(function (p) { p.sheetNames.forEach(function (a) { used[normalizeName_(a)] = true; }); });
  if (aliases.some(function (alias) { return used[normalizeName_(alias)]; })) fail_('ALIAS_CONFLICT', '別のメンバーが使用している担当者名です。');
}
function planProfile_(store, user, player) {
  if (!player || typeof player !== 'object') fail_('VALIDATION', 'プロフィールが必要です。');
  var id = shortText_(player.id, 30, true), previous = store.players.find(function (p) { return p.id === id && p.active && p.role === 'player'; });
  if (!previous || user.role !== 'admin' && id !== user.id) fail_('FORBIDDEN', 'このプロフィールは更新できません。');
  var name = shortText_(player.name, 40, true), bio = shortText_(player.bio, 120, false), target = target_(player.target);
  var aliases = previous.sheetNames;
  if (user.role === 'admin' && player.sheetNames !== undefined) { aliases = aliases_(player.sheetNames, name); validateAliases_(store, aliases, id); }
  if(user.role!=='admin'&&player.team!==undefined&&player.team!==previous.team)fail_('FORBIDDEN','チームの変更は管理者のみ可能です。');
  var team=user.role==='admin'&&player.team!==undefined?shortText_(player.team,40,true):previous.team;
  var cells = [id,name,team,previous.color,target,bio,JSON.stringify(aliases),previous.role,true];
  return { requests: [rowUpdateRequest_(store.playerSheet.getSheetId(), previous.row, cells)], profileRow: previous.row, result: {} };
}
function planPlayer_(store, user, payload, operationId) {
  if (user.role !== 'admin') fail_('FORBIDDEN', 'プレイヤーの追加は管理者のみ可能です。');
  var name = shortText_(payload.name, 40, true), team = shortText_(payload.team, 40, true), target = target_(payload.target), aliases = aliases_(payload.sheetNames, name);
  validateAliases_(store, aliases, '');
  var max = store.players.reduce(function (n, p) { var match = p.id.match(/^ND-(\d+)$/); return match ? Math.max(n, Number(match[1])) : n; }, 0), id = 'ND-' + ('000' + (max + 1)).slice(-Math.max(3, String(max + 1).length));
  // Random and returned once. A replay of the same operation cannot reveal it again.
  var password = random256_();
  // Preparing an auth hash cannot grant access: login also requires an active, atomically committed player row.
  props_().setProperty('NODE_AUTH_' + id, JSON.stringify(makeGeneratedAuth_(password, true)));
  return { requests: [{ appendCells: { sheetId: store.playerSheet.getSheetId(), rows: [{ values: [id,name,team,'blue',target,'',JSON.stringify(aliases),'player',true].map(cell_) }], fields: 'userEnteredValue' } }], result: { playerId: id }, secret: password };
}
/** Read only the header and matching row; never fetch every undo payload to find one ID. */
function operationSheetHeader_(sheet) {
  if(!sheet)fail_('NOT_CONFIGURED','アプリ用の保存履歴がありません。');
  var header=sheet.getRange(1,1,1,NODE.operationHeaders.length).getValues()[0];
  if(!header||NODE.operationHeaders.some(function(name,i){return header[i]!==name;}))fail_('SCHEMA_MISMATCH','保存履歴の見出しを確認してください。');
}
function operation_(store, id) {
  var sheet=store.operationSheet;operationSheetHeader_(sheet);var end=sheet.getLastRow();if(end<2)return null;
  var found;
  try {found=sheet.getRange(2,1,end-1,1).createTextFinder(String(id)).matchCase(true).matchEntireCell(true).useRegularExpression(false).matchFormulaText(false).findAll();}
  catch(_){fail_('SHEET_READ_FAILED','保存履歴を確認できませんでした。同じ操作IDで再試行してください。');}
  if(!Array.isArray(found))fail_('SHEET_READ_FAILED','保存履歴の検索結果を確認できませんでした。');
  if(found.length>1)fail_('OPERATION_CONFLICT','保存履歴を管理者が確認してください。');if(!found.length)return null;
  var rowNumber=found[0].getRow();if(!Number.isInteger(rowNumber)||rowNumber<2||rowNumber>end)fail_('SHEET_READ_FAILED','保存履歴の位置を確認できませんでした。');
  var row=sheet.getRange(rowNumber,1,1,NODE.operationHeaders.length).getValues()[0],result;
  if(!row||row[0]!==id)fail_('OPERATION_CONFLICT','保存履歴が更新されました。同じ操作IDで再試行してください。');
  try{result=JSON.parse(String(row[4]||'{}'));}catch(_){fail_('SCHEMA_MISMATCH','保存履歴の内容を管理者が確認してください。');}
  if(!result||typeof result!=='object'||Array.isArray(result))fail_('SCHEMA_MISMATCH','保存履歴の形式を確認してください。');
  return {actorId:String(row[1]),action:String(row[2]),payloadHash:String(row[3]),result:result};
}
function mutationResponse_(store, user, action, result, operationId, token, secret) {
  var response = { snapshot: token ? authenticatedSnapshot_(store,token) : buildSnapshot_(store, user) };
  if (result.undo) response.changeId=operationId;
  if (action === 'createPlayer' && token) requireAdmin_(snapshotActor_(store, token));
  if (action === 'createPlayer') { if (secret) response.credentials = { id: result.playerId, password: secret }; else response.credentialsUnavailable = true; }
  return response;
}
function cell_(value) {
  if (value instanceof Date) {
    var day = Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd'), parts = day.split('-').map(Number);
    return { userEnteredValue: { numberValue: Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000 + 25569 }, userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy/mm/dd' } } };
  }
  return { userEnteredValue: typeof value === 'number' ? { numberValue: value } : typeof value === 'boolean' ? { boolValue: value } : { stringValue: String(value == null ? '' : value) } };
}
function rowUpdateRequest_(sheetId, row, cells) { return { updateCells: { range: { sheetId: sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: 0, endColumnIndex: cells.length }, rows: [{ values: cells.map(cell_) }], fields: 'userEnteredValue' } }; }
function commit_(store, user, action, operationId, payloadHash, plan, token) {
  if(!store.schemaCompatible)fail_('SCHEMA_MISMATCH','入力対象19列の見出しが一致しません。');
  if (store.book.getSpreadsheetTimeZone() !== 'Asia/Tokyo') fail_('TIMEZONE', '接続先スプレッドシートのタイムゾーンがAsia/Tokyoであることを確認してください。');
  var requests = [], businessSheet = store.matching, checkedValues, checkedFormulas;
  if (plan.row) {
    if (businessSheet.getSheetId() !== Number(store.config.matchingSheetId) || businessSheet.getSheetId() === Number(store.config.kpiSheetId)) fail_('PROTECTED_SHEET', 'このタブは書き込めません。');
    if (plan.record) {
      var currentMetadata = metadataMaps_(businessSheet, [NODE.recordKey, NODE.sourceKey]), ids = currentMetadata[NODE.recordKey], currentRow = Object.keys(ids).find(function (row) { return ids[row].value === plan.recordId; });
      if (!currentRow) fail_('CONFLICT', '対象の行が削除されています。同期してください。');
      currentRow = Number(currentRow);
      var currentRange = businessSheet.getRange(currentRow, 1, 1, 26), currentValues = currentRange.getValues()[0], currentFormulas = currentRange.getFormulas()[0], currentSources = currentMetadata[NODE.sourceKey];
      if (rowVersion_(plan.recordId, currentValues, currentFormulas, currentSources[currentRow] ? currentSources[currentRow].value : '') !== plan.record.version || currentRow !== plan.row) fail_('CONFLICT', '対象行が更新・並べ替えされています。同期してから再入力してください。');
      checkedValues = currentValues; checkedFormulas = currentFormulas;
    }
    var maxRows = sheetRowCount_(businessSheet);
    if (plan.row > maxRows) requests.push({ appendDimension: { sheetId: businessSheet.getSheetId(), dimension: 'ROWS', length: plan.row - maxRows } });
    // Validate one fresh row together. Per-cell service calls made large forms
    // wait for the same row dozens of times; formula and blank-cell guards stay intact.
    if (plan.row <= maxRows && !checkedValues) {
      var targetRange = businessSheet.getRange(plan.row, 1, 1, 26);
      checkedValues = targetRange.getValues()[0]; checkedFormulas = targetRange.getFormulas()[0];
    }
    Object.keys(plan.patches).forEach(function (columnText) {
      var column = Number(columnText);
      if ((action==='updateRecord' ? Array.from({length:26},function(_,i){return i+1;}) : NODE.inputColumns).indexOf(column) < 0) fail_('PROTECTED_COLUMN', 'この列は書き込めません。');
      if (plan.row <= maxRows && checkedFormulas[column - 1]) fail_('FORMULA_PROTECTED', '入力先に数式があります。元の数式は上書きしません。');
      if (!plan.record && plan.row <= maxRows && checkedValues[column - 1] !== '') fail_('CONFLICT', '入力先が更新されています。同期してください。');
      var value = plan.patches[column];
      requests.push({ updateCells: { range: { sheetId: businessSheet.getSheetId(), startRowIndex: plan.row - 1, endRowIndex: plan.row, startColumnIndex: column - 1, endColumnIndex: column }, rows: [{ values: [cell_(value)] }], fields: value instanceof Date ? 'userEnteredValue,userEnteredFormat.numberFormat' : 'userEnteredValue' } });
    });
  }
  if (plan.profileRow && store.playerSheet.getRange(plan.profileRow,1,1,NODE.playerHeaders.length).getFormulas()[0].some(Boolean)) fail_('FORMULA_PROTECTED', 'プロフィールの入力先に数式があります。');
  revalidateManagementPlan_(store,user,plan);
  revalidateIntakePlan_(store,user,plan);
  revalidateTeamPlan_(store,user,plan);
  revalidateRewardsPlan_(store,user,plan);
  revalidateSalesPlan_(store,user,plan);
  revalidateMatchEvidencePlan_(store,user,plan);
  if(token)snapshotActor_(store,token);
  Array.prototype.push.apply(requests, plan.requests || []);
  if(JSON.stringify(plan.result||{}).length>48000)fail_('VALIDATION','変更履歴が大きすぎます。長いメモは項目を分けて保存してください。');
  requests.push({ appendCells: { sheetId: store.operationSheet.getSheetId(), rows: [{ values: [operationId,user.id,action,payloadHash,JSON.stringify(plan.result || {}),new Date().toISOString()].map(cell_) }], fields: 'userEnteredValue' } });
  sheetsBatch_(store.config.spreadsheetId, requests);
  nodeFlush_();
}
function sheetsBatch_(spreadsheetId, requests) {
  assertManagedBook_(spreadsheetId);
  if(nodeUsesFirestore_())return firestoreBatch_(spreadsheetId,requests);
  if (!requests.length) return;
  var response = UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + ':batchUpdate', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: JSON.stringify({ requests: requests }), muteHttpExceptions: true });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) fail_('SHEET_WRITE_FAILED', 'シートへの保存を完了できませんでした。同じ操作IDのまま再試行してください。');
  nodeFlush_();
}

/* Owner-only editor/menu setup. Never reachable through the web-app action dispatch. */
function onOpen() { SpreadsheetApp.getUi().createMenu('NODE連携').addItem('新しい管理シートの初期設定','setupNode').addItem('別の検証用コピーを設定','setupNodeVerificationCopy').addItem('検証用コピーの書き込みを有効化','enableNodeWritesForCopy').addItem('検証用コピーで実検証','verifyNodeCopyIntegration').addItem('検証後に新しい管理シートを有効化','enableNodeDestinationAfterVerifiedCopy').addItem('行IDを同期','syncNodeRowIds').addItem('書き込みを停止','disableNodeWrites').addItem('パスワードを再発行','rotateNodePassword').addItem('全員のパスワードを再発行','rotateAllNodePasswords').addItem('ログイン制限を解除','unlockNodeLogins').addToUi(); }
function requireOwner_() {
  var active = Session.getActiveUser().getEmail(), effective = Session.getEffectiveUser().getEmail();
  if (!active || !effective || active !== effective) fail_('FORBIDDEN', 'スクリプト所有者がエディターまたはシートから実行してください。');
  var raw = props_().getProperty(NODE.configKey);
  if (raw && JSON.parse(raw).ownerEmail !== active) fail_('FORBIDDEN', '設定した所有者のみ実行できます。');
  return active;
}
/** Editor-only aggregate verification. Optional workflow tables remain absent;
 * neither private text nor account identifiers are returned or logged. */
function verifyNodeCompletionReadOnly() {
  var owner=requireOwner_(),config=config_();assertManagedBook_(config.spreadsheetId);
  var accounts=readAccountStore_(config),rewards=rewardState_(accounts.book),archive=migrationTable_(accounts.book);
  rewardBalances_(rewards,accounts.players);
  var result={verified:true,readOnly:true,configUnchanged:true,
    accounts:{count:accounts.players.length,active:accounts.players.filter(function(p){return p.active;}).length},
    rewards:{enabled:rewards.policy.enabled===true,
      settings:{exists:!!rewards.settings.sheet,count:rewards.settings.entries.length},
      ledger:{exists:!!rewards.ledger.sheet,count:rewards.ledger.entries.length},
      requests:{exists:!!rewards.requests.sheet,count:rewards.requests.entries.length}},
    migration:{exists:!!archive.sheet,count:archive.entries.length}};
  if(stableJson_(config_())!==stableJson_(config))fail_('BUSY','接続設定が確認中に更新されました。もう一度確認してください。');
  assertManagedBook_(accounts.book);if(requireOwner_()!==owner)fail_('FORBIDDEN','確認中に実行者が変わりました。');
  Logger.log(JSON.stringify(result));return result;
}
function seedPlayers_() {
  var raw=props_().getProperty(NODE.seedPlayersKey),seeds;if(!raw)return [];
  try{seeds=JSON.parse(raw);}catch(_){fail_('VALIDATION','NODE_SEED_PLAYERS のJSONを確認してください。');}
  if(!Array.isArray(seeds)||seeds.length>50||seeds.some(function(s){return !s||typeof s.name!=='string'||!s.name.trim()||s.name.length>40||!Array.isArray(s.sheetNames)||!s.sheetNames.length||s.sheetNames.some(function(a){return typeof a!=='string'||!a.trim()||a.length>40;});}))fail_('VALIDATION','NODE_SEED_PLAYERS の形式を確認してください。');
  return seeds.map(function(s){return {name:s.name.trim(),sheetNames:s.sheetNames.map(function(a){return a.trim();}),color:['mint','blue','amber','violet','rose','cyan'].indexOf(s.color)>=0?s.color:'blue'};});
}
function setupNode() {
  var owner = requireOwner_(), ui = SpreadsheetApp.getUi(), book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) fail_('NOT_CONFIGURED', '新しい管理シートに紐付いたスクリプトで実行してください。');
  if(book.getId()===NODE.originalId)fail_('PROTECTED_SOURCE','移行元の原本には初期設定も管理タブの追加も行いません。');
  var tabs=resolveBusinessTabs_(book),registered=props_().getProperty(NODE.destinationKey);
  if(registered&&registered!==book.getId())fail_('UNAPPROVED_DESTINATION','登録済みの新しい管理シートと異なります。保存先は変更していません。');
  var answer=ui.prompt('新しい管理シートの登録','このファイルを今後の保存先として登録します。移した業務セルの値・数式・書式は変更せず、アプリ用の管理タブと行管理IDのみ追加します。このファイルのIDを入力してください。',ui.ButtonSet.OK_CANCEL);
  if(answer.getSelectedButton()!==ui.Button.OK||answer.getResponseText().trim()!==book.getId())return;
  return withLock_(function () {
    if (props_().getProperty(NODE.configKey)) fail_('ALREADY_CONFIGURED', '初期設定済みです。再設定は不要です。');
    if (book.getSheetByName(NODE.playersTab) || book.getSheetByName(NODE.operationsTab)) fail_('ALREADY_CONFIGURED', '管理タブが存在します。内容を確認してから設定してください。');
    props_().setProperty(NODE.destinationKey,book.getId());
    assertManagedBook_(book);
    var playerSheet = book.insertSheet(NODE.playersTab), operationSheet = book.insertSheet(NODE.operationsTab);
    var credentials = [], rows = [NODE.playerHeaders];
    rows.push(['ADMIN','insup 管理者','NODE','blue',20,'',JSON.stringify([]),'admin',true]);
    seedPlayers_().forEach(function (seed, i) { rows.push(['ND-' + ('00' + (i + 1)).slice(-3),seed.name,'NODE',seed.color,20,'',JSON.stringify(seed.sheetNames),'player',true]); });
    props_().setProperty(NODE.pepperKey, random256_());
    rows.slice(1).forEach(function (row) { var password = random256_(); props_().setProperty('NODE_AUTH_' + row[0],JSON.stringify(makeGeneratedAuth_(password, true))); credentials.push({ id:row[0],name:row[1],password:password }); });
    playerSheet.getRange(1,1,rows.length,NODE.playerHeaders.length).setValues(rows);
    operationSheet.getRange(1,1,1,NODE.operationHeaders.length).setValues([NODE.operationHeaders]);
    // Only app-owned sheets and metadata are added; original business values, formulas and timezone stay unchanged.
    var config = { spreadsheetId:book.getId(),matchingSheetId:tabs.matchingSheetId,kpiSheetId:tabs.kpiSheetId,purpose:'production',writesEnabled:false,ownerEmail:owner };
    syncRowIds_(book, tabs.matching);
    props_().setProperty(NODE.configKey,JSON.stringify(config));
    protectAppSheet_(playerSheet,owner); protectAppSheet_(operationSheet,owner);
    showCredentials_(credentials,'初期ログイン情報（この画面を閉じる前に控えてください）');
    return { configured:true,writesEnabled:false };
  });
}
function setupNodeVerificationCopy() {
  var owner=requireOwner_(),ui=SpreadsheetApp.getUi(),current=config_(),destinationId=props_().getProperty(NODE.destinationKey);
  if(current.purpose==='verification')fail_('ALREADY_CONFIGURED','検証用コピーを設定済みです。');
  if(writesEnabled_(current))fail_('WRITES_DISABLED','管理シートの書き込みを停止してから検証してください。');
  var answer=ui.prompt('別の検証用コピーを設定','業務データの独立した検証用コピーのファイルIDを入力してください。元原本と今後の管理シートは指定できません。',ui.ButtonSet.OK_CANCEL);
  if(answer.getSelectedButton()!==ui.Button.OK)return;
  var id=answer.getResponseText().trim();
  if(!/^[A-Za-z0-9_-]{20,}$/.test(id)||id===NODE.originalId||id===destinationId)fail_('COPY_VERIFICATION_REQUIRED','独立した検証用コピーのIDが必要です。');
  return withLock_(function(){
    var source=readStore_(),copy=SpreadsheetApp.openById(id),tabs=resolveBusinessTabs_(copy),destination=SpreadsheetApp.openById(destinationId),destinationTabs=resolveBusinessTabs_(destination);
    if(schemaHash_(tabs.matching)!==schemaHash_(destinationTabs.matching))fail_('SCHEMA_MISMATCH','新しい管理シートと検証用コピーのヘッダーが一致しません。');
    if(copy.getSheetByName(NODE.playersTab)||copy.getSheetByName(NODE.operationsTab))fail_('ALREADY_CONFIGURED','検証用コピーに管理タブがあります。初期設定前の独立したコピーを使用してください。');
    props_().setProperty(NODE.verificationKey,id);assertManagedBook_(copy);
    var playerSheet=copy.insertSheet(NODE.playersTab),operationSheet=copy.insertSheet(NODE.operationsTab),rows=[NODE.playerHeaders];
    source.players.filter(function(p){return p.active;}).forEach(function(p){rows.push([p.id,p.name,p.team,p.color,p.target,p.bio,JSON.stringify(p.sheetNames),p.role,p.active]);});
    playerSheet.getRange(1,1,rows.length,NODE.playerHeaders.length).setValues(rows);operationSheet.getRange(1,1,1,NODE.operationHeaders.length).setValues([NODE.operationHeaders]);
    protectAppSheet_(playerSheet,owner);protectAppSheet_(operationSheet,owner);syncRowIds_(copy,tabs.matching);
    props_().setProperty(NODE.configKey,JSON.stringify({spreadsheetId:id,matchingSheetId:tabs.matchingSheetId,kpiSheetId:tabs.kpiSheetId,purpose:'verification',writesEnabled:false,ownerEmail:owner}));
    props_().deleteProperty('NODE_COPY_PROOF');clearAllSessions_();
    return {configured:true,writesEnabled:false,purpose:'verification'};
  });
}
function protectAppSheet_(sheet, owner) {
  assertManagedBook_(sheet.getParent());
  var protection = sheet.protect().setDescription('NODEアプリ管理用');
  protection.addEditor(owner);
  var editors = protection.getEditors().filter(function (user) { return user.getEmail() !== owner; });
  if (editors.length) protection.removeEditors(editors);
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
}
function syncRowIds_(book, matching) {
  assertManagedBook_(book);
  var tabs=resolveBusinessTabs_(book);if(tabs.matching.getSheetId()!==matching.getSheetId())fail_('SCHEMA_MISMATCH','行管理IDの対象タブが異なります。');
  var rows = matching.getRange(1,1,Math.max(1,matching.getLastRow()),26).getValues(), header = detectHeader_(rows), existing = metadataMap_(matching,NODE.recordKey), requests = [];
  for (var i = header; i < rows.length; i++) if (normalizeName_(rows[i][2]) && !existing[i + 1] && normalizeHeader_(rows[i][2]).indexOf('氏名') < 0) requests.push(metadataCreate_(matching.getSheetId(),i+1,NODE.recordKey,Utilities.getUuid()));
  for (var start = 0; start < requests.length; start += 400) sheetsBatch_(book.getId(),requests.slice(start,start+400));
}
function syncNodeRowIds() { requireOwner_(); return withLock_(function () { var store=readStore_();syncRowIds_(store.book,store.matching);return {synced:true}; }); }
function enableNodeWritesForCopy() {
  requireOwner_(); var ui=SpreadsheetApp.getUi(),config=config_();
  if (config.spreadsheetId===NODE.originalId||config.purpose!=='verification'||config.spreadsheetId!==props_().getProperty(NODE.verificationKey)||config.spreadsheetId===props_().getProperty(NODE.destinationKey)) fail_('WRITES_DISABLED','別の検証用コピーだけを書き込み可能にできます。');
  var answer=ui.alert('複製シートへの書き込み','バックアップを確保し、入力列・保護範囲・日付・担当者の別名を確認しましたか？ 入力対象外の列は変更しません。',ui.ButtonSet.YES_NO);
  if (answer!==ui.Button.YES) return;
  return withLock_(function () { var store=readStore_();if(!store.schemaCompatible)fail_('SCHEMA_MISMATCH','入力対象19列の見出しと順序を確認してください。');if(store.book.getSpreadsheetTimeZone()!=='Asia/Tokyo')fail_('TIMEZONE','複製シートのタイムゾーンをAsia/Tokyoにしてください。');config.writesEnabled=true;props_().setProperty(NODE.configKey,JSON.stringify(config)); });
}
function probeReservation_(store,actorId,allowExpired) {
  var raw=props_().getProperty(NODE.probeKey);if(!raw)return null;
  var probe;try{probe=JSON.parse(raw);}catch(_){fail_('COPY_PROBE_INVALID','検証行の割当を所有者が確認してください。');}
  if(probe.actorId!==actorId)return null;
  if(store.config.purpose!=='verification'||probe.spreadsheetId!==store.config.spreadsheetId||probe.spreadsheetId!==props_().getProperty(NODE.verificationKey)||probe.spreadsheetId===NODE.originalId||probe.spreadsheetId===props_().getProperty(NODE.destinationKey)||probe.ownerEmail!==store.config.ownerEmail||probe.matchingSheetId!==store.matching.getSheetId()||!Number.isInteger(probe.originalMaxRows)||!Array.isArray(probe.rows)||probe.rows.length!==2||probe.rows.some(function(row,i){return row!==probe.originalMaxRows+i+1;})||!probe.recordIds||!Number.isFinite(probe.expiresAt))fail_('COPY_PROBE_INVALID','検証行の割当が接続先と一致しません。');
  if(!allowExpired&&probe.expiresAt<=Date.now())fail_('COPY_PROBE_EXPIRED','検証行の割当が期限切れです。所有者が検証コピーを確認してください。');
  return probe;
}
function guardProbeBusinessMutation_(store,user,action,payload) {
  if(['saveMetricGoals','saveWorkJob','saveProposalPlan','recordProposalSent','saveMatchReport','saveIntroductionV2','saveIntroductionSettings','publishIntroductionV2','beginMatchEvidence','completeMatchEvidence','publishTeamCandidate','unpublishTeamCandidate','saveTeamComment','saveTeamJob','stageMigrationBatch','applyMigrationItem','mutateRewards','saveActivity','updateStatus','updateRecord','deleteCandidate','cancelAchievement','restoreChange','saveManagementRow','createCandidate','saveCandidateProfile','saveClient'].indexOf(action)<0)return;
  if((['saveMetricGoals','saveWorkJob','saveProposalPlan','recordProposalSent','saveMatchReport','saveIntroductionV2','saveIntroductionSettings','publishIntroductionV2','beginMatchEvidence','completeMatchEvidence','publishTeamCandidate','unpublishTeamCandidate','saveTeamComment','saveTeamJob','stageMigrationBatch','applyMigrationItem','mutateRewards'].indexOf(action)>=0||action==='restoreChange'||action==='saveManagementRow'||action==='createCandidate'||action==='saveCandidateProfile'||action==='saveClient')&&probeReservation_(store,user.id,false))fail_('FORBIDDEN','検証専用アカウントにはこの操作は許可されていません。');
  var activity=payload.activity||{},recordId=action==='saveActivity'?activity.recordId:payload.recordId,record=recordId?findRecord_(store,recordId):null;
  var targetId=record?record.playerId:action==='saveActivity'?activity.playerId:null;
  var probe=probeReservation_(store,user.id,false),targetProbe=targetId&&targetId!==user.id?probeReservation_(store,targetId,false):null;
  if(targetProbe)fail_('FORBIDDEN','検証行へ保存できるのは検証専用アカウント本人だけです。');
  if(!probe)return;
  if(recordId&&(!record||probe.rows.indexOf(record.row)<0||probe.recordIds[record.row]!==record.recordId))fail_('CONFLICT','検証専用アカウントは割り当てられた行だけ更新できます。');
  if(action==='saveActivity'&&activity.playerId!==user.id)fail_('FORBIDDEN','検証専用アカウント本人の実績だけ保存できます。');
}
function reserveCopyProbeRows_(actorId) {
  var owner=requireOwner_();
  return withLock_(function(){
    var store=readStore_();
    if(store.config.purpose!=='verification'||!writesEnabled_(store.config)||store.config.spreadsheetId!==props_().getProperty(NODE.verificationKey)||store.config.spreadsheetId===props_().getProperty(NODE.destinationKey))fail_('COPY_VERIFICATION_REQUIRED','登録済みの検証用コピーだけに検証行を追加できます。');
    var actor=store.players.find(function(p){return p.id===actorId&&p.active&&p.role==='player'&&p.team==='検証用'&&/^連携検証[a-f0-9]{12}$/i.test(p.name);});
    if(!actor)fail_('FORBIDDEN','検証専用アカウントだけに行を割り当てます。');
    if(props_().getProperty(NODE.probeKey))fail_('COPY_PROBE_PENDING','前の検証行の記録が残っています。所有者が確認してください。');
    var end=sheetRowCount_(store.matching),probe={spreadsheetId:store.config.spreadsheetId,actorId:actorId,ownerEmail:owner,matchingSheetId:store.matching.getSheetId(),originalMaxRows:end,rows:[end+1,end+2],recordIds:{},expiresAt:Date.now()+30*60000};
    props_().setProperty(NODE.probeKey,JSON.stringify(probe));
    // Only newly appended verification-copy rows lose inherited validation. Existing cells are untouched.
    sheetsBatch_(store.config.spreadsheetId,[{appendDimension:{sheetId:store.matching.getSheetId(),dimension:'ROWS',length:2}},{setDataValidation:{range:{sheetId:store.matching.getSheetId(),startRowIndex:end,endRowIndex:end+2,startColumnIndex:0,endColumnIndex:26}}}]);
    return probe;
  });
}
function takeProbeRow_(store,actorId,authenticatedId) {
  var probe=probeReservation_(store,actorId,false);if(!probe)return null;
  if(authenticatedId!==actorId)fail_('FORBIDDEN','検証行へ保存できるのは検証専用アカウント本人だけです。');
  var ids=metadataMap_(store.matching,NODE.recordKey),maxRows=sheetRowCount_(store.matching);
  for(var i=0;i<probe.rows.length;i++){
    var row=probe.rows[i];if(row>maxRows)fail_('COPY_PROBE_INVALID','検証行の追加が完了していません。');
    var range=store.matching.getRange(row,1,1,26),values=range.getValues()[0],formulas=range.getFormulas()[0];
    if(values.some(function(value){return value!==''&&value!=null;})||formulas.some(Boolean)){
      if(!probe.recordIds[row]||!ids[row]||ids[row].value!==probe.recordIds[row])fail_('CONFLICT','検証行が別の内容で更新されています。上書きしません。');
      continue;
    }
    if(ids[row]&&ids[row].value!==probe.recordIds[row])fail_('CONFLICT','検証行の管理IDが異なります。');
    var recordId=probe.recordIds[row]||Utilities.getUuid();probe.recordIds[row]=recordId;props_().setProperty(NODE.probeKey,JSON.stringify(probe));
    return {row:row,recordId:recordId};
  }
  fail_('COPY_PROBE_EXHAUSTED','検証専用の2行は使用済みです。');
}
/** Real copy-only API integration probe; never creates a test candidate on the original. */
function verifyNodeCopyIntegration() {
  var owner=requireOwner_(),config=config_(),ui=SpreadsheetApp.getUi();
  if(config.purpose!=='verification'||config.spreadsheetId!==props_().getProperty(NODE.verificationKey)||config.spreadsheetId===props_().getProperty(NODE.destinationKey)||!writesEnabled_(config))fail_('COPY_VERIFICATION_REQUIRED','書き込みを有効にした独立した検証用コピーで検証してください。');
  // The synthetic ADMIN session acts as ADMIN, so it must not run while ADMIN still holds an issued password.
  var adminAuth=authRecord_('ADMIN'),adminRequired='先にアプリへADMINでログインし、発行されたパスワードを変更してから実検証してください。';
  if(!adminAuth||adminAuth.mustChange===true)fail_('PASSWORD_CHANGE_REQUIRED',adminRequired);
  if(ui.alert('複製シートで実検証','検証コピーの末尾に新規2行を追加し、その2行だけ入力制限を外してログイン・保存・数式拒否・読み戻しを確認します。既存セルは変更せず、終了時にテスト内容を消去します。空の2行とアプリの検証履歴はコピーに残します。',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
  // Re-read after the modal: ADMIN may have changed the password while it was open.
  adminAuth=authRecord_('ADMIN');
  if(!adminAuth||adminAuth.mustChange===true)fail_('PASSWORD_CHANGE_REQUIRED',adminRequired);
  props_().deleteProperty('NODE_COPY_PROOF');
  var adminToken=random256_(),firstToken='',testToken='',testId='',suffix=Utilities.getUuid().replace(/-/g,'').slice(0,12),failure=null,cleanupConfirmed=false;
  props_().setProperty(sessionKey_(adminToken),JSON.stringify({id:'ADMIN',issuedAt:Date.now(),lastSeenAt:Date.now(),expiresAt:Date.now()+30*60000,authVersion:adminAuth.version||null}));
  try{
    var created=nodeHandle_({version:1,action:'createPlayer',token:adminToken,operationId:'copy-probe-player-'+suffix,payload:{name:'連携検証'+suffix,team:'検証用',target:1,sheetNames:['連携検証'+suffix]}});
    testId=created.credentials.id;
    reserveCopyProbeRows_(testId);
    // With the owner's switch on, the issued password must open only the change screen; with it off it logs in as before.
    // Either way the probe then changes it like a member would.
    var forced=forcedPasswordChange_(),first=nodeHandle_({version:1,action:'login',payload:{id:testId,password:created.credentials.password}});
    firstToken=first.token;
    if(forced&&(first.mustChangePassword!==true||first.snapshot!==undefined))fail_('COPY_VERIFICATION_FAILED','初期パスワードの変更要求を確認できませんでした。');
    if(!forced&&(first.mustChangePassword!==undefined||!first.snapshot))fail_('COPY_VERIFICATION_FAILED','発行したパスワードでのログインを確認できませんでした。');
    var probePassword=random256_();
    nodeHandle_({version:1,action:'changePassword',token:firstToken,payload:{currentPassword:created.credentials.password,newPassword:probePassword}});
    var loggedIn=nodeHandle_({version:1,action:'login',payload:{id:testId,password:probePassword}});
    testToken=loggedIn.token;
    if(loggedIn.snapshot.self.playerId!==testId||loggedIn.snapshot.self.role!=='player')fail_('COPY_VERIFICATION_FAILED','検証ログインに失敗しました。');
    var activity={playerId:testId,candidateName:'接続検証'+suffix,source:'検証専用',position:'その他',company:'',stage:'候補者面談',date:today_(),memo:'複製での接続確認'};
    nodeHandle_({version:1,action:'saveActivity',token:testToken,operationId:'copy-probe-interview-'+suffix,payload:{activity:activity}});
    activity=Object.assign({},activity,{company:'接続検証クライアント',stage:'提案',probability:'Cヨミ'});
    var proposed=nodeHandle_({version:1,action:'saveActivity',token:testToken,operationId:'copy-probe-proposal-'+suffix,payload:{activity:activity}});
    var snapshot=nodeHandle_({version:1,action:'snapshot',token:testToken}),row=snapshot.activities.find(function(a){return a.playerId===testId&&a.stage==='提案';});
    if(!row||row.candidateName!==activity.candidateName||row.company!==activity.company||row.date!==activity.date||!row.rowVersion||snapshot.counts.all[testId]['候補者面談']!==1||snapshot.counts.all[testId]['提案']!==1)fail_('COPY_VERIFICATION_FAILED','書き込み後の実データを確認できませんでした。');
    var store=readStore_(),record=findRecord_(store,row.recordId);
    if(!(record.values[7] instanceof Date)||day_(record.values[7])!==activity.date)fail_('COPY_VERIFICATION_FAILED','日付がシートのDate値で保存されていません。');
    // This formula exists only in the copy's dedicated probe row. API must refuse to overwrite it.
    sheetsBatch_(config.spreadsheetId,[{updateCells:{range:{sheetId:store.matching.getSheetId(),startRowIndex:record.row-1,endRowIndex:record.row,startColumnIndex:6,endColumnIndex:7},rows:[{values:[{userEnteredValue:{formulaValue:'=1'}}]}],fields:'userEnteredValue'}}]);
    var formulaSnapshot=nodeHandle_({version:1,action:'snapshot',token:testToken}),formulaRow=formulaSnapshot.activities.find(function(a){return a.recordId===row.recordId;});
    var refused=false;
    try{nodeHandle_({version:1,action:'updateStatus',token:testToken,operationId:'copy-probe-formula-'+suffix,payload:{recordId:row.recordId,status:'辞退（本人希望）',rowVersion:formulaRow.rowVersion}});}catch(error){refused=error.nodeCode==='FORMULA_PROTECTED';}
    if(!refused||store.matching.getRange(record.row,7).getFormula()!=='=1')fail_('COPY_VERIFICATION_FAILED','数式保護の確認に失敗しました。');
  }catch(error){failure=error;}
  finally{
    try{if(testId){cleanupCopyProbe_(testId);cleanupConfirmed=true;}}catch(cleanupError){failure=cleanupError;}
    if(testToken)props_().deleteProperty(sessionKey_(testToken));if(firstToken)props_().deleteProperty(sessionKey_(firstToken));props_().deleteProperty(sessionKey_(adminToken));if(testId){props_().deleteProperty('NODE_AUTH_'+testId);props_().deleteProperty(sessionIndexKey_(testId));}
  }
  if(failure)throw failure;
  if(!cleanupConfirmed||props_().getProperty(NODE.probeKey))fail_('COPY_VERIFICATION_FAILED','検証用の入力セルと管理IDの後始末を確認できませんでした。');
  var finalStore=readStore_();
  if(finalStore.records.some(function(r){return r.playerId===testId;})||finalStore.players.some(function(p){return p.id===testId&&p.active;}))fail_('COPY_VERIFICATION_FAILED','検証データの後始末を確認してください。');
  var proof=makeCopyProof_(config.spreadsheetId,schemaHash_(finalStore.matching),owner);props_().setProperty('NODE_COPY_PROOF',JSON.stringify(proof));
  ui.alert('別のコピーで実検証が完了しました。原本と新しい管理シートの業務セルは変更していません。検証証明は7日間有効です。');
  return {verified:true,copyId:config.spreadsheetId,verifiedAt:proof.verifiedAt};
}
function cleanupCopyProbe_(testId) {
  requireOwner_();
  return withLock_(function(){
  var store=readStore_();if(store.config.purpose!=='verification'||store.config.spreadsheetId!==props_().getProperty(NODE.verificationKey)||store.config.spreadsheetId===NODE.originalId||store.config.spreadsheetId===props_().getProperty(NODE.destinationKey))fail_('COPY_VERIFICATION_REQUIRED','後始末は別の検証用コピーだけで実行します。');
  var probe=probeReservation_(store,testId,true),requests=[],rows=[];
  if(probe){
    var ids=metadataMap_(store.matching,NODE.recordKey);
    probe.rows.forEach(function(row){
      var expected=probe.recordIds[row];
      if(expected){
        if(!ids[row]||ids[row].value!==expected||Object.keys(ids).filter(function(key){return ids[key].value===expected;}).length!==1)fail_('CONFLICT','割り当てた検証行の管理IDが削除・移動されています。予約を保持して後始末を停止しました。');
        rows.push(row);
      }else if(ids[row])fail_('CONFLICT','検証行の管理IDが更新されています。後始末を停止しました。');
    });
  }
  rows.forEach(function(row){NODE.inputColumns.forEach(function(column){requests.push({updateCells:{range:{sheetId:store.matching.getSheetId(),startRowIndex:row-1,endRowIndex:row,startColumnIndex:column-1,endColumnIndex:column},rows:[{values:[{}]}],fields:'userEnteredValue'}});});});
  [NODE.recordKey,NODE.sourceKey].forEach(function(key){var metadata=metadataMap_(store.matching,key);rows.forEach(function(row){if(metadata[row])requests.push({deleteDeveloperMetadata:{dataFilter:{developerMetadataLookup:{metadataId:metadata[row].metadataId}}}});});});
  var player=store.players.find(function(p){return p.id===testId;});
  if(player)requests.push(rowUpdateRequest_(store.playerSheet.getSheetId(),player.row,[player.id,player.name,player.team,player.color,player.target,player.bio,JSON.stringify(player.sheetNames),player.role,false]));
  sheetsBatch_(store.config.spreadsheetId,requests);nodeFlush_();
  if(probe){
    // Check raw cells and metadata: inactive actors are intentionally absent from readStore().records.
    var remainingIds=metadataMap_(store.matching,NODE.recordKey),remainingSources=metadataMap_(store.matching,NODE.sourceKey),maxRows=sheetRowCount_(store.matching),expectedIds=Object.keys(probe.recordIds).map(function(row){return probe.recordIds[row];});
    probe.rows.forEach(function(row){
      if(row>maxRows)fail_('CONFLICT','検証行が移動または削除されています。予約を保持して確認を停止しました。');
      var range=store.matching.getRange(row,1,1,26),values=range.getValues()[0],formulas=range.getFormulas()[0];
      if(NODE.inputColumns.some(function(column){return values[column-1]!==''&&values[column-1]!=null||!!formulas[column-1];})||remainingIds[row]||remainingSources[row])fail_('CONFLICT','検証用の入力値・数式・管理IDが残っています。予約を保持して確認を停止しました。');
    });
    if(Object.keys(remainingIds).some(function(row){return expectedIds.indexOf(remainingIds[row].value)>=0;}))fail_('CONFLICT','検証用の管理IDが別の行に残っています。予約を保持して確認を停止しました。');
    props_().deleteProperty(NODE.probeKey);
  }
  });
}
/** The migration source is permanently read-only, including any previously deployed menu entry. */
function enableNodeOriginalAfterVerifiedCopy() { fail_('PROTECTED_SOURCE','移行元の原本への書き込みは有効にできません。新しい管理シートを使用してください。'); }
function clearAllSessions_() { Object.keys(props_().getProperties()).forEach(function(key){if(key.indexOf('NODE_SESSION_')===0)props_().deleteProperty(key);}); }
function enableNodeDestinationAfterVerifiedCopy() {
  var owner=requireOwner_(),ui=SpreadsheetApp.getUi(),config=config_(),proof=copyProof_(),destinationId=props_().getProperty(NODE.destinationKey);
  assertManagedBook_(destinationId);
  var destination=SpreadsheetApp.openById(destinationId),tabs=resolveBusinessTabs_(destination);
  if(destination.getSpreadsheetTimeZone()!=='Asia/Tokyo')fail_('TIMEZONE','新しい管理シートのタイムゾーンを確認してください。設定は変更していません。');
  verifyDestinationReadiness_(config,proof,destination,owner);
  var answer=ui.prompt('新しい管理シートを有効化','移した値・数式・書式を確認し、この新しい管理シートを今後の保存先にする場合だけ、登録済みのファイルIDを入力してください。テストの業務行は作成しません。',ui.ButtonSet.OK_CANCEL);
  if(answer.getSelectedButton()!==ui.Button.OK||answer.getResponseText().trim()!==destinationId)return;
  return withLock_(function(){
    var current=config_(),currentProof=copyProof_();verifyDestinationReadiness_(current,currentProof,destination,owner);
    // Setup already created these app-owned tabs. Do not replace the destination's business or profile data with test-copy data.
    table_(destination.getSheetByName(NODE.playersTab),NODE.playerHeaders);table_(destination.getSheetByName(NODE.operationsTab),NODE.operationHeaders);
    syncRowIds_(destination,tabs.matching);
    var authorizedAt=new Date().toISOString(),next={spreadsheetId:destinationId,matchingSheetId:tabs.matchingSheetId,kpiSheetId:tabs.kpiSheetId,purpose:'production',writesEnabled:true,ownerEmail:owner,verifiedCopyId:currentProof.copyId,destinationAuthorizedAt:authorizedAt,destinationAuthorizationSeal:destinationAuthorization_(currentProof,owner,authorizedAt)};
    props_().setProperty(NODE.configKey,JSON.stringify(next));clearAllSessions_();
    ui.alert('新しい管理シートを保存先として有効化しました。移した業務セルの値・数式・書式は変更していません。アプリへ再ログインしてください。');
    return {configured:true,writesEnabled:true,purpose:'production'};
  });
}
function unlockNodeLogins() {
  requireOwner_();
  return withLock_(function () { var all=props_().getProperties(),cleared=0;Object.keys(all).forEach(function(key){if(key.indexOf('NODE_RATE_')===0||key==='NODE_LOGIN_RATE'){props_().deleteProperty(key);cleared++;}});return {cleared:cleared}; });
}
function disableNodeWrites() { requireOwner_(); return withLock_(function () { var config=config_();config.writesEnabled=false;props_().setProperty(NODE.configKey,JSON.stringify(config)); }); }
function rotateNodePassword() {
  requireOwner_(); var ui=SpreadsheetApp.getUi(),answer=ui.prompt('パスワード再発行','対象ID（ADMINまたはND-001など）',ui.ButtonSet.OK_CANCEL);
  if(answer.getSelectedButton()!==ui.Button.OK)return;
  var id=answer.getResponseText().trim().toUpperCase();
  return withLock_(function () { var store=readStore_(),player=store.players.find(function(p){return p.id===id&&p.active;});if(!player)fail_('VALIDATION','対象IDがありません。');var password=random256_();props_().setProperty('NODE_AUTH_'+id,JSON.stringify(makeGeneratedAuth_(password,true)));var all=props_().getProperties();Object.keys(all).forEach(function(key){if(key.indexOf('NODE_SESSION_')===0&&JSON.parse(all[key]).id===id)props_().deleteProperty(key);});showCredentials_([{id:id,name:player.name,password:password}],'再発行したログイン情報'); });
}
function allPasswordRotationTarget_() {
  var owner=requireOwner_(),config=config_(),destinationId=props_().getProperty(NODE.destinationKey);
  assertManagedBook_(config.spreadsheetId);
  if(config.purpose!=='production'||config.spreadsheetId!==destinationId)fail_('PRODUCTION_REQUIRED','全員の再発行は登録済みの新しい管理シートで実行してください。');
  var store=readStore_(),players=store.players.filter(function(p){return p.active&&(p.role==='admin'||p.role==='player');}).map(function(p){return {id:p.id,name:p.name,role:p.role};}).sort(function(a,b){return a.id.localeCompare(b.id);});
  if(!players.length||players.some(function(p){return !/^(ADMIN|ND-\d{3,})$/.test(p.id)||store.players.filter(function(other){return other.id===p.id;}).length!==1;}))fail_('SCHEMA_MISMATCH','再発行対象のIDと有効な名簿を確認してください。');
  return {ownerEmail:owner,destinationId:destinationId,matchingSheetId:config.matchingSheetId,kpiSheetId:config.kpiSheetId,players:players};
}
function rotationPropertiesMatch_(expected) {
  try { var current=props_().getProperties();return Object.keys(expected).every(function(key){return current[key]===expected[key];}); }
  catch(_){return false;}
}
function setRotationProperties_(updates) {
  if(!Object.keys(updates).length)return true;
  // PropertiesService has no documented multi-key transaction guarantee. Verify even after an ambiguous error.
  try { props_().setProperties(updates,false); } catch(_){}
  return rotationPropertiesMatch_(updates);
}
/** Owner-only menu action. The confirmation is deliberately outside ScriptLock. */
function rotateAllNodePasswords() {
  var preview=allPasswordRotationTarget_(),ui=SpreadsheetApp.getUi();
  var message=preview.players.map(function(p){return p.id+'  '+p.name;}).join('\n')+'\n\n上記'+preview.players.length+'名の旧パスワードと現在のログインセッションをすべて無効にします。\n新しいパスワードは次の画面に一度だけ表示します。控える準備ができたら「はい」を押してください。';
  if(ui.alert('全員のパスワードを再発行',message,ui.ButtonSet.YES_NO)!==ui.Button.YES)return {rotated:0};
  var credentials=withLock_(function(){
    var current=allPasswordRotationTarget_();
    if(stableJson_(current)!==stableJson_(preview))fail_('CONFLICT','確認中に所有者・保存先・対象名簿が変わりました。何も変更せず停止しました。もう一度確認してください。');
    var before=props_().getProperties(),updates={},previous={},expired={},credentials=[],ids=current.players.map(function(p){return p.id;});
    current.players.forEach(function(p){var password=random256_(),key='NODE_AUTH_'+p.id,rateKey='NODE_RATE_'+hash_(p.id);updates[key]=JSON.stringify(makeGeneratedAuth_(password,true));previous[key]=before[key];updates[rateKey]=JSON.stringify({start:Date.now(),failures:0});previous[rateKey]=before[rateKey];credentials.push({id:p.id,name:p.name,password:password});});
    Object.keys(before).forEach(function(key){if(key.indexOf('NODE_SESSION_')!==0)return;var session;try{session=JSON.parse(before[key]);}catch(_){return;}if(session&&ids.indexOf(session.id)>=0)expired[key]=JSON.stringify({id:session.id,expiresAt:0});});
    // Revoke existing sessions first, while the lock excludes every login and authenticated API request.
    if(!setRotationProperties_(expired))fail_('PASSWORD_ROTATION_FAILED','ログインセッションの失効を確認できなかったため、パスワードは変更していません。所有者がもう一度実行してください。');
    if(!setRotationProperties_(updates)){
      var restore={};Object.keys(previous).forEach(function(key){if(previous[key]!==undefined)restore[key]=previous[key];});
      setRotationProperties_(restore);
      Object.keys(previous).forEach(function(key){if(previous[key]===undefined){try{props_().deleteProperty(key);}catch(_){}}});
      if(!rotationPropertiesMatch_(previous))fail_('PASSWORD_ROTATION_INCOMPLETE','認証設定の復元を確認できませんでした。所有者が全員の再発行をもう一度実行してください。');
      fail_('PASSWORD_ROTATION_FAILED','再発行を完了できなかったため旧パスワードへ戻しました。既存のログインセッションは失効しています。所有者がもう一度実行してください。');
    }
    return credentials;
  });
  try { showCredentials_(credentials,'全員の新しいログイン情報（閉じる前に控えてください）'); }
  catch(_) { fail_('PASSWORD_DISPLAY_FAILED','再発行は完了しましたが一覧を表示できませんでした。所有者が「全員のパスワードを再発行」をもう一度実行し、新しい一覧を控えてください。'); }
  return {rotated:credentials.length};
}
function escapeHtml_(text) { return String(text).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function showCredentials_(credentials,title) {
  var html='<div style="font-family:system-ui;padding:16px"><p>パスワードは画面を閉じる前に控えてください。シート・ログには保存しません。初回ログイン時に本人がパスワードを変更します。</p><table style="border-collapse:collapse;width:100%">'+credentials.map(function(c){return '<tr><td style="padding:10px">'+escapeHtml_(c.id)+' '+escapeHtml_(c.name)+'</td><td><code style="user-select:all">'+escapeHtml_(c.password)+'</code></td></tr>';}).join('')+'</table></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(850).setHeight(500),title);
}

if (typeof NODE_TESTS !== 'undefined') Object.assign(NODE_TESTS,{constants:NODE,handle:nodeHandle_,hash:hash_,passwordHash:passwordHash_,makeAuth:makeAuth_,makeGeneratedAuth:makeGeneratedAuth_,stretchedHash:stretchedHash_,verifyPassword:verifyPassword_,day:day_,dayDate:dayDate_,candidateId:candidateId_,detectHeader:detectHeader_,countActivities:countActivities_,rowVersion:rowVersion_,readStore:readStore_,snapshot:buildSnapshot_,activities:activities_,writesEnabled:writesEnabled_,makeCopyProof:makeCopyProof_,validCopyProof:validCopyProof_,verifyDestinationReadiness:verifyDestinationReadiness_,destinationAuthorization:destinationAuthorization_,resolveBusinessTabs:resolveBusinessTabs_,assertManagedBook:assertManagedBook_,mappedHeadersMatch:mappedHeadersMatch_});

/* Candidate records and bounded administration tables. */
function requireAdmin_(user) { if(user.role!=='admin')fail_('FORBIDDEN','管理者だけがこの管理表を利用できます。'); }
function publicRecord_(r) {
  return {recordId:r.recordId,rowVersion:r.version,row:r.row,playerId:r.playerId,candidateId:r.candidateId,candidateName:r.name,source:r.source,profileId:r.profileId||undefined,
    values:r.values.map(function(v,i){return v instanceof Date ? ([11,20].indexOf(i+1)>=0?time_(v,false):day_(v)) : v==null?'':v;}),formulaColumns:r.formulas.map(function(f,i){return f?i+1:0;}).filter(Boolean)};
}
function managementTabAllowed_(title) { return ['目標','案件管理表','ｴｰｼﾞｪﾝﾄ管理表','稼働者管理表',NODE.kpiTab,'1期目マッチングDB'].indexOf(title)>=0 || /^マッチ計上(?:[1-9]|1[0-2])月\s*$/.test(title) || title==='マッチ計上(8月)'; }
function managementTables_(book) {
  return {tables:book.getSheets().filter(function(s){return managementTabAllowed_(s.getName());}).map(function(s){return {sheetId:s.getSheetId(),title:s.getName(),rowCount:s.getMaxRows(),columnCount:s.getMaxColumns()};})};
}
function managementSheet_(book,id) {
  if(!Number.isInteger(id))fail_('VALIDATION','管理表を選択してください。');
  var sheet=book.getSheets().find(function(s){return s.getSheetId()===id;});
  if(!sheet||!managementTabAllowed_(sheet.getName()))fail_('PROTECTED_SHEET','この管理タブはアプリから操作できません。');return sheet;
}
function columnName_(n) { var text='';while(n>0){n--;text=String.fromCharCode(65+n%26)+text;n=Math.floor(n/26);}return text; }
function gridRead_(book,sheet,start,count) {
  if(nodeUsesFirestore_())return firestoreGridRead_(book,sheet,start,count);
  if(!Number.isInteger(start)||start<1||start>sheet.getMaxRows()||!Number.isInteger(count)||count<1||count>100)fail_('VALIDATION','表示する行を確認してください。');
  var end=Math.min(start+count-1,sheet.getMaxRows()),cols=Math.min(100,sheet.getMaxColumns());
  var ranges=["'"+sheet.getName().replace(/'/g,"''")+"'!A"+start+':'+columnName_(cols)+end];
  var response=Sheets.Spreadsheets.get(book.getId(),{ranges:ranges,fields:'sheets(properties(sheetId),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue,dataValidation,userEnteredFormat(numberFormat),chipRuns,note))))'});
  var found=response.sheets&&response.sheets.find(function(s){return s.properties.sheetId===sheet.getSheetId();});
  if(!found||!Array.isArray(found.data))fail_('SHEET_READ_FAILED','管理表のセル情報を取得できませんでした。');
  var rows=Array.from({length:end-start+1},function(){return Array.from({length:cols},function(){return {};});});
  found.data.forEach(function(g){(g.rowData||[]).forEach(function(r,i){var target=(g.startRow||0)+i-start+1;if(target<0||target>=rows.length)return;(r.values||[]).forEach(function(c,j){var col=(g.startColumn||0)+j;if(col<cols)rows[target][col]=c;});});});
  return rows;
}
function gridFingerprint_(cells) { return hash_(stableJson_(cells.map(function(c){return [c.userEnteredValue||{},c.dataValidation||{},c.chipRuns||[],c.userEnteredFormat&&c.userEnteredFormat.numberFormat||{}];}))); }
function publicCell_(c,column) {
  var raw=c.userEnteredValue||{},effective=c.effectiveValue||{},format=c.userEnteredFormat&&c.userEnteredFormat.numberFormat||{},value=raw.stringValue===undefined?(raw.numberValue===undefined?(raw.boolValue===undefined?'':raw.boolValue):raw.numberValue):raw.stringValue;
  var kind=typeof value==='boolean'?'boolean':typeof value==='number'?'number':'text';
  if(value===''&&['DATE','DATE_TIME'].indexOf(format.type)>=0)kind='date';
  if(value===''&&format.type==='TIME')kind='time';
  if(value===''&&format.type==='PERCENT')kind='percent';
  if(value===''&&['NUMBER','CURRENCY','SCIENTIFIC'].indexOf(format.type)>=0)kind='number';
  if(value===''&&c.dataValidation&&c.dataValidation.condition&&c.dataValidation.condition.type==='DATE_IS_VALID')kind='date';
  if(['DATE','DATE_TIME'].indexOf(format.type)>=0&&typeof value==='number'){kind='date';value=new Date((value-25569)*86400000).toISOString().slice(0,10);}
  if(format.type==='TIME'&&typeof value==='number'){kind='time';var minutes=Math.round((value%1)*1440);value=('0'+Math.floor(minutes/60)%24).slice(-2)+':'+('0'+minutes%60).slice(-2);}
  if(format.type==='PERCENT'&&typeof value==='number')kind='percent';
  var options=c.dataValidation&&c.dataValidation.condition&&c.dataValidation.condition.type==='ONE_OF_LIST'?(c.dataValidation.condition.values||[]).map(function(v){return v.userEnteredValue;}):[];
  return {column:column,value:value,display:c.formattedValue||String(value),kind:kind,options:options,readonly:!!raw.formulaValue||!Object.keys(raw).length&&!!Object.keys(effective).length||!!(c.chipRuns&&c.chipRuns.length),note:c.note||''};
}
function nodeFirebaseReferenceTable_(sheet){return nodeUsesFirestore_()&&(sheet.getName()===NODE.kpiTab||/^マッチ計上/.test(sheet.getName()));}
function managementTable_(book,payload) {
  var sheet=managementSheet_(book,payload.sheetId),start=payload.startRow===undefined?1:payload.startRow,rows=gridRead_(book,sheet,start,50);
  var imported=sheet.getName()==='稼働者管理表'||nodeFirebaseReferenceTable_(sheet);
  var header=sheet.getName()==='目標'?0:/^マッチ計上/.test(sheet.getName())?4:sheet.getName()==='1期目マッチングDB'||imported?1:2,headers=header?(start<=header&&header<start+rows.length?rows[header-start]:gridRead_(book,sheet,header,1)[0]).map(function(c){return c.formattedValue||'';}):[];
  return {sheetId:sheet.getSheetId(),title:sheet.getName(),startRow:start,rowCount:sheet.getMaxRows(),columnCount:Math.min(100,sheet.getMaxColumns()),readonly:imported,
    calculationReference:nodeUsesFirestore_()&&rows.some(function(row){return row.some(function(cell){return !!(cell.userEnteredValue&&cell.userEnteredValue.formulaValue);});}),headers:headers,rows:rows.map(function(cells,i){return {row:start+i,version:gridFingerprint_(cells),cells:cells.map(function(c,j){return publicCell_(c,j+1);})};})};
}
function primitiveInput_(cell,value) {
  if(value===null)value='';
  if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')fail_('VALIDATION','入力値を確認してください。');
  var view=publicCell_(cell,1);if(view.readonly)fail_('FORMULA_PROTECTED','数式・自動表示・リンク付きセルは上書きできません。');
  if(typeof value==='string'&&(value.length>12000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)))fail_('VALIDATION','文字数または入力形式を確認してください。');
  if(typeof value==='number'&&!isFinite(value))fail_('VALIDATION','有効な数値を入力してください。');
  // Always a literal stringValue: formula-looking text cannot become executable formulas.
  var entered;
  if(value==='')entered={};
  else if(view.kind==='date'||cell.dataValidation&&cell.dataValidation.condition.type==='DATE_IS_VALID')entered=cell_(dayDate_(value)).userEnteredValue;
  else if(view.kind==='time') { var t=time_(value,true).split(':');entered={numberValue:(Number(t[0])*60+Number(t[1]))/1440}; }
  else entered=typeof value==='number'?{numberValue:value}:typeof value==='boolean'?{boolValue:value}:{stringValue:value};
  var rule=cell.dataValidation;
  if(value!==''&&rule&&rule.strict&&rule.condition&&rule.condition.type==='ONE_OF_LIST'&&!(rule.condition.values||[]).some(function(v){return v.userEnteredValue===String(value);}))fail_('VALIDATION','シートの選択肢から選んでください。');
  return entered;
}
function rawCellRequest_(sheetId,row,column,value) {
  return {updateCells:{range:{sheetId:sheetId,startRowIndex:row-1,endRowIndex:row,startColumnIndex:column-1,endColumnIndex:column},rows:[{values:[{userEnteredValue:value}]}],fields:'userEnteredValue'}};
}
function makeRowChange_(book,sheet,row,expected,changes,recordId,ownerId,label) {
  var cells=gridRead_(book,sheet,row,1)[0],before=gridFingerprint_(cells);
  if(expected&&before!==expected)fail_('CONFLICT','この行は更新されています。再取得してから編集してください。');
  var edited=JSON.parse(JSON.stringify(cells)),entries=[],requests=[];
  Object.keys(changes).forEach(function(key){var col=columnKey_(key,cells.length);var value=primitiveInput_(cells[col-1],changes[key]);
    if(stableJson_(value)===stableJson_(cells[col-1].userEnteredValue||{}))return;
    entries.push({column:col,before:cells[col-1].userEnteredValue||{},after:value});edited[col-1].userEnteredValue=value;requests.push(rawCellRequest_(sheet.getSheetId(),row,col,value));});
  return {check:{sheetId:sheet.getSheetId(),row:row,before:before,recordId:recordId||null},undo:{sheetId:sheet.getSheetId(),row:row,recordId:recordId||null,ownerId:ownerId||'',label:label||sheet.getName(),after:gridFingerprint_(edited),entries:entries},requests:requests};
}
function combinedChangePlan_(changes,label) {
  var entries=changes.filter(function(c){return c.requests.length;});if(!entries.length)fail_('NO_CHANGE','変更する項目を入力してください。');
  return {requests:entries.reduce(function(a,c){return a.concat(c.requests);},[]),checks:entries.map(function(c){return c.check;}),result:{label:label,undo:entries.map(function(c){return c.undo;})}};
}
function columnKey_(key,maxColumn) {
  // "04", "4.0", "1e0" or " 4" would bypass string-keyed checks yet reach Number(key).
  if(!/^[1-9][0-9]{0,2}$/.test(key)||Number(key)>maxColumn)fail_('VALIDATION','列番号を確認してください。');
  return Number(key);
}
function columnChanges_(changes,maxColumn) {
  if(!changes||typeof changes!=='object'||Array.isArray(changes))fail_('VALIDATION','変更する項目を確認してください。');
  var normalized={};Object.keys(changes).forEach(function(key){normalized[columnKey_(key,maxColumn)]=changes[key];});
  return normalized;
}
function planRecord_(store,user,payload) {
  var record=findRecord_(store,payload.recordId);actorOwns_(user,record);checkVersion_(record,payload.rowVersion);
  var changes=columnChanges_(payload.changes,26);if(!Object.keys(changes).length)fail_('VALIDATION','変更する項目を確認してください。');
  if(Object.hasOwnProperty.call(changes,'3')&&!normalizeName_(changes[3]))fail_('VALIDATION','候補者名は必須です。');
  if(Object.hasOwnProperty.call(changes,'3')&&(typeof changes[3]!=='string'||changes[3]!==normalizeName_(changes[3])||changes[3].length>60))fail_('VALIDATION','候補者名は60文字以内・スペースなしで入力してください。');
  if(Object.hasOwnProperty.call(changes,'4')){
    if(user.role!=='admin')fail_('FORBIDDEN','担当変更は管理者だけが実行できます。');
    if(!store.players.some(function(p){return p.active&&p.role==='player'&&p.sheetNames.indexOf(changes[4])>=0;}))fail_('VALIDATION','登録済みの担当者を選択してください。');
  }
  [1,8,9,10,17,18,21,22,23,24,25,26].forEach(function(c){if(changes[c]!==undefined&&changes[c]!==''){if(!day_(changes[c]))fail_('INVALID_DATE','有効な日付を入力してください。');if([1,8,9,17,21,22,24,26].indexOf(c)>=0&&changes[c]>today_())fail_('INVALID_DATE','実施日には未来の日付を入力できません。');changes[c]=day_(changes[c]);}});
  var revisedDates=NODE.stageColumns.map(function(c,i){return changes[c]===undefined?record.dates[i]:day_(changes[c]);});
  NODE.stageColumns.forEach(function(col,i){if(changes[col]===undefined||!revisedDates[i]||i===6)return;var current=revisedDates[i];if(revisedDates.some(function(date,j){return j!==6&&date&&(j<i&&date>current||j>i&&date<current);}))fail_('INVALID_DATE','工程の日付順を確認してください。関連する日付はまとめて修正できます。');});
  // Sheet Date columns whose existing cell is blank still need numeric serials.
  var rowChange=makeRowChange_(store.book,store.matching,record.row,null,changes,record.recordId,record.playerId,record.name);
  rowChange.requests.forEach(function(req){var col=req.updateCells.range.startColumnIndex+1,v=changes[col];if([1,8,9,10,17,18,21,22,23,24,25,26].indexOf(col)>=0&&v){var typed=cell_(dayDate_(v)),raw=typed.userEnteredValue;req.updateCells.rows[0].values[0]=typed;req.updateCells.fields='userEnteredValue,userEnteredFormat.numberFormat';var entry=rowChange.undo.entries.find(function(e){return e.column===col;});entry.after=raw;entry.dateFormat=typed.userEnteredFormat.numberFormat;}});
  // Recompute the expected restore version using exactly the values being committed.
  var cells=gridRead_(store.book,store.matching,record.row,1)[0];if(gridFingerprint_(cells)!==rowChange.check.before)fail_('CONFLICT','対象行が更新されました。再取得してください。');rowChange.undo.entries.forEach(function(e){cells[e.column-1].userEnteredValue=e.after;if(e.dateFormat){cells[e.column-1].userEnteredFormat=cells[e.column-1].userEnteredFormat||{};cells[e.column-1].userEnteredFormat.numberFormat=e.dateFormat;}});rowChange.undo.after=gridFingerprint_(cells);
  var related=changes[1]!==undefined&&record.dates[0]?store.records.filter(function(r){return r.recordId!==record.recordId&&r.playerId===record.playerId&&r.name===record.name&&r.dates[0]===record.dates[0];}):[];
  var groups=[rowChange].concat(related.map(function(r){actorOwns_(user,r);var c=makeRowChange_(store.book,store.matching,r.row,null,{1:changes[1]},r.recordId,r.playerId,r.name);if(changes[1]){c.requests[0].updateCells.rows[0].values[0]=cell_(dayDate_(changes[1]));c.requests[0].updateCells.fields='userEnteredValue,userEnteredFormat.numberFormat';c.undo.entries[0].after=cell_(dayDate_(changes[1])).userEnteredValue;var raw=gridRead_(store.book,store.matching,r.row,1)[0];raw[0].userEnteredValue=c.undo.entries[0].after;raw[0].userEnteredFormat={numberFormat:cell_(dayDate_(changes[1])).userEnteredFormat.numberFormat};c.undo.after=gridFingerprint_(raw);}return c;}));
  var plan=combinedChangePlan_(groups,record.name+'の情報修正');plan.recordChecks=[record].concat(related).map(function(r){return {recordId:r.recordId,row:r.row,version:r.version};});return plan;
}
function deletedMarker_(entry) {try {return JSON.parse(entry.value);}catch(_){return null;}}
function deletedCandidates_(store,user) {
  var groups={};Object.keys(store.archivedMetadata||{}).forEach(function(row){var marker=deletedMarker_(store.archivedMetadata[row]);
    if(!marker||!marker.changeId||!marker.recordId||!store.recordMetadata[row]||store.recordMetadata[row].value!==marker.recordId||user.role!=='admin'&&marker.playerId!==user.id)return;
    var group=groups[marker.changeId];if(!group)group=groups[marker.changeId]={changeId:marker.changeId,playerId:marker.playerId,candidateName:marker.candidateName,deletedAt:marker.deletedAt,companies:[],recordCount:0};
    group.recordCount++;if(marker.company&&group.companies.indexOf(marker.company)<0)group.companies.push(marker.company);
  });return Object.keys(groups).map(function(id){return groups[id];}).sort(function(a,b){return b.deletedAt.localeCompare(a.deletedAt);});
}
function planDeleteCandidate_(store,user,payload,operationId) {
  var record=findRecord_(store,payload.recordId);actorOwns_(user,record);checkVersion_(record,payload.rowVersion);
  if(['record','candidate'].indexOf(payload.scope)<0)fail_('VALIDATION','削除する範囲を選択してください。');
  var targets=payload.scope==='candidate'?store.records.filter(function(r){return r.playerId===record.playerId&&r.candidateId===record.candidateId;}):[record];
  if(targets.length>50)fail_('DATA_LIMIT','一度に削除できる提案は50件までです。提案ごとに削除してください。');
  if(!Array.isArray(payload.targets)||payload.targets.length!==targets.length||new Set(payload.targets.map(function(t){return t.recordId;})).size!==targets.length)fail_('CONFLICT','対象の提案が変わっています。再取得して削除範囲を確認してください。');
  var probe=probeReservation_(store,user.id,false);if(probe&&targets.some(function(r){return probe.rows.indexOf(r.row)<0;}))fail_('FORBIDDEN','割り当てられた検証行だけ削除できます。');
  var stamp=new Date().toISOString(),groups=targets.map(function(r){actorOwns_(user,r);if(store.archivedMetadata[r.row])fail_('CONFLICT','この候補者は削除済みです。再取得してください。');var expected=payload.targets.find(function(t){return t.recordId===r.recordId;});if(!expected)fail_('CONFLICT','対象の提案が変わっています。');checkVersion_(r,expected.rowVersion);
    var cells=gridRead_(store.book,store.matching,r.row,1)[0],changes={};
    [3,4].concat(NODE.stageColumns).forEach(function(col){if(publicCell_(cells[col-1],col).readonly)fail_('FORMULA_PROTECTED','氏名・担当・成果の日付に数式があるため削除できません。管理者に確認してください。');});
    cells.forEach(function(c,i){if(!publicCell_(c,i+1).readonly&&Object.keys(c.userEnteredValue||{}).length)changes[i+1]='';});
    var change=makeRowChange_(store.book,store.matching,r.row,null,changes,r.recordId,r.playerId,r.name);
    change.requests.push(metadataCreate_(store.matching.getSheetId(),r.row,NODE.deletedKey,JSON.stringify({changeId:operationId,recordId:r.recordId,playerId:r.playerId,candidateName:r.name,company:String(r.values[1]||''),deletedAt:stamp})));
    return change;
  });
  var plan=combinedChangePlan_(groups,record.name+'の'+(payload.scope==='candidate'?'候補者を削除':'提案を削除'));plan.recordChecks=targets.map(function(r){return {recordId:r.recordId,row:r.row,version:r.version};});
  if(payload.scope==='candidate')plan.candidateDeleteCheck={playerId:record.playerId,candidateId:record.candidateId,ids:targets.map(function(r){return r.recordId;}).sort()};
  unpublishTeamForDeletedRecords_(store,user,plan,targets);plan.result.deletedCount=targets.length;return plan;
}

function planCancelAchievement_(store,user,payload) {
  var record=findRecord_(store,payload.recordId);actorOwns_(user,record);checkVersion_(record,payload.rowVersion);
  var si=NODE.stages.indexOf(payload.stage);if(si<0||!record.dates[si])fail_('CONFLICT','取り消す成果が見つかりません。再取得してください。');
  var targets=si===0?store.records.filter(function(r){return r.playerId===record.playerId&&r.name===record.name&&r.dates[0]===record.dates[0];}):[record];
  if(targets.length>50)fail_('DATA_LIMIT','同日の面談に多数の提案行があります。管理者に確認してください。');
  var probe=probeReservation_(store,user.id,false);if(probe&&targets.some(function(r){return probe.rows.indexOf(r.row)<0;}))fail_('FORBIDDEN','割り当てられた検証行だけを更新できます。');
  var changes={};changes[NODE.stageColumns[si]]='';
  var plan=combinedChangePlan_(targets.map(function(r){actorOwns_(user,r);return makeRowChange_(store.book,store.matching,r.row,null,changes,r.recordId,r.playerId,r.name);}),record.name+'の'+NODE.stages[si]+'取消');
  plan.recordChecks=targets.map(function(r){return {recordId:r.recordId,row:r.row,version:r.version};});return plan;
}
function planManagementRow_(store,user,payload) {
  requireAdmin_(user);var sheet=managementSheet_(store.book,payload.sheetId);
  if(nodeFirebaseReferenceTable_(sheet))fail_('FORMULA_PROTECTED','この旧集計表は移行時の参照用です。成果の修正は候補者・提案から行ってください。');
  if(sheet.getName()==='稼働者管理表')fail_('FORMULA_PROTECTED','稼働者管理表は外部シートの集計結果です。元データを更新してください。');
  if(typeof payload.rowVersion!=='string')fail_('CONFLICT','行の最新情報を取得してください。');
  var header=sheet.getName()==='目標'?0:/^マッチ計上/.test(sheet.getName())?4:sheet.getName()==='1期目マッチングDB'?1:2;
  if(payload.row<=header)fail_('PROTECTED_COLUMN','見出しは上書きできません。');
  if(!payload.changes||typeof payload.changes!=='object'||Array.isArray(payload.changes)||Object.keys(payload.changes).length>100)fail_('VALIDATION','変更するセルを確認してください。');
  return combinedChangePlan_([makeRowChange_(store.book,sheet,payload.row,payload.rowVersion,payload.changes,null,'',sheet.getName())],sheet.getName()+' '+payload.row+'行の修正');
}
function planRestoreChange_(store,user,payload) {
  var original=operation_(store,payload.changeId);if(!original||!original.result.undo||original.action==='restoreChange')fail_('VALIDATION','元に戻せる変更ではありません。');
  if(probeReservation_(store,original.actorId,false))fail_('FORBIDDEN','検証用の変更はこの操作で復元できません。');
  if(original.actorId!==user.id&&user.role!=='admin'&&!(original.action==='deleteCandidate'&&original.result.undo.every(function(item){return item.ownerId===user.id;})))fail_('FORBIDDEN','他の人の変更は元に戻せません。');
  var changes=original.result.undo.map(function(item){
    var sheet=item.recordId?store.matching:managementSheet_(store.book,item.sheetId);if(!item.recordId){requireAdmin_(user);if(nodeFirebaseReferenceTable_(sheet))fail_('FORMULA_PROTECTED','旧集計表は参照専用のため、この変更は復元できません。');}
    var record=item.recordId?findRecord_(store,item.recordId):null,archived=null;
    if(item.recordId&&original.action==='deleteCandidate'){
      var ids=metadataMap_(sheet,NODE.recordKey),markers=metadataMap_(sheet,NODE.deletedKey);archived=markers[item.row];var marker=archived&&deletedMarker_(archived);
      if(record||!ids[item.row]||ids[item.row].value!==item.recordId||!marker||marker.changeId!==payload.changeId||marker.recordId!==item.recordId||marker.playerId!==item.ownerId)fail_('CONFLICT','削除した行が変更・移動されています。管理者に確認してください。');
      if(user.role!=='admin'&&marker.playerId!==user.id)fail_('FORBIDDEN','本人の候補者だけ復元できます。');
    }else if(item.recordId){actorOwns_(user,record);if(record.row!==item.row)fail_('CONFLICT','対象の行は並べ替えられています。現在の情報を確認してください。');}
    var cells=gridRead_(store.book,sheet,item.row,1)[0];if(gridFingerprint_(cells)!==item.after)fail_('CONFLICT','その後の編集があるため元に戻せません。現在の情報を確認してください。');
    var requests=item.entries.map(function(e){if(publicCell_(cells[e.column-1],e.column).readonly)fail_('FORMULA_PROTECTED','元に戻すセルが数式になっています。');return rawCellRequest_(sheet.getSheetId(),item.row,e.column,e.before);});
    if(archived)requests.push({deleteDeveloperMetadata:{dataFilter:{developerMetadataLookup:{metadataId:archived.metadataId}}}});
    return {requests:requests,check:{sheetId:sheet.getSheetId(),row:item.row,before:item.after,recordId:item.recordId,archiveChangeId:archived?payload.changeId:null,archiveOwnerId:archived?item.ownerId:null},undo:{}};
  });var plan=combinedChangePlan_(changes,original.result.label+'を復元');delete plan.result.undo;return plan;
}
function revalidateManagementPlan_(store,user,plan) {
  var accountStore={config:store.config,book:store.book,playerSheet:store.playerSheet,players:readPlayers_(store.playerSheet)};
  var freshActor=activeActor_(accountStore,user);if(freshActor.role!==user.role)fail_('CONFLICT','権限が更新されました。再ログインしてください。');
  var latest=plan.candidateDeleteCheck||plan.recordChecks&&plan.recordChecks.length?readStore_({readOnly:true},accountStore):null;
  if(plan.candidateDeleteCheck){var group=plan.candidateDeleteCheck,ids=latest.records.filter(function(r){return r.playerId===group.playerId&&r.candidateId===group.candidateId;}).map(function(r){return r.recordId;}).sort();if(stableJson_(ids)!==stableJson_(group.ids))fail_('CONFLICT','削除対象の提案が増減しています。範囲を確認してください。');}
  (plan.recordChecks||[]).forEach(function(c){var fresh=findRecord_(latest,c.recordId);actorOwns_(user,fresh);if(fresh.row!==c.row||fresh.version!==c.version||c.profileId!==undefined&&(fresh.profileId||'')!==c.profileId||c.playerId!==undefined&&fresh.playerId!==c.playerId)fail_('CONFLICT','対象行が更新されました。再取得してください。');});
  (plan.checks||[]).forEach(function(c){var sheet=c.recordId?store.matching:managementSheet_(store.book,c.sheetId);if(!c.recordId){requireAdmin_(user);if(nodeFirebaseReferenceTable_(sheet))fail_('FORMULA_PROTECTED','旧集計表は参照専用のため、この変更は復元できません。');}
    if(gridFingerprint_(gridRead_(store.book,sheet,c.row,1)[0])!==c.before)fail_('CONFLICT','保存前に行が更新されました。再取得してください。');
    if(c.archiveChangeId){var archived=metadataMap_(sheet,NODE.deletedKey)[c.row],marker=archived&&deletedMarker_(archived);if(!marker||marker.changeId!==c.archiveChangeId||marker.playerId!==c.archiveOwnerId||marker.recordId!==c.recordId)fail_('CONFLICT','削除済みの情報が変更されています。');if(user.role!=='admin'&&marker.playerId!==user.id)fail_('FORBIDDEN','本人の候補者だけ復元できます。');}
    if(c.recordId){var ids=metadataMap_(sheet,NODE.recordKey);if(!ids[c.row]||ids[c.row].value!==c.recordId)fail_('CONFLICT','対象の行が移動しました。再取得してください。');}
  });
}

function planCandidate_(store,user,payload) {
  var owner=store.players.find(function(p){return p.id===payload.playerId&&p.active&&p.role==='player';});
  if(!owner||!owner.sheetNames.length)fail_('VALIDATION','担当者を選んでください。');
  if(user.role!=='admin'&&user.id!==owner.id)fail_('FORBIDDEN','本人の候補者だけ登録できます。');
  var name=shortText_(payload.candidateName,60,true);if(name!==normalizeName_(name))fail_('VALIDATION','候補者名はスペースなしで入力してください。');
  var interviewDate='';
  if(payload.interviewDate!==undefined){if(typeof payload.interviewDate!=='string')fail_('INVALID_DATE','面談実施日を確認してください。');if(payload.interviewDate){interviewDate=day_(payload.interviewDate);if(!interviewDate||interviewDate!==payload.interviewDate||interviewDate>today_())fail_('INVALID_DATE','面談実施日は実施済みの有効な日付を指定してください。');}}
  var plan=newPlan_(store,null,owner.id,user.id);setPatch_(plan,3,name);setPatch_(plan,4,owner.sheetNames[0]);setPatch_(plan,2,shortText_(payload.company,100,false));setPatch_(plan,6,choice_(payload.position,NODE.positions));setPatch_(plan,7,'提案候補');if(interviewDate)setPatch_(plan,1,dayDate_(interviewDate));plan.result={recordId:plan.recordId};
  if(payload.fields!==undefined){if(payload.profileVersion!=='')fail_('CONFLICT','新規候補者の面談情報は新しいバージョンで登録してください。');addCandidateProfileToPlan_(store,user,plan,null,owner.id,{fields:payload.fields,introduction:payload.introduction,profileVersion:payload.profileVersion});}
  return plan;
}

/** Owner-only verification on the already registered disposable copy. Never changes production configuration or sessions. */
function verifyNodeManagementCopy() {return verifyNodeManagementCopy_(['候補者面談','提案','C面談予約'],false);}
function verifyNodeManagementCopyRemaining() {return verifyNodeManagementCopy_(['クライアント面談','内定承諾','稼働開始'],true);}
function verifyNodeManagementCopy_(metrics,checkRecords) {
  requireOwner_();
  return withLock_(function(){
    var production=config_(),copyId=props_().getProperty(NODE.verificationKey);
    if(!copyId||copyId===NODE.originalId||copyId===props_().getProperty(NODE.destinationKey))fail_('COPY_VERIFICATION_REQUIRED','独立した検証コピーが必要です。');
    var book=SpreadsheetApp.openById(copyId),tabs=resolveBusinessTabs_(book),config=Object.assign({},production,{spreadsheetId:copyId,matchingSheetId:tabs.matchingSheetId,kpiSheetId:tabs.kpiSheetId,purpose:'verification',writesEnabled:true}),playerSheet=book.getSheetByName(NODE.playersTab);
    var accounts={config:config,book:book,playerSheet:playerSheet,players:readPlayers_(playerSheet)},matching=tabs.matching,ops=book.getSheetByName(NODE.operationsTab),beforeRows=sheetRowCount_(matching),beforeOps=ops.getLastRow(),suffix=Utilities.getUuid().replace(/-/g,'').slice(0,12),name='修正検証'+suffix,recordIds=[Utilities.getUuid(),Utilities.getUuid()],actor=accounts.players.find(function(p){return p.active&&p.role==='player';}),admin={id:'ADMIN',role:'admin'},user={id:actor.id,role:'player'},date=today_(),initialValues=matching.getRange(1,1,beforeRows,26).getValues(),initialFormulas=matching.getRange(1,1,beforeRows,26).getFormulas(),fingerprint=hash_(stableJson_([initialValues.map(function(r){return r.map(valueKey_);}),initialFormulas]));
    var opIds=[],appended=false,result={checked:[],copyId:copyId},failure,goalChangeId=null;
    function fresh(){return readStore_(null,{config:config,book:book,playerSheet:playerSheet,players:readPlayers_(playerSheet)});}
    function save(action,payload,as){var store=fresh(),acting=as||user,id='management-check-'+suffix+'-'+opIds.length,plan=action==='cancelAchievement'?planCancelAchievement_(store,acting,payload):action==='restoreChange'?planRestoreChange_(store,acting,payload):action==='saveManagementRow'?planManagementRow_(store,acting,payload):planRecord_(store,acting,payload);commit_(store,acting,action,id,hash_(stableJson_(payload)),plan);opIds.push(id);return id;}
    var kpiRows=tabs.kpi.getRange(1,1,tabs.kpi.getLastRow(),2).getValues(),kpiRow=kpiRows.findIndex(function(r){return day_(r[0])===date;})+1,kpiHeaders=tabs.kpi.getRange(1,1,1,Math.min(78,tabs.kpi.getMaxColumns())).getValues()[0],kpiColumn=kpiHeaders.findIndex(function(v){return normalizeName_(v)===normalizeName_(actor.name);})+1;
    if(!kpiRow||!kpiColumn)fail_('COPY_VERIFICATION_FAILED','検証コピーの当日・担当者のKPIを確認してください。');
    function kpi(stage){var offset=['候補者面談','提案','C面談予約','クライアント面談','内定承諾','稼働開始'].indexOf(stage),a1="'"+tabs.kpi.getName().replace(/'/g,"''")+"'!"+columnName_(kpiColumn+offset)+kpiRow;var data=Sheets.Spreadsheets.Values.get(copyId,a1,{valueRenderOption:'UNFORMATTED_VALUE'});return Number(data.values&&data.values[0]&&data.values[0][0]||0);}
    function kpiMatches(stage,expected){for(var attempt=0;attempt<3;attempt++){if(kpi(stage)===expected)return true;Utilities.sleep(700);}return false;}
    function count(stage){return buildSnapshot_(fresh(),admin).counts[date][actor.id][stage];}
    function record(){return fresh().records.find(function(r){return r.recordId===recordIds[0];});}
    try{
      var requests=[{appendDimension:{sheetId:matching.getSheetId(),dimension:'ROWS',length:2}},{setDataValidation:{range:{sheetId:matching.getSheetId(),startRowIndex:beforeRows,endRowIndex:beforeRows+2,startColumnIndex:0,endColumnIndex:26}}}];
      for(var i=0;i<2;i++){
        var values=Array(26).fill('');values[1]='検証専用会社';values[2]=name;values[3]=actor.sheetNames[0];values[5]='その他';values[6]='稼働開始';NODE.stageColumns.forEach(function(c){values[c-1]=dayDate_(date);});
        var rowRequest=rowUpdateRequest_(matching.getSheetId(),beforeRows+i+1,values);rowRequest.updateCells.fields='userEnteredValue,userEnteredFormat.numberFormat';requests.push(rowRequest);requests.push(metadataCreate_(matching.getSheetId(),beforeRows+i+1,NODE.recordKey,recordIds[i]));
      }
      sheetsBatch_(copyId,requests);appended=true;
      metrics.forEach(function(stage){var before=count(stage),beforeKpi=kpi(stage),r=record(),kpiFormula=tabs.kpi.getRange(kpiRow,kpiColumn).getFormula(),kpiDelta=stage==='候補者面談'&&!/COUNTUNIQUE/i.test(kpiFormula)?2:1,id=save('cancelAchievement',{recordId:r.recordId,rowVersion:r.version,stage:stage});if(count(stage)!==before-1||!kpiMatches(stage,beforeKpi-kpiDelta))fail_('COPY_VERIFICATION_FAILED',stage+'の取り消しを確認できません。app='+before+'→'+count(stage)+', KPI='+beforeKpi+'→'+kpi(stage));save('restoreChange',{changeId:id});if(count(stage)!==before||!kpiMatches(stage,beforeKpi))fail_('COPY_VERIFICATION_FAILED',stage+'の復元件数が一致しません。');result.checked.push(stage+'取消・復元（アプリ1件、既存KPI '+kpiDelta+'件）');});
      if(checkRecords){
      var r=record(),id=save('updateRecord',{recordId:r.recordId,rowVersion:r.version,changes:{13:'進捗の修正検証',3:name+'編集'}}),edited=record();if(edited.name!==name+'編集'||edited.values[12]!=='進捗の修正検証')fail_('COPY_VERIFICATION_FAILED','候補者情報の修正を確認できませんでした。');save('restoreChange',{changeId:id});result.checked.push('候補者名・メモ修正・復元');
      r=record();var refused=false;try{planRecord_(fresh(),{id:'unrelated',role:'player'},{recordId:r.recordId,rowVersion:r.version,changes:{13:'不可'}});}catch(e){refused=e.nodeCode==='FORBIDDEN';}if(!refused)fail_('COPY_VERIFICATION_FAILED','権限保護に失敗しました。');result.checked.push('本人以外の更新拒否');
      var goal=book.getSheetByName('目標'),goalRow=goal.getMaxRows(),goalCells=gridRead_(book,goal,goalRow,1)[0],goalVersion=gridFingerprint_(goalCells),goalColumn=goalCells.findIndex(function(c){return !publicCell_(c,1).readonly&&!(c.userEnteredValue&&Object.keys(c.userEnteredValue).length);})+1,goalChanges={};if(!goalColumn)fail_('COPY_VERIFICATION_FAILED','管理表の検証用空欄を確認できませんでした。');goalChanges[goalColumn]='管理表修正検証'+suffix;goalChangeId=save('saveManagementRow',{sheetId:goal.getSheetId(),row:goalRow,rowVersion:goalVersion,changes:goalChanges},admin);if(publicCell_(gridRead_(book,goal,goalRow,1)[0][goalColumn-1],goalColumn).value!==goalChanges[goalColumn])fail_('COPY_VERIFICATION_FAILED','管理表の保存を確認できませんでした。');save('restoreChange',{changeId:goalChangeId},admin);goalChangeId=null;if(gridFingerprint_(gridRead_(book,goal,goalRow,1)[0])!==goalVersion)fail_('COPY_VERIFICATION_FAILED','管理表の復元を確認できませんでした。');result.checked.push('業務管理表の保存・復元');
      }
    }catch(e){failure=e;}
    finally{
      if(goalChangeId)save('restoreChange',{changeId:goalChangeId},admin);
      if(appended){
        var ids=metadataMap_(matching,NODE.recordKey);if(sheetRowCount_(matching)!==beforeRows+2||recordIds.some(function(id,i){return !ids[beforeRows+i+1]||ids[beforeRows+i+1].value!==id;}))fail_('CONFLICT','検証行が移動しました。コピーを確認してください。');
        var cleanup=[{deleteDimension:{range:{sheetId:matching.getSheetId(),dimension:'ROWS',startIndex:beforeRows,endIndex:beforeRows+2}}}];
        var rows=ops.getRange(1,1,Math.max(1,ops.getLastRow()),6).getValues();for(var n=rows.length-1;n>=beforeOps;n--)if(opIds.indexOf(rows[n][0])>=0)cleanup.push({updateCells:{range:{sheetId:ops.getSheetId(),startRowIndex:n,endRowIndex:n+1,startColumnIndex:0,endColumnIndex:6},rows:[{values:Array.from({length:6},function(){return {};})}],fields:'userEnteredValue'}});
        sheetsBatch_(copyId,cleanup);
      }
    }
    if(failure)throw failure;
    var finalValues=matching.getRange(1,1,beforeRows,26).getValues(),finalFormulas=matching.getRange(1,1,beforeRows,26).getFormulas();
    if(hash_(stableJson_([finalValues.map(function(r){return r.map(valueKey_);}),finalFormulas]))!==fingerprint||sheetRowCount_(matching)!==beforeRows||stableJson_(config_())!==stableJson_(production))fail_('COPY_VERIFICATION_FAILED','後始末または接続設定の照合に失敗しました。');
    result.checked.push('既存値・数式・行数・本番接続設定の保持');Logger.log(JSON.stringify(result));return result;
  });
}

/* C-interview learning: detailed notes stay in the managed workbook. */
var REVIEW_TAB='_NODE_interview_reviews';
function verifyNodeGeminiConnection() {
  requireOwner_();
  var p=props_(),key=p.getProperty('NODE_GEMINI_API_KEY');
  if(!key||p.getProperty('NODE_GEMINI_FREE_TIER_CONFIRMED')!=='true')fail_('AI_NOT_CONFIGURED','Geminiの設定を確認してください。');
  var r=UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',{method:'post',contentType:'application/json',headers:{'x-goog-api-key':key},muteHttpExceptions:true,payload:JSON.stringify({contents:[{parts:[{text:'接続テストです。OKとだけ返してください。'}]}],generationConfig:{maxOutputTokens:16}})});
  if(r.getResponseCode()!==200)fail_('AI_UNAVAILABLE','Gemini接続テスト HTTP '+r.getResponseCode());
  var body=JSON.parse(r.getContentText());
  if(!body.candidates||!body.candidates[0].content)fail_('AI_UNAVAILABLE','Geminiの応答を確認できません。');
  Logger.log('Gemini接続確認成功：gemini-3.5-flash-lite（業務データ送信なし）');
}
var REVIEW_HEADERS=['record_id','player_id','interview_date','category','memo','next_action','version','updated_at'];
var REVIEW_CATEGORIES=['条件のずれ','事前確認不足','面談準備不足','仕事内容の認識違い','連絡・日程調整','募集枠・タイミング','他案件との比較','理由未確認','その他'];
function reviewRows_(book) {
  var sheet=book.getSheetByName(REVIEW_TAB);if(!sheet)return [];
  if(sheet.getLastRow()>5001)fail_('REVIEW_LIMIT','振り返りが5000件を超えています。管理者に確認してください。');
  return table_(sheet,REVIEW_HEADERS).slice(1);
}
function readInterviewReviews_(store,user) {
  return reviewRows_(store.book).filter(function(r){var record=findRecord_(store,String(r[0]));return record&&(user.role==='admin'||record.playerId===user.id)&&record.playerId===String(r[1]);}).map(function(r){return {recordId:String(r[0]),playerId:String(r[1]),interviewDate:day_(findRecord_(store,String(r[0])).values[16])||String(r[2]),category:String(r[3]),memo:String(r[4]),nextAction:String(r[5]),version:String(r[6]),updatedAt:String(r[7])};});
}
function planInterviewReview_(store,user,payload) {
  var record=findRecord_(store,payload.recordId);actorOwns_(user,record);checkVersion_(record,payload.rowVersion);
  var interview=day_(record.values[16]);if(!interview)fail_('VALIDATION','C面談実施を先に登録してください。');
  if(day_(record.values[21])||day_(record.values[23]))fail_('VALIDATION','マッチ済みの提案には未マッチ理由を登録できません。');
  var rows=reviewRows_(store.book),index=rows.findIndex(function(r){return r[0]===record.recordId;});
  if(index>=0&&rows[index][6]!==payload.reviewVersion||index<0&&payload.reviewVersion)fail_('CONFLICT','振り返りが更新されています。再取得してください。');
  var values=[record.recordId,record.playerId,interview,choice_(payload.category,REVIEW_CATEGORIES),shortText_(payload.memo,2000,false),shortText_(payload.nextAction,1000,false),Utilities.getUuid(),new Date().toISOString()];
  if(rows.filter(function(r){return r[0]===record.recordId;}).length>1)fail_('CONFLICT','振り返りが重複しています。管理者に確認してください。');
  var sheet=store.book.getSheetByName(REVIEW_TAB),requests=[],id;
  if(!sheet){id=Math.floor(Math.random()*1000000000);requests.push({addSheet:{properties:{sheetId:id,title:REVIEW_TAB,gridProperties:{rowCount:5001,columnCount:8}}}});requests.push(rowUpdateRequest_(id,1,REVIEW_HEADERS));}
  else {id=sheet.getSheetId();if(sheet.getLastRow()>=5001&&index<0)fail_('REVIEW_LIMIT','振り返りの保存上限に達しました。');}
  var row=index<0?rows.length+2:index+2;
  if(sheet&&row>sheet.getMaxRows())requests.push({appendDimension:{sheetId:id,dimension:'ROWS',length:row-sheet.getMaxRows()}});
  if(sheet&&row<=sheet.getMaxRows()&&sheet.getRange(row,1,1,8).getFormulas()[0].some(Boolean))fail_('FORMULA_PROTECTED','振り返りの保存先に数式があります。');
  requests.push(rowUpdateRequest_(id,row,values));return {requests:requests,result:{recordId:record.recordId}};
}
function reviewAggregate_(store,user,period) {
  if(period!=='all'&&!/^\d{4}-\d{2}(?:-\d{2})?$/.test(period))fail_('VALIDATION','集計期間を確認してください。');
  var rows=readInterviewReviews_(store,user).filter(function(r){var record=findRecord_(store,r.recordId);return day_(record.values[16])&&!day_(record.values[21])&&!day_(record.values[23])&&(period==='all'||r.interviewDate.indexOf(period)===0);});
  return REVIEW_CATEGORIES.map(function(category){return {category:category,count:rows.filter(function(r){return r.category===category;}).length};}).filter(function(r){return r.count>0;});
}
var REVIEW_AI_INDEX='NODE_AI_ADVICE_INDEX';
var REVIEW_AI_PENDING='NODE_AI_PENDING';
var REVIEW_AI_LIMIT=24;
function aiJsonProperty_(key,fallback) {
  try{return JSON.parse(props_().getProperty(key)||JSON.stringify(fallback));}catch(e){return fallback;}
}
function aiQuota_() {
  var q=aiJsonProperty_('NODE_AI_QUOTA',{});
  if(q.day!==today_()||!q.users||typeof q.users!=='object')return {day:today_(),total:0,users:{}};
  return q;
}
function aiUsage_(id) {
  var q=aiQuota_();
  return {userRemaining:Math.max(0,3-(Number(q.users[id])||0)),teamRemaining:Math.max(0,10-(Number(q.total)||0)),resetAt:new Date(new Date(q.day+'T00:00:00+09:00').getTime()+86400000).toISOString()};
}
function aiScope_(store,user,period) {
  return hash_(store.config.spreadsheetId+'|'+user.id+'|'+user.role+'|'+period);
}
function aiAdvice_(scope) {
  var value=props_().getProperty('NODE_AI_ADVICE_'+scope);
  if(!value)return null;
  try{
    var result=JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(value),'application/gzip')).getDataAsString('UTF-8'));
    if(!result||typeof result.summary!=='string'||!Array.isArray(result.actions)||!Array.isArray(result.aggregate)||typeof result.inputSignature!=='string')return null;
    return result;
  }catch(e){return null;}
}
// Each report is compressed below the per-property quota. Only 24 scopes are retained.
// Reports contain fixed category counts and generated prose, never candidate notes or names.
function saveAiAdvice_(scope,result) {
  var value=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(result),'application/json')).getBytes());
  if(value.length>8000)fail_('AI_UNAVAILABLE','AIの結果が長すぎました。理由の記録は保存されています。');
  var properties=props_(),index=aiJsonProperty_(REVIEW_AI_INDEX,[]);
  if(!Array.isArray(index))index=[];
  index=index.filter(function(row){return row&&row.scope!==scope&&typeof row.scope==='string';});
  index.push({scope:scope,generatedAt:result.generatedAt});
  while(index.length>REVIEW_AI_LIMIT){var removed=index.shift();properties.deleteProperty('NODE_AI_ADVICE_'+removed.scope);}
  properties.setProperty('NODE_AI_ADVICE_'+scope,value);
  properties.setProperty(REVIEW_AI_INDEX,JSON.stringify(index));
}
function aiPending_() {
  var pending=aiJsonProperty_(REVIEW_AI_PENDING,{}),now=Date.now();
  Object.keys(pending).forEach(function(scope){if(!pending[scope]||pending[scope].expiresAt<=now)delete pending[scope];});
  return pending;
}
function aiResult_(result,user,source) {
  return Object.assign({},result,{source:source,usage:aiUsage_(user.id)});
}
function readInterviewAdvice_(request) {
  var session=authenticate_(request.token),store=readStore_({readOnly:true}),user=activeActor_(store,session),period=String((request.payload||{}).period||'');
  var aggregate=reviewAggregate_(store,user,period),scope=aiScope_(store,user,period),advice=aiAdvice_(scope),pending=aiPending_()[scope],properties=props_();
  snapshotActor_(store,request.token);
  return {advice:advice?aiResult_(advice,user,'saved'):null,stale:!!advice&&advice.inputSignature!==hash_(stableJson_(aggregate)),aggregate:aggregate,count:aggregate.reduce(function(n,r){return n+r.count;},0),usage:aiUsage_(user.id),configured:!!properties.getProperty('NODE_GEMINI_API_KEY')&&properties.getProperty('NODE_GEMINI_FREE_TIER_CONFIRMED')==='true',pending:!!pending,pendingUntil:pending?new Date(pending.expiresAt).toISOString():null};
}
function analyzeInterviewReviews_(request) {
  var session=authenticate_(request.token),store=readStore_({readOnly:true}),user=activeActor_(store,session),period=String((request.payload||{}).period||'');
  var aggregate=reviewAggregate_(store,user,period),count=aggregate.reduce(function(n,r){return n+r.count;},0),signature=hash_(stableJson_(aggregate)),scope=aiScope_(store,user,period);
  if(!count)fail_('VALIDATION','この期間の未マッチ理由を先に登録してください。');
  var properties=props_(),reservationId=Utilities.getUuid();
  var previous=withLock_(function(){
    snapshotActor_(store,request.token);
    var saved=aiAdvice_(scope);
    if(saved&&saved.inputSignature===signature)return saved;
    var key=properties.getProperty('NODE_GEMINI_API_KEY');
    if(!key||properties.getProperty('NODE_GEMINI_FREE_TIER_CONFIRMED')!=='true')fail_('AI_NOT_CONFIGURED','管理者が課金未設定の専用Geminiプロジェクトを接続してください。');
    var pending=aiPending_();
    if(pending[scope])fail_('AI_IN_PROGRESS','この期間の改善案を作成中です。結果を確認してお待ちください。利用回数は追加していません。');
    if(Object.keys(pending).length>=REVIEW_AI_LIMIT)fail_('BUSY','AIが混み合っています。少し待ってから結果を確認してください。');
    var q=aiQuota_();
    if(q.total>=10||(q.users[user.id]||0)>=3)fail_('AI_LIMIT','本日のAI利用上限です。保存済みの改善案と理由の記録は引き続き使えます。翌日0時に回数が戻ります。');
    q.total++;q.users[user.id]=(q.users[user.id]||0)+1;
    // One lock reserves quota and the in-flight scope together, then releases before fetching.
    var updates={};updates.NODE_AI_QUOTA=JSON.stringify(q);pending[scope]={id:reservationId,signature:signature,expiresAt:Date.now()+360000};updates[REVIEW_AI_PENDING]=JSON.stringify(pending);properties.setProperties(updates,false);
    return null;
  });
  if(previous){snapshotActor_(store,request.token);return aiResult_(previous,user,'saved');}
  try{
    var body=generateAiAdvice_(aggregate,properties.getProperty('NODE_GEMINI_API_KEY'));
    snapshotActor_(store,request.token);
    var result={summary:body.summary.trim(),actions:body.actions.map(function(a){return a.trim();}),count:count,period:period,aggregate:aggregate,inputSignature:signature,generatedAt:new Date().toISOString()};
    withLock_(function(){snapshotActor_(store,request.token);saveAiAdvice_(scope,result);});
    snapshotActor_(store,request.token);
    return aiResult_(result,user,'generated');
  }finally{
    withLock_(function(){var pending=aiPending_();if(pending[scope]&&pending[scope].id===reservationId){delete pending[scope];properties.setProperty(REVIEW_AI_PENDING,JSON.stringify(pending));}});
  }
}

function generateAiAdvice_(aggregate,key) {
  // Only fixed categories and counts are sent. No user text, names, IDs or dates.
  var response;
  try{response=UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',{method:'post',contentType:'application/json',headers:{'x-goog-api-key':key},muteHttpExceptions:true,payload:JSON.stringify({systemInstruction:{parts:[{text:'人材紹介業務の改善支援。未マッチ理由の分類と件数だけを材料に、日本語で短い傾向の要約と、次回のC面談前に実行する具体的な確認・準備を3つ提案。要約は1800文字以内、各改善案は600文字以内。一般論だけにせず、担当者が誰に何を確認し何を記録すればよいかを示す。件数の少ない分類や理由未確認から原因を断定しない。条件・募集枠など担当者の努力だけで変えられない事情も区別。個人の採用適否や順位を判断しない。理由未確認はクライアントへの事実確認を提案。要約に件数だけでは原因を断定できないと明示。JSONのみ: summary(文字列), actions(文字列の配列)。'}]},contents:[{role:'user',parts:[{text:JSON.stringify(aggregate)}]}],generationConfig:{temperature:0.2,maxOutputTokens:1800,responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{summary:{type:'STRING'},actions:{type:'ARRAY',items:{type:'STRING'}}},required:['summary','actions']}}})});}catch(e){fail_('AI_UNAVAILABLE','AIとの通信を確認できませんでした。理由の記録は保存されています。結果を確認してから再試行してください。');}
  if(response.getResponseCode()===429)fail_('AI_LIMIT','Googleの無料枠の上限です。時間をおいて再試行してください。保存済みの改善案と理由の記録は引き続き使えます。');
  if(response.getResponseCode()!==200)fail_('AI_UNAVAILABLE','AIから結果を取得できませんでした。理由の記録は保存されています。');
  var body;try{var json=JSON.parse(response.getContentText());body=JSON.parse(json.candidates[0].content.parts.map(function(p){return p.text||'';}).join(''));}catch(e){fail_('AI_UNAVAILABLE','AIの応答形式を確認できませんでした。');}
  if(typeof body.summary!=='string'||!body.summary.trim()||body.summary.length>4000||!Array.isArray(body.actions)||!body.actions.length||body.actions.length>5||body.actions.some(function(a){return typeof a!=='string'||!a.trim()||a.length>1500;}))fail_('AI_UNAVAILABLE','AIの応答形式を確認できませんでした。');
  return {summary:body.summary.trim(),actions:body.actions.map(function(a){return a.trim();})};
}

// Owner-run smoke test: one synthetic free-tier request; no business-sheet access,
// quota mutation or report-index eviction. Its temporary property is always restored.
function verifyNodeAiUsability() {
  requireOwner_();
  var properties=props_(),key=properties.getProperty('NODE_GEMINI_API_KEY');
  if(!key||properties.getProperty('NODE_GEMINI_FREE_TIER_CONFIRMED')!=='true')fail_('AI_NOT_CONFIGURED','Geminiの無料枠設定を確認してください。');
  var aggregate=[{category:'事前確認不足',count:2},{category:'理由未確認',count:1}],body=generateAiAdvice_(aggregate,key);
  var result={summary:body.summary,actions:body.actions,count:3,period:'all',aggregate:aggregate,inputSignature:hash_(stableJson_(aggregate)),generatedAt:new Date().toISOString()};
  var value=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(result),'application/json')).getBytes());
  if(value.length>8000)fail_('AI_VERIFICATION_FAILED','AIの保存サイズを確認できませんでした。');
  withLock_(function(){
    var probeKey='NODE_AI_UX_PROBE',previous=properties.getProperty(probeKey);
    try{
      properties.setProperty(probeKey,value);
      var restored=JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(properties.getProperty(probeKey)),'application/gzip')).getDataAsString('UTF-8'));
      if(stableJson_(restored)!==stableJson_(result))fail_('AI_VERIFICATION_FAILED','AIの保存・復元を確認できませんでした。');
    }finally{if(previous===null)properties.deleteProperty(probeKey);else properties.setProperty(probeKey,previous);}
  });
  var proof={success:true,model:'gemini-3.5-flash-lite',actions:body.actions.length,storageBytes:value.length,checked:['synthetic structured response','compressed property round trip','temporary property restored','no business sheet access','no app quota or advice index changes']};
  Logger.log(JSON.stringify(proof));return proof;
}

/** Owner-run read-only comparison. No business writes or configuration changes. */
function verifyNodeSyncPerformance() {
  requireOwner_();
  var started=Date.now(), full=readStore_(), fullSnapshot=buildSnapshot_(full,{id:'ADMIN',role:'admin'}), fullMs=Date.now()-started;
  started=Date.now();
  var trimmed=readStore_({readOnly:true}), trimmedSnapshot=buildSnapshot_(trimmed,{id:'ADMIN',role:'admin'}), trimmedMs=Date.now()-started;
  delete fullSnapshot.syncedAt; delete trimmedSnapshot.syncedAt;
  if(stableJson_(fullSnapshot)!==stableJson_(trimmedSnapshot))fail_('SYNC_VERIFICATION_FAILED','読み取り中にデータが変わったか、取得結果が一致しません。再確認してください。');
  var result={success:true,fullRows:full.values.length,activeRows:trimmed.values.length,fullReadMs:fullMs,trimmedReadMs:trimmedMs,checked:['same records and KPI counts','same row versions and formulas','read only; no business writes']};
  Logger.log(JSON.stringify(result)); return result;
}

/* BEGIN GENERATED WORKSPACE RULES */
// Generated from lib/workspace-insights.ts; browser and server use identical rules.
var NODE_INSIGHT_RULES = (function () { var exports = {};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceEvidenceKeys = exports.insightReviewCategories = exports.insightMetrics = void 0;
exports.validInsightDate = validInsightDate;
exports.validInsightPeriod = validInsightPeriod;
exports.insightToday = insightToday;
exports.previousInsightPeriod = previousInsightPeriod;
exports.scopedInsightRecords = scopedInsightRecords;
exports.buildFollowUpTasks = buildFollowUpTasks;
exports.buildWorkspaceInsightAggregate = buildWorkspaceInsightAggregate;
exports.workspaceInsightFingerprint = workspaceInsightFingerprint;
exports.insightPeriodLabel = insightPeriodLabel;
exports.workspaceEvidenceLabel = workspaceEvidenceLabel;
exports.workspaceInsightCopyText = workspaceInsightCopyText;
exports.insightMetrics = [
    { key: "interviews", stage: "候補者面談", label: "面談実施" },
    { key: "proposals", stage: "提案", label: "提案数" },
    { key: "booked", stage: "C面談予約", label: "C面談予約" },
    { key: "clientInterviews", stage: "クライアント面談", label: "C面談実施" },
    { key: "matches", stage: "内定承諾", label: "マッチ数" },
    { key: "starts", stage: "稼働開始", label: "稼働開始" },
];
exports.insightReviewCategories = ["条件のずれ", "事前確認不足", "面談準備不足", "仕事内容の認識違い", "連絡・日程調整", "募集枠・タイミング", "他案件との比較", "理由未確認", "その他"];
exports.workspaceEvidenceKeys = [...exports.insightMetrics.map(metric => metric.key), "interviewsToday", "interviewsOverdue", "resultsWaiting", "startsOverdue", "missingReviews", "proposalTarget", "reviewReasons"];
const valueAt = (record, column) => String(record.values[column - 1] ?? "").trim();
function validInsightDate(value) {
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))
        return false;
    const year = Number(value.slice(0, 4));
    if (year < 1900 || year > 2100)
        return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validInsightPeriod(period) {
    return period === "all" || /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && Number(period.slice(0, 4)) >= 1900 && Number(period.slice(0, 4)) <= 2100 || validInsightDate(period);
}
function insightToday(now = new Date()) {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function previousInsightPeriod(period) {
    if (period === "all")
        return null;
    if (!validInsightPeriod(period))
        throw new Error("集計期間を確認してください。");
    const date = new Date(`${period.length === 7 ? `${period}-01` : period}T00:00:00.000Z`);
    if (period.length === 7)
        date.setUTCMonth(date.getUTCMonth() - 1);
    else
        date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, period.length);
}
const daysBetween = (earlier, later) => Math.floor((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86400000);
const endedStatus = (record) => /^(落選|辞退|案件枠埋まり|合格後離脱|稼働後離脱|C面談ブッチ)/.test(valueAt(record, 7)) || validInsightDate(valueAt(record, 26));
const finishedRecord = (record) => endedStatus(record) || validInsightDate(valueAt(record, 24));
/** Restrict records again even when a malformed client snapshot contains other owners. */
function scopedInsightRecords(snapshot) {
    const owners = new Set(snapshot.players.filter(player => player.id !== "ADMIN" && (snapshot.self.role === "admin" || player.id === snapshot.self.playerId)).map(player => player.id));
    return (snapshot.records || []).filter(record => owners.has(record.playerId));
}
/** Dates indicate missing recorded milestones, not an inferred failure or a contact history. */
function buildFollowUpTasks(snapshot, today = insightToday()) {
    if (!validInsightDate(today))
        throw new Error("本日の日付を確認してください。");
    const reviewed = new Set((snapshot.interviewReviews || []).filter(review => snapshot.self.role === "admin" || review.playerId === snapshot.self.playerId).map(review => review.recordId));
    const tasks = [];
    const seen = new Set();
    for (const record of scopedInsightRecords(snapshot)) {
        if (seen.has(record.recordId))
            continue;
        seen.add(record.recordId);
        const proposed = valueAt(record, 8), interviewed = valueAt(record, 17), scheduled = valueAt(record, 10), plannedStart = valueAt(record, 23), offered = valueAt(record, 21), matched = valueAt(record, 22);
        const base = { recordId: record.recordId, candidateName: record.candidateName, companyName: valueAt(record, 2), playerId: record.playerId };
        const add = (task) => tasks.push({ ...base, ...task, id: `${record.recordId}:${task.kind}` });
        if (!finishedRecord(record)) {
            if (validInsightDate(plannedStart) && plannedStart <= today) {
                add({ kind: plannedStart === today ? "start_today" : "start_overdue", urgency: plannedStart === today ? "today" : "overdue", title: plannedStart === today ? "今日の稼働開始を確認" : "稼働開始の状況を確認", evidence: `稼働予定 ${plannedStart} · 開始日は未記録`, suggestedAction: "実際の開始日、または予定の変更を確認して記録する。", date: plannedStart });
            }
            else if (valueAt(record, 7) === "稼働開始") {
                add({ kind: "start_date_missing", urgency: "followup", title: "稼働開始日を確認", evidence: `進捗は稼働開始${validInsightDate(plannedStart) ? ` · 稼働予定 ${plannedStart}` : ""} · 開始日は未記録`, suggestedAction: "開始済みか、進捗または予定日の入力違いかを確認する。実際に開始した場合だけ実施日を記録する。", date: validInsightDate(plannedStart) ? plannedStart : today });
            }
            else if (validInsightDate(scheduled) && !validInsightDate(interviewed) && scheduled <= today) {
                add({ kind: scheduled === today ? "interview_today" : "interview_overdue", urgency: scheduled === today ? "today" : "overdue", title: scheduled === today ? "今日のC面談を確認" : "C面談の実施状況を確認", evidence: `C面談予定 ${scheduled}${valueAt(record, 11) ? ` ${valueAt(record, 11)}` : ""} · 実施日は未記録`, suggestedAction: scheduled === today ? "参加意思と日時を確認し、面談後に実施日を記録する。" : "実施、延期、辞退のいずれかを確認し、日付と進捗を更新する。", date: scheduled });
            }
            else if (validInsightDate(proposed) && proposed <= today && !scheduled && !interviewed && !offered && !matched && !plannedStart && !/^(提案なし|面談実施|合格|マッチ|稼働予定)/.test(valueAt(record, 7))) {
                add({ kind: "schedule_missing", urgency: "followup", title: "C面談の予定日時を確認", evidence: `提案完了 ${proposed} · C面談の予定日は未登録`, suggestedAction: "クライアントと候補者に面談日時を確認し、決まった予定を登録する。", date: proposed });
            }
            else if (validInsightDate(interviewed) && interviewed <= today && !validInsightDate(offered) && !validInsightDate(matched)) {
                const deadline = valueAt(record, 18);
                const deadlineDue = validInsightDate(deadline) && deadline <= today;
                if (deadlineDue || daysBetween(interviewed, today) >= 3)
                    add({ kind: "result_waiting", urgency: deadlineDue ? deadline < today ? "overdue" : "today" : "followup", title: "面談結果の状況を確認", evidence: `C面談実施 ${interviewed}${validInsightDate(deadline) ? ` · 回答期日 ${deadline}` : ""} · 合格・承諾日は未記録`, suggestedAction: "結果と回答予定をクライアントに確認する。合否待ちは不成立と判断しない。", date: deadlineDue ? deadline : interviewed });
            }
        }
        if (endedStatus(record) && validInsightDate(interviewed) && interviewed <= today && !validInsightDate(matched) && !validInsightDate(valueAt(record, 24)) && !reviewed.has(record.recordId)) {
            add({ kind: "missing_review", urgency: "followup", title: "確認できた理由を振り返りに残す", evidence: `C面談実施 ${interviewed} · ${valueAt(record, 7) || "離脱日を記録済み"} · 振り返り未記録`, suggestedAction: "不成立の理由を事実と推測に分け、次回の対応を記録する。", date: interviewed });
        }
    }
    const order = { overdue: 0, today: 1, followup: 2 };
    return tasks.sort((left, right) => order[left.urgency] - order[right.urgency] || left.date.localeCompare(right.date) || left.recordId.localeCompare(right.recordId));
}
const nonnegativeCount = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
/** Safe preview of the server aggregate; raw records never become an AI request body. */
function buildWorkspaceInsightAggregate(snapshot, period, today = insightToday()) {
    if (!validInsightPeriod(period) || !validInsightDate(today))
        throw new Error("集計期間と本日の日付を確認してください。");
    const members = snapshot.players.filter(player => player.id !== "ADMIN" && (snapshot.self.role === "admin" || player.id === snapshot.self.playerId));
    const owners = new Set(members.map(player => player.id));
    const previous = previousInsightPeriod(period);
    const count = (target, stage) => [...owners].reduce((total, owner) => total + nonnegativeCount(snapshot.counts[target]?.[owner]?.[stage]), 0);
    const records = scopedInsightRecords(snapshot);
    const tasks = buildFollowUpTasks(snapshot, today);
    const eligibleIds = new Set(records.filter(record => {
        const date = valueAt(record, 17);
        return validInsightDate(date) && !validInsightDate(valueAt(record, 22)) && !validInsightDate(valueAt(record, 24)) && (period === "all" || date.startsWith(period));
    }).map(record => record.recordId));
    const reasonCounts = new Map();
    const reviewedIds = new Set();
    for (const review of snapshot.interviewReviews || []) {
        if (!owners.has(review.playerId) || !eligibleIds.has(review.recordId) || reviewedIds.has(review.recordId) || !exports.insightReviewCategories.includes(review.category))
            continue;
        reviewedIds.add(review.recordId);
        reasonCounts.set(review.category, (reasonCounts.get(review.category) || 0) + 1);
    }
    return {
        role: snapshot.self.role,
        period,
        asOf: today,
        metrics: exports.insightMetrics.map(metric => ({ key: metric.key, count: count(period, metric.stage), previousCount: previous ? count(previous, metric.stage) : null })),
        proposalTarget: period.length !== 7 ? null : snapshot.monthlyGoalsFeature
            ? members.every(member => (snapshot.monthlyGoals || []).some(goal => goal.playerId === member.id && goal.month === period))
                ? members.reduce((total, member) => total + (snapshot.monthlyGoals || []).find(goal => goal.playerId === member.id && goal.month === period).target, 0) : null
            : members.reduce((total, member) => total + (Number.isSafeInteger(member.target) && member.target > 0 && member.target <= 9999 ? member.target : 0), 0),
        memberCount: members.length,
        pipeline: {
            interviewsToday: tasks.filter(task => task.kind === "interview_today").length,
            interviewsOverdue: tasks.filter(task => task.kind === "interview_overdue").length,
            resultsWaiting: tasks.filter(task => task.kind === "result_waiting").length,
            startsOverdue: tasks.filter(task => task.kind === "start_overdue").length,
            missingReviews: tasks.filter(task => task.kind === "missing_review").length,
        },
        reviewReasons: exports.insightReviewCategories.filter(category => reasonCounts.has(category)).map(category => ({ category, count: reasonCounts.get(category) })),
    };
}
function workspaceInsightFingerprint(aggregate) {
    return JSON.stringify({
        role: aggregate.role, period: aggregate.period, asOf: aggregate.asOf,
        metrics: exports.insightMetrics.map(metric => {
            const found = aggregate.metrics.find(item => item.key === metric.key);
            return { key: metric.key, count: found?.count ?? 0, previousCount: found?.previousCount ?? null };
        }),
        proposalTarget: aggregate.proposalTarget, memberCount: aggregate.memberCount,
        pipeline: { interviewsToday: aggregate.pipeline.interviewsToday, interviewsOverdue: aggregate.pipeline.interviewsOverdue, resultsWaiting: aggregate.pipeline.resultsWaiting, startsOverdue: aggregate.pipeline.startsOverdue, missingReviews: aggregate.pipeline.missingReviews },
        reviewReasons: exports.insightReviewCategories.map(category => ({ category, count: aggregate.reviewReasons.filter(reason => reason.category === category).reduce((sum, reason) => sum + reason.count, 0) })).filter(reason => reason.count > 0),
    });
}
function insightPeriodLabel(period) {
    if (period === "all")
        return "累計";
    if (!validInsightPeriod(period))
        return "期間未確認";
    return period.length === 7 ? `${period.slice(0, 4)}年${Number(period.slice(5))}月` : period.replaceAll("-", "/");
}
function workspaceEvidenceLabel(key, aggregate) {
    const metric = exports.insightMetrics.find(item => item.key === key);
    if (metric)
        return `${metric.label} ${aggregate.metrics.find(item => item.key === key)?.count ?? 0}件`;
    const labels = { interviewsToday: "今日のC面談", interviewsOverdue: "予定日を過ぎたC面談・実施日未記録", resultsWaiting: "結果の確認対象", startsOverdue: "稼働予定日を過ぎた・開始日未記録", missingReviews: "不成立の振り返り未記録" };
    if (key === "proposalTarget")
        return aggregate.proposalTarget === null ? "月別目標は未確定または集計対象外" : `月間提案目標 ${aggregate.proposalTarget}件`;
    if (key === "reviewReasons")
        return aggregate.reviewReasons.length ? aggregate.reviewReasons.map(reason => `${reason.category} ${reason.count}件`).join(" / ") : "理由の記録なし";
    return `${labels[key]} ${aggregate.pipeline[key]}件`;
}
function workspaceInsightCopyText(advice) {
    const date = new Date(advice.generatedAt);
    const generated = Number.isFinite(date.getTime()) ? date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "日時未確認";
    return [
        `INSUP NODE ${advice.aggregate.role === "admin" ? "成果ミーティングの準備" : "活動と面談の準備"}`,
        `対象期間：${insightPeriodLabel(advice.period)}`, `生成日時：${generated}（日本時間）`,
        "", "記録済みの成果", ...advice.aggregate.metrics.map(metric => workspaceEvidenceLabel(metric.key, advice.aggregate)),
        "", "AIによる整理", advice.summary,
        "", "次の行動の提案", ...advice.priorities.flatMap((priority, index) => [`${index + 1}. ${priority.title}`, priority.action, `根拠：${workspaceEvidenceLabel(priority.evidenceKey, advice.aggregate)}`]),
        "", advice.aggregate.role === "admin" ? "会議で確認すること" : "面談前に確認すること", ...advice.meetingQuestions.map((question, index) => `${index + 1}. ${question}`),
        "", "成果は各工程の日付による件数です。同じ候補者が同じ月に工程を進んだ割合ではありません。AIの提案は記録を確認して判断してください。",
    ].join("\n");
}

return exports; })();
/* END GENERATED WORKSPACE RULES */

/* Privacy-safe workspace coaching. Client sends a period, never business notes. */
function workspaceScope_(store,user,period) { return hash_(store.config.spreadsheetId+'|'+user.id+'|'+user.role+'|workspace-v1|'+period); }
function workspaceAggregate_(store,user,period) {
  if(!NODE_INSIGHT_RULES.validInsightPeriod(period))fail_('VALIDATION','集計期間を確認してください。');
  return NODE_INSIGHT_RULES.buildWorkspaceInsightAggregate(buildSnapshot_(store,user),period,today_());
}
function workspaceBody_(body) {
  function text(value,max){return typeof value==='string'&&value.trim()&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);}
  if(!body||!text(body.summary,600)||!Array.isArray(body.priorities)||!body.priorities.length||body.priorities.length>3||body.priorities.some(function(p){return !p||!text(p.title,80)||!text(p.action,400)||NODE_INSIGHT_RULES.workspaceEvidenceKeys.indexOf(p.evidenceKey)<0;})||!Array.isArray(body.meetingQuestions)||body.meetingQuestions.length>3||body.meetingQuestions.some(function(q){return !text(q,200);}))fail_('AI_UNAVAILABLE','AIの応答形式を確認できませんでした。保存された実績はそのままです。');
  return {summary:body.summary.trim(),priorities:body.priorities.map(function(p){return {title:p.title.trim(),action:p.action.trim(),evidenceKey:p.evidenceKey};}),meetingQuestions:body.meetingQuestions.map(function(q){return q.trim();})};
}
function workspaceAdvice_(scope) {
  var value=props_().getProperty('NODE_AI_ADVICE_'+scope);if(!value)return null;
  try{var result=JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(value),'application/gzip')).getDataAsString('UTF-8'));workspaceBody_(result);if(!result.aggregate||typeof result.inputSignature!=='string'||result.kind!=='workspace-v1')return null;return result;}catch(e){return null;}
}
function readWorkspaceInsights_(request) {
  var session=authenticate_(request.token),store=readStore_({readOnly:true}),user=activeActor_(store,session),period=String((request.payload||{}).period||'');
  var aggregate=workspaceAggregate_(store,user,period),scope=workspaceScope_(store,user,period),advice=workspaceAdvice_(scope),pending=aiPending_()[scope],properties=props_();
  snapshotActor_(store,request.token);
  return {advice:advice?aiResult_(advice,user,'saved'):null,stale:!!advice&&advice.inputSignature!==hash_(stableJson_(aggregate)),configured:!!properties.getProperty('NODE_GEMINI_API_KEY')&&properties.getProperty('NODE_GEMINI_FREE_TIER_CONFIRMED')==='true',pending:!!pending,usage:aiUsage_(user.id)};
}
function analyzeWorkspaceInsights_(request) {
  var session=authenticate_(request.token),store=readStore_({readOnly:true}),user=activeActor_(store,session),period=String((request.payload||{}).period||'');
  var aggregate=workspaceAggregate_(store,user,period),signature=hash_(stableJson_(aggregate)),scope=workspaceScope_(store,user,period),properties=props_(),reservationId=Utilities.getUuid();
  var previous=withLock_(function(){
    snapshotActor_(store,request.token);
    var saved=workspaceAdvice_(scope);if(saved&&saved.inputSignature===signature)return saved;
    if(!properties.getProperty('NODE_GEMINI_API_KEY')||properties.getProperty('NODE_GEMINI_FREE_TIER_CONFIRMED')!=='true')fail_('AI_NOT_CONFIGURED','管理者が無料枠の専用Geminiプロジェクトを接続してください。');
    var pending=aiPending_();if(pending[scope])fail_('AI_IN_PROGRESS','この集計のAI提案を作成中です。保存済みの結果を確認してください。利用回数は追加していません。');
    if(Object.keys(pending).length>=REVIEW_AI_LIMIT)fail_('BUSY','AIが混み合っています。少し待ってから再確認してください。');
    var q=aiQuota_();if(q.total>=10||(q.users[user.id]||0)>=3)fail_('AI_LIMIT','本日のAI利用上限です。保存済みの提案と案件の確認は引き続き使えます。翌日0時に回数が戻ります。');
    q.total++;q.users[user.id]=(q.users[user.id]||0)+1;pending[scope]={id:reservationId,signature:signature,expiresAt:Date.now()+360000};
    var updates={};updates.NODE_AI_QUOTA=JSON.stringify(q);updates[REVIEW_AI_PENDING]=JSON.stringify(pending);properties.setProperties(updates,false);return null;
  });
  if(previous){snapshotActor_(store,request.token);return aiResult_(previous,user,'saved');}
  try{
    var body=generateWorkspaceInsights_(aggregate,properties.getProperty('NODE_GEMINI_API_KEY'));
    snapshotActor_(store,request.token);
    var result=Object.assign({},body,{kind:'workspace-v1',aggregate:aggregate,period:period,inputSignature:signature,generatedAt:new Date().toISOString()});
    withLock_(function(){snapshotActor_(store,request.token);saveAiAdvice_(scope,result);});
    snapshotActor_(store,request.token);return aiResult_(result,user,'generated');
  }finally{withLock_(function(){var pending=aiPending_();if(pending[scope]&&pending[scope].id===reservationId){delete pending[scope];properties.setProperty(REVIEW_AI_PENDING,JSON.stringify(pending));}});}
}
function generateWorkspaceInsights_(aggregate,key) {
  var response;
  var instruction='人材紹介の業務改善を支援。渡すのは匿名の工程件数、前期間件数、提案目標、未記録の予定、理由分類だけ。氏名、会社、メモは渡していない。日本語で短い要約、具体的な次の行動を最大三つ、確認したい質問を最大三つ作る。adminなら成果ミーティングの確認点、playerなら本人の面談準備・次の行動。期間別工程件数は別の候補者集団であり、転換率や原因を断定しない。予定超過は実施未記録の確認であり、未実施・怠慢と決めつけない。結果待ちは不成立とみなさない。データが少ない時はその限界を説明。採用適否、個人の優劣、機微属性や能力を評価しない。名付けた人物、会社、具体的な実績の捏造をしない。数字や達成率は画面が実データから表示するので、文章に集計値を転記しない。各提案のevidenceKeyは固定キーから選び、対象の集計が無いときは提案しない。操作、保存、連絡は利用者が内容を確認して実施する。JSONだけ: summary、priorities（title/action/evidenceKey）、meetingQuestions。';
  try{response=UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',{method:'post',contentType:'application/json',headers:{'x-goog-api-key':key},muteHttpExceptions:true,payload:JSON.stringify({systemInstruction:{parts:[{text:instruction}]},contents:[{role:'user',parts:[{text:JSON.stringify(aggregate)}]}],generationConfig:{temperature:0.2,maxOutputTokens:1600,responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{summary:{type:'STRING'},priorities:{type:'ARRAY',items:{type:'OBJECT',properties:{title:{type:'STRING'},action:{type:'STRING'},evidenceKey:{type:'STRING',enum:NODE_INSIGHT_RULES.workspaceEvidenceKeys}},required:['title','action','evidenceKey']}},meetingQuestions:{type:'ARRAY',items:{type:'STRING'}}},required:['summary','priorities','meetingQuestions']}}})});}catch(e){fail_('AI_UNAVAILABLE','AIとの通信を確認できませんでした。保存済みの結果を確認してから再試行してください。');}
  if(response.getResponseCode()===429)fail_('AI_LIMIT','Googleの無料枠の上限です。保存済みの提案や案件の確認は引き続き使えます。');
  if(response.getResponseCode()!==200)fail_('AI_UNAVAILABLE','AIから結果を取得できませんでした。保存された実績はそのままです。');
  var body;try{var json=JSON.parse(response.getContentText());body=JSON.parse(json.candidates[0].content.parts.map(function(p){return p.text||'';}).join(''));}catch(e){fail_('AI_UNAVAILABLE','AIの応答形式を確認できませんでした。');}
  var result=workspaceBody_(body);
  result.priorities.forEach(function(priority){
    var evidence=priority.evidenceKey;
    if(Object.prototype.hasOwnProperty.call(aggregate.pipeline,evidence)&&aggregate.pipeline[evidence]<=0||evidence==='proposalTarget'&&!(aggregate.proposalTarget>0)||evidence==='reviewReasons'&&!aggregate.reviewReasons.length)fail_('AI_UNAVAILABLE','AIの提案と元の集計が一致しませんでした。実績を確認してから再試行してください。');
  });
  return result;
}
/** Synthetic AI smoke test: no business reads, no quota or saved-report writes. */
function verifyNodeWorkspaceAi() {
  requireOwner_();var properties=props_(),key=properties.getProperty('NODE_GEMINI_API_KEY');
  if(!key||properties.getProperty('NODE_GEMINI_FREE_TIER_CONFIRMED')!=='true')fail_('AI_NOT_CONFIGURED','Geminiの無料枠設定を確認してください。');
  var aggregate={role:'admin',period:'2026-10',asOf:'2026-10-14',metrics:NODE_INSIGHT_RULES.insightMetrics.map(function(m){return {key:m.key,count:2,previousCount:1};}),proposalTarget:20,memberCount:1,pipeline:{interviewsToday:1,interviewsOverdue:1,resultsWaiting:1,startsOverdue:0,missingReviews:0},reviewReasons:[]};
  var result=generateWorkspaceInsights_(aggregate,key);var proof={success:true,model:'gemini-3.5-flash-lite',priorities:result.priorities.length,questions:result.meetingQuestions.length,checked:['synthetic aggregate only','validated structured output','no business reads','no app quota or reports changed']};Logger.log(JSON.stringify(proof));return proof;
}

/** Read-only owner probe. Plans deletion against the registered verification copy and never commits it. */
function verifyNodeDeletionReadOnly() {
  requireOwner_();var production=config_(),copyId=props_().getProperty(NODE.verificationKey);
  if(!copyId||copyId===NODE.originalId||copyId===production.spreadsheetId||copyId===props_().getProperty(NODE.destinationKey))fail_('COPY_VERIFICATION_REQUIRED','独立した検証コピーを確認してください。');
  var book=SpreadsheetApp.openById(copyId),tabs=resolveBusinessTabs_(book),config=JSON.parse(JSON.stringify(production));
  config.spreadsheetId=copyId;config.purpose='verification';config.matchingSheetId=tabs.matching.getSheetId();config.kpiSheetId=tabs.kpi.getSheetId();
  var playerSheet=book.getSheetByName(NODE.playersTab),store=readStore_({readOnly:true},{config:config,book:book,playerSheet:playerSheet,players:readPlayers_(playerSheet)});
  if(!store.schemaCompatible)fail_('SCHEMA_MISMATCH','検証コピーの列を確認してください。');
  var record=store.records.find(function(r){return r.playerId&&[3,4].concat(NODE.stageColumns).every(function(c){return !r.formulas[c-1];});});if(!record)fail_('COPY_VERIFICATION_REQUIRED','検証コピーに読み取り対象の候補者がありません。');
  var user={id:record.playerId,role:'player'},payload={recordId:record.recordId,rowVersion:record.version,scope:'record',targets:[{recordId:record.recordId,rowVersion:record.version}]},plan=planDeleteCandidate_(store,user,payload,Utilities.getUuid());
  revalidateManagementPlan_(store,user,plan);
  if(!plan.result.undo||plan.result.undo.length!==1||plan.requests.some(function(r){return !r.updateCells&&!r.createDeveloperMetadata;}))fail_('COPY_VERIFICATION_FAILED','削除計画の形式を確認してください。');
  var result={verified:true,readOnly:true,plannedRows:plan.result.deletedCount,requestCount:plan.requests.length,checked:['本人権限','行バージョン','数式保護','復元用の保存計画'],productionUnchanged:stableJson_(config_())===stableJson_(production)};Logger.log(JSON.stringify(result));return result;
}

/* Private interview intake and shared client choices. Details never enter AI input. */
var CANDIDATE_PROFILE_TAB='_NODE_candidate_profiles';
var CANDIDATE_PROFILE_HEADERS=['profileId','playerId','fields','introduction','version','updatedAt'];
var CLIENT_TAB='_NODE_clients';
var CLIENT_HEADERS=['id','name','active','version','updatedAt'];
var INTERVIEW_FIELD_LIMITS={age:20,gender:20,residence:120,availableFrom:120,timeWindow:200,daysPerWeek:80,monthlyHours:80,sideJob:160,desiredHourlyRate:100,pcEnvironment:30,networkEnvironment:200,attendanceConcerns:600,workHistory:6000,achievements:1500,strengths:1500,crmOther:120,chatOther:120,interviewAvailability:300,workStyle:200,pcSkills:800,additionalNotes:2000,interviewMemo:2000,selfReflection:2000,interviewAdvice:5000};
var INTERVIEW_CRM_TOOLS=['Salesforce','kintone','HubSpot','その他'];
var INTERVIEW_CHAT_TOOLS=['Slack','Chatwork','その他'];
function intakeText_(value,max) {
  if(typeof value!=='string'||Array.from(value).length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))fail_('VALIDATION','面談情報の文字数または入力形式を確認してください。');
  return value.trim();
}
function interviewFields_(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(function(k){return !Object.prototype.hasOwnProperty.call(INTERVIEW_FIELD_LIMITS,k)&&k!=='crmTools'&&k!=='chatTools';}))fail_('VALIDATION','面談情報の項目を確認してください。');
  var result={};Object.keys(INTERVIEW_FIELD_LIMITS).forEach(function(k){result[k]=intakeText_(value[k]===undefined?'':value[k],INTERVIEW_FIELD_LIMITS[k]);});
  if(['','Windows','MacBook','PCなし','購入予定','その他'].indexOf(result.pcEnvironment)<0||['','男性','女性','その他','回答しない'].indexOf(result.gender)<0)fail_('VALIDATION','面談情報の選択肢を確認してください。');
  [['crmTools',INTERVIEW_CRM_TOOLS],['chatTools',INTERVIEW_CHAT_TOOLS]].forEach(function(pair){var values=value[pair[0]]===undefined?[]:value[pair[0]];if(!Array.isArray(values)||values.length>pair[1].length||values.some(function(v){return typeof v!=='string'||pair[1].indexOf(v)<0;})||new Set(values).size!==values.length)fail_('VALIDATION','面談情報の複数選択を確認してください。');result[pair[0]]=pair[1].filter(function(v){return values.indexOf(v)>=0;});});
  return result;
}
function interviewBody_(payload) {
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(function(k){return ['fields','introduction','profileVersion'].indexOf(k)<0;}))fail_('VALIDATION','保存する面談情報を確認してください。');
  if(payload.profileVersion!==undefined&&typeof payload.profileVersion!=='string')fail_('VALIDATION','面談情報のバージョンを確認してください。');
  return {fields:interviewFields_(payload.fields),introduction:intakeText_(payload.introduction===undefined?'':payload.introduction,1000),profileVersion:payload.profileVersion||''};
}
function intakeId_(value) {return typeof value==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(value);}
function intakeTable_(book,title,headers) {
  var sheet=book.getSheetByName(title);if(!sheet)return {sheet:null,rows:[],fingerprint:'missing'};
  if(sheet.getLastRow()>5001)fail_('INTAKE_LIMIT','面談情報またはクライアントの保存上限に達しました。管理者に確認してください。');
  var values=table_(sheet,headers),formulas=sheet.getRange(1,1,values.length,headers.length).getFormulas();
  if(formulas.some(function(r){return r.some(Boolean);}))fail_('FORMULA_PROTECTED','面談情報・クライアントの管理タブに数式があります。保存を停止しました。');
  return {sheet:sheet,rows:values.slice(1),fingerprint:hash_(stableJson_(values))};
}
function candidateProfileTable_(book) {
  var state=intakeTable_(book,CANDIDATE_PROFILE_TAB,CANDIDATE_PROFILE_HEADERS),seen={};
  state.entries=state.rows.map(function(row,i){
    var fields;try{fields=interviewFields_(JSON.parse(row[2]));}catch(_){fail_('SCHEMA_MISMATCH','保存済みの面談情報の項目を確認してください。');}
    if(!intakeId_(row[0])||typeof row[1]!=='string'||!row[1]||seen[row[0]]||!intakeId_(row[4])||typeof row[5]!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(row[5])||!isFinite(Date.parse(row[5])))fail_('SCHEMA_MISMATCH','保存済みの面談情報のID・担当・バージョンを確認してください。');
    var introduction;try{introduction=intakeText_(row[3],1000);}catch(_){fail_('SCHEMA_MISMATCH','保存済みの紹介文を確認してください。');}seen[row[0]]=true;
    return {profileId:row[0],playerId:row[1],fields:fields,introduction:introduction,version:row[4],updatedAt:row[5],row:i+2};
  });return state;
}
function profileRecords_(store,profile) {return store.records.filter(function(r){return r.profileId===profile.profileId;});}
function readCandidateProfiles_(store,user) {
  return candidateProfileTable_(store.book).entries.filter(function(profile){var records=profileRecords_(store,profile);return records.length&&records.every(function(r){return r.playerId===profile.playerId;})&&(user.role==='admin'||profile.playerId===user.id);}).map(function(profile){return {profileId:profile.profileId,playerId:profile.playerId,recordIds:profileRecords_(store,profile).map(function(r){return r.recordId;}),fields:profile.fields,introduction:profile.introduction,version:profile.version,updatedAt:profile.updatedAt};});
}
function clientTable_(book) {
  var state=intakeTable_(book,CLIENT_TAB,CLIENT_HEADERS),seen={},names={};
  state.entries=state.rows.map(function(row,i){var name;try{name=shortText_(row[1],100,true);}catch(_){fail_('SCHEMA_MISMATCH','クライアント名を確認してください。');}var key=clientNameKey_(name);
    if(!intakeId_(row[0])||seen[row[0]]||typeof row[2]!=='boolean'||!intakeId_(row[3])||typeof row[4]!=='string'||!isFinite(Date.parse(row[4]))||row[2]&&names[key])fail_('SCHEMA_MISMATCH','クライアントのID・状態・重複を確認してください。');seen[row[0]]=true;if(row[2])names[key]=true;
    return {id:row[0],name:name,active:row[2],version:row[3],updatedAt:row[4],row:i+2};
  });return state;
}
function clientNameKey_(name) {return name.normalize('NFKC').replace(/\s/g,'').toLowerCase();}
function clientEntries_(book) {return clientTable_(book).entries.map(function(entry){return {id:entry.id,name:entry.name,active:entry.active,version:entry.version};});}
function intakeWritePlan_(store,plan,title,headers,state,row,values) {
  if(row>5001)fail_('INTAKE_LIMIT','保存上限に達しました。管理者に確認してください。');
  plan.requests=plan.requests||[];plan.intakeTableChecks=plan.intakeTableChecks||[];
  var prior=plan.intakeTableChecks.find(function(check){return check.title===title;});
  if(prior&&(prior.fingerprint!==state.fingerprint||prior.sheetId!==(state.sheet?state.sheet.getSheetId():null)))fail_('CONFLICT','同じ保存の管理表が変更されています。');
  if(!prior)plan.intakeTableChecks.push({title:title,headers:headers,fingerprint:state.fingerprint,sheetId:state.sheet?state.sheet.getSheetId():null});
  plan.intakeWriteTargets=plan.intakeWriteTargets||{};var target=plan.intakeWriteTargets[title],id;
  if(!target){
    if(!state.sheet){do{id=Math.floor(Math.random()*1000000000)+1;}while(store.book.getSheets().some(function(sheet){return sheet.getSheetId()===id;})||Object.keys(plan.intakeWriteTargets).some(function(key){return plan.intakeWriteTargets[key].id===id;}));
      plan.requests.push({addSheet:{properties:{sheetId:id,title:title,gridProperties:{rowCount:5001,columnCount:headers.length}}}});plan.requests.push(rowUpdateRequest_(id,1,headers));target={id:id,rows:5001};
    }else target={id:state.sheet.getSheetId(),rows:state.sheet.getMaxRows()};
    plan.intakeWriteTargets[title]=target;
  }
  if(row>target.rows){plan.requests.push({appendDimension:{sheetId:target.id,dimension:'ROWS',length:row-target.rows}});target.rows=row;}
  plan.requests.push(rowUpdateRequest_(target.id,row,values));
}
function addProfileRecordChecks_(plan,records) {
  plan.recordChecks=plan.recordChecks||[];records.forEach(function(record){if(!plan.recordChecks.some(function(c){return c.recordId===record.recordId;}))plan.recordChecks.push({recordId:record.recordId,row:record.row,version:record.version,profileId:record.profileId||'',playerId:record.playerId});});
}
function matchingProfile_(store,state,record,ownerId) {
  if(!record||!record.profileId)return null;
  var profile=state.entries.find(function(p){return p.profileId===record.profileId;});
  if(!profile||profile.playerId!==ownerId||!profileRecords_(store,profile).every(function(r){return r.playerId===ownerId;}))fail_('CONFLICT','面談情報の担当・関連する提案が変わっています。管理者に確認してください。');
  return profile;
}
function addCandidateProfileToPlan_(store,user,plan,record,ownerId,payload) {
  var body=interviewBody_(payload),state=candidateProfileTable_(store.book),previous=matchingProfile_(store,state,record,ownerId);
  if(previous?body.profileVersion!==previous.version:!!body.profileVersion)fail_('CONFLICT','面談情報が更新されています。再取得してから編集してください。');
  var profileId=previous?previous.profileId:Utilities.getUuid();
  if(!previous){if(store.profileMetadata&&store.profileMetadata[plan.row||record.row])fail_('CONFLICT','この行には別の面談情報が関連付けられています。');plan.requests.push(metadataCreate_(store.matching.getSheetId(),plan.row||record.row,NODE.candidateProfileKey,profileId));}
  var values=[profileId,ownerId,JSON.stringify(body.fields),body.introduction,Utilities.getUuid(),new Date().toISOString()];
  intakeWritePlan_(store,plan,CANDIDATE_PROFILE_TAB,CANDIDATE_PROFILE_HEADERS,state,previous?previous.row:state.rows.length+2,values);
  addProfileRecordChecks_(plan,record?[record].concat(previous?profileRecords_(store,previous):[]):[]);
  if(previous)addProfileGroupCheck_(store,plan,previous.profileId);
  else {plan.profileVacancyChecks=plan.profileVacancyChecks||[];plan.profileVacancyChecks.push(plan.row||record.row);}
  plan.result=Object.assign({},plan.result||{},{recordId:record?record.recordId:plan.recordId,profileId:profileId});
}
function planCandidateProfile_(store,user,payload) {
  var record=findRecord_(store,payload.recordId);actorOwns_(user,record);checkVersion_(record,payload.rowVersion);
  if(typeof payload.profileVersion!=='string')fail_('CONFLICT','面談情報の最新バージョンを指定してください。');
  var plan={requests:[],result:{}};addCandidateProfileToPlan_(store,user,plan,record,record.playerId,{fields:payload.fields,introduction:payload.introduction,profileVersion:payload.profileVersion});return plan;
}
function linkCandidateProfileToPlan_(store,user,plan,ownerId,candidateId,sourceId) {
  var source=findRecord_(store,sourceId);actorOwns_(user,source);
  if(source.playerId!==ownerId||source.candidateId!==candidateId)fail_('CONFLICT','同じ担当者・候補者の面談情報を選択してください。');
  var state=candidateProfileTable_(store.book),profile=matchingProfile_(store,state,source,ownerId);if(!profile)fail_('VALIDATION','引継ぎ元の面談情報を先に保存してください。');
  if(store.profileMetadata&&store.profileMetadata[plan.row])fail_('CONFLICT','保存先には別の面談情報が関連付けられています。');
  plan.requests.push(metadataCreate_(store.matching.getSheetId(),plan.row,NODE.candidateProfileKey,profile.profileId));
  plan.intakeTableChecks=[{title:CANDIDATE_PROFILE_TAB,headers:CANDIDATE_PROFILE_HEADERS,fingerprint:state.fingerprint,sheetId:state.sheet.getSheetId()}];
  addProfileRecordChecks_(plan,profileRecords_(store,profile));addProfileGroupCheck_(store,plan,profile.profileId);
  plan.profileVacancyChecks=[plan.row];plan.result.profileId=profile.profileId;
}
function planClient_(store,user,payload) {
  var state=clientTable_(store.book),name=shortText_(payload.name,100,true),previous=null;
  if(payload.id!==undefined){if(!intakeId_(payload.id)||typeof payload.version!=='string')fail_('VALIDATION','クライアントのIDとバージョンを確認してください。');previous=state.entries.find(function(c){return c.id===payload.id;});if(!previous||previous.version!==payload.version)fail_('CONFLICT','クライアントが更新されています。再取得してください。');}
  else if(payload.version!==undefined&&payload.version!=='')fail_('CONFLICT','新しいクライアントには過去のバージョンを指定できません。');
  if(payload.active!==undefined&&typeof payload.active!=='boolean')fail_('VALIDATION','クライアントの利用状態を確認してください。');
  var active=payload.active===undefined?(previous?previous.active:true):payload.active,id=previous?previous.id:Utilities.getUuid();
  if(active&&state.entries.some(function(c){return c.active&&c.id!==id&&clientNameKey_(c.name)===clientNameKey_(name);}))fail_('VALIDATION','同じクライアントが登録されています。既存のクライアントを選択してください。');
  var plan={requests:[],result:{clientId:id}};
  // Shared entries are team-editable; the operation history records who renamed or deactivated what.
  if(previous)plan.result.before={name:previous.name,active:previous.active};
  intakeWritePlan_(store,plan,CLIENT_TAB,CLIENT_HEADERS,state,previous?previous.row:state.rows.length+2,[id,name,active,Utilities.getUuid(),new Date().toISOString()]);return plan;
}
function profileBindingSignature_(maps,profileId) {return stableJson_(Object.keys(maps[NODE.candidateProfileKey]||{}).filter(function(row){return maps[NODE.candidateProfileKey][row].value===profileId;}).map(function(row){return [Number(row),maps[NODE.recordKey][row]?maps[NODE.recordKey][row].value:''];}).sort(function(a,b){return a[0]-b[0];}));}
function addProfileGroupCheck_(store,plan,profileId) {
  var maps={};maps[NODE.candidateProfileKey]=store.profileMetadata;maps[NODE.recordKey]=store.recordMetadata;plan.profileGroupChecks=plan.profileGroupChecks||[];plan.profileGroupChecks.push({profileId:profileId,bindingSignature:profileBindingSignature_(maps,profileId)});
}
function revalidateIntakePlan_(store,user,plan) {
  if(plan.profileGroupChecks||plan.profileVacancyChecks){var maps=metadataMaps_(store.matching,[NODE.candidateProfileKey,NODE.recordKey]);
    (plan.profileGroupChecks||[]).forEach(function(check){if(profileBindingSignature_(maps,check.profileId)!==check.bindingSignature)fail_('CONFLICT','面談情報に関連する提案が保存前に変わっています。再取得してください。');});
    (plan.profileVacancyChecks||[]).forEach(function(row){if(maps[NODE.candidateProfileKey][row])fail_('CONFLICT','保存先には別の面談情報が関連付けられています。');});
  }
  (plan.intakeTableChecks||[]).forEach(function(check){var current=intakeTable_(store.book,check.title,check.headers);if(current.fingerprint!==check.fingerprint||(current.sheet?current.sheet.getSheetId():null)!==check.sheetId)fail_('CONFLICT','面談情報またはクライアントが保存前に更新されました。再取得してください。');});
}

/* Shared AI writing forms. No candidate fields, record identifiers, free text or
 * categories derived from a person can reach this provider. Personal drafts are
 * assembled in the browser from these generic forms and remain owner scoped. */
var WRITING_PREFERENCES_KEY='NODE_WRITING_PREFERENCES';
var WRITING_SECTION_IDS=['basic','experience','results','tools','availability','summary'];
var WRITING_COACHING_CODES=['requirements','experience','communication','schedule','proposal','reflection'];
var WRITING_STYLES=['standard','concise'];
function writingObject_(value,keys,code) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(function(key){return keys.indexOf(key)<0;}))fail_(code||'VALIDATION','AI書式の入力項目を確認してください。');
  return value;
}
function writingPreferencesBody_(value) {
  writingObject_(value,['version','tone','targetLength','includeSummary','sectionOrder']);
  if(typeof value.version!=='string'||!(/^(?:initial|[A-Za-z0-9_-]{16,80})$/).test(value.version)||['formal','plain'].indexOf(value.tone)<0||[600,1000].indexOf(value.targetLength)<0||typeof value.includeSummary!=='boolean'||!Array.isArray(value.sectionOrder)||value.sectionOrder.length!==6||value.sectionOrder.some(function(id,index){return WRITING_SECTION_IDS.indexOf(id)<0||value.sectionOrder.indexOf(id)!==index;}))fail_('VALIDATION','AI書式の設定を確認してください。');
  return {version:value.version,tone:value.tone,targetLength:value.targetLength,includeSummary:value.includeSummary,sectionOrder:value.sectionOrder.slice()};
}
function writingPreferences_() {
  var raw=props_().getProperty(WRITING_PREFERENCES_KEY);
  if(raw){try{return writingPreferencesBody_(JSON.parse(raw));}catch(e){fail_('AI_UNAVAILABLE','AI書式の共有設定を確認してください。');}}
  return {version:'initial',tone:'formal',targetLength:1000,includeSummary:true,sectionOrder:WRITING_SECTION_IDS.slice()};
}
function writingStyle_(payload) {
  writingObject_(payload,['style']);var style=payload.style===undefined?'standard':payload.style;
  if(WRITING_STYLES.indexOf(style)<0)fail_('VALIDATION','AI書式の種類を確認してください。');return style;
}
function writingWritable_(store,token) {
  var actor=snapshotActor_(store,token);
  assertManagedBook_(store.book);
  if(!writesEnabled_(store.config)||store.book.getSpreadsheetTimeZone()!=='Asia/Tokyo')fail_('WRITES_DISABLED','現在は読み取り専用です。AI書式の更新は管理者に確認してください。');
  return actor;
}
function readWritingPreferences_(request) {
  var session=authenticate_(request.token),accounts=readAccountStore_();activeActor_(accounts,session);
  writingObject_(request.payload===undefined?{}:request.payload,[]);var preferences=writingPreferences_();snapshotActor_(accounts,request.token);
  return {preferences:preferences};
}
function saveWritingPreferences_(request) {
  var session=authenticate_(request.token),accounts=readAccountStore_();requireAdmin_(activeActor_(accounts,session));
  var payload=writingObject_(request.payload===undefined?{}:request.payload,['preferences']),next=writingPreferencesBody_(payload.preferences);
  return withLock_(function(){
    requireAdmin_(writingWritable_(accounts,request.token));var current=writingPreferences_();
    if(current.version!==next.version)fail_('VERSION_CONFLICT','ほかの管理者が書式設定を変更しました。最新の設定を確認してから保存してください。');
    var comparable=Object.assign({},next,{version:current.version});
    if(stableJson_(current)===stableJson_(comparable))return {preferences:current};
    next.version=Utilities.getUuid();
    // Only finite enum/boolean settings are stored. Never retain reference prose.
    props_().setProperty(WRITING_PREFERENCES_KEY,JSON.stringify(next));
    return {preferences:next};
  });
}
function writingScope_(style) {return 'writing-kit-v1-'+style;}
function writingKitKey_(style) {return 'NODE_AI_WRITING_KIT_'+style;}
function writingKitBody_(body,preferences) {
  writingObject_(body,['sections','coaching'],'AI_UNAVAILABLE');
  function text(value,max){return typeof value==='string'&&value.trim()&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);}
  if(!Array.isArray(body.sections)||body.sections.length!==6||!Array.isArray(body.coaching)||body.coaching.length!==6)fail_('AI_UNAVAILABLE','AI書式の応答形式を確認できませんでした。');
  var sections=body.sections.map(function(section,index){
    writingObject_(section,['id','heading','lead'],'AI_UNAVAILABLE');
    if(section.id!==preferences.sectionOrder[index]||!text(section.heading,32)||!text(section.lead,120))fail_('AI_UNAVAILABLE','AI書式の応答形式を確認できませんでした。');
    return {id:section.id,heading:section.heading.trim(),lead:section.lead.trim()};
  });
  var coaching=body.coaching.map(function(item,index){
    writingObject_(item,['code','questions','actions'],'AI_UNAVAILABLE');
    if(item.code!==WRITING_COACHING_CODES[index]||!Array.isArray(item.questions)||item.questions.length<1||item.questions.length>3||item.questions.some(function(q){return !text(q,140);})||!Array.isArray(item.actions)||item.actions.length<1||item.actions.length>3||item.actions.some(function(a){return !text(a,180);}))fail_('AI_UNAVAILABLE','AI書式の応答形式を確認できませんでした。');
    return {code:item.code,questions:item.questions.map(function(q){return q.trim();}),actions:item.actions.map(function(a){return a.trim();})};
  });
  // Forms may ask for facts, but must not assert an invented biography or score.
  var prose=sections.map(function(s){return s.heading+' '+s.lead;}).concat(coaching.map(function(c){return c.questions.concat(c.actions).join(' ');})).join(' ');
  if(/[0-9０-９]+\s*(?:歳|年の経験|件の実績|万円|円|位|点|％|%)/.test(prose)||/(?:採用すべき|不採用にすべき|採用適性|この候補者は|同氏は|当該候補者は)/.test(prose))fail_('AI_UNAVAILABLE','AIが入力のない人物の評価を含めたため、書式を保存しませんでした。');
  return {sections:sections,coaching:coaching};
}
function writingKit_(style,preferences) {
  var raw=props_().getProperty(writingKitKey_(style));if(!raw)return null;
  try{
    var saved=JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(raw),'application/gzip')).getDataAsString('UTF-8'));
    if(saved.kind!=='writing-kit-v1'||saved.style!==style||saved.preferenceVersion!==preferences.version||typeof saved.generatedAt!=='string'||!isFinite(Date.parse(saved.generatedAt)))return null;
    var body=writingKitBody_({sections:saved.sections,coaching:saved.coaching},preferences);
    return Object.assign({},body,{generatedAt:saved.generatedAt,style:style,preferenceVersion:preferences.version,source:'saved'});
  }catch(e){return null;}
}
function saveWritingKit_(style,result) {
  var saved=Object.assign({},result,{kind:'writing-kit-v1'});delete saved.source;
  var value=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(saved),'application/json')).getBytes());
  if(value.length>8000)fail_('AI_UNAVAILABLE','AI書式が保存上限を超えました。短い書式で再試行してください。');
  props_().setProperty(writingKitKey_(style),value);
}
function writingState_(style,user,preferences,kit,pending) {
  var properties=props_();return {kit:kit,pending:!!pending,configured:!!properties.getProperty('NODE_GEMINI_API_KEY')&&properties.getProperty('NODE_GEMINI_FREE_TIER_CONFIRMED')==='true',usage:aiUsage_(user.id),preferences:preferences};
}
function readWritingKit_(request) {
  var session=authenticate_(request.token),accounts=readAccountStore_(),user=activeActor_(accounts,session),style=writingStyle_(request.payload===undefined?{}:request.payload),preferences=writingPreferences_();
  var state=writingState_(style,user,preferences,writingKit_(style,preferences),aiPending_()[writingScope_(style)]);
  snapshotActor_(accounts,request.token);return state;
}
function generateWritingKit_(request) {
  var session=authenticate_(request.token),accounts=readAccountStore_(),user=activeActor_(accounts,session),style=writingStyle_(request.payload===undefined?{}:request.payload),properties=props_(),reservationId=Utilities.getUuid(),scope=writingScope_(style),preferences;
  var ready=withLock_(function(){
    user=writingWritable_(accounts,request.token);preferences=writingPreferences_();
    var saved=writingKit_(style,preferences);if(saved)return writingState_(style,user,preferences,saved,false);
    if(!properties.getProperty('NODE_GEMINI_API_KEY')||properties.getProperty('NODE_GEMINI_FREE_TIER_CONFIRMED')!=='true')fail_('AI_NOT_CONFIGURED','管理者が無料枠の専用Geminiプロジェクトを接続してください。');
    var pending=aiPending_();if(pending[scope])return writingState_(style,user,preferences,null,true);
    if(Object.keys(pending).length>=REVIEW_AI_LIMIT)fail_('BUSY','AIが混み合っています。少し待ってから再確認してください。');
    var quota=aiQuota_();if(quota.total>=10||(quota.users[user.id]||0)>=3)fail_('AI_LIMIT','本日のAI利用上限です。保存済みの書式と端末内の整形は引き続き使えます。翌日0時に回数が戻ります。');
    quota.total++;quota.users[user.id]=(quota.users[user.id]||0)+1;
    pending[scope]={id:reservationId,signature:preferences.version,expiresAt:Date.now()+360000};
    var updates={};updates.NODE_AI_QUOTA=JSON.stringify(quota);updates[REVIEW_AI_PENDING]=JSON.stringify(pending);properties.setProperties(updates,false);return null;
  });
  if(ready){snapshotActor_(accounts,request.token);return ready;}
  try{
    var body=generateWritingKitBody_(style,preferences,properties.getProperty('NODE_GEMINI_API_KEY'));
    var result=Object.assign({},body,{generatedAt:new Date().toISOString(),source:'generated',style:style,preferenceVersion:preferences.version});
    return withLock_(function(){
      user=writingWritable_(accounts,request.token);
      if(writingPreferences_().version!==preferences.version)fail_('VERSION_CONFLICT','共有書式が更新されました。最新の設定で再作成してください。');
      var pending=aiPending_();if(!pending[scope]||pending[scope].id!==reservationId)fail_('BUSY','AI書式の作成状態が変わりました。結果を再取得してください。');
      saveWritingKit_(style,result);return writingState_(style,user,preferences,result,false);
    });
  }finally{withLock_(function(){var pending=aiPending_();if(pending[scope]&&pending[scope].id===reservationId){delete pending[scope];properties.setProperty(REVIEW_AI_PENDING,JSON.stringify(pending));}});}
}
function generateWritingKitBody_(style,preferences,key) {
  // This exact finite payload is the complete user input to Gemini. Do not add
  // candidate attributes, notes, names, IDs, dates or categorised personal data.
  var input={purpose:'generic_recruitment_writing_forms',style:style,settings:{tone:preferences.tone,targetLength:preferences.targetLength,includeSummary:preferences.includeSummary,sectionOrder:preferences.sectionOrder.slice()}};
  var instruction='日本語の人材紹介業務で使う汎用の紹介文書式と面談質問集を作る。人物の入力は一切ない。架空の氏名、会社、職歴、年齢、実績、能力、適性、採否、評価や事実を作らない。sectionsは指定のsectionOrder順で全6件。idはbasic（基本条件）、experience（経歴）、results（確認済み実績）、tools（利用ツール）、availability（稼働条件）、summary（紹介概要）。各headingは32文字以下の項目名、leadは120文字以下の汎用の導入句だけ。「この候補者は優秀」等の人物の主張は禁止。未記入内容を補完しない。summaryも人物の評価ではなく、本人が確認した内容だけを整理する導入句。coachingはrequirements,experience,communication,schedule,proposal,reflectionの順に全6件。各codeにつきquestionsとactionsを1〜3個ずつ。質問140文字以下、行動180文字以下。誰に何を確認し記録するかを示す一般的な手順を作る。採用適否の判断、人物比較、機微属性の推定は禁止。standardは丁寧、conciseは短い句。settingsの口調を守る。個別事実の数字・日付・人物・会社の例示は禁止。JSONだけを返す。';
  var response;
  try{response=UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',{method:'post',contentType:'application/json',headers:{'x-goog-api-key':key},muteHttpExceptions:true,payload:JSON.stringify({systemInstruction:{parts:[{text:instruction}]},contents:[{role:'user',parts:[{text:JSON.stringify(input)}]}],generationConfig:{temperature:0.2,maxOutputTokens:4000,responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{sections:{type:'ARRAY',items:{type:'OBJECT',properties:{id:{type:'STRING',enum:WRITING_SECTION_IDS},heading:{type:'STRING'},lead:{type:'STRING'}},required:['id','heading','lead']}},coaching:{type:'ARRAY',items:{type:'OBJECT',properties:{code:{type:'STRING',enum:WRITING_COACHING_CODES},questions:{type:'ARRAY',items:{type:'STRING'}},actions:{type:'ARRAY',items:{type:'STRING'}}},required:['code','questions','actions']}}},required:['sections','coaching']}}})});}catch(e){fail_('AI_UNAVAILABLE','AIとの通信を確認できませんでした。入力内容は送っていません。端末内の整形は引き続き使えます。');}
  if(response.getResponseCode()===429)fail_('AI_LIMIT','Googleの無料枠の上限です。保存済みの書式と端末内の整形は引き続き使えます。');
  if(response.getResponseCode()!==200)fail_('AI_UNAVAILABLE','AI書式を取得できませんでした。入力内容は送っていません。');
  var body;try{var json=JSON.parse(response.getContentText());body=JSON.parse(json.candidates[0].content.parts.map(function(part){return part.text||'';}).join(''));}catch(e){fail_('AI_UNAVAILABLE','AI書式の応答形式を確認できませんでした。');}
  return writingKitBody_(body,preferences);
}
/** Owner-only live probe: one generic form request, no business reads, no quota,
 * preferences, pending reservations or application cache mutations. */
function verifyNodeWritingAi() {
  requireOwner_();var properties=props_(),key=properties.getProperty('NODE_GEMINI_API_KEY');
  if(!key||properties.getProperty('NODE_GEMINI_FREE_TIER_CONFIRMED')!=='true')fail_('AI_NOT_CONFIGURED','Geminiの無料枠設定を確認してください。');
  var preferences={version:'initial',tone:'formal',targetLength:1000,includeSummary:true,sectionOrder:WRITING_SECTION_IDS.slice()},body=generateWritingKitBody_('standard',preferences,key);
  var encoded=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(body),'application/json')).getBytes());
  if(encoded.length>8000)fail_('AI_VERIFICATION_FAILED','AI書式の保存サイズを確認できませんでした。');
  var decoded=JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(encoded),'application/gzip')).getDataAsString('UTF-8'));writingKitBody_(decoded,preferences);
  var proof={success:true,model:'gemini-3.5-flash-lite',sections:body.sections.length,coaching:body.coaching.length,storageBytes:encoded.length,checked:['generic enum settings only','structured forms and all coaching topics','compressed round trip','no business sheet reads','no app quota preferences pending or cache writes']};Logger.log(JSON.stringify(proof));return proof;
}

/* BEGIN GENERATED PASSWORD KDF */
/* @noble/hashes 2.4.0; generated by scripts/generate-password-kdf.mjs
The MIT License (MIT)

Copyright (c) 2022 Paul Miller (https://paulmillr.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
var NODE_PASSWORD_KDF = (function(exports) {

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
	const fromNumH = (n) => n / 2 ** 32 | 0;
	const fromNumL = (n) => n >>> 0;
	function setU64FromNum(view, byteOffset, n, isLE) {
		const h = fromNumH(n);
		const l = fromNumL(n);
		view.setUint32(byteOffset, isLE ? l : h, isLE);
		view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
	}

/**
	* Checks if something is Uint8Array. Be careful: nodejs Buffer will return true.
	* @param a - value to test
	* @returns `true` when the value is a Uint8Array-compatible view.
	* @example
	* Check whether a value is a Uint8Array-compatible view.
	* ```ts
	* isBytes(new Uint8Array([1, 2, 3]));
	* ```
	*/
	function isBytes(a) {
		return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
	}
	const atitle = (title) => title ? `"${title}" ` : "";
	/**
	* Asserts something is a non-negative integer.
	* @param n - number to validate
	* @param title - label included in thrown errors
	* @returns The validated number.
	* @throws On wrong argument types. {@link TypeError}
	* @throws On wrong argument ranges or values. {@link RangeError}
	* @example
	* Validate a non-negative integer option.
	* ```ts
	* anumber(32, 'length');
	* ```
	*/
	function anumber(n, title = "") {
		if (typeof n !== "number") throw new TypeError(atitle(title) + "expected number, got " + typeof n);
		if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
		return n;
	}
	/**
	* Asserts something is Uint8Array.
	* @param value - value to validate
	* @param length - optional exact length constraint
	* @param title - label included in thrown errors
	* @returns The validated byte array.
	* @throws On wrong argument types. {@link TypeError}
	* @throws On wrong argument ranges or values. {@link RangeError}
	* @example
	* Validate that a value is a byte array.
	* ```ts
	* abytes(new Uint8Array([1, 2, 3]));
	* ```
	*/
	function abytes(value, length, title = "") {
		if (isBytes(value) && (length === void 0 || value.length === length)) return value;
		if (length !== void 0) anumber(length, "length");
		const bytes = isBytes(value);
		const ofLen = length !== void 0 ? ` of length ${length}` : "";
		const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
		const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
		if (!bytes) throw new TypeError(message);
		throw new RangeError(message);
	}
	/**
	* Asserts something is a wrapped hash constructor.
	* @param h - hash constructor to validate
	* @throws On wrong argument types or invalid hash wrapper shape. {@link TypeError}
	* @throws On invalid hash metadata ranges or values. {@link RangeError}
	* @throws If the hash metadata allows empty outputs or block sizes. {@link Error}
	* @example
	* Validate a callable hash wrapper.
	* ```ts
	* import { ahash } from '@noble/hashes/utils.js';
	* import { sha256 } from '@noble/hashes/sha2.js';
	* ahash(sha256);
	* ```
	*/
	function ahash(h) {
		if (typeof h !== "function" || typeof h.create !== "function") throw new TypeError("expected hash wrapped by utils.createHasher");
		anumber(h.outputLen);
		anumber(h.blockLen);
		if (h.outputLen < 1 || h.blockLen < 1) throw new Error("hash blockLen / outputLen must be >= 1");
	}
	const aobject = (value, label) => {
		if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
	};
	const aopts = (value, label) => {
		aobject(value, label);
		const proto = Object.getPrototypeOf(value);
		if (proto !== Object.prototype && proto !== null) throw new TypeError(`"${label}" expected plain object`);
		if (Object.prototype.hasOwnProperty.call(value, "__proto__")) throw new TypeError(`"${label}.__proto__" is not allowed`);
	};
	/**
	* Asserts a hash instance has not been destroyed or finished.
	* @param instance - hash instance to validate
	* @param checkFinished - whether to reject finalized instances
	* @throws If the hash instance has already been destroyed or finalized. {@link Error}
	* @example
	* Validate that a hash instance is still usable.
	* ```ts
	* import { aexists } from '@noble/hashes/utils.js';
	* import { sha256 } from '@noble/hashes/sha2.js';
	* const hash = sha256.create();
	* aexists(hash);
	* ```
	*/
	function aexists(instance, checkFinished = true) {
		if (instance.destroyed) throw new Error("hash was destroyed");
		if (checkFinished && instance.finished) throw new Error("digest() was already called");
	}
	/**
	* Asserts output is a sufficiently-sized byte array.
	* @param out - destination buffer
	* @param instance - hash instance providing output length
	* Oversized buffers are allowed; downstream code only promises to fill the first `outputLen` bytes.
	* @throws On wrong argument types. {@link TypeError}
	* @throws On wrong argument ranges or values. {@link RangeError}
	* @example
	* Validate a caller-provided digest buffer.
	* ```ts
	* import { aoutput } from '@noble/hashes/utils.js';
	* import { sha256 } from '@noble/hashes/sha2.js';
	* const hash = sha256.create();
	* aoutput(new Uint8Array(hash.outputLen), hash);
	* ```
	*/
	function aoutput(out, instance) {
		abytes(out, void 0, "output");
		const min = instance.outputLen;
		if (!(out.length >= min)) throw new RangeError("\"output\" expected length >= " + min);
	}
	/**
	* Zeroizes typed arrays in place. Warning: JS provides no guarantees.
	* @param arrays - arrays to overwrite with zeros
	* @example
	* Zeroize sensitive buffers in place.
	* ```ts
	* clean(new Uint8Array([1, 2, 3]));
	* ```
	*/
	function clean(...arrays) {
		for (let i = 0; i < arrays.length; i++) arrays[i].fill(0);
	}
	/**
	* Creates a DataView for byte-level manipulation.
	* @param arr - source typed array
	* @returns DataView over the same buffer region.
	* @example
	* Create a DataView over an existing buffer.
	* ```ts
	* createView(new Uint8Array(4));
	* ```
	*/
	function createView(arr) {
		return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
	}
	/**
	* Rotate-right operation for uint32 values.
	* @param word - source word
	* @param shift - shift amount in bits
	* @returns Rotated word.
	* @example
	* Rotate a 32-bit word to the right.
	* ```ts
	* rotr(0x12345678, 8);
	* ```
	*/
	function rotr(word, shift) {
		return word << 32 - shift | word >>> shift;
	}
	/**
	* Helper for KDFs: consumes Uint8Array or string.
	* String inputs are UTF-8 encoded; byte-array inputs stay aliased to the caller buffer.
	* @param data - user-provided KDF input
	* @param errorTitle - label included in thrown errors
	* @returns Byte representation of the input.
	* @throws On wrong argument types. {@link TypeError}
	* @example
	* Normalize KDF input to bytes.
	* ```ts
	* kdfInputToBytes('password');
	* ```
	*/
	function kdfInputToBytes(data, errorTitle = "") {
		return abytes(data, void 0, errorTitle);
	}
	/**
	* Merges default options and passed options.
	* @param defaults - base option object
	* @param opts - user overrides
	* @param title - label included in thrown override errors
	* @returns Fresh merged option object with a null prototype.
	* @throws On wrong argument types. {@link TypeError}
	* @example
	* Merge user overrides onto default options.
	* ```ts
	* checkOpts({ dkLen: 32 }, { asyncTick: 10 });
	* ```
	*/
	function checkOpts(defaults, opts, title = "opts") {
		aopts(defaults, "defaults");
		if (opts !== void 0) aopts(opts, title);
		return Object.assign(Object.create(null), defaults, opts);
	}
	/**
	* Creates a callable hash function from a stateful class constructor.
	* @param hashCons - hash constructor or factory
	* @param info - optional metadata such as DER OID
	* @returns Frozen callable hash wrapper with `.create()`.
	*   Wrapper construction eagerly calls `hashCons(undefined)` once to read
	*   `outputLen` / `blockLen`, so constructor side effects happen at module
	*   init time.
	* @throws On wrong argument types. {@link TypeError}
	* @example
	* Wrap a stateful hash constructor into a callable helper.
	* ```ts
	* import { createHasher } from '@noble/hashes/utils.js';
	* import { sha256 } from '@noble/hashes/sha2.js';
	* const wrapped = createHasher(sha256.create, { oid: sha256.oid });
	* wrapped(new Uint8Array([1]));
	* ```
	*/
	function createHasher(hashCons, info = {}) {
		if (typeof hashCons !== "function") throw new TypeError("\"hashCons\" expected function, got type=" + typeof hashCons);
		info = checkOpts({}, info, "info");
		const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
		const tmp = hashCons(void 0);
		hashC.outputLen = tmp.outputLen;
		hashC.blockLen = tmp.blockLen;
		hashC.canXOF = tmp.canXOF;
		hashC.create = (opts) => hashCons(opts);
		Object.assign(hashC, info);
		return Object.freeze(hashC);
	}
	/**
	* Creates OID metadata for NIST hashes with prefix `06 09 60 86 48 01 65 03 04 02`.
	* @param suffix - final OID byte for the selected hash.
	*   The helper accepts any byte even though only the documented NIST hash
	*   suffixes are meaningful downstream.
	* @returns Object containing the DER-encoded OID.
	* @example
	* Build OID metadata for a NIST hash.
	* ```ts
	* oidNist(0x01);
	* ```
	*/
	const oidNist = (suffix) => ({ oid: Uint8Array.from([
		6,
		9,
		96,
		134,
		72,
		1,
		101,
		3,
		4,
		2,
		suffix
	]) });

/**
	* Internal Merkle-Damgard hash utils.
	* @module
	*/
	/**
	* Shared 32-bit conditional boolean primitive reused by SHA-256, SHA-1, and MD5 `F`.
	* Returns bits from `b` when `a` is set, otherwise from `c`.
	* The XOR form is equivalent to MD5's `F(X,Y,Z) = XY v not(X)Z` because the masked terms never
	* set the same bit.
	* @param a - selector word
	* @param b - word chosen when selector bit is set
	* @param c - word chosen when selector bit is clear
	* @returns Mixed 32-bit word.
	* @example
	* Combine three words with the shared 32-bit choice primitive.
	* ```ts
	* Chi(0xffffffff, 0x12345678, 0x87654321);
	* ```
	*/
	function Chi(a, b, c) {
		return a & b ^ ~a & c;
	}
	/**
	* Shared 32-bit majority primitive reused by SHA-256 and SHA-1.
	* Returns bits shared by at least two inputs.
	* @param a - first input word
	* @param b - second input word
	* @param c - third input word
	* @returns Mixed 32-bit word.
	* @example
	* Combine three words with the shared 32-bit majority primitive.
	* ```ts
	* Maj(0xffffffff, 0x12345678, 0x87654321);
	* ```
	*/
	function Maj(a, b, c) {
		return a & b ^ a & c ^ b & c;
	}
	/**
	* Merkle-Damgard hash construction base class.
	* Could be used to create MD5, RIPEMD, SHA1, SHA2.
	* Accepts only byte-aligned `Uint8Array` input, even when the underlying spec describes bit
	* strings with partial-byte tails.
	* @param blockLen - internal block size in bytes
	* @param outputLen - digest size in bytes
	* @param padOffset - trailing length field size in bytes
	* @param isLE - whether length and state words are encoded in little-endian
	* @example
	* Use a concrete subclass to get the shared Merkle-Damgard update/digest flow.
	* ```ts
	* import { _SHA1 } from '@noble/hashes/legacy.js';
	* const hash = new _SHA1();
	* hash.update(new Uint8Array([97, 98, 99]));
	* hash.digest();
	* ```
	*/
	var HashMD = class {
		constructor(blockLen, outputLen, padOffset, isLE) {
			Object.defineProperty(this, "blockLen", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: void 0
			});
			Object.defineProperty(this, "outputLen", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: void 0
			});
			Object.defineProperty(this, "canXOF", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: false
			});
			Object.defineProperty(this, "padOffset", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: void 0
			});
			Object.defineProperty(this, "isLE", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: void 0
			});
			Object.defineProperty(this, "buffer", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: void 0
			});
			Object.defineProperty(this, "view", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: void 0
			});
			Object.defineProperty(this, "finished", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: false
			});
			Object.defineProperty(this, "length", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: 0
			});
			Object.defineProperty(this, "pos", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: 0
			});
			Object.defineProperty(this, "destroyed", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: false
			});
			this.blockLen = blockLen;
			this.outputLen = outputLen;
			this.padOffset = padOffset;
			this.isLE = isLE;
			this.buffer = new Uint8Array(blockLen);
			this.view = createView(this.buffer);
		}
		update(data) {
			aexists(this);
			abytes(data);
			const { view, buffer, blockLen } = this;
			const len = data.length;
			let processed = false;
			for (let pos = 0; pos < len;) {
				const take = Math.min(blockLen - this.pos, len - pos);
				if (take === blockLen) {
					const dataView = createView(data);
					for (; blockLen <= len - pos; pos += blockLen) this.process(dataView, pos);
					processed = true;
					continue;
				}
				buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
				this.pos += take;
				pos += take;
				if (this.pos === blockLen) {
					this.process(view, 0);
					this.pos = 0;
					processed = true;
				}
			}
			this.length += data.length;
			if (processed) this.roundClean();
			return this;
		}
		digestInto(out) {
			aexists(this);
			aoutput(out, this);
			this.finished = true;
			const { buffer, view, blockLen, isLE } = this;
			let { pos } = this;
			buffer[pos++] = 128;
			buffer.fill(0, pos);
			if (this.padOffset > blockLen - pos) {
				this.process(view, 0);
				buffer.fill(0);
			}
			setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
			this.process(view, 0);
			this.roundClean();
			const oview = out === buffer ? view : createView(out);
			const len = this.outputLen;
			const outLen = len / 4;
			const state = this.get();
			if (len % 4 || outLen > state.length) throw new Error("invalid outputLen");
			for (let i = 0; i < outLen; i++) oview.setUint32(4 * i, state[i], isLE);
		}
		digest() {
			const { buffer, outputLen } = this;
			this.digestInto(buffer);
			const res = buffer.slice(0, outputLen);
			this.destroy();
			return res;
		}
		_cloneIntoMeta(to) {
			const { buffer, length, finished, destroyed, pos } = this;
			to.destroyed = destroyed;
			to.finished = finished;
			to.length = length;
			to.pos = pos;
			if (pos) to.buffer.set(buffer);
			return to;
		}
		clone() {
			return this._cloneInto();
		}
	};
	/**
	* Initial SHA-2 state: fractional parts of square roots of first 16 primes 2..53.
	* Check out `test/misc/sha2-gen-iv.js` for recomputation guide.
	*/
	/** Initial SHA256 state from RFC 6234 §6.1: the first 32 bits of the fractional parts of the
	* square roots of the first eight prime numbers. Exported as a shared table; callers must treat
	* it as read-only because constructors copy words from it by index. */
	const SHA256_IV = /* @__PURE__ */ Uint32Array.from([
		1779033703,
		3144134277,
		1013904242,
		2773480762,
		1359893119,
		2600822924,
		528734635,
		1541459225
	]);

/**
	* SHA2 hash function. A.k.a. sha256, sha384, sha512, sha512_224, sha512_256.
	* SHA256 is the fastest hash implementable in JS, even faster than Blake3.
	* Check out {@link https://www.rfc-editor.org/rfc/rfc4634 | RFC 4634} and
	* {@link https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf | FIPS 180-4}.
	* @module
	*/
	/**
	* SHA-224 / SHA-256 round constants from RFC 6234 §5.1: the first 32 bits
	* of the cube roots of the first 64 primes (2..311).
	*/
	const SHA256_K = /* @__PURE__ */ Uint32Array.from([
		1116352408,
		1899447441,
		3049323471,
		3921009573,
		961987163,
		1508970993,
		2453635748,
		2870763221,
		3624381080,
		310598401,
		607225278,
		1426881987,
		1925078388,
		2162078206,
		2614888103,
		3248222580,
		3835390401,
		4022224774,
		264347078,
		604807628,
		770255983,
		1249150122,
		1555081692,
		1996064986,
		2554220882,
		2821834349,
		2952996808,
		3210313671,
		3336571891,
		3584528711,
		113926993,
		338241895,
		666307205,
		773529912,
		1294757372,
		1396182291,
		1695183700,
		1986661051,
		2177026350,
		2456956037,
		2730485921,
		2820302411,
		3259730800,
		3345764771,
		3516065817,
		3600352804,
		4094571909,
		275423344,
		430227734,
		506948616,
		659060556,
		883997877,
		958139571,
		1322822218,
		1537002063,
		1747873779,
		1955562222,
		2024104815,
		2227730452,
		2361852424,
		2428436474,
		2756734187,
		3204031479,
		3329325298
	]);
	/** Reusable SHA-224 / SHA-256 message schedule buffer `W_t` from RFC 6234 §6.2 step 1. */
	const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
	/** Internal SHA-224 / SHA-256 compression engine from RFC 6234 §6.2. */
	var SHA2_32B = class extends HashMD {
		constructor(outputLen, IV) {
			super(64, outputLen, 8, false);
			Object.defineProperty(this, "A", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: 0
			});
			Object.defineProperty(this, "B", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: 0
			});
			Object.defineProperty(this, "C", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: 0
			});
			Object.defineProperty(this, "D", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: 0
			});
			Object.defineProperty(this, "E", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: 0
			});
			Object.defineProperty(this, "F", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: 0
			});
			Object.defineProperty(this, "G", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: 0
			});
			Object.defineProperty(this, "H", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: 0
			});
			this.A = IV[0] | 0;
			this.B = IV[1] | 0;
			this.C = IV[2] | 0;
			this.D = IV[3] | 0;
			this.E = IV[4] | 0;
			this.F = IV[5] | 0;
			this.G = IV[6] | 0;
			this.H = IV[7] | 0;
		}
		get() {
			const { A, B, C, D, E, F, G, H } = this;
			return [
				A,
				B,
				C,
				D,
				E,
				F,
				G,
				H
			];
		}
		set(A, B, C, D, E, F, G, H) {
			this.A = A | 0;
			this.B = B | 0;
			this.C = C | 0;
			this.D = D | 0;
			this.E = E | 0;
			this.F = F | 0;
			this.G = G | 0;
			this.H = H | 0;
		}
		_cloneInto(to) {
			(to || (to = new this.constructor())).set(...this.get());
			return this._cloneIntoMeta(to);
		}
		process(view, offset) {
			for (let i = 0; i < 16; i++, offset += 4) SHA256_W[i] = view.getUint32(offset, false);
			for (let i = 16; i < 64; i++) {
				const W15 = SHA256_W[i - 15];
				const W2 = SHA256_W[i - 2];
				const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
				const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
				SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
			}
			let { A, B, C, D, E, F, G, H } = this;
			for (let i = 0; i < 64; i++) {
				const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
				const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
				const T2 = (rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22)) + Maj(A, B, C) | 0;
				H = G;
				G = F;
				F = E;
				E = D + T1 | 0;
				D = C;
				C = B;
				B = A;
				A = T1 + T2 | 0;
			}
			A = A + this.A | 0;
			B = B + this.B | 0;
			C = C + this.C | 0;
			D = D + this.D | 0;
			E = E + this.E | 0;
			F = F + this.F | 0;
			G = G + this.G | 0;
			H = H + this.H | 0;
			this.set(A, B, C, D, E, F, G, H);
		}
		roundClean() {
			clean(SHA256_W);
		}
		destroy() {
			this.destroyed = true;
			this.set(0, 0, 0, 0, 0, 0, 0, 0);
			clean(this.buffer);
		}
	};
	/** Internal SHA-256 hash class grounded in RFC 6234 §6.2. */
	var _SHA256 = class extends SHA2_32B {
		constructor() {
			super(32, SHA256_IV);
		}
	};
	/**
	* SHA2-256 hash function from RFC 4634. In JS it's the fastest: even faster than Blake3. Some info:
	*
	* - Trying 2^128 hashes would get 50% chance of collision, using birthday attack.
	* - BTC network is doing 2^70 hashes/sec (2^95 hashes/year) as per 2025.
	* - Each sha256 hash is executing 2^18 bit operations.
	* - Good 2024 ASICs can do 200Th/sec with 3500 watts of power, corresponding to 2^36 hashes/joule.
	* @param msg - message bytes to hash
	* @param opts - Reserved hash options.
	* @returns Digest bytes.
	* @example
	* Hash a message with SHA2-256.
	* ```ts
	* sha256(new Uint8Array([97, 98, 99]));
	* ```
	*/
	const sha256 = /* @__PURE__ */ createHasher(() => new _SHA256(), /* @__PURE__ */ oidNist(1));

/**
	* HMAC: RFC2104 message authentication code.
	* @module
	*/
	/**
	* Internal class for HMAC.
	* Accepts any byte key, although RFC 2104 §3 recommends keys at least
	* `HashLen` bytes long.
	*/
	var _HMAC = class {
		constructor(hash, key) {
			Object.defineProperty(this, "oHash", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: void 0
			});
			Object.defineProperty(this, "iHash", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: void 0
			});
			Object.defineProperty(this, "blockLen", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: void 0
			});
			Object.defineProperty(this, "outputLen", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: void 0
			});
			Object.defineProperty(this, "canXOF", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: false
			});
			Object.defineProperty(this, "finished", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: false
			});
			Object.defineProperty(this, "destroyed", {
				enumerable: true,
				configurable: true,
				writable: true,
				value: false
			});
			ahash(hash);
			abytes(key, void 0, "key");
			this.iHash = hash.create();
			if (typeof this.iHash.update !== "function") throw new Error("expected Hash instance");
			this.blockLen = this.iHash.blockLen;
			this.outputLen = this.iHash.outputLen;
			const blockLen = this.blockLen;
			const pad = new Uint8Array(blockLen);
			pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
			for (let i = 0; i < pad.length; i++) pad[i] ^= 54;
			this.iHash.update(pad);
			this.oHash = hash.create();
			for (let i = 0; i < pad.length; i++) pad[i] ^= 106;
			this.oHash.update(pad);
			clean(pad);
		}
		update(buf) {
			aexists(this);
			this.iHash.update(buf);
			return this;
		}
		digestInto(out) {
			aexists(this);
			aoutput(out, this);
			this.finished = true;
			const buf = out.subarray(0, this.outputLen);
			this.iHash.digestInto(buf);
			this.oHash.update(buf);
			this.oHash.digestInto(buf);
			this.destroy();
		}
		digest() {
			const out = new Uint8Array(this.oHash.outputLen);
			this.digestInto(out);
			return out;
		}
		_cloneInto(to) {
			to || (to = Object.create(Object.getPrototypeOf(this), {}));
			const { oHash, iHash, finished, destroyed, blockLen, outputLen, canXOF } = this;
			to = to;
			to.finished = finished;
			to.destroyed = destroyed;
			to.blockLen = blockLen;
			to.outputLen = outputLen;
			to.canXOF = canXOF;
			to.oHash = oHash._cloneInto(to.oHash);
			to.iHash = iHash._cloneInto(to.iHash);
			return to;
		}
		clone() {
			return this._cloneInto();
		}
		destroy() {
			this.destroyed = true;
			this.oHash.destroy();
			this.iHash.destroy();
		}
	};
	const hmac = /* @__PURE__ */ (() => {
		const hmac_ = ((hash, key, message) => new _HMAC(hash, key).update(message).digest());
		hmac_.create = (hash, key) => new _HMAC(hash, key);
		return hmac_;
	})();

/**
	* PBKDF (RFC 2898). Can be used to create a key from password and salt.
	* @module
	*/
	function pbkdf2Init(hash, _password, _salt, _opts) {
		ahash(hash);
		const { c, dkLen, asyncTick } = checkOpts({
			dkLen: 32,
			asyncTick: 10
		}, _opts);
		anumber(c, "c");
		anumber(dkLen, "dkLen");
		anumber(asyncTick, "asyncTick");
		if (c < 1) throw new Error("\"c\" (iterations) must be >= 1");
		if (dkLen < 1) throw new Error("\"dkLen\" must be >= 1");
		if (dkLen > (2 ** 32 - 1) * hash.outputLen) throw new Error("derived key too long");
		const p = kdfInputToBytes(_password, "password");
		try {
			const s = kdfInputToBytes(_salt, "salt");
			try {
				const DK = new Uint8Array(dkLen);
				const { iHash, oHash, outputLen } = hmac.create(hash, p);
				return {
					c,
					dkLen,
					asyncTick,
					DK,
					outputLen,
					eng: pbkdf2Engine(iHash, oHash, s, new Uint8Array(outputLen))
				};
			} finally {
				if (typeof _salt === "string") clean(s);
			}
		} finally {
			if (typeof _password === "string") clean(p);
		}
	}
	function pbkdf2Engine(iHash, oHash, salt, u) {
		const counter = /* @__PURE__ */ new Uint8Array(4);
		const view = createView(counter);
		const salted = iHash._cloneInto().update(salt);
		const work = oHash._cloneInto();
		const iClone = iHash._cloneInto;
		const oClone = oHash._cloneInto;
		return {
			u1: (ti, Ti) => {
				view.setInt32(0, ti, false);
				salted._cloneInto(work).update(counter).digestInto(u);
				oHash._cloneInto(work).update(u).digestInto(u);
				Ti.set(u.subarray(0, Ti.length));
			},
			rounds: (c, Ti) => {
				for (let ui = 1; ui < c; ui++) {
					iClone.call(iHash, work).update(u).digestInto(u);
					oClone.call(oHash, work).update(u).digestInto(u);
					for (let i = 0; i < Ti.length; i++) Ti[i] ^= u[i];
				}
			},
			output: (DK) => {
				iHash.destroy();
				oHash.destroy();
				salted.destroy();
				work.destroy();
				clean(u);
				return DK;
			}
		};
	}
	/**
	* PBKDF2-HMAC: RFC 8018 key derivation function.
	* @param hash - hash function that would be used e.g. sha256
	* @param password - password from which a derived key is generated;
	*   JS string inputs are UTF-8 encoded first
	* @param salt - cryptographic salt; JS string inputs are UTF-8 encoded first
	* @param opts - PBKDF2 work factor and output settings. `dkLen`, if provided,
	*   must be `>= 1` per RFC 8018 §5.2. See {@link Pbkdf2Opt}.
	* @returns Derived key bytes.
	* @throws If the PBKDF2 iteration count or derived-key settings are invalid. {@link Error}
	* @example
	* PBKDF2-HMAC: RFC 2898 key derivation function.
	* ```ts
	* import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
	* import { sha256 } from '@noble/hashes/sha2.js';
	* const key = pbkdf2(sha256, 'password', 'salt', { dkLen: 32, c: Math.pow(2, 18) });
	* ```
	*/
	function pbkdf2(hash, password, salt, opts) {
		const { c, dkLen, DK, outputLen, eng } = pbkdf2Init(hash, password, salt, opts);
		for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += outputLen) {
			const Ti = DK.subarray(pos, pos + outputLen);
			eng.u1(ti, Ti);
			eng.rounds(c, Ti);
		}
		return eng.output(DK);
	}

	function derive(key, salt, iterations) {
		return pbkdf2(sha256, key, salt, {
			c: iterations,
			dkLen: 32
		});
	}

exports.derive = derive;
return exports;
})({});
/* END GENERATED PASSWORD KDF */

/* Explicit internal publication workspace. Private matching/profile snapshots retain
 * their existing owner scopes. Reading never creates these app-owned tables. */
var TEAM_CANDIDATE_TAB='_NODE_team_candidates';
var TEAM_CANDIDATE_HEADERS=['publicationId','ownerId','sourceRecordId','sourceProfileId','sourceRowVersion','sourceProfileVersion','candidateName','introduction','published','version','createdAt','updatedAt','publishedAt'];
var TEAM_COMMENT_TAB='_NODE_team_comments';
var TEAM_COMMENT_HEADERS=['commentId','publicationId','parentId','authorId','body','mentionIds','deleted','version','createdAt','updatedAt'];
var TEAM_JOB_TAB='_NODE_team_jobs';
var TEAM_JOB_HEADERS=['jobId','company','title','description','requirements','workConditions','status','version','createdBy','updatedBy','createdAt','updatedAt'];
var TEAM_JOB_STATUSES=['open','paused','closed'];
function teamMutationAction_(action){return ['publishTeamCandidate','unpublishTeamCandidate','saveTeamComment','saveTeamJob','stageMigrationBatch','applyMigrationItem','mutateRewards'].indexOf(action)>=0;}
function teamObject_(payload){if(!payload||typeof payload!=='object'||Array.isArray(payload))fail_('VALIDATION','社内共有の入力内容を確認してください。');return payload;}
function teamId_(value){if(!intakeId_(value))fail_('VALIDATION','社内共有の管理IDを確認してください。');return value;}
function teamAccount_(value){if(typeof value!=='string'||!(/^[A-Za-z0-9_-]{1,30}$/).test(value))fail_('SCHEMA_MISMATCH','社内共有の担当者を確認してください。');return value;}
function teamTime_(value,empty){if(empty&&value==='')return '';if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value)||!isFinite(Date.parse(value)))fail_('SCHEMA_MISMATCH','社内共有の更新日を確認してください。');return value;}
function teamText_(value,max,required){return intakeText_(shortText_(value,max,required),max);}
function teamSchema_(fn){try{return fn();}catch(error){if(error.nodeCode==='FORMULA_PROTECTED'||error.nodeCode==='INTAKE_LIMIT')throw error;fail_('SCHEMA_MISMATCH','社内共有の管理タブに不正な値があります。管理者に確認してください。');}}
function teamCandidateTable_(book){
 var state=intakeTable_(book,TEAM_CANDIDATE_TAB,TEAM_CANDIDATE_HEADERS),seen=Object.create(null);
 state.entries=state.rows.map(function(row,index){return teamSchema_(function(){
  var id=teamId_(row[0]);if(seen[id]||typeof row[8]!=='boolean')fail_('SCHEMA_MISMATCH','共有候補者の管理IDまたは状態を確認してください。');seen[id]=true;
  return {publicationId:id,ownerId:teamAccount_(row[1]),sourceRecordId:teamId_(row[2]),sourceProfileId:teamId_(row[3]),sourceRowVersion:shortText_(row[4],128,true),sourceProfileVersion:teamId_(row[5]),candidateName:teamText_(row[6],60,true),introduction:teamIntroductionText_(row[7],row[3]),published:row[8],version:teamId_(row[9]),createdAt:teamTime_(row[10]),updatedAt:teamTime_(row[11]),publishedAt:teamTime_(row[12],true),row:index+2};
 });});return state;
}
function teamMentions_(value,players,stored){
 if(!Array.isArray(value)||value.length>20||value.some(function(id){return typeof id!=='string'||!/^[A-Za-z0-9_-]{1,30}$/.test(id);})||new Set(value).size!==value.length)fail_(stored?'SCHEMA_MISMATCH':'VALIDATION','メンション先は有効な社内メンバーを20人以内で指定してください。');
 if(!stored&&value.some(function(id){return !players.some(function(p){return p.id===id&&p.active&&(p.role==='player'||p.role==='admin');});}))fail_('VALIDATION','停止中または存在しないメンバーをメンションできません。');return value.slice();
}
function teamCommentTable_(book){
 var state=intakeTable_(book,TEAM_COMMENT_TAB,TEAM_COMMENT_HEADERS),seen=Object.create(null);
 state.entries=state.rows.map(function(row,index){return teamSchema_(function(){
  var id=teamId_(row[0]),mentions;try{mentions=JSON.parse(row[5]);}catch(_){fail_('SCHEMA_MISMATCH','コメントの宛先を確認してください。');}
  if(seen[id]||typeof row[6]!=='boolean')fail_('SCHEMA_MISMATCH','コメントのIDまたは状態を確認してください。');seen[id]=true;
  return {commentId:id,publicationId:teamId_(row[1]),parentId:row[2]?teamId_(row[2]):'',authorId:teamAccount_(row[3]),body:teamText_(row[4],2000,true),mentionIds:teamMentions_(mentions,[],true),deleted:row[6],version:teamId_(row[7]),createdAt:teamTime_(row[8]),updatedAt:teamTime_(row[9]),row:index+2};
 });});return state;
}
function teamJobTable_(book){
 var state=intakeTable_(book,TEAM_JOB_TAB,TEAM_JOB_HEADERS),seen=Object.create(null);
 state.entries=state.rows.map(function(row,index){return teamSchema_(function(){var id=teamId_(row[0]);if(seen[id])fail_('SCHEMA_MISMATCH','案件IDを確認してください。');seen[id]=true;
  return {jobId:id,company:teamText_(row[1],100,true),title:teamText_(row[2],120,true),description:teamText_(row[3],3000,false),requirements:teamText_(row[4],2000,false),workConditions:teamText_(row[5],2000,false),status:choice_(row[6],TEAM_JOB_STATUSES),version:teamId_(row[7]),createdBy:teamAccount_(row[8]),updatedBy:teamAccount_(row[9]),createdAt:teamTime_(row[10]),updatedAt:teamTime_(row[11]),row:index+2};
 });});return state;
}
function teamTableCheck_(plan,title,headers,state){plan.intakeTableChecks=plan.intakeTableChecks||[];if(!plan.intakeTableChecks.some(function(c){return c.title===title;}))plan.intakeTableChecks.push({title:title,headers:headers,fingerprint:state.fingerprint,sheetId:state.sheet?state.sheet.getSheetId():null});}
function teamCanManage_(user,publication){return user.role==='admin'||publication.ownerId===user.id;}
function teamPublication_(state,id){teamId_(id);var publication=state.entries.find(function(p){return p.publicationId===id;});if(!publication)fail_('NOT_FOUND','共有する候補者が見つかりません。');return publication;}
function teamVisible_(publication,players){return publication.published&&players.some(function(p){return p.id===publication.ownerId&&p.active&&p.role==='player';});}
function readTeamWorkspace_(request){
 var session=authenticate_(request.token,false,request.background===true),accounts=readAccountStore_(),user=activeActor_(accounts,session),candidates=teamCandidateTable_(accounts.book),comments=teamCommentTable_(accounts.book),jobs=teamJobTable_(accounts.book);
 var visible=candidates.entries.filter(function(p){return teamVisible_(p,accounts.players);}),ids=new Set(visible.map(function(p){return p.publicationId;}));
 var result={feature:true,candidates:candidates.entries.filter(function(p){return ids.has(p.publicationId)||teamCanManage_(user,p);}).map(function(p){
  var canManage=teamCanManage_(user,p),out={publicationId:p.publicationId,ownerId:p.ownerId,candidateName:p.candidateName,introduction:p.introduction,published:ids.has(p.publicationId),version:p.version,createdAt:p.createdAt,updatedAt:p.updatedAt,publishedAt:p.publishedAt,canManage:canManage};
  if(canManage){out.sourceRecordId=p.sourceRecordId;out.sourceProfileId=p.sourceProfileId;out.sourceRowVersion=p.sourceRowVersion;out.sourceProfileVersion=p.sourceProfileVersion;}return out;
 }),jobs:jobs.entries.map(function(p){return {jobId:p.jobId,company:p.company,title:p.title,description:p.description,requirements:p.requirements,workConditions:p.workConditions,status:p.status,version:p.version,createdBy:p.createdBy,updatedBy:p.updatedBy,createdAt:p.createdAt,updatedAt:p.updatedAt};}),comments:comments.entries.filter(function(p){return ids.has(p.publicationId);}).map(function(p){return {commentId:p.commentId,publicationId:p.publicationId,parentId:p.parentId,authorId:p.authorId,body:p.deleted?'':p.body,mentionIds:p.deleted?[]:p.mentionIds,deleted:p.deleted,version:p.version,createdAt:p.createdAt,updatedAt:p.updatedAt,canManage:user.role==='admin'||p.authorId===user.id};}),players:accounts.players.filter(function(p){return p.active&&(p.role==='player'||p.role==='admin');}).map(function(p){return {id:p.id,name:p.name,role:p.role};})};
 // A concurrent unpublish must not leave comments from an earlier table scan visible.
 if(teamCandidateTable_(accounts.book).fingerprint!==candidates.fingerprint)fail_('BUSY','社内共有が更新されました。もう一度読み込んでください。');
 snapshotActor_(accounts,request.token);return result;
}
function teamCandidateValues_(p){return [p.publicationId,p.ownerId,p.sourceRecordId,p.sourceProfileId,p.sourceRowVersion,p.sourceProfileVersion,p.candidateName,p.introduction,p.published,p.version,p.createdAt,p.updatedAt,p.publishedAt];}
function planTeamCandidate_(store,user,payload){
 teamObject_(payload);if(payload.confirmPublication!==true)fail_('VALIDATION','社内全員へ氏名と紹介文を共有することを確認してください。');
 var record=findRecord_(store,payload.recordId);actorOwns_(user,record);checkVersion_(record,payload.rowVersion);
 var owner=store.players.find(function(p){return p.id===record.playerId&&p.active&&p.role==='player';});if(!owner)fail_('FORBIDDEN','有効な担当者の候補者だけ共有できます。');
 var profiles=candidateProfileTable_(store.book),profile=matchingProfile_(store,profiles,record,record.playerId);if(!profile||payload.profileVersion!==profile.version)fail_('CONFLICT','最新の基本情報・紹介文を保存してから共有してください。');
 var introduction=teamText_(profile.introduction,1000,true),state=teamCandidateTable_(store.book),previous=payload.publicationId?teamPublication_(state,payload.publicationId):null;
 // Only the already prepared client-shareable prose is copied; fields, notes, scores,
 // attendance concerns, reflection and inferred suitability never enter this table.
 if(/持病|通院|家族.{0,10}介護|子(?:ども|供).{0,12}(?:発熱|送迎|看病)|精神疾患|妊娠|治療中/.test(introduction))fail_('VALIDATION','紹介文に健康・家庭の個人事情が含まれています。共有用の文章を確認・保存してから再度共有してください。');
 if(previous){if(!teamCanManage_(user,previous)||previous.ownerId!==record.playerId||previous.sourceProfileId!==profile.profileId)fail_('FORBIDDEN','別の候補者の共有内容を置き換えることはできません。');if(payload.version!==previous.version)fail_('CONFLICT','共有内容が更新されています。再取得してください。');}
 else {if(payload.version!==undefined&&payload.version!=='')fail_('CONFLICT','新しい共有に古いバージョンを指定できません。');if(state.entries.some(function(p){return p.ownerId===record.playerId&&p.sourceProfileId===profile.profileId;}))fail_('CONFLICT','この基本情報の共有は登録済みです。既存の共有を更新してください。');}
 var now=new Date().toISOString(),publication={publicationId:previous?previous.publicationId:Utilities.getUuid(),ownerId:record.playerId,sourceRecordId:record.recordId,sourceProfileId:profile.profileId,sourceRowVersion:record.version,sourceProfileVersion:profile.version,candidateName:record.name,introduction:introduction,published:true,version:Utilities.getUuid(),createdAt:previous?previous.createdAt:now,updatedAt:now,publishedAt:now},plan={requests:[],result:{publicationId:previous?previous.publicationId:publication.publicationId}};
 intakeWritePlan_(store,plan,TEAM_CANDIDATE_TAB,TEAM_CANDIDATE_HEADERS,state,previous?previous.row:state.rows.length+2,teamCandidateValues_(publication));teamTableCheck_(plan,CANDIDATE_PROFILE_TAB,CANDIDATE_PROFILE_HEADERS,profiles);addProfileRecordChecks_(plan,[record]);addProfileGroupCheck_(store,plan,profile.profileId);return plan;
}
function planUnpublishTeamCandidate_(store,user,payload){
 teamObject_(payload);var state=teamCandidateTable_(store.book),previous=teamPublication_(state,payload.publicationId);if(!teamCanManage_(user,previous))fail_('FORBIDDEN','この候補者の共有を変更できません。');if(payload.version!==previous.version)fail_('CONFLICT','共有内容が更新されています。再取得してください。');
 var next=Object.assign({},previous,{published:false,version:Utilities.getUuid(),updatedAt:new Date().toISOString()}),plan={requests:[],result:{publicationId:previous.publicationId}};intakeWritePlan_(store,plan,TEAM_CANDIDATE_TAB,TEAM_CANDIDATE_HEADERS,state,previous.row,teamCandidateValues_(next));return plan;
}
function planTeamComment_(store,user,payload){
 teamObject_(payload);var candidates=teamCandidateTable_(store.book),publication=teamPublication_(candidates,payload.publicationId);if(!teamVisible_(publication,store.players))fail_('FORBIDDEN','現在共有されている候補者にだけコメントできます。');
 var state=teamCommentTable_(store.book),previous=payload.commentId?state.entries.find(function(p){return p.commentId===teamId_(payload.commentId);}):null;
 if(payload.commentId&&!previous)fail_('NOT_FOUND','コメントが見つかりません。');
 if(previous){if(previous.publicationId!==publication.publicationId||user.role!=='admin'&&previous.authorId!==user.id)fail_('FORBIDDEN','このコメントを変更できません。');if(payload.version!==previous.version)fail_('CONFLICT','コメントが更新されています。再取得してください。');}
 else if(payload.version!==undefined&&payload.version!=='')fail_('CONFLICT','新しいコメントに古いバージョンを指定できません。');
 if(payload.deleted!==undefined&&typeof payload.deleted!=='boolean'||!previous&&payload.deleted===true)fail_('VALIDATION','コメントの状態を確認してください。');
 var parentId=payload.parentId===undefined?(previous?previous.parentId:''):payload.parentId?teamId_(payload.parentId):'';
 if(previous&&parentId!==previous.parentId)fail_('VALIDATION','コメントの返信先は変更できません。');
 if(parentId){var parent=state.entries.find(function(p){return p.commentId===parentId;});if(!parent||parent.publicationId!==publication.publicationId||!previous&&parent.deleted)fail_('VALIDATION','同じ候補者の有効なコメントへ返信してください。');}
 var deleted=payload.deleted===undefined?false:payload.deleted,body=deleted&&previous?previous.body:teamText_(payload.body,2000,true),mentions=deleted&&previous?previous.mentionIds:teamMentions_(payload.mentionIds===undefined?previous?previous.mentionIds:[]:payload.mentionIds,store.players,false),now=new Date().toISOString(),id=previous?previous.commentId:Utilities.getUuid(),plan={requests:[],result:{commentId:id,publicationId:publication.publicationId}};
 intakeWritePlan_(store,plan,TEAM_COMMENT_TAB,TEAM_COMMENT_HEADERS,state,previous?previous.row:state.rows.length+2,[id,publication.publicationId,parentId,previous?previous.authorId:user.id,body,JSON.stringify(mentions),deleted,Utilities.getUuid(),previous?previous.createdAt:now,now]);teamTableCheck_(plan,TEAM_CANDIDATE_TAB,TEAM_CANDIDATE_HEADERS,candidates);plan.teamMentions=deleted?[]:mentions;return plan;
}
function planTeamJob_(store,user,payload){
 requireAdmin_(user);teamObject_(payload);var state=teamJobTable_(store.book),previous=payload.jobId?state.entries.find(function(p){return p.jobId===teamId_(payload.jobId);}):null;
 if(payload.jobId&&!previous)fail_('NOT_FOUND','案件が見つかりません。');if(previous?payload.version!==previous.version:payload.version!==undefined&&payload.version!=='')fail_('CONFLICT','案件が更新されています。再取得してから保存してください。');
 var id=previous?previous.jobId:Utilities.getUuid(),now=new Date().toISOString(),plan={requests:[],result:{jobId:id}};
 intakeWritePlan_(store,plan,TEAM_JOB_TAB,TEAM_JOB_HEADERS,state,previous?previous.row:state.rows.length+2,[id,teamText_(payload.company,100,true),teamText_(payload.title,120,true),teamText_(payload.description,3000,false),teamText_(payload.requirements,2000,false),teamText_(payload.workConditions,2000,false),choice_(payload.status,TEAM_JOB_STATUSES),Utilities.getUuid(),previous?previous.createdBy:user.id,user.id,previous?previous.createdAt:now,now]);plan.teamAdminRequired=true;return plan;
}
function revalidateTeamPlan_(store,user,plan){if(plan.teamAdminRequired)requireAdmin_(activeActor_({players:readPlayers_(store.playerSheet)},user));if(plan.teamMentions)teamMentions_(plan.teamMentions,readPlayers_(store.playerSheet),false);}

function unpublishTeamForDeletedRecords_(store,user,plan,records){
 var state=teamCandidateTable_(store.book),ids=records.map(function(r){return r.recordId;}),now=new Date().toISOString();
 state.entries.filter(function(p){return p.published&&ids.indexOf(p.sourceRecordId)>=0;}).forEach(function(previous){
  actorOwns_(user,records.find(function(record){return record.recordId===previous.sourceRecordId;}));
  var next=Object.assign({},previous,{published:false,version:Utilities.getUuid(),updatedAt:now});
  intakeWritePlan_(store,plan,TEAM_CANDIDATE_TAB,TEAM_CANDIDATE_HEADERS,state,previous.row,teamCandidateValues_(next));
 });
}

/** Editor-only readiness check. Missing optional tables stay missing. The result
 * contains no names, source IDs, introduction text, comments, jobs or credentials. */
function verifyNodeTeamWorkspaceReadOnly(){
 requireOwner_();var config=config_();assertManagedBook_(config.spreadsheetId);
 var accounts=readAccountStore_(config),tabs=resolveBusinessTabs_(accounts.book);
 if(tabs.matchingSheetId!==Number(config.matchingSheetId)||tabs.kpiSheetId!==Number(config.kpiSheetId))fail_('SCHEMA_MISMATCH','接続先の業務タブと管理IDが一致しません。');
 var candidates=teamCandidateTable_(accounts.book),comments=teamCommentTable_(accounts.book),jobs=teamJobTable_(accounts.book),known=Object.create(null),publications=Object.create(null),commentIds=Object.create(null);
 accounts.players.forEach(function(player){known[player.id]=true;});candidates.entries.forEach(function(p){if(!known[p.ownerId])fail_('SCHEMA_MISMATCH','共有候補者の担当者が名簿にありません。');publications[p.publicationId]=p;});
 comments.entries.forEach(function(p){if(!known[p.authorId]||!publications[p.publicationId]||p.mentionIds.some(function(id){return !known[id];}))fail_('SCHEMA_MISMATCH','コメントの担当者・共有先・宛先を確認してください。');commentIds[p.commentId]=p;});
 comments.entries.forEach(function(p){if(p.parentId&&(!commentIds[p.parentId]||commentIds[p.parentId].publicationId!==p.publicationId))fail_('SCHEMA_MISMATCH','コメントの返信先が共有先と一致しません。');});
 jobs.entries.forEach(function(p){if(!known[p.createdBy]||!known[p.updatedBy])fail_('SCHEMA_MISMATCH','案件の更新者を名簿で確認してください。');});
 var result={verified:true,readOnly:true,managedCopy:true,originalProtected:true,schemaCompatible:true,accountsReadable:true,
  activeAccounts:accounts.players.filter(function(p){return p.active;}).length,activePlayers:accounts.players.filter(function(p){return p.active&&p.role==='player';}).length,activeAdmins:accounts.players.filter(function(p){return p.active&&p.role==='admin';}).length,
  tables:{candidates:{exists:!!candidates.sheet,count:candidates.entries.length},comments:{exists:!!comments.sheet,count:comments.entries.length},jobs:{exists:!!jobs.sheet,count:jobs.entries.length}},
  capabilities:{explicitPublication:true,ownerScopedSource:true,internalComments:true,adminManagedJobs:true,atomicSourceDeletion:true}};
 if(stableJson_(config_())!==stableJson_(config))fail_('BUSY','接続設定が確認中に更新されました。もう一度確認してください。');assertManagedBook_(accounts.book);requireOwner_();Logger.log(JSON.stringify(result));return result;
}

/** Admin archive is broader than the collaborative view only within this already
 * authorized export. Retain withdrawn threads; deleted comment prose is omitted. */
function teamWorkspaceExport_(store,user){
 requireAdmin_(user);var candidates=teamCandidateTable_(store.book),comments=teamCommentTable_(store.book),jobs=teamJobTable_(store.book),checks=[];
 [[TEAM_CANDIDATE_TAB,TEAM_CANDIDATE_HEADERS,candidates],[TEAM_COMMENT_TAB,TEAM_COMMENT_HEADERS,comments],[TEAM_JOB_TAB,TEAM_JOB_HEADERS,jobs]].forEach(function(item){var state=item[2];checks.push({title:item[0],headers:item[1],fingerprint:state.fingerprint,sheetId:state.sheet?state.sheet.getSheetId():null});});
 var data={feature:true,scope:'all-saved-internal-shares',deletedCommentBodiesRedacted:true,
  candidates:candidates.entries.map(function(p){return {publicationId:p.publicationId,ownerId:p.ownerId,sourceRecordId:p.sourceRecordId,sourceProfileId:p.sourceProfileId,sourceRowVersion:p.sourceRowVersion,sourceProfileVersion:p.sourceProfileVersion,candidateName:p.candidateName,introduction:p.introduction,published:p.published,version:p.version,createdAt:p.createdAt,updatedAt:p.updatedAt,publishedAt:p.publishedAt,canManage:true};}),
  comments:comments.entries.map(function(p){return {commentId:p.commentId,publicationId:p.publicationId,parentId:p.parentId,authorId:p.authorId,body:p.deleted?'':p.body,mentionIds:p.deleted?[]:p.mentionIds,deleted:p.deleted,version:p.version,createdAt:p.createdAt,updatedAt:p.updatedAt,canManage:true};}),
  jobs:jobs.entries.map(function(p){return {jobId:p.jobId,company:p.company,title:p.title,description:p.description,requirements:p.requirements,workConditions:p.workConditions,status:p.status,version:p.version,createdBy:p.createdBy,updatedBy:p.updatedBy,createdAt:p.createdAt,updatedAt:p.updatedAt};}),
  players:store.players.map(function(p){return {id:p.id,name:p.name,role:p.role,active:p.active};})};
 var cells=(candidates.rows.length+(candidates.sheet?1:0))*TEAM_CANDIDATE_HEADERS.length+(comments.rows.length+(comments.sheet?1:0))*TEAM_COMMENT_HEADERS.length+(jobs.rows.length+(jobs.sheet?1:0))*TEAM_JOB_HEADERS.length+store.players.length*4;
 return {data:data,cells:cells,checks:checks};
}

/* BEGIN GENERATED WORKFLOW FEATURES */
/* BEGIN MIGRATION WORKSPACE: admin-only archive; never auto-publishes source text. */
var MIGRATION_TAB='_NODE_migration_archive';
var MIGRATION_HEADERS=['id','sourceKey','workspace','channel','sourceId','sourceUrl','postedAt','author','body','candidateName','state','recordId','version','updatedAt','sourceThreadId','attachmentLinks'];
function migrationThread_(value,fromSheet){var thread=value===undefined?'':teamText_(value,40,false);if(thread&&!/^\d{9,12}\.\d{1,9}$/.test(thread))fail_(fromSheet?'SCHEMA_MISMATCH':'VALIDATION','返信先の投稿IDを確認してください。');return thread;}
function migrationAttachmentUrl_(value){
 if(typeof value!=='string')return null;var raw=value.trim();if(!raw||raw.length>2000||/[\s\u0000-\u001f\u007f]/.test(raw)||/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw))return null;
 var match=/^https:\/\/([a-z0-9.-]+(?::\d{1,5})?)([/?#][^\s]*)?$/i.exec(raw);if(!match||match[1].indexOf('..')>=0||match[1].charAt(0)==='.'||match[1].charAt(0)==='-')return null;
 var port=match[1].match(/:(\d+)$/);if(port&&(Number(port[1])<1||Number(port[1])>65535))return null;
 var segments=raw.split(/[?#]/).slice(1);for(var n=0;n<segments.length;n++){var pairs=segments[n].split('&');for(var j=0;j<pairs.length;j++){var key=pairs[j].split('=')[0].replace(/\+/g,' ');try{for(var i=0;i<3;i++){var next=decodeURIComponent(key);if(next===key)break;key=next;}}catch(error){return null;}key=key.toLowerCase().replace(/[^a-z0-9]/g,'');if(/token|apikey|authorization|password|passwd|secret|signature|credential|accesskey|oauth|bearer|resourcekey|session|jwt|ticket|saml|^sso$|^auth$|^key$|^sig$|^code$|^rlkey$/.test(key))return null;}}
 return 'https://'+match[1].toLowerCase()+(match[2]||'');
}
function migrationAttachmentLinks_(value,fromSheet){
 var links=value===undefined?[]:value,code=fromSheet?'SCHEMA_MISMATCH':'VALIDATION';if(fromSheet){try{if(typeof value!=='string')throw new Error('type');links=JSON.parse(value);}catch(error){fail_(code,'添付参照の保存形式を確認してください。');}}
 if(!Array.isArray(links)||links.length>20)fail_(code,'添付参照は20件以内で指定してください。');var seen={};return links.map(function(link){var safe=migrationAttachmentUrl_(link);if(!safe||seen[safe])fail_(code,'添付参照は秘密情報を含まないHTTPSリンクを重複なく指定してください。');seen[safe]=true;return safe;}).sort();
}
function migrationContent_(body,thread,links){return stableJson_([body,thread,links]);}
function migrationTable_(book){var state=intakeTable_(book,MIGRATION_TAB,MIGRATION_HEADERS),seen={},keys={};state.entries=state.rows.map(function(row,index){var id=teamId_(row[0]);if(seen[id])fail_('SCHEMA_MISMATCH','移行元IDが重複しています。');seen[id]=true;var e={id:id,sourceKey:teamText_(row[1],100,true),workspace:teamText_(row[2],100,true),channel:teamText_(row[3],100,true),sourceId:teamText_(row[4],12020,true),sourceUrl:teamText_(row[5],300,false),postedAt:teamText_(row[6],40,false),author:teamText_(row[7],100,false),body:teamText_(row[8],12000,true),candidateName:teamText_(row[9],60,false),state:choice_(row[10],['staged','imported','ignored']),recordId:teamText_(row[11],100,false),version:teamId_(row[12]),updatedAt:teamTime_(row[13]),sourceThreadId:migrationThread_(row[14]||'',true),attachmentLinks:migrationAttachmentLinks_(row[15]||'[]',true),row:index+2};if(keys[e.sourceKey]||e.sourceKey!==hash_(stableJson_([e.workspace,e.channel,e.sourceId])))fail_('SCHEMA_MISMATCH','移行元の投稿キーが重複または変更されています。');keys[e.sourceKey]=true;return e;});return state;}
function migrationValues_(e){return [e.id,e.sourceKey,e.workspace,e.channel,e.sourceId,e.sourceUrl,e.postedAt,e.author,e.body,e.candidateName,e.state,e.recordId,e.version,e.updatedAt,e.sourceThreadId||'',JSON.stringify(e.attachmentLinks||[])];}
function readMigrationArchive_(request){var accounts=readAccountStore_(),user=activeActor_(accounts,authenticate_(request.token));requireAdmin_(user);var state=migrationTable_(accounts.book),cursor=request.payload&&request.payload.cursor!==undefined?request.payload.cursor:0;if(!Number.isSafeInteger(cursor)||cursor<0||cursor>50000)fail_('VALIDATION','表示位置を確認してください。');var entries=state.entries.slice().reverse(),result={feature:true,total:entries.length,entries:entries.slice(cursor,cursor+50).map(function(e){var x=Object.assign({},e);delete x.row;delete x.sourceKey;return x;}),nextCursor:cursor+50<entries.length?cursor+50:null};requireAdmin_(snapshotActor_(accounts,request.token));return result;}
function planMigrationBatch_(store,user,payload){requireAdmin_(user);teamObject_(payload);if(!Array.isArray(payload.entries)||!payload.entries.length||payload.entries.length>10||JSON.stringify(payload.entries).length>24000)fail_('VALIDATION','原文は10件・24,000文字以内に分けて取り込んでください。');var state=migrationTable_(store.book),plan={requests:[],result:{staged:0,duplicates:0},teamAdminRequired:true},row=state.rows.length+2,seen={};
 payload.entries.forEach(function(raw){teamObject_(raw);var workspace=teamText_(raw.workspace,100,true),channel=teamText_(raw.channel,100,true),sourceId=teamText_(raw.sourceId,12020,true),body=teamText_(raw.body,12000,true),thread=migrationThread_(raw.sourceThreadId,false),links=migrationAttachmentLinks_(raw.attachmentLinks,false),content=migrationContent_(body,thread,links),key=hash_(stableJson_([workspace,channel,sourceId]));if(Object.prototype.hasOwnProperty.call(seen,key)){if(seen[key]!==content)fail_('CONFLICT','同じ投稿IDに異なる原文・返信先・添付参照があります。保存する版を確認してください。');plan.result.duplicates++;return;}seen[key]=content;var previous=state.entries.find(function(e){return e.sourceKey===key;});if(previous){if(migrationContent_(previous.body,previous.sourceThreadId,previous.attachmentLinks)!==content)fail_('CONFLICT','同じ投稿IDの原文・返信先・添付参照が変更されています。既存原文を確認して、別の版として取り込んでください。');plan.result.duplicates++;return;}
 var url=teamText_(raw.sourceUrl,300,false);if(url&&!/^https:\/\/[a-z0-9-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+$/.test(url))fail_('VALIDATION','Slackの投稿リンクを確認してください。');var posted=teamText_(raw.postedAt,40,false);if(posted)teamTime_(posted);var item={id:Utilities.getUuid(),sourceKey:key,workspace:workspace,channel:channel,sourceId:sourceId,sourceUrl:url,postedAt:posted,author:teamText_(raw.author,100,false),body:body,candidateName:teamText_(raw.candidateName,60,false),state:'staged',recordId:'',version:Utilities.getUuid(),updatedAt:new Date().toISOString(),sourceThreadId:thread,attachmentLinks:links};intakeWritePlan_(store,plan,MIGRATION_TAB,MIGRATION_HEADERS,state,row++,migrationValues_(item));plan.result.staged++;});return plan;}
function planApplyMigration_(store,user,payload){requireAdmin_(user);var state=migrationTable_(store.book),e=state.entries.find(function(item){return item.id===payload.id;});if(!e||e.version!==payload.version)fail_('CONFLICT','移行元が更新されています。再取得してください。');if(e.state==='imported')fail_('VALIDATION','この原文は登録済みです。候補者の一覧から確認してください。');var plan;
 if(payload.mode==='ignore'){plan={requests:[],result:{ignored:true}};e=Object.assign({},e,{state:'ignored'});}
 else if(payload.mode==='candidate'){
  if(payload.confirmReviewed!==true)fail_('VALIDATION','担当者・候補者名・紹介文を確認してください。');
  var introduction=teamText_(payload.introduction,1000,true),owner=store.players.find(function(p){return p.id===payload.playerId&&p.active&&p.role==='player';});if(!owner)fail_('VALIDATION','担当者を指定してください。');
  if(store.records.some(function(r){return r.playerId===owner.id&&normalizeName_(r.values[2])===normalizeName_(payload.candidateName);}))fail_('POSSIBLE_DUPLICATE','同じ担当者・氏名の記録があります。候補者一覧で確認してください。原文は保管されています。');
  plan=planCandidate_(store,user,{playerId:owner.id,candidateName:payload.candidateName,position:'アポインター',fields:interviewFields_(payload.fields||{}),introduction:introduction,profileVersion:''});e=Object.assign({},e,{state:'imported',recordId:plan.recordId||plan.result&&plan.result.recordId||''});
 }else if(payload.mode==='job'){
  if(payload.confirmReviewed!==true||payload.confirmInternalSharing!==true)fail_('VALIDATION','案件の内容と、社内全員への共有を確認してください。');
  plan=planTeamJob_(store,user,payload.job||{});e=Object.assign({},e,{state:'imported',recordId:plan.result.jobId||''});
 }else fail_('VALIDATION','移行する種類を選んでください。');
 plan.teamAdminRequired=true;e.version=Utilities.getUuid();e.updatedAt=new Date().toISOString();intakeWritePlan_(store,plan,MIGRATION_TAB,MIGRATION_HEADERS,state,e.row,migrationValues_(e));plan.result=Object.assign({},plan.result,{migrationId:e.id});return plan;
}
/* END MIGRATION WORKSPACE */

/* BEGIN REWARDS WORKSPACE — integrated into Code.gs by the release build. */
var REWARD_SETTINGS_TAB='_NODE_reward_settings',REWARD_SETTINGS_HEADERS=['id','payload','version','updatedAt','actorId'];
var REWARD_LEDGER_TAB='_NODE_reward_ledger',REWARD_LEDGER_HEADERS=['entryId','playerId','delta','kind','reference','reason','actorId','createdAt'];
var REWARD_REQUESTS_TAB='_NODE_reward_requests',REWARD_REQUESTS_HEADERS=['requestId','playerId','rewardId','rewardName','points','status','version','createdAt','updatedAt','decidedBy','decisionNote'];
var REWARD_METRICS=['候補者面談','提案','C面談予約','クライアント面談','内定承諾','稼働開始'];
function rewardMonth_(value){if(typeof value!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value))fail_('VALIDATION','ポイントの年月を確認してください。');return value;}
function rewardInteger_(value,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)fail_('VALIDATION','ポイントは指定された範囲の整数で入力してください。');return value;}
function rewardPolicyBody_(value){writingObject_(value,['enabled','metric','pointsPerWin','tiePolicy','effectiveMonth']);if(typeof value.enabled!=='boolean')fail_('VALIDATION','制度の開始状態を確認してください。');return {enabled:value.enabled,metric:choice_(value.metric,REWARD_METRICS),pointsPerWin:rewardInteger_(value.pointsPerWin,1,10000),tiePolicy:choice_(value.tiePolicy,['all','hold']),effectiveMonth:rewardMonth_(value.effectiveMonth)};}
function rewardInitialPolicy_(){return {enabled:false,metric:'提案',pointsPerWin:100,tiePolicy:'all',effectiveMonth:today_().slice(0,7),version:'initial-policy-00000000'};}
function rewardState_(book){
 var settings=intakeTable_(book,REWARD_SETTINGS_TAB,REWARD_SETTINGS_HEADERS),ledger=intakeTable_(book,REWARD_LEDGER_TAB,REWARD_LEDGER_HEADERS),requests=intakeTable_(book,REWARD_REQUESTS_TAB,REWARD_REQUESTS_HEADERS),seen=Object.create(null);
 settings.entries=settings.rows.map(function(row,index){var id=String(row[0]||''),body;try{body=JSON.parse(row[1]);}catch(_){fail_('SCHEMA_MISMATCH','ポイント設定の本文を確認してください。');}if(seen[id]||!(/^(policy|catalog:[A-Za-z0-9_-]{16,128}|month:20\d{2}-(0[1-9]|1[0-2]))$/).test(id))fail_('SCHEMA_MISMATCH','ポイント設定のIDを確認してください。');seen[id]=true;teamId_(row[2]);teamTime_(row[3]);teamAccount_(row[4]);
  if(id==='policy')body=rewardPolicyBody_(body);
  else if(id.indexOf('catalog:')===0){writingObject_(body,['name','points','active']);if(typeof body.active!=='boolean')fail_('SCHEMA_MISMATCH','特典の状態を確認してください。');body={name:teamText_(body.name,80,true),points:rewardInteger_(body.points,1,1000000),active:body.active};}
  else {writingObject_(body,['month','awards','policy']);rewardMonth_(body.month);if(id!=='month:'+body.month||!Array.isArray(body.awards)||body.awards.length>1000)fail_('SCHEMA_MISMATCH','月別ポイントを確認してください。');var ids=Object.create(null);body.awards=body.awards.map(function(a){writingObject_(a,['playerId','points','count']);var owner=teamAccount_(a.playerId);if(ids[owner])fail_('SCHEMA_MISMATCH','月別ポイントの対象者が重複しています。');ids[owner]=true;return {playerId:owner,points:rewardInteger_(a.points,1,10000),count:rewardInteger_(a.count,1,1000000)};});body.policy=rewardPolicyBody_(body.policy);}
  return {id:id,body:body,version:row[2],updatedAt:row[3],actorId:row[4],row:index+2};
 });
 seen=Object.create(null);ledger.entries=ledger.rows.map(function(row,index){var id=teamId_(row[0]);if(seen[id])fail_('SCHEMA_MISMATCH','ポイント台帳のIDが重複しています。');seen[id]=true;return {entryId:id,playerId:teamAccount_(row[1]),delta:rewardInteger_(row[2],-100000000,100000000),kind:choice_(row[3],['award','correction','adjustment','redemption']),reference:teamText_(row[4],128,true),reason:teamText_(row[5],300,true),actorId:teamAccount_(row[6]),createdAt:teamTime_(row[7]),row:index+2};});
 seen=Object.create(null);requests.entries=requests.rows.map(function(row,index){var id=teamId_(row[0]);if(seen[id])fail_('SCHEMA_MISMATCH','特典申請のIDが重複しています。');seen[id]=true;return {requestId:id,playerId:teamAccount_(row[1]),rewardId:teamId_(row[2]),rewardName:teamText_(row[3],80,true),points:rewardInteger_(row[4],1,1000000),status:choice_(row[5],['pending','approved','rejected','canceled']),version:teamId_(row[6]),createdAt:teamTime_(row[7]),updatedAt:teamTime_(row[8]),decidedBy:row[9]?teamAccount_(row[9]):'',decisionNote:teamText_(row[10],300,false),row:index+2};});
 var policy=settings.entries.find(function(p){return p.id==='policy';}),state={settings:settings,ledger:ledger,requests:requests,policy:policy?Object.assign({},policy.body,{version:policy.version}):rewardInitialPolicy_()};state.version=hash_(stableJson_([settings.fingerprint,ledger.fingerprint,requests.fingerprint]));rewardIntegrity_(state);return state;
}
function rewardIntegrity_(state){
 var settled=Object.create(null),redemptions=Object.create(null);state.settings.entries.filter(function(s){return s.id.indexOf('month:')===0;}).forEach(function(s){var expected=Object.create(null);s.body.awards.forEach(function(a){expected[a.playerId]=a.points;});settled[s.id]={expected:expected,actual:Object.create(null)};});
 state.ledger.entries.forEach(function(e){if(e.delta===0||e.kind==='award'&&e.delta<0||e.kind==='redemption'&&e.delta>0)fail_('SCHEMA_MISMATCH','ポイント台帳の増減を確認してください。');if(e.kind==='award'||e.kind==='correction'){var target=settled[e.reference];if(!target)fail_('SCHEMA_MISMATCH','月別確定と台帳が一致しません。');target.actual[e.playerId]=(target.actual[e.playerId]||0)+e.delta;}if(e.kind==='redemption'){var request=state.requests.entries.find(function(r){return r.requestId===e.reference;});if(!request||request.status!=='approved'||request.playerId!==e.playerId||e.delta!==-request.points||redemptions[e.reference])fail_('SCHEMA_MISMATCH','特典交換と消費台帳が一致しません。');redemptions[e.reference]=true;}});
 Object.keys(settled).forEach(function(key){var target=settled[key],ids=Object.create(null);Object.keys(target.expected).concat(Object.keys(target.actual)).forEach(function(id){ids[id]=true;});if(Object.keys(ids).some(function(id){return (target.expected[id]||0)!==(target.actual[id]||0);}))fail_('SCHEMA_MISMATCH','月別確定とポイント台帳の合計が一致しません。');});state.requests.entries.forEach(function(r){if(r.status==='approved'&&!redemptions[r.requestId])fail_('SCHEMA_MISMATCH','承認済み申請の消費台帳がありません。');});
}
function rewardBalances_(state,players){
 var ids=Object.create(null);players.filter(function(p){return p.role==='player';}).forEach(function(p){ids[p.id]={playerId:p.id,name:p.name,active:p.active,balance:0,reserved:0,available:0};});
 state.ledger.entries.forEach(function(e){if(!ids[e.playerId])fail_('SCHEMA_MISMATCH','ポイント台帳の担当者が名簿にありません。');ids[e.playerId].balance+=e.delta;});state.requests.entries.filter(function(r){return r.status==='pending';}).forEach(function(r){if(!ids[r.playerId])fail_('SCHEMA_MISMATCH','特典申請の担当者が名簿にありません。');ids[r.playerId].reserved+=r.points;});
 return Object.keys(ids).map(function(id){var p=ids[id];p.available=p.balance-p.reserved;if(!Number.isSafeInteger(p.balance)||p.balance>100000000||p.available<0)fail_('SCHEMA_MISMATCH','ポイント残高と申請予約の整合性を確認してください。');return p;});
}
function rewardPublic_(state,user,players){var canSee=function(id){return user.role==='admin'||user.id===id;};return {feature:true,version:state.version,policy:state.policy,catalog:state.settings.entries.filter(function(p){return p.id.indexOf('catalog:')===0&&(user.role==='admin'||p.body.active);}).map(function(p){return Object.assign({id:p.id.slice(8),version:p.version},p.body);}),balances:rewardBalances_(state,players).filter(function(p){return canSee(p.playerId);}),ledger:state.ledger.entries.filter(function(e){return canSee(e.playerId);}).map(function(e){var p=Object.assign({},e);delete p.row;return p;}),requests:state.requests.entries.filter(function(e){return canSee(e.playerId);}).map(function(e){var p=Object.assign({},e);delete p.row;return p;}),months:user.role==='admin'?state.settings.entries.filter(function(p){return p.id.indexOf('month:')===0;}).map(function(p){return Object.assign({version:p.version,updatedAt:p.updatedAt,actorId:p.actorId},p.body);}):[]};}
function rewardPolicyWithoutVersion_(policy){var body=Object.assign({},policy);delete body.version;return body;}
function rewardPreview_(store,state,month){
 rewardMonth_(month);if(month>=today_().slice(0,7))fail_('VALIDATION','ポイントを確定できるのは終了した月だけです。');var existing=state.settings.entries.find(function(p){return p.id==='month:'+month;}),policy=existing?existing.body.policy:rewardPolicyWithoutVersion_(state.policy);
 if(month<policy.effectiveMonth)fail_('VALIDATION','制度の開始月より前の実績は確定できません。');var counts=countActivities_(activities_(store),store.players),eligible=store.players.filter(function(p){return p.role==='player';}).map(function(p){return {id:p.id,count:counts[month]&&counts[month][p.id]?counts[month][p.id][policy.metric]||0:0};}),top=Math.max.apply(null,[0].concat(eligible.map(function(p){return p.count;}))),winners=eligible.filter(function(p){return p.count===top&&top>0;}),awards=policy.tiePolicy==='hold'&&winners.length>1?[]:winners.map(function(p){return {playerId:p.id,points:policy.pointsPerWin,count:p.count};});
 if(awards.length>1000)fail_('VALIDATION','対象者の上限を超えています。');awards.sort(function(a,b){return a.playerId.localeCompare(b.playerId);});var old=existing?existing.body.awards:[],ids=Object.create(null);old.concat(awards).forEach(function(p){ids[p.playerId]=true;});var changes=Object.keys(ids).sort().map(function(id){var before=old.find(function(p){return p.playerId===id;}),after=awards.find(function(p){return p.playerId===id;});return {playerId:id,delta:(after?after.points:0)-(before?before.points:0)};}).filter(function(p){return p.delta!==0;});
 return {month:month,topCount:top,awards:awards,changes:changes,alreadySettled:!!existing,policy:policy,fingerprint:hash_(stableJson_([month,policy,eligible,state.version]))};
}
function readRewards_(request){var session=authenticate_(request.token,false,request.background===true),accounts=readAccountStore_(),user=activeActor_(accounts,session),state=rewardState_(accounts.book),result=rewardPublic_(state,user,accounts.players);if(request.payload&&request.payload.month){requireAdmin_(user);result.preview=rewardPreview_(readStore_({readOnly:true},accounts),state,request.payload.month);}if(rewardState_(accounts.book).version!==state.version)fail_('BUSY','ポイント情報が更新されました。もう一度取得してください。');snapshotActor_(accounts,request.token);return result;}
function rewardTrack_(plan,state){[[REWARD_SETTINGS_TAB,REWARD_SETTINGS_HEADERS,state.settings],[REWARD_LEDGER_TAB,REWARD_LEDGER_HEADERS,state.ledger],[REWARD_REQUESTS_TAB,REWARD_REQUESTS_HEADERS,state.requests]].forEach(function(v){teamTableCheck_(plan,v[0],v[1],v[2]);});}
function rewardWrite_(store,plan,title,headers,state,row,values){
 var sheets=plan.rewardSheets||(plan.rewardSheets={}),write=sheets[title];if(!write){var id=state.sheet?state.sheet.getSheetId():null;if(!id){do{id=Math.floor(Math.random()*1000000000)+1;}while(store.book.getSheets().some(function(s){return s.getSheetId()===id;})||Object.keys(sheets).some(function(k){return sheets[k].id===id;}));plan.requests.push({addSheet:{properties:{sheetId:id,title:title,gridProperties:{rowCount:5001,columnCount:headers.length}}}});plan.requests.push(rowUpdateRequest_(id,1,headers));}write=sheets[title]={id:id,next:state.rows.length+2,maxRows:state.sheet?state.sheet.getMaxRows():5001};}
 var target=row||write.next++;if(target>5001)fail_('INTAKE_LIMIT','ポイント台帳の上限です。管理者に確認してください。');if(target>write.maxRows){plan.requests.push({appendDimension:{sheetId:write.id,dimension:'ROWS',length:target-write.maxRows}});write.maxRows=target;}plan.requests.push(rowUpdateRequest_(write.id,target,values));
}
function rewardLedger_(store,state,plan,playerId,delta,kind,reference,reason,user,now){rewardWrite_(store,plan,REWARD_LEDGER_TAB,REWARD_LEDGER_HEADERS,state.ledger,null,[Utilities.getUuid(),playerId,delta,kind,reference,reason,user.id,now]);}
function planRewards_(store,user,payload){
 writingObject_(payload,['command','expectedVersion','policy','item','month','fingerprint','reason','playerId','delta','rewardId','requestId','decision','note']);var state=rewardState_(store.book);if(payload.expectedVersion!==state.version)fail_('CONFLICT','ポイント情報が更新されています。入力を控え、最新の内容と比較してください。');var command=choice_(payload.command,['policy','catalog','settle','adjust','request','review']),now=new Date().toISOString(),plan={requests:[],result:{command:command}},balances=rewardBalances_(state,store.players);rewardTrack_(plan,state);
 if(['policy','catalog','settle','adjust'].indexOf(command)>=0){requireAdmin_(user);plan.teamAdminRequired=true;}
 if(command==='policy'){
  var policy=rewardPolicyBody_(payload.policy),old=state.settings.entries.find(function(p){return p.id==='policy';});rewardWrite_(store,plan,REWARD_SETTINGS_TAB,REWARD_SETTINGS_HEADERS,state.settings,old?old.row:null,['policy',JSON.stringify(policy),Utilities.getUuid(),now,user.id]);
 }
 if(command==='catalog'){
  writingObject_(payload.item,['id','name','points','active']);var item=payload.item;if(typeof item.active!=='boolean')fail_('VALIDATION','特典の利用状態を確認してください。');var id=item.id?teamId_(item.id):Utilities.getUuid(),old=state.settings.entries.find(function(p){return p.id==='catalog:'+id;});if(item.id&&!old)fail_('NOT_FOUND','特典が見つかりません。');var body={name:teamText_(item.name,80,true),points:rewardInteger_(item.points,1,1000000),active:item.active};rewardWrite_(store,plan,REWARD_SETTINGS_TAB,REWARD_SETTINGS_HEADERS,state.settings,old?old.row:null,['catalog:'+id,JSON.stringify(body),Utilities.getUuid(),now,user.id]);plan.result.rewardId=id;
 }
 if(command==='settle'){
  if(!state.policy.enabled)fail_('VALIDATION','制度を開始してから月を確定してください。');var preview=rewardPreview_(store,state,payload.month);if(payload.fingerprint!==preview.fingerprint)fail_('CONFLICT','実績がプレビュー後に更新されています。再確認してください。');var reason=teamText_(payload.reason,300,true),previous=state.settings.entries.find(function(p){return p.id==='month:'+preview.month;});if(previous&&!preview.changes.length)fail_('VALIDATION','確定済みで、ポイントの変更はありません。');preview.changes.forEach(function(change){var b=balances.find(function(p){return p.playerId===change.playerId;});if(!b||b.available+change.delta<0||b.balance+change.delta>100000000)fail_('INSUFFICIENT_POINTS','訂正で利用可能残高がマイナスになります。先に交換予約や付与内容を確認してください。');rewardLedger_(store,state,plan,change.playerId,change.delta,previous?'correction':'award','month:'+preview.month,reason,user,now);});var body={month:preview.month,awards:preview.awards,policy:preview.policy};rewardWrite_(store,plan,REWARD_SETTINGS_TAB,REWARD_SETTINGS_HEADERS,state.settings,previous?previous.row:null,['month:'+preview.month,JSON.stringify(body),Utilities.getUuid(),now,user.id]);plan.result.month=preview.month;plan.result.changes=preview.changes;plan.rewardSettlementCheck={month:preview.month,fingerprint:preview.fingerprint};
 }
 if(command==='adjust'){
  var player=store.players.find(function(p){return p.id===payload.playerId&&p.role==='player';});if(!player)fail_('VALIDATION','対象プレイヤーを確認してください。');var delta=rewardInteger_(payload.delta,-1000000,1000000),reason=teamText_(payload.reason,300,true),balance=balances.find(function(p){return p.playerId===player.id;});if(!delta)fail_('VALIDATION','訂正ポイントは0以外にしてください。');if(balance.available+delta<0||balance.balance+delta>100000000)fail_('INSUFFICIENT_POINTS','訂正後の利用可能残高を確認してください。');rewardLedger_(store,state,plan,player.id,delta,'adjustment',Utilities.getUuid(),reason,user,now);
 }
 if(command==='request'){
  if(user.role!=='player'||!state.policy.enabled||state.policy.effectiveMonth>today_().slice(0,7))fail_('FORBIDDEN','制度が開始済みのプレイヤーだけ交換を申請できます。');var reward=state.settings.entries.find(function(p){return p.id==='catalog:'+payload.rewardId&&p.body.active;}),balance=balances.find(function(p){return p.playerId===user.id;});if(!reward)fail_('VALIDATION','利用できる特典を選択してください。');if(state.requests.entries.some(function(r){return r.playerId===user.id&&r.rewardId===payload.rewardId&&r.status==='pending';}))fail_('VALIDATION','同じ特典の承認待ち申請があります。申請一覧を確認してください。');if(!balance||balance.available<reward.body.points)fail_('INSUFFICIENT_POINTS','利用可能なポイントが不足しています。');var id=Utilities.getUuid();rewardWrite_(store,plan,REWARD_REQUESTS_TAB,REWARD_REQUESTS_HEADERS,state.requests,null,[id,user.id,reward.id.slice(8),reward.body.name,reward.body.points,'pending',Utilities.getUuid(),now,now,'','']);plan.result.requestId=id;
 }
 if(command==='review'){
  var request=state.requests.entries.find(function(p){return p.requestId===payload.requestId;}),decision=choice_(payload.decision,['approve','reject','cancel']),note=teamText_(payload.note,300,decision!=='cancel');if(!request||request.status!=='pending')fail_('CONFLICT','この交換申請は処理済み、または存在しません。');if(decision==='cancel'){if(user.role!=='admin'&&request.playerId!==user.id)fail_('FORBIDDEN','本人だけが交換申請を取り消せます。');}else{requireAdmin_(user);plan.teamAdminRequired=true;}var status=decision==='approve'?'approved':decision==='reject'?'rejected':'canceled';if(decision==='approve')rewardLedger_(store,state,plan,request.playerId,-request.points,'redemption',request.requestId,note,user,now);rewardWrite_(store,plan,REWARD_REQUESTS_TAB,REWARD_REQUESTS_HEADERS,state.requests,request.row,[request.requestId,request.playerId,request.rewardId,request.rewardName,request.points,status,Utilities.getUuid(),request.createdAt,now,user.id,note]);plan.result.requestId=request.requestId;
 }
 return plan;
}
function revalidateRewardsPlan_(store,user,plan){if(plan.rewardSettlementCheck){requireAdmin_(user);var latest=readStore_({readOnly:true},{config:store.config,book:store.book,playerSheet:store.playerSheet,players:readPlayers_(store.playerSheet)}),state=rewardState_(latest.book);if(rewardPreview_(latest,state,plan.rewardSettlementCheck.month).fingerprint!==plan.rewardSettlementCheck.fingerprint)fail_('CONFLICT','保存前に月の実績が変わりました。最新のプレビューで確認してください。');}}
/* END REWARDS WORKSPACE */

/* Firestore persistence facade. Authentication and business validation remain in Code.gs.
 * No Sheets fallback: every app write and its operation receipt share one Firestore transaction.
 * Schema v1: nodeWorkbooks/{namespace}, tables/{sheetId}, rows/{8-digit row}; row payloads
 * are JSON strings to preserve Sheets cell metadata and nested arrays without executable code. */
var NODE_FIRESTORE_REQUEST_=null;
function firestoreReset_(write){firestoreClose_();NODE_FIRESTORE_REQUEST_={write:write===true,book:null};}
function firestoreResetRequest_(write){firestoreReset_(write);}
function firestoreEnabled_(){var value=props_().getProperty('NODE_STORAGE_PROVIDER');if(value&&value!=='sheets'&&value!=='firestore')fail_('NOT_CONFIGURED','保存先の設定を確認してください。');return value==='firestore';}
function firestoreConfig_(){var raw=props_().getProperty('NODE_FIRESTORE_CONFIG'),value;try{value=JSON.parse(raw||'null');}catch(_){fail_('NOT_CONFIGURED','Firebaseの接続設定を確認してください。');}return firestoreValidateConfig_(value);}
function firestoreValidateConfig_(value){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(function(k){return ['projectId','databaseId','workbookId'].indexOf(k)<0;})||typeof value.projectId!=='string'||!(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/).test(value.projectId)||typeof value.databaseId!=='string'||!(value.databaseId==='(default)'||/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(value.databaseId))||typeof value.workbookId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value.workbookId))fail_('NOT_CONFIGURED','Firebaseのプロジェクト・データベース・移行先IDを確認してください。');return {projectId:value.projectId,databaseId:value.databaseId,workbookId:value.workbookId};}
function firestoreDocumentName_(config,path){config=firestoreValidateConfig_(config);if(typeof path!=='string'||!path||path.length>1500||!/^[-A-Za-z0-9_/]+$/.test(path)||path.split('/').some(function(p){return !p||p==='.'||p==='..';}))fail_('VALIDATION','Firebaseの保存位置を確認してください。');return 'projects/'+config.projectId+'/databases/'+config.databaseId+'/documents/'+path;}
function firestoreRequest_(method,path,payload,override){var config=firestoreValidateConfig_(override||firestoreConfig_());if(['get','post','patch','delete'].indexOf(String(method).toLowerCase())<0||typeof path!=='string'||path.length>5000||/[\s\u0000-\u001f\u007f#]/.test(path)||path.indexOf('..')>=0||path.indexOf('://')>=0||!/^[-A-Za-z0-9_/:?=&%().]+$/.test(path))fail_('VALIDATION','Firebaseへの操作を確認してください。');var url='https://firestore.googleapis.com/v1/projects/'+config.projectId+'/databases/'+encodeURIComponent(config.databaseId)+'/documents'+(path.charAt(0)===':'?path:'/'+path),options={method:String(method).toLowerCase(),headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true};if(payload!==undefined){options.contentType='application/json';options.payload=JSON.stringify(payload);if(firestoreBytes_(options.payload)>9500000)fail_('DATA_LIMIT','一度に保存するデータが大きすぎます。');}var response,text,status;try{response=UrlFetchApp.fetch(url,options);status=response.getResponseCode();text=response.getContentText();}catch(_){fail_('INTERNAL','Firebaseからの応答を確認できませんでした。同じ保存IDで確認してください。');}if(typeof text!=='string'||firestoreBytes_(text)>12000000)fail_('INTERNAL','Firebaseの応答を確認できませんでした。入力は保持しています。');if(status===404)return null;if(status<200||status>=300){if(status===409||status===412)fail_('CONFLICT','データが更新されています。再取得してから確認してください。');if(status===401||status===403)fail_('FIRESTORE_ACCESS_DENIED','Firebaseへのアクセス権を確認してください。');if(status===429)fail_('RATE_LIMITED','Firebaseの利用上限に達しました。時間をおいて同じ保存IDで確認してください。');if(status>=500||status===408)fail_('INTERNAL','Firebaseの保存結果を確認できませんでした。同じ保存IDで確認してください。');fail_('FIRESTORE_REQUEST_FAILED','Firebaseへの操作を完了できませんでした。管理者に連絡してください。');}if(!text)return {};try{return JSON.parse(text);}catch(_){fail_('INTERNAL','Firebaseから正しい応答が返りませんでした。同じ保存IDで確認してください。');}}
function firestoreBytes_(text){var n=0;for(var i=0;i<text.length;i++){var c=text.charCodeAt(i);n+=c<128?1:c<2048?2:c>=55296&&c<=56319&&i+1<text.length&&text.charCodeAt(i+1)>=56320&&text.charCodeAt(i+1)<=57343?(i++,4):3;}return n;}
function firestoreEncodeFields_(object){if(!object||typeof object!=='object'||Array.isArray(object))fail_('VALIDATION','Firebaseの保存形式を確認してください。');var out={};Object.keys(object).forEach(function(k){if(k==='__proto__'||k==='constructor'||k==='prototype')fail_('VALIDATION','Firebaseの項目名を確認してください。');out[k]=firestoreEncodeValue_(object[k]);});return out;}
function firestoreEncodeValue_(value){if(value===null)return {nullValue:null};if(typeof value==='string')return {stringValue:value};if(typeof value==='boolean')return {booleanValue:value};if(typeof value==='number'&&isFinite(value))return Number.isSafeInteger(value)?{integerValue:String(value)}:{doubleValue:value};if(Array.isArray(value))return {arrayValue:{values:value.map(firestoreEncodeValue_)}};if(value&&typeof value==='object'&&Object.prototype.toString.call(value)==='[object Object]')return {mapValue:{fields:firestoreEncodeFields_(value)}};fail_('VALIDATION','Firebaseに保存できない値です。');}
function firestoreDecodeFields_(fields){if(!fields||typeof fields!=='object'||Array.isArray(fields))fail_('SCHEMA_MISMATCH','Firebaseの保存形式を確認してください。');var out={};Object.keys(fields).forEach(function(k){if(k==='__proto__'||k==='constructor'||k==='prototype')fail_('SCHEMA_MISMATCH','Firebaseの保存項目を確認してください。');out[k]=firestoreDecodeValue_(fields[k]);});return out;}
function firestoreDecodeValue_(value){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1)fail_('SCHEMA_MISMATCH','Firebaseの保存値を確認してください。');if(Object.prototype.hasOwnProperty.call(value,'nullValue'))return null;if(typeof value.stringValue==='string')return value.stringValue;if(typeof value.booleanValue==='boolean')return value.booleanValue;if(Object.prototype.hasOwnProperty.call(value,'integerValue')){var n=Number(value.integerValue);if(Number.isSafeInteger(n))return n;}if(typeof value.doubleValue==='number'&&isFinite(value.doubleValue))return value.doubleValue;if(value.arrayValue&&typeof value.arrayValue==='object')return (value.arrayValue.values||[]).map(firestoreDecodeValue_);if(value.mapValue&&typeof value.mapValue==='object')return firestoreDecodeFields_(value.mapValue.fields||{});fail_('SCHEMA_MISMATCH','Firebaseの保存値の種類を確認してください。');}
function firestoreClone_(v){return JSON.parse(JSON.stringify(v));}
function firestorePath_(book,tail){return 'nodeWorkbooks/'+book.storage.workbookId+(tail?'/'+tail:'');}
function firestoreTime_(document){if(!document||typeof document.updateTime!=='string'||!/^\d{4}-\d\d-\d\dT/.test(document.updateTime)||!isFinite(Date.parse(document.updateTime)))fail_('SCHEMA_MISMATCH','Firebaseの更新時刻を確認してください。');return document.updateTime;}
function firestoreReadDocument_(book,path,outside){var name=firestoreDocumentName_(book.storage,path),d;if(outside)return firestoreRequest_('get',path,undefined,book.storage);var result=firestoreRequest_('post',':batchGet',{documents:[name],transaction:book.transaction},book.storage);if(!Array.isArray(result)||result.length!==1||!result[0]||result[0].found&&result[0].missing||!result[0].found&&!result[0].missing||(result[0].found?result[0].found.name:result[0].missing)!==name)fail_('FIRESTORE_READ_FAILED','Firebaseの文書を確認できませんでした。');d=result[0].found||null;book.proofs[name]=d?firestoreTime_(d):null;return d;}
function firestoreLoadedBook_(){return NODE_FIRESTORE_REQUEST_&&NODE_FIRESTORE_REQUEST_.book||null;}
function firestoreCommitted_(){return !!(NODE_FIRESTORE_REQUEST_&&NODE_FIRESTORE_REQUEST_.committed);}
function firestoreOpenBook_(config){if(!firestoreEnabled_())fail_('NOT_CONFIGURED','Firebase保存が有効ではありません。');if(!NODE_FIRESTORE_REQUEST_)firestoreReset_(false);var storage=firestoreConfig_(),cached=firestoreLoadedBook_();if(cached){if(stableJson_(cached.storage)!==stableJson_(storage)||cached.sourceId!==config.spreadsheetId)fail_('BUSY','保存先の設定が変更されました。');return cached;}var begin=firestoreRequest_('post',':beginTransaction',{options:NODE_FIRESTORE_REQUEST_.write?{readWrite:{}}:{readOnly:{}}},storage);if(!begin||typeof begin.transaction!=='string'||!begin.transaction||begin.transaction.length>4000)fail_('FIRESTORE_READ_FAILED','Firebaseの読込を開始できませんでした。');var book={storage:storage,transaction:begin.transaction,write:NODE_FIRESTORE_REQUEST_.write,sourceId:config.spreadsheetId,tables:{},rows:{},intervals:{},metadataLoaded:{},proofs:{}};NODE_FIRESTORE_REQUEST_.book=book;var document=firestoreReadDocument_(book,firestorePath_(book));if(!document)fail_('NOT_CONFIGURED','Firebaseへの移行が完了していません。');book.updateTime=firestoreTime_(document);book.manifest=firestoreDecodeFields_(document.fields||{});book._firestoreManifest=book.manifest;book._firestoreUpdateTime=book.updateTime;var m=book.manifest;if(m.schemaVersion!==1||!Number.isSafeInteger(m.revision)||m.revision<0||m.sourceSpreadsheetId!==config.spreadsheetId||typeof m.sourceConfigHash!=='string'||!m.sourceConfigHash||typeof m.title!=='string'||m.timeZone!=='Asia/Tokyo'||!m.migrationProof||m.migrationProof.state!=='active'||!Number.isSafeInteger(m.nextMetadataId)||m.nextMetadataId<1||!Array.isArray(m.tables)||m.tables.length>1000)fail_('SCHEMA_MISMATCH','Firebaseの移行証明または管理情報を確認してください。');var ids={},titles={};m.tables.forEach(function(t){if(!t||!Number.isSafeInteger(t.sheetId)||t.sheetId<0||typeof t.title!=='string'||!t.title||ids[t.sheetId]||titles[t.title])fail_('SCHEMA_MISMATCH','Firebaseの管理表IDが重複しています。');ids[t.sheetId]=true;titles[t.title]=true;});book.getId=function(){return book.sourceId;};book.getName=function(){return book.manifest.title;};book.getSpreadsheetTimeZone=function(){return book.manifest.timeZone;};book.getSheets=function(){return book.manifest.tables.map(function(t){return firestoreSheet_(book,t.sheetId);});};book.getSheetByName=function(title){var t=book.manifest.tables.find(function(t){return t.title===title;});return t?firestoreSheet_(book,t.sheetId):null;};return book;}
function firestoreSheet_(book,id){var existing=book.tables[id];if(existing)return existing;var descriptor=book.manifest.tables.find(function(t){return t.sheetId===id;});if(!descriptor)fail_('PROTECTED_SHEET','Firebaseの管理表が見つかりません。');var document=firestoreReadDocument_(book,firestorePath_(book,'tables/'+id));if(!document)fail_('SCHEMA_MISMATCH','Firebaseの管理表情報がありません。');var data=firestoreDecodeFields_(document.fields||{});firestoreTableShape_(data);if(data.sheetId!==id||data.title!==descriptor.title)fail_('SCHEMA_MISMATCH','Firebaseの管理表IDが一致しません。');var sheet={book:book,data:data,updateTime:firestoreTime_(document)};sheet.getSheetId=function(){return sheet.data.sheetId;};sheet.getName=function(){return sheet.data.title;};sheet.getParent=function(){return sheet.book;};sheet.getLastRow=function(){return sheet.data.lastRow;};sheet.getLastColumn=function(){return sheet.data.lastColumn;};sheet.getMaxRows=function(){return sheet.data.rowCount;};sheet.getMaxColumns=function(){return sheet.data.columnCount;};sheet.getRange=function(row,column,numRows,numColumns){return firestoreRange_(sheet,row,column,numRows===undefined?1:numRows,numColumns===undefined?1:numColumns);};book.tables[id]=sheet;return sheet;}
function firestoreTableShape_(d){if(!d||!Number.isSafeInteger(d.sheetId)||d.sheetId<0||typeof d.title!=='string'||!d.title||!Number.isSafeInteger(d.rowCount)||d.rowCount<1||d.rowCount>50000||!Number.isSafeInteger(d.columnCount)||d.columnCount<1||d.columnCount>1000||!Number.isSafeInteger(d.lastRow)||d.lastRow<0||d.lastRow>d.rowCount||!Number.isSafeInteger(d.lastColumn)||d.lastColumn<0||d.lastColumn>d.columnCount||d.identityReadBound!==undefined&&(!Number.isSafeInteger(d.identityReadBound)||d.identityReadBound<Math.min(40,d.rowCount)||d.identityReadBound>d.rowCount))fail_('SCHEMA_MISMATCH','Firebaseの行・列の範囲を確認してください。');}
function firestoreRowId_(row){if(!Number.isSafeInteger(row)||row<1||row>50000)fail_('VALIDATION','Firebaseの行番号を確認してください。');return ('00000000'+row).slice(-8);}
function firestoreEmptyRow_(){return {values:[],formulas:[],cells:[],metadata:{}};}
function firestoreDecodeRow_(document,row){if(!document)return firestoreEmptyRow_();var d=firestoreDecodeFields_(document.fields||{});if(d.row!==row||typeof d.hasMetadata!=='boolean'||typeof d.payload!=='string'||firestoreBytes_(d.payload)>900000)fail_('SCHEMA_MISMATCH','Firebaseの行データを確認してください。');var body;try{body=JSON.parse(d.payload);}catch(_){fail_('SCHEMA_MISMATCH','Firebaseの行データを読み取れません。');}if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(function(k){return ['values','formulas','cells','metadata'].indexOf(k)<0;})||!Array.isArray(body.values)||body.values.length>1000||!Array.isArray(body.formulas)||body.formulas.length>1000||body.formulas.some(function(v){return typeof v!=='string';})||!Array.isArray(body.cells)||body.cells.length>1000||!body.metadata||typeof body.metadata!=='object'||Array.isArray(body.metadata)||d.hasMetadata!==(Object.keys(body.metadata).length>0))fail_('SCHEMA_MISMATCH','Firebaseの行データの項目を確認してください。');body.values.forEach(firestoreStoredValue_);Object.keys(body.metadata).forEach(function(k){var m=body.metadata[k];if(['__proto__','constructor','prototype'].indexOf(k)>=0||!m||typeof m!=='object'||!Number.isSafeInteger(m.metadataId)||m.metadataId<1||m.value!==null&&typeof m.value!=='string')fail_('SCHEMA_MISMATCH','Firebaseの行メタデータを確認してください。');});return body;}
function firestoreStoredValue_(value){if(typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&isFinite(value))return value;if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&typeof value.$nodeDate==='string'&&/^\d{4}-\d\d-\d\dT/.test(value.$nodeDate)&&isFinite(Date.parse(value.$nodeDate))&&new Date(value.$nodeDate).toISOString()===value.$nodeDate)return new Date(value.$nodeDate);fail_('SCHEMA_MISMATCH','Firebaseの日付または入力値を確認してください。');}
function firestoreQueryRows_(sheet,filter,after){var q={from:[{collectionId:'rows'}],where:filter,orderBy:[{field:{fieldPath:filter.fieldFilter?'__name__':'row'},direction:'ASCENDING'}],limit:200};if(after!==undefined)q.startAt={values:[filter.fieldFilter?{referenceValue:firestoreDocumentName_(sheet.book.storage,firestorePath_(sheet.book,'tables/'+sheet.getSheetId()+'/rows/'+('00000000'+after).slice(-8)))}:{integerValue:String(after)}],before:false};var result=firestoreRequest_('post',firestorePath_(sheet.book,'tables/'+sheet.getSheetId())+':runQuery',{structuredQuery:q,transaction:sheet.book.transaction},sheet.book.storage);if(!Array.isArray(result))fail_('FIRESTORE_READ_FAILED','Firebaseの行データを取得できませんでした。');return result.filter(function(item){return !!item.document;}).map(function(item){var fields=firestoreDecodeFields_(item.document.fields||{}),row=fields.row;if(!Number.isSafeInteger(row)||row<1||row>sheet.data.rowCount||!item.document.name||item.document.name!==firestoreDocumentName_(sheet.book.storage,firestorePath_(sheet.book,'tables/'+sheet.getSheetId()+'/rows/'+firestoreRowId_(row))))fail_('SCHEMA_MISMATCH','Firebaseの行の保存位置が一致しません。');var payload=firestoreDecodeRow_(item.document,row);sheet.book.rows[sheet.getSheetId()+':'+row]={body:payload,updateTime:firestoreTime_(item.document)};sheet.book.proofs[item.document.name]=firestoreTime_(item.document);return row;});}
function firestoreLoadRows_(sheet,start,count){var end=start+count-1,key=sheet.getSheetId(),ranges=sheet.book.intervals[key]||(sheet.book.intervals[key]=[]);if(ranges.some(function(v){return v[0]<=start&&v[1]>=end;}))return;var lower=start-1,filter={compositeFilter:{op:'AND',filters:[{fieldFilter:{field:{fieldPath:'row'},op:'GREATER_THAN_OR_EQUAL',value:{integerValue:String(start)}}},{fieldFilter:{field:{fieldPath:'row'},op:'LESS_THAN_OR_EQUAL',value:{integerValue:String(end)}}}]}},pages=0;while(true){var rows=firestoreQueryRows_(sheet,filter,lower);if(++pages>251)fail_('DATA_LIMIT','Firebaseの読込範囲が上限を超えました。');if(!rows.length)break;var last=rows[rows.length-1];if(last<=lower||rows.some(function(row){return row<start||row>end;}))fail_('SCHEMA_MISMATCH','Firebaseの行データが重複しています。');lower=last;if(rows.length<200)break;}ranges.push([start,end]);}
function firestoreBody_(sheet,row){firestoreLoadRows_(sheet,row,1);var key=sheet.getSheetId()+':'+row,cached=sheet.book.rows[key];if(cached)return cached.body;var document=firestoreReadDocument_(sheet.book,firestorePath_(sheet.book,'tables/'+sheet.getSheetId()+'/rows/'+firestoreRowId_(row)));if(document)fail_('BUSY','読込中にFirebaseの行が変更されました。再取得してください。');sheet.book.rows[key]={body:firestoreEmptyRow_(),updateTime:null};return sheet.book.rows[key].body;}
function firestoreRange_(sheet,row,column,count,columns){if(![row,column,count,columns].every(Number.isSafeInteger)||row<1||column<1||count<1||columns<1||row+count-1>sheet.data.rowCount||column+columns-1>sheet.data.columnCount)fail_('VALIDATION','Firebaseの入力範囲を確認してください。');var range={sheet:sheet,start:row,column:column,count:count,columns:columns};function matrix(kind){var identity=kind==='values'&&row===1&&column===1&&columns===4&&sheet.data.title===(typeof NODE==='object'&&NODE.matchingTab||'2期目マッチングDB')&&sheet.data.identityReadBound!==undefined,readCount=identity?Math.min(count,sheet.data.identityReadBound):count;firestoreLoadRows_(sheet,row,readCount);return Array.from({length:count},function(_,i){var body=(sheet.book.rows[sheet.getSheetId()+':'+(row+i)]||{body:firestoreEmptyRow_()}).body;return Array.from({length:columns},function(_,j){var value=body[kind][column+j-1];return kind==='values'?value===undefined?'':firestoreStoredValue_(value):value===undefined?'':value;});});}range.getValues=function(){return matrix('values');};range.getFormulas=function(){return matrix('formulas');};range.getValue=function(){return matrix('values')[0][0];};range.getFormula=function(){return matrix('formulas')[0][0];};range.getRow=function(){return row;};range.getColumn=function(){return column;};range.createTextFinder=function(text){var settings={text:String(text),caseSensitive:false,whole:false,regex:false,formula:false},finder={};finder.matchCase=function(v){settings.caseSensitive=v===true;return finder;};finder.matchEntireCell=function(v){settings.whole=v===true;return finder;};finder.useRegularExpression=function(v){if(v===true)fail_('VALIDATION','正規表現の検索は利用できません。');return finder;};finder.matchFormulaText=function(v){settings.formula=v===true;return finder;};finder.findAll=function(){var data=matrix(settings.formula?'formulas':'values'),needle=settings.caseSensitive?settings.text:settings.text.toLowerCase(),found=[];data.forEach(function(line,i){line.forEach(function(value,j){var hay=String(value);if(!settings.caseSensitive)hay=hay.toLowerCase();if(settings.whole?hay===needle:hay.indexOf(needle)>=0)found.push(firestoreRange_(sheet,row+i,column+j,1,1));});});return found;};return finder;};return range;}
function firestoreMetadataMaps_(sheet,keys){var book=sheet.book,id=sheet.getSheetId();if(!book.metadataLoaded[id]){var lower=0,pages=0;while(true){var filter={fieldFilter:{field:{fieldPath:'hasMetadata'},op:'EQUAL',value:{booleanValue:true}}},rows=firestoreQueryRows_(sheet,filter,lower);if(++pages>251)fail_('DATA_LIMIT','Firebaseの管理IDが上限を超えました。');if(!rows.length)break;var last=rows[rows.length-1];if(last<=lower)fail_('SCHEMA_MISMATCH','Firebaseの管理IDが重複しています。');lower=last;if(rows.length<200)break;}book.metadataLoaded[id]=true;}var maps={};keys.forEach(function(key){maps[key]={};});Object.keys(book.rows).forEach(function(key){if(key.indexOf(id+':')!==0)return;var row=Number(key.slice(String(id).length+1)),m=book.rows[key].body.metadata;keys.forEach(function(k){if(m[k])maps[k][row]=firestoreClone_(m[k]);});});return maps;}
function firestoreRowCount_(sheet){return sheet.getMaxRows();}
function firestoreGridRead_(book,sheet,start,count){if(book!==sheet.book||!Number.isSafeInteger(start)||start<1||!Number.isSafeInteger(count)||count<1||count>100||start>sheet.data.rowCount)fail_('VALIDATION','Firebaseの表示範囲を確認してください。');var end=Math.min(start+count-1,sheet.data.rowCount),columns=Math.min(100,sheet.data.columnCount);firestoreLoadRows_(sheet,start,end-start+1);return Array.from({length:end-start+1},function(_,i){var body=(book.rows[sheet.getSheetId()+':'+(start+i)]||{body:firestoreEmptyRow_()}).body;return Array.from({length:columns},function(_,j){return firestoreClone_(body.cells[j]||{});});});}
function firestoreVerifyBook_(book){if(!book||!book.transaction)return;function manifest(){var current=firestoreReadDocument_(book,firestorePath_(book),true);if(!current||firestoreTime_(current)!==book.updateTime)fail_('BUSY','確認中にFirebaseのデータが更新されました。再取得してください。');}manifest();var accounts=book.manifest.tables.find(function(t){return t.title===(typeof NODE==='object'&&NODE.playersTab||'_NODE_players');});if(accounts){var prefix=firestoreDocumentName_(book.storage,firestorePath_(book,'tables/'+accounts.sheetId)),names=Object.keys(book.proofs).filter(function(name){return name===prefix||name.indexOf(prefix+'/rows/')===0;});for(var start=0;start<names.length;start+=100){var expected=names.slice(start,start+100),seen={},results=firestoreRequest_('post',':batchGet',{documents:expected,mask:{fieldPaths:['__nodeProofAbsent']}},book.storage);if(!Array.isArray(results))fail_('FIRESTORE_READ_FAILED','Firebaseの利用権限を再確認できませんでした。');results.forEach(function(item){var name=item.found&&item.found.name||item.missing;if(typeof name!=='string'||expected.indexOf(name)<0||seen[name])fail_('FIRESTORE_READ_FAILED','Firebaseの利用権限の応答を確認できませんでした。');seen[name]=true;var actual=item.found?firestoreTime_(item.found):null;if(actual!==book.proofs[name])fail_('BUSY','確認中にアカウントの利用権限が更新されました。再ログインしてください。');});if(expected.some(function(name){return !seen[name];}))fail_('FIRESTORE_READ_FAILED','Firebaseの利用権限を確認できませんでした。');}manifest();}}
function firestoreAssertSnapshot_(){firestoreVerifyBook_(firestoreLoadedBook_());}
function firestoreStorageInfo_(){var book=firestoreLoadedBook_();if(!book)return {kind:'firestore',projectId:firestoreConfig_().projectId,migratedAt:''};return {kind:'firestore',projectId:book.storage.projectId,migratedAt:(typeof firestoreMigrationState_==='function'&&firestoreMigrationState_()||{}).activatedAt||book.manifest.migrationProof.verifiedAt||book.manifest.migrationProof.preparedAt||''};}
function firestoreClose_(){var book=firestoreLoadedBook_();if(book&&book.transaction){try{firestoreRequest_('post',':rollback',{transaction:book.transaction},book.storage);}catch(_){}book.transaction=null;}NODE_FIRESTORE_REQUEST_=null;}
function firestoreBatch_(bookId,requests){var book=firestoreLoadedBook_();if(!book||book.sourceId!==bookId||!book.write||!book.transaction)fail_('WRITES_DISABLED','Firebaseへの保存処理が開始されていません。');if(!Array.isArray(requests)||requests.length>2000)fail_('DATA_LIMIT','一度の保存件数が上限を超えています。');if(!requests.length)return;var stage={manifest:firestoreClone_(book.manifest),tables:{},rows:{},dirtyRows:{},dirtyTables:{}};Object.keys(book.tables).forEach(function(k){stage.tables[k]=firestoreClone_(book.tables[k].data);});function table(id){if(!Number.isSafeInteger(id)||id<0)fail_('VALIDATION','Firebaseの管理表IDを確認してください。');if(!stage.tables[id])stage.tables[id]=firestoreClone_(firestoreSheet_(book,id).data);return stage.tables[id];}function row(id,n){var k=id+':'+n;if(!stage.rows[k]){var original=stage.manifest.tables.some(function(t){return t.sheetId===id;})&&book.manifest.tables.some(function(t){return t.sheetId===id;})?firestoreBody_(firestoreSheet_(book,id),n):firestoreEmptyRow_();if(!book.manifest.tables.some(function(t){return t.sheetId===id;})&&firestoreReadDocument_(book,firestorePath_(book,'tables/'+id+'/rows/'+firestoreRowId_(n))))fail_('CONFLICT','作成先に別の行データがあります。');stage.rows[k]=firestoreClone_(original);}stage.dirtyRows[k]=true;return stage.rows[k];}function touched(id){stage.dirtyTables[id]=true;}function applyCells(id,startRow,startCol,rows,fieldMask){var t=table(id),fields=String(fieldMask).split(',');if(fields.some(function(f){return ['userEnteredValue','userEnteredFormat.numberFormat'].indexOf(f)<0;}))fail_('VALIDATION','このセル更新形式は利用できません。');if(!Number.isSafeInteger(startRow)||startRow<0||!Number.isSafeInteger(startCol)||startCol<0||!Array.isArray(rows)||!rows.length||startRow+rows.length>t.rowCount)fail_('VALIDATION','セル更新の範囲を確認してください。');rows.forEach(function(r,i){if(!r||!Array.isArray(r.values)||startCol+r.values.length>t.columnCount)fail_('VALIDATION','セル更新の列を確認してください。');var body=row(id,startRow+i+1);r.values.forEach(function(c,j){if(!c||typeof c!=='object'||Array.isArray(c))fail_('VALIDATION','セルの保存値を確認してください。');var index=startCol+j;while(body.values.length<=index)body.values.push('');while(body.formulas.length<=index)body.formulas.push('');while(body.cells.length<=index)body.cells.push({});var previousValue=firestoreClone_(body.values[index]),prior=body.cells[index]||{},next=firestoreClone_(prior);if(fields.indexOf('userEnteredValue')>=0){var v=c.userEnteredValue||{};if(Object.keys(v).some(function(k){return ['stringValue','numberValue','boolValue','formulaValue'].indexOf(k)<0;})||Object.keys(v).length>1)fail_('VALIDATION','セルの入力値を確認してください。');next.userEnteredValue=firestoreClone_(v);delete next.effectiveValue;delete next.formattedValue;body.formulas[index]=typeof v.formulaValue==='string'?v.formulaValue:'';body.values[index]=typeof v.stringValue==='string'?v.stringValue:typeof v.numberValue==='number'&&isFinite(v.numberValue)?v.numberValue:typeof v.boolValue==='boolean'?v.boolValue:'';if(Object.keys(v).length&&body.values[index]===''&&!body.formulas[index]&&v.stringValue!=='')fail_('VALIDATION','セルの型を確認してください。');if(body.formulas[index]){if(prior.userEnteredValue&&prior.userEnteredValue.formulaValue===body.formulas[index]){body.values[index]=previousValue;next.effectiveValue=prior.effectiveValue||{};next.formattedValue=prior.formattedValue||'';}else{body.values[index]='';next.formattedValue='';}}else if(Object.keys(v).length){next.effectiveValue=firestoreClone_(v);next.formattedValue=String(body.values[index]);}}if(fields.indexOf('userEnteredFormat.numberFormat')>=0){next.userEnteredFormat=next.userEnteredFormat||{};next.userEnteredFormat.numberFormat=firestoreClone_(c.userEnteredFormat&&c.userEnteredFormat.numberFormat||{});}var fmt=next.userEnteredFormat&&next.userEnteredFormat.numberFormat;if(!body.formulas[index]&&typeof body.values[index]==='number'&&fmt&&['DATE','DATE_TIME'].indexOf(fmt.type)>=0){var date=new Date((body.values[index]-25569)*86400000);if(!isFinite(date.getTime()))fail_('VALIDATION','日付を確認してください。');body.values[index]={$nodeDate:date.toISOString()};next.formattedValue=date.toISOString().slice(0,10);}if(index===2&&t.title===(typeof NODE==='object'&&NODE.matchingTab||'2期目マッチングDB')&&typeof body.values[index]==='string'&&body.values[index].replace(/[\s\u3000]/g,'')){t.identityReadBound=Math.max(t.identityReadBound===undefined?t.lastRow:t.identityReadBound,Math.min(40,t.rowCount),startRow+i+1);}body.cells[index]=next;});t.lastRow=Math.max(t.lastRow,startRow+i+1);t.lastColumn=Math.max(t.lastColumn,startCol+r.values.length);});touched(id);}
 requests.forEach(function(request){if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).length!==1)fail_('VALIDATION','保存操作の形式を確認してください。');var kind=Object.keys(request)[0],v=request[kind];if(kind==='addSheet'){var p=v&&v.properties;if(!p||!p.gridProperties||stage.manifest.tables.some(function(t){return t.sheetId===p.sheetId||t.title===p.title;}))fail_('CONFLICT','作成する管理表が既に存在します。');var t={sheetId:p.sheetId,title:p.title,rowCount:p.gridProperties.rowCount,columnCount:p.gridProperties.columnCount,lastRow:0,lastColumn:0};firestoreTableShape_(t);if(firestoreReadDocument_(book,firestorePath_(book,'tables/'+t.sheetId)))fail_('CONFLICT','作成先に別の管理表情報があります。');stage.tables[t.sheetId]=t;stage.manifest.tables.push({sheetId:t.sheetId,title:t.title});touched(t.sheetId);return;}
 if(kind==='appendDimension'){var t=table(v.sheetId);if(v.dimension!=='ROWS'||!Number.isSafeInteger(v.length)||v.length<1||t.rowCount+v.length>50000)fail_('VALIDATION','追加する行数を確認してください。');t.rowCount+=v.length;touched(v.sheetId);return;}
 if(kind==='updateCells'){var range=v&&v.range;if(!range||!Number.isSafeInteger(range.endRowIndex)||!Number.isSafeInteger(range.endColumnIndex)||range.endRowIndex-range.startRowIndex!==(v.rows||[]).length||(v.rows||[]).some(function(r){return !r.values||r.values.length!==range.endColumnIndex-range.startColumnIndex;}))fail_('VALIDATION','更新するセルの範囲を確認してください。');applyCells(range.sheetId,range.startRowIndex,range.startColumnIndex,v.rows,v.fields);return;}
 if(kind==='appendCells'){var t=table(v.sheetId),needed=t.lastRow+(v.rows||[]).length;if(needed>50000)fail_('DATA_LIMIT','管理表の保存上限に達しました。');if(needed>t.rowCount)t.rowCount=needed;applyCells(v.sheetId,t.lastRow,0,v.rows,v.fields);return;}
 if(kind==='createDeveloperMetadata'){var m=v&&v.developerMetadata,d=m&&m.location&&m.location.dimensionRange;if(!m||m.visibility!=='DOCUMENT'||typeof m.metadataKey!=='string'||!m.metadataKey||['__proto__','constructor','prototype'].indexOf(m.metadataKey)>=0||typeof m.metadataValue!=='string'||!d||d.dimension!=='ROWS'||!Number.isSafeInteger(d.startIndex)||d.endIndex!==d.startIndex+1||d.startIndex<0||d.endIndex>table(d.sheetId).rowCount)fail_('VALIDATION','行の管理IDを確認してください。');var b=row(d.sheetId,d.startIndex+1);if(b.metadata[m.metadataKey])fail_('METADATA_CONFLICT','同じ行の管理IDが重複しています。');b.metadata[m.metadataKey]={metadataId:stage.manifest.nextMetadataId++,value:m.metadataValue};return;}
 if(kind==='updateDeveloperMetadata'||kind==='deleteDeveloperMetadata'){var filter=kind==='updateDeveloperMetadata'?v&&v.dataFilters:v&&v.dataFilter?[v.dataFilter]:null;if(!Array.isArray(filter)||filter.length!==1||!filter[0].developerMetadataLookup||Object.keys(filter[0].developerMetadataLookup).length!==1||!Number.isSafeInteger(filter[0].developerMetadataLookup.metadataId))fail_('VALIDATION','管理IDの更新条件を確認してください。');var wanted=filter[0].developerMetadataLookup.metadataId,found=[];book.getSheets().forEach(function(s){firestoreMetadataMaps_(s,[]);});Object.keys(book.rows).forEach(function(k){var body=stage.rows[k]||book.rows[k].body;Object.keys(body.metadata).forEach(function(key){if(body.metadata[key].metadataId===wanted)found.push({key:key,id:Number(k.split(':')[0]),row:Number(k.split(':')[1])});});});if(found.length!==1)fail_('METADATA_CONFLICT','更新する管理IDが重複、または存在しません。');var f=found[0],b=row(f.id,f.row);if(kind==='deleteDeveloperMetadata')delete b.metadata[f.key];else{if(v.fields!=='metadataValue'||!v.developerMetadata||typeof v.developerMetadata.metadataValue!=='string')fail_('VALIDATION','管理IDの保存内容を確認してください。');b.metadata[f.key].value=v.developerMetadata.metadataValue;}return;}
 fail_('VALIDATION','Firebaseでは未対応の保存形式です。元のスプレッドシートへは保存していません。');});
 stage.manifest.revision++;var writes=[];Object.keys(stage.dirtyTables).forEach(function(id){var path=firestorePath_(book,'tables/'+id);writes.push({update:{name:firestoreDocumentName_(book.storage,path),fields:firestoreEncodeFields_(stage.tables[id])}});});Object.keys(stage.dirtyRows).forEach(function(k){var body=stage.rows[k],payload=JSON.stringify(body);if(firestoreBytes_(payload)>900000)fail_('DATA_LIMIT','一行の保存量が上限を超えています。');var parts=k.split(':'),n=Number(parts[1]);writes.push({update:{name:firestoreDocumentName_(book.storage,firestorePath_(book,'tables/'+parts[0]+'/rows/'+firestoreRowId_(n))),fields:firestoreEncodeFields_({row:n,hasMetadata:Object.keys(body.metadata).length>0,payload:payload})}});});writes.push({update:{name:firestoreDocumentName_(book.storage,firestorePath_(book)),fields:firestoreEncodeFields_(stage.manifest)},currentDocument:{updateTime:book.updateTime}});if(writes.length>450)fail_('DATA_LIMIT','一度の保存が大きすぎます。入力は保持しています。');var committed=firestoreRequest_('post',':commit',{writes:writes,transaction:book.transaction},book.storage);if(!committed||!Array.isArray(committed.writeResults)||committed.writeResults.length!==writes.length)fail_('INTERNAL','Firebaseの保存結果を確認できません。同じ保存IDで確認してください。');book.transaction=null;NODE_FIRESTORE_REQUEST_={write:false,book:null,committed:true};
}

/* Owner-only, resumable migration. The original workbook is read, never changed.
 * Normal app requests cannot call these editor functions. Authentication stays in
 * Script Properties; neither password hashes nor secrets enter the import. */
var FIRESTORE_MIGRATION_KEY='NODE_FIRESTORE_MIGRATION_STATE';
var FIRESTORE_MIGRATION_TARGET_KEY='NODE_FIRESTORE_MIGRATION_TARGET';
var FIRESTORE_MIGRATION_CONFIRM_KEY='NODE_FIRESTORE_MIGRATION_CONFIRM';
var FIRESTORE_MIGRATION_PREVIEW_KEY='NODE_FIRESTORE_PREVIEW_V2';
var FIRESTORE_MIGRATION_PAGE_ROWS=64;
var FIRESTORE_MIGRATION_PAGE_BYTES=4*1024*1024;

function firestoreMigrationState_(){
  var raw=props_().getProperty(FIRESTORE_MIGRATION_KEY);if(!raw)return null;
  try{var state=JSON.parse(raw);if(!state||['prepared','importing','ready','verified','active','abandoned'].indexOf(state.phase)<0)throw new Error('state');if(state.rootHashVersion===2)firestoreMigrationCheckpointValidate_(state);return state;}
  catch(error){fail_('MIGRATION_STATE','Firebase移行状態を確認してください。安全のため保存を停止しています。');}
}
function firestoreMigrationFrozen_(){var state=firestoreMigrationState_();return !!state&&(['prepared','importing','ready','verified'].indexOf(state.phase)>=0||state.phase==='active'&&props_().getProperty('NODE_STORAGE_PROVIDER')!=='firestore');}
function firestoreMigrationTarget_(){
  var raw=props_().getProperty(FIRESTORE_MIGRATION_TARGET_KEY),target;
  try{target=JSON.parse(raw||'null');}catch(error){target=null;}
  if(!target||Object.keys(target).some(function(key){return ['projectId','databaseId'].indexOf(key)<0;})||typeof target.projectId!=='string'||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(target.projectId)||target.databaseId!==undefined&&target.databaseId!=='(default)'&&!/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(target.databaseId))fail_('FIRESTORE_NOT_CONFIGURED','移行先プロジェクトを NODE_FIRESTORE_MIGRATION_TARGET に設定してください。');
  return {projectId:target.projectId,databaseId:target.databaseId||'(default)'};
}
function firestoreMigrationReset_(){if(typeof firestoreClose_==='function')firestoreClose_();if(typeof firestoreReset_==='function')firestoreReset_();}
function firestoreMigrationPlain_(value){
  if(value instanceof Date){if(!isFinite(value.getTime()))fail_('MIGRATION_SOURCE','無効な日付があるため移行を停止しました。');return {$nodeDate:value.toISOString()};}
  if(value===undefined||value===null)return '';
  if(typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&isFinite(value))return value;
  fail_('MIGRATION_SOURCE','移行元に対応していないセル値があります。');
}
/* All migration callers pass JSON-compatible objects. Count their serialized
 * UTF-8 bytes locally instead of creating a service Blob for every source row.
 * Preserve the previous service behavior for a raw unpaired surrogate; normal
 * JSON.stringify escapes it and never needs this compatibility fallback. */
function firestoreMigrationUtf8Length_(value){
  var text=typeof value==='string'?value:JSON.stringify(value),bytes=0;
  if(typeof text!=='string')fail_('MIGRATION_SOURCE','移行元の保存サイズを確認できませんでした。');
  for(var i=0;i<text.length;i++){
    var code=text.charCodeAt(i);
    if(code<128)bytes++;
    else if(code<2048)bytes+=2;
    else if(code>=55296&&code<=56319){var next=i+1<text.length?text.charCodeAt(i+1):0;if(next>=56320&&next<=57343){bytes+=4;i++;}else return Utilities.newBlob(text).getBytes().length;}
    else if(code>=56320&&code<=57343)return Utilities.newBlob(text).getBytes().length;
    else bytes+=3;
  }
  return bytes;
}
function firestoreMigrationSummary_(state,extra){
  var result={phase:state.phase,sourceHash:state.sourceHash,tableCount:state.counts.tableCount,rowDocumentCount:state.counts.rowDocumentCount,recordIdCount:state.counts.recordIdCount,operationCount:state.counts.operationCount};
  if(state.cursor!==undefined)result.documentsImported=state.cursor;
  Object.keys(extra||{}).forEach(function(key){result[key]=extra[key];});Logger.log(JSON.stringify(result));return result;
}
function firestoreMigrationConfirm_(expected){if(props_().getProperty(FIRESTORE_MIGRATION_CONFIRM_KEY)!==expected)fail_('MIGRATION_CONFIRM_REQUIRED','確認したハッシュに対応する移行確認値を設定してください。');}
/* Stopping writes is an operational switch, not a new data destination. All
 * other source/owner/authorization fields stay bound to the migration seal. */
function firestoreRuntimeConfigHash_(config){var binding={};Object.keys(config).forEach(function(key){if(key!=='writesEnabled')binding[key]=config[key];});return hash_(stableJson_(binding));}
/* Metadata is one Advanced Sheets RPC, not a chain of remote getter calls per entry.
 * Search visibility/location are intentionally not restricted: preserve DOCUMENT and
 * all PROJECT metadata visible to this Apps Script project. No partial fallback. */
function firestoreMigrationMetadata_(bookId,catalog){
  var response;try{response=Sheets.Spreadsheets.DeveloperMetadata.search({dataFilters:[{developerMetadataLookup:{}}]},bookId);}catch(_){fail_('SHEET_READ_FAILED','移行元の管理IDを一括取得できませんでした。権限とSheets APIを確認してください。元データは変更していません。');}
  function object(value,keys){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(function(key){return keys.indexOf(key)>=0;});}
  if(!object(response,['matchedDeveloperMetadata'])||response.matchedDeveloperMetadata!==undefined&&!Array.isArray(response.matchedDeveloperMetadata))fail_('METADATA_CONFLICT','管理IDの一括応答を確認できませんでした。');
  var items=response.matchedDeveloperMetadata||[],rowMetadata=Object.create(null),tableMetadata=Object.create(null),legacyMetadata=[],ids=Object.create(null),maxId=0;
  var entries=items.map(function(item){
    if(!object(item,['developerMetadata','dataFilters'])||!object(item.developerMetadata,['metadataId','metadataKey','metadataValue','visibility','location']))fail_('METADATA_CONFLICT','対応していない管理IDの保存形式があります。');
    var raw=item.developerMetadata,id=raw.metadataId,key=raw.metadataKey,hasValue=Object.prototype.hasOwnProperty.call(raw,'metadataValue'),value=hasValue?raw.metadataValue:null,location=raw.location;
    if(!Number.isSafeInteger(id)||id<1||id>2147483647||ids[id]||typeof key!=='string'||!key||hasValue&&typeof value!=='string'||['DOCUMENT','PROJECT'].indexOf(raw.visibility)<0)fail_('METADATA_CONFLICT','管理IDの形式・重複・公開範囲を確認してください。');ids[id]=true;maxId=Math.max(maxId,id);
    if(!object(location,['locationType','dimensionRange','sheetId','spreadsheet']))fail_('METADATA_CONFLICT','管理IDの位置情報を確認してください。');
    var locations=['dimensionRange','sheetId','spreadsheet'].filter(function(k){return Object.prototype.hasOwnProperty.call(location,k);});if(locations.length!==1)fail_('METADATA_CONFLICT','管理IDの位置が一つに特定できません。');
    var type,sheetId,row;
    if(locations[0]==='dimensionRange'){
      var range=location.dimensionRange;type='ROW';if(!object(range,['sheetId','dimension','startIndex','endIndex'])||range.dimension!=='ROWS')fail_('METADATA_CONFLICT','行以外の管理IDは移行前に確認が必要です。');
      var start=range.startIndex===undefined?0:range.startIndex,end=range.endIndex;sheetId=range.sheetId;
      if(!Number.isSafeInteger(sheetId)||sheetId<0||!Object.prototype.hasOwnProperty.call(catalog,sheetId)||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(end)||end!==start+1||end>catalog[sheetId].rowCount)fail_('METADATA_CONFLICT','管理IDの行位置・行数・表を確認してください。');row=start+1;
      if(['__proto__','constructor','prototype'].indexOf(key)>=0)fail_('METADATA_CONFLICT','対応していない管理IDのキーがあります。');
    }else if(locations[0]==='sheetId'){
      type='SHEET';sheetId=location.sheetId;if(!Number.isSafeInteger(sheetId)||sheetId<0||!Object.prototype.hasOwnProperty.call(catalog,sheetId))fail_('METADATA_CONFLICT','管理IDが関連する表を確認できません。');
    }else {type='SPREADSHEET';if(location.spreadsheet!==true)fail_('METADATA_CONFLICT','管理IDのブック位置を確認できません。');}
    if(location.locationType!==undefined&&location.locationType!==type)fail_('METADATA_CONFLICT','管理IDの位置と種類が一致しません。');
    return {entry:{metadataId:id,key:key,value:value,visibility:raw.visibility},type:type,sheetId:sheetId,row:row};
  });
  // The API does not promise response order. Canonical IDs avoid false source
  // changes between identical reads; row object ordering is already stableJson_.
  entries.sort(function(a,b){return a.entry.metadataId-b.entry.metadataId;}).forEach(function(item){var entry=item.entry;
    if(item.type==='ROW'){var key=item.sheetId+':'+item.row,map=rowMetadata[key]||(rowMetadata[key]=Object.create(null));if(Object.prototype.hasOwnProperty.call(map,entry.key))fail_('METADATA_CONFLICT','同じ行に同じキーの管理IDが複数あります。元データを変更せず停止しました。');map[entry.key]={value:entry.value,metadataId:entry.metadataId,visibility:entry.visibility};}
    else if(item.type==='SHEET')(tableMetadata[item.sheetId]||(tableMetadata[item.sheetId]=[])).push(entry);else legacyMetadata.push(entry);
  });
  return {rowMetadata:rowMetadata,tableMetadata:tableMetadata,legacyMetadata:legacyMetadata,maxMetadataId:maxId,metadataCount:items.length};
}
/* Up to four bounded ranges per RPC, capped at 64k cells. The returned grid has
 * exactly the same original row/column positions and raw cell JSON as before. */
function firestoreMigrationGrid_(bookId,info,end,width,stats){
  var grid=[],chunk=Math.min(200,Math.max(1,Math.floor(64000/width))),perCall=Math.max(1,Math.min(4,Math.floor(64000/(chunk*width))));
  for(var start=1;start<=end;){var ranges=[],expected=Object.create(null),batchStart=start,batchEnd=start-1;
    for(var n=0;n<perCall&&start<=end;n++){var finish=Math.min(end,start+chunk-1);expected[start-1]={end:finish,seen:false};ranges.push("'"+info.title.replace(/'/g,"''")+"'!A"+start+':'+columnName_(width)+finish);batchEnd=finish;start=finish+1;}
    var response;if(stats)stats.gridRequests++;try{response=Sheets.Spreadsheets.get(bookId,{ranges:ranges,fields:'sheets(properties(sheetId),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue,dataValidation,userEnteredFormat(numberFormat),chipRuns,note))))'});}catch(_){fail_('SHEET_READ_FAILED','移行元のセル情報を一括取得できませんでした。元データは変更していません。');}
    if(!response||!Array.isArray(response.sheets)||response.sheets.length!==1||!response.sheets[0].properties||response.sheets[0].properties.sheetId!==info.id||!Array.isArray(response.sheets[0].data)||response.sheets[0].data.length!==ranges.length||firestoreMigrationUtf8Length_(response)>12000000)fail_('SHEET_READ_FAILED','移行元のセル情報・応答サイズを確認できませんでした。');
    response.sheets[0].data.forEach(function(part){
      if(!part||typeof part!=='object'||Array.isArray(part)||part.rowData!==undefined&&!Array.isArray(part.rowData))fail_('SHEET_READ_FAILED','移行元のセル情報の形式を確認できませんでした。');
      var baseRow=part.startRow===undefined?0:part.startRow,baseColumn=part.startColumn===undefined?0:part.startColumn;
      if(!Number.isSafeInteger(baseRow)||baseRow<0||!Number.isSafeInteger(baseColumn)||baseColumn!==0||!Object.prototype.hasOwnProperty.call(expected,baseRow)||expected[baseRow].seen)fail_('SHEET_READ_FAILED','要求した範囲のセル情報が欠落・重複しています。');var block=expected[baseRow];block.seen=true;
      (part.rowData||[]).forEach(function(row,index){var target=baseRow+index;if(target<baseRow||target>=block.end||!row||typeof row!=='object'||Array.isArray(row)||row.values!==undefined&&!Array.isArray(row.values)||(row.values||[]).length+baseColumn>width)fail_('SHEET_READ_FAILED','移行元のセル範囲を確認できませんでした。');var cells=grid[target]||(grid[target]=[]);
        (row.values||[]).forEach(function(cell,column){var c=baseColumn+column;if(!cell||typeof cell!=='object'||Array.isArray(cell)||cells[c]!==undefined)fail_('SHEET_READ_FAILED','移行元のセル情報が重複、または不正な形式です。');cells[c]=cell;});
      });
    });
    if(Object.keys(expected).some(function(key){return !expected[key].seen;}))fail_('SHEET_READ_FAILED','要求した範囲のセル情報をすべて確認できませんでした。');
  }
  return grid;
}
function firestoreMigrationSource_(config){
  var readStarted=Date.now();
  if(config.spreadsheetId===NODE.originalId)fail_('PROTECTED_SOURCE','原本からの移行は実行しません。登録済みの管理コピーを使ってください。');
  assertManagedBook_(config.spreadsheetId);
  // This one-off migration deliberately addresses the old Sheets source even
  // when recovering a partially applied provider switch. It has no write calls.
  var book=SpreadsheetApp.openById(config.spreadsheetId);if(book.getSpreadsheetTimeZone()!=='Asia/Tokyo')fail_('TIMEZONE','移行元のタイムゾーンを確認してください。');
  var tabs=resolveBusinessTabs_(book);if(tabs.matchingSheetId!==Number(config.matchingSheetId)||tabs.kpiSheetId!==Number(config.kpiSheetId))fail_('SCHEMA_MISMATCH','移行元の業務タブIDが設定と一致しません。');
  var bookId=book.getId(),sheets=book.getSheets().slice().sort(function(a,b){return a.getSheetId()-b.getSheetId();}),catalog=Object.create(null);
  sheets.forEach(function(sheet){var id=sheet.getSheetId(),info={id:id,sheet:sheet,title:sheet.getName(),lastRow:sheet.getLastRow(),lastColumn:sheet.getLastColumn(),rowCount:sheet.getMaxRows(),columnCount:sheet.getMaxColumns()};if(!Number.isSafeInteger(id)||id<0||Object.prototype.hasOwnProperty.call(catalog,id)||typeof info.title!=='string'||!info.title||!Number.isSafeInteger(info.rowCount)||info.rowCount<1||!Number.isSafeInteger(info.columnCount)||info.columnCount<1||!Number.isSafeInteger(info.lastRow)||info.lastRow<0||info.lastRow>info.rowCount||!Number.isSafeInteger(info.lastColumn)||info.lastColumn<0||info.lastColumn>info.columnCount)fail_('MIGRATION_SOURCE','移行元の表の範囲を確認してください。');catalog[id]=info;});
  var metadata=firestoreMigrationMetadata_(bookId,catalog),rowMetadata=metadata.rowMetadata,tableMetadata=metadata.tableMetadata,legacyMetadata=metadata.legacyMetadata,maxMetadataId=metadata.maxMetadataId,readStats={metadataCount:metadata.metadataCount,gridRequests:0,elapsedMs:0};
  var tables=[],documents=[],cellCount=0,counts={tableCount:0,rowDocumentCount:0,recordIdCount:0,operationCount:0};
  sheets.forEach(function(sheet){
    var id=sheet.getSheetId(),info=catalog[id],lastRow=info.lastRow,lastColumn=info.lastColumn,rowCount=info.rowCount,columnCount=info.columnCount,rowsWithMetadata=Object.keys(rowMetadata).filter(function(key){return key.indexOf(id+':')===0;}).map(function(key){return Number(key.slice(String(id).length+1));});
    if(rowsWithMetadata.some(function(row){return row>rowCount;}))fail_('METADATA_CONFLICT','管理IDの行位置が元の表を超えています。');
    var end=Math.max(lastRow,rowsWithMetadata.length?Math.max.apply(null,rowsWithMetadata):0),width=Math.max(1,lastColumn);
    cellCount+=end*width;if(cellCount>2000000||end>50000||columnCount>1000||tables.length>=200)fail_('MIGRATION_LIMIT','元データが一度に検証できる上限を超えています。分割移行を確認してください。');
    var table={sheetId:id,title:info.title,rowCount:rowCount,columnCount:columnCount,lastRow:lastRow,lastColumn:lastColumn,legacyMetadata:tableMetadata[id]||[]};
    tables.push(table);documents.push({path:'tables/'+id,data:table});
    var values=end?sheet.getRange(1,1,end,width).getValues():[],formulas=end?sheet.getRange(1,1,end,width).getFormulas():[],grid=[];
    // Only this optional scan bound is derived. All rows, formulas and raw cells
    // remain in the import and its hash; missing bounds still mean a full scan.
    if(id===Number(config.matchingSheetId)){var identityBound=Math.min(40,rowCount);values.forEach(function(row,index){if(normalizeName_(row[2]))identityBound=Math.max(identityBound,index+1);});table.identityReadBound=Math.min(rowCount,identityBound);}
    grid=firestoreMigrationGrid_(bookId,info,end,width,readStats);
    for(var row=1;row<=end;row++){
      var rowValues=(values[row-1]||[]).map(firestoreMigrationPlain_),rowFormulas=(formulas[row-1]||[]).map(function(value){return String(value||'');}),cells=Array.from({length:width},function(_,column){return grid[row-1]&&grid[row-1][column]||{};}),metadata=rowMetadata[id+':'+row]||{};
      var payload={values:rowValues,formulas:rowFormulas,cells:cells,metadata:metadata};
      if(!rowValues.some(function(value){return value!=='';})&&!rowFormulas.some(Boolean)&&!cells.some(function(cell){return Object.keys(cell).length>0;})&&!Object.keys(metadata).length)continue;
      var data={row:row,hasMetadata:!!Object.keys(metadata).length,payload:stableJson_(payload)};
      if(firestoreMigrationUtf8Length_(data)>880000)fail_('MIGRATION_LIMIT','1行の保存サイズが大きいため移行を停止しました。元データは変更していません。');
      documents.push({path:'tables/'+id+'/rows/'+('00000000'+row).slice(-8),data:data});counts.rowDocumentCount++;
      if(metadata[NODE.recordKey])counts.recordIdCount++;
      if(info.title===NODE.operationsTab&&row>1&&rowValues[0]!==''&&!rowFormulas[0])counts.operationCount++;
    }
  });
  counts.tableCount=tables.length;var sourceConfigHash=hash_(stableJson_(config)),runtimeConfigHash=firestoreRuntimeConfigHash_(config),sourceHash=hash_(stableJson_([book.getId(),book.getName(),book.getSpreadsheetTimeZone(),sourceConfigHash,runtimeConfigHash,tables,legacyMetadata,documents]));
  var manifest={schemaVersion:1,revision:0,title:book.getName(),timeZone:book.getSpreadsheetTimeZone(),sourceSpreadsheetId:book.getId(),sourceConfigHash:sourceConfigHash,runtimeConfigHash:runtimeConfigHash,tables:tables.map(function(table){return {sheetId:table.sheetId,title:table.title};}),nextMetadataId:maxMetadataId+1,legacyMetadata:legacyMetadata};
  if(firestoreMigrationUtf8Length_(manifest)>880000)fail_('MIGRATION_LIMIT','移行目録が保存上限を超えています。');
  readStats.elapsedMs=Date.now()-readStarted;return {sourceHash:sourceHash,sourceConfigHash:sourceConfigHash,runtimeConfigHash:runtimeConfigHash,counts:counts,manifest:manifest,documents:documents,readStats:readStats};
}
/* Editor-only connectivity probe. The fixed metadata GET has no documents path,
 * no transaction/import write, and never logs project names or provider bodies. */
function verifyNodeFirestoreAccess(){
  var owner=requireOwner_(),target=firestoreMigrationTarget_(),name='projects/'+target.projectId+'/databases/'+target.databaseId,url='https://firestore.googleapis.com/v1/projects/'+target.projectId+'/databases/'+encodeURIComponent(target.databaseId),response,status,text;
  try{response=UrlFetchApp.fetch(url,{method:'get',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true,followRedirects:false});status=response.getResponseCode();text=response.getContentText();}catch(_){fail_('FIRESTORE_ACCESS_FAILED','Firebaseの接続を確認できませんでした。元データは変更していません。');}
  if(status===401||status===403)fail_('FIRESTORE_ACCESS_DENIED','Firebaseの読み取り権限、またはGoogleの再認証を確認してください。元データは変更していません。');
  if(status===404)fail_('FIRESTORE_NOT_CONFIGURED','指定したFirebaseデータベースが見つかりません。設定を確認してください。');
  if(status===429)fail_('RATE_LIMITED','Firebaseの接続確認が集中しています。時間をおいて再確認してください。');
  if(status!==200||typeof text!=='string'||text.length>100000)fail_('FIRESTORE_ACCESS_FAILED','Firebaseの接続確認を完了できませんでした。元データは変更していません。');
  var data;try{data=JSON.parse(text);}catch(_){fail_('FIRESTORE_ACCESS_FAILED','Firebaseの接続応答を確認できませんでした。');}
  if(!data||typeof data!=='object'||Array.isArray(data)||data.name!==name||typeof data.locationId!=='string'||!/^[a-z][a-z0-9-]{1,40}$/.test(data.locationId)||data.type!=='FIRESTORE_NATIVE')fail_('FIRESTORE_ACCESS_FAILED','Firebaseのデータベース形式・地域を確認してください。');
  if(requireOwner_()!==owner||stableJson_(firestoreMigrationTarget_())!==stableJson_(target))fail_('BUSY','接続確認中に設定が変わりました。もう一度確認してください。');
  var result={verified:true,readOnly:true,locationId:data.locationId,type:data.type};Logger.log(JSON.stringify({locationId:result.locationId,type:result.type}));return result;
}
function firestoreMigrationBinding_(state){var binding={projectId:state.target.projectId,databaseId:state.target.databaseId,workbookId:state.target.workbookId,sourceSpreadsheetId:state.sourceSpreadsheetId,sourceConfigHash:state.sourceConfigHash,runtimeConfigHash:state.runtimeConfigHash,sourceHash:state.sourceHash,importId:state.importId};if(state.rootHashVersion===2)binding.rootHashVersion=2;return binding;}
function firestoreMigrationSeal_(state){var pepper=props_().getProperty(NODE.pepperKey);if(!pepper)fail_('NOT_CONFIGURED','認証設定が未完了のため移行できません。');return hmac_(stableJson_(firestoreMigrationBinding_(state)),pepper);}
function firestoreMigrationProof_(state,phase){return Object.assign({state:phase,preparedAt:state.preparedAt,verifiedAt:state.verifiedAt||'',seal:firestoreMigrationSeal_(state)},firestoreMigrationBinding_(state),state.counts);}
function firestoreMigrationWrite_(target,writes){
  if(!writes.length)return;var body={writes:writes};if(firestoreMigrationUtf8Length_(body)>8000000)fail_('MIGRATION_LIMIT','移行バッチが大きすぎます。');
  var result=firestoreRequest_('post',':commit',body,target);if(!result||!Array.isArray(result.writeResults)||result.writeResults.length!==writes.length)fail_('INTERNAL','移行の保存結果を確認できません。入力を変えずに同じ移行を再実行してください。');return result;
}
function firestoreMigrationDocument_(target,path,data,precondition){var result={update:{name:firestoreDocumentName_(target,'nodeWorkbooks/'+target.workbookId+(path?'/'+path:'')),fields:firestoreEncodeFields_(data)}};if(precondition)result.currentDocument=precondition;return result;}
function firestoreMigrationRead_(target,path){return firestoreRequest_('get','nodeWorkbooks/'+target.workbookId+(path?'/'+path:''),undefined,target);}
/* Version 2 signs only a bounded cursor and hashes. Source prose, raw cells,
 * OAuth credentials and document arrays never enter Script Properties. */
function firestoreMigrationCheckpointPayload_(value){var out={};Object.keys(value).forEach(function(key){if(key!=='checkpointSeal')out[key]=value[key];});return out;}
function firestoreMigrationCheckpointValidate_(value){
  var pepper=props_().getProperty(NODE.pepperKey),body=firestoreMigrationCheckpointPayload_(value);
  if(!pepper||value.rootHashVersion!==2||typeof value.checkpointSeal!=='string'||firestoreMigrationUtf8Length_(value)>8192||!constantEqual_(value.checkpointSeal,hmac_(stableJson_(body),pepper)))fail_('MIGRATION_CHECKPOINT','移行の確認位置を検証できません。保存先を切り替えず停止しました。');
  return value;
}
function firestoreMigrationCheckpointSave_(key,value){var pepper=props_().getProperty(NODE.pepperKey);if(!pepper)fail_('NOT_CONFIGURED','認証設定が未完了です。');value.updatedAt=new Date().toISOString();value.checkpointSeal=hmac_(stableJson_(firestoreMigrationCheckpointPayload_(value)),pepper);var text=JSON.stringify(value);if(firestoreMigrationUtf8Length_(text)>8192)fail_('MIGRATION_LIMIT','移行の確認位置が保存上限を超えています。');props_().setProperty(key,text);return value;}
function firestoreMigrationSaveState_(state){if(state.rootHashVersion===2)return firestoreMigrationCheckpointSave_(FIRESTORE_MIGRATION_KEY,state);props_().setProperty(FIRESTORE_MIGRATION_KEY,JSON.stringify(state));return state;}
function firestoreMigrationPreview_(){var text=props_().getProperty(FIRESTORE_MIGRATION_PREVIEW_KEY);if(!text)return null;var result;try{result=JSON.parse(text);}catch(_){fail_('MIGRATION_CHECKPOINT','移行前確認の保存形式を確認してください。');}return firestoreMigrationCheckpointValidate_(result);}
/* Catalog and visible metadata are small, independent of the row count. Each
 * source page obtains only its own values/formulas/raw CellData. */
function firestoreMigrationContext_(config){
  var started=Date.now();if(config.spreadsheetId===NODE.originalId)fail_('PROTECTED_SOURCE','原本からの移行は実行しません。登録済みの管理コピーを使ってください。');assertManagedBook_(config.spreadsheetId);
  var book=SpreadsheetApp.openById(config.spreadsheetId);if(book.getSpreadsheetTimeZone()!=='Asia/Tokyo')fail_('TIMEZONE','移行元のタイムゾーンを確認してください。');var tabs=resolveBusinessTabs_(book);if(tabs.matchingSheetId!==Number(config.matchingSheetId)||tabs.kpiSheetId!==Number(config.kpiSheetId))fail_('SCHEMA_MISMATCH','移行元の業務タブIDが設定と一致しません。');
  var catalog=Object.create(null),tables=book.getSheets().slice().sort(function(a,b){return a.getSheetId()-b.getSheetId();}).map(function(sheet){var id=sheet.getSheetId(),info={id:id,sheet:sheet,title:sheet.getName(),lastRow:sheet.getLastRow(),lastColumn:sheet.getLastColumn(),rowCount:sheet.getMaxRows(),columnCount:sheet.getMaxColumns()};if(!Number.isSafeInteger(id)||id<0||Object.prototype.hasOwnProperty.call(catalog,id)||typeof info.title!=='string'||!info.title||!Number.isSafeInteger(info.rowCount)||info.rowCount<1||!Number.isSafeInteger(info.columnCount)||info.columnCount<1||!Number.isSafeInteger(info.lastRow)||info.lastRow<0||info.lastRow>info.rowCount||!Number.isSafeInteger(info.lastColumn)||info.lastColumn<0||info.lastColumn>info.columnCount)fail_('MIGRATION_SOURCE','移行元の表の範囲を確認してください。');catalog[id]=info;return info;});
  var metadata=firestoreMigrationMetadata_(book.getId(),catalog),cellCount=0;
  tables.forEach(function(info){var prefix=info.id+':',lastMetadataRow=0;Object.keys(metadata.rowMetadata).forEach(function(key){if(key.indexOf(prefix)===0)lastMetadataRow=Math.max(lastMetadataRow,Number(key.slice(prefix.length)));});info.end=Math.max(info.lastRow,lastMetadataRow);info.width=Math.max(1,info.lastColumn);cellCount+=info.end*info.width;if(cellCount>2000000||info.end>50000||info.columnCount>1000||tables.length>200)fail_('MIGRATION_LIMIT','移行元の表が検証できる上限を超えています。');});
  var plainTables=tables.map(function(info){return {sheetId:info.id,title:info.title,rowCount:info.rowCount,columnCount:info.columnCount,lastRow:info.lastRow,lastColumn:info.lastColumn,end:info.end,width:info.width,legacyMetadata:metadata.tableMetadata[info.id]||[]};});
  if(firestoreMigrationUtf8Length_([plainTables,metadata])>4000000)fail_('MIGRATION_LIMIT','管理IDの目録が安全な検証サイズを超えています。');
  var context={startedAt:started,bookId:book.getId(),title:book.getName(),timeZone:book.getSpreadsheetTimeZone(),tables:tables,rowMetadata:metadata.rowMetadata,tableMetadata:metadata.tableMetadata,legacyMetadata:metadata.legacyMetadata,maxMetadataId:metadata.maxMetadataId,metadataCount:metadata.metadataCount,matchingSheetId:Number(config.matchingSheetId),sourceConfigHash:hash_(stableJson_(config)),runtimeConfigHash:firestoreRuntimeConfigHash_(config),catalogHash:hash_(stableJson_([book.getId(),book.getName(),book.getSpreadsheetTimeZone(),plainTables])),metadataHash:hash_(stableJson_([metadata.rowMetadata,metadata.tableMetadata,metadata.legacyMetadata,metadata.maxMetadataId])),readStats:{metadataCount:metadata.metadataCount,gridRequests:0,rowsRead:0,elapsedMs:Date.now()-started}};
  return context;
}
function firestoreMigrationTableData_(context,info,bound){var data={sheetId:info.id,title:info.title,rowCount:info.rowCount,columnCount:info.columnCount,lastRow:info.lastRow,lastColumn:info.lastColumn,legacyMetadata:context.tableMetadata[info.id]||[]};if(info.id===context.matchingSheetId)data.identityReadBound=Math.min(info.rowCount,bound);return data;}
function firestoreMigrationManifest_(context){var manifest={schemaVersion:1,revision:0,title:context.title,timeZone:context.timeZone,sourceSpreadsheetId:context.bookId,sourceConfigHash:context.sourceConfigHash,runtimeConfigHash:context.runtimeConfigHash,tables:context.tables.map(function(table){return {sheetId:table.id,title:table.title};}),nextMetadataId:context.maxMetadataId+1,legacyMetadata:context.legacyMetadata};if(firestoreMigrationUtf8Length_(manifest)>880000)fail_('MIGRATION_LIMIT','移行目録が保存上限を超えています。');return manifest;}
function firestoreMigrationPageGrid_(context,info,start,end){
  var response;context.readStats.gridRequests++;try{response=Sheets.Spreadsheets.get(context.bookId,{ranges:["'"+info.title.replace(/'/g,"''")+"'!A"+start+':'+columnName_(info.width)+end],fields:'sheets(properties(sheetId),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue,dataValidation,userEnteredFormat(numberFormat),chipRuns,note))))'});}catch(_){fail_('SHEET_READ_FAILED','移行元のセル情報を取得できませんでした。元データは変更していません。');}
  if(!response||!Array.isArray(response.sheets)||response.sheets.length!==1||!response.sheets[0].properties||response.sheets[0].properties.sheetId!==info.id||!Array.isArray(response.sheets[0].data)||response.sheets[0].data.length!==1)fail_('SHEET_READ_FAILED','要求した範囲のセル情報が欠落・重複しています。');var responseBytes=firestoreMigrationUtf8Length_(response);if(responseBytes>4*1024*1024){if(end>start)return null;fail_('MIGRATION_LIMIT','1行のセル情報が安全な読取サイズを超えています。');}context.readStats.maxRawResponseBytes=Math.max(context.readStats.maxRawResponseBytes||0,responseBytes);
  var part=response.sheets[0].data[0],grid=[],rawRowByteHint=1;if(!part||typeof part!=='object'||Array.isArray(part)||(part.startRow===undefined?0:part.startRow)!==start-1||(part.startColumn===undefined?0:part.startColumn)!==0||part.rowData!==undefined&&!Array.isArray(part.rowData)||(part.rowData||[]).length>end-start+1)fail_('SHEET_READ_FAILED','要求した範囲のセル位置が一致しません。');
  (part.rowData||[]).forEach(function(row,index){if(!row||typeof row!=='object'||Array.isArray(row)||row.values!==undefined&&!Array.isArray(row.values)||(row.values||[]).length>info.width)fail_('SHEET_READ_FAILED','移行元のセル範囲を確認できませんでした。');rawRowByteHint=Math.max(rawRowByteHint,firestoreMigrationUtf8Length_(row));grid[index]=(row.values||[]).map(function(cell){if(!cell||typeof cell!=='object'||Array.isArray(cell))fail_('SHEET_READ_FAILED','移行元のセル形式を確認できませんでした。');return cell;});});info.rawRowByteHint=rawRowByteHint;return grid;
}
function firestoreMigrationSourcePage_(context,cursor){
  if(!cursor||!Number.isSafeInteger(cursor.tableIndex)||cursor.tableIndex<0||cursor.tableIndex>context.tables.length||!Number.isSafeInteger(cursor.row)||cursor.row<1)fail_('MIGRATION_CHECKPOINT','移行元の確認位置が不正です。');
  var tableIndex=cursor.tableIndex,info=context.tables[tableIndex],documents=[],delta={rowDocumentCount:0,recordIdCount:0,operationCount:0},bound=0,bytes=2,nextCursor,range;
  if(!info){if(cursor.row!==1)fail_('MIGRATION_CHECKPOINT','移行元の確認位置が不正です。');range={tableIndex:tableIndex,sheetId:null,startRow:1,endRow:0};return {documents:[],pageHash:hash_(stableJson_([range,[]])),range:range,nextCursor:{tableIndex:tableIndex,row:1},done:true,countsDelta:delta,matchingIdentityBound:0,readStats:{rowsRead:0,gridRequests:0,bytes:2}};}
  if(cursor.row>Math.max(1,info.end))fail_('MIGRATION_CHECKPOINT','移行元の行位置が表の範囲を超えています。');var start=cursor.row,end=Math.min(info.end,start+FIRESTORE_MIGRATION_PAGE_ROWS-1),processed=start-1,requestsBefore=context.readStats.gridRequests;
  /* Start each table with eight raw rows, then adapt up to 32 rows from
   * observed raw row bytes (256 KiB target). Raw data is checked before values
   * and formulas; an oversized response is discarded and retried at half size.
   * The hint is ephemeral, so it never changes page boundaries or source hashes. */
  pageBlocks:for(var blockStart=start;blockStart<=end;){var chunk=info.rawRowByteHint?Math.max(1,Math.min(32,Math.floor(262144/info.rawRowByteHint))):8,blockEnd=Math.min(end,blockStart+chunk-1),grid=firestoreMigrationPageGrid_(context,info,blockStart,blockEnd);while(grid===null){chunk=Math.max(1,Math.floor((blockEnd-blockStart+1)/2));blockEnd=blockStart+chunk-1;grid=firestoreMigrationPageGrid_(context,info,blockStart,blockEnd);}var values=info.sheet.getRange(blockStart,1,blockEnd-blockStart+1,info.width).getValues(),formulas=info.sheet.getRange(blockStart,1,blockEnd-blockStart+1,info.width).getFormulas();if(!Array.isArray(values)||!Array.isArray(formulas)||values.length!==blockEnd-blockStart+1||formulas.length!==blockEnd-blockStart+1||values.some(function(row){return !Array.isArray(row)||row.length!==info.width;})||formulas.some(function(row){return !Array.isArray(row)||row.length!==info.width;}))fail_('SHEET_READ_FAILED','移行元の値・数式の範囲が一致しません。');
    for(var row=blockStart;row<=blockEnd;row++){
      var index=row-blockStart,rowValues=values[index].map(firestoreMigrationPlain_),rowFormulas=formulas[index].map(function(value){return String(value||'');}),cells=Array.from({length:info.width},function(_,column){return grid[index]&&grid[index][column]||{};}),metadata=context.rowMetadata[info.id+':'+row]||{},hasMetadata=Object.keys(metadata).length>0;
      if(rowValues.some(function(value){return value!=='';})||rowFormulas.some(Boolean)||cells.some(function(cell){return Object.keys(cell).length>0;})||hasMetadata){var data={row:row,hasMetadata:hasMetadata,payload:stableJson_({values:rowValues,formulas:rowFormulas,cells:cells,metadata:metadata})};if(firestoreMigrationUtf8Length_(data)>880000)fail_('MIGRATION_LIMIT','1行の保存サイズが大きいため移行を停止しました。元データは変更していません。');var item={path:'tables/'+info.id+'/rows/'+('00000000'+row).slice(-8),data:data},size=firestoreMigrationUtf8Length_(item)+(documents.length?1:0);if(bytes+size>FIRESTORE_MIGRATION_PAGE_BYTES){if(!documents.length)fail_('MIGRATION_LIMIT','移行ページの保存サイズが大きすぎます。');break pageBlocks;}bytes+=size;documents.push(item);delta.rowDocumentCount++;if(metadata[NODE.recordKey])delta.recordIdCount++;if(info.title===NODE.operationsTab&&row>1&&rowValues[0]!==''&&!rowFormulas[0])delta.operationCount++;}
      if(info.id===context.matchingSheetId&&normalizeName_(rowValues[2]))bound=Math.max(bound,row);processed=row;
    }
    values=null;formulas=null;grid=null;blockStart=blockEnd+1;
  }
  if(!info.end)processed=0;var finished=processed>=info.end;nextCursor=finished?{tableIndex:tableIndex+1,row:1}:{tableIndex:tableIndex,row:processed+1};range={tableIndex:tableIndex,sheetId:info.id,startRow:start,endRow:processed};context.readStats.rowsRead+=Math.max(0,processed-start+1);
  return {documents:documents,pageHash:hash_(stableJson_([range,documents])),range:range,nextCursor:nextCursor,done:nextCursor.tableIndex===context.tables.length,countsDelta:delta,matchingIdentityBound:bound,readStats:{rowsRead:Math.max(0,processed-start+1),gridRequests:context.readStats.gridRequests-requestsBefore,bytes:bytes}};
}
function firestoreMigrationRowsSeed_(){return hash_('NODE_FIRESTORE_ROWS_V2');}
function firestoreMigrationRowsAdd_(root,item){return hash_(stableJson_(['NODE_FIRESTORE_ROW_V2',root,item.path,item.data]));}
function firestoreMigrationScan_(context){var matching=context.tables.filter(function(t){return t.id===context.matchingSheetId;})[0];return {cursor:{tableIndex:0,row:1},rollingRoot:hash_(stableJson_(['NODE_FIRESTORE_SOURCE_V2',context.bookId,context.title,context.timeZone,context.sourceConfigHash,context.runtimeConfigHash,context.catalogHash,context.metadataHash])),rowsRoot:firestoreMigrationRowsSeed_(),counts:{tableCount:context.tables.length,rowDocumentCount:0,recordIdCount:0,operationCount:0},matchingIdentityBound:matching?Math.min(40,matching.rowCount):0,maxDocumentBytes:0,pageCount:0,done:false};}
function firestoreMigrationScanPage_(context,scan){if(scan.done)fail_('MIGRATION_CHECKPOINT','確認済みの範囲を重ねて実行できません。');var page=firestoreMigrationSourcePage_(context,scan.cursor);scan.rollingRoot=hash_(stableJson_(['NODE_FIRESTORE_PAGE_V2',scan.rollingRoot,page.pageHash]));page.documents.forEach(function(item){scan.rowsRoot=firestoreMigrationRowsAdd_(scan.rowsRoot,item);scan.maxDocumentBytes=Math.max(scan.maxDocumentBytes,firestoreMigrationUtf8Length_(item));});Object.keys(page.countsDelta).forEach(function(key){scan.counts[key]+=page.countsDelta[key];});scan.matchingIdentityBound=Math.max(scan.matchingIdentityBound,page.matchingIdentityBound);scan.cursor=page.nextCursor;scan.pageCount++;scan.done=page.done;if(scan.done)scan.sourceHash=hash_(stableJson_(['NODE_FIRESTORE_ROOT_V2',scan.rollingRoot,scan.rowsRoot,scan.counts,scan.matchingIdentityBound,scan.maxDocumentBytes,scan.pageCount]));return page;}
function firestoreMigrationContextBinding_(context){return {sourceSpreadsheetId:context.bookId,sourceConfigHash:context.sourceConfigHash,runtimeConfigHash:context.runtimeConfigHash,catalogHash:context.catalogHash,metadataHash:context.metadataHash};}
function firestoreMigrationAssertContext_(state,context,owner){if(requireOwner_()!==owner||(state.ownerEmail!==undefined?state.ownerEmail!==owner:state.ownerHash!==hash_(owner)))fail_('FORBIDDEN','移行の実行者が変わりました。');var binding=firestoreMigrationContextBinding_(context);if(Object.keys(binding).some(function(key){return state[key]!==binding[key];})||hash_(stableJson_(config_()))!==context.sourceConfigHash)fail_('MIGRATION_SOURCE_CHANGED','移行元の目録・管理ID・接続設定が変わりました。元データへ書かずに停止しました。');if(state.target){var target=firestoreMigrationTarget_();if(target.projectId!==state.target.projectId||target.databaseId!==state.target.databaseId)fail_('MIGRATION_SOURCE_CHANGED','移行先設定が変わりました。');}}
function firestoreMigrationAssertScan_(state,scan){if(!scan.done||scan.sourceHash!==state.sourceHash||stableJson_(scan.counts)!==stableJson_(state.counts)||scan.rowsRoot!==state.rowsRoot||scan.matchingIdentityBound!==state.matchingIdentityBound||scan.maxDocumentBytes!==state.maxDocumentBytes)fail_('MIGRATION_SOURCE_CHANGED','移行元の内容が確認した版から変わりました。保存先を切り替えず停止しました。');}
function firestoreMigrationBudget_(context){return {remaining:16,deadline:context.startedAt+28000};}
function firestoreMigrationBudgetNext_(budget){if(budget.remaining<1||Date.now()>budget.deadline)return false;budget.remaining--;return true;}
function previewNodeFirestoreMigration(){firestoreMigrationReset_();return withLock_(function(){var owner=requireOwner_(),config=config_();if(props_().getProperty('NODE_STORAGE_PROVIDER')==='firestore')fail_('MIGRATION_ALREADY_ACTIVE','Firebaseへの切替は完了しています。');var context=firestoreMigrationContext_(config),preview=firestoreMigrationPreview_();if(preview&&preview.scan.done)preview=null;if(!preview)preview=Object.assign({rootHashVersion:2,ownerHash:hash_(owner),createdAt:new Date().toISOString(),scan:firestoreMigrationScan_(context)},firestoreMigrationContextBinding_(context));firestoreMigrationAssertContext_(preview,context,owner);var budget=firestoreMigrationBudget_(context);while(!preview.scan.done&&firestoreMigrationBudgetNext_(budget)){firestoreMigrationScanPage_(context,preview.scan);firestoreMigrationCheckpointSave_(FIRESTORE_MIGRATION_PREVIEW_KEY,preview);}firestoreMigrationAssertContext_(preview,context,owner);context.readStats.elapsedMs=Date.now()-context.startedAt;return firestoreMigrationSummary_({phase:'preview',sourceHash:preview.scan.sourceHash||'',counts:preview.scan.counts},{rootHashVersion:2,more:!preview.scan.done,readOnly:true,readStats:context.readStats,prepareConfirmation:preview.scan.done?'PREPARE:'+preview.scan.sourceHash:''});});}
function prepareNodeFirestoreMigration(){firestoreMigrationReset_();return withLock_(function(){var owner=requireOwner_(),config=config_();if(props_().getProperty('NODE_STORAGE_PROVIDER')==='firestore')fail_('MIGRATION_ALREADY_ACTIVE','Firebaseへの切替は完了しています。');if(props_().getProperty(NODE.probeKey))fail_('COPY_PROBE_PENDING','保存確認の予約が残っています。先に確認を完了してください。');var context=firestoreMigrationContext_(config),target=firestoreMigrationTarget_(),state=firestoreMigrationState_();
  if(!state||state.phase==='abandoned'){var preview=firestoreMigrationPreview_();if(!preview||!preview.scan.done)fail_('MIGRATION_CONFIRM_REQUIRED','移行前の分割確認を最後まで実行してください。');firestoreMigrationAssertContext_(preview,context,owner);firestoreMigrationConfirm_('PREPARE:'+preview.scan.sourceHash);var id=Utilities.getUuid().replace(/-/g,'');state=Object.assign({rootHashVersion:2,phase:'prepared',importId:id,target:Object.assign({},target,{workbookId:'migration-'+id}),ownerEmail:owner,sourceHash:preview.scan.sourceHash,counts:preview.scan.counts,rowsRoot:preview.scan.rowsRoot,matchingIdentityBound:preview.scan.matchingIdentityBound,maxDocumentBytes:preview.scan.maxDocumentBytes,cursor:0,preparedAt:new Date().toISOString(),preparedComplete:false,scan:firestoreMigrationScan_(context)},firestoreMigrationContextBinding_(context));firestoreMigrationSaveState_(state);}
  if(state.rootHashVersion!==2)fail_('MIGRATION_STATE','旧形式の未完了移行は先に中止し、新しい確認からやり直してください。');firestoreMigrationAssertContext_(state,context,owner);firestoreMigrationConfirm_('PREPARE:'+state.sourceHash);if(state.phase!=='prepared')return firestoreMigrationSummary_(state,{more:false,frozen:true});var budget=firestoreMigrationBudget_(context);while(!state.preparedComplete&&firestoreMigrationBudgetNext_(budget)){firestoreMigrationScanPage_(context,state.scan);if(state.scan.done){firestoreMigrationAssertScan_(state,state.scan);state.preparedComplete=true;delete state.scan;}firestoreMigrationSaveState_(state);}return firestoreMigrationSummary_(state,{more:!state.preparedComplete,frozen:true});
});}
function firestoreMigrationBatchRead_(target,items){if(!items.length)return {};var names=items.map(function(item){return firestoreDocumentName_(target,'nodeWorkbooks/'+target.workbookId+'/'+item.path);});if(names.length>64)fail_('MIGRATION_LIMIT','検証ページの件数が多すぎます。');var response=firestoreRequest_('post',':batchGet',{documents:names},target),found=Object.create(null),seen=Object.create(null);if(!Array.isArray(response)||response.length!==names.length)fail_('MIGRATION_VERIFY_FAILED','Firebaseの確認応答が欠落しています。');response.forEach(function(entry){var name=entry&&entry.found&&entry.found.name||entry&&entry.missing;if(typeof name!=='string'||names.indexOf(name)<0||seen[name]||!!entry.found===!!entry.missing)fail_('MIGRATION_VERIFY_FAILED','Firebaseの確認位置が重複・不一致です。');seen[name]=true;if(entry.found)found[name]=entry.found;});return found;}
function firestoreMigrationEnsureDocuments_(target,items){var found=firestoreMigrationBatchRead_(target,items),writes=[];items.forEach(function(item){var name=firestoreDocumentName_(target,'nodeWorkbooks/'+target.workbookId+'/'+item.path),existing=found[name];if(existing){if(stableJson_(firestoreDecodeFields_(existing.fields))!==stableJson_(item.data))fail_('MIGRATION_VERIFY_FAILED','移行先に異なる内容があります。上書きせず停止しました。');}else writes.push(firestoreMigrationDocument_(target,item.path,item.data,{exists:false}));});firestoreMigrationWrite_(target,writes);}
function firestoreMigrationCheckDocuments_(target,items){var found=firestoreMigrationBatchRead_(target,items);items.forEach(function(item){var existing=found[firestoreDocumentName_(target,'nodeWorkbooks/'+target.workbookId+'/'+item.path)];if(!existing||stableJson_(firestoreDecodeFields_(existing.fields))!==stableJson_(item.data))fail_('MIGRATION_VERIFY_FAILED','Firebaseの行が不足・変更されています。保存先は切り替えていません。');});}
function firestoreMigrationAcceptProof_(state,proof){if(stableJson_(proof)===stableJson_(firestoreMigrationProof_(state,proof.state)))return true;var task=state.task;if(task&&task.kind==='verify'&&proof.state==='verified'&&typeof task.proofVerifiedAt==='string'){var future=Object.assign({},state,{verifiedAt:task.proofVerifiedAt});return stableJson_(proof)===stableJson_(firestoreMigrationProof_(future,'verified'));}return false;}
function firestoreMigrationCheckManifest_(state,context,allowed){var current=firestoreMigrationRead_(state.target,'');if(!current||typeof current.updateTime!=='string'||!current.updateTime)fail_('MIGRATION_VERIFY_FAILED','Firebaseの移行目録がありません。');var manifest=firestoreDecodeFields_(current.fields),proof=manifest.migrationProof,expected=Object.assign({},firestoreMigrationManifest_(context),{migrationProof:proof});if(!proof||allowed.indexOf(proof.state)<0||stableJson_(manifest)!==stableJson_(expected)||!firestoreMigrationAcceptProof_(state,proof))fail_('MIGRATION_VERIFY_FAILED','Firebaseの移行目録・証明が一致しません。');return {current:current,manifest:manifest};}
function importNodeFirestoreMigration(){firestoreMigrationReset_();return withLock_(function(){var owner=requireOwner_(),state=firestoreMigrationState_(),config=config_();if(!state||state.rootHashVersion!==2||['prepared','importing','ready'].indexOf(state.phase)<0||!state.preparedComplete)fail_('MIGRATION_STATE','分割した移行準備を最後まで実行してください。');var context=firestoreMigrationContext_(config);firestoreMigrationAssertContext_(state,context,owner);if(state.phase==='ready')return firestoreMigrationSummary_(state,{more:false,frozen:true});
  if(state.phase==='prepared'){var manifest=Object.assign({},firestoreMigrationManifest_(context),{migrationProof:firestoreMigrationProof_(state,'importing')}),existing=firestoreMigrationRead_(state.target,'');if(existing){if(stableJson_(firestoreDecodeFields_(existing.fields))!==stableJson_(manifest))fail_('MIGRATION_VERIFY_FAILED','移行先の目録が異なります。');}else firestoreMigrationWrite_(state.target,[firestoreMigrationDocument_(state.target,'',manifest,{exists:false})]);var tables=context.tables.map(function(info){return {path:'tables/'+info.id,data:firestoreMigrationTableData_(context,info,state.matchingIdentityBound)};});for(var offset=0;offset<tables.length;offset+=64)firestoreMigrationEnsureDocuments_(state.target,tables.slice(offset,offset+64));state.phase='importing';state.scan=firestoreMigrationScan_(context);firestoreMigrationSaveState_(state);}
  var budget=firestoreMigrationBudget_(context);while(!state.scan.done&&firestoreMigrationBudgetNext_(budget)){var page=firestoreMigrationScanPage_(context,state.scan);firestoreMigrationEnsureDocuments_(state.target,page.documents);state.cursor=context.tables.length+state.scan.counts.rowDocumentCount;firestoreMigrationSaveState_(state);}if(state.scan.done){firestoreMigrationAssertScan_(state,state.scan);var checked=firestoreMigrationCheckManifest_(state,context,['importing','ready']);if(checked.manifest.migrationProof.state!=='ready'){checked.manifest.migrationProof=firestoreMigrationProof_(state,'ready');firestoreMigrationWrite_(state.target,[firestoreMigrationDocument_(state.target,'',checked.manifest,{updateTime:checked.current.updateTime})]);}state.phase='ready';delete state.scan;firestoreMigrationSaveState_(state);}return firestoreMigrationSummary_(state,{more:state.phase!=='ready',frozen:true});
});}
function firestoreMigrationTargetListPage_(state,context,task){var list=task.list,prefix='nodeWorkbooks/'+state.target.workbookId,root=firestoreDocumentName_(state.target,prefix),page;
  if(!list.tablesDone){page=firestoreRequest_('get',prefix+'/tables?pageSize=64&showMissing=true'+(list.pageToken?'&pageToken='+encodeURIComponent(list.pageToken):''),undefined,state.target);firestoreMigrationListEnvelope_(page,list.pageToken);(page.documents||[]).forEach(function(document){var path=document&&document.name;if(typeof path!=='string'||path.indexOf(root+'/tables/')!==0||path.slice((root+'/tables/').length).indexOf('/')>=0||path<=list.lastName)fail_('MIGRATION_VERIFY_FAILED','Firebaseの表の一覧が重複・不一致です。');var idText=path.slice((root+'/tables/').length),info=context.tables.filter(function(t){return String(t.id)===idText;})[0];if(!info||!document.fields||stableJson_(firestoreDecodeFields_(document.fields))!==stableJson_(firestoreMigrationTableData_(context,info,state.matchingIdentityBound)))fail_('MIGRATION_VERIFY_FAILED','Firebaseに余分な表・変更された表があります。');list.lastName=path;list.tablesSeen++;});list.pageToken=page.nextPageToken||'';if(!list.pageToken){if(list.tablesSeen!==context.tables.length)fail_('MIGRATION_VERIFY_FAILED','Firebaseの表の件数が一致しません。');list.tablesDone=true;list.lastName='';}return;}
  if(list.tableIndex>=context.tables.length){if(list.rowCount!==state.counts.rowDocumentCount||list.rowsRoot!==state.rowsRoot)fail_('MIGRATION_VERIFY_FAILED','Firebaseの行の内容・件数が元データと一致しません。');list.done=true;return;}
  var info=context.tables[list.tableIndex],rowPrefix=root+'/tables/'+info.id+'/rows/';page=firestoreRequest_('get',prefix+'/tables/'+info.id+'/rows?pageSize='+Math.max(1,Math.min(64,Math.floor(3500000/Math.max(1,state.maxDocumentBytes))))+'&showMissing=true'+(list.pageToken?'&pageToken='+encodeURIComponent(list.pageToken):''),undefined,state.target);firestoreMigrationListEnvelope_(page,list.pageToken);(page.documents||[]).forEach(function(document){var path=document&&document.name,idText=typeof path==='string'&&path.slice(rowPrefix.length),row=Number(idText);if(typeof path!=='string'||path.indexOf(rowPrefix)!==0||!/^\d{8}$/.test(idText)||row<1||row>info.end||path<=list.lastName)fail_('MIGRATION_VERIFY_FAILED','Firebaseに余分な行・重複行・範囲外の行があります。');if(!document.fields)fail_('MIGRATION_VERIFY_FAILED','Firebaseに内容のない親行があります。');var data=firestoreDecodeFields_(document.fields);if(data.row!==row||typeof data.payload!=='string'||typeof data.hasMetadata!=='boolean'||firestoreMigrationUtf8Length_(data)>880000)fail_('MIGRATION_VERIFY_FAILED','Firebaseの行の保存形式が一致しません。');list.rowsRoot=firestoreMigrationRowsAdd_(list.rowsRoot,{path:'tables/'+info.id+'/rows/'+idText,data:data});list.rowCount++;if(list.rowCount>state.counts.rowDocumentCount)fail_('MIGRATION_VERIFY_FAILED','Firebaseに余分な行があります。');list.lastName=path;});list.pageToken=page.nextPageToken||'';if(!list.pageToken){list.tableIndex++;list.lastName='';}
}
function firestoreMigrationListEnvelope_(page,prior){if(!page||typeof page!=='object'||Array.isArray(page)||page.documents!==undefined&&!Array.isArray(page.documents)||(page.documents||[]).length>64||page.nextPageToken!==undefined&&(typeof page.nextPageToken!=='string'||page.nextPageToken.length>3000||page.nextPageToken&&page.nextPageToken===prior))fail_('MIGRATION_VERIFY_FAILED','Firebaseの一覧の確認位置が不正です。');}
function firestoreMigrationRunVerification_(state,context,owner,kind){
  firestoreMigrationAssertContext_(state,context,owner);if(!state.task||state.task.kind!==kind){if(state.task)fail_('MIGRATION_STATE','別の検証が途中です。同じ確認を続けてください。');var initial=firestoreMigrationCheckManifest_(state,context,kind==='activate'?['verified']:['ready','verified']);state.task={kind:kind,stage:'sourceBefore',manifestUpdateTime:initial.current.updateTime,proofVerifiedAt:kind==='verify'?new Date().toISOString():'',scan:firestoreMigrationScan_(context)};firestoreMigrationSaveState_(state);}
  var task=state.task,budget=firestoreMigrationBudget_(context);/* A persisted finalize cursor may be a lost proof receipt. Recheck from a fresh pass instead of trusting a possibly old completed scan. */if(task.stage==='finalize'){var recovery=firestoreMigrationCheckManifest_(state,context,kind==='activate'?['verified','active']:['ready','verified']);task.stage='sourceBefore';task.manifestUpdateTime=recovery.current.updateTime;task.scan=firestoreMigrationScan_(context);delete task.finishedAt;firestoreMigrationSaveState_(state);}if(task.stage!=='finalize'){var current=firestoreMigrationCheckManifest_(state,context,kind==='activate'?['verified','active']:['ready','verified']);if(current.current.updateTime!==task.manifestUpdateTime)fail_('MIGRATION_VERIFY_FAILED','確認中にFirebaseの目録が変更されました。');}
  while(task.stage!=='finalize'&&firestoreMigrationBudgetNext_(budget)){
    if(task.stage==='targetList'){firestoreMigrationTargetListPage_(state,context,task);if(task.list.done){delete task.list;task.stage='sourceAfter';task.scan=firestoreMigrationScan_(context);}}
    else {var page=firestoreMigrationScanPage_(context,task.scan);if(task.stage==='targetExact'||task.stage==='sourceAfter')firestoreMigrationCheckDocuments_(state.target,page.documents);if(task.scan.done){firestoreMigrationAssertScan_(state,task.scan);if(task.stage==='sourceBefore'){task.stage='targetExact';task.scan=firestoreMigrationScan_(context);var tables=context.tables.map(function(info){return {path:'tables/'+info.id,data:firestoreMigrationTableData_(context,info,state.matchingIdentityBound)};});for(var i=0;i<tables.length;i+=64)firestoreMigrationCheckDocuments_(state.target,tables.slice(i,i+64));}else if(task.stage==='targetExact'){delete task.scan;task.stage='targetList';task.list={tablesDone:false,tablesSeen:0,tableIndex:0,pageToken:'',lastName:'',rowCount:0,rowsRoot:firestoreMigrationRowsSeed_(),done:false};}else {delete task.scan;task.stage='finalize';task.finishedAt=new Date().toISOString();}}}
    firestoreMigrationSaveState_(state);
  }
  if(task.stage!=='finalize')return firestoreMigrationSummary_(state,{rootHashVersion:2,more:true,frozen:true,verificationStage:task.stage});
  firestoreMigrationAssertContext_(state,context,owner);var desiredState=Object.assign({},state);if(kind==='verify')desiredState.verifiedAt=task.proofVerifiedAt;var desiredPhase=kind==='activate'?'active':'verified',desiredProof=firestoreMigrationProof_(desiredState,desiredPhase),doc=firestoreMigrationRead_(state.target,''),manifest=doc&&firestoreDecodeFields_(doc.fields),expected=Object.assign({},firestoreMigrationManifest_(context),{migrationProof:manifest&&manifest.migrationProof});if(!manifest||stableJson_(manifest)!==stableJson_(expected))fail_('MIGRATION_VERIFY_FAILED','切替直前の移行目録が一致しません。');
  if(stableJson_(manifest.migrationProof)!==stableJson_(desiredProof)){if(doc.updateTime!==task.manifestUpdateTime||stableJson_(manifest.migrationProof)!==stableJson_(firestoreMigrationProof_(state,manifest.migrationProof.state)))fail_('MIGRATION_VERIFY_FAILED','検証中に移行証明が変わりました。');manifest.migrationProof=desiredProof;firestoreMigrationWrite_(state.target,[firestoreMigrationDocument_(state.target,'',manifest,{updateTime:doc.updateTime})]);}
  state.phase=desiredPhase;if(kind==='verify')state.verifiedAt=task.proofVerifiedAt;else state.activatedAt=task.finishedAt;delete state.task;firestoreMigrationSaveState_(state);
  if(kind==='activate'){props_().setProperties({NODE_FIRESTORE_CONFIG:JSON.stringify(state.target),NODE_STORAGE_PROVIDER:'firestore'});firestoreMigrationReset_();if(!firestoreMigrationReady_(config_()))fail_('MIGRATION_VERIFY_FAILED','切替後の保存先を確認できません。');return firestoreMigrationSummary_(state,{more:false,active:true,sourceUnchanged:true});}
  return firestoreMigrationSummary_(state,{more:false,verified:true,frozen:true,activateConfirmation:'ACTIVATE:'+state.sourceHash});
}
function verifyNodeFirestoreMigration(){firestoreMigrationReset_();return withLock_(function(){var owner=requireOwner_(),state=firestoreMigrationState_(),config=config_();if(!state||state.rootHashVersion!==2||['ready','verified'].indexOf(state.phase)<0)fail_('MIGRATION_STATE','取り込みを完了してから検証してください。');var context=firestoreMigrationContext_(config);return firestoreMigrationRunVerification_(state,context,owner,'verify');});}
/* The legacy activated proof remains readable. No source scan is needed to
 * recover an already active provider, so later legitimate app writes survive. */
function firestoreMigrationProofState_(proof){return {rootHashVersion:proof.rootHashVersion,target:{projectId:proof.projectId,databaseId:proof.databaseId,workbookId:proof.workbookId},sourceSpreadsheetId:proof.sourceSpreadsheetId,sourceConfigHash:proof.sourceConfigHash,runtimeConfigHash:proof.runtimeConfigHash,sourceHash:proof.sourceHash,importId:proof.importId};}
function activateNodeFirestoreMigration(){firestoreMigrationReset_();try{return withLock_(function(){var owner=requireOwner_(),state=firestoreMigrationState_(),config=config_();if(!state||['verified','active'].indexOf(state.phase)<0)fail_('MIGRATION_STATE','移行データの検証を完了してから切り替えてください。');firestoreMigrationConfirm_('ACTIVATE:'+state.sourceHash);if(state.phase==='active'){
  if(state.ownerEmail!==owner||state.runtimeConfigHash!==firestoreRuntimeConfigHash_(config))fail_('MIGRATION_VERIFY_FAILED','切替済みの保存先設定が一致しません。');var current=firestoreMigrationRead_(state.target,''),manifest=current&&firestoreDecodeFields_(current.fields),proof=manifest&&manifest.migrationProof;if(!manifest||manifest.sourceSpreadsheetId!==state.sourceSpreadsheetId||manifest.sourceConfigHash!==state.sourceConfigHash||manifest.runtimeConfigHash!==state.runtimeConfigHash||!Number.isSafeInteger(manifest.revision)||manifest.revision<0||!proof||proof.state!=='active'||stableJson_(firestoreMigrationBinding_(state))!==stableJson_(firestoreMigrationBinding_(firestoreMigrationProofState_(proof)))||!constantEqual_(proof.seal,firestoreMigrationSeal_(state)))fail_('MIGRATION_VERIFY_FAILED','切替済みのFirebase移行証明を確認できません。');if(props_().getProperty('NODE_STORAGE_PROVIDER')!=='firestore'||props_().getProperty('NODE_FIRESTORE_CONFIG')!==JSON.stringify(state.target))props_().setProperties({NODE_FIRESTORE_CONFIG:JSON.stringify(state.target),NODE_STORAGE_PROVIDER:'firestore'});firestoreMigrationReset_();if(!firestoreMigrationReady_(config))fail_('MIGRATION_VERIFY_FAILED','有効な保存先を確認できません。');return firestoreMigrationSummary_(state,{more:false,active:true});
  }if(state.rootHashVersion!==2)fail_('MIGRATION_STATE','旧形式の未完了移行は中止して再確認してください。');var context=firestoreMigrationContext_(config);return firestoreMigrationRunVerification_(state,context,owner,'activate');});}finally{if(typeof firestoreClose_==='function')firestoreClose_();}}
function cancelNodeFirestoreMigration(){firestoreMigrationReset_();return withLock_(function(){var owner=requireOwner_(),state=firestoreMigrationState_();if(!state||state.phase==='abandoned')return {more:false,canceled:true,sourceUnchanged:true};if(state.ownerEmail!==owner)fail_('FORBIDDEN','準備した所有者のみ移行を中止できます。');if(state.phase==='active'||props_().getProperty('NODE_STORAGE_PROVIDER')==='firestore')fail_('MIGRATION_ALREADY_ACTIVE','切替済みのため旧保存先には自動で戻しません。');firestoreMigrationConfirm_('CANCEL:'+state.sourceHash);state.phase='abandoned';state.abandonedAt=new Date().toISOString();delete state.scan;delete state.task;firestoreMigrationSaveState_(state);return firestoreMigrationSummary_(state,{more:false,canceled:true,sourceUnchanged:true});});}
function firestoreMigrationReady_(config){if(props_().getProperty('NODE_STORAGE_PROVIDER')!=='firestore')return false;var state=firestoreMigrationState_();if(!state||state.phase!=='active'||state.sourceSpreadsheetId===NODE.originalId||state.sourceSpreadsheetId!==config.spreadsheetId||state.runtimeConfigHash!==firestoreRuntimeConfigHash_(config))return false;var target=firestoreConfig_();if(stableJson_(target)!==stableJson_(state.target))return false;var book=firestoreOpenBook_(config),manifest=book._firestoreManifest;if(!manifest||manifest.sourceSpreadsheetId!==config.spreadsheetId||manifest.sourceConfigHash!==state.sourceConfigHash||manifest.runtimeConfigHash!==state.runtimeConfigHash||!manifest.migrationProof)return false;var proof=manifest.migrationProof;return proof.state==='active'&&proof.sourceHash===state.sourceHash&&stableJson_(firestoreMigrationBinding_(state))===stableJson_(firestoreMigrationBinding_(firestoreMigrationProofState_(proof)))&&constantEqual_(proof.seal,firestoreMigrationSeal_(state));}

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

/* Sales operations use the same atomic provider batch and operation receipt as activities.
 * Integrate readSalesWorkflow and four planners in nodeHandle_, mutation/freeze/read budgets,
 * teamMutationAction_ receipt handling, health feature, probe guard, and revalidateSalesPlan_.
 * recordProposalSent must load a writable/full store because it may allocate a business row.
 * This fragment never publishes private candidate data, financial terms or evidence references.
 */
var SALES_JOB_TAB='_NODE_work_jobs',SALES_PLAN_TAB='_NODE_proposal_plans',SALES_MATCH_TAB='_NODE_match_reports';
var SALES_HEADERS=['id','body','version','updatedAt'];
function salesMutationAction_(action){return ['saveWorkJob','saveProposalPlan','recordProposalSent','saveMatchReport'].indexOf(action)>=0;}
function salesObject_(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(function(k){return keys.indexOf(k)<0;}))fail_('VALIDATION','営業管理の入力項目を確認してください。');return value;}
function salesId_(value,empty){if(empty&&value==='')return '';if(!intakeId_(value))fail_('VALIDATION','営業管理のIDを確認してください。');return value;}
function salesText_(value,max,required){var out=intakeText_(value,max).trim();if(required&&!out)fail_('VALIDATION','必須の項目を入力してください。');return out;}
function salesNumber_(value,max){if(value!==null&&(typeof value!=='number'||!isFinite(value)||value<0||value>max))fail_('VALIDATION','数値を確認してください。未確認は空欄にしてください。');return value;}
function salesDate_(value,empty){if(empty&&value==='')return '';var d=day_(value);if(typeof value!=='string'||!d||d!==value||d>today_())fail_('INVALID_DATE','実施済みの有効な日付を指定してください。');return d;}
function salesPrice_(value){salesObject_(value,['amount','unit','tax']);return {amount:salesNumber_(value.amount,100000000),unit:choice_(value.unit,['unknown','hour','month','result']),tax:choice_(value.tax,['unknown','included','excluded'])};}
function salesJobBody_(p){salesObject_(p,['company','title','product','description','requirements','target','workMode','contractPeriod','weekendPolicy','inexperiencedAllowed','requiredSalesType','requiredIndustries','requiredOther','preferredSalesType','preferredIndustries','preferredOther','clientReviewConditions','minMonthlyHours','minWeeklyDays','timeWindow','pcTools','workConditions','rateUnit','rateMin','rateMax','tax','status']);var out={company:salesText_(p.company,100,true),title:salesText_(p.title,120,true),product:salesText_(p.product,500,false),description:salesText_(p.description,3000,false),requirements:salesText_(p.requirements,2000,false),target:salesText_(p.target,500,false),workMode:choice_(p.workMode,['unknown','remote','onsite','remote_after_training']),contractPeriod:salesText_(p.contractPeriod,500,false),weekendPolicy:choice_(p.weekendPolicy,['unknown','allowed','not_allowed','negotiable']),inexperiencedAllowed:choice_(p.inexperiencedAllowed,['unknown','yes','no']),requiredSalesType:choice_(p.requiredSalesType,['unknown','b2b','b2c','both']),requiredIndustries:salesText_(p.requiredIndustries,500,false),requiredOther:salesText_(p.requiredOther,1000,false),preferredSalesType:choice_(p.preferredSalesType,['unknown','b2b','b2c','both']),preferredIndustries:salesText_(p.preferredIndustries,500,false),preferredOther:salesText_(p.preferredOther,1000,false),clientReviewConditions:salesText_(p.clientReviewConditions,1000,false),minMonthlyHours:salesNumber_(p.minMonthlyHours,744),minWeeklyDays:salesNumber_(p.minWeeklyDays,7),timeWindow:salesText_(p.timeWindow,200,false),pcTools:salesText_(p.pcTools,1000,false),workConditions:salesText_(p.workConditions,2000,false),rateUnit:choice_(p.rateUnit,['unknown','hour','month','result']),rateMin:salesNumber_(p.rateMin,100000000),rateMax:salesNumber_(p.rateMax,100000000),tax:choice_(p.tax,['unknown','included','excluded']),status:choice_(p.status,['open','paused','closed'])};if(out.rateMin!==null&&out.rateMax!==null&&out.rateMin>out.rateMax)fail_('VALIDATION','単価の下限と上限を確認してください。');return out;}
function salesStamp_(v,empty){if(empty&&v==='')return '';if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(v)||!isFinite(Date.parse(v)))fail_('SCHEMA_MISMATCH','営業管理の日時を確認してください。');return v;}
function salesTable_(book,title,kind){
 var state=intakeTable_(book,title,SALES_HEADERS),seen=Object.create(null);
 state.entries=state.rows.map(function(row,index){
  var body;try{body=JSON.parse(row[1]);}catch(_){fail_('SCHEMA_MISMATCH','営業管理の保存内容を確認してください。');}
  salesId_(row[0]);salesId_(row[2]);salesStamp_(row[3]);if(seen[row[0]])fail_('SCHEMA_MISMATCH','営業管理IDが重複しています。');seen[row[0]]=true;
  if(!body||typeof body!=='object'||Array.isArray(body))fail_('SCHEMA_MISMATCH','営業管理の保存内容を確認してください。');
  var meta=['version','createdAt','updatedAt'];
  salesObject_(body,meta.concat(kind==='job'?['jobId','company','title','product','description','requirements','target','workMode','contractPeriod','weekendPolicy','inexperiencedAllowed','requiredSalesType','requiredIndustries','requiredOther','preferredSalesType','preferredIndustries','preferredOther','clientReviewConditions','minMonthlyHours','minWeeklyDays','timeWindow','pcTools','workConditions','rateUnit','rateMin','rateMax','tax','status','createdBy','updatedBy']:kind==='plan'?['planId','ownerId','recordId','profileId','company','jobId','status','reason','comment','sentDate','sentRecordId']:['reportId','ownerId','recordId','profileId','company','candidateName','agent','sale','wholesale','matchDate','comment','candidateEvidenceId','clientEvidenceId','status','confirmedBy','confirmedAt']));
  if(kind==='job'){
   var fields={};['company','title','product','description','requirements','target','workMode','contractPeriod','weekendPolicy','inexperiencedAllowed','requiredSalesType','requiredIndustries','requiredOther','preferredSalesType','preferredIndustries','preferredOther','clientReviewConditions','minMonthlyHours','minWeeklyDays','timeWindow','pcTools','workConditions','rateUnit','rateMin','rateMax','tax','status'].forEach(function(k){fields[k]=body[k];});salesJobBody_(fields);salesId_(body.jobId);teamAccount_(body.createdBy);teamAccount_(body.updatedBy);salesStamp_(body.createdAt);
  }else if(kind==='plan'){
   salesId_(body.planId);salesId_(body.recordId);salesId_(body.profileId,true);salesId_(body.jobId,true);salesId_(body.sentRecordId,true);teamAccount_(body.ownerId);salesText_(body.company,100,false);salesText_(body.reason,1000,false);salesText_(body.comment,2000,false);choice_(body.status,['planned','sent','unplaced','hold','canceled']);salesStamp_(body.createdAt);
   if(body.sentDate&&(!day_(body.sentDate)||day_(body.sentDate)!==body.sentDate)||body.status==='sent'&&(!body.sentDate||!body.sentRecordId)||body.status==='planned'&&!body.company)fail_('SCHEMA_MISMATCH','提案予定と提案実績の状態を確認してください。');
  }else{
   salesId_(body.reportId);salesId_(body.recordId);salesId_(body.profileId,true);teamAccount_(body.ownerId);salesText_(body.company,100,false);salesText_(body.candidateName,60,true);salesText_(body.agent,100,false);salesText_(body.comment,2000,false);salesPrice_(body.sale);salesPrice_(body.wholesale);salesId_(body.candidateEvidenceId,true);salesId_(body.clientEvidenceId,true);choice_(body.status,['draft','submitted','returned','confirmed']);salesStamp_(body.createdAt);salesStamp_(body.confirmedAt,true);if(body.confirmedBy)teamAccount_(body.confirmedBy);
   if(body.matchDate&&(!day_(body.matchDate)||day_(body.matchDate)!==body.matchDate))fail_('SCHEMA_MISMATCH','マッチ成立日を確認してください。');
  }
  var key=kind==='job'?'jobId':kind==='plan'?'planId':'reportId';if(body[key]!==row[0]||body.version!==row[2]||body.updatedAt!==row[3])fail_('SCHEMA_MISMATCH','営業管理の保存状態が一致しません。');body.row=index+2;return body;
 });return state;
}
function salesPublic_(entry){var out=Object.assign({},entry);delete out.row;return out;}
function salesTableCheck_(plan,title,state){teamTableCheck_(plan,title,SALES_HEADERS,state);}
function salesWrite_(store,plan,title,state,previous,next){next.version=Utilities.getUuid();next.updatedAt=new Date().toISOString();var body=salesPublic_(next),key=title===SALES_JOB_TAB?'jobId':title===SALES_PLAN_TAB?'planId':'reportId';intakeWritePlan_(store,plan,title,SALES_HEADERS,state,previous?previous.row:state.rows.length+2,[body[key],JSON.stringify(body),body.version,body.updatedAt]);}
function salesPrevious_(state,key,id,version){var previous=id?state.entries.find(function(p){return p[key]===salesId_(id);}):null;if(id&&!previous)fail_('NOT_FOUND','営業管理の対象が見つかりません。');if(previous?version!==previous.version:version!==undefined&&version!=='')fail_('CONFLICT','保存内容が更新されています。最新を取得してください。');return previous;}
function salesRecord_(store,user,id,profileId,rowVersion){var record=findRecord_(store,salesId_(id));actorOwns_(user,record);if(profileId!==undefined&&salesId_(profileId,true)!==(record.profileId||''))fail_('CONFLICT','候補者の基本情報との関連が変わっています。');if(rowVersion!==undefined)checkVersion_(record,rowVersion);if(record.profileId){var profiles=candidateProfileTable_(store.book);matchingProfile_(store,profiles,record,record.playerId);}return record;}
function salesPeriod_(value){if(value===undefined)return today_().slice(0,7);if(value==='all')return value;if(typeof value!=='string'||!/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/.test(value))fail_('VALIDATION','提案件数を表示する月を選んでください。');return value;}
function salesReadCounts_(store,plans,period){var out=Object.create(null),seen=Object.create(null),owners=Object.create(null);store.players.forEach(function(p){if(p.role==='player')owners[p.id]=true;});store.records.forEach(function(r){var company=String(r.values[1]||'').trim(),date=r.dates[1];if(!owners[r.playerId]||!company||!date||period!=='all'&&date.slice(0,7)!==period||seen[r.recordId])return;seen[r.recordId]=true;var key=clientNameKey_(company);if(!out[key])out[key]={company:company,planned:0,sent:0};out[key].sent++;});plans.forEach(function(p){var record=findRecord_(store,p.recordId);if(p.status!=='planned'||!p.company||!owners[p.ownerId]||!record||record.playerId!==p.ownerId||p.profileId&&(record.profileId||'')!==p.profileId)return;var key=clientNameKey_(p.company);if(!out[key])out[key]={company:p.company,planned:0,sent:0};out[key].planned++;});return Object.keys(out).map(function(k){return out[k];}).sort(function(a,b){return b.sent-a.sent||a.company.localeCompare(b.company);});}
function readSalesWorkflow_(request){
 salesObject_(request.payload||{},['period']);var period=salesPeriod_((request.payload||{}).period),session=authenticate_(request.token,false,request.background===true),accounts=readAccountStore_(),user=activeActor_(accounts,session),store=readStore_({readOnly:true},accounts),jobs=salesTable_(store.book,SALES_JOB_TAB,'job'),plans=salesTable_(store.book,SALES_PLAN_TAB,'plan'),reports=salesTable_(store.book,SALES_MATCH_TAB,'report');
 var visible=function(p){var record=findRecord_(store,p.recordId);return (user.role==='admin'||p.ownerId===user.id)&&record&&record.playerId===p.ownerId&&(!p.profileId||(record.profileId||'')===p.profileId);};
 var ownPlans=plans.entries.filter(visible),result={feature:true,schemaVersion:1,period:period,jobs:jobs.entries.map(salesPublic_),plans:ownPlans.map(salesPublic_),reports:reports.entries.filter(visible).map(salesPublic_),companyCounts:salesReadCounts_(store,plans.entries,period),checkedAt:new Date().toISOString()};
 snapshotActor_(store,request.token);return result;
}
function planWorkJob_(store,user,payload){
 requireAdmin_(user);salesObject_(payload,['jobId','version','company','title','product','description','requirements','target','workMode','contractPeriod','weekendPolicy','inexperiencedAllowed','requiredSalesType','requiredIndustries','requiredOther','preferredSalesType','preferredIndustries','preferredOther','clientReviewConditions','minMonthlyHours','minWeeklyDays','timeWindow','pcTools','workConditions','rateUnit','rateMin','rateMax','tax','status']);var state=salesTable_(store.book,SALES_JOB_TAB,'job'),previous=salesPrevious_(state,'jobId',payload.jobId,payload.version),fields=Object.assign({},payload);delete fields.jobId;delete fields.version;
 var next=Object.assign(salesJobBody_(fields),{jobId:previous?previous.jobId:Utilities.getUuid(),createdBy:previous?previous.createdBy:user.id,updatedBy:user.id,createdAt:previous?previous.createdAt:new Date().toISOString()}),plan={requests:[],result:{jobId:next.jobId},teamAdminRequired:true};salesWrite_(store,plan,SALES_JOB_TAB,state,previous,next);return plan;
}
function planProposalPlan_(store,user,payload){
 salesObject_(payload,['planId','version','recordId','profileId','rowVersion','company','jobId','status','reason','comment']);var record=salesRecord_(store,user,payload.recordId,payload.profileId,payload.rowVersion),state=salesTable_(store.book,SALES_PLAN_TAB,'plan'),previous=salesPrevious_(state,'planId',payload.planId,payload.version),status=choice_(payload.status,['planned','unplaced','hold','canceled']),company=salesText_(payload.company,100,false),jobId=salesId_(payload.jobId,true),reason=salesText_(payload.reason,1000,false),comment=salesText_(payload.comment,2000,false);
 if(previous&&(previous.recordId!==record.recordId||previous.ownerId!==record.playerId||previous.profileId&&previous.profileId!==(record.profileId||'')))fail_('FORBIDDEN','別の候補者の提案予定には変更できません。');if(previous&&previous.status==='sent')fail_('VALIDATION','提案済みの実績は実績の詳細から訂正してください。');
 if(status==='planned'&&!company)fail_('VALIDATION','提案予定の会社を選んでください。');if(['unplaced','hold'].indexOf(status)>=0&&!reason)fail_('VALIDATION','提案先なし・保留の理由を記録してください。');if(status==='unplaced'&&(company||jobId))fail_('VALIDATION','提案先なしは会社・案件を空欄にしてください。');
 var jobs=salesTable_(store.book,SALES_JOB_TAB,'job'),job=jobId?jobs.entries.find(function(j){return j.jobId===jobId;}):null;if(jobId&&(!job||job.status!=='open'||clientNameKey_(company)!==clientNameKey_(job.company)))fail_('VALIDATION','募集中の案件と会社を選び直してください。');
 if(state.entries.some(function(p){return (!previous||p.planId!==previous.planId)&&p.ownerId===record.playerId&&(record.profileId?p.profileId===record.profileId:p.recordId===record.recordId)&&p.status===status&&(status==='unplaced'||clientNameKey_(p.company)===clientNameKey_(company)&&p.jobId===jobId);}))fail_('VALIDATION','同じ提案予定が登録済みです。既存の予定を編集してください。');
 var next={planId:previous?previous.planId:Utilities.getUuid(),ownerId:record.playerId,recordId:record.recordId,profileId:record.profileId||'',company:company,jobId:jobId,status:status,reason:reason,comment:comment,sentDate:'',sentRecordId:'',createdAt:previous?previous.createdAt:new Date().toISOString()},plan={requests:[],result:{planId:next.planId}};salesWrite_(store,plan,SALES_PLAN_TAB,state,previous,next);salesTableCheck_(plan,SALES_JOB_TAB,jobs);addProfileRecordChecks_(plan,[record]);return plan;
}
function planProposalSent_(store,user,payload){
 salesObject_(payload,['planId','version','rowVersion','date']);var state=salesTable_(store.book,SALES_PLAN_TAB,'plan'),previous=salesPrevious_(state,'planId',payload.planId,payload.version);if(!previous)fail_('NOT_FOUND','提案予定を選んでください。');var source=salesRecord_(store,user,previous.recordId,previous.profileId||undefined,payload.rowVersion),date=salesDate_(payload.date,false);if(previous.status!=='planned'||!previous.company)fail_('VALIDATION','提案予定を選んでから実施済みとして記録してください。');
 var related=store.records.filter(function(r){return r.playerId===source.playerId&&(source.profileId?r.profileId===source.profileId:r.recordId===source.recordId);}),same=related.filter(function(r){return clientNameKey_(String(r.values[1]||''))===clientNameKey_(previous.company);});if(same.length>1)fail_('CONFLICT','同じ会社の提案行が複数あります。既存の履歴を確認してください。');var existing=same[0]||(!source.values[1]&&!source.dates[1]?source:null),plan,interview=related.map(function(r){return r.dates[0];}).filter(Boolean).sort()[0];if(!interview)fail_('VALIDATION','この候補者の面談実施を先に記録してください。');
 if(existing&&existing.dates[1]){if(existing.dates[1]!==date)fail_('ALREADY_RECORDED','この会社への提案は記録済みです。実施日を履歴で確認してください。');plan={requests:[],result:{recordId:existing.recordId}};}
 else{
  // A same-name row is never chosen as the source. The exact record/profile relation was checked above.
  var activity={playerId:source.playerId,candidateName:source.name,company:previous.company,stage:'提案',date:date,position:source.values[5],source:source.source||''};if(existing){activity.recordId=existing.recordId;activity.rowVersion=existing.version;}else if(source.profileId)activity.profileSourceRecordId=source.recordId;else fail_('VALIDATION','別会社への提案を追加する前に、この候補者の基本情報を保存してください。');
  plan=planActivity_(store,user,activity);if(!existing||!existing.dates[0])setPatch_(plan,1,dayDate_(interview));
 }
 addProfileRecordChecks_(plan,related);if(source.profileId)addProfileGroupCheck_(store,plan,source.profileId);var target=plan.result.recordId,next=Object.assign({},previous,{status:'sent',profileId:source.profileId||'',sentDate:date,sentRecordId:target});delete next.row;plan.result.planId=previous.planId;salesWrite_(store,plan,SALES_PLAN_TAB,state,previous,next);return plan;
}
function planMatchReport_(store,user,payload){
 salesObject_(payload,['reportId','version','recordId','profileId','rowVersion','agent','sale','wholesale','matchDate','comment','candidateEvidenceId','clientEvidenceId','status','confirmAgreement','recordMatch']);var record=salesRecord_(store,user,payload.recordId,payload.profileId,payload.rowVersion),state=salesTable_(store.book,SALES_MATCH_TAB,'report'),previous=salesPrevious_(state,'reportId',payload.reportId,payload.version),status=choice_(payload.status,['draft','submitted','returned','confirmed']);
 if(previous&&(previous.recordId!==record.recordId||previous.ownerId!==record.playerId||previous.profileId&&previous.profileId!==(record.profileId||'')))fail_('FORBIDDEN','別の候補者のマッチ報告には変更できません。');if(!previous&&state.entries.some(function(p){return p.recordId===record.recordId;}))fail_('VALIDATION','この提案のマッチ報告は登録済みです。既存の報告を編集してください。');
 if(previous&&previous.status==='confirmed')fail_('VALIDATION','確認済みの報告は変更できません。管理者へ訂正を依頼してください。');if(['returned','confirmed'].indexOf(status)>=0){requireAdmin_(user);if(!previous||previous.status!=='submitted')fail_('VALIDATION','提出済みの報告を選んでください。');}else if(previous&&previous.status==='submitted')fail_('VALIDATION','提出済みです。管理者による確認・差し戻しをお待ちください。');
 if(typeof payload.confirmAgreement!=='boolean'||typeof payload.recordMatch!=='boolean')fail_('VALIDATION','成立の確認と実績反映の選択を確認してください。');
 var sale=salesPrice_(payload.sale),wholesale=salesPrice_(payload.wholesale),date=salesDate_(payload.matchDate,true),agent=salesText_(payload.agent,100,false),comment=salesText_(payload.comment,2000,false),candidateEvidenceId=salesId_(payload.candidateEvidenceId,true),clientEvidenceId=salesId_(payload.clientEvidenceId,true),submitting=status==='submitted'||status==='confirmed';
 if(submitting){if(!payload.confirmAgreement||!record.values[1]||!date||sale.amount===null||wholesale.amount===null||sale.unit==='unknown'||wholesale.unit==='unknown'||sale.tax==='unknown'||wholesale.tax==='unknown'||!candidateEvidenceId||!clientEvidenceId||candidateEvidenceId===clientEvidenceId)fail_('VALIDATION','成立日・会社・合意単価・税区分と、候補者側/クライアント側それぞれの証拠を確認してください。');if(typeof salesValidateEvidence_!=='function')fail_('FEATURE_UNAVAILABLE','証拠ファイルの権限確認を利用できないため、提出を停止しました。下書きは保存できます。');salesValidateEvidence_(store,user,[candidateEvidenceId,clientEvidenceId],record);}
 if(status==='returned'&&!comment)fail_('VALIDATION','差し戻し理由を記録してください。');if(payload.recordMatch&&!submitting)fail_('VALIDATION','マッチ実績への反映は成立確認済みの提出時に選択してください。');
 var plan={requests:[],result:{recordId:record.recordId}},matchIndex=NODE.stages.indexOf('内定承諾');if(submitting&&record.dates[matchIndex]&&record.dates[matchIndex]!==date)fail_('CONFLICT','登録済みのマッチ実施日と一致しません。履歴の日付を確認してください。');if(payload.recordMatch&&!record.dates[matchIndex])plan=planActivity_(store,user,{recordId:record.recordId,rowVersion:record.version,playerId:record.playerId,candidateName:record.name,company:String(record.values[1]||''),stage:'内定承諾',date:date,position:record.values[5],source:record.source||''});
 var next={reportId:previous?previous.reportId:Utilities.getUuid(),ownerId:record.playerId,recordId:record.recordId,profileId:record.profileId||'',company:String(record.values[1]||''),candidateName:record.name,agent:agent,sale:sale,wholesale:wholesale,matchDate:date,comment:comment,candidateEvidenceId:candidateEvidenceId,clientEvidenceId:clientEvidenceId,status:status,confirmedBy:status==='confirmed'?user.id:'',confirmedAt:status==='confirmed'?new Date().toISOString():'',createdAt:previous?previous.createdAt:new Date().toISOString()};plan.result.reportId=next.reportId;salesWrite_(store,plan,SALES_MATCH_TAB,state,previous,next);addProfileRecordChecks_(plan,[record]);if(submitting)plan.salesEvidence={ids:[candidateEvidenceId,clientEvidenceId],recordId:record.recordId};return plan;
}
function revalidateSalesPlan_(store,user,plan){if(plan.salesEvidence){if(typeof salesValidateEvidence_!=='function')fail_('FEATURE_UNAVAILABLE','証拠の確認を利用できません。');salesValidateEvidence_(store,user,plan.salesEvidence.ids,findRecord_(store,plan.salesEvidence.recordId));}}

/* Generated from the shared introduction V2 renderer. Do not edit. */
var NODE_INTRODUCTION_V2 = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region lib/introduction-style.ts
	/** Reusable structure recovered from the approved examples. Contains no candidate facts. */
	const introductionHeadings = {
		basic: "基本情報",
		experience: "営業経験・職務経歴",
		results: "営業における強み",
		tools: "使用ツール",
		availability: "面談可能日",
		summary: "総評"
	};
	[
		"保存済みの紹介文書式を毎回使用してください。参考文の再入力は不要です。",
		"見出しは【基本情報】【営業経験・職務経歴】【営業における強み】【使用ツール】【面談可能日】【総評】です。項目順と省略は文章設定に従ってください。",
		"基本情報は氏名・年齢・居住地・稼働条件などの入力済み項目を『項目：内容』で改行して記載します。",
		"営業経験・職務経歴は在籍企業や期間が入力されている場合だけ『■ 企業名・期間』で区切ります。商材・営業手法・〈主な業務〉・〈営業実績〉も、入力に事実がある場合だけ使います。商材、対象（BtoB・BtoC等）、営業手法、担当した主な業務、営業実績を分け、別の会社・期間の情報を混ぜないでください。",
		"営業における強みは入力済みの実績・強みだけを『・』で列挙します。確認・記録・準備・聞き方など、入力された具体的な行動や工夫を根拠にして書き、抽象的な能力評価へ膨らませないでください。本人の強みの申告は、自己申告であることを残してください。",
		"使用ツールは入力された名称を『／』で区切り、使用経験あり・使用経験なし・未確認を区別してください。PC環境があるだけでツールを使えると判断せず、ツール名から業務経験や習熟度を補わないでください。未確認の欄を共有本文へ列挙する必要はありません。",
		"面談可能日・面談予定は、入力にある候補日・時間帯・調整中の条件だけをまとめてください。未確定の候補を確定予定に変えず、稼働開始可能日とも混同しないでください。",
		"総評は経験領域、代表的な実績、具体的な工夫、稼働条件の順を基本に、入力済みの事実を2〜4文程度で自然につなぎます。情報が少ない場合は短くし、人物の評価・推薦・新しい実績を作らないでください。材料がない要素は省略し、前の欄と同じ箇条書きやラベルを反復するだけの文章にはしないでください。",
		"『約』『最大』『平均』『日次』『時間あたり』『目標』『実績』『本人申告』など、数字の意味・集計期間・対象を限定する修飾を厳密に残してください。目標を達成実績に、最大を平均に、日次を月次に置き換えないでください。月と日、期間と日時を取り違えないでください。",
		"経験月数の合算、達成率やアポ率の算出、時間単価への換算は、元の入力に結果が明記されていない限り行わないでください。空白の単位や比較対象を推測して埋めないでください。",
		"未経験を『ポテンシャルがある』『成長が期待できる』などと自動評価せず、勤怠・定着・人物像・適性も推測しないでください。未経験という事実と、確認済みの担当業務・希望条件を分けて伝えてください。",
		"『即戦力』『確実にチームを牽引する』などの断定や、年齢からの評価は紹介文の型として採用しないでください。PCの所持状況や稼働の制約は確認済みの条件として扱い、その背景にある家庭・健康の事情は共有本文へ入れないでください。",
		"口語・誤字は意味が確実な範囲だけ自然なビジネス文へ整えてください。人名・企業名・地名、数値、期間、否定、条件の範囲を変えないでください。曖昧な表記は勝手に確定せず、確認事項へ分けてください。",
		"共有本文には空の見出しや『記載なし』『情報なし』を出さず、入力のない項目は省略してください。社内のヒアリング漏れ、提案先についての相談、担当者の主観、内部の確認作業は、クライアント向け本文へ入れないでください。",
		"Markdownの太字やコードは使わず、そのままクライアントへ送れる日本語の本文にしてください。"
	].join("\n");
	const headingAliases = {
		...Object.fromEntries(Object.values(introductionHeadings).map((heading) => [heading, heading])),
		"基本情報・稼働条件": introductionHeadings.basic,
		"営業経験・職歴": introductionHeadings.experience,
		"確認済みの実績・強み": introductionHeadings.results,
		"実績・強み": introductionHeadings.results,
		"PC・使用ツール": introductionHeadings.tools,
		"PC・利用ツール": introductionHeadings.tools,
		"事実の紹介概要": introductionHeadings.summary,
		"紹介概要": introductionHeadings.summary
	};
	Object.keys(headingAliases);
	//#endregion
	//#region lib/candidate-intake.ts
	/** Candidate information is formatted in this browser. No external service is called. */
	const interviewStringFields = [
		"age",
		"gender",
		"residence",
		"availableFrom",
		"timeWindow",
		"daysPerWeek",
		"monthlyHours",
		"sideJob",
		"desiredHourlyRate",
		"pcEnvironment",
		"networkEnvironment",
		"attendanceConcerns",
		"workHistory",
		"achievements",
		"strengths",
		"crmOther",
		"chatOther",
		"interviewAvailability",
		"workStyle",
		"pcSkills",
		"additionalNotes",
		"interviewMemo",
		"selfReflection",
		"interviewAdvice"
	];
	function blankInterviewFields() {
		return Object.assign(Object.fromEntries(interviewStringFields.map((key) => [key, ""])), {
			crmTools: [],
			chatTools: []
		});
	}
	/** Normalizes the known schema without shortening source information. */
	function normalizeInterviewFields(value) {
		const result = blankInterviewFields();
		if (!value || typeof value !== "object" || Array.isArray(value)) return result;
		const source = value;
		for (const key of interviewStringFields) if (typeof source[key] === "string") result[key] = source[key].replace(/\r\n?/g, "\n");
		for (const key of ["crmTools", "chatTools"]) if (Array.isArray(source[key])) result[key] = [...new Set(source[key].filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
		return result;
	}
	function unicodeLength(value) {
		return Array.from(value).length;
	}
	//#endregion
	//#region lib/introduction-review.ts
	const personalDetail = /(?:持病(?:で|が|の治療|を治療|あり|有り)|通院(?:しています|しております|しており|しているため|をしています|をしております|中です|予定です)|(?:毎週|定期的に|週\d+回|月\d+回)[^。\n]{0,8}通院|(?:家族|両親|親|父|母|祖父|祖母)の介護(?:で|のため|があり|中|をして|に伴|により|に専念|が必要|と両立|による)|(?:子ども|子供|お子様|息子|娘)(?:の|が)[^。\n]{0,10}(?:発熱|体調不良|送迎|通院|入院)(?:で|のため|があり|あり|への対応|によ|をして|をする|が必要|など|[：:]|$))/;
	/** Apply the same content boundary to a model draft or a manually polished candidate. */
	function introductionContentIssues(draft) {
		const issues = [];
		if (personalDetail.test(draft)) issues.push("source-private-detail");
		if (/採用(?:すべき|を推奨|適性|可否)|不採用(?:を推奨|にすべき)|(?:能力|適性|人物)(?:評価|スコア|点数)|\d+\s*点満点|即戦力(?:です|として|と判断|人材|の人材)|優秀な(?:人材|候補者)|ポテンシャル(?:が高|の高|に期待)|成長が期待/.test(draft)) issues.push("source-assessment");
		if (/(?<![〇零一二三四五六七八九十百千万億0-9０-９])[〇○◯●□]{2,}(?![〇零一二三四五六七八九十百千万億0-9０-９])|(?:\b|[：:])X{2,}(?=\b|[位件円年名社])/i.test(draft)) issues.push("source-format");
		const schemaArtifact = /["'](?:\$schema|properties|required|additionalProperties|responseConstraint|minLength|maxLength|minItems|maxItems|draft|summary|questions|actions)["']\s*:|["']type["']\s*:\s*["'](?:object|array|string|integer|number|boolean|null)["']|```(?:json)?\s*[\[{]/i;
		let decoded = draft;
		for (let depth = 0; depth < 3; depth++) {
			if (schemaArtifact.test(decoded)) {
				issues.push("source-format");
				break;
			}
			try {
				const value = JSON.parse(decoded);
				if (value !== null && typeof value === "object") {
					issues.push("source-format");
					break;
				}
				if (typeof value !== "string" || value === decoded) break;
				decoded = value;
			} catch {
				break;
			}
		}
		return issues;
	}
	//#endregion
	//#region lib/introduction-normalization.ts
	const rangeSeparator = /\s*(?:[〜～~－ー−–—-]|から)\s*/;
	const currency = (value) => Number(value.replace(/,/g, "")).toLocaleString("en-US", { maximumFractionDigits: 8 }) + "円";
	const timePart = (raw) => {
		const part = raw.trim().replace(/時(?=\d)/, ":").replace(/時$/, "").replace(/分$/, "");
		let h, m;
		if (/^\d{1,2}:\d{2}$/.test(part)) [h, m] = part.split(":").map(Number);
		else if (/^\d{1,2}$/.test(part)) {
			h = Number(part);
			m = 0;
		} else if (/^\d{3,4}$/.test(part)) {
			h = Number(part.slice(0, -2));
			m = Number(part.slice(-2));
		} else return null;
		if (h > 23 || m > 59) return null;
		return {
			minutes: h * 60 + m,
			text: `${h}:${String(m).padStart(2, "0")}`
		};
	};
	function clockRange(value) {
		let parts = value.split(rangeSeparator);
		if (parts.length === 1 && /^\d{6,8}$/.test(value)) {
			const split = value.length === 8 ? 4 : 3;
			parts = [value.slice(0, split), value.slice(split)];
		}
		if (parts.length === 1) return timePart(value)?.text ?? null;
		if (parts.length !== 2) return null;
		const start = timePart(parts[0]), end = timePart(parts[1]);
		if (!start || !end || end.minutes <= start.minutes) return null;
		return `${start.text}〜${end.text}`;
	}
	function money(value) {
		const parts = value.replace(/^(?:希望(?:単価)?|単価)\s*[：:]?\s*/, "").replace(/円/g, "").trim().split(rangeSeparator);
		if (parts.length > 2 || parts.some((part) => !/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,4})?$/.test(part))) return null;
		if (parts.some((part) => !Number.isFinite(Number(part.replace(/,/g, ""))) || Number(part.replace(/,/g, "")) > 0xe8d4a51000)) return null;
		if (parts.length === 2 && Number(parts[0].replace(/,/g, "")) > Number(parts[1].replace(/,/g, ""))) return null;
		return parts.map(currency).join("〜");
	}
	const prefectures = {
		東京: "東京都",
		京都: "京都府",
		大阪: "大阪府",
		北海道: "北海道",
		...Object.fromEntries("青森 岩手 宮城 秋田 山形 福島 茨城 栃木 群馬 埼玉 千葉 神奈川 新潟 富山 石川 福井 山梨 長野 岐阜 静岡 愛知 三重 滋賀 兵庫 奈良 和歌山 鳥取 島根 岡山 広島 山口 徳島 香川 愛媛 高知 福岡 佐賀 長崎 熊本 大分 宮崎 鹿児島 沖縄".split(" ").map((name) => [name, `${name}県`]))
	};
	const toolNames = {
		sf: "Salesforce",
		salesforce: "Salesforce",
		kintone: "kintone",
		hubspot: "HubSpot",
		slack: "Slack",
		chatwork: "Chatwork",
		teams: "Microsoft Teams",
		zoom: "Zoom",
		googlemeet: "Google Meet"
	};
	const salesStyleNames = {
		てれあぽ: "テレアポ",
		てれま: "テレマーケティング",
		テレマ: "テレマーケティング",
		いんさいどせーるす: "インサイドセールス",
		ふぃーるどせーるす: "フィールドセールス",
		かすたまーさくせす: "カスタマーサクセス",
		あぽいんたー: "アポインター",
		ほうじんえいぎょう: "法人営業",
		こじんえいぎょう: "個人営業",
		b2b: "BtoB",
		btob: "BtoB",
		b2c: "BtoC",
		btoc: "BtoC"
	};
	function normalizeIntroductionValue(field, raw) {
		const original = typeof raw === "string" ? raw : "";
		const text = original.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
		const result = (value, kind) => ({
			raw: original,
			value,
			status: value === original ? "unchanged" : "normalized",
			...kind ? { kind } : {}
		});
		const ask = (question) => ({
			raw: original,
			value: original,
			status: "needs-confirmation",
			question
		});
		if (!text) return result("");
		if (field === "timeWindow") {
			const time = clockRange(text);
			if (time) return result(time, "time");
			if (/^[\d\s:時分〜～~－ー−–—-]+$/.test(text) || /^\d.*から\d/.test(text)) return ask("実在する開始・終了時刻を確認してください。日をまたぐ場合は「翌」を記入してください。");
			return result(text);
		}
		if (field === "rate") {
			const amount = money(text);
			return amount ? result(amount, "money") : result(text);
		}
		if (field === "freeText") {
			if (/^(?:希望(?:単価)?|単価)\s*[：:]?\s*\d/.test(text)) {
				const amount = money(text);
				if (amount) return result(amount, "money");
			}
			const parts = text.split(rangeSeparator);
			if (parts.length === 2 && parts.every((part) => /^\d{1,4}$/.test(part))) {
				const start = timePart(parts[0]), end = timePart(parts[1]);
				if (/^\d{4}$/.test(parts[0]) && !parts[0].startsWith("0") && start && end) return ask("この数値は稼働時間ですか、希望単価の幅ですか？");
				if (/^0\d{3}$/.test(parts[0]) && start && end && end.minutes > start.minutes) return result(`${start.text}〜${end.text}`, "time");
				if (parts[0].length === 3 && start && end && end.minutes > start.minutes) return result(`${start.text}〜${end.text}`, "time");
				if (!start && !end) {
					const amount = money(text);
					if (amount) return result(amount, "money");
				}
				return ask("この数値は稼働時間ですか、希望単価の幅ですか？");
			}
			if (/^\d{1,8}$/.test(text)) return ask("この数値が表す項目と単位を確認してください。");
			return result(text);
		}
		if (field === "monthlyHours" && /^(?:月\s*)?\d+(?:\.\d+)?(?:\s*時間)?$/.test(text)) {
			const amount = text.match(/\d+(?:\.\d+)?/)[0];
			if (Number(amount) > 744) return ask("月間稼働時間が744時間を超えています。単位と数値を確認してください。");
			return result(`${amount}時間`);
		}
		if (field === "age" && /^\d+(?:\s*歳)?$/.test(text)) {
			const n = Number(text.match(/\d+/)[0]);
			return n > 120 ? ask("年齢の数値を確認してください。") : result(`${n}歳`);
		}
		if (field === "residence") return result(prefectures[text] ?? text);
		if (field === "availableFrom") {
			const match = text.match(/^(?:(\d{4})[\/.-])?(\d{1,2})[\/.-](\d{1,2})(?:から)?$/);
			if (match) {
				const year = match[1] ? Number(match[1]) : 2e3, month = Number(match[2]), day = Number(match[3]);
				const date = new Date(Date.UTC(year, month - 1, day));
				if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return ask("実在する稼働開始日を確認してください。");
				return result(`${match[1] ? `${match[1]}年` : ""}${month}月${day}日`);
			}
			return result(text);
		}
		if (field === "pcEnvironment") return result({
			win: "Windows",
			windows: "Windows",
			mac: "Mac",
			macbook: "MacBook"
		}[text.toLowerCase()] ?? text);
		if (field === "networkEnvironment" && /^(?:OK|回線OK)$/i.test(text)) return result("問題なし");
		if (field === "attendanceNote" && /^(?:なし|懸念なし)$/.test(text)) return result("特になし");
		if (field === "tool") return result(toolNames[text.toLowerCase().replace(/\s/g, "")] ?? text);
		if (field === "salesStyle") return result(text.split(/([・、,／/\n]+)/).map((part) => salesStyleNames[part.trim().toLowerCase()] ?? part).join(""));
		return result(text);
	}
	/** Only a year explicitly present in the source may be compared with today. */
	function introductionStartDateState(raw, now = /* @__PURE__ */ new Date()) {
		const text = normalizeIntroductionValue("availableFrom", raw).value;
		const match = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
		if (!match) return /^\d{1,2}月\d{1,2}日$/.test(text) ? "year-unknown" : "unparsed";
		return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` < new Intl.DateTimeFormat("sv-SE", {
			timeZone: "Asia/Tokyo",
			year: "numeric",
			month: "2-digit",
			day: "2-digit"
		}).format(now) ? "past" : "not-past";
	}
	//#endregion
	//#region lib/introduction-v2.ts
	const introductionV2Version = "2026-11-06";
	/** A safety/storage limit, not a writing target. Facts are never cut to fit it. */
	const introductionV2MaxLength = 2e4;
	const introductionV2Headings = [
		"基本情報",
		"営業経験・職務経歴",
		"成果を出すための工夫",
		"使用ツール・環境",
		"総評"
	];
	const blankIntroductionRate = () => ({
		amount: "",
		unit: "unknown",
		tax: "unknown"
	});
	const blankIntroductionV2Settings = () => ({
		version: "initial",
		sources: [],
		sourceAliases: {},
		blockedTerms: [],
		clients: []
	});
	function blankIntroductionCareer(id) {
		return {
			id,
			company: "",
			product: "",
			period: "",
			salesStyle: "",
			duties: [],
			achievements: [],
			tips: []
		};
	}
	function blankIntroductionV2Profile(candidateName = "") {
		return {
			schemaVersion: 2,
			candidateName,
			source: "",
			basic: {
				furigana: "",
				age: "",
				residence: "",
				availableFrom: "",
				timeWindow: "",
				monthlyHours: "",
				desiredRate: blankIntroductionRate(),
				pcEnvironment: "",
				networkEnvironment: "",
				shareableAttendanceNote: "",
				daysPerWeek: "",
				weekdays: "",
				sideJob: "",
				pcCamera: ""
			},
			careers: [],
			experienceTotal: "",
			tips: [],
			tools: [],
			interviewAvailability: "",
			internalMemo: ""
		};
	}
	function parseIntroductionRate(raw) {
		const value = raw.normalize("NFKC").trim();
		const unit = /時給|(?:円\s*)?[\/／]\s*(?:時(?:間)?|h)/i.test(value) ? "hour" : /日給|(?:円\s*)?[\/／]\s*日/.test(value) ? "day" : /月給|月額|(?:円\s*)?[\/／]\s*月/.test(value) ? "month" : /案件|一式|件単価|円\s*[\/／]\s*件/.test(value) ? "project" : "unknown";
		const tax = /税込/.test(value) ? "inclusive" : /税抜|税別/.test(value) ? "exclusive" : "unknown";
		return {
			amount: normalizeIntroductionValue("rate", value.replace(/(?:時給|日給|月給|月額|件単価|希望単価|希望)/g, "").replace(/[（(]?(?:税込|税抜|税別)[）)]?/g, "").replace(/[\/／]\s*(?:時間|時|日|月|件|h)/gi, "").trim()).value,
			unit,
			tax
		};
	}
	/** An explicit import adapter, not a data migration. Private legacy fields stay private. */
	function introductionV2FromLegacy(candidateName, raw, source = "") {
		const fields = normalizeInterviewFields(raw), profile = blankIntroductionV2Profile(candidateName);
		profile.source = source;
		for (const key of [
			"age",
			"residence",
			"availableFrom",
			"timeWindow",
			"monthlyHours",
			"pcEnvironment",
			"networkEnvironment",
			"daysPerWeek",
			"sideJob"
		]) profile.basic[key] = fields[key];
		profile.basic.desiredRate = parseIntroductionRate(fields.desiredHourlyRate);
		if (fields.workHistory.trim() || fields.achievements.trim()) profile.careers = [{
			...blankIntroductionCareer("legacy-career"),
			duties: fields.workHistory.trim() ? [fields.workHistory] : [],
			achievements: fields.achievements.trim() ? [fields.achievements] : []
		}];
		profile.tips = fields.strengths.trim() ? [fields.strengths] : [];
		profile.tools = [
			...fields.crmTools.filter((tool) => tool !== "その他"),
			fields.crmOther,
			...fields.chatTools.filter((tool) => tool !== "その他"),
			fields.chatOther,
			fields.pcSkills
		].filter((value) => value.trim());
		profile.interviewAvailability = fields.interviewAvailability;
		profile.internalMemo = [
			fields.attendanceConcerns,
			fields.additionalNotes,
			fields.interviewMemo,
			fields.selfReflection,
			fields.interviewAdvice
		].filter((value) => value.trim()).join("\n");
		return profile;
	}
	const record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
	const text = (value, limit = 6e3) => typeof value === "string" && unicodeLength(value) <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
	const list = (value, count = 30) => Array.isArray(value) && value.length <= count && value.every((item) => text(item));
	function validIntroductionRate(value) {
		return record(value) && text(value.amount, 200) && !/[\r\n]/.test(value.amount) && [
			"hour",
			"day",
			"month",
			"project",
			"unknown"
		].includes(String(value.unit)) && [
			"exclusive",
			"inclusive",
			"unknown"
		].includes(String(value.tax));
	}
	/** Whitelist persisted fields. Unknown properties, especially copied source documents,
	* are not retained in the returned object. Invalid payloads fail rather than truncate. */
	function parseIntroductionV2Profile(value) {
		if (!record(value) || value.schemaVersion !== 2 || !record(value.basic) || !Array.isArray(value.careers) || value.careers.length > 30) return null;
		const result = blankIntroductionV2Profile();
		for (const key of [
			"candidateName",
			"source",
			"experienceTotal",
			"interviewAvailability",
			"internalMemo"
		]) {
			if (!text(value[key]) || ["candidateName", "source"].includes(key) && /[\r\n]/.test(value[key])) return null;
			result[key] = value[key];
		}
		for (const key of Object.keys(result.basic)) if (key === "desiredRate") {
			if (!validIntroductionRate(value.basic[key])) return null;
			result.basic.desiredRate = {
				amount: value.basic[key].amount,
				unit: value.basic[key].unit,
				tax: value.basic[key].tax
			};
		} else {
			if (!text(value.basic[key])) return null;
			result.basic[key] = value.basic[key];
		}
		for (const key of ["tips", "tools"]) {
			if (!list(value[key])) return null;
			result[key] = [...value[key]];
		}
		const ids = /* @__PURE__ */ new Set();
		for (const item of value.careers) {
			if (!record(item) || !text(item.id, 120) || !item.id.trim() || ids.has(item.id)) return null;
			ids.add(item.id);
			const career = blankIntroductionCareer(item.id);
			for (const key of [
				"company",
				"product",
				"period",
				"salesStyle"
			]) {
				if (!text(item[key])) return null;
				career[key] = item[key];
			}
			for (const key of [
				"duties",
				"achievements",
				"tips"
			]) {
				if (!list(item[key])) return null;
				career[key] = [...item[key]];
			}
			result.careers.push(career);
		}
		return unicodeLength(JSON.stringify(result)) <= 1e5 ? result : null;
	}
	function parseIntroductionV2Settings(value) {
		if (!record(value) || !text(value.version, 200) || !list(value.sources, 300) || !list(value.blockedTerms, 500) || !record(value.sourceAliases) || Object.keys(value.sourceAliases).length > 500 || !Array.isArray(value.clients) || value.clients.length > 500) return null;
		const aliases = {};
		for (const [key, item] of Object.entries(value.sourceAliases)) {
			if (!text(key, 200) || !text(item, 200) || [
				"__proto__",
				"prototype",
				"constructor"
			].includes(key)) return null;
			aliases[key] = item;
		}
		const clients = [], ids = /* @__PURE__ */ new Set();
		for (const item of value.clients) {
			if (!record(item) || !text(item.id, 200) || !item.id.trim() || ids.has(item.id) || !text(item.name, 200) || !list(item.mentions, 50) || item.rate !== void 0 && !validIntroductionRate(item.rate)) return null;
			ids.add(item.id);
			clients.push({
				id: item.id,
				name: item.name,
				mentions: [...item.mentions],
				...item.rate ? { rate: {
					amount: item.rate.amount,
					unit: item.rate.unit,
					tax: item.rate.tax
				} } : {}
			});
		}
		return {
			version: value.version,
			sources: [...value.sources],
			sourceAliases: aliases,
			blockedTerms: [...value.blockedTerms],
			clients
		};
	}
	const unitLabels = {
		hour: "／時",
		day: "／日",
		month: "／月",
		project: "／件",
		unknown: "（単位未確認）"
	};
	function formatIntroductionRate(rate) {
		if (!rate.amount.trim()) return "未確認";
		return `${normalizeIntroductionValue("rate", rate.amount).value}${unitLabels[rate.unit]}${rate.tax === "unknown" ? "（税区分未確認）" : rate.tax === "inclusive" ? "（税込）" : "（税抜）"}`;
	}
	/** Not an authentication hash. A compact local freshness key avoids putting
	* private notes into document metadata as literal JSON. */
	function introductionV2SourceKey(profile, settings, clientId = "") {
		const source = JSON.stringify([
			profile,
			settings,
			clientId
		]);
		let a = 2166136261, b = 2654435769;
		for (const char of source) {
			const code = char.codePointAt(0);
			a = Math.imul(a ^ code, 16777619);
			b = Math.imul(b ^ code, 2246822519);
		}
		return `v2:${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
	}
	function resolveIntroductionSource(source, settings) {
		const raw = source.trim();
		return Object.hasOwn(settings.sourceAliases, raw) ? settings.sourceAliases[raw].trim() : raw;
	}
	const filled = (values) => values.map((value) => value.trim()).filter(Boolean);
	const line = (label, value) => `${label}：${value.trim() || "未確認"}`;
	const factId = (path) => `introduction:${path}`;
	function introductionV2NarrativeFacts(profile) {
		const facts = [];
		for (const career of profile.careers) for (const [key, kind] of [["duties", "duty"], ["tips", "tip"]]) career[key].forEach((value, index) => {
			if (value.trim() && !introductionContentIssues(value).includes("source-private-detail")) facts.push({
				factId: factId(`careers.${career.id}.${key}.${index}`),
				careerId: career.id,
				kind,
				sourceText: value.trim()
			});
		});
		profile.tips.forEach((value, index) => {
			if (value.trim() && !introductionContentIssues(value).includes("source-private-detail")) facts.push({
				factId: factId(`tips.${index}`),
				careerId: "candidate",
				kind: "tip",
				sourceText: value.trim()
			});
		});
		return facts;
	}
	function composeIntroductionV2(raw, rawSettings = blankIntroductionV2Settings(), clientId = "", now = /* @__PURE__ */ new Date(), edits = []) {
		const profile = parseIntroductionV2Profile(raw), settings = parseIntroductionV2Settings(rawSettings);
		if (!profile || !settings) throw new Error("紹介文の入力または設定の形式を確認してください。原文は保持してください。");
		const checks = [], questions = [], factRefs = [];
		const question = (field, label, prompt, required = true, careerId) => {
			const id = `${careerId ?? "basic"}:${field}`;
			if (!questions.some((item) => item.id === id)) questions.push({
				id,
				field,
				label,
				prompt,
				required,
				...careerId ? { careerId } : {}
			});
		};
		const fixed = (path, rawValue, normField) => {
			const normalized = normField ? normalizeIntroductionValue(normField, rawValue) : {
				raw: rawValue,
				value: rawValue.trim(),
				status: "unchanged"
			};
			if (normalized.status === "needs-confirmation") {
				checks.push({
					code: "normalization",
					severity: "review",
					field: path,
					sourceRef: factId(path),
					message: normalized.question
				});
				question(path, path, normalized.question);
			}
			if (normalized.value.trim()) factRefs.push({
				id: factId(path),
				path,
				value: normalized.value,
				original: rawValue
			});
			return normalized.value.trim();
		};
		const narrative = new Map(introductionV2NarrativeFacts(profile).map((item) => [item.factId, item]));
		const acceptedEdits = /* @__PURE__ */ new Map();
		for (const edit of edits) {
			const source = narrative.get(edit.factId);
			if (source && edit.text.trim() === source.sourceText) acceptedEdits.set(edit.factId, edit.text.trim());
			else if (source && isValidatedIntroductionNarrativeEdit(edit, source.sourceText)) acceptedEdits.set(edit.factId, edit.text.trim());
			else checks.push({
				code: "narrative-rejected",
				severity: "review",
				sourceRef: edit.factId,
				message: "根拠を確認できなかった文章は、その項目の原文を使っています。"
			});
		}
		const narrativeValue = (path, value) => {
			const original = fixed(path, value);
			return acceptedEdits.get(factId(path)) ?? original;
		};
		const name = fixed("candidateName", profile.candidateName);
		if (!name) question("candidateName", "氏名", "候補者の氏名を確認してください。");
		const source = resolveIntroductionSource(profile.source, settings);
		if (!source) question("source", "紹介元", "紹介元を選択してください。未登録の選択肢は管理者に確認してください。");
		if (source && settings.sources.length && !settings.sources.includes(source)) checks.push({
			code: "source-unregistered",
			severity: "review",
			field: "source",
			message: "紹介元が登録済みの選択肢と一致していません。正式な表記を確認してください。"
		});
		if (source) factRefs.push({
			id: factId("source"),
			path: "source",
			value: source,
			original: profile.source
		});
		const basic = profile.basic;
		const basicValues = {
			age: fixed("basic.age", basic.age, "age"),
			residence: fixed("basic.residence", basic.residence, "residence"),
			availableFrom: fixed("basic.availableFrom", basic.availableFrom, "availableFrom"),
			timeWindow: fixed("basic.timeWindow", basic.timeWindow, "timeWindow"),
			monthlyHours: fixed("basic.monthlyHours", basic.monthlyHours, "monthlyHours"),
			pcEnvironment: fixed("basic.pcEnvironment", basic.pcEnvironment, "pcEnvironment"),
			networkEnvironment: fixed("basic.networkEnvironment", basic.networkEnvironment, "networkEnvironment"),
			shareableAttendanceNote: fixed("basic.shareableAttendanceNote", basic.shareableAttendanceNote, "attendanceNote")
		};
		const requiredLabels = {
			age: "年齢",
			residence: "居住地",
			availableFrom: "稼働開始",
			timeWindow: "稼働時間",
			monthlyHours: "月間稼働時間",
			pcEnvironment: "PC環境",
			networkEnvironment: "ネット環境",
			shareableAttendanceNote: "勤怠懸念"
		};
		for (const key of Object.keys(basicValues)) if (!basicValues[key]) question(`basic.${key}`, requiredLabels[key], `${requiredLabels[key]}を確認してください。分からなければ未確認のまま進められます。`);
		fixed("basic.desiredRate.amount", basic.desiredRate.amount, "rate");
		if (!basic.desiredRate.amount.trim()) question("basic.desiredRate.amount", "希望単価", "希望単価の数値と、時給・日給・月額などの単位を確認してください。");
		if (basic.desiredRate.amount.trim() && basic.desiredRate.unit === "unknown") question("basic.desiredRate.unit", "単価の単位", "この希望単価は時給・日給・月額・案件単価のどれですか？");
		if (basic.desiredRate.amount.trim() && basic.desiredRate.tax === "unknown") checks.push({
			code: "tax-unknown",
			severity: "review",
			field: "basic.desiredRate.tax",
			message: "希望単価の税込・税抜が未確認です。企業提示条件とあわせて確認してください。"
		});
		const dateState = introductionStartDateState(basic.availableFrom, now);
		if (dateState === "past") checks.push({
			code: "start-date-past",
			severity: "review",
			field: "basic.availableFrom",
			message: "稼働開始日が過去です。現在の予定を確認してください。"
		});
		if (dateState === "year-unknown") question("basic.availableFrom.year", "稼働開始の年", "稼働開始の年は何年ですか？年を推測せず、入力どおりの月日で表示しています。", false);
		if (basic.sideJob.trim() && !basic.shareableAttendanceNote.trim()) question("basic.shareableAttendanceNote", "副業の稼働への影響", "副業によって連絡可能時間や勤務時間に影響はありますか？個人的な事情ではなく、共有できる稼働上の影響だけを記入してください。");
		const baseLines = [
			line("氏名", name),
			...basic.furigana.trim() ? [line("ふりがな", fixed("basic.furigana", basic.furigana))] : [],
			line("年齢", basicValues.age),
			line("居住地", basicValues.residence),
			line("稼働開始", basicValues.availableFrom),
			line("稼働時間", basicValues.timeWindow),
			line("月間稼働時間", basicValues.monthlyHours),
			line("希望単価", formatIntroductionRate(basic.desiredRate)),
			line("PC環境", basicValues.pcEnvironment),
			line("ネット環境", basicValues.networkEnvironment),
			line("勤怠懸念", basicValues.shareableAttendanceNote)
		];
		for (const [key, label] of [
			["daysPerWeek", "週の稼働数"],
			["weekdays", "稼働曜日"],
			["sideJob", "副業"],
			["pcCamera", "PCカメラの有無"]
		]) if (basic[key].trim()) baseLines.push(line(label, fixed(`basic.${key}`, basic[key])));
		const experience = fixed("experienceTotal", profile.experienceTotal);
		if (!experience) question("experienceTotal", "営業経験の通算", "通算の営業経験はどのくらいですか？重複する職歴期間を二重に数えず確認してください。", false);
		const careerBlocks = [], tips = profile.tips.map((value, index) => narrativeValue(`tips.${index}`, value)).filter(Boolean);
		for (const career of profile.careers) {
			const prefix = `careers.${career.id}`, company = fixed(`${prefix}.company`, career.company), product = fixed(`${prefix}.product`, career.product), period = fixed(`${prefix}.period`, career.period), style = fixed(`${prefix}.salesStyle`, career.salesStyle, "salesStyle");
			const duties = career.duties.map((value, index) => narrativeValue(`${prefix}.duties.${index}`, value)).filter(Boolean);
			const achievements = career.achievements.map((value, index) => fixed(`${prefix}.achievements.${index}`, value)).filter(Boolean);
			tips.push(...career.tips.map((value, index) => narrativeValue(`${prefix}.tips.${index}`, value)).filter(Boolean));
			for (const [key, label, prompt] of [
				[
					"period",
					"期間",
					"開始・終了の年月を確認してください。"
				],
				[
					"product",
					"商材",
					"扱った商品・サービスを確認してください。"
				],
				[
					"salesStyle",
					"営業スタイル",
					"BtoB/BtoCと、テレアポ・商談などの手法を確認してください。"
				],
				[
					"duties",
					"業務内容",
					"実際に担当した業務を確認してください。"
				],
				[
					"achievements",
					"実績",
					"架電数・アポ数などを、単位と期間を含めて確認してください。"
				]
			]) if (Array.isArray(career[key]) ? !filled(career[key]).length : !career[key].trim()) question(`${prefix}.${key}`, label, `${company || product || "この職歴"}：${prompt}`, true, career.id);
			const metrics = achievements.join("\n");
			if (/(?:\d+\s*位|首位|トップ|No[.]?\s*\d+)/i.test(metrics) && (!/(?:\d+\s*(?:人|名|社)中|母数|比較対象|全\d+\s*(?:人|名|社))/.test(metrics) || !/(?:\d+年|\d+月|月間|年間|週間|日間|期間)/.test(metrics))) question(`${prefix}.rankContext`, "順位の比較対象と期間", `${company || "この職歴"}の順位について、何人・何社中か、いつの実績かを確認してください。未確認の母数や期間は補いません。`, false, career.id);
			careerBlocks.push([
				`■${company || "社名不明"}${product ? `／${product}` : ""}`,
				line("期間", period),
				line("商材", product),
				line("営業スタイル", style),
				"業務内容：",
				...(duties.length ? duties : ["未確認"]).map((value) => `・${value}`),
				"実績：",
				...(achievements.length ? achievements : ["未確認"]).map((value) => `・${value}`)
			].join("\n"));
		}
		if (!profile.careers.length) {
			question("careers", "職歴", "営業経験・職歴について、会社・商材・期間・担当業務を確認してください。");
			careerBlocks.push("■社名不明\n期間：未確認\n商材：未確認\n営業スタイル：未確認\n業務内容：\n・未確認\n実績：\n・未確認");
		}
		if (tips.length < 2) question("tips", "成果を出すための工夫", "成果につながった具体的な行動を確認してください。例文を事実として足さず、分かる範囲を記入してください。", true);
		const tools = [...new Set(profile.tools.map((value, index) => fixed(`tools.${index}`, value, "tool")).filter(Boolean))];
		if (!tools.length) question("tools", "使用ツール", "CRM・チャット・表計算など、実際に使用したツールを確認してください。");
		const summary = renderIntroductionSummary(profile);
		const sections = [
			`【基本情報】\n${baseLines.join("\n")}`,
			`【営業経験・職務経歴】\n${line("営業経験", experience)}\n${careerBlocks.join("\n\n")}`,
			`【成果を出すための工夫】\n${(tips.length ? tips : ["未確認"]).map((value) => `・${value}`).join("\n")}`,
			`【使用ツール・環境】\n${(tools.length ? tools : ["未確認"]).map((value) => `・${value}`).join("\n")}`,
			...profile.interviewAvailability.trim() ? [`【面談可能日】\n${fixed("interviewAvailability", profile.interviewAvailability)}`] : [],
			`【総評】\n${summary}`
		];
		const internalBody = sections.join("\n\n"), client = settings.clients.find((item) => item.id === clientId);
		if (clientId && !client) checks.push({
			code: "client-not-found",
			severity: "block",
			field: "clientId",
			message: "選択した企業の設定が見つかりません。企業を選び直してください。"
		});
		let body = internalBody;
		if (client?.rate) {
			const rateIndex = baseLines.indexOf(line("希望単価", formatIntroductionRate(basic.desiredRate)));
			body = [`【基本情報】\n${baseLines.map((value, index) => index === rateIndex ? line("希望単価", formatIntroductionRate(client.rate)) : value).join("\n")}`, ...sections.slice(1)].join("\n\n");
			if (!client.rate.amount.trim()) checks.push({
				code: "client-rate-empty",
				severity: "review",
				message: "企業別の提示単価が未登録です。"
			});
			if (client.rate.tax === "unknown" || client.rate.unit === "unknown") checks.push({
				code: "client-rate-unconfirmed",
				severity: "review",
				message: "企業別の提示単価の単位または税区分が未確認です。"
			});
		}
		const headingLine = `${name || "未確認"}（${source || "紹介元未確認"}）`;
		const greeting = "お世話になっております。\n下記の人員をご紹介させていただきます。", closing = "ご検討のほどよろしくお願いいたします。";
		const recommendation = renderIntroductionRecommendation(profile);
		const mentions = client?.mentions.map((value) => value.trim()).filter(Boolean).join("\n") ?? "";
		const clientText = [
			mentions,
			greeting,
			recommendation,
			closing,
			headingLine,
			body
		].filter(Boolean).join("\n\n");
		checks.push(...inspectIntroductionV2ClientText(clientText, profile, settings));
		if (!compareIntroductionV2Bodies(internalBody, body, basic.desiredRate, client?.rate)) checks.push({
			code: "client-fact-mismatch",
			severity: "block",
			message: "設定された単価以外の情報が社内版と企業向け版で異なります。"
		});
		const bodyChars = unicodeLength(internalBody), bodyLines = internalBody.split("\n").length;
		if (bodyChars > 2e4 || unicodeLength(clientText) > 2e4) checks.push({
			code: "document-length",
			severity: "block",
			message: "文章が保存可能な長さを超えています。原文を削らず、職歴を確認してください。"
		});
		return {
			schemaVersion: 2,
			templateVersion: introductionV2Version,
			headingLine,
			internalBody,
			client: {
				clientId,
				mentions,
				greeting,
				recommendation,
				closing,
				body,
				text: clientText
			},
			checks,
			questions,
			factRefs,
			sourceKey: introductionV2SourceKey(profile, settings, clientId),
			canCopyClient: !checks.some((check) => check.severity === "block"),
			volume: {
				bodyChars,
				bodyLines,
				withinTarget: bodyChars >= 764 && bodyChars <= 1125 && bodyLines >= 40 && bodyLines <= 58
			}
		};
	}
	/** The actual achievements remain verbatim in the career block. The summary
	* selects existing evidence; it never creates a total, rate, rank or strength. */
	function renderIntroductionSummary(profile) {
		const careers = profile.careers.filter((career) => career.duties.some((value) => value.trim()) || career.product.trim());
		if (!careers.length) return "営業経験・職務経歴と具体的な取り組みは未確認です。確認できた情報をもとに内容を整えます。";
		const statements = [];
		if (profile.experienceTotal.trim()) statements.push(`営業経験は${profile.experienceTotal.trim()}です。`);
		for (const career of careers) {
			const subject = [career.company, career.product].map((value) => value.trim()).filter(Boolean).join("の");
			if (subject || career.salesStyle.trim()) statements.push(`${subject ? `${subject}で` : ""}${normalizeIntroductionValue("salesStyle", career.salesStyle).value || "記載の業務"}の経験があります。`);
		}
		const achievement = careers.flatMap((career) => filled(career.achievements))[0];
		if (achievement) statements.push(`実績として「${achievement}」が記録されています。`);
		const tip = [...filled(profile.tips), ...careers.flatMap((career) => filled(career.tips))][0];
		if (tip) statements.push(`具体的な取り組みは「${tip}」です。`);
		statements.push("同様の業務を紹介する際は、記載の経験と稼働条件をもとに、案件との具体的な接点を確認できます。");
		return statements.join("");
	}
	function renderIntroductionRecommendation(profile) {
		const first = profile.careers.find((career) => career.product.trim() || career.salesStyle.trim());
		if (!first) return "候補者の基本情報を下記にまとめております。未確認の項目は確認を進めております。";
		const experience = profile.experienceTotal.trim() ? `${profile.experienceTotal.trim()}の営業経験があり、` : "";
		const fact = [first.product.trim(), normalizeIntroductionValue("salesStyle", first.salesStyle).value].filter(Boolean).join("・");
		const achievement = filled(first.achievements)[0];
		const tip = [...filled(first.tips), ...filled(profile.tips)][0];
		return `${experience}${fact}の経験がある方です。${achievement ? `実績として「${achievement}」が記録されています。` : ""}${tip ? `「${tip}」という取り組みをされています。` : ""}`;
	}
	function compareIntroductionV2Bodies(internalBody, clientBody, sourceRate, clientRate) {
		if (!clientRate) return internalBody === clientBody;
		const sourceLine = line("希望単価", formatIntroductionRate(sourceRate)), clientLine = line("希望単価", formatIntroductionRate(clientRate));
		const masked = (body, expectedLine) => {
			const lines = body.split("\n"), index = lines.indexOf(expectedLine);
			if (index < 0) return null;
			lines[index] = "希望単価：__configured_rate__";
			return lines.join("\n");
		};
		const sourceMasked = masked(internalBody, sourceLine), clientMasked = masked(clientBody, clientLine);
		return sourceMasked !== null && clientMasked !== null && sourceMasked === clientMasked;
	}
	/** Call again immediately before copying or sharing manually edited prose. */
	function inspectIntroductionV2ClientText(value, profile, settings) {
		const comparable = (text) => text.normalize("NFKC").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "").toLocaleLowerCase("ja");
		const checks = [], normalized = comparable(value);
		for (const term of settings.blockedTerms.map((term) => term.trim()).filter(Boolean)) if (normalized.includes(comparable(term))) checks.push({
			code: "blocked-term",
			severity: "block",
			message: `企業向けに出力できない登録語句「${term}」が含まれています。`
		});
		if ([profile.internalMemo.trim(), ...profile.internalMemo.split(/[\n。]/).map((part) => part.trim())].filter((part) => Array.from(part).length >= 4 && !/^(?:特になし|なし|懸念なし|問題なし|未確認|不明|確認中)[。.]?$/.test(part)).some((part) => normalized.includes(comparable(part)))) checks.push({
			code: "private-memo-leak",
			severity: "block",
			message: "社内メモと一致する内容が企業向け文章に含まれています。共有する内容を確認してください。"
		});
		for (const issue of introductionContentIssues(value.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, ""))) checks.push({
			code: issue,
			severity: "block",
			message: issue === "source-private-detail" ? "個人的な事情が企業向け文章に含まれています。共有できる稼働条件だけを記載してください。" : "根拠のない人物評価、空の例示や機械向けの出力が含まれていないか確認してください。"
		});
		return checks;
	}
	const validatedNarrativeEdits = /* @__PURE__ */ new WeakMap();
	function markValidatedIntroductionNarrativeEdit(edit, original) {
		validatedNarrativeEdits.set(edit, {
			original,
			text: edit.text
		});
		return edit;
	}
	function isValidatedIntroductionNarrativeEdit(edit, original) {
		const checked = validatedNarrativeEdits.get(edit);
		return checked?.original === original && checked.text === edit.text;
	}
	/** Suggestion only: the caller asks the user to confirm the derived total.
	* Inclusive month ranges are merged so overlapping jobs are not double-counted. */
	function suggestIntroductionExperienceTotal(careers) {
		if (!careers.length) return null;
		const ranges = [];
		for (const career of careers) {
			const match = career.period.normalize("NFKC").trim().match(/^(\d{4})[\/年.-](\d{1,2})月?\s*[〜～~－ー−–—-]\s*(\d{4})[\/年.-](\d{1,2})月?$/);
			if (!match) return null;
			const [, y1, m1, y2, m2] = match.map(Number);
			if (m1 < 1 || m1 > 12 || m2 < 1 || m2 > 12) return null;
			const start = y1 * 12 + m1 - 1, end = y2 * 12 + m2 - 1;
			if (end < start) return null;
			ranges.push({
				start,
				end
			});
		}
		const merged = [];
		for (const range of ranges.sort((a, b) => a.start - b.start)) {
			const last = merged.at(-1);
			if (last && range.start <= last.end + 1) last.end = Math.max(last.end, range.end);
			else merged.push({ ...range });
		}
		const months = merged.reduce((sum, range) => sum + range.end - range.start + 1, 0), years = Math.floor(months / 12), rest = months % 12;
		return {
			value: `${years ? `${years}年` : ""}${rest ? `${rest}か月` : ""}`,
			months,
			careerIds: careers.map((career) => career.id)
		};
	}
	//#endregion
	exports.blankIntroductionCareer = blankIntroductionCareer;
	exports.blankIntroductionRate = blankIntroductionRate;
	exports.blankIntroductionV2Profile = blankIntroductionV2Profile;
	exports.blankIntroductionV2Settings = blankIntroductionV2Settings;
	exports.compareIntroductionV2Bodies = compareIntroductionV2Bodies;
	exports.composeIntroductionV2 = composeIntroductionV2;
	exports.formatIntroductionRate = formatIntroductionRate;
	exports.inspectIntroductionV2ClientText = inspectIntroductionV2ClientText;
	exports.introductionV2FromLegacy = introductionV2FromLegacy;
	exports.introductionV2Headings = introductionV2Headings;
	exports.introductionV2MaxLength = introductionV2MaxLength;
	exports.introductionV2NarrativeFacts = introductionV2NarrativeFacts;
	exports.introductionV2SourceKey = introductionV2SourceKey;
	exports.introductionV2Version = introductionV2Version;
	exports.markValidatedIntroductionNarrativeEdit = markValidatedIntroductionNarrativeEdit;
	exports.parseIntroductionRate = parseIntroductionRate;
	exports.parseIntroductionV2Profile = parseIntroductionV2Profile;
	exports.parseIntroductionV2Settings = parseIntroductionV2Settings;
	exports.renderIntroductionRecommendation = renderIntroductionRecommendation;
	exports.renderIntroductionSummary = renderIntroductionSummary;
	exports.resolveIntroductionSource = resolveIntroductionSource;
	exports.suggestIntroductionExperienceTotal = suggestIntroductionExperienceTotal;
	exports.validIntroductionRate = validIntroductionRate;
	return exports;
})({});

/* Renderer is generated from lib/introduction-v2.ts as NODE_INTRODUCTION_V2.
 * Integration routes: readIntroductionV2_, saveIntroductionV2_, saveIntroductionSettings_.
 * Add both writes to nodeStorageMutation_ and the read to the authenticated table budget.
 * Bodies are derived on demand. The original profile, including private notes, is owner scoped.
 */
var INTRODUCTION_V2_TAB='_NODE_introduction_v2',INTRODUCTION_SETTINGS_TAB='_NODE_introduction_settings';
var INTRODUCTION_V2_HEADERS=['draftKey','playerId','json0','json1','json2','json3','json4','json5','json6','json7','json8','json9','version','updatedAt','actorId'];
var INTRODUCTION_SETTINGS_HEADERS=['id','json0','json1','json2','json3','json4','json5','json6','json7','json8','json9','version','updatedAt','actorId'];
function introductionV2Engine_(){if(typeof NODE_INTRODUCTION_V2==='undefined'||!NODE_INTRODUCTION_V2.parseIntroductionV2Profile||!NODE_INTRODUCTION_V2.composeIntroductionV2)fail_('NOT_CONFIGURED','新しい紹介文の書式更新が完了していません。');return NODE_INTRODUCTION_V2;}
function introductionV2Chunks_(value){var json=JSON.stringify(value);if(Array.from(json).length>100000||json.length>200000)fail_('VALIDATION','紹介文の入力情報が保存上限を超えています。原文を保持して管理者に確認してください。');var chunks=[],part='';Array.from(json).forEach(function(char){if(part.length+char.length>20000){chunks.push(part);part='';}part+=char;});chunks.push(part);if(chunks.length>10)fail_('VALIDATION','紹介文の保存上限を超えています。');while(chunks.length<10)chunks.push('');return chunks;}
function introductionV2Version_(value){if(typeof value!=='string'||value!==''&&!/^[A-Za-z0-9_-]{43}$/.test(value))fail_('VALIDATION','紹介文の最新の保存状態を取得してください。');return value;}
function introductionV2Table_(book){var state=intakeTable_(book,INTRODUCTION_V2_TAB,INTRODUCTION_V2_HEADERS),seen=Object.create(null),engine=introductionV2Engine_();state.entries=state.rows.map(function(row,index){if(row.every(function(cell){return cell===''||cell===null;}))return null;var profile;try{profile=engine.parseIntroductionV2Profile(JSON.parse(row.slice(2,12).join('')));}catch(_){profile=null;}if(!profile||typeof row[0]!=='string'||!row[0]||row[0].length>200||typeof row[1]!=='string'||!/^ND-\d+$/.test(row[1])||seen[row[0]]||typeof row[12]!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(row[12])||typeof row[13]!=='string'||!isFinite(Date.parse(row[13]))||typeof row[14]!=='string'||!/^[A-Za-z0-9_-]{1,30}$/.test(row[14]))fail_('SCHEMA_MISMATCH','紹介文の保存済み情報・担当者・重複を管理者が確認してください。');seen[row[0]]=true;return {draftKey:row[0],playerId:row[1],profile:profile,version:row[12],updatedAt:row[13],row:index+2};}).filter(Boolean);return state;}
function introductionSettingsTable_(book){var state=intakeTable_(book,INTRODUCTION_SETTINGS_TAB,INTRODUCTION_SETTINGS_HEADERS),engine=introductionV2Engine_();state.entries=state.rows.map(function(row,index){if(row.every(function(cell){return cell===''||cell===null;}))return null;var settings;try{settings=engine.parseIntroductionV2Settings(JSON.parse(row.slice(1,11).join('')));}catch(_){settings=null;}if(row[0]!=='shared'||!settings||typeof row[11]!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(row[11])||settings.version!==row[11]||typeof row[12]!=='string'||!isFinite(Date.parse(row[12]))||typeof row[13]!=='string'||!/^[A-Za-z0-9_-]{1,30}$/.test(row[13]))fail_('SCHEMA_MISMATCH','紹介文の共有設定を管理者が確認してください。');return {settings:settings,version:row[11],updatedAt:row[12],row:index+2};}).filter(Boolean);if(state.entries.length>1)fail_('SCHEMA_MISMATCH','紹介文の共有設定が重複しています。');return state;}
function currentIntroductionSettings_(state){return state.entries.length?state.entries[0].settings:introductionV2Engine_().blankIntroductionV2Settings();}
function introductionV2Access_(store,actor,recordId){var record=findRecord_(store,recordId);if(!record)fail_('NOT_FOUND','候補者が見つかりません。最新の一覧を取得してください。');actorOwns_(actor,record);if(!record.playerId||!store.players.some(function(p){return p.id===record.playerId&&p.role==='player';}))fail_('FORBIDDEN','担当者を確認できる候補者だけ編集できます。');if(record.profileId&&store.records.some(function(r){return r.profileId===record.profileId&&r.playerId!==record.playerId;}))fail_('CONFLICT','面談情報に異なる担当者の候補者が関連付いています。管理者に確認してください。');return {record:record,draftKey:record.profileId||record.recordId};}
function readIntroductionV2_(request){var session=authenticate_(request.token,false,request.background===true),accounts=readAccountStore_(),actor=activeActor_(accounts,session),payload=request.payload||{};writingObject_(payload,['recordId']);var settingsState=introductionSettingsTable_(accounts.book),settings=currentIntroductionSettings_(settingsState),recordId=payload.recordId===undefined?'':shortText_(payload.recordId,200,false),result={feature:true,recordId:recordId,draftKey:'',playerId:'',profile:null,version:'',updatedAt:'',settings:settings};if(recordId){var store=readStore_({readOnly:true},accounts),access=introductionV2Access_(store,actor,recordId),state=introductionV2Table_(store.book),entry=state.entries.find(function(e){return e.draftKey===access.draftKey;});if(entry&&entry.playerId!==access.record.playerId)fail_('FORBIDDEN','保存済みの紹介文の担当者が一致しません。');result.draftKey=access.draftKey;result.playerId=access.record.playerId;if(entry){result.profile=entry.profile;result.version=entry.version;result.updatedAt=entry.updatedAt;}
 // Candidate ownership and shared-profile binding are checked again before returning private notes.
 var latest=readStore_({readOnly:true},accounts),fresh=introductionV2Access_(latest,actor,recordId);if(fresh.draftKey!==access.draftKey||fresh.record.playerId!==access.record.playerId||introductionV2Table_(store.book).fingerprint!==state.fingerprint)fail_('BUSY','紹介文の対象または入力情報が更新されました。最新を取得してください。');}
 if(introductionSettingsTable_(accounts.book).fingerprint!==settingsState.fingerprint)fail_('BUSY','共有設定が更新されました。最新を取得してください。');snapshotActor_(accounts,request.token);return result;}
function introductionV2NameMatches_(profileName,recordName){return typeof profileName==='string'&&typeof recordName==='string'&&profileName.normalize('NFKC').replace(/\s/g,'').toLowerCase()===recordName.normalize('NFKC').replace(/\s/g,'').toLowerCase();}
function planIntroductionV2_(store,actor,payload){
 guardProbeBusinessMutation_(store,actor,'saveIntroductionV2',payload);writingObject_(payload,['recordId','profile','expectedVersion']);var recordId=shortText_(payload.recordId,200,true),access=introductionV2Access_(store,actor,recordId),expected=introductionV2Version_(payload.expectedVersion),engine=introductionV2Engine_(),profile=engine.parseIntroductionV2Profile(payload.profile);
 if(!profile)fail_('VALIDATION','紹介文の入力形式・文字数・職歴の重複IDを確認してください。原文は保持されています。');if(!introductionV2NameMatches_(profile.candidateName,access.record.name))fail_('VALIDATION','紹介文の氏名が候補者名と一致していません。氏名の訂正は候補者情報で行ってから保存してください。');
 var state=introductionV2Table_(store.book),previous=state.entries.find(function(e){return e.draftKey===access.draftKey;});if(previous&&previous.playerId!==access.record.playerId)fail_('FORBIDDEN','紹介文の担当者が一致しません。');if((previous?previous.version:'')!==expected)fail_('CONFLICT','紹介文の入力情報が更新されています。入力を保持し、最新の内容と比較してください。');
 var settings=introductionSettingsTable_(store.book);try{engine.composeIntroductionV2(profile,currentIntroductionSettings_(settings),'',new Date());}catch(_){fail_('VALIDATION','紹介文を組み立てられません。入力を確認してください。');}
 var version=random256_(),now=new Date().toISOString(),plan={requests:[],result:{recordId:recordId,draftKey:access.draftKey}},targetKey=access.draftKey;
 if(!access.record.profileId){
  // Establish only the stable relationship used by existing proposal flows. The
  // original prose and private fields remain solely in the V2 table.
  plan=planCandidateProfile_(store,actor,{recordId:recordId,rowVersion:access.record.version,fields:interviewFields_({}),introduction:'',profileVersion:''});targetKey=plan.result.profileId;
  if(!intakeId_(targetKey)||state.entries.some(function(e){return e.draftKey===targetKey;}))fail_('CONFLICT','紹介文の関連付け先が重複しています。再取得してください。');
  // A historical record-only V2 share remains the SAME approved publication and
  // thread. Moving its source pointer never publishes changed prose silently.
  var team=teamCandidateTable_(store.book),oldMarker=introductionV2PublicationMarker_(access.draftKey),shares=team.entries.filter(function(entry){return entry.sourceProfileId===oldMarker;});
  if(shares.length>1||shares.some(function(entry){return entry.ownerId!==access.record.playerId||entry.sourceRecordId!==recordId;}))fail_('CONFLICT','紹介文の共有元を確認できません。管理者に確認してください。');
  shares.forEach(function(entry){var updated=Object.assign({},entry,{sourceProfileId:introductionV2PublicationMarker_(targetKey),version:Utilities.getUuid(),updatedAt:now});intakeWritePlan_(store,plan,TEAM_CANDIDATE_TAB,TEAM_CANDIDATE_HEADERS,team,entry.row,teamCandidateValues_(updated));});
  if(!shares.length)teamTableCheck_(plan,TEAM_CANDIDATE_TAB,TEAM_CANDIDATE_HEADERS,team);
 }
 plan.result=Object.assign({},plan.result,{recordId:recordId,draftKey:targetKey});
 intakeWritePlan_(store,plan,INTRODUCTION_V2_TAB,INTRODUCTION_V2_HEADERS,state,previous?previous.row:state.rows.length+2,[targetKey,access.record.playerId].concat(introductionV2Chunks_(profile),[version,now,actor.id]));addProfileRecordChecks_(plan,[access.record]);if(access.record.profileId)addProfileGroupCheck_(store,plan,access.record.profileId);plan.intakeTableChecks.push({title:INTRODUCTION_SETTINGS_TAB,headers:INTRODUCTION_SETTINGS_HEADERS,fingerprint:settings.fingerprint,sheetId:settings.sheet?settings.sheet.getSheetId():null});return plan;
}
function planIntroductionSettings_(store,actor,payload){guardProbeBusinessMutation_(store,actor,'saveIntroductionSettings',payload);requireAdmin_(actor);writingObject_(payload,['settings','expectedVersion']);var expected=introductionV2Version_(payload.expectedVersion),state=introductionSettingsTable_(store.book),old=state.entries[0],engine=introductionV2Engine_(),settings=engine.parseIntroductionV2Settings(payload.settings);if(!settings)fail_('VALIDATION','紹介元・別名・禁止語・企業ごとの設定を確認してください。');if((old?old.version:'')!==expected)fail_('CONFLICT','共有設定が更新されています。入力を保持し、最新の内容と比較してください。');settings.version=random256_();var now=new Date().toISOString(),plan={requests:[],teamAdminRequired:true,result:{settingsVersion:settings.version}};intakeWritePlan_(store,plan,INTRODUCTION_SETTINGS_TAB,INTRODUCTION_SETTINGS_HEADERS,state,old?old.row:state.rows.length+2,['shared'].concat(introductionV2Chunks_(settings),[settings.version,now,actor.id]));return plan;}
function saveIntroductionV2_(request){return introductionV2Mutation_(request,'saveIntroductionV2');}
function saveIntroductionSettings_(request){return introductionV2Mutation_(request,'saveIntroductionSettings');}
function introductionV2Mutation_(request,action){return withLock_(function(){var session=authenticate_(request.token),store=readStore_({readOnly:true}),actor=activeActor_(store,session);assertManagedBook_(store.book);if(!writesEnabled_(store.config))fail_('WRITES_DISABLED','現在は読み取り専用です。');if(store.book.getSpreadsheetTimeZone()!=='Asia/Tokyo')fail_('TIMEZONE','保存先のタイムゾーンを確認してください。');var payload=request.payload||{};guardProbeBusinessMutation_(store,actor,action,payload);if(action==='saveIntroductionSettings')requireAdmin_(actor);else introductionV2Access_(store,actor,shortText_(payload.recordId,200,true));var id=shortText_(request.operationId,128,true);if(!/^[A-Za-z0-9_-]{16,128}$/.test(id))fail_('BAD_REQUEST','保存操作のIDが必要です。');var digest=hash_(stableJson_({action:action,payload:payload})),previous=operation_(store,id);if(previous){if(previous.actorId!==actor.id||previous.action!==action||previous.payloadHash!==digest)fail_('OPERATION_CONFLICT','同じ保存IDを別の内容に使うことはできません。');snapshotActor_(store,request.token);return {committed:true,operationId:id};}var plan=action==='saveIntroductionSettings'?planIntroductionSettings_(store,actor,payload):action==='publishIntroductionV2'?planPublishIntroductionV2_(store,actor,payload):planIntroductionV2_(store,actor,payload);commit_(store,actor,action,id,digest,plan,request.token);try{snapshotActor_(store,request.token);}catch(error){if(['AUTH_REQUIRED','UNAUTHENTICATED','UNAUTHORIZED','SESSION_EXPIRED'].indexOf(error.nodeCode)>=0)throw error;fail_('INTERNAL','保存結果を再確認してください。同じ保存IDで再試行できます。');}return {committed:true,operationId:id};});}
/* Private snapshot projection used by candidate chat and condition search.
 * An orphan is kept for an administrator's full backup, never attached by name.
 */
function readIntroductionV2Profiles_(store,user){
 var state=introductionV2Table_(store.book),result=[];
 state.entries.forEach(function(entry){
  var records=store.records.filter(function(record){return (record.profileId||record.recordId)===entry.draftKey;});
  if(!records.length)return;
  var visible=user.role==='admin'||entry.playerId===user.id||records.some(function(record){return record.playerId===user.id;});
  if(!visible)return;
  if(records.some(function(record){return record.playerId!==entry.playerId;}))fail_('CONFLICT','紹介文に関連する候補者の担当者が一致しません。管理者に確認してください。');
  if(user.role!=='admin'&&entry.playerId!==user.id)return;
  if(records.some(function(record){return !introductionV2NameMatches_(entry.profile.candidateName,record.name);}))return;
  result.push({draftKey:entry.draftKey,playerId:entry.playerId,recordIds:records.map(function(record){return record.recordId;}),profile:entry.profile,version:entry.version,updatedAt:entry.updatedAt});
 });
 return result;
}
/* Explicit publication copies only the recomputed, reviewed prose. No private
 * profile object or memo enters the team table or the operation receipt. */
function introductionV2PublicationMarker_(draftKey){return 'V2-'+hash_(draftKey);}
function teamIntroductionText_(value,sourceProfileId){var v2=typeof sourceProfileId==='string'&&/^V2-[A-Za-z0-9_-]{43}$/.test(sourceProfileId),text=teamText_(value,v2?40000:1000,true);if(v2&&Array.from(text).length>20000)fail_('VALIDATION','社内共有する紹介文は20,000文字以内で確認してください。');return text;}
function planPublishIntroductionV2_(store,actor,payload){
 writingObject_(payload,['recordId','rowVersion','introductionVersion','settingsVersion','publicationId','version','confirmPublication']);guardProbeBusinessMutation_(store,actor,'publishIntroductionV2',payload);if(payload.confirmPublication!==true)fail_('VALIDATION','この本文を社内全員へ共有することを確認してください。');
 var access=introductionV2Access_(store,actor,shortText_(payload.recordId,200,true)),record=access.record;if(probeReservation_(store,actor.id,false)||probeReservation_(store,record.playerId,false))fail_('FORBIDDEN','検証専用アカウントの候補者は社内共有できません。');checkVersion_(record,payload.rowVersion);if(!store.players.some(function(p){return p.id===record.playerId&&p.role==='player'&&p.active;}))fail_('FORBIDDEN','有効な担当者の候補者だけ社内共有できます。');
 var drafts=introductionV2Table_(store.book),draft=drafts.entries.find(function(entry){return entry.draftKey===access.draftKey&&entry.playerId===record.playerId;});if(!draft||draft.version!==payload.introductionVersion)fail_('CONFLICT','最新の紹介文V2の入力情報を保存・確認してから共有してください。');if(!introductionV2NameMatches_(draft.profile.candidateName,record.name))fail_('CONFLICT','紹介文の氏名と候補者名が一致しません。候補者情報を確認してください。');
 var settingsState=introductionSettingsTable_(store.book),settings=currentIntroductionSettings_(settingsState),settingsVersion=settings.version==='initial'?'':settings.version;if(payload.settingsVersion!==settingsVersion)fail_('CONFLICT','紹介文の共有設定が変わりました。最新の本文を確認し直してください。');
 var engine=introductionV2Engine_(),document=engine.composeIntroductionV2(draft.profile,settings,'',new Date()),text=document.headingLine+'\n\n'+document.internalBody;
 if(document.checks.some(function(check){return check.severity==='block'&&check.code!=='document-length';})||engine.inspectIntroductionV2ClientText(text,draft.profile,settings).some(function(check){return check.severity==='block';}))fail_('VALIDATION','社内共有できない内容が紹介文に含まれています。非公開メモ・禁止語・個人事情を確認してください。');
 var marker=introductionV2PublicationMarker_(access.draftKey),introduction=teamIntroductionText_(text,marker),state=teamCandidateTable_(store.book),previous=payload.publicationId?teamPublication_(state,payload.publicationId):null,relatedRecords=store.records.filter(function(r){return (r.profileId||r.recordId)===access.draftKey&&r.playerId===record.playerId;}).map(function(r){return r.recordId;});
 function sameSource(p){return p.ownerId===record.playerId&&(p.sourceProfileId===marker||!!record.profileId&&p.sourceProfileId===record.profileId&&relatedRecords.indexOf(p.sourceRecordId)>=0);}
 if(previous){if(!teamCanManage_(actor,previous)||!sameSource(previous))fail_('FORBIDDEN','別の候補者の共有内容を置き換えることはできません。');if(payload.version!==previous.version)fail_('CONFLICT','社内共有が更新されています。最新の本文と共有状態を確認してください。');}
 else {if(payload.version!==undefined&&payload.version!=='')fail_('CONFLICT','新しい共有に過去のバージョンは使えません。');if(state.entries.some(sameSource))fail_('CONFLICT','この候補者は社内共有済みです。既存の共有を更新してください。');}
 var now=new Date().toISOString(),publication={publicationId:previous?previous.publicationId:Utilities.getUuid(),ownerId:record.playerId,sourceRecordId:record.recordId,sourceProfileId:marker,sourceRowVersion:record.version,sourceProfileVersion:hash_(stableJson_([draft.version,settings.version])),candidateName:record.name,introduction:introduction,published:true,version:Utilities.getUuid(),createdAt:previous?previous.createdAt:now,updatedAt:now,publishedAt:now},plan={requests:[],result:{publicationId:publication.publicationId}};
 intakeWritePlan_(store,plan,TEAM_CANDIDATE_TAB,TEAM_CANDIDATE_HEADERS,state,previous?previous.row:state.rows.length+2,teamCandidateValues_(publication));teamTableCheck_(plan,INTRODUCTION_V2_TAB,INTRODUCTION_V2_HEADERS,drafts);teamTableCheck_(plan,INTRODUCTION_SETTINGS_TAB,INTRODUCTION_SETTINGS_HEADERS,settingsState);addProfileRecordChecks_(plan,[record]);if(record.profileId)addProfileGroupCheck_(store,plan,record.profileId);return plan;
}
function publishIntroductionV2_(request){return introductionV2Mutation_(request,'publishIntroductionV2');}

/* Private image evidence. Upload-session URLs are capabilities returned once in memory:
 * never put one in a row, property, operation result, export, log, public token or ACL.
 * Routes: beginMatchEvidence -> beginMatchEvidence_ (early wrapper; own budget/commit),
 * completeMatchEvidence -> planCompleteMatchEvidence_ in normal receipt transaction,
 * readMatchEvidence -> readMatchEvidence_ (normal authenticated read budget).
 * Additional OAuth scope: devstorage.read_write. Firebase/Firestore active only.
 */
var MATCH_EVIDENCE_TAB='_NODE_match_evidence';
var MATCH_EVIDENCE_HEADERS=['id','body','version','updatedAt'];
var MATCH_EVIDENCE_MIMES=['image/png','image/jpeg','image/webp'];
var MATCH_EVIDENCE_MAX=5*1024*1024;
var MATCH_EVIDENCE_TTL=30*60*1000;
function matchEvidenceOrigin_(value){if(value!=='https://insupnode.vifight.com'&&value!=='https://playmark0227-svg.github.io')fail_('VALIDATION','この画面からの画像添付は許可されていません。公開アプリを開き直してください。');return value;}
function matchEvidenceStorage_(store){
 if(!nodeUsesFirestore_())fail_('FEATURE_UNAVAILABLE','証拠の保存はFirebaseへの切り替え後に利用できます。下書きは保存できます。');
 var storage=firestoreConfig_(),bucket=props_().getProperty('NODE_FIREBASE_STORAGE_BUCKET');
 if(bucket!==storage.projectId+'.firebasestorage.app'&&bucket!==storage.projectId+'.appspot.com')fail_('FEATURE_UNAVAILABLE','証拠ファイルの保存先を確認してください。下書きは保存できます。');
 if(store&&(!store.book||!store.book.storage||stableJson_(store.book.storage)!==stableJson_(storage)))fail_('FEATURE_UNAVAILABLE','有効なFirebase保存先を確認できません。');
 return {bucket:bucket,namespace:storage.workbookId};
}
function matchEvidenceFeature_(){try{var state=firestoreMigrationState_();if(!state||state.phase!=='active')return false;matchEvidenceStorage_();return true;}catch(_){return false;}}
function matchEvidenceUuid_(id){if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))fail_('VALIDATION','ファイルの保存IDを確認してください。');return id;}
function matchEvidenceTable_(book){
 var state=intakeTable_(book,MATCH_EVIDENCE_TAB,MATCH_EVIDENCE_HEADERS),seen=Object.create(null);
 state.entries=state.rows.map(function(row,index){var p;try{p=JSON.parse(row[1]);}catch(_){fail_('SCHEMA_MISMATCH','証拠ファイルの管理情報を確認してください。');}
  salesObject_(p,['evidenceId','ownerId','recordId','profileId','kind','mime','size','status','generation','createdAt','expiresAt','completedAt','version','updatedAt']);
  matchEvidenceUuid_(p.evidenceId);teamAccount_(p.ownerId);salesId_(p.recordId);salesId_(p.profileId,true);choice_(p.kind,['candidate','client']);choice_(p.mime,MATCH_EVIDENCE_MIMES);choice_(p.status,['pending','completed']);salesId_(p.version);salesStamp_(p.createdAt);salesStamp_(p.expiresAt);salesStamp_(p.updatedAt);salesStamp_(p.completedAt,true);
  if(!Number.isSafeInteger(p.size)||p.size<1||p.size>MATCH_EVIDENCE_MAX||p.status==='pending'&&(p.generation!==''||p.completedAt!=='')||p.status==='completed'&&(!/^[1-9][0-9]{0,29}$/.test(p.generation)||!p.completedAt)||Date.parse(p.expiresAt)-Date.parse(p.createdAt)!==MATCH_EVIDENCE_TTL||row[0]!==p.evidenceId||row[2]!==p.version||row[3]!==p.updatedAt||seen[p.evidenceId])fail_('SCHEMA_MISMATCH','証拠ファイルの状態・期限・保存IDを確認してください。');
  seen[p.evidenceId]=true;p.row=index+2;return p;
 });return state;
}
function matchEvidencePublic_(entry){var result=Object.assign({},entry);delete result.row;return result;}
function matchEvidenceWrite_(store,plan,state,previous,next){next.version=Utilities.getUuid();next.updatedAt=new Date().toISOString();var body=matchEvidencePublic_(next);intakeWritePlan_(store,plan,MATCH_EVIDENCE_TAB,MATCH_EVIDENCE_HEADERS,state,previous?previous.row:state.rows.length+2,[next.evidenceId,JSON.stringify(body),next.version,next.updatedAt]);}
function matchEvidenceRecord_(store,user,entry){var record=findRecord_(store,entry.recordId);actorOwns_(user,record);if(record.playerId!==entry.ownerId||entry.profileId&&(record.profileId||'')!==entry.profileId)fail_('FORBIDDEN','証拠ファイルと候補者の担当・関連が一致しません。');return record;}
function matchEvidenceName_(storage,entry){return 'node-evidence/'+storage.namespace+'/'+matchEvidenceUuid_(entry.evidenceId);}
function matchEvidenceFetch_(method,url,extra){
 if(typeof url!=='string'||!/^https:\/\/storage\.googleapis\.com\/(?:upload\/storage\/v1|storage\/v1)\/b\//.test(url)||/[\r\n#]/.test(url))fail_('VALIDATION','証拠ファイルの接続先を確認してください。');
 var options=Object.assign({method:method,muteHttpExceptions:true,followRedirects:false},extra||{});options.headers=Object.assign({},options.headers||{},{Authorization:'Bearer '+ScriptApp.getOAuthToken()});
 var response;try{response=UrlFetchApp.fetch(url,options);}catch(_){fail_('INTERNAL','証拠ファイルの応答を確認できませんでした。同じ保存IDで確認してください。');}
 var code=response.getResponseCode();if(code===404)return null;if(code===401||code===403)fail_('STORAGE_ACCESS_DENIED','証拠ファイルの保存権限を確認してください。');if(code===409||code===412)fail_('CONFLICT','ファイルはすでに送信されています。保存結果を確認してください。');if(code===429)fail_('RATE_LIMITED','ファイルへのアクセスが集中しています。時間をおいて確認してください。');if(code<200||code>=300)fail_(code>=500||code===408?'INTERNAL':'STORAGE_REQUEST_FAILED','証拠ファイルの処理を完了できませんでした。');return response;
}
function matchEvidenceJson_(response){if(!response)return null;try{var text=response.getContentText();if(typeof text!=='string'||text.length>50000)throw Error();var p=JSON.parse(text);if(!p||typeof p!=='object'||Array.isArray(p))throw Error();return p;}catch(_){fail_('INTERNAL','証拠ファイルの応答形式を確認できませんでした。');}}
function matchEvidencePrivateBucket_(storage){var data=matchEvidenceJson_(matchEvidenceFetch_('get','https://storage.googleapis.com/storage/v1/b/'+encodeURIComponent(storage.bucket)+'?fields=name,iamConfiguration'));if(!data||data.name!==storage.bucket||!data.iamConfiguration||data.iamConfiguration.publicAccessPrevention!=='enforced'||!data.iamConfiguration.uniformBucketLevelAccess||data.iamConfiguration.uniformBucketLevelAccess.enabled!==true)fail_('STORAGE_NOT_PRIVATE','証拠用ストレージの非公開設定を確認してください。公開禁止と均一アクセスが必要です。');}
function matchEvidenceMetadata_(storage,entry){var url='https://storage.googleapis.com/storage/v1/b/'+encodeURIComponent(storage.bucket)+'/o/'+encodeURIComponent(matchEvidenceName_(storage,entry))+'?projection=full'+(entry.generation?'&generation='+encodeURIComponent(entry.generation):'');return matchEvidenceJson_(matchEvidenceFetch_('get',url));}
function matchEvidenceCheckMetadata_(storage,entry,metadata){
 var m=metadata&&metadata.metadata;if(!metadata||metadata.bucket!==storage.bucket||metadata.name!==matchEvidenceName_(storage,entry)||metadata.contentType!==entry.mime||String(metadata.size)!==String(entry.size)||typeof metadata.generation!=='string'||!/^[1-9][0-9]{0,29}$/.test(metadata.generation)||entry.generation&&metadata.generation!==entry.generation||!m||m.nodeEvidenceId!==entry.evidenceId||m.nodeOwnerId!==entry.ownerId||m.nodeRecordId!==entry.recordId||m.nodeKind!==entry.kind||m.nodeNamespace!==storage.namespace||m.firebaseStorageDownloadTokens!==undefined||metadata.acl&&metadata.acl.some(function(acl){return acl.entity==='allUsers'||acl.entity==='allAuthenticatedUsers';}))fail_('EVIDENCE_MISMATCH','証拠ファイルの内容・担当・種類が保存情報と一致しません。');return metadata;
}
function matchEvidenceBytes_(storage,entry,generation,range){var url='https://storage.googleapis.com/storage/v1/b/'+encodeURIComponent(storage.bucket)+'/o/'+encodeURIComponent(matchEvidenceName_(storage,entry))+'?alt=media&generation='+encodeURIComponent(generation),response=matchEvidenceFetch_('get',url,range?{headers:{Range:'bytes=0-31'}}:{});if(!response)fail_('NOT_FOUND','証拠ファイルが見つかりません。');var bytes;try{bytes=response.getBlob().getBytes();}catch(_){fail_('INTERNAL','証拠ファイルを読み込めませんでした。');}if(!bytes||!bytes.length||bytes.length>MATCH_EVIDENCE_MAX||!range&&bytes.length!==entry.size)fail_('EVIDENCE_MISMATCH','証拠ファイルの容量を確認できませんでした。');return bytes;}
function matchEvidenceMagic_(bytes,mime,size){var b=Array.prototype.map.call(bytes,function(n){return (n+256)%256;}),valid=false;if(mime==='image/png')valid=b.length>=8&&[137,80,78,71,13,10,26,10].every(function(n,i){return b[i]===n;});if(mime==='image/jpeg')valid=b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255;if(mime==='image/webp')valid=b.length>=12&&String.fromCharCode.apply(null,b.slice(0,4))==='RIFF'&&String.fromCharCode.apply(null,b.slice(8,12))==='WEBP'&&(b[4]+b[5]*256+b[6]*65536+b[7]*16777216+8)===size;if(!valid)fail_('EVIDENCE_TYPE','画像形式を確認できませんでした。PNG・JPEG・WebPの画像を添付してください。');}
function matchEvidenceSession_(storage,entry,origin){
 matchEvidenceOrigin_(origin);
 matchEvidencePrivateBucket_(storage);var url='https://storage.googleapis.com/upload/storage/v1/b/'+encodeURIComponent(storage.bucket)+'/o?uploadType=resumable&ifGenerationMatch=0',response=matchEvidenceFetch_('post',url,{contentType:'application/json; charset=UTF-8',headers:{Origin:origin,'X-Upload-Content-Type':entry.mime,'X-Upload-Content-Length':String(entry.size)},payload:JSON.stringify({name:matchEvidenceName_(storage,entry),contentType:entry.mime,cacheControl:'private, no-store, max-age=0',metadata:{nodeEvidenceId:entry.evidenceId,nodeOwnerId:entry.ownerId,nodeRecordId:entry.recordId,nodeKind:entry.kind,nodeNamespace:storage.namespace}})}),headers=response&&response.getAllHeaders(),location=headers&&(headers.Location||headers.location);
 var prefix='https://storage.googleapis.com/upload/storage/v1/b/'+encodeURIComponent(storage.bucket)+'/o?';if(typeof location!=='string'||location.indexOf(prefix)!==0||/[\r\n#]/.test(location)||location.length>8000||!/[?&]upload_id=[^&]+/.test(location))fail_('INTERNAL','ファイル送信先を確認できませんでした。新しい添付操作で再試行してください。');return location;
}
function beginMatchEvidence_(request){
 var session=authenticate_(request.token);readBudget_(session.id,'beginMatchEvidence');
 return withLock_(function(){
  var payload=salesObject_(request.payload||{},['recordId','kind','mime','size','uploadId','origin']),origin=matchEvidenceOrigin_(payload.origin),id=matchEvidenceUuid_(payload.uploadId),kind=choice_(payload.kind,['candidate','client']),mime=choice_(payload.mime,MATCH_EVIDENCE_MIMES);if(!Number.isSafeInteger(payload.size)||payload.size<1||payload.size>MATCH_EVIDENCE_MAX)fail_('VALIDATION','画像は5MB以内で添付してください。');
  var store=readStore_({readOnly:true}),user=activeActor_(store,authenticate_(request.token)),storage=matchEvidenceStorage_(store),record=salesRecord_(store,user,payload.recordId),state=matchEvidenceTable_(store.book),previous=state.entries.find(function(e){return e.evidenceId===id;}),operationId='evidence-begin-'+id,payloadHash=hash_(stableJson_({action:'beginMatchEvidence',payload:payload})),op=operation_(store,operationId);
  if(!writesEnabled_(store.config)||firestoreMigrationFrozen_())fail_('WRITES_DISABLED','現在は証拠ファイルを保存できません。入力は保持してください。');guardProbeBusinessMutation_(store,user,'beginMatchEvidence',payload);
  if(op&&(op.actorId!==user.id||op.action!=='beginMatchEvidence'||op.payloadHash!==payloadHash))fail_('OPERATION_CONFLICT','同じファイル保存IDを別の内容に使えません。');
  if(previous&&(previous.ownerId!==record.playerId||previous.recordId!==record.recordId||previous.profileId&&previous.profileId!==(record.profileId||'')||previous.kind!==kind||previous.mime!==mime||previous.size!==payload.size))fail_('OPERATION_CONFLICT','同じファイル保存IDを別の候補者・内容に使えません。');
  if(previous&&!op)fail_('SCHEMA_MISMATCH','ファイルの保存履歴と管理情報が一致しません。');var entry=previous;if(!entry){if(op)fail_('SCHEMA_MISMATCH','ファイルの保存履歴と管理情報が一致しません。');var now=new Date(),plan={requests:[],result:{evidenceId:id}};entry={evidenceId:id,ownerId:record.playerId,recordId:record.recordId,profileId:record.profileId||'',kind:kind,mime:mime,size:payload.size,status:'pending',generation:'',createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+MATCH_EVIDENCE_TTL).toISOString(),completedAt:''};matchEvidenceWrite_(store,plan,state,null,entry);addProfileRecordChecks_(plan,[record]);commit_(store,user,'beginMatchEvidence',operationId,payloadHash,plan,request.token);}
  matchEvidenceRecord_(store,user,entry);var result={evidenceId:entry.evidenceId,mime:entry.mime,size:entry.size,expiresAt:entry.expiresAt};if(entry.status==='completed'){snapshotActor_(store,request.token);result.completed=true;return result;}
  if(Date.parse(entry.expiresAt)<=Date.now())fail_('UPLOAD_EXPIRED','添付の有効時間が切れました。新しい添付操作で再試行してください。');
  var existing=matchEvidenceMetadata_(storage,entry);if(existing){matchEvidenceCheckMetadata_(storage,entry,existing);snapshotActor_(store,request.token);result.uploaded=true;return result;}
  var uploadUrl=matchEvidenceSession_(storage,entry,origin);snapshotActor_(store,request.token);result.uploadUrl=uploadUrl;return result;
 });
}
function planCompleteMatchEvidence_(store,user,payload){
 salesObject_(payload,['evidenceId']);var storage=matchEvidenceStorage_(store),state=matchEvidenceTable_(store.book),entry=state.entries.find(function(p){return p.evidenceId===matchEvidenceUuid_(payload.evidenceId);});if(!entry)fail_('NOT_FOUND','添付の管理情報が見つかりません。');var record=matchEvidenceRecord_(store,user,entry),plan={requests:[],result:{evidenceId:entry.evidenceId}};if(entry.status==='completed'){addProfileRecordChecks_(plan,[record]);return plan;}if(Date.parse(entry.expiresAt)<=Date.now())fail_('UPLOAD_EXPIRED','添付の有効時間が切れました。新しい添付操作で再試行してください。');
 var metadata=matchEvidenceCheckMetadata_(storage,entry,matchEvidenceMetadata_(storage,entry)),bytes=matchEvidenceBytes_(storage,entry,metadata.generation,true);matchEvidenceMagic_(bytes,entry.mime,entry.size);var next=Object.assign({},entry,{status:'completed',generation:metadata.generation,completedAt:new Date().toISOString()});delete next.row;matchEvidenceWrite_(store,plan,state,entry,next);addProfileRecordChecks_(plan,[record]);plan.matchEvidenceCheck={entry:next};return plan;
}
function revalidateMatchEvidencePlan_(store,user,plan){if(plan.matchEvidenceCheck){var entry=plan.matchEvidenceCheck.entry;matchEvidenceRecord_(store,user,entry);var storage=matchEvidenceStorage_(store);matchEvidenceCheckMetadata_(storage,entry,matchEvidenceMetadata_(storage,entry));}}
function salesValidateEvidence_(store,user,ids,record){
 if(!Array.isArray(ids)||ids.length!==2||ids[0]===ids[1]||!record)fail_('VALIDATION','候補者側・クライアント側それぞれの証拠が必要です。');actorOwns_(user,record);var storage=matchEvidenceStorage_(store),state=matchEvidenceTable_(store.book),kinds=[];
 ids.forEach(function(id){var entry=state.entries.find(function(p){return p.evidenceId===matchEvidenceUuid_(id);});if(!entry||entry.status!=='completed'||entry.recordId!==record.recordId||entry.ownerId!==record.playerId||entry.profileId&&entry.profileId!==(record.profileId||''))fail_('FORBIDDEN','この候補者・提案の確認済み証拠を添付してください。');matchEvidenceRecord_(store,user,entry);kinds.push(entry.kind);matchEvidenceCheckMetadata_(storage,entry,matchEvidenceMetadata_(storage,entry));});
 if(kinds.indexOf('candidate')<0||kinds.indexOf('client')<0)fail_('VALIDATION','候補者側・クライアント側の証拠を1つずつ添付してください。');
}
function readMatchEvidence_(request){salesObject_(request.payload||{},['evidenceId']);var session=authenticate_(request.token),accounts=readAccountStore_(),user=activeActor_(accounts,session),store=readStore_({readOnly:true},accounts),storage=matchEvidenceStorage_(store),entry=matchEvidenceTable_(store.book).entries.find(function(p){return p.evidenceId===matchEvidenceUuid_(request.payload.evidenceId);});if(!entry||entry.status!=='completed')fail_('NOT_FOUND','確認済みの証拠ファイルが見つかりません。');matchEvidenceRecord_(store,user,entry);matchEvidenceCheckMetadata_(storage,entry,matchEvidenceMetadata_(storage,entry));var bytes=matchEvidenceBytes_(storage,entry,entry.generation,false);matchEvidenceMagic_(bytes,entry.mime,entry.size);snapshotActor_(store,request.token);return {mime:entry.mime,base64:Utilities.base64Encode(bytes)};}

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
/* END GENERATED WORKFLOW FEATURES */
