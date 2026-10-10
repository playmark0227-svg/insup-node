import type { Activity, Metric, Player } from "./node-data";

export type SheetPlayer = Player & { sheetNames?: string[] };
export type Counts = Record<string, Record<string, Partial<Record<Metric, number>>>>;
export type SheetDestination = { title: string; matchingUrl: string; kpiUrl: string };
export type CandidateRecord = { recordId: string; rowVersion: string; row: number; playerId: string; candidateId?: string; candidateName: string; source: string; values: (string | number | boolean)[]; formulaColumns: number[] };
export type ManagementCell = {column:number;value:string|number|boolean;display:string;kind:"text"|"date"|"time"|"number"|"percent"|"boolean";options:string[];readonly:boolean;note:string};
export type ManagementRow = {row:number;version:string;cells:ManagementCell[]};
export type ManagementTable = {sheetId:number;title:string;startRow:number;rowCount:number;columnCount:number;readonly:boolean;headers?:string[];rows:ManagementRow[]};
export type ManagementTableInfo = {sheetId:number;title:string;rowCount:number;columnCount:number};
export type InterviewReview = {recordId:string;playerId:string;interviewDate:string;category:string;memo:string;nextAction:string;version:string;updatedAt:string};
export type InterviewAdviceUsage = {userRemaining:number;teamRemaining:number;resetAt:string};
export type InterviewAdvice = {summary:string;actions:string[];count:number;generatedAt:string;period?:string;source?:"generated"|"saved";aggregate?:{category:string;count:number}[];usage?:InterviewAdviceUsage};
export type InterviewAdviceState = {advice:InterviewAdvice|null;stale:boolean;count:number;usage:InterviewAdviceUsage;configured:boolean;pending:boolean};
export type SheetSnapshot = {
  reviewFeature?: boolean;
  interviewReviews?: InterviewReview[];
  records?: CandidateRecord[];
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
  changeId?: string;
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
  return !(error instanceof SheetApiError) || ["NETWORK", "TIMEOUT", "HTTP", "NOT_JSON", "INTERNAL", "API", "SHEET_WRITE_FAILED", "SHEET_READ_FAILED", "INVALID_RESPONSE"].includes(error.code);
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

function waitForRetry(signal: AbortSignal, milliseconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

const temporaryHttpStatuses = new Set([408, 502, 503, 504]);

async function recoverContent(url: string, signal: AbortSignal): Promise<{ response: Response; body?: string }> {
  // This URL identifies an already-generated result. Reading it again does not
  // repeat authentication or a write, and it must stay in memory only.
  const delays = [700, 1_500];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    await waitForRetry(signal, delays[attempt]);
    signal.throwIfAborted();
    try {
      const response = await fetch(url, { method: "GET", credentials: "omit", cache: "no-store", redirect: "error", signal });
      if (attempt === 0 && (response.status === 404 || temporaryHttpStatuses.has(response.status))) continue;
      // A stream interruption may occur after successful response headers.
      // It is still safe to recover this generated result with the final GET.
      const body = response.ok ? await response.text() : undefined;
      return { response, body };
    } catch (error) {
      signal.throwIfAborted();
      if (attempt > 0) throw error;
    }
  }
  throw new SheetApiError("NETWORK", "Googleからの応答を取得できませんでした。");
}

function connectionError(action: string, timedOut: boolean): SheetApiError {
  if (["analyzeInterviewReviews","readInterviewAdvice"].includes(action)) return new SheetApiError(timedOut?"TIMEOUT":"NETWORK",timedOut
    ? "改善案の応答が45秒以内に届きませんでした。理由の記録は保存済みです。「保存済みの改善案を再取得」で結果を確認できます。"
    : "改善案の通信が途中で切れました。理由の記録は保存済みです。接続を確認して改善案を再取得してください。");
  if (timedOut) {
    const message = action === "login"
      ? "ログインの応答が45秒以内に届きませんでした。IDとパスワードはそのままで、もう一度ログインしてください。"
      : action === "snapshot" || action === "health"
        ? "Googleからのデータ取得が45秒以内に完了しませんでした。通信状態を確認して再取得してください。"
        : "Googleの応答が45秒以内に届きませんでした。保存結果を確認できないため、同じ内容で再試行してください。";
    return new SheetApiError("TIMEOUT", message);
  }
  const message = action === "login"
    ? "ログインの通信が途中で切れました。通信状態を確認し、同じIDとパスワードでもう一度ログインしてください。"
    : action === "snapshot" || action === "health"
      ? "Googleからデータを取得できませんでした。通信状態を確認して再取得してください。"
      : "Googleとの応答を確認できませんでした。入力は残っています。接続を確認し、同じ内容で再試行してください。";
  return new SheetApiError("NETWORK", message);
}

function isCallerTimeout(signal?: AbortSignal): boolean {
  return !!signal?.aborted && signal.reason?.name === "TimeoutError";
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
  const readOnly = ["snapshot","health","managementTables","managementTable","readInterviewAdvice"].includes(action);
  const body = JSON.stringify({ version: 1, action, payload, token: options.token, operationId: options.operationId });
  for (let attempt = 0; attempt < (readOnly ? 2 : 1); attempt++) {
    let recoveringResult = false;
    try {
      signal.throwIfAborted();
      let recoveredBody: string | undefined;
      let response = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        signal,
        body,
      });
      const contentUrl = recoverableContentUrl(response);
      if (contentUrl) {
        recoveringResult = true;
        const recovered = await recoverContent(contentUrl, signal);
        response = recovered.response;
        recoveredBody = recovered.body;
      }
      if (!response.ok) {
        if (readOnly && attempt === 0 && !recoveringResult && temporaryHttpStatuses.has(response.status)) {
          await waitForRetry(signal, 750);
          continue;
        }
        throw new SheetApiError("HTTP", `Googleからの応答を確認できませんでした（${response.status}）。`);
      }
      // Body streaming can fail after fetch resolves; it shares the same deadline
      // and recovery policy as the initial connection.
      const responseBody = recoveredBody ?? await response.text();
      signal.throwIfAborted();
      let envelope: { ok?: boolean; data?: T; error?: { code?: string; message?: string } };
      try { envelope = JSON.parse(responseBody); }
      catch {
        throw new SheetApiError("NOT_JSON", "連携用の応答が返りませんでした。Google側のウェブアプリ公開設定とURLを確認してください。");
      }
      if (envelope?.ok !== true) {
        throw new SheetApiError(envelope?.error?.code || "API", envelope?.error?.message || "スプレッドシートへの操作に失敗しました。");
      }
      if (!Object.hasOwn(envelope, "data")) throw new SheetApiError("INVALID_RESPONSE", "連携先から正しいデータを取得できませんでした。");
      return envelope.data as T;
    } catch (error) {
      if (options.signal?.aborted) {
        if (isCallerTimeout(options.signal)) throw connectionError(action, true);
        throw error;
      }
      if (timeout.aborted) throw connectionError(action, true);
      if (error instanceof SheetApiError) throw error;
      // Only data reads may replay the POST after a transient connection failure.
      // Login creates a session; writes can commit before their response is lost.
      if (readOnly && attempt === 0 && !recoveringResult) {
        try { await waitForRetry(signal, 750); }
        catch (waitError) {
          if (options.signal?.aborted) {
            if (isCallerTimeout(options.signal)) throw connectionError(action, true);
            throw waitError;
          }
          throw connectionError(action, timeout.aborted);
        }
        continue;
      }
      throw connectionError(action, false);
    }
  }
  throw connectionError(action, timeout.aborted);
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
  if (s.records && (!Array.isArray(s.records) || s.records.some(r => typeof r.recordId!=="string" || typeof r.rowVersion!=="string" || typeof r.playerId!=="string" || typeof r.candidateName!=="string" || !Array.isArray(r.values) || r.values.length!==26 || !Array.isArray(r.formulaColumns) || r.values.some(v=>!["string","number","boolean"].includes(typeof v)) || (s.self.role==="player" && r.playerId!==s.self.playerId)))) {
    throw new SheetApiError("INVALID_RESPONSE","候補者情報の形式または閲覧権限を確認できませんでした。");
  }
  if(s.interviewReviews && (!Array.isArray(s.interviewReviews)||s.interviewReviews.some(r=>[r.recordId,r.playerId,r.interviewDate,r.category,r.memo,r.nextAction,r.version,r.updatedAt].some(v=>typeof v!=="string")||(s.self.role==="player"&&r.playerId!==s.self.playerId))))throw new SheetApiError("INVALID_RESPONSE","振り返りの閲覧権限を確認できませんでした。");
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
