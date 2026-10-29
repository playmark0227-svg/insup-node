import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as purpose from '../lib/workspace-purpose.ts';
import * as insights from '../lib/workspace-insights.ts';
const source=ts.transpileModule(fs.readFileSync(new URL('../components/workspace-guide.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exports={};const jsx=(type,props)=>({type,props:props||{}});
vm.runInNewContext(source,{exports,module:{exports},require:name=>name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='lucide-react'?new Proxy({},{get:(_,key)=>key}):name.includes('workspace-purpose')?purpose:name.includes('workspace-insights')?insights:name.endsWith('.css')?{}:name.includes('/ui/dialog')?Object.fromEntries(['Dialog','DialogContent','DialogHeader','DialogTitle','DialogDescription'].map(key=>[key,key])):(()=>{throw new Error(name)})()});
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
const nodes=tree=>tree&&typeof tree==='object'?Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)]:[];
function record(id,owner,{ended=false}={}){const values=Array(26).fill('');values[1]=id+'社';values[2]=id+'候補者';values[3]=owner;values[6]=ended?'辞退（本人希望）':'面談確定(面談実施待ち）';values[9]='2026-10-30';if(ended)values[16]='2026-10-28';return {recordId:id,rowVersion:'v-'+id,row:2,playerId:owner,candidateName:values[2],source:'',values,formulaColumns:[]};}
function snapshot(records){return {self:{role:'player',playerId:'ND-001'},players:[{id:'ND-001',name:'合成担当1'},{id:'ND-002',name:'合成担当2'}],activities:[],counts:{},records,interviewReviews:[],syncedAt:'2026-10-30T00:00:00Z',warnings:[],writesEnabled:true};}
const base={today:'2026-10-30',admin:false,canWrite:true,onCreateCandidate(){},onOpenRecord(){},onViewTasks(){},onOpenRecords(){}};
test('player menus and every contextual help link keep admin settings out of reach',()=>{
 const allowed=purpose.allowedWorkspaceViews(false);
 assert.equal(new Set(allowed).size,allowed.length);
 for(const page of allowed){const info=purpose.workspacePurpose(page,false);assert.ok(info.goal&&info.steps.length);assert.ok(info.links.every(link=>allowed.includes(link.view)));}
 for(const adminPage of ['players','workbook','connection'])assert.ok(!allowed.includes(adminPage));
 const menu=exports.WorkspaceMobileMenu({open:true,onClose(){},view:'records',admin:false,onNavigate(){},onHelp(){}});
 assert.ok(!text(menu).includes('プレイヤー管理'));assert.ok(!text(menu).includes('業務管理表'));assert.ok(text(menu).includes('面談の振り返り'));assert.ok(text(menu).includes('マイプロフィール'));
});
test('today inbox rechecks ownership and opens the exact proposal rather than a candidate name match',()=>{
 const calls=[];const tree=exports.HomeActionInbox({...base,snapshot:snapshot([record('自分','ND-001'),record('他人の秘密','ND-002')]),onOpenRecord:(...args)=>calls.push(args)});
 assert.ok(text(tree).includes('自分候補者'));assert.ok(!text(tree).includes('他人の秘密'));
 const button=nodes(tree).find(node=>node.type==='button'&&text(node).includes('提案を確認'));assert.ok(button);button.props.onClick();assert.deepEqual(calls,[['自分','interview_today']]);
});
test('a missing review uses its own record and review task kind for the receiving page',()=>{
 const calls=[];const tree=exports.HomeActionInbox({...base,snapshot:snapshot([record('振り返り対象','ND-001',{ended:true})]),onOpenRecord:(...args)=>calls.push(args)});
 const button=nodes(tree).find(node=>node.type==='button'&&text(node).includes('理由を記録'));assert.ok(button);button.props.onClick();assert.deepEqual(calls,[['振り返り対象','missing_review']]);
 assert.ok(text(tree).includes('不成立の判定ではありません'));
});
test('an empty read-only inbox can browse but cannot start registration',()=>{
 const tree=exports.HomeActionInbox({...base,canWrite:false,snapshot:snapshot([])});
 const register=nodes(tree).filter(node=>node.type==='button'&&text(node).includes('候補者を登録'));assert.ok(register.length);assert.ok(register.every(node=>node.props.disabled));
 const browse=nodes(tree).find(node=>node.type==='button'&&text(node).includes('すべて確認'));assert.ok(browse&&!browse.props.disabled);
});
test('contextual help closes before it navigates and distinguishes local from shared saving',()=>{
 const calls=[];const tree=exports.WorkspaceGuide({open:true,view:'records',admin:false,onClose:()=>calls.push('close'),onNavigate:view=>calls.push(view)});
 const button=nodes(tree).find(node=>node.type==='button'&&text(node)==='不成立の理由を振り返る');assert.ok(button);button.props.onClick();assert.deepEqual(calls,['close','reviews']);
 assert.ok(text(tree).includes('端末に保存済み・同期中'));assert.ok(text(tree).includes('シートへの反映は続いています'));
});

test('mobile logout closes its menu then uses the same draft and pending-save guarded callback',()=>{
 const calls=[];const tree=exports.WorkspaceMobileMenu({open:true,onClose:()=>calls.push('close'),view:'home',admin:false,onNavigate(){},onHelp(){},onSignOut:()=>calls.push('logout')});
 const button=nodes(tree).find(node=>node.type==='button'&&text(node).includes('ログアウト'));assert.ok(button);button.props.onClick();assert.deepEqual(calls,['close','logout']);
 const disabled=exports.WorkspaceMobileMenu({open:true,onClose(){},view:'home',admin:false,onNavigate(){},onHelp(){},onSignOut(){},signOutDisabled:true});assert.equal(nodes(disabled).find(node=>node.type==='button'&&text(node).includes('ログアウト')).props.disabled,true);
});


test('home inbox routes an unscheduled proposal to its exact record and labels date checks clearly',()=>{
 const item=record('未調整の提案','ND-001');item.values[7]='2026-10-29';item.values[9]='';item.values[6]='提案完了（面談日確定待ち）';
 const calls=[];const tree=exports.HomeActionInbox({...base,snapshot:snapshot([item]),onOpenRecord:(...args)=>calls.push(args)});
 assert.match(text(tree),/日程・結果などの確認/);assert.match(text(tree),/C面談の予定日は未登録/);
 const button=nodes(tree).find(node=>node.type==='button'&&text(node).includes('提案を確認'));assert.ok(button);button.props.onClick();assert.deepEqual(calls,[['未調整の提案','schedule_missing']]);
});
