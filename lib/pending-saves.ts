import type { SheetSnapshot } from "./sheets-client.ts";
/** Encrypted, transactional outbox on this device. Never stores passwords or session tokens.
 * The AES key is derived from a per-account secret the server returns only to a
 * signed-in session, plus a random local salt. The browser profile alone cannot
 * decrypt drafts after the session ends, and drafts expire after PENDING_SAVE_TTL_MS. */
export type PendingSave = {
  operationId: string; action: string; payload: unknown; label: string; details: string[];
  createdAt: number; attempted: boolean;
};
export const PENDING_SAVE_TTL_MS = 72 * 60 * 60 * 1000;
type EncryptedSave = { id: string; scope: string; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer; v?: 2; expiresAt?: number };
const databaseName = "insup.node.pending-saves.v1";
const saltPrefix = "salt:";
let opened: Promise<IDBDatabase> | undefined;
const secrets = new Map<string, string>();
const derived = new Map<string, Promise<CryptoKey>>();
const storageError = () => new Error("この端末に入力を保存できませんでした。入力は画面に残っています。ブラウザの保存容量・設定を確認してください。");
const lockedError = () => new Error("端末の未同期の入力を開くにはログインが必要です。");

function database(): Promise<IDBDatabase> {
  if (opened) return opened;
  opened = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) { reject(storageError()); return; }
    // The v2 upgrade closes deployed v1 tabs before legacy keys can be removed.
    // Their in-flight encryption then cannot commit, and they cannot reopen v1.
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
      if (!db.objectStoreNames.contains("saves")) db.createObjectStore("saves", { keyPath: "id" }).createIndex("scope", "scope");
    };
    request.onerror = request.onblocked = () => reject(storageError());
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opened = undefined; };
      resolve(db);
    };
  }).catch(error => { opened = undefined; throw error; });
  return opened!;
}
function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(storageError());
  });
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(storageError()); });
}
async function scopeFor(endpoint: string, account: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${endpoint}|${account}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Hold the server-issued account secret in memory for this signed-in session only. */
export function unlockPendingSaves(endpoint: string, account: string, secret: unknown): void {
  if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error("端末の一時保存を使うにはGoogle側の連携コードの更新が必要です。管理者に連絡してください。");
  secrets.set(`${endpoint}|${account}`, secret);
}
/** Forget every secret and derived key, e.g. on logout or session expiry. */
export function lockPendingSaves(): void { secrets.clear(); derived.clear(); }

async function localSalt(db: IDBDatabase, scope: string): Promise<Uint8Array<ArrayBuffer>> {
  const read = db.transaction("keys", "readonly"), readDone = completed(read);
  const [existing] = await Promise.all([result<Uint8Array<ArrayBuffer> | undefined>(read.objectStore("keys").get(saltPrefix + scope)), readDone]);
  if (existing) return existing;
  const generated = crypto.getRandomValues(new Uint8Array(32));
  // A competing tab may have created the salt while this one generated its own.
  const tx = db.transaction("keys", "readwrite"), done = completed(tx), store = tx.objectStore("keys");
  const chosen = new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    const request = store.get(saltPrefix + scope);
    request.onerror = () => reject(storageError());
    request.onsuccess = () => {
      const found = request.result as Uint8Array<ArrayBuffer> | undefined;
      if (!found) store.put(generated, saltPrefix + scope);
      resolve(found || generated);
    };
  });
  const [salt] = await Promise.all([chosen, done]); return salt;
}
async function encryptionKey(db: IDBDatabase, endpoint: string, account: string, scope: string): Promise<CryptoKey> {
  const secret = secrets.get(`${endpoint}|${account}`);
  if (!secret) throw lockedError();
  const cacheKey = `${scope}|${secret}`;
  let key = derived.get(cacheKey);
  if (!key) {
    key = (async () => {
      const salt = await localSalt(db, scope);
      const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
      return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(`insup-node-outbox-v2|${scope}`) },
        material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    })();
    derived.set(cacheKey, key);
    key.catch(() => derived.delete(cacheKey));
  }
  return key;
}
/** Version 1 rows were encrypted with a key stored beside them. Read only to migrate or expire them. */
async function legacyKey(db: IDBDatabase, scope: string): Promise<CryptoKey | undefined> {
  const tx = db.transaction("keys", "readonly"), done = completed(tx);
  const [key] = await Promise.all([result<unknown>(tx.objectStore("keys").get(scope)), done]);
  return key && typeof key === "object" && "algorithm" in (key as object) ? key as CryptoKey : undefined;
}
function validate(save: PendingSave): void {
  if (!save || !/^[A-Za-z0-9_-]{16,128}$/.test(save.operationId) || typeof save.action !== "string" ||
      typeof save.label !== "string" || !Array.isArray(save.details) || save.details.some(value => typeof value !== "string") ||
      !Number.isFinite(save.createdAt) || typeof save.attempted !== "boolean" || !save.payload || typeof save.payload !== "object" ||
      JSON.stringify(save.payload).length > 32768) throw storageError();
}
async function sealed(key: CryptoKey, scope: string, save: PendingSave): Promise<EncryptedSave> {
  const id = `${scope}:${save.operationId}`, iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) }, key, new TextEncoder().encode(JSON.stringify(save)));
  return { id, scope, iv, ciphertext, v: 2, expiresAt: save.createdAt + PENDING_SAVE_TTL_MS };
}
async function unseal(key: CryptoKey, row: EncryptedSave): Promise<PendingSave> {
  const body = await crypto.subtle.decrypt({ name: "AES-GCM", iv: row.iv, additionalData: new TextEncoder().encode(row.id) }, key, row.ciphertext);
  const save: PendingSave = JSON.parse(new TextDecoder().decode(body)); validate(save);
  return save;
}
export async function persistPendingSave(endpoint: string, account: string, save: PendingSave): Promise<void> {
  validate(save);
  const db = await database(), scope = await scopeFor(endpoint, account), key = await encryptionKey(db, endpoint, account, scope);
  const row = await sealed(key, scope, save);
  const tx = db.transaction("saves", "readwrite"), done = completed(tx);
  tx.objectStore("saves").put(row);
  await done; // Resolve only after the transaction commits, never on request success.
}
export async function readPendingSaves(endpoint: string, account: string): Promise<PendingSave[]> {
  const db = await database(), scope = await scopeFor(endpoint, account), now = Date.now();
  const tx = db.transaction("saves", "readonly"), done = completed(tx);
  const [rows] = await Promise.all([result<EncryptedSave[]>(tx.objectStore("saves").index("scope").getAll(scope)), done]);
  if (!rows.length) return [];
  const key = await encryptionKey(db, endpoint, account, scope), saves: PendingSave[] = [], expired: string[] = [], migrated: EncryptedSave[] = [];
  try {
    const legacy = rows.some(row => row.v !== 2) ? await legacyKey(db, scope) : undefined;
    for (const row of rows) {
      if (row.scope !== scope || !row.id.startsWith(`${scope}:`)) throw storageError();
      if (row.v === 2 && typeof row.expiresAt === "number" && row.expiresAt <= now) { expired.push(row.id); continue; }
      if (row.v !== 2 && !legacy) throw storageError();
      const save = await unseal(row.v === 2 ? key : legacy!, row);
      if (row.id !== `${scope}:${save.operationId}`) throw storageError();
      if (save.createdAt + PENDING_SAVE_TTL_MS <= now) { expired.push(row.id); continue; }
      if (row.v !== 2) migrated.push(await sealed(key, scope, save));
      saves.push(save);
    }
  } catch { throw new Error("端末に残っている未同期の入力を確認できませんでした。ブラウザのデータを消さずに管理者へ確認してください。"); }
  if (expired.length || migrated.length) {
    const write = db.transaction(["saves", "keys"], "readwrite"), written = completed(write), store = write.objectStore("saves");
    expired.forEach(id => store.delete(id)); migrated.forEach(row => store.put(row));
    if (rows.every(row => row.v === 2 || migrated.some(next => next.id === row.id) || expired.includes(row.id))) write.objectStore("keys").delete(scope);
    await written;
  }
  return saves.sort((left, right) => left.createdAt - right.createdAt || left.operationId.localeCompare(right.operationId));
}
/** Delete every expired draft on this device, for all accounts, without signing in. */
export async function purgeExpiredPendingSaves(now = Date.now()): Promise<number> {
  const db = await database();
  const read = db.transaction("saves", "readonly"), readDone = completed(read);
  const [rows] = await Promise.all([result<EncryptedSave[]>(read.objectStore("saves").getAll()), readDone]);
  const expired: string[] = [];
  for (const row of rows) {
    if (row.v === 2) { if (typeof row.expiresAt !== "number" || row.expiresAt <= now) expired.push(row.id); continue; }
    const legacy = await legacyKey(db, row.scope);
    try { const save = legacy ? await unseal(legacy, row) : null; if (!save || save.createdAt + PENDING_SAVE_TTL_MS <= now) expired.push(row.id); }
    catch { expired.push(row.id); }
  }
  const remainingScopes = new Set(rows.filter(row => !expired.includes(row.id)).map(row => row.scope));
  const tx = db.transaction(["saves", "keys"], "readwrite"), done = completed(tx), keys = tx.objectStore("keys");
  expired.forEach(id => tx.objectStore("saves").delete(id));
  const keyNames = await result<IDBValidKey[]>(keys.getAllKeys());
  // A different tab may still hold a key derived from this salt, even when this
  // scope has no queued rows. Keep public salts stable so that tab's next draft
  // remains decryptable after reload; only obsolete legacy keys are removed.
  keyNames.forEach(name => { const scope = String(name); if (!scope.startsWith(saltPrefix) && !remainingScopes.has(scope)) keys.delete(name); });
  await done;
  return expired.length;
}
export async function removePendingSave(endpoint: string, account: string, operationId: string): Promise<void> {
  const db = await database(), scope = await scopeFor(endpoint, account);
  const tx = db.transaction("saves", "readwrite"), done = completed(tx);
  tx.objectStore("saves").delete(`${scope}:${operationId}`); await done;
}

