import test from "node:test";
import assert from "node:assert/strict";
import {blankWorkJob,blankWorkJobListFilters,compareCandidateToJob,filterWorkJobs,parseSalesWorkflow,rediscoveryJobs,profileForSalesRecord,salesCandidatePlans,workJobFilterErrors,workJobHasUnknownFilterCondition,type WorkJob,type ProposalPlan} from "../lib/sales-workflow.ts";
import {blankInterviewFields,type CandidateProfile} from "../lib/candidate-intake.ts";
const stamp="2026-11-06T00:00:00.000Z",version="version_000000000000001";
const job=(extra:Partial<WorkJob>={}):WorkJob=>({...blankWorkJob(),jobId:"job_00000000000000001",company:"架空商事",title:"架空の法人営業",version,createdBy:"ADMIN",updatedBy:"ADMIN",createdAt:stamp,updatedAt:stamp,...extra});
const plan=(extra:Partial<ProposalPlan>={}):ProposalPlan=>({planId:"plan_0000000000000001",ownerId:"ND-001",recordId:"record_00000000000001",profileId:"profile_0000000000001",company:"架空商事",jobId:"",status:"planned",reason:"",comment:"架空の検討",sentDate:"",sentRecordId:"",version,createdAt:stamp,updatedAt:stamp,...extra});
const payload=()=>({feature:true,schemaVersion:1,period:"2026-11",jobs:[job()],plans:[plan()],reports:[],companyCounts:[{company:"架空商事",planned:1,sent:0}],checkedAt:stamp});
test("sales parser preserves the supplied job request fields while discarding unknown response fields",()=>{const input=payload();Object.assign(input.jobs[0],{target:"法人",contractPeriod:"3ヶ月",requiredSalesType:"b2b",preferredIndustries:"人材",clientReviewConditions:"取引先へ手動確認が必要な原文",unexpectedSecret:"外へ渡さない"});const result=parseSalesWorkflow(input);assert.equal(result.jobs[0].contractPeriod,"3ヶ月");assert.equal(result.jobs[0].requiredSalesType,"b2b");assert.equal(result.jobs[0].preferredIndustries,"人材");assert.equal("unexpectedSecret" in result.jobs[0],false);assert.equal("unexpectedSecret" in result,false);});
test("sales parser rejects missing feature/schema, duplicate IDs and invalid quantities",()=>{assert.throws(()=>parseSalesWorkflow({...payload(),feature:false}));assert.throws(()=>parseSalesWorkflow({...payload(),schemaVersion:2}));assert.throws(()=>parseSalesWorkflow({...payload(),jobs:[job(),job()]}));assert.throws(()=>parseSalesWorkflow({...payload(),jobs:[job({minMonthlyHours:Infinity})]}));assert.throws(()=>parseSalesWorkflow({...payload(),companyCounts:[{company:"架空",planned:1.5,sent:0}]}));});
test("objective comparison uses recorded workload and marks missing or ambiguous conditions for review",()=>{const fields={...blankInterviewFields(),monthlyHours:"100時間",daysPerWeek:"2日",timeWindow:"平日の日中",pcEnvironment:"MacBook"};const result=compareCandidateToJob(fields,job({minMonthlyHours:80,minWeeklyDays:3,timeWindow:"9:00〜18:00",pcTools:"Windows"}));assert.equal(result.find(c=>c.field==="monthlyHours")?.state,"meets");assert.equal(result.find(c=>c.field==="weeklyDays")?.state,"below");assert.equal(result.find(c=>c.field==="timeWindow")?.state,"review");assert.equal(result.find(c=>c.field==="pcTools")?.state,"review");assert.equal(compareCandidateToJob({...fields,monthlyHours:"80〜120時間"},job({minMonthlyHours:80}))[0].state,"review");});
test("client review conditions, age and gender never influence automated comparison",()=>{const fields=blankInterviewFields(),j=job({minMonthlyHours:80,clientReviewConditions:"クライアントからの年齢・性別に関する要確認原文"});const a=compareCandidateToJob({...fields,monthlyHours:"100",age:"20",gender:"男性"},j),b=compareCandidateToJob({...fields,monthlyHours:"100",age:"60",gender:"女性"},j);assert.deepEqual(a,b);assert.equal(JSON.stringify(a).includes("年齢"),false);assert.equal(JSON.stringify(a).includes("性別"),false);});
test("candidate binding never merges same names, unrelated records or another owner's profile",()=>{const profile:CandidateProfile={profileId:"profile_0000000000001",playerId:"ND-001",recordIds:["record_00000000000001"],version,updatedAt:stamp,fields:blankInterviewFields(),introduction:""};const record={recordId:"record_00000000000001",playerId:"ND-001",profileId:profile.profileId};assert.equal(profileForSalesRecord([profile],record),profile);assert.equal(profileForSalesRecord([profile],{...record,playerId:"ND-002"}),undefined);assert.equal(profileForSalesRecord([profile],{...record,recordId:"different_record_000001"}),undefined);assert.equal(profileForSalesRecord([profile],{...record,profileId:undefined}),undefined);assert.deepEqual(salesCandidatePlans([plan(),plan({planId:"plan_000000000000002",profileId:"other_profile_0000001"})],record).map(p=>p.planId),["plan_0000000000000001"]);});

