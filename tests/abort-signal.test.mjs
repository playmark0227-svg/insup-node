import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(fs.readFileSync(new URL('../lib/abort-signal.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function runtime({nativeTimeout,legacyReason=false}={}) {
  const timers=new Map();let serial=0;
  // These stand-ins deliberately omit all three modern signal convenience APIs.
  class LegacySignal {
    aborted=false;listeners=new Set();
    addEventListener(_name,listener){this.listeners.add(listener);}
    removeEventListener(_name,listener){this.listeners.delete(listener);}
  }
  class LegacyController {
    signal=new LegacySignal();
    abort(){if(this.signal.aborted)return;this.signal.aborted=true;for(const listener of [...this.signal.listeners])listener();}
  }
  const exports={};
  vm.runInNewContext(source,{exports,AbortController:legacyReason?LegacyController:AbortController,AbortSignal:{timeout:nativeTimeout},
    setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)});
  return {...exports,timers,fire:()=>{const [id,timer]=[...timers][0];timers.delete(id);timer.fn();}};
}

test('fallback deadline aborts at 45 seconds and retains TimeoutError without signal.reason',()=>{
  for(const legacyReason of [false,true]) {
    const api=runtime({legacyReason}),deadline=api.createDeadlineSignal(45_000);
    assert.equal(api.timers.size,1);assert.equal([...api.timers.values()][0].delay,45_000);
    assert.equal(deadline.signal.aborted,false);assert.equal(deadline.timedOut(),false);
    api.fire();assert.equal(deadline.signal.aborted,true);assert.equal(deadline.timedOut(),true);
    assert.equal(api.isTimeoutSignal(deadline.signal),true);assert.equal(api.abortReason(deadline.signal).name,'TimeoutError');
    assert.throws(()=>api.throwIfAborted(deadline.signal),{name:'TimeoutError'});assert.equal(api.timers.size,0);
    deadline.dispose();assert.equal(api.timers.size,0);
  }
});

test('source cancellation removes every source listener and timer without aborting other callers',()=>{
  const api=runtime(),first=new AbortController(),second=new AbortController();
  const listeners=new Map([[first.signal,new Set()],[second.signal,new Set()]]);
  for(const signal of listeners.keys()) {
    const add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
    signal.addEventListener=(name,listener,options)=>{listeners.get(signal).add(listener);add(name,listener,options);};
    signal.removeEventListener=(name,listener,options)=>{listeners.get(signal).delete(listener);remove(name,listener,options);};
  }
  const deadline=api.createDeadlineSignal(45_000,[first.signal,second.signal]);
  assert.ok([...listeners.values()].every(set=>set.size===1));assert.equal(api.timers.size,1);
  const reason=new Error('account changed');first.abort(reason);
  assert.equal(deadline.signal.aborted,true);assert.equal(api.abortReason(deadline.signal),reason);
  assert.equal(second.signal.aborted,false);assert.equal(deadline.timedOut(),false);assert.equal(api.timers.size,0);
  assert.ok([...listeners.values()].every(set=>set.size===0));deadline.dispose();
});

test('normal completion disposes fallback timers and detaches future caller cancellation',()=>{
  const api=runtime(),caller=new AbortController(),deadline=api.createDeadlineSignal(45_000,[caller.signal]);
  assert.equal(api.timers.size,1);deadline.dispose();deadline.dispose();assert.equal(api.timers.size,0);
  caller.abort();assert.equal(deadline.signal.aborted,false);assert.equal(deadline.timedOut(),false);
});

test('an existing caller deadline propagates timeout classification through nested requests',()=>{
  const api=runtime({legacyReason:true}),login=api.createDeadlineSignal(45_000),snapshot=api.createDeadlineSignal(45_000,[login.signal]);
  assert.equal(api.timers.size,2);api.fire();assert.equal(api.timers.size,0);
  assert.equal(login.timedOut(),true);assert.equal(snapshot.timedOut(),true);assert.equal(api.isTimeoutSignal(snapshot.signal),true);
  assert.throws(()=>api.throwIfAborted(snapshot.signal),{name:'TimeoutError'});
});

test('an already cancelled caller creates no fallback timer or request window',()=>{
  const api=runtime(),caller=new AbortController();caller.abort();
  const deadline=api.createDeadlineSignal(45_000,[caller.signal]);assert.equal(deadline.signal.aborted,true);
  assert.equal(api.timers.size,0);assert.equal(deadline.timedOut(),false);assert.throws(()=>api.throwIfAborted(deadline.signal),{name:'AbortError'});
});

test('native timeout compatibility is retained while source listeners are disposed after completion',()=>{
  const timer=new AbortController();let durations=[];
  const api=runtime({nativeTimeout:ms=>(durations.push(ms),timer.signal)}),deadline=api.createDeadlineSignal(45_000);
  assert.deepEqual(durations,[45_000]);assert.equal(api.timers.size,0);deadline.dispose();
  timer.abort(new DOMException('deadline','TimeoutError'));assert.equal(deadline.signal.aborted,false);
});

test('invalid deadlines and failed listener setup cannot leak fallback timers',()=>{
  const api=runtime();for(const ms of [0,-1,NaN,Infinity])assert.throws(()=>api.createDeadlineSignal(ms),{name:'RangeError'});
  assert.equal(api.timers.size,0);
  assert.throws(()=>api.createDeadlineSignal(45_000,[{aborted:false,addEventListener(){throw new Error('setup failure');}}]),/setup failure/);
  assert.equal(api.timers.size,0);
});
