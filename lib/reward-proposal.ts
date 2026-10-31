import type {Counts} from "./sheets-client.ts";

export type RewardRules = {pointsPerWin:number;milestone:number};
export type RewardMember = {id:string;name:string;active?:boolean};
export type RewardMonth = {month:string;count:number;winnerIds:string[];pointsEach:number;provisional:boolean};
export type RewardStanding = {id:string;name:string;points:number;wins:number;rank:number;currentPoints:number};
export const defaultRewardRules:RewardRules = {pointsPerWin:100,milestone:500};
export const validRewardMonth=(month:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(month)&&Number(month.slice(0,4))>=1900&&Number(month.slice(0,4))<=2100;
export function validateRewardRules(value:RewardRules):RewardRules {
 if(!Number.isSafeInteger(value.pointsPerWin)||value.pointsPerWin<1||value.pointsPerWin>10000||!Number.isSafeInteger(value.milestone)||value.milestone<1||value.milestone>1000000)throw new Error("1位のポイントは1〜10,000、特典の目安は1〜1,000,000で入力してください。");
 return {pointsPerWin:value.pointsPerWin,milestone:value.milestone};
}
/** Proposal-only simulation. No balance, award, entitlement or redemption is written. */
export function buildRewardProposal(players:readonly RewardMember[],counts:Counts,currentMonth:string,rules:RewardRules=defaultRewardRules){
 if(!validRewardMonth(currentMonth))throw new Error("ポイントを試算する年月を確認してください。");
 const checked=validateRewardRules(rules),members=[...new Map(players.filter(p=>p.id&&p.id!=="ADMIN").map(p=>[p.id,p])).values()];
 const months=[...new Set([...Object.keys(counts).filter(month=>validRewardMonth(month)&&month<currentMonth),currentMonth])].sort().reverse();
 const history:RewardMonth[]=months.map(month=>{
  const eligible=members;
  const values=eligible.map(member=>({id:member.id,count:counts[month]?.[member.id]?.["提案"]})).map(item=>({...item,count:typeof item.count==="number"&&Number.isSafeInteger(item.count)&&item.count>0?item.count:0}));
  const top=Math.max(0,...values.map(item=>item.count));
  return {month,count:top,winnerIds:top>0?values.filter(item=>item.count===top).map(item=>item.id).sort():[],pointsEach:top>0?checked.pointsPerWin:0,provisional:month===currentMonth};
 });
 const standings:RewardStanding[]=members.map(member=>{
  const wins=history.filter(month=>!month.provisional&&month.winnerIds.includes(member.id));
  return {id:member.id,name:member.name,points:wins.reduce((total,month)=>total+month.pointsEach,0),wins:wins.length,rank:0,currentPoints:history.find(month=>month.provisional)?.winnerIds.includes(member.id)?checked.pointsPerWin:0};
 }).sort((a,b)=>b.points-a.points||b.wins-a.wins||a.id.localeCompare(b.id));
 standings.forEach((member,index)=>{member.rank=member.points===0?0:index>0&&member.points===standings[index-1].points?standings[index-1].rank:index+1;});
 return {rules:checked,history,standings,closedMonths:history.filter(month=>!month.provisional).length,current:history.find(month=>month.provisional)!};
}
