import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { persistPendingSave, readPendingSaves, removePendingSave, replacePendingSave, pendingSaveResources, unlockPendingSaves, lockPendingSaves, purgeExpiredPendingSaves, PENDING_SAVE_TTL_MS, type PendingSave } from "../lib/pending-saves.ts";
import type { SheetSnapshot } from "../lib/sheets-client.ts";
const endpoint = "https://script.google.com/macros/s/TEST_OUTBOX_ENDPOINT_123456/exec";
const input = (): PendingSave => ({operationId:randomUUID(),action:"updateRecord",label:"秘密の候補者の変更",details:["メモ：非公開の原文"],payload:{recordId:"ROW-one",changes:{13:"非公開の原文"}},createdAt:Date.now(),attempted:false});
const read = <T>(request: IDBRequest<T>):Promise<T> => new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const open = async () => await read(indexedDB.open("insup.node.pending-saves.v1",2));
const secret = "A".repeat(43), otherSecret = "B".repeat(43);
const unlocked = (account: string, module = { unlockPendingSaves }) => { module.unlockPendingSaves(endpoint, account, secret); module.unlockPendingSaves(endpoint + "other", account, secret); module.unlockPendingSaves(endpoint, `${account}-other`, secret); return account; };

test("the durable transaction stores encrypted payloads, a salt and no usable key or credentials", async () => {
  const account=unlocked(randomUUID()),save=input(); await persistPendingSave(endpoint,account,save);
  assert.deepEqual(await readPendingSaves(endpoint,account),[save]);
  const db=await open(),rows=await read(db.transaction("saves").objectStore("saves").getAll());
  const raw=rows.find(row=>row.id.endsWith(save.operationId)); assert.ok(raw);
  assert.equal(raw.iv.length,12); assert.ok(raw.ciphertext instanceof ArrayBuffer);
  assert.doesNotMatch(JSON.stringify(raw),/秘密|非公開|session|token|password|updateRecord/);
  assert.equal(raw.v,2); assert.equal(raw.expiresAt,save.createdAt+PENDING_SAVE_TTL_MS);
  assert.equal(await read(db.transaction("keys").objectStore("keys").get(raw.scope)),undefined,"No usable key is stored beside the ciphertext");
  const salt=await read(db.transaction("keys").objectStore("keys").get(`salt:${raw.scope}`)); assert.ok(salt instanceof Uint8Array && salt.length===32); db.close();
  await removePendingSave(endpoint,account,save.operationId); assert.deepEqual(await readPendingSaves(endpoint,account),[]);
});

test("pending inputs survive module restart and remain scoped to endpoint and authenticated account", async () => {
  const account=unlocked(randomUUID()),save=input(),other=input();
  await persistPendingSave(endpoint,account,save); await persistPendingSave(endpoint,`${account}-other`,other);
  const restarted=await import(`../lib/pending-saves.ts?restart=${randomUUID()}`);
  await assert.rejects(restarted.readPendingSaves(endpoint,account),/ログインが必要/,"A restarted page cannot read drafts before signing in");
  unlocked(account,restarted);
  assert.deepEqual(await restarted.readPendingSaves(endpoint,account),[save]);
  assert.deepEqual(await restarted.readPendingSaves(endpoint+"other",account),[]);
  await restarted.removePendingSave(endpoint,account,save.operationId);
  assert.deepEqual(await readPendingSaves(endpoint,account),[]); assert.deepEqual(await readPendingSaves(endpoint,`${account}-other`),[other]);
});

test("tampered ciphertext fails closed and does not expose the original private input in the error", async () => {
  const account=unlocked(randomUUID()),save=input();await persistPendingSave(endpoint,account,save);
  const db=await open(),rows=await read(db.transaction("saves").objectStore("saves").getAll()),raw=rows.find(row=>row.id.endsWith(save.operationId));
  const bytes=new Uint8Array(raw.ciphertext);bytes[0]^=1;
  const tx=db.transaction("saves","readwrite"),done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
  tx.objectStore("saves").put({...raw,ciphertext:bytes.buffer});await done;db.close();
  await assert.rejects(readPendingSaves(endpoint,account),error=>error instanceof Error&&!/秘密|非公開/.test(error.message));
});

