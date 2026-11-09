import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {blankInterviewFields} from '../lib/candidate-intake.ts';
import {persistSnapshotCache,readSnapshotCache,hasSnapshotCache,purgeSnapshotCache,projectSnapshotForCache,validSnapshotCacheAccess,SNAPSHOT_CACHE_TTL_MS,SNAPSHOT_CACHE_MAX_BYTES,SNAPSHOT_CACHE_HINT_TIMEOUT_MS,type SnapshotCacheAccess} from '../lib/snapshot-cache.ts';
import type {SheetSnapshot} from '../lib/sheets-client.ts';
const endpoint='https://script.google.com/macros/s/TEST_DISPLAY_CACHE_20261031/exec';
const grant=(id=randomUUID()):SnapshotCacheAccess=>({version:1,self:{playerId:id,role:'player'},scope:randomUUID().replaceAll('-','').padEnd(43,'S'),secret:'K'.repeat(43),expiresAt:Date.now()+3600000});
function fixture(access:SnapshotCacheAccess):SheetSnapshot{
 const recordId=randomUUID();return {self:access.self,players:[{id:access.self.playerId,name:'共有の担当者名',team:'NODE',target:20,color:'blue',bio:'秘密の自己紹介',sheetNames:['非公開担当別名']}],activities:[{id:'event',playerId:access.self.playerId,candidateId:'person',recordId,candidateName:'絶対保存しない候補者',company:'非公開会社',source:'秘密の紹介元',position:'FS',stage:'候補者面談',date:'2026-10-31'}],records:[{recordId,profileId:'profile',rowVersion:'private-version',row:2,playerId:access.self.playerId,candidateName:'絶対保存しない候補者',source:'秘密の紹介元',values:Array(26).fill('機微な面談原文'),formulaColumns:[]}],candidateProfiles:[{profileId:'profile',playerId:access.self.playerId,recordIds:[recordId],version:'v1',updatedAt:'2026-10-31T00:00:00Z',fields:{...blankInterviewFields(),workHistory:'非公開職歴'},introduction:'本人だけの紹介文'}],clients:[{id:'private-company',name:'非公開会社',active:true,version:'v1'}],interviewReviews:[{recordId,playerId:access.self.playerId,interviewDate:'2026-10-31',category:'理由未確認',memo:'個人の面談理由',nextAction:'秘密の対応',version:'v1',updatedAt:'2026-10-31T00:00:00Z'}],counts:{all:{[access.self.playerId]:{'提案':3}},'2026-10':{[access.self.playerId]:{'提案':2}}},syncedAt:'2026-10-31T00:00:00Z',warnings:['秘密の管理警告'],writesEnabled:true,outboxKey:'O'.repeat(43),cacheAccess:access,...(access.self.role==='admin'?{destination:{title:'秘密の管理簿',matchingUrl:'https://docs.google.com/spreadsheets/d/private/edit#gid=1',kpiUrl:'https://docs.google.com/spreadsheets/d/private/edit#gid=2'}}:{})};
}
const result=<T,>(request:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const open=()=>result(indexedDB.open('insup.node.display-cache.v1',1));
async function stored(){const db=await open(),rows=await result<any[]>(db.transaction('snapshots').objectStore('snapshots').getAll());db.close();return rows;}
async function replace(row:any){const db=await open(),tx=db.transaction('snapshots','readwrite'),done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);});tx.objectStore('snapshots').put(row);await done;db.close();}

test('cache projection contains shared rankings only, no candidate, owner aliases, private biography, destination or key',()=>{
 const access={...grant(),self:{playerId:'ADMIN',role:'admin' as const}},snapshot=fixture(access);(snapshot.self as typeof snapshot.self&{extra_private:string}).extra_private='個票本文を含む追加フィールド';const data=projectSnapshotForCache(snapshot),text=JSON.stringify(data);
 assert.equal(data.writesEnabled,false);assert.equal(data.counts.all[access.self.playerId]['提案'],3);assert.equal(data.players[0].name,'共有の担当者名');
 for(const value of ['絶対保存しない候補者','非公開会社','秘密の紹介元','機微な面談原文','非公開職歴','本人だけの紹介文','個人の面談理由','秘密の対応','非公開担当別名','秘密の自己紹介','秘密の管理警告','秘密の管理簿','private.example','個票本文を含む追加フィールド','extra_private','outboxKey','cacheAccess','secret'])assert.ok(!text.includes(value),value);
 assert.deepEqual(data.records,[]);assert.deepEqual(data.activities,[]);assert.deepEqual(data.candidateProfiles,[]);
 // Moving a record to another owner, or deleting it in Google, can never make cached private rows visible.
 snapshot.records![0].playerId='OTHER';snapshot.records=[];snapshot.candidateProfiles=[];assert.deepEqual(projectSnapshotForCache(snapshot).records,[]);
});

