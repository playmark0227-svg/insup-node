import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Clipboard, Clock3, ListChecks, LoaderCircle, MessageSquareText, RefreshCw, Sparkles } from "lucide-react";
import type { SheetSnapshot } from "@/lib/sheets-client";
import { buildFollowUpTasks, buildWorkspaceInsightAggregate, insightMetrics, insightPeriodLabel, insightToday, workspaceEvidenceLabel, workspaceInsightCopyText, workspaceInsightFingerprint, type FollowUpTask, type WorkspaceInsightAdvice, type WorkspaceInsightState } from "@/lib/workspace-insights";
import "./workspace-insights.css";

type InsightTab = "tasks" | "coach" | "meeting";
type WorkspaceInsightsProps = {
  snapshot: SheetSnapshot;
  period: string;
  businessDay?: string;
  live: boolean;
  enabled?: boolean;
  active?: boolean;
  busy?: boolean;
  onReadInsights: (period: string) => Promise<WorkspaceInsightState>;
  onAnalyzeInsights: (period: string) => Promise<WorkspaceInsightAdvice>;
  onOpenRecord?: (recordId: string, kind?: FollowUpTask["kind"]) => void;
};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "AIの結果を確認できませんでした。少し待って再取得してください。";
const pendingError = (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "AI_IN_PROGRESS";
const jstDateTime = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "日時未確認";

export function WorkspaceInsights({ snapshot, period, businessDay, live, enabled = true, active = true, busy = false, onReadInsights, onAnalyzeInsights, onOpenRecord }: WorkspaceInsightsProps) {
  const id = useId();
  const admin = snapshot.self.role === "admin";
  const [tab, setTab] = useState<InsightTab>("tasks");
  const [urgency, setUrgency] = useState<"all" | FollowUpTask["urgency"]>("all");
  const [owner, setOwner] = useState("all");
  const [limit, setLimit] = useState(20);
  const [states, setStates] = useState<Record<string, WorkspaceInsightState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState<{ period: string; started: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);
  const readLock = useRef(false);
  const generateLock = useRef(false);
  const readVersion = useRef(0);
  const queuedRead = useRef<string | null>(null);
  const periodRef = useRef(period); periodRef.current = period;
  const activeRef = useRef(active); activeRef.current = active;
  const readRef = useRef(onReadInsights); readRef.current = onReadInsights;
  const busyRef = useRef(busy); busyRef.current = busy;
  const today = businessDay || insightToday();
  const tasks = useMemo(() => buildFollowUpTasks(snapshot, today), [snapshot, today]);
  const aggregate = useMemo(() => buildWorkspaceInsightAggregate(snapshot, period, today), [snapshot, period, today]);
  const state = states[period];
  const advice = state?.advice;
  const stale = !!advice && (!!state?.stale || workspaceInsightFingerprint(advice.aggregate) !== workspaceInsightFingerprint(aggregate));
  const filtered = tasks.filter(task => (urgency === "all" || task.urgency === urgency) && (owner === "all" || task.playerId === owner));
  const members = snapshot.players.filter(player => player.id !== "ADMIN" && (admin || player.id === snapshot.self.playerId));
  const hasData = aggregate.metrics.some(metric => metric.count > 0) || tasks.length > 0 || aggregate.reviewReasons.length > 0;
  const exhausted = !!state && (state.usage.userRemaining <= 0 || state.usage.teamRemaining <= 0);
  const disabled = busy || !!running || reading || !live || !enabled || !hasData || state?.configured === false || state?.pending === true || ((!advice || stale) && exhausted);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++readVersion.current; queuedRead.current = null; }; }, []);
  useEffect(() => { setLimit(20); }, [urgency, owner]);
  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - running.started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  async function readReport(target = period) {
    if (!live || !enabled || busyRef.current) return;
    if (readLock.current || generateLock.current) { queuedRead.current = target; return; }
    readLock.current = true;
    const version = ++readVersion.current;
    setReading(true);
    try {
      const result = await readRef.current(target);
      if (!mounted.current || version !== readVersion.current) return;
      setStates(previous => ({ ...previous, [target]: result }));
      setErrors(previous => ({ ...previous, [target]: "" }));
    } catch (error) {
      if (mounted.current && version === readVersion.current) setErrors(previous => ({ ...previous, [target]: errorMessage(error) }));
    } finally {
      readLock.current = false;
      if (mounted.current) setReading(false);
      const queued = queuedRead.current; queuedRead.current = null;
      if (mounted.current && activeRef.current && (queued || periodRef.current !== target)) void readReport(queued || periodRef.current);
    }
  }
  useEffect(() => { if (active && live && enabled && !busy) void readReport(period); }, [active, live, enabled, period, today, busy]);

  async function generate() {
    if (generateLock.current || readLock.current || disabled) return;
    if (advice && !stale) { void readReport(); return; }
    generateLock.current = true;
    ++readVersion.current;
    const target = period;
    setRunning({ period: target, started: Date.now() });
    setErrors(previous => ({ ...previous, [target]: "" }));
    try {
      const result = await onAnalyzeInsights(target);
      if (!mounted.current) return;
      setStates(previous => ({ ...previous, [target]: { advice: result, stale: false, configured: true, pending: false, usage: result.usage || previous[target]?.usage || { userRemaining: 0, teamRemaining: 0, resetAt: "" } } }));
      if (periodRef.current === target && tab === "tasks") setTab("coach");
    } catch (error) {
      if (!mounted.current) return;
      setErrors(previous => ({ ...previous, [target]: errorMessage(error) }));
      if (pendingError(error)) setStates(previous => ({ ...previous, [target]: { advice: previous[target]?.advice || null, stale: previous[target]?.stale || false, configured: previous[target]?.configured ?? true, pending: true, usage: previous[target]?.usage || { userRemaining: 0, teamRemaining: 0, resetAt: "" } } }));
    } finally {
      generateLock.current = false;
      if (mounted.current) {
        setRunning(null);
        const queued = queuedRead.current; queuedRead.current = null;
        if (activeRef.current && (queued || periodRef.current !== target)) void readReport(queued || periodRef.current);
      }
    }
  }

  async function copyReport() {
    if (!advice) return;
    try {
      await navigator.clipboard.writeText((stale ? "※以前の集計によるAIの整理です。最新の記録を確認してください。\n\n" : "") + workspaceInsightCopyText(advice));
      if (mounted.current) { setCopied(true); setTimeout(() => { if (mounted.current) setCopied(false); }, 2500); }
    } catch { if (mounted.current) setErrors(previous => ({ ...previous, [period]: "コピーできませんでした。表示されている文章を選択してコピーしてください。" })); }
  }
  const tabs: { value: InsightTab; label: string; icon: typeof ListChecks }[] = [{ value: "tasks", label: "次の対応", icon: ListChecks }, { value: "coach", label: "AIコーチ", icon: Sparkles }, { value: "meeting", label: admin ? "ミーティング準備" : "面談準備", icon: MessageSquareText }];

  return <div className="insight-workspace">
    <section className="card insight-heading">
      <div><span className="eyebrow">記録から、次の対応へ</span><h2>{admin ? "チームの動きと、会議の準備" : "今日の対応と、次につながる準備"}</h2><p>未入力の日付や進捗を確認し、記録済みの成果から次の行動を整理します。</p></div>
      <div className="insight-head-count"><strong>{tasks.length}<small>件</small></strong><span>今日時点の確認対象</span></div>
    </section>
    <div className="insight-tabs" role="tablist" aria-label="活動支援の表示">
      {tabs.map((item, index) => <button key={item.value} id={`${id}-${item.value}-tab`} role="tab" aria-selected={tab === item.value} aria-controls={`${id}-${item.value}`} tabIndex={tab === item.value ? 0 : -1} onClick={() => setTab(item.value)} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        setTab(tabs[next].value);
        (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
      }}><item.icon size={17} />{item.label}</button>)}
    </div>

    {tab === "tasks" && <section className="card insight-panel" role="tabpanel" id={`${id}-tasks`} aria-labelledby={`${id}-tasks-tab`}>
      <div className="section-heading"><div><h3>先に確認すること</h3><p className="panel-note">{today.replaceAll("-", "/")}時点 · 全期間の未完了の進捗から抽出</p></div><span className="insight-data-label"><ListChecks size={15} />日付・進捗から自動整理</span></div>
      <div className="insight-task-filters"><div aria-label="確認対象の優先度">{([{ value: "all", label: "すべて" }, { value: "overdue", label: "予定日超過" }, { value: "today", label: "今日" }, { value: "followup", label: "要確認" }] as const).map(item => <button key={item.value} aria-pressed={urgency === item.value} onClick={() => setUrgency(item.value)}>{item.label}<small>{item.value === "all" ? tasks.length : tasks.filter(task => task.urgency === item.value).length}</small></button>)}</div>{admin && <label className="insight-owner">担当者<select value={owner} onChange={event => setOwner(event.target.value)}><option value="all">全員</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}</div>
      {!filtered.length ? <div className="insight-empty"><Check size={25} /><h3>{tasks.length ? "この条件の確認対象はありません" : "現在、確認対象はありません"}</h3><p>記録された予定日と実施日から判断しています。実際の状況に合わせて進捗を更新してください。</p></div> : <ol className="insight-task-list">{filtered.slice(0, limit).map(task => <li key={task.id}>
        <span className={`insight-task-urgency ${task.urgency}`}>{task.urgency === "overdue" ? "予定日超過" : task.urgency === "today" ? "今日" : "要確認"}</span>
        <div className="insight-task-body"><h4>{task.title}</h4><div className="insight-task-person"><strong>{task.candidateName}</strong>{task.companyName && <span>{task.companyName}</span>}{admin && <span>{members.find(member => member.id === task.playerId)?.name}</span>}</div><p>{task.evidence}</p><p className="insight-task-action">{task.suggestedAction}</p></div>
        {onOpenRecord && <button className="text-button" onClick={() => onOpenRecord(task.recordId, task.kind)}>進捗を確認<ArrowUpRight size={15} /></button>}
      </li>)}</ol>}
      {filtered.length > limit && <button className="secondary-button insight-more" onClick={() => setLimit(previous => previous + 20)}>さらに20件表示（残り{filtered.length - limit}件）</button>}
      <p className="panel-note">この一覧は連絡済みかどうかを判断していません。予定日超過は「記録が未完了」の可能性も含みます。実績やステータスは自動で変更しません。</p>
      <div className="insight-next"><div><strong>成果から、優先する行動を整理する</strong><p>{admin ? "AIコーチと会議の確認事項で、成果ミーティングを準備できます。" : "AIコーチで、今の成果から面談前の確認事項を整理できます。"}</p></div><button className="secondary-button" onClick={() => setTab("coach")}>AIコーチへ<ArrowUpRight size={16} /></button></div>
    </section>}

    {tab !== "tasks" && <section className="card insight-panel" role="tabpanel" id={`${id}-${tab}`} aria-labelledby={`${id}-${tab}-tab`}>
      <div className="section-heading"><div><span className="eyebrow">{insightPeriodLabel(period)} · {admin ? "チーム全体" : "あなたの成果"}</span><h3>{tab === "coach" ? "記録をもとに、次の行動を選ぶ" : admin ? "数字と確認事項を、会議で共有する" : "面談前に、確認することをそろえる"}</h3></div><button className="primary-button" disabled={disabled} onClick={() => void generate()}>{running ? <><LoaderCircle size={17} className="review-spinner" />{running.period === period ? "AIで整理中…" : "別の期間を整理中…"}</> : advice && !stale ? "保存済みの整理を再取得" : advice ? "最新の記録でAIの整理を更新" : "AIで整理を作成"}</button></div>
      <div className="insight-metrics">{aggregate.metrics.map(metric => <div key={metric.key}><span>{insightMetrics.find(item => item.key === metric.key)?.label}</span><strong>{metric.count}<small>件</small></strong>{metric.previousCount !== null && <small>{period.length === 7 ? "前月" : "前日"} {metric.previousCount}件</small>}</div>)}</div>
      <p className="panel-note">各工程に入力された日付の件数です。前月・前日はその期間全体の件数で、同じ候補者の移行率ではありません。確認対象は今日時点の全期間の進捗です。</p>
      {!live && <p className="insight-notice">サンプルではAIを生成しません。スプレッドシート接続後に、記録された成果を使って作成できます。</p>}
      {live && !enabled && <p className="insight-notice">このAI機能はまだ連携されていません。管理者がGoogle側の連携を更新すると利用できます。</p>}
      {live && enabled && !hasData && <p className="insight-notice">この期間の実績、または確認対象の進捗が記録されると、AIで整理できます。</p>}
      {state?.configured === false && <p className="insight-notice">AIの接続設定がまだ完了していません。確認対象の一覧と成果の数字は利用できます。</p>}
      {state?.pending && !running && <p className="insight-notice" role="status">この集計を別の画面で作成中です。少し待って「保存済みの整理を再取得」を押してください。</p>}
      {running && <div className="insight-progress" role="status"><LoaderCircle size={18} className="review-spinner" /><div><strong>{elapsed < 10 ? "記録済みの成果を確認しています" : elapsed < 25 ? "成果と進捗から、行動を整理しています" : "Googleからの応答を待っています"} · {elapsed}秒</strong><p>画面を切り替えても処理は続きます。応答が途切れた場合は、保存済みの整理を再取得できます。</p></div></div>}
      {errors[period] && <div className="form-error" role="alert">{errors[period]}</div>}
      <div className="insight-ai-tools">{live && enabled && <button className="text-button" disabled={busy || reading || !!running} onClick={() => void readReport()}><RefreshCw size={14} className={reading ? "review-spinner" : ""} />{reading ? "保存済みの整理を確認中…" : "保存済みの整理を再取得"}</button>}{state && <span>本日の新規生成：あなた あと{state.usage.userRemaining}回 / チーム あと{state.usage.teamRemaining}回</span>}</div>
      {exhausted && !running && <p className="insight-notice">本日の生成上限です。保存済みの整理は引き続き確認できます。</p>}
      {advice ? <div className="insight-advice"><div className="insight-report-heading"><span>AIによる行動の提案 · {jstDateTime(advice.generatedAt)} 作成</span><button className="secondary-button" onClick={() => void copyReport()}><Clipboard size={15} />{copied ? "コピーしました" : admin ? "会議用にコピー" : "準備用にコピー"}</button></div>{stale && <p className="insight-notice">記録や日付が変わったため、以前の集計による提案を表示しています。「最新の記録でAIの整理を更新」で作り直せます。</p>}<p className="insight-summary">{advice.summary}</p>
        {tab === "coach" ? <ol className="insight-priorities">{advice.priorities.map((priority, index) => <li key={index}><span>{index + 1}</span><div><h4>{priority.title}</h4><p>{priority.action}</p><small>根拠：{workspaceEvidenceLabel(priority.evidenceKey, advice.aggregate)}</small></div></li>)}</ol> : <><h4>{admin ? "会議で確認すること" : "面談前に確認すること"}</h4>{advice.meetingQuestions.length ? <ol className="insight-questions">{advice.meetingQuestions.map((question, index) => <li key={index}>{question}</li>)}</ol> : <p className="panel-note">この集計からの追加の確認事項はありません。個別の案件条件は進捗画面で確認してください。</p>}<p className="insight-notice">{admin ? "評価は数字だけで決めず、担当案件の条件と本人への確認を含めて判断してください。" : "この提案は成果の集計から作成しています。個別の候補者やクライアントの条件は、進捗画面の記録で確認してください。"}</p><button className="text-button" onClick={() => setTab("coach")}>優先する行動も確認する<ArrowUpRight size={15} /></button></>}
      </div> : !reading && !running && <div className="insight-empty insight-ai-empty"><MessageSquareText size={25} /><h3>保存済みのAIの整理はありません</h3><p>ボタンを押したときだけ生成します。生成されるまでは、記録済みの件数と確認対象の一覧を使えます。</p></div>}
      <details className="insight-privacy"><summary>AIに送る情報と、提案の扱い</summary><p>AIに送るのは、6項目の成果の件数、月間提案目標、確認対象の件数、振り返り理由の分類と件数です。氏名、会社名、連絡先、詳細メモ、担当者ID、候補者の行データは送りません。プレイヤーは本人の集計だけが対象です。</p><p>同じ集計の結果は保存して再利用します。生成はGoogleの無料枠とアプリの回数制限の範囲内で行います。無料枠に送った入力はGoogleのサービス改善に利用される場合があります。</p><p>AIは優先する行動や確認事項を提案します。成果の変更、連絡の送信、採否・人事評価は実行しません。提案は記録と実際の状況を確認してから使ってください。</p></details>
    </section>}
  </div>;
}
