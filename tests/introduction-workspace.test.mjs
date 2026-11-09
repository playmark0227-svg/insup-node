import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import * as introduction from '../lib/introduction-v2.ts';
import * as jobs from '../lib/introduction-job-context.ts';
import * as normalization from '../lib/introduction-normalization.ts';
import {isUncertainWrite,SheetApiError} from '../lib/sheets-client.ts';
const clone=value=>JSON.parse(JSON.stringify(value));
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
const transpile=path=>ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const workspaceSource=transpile('../components/introduction-workspace.tsx'),composerSource=transpile('../components/introduction-composer.tsx');
function target(id,owner='ND-001',draftKey=`profile-${id}`){const profile=introduction.blankIntroductionV2Profile(`架空候補${id}`);profile.source='架空紹介元';profile.internalMemo=`非公開メモ${id}`;profile.basic.monthlyHours=id==='A'?'100':'200';const initialRead={feature:true,recordId:id,playerId:owner,draftKey,profile,version:'a'.repeat(43),updatedAt:'2026-11-10T00:00:00Z',settings:introduction.blankIntroductionV2Settings()};return {identityKey:'login-a',recordId:id,candidateName:profile.candidateName,recordOwnerId:owner,recordDraftKey:draftKey,admin:false,enabled:true,canWrite:true,initialRead};}
/** Run the real manager and editor hooks together. Keyed child frames are kept
 * just as React keeps mounted editors; explicit removal runs all cleanups. */
function harness(){
 let current,dirty=false,tree,props={identityKey:'login-a',activeRecordId:'A'},reads=[],calls=[],states=[],selected=[];
 const frames=new Map(),effects=[],targets=new Map(['A','B'].map(id=>[id,target(id)]));
 const setDirty=()=>{dirty=true;};
 const react={
  useState(initial){const frame=current,index=frame.cursor++,slot=frame.slots[index]||={value:typeof initial==='function'?initial():initial};return [slot.value,value=>{const next=typeof value==='function'?value(slot.value):value;if(!Object.is(next,slot.value)){slot.value=next;setDirty();}}];},
  useRef(initial){return current.slots[current.cursor++]||={current:initial};},
  useMemo(fn,deps){const frame=current,index=frame.cursor++,old=frame.slots[index];if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i])))frame.slots[index]={deps,value:fn()};return frame.slots[index].value;},
  useEffect(fn,deps){const frame=current,index=frame.cursor++,old=frame.slots[index];if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i]))){frame.slots[index]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();if(frame.mounted)frame.slots[index].cleanup=fn();});}}
 };
 const jsx=(type,props,key)=>({type,props:props||{},key});
 const load=(source,extra={})=>{const exports={};vm.runInNewContext(source,{exports,module:{exports},crypto:{randomUUID},AbortController,Date,Set,Map,Error,navigator:{clipboard:{writeText:async()=>{}}},requestAnimationFrame:fn=>fn(),require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:extra[name]?extra[name]:name.includes('introduction-v2-ai')?{generateIntroductionV2:async()=>({edits:[],notice:'文章を確認しました。'})}:name.includes('introduction-v2')?introduction:name.includes('introduction-job-context')?jobs:name.includes('introduction-normalization')?normalization:name.includes('sheets-client')?{isUncertainWrite}:name.includes('unsaved-work')?{useUnsavedChangesWarning:()=>{}}:name.endsWith('.css')?{}:new Proxy({},{get:(_,key)=>key})});return exports;};
 const composer=load(composerSource),workspace=load(workspaceSource,{'./introduction-composer':composer});
 const visit=(node,path,seen)=>{if(node==null||typeof node!=='object')return node;if(Array.isArray(node))return node.map((child,index)=>visit(child,`${path}/${child?.key??index}`,seen));if(typeof node.type==='function'){const key=`${path}/${node.type.name}:${node.key??''}`;let frame=frames.get(key);if(!frame){frame={slots:[],cursor:0,mounted:true};frames.set(key,frame);}seen.add(key);frame.cursor=0;const previous=current;current=frame;const output=node.type(node.props);current=previous;return visit(output,`${key}/out`,seen);}return {...node,props:{...node.props,children:visit(node.props.children,`${path}/${node.key??node.type}/children`,seen)}};};
 const render=next=>{Object.assign(props,next);let attempts=0;do{if(++attempts>25)throw new Error('render loop');dirty=false;const seen=new Set();tree=visit(jsx(workspace.IntroductionWorkspace,{...props,getTarget:id=>{const found=targets.get(id);return found?{...found,onRead:payload=>{reads.push(payload);return found.onRead?found.onRead(payload):new Promise(()=>{});},onSave:(payload,id)=>{const call={payload:clone(payload),id};calls.push(call);return new Promise((resolve,reject)=>{call.resolve=resolve;call.reject=reject;});},onSaveSettings:async()=>{}}:null;},onStateChange:state=>states.push(clone(state)),onSelectRecord:id=>{selected.push(id);props.activeRecordId=id;setDirty();}}),'root',seen);for(const [key,frame]of frames)if(!seen.has(key)){frame.mounted=false;for(const slot of frame.slots)slot?.cleanup?.();frames.delete(key);}while(effects.length)effects.shift()();}while(dirty);return tree;};
 const panel=id=>nodes(render()).find(node=>node.props['data-introduction-record']===id);
 const input=(id,name)=>nodes(panel(id)).find(node=>node.type==='input'&&node.props.id===name);
 const change=(id,name,value)=>{const node=input(id,name);assert.ok(node,`${id} ${name}`);assert.equal(node.props.disabled,false);node.props.onChange({target:{value}});render();};
 const button=(id,label)=>nodes(panel(id)).find(node=>node.type==='button'&&text(node)===label);
 const click=(id,label)=>{const node=button(id,label);assert.ok(node,label);assert.equal(!!node.props.disabled,false,`${id} ${label} enabled`);node.props.onClick();render();};
 return {render,panel,input,button,change,click,targets,calls,states,selected,reads,state:()=>states.at(-1),text:()=>text(render()),editors:()=>nodes(render()).filter(node=>node.props['data-introduction-record']).map(node=>({id:node.props['data-introduction-record'],hidden:node.props.hidden,key:node.key})),settle:async()=>{for(let i=0;i<12;i++){await Promise.resolve();render();}}};
}

