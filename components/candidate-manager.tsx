"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Trash2, Plus, Search, Pencil, Minus, Undo2, ChevronRight, CalendarDays } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { positions, statuses, stages, type Player, type Stage } from "@/lib/node-data";
import { matchingFields, recordDateColumns, recordTimeColumns, milestoneColumns, correctionRecords, valueAt, sortCandidateRecords, statusTone, type CandidateSort } from "@/lib/management-data";
import { performanceMetrics, stageLabel, activityInputMetrics } from "@/lib/performance-metrics";
import { businessToday, isUncertainWrite, type CandidateRecord, type MutationResult, type SheetPlayer, type DeletedCandidate, type ClientEntry } from "@/lib/sheets-client";
import { mutationDateErrors } from "@/lib/save-correction";
import "@/app/management.css";
import type { CandidateAiConnection } from "@/lib/writing-ai";
import { InterviewIntakeEditor } from "@/components/candidate-intake";
import { blankInterviewFields, type CandidateProfile, type InterviewFields } from "@/lib/candidate-intake";
import { ClientNameInput, ClientMaster } from "@/components/client-selector";
export type ManagementMutation = (action:string,payload:unknown,id:string)=>Promise<MutationResult>;
export type BackgroundManagementSave = (action:string,payload:unknown,operationId:string,label?:string)=>void|Promise<void>;
export type CorrectionTarget = {owner:string;stage:Stage;period:string};

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

