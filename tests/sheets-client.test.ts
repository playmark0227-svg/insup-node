import test from "node:test";
import assert from "node:assert/strict";
import { validateEndpoint, sheetRequest, assertSnapshot, liveCount, businessToday, isUncertainWrite, SheetApiError } from "../lib/sheets-client.ts";

const endpoint = "https://script.google.com/macros/s/AKfycb_TEST_DEPLOYMENT_1234567890/exec";
const player = {id:"ND-001",name:"テスト担当",team:"NODE",target:20,bio:"",color:"blue"};
const snapshot = {self:{playerId:player.id,role:"player"},players:[player],activities:[],counts:{},syncedAt:"2026-10-07T00:00:00Z",warnings:[],writesEnabled:true};
const contentUrl = "https://script.googleusercontent.com/macros/echo?user_content_key=test-result-key&lib=test-lib";
function contentResponse(status = 404, url = contentUrl, redirected = true) {
  return Object.defineProperties(new Response("<html>Not found</html>", {status}), {url:{value:url},redirected:{value:redirected}});
}
async function flushMicrotasks() { for (let i = 0; i < 6; i++) await Promise.resolve(); }

test("credentials cannot be sent to a non-deployed, non-Google or query-bearing URL",()=>{
  for(const value of ["http://script.google.com/macros/s/AKfycb_TEST_DEPLOYMENT_1234567890/exec", "https://evil.example/exec", endpoint+"?password=secret", endpoint.replace("/exec","/dev"), endpoint.replace("script.google.com","script.google.com.evil.example")]) {
    assert.throws(()=>validateEndpoint(value));
  }
  assert.equal(validateEndpoint(endpoint),endpoint);
});

test("POST carries the token and operation id only in the body, never a query or cookie",async t=>{
  t.mock.method(globalThis,"fetch",async (url: string|URL|Request, init?:RequestInit)=>{
    assert.equal(String(url),endpoint);
    assert.equal(init?.credentials,"omit"); assert.equal(init?.method,"POST"); assert.equal(init?.cache,"no-store");
    assert.match(String((init?.headers as Record<string,string>)["Content-Type"]),/^text\/plain/);
    const body=JSON.parse(String(init?.body));
    assert.equal(body.token,"test-token"); assert.equal(body.operationId,"same-operation");
    assert.equal(body.version,1); assert.equal(body.payload.status,"稼働開始");
    return new Response(JSON.stringify({ok:true,data:{saved:true}}));
  });
  assert.deepEqual(await sheetRequest(endpoint,"updateStatus",{status:"稼働開始"},{token:"test-token",operationId:"same-operation"}),{saved:true});
});

for (const action of ["snapshot", "login", "saveActivity"]) test(`${action} recovers a redirected result 404 after 700ms with no repeated POST`, async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  const calls: {url:string;init?:RequestInit}[] = [];
  t.mock.method(globalThis,"fetch",async (url:string|URL|Request, init?:RequestInit) => {
    calls.push({url:String(url),init});
    return calls.length === 1 ? contentResponse() : new Response(JSON.stringify({ok:true,data:{recovered:true}}));
  });
  const pending = sheetRequest(endpoint,action,{password:"test-password"},{token:"test-token",operationId:"same-operation"});
  await flushMicrotasks();
  t.mock.timers.tick(699); await flushMicrotasks();
  assert.equal(calls.length,1);
  t.mock.timers.tick(1);
  assert.deepEqual(await pending,{recovered:true});
  assert.equal(calls.length,2);
  assert.equal(calls[0].url,endpoint); assert.equal(calls[0].init?.method,"POST");
  assert.equal(calls[1].url,contentUrl); assert.equal(calls[1].init?.method,"GET");
  assert.equal(calls[1].init?.signal,calls[0].init?.signal);
  assert.equal(calls[1].init?.credentials,"omit"); assert.equal(calls[1].init?.cache,"no-store"); assert.equal(calls[1].init?.redirect,"error");
  assert.equal(calls[1].init?.body,undefined); assert.equal(calls[1].init?.headers,undefined);
  assert.ok(!calls[1].url.includes("test-token") && !calls[1].url.includes("test-password"));
});

