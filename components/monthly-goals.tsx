import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, LoaderCircle, Save, Undo2 } from "lucide-react";
import { assertMonthlyGoalSaveResult, goalBusinessMonth, monthlyGoalAttainment, monthlyGoalHistory, monthlyGoalKey, monthlyGoalStatusLabel, resolveMonthlyGoal, validGoalMonth, validMonthlyGoalTarget, type MonthlyGoal, type MonthlyGoalPayload, type MonthlyGoalPlayer, type MonthlyGoalSaveResult } from "@/lib/monthly-goals";
import { isUncertainWrite } from "@/lib/sheets-client";
import { useUnsavedChangesWarning } from "./unsaved-work";
import "./monthly-goals.css";

type Draft = { text: string; original: string; expectedVersion: string; operation?: { payload: MonthlyGoalPayload; id: string }; error?: string; conflict?: boolean };
export type MonthlyGoalsProps = {
  players: MonthlyGoalPlayer[]; goals: MonthlyGoal[]; admin: boolean; selfPlayerId: string;
  currentMonth?: string; canWrite?: boolean; enabled?: boolean;
  counts?: Record<string, Record<string, Partial<Record<string, number>>>>;
  onSave: (payload: MonthlyGoalPayload, operationId: string) => Promise<MonthlyGoalSaveResult>;
  onDirtyChange?: (dirty: boolean) => void; onPendingChange?: (pending: boolean) => void;
};
const labelMonth = (month: string) => `${month.slice(0, 4)}年${Number(month.slice(5))}月`;
const draftChanged = (draft: Draft) => draft.text !== draft.original || !!draft.operation;