export function CandidateManager({records,players,admin,busy,canWrite,live,onSave,backgroundSave,initialRecordId,initialRecordRequest,canDelete=false,deletedCandidates=[],intakeEnabled=false,profiles=[],clients=[],ai}:{records:CandidateRecord[];players:SheetPlayer[];admin:boolean;busy:boolean;canWrite:boolean;live:boolean;onSave:ManagementMutation;backgroundSave?:BackgroundManagementSave;initialRecordId?:string|null;initialRecordRequest?:number;canDelete?:boolean;deletedCandidates?:DeletedCandidate[];intakeEnabled?:boolean;profiles?:CandidateProfile[];clients?:ClientEntry[];ai?:CandidateAiConnection}) {
 const [search,setSearch]=useState(""),[owner,setOwner]=useState("all"),[status,setStatus]=useState("all"),[page,setPage]=useState(1),[selected,setSelected]=useState<string|null>(initialRecordId||null),[create,setCreate]=useState(false);
 const [deleting,setDeleting]=useState<string|null>(null),[showDeleted,setShowDeleted]=useState(false),[showClients,setShowClients]=useState(false),[basicRecord,setBasicRecord]=useState<string|null>(null);
 const [sort,setSort]=useState<CandidateSort>("interview-desc"),[density,setDensity]=useState<"normal"|"compact">(()=>{try{return localStorage.getItem("node-list-density")==="compact"?"compact":"normal";}catch{return "normal";}});
 const pageSize=density==="compact"?30:15;
 useEffect(()=>{try{localStorage.setItem("node-list-density",density);}catch{}setPage(1);},[density]);
 const save=useManagementSave(onSave,live,backgroundSave);
 useEffect(()=>{if(initialRecordId)setSelected(initialRecordId);},[initialRecordId,initialRecordRequest]);
 const filtered=sortCandidateRecords(records.filter(r=>(owner==="all"||owner==="unassigned"&&!r.playerId||owner===r.playerId)&&(status==="all"||valueAt(r,7)===status)&&r.values.join(" ").toLowerCase().includes(search.toLowerCase())),sort);
 const rows=filtered.slice((page-1)*pageSize,page*pageSize),record=records.find(r=>r.recordId===selected);
 useEffect(()=>setPage(1),[search,owner,status,sort]);
 useEffect(()=>setPage(p=>Math.min(p,Math.max(1,Math.ceil(filtered.length/pageSize)))),[filtered.length,pageSize]);
 return <section className={`candidate-management candidate-density-${density}`}>
  <div className="management-intro"><div><h2>候補者・提案の管理</h2><p>全期間の候補者を表示します。日付を修正すると成果とランキングも更新されます。</p></div><button className="primary-button" disabled={busy||!canWrite} onClick={()=>setCreate(true)}><Plus size={17}/>候補者を追加</button></div>
  <div className="candidate-view-tabs"><button className={!showDeleted&&!showClients?"selected":""} onClick={()=>{setShowDeleted(false);setShowClients(false);}}>候補者・提案</button>{canDelete&&<button className={showDeleted?"selected":""} onClick={()=>{setShowDeleted(true);setShowClients(false);}}><Trash2 size={14}/>削除済み <span>{deletedCandidates.length}</span></button>}{intakeEnabled&&<button className={showClients?"selected":""} onClick={()=>{setShowClients(true);setShowDeleted(false);}}>取引先</button>}</div>
  {showClients?<ClientMaster clients={clients} knownNames={records.map(r=>valueAt(r,2))} busy={busy||save.busy||!canWrite} onSave={payload=>save.save("saveClient",payload,"取引先マスターを保存")}/>:!showDeleted?<div className="card"><div className="management-filters"><label className="management-search"><Search size={17}/><input aria-label="候補者・会社・メモを検索" placeholder="候補者名、会社、メモで検索" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="進捗の絞り込み" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">すべての進捗</option>{[...new Set([...statuses,...records.map(r=>valueAt(r,7)).filter(Boolean)])].map(s=><option key={s}>{s}</option>)}</select>{admin&&<select aria-label="候補者の担当者" value={owner} onChange={e=>setOwner(e.target.value)}><option value="all">すべての担当者</option><option value="unassigned">担当者の対応が未設定</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}</div>
  <div className="management-list-caption"><strong>{filtered.length.toLocaleString()}件の候補者・提案</strong><div className="candidate-list-preferences"><label>並び順<select aria-label="候補者の並び順" value={sort} onChange={e=>setSort(e.target.value as CandidateSort)}><option value="interview-desc">面談が新しい順</option><option value="interview-asc">面談が古い順</option><option value="registration-desc">シートの登録行が新しい順</option></select></label><label>行の間隔<select aria-label="候補者一覧の行の間隔" value={density} onChange={e=>setDensity(e.target.value as "normal"|"compact")}><option value="normal">標準</option><option value="compact">コンパクト</option></select></label></div></div>
  <div className="management-table-scroll candidate-desktop-list"><table className="candidate-table"><thead><tr><th>候補者・担当</th><th>会社・ポジション</th><th>進捗</th><th>次の予定</th><th>6項目の実績</th><th/></tr></thead><tbody>{rows.map(r=><tr key={r.recordId}><td><div className="candidate-name-line"><strong>{r.candidateName}</strong>{intakeEnabled&&<button className="candidate-basic-button" disabled={busy||save.busy} onClick={()=>setBasicRecord(r.recordId)} aria-label={`${r.candidateName}の基本情報`}>基本情報</button>}</div><small>{players.find(p=>p.id===r.playerId)?.name||valueAt(r,4)||"担当未設定"}{!r.playerId&&" · 対応未設定"}</small></td><td><strong>{valueAt(r,2)||"未提案"}</strong><small>{valueAt(r,6)||"ポジション未設定"}</small></td><td><span title={valueAt(r,7)||"未設定"} className={`stage-tag status-${statusTone(valueAt(r,7))}`}>{valueAt(r,7)||"未設定"}</span><small>{valueAt(r,12)&&`ヨミ：${valueAt(r,12)}`}</small></td><td>{valueAt(r,10)||valueAt(r,23)||"—"}<small>{valueAt(r,11)}</small></td><td><div className="candidate-milestones">{performanceMetrics.map(m=><span key={m.stage} className={valueAt(r,milestoneColumns[m.stage])?"done":""} title={`${m.label}：${valueAt(r,milestoneColumns[m.stage])||"未登録"}`}>{m.label.replace("C面談","C").replace("実施","")}</span>)}</div></td><td><button className="text-button" aria-label={`${r.candidateName}の詳細・修正`} onClick={()=>setSelected(r.recordId)}>詳細・修正<ChevronRight size={15}/></button>{canDelete&&canWrite&&<button className="candidate-delete-button" aria-label={`${r.candidateName}の削除を確認`} disabled={busy||save.busy} onClick={()=>setDeleting(r.recordId)}><Trash2 size={14}/>削除</button>}</td></tr>)}</tbody></table></div>
  <div className="candidate-mobile-list">{rows.map(r=><article className="candidate-mobile-card" key={r.recordId}><header><div><strong>{r.candidateName}</strong><small>{players.find(p=>p.id===r.playerId)?.name||valueAt(r,4)||"担当未設定"}</small></div><span title={valueAt(r,7)||"未設定"} className={`stage-tag status-${statusTone(valueAt(r,7))}`}>{valueAt(r,7)||"未設定"}</span></header><p>{valueAt(r,2)||"未提案"} · {valueAt(r,6)||"ポジション未設定"}{(valueAt(r,10)||valueAt(r,23))&&<small>次の予定：{valueAt(r,10)||valueAt(r,23)} {valueAt(r,11)}</small>}</p><div className="candidate-milestones">{performanceMetrics.map(m=><span key={m.stage} className={valueAt(r,milestoneColumns[m.stage])?"done":""}>{m.label}</span>)}</div>{intakeEnabled&&<button className="candidate-basic-button" disabled={busy||save.busy} onClick={()=>setBasicRecord(r.recordId)} aria-label={`${r.candidateName}の基本情報`}>基本情報</button>}<button className="text-button" aria-label={`${r.candidateName}の詳細・修正`} onClick={()=>setSelected(r.recordId)}>詳細・修正<ChevronRight size={15}/></button>{canDelete&&canWrite&&<button className="candidate-delete-button" aria-label={`${r.candidateName}の削除を確認`} disabled={busy||save.busy} onClick={()=>setDeleting(r.recordId)}><Trash2 size={14}/>削除</button>}</article>)}</div>
  {!filtered.length&&<div className="empty-state"><Search size={28}/><h3>該当する候補者はいません</h3><p>検索条件を変えるか、新しく候補者を追加してください。</p></div>}
  <div className="pagination"><span>{filtered.length?`${(page-1)*pageSize+1}〜${Math.min(page*pageSize,filtered.length)} / ${filtered.length}件`:"0件"}</span><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>前へ</button><button disabled={page*pageSize>=filtered.length} onClick={()=>setPage(p=>p+1)}>次へ</button></div></div>:<div className="card candidate-deleted-list"><h3>削除済みの候補者・提案</h3><p className="panel-note">間違えて削除した候補者を復元できます。登録済みの成果と集計も元に戻ります。</p>{!deletedCandidates.length&&<p className="empty-state">削除済みの候補者はいません。</p>}{deletedCandidates.map(item=><article key={item.changeId}><div><strong>{item.candidateName}</strong><span>{item.companies.join('・')||'未提案'} · {item.recordCount}件</span><small>{new Date(item.deletedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} 削除 · {players.find(p=>p.id===item.playerId)?.name||'担当未設定'}</small></div><button className="secondary-button" disabled={busy||save.busy||!canWrite} onClick={()=>void save.save('restoreChange',{changeId:item.changeId},`${item.candidateName}の削除を元に戻す`)}><Undo2 size={15}/>元に戻す</button></article>)}</div>}
  {save.undo&&<div className="management-undo"><span>直前の情報修正を取り消せます。</span><button className="text-button" disabled={save.busy||busy} onClick={()=>void save.restore()}><Undo2 size={15}/>元に戻す</button></div>}{save.error&&<p className="form-error" role="alert">{save.error}</p>}
  {record&&<RecordEditor key={record.recordId} record={record} players={players} admin={admin} disabled={!canWrite||busy} live={live} save={save} onClose={()=>setSelected(null)}/>}
  {deleting&&records.find(r=>r.recordId===deleting)&&<DeleteCandidateDialog record={records.find(r=>r.recordId===deleting)!} records={records} players={players} save={save} busy={busy} onClose={()=>setDeleting(null)}/>}
  {basicRecord&&records.find(r=>r.recordId===basicRecord)&&<BasicInfoDialog ai={ai?{...ai,identityKey:`${ai.identityKey}:${basicRecord}`}:undefined} key={basicRecord} record={records.find(r=>r.recordId===basicRecord)!} profile={profiles.find(p=>p.recordIds.includes(basicRecord))} save={save} disabled={busy||!canWrite} onClose={()=>setBasicRecord(null)}/>}
  {create&&<CreateCandidate clients={clients} knownNames={records.map(r=>valueAt(r,2))} players={players} save={save} onClose={()=>setCreate(false)}/>}
 </section>;
}

function BasicInfoDialog({record,profile,save,disabled,onClose,ai}:{record:CandidateRecord;profile?:CandidateProfile;save:ReturnType<typeof useManagementSave>;disabled:boolean;onClose:()=>void;ai?:CandidateAiConnection}) {
 const [fields,setFields]=useState<InterviewFields>(()=>profile?.fields||blankInterviewFields()),[introduction,setIntroduction]=useState(profile?.introduction||'');
 const baseline=useRef({rowVersion:record.rowVersion,profileVersion:profile?.version||''});
 return <Dialog open onOpenChange={open=>{if(!open&&!save.busy&&!save.uncertain)onClose();}}><DialogContent presentation="panel" className="intake-dialog"><DialogHeader><DialogTitle>{record.candidateName}の基本情報</DialogTitle><DialogDescription>面談情報とクライアント向け紹介文を保存できます。紹介文は送る前に内容を確認してください。</DialogDescription></DialogHeader><form onSubmit={async e=>{e.preventDefault();if(await save.save('saveCandidateProfile',{recordId:record.recordId,rowVersion:baseline.current.rowVersion,profileVersion:baseline.current.profileVersion,fields,introduction},`${record.candidateName} · 基本情報`))onClose();}}><fieldset disabled={disabled||save.busy||save.uncertain}><InterviewIntakeEditor ai={ai} memo={valueAt(record,13)} candidateName={record.candidateName} fields={fields} onFieldsChange={setFields} introduction={introduction} onIntroductionChange={setIntroduction} disabled={disabled||save.busy||save.uncertain}/></fieldset>{save.error&&<p role="alert" className="form-error">{save.error}</p>}<div className="form-actions"><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={onClose}>閉じる</button><button className="primary-button" disabled={disabled||save.busy}>{save.busy?'保存中…':save.uncertain?'同じ内容で再試行':'基本情報を保存'}</button></div></form></DialogContent></Dialog>;
}

function RecordEditor({record,players,admin,disabled,live,save,onClose}:{record:CandidateRecord;players:SheetPlayer[];admin:boolean;disabled:boolean;live:boolean;save:ReturnType<typeof useManagementSave>;onClose:()=>void}) {
 const id=useId(),today=businessToday();
 const [changes,setChanges]=useState<Record<string,string>>({});
 const [cancelStage,setCancelStage]=useState<Stage|null>(null);
 const value=(col:number)=>changes[col]??valueAt(record,col);
 const set=(col:number,v:string)=>setChanges(prev=>({...prev,[col]:v}));
 const locked=disabled||save.busy||save.uncertain;
 const dateErrors=mutationDateErrors("updateRecord",{changes}),invalid=Object.keys(dateErrors).length>0;
 const hasChanges=Object.entries(changes).some(([col,v])=>v!==valueAt(record,Number(col)));
 const reset=(col:number)=>setChanges(previous=>{const next={...previous};delete next[col];return next;});
 async function commit(){if(disabled||save.busy||invalid)return;const dirty=Object.fromEntries(Object.entries(changes).filter(([k,v])=>v!==valueAt(record,Number(k))).map(([k,v])=>[k,typeof record.values[Number(k)-1]==="boolean"?v==="true":v]));if(!Object.keys(dirty).length&&!save.uncertain)return;if(await save.save("updateRecord",{recordId:record.recordId,rowVersion:record.rowVersion,changes:dirty},`${record.candidateName}の進捗を保存`))onClose();}
 return <Dialog open onOpenChange={open=>{if(!open&&!save.busy&&!save.uncertain)onClose();}}><DialogContent presentation="panel" className="management-dialog"><DialogHeader><DialogTitle>{record.candidateName}</DialogTitle><DialogDescription>候補者の進捗・予定・成果を編集します。{live?"保存先は2期目マッチングDBです。":"サンプルの編集です。"}</DialogDescription></DialogHeader>
  <form noValidate onSubmit={e=>{e.preventDefault();void commit();}}><fieldset disabled={locked}>
  <div className="record-milestone-toolbar"><p className="record-milestone-help">実績の日付をここから直接入力できます。詳細欄の変更もまとめて保存します。</p><button type="submit" className="primary-button" aria-label="実績カードの変更を保存" disabled={save.busy||disabled||invalid||(!hasChanges&&!save.uncertain)}><Pencil size={15}/>{save.busy?"保存中…":save.uncertain?"同じ内容で再試行":"変更を保存"}</button></div>
  <div className="record-milestone-summary">{activityInputMetrics.map(m=>{
   const col=milestoneColumns[m.stage],v=value(col),original=valueAt(record,col),edited=v!==original,readonly=record.formulaColumns.includes(col),error=dateErrors[col],inputId=`${id}-milestone-${col}`;
   return <div key={m.stage} className={edited?"is-edited":""}>
    <label htmlFor={inputId}><span>{m.label}</span><input id={inputId} aria-label={`${m.label}の日付`} aria-invalid={!!error} aria-describedby={error?`${inputId}-error`:undefined} type="date" max={today} value={/^\d{4}-\d{2}-\d{2}$/.test(v)?v:""} disabled={readonly||locked} onChange={e=>set(col,e.target.value)}/></label>
    {error?<small id={`${inputId}-error`} className="record-milestone-error">{error}</small>:readonly?<small>自動計算・閲覧のみ</small>:v&&!/^\d{4}-\d{2}-\d{2}$/.test(v)?<small>現在の値：{v}</small>:<small>{edited?"変更あり・未保存":v?"登録済み":"未登録"}</small>}
    <button type="button" className="text-button" disabled={locked||readonly||!edited&&!original} onClick={()=>edited?reset(col):setCancelStage(m.stage)}>{edited?<Undo2 size={14}/>:<Minus size={14}/>} {edited?"入力を戻す":"取り消す"}</button>
   </div>;
  })}</div>
  <div className="record-field-grid">{matchingFields.map((label,i)=>{const col=i+1,v=value(col),readonly=record.formulaColumns.includes(col)||col===4&&!admin;
   const options=typeof record.values[col-1]==="boolean"?["true","false"]:col===4?players.flatMap(p=>p.sheetNames?.length?p.sheetNames:[p.id]):col===5?["新規","再販（離脱等）"]:col===6?positions:col===7?statuses:col===12?["Aヨミ","Bヨミ","Cヨミ","Dヨミ"]:null;
   return <label key={col} className={[13,19].includes(col)?"wide":""}><span>{label}{readonly&&<small>自動計算・閲覧のみ</small>}</span>{readonly?<div className="readonly-field">{v||"—"}</div>:options?<select aria-label={label} value={v} onChange={e=>set(col,e.target.value)}><option value="">未設定</option>{[...new Set([...options,...(v?[v]:[])])].map(o=><option key={o}>{o}</option>)}</select>:[13,19].includes(col)?<textarea aria-label={label} rows={3} value={v} onChange={e=>set(col,e.target.value)} maxLength={12000}/>:<input aria-label={label} type={recordDateColumns.includes(col)&&(!v||/^\d{4}-\d{2}-\d{2}$/.test(v))?"date":recordTimeColumns.includes(col)&&(!v||/^\d{2}:\d{2}$/.test(v))?"time":"text"} value={v} maxLength={12000} onChange={e=>set(col,e.target.value)}/>}</label>;
  })}</div><p className="panel-note">紹介元：{record.source||"未登録"} · 管理行 {record.row} · 数式は保護されます。</p></fieldset>{invalid&&<p className="form-error" role="alert">{Object.values(dateErrors)[0]}</p>}{save.error&&<p className="form-error" role="alert">{save.error}</p>}<div className="form-actions"><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={onClose}>閉じる</button><button className="primary-button" disabled={save.busy||disabled||invalid||(!hasChanges&&!save.uncertain)}><Pencil size={16}/>{save.busy?"保存中…":save.uncertain?"同じ内容で再試行":"変更を保存"}</button></div></form>
  {cancelStage&&<div className="achievement-confirm" role="alert"><strong>{stageLabel(cancelStage)}の {valueAt(record,milestoneColumns[cancelStage])} を取り消します。</strong><p>候補者情報と他の工程は残ります。{cancelStage==="候補者面談"&&"同じ候補者・担当・日付の面談を全提案行から解除します。"}</p><div><button className="secondary-button" disabled={save.busy||save.uncertain} onClick={()=>setCancelStage(null)}>戻る</button><button className="primary-button" disabled={save.busy||disabled} onClick={async()=>{if(await save.save("cancelAchievement",{recordId:record.recordId,rowVersion:record.rowVersion,stage:cancelStage},`${record.candidateName}の${stageLabel(cancelStage)}を取り消す`))onClose();}}>{save.busy?"処理中…":save.uncertain?"同じ取り消しを再試行":"この成果を取り消す"}</button></div></div>}
 </DialogContent></Dialog>;
}
function DeleteCandidateDialog({record,records,players,save,busy,onClose}:{record:CandidateRecord;records:CandidateRecord[];players:SheetPlayer[];save:ReturnType<typeof useManagementSave>;busy:boolean;onClose:()=>void}) {
 const [scope,setScope]=useState<'record'|'candidate'>('record');
 const related=records.filter(r=>r.playerId===record.playerId&&r.candidateName===record.candidateName);
 const targets=scope==='candidate'?related:[record];
 return <Dialog open onOpenChange={open=>{if(!open&&!save.busy&&!save.uncertain)onClose();}}><DialogContent className="candidate-delete-dialog"><DialogHeader><DialogTitle>{record.candidateName}を削除</DialogTitle><DialogDescription>選んだ候補者・提案と登録済み成果を集計から除外します。削除済み一覧から元に戻せます。</DialogDescription></DialogHeader>
 <p className="panel-note">担当：{players.find(p=>p.id===record.playerId)?.name||valueAt(record,4)||'未設定'}</p><label>削除する範囲<select aria-label="削除する範囲" value={scope} disabled={busy||save.busy||save.uncertain} onChange={e=>setScope(e.target.value as 'record'|'candidate')}><option value="record">この提案のみ（{valueAt(record,2)||'未提案'}）</option>{related.length>1&&<option value="candidate">この担当者の同名の登録をまとめて削除（{related.length}件）</option>}</select></label>
 {scope==='candidate'&&<p className="panel-note">同姓同名の別人が含まれる可能性があります。下の会社と実績を確認してください。</p>}
 <div className="candidate-delete-targets">{targets.map(r=><article key={r.recordId}><strong>{valueAt(r,2)||'未提案'}</strong><span>{valueAt(r,7)||'進捗未設定'}</span><p>{performanceMetrics.filter(m=>/^\d{4}-\d{2}-\d{2}$/.test(valueAt(r,milestoneColumns[m.stage]))).map(m=>`${m.label} ${valueAt(r,milestoneColumns[m.stage])}`).join(' / ')||'登録済みの成果なし'}</p></article>)}</div>
 <p className="candidate-delete-notice">{targets.length}件を削除します。対象の月別実績・ランキング・KPIも更新されます。</p>{save.error&&<p className="form-error" role="alert">{save.error}</p>}<div className="form-actions"><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={onClose}>キャンセル</button><button type="button" className="candidate-danger-button" disabled={busy||save.busy||targets.length>50} onClick={async()=>{if(await save.save('deleteCandidate',{recordId:record.recordId,rowVersion:record.rowVersion,scope,targets:targets.map(r=>({recordId:r.recordId,rowVersion:r.rowVersion}))},`${record.candidateName} · ${targets.length}件を削除`))onClose();}}><Trash2 size={16}/>{save.busy?'削除中…':`${targets.length}件を削除する`}</button></div></DialogContent></Dialog>;
}

function CreateCandidate({players,save,onClose,clients,knownNames}:{clients:ClientEntry[];knownNames:string[];players:Player[];save:ReturnType<typeof useManagementSave>;onClose:()=>void}) {
 const id=useId();
 const [owner,setOwner]=useState(players[0]?.id||""),[name,setName]=useState(""),[company,setCompany]=useState(""),[position,setPosition]=useState("アポインター");
 return <Dialog open onOpenChange={open=>{if(!open&&!save.busy&&!save.uncertain)onClose();}}>
  <DialogContent presentation="panel" className="app-dialog candidate-create-dialog">
   <DialogHeader>
    <DialogTitle>候補者を追加</DialogTitle>
    <DialogDescription>成果の日付がまだない候補者も登録できます。会社名は後から追加できます。</DialogDescription>
   </DialogHeader>
   <form className="app-form candidate-create-form" onSubmit={async e=>{e.preventDefault();if(await save.save("createCandidate",{playerId:owner,candidateName:name.trim(),company:company.trim(),position},`${name.trim()}を登録`))onClose();}}>
    <fieldset className="candidate-create-fields" disabled={save.busy||save.uncertain}>
     <label htmlFor={`${id}-name`}>
      <span className="candidate-create-label">候補者氏名<span className="candidate-create-required">必須</span></span>
      <input id={`${id}-name`} aria-describedby={`${id}-name-help`} required maxLength={60} placeholder="例：山田太郎" autoComplete="off" value={name} onChange={e=>setName(e.target.value)}/>
      <span id={`${id}-name-help`} className="candidate-create-help">姓と名の間にスペースを入れずに入力してください。</span>
     </label>
     <div className="form-grid">
      <label htmlFor={`${id}-owner`}>担当者<select id={`${id}-owner`} value={owner} onChange={e=>setOwner(e.target.value)}>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label htmlFor={`${id}-position`}>ポジション<select id={`${id}-position`} value={position} onChange={e=>setPosition(e.target.value)}>{positions.map(p=><option key={p}>{p}</option>)}</select></label>
     </div>
     <ClientNameInput label="会社名（任意）" value={company} onChange={setCompany} clients={clients} knownNames={knownNames}/>
    </fieldset>
    {save.error&&<p className="form-error" role="alert">{save.error}</p>}
    <div className="form-actions">
     <button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={onClose}>閉じる</button>
     <button type="submit" className="primary-button" disabled={save.busy||!name.trim()||!owner}>{save.busy?"登録中…":save.uncertain?"同じ内容で再試行":"候補者を登録"}</button>
    </div>
   </form>
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