for (const action of ["login", "saveActivity"]) for (const firstFailure of ["404", "503", "network", "body"]) test(`${action} result ${firstFailure} permits one final GET without replaying its POST`, async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  const calls: {url:string;init?:RequestInit}[] = [];
  t.mock.method(globalThis,"fetch",async (url:string|URL|Request, init?:RequestInit) => {
    calls.push({url:String(url),init});
    if (calls.length === 1) return contentResponse();
    if (calls.length === 2) {
      if (firstFailure === "network") throw new TypeError("result unavailable");
      if (firstFailure === "body") {
        const response = new Response("");
        Object.defineProperty(response,"text",{value:async () => { throw new TypeError("result body interrupted"); }});
        return response;
      }
      return new Response("Not ready", {status:Number(firstFailure)});
    }
    return new Response(JSON.stringify({ok:true,data:{recovered:true}}));
  });
  const pending = sheetRequest(endpoint,action,{password:"private-test-password"});
  await flushMicrotasks(); t.mock.timers.tick(700); await flushMicrotasks();
  assert.equal(calls.length,2);
  t.mock.timers.tick(1_499); await flushMicrotasks(); assert.equal(calls.length,2);
  t.mock.timers.tick(1); assert.deepEqual(await pending,{recovered:true});
  assert.equal(calls.length,3);
  assert.deepEqual(calls.map(call => call.init?.method),["POST","GET","GET"]);
  assert.ok(calls.slice(1).every(call => call.url === contentUrl && call.init?.body === undefined && call.init?.signal === calls[0].init?.signal));
});

test("result recovery refuses other hosts, paths, credentials, keys, and non-redirected or non-404 responses", async t => {
  const cases: [string,number,boolean][] = [
    [endpoint,404,true], [contentUrl.replace(".com/",".com.evil.example/"),404,true],
    [contentUrl.replace("https:","http:"),404,true], [contentUrl.replace("/macros/echo","/other"),404,true],
    [contentUrl.replace("https://","https://user:password@"),404,true], [contentUrl.replace(".com/",".com:8443/"),404,true],
    [contentUrl+"#fragment",404,true], [contentUrl.replace("user_content_key=test-result-key&",""),404,true],
    [contentUrl.replace("test-result-key",""),404,true], [contentUrl+"&user_content_key=duplicate",404,true],
    [contentUrl+"&token=unexpected",404,true], [contentUrl+"&lib=duplicate",404,true],
    [contentUrl,404,false], [contentUrl,503,true], ["",404,true],
  ];
  let current = cases[0], calls = 0;
  t.mock.method(globalThis,"fetch",async () => { calls++; return contentResponse(current[1],current[0],current[2]); });
  for (const item of cases) {
    current = item; const before = calls;
    await assert.rejects(() => sheetRequest(endpoint,"saveActivity"),{code:"HTTP"});
    assert.equal(calls,before+1);
  }
});

test("failed result GETs stop after two attempts and preserve uncertain-write handling", async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  let mode = "404", calls = 0;
  t.mock.method(globalThis,"fetch",async () => {
    calls++;
    if (calls === 1) return contentResponse();
    if (mode === "network") throw new TypeError("result unavailable");
    return mode === "404" ? contentResponse() : new Response("<html>Not ready</html>");
  });
  for (const [failure,code] of [["404","HTTP"],["html","NOT_JSON"],["network","NETWORK"]]) {
    mode = failure; calls = 0;
    const pending = sheetRequest(endpoint,"saveActivity",{},{token:"test-token",operationId:"same-operation"});
    const checked = assert.rejects(pending,(error: unknown) => error instanceof SheetApiError && error.code === code && isUncertainWrite(error) && !error.message.includes("test-result-key"));
    await flushMicrotasks(); t.mock.timers.tick(700); await flushMicrotasks();
    if (failure !== "html") t.mock.timers.tick(1_500);
    await checked;
    assert.equal(calls,failure === "html" ? 2 : 3);
  }
});

