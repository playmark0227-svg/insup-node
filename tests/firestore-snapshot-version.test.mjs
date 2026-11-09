import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Reuse only the synthetic fixture definitions, without registering that suite.
// All RPCs below are confined to its fake project; no production credentials or
// candidate data are present in this file or the reused definitions.
const fixtureUrl=new URL('./firestore-streaming-migration.test.mjs',import.meta.url);
let fixtureSource=readFileSync(fixtureUrl,'utf8').split('\ntest(')[0]
 .replace(/new URL\('([^']+)',import\.meta\.url\)/g,(_match,path)=>`new URL(${JSON.stringify(new URL(path,fixtureUrl).href)})`)
 .replace('h.context.firestoreReset_=()=>{};',"const actualProvider=Object.fromEntries(['firestoreReset_','firestoreClose_','firestoreOpenBook_','firestoreConfig_'].map(key=>[key,h.context[key]]));h.context.firestoreReset_=()=>{};")
 .replace('return {h,admin,player,docs,calls,commits,limits,name,propertyWrites};','return {h,admin,player,docs,calls,commits,limits,name,propertyWrites,actualProvider};')
 +'\nexport {fixture,verified,activate,manifest,request,baseHarness,seedMatchingRows,authenticate,plain};';
const {fixture,verified,activate,manifest,request,baseHarness,seedMatchingRows,authenticate,plain}=await import('data:text/javascript;base64,'+Buffer.from(fixtureSource).toString('base64'));
const success=result=>{assert.equal(result.ok,true,JSON.stringify(result));return plain(result.data);};
const failure=(result,codes)=>{assert.equal(result.ok,false,JSON.stringify(result));if(codes)assert.ok([codes].flat().includes(result.error.code),JSON.stringify(result));return result.error;};

function activeFixture(){
 const f=fixture();verified(f);activate(f);
 let initialVersion=0;for(const document of f.docs.values())document.updateTime=new Date(Date.UTC(2026,10,6,1,0,0,initialVersion++)).toISOString();
 const rpc=f.h.context.firestoreRequest_;let transaction=0;
 f.h.context.firestoreRequest_=(method,path,body,config)=>{
  if(method==='post'&&path===':beginTransaction'){f.calls.push({method,path,body:plain(body),config:plain(config)});return {transaction:'synthetic-snapshot-'+(++transaction)};}
  if(method==='post'&&path===':rollback'){f.calls.push({method,path,body:plain(body),config:plain(config)});return {};}
  if(method==='post'&&path.endsWith(':runQuery')&&body.structuredQuery?.startAt?.values?.[0]?.integerValue!==undefined){
   // The older migration-only fake sorts by document name. Synthetic row IDs
   // are padded, so this faithfully adapts the provider's numeric row cursor.
   body=plain(body);const row=Number(body.structuredQuery.startAt.values[0].integerValue),parent=path.slice(0,-':runQuery'.length);
   body.structuredQuery.startAt.values=[{referenceValue:f.name(config,parent+'/rows/'+String(row).padStart(8,'0'))}];
  }
  const result=rpc(method,path,body,config),call=f.calls.at(-1);
  call.responseDocuments=Array.isArray(result)?result.filter(item=>item.found||item.document).length:result?.documents?.length||(result?.name&&result?.fields?1:0);return result;
 };
 Object.assign(f.h.context,f.actualProvider);
 const forbidden=()=>{throw Error('FIRESTORE_SNAPSHOT_MUST_NOT_READ_SHEETS');};
 f.h.context.SpreadsheetApp.openById=forbidden;f.h.context.Sheets.Spreadsheets.get=forbidden;f.h.context.Sheets.Spreadsheets.DeveloperMetadata.search=forbidden;
 f.calls.length=0;f.commits.length=0;f.h.writes.length=0;
 f.api=(payload={},options={})=>request(f.h,'snapshot',payload,{token:f.player.token,...options});
 f.full=()=>success(f.api());
 return f;
}

function returnedDocuments(calls){return calls.reduce((count,call)=>count+(call.responseDocuments||0),0);}
function requestedBusinessData(calls){
 return calls.some(call=>call.path.endsWith(':runQuery')&&!call.path.includes('/tables/8001:')||call.path===':batchGet'&&call.body.documents.some(name=>/\/tables\/(?!8001(?:\/|$))/.test(name)));
}
function rowDocument(f,tableId,row){const suffix=`/tables/${tableId}/rows/${String(row).padStart(8,'0')}`;const found=[...f.docs.values()].find(doc=>doc.name.endsWith(suffix));assert.ok(found,suffix);return found;}
function mutatePlayer(f,row,change){const document=rowDocument(f,8001,row),body=JSON.parse(document.fields.payload);change(body.values);document.fields.payload=JSON.stringify(body);document.updateTime=new Date(f.h.clock.milliseconds+(++f.limits.version)).toISOString();}

