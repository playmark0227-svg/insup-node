import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code=readFileSync(new URL('../google-apps-script/BackupOwner.gs',import.meta.url),'utf8');
const parent='projects/insup-node/databases/(default)', collection=parent+'/backupSchedules';
const schedule=()=>({name:collection+'/synthetic-schedule',retention:'604800s',dailyRecurrence:{}});
function fixture() {
  const data={owner:'owner@example.test',provider:'firestore',ready:true,storage:{projectId:'insup-node',databaseId:'(default)',workbookId:'synthetic-migration'},config:{spreadsheetId:'synthetic-copy'},schedules:[],calls:[],logs:[],proofs:0,resets:0};
  data.state={rootHashVersion:2,phase:'active',ownerEmail:data.owner,target:structuredClone(data.storage)};
  data.database={name:parent,locationId:'asia-northeast1',type:'FIRESTORE_NATIVE'};
  const context=vm.createContext({
    requireOwner_:()=>{if(data.ownerDenied)throw Object.assign(Error('synthetic owner denied'),{nodeCode:'FORBIDDEN'});return data.owner;},
    firestoreMigrationReset_:()=>{data.resets++;},config_:()=>structuredClone(data.config),
    firestoreMigrationState_:()=>{if(data.badSeal)throw Object.assign(Error('synthetic bad seal'),{nodeCode:'MIGRATION_CHECKPOINT'});return structuredClone(data.state);},
    firestoreConfig_:()=>structuredClone(data.storage),firestoreMigrationReady_:()=>{data.proofs++;return data.ready;},
    props_:()=>({getProperty:key=>key==='NODE_STORAGE_PROVIDER'?data.provider:null}), // No write method.
    withLock_:fn=>fn(),stableJson_:JSON.stringify,
    fail_:(nodeCode,message)=>{throw Object.assign(Error(message),{nodeCode});},
    ScriptApp:{getOAuthToken:()=> 'synthetic-token-never-log'},
    Logger:{log:text=>data.logs.push(JSON.parse(text))},
    UrlFetchApp:{fetch:(url,options)=>{
      assert.ok(url.startsWith('https://firestore.googleapis.com/v1/'+parent));
      assert.equal(options.followRedirects,false);assert.equal(options.headers.Authorization,'Bearer synthetic-token-never-log');
      const path=url.slice('https://firestore.googleapis.com/v1/'.length),body=options.payload?JSON.parse(options.payload):undefined;
      const call={method:options.method,path,...(body?{body}:{})};data.calls.push(call);
      let value;
      if(options.method==='post') {assert.equal(path,collection);assert.deepEqual(body,{retention:'604800s',dailyRecurrence:{}});value=schedule();data.schedules.push(structuredClone(value));if(data.lostReceipt){data.lostReceipt=false;throw Error('synthetic lost receipt');}}
      else if(path===parent+'?fields=name,locationId,type')value=data.database;
      else if(path===collection)value=data.schedules.length?{backupSchedules:structuredClone(data.schedules)}:{};
      else value=data.schedules.find(item=>item.name===path)||{};
      data.afterRequest?.(call);
      return {getResponseCode:()=>data.status||200,getContentText:()=>data.rawResponse??JSON.stringify(value)};
    }}
  });
  vm.runInContext(code,context);
  return {context,data};
}
function noPost(data){assert.equal(data.calls.some(call=>call.method!=='get'),false);}

test('backup owner entries fail before HTTP when owner, active signature or dedicated provider is invalid',()=>{
  for(const entry of ['configureNodeDailyBackup','verifyNodeDailyBackupReadOnly'])for(const change of [
    f=>{f.data.ownerDenied=true;},f=>{f.data.badSeal=true;},f=>{f.data.ready=false;},
    f=>{f.data.state.phase='verified';},f=>{f.data.provider='sheets';},
    f=>{f.data.state.ownerEmail='other@example.test';},f=>{f.data.storage.projectId='different-project';},
    f=>{f.data.storage.databaseId='different-database';},f=>{f.data.state.target.workbookId='different-migration';}
  ]) {
    const f=fixture();change(f);assert.throws(()=>f.context[entry]());assert.deepEqual(f.data.calls,[]);assert.deepEqual(f.data.logs,[]);
  }
});

test('zero schedules creates exactly one fixed daily seven-day schedule then GETs it back',()=>{
  const {context,data}=fixture(),result=context.configureNodeDailyBackup();
  assert.equal(result.configured,true);assert.equal(result.created,true);assert.equal(result.retentionSeconds,604800);
  assert.deepEqual(data.calls.map(c=>c.method),['get','get','post','get','get']);
  assert.equal(data.calls[3].path,schedule().name);assert.ok(data.proofs>=3);assert.equal(data.schedules.length,1);
  assert.doesNotMatch(JSON.stringify(data.logs),/synthetic|owner@example|backupSchedules|Bearer|token/);
});

