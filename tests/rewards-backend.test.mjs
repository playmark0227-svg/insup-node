import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
// Reuse the real Apps Script provider mock, without importing/rerunning its tests.
const fixturePath=new URL('./apps-script.test.mjs',import.meta.url),codePath=fileURLToPath(new URL('../google-apps-script/Code.gs',import.meta.url));
const source=readFileSync(fixturePath,'utf8').split('\ntest(')[0].replace(/const CODE_PATH = [^\n]+;/,`const CODE_PATH = ${JSON.stringify(codePath)};`)+ '\nexport {baseHarness,seedMatchingRows,authenticate};';
const {baseHarness,seedMatchingRows,authenticate}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const fragment=readFileSync(new URL('../google-apps-script/Rewards.fragment.gs',import.meta.url),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));let sequence=0;
function fixture(){const h=baseHarness({now:'2026-11-06T01:00:00Z'});seedMatchingRows(h);vm.runInContext(fragment,h.context);const admin=authenticate(h,'ADMIN'),player=authenticate(h,'ND-001'),other=authenticate(h,'ND-002');h.writes.length=0;return {h,admin,player,other};}
function read(f,as='admin',month){return copy(f.h.context.readRewards_({token:f[as].token,payload:month?{month}:{}}));}
function mutate(f,command,as='admin',expected){const h=f.h,token=f[as].token,store=h.context.readStore_({readOnly:true}),actor=h.context.activeActor_(store,h.context.authenticate_(token)),payload={...command,expectedVersion:expected||read(f,as).version},plan=h.context.planRewards_(store,actor,payload),operationId='reward-test-operation-'+String(++sequence).padStart(8,'0');h.context.revalidateRewardsPlan_(store,actor,plan);h.context.commit_(store,actor,'mutateRewards',operationId,h.context.hash_(h.context.stableJson_(payload)),plan,token);return {plan,payload,operationId};}
const policy=(extra={})=>({enabled:true,metric:'提案',pointsPerWin:100,tiePolicy:'all',effectiveMonth:'2026-10',...extra});
function start(f){mutate(f,{command:'policy',policy:policy()});}
function settle(f,month='2026-10'){const p=read(f,'admin',month).preview;return mutate(f,{command:'settle',month,fingerprint:p.fingerprint,reason:'架空の月次確認'});}
function catalog(f,points=60){mutate(f,{command:'catalog',item:{name:'架空特典',points,active:true}});return read(f).catalog[0];}

