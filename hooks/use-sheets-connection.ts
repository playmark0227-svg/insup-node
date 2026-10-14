import { useCallback, useEffect, useRef, useState } from "react";
import { initialPlayers, makeDemoActivities, type Activity } from "../lib/node-data";
import { assertSnapshot, isUncertainWrite, sheetRequest, validateEndpoint, SheetApiError, type MutationResult, type SheetSnapshot, type SheetPlayer, type InterviewAdvice, type InterviewAdviceState } from "../lib/sheets-client";
import { matchingFields } from "../lib/management-data";

const ENDPOINT_KEY = "insup.node.endpoint.v1";
const SESSION_KEY = "insup.node.session.v1";
const isExpired = (e: unknown) => e instanceof SheetApiError && ["AUTH_REQUIRED", "UNAUTHENTICATED", "UNAUTHORIZED", "SESSION_EXPIRED"].includes(e.code);
export type ConnectionLoadPhase = "authenticating" | "loading" | "restoring" | null;
export type BackgroundSaveState = {
  operationId: string; action: string; label: string; status: "saving" | "saved" | "failed";
  details: string[]; error: string; uncertain: boolean; changeId?: string;
};
type BackgroundJob = { state: BackgroundSaveState; payload: unknown; endpoint: string; token: string; generation: number };
const backgroundActions = new Set(["updateRecord", "createCandidate", "cancelAchievement", "restoreChange", "saveActivity", "updateProfile", "updateStatus", "saveManagementRow", "saveInterviewReview"]);
const readStorage = (storage: Storage, key: string) => { try { return storage.getItem(key); } catch { return null; } };
const writeStorage = (storage: Storage, key: string, value: string | null) => {
  try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* A memory-only session remains usable. */ }
};

