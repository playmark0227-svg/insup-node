/* Optional editor-only backup setup, selected explicitly AFTER active-provider
 * and real application readback checks. Not part of the public action dispatch.
 * Existing datastore OAuth supports all three calls; no new scope/key/IAM grant.
 * https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.backupSchedules/create
 * https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.backupSchedules/get
 * https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.backupSchedules/list
 * This configures a daily schedule, not proof that its first backup has run.
 * Never patches/deletes an existing schedule, writes user documents or properties.
 */
function configureNodeDailyBackup() { return nodeBackupOwnerRun_(true); }
function verifyNodeDailyBackupReadOnly() { return nodeBackupOwnerRun_(false); }

function nodeBackupOwnerContext_() {
  var owner = requireOwner_();
  firestoreMigrationReset_();
  var config = config_(), state = firestoreMigrationState_(), storage = firestoreConfig_();
  if (!state || state.phase !== 'active' || state.ownerEmail !== owner ||
      storage.projectId !== 'insup-node' || storage.databaseId !== '(default)' ||
      stableJson_(state.target) !== stableJson_(storage) ||
      props_().getProperty('NODE_STORAGE_PROVIDER') !== 'firestore' || !firestoreMigrationReady_(config))
    fail_('BACKUP_PROVIDER_NOT_READY', '署名したFirebase保存先への切替と読み戻しを先に確認してください。');
  return {owner:owner, stamp:stableJson_([config, state, storage])};
}

function nodeBackupOwnerUnchanged_(before) {
  var after = nodeBackupOwnerContext_();
  if (after.owner !== before.owner || after.stamp !== before.stamp)
    fail_('BUSY', '確認中に保存先の設定が変わりました。バックアップ一覧を読み戻して確認してください。');
}

function nodeBackupOwnerSchedule_(schedule) {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule) ||
      typeof schedule.name !== 'string' || !/^projects\/insup-node\/databases\/\(default\)\/backupSchedules\/[A-Za-z0-9_-]{1,128}$/.test(schedule.name) ||
      typeof schedule.retention !== 'string' || !/^604800(?:\.0{1,9})?s$/.test(schedule.retention) ||
      !schedule.dailyRecurrence || typeof schedule.dailyRecurrence !== 'object' || Array.isArray(schedule.dailyRecurrence) ||
      Object.keys(schedule.dailyRecurrence).length || Object.prototype.hasOwnProperty.call(schedule, 'weeklyRecurrence'))
    fail_('BACKUP_SCHEDULE_CONFLICT', '既存のバックアップ設定が日次・7日保持と一致しません。上書きしていません。');
  return schedule.name;
}

function nodeBackupOwnerList_() {
  var response = nodeBackupOwnerFetch_('get', 'projects/insup-node/databases/(default)/backupSchedules');
  if (Object.keys(response).some(function(key) { return key !== 'backupSchedules'; }) ||
      response.backupSchedules !== undefined && !Array.isArray(response.backupSchedules))
    fail_('BACKUP_RESPONSE_INVALID', 'バックアップ設定の一覧を確認できません。');
  var schedules = response.backupSchedules || [];
  if (schedules.length > 1) fail_('BACKUP_SCHEDULE_CONFLICT', '複数のバックアップ設定があります。既存設定は上書きしていません。バックアップ一覧を読み戻して確認してください。');
  if (schedules.length) nodeBackupOwnerSchedule_(schedules[0]);
  return schedules;
}

function nodeBackupOwnerRun_(create) {
  requireOwner_();
  try {
    return withLock_(function() {
      var context = nodeBackupOwnerContext_();
      var database = nodeBackupOwnerFetch_('get', 'projects/insup-node/databases/(default)?fields=name,locationId,type');
      if (database.name !== 'projects/insup-node/databases/(default)' || database.locationId !== 'asia-northeast1' || database.type !== 'FIRESTORE_NATIVE')
        fail_('BACKUP_LOCATION', 'INSUP NODEの東京データベースを確認してください。');
      var schedules = nodeBackupOwnerList_(), created = false, name;
      if (!schedules.length && create === true) {
        nodeBackupOwnerUnchanged_(context);
        name = nodeBackupOwnerSchedule_(nodeBackupOwnerFetch_('post', 'projects/insup-node/databases/(default)/backupSchedules', {retention:'604800s', dailyRecurrence:{}}));
        created = true;
      } else if (schedules.length) name = nodeBackupOwnerSchedule_(schedules[0]);
      if (name) {
        if (nodeBackupOwnerSchedule_(nodeBackupOwnerFetch_('get', name)) !== name)
          fail_('BACKUP_RESPONSE_INVALID', 'バックアップ設定の読み戻しが一致しません。');
        var afterList = nodeBackupOwnerList_();
        if (afterList.length !== 1 || afterList[0].name !== name)
          fail_('BACKUP_SCHEDULE_CONFLICT', '確認中にバックアップ設定が変わりました。');
      }
      nodeBackupOwnerUnchanged_(context);
      var result = {configured:!!name, readOnly:create !== true, created:created, scheduleCount:name ? 1 : 0, location:'asia-northeast1'};
      if (name) { result.frequency = 'daily'; result.retentionSeconds = 604800; }
      Logger.log(JSON.stringify(result));
      return result;
    });
  } finally { firestoreMigrationReset_(); }
}

function nodeBackupOwnerFetch_(method, path, payload) {
  requireOwner_();
  var collection = 'projects/insup-node/databases/(default)/backupSchedules';
  var allowedGet = method === 'get' && payload === undefined && (path === collection ||
    path === 'projects/insup-node/databases/(default)?fields=name,locationId,type' ||
    /^projects\/insup-node\/databases\/\(default\)\/backupSchedules\/[A-Za-z0-9_-]{1,128}$/.test(path));
  var allowedPost = method === 'post' && path === collection && stableJson_(payload) === stableJson_({retention:'604800s', dailyRecurrence:{}});
  if (!allowedGet && !allowedPost) fail_('BACKUP_REQUEST_INVALID', '専用のバックアップ操作を確認してください。');
  var options = {method:method, muteHttpExceptions:true, followRedirects:false,
    headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()}};
  if (allowedPost) { options.contentType = 'application/json; charset=UTF-8'; options.payload = JSON.stringify(payload); }
  var response, status, text;
  try { response = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/' + path, options); status = response.getResponseCode(); text = response.getContentText(); }
  catch (_) { fail_('BACKUP_UNAVAILABLE', 'バックアップ処理の応答を確認できません。同じ検査で設定を確認してください。'); }
  if (status === 401 || status === 403) fail_('BACKUP_ACCESS_DENIED', 'バックアップの既存権限とGoogle認証を確認してください。');
  if (status === 409 || status === 412) fail_('BACKUP_SCHEDULE_CONFLICT', '別のバックアップ設定と競合しました。上書きしていません。');
  if (status === 429) fail_('RATE_LIMITED', 'バックアップの確認が集中しています。時間をおいて再確認してください。');
  if ((status !== 200 && !(allowedPost && status === 201)) || typeof text !== 'string' || text.length > 50000)
    fail_('BACKUP_UNAVAILABLE', 'バックアップ設定を確認できません。同じ検査で確認してください。');
  var data;
  try { data = JSON.parse(text); } catch (_) { fail_('BACKUP_RESPONSE_INVALID', 'バックアップの応答形式を確認できません。'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail_('BACKUP_RESPONSE_INVALID', 'バックアップの応答形式を確認できません。');
  return data;
}