test('the migrated Firestore fixture preserves the real provider, proof, account, and owned-data snapshot path',()=>{
 const f=activeFixture(),snapshot=f.full();assert.equal(snapshot.self.playerId,'ND-001');assert.equal(snapshot.records.length,3);assert.equal(snapshot.records.some(record=>record.candidateName==='他者秘密候補'),false);assert.equal(snapshot.storageBackend.kind,'firestore');assert.ok(requestedBusinessData(f.calls));assert.deepEqual(f.h.writes,[]);
});

function poll(f,version,options={}){return f.api({ifSnapshotVersion:version},{background:true,...options});}
function bumpManifest(f,change=()=>{}){const doc=manifest(f);change(doc.fields);doc.updateTime=new Date(f.h.clock.milliseconds+(++f.limits.version)).toISOString();}
function assertFull(snapshot){assert.equal(snapshot.snapshotUnchanged,undefined);assert.ok(Array.isArray(snapshot.records));assert.match(snapshot.snapshotVersion,/^[A-Za-z0-9_-]{43}$/);}
function assertUnchanged(snapshot,original){
 assert.equal(snapshot.snapshotUnchanged,true);assert.equal(snapshot.snapshotVersion,original.snapshotVersion);assert.deepEqual(snapshot.self,original.self);assert.equal(snapshot.cacheAccess.scope,original.cacheAccess.scope);
 assert.deepEqual(Object.keys(snapshot).filter(key=>key!=='activityDeferred').sort(),['cacheAccess','self','snapshotUnchanged','snapshotVersion','syncedAt']);
 assert.equal(typeof snapshot.syncedAt,'string');assert.ok(Number.isFinite(Date.parse(snapshot.syncedAt)));assert.equal(snapshot.records,undefined);assert.equal(snapshot.players,undefined);assert.equal(snapshot.candidateProfiles,undefined);
}

test('unchanged background snapshots authenticate afresh and avoid all candidate, KPI and workflow tables',t=>{
 const f=activeFixture();f.calls.length=0;const full=f.full(),fullCalls=f.calls.slice();assertFull(full);f.calls.length=0;
 const unchanged=success(poll(f,full.snapshotVersion)),lightCalls=f.calls.slice();assertUnchanged(unchanged,full);
 assert.equal(requestedBusinessData(lightCalls),false);assert.ok(lightCalls.some(call=>call.path.includes('/tables/8001:runQuery')),'the roster is fresh, never trusted from the previous snapshot');
 assert.ok(lightCalls.some(call=>call.method==='get'&&/^nodeWorkbooks\/[^/]+$/.test(call.path)),'the live manifest is rechecked before the response');
 assert.ok(lightCalls.length<fullCalls.length);assert.ok(returnedDocuments(lightCalls)<returnedDocuments(fullCalls));
 t.diagnostic(JSON.stringify({fullRpcCalls:fullCalls.length,conditionalRpcCalls:lightCalls.length,fullReturnedDocuments:returnedDocuments(fullCalls),conditionalReturnedDocuments:returnedDocuments(lightCalls),fullResponseBytes:Buffer.byteLength(JSON.stringify(full)),conditionalResponseBytes:Buffer.byteLength(JSON.stringify(unchanged))}));
 assert.ok(Buffer.byteLength(JSON.stringify(unchanged))<Buffer.byteLength(JSON.stringify(full))/2);assert.equal(JSON.stringify(unchanged).includes('本人候補'),false);assert.deepEqual(f.h.writes,[]);
});

test('manual refresh, a valid nonmatching stamp, and old client payloads always return complete owned snapshots',()=>{
 const f=activeFixture(),full=f.full();assertFull(full);
 for(const [payload,options]of [[{ifSnapshotVersion:full.snapshotVersion},{}],[{ifSnapshotVersion:'x'.repeat(43)},{background:true}],[{},{}],[{role:'admin',playerId:'ADMIN'},{background:true}]]){
  f.calls.length=0;const result=success(f.api(payload,options));assertFull(result);assert.equal(result.self.role,'player');assert.ok(requestedBusinessData(f.calls));assert.equal(result.records.some(record=>record.candidateName==='他者秘密候補'),false);
 }
});

test('a stamp from a different authenticated account cannot unlock that account projection',()=>{
 const f=activeFixture(),own=f.full(),other=authenticate(f.h,'ND-002'),peer=success(f.api({}, {token:other.token}));assertFull(peer);assert.notEqual(peer.cacheAccess.scope,own.cacheAccess.scope);assert.notEqual(peer.snapshotVersion,own.snapshotVersion);
 const result=success(poll(f,peer.snapshotVersion));assertFull(result);assert.equal(result.self.playerId,'ND-001');assert.equal(result.records.some(record=>record.playerId==='ND-002'),false);
});

