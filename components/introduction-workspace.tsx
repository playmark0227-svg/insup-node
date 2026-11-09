import {useEffect,useRef,useState} from "react";
import {IntroductionComposer,introductionSavedProfileKey,type IntroductionComposerProps,type IntroductionBindingConfirmation} from "./introduction-composer";
import "./introduction-workspace.css";

type EditorTarget=Omit<IntroductionComposerProps,"onDirtyChange"|"onPendingChange"|"editorSessionKey"|"onFirstSaveBindingConfirmed">;
type Slot={recordId:string;ownerId:string;draftKey:string;instanceKey:string};
type Status={dirty:boolean;pending:boolean};
export type IntroductionWorkspaceState={identityKey:string;dirtyRecordIds:string[];pendingRecordIds:string[];firstDirtyRecordId:string|null;firstPendingRecordId:string|null;activeDirty:boolean;activePending:boolean};
export type IntroductionWorkspaceProps={identityKey:string;activeRecordId:string|null;getTarget:(recordId:string)=>EditorTarget|null;onStateChange:(state:IntroductionWorkspaceState)=>void;onSelectRecord?:(recordId:string)=>void};
const emptyState=(identityKey:string):IntroductionWorkspaceState=>({identityKey,dirtyRecordIds:[],pendingRecordIds:[],firstDirtyRecordId:null,firstPendingRecordId:null,activeDirty:false,activePending:false});
const binding=(recordId:string,target:EditorTarget|null)=>target&&target.enabled&&target.recordId===recordId&&target.recordOwnerId&&target.recordDraftKey&&target.identityKey?{recordId,ownerId:target.recordOwnerId,draftKey:target.recordDraftKey,instanceKey:JSON.stringify([recordId,target.recordOwnerId,target.recordDraftKey])}:null;
/** Editors live only in the current login. A different visible candidate never
 * unmounts a pending save or an unfinished draft. No browser storage is used. */
