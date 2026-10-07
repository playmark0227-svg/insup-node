import type { Activity, Metric, Player } from "./node-data";

export type SheetPlayer = Player & { sheetNames?: string[] };
export type Counts = Record<string, Record<string, Partial<Record<Metric, number>>>>;
export type SheetSnapshot = {
  self: { playerId: string; role: "admin" | "player" };
  players: SheetPlayer[];
  activities: Activity[];
  counts: Counts;
  syncedAt: string;
  warnings: string[];
  writesEnabled: boolean;
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
  return !(error instanceof SheetApiError) || ["NETWORK", "HTTP", "NOT_JSON", "INTERNAL", "API", "SHEET_WRITE_FAILED", "INVALID_RESPONSE"].includes(error.code);
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

export async function sheetRequest<T>(
  endpoint: string,
  action: string,
  payload: unknown = {},
  options: { token?: string; operationId?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const target = validateEndpoint(endpoint);
  const timeout = AbortSignal.timeout(45_000);
  let response: Response;
  try {
    response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      credentials: "omit",
      redirect: "follow",
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      body: JSON.stringify({ version: 1, action, payload, token: options.token, operationId: options.operationId }),
    });
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
}

export function liveCount(counts: Counts, period: string, metric: Metric, playerId: string | null): number {
  const people = counts[period] || {};
  return playerId ? (people[playerId]?.[metric] || 0) :
    Object.values(people).reduce((total, value) => total + (value[metric] || 0), 0);
}

export function businessToday(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
