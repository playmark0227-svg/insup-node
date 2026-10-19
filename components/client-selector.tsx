import { useId, useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import type { ClientEntry } from "@/lib/sheets-client";

export function ClientNameInput({value,onChange,clients=[],knownNames=[],disabled=false,required=false,label="クライアント名"}:{value:string;onChange:(value:string)=>void;clients?:ClientEntry[];knownNames?:string[];disabled?:boolean;required?:boolean;label?:string}) {
 const id=useId();
 const names=useMemo(()=>[...new Set([...clients.filter(c=>c.active).map(c=>c.name),...knownNames.filter(name=>!clients.some(c=>!c.active&&c.name===name))].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja')),[clients,knownNames]);
 return <label>{label}<input aria-label={label} list={id} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} required={required} maxLength={100} placeholder="登録済みの会社を選ぶ・新しい会社名を入力" autoComplete="off"/><datalist id={id}>{names.map(name=><option key={name} value={name}/>)}</datalist><span className="panel-note">入力すると登録済みの会社名が候補に出ます。</span></label>;
}

export function ClientMaster({clients,knownNames,busy,onSave}:{clients:ClientEntry[];knownNames:string[];busy:boolean;onSave:(payload:{id?:string;version?:string;name:string;active?:boolean})=>Promise<boolean>}) {
 const [name,setName]=useState(''),[search,setSearch]=useState(''),[editing,setEditing]=useState<string|null>(null),[editName,setEditName]=useState(''),[editVersion,setEditVersion]=useState('');
 const unmanaged=[...new Set(knownNames.filter(Boolean))].filter(name=>!clients.some(c=>c.name===name));
 const visible=clients.filter(c=>c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 return <section className="client-master card"><h3>取引先</h3><p className="panel-note">正式な会社名を登録し、次の提案から選択できます。名称を編集しても過去の提案は書き換わりません。</p>
 <form className="client-add-form" onSubmit={async e=>{e.preventDefault();if(await onSave({name:name.trim()}))setName('');}}><label>新しい取引先<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} disabled={busy} placeholder="正式な会社名"/></label><button className="primary-button" disabled={busy||!name.trim()}><Plus size={16}/>登録</button></form>
 <label>取引先を検索<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="会社名で検索"/></label>
 <div className="client-master-list">{visible.map(client=><article key={client.id}>{editing===client.id?<form onSubmit={async e=>{e.preventDefault();if(await onSave({id:client.id,version:editVersion,name:editName.trim(),active:client.active}))setEditing(null);}}><input aria-label={`${client.name}の新しい名称`} required value={editName} onChange={e=>setEditName(e.target.value)} maxLength={100} disabled={busy}/><button className="secondary-button" disabled={busy||!editName.trim()}>保存</button><button className="text-button" type="button" disabled={busy} onClick={()=>setEditing(null)}>キャンセル</button></form>:<><div><strong>{client.name}</strong>{!client.active&&<small>候補から非表示</small>}</div><div><button className="text-button" disabled={busy} onClick={()=>{setEditing(client.id);setEditName(client.name);setEditVersion(client.version);}}><Pencil size={14}/>名称を編集</button><button className="text-button" disabled={busy} onClick={()=>void onSave({...client,active:!client.active})}>{client.active?'候補から隠す':'候補に戻す'}</button></div></>}</article>)}</div>
 {!clients.length&&<p className="empty-state">取引先はまだ登録されていません。</p>}
 {!!unmanaged.length&&<details><summary>過去の提案にある会社を登録（{unmanaged.length}社）</summary><p className="panel-note">表記が重複していないか確認して登録してください。</p>{unmanaged.filter(n=>n.toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice(0,100).map(name=><article key={name}><strong>{name}</strong><button className="text-button" disabled={busy} onClick={()=>void onSave({name})}><Plus size={14}/>登録する</button></article>)}</details>}
 </section>;
}
