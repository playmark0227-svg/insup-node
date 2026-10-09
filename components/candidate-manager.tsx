"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Search, Pencil, Minus, Undo2, ChevronRight, CalendarDays } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { positions, statuses, stages, type Player, type Stage } from "@/lib/node-data";
import { matchingFields, recordDateColumns, recordTimeColumns, milestoneColumns, correctionRecords, valueAt } from "@/lib/management-data";
import { performanceMetrics, stageLabel } from "@/lib/performance-metrics";
import { isUncertainWrite, type CandidateRecord, type MutationResult, type SheetPlayer } from "@/lib/sheets-client";
import "@/app/management.css";
export type ManagementMutation = (action:string,payload:unknown,id:string)=>Promise<MutationResult>;
export type CorrectionTarget = {owner:string;stage:Stage;period:string};

export function useManagementSave(onSave:ManagementMutation,live=true) {
 const pending=useRef<{action:string;payload:unknown;id:string}|null>(null);
 const running=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[uncertain,setUncertain]=useState(false),[undo,setUndo]=useState<string|null>(null);
 async function save(action:string,payload:unknown) {
  if(running.current)return false;
  pending.current??={action,payload,id:crypto.randomUUID()};running.current=true;setBusy(true);setError("");
  try{const job=pending.current,result=await onSave(job.action,job.payload,job.id);pending.current=null;setUncertain(false);if(result.changeId)setUndo(result.changeId);toast.success(action==="restoreChange"?"変更を元に戻しました":live?"スプレッドシートに反映しました":"サンプルに反映しました");return true;}
  catch(e){const ambiguous=isUncertainWrite(e);setUncertain(ambiguous);if(!ambiguous)pending.current=null;setError(e instanceof Error?e.message:"保存できませんでした。");return false;}
  finally{running.current=false;setBusy(false);}
 }
 return {save,busy,error,uncertain,undo,restore:async()=>{if(undo&&await save("restoreChange",{changeId:undo}))setUndo(null);}};
}

