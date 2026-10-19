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
  recordKey: 'NODE_RECORD_ID',
  sourceKey: 'NODE_SOURCE',
  deletedKey: 'NODE_DELETED_CANDIDATE',
  candidateProfileKey: 'NODE_CANDIDATE_PROFILE_ID',
  configKey: 'NODE_CONFIG',
  pepperKey: 'NODE_PEPPER',
  sessionHours: 6,
  sessionsPerAccount: 8,
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
  seedNames: ['越前祐美','鈴木楓','櫻庭奈々','髙田侑弥','佐藤光','倉島颯汰','佐々木駿'],
  seedSheetNames: [['越前','越前祐美'],['鈴木','鈴木楓'],['櫻庭','櫻庭奈々'],['高田','髙田侑弥'],['佐藤','佐藤光'],['倉島','倉島颯汰'],['佐々木駿']],
  seedColors: ['mint','blue','amber','violet','rose','cyan','blue']
});

function doGet() { return output_({ ok: true, data: health_() }); }
function doPost(e) {
  try {
    var text = e && e.postData && e.postData.contents;
    if (typeof text !== 'string' || text.length > 32768) fail_('BAD_REQUEST', 'リクエストを確認してください。');
    var request;
    try { request = JSON.parse(text); } catch (_) { fail_('BAD_REQUEST', 'JSON形式を確認してください。'); }
    return output_({ ok: true, data: nodeHandle_(request) });
  } catch (error) {
    return output_({ ok: false, error: { code: error.nodeCode || 'INTERNAL', message: error.nodeCode ? error.message : '処理を完了できませんでした。入力を残したまま再試行してください。' } });
  }
}
function output_(body) { return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code, message) { var error = new Error(message); error.nodeCode = code; throw error; }
function props_() { return PropertiesService.getScriptProperties(); }
function config_() {
  var raw = props_().getProperty(NODE.configKey);
  if (!raw) fail_('NOT_CONFIGURED', '管理者による連携設定が必要です。');
  var config = JSON.parse(raw);
  if (!config.spreadsheetId || config.matchingSheetId === config.kpiSheetId) fail_('NOT_CONFIGURED', '連携設定を確認してください。');
  return config;
}
function writesEnabled_(config) {
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
  return { configured: true, writesEnabled: writesEnabled_(config), protocol: NODE.protocol };
}
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) fail_('BUSY', '別の処理が実行中です。少し待って再試行してください。');
  try { return fn(); } finally { lock.releaseLock(); }
}
function nodeHandle_(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || request.version !== 1 || typeof request.action !== 'string') fail_('BAD_REQUEST', 'APIバージョンと操作を確認してください。');
  var action = request.action;
  if (action === 'health') return health_();
  if (action === 'login') return login_(request.payload || {});
  if (action === 'changePassword') return changePassword_(request);
  if (action === 'auditSecurity') return auditSecurity_(request);
  if (['snapshot','logout','saveActivity','updateStatus','updateProfile','createPlayer','updateRecord','deleteCandidate','cancelAchievement','restoreChange','managementTables','managementTable','saveManagementRow','createCandidate','saveInterviewReview','saveCandidateProfile','saveClient','analyzeInterviewReviews','readInterviewAdvice','readWorkspaceInsights','analyzeWorkspaceInsights','readWritingKit','generateWritingKit','readWritingPreferences','saveWritingPreferences'].indexOf(action) < 0) fail_('BAD_REQUEST', '対応していない操作です。');
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
    authenticate_(request.token);
    var snapshotStore = readStore_({ readOnly: true });
    return authenticatedSnapshot_(snapshotStore, request.token);
  }
  var committed = withLock_(function () {
    var user = authenticate_(request.token);
    if (action === 'logout') { props_().deleteProperty(sessionKey_(request.token)); return { loggedOut: true }; }
    var activity = request.payload && request.payload.activity;
    var existingRow = ['saveInterviewReview','saveCandidateProfile','saveClient','updateStatus','updateRecord','deleteCandidate','cancelAchievement'].indexOf(action) >= 0 || action === 'saveActivity' && activity && activity.recordId;
    // Existing-row edits only need named candidate rows. New rows still inspect
    // the entire template, preserving blank-row and formula protection.
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
      return { user:user, result:previous.result, operationId:operationId };
    }
    var plan;
    if (action === 'saveInterviewReview') plan = planInterviewReview_(store,user,payload);
    if (action === 'saveActivity') plan = planActivity_(store, user, payload.activity);
    if (action === 'updateStatus') plan = planStatus_(store, user, payload);
    if (action === 'updateProfile') plan = planProfile_(store, user, payload.player);
    if (action === 'createPlayer') plan = planPlayer_(store, user, payload, operationId);
    if (action === 'createCandidate') plan = planCandidate_(store,user,payload);
    if (action === 'saveCandidateProfile') plan = planCandidateProfile_(store,user,payload);
    if (action === 'saveClient') plan = planClient_(store,user,payload);
    if (action === 'updateRecord') plan = planRecord_(store,user,payload);
    if (action === 'deleteCandidate') plan = planDeleteCandidate_(store,user,payload,operationId);
    if (action === 'cancelAchievement') plan = planCancelAchievement_(store,user,payload);
    if (action === 'restoreChange') plan = planRestoreChange_(store,user,payload);
    if (action === 'saveManagementRow') plan = planManagementRow_(store,user,payload);
    commit_(store, user, action, operationId, payloadHash, plan, request.token);
    return { user:user, result:plan.result || {}, operationId:operationId };
  });
  if (action === 'logout') return committed;
  // The atomic write is complete. Do not make other writers wait for a fresh
  // dashboard read, and do not fetch thousands of formula-only template rows.
  var freshStore = readStore_({ readOnly:true });
  return mutationResponse_(freshStore, committed.user, action, committed.result, committed.operationId, request.token);
}

