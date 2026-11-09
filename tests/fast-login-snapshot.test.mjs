import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {projectSnapshotForCache} from '../lib/snapshot-cache.ts';
const codePath=fileURLToPath(new URL('../google-apps-script/Code.gs',import.meta.url));
const fixtureSource=readFileSync(new URL('./apps-script.test.mjs',import.meta.url),'utf8').split('\ntest(')[0].replace(/const CODE_PATH = [^\n]+;/,`const CODE_PATH = ${JSON.stringify(codePath)};`)+'\nexport {baseHarness,seedMatchingRows,request};';
const {baseHarness,seedMatchingRows,request}=await import('data:text/javascript;base64,'+Buffer.from(fixtureSource).toString('base64'));
const ok=value=>{assert.equal(value.ok,true,JSON.stringify(value));return value.data;};
const denied=(value,code)=>{assert.equal(value.ok,false,JSON.stringify(value));if(code)assert.equal(value.error.code,code,JSON.stringify(value));assert.equal('data'in value,false);return value.error;};
const sessionKeys=h=>Object.keys(h.properties).filter(key=>/^NODE_SESSION_[A-Za-z0-9_-]{43}$/.test(key));
const sourceState=h=>JSON.stringify(h.spreadsheet.sheets.map(sheet=>({id:sheet.id,values:sheet.values,formulas:sheet.formulas})));
function fixture(){const h=baseHarness({now:'2026-11-06T01:00:00.000Z'});seedMatchingRows(h);h.properties.NODE_PEPPER='fictional-test-pepper';for(const id of ['ADMIN','ND-001','ND-002'])h.properties['NODE_AUTH_'+id]=JSON.stringify(h.context.makeAuth_('correct-test-password'));h.writes.length=0;h.apiCalls.length=0;h.spreadsheet.reads.length=0;return h;}
function login(h,extra={}){return request(h,'login',{id:'ND-001',password:'correct-test-password',idleAware:true,sessionOnly:false,cacheSnapshot:true,...extra});}
function revokeWhenBusinessReadFails(h,change=()=>{}){let invoked=false;h.spreadsheet.readObserver=read=>{if(read.sheetId!==286330650||invoked)return;invoked=true;change();throw new Error('fictional-business-outage-with-private-details');};return()=>invoked;}

test('modern cold login returns an authenticated owned snapshot in one response without changing business data',()=>{
 const h=fixture(),before=sourceState(h),auth=h.properties['NODE_AUTH_ND-001'];const result=ok(login(h,{role:'admin',playerId:'ADMIN'}));
 assert.deepEqual(Object.keys(result).sort(),['deviceToken','snapshot','token']);assert.match(result.token,/^[A-Za-z0-9_-]{43}$/);assert.match(result.deviceToken,/^d1\./);assert.equal(result.snapshot.self.playerId,'ND-001');assert.equal(result.snapshot.self.role,'player');assert.ok(result.snapshot.records.length>0);assert.ok(result.snapshot.records.every(record=>record.playerId==='ND-001'));assert.equal(JSON.stringify(result).includes('他者秘密候補'),false);assert.equal(JSON.stringify(result).includes('他者秘密メモ'),false);assert.equal(sessionKeys(h).length,1);assert.ok(h.properties[h.context.sessionKey_(result.token)]);assert.equal(h.properties['NODE_AUTH_ND-001'],auth);assert.equal(sourceState(h),before);assert.deepEqual(h.writes,[]);assert.deepEqual(h.apiCalls,[]);
});

test('the combined snapshot contains the same shared introduction settings already readable by the player, never in display cache',()=>{
 const h=fixture(),admin=ok(request(h,'login',{id:'ADMIN',password:'correct-test-password',sessionOnly:true})),settings=h.context.introductionV2Engine_().blankIntroductionV2Settings();settings.sources=['架空の紹介元'];settings.clients=[{id:'fictional-client',name:'架空の設定先企業',mentions:['@架空の宛先'],rate:{amount:'2500',unit:'hour',tax:'exclusive'}}];ok(request(h,'saveIntroductionSettings',{settings,expectedVersion:''},{token:admin.token,operationId:'fast-settings-save-operation-0001'}));h.writes.length=0;h.apiCalls.length=0;
 const result=ok(login(h)),record=result.snapshot.records[0],existing=ok(request(h,'readIntroductionV2',{recordId:record.recordId},{token:result.token}));assert.deepEqual(result.snapshot.introductionV2Settings,existing.settings);assert.equal(result.snapshot.introductionV2Settings.clients[0].name,'架空の設定先企業');const cached=projectSnapshotForCache(result.snapshot);assert.equal(cached.introductionV2Settings,undefined);assert.equal(cached.candidateIntroductionV2,undefined);assert.equal(JSON.stringify(cached).includes('架空の設定先企業'),false);assert.equal(JSON.stringify(cached).includes('@架空の宛先'),false);assert.deepEqual(h.writes,[]);assert.deepEqual(h.apiCalls,[]);
});

test('wrong passwords and disabled accounts cannot use cold snapshot login to obtain data or a session',()=>{
 for(const invalid of ['password','disabled']){const h=fixture(),auth=h.properties['NODE_AUTH_ND-001'],before=sourceState(h);if(invalid==='disabled')h.spreadsheet.getSheetById(8001).values[2][8]=false;h.spreadsheet.reads.length=0;const result=login(h,{...(invalid==='password'?{password:'wrong-test-password'}:{})});denied(result,'INVALID_CREDENTIALS');assert.equal(sessionKeys(h).length,0);assert.equal(h.properties['NODE_AUTH_ND-001'],auth);assert.deepEqual(h.writes,[]);assert.deepEqual(h.apiCalls,[]);assert.equal(h.spreadsheet.reads.some(read=>read.sheetId!==8001),false);if(invalid==='password')assert.equal(sourceState(h),before);assert.equal(JSON.stringify(result).includes('本人候補'),false);}
});