test('rewards read is scoped and never creates any app-owned tables',()=>{const f=fixture(),before=f.h.spreadsheet.getSheets().length;const data=read(f,'player');assert.equal(data.policy.enabled,false);assert.equal(data.balances.length,1);assert.equal(data.balances[0].playerId,'ND-001');assert.equal(data.balances[0].balance,0);assert.equal(f.h.spreadsheet.getSheets().length,before);assert.equal(f.h.writes.length,0);assert.throws(()=>read(f,'player','2026-10'),/管理者/);});
test('only administrator can set policy catalog award adjustments and view another member ledger',()=>{const f=fixture();for(const command of [{command:'policy',policy:policy()},{command:'catalog',item:{name:'特典',points:20,active:true}},{command:'adjust',playerId:'ND-002',delta:100,reason:'禁止'}])assert.throws(()=>mutate(f,command,'player'),/管理者/);start(f);mutate(f,{command:'adjust',playerId:'ND-002',delta:50,reason:'架空調整'});assert.equal(read(f,'player').ledger.length,0);assert.equal(read(f,'other').ledger.length,1);});
test('closed-month settlement uses real counts and cannot duplicate a settled award',()=>{const f=fixture();start(f);const preview=read(f,'admin','2026-10').preview;assert.equal(preview.topCount,2);assert.deepEqual(preview.awards.map(p=>p.playerId),['ND-001']);settle(f);assert.equal(read(f,'player').balances[0].available,100);const size=read(f).ledger.length;assert.throws(()=>settle(f),/変更はありません/);assert.equal(read(f).ledger.length,size);assert.throws(()=>read(f,'admin','2026-11'),/終了した月/);});
test('tied winners receive equal points in one atomic new-table batch and zero-activity months give no award',()=>{const f=fixture();f.h.spreadsheet.getSheetById(286330650).getRange(4,8).setValue(''); // one recorded proposal each
 start(f);settle(f);const values=read(f).balances.map(p=>p.balance);assert.deepEqual(values,[100,100]);assert.equal(read(f).ledger.length,2);
 const no=fixture();start(no);mutate(no,{command:'policy',policy:policy({effectiveMonth:'2026-09'})});settle(no,'2026-09');assert.equal(read(no).ledger.length,0);assert.equal(read(no).months.length,1);
});
test('a same-point source correction cannot silently change the original closed-month rule',()=>{const f=fixture();start(f);settle(f);mutate(f,{command:'policy',policy:policy({pointsPerWin:700})});const preview=read(f,'admin','2026-10').preview;assert.equal(preview.policy.pointsPerWin,100);assert.equal(preview.changes.length,0);});
test('month source changes after preview or planning fail before any points batch',()=>{const f=fixture();start(f);const p=read(f,'admin','2026-10').preview;f.h.spreadsheet.getSheetById(286330650).getRange(2,8).setValue('');assert.throws(()=>mutate(f,{command:'settle',month:'2026-10',fingerprint:p.fingerprint,reason:'架空確認'}),/実績がプレビュー後/);
 const g=fixture();start(g);const store=g.h.context.readStore_({readOnly:true}),actor=g.h.context.activeActor_(store,g.h.context.authenticate_(g.admin.token)),data=read(g,'admin','2026-10'),payload={command:'settle',month:'2026-10',fingerprint:data.preview.fingerprint,reason:'架空確認',expectedVersion:data.version},plan=g.h.context.planRewards_(store,actor,payload);g.h.spreadsheet.getSheetById(286330650).getRange(2,8).setValue('');assert.throws(()=>g.h.context.revalidateRewardsPlan_(store,actor,plan),/保存前に月の実績/);assert.equal(read(g).ledger.length,0);
});
test('pending redemption reserves points and approval consumes once while rejection/cancel release reservations',()=>{const f=fixture();start(f);settle(f);const item=catalog(f);mutate(f,{command:'request',rewardId:item.id},'player');assert.equal(read(f,'player').balances[0].available,40);assert.equal(read(f,'player').balances[0].reserved,60);assert.equal(read(f,'other').requests.length,0);assert.throws(()=>mutate(f,{command:'request',rewardId:item.id},'player'),/承認待ち|不足/);let req=read(f,'player').requests[0];assert.throws(()=>mutate(f,{command:'review',requestId:req.requestId,decision:'approve',note:'禁止'},'player'),/管理者/);mutate(f,{command:'review',requestId:req.requestId,decision:'approve',note:'社内受け渡しを確認'});assert.equal(read(f,'player').balances[0].balance,40);assert.equal(read(f,'player').balances[0].reserved,0);assert.throws(()=>mutate(f,{command:'review',requestId:req.requestId,decision:'approve',note:'二重承認'}),/処理済み/);
 mutate(f,{command:'adjust',playerId:'ND-001',delta:100,reason:'架空追加'});mutate(f,{command:'request',rewardId:item.id},'player');req=read(f,'player').requests.find(r=>r.status==='pending');assert.throws(()=>mutate(f,{command:'review',requestId:req.requestId,decision:'cancel',note:''},'other'),/本人/);mutate(f,{command:'review',requestId:req.requestId,decision:'reject',note:'在庫の都合'});assert.equal(read(f,'player').balances[0].available,140);mutate(f,{command:'request',rewardId:item.id},'player');req=read(f,'player').requests.find(r=>r.status==='pending');mutate(f,{command:'review',requestId:req.requestId,decision:'cancel',note:''},'player');assert.equal(read(f,'player').balances[0].available,140);
});
test('stale state negative available missing reason and paused policy never commit new redemptions',()=>{const f=fixture();start(f);settle(f);const item=catalog(f),old=read(f).version;mutate(f,{command:'request',rewardId:item.id},'player');assert.throws(()=>mutate(f,{command:'adjust',playerId:'ND-001',delta:-50,reason:'訂正'}),/残高/);assert.throws(()=>mutate(f,{command:'adjust',playerId:'ND-001',delta:1,reason:''}),/入力/);assert.throws(()=>mutate(f,{command:'adjust',playerId:'ND-001',delta:1,reason:'訂正'},'admin',old),/更新/);mutate(f,{command:'policy',policy:policy({enabled:false})});assert.throws(()=>mutate(f,{command:'request',rewardId:item.id},'player'),/開始済み/);assert.equal(read(f,'player').balances[0].balance,100);
});
test('atomic provider failure preserves request reservation ledger and operation history',()=>{const f=fixture();start(f);settle(f);const item=catalog(f);mutate(f,{command:'request',rewardId:item.id},'player');const before=read(f),req=before.requests[0];f.h.spreadsheet.beforeWrite=()=>{throw new Error('provider failure')};assert.throws(()=>mutate(f,{command:'review',requestId:req.requestId,decision:'approve',note:'架空確認'}));f.h.spreadsheet.beforeWrite=()=>{};const after=read(f);assert.deepEqual(after.requests,before.requests);assert.deepEqual(after.balances,before.balances);assert.deepEqual(after.ledger,before.ledger);});

