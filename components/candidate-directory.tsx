import { Fragment, useId, useState } from "react";
import { ChevronDown, ChevronRight, MessageCircle, Trash2 } from "lucide-react";
import type { CandidateGroup } from "@/lib/candidate-groups";
import { milestoneColumns, statusTone, valueAt } from "@/lib/management-data";
import { activityInputMetrics } from "@/lib/performance-metrics";
import { businessToday, type CandidateRecord, type SheetPlayer } from "@/lib/sheets-client";
import "./candidate-directory.css";

type DirectoryProps = {
 groups:CandidateGroup[];players:SheetPlayer[];busy:boolean;intakeEnabled:boolean;canDelete:boolean;
 onEdit:(id:string)=>void;onBasic:(id:string)=>void;onDelete:(id:string)=>void;onChat?:(key:string)=>void;
};

const unique = (values:string[]) => [...new Set(values.filter(Boolean))];
function nextAppointment(records:CandidateRecord[]) {
 const today=businessToday();
 return records.flatMap(record=>{
  if(statusTone(valueAt(record,7))==="closed")return [];
  return [{date:valueAt(record,10),time:valueAt(record,11),label:"C面談",done:valueAt(record,17)},
   {date:valueAt(record,23),time:"",label:"稼働開始予定",done:valueAt(record,24)}]
   .filter(item=>!item.done&&/^\d{4}-\d{2}-\d{2}$/.test(item.date))
   .map(item=>({...item,overdue:item.date<today}));
 }).sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
}

