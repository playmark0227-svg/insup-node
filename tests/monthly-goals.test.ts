import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMonthlyGoalSaveResult, goalBusinessMonth, monthlyGoalAttainment, monthlyGoalHistory, resolveMonthlyGoal, validGoalMonth, validMonthlyGoal, validMonthlyGoalTarget, type MonthlyGoal } from '../lib/monthly-goals.ts';
const player = { id: 'ND-001', name: '合成担当', target: 20 };
const goal = (month: string, target: number, extra: Partial<MonthlyGoal> = {}): MonthlyGoal => ({ playerId: 'ND-001', month, target, version: `version-${month}`, updatedAt: '2026-10-30T01:00:00Z', ...extra });
test('monthly goals distinguish historical unset, provisional standard, confirmed zero and saved historical values', () => {
 assert.deepEqual(resolveMonthlyGoal([], player, '2026-09', '2026-10'), { target: null, status: 'unset', version: '', goal: null });
 for (const month of ['2026-10', '2026-11']) assert.equal(resolveMonthlyGoal([], player, month, '2026-10').status, 'standard');
 const zero=resolveMonthlyGoal([goal('2026-09',0)],player,'2026-09','2026-10');assert.equal(zero.target,0);assert.equal(zero.status,'confirmed');assert.equal(monthlyGoalAttainment(10,zero),null);
 const historical=resolveMonthlyGoal([goal('2026-09',10)],{...player,target:999},'2026-09','2026-10');assert.equal(historical.target,10);assert.equal(monthlyGoalAttainment(15,historical),150);
 assert.equal(monthlyGoalAttainment(15,resolveMonthlyGoal([],player,'2026-10','2026-10')),null);
});
test('monthly goal validation rejects invalid dates and targets while preserving explicit numeric zero',()=>{
 for(const month of ['2026-00','2026-13','2026-10-01','1899-12','2101-01'])assert.equal(validGoalMonth(month),false);
 for(const value of ['',null,'0',-1,1.5,10000,NaN,Infinity])assert.equal(validMonthlyGoalTarget(value),false);
 assert.equal(validMonthlyGoalTarget(0),true);assert.equal(validMonthlyGoalTarget(9999),true);
 assert.equal(validMonthlyGoal({...goal('2026-10',20),version:''}),false);assert.equal(validMonthlyGoal({...goal('2026-10',20),updatedAt:'invalid'}),false);
 assert.equal(goalBusinessMonth(new Date('2026-10-31T15:00:00Z')),'2026-11');
});
test('goal history scopes owners, deduplicates versions and rejects malformed entries',()=>{
 const latest=goal('2026-09',12,{version:'new',updatedAt:'2026-10-30T02:00:00Z'});
 const result=monthlyGoalHistory([goal('2026-09',10),latest,goal('2026-10',30),goal('2026-10',99,{playerId:'ND-002'}),goal('2026-13',20),goal('2026-11',-1)],['ND-001']);
 assert.deepEqual(result.map(goal=>[goal.month,goal.target]),[['2026-10',30],['2026-09',12]]);
 assert.equal(resolveMonthlyGoal(result,player,'2026-09','2026-10').version,'new');
});
test('save receipts bind the exact operation, owner, month, value and a changed version',()=>{
 const payload={playerId:'ND-001',month:'2026-10',target:0,expectedVersion:'old'},result={...goal('2026-10',0,{version:'new'}),operationId:'operation'};
 assert.doesNotThrow(()=>assertMonthlyGoalSaveResult(result,payload,'operation'));
 for(const change of [{operationId:'other'},{playerId:'ND-002'},{month:'2026-09'},{target:1},{version:'old'}])assert.throws(()=>assertMonthlyGoalSaveResult({...result,...change},payload,'operation'));
});
