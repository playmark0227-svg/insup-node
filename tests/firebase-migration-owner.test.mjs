import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../google-apps-script/FirebaseMigrationOwner.gs', import.meta.url), 'utf8');
const names = {preview:'continueNodePreviewBatch', prepare:'continueNodePrepareBatch', import:'continueNodeImportBatch', verify:'continueNodeVerifyBatch', activate:'continueNodeActivateBatch'};
const plain = value => JSON.parse(JSON.stringify(value));
function fixture({reviewedHash=''}={}) {
  const data = {now:0, calls:[], owners:0, previewReads:0, preview:null, state:null, props:{NODE_FIREBASE_STORAGE_BUCKET:'insup-node.firebasestorage.app'}, propertyWrites:[], locks:0, releases:0, target:{projectId:'insup-node', databaseId:'(default)'}, metadata:{name:'insup-node.firebasestorage.app', location:'ASIA-NORTHEAST1', iamConfiguration:{publicAccessPrevention:'enforced', uniformBucketLevelAccess:{enabled:true}}}, fetches:[], logs:[], step:()=>({phase:'prepared', more:false})};
  const context = vm.createContext({
    Date:{now:()=>data.now},
    FIRESTORE_MIGRATION_CONFIRM_KEY:'NODE_FIRESTORE_MIGRATION_CONFIRM',
    requireOwner_:()=>{data.owners++; if (data.denyOwner) throw Object.assign(Error('synthetic owner denied'), {nodeCode:'FORBIDDEN'}); return data.owner || 'owner@example.test';},
    fail_:(nodeCode,message)=>{throw Object.assign(Error(message),{nodeCode});},
    props_:()=>({getProperty:key=>data.props[key]??null,setProperty:(key,value)=>{data.propertyWrites.push({key,value});data.props[key]=value;}}),
    withLock_:fn=>{data.locks++;try{return fn();}finally{data.releases++;}},
    config_:()=>({synthetic:true}),
    firestoreMigrationTarget_:()=>structuredClone(data.target),
    firestoreMigrationPreview_:()=>{data.previewReads++;if (data.badSeal) throw Object.assign(Error('synthetic invalid seal'), {nodeCode:'MIGRATION_CHECKPOINT'});return structuredClone(data.preview);},
    firestoreMigrationContext_:()=>({synthetic:true}),
    firestoreMigrationAssertContext_:(p,c,owner)=>{assert.equal(owner,'owner@example.test');assert.deepEqual(plain(p),data.preview);assert.equal(c.synthetic,true);data.afterContext?.();},
    firestoreMigrationSummary_:(state,extra)=>{const out={...state,...extra};data.logs.push(plain(out));return out;},
    firestoreMigrationState_:()=>{if(data.badStateSeal)throw Object.assign(Error('synthetic invalid state seal'),{nodeCode:'MIGRATION_STATE'});return structuredClone(data.state);},
    matchEvidenceFetch_:(method,url)=>{data.fetches.push({method,url});data.afterFetch?.();return structuredClone(data.metadata);},
    matchEvidenceJson_:response=>response,
    stableJson_:JSON.stringify,
    Logger:{log:text=>data.logs.push(JSON.parse(text))}
  });
  for (const phase of Object.keys(names)) context[({preview:'preview',prepare:'prepare',import:'import',verify:'verify',activate:'activate'})[phase]+'NodeFirestoreMigration'] = () => {data.calls.push(phase);return data.step(phase,data.calls.length);};
  vm.runInContext(code.replace(/^const NODE_REVIEWED_MIGRATION_SOURCE_HASH = .*;$/m,'const NODE_REVIEWED_MIGRATION_SOURCE_HASH = '+JSON.stringify(reviewedHash)+';'),context);
  return {context,data};
}

test('all fixed editor entries require the owner before reading state or making requests',()=>{
  for (const name of [...Object.values(names),'verifyNodeFirebaseStorageReadOnly','configureNodeFirebaseStorageBucket','confirmNodePrepareReviewedHash','confirmNodeActivateReviewedHash','confirmNodeCancelReviewedHash']) {
    const {context,data}=fixture();data.denyOwner=true;
    assert.throws(()=>context[name](),error=>error.nodeCode==='FORBIDDEN');
    assert.deepEqual(data.calls,[]);assert.equal(data.previewReads,0);assert.deepEqual(data.fetches,[]);assert.deepEqual(data.propertyWrites,[]);assert.equal(data.locks,0);
  }
});