export function CandidateDirectory(props:DirectoryProps) {
 const {groups,players,busy,intakeEnabled,canDelete,onEdit,onBasic,onDelete,onChat}=props;
 const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
 const id=useId();
 function toggle(key:string){setExpanded(previous=>{const next=new Set(previous);if(next.has(key))next.delete(key);else next.add(key);return next;});}
 function basicButton(record:CandidateRecord){return <button className="candidate-basic-button" disabled={busy} onClick={()=>onBasic(record.recordId)} aria-label={`${record.candidateName}の${valueAt(record,2)||"未提案の記録"}の基本情報`}>基本情報</button>;}
 function history(group:CandidateGroup){return <div className="candidate-history-list">
  <p className="candidate-history-help">会社・提案ごとに記録を分けて保存しています。修正する記録を選んでください。</p>
  {group.records.map(record=><article className="candidate-history-record" key={record.recordId}>
   <header><div><strong>{valueAt(record,2)||"未提案"}</strong><small>{valueAt(record,6)||"ポジション未設定"} · 管理行 {record.row}</small></div><span className={`stage-tag status-${statusTone(valueAt(record,7))}`} title={valueAt(record,7)}>{valueAt(record,7)||"進捗未設定"}</span></header>
   <dl className="candidate-history-dates">{activityInputMetrics.map(metric=><div key={metric.stage} className={valueAt(record,milestoneColumns[metric.stage])?"is-recorded":""}><dt>{metric.label}</dt><dd>{valueAt(record,milestoneColumns[metric.stage])||"未登録"}</dd></div>)}</dl>
   {(valueAt(record,10)||valueAt(record,23))&&<p className="candidate-history-schedule">{valueAt(record,10)&&<span>C面談予定：{valueAt(record,10)} {valueAt(record,11)}</span>}{valueAt(record,23)&&<span>稼働開始予定：{valueAt(record,23)}</span>}</p>}
   <footer>{intakeEnabled&&basicButton(record)}<button className="text-button" aria-label={`${group.name}の${valueAt(record,2)||"未提案の記録"}（管理行${record.row}）の詳細・修正`} onClick={()=>onEdit(record.recordId)}>詳細・修正<ChevronRight size={15}/></button>{canDelete&&<button className="candidate-delete-button" disabled={busy} aria-label={`${group.name}の${valueAt(record,2)||"未提案の記録"}（管理行${record.row}）の削除を確認`} onClick={()=>onDelete(record.recordId)}><Trash2 size={14}/>この記録を削除</button>}</footer>
  </article>)}
 </div>;}
 function summary(group:CandidateGroup){
  const companies=unique(group.records.map(record=>valueAt(record,2)));
  const progress=unique(group.records.map(record=>valueAt(record,7)));
  const appointment=nextAppointment(group.records);
  const interviews=group.records.map(record=>valueAt(record,1)).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  return {companies,progress,appointment,interview:interviews.at(-1),owner:players.find(player=>player.id===group.playerId)?.name||valueAt(group.records[0],4)||"担当未設定"};
 }
 function expandButton(group:CandidateGroup,controls:string){return <button type="button" className="candidate-history-toggle" aria-label={`${group.name||"氏名未設定"}の提案・履歴 ${group.records.length}件`} aria-expanded={expanded.has(group.key)} aria-controls={controls} onClick={()=>toggle(group.key)}>{expanded.has(group.key)?<ChevronDown size={17}/>:<ChevronRight size={17}/>}提案・履歴 <span>{group.records.length}件</span></button>;}
 function chatButton(group:CandidateGroup){return onChat&&<button type="button" className="candidate-chat-trigger" title={`${group.name||"氏名未設定"}についてAIに相談`} aria-label={`${group.name||"氏名未設定"}についてAIに相談`} onClick={()=>onChat(group.key)}><MessageCircle size={15}/><span>AIに相談</span></button>;}
 function progressTags(progress:string[]){return <div className="candidate-directory-statuses">{progress.slice(0,2).map(status=><span key={status} title={status} className={`stage-tag status-${statusTone(status)}`}>{status}</span>)}{progress.length>2&&<small>ほか{progress.length-2}種類</small>}{!progress.length&&<small>進捗未設定</small>}</div>;}
 return <>
  <div className="management-table-scroll candidate-desktop-list"><table className="candidate-table candidate-directory-table"><thead><tr><th>候補者・担当</th><th>提案先</th><th>進捗</th><th>次の予定</th><th>提案・活動の履歴</th></tr></thead><tbody>{groups.map((group,index)=>{
   const info=summary(group),controls=`${id}-desktop-${index}`,open=expanded.has(group.key);
   return <Fragment key={group.key}><tr className={open?"candidate-directory-row is-open":"candidate-directory-row"}>
    <td><div className="candidate-name-line"><strong>{group.name||"氏名未設定"}</strong>{intakeEnabled&&group.records.length===1&&basicButton(group.records[0])}</div><small>{info.owner}{!group.playerId&&" · 対応未設定"}</small>{info.interview&&<small>最終面談 {info.interview}</small>}</td>
    <td><div className="candidate-directory-companies">{info.companies.slice(0,2).map(company=><span key={company}>{company}</span>)}{!info.companies.length&&<span>未提案</span>}</div>{info.companies.length>2&&<small>ほか{info.companies.length-2}社</small>}<small>{info.companies.length}社 · {group.records.length}件の記録</small></td>
    <td>{progressTags(info.progress)}</td><td>{info.appointment?<><span>{info.appointment.date}</span><small>{info.appointment.label} {info.appointment.time}</small>{info.appointment.overdue&&<small className="candidate-appointment-overdue">予定日経過・要確認</small>}</>:<small>予定なし</small>}</td>
    <td><div className="candidate-directory-actions">{chatButton(group)}{expandButton(group,controls)}</div></td></tr>{open&&<tr className="candidate-directory-detail"><td colSpan={5}><div id={controls}>{history(group)}</div></td></tr>}</Fragment>;
  })}</tbody></table></div>
  <div className="candidate-mobile-list candidate-directory-mobile">{groups.map((group,index)=>{
   const info=summary(group),controls=`${id}-mobile-${index}`,open=expanded.has(group.key);
   return <article className="candidate-mobile-card" key={group.key}><header><div><strong>{group.name||"氏名未設定"}</strong><small>{info.owner}{!group.playerId&&" · 対応未設定"}</small></div><span className="candidate-record-count">{group.records.length}件の記録</span></header>
    <p>{info.companies.slice(0,2).join(" / ")||"未提案"}{info.companies.length>2&&` ほか${info.companies.length-2}社`}{info.interview&&<small>最終面談 {info.interview}</small>}</p>{progressTags(info.progress)}
    {info.appointment&&<p>次の予定：{info.appointment.date} {info.appointment.time}<small>{info.appointment.label}</small>{info.appointment.overdue&&<small className="candidate-appointment-overdue">予定日経過・要確認</small>}</p>}
    {intakeEnabled&&group.records.length===1&&<div>{basicButton(group.records[0])}</div>}<div className="candidate-directory-mobile-actions">{chatButton(group)}{expandButton(group,controls)}</div>
    {open&&<div id={controls}>{history(group)}</div>}
   </article>;
  })}</div>
 </>;
}
