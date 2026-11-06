import type {CandidateProfile, InterviewFields} from "./candidate-intake.ts";

export const workJobStatuses = ["open", "paused", "closed"] as const;
export const proposalPlanStatuses = ["planned", "sent", "unplaced", "hold", "canceled"] as const;
export const matchReportStatuses = ["draft", "submitted", "returned", "confirmed"] as const;
export type WorkJob = {
  jobId:string;company:string;title:string;product:string;description:string;requirements:string;
  target:string;workMode:"unknown"|"remote"|"onsite"|"remote_after_training";contractPeriod:string;weekendPolicy:"unknown"|"allowed"|"not_allowed"|"negotiable";
  inexperiencedAllowed:"unknown"|"yes"|"no";requiredSalesType:"unknown"|"b2b"|"b2c"|"both";requiredIndustries:string;requiredOther:string;
  preferredSalesType:"unknown"|"b2b"|"b2c"|"both";preferredIndustries:string;preferredOther:string;
  /** A client request requiring human review; never a criterion for automated matching. */
  clientReviewConditions:string;
  minMonthlyHours:number|null;minWeeklyDays:number|null;timeWindow:string;pcTools:string;workConditions:string;
  rateUnit:"unknown"|"hour"|"month"|"result";rateMin:number|null;rateMax:number|null;tax:"unknown"|"included"|"excluded";
  status:typeof workJobStatuses[number];version:string;createdBy:string;updatedBy:string;createdAt:string;updatedAt:string;
};
export type ProposalPlan = {
  planId:string;ownerId:string;recordId:string;profileId:string;company:string;jobId:string;
  status:typeof proposalPlanStatuses[number];reason:string;comment:string;sentDate:string;sentRecordId:string;
  version:string;createdAt:string;updatedAt:string;
};
export type AgreedPrice={amount:number|null;unit:"unknown"|"hour"|"month"|"result";tax:"unknown"|"included"|"excluded"};
/** Financial fields and evidence references are never part of the shared candidate publication. */
export type MatchReport={
  reportId:string;ownerId:string;recordId:string;profileId:string;company:string;candidateName:string;agent:string;
  sale:AgreedPrice;wholesale:AgreedPrice;matchDate:string;comment:string;candidateEvidenceId:string;clientEvidenceId:string;
  status:typeof matchReportStatuses[number];confirmedBy:string;confirmedAt:string;version:string;createdAt:string;updatedAt:string;
};
export type CompanyProposalCount={company:string;planned:number;sent:number};
export type SalesWorkflowData={feature:true;schemaVersion:1;period:string;jobs:WorkJob[];plans:ProposalPlan[];reports:MatchReport[];companyCounts:CompanyProposalCount[];checkedAt:string};
export type SaveWorkJobInput=Omit<WorkJob,"jobId"|"version"|"createdBy"|"updatedBy"|"createdAt"|"updatedAt">&{jobId?:string;version?:string};
export type SaveProposalPlanInput=Pick<ProposalPlan,"recordId"|"profileId"|"company"|"jobId"|"reason"|"comment">&{planId?:string;version?:string;rowVersion:string;status:Exclude<ProposalPlan["status"],"sent">};
export type RecordProposalSentInput={planId:string;version:string;rowVersion:string;date:string};
export type SaveMatchReportInput=Pick<MatchReport,"recordId"|"profileId"|"agent"|"sale"|"wholesale"|"matchDate"|"comment"|"candidateEvidenceId"|"clientEvidenceId"|"status">&{reportId?:string;version?:string;rowVersion:string;confirmAgreement:boolean;recordMatch:boolean};
export type SalesWorkflowReadInput={period?:string};
export type SalesCommand={action:"saveWorkJob";payload:SaveWorkJobInput}|{action:"saveProposalPlan";payload:SaveProposalPlanInput}|{action:"recordProposalSent";payload:RecordProposalSentInput}|{action:"saveMatchReport";payload:SaveMatchReportInput};