test("rediscovery checks only changed open work conditions and retains unknown facts for human review",()=>{const fields={...blankInterviewFields(),monthlyHours:"80"},old="2026-11-01T00:00:00.000Z",jobs=[job({jobId:"job_00000000000000001",minMonthlyHours:60,updatedAt:stamp}),job({jobId:"job_00000000000000002",minMonthlyHours:100,updatedAt:stamp}),job({jobId:"job_00000000000000003",minMonthlyHours:60,updatedAt:old}),job({jobId:"job_00000000000000004",minMonthlyHours:60,status:"closed",updatedAt:stamp})];assert.deepEqual(rediscoveryJobs(fields,jobs,old).map(v=>v.job.jobId),[jobs[0].jobId]);const unknown=rediscoveryJobs(undefined,jobs,old);assert.equal(unknown.length,2);assert.ok(unknown.every(v=>v.needsConfirmation));assert.deepEqual(rediscoveryJobs({...fields,age:"20",gender:"男性"},jobs,old),rediscoveryJobs({...fields,age:"60",gender:"女性"},jobs,old));});

test("legacy empty-profile plans remain bound to their exact record when a profile is first created",()=>{const source={recordId:"record_00000000000001",playerId:"ND-001",profileId:"profile_0000000000001"},otherCompany={...source,recordId:"record_00000000000002"},legacy=plan({profileId:""});assert.equal(salesCandidatePlans([legacy],source).length,1);assert.equal(salesCandidatePlans([legacy],otherCompany).length,0);assert.equal(salesCandidatePlans([legacy],otherCompany,[source,otherCompany]).length,1);assert.equal(salesCandidatePlans([legacy],{...otherCompany,profileId:"different_profile_0001"},[source]).length,0);});

test("sales aggregate period is explicit and restricted to a month or all",()=>{assert.equal(parseSalesWorkflow({...payload(),period:"all"}).period,"all");assert.throws(()=>parseSalesWorkflow({...payload(),period:"2026-13"}));assert.throws(()=>parseSalesWorkflow({...payload(),period:undefined}));});

test("job hour filters distinguish less than and at most, preserve zero, and require an explicit unknown choice",()=>{
 const jobs=[job({jobId:"zero",minMonthlyHours:0}),job({jobId:"below",minMonthlyHours:99.5}),job({jobId:"exact",minMonthlyHours:100}),job({jobId:"above",minMonthlyHours:100.5}),job({jobId:"unknown",minMonthlyHours:null})],filters={...blankWorkJobListFilters(),monthlyHoursMax:100};
 assert.deepEqual(filterWorkJobs(jobs,filters).map(j=>j.jobId),["zero","below"]);
 assert.deepEqual(filterWorkJobs(jobs,{...filters,monthlyHoursOperator:"lte"}).map(j=>j.jobId),["zero","below","exact"]);
 assert.deepEqual(filterWorkJobs(jobs,{...filters,includeUnknown:true}).map(j=>j.jobId),["zero","below","unknown"]);
 assert.deepEqual(filterWorkJobs(jobs,{...filters,monthlyHoursMax:0}).map(j=>j.jobId),[]);
 assert.deepEqual(filterWorkJobs(jobs,{...filters,monthlyHoursMax:0,monthlyHoursOperator:"lte"}).map(j=>j.jobId),["zero"]);
 assert.equal(filterWorkJobs(jobs,blankWorkJobListFilters()).length,5);
});