export function useSheetsConnection() {
  const [ready, setReady] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [players, setPlayers] = useState<SheetPlayer[]>(initialPlayers);
  const [activities, setActivities] = useState<Activity[]>(makeDemoActivities);
  const [snapshot, setSnapshot] = useState<SheetSnapshot | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loadPhase, setLoadPhase] = useState<ConnectionLoadPhase>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [credentials, setCredentials] = useState<{id: string; password: string} | null>(null);
  const [backgroundSave, setBackgroundSave] = useState<BackgroundSaveState | null>(null);
  const backgroundJob = useRef<BackgroundJob | null>(null);
  const hasPendingBackground = () => !!backgroundJob.current && backgroundJob.current.state.status !== "saved";
  const token = useRef("");
  const pinnedEndpoint = useRef("");
  const generation = useRef(0);
  const requestVersion = useRef(0);
  const mutationRunning = useRef(false);
  const loginRunning = useRef(false);
  const refreshRunning = useRef(false);
  const refreshLatest = useRef<(background?: boolean) => Promise<boolean | undefined>>(async () => undefined);
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const beginLoad = useCallback((phase: ConnectionLoadPhase) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const g = ++generation.current;
    ++requestVersion.current;
    setBusy(true); setLoadPhase(phase); setError("");
    return { controller, g };
  }, []);

  const isCurrent = useCallback((g: number) => mounted.current && g === generation.current, []);

  const finishLoad = useCallback((g: number, controller: AbortController) => {
    if (!isCurrent(g)) return;
    if (activeRequest.current === controller) activeRequest.current = null;
    setBusy(false); setLoadPhase(null);
  }, [isCurrent]);

  const applySnapshot = useCallback((data: unknown) => {
    assertSnapshot(data);
    setSnapshot(data); setPlayers(data.players); setActivities(data.activities); setError(""); setSyncError("");
  }, []);

  const clearSession = useCallback(() => {
    activeRequest.current?.abort(); activeRequest.current = null; loginRunning.current = false;
    generation.current++; token.current = "";
    ++requestVersion.current;
    writeStorage(sessionStorage, SESSION_KEY, null);
    setAuthenticated(false); setLoadPhase(null); setSyncing(false); setSyncError("");
    setSnapshot(null); setPlayers([]); setActivities([]); setCredentials(null); setBusy(false);
    backgroundJob.current = null; setBackgroundSave(null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const {controller, g} = beginLoad(null);
    (async () => {
      let target = "";
      try {
        // The published manifest is authoritative. An obsolete or tampered
        // localStorage endpoint must never receive credentials or sessions.
        const response = await fetch(`${import.meta.env.BASE_URL}connection.json`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("接続設定を取得できませんでした。画面を再読み込みしてください。");
        const manifest = await response.json();
        if (manifest.endpoint) { target = validateEndpoint(manifest.endpoint); pinnedEndpoint.current = target; }
        else if (import.meta.env.PROD) throw new Error("公開アプリの接続設定が未設定です。管理者に確認してください。");
      } catch (e) {
        if (isCurrent(g)) {
          setMode("live"); setPlayers([]); setActivities([]);
          setError(e instanceof Error ? e.message : "接続設定を確認できませんでした。");
          setReady(true); finishLoad(g, controller);
        }
        return;
      }
      if (!isCurrent(g)) return;
      if (!target) { setReady(true); finishLoad(g, controller); return; }
      setMode("live"); setPlayers([]); setActivities([]);
      try {
        target = validateEndpoint(target);
        setEndpoint(target); setMode("live"); setPlayers([]); setActivities([]);
        // The login/recovery screen can explain progress while the Sheet loads.
        setReady(true);
        const stored = readStorage(sessionStorage, SESSION_KEY);
        if (stored) {
          let session: {endpoint?: string; token?: string} | null = null;
          try { session = JSON.parse(stored); } catch { writeStorage(sessionStorage, SESSION_KEY, null); }
          if (session?.endpoint === target && typeof session.token === "string" && session.token.length >= 32) {
            token.current = session.token;
            setAuthenticated(true); setLoadPhase("restoring");
            const data = await sheetRequest<SheetSnapshot>(target, "snapshot", {}, {token: session.token, signal: controller.signal});
            if (isCurrent(g)) applySnapshot(data);
          } else writeStorage(sessionStorage, SESSION_KEY, null);
        }
      } catch (e) {
        if (isCurrent(g)) {
          // A network failure does not invalidate a successfully issued session.
          if (isExpired(e)) clearSession();
          setError(e instanceof Error ? e.message : "接続を確認できませんでした。");
        }
      } finally { if (isCurrent(g)) { setReady(true); finishLoad(g, controller); } }
    })();
    return () => {
      mounted.current = false; ++generation.current; ++requestVersion.current;
      activeRequest.current?.abort(); activeRequest.current = null; loginRunning.current = false;
      backgroundJob.current = null;
    };
  }, [applySnapshot, beginLoad, clearSession, finishLoad, isCurrent]);

  const connect = async (value: string) => {
    if (mutationRunning.current || hasPendingBackground()) throw new Error("保存が完了してから接続先を変更してください。");
    let target: string;
    try { target = validateEndpoint(value); }
    catch (e) { setError(e instanceof Error ? e.message : "接続先を確認してください。"); throw e; }
    if (pinnedEndpoint.current && target !== pinnedEndpoint.current) throw new Error("公開アプリの接続先は固定されています。変更は管理者が公開設定から行ってください。");
    loginRunning.current = false;
    const {controller, g} = beginLoad(null);
    try {
      const health = await sheetRequest<{configured: boolean}>(target, "health", {}, {signal: controller.signal});
      if (!isCurrent(g)) return;
      if (!health.configured) throw new Error("Google側の初期設定が完了していません。");
      clearSession(); setEndpoint(target); setMode("live");
      writeStorage(localStorage, ENDPOINT_KEY, target);
    } catch (e) { if (isCurrent(g)) { setError(e instanceof Error ? e.message : "接続できませんでした。"); throw e; } }
    finally { finishLoad(g, controller); }
  };

  const login = async (id: string, password: string) => {
    if (loginRunning.current) return;
    if (mutationRunning.current || hasPendingBackground()) throw new Error("保存が完了してからログインしてください。");
    loginRunning.current = true;
    const {controller, g} = beginLoad("authenticating");
    // Authentication and its first read share one deadline, so splitting the
    // requests cannot double the total time before the recovery screen appears.
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]);
    let accepted = false;
    try {
      const data = await sheetRequest<{token: string; snapshot?: SheetSnapshot}>(endpoint, "login", {id, password, sessionOnly: true}, {signal});
      if (!isCurrent(g)) return;
      if (!data || typeof data.token !== "string" || data.token.length < 32) throw new Error("ログイン結果を確認できませんでした。");
      token.current = data.token;
      writeStorage(sessionStorage, SESSION_KEY, JSON.stringify({endpoint, token: data.token}));
      setAuthenticated(true); setLoadPhase("loading"); accepted = true;
      // Older deployments include a snapshot; updated ones authenticate first.
      const dataSnapshot = data.snapshot === undefined
        ? await sheetRequest<SheetSnapshot>(endpoint, "snapshot", {}, {token: data.token, signal})
        : data.snapshot;
      if (isCurrent(g)) applySnapshot(dataSnapshot);
    } catch (e) {
      if (!isCurrent(g)) return;
      if (accepted && isExpired(e)) clearSession();
      setError(e instanceof Error ? e.message : accepted ? "実績を取得できませんでした。再取得してください。" : "ログインできませんでした。");
      // Keep the token and clear the submitted password after successful auth.
      // The recovery screen retries data retrieval without sending credentials.
      if (!accepted || isExpired(e)) throw e;
    } finally {
      if (isCurrent(g)) { loginRunning.current = false; finishLoad(g, controller); }
    }
  };

  const refresh = async (background = false): Promise<boolean | undefined> => {
    if (!token.current || mutationRunning.current || hasPendingBackground() || loginRunning.current || refreshRunning.current || activeRequest.current) return;
    // Avoid changing an editor's baseline or row revision while someone types,
    // including an editor opened while this request was already in flight.
    const editing = () => typeof document !== "undefined" && !!(document.querySelector('[role="dialog"], [role="alertdialog"]') || document.activeElement?.matches('input, textarea, select, [contenteditable="true"]'));
    if (background && editing()) return;
    refreshRunning.current = true;
    const controller = new AbortController(), g = generation.current, version = ++requestVersion.current;
    activeRequest.current = controller;
    setSyncing(true);
    if (!background) { setBusy(true); setLoadPhase("loading"); setError(""); }
    try {
      const data = await sheetRequest<SheetSnapshot>(endpoint, "snapshot", {}, {token: token.current, signal: controller.signal});
      if (isCurrent(g) && version === requestVersion.current && (!background || !editing())) { applySnapshot(data); setSyncError(""); }
      return true;
    } catch (e) {
      if (isCurrent(g) && version === requestVersion.current) {
        if (isExpired(e)) clearSession();
        else if (background) setSyncError("自動同期を再試行しています。表示中のデータは前回取得した内容です。");
        else { setError(e instanceof Error ? e.message : "再取得できませんでした。"); throw e; }
      }
      return isCurrent(g) && version === requestVersion.current ? false : undefined;
    } finally {
      refreshRunning.current = false;
      if (activeRequest.current === controller) activeRequest.current = null;
      if (isCurrent(g)) { setSyncing(false); if (version === requestVersion.current && !background) { setBusy(false); setLoadPhase(null); } }
    }
  };
  refreshLatest.current = refresh;

  const hasSnapshot = !!snapshot;
  useEffect(() => {
    if (!authenticated || mode !== "live" || !hasSnapshot || typeof document === "undefined") return;
    let stopped = false, failures = 0, lastAttempt = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void tick(), Math.min(300_000, 30_000 * 2 ** failures)); };
    const tick = async () => {
      clearTimeout(timer);
      if (stopped) return;
      if (document.visibilityState === "visible" && navigator.onLine !== false) {
        lastAttempt = Date.now();
        const success = await refreshLatest.current(true);
        if (success === true) failures = 0;
        if (success === false) failures = Math.min(4, failures + 1);
      }
      if (!stopped) schedule();
    };
    const resume = () => {
      if (!refreshRunning.current && !mutationRunning.current && document.visibilityState === "visible" && navigator.onLine !== false && Date.now() - lastAttempt >= 10_000) void tick();
    };
    schedule();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); window.removeEventListener("online", resume); };
  }, [authenticated, mode, endpoint, hasSnapshot]);

  const mutate = async (action: string, payload: unknown, operationId: string) => {
    if (!snapshot || !token.current) throw new Error("ログインしてください。");
    if (!snapshot.writesEnabled) throw new Error("現在は読み取り接続です。管理者が書き込みを有効にしてから登録してください。");
    if (loginRunning.current) throw new Error("ログインの確認が完了するまでお待ちください。");
    if (mutationRunning.current || hasPendingBackground()) throw new SheetApiError("MUTATION_PENDING", "右上の保存結果を確認してから、次の変更を保存してください。");
    mutationRunning.current = true; const g = generation.current;
    ++requestVersion.current; activeRequest.current?.abort(); activeRequest.current = null;
    setLoadPhase(null); setBusy(true); setError("");
    try {
      const data = await sheetRequest<MutationResult>(endpoint, action, payload, {token:token.current, operationId});
      if (!isCurrent(g)) throw new SheetApiError("STALE_SESSION", "ログイン状態が変更されました。");
      applySnapshot(data.snapshot); if (data.credentials) setCredentials(data.credentials);
      return data;
    } catch (e) { if (isCurrent(g)) { if(isExpired(e)) clearSession(); setError(e instanceof Error ? e.message : "保存できませんでした。"); } throw e; }
    finally { mutationRunning.current = false; if (isCurrent(g)) setBusy(false); }
  };

  // The workspace owns accepted input. A page or editor can unmount immediately;
  // only a confirmed Google response changes the snapshot or reports success.
  const runBackground = async (job: BackgroundJob) => {
    mutationRunning.current = true;
    ++requestVersion.current; activeRequest.current?.abort(); activeRequest.current = null;
    setSyncing(false); setLoadPhase(null); setBusy(false);
    job.state = {...job.state, status:"saving", error:"", uncertain:false};
    setBackgroundSave(job.state);
    try {
      const data = await sheetRequest<MutationResult>(job.endpoint, job.state.action, job.payload, {token:job.token, operationId:job.state.operationId});
      if (!isCurrent(job.generation) || backgroundJob.current !== job) return;
      assertSnapshot(data.snapshot);
      applySnapshot(data.snapshot);
      job.state = {...job.state, status:"saved", changeId:data.changeId};
      // Successful jobs no longer need candidate memos in retained request data.
      job.payload = null;
      setBackgroundSave(job.state);
    } catch (e) {
      if (!isCurrent(job.generation) || backgroundJob.current !== job) return;
      if (isExpired(e)) { clearSession(); setError("ログインの有効期限が切れました。保存結果は再ログイン後に確認してください。"); return; }
      job.state = {...job.state, status:"failed", error:e instanceof Error?e.message:"保存結果を確認できませんでした。", uncertain:isUncertainWrite(e)};
      setBackgroundSave(job.state);
    } finally { mutationRunning.current = false; }
  };

  const submitMutation = (action: string, payload: unknown, operationId: string, label?: string) => {
    if (!snapshot || !token.current) throw new SheetApiError("UNAUTHENTICATED", "ログインしてください。");
    if (!snapshot.writesEnabled) throw new SheetApiError("READ_ONLY", "現在は読み取り接続です。");
    if (mutationRunning.current || hasPendingBackground() || loginRunning.current || busy) throw new SheetApiError("MUTATION_PENDING", "右上の保存結果を確認してから、次の変更を保存してください。");
    if (!backgroundActions.has(action)) throw new SheetApiError("INVALID_ACTION", "この操作は専用の設定画面から実行してください。");
    let owned: unknown;
    try { owned = JSON.parse(JSON.stringify(payload)); } catch { throw new SheetApiError("INVALID_PAYLOAD", "入力内容を確認してください。"); }
    if (!operationId || !owned || typeof owned !== "object") throw new SheetApiError("INVALID_PAYLOAD", "入力内容を確認してください。");
    const job: BackgroundJob = {state:{operationId,action,label:label||saveLabel(action),status:"saving",details:saveDetails(action,owned,snapshot),error:"",uncertain:false},payload:owned,endpoint,token:token.current,generation:generation.current};
    backgroundJob.current = job;
    void runBackground(job);
  };

  const retryBackgroundSave = () => {
    const job = backgroundJob.current;
    if (!job || job.state.status !== "failed" || mutationRunning.current) return;
    if (!isCurrent(job.generation) || job.token !== token.current || job.endpoint !== endpoint) throw new SheetApiError("STALE_SESSION", "再ログインして保存結果を確認してください。");
    // Both definite and ambiguous retries keep the original ID and input. No
    // automatic replay occurs after a timeout that might have committed a write.
    void runBackground(job);
  };
  const dismissBackgroundSave = () => {
    const job = backgroundJob.current;
    if (job?.state.status === "saving" || job?.state.uncertain) throw new SheetApiError("MUTATION_PENDING", "保存結果が未確認です。同じ内容で再試行してください。");
    backgroundJob.current = null; setBackgroundSave(null);
  };
  const hasPendingSave = !!backgroundSave && backgroundSave.status !== "saved";
  useEffect(() => {
    if (!hasPendingSave || typeof window === "undefined") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasPendingSave]);

  const requestAdvice = async <T,>(action:string,period:string):Promise<T> => {
    if (!token.current) throw new Error("ログインしてください。");
    const g=generation.current;
    try {
      const data=await sheetRequest<T>(endpoint,action,{period},{token:token.current});
      if(!isCurrent(g))throw new Error("ログイン状態が変更されました。");
      return data;
    }catch(e){if(isCurrent(g)&&isExpired(e))clearSession();throw e;}
  };
  const analyzeReviews = (period:string) => requestAdvice<InterviewAdvice>("analyzeInterviewReviews",period);
  const readAdvice = (period:string) => requestAdvice<InterviewAdviceState>("readInterviewAdvice",period);
  const analyzeInsights = (period:string) => requestAdvice<import("../lib/workspace-insights").WorkspaceInsightAdvice>("analyzeWorkspaceInsights",period);
  const readInsights = (period:string) => requestAdvice<import("../lib/workspace-insights").WorkspaceInsightState>("readWorkspaceInsights",period);

  const readSecurity = async <T,>(): Promise<T> => {
    if (!token.current || snapshot?.self.role !== "admin") throw new Error("管理者でログインしてください。");
    const g = generation.current;
    try {
      const data = await sheetRequest<T>(endpoint, "auditSecurity", {}, {token:token.current});
      if (!isCurrent(g)) throw new Error("ログイン状態が変更されました。");
      return data;
    } catch (e) { if (isCurrent(g) && isExpired(e)) clearSession(); throw e; }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!token.current || !snapshot) throw new Error("ログインしてください。");
    if (mutationRunning.current || hasPendingBackground() || loginRunning.current) throw new Error("保存が完了してから変更してください。");
    const g = generation.current;
    mutationRunning.current = true; ++requestVersion.current;
    activeRequest.current?.abort(); activeRequest.current = null;
    setBusy(true); setError("");
    try {
      const data = await sheetRequest<{changed:boolean}>(endpoint, "changePassword", {currentPassword,newPassword}, {token:token.current});
      if (!data || data.changed !== true) throw new Error("変更結果を確認できませんでした。");
      if (isCurrent(g)) clearSession();
    } catch (e) {
      if (isCurrent(g) && (isExpired(e) || isUncertainPasswordChange(e))) clearSession();
      if (isUncertainPasswordChange(e)) throw new Error("変更結果を確認できませんでした。新しいパスワードでログインし、入れなければ元のパスワードで確認してください。");
      throw e;
    } finally { mutationRunning.current = false; if (isCurrent(g)) setBusy(false); }
  };

  const readManagement = async <T,>(action: "managementTables" | "managementTable", payload: unknown = {}): Promise<T> => {
    if (!token.current || snapshot?.self.role!=="admin") throw new Error("管理者でログインしてください。");
    const g=generation.current;
    const data=await sheetRequest<T>(endpoint,action,payload,{token:token.current});
    if (!isCurrent(g)) throw new Error("ログイン状態が変更されました。");
    return data;
  };

  const logout = async () => {
    if (hasPendingBackground()) throw new SheetApiError("MUTATION_PENDING", "右上の保存結果を確認してからログアウトしてください。");
    const oldToken = token.current; clearSession(); setBusy(false); setCredentials(null);
    if (oldToken) { try { await sheetRequest(endpoint, "logout", {}, {token:oldToken}); } catch { /* Local session already removed; server session has an expiry. */ } }
  };

  const showDemo = () => {
    if (mutationRunning.current || hasPendingBackground()) return;
    clearSession(); setMode("demo"); setPlayers(initialPlayers); setActivities(makeDemoActivities()); setError("");
  };

  return { ready, endpoint, mode, players, setPlayers, activities, setActivities, snapshot, authenticated, loadPhase, busy, error,
    syncing, syncError, backgroundSave, hasPendingSave, submitMutation, retryBackgroundSave, dismissBackgroundSave, credentials, dismissCredentials:() => setCredentials(null), connect, login, logout, refresh, mutate, readManagement, analyzeReviews, readAdvice, analyzeInsights, readInsights, readSecurity, changePassword, showDemo };
}