const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=="object"||Array.isArray(v))throw Error("営業管理データの形式を確認できませんでした。");return v as Record<string,unknown>;};
const str=(v:unknown,max=3000,required=false)=>{if(typeof v!=="string"||v.length>max||required&&!v.trim())throw Error("営業管理データの項目を確認できませんでした。");return v;};
const id=(v:unknown,empty=false)=>{const s=str(v,128,!empty);if(s&&!/^[A-Za-z0-9_-]{16,128}$/.test(s))throw Error("営業管理IDを確認できませんでした。");return s;};
const account=(v:unknown)=>{const s=str(v,30,true);if(!/^[A-Za-z0-9_-]{1,30}$/.test(s))throw Error("担当者を確認できませんでした。");return s;};
const stamp=(v:unknown,empty=false)=>{const s=str(v,40,!empty);if(s&&(!/^\d{4}-\d{2}-\d{2}T/.test(s)||!Number.isFinite(Date.parse(s))))throw Error("営業管理の更新日時を確認できませんでした。");return s;};
const date=(v:unknown)=>{const s=str(v,10);if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+"T00:00:00Z").toISOString().slice(0,10)!==s))throw Error("営業管理の日付を確認できませんでした。");return s;};
const choice=<T extends string>(v:unknown,values:readonly T[]):T=>{if(!values.includes(v as T))throw Error("営業管理の状態を確認できませんでした。");return v as T;};
const number=(v:unknown,max:number)=>{if(v!==null&&(typeof v!=="number"||!Number.isFinite(v)||v<0||v>max))throw Error("営業管理の数値を確認できませんでした。");return v as number|null;};
const arr=(v:unknown)=>{if(!Array.isArray(v)||v.length>5000)throw Error("営業管理の件数を確認できませんでした。");return v as unknown[];};
const price=(v:unknown):AgreedPrice=>{const p=obj(v);return {amount:number(p.amount,100000000),unit:choice(p.unit,["unknown","hour","month","result"]),tax:choice(p.tax,["unknown","included","excluded"])};};
export function parseSalesWorkflow(value:unknown):SalesWorkflowData{
 const p=obj(value);if(p.feature!==true||p.schemaVersion!==1)throw Error("営業管理の連携コードを更新してください。");
 const jobs=arr(p.jobs).map(v=>{const r=obj(v);return {jobId:id(r.jobId),company:str(r.company,100,true),title:str(r.title,120,true),product:str(r.product,500),description:str(r.description,3000),requirements:str(r.requirements,2000),target:str(r.target,500),workMode:choice(r.workMode,["unknown","remote","onsite","remote_after_training"]),contractPeriod:str(r.contractPeriod,500),weekendPolicy:choice(r.weekendPolicy,["unknown","allowed","not_allowed","negotiable"]),inexperiencedAllowed:choice(r.inexperiencedAllowed,["unknown","yes","no"]),requiredSalesType:choice(r.requiredSalesType,["unknown","b2b","b2c","both"]),requiredIndustries:str(r.requiredIndustries,500),requiredOther:str(r.requiredOther,1000),preferredSalesType:choice(r.preferredSalesType,["unknown","b2b","b2c","both"]),preferredIndustries:str(r.preferredIndustries,500),preferredOther:str(r.preferredOther,1000),clientReviewConditions:str(r.clientReviewConditions,1000),minMonthlyHours:number(r.minMonthlyHours,744),minWeeklyDays:number(r.minWeeklyDays,7),timeWindow:str(r.timeWindow,200),pcTools:str(r.pcTools,1000),workConditions:str(r.workConditions,2000),rateUnit:choice(r.rateUnit,["unknown","hour","month","result"]),rateMin:number(r.rateMin,100000000),rateMax:number(r.rateMax,100000000),tax:choice(r.tax,["unknown","included","excluded"]),status:choice(r.status,workJobStatuses),version:id(r.version),createdBy:account(r.createdBy),updatedBy:account(r.updatedBy),createdAt:stamp(r.createdAt),updatedAt:stamp(r.updatedAt)} satisfies WorkJob;});
 const plans=arr(p.plans).map(v=>{const r=obj(v);return {planId:id(r.planId),ownerId:account(r.ownerId),recordId:id(r.recordId),profileId:id(r.profileId,true),company:str(r.company,100),jobId:id(r.jobId,true),status:choice(r.status,proposalPlanStatuses),reason:str(r.reason,1000),comment:str(r.comment,2000),sentDate:date(r.sentDate),sentRecordId:id(r.sentRecordId,true),version:id(r.version),createdAt:stamp(r.createdAt),updatedAt:stamp(r.updatedAt)} satisfies ProposalPlan;});
 const reports=arr(p.reports).map(v=>{const r=obj(v);return {reportId:id(r.reportId),ownerId:account(r.ownerId),recordId:id(r.recordId),profileId:id(r.profileId,true),company:str(r.company,100),candidateName:str(r.candidateName,60,true),agent:str(r.agent,100),sale:price(r.sale),wholesale:price(r.wholesale),matchDate:date(r.matchDate),comment:str(r.comment,2000),candidateEvidenceId:id(r.candidateEvidenceId,true),clientEvidenceId:id(r.clientEvidenceId,true),status:choice(r.status,matchReportStatuses),confirmedBy:r.confirmedBy?account(r.confirmedBy):"",confirmedAt:stamp(r.confirmedAt,true),version:id(r.version),createdAt:stamp(r.createdAt),updatedAt:stamp(r.updatedAt)} satisfies MatchReport;});
 const companyCounts=arr(p.companyCounts).map(v=>{const r=obj(v);const planned=number(r.planned,1000000),sent=number(r.sent,1000000);if(planned===null||sent===null||!Number.isInteger(planned)||!Number.isInteger(sent))throw Error("企業別の提案件数を確認できませんでした。");return {company:str(r.company,100,true),planned,sent};});
 for(const ids of [jobs.map(r=>r.jobId),plans.map(r=>r.planId),reports.map(r=>r.reportId)])if(new Set(ids).size!==ids.length)throw Error("営業管理IDが重複しています。");
 const period=str(p.period,7,true);if(period!=="all"&&!/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/.test(period))throw Error("企業別集計の期間を確認できませんでした。");return {feature:true,schemaVersion:1,period,jobs,plans,reports,companyCounts,checkedAt:stamp(p.checkedAt)};
}

