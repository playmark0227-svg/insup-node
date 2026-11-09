import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import * as sales from '../lib/sales-workflow.ts';
import * as jobContext from '../lib/introduction-job-context.ts';
import {SheetApiError,isUncertainWrite} from '../lib/sheets-client.ts';
const source=ts.transpileModule(fs.readFileSync(new URL('../components/sales-workflow.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const copy=v=>JSON.parse(JSON.stringify(v));
const nodes=v=>!v||typeof v!=='object'?[]:Array.isArray(v)?v.flatMap(nodes):[v,...nodes(v.props?.children)];
const text=v=>v==null||typeof v==='boolean'?'':typeof v==='string'||typeof v==='number'?String(v):Array.isArray(v)?v.map(text).join(''):text(v.props?.children);
const record=(id,name,owner='ND-001')=>({recordId:id,candidateName:name,rowVersion:'row-version',row:2,playerId:owner,source:'架空紹介元',values:Array(26).fill(''),formulaColumns:[]});
function harness(overrides={}){
 let cursor=0,readCount=0;const slots=[],effects=[],calls=[],pending=[],dirty=[],readCalls=[];
 const records=[record('record_00000000000001','架空あおい'),record('record_00000000000002','架空かえで'),record('record_00000000000003','架空他者','ND-002')];
 const data={feature:true,schemaVersion:1,period:"2026-11",jobs:[],plans:[],reports:[],companyCounts:[],checkedAt:'2026-11-06T00:00:00Z'};
 const props={identityKey:'session-a',selfPlayerId:'ND-001',admin:false,enabled:true,canWrite:true,active:true,records,profiles:[],players:[],onRead:async payload=>{readCount++;readCalls.push(copy(payload));return copy({...data,period:payload?.period||"2026-11"});},onSave:async(command,id)=>calls.push({command:copy(command),id}),onDirtyChange:v=>dirty.push(v),onPendingChange:v=>pending.push(v),...overrides};
 const react={useState(initial){const i=cursor++,slot=slots[i]||={value:typeof initial==='function'?initial():initial};return [slot.value,v=>{slot.value=typeof v==='function'?v(slot.value):v;}];},useRef(initial){return slots[cursor++]||={current:initial};},useMemo(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:fn()};return slots[i].value;},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const jsx=(type,props,key)=>({type,props:props||{},key}),exports={};
 vm.runInNewContext(source,{exports,module:{exports},crypto:{randomUUID},Date,Intl,Set,Map,Error,require:n=>n==='react'?react:n==='react/jsx-runtime'?{jsx,jsxs:jsx}:n.includes('sheets-client')?{isUncertainWrite}:n.includes('introduction-job-context')?jobContext:n.includes('sales-workflow')&&!n.endsWith('.css')?sales:n.endsWith('.css')?{}:new Proxy({},{get:(_,k)=>k})});
 const render=next=>{Object.assign(props,next);cursor=0;const tree=exports.SalesWorkflow(props);while(effects.length)effects.shift()();return tree;};
 const all=()=>nodes(render()),find=(type,label)=>all().find(n=>n.type===type&&(n.props['aria-label']===label||text(n)===label));
 const button=label=>all().find(n=>n.type==='button'&&(n.props['aria-label']===label||text(n).startsWith(label)));
 const click=label=>{const b=button(label);assert.ok(b,label);assert.ok(!b.props.disabled,label+' enabled');b.props.onClick?.();};
 const change=(type,label,value)=>{const node=find(type,label);assert.ok(node,label);node.props.onChange({target:{value,checked:!!value}});};
 const labelChange=(label,value)=>{const l=all().find(n=>n.type==='label'&&text(n).startsWith(label));assert.ok(l,label);const input=nodes(l).find(n=>['input','textarea','select'].includes(n.type));assert.ok(input);input.props.onChange({target:{value,checked:!!value}});};
 const settle=async()=>{for(let i=0;i<20;i++){await Promise.resolve();render();}};
 return {props,records,calls,readCalls,pending,dirty,render,all,find,button,click,change,labelChange,settle,readCount:()=>readCount,data};
}
test('unavailable workflow performs no reads or mutations',async()=>{const h=harness({enabled:false});h.render();await h.settle();assert.equal(h.readCount(),0);assert.match(text(h.render()),/利用できません/);assert.equal(h.calls.length,0);});
test('entry record opens once and snapshot refresh never retargets another candidate draft',async()=>{const h=harness({entryRecordId:'record_00000000000001'});h.render();await h.settle();assert.equal(h.find('select','提案予定の候補者').props.value,h.records[0].recordId);h.change('select','提案予定の候補者',h.records[1].recordId);h.labelChange('会社を自由入力','架空法人');h.render();h.render({records:copy(h.records)});assert.equal(h.find('select','提案予定の候補者').props.value,h.records[1].recordId);assert.equal(h.find('select','提案予定の候補者').props.disabled,true);assert.doesNotMatch(text(h.find('select','提案予定の候補者')),/架空他者/);});
test('uncertain proposal save keeps its ID and input while another screen is active',async()=>{let attempt=0;const h=harness({onSave:async(command,id)=>{h.calls.push({command:copy(command),id});if(attempt++===0)throw new SheetApiError('NETWORK','通信を確認してください。');}});h.render();await h.settle();h.click('提案先の検討');h.change('select','提案予定の候補者',h.records[0].recordId);h.labelChange('会社を自由入力','架空法人');h.render();const form=h.all().find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});await h.settle();assert.equal(h.pending.at(-1),true);const first=copy(h.calls[0]);assert.equal(h.render({active:false}),null);h.render({active:true});h.click('保存状況を再確認');await h.settle();assert.deepEqual(h.calls[1],first);assert.equal(h.pending.at(-1),false);});
test('saving a proposal does not erase a separate retained job draft',async()=>{const h=harness({admin:true});h.render();await h.settle();h.click('案件を登録');h.labelChange('会社名','編集中の架空会社');h.render();const drawer=h.all().find(n=>typeof n.type==='function'&&n.props.title==='案件を登録');assert.ok(drawer);drawer.props.onClose();h.render();h.click('提案先の検討');h.change('select','提案予定の候補者',h.records[0].recordId);h.labelChange('会社を自由入力','別の架空法人');h.render();h.all().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await h.settle();h.click('案件リスト');h.click('案件の入力を続ける');const label=h.all().find(n=>n.type==='label'&&text(n).startsWith('会社名'));assert.equal(nodes(label).find(n=>n.type==='input').props.value,'編集中の架空会社');assert.equal(h.dirty.at(-1),true);});
test('changing login drops private previous-session drafts and late response data',async()=>{let done;const h=harness({onRead:()=>new Promise(resolve=>{done=resolve;})});h.render();const old=done;h.render({identityKey:'session-b',enabled:false});old({...h.data,plans:[sales.blankWorkJob()]});await h.settle();assert.doesNotMatch(text(h.render()),/架空法人|保存しました/);assert.equal(h.calls.length,0);assert.equal(h.pending.at(-1),false);});

test('a closed dirty match report has an explicit route back to its retained input',async()=>{const own=record('record_00000000000001','架空あおい');own.values[1]='架空法人';const h=harness({records:[own]});h.render();await h.settle();h.click('マッチ報告');h.change('select','マッチ報告の提案',own.recordId);h.click('報告を作成・確認');h.labelChange('コメント・確認事項','確認中の架空コメント');h.render();const drawer=h.all().find(n=>typeof n.type==='function'&&n.props.title==='マッチ成立の報告');assert.ok(drawer);drawer.props.onClose();h.render();h.click('報告の入力を続ける');const label=h.all().find(n=>n.type==='label'&&text(n).startsWith('コメント・確認事項'));assert.equal(nodes(label).find(n=>n.type==='textarea').props.value,'確認中の架空コメント');assert.equal(h.calls.length,0);});

test('company aggregate month and all controls request explicit periods and label planned inventory separately',async()=>{const h=harness();h.render();await h.settle();h.click('提案先の検討');h.change('input','会社別提案件数の月','2026-09');await h.settle();assert.equal(h.readCalls.at(-1).period,'2026-09');assert.match(text(h.render()),/チーム全員/);assert.match(text(h.render()),/現在の未送信の在庫/);h.labelChange('全期間の提案実績を見る',true);await h.settle();assert.equal(h.readCalls.at(-1).period,'all');assert.match(text(h.render()),/全期間の実績/);});


test('selected job and candidate open one company introduction without erasing an unfinished proposal',async()=>{
 const contexts=[],h=harness({onComposeIntroduction:context=>contexts.push(copy(context))});
 const job={...sales.blankWorkJob(),jobId:'job_00000000000000001',company:'紹介先の架空法人',title:'法人営業',rateMin:3000,rateMax:4000,rateUnit:'hour',tax:'excluded',updatedAt:'2026-11-09T00:00:00Z'};
 h.data.jobs.push(job);h.render();await h.settle();
 h.click('提案先の検討');h.change('select','提案予定の候補者',h.records[0].recordId);h.labelChange('会社を自由入力','保持する未保存の会社');h.render();
 h.click('案件リスト');assert.equal(h.button('この案件の企業向け紹介文'),undefined);
 h.click('候補者を選んで確認');assert.equal(h.find('select','案件と確認する候補者').props.disabled,true);
 h.click('この案件の企業向け紹介文');
 assert.equal(contexts.length,1);assert.equal(contexts[0].recordId,h.records[0].recordId);assert.equal(contexts[0].jobId,job.jobId);assert.equal(contexts[0].company,job.company);assert.ok(contexts[0].requestId);
 assert.deepEqual(contexts[0].jobBudget,{min:3000,max:4000,unit:'hour',tax:'excluded'});
 assert.equal(h.calls.length,0);assert.equal(h.render({active:false}),null);h.render({active:true});h.click('提案先の検討');
 const label=h.all().find(n=>n.type==='label'&&text(n).startsWith('会社を自由入力'));
 assert.equal(nodes(label).find(n=>n.type==='input').props.value,'保持する未保存の会社');
});

test('company introduction requires a selected candidate, and report replies keep their exact report',async()=>{
 const contexts=[],discussions=[],h=harness({onComposeIntroduction:context=>contexts.push(context),reportCommentsEnabled:true,onOpenReportDiscussion:report=>discussions.push(report)});
 h.data.jobs.push({...sales.blankWorkJob(),jobId:'job_00000000000000001',company:'架空法人',title:'法人営業',updatedAt:'2026-11-09T00:00:00Z'});
 const report={reportId:'report_00000000000001',recordId:h.records[0].recordId,ownerId:'ND-001',candidateName:'架空あおい',company:'架空法人',status:'submitted',matchDate:'2026-11-09',sale:{amount:null,unit:'unknown',tax:'unknown'},wholesale:{amount:null,unit:'unknown',tax:'unknown'}};
 h.data.reports.push(report);h.render();await h.settle();h.click('候補者を選んで確認');
 assert.equal(h.button('この案件の企業向け紹介文'),undefined);
 h.change('select','案件と確認する候補者',h.records[0].recordId);h.click('この案件の企業向け紹介文');assert.equal(contexts.length,1);
 h.click('マッチ報告');h.click('コメント・返信');assert.equal(discussions.length,1);assert.equal(discussions[0].reportId,report.reportId);
 h.render({reportCommentsEnabled:false});assert.equal(h.button('コメント・返信'),undefined);
});

test('returning to the same sales view reuses a recent verified read while manual refresh always checks again',async t=>{
 let now=1_000_000;t.mock.method(Date,'now',()=>now);const h=harness();h.render();await h.settle();assert.equal(h.readCount(),1);
 for(let n=0;n<10;n++){h.render({active:false});h.render({active:true});await h.settle();}
 assert.equal(h.readCount(),1);
 h.click('最新を取得');await h.settle();assert.equal(h.readCount(),2);
 now+=30_001;h.render({active:false});h.render({active:true});await h.settle();assert.equal(h.readCount(),3);
});

test('sales period switches restore recent month data without repeating a request and a revision immediately hides previous data',async()=>{
 const h=harness();h.data.jobs.push({...sales.blankWorkJob(),jobId:'job_00000000000000001',company:'前の範囲の架空案件',title:'確認済みの案件'});h.render();await h.settle();h.click('提案先の検討');
 const initialPeriod=h.readCalls[0].period;h.change('input','会社別提案件数の月','2026-09');await h.settle();assert.equal(h.readCount(),2);
 h.change('input','会社別提案件数の月',initialPeriod);await h.settle();assert.equal(h.readCount(),2);
 let finish;const current=h.render({refreshRevision:'changed',onRead:()=>new Promise(resolve=>{finish=resolve;})});assert.doesNotMatch(text(current),/前の範囲の架空案件/);
 h.render({identityKey:'session-b',enabled:false});finish({...h.data,period:initialPeriod});await h.settle();assert.doesNotMatch(text(h.render()),/前の範囲の架空案件/);
});

test('an unfinished first sales read is shared across repeated view changes and enabling cannot restore a late disabled result',async()=>{
 let count=0,finish;const h=harness({onRead:()=>{count++;return new Promise(resolve=>{finish=resolve;});}});h.render();h.render({active:false});h.render({active:true});h.render({active:false});h.render({active:true});assert.equal(count,1);
 h.render({enabled:false});finish({...h.data,period:'2026-11',jobs:[{...sales.blankWorkJob(),company:'無効化後の古い案件',title:'表示しない'}]});await h.settle();assert.doesNotMatch(text(h.render()),/無効化後の古い案件/);
 h.render({enabled:true});assert.equal(count,2);assert.doesNotMatch(text(h.render()),/無効化後の古い案件/);
});

test('a confirmed sales save releases the editor while refreshed list data is still pending',async()=>{
 let count=0,finish;const h=harness({onRead:payload=>{count++;return count===1?Promise.resolve({...h.data,period:payload.period}):new Promise(resolve=>{finish=resolve;});}});h.render();await h.settle();h.click('提案先の検討');h.change('select','提案予定の候補者',h.records[0].recordId);h.labelChange('会社を自由入力','保存済み架空会社');
 h.all().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await h.settle();assert.equal(h.pending.at(-1),false);assert.match(text(h.render()),/保存しました/);assert.equal(h.find('select','提案予定の候補者').props.disabled,false);
 h.labelChange('会社を自由入力','再取得中の次の入力');h.render();assert.equal(h.dirty.at(-1),true);finish({...h.data,period:'2026-11'});await h.settle();const label=h.all().find(n=>n.type==='label'&&text(n).startsWith('会社を自由入力'));assert.equal(nodes(label).find(n=>n.type==='input').props.value,'再取得中の次の入力');
});

test('a cached current period stays selected when an older month request completes later',async()=>{
 let count=0,finish;const h=harness({onRead:payload=>{count++;return count===1?Promise.resolve({...h.data,period:payload.period}):new Promise(resolve=>{finish=()=>resolve({...h.data,period:payload.period,companyCounts:[{company:'遅れて届く前月',planned:0,sent:1}]});});}});h.render();await h.settle();const initialPeriod=h.find('input','会社別提案件数の月')?.props.value||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date());h.click('提案先の検討');
 h.change('input','会社別提案件数の月','2026-09');h.render();h.change('input','会社別提案件数の月',initialPeriod);h.render();assert.equal(count,2);assert.equal(h.find('input','会社別提案件数の月').props.disabled,false);finish();await h.settle();assert.doesNotMatch(text(h.render()),/遅れて届く前月/);assert.match(text(h.render()),new RegExp(initialPeriod+'の実績'));
});