test("cancellation and the original 45-second deadline stop delayed recovery before any GET", async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  const deadline = new AbortController(), caller = new AbortController();
  let calls = 0, timeoutCalls = 0;
  t.mock.method(AbortSignal,"timeout",(milliseconds:number) => { timeoutCalls++; assert.equal(milliseconds,45_000); return deadline.signal; });
  t.mock.method(globalThis,"fetch",async () => { calls++; return contentResponse(); });
  const cancelled = sheetRequest(endpoint,"snapshot",{},{signal:caller.signal});
  const cancelledCheck = assert.rejects(cancelled,{name:"AbortError"});
  await Promise.resolve(); caller.abort(); await cancelledCheck;
  t.mock.timers.tick(700); assert.equal(calls,1); assert.equal(timeoutCalls,1);
  const timedOut = sheetRequest(endpoint,"saveActivity");
  const timeoutCheck = assert.rejects(timedOut,{code:"TIMEOUT"});
  await Promise.resolve(); deadline.abort(new DOMException("Deadline expired","TimeoutError")); await timeoutCheck;
  t.mock.timers.tick(700); assert.equal(calls,2); assert.equal(timeoutCalls,2);
});

test("an initial login or write network failure never retries its POST", async t => {
  let calls = 0;
  t.mock.method(globalThis,"fetch",async () => { calls++; throw new TypeError("offline"); });
  for (const action of ["login","saveActivity","updateStatus","resetPassword","logout","unknown-action"]) {
    const before = calls;
    await assert.rejects(() => sheetRequest(endpoint,action,{},{token:"test-token",operationId:"same-operation"}),{code:"NETWORK"});
    assert.equal(calls,before + 1);
  }
});

test("temporary HTTP failures cannot replay a login or write", async t => {
  let calls = 0;
  t.mock.method(globalThis,"fetch",async () => { calls++; return new Response("temporarily unavailable",{status:503}); });
  for (const action of ["login","saveActivity","updateStatus","resetPassword","logout"]) {
    const before = calls;
    await assert.rejects(() => sheetRequest(endpoint,action),{code:"HTTP"});
    assert.equal(calls,before + 1);
  }
});

for (const action of ["snapshot","health"]) test(`${action} retries an interrupted read once with the same total deadline`, async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  const deadline = new AbortController();
  let timeoutCalls = 0;
  t.mock.method(AbortSignal,"timeout",(milliseconds:number) => { timeoutCalls++; assert.equal(milliseconds,45_000); return deadline.signal; });
  const calls: {url:string;init?:RequestInit}[] = [];
  t.mock.method(globalThis,"fetch",async (url:string|URL|Request, init?:RequestInit) => {
    calls.push({url:String(url),init});
    if (calls.length === 1) throw new TypeError("transient network interruption");
    return new Response(JSON.stringify({ok:true,data:snapshot}));
  });
  const pending = sheetRequest(endpoint,action,{},{token:"test-token"});
  await flushMicrotasks(); t.mock.timers.tick(749); await flushMicrotasks(); assert.equal(calls.length,1);
  t.mock.timers.tick(1); assert.deepEqual(await pending,snapshot);
  assert.equal(calls.length,2); assert.equal(timeoutCalls,1);
  assert.equal(calls[1].init?.signal,calls[0].init?.signal);
  assert.equal(calls[1].init?.body,calls[0].init?.body);
});