test('completed signed preview returns its receipt without restarting the source scan',()=>{
  const {context,data}=fixture();
  data.preview={scan:{done:true,sourceHash:'synthetic-finished-hash',counts:{tableCount:21,rowDocumentCount:13501}}};
  const before=JSON.stringify(data.props), result=context.continueNodePreviewBatch();
  assert.equal(result.more,false);assert.equal(result.alreadyComplete,true);
  assert.equal(result.prepareConfirmation,'PREPARE:synthetic-finished-hash');
  assert.deepEqual(data.calls,[]);assert.equal(data.previewReads,1);assert.equal(JSON.stringify(data.props),before);
  data.badSeal=true;
  assert.throws(()=>context.continueNodePreviewBatch(),error=>error.nodeCode==='MIGRATION_CHECKPOINT');
});

test('the real migration summary logs the completed-preview receipt exactly once',()=>{
  const {context,data}=fixture();
  const runtime=readFileSync(new URL('../google-apps-script/Code.gs',import.meta.url),'utf8');
  const start=runtime.indexOf('function firestoreMigrationSummary_(state,extra)');
  const end=runtime.indexOf('\nfunction firestoreMigrationConfirm_',start);
  assert.ok(start>=0&&end>start);
  vm.runInContext(runtime.slice(start,end),context);
  data.preview={scan:{done:true,sourceHash:'synthetic-completed-hash',counts:{tableCount:21,rowDocumentCount:13501,recordIdCount:226,operationCount:20}}};
  const result=context.continueNodePreviewBatch();
  assert.equal(data.logs.length,1);assert.deepEqual(data.logs[0],plain(result));
  assert.equal(data.logs[0].alreadyComplete,true);assert.equal(data.logs[0].more,false);
  assert.deepEqual(data.calls,[]);
  assert.doesNotMatch(JSON.stringify(data.logs),/owner@example|NODE_FIRESTORE|tokens|checkpointSeal/);
});

test('a batch repeats only its fixed existing phase and stops immediately on more false',()=>{
  for (const phase of Object.keys(names)) {
    const {context,data}=fixture();
    if (phase==='verify'||phase==='activate') data.state={task:{kind:phase,stage:'sourceBefore'}};
    data.step=(p,n)=>({phase:p,more:n<3,...(p==='verify'||p==='activate'?{verificationStage:'sourceBefore'}:{})});
    const before=JSON.stringify(data.props),result=context[names[phase]]();
    assert.equal(result.more,false);assert.deepEqual(data.calls,[phase,phase,phase]);
    assert.equal(JSON.stringify(data.props),before);assert.ok(data.owners>=4);
  }
});

test('batch work is capped at eight calls and does not start another after 210 seconds',()=>{
  const fast=fixture();fast.data.step=()=>({more:true});
  assert.equal(fast.context.continueNodeImportBatch().more,true);assert.equal(fast.data.calls.length,8);
  const slow=fixture();slow.data.step=()=>{slow.data.now+=105000;return {more:true};};
  assert.equal(slow.context.continueNodeImportBatch().more,true);assert.equal(slow.data.calls.length,2);
});

test('errors and invalid continuation replies stop without retrying or changing confirmation properties',()=>{
  const broken=fixture();const expected=Object.assign(Error('synthetic unavailable'),{nodeCode:'INTERNAL'});
  broken.data.props.NODE_FIRESTORE_MIGRATION_CONFIRM='ACTIVATE:untouched';
  broken.data.step=(phase,n)=>{if(n===2)throw expected;return {more:true};};
  assert.throws(()=>broken.context.continueNodeImportBatch(),error=>error===expected);assert.equal(broken.data.calls.length,2);
  assert.equal(broken.data.props.NODE_FIRESTORE_MIGRATION_CONFIRM,'ACTIVATE:untouched');
  const invalid=fixture();invalid.data.step=()=>({more:'true'});
  assert.throws(()=>invalid.context.continueNodePrepareBatch(),error=>error.nodeCode==='MIGRATION_STATE');assert.equal(invalid.data.calls.length,1);
});

test('verification and activation return at the actual verificationStage boundary',()=>{
  for (const phase of ['verify','activate']) {
    const {context,data}=fixture();data.state={task:{kind:phase,stage:'targetList'}};
    data.step=(p,n)=>({more:true,verificationStage:n===1?'targetList':'sourceAfter'});
    const result=context[names[phase]]();
    assert.equal(result.verificationStage,'sourceAfter');assert.equal(data.calls.length,2);
  }
  const initial=fixture();initial.data.step=()=>({more:true,verificationStage:'sourceBefore'});
  initial.context.continueNodeVerifyBatch();assert.equal(initial.data.calls.length,1);
});

