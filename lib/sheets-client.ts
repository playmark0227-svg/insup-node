import type { Activity, Metric, Player } from "./node-data";

export type SheetPlayer = Player & { sheetNames?: string[] };
export type Counts = Record<string, Record<string, Partial<Record<Metric, number>>>>;
export type SheetDestination = { title: string; matchingUrl: string; kpiUrl: string };
export type SheetSnapshot = {
  self: { playerId: string; role: "admin" | "player" };
  players: SheetPlayer[];
  activities: Activity[];
  counts: Counts;
  syncedAt: string;
  warnings: string[];
  writesEnabled: boolean;
  destination?: SheetDestination;
};
export type MutationResult = {
  snapshot: SheetSnapshot;
  credentials?: { id: string; password: string };
};

export class SheetApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "SheetApiError";
  }
}

// A committed write may still have lost its response. Reuse its payload and ID.
export function isUncertainWrite(error: unknown): boolean {
  return !(error instanceof SheetApiError) || ["NETWORK", "HTTP", "NOT_JSON", "INTERNAL", "API", "SHEET_WRITE_FAILED", "SHEET_READ_FAILED", "INVALID_RESPONSE"].includes(error.code);
}

// Credentials go only to a deployed Apps Script endpoint, never to a URL query.
export function validateEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new SheetApiError("INVALID_ENDPOINT", "Apps ScriptのウェブアプリURL（/exec）を入力してください。"); }
  if (url.protocol !== "https:" || url.hostname !== "script.google.com" ||
      !/^\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(url.pathname) ||
      url.username || url.password || url.search || url.hash) {
    throw new SheetApiError("INVALID_ENDPOINT", "Apps ScriptのウェブアプリURL（/exec）を入力してください。");
  }
  return url.href;
}

function recoverableContentUrl(response: Response): string | null {
  if (response.status !== 404 || !response.redirected) return null;
  let url: URL;
  try { url = new URL(response.url); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "script.googleusercontent.com" ||
      url.pathname !== "/macros/echo" || url.port || url.username || url.password || url.hash ||
      url.searchParams.getAll("user_content_key").length !== 1 || !url.searchParams.get("user_content_key")?.trim() ||
      url.searchParams.getAll("lib").length > 1 ||
      [...url.searchParams.keys()].some(key => key !== "user_content_key" && key !== "lib")) return null;
  return response.url;
}

function waitForContent(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 3_000);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function sheetRequest<T>(
  endpoint: string,
  action: string,
  payload: unknown = {},
  options: { token?: string; operationId?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const target = validateEndpoint(endpoint);
  const timeout = AbortSignal.timeout(45_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      credentials: "omit",
      cache: "no-store",
      redirect: "follow",
      signal,
      body: JSON.stringify({ version: 1, action, payload, token: options.token, operationId: options.operationId }),
    });
    const contentUrl = recoverableContentUrl(response);
    if (contentUrl) {
      // Retry only Google's already-generated result, never the operation POST.
      // Keep this temporary URL in memory only; it must not be logged or persisted.
      await waitForContent(signal);
      signal.throwIfAborted();
      response = await fetch(contentUrl, { method: "GET", credentials: "omit", cache: "no-store", redirect: "error", signal });
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new SheetApiError("NETWORK", "Googleとの応答を確認できませんでした。入力は残っています。接続を確認し、同じ内容で再試行してください。");
  }
  if (!response.ok) throw new SheetApiError("HTTP", `Googleからの応答を確認できませんでした（${response.status}）。`);
  const body = await response.text();
  let envelope: { ok?: boolean; data?: T; error?: { code?: string; message?: string } };
  try { envelope = JSON.parse(body); }
  catch {
    throw new SheetApiError("NOT_JSON", "連携用の応答が返りませんでした。Google側のウェブアプリ公開設定とURLを確認してください。");
  }
  if (envelope.ok !== true) {
    throw new SheetApiError(envelope.error?.code || "API", envelope.error?.message || "スプレッドシートへの操作に失敗しました。");
  }
  if (!Object.hasOwn(envelope, "data")) throw new SheetApiError("INVALID_RESPONSE", "連携先から正しいデータを取得できませんでした。");
  return envelope.data as T;
}

export function assertSnapshot(value: unknown): asserts value is SheetSnapshot {
  const s = value as SheetSnapshot;
  if (!s || !s.self || !["admin", "player"].includes(s.self.role) ||
      typeof s.self.playerId !== "string" || !Array.isArray(s.players) || !Array.isArray(s.activities) ||
      !s.counts || typeof s.counts !== "object" || typeof s.writesEnabled !== "boolean" ||
      !Array.isArray(s.warnings) || typeof s.syncedAt !== "string" ||
      s.players.some(p => typeof p.id !== "string" || typeof p.name !== "string" || !Number.isSafeInteger(p.target) || p.target < 1) ||
      s.activities.some(a => typeof a.id !== "string" || typeof a.playerId !== "string" || typeof a.date !== "string")) {
    throw new SheetApiError("INVALID_RESPONSE", "連携データの形式が正しくありません。Google側の連携コードを更新してください。");
  }
  if (s.self.role === "player" && (!s.players.some(p => p.id === s.self.playerId) || s.activities.some(a => a.playerId !== s.self.playerId))) {
    throw new SheetApiError("INVALID_RESPONSE", "本人のデータを確認できませんでした。再ログインしてください。");
  }
  if (s.destination && (s.self.role !== "admin" || typeof s.destination.title !== "string" ||
      ![s.destination.matchingUrl, s.destination.kpiUrl].every(url => typeof url === "string" && /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/edit(?:\?gid=\d+(?:#gid=\d+)?|#gid=\d+)$/.test(url)))) {
    throw new SheetApiError("INVALID_RESPONSE", "保存先の情報を確認できませんでした。管理者で再ログインしてください。");
  }
}

export function liveCount(counts: Counts, period: string, metric: Metric, playerId: string | null): number {
  const people = counts[period] || {};
  return playerId ? (people[playerId]?.[metric] || 0) :
    Object.values(people).reduce((total, value) => total + (value[metric] || 0), 0);
}

export function businessToday(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
