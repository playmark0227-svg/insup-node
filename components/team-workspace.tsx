import {useEffect,useRef,useState} from "react";
import {AtSign,BriefcaseBusiness,CheckCircle2,ChevronRight,LoaderCircle,MessageCircle,Plus,RefreshCw,Reply,Search,Send,Trash2,Users,X} from "lucide-react";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "./ui/dialog";
import {linkedCandidateProfile,type CandidateProfile} from "@/lib/candidate-intake";
import {isUncertainWrite,type CandidateRecord} from "@/lib/sheets-client";
import {parseTeamWorkspace,teamCommentsFor,teamJobStatuses,type TeamCandidatePublication,type TeamComment,type TeamJob,type TeamJobStatus,type TeamWorkspaceData,type SaveTeamJobInput} from "@/lib/team-workspace";
import "./team-workspace.css";

export type TeamMutationAction="publishTeamCandidate"|"unpublishTeamCandidate"|"saveTeamComment"|"saveTeamJob";
export type TeamWorkspaceProps={
 identityKey:string;admin:boolean;selfId:string;active:boolean;canWrite:boolean;enabled:boolean;
 records:CandidateRecord[];profiles:CandidateProfile[];
 onRead:()=>Promise<TeamWorkspaceData>;
 onSave:(action:TeamMutationAction,payload:unknown,operationId:string)=>Promise<void>;
 onDirtyChange?:(dirty:boolean)=>void;onPendingChange?:(pending:boolean)=>void;
 onOpenRecord?:(recordId:string)=>void;onPropose?:(job:TeamJob)=>void;
};
type CommentDraft={body:string;parentId:string;mentionIds:string[];mentionLabels:Record<string,string>};
type SourcePreview={recordId:string;rowVersion:string;profileVersion:string;profileId:string;ownerId:string;candidateName:string;introduction:string;publicationId?:string;version?:string;published?:boolean};
type JobDraft=SaveTeamJobInput&{baseline:string};
type PendingWrite={action:TeamMutationAction;payload:unknown;operationId:string;label:string;onCommitted:()=>void};
type PendingState={label:string;inFlight:boolean;uncertain:boolean};
const jobLabels:Record<TeamJobStatus,string>={open:"募集中",paused:"一時停止",closed:"募集終了"};
const blankComment=():CommentDraft=>({body:"",parentId:"",mentionIds:[],mentionLabels:{}});
const blankJob=():SaveTeamJobInput=>({company:"",title:"",description:"",requirements:"",workConditions:"",status:"open"});
const jobValues=(value:SaveTeamJobInput)=>({company:value.company,title:value.title,description:value.description,requirements:value.requirements,workConditions:value.workConditions,status:value.status});
const jobFields=[["company","会社名"],["title","案件名"],["description","仕事内容"],["requirements","必須条件・確認事項"],["workConditions","稼働条件"],["status","募集状態"]] as const;
type JobField=typeof jobFields[number][0];
type JobResolution={version:string;choices:Partial<Record<JobField,"mine"|"latest">>};
const dateLabel=(value:string)=>new Date(value).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
const contains=(value:string,query:string)=>value.normalize("NFKC").toLocaleLowerCase("ja").includes(query.normalize("NFKC").toLocaleLowerCase("ja").trim());
const noticeError=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;

/** A login change remounts every draft and discards late responses from the old session. */
export function TeamWorkspace(props:TeamWorkspaceProps){return <TeamWorkspaceSession key={props.identityKey} {...props}/>;}

