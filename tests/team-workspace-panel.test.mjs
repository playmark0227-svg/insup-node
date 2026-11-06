import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import * as team from '../lib/team-workspace.ts';
import * as intake from '../lib/candidate-intake.ts';
import * as introV2 from '../lib/introduction-v2.ts';
import {SheetApiError,isUncertainWrite} from '../lib/sheets-client.ts';
const source=ts.transpileModule(fs.readFileSync(new URL('../components/team-workspace.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const clone=value=>JSON.parse(JSON.stringify(value));
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
const ids={pub:'publication_00000001',other:'publication_00000002',rec:'record_000000000001',recOther:'record_000000000002',profile:'profile_00000000001',profileOther:'profile_00000000002',version:'version_00000000001',comment:'comment_00000000001',commentOther:'comment_00000000002',job:'job_000000000000001'};
const stamp='2026-11-05T01:00:00.000Z';
const publication=(extra={})=>({publicationId:ids.pub,ownerId:'ND-001',candidateName:'架空共有あおい',introduction:'保存した紹介文のみ。法人営業の経験を本人に確認。',published:true,version:ids.version,createdAt:stamp,updatedAt:stamp,publishedAt:stamp,canManage:true,sourceRecordId:ids.rec,sourceProfileId:ids.profile,sourceRowVersion:'row-version',sourceProfileVersion:ids.version,...extra});
const comment=(extra={})=>({commentId:ids.comment,publicationId:ids.pub,parentId:'',authorId:'ND-002',body:'架空会社への提案条件を確認してください。',mentionIds:['ND-001'],deleted:false,version:ids.version,createdAt:stamp,updatedAt:stamp,canManage:true,...extra});
const job=(extra={})=>({jobId:ids.job,company:'架空会社',title:'架空の法人向け業務',description:'営業の仕事内容',requirements:'登録された必須条件',workConditions:'平日・在宅・時給を確認',status:'open',version:ids.version,createdBy:'ADMIN',updatedBy:'ADMIN',createdAt:stamp,updatedAt:stamp,...extra});
function sourceRecord(id=ids.rec,owner='ND-001',profileId=ids.profile){return {recordId:id,rowVersion:'row-version',row:2,playerId:owner,candidateName:owner==='ND-001'?'架空共有あおい':'架空共有かえで',source:'外へ出さない紹介元',values:Array(26).fill('社内管理値は非表示'),formulaColumns:[],profileId};}
function sourceProfile(record){return {profileId:record.profileId,playerId:record.playerId,recordIds:[record.recordId],version:ids.version,updatedAt:stamp,fields:{...intake.blankInterviewFields(),workHistory:'本文以外の職歴は非表示',interviewMemo:'社内だけの面談メモ',attendanceConcerns:'社内だけの個人事情'},introduction:'保存した紹介文のみ。法人営業の経験を本人に確認。'};}
function fixture(){return {feature:true,candidates:[publication(),publication({publicationId:ids.other,ownerId:'ND-002',candidateName:'架空共有かえで',canManage:false,sourceRecordId:undefined,sourceProfileId:undefined,sourceRowVersion:undefined,sourceProfileVersion:undefined})],jobs:[job()],comments:[comment(),comment({commentId:ids.commentOther,publicationId:ids.other,body:'別候補者のコメント',mentionIds:[],canManage:false})],players:[{id:'ND-001',name:'架空担当あおい',role:'player'},{id:'ND-002',name:'架空担当かえで',role:'player'},{id:'ADMIN',name:'架空管理者',role:'admin'}]};}
function harness(overrides={}){
 let cursor=0,timerId=0,readCount=0;const slots=[],effects=[],timers=new Map(),calls=[],dirty=[],pending=[],proposed=[],clipboard=[];let server=fixture();
 const record=sourceRecord(),otherRecord=sourceRecord(ids.recOther,'ND-002',ids.profileOther);
 const props={identityKey:'login-a',admin:false,selfId:'ND-001',active:true,canWrite:true,enabled:true,records:[record,otherRecord],profiles:[sourceProfile(record),sourceProfile(otherRecord)],onRead:async()=>{readCount++;return clone(server);},onSave:async(action,payload,id)=>{calls.push({action,payload:clone(payload),id});},onDirtyChange:value=>dirty.push(value),onPendingChange:value=>pending.push(value),onPropose:value=>proposed.push(clone(value)),...overrides};
 const react={useState(initial){const i=cursor++,slot=slots[i]||={value:typeof initial==='function'?initial():initial};return [slot.value,value=>{slot.value=typeof value==='function'?value(slot.value):value;}];},useRef(initial){return slots[cursor++]||={current:initial};},useEffect(fn,deps){const i=cursor++,previous=slots[i];if(!previous||deps.some((value,index)=>!Object.is(value,previous.deps[index]))){slots[i]={deps};effects.push(()=>{previous?.cleanup?.();slots[i].cleanup=fn();});}}};
 const jsx=(type,props,key)=>({type,props:props||{},key}),exports={};
 vm.runInNewContext(source,{exports,module:{exports},crypto:{randomUUID},structuredClone,Date,Set,Map,Error,navigator:{clipboard:{writeText:async value=>{clipboard.push(value);}}},setInterval(fn){const id=++timerId;timers.set(id,fn);return id;},clearInterval(id){timers.delete(id);},require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('introduction-v2')?introV2:name.includes('candidate-intake')?intake:name.includes('sheets-client')?{isUncertainWrite}:name.includes('team-workspace')&&!name.endsWith('.css')?team:name.endsWith('.css')?{}:new Proxy({},{get:(_,key)=>key})});
 const render=next=>{Object.assign(props,next);cursor=0;const tree=exports.TeamWorkspaceSession(props);while(effects.length)effects.shift()();return tree;};
 const find=(type,label)=>nodes(render()).find(node=>node.type===type&&(node.props['aria-label']===label||text(node)===label));
 const click=label=>{const button=find('button',label);assert.ok(button,label);assert.ok(!button.props.disabled,`${label} enabled`);return button.props.onClick?.();};
 const change=(type,label,value)=>{const input=find(type,label);assert.ok(input,label);assert.ok(!input.props.disabled,`${label} enabled`);input.props.onChange({target:{value,checked:!!value}});};
 const openCandidate=name=>{const button=nodes(render()).find(node=>node.type==='button'&&text(node).startsWith(name));assert.ok(button,name);button.props.onClick();};
 const submit=className=>{const form=nodes(render()).find(node=>node.type==='form'&&node.props.className===className);assert.ok(form,className);form.props.onSubmit({preventDefault(){}});};
 return {props,calls,dirty,pending,proposed,clipboard,render,find,click,change,openCandidate,submit,nodes:()=>nodes(render()),text:()=>text(render()),readCount:()=>readCount,setServer:value=>server=clone(value),poll:()=>{for(const fn of [...timers.values()])fn();},unmount:()=>{for(const slot of slots)slot?.cleanup?.();},settle:async()=>{for(let i=0;i<20;i++){await Promise.resolve();render();}}};
}

test('unconnected sharing has no reads, no mutations and an honest setup message',async()=>{
 const h=harness({enabled:false});h.render();await h.settle();assert.equal(h.readCount(),0);assert.equal(h.calls.length,0);assert.match(h.text(),/連携コードの更新が必要/);assert.equal(h.find('button','紹介文を社内共有'),undefined);
});

test('publication requires exact owned profile selection and an explicit whole-team confirmation',async()=>{
 const h=harness();h.render();await h.settle();assert.equal(h.calls.length,0);h.click('紹介文を社内共有');
 const selector=h.find('select','社内共有する候補者');assert.match(text(selector),/架空共有あおい/);assert.doesNotMatch(text(selector),/架空共有かえで/);
 h.change('select','社内共有する候補者',ids.rec);assert.match(h.text(),/有効な社内メンバー全員/);assert.match(h.text(),/保存した紹介文のみ/);assert.doesNotMatch(h.text(),/社内だけの面談メモ|社内だけの個人事情|本文以外の職歴|社内管理値は非表示|外へ出さない紹介元/);assert.equal(h.find('button','確認した内容で共有を更新').props.disabled,true);
 h.nodes().find(node=>node.type==='input'&&node.props.type==='checkbox'&&node.props.checked===false).props.onChange({target:{checked:true}});h.click('確認した内容で共有を更新');await h.settle();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'publishTeamCandidate');assert.deepEqual(h.calls[0].payload,{recordId:ids.rec,rowVersion:'row-version',profileVersion:ids.version,publicationId:ids.pub,version:ids.version,confirmPublication:true});assert.equal(h.pending.at(-1),false);assert.match(h.text(),/保存しました/);
 const admin=harness({admin:true,selfId:'ADMIN'});admin.render();await admin.settle();admin.click('紹介文を社内共有');assert.match(text(admin.find('select','社内共有する候補者')),/架空共有かえで/);
});

test('a changed source disables publication until the latest saved introduction is previewed and confirmed again',async()=>{
 const h=harness();h.render();await h.settle();h.click('紹介文を社内共有');h.change('select','社内共有する候補者',ids.rec);
 const profiles=clone(h.props.profiles);profiles[0].introduction='新しく保存された紹介文';profiles[0].version='version_00000000002';h.render({profiles});assert.match(h.text(),/元の紹介文が更新/);assert.equal(h.find('button','確認した内容で共有を更新').props.disabled,true);
 h.click('最新の紹介文で確認し直す');assert.match(h.text(),/新しく保存された紹介文/);assert.equal(h.find('button','確認した内容で共有を更新').props.disabled,true);assert.equal(h.calls.length,0);
 const broken=clone(profiles);broken[0].playerId='ND-002';h.render({profiles:broken});assert.doesNotMatch(text(h.find('select','社内共有する候補者')),/架空共有あおい/);assert.equal(h.find('button','確認した内容で共有を更新').props.disabled,true);
});

test('candidate threads isolate comments, preserve reply drafts and post only explicit mentions',async()=>{
 const h=harness();h.render();await h.settle();h.openCandidate('架空共有あおい');assert.match(h.text(),/架空会社への提案条件/);assert.doesNotMatch(h.text(),/別候補者のコメント/);h.click('返信');h.change('textarea','社内コメントの本文','確認して返信します。');h.change('input','架空担当かえでにメンション',true);
 h.click('閉じる');h.openCandidate('架空共有かえで');assert.equal(h.find('textarea','社内コメントの本文').props.value,'');assert.match(h.text(),/別候補者のコメント/);h.click('閉じる');h.openCandidate('架空共有あおい');assert.equal(h.find('textarea','社内コメントの本文').props.value,'確認して返信します。');assert.match(h.text(),/架空担当かえでへの返信/);h.submit('team-comment-form');await h.settle();
 assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0].payload,{publicationId:ids.pub,body:'確認して返信します。',parentId:ids.comment,mentionIds:['ND-002']});assert.equal(h.find('textarea','社内コメントの本文').props.value,'');
});

