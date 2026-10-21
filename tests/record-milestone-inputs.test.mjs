import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as management from '../lib/management-data.ts';
import * as metrics from '../lib/performance-metrics.ts';
import {businessToday} from '../lib/sheets-client.ts';
import {mutationDateErrors} from '../lib/save-correction.ts';
const source=ts.transpileModule(fs.readFileSync(new URL('../components/candidate-manager.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText+'\nexports.RecordEditor = RecordEditor;';
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
function harness(overrides={}){
 let cursor=0,closed=0;const slots=[],calls=[];
 const react={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},useId(){cursor++;return'milestone';}};
 const exports={},jsx=(type,props,key)=>({type,props:props||{},key});
 vm.runInNewContext(source,{exports,module:{exports},Error,require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('management-data')?management:name.includes('performance-metrics')?metrics:name.includes('sheets-client')?{businessToday}:name.includes('save-correction')?{mutationDateErrors}:new Proxy({},{get:(_,key)=>key})});
 const values=Array(26).fill('');values[0]='2020-01-01';values[2]='架空候補者';
 const props={record:{recordId:'record-one',rowVersion:'original-version',row:2,playerId:'ND-001',candidateName:'架空候補者',source:'',values,formulaColumns:[]},players:[],admin:false,disabled:false,live:true,save:{busy:false,uncertain:false,error:'',save:async(...args)=>{calls.push(args);return true;}},onClose:()=>closed++,...overrides};
 const render=()=>{cursor=0;return exports.RecordEditor(props);};
 const input=label=>nodes(render()).find(node=>node.type==='input'&&node.props['aria-label']===label);
 const change=(label,value)=>{const node=input(label);assert.ok(node,label);node.props.onChange({target:{value}});};
 const submit=async()=>{nodes(render()).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});for(let i=0;i<8;i++)await Promise.resolve();};
 const button=()=>nodes(render()).find(node=>node.type==='button'&&node.props['aria-label']==='実績カードの変更を保存');
 return{render,input,change,submit,button,calls,props,closed:()=>closed};
}

test('all seven cards edit the matching detail fields and submit one versioned update',async()=>{
 const h=harness();assert.equal(h.button().props.disabled,true);
 for(const [index,metric]of metrics.activityInputMetrics.entries()){
  const date=`2020-01-${String(index+2).padStart(2,'0')}`;h.change(`${metric.label}の日付`,date);
  const col=management.milestoneColumns[metric.stage];assert.equal(h.input(management.matchingFields[col-1]).props.value,date);
 }
 assert.equal(h.button().props.disabled,false);await h.submit();assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'updateRecord');assert.equal(h.calls[0][1].rowVersion,'original-version');assert.deepEqual(Object.keys(h.calls[0][1].changes),['1','8','9','17','21','22','24']);assert.equal(h.closed(),1);
});

test('detail edits update the cards, and reverting an unsaved date does not cancel a stored achievement',()=>{
 const h=harness();h.change('提案完了日','2020-01-02');assert.equal(h.input('提案数の日付').props.value,'2020-01-02');
 const cards=nodes(h.render()).find(node=>node.props.className==='record-milestone-summary');const card=nodes(cards).find(node=>node.props.className==='is-edited');const reset=nodes(card).find(node=>node.type==='button');assert.match(text(reset),/入力を戻す/);reset.props.onClick();assert.equal(h.input('提案数の日付').props.value,'');assert.equal(h.calls.length,0);assert.equal(h.button().props.disabled,true);
});

test('future actual dates show a field error and cannot be saved from either submit button',async()=>{
 const h=harness();h.change('C面談実施の日付','2099-01-01');assert.equal(h.input('C面談実施の日付').props['aria-invalid'],true);assert.equal(h.button().props.disabled,true);await h.submit();assert.equal(h.calls.length,0);assert.equal(h.closed(),0);
});

test('formula and read-only states remain protected, and the legacy uncertain retry remains available',async()=>{
 const h=harness();h.props.record.formulaColumns=[1];assert.equal(h.input('面談実施の日付').props.disabled,true);
 h.props.disabled=true;assert.equal(h.input('提案数の日付').props.disabled,true);await h.submit();assert.equal(h.calls.length,0);
 const retry=harness({save:{busy:false,uncertain:true,error:'通信結果不明',save:async()=>true}});await retry.submit();assert.equal(retry.closed(),1);
});
