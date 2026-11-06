import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const fixturePath=new URL('./apps-script.test.mjs',import.meta.url);
const codePath=fileURLToPath(new URL('../google-apps-script/Code.gs',import.meta.url));
const source=readFileSync(fixturePath,'utf8').split('\ntest(')[0].replace(/const CODE_PATH = [^\n]+;/,`const CODE_PATH = ${JSON.stringify(codePath)};`)+'\nexport {baseHarness,seedMatchingRows,authenticate,request};';
const {baseHarness,seedMatchingRows,authenticate,request}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const copy=value=>structuredClone(value);
function fixture(){const h=baseHarness({now:'2026-11-06T01:00:00Z'});seedMatchingRows(h);const admin=authenticate(h,'ADMIN');h.writes.length=0;h.apiCalls.length=0;h.logs.length=0;return {h,admin};}
const sheets=h=>h.spreadsheet.sheets.map(sheet=>({id:sheet.getSheetId(),values:copy(sheet.values),formulas:copy(sheet.formulas)}));
function mutation(f,action,payload,operationId){const response=request(f.h,action,payload,{token:f.admin.token,operationId,responseMode:'receipt'});assert.equal(response.ok,true,JSON.stringify(response));return response.data;}
function privateOutputAbsent(h,result){
 const output=JSON.stringify([result,h.logs]);
 for(const secret of ['本人候補','他者秘密候補','秘密クライアント','担当一','owner@example.test','test-spreadsheet','架空の保存原文','秘密の制度訂正理由'])assert.equal(output.includes(secret),false,secret);
 const leaves=value=>value&&typeof value==='object'?Object.values(value).flatMap(leaves):[value];
 assert.ok(leaves(result).every(value=>typeof value==='boolean'||typeof value==='number'));
}

test('completion verification is editor-only, aggregate-only and never creates missing workflow tables',()=>{
 const {h,admin}=fixture(),beforeProperties=copy(h.properties),beforeSheets=sheets(h);
 const result=JSON.parse(JSON.stringify(h.context.verifyNodeCompletionReadOnly()));
 assert.deepEqual(result,{verified:true,readOnly:true,configUnchanged:true,accounts:{count:3,active:3},rewards:{enabled:false,settings:{exists:false,count:0},ledger:{exists:false,count:0},requests:{exists:false,count:0}},migration:{exists:false,count:0}});
 assert.deepEqual(h.properties,beforeProperties);assert.deepEqual(sheets(h),beforeSheets);assert.deepEqual(h.writes,[]);assert.deepEqual(h.apiCalls,[]);assert.equal(h.logs.length,1);privateOutputAbsent(h,result);
 const response=request(h,'verifyNodeCompletionReadOnly',{}, {token:admin.token});assert.equal(response.ok,false);assert.equal(response.error.code,'BAD_REQUEST');
});

test('completion verification validates populated rewards and migration without logging their private contents',()=>{
 const f=fixture(),h=f.h,rewards=h.context.readRewards_({token:f.admin.token,payload:{}});
 mutation(f,'mutateRewards',{command:'policy',expectedVersion:rewards.version,policy:{enabled:true,metric:'提案',pointsPerWin:100,tiePolicy:'all',effectiveMonth:'2026-10'}},'completion-policy-operation-001');
 mutation(f,'mutateRewards',{command:'adjust',expectedVersion:h.context.readRewards_({token:f.admin.token,payload:{}}).version,playerId:'ND-001',delta:100,reason:'秘密の制度訂正理由'},'completion-adjust-operation-001');
 mutation(f,'stageMigrationBatch',{entries:[{workspace:'架空',channel:'架空共有',sourceId:'completion-source-001',body:'架空の保存原文'}]},'completion-archive-operation-001');
 h.writes.length=0;h.apiCalls.length=0;h.logs.length=0;const before=copy(h.properties),beforeSheets=sheets(h),result=h.context.verifyNodeCompletionReadOnly();
 assert.equal(result.rewards.enabled,true);assert.equal(result.rewards.settings.count,1);assert.equal(result.rewards.ledger.count,1);assert.equal(result.rewards.requests.exists,false);assert.equal(result.migration.exists,true);assert.equal(result.migration.count,1);
 assert.deepEqual(h.properties,before);assert.deepEqual(sheets(h),beforeSheets);assert.deepEqual(h.writes,[]);assert.deepEqual(h.apiCalls,[]);assert.equal(h.logs.length,1);privateOutputAbsent(h,result);
});

test('completion verification fails closed for another owner, the original source and invalid optional tables',()=>{
 for(const kind of ['owner','original','schema']){
  const {h}=fixture();
  if(kind==='owner')h.context.Session.getActiveUser=()=>({getEmail:()=>'other@example.test'});
  if(kind==='original')h.properties.NODE_CONFIG=JSON.stringify({...JSON.parse(h.properties.NODE_CONFIG),spreadsheetId:h.context.NODE.originalId});
  if(kind==='schema')h.spreadsheet.insertSheet('_NODE_migration_archive').getRange(1,1).setValue('bad header');
  const before=copy(h.properties),beforeSheets=sheets(h);h.writes.length=0;h.apiCalls.length=0;h.logs.length=0;
  assert.throws(()=>h.context.verifyNodeCompletionReadOnly(),error=>error.nodeCode===(kind==='owner'?'FORBIDDEN':kind==='original'?'PROTECTED_SOURCE':'SCHEMA_MISMATCH'));
  assert.deepEqual(h.properties,before);assert.deepEqual(sheets(h),beforeSheets);assert.deepEqual(h.writes,[]);assert.deepEqual(h.apiCalls,[]);assert.equal(h.logs.length,0);
 }
});

test('completion verification rechecks configuration and owner before publishing any summary',()=>{
 for(const kind of ['config','owner']){
  const {h}=fixture(),original=h.context.migrationTable_;
  h.context.migrationTable_=function(...args){const result=original(...args);if(kind==='config')h.properties.NODE_CONFIG=JSON.stringify({...JSON.parse(h.properties.NODE_CONFIG),writesEnabled:false});else h.context.Session.getActiveUser=()=>({getEmail:()=>'other@example.test'});return result;};
  assert.throws(()=>h.context.verifyNodeCompletionReadOnly(),error=>error.nodeCode===(kind==='config'?'BUSY':'FORBIDDEN'));
  assert.deepEqual(h.writes,[]);assert.deepEqual(h.apiCalls,[]);assert.equal(h.logs.length,0);
 }
});
