import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const codePath=fileURLToPath(new URL('../google-apps-script/Code.gs',import.meta.url));
const fixtures=readFileSync(new URL('./apps-script.test.mjs',import.meta.url),'utf8').split('\ntest(')[0].replace(/const CODE_PATH = [^\n]+;/,`const CODE_PATH = ${JSON.stringify(codePath)};`)+'\nexport {baseHarness,seedMatchingRows,authenticate,request};';
const {baseHarness,seedMatchingRows,authenticate,request}=await import('data:text/javascript;base64,'+Buffer.from(fixtures).toString('base64'));
const fragment=readFileSync(new URL('../google-apps-script/FirestoreMigration.fragment.gs',import.meta.url),'utf8');
const clone=value=>structuredClone(value);
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const runtime=readFileSync(codePath,'utf8'),facade=readFileSync(new URL('../google-apps-script/Firestore.fragment.gs',import.meta.url),'utf8');const h=baseHarness({now:'2026-11-06T01:00:00Z',code:runtime+(runtime.includes('function firestoreClose_(')?'':'\n'+facade)+'\n'+fragment});seedMatchingRows(h);h.spreadsheet.getSheetByName('2期目マッチングDB').values[1][0]=new Date('2026-10-03T15:00:00Z');const admin=authenticate(h,'ADMIN');h.spreadsheet.getSheetByName('_NODE_operations').appendRow(['prior-operation-receipt-0001','ND-001','updateRecord','prior-payload-hash','{}','2026-11-05T01:00:00.000Z']);vm.runInContext(fragment,h.context);
 const docs=new Map(),requests=[],commits=[],resets=[],state={version:0,failCommit:null,afterRequest:null};
 const name=(config,path)=>`projects/${config.projectId}/databases/${config.databaseId}/documents/${path}`;
 h.context.firestoreReset_=()=>resets.push(true);
 h.context.firestoreEncodeFields_=value=>plain(value);
 h.context.firestoreDecodeFields_=value=>plain(value);
 h.context.firestoreDocumentName_=name;
 h.context.firestoreConfig_=()=>JSON.parse(h.properties.NODE_FIRESTORE_CONFIG);
 h.context.firestoreOpenBook_=()=>({_firestoreManifest:plain(docs.get(name(JSON.parse(h.properties.NODE_FIRESTORE_CONFIG),`nodeWorkbooks/${JSON.parse(h.properties.NODE_FIRESTORE_CONFIG).workbookId}`)).fields)});
 h.context.firestoreRequest_=(method,path,body,config)=>{
  assert.ok(config,'migration RPCs must use their explicit non-active destination');requests.push({method,path,body:clone(body),config:clone(config)});
  let result;
  if(method==='post'&&path===':commit'){
   if(state.failCommit?.(body))throw Object.assign(new Error('injected storage failure'),{nodeCode:'FIRESTORE_WRITE_FAILED'});
   for(const write of body.writes){const old=docs.get(write.update.name);if(write.currentDocument?.exists===false&&old)throw Object.assign(new Error('exists'),{nodeCode:'CONFLICT'});if(write.currentDocument?.updateTime!==undefined&&write.currentDocument.updateTime!==old?.updateTime)throw Object.assign(new Error('version'),{nodeCode:'CONFLICT'});}
   const version=String(++state.version);for(const write of body.writes)docs.set(write.update.name,{name:write.update.name,fields:clone(write.update.fields),updateTime:version});commits.push(clone(body));result={writeResults:body.writes.map(()=>({updateTime:version}))};
  }else if(method==='post'&&path===':batchGet'){
   assert.ok(body.documents.length<=64);result=body.documents.map(document=>docs.has(document)?{found:clone(docs.get(document)),readTime:'2026-11-06T01:00:00.000Z'}:{missing:document,readTime:'2026-11-06T01:00:00.000Z'});
  }else if(method==='get'&&path.includes('?')){
   const [prefix,query]=path.split('?'),params=new URLSearchParams(query),names=[...docs.keys()].filter(key=>key.startsWith(name(config,prefix)+'/')&&!key.slice(name(config,prefix).length+1).includes('/')).sort(),offset=Number(params.get('pageToken')||0),limit=Math.min(300,Number(params.get('pageSize')||100));result={documents:names.slice(offset,offset+limit).map(key=>clone(docs.get(key))),...(offset+limit<names.length?{nextPageToken:String(offset+limit)}:{})};
  }else if(method==='get'){
   result=clone(docs.get(name(config,path)))||null;
  }else throw new Error(`unexpected RPC ${method} ${path}`);
  state.afterRequest?.({method,path,body,result});return result;
 };
 h.properties.NODE_FIRESTORE_MIGRATION_TARGET=JSON.stringify({projectId:'insup-node-fixture'});h.writes.length=0;h.apiCalls.length=0;h.logs.length=0;
 return {h,admin,docs,requests,commits,resets,state,name,source:()=>h.context.firestoreMigrationSource_(h.context.config_())};
}
function finish(h,method){for(let attempt=0;attempt<2000;attempt++){const result=h.context[method]();if(result.more!==true)return result;}throw new Error('Bounded migration did not complete: '+method);}
function state(f){return JSON.parse(f.h.properties.NODE_FIRESTORE_MIGRATION_STATE);}
function confirm(f,prefix,hash=state(f).sourceHash){f.h.properties.NODE_FIRESTORE_MIGRATION_CONFIRM=`${prefix}:${hash}`;}
function prepare(f){const preview=finish(f.h,'previewNodeFirestoreMigration');confirm(f,'PREPARE',preview.sourceHash);return finish(f.h,'prepareNodeFirestoreMigration');}
function imported(f){prepare(f);let r;do{r=finish(f.h,'importNodeFirestoreMigration');}while(r.more);return r;}
function verified(f){imported(f);return finish(f.h,'verifyNodeFirestoreMigration');}
function manifest(f){const s=state(f);return f.docs.get(f.name(s.target,`nodeWorkbooks/${s.target.workbookId}`));}
function legacy(f){return JSON.stringify(f.h.spreadsheet.sheets.map(s=>({id:s.id,values:s.values,formulas:s.formulas})));}
function assertNoSourceWrites(f,before){assert.equal(legacy(f),before);assert.deepEqual(f.h.writes,[]);assert.deepEqual(f.h.apiCalls,[]);}
function assertNodeError(fn,code){assert.throws(fn,error=>error.nodeCode===code);}