test("invalid local inputs are rejected before being accepted as durable saves", async () => {
  const account=unlocked(randomUUID());
  for(const change of [{operationId:"short"},{payload:null},{payload:{value:"x".repeat(32769)}},{attempted:"yes"}]) {
    await assert.rejects(persistPendingSave(endpoint,account,{...input(),...change} as PendingSave));
  }
  assert.deepEqual(await readPendingSaves(endpoint,account),[]);
});

test("related records and shared profiles are reserved together while independent candidates remain writable", () => {
  const snapshot={self:{playerId:"ND-001",role:"player"},records:[{recordId:"one",playerId:"ND-001",candidateName:"候補者一"},{recordId:"two",playerId:"ND-001",candidateName:"候補者一"},{recordId:"other",playerId:"ND-001",candidateName:"候補者二"}],candidateProfiles:[{profileId:"shared",recordIds:["one","two"]}]} as SheetSnapshot;
  const first=pendingSaveResources("saveCandidateProfile",{recordId:"one"},snapshot);
  assert.ok(pendingSaveResources("updateRecord",{recordId:"two"},snapshot).some(key=>first.includes(key)));
  assert.ok(!pendingSaveResources("updateRecord",{recordId:"other"},snapshot).some(key=>first.includes(key)));
  assert.deepEqual(pendingSaveResources("restoreChange",{},snapshot),["*"]);
});


test("replacing a rejected save commits the new ciphertext and removes the old one together",async()=>{
 const account=unlocked(randomUUID()),old=input(),next={...old,operationId:randomUUID(),payload:{...old.payload as object,changes:{13:"修正した原文"}}};
 await persistPendingSave(endpoint,account,old);await replacePendingSave(endpoint,account,old.operationId,next);
 assert.deepEqual(await readPendingSaves(endpoint,account),[next]);
 await assert.rejects(replacePendingSave(endpoint,account,old.operationId,{...next,operationId:randomUUID()}));
 assert.deepEqual(await readPendingSaves(endpoint,account),[next]);
});

test("an aborted replacement preserves both the original input and the existing new-ID entry",async()=>{
 const account=unlocked(randomUUID()),old=input(),existing=input();await persistPendingSave(endpoint,account,old);await persistPendingSave(endpoint,account,existing);
 await assert.rejects(replacePendingSave(endpoint,account,old.operationId,{...existing,payload:{changes:{13:"must not overwrite"}}}));
 const rows=await readPendingSaves(endpoint,account);assert.equal(rows.length,2);assert.deepEqual(rows.find(row=>row.operationId===old.operationId),old);assert.deepEqual(rows.find(row=>row.operationId===existing.operationId),existing);
});

test("drafts cannot be decrypted after logout or with another account secret", async () => {
  const account=unlocked(randomUUID()),save=input();await persistPendingSave(endpoint,account,save);
  lockPendingSaves();
  await assert.rejects(readPendingSaves(endpoint,account),/ログインが必要/);
  await assert.rejects(persistPendingSave(endpoint,account,input()),/ログインが必要/);
  unlockPendingSaves(endpoint,account,otherSecret);
  await assert.rejects(readPendingSaves(endpoint,account),error=>error instanceof Error&&!/秘密|非公開/.test(error.message));
  unlockPendingSaves(endpoint,account,secret);
  assert.deepEqual(await readPendingSaves(endpoint,account),[save]);
  assert.throws(()=>unlockPendingSaves(endpoint,account,undefined),/Google側/);
});

test("expired drafts are removed on read and by the sign-in-free purge", async () => {
  const account=unlocked(randomUUID()),old={...input(),createdAt:Date.now()-PENDING_SAVE_TTL_MS-1000},fresh=input();
  await persistPendingSave(endpoint,account,old);await persistPendingSave(endpoint,account,fresh);
  assert.deepEqual(await readPendingSaves(endpoint,account),[fresh]);
  const other=unlocked(randomUUID()),stale={...input(),createdAt:Date.now()-PENDING_SAVE_TTL_MS-1000};await persistPendingSave(endpoint,other,stale);
  lockPendingSaves();
  assert.ok(await purgeExpiredPendingSaves()>=1);
  const db=await open(),rows=await read(db.transaction("saves").objectStore("saves").getAll());db.close();
  assert.ok(!rows.some(row=>row.id.endsWith(stale.operationId)));assert.ok(rows.some(row=>row.id.endsWith(fresh.operationId)));
});

