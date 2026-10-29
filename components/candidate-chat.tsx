import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Copy, LoaderCircle, MessageCircle, Send, Square, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { CandidateGroup } from "@/lib/candidate-groups";
import type { CandidateProfile } from "@/lib/candidate-intake";
import { unicodeLength } from "@/lib/candidate-intake";
import type { InterviewReview } from "@/lib/sheets-client";
import { valueAt } from "@/lib/management-data";
import { answerCandidateFacts, buildCandidateChatContext, candidateChatProfileChoices, type CandidateChatSource } from "@/lib/candidate-chat";
import { generateCandidateChat, getOnDeviceAiAvailability, type OnDeviceAiAvailability, type OnDeviceAiProgress } from "@/lib/on-device-ai";
import "./candidate-chat.css";

type ChatMessage = {id:string;role:"user"|"assistant";content:string;engine:"device"|"records"|"record-check";fingerprint:string;sources:CandidateChatSource[]};
type Props = {group:CandidateGroup;profiles:CandidateProfile[];reviews:InterviewReview[];identityKey:string;open:boolean;onClose:()=>void};
const prompts=[
 {question:"追加入力したほうがいい情報は？",label:"不足・あいまいな情報",description:"確認する項目・理由・本人への質問"},
 {question:"提案先ごとの進捗は？",label:"会社ごとの進捗",description:"予定と実施済みの記録を確認"},
 {question:"次に確認することは？",label:"次の対応を決める",description:"連絡や面談前に確認すること"},
 {question:"希望条件と職歴を整理して",label:"登録内容を要約",description:"希望条件・経験を読み返す"},
];
const errorMessage=(error:unknown)=>{
 const code=error&&typeof error==="object"&&"code" in error?String(error.code):"";
 return ({UNAVAILABLE:"このブラウザでは端末内AIを使えません。「登録情報を確認」へ切り替えると記録を調べられます。",TIMEOUT:"AIの準備・回答に時間がかかったため中止しました。質問は残っています。",INVALID_INPUT:"一度に参照する情報が長すぎる可能性があります。参照する記録を1件選ぶか、質問を短くしてください。",INVALID_RESPONSE:"根拠を確認できる回答を取得できませんでした。再試行するか、登録情報から確認してください。",ABORTED:"回答を中止しました。",MODEL_ERROR:"端末内AIを実行できませんでした。登録情報の確認は引き続き使えます。"} as Record<string,string>)[code]||"回答を作成できませんでした。質問は残っています。";
};

/** Each login and candidate has a separate, memory-only conversation. */
export function CandidateChat(props:Props){return <CandidateChatSession key={`${props.identityKey}:${props.group.key}`} {...props}/>;}