test("data reads retry only temporary HTTP failures and stop after one retry", async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  let currentStatus = 503, calls = 0;
  t.mock.method(globalThis,"fetch",async () => { calls++; return new Response("unavailable",{status:currentStatus}); });
  for (const httpStatus of [408,502,503,504]) {
    currentStatus = httpStatus; const before = calls;
    const pending = sheetRequest(endpoint,"snapshot");
    const checked = assert.rejects(pending,{code:"HTTP"});
    await flushMicrotasks(); t.mock.timers.tick(750); await checked;
    assert.equal(calls,before + 2);
  }
  for (const httpStatus of [401,403,404,429,500]) {
    currentStatus = httpStatus; const before = calls;
    await assert.rejects(() => sheetRequest(endpoint,"snapshot"),{code:"HTTP"});
    assert.equal(calls,before + 1);
  }
});

test("a data-read retry stops immediately on cancellation or the original deadline", async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  const deadline = new AbortController(), caller = new AbortController();
  let calls = 0;
  t.mock.method(AbortSignal,"timeout",() => deadline.signal);
  t.mock.method(globalThis,"fetch",async () => { calls++; throw new TypeError("offline"); });
  const cancelled = sheetRequest(endpoint,"snapshot",{},{signal:caller.signal});
  const cancelledCheck = assert.rejects(cancelled,{name:"AbortError"});
  await flushMicrotasks(); caller.abort(); await cancelledCheck;
  t.mock.timers.tick(750); assert.equal(calls,1);
  const timedOut = sheetRequest(endpoint,"snapshot");
  const timeoutCheck = assert.rejects(timedOut,{code:"TIMEOUT"});
  await flushMicrotasks(); deadline.abort(new DOMException("Deadline expired","TimeoutError")); await timeoutCheck;
  t.mock.timers.tick(750); assert.equal(calls,2);
});

test("a caller's login deadline is an actionable timeout rather than a user cancellation", async t => {
  const caller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis,"fetch",async (_url:string|URL|Request, init?:RequestInit) => {
    calls++;
    return new Promise<Response>((_resolve,reject) => init?.signal?.addEventListener("abort",() => reject(init.signal?.reason),{once:true}));
  });
  const pending = sheetRequest(endpoint,"login",{},{signal:caller.signal});
  const checked = assert.rejects(pending,(error: unknown) => error instanceof SheetApiError && error.code === "TIMEOUT" && error.message.includes("45秒") && error.message.includes("ログイン"));
  await flushMicrotasks(); caller.abort(new DOMException("Login deadline expired","TimeoutError"));
  await checked; assert.equal(calls,1);
});

test("a shared login deadline also caps the following snapshot request", async t => {
  const caller = new AbortController();
  let calls = 0, timeoutCalls = 0;
  t.mock.method(AbortSignal,"timeout",(milliseconds:number) => { timeoutCalls++; assert.equal(milliseconds,45_000); return new AbortController().signal; });
  t.mock.method(globalThis,"fetch",async (_url:string|URL|Request, init?:RequestInit) => {
    calls++;
    if (calls === 1) return new Response(JSON.stringify({ok:true,data:{token:"test-token"}}));
    return new Promise<Response>((_resolve,reject) => init?.signal?.addEventListener("abort",() => reject(init.signal?.reason),{once:true}));
  });
  const auth = await sheetRequest<{token:string}>(endpoint,"login",{},{signal:caller.signal});
  const pending = sheetRequest(endpoint,"snapshot",{},{signal:caller.signal,token:auth.token});
  const checked = assert.rejects(pending,(error: unknown) => error instanceof SheetApiError && error.code === "TIMEOUT" && error.message.includes("データ取得") && error.message.includes("45秒"));
  await flushMicrotasks(); caller.abort(new DOMException("Shared deadline expired","TimeoutError"));
  await checked; assert.equal(calls,2); assert.equal(timeoutCalls,2);
});

