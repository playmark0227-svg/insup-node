import type { SheetSnapshot } from "./sheets-client.ts";
/** Encrypted, transactional outbox on this device. Never stores passwords or session tokens. */
export type PendingSave = {
  operationId: string; action: string; payload: unknown; label: string; details: string[];
  createdAt: number; attempted: boolean;
};
type EncryptedSave = { id: string; scope: string; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer };
const databaseName = "insup.node.pending-saves.v1";
let opened: Promise<IDBDatabase> | undefined;
const storageError = () => new Error("この端末に入力を保存できませんでした。入力は画面に残っています。ブラウザの保存容量・設定を確認してください。");

function database(): Promise<IDBDatabase> {
  if (opened) return opened;
  opened = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) { reject(storageError()); return; }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("keys");
      request.result.createObjectStore("saves", { keyPath: "id" }).createIndex("scope", "scope");
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
async function encryptionKey(db: IDBDatabase, scope: string): Promise<CryptoKey> {
  const read = db.transaction("keys", "readonly"), readDone = completed(read);
  const [existing] = await Promise.all([result<CryptoKey | undefined>(read.objectStore("keys").get(scope)), readDone]);
  if (existing) return existing;
  const generated = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  // A competing tab may have created the account key while generation awaited.
  const tx = db.transaction("keys", "readwrite"), done = completed(tx), store = tx.objectStore("keys");
  const chosen = new Promise<CryptoKey>((resolve, reject) => {
    const request = store.get(scope);
    request.onerror = () => reject(storageError());
    request.onsuccess = () => {
      const found = request.result as CryptoKey | undefined;
      if (!found) store.put(generated, scope);
      resolve(found || generated);
    };
  });
  const [key] = await Promise.all([chosen, done]); return key;
}
function validate(save: PendingSave): void {
  if (!save || !/^[A-Za-z0-9_-]{16,128}$/.test(save.operationId) || typeof save.action !== "string" ||
      typeof save.label !== "string" || !Array.isArray(save.details) || save.details.some(value => typeof value !== "string") ||
      !Number.isFinite(save.createdAt) || typeof save.attempted !== "boolean" || !save.payload || typeof save.payload !== "object" ||
      JSON.stringify(save.payload).length > 32768) throw storageError();
}
export async function persistPendingSave(endpoint: string, account: string, save: PendingSave): Promise<void> {
  validate(save);
  const db = await database(), scope = await scopeFor(endpoint, account), key = await encryptionKey(db, scope);
  const id = `${scope}:${save.operationId}`, iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) }, key, new TextEncoder().encode(JSON.stringify(save)));
  const tx = db.transaction("saves", "readwrite"), done = completed(tx);
  tx.objectStore("saves").put({ id, scope, iv, ciphertext } satisfies EncryptedSave);
  await done; // Resolve only after the transaction commits, never on request success.
}
export async function readPendingSaves(endpoint: string, account: string): Promise<PendingSave[]> {
  const db = await database(), scope = await scopeFor(endpoint, account);
  const tx = db.transaction("saves", "readonly"), done = completed(tx);
  const [rows] = await Promise.all([result<EncryptedSave[]>(tx.objectStore("saves").index("scope").getAll(scope)), done]);
  if (!rows.length) return [];
  const key = await encryptionKey(db, scope), saves: PendingSave[] = [];
  try {
    for (const row of rows) {
      if (row.scope !== scope || !row.id.startsWith(`${scope}:`)) throw storageError();
      const body = await crypto.subtle.decrypt({ name: "AES-GCM", iv: row.iv, additionalData: new TextEncoder().encode(row.id) }, key, row.ciphertext);
      const save: PendingSave = JSON.parse(new TextDecoder().decode(body)); validate(save);
      if (row.id !== `${scope}:${save.operationId}`) throw storageError();
      saves.push(save);
    }
  } catch { throw new Error("端末に残っている未同期の入力を確認できませんでした。ブラウザのデータを消さずに管理者へ確認してください。"); }
  return saves.sort((left, right) => left.createdAt - right.createdAt || left.operationId.localeCompare(right.operationId));
}
export async function removePendingSave(endpoint: string, account: string, operationId: string): Promise<void> {
  const db = await database(), scope = await scopeFor(endpoint, account);
  const tx = db.transaction("saves", "readwrite"), done = completed(tx);
  tx.objectStore("saves").delete(`${scope}:${operationId}`); await done;
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