export function TeamWorkspaceSession({identityKey,admin,selfId,active,canWrite,enabled,records,profiles,onRead,onSave,onDirtyChange,onPendingChange,onOpenRecord,onPropose}:TeamWorkspaceProps){
 const [data,setData]=useState<TeamWorkspaceData|null>(null),[loading,setLoading]=useState(false),[readError,setReadError]=useState(""),[saveError,setSaveError]=useState(""),[notice,setNotice]=useState(""),[readAt,setReadAt]=useState("");
 const [tab,setTab]=useState<"candidates"|"jobs">("candidates"),[search,setSearch]=useState(""),[candidateView,setCandidateView]=useState<"all"|"mentions"|"withdrawn">("all"),[jobStatus,setJobStatus]=useState<TeamJobStatus|"all">("open");
 const [selectedCandidate,setSelectedCandidate]=useState<string|null>(null),[selectedJob,setSelectedJob]=useState<string|null>(null),[jobDraft,setJobDraft]=useState<JobDraft|null>(null),[jobEditorOpen,setJobEditorOpen]=useState(false),[discardJobConfirm,setDiscardJobConfirm]=useState(false);
 const [jobCompareOpen,setJobCompareOpen]=useState(false),[jobResolution,setJobResolution]=useState<JobResolution|null>(null);
 const [publishOpen,setPublishOpen]=useState(false),[sourcePreview,setSourcePreview]=useState<SourcePreview|null>(null),[publicationConfirmed,setPublicationConfirmed]=useState(false),[withdrawConfirm,setWithdrawConfirm]=useState(false);
 const [commentDrafts,setCommentDrafts]=useState<Record<string,CommentDraft>>({}),[deleteComment,setDeleteComment]=useState<string|null>(null),[seenMentions,setSeenMentions]=useState<Set<string>>(()=>new Set());
 const [copiedUnavailableDraft,setCopiedUnavailableDraft]=useState<string|null>(null),[discardUnavailableDraft,setDiscardUnavailableDraft]=useState<string|null>(null),[recoveryError,setRecoveryError]=useState("");
 const [pendingState,setPendingState]=useState<PendingState|null>(null);
 const alive=useRef(true),session=useRef(identityKey),readSequence=useRef(0),reading=useRef(false),readEpoch=useRef(0),queuedRefresh=useRef(false),pending=useRef<PendingWrite|null>(null),writing=useRef(false),dataRef=useRef(data);
 const readLatest=useRef(onRead),saveLatest=useRef(onSave),dirtyListener=useRef(onDirtyChange),pendingListener=useRef(onPendingChange),pollBlocked=useRef(false);
 readLatest.current=onRead;saveLatest.current=onSave;dirtyListener.current=onDirtyChange;pendingListener.current=onPendingChange;session.current=identityKey;dataRef.current=data;
 const commentDirty=Object.values(commentDrafts).some(draft=>!!draft.body.trim()||draft.mentionIds.length>0);
 const jobDirty=!!jobDraft&&JSON.stringify(jobValues(jobDraft))!==jobDraft.baseline;
 const dirty=commentDirty||jobDirty||!!sourcePreview;
 const blocked=!!pendingState;
 pollBlocked.current=dirty||blocked||publishOpen||jobEditorOpen;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;readSequence.current++;dirtyListener.current?.(false);pendingListener.current?.(false);};},[]);
 useEffect(()=>{dirtyListener.current?.(dirty);},[dirty]);
 useEffect(()=>{pendingListener.current?.(!!pendingState);},[pendingState]);

 async function refresh(afterMutation=false){
  if(!enabled)return;
  if(reading.current){if(afterMutation)queuedRefresh.current=true;return;}
  const serial=++readSequence.current,captured=identityKey,epoch=readEpoch.current;reading.current=true;queuedRefresh.current=false;setLoading(true);setReadError("");
  const current=()=>alive.current&&session.current===captured&&serial===readSequence.current;
  try{const result=parseTeamWorkspace(await readLatest.current());if(current()&&epoch===readEpoch.current){setData(result);dataRef.current=result;setReadAt(new Date().toISOString());}}
  catch(error){if(current()&&epoch===readEpoch.current)setReadError(noticeError(error,"社内共有を取得できませんでした。表示済みの内容は保持しています。"));}
  finally{if(current()){reading.current=false;setLoading(false);if(queuedRefresh.current){queuedRefresh.current=false;void refreshLatest.current();}}}
 }
 const refreshLatest=useRef(refresh);refreshLatest.current=refresh;
 useEffect(()=>{
  if(!active||!enabled)return;
  if(!dataRef.current)void refreshLatest.current();
  const timer=setInterval(()=>{if(!pollBlocked.current)void refreshLatest.current();},30_000);
  return()=>clearInterval(timer);
 },[active,enabled]);

 async function submit(job:PendingWrite){
  if(writing.current||!enabled||!canWrite||pending.current&&pending.current!==job)return;
  const captured=identityKey;pending.current=job;writing.current=true;setPendingState({label:job.label,inFlight:true,uncertain:false});setSaveError("");setNotice("");
  try{
   await saveLatest.current(job.action,job.payload,job.operationId);
   if(!alive.current||session.current!==captured)return;
   readEpoch.current++;pending.current=null;writing.current=false;setPendingState(null);job.onCommitted();setNotice(`${job.label}。保存しました。`);void refreshLatest.current(true);
  }catch(error){
   if(!alive.current||session.current!==captured)return;
   writing.current=false;const uncertain=isUncertainWrite(error);
   if(uncertain)setPendingState({label:job.label,inFlight:false,uncertain:true});else{pending.current=null;setPendingState(null);}
   setSaveError(noticeError(error,"保存できませんでした。入力は保持しています。"));
   if(!uncertain&&error&&typeof error==="object"&&"code" in error&&error.code==="CONFLICT"){readEpoch.current++;void refreshLatest.current(true);}
  }
 }
 function mutate(action:TeamMutationAction,payload:unknown,label:string,onCommitted:()=>void){
  if(blocked||pending.current||!canWrite||!enabled)return;
  void submit({action,payload:structuredClone(payload),operationId:crypto.randomUUID(),label,onCommitted});
 }

 const sources=records.flatMap(record=>{
  if(!admin&&record.playerId!==selfId||data&&!data.players.some(player=>player.id===record.playerId&&player.role==="player"))return [];
  const profile=linkedCandidateProfile(profiles,record);
  return profile?.introduction.trim()?[{record,profile}]:[];
 }).filter((source,index,list)=>list.findIndex(item=>item.profile.profileId===source.profile.profileId&&item.record.playerId===source.record.playerId)===index);
 function previewSource(recordId:string){
  const source=sources.find(item=>item.record.recordId===recordId);setPublicationConfirmed(false);
  if(!source){setSourcePreview(null);return;}
  const existing=data?.candidates.find(item=>item.sourceProfileId===source.profile.profileId&&item.ownerId===source.record.playerId);
  setSourcePreview({recordId,rowVersion:source.record.rowVersion,profileVersion:source.profile.version,profileId:source.profile.profileId,ownerId:source.record.playerId,candidateName:source.record.candidateName,introduction:source.profile.introduction,...(existing?{publicationId:existing.publicationId,version:existing.version,published:existing.published}:{})});
 }
 const sourceCurrent=sourcePreview?sources.find(source=>source.record.recordId===sourcePreview.recordId):undefined;
 const staleSource=!!sourcePreview&&(!sourceCurrent||sourceCurrent.record.rowVersion!==sourcePreview.rowVersion||sourceCurrent.profile.version!==sourcePreview.profileVersion||sourceCurrent.profile.introduction!==sourcePreview.introduction||sourceCurrent.record.candidateName!==sourcePreview.candidateName);
 const latestPublication=sourcePreview?data?.candidates.find(candidate=>candidate.sourceProfileId===sourcePreview.profileId&&candidate.ownerId===sourcePreview.ownerId):undefined;
 const stalePublication=!!sourcePreview&&!!data&&(sourcePreview.publicationId!==latestPublication?.publicationId||sourcePreview.version!==latestPublication?.version||sourcePreview.published!==latestPublication?.published);
 const stalePreview=staleSource||stalePublication;
 const ownerName=(id:string)=>data?.players.find(player=>player.id===id)?.name||"以前の社内メンバー";
 const mentions=(data?.comments||[]).filter(comment=>!comment.deleted&&comment.mentionIds.includes(selfId));
 const unseen=mentions.filter(comment=>!seenMentions.has(comment.commentId));
 const unavailableDrafts=data?Object.entries(commentDrafts).filter(([publicationId,draft])=>(!!draft.body.trim()||draft.mentionIds.length>0)&&!data.candidates.some(candidate=>candidate.publicationId===publicationId&&candidate.published)):[];
 const shownCandidates=(data?.candidates||[]).filter(candidate=>(candidateView==="withdrawn"?!candidate.published&&candidate.canManage:candidate.published)&&(candidateView!=="mentions"||mentions.some(comment=>comment.publicationId===candidate.publicationId))&&contains(`${candidate.candidateName} ${candidate.introduction} ${ownerName(candidate.ownerId)}`,search)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 const shownJobs=(data?.jobs||[]).filter(job=>(jobStatus==="all"||job.status===jobStatus)&&contains(`${job.company} ${job.title} ${job.description} ${job.requirements} ${job.workConditions}`,search)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 const publication=data?.candidates.find(candidate=>candidate.publicationId===selectedCandidate);
 const thread=data&&publication?.published?teamCommentsFor(data,publication.publicationId):[];
 const composer=publication?commentDrafts[publication.publicationId]||blankComment():blankComment();
 const unavailableMentions=composer.mentionIds.filter(id=>!data?.players.some(player=>player.id===id));
 const replyTarget=thread.find(comment=>comment.commentId===composer.parentId);
 const deleting=thread.find(comment=>comment.commentId===deleteComment);
 const job=data?.jobs.find(item=>item.jobId===selectedJob);
 const latestDraftJob=jobDraft?.jobId?data?.jobs.find(item=>item.jobId===jobDraft.jobId):undefined;
 const staleJob=!!jobDraft?.jobId&&!!data&&(!latestDraftJob||latestDraftJob.version!==jobDraft.version);
 const jobBaseline=jobDraft?JSON.parse(jobDraft.baseline) as ReturnType<typeof jobValues>:null;
 const conflictFields=jobDraft&&jobBaseline&&latestDraftJob?jobFields.filter(([key])=>jobDraft[key]!==jobBaseline[key]&&latestDraftJob[key]!==jobBaseline[key]&&jobDraft[key]!==latestDraftJob[key]).map(([key])=>key):[];
 const jobChoices=jobResolution?.version===latestDraftJob?.version?jobResolution?.choices||{}:{};
 const jobResolutionComplete=conflictFields.every(key=>!!jobChoices[key]);
 const pendingMentionIds=publication?unseen.filter(comment=>comment.publicationId===publication.publicationId).map(comment=>comment.commentId):[];
 const mentionSignature=pendingMentionIds.join("|");
 useEffect(()=>{
  if(!active||!selectedCandidate||!mentionSignature)return;
  setSeenMentions(previous=>new Set([...previous,...pendingMentionIds]));
 },[active,selectedCandidate,mentionSignature]);
 function changeComment(patch:Partial<CommentDraft>){if(!publication)return;setCommentDrafts(previous=>{const before=previous[publication.publicationId]||blankComment(),next={...before,...patch};next.mentionLabels=Object.fromEntries(next.mentionIds.map(id=>[id,data?.players.find(player=>player.id===id)?.name||before.mentionLabels[id]||"以前の宛先"]));return {...previous,[publication.publicationId]:next};});}
 function openPublication(candidate:TeamCandidatePublication){setSelectedCandidate(candidate.publicationId);setWithdrawConfirm(false);setDeleteComment(null);}
 function openJobEditor(existing?:TeamJob){
  if(jobDraft&&jobDirty){setJobEditorOpen(true);setSelectedJob(null);if(jobDraft.jobId!==existing?.jobId)setSaveError("別の案件の下書きを保持しています。先に保存するか、内容を確認して破棄してください。");return;}
  const values=existing?jobValues(existing):blankJob();setJobDraft({...values,...(existing?{jobId:existing.jobId,version:existing.version}:{}),baseline:JSON.stringify(values)});setJobEditorOpen(true);setJobCompareOpen(false);setJobResolution(null);setDiscardJobConfirm(false);setSelectedJob(null);
 }
 function closeJobEditor(){setJobEditorOpen(false);setDiscardJobConfirm(false);if(!jobDirty)setJobDraft(null);}
 function publish(){
  if(!sourcePreview||!publicationConfirmed||stalePreview)return;
  const preview=sourcePreview;
  mutate("publishTeamCandidate",{recordId:preview.recordId,rowVersion:preview.rowVersion,profileVersion:preview.profileVersion,...(preview.publicationId?{publicationId:preview.publicationId,version:preview.version}:{}),confirmPublication:true},`${preview.candidateName}の紹介文を社内共有`,()=>{setPublishOpen(false);setSourcePreview(null);setPublicationConfirmed(false);});
 }
 function postComment(){
  if(!publication?.published||!composer.body.trim()||unavailableMentions.length)return;
  const id=publication.publicationId,copy={...composer,mentionIds:[...composer.mentionIds]};
  mutate("saveTeamComment",{publicationId:id,body:copy.body.trim(),parentId:copy.parentId,mentionIds:copy.mentionIds},"社内コメントを投稿",()=>setCommentDrafts(previous=>{const next={...previous};delete next[id];return next;}));
 }
 function rebaseJob(){
  if(!jobDraft||!jobBaseline||!latestDraftJob||!staleJob||!jobResolutionComplete||blocked||!canWrite)return;
  const choose=(key:JobField)=>conflictFields.includes(key)?jobChoices[key]==="mine"?jobDraft[key]:latestDraftJob[key]:jobDraft[key]!==jobBaseline[key]?jobDraft[key]:latestDraftJob[key];
  const merged:SaveTeamJobInput={company:choose("company"),title:choose("title"),description:choose("description"),requirements:choose("requirements"),workConditions:choose("workConditions"),status:choose("status") as TeamJobStatus};
  setJobDraft({...merged,jobId:latestDraftJob.jobId,version:latestDraftJob.version,baseline:JSON.stringify(jobValues(latestDraftJob))});setJobCompareOpen(false);setJobResolution(null);setSaveError("");setNotice("比較した内容を案件の下書きへ反映しました。内容を確認してから保存してください。");
 }
 async function copyUnavailableDraft(publicationId:string){
  const body=commentDrafts[publicationId]?.body;if(!body)return;const captured=identityKey;
  try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(body);if(alive.current&&session.current===captured){setCopiedUnavailableDraft(publicationId);setRecoveryError("");}}
  catch{if(alive.current&&session.current===captured)setRecoveryError("コピーできませんでした。表示されている下書きの本文を選択してコピーしてください。");}
 }

 if(!enabled)return <section className="team-workspace card" aria-label="社内共有"><h2>社内共有の接続を更新してください</h2><p>この機能を使うにはGoogle側の連携コードの更新が必要です。管理者に接続設定を確認してください。</p></section>;
 return <section className="team-workspace" aria-label="社内共有">
  <header className="team-heading"><div><h2><Users size={21}/>候補者と案件を、社内で共有</h2><p>共有した紹介文にコメントをつけ、会社ごとの提案につなげます。</p></div><button className="secondary-button" type="button" disabled={loading||blocked} onClick={()=>void refresh()}><RefreshCw size={16} className={loading?"team-spinner":""}/>{loading?"確認中…":"最新の共有を取得"}</button></header>
  <div className="team-visibility-note"><Users size={16}/><span>共有した紹介文・案件・コメントは、有効な社内メンバー全員が閲覧できます。</span></div>
  {readError&&<div className="team-error" role="alert"><p>{readError}</p><button type="button" className="text-button" disabled={loading||blocked} onClick={()=>void refresh()}>再取得</button><span>前に取得した内容がある場合は、そのまま表示しています。</span></div>}
  {saveError&&<div className="team-error" role="alert">{saveError}{!pendingState&&<p>入力内容は保持しています。内容や最新の記録を確認してから、もう一度保存してください。</p>}</div>}
  {notice&&<p className="team-saved" role="status"><CheckCircle2 size={16}/>{notice}</p>}
  {pendingState&&<div className="team-save-state" role="status"><strong>{pendingState.inFlight?<><LoaderCircle className="team-spinner" size={17}/>保存中 · {pendingState.label}</>:"保存結果が未確認です"}</strong><p>{pendingState.inFlight?"保存はこのまま続きます。他の画面へ移動できます。":"同じ内容・同じ受付番号で再試行し、重複投稿を防ぎます。下書きは保持しています。"}</p>{pendingState.uncertain&&<button type="button" className="primary-button" disabled={!canWrite} onClick={()=>{if(pending.current)void submit(pending.current);}}>同じ内容で再試行</button>}</div>}
  {jobDirty&&!jobEditorOpen&&<div className="team-draft-banner" role="status"><span>案件の未保存の下書きを保持しています。</span><button type="button" className="text-button" onClick={()=>setJobEditorOpen(true)}>案件の下書きへ戻る</button></div>}
  {unavailableDrafts.length>0&&<section className="team-unavailable-drafts card" aria-label="共有が終了した候補者への下書き"><h3>共有が終了した候補者への下書き</h3><p>共有元を現在確認できません。あなたが入力したコメントの下書きは保持しています。本文をコピーするか、内容を確認して破棄できます。</p>{recoveryError&&<p className="team-error" role="alert">{recoveryError}</p>}{unavailableDrafts.map(([publicationId,draft],index)=><article key={publicationId}><h4>コメントの下書き {index+1}</h4><p className="team-prose">{draft.body||"本文はまだ入力されていません。"}</p><div><button type="button" className="secondary-button" disabled={!draft.body} onClick={()=>void copyUnavailableDraft(publicationId)}>{copiedUnavailableDraft===publicationId?"下書きをコピーしました":"このコメント下書きをコピー"}</button><button type="button" className="text-button team-danger" disabled={blocked} onClick={()=>setDiscardUnavailableDraft(publicationId)}>この下書きを破棄</button></div>{discardUnavailableDraft===publicationId&&<div className="team-confirm-box" role="alert"><strong>このコメントの下書きを破棄しますか？</strong><p>必要であれば、先に本文をコピーしてください。</p><div><button type="button" className="secondary-button" onClick={()=>setDiscardUnavailableDraft(null)}>保持する</button><button type="button" className="secondary-button team-danger" disabled={blocked} onClick={()=>{setCommentDrafts(previous=>{const next={...previous};delete next[publicationId];return next;});setDiscardUnavailableDraft(null);}}>破棄を確定</button></div></div>}</article>)}</section>}
  <div className="team-navigation" role="group" aria-label="社内共有の表示"><button type="button" aria-pressed={tab==="candidates"} onClick={()=>{setTab("candidates");setSearch("");}}><Users size={17}/>候補者共有{unseen.length>0&&<span className="team-count">自分宛 {unseen.length}</span>}</button><button type="button" aria-pressed={tab==="jobs"} onClick={()=>{setTab("jobs");setSearch("");}}><BriefcaseBusiness size={17}/>案件</button></div>
  {!data&&loading?<p className="card team-loading" role="status">社内の共有を読み込んでいます…</p>:data&&<div className="card team-list-card">
   <div className="team-toolbar"><label className="team-search"><Search size={16}/><input aria-label={tab==="candidates"?"共有した候補者を検索":"案件を検索"} value={search} maxLength={200} onChange={event=>setSearch(event.target.value)} placeholder={tab==="candidates"?"氏名・紹介文・担当者で検索":"会社名・案件名・募集条件で検索"}/></label>
    {tab==="candidates"?<><select aria-label="候補者共有の絞り込み" value={candidateView} onChange={event=>{if(["all","mentions","withdrawn"].includes(event.target.value))setCandidateView(event.target.value as typeof candidateView);}}><option value="all">共有中の候補者</option><option value="mentions">自分宛のメンション</option><option value="withdrawn">取り下げた共有</option></select><button type="button" className="primary-button" disabled={!canWrite||blocked} onClick={()=>{setPublishOpen(true);setSelectedCandidate(null);}}><Plus size={16}/>紹介文を社内共有</button></>:<><select aria-label="案件の募集状態" value={jobStatus} onChange={event=>{if(event.target.value==="all"||teamJobStatuses.includes(event.target.value as TeamJobStatus))setJobStatus(event.target.value as typeof jobStatus);}}><option value="open">募集中</option><option value="all">すべての募集状態</option><option value="paused">一時停止</option><option value="closed">募集終了</option></select>{admin&&<button type="button" className="primary-button" disabled={!canWrite||blocked} onClick={()=>openJobEditor()}><Plus size={16}/>案件を登録</button>}</>}
   </div>
   {tab==="candidates"?<><p className="team-list-caption">{shownCandidates.length}名の共有{candidateView==="mentions"&&" · 自分が宛先に含まれるコメントのある候補者"}</p>{shownCandidates.length?<div className="team-candidate-list">{shownCandidates.map(candidate=>{const comments=data.comments.filter(comment=>comment.publicationId===candidate.publicationId&&!comment.deleted),newMentions=unseen.filter(comment=>comment.publicationId===candidate.publicationId).length,hasDraft=!!commentDrafts[candidate.publicationId]?.body.trim();return <button type="button" key={candidate.publicationId} onClick={()=>openPublication(candidate)}><div><strong>{candidate.candidateName}</strong><span>{ownerName(candidate.ownerId)} · {dateLabel(candidate.updatedAt)}</span><p>{candidate.introduction.slice(0,160)}{candidate.introduction.length>160?"…":""}</p></div><div className="team-row-meta">{!candidate.published&&<span>共有取り下げ</span>}{newMentions>0&&<span className="team-mention-badge">自分宛 {newMentions}</span>}{hasDraft&&<span>下書きあり</span>}<span><MessageCircle size={14}/>{comments.length}件</span><ChevronRight size={17}/></div></button>;})}</div>:<div className="team-empty"><Users size={26}/><h3>{candidateView==="mentions"?"自分宛のメンションはありません":search?"条件に合う共有がありません":candidateView==="withdrawn"?"取り下げた共有はありません":"まだ社内共有はありません"}</h3><p>{candidateView==="all"&&!search?"保存済みの紹介文を確認して、社内へ共有できます。候補者の登録だけでは自動公開されません。":"検索や表示条件を変更して確認してください。"}</p></div>}</>:<><p className="team-list-caption">{shownJobs.length}件の案件 · 条件を確認してから提案へ進みます</p>{shownJobs.length?<div className="team-job-list">{shownJobs.map(item=><button type="button" key={item.jobId} onClick={()=>setSelectedJob(item.jobId)}><div><span>{item.company}</span><strong>{item.title}</strong><p>{item.description.slice(0,130)}{item.description.length>130?"…":""}</p></div><div className="team-row-meta"><span className={`team-job-status is-${item.status}`}>{jobLabels[item.status]}</span><time>{dateLabel(item.updatedAt)}</time><ChevronRight size={17}/></div></button>)}</div>:<div className="team-empty"><BriefcaseBusiness size={26}/><h3>条件に合う案件はありません</h3><p>{admin?"募集条件を確認して案件を登録するか、表示条件を変更してください。":"管理者が共有した案件をここで確認できます。表示条件も確認してください。"}</p></div>}</>}
  </div>}
  <footer className="team-workspace-foot"><span>{readAt?`最終確認 ${dateLabel(readAt)}`:"まだ共有を取得していません"}</span><span>{dirty?"下書きを保持しています。保存前の入力があります。":"編集中でない間は30秒ごとに共有を確認"}</span></footer>

  {active&&publishOpen&&<Dialog open onOpenChange={open=>{if(!open)setPublishOpen(false);}}><DialogContent presentation="panel" className="team-panel"><DialogHeader><DialogTitle>保存済みの紹介文を社内共有</DialogTitle><DialogDescription>氏名と紹介文だけを、有効な社内メンバー全員へ共有します。内容を確認してから公開してください。</DialogDescription></DialogHeader><div className="team-panel-body">
   <label>共有する候補者<select aria-label="社内共有する候補者" disabled={blocked} value={sourcePreview?.recordId||""} onChange={event=>previewSource(event.target.value)}><option value="">保存済みの紹介文がある候補者を選択</option>{sources.map(source=><option key={source.record.recordId} value={source.record.recordId}>{source.record.candidateName}{admin?` · ${ownerName(source.record.playerId)}`:""}</option>)}</select></label>
   {!sources.length&&<p className="team-helper">{admin?"閲覧できる候補者":"あなたの候補者"}に保存済みの紹介文がありません。候補者の「基本情報・紹介文」で文章を確認・保存してから共有してください。</p>}
   {sourcePreview&&<><article className="team-publication-preview" aria-label="社内共有する本文の確認"><h3>{sourcePreview.candidateName}</h3><div className="team-prose">{sourcePreview.introduction}</div></article><p className="team-helper">保存済み紹介文の写しを共有します。以後の基本情報の修正は、自動ではこの共有文へ反映しません。</p>{stalePreview&&<div className="team-error" role="alert"><p>{staleSource?"元の紹介文が更新されています。最新の内容を確認し直してください。":"社内の共有状態が更新されています。現在の本文と共有状態を確認し直してください。"}</p><button type="button" className="secondary-button" disabled={blocked} onClick={()=>previewSource(sourcePreview.recordId)}>{staleSource?"最新の紹介文で確認し直す":"最新の共有状態で確認し直す"}</button></div>}<label className="team-confirm-label"><input type="checkbox" checked={publicationConfirmed} disabled={blocked||stalePreview} onChange={event=>setPublicationConfirmed(event.target.checked)}/><span>この氏名と紹介文を、有効な社内メンバー全員へ公開することを確認しました。</span></label></>}
  </div><div className="team-panel-actions"><button type="button" className="secondary-button" onClick={()=>setPublishOpen(false)}>閉じる・下書きを保持</button><button type="button" className="primary-button" disabled={!canWrite||blocked||!sourcePreview||!publicationConfirmed||stalePreview} onClick={publish}>{blocked?"保存を確認中…":sourcePreview?.publicationId?"確認した内容で共有を更新":"確認した内容を社内共有"}</button></div>{sourcePreview&&!blocked&&<button type="button" className="text-button" onClick={()=>{setSourcePreview(null);setPublicationConfirmed(false);setPublishOpen(false);}}>共有の下書きを破棄する</button>}</DialogContent></Dialog>}

  {active&&publication&&<Dialog open onOpenChange={open=>{if(!open)setSelectedCandidate(null);}}><DialogContent presentation="panel" className="team-panel"><DialogHeader><DialogTitle>{publication.candidateName}の社内共有</DialogTitle><DialogDescription>{ownerName(publication.ownerId)} · {publication.published?"共有中":"共有取り下げ"} · 更新 {dateLabel(publication.updatedAt)}</DialogDescription></DialogHeader><div className="team-panel-body">
   <article className="team-publication-preview"><h3>共有した紹介文</h3><div className="team-prose">{publication.introduction}</div></article>
   {publication.canManage&&<div className="team-publication-tools">{publication.sourceRecordId&&onOpenRecord&&<button type="button" className="text-button" onClick={()=>{setSelectedCandidate(null);onOpenRecord(publication.sourceRecordId!);}}>元の候補者情報を確認<ChevronRight size={14}/></button>}{publication.sourceRecordId&&sources.some(source=>source.record.recordId===publication.sourceRecordId)&&<button type="button" className="secondary-button" disabled={!canWrite||blocked} onClick={()=>{previewSource(publication.sourceRecordId!);setSelectedCandidate(null);setPublishOpen(true);}}>{publication.published?"保存済みの紹介文で更新":"もう一度共有する"}</button>}{publication.published&&<button type="button" className="text-button team-danger" disabled={!canWrite||blocked} onClick={()=>setWithdrawConfirm(true)}>共有を取り下げる</button>}</div>}
   {withdrawConfirm&&publication.canManage&&<div className="team-confirm-box" role="alert"><strong>この紹介文の共有を取り下げますか？</strong><p>社内一覧から外れ、コメントも共有画面では見えなくなります。元の候補者情報と紹介文は残ります。</p><div><button type="button" className="secondary-button" disabled={blocked} onClick={()=>setWithdrawConfirm(false)}>戻る</button><button type="button" className="secondary-button team-danger" disabled={!canWrite||blocked} onClick={()=>mutate("unpublishTeamCandidate",{publicationId:publication.publicationId,version:publication.version},`${publication.candidateName}の共有を取り下げ`,()=>{setWithdrawConfirm(false);setSelectedCandidate(null);})}>共有を取り下げる</button></div></div>}
   {publication.published?<section className="team-thread" aria-label="候補者の社内コメント"><h3><MessageCircle size={18}/>社内コメント <small>{thread.filter(comment=>!comment.deleted).length}件</small></h3><p className="team-helper">提案先の相談や引き継ぎを、この候補者の記録にまとめます。コメントも社内メンバー全員に表示されます。</p>
    {thread.length?<ol className="team-comments">{thread.map(comment=>{const parent=thread.find(item=>item.commentId===comment.parentId);return <li key={comment.commentId} className={comment.deleted?"team-comment-deleted":undefined}><header><strong>{ownerName(comment.authorId)}</strong><time>{dateLabel(comment.createdAt)}</time></header>{comment.deleted?<p>このコメントは削除されました。</p>:<>{parent&&<blockquote><span>{ownerName(parent.authorId)}への返信</span>{parent.deleted?"削除済みのコメント":`${parent.body.slice(0,100)}${parent.body.length>100?"…":""}`}</blockquote>}{comment.mentionIds.length>0&&<p className="team-mentions">{comment.mentionIds.map(id=><span key={id}>@{ownerName(id)}</span>)}</p>}<p className="team-prose">{comment.body}</p><footer><button type="button" className="text-button" disabled={!canWrite||blocked} onClick={()=>changeComment({parentId:comment.commentId})}><Reply size={14}/>返信</button>{comment.canManage&&<button type="button" className="text-button team-danger" disabled={!canWrite||blocked} onClick={()=>setDeleteComment(comment.commentId)}><Trash2 size={13}/>削除</button>}</footer></>}</li>;})}</ol>:<p className="team-empty-inline">コメントはまだありません。</p>}
    {deleting&&deleting.canManage&&!deleting.deleted&&<div className="team-confirm-box" role="alert"><strong>このコメントを削除しますか？</strong><p className="team-prose">{deleting.body}</p><div><button type="button" className="secondary-button" disabled={blocked} onClick={()=>setDeleteComment(null)}>戻る</button><button type="button" className="secondary-button team-danger" disabled={!canWrite||blocked} onClick={()=>mutate("saveTeamComment",{publicationId:publication.publicationId,commentId:deleting.commentId,version:deleting.version,deleted:true},"社内コメントを削除",()=>setDeleteComment(null))}>このコメントを削除</button></div></div>}
    <form className="team-comment-form" onSubmit={event=>{event.preventDefault();postComment();}}>{composer.parentId&&<div className="team-reply-target"><Reply size={14}/><span>{replyTarget?`${ownerName(replyTarget.authorId)}への返信`:"選択したコメントへの返信"}</span><button type="button" disabled={blocked} aria-label="返信先を解除" onClick={()=>changeComment({parentId:""})}><X size={15}/></button></div>}<label>コメント<textarea aria-label="社内コメントの本文" rows={4} maxLength={2000} disabled={!canWrite||blocked} value={composer.body} onChange={event=>changeComment({body:event.target.value})} placeholder="例：この方の稼働可能曜日を確認して、○○社への提案を相談したいです。"/></label>
     {unavailableMentions.length>0&&<div className="team-unavailable-mentions" role="alert"><strong>現在選べないメンション先があります。</strong><p>本文は保持しています。利用できない宛先を解除してから投稿してください。</p>{unavailableMentions.map((id,index)=><div key={id}><span>{composer.mentionLabels[id]||`以前の宛先 ${index+1}`}</span><button type="button" className="text-button" disabled={!canWrite||blocked} aria-label={`${composer.mentionLabels[id]||`以前の宛先 ${index+1}`}のメンションを解除`} onClick={()=>changeComment({mentionIds:composer.mentionIds.filter(value=>value!==id)})}><X size={14}/>この宛先を解除</button></div>)}</div>}
     <details className="team-mention-picker"><summary><AtSign size={15}/>メンションする相手を選ぶ{composer.mentionIds.length?`（${composer.mentionIds.length}名）`:""}</summary><p>選んだ相手の「自分宛のメンション」に表示します。</p><div>{data?.players.filter(player=>player.id!==selfId).map(player=><label key={player.id}><input type="checkbox" aria-label={`${player.name}にメンション`} disabled={!canWrite||blocked||!composer.mentionIds.includes(player.id)&&composer.mentionIds.length>=20} checked={composer.mentionIds.includes(player.id)} onChange={event=>changeComment({mentionIds:event.target.checked?[...composer.mentionIds,player.id]:composer.mentionIds.filter(id=>id!==player.id)})}/>{player.name}</label>)}</div></details>
     <div className="team-comment-actions"><small>{composer.body.length.toLocaleString()} / 2,000文字{composer.body.trim()&&" · 下書きは画面を移動しても保持"}</small><button className="primary-button" disabled={!canWrite||blocked||!composer.body.trim()||unavailableMentions.length>0}><Send size={15}/>コメントを投稿</button></div>{(composer.body||composer.mentionIds.length>0||composer.parentId)&&!blocked&&<button type="button" className="text-button" onClick={()=>setCommentDrafts(previous=>{const next={...previous};delete next[publication.publicationId];return next;})}>このコメントの下書きを破棄</button>}
    </form></section>:<p className="team-helper">共有を取り下げているため、コメントは表示していません。</p>}
  </div><div className="team-panel-actions"><button type="button" className="secondary-button" onClick={()=>setSelectedCandidate(null)}>閉じる</button></div></DialogContent></Dialog>}

  {active&&job&&<Dialog open onOpenChange={open=>{if(!open)setSelectedJob(null);}}><DialogContent presentation="panel" className="team-panel"><DialogHeader><DialogTitle>{job.title}</DialogTitle><DialogDescription>{job.company} · {jobLabels[job.status]} · 更新 {dateLabel(job.updatedAt)}</DialogDescription></DialogHeader><div className="team-panel-body team-job-detail"><section><h3>仕事内容</h3><p className="team-prose">{job.description||"まだ記載されていません"}</p></section><section><h3>必須条件・確認事項</h3><p className="team-prose">{job.requirements||"まだ記載されていません。提案前に確認してください。"}</p></section><section><h3>稼働条件</h3><p className="team-prose">{job.workConditions||"まだ記載されていません。提案前に確認してください。"}</p></section><p className="team-helper">案件条件と候補者の希望を確認し、提案する候補者は次の画面で選びます。</p></div><div className="team-panel-actions"><button type="button" className="secondary-button" onClick={()=>setSelectedJob(null)}>閉じる</button>{admin&&<button type="button" className="secondary-button" disabled={!canWrite||blocked} onClick={()=>openJobEditor(job)}>案件を編集</button>}{onPropose&&<button type="button" className="primary-button" disabled={!canWrite||blocked||job.status!=="open"} onClick={()=>{setSelectedJob(null);onPropose(job);}}>この案件への提案を登録<ChevronRight size={15}/></button>}</div></DialogContent></Dialog>}

  {active&&jobEditorOpen&&jobDraft&&admin&&<Dialog open onOpenChange={open=>{if(!open)closeJobEditor();}}><DialogContent presentation="panel" className="team-panel"><DialogHeader><DialogTitle>{jobDraft.jobId?"案件の共有内容を編集":"案件を社内に登録"}</DialogTitle><DialogDescription>案件の条件と募集状態を、有効な社内メンバー全員に表示します。</DialogDescription></DialogHeader><form className="team-job-form" onSubmit={event=>{event.preventDefault();if(!jobDraft.company.trim()||!jobDraft.title.trim()||!jobDirty||staleJob)return;const draft=jobDraft;mutate("saveTeamJob",{...jobValues(draft),...(draft.jobId?{jobId:draft.jobId,version:draft.version}:{})},`${draft.title}の案件情報を保存`,()=>{setJobDraft(null);setJobEditorOpen(false);setDiscardJobConfirm(false);});}}><fieldset disabled={!canWrite||blocked} className="team-panel-body">{staleJob&&<section className="team-job-conflict" aria-label="案件の更新内容を確認"><strong>この案件は、ほかの操作で更新されています。</strong><p>自分の入力は保持しています。最新版と比較して、引き継ぐ内容を確認してください。</p>{latestDraftJob&&jobBaseline?<><button type="button" className="secondary-button" onClick={()=>setJobCompareOpen(value=>!value)}>{jobCompareOpen?"比較を閉じる":"最新版と下書きを比較する"}</button>{jobCompareOpen&&<><p>最新版の更新日時：{dateLabel(latestDraftJob.updatedAt)}。両方で変わった項目は、どちらを使うか選んでください。</p><div className="team-job-comparison">{jobFields.filter(([key])=>jobDraft[key]!==jobBaseline[key]||latestDraftJob[key]!==jobBaseline[key]).map(([key,label])=><section key={key}><h4>{label}</h4><div><article><span>最新版</span><p>{key==="status"?jobLabels[latestDraftJob.status]:latestDraftJob[key]||"（空欄）"}</p></article><article><span>自分の入力</span><p>{key==="status"?jobLabels[jobDraft.status]:jobDraft[key]||"（空欄）"}</p></article></div>{conflictFields.includes(key)?<fieldset><legend>{label}に使う内容</legend>{(["latest","mine"] as const).map(choice=><label key={choice}><input type="radio" name={`team-job-${key}`} aria-label={`${label}：${choice==="mine"?"自分の入力":"最新版"}を使う`} checked={jobChoices[key]===choice} onChange={()=>setJobResolution(previous=>({version:latestDraftJob.version,choices:{...(previous?.version===latestDraftJob.version?previous.choices:{}),[key]:choice}}))}/>{choice==="mine"?"自分の入力を使う":"最新版を使う"}</label>)}</fieldset>:<small>{jobDraft[key]!==jobBaseline[key]?"自分が変えた内容を反映します。":"最新版で変わった内容を保持します。"}</small>}</section>)}</div><button type="button" className="secondary-button" disabled={!jobResolutionComplete} onClick={rebaseJob}>選んだ内容を下書きへ反映</button>{!jobResolutionComplete&&<p>両方で変わった項目の選択を済ませてください。</p>}<p>この操作だけでは保存しません。反映後に内容を確認して「案件を保存」を押してください。</p></>}</>:<p>元の案件を現在確認できません。入力内容を保持したまま、管理者と募集状態を確認してください。</p>}</section>}<label>会社名<input aria-label="案件の会社名" value={jobDraft.company} maxLength={100} required onChange={event=>setJobDraft({...jobDraft,company:event.target.value})}/></label><label>案件名<input aria-label="案件名" value={jobDraft.title} maxLength={120} required onChange={event=>setJobDraft({...jobDraft,title:event.target.value})} placeholder="例：法人向けテレアポ業務"/></label><label>仕事内容<textarea aria-label="案件の仕事内容" value={jobDraft.description} maxLength={3000} rows={5} onChange={event=>setJobDraft({...jobDraft,description:event.target.value})}/></label><label>必須条件・確認事項<textarea aria-label="案件の必須条件" value={jobDraft.requirements} maxLength={2000} rows={4} onChange={event=>setJobDraft({...jobDraft,requirements:event.target.value})}/></label><label>稼働条件<textarea aria-label="案件の稼働条件" value={jobDraft.workConditions} maxLength={2000} rows={4} onChange={event=>setJobDraft({...jobDraft,workConditions:event.target.value})} placeholder="曜日、時間帯、契約形態、報酬など。確定していない条件は確認中と記載してください。"/></label><label>募集状態<select aria-label="案件の募集状態を編集" value={jobDraft.status} onChange={event=>{if(teamJobStatuses.includes(event.target.value as TeamJobStatus))setJobDraft({...jobDraft,status:event.target.value as TeamJobStatus});}}>{teamJobStatuses.map(status=><option key={status} value={status}>{jobLabels[status]}</option>)}</select></label></fieldset><div className="team-panel-actions"><span>{jobDirty?"変更が未保存です":"変更はありません"}</span><button type="button" className="secondary-button" onClick={closeJobEditor}>閉じる・下書きを保持</button><button className="primary-button" disabled={!canWrite||blocked||!jobDirty||staleJob||!jobDraft.company.trim()||!jobDraft.title.trim()}>案件を保存</button></div>{jobDirty&&!blocked&&<button type="button" className="text-button team-job-discard" onClick={()=>setDiscardJobConfirm(true)}>案件の下書きを破棄する</button>}</form>{discardJobConfirm&&<div className="team-confirm-box" role="alert"><strong>この案件の未保存の入力を破棄しますか？</strong><p>保存済みの案件は変更しません。</p><div><button type="button" className="secondary-button" onClick={()=>setDiscardJobConfirm(false)}>編集を続ける</button><button type="button" className="secondary-button team-danger" disabled={blocked} onClick={()=>{setJobDraft(null);setJobEditorOpen(false);setDiscardJobConfirm(false);}}>下書きを破棄する</button></div></div>}</DialogContent></Dialog>}
 </section>;
}
