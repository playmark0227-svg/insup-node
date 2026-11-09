import { Cloud, CheckCircle2, RefreshCw, Clock3 } from "lucide-react";
import type { FirestoreStorageBackend } from "../lib/storage-backend";

type Props = {
  backend: FirestoreStorageBackend;
  admin: boolean;
  cached: boolean;
  busy: boolean;
  error: string;
  syncedAt?: string;
  writesEnabled?: boolean;
  onRefresh: () => Promise<void>;
};

/** No legacy endpoint editor or spreadsheet destination link appears after cutover. */
export function StorageStatus({ backend, admin, cached, busy, error, syncedAt, writesEnabled, onRefresh }: Props) {
  return <div className="connection-layout">
    <section className="card connection-main" aria-label="Firebaseの保存と同期">
      <span className="connection-symbol"><Cloud size={30}/></span>
      <h2>データの保存・同期</h2>
      <p>候補者や成果をFirebaseへ保存し、ログインした端末で最新の状態を確認できます。</p>
      <span className="connection-status">{cached ? <Clock3 size={15}/> : <CheckCircle2 size={15}/>}
        {cached ? "前回の集計を表示・接続確認中" : writesEnabled ? "クラウドに保存・同期" : "クラウドデータを閲覧中"}
      </span>
      <p className="panel-note">保存先：Firebase（Cloud Firestore）</p>
      {syncedAt && <p className="panel-note">{cached ? "前回取得" : "最終取得"}：{new Date(syncedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>}
      <button type="button" className="secondary-button" disabled={busy} onClick={() => { void onRefresh().catch(() => {}); }}><RefreshCw size={16}/>{busy ? "確認中…" : "最新のデータを確認"}</button>
      {error && <p className="connection-message" role="alert">{error}</p>}
      {cached && <p className="panel-note">最新の接続確認が完了すると、候補者の詳細や入力機能を利用できます。</p>}
      {admin && <details className="connection-help"><summary>管理者向けの保存先情報</summary>
        <dl><dt>Firebaseプロジェクト</dt><dd><code>{backend.projectId}</code></dd><dt>保存先の切替日時</dt><dd>{new Date(backend.migratedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</dd></dl>
        <p className="panel-note">これまでのスプレッドシートは移行元として残ります。アプリからの登録・編集はFirebaseへ保存します。</p>
      </details>}
    </section>
    <section className="card rule-card"><h2>保存状態の確認</h2>
      <div className="rule-item"><strong>保存中も画面を移動できます</strong><p>入力を端末へ一時保存した後、バックグラウンドで同期します。右上に保存状況を表示します。</p></div>
      <div className="rule-item"><strong>通信が途切れたとき</strong><p>未確認の入力を保持します。右上の保存状況から、同じ内容の保存結果を確認できます。</p></div>
      <div className="rule-item"><strong>閲覧できる情報</strong><p>候補者の詳細は本人と管理者が確認できます。ランキングでは件数と表示名を共有し、候補者の社内共有は確認して公開した内容だけを表示します。</p></div>
    </section>
  </div>;
}