test('uncertain comment saves keep the same payload and operation while navigation can hide the panel',async()=>{
 let attempt=0;const h=harness({onSave:async(action,payload,id)=>{h.calls.push({action,payload:clone(payload),id});if(attempt++===0)throw new SheetApiError('NETWORK','保存結果が届きませんでした。');}});h.render();await h.settle();h.openCandidate('架空共有あおい');h.change('textarea','社内コメントの本文','重複させないコメント');h.submit('team-comment-form');await h.settle();assert.equal(h.pending.at(-1),true);assert.equal(h.find('button','コメントを投稿').props.disabled,true);
 h.render({active:false});assert.equal(h.nodes().some(node=>node.type==='Dialog'),false);h.render({active:true});h.click('同じ内容で再試行');await h.settle();assert.equal(h.calls.length,2);assert.deepEqual(h.calls[0],h.calls[1]);assert.equal(h.pending.at(-1),false);
});

test('read refresh keeps last data on failure and automatic reads pause for drafts or inactive screens',async()=>{
 let reads=0;const h=harness({onRead:async()=>{reads++;if(reads===3)throw new Error('読み取り失敗');return fixture();}});h.render();await h.settle();assert.equal(reads,1);h.poll();await h.settle();assert.equal(reads,2);h.click('最新の共有を取得');await h.settle();assert.equal(reads,3);assert.match(h.text(),/読み取り失敗/);assert.match(h.text(),/架空共有あおい/);
 h.openCandidate('架空共有あおい');h.change('textarea','社内コメントの本文','保存前の内容');h.render();h.poll();await h.settle();assert.equal(reads,3);assert.equal(h.dirty.at(-1),true);h.render({active:false});h.poll();await h.settle();assert.equal(reads,3);
});