test('A saves in the background while B is editable, and a late A receipt cannot replace B or lose either draft',async()=>{
 const h=harness();h.render();h.change('A','intro-v2-basic.monthlyHours','123');h.click('A','紹介文を保存');assert.equal(h.calls.length,1);assert.deepEqual(h.state().pendingRecordIds,['A']);assert.equal(h.input('A','intro-v2-basic.monthlyHours').props.disabled,true);assert.doesNotMatch(text(h.panel('A')),/紹介文を保存しました/);
 h.render({activeRecordId:'B'});assert.equal(h.panel('A').props.hidden,true);assert.equal(h.panel('B').props.hidden,false);h.change('B','intro-v2-basic.monthlyHours','456');const aKey=h.editors().find(item=>item.id==='A').key,bKey=h.editors().find(item=>item.id==='B').key;
 h.calls[0].resolve({committed:true,operationId:h.calls[0].id});await h.settle();assert.equal(h.panel('B').props.hidden,false);assert.equal(h.input('B','intro-v2-basic.monthlyHours').props.value,'456');assert.equal(h.editors().find(item=>item.id==='B').key,bKey);assert.deepEqual(h.state().pendingRecordIds,[]);assert.deepEqual(h.state().dirtyRecordIds,['B']);assert.equal(h.calls.length,1);
 h.render({activeRecordId:'A'});assert.equal(h.editors().find(item=>item.id==='A').key,aKey);assert.equal(h.input('A','intro-v2-basic.monthlyHours').props.value,'123');assert.match(text(h.panel('A')),/紹介文を保存しました/);h.render({activeRecordId:'B'});assert.equal(h.input('B','intro-v2-basic.monthlyHours').props.value,'456');
});

test('an uncertain hidden save retains its identical request and dirty inputs without freezing another candidate',async()=>{
 const h=harness();h.render();h.change('A','intro-v2-basic.monthlyHours','123');h.click('A','紹介文を保存');h.render({activeRecordId:'B'});h.calls[0].reject(new SheetApiError('NETWORK','保存結果が届きませんでした。'));await h.settle();h.change('B','intro-v2-basic.monthlyHours','456');assert.deepEqual(h.state().pendingRecordIds,['A']);h.render({activeRecordId:'A'});assert.equal(h.input('A','intro-v2-basic.monthlyHours').props.value,'123');h.click('A','保存をもう一度確認');assert.equal(h.calls.length,2);assert.equal(h.calls[0].id,h.calls[1].id);assert.deepEqual(h.calls[0].payload,h.calls[1].payload);h.render({activeRecordId:'B'});assert.equal(h.input('B','intro-v2-basic.monthlyHours').props.value,'456');
});