test('only a fresh authenticated grant opens encrypted display data and no encryption key is stored beside it',async()=>{
 const access=grant(),snapshot=fixture(access);await persistSnapshotCache(endpoint,access,snapshot);
 const read=await readSnapshotCache(endpoint,access);assert.ok(read);assert.equal(read.snapshot.writesEnabled,false);assert.equal(read.snapshot.players[0].name,'共有の担当者名');
 const rows=await stored(),raw=rows.find(row=>row.scope===access.scope&&row.savedAt===read.savedAt);assert.ok(raw);assert.equal(raw.iv.length,12);assert.ok(raw.ciphertext instanceof ArrayBuffer);assert.equal(raw.expiresAt,raw.savedAt+SNAPSHOT_CACHE_TTL_MS);
 for(const value of ['共有の担当者名','候補者','secret',access.secret,'token','key','counts','ND-'])assert.ok(!JSON.stringify(raw).includes(value),value);
 assert.equal(await readSnapshotCache(endpoint,{...access,expiresAt:Date.now()-1}),null);
 assert.equal(await readSnapshotCache(endpoint,{...access,secret:'Z'.repeat(43)}),null);
 assert.equal(await readSnapshotCache(endpoint,{...access,scope:'X'.repeat(43)}),null);
 assert.equal(await readSnapshotCache(endpoint+'other',access),null);
 assert.equal(await readSnapshotCache(endpoint,{...access,self:{...access.self,role:'admin'}}),null);
 assert.equal(await readSnapshotCache(endpoint,{...access,self:{...access.self,playerId:randomUUID()}}),null);
 assert.equal(validSnapshotCacheAccess({...access,expiresAt:Date.now()+80*60*1000}),false);
});

test('tampering, expired files, old grants and session changes fall back safely without returning details',async()=>{
 const access=grant();await persistSnapshotCache(endpoint,access,fixture(access));const before=await readSnapshotCache(endpoint,access);assert.ok(before);
 let raw=(await stored()).find(row=>row.savedAt===before.savedAt&&row.scope===access.scope&&row.ciphertext.byteLength>0);assert.ok(raw);
 const bad=new Uint8Array(raw.ciphertext.slice(0));bad[0]^=1;await replace({...raw,ciphertext:bad.buffer});assert.equal(await readSnapshotCache(endpoint,access),null);
 await replace({...raw,expiresAt:Date.now()-1});assert.equal(await readSnapshotCache(endpoint,access),null);await purgeSnapshotCache();assert.ok(!(await stored()).some(row=>row.id===raw.id));
 await persistSnapshotCache(endpoint,access,fixture(access),()=>false);assert.equal(await readSnapshotCache(endpoint,access),null);
});

test('oversized projections and a mismatched account are never persisted',async()=>{
 const access=grant(),snapshot=fixture(access);snapshot.players[0].bio='x'.repeat(SNAPSHOT_CACHE_MAX_BYTES+1);await persistSnapshotCache(endpoint,access,snapshot);assert.ok(await readSnapshotCache(endpoint,access),'Private biography is discarded before the size check');
 const huge=grant();const large=fixture(huge);large.players[0].name='x'.repeat(SNAPSHOT_CACHE_MAX_BYTES+1);await persistSnapshotCache(endpoint,huge,large);assert.equal(await readSnapshotCache(endpoint,huge),null);
 const foreign=grant();await persistSnapshotCache(endpoint,foreign,fixture(access));assert.equal(await readSnapshotCache(endpoint,foreign),null);
});

test('blocked storage is bounded and an abort cancels optional cache reading before the network fallback',async()=>{
 const original=globalThis.indexedDB;
 try{
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open:()=>({})}});
  const stalled=await import(`../lib/snapshot-cache.ts?stalled=${randomUUID()}`),access=grant(),started=performance.now();
  assert.equal(await stalled.readSnapshotCache(endpoint,access),null);assert.ok(performance.now()-started<1500);
  const controller=new AbortController(),read=stalled.readSnapshotCache(endpoint,access,()=>true,controller.signal);controller.abort();assert.equal(await read,null);
 }finally{Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:original});}
});

