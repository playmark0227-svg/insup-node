import { candidateAppointments } from "./candidate-groups.ts";
import type { CandidateRecord } from "./sheets-client.ts";

export type ReminderTask = { id: string; recordId: string; date: string; time: string; label: string };
export type ReminderAction = { kind: "done" | "snooze"; until: number; expires: number };
export type ReminderSettings = { enabled: boolean; hour: number; actions: Record<string, ReminderAction> };
export const defaultReminderSettings = (): ReminderSettings => ({ enabled: false, hour: 9, actions: {} });
export function reminderBusinessClock(now: number) {
  const jst = new Date(now + 9 * 3600000);
  return { day: jst.toISOString().slice(0, 10), hour: jst.getUTCHours(), minute: jst.getUTCMinutes(), tomorrow: new Date(now + 9 * 3600000 + 86400000).toISOString().slice(0, 10) };
}
/** Enforce scope independently of the UI, including malformed snapshots. */
export function buildReminderTasks(records: readonly CandidateRecord[], selfPlayerId: string, admin: boolean, now = Date.now()): ReminderTask[] {
  const clock = reminderBusinessClock(now), scoped = records.filter(record => record.playerId && record.playerId !== "ADMIN" && (admin || record.playerId === selfPlayerId));
  return candidateAppointments(scoped, clock.day).filter(item => item.date === clock.tomorrow)
    .map(item => ({ id: `${item.recordId}:${item.label}:${item.date}:${item.time}`, recordId: item.recordId, date: item.date, time: item.time, label: item.label }));
}
const hex = /^[a-f0-9]{64}$/;
export async function reminderHash(value: string, cryptoProvider: Pick<Crypto, "subtle"> = globalThis.crypto): Promise<string> {
  const digest = await cryptoProvider.subtle.digest("SHA-256", new TextEncoder().encode(`insup-reminder-v1:${value}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
const storageKey = (scope: string) => { if (!hex.test(scope)) throw new Error("通知の利用者を確認できませんでした。"); return `node-reminder-settings-v1:${scope}`; };
export function readReminderSettings(scope: string, now: number, storage: Pick<Storage, "getItem"> = localStorage): ReminderSettings {
  try {
    const raw: unknown = JSON.parse(storage.getItem(storageKey(scope)) || "null");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultReminderSettings();
    const data = raw as Record<string, unknown>, result = defaultReminderSettings();
    result.enabled = data.enabled === true;
    if (typeof data.hour === "number" && Number.isInteger(data.hour) && data.hour >= 0 && data.hour <= 23) result.hour = data.hour;
    if (data.actions && typeof data.actions === "object" && !Array.isArray(data.actions)) for (const [key, value] of Object.entries(data.actions).slice(0, 2000)) {
      if (!hex.test(key) || !value || typeof value !== "object" || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      if ((entry.kind !== "done" && entry.kind !== "snooze") || typeof entry.until !== "number" || !Number.isFinite(entry.until) || typeof entry.expires !== "number" || !Number.isFinite(entry.expires) || entry.expires <= now || entry.expires > now + 32 * 86400000 || entry.until > entry.expires) continue;
      result.actions[key] = { kind: entry.kind, until: entry.until, expires: entry.expires };
    }
    return result;
  } catch { return defaultReminderSettings(); }
}
/** Only settings and one-way IDs are persisted. Never save candidate names, record IDs or text. */
export function writeReminderSettings(scope: string, settings: ReminderSettings, storage: Pick<Storage, "setItem"> = localStorage): boolean {
  try {
    if (!Number.isInteger(settings.hour) || settings.hour < 0 || settings.hour > 23) return false;
    const actions: Record<string, ReminderAction> = {};
    for (const [key, value] of Object.entries(settings.actions).slice(0, 2000)) if (hex.test(key) && (value.kind === "done" || value.kind === "snooze") && Number.isFinite(value.until) && Number.isFinite(value.expires) && value.until <= value.expires) actions[key] = { kind: value.kind, until: value.until, expires: value.expires };
    storage.setItem(storageKey(scope), JSON.stringify({ enabled: settings.enabled === true, hour: settings.hour, actions })); return true;
  } catch { return false; }
}
export function reminderTaskPending(key: string, settings: ReminderSettings, now: number): boolean {
  const action = settings.actions[key];
  return !action || action.expires <= now || action.kind === "snooze" && action.until <= now;
}
export function reminderNotice(count: number) {
  const safeCount = Math.max(0, Math.min(10000, Math.floor(count)));
  return { title: "INSUP NODE：明日の予定を確認", body: `確認する予定が${safeCount}件あります。ログイン中のアプリで詳細を確認してください。` };
}

type Delivery = { id: string; expires: number };
const deliveryDatabase = "insup-node-reminder-delivery-v1", deliveryStore = "deliveries";
function openDeliveryDatabase(factory: IDBFactory) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(deliveryDatabase, 1); let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(deliveryStore, { keyPath: "id" });
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(new Error("PC通知の重複確認用ストレージを開けませんでした。"));
    request.onblocked = () => { blocked = true; reject(new Error("PC通知の確認用ストレージを更新できませんでした。")); };
  });
}
/** A read-write transaction arbitrates simultaneous tabs before any OS notification.
 * Store only two SHA-256 IDs and expiration, without personal data or authentication tokens. */
export async function claimReminderDeliveries(scope: string, keys: readonly string[], now: number, factory: IDBFactory = indexedDB): Promise<string[]> {
  if (!hex.test(scope) || keys.length > 2000 || keys.some(key => !hex.test(key))) throw new Error("通知の識別情報を確認できませんでした。");
  if (!keys.length) return [];
  const db = await openDeliveryDatabase(factory);
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const transaction = db.transaction(deliveryStore, "readwrite"), store = transaction.objectStore(deliveryStore), claimed: string[] = [];
      for (const key of new Set(keys)) {
        const id = `${scope}:${key}`, request = store.get(id);
        request.onsuccess = () => { const old = request.result as Delivery | undefined; if (!old || !Number.isFinite(old.expires) || old.expires <= now) { store.put({ id, expires: now + 3 * 86400000 } satisfies Delivery); claimed.push(key); } };
      }
      const cursor = store.openCursor();
      cursor.onsuccess = () => { const entry = cursor.result; if (!entry) return; if ((entry.value as Delivery).expires <= now) entry.delete(); entry.continue(); };
      transaction.oncomplete = () => resolve(claimed);
      transaction.onerror = transaction.onabort = () => reject(new Error("PC通知の重複確認を保存できませんでした。アプリ内の予定一覧から確認できます。"));
    });
  } finally { db.close(); }
}
export async function releaseReminderDeliveries(scope: string, keys: readonly string[], factory: IDBFactory = indexedDB): Promise<void> {
  if (!hex.test(scope) || keys.some(key => !hex.test(key))) return;
  const db = await openDeliveryDatabase(factory);
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(deliveryStore, "readwrite"); for (const key of keys) tx.objectStore(deliveryStore).delete(`${scope}:${key}`); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(new Error("通知の再試行状態を保存できませんでした。")); }); } finally { db.close(); }
}
