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
 vm.runInNewContext(source,{exports,module:{exports},crypto:{randomUUID},AbortController,Date,Set,Map,Error,navigator:{clipboard:{writeText:async value=>clipboard.push(value)}},require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('introduction-v2-ai')?{generateIntroductionV2:overrides.onGenerate||(async()=>({edits:[edit],notice:'文章を整えました。'}))}:name.includes('introduction-v2')?intro:name.includes('introduction-job-context')?jobContext:name.includes('introduction-normalization')?normalization:name.includes('sheets-client')?{isUncertainWrite}:name.includes('unsaved-work')?{useUnsavedChangesWarning:()=>{}}:name.endsWith('.css')?{}:new Proxy({},{get:(_,key)=>key})});
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
 const h=harness();h.render();await h.settle();await h.click('AIで文章を整える');await h.settle();assert.equal(h.dirty.at(-1),true);
 const preview=h.find('textarea','社内共有用の紹介文').props.value;h.click('紹介文を保存');await h.settle();assert.equal(h.dirty.at(-1),false);assert.deepEqual(h.calls[0].payload.profile.narrativeEdits.edits,[edit]);assert.equal(h.find('textarea','社内共有用の紹介文').props.value,preview);
 h.click('元の文章に戻す');await h.settle();assert.equal(h.dirty.at(-1),true);assert.doesNotMatch(h.find('textarea','社内共有用の紹介文').props.value,/担当していました/);
 h.click('保存済みの紹介文へ戻す');await h.settle();assert.equal(h.dirty.at(-1),false);assert.equal(h.find('textarea','社内共有用の紹介文').props.value,preview);
 h.change('textarea','intro-v2-careers.fixture-company.duties','架電業務の事前確認を担当。');h.click('紹介文を保存');await h.settle();assert.equal(h.server().profile.narrativeEdits,undefined);assert.equal(h.server().profile.careers[0].duties[0],'架電業務の事前確認を担当。');assert.equal(h.calls[1].payload.profile.narrativeEdits.edits.length,0);
});

