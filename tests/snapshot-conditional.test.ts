import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSnapshot,mergeSnapshotUnchanged,validSnapshotVersion,type SheetSnapshot} from '../lib/sheets-client.ts';
import {projectSnapshotForCache,type SnapshotCacheAccess} from '../lib/snapshot-cache.ts';

function fixture():SheetSnapshot {
 const self={playerId:'ND-001',role:'player' as const},cacheAccess:SnapshotCacheAccess={version:1,self,scope:'S'.repeat(43),secret:'K'.repeat(43),expiresAt:Date.now()+60*60*1000};
 return {self,storageBackend:{kind:'firestore',projectId:'insup-node-test',migratedAt:'2026-11-06T01:00:00.000Z'},snapshotVersion:'V'.repeat(43),cacheAccess,players:[{id:self.playerId,name:'架空担当',target:20}],activities:[],counts:{all:{[self.playerId]:{'提案':2}}},records:[{recordId:'fictional-record',rowVersion:'v1',row:2,playerId:self.playerId,candidateName:'端末保存しない架空候補者',source:'',values:Array(26).fill('原文はメモリのみ'),formulaColumns:[]}],outboxKey:'O'.repeat(43),syncedAt:'2026-11-06T02:00:00.000Z',warnings:[],writesEnabled:true};
}
function receipt(full:SheetSnapshot){return {snapshotUnchanged:true,snapshotVersion:full.snapshotVersion,self:{...full.self},syncedAt:'2026-11-06T02:01:00.000Z',cacheAccess:{...full.cacheAccess!,self:{...full.self},expiresAt:Date.now()+61*60*1000}};}

test('conditional stamps are optional for legacy data and valid only on a Firestore full snapshot',()=>{
 const full=fixture();assert.doesNotThrow(()=>assertSnapshot(full));
 for(const value of ['', 'x'.repeat(42),'x'.repeat(44),'+'.repeat(43),null,true,1])assert.throws(()=>assertSnapshot({...full,snapshotVersion:value}),{code:'INVALID_RESPONSE'});
 assert.throws(()=>assertSnapshot({...full,storageBackend:undefined}),{code:'INVALID_RESPONSE'});
 assert.doesNotThrow(()=>assertSnapshot({...full,storageBackend:undefined,snapshotVersion:undefined}));
 for(const value of [true,false,undefined])assert.throws(()=>assertSnapshot({...full,snapshotUnchanged:value}),{code:'INVALID_RESPONSE'});
 assert.equal(validSnapshotVersion('Ab0_-'.repeat(8)+'xyz'),true);
});

test('an unchanged response renews only timestamp and the same scoped grant while retaining exact private references',()=>{
 const full={...fixture(),activityDeferred:true},reply=receipt(full),next=mergeSnapshotUnchanged(reply,full);
 for(const key of ['self','storageBackend','players','activities','counts','records','warnings'] as const)assert.equal(next[key],full[key],key);
 assert.equal(next.outboxKey,full.outboxKey);assert.equal(next.writesEnabled,full.writesEnabled);assert.equal(next.snapshotVersion,full.snapshotVersion);
 assert.equal(next.cacheAccess,reply.cacheAccess);assert.equal(next.syncedAt,reply.syncedAt);assert.equal(next.activityDeferred,undefined);
 assert.equal(mergeSnapshotUnchanged({...reply,activityDeferred:true},full).activityDeferred,true);
 assert.equal(full.syncedAt,'2026-11-06T02:00:00.000Z');assert.equal(full.activityDeferred,true);
});

test('a conditional response cannot change self, stamp, cache scope or decryption key',()=>{
 const full=fixture(),reply=receipt(full);
 const invalids=[
  {...reply,snapshotVersion:'X'.repeat(43)},
  {...reply,self:{playerId:'ND-002',role:'player'}},
  {...reply,self:{playerId:full.self.playerId,role:'admin'}},
  {...reply,cacheAccess:{...reply.cacheAccess,scope:'X'.repeat(43)}},
  {...reply,cacheAccess:{...reply.cacheAccess,secret:'X'.repeat(43)}},
  {...reply,cacheAccess:{...reply.cacheAccess,self:{...full.self,role:'admin'}}},
  {...reply,cacheAccess:{...reply.cacheAccess,self:{...full.self,playerId:'ND-002'}}},
 ];
 for(const value of invalids)assert.throws(()=>mergeSnapshotUnchanged(value,full),{code:'INVALID_RESPONSE'});
 for(const current of [{...full,snapshotVersion:undefined},{...full,storageBackend:undefined},{...full,cacheAccess:undefined},{...full,cacheAccess:{...full.cacheAccess!,expiresAt:Date.now()-1}}])assert.throws(()=>mergeSnapshotUnchanged(reply,current),{code:'INVALID_RESPONSE'});
});

test('strict unchanged envelopes reject missing, expired, malformed and unsolicited business data',()=>{
 const full=fixture(),reply=receipt(full);
 for(const override of [
  {snapshotUnchanged:false},{snapshotUnchanged:'true'},{snapshotVersion:'bad'},{self:{...full.self,extra:true}},
  {syncedAt:'2026-02-31T02:01:00.000Z'},{syncedAt:'tomorrow'},{activityDeferred:false},
  {cacheAccess:undefined},{cacheAccess:{...reply.cacheAccess,expiresAt:Date.now()-1}},
  {cacheAccess:{...reply.cacheAccess,expiresAt:Date.now()+66*60*1000}},
  {cacheAccess:{...reply.cacheAccess,extra:'never accept'}},{cacheAccess:{...reply.cacheAccess,self:{...full.self,extra:true}}},
  {records:full.records},{outboxKey:'replacement'},{storageBackend:full.storageBackend},{counts:{all:{}}},
 ])assert.throws(()=>mergeSnapshotUnchanged({...reply,...override},full),{code:'INVALID_RESPONSE'});
 for(const value of [null,[],true,'response'])assert.throws(()=>mergeSnapshotUnchanged(value,full),{code:'INVALID_RESPONSE'});
});

test('display cache projection never retains a conditional stamp, grant or candidate details',()=>{
 const full=fixture(),projected=projectSnapshotForCache(full),text=JSON.stringify(projected);
 assert.equal(projected.snapshotVersion,undefined);assert.equal(projected.cacheAccess,undefined);assert.deepEqual(projected.records,[]);
 for(const value of ['snapshotVersion','cacheAccess',full.snapshotVersion!,full.cacheAccess!.secret,'端末保存しない架空候補者','原文はメモリのみ','outboxKey'])assert.ok(!text.includes(value),value);
 assert.throws(()=>mergeSnapshotUnchanged(receipt(full),projected),{code:'INVALID_RESPONSE'});
});
