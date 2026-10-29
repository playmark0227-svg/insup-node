"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, Minus, Plus, Presentation, RefreshCw, Target, UsersRound } from "lucide-react";
import { rankPlayers, type Metric, type Player, type Stage } from "@/lib/node-data";
import { performanceMetrics } from "@/lib/performance-metrics";
import { meetingCsv, meetingCsvFilename, previousMeetingMonth, proposalAchievement } from "@/lib/meeting-data";
import "@/app/meeting.css";
import { goalBusinessMonth, monthlyGoalAttainment, monthlyGoalStatusLabel, resolveMonthlyGoal, type MonthlyGoal, type MonthlyGoalPlayer, type MonthlyGoalResolution } from "@/lib/monthly-goals";

type MeetingDashboardProps = {
  players: (Player & { active?: boolean })[];
  goals?: MonthlyGoal[];
  currentMonth?: string;
  monthlyGoalsEnabled?: boolean;
  exportBlocked?: boolean;
  period: string;
  periodLabel: string;
  countAt: (stage: Metric, id: string | null, period: string) => number;
  onCorrect?: (playerId: string, stage: Stage) => void;
  onRegister: (playerId: string, stage: Stage) => void;
  onManagePlayers?: () => void;
  onOpenRecords?: () => void;
  live: boolean;
  syncedAt?: string;
  onRefresh: () => void;
  busy: boolean;
  canRegister?: boolean;
};

const number = (value: number) => value.toLocaleString("ja-JP");
const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;
const monthName = (month: string) => `${Number(month.split("-")[1])}月`;
const hasTarget = (target: number) => Number.isFinite(target) && target > 0;

