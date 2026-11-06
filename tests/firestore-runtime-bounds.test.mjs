import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const repo=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),codePath=repo+'/google-apps-script/Code.gs';
const prefix=readFileSync(repo+'/tests/apps-script.test.mjs','utf8').split('\ntest(')[0].replace(/const CODE_PATH = [^\n]+;/,`const CODE_PATH = ${JSON.stringify(codePath)};`)+'\nexport {baseHarness,seedMatchingRows,authenticate,request};';
const {baseHarness,seedMatchingRows,authenticate,request}=await import('data:text/javascript;base64,'+Buffer.from(prefix).toString('base64'));
const h=baseHarness({now:'2026-11-06T01:00:00Z'});seedMatchingRows(h);const admin=authenticate(h,'ADMIN'),player=authenticate(h,'ND-001');vm.runInContext(readFileSync(repo+'/google-apps-script/FirestoreMigration.fragment.gs','utf8'),h.context);
const matching=h.spreadsheet.getSheetByName('2期目マッチングDB');for(let row=6;row<=13501;row++){matching.values[row-1]=[];matching.formulas[row-1]=[];matching.formulas[row-1][4]='=1';}matching.maxRows=14000;
const source=h.context.firestoreMigrationSource_(h.context.config_()),config=h.context.config_(),target={projectId:'insup-node-synthetic-audit',databaseId:'(default)',workbookId:'readonly-synthetic-runtime'},state={phase:'active',target,ownerEmail:'owner@example.test',sourceSpreadsheetId:config.spreadsheetId,sourceConfigHash:source.sourceConfigHash,runtimeConfigHash:source.runtimeConfigHash,sourceHash:source.sourceHash,importId:'synthetic-runtime-audit',preparedAt:'2026-11-06T01:00:00.000Z',verifiedAt:'2026-11-06T01:00:00.000Z',counts:source.counts};
const docs=new Map(),name=path=>h.context.firestoreDocumentName_(target,path),root='nodeWorkbooks/'+target.workbookId,iso='2026-11-06T01:00:00.000Z',json=value=>JSON.parse(JSON.stringify(value));
function put(path,data){const full=name(path);docs.set(full,{name:full,fields:h.context.firestoreEncodeFields_(json(data)),updateTime:iso});}
put(root,{...source.manifest,migrationProof:h.context.firestoreMigrationProof_(state,'active')});for(const d of source.documents)put(root+'/'+d.path,d.data);
h.properties.NODE_STORAGE_PROVIDER='firestore';h.properties.NODE_FIRESTORE_CONFIG=JSON.stringify(target);h.properties.NODE_FIRESTORE_MIGRATION_STATE=JSON.stringify(state);
const decoded=new Map([...docs].map(([key,doc])=>[key,h.context.firestoreDecodeFields_(doc.fields)]));
const log=[];function scalar(value){if(value.integerValue!==undefined)return Number(value.integerValue);return value.booleanValue??value.referenceValue??value.stringValue;}
function matches(data,where,doc){if(!where)return true;if(where.compositeFilter)return where.compositeFilter.filters.every(w=>matches(data,w,doc));const f=where.fieldFilter,l=f.field.fieldPath==='__name__'?doc.name:data[f.field.fieldPath],r=scalar(f.value);return ({EQUAL:()=>l===r,GREATER_THAN_OR_EQUAL:()=>l>=r,LESS_THAN_OR_EQUAL:()=>l<=r,GREATER_THAN:()=>l>r})[f.op]();}
h.context.firestoreRequest_=(method,path,body)=>{
 let result;if(path===':beginTransaction')result={transaction:'synthetic-readonly-transaction'};
 else if(path===':rollback')result={};
 else if(path===':batchGet')result=body.documents.map(n=>docs.has(n)?{found:{...json(docs.get(n)),...(body.mask?{fields:{}}:{})}}:{missing:n});
 else if(method==='get')result=json(docs.get(name(path))||null);
 else if(path.endsWith(':runQuery')){const parent=path.slice(0,-':runQuery'.length),q=body.structuredQuery,prefix=name(parent+'/'+q.from[0].collectionId)+'/';let found=[...docs.values()].filter(d=>d.name.startsWith(prefix)&&!d.name.slice(prefix.length).includes('/')&&matches(decoded.get(d.name),q.where,d));const field=q.orderBy[0].field.fieldPath;found.sort((a,b)=>field==='__name__'?a.name.localeCompare(b.name):decoded.get(a.name)[field]-decoded.get(b.name)[field]);if(q.startAt){const after=scalar(q.startAt.values[0]);found=found.filter(d=>field==='__name__'?d.name>after:decoded.get(d.name)[field]>after);}result=found.slice(0,q.limit).map(document=>({document:json(document)}));}
 else throw Error('unexpected '+method+' '+path);
 const listed=Array.isArray(result)?result.flatMap(v=>v.found?[v.found]:v.document?[v.document]:[]):result?.name?[result]:[];
 log.push({method,path,query:body?.structuredQuery,requested:body?.documents?.length||0,returned:listed.length,tailReturned:listed.filter(d=>d.name.startsWith((name(root+'/tables/'+matching.id+'/rows')+'/') )&&Number(d.name.slice(-8))>40).length});return result;
};
function run(label,fn){log.length=0;h.context.firestoreReset_(false);let error,result;try{result=fn();h.context.firestoreAssertSnapshot_();}catch(e){error={code:e.nodeCode,message:e.message};}h.context.firestoreClose_();const report={label,error,rpcs:log.length,returnedDocumentReads:log.reduce((n,v)=>n+v.returned,0),requestedPointReads:log.reduce((n,v)=>n+v.requested,0),tailReturned:log.reduce((n,v)=>n+v.tailReturned,0),queries:log.filter(v=>v.query).map(v=>({path:v.path,query:v.query,returned:v.returned,tailReturned:v.tailReturned}))};return report;}
const cache=h.context.CacheService.getScriptCache(),fullGridKey='NODE_FULL_GRID_'+h.context.hash_(config.spreadsheetId+'|'+matching.id+'|'+matching.getLastRow());
const writeCount=docs.size;
function fullGridChoice(){cache.put(fullGridKey,'1',1800);}
function businessProjection(snapshot){const out=json(snapshot);delete out.syncedAt;delete out.cacheAccess;delete out.outboxKey;return out;}