test('matching existing setting is idempotent and the independent verifier remains GET-only',()=>{
  for(const entry of ['configureNodeDailyBackup','verifyNodeDailyBackupReadOnly']) {
    const f=fixture();f.data.schedules=[schedule()];f.data.schedules[0].retention='604800.000s';
    const before=structuredClone(f.data.schedules),result=f.context[entry]();
    assert.equal(result.configured,true);assert.equal(result.created,false);noPost(f.data);
    assert.deepEqual(f.data.schedules,before);assert.equal(result.readOnly,entry==='verifyNodeDailyBackupReadOnly');
  }
  const empty=fixture();const result=empty.context.verifyNodeDailyBackupReadOnly();
  assert.equal(result.configured,false);assert.equal(result.scheduleCount,0);noPost(empty.data);assert.deepEqual(empty.data.schedules,[]);
});

test('other schedules, regions and concurrent provider changes never get overwritten',()=>{
  for(const change of [
    f=>{f.data.schedules=[schedule(),{...schedule(),name:collection+'/another-schedule'}];},
    f=>{f.data.schedules=[{...schedule(),retention:'1209600s'}];},
    f=>{f.data.schedules=[{...schedule(),weeklyRecurrence:{day:'MONDAY'}}];},
    f=>{f.data.schedules=[{...schedule(),dailyRecurrence:[]}];},
    f=>{f.data.schedules=[{...schedule(),name:'projects/another/databases/(default)/backupSchedules/other'}];},
    f=>{f.data.database.locationId='us-central1';},
    f=>{f.data.afterRequest=call=>{if(call.path===collection)f.data.config.spreadsheetId='concurrently-changed-copy';};}
  ]) {
    const f=fixture();change(f);const before=structuredClone(f.data.schedules);
    assert.throws(()=>f.context.configureNodeDailyBackup());noPost(f.data);assert.deepEqual(f.data.schedules,before);assert.deepEqual(f.data.logs,[]);
  }
});

test('a lost creation receipt is not retried in one execution and resumes through an existing schedule',()=>{
  const f=fixture();f.data.lostReceipt=true;
  assert.throws(()=>f.context.configureNodeDailyBackup(),error=>error.nodeCode==='BACKUP_UNAVAILABLE');
  assert.equal(f.data.calls.filter(c=>c.method==='post').length,1);assert.equal(f.data.schedules.length,1);assert.deepEqual(f.data.logs,[]);
  const result=f.context.configureNodeDailyBackup();assert.equal(result.created,false);assert.equal(result.configured,true);
  assert.equal(f.data.calls.filter(c=>c.method==='post').length,1);
});

test('access errors, bad JSON and changed readback stop without logging response bodies',()=>{
  for(const status of [301,401,403,404,409,429,500]) {
    const f=fixture();f.data.status=status;
    assert.throws(()=>f.context.configureNodeDailyBackup());noPost(f.data);assert.deepEqual(f.data.logs,[]);
  }
  const invalid=fixture();invalid.data.rawResponse='synthetic invalid private response';
  assert.throws(()=>invalid.context.verifyNodeDailyBackupReadOnly(),error=>error.nodeCode==='BACKUP_RESPONSE_INVALID');assert.deepEqual(invalid.data.logs,[]);
  const changed=fixture();changed.data.afterRequest=call=>{if(call.method==='post')changed.data.schedules[0].retention='1209600s';};
  assert.throws(()=>changed.context.configureNodeDailyBackup(),error=>error.nodeCode==='BACKUP_SCHEDULE_CONFLICT');
  assert.equal(changed.data.calls.filter(c=>c.method==='post').length,1);assert.deepEqual(changed.data.logs,[]);
});

test('HTTP helper refuses any other project, payload, verb or document path',()=>{
  const f=fixture();
  for(const args of [
    ['get','projects/another/databases/(default)/backupSchedules'],
    ['get',parent+'/documents/private'],['patch',collection,{}],['delete',schedule().name],
    ['post',collection,{retention:'1209600s',dailyRecurrence:{}}],
    ['post',collection,{retention:'604800s',dailyRecurrence:{},unreviewed:true}]
  ])assert.throws(()=>f.context.nodeBackupOwnerFetch_(...args),error=>error.nodeCode==='BACKUP_REQUEST_INVALID');
  assert.deepEqual(f.data.calls,[]);
});
