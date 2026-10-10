import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {assertSnapshot, validateEndpoint, SheetApiError} from "../lib/sheets-client.ts";

const endpoint = "https://script.google.com/macros/s/AKfycb_TEST_DEPLOYMENT_1234567890/exec";
const otherEndpoint = endpoint.replace("TEST_DEPLOYMENT", "OTHER_DEPLOYMENT");
const token = "only-a-test-session-token-12345678901234567890";
const SESSION_KEY = "insup.node.session.v1";
const ENDPOINT_KEY = "insup.node.endpoint.v1";
const player = {id:"ND-001",name:"テスト担当",team:"NODE",target:20,bio:"",color:"blue"};
const snapshot = {self:{playerId:player.id,role:"player"},players:[player],activities:[],counts:{},syncedAt:"2026-10-08T00:00:00Z",warnings:[],writesEnabled:true};
const source = ts.transpileModule(fs.readFileSync(new URL("../hooks/use-sheets-connection.ts", import.meta.url), "utf8")
  .replace("import.meta.env.BASE_URL", '"/insup-node/"'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

function storage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve=yes; reject=no; });
  return {promise,resolve,reject};
}
async function flush() { for (let i=0; i<12; i++) await Promise.resolve(); }

// Execute the actual hook against a small deterministic hook runtime. This
// exposes races and state restoration without adding a browser/test dependency.
function harness(handle, {storedToken, malformedSession, deadlineController, browser} = {}) {
  const slots = [], effects = [], calls = [];
  let cursor = 0, stateUpdates = 0;
  const localStorage = storage({[ENDPOINT_KEY]:endpoint});
  const sessionStorage = storage(storedToken ? {[SESSION_KEY]:JSON.stringify({endpoint,token:storedToken})} : malformedSession ? {[SESSION_KEY]:"invalid-json"} : {});
  const depsEqual = (a,b) => a && b && a.length===b.length && a.every((x,i)=>Object.is(x,b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = {value:typeof initial==="function" ? initial() : initial};
      return [slots[i].value,value=>{slots[i].value=typeof value==="function" ? value(slots[i].value) : value; stateUpdates++;}];
    },
    useRef(initial) { const i=cursor++; if (!slots[i]) slots[i]={current:initial}; return slots[i]; },
    useCallback(fn,deps) { const i=cursor++; if (!slots[i] || !depsEqual(slots[i].deps,deps)) slots[i]={fn,deps}; return slots[i].fn; },
    useEffect(fn,deps) {
      const i=cursor++;
      if (!slots[i] || !depsEqual(slots[i].deps,deps)) {
        const old=slots[i]; slots[i]={deps};
        effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});
      }
    },
  };
  const sheetRequest = async (target,action,payload,options={}) => {
    const call={target,action,payload,options}; calls.push(call);
    return handle(call);
  };
  const exports={};
  const timeoutDurations=[];
  const deadlineSignals=deadlineController ? {any:signals=>AbortSignal.any(signals),timeout:ms=>{timeoutDurations.push(ms); return deadlineController.signal;}} : AbortSignal;
  const context=vm.createContext({exports,module:{exports},AbortController,AbortSignal:deadlineSignals,JSON,Error,localStorage,sessionStorage,
    ...(browser || {}),
    fetch:async()=>({ok:true,json:async()=>({endpoint})}),
    require:name=>name==="react" ? react : name.includes("node-data") ? {initialPlayers:[player],makeDemoActivities:()=>[]} : {assertSnapshot,validateEndpoint,SheetApiError,sheetRequest}});
  vm.runInContext(source,context);
  const render = () => {cursor=0; const result=exports.useSheetsConnection(); while(effects.length) effects.shift()(); return result;};
  render();
  return {calls,localStorage,sessionStorage,timeoutDurations,render,updates:()=>stateUpdates,unmount:()=>slots.forEach(slot=>slot.cleanup?.())};
}

test("a token is persisted before data loads and no submitted password is stored",async()=>{
  const pendingSnapshot=deferred();
  const h=harness(call=>call.action==="login" ? {token} : pendingSnapshot.promise);
  await flush();
  const pending=h.render().login("ND-001","only-a-test-password");
  await flush();
  assert.equal(h.render().authenticated,true); assert.equal(h.render().loadPhase,"loading");
  assert.equal(h.render().snapshot,null); assert.equal(h.render().busy,true);
  assert.equal(JSON.parse(h.sessionStorage.getItem(SESSION_KEY)).token,token);
  assert.ok(!JSON.stringify([...h.sessionStorage.values,...h.localStorage.values]).includes("only-a-test-password"));
  assert.equal(h.calls[0].payload.sessionOnly,true);
  assert.equal(h.calls[1].action,"snapshot"); assert.equal(h.calls[1].options.token,token);
  assert.equal(h.calls[1].options.signal,h.calls[0].options.signal);
  pendingSnapshot.resolve(snapshot); await pending;
  assert.equal(h.render().snapshot,snapshot); assert.equal(h.render().loadPhase,null); assert.equal(h.render().busy,false);
  h.unmount();
});