test('only administrators edit jobs and a draft survives closing its panel before explicit save',async()=>{
 const player=harness();player.render();await player.settle();player.click('案件');assert.equal(player.find('button','案件を登録'),undefined);const jobButton=player.nodes().find(node=>node.type==='button'&&text(node).includes('架空の法人向け業務'));jobButton.props.onClick();assert.equal(player.find('button','案件を編集'),undefined);player.click('この案件への提案を登録');assert.equal(player.proposed[0].jobId,ids.job);assert.equal(player.calls.length,0);
 const admin=harness({admin:true,selfId:'ADMIN'});admin.render();await admin.settle();admin.click('案件');admin.click('案件を登録');admin.change('input','案件の会社名','確認した架空会社');admin.change('input','案件名','確認した募集');admin.change('textarea','案件の仕事内容','担当する業務');admin.change('textarea','案件の必須条件','確認した条件');admin.change('textarea','案件の稼働条件','平日10時〜17時');admin.change('select','案件の募集状態を編集','paused');admin.click('閉じる・下書きを保持');assert.match(admin.text(),/案件の未保存の下書き/);admin.click('案件の下書きへ戻る');assert.equal(admin.find('input','案件名').props.value,'確認した募集');admin.submit('team-job-form');await admin.settle();assert.deepEqual(admin.calls[0].payload,{company:'確認した架空会社',title:'確認した募集',description:'担当する業務',requirements:'確認した条件',workConditions:'平日10時〜17時',status:'paused'});assert.equal(admin.pending.at(-1),false);
});