function periodName(period: string, fallback: string) {
  if (previousMeetingMonth(period)) return `${period.slice(0, 4)}年${monthName(period)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return `${period.slice(0, 4)}年${Number(period.slice(5, 7))}月${Number(period.slice(8))}日`;
  return period === "all" ? "全期間の累計" : fallback;
}

function goalRemainder(count: number, target: number) {
  if (!hasTarget(target)) return "目標未設定";
  if (count === target) return "目標達成";
  return count > target ? `目標達成 · ${number(count - target)}件超過` : `目標まで ${number(target - count)}件`;
}

function SyncedTime({ value }: { value?: string }) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return <span>更新日時未取得</span>;
  return <time dateTime={value}>{new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value))} 更新</time>;
}

function Difference({ value, previousCount }: { value: number; previousCount?: number }) {
  return <span className={`meeting-difference ${value > 0 ? "positive" : ""}`} title={previousCount === undefined ? undefined : `前月の実績 ${number(previousCount)}件`}>前月差 <strong>{signed(value)}</strong> 件</span>;
}

export function MeetingDashboard({ players, period, periodLabel, countAt, onRegister, onCorrect, onManagePlayers, onOpenRecords, live, syncedAt, onRefresh, busy, canRegister = true, goals = [], currentMonth = goalBusinessMonth(), monthlyGoalsEnabled = false, exportBlocked = false }: MeetingDashboardProps) {
  const dashboard = useRef<HTMLElement>(null);
  const [meetingMode, setMeetingMode] = useState(false);
  const [display, setDisplay] = useState<"team" | "person">("team");
  const [sort, setSort] = useState("roster");
  const [selectedId, setSelectedId] = useState("");
  const previous = previousMeetingMonth(period);
  const month = previous !== null;
  const periodTitle = periodName(period, periodLabel);
  const goalFor = (player: MonthlyGoalPlayer): MonthlyGoalResolution => monthlyGoalsEnabled ? resolveMonthlyGoal(goals, player, period, currentMonth) : { target: hasTarget(player.target) ? player.target : null, status: hasTarget(player.target) ? "confirmed" : "unset", version: "", goal: null };
  const goalText = (goal: MonthlyGoalResolution) => goal.target === null ? "未設定" : number(goal.target);
  const goalStateText = (goal: MonthlyGoalResolution) => monthlyGoalsEnabled ? goal.status !== "confirmed" ? monthlyGoalStatusLabel(goal.status) : goal.target === 0 ? "目標0件・達成率なし" : "確定済み" : "目標未設定";
  const remainder = (count: number, goal: MonthlyGoalResolution) => monthlyGoalsEnabled && (goal.status !== "confirmed" || goal.target === 0) ? goalStateText(goal) : goalRemainder(count, goal.target || 0);
  const target = players.reduce((sum, player) => { const goal = goalFor(player); return sum + (goal.status === "confirmed" ? goal.target || 0 : 0); }, 0);
  const missingTargets = players.filter(player => goalFor(player).status !== "confirmed").length;
  const totals = performanceMetrics.map(metric => ({ ...metric, count: countAt(metric.stage, null, period), previousCount: previous ? countAt(metric.stage, null, previous) : 0 }));
  const teamProposals = countAt("提案", null, period);
  const assignedProposals = players.reduce((sum, player) => sum + countAt("提案", player.id, period), 0);
  const teamAchievement = month && (!monthlyGoalsEnabled || missingTargets === 0) ? proposalAchievement(assignedProposals, target) : null;
  const teamGoalState = monthlyGoalsEnabled && missingTargets > 0 ? `未設定・未確定 ${missingTargets}名` : monthlyGoalsEnabled && target === 0 ? "目標0件・達成率なし" : "目標未設定";
  const ordered = sort === "roster" ? players : rankPlayers(players, [], sort as Metric, period, id => countAt(sort as Metric, id, period));
  const selected = ordered.find(player => player.id === selectedId) || ordered[0];
  const selectedIndex = selected ? ordered.findIndex(player => player.id === selected.id) : -1;
  const rows = ordered.map(player => ({ ...player, target: goalFor(player).status === "confirmed" ? goalFor(player).target || 0 : 0, goalResolution: goalFor(player), ...(monthlyGoalsEnabled ? { goalStatus: goalFor(player).status } : {}), counts: Object.fromEntries(performanceMetrics.map(metric => [metric.stage, countAt(metric.stage, player.id, period)])), previous: Object.fromEntries(performanceMetrics.map(metric => [metric.stage, previous ? countAt(metric.stage, player.id, previous) : 0])) }));
  const selectedRow = rows.find(row => row.id === selected?.id);
  const selectedAchievement = selectedRow && month ? monthlyGoalAttainment(selectedRow.counts["提案"], selectedRow.goalResolution) : null;
  const selectedProposalRank = selected ? rankPlayers(players, [], "提案", period, id => countAt("提案", id, period)).find(player => player.id === selected.id)?.rank : null;
  const noPeriodActivity = totals.every(metric => metric.count === 0);
  const differentTeamScope = totals.some(metric => metric.count !== rows.reduce((sum, row) => sum + row.counts[metric.stage], 0));
  const allowEditing = canRegister && !meetingMode;

  function toggleMeetingMode() {
    setMeetingMode(value => !value);
    dashboard.current?.focus({ preventScroll: true });
  }

  function moveSpeaker(direction: -1 | 1) {
    const next = ordered[selectedIndex + direction];
    if (next) setSelectedId(next.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const targetElement = event.target as HTMLElement;
    // Selects and editable controls retain their native keyboard behavior.
    if (targetElement.closest("input, select, textarea, [contenteditable], [role=dialog], [role=slider]")) return;
    if (event.key === "Escape" && meetingMode) {
      event.preventDefault();
      setMeetingMode(false);
    } else if (display === "person" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      moveSpeaker(event.key === "ArrowLeft" ? -1 : 1);
    }
  }

  function downloadCsv() {
    if (busy || exportBlocked) return;
    const blob = new Blob(["\uFEFF", meetingCsv(rows, performanceMetrics, period)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = meetingCsvFilename(period);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  function metricControls(playerId: string, name: string, metric: typeof performanceMetrics[number], count: number) {
    if (!allowEditing) return null;
    return <span className="meeting-metric-actions">
      {onCorrect && <button className="meeting-correct-icon" aria-label={`${name}の${metric.label}を減らす・修正`} title="登録済みの成果を選んで取り消す" disabled={busy || count === 0} onClick={() => onCorrect(playerId, metric.stage)}><Minus size={13}/></button>}
      <button className="meeting-register-icon" aria-label={`${name}の${metric.label}を記録`} title={`${metric.label}を記録`} disabled={busy || players.find(player => player.id === playerId)?.active === false} onClick={() => { if (players.find(player => player.id === playerId)?.active !== false) onRegister(playerId, metric.stage); }}><Plus size={13}/></button>
    </span>;
  }

  return <section ref={dashboard} tabIndex={-1} onKeyDown={handleKeyDown} className={`meeting-dashboard ${meetingMode ? "is-presenting" : ""}`} aria-label="成果ミーティング" aria-busy={busy}>
    <div className="meeting-toolbar">
      <div className="meeting-context"><span className="meeting-context-icon"><Presentation size={22}/></span><div><h2>成果ミーティング</h2><p>{players.length}名<span>·</span>{live ? "スプレッドシートの実績" : "サンプル実績"}{live && <><span>·</span><SyncedTime value={syncedAt}/></>}</p></div></div>
      <div className="meeting-actions">
        {live && <button className="meeting-button" onClick={onRefresh} disabled={busy} aria-label="スプレッドシートから実績を更新"><RefreshCw size={16} className={busy ? "meeting-spin" : ""}/>{busy ? "更新中" : "更新"}</button>}
        <button className="meeting-button" onClick={downloadCsv} disabled={busy || !players.length || exportBlocked} title={exportBlocked ? "未保存の入力・同期中の処理が終わるとCSV保存できます" : `${periodTitle}の担当者別実績をCSVに保存`}><Download size={16}/>CSV保存</button>
        <button className={`meeting-button ${meetingMode ? "selected" : ""}`} aria-pressed={meetingMode} onClick={toggleMeetingMode}>{meetingMode ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}会議用表示{meetingMode && "を終了"}</button>
      </div>
    </div>

    <div className="meeting-period-summary">
      <div><span>集計対象</span><strong>{periodTitle}</strong></div>
      <p>{month ? <><strong>前月差：{periodName(previous!, previous!)}との比較</strong><span>月全体の記録同士を比較します。同日までの比較ではありません。</span></> : <><strong>{period === "all" ? "記録されているすべての実績" : "この日に記録された実績"}</strong><span>前月差と月間目標は、月別の表示で確認できます。</span></>}</p>
      {meetingMode && <span className="meeting-mode-hint">会議用表示中 · Escで終了</span>}
    </div>

    <div className="meeting-totals" aria-label="6項目のチーム合計">
      {totals.map((metric, index) => <div className={`meeting-total meeting-total-${index}`} key={metric.stage} title={metric.description}><span className="meeting-total-label">{metric.label}</span><div className="meeting-total-value">{number(metric.count)}<small>件</small></div>{previous && <Difference value={metric.count - metric.previousCount} previousCount={metric.previousCount}/>}<span className="meeting-total-caption">チーム合計</span></div>)}
    </div>

    {month && players.length > 0 && <div className="meeting-goal-section">
      <div className="meeting-team-goal"><div className="meeting-goal-label"><Target size={18}/><span>全員の月間提案目標</span></div><div className="meeting-goal-amount"><strong>{number(assignedProposals)}</strong><span>/ {target > 0 || monthlyGoalsEnabled && missingTargets === 0 ? number(target) : "未設定"} 件</span></div><div className="meeting-goal-track" role="progressbar" aria-label="全員の月間提案目標達成率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={teamAchievement === null ? undefined : Math.min(100, teamAchievement)} aria-valuetext={teamAchievement === null ? teamGoalState : `${teamAchievement}%`}><div style={{ width: `${Math.min(100, teamAchievement ?? 0)}%` }}/></div><strong className="meeting-goal-percent">{teamAchievement === null ? teamGoalState : `${teamAchievement}%`}</strong><span className="meeting-goal-remainder">{monthlyGoalsEnabled && missingTargets > 0 ? "全員の目標確定後に達成率を表示します" : monthlyGoalsEnabled && target === 0 ? "目標は全員0件です" : goalRemainder(assignedProposals, target)}</span></div>
      <div className="meeting-goal-caption"><span>{monthlyGoalsEnabled ? "実績は名簿の全員分、目標は対象月に確定した値の合計です。" : "実績は名簿の全員分、目標は現在の設定値の合計です。"}{missingTargets > 0 && ` ${monthlyGoalsEnabled ? "目標未設定・未確定" : "目標未設定"} ${missingTargets}名。`}{teamProposals !== assignedProposals && " チーム合計と集計範囲が異なります。"}</span>{missingTargets > 0 && onManagePlayers && <button onClick={onManagePlayers}>目標を確認<ChevronRight size={13}/></button>}</div>
    </div>}

    {differentTeamScope && <p className="meeting-scope-note">チーム合計と名簿の担当者別合計に差があります。{month ? "比較表・発表・提案目標" : "比較表・発表"}は、名簿にいる担当者の実績を表示しています。{onManagePlayers && <button onClick={onManagePlayers}>担当者の対応を確認<ChevronRight size={13}/></button>}</p>}

    <div className="meeting-board">
      <div className="meeting-board-heading">
        <div className="meeting-tabs" role="group" aria-label="ミーティングの表示切り替え"><button aria-pressed={display === "team"} className={display === "team" ? "active" : ""} onClick={() => setDisplay("team")}><UsersRound size={17}/>全員の比較</button><button aria-pressed={display === "person"} className={display === "person" ? "active" : ""} disabled={!players.length} onClick={() => setDisplay("person")}><Presentation size={17}/>一人ずつ発表</button></div>
        <label className="meeting-sort">{display === "person" ? "発表順" : "表示順"}<select value={sort} onChange={event => setSort(event.target.value)} disabled={!players.length}><option value="roster">名簿順</option>{performanceMetrics.map(metric => <option key={metric.stage} value={metric.stage}>{metric.label}の多い順</option>)}</select></label>
      </div>
      <div className="meeting-board-purpose"><p>{display === "team" ? "全員の実績を見比べ、確認したい人の「発表」を開きます。" : "実績・前月差・提案目標を確認しながら、一人ずつ振り返ります。"}</p>{display === "person" && <span>← 前の人 / → 次の人</span>}{display === "team" && <span className="meeting-scroll-hint">横にスクロールして全項目を確認</span>}</div>

      {!players.length ? <div className="meeting-empty"><strong>比較するプレイヤーがまだいません</strong><p>{live ? "プレイヤーを追加し、元シートの担当名を対応づけると、一人ずつ実績を確認できます。" : "プレイヤーを追加すると、一人ずつ実績を確認できます。"}</p>{onManagePlayers && <button className="meeting-button selected" onClick={onManagePlayers}>プレイヤー管理を開く<ChevronRight size={15}/></button>}</div> : <>
        {noPeriodActivity && <div className="meeting-empty-period"><div><strong>{periodTitle}の6項目はすべて0件です</strong><p>期間を切り替えるか、人材・進捗で各工程の日付を確認してください。ステータス変更だけでは実績に計上されません。</p></div>{onOpenRecords && <button className="meeting-button" onClick={onOpenRecords}>人材・進捗を確認<ChevronRight size={15}/></button>}</div>}
        {display === "team" ? <>
          <div className="meeting-table-scroll" role="region" aria-label="担当者別実績の比較表。横にスクロールできます" tabIndex={0}><table className="meeting-table"><caption className="meeting-sr-only">{periodTitle}のプレイヤー別6項目実績{month && "、前月差、月間提案目標"}</caption><thead><tr><th scope="col" className="meeting-player-heading">プレイヤー</th>{performanceMetrics.map(metric => <th scope="col" key={metric.stage}>{metric.label}<span className="meeting-column-unit">件{month && " / 前月差"}</span></th>)}{month && <th scope="col">提案目標<span className="meeting-column-unit">実績 / 目標・達成率</span></th>}<th scope="col"><span className="meeting-sr-only">発表画面を開く</span></th></tr></thead><tbody>{rows.map(row => {
            const achievement = month ? monthlyGoalAttainment(row.counts["提案"], row.goalResolution) : null;
            return <tr key={row.id}><th scope="row"><div className="meeting-person-cell"><span className={`avatar small-avatar ${row.color}`}>{row.name.slice(0, 1)}</span><div><strong>{row.name}</strong><span>{row.id}{row.active === false && " · 利用停止"}</span></div></div></th>{performanceMetrics.map(metric => <td key={metric.stage}><div className="meeting-count-cell"><strong>{number(row.counts[metric.stage])}</strong>{metricControls(row.id, row.name, metric, row.counts[metric.stage])}</div>{previous && <Difference value={row.counts[metric.stage] - row.previous[metric.stage]} previousCount={row.previous[metric.stage]}/>}</td>)}{month && <td className="meeting-target-cell"><div><strong>{number(row.counts["提案"])} / {monthlyGoalsEnabled ? goalText(row.goalResolution) : hasTarget(row.target) ? number(row.target) : "—"}<small>件</small></strong><span>{achievement === null ? goalStateText(row.goalResolution) : `${achievement}%`}</span></div><div className="meeting-mini-track"><span style={{ width: `${Math.min(100, achievement ?? 0)}%` }}/></div><span className="meeting-target-remainder">{remainder(row.counts["提案"], row.goalResolution)}</span></td>}<td><button className="meeting-present-button" onClick={() => { setSelectedId(row.id); setDisplay("person"); }} aria-label={`${row.name}の発表画面を開く`}>発表<ChevronRight size={15}/></button></td></tr>;
          })}</tbody></table></div>
          <div className="meeting-board-foot"><span>{allowEditing ? `＋で成果を追加${onCorrect ? "、−で登録済みの成果を選んで取り消せます" : "できます"}。` : meetingMode ? "会議用表示では実績の確認に集中できます。" : "実績を閲覧しています。"}</span>{month && <span>{monthlyGoalsEnabled ? "目標は対象月の確定値・標準値は未確定" : "目標は現在の設定値"}</span>}</div>
        </> : selectedRow && <div className="meeting-person-report">
          <div className="meeting-person-picker" role="group" aria-label="発表するプレイヤー">{ordered.map(player => <button key={player.id} aria-pressed={selectedRow.id === player.id} className={selectedRow.id === player.id ? "active" : ""} onClick={() => setSelectedId(player.id)}>{player.name}</button>)}</div>
          <div className="meeting-speaker-heading"><div><span className="meeting-speaker-kicker">{selectedIndex + 1} / {players.length} 人目の発表 · {periodTitle}</span><h3 aria-live="polite" aria-atomic="true"><span className={`avatar ${selectedRow.color}`} aria-hidden="true">{selectedRow.name.slice(0, 1)}</span>{selectedRow.name}</h3><p>{selectedRow.id} · {selectedRow.team}{month && selectedProposalRank && <span>提案数 {selectedProposalRank}位 / {players.length}人</span>}</p></div><div className="meeting-presentation-nav"><button className="meeting-button" disabled={selectedIndex <= 0} onClick={() => moveSpeaker(-1)}><ChevronLeft size={17}/>前の人</button><button className="meeting-button selected" disabled={selectedIndex >= ordered.length - 1} onClick={() => moveSpeaker(1)}>次の人<ChevronRight size={17}/></button></div></div>
          <div className="meeting-person-metrics">{performanceMetrics.map(metric => <div className="meeting-person-metric" key={metric.stage}><div><span title={metric.description}>{metric.label}</span>{metricControls(selectedRow.id, selectedRow.name, metric, selectedRow.counts[metric.stage])}</div><strong>{number(selectedRow.counts[metric.stage])}<small>件</small></strong>{month && <Difference value={selectedRow.counts[metric.stage] - selectedRow.previous[metric.stage]} previousCount={selectedRow.previous[metric.stage]}/>}</div>)}</div>
          {month && <div className="meeting-person-goal"><div><span><Target size={18}/>月間提案目標</span><strong>{number(selectedRow.counts["提案"])}<small> / {monthlyGoalsEnabled ? goalText(selectedRow.goalResolution) : hasTarget(selectedRow.target) ? number(selectedRow.target) : "未設定"} 件</small></strong></div><div className="meeting-person-goal-progress"><strong>{selectedAchievement === null ? goalStateText(selectedRow.goalResolution) : `${selectedAchievement}% 達成`}</strong><div className="meeting-goal-track" role="progressbar" aria-label={`${selectedRow.name}の月間提案目標達成率`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={selectedAchievement === null ? undefined : Math.min(100, selectedAchievement)} aria-valuetext={selectedAchievement === null ? goalStateText(selectedRow.goalResolution) : `${selectedAchievement}%`}><div style={{ width: `${Math.min(100, selectedAchievement ?? 0)}%` }}/></div><span>{selectedAchievement === null ? monthlyGoalsEnabled ? "対象月の目標を確認してください。未確定の標準値は達成率に使いません。0件の目標は達成率の計算対象外です。" : "月間提案目標が未設定です。プレイヤー管理で設定値を確認してください。" : remainder(selectedRow.counts["提案"], selectedRow.goalResolution)}</span>{selectedAchievement === null && onManagePlayers && <button onClick={onManagePlayers}>目標を確認<ChevronRight size={14}/></button>}</div></div>}
          <div className="meeting-report-end"><p className="meeting-comparison-note">{month ? `${monthName(previous!)}との件数差を各項目に表示しています。${monthlyGoalsEnabled ? "月間提案目標は対象月の確定値です。" : "月間提案目標は現在の設定値です。"}` : "日別・累計の表示では、前月差と月間提案目標の達成率は表示していません。"}</p>{selectedIndex === ordered.length - 1 && <button className="meeting-button" onClick={() => setDisplay("team")}>全員の比較に戻る<ChevronRight size={15}/></button>}</div>
        </div>}
      </>}
    </div>

    <details className="meeting-definitions"><summary>6項目の意味・集計の見方</summary><p>各工程に記録した日付で集計します。ステータス変更のみでは実績は増えません。前月差は、対象月全体と前月全体の件数の差です。月途中の表示でも、前月の同日までにそろえた比較ではありません。</p><p>{monthlyGoalsEnabled ? "月間提案目標は、対象月に確定した値を使います。過去月に目標がなければ未設定です。当月以降の標準目標は未確定の参考値で、達成率には使いません。チーム達成率は名簿全員の目標が確定し、目標合計が1件以上の場合に表示します。0件と未設定は区別されます。" : "月間提案目標は、プレイヤーに現在設定されている値を使います。過去月を表示しても当時の目標への切り替えは行いません。チーム達成率は、名簿全員の提案実績を設定済みの目標合計で割って計算します。"}</p><div>{performanceMetrics.map(metric => <dl key={metric.stage}><dt>{metric.label}</dt><dd>{metric.description}</dd></dl>)}</div></details>
  </section>;
}
