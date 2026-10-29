import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {assertSnapshot, assertMutationReceipt, isUncertainWrite, validateEndpoint, SheetApiError} from "../lib/sheets-client.ts";
import {correctionFields,correctedPayload,mutationDateErrors} from "../lib/save-correction.ts";
import {pendingSaveResources} from "../lib/pending-saves.ts";
import {matchingFields} from "../lib/management-data.ts";
import {interviewFieldLabels,interviewStringFields,blankInterviewFields} from "../lib/candidate-intake.ts";
import {assertWritingKitState,validateWritingPreferences,defaultWritingPreferences,writingSectionIds,writingTopicCodes} from "../lib/writing-ai.ts";

const endpoint = "https://script.google.com/macros/s/AKfycb_TEST_DEPLOYMENT_1234567890/exec";
const otherEndpoint = endpoint.replace("TEST_DEPLOYMENT", "OTHER_DEPLOYMENT");
const token = "only-a-test-session-token-12345678901234567890";
const SESSION_KEY = "insup.node.session.v1";
const ENDPOINT_KEY = "insup.node.endpoint.v1";
const player = {id:"ND-001",name:"テスト担当",team:"NODE",target:20,bio:"",color:"blue"};
const snapshot = {self:{playerId:player.id,role:"player"},players:[player],activities:[],counts:{},syncedAt:"2026-10-08T00:00:00Z",warnings:[],writesEnabled:true};
const source = ts.transpileModule(fs.readFileSync(new URL("../hooks/use-sheets-connection.ts", import.meta.url), "utf8")
  .replace("import.meta.env.BASE_URL", '"/insup-node/"').replace("import.meta.env.PROD", "TEST_PRODUCTION"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

function storage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve=yes; reject=no; });
  return {promise,resolve,reject};
}
async function flush() { for (let i=0; i<35; i++) await Promise.resolve(); }

