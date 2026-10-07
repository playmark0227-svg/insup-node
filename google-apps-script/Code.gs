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
  configKey: 'NODE_CONFIG',
  pepperKey: 'NODE_PEPPER',
  sessionHours: 6,
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
  if (action === 'login') return withLock_(function () { return login_(request.payload || {}); });
  if (['snapshot','logout','saveActivity','updateStatus','updateProfile','createPlayer'].indexOf(action) < 0) fail_('BAD_REQUEST', '対応していない操作です。');
  return withLock_(function () {
    var user = authenticate_(request.token);
    if (action === 'logout') { props_().deleteProperty(sessionKey_(request.token)); return { loggedOut: true }; }
    var store = readStore_();
    user = activeActor_(store, user);
    if (action === 'snapshot') return buildSnapshot_(store, user);
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
      return mutationResponse_(readStore_(), user, action, previous.result, operationId);
    }
    var plan;
    if (action === 'saveActivity') plan = planActivity_(store, user, payload.activity);
    if (action === 'updateStatus') plan = planStatus_(store, user, payload);
    if (action === 'updateProfile') plan = planProfile_(store, user, payload.player);
    if (action === 'createPlayer') plan = planPlayer_(store, user, payload, operationId);
    commit_(store, user, action, operationId, payloadHash, plan);
    return mutationResponse_(readStore_(), user, action, plan.result || {}, operationId);
  });
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
function authenticate_(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail_('UNAUTHENTICATED', 'ログインしてください。');
  var raw = props_().getProperty(sessionKey_(token));
  var session = raw ? JSON.parse(raw) : null;
  if (!session || !session.expiresAt || session.expiresAt <= Date.now()) { props_().deleteProperty(sessionKey_(token)); fail_('UNAUTHENTICATED', 'ログインの有効期限が切れました。'); }
  return { id: session.id };
}
function activeActor_(store, session) {
  var player = store.players.find(function (p) { return p.id === session.id && p.active; });
  if (!player) fail_('UNAUTHENTICATED', 'このアカウントは利用できません。');
  return { id: player.id, role: player.role };
}
function login_(payload) {
  config_();
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
  var auth = raw ? JSON.parse(raw) : { salt: 'unavailable', hash: '' };
  var valid = constantEqual_(passwordHash_(password, auth.salt), auth.hash);
  var store = readStore_(), actor = store.players.find(function (p) { return p.id === id && p.active; });
  if (!valid || !actor) { rate.failures++; props_().setProperty(rateKey, JSON.stringify(rate)); fail_('INVALID_CREDENTIALS', 'IDまたはパスワードを確認してください。'); }
  props_().deleteProperty(rateKey);
  cleanupSessions_();
  var token = random256_(), user = { id: actor.id, role: actor.role };
  props_().setProperty(sessionKey_(token), JSON.stringify({ id: id, expiresAt: now + NODE.sessionHours * 60 * 60 * 1000 }));
  try { return { token: token, snapshot: buildSnapshot_(store, user) }; }
  catch (error) { props_().deleteProperty(sessionKey_(token)); throw error; }
}
function cleanupSessions_() {
  var all = props_().getProperties(), now = Date.now();
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('NODE_SESSION_') === 0) { try { if (JSON.parse(all[key]).expiresAt <= now) props_().deleteProperty(key); } catch (_) { props_().deleteProperty(key); } }
  });
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
  var map = {};
  sheet.createDeveloperMetadataFinder().withKey(key).find().forEach(function (item) {
    var location = item.getLocation(), range = location.getRow();
    if (!range) return;
    var row = range.getRow(), value = item.getValue();
    if (map[row]) fail_('METADATA_CONFLICT', '同じ行に重複した管理IDがあります。管理者が確認してください。');
    map[row] = { value: value, metadataId: item.getId() };
  });
  return map;
}
function readStore_() {
  var config = config_(), book = SpreadsheetApp.openById(config.spreadsheetId);
  var matching = book.getSheets().find(function (sheet) { return sheet.getSheetId() === Number(config.matchingSheetId); });
  var kpi=book.getSheetByName(NODE.kpiTab);
  if (!matching || matching.getName()!==NODE.matchingTab || !kpi || kpi.getSheetId()!==Number(config.kpiSheetId) || matching.getSheetId() === Number(config.kpiSheetId)) fail_('SCHEMA_MISMATCH', 'マッチングDBとKPIのタブ名・管理IDを確認してください。');
  var playerSheet = book.getSheetByName(NODE.playersTab), operationSheet = book.getSheetByName(NODE.operationsTab);
  var playerRows = table_(playerSheet, NODE.playerHeaders);
  var players = playerRows.slice(1).map(function (r, i) {
    if (!r[0]) return null;
    var aliases;
    try { aliases = JSON.parse(String(r[6] || '[]')); } catch (_) { fail_('SCHEMA_MISMATCH', '担当者名の対応表を確認してください。'); }
    if (!Array.isArray(aliases) || aliases.some(function (v) { return typeof v !== 'string'; }) || ['admin','player'].indexOf(String(r[7])) < 0) fail_('SCHEMA_MISMATCH', 'プレイヤーの設定を確認してください。');
    return { id: String(r[0]), name: String(r[1]), team: String(r[2]), color: String(r[3]), target: Number(r[4]), bio: String(r[5] || ''), sheetNames: aliases, role: String(r[7]), active: r[8] === true || String(r[8]).toLowerCase() === 'true', row: i + 2 };
  }).filter(Boolean);
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
  var range = matching.getRange(1, 1, length, 26), values = range.getValues(), formulas = range.getFormulas();
  var headerRow = detectHeader_(values),schemaCompatible=mappedHeadersMatch_(values[headerRow-1]), ids = metadataMap_(matching, NODE.recordKey), sources = metadataMap_(matching, NODE.sourceKey), records = [], warnings = [];
  var unknown = 0, missingIds = 0, invalidDates = 0, seenIds = {};
  for (var n = headerRow; n < values.length; n++) {
    var row = values[n], name = normalizeName_(row[2]);
    if (!name || normalizeHeader_(row[0]).indexOf('面談実施') >= 0 && normalizeHeader_(row[2]).indexOf('氏名') >= 0) continue;
    var owner = aliases[normalizeName_(row[3])];
    if (!owner) { unknown++; continue; }
    var recordId = ids[n + 1] && ids[n + 1].value;
    if (!recordId) { missingIds++; continue; }
    if (seenIds[recordId]) fail_('METADATA_CONFLICT', '管理IDが複数行に存在します。管理者が確認してください。');
    seenIds[recordId] = true;
    var dates = NODE.stageColumns.map(function (column) { var result = day_(row[column - 1]); if (!result && row[column - 1] !== '' && row[column - 1] != null) invalidDates++; return result; });
    var source = sources[n + 1] ? sources[n + 1].value : '';
    records.push({ row: n + 1, recordId: recordId, playerId: owner, candidateId: candidateId_(owner, name), name: name, values: row, formulas: formulas[n], dates: dates, source: source, sourceMetadataId: sources[n + 1] && sources[n + 1].metadataId, version: rowVersion_(recordId, row, formulas[n], source) });
  }
  if (unknown) warnings.push('担当者IDに対応しない行が' + unknown + '行あります。管理者が別名の対応表を確認してください。');
  if(!schemaCompatible)warnings.push('入力対象19列の見出しまたは順序が未確認です。実績は表示せず、書き込みを停止しています。管理者が接続先の列を確認してください。');
  if (missingIds) warnings.push('管理IDのない行が' + missingIds + '行あります。管理者がメニューから行IDの同期を実行してください。');
  if (invalidDates) warnings.push('「停止」など日付以外の値は実績集計から除外しています。');
  warnings.push('C面談実施はQ列で集計します。元KPIのN列との関係は未確認です。KPIタブは書き込みません。');
  warnings.push('紹介元の保存列が未確認のため、アプリの行メタデータに保存します。E列には書き込みません。');
  if (book.getSpreadsheetTimeZone() !== 'Asia/Tokyo') warnings.push('接続先スプレッドシートのタイムゾーンがAsia/Tokyoではないため、書き込みを停止しています。管理者が設定を確認してください。');
  if(config.spreadsheetId===NODE.originalId)warnings.push('現在の接続先は移行元の原本です。書き込みはできません。');
  else if(config.purpose==='production'&&config.spreadsheetId===props_().getProperty(NODE.destinationKey))warnings.push('現在の接続先は登録済みの新しい管理シートです。');
  else if(config.purpose==='verification'&&config.spreadsheetId===props_().getProperty(NODE.verificationKey))warnings.push('現在の接続先は独立した検証用コピーです。');
  else warnings.push('接続先の用途を確認できません。管理者が設定を確認してください。');
  return { config: config, book: book, matching: matching, playerSheet: playerSheet, operationSheet: operationSheet, players: players, values: values, formulas: formulas, headerRow: headerRow, schemaCompatible:schemaCompatible,records: records, warnings: warnings };
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
  store.records.forEach(function (record) {
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
function publicPlayer_(player) { return { id: player.id, name: player.name, team: player.team, color: player.color, target: player.target, bio: player.bio, sheetNames: player.sheetNames.slice() }; }
function buildSnapshot_(store, user) {
  var all = activities_(store);
  var snapshot={ self: { playerId: user.id, role: user.role }, players: store.players.filter(function (p) { return p.active && p.role === 'player'; }).map(publicPlayer_), activities: all.filter(function (a) { return user.role === 'admin' || a.playerId === user.id; }), counts: countActivities_(all, store.players), syncedAt: new Date().toISOString(), warnings: store.warnings.slice(), writesEnabled: store.schemaCompatible&&writesEnabled_(store.config) && store.book.getSpreadsheetTimeZone() === 'Asia/Tokyo' };
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
  if (si > 0 && activity.probability !== undefined && activity.probability !== '') setPatch_(plan, 12, choice_(activity.probability, ['Aヨミ','Bヨミ','Cヨミ','Dヨミ']));
  if (activity.interviewScheduledDate) { var scheduled = day_(activity.interviewScheduledDate); if (!scheduled) fail_('INVALID_DATE', 'C面談予定日を確認してください。'); setPatch_(plan, 10, dayDate_(scheduled)); }
  if (activity.clientInterviewScheduledTime) setPatch_(plan, 11, time_(activity.clientInterviewScheduledTime, true));
  if (source && source !== (existing && existing.source || '')) {
    plan.requests.push(existing && existing.sourceMetadataId ? { updateDeveloperMetadata: { dataFilters: [{ developerMetadataLookup: { metadataId: existing.sourceMetadataId } }], developerMetadata: { metadataValue: source }, fields: 'metadataValue' } } : metadataCreate_(store.matching.getSheetId(), plan.row, NODE.sourceKey, source));
  }
  plan.result = { recordId: plan.recordId };
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
function mutationResponse_(store, user, action, result, operationId) {
  var response = { snapshot: buildSnapshot_(store, user) };
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
function commit_(store, user, action, operationId, payloadHash, plan) {
  if(!store.schemaCompatible)fail_('SCHEMA_MISMATCH','入力対象19列の見出しが一致しません。');
  if (store.book.getSpreadsheetTimeZone() !== 'Asia/Tokyo') fail_('TIMEZONE', '接続先スプレッドシートのタイムゾーンがAsia/Tokyoであることを確認してください。');
  var requests = [], businessSheet = store.matching;
  if (plan.row) {
    if (businessSheet.getSheetId() !== Number(store.config.matchingSheetId) || businessSheet.getSheetId() === Number(store.config.kpiSheetId)) fail_('PROTECTED_SHEET', 'このタブは書き込めません。');
    if (plan.record) {
      var ids = metadataMap_(businessSheet, NODE.recordKey), currentRow = Object.keys(ids).find(function (row) { return ids[row].value === plan.recordId; });
      if (!currentRow) fail_('CONFLICT', '対象の行が削除されています。同期してください。');
      currentRow = Number(currentRow);
      var currentRange = businessSheet.getRange(currentRow, 1, 1, 26), currentValues = currentRange.getValues()[0], currentFormulas = currentRange.getFormulas()[0], currentSources = metadataMap_(businessSheet, NODE.sourceKey);
      if (rowVersion_(plan.recordId, currentValues, currentFormulas, currentSources[currentRow] ? currentSources[currentRow].value : '') !== plan.record.version || currentRow !== plan.row) fail_('CONFLICT', '対象行が更新・並べ替えされています。同期してから再入力してください。');
    }
    if (plan.row > businessSheet.getMaxRows()) requests.push({ appendDimension: { sheetId: businessSheet.getSheetId(), dimension: 'ROWS', length: plan.row - businessSheet.getMaxRows() } });
    Object.keys(plan.patches).forEach(function (columnText) {
      var column = Number(columnText);
      if (NODE.inputColumns.indexOf(column) < 0) fail_('PROTECTED_COLUMN', 'この列は書き込めません。');
      if (plan.row <= businessSheet.getMaxRows() && businessSheet.getRange(plan.row, column).getFormula()) fail_('FORMULA_PROTECTED', '入力先に数式があります。元の数式は上書きしません。');
      if (!plan.record && plan.row <= businessSheet.getMaxRows() && businessSheet.getRange(plan.row, column).getValue() !== '') fail_('CONFLICT', '入力先が更新されています。同期してください。');
      var value = plan.patches[column];
      requests.push({ updateCells: { range: { sheetId: businessSheet.getSheetId(), startRowIndex: plan.row - 1, endRowIndex: plan.row, startColumnIndex: column - 1, endColumnIndex: column }, rows: [{ values: [cell_(value)] }], fields: value instanceof Date ? 'userEnteredValue,userEnteredFormat.numberFormat' : 'userEnteredValue' } });
    });
  }
  if (plan.profileRow && store.playerSheet.getRange(plan.profileRow,1,1,NODE.playerHeaders.length).getFormulas()[0].some(Boolean)) fail_('FORMULA_PROTECTED', 'プロフィールの入力先に数式があります。');
  Array.prototype.push.apply(requests, plan.requests || []);
  requests.push({ appendCells: { sheetId: store.operationSheet.getSheetId(), rows: [{ values: [operationId,user.id,action,payloadHash,JSON.stringify(plan.result || {}),new Date().toISOString()].map(cell_) }], fields: 'userEnteredValue' } });
  sheetsBatch_(store.config.spreadsheetId, requests);
  SpreadsheetApp.flush();
}
function sheetsBatch_(spreadsheetId, requests) {
  assertManagedBook_(spreadsheetId);
  if (!requests.length) return;
  var response = UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + ':batchUpdate', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: JSON.stringify({ requests: requests }), muteHttpExceptions: true });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) fail_('SHEET_WRITE_FAILED', 'シートへの保存を完了できませんでした。同じ操作IDのまま再試行してください。');
}

/* Owner-only editor/menu setup. Never reachable through the web-app action dispatch. */
function onOpen() { SpreadsheetApp.getUi().createMenu('NODE連携').addItem('新しい管理シートの初期設定','setupNode').addItem('別の検証用コピーを設定','setupNodeVerificationCopy').addItem('検証用コピーの書き込みを有効化','enableNodeWritesForCopy').addItem('検証用コピーで実検証','verifyNodeCopyIntegration').addItem('検証後に新しい管理シートを有効化','enableNodeDestinationAfterVerifiedCopy').addItem('行IDを同期','syncNodeRowIds').addItem('書き込みを停止','disableNodeWrites').addItem('パスワードを再発行','rotateNodePassword').addToUi(); }
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
  var answer=ui.alert('複製シートへの書き込み','バックアップを確保し、入力列・保護範囲・日付・担当者の別名を確認しましたか？ N列は未確認のため変更しません。',ui.ButtonSet.YES_NO);
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
  if(action!=='saveActivity'&&action!=='updateStatus')return;
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
    var end=store.matching.getMaxRows(),probe={spreadsheetId:store.config.spreadsheetId,actorId:actorId,ownerEmail:owner,matchingSheetId:store.matching.getSheetId(),originalMaxRows:end,rows:[end+1,end+2],recordIds:{},expiresAt:Date.now()+30*60000};
    props_().setProperty(NODE.probeKey,JSON.stringify(probe));
    // Only newly appended verification-copy rows lose inherited validation. Existing cells are untouched.
    sheetsBatch_(store.config.spreadsheetId,[{appendDimension:{sheetId:store.matching.getSheetId(),dimension:'ROWS',length:2}},{setDataValidation:{range:{sheetId:store.matching.getSheetId(),startRowIndex:end,endRowIndex:end+2,startColumnIndex:0,endColumnIndex:26}}}]);
    return probe;
  });
}
function takeProbeRow_(store,actorId,authenticatedId) {
  var probe=probeReservation_(store,actorId,false);if(!probe)return null;
  if(authenticatedId!==actorId)fail_('FORBIDDEN','検証行へ保存できるのは検証専用アカウント本人だけです。');
  var ids=metadataMap_(store.matching,NODE.recordKey);
  for(var i=0;i<probe.rows.length;i++){
    var row=probe.rows[i];if(row>store.matching.getMaxRows())fail_('COPY_PROBE_INVALID','検証行の追加が完了していません。');
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
  [NODE.recordKey,NODE.sourceKey].forEach(function(key){store.matching.createDeveloperMetadataFinder().withKey(key).find().forEach(function(item){var row=item.getLocation().getRow();if(row&&rows.indexOf(row.getRow())>=0)requests.push({deleteDeveloperMetadata:{dataFilter:{developerMetadataLookup:{metadataId:item.getId()}}}});});});
  var player=store.players.find(function(p){return p.id===testId;});
  if(player)requests.push(rowUpdateRequest_(store.playerSheet.getSheetId(),player.row,[player.id,player.name,player.team,player.color,player.target,player.bio,JSON.stringify(player.sheetNames),player.role,false]));
  sheetsBatch_(store.config.spreadsheetId,requests);SpreadsheetApp.flush();
  if(probe){
    // Check raw cells and metadata: inactive actors are intentionally absent from readStore().records.
    var remainingIds=metadataMap_(store.matching,NODE.recordKey),remainingSources=metadataMap_(store.matching,NODE.sourceKey),expectedIds=Object.keys(probe.recordIds).map(function(row){return probe.recordIds[row];});
    probe.rows.forEach(function(row){
      if(row>store.matching.getMaxRows())fail_('CONFLICT','検証行が移動または削除されています。予約を保持して確認を停止しました。');
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
function escapeHtml_(text) { return String(text).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function showCredentials_(credentials,title) {
  var html='<div style="font-family:system-ui;padding:16px"><p>パスワードは画面を閉じる前に控えてください。シート・ログには保存しません。</p><table style="border-collapse:collapse;width:100%">'+credentials.map(function(c){return '<tr><td style="padding:10px">'+escapeHtml_(c.id)+' '+escapeHtml_(c.name)+'</td><td><code style="user-select:all">'+escapeHtml_(c.password)+'</code></td></tr>';}).join('')+'</table></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(850).setHeight(500),title);
}

if (typeof NODE_TESTS !== 'undefined') Object.assign(NODE_TESTS,{constants:NODE,handle:nodeHandle_,hash:hash_,passwordHash:passwordHash_,makeAuth:makeAuth_,day:day_,dayDate:dayDate_,candidateId:candidateId_,detectHeader:detectHeader_,countActivities:countActivities_,rowVersion:rowVersion_,readStore:readStore_,snapshot:buildSnapshot_,activities:activities_,writesEnabled:writesEnabled_,makeCopyProof:makeCopyProof_,validCopyProof:validCopyProof_,verifyDestinationReadiness:verifyDestinationReadiness_,destinationAuthorization:destinationAuthorization_,resolveBusinessTabs:resolveBusinessTabs_,assertManagedBook:assertManagedBook_,mappedHeadersMatch:mappedHeadersMatch_});
