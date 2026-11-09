import test from "node:test";
import assert from "node:assert/strict";
import {blankWorkJob,type WorkJob} from "../lib/sales-workflow.ts";
import {blankIntroductionRate,type IntroductionClientSettings} from "../lib/introduction-v2.ts";
import {introductionJobContext,normalizeIntroductionCompanyName,resolveIntroductionJobClient} from "../lib/introduction-job-context.ts";

const job:WorkJob={...blankWorkJob(),jobId:"job_00000000000000001",company:"ＡＢＣ 株式会社",title:"法人営業",rateMin:0,rateMax:5000,rateUnit:"hour",tax:"excluded",version:"version_0000000000001",createdBy:"ADMIN",updatedBy:"ADMIN",createdAt:"2026-11-09T00:00:00.000Z",updatedAt:"2026-11-09T00:00:00.000Z"};
const client=(id:string,name:string):IntroductionClientSettings=>({id,name,mentions:["担当者様"],rate:{...blankIntroductionRate(),amount:"9000",unit:"hour",tax:"exclusive"}});

test("job handoff carries stable candidate/job keys and the explicit budget without inventing a rate",()=>{
 const context=introductionJobContext("record_00000000000001",job,"request_00000000000001");
 assert.deepEqual(context,{requestId:"request_00000000000001",recordId:"record_00000000000001",jobId:job.jobId,company:job.company,jobTitle:job.title,jobBudget:{min:0,max:5000,unit:"hour",tax:"excluded"}});
 assert.equal("desiredRate" in context,false);assert.equal("presentedRate" in context,false);
 const unknown=introductionJobContext(context.recordId,{...job,rateMin:null,rateMax:null,rateUnit:"unknown",tax:"unknown"},"new-request");
 assert.deepEqual(unknown.jobBudget,{min:null,max:null,unit:"unknown",tax:"unknown"});
});

test("company setting handoff requires one normalized exact name and retains its approved rate",()=>{
 const settings=[client("target","abc株式会社"),client("other","別会社")],result=resolveIntroductionJobClient(job,settings);
 assert.equal(result.status,"matched");if(result.status!=="matched")return;
 assert.equal(result.client,settings[0]);assert.equal(result.client.rate?.amount,"9000");assert.equal(job.rateMin,0);
 assert.equal(normalizeIntroductionCompanyName(" ＡＢＣ　株式会社 "),"abc株式会社");
 assert.deepEqual(resolveIntroductionJobClient(job,[...settings,client("duplicate","ABC 株式会社")]),{status:"ambiguous"});
 assert.deepEqual(resolveIntroductionJobClient(job,[client("similar","ABC")]),{status:"missing"});
 assert.deepEqual(resolveIntroductionJobClient({company:""},[client("empty","")]),{status:"missing"});
 assert.deepEqual(resolveIntroductionJobClient({company:"株式会社ABC"},settings),{status:"missing"});
});
