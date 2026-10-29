import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as operations from '../lib/operations.ts';
import {SheetApiError,isUncertainWrite} from '../lib/sheets-client.ts';
const account={id:'ND-001',name:'合成プレイヤー',team:'NODE',role:'player',active:true,sheetNames:['合成担当'],target:20,version:'original',hasCredentials:true};
const management={checkedAt:'2026-10-30T00:00:00Z',accounts:[account,{...account,id:'ADMIN',role:'admin'}],canManageAccounts:true};
const clone=v=>JSON.parse(JSON.stringify(v));
test('account DTO rejects malformed roles, duplicate IDs and unmatched mutation receipts',()=>{
 operations.assertAccountManagement(management);operations.assertAccountManagement({...management,canManageAccounts:false});
 for(const override of [{active:'true'},{role:'owner'},{version:''},{sheetNames:[1]},{target:NaN}])assert.throws(()=>operations.assertAccountManagement({...management,accounts:[{...account,...override}]}));
 assert.throws(()=>operations.assertAccountManagement({...management,accounts:[account,account]}));
 const command={playerId:account.id,action:'stop',expectedVersion:account.version},receipt={managed:true,operationId:'operation-a',playerId:account.id,action:'stop',active:false,version:'new',replayed:false};
 operations.assertAccountResult(receipt,command,'operation-a');
 for(const override of [{operationId:'other'},{playerId:'ND-002'},{action:'resume'},{active:'false'},{replayed:1}])assert.throws(()=>operations.assertAccountResult({...receipt,...override},command,'operation-a'));
});
test('history pagination and export refuse malformed or credential-bearing files',()=>{
 operations.assertOperationHistory({checkedAt:'now',entries:[{row:2,committedAt:'now',actorId:'ADMIN',action:'unknown',summary:'更新しました'}],nextCursor:null});
 for(const value of [{checkedAt:'now',entries:[],nextCursor:1},{checkedAt:'now',entries:[{row:2}],nextCursor:null}])assert.throws(()=>operations.assertOperationHistory(value));
 const data={schemaVersion:1,exportedAt:'2026-10-30T00:00:00Z',scope:'application-data',snapshot:{players:[]},managementTables:[],limits:{maxCells:50000,maxCharacters:2000000}};
 assert.equal(operations.validateDataExport(data),data);
 for(const key of ['outboxKey','credentials','token','apiKey','password'])assert.throws(()=>operations.validateDataExport({...data,snapshot:{nested:{[key]:'secret'}}}));
 assert.throws(()=>operations.validateDataExport({...data,extra:'unexpected'}));
 assert.throws(()=>operations.validateDataExport({...data,snapshot:{text:'x'.repeat(2000001)}}));
});
const source=ts.transpileModule(fs.readFileSync(new URL('../components/operational-tools.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
function harness(props){let cursor=0;const slots=[],effects=[],calls=[];const react={useState(initial){const i=cursor++;const slot=slots[i]||=( {value:typeof initial==='function'?initial():initial});return [slot.value,v=>{slot.value=typeof v==='function'?v(slot.value):v;}];},useRef(initial){return slots[cursor++]||={current:initial};},useEffect(fn,deps){const i=cursor++,previous=slots[i];if(!previous||deps.some((v,index)=>!Object.is(v,previous.deps[index]))){slots[i]={deps};effects.push(()=>{previous?.cleanup?.();slots[i].cleanup=fn();});}}};const jsx=(type,props,key)=>({type,props:props||{},key}),exports={};
 vm.runInNewContext(source,{exports,module:{exports},crypto:{randomUUID:()=>`synthetic-${calls.length}`},require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('sheets-client')?{SheetApiError,isUncertainWrite}:name.includes('operations')?operations:name.endsWith('.css')?{}:new Proxy({},{get:(_,key)=>key}),setTimeout,URL,Blob});
 const p={enabled:true,busy:false,blocked:false,onRead:async()=>clone(management),onManage:async(command,id)=>{calls.push([command,id]);return {managed:true,operationId:id,...command,active:false,version:'new',replayed:false};},...props};
 const render=next=>{Object.assign(p,next);cursor=0;const tree=exports.AccountManagementPanel(p);while(effects.length)effects.shift()();return tree;};
 const button=label=>nodes(render()).find(n=>n.type==='button'&&text(n)===label),click=label=>{const b=button(label);assert.ok(b,label);assert.ok(!b.props.disabled,label);return b.props.onClick();};
 return {render,button,click,calls,p,nodes:()=>nodes(render()),settle:async()=>{for(let i=0;i<20;i++){await Promise.resolve();render();}}};
}
test('account changes require human confirmation and retain exact operation across uncertain retries',async()=>{
 let attempt=0;const pending=[];const h=harness({onPendingChange:value=>pending.push(value),onManage:async(command,id)=>{h.calls.push([clone(command),id]);if(attempt++===0)throw new SheetApiError('NETWORK','接続を確認');return {managed:true,operationId:id,playerId:command.playerId,action:command.action,active:false,version:'new',replayed:true};}});h.render();await h.settle();
 assert.equal(h.calls.length,0);h.click('利用を停止');assert.equal(h.calls.length,0);assert.match(text(h.render()),/過去の成果|候補者情報/);
 h.click('確認して実行');await h.settle();assert.equal(h.calls.length,1);assert.equal(h.button('実行せず戻る').props.disabled,true);assert.equal(pending.at(-1),true);
 h.nodes().find(n=>n.type==='Dialog').props.onOpenChange(false);assert.ok(h.button('同じ操作で結果を確認'));
 h.click('同じ操作で結果を確認');await h.settle();assert.equal(h.calls.length,2);assert.deepEqual(h.calls[0],h.calls[1]);assert.equal(pending.at(-1),false);
});
test('unresolved saves and unsaved drafts block account actions while admin is never an action target',async()=>{
 const h=harness();h.render();await h.settle();h.render({blocked:true});assert.equal(h.button('利用を停止').props.disabled,true);assert.equal(h.button('全端末ログアウト').props.disabled,true);assert.equal(h.nodes().filter(n=>n.type==='button'&&text(n)==='利用を停止').length,1);assert.match(text(h.render()),/管理者の停止はここでは行えません/);assert.equal(h.calls.length,0);
});

test('read-only account management still displays the list and disables all state changes',async()=>{const h=harness({onRead:async()=>({...clone(management),canManageAccounts:false})});h.render();await h.settle();assert.match(text(h.render()),/閲覧のみ/);assert.equal(h.button('利用を停止').props.disabled,true);assert.equal(h.button('全端末ログアウト').props.disabled,true);assert.equal(h.calls.length,0);});

test('application export accepts a large valid management table below the server cell and character caps',()=>{
 const rows=Array.from({length:220},(_,i)=>({row:i+1,cells:Array.from({length:80},(_,j)=>({column:j+1,value:'',display:'',kind:'text',options:[],readonly:false,note:'',formula:''}))}));
 const data={schemaVersion:1,exportedAt:'2026-10-30T00:00:00.000Z',scope:'application-data',snapshot:{players:[]},managementTables:[{sheetId:1,title:'案件管理表',rowCount:220,columnCount:80,rows}],limits:{maxCells:50000,maxCharacters:2000000}};
 assert.equal(rows.length*rows[0].cells.length,17600);assert.ok(JSON.stringify(data).length<2000000);
 assert.equal(operations.validateDataExport(data),data);
});