test('cached accounts are bounded and purging preserves only encrypted valid entries',async()=>{
 for(let i=0;i<23;i++){const access=grant();await persistSnapshotCache(endpoint,access,fixture(access));}
 await purgeSnapshotCache();const rows=await stored();assert.ok(rows.length<=20);assert.ok(rows.every(row=>row.expiresAt>Date.now()&&row.ciphertext.byteLength<=SNAPSHOT_CACHE_MAX_BYTES+32));
});

test('new private migration archives and rewards never enter the encrypted ranking projection',()=>{
 const access={...grant(),self:{playerId:'ADMIN',role:'admin' as const}},snapshot=Object.assign(fixture(access),{migrationFeature:true,rewardsFeature:true,migrationArchive:[{body:'原文保管の非公開情報',author:'Slackの個別投稿者',sourceId:'Slackの個別投稿ID'}],rewards:{balances:[{playerId:'ND-001',balance:987654}],requests:[{decisionNote:'特典交換の非公開判断'}]}});
 const projected=projectSnapshotForCache(snapshot),raw=JSON.stringify(projected);
 assert.notEqual(projected.migrationFeature,true);assert.notEqual(projected.rewardsFeature,true);
 for(const word of ['migrationArchive','原文保管の非公開情報','Slackの個別投稿者','Slackの個別投稿ID','rewards','987654','特典交換の非公開判断'])assert.equal(raw.includes(word),false,word);
 assert.equal(projected.writesEnabled,false);assert.equal(projected.records?.length,0);
});


test('Firestore cache metadata keeps the verified provider without caching private Firebase configuration',()=>{
 const access=grant(),snapshot=Object.assign(fixture(access),{storageBackend:{kind:'firestore' as const,projectId:'insup-node-test',migratedAt:'2026-11-06T00:00:00.000Z'},firebaseConfig:{apiKey:'do-not-persist'},migrationSource:{body:'private migration data'}});
 const projected=projectSnapshotForCache(snapshot);
 assert.deepEqual(projected.storageBackend,snapshot.storageBackend);assert.notEqual(projected.storageBackend,snapshot.storageBackend);
 assert.equal(projected.writesEnabled,false);assert.equal(JSON.stringify(projected).includes('do-not-persist'),false);assert.equal(JSON.stringify(projected).includes('private migration data'),false);
});

test('a pre-login hint is bound to the normalized account, its role and its exact endpoint',async()=>{
 const access=grant('ND-845001');assert.equal(await hasSnapshotCache(endpoint,access.self.playerId),false);
 await persistSnapshotCache(endpoint,access,fixture(access));
 assert.equal(await hasSnapshotCache(endpoint,' nd-845001 '),true);
 assert.equal(await hasSnapshotCache(endpoint,'ND-845002'),false);
 assert.equal(await hasSnapshotCache(endpoint+'other','ND-845001'),false);
 assert.equal(await hasSnapshotCache(endpoint,''),false);
 const target=endpoint.replace('/exec','_HINT_ROLE/exec'),wrongRole={...grant('ADMIN'),self:{playerId:'ADMIN',role:'player' as const}};
 await persistSnapshotCache(target,wrongRole,fixture(wrongRole));assert.equal(await hasSnapshotCache(target,'admin'),false);
 const admin={...grant('ADMIN'),self:{playerId:'ADMIN',role:'admin' as const}};
 await persistSnapshotCache(target,admin,fixture(admin));assert.equal(await hasSnapshotCache(target,' admin '),true);
});

test('the pre-login hint rejects invalid encrypted-file metadata and expired entries without using a grant',async()=>{
 const access=grant('ND-845003');await persistSnapshotCache(endpoint,access,fixture(access));
 const original=(await stored()).find(row=>row.scope===access.scope);assert.ok(original);
 const expired=Date.now()-SNAPSHOT_CACHE_TTL_MS-1000;
 for(const change of [{v:2},{scope:''},{scope:'!'.repeat(43)},{savedAt:Date.now()+60000,expiresAt:Date.now()+60000+SNAPSHOT_CACHE_TTL_MS},{savedAt:expired,expiresAt:expired+SNAPSHOT_CACHE_TTL_MS},{expiresAt:original.expiresAt+1},{iv:new Uint8Array(11)},{ciphertext:new ArrayBuffer(15)},{ciphertext:new ArrayBuffer(SNAPSHOT_CACHE_MAX_BYTES+33)}]){
  await replace({...original,...change});assert.equal(await hasSnapshotCache(endpoint,access.self.playerId),false);
 }
 await replace(original);assert.equal(await hasSnapshotCache(endpoint,access.self.playerId),true);
});