export type ObjectiveComparison={field:"monthlyHours"|"weeklyDays"|"timeWindow"|"pcTools"|"experience"|"workConditions";label:string;state:"meets"|"below"|"review";candidate:string;requirement:string};
/** These comparisons concern stated work conditions only. They never rank people or use age/gender. */
export function compareCandidateToJob(fields:InterviewFields|undefined,job:WorkJob):ObjectiveComparison[]{
 const results:ObjectiveComparison[]=[];
 const quantity=(raw:string|undefined,unit:RegExp)=>{const s=(raw||"").normalize("NFKC").trim().replace(unit,"").trim();return /^(?:\d+(?:\.\d+)?)$/.test(s)?Number(s):null;};
 for(const [field,label,raw,required,unit] of [["monthlyHours","月間稼働時間",fields?.monthlyHours,job.minMonthlyHours,/(?:時間|h)(?:\/月)?$/i],["weeklyDays","週の稼働日数",fields?.daysPerWeek,job.minWeeklyDays,/(?:日)(?:\/週)?$/]] as const){if(required===null)continue;const n=quantity(raw,unit);results.push({field,label,state:n===null?"review":n>=required?"meets":"below",candidate:raw||"未確認",requirement:`${required}${field==="monthlyHours"?"時間/月":"日/週"}以上`});}
 for(const [field,label,raw,required] of [["timeWindow","時間帯",fields?.timeWindow,job.timeWindow],["pcTools","PC・ツール",fields?[fields.pcEnvironment,...fields.crmTools,...fields.chatTools,fields.pcSkills].filter(Boolean).join("・"):"",job.pcTools]] as const){if(required.trim())results.push({field,label,state:"review",candidate:raw||"未確認",requirement:required});}
 if(job.requiredSalesType!=="unknown"||job.requiredIndustries||job.requiredOther||job.requirements||job.inexperiencedAllowed!=="unknown")results.push({field:"experience",label:"必須経験",state:"review",candidate:fields?.workHistory||"未確認",requirement:[job.inexperiencedAllowed==="yes"?"未経験可":job.inexperiencedAllowed==="no"?"経験必須":"",job.requiredSalesType==="unknown"?"":job.requiredSalesType,job.requiredIndustries,job.requiredOther,job.requirements].filter(Boolean).join("・")});
 if(job.workMode!=="unknown"||job.weekendPolicy!=="unknown"||job.contractPeriod||job.workConditions)results.push({field:"workConditions",label:"勤務・契約条件",state:"review",candidate:fields?.workStyle||"未確認",requirement:[job.workMode==="unknown"?"":job.workMode,job.contractPeriod,job.weekendPolicy==="unknown"?"":job.weekendPolicy,job.workConditions].filter(Boolean).join("・")});
 return results;
}
export function profileForSalesRecord(profiles:readonly CandidateProfile[],record:{recordId:string;playerId:string;profileId?:string}|undefined):CandidateProfile|undefined{
 if(!record?.profileId)return;const matches=profiles.filter(p=>p.profileId===record.profileId&&p.playerId===record.playerId&&p.recordIds.includes(record.recordId));return matches.length===1?matches[0]:undefined;
}
/** Revisit changed jobs using explicit workload bounds. Unknown conditions remain
 * review items. This is a work-condition checklist, never a suitability score. */
