import { Fragment, useId, useState } from "react";
import { ArrowRight, CalendarDays, ChevronDown, ChevronRight, MessageCircle, Trash2 } from "lucide-react";
import {candidateAppointments,type CandidateGroup} from "@/lib/candidate-groups";
import { milestoneColumns, statusTone, valueAt } from "@/lib/management-data";
import { activityInputMetrics } from "@/lib/performance-metrics";
import { businessToday, type CandidateRecord, type SheetPlayer } from "@/lib/sheets-client";
import "./candidate-directory.css";

type DirectoryProps = {
 groups:CandidateGroup[];players:SheetPlayer[];busy:boolean;intakeEnabled:boolean;canDelete:boolean;
 onEdit:(id:string)=>void;onBasic:(id:string)=>void;onDelete:(id:string)=>void;onChat?:(key:string)=>void;
};

const unique = (values:string[]) => [...new Set(values.filter(Boolean))];
const hasDate = (value:string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Suggestions describe missing records; they never assert that an unrecorded event happened. */
export function candidateFollowUp(record:CandidateRecord) {
 const value=(col:number)=>valueAt(record,col),tone=statusTone(value(7)),today=businessToday();
 if(tone==="closed"||tone==="filled")return {label:"終了した提案の履歴を確認",reason:"必要に応じて終了理由やメモを確認できます。",active:false};
 if(value(24))return {label:"稼働後の状況を確認",reason:"稼働開始日が登録されています。",active:true};
 if(tone==="started")return {label:"稼働開始日を確認",reason:"進捗は稼働開始ですが、開始日は未登録です。",active:true};
 if(value(23))return {label:"稼働開始の状況を確認",reason:"開始予定あり・実際の開始日は未登録です。",active:true};
 if(tone==="start-scheduled")return {label:"稼働開始予定を確認",reason:"進捗は開始待ちですが、開始予定日は未登録です。",active:true};
 if(value(22))return {label:"稼働開始予定を確認",reason:"承諾日あり・開始予定日は未登録です。",active:true};
 if(value(21))return {label:"本人の承諾状況を確認",reason:"合格日あり・承諾日は未登録です。",active:true};
 if(tone==="accepted")return {label:"合格日を確認",reason:"進捗は合格ですが、合格日は未登録です。",active:true};
 if(value(17))return {label:"合否回答を確認",reason:value(18)?`回答期日 ${value(18)}`:"C面談実施日あり・合格日は未登録です。",active:true};
 if(tone==="interviewed")return {label:"C面談の実施日を確認",reason:"進捗は面談実施ですが、実施日は未登録です。",active:true};
 if(hasDate(value(10)))return {label:value(10)<today?"C面談の実施状況を確認":"C面談に向けて準備",reason:"面談予定あり・実施日は未登録です。",active:true};
 if(value(9)||value(8)||tone==="proposed"||tone==="scheduled")return {label:"C面談の予定日時を確認",reason:"面談予定日時は未登録です。",active:true};
 if(!value(1))return {label:"候補者面談の実施日を確認",reason:"面談実施日は未登録です。",active:true};
 if(!value(2))return {label:"提案先を確認",reason:"会社名はまだ登録されていません。",active:true};
 return {label:"企業への提案状況を確認",reason:"提案完了日は未登録です。",active:true};
}

function nextAppointment(records:CandidateRecord[]) { return candidateAppointments(records,businessToday())[0]; }

export function CandidateDirectory(props:DirectoryProps) {
 const {groups,players,busy,intakeEnabled,canDelete,onEdit,onBasic,onDelete,onChat}=props;
 const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
 const id=useId();
 function toggle(key:string){setExpanded(previous=>{const next=new Set(previous);if(next.has(key))next.delete(key);else next.add(key);return next;});}
 function basicButton(record:CandidateRecord){return <button className="candidate-basic-button" disabled={busy} onClick={()=>onBasic(record.recordId)} aria-label={`${record.candidateName}の${valueAt(record,2)||"未提案の記録"}の基本情報・紹介文`}>基本情報・紹介文</button>;}
 function history(group:CandidateGroup){return <div className="candidate-history-list">
  <p className="candidate-history-help">経歴・希望条件・紹介文は「基本情報」、企業ごとの進捗・予定・成果は「進捗・実績を編集」から確認できます。複数の記録がある場合は対象の会社を選んでください。</p>
  {group.records.map(record=><article className="candidate-history-record" key={record.recordId}>
   <header><div><strong>{valueAt(record,2)||"未提案"}</strong><small>{valueAt(record,6)||"ポジション未設定"} · 管理行 {record.row}</small></div><span className={`stage-tag status-${statusTone(valueAt(record,7))}`} title={valueAt(record,7)}>{valueAt(record,7)||"進捗未設定"}</span></header>
   <div className="candidate-history-next"><span>次の確認</span><strong>{candidateFollowUp(record).label}</strong><small>{candidateFollowUp(record).reason}</small></div>
   <div className="candidate-history-achievements"><strong>成果の日付</strong><dl className="candidate-history-dates">{activityInputMetrics.map(metric=><div key={metric.stage} className={valueAt(record,milestoneColumns[metric.stage])?"is-recorded":""}><dt>{metric.label}</dt><dd>{valueAt(record,milestoneColumns[metric.stage])||"未登録"}</dd></div>)}</dl></div>
   {(valueAt(record,10)||valueAt(record,18)||valueAt(record,23))&&<p className="candidate-history-schedule"><CalendarDays size={14}/>{valueAt(record,10)&&<span>C面談予定：{valueAt(record,10)} {valueAt(record,11)}</span>}{valueAt(record,18)&&<span>合否回答期日：{valueAt(record,18)} {valueAt(record,20)}</span>}{valueAt(record,23)&&<span>稼働開始予定：{valueAt(record,23)}</span>}</p>}
   <footer>{intakeEnabled&&basicButton(record)}<button className="text-button" disabled={busy} aria-label={`${group.name}の${valueAt(record,2)||"未提案の記録"}（管理行${record.row}）の進捗・実績を編集`} onClick={()=>onEdit(record.recordId)}>進捗・実績を編集<ChevronRight size={15}/></button>{canDelete&&<button className="candidate-delete-button" disabled={busy} aria-label={`${group.name}の${valueAt(record,2)||"未提案の記録"}（管理行${record.row}）の削除を確認`} onClick={()=>onDelete(record.recordId)}><Trash2 size={14}/>この記録を削除…</button>}</footer>
  </article>)}
 </div>;}
 function summary(group:CandidateGroup){
  const companies=unique(group.records.map(record=>valueAt(record,2)));
  const progress=unique(group.records.map(record=>valueAt(record,7)));
  const appointment=nextAppointment(group.records);
  const interviews=group.records.map(record=>valueAt(record,1)).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  const nextRecord=group.records.find(record=>record.recordId===appointment?.recordId)||group.records.find(record=>candidateFollowUp(record).active)||group.records[0];
  return {companies,progress,appointment,nextRecord,interview:interviews.at(-1),owner:players.find(player=>player.id===group.playerId)?.name||valueAt(group.records[0],4)||"担当未設定"};
 }
 function followUp(record:CandidateRecord){const next=candidateFollowUp(record);return <button type="button" className={`candidate-follow-up${next.active?"":" is-complete"}`} disabled={busy} aria-label={`${record.candidateName}の${valueAt(record,2)||"未提案の記録"}：${next.label}`} onClick={()=>onEdit(record.recordId)}><span>{next.label}</span><ArrowRight size={13}/></button>;}
 function expandButton(group:CandidateGroup,controls:string){return <button type="button" className="candidate-history-toggle" aria-label={`${group.name||"氏名未設定"}の提案・履歴 ${group.records.length}件`} aria-expanded={expanded.has(group.key)} aria-controls={controls} onClick={()=>toggle(group.key)}>{expanded.has(group.key)?<ChevronDown size={17}/>:<ChevronRight size={17}/>}提案・履歴 <span>{group.records.length}件</span></button>;}
 function chatButton(group:CandidateGroup){return onChat&&<button type="button" className="candidate-chat-trigger" title={`${group.name||"氏名未設定"}についてAIに相談`} aria-label={`${group.name||"氏名未設定"}についてAIに相談`} onClick={()=>onChat(group.key)}><MessageCircle size={15}/><span>AIに相談</span></button>;}
 function progressTags(progress:string[]){return <div className="candidate-directory-statuses">{progress.slice(0,2).map(status=><span key={status} title={status} className={`stage-tag status-${statusTone(status)}`}>{status}</span>)}{progress.length>2&&<small>ほか{progress.length-2}種類</small>}{!progress.length&&<small>進捗未設定</small>}</div>;}
 return <>
  <div className="management-table-scroll candidate-desktop-list"><table className="candidate-table candidate-directory-table"><thead><tr><th scope="col">候補者・担当</th><th scope="col">提案先</th><th scope="col">企業ごとの進捗</th><th scope="col">次の予定・確認</th><th scope="col">相談・提案履歴</th></tr></thead><tbody>{groups.map((group,index)=>{
   const info=summary(group),controls=`${id}-desktop-${index}`,open=expanded.has(group.key);
   return <Fragment key={group.key}><tr className={open?"candidate-directory-row is-open":"candidate-directory-row"}>
    <td><div className="candidate-name-line"><strong>{group.name||"氏名未設定"}</strong>{intakeEnabled&&group.records.length===1&&basicButton(group.records[0])}</div><small>{info.owner}{!group.playerId&&" · 対応未設定"}</small>{info.interview&&<small>最終面談 {info.interview}</small>}</td>
    <td><div className="candidate-directory-companies">{info.companies.slice(0,2).map(company=><span key={company}>{company}</span>)}{!info.companies.length&&<span>未提案</span>}</div>{info.companies.length>2&&<small>ほか{info.companies.length-2}社</small>}<small>{info.companies.length}社 · {group.records.length}件の記録</small></td>
    <td>{progressTags(info.progress)}</td><td>{info.appointment?<><span className="candidate-appointment-date">{info.appointment.date}</span><small>{info.appointment.label} {info.appointment.time}</small>{info.appointment.overdue&&<small className="candidate-appointment-overdue">予定日経過・要確認</small>}</>:<small>予定なし</small>}{followUp(info.nextRecord)}{group.records.length>1&&<small>{valueAt(info.nextRecord,2)||"未提案の記録"} · ほかは履歴で確認</small>}</td>
    <td><div className="candidate-directory-actions">{chatButton(group)}{expandButton(group,controls)}</div></td></tr>{open&&<tr className="candidate-directory-detail"><td colSpan={5}><div id={controls}>{history(group)}</div></td></tr>}</Fragment>;
  })}</tbody></table></div>
  <div className="candidate-mobile-list candidate-directory-mobile">{groups.map((group,index)=>{
   const info=summary(group),controls=`${id}-mobile-${index}`,open=expanded.has(group.key);
   return <article className="candidate-mobile-card" key={group.key}><header><div><strong>{group.name||"氏名未設定"}</strong><small>{info.owner}{!group.playerId&&" · 対応未設定"}</small></div><span className="candidate-record-count">{group.records.length}件の記録</span></header>
    <p>{info.companies.slice(0,2).join(" / ")||"未提案"}{info.companies.length>2&&` ほか${info.companies.length-2}社`}{info.interview&&<small>最終面談 {info.interview}</small>}</p>{progressTags(info.progress)}
    <div className="candidate-mobile-next">{info.appointment?<p>次の予定：{info.appointment.date} {info.appointment.time}<small>{info.appointment.label}{info.appointment.company&&` · ${info.appointment.company}`}</small>{info.appointment.overdue&&<small className="candidate-appointment-overdue">予定日経過・要確認</small>}</p>:<small>予定なし</small>}{followUp(info.nextRecord)}{group.records.length>1&&<small>{valueAt(info.nextRecord,2)||"未提案の記録"} · ほかは履歴で確認</small>}</div>
    {intakeEnabled&&group.records.length===1&&<div>{basicButton(group.records[0])}</div>}<div className="candidate-directory-mobile-actions">{chatButton(group)}{expandButton(group,controls)}</div>
    {open&&<div id={controls}>{history(group)}</div>}
   </article>;
  })}</div>
 </>;
}