test("authentication and its first read share one 45-second deadline and a read timeout keeps the token",async()=>{
  const deadlineController=new AbortController();
  const h=harness(call=>call.action==="login" ? {token} : new Promise((_,reject)=>{
    call.options.signal.addEventListener("abort",()=>reject(new SheetApiError("TIMEOUT","取得に時間がかかっています。再取得してください。")),{once:true});
  }),{deadlineController});
  await flush(); const pending=h.render().login("ND-001","only-a-test-password");
  await flush();
  assert.deepEqual(h.timeoutDurations,[45_000]);
  assert.equal(h.calls.length,2); assert.equal(h.calls[0].options.signal,h.calls[1].options.signal);
  assert.equal(h.render().authenticated,true); assert.equal(h.render().loadPhase,"loading");
  deadlineController.abort(new DOMException("shared deadline","TimeoutError"));
  await pending;
  assert.equal(h.render().authenticated,true); assert.equal(h.render().busy,false); assert.equal(h.render().loadPhase,null);
  assert.equal(JSON.parse(h.sessionStorage.getItem(SESSION_KEY)).token,token);
  assert.equal(h.render().snapshot,null); assert.match(h.render().error,/再取得/);
  h.unmount();
});

test("a failed initial snapshot keeps the session and refresh never resends credentials",async()=>{
  let reads=0;
  const h=harness(call=>{
    if(call.action==="login") return {token};
    if(++reads===1) throw new SheetApiError("NETWORK","一時的な通信失敗");
    return snapshot;
  });
  await flush(); await h.render().login("ND-001","only-a-test-password");
  assert.equal(h.render().authenticated,true); assert.equal(h.render().busy,false); assert.equal(h.render().snapshot,null);
  assert.equal(h.render().error,"一時的な通信失敗");
  assert.ok(h.sessionStorage.getItem(SESSION_KEY));
  await h.render().refresh();
  assert.equal(h.render().snapshot,snapshot); assert.equal(h.render().error,"");
  assert.equal(h.calls.filter(call=>call.action==="login").length,1);
  assert.ok(h.calls.filter(call=>call.action==="snapshot").every(call=>call.payload.password===undefined));
  h.unmount();
});

test("an older login response remains compatible without a second snapshot request",async()=>{
  const h=harness(()=>({token,snapshot}));
  await flush(); await h.render().login("ND-001","only-a-test-password");
  assert.equal(h.render().snapshot,snapshot); assert.equal(h.render().authenticated,true);
  assert.equal(h.calls.length,1);
  h.unmount();
});

test("restoration shows progress immediately and a transient failure does not log out",async()=>{
  const pending=deferred(); let reads=0;
  const h=harness(()=>++reads===1 ? pending.promise : snapshot,{storedToken:token});
  assert.equal(h.render().ready,true); assert.equal(h.render().authenticated,true); assert.equal(h.render().loadPhase,"restoring");
  pending.reject(new SheetApiError("NETWORK","一時的な通信失敗")); await flush();
  assert.equal(h.render().authenticated,true); assert.equal(h.render().busy,false);
  assert.equal(JSON.parse(h.sessionStorage.getItem(SESSION_KEY)).token,token);
  await h.render().refresh(); assert.equal(h.render().snapshot,snapshot);
  h.unmount();
});

test("a confirmed expired session is cleared while malformed stored JSON is discarded",async()=>{
  const h=harness(()=>{throw new SheetApiError("SESSION_EXPIRED","再ログインしてください");},{storedToken:token});
  await flush(); assert.equal(h.render().ready,true); assert.equal(h.render().authenticated,false);
  assert.equal(h.sessionStorage.getItem(SESSION_KEY),null); assert.equal(h.render().busy,false);
  h.unmount();
  const malformed=harness(()=>snapshot,{malformedSession:true});
  await flush(); assert.equal(malformed.render().ready,true); assert.equal(malformed.render().authenticated,false);
  assert.equal(malformed.sessionStorage.getItem(SESSION_KEY),null); assert.equal(malformed.calls.length,0);
  malformed.unmount();
});