test('a first-save profile association preserves a later draft only after the exact saved body is confirmed',async()=>{
 const h=harness(),fresh=h.targets.get('A');fresh.recordDraftKey='A';fresh.initialRead={...fresh.initialRead,draftKey:'A',profile:null,version:''};h.render();h.change('A','intro-v2-basic.monthlyHours','123');const before=h.editors().find(item=>item.id==='A').key;h.click('A','紹介文を保存');
 const canonical={...fresh,recordDraftKey:'assigned-profile',initialRead:{...fresh.initialRead,draftKey:'assigned-profile',version:'b'.repeat(43),profile:clone(h.calls[0].payload.profile)}};h.targets.set('A',canonical);h.render();assert.equal(h.editors().find(item=>item.id==='A').key,before);assert.equal(h.input('A','intro-v2-basic.monthlyHours').props.value,'123');h.calls[0].resolve({committed:true,operationId:h.calls[0].id});await h.settle();assert.equal(h.editors().find(item=>item.id==='A').key,before);h.change('A','intro-v2-basic.monthlyHours','456');h.render({activeRecordId:'B'});h.render({activeRecordId:'A'});assert.equal(h.editors().find(item=>item.id==='A').key,before);assert.equal(h.input('A','intro-v2-basic.monthlyHours').props.value,'456');
});

test('a first-save canonical read confirms its binding while an open B panel delays the parent snapshot',async()=>{
 const h=harness(),fresh=h.targets.get('A');fresh.recordDraftKey='A';fresh.initialRead={...fresh.initialRead,draftKey:'A',profile:null,version:''};let readValue=clone(fresh.initialRead);fresh.onRead=async()=>clone(readValue);h.render();await h.settle();h.change('A','intro-v2-basic.monthlyHours','123');const before=h.editors()[0].key;h.click('A','紹介文を保存');h.render({activeRecordId:'B'});h.change('B','intro-v2-basic.monthlyHours','456');
 readValue={...fresh.initialRead,draftKey:'confirmed-profile',version:'b'.repeat(43),profile:clone(h.calls[0].payload.profile)};h.calls[0].resolve({committed:true,operationId:h.calls[0].id});await h.settle();assert.equal(h.targets.get('A').recordDraftKey,'A','the parent canonical snapshot is still deferred');assert.equal(h.panel('B').props.hidden,false);assert.equal(h.input('B','intro-v2-basic.monthlyHours').props.value,'456');assert.doesNotMatch(text(h.panel('A')),/紹介文と担当者を確認できません/);
 h.render({activeRecordId:'A'});h.change('A','intro-v2-basic.monthlyHours','250');h.render({activeRecordId:'B'});const later=clone(readValue);later.version='c'.repeat(43);later.profile.basic.monthlyHours='500';h.targets.set('A',{...fresh,recordDraftKey:later.draftKey,initialRead:later});h.render();assert.equal(h.editors().find(item=>item.id==='A').key,before);assert.equal(h.input('A','intro-v2-basic.monthlyHours').props.value,'250');assert.match(text(h.panel('A')),/入力は保持しています/);assert.equal(h.button('A','紹介文を保存').props.disabled,true);assert.equal(h.input('B','intro-v2-basic.monthlyHours').props.value,'456');
});

test('an unrelated profile assignment cannot use a first-save receipt to preserve an earlier editor',async()=>{
 const h=harness(),fresh=h.targets.get('A');fresh.recordDraftKey='A';fresh.initialRead={...fresh.initialRead,draftKey:'A',profile:null,version:''};h.render();h.change('A','intro-v2-basic.monthlyHours','123');const before=h.editors()[0].key;h.click('A','紹介文を保存');h.calls[0].resolve({committed:true,operationId:h.calls[0].id});await h.settle();h.change('A','intro-v2-basic.monthlyHours','456');h.targets.set('A',target('A','ND-001','another-assigned-profile'));h.render();assert.notEqual(h.editors()[0].key,before);assert.equal(h.input('A','intro-v2-basic.monthlyHours').props.value,'100');assert.deepEqual(h.state().dirtyRecordIds,[]);
});

test('owner, draft and login changes discard prior private inputs, and late old callbacks cannot restore them',async()=>{
 const h=harness();h.render();h.change('A','intro-v2-basic.monthlyHours','123');h.click('A','紹介文を保存');const old=h.editors()[0].key;h.targets.set('A',target('A','ND-002'));h.render();assert.notEqual(h.editors()[0].key,old);assert.equal(h.input('A','intro-v2-basic.monthlyHours').props.value,'100');assert.deepEqual(h.state().pendingRecordIds,[]);h.calls[0].resolve({committed:true,operationId:h.calls[0].id});await h.settle();assert.equal(h.input('A','intro-v2-basic.monthlyHours').props.value,'100');assert.doesNotMatch(text(h.panel('A')),/紹介文を保存しました/);
 h.change('A','intro-v2-basic.monthlyHours','456');const ownerKey=h.editors()[0].key;h.targets.set('A',target('A','ND-002','unrelated-profile'));h.render();assert.notEqual(h.editors()[0].key,ownerKey);assert.equal(h.input('A','intro-v2-basic.monthlyHours').props.value,'100');h.change('A','intro-v2-basic.monthlyHours','789');h.render({identityKey:'login-b'});assert.equal(h.panel('A'),undefined);assert.doesNotMatch(h.text(),/非公開メモA/);assert.deepEqual(h.state().dirtyRecordIds,[]);
 const next={...target('A'),identityKey:'login-b'};h.targets.set('A',next);h.render();assert.equal(h.input('A','intro-v2-basic.monthlyHours').props.value,'100');
});