export function rediscoveryJobs(fields:InterviewFields|undefined,jobs:readonly WorkJob[],changedAfter:string):Array<{job:WorkJob;checks:ObjectiveComparison[];needsConfirmation:boolean}>{
 return jobs.filter(job=>job.status==="open"&&job.updatedAt>changedAfter).map(job=>({job,checks:compareCandidateToJob(fields,job)})).filter(item=>!item.checks.some(check=>check.state==="below")).map(item=>({...item,needsConfirmation:!item.checks.length||item.checks.some(check=>check.state==="review")}));
}
export function salesCandidatePlans(plans:readonly ProposalPlan[],record:{recordId:string;playerId:string;profileId?:string},records:readonly {recordId:string;playerId:string;profileId?:string}[]=[]):ProposalPlan[]{return plans.filter(p=>p.ownerId===record.playerId&&(record.profileId?p.profileId===record.profileId||!p.profileId&&(p.recordId===record.recordId||records.some(r=>r.recordId===p.recordId&&r.playerId===record.playerId&&r.profileId===record.profileId)):p.recordId===record.recordId));}
export const blankWorkJob=():SaveWorkJobInput=>({company:"",title:"",product:"",description:"",requirements:"",target:"",workMode:"unknown",contractPeriod:"",weekendPolicy:"unknown",inexperiencedAllowed:"unknown",requiredSalesType:"unknown",requiredIndustries:"",requiredOther:"",preferredSalesType:"unknown",preferredIndustries:"",preferredOther:"",clientReviewConditions:"",minMonthlyHours:null,minWeeklyDays:null,timeWindow:"",pcTools:"",workConditions:"",rateUnit:"unknown",rateMin:null,rateMax:null,tax:"unknown",status:"open"});
export const blankAgreedPrice=():AgreedPrice=>({amount:null,unit:"unknown",tax:"unknown"});
