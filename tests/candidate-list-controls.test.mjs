import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as groups from '../lib/candidate-groups.ts';
import * as intake from '../lib/candidate-intake.ts';
import * as conditions from '../lib/candidate-conditions.ts';
const source=ts.transpileModule(fs.readFileSync(new URL('../components/candidate-list-controls.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
function harness(overrides={}){
 let cursor=0;const slots=[],changes=[],sorts=[],focus=[];
 const props={filter:{owner:'all',status:'all',statuses:[],search:'検索は保持',appointment:'all',profile:'all'},onFilterChange:value=>{changes.push(value);props.filter=value;},sort:{field:'interview',direction:'desc'},onSortChange:value=>{sorts.push(value);props.sort=value;},players:[{id:'ND-001',name:'利用中の担当'},{id:'ND-002',name:'停止した担当',active:false}],statuses:['提案候補','提案完了',''],companies:['架空会社A','架空会社B','all','none',''],admin:true,intakeEnabled:true,...overrides};
 const react={useState(initial){const i=cursor++;const slot=slots[i]||={value:typeof initial==='function'?initial():initial};return [slot.value,value=>slot.value=typeof value==='function'?value(slot.value):value];},useId(){return 'controls-test';},useRef(initial){return slots[cursor++]||={current:initial};}};
 const jsx=(type,props,key)=>{if(type==='button'&&props?.ref)props.ref.current={focus:()=>focus.push(props['aria-label'])};return {type,props:props||{},key};},exports={};
 vm.runInNewContext(source,{exports,module:{exports},require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('candidate-groups')?groups:name.includes('candidate-intake')?intake:name.includes('candidate-conditions')?conditions:name.endsWith('.css')?{}:new Proxy({},{get:(_,key)=>key})});
 const render=next=>{Object.assign(props,next);cursor=0;return exports.CandidateListControls(props);};
 const find=(type,label)=>nodes(render()).find(n=>n.type===type&&(n.props['aria-label']===label||text(n)===label));
 const click=label=>{const node=find('button',label);assert.ok(node,label);assert.ok(!node.props.disabled,`${label} enabled`);node.props.onClick();};
 const select=(label,value)=>{const node=find('select',label);assert.ok(node,label);node.props.onChange({target:{value}});};
 const check=(label,checked)=>{const node=find('input',label);assert.ok(node,label);node.props.onChange({target:{checked}});};
 return {props,render,nodes:()=>nodes(render()),find,click,select,check,changes,sorts,focus};
}
test('filter and sort are explicit buttons with one visible inline panel and focus restored on Escape',()=>{
 const h=harness();assert.equal(h.find('button','候補者のフィルター').props['aria-expanded'],false);
 h.click('候補者のフィルター');assert.ok(h.nodes().some(n=>n.type==='section'&&n.props['aria-label']==='候補者フィルター'));assert.equal(h.changes.length,0);
 h.click('候補者の並べ替え');assert.equal(h.nodes().some(n=>n.type==='section'&&n.props['aria-label']==='候補者フィルター'),false);
 assert.ok(h.nodes().some(n=>n.type==='section'&&n.props['aria-label']==='候補者の並べ替え設定'));
 let prevented=false,stopped=false;h.render().props.onKeyDown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
 assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(h.find('button','候補者の並べ替え').props['aria-expanded'],false);assert.equal(h.focus.at(-1),'候補者の並べ替え');
});
test('filters apply immediately, preserve multiple statuses and search, and can reset every filter',()=>{
 const h=harness();h.click('候補者のフィルター');h.check('進捗：提案候補',true);h.check('進捗：提案完了',true);h.select('候補者の担当者','ND-002');h.select('候補者の提案先で絞り込み',JSON.stringify(['架空会社A']));h.select('候補者の予定で絞り込み','overdue');h.select('候補者の基本情報で絞り込み','without');
 assert.deepEqual(Array.from(h.props.filter.statuses),['提案候補','提案完了']);assert.equal(groups.candidateFilterCount(h.props.filter),5);assert.equal(h.props.filter.owner,'ND-002');assert.equal(h.props.filter.company,'架空会社A');
 assert.ok(h.nodes().some(n=>n.type==='strong'&&n.props['aria-label']==='5種類の条件を適用中'));
 const owner=h.find('select','候補者の担当者');assert.match(text(owner),/停止した担当（停止中）/);assert.equal(nodes(owner).find(n=>n.type==='option'&&n.props.value==='ND-002').props.disabled,undefined);
 h.check('進捗：提案候補',false);assert.deepEqual(Array.from(h.props.filter.statuses),['提案完了']);h.click('フィルターを解除');assert.equal(groups.candidateFilterCount(h.props.filter),0);assert.equal(h.props.filter.search,'検索は保持');assert.equal(h.find('button','フィルターを解除').props.disabled,true);
});
test('literal company names cannot collide with all/unregistered sentinels and unknown selections cannot alter controls',()=>{
 const h=harness();h.click('候補者のフィルター');h.select('候補者の提案先で絞り込み',JSON.stringify(['none']));assert.equal(h.props.filter.company,'none');h.select('候補者の提案先で絞り込み','none');assert.equal(h.props.filter.company,null);h.select('候補者の提案先で絞り込み',JSON.stringify(['all']));assert.equal(h.props.filter.company,'all');h.select('候補者の提案先で絞り込み','all');assert.equal(h.props.filter.company,undefined);
 const changes=h.changes.length;h.select('候補者の担当者','OTHER-ACCOUNT');h.select('候補者の提案先で絞り込み','injected');h.select('候補者の予定で絞り込み','yesterday');h.select('候補者の基本情報で絞り込み','secret');h.check('進捗：提案候補',true);assert.equal(h.changes.length,changes+1);
});
test('sort field and ascending/descending controls preserve each other and reject unknown keys',()=>{
 const h=harness();h.click('候補者の並べ替え');h.select('候補者の並び順','name');h.click('昇順');assert.equal(h.props.sort.field,'name');assert.equal(h.props.sort.direction,'asc');assert.equal(h.find('button','昇順').props['aria-pressed'],true);assert.equal(h.find('button','降順').props['aria-pressed'],false);assert.match(text(h.render()),/氏名の文字順/);
 h.select('候補者の並び順','records');assert.equal(h.props.sort.direction,'asc');h.click('降順');assert.equal(h.props.sort.field,'records');assert.equal(h.props.sort.direction,'desc');assert.match(text(h.render()),/提案・記録の件数/);const count=h.sorts.length;h.select('候補者の並び順','updatedAt');assert.equal(h.sorts.length,count);
});
test('player controls do not offer administrator owner filters or unavailable profile features',()=>{
 const h=harness({admin:false,intakeEnabled:false});h.click('候補者のフィルター');assert.equal(h.find('select','候補者の担当者'),undefined);assert.equal(h.find('select','候補者の基本情報で絞り込み'),undefined);assert.ok(h.find('select','候補者の提案先で絞り込み'));assert.ok(h.find('select','候補者の予定で絞り込み'));
});

test('a selected company, owner or status removed by a refresh remains visible as a recoverable filter',()=>{
 const h=harness({filter:{owner:'ND-OLD',status:'all',statuses:['旧進捗'],search:'',company:'過去の提案先',appointment:'all',profile:'all'}});h.click('候補者のフィルター');assert.match(text(h.find('select','候補者の担当者')),/以前の担当者（現在は名簿なし）/);assert.match(text(h.find('select','候補者の提案先で絞り込み')),/過去の提案先（現在は該当なし）/);assert.equal(h.find('input','進捗：旧進捗').props.checked,true);h.check('進捗：旧進捗',false);assert.equal(h.props.filter.statuses.length,0);h.click('フィルターを解除');assert.equal(groups.candidateFilterCount(h.props.filter),0);
});

test('recorded PC, CRM, experience and availability controls are optional, immediate and resettable',()=>{
 const h=harness();h.click('候補者のフィルター');
 assert.match(text(h.render()),/追加入力は不要/);assert.match(text(h.render()),/経験や適性は推定しません/);
 h.select('候補者のPC環境で絞り込み',JSON.stringify(['Windows']));h.select('候補者の登録CRMで絞り込み',JSON.stringify(['kintone']));
 h.find('input','候補者の経験・強みの記載で絞り込み').props.onChange({target:{value:'法人営業 テレアポ'}});
 h.find('input','候補者の稼働条件の記載で絞り込み').props.onChange({target:{value:'平日 週3日'}});
 assert.equal(h.props.filter.pcEnvironment,'Windows');assert.equal(h.props.filter.crmTool,'kintone');assert.equal(h.props.filter.experienceKeyword,'法人営業 テレアポ');assert.equal(h.props.filter.availabilityKeyword,'平日 週3日');assert.equal(groups.candidateFilterCount(h.props.filter),4);
 assert.equal(h.find('input','候補者の経験・強みの記載で絞り込み').props.maxLength,200);
 h.select('候補者のPC環境で絞り込み','none');h.select('候補者の登録CRMで絞り込み','none');assert.equal(h.props.filter.pcEnvironment,null);assert.equal(h.props.filter.crmTool,null);
 const count=h.changes.length;h.select('候補者のPC環境で絞り込み','injected');h.select('候補者の登録CRMで絞り込み',JSON.stringify(['Unknown CRM']));assert.equal(h.changes.length,count);
 h.click('フィルターを解除');assert.equal(groups.candidateFilterCount(h.props.filter),0);assert.equal(h.props.filter.experienceKeyword,undefined);assert.equal(h.props.filter.availabilityKeyword,undefined);assert.equal(h.props.filter.search,'検索は保持');
});

test('tomorrow is a separate visible appointment choice and profile controls stay hidden when unavailable',()=>{
 const h=harness();h.click('候補者のフィルター');assert.match(text(h.find('select','候補者の予定で絞り込み')),/明日の予定・前日準備/);h.select('候補者の予定で絞り込み','tomorrow');assert.equal(h.props.filter.appointment,'tomorrow');
 const unavailable=harness({intakeEnabled:false});unavailable.click('候補者のフィルター');for(const label of ['候補者のPC環境で絞り込み','候補者の登録CRMで絞り込み'])assert.equal(unavailable.find('select',label),undefined);for(const label of ['候補者の経験・強みの記載で絞り込み','候補者の稼働条件の記載で絞り込み'])assert.equal(unavailable.find('input',label),undefined);
});


test('numeric conditions combine without changing query, reject unknown units, and reset together',()=>{
 const h=harness();h.click('候補者のフィルター');
 h.find('input','週の稼働日数の下限').props.onChange({target:{value:'3'}});
 h.find('input','週の稼働日数の上限').props.onChange({target:{value:'5'}});
 h.find('input','月の稼働時間の下限').props.onChange({target:{value:'80'}});
 h.find('input','希望時給の上限').props.onChange({target:{value:'2500'}});
 h.find('input','候補者の開始可能日の上限').props.onChange({target:{value:'2026-11-20'}});
 h.select('候補者の条件の確認状態','rate:ambiguous');
 assert.equal(h.props.filter.daysMin,3);assert.equal(h.props.filter.daysMax,5);assert.equal(h.props.filter.hoursMin,80);assert.equal(h.props.filter.rateMax,2500);assert.equal(h.props.filter.availableBy,'2026-11-20');assert.equal(h.props.filter.conditionCheck,'rate:ambiguous');
 assert.equal(groups.candidateFilterCount(h.props.filter),5);assert.equal(h.props.filter.search,'検索は保持');
 const count=h.changes.length;h.select('候補者の条件の確認状態','secret:known');h.find('input','週の稼働日数の上限').props.onChange({target:{value:'100'}});h.find('input','候補者の開始可能日の上限').props.onChange({target:{value:'2026-02-30'}});assert.equal(h.changes.length,count);
 h.find('input','週の稼働日数の上限').props.onChange({target:{value:'2'}});assert.match(text(h.render()),/下限を上限以下/);
 assert.match(text(h.render()),/基本情報・紹介文/);assert.match(text(h.render()),/月額から換算しません/);
 h.click('フィルターを解除');assert.equal(groups.candidateFilterCount(h.props.filter),0);assert.equal(h.props.filter.daysMin,undefined);assert.equal(h.props.filter.conditionCheck,undefined);
});

test('a needs-confirmation selection can clear just its conflicting numeric bounds',()=>{
 const h=harness();h.click('候補者のフィルター');h.find('input','希望時給の上限').props.onChange({target:{value:'2500'}});h.find('input','週の稼働日数の下限').props.onChange({target:{value:'3'}});h.select('候補者の条件の確認状態','rate:ambiguous');
 assert.match(text(h.render()),/同じ項目の範囲条件を同時に適用できません/);h.click('その項目の範囲だけ解除');assert.equal(h.props.filter.rateMax,undefined);assert.equal(h.props.filter.daysMin,3);assert.equal(h.props.filter.conditionCheck,'rate:ambiguous');
 h.find('input','週の稼働日数の下限').props.onChange({target:{value:'3.5'}});assert.match(text(h.render()),/0〜7の整数/);
});
