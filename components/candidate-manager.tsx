"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Trash2, Plus, Search, Pencil, Minus, Undo2, ChevronRight, CalendarDays, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { positions, statuses, stages, type Player, type Stage } from "@/lib/node-data";
import { matchingFields, recordDateColumns, recordTimeColumns, milestoneColumns, correctionRecords, valueAt } from "@/lib/management-data";
import { performanceMetrics, stageLabel, activityInputMetrics } from "@/lib/performance-metrics";
import { businessToday, isUncertainWrite, type CandidateRecord, type MutationResult, type SheetPlayer, type DeletedCandidate, type ClientEntry, type InterviewReview } from "@/lib/sheets-client";
import { mutationDateErrors } from "@/lib/save-correction";
import "@/app/management.css";
import type { CandidateAiConnection } from "@/lib/writing-ai";
import { InterviewIntakeEditor } from "@/components/candidate-intake";
import { blankInterviewFields, linkedCandidateProfile, type CandidateProfile, type InterviewFields } from "@/lib/candidate-intake";
import { ClientNameInput, ClientMaster } from "@/components/client-selector";
import { groupCandidates, filterCandidateGroups, sortCandidateGroups, candidateFilterCount, candidateSortFields, type CandidateGroupFilter, type CandidateGroupSort } from "@/lib/candidate-groups";
import { CandidateListControls } from "./candidate-list-controls";
import { CandidateDirectory } from "@/components/candidate-directory";
import { CandidateChat } from "@/components/candidate-chat";
import { useUnsavedChangesWarning } from "./unsaved-work";
export type ManagementMutation = (action:string,payload:unknown,id:string)=>Promise<MutationResult>;
export type BackgroundManagementSave = (action:string,payload:unknown,operationId:string,label?:string)=>void|Promise<void>;
export type CorrectionTarget = {owner:string;stage:Stage;period:string};
const emptyCandidateFilters=():CandidateGroupFilter=>({owner:"all",status:"all",statuses:[],search:"",appointment:"all",profile:"all"});

export function useManagementSave(onSave:ManagementMutation,live=true,backgroundSave?:BackgroundManagementSave) {
 const pending=useRef<{action:string;payload:unknown;id:string}|null>(null);
 const running=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[uncertain,setUncertain]=useState(false),[undo,setUndo]=useState<string|null>(null);
 async function save(action:string,payload:unknown,label?:string) {
  if(running.current)return false;
  if(backgroundSave){
   running.current=true;setBusy(true);setError("");
   try{await backgroundSave(action,payload,crypto.randomUUID(),label);pending.current=null;setUncertain(false);return true;}
   catch(e){setError(e instanceof Error?e.message:"保存を開始できませんでした。");return false;}
   finally{running.current=false;setBusy(false);}
  }
  pending.current??={action,payload,id:crypto.randomUUID()};running.current=true;setBusy(true);setError("");
  try{const job=pending.current,result=await onSave(job.action,job.payload,job.id);pending.current=null;setUncertain(false);if(result.changeId)setUndo(result.changeId);toast.success(action==="restoreChange"?"変更を元に戻しました":live?"スプレッドシートに反映しました":"サンプルに反映しました");return true;}
  catch(e){const ambiguous=isUncertainWrite(e);setUncertain(ambiguous);if(!ambiguous)pending.current=null;setError(e instanceof Error?e.message:"保存できませんでした。");return false;}
  finally{running.current=false;setBusy(false);}
 }
 return {save,busy,error,uncertain,undo,restore:async()=>{if(undo&&await save("restoreChange",{changeId:undo}))setUndo(null);}};
}