test('Firebase migration preview preserves every source row, formula and metadata without writing or exposing private data',()=>{
 const f=fixture(),h=f.h,before=legacy(f),props=clone(h.properties);const preview=finish(h,'previewNodeFirestoreMigration');assert.equal(preview.readOnly,true);assert.equal(preview.tableCount,4);assert.equal(preview.recordIdCount,4);assert.equal(preview.operationCount,1);assert.equal(preview.phase,'preview');assert.match(preview.sourceHash,/^[A-Za-z0-9_-]{30,}$/);const checkpoint=h.properties.NODE_FIRESTORE_PREVIEW_V2,after=clone(h.properties);delete after.NODE_FIRESTORE_PREVIEW_V2;assert.deepEqual(after,props);assert.ok(Buffer.byteLength(checkpoint)<=9000);assert.equal(JSON.parse(checkpoint).rootHashVersion,2);assert.match(JSON.parse(checkpoint).checkpointSeal,/^[A-Za-z0-9_-]{43}$/);assert.deepEqual(f.commits,[]);assertNoSourceWrites(f,before);
 const source=f.source();assert.ok(source.documents.some(d=>d.data.payload?.includes('他者秘密候補')));assert.ok(source.documents.some(d=>d.data.payload?.includes('NODE_RECORD_ID')));assert.ok(source.documents.some(d=>d.data.payload?.includes('formulaValue')));assert.ok(source.documents.some(d=>d.data.payload?.includes('$nodeDate')));
 const logs=JSON.stringify(h.logs);for(const privateText of ['本人候補','他者秘密候補','秘密クライアント','owner@example.test','test-spreadsheet'])assert.equal(logs.includes(privateText),false,privateText);
 assert.equal(request(h,'previewNodeFirestoreMigration',{}, {token:f.admin.token}).error.code,'BAD_REQUEST');
});

