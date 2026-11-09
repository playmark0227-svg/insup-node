/* Optional editor-only migration helpers. Add this file beside the existing
 * Code.gs; do not deploy a different public API or change migration checkpoints.
 * Each fixed entry repeats one existing, independently locked owner function.
 * No trigger, automatic confirmation update, next-phase dispatch or Sheet write.
 */
// Fill ONLY after reviewing the completed preview receipt. Empty fails closed.
// These explicit editor actions are never called by the batch helpers below.
const NODE_REVIEWED_MIGRATION_SOURCE_HASH = '';
function confirmNodePrepareReviewedHash() { return nodeConfirmReviewedMigrationHash_('prepare'); }
function confirmNodeActivateReviewedHash() { return nodeConfirmReviewedMigrationHash_('activate'); }
// Sets only CANCEL:<hash>. Select cancelNodeFirestoreMigration separately.
function confirmNodeCancelReviewedHash() { return nodeConfirmReviewedMigrationHash_('cancel'); }

function continueNodePreviewBatch() { return nodeMigrationOwnerBatch_('preview'); }
function continueNodePrepareBatch() { return nodeMigrationOwnerBatch_('prepare'); }
function continueNodeImportBatch() { return nodeMigrationOwnerBatch_('import'); }
function continueNodeVerifyBatch() { return nodeMigrationOwnerBatch_('verify'); }
function continueNodeActivateBatch() { return nodeMigrationOwnerBatch_('activate'); }

function nodeConfirmReviewedMigrationHash_(phase) {
  var owner = requireOwner_(), reviewed = NODE_REVIEWED_MIGRATION_SOURCE_HASH;
  if (phase !== 'prepare' && phase !== 'activate' && phase !== 'cancel') fail_('MIGRATION_STATE', '確認する工程を指定してください。');
  if (typeof reviewed !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(reviewed))
    fail_('MIGRATION_CONFIRM_REQUIRED', '完了した事前確認のハッシュ43文字を明示してから実行してください。');
  return withLock_(function() {
    if (requireOwner_() !== owner) fail_('FORBIDDEN', '確認の実行者が変わりました。');
    var target = firestoreMigrationTarget_(), state = firestoreMigrationState_();
    if (target.projectId !== 'insup-node' || target.databaseId !== '(default)')
      fail_('FIRESTORE_NOT_CONFIGURED', 'INSUP NODE専用の移行先を確認してください。');
    var provider = props_().getProperty('NODE_STORAGE_PROVIDER');
    if (provider === 'firestore' || state && state.phase === 'active')
      fail_('MIGRATION_ALREADY_ACTIVE', 'Firebaseへの切替は完了しています。');
    if (provider !== null && provider !== '' && provider !== 'sheets')
      fail_('NOT_CONFIGURED', '現在の保存先を確認してください。');
    var confirmBefore = props_().getProperty(FIRESTORE_MIGRATION_CONFIRM_KEY), preview = null;
    if (phase === 'prepare') {
      if (state && state.phase !== 'abandoned')
        fail_('MIGRATION_STATE', '移行が進行中です。確認値を変更せず現在の工程を続けてください。');
      preview = firestoreMigrationPreview_(); // Existing signature validation.
      if (!preview || !preview.scan.done || preview.scan.sourceHash !== reviewed)
        fail_('MIGRATION_CONFIRM_REQUIRED', '確認したハッシュと完了した事前確認が一致しません。');
      firestoreMigrationAssertContext_(preview, firestoreMigrationContext_(config_()), owner);
    } else {
      var allowedPhase = state && (phase === 'activate' ? state.phase === 'verified' : ['prepared','importing','ready','verified'].indexOf(state.phase) >= 0);
      if (!state || state.rootHashVersion !== 2 || !allowedPhase || state.sourceHash !== reviewed)
        fail_('MIGRATION_CONFIRM_REQUIRED', '確認したハッシュと対象の移行状態が一致しません。');
      if (state.ownerEmail !== owner || !state.target || state.target.projectId !== target.projectId || state.target.databaseId !== target.databaseId)
        fail_('FORBIDDEN', '移行先と実行者を確認してください。');
    }
    if (requireOwner_() !== owner || stableJson_(firestoreMigrationTarget_()) !== stableJson_(target) ||
        stableJson_(firestoreMigrationState_()) !== stableJson_(state) ||
        props_().getProperty('NODE_STORAGE_PROVIDER') !== provider ||
        props_().getProperty(FIRESTORE_MIGRATION_CONFIRM_KEY) !== confirmBefore ||
        phase === 'prepare' && stableJson_(firestoreMigrationPreview_()) !== stableJson_(preview))
      fail_('BUSY', '確認中に移行状態が変わりました。変更せず停止しました。');
    props_().setProperty(FIRESTORE_MIGRATION_CONFIRM_KEY, (phase === 'prepare' ? 'PREPARE:' : phase === 'activate' ? 'ACTIVATE:' : 'CANCEL:') + reviewed);
    var result = {confirmationSet:true, phase:phase, sourceHash:reviewed};
    Logger.log(JSON.stringify(result));
    return result;
  });
}

