import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as reward from '../lib/reward-proposal.ts';
const source=ts.transpileModule(fs.readFileSync(new URL('../components/reward-proposal.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
function harness(overrides={}){
 let cursor=0,uuid=0;const slots=[],focus=[],submitted=[];
 const react={useState(initial){const i=cursor++;const slot=slots[i]||={value:typeof initial==='function'?initial():initial};return [slot.value,value=>slot.value=typeof value==='function'?value(slot.value):value];},useRef(initial){return slots[cursor++]||={current:initial};},useMemo(fn){return fn();}};
 const jsx=(type,props,key)=>{if(type==='button'&&props?.ref)props.ref.current={focus:()=>focus.push(text(props.children))};return {type,props:props||{},key};},exports={};
 class FixtureFormData{constructor(form){this.fields=form.fields;}get(name){return this.fields[name]??null;}}
 vm.runInNewContext(source,{exports,module:{exports},Error,FormData:FixtureFormData,crypto:{randomUUID:()=>`fixture-idea-${++uuid}`},require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('reward-proposal')?reward:name.endsWith('.css')?{}:new Proxy({},{get:(_,key)=>key})});
 const props={players:[{id:'A',name:'架空A'},{id:'B',name:'架空B'},{id:'C',name:'停止した架空C',active:false}],counts:{'2026-09':{A:{'提案':3},B:{'提案':1},C:{'提案':0}},'2026-10':{A:{'提案':1},B:{'提案':2},C:{'提案':0}}},currentMonth:'2026-10',selfPlayerId:'A',admin:true,syncedAt:'2026-10-30T00:00:00Z',...overrides};
 const render=next=>{Object.assign(props,next);cursor=0;return exports.RewardProposal(props);};
 const find=(type,label)=>nodes(render()).find(n=>n.type===type&&(n.props['aria-label']===label||text(n)===label));
 const click=label=>{const node=find('button',label);assert.ok(node,label);assert.ok(!node.props.disabled);node.props.onClick();};
 const submit=(label,fields)=>{const node=find('form',label);assert.ok(node,label);let reset=false,prevented=false;node.props.onSubmit({preventDefault(){prevented=true;},currentTarget:{fields,reset(){reset=true;}}});submitted.push({label,reset,prevented});};
 return {props,render,nodes:()=>nodes(render()),find,click,submit,focus,submitted};
}
test('point balances and examples clearly remain a proposal and disclose their visible calculation scope',()=>{
 const h=harness();const tree=h.render();assert.match(text(tree),/社内提案用・試算/);assert.match(text(tree),/実際のポイント付与・特典の確約・交換は行いません/);assert.match(text(tree),/取得済みの名簿 3名（停止中 1名を含む）/);assert.match(text(tree),/表示できる名簿や取得済みの月が異なると/);assert.equal(h.nodes().some(n=>n.type==='button'&&/交換する|付与を確定|受け取る/.test(text(n))),false);assert.equal(h.find('p','').props.role,'status');
 const balances=h.nodes().filter(n=>n.type==='article'&&String(n.props.className).startsWith('reward-balance'));assert.equal(balances.length,3);
 const player=harness({admin:false});assert.equal(player.nodes().filter(n=>n.type==='article'&&String(n.props.className).startsWith('reward-balance')).length,1);
});
test('applying a what-if rule announces the calculation and returns keyboard focus to its trigger',()=>{
 const h=harness();h.click('付与ルールを試す');h.submit('ポイントの試算ルール',{points:'50',milestone:'200'});assert.equal(h.find('form','ポイントの試算ルール'),undefined);assert.equal(h.focus.at(-1),'付与ルールを試す');const status=h.nodes().find(n=>n.props.role==='status');assert.match(text(status),/月間1位50pt、貯める目安200pt/);assert.equal(status.props['aria-live'],'polite');assert.equal(status.props['aria-atomic'],'true');assert.match(text(h.render()),/月間1位で 50/);
 h.render({currentMonth:'2026-11'});h.click('付与ルールを試す');assert.equal(h.nodes().find(n=>n.type==='input'&&n.props.name==='points').props.defaultValue,50);assert.equal(h.submitted[0].prevented,true);
});
test('invalid rule values preserve the form and focus while showing an actionable error',()=>{
 const h=harness();h.click('付与ルールを試す');h.submit('ポイントの試算ルール',{points:'1.5',milestone:'500'});assert.ok(h.find('form','ポイントの試算ルール'));assert.equal(h.focus.length,0);assert.match(text(h.nodes().find(n=>n.props.role==='alert')),/1位のポイント/);assert.match(text(h.render()),/月間1位で 100/);
});
test('adding an idea announces a proposal, restores focus, and renders the name only as text',()=>{
 const h=harness();h.click('特典案を追加');h.submit('特典のアイデアを追加',{name:'<script>架空の表彰案</script>',points:'600'});assert.equal(h.find('form','特典のアイデアを追加'),undefined);assert.equal(h.focus.at(-1),'特典案を追加');assert.match(text(h.nodes().find(n=>n.props.role==='status')),/600ptの例として追加/);assert.equal(h.nodes().some(n=>n.type==='script'||n.props.dangerouslySetInnerHTML),false);assert.equal(h.submitted[0].reset,true);assert.match(text(h.render()),/会社のルールに合わせて決めます/);
});
test('invalid or too many ideas are not silently accepted and do not move the focus',()=>{
 const h=harness();h.click('特典案を追加');h.submit('特典のアイデアを追加',{name:'',points:'0'});assert.ok(h.find('form','特典のアイデアを追加'));assert.equal(h.focus.length,0);assert.match(text(h.nodes().find(n=>n.props.role==='alert')),/特典名は50文字以内/);
 for(let i=0;i<6;i++){h.submit('特典のアイデアを追加',{name:`架空案${i}`,points:'100'});if(i<5)h.click('特典案を追加');}
 assert.equal(h.nodes().filter(n=>n.props.className==='reward-idea-badge').length,8);h.click('特典案を追加');const before=h.focus.length;h.submit('特典のアイデアを追加',{name:'9件目の架空案',points:'100'});assert.ok(h.find('form','特典のアイデアを追加'));assert.equal(h.focus.length,before);assert.equal(h.nodes().filter(n=>n.props.className==='reward-idea-badge').length,8);
});
