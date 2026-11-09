import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(fs.readFileSync(new URL('../components/background-save-status.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
function harness(){
 let cursor=0;const slots=[],exports={},jsx=(type,props)=>({type,props:props||{}});
 const react={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},useRef(initial){const i=cursor++;return slots[i]||={current:initial};},useId(){cursor++;return 'save-test-panel';},useEffect(){cursor++;}};
 vm.runInNewContext(source,{exports,module:{exports},require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='lucide-react'?new Proxy({},{get:(_,key)=>key}):name==='sonner'?{toast:{success(){},error(){}}}:name.endsWith('.css')?{}:{SaveCorrectionEditor:'SaveCorrectionEditor'}});
 return props=>{cursor=0;return exports.BackgroundSaveStatus(props);};
}
const saving={operationId:'operation-a',action:'saveIntroductionV2',label:'候補者の紹介文・確認事項',status:'saving',error:'',uncertain:false,details:[],localSaved:true,candidateName:'架空候補者A',pendingCount:1,queueItems:[{operationId:'operation-a',candidateName:'架空候補者A',label:'候補者の紹介文・確認事項',status:'syncing'}]};
const props=save=>({save,onRetry(){},onDismiss(){}});
const trigger=tree=>nodes(tree).find(node=>node.type==='button'&&node.props.className==='background-save-trigger');

test('the top save status identifies a single candidate and changes to a count for multiple saves',()=>{
 const render=harness();let tree=render(props(saving));
 assert.match(text(trigger(tree)),/架空候補者A/);assert.match(trigger(tree).props['aria-label'],/架空候補者A.*保存状況を確認/);
 tree=render(props({...saving,pendingCount:2,queueItems:[...saving.queueItems,{operationId:'operation-b',candidateName:'架空候補者B',label:'候補者の変更',status:'queued'}]}));
 assert.match(text(trigger(tree)),/2件/);assert.doesNotMatch(text(trigger(tree)),/架空候補者A/);
});

test('the popover explains each queued candidate and exposes no per-item retry control',()=>{
 const render=harness(),save={...saving,pendingCount:3,queueItems:[...saving.queueItems,{operationId:'operation-b',candidateName:'架空候補者B',label:'候補者の変更',status:'queued'},{operationId:'operation-c',label:'月別・工程別目標の保存',status:'waiting'}]};
 let tree=render(props(save));trigger(tree).props.onClick();tree=render(props(save));
 const list=nodes(tree).find(node=>node.type==='ul'&&node.props['aria-label']==='候補者ごとの保存状況');
 assert.match(text(list),/架空候補者A.*同期中/);assert.match(text(list),/架空候補者B.*順番待ち/);assert.match(text(list),/月別・工程別目標の保存.*接続待ち/);
 assert.equal(nodes(list).filter(node=>node.type==='li').length,3);assert.equal(nodes(list).some(node=>node.type==='button'),false);
});

test('a failed head remains the only retry action while later candidates visibly wait',()=>{
 let retries=0;const render=harness(),save={...saving,status:'failed',uncertain:true,error:'保存結果を確認してください',pendingCount:2,queueItems:[{...saving.queueItems[0],status:'failed'},{operationId:'operation-b',candidateName:'架空候補者B',label:'候補者の変更',status:'queued'}]},input={...props(save),onRetry(){retries++;}};
 let tree=render(input);trigger(tree).props.onClick();tree=render(input);
 assert.match(text(tree),/架空候補者A.*要確認/);assert.match(text(tree),/架空候補者B.*順番待ち/);assert.match(text(tree),/先頭の保存を下のメニューで確認/);
 const buttons=nodes(tree).filter(node=>node.type==='button'&&text(node)==='同じ内容で保存を確認');assert.equal(buttons.length,1);buttons[0].props.onClick();assert.equal(retries,1);
 assert.equal(nodes(tree).some(node=>node.type==='button'&&text(node)==='この保存を取り消す'),false);
});

test('legacy status objects without queue metadata remain usable',()=>{
 const render=harness(),legacy={operationId:'legacy-save',action:'updateRecord',label:'候補者の変更',status:'saving',error:'',uncertain:false,details:[],localSaved:true,pendingCount:2};
 let tree=render(props(legacy));assert.match(text(trigger(tree)),/2件.*端末に保存済み/);trigger(tree).props.onClick();tree=render(props(legacy));assert.equal(nodes(tree).some(node=>node.type==='ul'),false);assert.match(text(tree),/別の候補者の入力や画面の移動を続けられます/);
});