test('a manifest revision, roster alias, or live role change invalidates the conditional stamp',()=>{
 for(const mode of ['revision','aliases','role']){
  const f=activeFixture(),before=f.full();assertFull(before);
  if(mode==='revision')bumpManifest(f,value=>value.revision++);
  if(mode==='aliases')mutatePlayer(f,3,values=>values[6]=JSON.stringify(['担当一','合成の追加別名']));
  if(mode==='role')mutatePlayer(f,3,values=>values[7]='admin');
  f.calls.length=0;const after=success(poll(f,before.snapshotVersion));assertFull(after);assert.notEqual(after.snapshotVersion,before.snapshotVersion);assert.ok(requestedBusinessData(f.calls));
  if(mode==='role')assert.equal(after.self.role,'admin');else assert.equal(after.self.role,'player');
 }
});

test('write suspension, shared writing preferences, and evidence availability are bound into the stamp',()=>{
 for(const mode of ['writes','writing','evidence','backend']){
  const f=activeFixture(),before=f.full();assertFull(before);
  if(mode==='writes'){const config=JSON.parse(f.h.properties.NODE_CONFIG);config.writesEnabled=false;f.h.properties.NODE_CONFIG=JSON.stringify(config);}
  if(mode==='writing')f.h.properties.NODE_WRITING_PREFERENCES=JSON.stringify({...before.writingPreferences,targetLength:before.writingPreferences.targetLength===1000?600:1000});
  if(mode==='evidence')f.h.properties.NODE_FIREBASE_STORAGE_BUCKET='insup-node-streaming-fixture.firebasestorage.app';
  if(mode==='backend')f.h.context.NODE_FIRESTORE_SNAPSHOT_STAMP+='-synthetic-next-deployment';
  const after=success(poll(f,before.snapshotVersion));assertFull(after);assert.notEqual(after.snapshotVersion,before.snapshotVersion);
  if(mode==='writes')assert.equal(after.writesEnabled,false);
  if(mode==='writing')assert.notEqual(after.writingPreferences.targetLength,before.writingPreferences.targetLength);
  if(mode==='evidence')assert.equal(after.storageEvidenceFeature,true);
 }
});

test('five-minute epochs bound unchanged polling and expose direct row edits even without a revision update',()=>{
 const f=activeFixture(),before=f.full();assertFull(before);const doc=rowDocument(f,286330650,2),body=JSON.parse(doc.fields.payload);body.values[12]='合成の外部編集メモ';doc.fields.payload=JSON.stringify(body);doc.updateTime=new Date(f.h.clock.milliseconds+1).toISOString();
 assertUnchanged(success(poll(f,before.snapshotVersion)),before);
 f.h.clock.milliseconds+=300000;const after=success(poll(f,before.snapshotVersion));assertFull(after);assert.notEqual(after.snapshotVersion,before.snapshotVersion);assert.equal(after.records.find(record=>record.recordId==='ROW-11111111-1111-4111-8111-111111111111').values[12],'合成の外部編集メモ');
});

test('invalid sessions, inactive accounts, password changes and mandatory changes cannot use an unchanged stamp',()=>{
 for(const mode of ['anonymous','expired','idle','inactive','password','mustChange']){
  const f=activeFixture(),before=f.full();assertFull(before);let options={};
  if(mode==='anonymous')options.token=undefined;
  if(mode==='expired'||mode==='idle'){const key=f.h.context.sessionKey_(f.player.token),session=JSON.parse(f.h.properties[key]);if(mode==='expired')session.expiresAt=f.h.clock.milliseconds;else session.lastSeenAt=f.h.clock.milliseconds-61*60000;f.h.properties[key]=JSON.stringify(session);}
  if(mode==='inactive')mutatePlayer(f,3,values=>values[8]=false);
  if(mode==='password'||mode==='mustChange'){const key='NODE_AUTH_ND-001',auth=JSON.parse(f.h.properties[key]);if(mode==='password')auth.version='synthetic-new-password-version';else auth.mustChange=true;f.h.properties[key]=JSON.stringify(auth);}
  f.calls.length=0;failure(poll(f,before.snapshotVersion,options),mode==='mustChange'?'PASSWORD_CHANGE_REQUIRED':'UNAUTHENTICATED');assert.equal(requestedBusinessData(f.calls),false);
 }
});

test('invalid conditional stamp types or encodings fail without reading candidate data',()=>{
 const f=activeFixture();
 for(const invalid of [null,false,0,[],{},'', 'a'.repeat(42),'a'.repeat(44),'+'.repeat(43),'日'.repeat(43)]){f.calls.length=0;failure(poll(f,invalid),'BAD_REQUEST');assert.equal(requestedBusinessData(f.calls),false);}
});