test('the clean editor cache is bounded but dirty and pending candidates survive many visited candidates',()=>{
 const h=harness();h.render();h.change('A','intro-v2-basic.monthlyHours','123');h.render({activeRecordId:'B'});h.change('B','intro-v2-basic.monthlyHours','456');h.click('B','紹介文を保存');for(let i=0;i<18;i++){const id=`C${i}`;h.targets.set(id,target(id));h.render({activeRecordId:id});}assert.equal(h.editors().length,14);assert.equal(h.panel('C0'),undefined);assert.equal(h.panel('C5'),undefined);assert.ok(h.panel('A'));assert.ok(h.panel('B'));assert.deepEqual(h.state().pendingRecordIds,['B']);h.render({activeRecordId:'A'});assert.equal(h.input('A','intro-v2-basic.monthlyHours').props.value,'123');h.render({activeRecordId:'B'});assert.equal(h.input('B','intro-v2-basic.monthlyHours').props.value,'456');assert.equal(h.calls.length,1);
});

test('a queued introduction closes its own panel only and never a subsequently selected candidate or login',async()=>{
 const source=fs.readFileSync(new URL('../components/node-workspace.tsx',import.meta.url),'utf8'),start=source.indexOf('const saveIntroduction=async'),end=source.indexOf(';\n const getIntroductionTarget',start);assert.ok(start>=0&&end>start);const code=ts.transpileModule(`${source.slice(start,end+1)}\nexports.saveIntroduction=saveIntroduction;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const queued=[],requests=[],closed=[],errors=[],identityRef={current:'login-a'},currentIntroId={current:'A'},exports={};const sheet={mutateExtension:(action,payload,id,onQueued)=>{queued.push(onQueued);return new Promise((resolve,reject)=>requests.push({resolve,reject}));}};vm.runInNewContext(code,{exports,identity:'login-a',identityRef,currentIntroId,sheet,setIntroPanelOpen:value=>closed.push(value),toast:{error:value=>errors.push(value)},Error});
 const first=exports.saveIntroduction('A','saveIntroductionV2',{recordId:'A'},'save-a');currentIntroId.current='B';queued[0]();assert.deepEqual(closed,[]);requests[0].resolve();await first;assert.deepEqual(closed,[]);
 const second=exports.saveIntroduction('B','saveIntroductionV2',{recordId:'B'},'save-b');queued[1]();assert.deepEqual(closed,[false]);requests[1].resolve();await second;
 const old=exports.saveIntroduction('B','saveIntroductionV2',{recordId:'B'},'save-old');identityRef.current='login-b';queued[2]();requests[2].reject(new Error('旧ログインの結果'));await assert.rejects(old);assert.deepEqual(closed,[false]);assert.deepEqual(errors,[]);
});


test('candidate navigation exposes one selected candidate while retaining the other unfinished input',()=>{
 const h=harness();h.render();assert.equal(h.input('A','intro-v2-basic.desiredRate.amount').props.inputMode,'decimal');h.change('A','intro-v2-basic.monthlyHours','123');h.render({activeRecordId:'B'});h.change('B','intro-v2-basic.monthlyHours','456');const candidateNav=()=>nodes(h.render()).find(node=>node.type==='nav'&&node.props['aria-label']==='開いている候補者の紹介文');let buttons=nodes(candidateNav()).filter(node=>node.type==='button');assert.equal(buttons.filter(node=>node.props['aria-current']==='page').length,1);assert.match(text(buttons.find(node=>node.props['aria-current']==='page')),/架空候補B/);buttons.find(node=>text(node).startsWith('架空候補A')).props.onClick();buttons=nodes(candidateNav()).filter(node=>node.type==='button');assert.match(text(buttons.find(node=>node.props['aria-current']==='page')),/架空候補A/);assert.equal(h.input('A','intro-v2-basic.monthlyHours').props.value,'123');assert.equal(h.input('B','intro-v2-basic.monthlyHours').props.value,'456');
});
