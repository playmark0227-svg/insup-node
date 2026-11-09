import { FileSpreadsheet, RefreshCw, CheckCircle2, Clock3 } from "lucide-react";
import { matchingFields } from "../lib/management-data";
import type { SheetDestination } from "../lib/sheets-client";
import { sheetNotices } from "../lib/sheet-notices";

type Props = {
  endpoint: string; mode: "live" | "demo"; busy: boolean; error: string;
  connected: boolean; admin?: boolean; syncedAt?: string; writesEnabled?: boolean; warnings: string[];
  destination?: SheetDestination;
  onConnect: (value: string) => Promise<void>; onRefresh: () => Promise<void>;
  onDemo?: () => void;
  onReviewPlayers?: () => void;
};

export function SheetConnectionPanel(props: Props) {
  const notices = sheetNotices(props.warnings);
  return <div className="connection-layout">
    <section className="card connection-main">
      <span className="connection-symbol"><FileSpreadsheet size={30}/></span>
      <h2>接続状況</h2>
      <p>候補者と成果の保存状況を確認できます。</p>
      <span className="connection-status">{props.connected ? <CheckCircle2 size={15}/> : <Clock3 size={15}/>}
        {props.connected ? (props.writesEnabled ? "保存・更新できます" : "閲覧のみ") : props.endpoint ? "ログイン待ち" : "接続を確認できません"}
      </span>
      {props.syncedAt && <p className="panel-note">最終取得：{new Date(props.syncedAt).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})}</p>}
      {props.connected && <button className="secondary-button" disabled={props.busy} onClick={() => props.onRefresh().catch(()=>{})}><RefreshCw size={16}/>{props.busy ? "取得中…" : "最新の実績を取得"}</button>}
      {!props.connected && <p className="panel-note">{props.endpoint ? "ログイン画面に戻り、発行されたIDとパスワードでログインしてください。" : "現在アプリに接続できません。管理者にお問い合わせください。"}</p>}
      {props.error && <p className="connection-message" role="alert">{props.error}</p>}
      {notices.alerts.length > 0 && <div className="info-box" role="status">{notices.alerts.map((warning,i)=><p key={i}>{warning}</p>)}</div>}
      {props.connected && props.admin && notices.unassignedRows > 0 && props.onReviewPlayers && <details className="connection-help">
        <summary>担当者の確認（{notices.unassignedRows}件）</summary>
        <p className="panel-note">担当者を確認する必要がある記録があります。プレイヤー管理で担当名を確認すると、本人の成果に反映されます。</p>
        <button className="text-button" onClick={props.onReviewPlayers}>プレイヤー管理で確認する</button>
      </details>}
      {props.connected && props.admin && <details className="schema-details"><summary>候補者の管理項目（26項目）</summary><div>{matchingFields.map(label=><span key={label}>{label}</span>)}</div></details>}
      {props.connected && props.admin && props.destination && <div className="sheet-links"><p className="panel-note">現在の保存先：{props.destination.title}</p><a href={props.destination.matchingUrl} target="_blank" rel="noreferrer">保存先のマッチングDBを開く</a><a href={props.destination.kpiUrl} target="_blank" rel="noreferrer">保存先のKPI・KGIを開く</a></div>}
      {props.mode === "demo" && props.onDemo && <button className="text-button" disabled={props.busy} onClick={props.onDemo}>サンプル画面を確認</button>}
    </section>
    <section className="card rule-card"><h2>集計と保存</h2>
      <div className="rule-item"><strong>候補者面談</strong><p>同日・同担当・同候補者の面談は1件として集計します。</p></div>
      <div className="rule-item"><strong>提案とマッチ</strong><p>各工程の実績日と提案ごとの記録で集計します。マッチは候補者が承諾した日を記録します。</p></div>
      <div className="rule-item"><strong>成果と月別集計</strong><p>登録した工程と実績日をもとに、ダッシュボード・月別の成果・ランキングを更新します。</p></div>
      <div className="rule-item"><strong>プレイヤーの明細</strong><p>ログインした本人の明細を取得します。ランキングは件数と表示名を共有します。</p></div>
      <p className="panel-note">C面談実施と稼働開始は、予定日とは別に実施日を記録します。</p>
    </section>
  </div>;
}