test('conditional polling consumes the original account read quota instead of bypassing it',()=>{
 const f=activeFixture(),before=f.full();assertFull(before);const now=f.h.clock.milliseconds;
 f.h.context.CacheService.getScriptCache().put('NODE_READ_snapshot_ND-001',JSON.stringify([Math.floor(now/60000),40,Math.floor(now/3600000),40]),3600);
 f.calls.length=0;failure(poll(f,before.snapshotVersion),'RATE_LIMITED');assert.equal(f.calls.length,0,'read quota must reject before Firestore opens');
});

test('a namespace or signed manifest proof change is rejected before returning a cached projection',()=>{
 for(const mode of ['namespace','proof']){
  const f=activeFixture(),before=f.full();assertFull(before);
  if(mode==='namespace'){const config=JSON.parse(f.h.properties.NODE_FIRESTORE_CONFIG);config.workbookId+='different';f.h.properties.NODE_FIRESTORE_CONFIG=JSON.stringify(config);}
  else bumpManifest(f,value=>value.migrationProof.seal='x'.repeat(43));
  f.calls.length=0;failure(poll(f,before.snapshotVersion),['NOT_CONFIGURED','SCHEMA_MISMATCH','MIGRATION_NOT_READY','FIRESTORE_CONFIG']);assert.equal(requestedBusinessData(f.calls),false);
 }
});

test('a live roster change during conditional evaluation is detected by the final read proof',()=>{
 const f=activeFixture(),before=f.full();assertFull(before);let changed=false;
 f.limits.afterRequest=call=>{if(!changed&&call.path.includes('/tables/8001:runQuery')){changed=true;mutatePlayer(f,3,values=>values[8]=false);}};
 f.calls.length=0;failure(poll(f,before.snapshotVersion),['BUSY','UNAUTHENTICATED']);assert.equal(changed,true);assert.equal(requestedBusinessData(f.calls),false);
});

test('legacy Sheets remains a complete snapshot path and accepts old caller payloads',()=>{
 const h=baseHarness();seedMatchingRows(h);const player=authenticate(h,'ND-001');
 for(const payload of [{},{ifSnapshotVersion:'x'.repeat(43)},{role:'admin',playerId:'ADMIN'}]){h.spreadsheet.reads.length=0;const result=success(request(h,'snapshot',payload,{token:player.token,background:true}));assert.equal(result.snapshotUnchanged,undefined);assert.equal(result.snapshotVersion,undefined);assert.equal(result.self.role,'player');assert.equal(result.records.length,3);assert.ok(h.spreadsheet.reads.some(read=>read.sheetId===286330650));}
});

test('conditional read cost stays bounded when the same authenticated workspace contains hundreds of candidate records',t=>{
 const f=activeFixture(),root=manifest(f),table=[...f.docs.values()].find(document=>document.name.endsWith('/tables/286330650'));
 assert.ok(table);const template=JSON.parse(rowDocument(f,286330650,2).fields.payload),last=405;
 for(let row=6;row<=last;row++){
  const body=structuredClone(template),candidateName='合成の大規模候補'+row;body.values[2]=candidateName;body.cells[2]={userEnteredValue:{stringValue:candidateName},formattedValue:candidateName};
  body.metadata.NODE_RECORD_ID.value='ROW-00000000-0000-4000-8000-'+String(row).padStart(12,'0');for(const entry of Object.values(body.metadata))entry.metadataId=root.fields.nextMetadataId++;
  const path=f.name(JSON.parse(f.h.properties.NODE_FIRESTORE_CONFIG),`nodeWorkbooks/${JSON.parse(f.h.properties.NODE_FIRESTORE_CONFIG).workbookId}/tables/286330650/rows/${String(row).padStart(8,'0')}`);
  f.docs.set(path,{name:path,fields:{row,hasMetadata:true,payload:JSON.stringify(body)},updateTime:'2026-11-06T01:00:00.999Z'});
 }
 table.fields.lastRow=last;table.fields.identityReadBound=last;bumpManifest(f,value=>value.revision++);
 f.calls.length=0;const full=f.full(),fullCalls=f.calls.slice();assertFull(full);assert.equal(full.records.length,403);f.calls.length=0;
 assertUnchanged(success(poll(f,full.snapshotVersion)),full);const lightCalls=f.calls.slice();assert.equal(requestedBusinessData(lightCalls),false);assert.ok(returnedDocuments(fullCalls)>=400);assert.ok(returnedDocuments(lightCalls)<returnedDocuments(fullCalls)/20);
 t.diagnostic(JSON.stringify({syntheticRecords:full.records.length,fullRpcCalls:fullCalls.length,conditionalRpcCalls:lightCalls.length,fullReturnedDocuments:returnedDocuments(fullCalls),conditionalReturnedDocuments:returnedDocuments(lightCalls)}));
});