export function CandidateManager({records,players,admin,busy,canWrite,live,onSave}:{records:CandidateRecord[];players:SheetPlayer[];admin:boolean;busy:boolean;canWrite:boolean;live:boolean;onSave:ManagementMutation}) {
 const [search,setSearch]=useState(""),[owner,setOwner]=useState("all"),[status,setStatus]=useState("all"),[page,setPage]=useState(1),[selected,setSelected]=useState<string|null>(null),[create,setCreate]=useState(false);
 const save=useManagementSave(onSave,live);
 const filtered=records.filter(r=>(owner==="all"||owner==="unassigned"&&!r.playerId||owner===r.playerId)&&(status==="all"||valueAt(r,7)===status)&&r.values.join(" ").toLowerCase().includes(search.toLowerCase()));
 const rows=filtered.slice((page-1)*15,page*15),record=records.find(r=>r.recordId===selected);
 useEffect(()=>setPage(1),[search,owner,status]);
 return <section className="candidate-management">
  <div className="management-intro"><div><h2>候補者・提案の管理</h2><p>全期間の候補者を表示します。日付を修正すると成果とランキングも更新されます。</p></div><button className="primary-button" disabled={busy||!canWrite} onClick={()=>setCreate(true)}><Plus size={17}/>候補者を追加</button></div>
  <div className="card"><div className="management-filters"><label className="management-search"><Search size={17}/><input aria-label="候補者・会社・メモを検索" placeholder="候補者名、会社、メモで検索" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="進捗の絞り込み" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">すべての進捗</option>{[...new Set([...statuses,...records.map(r=>valueAt(r,7)).filter(Boolean)])].map(s=><option key={s}>{s}</option>)}</select>{admin&&<select aria-label="候補者の担当者" value={owner} onChange={e=>setOwner(e.target.value)}><option value="all">すべての担当者</option><option value="unassigned">担当者の対応が未設定</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}</div>
  <div className="management-list-caption"><strong>{filtered.length.toLocaleString()}件の候補者・提案</strong><span>成果未登録の候補者も表示</span></div>
  <div className="management-table-scroll candidate-desktop-list"><table className="candidate-table"><thead><tr><th>候補者・担当</th><th>会社・ポジション</th><th>進捗</th><th>次の予定</th><th>6項目の実績</th><th/></tr></thead><tbody>{rows.map(r=><tr key={r.recordId}><td><strong>{r.candidateName}</strong><small>{players.find(p=>p.id===r.playerId)?.name||valueAt(r,4)||"担当未設定"}{!r.playerId&&" · 対応未設定"}</small></td><td><strong>{valueAt(r,2)||"未提案"}</strong><small>{valueAt(r,6)||"ポジション未設定"}</small></td><td><span className="stage-tag">{valueAt(r,7)||"未設定"}</span><small>{valueAt(r,12)&&`ヨミ：${valueAt(r,12)}`}</small></td><td>{valueAt(r,10)||valueAt(r,23)||"—"}<small>{valueAt(r,11)}</small></td><td><div className="candidate-milestones">{performanceMetrics.map(m=><span key={m.stage} className={valueAt(r,milestoneColumns[m.stage])?"done":""} title={`${m.label}：${valueAt(r,milestoneColumns[m.stage])||"未登録"}`}>{m.label.replace("C面談","C").replace("実施","")}</span>)}</div></td><td><button className="text-button" aria-label={`${r.candidateName}の詳細・修正`} onClick={()=>setSelected(r.recordId)}>詳細・修正<ChevronRight size={15}/></button></td></tr>)}</tbody></table></div>
  <div className="candidate-mobile-list">{rows.map(r=><article className="candidate-mobile-card" key={r.recordId}><header><div><strong>{r.candidateName}</strong><small>{players.find(p=>p.id===r.playerId)?.name||valueAt(r,4)||"担当未設定"}</small></div><span className="stage-tag">{valueAt(r,7)||"未設定"}</span></header><p>{valueAt(r,2)||"未提案"} · {valueAt(r,6)||"ポジション未設定"}{(valueAt(r,10)||valueAt(r,23))&&<small>次の予定：{valueAt(r,10)||valueAt(r,23)} {valueAt(r,11)}</small>}</p><div className="candidate-milestones">{performanceMetrics.map(m=><span key={m.stage} className={valueAt(r,milestoneColumns[m.stage])?"done":""}>{m.label}</span>)}</div><button className="text-button" aria-label={`${r.candidateName}の詳細・修正`} onClick={()=>setSelected(r.recordId)}>詳細・修正<ChevronRight size={15}/></button></article>)}</div>
  {!filtered.length&&<div className="empty-state"><Search size={28}/><h3>該当する候補者はいません</h3><p>検索条件を変えるか、新しく候補者を追加してください。</p></div>}
  <div className="pagination"><span>{filtered.length?`${(page-1)*15+1}〜${Math.min(page*15,filtered.length)} / ${filtered.length}件`:"0件"}</span><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>前へ</button><button disabled={page*15>=filtered.length} onClick={()=>setPage(p=>p+1)}>次へ</button></div></div>
  {save.undo&&<div className="management-undo"><span>直前の情報修正を取り消せます。</span><button className="text-button" disabled={save.busy||busy} onClick={()=>void save.restore()}><Undo2 size={15}/>元に戻す</button></div>}{save.error&&<p className="form-error" role="alert">{save.error}</p>}
  {record&&<RecordEditor key={record.recordId} record={record} players={players} admin={admin} disabled={!canWrite||busy} live={live} save={save} onClose={()=>setSelected(null)}/>}
  {create&&<CreateCandidate players={players} save={save} onClose={()=>setCreate(false)}/>}
 </section>;
}