/** Replace a rejected draft atomically: a failed local commit must retain the old input. */
export async function replacePendingSave(endpoint:string,account:string,operationId:string,save:PendingSave):Promise<void> {
  validate(save);
  if(save.operationId===operationId||save.attempted)throw storageError();
  const db=await database(),scope=await scopeFor(endpoint,account),key=await encryptionKey(db,endpoint,account,scope);
  const row=await sealed(key,scope,save);
  const tx=db.transaction("saves","readwrite"),done=completed(tx),store=tx.objectStore("saves");
  const old=store.get(`${scope}:${operationId}`);
  old.onsuccess=()=>{if(!old.result){tx.abort();return;}store.add(row);store.delete(`${scope}:${operationId}`);};
  await done;
}

/** Block overlapping edits until their server revisions arrive. Never silently rebase a draft. */
export function pendingSaveResources(action: string, payload: unknown, snapshot: SheetSnapshot): string[] {
  const data = payload as Record<string, unknown>;
  if (action === "restoreChange") return ["*"];
  if (action === "saveManagementRow") return [`management:${data.sheetId}:${data.row}`];
  if (action === "saveClient") return [`client:${data.id || String(data.name || "").trim().toLocaleLowerCase()}`];
  const body = (action === "saveActivity" ? data.activity : action === "updateProfile" ? data.player : data) as Record<string, unknown>;
  if (!body || typeof body !== "object") return [];
  if (action === "updateProfile") return [`player:${body.id}`];
  const ids = [body.recordId, ...(Array.isArray(data.targets) ? data.targets.map(target => (target as {recordId?:string})?.recordId) : [])].filter((id): id is string => typeof id === "string");
  const resources = ids.map(id => `record:${id}`);
  for (const id of ids) {
    const record = snapshot.records?.find(record => record.recordId === id);
    if (record) resources.push(`candidate:${record.playerId}:${record.candidateName.replace(/\s/g, "")}`);
    const profile = snapshot.candidateProfiles?.find(profile => profile.recordIds.includes(id));
    if (profile) resources.push(`profile:${profile.profileId}`);
  }
  if (typeof body.candidateName === "string") resources.push(`candidate:${body.playerId || snapshot.self.playerId}:${body.candidateName.replace(/\s/g, "")}`);
  return [...new Set(resources)];
}
