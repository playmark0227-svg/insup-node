import { useEffect, useId, useMemo, useState } from "react";
import { useUnsavedChangesWarning } from "./unsaved-work";
import { Plus, Pencil } from "lucide-react";
import type { ClientEntry } from "@/lib/sheets-client";

export function ClientNameInput({value,onChange,clients=[],knownNames=[],disabled=false,required=false,label="クライアント名"}:{value:string;onChange:(value:string)=>void;clients?:ClientEntry[];knownNames?:string[];disabled?:boolean;required?:boolean;label?:string}) {
 const id=useId();
 const names=useMemo(()=>[...new Set([...clients.filter(c=>c.active).map(c=>c.name),...knownNames.filter(name=>!clients.some(c=>!c.active&&c.name===name))].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja')),[clients,knownNames]);
 return <label>{label}<input aria-label={label} list={id} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} required={required} maxLength={100} placeholder="登録済みの会社を選ぶ・新しい会社名を入力" autoComplete="off"/><datalist id={id}>{names.map(name=><option key={name} value={name}/>)}</datalist><span className="panel-note">入力すると登録済みの会社名が候補に出ます。</span></label>;
}

type ClientNameDraft = { name: string; originalName: string; version: string };
export function ClientMaster({clients,knownNames,busy,onSave,onDirtyChange}:{clients:ClientEntry[];knownNames:string[];busy:boolean;onSave:(payload:{id?:string;version?:string;name:string;active?:boolean})=>Promise<boolean>;onDirtyChange?:(dirty:boolean)=>void}) {
 const [name,setName]=useState(''),[search,setSearch]=useState(''),[editing,setEditing]=useState<string|null>(null),[drafts,setDrafts]=useState<Record<string,ClientNameDraft>>({}),[discarding,setDiscarding]=useState<string|null>(null);
 const dirtyIds=Object.keys(drafts).filter(id=>drafts[id].name!==drafts[id].originalName),dirty=name!==''||dirtyIds.length>0;
 useUnsavedChangesWarning(dirty);
 useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
 useEffect(()=>()=>onDirtyChange?.(false),[onDirtyChange]);
 const removeDraft=(id:string)=>setDrafts(previous=>{const next={...previous};delete next[id];return next;});
 const openEditor=(client:ClientEntry)=>{setDrafts(previous=>previous[client.id]?previous:{...previous,[client.id]:{name:client.name,originalName:client.name,version:client.version}});setEditing(client.id);setDiscarding(null);};
 const cancelEditor=(id:string)=>{if(drafts[id]&&drafts[id].name!==drafts[id].originalName){setDiscarding(id);return;}removeDraft(id);setEditing(null);};
 const discard=()=>{if(busy||discarding===null)return;if(discarding==='new')setName('');else{removeDraft(discarding);if(editing===discarding)setEditing(null);}setDiscarding(null);};
 const discardPrompt=(target:string)=>discarding===target?<div className="client-discard-confirm" role="alert"><strong>{target==='new'?'新しい取引先の入力':'変更した取引先名'}を破棄しますか？</strong><p>破棄するまで、入力内容は保持されます。</p><div><button type="button" className="secondary-button" disabled={busy} onClick={()=>setDiscarding(null)}>編集を続ける</button><button type="button" className="secondary-button" disabled={busy} onClick={discard}>入力を破棄する</button></div></div>:null;
 const unmanaged=[...new Set(knownNames.filter(Boolean))].filter(name=>!clients.some(c=>c.name===name));
 const visible=clients.filter(c=>c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 return <section className="client-master card"><h3>取引先</h3><p className="panel-note">正式な会社名を登録し、次の提案から選択できます。名称を編集しても過去の提案は書き換わりません。</p>
 {dirty&&<div className="client-draft-status" role="status"><span>未保存の入力があります。画面内の表示を切り替えても入力は保持します。</span>{!!dirtyIds.length&&<button className="text-button" type="button" disabled={busy} onClick={()=>{setSearch('');setEditing(dirtyIds[0]);}}>名称の下書きを確認（{dirtyIds.length}件）</button>}</div>}
 <form className="client-add-form" onSubmit={async e=>{e.preventDefault();if(!name.trim()||busy)return;if(await onSave({name:name.trim()}))setName('');}}><label>新しい取引先<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} disabled={busy} placeholder="正式な会社名"/></label><button className="primary-button" disabled={busy||!name.trim()}><Plus size={16}/>登録</button>{name!==''&&<button className="text-button" type="button" disabled={busy} onClick={()=>setDiscarding('new')}>入力を消す</button>}</form>{discardPrompt('new')}
 <label>取引先を検索<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="会社名で検索"/></label>
 <div className="client-master-list">{visible.map(client=>{const draft=drafts[client.id];return <article key={client.id} className={editing===client.id?"client-is-editing":undefined}>{editing===client.id&&draft?<><form onSubmit={async e=>{e.preventDefault();if(busy||!draft.name.trim()||draft.name===draft.originalName)return;if(await onSave({id:client.id,version:draft.version,name:draft.name.trim(),active:client.active})){removeDraft(client.id);setEditing(null);}}}><label className="client-edit-name">{client.name}の名称<input aria-label={`${client.name}の新しい名称`} required value={draft.name} onChange={e=>setDrafts(previous=>({...previous,[client.id]:{...previous[client.id],name:e.target.value}}))} maxLength={100} disabled={busy}/></label><button className="secondary-button" disabled={busy||!draft.name.trim()||draft.name===draft.originalName}>保存</button><button className="text-button" type="button" disabled={busy} onClick={()=>cancelEditor(client.id)}>キャンセル</button></form>{discardPrompt(client.id)}</>:<><div><strong>{client.name}</strong>{!client.active&&<small>候補から非表示</small>}{draft&&draft.name!==draft.originalName&&<small className="client-draft-label">未保存の名称：{draft.name||'（空欄）'}</small>}</div><div><button className="text-button" disabled={busy} onClick={()=>openEditor(client)}><Pencil size={14}/>{draft&&draft.name!==draft.originalName?'下書きを編集':'名称を編集'}</button><button className="text-button" disabled={busy||!!draft&&draft.name!==draft.originalName} onClick={()=>void onSave({...client,active:!client.active})}>{client.active?'候補から隠す':'候補に戻す'}</button></div></>}</article>;})}</div>

 {!clients.length&&<p className="empty-state">取引先はまだ登録されていません。</p>}
 {!!unmanaged.length&&<details><summary>過去の提案にある会社を登録（{unmanaged.length}社）</summary><p className="panel-note">表記が重複していないか確認して登録してください。</p>{unmanaged.filter(n=>n.toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice(0,100).map(name=><article key={name}><strong>{name}</strong><button className="text-button" disabled={busy} onClick={()=>void onSave({name})}><Plus size={14}/>登録する</button></article>)}</details>}
 </section>;
}
