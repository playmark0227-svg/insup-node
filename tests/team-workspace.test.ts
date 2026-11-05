import test from "node:test";
import assert from "node:assert/strict";
import {parseTeamWorkspace,parseTeamWorkspaceExport,teamCommentsFor,type TeamWorkspaceData} from "../lib/team-workspace.ts";

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const time="2026-11-05T01:00:00.000Z";
const fixture=():TeamWorkspaceData=>({feature:true,players:[{id:"ND-001",name:"架空担当",role:"player"}],candidates:[{publicationId:id(1),ownerId:"ND-001",candidateName:"架空候補",introduction:"共有を確認した紹介文",published:true,version:id(2),createdAt:time,updatedAt:time,publishedAt:time,canManage:false}],jobs:[{jobId:id(3),company:"架空社",title:"法人営業",description:"法人向けの案内",requirements:"記載した条件",workConditions:"週3日",status:"open",version:id(4),createdBy:"ADMIN",updatedBy:"ADMIN",createdAt:time,updatedAt:time}],comments:[{commentId:id(5),publicationId:id(1),parentId:"",authorId:"ND-001",body:"条件を確認します",mentionIds:["ND-001"],deleted:false,version:id(6),createdAt:time,updatedAt:time,canManage:true}]});

test("shared parser copies only the finite publication contract and strips private unexpected fields",()=>{
 const input=fixture() as TeamWorkspaceData&{snapshot?:unknown};input.snapshot={fields:{attendanceConcerns:"private"}};
 Object.assign(input.candidates[0],{fields:{interviewMemo:"private"},sourceRecordId:id(7),sourceProfileId:id(8)});
 const value=parseTeamWorkspace(input);assert.equal("snapshot" in value,false);assert.equal("fields" in value.candidates[0],false);assert.equal("sourceRecordId" in value.candidates[0],false);assert.notEqual(value,input);
});
test("source references are retained only for a manageable publication",()=>{
 const input=fixture();Object.assign(input.candidates[0],{canManage:true,sourceRecordId:id(7),sourceProfileId:id(8),sourceRowVersion:"current-row-version",sourceProfileVersion:id(9)});
 assert.equal(parseTeamWorkspace(input).candidates[0].sourceProfileId,id(8));
});
test("deleted comments never expose their retained original text or mentions",()=>{
 const input=fixture();Object.assign(input.comments[0],{deleted:true,body:"retained original",mentionIds:["ND-001"]});
 const comment=parseTeamWorkspace(input).comments[0];assert.equal(comment.body,"");assert.deepEqual(comment.mentionIds,[]);
});
test("private candidates cannot carry shared comments into the UI",()=>{
 const input=fixture();input.candidates[0].published=false;assert.throws(()=>parseTeamWorkspace(input),/非公開候補者/);
 input.comments=[];assert.equal(parseTeamWorkspace(input).candidates[0].published,false);
});
test("unsupported feature malformed dates roles statuses and duplicate identities are rejected",()=>{
 for(const mutate of [(p:any)=>p.feature=false,(p:any)=>p.players[0].role="root",(p:any)=>p.jobs[0].status="draft",(p:any)=>p.comments[0].createdAt="tomorrow",(p:any)=>p.candidates.push({...p.candidates[0]})]){const input=fixture();mutate(input);assert.throws(()=>parseTeamWorkspace(input));}
});
test("comment listing stays within a current published candidate and sorts reproducibly",()=>{
 const input=fixture();input.comments.push({...input.comments[0],commentId:id(10),createdAt:"2026-11-05T00:00:00.000Z"});
 assert.deepEqual(teamCommentsFor(input,id(1)).map(p=>p.commentId),[id(10),id(5)]);assert.deepEqual(teamCommentsFor(input,id(99)),[]);input.candidates[0].published=false;assert.deepEqual(teamCommentsFor(input,id(1)),[]);
});


test("admin archive retains comments on withdrawn publications while the shared-screen parser still refuses them",()=>{
 const shared=fixture(),archive={...shared,scope:"all-saved-internal-shares",deletedCommentBodiesRedacted:true,players:shared.players.map(player=>({...player,active:false}))};archive.candidates[0].published=false;
 const result=parseTeamWorkspaceExport(archive);assert.equal(result.candidates[0].published,false);assert.equal(result.comments.length,1);assert.equal(result.comments[0].body,"条件を確認します");assert.equal(result.players[0].active,false);assert.throws(()=>parseTeamWorkspace(archive),/非公開候補者/);
});
test("archive validation requires its explicit scope and redacted deleted-comment tombstones",()=>{
 const shared=fixture(),archive={...shared,scope:"all-saved-internal-shares",deletedCommentBodiesRedacted:true,players:shared.players.map(player=>({...player,active:true}))};
 assert.throws(()=>parseTeamWorkspaceExport({...archive,scope:"published-only"}));assert.throws(()=>parseTeamWorkspaceExport({...archive,deletedCommentBodiesRedacted:false}));
 archive.comments[0].deleted=true;assert.throws(()=>parseTeamWorkspaceExport(archive),/削除済みコメントの本文/);archive.comments[0].body="";archive.comments[0].mentionIds=[];assert.equal(parseTeamWorkspaceExport(archive).comments[0].body,"");
 archive.comments[0].publicationId=id(99);assert.throws(()=>parseTeamWorkspaceExport(archive),/共有先/);
});
