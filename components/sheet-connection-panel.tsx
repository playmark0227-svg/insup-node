import { useState } from "react";
import { FileSpreadsheet, RefreshCw, CheckCircle2, Clock3 } from "lucide-react";
import { Input } from "./ui/input";
import { matchingFields } from "../lib/management-data";
import type { SheetDestination } from "../lib/sheets-client";
import { sheetNotices } from "../lib/sheet-notices";

type Props = {
  endpoint: string; mode: "live" | "demo"; busy: boolean; error: string;
  connected: boolean; syncedAt?: string; writesEnabled?: boolean; warnings: string[];
  destination?: SheetDestination;
  onConnect: (value: string) => Promise<void>; onRefresh: () => Promise<void>;
  onDemo?: () => void;
  onReviewPlayers?: () => void;
};

export function SheetConnectionPanel(props: Props) {
  const [url, setUrl] = useState(props.endpoint);
  const [message, setMessage] = useState("");
  const notices = sheetNotices(props.warnings);
  return <div className="connection-layout">
    <section className="card connection-main">
      <span className="connection-symbol"><FileSpreadsheet size={30}/></span>
      <h2>Googleスプレッドシート連携</h2>
      <p>新しい管理用シートから実績を取得し、画面から活動を登録します。</p>
      <span className="connection-status">{props.connected ? <CheckCircle2 size={15}/> : <Clock3 size={15}/>}
        {props.connected ? (props.writesEnabled ? "読み書き接続" : "読み取り接続") : props.endpoint ? "ログイン待ち" : "Google側の設定待ち"}
      </span>
      {props.syncedAt && <p className="panel-note">最終取得：{new Date(props.syncedAt).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})}</p>}
      {props.connected && <button className="secondary-button" disabled={props.busy} onClick={() => props.onRefresh().catch(()=>{})}><RefreshCw size={16}/>{props.busy ? "取得中…" : "最新の実績を取得"}</button>}
      <form className="app-form connection-form" onSubmit={async e=>{
        e.preventDefault(); setMessage("");
        try { await props.onConnect(url); setMessage("接続先を設定しました。IDとパスワードでログインしてください。"); }
        catch (error) { setMessage(error instanceof Error ? error.message : "接続できませんでした。"); }
      }}>
        <label>連携用URL<Input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" required disabled={props.busy}/></label>
        <p className="panel-note">管理者がGoogle側で発行するウェブアプリURLです。パスワードやAPIキーを入力する欄ではありません。</p>
        <button className="primary-button" disabled={props.busy}>{props.busy ? "確認中…" : "接続先を確認して設定"}</button>
        {(message || props.error) && <p className="connection-message" role="status">{message || props.error}</p>}
      </form>
      {notices.alerts.length > 0 && <div className="info-box" role="status">{notices.alerts.map((warning,i)=><p key={i}>{warning}</p>)}</div>}
      {notices.unassignedRows > 0 && props.onReviewPlayers && <details className="connection-help">
        <summary>担当者の確認（{notices.unassignedRows}件）</summary>
        <p className="panel-note">担当者を確認する必要がある記録があります。プレイヤー管理で、シートに記載された担当名を登録すると本人の成果に反映されます。</p>
        <button className="text-button" onClick={props.onReviewPlayers}>プレイヤー管理で確認する</button>
      </details>}
      <details className="connection-help">
        <summary>管理者向けの初期設定</summary>
        <ol>
          <li>新しい保存先へデータをコピーし、値・数式・書式を照合します。</li>
          <li>Google側の初期設定で管理者・プレイヤーのログイン情報を発行します。</li>
          <li>別の検証用シートで動作を確認し、新しい保存先を有効にして連携用URLを入力します。</li>
        </ol>
        <div className="sheet-links"><a href={`${import.meta.env.BASE_URL}apps-script/SETUP.md`} target="_blank" rel="noreferrer">設定手順</a><a href={`${import.meta.env.BASE_URL}apps-script/Code.gs`} download>Google側の連携コード</a></div>
      </details>
      <details className="schema-details"><summary>候補者の管理項目（26項目）</summary><div>{matchingFields.map((label,i)=><span key={label}><code>{String.fromCharCode(65+i)}</code>{label}</span>)}</div></details>
      {props.destination && <div className="sheet-links"><p className="panel-note">保存先：{props.destination.title}</p><a href={props.destination.matchingUrl} target="_blank" rel="noreferrer">保存先のマッチングDBを開く</a><a href={props.destination.kpiUrl} target="_blank" rel="noreferrer">保存先のKPI・KGIを開く</a></div>}
      {props.onDemo && <button className="text-button" disabled={props.busy} onClick={props.onDemo}>サンプル画面を確認</button>}
    </section>
    <section className="card rule-card"><h2>集計と保存</h2>
      <div className="rule-item"><strong>候補者面談</strong><p>同日・同担当・同候補者の面談は1件として集計します。</p></div>
      <div className="rule-item"><strong>提案とマッチ</strong><p>各工程の日付と提案行で集計します。マッチはV列の候補者承諾日です。</p></div>
      <div className="rule-item"><strong>DBと月間KPIへの反映</strong><p>成果を登録すると「2期目マッチングDB」に保存され、「2期目月間KPI・KGI」の集計式に反映されます。</p></div>
      <div className="rule-item"><strong>プレイヤーの明細</strong><p>ログインした本人の明細を取得します。ランキングは件数と表示名を共有します。</p></div>
      <p className="panel-note">C面談実施はQ列、稼働開始実績はX列の日付で集計します。</p>
    </section>
  </div>;
}
