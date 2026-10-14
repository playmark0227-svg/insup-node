"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Copy, LoaderCircle, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import "./background-save-status.css";

export type BackgroundSaveInfo = {
 operationId:string; action:string; label:string; status:"saving"|"saved"|"failed";
 error:string; uncertain:boolean; details:string[]; changeId?:string;
};

export function BackgroundSaveStatus({save,onRetry,onDismiss,onUndo}:{save:BackgroundSaveInfo|null;onRetry:()=>void;onDismiss:()=>void;onUndo?:(changeId:string,label:string)=>void}) {
 const [open,setOpen]=useState(false),[discard,setDiscard]=useState(false);
 const container=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const panelId=useId();
 useEffect(()=>{setDiscard(false);},[save?.operationId,save?.status]);
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
 const title=saving?"保存中…":saved?"保存しました":save.uncertain?"保存結果を要確認":"保存できませんでした";
 const Icon=saving?LoaderCircle:saved?CheckCircle2:AlertCircle;
 const dismiss=()=>{try{onDismiss();setOpen(false);}catch(error){toast.error(error instanceof Error?error.message:"保存状態を確認してください。");}};
 return <div ref={container} className={`background-save background-save-${save.status}`}>
  <span className="background-save-announcement" role="status" aria-live="polite" aria-atomic="true">{save.label}：{title}</span>
  <button ref={trigger} type="button" className="background-save-trigger" aria-expanded={open} aria-controls={panelId} aria-label={`${title} 保存状況を確認`} onClick={()=>setOpen(value=>!value)}>
   <Icon size={17} className={saving?"background-save-spinner":""}/><span>{title}</span><ChevronDown size={13}/>
  </button>
  {open&&<section id={panelId} aria-label="保存状況" className="background-save-panel">
   <div className="background-save-heading"><div><Icon size={19} className={saving?"background-save-spinner":""}/><strong>{title}</strong></div><button type="button" aria-label="保存状況を閉じる" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={17}/></button></div>
   <p className="background-save-label">{save.label}</p>
   <p className="background-save-help">{saving?"別の画面へ移動できます。スプレッドシートの保存完了後に数字を更新します。":saved?"スプレッドシートへの保存と、アプリの表示更新が完了しました。":save.uncertain?"通信が途切れ、保存結果を確認できませんでした。保存内容は保持しています。同じ内容で再試行して、重複を防ぎながら結果を確認してください。":"保存内容は保持しています。理由を確認して再試行してください。修正する場合は、内容を控えてからこの保存を取り消してください。"}</p>
   {!saved&&<p className="background-save-help">{saving?"保存中は、続けて変更を保存する操作とログアウトをお待ちください。":"この保存を解決するまで、新しい変更の保存とログアウトをお待ちください。"}</p>}
   {save.error&&<p className="background-save-error" role="alert">{save.error}</p>}
   {!!save.details.length&&<details className="background-save-details"><summary>保存する内容を確認</summary><ul>{save.details.map((detail,index)=><li key={index}>{detail}</li>)}</ul><button type="button" className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText([save.label,...save.details].join("\n"));toast.success("保存内容をコピーしました");}catch{toast.error("コピーできませんでした。表示内容を控えてください。");}}}><Copy size={14}/>内容をコピー</button></details>}
   <div className="background-save-actions">
    {save.status==="failed"&&<button type="button" className="primary-button" onClick={()=>{try{setDiscard(false);onRetry();}catch(error){toast.error(error instanceof Error?error.message:"再試行できませんでした。");}}}><RotateCcw size={15}/>{save.uncertain?"同じ内容で保存を確認":"同じ内容で再試行"}</button>}
    {saved&&save.changeId&&onUndo&&<button type="button" className="secondary-button" onClick={()=>{try{onUndo(save.changeId!,save.label);setOpen(false);}catch(error){toast.error(error instanceof Error?error.message:"元に戻せませんでした。");}}}><RotateCcw size={15}/>元に戻す</button>}
    {saved&&<button type="button" className="secondary-button" onClick={dismiss}>確認しました</button>}
    {save.status==="failed"&&!save.uncertain&&!discard&&<button type="button" className="text-button" onClick={()=>setDiscard(true)}>この保存を取り消す</button>}
   </div>
   {discard&&<div className="background-save-discard"><p>保持している入力内容を破棄します。必要な内容を控えましたか？</p><div><button type="button" className="secondary-button" onClick={()=>setDiscard(false)}>戻る</button><button type="button" className="secondary-button" onClick={dismiss}>入力を破棄する</button></div></div>}
  </section>}
 </div>;
}