function RecordEditor({record,players,admin,disabled,live,save,onClose}:{record:CandidateRecord;players:SheetPlayer[];admin:boolean;disabled:boolean;live:boolean;save:ReturnType<typeof useManagementSave>;onClose:()=>void}) {
 const [changes,setChanges]=useState<Record<string,string>>({});
 const [cancelStage,setCancelStage]=useState<Stage|null>(null);
 const value=(col:number)=>changes[col]??valueAt(record,col);
 const set=(col:number,v:string)=>setChanges(prev=>({...prev,[col]:v}));
 const locked=disabled||save.busy||save.uncertain;
 async function commit(){const dirty=Object.fromEntries(Object.entries(changes).filter(([k,v])=>v!==valueAt(record,Number(k))).map(([k,v])=>[k,typeof record.values[Number(k)-1]==="boolean"?v==="true":v]));if(await save.save("updateRecord",{recordId:record.recordId,rowVersion:record.rowVersion,changes:dirty}))onClose();}
 return <Dialog open onOpenChange={open=>{if(!open&&!save.busy&&!save.uncertain)onClose();}}><DialogContent className="management-dialog"><DialogHeader><DialogTitle>{record.candidateName}</DialogTitle><DialogDescription>候補者の進捗・予定・成果を編集します。{live?"保存先は2期目マッチングDBです。":"サンプルの編集です。"}</DialogDescription></DialogHeader>
  <div className="record-milestone-summary">{performanceMetrics.map(m=><div key={m.stage}><span>{m.label}</span><strong>{valueAt(record,milestoneColumns[m.stage])||"未登録"}</strong><button className="text-button" disabled={locked||!valueAt(record,milestoneColumns[m.stage])} onClick={()=>setCancelStage(m.stage)}><Minus size={14}/>取り消す</button></div>)}</div>
  <form onSubmit={e=>{e.preventDefault();void commit();}}><fieldset disabled={locked}><div className="record-field-grid">{matchingFields.map((label,i)=>{const col=i+1,v=value(col),readonly=record.formulaColumns.includes(col)||col===4&&!admin;
   const options=typeof record.values[col-1]==="boolean"?["true","false"]:col===4?players.flatMap(p=>p.sheetNames?.length?p.sheetNames:[p.id]):col===5?["新規","再販（離脱等）"]:col===6?positions:col===7?statuses:col===12?["Aヨミ","Bヨミ","Cヨミ","Dヨミ"]:null;
   return <label key={col} className={[13,19].includes(col)?"wide":""}><span>{label}{readonly&&<small>自動計算・閲覧のみ</small>}</span>{readonly?<div className="readonly-field">{v||"—"}</div>:options?<select aria-label={label} value={v} onChange={e=>set(col,e.target.value)}><option value="">未設定</option>{[...new Set([...options,...(v?[v]:[])])].map(o=><option key={o}>{o}</option>)}</select>:[13,19].includes(col)?<textarea aria-label={label} rows={3} value={v} onChange={e=>set(col,e.target.value)} maxLength={12000}/>:<input aria-label={label} type={recordDateColumns.includes(col)&&(!v||/^\d{4}-\d{2}-\d{2}$/.test(v))?"date":recordTimeColumns.includes(col)&&(!v||/^\d{2}:\d{2}$/.test(v))?"time":"text"} value={v} maxLength={12000} onChange={e=>set(col,e.target.value)}/>}</label>;
  })}</div><p className="panel-note">紹介元：{record.source||"未登録"} · 管理行 {record.row} · 数式は保護されます。</p></fieldset>{save.error&&<p className="form-error" role="alert">{save.error}</p>}<div className="form-actions"><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={onClose}>閉じる</button><button className="primary-button" disabled={save.busy||disabled||(!Object.keys(changes).length&&!save.uncertain)}><Pencil size={16}/>{save.busy?"保存中…":save.uncertain?"同じ内容で再試行":"変更を保存"}</button></div></form>
  {cancelStage&&<div className="achievement-confirm" role="alert"><strong>{stageLabel(cancelStage)}の {valueAt(record,milestoneColumns[cancelStage])} を取り消します。</strong><p>候補者情報と他の工程は残ります。{cancelStage==="候補者面談"&&"同じ候補者・担当・日付の面談を全提案行から解除します。"}</p><div><button className="secondary-button" disabled={save.busy||save.uncertain} onClick={()=>setCancelStage(null)}>戻る</button><button className="primary-button" disabled={save.busy||disabled} onClick={async()=>{if(await save.save("cancelAchievement",{recordId:record.recordId,rowVersion:record.rowVersion,stage:cancelStage}))onClose();}}>{save.busy?"処理中…":save.uncertain?"同じ取り消しを再試行":"この成果を取り消す"}</button></div></div>}
 </DialogContent></Dialog>;
}
function CreateCandidate({players,save,onClose}:{players:Player[];save:ReturnType<typeof useManagementSave>;onClose:()=>void}) {
 const [owner,setOwner]=useState(players[0]?.id||""),[name,setName]=useState(""),[company,setCompany]=useState(""),[position,setPosition]=useState("アポインター");
 return <Dialog open onOpenChange={open=>{if(!open&&!save.busy&&!save.uncertain)onClose();}}><DialogContent><DialogHeader><DialogTitle>候補者を追加</DialogTitle><DialogDescription>成果の日付がまだない候補者も登録できます。</DialogDescription></DialogHeader><form onSubmit={async e=>{e.preventDefault();if(await save.save("createCandidate",{playerId:owner,candidateName:name.trim(),company:company.trim(),position}))onClose();}}><fieldset disabled={save.busy||save.uncertain}><label>担当者<select value={owner} onChange={e=>setOwner(e.target.value)}>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>候補者氏名<input required maxLength={60} placeholder="スペースなしで入力" value={name} onChange={e=>setName(e.target.value)}/></label><label>会社名（任意）<input maxLength={100} value={company} onChange={e=>setCompany(e.target.value)}/></label><label>ポジション<select value={position} onChange={e=>setPosition(e.target.value)}>{positions.map(p=><option key={p}>{p}</option>)}</select></label></fieldset>{save.error&&<p className="form-error" role="alert">{save.error}</p>}<div className="form-actions"><button type="button" className="secondary-button" disabled={save.busy||save.uncertain} onClick={onClose}>閉じる</button><button className="primary-button" disabled={save.busy}>{save.busy?"登録中…":save.uncertain?"同じ内容で再試行":"候補者を登録"}</button></div></form></DialogContent></Dialog>;
}
export function AchievementCorrection({target,records,players,onClose,onSave,busy,live}:{target:CorrectionTarget;records:CandidateRecord[];players:Player[];onClose:()=>void;onSave:ManagementMutation;busy:boolean;live:boolean}) {
 const candidates=correctionRecords(records,target.owner,target.stage,target.period),save=useManagementSave(onSave,live);
 const [selected,setSelected]=useState<string|null>(null);
 const record=candidates.find(r=>r.recordId===selected);
 const [search,setSearch]=useState("");
 return <Dialog open onOpenChange={open=>{if(!open&&!save.busy&&!save.uncertain)onClose();}}><DialogContent className="correction-dialog"><DialogHeader><DialogTitle>{players.find(p=>p.id===target.owner)?.name} · {stageLabel(target.stage)}の修正</DialogTitle><DialogDescription>{target.period==="all"?"全期間":target.period}の登録済み成果から、取り消す候補者を選んでください。</DialogDescription></DialogHeader><label className="management-search"><Search size={17}/><input aria-label="取り消す候補者を検索" value={search} onChange={e=>setSearch(e.target.value)} placeholder="候補者名・会社名" disabled={save.busy||save.uncertain}/></label>
  <div className="correction-list">{candidates.filter(r=>`${r.candidateName} ${valueAt(r,2)}`.includes(search)).map(r=><button key={r.recordId} className={selected===r.recordId?"selected":""} disabled={save.busy||save.uncertain} onClick={()=>setSelected(r.recordId)}><span><strong>{r.candidateName}</strong><small>{valueAt(r,2)||"未提案"}</small></span><span><CalendarDays size={14}/>{valueAt(r,milestoneColumns[target.stage])}</span></button>)}{!candidates.length&&<p className="empty-state">対象の登録済み成果はありません。</p>}</div>
  {record&&<div className="achievement-confirm"><strong>{record.candidateName}の{stageLabel(target.stage)}を1件取り消します。</strong><p>候補者と他の工程は残ります。{target.stage==="候補者面談"&&"同じ面談が複数の提案に記載されている場合、その日付をまとめて解除します。"}</p></div>}{save.error&&<p className="form-error" role="alert">{save.error}</p>}{save.undo&&<button className="text-button" disabled={busy||save.busy} onClick={()=>void save.restore()}><Undo2 size={15}/>直前の取り消しを元に戻す</button>}
  <div className="form-actions"><button className="secondary-button" disabled={save.busy||save.uncertain} onClick={onClose}>閉じる</button><button className="primary-button" disabled={busy||save.busy||!record&&!save.uncertain} onClick={async()=>{if(record&&await save.save("cancelAchievement",{recordId:record.recordId,rowVersion:record.rowVersion,stage:target.stage}))setSelected(null);}}><Minus size={16}/>{save.busy?"処理中…":save.uncertain?"同じ取り消しを再試行":"選んだ成果を取り消す"}</button></div>
 </DialogContent></Dialog>;
}