export function CandidateManager({records,players,admin,busy,canWrite,live,onSave,backgroundSave,initialRecordId,initialRecordRequest,createRequested=false,onCreateRequestHandled,canDelete=false,deletedCandidates=[],intakeEnabled=false,profiles=[],clients=[],reviews=[],ai,onDirtyChange}:{records:CandidateRecord[];players:SheetPlayer[];admin:boolean;busy:boolean;canWrite:boolean;live:boolean;onSave:ManagementMutation;backgroundSave?:BackgroundManagementSave;initialRecordId?:string|null;initialRecordRequest?:number;createRequested?:boolean;onCreateRequestHandled?:()=>void;canDelete?:boolean;deletedCandidates?:DeletedCandidate[];intakeEnabled?:boolean;profiles?:CandidateProfile[];clients?:ClientEntry[];reviews?:InterviewReview[];ai?:CandidateAiConnection;onDirtyChange?:(dirty:boolean)=>void}) {
 const [clientDirty,setClientDirty]=useState(false);
 useEffect(()=>{onDirtyChange?.(clientDirty);},[clientDirty,onDirtyChange]);
 useEffect(()=>()=>onDirtyChange?.(false),[onDirtyChange]);
 const [search,setSearch]=useState(""),[filter,setFilter]=useState<CandidateGroupFilter>(emptyCandidateFilters),[page,setPage]=useState(1),[selected,setSelected]=useState<string|null>(initialRecordId||null),[create,setCreate]=useState(false);
 const [deleting,setDeleting]=useState<string|null>(null),[showDeleted,setShowDeleted]=useState(false),[showClients,setShowClients]=useState(false),[basicRecord,setBasicRecord]=useState<string|null>(null);
 const [chatKey,setChatKey]=useState<string|null>(null),[chatOpen,setChatOpen]=useState(false);
 const [sort,setSort]=useState<CandidateGroupSort>({field:"interview",direction:"desc"}),[density,setDensity]=useState<"normal"|"compact">(()=>{try{return localStorage.getItem("node-list-density")==="compact"?"compact":"normal";}catch{return "normal";}});
 const pageSize=density==="compact"?30:15;
 useEffect(()=>{try{localStorage.setItem("node-list-density",density);}catch{}setPage(1);},[density]);
 const save=useManagementSave(onSave,live,backgroundSave);
 const createRequestOpened=useRef(false);
 useEffect(()=>{if(!createRequested){createRequestOpened.current=false;return;}if(!createRequestOpened.current&&canWrite&&!busy&&!save.busy){createRequestOpened.current=true;setCreate(true);onCreateRequestHandled?.();}},[createRequested,canWrite,busy,save.busy,onCreateRequestHandled]);
 useEffect(()=>{if(initialRecordId)setSelected(initialRecordId);},[initialRecordId,initialRecordRequest]);
 const today=businessToday(),filterWithSearch={...filter,search};
 const groups=groupCandidates(records,"interview-desc"),filtered=sortCandidateGroups(filterCandidateGroups(groups,filterWithSearch,today),sort,today),chatGroup=groups.find(group=>group.key===chatKey);
 const rows=filtered.slice((page-1)*pageSize,page*pageSize),record=records.find(r=>r.recordId===selected);
 const hasFilters=!!search.trim()||candidateFilterCount(filter)>0;
 const clearFilters=()=>{setSearch("");setFilter(emptyCandidateFilters());setPage(1);};
 useEffect(()=>setPage(1),[search,filter,sort]);
 useEffect(()=>setPage(p=>Math.min(p,Math.max(1,Math.ceil(filtered.length/pageSize)))),[filtered.length,pageSize]);
 return <section className={`candidate-management candidate-density-${density}`}>
  <div className="management-intro"><div><h2>候補者リスト</h2><p>人物ごとに面談内容を整理し、企業ごとの提案から稼働開始までを確認します。</p></div><button className="primary-button" disabled={busy||save.busy||!canWrite} onClick={()=>setCreate(true)}><Plus size={17}/>候補者を登録</button></div>
  <div className="candidate-view-tabs" aria-label="候補者管理の表示"><button aria-pressed={!showDeleted&&!showClients} className={!showDeleted&&!showClients?"selected":""} onClick={()=>{setShowDeleted(false);setShowClients(false);}}>候補者 <span>{groups.length}</span></button>{canDelete&&<button aria-pressed={showDeleted} className={showDeleted?"selected":""} onClick={()=>{setShowDeleted(true);setShowClients(false);}}><Trash2 size={14}/>削除済み・復元 <span>{deletedCandidates.length}</span></button>}{intakeEnabled&&<button aria-pressed={showClients} className={showClients?"selected":""} onClick={()=>{setShowClients(true);setShowDeleted(false);}}>取引先の管理</button>}</div>
  {intakeEnabled&&<div hidden={!showClients}><ClientMaster clients={clients} knownNames={records.map(r=>valueAt(r,2))} busy={busy||save.busy||!canWrite} onDirtyChange={setClientDirty} onSave={payload=>save.save("saveClient",payload,"取引先マスターを保存")}/></div>}
  {showClients?null:!showDeleted?<div className="card"><div className="management-filters"><label className="management-search"><Search size={17}/><input aria-label="候補者・会社・メモを検索" placeholder="候補者名、会社、メモで検索" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" aria-label="検索語をクリア" className="candidate-search-clear" onClick={()=>setSearch("")}><X size={15}/></button>}</label><CandidateListControls filter={filterWithSearch} onFilterChange={setFilter} sort={sort} onSortChange={setSort} players={players} statuses={[...new Set(["",...statuses,...records.map(r=>valueAt(r,7))])]} companies={records.map(r=>valueAt(r,2))} admin={admin} intakeEnabled={intakeEnabled}/></div>
  <div className="management-list-caption"><div className="candidate-result-count" role="status" aria-live="polite"><strong>{filtered.length.toLocaleString()}名{hasFilters&&` / 全${groups.length.toLocaleString()}名`} <span className="candidate-directory-total">· {filtered.reduce((total,group)=>total+group.records.length,0).toLocaleString()}件の提案・記録</span></strong>{hasFilters&&<button type="button" className="text-button" onClick={clearFilters}><X size={13}/>条件をクリア</button>}</div><div className="candidate-list-preferences"><span className="candidate-sort-summary">{candidateSortFields.find(option=>option.value===sort.field)?.label} · {sort.direction==="asc"?"昇順":"降順"}</span><label>行の間隔<select aria-label="候補者一覧の行の間隔" value={density} onChange={e=>{if(e.target.value==="normal"||e.target.value==="compact")setDensity(e.target.value);}}><option value="normal">標準</option><option value="compact">コンパクト</option></select></label></div></div>
  {hasFilters&&!!filtered.length&&<p className="candidate-filter-note">条件に合う記録がある候補者を表示しています。提案・履歴を開くと、その方の他の提案も確認できます。</p>}
  <CandidateDirectory groups={rows} players={players} busy={busy||save.busy} intakeEnabled={intakeEnabled} canDelete={canDelete&&canWrite} onEdit={setSelected} onBasic={setBasicRecord} onDelete={setDeleting} onChat={key=>{setChatKey(key);setChatOpen(true);}}/>
  {!filtered.length&&<div className="empty-state candidate-empty-state"><Search size={28}/><h3>{groups.length?"条件に合う候補者が見つかりません":"候補者を登録して、提案の進捗を管理しましょう"}</h3><p>{groups.length?"氏名の一部や会社名で検索するか、フィルターの条件を変えてください。":"まず氏名と担当者を登録します。面談内容・提案先・成果の日付は後から追加できます。"}</p>{hasFilters?<button type="button" className="secondary-button" onClick={clearFilters}>すべての候補者を表示</button>:<button type="button" className="primary-button" disabled={busy||!canWrite} onClick={()=>setCreate(true)}><Plus size={16}/>最初の候補者を登録</button>}</div>}
  <div className="pagination"><span>{filtered.length?`${(page-1)*pageSize+1}〜${Math.min(page*pageSize,filtered.length)} / ${filtered.length}名`:"0名"}</span><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>前へ</button><button disabled={page*pageSize>=filtered.length} onClick={()=>setPage(p=>p+1)}>次へ</button></div></div>:<div className="card candidate-deleted-list"><h3>削除済みの候補者・提案</h3><p className="panel-note">間違えて削除した候補者を復元できます。登録済みの成果と集計も元に戻ります。</p>{!deletedCandidates.length&&<p className="empty-state">削除済みの候補者はいません。</p>}{deletedCandidates.map(item=><article key={item.changeId}><div><strong>{item.candidateName}</strong><span>{item.companies.join('・')||'未提案'} · {item.recordCount}件</span><small>{new Date(item.deletedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} 削除 · {players.find(p=>p.id===item.playerId)?.name||'担当未設定'}</small></div><button className="secondary-button" disabled={busy||save.busy||!canWrite} onClick={()=>void save.save('restoreChange',{changeId:item.changeId},`${item.candidateName}の削除を元に戻す`)}><Undo2 size={15}/>元に戻す</button></article>)}</div>}
  {save.undo&&<div className="management-undo"><span>直前の情報修正を取り消せます。</span><button className="text-button" disabled={save.busy||busy} onClick={()=>void save.restore()}><Undo2 size={15}/>元に戻す</button></div>}{save.error&&<p className="form-error" role="alert">{save.error}</p>}
  {record&&<RecordEditor key={record.recordId} record={record} players={players} admin={admin} disabled={!canWrite||busy} live={live} save={save} onClose={()=>setSelected(null)}/>}
  {deleting&&records.find(r=>r.recordId===deleting)&&<DeleteCandidateDialog record={records.find(r=>r.recordId===deleting)!} records={records} players={players} save={save} busy={busy} onClose={()=>setDeleting(null)}/>}
  {basicRecord&&records.find(r=>r.recordId===basicRecord)&&<BasicInfoDialog ai={ai?{...ai,identityKey:`${ai.identityKey}:${basicRecord}`}:undefined} key={basicRecord} record={records.find(r=>r.recordId===basicRecord)!} profile={linkedCandidateProfile(profiles,records.find(r=>r.recordId===basicRecord))} save={save} disabled={busy||!canWrite} onClose={()=>setBasicRecord(null)}/>}
  {create&&<CreateCandidate clients={clients} knownNames={records.map(r=>valueAt(r,2))} records={records} players={players} save={save} onClose={()=>setCreate(false)} onExisting={recordId=>{setCreate(false);setSelected(recordId);}}/>}
  {chatGroup&&<CandidateChat group={chatGroup} profiles={profiles} reviews={reviews} identityKey={ai?.identityKey||`${live?"live":"demo"}:${admin?"admin":"player"}`} open={chatOpen} onClose={()=>setChatOpen(false)}/>}
 </section>;
}

function BasicInfoDialog({record,profile,save,disabled,onClose,ai}:{record:CandidateRecord;profile?:CandidateProfile;save:ReturnType<typeof useManagementSave>;disabled:boolean;onClose:()=>void;ai?:CandidateAiConnection}) {
 const [fields,setFields]=useState<InterviewFields>(()=>profile?.fields||blankInterviewFields()),[introduction,setIntroduction]=useState(profile?.introduction||'');
 const [discarding,setDiscarding]=useState(false);
 const baseline=useRef({rowVersion:record.rowVersion,profileVersion:profile?.version||'',fields:JSON.stringify(profile?.fields||blankInterviewFields()),introduction:profile?.introduction||''});
 const hasChanges=JSON.stringify(fields)!==baseline.current.fields||introduction!==baseline.current.introduction;
 useUnsavedChangesWarning(hasChanges);
 function requestClose(){if(save.busy||save.uncertain)return;if(hasChanges)setDiscarding(true);else onClose();}
 return <Dialog open onOpenChange={open=>{if(!open)requestClose();}}><DialogContent presentation="panel" className="intake-dialog"><DialogHeader><DialogTitle>{record.candidateName}の基本情報・紹介文</DialogTitle><DialogDescription>本人の経歴・希望条件と、クライアントに伝える紹介文をまとめます。対象の記録：{valueAt(record,2)||"提案先未登録"}。紹介文は送る前に内容を確認してください。</DialogDescription></DialogHeader><form onSubmit={async e=>{e.preventDefault();if(disabled||save.busy||(!hasChanges&&!save.uncertain))return;if(await save.save('saveCandidateProfile',{recordId:record.recordId,rowVersion:baseline.current.rowVersion,profileVersion:baseline.current.profileVersion,fields,introduction},`${record.candidateName} · 基本情報`))onClose();}}><fieldset disabled={disabled||save.busy||save.uncertain}><InterviewIntakeEditor ai={ai} memo={valueAt(record,13)} candidateName={record.candidateName} fields={fields} onFieldsChange={setFields} introduction={introduction} onIntroductionChange={setIntroduction} disabled={disabled||save.busy||save.uncertain}/></fieldset>{save.error&&<p role="alert" className="form-error">{save.error}</p>}<div className="form-actions"><span className="record-unsaved-count" role="status">{hasChanges?"基本情報の変更が未保存です":"変更はありません"}</span><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={requestClose}>閉じる</button><button className="primary-button" disabled={disabled||save.busy||(!hasChanges&&!save.uncertain)}>{save.busy?'保存中…':save.uncertain?'同じ内容で再試行':'基本情報を保存'}</button></div></form>{discarding&&<div className="achievement-confirm record-discard-confirm" role="alert"><strong>基本情報に未保存の変更があります。</strong><p>閉じると、入力中の面談内容や紹介文は保存されません。</p><div><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={()=>setDiscarding(false)}>編集を続ける</button><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={()=>{if(!save.busy&&!save.uncertain)onClose();}}>変更を破棄して閉じる</button></div></div>}</DialogContent></Dialog>;
}

function RecordEditor({record:initialRecord,players,admin,disabled,live,save,onClose}:{record:CandidateRecord;players:SheetPlayer[];admin:boolean;disabled:boolean;live:boolean;save:ReturnType<typeof useManagementSave>;onClose:()=>void}) {
 const record=useRef(initialRecord).current;
 const id=useId(),today=businessToday();
 const activeOwnerNames=players.filter(player=>player.active!==false).flatMap(player=>player.sheetNames?.length?player.sheetNames:[player.id]);
 const stoppedOwner=players.find(player=>player.id===record.playerId)?.active===false;
 const [changes,setChanges]=useState<Record<string,string>>({});
 const [cancelStage,setCancelStage]=useState<Stage|null>(null);
 const [discarding,setDiscarding]=useState(false);
 const value=(col:number)=>changes[col]??valueAt(record,col);
 const set=(col:number,v:string)=>setChanges(prev=>({...prev,[col]:v}));
 const locked=disabled||save.busy||save.uncertain;
 const dateErrors=mutationDateErrors("updateRecord",{changes}),invalidOwner=!save.uncertain&&!!changes[4]&&changes[4]!==valueAt(record,4)&&!activeOwnerNames.includes(changes[4]),invalid=Object.keys(dateErrors).length>0||invalidOwner;
 const hasChanges=Object.entries(changes).some(([col,v])=>v!==valueAt(record,Number(col)));
 const changedCount=Object.entries(changes).filter(([col,v])=>v!==valueAt(record,Number(col))).length;
 useUnsavedChangesWarning(hasChanges);
 function requestClose(){if(save.busy||save.uncertain)return;if(hasChanges)setDiscarding(true);else onClose();}
 const reset=(col:number)=>setChanges(previous=>{const next={...previous};delete next[col];return next;});
 function fields(columns:number[]){return <div className="record-field-grid">{columns.map(col=>{const label=matchingFields[col-1],v=value(col),readonly=record.formulaColumns.includes(col)||col===4&&!admin,error=dateErrors[col],inputId=`${id}-field-${col}`;
  const options=typeof record.values[col-1]==="boolean"?["true","false"]:col===4?activeOwnerNames:col===5?["新規","再販（離脱等）"]:col===6?positions:col===7?statuses:col===12?["Aヨミ","Bヨミ","Cヨミ","Dヨミ"]:null;
  return <label key={col} htmlFor={inputId} className={[13,19].includes(col)?"wide":""}><span>{label}{readonly&&<small>{record.formulaColumns.includes(col)?"自動計算・閲覧のみ":"担当者の変更は管理者のみ"}</small>}</span>{readonly?<div id={inputId} className="readonly-field">{v||"—"}{col===4&&stoppedOwner&&"（利用停止中）"}</div>:options?<select id={inputId} aria-label={label} value={v} onChange={e=>set(col,e.target.value)}><option value="">未設定</option>{[...new Set([...options,...(v?[v]:[])])].map(o=><option key={o} disabled={col===4&&!activeOwnerNames.includes(o)}>{o}{col===4&&!activeOwnerNames.includes(o)?stoppedOwner?"（利用停止中・現在の担当）":"（変更先には選択できません）":""}</option>)}</select>:[13,19].includes(col)?<textarea id={inputId} aria-label={label} rows={3} value={v} onChange={e=>set(col,e.target.value)} maxLength={12000}/>:<input id={inputId} aria-label={label} aria-invalid={!!error} aria-describedby={error?`${inputId}-error`:undefined} type={recordDateColumns.includes(col)&&(!v||/^\d{4}-\d{2}-\d{2}$/.test(v))?"date":recordTimeColumns.includes(col)&&(!v||/^\d{2}:\d{2}$/.test(v))?"time":"text"} value={v} maxLength={12000} onChange={e=>set(col,e.target.value)}/>} {error&&<small id={`${inputId}-error`} className="record-milestone-error">{error}</small>}</label>;
 })}</div>;}
 async function commit(){if(disabled||save.busy||invalid)return;const dirty=Object.fromEntries(Object.entries(changes).filter(([k,v])=>v!==valueAt(record,Number(k))).map(([k,v])=>[k,typeof record.values[Number(k)-1]==="boolean"?v==="true":v]));if(!Object.keys(dirty).length&&!save.uncertain)return;if(await save.save("updateRecord",{recordId:record.recordId,rowVersion:record.rowVersion,changes:dirty},`${record.candidateName}の進捗を保存`))onClose();}
 return <Dialog open onOpenChange={open=>{if(!open)requestClose();}}><DialogContent presentation="panel" className="management-dialog"><DialogHeader><DialogTitle>{record.candidateName} · 進捗・実績</DialogTitle><DialogDescription>{valueAt(record,2)||"提案先未登録"}への提案を編集します。予定日は予定欄、実施済みの日付は成果欄に入力してください。{!live&&"サンプルの編集です。"}</DialogDescription></DialogHeader>
  <form noValidate onSubmit={e=>{e.preventDefault();void commit();}}><fieldset disabled={locked}>
  <section className="record-purpose-section"><header><h3>実施済みの成果</h3><p>実施した日を登録すると実績に反映されます。予定日とは分けて入力してください。</p></header><div className="record-milestone-toolbar"><p className="record-milestone-help">候補者面談は同じ日・担当・候補者で1件、提案以降は企業ごとの記録です。{hasChanges&&"成果の取り消しは、入力中の変更を保存するか戻してから行えます。"}</p><button type="submit" className="primary-button" aria-label="実績カードの変更を保存" disabled={save.busy||disabled||invalid||(!hasChanges&&!save.uncertain)}><Pencil size={15}/>{save.busy?"保存中…":save.uncertain?"同じ内容で再試行":"変更を保存"}</button></div>
  <div className="record-milestone-summary">{activityInputMetrics.map(m=>{
   const col=milestoneColumns[m.stage],v=value(col),original=valueAt(record,col),edited=v!==original,readonly=record.formulaColumns.includes(col),error=dateErrors[col],inputId=`${id}-milestone-${col}`;
   return <div key={m.stage} className={edited?"is-edited":""}>
    <label htmlFor={inputId}><span>{m.label}</span><input id={inputId} aria-label={`${m.label}の日付`} aria-invalid={!!error} aria-describedby={error?`${inputId}-error`:undefined} type="date" max={today} value={/^\d{4}-\d{2}-\d{2}$/.test(v)?v:""} disabled={readonly||locked} onChange={e=>set(col,e.target.value)}/></label>
    {error?<small id={`${inputId}-error`} className="record-milestone-error">{error}</small>:readonly?<small>自動計算・閲覧のみ</small>:v&&!/^\d{4}-\d{2}-\d{2}$/.test(v)?<small>現在の値：{v}</small>:<small>{edited?"変更あり・未保存":v?"登録済み":"未登録"}</small>}
    <button type="button" className="text-button" disabled={locked||readonly||!edited&&(!original||hasChanges)} onClick={()=>edited?reset(col):setCancelStage(m.stage)}>{edited?<Undo2 size={14}/>:<Minus size={14}/>} {edited?"入力を戻す":"取り消す"}</button>
   </div>;
  })}</div></section>
  <section className="record-purpose-section"><header><h3>今後の予定・回答期日</h3><p>C面談や稼働開始の予定を管理します。予定日の入力だけでは実績に計上されません。</p></header>{fields([10,11,18,20,23])}</section>
  <section className="record-purpose-section"><header><h3>提案先・担当・進捗</h3><p>この企業への提案条件と、現在の対応状況を整理します。</p></header>{fields([2,3,4,5,6,7,12])}</section>
  <section className="record-purpose-section"><header><h3>面談の調整・連絡メモ</h3><p>参加意思の確認や合否回答など、次の担当者に引き継ぐ内容を残します。</p></header>{fields([14,15,16,13,19])}</section>
  <section className="record-purpose-section"><header><h3>稼働後の状況</h3><p>離脱の予定と、実際に離脱した日を分けて管理します。</p></header>{fields([25,26])}</section>
  <details className="record-date-details"><summary>成果日を項目名で確認・修正</summary><p className="record-milestone-help">上の成果カードと同じ日付です。どちらで変更しても、まとめて保存されます。</p>{fields([1,8,9,17,21,22,24])}</details>
  <p className="panel-note">紹介元：{record.source||"未登録"} · 管理行 {record.row} · 数式は保護されます。</p></fieldset>{invalid&&<p className="form-error" role="alert">{invalidOwner?"変更先の担当者は利用できません。有効な担当者を選び直してください。":Object.values(dateErrors)[0]}</p>}{save.error&&<p className="form-error" role="alert">{save.error}</p>}<div className="form-actions"><span className="record-unsaved-count" role="status">{hasChanges?`${changedCount}項目の変更が未保存`:"変更はありません"}</span><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={requestClose}>閉じる</button><button className="primary-button" disabled={save.busy||disabled||invalid||(!hasChanges&&!save.uncertain)}><Pencil size={16}/>{save.busy?"保存中…":save.uncertain?"同じ内容で再試行":"変更を保存"}</button></div></form>
  {discarding&&<div className="achievement-confirm record-discard-confirm" role="alert"><strong>未保存の変更が{changedCount}項目あります。</strong><p>閉じると、入力中の変更は保存されません。</p><div><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={()=>setDiscarding(false)}>編集を続ける</button><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={()=>{if(!save.busy&&!save.uncertain)onClose();}}>変更を破棄して閉じる</button></div></div>}
  {cancelStage&&<div className="achievement-confirm" role="alert"><strong>{stageLabel(cancelStage)}の {valueAt(record,milestoneColumns[cancelStage])} を取り消します。</strong><p>候補者情報と他の工程は残ります。{cancelStage==="候補者面談"&&"同じ候補者・担当・日付の面談を全提案行から解除します。"}</p><div><button className="secondary-button" disabled={save.busy||save.uncertain} onClick={()=>setCancelStage(null)}>戻る</button><button className="primary-button" disabled={save.busy||disabled||hasChanges} onClick={async()=>{if(hasChanges)return;if(await save.save("cancelAchievement",{recordId:record.recordId,rowVersion:record.rowVersion,stage:cancelStage},`${record.candidateName}の${stageLabel(cancelStage)}を取り消す`))onClose();}}>{save.busy?"処理中…":save.uncertain?"同じ取り消しを再試行":"この成果を取り消す"}</button></div></div>}
 </DialogContent></Dialog>;
}
function DeleteCandidateDialog({record,records,players,save,busy,onClose}:{record:CandidateRecord;records:CandidateRecord[];players:SheetPlayer[];save:ReturnType<typeof useManagementSave>;busy:boolean;onClose:()=>void}) {
 const [scope,setScope]=useState<'record'|'candidate'>('record');
 const related=records.filter(r=>r.playerId===record.playerId&&r.candidateName===record.candidateName);
 const targets=scope==='candidate'?related:[record];
 return <Dialog open onOpenChange={open=>{if(!open&&!save.busy&&!save.uncertain)onClose();}}><DialogContent className="candidate-delete-dialog"><DialogHeader><DialogTitle>{record.candidateName}の記録の削除を確認</DialogTitle><DialogDescription>下に表示した企業の記録と成果を集計から除外します。削除済み・復元から元に戻せます。</DialogDescription></DialogHeader>
 <p className="panel-note">担当：{players.find(p=>p.id===record.playerId)?.name||valueAt(record,4)||'未設定'}</p><label>削除する範囲<select aria-label="削除する範囲" value={scope} disabled={busy||save.busy||save.uncertain} onChange={e=>setScope(e.target.value as 'record'|'candidate')}><option value="record">この提案のみ（{valueAt(record,2)||'未提案'}）</option>{!!record.playerId&&related.length>1&&<option value="candidate">この担当者の同名の登録をまとめて削除（{related.length}件）</option>}</select></label>
 {scope==='candidate'&&<p className="panel-note">同姓同名の別人が含まれる可能性があります。下の会社と実績を確認してください。</p>}
 <div className="candidate-delete-targets">{targets.map(r=><article key={r.recordId}><strong>{valueAt(r,2)||'未提案'}</strong><span>{valueAt(r,7)||'進捗未設定'}</span><p>{performanceMetrics.filter(m=>/^\d{4}-\d{2}-\d{2}$/.test(valueAt(r,milestoneColumns[m.stage]))).map(m=>`${m.label} ${valueAt(r,milestoneColumns[m.stage])}`).join(' / ')||'登録済みの成果なし'}</p></article>)}</div>
 <p className="candidate-delete-notice">{targets.length}件の記録を削除します。対象の月別実績・ランキング・KPIも更新されます。{targets.length>50&&"一度に削除できるのは50件までです。範囲を「この提案のみ」に変更してください。"}</p>{save.error&&<p className="form-error" role="alert">{save.error}</p>}<div className="form-actions"><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={onClose}>キャンセル</button><button type="button" className="candidate-danger-button" disabled={busy||save.busy||targets.length>50} onClick={async()=>{if(await save.save('deleteCandidate',{recordId:record.recordId,rowVersion:record.rowVersion,scope,targets:targets.map(r=>({recordId:r.recordId,rowVersion:r.rowVersion}))},`${record.candidateName} · ${targets.length}件を削除`))onClose();}}><Trash2 size={16}/>{save.busy?'削除中…':save.uncertain?'同じ削除を再試行':`${targets.length}件の記録を削除する`}</button></div></DialogContent></Dialog>;
}

function CreateCandidate({players,save,onClose,clients,knownNames,records,onExisting}:{clients:ClientEntry[];knownNames:string[];players:Player[];records:CandidateRecord[];save:ReturnType<typeof useManagementSave>;onClose:()=>void;onExisting:(recordId:string)=>void}) {
 const id=useId();
 const activePlayers=players.filter(player=>player.active!==false);
 const [owner,setOwner]=useState(activePlayers[0]?.id||""),[name,setName]=useState(""),[company,setCompany]=useState(""),[position,setPosition]=useState("アポインター");
 const [discarding,setDiscarding]=useState(false),[pendingExisting,setPendingExisting]=useState<string|null>(null);
 const initialOwner=useRef(activePlayers[0]?.id||"");
 const ownerActive=activePlayers.some(player=>player.id===owner);
 const hasChanges=name!==""||company!==""||owner!==initialOwner.current||position!=="アポインター";
 useUnsavedChangesWarning(hasChanges);
 function requestClose(){if(save.busy||save.uncertain)return;setPendingExisting(null);if(hasChanges)setDiscarding(true);else onClose();}
 function requestExisting(recordId:string){if(save.busy||save.uncertain)return;if(hasChanges){setPendingExisting(recordId);setDiscarding(true);}else onExisting(recordId);}
 const matching=records.filter(record=>record.playerId===owner&&record.candidateName.replace(/[\s\u3000]/g,"")===name.replace(/[\s\u3000]/g,""));
 return <Dialog open onOpenChange={open=>{if(!open)requestClose();}}>
  <DialogContent presentation="panel" className="app-dialog candidate-create-dialog">
   <DialogHeader>
    <DialogTitle>候補者を登録</DialogTitle>
    <DialogDescription>まず氏名と担当者を登録します。面談前でも登録でき、提案先が決まっていなくても始められます。</DialogDescription>
   </DialogHeader>
   <form className="app-form candidate-create-form" onSubmit={async e=>{e.preventDefault();if(!ownerActive&&!save.uncertain||!name.trim()||save.busy)return;if(await save.save("createCandidate",{playerId:owner,candidateName:name.trim(),company:company.trim(),position},`${name.trim()}を登録`))onClose();}}>
    <fieldset className="candidate-create-fields" disabled={save.busy||save.uncertain}>
     <label htmlFor={`${id}-name`}>
      <span className="candidate-create-label">候補者氏名<span className="candidate-create-required">必須</span></span>
      <input id={`${id}-name`} aria-describedby={`${id}-name-help`} required maxLength={60} placeholder="例：架空太郎" autoComplete="off" value={name} onChange={e=>setName(e.target.value)}/>
      <span id={`${id}-name-help`} className="candidate-create-help">姓と名の間にスペースを入れずに入力してください。</span>
     </label>
     <div className="form-grid">
      <label htmlFor={`${id}-owner`}>担当者<select id={`${id}-owner`} value={owner} onChange={e=>setOwner(e.target.value)}>{!ownerActive&&<option value={owner} disabled>{activePlayers.length?"担当者を選び直してください":"有効な担当者がいません"}</option>}{activePlayers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label htmlFor={`${id}-position`}>ポジション<select id={`${id}-position`} value={position} onChange={e=>setPosition(e.target.value)}>{positions.map(p=><option key={p}>{p}</option>)}</select></label>
     </div>
     <ClientNameInput label="最初の提案先・会社名（任意）" value={company} onChange={setCompany} clients={clients} knownNames={knownNames}/>
     {!!name.trim()&&!!matching.length&&<div className="candidate-duplicate-note" role="status"><strong>同じ担当者に同名の登録があります。</strong><p>既存の進捗を更新する場合は、先に記録を確認してください。同姓同名の別人であれば、そのまま登録できます。</p>{matching.slice(0,3).map(record=><button key={record.recordId} type="button" className="text-button" onClick={()=>requestExisting(record.recordId)}>{valueAt(record,2)||"提案先未登録"}の記録を確認<ChevronRight size={14}/></button>)}</div>}
     <div className="candidate-registration-next"><strong>登録したら</strong><p>「基本情報・紹介文」に面談内容を記入し、「進捗・実績を編集」で予定や実施済みの日付を登録します。</p></div>
    </fieldset>
    {save.error&&<p className="form-error" role="alert">{save.error}</p>}
    <div className="form-actions">
     <button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={requestClose}>閉じる</button>
     <button type="submit" className="primary-button" disabled={save.busy||!name.trim()||!ownerActive&&!save.uncertain}>{save.busy?"登録中…":save.uncertain?"同じ内容で再試行":"候補者を登録"}</button>
    </div>
   </form>
   {discarding&&<div className="achievement-confirm record-discard-confirm" role="alert"><strong>登録前の入力があります。</strong><p>閉じると、入力中の氏名や提案先は保存されません。</p><div><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={()=>{setDiscarding(false);setPendingExisting(null);}}>入力を続ける</button><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={()=>{if(!save.busy&&!save.uncertain){if(pendingExisting)onExisting(pendingExisting);else onClose();}}}>{pendingExisting?"入力を破棄して記録を確認":"入力を破棄して閉じる"}</button></div></div>}
  </DialogContent>
 </Dialog>;
}

export function AchievementCorrection({target,records,players,onClose,onSave,backgroundSave,busy,live}:{target:CorrectionTarget;records:CandidateRecord[];players:Player[];onClose:()=>void;onSave:ManagementMutation;backgroundSave?:BackgroundManagementSave;busy:boolean;live:boolean}) {
 const candidates=correctionRecords(records,target.owner,target.stage,target.period),save=useManagementSave(onSave,live,backgroundSave);
 const [selected,setSelected]=useState<string|null>(null);
 const record=candidates.find(r=>r.recordId===selected);
 const [search,setSearch]=useState("");
 return <Dialog open onOpenChange={open=>{if(!open&&!save.busy&&!save.uncertain)onClose();}}><DialogContent className="correction-dialog"><DialogHeader><DialogTitle>{players.find(p=>p.id===target.owner)?.name} · {stageLabel(target.stage)}の修正</DialogTitle><DialogDescription>{target.period==="all"?"全期間":target.period}の登録済み成果から、取り消す候補者を選んでください。</DialogDescription></DialogHeader><label className="management-search"><Search size={17}/><input aria-label="取り消す候補者を検索" value={search} onChange={e=>setSearch(e.target.value)} placeholder="候補者名・会社名" disabled={save.busy||save.uncertain}/></label>
  <div className="correction-list">{candidates.filter(r=>`${r.candidateName} ${valueAt(r,2)}`.includes(search)).map(r=><button key={r.recordId} className={selected===r.recordId?"selected":""} disabled={save.busy||save.uncertain} onClick={()=>setSelected(r.recordId)}><span><strong>{r.candidateName}</strong><small>{valueAt(r,2)||"未提案"}</small></span><span><CalendarDays size={14}/>{valueAt(r,milestoneColumns[target.stage])}</span></button>)}{!candidates.length&&<p className="empty-state">対象の登録済み成果はありません。</p>}</div>
  {record&&<div className="achievement-confirm"><strong>{record.candidateName}の{stageLabel(target.stage)}を1件取り消します。</strong><p>候補者と他の工程は残ります。{target.stage==="候補者面談"&&"同じ面談が複数の提案に記載されている場合、その日付をまとめて解除します。"}</p></div>}{save.error&&<p className="form-error" role="alert">{save.error}</p>}{save.undo&&<button className="text-button" disabled={busy||save.busy} onClick={()=>void save.restore()}><Undo2 size={15}/>直前の取り消しを元に戻す</button>}
  <div className="form-actions"><button className="secondary-button" disabled={save.busy||save.uncertain} onClick={onClose}>閉じる</button><button className="primary-button" disabled={busy||save.busy||!record&&!save.uncertain} onClick={async()=>{if(record&&await save.save("cancelAchievement",{recordId:record.recordId,rowVersion:record.rowVersion,stage:target.stage},`${record.candidateName}の${stageLabel(target.stage)}を取り消す`)){if(backgroundSave)onClose();else setSelected(null);}}}><Minus size={16}/>{save.busy?"処理中…":save.uncertain?"同じ取り消しを再試行":"選んだ成果を取り消す"}</button></div>
 </DialogContent></Dialog>;
}