// Execute the actual hook against a small deterministic hook runtime. This
// exposes races and state restoration without adding a browser/test dependency.
function harness(handle, {storedToken, malformedSession, deadlineController, browser, manifestEndpoint=endpoint, storedEndpoint=endpoint, manifestFailure=false, production=false, pendingSaves=[], persistLocal, replaceLocal} = {}) {
  const slots = [], effects = [], calls = [];
  let cursor = 0, stateUpdates = 0;
  const localStorage = storage({[ENDPOINT_KEY]:storedEndpoint});
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
  const pendingStore = new Map(pendingSaves.map(save=>[save.operationId,structuredClone(save)]));
  const pendingApi={pendingSaveResources,readPendingSaves:async()=>[...pendingStore.values()].map(value=>structuredClone(value)),
    persistPendingSave:async(_endpoint,_account,value)=>{if(persistLocal)await persistLocal(value);pendingStore.set(value.operationId,structuredClone(value));},
    replacePendingSave:async(_endpoint,_account,id,value)=>{if(replaceLocal)await replaceLocal(value);if(!pendingStore.has(id))throw new Error("old input missing");pendingStore.set(value.operationId,structuredClone(value));pendingStore.delete(id);},
    removePendingSave:async(_endpoint,_account,id)=>{pendingStore.delete(id);},
    unlockPendingSaves:(_endpoint,_account,secret)=>{unlocks.push(secret);},lockPendingSaves:()=>{locks.count++;},purgeExpiredPendingSaves:async()=>0};
  const unlocks=[],locks={count:0};
  const exports={};
  const timeoutDurations=[];
  const deadlineSignals=deadlineController ? {any:signals=>AbortSignal.any(signals),timeout:ms=>{timeoutDurations.push(ms); return deadlineController.signal;}} : AbortSignal;
  const context=vm.createContext({exports,module:{exports},AbortController,AbortSignal:deadlineSignals,JSON,Error,localStorage,sessionStorage,TEST_PRODUCTION:production,crypto,
    ...(browser || {}),
    fetch:async()=>{if(manifestFailure)throw new Error("設定取得失敗");return {ok:true,json:async()=>({endpoint:manifestEndpoint})};},
    require:name=>name==="react" ? react : name.includes("save-correction") ? {correctionFields,correctedPayload,mutationDateErrors} : name.includes("pending-saves") ? pendingApi : name.includes("node-data") ? {initialPlayers:[player],makeDemoActivities:()=>[]} : name.includes("management-data") ? {matchingFields} : name.includes("candidate-intake") ? {interviewFieldLabels,interviewStringFields} : name.includes("writing-ai") ? {assertWritingKitState,validateWritingPreferences} : {assertSnapshot,assertMutationReceipt,isUncertainWrite,validateEndpoint,SheetApiError,sheetRequest}});
  vm.runInContext(source,context);
  const render = () => {cursor=0; const result=exports.useSheetsConnection(); while(effects.length) effects.shift()(); return result;};
  render();
  return {calls,pendingStore,localStorage,sessionStorage,timeoutDurations,render,unlocks,locks,updates:()=>stateUpdates,unmount:()=>slots.forEach(slot=>slot.cleanup?.())};
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
  await flush();
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
  const h=harness(call=>call.action==="health" ? {configured:true} : response.promise,{manifestEndpoint:""});
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

test("published endpoint ignores a stale local override and rejects credential redirection",async()=>{
  const h=harness(call=>call.action==="login"?{token,snapshot}:snapshot,{storedEndpoint:otherEndpoint});
  await flush();
  assert.equal(h.render().endpoint,endpoint);
  await assert.rejects(()=>h.render().connect(otherEndpoint),/固定/);
  assert.equal(h.calls.length,0);
  await h.render().login("ND-001","private-password");
  assert.ok(h.calls.every(call=>call.target===endpoint));
  h.unmount();
});

test("manifest network failure does not send a stored session or use demo data",async()=>{
  const h=harness(()=>snapshot,{storedToken:token,storedEndpoint:otherEndpoint,manifestFailure:true});
  await flush();
  assert.equal(h.calls.length,0);assert.equal(h.render().mode,"live");
  assert.equal(h.render().authenticated,false);assert.equal(h.render().snapshot,null);
  assert.equal(h.render().players.length,0);assert.match(h.render().error,/設定取得失敗/);
  h.unmount();
});

test("password change clears private data and all local credentials without storing passwords",async()=>{
  const h=harness(call=>call.action==="changePassword"?{changed:true}:snapshot,{storedToken:token});
  await flush();
  await h.render().changePassword("old-private-password","new-private-password");
  assert.equal(h.render().authenticated,false);assert.equal(h.render().snapshot,null);
  assert.equal(h.sessionStorage.getItem(SESSION_KEY),null);
  assert.ok(!JSON.stringify([...h.sessionStorage.values,...h.localStorage.values]).includes("private-password"));
  assert.equal(h.calls.filter(c=>c.action==="changePassword").length,1);
  h.unmount();
});

test("uncertain password-change result signs out without automatic credential replay",async()=>{
  const h=harness(call=>{if(call.action==="changePassword")throw new SheetApiError("NETWORK","通信失敗");return snapshot;},{storedToken:token});
  await flush();
  await assert.rejects(()=>h.render().changePassword("old-private-password","new-private-password"),/新しいパスワード/);
  assert.equal(h.render().authenticated,false);assert.equal(h.render().snapshot,null);
  assert.equal(h.calls.filter(c=>c.action==="changePassword").length,1);
  h.unmount();
});


test("empty published configuration never falls back to a local endpoint or stored token",async()=>{
  const h=harness(()=>snapshot,{production:true,manifestEndpoint:"",storedEndpoint:otherEndpoint,storedToken:token});
  await flush();assert.equal(h.calls.length,0);assert.equal(h.render().mode,"live");
  assert.equal(h.render().snapshot,null);assert.equal(h.render().authenticated,false);
  assert.match(h.render().error,/未設定/);h.unmount();
});

test("generic API password ambiguity also signs out without replay",async()=>{
  const h=harness(call=>{if(call.action==="changePassword")throw new SheetApiError("API","不明な結果");return snapshot;},{storedToken:token});
  await flush();await assert.rejects(()=>h.render().changePassword("old-private-password","new-private-password"),/新しいパスワード/);
  assert.equal(h.render().authenticated,false);assert.equal(h.sessionStorage.getItem(SESSION_KEY),null);
  assert.equal(h.calls.filter(c=>c.action==="changePassword").length,1);h.unmount();
});

test('background save accepts immutable input immediately, without a foreground busy state or premature counts',async()=>{
  const response=deferred(),browser=autoSyncBrowser();
  const h=harness(call=>call.action==='snapshot'?snapshot:response.promise,{storedToken:token,browser});
  await flush();
  const input={activity:{candidateName:'保存テスト候補者',stage:'提案',date:'2026-10-14',interviewScheduledDate:'2026-10-20',clientInterviewScheduledTime:'18:35',offerScheduledDate:'2026-10-21',memo:'元の入力'}};
  await h.render().submitMutation('saveActivity',input,'background-original-id');await flush();
  input.activity.memo='送信後に書き換えた入力';
  const active=h.render();
  assert.equal(active.busy,false);assert.equal(active.hasPendingSave,true);assert.equal(active.backgroundSave.status,'saving');
  assert.equal(active.snapshot,snapshot);assert.equal(h.calls[1].payload.activity.memo,'元の入力');
  assert.ok(active.backgroundSave.details.includes('メモ：元の入力'));
  assert.ok(active.backgroundSave.details.includes('C面談予定日：2026-10-20'));
  assert.ok(active.backgroundSave.details.includes('C面談予定開始時刻：18:35'));
  assert.ok(active.backgroundSave.details.includes('オファー予定日：2026-10-21'));
  assert.equal(browser.listeners.has('beforeunload'),false);
  assert.equal(h.pendingStore.size,1);assert.equal(active.backgroundSave.localSaved,true);
  await assert.rejects(()=>active.submitMutation('saveActivity',input,'duplicate-new-id'),{code:'MUTATION_PENDING'});
  await active.refresh(true);assert.equal(h.calls.length,2);
  await assert.rejects(()=>active.logout(),{code:'MUTATION_PENDING'});
  await assert.rejects(()=>active.changePassword('old','new'),/保存が完了/);
  const committed={...snapshot,syncedAt:'2026-10-14T14:00:00Z'};
  response.resolve({snapshot:committed,changeId:'undo-this-change'});await flush();
  const done=h.render();assert.equal(done.snapshot,committed);assert.equal(done.backgroundSave.status,'saved');
  assert.equal(done.backgroundSave.changeId,'undo-this-change');assert.equal(done.hasPendingSave,false);
  assert.equal(browser.listeners.has('beforeunload'),false);assert.equal(done.busy,false);
  assert.ok(!JSON.stringify([...h.sessionStorage.values,...h.localStorage.values]).includes('元の入力'));
  await done.dismissBackgroundSave();assert.equal(h.render().backgroundSave,null);h.unmount();
});

test('unknown background outcome survives view rerenders and retries exact input and operation ID once',async()=>{
  let attempts=0;const response=deferred();
  const h=harness(call=>{
    if(call.action==='snapshot')return snapshot;
    if(++attempts===1)throw new SheetApiError('TIMEOUT','結果が未確認です');
    return response.promise;
  },{storedToken:token});
  await flush();await h.render().submitMutation('updateStatus',{recordId:'retained-record',status:'提案'},'retained-operation');await flush();
  const failed=h.render();assert.equal(failed.backgroundSave.status,'failed');assert.equal(failed.backgroundSave.uncertain,true);
  assert.equal(failed.hasPendingSave,true);assert.equal(failed.busy,false);
  for(let i=0;i<3;i++)assert.equal(h.render().backgroundSave.operationId,'retained-operation');
  await assert.rejects(()=>failed.dismissBackgroundSave(),{code:'MUTATION_PENDING'});
  await assert.rejects(()=>failed.mutate('createPlayer',{},'other-operation'),{code:'MUTATION_PENDING'});
  failed.retryBackgroundSave();h.render().retryBackgroundSave();await flush();
  assert.equal(attempts,2);assert.equal(h.calls[1].options.operationId,h.calls[2].options.operationId);
  assert.deepEqual(h.calls[1].payload,h.calls[2].payload);
  response.resolve({snapshot});await flush();assert.equal(h.render().backgroundSave.status,'saved');h.unmount();
});

test('definite background failure retains the draft for inspection until explicit dismissal',async()=>{
  const h=harness(call=>{if(call.action==='snapshot')return snapshot;throw new SheetApiError('ROW_CONFLICT','別の画面で変更されています');},{storedToken:token});
  await flush();await h.render().submitMutation('updateRecord',{recordId:'a',changes:{2:'保持する会社名',13:'保持する詳細メモ'}},'conflict-id');await flush();
  const failed=h.render();assert.equal(failed.backgroundSave.status,'failed');assert.equal(failed.backgroundSave.uncertain,false);
  assert.ok(failed.backgroundSave.details.includes('会社名：保持する会社名'));
  assert.ok(failed.backgroundSave.details.includes('メモ：保持する詳細メモ'));
  await failed.dismissBackgroundSave();assert.equal(h.render().hasPendingSave,false);assert.equal(h.render().backgroundSave,null);h.unmount();
});

test('background session expiry removes private drafts and no late previous-account result is applied',async()=>{
  const write=deferred(),ai=deferred();
  const h=harness(call=>call.action==='snapshot'?snapshot:call.action==='readInterviewAdvice'?ai.promise:write.promise,{storedToken:token});
  await flush();const reading=h.render().readAdvice('2026-10');
  await h.render().submitMutation('saveActivity',{activity:{candidateName:'private candidate',memo:'private memo'}},'private-operation');
  ai.reject(new SheetApiError('SESSION_EXPIRED','expired'));await assert.rejects(reading);await flush();
  assert.equal(h.render().backgroundSave,null);assert.equal(h.render().snapshot,null);
  const updates=h.updates();write.resolve({snapshot});await flush();assert.equal(h.updates(),updates);
  assert.equal(h.render().backgroundSave,null);assert.equal(h.render().authenticated,false);h.unmount();
});

test('unmount discards pending private jobs and never updates detached state',async()=>{
  const response=deferred();const h=harness(call=>call.action==='snapshot'?snapshot:response.promise,{storedToken:token});
  await flush();await h.render().submitMutation('updateProfile',{player:{id:'ND-001',bio:'private draft'}},'unmount-op');
  h.unmount();const updates=h.updates();response.resolve({snapshot});await flush();assert.equal(h.updates(),updates);
});

test('background save invalidates earlier reads and never applies an old snapshot after confirming its write',async()=>{
  let reads=0;const read=deferred(),write=deferred();
  const h=harness(call=>call.action==='snapshot'?(++reads===1?snapshot:read.promise):write.promise,{storedToken:token});
  await flush();const refreshing=h.render().refresh(true);
  await h.render().submitMutation('updateStatus',{recordId:'a',status:'提案'},'newer-operation');
  assert.equal(h.calls[1].options.signal.aborted,true);
  const committed={...snapshot,syncedAt:'2026-10-14T14:00:00Z'};write.resolve({snapshot:committed});await flush();
  read.resolve(snapshot);await refreshing;assert.equal(h.render().snapshot,committed);h.unmount();
});

test('credential operations and malformed input cannot be accepted as background jobs',async()=>{
  const h=harness(()=>snapshot,{storedToken:token});await flush();
  await assert.rejects(()=>h.render().submitMutation('resetPassword',{password:'private'},'x'),{code:'INVALID_ACTION'});
  const cyclic={};cyclic.self=cyclic;
  await assert.rejects(()=>h.render().submitMutation('updateRecord',cyclic,'x'),{code:'INVALID_PAYLOAD'});
  assert.equal(h.render().backgroundSave,null);assert.equal(h.calls.length,1);h.unmount();
});

test('failed private intake copy returns labelled original input only after an explicit request and preserves immutable same-ID retry',async()=>{
 for(const action of ['saveCandidateProfile','saveActivity']){
  const failedWrite=deferred();let attempts=0;
  const h=harness(call=>call.action==='snapshot'?snapshot:++attempts===1?failedWrite.promise:{snapshot},{storedToken:token});await flush();
  const originalFields={...blankInterviewFields(),age:'32',workHistory:'最初の職歴\n改行もそのまま保持',attendanceConcerns:'原文の確認事項',crmTools:['Salesforce','HubSpot'],chatTools:['Slack','Chatwork']},introduction='最初の紹介文\n改行も維持';
  const profile={fields:originalFields,introduction,profileVersion:'private-profile-version'},input=action==='saveCandidateProfile'?{...profile,recordId:'private-record-id',rowVersion:'private-row-version',token:'not-exported-token',password:'not-exported-password'}:{activity:{candidateName:'候補者名',recordId:'private-record-id',rowVersion:'private-row-version',interviewProfile:profile,token:'not-exported-token',password:'not-exported-password'}};
  const original=structuredClone(profile);
  await h.render().submitMutation(action,input,'original-intake-operation');assert.equal(h.render().backgroundSave.intakeInput,true);assert.throws(()=>h.render().copyBackgroundIntakeInput(),{code:'INTAKE_INPUT_UNAVAILABLE'});
  profile.fields.workHistory='後から書き換えた職歴';profile.fields.crmTools.push('送信後の変更');profile.introduction='後から書き換えた紹介文';if(action==='saveCandidateProfile')input.introduction='後から書き換えた紹介文';
  failedWrite.reject(new SheetApiError('VALIDATION','入力の確認が必要です'));await flush();
  const failed=h.render();assert.equal(failed.backgroundSave.status,'failed');assert.equal(failed.backgroundSave.intakeInput,true);
  const expected=['INSUP NODE 面談情報（保存前の入力原文）',...interviewStringFields.map(key=>`${interviewFieldLabels[key]}：${original.fields[key]}`),'CRM：Salesforce、HubSpot','チャット：Slack、Chatwork','','クライアント共有用の紹介文',introduction].join('\n');
  assert.equal(failed.copyBackgroundIntakeInput(),expected);assert.equal(failed.copyBackgroundIntakeInput(),expected);assert.equal(h.calls.length,2,'Copying makes no request and does not retry a failed write');assert.equal(h.render().hasPendingSave,true);
  for(const secret of ['private-record-id','private-row-version','private-profile-version','not-exported-token','not-exported-password',token,'original-intake-operation','後から書き換えた','送信後の変更'])assert.equal(expected.includes(secret),false,secret);
  for(const secret of ['最初の職歴','原文の確認事項','最初の紹介文','HubSpot'])assert.equal(JSON.stringify(failed.backgroundSave).includes(secret),false,secret);
  assert.equal(JSON.stringify([...h.sessionStorage.values,...h.localStorage.values]).includes('最初の職歴'),false);
  failed.retryBackgroundSave();await flush();assert.equal(h.calls[2].options.operationId,'original-intake-operation');assert.deepEqual(h.calls[2].payload,h.calls[1].payload);assert.equal(h.render().backgroundSave.status,'saved');assert.equal(h.render().backgroundSave.intakeInput,false);assert.throws(()=>failed.copyBackgroundIntakeInput(),{code:'INTAKE_INPUT_UNAVAILABLE'});h.unmount();
 }
});

test('ordinary failed activities never offer private intake recovery',async()=>{
 const h=harness(call=>call.action==='snapshot'?snapshot:Promise.reject(new SheetApiError('VALIDATION','確認してください')),{storedToken:token});await flush();await h.render().submitMutation('saveActivity',{activity:{candidateName:'通常の成果',memo:'通常メモ'}},'ordinary-operation');await flush();assert.equal(h.render().backgroundSave.intakeInput,false);assert.throws(()=>h.render().copyBackgroundIntakeInput(),{code:'INTAKE_INPUT_UNAVAILABLE'});h.unmount();
});

test('session expiry removes failed private input and invalidates a previously retained copy callback',async()=>{
 const h=harness(call=>{if(call.action==='snapshot')return snapshot;if(call.action==='readInterviewAdvice')throw new SheetApiError('SESSION_EXPIRED','expired');throw new SheetApiError('VALIDATION','確認してください');},{storedToken:token});await flush();await h.render().submitMutation('saveCandidateProfile',{recordId:'private-record',rowVersion:'private-version',profileVersion:'',fields:{...blankInterviewFields(),workHistory:'失効した本人の職歴'},introduction:'失効した本人の紹介文'},'expiring-private-operation');await flush();const copy=h.render().copyBackgroundIntakeInput;assert.ok(copy().includes('失効した本人の職歴'));
 await assert.rejects(()=>h.render().readAdvice('2026-10'));assert.equal(h.render().authenticated,false);assert.equal(h.render().backgroundSave,null);assert.throws(copy,{code:'INTAKE_INPUT_UNAVAILABLE'});assert.throws(()=>h.render().copyBackgroundIntakeInput(),{code:'INTAKE_INPUT_UNAVAILABLE'});h.unmount();
});

test('dismissal logout new login and unmount never let an old recovery callback read a newer private job',async()=>{
 const h=harness(call=>{if(call.action==='snapshot')return snapshot;if(call.action==='login')return {token:`${token}-new-login`};if(call.action==='logout')return {loggedOut:true};throw new SheetApiError('VALIDATION','確認してください');},{storedToken:token});await flush();
 const input={recordId:'private-record',rowVersion:'private-version',profileVersion:'',fields:{...blankInterviewFields(),workHistory:'以前の職歴'},introduction:'以前の紹介文'};await h.render().submitMutation('saveCandidateProfile',input,'old-private-operation');await flush();const oldCopy=h.render().copyBackgroundIntakeInput;assert.ok(oldCopy().includes('以前の職歴'));await h.render().dismissBackgroundSave();assert.throws(oldCopy,{code:'INTAKE_INPUT_UNAVAILABLE'});await h.render().logout();assert.throws(oldCopy,{code:'INTAKE_INPUT_UNAVAILABLE'});
 await h.render().login('ND-001','new-login-password');await h.render().submitMutation('saveCandidateProfile',{...input,fields:{...blankInterviewFields(),workHistory:'新しいログイン後の職歴'}},'new-private-operation');await flush();assert.throws(oldCopy,{code:'STALE_SESSION'});const newCopy=h.render().copyBackgroundIntakeInput;assert.ok(newCopy().includes('新しいログイン後の職歴'));h.unmount();assert.throws(newCopy,{code:'INTAKE_INPUT_UNAVAILABLE'});
});

const writingAdminSnapshot={...snapshot,self:{playerId:'ADMIN',role:'admin'},writingFeature:true,writingPreferences:defaultWritingPreferences()};
function writingState(overrides={}) {
 return {kit:{generatedAt:'2026-10-20T00:00:00.000Z',source:'generated',style:'standard',preferenceVersion:'initial',
  sections:writingSectionIds.map(id=>({id,heading:`見出し ${id}`,lead:'以下の事実を確認してください。'})),
  coaching:writingTopicCodes.map(code=>({code,questions:['具体的な事実を確認できますか？'],actions:['確認内容を記録する。']}))},
  pending:false,configured:true,preferences:defaultWritingPreferences(),usage:{userRemaining:2,teamRemaining:9,resetAt:'2026-10-20T15:00:00.000Z'},...overrides};
}
const writingMethods=['readWritingKit','generateWritingKit','readWritingPreferences','saveWritingPreferences'];
const writingArgument=method=>method==='saveWritingPreferences'?defaultWritingPreferences():method.endsWith('Kit')?'standard':undefined;
const writingReply=method=>method.endsWith('Kit')?writingState():{preferences:{...defaultWritingPreferences(),version:'server-updated-version'}};

for(const method of ['readWritingKit','generateWritingKit']) test(`${method} sends only normalized style and never caller candidate text or reference material`,async()=>{
 const h=harness(call=>call.action==='snapshot'?snapshot:writingState(),{storedToken:token});await flush();
 for(const style of ['standard','concise',{style:'concise',candidateName:'非公開の候補者',memo:'内部面談メモ',referenceText:'固有名を含む参考文章',profile:{workHistory:'非公開経歴'},apiKey:'not-a-key'}]) {
  const result=await h.render()[method](style),call=h.calls.at(-1);
  assert.equal(result.kit.sections.length,6);assert.equal(call.action,method);assert.equal(call.target,endpoint);assert.equal(call.options.token,token);
  assert.deepEqual(Object.keys(call.payload),['style']);assert.equal(call.payload.style,style==='concise'?'concise':'standard');
  assert.doesNotMatch(JSON.stringify(call.payload),/非公開|内部面談|固有名|reference|candidate|profile|apiKey/);
 }
 assert.equal(h.render().snapshot,snapshot);assert.equal(h.render().authenticated,true);assert.equal(h.render().busy,false);
 assert.doesNotMatch(JSON.stringify([...h.sessionStorage.values,...h.localStorage.values]),/非公開|内部面談|固有名/);h.unmount();
});

test('all writing methods reject an unauthenticated call before making a request',async()=>{
 const h=harness(()=>{throw new Error('No network call is expected');});await flush();
 for(const method of writingMethods)await assert.rejects(()=>h.render()[method](writingArgument(method)),/ログインしてください/);
 assert.equal(h.calls.length,0);assert.equal(h.render().snapshot,null);h.unmount();
});

test('readWritingPreferences validates the actual fixed schema and has an empty outbound payload',async()=>{
 const expected={...defaultWritingPreferences(),version:'shared-preference-version',targetLength:600,tone:'plain'};
 const h=harness(call=>call.action==='snapshot'?snapshot:{preferences:expected},{storedToken:token});await flush();
 const result=await h.render().readWritingPreferences();assert.deepEqual(result,expected);
 assert.equal(h.calls.at(-1).action,'readWritingPreferences');assert.equal(Object.keys(h.calls.at(-1).payload).length,0);
 result.sectionOrder.reverse();assert.deepEqual(expected.sectionOrder,defaultWritingPreferences().sectionOrder);
 assert.equal(h.render().snapshot,snapshot);h.unmount();
});

test('saveWritingPreferences requires admin and blocks extra keys or source documents before sending',async()=>{
 const user=harness(()=>snapshot,{storedToken:token});await flush();
 await assert.rejects(()=>user.render().saveWritingPreferences(defaultWritingPreferences()),/管理者/);assert.equal(user.calls.length,1);user.unmount();
 const h=harness(call=>call.action==='snapshot'?writingAdminSnapshot:{preferences:defaultWritingPreferences()},{storedToken:token});await flush();
 for(const invalid of [{...defaultWritingPreferences(),referenceText:'非公開の参考文'},
  {...defaultWritingPreferences(),candidateName:'非公開候補者'}, {...defaultWritingPreferences(),targetLength:200},
  {...defaultWritingPreferences(),sectionOrder:['basic','basic','results','tools','availability','summary']}]) {
  await assert.rejects(()=>h.render().saveWritingPreferences(invalid));
 }
 assert.equal(h.calls.length,1);assert.equal(h.render().snapshot,writingAdminSnapshot);
 assert.doesNotMatch(JSON.stringify([...h.sessionStorage.values,...h.localStorage.values]),/非公開/);h.unmount();
});

test('confirmed preference save updates only snapshot preferences using the validated server version',async()=>{
 const pending=deferred(),h=harness(call=>call.action==='snapshot'?writingAdminSnapshot:pending.promise,{storedToken:token});await flush();
 const source={...defaultWritingPreferences(),tone:'plain',targetLength:600},original=structuredClone(source);
 const save=h.render().saveWritingPreferences(source),call=h.calls.at(-1);
 source.sectionOrder.reverse();assert.deepEqual(call.payload.preferences,original,'In-flight settings own their section order');
 assert.deepEqual(Object.keys(call.payload),['preferences']);assert.equal(call.options.token,token);
 assert.equal(h.render().snapshot,writingAdminSnapshot);assert.equal(h.render().busy,false);
 const saved={...original,version:'confirmed-server-version'};pending.resolve({preferences:saved});
 assert.deepEqual(await save,saved);
 const updated=h.render().snapshot;assert.deepEqual(updated.writingPreferences,saved);
 assert.equal(updated.players,writingAdminSnapshot.players);assert.equal(updated.activities,writingAdminSnapshot.activities);
 assert.equal(updated.counts,writingAdminSnapshot.counts);assert.equal(updated.syncedAt,writingAdminSnapshot.syncedAt);
 assert.equal(writingAdminSnapshot.writingPreferences.version,'initial');
 assert.doesNotMatch(JSON.stringify([...h.sessionStorage.values,...h.localStorage.values]),/confirmed-server-version/);h.unmount();
});

for(const method of writingMethods)test(`${method} rejects a late response after logout and a different login without updating the new account`,async()=>{
 const pending=deferred(),newToken=`${token}-new-account`,newSnapshot={...snapshot,writingPreferences:{...defaultWritingPreferences(),version:'new-account-settings'}};
 const h=harness(call=>call.action==='snapshot'?writingAdminSnapshot:call.action==='logout'?{}:call.action==='login'?{token:newToken,snapshot:newSnapshot}:pending.promise,{storedToken:token});await flush();
 const request=h.render()[method](writingArgument(method));assert.equal(h.calls.at(-1).options.token,token);
 await h.render().logout();await h.render().login('ND-001','not-stored-password');const updates=h.updates();
 pending.resolve(writingReply(method));await assert.rejects(request,/ログイン状態が変更されました/);
 assert.equal(h.updates(),updates);assert.equal(h.render().snapshot,newSnapshot);assert.equal(h.render().authenticated,true);
 assert.equal(JSON.parse(h.sessionStorage.getItem(SESSION_KEY)).token,newToken);h.unmount();
});

for(const method of writingMethods)test(`${method} retained from a previous login cannot send using a new account token`,async()=>{
 const newToken=`${token}-different-login`,newSnapshot={...snapshot,writingPreferences:{...defaultWritingPreferences(),version:'new-account-settings'}};
 const h=harness(call=>call.action==='snapshot'?writingAdminSnapshot:call.action==='logout'?{}:call.action==='login'?{token:newToken,snapshot:newSnapshot}:writingReply(method),{storedToken:token});await flush();
 const retained=h.render()[method];
 await h.render().logout();await h.render().login('ND-001','not-stored-password');
 const count=h.calls.length,updates=h.updates();
 await assert.rejects(()=>retained(writingArgument(method)),/ログイン状態が変更されました/);
 assert.equal(h.calls.length,count,'An old callback cannot make an authenticated request with the new token');
 assert.equal(h.updates(),updates);assert.equal(h.render().snapshot,newSnapshot);assert.equal(h.render().authenticated,true);
 assert.equal(JSON.parse(h.sessionStorage.getItem(SESSION_KEY)).token,newToken);h.unmount();
});

for(const method of writingMethods)test(`${method} clears an expired session but preserves data after a transient failure`,async()=>{
 for(const failure of ['SESSION_EXPIRED','NETWORK']) {
  const h=harness(call=>{if(call.action==='snapshot')return writingAdminSnapshot;throw new SheetApiError(failure,'再確認してください。');},{storedToken:token});await flush();
  await assert.rejects(()=>h.render()[method](writingArgument(method)),{code:failure});
  assert.equal(h.calls.length,2);assert.equal(h.render().authenticated,failure==='NETWORK');
  assert.equal(h.render().snapshot,failure==='NETWORK'?writingAdminSnapshot:null);
  assert.equal(h.render().busy,false);assert.equal(h.sessionStorage.getItem(SESSION_KEY)!==null,failure==='NETWORK');h.unmount();
 }
});

for(const method of writingMethods)test(`${method} ignores a response after unmount`,async()=>{
 const pending=deferred(),h=harness(call=>call.action==='snapshot'?writingAdminSnapshot:pending.promise,{storedToken:token});await flush();
 const running=h.render()[method](writingArgument(method));h.unmount();const updates=h.updates();
 pending.resolve(writingReply(method));await assert.rejects(running,/ログイン状態が変更されました/);assert.equal(h.updates(),updates);
});

test('malformed writing kit or preference responses keep the original snapshot and session',async()=>{
 const invalidState=writingState();invalidState.kit.sections[0].id=invalidState.kit.sections[1].id;
 for(const [method,response] of [['readWritingKit',invalidState],['generateWritingKit',writingState({usage:{userRemaining:-1,teamRemaining:9,resetAt:'invalid'}})],
  ['readWritingPreferences',{preferences:{...defaultWritingPreferences(),sourceText:'non-shareable reference'}}],
  ['saveWritingPreferences',{preferences:{...defaultWritingPreferences(),sectionOrder:[]}}]]) {
  const h=harness(call=>call.action==='snapshot'?writingAdminSnapshot:response,{storedToken:token});await flush();
  await assert.rejects(()=>h.render()[method](writingArgument(method)));assert.equal(h.render().snapshot,writingAdminSnapshot);
  assert.equal(h.render().authenticated,true);assert.equal(h.render().busy,false);assert.ok(h.sessionStorage.getItem(SESSION_KEY));h.unmount();
 }
});

test('background snapshot refresh keeps a pending writing result valid and preference saves preserve refreshed data',async()=>{
 const pending=deferred(),refreshed={...writingAdminSnapshot,syncedAt:'2026-10-20T02:00:00Z'};let reads=0;
 const h=harness(call=>call.action==='snapshot'?(++reads===1?writingAdminSnapshot:refreshed):pending.promise,{storedToken:token});await flush();
 const save=h.render().saveWritingPreferences(defaultWritingPreferences());await h.render().refresh(true);
 const saved={...defaultWritingPreferences(),version:'confirmed-after-refresh'};pending.resolve({preferences:saved});await save;
 assert.equal(h.render().snapshot.syncedAt,refreshed.syncedAt);assert.deepEqual(h.render().snapshot.writingPreferences,saved);
 assert.equal(h.render().snapshot.players,refreshed.players);h.unmount();
});


test('a local commit completes while Google is stalled and independent saves queue in order',async()=>{
 const first=deferred(),second=deferred();let writes=0;
 const h=harness(call=>call.action==='snapshot'?snapshot:(++writes===1?first.promise:second.promise),{storedToken:token});await flush();
 await h.render().submitMutation('updateRecord',{recordId:'one',changes:{13:'first'}},'queued-operation-one');await flush();
 await h.render().submitMutation('updateRecord',{recordId:'two',changes:{13:'second'}},'queued-operation-two');await flush();
 assert.equal(h.pendingStore.size,2);assert.equal(writes,1);assert.equal(h.render().backgroundSave.pendingCount,2);assert.equal(h.render().busy,false);
 assert.equal(h.render().backgroundSave.localSaved,true);
 first.resolve({snapshot});await flush();assert.equal(writes,2);assert.equal(h.pendingStore.size,1);assert.equal(h.calls[2].payload.recordId,'two');
 second.resolve({snapshot});await flush();assert.equal(h.pendingStore.size,0);assert.equal(h.render().hasPendingSave,false);h.unmount();
});

test('acceptance waits for the local transaction and local storage failure leaves Google untouched',async()=>{
 const local=deferred();const h=harness(call=>call.action==='snapshot'?snapshot:new Promise(()=>{}),{storedToken:token,persistLocal:()=>local.promise});await flush();
 let accepted=false;const saving=h.render().submitMutation('updateRecord',{recordId:'one',changes:{13:'kept input'}},'local-operation-one').then(()=>{accepted=true;});await flush();
 assert.equal(accepted,false);assert.equal(h.calls.length,1);local.resolve();await saving;await flush();assert.equal(accepted,true);assert.equal(h.pendingStore.size,1);h.unmount();
 const broken=harness(()=>snapshot,{storedToken:token,persistLocal:async()=>{throw new Error('端末の容量不足');}});await flush();
 await assert.rejects(broken.render().submitMutation('updateRecord',{recordId:'one',changes:{13:'keep in form'}},'local-operation-two'),/容量不足/);
 assert.equal(broken.calls.length,1);assert.equal(broken.render().hasPendingSave,false);assert.equal(broken.pendingStore.size,0);broken.unmount();
});

test('an interrupted previous send restores privately without replaying until the user confirms the same operation',async()=>{
 const saved={operationId:'restored-operation-one',action:'updateRecord',payload:{recordId:'restored-row',changes:{13:'original private memo'}},label:'元の変更',details:['元の入力'],createdAt:1,attempted:true};
 const response=deferred();const h=harness(call=>call.action==='snapshot'?snapshot:response.promise,{storedToken:token,pendingSaves:[saved]});await flush();h.render();await flush();
 assert.equal(h.calls.length,1);assert.equal(h.render().backgroundSave.status,'failed');assert.equal(h.render().backgroundSave.uncertain,true);
 h.render().retryBackgroundSave();await flush();assert.equal(h.calls[1].options.operationId,saved.operationId);assert.deepEqual(h.calls[1].payload,saved.payload);
 response.resolve({snapshot});await flush();assert.equal(h.pendingStore.size,0);h.unmount();
});

test('a confirmed receipt releases saving before the separate dashboard read and read failures never replay the write',async()=>{
 let reads=0,writes=0;const refresh=deferred();
 const h=harness(call=>call.action==='snapshot'?(++reads===1?snapshot:refresh.promise):(writes++,{committed:true,operationId:call.options.operationId}),{storedToken:token});await flush();
 await h.render().submitMutation('updateRecord',{recordId:'one',changes:{13:'saved'}},'receipt-operation-one');await flush();
 assert.equal(h.render().backgroundSave.status,'saved');assert.equal(h.render().backgroundSave.refreshing,true);assert.equal(h.render().hasPendingSave,false);
 assert.equal(h.render().snapshot,snapshot);assert.equal(h.pendingStore.size,0);assert.equal(h.calls[1].options.responseMode,'receipt');assert.equal(reads,2);
 refresh.reject(new SheetApiError('NETWORK','read failed'));await flush();assert.equal(writes,1);assert.equal(h.render().backgroundSave.status,'saved');assert.match(h.render().syncError,/自動同期/);h.unmount();
});

test('a mismatched commit receipt cannot confirm another write or remove its local input',async()=>{
 const h=harness(call=>call.action==='snapshot'?snapshot:{committed:true,operationId:'another-operation-id'},{storedToken:token});await flush();
 await h.render().submitMutation('updateRecord',{recordId:'one',changes:{13:'must remain'}},'receipt-operation-two');await flush();
 assert.equal(h.render().backgroundSave.status,'failed');assert.equal(h.render().backgroundSave.uncertain,true);assert.equal(h.pendingStore.size,1);h.unmount();
});

test("definite rejection can be corrected atomically with a fresh operation and preserved revision",async()=>{
 const head=deferred(),tail=deferred();let writes=0;
 const h=harness(call=>{if(call.action==="snapshot")return snapshot;if(++writes===1)throw new SheetApiError("VALIDATION","会社名を確認してください");return writes===2?head.promise:tail.promise;},{storedToken:token});await flush();
 const original={recordId:"record-one",rowVersion:"original-version",changes:{2:"間違い",13:"残す原文"}};
 await h.render().submitMutation("updateRecord",original,"first_operation_123456");await flush();
 assert.equal(h.render().backgroundSave.uncertain,false);assert.equal(h.render().backgroundSave.editable,true);
 const stale=h.render().readBackgroundSaveCorrection,draft=stale("first_operation_123456");draft.fields[0].value="do not mutate retained input";
 assert.equal(h.render().readBackgroundSaveCorrection("first_operation_123456").fields[0].value,"間違い");
 await h.render().submitMutation("updateRecord",{recordId:"other",changes:{13:"別の候補者"}},"second_operation_123456");
 await h.render().correctBackgroundSave("first_operation_123456",{"2":"修正会社"});await flush();
 const sent=h.calls.filter(call=>call.action==="updateRecord");assert.equal(sent.length,2);assert.notEqual(sent[1].options.operationId,sent[0].options.operationId);
 assert.equal(sent[1].payload.rowVersion,"original-version");assert.equal(sent[1].payload.changes[13],"残す原文");assert.equal(sent[1].payload.changes[2],"修正会社");assert.equal(h.pendingStore.size,2);assert.ok(!h.pendingStore.has("first_operation_123456"));
 assert.throws(()=>stale("first_operation_123456"),/保存状況/);
 head.resolve({committed:true,operationId:sent[1].options.operationId});await flush();assert.equal(h.calls.filter(call=>call.action==="updateRecord").length,3);
 tail.resolve({committed:true,operationId:"second_operation_123456"});await flush();assert.equal(h.pendingStore.size,0);h.unmount();
});

test("a failed corrective local transaction retains the previous payload and accepts a later retry",async()=>{
 let attempts=0;const h=harness(call=>call.action==="snapshot"?snapshot:Promise.reject(new SheetApiError("VALIDATION","入力エラー")),{storedToken:token,replaceLocal:async()=>{if(!attempts++)throw new Error("端末の保存に失敗");}});await flush();
 await h.render().submitMutation("createCandidate",{candidateName:"元の名前",company:"元会社",position:"アポインター"},"correct_local_12345678");await flush();
 await assert.rejects(h.render().correctBackgroundSave("correct_local_12345678",{company:"修正会社"}),/端末の保存/);
 assert.equal(h.pendingStore.size,1);assert.equal(h.pendingStore.get("correct_local_12345678").payload.company,"元会社");assert.equal(h.render().backgroundSave.operationId,"correct_local_12345678");assert.equal(h.calls.filter(call=>call.action==="createCandidate").length,1);
 await h.render().correctBackgroundSave("correct_local_12345678",{company:"修正会社"});await flush();assert.equal(h.calls.filter(call=>call.action==="createCandidate").length,2);h.unmount();
});

test("unknown network outcomes cannot be edited and require same-ID confirmation",async()=>{
 const h=harness(call=>call.action==="snapshot"?snapshot:Promise.reject(new SheetApiError("TIMEOUT","結果未確認")),{storedToken:token});await flush();
 await h.render().submitMutation("createCandidate",{candidateName:"架空候補者",company:"架空会社"},"uncertain_edit_123456");await flush();
 assert.throws(()=>h.render().readBackgroundSaveCorrection("uncertain_edit_123456"),/未確認/);
 await assert.rejects(h.render().correctBackgroundSave("uncertain_edit_123456",{company:"修正"}),/未確認/);
 assert.equal(h.pendingStore.size,1);h.render().retryBackgroundSave();await flush();assert.ok(h.calls.filter(call=>call.action==="createCandidate").every(call=>call.options.operationId==="uncertain_edit_123456"));h.unmount();
});

test("future actual dates fail before local acceptance or Google transmission",async()=>{
 const h=harness(()=>snapshot,{storedToken:token});await flush();
 await assert.rejects(h.render().submitMutation("updateRecord",{changes:{17:"2099-01-01"}},"future_date_12345678"),/今日/);
 assert.equal(h.pendingStore.size,0);assert.ok(h.calls.every(call=>call.action==="snapshot"));h.unmount();
});

test("login sends this device's signed token and stores the refreshed one without the password",async()=>{
  const first="d1.1900000000000."+"a".repeat(43)+"."+"b".repeat(43),second="d1.1900000000001."+"c".repeat(43)+"."+"d".repeat(43);
  const h=harness(call=>call.action==="login" ? {token,deviceToken:first} : snapshot);
  await flush();await h.render().login("nd-001","device-test-password");await flush();
  assert.equal("deviceToken" in h.calls.find(call=>call.action==="login").payload,false,"A new device sends no token");
  assert.equal(h.calls.find(call=>call.action==="login").payload.idleAware,true,"This frontend reports activity, so its session is idle-checked");
  assert.ok(h.localStorage.getItem("insup.node.devices.v1").includes(first));
  assert.ok(!JSON.stringify([...h.localStorage.values]).includes("device-test-password"));
  await h.render().logout();await flush();
  const again=harness(call=>call.action==="login" ? {token,deviceToken:second} : snapshot);
  again.localStorage.setItem("insup.node.devices.v1",h.localStorage.getItem("insup.node.devices.v1"));
  await flush();await again.render().login(" ND-001 ","device-test-password");await flush();
  assert.equal(again.calls.find(call=>call.action==="login").payload.deviceToken,first,"IDs are matched case-insensitively");
  assert.ok(again.localStorage.getItem("insup.node.devices.v1").includes(second));
  h.unmount();again.unmount();
});

test("the outbox is unlocked with the snapshot secret and locked again when the session ends",async()=>{
  const secret="S".repeat(43),h=harness(call=>call.action==="snapshot" ? {...snapshot,outboxKey:secret} : {snapshot},{storedToken:token});
  await flush();await flush();
  h.render();await flush();
  assert.ok(h.unlocks.includes(secret),"The draft key comes from the signed-in snapshot");
  const before=h.locks.count;await h.render().logout();await flush();
  assert.ok(h.locks.count>before,"Logout forgets the derived key");
  h.unmount();
});

test("an issued-password login opens the forced change state without reading data or storing the password",async()=>{
  const h=harness(call=>call.action==="login"?{token,mustChangePassword:true}:call.action==="changePassword"?{changed:true}:snapshot);
  await flush();
  await h.render().login("ND-003","issued-private-password");
  const state=h.render();
  assert.equal(state.authenticated,true); assert.equal(state.mustChangePassword,true); assert.equal(state.snapshot,null);
  assert.equal(state.busy,false); assert.equal(state.loadPhase,null); assert.equal(state.error,"");
  assert.ok(!h.calls.some(call=>call.action==="snapshot"),"An issued password requests no business data");
  assert.equal(JSON.parse(h.sessionStorage.getItem(SESSION_KEY)).token,token);
  assert.ok(!JSON.stringify([...h.sessionStorage.values,...h.localStorage.values]).includes("issued-private-password"));
  await h.render().changePassword("issued-private-password","new-private-password");
  assert.equal(h.render().authenticated,false); assert.equal(h.render().mustChangePassword,false);
  assert.equal(h.sessionStorage.getItem(SESSION_KEY),null);
  assert.deepEqual(h.calls.map(call=>call.action),["login","changePassword"]);
  assert.equal(h.calls[1].options.token,token);
  assert.ok(!JSON.stringify([...h.sessionStorage.values,...h.localStorage.values]).includes("private-password"));
  h.unmount();
});

test("a restored session that requires a change keeps its token and shows no error",async()=>{
  const h=harness(()=>{throw new SheetApiError("PASSWORD_CHANGE_REQUIRED","初期パスワードの変更が必要です。");},{storedToken:token});
  await flush();
  const state=h.render();
  assert.equal(state.ready,true); assert.equal(state.authenticated,true); assert.equal(state.mustChangePassword,true);
  assert.equal(state.error,""); assert.equal(state.busy,false); assert.equal(state.snapshot,null);
  assert.equal(JSON.parse(h.sessionStorage.getItem(SESSION_KEY)).token,token);
  assert.equal(h.locks.count,0,"The session is not cleared");
  h.unmount();
});

test("a change requirement reported by the first snapshot is not treated as a failure",async()=>{
  const h=harness(call=>{if(call.action==="login")return {token};throw new SheetApiError("PASSWORD_CHANGE_REQUIRED","初期パスワードの変更が必要です。");});
  await flush();
  await h.render().login("ND-003","issued-private-password");
  const state=h.render();
  assert.equal(state.authenticated,true); assert.equal(state.mustChangePassword,true); assert.equal(state.error,"");
  assert.equal(state.busy,false); assert.equal(state.loadPhase,null);
  assert.equal(JSON.parse(h.sessionStorage.getItem(SESSION_KEY)).token,token);
  h.unmount();
});

test("logout from the forced change state calls server logout and resets the flag",async()=>{
  const h=harness(call=>call.action==="login"?{token,mustChangePassword:true}:call.action==="logout"?{loggedOut:true}:snapshot);
  await flush();
  await h.render().login("ND-003","issued-private-password");
  assert.equal(h.render().mustChangePassword,true);
  await h.render().logout(); await flush();
  const logouts=h.calls.filter(call=>call.action==="logout");
  assert.equal(logouts.length,1); assert.equal(logouts[0].options.token,token);
  assert.equal(h.render().mustChangePassword,false); assert.equal(h.render().authenticated,false);
  assert.equal(h.sessionStorage.getItem(SESSION_KEY),null);
  h.unmount();
});

test("password change still requires loaded data or the forced change state",async()=>{
  const h=harness(call=>{if(call.action==="login")return {token};throw new SheetApiError("NETWORK","一時的な通信失敗");});
  await flush();
  await h.render().login("ND-001","only-a-test-password");
  assert.equal(h.render().authenticated,true); assert.equal(h.render().mustChangePassword,false); assert.equal(h.render().snapshot,null);
  await assert.rejects(h.render().changePassword("only-a-test-password","new-private-password"),/ログインしてください。/);
  assert.ok(!h.calls.some(call=>call.action==="changePassword"));
  h.unmount();
});

const readLimited='短時間の読み込みが多すぎます。約42秒後に再試行してください。表示中のデータと未同期の入力はそのまま残ります。';
test('RATE_LIMITED snapshots keep the session, data and outbox lock state, show the wait and never auto-retry',async()=>{
  const browser=autoSyncBrowser();let reads=0;
  const h=harness(call=>{if(call.action==='snapshot'){if(++reads===1)return snapshot;throw new SheetApiError('RATE_LIMITED',readLimited);}return {};},{storedToken:token,browser});
  await flush();h.render();const locks=h.locks.count;
  await browser.advance();
  assert.equal(reads,2,'A limited read is not replayed');
  assert.equal(h.render().authenticated,true);assert.equal(h.render().snapshot,snapshot);assert.equal(h.render().error,'');
  assert.equal(h.render().syncError,readLimited,'The automatic notice names the server wait');
  assert.equal([...browser.timers.values()][0].delay,60_000);
  await assert.rejects(h.render().refresh(),e=>e.code==='RATE_LIMITED');
  assert.equal(h.render().snapshot,snapshot);assert.match(h.render().error,/秒後に再試行/);assert.equal(h.render().busy,false);
  assert.ok(h.sessionStorage.getItem(SESSION_KEY));assert.equal(h.locks.count,locks);
  h.unmount();
});

test('a RATE_LIMITED first read after login shows recovery without discarding the token',async()=>{
  const h=harness(call=>{if(call.action==='login')return {token};throw new SheetApiError('RATE_LIMITED',readLimited);});
  await flush();await h.render().login('ND-001','only-a-test-password');
  assert.equal(h.render().authenticated,true);assert.equal(h.render().snapshot,null);assert.equal(h.render().error,readLimited);
  assert.equal(JSON.parse(h.sessionStorage.getItem(SESSION_KEY)).token,token);
  h.unmount();
});

/* Idle timeout: the server counts every request except a poll marked background. */
const idleMessage='60分以上操作がなかったため、ログアウトしました。もう一度ログインしてください。';
const snapshotCalls=h=>h.calls.filter(call=>call.action==='snapshot');
const touchCalls=h=>h.calls.filter(call=>call.action==='touch');

test('automatic polls are passive unless someone gave input since the last report',async()=>{
  const browser=autoSyncBrowser();
  const h=harness(call=>call.action==='snapshot'?snapshot:{},{storedToken:token,browser});
  await flush();h.render();
  assert.equal(snapshotCalls(h)[0].options.background,undefined,'Restoring a page is user activity');
  await browser.advance();
  assert.equal(snapshotCalls(h)[1].options.background,true);
  browser.listeners.get('keydown')();
  await browser.advance();
  assert.equal(snapshotCalls(h)[2].options.background,undefined,'Input since the last report makes the next poll count');
  await browser.advance();
  assert.equal(snapshotCalls(h)[3].options.background,true,'Each input is reported once');
  for(const name of ['pointerdown','wheel','input']){browser.listeners.get(name)();await browser.advance();assert.equal(snapshotCalls(h).at(-1).options.background,undefined,name);}
  browser.listeners.get('focus')();await flush();
  await browser.advance();assert.equal(snapshotCalls(h).at(-1).options.background,true,'Focus alone is not activity');
  await h.render().refresh();assert.equal(snapshotCalls(h).at(-1).options.background,undefined,'A manual refresh is activity');
  assert.equal(touchCalls(h).length,0,'A poll that reports input needs no separate touch');
  h.unmount();assert.equal(browser.listeners.size,0,'Input listeners are removed');
});

test('an idle expiry during a background poll returns to login and explains why',async()=>{
  const browser=autoSyncBrowser();let reads=0;
  const h=harness(call=>{if(call.action==='snapshot'&&++reads===2)throw new SheetApiError('UNAUTHENTICATED',idleMessage);return snapshot;},{storedToken:token,browser});
  await flush();h.render();const locks=h.locks.count;
  await browser.advance();
  assert.equal(snapshotCalls(h)[1].options.background,true);
  assert.equal(h.render().authenticated,false);assert.equal(h.render().snapshot,null);
  assert.equal(h.sessionStorage.getItem(SESSION_KEY),null);
  assert.ok(h.locks.count>locks,'Pending saves are locked with the session');
  assert.equal(h.render().error,idleMessage);
  h.unmount();
});

test('typing in an open editor keeps the session alive with a throttled touch and never closes it',async()=>{
  const browser=autoSyncBrowser();let touchResult=()=>({touched:true});
  const h=harness(call=>call.action==='touch'?touchResult():call.action==='snapshot'?snapshot:{},{storedToken:token,browser});
  await flush();h.render();
  browser.document.editorOpen=true;
  await browser.advance();
  assert.equal(touchCalls(h).length,0,'No input, no touch');
  browser.listeners.get('keydown')();await browser.advance();
  assert.equal(touchCalls(h).length,1);
  assert.equal(touchCalls(h)[0].options.token,token);assert.equal(touchCalls(h)[0].options.background,undefined);
  browser.listeners.get('keydown')();await browser.advance();
  assert.equal(touchCalls(h).length,1,'At most one touch a minute');
  await browser.advance();
  assert.equal(touchCalls(h).length,2);
  await browser.advance();await browser.advance();
  assert.equal(touchCalls(h).length,2,'Reported input is not sent again');
  touchResult=()=>{throw new SheetApiError('UNAUTHENTICATED',idleMessage);};
  browser.listeners.get('keydown')();await browser.advance();
  assert.equal(touchCalls(h).length,3);
  assert.equal(h.render().authenticated,true,'The open editor is not torn down');
  assert.equal(h.render().snapshot,snapshot);
  assert.match(h.render().syncError,/有効期限/);
  assert.equal(snapshotCalls(h).length,1,'The editor never got a snapshot underneath it');
  h.unmount();
});

test('a pending failed save does not stop input from keeping the session alive',async()=>{
  const browser=autoSyncBrowser();
  const h=harness(call=>call.action==='snapshot'?snapshot:call.action==='touch'?{touched:true}:Promise.reject(new SheetApiError('VALIDATION','入力の確認が必要です')),{storedToken:token,browser});
  await flush();h.render();
  await h.render().submitMutation('saveActivity',{activity:{candidateName:'保留候補',memo:'保留メモ'}},'failed-keepalive-operation');await flush();
  assert.equal(h.render().backgroundSave.status,'failed');
  const reads=snapshotCalls(h).length;
  browser.listeners.get('keydown')();await browser.advance();
  assert.equal(touchCalls(h).length,1);
  assert.equal(snapshotCalls(h).length,reads,'The poll stays paused behind the failed save');
  h.unmount();
});

test('an Apps Script deployment without touch is ignored quietly',async()=>{
  const browser=autoSyncBrowser();
  const h=harness(call=>{if(call.action==='touch')throw new SheetApiError('BAD_REQUEST','対応していない操作です。');return snapshot;},{storedToken:token,browser});
  await flush();h.render();browser.document.editorOpen=true;
  browser.listeners.get('keydown')();await browser.advance();
  assert.equal(touchCalls(h).length,1);
  assert.equal(h.render().syncError,'');assert.equal(h.render().error,'');assert.equal(h.render().authenticated,true);
  h.unmount();
});

test('a save cannot tell whether its activity refresh was deferred, so the next poll reports the input',async()=>{
  const browser=autoSyncBrowser();
  const h=harness(call=>call.action==='snapshot'?snapshot:{snapshot},{storedToken:token,browser});
  await flush();h.render();
  browser.listeners.get('keydown')();
  await h.render().mutate('updateProfile',{player:{name:'担当'}},'report-input-operation');
  await browser.advance();
  assert.equal(snapshotCalls(h).at(-1).options.background,undefined);
  await browser.advance();
  assert.equal(snapshotCalls(h).at(-1).options.background,true,'Once a poll has reported it, polls are passive again');
  assert.equal(touchCalls(h).length,0);
  h.unmount();
});

test('an expired session on a management read clears the session',async()=>{
  const admin={...snapshot,self:{playerId:'ADMIN',role:'admin'}};
  const h=harness(call=>{if(call.action==='snapshot')return admin;throw new SheetApiError('UNAUTHENTICATED',idleMessage);},{storedToken:token});
  await flush();const locks=h.locks.count;
  await assert.rejects(()=>h.render().readManagement('managementTables'),{code:'UNAUTHENTICATED'});
  assert.equal(h.sessionStorage.getItem(SESSION_KEY),null);
  assert.ok(h.locks.count>locks);
  assert.equal(h.render().authenticated,false);
  h.unmount();
});

test('a failed save that pauses the polls still lets an idle logout clear the screen',async()=>{
  const browser=autoSyncBrowser();let expired=false;
  const h=harness(call=>{
    if(call.action==='snapshot')return snapshot;
    if(call.action==='touch'){if(expired)throw new SheetApiError('UNAUTHENTICATED',idleMessage);return {touched:false};}
    return Promise.reject(new SheetApiError('VALIDATION','入力の確認が必要です'));
  },{storedToken:token,browser});
  await flush();h.render();
  await h.render().submitMutation('saveActivity',{activity:{candidateName:'保留候補',memo:'保留メモ'}},'failed-idle-operation');await flush();
  assert.equal(h.render().backgroundSave.status,'failed');
  const reads=snapshotCalls(h).length;
  await browser.advance();
  assert.equal(touchCalls(h).length,1,'Nobody typed, yet the session is checked');
  assert.equal(touchCalls(h)[0].options.background,true,'The check records no activity');
  assert.equal(h.render().authenticated,true);
  await browser.advance();
  assert.equal(touchCalls(h).length,1,'At most one check a minute');
  browser.document.editorOpen=true;expired=true;
  await browser.advance();await browser.advance();
  assert.equal(touchCalls(h).length,1,'An open editor is never checked out from under its user');
  browser.document.editorOpen=false;
  const locks=h.locks.count;
  await browser.advance();
  assert.equal(touchCalls(h).length,2);
  assert.equal(h.render().authenticated,false);assert.equal(h.render().snapshot,null);
  assert.equal(h.sessionStorage.getItem(SESSION_KEY),null);
  assert.ok(h.locks.count>locks,'The outbox key is locked with the session');
  assert.match(h.render().error,/60分以上操作がなかった/);assert.match(h.render().error,/この端末に残っています/);
  assert.ok(h.pendingStore.has('failed-idle-operation'),'The encrypted local copy stays for the next login');
  assert.equal(snapshotCalls(h).length,reads,'The poll stayed paused behind the failed save');
  h.unmount();
});

test('input the server could not record is reported again, and the expiry notice promises nothing it cannot keep',async()=>{
  const browser=autoSyncBrowser();let result=()=>({touched:false,deferred:true});
  const h=harness(call=>call.action==='touch'?result():snapshot,{storedToken:token,browser});
  await flush();h.render();browser.document.editorOpen=true;
  browser.listeners.get('keydown')();await browser.advance();
  assert.equal(touchCalls(h).length,1);
  await browser.advance();
  assert.equal(touchCalls(h).length,1,'Still at most one touch a minute');
  result=()=>({touched:true});
  await browser.advance();
  assert.equal(touchCalls(h).length,2,'The deferred input is sent again');
  assert.equal(touchCalls(h)[1].options.background,undefined);
  await browser.advance();await browser.advance();
  assert.equal(touchCalls(h).length,2,'Recorded input is not sent again');
  result=()=>{throw new SheetApiError('UNAUTHENTICATED',idleMessage);};
  browser.listeners.get('keydown')();await browser.advance();
  assert.equal(h.render().authenticated,true,'The open editor is not torn down');
  assert.match(h.render().syncError,/画面によっては入力中の内容が残りません/);
  assert.doesNotMatch(h.render().syncError,/保存時にこの端末へ残ります/);
  h.unmount();
});

test('a poll whose activity the server deferred leaves the input for the next poll',async()=>{
  const browser=autoSyncBrowser();let reads=0;
  const h=harness(call=>call.action==='snapshot'?(++reads===2?{...snapshot,activityDeferred:true}:snapshot):{},{storedToken:token,browser});
  await flush();h.render();
  browser.listeners.get('keydown')();
  await browser.advance();
  assert.equal(snapshotCalls(h)[1].options.background,undefined);
  await browser.advance();
  assert.equal(snapshotCalls(h)[2].options.background,undefined,'Deferred activity is reported again');
  await browser.advance();
  assert.equal(snapshotCalls(h)[3].options.background,true);
  assert.equal(touchCalls(h).length,0);
  h.unmount();
});