test('migration preparation requires an explicit source hash and a valid target, then freezes without touching the source',()=>{
 const f=fixture(),h=f.h,before=legacy(f);assertNodeError(()=>finish(h,'prepareNodeFirestoreMigration'),'MIGRATION_CONFIRM_REQUIRED');assert.equal(h.context.firestoreMigrationFrozen_(),false);
 const p=finish(h,'previewNodeFirestoreMigration');confirm(f,'PREPARE',p.sourceHash);h.properties.NODE_FIRESTORE_MIGRATION_TARGET=JSON.stringify({projectId:'https://not-a-project'});assertNodeError(()=>finish(h,'prepareNodeFirestoreMigration'),'FIRESTORE_NOT_CONFIGURED');
 h.properties.NODE_FIRESTORE_MIGRATION_TARGET=JSON.stringify({projectId:'insup-node-fixture'});const one=finish(h,'prepareNodeFirestoreMigration'),target=state(f).target;assert.equal(one.frozen,true);assert.equal(h.context.firestoreMigrationFrozen_(),true);assert.equal(finish(h,'prepareNodeFirestoreMigration').sourceHash,one.sourceHash);assert.deepEqual(state(f).target,target);assert.equal(f.commits.length,0);assertNoSourceWrites(f,before);
});

test('staged import, exact verification and explicit activation keep credentials, receipts and original source unchanged',()=>{
 const f=fixture(),h=f.h,before=legacy(f),originalConfig=h.properties.NODE_CONFIG,originalPepper=h.properties.NODE_PEPPER;const r=imported(f);assert.equal(r.phase,'ready');assert.equal(h.properties.NODE_STORAGE_PROVIDER,undefined);assert.equal(h.context.firestoreMigrationFrozen_(),true);assert.equal(manifest(f).fields.migrationProof.state,'ready');
 const v=finish(h,'verifyNodeFirestoreMigration');assert.equal(v.verified,true);assert.equal(state(f).phase,'verified');assertNodeError(()=>finish(h,'activateNodeFirestoreMigration'),'MIGRATION_CONFIRM_REQUIRED');confirm(f,'ACTIVATE');const active=finish(h,'activateNodeFirestoreMigration');assert.equal(active.active,true);assert.equal(h.properties.NODE_STORAGE_PROVIDER,'firestore');assert.equal(h.context.firestoreMigrationFrozen_(),false);assert.equal(h.context.firestoreMigrationReady_(h.context.config_()),true);assert.equal(h.properties.NODE_CONFIG,originalConfig);assert.equal(h.properties.NODE_PEPPER,originalPepper);assertNoSourceWrites(f,before);
 // A repeated activation is a no-op even after the app starts writing.
 manifest(f).fields.revision=1;const commits=f.commits.length;assert.equal(finish(h,'activateNodeFirestoreMigration').active,true);assert.equal(f.commits.length,commits);
});