function CandidateChatSession({group,profiles,reviews,open,onClose}:Props){
 const id=useId();
 const [scope,setScope]=useState("all"),[engine,setEngine]=useState<"device"|"records">("records"),[availability,setAvailability]=useState<OnDeviceAiAvailability|"checking">("checking");
 const [messages,setMessages]=useState<ChatMessage[]>([]),[draft,setDraft]=useState(""),[running,setRunning]=useState(false),[progress,setProgress]=useState<OnDeviceAiProgress|null>(null);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[retryQuestion,setRetryQuestion]=useState(""),[copied,setCopied]=useState("");
 const pending=useRef<AbortController|null>(null),generation=useRef(0),mounted=useRef(true),engineTouched=useRef(false),conversation=useRef<HTMLDivElement|null>(null),composer=useRef<HTMLTextAreaElement|null>(null);
 const profileChoices=useMemo(()=>candidateChatProfileChoices(group,profiles),[group,profiles]);
 const context=useMemo(()=>buildCandidateChatContext({group:scope==="all"||scope.startsWith("profile:")?group:{...group,records:group.records.filter(record=>record.recordId===scope)},profiles,reviews,...(scope.startsWith("profile:")?{selectedProfileId:scope.slice(8)}:{})}),[group,profiles,reviews,scope]);
 const identityBlocked=!!context.identityIssue;
 const fingerprint=JSON.stringify({scope,context}),currentFingerprint=useRef(fingerprint);
 currentFingerprint.current=fingerprint;
 const available=availability!=="checking"&&availability!=="unavailable";
 const sourceCounts={records:context.sources.filter(source=>source.kind==="record").length,profiles:context.sources.filter(source=>source.kind==="profile").length,reviews:context.sources.filter(source=>source.kind==="review").length};
 const latestAnswer=[...messages].reverse().find(message=>message.role==="assistant"&&message.fingerprint===fingerprint);

 function cancel(){generation.current++;pending.current?.abort();pending.current=null;setRunning(false);setProgress(null);}
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;pending.current?.abort();};},[]);
 useEffect(()=>{
  if(!open){cancel();return;}
  const controller=new AbortController();setAvailability("checking");
  void getOnDeviceAiAvailability({signal:controller.signal,timeoutMs:8000}).then(value=>{if(!controller.signal.aborted){setAvailability(value);if(!engineTouched.current)setEngine(value==="unavailable"?"records":"device");}}).catch(()=>{if(!controller.signal.aborted)setAvailability("unavailable");});
  return()=>controller.abort();
 },[open]);
 useEffect(()=>{cancel();setError("");setRetryQuestion("");setNotice(messages.length?"参照する情報が変わりました。以前の回答は更新前の内容です。新しい質問は最新の登録情報から確認します。":"");},[fingerprint]);
 useEffect(()=>{if(open&&conversation.current)conversation.current.scrollTop=conversation.current.scrollHeight;},[messages,running,open]);

 async function ask(question:string,retry=false,selectedEngine=engine){
  const q=question.trim();
  if(!q||unicodeLength(q)>1000||pending.current||!open||identityBlocked||selectedEngine==="device"&&!available)return;
  engineTouched.current=true;
  const request=++generation.current,controller=new AbortController(),signature=fingerprint;
  pending.current=controller;setError("");setNotice("");setRetryQuestion(q);setCopied("");setDraft("");
  if(!retry)setMessages(previous=>[...previous,{id:crypto.randomUUID(),role:"user",content:q,engine:selectedEngine,fingerprint:signature,sources:[]} satisfies ChatMessage].slice(-40));
  const current=()=>mounted.current&&!controller.signal.aborted&&request===generation.current&&signature===currentFingerprint.current;
  setRunning(true);setProgress(selectedEngine==="device"?{phase:"checking"}:null);
  try{
   const history=messages.filter(message=>message.fingerprint===signature).slice(-10).map(message=>({role:message.role,content:unicodeLength(message.content)>3000?`${Array.from(message.content).slice(0,2970).join("")}\n（履歴の続きは省略）`:message.content}));
   if(retry&&history.at(-1)?.role==="user"&&history.at(-1)?.content===q)history.pop();
   const answer=selectedEngine==="device"?await generateCandidateChat({context,question:q,history},{signal:controller.signal,timeoutMs:120000,preparationTimeoutMs:600000,onProgress:value=>{if(current())setProgress(value);}}):answerCandidateFacts(context,q,history);
   if(current()){
    const content="answer" in answer?answer.answer:answer.text;
    setMessages(previous=>[...previous,{id:crypto.randomUUID(),role:"assistant",content,engine:answer.method==="record-check"?"record-check":selectedEngine,fingerprint:signature,sources:context.sources.filter(source=>answer.sourceIds.includes(source.id))} satisfies ChatMessage].slice(-40));
    setRetryQuestion("");if(selectedEngine==="device")setAvailability("available");
   }
  }catch(value){if(current())setError(errorMessage(value));}
  finally{if(current()){pending.current=null;setRunning(false);setProgress(null);}}
 }
 function changeEngine(value:"device"|"records"){engineTouched.current=true;cancel();setEngine(value);setError("");setNotice("");setRetryQuestion("");}
 function editQuestion(){setDraft(previous=>previous.trim()?previous:retryQuestion);setError("");composer.current?.focus();}
 function close(){cancel();onClose();}
 async function copy(message:ChatMessage){
  if(message.fingerprint!==fingerprint)return;
  try{await navigator.clipboard.writeText(`${message.content}${message.sources.length?`\n\n参照：${message.sources.map(source=>source.label).join(" / ")}`:""}`);if(mounted.current)setCopied(message.id);}
  catch{if(mounted.current)setNotice("コピーできませんでした。回答の文章を選択してコピーしてください。");}
 }
 const runningLabel=progress?.phase==="downloading"?progress.downloadProgress===1?"端末内AIを起動しています…":`モデルを準備しています${typeof progress.downloadProgress==="number"?`（${Math.round(progress.downloadProgress*100)}%）`:""}`:progress?.phase==="generating"?"登録情報を読んで回答しています…":"端末内AIを確認しています…";
 const overLimit=unicodeLength(draft)>1000;
 return <Dialog open={open} onOpenChange={value=>{if(!value)close();}}><DialogContent presentation="panel" className="candidate-chat-panel"><DialogHeader><DialogTitle><MessageCircle size={20}/>{group.name||"候補者"}に関する相談</DialogTitle><DialogDescription>不足情報の確認、提案先の進捗、次の対応を整理します。</DialogDescription></DialogHeader>
  <div className="candidate-chat-controls">
   <label htmlFor={`${id}-scope`}>参照する記録<select id={`${id}-scope`} value={scope} aria-invalid={identityBlocked} aria-describedby={identityBlocked?`${id}-identity`:undefined} onChange={event=>{cancel();setScope(event.target.value);}}><option value="all" disabled={profileChoices.length>1}>{profileChoices.length>1?"記録・基本情報を選んでください":"すべての提案・履歴"}（{group.records.length}件）</option>{profileChoices.length>1&&<optgroup label="基本情報ごとに確認">{profileChoices.map(choice=><option key={choice.profileId} value={`profile:${choice.profileId}`}>{choice.label}</option>)}</optgroup>}<optgroup label="記録を1件選ぶ">{group.records.map(record=><option key={record.recordId} value={record.recordId}>{valueAt(record,2)||"未提案"} · {valueAt(record,1)||"面談日未登録"} · 管理行{record.row}</option>)}</optgroup></select></label>
   <div className="candidate-chat-engines" role="group" aria-label="回答方法"><button type="button" aria-pressed={engine==="device"} disabled={!available} onClick={()=>changeEngine("device")}>端末内AI</button><button type="button" aria-pressed={engine==="records"} onClick={()=>changeEngine("records")}>登録情報を確認</button></div>
   <p className="candidate-chat-method" role="status"><span className="candidate-chat-method-long">{availability==="checking"?"端末内AIの対応状況を確認中。登録情報の確認はすぐに使えます。":engine==="device"?"自由な相談・文章の整理に使えます。初回はモデルの準備に時間がかかる場合があります。不足情報は入力チェックで確認します。":`記録にある事実の抽出・不足情報のチェックに使えます（AI未使用）。${availability==="unavailable"?"自由なAI相談は対応するPC版Chromeで利用できます。":"自由な質問や文章の整理は「端末内AI」を選んでください。"}`}</span><span className="candidate-chat-method-short">{availability==="checking"?"端末内AIの対応状況を確認中です。":engine==="device"?"端末内AI：自由な相談・文章整理。初回は準備が必要です。":"登録情報：事実の抽出・入力チェック（AI未使用）。"}</span></p>
   <p className="candidate-chat-source-count">参照中：提案・履歴 {sourceCounts.records}件 · 基本情報 {sourceCounts.profiles}件 · 振り返り {sourceCounts.reviews}件</p>
   {identityBlocked&&<p id={`${id}-identity`} className="candidate-chat-context-note" role="alert">{context.identityIssue!.message}</p>}
   {(context.omittedRecords>0||context.sources.some(source=>source.facts.some(fact=>fact.label==="省略")))&&<p className="candidate-chat-context-note">情報量が多いため、一部の情報を省略しています。詳しく確認する場合は記録を1件選んでください。</p>}
  </div>
  <div className="candidate-chat-conversation" ref={conversation} role="log" aria-label="候補者との相談履歴" aria-live="polite" aria-relevant="additions text">
   {!messages.length&&<div className="candidate-chat-welcome"><MessageCircle size={27}/><h3>{identityBlocked?"参照する情報を選んでください":"何を確認しますか？"}</h3><p>{identityBlocked?"上の「参照する記録」から、相談したい記録または基本情報を選ぶと質問できます。":"選ぶと、この候補者の登録情報から確認します。未登録の内容は補わず、回答には参照した記録を表示します。"}</p><div className="candidate-chat-prompts">{prompts.map(prompt=><button type="button" key={prompt.question} aria-label={`${prompt.label}：${prompt.question}`} disabled={running||identityBlocked} onClick={()=>void ask(prompt.question)}><span><strong>{prompt.label}</strong><small>{prompt.description}</small></span><Send size={13}/></button>)}</div></div>}
   {messages.map(message=><article key={message.id} className={`candidate-chat-message is-${message.role}${message.fingerprint!==fingerprint?" is-stale":""}`}><header><strong>{message.role==="user"?"あなた":message.engine==="device"?"端末内AI":message.engine==="record-check"?"入力内容のチェック（AI未使用）":"登録情報から確認（AI未使用）"}</strong>{message.fingerprint!==fingerprint&&<span>更新前の参照情報</span>}</header><div className="candidate-chat-answer">{message.content}</div>{message.role==="assistant"&&<footer>{message.sources.length>0&&<details className="candidate-chat-sources"><summary>参照した記録（{message.sources.length}）</summary>{message.sources.map(source=><details key={source.id}><summary>{source.label}</summary><dl>{source.facts.map((fact,index)=><div key={`${fact.label}-${index}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></details>)}</details>}<button type="button" className="text-button" disabled={message.fingerprint!==fingerprint} aria-label="この回答をコピー" onClick={()=>void copy(message)}>{copied===message.id?<Check size={14}/>:<Copy size={14}/>} {copied===message.id?"コピー済み":"コピー"}</button></footer>}</article>)}
   {running&&<div className="candidate-chat-running" role="status"><LoaderCircle size={17}/><span>{engine==="device"?runningLabel:"登録情報を確認しています…"}</span><button type="button" className="text-button" onClick={()=>{cancel();setNotice("回答を中止しました。質問は会話に残っています。");}}><Square size={12}/>中止</button></div>}
   {error&&<div className="candidate-chat-error" role="alert"><p>{error}</p><div><button type="button" className="text-button" disabled={running} onClick={()=>void ask(retryQuestion,true)}><RotateCcw size={14}/>再試行</button><button type="button" className="text-button" onClick={editQuestion}>質問を編集</button>{engine==="device"&&<button type="button" className="text-button" onClick={()=>{changeEngine("records");void ask(retryQuestion,true,"records");}}>登録情報で確認</button>}</div></div>}
   {notice&&<p className="candidate-chat-notice" role="status">{notice}</p>}
   {latestAnswer&&!running&&!error&&<div className="candidate-chat-followup"><p>{latestAnswer.engine==="record-check"?"確認できた内容は「基本情報・紹介文」や「進捗・実績を編集」で記録してください。相談の回答だけでは登録内容は変わりません。":"回答の参照記録を確認し、実際の状況に合わせて次の対応を選んでください。"}</p><div aria-label="続けて確認すること">{(latestAnswer.engine==="record-check"?["他には？","提案先ごとの進捗は？"]:["追加入力したほうがいい情報は？","次に確認することは？"]).map(question=><button type="button" key={question} onClick={()=>void ask(question)}>{question}</button>)}</div></div>}
  </div>
  <form className="candidate-chat-composer" onSubmit={event=>{event.preventDefault();void ask(draft);}}>
   <label className="sr-only" htmlFor={`${id}-question`}>この候補者への質問</label><textarea ref={composer} id={`${id}-question`} rows={2} value={draft} onChange={event=>setDraft(event.target.value)} aria-invalid={overLimit} aria-describedby={`${id}-input-help`} placeholder="例：C面談の前に確認しておくことは？" onKeyDown={event=>{if(event.key==="Enter"&&(event.metaKey||event.ctrlKey)&&!event.nativeEvent.isComposing){event.preventDefault();void ask(draft);}}}/>
   <div className="candidate-chat-composer-bottom"><small id={`${id}-input-help`} className={overLimit?"form-error":""}>{identityBlocked?"質問する前に、参照する記録・基本情報を選んでください。":overLimit?"質問は1,000文字以内で入力してください。":`${unicodeLength(draft)} / 1,000文字 · ⌘ / Ctrl + Enterで送信`}</small><button type="submit" className="primary-button" disabled={running||identityBlocked||!draft.trim()||overLimit||engine==="device"&&!available}><Send size={15}/>送信</button></div><p>情報を外部AIへ送信せず、会話をシートに保存しません。AIの回答は記録と照合してください。</p>
  </form>
 </DialogContent></Dialog>;
}
