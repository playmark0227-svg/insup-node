import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import * as reminders from '../lib/reminders.ts';

const source=ts.transpileModule(fs.readFileSync(new URL('../components/reminder-center.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
function harness({permission='default',initialEnabled=false,claim}={}){
 let now=Date.parse('2026-11-06T00:00:00Z'),cursor=0,updated=false,requests=0,closed=0;
 const slots=[],effects=[],opened=[],notices=[],releases=[],timers=new Set(),values=new Map(),listeners=new Map();
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const react={useState(initial){const i=cursor++;slots[i]||={value:typeof initial==='function'?initial():initial};return[slots[i].value,value=>{const next=typeof value==='function'?value(slots[i].value):value;if(!Object.is(next,slots[i].value)){slots[i].value=next;updated=true;}}];},useRef(initial){return slots[cursor++]||={current:initial};},useMemo(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||!same(old.deps,deps)){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const jsx=(type,props,key)=>({type,props:props||{},key});
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 const library={...reminders,reminderHash:async value=>createHash('sha256').update(value).digest('hex'),readReminderSettings:(scope,time)=>values.has(`node-reminder-settings-v1:${scope}`)?reminders.readReminderSettings(scope,time,storage):{...reminders.defaultReminderSettings(),enabled:initialEnabled},writeReminderSettings:(scope,value)=>reminders.writeReminderSettings(scope,value,storage),claimReminderDeliveries:claim||(async(_scope,keys)=>keys),releaseReminderDeliveries:async(scope,keys)=>{releases.push({scope,keys});}};
 class MockDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 class MockNotification{static permission=permission;static async requestPermission(){requests++;MockNotification.permission='granted';return'granted';}constructor(title,options){this.title=title;this.options=options;notices.push(this);}close(){closed++;}}
 const events={addEventListener:(type,fn)=>{const values=listeners.get(type)||new Set();values.add(fn);listeners.set(type,values);},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn)};
 const window={...events,isSecureContext:true,setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn),focus(){}};
 const exports={};vm.runInNewContext(source,{exports,module:{exports},require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('/reminders')?library:name.endsWith('.css')?{}:new Proxy({},{get:(_,key)=>key}),window,document:events,Date:MockDate,Notification:MockNotification});
 const record={recordId:'record-one',rowVersion:'version',row:2,playerId:'ND-001',candidateName:'OS通知へ含めない氏名',source:'',values:Array(26).fill(''),formulaColumns:[]};record.values[9]='2026-11-07';record.values[10]='14:00';
 const props={identityKey:'player:ND-001',selfPlayerId:'ND-001',admin:false,records:[record],enabled:true,onOpenRecord:id=>opened.push(id)};
 function render(next={}){Object.assign(props,next);let tree,passes=0;do{updated=false;cursor=0;tree=exports.ReminderCenter(props);while(effects.length)effects.shift()();if(++passes>15)assert.fail('render loop');}while(updated);return tree;}
 const flush=async()=>{for(let i=0;i<6;i++){await new Promise(resolve=>setImmediate(resolve));render();}};
 const find=label=>nodes(render()).find(node=>node.type==='button'&&(text(node)===label||node.props['aria-label']===label));
 const click=label=>{const button=find(label);assert.ok(button,label);assert.ok(!button.props.disabled,`${label} enabled`);button.props.onClick();};
 return{props,record,render,flush,click,find,notices,opened,releases,values,get requests(){return requests;},get closed(){return closed;},tick(milliseconds){now+=milliseconds;for(const fn of timers)fn();},unmount(){for(const slot of slots)slot?.cleanup?.();}};
}

test('notification permission is requested only by the user button and OS text contains no candidate details',async()=>{
 const h=harness();h.render();await h.flush();assert.equal(h.requests,0);assert.equal(h.notices.length,0);
 assert.match(text(h.render()),/アプリを開いていない間/);assert.match(text(h.render()),/成果は、実際に実施してから/);
 h.click('この端末のPC通知を有効にする');await h.flush();assert.equal(h.requests,1);assert.equal(h.notices.length,1);
 assert.equal(JSON.stringify(h.notices).includes(h.record.candidateName),false);assert.match(h.notices[0].options.body,/1件/);
 h.click('予定・進捗を開く');assert.deepEqual(h.opened,['record-one']);assert.ok(h.find('前日確認を完了'));
 h.unmount();assert.ok(h.closed>0);
});
test('acknowledgement, restore and snooze preserve the plan and never write achievements',async()=>{
 const h=harness();h.render();await h.flush();const before=JSON.stringify(h.record);
 h.click('前日確認を完了');await h.flush();assert.match(text(h.render()),/前日確認済み/);assert.ok(h.find('未確認へ戻す'));
 h.click('未確認へ戻す');await h.flush();assert.ok(h.find('前日確認を完了'));assert.equal(h.releases.length,1);
 h.click('15分後に確認');await h.flush();assert.match(text(h.render()),/09:15まで再通知を待機/);assert.equal(h.releases.length,2);
 assert.equal(JSON.stringify(h.record),before);assert.equal([...h.values.values()].join('').includes(h.record.candidateName),false);assert.equal([...h.values.values()].join('').includes('record-one'),false);h.unmount();
});
test('a late delivery claim after logout cannot create a notification or open another user record',async()=>{
 let release;const h=harness({permission:'granted',initialEnabled:true,claim:()=>new Promise(resolve=>release=resolve)});h.render();await h.flush();assert.ok(release);h.render({enabled:false,records:[]});
 release(['claimed-key']);await h.flush();assert.equal(h.notices.length,0);assert.equal(h.releases.length,1);assert.equal(h.requests,0);assert.match(text(h.render()),/読み込みが完了/);h.unmount();
});
test('hidden panel continues enabled reminder checks, but stopping PC notifications closes the existing notice',async()=>{
 const delivered=new Set();const h=harness({permission:'granted',initialEnabled:true,claim:async(_scope,keys)=>keys.filter(key=>{if(delivered.has(key))return false;delivered.add(key);return true;})});h.render({showPanel:false});await h.flush();assert.equal(h.render().props.hidden,true);assert.equal(h.notices.length,1);
 h.tick(60000);await h.flush();assert.equal(h.notices.length,1);h.click('PC通知を停止');await h.flush();assert.ok(h.closed>0);h.tick(60000);await h.flush();assert.equal(h.notices.length,1);h.unmount();
});

test('disabling PC notices or acknowledging a task while a claim is pending prevents a late notification',async()=>{
 for(const action of ['PC通知を停止','前日確認を完了']){
  let resolveClaim,queued;const h=harness({permission:'granted',initialEnabled:true,claim:(_scope,keys)=>{queued=keys;return new Promise(resolve=>resolveClaim=resolve);}});h.render();await h.flush();assert.ok(resolveClaim);h.click(action);await h.flush();resolveClaim(queued);await h.flush();assert.equal(h.notices.length,0,action);h.unmount();
 }
});
