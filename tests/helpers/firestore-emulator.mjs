import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

export const DEMO_PROJECT='demo-insup-node';
export const DOCUMENT_PREFIX=`projects/${DEMO_PROJECT}/databases/(default)/documents/`;
const codePath=fileURLToPath(new URL('../../google-apps-script/Code.gs',import.meta.url));
const fixtureSource=readFileSync(new URL('../apps-script.test.mjs',import.meta.url),'utf8').split('\ntest(')[0].replace(/const CODE_PATH = [^\n]+;/,`const CODE_PATH = ${JSON.stringify(codePath)};`)+'\nexport {baseHarness,seedMatchingRows,authenticate,request};';
const fixtureApi=await import('data:text/javascript;base64,'+Buffer.from(fixtureSource).toString('base64'));
export const plain=value=>JSON.parse(JSON.stringify(value));

/** Explicit opt-in, fixed loopback host and demo project: never accept a real endpoint. */
export function emulatorOrigin(value){
 const url=new URL(value);
 assert.equal(url.origin,'http://127.0.0.1:8087','Only the named local Firestore emulator is allowed');
 assert.ok(url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password,'The emulator URL must have no path, credentials or parameters');
 return url.origin;
}

export function createRestFixture(origin){
 origin=emulatorOrigin(origin);
 let code=readFileSync(codePath,'utf8').replace(/\n  kdfIterations: \d+,\n/,'\n  kdfIterations: 64,\n');
 for(const [marker,file] of [['function firestoreClose_(','Firestore.fragment.gs'],['function previewNodeFirestoreMigration(','FirestoreMigration.fragment.gs']])if(!code.includes(marker))code+='\n'+readFileSync(new URL('../../google-apps-script/'+file,import.meta.url),'utf8');
 const h=fixtureApi.baseHarness({now:'2026-11-06T01:00:00.000Z',code});fixtureApi.seedMatchingRows(h);
 const accounts={admin:fixtureApi.authenticate(h,'ADMIN'),player:fixtureApi.authenticate(h,'ND-001'),other:fixtureApi.authenticate(h,'ND-002')};
 const legacyFetch=h.context.UrlFetchApp.fetch;
 const calls=[],state={cutover:false,dropCommit:false},source=()=>JSON.stringify(h.spreadsheet.sheets.map(s=>({id:s.id,name:s.name,values:s.values,formulas:s.formulas}))),sourceBefore=()=>source();
 function response(status,body){return {getResponseCode:()=>status,getContentText:()=>body};}
 function perform(url,options={},owner=true){
  const u=new URL(url);
  assert.equal(u.origin,'https://firestore.googleapis.com','Test traffic must originate from the real Firestore facade');
  assert.ok(!u.username&&!u.password&&!u.hash);
  const path=decodeURIComponent(u.pathname),prefix=`/v1/${DOCUMENT_PREFIX.slice(0,-1)}`;
  assert.ok(path===prefix+':beginTransaction'||path===prefix+':rollback'||path===prefix+':batchGet'||path===prefix+':commit'||String(options.method||'get').toLowerCase()==='get'&&new RegExp('^'+prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/nodeWorkbooks/[A-Za-z0-9_-]+/tables$').test(path)||new RegExp('^'+prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/nodeWorkbooks/[A-Za-z0-9_-]+(?:/tables/[0-9]+(?:/rows(?:/[0-9]{8})?)?)?(?::runQuery)?$').test(path),'Only demo-insup-node workbook paths can be used: '+path);
  const payload=options.payload===undefined?undefined:JSON.parse(options.payload);
  for(const write of payload?.writes||[])assert.ok(write.update?.name?.startsWith(DOCUMENT_PREFIX+'nodeWorkbooks/'),'No production document write');
  for(const name of payload?.documents||[])assert.ok(name.startsWith(DOCUMENT_PREFIX+'nodeWorkbooks/'),'No production document read');
  const args=['--silent','--show-error','--max-time','15','--noproxy','*','--request',String(options.method||'get').toUpperCase(),'--header','Content-Type: application/json'];
  if(owner)args.push('--header','Authorization: Bearer '+(typeof owner==='string'?owner:'owner'));
  if(options.payload!==undefined)args.push('--data-binary','@-');
  args.push('--write-out','\n%{http_code}','--url',origin+u.pathname+u.search);
  const output=execFileSync('curl',args,{encoding:'utf8',input:options.payload,maxBuffer:13_000_000,timeout:20_000}),index=output.lastIndexOf('\n'),status=Number(output.slice(index+1)),body=output.slice(0,index);
  let responseDocuments=0;
  try{const parsed=JSON.parse(body);responseDocuments=Array.isArray(parsed)?parsed.filter(item=>item.found||item.document).length:parsed.documents?.length||(parsed.name&&parsed.fields?1:0);}catch{}
  calls.push({method:String(options.method||'get').toLowerCase(),path,query:u.search,status,body:payload,responseDocuments});
  if(state.dropCommit&&path===prefix+':commit'&&payload?.transaction&&status===200){state.dropCommit=false;throw new Error('Synthetic transport loss after emulator committed');}
  return response(status,body);
 }
 h.context.UrlFetchApp.fetch=(url,options)=>{
  if(new URL(url).origin==='https://firestore.googleapis.com'){
   assert.equal(options.headers?.Authorization,'Bearer test-oauth-token','The Apps Script facade must keep server OAuth credentials off the browser');
   return perform(url,options);
  }
  assert.equal(state.cutover,false,'No legacy provider traffic after cutover');
  return legacyFetch(url,options);
 };
 h.properties.NODE_FIRESTORE_MIGRATION_TARGET=JSON.stringify({projectId:DEMO_PROJECT,databaseId:'(default)'});
 const api=(action,payload={},as='player',operationId,extra={})=>{h.clock.milliseconds+=2000;return fixtureApi.request(h,action,payload,{token:accounts[as].token,...(operationId?{operationId}:{}),...extra});};
 const migrationState=()=>JSON.parse(h.properties.NODE_FIRESTORE_MIGRATION_STATE);
 const commits=()=>calls.filter(c=>c.path.endsWith('/documents:commit')&&c.status===200).length;
 function forbidSheets(){
  state.cutover=true;
  const fail=()=>{throw new Error('Legacy Sheets runtime access is forbidden after Firebase cutover');};
  h.spreadsheet.beforeRead=fail;h.spreadsheet.beforeWrite=fail;
  h.context.SpreadsheetApp.openById=fail;h.context.SpreadsheetApp.getActiveSpreadsheet=fail;h.context.SpreadsheetApp.getActive=fail;h.context.SpreadsheetApp.flush=fail;
  h.context.Sheets.Spreadsheets.get=fail;h.context.Sheets.Spreadsheets.DeveloperMetadata.search=fail;
 }
 function readDocument(path,owner=true){
  assert.ok(path.startsWith('nodeWorkbooks/'));
  const r=perform(`https://firestore.googleapis.com/v1/${DOCUMENT_PREFIX}${path}`,{method:'get'},owner);
  return {status:r.getResponseCode(),body:JSON.parse(r.getContentText())};
 }
 function deniedWriteProbe(path,authorization=false){
  assert.ok(/^nodeWorkbooks\/[A-Za-z0-9_-]+$/.test(path));
  const body={writes:[{update:{name:DOCUMENT_PREFIX+path,fields:{probe:{stringValue:'fictional denied client write'}}},currentDocument:{exists:false}}]};
  const r=perform(`https://firestore.googleapis.com/v1/${DOCUMENT_PREFIX.slice(0,-1)}:commit`,{method:'post',payload:JSON.stringify(body)},authorization);
  return {status:r.getResponseCode(),body:JSON.parse(r.getContentText())};
 }
 return {h,accounts,calls,state,api,source,sourceBefore,migrationState,commits,forbidSheets,readDocument,deniedWriteProbe};
}