function nodeMigrationOwnerCompletedPreview_(owner) {
  var preview = firestoreMigrationPreview_(); // Validates the stored checkpoint seal.
  if (!preview || !preview.scan.done) return null;
  if (props_().getProperty('NODE_STORAGE_PROVIDER') === 'firestore')
    fail_('MIGRATION_ALREADY_ACTIVE', 'Firebaseへの切替は完了しています。');
  var context = firestoreMigrationContext_(config_());
  firestoreMigrationAssertContext_(preview, context, owner);
  // Returning the completed receipt does not claim a fresh full source scan.
  // PREPARE still performs its existing independent, exact comparison.
  return firestoreMigrationSummary_({phase:'preview', sourceHash:preview.scan.sourceHash, counts:preview.scan.counts}, {
    rootHashVersion:2, more:false, readOnly:true, alreadyComplete:true,
    prepareConfirmation:'PREPARE:' + preview.scan.sourceHash
  });
}

function nodeMigrationOwnerBatch_(phase) {
  var owner = requireOwner_();
  var entries = {preview:previewNodeFirestoreMigration, prepare:prepareNodeFirestoreMigration,
    import:importNodeFirestoreMigration, verify:verifyNodeFirestoreMigration, activate:activateNodeFirestoreMigration};
  if (!Object.prototype.hasOwnProperty.call(entries, phase))
    fail_('MIGRATION_STATE', '実行する移行工程を確認してください。');
  var started = Date.now(), calls = 0, result;
  do {
    if (requireOwner_() !== owner) fail_('FORBIDDEN', '移行の実行者が変わりました。');
    if (phase === 'preview') {
      var completed = nodeMigrationOwnerCompletedPreview_(owner);
      if (completed) return completed;
    }
    var beforeStage = '';
    if (phase === 'verify' || phase === 'activate') {
      var state = firestoreMigrationState_(); // Validates the existing signed state.
      if (state && state.task && state.task.kind === phase) beforeStage = state.task.stage;
    }
    // No outer script lock: each existing entry acquires and releases its own.
    result = entries[phase]();
    calls++;
    if (!result || typeof result.more !== 'boolean')
      fail_('MIGRATION_STATE', '移行結果を確認できません。同じ工程を確認してください。');
    if (!result.more) return result;
    if (phase === 'verify' || phase === 'activate') {
      if (['sourceBefore','targetExact','targetList','sourceAfter'].indexOf(result.verificationStage) < 0)
        fail_('MIGRATION_STATE', '照合工程を確認できません。同じ工程を確認してください。');
      // A new editor execution refreshes SpreadsheetApp's execution-local reads.
      // Never run an entire new verification stage inside this convenience loop.
      if (result.verificationStage !== beforeStage) return result;
    }
  } while (calls < 8 && Date.now() - started < 210000);
  // Individual RPCs may overrun the time target. Their existing page checkpoints
  // remain the recovery authority even if Apps Script ends the execution early.
  return result;
}