test('a sales job drawer closes during a pending save while its same-ID retry and draft survive navigation',async()=>{
 let finish,attempt=0;const h=harness({admin:true,onSave:(command,id)=>{h.calls.push({command:copy(command),id});return attempt++===0?new Promise((_resolve,reject)=>{finish=()=>reject(new SheetApiError('NETWORK','保存結果は未確認です。'));}):Promise.resolve();}});h.render();await h.settle();h.click('案件を登録');h.labelChange('会社名','通信待ちの架空法人');h.labelChange('案件名・募集職種','保持する架空案件');h.render();h.all().find(n=>n.type==='form'&&n.props['aria-label']==='案件の登録・編集').props.onSubmit({preventDefault(){}});h.render();assert.equal(h.calls.length,1);assert.equal(h.pending.at(-1),true);
 const drawer=h.all().find(n=>typeof n.type==='function'&&n.props.title==='案件を登録');assert.equal(drawer.props.blocked,true);drawer.props.onClose();h.render();assert.equal(h.all().some(n=>typeof n.type==='function'&&n.props.title==='案件を登録'),false);assert.equal(h.dirty.at(-1),true);assert.doesNotMatch(text(h.render()),/保存しました/);
 h.render({active:false});h.render({active:true});h.click('提案先の検討');h.render();assert.equal(h.calls.length,1);finish();await h.settle();h.click('保存状況を再確認');await h.settle();assert.deepEqual(h.calls[0],h.calls[1]);assert.equal(h.calls[1].command.payload.title,'保持する架空案件');assert.equal(h.pending.at(-1),false);
});