const route=(f,action,payload={},as='admin',operationId)=>f.h.json({version:1,action,payload,token:f[as].token,...(operationId?{operationId}:{})});
test('real rewards API routes authenticate and replay a committed policy once with unchanged payload',()=>{const f=fixture(),unauthed=f.h.json({version:1,action:'readRewards',payload:{}});assert.equal(unauthed.ok,false);assert.equal('data' in unauthed,false);const first=route(f,'readRewards');assert.equal(first.ok,true);const payload={command:'policy',policy:policy(),expectedVersion:first.data.version},id='rewards-route-policy-operation';const saved=route(f,'mutateRewards',payload,'admin',id);assert.equal(saved.ok,true,JSON.stringify(saved));assert.equal(saved.data.committed,true);const writes=f.h.writes.length,replay=route(f,'mutateRewards',payload,'admin',id);assert.equal(replay.ok,true,JSON.stringify(replay));assert.deepEqual(replay.data,saved.data);assert.equal(f.h.writes.length,writes);const stolen=route(f,'mutateRewards',payload,'player',id);assert.equal(stolen.ok,false);assert.equal(stolen.error.code,'OPERATION_CONFLICT');});
test('real redemption API idempotency reserves only once and conflicting reuse never consumes more points',()=>{const f=fixture();start(f);settle(f);const item=catalog(f),payload={command:'request',rewardId:item.id,expectedVersion:read(f,'player').version},id='rewards-route-request-operation';const first=route(f,'mutateRewards',payload,'player',id);assert.equal(first.ok,true,JSON.stringify(first));const repeat=route(f,'mutateRewards',payload,'player',id);assert.equal(repeat.ok,true,JSON.stringify(repeat));assert.equal(read(f,'player').requests.length,1);assert.equal(read(f,'player').balances[0].reserved,60);const changed=route(f,'mutateRewards',{...payload,rewardId:'another-reward-0000000000'},'player',id);assert.equal(changed.ok,false);assert.equal(changed.error.code,'OPERATION_CONFLICT');});
test('disabled members and read-only or original-destination settings cannot mutate reward tables',()=>{const f=fixture();const payload={command:'policy',policy:policy(),expectedVersion:read(f).version};f.h.properties.NODE_CONFIG=JSON.stringify({...JSON.parse(f.h.properties.NODE_CONFIG),writesEnabled:false});let value=route(f,'mutateRewards',payload,'admin','rewards-route-readonly-operation');assert.equal(value.ok,false);assert.equal(value.error.code,'WRITES_DISABLED');assert.equal(f.h.spreadsheet.getSheetByName('_NODE_reward_settings'),null);f.h.properties.NODE_CONFIG=JSON.stringify({...JSON.parse(f.h.properties.NODE_CONFIG),writesEnabled:true});f.h.properties.NODE_DESTINATION_ID=f.h.context.NODE.originalId;value=route(f,'mutateRewards',payload,'admin','rewards-route-original-operation');assert.equal(value.ok,false);assert.equal(value.error.code,'WRITES_DISABLED');f.h.spreadsheet.getSheetByName('_NODE_players').getRange(3,9).setValue(false);value=route(f,'readRewards',{},'player');assert.equal(value.ok,false);assert.equal('data' in value,false);});
test('reward routes reject a forged destination and stale snapshot version before writing',()=>{const f=fixture();let version=read(f).version;const bad=route(f,'mutateRewards',{command:'policy',policy:policy(),expectedVersion:version,spreadsheetId:f.h.context.NODE.originalId},'admin','rewards-route-forged-operation');assert.equal(bad.ok,false);assert.equal(bad.error.code,'VALIDATION');start(f);const stale=route(f,'mutateRewards',{command:'catalog',item:{name:'不正特典',points:10,active:true},expectedVersion:version},'admin','rewards-route-stale-operation');assert.equal(stale.ok,false);assert.equal(stale.error.code,'CONFLICT');assert.equal(read(f).catalog.length,0);});
test('corrupted redemption or monthly ledger totals fail closed on read rather than exposing a false balance',()=>{const f=fixture();start(f);settle(f);const sheet=f.h.spreadsheet.getSheetByName('_NODE_reward_ledger');sheet.getRange(2,3).setValue(200);assert.throws(()=>read(f),/合計が一致/);
 const g=fixture();start(g);settle(g);const item=catalog(g);mutate(g,{command:'request',rewardId:item.id},'player');const req=read(g).requests[0];mutate(g,{command:'review',requestId:req.requestId,decision:'approve',note:'確認'});g.h.spreadsheet.getSheetByName('_NODE_reward_requests').getRange(2,6).setValue('rejected');assert.throws(()=>read(g),/消費台帳が一致/);
});