/* Authentication is entirely server-side. Tokens and passwords are never stored in sheet cells. */
function hash_(text) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8)).replace(/=+$/, ''); }
function hmac_(text, key) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(text), String(key), Utilities.Charset.UTF_8)).replace(/=+$/, ''); }
function random256_() { return hash_(Utilities.getUuid() + '|' + Utilities.getUuid() + '|' + Utilities.getUuid() + '|' + Date.now()); }
function passwordHash_(password, salt) { return hmac_(String(password) + '|' + salt, props_().getProperty(NODE.pepperKey) || fail_('NOT_CONFIGURED', '認証設定が必要です。')); }
function makeAuth_(password) { var salt = random256_(); return { salt: salt, hash: passwordHash_(password, salt) }; }
function constantEqual_(a, b) {
  a = String(a || ''); b = String(b || ''); var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function sessionKey_(token) { return 'NODE_SESSION_' + hash_(token); }
function authRecord_(id) {
  var raw=props_().getProperty('NODE_AUTH_'+id),auth;
  try{auth=raw?JSON.parse(raw):null;}catch(_){return null;}
  if(!auth||typeof auth.salt!=='string'||typeof auth.hash!=='string'||auth.salt.length>200||auth.hash.length!==43||(auth.version!==undefined&&typeof auth.version!=='string'))return null;
  return auth;
}
function authenticate_(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail_('UNAUTHENTICATED', 'ログインしてください。');
  var key=sessionKey_(token),raw=props_().getProperty(key),session;
  try{session=raw?JSON.parse(raw):null;}catch(_){session=null;}
  if (!session || typeof session.id!=='string' || typeof session.expiresAt!=='number' || !isFinite(session.expiresAt) || session.expiresAt <= Date.now()) { props_().deleteProperty(key); fail_('UNAUTHENTICATED', 'ログインの有効期限が切れました。'); }
  var auth=authRecord_(session.id);
  if(!auth||(session.authVersion||null)!==(auth.version||null)){props_().deleteProperty(key);fail_('UNAUTHENTICATED','パスワードが更新されました。もう一度ログインしてください。');}
  return { id: session.id };
}
function activeActor_(store, session) {
  var player = store.players.find(function (p) { return p.id === session.id && p.active; });
  if (!player) fail_('UNAUTHENTICATED', 'このアカウントは利用できません。');
  return { id: player.id, role: player.role };
}
function login_(payload) {
  // Only rate counters, account checks and token issuance share the write lock.
  // Fetching the business table afterwards must not queue every player's login.
  var issued = withLock_(function () { return issueSession_(payload); });
  if (payload.sessionOnly === true) return { token: issued.token };
  try {
    var store = readStore_({ readOnly: true }, issued.accountStore);
    return { token: issued.token, snapshot: authenticatedSnapshot_(store, issued.token) };
  } catch (error) { props_().deleteProperty(sessionKey_(issued.token)); throw error; }
}
function issueSession_(payload) {
  var config = config_();
  var id = typeof payload.id === 'string' && payload.id.length <= 30 ? payload.id.trim().toUpperCase() : '';
  var password = typeof payload.password === 'string' && payload.password.length <= 200 ? payload.password : '';
  var raw = id ? props_().getProperty('NODE_AUTH_' + id) : null;
  // Public callers cannot allocate one ScriptProperty per invented ID.
  var now = Date.now(), rateKey = raw ? 'NODE_RATE_' + hash_(id) : 'NODE_RATE_UNKNOWN', rawRate = props_().getProperty(rateKey);
  var rate = rawRate ? JSON.parse(rawRate) : { start: now, failures: 0 };
  if (now - rate.start >= 15 * 60 * 1000) rate = { start: now, failures: 0 };
  var globalRaw = props_().getProperty('NODE_LOGIN_RATE'), globalRate = globalRaw ? JSON.parse(globalRaw) : { start: now, attempts: 0 };
  if (now - globalRate.start >= 60 * 1000) globalRate = { start: now, attempts: 0 };
  if (rate.failures >= 5 || globalRate.attempts >= 60) fail_('RATE_LIMITED', 'ログイン試行が多すぎます。時間をおいて再試行してください。');
  globalRate.attempts++; props_().setProperty('NODE_LOGIN_RATE', JSON.stringify(globalRate));
  var auth = authRecord_(id) || { salt: 'unavailable', hash: '' };
  var valid = constantEqual_(passwordHash_(password, auth.salt), auth.hash);
  if (!valid) { rate.failures++; props_().setProperty(rateKey, JSON.stringify(rate)); fail_('INVALID_CREDENTIALS', 'IDまたはパスワードを確認してください。'); }
  var store = readAccountStore_(config), actor = store.players.find(function (p) { return p.id === id && p.active; });
  if (!actor) { rate.failures++; props_().setProperty(rateKey, JSON.stringify(rate)); fail_('INVALID_CREDENTIALS', 'IDまたはパスワードを確認してください。'); }
  props_().deleteProperty(rateKey);
  cleanupSessions_();
  var token = random256_();
  registerSession_(id,token,auth.version||null);
  return { token: token, accountStore: store };
}
function sessionIndexKey_(id) {return 'NODE_SESSIONS_INDEX_'+hash_(id);}
function parseSession_(raw) {try{var session=JSON.parse(raw);return session&&typeof session.id==='string'&&typeof session.expiresAt==='number'&&isFinite(session.expiresAt)&&session.expiresAt>Date.now()?session:null;}catch(_){return null;}}
function registerSession_(id,token,authVersion) {
  var properties=props_(),index=[];
  try{index=JSON.parse(properties.getProperty(sessionIndexKey_(id))||'[]');}catch(_){}
  if(!Array.isArray(index))index=[];
  index=index.filter(function(key){if(typeof key!=='string'||!/^NODE_SESSION_[A-Za-z0-9_-]{43}$/.test(key))return false;var session=parseSession_(properties.getProperty(key));return session&&session.id===id;});
  while(index.length>=NODE.sessionsPerAccount)properties.deleteProperty(index.shift());
  var key=sessionKey_(token);
  properties.setProperty(key,JSON.stringify({id:id,issuedAt:Date.now(),expiresAt:Date.now()+NODE.sessionHours*3600000,authVersion:authVersion}));
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
    groups[session.id].push({key:key,time:session.issuedAt||session.expiresAt-NODE.sessionHours*3600000});
  });
  Object.keys(groups).forEach(function(id){var sessions=groups[id].sort(function(a,b){return a.time-b.time;});while(sessions.length>NODE.sessionsPerAccount)props_().deleteProperty(sessions.shift().key);props_().setProperty(sessionIndexKey_(id),JSON.stringify(sessions.map(function(s){return s.key;})));});
  props_().setProperty('NODE_CLEANUP_AT', String(now));
}
function changePassword_(request) {
  return withLock_(function(){
    var session=authenticate_(request.token),accounts=readAccountStore_(),user=activeActor_(accounts,session),payload=request.payload||{};
    var current=payload.currentPassword,next=payload.newPassword;
    if(typeof current!=='string'||current.length>200||typeof next!=='string'||next.length<12||next.length>200||/[\u0000-\u001f\u007f]/.test(next)||next===current)fail_('VALIDATION','新しいパスワードは現在と異なる12〜200文字で入力してください。');
    var properties=props_(),rateKey='NODE_RATE_'+hash_(user.id),rate;
    try{rate=JSON.parse(properties.getProperty(rateKey)||'null');}catch(_){rate=null;}
    if(!rate||typeof rate.start!=='number'||typeof rate.failures!=='number'||Date.now()-rate.start>=15*60000)rate={start:Date.now(),failures:0};
    if(rate.failures>=5)fail_('RATE_LIMITED','パスワードの確認回数が多すぎます。時間をおいて再試行してください。');
    var auth=authRecord_(user.id);
    if(!auth||!constantEqual_(passwordHash_(current,auth.salt),auth.hash)){rate.failures++;properties.setProperty(rateKey,JSON.stringify(rate));fail_('INVALID_CREDENTIALS','現在のパスワードを確認してください。');}
    snapshotActor_(accounts,request.token);
    var all=properties.getProperties(),revoke={};
    Object.keys(all).forEach(function(key){if(!/^NODE_SESSION_[A-Za-z0-9_-]{43}$/.test(key))return;var old=parseSession_(all[key]);if(old&&old.id===user.id)revoke[key]=JSON.stringify({id:user.id,expiresAt:0});});
    if(Object.keys(revoke).length){properties.setProperties(revoke,false);if(Object.keys(revoke).some(function(key){return properties.getProperty(key)!==revoke[key];}))fail_('INTERNAL','ログイン状態を更新できませんでした。もう一度ログインしてからパスワードを変更してください。');}
    var updated=makeAuth_(next);updated.version=random256_();var serialized=JSON.stringify(updated),authKey='NODE_AUTH_'+user.id;
    // A credential version also revokes any legacy session missed by cleanup.
    // Check the persisted value if Google reports an ambiguous property write.
    try{properties.setProperty(authKey,serialized);}catch(error){if(properties.getProperty(authKey)!==serialized)throw error;}
    if(properties.getProperty(authKey)!==serialized)fail_('INTERNAL','パスワードの保存を確認できませんでした。新旧どちらかのパスワードでログインを確認してください。');
    properties.deleteProperty(rateKey);properties.deleteProperty(sessionIndexKey_(user.id));
    return {changed:true};
  });
}
function auditSecurity_(request) {
  var session=authenticate_(request.token),accounts=readAccountStore_(),user=activeActor_(accounts,session);requireAdmin_(user);
  var store=readStore_({readOnly:true},accounts),properties=props_(),all=properties.getProperties(),sessions=0;
  Object.keys(all).forEach(function(key){if(!/^NODE_SESSION_[A-Za-z0-9_-]{43}$/.test(key))return;var s=parseSession_(all[key]),account=s&&store.players.find(function(p){return p.id===s.id&&p.active;});if(account){var auth=authRecord_(s.id);if(auth&&(s.authVersion||null)===(auth.version||null))sessions++;}});
  var result={checkedAt:new Date().toISOString(),activePlayers:store.players.filter(function(p){return p.active&&p.role==='player';}).length,activeAdmins:store.players.filter(function(p){return p.active&&p.role==='admin';}).length,disabledAccounts:store.players.filter(function(p){return !p.active;}).length,activeSessions:sessions,sessionsPerAccountLimit:NODE.sessionsPerAccount,sessionHours:NODE.sessionHours,missingCredentials:store.players.filter(function(p){return p.active&&!authRecord_(p.id);}).length,unmappedRecords:store.records.filter(function(r){return !r.playerId;}).length,writesEnabled:store.schemaCompatible&&writesEnabled_(store.config)&&store.book.getSpreadsheetTimeZone()==='Asia/Tokyo',originalProtected:true,aiConfigured:!!properties.getProperty('NODE_GEMINI_API_KEY'),aiFreeTierConfirmed:properties.getProperty('NODE_GEMINI_FREE_TIER_CONFIRMED')==='true'};
  requireAdmin_(snapshotActor_(store,request.token));return result;
}
function snapshotActor_(store, token) {
  var players = readPlayers_(store.playerSheet), actor = activeActor_({ players: players }, authenticate_(token));
  function access(players) { return players.map(function (p) { return [p.id, p.role, p.active, p.sheetNames]; }); }
  // A direct sheet edit can occur while the unlocked read is in flight. Never
  // return records mapped through an obsolete owner/role configuration.
  if (stableJson_(config_()) !== stableJson_(store.config) || stableJson_(access(players)) !== stableJson_(access(store.players))) fail_('BUSY', '管理設定が更新されました。実績を再取得してください。');
  return actor;
}
function authenticatedSnapshot_(store, token) {
  var snapshot = buildSnapshot_(store, activeActor_(store, authenticate_(token)));
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
  var book = SpreadsheetApp.openById(config.spreadsheetId), playerSheet = book.getSheetByName(NODE.playersTab);
  return { config: config, book: book, playerSheet: playerSheet, players: readPlayers_(playerSheet) };
}
function readStore_(options, accountStore) {
  var accounts = accountStore || readAccountStore_(), config = accounts.config, book = accounts.book, playerSheet = accounts.playerSheet, players = accounts.players;
  var matching = book.getSheetByName(NODE.matchingTab), kpi = book.getSheetByName(NODE.kpiTab);
  if (!matching || matching.getSheetId() !== Number(config.matchingSheetId) || !kpi || kpi.getSheetId() !== Number(config.kpiSheetId) || matching.getSheetId() === Number(config.kpiSheetId)) fail_('SCHEMA_MISMATCH', 'マッチングDBとKPIのタブ名・管理IDを確認してください。');
  var operationSheet = book.getSheetByName(NODE.operationsTab);
  var aliases = {};
  players.filter(function (p) { return p.active && p.role === 'player'; }).forEach(function (p) {
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
  if (options && options.readOnly && !useFullGrid) {
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
    players.filter(function (p) { return p.active && p.role === 'player'; }).forEach(function (player) {
      counts[period][player.id] = {};
      metrics.forEach(function (metric) { counts[period][player.id][metric] = sets[period][player.id] && sets[period][player.id][metric] ? sets[period][player.id][metric].size : 0; });
    });
  });
  return counts;
}
function publicPlayer_(player,user) { var own=user.role==='admin'||user.id===player.id;return { id: player.id, name: player.name, team: player.team, color: player.color, target: player.target, bio: own?player.bio:'', sheetNames: own?player.sheetNames.slice():[] }; }
function buildSnapshot_(store, user) {
  var all = activities_(store);
  var snapshot={ self: { playerId: user.id, role: user.role }, players: store.players.filter(function (p) { return p.active && p.role === 'player'; }).map(function(player){return publicPlayer_(player,user);}), activities: all.filter(function (a) { return user.role === 'admin' || a.playerId === user.id; }), counts: countActivities_(all, store.players), syncedAt: new Date().toISOString(), warnings: store.warnings.slice(), writesEnabled: store.schemaCompatible&&writesEnabled_(store.config) && store.book.getSpreadsheetTimeZone() === 'Asia/Tokyo' };
  snapshot.interviewReviews=readInterviewReviews_(store,user);
  snapshot.intakeFeature=true; snapshot.candidateProfiles=readCandidateProfiles_(store,user); snapshot.clients=clientEntries_(store.book);
  snapshot.deletionFeature=true; snapshot.deletedCandidates=deletedCandidates_(store,user);
  snapshot.writingFeature=true; snapshot.writingPreferences=writingPreferences_();
  snapshot.reviewFeature=true;
  snapshot.securityFeature=true; snapshot.workspaceFeature=true;
  snapshot.records=store.schemaCompatible ? store.records.filter(function(r){return user.role==='admin'||r.playerId===user.id;}).map(publicRecord_) : [];
  if(user.role==='admin'){
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
  store.players.filter(function (p) { return p.active && p.id !== id; }).forEach(function (p) { p.sheetNames.forEach(function (a) { used[normalizeName_(a)] = true; }); });
  if (aliases.some(function (alias) { return used[normalizeName_(alias)]; })) fail_('ALIAS_CONFLICT', '別のメンバーが使用している担当者名です。');
}
function planProfile_(store, user, player) {
  if (!player || typeof player !== 'object') fail_('VALIDATION', 'プロフィールが必要です。');
  var id = shortText_(player.id, 30, true), previous = store.players.find(function (p) { return p.id === id && p.active && p.role === 'player'; });
  if (!previous || user.role !== 'admin' && id !== user.id) fail_('FORBIDDEN', 'このプロフィールは更新できません。');
  var name = shortText_(player.name, 40, true), bio = shortText_(player.bio, 120, false), target = target_(player.target);
  var aliases = previous.sheetNames;
  if (user.role === 'admin' && player.sheetNames !== undefined) { aliases = aliases_(player.sheetNames, name); validateAliases_(store, aliases, id); }
  var cells = [id,name,previous.team,previous.color,target,bio,JSON.stringify(aliases),previous.role,true];
  return { requests: [rowUpdateRequest_(store.playerSheet.getSheetId(), previous.row, cells)], profileRow: previous.row, result: {} };
}
function credentialPassword_(actorId, operationId) { return hmac_('new-player|' + actorId + '|' + operationId, props_().getProperty(NODE.pepperKey)); }
function planPlayer_(store, user, payload, operationId) {
  if (user.role !== 'admin') fail_('FORBIDDEN', 'プレイヤーの追加は管理者のみ可能です。');
  var name = shortText_(payload.name, 40, true), team = shortText_(payload.team, 40, true), target = target_(payload.target), aliases = aliases_(payload.sheetNames, name);
  validateAliases_(store, aliases, '');
  var max = store.players.reduce(function (n, p) { var match = p.id.match(/^ND-(\d+)$/); return match ? Math.max(n, Number(match[1])) : n; }, 0), id = 'ND-' + ('000' + (max + 1)).slice(-Math.max(3, String(max + 1).length));
  var password = credentialPassword_(user.id, operationId);
  // Preparing an auth hash cannot grant access: login also requires an active, atomically committed player row.
  props_().setProperty('NODE_AUTH_' + id, JSON.stringify(makeAuth_(password)));
  return { requests: [{ appendCells: { sheetId: store.playerSheet.getSheetId(), rows: [{ values: [id,name,team,'blue',target,'',JSON.stringify(aliases),'player',true].map(cell_) }], fields: 'userEnteredValue' } }], result: { playerId: id } };
}
function operation_(store, id) {
  var rows = table_(store.operationSheet, NODE.operationHeaders).slice(1);
  var matches = rows.filter(function (r) { return r[0] === id; });
  if (matches.length > 1) fail_('OPERATION_CONFLICT', '保存履歴を管理者が確認してください。');
  if (!matches.length) return null;
  var row = matches[0]; return { actorId: String(row[1]), action: String(row[2]), payloadHash: String(row[3]), result: JSON.parse(String(row[4] || '{}')) };
}
function mutationResponse_(store, user, action, result, operationId, token) {
  var response = { snapshot: token ? authenticatedSnapshot_(store,token) : buildSnapshot_(store, user) };
  if (result.undo) response.changeId=operationId;
  if (action === 'createPlayer' && token) requireAdmin_(snapshotActor_(store, token));
  if (action === 'createPlayer') response.credentials = { id: result.playerId, password: credentialPassword_(user.id, operationId) };
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
  var requests = [], businessSheet = store.matching;
  if (plan.row) {
    if (businessSheet.getSheetId() !== Number(store.config.matchingSheetId) || businessSheet.getSheetId() === Number(store.config.kpiSheetId)) fail_('PROTECTED_SHEET', 'このタブは書き込めません。');
    if (plan.record) {
      var currentMetadata = metadataMaps_(businessSheet, [NODE.recordKey, NODE.sourceKey]), ids = currentMetadata[NODE.recordKey], currentRow = Object.keys(ids).find(function (row) { return ids[row].value === plan.recordId; });
      if (!currentRow) fail_('CONFLICT', '対象の行が削除されています。同期してください。');
      currentRow = Number(currentRow);
      var currentRange = businessSheet.getRange(currentRow, 1, 1, 26), currentValues = currentRange.getValues()[0], currentFormulas = currentRange.getFormulas()[0], currentSources = currentMetadata[NODE.sourceKey];
      if (rowVersion_(plan.recordId, currentValues, currentFormulas, currentSources[currentRow] ? currentSources[currentRow].value : '') !== plan.record.version || currentRow !== plan.row) fail_('CONFLICT', '対象行が更新・並べ替えされています。同期してから再入力してください。');
    }
    var maxRows = sheetRowCount_(businessSheet);
    if (plan.row > maxRows) requests.push({ appendDimension: { sheetId: businessSheet.getSheetId(), dimension: 'ROWS', length: plan.row - maxRows } });
    Object.keys(plan.patches).forEach(function (columnText) {
      var column = Number(columnText);
      if ((action==='updateRecord' ? Array.from({length:26},function(_,i){return i+1;}) : NODE.inputColumns).indexOf(column) < 0) fail_('PROTECTED_COLUMN', 'この列は書き込めません。');
      if (plan.row <= maxRows && businessSheet.getRange(plan.row, column).getFormula()) fail_('FORMULA_PROTECTED', '入力先に数式があります。元の数式は上書きしません。');
      if (!plan.record && plan.row <= maxRows && businessSheet.getRange(plan.row, column).getValue() !== '') fail_('CONFLICT', '入力先が更新されています。同期してください。');
      var value = plan.patches[column];
      requests.push({ updateCells: { range: { sheetId: businessSheet.getSheetId(), startRowIndex: plan.row - 1, endRowIndex: plan.row, startColumnIndex: column - 1, endColumnIndex: column }, rows: [{ values: [cell_(value)] }], fields: value instanceof Date ? 'userEnteredValue,userEnteredFormat.numberFormat' : 'userEnteredValue' } });
    });
  }
  if (plan.profileRow && store.playerSheet.getRange(plan.profileRow,1,1,NODE.playerHeaders.length).getFormulas()[0].some(Boolean)) fail_('FORMULA_PROTECTED', 'プロフィールの入力先に数式があります。');
  revalidateManagementPlan_(store,user,plan);
  revalidateIntakePlan_(store,user,plan);
  if(token)snapshotActor_(store,token);
  Array.prototype.push.apply(requests, plan.requests || []);
  if(JSON.stringify(plan.result||{}).length>48000)fail_('VALIDATION','変更履歴が大きすぎます。長いメモは項目を分けて保存してください。');
  requests.push({ appendCells: { sheetId: store.operationSheet.getSheetId(), rows: [{ values: [operationId,user.id,action,payloadHash,JSON.stringify(plan.result || {}),new Date().toISOString()].map(cell_) }], fields: 'userEnteredValue' } });
  sheetsBatch_(store.config.spreadsheetId, requests);
  SpreadsheetApp.flush();
}
function sheetsBatch_(spreadsheetId, requests) {
  assertManagedBook_(spreadsheetId);
  if (!requests.length) return;
  var response = UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + ':batchUpdate', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: JSON.stringify({ requests: requests }), muteHttpExceptions: true });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) fail_('SHEET_WRITE_FAILED', 'シートへの保存を完了できませんでした。同じ操作IDのまま再試行してください。');
  SpreadsheetApp.flush();
}