test('private-bucket preflight uses a fixed metadata GET and emits only safe verification fields',()=>{
  const {context,data}=fixture();data.metadata.unusedPrivateValue='synthetic-provider-secret';
  const before=JSON.stringify(data.props),result=context.verifyNodeFirebaseStorageReadOnly();
  assert.equal(result.verified,true);assert.equal(result.readOnly,true);
  assert.deepEqual(data.fetches,[{method:'get',url:'https://storage.googleapis.com/storage/v1/b/insup-node.firebasestorage.app?fields=name,location,iamConfiguration'}]);
  assert.deepEqual(plain(result),{verified:true,readOnly:true,location:'ASIA-NORTHEAST1',publicAccessPrevention:'enforced',uniformBucketLevelAccess:true});
  assert.equal(JSON.stringify(data.props),before);
  assert.doesNotMatch(JSON.stringify(data.logs),/owner@example|insup-node|synthetic-provider-secret/);
});

test('private-bucket preflight rejects another destination, wrong region and weakened privacy',()=>{
  for (const change of [
    f=>{f.data.target.projectId='different-project';},
    f=>{f.data.props.NODE_FIREBASE_STORAGE_BUCKET='different.appspot.com';},
    f=>{f.data.metadata.name='another-bucket';},
    f=>{f.data.metadata.location='US';},
    f=>{f.data.metadata.iamConfiguration.publicAccessPrevention='inherited';},
    f=>{f.data.metadata.iamConfiguration.uniformBucketLevelAccess.enabled=false;}
  ]) {
    const f=fixture();change(f);
    assert.throws(()=>f.context.verifyNodeFirebaseStorageReadOnly(),error=>/^STORAGE_/.test(error.nodeCode));
    assert.deepEqual(f.data.logs,[]);
  }
  const changed=fixture();changed.data.afterFetch=()=>{changed.data.props.NODE_FIREBASE_STORAGE_BUCKET='changed.example';};
  assert.throws(()=>changed.context.verifyNodeFirebaseStorageReadOnly(),error=>error.nodeCode==='BUSY');
});

test('bucket configuration sets only the fixed property after a private Tokyo GET and is idempotent',()=>{
  for (const initial of [null,'','insup-node.firebasestorage.app']) {
    const {context,data}=fixture();
    if(initial===null)delete data.props.NODE_FIREBASE_STORAGE_BUCKET;
    else data.props.NODE_FIREBASE_STORAGE_BUCKET=initial;
    data.props.NODE_FIRESTORE_MIGRATION_CONFIRM='PREPARE:synthetic-untouched';
    data.props.NODE_FIRESTORE_MIGRATION_STATE='synthetic-signed-state-untouched';
    data.props.syntheticCredential='synthetic-credential-untouched';
    const before={...data.props},result=context.configureNodeFirebaseStorageBucket();
    assert.equal(result.configured,true);assert.equal(result.changed,initial!=='insup-node.firebasestorage.app');
    assert.deepEqual(data.props,{...before,NODE_FIREBASE_STORAGE_BUCKET:'insup-node.firebasestorage.app'});
    assert.deepEqual(data.propertyWrites,initial==='insup-node.firebasestorage.app'?[]:[{key:'NODE_FIREBASE_STORAGE_BUCKET',value:'insup-node.firebasestorage.app'}]);
    assert.equal(data.fetches.length,1);assert.equal(data.fetches[0].method,'get');assert.equal(data.locks,1);assert.equal(data.releases,1);
    assert.doesNotMatch(JSON.stringify(data.logs),/owner@example|insup-node|synthetic|credential|PREPARE|NODE_FIRESTORE/);
  }
});

test('bucket configuration refuses another value, project, location or privacy without writing',()=>{
  for(const change of [
    f=>{f.data.props.NODE_FIREBASE_STORAGE_BUCKET='different.example';},
    f=>{f.data.target.projectId='different-project';},
    f=>{f.data.metadata.name='different-bucket';},
    f=>{f.data.metadata.location='US';},
    f=>{f.data.metadata.iamConfiguration.publicAccessPrevention='inherited';},
    f=>{f.data.metadata.iamConfiguration.uniformBucketLevelAccess.enabled=false;}
  ]) {
    const f=fixture();delete f.data.props.NODE_FIREBASE_STORAGE_BUCKET;change(f);
    const before={...f.data.props};
    assert.throws(()=>f.context.configureNodeFirebaseStorageBucket(),error=>/^STORAGE_/.test(error.nodeCode));
    assert.deepEqual(f.data.props,before);assert.deepEqual(f.data.propertyWrites,[]);assert.deepEqual(f.data.logs,[]);
    assert.equal(f.data.releases,1);
  }
});