test('comment deletion and publication withdrawal need explicit confirmation and preserve versions',async()=>{
 const h=harness();h.render();await h.settle();h.openCandidate('架空共有あおい');h.click('削除');assert.equal(h.calls.length,0);h.click('このコメントを削除');await h.settle();assert.deepEqual(h.calls[0].payload,{publicationId:ids.pub,commentId:ids.comment,version:ids.version,deleted:true});
 h.click('共有を取り下げる');assert.equal(h.calls.length,1);const confirm=h.nodes().filter(node=>node.type==='button'&&text(node)==='共有を取り下げる').at(-1);confirm.props.onClick();await h.settle();assert.deepEqual(h.calls[1].payload,{publicationId:ids.pub,version:ids.version});
});

test('late results from an unmounted login cannot restore candidate data or report a saved draft',async()=>{
 let resolve;const h=harness({onRead:()=>new Promise(done=>{resolve=done;})});h.render();h.unmount();resolve(fixture());await h.settle();assert.doesNotMatch(h.text(),/架空共有あおい|架空共有かえで/);assert.equal(h.calls.length,0);
});


test('withdrawn or inaccessible publications keep a recoverable own-comment draft without restoring shared source text',async()=>{
 const initial=fixture();initial.candidates[0].introduction='共有が終了する紹介文の固有文字列';initial.candidates[0].candidateName='共有が終了する候補者';
 const h=harness({onRead:async()=>clone(initial)});h.render();await h.settle();h.openCandidate('共有が終了する候補者');h.change('textarea','社内コメントの本文','自分が書いた保持するコメント');h.click('閉じる');
 initial.candidates=initial.candidates.filter(candidate=>candidate.publicationId!==ids.pub);initial.comments=initial.comments.filter(comment=>comment.publicationId!==ids.pub);h.click('最新の共有を取得');await h.settle();
 assert.match(h.text(),/共有が終了した候補者への下書き/);assert.match(h.text(),/自分が書いた保持するコメント/);assert.doesNotMatch(h.text(),/共有が終了する紹介文の固有文字列|共有が終了する候補者|社内だけの面談メモ/);assert.equal(h.dirty.at(-1),true);
 h.click('このコメント下書きをコピー');await h.settle();assert.deepEqual(h.clipboard,['自分が書いた保持するコメント']);h.click('この下書きを破棄');assert.equal(h.dirty.at(-1),true);h.click('保持する');assert.match(h.text(),/自分が書いた保持するコメント/);h.click('この下書きを破棄');h.click('破棄を確定');await h.settle();assert.doesNotMatch(h.text(),/共有が終了した候補者への下書き|自分が書いた保持するコメント/);assert.equal(h.dirty.at(-1),false);assert.equal(h.calls.length,0);
});