/* Owner-only editor/menu setup. Never reachable through the web-app action dispatch. */
function onOpen() { SpreadsheetApp.getUi().createMenu('NODE連携').addItem('新しい管理シートの初期設定','setupNode').addItem('別の検証用コピーを設定','setupNodeVerificationCopy').addItem('検証用コピーの書き込みを有効化','enableNodeWritesForCopy').addItem('検証用コピーで実検証','verifyNodeCopyIntegration').addItem('検証後に新しい管理シートを有効化','enableNodeDestinationAfterVerifiedCopy').addItem('行IDを同期','syncNodeRowIds').addItem('書き込みを停止','disableNodeWrites').addItem('パスワードを再発行','rotateNodePassword').addItem('全員のパスワードを再発行','rotateAllNodePasswords').addToUi(); }
function requireOwner_() {
  var active = Session.getActiveUser().getEmail(), effective = Session.getEffectiveUser().getEmail();
  if (!active || !effective || active !== effective) fail_('FORBIDDEN', 'スクリプト所有者がエディターまたはシートから実行してください。');
  var raw = props_().getProperty(NODE.configKey);
  if (raw && JSON.parse(raw).ownerEmail !== active) fail_('FORBIDDEN', '設定した所有者のみ実行できます。');
  return active;
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
    NODE.seedNames.forEach(function (name, i) { rows.push(['ND-' + ('00' + (i + 1)).slice(-3),name,'NODE',NODE.seedColors[i],20,'',JSON.stringify(NODE.seedSheetNames[i]),'player',true]); });
    props_().setProperty(NODE.pepperKey, random256_());
    rows.slice(1).forEach(function (row) { var password = random256_(); props_().setProperty('NODE_AUTH_' + row[0],JSON.stringify(makeAuth_(password))); credentials.push({ id:row[0],name:row[1],password:password }); });
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
  if(['saveActivity','updateStatus','updateRecord','deleteCandidate','cancelAchievement','restoreChange','saveManagementRow','createCandidate','saveCandidateProfile','saveClient'].indexOf(action)<0)return;
  if((action==='restoreChange'||action==='saveManagementRow'||action==='createCandidate'||action==='saveCandidateProfile'||action==='saveClient')&&probeReservation_(store,user.id,false))fail_('FORBIDDEN','検証専用アカウントにはこの操作は許可されていません。');
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
  if(ui.alert('複製シートで実検証','検証コピーの末尾に新規2行を追加し、その2行だけ入力制限を外してログイン・保存・数式拒否・読み戻しを確認します。既存セルは変更せず、終了時にテスト内容を消去します。空の2行とアプリの検証履歴はコピーに残します。',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
  props_().deleteProperty('NODE_COPY_PROOF');
  var adminToken=random256_(),testToken='',testId='',suffix=Utilities.getUuid().replace(/-/g,'').slice(0,12),failure=null,cleanupConfirmed=false;
  props_().setProperty(sessionKey_(adminToken),JSON.stringify({id:'ADMIN',expiresAt:Date.now()+30*60000}));
  try{
    var created=nodeHandle_({version:1,action:'createPlayer',token:adminToken,operationId:'copy-probe-player-'+suffix,payload:{name:'連携検証'+suffix,team:'検証用',target:1,sheetNames:['連携検証'+suffix]}});
    testId=created.credentials.id;
    reserveCopyProbeRows_(testId);
    var loggedIn=nodeHandle_({version:1,action:'login',payload:{id:testId,password:created.credentials.password}});
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
    if(testToken)props_().deleteProperty(sessionKey_(testToken));props_().deleteProperty(sessionKey_(adminToken));if(testId)props_().deleteProperty('NODE_AUTH_'+testId);
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
  sheetsBatch_(store.config.spreadsheetId,requests);SpreadsheetApp.flush();
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
function disableNodeWrites() { requireOwner_(); return withLock_(function () { var config=config_();config.writesEnabled=false;props_().setProperty(NODE.configKey,JSON.stringify(config)); }); }
function rotateNodePassword() {
  requireOwner_(); var ui=SpreadsheetApp.getUi(),answer=ui.prompt('パスワード再発行','対象ID（ADMINまたはND-001など）',ui.ButtonSet.OK_CANCEL);
  if(answer.getSelectedButton()!==ui.Button.OK)return;
  var id=answer.getResponseText().trim().toUpperCase();
  return withLock_(function () { var store=readStore_(),player=store.players.find(function(p){return p.id===id&&p.active;});if(!player)fail_('VALIDATION','対象IDがありません。');var password=random256_();props_().setProperty('NODE_AUTH_'+id,JSON.stringify(makeAuth_(password)));var all=props_().getProperties();Object.keys(all).forEach(function(key){if(key.indexOf('NODE_SESSION_')===0&&JSON.parse(all[key]).id===id)props_().deleteProperty(key);});showCredentials_([{id:id,name:player.name,password:password}],'再発行したログイン情報'); });
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
    current.players.forEach(function(p){var password=random256_(),key='NODE_AUTH_'+p.id,rateKey='NODE_RATE_'+hash_(p.id);updates[key]=JSON.stringify(makeAuth_(password));previous[key]=before[key];updates[rateKey]=JSON.stringify({start:Date.now(),failures:0});previous[rateKey]=before[rateKey];credentials.push({id:p.id,name:p.name,password:password});});
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
  var html='<div style="font-family:system-ui;padding:16px"><p>パスワードは画面を閉じる前に控えてください。シート・ログには保存しません。</p><table style="border-collapse:collapse;width:100%">'+credentials.map(function(c){return '<tr><td style="padding:10px">'+escapeHtml_(c.id)+' '+escapeHtml_(c.name)+'</td><td><code style="user-select:all">'+escapeHtml_(c.password)+'</code></td></tr>';}).join('')+'</table></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(850).setHeight(500),title);
}

if (typeof NODE_TESTS !== 'undefined') Object.assign(NODE_TESTS,{constants:NODE,handle:nodeHandle_,hash:hash_,passwordHash:passwordHash_,makeAuth:makeAuth_,day:day_,dayDate:dayDate_,candidateId:candidateId_,detectHeader:detectHeader_,countActivities:countActivities_,rowVersion:rowVersion_,readStore:readStore_,snapshot:buildSnapshot_,activities:activities_,writesEnabled:writesEnabled_,makeCopyProof:makeCopyProof_,validCopyProof:validCopyProof_,verifyDestinationReadiness:verifyDestinationReadiness_,destinationAuthorization:destinationAuthorization_,resolveBusinessTabs:resolveBusinessTabs_,assertManagedBook:assertManagedBook_,mappedHeadersMatch:mappedHeadersMatch_});

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
function managementTable_(book,payload) {
  var sheet=managementSheet_(book,payload.sheetId),start=payload.startRow===undefined?1:payload.startRow,rows=gridRead_(book,sheet,start,50);
  var imported=sheet.getName()==='稼働者管理表';
  var header=sheet.getName()==='目標'?0:/^マッチ計上/.test(sheet.getName())?4:sheet.getName()==='1期目マッチングDB'||imported?1:2,headers=header?(start<=header&&header<start+rows.length?rows[header-start]:gridRead_(book,sheet,header,1)[0]).map(function(c){return c.formattedValue||'';}):[];
  return {sheetId:sheet.getSheetId(),title:sheet.getName(),startRow:start,rowCount:sheet.getMaxRows(),columnCount:Math.min(100,sheet.getMaxColumns()),readonly:imported,
    headers:headers,rows:rows.map(function(cells,i){return {row:start+i,version:gridFingerprint_(cells),cells:cells.map(function(c,j){return publicCell_(c,j+1);})};})};
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
  Object.keys(changes).forEach(function(key){var col=Number(key);if(!Number.isInteger(col)||col<1||col>cells.length)fail_('VALIDATION','入力列を確認してください。');var value=primitiveInput_(cells[col-1],changes[key]);
    if(stableJson_(value)===stableJson_(cells[col-1].userEnteredValue||{}))return;
    entries.push({column:col,before:cells[col-1].userEnteredValue||{},after:value});edited[col-1].userEnteredValue=value;requests.push(rawCellRequest_(sheet.getSheetId(),row,col,value));});
  return {check:{sheetId:sheet.getSheetId(),row:row,before:before,recordId:recordId||null},undo:{sheetId:sheet.getSheetId(),row:row,recordId:recordId||null,ownerId:ownerId||'',label:label||sheet.getName(),after:gridFingerprint_(edited),entries:entries},requests:requests};
}
function combinedChangePlan_(changes,label) {
  var entries=changes.filter(function(c){return c.requests.length;});if(!entries.length)fail_('NO_CHANGE','変更する項目を入力してください。');
  return {requests:entries.reduce(function(a,c){return a.concat(c.requests);},[]),checks:entries.map(function(c){return c.check;}),result:{label:label,undo:entries.map(function(c){return c.undo;})}};
}
function planRecord_(store,user,payload) {
  var record=findRecord_(store,payload.recordId);actorOwns_(user,record);checkVersion_(record,payload.rowVersion);
  var changes=payload.changes;if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).length>26)fail_('VALIDATION','変更する項目を確認してください。');
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
  plan.result.deletedCount=targets.length;return plan;
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
    var sheet=item.recordId?store.matching:managementSheet_(store.book,item.sheetId);if(!item.recordId)requireAdmin_(user);
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
  (plan.checks||[]).forEach(function(c){var sheet=c.recordId?store.matching:managementSheet_(store.book,c.sheetId);if(!c.recordId)requireAdmin_(user);
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
  var plan=newPlan_(store,null,owner.id,user.id);setPatch_(plan,3,name);setPatch_(plan,4,owner.sheetNames[0]);setPatch_(plan,2,shortText_(payload.company,100,false));setPatch_(plan,6,choice_(payload.position,NODE.positions));setPatch_(plan,7,'提案候補');plan.result={recordId:plan.recordId};return plan;
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
const finishedRecord = (record) => endedStatus(record) || validInsightDate(valueAt(record, 24)) || valueAt(record, 7) === "稼働開始";
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
        const interviewed = valueAt(record, 17), scheduled = valueAt(record, 10), plannedStart = valueAt(record, 23), offered = valueAt(record, 21), matched = valueAt(record, 22);
        const base = { recordId: record.recordId, candidateName: record.candidateName, companyName: valueAt(record, 2), playerId: record.playerId };
        const add = (task) => tasks.push({ ...base, ...task, id: `${record.recordId}:${task.kind}` });
        if (!finishedRecord(record)) {
            if (validInsightDate(plannedStart) && plannedStart < today) {
                add({ kind: "start_overdue", urgency: "overdue", title: "稼働開始の状況を確認", evidence: `稼働予定 ${plannedStart} · 開始日は未記録`, suggestedAction: "実際の開始日、または予定の変更を確認して記録する。", date: plannedStart });
            }
            else if (validInsightDate(scheduled) && !validInsightDate(interviewed) && scheduled <= today) {
                add({ kind: scheduled === today ? "interview_today" : "interview_overdue", urgency: scheduled === today ? "today" : "overdue", title: scheduled === today ? "今日のC面談を確認" : "C面談の実施状況を確認", evidence: `C面談予定 ${scheduled}${valueAt(record, 11) ? ` ${valueAt(record, 11)}` : ""} · 実施日は未記録`, suggestedAction: scheduled === today ? "参加意思と日時を確認し、面談後に実施日を記録する。" : "実施、延期、辞退のいずれかを確認し、日付と進捗を更新する。", date: scheduled });
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
        proposalTarget: period.length === 7 ? members.reduce((total, member) => total + (Number.isSafeInteger(member.target) && member.target > 0 && member.target <= 9999 ? member.target : 0), 0) : null,
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
        return aggregate.proposalTarget === null ? "月間目標の対象外" : `月間提案目標 ${aggregate.proposalTarget}件`;
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
  plan.requests=plan.requests||[];plan.intakeTableChecks=plan.intakeTableChecks||[];plan.intakeTableChecks.push({title:title,headers:headers,fingerprint:state.fingerprint,sheetId:state.sheet?state.sheet.getSheetId():null});
  var id;if(!state.sheet){do{id=Math.floor(Math.random()*1000000000)+1;}while(store.book.getSheets().some(function(sheet){return sheet.getSheetId()===id;}));plan.requests.push({addSheet:{properties:{sheetId:id,title:title,gridProperties:{rowCount:5001,columnCount:headers.length}}}});plan.requests.push(rowUpdateRequest_(id,1,headers));}
  else{id=state.sheet.getSheetId();if(row>state.sheet.getMaxRows())plan.requests.push({appendDimension:{sheetId:id,dimension:'ROWS',length:row-state.sheet.getMaxRows()}});}
  plan.requests.push(rowUpdateRequest_(id,row,values));
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
  var plan={requests:[],result:{clientId:id}};intakeWritePlan_(store,plan,CLIENT_TAB,CLIENT_HEADERS,state,previous?previous.row:state.rows.length+2,[id,name,active,Utilities.getUuid(),new Date().toISOString()]);return plan;
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
