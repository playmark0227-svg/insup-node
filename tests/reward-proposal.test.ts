import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRewardProposal,validateRewardRules} from '../lib/reward-proposal.ts';
import type {Counts} from '../lib/sheets-client.ts';
const players=[{id:'A',name:'架空A'},{id:'B',name:'架空B'},{id:'C',name:'架空C',active:false},{id:'ADMIN',name:'管理者'}];
const counts:Counts={
 '2026-08':{A:{'提案':4},B:{'提案':1},C:{'提案':0},ADMIN:{'提案':999},UNKNOWN:{'提案':1000}},
 '2026-09':{A:{'提案':3},B:{'提案':3},C:{'提案':1}},
 '2026-10':{A:{'提案':2},B:{'提案':5},C:{'提案':99}},
 '2026-11':{A:{'提案':100}},
 all:{A:{'提案':1000}},'2026-10-01':{A:{'提案':1000}},
};
test('only closed month wins accumulate once, ties each receive the same amount, and the current month is provisional',()=>{
 const result=buildRewardProposal(players,counts,'2026-10');
 assert.equal(result.closedMonths,2);assert.equal(result.standings.find(p=>p.id==='A')!.points,200);assert.equal(result.standings.find(p=>p.id==='B')!.points,100);
 assert.deepEqual(result.current.winnerIds,['C']);assert.equal(result.standings.find(p=>p.id==='C')!.currentPoints,100);
 assert.deepEqual(result.history.find(m=>m.month==='2026-09')!.winnerIds,['A','B']);
 assert.deepEqual(buildRewardProposal(players,counts,'2026-10'),result);
 assert.equal(result.history.some(m=>m.month==='2026-11'),false);assert.equal(result.standings.some(p=>p.id==='ADMIN'),false);
});
test('month rollover moves the former provisional win into history without doubling awards',()=>{
 const result=buildRewardProposal(players,counts,'2026-11');
 assert.equal(result.standings.find(p=>p.id==='B')!.points,100);assert.equal(result.standings.find(p=>p.id==='A')!.points,200);assert.equal(result.standings.find(p=>p.id==='C')!.points,100);
 assert.equal(result.history.filter(m=>m.month==='2026-10').length,1);assert.deepEqual(result.current.winnerIds,['A']);
});
test('an empty or zero month never awards first place, and malformed counts cannot produce points',()=>{
 const empty=buildRewardProposal(players,{},'2026-10');assert.equal(empty.closedMonths,0);assert.equal(empty.current.pointsEach,0);assert.ok(empty.standings.every(p=>p.points===0&&p.rank===0));
 const result=buildRewardProposal(players,{'2026-09':{A:{'提案':-1},B:{'提案':NaN},C:{'提案':1.5}},'2026-10':{A:{'提案':0},B:{'提案':0}}},'2026-10');
 assert.ok(result.history.every(month=>month.winnerIds.length===0));assert.ok(result.standings.every(p=>p.points===0));
});
test('past winners remain in history after stopping an account, and duplicate IDs do not double-count',()=>{
 const result=buildRewardProposal([...players,players[0]],{'2026-09':{A:{'提案':1},C:{'提案':5}}},'2026-10');
 assert.equal(result.standings.length,3);assert.equal(result.standings.find(p=>p.id==='C')!.points,100);
});
test('rules can be compared as a proposal without mutating business counts or creating an award ledger',()=>{
 const original=structuredClone(counts);const result=buildRewardProposal(players,counts,'2026-10',{pointsPerWin:50,milestone:300});
 assert.equal(result.standings.find(p=>p.id==='A')!.points,100);assert.deepEqual(counts,original);
 for(const rules of [{pointsPerWin:0,milestone:500},{pointsPerWin:1.5,milestone:500},{pointsPerWin:10001,milestone:500},{pointsPerWin:100,milestone:0}])assert.throws(()=>validateRewardRules(rules));
 for(const month of ['2026-13','all','2101-01','2026-10-30'])assert.throws(()=>buildRewardProposal(players,counts,month));
});