test('a modern business-read failure returns only the verified session and the same token can recover data',()=>{
 const h=fixture(),failed=revokeWhenBusinessReadFails(h),result=ok(login(h));assert.equal(failed(),true);assert.deepEqual(Object.keys(result).sort(),['deviceToken','token']);assert.equal(result.snapshot,undefined);assert.equal(result.cacheAccess,undefined);assert.equal(JSON.stringify(result).includes('fictional-business-outage-with-private-details'),false);assert.equal(JSON.stringify(result).includes('本人候補'),false);assert.ok(h.properties[h.context.sessionKey_(result.token)]);assert.equal(h.context.trustedDevice_('ND-001',h.context.authRecord_('ND-001'),result.deviceToken),true);h.spreadsheet.readObserver=null;const snapshot=ok(request(h,'snapshot',{}, {token:result.token}));assert.equal(snapshot.self.playerId,'ND-001');assert.ok(snapshot.records.length>0);assert.ok(snapshot.records.every(record=>record.playerId==='ND-001'));assert.deepEqual(h.writes,[]);
});

test('a failure after business rows were built cannot return a partially built snapshot or cache key',()=>{
 const h=fixture(),settings=h.spreadsheet.insertSheet('_NODE_introduction_settings'),engine=h.context.introductionV2Engine_(),saved=engine.blankIntroductionV2Settings();saved.version='s'.repeat(43);settings.getRange(1,1,2,14).setValues([h.context.INTRODUCTION_SETTINGS_HEADERS,['shared',...h.context.introductionV2Chunks_(saved),saved.version,'2026-11-06T01:00:00.000Z','ADMIN']]);h.writes.length=0;let sawBusiness=false;h.spreadsheet.readObserver=read=>{if(read.sheetId===286330650)sawBusiness=true;if(read.sheetId===settings.id)throw new Error('fictional-settings-outage-private-sentinel');};const result=ok(login(h));assert.equal(sawBusiness,true);assert.deepEqual(Object.keys(result).sort(),['deviceToken','token']);assert.equal(JSON.stringify(result).includes('本人候補'),false);assert.equal(JSON.stringify(result).includes('private-sentinel'),false);assert.equal(result.snapshot,undefined);assert.equal(result.cacheAccess,undefined);assert.ok(h.properties[h.context.sessionKey_(result.token)]);assert.deepEqual(h.writes,[]);
});

test('modern fallback still revokes the unreturned token when credentials, roster access, role or configuration change',()=>{
 for(const changed of ['credentials','disabled','role','configuration','mandatory-change']){const h=fixture();revokeWhenBusinessReadFails(h,()=>{if(changed==='credentials'||changed==='mandatory-change'){const auth=JSON.parse(h.properties['NODE_AUTH_ND-001']);if(changed==='credentials')auth.version='fictional-revoked-version';else auth.mustChange=true;h.properties['NODE_AUTH_ND-001']=JSON.stringify(auth);}else if(changed==='disabled')h.spreadsheet.getSheetById(8001).values[2][8]=false;else if(changed==='role')h.spreadsheet.getSheetById(8001).values[2][7]='admin';else{const config=JSON.parse(h.properties.NODE_CONFIG);config.writesEnabled=false;h.properties.NODE_CONFIG=JSON.stringify(config);}});const result=login(h);denied(result);assert.equal(sessionKeys(h).length,0,changed);assert.equal(JSON.stringify(result).includes('本人候補'),false,changed);assert.equal(result.data?.deviceToken,undefined);assert.deepEqual(h.writes,[]);}
});

test('a failure of the final roster recheck cannot convert a business outage into an authenticated fallback',()=>{
 const h=fixture();let accountReads=0;h.spreadsheet.readObserver=read=>{if(read.sheetId===8001&&++accountReads>1)throw new Error('fictional-roster-recheck-outage');if(read.sheetId===286330650)throw new Error('fictional-business-outage');};denied(login(h),'INTERNAL');assert.ok(accountReads>1);assert.equal(sessionKeys(h).length,0);assert.deepEqual(h.writes,[]);
});

test('legacy full-snapshot login retains its original success contract and deletes a token on a business-read failure',()=>{
 for(const flags of [{cacheSnapshot:false},{}]){const h=fixture();let payload={id:'ND-001',password:'correct-test-password',sessionOnly:false,...flags};const full=ok(request(h,'login',payload));assert.ok(full.snapshot.records.length>0);assert.equal(full.snapshot.self.role,'player');const sessionCount=sessionKeys(h).length;revokeWhenBusinessReadFails(h);denied(request(h,'login',payload));assert.equal(sessionKeys(h).length,sessionCount);assert.deepEqual(h.writes,[]);}
});

test('an issued password still opens only password change even when the client requests a combined snapshot',()=>{
 const h=fixture(),auth=JSON.parse(h.properties['NODE_AUTH_ND-001']);auth.mustChange=true;h.properties['NODE_AUTH_ND-001']=JSON.stringify(auth);h.spreadsheet.readObserver=read=>assert.equal(read.sheetId,8001,'An issued credential must not read candidate or settings rows');const result=ok(login(h));assert.equal(result.mustChangePassword,true);assert.equal(result.snapshot,undefined);assert.equal(result.cacheAccess,undefined);assert.equal(sessionKeys(h).length,1);denied(request(h,'snapshot',{}, {token:result.token}),'PASSWORD_CHANGE_REQUIRED');assert.deepEqual(h.writes,[]);
});