test('a source change invalidates preparation; cancellation needs confirmation and never deletes staged data',()=>{
 const f=fixture(),h=f.h;prepare(f);const hash=state(f).sourceHash;h.spreadsheet.getSheetByName('2期目マッチングDB').values[1][12]='outside edit';
 const sourceAfterExternalEdit=legacy(f);assertNodeError(()=>finish(h,'importNodeFirestoreMigration'),'MIGRATION_SOURCE_CHANGED');assert.equal(h.context.firestoreMigrationFrozen_(),true);assert.equal(h.properties.NODE_STORAGE_PROVIDER,undefined);
 // A streamed scan can have written an unpublished staging page before the
 // final root differs. It may never certify or activate that changed source.
 assert.ok(f.commits.length>0);assert.notEqual(manifest(f).fields.migrationProof.state,'active');const staged=clone([...f.docs]);
 assertNodeError(()=>finish(h,'cancelNodeFirestoreMigration'),'MIGRATION_CONFIRM_REQUIRED');confirm(f,'CANCEL',hash);assert.equal(finish(h,'cancelNodeFirestoreMigration').canceled,true);assert.equal(h.context.firestoreMigrationFrozen_(),false);
 assert.equal(h.properties.NODE_STORAGE_PROVIDER,undefined);assert.equal(h.spreadsheet.getSheetByName('2期目マッチングDB').values[1][12],'outside edit');assert.deepEqual([...f.docs],staged);assertNoSourceWrites(f,sourceAfterExternalEdit);
});

test('verification rejects missing, changed and additional Firestore rows and leaves the old provider selected',()=>{
 for(const kind of ['changed','missing','additional']){const f=fixture();imported(f);const entry=[...f.docs].find(([name])=>name.includes('/rows/'));if(kind==='changed')entry[1].fields.payload='{}';if(kind==='missing')f.docs.delete(entry[0]);if(kind==='additional')f.docs.set(entry[0].replace(/\/\d+$/,'/99999999'),{...clone(entry[1]),name:entry[0].replace(/\/\d+$/,'/99999999')});assertNodeError(()=>finish(f.h,'verifyNodeFirestoreMigration'),'MIGRATION_VERIFY_FAILED');assert.equal(state(f).phase,'ready');assert.equal(f.h.properties.NODE_STORAGE_PROVIDER,undefined);assert.equal(f.h.context.firestoreMigrationFrozen_(),true);}
});

test('activation rechecks both the target rows and the source after verification',()=>{
 for(const kind of ['target','source']){const f=fixture();verified(f);confirm(f,'ACTIVATE');if(kind==='target')[...f.docs].find(([name])=>name.includes('/rows/'))[1].fields.payload='{}';else f.h.spreadsheet.getSheetByName('2期目マッチングDB').values[1][12]='changed after verify';assertNodeError(()=>finish(f.h,'activateNodeFirestoreMigration'),kind==='target'?'MIGRATION_VERIFY_FAILED':'MIGRATION_SOURCE_CHANGED');assert.equal(f.h.properties.NODE_STORAGE_PROVIDER,undefined);assert.equal(f.h.context.firestoreMigrationFrozen_(),true);}
});

test('verification catches manual source edits while the Firestore read is in flight',()=>{
 const f=fixture();imported(f);let once=false;f.state.afterRequest=({method,path})=>{if(!once&&method==='get'&&path.includes('/rows?')){once=true;f.h.spreadsheet.getSheetByName('2期目マッチングDB').values[1][12]='during verify';}};assertNodeError(()=>finish(f.h,'verifyNodeFirestoreMigration'),'MIGRATION_VERIFY_FAILED');assert.equal(state(f).phase,'ready');assert.equal(f.h.properties.NODE_STORAGE_PROVIDER,undefined);
});

test('migration readiness rejects a mismatched target, source configuration or manifest seal',()=>{
 for(const kind of ['target','config','seal','state']){const f=fixture();verified(f);confirm(f,'ACTIVATE');finish(f.h,'activateNodeFirestoreMigration');if(kind==='target')f.h.properties.NODE_FIRESTORE_CONFIG=JSON.stringify({...state(f).target,workbookId:'different'});if(kind==='config')f.h.properties.NODE_CONFIG=JSON.stringify({...f.h.context.config_(),matchingSheetId:999});if(kind==='seal')manifest(f).fields.migrationProof.seal='tampered';if(kind==='state'){const s=state(f);s.phase='verified';f.h.properties.NODE_FIRESTORE_MIGRATION_STATE=JSON.stringify(s);}if(kind==='state')assertNodeError(()=>f.h.context.firestoreMigrationReady_(f.h.context.config_()),'MIGRATION_STATE');else assert.equal(f.h.context.firestoreMigrationReady_(f.h.context.config_()),false);}
});