test("job filters combine weekly availability, mode, weekends, status and normalized multi-word search",()=>{
 const matching=job({jobId:"matching",company:"ＡＢＣ 株式会社",title:"SaaS 法人営業",minMonthlyHours:80,minWeeklyDays:2.5,workMode:"remote",weekendPolicy:"allowed"});
 const jobs=[matching,job({...matching,jobId:"days",minWeeklyDays:3}),job({...matching,jobId:"mode",workMode:"remote_after_training"}),job({...matching,jobId:"weekend",weekendPolicy:"negotiable"}),job({...matching,jobId:"closed",status:"closed"}),job({...matching,jobId:"query",title:"別の商材"})];
 const filters={...blankWorkJobListFilters(),query:"  abc　ＳＡＡＳ  ",monthlyHoursMax:100,weeklyDaysMax:2.5,workMode:"remote" as const,weekendPolicy:"allowed" as const};
 assert.deepEqual(filterWorkJobs(jobs,filters).map(j=>j.jobId),["matching"]);
 assert.deepEqual(filterWorkJobs(jobs,{...filters,status:""}).map(j=>j.jobId),["matching","closed"]);
 assert.equal(workJobHasUnknownFilterCondition(matching,filters),false);
});

test("unknown filter facts are included only when selected, with exact unknown-only categories remaining exact",()=>{
 const known=job({jobId:"known",minMonthlyHours:80,minWeeklyDays:2,workMode:"remote",weekendPolicy:"allowed"}),unknown=job({jobId:"unknown"}),partial=job({...known,jobId:"partial",minWeeklyDays:null}),wrong=job({...known,jobId:"wrong",workMode:"onsite"});
 const filters={...blankWorkJobListFilters(),monthlyHoursMax:100,weeklyDaysMax:2,workMode:"remote" as const,weekendPolicy:"allowed" as const};
 assert.deepEqual(filterWorkJobs([known,unknown,partial,wrong],filters).map(j=>j.jobId),["known"]);
 assert.deepEqual(filterWorkJobs([known,unknown,partial,wrong],{...filters,includeUnknown:true}).map(j=>j.jobId),["known","unknown","partial"]);
 assert.equal(workJobHasUnknownFilterCondition(unknown,filters),true);
 assert.equal(workJobHasUnknownFilterCondition(unknown,blankWorkJobListFilters()),false);
 assert.deepEqual(filterWorkJobs([known,unknown,wrong],{...blankWorkJobListFilters(),workMode:"unknown",includeUnknown:true}).map(j=>j.jobId),["unknown"]);
});

test("invalid numeric filters fail closed instead of silently broadening the results",()=>{
 for(const monthlyHoursMax of [-1,745,Infinity,NaN]){const filters={...blankWorkJobListFilters(),monthlyHoursMax};assert.equal(workJobFilterErrors(filters).length,1);assert.deepEqual(filterWorkJobs([job()],filters),[]);}
 for(const weeklyDaysMax of [-1,8,Infinity,NaN]){const filters={...blankWorkJobListFilters(),weeklyDaysMax};assert.equal(workJobFilterErrors(filters).length,1);assert.deepEqual(filterWorkJobs([job()],filters),[]);}
 assert.equal(workJobFilterErrors({...blankWorkJobListFilters(),monthlyHoursMax:744,weeklyDaysMax:7}).length,0);
});

test("manual client review requests never become job search conditions",()=>{
 const j=job({clientReviewConditions:"要確認の秘密条件",requirements:"法人営業経験",workConditions:"9時から17時"});
 assert.equal(filterWorkJobs([j],{...blankWorkJobListFilters(),query:"秘密条件"}).length,0);
 assert.equal(filterWorkJobs([j],{...blankWorkJobListFilters(),query:"法人営業 9時"}).length,1);
});
