import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { persistPendingSave, readPendingSaves, removePendingSave, pendingSaveResources, type PendingSave } from "../lib/pending-saves.ts";
import type { SheetSnapshot } from "../lib/sheets-client.ts";
const endpoint = "https://script.google.com/macros/s/TEST_OUTBOX_ENDPOINT_123456/exec";
const input = (): PendingSave => ({operationId:randomUUID(),action:"updateRecord",label:"秘密の候補者の変更",details:["メモ：非公開の原文"],payload:{recordId:"ROW-one",changes:{13:"非公開の原文"}},createdAt:Date.now(),attempted:false});
const read = <T>(request: IDBRequest<T>):Promise<T> => new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const open = async () => await read(indexedDB.open("insup.node.pending-saves.v1",1));

test("the durable transaction stores encrypted payloads and a non-exportable key without credentials", async () => {
  const account=randomUUID(),save=input(); await persistPendingSave(endpoint,account,save);
  assert.deepEqual(await readPendingSaves(endpoint,account),[save]);
  const db=await open(),rows=await read(db.transaction("saves").objectStore("saves").getAll());
  const raw=rows.find(row=>row.id.endsWith(save.operationId)); assert.ok(raw);
  assert.equal(raw.iv.length,12); assert.ok(raw.ciphertext instanceof ArrayBuffer);
  assert.doesNotMatch(JSON.stringify(raw),/秘密|非公開|session|token|password|updateRecord/);
  const key:CryptoKey=await read(db.transaction("keys").objectStore("keys").get(raw.scope));
  assert.equal(key.extractable,false); await assert.rejects(crypto.subtle.exportKey("raw",key)); db.close();
  await removePendingSave(endpoint,account,save.operationId); assert.deepEqual(await readPendingSaves(endpoint,account),[]);
});

test("pending inputs survive module restart and remain scoped to endpoint and authenticated account", async () => {
  const account=randomUUID(),save=input(),other=input();
  await persistPendingSave(endpoint,account,save); await persistPendingSave(endpoint,`${account}-other`,other);
  const restarted=await import(`../lib/pending-saves.ts?restart=${randomUUID()}`);
  assert.deepEqual(await restarted.readPendingSaves(endpoint,account),[save]);
  assert.deepEqual(await restarted.readPendingSaves(endpoint+"other",account),[]);
  await restarted.removePendingSave(endpoint,account,save.operationId);
  assert.deepEqual(await readPendingSaves(endpoint,account),[]); assert.deepEqual(await readPendingSaves(endpoint,`${account}-other`),[other]);
});

test("tampered ciphertext fails closed and does not expose the original private input in the error", async () => {
  const account=randomUUID(),save=input();await persistPendingSave(endpoint,account,save);
  const db=await open(),rows=await read(db.transaction("saves").objectStore("saves").getAll()),raw=rows.find(row=>row.id.endsWith(save.operationId));
  const bytes=new Uint8Array(raw.ciphertext);bytes[0]^=1;
  const tx=db.transaction("saves","readwrite"),done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
  tx.objectStore("saves").put({...raw,ciphertext:bytes.buffer});await done;db.close();
  await assert.rejects(readPendingSaves(endpoint,account),error=>error instanceof Error&&!/秘密|非公開/.test(error.message));
});

test("invalid local inputs are rejected before being accepted as durable saves", async () => {
  const account=randomUUID();
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