/* Read-only preflight for the dedicated INSUP NODE image bucket. Existing
 * devstorage.read_write OAuth is sufficient for metadata GET; no extra scope,
 * API key, public token, ACL, bucket mutation or test object is introduced.
 * Storage Rules must still be checked separately in the Firebase console.
 */
function verifyNodeFirebaseStorageReadOnly() {
  var owner = requireOwner_(), target = firestoreMigrationTarget_();
  var bucket = props_().getProperty('NODE_FIREBASE_STORAGE_BUCKET');
  nodeFirebaseStorageOwnerMetadata_(target, bucket);
  nodeFirebaseStorageOwnerUnchanged_(owner, target, bucket);
  var result = {verified:true, readOnly:true, location:'ASIA-NORTHEAST1', publicAccessPrevention:'enforced', uniformBucketLevelAccess:true};
  Logger.log(JSON.stringify(result));
  return result;
}

/* Configure one non-secret property after inspecting the existing private
 * bucket. This is needed when the editor's property UI cannot add another row.
 * No billing, IAM, bucket, rule, credential or migration-state mutation occurs.
 */
function configureNodeFirebaseStorageBucket() {
  var owner = requireOwner_();
  return withLock_(function() {
    if (requireOwner_() !== owner) fail_('FORBIDDEN', '設定の実行者が変わりました。');
    var target = firestoreMigrationTarget_(), bucket = 'insup-node.firebasestorage.app';
    var existing = props_().getProperty('NODE_FIREBASE_STORAGE_BUCKET');
    if (existing !== null && existing !== '' && existing !== bucket)
      fail_('STORAGE_NOT_CONFIGURED', '別の画像保存先が設定されています。変更せず停止しました。');
    nodeFirebaseStorageOwnerMetadata_(target, bucket);
    nodeFirebaseStorageOwnerUnchanged_(owner, target, existing);
    if (existing !== bucket) props_().setProperty('NODE_FIREBASE_STORAGE_BUCKET', bucket);
    var result = {configured:true, changed:existing !== bucket, location:'ASIA-NORTHEAST1', publicAccessPrevention:'enforced', uniformBucketLevelAccess:true};
    Logger.log(JSON.stringify(result));
    return result;
  });
}

function nodeFirebaseStorageOwnerUnchanged_(owner, target, existingBucket) {
  if (requireOwner_() !== owner || props_().getProperty('NODE_FIREBASE_STORAGE_BUCKET') !== existingBucket || stableJson_(firestoreMigrationTarget_()) !== stableJson_(target))
    fail_('BUSY', '確認中に設定が変わりました。もう一度確認してください。');
}

function nodeFirebaseStorageOwnerMetadata_(target, bucket) {
  if (target.projectId !== 'insup-node' || bucket !== 'insup-node.firebasestorage.app')
    fail_('STORAGE_NOT_CONFIGURED', 'INSUP NODE専用の画像保存先を確認してください。');
  var metadata = matchEvidenceJson_(matchEvidenceFetch_('get',
    'https://storage.googleapis.com/storage/v1/b/' + encodeURIComponent(bucket) + '?fields=name,location,iamConfiguration'));
  if (!metadata || metadata.name !== bucket || typeof metadata.location !== 'string' || metadata.location.toUpperCase() !== 'ASIA-NORTHEAST1')
    fail_('STORAGE_LOCATION', '画像保存先の名前と東京リージョンを確認してください。');
  var iam = metadata.iamConfiguration;
  if (!iam || iam.publicAccessPrevention !== 'enforced' || !iam.uniformBucketLevelAccess || iam.uniformBucketLevelAccess.enabled !== true)
    fail_('STORAGE_NOT_PRIVATE', '画像保存先の公開禁止と均一アクセスを確認してください。');
}