test('a stopped mention recipient remains removable without losing the body or other selected recipients',async()=>{
 const server=fixture(),h=harness({onRead:async()=>clone(server),onSave:async(action,payload,id)=>{h.calls.push({action,payload:clone(payload),id});if(payload.mentionIds.some(id=>!server.players.some(player=>player.id===id)))throw new SheetApiError('VALIDATION','停止中のメンバーは宛先にできません。');}});
 h.render();await h.settle();h.openCandidate('架空共有あおい');h.change('textarea','社内コメントの本文','本文を消さずに宛先を修正する');h.change('input','架空担当かえでにメンション',true);h.change('input','架空管理者にメンション',true);h.click('閉じる');server.players=server.players.filter(player=>player.id!=='ND-002');h.click('最新の共有を取得');await h.settle();h.openCandidate('架空共有あおい');
 assert.equal(h.find('input','架空担当かえでにメンション'),undefined);assert.match(h.text(),/現在選べないメンション先/);assert.equal(h.find('button','コメントを投稿').props.disabled,true);assert.equal(h.find('textarea','社内コメントの本文').props.value,'本文を消さずに宛先を修正する');assert.equal(h.calls.length,0);
 h.click('架空担当かえでのメンションを解除');assert.equal(h.find('input','架空管理者にメンション').props.checked,true);assert.equal(h.find('textarea','社内コメントの本文').props.value,'本文を消さずに宛先を修正する');h.submit('team-comment-form');await h.settle();assert.deepEqual(h.calls[0].payload.mentionIds,['ADMIN']);assert.equal(h.calls[0].payload.body,'本文を消さずに宛先を修正する');
});

test('a poll started before a committed comment cannot replace the post-save display and always queues a fresh read',async()=>{
 const server=fixture();let holdNext=false,resolveRead,reads=0;
 const h=harness({onRead:async()=>{reads++;const snapshot=clone(server);if(holdNext){holdNext=false;return new Promise(resolve=>{resolveRead=()=>resolve(snapshot);});}return snapshot;},onSave:async(action,payload,id)=>{h.calls.push({action,payload:clone(payload),id});server.comments.push(comment({commentId:'comment_00000000003',authorId:'ND-001',body:payload.body,mentionIds:[]}));}});
 h.render();await h.settle();h.openCandidate('架空共有あおい');holdNext=true;h.poll();await Promise.resolve();h.change('textarea','社内コメントの本文','保存直後のコメントを表示する');h.submit('team-comment-form');await h.settle();assert.match(h.text(),/保存しました/);assert.equal(h.find('textarea','社内コメントの本文').props.value,'');assert.equal(reads,2);
 resolveRead();await h.settle();assert.equal(reads,3,'the committed write forces one fresh read after the old poll ends');assert.match(h.text(),/保存直後のコメントを表示する/);assert.equal(h.calls.length,1);assert.equal(h.pending.at(-1),false);
});