test('active migration cannot be canceled back to Sheets, and another owner cannot prepare or activate',()=>{
 const f=fixture();verified(f);confirm(f,'ACTIVATE');finish(f.h,'activateNodeFirestoreMigration');confirm(f,'CANCEL');assertNodeError(()=>finish(f.h,'cancelNodeFirestoreMigration'),'MIGRATION_ALREADY_ACTIVE');assert.equal(f.h.properties.NODE_STORAGE_PROVIDER,'firestore');
 const g=fixture();prepare(g);g.h.context.Session.getActiveUser=()=>({getEmail:()=>'other@example.test'});assertNodeError(()=>finish(g.h,'importNodeFirestoreMigration'),'FORBIDDEN');
});

test('an interrupted import remains frozen and resumes its deterministic document IDs without duplicates',()=>{
 const f=fixture();prepare(f);let once=false;f.state.failCommit=body=>{if(!once&&body.writes.some(w=>w.update.name.includes('/tables/'))){once=true;return true;}return false;};assertNodeError(()=>finish(f.h,'importNodeFirestoreMigration'),'FIRESTORE_WRITE_FAILED');assert.equal(f.h.context.firestoreMigrationFrozen_(),true);assert.equal(state(f).phase,'prepared');assert.equal(state(f).preparedComplete,true);assert.equal(state(f).cursor,0);f.state.failCommit=null;assert.equal(finish(f.h,'importNodeFirestoreMigration').phase,'ready');const size=f.docs.size;assert.equal(finish(f.h,'importNodeFirestoreMigration').phase,'ready');assert.equal(f.docs.size,size);assert.equal(finish(f.h,'verifyNodeFirestoreMigration').verified,true);
});


test('a lost manifest-create receipt resumes the same namespace rather than creating duplicates',()=>{
 const f=fixture();prepare(f);let lost=false;f.state.afterRequest=({method,path,body})=>{if(!lost&&method==='post'&&path===':commit'&&body.writes[0].currentDocument?.exists===false){lost=true;throw Object.assign(new Error('lost response'),{nodeCode:'INTERNAL'});}};assertNodeError(()=>finish(f.h,'importNodeFirestoreMigration'),'INTERNAL');assert.equal(state(f).phase,'prepared');const target=state(f).target;assert.equal(f.docs.size,1);f.state.afterRequest=null;assert.equal(finish(f.h,'importNodeFirestoreMigration').phase,'ready');assert.deepEqual(state(f).target,target);assert.equal(finish(f.h,'verifyNodeFirestoreMigration').verified,true);
});

test('a malformed commit receipt never advances the migration cursor or selects Firebase',()=>{
 const f=fixture();prepare(f);const original=f.h.context.firestoreRequest_;f.h.context.firestoreRequest_=function(method,path,...args){if(method==='post'&&path===':commit'){original(method,path,...args);return null;}return original(method,path,...args);};assertNodeError(()=>finish(f.h,'importNodeFirestoreMigration'),'INTERNAL');assert.equal(state(f).cursor,0);assert.equal(state(f).phase,'prepared');assert.equal(f.h.properties.NODE_STORAGE_PROVIDER,undefined);assert.equal(f.h.context.firestoreMigrationFrozen_(),true);
});