test("a caller deadline during read-retry waiting stops recovery and remains a timeout", async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  const caller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis,"fetch",async () => { calls++; throw new TypeError("offline"); });
  const pending = sheetRequest(endpoint,"snapshot",{},{signal:caller.signal});
  const checked = assert.rejects(pending,{code:"TIMEOUT"});
  await flushMicrotasks(); caller.abort(new DOMException("Shared deadline expired","TimeoutError"));
  await checked; t.mock.timers.tick(750); assert.equal(calls,1);
});

test("an expired caller deadline prevents any network request", async t => {
  const caller = new AbortController();
  caller.abort(new DOMException("Shared deadline expired","TimeoutError"));
  let calls = 0;
  t.mock.method(globalThis,"fetch",async () => { calls++; return new Response("{}"); });
  await assert.rejects(() => sheetRequest(endpoint,"snapshot",{},{signal:caller.signal}),{code:"TIMEOUT"});
  assert.equal(calls,0);
});

test("body-stream failures use the same recovery policy and actionable errors", async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  let calls = 0;
  t.mock.method(globalThis,"fetch",async () => {
    calls++;
    if (calls % 2 === 0) return new Response(JSON.stringify({ok:true,data:snapshot}));
    const response = new Response("");
    Object.defineProperty(response,"text",{value:async () => { throw new TypeError("body stream interrupted"); }});
    return response;
  });
  const pending = sheetRequest(endpoint,"snapshot");
  await flushMicrotasks(); t.mock.timers.tick(750); assert.deepEqual(await pending,snapshot);
  assert.equal(calls,2);
  for (const action of ["login","saveActivity"]) {
    calls = 0;
    await assert.rejects(() => sheetRequest(endpoint,action), (error: unknown) => error instanceof SheetApiError && error.code === "NETWORK" && (action === "login" ? error.message.includes("ログイン") : isUncertainWrite(error)));
    assert.equal(calls,1);
  }
});

test("a body-stream deadline is a timeout and cannot replay a login or write", async t => {
  const deadline = new AbortController();
  let calls = 0;
  t.mock.method(AbortSignal,"timeout",() => deadline.signal);
  t.mock.method(globalThis,"fetch",async () => {
    calls++;
    const response = new Response("");
    Object.defineProperty(response,"text",{value:async () => { deadline.abort(new DOMException("Deadline expired","TimeoutError")); throw deadline.signal.reason; }});
    return response;
  });
  await assert.rejects(() => sheetRequest(endpoint,"login"), (error: unknown) => error instanceof SheetApiError && error.code === "TIMEOUT" && error.message.includes("45秒") && error.message.includes("ログイン"));
  assert.equal(calls,1);
});

test("definitive API errors and invalid data never trigger an automatic read retry", async t => {
  let calls = 0, body = "null";
  t.mock.method(globalThis,"fetch",async () => { calls++; return new Response(body); });
  for (const code of ["UNAUTHENTICATED","INVALID_CREDENTIALS","RATE_LIMITED","VALIDATION"]) {
    body = JSON.stringify({ok:false,error:{code,message:"definitive rejection"}});
    const before = calls;
    await assert.rejects(() => sheetRequest(endpoint,"snapshot"),{code});
    assert.equal(calls,before + 1);
  }
  body = "null";
  await assert.rejects(() => sheetRequest(endpoint,"snapshot"),{code:"API"});
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
  for(const code of ["NETWORK","TIMEOUT","HTTP","NOT_JSON","INTERNAL","API","SHEET_WRITE_FAILED","SHEET_READ_FAILED","INVALID_RESPONSE"])
    assert.equal(isUncertainWrite(new SheetApiError(code,"response lost")),true);
  for(const code of ["CONFLICT","SCHEMA_MISMATCH","UNAUTHENTICATED","VALIDATION","READ_ONLY"])
    assert.equal(isUncertainWrite(new SheetApiError(code,"rejected")),false);
  assert.equal(isUncertainWrite(new Error("body interrupted")),true);
});
