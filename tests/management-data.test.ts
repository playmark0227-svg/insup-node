import test from "node:test";
import assert from "node:assert/strict";
import { correctionRecords, cellInputValue, cellEditorValue } from "../lib/management-data.ts";
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