test('winner corrections reverse prior awards atomically and refuse a negative spendable balance',()=>{const f=fixture();start(f);settle(f);const item=catalog(f);mutate(f,{command:'request',rewardId:item.id},'player');const sheet=f.h.spreadsheet.getSheetById(286330650);sheet.getRange(2,4).setValue('担当二');sheet.getRange(4,4).setValue('担当二');const preview=read(f,'admin','2026-10').preview;assert.deepEqual(preview.changes,[{playerId:'ND-001',delta:-100},{playerId:'ND-002',delta:100}]);const before=read(f);assert.throws(()=>settle(f),/マイナス/);assert.deepEqual(read(f).ledger,before.ledger);const req=read(f,'player').requests[0];mutate(f,{command:'review',requestId:req.requestId,decision:'cancel',note:''},'player');settle(f);assert.equal(read(f,'player').balances[0].balance,0);assert.equal(read(f,'other').balances[0].balance,100);assert.equal(read(f).ledger.length,3);});
test('hold-tie policy records a closed month without silently choosing a winner',()=>{const f=fixture();f.h.spreadsheet.getSheetById(286330650).getRange(4,8).setValue('');mutate(f,{command:'policy',policy:policy({tiePolicy:'hold'})});const preview=read(f,'admin','2026-10').preview;assert.equal(preview.topCount,1);assert.equal(preview.awards.length,0);settle(f);assert.equal(read(f).ledger.length,0);assert.equal(read(f).months[0].policy.tiePolicy,'hold');});
test('catalog edits do not alter the promised point cost of an already reserved request',()=>{const f=fixture();start(f);settle(f);const item=catalog(f);mutate(f,{command:'request',rewardId:item.id},'player');const req=read(f).requests[0];mutate(f,{command:'catalog',item:{id:item.id,name:'後の特典',points:500,active:false}});assert.equal(read(f,'player').catalog.length,0);mutate(f,{command:'review',requestId:req.requestId,decision:'approve',note:'申請時の内容で受け渡しを確認'});assert.equal(read(f,'player').balances[0].balance,40);assert.equal(read(f,'player').requests[0].rewardName,'架空特典');assert.equal(read(f,'player').requests[0].points,60);});

test('a scheduled future policy cannot accept redemptions before its effective month',()=>{const f=fixture();start(f);mutate(f,{command:'adjust',playerId:'ND-001',delta:100,reason:'架空の調整'});const item=catalog(f);mutate(f,{command:'policy',policy:policy({effectiveMonth:'2026-12'})});assert.throws(()=>mutate(f,{command:'request',rewardId:item.id},'player'),/開始済み/);assert.equal(read(f,'player').requests.length,0);});