test("repeated submit sends one login and logout rejects a late response",async()=>{
  const response=deferred();
  const h=harness(()=>response.promise);
  await flush(); const first=h.render().login("ND-001","only-a-test-password");
  await h.render().login("ND-001","only-a-test-password");
  assert.equal(h.calls.length,1);
  await h.render().logout(); assert.equal(h.calls[0].options.signal.aborted,true);
  response.resolve({token,snapshot}); await first;
  assert.equal(h.render().authenticated,false); assert.equal(h.render().snapshot,null);
  assert.equal(h.sessionStorage.getItem(SESSION_KEY),null); assert.equal(h.render().busy,false);
  h.unmount();
});

test("changing the endpoint cancels pending authentication and cannot apply its response",async()=>{
  const response=deferred();
  const h=harness(call=>call.action==="health" ? {configured:true} : response.promise);
  await flush(); const pending=h.render().login("ND-001","only-a-test-password");
  await h.render().connect(otherEndpoint);
  assert.equal(h.calls[0].options.signal.aborted,true);
  response.resolve({token,snapshot}); await pending;
  assert.equal(h.render().endpoint,otherEndpoint); assert.equal(h.render().authenticated,false);
  assert.equal(h.render().snapshot,null); assert.equal(h.sessionStorage.getItem(SESSION_KEY),null);
  h.unmount();
});

test("unmount aborts in-flight authentication and ignores all later state updates",async()=>{
  const response=deferred();
  const h=harness(()=>response.promise);
  await flush(); const pending=h.render().login("ND-001","only-a-test-password");
  h.unmount(); const updates=h.updates();
  assert.equal(h.calls[0].options.signal.aborted,true);
  response.resolve({token,snapshot}); await pending;
  assert.equal(h.updates(),updates); assert.equal(h.sessionStorage.getItem(SESSION_KEY),null);
});

test("a save supersedes a pending refresh and its confirmed result remains authoritative",async()=>{
  const pendingRead=deferred(), pendingSave=deferred(); let reads=0;
  const h=harness(call=>call.action==="snapshot" ? (++reads===1 ? snapshot : pendingRead.promise) : pendingSave.promise,{storedToken:token});
  await flush(); const refresh=h.render().refresh();
  const write=h.render().mutate("updateStatus",{recordId:"test-record",status:"提案"},"same-test-operation");
  assert.equal(h.calls[1].options.signal.aborted,true);
  await assert.rejects(()=>h.render().connect(otherEndpoint),/保存が完了/);
  assert.equal(h.calls.length,3);
  const committed={...snapshot,syncedAt:"2026-10-08T01:00:00Z"};
  pendingSave.resolve({snapshot:committed}); await write;
  pendingRead.resolve(snapshot); await refresh;
  assert.equal(h.render().snapshot,committed); assert.equal(h.render().busy,false);
  assert.equal(h.calls[2].options.operationId,"same-test-operation");
  h.unmount();
});

for (const method of ["analyzeReviews","readAdvice"]) test(`${method} clears a confirmed expired session instead of retaining private candidate data`,async()=>{
  const action = method === "analyzeReviews" ? "analyzeInterviewReviews" : "readInterviewAdvice";
  const h = harness(call => {
    if (call.action === "snapshot") return snapshot;
    if (call.action === action) throw new SheetApiError("SESSION_EXPIRED","再ログインしてください。");
    throw new Error(`unexpected request: ${call.action}`);
  },{storedToken:token});
  await flush(); assert.equal(h.render().authenticated,true); assert.equal(h.render().snapshot,snapshot);
  await assert.rejects(() => h.render()[method]("2026-10"),{code:"SESSION_EXPIRED"});
  assert.equal(h.render().authenticated,false); assert.equal(h.render().snapshot,null);
  assert.equal(h.render().players.length,0); assert.equal(h.render().activities.length,0);
  assert.equal(h.sessionStorage.getItem(SESSION_KEY),null);
  assert.equal(h.calls[1].action,action); assert.equal(h.calls[1].payload.period,"2026-10"); assert.equal(h.calls[1].options.token,token);
  await assert.rejects(() => h.render()[method]("2026-10"),/ログインしてください/);
  assert.equal(h.calls.length,2);
  h.unmount();
});

for (const method of ["analyzeReviews","readAdvice"]) test(`${method} rejects a late successful response after logout`,async()=>{
  const response = deferred();
  const h = harness(call => call.action === "snapshot" ? snapshot : call.action === "logout" ? {} : response.promise,{storedToken:token});
  await flush(); const pending = h.render()[method]("2026-10");
  await h.render().logout(); const updates = h.updates();
  assert.equal(h.render().authenticated,false); assert.equal(h.render().snapshot,null);
  response.resolve({summary:"以前のセッションの改善案",actions:["確認する"],count:1,generatedAt:"2026-10-10T05:00:00Z"});
  await assert.rejects(pending,/ログイン状態が変更されました/);
  assert.equal(h.updates(),updates); assert.equal(h.sessionStorage.getItem(SESSION_KEY),null);
  assert.equal(h.render().authenticated,false); assert.equal(h.render().snapshot,null);
  h.unmount();
});

