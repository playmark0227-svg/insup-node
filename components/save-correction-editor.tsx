import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { correctionFieldErrors, correctionFieldMax, type SaveCorrectionDraft } from "../lib/save-correction";

export function SaveCorrectionEditor({draft,onSave,onClose}:{draft:SaveCorrectionDraft;onSave:(operationId:string,values:Record<string,string>)=>Promise<void>;onClose:()=>void}) {
 const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(draft.fields.map(field=>[field.key,field.value]))),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const form=useRef<HTMLFormElement>(null),prefix=useId(),errors=correctionFieldErrors(draft,values);
 const [fields]=useState(()=>[...draft.fields].sort((left,right)=>Number(!!errors[right.key])-Number(!!errors[left.key])));
 const running=useRef(false);
 useEffect(()=>{form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus({preventScroll:true});},[]);
 const dirty=draft.fields.some(field=>values[field.key]!==field.value),invalid=Object.keys(errors).length>0;
 async function submit(){if(running.current||invalid||!dirty)return;running.current=true;setSaving(true);setError("");try{await onSave(draft.operationId,{...values});}catch(cause){setError(cause instanceof Error?cause.message:"修正を保存できませんでした。入力は残っています。");}finally{running.current=false;setSaving(false);}}
 return <form ref={form} className="save-correction-form" aria-label="保存内容をクイック修正" noValidate onSubmit={event=>{event.preventDefault();void submit();}}>
  <h3>内容をクイック修正</h3><p>変更したい項目を直してください。修正後は自動で再同期します。</p>
  <fieldset disabled={saving}><div className="save-correction-fields">{fields.map(field=>{
   const id=`${prefix}-${field.key}`,message=errors[field.key],common={id,value:values[field.key],"aria-invalid":!!message,"aria-describedby":message?`${id}-error`:undefined,onChange:(event:{target:{value:string}})=>{setValues(previous=>({...previous,[field.key]:event.target.value}));setError("");}};
   return <label key={field.key} htmlFor={id}><span>{field.label}</span>{field.type==="select"?<select {...common}>{field.options?.map(option=><option key={option} value={option}>{option===""?"未設定":option==="true"?"はい":option==="false"?"いいえ":option}</option>)}</select>:field.type==="textarea"?<textarea {...common} rows={3} maxLength={12000}/>:<input {...common} type={field.type} max={correctionFieldMax(field,values)} maxLength={12000}/>} {message&&<small id={`${id}-error`} className="save-correction-field-error">{message}</small>}</label>;
  })}</div></fieldset>
  {error&&<p className="background-save-error" role="alert">{error}</p>}
  <div className="background-save-actions"><button className="primary-button" disabled={saving||invalid||!dirty}>{saving?<LoaderCircle size={15} className="background-save-spinner"/>:<Save size={15}/>} {saving?"修正を端末に保存中…":"修正して再保存"}</button><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>修正を閉じる</button></div>
 </form>;
}