test('unknown-owner and deleted metadata rows are imported intact rather than discarded or reassigned',()=>{
 const f=fixture(),sheet=f.h.spreadsheet.getSheetByName('2期目マッチングDB');sheet.values[2][3]='未対応の担当者';sheet.getRange(3,1,1,sheet.getMaxColumns()).addDeveloperMetadata('NODE_DELETED_CANDIDATE','archived-change-00000000');f.h.writes.length=0;const before=legacy(f),source=f.source();assert.ok(source.documents.some(item=>item.data.payload?.includes('未対応の担当者')));assert.ok(source.documents.some(item=>item.data.payload?.includes('archived-change-00000000')));verified(f);assertNoSourceWrites(f,before);
});

test('a partial provider-property update stays frozen and can finish the same verified activation',()=>{
 const f=fixture();verified(f);confirm(f,'ACTIVATE');const properties=f.h.context.PropertiesService.getScriptProperties(),original=properties.setProperties;let once=false;properties.setProperties=function(values,...rest){if(!once&&values.NODE_STORAGE_PROVIDER==='firestore'){once=true;this.setProperty('NODE_FIRESTORE_CONFIG',values.NODE_FIRESTORE_CONFIG);throw new Error('interrupted properties');}return original.call(this,values,...rest);};assert.throws(()=>finish(f.h,'activateNodeFirestoreMigration'),/interrupted properties/);assert.equal(state(f).phase,'active');assert.equal(f.h.properties.NODE_STORAGE_PROVIDER,undefined);assert.equal(f.h.context.firestoreMigrationFrozen_(),true);assertNodeError(()=>finish(f.h,'cancelNodeFirestoreMigration'),'MIGRATION_ALREADY_ACTIVE');assert.equal(finish(f.h,'activateNodeFirestoreMigration').active,true);assert.equal(state(f).phase,'active');assert.equal(f.h.context.firestoreMigrationFrozen_(),false);
});

test('a different pre-existing manifest in the staging namespace is never overwritten',()=>{
 const f=fixture();prepare(f);const s=state(f),key=f.name(s.target,`nodeWorkbooks/${s.target.workbookId}`);f.docs.set(key,{name:key,fields:{unexpected:'different data'},updateTime:'1'});const before=clone([...f.docs]);assertNodeError(()=>finish(f.h,'importNodeFirestoreMigration'),'MIGRATION_VERIFY_FAILED');assert.deepEqual([...f.docs],before);assert.equal(state(f).phase,'prepared');assert.equal(f.h.properties.NODE_STORAGE_PROVIDER,undefined);
});

test('matching identity bounds avoid template tails while preserving every original row in the import hash',()=>{
 const f=fixture(),sheet=f.h.spreadsheet.getSheetByName('2期目マッチングDB');sheet.getRange(500,5).setFormula('=1');f.h.writes.length=0;let source=f.source(),table=source.documents.find(item=>item.path==='tables/'+sheet.id).data;assert.equal(table.lastRow,500);assert.equal(table.identityReadBound,40);assert.ok(source.documents.some(item=>item.path==='tables/'+sheet.id+'/rows/00000500'&&item.data.payload.includes('=1')));assert.equal(source.documents.find(item=>item.path==='tables/2007683505').data.identityReadBound,undefined);
 const hash=source.sourceHash;sheet.values[154]??=[];sheet.values[154][2]='  未対応の候補者  ';source=f.source();table=source.documents.find(item=>item.path==='tables/'+sheet.id).data;assert.equal(table.identityReadBound,155);assert.notEqual(source.sourceHash,hash);assert.ok(source.documents.some(item=>item.path==='tables/'+sheet.id+'/rows/00000155'));assert.deepEqual(f.h.writes,[]);
});

