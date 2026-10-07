import test from "node:test";
import assert from "node:assert/strict";
import { validateEndpoint, sheetRequest, assertSnapshot, liveCount, businessToday, isUncertainWrite, SheetApiError } from "../lib/sheets-client.ts";

const endpoint = "https://script.google.com/macros/s/AKfycb_TEST_DEPLOYMENT_1234567890/exec";
const player = {id:"ND-001",name:"テスト担当",team:"NODE",target:20,bio:"",color:"blue"};
const snapshot = {self:{playerId:player.id,role:"player"},players:[player],activities:[],counts:{},syncedAt:"2026-10-07T00:00:00Z",warnings:[],writesEnabled:true};

test("credentials cannot be sent to a non-deployed, non-Google or query-bearing URL",()=>{
  for(const value of ["http://script.google.com/macros/s/AKfycb_TEST_DEPLOYMENT_1234567890/exec", "https://evil.example/exec", endpoint+"?password=secret", endpoint.replace("/exec","/dev"), endpoint.replace("script.google.com","script.google.com.evil.example")]) {
    assert.throws(()=>validateEndpoint(value));
  }
  assert.equal(validateEndpoint(endpoint),endpoint);
});

test("POST carries the token and operation id only in the body, never a query or cookie",async t=>{
  t.mock.method(globalThis,"fetch",async (url: string|URL|Request, init?:RequestInit)=>{
    assert.equal(String(url),endpoint);
    assert.equal(init?.credentials,"omit"); assert.equal(init?.method,"POST");
    assert.match(String((init?.headers as Record<string,string>)["Content-Type"]),/^text\/plain/);
    const body=JSON.parse(String(init?.body));
    assert.equal(body.token,"test-token"); assert.equal(body.operationId,"same-operation");
    assert.equal(body.version,1); assert.equal(body.payload.status,"稼働開始");
    return new Response(JSON.stringify({ok:true,data:{saved:true}}));
  });
  assert.deepEqual(await sheetRequest(endpoint,"updateStatus",{status:"稼働開始"},{token:"test-token",operationId:"same-operation"}),{saved:true});
});

test("an HTML Google sign-in page is an actionable error, never successful data",async t=>{
  t.mock.method(globalThis,"fetch",async()=>new Response("<html>Sign in</html>",{status:200}));
  await assert.rejects(()=>sheetRequest(endpoint,"snapshot"),{code:"NOT_JSON"});
});

test("a network failure and a rejected operation never produce a successful snapshot",async t=>{
  t.mock.method(globalThis,"fetch",async()=>{throw new TypeError("offline");});
  await assert.rejects(()=>sheetRequest(endpoint,"saveActivity"),{code:"NETWORK"});
  t.mock.method(globalThis,"fetch",async()=>new Response(JSON.stringify({ok:false,error:{code:"CONFLICT",message:"再取得してください"}})));
  await assert.rejects(()=>sheetRequest(endpoint,"saveActivity"),{code:"CONFLICT",message:"再取得してください"});
});

test("a player snapshot rejects another player's private activity and missing self",()=>{
  assertSnapshot(snapshot);
  assert.throws(()=>assertSnapshot({...snapshot,activities:[{id:"r",playerId:"ND-002",date:"2026-10-07"}]}));
  assert.throws(()=>assertSnapshot({...snapshot,self:{playerId:"ND-999",role:"player"}}));
  assert.throws(()=>assertSnapshot({...snapshot,players:[{...player,target:0}]}));
});

const destination = {
  title: "テスト管理シート",
  matchingUrl: "https://docs.google.com/spreadsheets/d/test-destination-id/edit#gid=34567",
  kpiUrl: "https://docs.google.com/spreadsheets/d/test-destination-id/edit#gid=89012",
};

test("an admin snapshot accepts actual destination links after copied tab IDs change",()=>{
  const admin = {...snapshot,self:{playerId:"ADMIN",role:"admin"},destination};
  assert.doesNotThrow(()=>assertSnapshot(admin));
  assert.doesNotThrow(()=>assertSnapshot({...admin,destination:{...destination,
    matchingUrl:destination.matchingUrl.replace("#gid=","?gid="),
    kpiUrl:destination.kpiUrl.replace("#gid=","?gid=")+"#gid=89012",
  }}));
});

test("a player snapshot rejects destination information even when the Google links are valid",()=>{
  assert.throws(()=>assertSnapshot({...snapshot,destination}),{code:"INVALID_RESPONSE"});
});

test("destination links reject external hosts, credentials, unsafe schemes, and non-sheet URLs",()=>{
  const admin = {...snapshot,self:{playerId:"ADMIN",role:"admin"}};
  for(const value of [
    "https://evil.example/spreadsheets/d/test-destination-id/edit#gid=34567",
    destination.matchingUrl.replace("docs.google.com","docs.google.com.evil.example"),
    destination.matchingUrl.replace("https:","http:"),
    destination.matchingUrl.replace("https://","https://user:password@"),
    "javascript:alert(1)",
    "https://docs.google.com/document/d/test-document-id/edit#gid=34567",
  ]) {
    for(const field of ["matchingUrl","kpiUrl"])
      assert.throws(()=>assertSnapshot({...admin,destination:{...destination,[field]:value}}),{code:"INVALID_RESPONSE"});
  }
});

test("ranking totals use authenticated aggregates while private details can remain empty",()=>{
  const counts={"2026-10":{"ND-001":{"提案":4},"ND-002":{"提案":7}}};
  assert.equal(liveCount(counts,"2026-10","提案","ND-002"),7);
  assert.equal(liveCount(counts,"2026-10","提案",null),11);
  assert.equal(liveCount(counts,"2026-09","提案",null),0);
});

test("the business date follows Japan at the UTC month boundary",()=>{
  assert.equal(businessToday(new Date("2026-10-31T15:05:00Z")),"2026-11-01");
  assert.equal(businessToday(new Date("2026-10-31T14:59:00Z")),"2026-10-31");
});

test("lost or invalid write responses keep the operation payload while definitive rejections permit correction",()=>{
  for(const code of ["NETWORK","HTTP","NOT_JSON","INTERNAL","API","SHEET_WRITE_FAILED","INVALID_RESPONSE"])
    assert.equal(isUncertainWrite(new SheetApiError(code,"response lost")),true);
  for(const code of ["CONFLICT","SCHEMA_MISMATCH","UNAUTHENTICATED","VALIDATION","READ_ONLY"])
    assert.equal(isUncertainWrite(new SheetApiError(code,"rejected")),false);
  assert.equal(isUncertainWrite(new Error("body interrupted")),true);
});
