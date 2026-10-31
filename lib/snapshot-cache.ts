import {assertSnapshot, type SheetSnapshot} from './sheets-client.ts';
import {stages} from './node-data.ts';

/** An authenticated, short-lived key grant, never a reusable login credential. */
export type SnapshotCacheAccess={version:1;self:{playerId:string;role:'admin'|'player'};scope:string;secret:string;expiresAt:number};
export const SNAPSHOT_CACHE_TTL_MS=7*24*60*60*1000;
export const SNAPSHOT_CACHE_MAX_BYTES=1_000_000;
export const SNAPSHOT_CACHE_READ_TIMEOUT_MS=250;
const DB_NAME='insup.node.display-cache.v1';
export const SNAPSHOT_CACHE_MAX_ACCOUNTS=20;
let opened:Promise<IDBDatabase>|undefined;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validSnapshotCacheAccess(value:unknown,now=Date.now()):value is SnapshotCacheAccess {
 if(!object(value)||value.version!==1||!object(value.self)||typeof value.self.playerId!=='string'||!value.self.playerId||!['admin','player'].includes(String(value.self.role))||typeof value.scope!=='string'||typeof value.secret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value.scope)||!/^[A-Za-z0-9_-]{43}$/.test(value.secret)||!Number.isSafeInteger(value.expiresAt))return false;
 return Number(value.expiresAt)>now&&Number(value.expiresAt)<=now+65*60*1000;
}
/** Only information already shared through team rankings is cached. No candidate details or keys. */
export function projectSnapshotForCache(value:unknown):SheetSnapshot {
 assertSnapshot(value);const source=value;
 const players=source.players.map(player=>({id:player.id,name:player.name,team:player.team||'',color:player.color||'blue',target:player.target,bio:'',sheetNames:[],...(player.active===undefined?{}:{active:player.active})}));
 const owners=new Set(players.map(player=>player.id)),metrics=new Set<string>([...stages,'紹介人数']);
 const counts:SheetSnapshot['counts']={};
 for(const [period,people] of Object.entries(source.counts)){
  if(period!=='all'&&!/^\d{4}-\d{2}(?:-\d{2})?$/.test(period))continue;
  counts[period]={};for(const [id,values] of Object.entries(people)){if(!owners.has(id))continue;counts[period][id]=Object.fromEntries(Object.entries(values).filter(([key])=>metrics.has(key)));}
 }
 const snapshot:SheetSnapshot={self:{playerId:source.self.playerId,role:source.self.role},players,activities:[],counts,syncedAt:source.syncedAt,warnings:[],writesEnabled:false,records:[],candidateProfiles:[],clients:[],interviewReviews:[],deletedCandidates:[],intakeFeature:false,writingFeature:false,deletionFeature:false,reviewFeature:false,securityFeature:false,workspaceFeature:false,operationsFeature:false,monthlyGoalsFeature:source.monthlyGoalsFeature===true,monthlyGoals:(source.monthlyGoals||[]).filter(goal=>source.self.role==='admin'||goal.playerId===source.self.playerId).map(goal=>({playerId:goal.playerId,month:goal.month,target:goal.target,version:goal.version,updatedAt:goal.updatedAt}))};
 assertSnapshot(snapshot);return snapshot;
}
function database():Promise<IDBDatabase>{
 if(opened)return opened;
 opened=new Promise<IDBDatabase>((resolve,reject)=>{
  if(typeof indexedDB==='undefined'||!globalThis.crypto?.subtle){reject(new Error('CACHE_UNAVAILABLE'));return;}
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('snapshots'))request.result.createObjectStore('snapshots',{keyPath:'id'});};
  request.onerror=request.onblocked=()=>reject(new Error('CACHE_UNAVAILABLE'));
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opened=undefined;};resolve(db);};
 }).catch(error=>{opened=undefined;throw error;});return opened!;
}
const result=<T,>(request:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('CACHE_UNAVAILABLE'));});
const complete=(tx:IDBTransaction)=>new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new Error('CACHE_UNAVAILABLE'));});
const bytes=(value:string)=>new TextEncoder().encode(value);
async function identity(endpoint:string,access:SnapshotCacheAccess):Promise<string>{const digest=await crypto.subtle.digest('SHA-256',bytes(`${endpoint}|${access.self.role}|${access.self.playerId}`));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
async function keyFor(id:string,access:SnapshotCacheAccess):Promise<CryptoKey>{
 const material=await crypto.subtle.importKey('raw',bytes(access.secret),'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:bytes(access.scope),info:bytes(`insup-node-display-cache-v1|${id}`)},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
type CachedRow={id:string;scope:string;v:1;savedAt:number;expiresAt:number;iv:Uint8Array<ArrayBuffer>;ciphertext:ArrayBuffer};
export async function persistSnapshotCache(endpoint:string,access:SnapshotCacheAccess,snapshot:SheetSnapshot,current=()=>true):Promise<void>{
 if(!validSnapshotCacheAccess(access)||!current()||snapshot.self.role!==access.self.role||snapshot.self.playerId!==access.self.playerId)return;
 const projected=projectSnapshotForCache(snapshot),body=JSON.stringify(projected);if(bytes(body).length>SNAPSHOT_CACHE_MAX_BYTES)return;
 const db=await database(),id=await identity(endpoint,access),key=await keyFor(id,access),savedAt=Date.now(),expiresAt=savedAt+SNAPSHOT_CACHE_TTL_MS,iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes(`${id}|${access.scope}|${savedAt}|${expiresAt}`)},key,bytes(body));
 if(!current()||!validSnapshotCacheAccess(access))return;
 const tx=db.transaction('snapshots','readwrite'),done=complete(tx),request=tx.objectStore('snapshots').put({id,scope:access.scope,v:1,savedAt,expiresAt,iv,ciphertext} satisfies CachedRow);
 request.onsuccess=()=>{if(!current())tx.abort();};await done;void purgeSnapshotCache();
}
async function readStoredSnapshot(endpoint:string,access:SnapshotCacheAccess,current:()=>boolean):Promise<{snapshot:SheetSnapshot;savedAt:number}|null>{
 if(!validSnapshotCacheAccess(access)||!current())return null;
 try{
  const db=await database(),id=await identity(endpoint,access),tx=db.transaction('snapshots','readonly'),done=complete(tx);
  const [row]=await Promise.all([result<CachedRow|undefined>(tx.objectStore('snapshots').get(id)),done]);
  if(!row||row.v!==1||row.scope!==access.scope||!Number.isSafeInteger(row.savedAt)||!Number.isSafeInteger(row.expiresAt)||row.savedAt>Date.now()||row.expiresAt<=Date.now()||row.expiresAt!==row.savedAt+SNAPSHOT_CACHE_TTL_MS||!(row.ciphertext instanceof ArrayBuffer)||row.ciphertext.byteLength>SNAPSHOT_CACHE_MAX_BYTES+32||!current())return null;
  const key=await keyFor(id,access),body=await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:bytes(`${id}|${access.scope}|${row.savedAt}|${row.expiresAt}`)},key,row.ciphertext);
  const snapshot=projectSnapshotForCache(JSON.parse(new TextDecoder().decode(body)));
  if(!current()||!validSnapshotCacheAccess(access)||snapshot.self.role!==access.self.role||snapshot.self.playerId!==access.self.playerId)return null;
  return {snapshot,savedAt:row.savedAt};
 }catch{return null;}
}
/** Optional storage is bounded independently from the required authenticated network read. */
export function readSnapshotCache(endpoint:string,access:SnapshotCacheAccess,current=()=>true,signal?:AbortSignal):Promise<{snapshot:SheetSnapshot;savedAt:number}|null>{
 return new Promise(resolve=>{
  let settled=false;
  const finish=(value:{snapshot:SheetSnapshot;savedAt:number}|null)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener("abort",aborted);resolve(!signal?.aborted&&current()?value:null);};
  const aborted=()=>finish(null),timer=setTimeout(()=>finish(null),SNAPSHOT_CACHE_READ_TIMEOUT_MS);
  signal?.addEventListener("abort",aborted,{once:true});if(signal?.aborted){finish(null);return;}
  void readStoredSnapshot(endpoint,access,()=>!settled&&!signal?.aborted&&current()).then(finish,()=>finish(null));
 });
}
export async function purgeSnapshotCache():Promise<void>{
 try{
  const db=await database(),tx=db.transaction('snapshots','readwrite'),done=complete(tx),store=tx.objectStore('snapshots'),request=store.openCursor(),kept:{id:string;savedAt:number}[]=[];
  request.onsuccess=()=>{
   const cursor=request.result;
   if(!cursor){kept.sort((a,b)=>b.savedAt-a.savedAt);for(const row of kept.slice(SNAPSHOT_CACHE_MAX_ACCOUNTS))store.delete(row.id);return;}
   const row=cursor.value as CachedRow;
   if(!row||typeof row.id!=='string'||!Number.isSafeInteger(row.savedAt)||!Number.isSafeInteger(row.expiresAt)||row.savedAt>Date.now()||row.expiresAt<=Date.now()||row.expiresAt!==row.savedAt+SNAPSHOT_CACHE_TTL_MS||!(row.ciphertext instanceof ArrayBuffer)||row.ciphertext.byteLength>SNAPSHOT_CACHE_MAX_BYTES+32)cursor.delete();
   else kept.push({id:row.id,savedAt:row.savedAt});cursor.continue();
  };
  await done;
 }catch{/* Optional display cache never prevents login. */}
}
