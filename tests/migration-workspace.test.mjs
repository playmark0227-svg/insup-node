import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import * as migration from '../lib/migration.ts';
import {blankInterviewFields} from '../lib/candidate-intake.ts';
import {isUncertainWrite,SheetApiError} from '../lib/sheets-client.ts';
const source=ts.transpileModule(fs.readFileSync(new URL('../components/migration-workspace.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
const deferred=()=>{let resolve,reject;return {promise:new Promise((yes,no)=>{resolve=yes;reject=no}),resolve:value=>resolve(value),reject:value=>reject(value)};};
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
const entry=(id='entry-one')=>({id,version:'version-one',state:'staged',recordId:'',workspace:'架空',channel:'候補者',sourceId:'message-one',sourceUrl:'',postedAt:'2026-10-15T01:00:00.000Z',author:'架空担当',body:'氏名：架空候補\n確認した職歴。',candidateName:'架空候補',updatedAt:'2026-11-06T01:00:00.000Z'});
const archive=(entries=[entry()],extra={})=>({feature:true,entries,nextCursor:null,total:entries.length,...extra});
function harness(options={}){
 let slots=[],effects=[],cursor=0,currentKey,tree,props;
 const calls={reads:[],saves:[],dirty:[],pending:[],changed:0};
 props={identityKey:'admin-one',enabled:true,canWrite:true,players:[{id:'ND-001',name:'架空担当',active:true}],onRead:cursor=>{calls.reads.push(cursor);return options.read?options.read(cursor):Promise.resolve(archive());},onSave:async(...args)=>{calls.saves.push(args);if(options.save)return options.save(...args);},onChanged:()=>calls.changed++,onDirtyChange:value=>calls.dirty.push(value),onPendingChange:value=>calls.pending.push(value)};
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const react={useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useEffect(fn,deps){const i=cursor++,before=slots[i];if(!before||!equal(before.deps,deps)){slots[i]={deps};effects.push(()=>{before?.cleanup?.();slots[i].cleanup=fn();});}}};
 const exports={},jsx=(type,props,key)=>({type,props:props||{},key});
 vm.runInNewContext(source,{exports,module:{exports},crypto:{randomUUID},Map,require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('/migration')?migration:name.includes('/candidate-intake')?{blankInterviewFields}:name.includes('/sheets-client')?{isUncertainWrite}:{} });
 const unmount=()=>{for(const slot of slots)slot?.cleanup?.();};
 const render=(next={})=>{props={...props,...next};const root=exports.MigrationWorkspace(props);if(root.key!==currentKey){unmount();slots=[];effects=[];currentKey=root.key;}cursor=0;tree=root.type(root.props);while(effects.length)effects.shift()();return tree;};
 const button=label=>nodes(render()).find(n=>n.type==='button'&&text(n)===label);
 const click=label=>{const n=button(label);assert.ok(n,label);assert.ok(!n.props.disabled,`${label} enabled`);return n.props.onClick();};
 const field=label=>{const n=nodes(render()).find(n=>n.type==='label'&&text(n).startsWith(label));assert.ok(n,label);return nodes(n).find(n=>['input','textarea','select'].includes(n.type));};
 const change=(label,value)=>{const n=field(label);assert.ok(!n.props.disabled,label);return n.props.onChange({target:{value,checked:value}});};
 render();return {render,text:()=>text(render()),button,click,field,change,calls,unmount};
}

test('staging uncertainty retains raw text and immutable operation ID and blocks a different application',async()=>{let attempts=0;const h=harness({save:async()=>{if(++attempts===1)throw new Error('応答不明');}});await flush();h.change('原文','氏名：架空入力\n営業経験を確認');h.click('保存前に内容を確認');h.click('確認した原文を管理者限定で保管');await flush();assert.equal(h.field('原文').props.value,'氏名：架空入力\n営業経験を確認');assert.equal(h.field('原文').props.disabled,true);assert.equal(h.button('原文・登録内容を確認').props.disabled,true);assert.equal(h.calls.pending.at(-1),true);h.click('同じIDで続きを保管');await flush();assert.equal(h.calls.saves[0][2],h.calls.saves[1][2]);assert.deepEqual(h.calls.saves[0][1],h.calls.saves[1][1]);assert.equal(h.field('原文').props.value,'');h.render();assert.equal(h.calls.pending.at(-1),false);h.unmount();});

test('a known staging validation error can unlock editing without losing the raw source',async()=>{const h=harness({save:async()=>{throw new SheetApiError('VALIDATION','確認してください');}});await flush();h.change('原文','氏名：架空入力\n元の原文');h.click('保存前に内容を確認');h.click('確認した原文を管理者限定で保管');await flush();h.click('保管待ちを解除して原文を修正');assert.equal(h.field('原文').props.value,'氏名：架空入力\n元の原文');assert.equal(h.field('原文').props.disabled,false);h.render();assert.equal(h.calls.pending.at(-1),false);h.unmount();});

test('application keeps reviewed searchable experience and retries identical content after an uncertain response',async()=>{let attempts=0;const h=harness({save:async()=>{if(++attempts===1)throw new Error('応答不明');}});await flush();h.click('原文・登録内容を確認');h.change('担当者','ND-001');h.change('検索に使う職歴・経験','確認した法人営業の経験');h.change('原文・担当者・登録内容を確認しました',true);h.click('確認した内容を登録');await flush();assert.equal(h.calls.saves[0][1].fields.workHistory,'確認した法人営業の経験');assert.equal(h.calls.saves[0][1].fields.age,'');assert.equal(h.calls.changed,0);assert.ok(nodes(h.render()).find(n=>n.type==='fieldset').props.disabled);h.click('同じIDで登録結果を確認');await flush();assert.equal(h.calls.saves[0][2],h.calls.saves[1][2]);assert.deepEqual(h.calls.saves[0][1],h.calls.saves[1][1]);assert.equal(h.calls.changed,1);h.render();assert.equal(h.calls.pending.at(-1),false);h.unmount();});

test('changing the reviewed owner or copied body requires another confirmation',async()=>{const h=harness();await flush();h.click('原文・登録内容を確認');h.change('担当者','ND-001');h.change('原文・担当者・登録内容を確認しました',true);assert.equal(h.button('確認した内容を登録').props.disabled,false);h.change('候補者名','確認した別名');assert.equal(h.button('確認した内容を登録').props.disabled,true);h.change('原文・担当者・登録内容を確認しました',true);h.change('検索に使う職歴・経験','追加で確認した経歴');assert.equal(h.button('確認した内容を登録').props.disabled,true);h.unmount();});

test('old read save and file completions cannot reappear after account A to B to A transitions',async()=>{const old=deferred();let reads=0;const h=harness({read:()=>++reads===1?old.promise:Promise.resolve(archive([entry('fresh')]))});h.render({identityKey:'admin-two'});await flush();h.render({identityKey:'admin-one'});await flush();old.resolve(archive([entry('secret-old')]));await flush();assert.ok(!JSON.stringify(h.render()).includes('secret-old'));assert.ok(JSON.stringify(h.render()).includes('fresh'));h.unmount();
 const file=deferred(),g=harness();await flush();const handler=g.field('SlackのJSONファイル').props.onChange;const loading=handler({target:{files:[{size:10,text:()=>file.promise}]}});g.render({identityKey:'admin-two'});await flush();file.resolve('他のアカウントの原文');await loading;assert.equal(g.field('原文').props.value,'');g.unmount();
 const saving=deferred(),j=harness({save:()=>saving.promise});await flush();j.click('原文・登録内容を確認');j.change('担当者','ND-001');j.change('原文・担当者・登録内容を確認しました',true);j.click('確認した内容を登録');j.render({identityKey:'admin-two'});await flush();saving.resolve();await flush();assert.equal(j.calls.changed,0);assert.equal(j.calls.pending.at(-1),false);j.unmount();});

test('a read started before successful staging cannot overwrite the post-save archive',async()=>{const stale=deferred();let reads=0;const h=harness({read:()=>++reads===1?stale.promise:Promise.resolve(archive([entry('saved-new')]))});h.change('原文','氏名：架空入力\n元の原文');h.click('保存前に内容を確認');h.click('確認した原文を管理者限定で保管');await flush();h.render();await flush();stale.resolve(archive([]));await flush();assert.ok(JSON.stringify(h.render()).includes('saved-new'));h.unmount();});

test('source details show thread and attachment references as explicit links without rendering HTML or fetching files',async()=>{
 const sourceEntry={...entry(),sourceThreadId:'1760000000.123456',attachmentLinks:['https://files.example.test/report.pdf'],sourceUrl:'https://fictional.slack.com/archives/C123456/p1760000001123456',body:'<script>doNotExecute()</script>元の原文'};
 const h=harness({read:()=>Promise.resolve(archive([sourceEntry]))});await flush();h.click('原文・登録内容を確認');const rendered=h.render(),links=nodes(rendered).filter(n=>n.type==='a');assert.match(text(rendered),/返信先の投稿ID：1760000000.123456/);assert.match(text(rendered),/ファイル本体は移していません/);
 assert.deepEqual(links.map(link=>link.props.href),[sourceEntry.sourceUrl,...sourceEntry.attachmentLinks]);assert.ok(links.every(link=>link.props.target==='_blank'&&link.props.rel==='noopener noreferrer'));assert.ok(nodes(rendered).every(node=>node.props.dangerouslySetInnerHTML===undefined));assert.ok(nodes(rendered).some(node=>node.type==='pre'&&text(node)===sourceEntry.body));assert.equal(h.calls.saves.length,0);h.unmount();
});
test('unsafe reference exclusions are visible before staging and unsafe URLs never enter the staged payload',async()=>{
 const h=harness();await flush();h.change('原文',JSON.stringify([{ts:'1760000001.123456',thread_ts:'1760000000.123456',files:[{permalink:'https://files.example.test/report.pdf?access_token=do-not-store'}],attachments:[{title_link:'https://docs.example.test/report'}]}]));h.click('保存前に内容を確認');assert.match(h.text(),/安全に保管できない添付リンクを1件除外/);assert.equal(h.calls.saves.length,0);h.click('確認した原文を管理者限定で保管');await flush();const staged=h.calls.saves[0][1].entries[0];assert.equal(staged.sourceThreadId,'1760000000.123456');assert.deepEqual(Array.from(staged.attachmentLinks),['https://docs.example.test/report']);assert.ok(!JSON.stringify(staged).includes('do-not-store'));h.unmount();
});
