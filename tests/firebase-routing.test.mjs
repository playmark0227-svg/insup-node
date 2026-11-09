import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const codePath=fileURLToPath(new URL('../google-apps-script/Code.gs',import.meta.url));
const source=readFileSync(new URL('./apps-script.test.mjs',import.meta.url),'utf8').split('\ntest(')[0].replace(/const CODE_PATH = [^\n]+;/,`const CODE_PATH = ${JSON.stringify(codePath)};`)+'\nexport {baseHarness,seedMatchingRows,authenticate,request};';
const {baseHarness,seedMatchingRows,authenticate,request}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function fixture(){const h=baseHarness({now:'2026-11-06T01:00:00Z'});seedMatchingRows(h);const admin=authenticate(h,'ADMIN');h.writes.length=0;h.apiCalls.length=0;return {h,admin};}

test('an invalid storage provider rejects authenticated data access without falling back to Sheets',()=>{
 const {h,admin}=fixture();h.properties.NODE_STORAGE_PROVIDER='invalid-provider';let reads=0;h.context.SpreadsheetApp.openById=()=>{reads++;throw Error('SHEETS_MUST_NOT_BE_OPENED');};
 const result=request(h,'snapshot',{}, {token:admin.token});assert.equal(result.ok,false);assert.equal(result.error.code,'NOT_CONFIGURED');assert.equal(reads,0);assert.equal(h.writes.length,0);
});

test('Firebase persistence dispatch never invokes legacy remote reads or writes',()=>{
 const {h}=fixture();h.properties.NODE_STORAGE_PROVIDER='firestore';const fake={getId:()=>h.spreadsheet.getId()},calls=[];
 h.context.SpreadsheetApp.openById=()=>{throw Error('LEGACY_READ');};h.context.SpreadsheetApp.flush=()=>{throw Error('LEGACY_FLUSH');};
 h.context.firestoreMigrationReady_=()=>true;h.context.firestoreOpenBook_=config=>{calls.push(['open',config.spreadsheetId]);return fake;};h.context.firestoreMetadataMaps_=(sheet,keys)=>{calls.push(['metadata',keys]);return {sentinel:true};};
 h.context.firestoreRowCount_=()=>123;h.context.firestoreGridRead_=()=>[[{note:'Firebase'}]];h.context.firestoreBatch_=(id,requests)=>{calls.push(['write',id,requests.length]);};
 assert.equal(h.context.nodeOpenBook_(JSON.parse(h.properties.NODE_CONFIG)),fake);assert.equal(h.context.metadataMaps_(fake,['NODE_RECORD_ID']).sentinel,true);assert.equal(h.context.sheetRowCount_(fake),123);assert.equal(h.context.gridRead_(fake,fake,1,1)[0][0].note,'Firebase');
 h.context.sheetsBatch_(h.spreadsheet.getId(),[{updateCells:{}}]);h.context.nodeFlush_();assert.ok(calls.some(c=>c[0]==='write'));assert.equal(h.apiCalls.length,0);assert.equal(h.writes.length,0);
});

test('unverified or frozen migrations cannot enable business writes',()=>{
 const {h}=fixture(),config=JSON.parse(h.properties.NODE_CONFIG);h.properties.NODE_STORAGE_PROVIDER='firestore';h.context.firestoreMigrationReady_=()=>false;
 assert.equal(h.context.writesEnabled_(config),false);h.properties.NODE_STORAGE_PROVIDER='sheets';h.properties.NODE_FIRESTORE_MIGRATION_STATE=JSON.stringify({phase:'prepared'});
 assert.equal(h.context.writesEnabled_(config),false);
});

test('verification failure after a successful Firebase mutation keeps the operation uncertain',()=>{
 for(const code of ['BUSY','SCHEMA_MISMATCH','FIRESTORE_READ_FAILED']){
  const {h}=fixture();h.properties.NODE_STORAGE_PROVIDER='firestore';h.context.nodeHandle_=()=>({committed:true,operationId:'stable-operation'});h.context.firestoreAssertSnapshot_=()=>h.context.fail_(code,'verification failed');
  const result=request(h,'mutateRewards',{}, {operationId:'stable-operation'});assert.equal(result.ok,false);assert.equal(result.error.code,'INTERNAL',code);
 }
});

test('current authentication revocation still logs out after Firebase result verification',()=>{
 const {h}=fixture();h.properties.NODE_STORAGE_PROVIDER='firestore';h.context.nodeHandle_=()=>({committed:true,operationId:'stable-operation'});h.context.firestoreAssertSnapshot_=()=>h.context.fail_('UNAUTHENTICATED','session ended');
 assert.equal(request(h,'updateRecord',{}, {operationId:'stable-operation'}).error.code,'UNAUTHENTICATED');
});

test('Firebase transaction cleanup cannot replace a confirmed result with a retryable failure',()=>{
 const {h}=fixture();h.context.nodeHandle_=()=>({committed:true,operationId:'stable-operation'});h.context.firestoreReset_=()=>{};h.context.firestoreClose_=()=>{throw Error('cleanup unavailable');};
 const result=request(h,'mutateRewards',{}, {operationId:'stable-operation'});assert.equal(result.ok,true);assert.equal(result.data.committed,true);
});