test('an uncertain save retries the identical ID and atom revision and keeps the preview while waiting',async()=>{
 const h=harness();h.render();await h.settle();await h.click('AIで文章を整える');await h.settle();const preview=h.find('textarea','社内共有用の紹介文').props.value;
 h.failNext(new SheetApiError('NETWORK','保存結果が不明です。'));h.click('紹介文を保存');await h.settle();assert.match(h.text(),/保存をもう一度確認/);assert.equal(h.find('textarea','社内共有用の紹介文').props.value,preview);h.click('保存をもう一度確認');await h.settle();assert.equal(h.calls[0].id,h.calls[1].id);assert.deepEqual(h.calls[0].payload,h.calls[1].payload);assert.equal(h.find('textarea','社内共有用の紹介文').props.value,preview);
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

test('a current account-bound snapshot opens the introduction on first render without waiting for a second request',async()=>{
 let finish;const h=harness({recordOwnerId:'ND-001',recordDraftKey:'fixture-profile',onRead:()=>new Promise(resolve=>{finish=resolve;})});h.props.initialRead=clone(h.server());
 const first=h.render();assert.doesNotMatch(text(first),/紹介文を読み込んでいます|紹介文を読み込むと編集できます/);assert.equal(h.find('input','intro-v2-basic.monthlyHours').props.disabled,false);assert.equal(h.dirty.at(-1),false);
 h.change('input','intro-v2-basic.monthlyHours','123');finish(clone(h.server()));await h.settle();assert.equal(h.find('input','intro-v2-basic.monthlyHours').props.value,'123');assert.equal(h.dirty.at(-1),true);assert.equal(h.calls.length,0);
});

test('a mismatched candidate or owner snapshot cannot seed an introduction or leak its private fields',()=>{
 for(const change of [{playerId:'ND-002'},{draftKey:'another-profile'},{recordId:'another-record'},{profile:{...profile(),candidateName:'別の架空候補'}}]){
  const h=harness({recordOwnerId:'ND-001',recordDraftKey:'fixture-profile',onRead:()=>new Promise(()=>{})});h.props.initialRead={...clone(h.server()),...change};assert.doesNotMatch(text(h.render()),/非公開の確認情報|架電業務を担当/);assert.equal(h.find('textarea','社内共有用の紹介文'),undefined);
 }
});

test('a newer saved profile never advances dirty inputs to its version without comparison',async()=>{
 let finish;const h=harness({recordOwnerId:'ND-001',recordDraftKey:'fixture-profile',onRead:()=>new Promise(resolve=>{finish=resolve;})});h.props.initialRead=clone(h.server());h.render();h.change('input','intro-v2-basic.monthlyHours','123');finish({...clone(h.server()),version:'b'.repeat(43),profile:{...profile(),basic:{...profile().basic,monthlyHours:'250'}}});await h.settle();
 assert.equal(h.find('input','intro-v2-basic.monthlyHours').props.value,'123');assert.equal(h.find('button','紹介文を保存').props.disabled,true);assert.match(h.text(),/入力は保持しています/);assert.equal(h.calls.length,0);
 h.click('比較済み・この入力で編集を続ける');h.click('紹介文を保存');await h.settle();assert.equal(h.calls[0].payload.expectedVersion,'b'.repeat(43));assert.equal(h.calls[0].payload.profile.basic.monthlyHours,'123');
});

test('changed shared settings retain the draft and require review before copying or saving',async()=>{
 const h=harness({recordOwnerId:'ND-001',recordDraftKey:'fixture-profile',onRead:()=>new Promise(()=>{})});h.props.initialRead=clone(h.server());h.render();h.change('input','intro-v2-basic.monthlyHours','123');
 const updated=clone(h.props.initialRead);updated.settings.version='c'.repeat(43);updated.settings.blockedTerms=['共有禁止の架空語'];h.render({initialRead:updated});await h.settle();assert.equal(h.find('input','intro-v2-basic.monthlyHours').props.value,'123');assert.equal(h.find('button','コピー').props.disabled,true);assert.equal(h.find('button','紹介文を保存').props.disabled,true);assert.match(h.text(),/共有設定が更新されました/);
 h.click('最新の設定を確認しました');await h.settle();assert.equal(h.find('button','紹介文を保存').props.disabled,false);assert.equal(h.find('button','コピー').props.disabled,false);
});

test('edits made after the save receipt survive the delayed forced refresh',async()=>{
 let reads=0,finish;const h=harness({onRead:()=>{reads++;return reads===1?Promise.resolve(clone(h.server())):new Promise(resolve=>{finish=resolve;});}});h.render();await h.settle();h.change('input','intro-v2-basic.monthlyHours','123');h.click('紹介文を保存');await h.settle();assert.equal(h.calls.length,1);assert.equal(h.find('input','intro-v2-basic.monthlyHours').props.disabled,false);
 h.change('input','intro-v2-basic.monthlyHours','250');finish(clone(h.server()));await h.settle();assert.equal(h.find('input','intro-v2-basic.monthlyHours').props.value,'250');assert.equal(h.dirty.at(-1),true);assert.equal(h.find('button','紹介文を保存').props.disabled,true);
});


test('a first-save read with a different owner, name or saved body cannot authorize a new draft binding',async()=>{
 for(const alter of [value=>({...value,playerId:'ND-002'}),value=>({...value,profile:{...value.profile,candidateName:'別の架空候補'}}),value=>({...value,profile:{...value.profile,basic:{...value.profile.basic,monthlyHours:'987'}}})]){
  let readValue;const confirmed=[],h=harness({recordOwnerId:'ND-001',recordDraftKey:'fixture-record',onFirstSaveBindingConfirmed:value=>confirmed.push(value),onRead:async()=>clone(readValue)});readValue={...clone(h.server()),draftKey:'fixture-record',profile:null,version:''};h.props.initialRead=clone(readValue);h.render();await h.settle();h.change('input','intro-v2-basic.monthlyHours','123');h.click('紹介文を保存');readValue=alter({...clone(h.server()),draftKey:'assigned-profile',profile:clone(h.calls[0].payload.profile),version:'b'.repeat(43)});await h.settle();assert.deepEqual(confirmed,[]);assert.match(h.text(),/紹介文と担当者を確認できません/);assert.equal(h.find('input','intro-v2-basic.monthlyHours').props.value,'123');
 }
});


test('section shortcuts keep every field visible, retain input and track scroll position without saving',async()=>{
 const h=harness();h.render();await h.settle();h.change('input','intro-v2-basic.monthlyHours','123');let scrollTop=0;const focused=[],positions={basic:200,careers:1500,preview:3000},elements=Object.fromEntries(Object.entries(positions).map(([id,top])=>[id,{getBoundingClientRect:()=>({top:top-scrollTop}),focus:()=>focused.push(id)}]));
 const root=h.render(),nav=nodes(root).find(node=>node.type==='nav'&&node.props['aria-label']==='紹介文の入力位置');root.props.ref.current={get scrollTop(){return scrollTop;},clientHeight:400,getBoundingClientRect:()=>({top:100}),querySelector:selector=>elements[selector.match(/"(.*?)"/)[1]],scrollTo:value=>{scrollTop=value.top;}};nav.props.ref.current={getBoundingClientRect:()=>({bottom:160})};
 assert.equal(h.find('button','基本情報へ移動').props['aria-current'],'location');h.click('職歴へ移動');assert.equal(focused.at(-1),'careers');assert.ok(scrollTop>1000);h.render().props.onScroll();assert.equal(h.find('button','職歴へ移動').props['aria-current'],'location');
 scrollTop=2900;h.render().props.onScroll();assert.equal(h.find('button','紹介文へ移動').props['aria-current'],'location');assert.equal(h.find('input','intro-v2-basic.monthlyHours').props.value,'123');assert.equal(h.calls.length,0);assert.equal(nodes(h.render()).filter(node=>node.props['data-intro-section']).length,3);assert.ok(nodes(h.render()).filter(node=>node.props['data-intro-section']).every(node=>!node.props.hidden));
 assert.equal(h.find('input','intro-v2-basic.age').props.inputMode,'numeric');assert.equal(h.find('input','intro-v2-basic.monthlyHours').props.inputMode,'decimal');
});

test('editing a profile during AI work cancels the older generation and ignores its late completion',async()=>{
 let finish,signal;const h=harness({onGenerate:(_profile,_settings,_client,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve;});}});h.render();await h.settle();h.click('AIで文章を整える');assert.equal(h.find('input','intro-v2-basic.monthlyHours').props.disabled,false);assert.equal(h.find('button','紹介文を保存').props.disabled,true);assert.equal(h.find('button','AIで文章を整える').props.disabled,true);
 h.change('input','intro-v2-basic.monthlyHours','123');assert.equal(signal.aborted,true);assert.equal(h.find('button','紹介文を保存').props.disabled,false);finish({edits:[edit],notice:'入力前の古いAI結果'});await h.settle();assert.equal(h.find('input','intro-v2-basic.monthlyHours').props.value,'123');assert.doesNotMatch(h.find('textarea','社内共有用の紹介文').props.value,/架電業務を担当していました/);assert.doesNotMatch(h.text(),/入力前の古いAI結果/);assert.equal(h.calls.length,0);
});
