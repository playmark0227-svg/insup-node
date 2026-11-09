import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import * as intro from '../lib/introduction-v2.ts';
import * as jobContext from '../lib/introduction-job-context.ts';
import * as normalization from '../lib/introduction-normalization.ts';
import {SheetApiError,isUncertainWrite} from '../lib/sheets-client.ts';
const source=ts.transpileModule(fs.readFileSync(new URL('../components/introduction-composer.tsx',import.meta.url),'utf8').replace('function IntroductionComposerSession(','export function IntroductionComposerSession('),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const clone=value=>JSON.parse(JSON.stringify(value));
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
const edit={factId:'introduction:careers.fixture-company.duties.0',text:'架電業務を担当していました。'};
function profile(){const p=intro.blankIntroductionV2Profile('架空候補');p.source='架空紹介元';p.careers=[{...intro.blankIntroductionCareer('fixture-company'),company:'架空会社',duties:['架電業務を担当。']}];p.internalMemo='非公開の確認情報';return p;}
function harness(overrides={}){
 let cursor=0,server={feature:true,recordId:'fixture-record',draftKey:'fixture-profile',playerId:'ND-001',profile:profile(),version:'a'.repeat(43),updatedAt:'2026-11-09T01:00:00Z',settings:intro.blankIntroductionV2Settings()},nextFailure=null;
 const slots=[],effects=[],calls=[],dirty=[],clipboard=[];
 const props={identityKey:'fixture-identity',recordId:'fixture-record',candidateName:'架空候補',admin:false,enabled:true,canWrite:true,onRead:async()=>clone(server),onSave:async(payload,id)=>{calls.push({payload:clone(payload),id});if(nextFailure){const error=nextFailure;nextFailure=null;throw error;}server={...server,profile:clone(payload.profile),version:'b'.repeat(43)};if(!server.profile.narrativeEdits?.edits.length)delete server.profile.narrativeEdits;return {committed:true,operationId:id};},onSaveSettings:async()=>{},onDirtyChange:value=>dirty.push(value),...overrides};
 const react={useState(initial){const i=cursor++,slot=slots[i]||={value:typeof initial==='function'?initial():initial};return [slot.value,value=>{slot.value=typeof value==='function'?value(slot.value):value;}];},useRef(initial){return slots[cursor++]||={current:initial};},useMemo(fn){return fn();},useEffect(fn,deps){const i=cursor++,previous=slots[i];if(!previous||deps.some((value,index)=>!Object.is(value,previous.deps[index]))){slots[i]={deps};effects.push(()=>{previous?.cleanup?.();slots[i].cleanup=fn();});}}};
 const jsx=(type,props,key)=>({type,props:props||{},key}),exports={};
 vm.runInNewContext(source,{exports,module:{exports},crypto:{randomUUID},AbortController,Date,Set,Map,Error,navigator:{clipboard:{writeText:async value=>clipboard.push(value)}},require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('introduction-v2-ai')?{generateIntroductionV2:async()=>({edits:[edit],notice:'文章を整えました。'})}:name.includes('introduction-v2')?intro:name.includes('introduction-job-context')?jobContext:name.includes('introduction-normalization')?normalization:name.includes('sheets-client')?{isUncertainWrite}:name.includes('unsaved-work')?{useUnsavedChangesWarning:()=>{}}:name.endsWith('.css')?{}:new Proxy({},{get:(_,key)=>key})});
 const render=next=>{Object.assign(props,next);cursor=0;const tree=exports.IntroductionComposerSession(props);while(effects.length)effects.shift()();return tree;};
 const find=(type,label)=>nodes(render()).find(node=>node.type===type&&(node.props['aria-label']===label||node.props.id===label||text(node)===label));
 const click=label=>{const button=find('button',label);assert.ok(button,label);assert.ok(!button.props.disabled,`${label} enabled`);return button.props.onClick?.();};
 const change=(type,label,value)=>{const input=find(type,label);assert.ok(input,label);assert.ok(!input.props.disabled,`${label} enabled`);input.props.onChange({target:{value,checked:!!value}});};
 return {props,calls,dirty,clipboard,render,find,click,change,text:()=>text(render()),server:()=>server,setServer:value=>server=value,failNext:error=>nextFailure=error,settle:async()=>{for(let i=0;i<30;i++){await Promise.resolve();render();}}};
}

test('saved reviewed text loads without invoking AI and copy matches the persisted preview',async()=>{
 const h=harness(),server=h.server();server.profile=intro.withIntroductionNarrativeEdits(server.profile,server.settings,[edit]);h.setServer(server);h.render();await h.settle();
 assert.match(h.find('textarea','社内共有用の紹介文').props.value,/架電業務を担当していました/);assert.equal(h.dirty.at(-1),false);
 await h.click('コピー');assert.equal(h.clipboard[0],h.find('textarea','社内共有用の紹介文').props.value);assert.equal(h.calls.length,0);assert.doesNotMatch(h.clipboard[0],/非公開の確認情報/);
});

test('generating prose marks dirty, save retains atoms, reload stays identical, reset and undo preserve originals',async()=>{
 const h=harness();h.render();await h.settle();await h.click('端末内AIで文章を整える');await h.settle();assert.equal(h.dirty.at(-1),true);
 const preview=h.find('textarea','社内共有用の紹介文').props.value;h.click('紹介文を保存');await h.settle();assert.equal(h.dirty.at(-1),false);assert.deepEqual(h.calls[0].payload.profile.narrativeEdits.edits,[edit]);assert.equal(h.find('textarea','社内共有用の紹介文').props.value,preview);
 h.click('整文を外して原文に戻す');await h.settle();assert.equal(h.dirty.at(-1),true);assert.doesNotMatch(h.find('textarea','社内共有用の紹介文').props.value,/担当していました/);
 h.click('保存済みの紹介文へ戻す');await h.settle();assert.equal(h.dirty.at(-1),false);assert.equal(h.find('textarea','社内共有用の紹介文').props.value,preview);
 h.change('textarea','intro-v2-careers.fixture-company.duties','架電業務の事前確認を担当。');h.click('紹介文を保存');await h.settle();assert.equal(h.server().profile.narrativeEdits,undefined);assert.equal(h.server().profile.careers[0].duties[0],'架電業務の事前確認を担当。');assert.equal(h.calls[1].payload.profile.narrativeEdits.edits.length,0);
});

test('an uncertain save retries the identical ID and atom revision and keeps the preview while waiting',async()=>{
 const h=harness();h.render();await h.settle();await h.click('端末内AIで文章を整える');await h.settle();const preview=h.find('textarea','社内共有用の紹介文').props.value;
 h.failNext(new SheetApiError('NETWORK','保存結果が不明です。'));h.click('紹介文を保存');await h.settle();assert.match(h.text(),/同じ保存IDで再試行/);assert.equal(h.find('textarea','社内共有用の紹介文').props.value,preview);h.click('同じ保存IDで再試行');await h.settle();assert.equal(h.calls[0].id,h.calls[1].id);assert.deepEqual(h.calls[0].payload,h.calls[1].payload);assert.equal(h.find('textarea','社内共有用の紹介文').props.value,preview);
});

test('job context selects exactly one registered client and never converts job budget into a rate',async()=>{
 const context={requestId:'request-a',recordId:'fixture-record',jobId:'job-a',company:'架空会社',jobTitle:'法人営業',jobBudget:{min:9999,max:9999,unit:'day',tax:'inclusive'}},h=harness({jobContext:context}),server=h.server();server.settings.clients=[{id:'client-a',name:'架空会社',mentions:['@登録宛先'],rate:{amount:'2400',unit:'hour',tax:'exclusive'}}];h.setServer(server);h.render();await h.settle();
 assert.equal(h.find('select','企業向け紹介文の提示先').props.value,'client-a');const preview=h.find('textarea','企業向けの紹介文').props.value;assert.match(preview,/@登録宛先/);assert.match(preview,/2,400円／時（税抜）/);assert.doesNotMatch(preview,/9999|9,999/);
 h.render({jobContext:{...context,requestId:'request-b',company:'未登録会社'}});await h.settle();assert.equal(h.find('select','企業向け紹介文の提示先').props.value,'');assert.match(h.text(),/企業設定が見つかりません/);assert.doesNotMatch(h.find('textarea','企業向けの紹介文').props.value,/@登録宛先|2,400円/);
 const updated=h.server();updated.settings.clients.push({...updated.settings.clients[0],id:'client-b'});h.setServer(updated);h.click('最新を取得');await h.settle();h.render({jobContext:{...context,requestId:'request-c'}});await h.settle();assert.equal(h.find('select','企業向け紹介文の提示先').props.value,'');assert.match(h.text(),/企業設定が複数/);
});


test('a unique company with an absent address or presentation rate names the missing settings',async()=>{
 const h=harness({jobContext:{requestId:'request-missing-rate',recordId:'fixture-record',jobId:'job-a',company:'架空会社',jobTitle:'営業',jobBudget:{min:9999,max:9999,unit:'day',tax:'inclusive'}}}),server=h.server();server.settings.clients=[{id:'missing-rate-client',name:'架空会社',mentions:[]}];h.setServer(server);h.render();await h.settle();assert.equal(h.find('select','企業向け紹介文の提示先').props.value,'missing-rate-client');assert.match(h.text(),/宛先が未登録/);assert.match(h.text(),/企業提示単価が未登録/);assert.doesNotMatch(h.find('textarea','企業向けの紹介文').props.value,/9999|9,999/);
});
