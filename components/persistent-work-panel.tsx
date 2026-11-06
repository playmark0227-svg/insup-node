import {useEffect,useId,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
import './ui/work-panel.css';

/** Keeps a background save's editor mounted while the native modal releases focus/inertness. */
export function PersistentWorkPanel({open,title,description,onRequestClose,children}:{open:boolean;title:string;description:string;onRequestClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId(),descriptionId=useId();
 useEffect(()=>{const node=ref.current;if(!node)return;if(open&&!node.open)node.showModal();else if(!open&&node.open)node.close();},[open]);
 useEffect(()=>()=>{ref.current?.close();},[]);
 return <dialog ref={ref} data-slot="dialog-content" data-presentation="panel" data-state={open?'open':'closed'} className="work-panel persistent-work-panel intake-dialog introduction-v2-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event=>{event.preventDefault();onRequestClose();}}>
  <div data-slot="dialog-header"><h2 data-slot="dialog-title" id={titleId}>{title}</h2><p data-slot="dialog-description" id={descriptionId}>{description}</p><button type="button" className="persistent-panel-close" aria-label="入力パネルを閉じる" onClick={onRequestClose}><X size={18}/></button></div>
  {children}
 </dialog>;
}
