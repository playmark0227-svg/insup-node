export const stages = ["候補者面談", "提案", "C面談予約", "クライアント面談", "内定", "内定承諾", "稼働開始予定", "稼働開始"] as const;
export type Stage = typeof stages[number];
export type Metric = Stage | "紹介人数";
export type Player = { id: string; name: string; team: string; color: string; target: number; bio: string };
export type Activity = { id: string; recordId?: string; rowVersion?: string; playerId: string; candidateId: string; candidateName: string; source: string; company: string; position: string; stage: Stage; date: string; status?: string; probability?: string; interviewScheduledDate?: string; clientInterviewScheduledTime?: string; offerScheduledDate?: string; memo?: string };
export const positions = ["アポインター", "FS", "ディレクション", "コールシステム", "コンサル", "その他"];
export const statuses = ["提案候補", "提案なし", "提案完了（面談日確定待ち）", "面談確定(面談実施待ち）", "面談実施（合否待ち）", "合格（シフト入力待ち）", "稼働予定日確定（稼働開始待ち）", "稼働開始", "落選（面談後）", "落選（面談前）", "辞退（音信不通）", "辞退（他決）", "辞退（本人希望）", "案件枠埋まり", "合格後離脱", "稼働後離脱", "C面談リスケ", "C面談ブッチ"];
export const statusForStage: Record<Stage,string> = {"候補者面談":"提案候補","提案":"提案完了（面談日確定待ち）","C面談予約":"面談確定(面談実施待ち）","クライアント面談":"面談実施（合否待ち）","内定":"合格（シフト入力待ち）","内定承諾":"合格（シフト入力待ち）","稼働開始予定":"稼働予定日確定（稼働開始待ち）","稼働開始":"稼働開始"};
export const initialPlayers: Player[] = [
 { id:"ND-001", name:"越前祐美", team:"NODE", color:"mint", target:20, bio:"" },
 { id:"ND-002", name:"鈴木楓", team:"NODE", color:"blue", target:20, bio:"" },
 { id:"ND-003", name:"櫻庭奈々", team:"NODE", color:"amber", target:20, bio:"" },
 { id:"ND-004", name:"髙田侑弥", team:"NODE", color:"violet", target:20, bio:"" },
 { id:"ND-005", name:"佐藤光", team:"NODE", color:"rose", target:20, bio:"" },
 { id:"ND-006", name:"倉島颯汰", team:"NODE", color:"cyan", target:20, bio:"" },
 { id:"ND-007", name:"佐々木駿", team:"NODE", color:"blue", target:20, bio:"" },
];
export function makeDemoActivities(): Activity[] {
 const all:Activity[]=[]; const quantities=[24,21,17,16,13,11,9];
 for(const month of ["2026-09","2026-10"]) initialPlayers.forEach((player,pi)=>{
   const count=quantities[pi]+(month.endsWith("09")?pi%3-2:0);
   for(let i=0;i<count+4;i++){
     const base={playerId:player.id,candidateId:`C-${month}-${pi}-${i}`,candidateName:`候補者${String(pi*30+i+1).padStart(3,"0")}`,source:["自社集客","パートナーA","パートナーB"][i%3],company:["クライアントA","クライアントB","クライアントC","クライアントD"][i%4],position:positions[i%positions.length]};
     const max=i<Math.floor(count/6)?7:i<Math.floor(count/5)?6:i<Math.floor(count/4)?5:i<Math.floor(count/3)?4:i<Math.floor(count/2)?3:i<Math.floor(count*.7)?2:i<count?1:0;
     for(let si=0;si<=max;si++){
       const day=month.endsWith("10")?Math.min(4,1+Math.floor(i/8)+Math.floor(si/2)):Math.min(28,3+i+si);
       all.push({...base,recordId:si===0?undefined:`ROW-${month}-${pi}-${i}`,id:`DEMO-${month}-${pi}-${i}-${si}`,company:si===0?"":base.company,stage:stages[si],date:`${month}-${String(day).padStart(2,"0")}`});
     }
   }
 }); return all;
}
export function inPeriod(a:Activity,period:string){return period==="all"||(period.length===10?a.date===period:a.date.startsWith(period));}
export function metricCount(activities:Activity[],playerId:string|null,stage:Metric,period:string){return new Set(activities.filter(a=>(!playerId||a.playerId===playerId)&&a.stage===(stage==="紹介人数"?"提案":stage)&&inPeriod(a,period)).map(a=>stage==="候補者面談"?`${a.date}|${a.playerId}|${a.candidateName.replace(/\s/g,"")}`:stage==="紹介人数"?a.candidateId:(a.recordId||`${a.candidateId}|${a.company}`))).size;}
export function rankPlayers(players:Player[],activities:Activity[],stage:Metric,period:string,counter?:(id:string)=>number){
 const ranked=players.map(player=>({...player,count:counter?counter(player.id):metricCount(activities,player.id,stage,period),rank:0})).sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
 ranked.forEach((r,i)=>{r.rank=i&&r.count===ranked[i-1].count?ranked[i-1].rank:i+1;}); return ranked;
}
export function latestPlacements(activities:Activity[],playerId:string|null){
 const groups=new Map<string,Activity[]>();activities.filter(a=>(!playerId||a.playerId===playerId)&&a.company).forEach(a=>{const key=a.recordId||`${a.candidateId}|${a.company}`;groups.set(key,[...(groups.get(key)||[]),a]);});
 return [...groups.values()].map(events=>({...events.reduce((latest,a)=>stages.indexOf(a.stage)>stages.indexOf(latest.stage)?a:latest),status:events.slice().reverse().find(a=>a.status)?.status,events})).sort((a,b)=>b.date.localeCompare(a.date));
}
