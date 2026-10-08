"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, Plus, Presentation, RefreshCw, Target, UsersRound } from "lucide-react";
import { rankPlayers, type Metric, type Player, type Stage } from "@/lib/node-data";
import { performanceMetrics } from "@/lib/performance-metrics";
import { meetingCsv, meetingCsvFilename, previousMeetingMonth, proposalAchievement } from "@/lib/meeting-data";
import "@/app/meeting.css";

type MeetingDashboardProps = {
  players: Player[];
  period: string;
  periodLabel: string;
  countAt: (stage: Metric, id: string | null, period: string) => number;
  onRegister: (playerId: string, stage: Stage) => void;
  live: boolean;
  syncedAt?: string;
  onRefresh: () => void;
  busy: boolean;
  canRegister?: boolean;
};

const number = (value: number) => value.toLocaleString("ja-JP");
const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;
const monthName = (month: string) => `${Number(month.split("-")[1])}月`;

function SyncedTime({ value }: { value?: string }) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return null;
  return <time dateTime={value}>{new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value))} 更新</time>;
}

function Difference({ value }: { value: number }) {
  return <span className={`meeting-difference ${value > 0 ? "positive" : ""}`}>前月差 <strong>{signed(value)}</strong> 件</span>;
}

export function MeetingDashboard({ players, period, periodLabel, countAt, onRegister, live, syncedAt, onRefresh, busy, canRegister = true }: MeetingDashboardProps) {
  const [meetingMode, setMeetingMode] = useState(false);
  const [display, setDisplay] = useState<"team" | "person">("team");
  const [sort, setSort] = useState("roster");
  const [selectedId, setSelectedId] = useState(players[0]?.id || "");
  const previous = previousMeetingMonth(period);
  const month = previous !== null;
  const target = players.reduce((sum, player) => sum + (Number.isFinite(player.target) && player.target > 0 ? player.target : 0), 0);
  const teamProposals = countAt("提案", null, period);
  const assignedProposals = players.reduce((sum, player) => sum + countAt("提案", player.id, period), 0);
  const teamAchievement = month ? proposalAchievement(assignedProposals, target) : null;
  const ordered = sort === "roster" ? players : rankPlayers(players, [], sort as Metric, period, id => countAt(sort as Metric, id, period));
  const selected = ordered.find(player => player.id === selectedId) || ordered[0];
  const selectedIndex = selected ? ordered.findIndex(player => player.id === selected.id) : -1;
  const rows = ordered.map(player => ({ ...player, counts: Object.fromEntries(performanceMetrics.map(metric => [metric.stage, countAt(metric.stage, player.id, period)])), previous: Object.fromEntries(performanceMetrics.map(metric => [metric.stage, previous ? countAt(metric.stage, player.id, previous) : 0])) }));
  const selectedRow = rows.find(row => row.id === selected?.id);
  const selectedAchievement = selectedRow && month ? proposalAchievement(selectedRow.counts["提案"], selectedRow.target) : null;
  const selectedProposalRank = selected ? rankPlayers(players, [], "提案", period, id => countAt("提案", id, period)).find(player => player.id === selected.id)?.rank : null;

  function downloadCsv() {
    const blob = new Blob(["\uFEFF", meetingCsv(rows, performanceMetrics, period)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = meetingCsvFilename(period);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  return <section className={`meeting-dashboard ${meetingMode ? "is-presenting" : ""}`} aria-label="成果ミーティング">
    <div className="meeting-toolbar">
      <div className="meeting-context"><span className="meeting-context-icon"><Presentation size={22}/></span><div><h2>成果ミーティング</h2><p>{month ? `${period.slice(0, 4)}年 ${periodLabel}` : periodLabel}<span>·</span>{players.length}名<span>·</span>{live ? "スプレッドシートの実績" : "サンプル実績"}</p></div></div>
      <div className="meeting-actions">
        {live && <button className="meeting-button" onClick={onRefresh} disabled={busy} aria-label="スプレッドシートから実績を更新"><RefreshCw size={16} className={busy ? "meeting-spin" : ""}/>{busy ? "更新中" : "更新"}</button>}
        <button className="meeting-button" onClick={downloadCsv} disabled={busy || !players.length}><Download size={16}/>CSV</button>
        <button className={`meeting-button ${meetingMode ? "selected" : ""}`} aria-pressed={meetingMode} onClick={() => setMeetingMode(value => !value)}>{meetingMode ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}会議用表示</button>
      </div>
    </div>

    <div className="meeting-totals" aria-label="6項目のチーム合計">
      {performanceMetrics.map((metric, index) => {
        const total = countAt(metric.stage, null, period);
        return <div className={`meeting-total meeting-total-${index}`} key={metric.stage}><span className="meeting-total-label">{metric.label}</span><div className="meeting-total-value">{number(total)}<small>件</small></div>{previous && <Difference value={total - countAt(metric.stage, null, previous)}/>}<span className="meeting-total-caption">チーム合計</span></div>;
      })}
    </div>

    {month && <div className="meeting-team-goal"><div className="meeting-goal-label"><Target size={18}/><span>全員の月間提案目標</span></div><div className="meeting-goal-amount"><strong>{number(assignedProposals)}</strong><span>/ {target > 0 ? number(target) : "未設定"} 件</span></div><div className="meeting-goal-track" role="progressbar" aria-label="全員の月間提案目標達成率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, teamAchievement ?? 0)} aria-valuetext={teamAchievement === null ? "目標未設定" : `${teamAchievement}%`}><div style={{ width: `${Math.min(100, teamAchievement ?? 0)}%` }}/></div><strong className="meeting-goal-percent">{teamAchievement === null ? "目標未設定" : `${teamAchievement}%`}</strong><span className="meeting-goal-note">{teamProposals !== assignedProposals ? "名簿の担当者分で集計" : "名簿の目標合計"}</span></div>}

    <div className="meeting-board">
      <div className="meeting-board-heading">
        <div className="meeting-tabs" role="group" aria-label="ミーティングの表示切り替え"><button aria-pressed={display === "team"} className={display === "team" ? "active" : ""} onClick={() => setDisplay("team")}><UsersRound size={17}/>全員の比較</button><button aria-pressed={display === "person"} className={display === "person" ? "active" : ""} onClick={() => { if (display !== "person") setSelectedId(ordered[0]?.id || ""); setDisplay("person"); }}><Presentation size={17}/>一人ずつ発表</button></div>
        <label className="meeting-sort">表示順<select value={sort} onChange={event => setSort(event.target.value)}><option value="roster">名簿順</option>{performanceMetrics.map(metric => <option key={metric.stage} value={metric.stage}>{metric.label}の多い順</option>)}</select></label>
      </div>

      {!players.length ? <p className="meeting-empty">プレイヤーを追加すると、成果を比較できます。</p> : display === "team" ? <>
        <div className="meeting-table-scroll"><table className="meeting-table"><caption className="meeting-sr-only">{periodLabel}のプレイヤー別6項目実績{month && "と月間提案目標"}</caption><thead><tr><th scope="col" className="meeting-player-heading">プレイヤー</th>{performanceMetrics.map(metric => <th scope="col" key={metric.stage}>{metric.label}</th>)}{month && <th scope="col">提案目標・達成率</th>}<th scope="col"><span className="meeting-sr-only">発表画面を開く</span></th></tr></thead><tbody>{rows.map(row => {
          const achievement = month ? proposalAchievement(row.counts["提案"], row.target) : null;
          return <tr key={row.id}><th scope="row"><div className="meeting-person-cell"><span className={`avatar small-avatar ${row.color}`}>{row.name.slice(0, 1)}</span><div><strong>{row.name}</strong><span>{row.id}</span></div></div></th>{performanceMetrics.map(metric => <td key={metric.stage}><div className="meeting-count-cell"><strong>{number(row.counts[metric.stage])}</strong>{canRegister && <button className="meeting-register-icon" aria-label={`${row.name}の${metric.label}を記録`} title={`${metric.label}を記録`} disabled={busy} onClick={() => onRegister(row.id, metric.stage)}><Plus size={13}/></button>}</div></td>)}{month && <td className="meeting-target-cell"><div><strong>{achievement === null ? "未設定" : `${achievement}%`}</strong><span>{row.target > 0 ? `目標 ${number(row.target)}件` : "月間目標"}</span></div><div className="meeting-mini-track"><span style={{ width: `${Math.min(100, achievement ?? 0)}%` }}/></div></td>}<td><button className="meeting-present-button" onClick={() => { setSelectedId(row.id); setDisplay("person"); }} aria-label={`${row.name}の発表画面を開く`}>発表<ChevronRight size={15}/></button></td></tr>;
        })}</tbody></table></div>
        <div className="meeting-board-foot"><span>{canRegister ? "各項目の＋から、担当者と工程を指定して活動を記録できます。" : "実績を閲覧しています。"}</span>{live && <SyncedTime value={syncedAt}/>}</div>
      </> : selectedRow && <div className="meeting-person-report">
        <div className="meeting-person-picker" role="group" aria-label="発表するプレイヤー">{ordered.map(player => <button key={player.id} aria-pressed={selectedRow.id === player.id} className={selectedRow.id === player.id ? "active" : ""} onClick={() => setSelectedId(player.id)}>{player.name}</button>)}</div>
        <div className="meeting-speaker-heading"><div><span className="meeting-speaker-kicker">{selectedIndex + 1} / {players.length} 人目の発表</span><h3><span className={`avatar ${selectedRow.color}`}>{selectedRow.name.slice(0, 1)}</span>{selectedRow.name}</h3><p>{selectedRow.id} · {selectedRow.team}{month && selectedProposalRank && <span>提案数 {selectedProposalRank}位 / {players.length}人</span>}</p></div><div className="meeting-presentation-nav"><button className="meeting-button" disabled={selectedIndex <= 0} onClick={() => setSelectedId(ordered[selectedIndex - 1].id)}><ChevronLeft size={17}/>前の人</button><button className="meeting-button selected" disabled={selectedIndex >= ordered.length - 1} onClick={() => setSelectedId(ordered[selectedIndex + 1].id)}>次の人<ChevronRight size={17}/></button></div></div>
        <div className="meeting-person-metrics">{performanceMetrics.map(metric => <div className="meeting-person-metric" key={metric.stage}><div><span>{metric.label}</span>{canRegister && <button className="meeting-register-icon" title={`${metric.label}を記録`} aria-label={`${selectedRow.name}の${metric.label}を記録`} disabled={busy} onClick={() => onRegister(selectedRow.id, metric.stage)}><Plus size={15}/></button>}</div><strong>{number(selectedRow.counts[metric.stage])}<small>件</small></strong>{month && <Difference value={selectedRow.counts[metric.stage] - selectedRow.previous[metric.stage]}/>}</div>)}</div>
        {month && <div className="meeting-person-goal"><div><span><Target size={18}/>月間提案目標</span><strong>{number(selectedRow.counts["提案"])}<small> / {selectedRow.target > 0 ? number(selectedRow.target) : "未設定"} 件</small></strong></div><div className="meeting-person-goal-progress"><strong>{selectedAchievement === null ? "目標未設定" : `${selectedAchievement}% 達成`}</strong><div className="meeting-goal-track"><div style={{ width: `${Math.min(100, selectedAchievement ?? 0)}%` }}/></div><span>{selectedAchievement === null ? "プレイヤー管理で月間提案目標を設定できます。" : selectedRow.counts["提案"] >= selectedRow.target ? "月間提案目標を達成しています。" : `目標まで ${number(selectedRow.target - selectedRow.counts["提案"])}件`}</span></div></div>}
        <p className="meeting-comparison-note">{month ? `${monthName(previous!)}との差を各項目に表示しています。対象月全体の実績を比較しています。` : "日別・累計の表示では、前月差と月間提案目標の達成率は表示していません。"}</p>
      </div>}
    </div>

    <details className="meeting-definitions"><summary>集計の見方</summary><p>各工程に記録した日付で集計します。ステータス変更のみでは実績は増えません。前月差は、対象月全体と前月全体の件数の差です。</p><div>{performanceMetrics.map(metric => <dl key={metric.stage}><dt>{metric.label}</dt><dd>{metric.description}</dd></dl>)}</div></details>
  </section>;
}
