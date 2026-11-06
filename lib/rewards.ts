export const rewardMetrics=["候補者面談","提案","C面談予約","クライアント面談","内定承諾","稼働開始"] as const;
export type RewardMetric=typeof rewardMetrics[number];
export type RewardPolicy={enabled:boolean;metric:RewardMetric;pointsPerWin:number;tiePolicy:"all"|"hold";effectiveMonth:string;version:string};
export type RewardCatalogItem={id:string;name:string;points:number;active:boolean;version:string};
export type RewardBalance={playerId:string;name:string;active:boolean;balance:number;reserved:number;available:number};
export type RewardLedgerEntry={entryId:string;playerId:string;delta:number;kind:"award"|"correction"|"adjustment"|"redemption";reference:string;reason:string;actorId:string;createdAt:string};
export type RewardRequest={requestId:string;playerId:string;rewardId:string;rewardName:string;points:number;status:"pending"|"approved"|"rejected"|"canceled";version:string;createdAt:string;updatedAt:string;decidedBy:string;decisionNote:string};
export type RewardMonth={month:string;awards:{playerId:string;points:number;count:number}[];policy:Omit<RewardPolicy,"version">;version:string;updatedAt:string;actorId:string};
export type RewardPreview={month:string;fingerprint:string;topCount:number;awards:{playerId:string;points:number;count:number}[];changes:{playerId:string;delta:number}[];alreadySettled:boolean;policy:Omit<RewardPolicy,"version">};
export type RewardsData={feature:true;version:string;policy:RewardPolicy;catalog:RewardCatalogItem[];balances:RewardBalance[];ledger:RewardLedgerEntry[];requests:RewardRequest[];months:RewardMonth[];preview?:RewardPreview};
export type RewardsCommand=({command:"policy";policy:Omit<RewardPolicy,"version">}|{command:"catalog";item:{id?:string;name:string;points:number;active:boolean}}|{command:"settle";month:string;fingerprint:string;reason:string}|{command:"adjust";playerId:string;delta:number;reason:string}|{command:"request";rewardId:string}|{command:"review";requestId:string;decision:"approve"|"reject"|"cancel";note:string})&{expectedVersion:string};
const object=(x:unknown):Record<string,unknown>=>{if(!x||typeof x!=="object"||Array.isArray(x))throw new Error("ポイント情報を確認できませんでした。");return x as Record<string,unknown>;};
const text=(x:unknown,max=200)=>{if(typeof x!=="string"||x.length>max)throw new Error("ポイント情報の文字を確認してください。");return x;};
const integer=(x:unknown,min=0,max=100000000)=>{if(!Number.isSafeInteger(x)||Number(x)<min||Number(x)>max)throw new Error("ポイント情報の数値を確認してください。");return Number(x);};
const bool=(x:unknown)=>{if(typeof x!=="boolean")throw new Error("ポイント情報の状態を確認してください。");return x;};
const list=(x:unknown)=>{if(!Array.isArray(x)||x.length>5000)throw new Error("ポイント情報の件数を確認してください。");return x;};
const enumValue=<T extends string>(x:unknown,values:readonly T[]):T=>{if(!values.includes(x as T))throw new Error("ポイント情報の種類を確認してください。");return x as T;};
const identity=(x:unknown)=>{const s=text(x,128);if(!/^[A-Za-z0-9_-]{1,128}$/.test(s))throw new Error("ポイント情報のIDを確認してください。");return s;};
const version=(x:unknown)=>{const s=text(x,128);if(!/^[A-Za-z0-9_-]{16,128}$/.test(s))throw new Error("ポイント情報の保存状態を確認してください。");return s;};
export const validRewardsMonth=(x:string)=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(x);
const month=(x:unknown)=>{const s=text(x,7);if(!validRewardsMonth(s))throw new Error("ポイントの年月を確認してください。");return s;};
const stamp=(x:unknown)=>{const s=text(x,40);if(s&&!/^\d{4}-\d{2}-\d{2}T/.test(s)||s&&!Number.isFinite(Date.parse(s)))throw new Error("ポイント情報の日時を確認してください。");return s;};
export function parseRewardPolicy(value:unknown):RewardPolicy{const x=object(value);return {enabled:bool(x.enabled),metric:enumValue(x.metric,rewardMetrics),pointsPerWin:integer(x.pointsPerWin,1,10000),tiePolicy:enumValue(x.tiePolicy,["all","hold"]),effectiveMonth:month(x.effectiveMonth),version:version(x.version)};}
const awards=(value:unknown)=>list(value).map(v=>{const x=object(v);return {playerId:identity(x.playerId),points:integer(x.points,1,10000),count:integer(x.count,1,1000000)};});
const policyBody=(value:unknown)=>{const x=parseRewardPolicy({...object(value),version:"initial-policy-00000000"});const {version:_,...body}=x;return body;};
export function parseRewards(value:unknown):RewardsData{
 const x=object(value);if(x.feature!==true)throw new Error("ポイント機能のGoogle連携を更新してください。");
 const catalog=list(x.catalog).map(v=>{const p=object(v);return {id:identity(p.id),name:text(p.name,80),points:integer(p.points,1,1000000),active:bool(p.active),version:version(p.version)};});
 const balances=list(x.balances).map(v=>{const p=object(v),balance=integer(p.balance),reserved=integer(p.reserved),available=integer(p.available);if(available!==balance-reserved)throw new Error("ポイント残高と予約数が一致しません。");return {playerId:identity(p.playerId),name:text(p.name,100),active:bool(p.active),balance,reserved,available};});
 const ledger=list(x.ledger).map(v=>{const p=object(v);return {entryId:identity(p.entryId),playerId:identity(p.playerId),delta:integer(p.delta,-100000000),kind:enumValue(p.kind,["award","correction","adjustment","redemption"]),reference:text(p.reference,128),reason:text(p.reason,300),actorId:identity(p.actorId),createdAt:stamp(p.createdAt)};});
 const requests=list(x.requests).map(v=>{const p=object(v);return {requestId:identity(p.requestId),playerId:identity(p.playerId),rewardId:identity(p.rewardId),rewardName:text(p.rewardName,80),points:integer(p.points,1,1000000),status:enumValue(p.status,["pending","approved","rejected","canceled"]),version:version(p.version),createdAt:stamp(p.createdAt),updatedAt:stamp(p.updatedAt),decidedBy:p.decidedBy?identity(p.decidedBy):"",decisionNote:text(p.decisionNote,300)};});
 const months=list(x.months).map(v=>{const p=object(v);return {month:month(p.month),awards:awards(p.awards),policy:policyBody(p.policy),version:version(p.version),updatedAt:stamp(p.updatedAt),actorId:identity(p.actorId)};});
 for(const ids of [catalog.map(p=>p.id),balances.map(p=>p.playerId),ledger.map(p=>p.entryId),requests.map(p=>p.requestId),months.map(p=>p.month)])if(new Set(ids).size!==ids.length)throw new Error("ポイント情報のIDが重複しています。");
 const result:RewardsData={feature:true,version:version(x.version),policy:parseRewardPolicy(x.policy),catalog,balances,ledger,requests,months};
 if(x.preview!==undefined){const p=object(x.preview);result.preview={month:month(p.month),fingerprint:version(p.fingerprint),topCount:integer(p.topCount,0,1000000),awards:awards(p.awards),changes:list(p.changes).map(v=>{const c=object(v);return {playerId:identity(c.playerId),delta:integer(c.delta,-100000000)};}),alreadySettled:bool(p.alreadySettled),policy:policyBody(p.policy)};}
 return result;
}
export const rewardMetricLabel=(metric:RewardMetric)=>({候補者面談:"面談実施",提案:"提案数",C面談予約:"C面談予約",クライアント面談:"C面談実施",内定承諾:"マッチ数",稼働開始:"稼働開始"})[metric];
export function previousRewardMonth(current:string){if(!validRewardsMonth(current))throw new Error("年月を確認してください。");const date=new Date(`${current}-01T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()-1);return date.toISOString().slice(0,7);}