test('legacy formula KPI reports are read-only after migration while current application aggregation is available',()=>{
 const {h}=fixture();h.properties.NODE_STORAGE_PROVIDER='firestore';const sheet=h.spreadsheet.getSheetByName('2期目月間KPI・KGI');assert.equal(h.context.nodeFirebaseReferenceTable_(sheet),true);
 assert.throws(()=>h.context.planManagementRow_({book:h.spreadsheet},{id:'ADMIN',role:'admin'},{sheetId:sheet.getSheetId(),row:2,rowVersion:'old',changes:{2:100}}),error=>error.nodeCode==='FORMULA_PROTECTED');
 const counts=h.context.countActivities_([{stage:'提案',date:'2026-11-06',playerId:'ND-001',recordId:'proposal-one',candidateId:'person-one'}],[{id:'ND-001',role:'player'}]);assert.equal(counts['2026-11']['ND-001']['提案'],1);
});


test('completed migrations cannot fall back to Sheets after a missing or partial provider setting',()=>{
 for(const provider of [undefined,'','sheets']){
  const {h,admin}=fixture();h.properties.NODE_FIRESTORE_MIGRATION_STATE=JSON.stringify({phase:'active'});
  if(provider===undefined)delete h.properties.NODE_STORAGE_PROVIDER;else h.properties.NODE_STORAGE_PROVIDER=provider;
  let reads=0;h.context.SpreadsheetApp.openById=()=>{reads++;throw Error('LEGACY_OPEN');};
  const result=request(h,'snapshot',{}, {token:admin.token});assert.equal(result.ok,false);assert.equal(result.error.code,'NOT_CONFIGURED');assert.equal(reads,0);
 }
});

test('a Firestore commit marker preserves uncertainty for specialized mutations that throw after commit',()=>{
 for(const action of ['manageAccount','saveMonthlyTarget']){
  const {h}=fixture();h.properties.NODE_STORAGE_PROVIDER='firestore';h.context.nodeHandle_=()=>{h.context.NODE_FIRESTORE_REQUEST_.committed=true;h.context.fail_('SCHEMA_MISMATCH','post-commit reread failed');};
  const result=request(h,action,{}, {operationId:'stable-operation'});assert.equal(result.ok,false);assert.equal(result.error.code,'INTERNAL',action);
 }
});


test('a storage cutover invalidates the old display cache but keeps the encrypted pending-save key',()=>{
 const {h,admin}=fixture(),store=h.context.readStore_({readOnly:true}),actor={id:'ADMIN',role:'admin'};
 const before=h.context.buildSnapshot_(store,actor),grantBefore=h.context.snapshotCacheAccess_(store,actor);
 h.properties.NODE_STORAGE_PROVIDER='firestore';h.context.firestoreConfig_=()=>({projectId:'insup-node-test',databaseId:'(default)',workbookId:'isolated-migration-namespace'});
 const grantAfter=h.context.snapshotCacheAccess_(store,actor);assert.notEqual(grantAfter.scope,grantBefore.scope);assert.notEqual(grantAfter.secret,grantBefore.secret);
 const pendingKey=h.context.hmac_('outbox-v2|'+store.config.spreadsheetId+'|admin|ADMIN',h.properties.NODE_PEPPER);assert.equal(pendingKey,before.outboxKey);
});


test('invalid migration proof blocks reads before Firebase roster data becomes an authentication authority',()=>{
 const {h}=fixture();h.properties.NODE_STORAGE_PROVIDER='firestore';let opened=0;
 h.context.firestoreOpenBook_=()=>{opened++;return h.spreadsheet;};h.context.firestoreMigrationReady_=()=>false;h.context.SpreadsheetApp.openById=()=>{throw Error('LEGACY_FALLBACK');};
 assert.throws(()=>h.context.nodeOpenBook_(JSON.parse(h.properties.NODE_CONFIG)),error=>error.nodeCode==='NOT_CONFIGURED');assert.equal(opened,1);
});

test('historical management undo cannot modify a legacy report made read-only by the Firebase cutover',()=>{
 const {h}=fixture();h.properties.NODE_STORAGE_PROVIDER='firestore';const sheet=h.spreadsheet.getSheetByName('2期目月間KPI・KGI');
 h.context.operation_=()=>({actorId:'ADMIN',action:'saveManagementRow',result:{undo:[{sheetId:sheet.getSheetId(),row:2,after:'old-version',entries:[{column:1,before:{stringValue:'old'}}]}]}});h.context.probeReservation_=()=>null;
 assert.throws(()=>h.context.planRestoreChange_({book:h.spreadsheet},{id:'ADMIN',role:'admin'},{changeId:'pre-migration-operation'}),error=>error.nodeCode==='FORMULA_PROTECTED');
});


test('a migration freeze preserves pending input using the retry-safe code understood by older clients',()=>{
 const {h,admin}=fixture();h.properties.NODE_FIRESTORE_MIGRATION_STATE=JSON.stringify({phase:'prepared'});
 const before=structuredClone(h.spreadsheet.sheets.map(s=>s.values));
 const result=request(h,'createCandidate',{playerId:'ND-001',candidateName:'待機候補者',position:'FS'}, {token:admin.token,operationId:'pending-before-cutover'});
 assert.equal(result.ok,false);assert.equal(result.error.code,'INTERNAL');assert.match(result.error.message,/同じ保存ID/);assert.deepEqual(h.spreadsheet.sheets.map(s=>s.values),before);assert.equal(h.writes.length,0);
 assert.equal(request(h,'createCandidate',{}, {operationId:'unauthenticated'}).error.code,'UNAUTHENTICATED');
});