export function MonthlyGoals({ players, goals, admin, selfPlayerId, currentMonth = goalBusinessMonth(), canWrite = true, enabled = true, counts = {}, onSave, onDirtyChange, onPendingChange }: MonthlyGoalsProps) {
  const [month, setMonth] = useState(currentMonth), [drafts, setDrafts] = useState<Record<string, Draft>>({}), [committed, setCommitted] = useState<MonthlyGoal[]>([]), [pending, setPending] = useState<Record<string, boolean>>({});
  const pendingKeys = useRef(new Set<string>()), mounted = useRef(true), previousCurrentMonth = useRef(currentMonth);
  const members = players.filter(player => player.id !== "ADMIN" && (admin || player.active !== false && player.id === selfPlayerId));
  const historyMembers = players.filter(player => player.id !== "ADMIN" && (admin || player.id === selfPlayerId));
  const allGoals = monthlyGoalHistory([...goals, ...committed], historyMembers.map(player => player.id));
  const dirtyKeys = Object.keys(drafts).filter(key => draftChanged(drafts[key])), dirty = dirtyKeys.length > 0, saving = Object.values(pending).some(Boolean), unsettled = saving || Object.values(drafts).some(draft => !!draft.operation);
  useUnsavedChangesWarning(dirty || saving);
  useEffect(() => { const previous = previousCurrentMonth.current; previousCurrentMonth.current = currentMonth; if (previous !== currentMonth && month === previous && !dirty && !saving) setMonth(currentMonth); }, [currentMonth, month, dirty, saving]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onPendingChange?.(unsettled); }, [unsettled, onPendingChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);
  function removeDraft(key: string) { setDrafts(previous => { const next = { ...previous }; delete next[key]; return next; }); }
  function edit(player: MonthlyGoalPlayer, text: string) {
    const key = monthlyGoalKey(player.id, month), resolved = resolveMonthlyGoal(allGoals, player, month, currentMonth);
    setDrafts(previous => ({ ...previous, [key]: { ...(previous[key] || { original: resolved.target === null ? "" : String(resolved.target), expectedVersion: resolved.version }), text, error: undefined } }));
  }
  async function save(player: MonthlyGoalPlayer) {
    const key = monthlyGoalKey(player.id, month); if (pendingKeys.current.has(key) || Object.entries(drafts).some(([otherKey, other]) => otherKey !== key && !!other.operation) || !enabled || !canWrite || player.active === false && !admin) return;
    const resolved = resolveMonthlyGoal(allGoals, player, month, currentMonth), draft = drafts[key] || { text: resolved.target === null ? "" : String(resolved.target), original: resolved.target === null ? "" : String(resolved.target), expectedVersion: resolved.version };
    const target = /^\d+$/.test(draft.text) ? Number(draft.text) : NaN;
    if (!validMonthlyGoalTarget(target)) { setDrafts(previous => ({ ...previous, [key]: { ...draft, error: "目標は0〜9999の整数で入力してください。空欄は未設定です。" } })); return; }
    const operation = draft.operation || { payload: { playerId: player.id, month, target, expectedVersion: draft.expectedVersion }, id: crypto.randomUUID() };
    pendingKeys.current.add(key); setPending(previous => ({ ...previous, [key]: true })); setDrafts(previous => ({ ...previous, [key]: { ...draft, operation, error: undefined } }));
    try {
      const result = await onSave(operation.payload, operation.id); assertMonthlyGoalSaveResult(result, operation.payload, operation.id);
      if (!mounted.current) return;
      setCommitted(previous => [...previous.filter(goal => monthlyGoalKey(goal.playerId, goal.month) !== key), result]); removeDraft(key);
    } catch (error) {
      if (!mounted.current) return;
      const conflict = !!error && typeof error === "object" && "code" in error && ["CONFLICT", "VERSION_CONFLICT"].includes(String(error.code)), uncertain = !conflict && isUncertainWrite(error);
      setDrafts(previous => ({ ...previous, [key]: { ...draft, operation: uncertain ? operation : undefined, error: error instanceof Error ? error.message : "目標を保存できませんでした。入力は保持しています。", conflict } }));
    } finally {
      pendingKeys.current.delete(key); if (mounted.current) setPending(previous => ({ ...previous, [key]: false }));
    }
  }
  return <section className="monthly-goals card" aria-label="月別の提案目標" aria-busy={saving}>
    <header className="monthly-goals-header"><div><h2><CalendarDays size={20}/>月別の提案目標</h2><p>目標を月ごとに確定し、過去の実績と一緒に残します。0件と未設定は区別されます。</p></div><div className="monthly-goals-month"><label>対象月<input type="month" min="1900-01" max="2100-12" aria-label="目標の対象月" value={month} onChange={event => { if (validGoalMonth(event.target.value)) setMonth(event.target.value); }}/></label><button type="button" className="secondary-button" onClick={() => setMonth(currentMonth)}>当月</button></div></header>
    {!enabled && <p className="monthly-goals-note" role="status">月別目標の接続設定が完了すると、この画面から確定できます。</p>}
    {!!dirtyKeys.length && <div className="monthly-goals-dirty" role="status"><strong>未保存の目標 {dirtyKeys.length}件</strong><span>月を切り替えても入力は残ります。</span><button type="button" className="text-button" onClick={() => setMonth(dirtyKeys[0].slice(0, 7))}>入力中の月を確認</button></div>}
    <div className="monthly-goals-list">{members.map(player => {
      const resolved = resolveMonthlyGoal(allGoals, player, month, currentMonth), key = monthlyGoalKey(player.id, month), draft = drafts[key], text = draft?.text ?? (resolved.target === null ? "" : String(resolved.target)), busy = !!pending[key], anotherUnsettled = Object.entries(drafts).some(([otherKey, other]) => otherKey !== key && !!other.operation), uncertain = !!draft?.operation && !busy, changed = !!draft && draftChanged(draft), actual = counts[month]?.[player.id]?.["提案"] ?? 0, achievement = monthlyGoalAttainment(actual, resolved), invalid = text !== "" && (!/^\d+$/.test(text) || !validMonthlyGoalTarget(Number(text)));
      return <article key={key} className="monthly-goal-row"><div className="monthly-goal-player"><strong>{player.name || player.id}{player.active === false && "（停止中）"}</strong><small>{player.id}</small><span className={`monthly-goal-status is-${resolved.status}`}><Check size={12}/>{monthlyGoalStatusLabel(resolved.status)}</span></div><form onSubmit={event => { event.preventDefault(); void save(player); }}><label>{labelMonth(month)}の提案目標<div className="monthly-goal-input"><input type="number" inputMode="numeric" min={0} max={9999} step={1} placeholder="未設定" aria-label={`${player.name || player.id}の${month}の目標`} value={text} aria-invalid={invalid} disabled={!enabled || !canWrite || busy || uncertain} onChange={event => edit(player, event.target.value)}/><span>件</span></div></label><button className="primary-button" disabled={!enabled || !canWrite || busy || anotherUnsettled || !text || invalid || resolved.status === "confirmed" && !changed}>{busy ? <LoaderCircle size={15} className="monthly-goal-spin"/> : <Save size={15}/>} {busy ? "保存中…" : uncertain ? "同じ内容で再試行" : resolved.status === "confirmed" ? "変更を保存" : "この目標で確定"}</button>{changed && !draft?.operation && <button type="button" className="text-button" disabled={busy} onClick={() => removeDraft(key)}><Undo2 size={14}/>入力を戻す</button>}</form><div className="monthly-goal-result"><span>提案実績 <strong>{actual.toLocaleString()}件</strong></span><span>{changed ? "入力中・保存後に達成率を更新" : achievement === null ? resolved.status === "standard" ? "目標を確定すると達成率を表示" : resolved.target === 0 ? "目標0件・達成率の計算対象外" : "達成率なし" : `${achievement}% 達成`}</span></div>{draft?.error && <div className="monthly-goal-error" role="alert"><p>{draft.error}</p>{draft.conflict && <p>入力を控え、最新の目標を確認してから「入力を戻す」で再編集してください。</p>}{uncertain && <p>保存結果が未確認のため入力を保持しています。同じ保存IDで再試行します。</p>}</div>}</article>;
    })}</div>
    {!members.length && <p className="empty-state">目標を設定できるプレイヤーがいません。</p>}
    <p className="monthly-goals-note">過去月に確定した目標がなければ「未設定」です。当月以降の標準目標は参考値で、確定するまで達成率に使いません。{admin&&" 停止中の担当者も、管理者は月別目標を補完できます。ログインや成果登録の再開にはなりません。"}</p>
    <details className="monthly-goals-history"><summary>確定した目標の履歴（{allGoals.length}件）</summary>{allGoals.length ? <div className="monthly-goals-history-scroll"><table><thead><tr><th>対象月</th><th>プレイヤー</th><th>目標</th><th>提案実績</th><th>達成率</th><th>更新日時</th></tr></thead><tbody>{allGoals.map(goal => { const actual = counts[goal.month]?.[goal.playerId]?.["提案"] ?? 0, percent = monthlyGoalAttainment(actual, { target: goal.target, status: "confirmed" }); return <tr key={monthlyGoalKey(goal.playerId, goal.month)}><td><button type="button" className="text-button" onClick={() => setMonth(goal.month)}>{labelMonth(goal.month)}</button></td><td>{historyMembers.find(player => player.id === goal.playerId)?.name || goal.playerId}{historyMembers.find(player => player.id === goal.playerId)?.active === false && "（停止中）"}</td><td>{goal.target}件</td><td>{actual}件</td><td>{percent === null ? "対象外（目標0件）" : `${percent}%`}</td><td><time dateTime={goal.updatedAt}>{new Date(goal.updatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></td></tr>; })}</tbody></table></div> : <p>確定した月別目標はまだありません。</p>}</details>
  </section>;
}