test('a hint never derives a key or decrypts data, and a forged positive cannot open a cached snapshot',async t=>{
 const access=grant('ND-845004');await persistSnapshotCache(endpoint,access,fixture(access));
 const original=(await stored()).find(row=>row.scope===access.scope);assert.ok(original);
 const decrypt=t.mock.method(crypto.subtle,'decrypt',()=>{throw Error('A login hint must not decrypt');});
 const importKey=t.mock.method(crypto.subtle,'importKey',()=>{throw Error('A login hint must not import a key');});
 const deriveKey=t.mock.method(crypto.subtle,'deriveKey',()=>{throw Error('A login hint must not derive a key');});
 const hint=await hasSnapshotCache(endpoint,access.self.playerId);assert.equal(hint,true);assert.equal(typeof hint,'boolean');
 assert.equal(decrypt.mock.callCount(),0);assert.equal(importKey.mock.callCount(),0);assert.equal(deriveKey.mock.callCount(),0);
 t.mock.restoreAll();
 await replace({...original,ciphertext:new Uint8Array(original.ciphertext.byteLength).buffer});
 assert.equal(await hasSnapshotCache(endpoint,access.self.playerId),true,'An untrusted metadata hint is not proof of decryptability');
 assert.equal(await readSnapshotCache(endpoint,access),null,'The authenticated path still checks the ciphertext and returns no data');
 await replace(original);assert.ok(await readSnapshotCache(endpoint,access));
 assert.equal(await readSnapshotCache(endpoint,{...access,secret:'Z'.repeat(43)}),null);
});

test('hint lookup has a 50ms deadline and blocked storage cannot poison authenticated cache reads',async t=>{
 const access=grant('ND-845005');await persistSnapshotCache(endpoint,access,fixture(access));
 const original=globalThis.indexedDB,delays:number[]=[],nativeTimeout=globalThis.setTimeout;
 t.mock.method(globalThis,'setTimeout',((callback:()=>void,delay:number,...args:unknown[])=>{delays.push(delay);return nativeTimeout(callback,delay,...args);}) as typeof setTimeout);
 try{
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open:()=>({})}});
  assert.equal(await hasSnapshotCache(endpoint,access.self.playerId),false);
  assert.equal(SNAPSHOT_CACHE_HINT_TIMEOUT_MS,50);assert.ok(SNAPSHOT_CACHE_HINT_TIMEOUT_MS<=250);assert.deepEqual(delays,[50]);
 }finally{Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:original});t.mock.restoreAll();}
 assert.equal(await hasSnapshotCache(endpoint,access.self.playerId),true);assert.ok(await readSnapshotCache(endpoint,access));
});

test('aborting or changing sessions makes the hint false and a late database response is closed',async()=>{
 const original=globalThis.indexedDB;let request:any,opened!:()=>void;const waiting=new Promise<void>(resolve=>{opened=resolve;});
 try{
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open:()=>{request={};opened();return request;}}});
  const controller=new AbortController(),pending=hasSnapshotCache(endpoint,'ND-845006',()=>true,controller.signal);
  await waiting;controller.abort();assert.equal(await pending,false);
  let closed=0,reads=0;request.result={close:()=>{closed++;},objectStoreNames:{contains:()=>true},transaction:()=>{reads++;throw Error('Late response must not read');}};
  request.onsuccess();assert.equal(closed,1);assert.equal(reads,0);
  let current=true,secondRequest:any,secondOpened!:()=>void;const secondWaiting=new Promise<void>(resolve=>{secondOpened=resolve;});
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open:()=>{secondRequest={};secondOpened();return secondRequest;}}});
  const changed=hasSnapshotCache(endpoint,'ND-845006',()=>current);await secondWaiting;current=false;
  secondRequest.result={close:()=>{closed++;}};secondRequest.onsuccess();assert.equal(await changed,false);assert.equal(closed,2);
 }finally{Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:original});}
});

test('unsupported or absent storage returns no hint and does not create an empty pre-login cache',async()=>{
 const original=globalThis.indexedDB;
 try{
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:undefined});assert.equal(await hasSnapshotCache(endpoint,'ND-845007'),false);
  const fresh=new IDBFactory();Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:fresh});
  assert.equal(await hasSnapshotCache(endpoint,'ND-845007'),false);assert.deepEqual(await fresh.databases(),[]);
 }finally{Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:original});}
});