test('bucket configuration detects a changed owner, target or existing property after GET',()=>{
  for(const change of [
    f=>{f.data.owner='another-owner@example.test';},
    f=>{f.data.target.databaseId='changed-database';},
    f=>{f.data.props.NODE_FIREBASE_STORAGE_BUCKET='concurrent.example';}
  ]) {
    const f=fixture();delete f.data.props.NODE_FIREBASE_STORAGE_BUCKET;
    f.data.afterFetch=()=>change(f);
    assert.throws(()=>f.context.configureNodeFirebaseStorageBucket(),error=>error.nodeCode==='BUSY');
    assert.deepEqual(f.data.propertyWrites,[]);assert.deepEqual(f.data.logs,[]);assert.equal(f.data.releases,1);
  }
  const unavailable=fixture();delete unavailable.data.props.NODE_FIREBASE_STORAGE_BUCKET;
  const expected=Object.assign(Error('synthetic access denied'),{nodeCode:'STORAGE_ACCESS_DENIED'});
  unavailable.data.afterFetch=()=>{throw expected;};
  assert.throws(()=>unavailable.context.configureNodeFirebaseStorageBucket(),error=>error===expected);
  assert.deepEqual(unavailable.data.propertyWrites,[]);assert.equal(unavailable.data.releases,1);
});

const reviewed='a'.repeat(43);
function confirmationFixture(phase) {
  const f=fixture({reviewedHash:reviewed});
  f.data.preview={scan:{done:true,sourceHash:reviewed,counts:{tableCount:21,rowDocumentCount:13501}}};
  f.data.props.NODE_FIRESTORE_MIGRATION_CONFIRM='PREPARE:synthetic-old-confirmation';
  f.data.props.NODE_FIRESTORE_MIGRATION_STATE='synthetic-signed-state-untouched';
  f.data.props.syntheticCredential='synthetic-credential-untouched';
  if(phase==='activate'||phase==='cancel')f.data.state={rootHashVersion:2,phase:phase==='activate'?'verified':'prepared',sourceHash:reviewed,ownerEmail:'owner@example.test',target:{...f.data.target,workbookId:'synthetic-migration'}};
  return f;
}

test('explicit confirmation requires a reviewed 43-character hash and never fills it automatically',()=>{
  for(const reviewedHash of ['', 'short', 'a'.repeat(42), 'a'.repeat(44), '!'.repeat(43), 43]) {
    for(const entry of ['confirmNodePrepareReviewedHash','confirmNodeActivateReviewedHash','confirmNodeCancelReviewedHash']) {
      const f=fixture({reviewedHash});
      assert.throws(()=>f.context[entry](),error=>error.nodeCode==='MIGRATION_CONFIRM_REQUIRED');
      assert.deepEqual(f.data.propertyWrites,[]);assert.equal(f.data.previewReads,0);assert.equal(f.data.locks,0);
    }
  }
});

test('explicit PREPARE, ACTIVATE and CANCEL setters write only the one confirmation property',()=>{
  for(const phase of ['prepare','activate','cancel']) {
    const f=confirmationFixture(phase),before=structuredClone(f.data.props),beforeState=structuredClone(f.data.state);
    const result=f.context[phase==='prepare'?'confirmNodePrepareReviewedHash':phase==='activate'?'confirmNodeActivateReviewedHash':'confirmNodeCancelReviewedHash']();
    const expected=(phase==='prepare'?'PREPARE:':phase==='activate'?'ACTIVATE:':'CANCEL:')+reviewed;
    assert.deepEqual(f.data.propertyWrites,[{key:'NODE_FIRESTORE_MIGRATION_CONFIRM',value:expected}]);
    assert.deepEqual(f.data.props,{...before,NODE_FIRESTORE_MIGRATION_CONFIRM:expected});assert.deepEqual(f.data.state,beforeState);
    assert.deepEqual(plain(result),{confirmationSet:true,phase,sourceHash:reviewed});
    assert.equal(f.data.locks,1);assert.equal(f.data.releases,1);assert.deepEqual(f.data.calls,[]);assert.deepEqual(f.data.fetches,[]);
    assert.doesNotMatch(JSON.stringify(f.data.logs),/owner@example|credential|synthetic-|checkpointSeal|ownerEmail/);
  }
});

