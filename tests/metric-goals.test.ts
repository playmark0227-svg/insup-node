import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMetricGoalsData, daysInGoalMonth, emptyMetricCounts, emptyMetricTargets, goalAttainment, goalDailyProgress, goalTokyoDay, resolveMetricGoal, validGoalDailyBasis, validGoalTarget, validMetricGoalMonth, type MetricGoal } from '../lib/metric-goals.ts';
const goal: MetricGoal = { playerId:'ND-001',month:'2026-11',targets:{...emptyMetricTargets(),提案:70,内定:5,内定承諾:3},dailyBasis:'calendar',customBusinessDays:null,version:'test-goal-version',updatedAt:'2026-11-06T01:00:00Z' };
test('month target validation distinguishes numeric zero, null and malformed targets',()=>{
 for(const month of ['1900-01','2000-02','2100-12'])assert.equal(validMetricGoalMonth(month),true);
 for(const month of ['1899-12','2101-01','2026-00','2026-13','2026-1','2026-11-01'])assert.equal(validMetricGoalMonth(month),false);
 for(const target of [null,0,9999])assert.equal(validGoalTarget(target),true);
 for(const target of [undefined,'0',-1,0.1,10000,Infinity,NaN])assert.equal(validGoalTarget(target),false);
 assert.equal(daysInGoalMonth('2000-02'),29);assert.equal(daysInGoalMonth('1900-02'),28);assert.equal(daysInGoalMonth('2100-02'),28);
 assert.equal(goalAttainment(8,null),null);assert.equal(goalAttainment(8,0),null);assert.equal(goalAttainment(8,5),160);
});
test('proposal fallback uses only explicitly saved same-month goal and legacy edits remain authoritative',()=>{
 const proposal={playerId:'ND-001',month:'2026-11',target:12,version:'legacy-version',updatedAt:goal.updatedAt};
 const selected=resolveMetricGoal({goals:[goal],legacyProposalGoals:[proposal]},'ND-001','2026-11');assert.equal(selected.targets.提案,12);assert.equal(selected.targets.内定,5);assert.equal(selected.targets.内定承諾,3);assert.equal(selected.expectedProposalVersion,'legacy-version');
 const missing=resolveMetricGoal({goals:[goal],legacyProposalGoals:[proposal]},'ND-001','2026-12');assert.deepEqual(missing.targets,emptyMetricTargets());assert.equal(missing.expectedVersion,'');
 const zero=resolveMetricGoal({goals:[],legacyProposalGoals:[{...proposal,target:0}]},'ND-001','2026-11');assert.equal(zero.targets.提案,0);assert.equal(zero.targets.候補者面談,null);
 assert.equal(resolveMetricGoal({goals:[goal],legacyProposalGoals:[]},'ND-001','2026-11').targets.提案,null);
});
test('daily guidance handles month end, past, future, JST rollover and unset/zero goals',()=>{
 assert.equal(goalTokyoDay(new Date('2026-10-31T15:00:00Z')),'2026-11-01');
 const start=goalDailyProgress('2026-11',30,'calendar',null,'2026-11-01');assert.equal(start.denominator,30);assert.equal(start.elapsedDays,1);assert.equal(start.perDay,1);assert.equal(start.expectedToDate,1);
 const end=goalDailyProgress('2026-11',30,'calendar',null,'2026-11-30');assert.equal(end.expectedToDate,30);assert.equal(end.period,'current');
 const past=goalDailyProgress('2026-10',31,'calendar',null,'2026-11-01',40);assert.equal(past.expectedToDate,31);assert.equal(past.remainingTarget,0);assert.equal(past.period,'past');
 const future=goalDailyProgress('2026-12',31,'calendar',null,'2026-11-30');assert.equal(future.expectedToDate,0);assert.equal(future.elapsedDays,0);assert.equal(future.period,'future');
 assert.equal(goalDailyProgress('2026-11',null,'calendar',null,'2026-11-06').expectedToDate,null);
 assert.equal(goalDailyProgress('2026-11',0,'calendar',null,'2026-11-06').perDay,0);
 assert.throws(()=>goalDailyProgress('2026-02',20,'calendar',null,'2026-02-30'));
});
test('weekday divisor deliberately includes holidays and custom days disclose uniform monthly distribution',()=>{
 const weekdays=goalDailyProgress('2026-11',21,'weekdays',null,'2026-11-03');assert.equal(weekdays.denominator,21);assert.equal(weekdays.elapsedDays,2);assert.equal(weekdays.expectedToDate,2); // Nov 3 holiday is included by explicit rule.
 const custom=goalDailyProgress('2026-11',40,'custom',20,'2026-11-15');assert.equal(custom.denominator,20);assert.equal(custom.elapsedDays,10);assert.equal(custom.perDay,2);assert.equal(custom.expectedToDate,20);assert.equal(custom.approximate,true);
 assert.equal(validGoalDailyBasis('custom',31,'2026-11'),false);assert.equal(validGoalDailyBasis('calendar',20,'2026-11'),false);assert.equal(validGoalDailyBasis('weekdays',null,'2026-11'),true);
});
test('API data validation binds month, users and exact seven metrics while rejecting duplicate goals',()=>{
 const data={feature:true,month:'2026-11',today:'2026-11-06',checkedAt:'2026-11-06T01:00:00Z',players:[{id:'ND-001',name:'合成担当',active:true}],goals:[goal],legacyProposalGoals:[],counts:{'ND-001':emptyMetricCounts()},dailyCounts:{'2026-11-06':{'ND-001':emptyMetricCounts()}}};
 assert.doesNotThrow(()=>assertMetricGoalsData(data,'2026-11'));
 for(const change of [{month:'2026-10'},{today:'2026-11-31'},{goals:[goal,goal]},{counts:{'ND-002':emptyMetricCounts()}},{dailyCounts:{'2026-12-01':{'ND-001':emptyMetricCounts()}}},{counts:{'ND-001':{...emptyMetricCounts(),内定:-1}}}])assert.throws(()=>assertMetricGoalsData({...data,...change},'2026-11'));
});