test('a changed publication version or withdrawal requires a new preview and whole-team confirmation',async()=>{
 const server=fixture(),h=harness({onRead:async()=>clone(server)});h.render();await h.settle();h.click('紹介文を社内共有');h.change('select','社内共有する候補者',ids.rec);h.nodes().find(node=>node.type==='input'&&node.props.type==='checkbox'&&!node.props.checked).props.onChange({target:{checked:true}});h.click('閉じる・下書きを保持');
 server.candidates[0].version='version_00000000002';server.candidates[0].published=false;server.comments=server.comments.filter(comment=>comment.publicationId!==ids.pub);h.click('最新の共有を取得');await h.settle();h.click('紹介文を社内共有');assert.match(h.text(),/社内の共有状態が更新/);assert.equal(h.find('button','確認した内容で共有を更新').props.disabled,true);assert.equal(h.calls.length,0);
 h.click('最新の共有状態で確認し直す');assert.equal(h.find('button','確認した内容で共有を更新').props.disabled,true,'the old confirmation is not carried into a new publication state');h.nodes().find(node=>node.type==='input'&&node.props.type==='checkbox'&&!node.props.checked).props.onChange({target:{checked:true}});h.click('確認した内容で共有を更新');await h.settle();assert.equal(h.calls.length,1);assert.equal(h.calls[0].payload.version,'version_00000000002');assert.equal(h.calls[0].payload.publicationId,ids.pub);assert.equal(h.calls[0].payload.confirmPublication,true);
});

test('a concurrent job edit recovers by explicit field comparison while retaining unrelated changes from the latest job',async()=>{
 const server=fixture(),h=harness({admin:true,selfId:'ADMIN',onRead:async()=>clone(server),onSave:async(action,payload,id)=>{h.calls.push({action,payload:clone(payload),id});if(payload.version!==server.jobs[0].version)throw new SheetApiError('CONFLICT','案件が更新されています。再取得してから保存してください。');server.jobs[0]={...server.jobs[0],...payload,version:'version_00000000003'};}});
 h.render();await h.settle();h.click('案件');h.nodes().find(node=>node.type==='button'&&text(node).includes('架空の法人向け業務')).props.onClick();h.click('案件を編集');h.change('textarea','案件の仕事内容','自分が追記した仕事内容');h.change('textarea','案件の必須条件','自分が追記した条件');
 server.jobs[0]={...server.jobs[0],version:'version_00000000002',description:'ほかの管理者が更新した仕事内容',company:'最新版の会社名',workConditions:'最新版の稼働条件',status:'paused'};h.submit('team-job-form');await h.settle();assert.equal(h.calls.length,1);assert.match(h.text(),/ほかの操作で更新/);assert.equal(h.find('button','案件を保存').props.disabled,true);assert.equal(h.find('textarea','案件の仕事内容').props.value,'自分が追記した仕事内容');
 h.click('最新版と下書きを比較する');assert.match(h.text(),/ほかの管理者が更新した仕事内容/);assert.match(h.text(),/自分が追記した仕事内容/);assert.equal(h.find('button','選んだ内容を下書きへ反映').props.disabled,true);h.change('input','仕事内容：自分の入力を使う',true);h.click('選んだ内容を下書きへ反映');assert.equal(h.calls.length,1,'comparison never saves automatically');
 assert.equal(h.find('input','案件の会社名').props.value,'最新版の会社名');assert.equal(h.find('textarea','案件の仕事内容').props.value,'自分が追記した仕事内容');assert.equal(h.find('textarea','案件の必須条件').props.value,'自分が追記した条件');assert.equal(h.find('textarea','案件の稼働条件').props.value,'最新版の稼働条件');assert.equal(h.find('select','案件の募集状態を編集').props.value,'paused');h.submit('team-job-form');await h.settle();assert.equal(h.calls.length,2);assert.equal(h.calls[1].payload.version,'version_00000000002');assert.equal(h.calls[1].payload.company,'最新版の会社名');assert.equal(h.calls[1].payload.description,'自分が追記した仕事内容');assert.equal(h.calls[1].payload.requirements,'自分が追記した条件');assert.equal(h.calls[1].payload.workConditions,'最新版の稼働条件');assert.equal(h.calls[1].payload.status,'paused');
});