test('a report drawer closes during its save without clearing the submitted comment or repeating the request',async()=>{
 let finish;const own=record('record_00000000000001','架空あおい');own.values[1]='架空法人';const h=harness({records:[own],onSave:(command,id)=>{h.calls.push({command:copy(command),id});return new Promise(resolve=>{finish=resolve;});}});h.render();await h.settle();h.click('マッチ報告');h.change('select','マッチ報告の提案',own.recordId);h.click('報告を作成・確認');h.labelChange('コメント・確認事項','保存待ちの確認事項');h.render();h.all().find(n=>n.type==='form'&&n.props['aria-label']==='マッチ成立の報告').props.onSubmit({preventDefault(){}});h.render();const drawer=h.all().find(n=>typeof n.type==='function'&&n.props.title==='マッチ成立の報告');assert.equal(drawer.props.blocked,true);drawer.props.onClose();h.render({active:false});h.render({active:true});h.click('案件リスト');h.render();assert.equal(h.calls.length,1);assert.equal(h.calls[0].command.payload.comment,'保存待ちの確認事項');assert.equal(h.pending.at(-1),true);assert.equal(h.dirty.at(-1),true);assert.doesNotMatch(text(h.render()),/保存しました/);finish();await h.settle();assert.equal(h.calls.length,1);assert.equal(h.pending.at(-1),false);assert.match(text(h.render()),/保存しました/);
});

test('a multi-company proposal batch continues exactly once per destination while its view is hidden',async()=>{
 const completions=[],h=harness({onSave:(command,id)=>{h.calls.push({command:copy(command),id});return new Promise(resolve=>completions.push(resolve));}});h.data.jobs.push({...sales.blankWorkJob(),jobId:'job_00000000000000001',company:'複数先A',title:'架空案件A'},{...sales.blankWorkJob(),jobId:'job_00000000000000002',company:'複数先B',title:'架空案件B'});h.render();await h.settle();h.click('提案先の検討');h.change('select','提案予定の候補者',h.records[0].recordId);h.labelChange('複数先A',true);h.render();h.labelChange('複数先B',true);h.render();h.all().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();assert.equal(h.calls.length,1);h.render({active:false});completions[0]();await h.settle();assert.equal(h.calls.length,2);assert.equal(h.calls[0].command.payload.company,'複数先A');assert.equal(h.calls[1].command.payload.company,'複数先B');assert.notEqual(h.calls[0].id,h.calls[1].id);assert.equal(h.pending.at(-1),true);completions[1]();await h.settle();h.render({active:true});assert.equal(h.calls.length,2);assert.equal(h.pending.at(-1),false);assert.match(text(h.render()),/保存しました/);
});