test('a second pending request for the same reward is refused even when enough points remain',()=>{const f=fixture();start(f);mutate(f,{command:'adjust',playerId:'ND-001',delta:1000,reason:'架空の調整'});const item=catalog(f);mutate(f,{command:'request',rewardId:item.id},'player');assert.throws(()=>mutate(f,{command:'request',rewardId:item.id},'player'),/承認待ち/);assert.equal(read(f,'player').requests.length,1);assert.equal(read(f,'player').balances[0].reserved,60);});

for (const errorCode of ['SCHEMA_MISMATCH', 'FORBIDDEN', 'PASSWORD_CHANGE_REQUIRED', null]) {
 test(`committed rewards keep an uncertain receipt after ${errorCode || 'provider'} failure and replay only once`, () => {
  const f=fixture(),operations=f.h.spreadsheet.getSheetByName('_NODE_operations');
  const before=operations.getLastRow(),payload={command:'adjust',playerId:'ND-001',delta:100,reason:'架空の受領通知確認',expectedVersion:read(f).version};
  const operationId=`rewards-receipt-failure-${errorCode || 'provider'}`;
  const original=f.h.context.readAccountStore_;
  f.h.context.readAccountStore_=function(...args){
   if(operations.getLastRow()>before){
    if(errorCode)f.h.context.fail_(errorCode,'Injected post-commit account read failure');
    throw new Error('Injected post-commit provider failure');
   }
   return original(...args);
  };
  const response=route(f,'mutateRewards',payload,'admin',operationId);
  assert.equal(response.ok,false,JSON.stringify(response));
  assert.equal(response.error.code,'INTERNAL',JSON.stringify(response));
  assert.equal('data' in response,false);
  f.h.context.readAccountStore_=original;
  assert.equal(operations.getLastRow(),before+1);
  assert.equal(read(f).ledger.length,1);
  assert.equal(read(f,'player').balances[0].balance,100);
  const writes=f.h.writes.length,replay=route(f,'mutateRewards',payload,'admin',operationId);
  assert.equal(replay.ok,true,JSON.stringify(replay));
  assert.equal(replay.data.committed,true);
  assert.equal(replay.data.operationId,operationId);
  assert.equal(f.h.writes.length,writes);
  assert.equal(operations.getLastRow(),before+1);
  assert.equal(read(f).ledger.length,1);
  assert.equal(read(f,'player').balances[0].balance,100);
 });
}

test('a session revoked after a rewards commit still requires login before the same receipt can replay',()=>{
 const f=fixture(),operations=f.h.spreadsheet.getSheetByName('_NODE_operations'),before=operations.getLastRow();
 const payload={command:'adjust',playerId:'ND-001',delta:100,reason:'架空の認証失効確認',expectedVersion:read(f).version},operationId='rewards-receipt-revoked-session';
 const original=f.h.context.readAccountStore_;
 f.h.context.readAccountStore_=function(...args){
  if(operations.getLastRow()>before)delete f.h.properties[f.h.context.sessionKey_(f.admin.token)];
  return original(...args);
 };
 const response=route(f,'mutateRewards',payload,'admin',operationId);
 assert.equal(response.ok,false,JSON.stringify(response));
 assert.equal(response.error.code,'UNAUTHENTICATED');
 assert.equal('data' in response,false);
 f.h.context.readAccountStore_=original;
 assert.equal(operations.getLastRow(),before+1);
 const unauthenticated=route(f,'mutateRewards',payload,'admin',operationId);
 assert.equal(unauthenticated.ok,false);
 assert.equal(unauthenticated.error.code,'UNAUTHENTICATED');
 f.admin=authenticate(f.h,'ADMIN');
 const writes=f.h.writes.length,replay=route(f,'mutateRewards',payload,'admin',operationId);
 assert.equal(replay.ok,true,JSON.stringify(replay));
 assert.equal(replay.data.committed,true);
 assert.equal(f.h.writes.length,writes);
 assert.equal(operations.getLastRow(),before+1);
 assert.equal(read(f).ledger.length,1);
 assert.equal(read(f,'player').balances[0].balance,100);
});