test('saved V2 sources take precedence, preview recomputes with shared settings and publication sends only bound versions',async()=>{
 const p=introV2.blankIntroductionV2Profile('架空共有あおい');p.source='架空紹介元';p.internalMemo='共有には出さない非公開メモ';p.careers=[{...introV2.blankIntroductionCareer('career-fixture-one'),company:'架空会社',product:'架空サービス',duties:['営業の架電を担当。'],achievements:['2026年に10件（本人申告）'],tips:['架電前に情報を確認した。']}];
 const entry={draftKey:ids.profile,playerId:'ND-001',recordIds:[ids.rec],profile:p,version:'v'.repeat(43),updatedAt:stamp},settings=introV2.blankIntroductionV2Settings();let reads=0;
 const h=harness({introductionV2Enabled:true,introductions:[entry],onReadIntroductionV2:async({recordId})=>{reads++;return {feature:true,recordId,draftKey:ids.profile,playerId:'ND-001',profile:p,version:entry.version,updatedAt:stamp,settings};}});h.render();await h.settle();h.click('紹介文を社内共有');assert.match(text(h.find('select','社内共有する候補者')),/紹介文V2/);h.change('select','社内共有する候補者',ids.rec);await h.settle();assert.equal(reads,1);assert.match(h.text(),/架空サービス/);assert.doesNotMatch(text(h.nodes().find(node=>node.props.className==='team-publication-preview')),/保存した紹介文のみ/);assert.doesNotMatch(h.text(),/共有には出さない非公開メモ|社内だけの個人事情/);assert.equal(h.find('button','確認した内容で共有を更新').props.disabled,true);
 h.nodes().find(node=>node.type==='input'&&node.props.type==='checkbox'&&!node.props.checked).props.onChange({target:{checked:true}});h.click('確認した内容で共有を更新');await h.settle();assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'publishIntroductionV2');assert.deepEqual(h.calls[0].payload,{recordId:ids.rec,rowVersion:'row-version',introductionVersion:entry.version,settingsVersion:'',publicationId:ids.pub,version:ids.version,confirmPublication:true});assert.equal('profile'in h.calls[0].payload,false);assert.equal('introduction'in h.calls[0].payload,false);
});
test('V2 shared settings changes require a newly fetched preview and a fresh human confirmation',async()=>{const p=introV2.blankIntroductionV2Profile('架空共有あおい'),entry={draftKey:ids.profile,playerId:'ND-001',recordIds:[ids.rec],profile:p,version:'v'.repeat(43),updatedAt:stamp};let version='s'.repeat(43);const h=harness({introductionV2Enabled:true,introductions:[entry],onReadIntroductionV2:async({recordId})=>({feature:true,recordId,draftKey:ids.profile,playerId:'ND-001',profile:p,version:entry.version,updatedAt:stamp,settings:{...introV2.blankIntroductionV2Settings(),version}}),onSave:async()=>{throw new SheetApiError('CONFLICT','共有設定が変わりました');}});h.render();await h.settle();h.click('紹介文を社内共有');h.change('select','社内共有する候補者',ids.rec);await h.settle();h.nodes().find(node=>node.type==='input'&&node.props.type==='checkbox').props.onChange({target:{checked:true}});h.click('確認した内容で共有を更新');await h.settle();assert.equal(h.find('button','確認した内容で共有を更新').props.disabled,true);version='t'.repeat(43);h.click('最新の紹介文で確認し直す');await h.settle();assert.equal(h.find('button','確認した内容で共有を更新').props.disabled,true);assert.equal(h.nodes().find(node=>node.type==='input'&&node.props.type==='checkbox').props.checked,false);});
