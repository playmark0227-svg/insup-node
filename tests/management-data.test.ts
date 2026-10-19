import test from "node:test";
import assert from "node:assert/strict";
import { correctionRecords, cellInputValue, cellEditorValue, sortCandidateRecords, statusTone } from "../lib/management-data.ts";
import { assertSnapshot } from "../lib/sheets-client.ts";
import type { CandidateRecord, ManagementCell } from "../lib/sheets-client.ts";
const record=(id:string,owner:string,date:string):CandidateRecord=>({recordId:id,rowVersion:"v",row:2,playerId:owner,candidateName:"同じ候補者",source:"",values:[date,"会社",...Array(24).fill("")],formulaColumns:[]});
test("interview correction selects the counted person/day and excludes other owners and periods",()=>{
 const rows=[record("a","ND-001","2026-10-04"),record("b","ND-001","2026-10-04"),record("c","ND-001","2026-09-04"),record("d","ND-002","2026-10-04")];
 assert.equal(correctionRecords(rows,"ND-001","候補者面談","2026-10").length,1);
 assert.equal(correctionRecords(rows,"ND-001","候補者面談","all").length,2);
 rows[0].values[7]="2026-10-04";rows[1].values[7]="2026-10-04";
 assert.equal(correctionRecords(rows,"ND-001","提案","2026-10").length,2);
});
test("table numeric, percent, checkbox and empty inputs keep their underlying types",()=>{
 const c={column:1,value:.51,display:"51%",kind:"percent",options:[],readonly:false,note:""} as ManagementCell;
 assert.equal(cellEditorValue(c),"51");assert.equal(cellInputValue(c,"43"),.43);assert.equal(cellInputValue(c,""),"");
 assert.equal(cellInputValue({...c,kind:"number"},"2500"),2500);
 assert.equal(cellInputValue({...c,kind:"boolean"},"false"),false);
 assert.throws(()=>cellInputValue(c,"NaN"));
});
test("candidate details reject foreign records in a player snapshot",()=>{
 const s={self:{role:"player",playerId:"ND-001"},players:[{id:"ND-001",name:"本人",target:20}],activities:[],records:[record("x","ND-002","")],counts:{},syncedAt:"now",warnings:[],writesEnabled:true};
 assert.throws(()=>assertSnapshot(s));s.records[0].playerId="ND-001";assert.doesNotThrow(()=>assertSnapshot(s));
});
test('deleted candidate snapshots validate ownership and restore targets',()=>{
 const entry={changeId:'change-id',playerId:'ND-001',candidateName:'削除済み候補',deletedAt:'2026-10-14T00:00:00Z',companies:['会社'],recordCount:1};
 const s={self:{role:'player',playerId:'ND-001'},players:[{id:'ND-001',name:'本人',target:20}],activities:[],records:[],counts:{},syncedAt:'now',warnings:[],writesEnabled:true,deletionFeature:true,deletedCandidates:[entry]};
 assert.doesNotThrow(()=>assertSnapshot(s));entry.playerId='ND-002';assert.throws(()=>assertSnapshot(s));entry.playerId='ND-001';entry.recordCount=0;assert.throws(()=>assertSnapshot(s));
});

test("candidate interview ordering uses ISO interview dates, keeps undated rows last and preserves the input array",()=>{
 const rows=[record("undated","ND-001",""),record("old","ND-001","2026-09-30"),record("latest","ND-001","2026-10-20"),record("stopped","ND-001","停止"),record("middle","ND-001","2026-10-01")];
 rows.forEach((r,index)=>r.row=index+2);
 const original=rows.map(r=>r.recordId);
 assert.deepEqual(sortCandidateRecords(rows,"interview-desc").map(r=>r.recordId),["latest","middle","old","stopped","undated"]);
 assert.deepEqual(sortCandidateRecords(rows,"interview-asc").map(r=>r.recordId),["old","middle","latest","stopped","undated"]);
 assert.deepEqual(rows.map(r=>r.recordId),original);
});

test("candidate ordering handles equal interview dates deterministically and offers registration order",()=>{
 const rows=[record("b","ND-001","2026-10-20"),record("a","ND-001","2026-10-20"),record("later-row","ND-001","2026-10-20"),record("older-date","ND-001","2026-10-19")];
 rows[0].row=3;rows[1].row=3;rows[2].row=8;rows[3].row=12;
 for(const direction of ["interview-desc","interview-asc"] as const){
  const ids=sortCandidateRecords(rows,direction).map(r=>r.recordId);
  assert.deepEqual(ids.filter(id=>id!=="older-date"),["later-row","a","b"]);
 }
 assert.deepEqual(sortCandidateRecords(rows,"registration-desc").map(r=>r.recordId),["older-date","later-row","a","b"]);
 const blankRows=[record("first","ND-001",""),record("second","ND-001","停止")];
 assert.deepEqual(sortCandidateRecords(blankRows,"interview-desc").map(r=>r.recordId),["first","second"]);
});

test("progress colours distinguish each active stage and consistently close declined or abandoned cases",()=>{
 const pairs:Record<string,string>={
  "提案候補":"proposal-candidate","提案完了（面談日確定待ち）":"proposed",
  "面談確定(面談実施待ち）":"scheduled","面談実施（合否待ち）":"interviewed",
  "合格（シフト入力待ち）":"accepted","稼働予定日確定（稼働開始待ち）":"start-scheduled",
  "稼働開始":"started","案件枠埋まり":"filled","C面談リスケ":"scheduled",
  "提案なし":"closed","落選（面談後）":"closed","落選（面談前）":"closed",
  "辞退（音信不通）":"closed","辞退（他決）":"closed","辞退（本人希望）":"closed",
  "合格後離脱":"closed","稼働後離脱":"closed","C面談ブッチ":"closed",
 };
 for(const [status,tone] of Object.entries(pairs))assert.equal(statusTone(status),tone,status);
 assert.equal(statusTone(" 合格 （ シフト入力待ち ） "),"accepted");
 assert.equal(statusTone("未確認の状態"),"neutral");assert.equal(statusTone(""),"neutral");
});
