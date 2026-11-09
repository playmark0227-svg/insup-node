/** An authenticated, short-lived key grant, never a reusable login credential. */
export type SnapshotCacheAccess={version:1;self:{playerId:string;role:'admin'|'player'};scope:string;secret:string;expiresAt:number};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validSnapshotCacheAccess(value:unknown,now=Date.now()):value is SnapshotCacheAccess {
 if(!object(value)||value.version!==1||!object(value.self)||typeof value.self.playerId!=='string'||!value.self.playerId||!['admin','player'].includes(String(value.self.role))||typeof value.scope!=='string'||typeof value.secret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value.scope)||!/^[A-Za-z0-9_-]{43}$/.test(value.secret)||!Number.isSafeInteger(value.expiresAt))return false;
 return Number(value.expiresAt)>now&&Number(value.expiresAt)<=now+65*60*1000;
}
