import { positions, stages, statuses } from "./node-data.ts";
import { matchingFields, recordDateColumns, recordTimeColumns } from "./management-data.ts";
import { businessToday, type SheetSnapshot } from "./sheets-client.ts";

export type CorrectionField = { key:string; label:string; value:string; type:"text"|"textarea"|"date"|"time"|"select"|"number"; options?:string[]; max?:string };
export type SaveCorrectionDraft = { operationId:string; fields:CorrectionField[] };
const actualColumns = [1,8,9,17,21,22,24,26];
const names:Record<string,string> = {candidateName:"候補者氏名",company:"会社名",position:"ポジション",stage:"成果の工程",date:"実績日",source:"紹介元",status:"ステータス",probability:"ヨミ確度",interviewScheduledDate:"C面談予定日",clientInterviewScheduledTime:"C面談予定開始時刻",offerScheduledDate:"オファー予定日",memo:"メモ",category:"理由の分類",nextAction:"次回の対応",name:"氏名",team:"チーム",target:"目標",bio:"プロフィール"};
const own = (value:unknown):Record<string,unknown> => value && typeof value==="object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
function bodyFor(action:string,payload:unknown) { const data=own(payload);return own(action==="saveActivity"?data.activity:action==="updateProfile"?data.player:action==="updateRecord"?data.changes:data); }
function validDate(value:string) { if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(`${value}T00:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value; }
export function correctionFieldMax(field:CorrectionField,values:Record<string,string>,today=businessToday()):string|undefined {
 return field.key==="date"&&values.stage?values.stage==="稼働開始予定"?undefined:today:field.max;
}

export function correctionFieldErrors(draft:SaveCorrectionDraft,values:Record<string,string>,today=businessToday()):Record<string,string> {
 const errors:Record<string,string>={};
 for(const field of draft.fields){const value=values[field.key]??field.value;if(field.type!=="date"||!value)continue;const max=correctionFieldMax(field,values,today);
  if(!validDate(value))errors[field.key]=`${field.label}に有効な日付を入力してください。`;else if(max&&value>max)errors[field.key]=`今日（${max.replaceAll("-","/")}）以前の日付にしてください。`;
 }return errors;
}

/** Same actual/planned distinction as the server; planned dates may be in the future. */
export function mutationDateErrors(action:string,payload:unknown,today=businessToday()):Record<string,string> {
 const body=bodyFor(action,payload),errors:Record<string,string>={};
 const check=(key:string,label:string,actual:boolean)=>{const value=body[key];if(value===""||value===undefined)return;if(typeof value!=="string"||!validDate(value))errors[key]=`${label}に有効な日付を入力してください。`;else if(actual&&value>today)errors[key]=`${label}は今日（${today.replaceAll("-","/")}）以前の日付にしてください。`;};
 if(action==="updateRecord")recordDateColumns.forEach(col=>check(String(col),matchingFields[col-1],actualColumns.includes(col)));
 if(action==="saveActivity"){check("date","実績日",body.stage!=="稼働開始予定");check("interviewScheduledDate","C面談予定日",false);check("offerScheduledDate","オファー予定日",false);}
 return errors;
}

/** Return editable business values only. IDs, revisions, hidden intake and permissions stay in the hook. */
export function correctionFields(action:string,payload:unknown,snapshot:SheetSnapshot,today=businessToday()):CorrectionField[] {
 const body=bodyFor(action,payload);
 const allowed:Record<string,string[]>={createCandidate:["candidateName","company","position"],saveActivity:Object.keys(names),updateStatus:["status"],saveClient:["name"],updateProfile:["name","team","target","bio"],saveInterviewReview:["category","memo","nextAction"]};
 return Object.entries(body).flatMap(([key,value])=>{
  const col=Number(key);if(action==="updateRecord"?!Number.isInteger(col)||col<1||col>26:!allowed[action]?.includes(key))return [];
  if(!["string","number","boolean"].includes(typeof value))return [];
  const label=action==="updateRecord"?matchingFields[col-1]:names[key],date=action==="updateRecord"?recordDateColumns.includes(col):["date","interviewScheduledDate","offerScheduledDate"].includes(key);
  const actual=action==="updateRecord"?actualColumns.includes(col):key==="date"&&body.stage!=="稼働開始予定";
  let options:string[]|undefined;
  if(typeof value==="boolean")options=["true","false"];
  else if(action==="updateRecord"&&col===4)options=snapshot.players.flatMap(p=>p.sheetNames?.length?p.sheetNames:[p.id]);
  else if(action==="updateRecord"&&col===5)options=["新規","再販（離脱等）"];
  else if(key==="position"||action==="updateRecord"&&col===6)options=positions;
  else if(key==="status"||action==="updateRecord"&&col===7)options=statuses;
  else if(key==="probability"||action==="updateRecord"&&col===12)options=["Aヨミ","Bヨミ","Cヨミ","Dヨミ"];
  else if(key==="stage")options=[...stages];
  const type:CorrectionField["type"]=options?"select":date?"date":recordTimeColumns.includes(col)&&action==="updateRecord"||key==="clientInterviewScheduledTime"?"time":["memo","bio","nextAction"].includes(key)||action==="updateRecord"&&[13,19].includes(col)?"textarea":typeof value==="number"?"number":"text";
  return [{key,label,value:String(value),type,...(options?{options:[...new Set(["",...options,String(value)])]}:{}),...(date&&actual?{max:today}:{})}];
 });
}

export function correctedPayload(action:string,payload:unknown,values:Record<string,string>,snapshot:SheetSnapshot):unknown {
 const fields=correctionFields(action,payload,snapshot),copy=JSON.parse(JSON.stringify(payload)),body=bodyFor(action,copy),original=bodyFor(action,payload);
 if(!fields.length||Object.keys(values).some(key=>!fields.some(field=>field.key===key)))throw new Error("この保存の修正項目を確認できませんでした。保存状況を開き直してください。");
 for(const field of fields){const value=values[field.key];if(value===undefined)continue;if(typeof value!=="string"||value.length>12000)throw new Error(`${field.label}の入力内容を確認してください。`);if(field.options&&!field.options.includes(value))throw new Error(`${field.label}は選択肢から選んでください。`);if(typeof original[field.key]==="number"){if(!Number.isFinite(Number(value)))throw new Error(`${field.label}に数値を入力してください。`);body[field.key]=Number(value);}else body[field.key]=typeof original[field.key]==="boolean"?value==="true":value;}
 const errors=mutationDateErrors(action,copy);if(Object.keys(errors).length)throw new Error(Object.values(errors)[0]);return copy;
}