for (const method of ["analyzeReviews","readAdvice"]) test(`${method} transient AI failure keeps the existing session and recorded reasons available`,async()=>{
  const h = harness(call => {
    if (call.action === "snapshot") return snapshot;
    throw new SheetApiError("NETWORK","改善案を再取得してください。");
  },{storedToken:token});
  await flush();
  await assert.rejects(() => h.render()[method]("2026-10"),{code:"NETWORK"});
  assert.equal(h.render().authenticated,true); assert.equal(h.render().snapshot,snapshot);
  assert.equal(JSON.parse(h.sessionStorage.getItem(SESSION_KEY)).token,token);
  assert.equal(h.calls.length,2); assert.equal(h.render().busy,false);
  h.unmount();
});

function autoSyncBrowser() {
  let now=0, serial=0;
  const timers=new Map(), listeners=new Map();
  const document={visibilityState:'visible',activeElement:null,editorOpen:false,querySelector(){return this.editorOpen?{}:null;},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
  const navigator={onLine:true};
  const window={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
  return {document,navigator,window,Date:{now:()=>now},setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),timers,listeners,
    advance:async()=>{const [id,timer]=[...timers][0];timers.delete(id);now+=timer.delay;await timer.fn();await flush();},
  };
}

test('automatic snapshots are quiet, stop while hidden or editing, and resume without overlapping',async()=>{
  const browser=autoSyncBrowser();
  const pending=deferred(); let reads=0;
  const h=harness(call=>{if(call.action==='snapshot')return ++reads===2?pending.promise:snapshot;return {};},{storedToken:token,browser});
  await flush();h.render();
  assert.equal(browser.timers.size,1);
  assert.equal([...browser.timers.values()][0].delay,30_000);
  browser.document.visibilityState='hidden';await browser.advance();assert.equal(reads,1);
  browser.document.visibilityState='visible';browser.document.editorOpen=true;await browser.advance();assert.equal(reads,1);
  browser.document.editorOpen=false;await browser.advance();
  assert.equal(reads,2);assert.equal(h.render().busy,false);assert.equal(h.render().syncing,true);
  await h.render().refresh(true);assert.equal(reads,2);
  pending.resolve({...snapshot,syncedAt:'2026-10-10T00:00:00Z'});await flush();
  assert.equal(h.render().syncing,false);assert.equal(h.render().snapshot.syncedAt,'2026-10-10T00:00:00Z');
  h.unmount();assert.equal(browser.timers.size,0);assert.equal(browser.listeners.size,0);
});

test('automatic sync backs off after a temporary failure without losing data or blocking writes',async()=>{
  const browser=autoSyncBrowser();let reads=0;
  const h=harness(call=>{if(call.action==='snapshot'){if(++reads===2)throw new Error('temporary');return snapshot;}return {snapshot};},{storedToken:token,browser});
  await flush();h.render();await browser.advance();await flush();
  assert.equal(h.render().snapshot.syncedAt,snapshot.syncedAt);assert.equal(h.render().busy,false);assert.equal(h.render().error,'');assert.ok(h.render().syncError);
  assert.equal([...browser.timers.values()][0].delay,60_000);
  await browser.advance();assert.equal(h.render().syncError,'');assert.equal([...browser.timers.values()][0].delay,30_000);
  h.unmount();
});

test('background refresh does not invalidate an in-flight AI result',async()=>{
  const ai=deferred();const h=harness(call=>call.action==='analyzeInterviewReviews'?ai.promise:snapshot,{storedToken:token});
  await flush();const running=h.render().analyzeReviews('2026-10');await h.render().refresh(true);
  const advice={summary:'test',actions:['test'],count:1,generatedAt:'2026-10-10T00:00:00Z'};
  ai.resolve(advice);assert.deepEqual(await running,advice);h.unmount();
});

test('a late automatic snapshot cannot update an editor opened during the request',async()=>{
  const browser=autoSyncBrowser(),late=deferred();let reads=0;
  const h=harness(call=>++reads===1?snapshot:late.promise,{storedToken:token,browser});
  await flush();h.render();await browser.advance();
  browser.document.editorOpen=true;
  late.resolve({...snapshot,syncedAt:'2026-10-10T00:00:00Z'});await flush();
  assert.equal(h.render().snapshot.syncedAt,snapshot.syncedAt);assert.equal(h.render().syncing,false);h.unmount();
});