test("another tab's startup purge preserves the salt of an active tab with an empty queue", async () => {
  const account=unlocked(randomUUID()),synced=input(),next=input();
  await persistPendingSave(endpoint,account,synced);
  await removePendingSave(endpoint,account,synced.operationId);
  // Module instances model separate tabs: the active one retains its derived
  // key while a newly opened, signed-out tab purges the shared browser database.
  const otherTab=await import(`../lib/pending-saves.ts?purger=${randomUUID()}`);
  await otherTab.purgeExpiredPendingSaves();
  await persistPendingSave(endpoint,account,next);
  const reloadedTab=await import(`../lib/pending-saves.ts?reload=${randomUUID()}`);
  unlocked(account,reloadedTab);
  assert.deepEqual(await reloadedTab.readPendingSaves(endpoint,account),[next]);
});

test("version 1 drafts are migrated to the server-bound key and the stored legacy key is removed", async () => {
  const account=unlocked(randomUUID()),save=input();
  const scopeBytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${endpoint}|${account}`));
  const scope=Array.from(new Uint8Array(scopeBytes),b=>b.toString(16).padStart(2,"0")).join(""),id=`${scope}:${save.operationId}`;
  const legacy=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]),iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(id)},legacy,new TextEncoder().encode(JSON.stringify(save)));
  let db=await open();const tx=db.transaction(["keys","saves"],"readwrite"),done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
  tx.objectStore("keys").put(legacy,scope);tx.objectStore("saves").put({id,scope,iv,ciphertext});await done;db.close();
  assert.deepEqual(await readPendingSaves(endpoint,account),[save]);
  db=await open();const raw=await read(db.transaction("saves").objectStore("saves").get(id)),key=await read(db.transaction("keys").objectStore("keys").get(scope));db.close();
  assert.equal(raw.v,2);assert.equal(key,undefined);
  assert.deepEqual(await readPendingSaves(endpoint,account),[save]);
});


// Deployed 3d67580 module through persistPendingSave, with only TypeScript types removed.
// Kept inline so shallow CI checkouts can reproduce the old tab without git or network access.
const deployedV1OutboxSource = `
const databaseName = "insup.node.pending-saves.v1";
let opened;
const storageError = ()=>new Error("この端末に入力を保存できませんでした。入力は画面に残っています。ブラウザの保存容量・設定を確認してください。");
function database() {
    if (opened) return opened;
    opened = new Promise((resolve, reject)=>{
        if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) {
            reject(storageError());
            return;
        }
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = ()=>{
            request.result.createObjectStore("keys");
            request.result.createObjectStore("saves", {
                keyPath: "id"
            }).createIndex("scope", "scope");
        };
        request.onerror = request.onblocked = ()=>reject(storageError());
        request.onsuccess = ()=>{
            const db = request.result;
            db.onversionchange = ()=>{
                db.close();
                opened = undefined;
            };
            resolve(db);
        };
    }).catch((error)=>{
        opened = undefined;
        throw error;
    });
    return opened;
}
function completed(tx) {
    return new Promise((resolve, reject)=>{
        tx.oncomplete = ()=>resolve();
        tx.onerror = tx.onabort = ()=>reject(storageError());
    });
}
function result(request) {
    return new Promise((resolve, reject)=>{
        request.onsuccess = ()=>resolve(request.result);
        request.onerror = ()=>reject(storageError());
    });
}
async function scopeFor(endpoint, account) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(\`\${endpoint}|\${account}\`));
    return Array.from(new Uint8Array(digest), (byte)=>byte.toString(16).padStart(2, "0")).join("");
}
async function encryptionKey(db, scope) {
    const read = db.transaction("keys", "readonly"), readDone = completed(read);
    const [existing] = await Promise.all([
        result(read.objectStore("keys").get(scope)),
        readDone
    ]);
    if (existing) return existing;
    const generated = await crypto.subtle.generateKey({
        name: "AES-GCM",
        length: 256
    }, false, [
        "encrypt",
        "decrypt"
    ]);
    const tx = db.transaction("keys", "readwrite"), done = completed(tx), store = tx.objectStore("keys");
    const chosen = new Promise((resolve, reject)=>{
        const request = store.get(scope);
        request.onerror = ()=>reject(storageError());
        request.onsuccess = ()=>{
            const found = request.result;
            if (!found) store.put(generated, scope);
            resolve(found || generated);
        };
    });
    const [key] = await Promise.all([
        chosen,
        done
    ]);
    return key;
}
function validate(save) {
    if (!save || !/^[A-Za-z0-9_-]{16,128}$/.test(save.operationId) || typeof save.action !== "string" || typeof save.label !== "string" || !Array.isArray(save.details) || save.details.some((value)=>typeof value !== "string") || !Number.isFinite(save.createdAt) || typeof save.attempted !== "boolean" || !save.payload || typeof save.payload !== "object" || JSON.stringify(save.payload).length > 32768) throw storageError();
}
export async function persistPendingSave(endpoint, account, save) {
    validate(save);
    const db = await database(), scope = await scopeFor(endpoint, account), key = await encryptionKey(db, scope);
    const id = \`\${scope}:\${save.operationId}\`, iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(id)
    }, key, new TextEncoder().encode(JSON.stringify(save)));
    const tx = db.transaction("saves", "readwrite"), done = completed(tx);
    tx.objectStore("saves").put({
        id,
        scope,
        iv,
        ciphertext
    });
    await done;
}
`;

test("the version 2 upgrade fences old tabs before legacy keys are migrated or removed", async () => {
  // A separate factory represents a browser that still has only the deployed v1 database.
  const originalIndexedDB = globalThis.indexedDB;
  const originalEncrypt = crypto.subtle.encrypt;
  globalThis.indexedDB = new IDBFactory();
  let releaseEncryption: (() => void) | undefined;
  let pending: Promise<void> | undefined;
  try {
    const oldTab = await import(`data:text/javascript;base64,${Buffer.from(deployedV1OutboxSource).toString("base64")}#${randomUUID()}`);
    const account = randomUUID(), queued = input(), inFlight = input();
    await oldTab.persistPendingSave(endpoint, account, queued);
    const oldDatabase = await read(indexedDB.open("insup.node.pending-saves.v1", 1));
    assert.equal(oldDatabase.version, 1);
    // This inspection handle also observes the real versionchange/close protocol.
    oldDatabase.onversionchange = () => oldDatabase.close();
    let reachedEncryption: () => void = () => {};
    const reached = new Promise<void>(resolve => { reachedEncryption = resolve; });
    const gate = new Promise<void>(resolve => { releaseEncryption = resolve; });
    crypto.subtle.encrypt = async function (algorithm, key, data) {
      const aes = algorithm as AesGcmParams;
      if (new TextDecoder().decode(aes.additionalData).endsWith(inFlight.operationId)) {
        reachedEncryption();
        await gate;
      }
      return originalEncrypt.call(this, algorithm, key, data);
    };
    // The old module has already read its usable legacy key, but has not opened
    // its save transaction. This is the destructive rollout race without v2.
    pending = oldTab.persistPendingSave(endpoint, account, inFlight);
    await reached;
    const newTab = await import(`../lib/pending-saves.ts?upgrade=${randomUUID()}`);
    unlocked(account, newTab);
    assert.deepEqual(await newTab.readPendingSaves(endpoint, account), [queued]);
    const db = await open();
    assert.equal(db.version, 2);
    const rows = await read(db.transaction("saves").objectStore("saves").getAll());
    const migrated = rows.find(row => row.id.endsWith(queued.operationId));
    assert.equal(migrated.v, 2, "An existing queued v1 draft migrates without losing its input");
    assert.equal(await read(db.transaction("keys").objectStore("keys").get(migrated.scope)), undefined);
    releaseEncryption();
    await assert.rejects(pending, "The old in-flight writer cannot commit with the deleted legacy key");
    assert.equal(await read(db.transaction("saves").objectStore("saves").get(`${migrated.scope}:${inFlight.operationId}`)), undefined);
    await assert.rejects(oldTab.persistPendingSave(endpoint, account, input()), /この端末に入力を保存できませんでした/,
      "The old module cannot reopen database version 1 after its connection closes");
    await assert.rejects(read(indexedDB.open("insup.node.pending-saves.v1", 1)), error => error instanceof Error && error.name === "VersionError");
    const reloadedTab = await import(`../lib/pending-saves.ts?afterUpgrade=${randomUUID()}`);
    unlocked(account, reloadedTab);
    assert.deepEqual(await reloadedTab.readPendingSaves(endpoint, account), [queued]);
    db.close();
  } finally {
    releaseEncryption?.();
    await pending?.catch(() => {});
    crypto.subtle.encrypt = originalEncrypt;
    globalThis.indexedDB = originalIndexedDB;
  }
});