test('an active-state-only property update cannot reopen Sheets and can restore the exact activated target',()=>{
 const f=fixture();verified(f);confirm(f,'ACTIVATE');const properties=f.h.context.PropertiesService.getScriptProperties(),original=properties.setProperties;let once=false;properties.setProperties=function(values,...rest){if(!once&&values.NODE_STORAGE_PROVIDER==='firestore'){once=true;assert.equal(state(f).phase,'active');throw new Error('active state only');}return original.call(this,values,...rest);};assert.throws(()=>finish(f.h,'activateNodeFirestoreMigration'),/active state only/);assert.equal(state(f).phase,'active');assert.equal(f.h.properties.NODE_STORAGE_PROVIDER,undefined);assert.equal(f.h.context.firestoreMigrationFrozen_(),true);assert.equal(finish(f.h,'activateNodeFirestoreMigration').active,true);assert.equal(f.h.properties.NODE_STORAGE_PROVIDER,'firestore');assert.equal(f.h.context.firestoreMigrationFrozen_(),false);
});

test('a missing provider after live Firebase changes stays frozen until explicit repair, without rewriting business data',()=>{
 const f=fixture();verified(f);confirm(f,'ACTIVATE');finish(f.h,'activateNodeFirestoreMigration');manifest(f).fields.revision=8;const row=[...f.docs].find(([name])=>name.includes('/rows/'))[1];row.fields.payload='live value that must not be rolled back';delete f.h.properties.NODE_STORAGE_PROVIDER;assert.equal(f.h.context.firestoreMigrationFrozen_(),true);const before=clone([...f.docs]),commits=f.commits.length;assert.equal(finish(f.h,'activateNodeFirestoreMigration').active,true);assert.deepEqual([...f.docs],before);assert.equal(f.commits.length,commits);assert.equal(f.h.properties.NODE_STORAGE_PROVIDER,'firestore');
});

test('stopping writes after cutover preserves sealed read access without changing source provenance',()=>{
 const f=fixture();verified(f);confirm(f,'ACTIVATE');finish(f.h,'activateNodeFirestoreMigration');const before=state(f),provenance=clone(manifest(f).fields),config=f.h.context.config_();assert.equal(f.h.context.writesEnabled_(config),true);f.h.context.disableNodeWrites();const paused=f.h.context.config_();assert.equal(paused.writesEnabled,false);assert.notEqual(f.h.context.hash_(f.h.context.stableJson_(paused)),before.sourceConfigHash);assert.equal(f.h.context.firestoreMigrationReady_(paused),true);assert.equal(f.h.context.writesEnabled_(paused),false);assert.deepEqual(manifest(f).fields,provenance);assert.equal(state(f).sourceConfigHash,before.sourceConfigHash);assert.equal(state(f).sourceHash,before.sourceHash);
 // Reconfirming the same destination never turns business writes back on.
 assert.equal(finish(f.h,'activateNodeFirestoreMigration').active,true);assert.equal(f.h.context.config_().writesEnabled,false);assert.equal(f.h.context.firestoreMigrationReady_(f.h.context.config_()),true);
});

test('runtime config binding ignores only the write switch, and rejects changed owner, destination, purpose or authorization',()=>{
 const f=fixture();verified(f);confirm(f,'ACTIVATE');finish(f.h,'activateNodeFirestoreMigration');const config=plain(f.h.context.config_());for(const change of [{ownerEmail:'other@example.test'},{spreadsheetId:'other-copy'},{matchingSheetId:999},{kpiSheetId:999},{purpose:'production'},{destinationAuthorizationSeal:'new-seal'},{newUnexpectedConfig:'changed'}])assert.equal(f.h.context.firestoreMigrationReady_({...config,...change}),false,JSON.stringify(change));
 manifest(f).fields.migrationProof.runtimeConfigHash='tampered';assert.equal(f.h.context.firestoreMigrationReady_(config),false);
});

test('the migration source hash remains strict about a write-switch change before activation',()=>{
 const f=fixture();prepare(f);f.h.context.disableNodeWrites();assertNodeError(()=>finish(f.h,'importNodeFirestoreMigration'),'MIGRATION_SOURCE_CHANGED');assert.equal(f.h.properties.NODE_STORAGE_PROVIDER,undefined);assert.equal(f.h.context.firestoreMigrationFrozen_(),true);
});
