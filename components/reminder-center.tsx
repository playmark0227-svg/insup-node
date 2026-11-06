import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, Check, Clock3, ExternalLink, RotateCcw } from "lucide-react";
import type { CandidateRecord } from "@/lib/sheets-client";
import { buildReminderTasks, claimReminderDeliveries, defaultReminderSettings, readReminderSettings, releaseReminderDeliveries, reminderBusinessClock, reminderHash, reminderNotice, reminderTaskPending, writeReminderSettings, type ReminderSettings } from "@/lib/reminders";
import "./reminder-center.css";

export type ReminderCenterProps = {
  identityKey: string; selfPlayerId: string; admin: boolean; records: readonly CandidateRecord[];
  /** True only after current authentication and a full live snapshot. Never enable from a display cache. */
  enabled: boolean; showPanel?: boolean; onOpenRecord: (recordId: string) => void;
};
const permissionState = (): NotificationPermission | "unsupported" => typeof Notification === "undefined" || typeof window === "undefined" || !window.isSecureContext ? "unsupported" : Notification.permission;
const timeLabel = (value: number) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(value);

/** Mount once per authenticated workspace. The timer keeps running when the panel is hidden. */
export function ReminderCenter({ identityKey, selfPlayerId, admin, records, enabled, showPanel = true, onOpenRecord }: ReminderCenterProps) {
  const [now, setNow] = useState(() => Date.now()), [scope, setScope] = useState(""), [keys, setKeys] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<ReminderSettings>(defaultReminderSettings), [permission, setPermission] = useState(permissionState), [notice, setNotice] = useState(""), [error, setError] = useState(""), [requesting, setRequesting] = useState(false);
  const generation = useRef(0), checking = useRef(false), notification = useRef<Notification | null>(null);
  const current = useRef({ identityKey, enabled, onOpenRecord, settings, taskIds:new Set<string>() });
  const clock = reminderBusinessClock(now), tasks = useMemo(() => enabled ? buildReminderTasks(records, selfPlayerId, admin, now) : [], [records, selfPlayerId, admin, enabled, clock.day]);
  current.current = { identityKey, enabled, onOpenRecord, settings, taskIds:new Set(tasks.map(task=>task.id)) };
  const recordMap = useMemo(() => new Map(records.filter(record => record.playerId && (admin || record.playerId === selfPlayerId)).map(record => [record.recordId, record])), [records, admin, selfPlayerId]);

  useEffect(() => {
    const revision = ++generation.current; setScope(""); setKeys({}); setSettings(defaultReminderSettings()); setNotice(""); setError(""); setRequesting(false); checking.current = false;
    notification.current?.close(); notification.current = null;
    if (enabled && identityKey) void reminderHash(identityKey).then(hash => {
      if (revision !== generation.current) return; setSettings(readReminderSettings(hash, Date.now())); setScope(hash);
    }).catch(() => { if (revision === generation.current) setError("通知の利用者を確認できませんでした。アプリ内の予定一覧は利用できます。"); });
    return () => { generation.current++; notification.current?.close(); notification.current = null; };
  }, [identityKey, enabled]);
  useEffect(() => {
    let disposed = false; setKeys({}); if (!scope) return;
    void Promise.all(tasks.map(async task => [task.id, await reminderHash(`${scope}:${task.id}`)] as const)).then(entries => { if (!disposed) setKeys(Object.fromEntries(entries)); }).catch(() => { if (!disposed) setError("通知の識別情報を準備できませんでした。アプリ内で予定を確認してください。"); });
    return () => { disposed = true; };
  }, [scope, tasks]);
  useEffect(() => {
    if (!enabled) return;
    const update = () => { setNow(Date.now()); setPermission(permissionState()); };
    const timer = window.setInterval(update, 60000); window.addEventListener("focus", update); document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [enabled]);
  useEffect(() => {
    if (!scope || !enabled) return;
    const sync = (event: StorageEvent) => { if (event.key === `node-reminder-settings-v1:${scope}`) setSettings(readReminderSettings(scope, Date.now())); };
    window.addEventListener("storage", sync); return () => window.removeEventListener("storage", sync);
  }, [scope, enabled]);
  useEffect(() => { if (!settings.enabled || permission !== "granted") { notification.current?.close(); notification.current=null; } }, [settings.enabled, permission]);
  useEffect(() => {
    if (!enabled || !scope || !settings.enabled || permission !== "granted" || clock.hour < settings.hour || checking.current) return;
    const due = tasks.filter(task => keys[task.id] && reminderTaskPending(keys[task.id], settings, now));
    if (!due.length) return;
    const revision = generation.current, identity = identityKey; checking.current = true;
    void (async () => {
      let claimed: string[] = [];
      try {
        claimed = await claimReminderDeliveries(scope, due.map(task => keys[task.id]), now);
        if (revision !== generation.current || !current.current.enabled || current.current.identityKey !== identity || !current.current.settings.enabled || reminderBusinessClock(Date.now()).hour < current.current.settings.hour || permissionState() !== "granted") { if (claimed.length) await releaseReminderDeliveries(scope, claimed); return; }
        if (!claimed.length) return;
        const pending = due.filter(task => claimed.includes(keys[task.id]) && current.current.taskIds.has(task.id) && reminderTaskPending(keys[task.id],current.current.settings,Date.now()));
        if (!pending.length) return;
        const text = reminderNotice(pending.length); notification.current?.close();
        const created = new Notification(text.title, { body: text.body, tag: `insup-node-${scope}:${clock.day}` }); notification.current = created;
        created.onclick = () => { if (revision === generation.current && current.current.enabled && current.current.identityKey === identity && current.current.settings.enabled && current.current.taskIds.has(pending[0].id)) { window.focus(); current.current.onOpenRecord(pending[0].recordId); } created.close(); };
        created.onerror = () => { void releaseReminderDeliveries(scope, claimed).catch(() => {}); if (revision === generation.current) { setNotice(""); setError("PC通知を表示できませんでした。ブラウザ・OSの通知設定を確認するか、アプリ内の予定一覧を使ってください。"); } };
        setNotice(`明日の予定${pending.length}件をPCへ通知しました。`); setError("");
      } catch (value) {
        if (claimed.length) void releaseReminderDeliveries(scope, claimed).catch(() => {});
        if (revision === generation.current) setError(value instanceof Error ? value.message : "PC通知を表示できませんでした。アプリ内で予定を確認してください。");
      } finally { if (revision === generation.current) checking.current = false; }
    })();
  }, [enabled, scope, identityKey, permission, clock.day, clock.hour, settings, tasks, keys, now]);

  function updateSettings(next: ReminderSettings) {
    setSettings(next);
    if (scope && !writeReminderSettings(scope, next)) setError("通知設定をこの端末に保存できませんでした。この画面を閉じるまでの設定です。");
  }
  async function enableNotifications() {
    if (!enabled || !scope || requesting || permissionState() === "unsupported") return;
    const revision = generation.current; setRequesting(true); setError("");
    try {
      // Permission is requested only from this explicit user click, never from an effect.
      const nextPermission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (revision !== generation.current) return; setPermission(nextPermission);
      if (nextPermission === "granted") { updateSettings({ ...settings, enabled: true }); setNow(Date.now()); setNotice("PC通知を有効にしました。このブラウザでアプリを開いている間、指定時刻以降に明日の未確認予定を通知します。"); }
      else setNotice(nextPermission === "denied" ? "ブラウザで通知がブロックされています。アプリ内の一覧はそのまま使えます。" : "通知は許可されませんでした。アプリ内の一覧はそのまま使えます。");
    } catch { if (revision === generation.current) setError("PC通知の許可を確認できませんでした。アプリ内の一覧は利用できます。"); }
    finally { if (revision === generation.current) setRequesting(false); }
  }
  function changeTask(taskId: string, action: "done" | "snooze" | "restore") {
    const key = keys[taskId]; if (!enabled || !scope || !key) return;
    const actions = { ...settings.actions }, currentTime = Date.now();
    if (action === "restore") delete actions[key];
    else actions[key] = { kind: action, until: action === "snooze" ? currentTime + 15 * 60000 : 0, expires: currentTime + 3 * 86400000 };
    updateSettings({ ...settings, actions }); setNow(currentTime);
    if (action !== "done") void releaseReminderDeliveries(scope, [key]).catch(() => setError("PC通知の再通知を設定できませんでした。アプリ内で確認してください。"));
    setNotice(action === "done" ? "この予定の前日確認を完了にしました。成果や予定日時は変更していません。" : action === "snooze" ? "この通知だけ15分後に再確認します。面談の予定日時は変更していません。" : "前日確認を未確認へ戻しました。");
  }
  const pendingCount = tasks.filter(task => !keys[task.id] || reminderTaskPending(keys[task.id], settings, now)).length;
  return <section className="card reminder-center" hidden={!showPanel} aria-label="前日リマインド"><header><div><span className="eyebrow">DAILY FOLLOW UP</span><h2><Bell size={20}/>明日の予定・前日確認</h2><p>{clock.tomorrow} · 未確認 {pendingCount}件 / 全{tasks.length}件</p></div><span className="reminder-mode">{settings.enabled && permission === "granted" ? "PC通知 有効" : "アプリ内の一覧"}</span></header>
    <p className="reminder-privacy">PC通知には氏名・会社名・面談内容を載せません。アプリを開いていない間や、PCがスリープ中は通知しません。起動中もブラウザ・OSの設定によって通知が表示されない場合があります。</p>
    {!enabled ? <p className="info-box">最新のログインと共有データの読み込みが完了すると、予定を確認できます。</p> : <>
      <div className="reminder-settings"><label>前日に通知する時刻（日本時間）<select aria-label="前日リマインドの時刻" disabled={!scope} value={settings.hour} onChange={event => { const hour = Number(event.target.value); if (Number.isInteger(hour) && hour >= 0 && hour <= 23) updateSettings({ ...settings, hour }); }}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00 以降</option>)}</select></label>
        {settings.enabled ? <button className="secondary-button" type="button" onClick={() => { updateSettings({ ...settings, enabled: false }); notification.current?.close(); setNotice("この端末のPC通知を停止しました。アプリ内の予定一覧は利用できます。"); }}><BellOff size={16}/>PC通知を停止</button> : <button className="secondary-button" type="button" disabled={!scope || permission === "unsupported" || permission === "denied" || requesting} onClick={() => void enableNotifications()}><Bell size={16}/>{requesting ? "許可を確認中…" : "この端末のPC通知を有効にする"}</button>}
      </div>
      {permission === "unsupported" && <p className="panel-note">この環境ではPC通知を利用できません。対応するPC版ブラウザで開くか、下の一覧で確認してください。</p>}
      {permission === "denied" && <p className="panel-note">PC通知はブロック中です。利用する場合は、ブラウザのこのサイトの通知設定をご本人で変更してください。</p>}
      {!!notice && <p className="reminder-status" role="status">{notice}</p>}{!!error && <p className="form-error" role="alert">{error}</p>}
      {tasks.length ? <ol className="reminder-tasks">{tasks.map(task => { const hash = keys[task.id], action = hash ? settings.actions[hash] : undefined, done = action?.kind === "done" && action.expires > now, snoozed = action?.kind === "snooze" && action.until > now; return <li key={task.id} className={done ? "is-confirmed" : undefined}><div><span>{task.label} · {task.date}{task.time ? ` ${task.time}` : ""}</span><strong>{recordMap.get(task.recordId)?.candidateName || "候補者の予定"}</strong><small>{done ? "前日確認済み" : snoozed ? `${timeLabel(action.until)}まで再通知を待機` : "前日確認が未完了"}</small></div><div className="reminder-task-actions"><button type="button" className="text-button" onClick={() => onOpenRecord(task.recordId)}><ExternalLink size={14}/>予定・進捗を開く</button>{done ? <button type="button" className="text-button" disabled={!hash} onClick={() => changeTask(task.id, "restore")}><RotateCcw size={14}/>未確認へ戻す</button> : <><button type="button" className="secondary-button" disabled={!hash} onClick={() => changeTask(task.id, "done")}><Check size={14}/>前日確認を完了</button><button type="button" className="text-button" disabled={!hash} onClick={() => changeTask(task.id, "snooze")}><Clock3 size={14}/>15分後に確認</button></>}</div></li>; })}</ol> : <p className="reminder-empty">明日の未完了予定はありません。C面談予定・合否回答期日・稼働開始予定を登録すると、この一覧に表示されます。</p>}
      <p className="panel-note">「前日確認を完了」はこの端末の通知の確認記録です。面談実施や稼働開始の成果は、実際に実施してから記録してください。記録を開くだけでは確認済みにしません。</p>
    </>}
  </section>;
}
