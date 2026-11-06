import { useState } from "react";
import { FileSpreadsheet, RefreshCw, CheckCircle2, Clock3 } from "lucide-react";
import { Input } from "./ui/input";
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
  const [url, setUrl] = useState(props.endpoint);
  const [message, setMessage] = useState("");
  const notices = sheetNotices(props.warnings);
  return <div className="connection-layout">
    <section className="card connection-main">
      <span className="connection-symbol"><FileSpreadsheet size={30}/></span>
      <h2>データ連携</h2>
      <p>接続サーバーを確認し、ログインして候補者と成果を管理します。</p>
      <span className="connection-status">{props.connected ? <CheckCircle2 size={15}/> : <Clock3 size={15}/>}
        {props.connected ? (props.writesEnabled ? "読み書き接続" : "読み取り接続") : props.endpoint ? "ログイン待ち" : "接続設定待ち"}
      </span>
      {props.syncedAt && <p className="panel-note">最終取得：{new Date(props.syncedAt).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})}</p>}
      {props.connected && <button className="secondary-button" disabled={props.busy} onClick={() => props.onRefresh().catch(()=>{})}><RefreshCw size={16}/>{props.busy ? "取得中…" : "最新の実績を取得"}</button>}
      <form className="app-form connection-form" onSubmit={async e=>{
        e.preventDefault(); setMessage("");
        try { await props.onConnect(url); setMessage("接続先を設定しました。IDとパスワードでログインしてください。"); }
        catch (error) { setMessage(error instanceof Error ? error.message : "接続できませんでした。"); }
      }}>
        <label>接続サーバーURL<Input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" required disabled={props.busy}/></label>
        <p className="panel-note">管理者が指定するアプリの接続サーバーです。パスワードやAPIキーを入力する欄ではありません。</p>
        <button className="primary-button" disabled={props.busy}>{props.busy ? "確認中…" : "接続先を確認して設定"}</button>
        {(message || props.error) && <p className="connection-message" role="status">{message || props.error}</p>}
      </form>
      {notices.alerts.length > 0 && <div className="info-box" role="status">{notices.alerts.map((warning,i)=><p key={i}>{warning}</p>)}</div>}
      {props.connected && props.admin && notices.unassignedRows > 0 && props.onReviewPlayers && <details className="connection-help">
        <summary>担当者の確認（{notices.unassignedRows}件）</summary>
        <p className="panel-note">担当者を確認する必要がある記録があります。プレイヤー管理で、移行した記録の担当名を確認すると本人の成果に反映されます。</p>
        <button className="text-button" onClick={props.onReviewPlayers}>プレイヤー管理で確認する</button>
      </details>}
      {props.connected && props.admin && <details className="connection-help">
        <summary>管理者向けの接続情報</summary>
        <p className="panel-note">公開アプリの接続サーバーは、管理者が公開設定で指定します。ログインと権限の確認を通して、保存先のデータを取得・更新します。</p>
        <p className="panel-note">保存先を切り替える際は、各端末の未同期の入力と保存結果を先に確認してください。接続先や端末の一時保存を初期化せず、保存IDを保って確認します。</p>
        <div className="sheet-links"><a href={`${import.meta.env.BASE_URL}apps-script/SETUP.md`} target="_blank" rel="noreferrer">接続の設定手順</a><a href={`${import.meta.env.BASE_URL}apps-script/Code.gs`} download>接続サーバーのコード</a></div>
      </details>}
      {props.connected && props.admin && <details className="schema-details"><summary>候補者の管理項目（26項目）</summary><div>{matchingFields.map(label=><span key={label}>{label}</span>)}</div></details>}
      {props.connected && props.admin && props.destination && <div className="sheet-links"><p className="panel-note">現在の保存先：{props.destination.title}</p><a href={props.destination.matchingUrl} target="_blank" rel="noreferrer">保存先のマッチングDBを開く</a><a href={props.destination.kpiUrl} target="_blank" rel="noreferrer">保存先のKPI・KGIを開く</a></div>}
      {props.onDemo && <button className="text-button" disabled={props.busy} onClick={props.onDemo}>サンプル画面を確認</button>}
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
