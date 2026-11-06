import { useEffect, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, LoaderCircle, RefreshCw, Save, Undo2 } from "lucide-react";
import { assertMetricGoalsData, dailyBasisLabels, daysInGoalMonth, emptyMetricCounts, goalAttainment, goalDailyProgress, goalMetricLabels, goalMetrics, goalTokyoDay, resolveMetricGoal, validGoalDailyBasis, validGoalTarget, validMetricGoalMonth, type GoalDailyBasis, type GoalMetric, type MetricGoalPayload, type MetricGoalsData } from "@/lib/metric-goals";
import { isUncertainWrite } from "@/lib/sheets-client";
import { useUnsavedChangesWarning } from "./unsaved-work";
import "./metric-goals.css";

export type MetricGoalsProps = {
  identityKey: string; enabled: boolean; canWrite: boolean; admin: boolean; selfPlayerId: string; currentMonth?: string;
  onRead: (payload: { month: string }) => Promise<unknown>;
  /** Resolve only after the encrypted outbox confirms the exact operation. */
  onSave: (payload: MetricGoalPayload, operationId: string) => Promise<unknown>;
  onChanged?: () => void; onDirtyChange?: (dirty: boolean) => void; onPendingChange?: (pending: boolean) => void;
};
type Draft = { payload: MetricGoalPayload; text: Record<GoalMetric, string>; customDaysText: string; original: string };
type Pending = { id: string; payload: MetricGoalPayload; key: string };
const keyFor = (id: string, month: string) => `${month}:${id}`;
const payloadKey = (payload: MetricGoalPayload) => JSON.stringify(payload);
const numberLabel = (value: number) => value.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
function draftFrom(payload: MetricGoalPayload): Draft { return { payload, text: Object.fromEntries(goalMetrics.map(metric => [metric, payload.targets[metric] === null ? "" : String(payload.targets[metric])])) as Record<GoalMetric, string>, customDaysText: payload.customBusinessDays === null ? "" : String(payload.customBusinessDays), original: payloadKey(payload) }; }
function draftPayload(draft: Draft): MetricGoalPayload { return { ...draft.payload, targets: Object.fromEntries(goalMetrics.map(metric => [metric, draft.text[metric].trim() === "" ? null : /^\d+$/.test(draft.text[metric]) ? Number(draft.text[metric]) : NaN])) as MetricGoalPayload["targets"], customBusinessDays: draft.payload.dailyBasis === "custom" ? /^\d+$/.test(draft.customDaysText) ? Number(draft.customDaysText) : NaN : null }; }
function validDraft(draft: Draft): boolean { const payload = draftPayload(draft); return goalMetrics.every(metric => validGoalTarget(payload.targets[metric])) && validGoalDailyBasis(payload.dailyBasis, payload.customBusinessDays, payload.month); }
const draftChanged = (draft: Draft) => !validDraft(draft) || payloadKey(draftPayload(draft)) !== draft.original;
export function MetricGoals(props: MetricGoalsProps) { return <MetricGoalsSession key={props.identityKey} {...props}/>; }
function MetricGoalsSession({ enabled, canWrite, admin, selfPlayerId, currentMonth = goalTokyoDay().slice(0, 7), onRead, onSave, onChanged, onDirtyChange, onPendingChange }: MetricGoalsProps) {
  const [month, setMonth] = useState(currentMonth), [ownerId, setOwnerId] = useState(selfPlayerId), [data, setData] = useState<MetricGoalsData | null>(null), [drafts, setDrafts] = useState<Record<string, Draft>>({}), [pending, setPending] = useState<Pending | null>(null), [sending, setSending] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [conflictKey, setConflictKey] = useState("");
  const alive = useRef(true), readSequence = useRef(0), reading = useRef(false), saving = useRef(false), activeMonth = useRef(month), readRef = useRef(onRead), previousMonth = useRef(currentMonth); activeMonth.current = month; readRef.current = onRead;
  const dirty = Object.values(drafts).some(draftChanged), unsettled = !!pending || sending;
  useUnsavedChangesWarning(dirty || unsettled);
  useEffect(() => { alive.current = true; return () => { alive.current = false; readSequence.current++; }; }, []);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onPendingChange?.(unsettled); return () => onPendingChange?.(false); }, [unsettled, onPendingChange]);
  useEffect(() => { const last = previousMonth.current; previousMonth.current = currentMonth; if (last !== currentMonth && month === last && !dirty && !unsettled) setMonth(currentMonth); }, [currentMonth, month, dirty, unsettled]);
  async function load(targetMonth = activeMonth.current) {
    if (!enabled || saving.current || reading.current) return;
    const sequence = ++readSequence.current; reading.current = true; setLoading(true); setError("");
    try { const next = await readRef.current({ month: targetMonth }); assertMetricGoalsData(next, targetMonth); if (!alive.current || sequence !== readSequence.current || activeMonth.current !== targetMonth) return; setData(next); setOwnerId(previous => next.players.some(player => player.id === previous && (admin || player.id === selfPlayerId)) ? previous : admin ? next.players.find(player => player.active)?.id ?? next.players[0]?.id ?? "" : selfPlayerId); }
    catch (e) { if (alive.current && sequence === readSequence.current && activeMonth.current === targetMonth) setError(e instanceof Error ? e.message : "月別目標を取得できませんでした。"); }
    finally { reading.current = false; if (alive.current && sequence === readSequence.current) { setLoading(false); if (activeMonth.current !== targetMonth) void load(activeMonth.current); } }
  }
  useEffect(() => { void load(month); }, [month, enabled, unsettled]);
  const ready = data?.month === month ? data : null, owner = ready?.players.find(player => player.id === ownerId), key = keyFor(ownerId, month), saved = ready ? resolveMetricGoal(ready, ownerId, month) : null, draft = drafts[key] ?? (saved ? draftFrom(saved) : null), changed = !!draft && draftChanged(draft), canEdit = !!owner && (admin || owner.id === selfPlayerId && owner.active), blocked = !enabled || !canWrite || !canEdit || !!pending || sending || !ready;
  function edit(change: (value: Draft) => Draft) { if (!draft || blocked) return; setDrafts(previous => ({ ...previous, [key]: change(previous[key] ?? draft) })); setNotice(""); setError(""); }
  function undo(targetKey = key) { setDrafts(previous => { const next = { ...previous }; delete next[targetKey]; return next; }); setConflictKey(""); setError(""); }
  async function execute(operation: Pending) {
    if (saving.current) return; saving.current = true; setSending(true); setPending(operation); setError(""); setNotice("");
    try {
      const receipt = await onSave(operation.payload, operation.id);
      if (receipt !== undefined && (!receipt || typeof receipt !== "object" || !("committed" in receipt) || receipt.committed !== true || !("operationId" in receipt) || receipt.operationId !== operation.id)) throw Object.assign(new Error("保存結果を確認できませんでした。同じ保存IDで再試行してください。"), { code: "INTERNAL" });
      if (!alive.current) return; undo(operation.key); setPending(null); setData(null); setNotice("目標を保存しました。最新の実績を取得しています。"); onChanged?.();
    } catch (e) {
      if (!alive.current) return; const code = e && typeof e === "object" && "code" in e ? String(e.code) : "", conflict = ["CONFLICT", "VERSION_CONFLICT"].includes(code), uncertain = !conflict && isUncertainWrite(e);
      if (!uncertain) setPending(null); if (conflict) setConflictKey(operation.key); setError(e instanceof Error ? e.message : "目標を保存できませんでした。入力は保持しています。");
    } finally { saving.current = false; if (alive.current) setSending(false); }
  }
  function save() { if (!draft || blocked || !validDraft(draft) || conflictKey === key) return; void execute({ id: crypto.randomUUID(), payload: draftPayload(draft), key }); }
  function adoptVersions() { if (!draft || !saved || conflictKey !== key) return; const payload = { ...draftPayload(draft), expectedVersion: saved.expectedVersion, expectedProposalVersion: saved.expectedProposalVersion }; setDrafts(previous => ({ ...previous, [key]: { ...draft, payload } })); setConflictKey(""); setError(""); }
  return <section className="metric-goals" aria-label="7工程の月別目標と達成率">
    <header className="metric-goals-header"><div><h2><CalendarDays size={21}/>月別目標・日々の進捗</h2><p>実績は各工程を行った日で集計します。合格と双方のマッチは別の成果です。</p></div><div className="metric-goals-actions"><label>対象月<input type="month" aria-label="7工程目標の対象月" min="1900-01" max="2100-12" value={month} onChange={event => { if (validMetricGoalMonth(event.target.value)) setMonth(event.target.value); }}/></label><button type="button" className="secondary-button" onClick={() => setMonth(currentMonth)}>当月</button><button type="button" className="secondary-button" disabled={!enabled || loading || unsettled} onClick={() => void load()}>{loading ? <LoaderCircle size={15} className="metric-goals-spin"/> : <RefreshCw size={15}/>}最新を取得</button></div></header>
    {!enabled && <p className="info-box">7工程の月別目標は、サーバーの更新が完了すると利用できます。</p>}
    {notice && <p className="metric-goals-notice" role="status"><CheckCircle2 size={16}/>{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {pending && <div className="info-box" role="status"><strong>{sending ? "目標を保存しています…" : "保存結果を確認する必要があります"}</strong><p>{pending.payload.month}の目標。入力と同じ保存IDを保持しています。</p>{!sending && <button type="button" className="secondary-button" onClick={() => void execute(pending)}>同じ保存IDで再試行</button>}</div>}
    {dirty && <p className="metric-goals-dirty" role="status">未保存の目標があります。月や担当者を切り替えても、この画面内の入力は残ります。<button type="button" className="text-button" onClick={() => { const entry = Object.entries(drafts).find(([, value]) => draftChanged(value)); if (entry) { setMonth(entry[1].payload.month); setOwnerId(entry[1].payload.playerId); } }}>入力中の目標を見る</button></p>}
    {!ready ? <p className="empty-state">{loading ? "保存済みの目標と実績を取得しています。" : "対象月の目標と実績を取得してください。"}</p> : <>
      <div className="metric-goals-comparison card"><div className="metric-goals-table-scroll"><table><caption>{month}のチーム比較 · 各欄は実績 / 確定目標 · 非金融の実績・目標を社内共有</caption><thead><tr><th scope="col">プレイヤー</th>{goalMetrics.map(metric => <th key={metric} scope="col">{goalMetricLabels[metric]}</th>)}</tr></thead><tbody>{ready.players.map(player => { const goal = resolveMetricGoal(ready, player.id, month), counts = ready.counts[player.id] ?? emptyMetricCounts(); return <tr key={player.id}><th scope="row"><strong>{player.name}</strong><small>{player.active ? player.id : `${player.id} · 停止中`}</small>{(admin || player.id === selfPlayerId && player.active) && <button type="button" className="text-button" onClick={() => setOwnerId(player.id)}>目標を編集</button>}</th>{goalMetrics.map(metric => { const target = goal.targets[metric], percentage = goalAttainment(counts[metric], target); return <td key={metric}><strong>{counts[metric]}<span> / {target === null ? "未設定" : `${target}件`}</span></strong><small>{target === null ? "未確定" : target === 0 ? "目標0件・計算対象外" : `${percentage}% 達成`}</small>{target !== null && target > 0 && <progress aria-label={`${player.name}の${goalMetricLabels[metric]}達成率`} max={100} value={Math.min(100, percentage ?? 0)}/>}</td>; })}</tr>; })}</tbody></table></div></div>
      {draft && owner && <form className="metric-goals-editor card" aria-label="7工程の目標を編集" onSubmit={event => { event.preventDefault(); save(); }}><header><div><h3>{owner.name}の月別目標</h3><p>空欄は未設定、0は確定した0件です。別の月へ目標を自動コピーしません。</p></div>{admin && <label>担当者<select aria-label="目標を編集する担当者" value={ownerId} disabled={unsettled} onChange={event => setOwnerId(event.target.value)}>{ready.players.map(player => <option key={player.id} value={player.id}>{player.name}{player.active ? "" : "（停止中）"}</option>)}</select></label>}</header>
        <div className="metric-goals-basis"><label>日割り基準<select aria-label="日割り基準" value={draft.payload.dailyBasis} disabled={blocked} onChange={event => edit(value => ({ ...value, payload: { ...value.payload, dailyBasis: event.target.value as GoalDailyBasis } }))}>{Object.entries(dailyBasisLabels).map(([basis, label]) => <option key={basis} value={basis}>{label}</option>)}</select></label>{draft.payload.dailyBasis === "custom" && <label>月全体の営業日数<input aria-label="指定営業日数" type="number" min={1} max={daysInGoalMonth(month)} step={1} value={draft.customDaysText} disabled={blocked} onChange={event => edit(value => ({ ...value, customDaysText: event.target.value }))}/></label>}<p>暦日は全日、平日は土日以外（祝日も含む）で計算します。指定営業日数は営業日の配置が未指定のため、今日までの目安を月内で均等に配分します。</p></div>
        <div className="metric-goals-table-scroll"><table className="metric-goals-input-table"><thead><tr><th>工程</th><th>月間目標</th><th>実績</th><th>達成率</th><th>1日平均の目安</th><th>{month < ready.today.slice(0, 7) ? "月末までの目安" : month > ready.today.slice(0, 7) ? "開始前" : "今日までの目安"}</th><th>今日の実績</th></tr></thead><tbody>{goalMetrics.map(metric => {
          const target = draftPayload(draft).targets[metric], actual = ready.counts[ownerId]?.[metric] ?? 0, dayCount = ready.dailyCounts[ready.today]?.[ownerId]?.[metric] ?? 0, percentage = validGoalTarget(target) ? goalAttainment(actual, target) : null, validBasis = validGoalDailyBasis(draft.payload.dailyBasis, draftPayload(draft).customBusinessDays, month), progress = validGoalTarget(target) && validBasis ? goalDailyProgress(month, target, draft.payload.dailyBasis, draftPayload(draft).customBusinessDays, ready.today, actual) : null;
          return <tr key={metric}><th><label htmlFor={`metric-${ownerId}-${metric}`}>{goalMetricLabels[metric]}</label></th><td><input id={`metric-${ownerId}-${metric}`} aria-label={`${owner.name}の${goalMetricLabels[metric]}の月間目標`} type="number" min={0} max={9999} step={1} inputMode="numeric" placeholder="未設定" value={draft.text[metric]} aria-invalid={!validGoalTarget(target)} disabled={blocked} onChange={event => edit(value => ({ ...value, text: { ...value.text, [metric]: event.target.value } }))}/></td><td>{actual}件</td><td>{changed ? "保存前" : target === null ? "未設定" : target === 0 ? "対象外" : percentage === null ? "—" : `${percentage}%`}</td><td>{progress?.perDay === null || !progress ? "—" : `${numberLabel(progress.perDay)}件 / ${progress.denominator}日`}</td><td>{progress?.expectedToDate === null || !progress ? "—" : `${numberLabel(progress.expectedToDate)}件${progress.approximate ? "（目安）" : ""}`}</td><td>{month === ready.today.slice(0, 7) ? `${dayCount}件` : "—"}</td></tr>;
        })}</tbody></table></div>
        {conflictKey === key && <div className="info-box"><p>入力は保持しています。「最新を取得」で保存済みの目標と比較してください。確認後に、この入力を最新版へ保存できます。</p><button type="button" className="secondary-button" disabled={loading || !saved || draft.payload.expectedVersion === saved.expectedVersion && draft.payload.expectedProposalVersion === saved.expectedProposalVersion} onClick={adoptVersions}>最新の保存内容と比較済み・この入力で編集を続ける</button></div>}
        <footer><p>日割りは月間目標を配分した目安です。工程間の転換率や営業日を推測して目標を増やしません。{changed && " 入力中の目標は、保存するまで比較表や達成率に反映しません。"}</p><div><button className="primary-button" disabled={blocked || !changed || !validDraft(draft) || conflictKey === key}>{sending ? <LoaderCircle size={15} className="metric-goals-spin"/> : <Save size={15}/>}目標を確定して保存</button>{changed && !pending && <button type="button" className="text-button" onClick={() => undo()}><Undo2 size={15}/>入力を戻す</button>}</div></footer>
      </form>}
      <p className="metric-goals-note">提案数は提案先ごと、面談実施は同じ担当・候補者・実施日の重複を除いて集計。日付を修正すると、その月の実績も更新されます。{new Date(ready.checkedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}取得</p>
    </>}
  </section>;
}