test('PREPARE confirmation refuses incomplete, changed or invalid signed previews and in-progress states',()=>{
  for(const change of [
    f=>{f.data.preview=null;},
    f=>{f.data.preview.scan.done=false;},
    f=>{f.data.preview.scan.sourceHash='b'.repeat(43);},
    f=>{f.data.badSeal=true;},
    ...['prepared','importing','ready','verified','active'].map(phase=>f=>{f.data.state={phase};}),
    f=>{f.data.props.NODE_STORAGE_PROVIDER='firestore';},
    f=>{f.data.target.projectId='other-project';},
    f=>{f.data.target.databaseId='other-database';}
  ]) {
    const f=confirmationFixture('prepare');change(f);const before=structuredClone(f.data.props);
    assert.throws(()=>f.context.confirmNodePrepareReviewedHash());
    assert.deepEqual(f.data.propertyWrites,[]);assert.deepEqual(f.data.props,before);assert.deepEqual(f.data.logs,[]);
  }
});

test('ACTIVATE confirmation requires the signed verified state, matching owner, hash and dedicated target',()=>{
  for(const change of [
    f=>{f.data.state=null;},
    f=>{f.data.badStateSeal=true;},
    f=>{f.data.state.rootHashVersion=1;},
    ...['prepared','importing','ready','active','abandoned'].map(phase=>f=>{f.data.state.phase=phase;}),
    f=>{f.data.state.sourceHash='b'.repeat(43);},
    f=>{f.data.state.ownerEmail='another-owner@example.test';},
    f=>{f.data.state.target.projectId='other-project';},
    f=>{f.data.state.target.databaseId='other-database';}
  ]) {
    const f=confirmationFixture('activate');change(f);const before=structuredClone(f.data.props);
    assert.throws(()=>f.context.confirmNodeActivateReviewedHash());
    assert.deepEqual(f.data.propertyWrites,[]);assert.deepEqual(f.data.props,before);assert.deepEqual(f.data.logs,[]);
  }
});

test('CANCEL confirmation is limited to an existing signed matching pre-activation state',()=>{
  for(const phase of ['prepared','importing','ready','verified']) {
    const f=confirmationFixture('cancel');f.data.state.phase=phase;
    const beforeState=structuredClone(f.data.state);
    assert.equal(f.context.confirmNodeCancelReviewedHash().confirmationSet,true);
    assert.deepEqual(f.data.propertyWrites,[{key:'NODE_FIRESTORE_MIGRATION_CONFIRM',value:'CANCEL:'+reviewed}]);
    assert.deepEqual(f.data.state,beforeState);assert.deepEqual(f.data.calls,[]);
  }
  for(const change of [
    f=>{f.data.state=null;},
    f=>{f.data.badStateSeal=true;},
    f=>{f.data.state.rootHashVersion=1;},
    f=>{f.data.state.phase='active';},
    f=>{f.data.state.phase='abandoned';},
    f=>{f.data.props.NODE_STORAGE_PROVIDER='firestore';},
    f=>{f.data.state.sourceHash='b'.repeat(43);},
    f=>{f.data.state.ownerEmail='another-owner@example.test';},
    f=>{f.data.state.target.projectId='other-project';},
    f=>{f.data.state.target.databaseId='other-database';}
  ]) {
    const f=confirmationFixture('cancel');change(f);const before=structuredClone(f.data.props);
    assert.throws(()=>f.context.confirmNodeCancelReviewedHash());
    assert.deepEqual(f.data.propertyWrites,[]);assert.deepEqual(f.data.props,before);assert.deepEqual(f.data.calls,[]);assert.deepEqual(f.data.logs,[]);
  }
});

test('confirmation checks for changed state, target, preview or existing confirmation before setting',()=>{
  for(const change of [
    f=>{f.data.owner='another-owner@example.test';},
    f=>{f.data.state={phase:'prepared'};},
    f=>{f.data.target.databaseId='changed-database';},
    f=>{f.data.preview.scan.sourceHash='b'.repeat(43);},
    f=>{f.data.props.NODE_FIRESTORE_MIGRATION_CONFIRM='PREPARE:concurrent-confirmation';},
    f=>{f.data.props.NODE_STORAGE_PROVIDER='firestore';}
  ]) {
    const f=confirmationFixture('prepare');f.data.afterContext=()=>change(f);
    assert.throws(()=>f.context.confirmNodePrepareReviewedHash(),error=>error.nodeCode==='BUSY');
    assert.deepEqual(f.data.propertyWrites,[]);assert.deepEqual(f.data.logs,[]);assert.equal(f.data.releases,1);
  }
});
