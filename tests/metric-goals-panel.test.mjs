import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import * as goals from '../lib/metric-goals.ts';
import {SheetApiError,isUncertainWrite} from '../lib/sheets-client.ts';
const source=ts.transpileModule(fs.readFileSync(new URL('../components/metric-goals.tsx',import.meta.url),'utf8').replace('function MetricGoalsSession(','export function MetricGoalsSession('),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const copy=value=>JSON.parse(JSON.stringify(value));
const nodes=v=>!v||typeof v!=='object'?[]:Array.isArray(v)?v.flatMap(nodes):[v,...nodes(v.props?.children)];
const text=v=>v==null||typeof v==='boolean'?'':typeof v==='string'||typeof v==='number'?String(v):Array.isArray(v)?v.map(text).join(''):text(v.props?.children);
function harness(overrides={}){
 let cursor=0;const slots=[],effects=[],reads=[],saves=[],dirty=[],pending=[];
 const server={feature:true,month:'2026-11',today:'2026-11-10',checkedAt:'2026-11-10T01:00:00Z',players:[{id:'ND-001',name:'架空メンバー',active:true}],goals:[],legacyProposalGoals:[],counts:{'ND-001':goals.emptyMetricCounts()},dailyCounts:{}};
 const props={identityKey:'session-a',active:true,refreshRevision:'revision-a',enabled:true,canWrite:true,admin:false,selfPlayerId:'ND-001',currentMonth:'2026-11',onRead:async payload=>{reads.push(copy(payload));return copy({...server,month:payload.month,goals:server.goals.filter(g=>g.month===payload.month),legacyProposalGoals:server.legacyProposalGoals.filter(g=>g.month===payload.month)});},onSave:async(payload,id)=>{saves.push({payload:copy(payload),id});server.goals=[...server.goals.filter(g=>g.month!==payload.month),{...copy(payload),version:'new-version',updatedAt:'2026-11-10T01:00:01Z'}];if(payload.targets['提案']!==null)server.legacyProposalGoals=[{playerId:payload.playerId,month:payload.month,target:payload.targets['提案'],version:'new-version',updatedAt:'2026-11-10T01:00:01Z'}];return{committed:true,operationId:id};},onDirtyChange:v=>dirty.push(v),onPendingChange:v=>pending.push(v),...overrides};
 const react={useState(initial){const i=cursor++,slot=slots[i]||={value:typeof initial==='function'?initial():initial};return[slot.value,value=>{slot.value=typeof value==='function'?value(slot.value):value;}];},useRef(initial){return slots[cursor++]||={current:initial};},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const jsx=(type,props,key)=>({type,props:props||{},key}),exports={};vm.runInNewContext(source,{exports,module:{exports},crypto:{randomUUID},Date,Intl,Set,Map,Error,require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('metric-goals')&&!name.endsWith('.css')?goals:name.includes('sheets-client')?{isUncertainWrite}:name.includes('unsaved-work')?{useUnsavedChangesWarning:()=>{}}:name.endsWith('.css')?{}:new Proxy({},{get:(_,key)=>key})});
 const render=next=>{Object.assign(props,next);cursor=0;const tree=exports.MetricGoalsSession(props);while(effects.length)effects.shift()();return tree;},all=()=>nodes(render()),find=(type,label)=>all().find(n=>n.type===type&&(n.props['aria-label']===label||text(n)===label));
 const click=label=>{const button=all().find(n=>n.type==='button'&&text(n).includes(label));assert.ok(button,label);assert.equal(!!button.props.disabled,false);button.props.onClick?.();},change=(label,value)=>{const input=find('input',label);assert.ok(input,label);assert.equal(!!input.props.disabled,false);input.props.onChange({target:{value}});};
 return{props,server,reads,saves,dirty,pending,render,all,find,click,change,settle:async()=>{for(let n=0;n<30;n++){await Promise.resolve();render();}}};
}

test('hidden metric goals perform no reads and recent month visits use only their first verified request',async t=>{
 let now=1_000_000;t.mock.method(Date,'now',()=>now);const h=harness({active:false});h.render();await h.settle();assert.equal(h.reads.length,0);
 h.render({active:true});await h.settle();assert.equal(h.reads.length,1);h.render({active:false});h.render({active:true});await h.settle();assert.equal(h.reads.length,1);
 h.change('7工程目標の対象月','2026-09');await h.settle();assert.equal(h.reads.length,2);h.change('7工程目標の対象月','2026-11');await h.settle();assert.equal(h.reads.length,2);assert.match(text(h.render()),/2026-11のチーム比較/);
 h.click('最新を取得');await h.settle();assert.equal(h.reads.length,3);now+=30_001;h.render({active:false});h.render({active:true});await h.settle();assert.equal(h.reads.length,4);
});

test('goal snapshot changes immediately hide old values and disabled late reads cannot restore them',async()=>{
 let count=0,finish;const h=harness({onRead:payload=>{count++;return count===1?Promise.resolve(copy({...h.server,month:payload.month})):new Promise(resolve=>{finish=resolve;});}});h.render();await h.settle();assert.match(text(h.render()),/架空メンバー/);
 assert.doesNotMatch(text(h.render({refreshRevision:'revision-b'})),/架空メンバー/);h.render({enabled:false});finish(copy(h.server));await h.settle();assert.doesNotMatch(text(h.render()),/架空メンバー/);
 h.render({enabled:true});assert.equal(count,3);assert.doesNotMatch(text(h.render()),/架空メンバー/);
});

test('changing months during a delayed goal read queues one current-month read and keeps an existing draft',async()=>{
 let finish;const h=harness();h.render();await h.settle();h.change('架空メンバーの面談実施の月間目標','12');h.render();h.props.onRead=payload=>new Promise(resolve=>{finish=()=>resolve(copy({...h.server,month:payload.month}));});h.change('7工程目標の対象月','2026-09');h.render();h.change('7工程目標の対象月','2026-11');h.render();assert.equal(h.find('input','架空メンバーの面談実施の月間目標').props.value,'12');finish();await h.settle();assert.equal(h.find('input','架空メンバーの面談実施の月間目標').props.value,'12');assert.equal(h.dirty.at(-1),true);
});

test('a confirmed goal save invalidates all cached periods',async()=>{
 const h=harness();h.render();await h.settle();h.change('7工程目標の対象月','2026-09');await h.settle();h.change('7工程目標の対象月','2026-11');await h.settle();assert.equal(h.reads.length,2);
 h.change('架空メンバーの面談実施の月間目標','12');h.render();h.find('form','7工程の目標を編集').props.onSubmit({preventDefault(){}});await h.settle();assert.equal(h.saves.length,1);assert.equal(h.pending.at(-1),false);assert.equal(h.reads.length,3);h.change('7工程目標の対象月','2026-09');await h.settle();assert.equal(h.reads.length,4);
});


test('an uncertain goal save preserves one operation across navigation without starting a new read',async()=>{
 const h=harness(),save=h.props.onSave;let first=true;const attempts=[];h.props.onSave=async(payload,id)=>{attempts.push({payload:copy(payload),id});if(first){first=false;throw new SheetApiError('NETWORK','保存結果を確認できませんでした。');}return save(payload,id);};h.render();await h.settle();h.change('架空メンバーの面談実施の月間目標','12');h.render();h.find('form','7工程の目標を編集').props.onSubmit({preventDefault(){}});await h.settle();assert.equal(h.reads.length,1);assert.equal(h.pending.at(-1),true);h.render({active:false});h.render({active:true});await h.settle();assert.equal(h.reads.length,1);h.click('保存状況を再確認');await h.settle();assert.deepEqual(attempts[0],attempts[1]);assert.equal(h.pending.at(-1),false);assert.equal(h.reads.length,2);
});
