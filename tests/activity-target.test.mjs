import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual resolver without loading the workspace's visual components.
const workspace=fs.readFileSync(new URL('../components/node-workspace.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('node-workspace.tsx',workspace,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declaration=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='activityTargetRecordId');
assert.ok(declaration,'The workspace must provide its shared proposal target resolver');
const compiled=ts.transpileModule(declaration.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const resolve=vm.runInNewContext(`${compiled}\nactivityTargetRecordId`);
const event=(recordId,extra={})=>({recordId,playerId:'ND-001',candidateId:'candidate-1',company:'同じ会社',stage:'提案',date:'2026-10-01',...extra});
const options=extra=>({stage:'提案',owner:'ND-001',candidateId:'candidate-1',company:'同じ会社',newProposal:false,activities:[],...extra});

test('repeated proposals for one company resolve the same latest row for registration and correction',()=>{
 const old=event('old-proposal'),latest=event('new-proposal',{date:'2026-10-10'}),foreign=event('foreign-proposal',{playerId:'ND-002'}),different=event('other-candidate',{candidateId:'candidate-2'});
 assert.equal(resolve(options({company:'  同じ会社  ',activities:[old,latest,foreign,different]})),'new-proposal');
 assert.equal(resolve(options({activities:[old]})),'old-proposal');
 assert.equal(resolve(options({activities:[foreign,different]})),undefined);
});

test('an explicitly opened proposal remains the target even when the same company has a newer proposal',()=>{
 const old=event('opened-proposal'),latest=event('new-proposal');
 assert.equal(resolve(options({activities:[old,latest],detail:old})),'opened-proposal');
 assert.equal(resolve(options({activities:[old,latest],detail:event('different-owner',{playerId:'ND-002'})})),'new-proposal');
 assert.equal(resolve(options({activities:[old,latest],detail:event('different-company',{company:'別の会社'})})),'new-proposal');
});

test('a new proposal never reuses an existing proposal or exposes its correction target',()=>{
 const old=event('old-proposal');assert.equal(resolve(options({newProposal:true,activities:[old],detail:old})),undefined);
 assert.equal(resolve(options({company:'新しい会社',activities:[old]})),undefined);
 assert.equal(resolve(options({candidateId:null,activities:[old]})),undefined);
});

test('later outcomes use the explicitly selected proposal and initial interviews preserve an undated existing record',()=>{
 const old=event('old-proposal'),selected=event('selected-proposal');
 for(const stage of ['C面談予約','クライアント面談','内定','内定承諾','稼働開始予定','稼働開始']){
  assert.equal(resolve(options({stage,activities:[old,selected],detail:old,targetProposal:selected})),'selected-proposal');
  assert.equal(resolve(options({stage,targetProposal:event('foreign',{playerId:'ND-002'})})),undefined);
 }
 assert.equal(resolve(options({stage:'候補者面談',existing:event('undated-person',{stage:'候補者面談',date:''})})),'undated-person');
 assert.equal(resolve(options({stage:'候補者面談',existing:event('already-interviewed',{stage:'候補者面談'})})),undefined);
});