function saveLabel(action: string) {
  return ({updateRecord:"候補者の変更",createCandidate:"候補者の登録",cancelAchievement:"成果の取り消し",restoreChange:"変更の復元",saveActivity:"成果の登録",updateProfile:"プロフィール",updateStatus:"進捗の変更",saveManagementRow:"業務管理表",saveInterviewReview:"面談の振り返り"} as Record<string,string>)[action] || "変更";
}
function saveDetails(action: string, owned: unknown, snapshot: SheetSnapshot): string[] {
  const data = owned as Record<string, unknown>, detail: string[] = [];
  const record = snapshot.records?.find(r => r.recordId === data.recordId);
  if (record) detail.push(`候補者：${record.candidateName}`);
  const names: Record<string,string> = {candidateName:"候補者",company:"会社名",position:"ポジション",playerId:"担当ID",stage:"成果の工程",date:"実績日",source:"紹介元",status:"ステータス",probability:"ヨミ確度",interviewScheduledDate:"C面談予定日",clientInterviewScheduledTime:"C面談予定開始時刻",offerScheduledDate:"オファー予定日",memo:"メモ",category:"理由の分類",nextAction:"次回の対応",name:"氏名",team:"チーム",target:"目標",bio:"プロフィール",sheetNames:"担当者の別名",sheetId:"管理表ID",row:"行"};
  const source = (action === "saveActivity" ? data.activity : action === "updateProfile" ? data.player : data) as Record<string, unknown>;
  for (const [key,value] of Object.entries(source || {})) {
    if (names[key]) detail.push(`${names[key]}：${Array.isArray(value)?value.join("、"):String(value ?? "") || "（空欄）"}`);
  }
  if (data.changes && typeof data.changes === "object") for (const [column,value] of Object.entries(data.changes)) {
    detail.push(`${action === "updateRecord" ? matchingFields[Number(column)-1] || `${column}列` : `${column}列`}：${String(value ?? "") || "（空欄に変更）"}`);
  }
  return detail.length ? detail : [action === "restoreChange" ? "直前の変更を元に戻します。" : "入力した内容を保持しています。"];
}

function isUncertainPasswordChange(e: unknown) {
  return !(e instanceof SheetApiError) || ["NETWORK", "TIMEOUT", "HTTP", "NOT_JSON", "INTERNAL", "API", "SHEET_READ_FAILED", "SHEET_WRITE_FAILED", "INVALID_RESPONSE"].includes(e.code);
}