test('Firestore read-only snapshot ignores a stale Sheets full-grid choice and leaves 13k formula-tail documents unread',()=>{
 cache.remove(fullGridKey);let before,after;const baseline=run('baseline',()=>{const store=h.context.readStore_({readOnly:true});before=h.context.authenticatedSnapshot_(store,player.token);});assert.equal(baseline.error,undefined);assert.equal(baseline.tailReturned,0);assert.ok(baseline.returnedDocumentReads<100);
 fullGridChoice();const cached=run('stale cache',()=>{const store=h.context.readStore_({readOnly:true});after=h.context.authenticatedSnapshot_(store,player.token);});assert.equal(cached.error,undefined);assert.equal(cached.tailReturned,0);assert.equal(cached.returnedDocumentReads,baseline.returnedDocumentReads);assert.deepEqual(businessProjection(after),businessProjection(before));assert.equal(docs.size,writeCount);
});

test('session-only login and encrypted display-cache access read the roster without fetching candidate/template tails',()=>{
 fullGridChoice();const result=run('sessionOnly login',()=>h.context.login_({id:'ND-001',password:'correct-test-password',sessionOnly:true,cacheSnapshot:true}));assert.equal(result.error,undefined);assert.equal(result.tailReturned,0);assert.ok(result.returnedDocumentReads<25);assert.equal(docs.size,writeCount);
});

test('an existing-record update takes the bounded path while retaining versions, owner checks and formula protection',()=>{
 fullGridChoice();let store;const read=run('existing-row read',()=>{store=h.context.readStore_({readOnly:true});});assert.equal(read.error,undefined);assert.equal(read.tailReturned,0);const own=store.records.find(record=>record.playerId==='ND-001'),other=store.records.find(record=>record.playerId!=='ND-001');assert.ok(own&&other);
 h.context.firestoreReset_(true);store=h.context.readStore_({readOnly:true});const record=store.records.find(record=>record.recordId===own.recordId),actor={id:'ND-001',role:'player'},payload={recordId:record.recordId,rowVersion:record.version,changes:{13:'synthetic corrected memo'}};const plan=h.context.planRecord_(store,actor,payload);assert.equal(plan.recordChecks[0].version,record.version);assert.equal(plan.requests[0].updateCells.range.startRowIndex,record.row-1);assert.throws(()=>h.context.planRecord_(store,actor,{...payload,rowVersion:'obsolete'}),error=>error.nodeCode==='CONFLICT');assert.throws(()=>h.context.planRecord_(store,actor,{...payload,recordId:other.recordId,rowVersion:other.version}),error=>error.nodeCode==='FORBIDDEN');
 const body=store.book.rows[matching.id+':'+record.row].body;body.cells[12].userEnteredValue={formulaValue:'=1'};assert.throws(()=>h.context.planRecord_(store,actor,payload),error=>error.nodeCode==='FORMULA_PROTECTED');h.context.firestoreClose_();const originalCommit=h.context.commit_;h.context.commit_=()=>{throw Object.assign(Error('stop after validated plan'),{nodeCode:'AUDIT_AFTER_PLAN'});};const dispatched=run('existing update API',()=>h.context.nodeHandle_({version:1,action:'updateRecord',payload,token:player.token,operationId:'runtime-bounds-existing-update-001'}));h.context.commit_=originalCommit;assert.equal(dispatched.error?.code,'AUDIT_AFTER_PLAN');assert.equal(dispatched.tailReturned,0);assert.equal(docs.size,writeCount);
});

test('create and restore action classification keep the full template scan and never relax blank/formula guards',()=>{
 fullGridChoice();const originalCommit=h.context.commit_;h.context.commit_=()=>{throw Object.assign(Error('stop before any synthetic write'),{nodeCode:'AUDIT_AFTER_PLAN'});};
 for(const [action,payload]of [['createCandidate',{playerId:'ND-001',candidateName:'架空追加候補者',company:'',position:'アポインター'}],['restoreChange',{changeId:'nonexistent-synthetic-restore'}]]){
  const result=run(action,()=>h.context.nodeHandle_({version:1,action,payload,token:player.token,operationId:'runtime-bounds-'+action+'-operation'}));assert.ok(['AUDIT_AFTER_PLAN','VALIDATION','FORMULA_PROTECTED'].includes(result.error?.code),JSON.stringify(result.error));assert.ok(result.tailReturned>=13461,action+' must inspect all blank/formula template rows');
 }
 h.context.commit_=originalCommit;assert.equal(docs.size,writeCount);
});

test('the original Sheets path still honors its cached full-grid choice',()=>{
 const active=h.properties.NODE_FIRESTORE_MIGRATION_STATE;h.context.firestoreClose_();delete h.properties.NODE_FIRESTORE_MIGRATION_STATE;h.properties.NODE_STORAGE_PROVIDER='sheets';fullGridChoice();try{const store=h.context.readStore_({readOnly:true});assert.equal(store.values.length,13501);}finally{h.properties.NODE_STORAGE_PROVIDER='firestore';h.properties.NODE_FIRESTORE_MIGRATION_STATE=active;}assert.equal(docs.size,writeCount);
});
