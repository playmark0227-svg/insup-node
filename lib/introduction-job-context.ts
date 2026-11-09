import type {IntroductionClientSettings} from "./introduction-v2.ts";
import type {WorkJob} from "./sales-workflow.ts";

/** A job's advertised budget is reference material. It is never the candidate's
 * desired rate or the company-specific rate approved in introduction settings. */
export type IntroductionJobContext={
 requestId:string;recordId:string;jobId:string;company:string;jobTitle:string;
 jobBudget:{min:number|null;max:number|null;unit:WorkJob["rateUnit"];tax:WorkJob["tax"]};
};
export function introductionJobContext(recordId:string,job:WorkJob,requestId:string):IntroductionJobContext{
 return {requestId,recordId,jobId:job.jobId,company:job.company,jobTitle:job.title,jobBudget:{min:job.rateMin,max:job.rateMax,unit:job.rateUnit,tax:job.tax}};
}
export const normalizeIntroductionCompanyName=(value:string)=>value.normalize("NFKC").replace(/[\s\u3000]/g,"").toLocaleLowerCase("ja-JP");
export type IntroductionJobClientResolution={status:"matched";client:IntroductionClientSettings}|{status:"missing"|"ambiguous"};
/** Require one exact normalized company name. Similar names and legal suffixes
 * never establish an address or authorize a rate automatically. */
export function resolveIntroductionJobClient(context:Pick<IntroductionJobContext,"company">,clients:readonly IntroductionClientSettings[]):IntroductionJobClientResolution{
 const name=normalizeIntroductionCompanyName(context.company);
 if(!name)return {status:"missing"};
 const matches=clients.filter(client=>normalizeIntroductionCompanyName(client.name)===name);
 return matches.length===1?{status:"matched",client:matches[0]}:{status:matches.length?"ambiguous":"missing"};
}