export function IntroductionWorkspace(props:IntroductionWorkspaceProps){return <IntroductionWorkspaceSession key={props.identityKey} {...props}/>;}
export function IntroductionWorkspaceSession({identityKey,activeRecordId,getTarget,onStateChange,onSelectRecord}:IntroductionWorkspaceProps){
 const [storedSlots,setSlots]=useState<Slot[]>([]),[statuses,setStatuses]=useState<Record<string,Status>>({}),[,renderAssociation]=useState(0);
 const alive=useRef(true),firstSaveProofs=useRef(new Map<string,{profileKey:string;draftKey:string}>()),targetsRef=useRef(new Map<string,{slot:Slot;target:EditorTarget}>()),statusListener=useRef(onStateChange),navigationElement=useRef<HTMLElement|null>(null),callbacks=useRef(new Map<string,{dirty:(value:boolean)=>void;pending:(value:boolean)=>void;save:EditorTarget["onSave"];settings:EditorTarget["onSaveSettings"];binding:(binding:IntroductionBindingConfirmation)=>void}>());statusListener.current=onStateChange;
 const resolved=new Map<string,EditorTarget|null>();
 const targetFor=(id:string)=>{if(!resolved.has(id)){const target=getTarget(id);resolved.set(id,target?.identityKey===identityKey?target:null);}return resolved.get(id)||null;};
 let slots=storedSlots.flatMap(slot=>{
  const target=targetFor(slot.recordId),next=binding(slot.recordId,target);if(!target||!next||next.ownerId!==slot.ownerId)return [];
  if(next.draftKey===slot.draftKey)return [slot];
  // A first save can assign the profile ID. Keep that same editor only when
  // its acknowledged body also appears in the authorized canonical snapshot.
  if(slot.draftKey===slot.recordId){
   const proof=firstSaveProofs.current.get(slot.instanceKey);
   if(proof&&(proof.draftKey===next.draftKey||target.initialRead?.profile&&introductionSavedProfileKey(target.initialRead.profile)===proof.profileKey))return [{...slot,draftKey:next.draftKey}];
   if(statuses[slot.instanceKey]?.pending)return [slot];
  }
  return [];
 });
 const activeTarget=activeRecordId?targetFor(activeRecordId):null,activeBinding=activeRecordId?binding(activeRecordId,activeTarget):null;
 if(activeBinding&&!slots.some(slot=>slot.recordId===activeRecordId))slots.push(activeBinding);
 if(activeRecordId)slots=[...slots.filter(slot=>slot.recordId!==activeRecordId),...slots.filter(slot=>slot.recordId===activeRecordId)];
 const clean=slots.filter(slot=>!statuses[slot.instanceKey]?.dirty&&!statuses[slot.instanceKey]?.pending);
 const evict=new Set(clean.slice(0,Math.max(0,clean.length-12)).filter(slot=>slot.recordId!==activeRecordId).map(slot=>slot.instanceKey));slots=slots.filter(slot=>!evict.has(slot.instanceKey));
 const currentTargets=new Map<string,{slot:Slot;target:EditorTarget}>();for(const slot of slots){const target=targetFor(slot.recordId);if(target)currentTargets.set(slot.instanceKey,{slot,target});}targetsRef.current=currentTargets;
 const slotsKey=JSON.stringify(slots),statusKeys=new Set(slots.map(slot=>slot.instanceKey));
 useEffect(()=>{setSlots(previous=>JSON.stringify(previous)===slotsKey?previous:slots);setStatuses(previous=>{const kept=Object.fromEntries(Object.entries(previous).filter(([key])=>statusKeys.has(key)));return Object.keys(kept).length===Object.keys(previous).length?previous:kept;});for(const key of callbacks.current.keys())if(!statusKeys.has(key)){callbacks.current.delete(key);firstSaveProofs.current.delete(key);}},[slotsKey]);
 useEffect(()=>{const nav=navigationElement.current,button=nav?.querySelector<HTMLElement>('[aria-current="page"]');if(!nav||!button)return;const bounds=nav.getBoundingClientRect(),item=button.getBoundingClientRect();if(item.left<bounds.left)nav.scrollLeft+=item.left-bounds.left;else if(item.right>bounds.right)nav.scrollLeft+=item.right-bounds.right;},[activeRecordId,slotsKey]);
 const state=emptyState(identityKey);state.dirtyRecordIds=slots.filter(slot=>statuses[slot.instanceKey]?.dirty).map(slot=>slot.recordId);state.pendingRecordIds=slots.filter(slot=>statuses[slot.instanceKey]?.pending).map(slot=>slot.recordId);state.firstDirtyRecordId=state.dirtyRecordIds[0]||null;state.firstPendingRecordId=state.pendingRecordIds[0]||null;state.activeDirty=!!activeRecordId&&state.dirtyRecordIds.includes(activeRecordId);state.activePending=!!activeRecordId&&state.pendingRecordIds.includes(activeRecordId);const stateKey=JSON.stringify(state);
 useEffect(()=>{statusListener.current(state);},[stateKey]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;statusListener.current(emptyState(identityKey));};},[]);
 const updateStatus=(key:string,field:keyof Status,value:boolean)=>{if(!alive.current||!targetsRef.current.has(key))return;setStatuses(previous=>{const old=previous[key]||{dirty:false,pending:false};return old[field]===value?previous:{...previous,[key]:{...old,[field]:value}};});};
 function listeners(slot:Slot){
  let found=callbacks.current.get(slot.instanceKey);if(found)return found;const key=slot.instanceKey;
  const current=()=>{const value=targetsRef.current.get(key);if(!alive.current||!value)throw Object.assign(new Error("候補者情報が更新されました。もう一度開いて内容を確認してください。"),{code:"CONFLICT"});return value;};
  found={dirty:value=>updateStatus(key,"dirty",value),pending:value=>updateStatus(key,"pending",value),save:async(payload,id)=>{const entry=current(),receipt=await entry.target.onSave(payload,id);if(alive.current&&targetsRef.current.has(key)&&entry.slot.draftKey===entry.slot.recordId&&payload.recordId===entry.slot.recordId&&payload.expectedVersion===""&&(receipt===undefined||!!receipt&&typeof receipt==="object"&&"committed"in receipt&&receipt.committed===true&&"operationId"in receipt&&receipt.operationId===id)){const proof=introductionSavedProfileKey(payload.profile);if(proof){firstSaveProofs.current.set(key,{profileKey:proof,draftKey:""});renderAssociation(value=>value+1);}}return receipt;},settings:(payload,id)=>current().target.onSaveSettings(payload,id),binding:value=>{const entry=targetsRef.current.get(key),proof=firstSaveProofs.current.get(key);if(!alive.current||!entry||!proof||value.recordId!==entry.slot.recordId||value.playerId!==entry.slot.ownerId||!value.draftKey)return;proof.draftKey=value.draftKey;renderAssociation(value=>value+1);}};callbacks.current.set(key,found);return found;
 }
 const visibleTabs=slots.filter(slot=>slot.recordId===activeRecordId||statuses[slot.instanceKey]?.dirty||statuses[slot.instanceKey]?.pending);
 return <div className="introduction-workspace">
  {visibleTabs.length>1&&onSelectRecord&&<nav ref={navigationElement} className="intro-v2-actions" aria-label="開いている候補者の紹介文">{visibleTabs.map(slot=><button type="button" key={slot.instanceKey} className="secondary-button" aria-current={slot.recordId===activeRecordId?"page":undefined} onClick={()=>onSelectRecord(slot.recordId)}>{targetFor(slot.recordId)?.candidateName}{statuses[slot.instanceKey]?.pending?" · 処理中":statuses[slot.instanceKey]?.dirty?" · 未保存":""}</button>)}</nav>}
  {slots.map(slot=>{const target=targetFor(slot.recordId)!;const events=listeners(slot),pinned=slot.draftKey!==target.recordDraftKey;return <div key={slot.instanceKey} hidden={slot.recordId!==activeRecordId} data-introduction-record={slot.recordId}><IntroductionComposer {...target} editorSessionKey={slot.instanceKey} recordDraftKey={slot.draftKey} initialRead={pinned?undefined:target.initialRead} onSave={events.save} onSaveSettings={events.settings} onDirtyChange={events.dirty} onPendingChange={events.pending} onFirstSaveBindingConfirmed={events.binding}/></div>;})}
 </div>;
}
