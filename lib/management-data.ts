import type { Activity, Stage } from "./node-data";
import type { CandidateRecord, ManagementCell } from "./sheets-client";

export const matchingFields = ["面談実施日","会社名","候補者氏名","担当","新規・再販","担当ポジション","ステータス","提案完了日","C面談予約獲得日","C面談予定日","C面談予定開始時刻","ヨミ確度","メモ","C面談参加意思回収担当","C面談参加意思の回収有無","面談担当","C面談実施日","合否回答期日","合否メモ","合否回答時刻","クライアント側オファー日","候補者承諾日・マッチ日","稼働開始予定日","稼働開始日","離脱予定日","離脱日"];
export const milestoneColumns: Record<Stage, number> = {"候補者面談":1,"提案":8,"C面談予約":9,"クライアント面談":17,"内定":21,"内定承諾":22,"稼働開始予定":23,"稼働開始":24};
export const recordDateColumns = [1,8,9,10,17,18,21,22,23,24,25,26];
export const recordTimeColumns = [11,20];
export const valueAt = (r: CandidateRecord, col: number) => String(r.values[col-1] ?? "");
export function correctionRecords(records:CandidateRecord[],owner:string,stage:Stage,period:string):CandidateRecord[] {
 const col=milestoneColumns[stage];
 const found=records.filter(r=>r.playerId===owner&&/^\d{4}-\d{2}-\d{2}$/.test(valueAt(r,col))&&(period==="all"||valueAt(r,col).startsWith(period)));
 if(stage!=="候補者面談")return found;
 return [...new Map(found.map(r=>[`${r.playerId}|${r.candidateName}|${valueAt(r,col)}`,r])).values()];
}
export function sampleRecords(activities:Activity[]):CandidateRecord[] {
 const records=new Map<string,CandidateRecord>();
 activities.forEach(a=>{const id=a.recordId||`${a.candidateId}|${a.company}`;let r=records.get(id);
  if(!r){r={recordId:id,rowVersion:"sample",row:records.size+2,playerId:a.playerId,candidateName:a.candidateName,source:a.source,values:Array(26).fill(""),formulaColumns:[]};Object.assign(r.values,{1:a.company,2:a.candidateName,3:a.playerId,5:a.position,6:a.status||"",11:a.probability||"",12:a.memo||""});records.set(id,r);}
  r.values[milestoneColumns[a.stage]-1]=a.date;
 });records.forEach(r=>{if(!r.values[0])r.values[0]=activities.find(a=>a.playerId===r.playerId&&a.candidateName===r.candidateName&&a.stage==="候補者面談")?.date||"";});return [...records.values()];
}
export function cellInputValue(cell:ManagementCell, text:string):string|number|boolean {
 if(text==="")return "";
 if(cell.kind==="number"||cell.kind==="percent"){const n=Number(text);if(!Number.isFinite(n))throw new Error("有効な数値を入力してください。");return cell.kind==="percent"?n/100:n;}
 if(cell.kind==="boolean")return text==="true";
 return text;
}
export function cellEditorValue(cell:ManagementCell):string {return cell.kind==="percent"&&typeof cell.value==="number"?String(Number((cell.value*100).toFixed(8))):String(cell.value);}
