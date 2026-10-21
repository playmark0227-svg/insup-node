import test from "node:test";
import assert from "node:assert/strict";
import { correctionFields,correctedPayload,mutationDateErrors,correctionFieldErrors } from "../lib/save-correction.ts";
import type { SheetSnapshot } from "../lib/sheets-client.ts";
const snapshot={self:{role:"player",playerId:"one"},players:[]} as unknown as SheetSnapshot;

test("quick correction exposes attempted values and preserves immutable revisions and private hidden input",()=>{
 const payload={recordId:"record-one",rowVersion:"immutable-revision",changes:{2:"元会社",10:"2026-10-27",17:"2026-10-28",13:"残すメモ"},privateField:{source:"hidden"}};
 const fields=correctionFields("updateRecord",payload,snapshot,"2026-10-21");assert.deepEqual(fields.map(field=>field.key),["2","10","13","17"]);
 assert.equal(fields.find(field=>field.key==="17")?.max,"2026-10-21");assert.equal(fields.find(field=>field.key==="10")?.max,undefined);
 assert.ok(!JSON.stringify(fields).includes("immutable-revision"));
 const corrected=correctedPayload("updateRecord",payload,{2:"修正会社",17:"2020-01-01"},snapshot) as typeof payload;
 assert.equal(corrected.rowVersion,payload.rowVersion);assert.deepEqual(corrected.privateField,payload.privateField);assert.equal(corrected.changes[10],payload.changes[10]);assert.equal(corrected.changes[13],payload.changes[13]);assert.equal(payload.changes[2],"元会社");
 assert.throws(()=>correctedPayload("updateRecord",payload,{rowVersion:"new"},snapshot),/修正項目/);
});

test("completed dates reject future and invalid calendar days, while planned dates remain allowed",()=>{
 const errors=mutationDateErrors("updateRecord",{changes:{1:"2026-10-22",8:"2026-02-30",10:"2027-01-01",18:"2027-01-01",23:"2027-01-01",25:"2027-01-01",24:"2026-10-21"}},"2026-10-21");
 assert.deepEqual(Object.keys(errors),["1","8"]);assert.match(errors["1"],/面談実施日/);
 assert.deepEqual(mutationDateErrors("saveActivity",{activity:{stage:"稼働開始予定",date:"2027-01-01"}},"2026-10-21"),{});
 assert.ok(mutationDateErrors("saveActivity",{activity:{stage:"稼働開始",date:"2027-01-01"}},"2026-10-21").date);
});

test("the editor highlights all invalid dates and updates the actual-date rule when the stage changes",()=>{
 const fields=correctionFields("saveActivity",{activity:{stage:"稼働開始予定",date:"2027-01-01",candidateName:"架空",interviewProfile:{fields:{notes:"private"}}}},snapshot,"2026-10-21"),draft={operationId:"one",fields};
 assert.deepEqual(correctionFieldErrors(draft,{stage:"稼働開始予定",date:"2027-01-01"},"2026-10-21"),{});
 assert.ok(correctionFieldErrors(draft,{stage:"稼働開始",date:"2027-01-01"},"2026-10-21").date);
 assert.ok(!JSON.stringify(fields).includes("private"));
});
