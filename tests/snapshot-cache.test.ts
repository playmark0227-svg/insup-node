import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {blankInterviewFields} from '../lib/candidate-intake.ts';
import {persistSnapshotCache,readSnapshotCache,purgeSnapshotCache,projectSnapshotForCache,validSnapshotCacheAccess,SNAPSHOT_CACHE_TTL_MS,SNAPSHOT_CACHE_MAX_BYTES,type SnapshotCacheAccess} from '../lib/snapshot-cache.ts';
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
