"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Copy, LoaderCircle, Pencil, RotateCcw, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import { SaveCorrectionEditor } from "./save-correction-editor";
import type { SaveCorrectionDraft } from "../lib/save-correction";
import "./background-save-status.css";

export type BackgroundSaveInfo = {
 operationId:string; action:string; label:string; status:"saving"|"saved"|"failed";
 error:string; uncertain:boolean; details:string[]; changeId?:string; intakeInput?:boolean;refreshing?:boolean;localSaved?:boolean;pendingCount?:number;editable?:boolean;waitingForConnection?:boolean;
};

export function BackgroundSaveStatus({save,onRetry,onDismiss,onUndo,onCopyIntakeInput,onReadCorrection,onCorrect}:{save:BackgroundSaveInfo|null;onRetry:()=>void;onDismiss:()=>void|Promise<void>;onUndo?:(changeId:string,label:string)=>void|Promise<void>;onCopyIntakeInput?:()=>string;onReadCorrection?:(operationId:string)=>SaveCorrectionDraft;onCorrect?:(operationId:string,values:Record<string,string>)=>Promise<void>}) {
 const [open,setOpen]=useState(false),[discard,setDiscard]=useState(false);
 const [draft,setDraft]=useState<SaveCorrectionDraft|null>(null);
 const container=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const panelId=useId();
 useEffect(()=>{setDiscard(false);},[save?.operationId,save?.status]);
 useEffect(()=>{setDraft(null);},[save?.operationId,save?.status]);
 useEffect(()=>{if(save?.status!=="failed")setOpen(false);},[save?.operationId]);
 useEffect(()=>{if(save?.status==="failed")setOpen(true);},[save?.status,save?.operationId]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!container.current?.contains(event.target as Node))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);trigger.current?.focus();}};
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
  return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
 },[open]);
 if(!save)return null;
 const saving=save.status==="saving",saved=save.status==="saved";
 const waiting=saving&&save.waitingForConnection;
 const title=saving?waiting?"端末に保存済み・接続待ち":save.localSaved?`端末に保存済み・同期中${(save.pendingCount||0)>1?` ${save.pendingCount}件`:""}`:"端末へ保存中…":saved?save.refreshing?"シートへ保存済み":"保存しました":save.uncertain?"保存結果を要確認":"保存できませんでした";
 const Icon=waiting?WifiOff:saving?LoaderCircle:saved?CheckCircle2:AlertCircle;
 const dismiss=async()=>{try{await onDismiss();setOpen(false);}catch(error){toast.error(error instanceof Error?error.message:"保存状態を確認してください。");}};
 return <div ref={container} className={`background-save background-save-${save.status}`}>
  <span className="background-save-announcement" role="status" aria-live="polite" aria-atomic="true">{save.label}：{title}</span>
  <button ref={trigger} type="button" className="background-save-trigger" aria-expanded={open} aria-controls={panelId} aria-label={`${title} 保存状況を確認`} onClick={()=>setOpen(value=>!value)}>
   <Icon size={17} className={saving&&!waiting?"background-save-spinner":""}/><span>{title}</span><ChevronDown size={13}/>
  </button>
  {open&&<section id={panelId} aria-label="保存状況" className={`background-save-panel${draft?.operationId===save.operationId?" is-correcting":""}`}>
   <div className="background-save-heading"><div><Icon size={19} className={saving&&!waiting?"background-save-spinner":""}/><strong>{title}</strong></div><button type="button" aria-label="保存状況を閉じる" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={17}/></button></div>
   <p className="background-save-label">{save.label}</p>
   <p className="background-save-help">{waiting?"入力はこの端末に保存済みです。インターネットに接続すると、自動でスプレッドシートへの同期を再開します。接続中の別画面へ移動しても入力は保持されます。":saving&&!save.localSaved?"この端末のブラウザへ入力を保存しています。":saving?"入力はこの端末のブラウザに保存済みです。スプレッドシートへ順番に自動同期しています。別の候補者の入力や画面の移動を続けられます。":saved?save.refreshing?"スプレッドシートへの保存は完了しました。最新の数字は別処理で取得しています。入力中の画面は上書きしません。":"スプレッドシートへの保存と、アプリの表示更新が完了しました。":save.uncertain?"通信が途切れ、保存結果を確認できませんでした。保存内容は保持しています。同じ内容で再試行して、重複を防ぎながら結果を確認してください。":save.editable?"入力は端末に残っています。このメニュー内で間違った項目を修正して再保存できます。":"保存内容は保持しています。理由を確認して再試行してください。"}</p>
   {!saved&&!draft&&<p className="background-save-help">{saving?"同じ候補者・項目の再編集とログアウトは、同期完了後にできます。実績の数字はシートへの反映後に更新します。":"入力は端末に残っています。右上から同じ内容で再試行できます。"}</p>}
   {save.error&&<p className="background-save-error" role="alert">{draft&&"前回のエラー："}{save.error}</p>}
   {save.status==="failed"&&!save.uncertain&&draft?.operationId===save.operationId&&onCorrect?<SaveCorrectionEditor key={draft.operationId} draft={draft} onSave={onCorrect} onClose={()=>setDraft(null)}/>:<>
   {save.status==="failed"&&!save.uncertain&&save.editable&&onReadCorrection&&onCorrect&&<button type="button" className="primary-button background-save-edit-button" onClick={()=>{try{setDraft(onReadCorrection(save.operationId));setDiscard(false);}catch(error){toast.error(error instanceof Error?error.message:"入力を確認できませんでした。");}}}><Pencil size={15}/>内容を修正して再保存</button>}
   {!!save.details.length&&<details className="background-save-details"><summary>保存する内容を確認</summary><ul>{save.details.map((detail,index)=><li key={index}>{detail}</li>)}</ul><button type="button" className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText([save.label,...save.details].join("\n"));toast.success("保存内容をコピーしました");}catch{toast.error("コピーできませんでした。表示内容を控えてください。");}}}><Copy size={14}/>内容をコピー</button></details>}
   {save.status==="failed"&&save.intakeInput&&onCopyIntakeInput&&<button type="button" className="secondary-button" onClick={async()=>{let input:string;try{input=onCopyIntakeInput();}catch(error){toast.error(error instanceof Error?error.message:"面談情報を取得できませんでした。");return;}try{await navigator.clipboard.writeText(input);toast.success("面談の入力原文と紹介文をコピーしました");}catch{toast.error("コピーできませんでした。入力は保持しています。ブラウザのコピー権限を確認して、もう一度お試しください。");}}}><Copy size={14}/>面談の入力原文をコピー</button>}
   <div className="background-save-actions">
    {save.status==="failed"&&<button type="button" className="primary-button" onClick={()=>{try{setDiscard(false);onRetry();}catch(error){toast.error(error instanceof Error?error.message:"再試行できませんでした。");}}}><RotateCcw size={15}/>{save.uncertain?"同じ内容で保存を確認":"同じ内容で再試行"}</button>}
    {saved&&save.changeId&&onUndo&&<button type="button" className="secondary-button" onClick={async()=>{try{await onUndo(save.changeId!,save.label);setOpen(false);}catch(error){toast.error(error instanceof Error?error.message:"元に戻せませんでした。");}}}><RotateCcw size={15}/>元に戻す</button>}
    {saved&&<button type="button" className="secondary-button" onClick={dismiss}>確認しました</button>}
    {save.status==="failed"&&!save.uncertain&&!discard&&<button type="button" className="text-button" onClick={()=>setDiscard(true)}>この保存を取り消す</button>}
   </div>
   {discard&&<div className="background-save-discard"><p>保持している入力内容を破棄します。必要な内容を控えましたか？</p><div><button type="button" className="secondary-button" onClick={()=>setDiscard(false)}>戻る</button><button type="button" className="secondary-button" onClick={dismiss}>入力を破棄する</button></div></div>}
   </>}
  </section>}
 </div>;
}
