import { persistPendingSave, readPendingSaves, removePendingSave, pendingSaveResources, type PendingSave } from "../lib/pending-saves";
import { useCallback, useEffect, useRef, useState } from "react";
import { initialPlayers, makeDemoActivities, type Activity } from "../lib/node-data";
import { assertSnapshot, assertMutationReceipt, isUncertainWrite, sheetRequest, validateEndpoint, SheetApiError, type MutationResult, type MutationReceipt, type SheetSnapshot, type SheetPlayer, type InterviewAdvice, type InterviewAdviceState } from "../lib/sheets-client";
import { matchingFields } from "../lib/management-data";
import { interviewFieldLabels, interviewStringFields } from "../lib/candidate-intake";
import { assertWritingKitState, validateWritingPreferences, type WritingKitState, type WritingPreferences, type WritingStyle } from "../lib/writing-ai";

const ENDPOINT_KEY = "insup.node.endpoint.v1";
const SESSION_KEY = "insup.node.session.v1";
const isExpired = (e: unknown) => e instanceof SheetApiError && ["AUTH_REQUIRED", "UNAUTHENTICATED", "UNAUTHORIZED", "SESSION_EXPIRED"].includes(e.code);
export type ConnectionLoadPhase = "authenticating" | "loading" | "restoring" | null;
export type BackgroundSaveState = {
  operationId: string; action: string; label: string; status: "saving" | "saved" | "failed";
  details: string[]; error: string; uncertain: boolean; changeId?: string; intakeInput?: boolean; refreshing?: boolean; localSaved?: boolean; pendingCount?: number;
};
type BackgroundJob = { state: BackgroundSaveState; payload: unknown; endpoint: string; token: string; generation: number; account: string; savedInput: PendingSave; resources: string[] };
const backgroundActions = new Set(["saveCandidateProfile", "saveClient", "deleteCandidate", "updateRecord", "createCandidate", "cancelAchievement", "restoreChange", "saveActivity", "updateProfile", "updateStatus", "saveManagementRow", "saveInterviewReview"]);
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
  const [localSaving, setLocalSaving] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [credentials, setCredentials] = useState<{id: string; password: string} | null>(null);
  const [backgroundSave, setBackgroundSave] = useState<BackgroundSaveState | null>(null);
  const backgroundJob = useRef<BackgroundJob | null>(null);
  const backgroundQueue = useRef<BackgroundJob[]>([]);
  const admissions = useRef(0);
  const outboxLoad = useRef<{generation:number;promise:Promise<void>} | null>(null);
  const latestSnapshot = useRef(snapshot); latestSnapshot.current = snapshot;
  const hasPendingBackground = () => backgroundQueue.current.length > 0 || admissions.current > 0;
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
    latestSnapshot.current = data; setSnapshot(data); setPlayers(data.players); setActivities(data.activities); setError(""); setSyncError("");
    const job = backgroundJob.current;
    if (job?.state.status === "saved" && job.state.refreshing) {
      job.state = {...job.state, refreshing:false}; setBackgroundSave(job.state);
    }
  }, []);

  const clearSession = useCallback(() => {
    activeRequest.current?.abort(); activeRequest.current = null; loginRunning.current = false;
    generation.current++; token.current = "";
    ++requestVersion.current;
    writeStorage(sessionStorage, SESSION_KEY, null);
    setAuthenticated(false); setLoadPhase(null); setSyncing(false); setSyncError("");
    setSnapshot(null); latestSnapshot.current=null; setPlayers([]); setActivities([]); setCredentials(null); setBusy(false); setLocalSaving(false);
    backgroundJob.current = null; backgroundQueue.current = []; outboxLoad.current = null; mutationRunning.current = false; setBackgroundSave(null);
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
      backgroundJob.current = null; backgroundQueue.current = []; outboxLoad.current = null;
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

  const publishQueue = () => {
    const head = backgroundQueue.current[0] || backgroundJob.current;
    backgroundJob.current = head || null;
    setBackgroundSave(head ? {...head.state, pendingCount:backgroundQueue.current.length} : null);
  };
  // Google writes are serialized; accepting another independent input waits only
  // for its encrypted local transaction, never for this network worker.
  const runBackground = async (job: BackgroundJob) => {
    if (mutationRunning.current || backgroundQueue.current[0] !== job || !isCurrent(job.generation)) return;
    let updateAfterCommit = false, posted = false;
    mutationRunning.current = true;
    ++requestVersion.current; activeRequest.current?.abort(); activeRequest.current = null;
    setSyncing(false); setLoadPhase(null); setBusy(false);
    job.state = {...job.state, status:"saving", error:"", uncertain:false}; publishQueue();
    try {
      job.savedInput.attempted = true;
      await persistPendingSave(job.endpoint, job.account, job.savedInput);
      if (!isCurrent(job.generation)) return;
      posted = true;
      const data = await sheetRequest<MutationResult | MutationReceipt>(job.endpoint, job.state.action, job.payload, {token:job.token, operationId:job.state.operationId, responseMode:"receipt"});
      if (!isCurrent(job.generation) || backgroundQueue.current[0] !== job) return;
      if (data && "snapshot" in data) { assertSnapshot(data.snapshot); applySnapshot(data.snapshot); }
      else { assertMutationReceipt(data, job.state.operationId); updateAfterCommit = true; }
      await removePendingSave(job.endpoint, job.account, job.state.operationId).catch(() => {
        if (isCurrent(job.generation)) setSyncError("シートへの保存は完了しました。端末に残る同期履歴は次回の接続時に再確認します。");
      });
      if (!isCurrent(job.generation) || backgroundQueue.current[0] !== job) return;
      job.state = {...job.state, status:"saved", changeId:data.changeId, intakeInput:false, refreshing:updateAfterCommit};
      job.payload = null; job.savedInput.payload = null;
      backgroundQueue.current.shift(); backgroundJob.current = job; publishQueue();
    } catch (e) {
      if (!isCurrent(job.generation) || backgroundQueue.current[0] !== job) return;
      if (isExpired(e)) { clearSession(); setError("ログインの有効期限が切れました。入力はこの端末に残っています。再ログインすると未同期の入力を確認できます。"); return; }
      job.state = {...job.state, status:"failed", error:e instanceof Error?e.message:"保存結果を確認できませんでした。", uncertain:posted&&isUncertainWrite(e)};
      publishQueue();
    } finally {
      if (isCurrent(job.generation)) {
        mutationRunning.current = false;
        const next = backgroundQueue.current[0];
        if (next && next !== job && next.state.localSaved && next.state.status !== "failed") void runBackground(next);
        else if (!next && updateAfterCommit) void refreshLatest.current(true);
      }
    }
  };
  const ensureOutbox = (): Promise<void> => {
    const g = generation.current;
    if (outboxLoad.current?.generation === g) return outboxLoad.current.promise;
    const current = latestSnapshot.current, savedToken = token.current;
    if (!current || !savedToken) return Promise.resolve();
    const account = `${current.self.role}:${current.self.playerId}`;
    const promise = (async () => {
      const saved = await readPendingSaves(endpoint, account);
      if (!isCurrent(g) || savedToken !== token.current) return;
      backgroundQueue.current = saved.map(input => ({state:{operationId:input.operationId,action:input.action,label:input.label,
        status:input.attempted?"failed":"saving",details:input.details,error:input.attempted?"前回の通信結果が未確認です。同じ内容で同期を確認してください。":"",uncertain:input.attempted,
        localSaved:true,intakeInput:!!backgroundIntakeBody(input.action,input.payload)},payload:input.payload,savedInput:input,endpoint,token:savedToken,generation:g,account,
        resources:pendingSaveResources(input.action,input.payload,current)}));
      if (backgroundQueue.current.some(job => !backgroundActions.has(job.state.action))) throw new Error("未同期の入力に対応していない操作があります。管理者へ確認してください。");
      if (saved.length) {
        publishQueue(); const first=backgroundQueue.current[0];
        if (current.writesEnabled && !first.savedInput.attempted) void runBackground(first);
      }
    })();
    outboxLoad.current = {generation:g,promise};
    void promise.catch(() => { if (isCurrent(g)) outboxLoad.current = null; });
    return promise;
  };
  const mutationGeneration = generation.current;
  const submitMutation = async (action: string, payload: unknown, operationId: string, label?: string): Promise<void> => {
    const current = latestSnapshot.current;
    if (!current || !token.current || mutationGeneration !== generation.current) throw new SheetApiError("UNAUTHENTICATED", "ログインしてください。");
    if (!current.writesEnabled) throw new SheetApiError("READ_ONLY", "現在は読み取り接続です。");
    if (loginRunning.current || busy) throw new SheetApiError("MUTATION_PENDING", "ログインと画面の取得が完了してから保存してください。");
    if (!backgroundActions.has(action)) throw new SheetApiError("INVALID_ACTION", "この操作は専用の設定画面から実行してください。");
    let owned: unknown;
    try { owned = JSON.parse(JSON.stringify(payload)); } catch { throw new SheetApiError("INVALID_PAYLOAD", "入力内容を確認してください。"); }
    if (!operationId || !owned || typeof owned !== "object") throw new SheetApiError("INVALID_PAYLOAD", "入力内容を確認してください。");
    const g=generation.current, savedToken=token.current, account=`${current.self.role}:${current.self.playerId}`;
    const resources=pendingSaveResources(action,owned,current);
    admissions.current++; setLocalSaving(true);
    try {
      await ensureOutbox();
      if (!isCurrent(g) || token.current !== savedToken) throw new SheetApiError("STALE_SESSION", "ログイン状態が変更されました。");
      if (backgroundQueue.current.length >= 20) throw new SheetApiError("MUTATION_PENDING", "未同期の入力が20件あります。右上から同期状況を確認してください。");
      // Reserve the target during local persistence as well as network syncing.
      if (backgroundQueue.current.some(job => job.state.operationId === operationId || resources.includes("*") || job.resources.includes("*") || job.resources.some(resource => resources.includes(resource)))) throw new SheetApiError("MUTATION_PENDING", "この候補者・項目の前の変更を同期中です。右上の同期結果を確認してから保存してください。入力は残っています。");
      const input:PendingSave={operationId,action,payload:owned,label:label||saveLabel(action),details:saveDetails(action,owned,current),createdAt:Date.now(),attempted:false};
      const job:BackgroundJob={state:{operationId,action,label:input.label,status:"saving",details:input.details,error:"",uncertain:false,intakeInput:!!backgroundIntakeBody(action,owned),localSaved:false},payload:owned,savedInput:input,endpoint,token:savedToken,generation:g,account,resources};
      backgroundQueue.current.push(job);
      try { await persistPendingSave(endpoint,account,input); }
      catch (error) { backgroundQueue.current=backgroundQueue.current.filter(item=>item!==job); publishQueue(); throw error; }
      if (!isCurrent(g) || token.current !== savedToken) throw new SheetApiError("STALE_SESSION", "ログイン状態が変更されました。未同期の入力はこの端末に残っています。");
      job.state.localSaved=true; publishQueue();
      if (backgroundQueue.current[0]===job) void runBackground(job);
    } finally { admissions.current--; if (isCurrent(g) && admissions.current === 0) setLocalSaving(false); }
  };
  useEffect(() => {
    if (!authenticated || !snapshot) return;
    void ensureOutbox().catch(error => { if (mounted.current) setSyncError(error instanceof Error?error.message:"端末の保存状況を確認できませんでした。"); });
  }, [authenticated, snapshot?.self.role, snapshot?.self.playerId, endpoint]);

  const retryBackgroundSave = () => {
    const job = backgroundQueue.current[0];
    if (!job || job.state.status !== "failed" || mutationRunning.current) return;
    if (!isCurrent(job.generation) || job.token !== token.current || job.endpoint !== endpoint) throw new SheetApiError("STALE_SESSION", "再ログインして保存結果を確認してください。");
    void runBackground(job);
  };
  // The original private input is materialized only by an explicit user action.
  // A callback retained by an older login or view must not expose a newer job.
  const copyGeneration = generation.current, copyOperation = backgroundSave?.operationId;
  const copyBackgroundIntakeInput = (): string => {
    const job = backgroundJob.current;
    if (!job || job.state.status !== "failed" || !job.state.intakeInput) throw new SheetApiError("INTAKE_INPUT_UNAVAILABLE", "保存できなかった面談情報がありません。");
    if (!authenticated || !snapshot || !isCurrent(job.generation) || job.generation !== copyGeneration || job.token !== token.current || job.endpoint !== endpoint || job.account !== `${snapshot.self.role}:${snapshot.self.playerId}`) throw new SheetApiError("STALE_SESSION", "ログイン状態が変わったため、面談情報をコピーできません。");
    if (job.state.operationId !== copyOperation) throw new SheetApiError("INTAKE_INPUT_UNAVAILABLE", "この保存の入力原文は表示できません。");
    const body = backgroundIntakeBody(job.state.action, job.payload);
    if (!body) throw new SheetApiError("INTAKE_INPUT_UNAVAILABLE", "保存できなかった面談情報がありません。");
    const fields = body.fields as Record<string, unknown>;
    const lines = ["INSUP NODE 面談情報（保存前の入力原文）"];
    for (const key of interviewStringFields) lines.push(`${interviewFieldLabels[key]}：${typeof fields[key] === "string" ? fields[key] : ""}`);
    for (const key of ["crmTools", "chatTools"] as const) lines.push(`${interviewFieldLabels[key]}：${Array.isArray(fields[key]) ? fields[key].filter((value): value is string => typeof value === "string").join("、") : ""}`);
    lines.push("", "クライアント共有用の紹介文", typeof body.introduction === "string" ? body.introduction : "");
    return lines.join("\n");
  };
  const dismissBackgroundSave = async () => {
    const job = backgroundQueue.current[0] || backgroundJob.current;
    if (job?.state.status === "saving" || job?.state.uncertain) throw new SheetApiError("MUTATION_PENDING", "同期結果が未確認です。同じ内容で再試行してください。");
    if (job && job.state.status === "failed") {
      await removePendingSave(job.endpoint,job.account,job.state.operationId);
      if (!isCurrent(job.generation) || backgroundQueue.current[0] !== job) return;
      backgroundQueue.current.shift();
    }
    backgroundJob.current = null; publishQueue();
    const next=backgroundQueue.current[0]; if(next&&!next.savedInput.attempted) void runBackground(next);
  };
  const hasPendingSave = localSaving || !!backgroundSave && backgroundSave.status !== "saved";
  useEffect(() => {
    if (!localSaving || typeof window === "undefined") return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  }, [localSaving]);

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

  const writingGeneration=generation.current, writingToken=token.current;
  const requestWriting = async <T,>(action:string,payload:unknown):Promise<T> => {
    if(!isCurrent(writingGeneration)||token.current!==writingToken)throw new Error("ログイン状態が変更されました。");
    if(!writingToken||!snapshot)throw new Error("ログインしてください。");
    const g=writingGeneration;
    try{
      const data=await sheetRequest<T>(endpoint,action,payload,{token:token.current});
      if(!isCurrent(g))throw new Error("ログイン状態が変更されました。");
      return data;
    }catch(e){if(isCurrent(g)&&isExpired(e))clearSession();throw e;}
  };
  // This request deliberately has no parameter for a candidate or private text.
  const writingKit = async(action:'readWritingKit'|'generateWritingKit',style:WritingStyle):Promise<WritingKitState>=>{
    const data=await requestWriting<WritingKitState>(action,{style:style==='concise'?'concise':'standard'});
    assertWritingKitState(data);return data;
  };
  const readWritingKit=(style:WritingStyle)=>writingKit('readWritingKit',style);
  const generateWritingKit=(style:WritingStyle)=>writingKit('generateWritingKit',style);
  const readWritingPreferences=async()=>{
    const data=await requestWriting<{preferences:WritingPreferences}>('readWritingPreferences',{});
    return validateWritingPreferences(data.preferences);
  };
  const saveWritingPreferences=async(value:WritingPreferences)=>{
    if(snapshot?.self.role!=='admin')throw new Error('管理者でログインしてください。');
    const preferences=validateWritingPreferences(value);
    const data=await requestWriting<{preferences:WritingPreferences}>('saveWritingPreferences',{preferences});
    const saved=validateWritingPreferences(data.preferences);
    setSnapshot(previous=>previous?{...previous,writingPreferences:saved}:previous);
    return saved;
  };

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
    await ensureOutbox();
    if (hasPendingBackground()) throw new SheetApiError("MUTATION_PENDING", "右上の保存結果を確認してからログアウトしてください。");
    const oldToken = token.current; clearSession(); setBusy(false); setCredentials(null);
    if (oldToken) { try { await sheetRequest(endpoint, "logout", {}, {token:oldToken}); } catch { /* Local session already removed; server session has an expiry. */ } }
  };

  const showDemo = () => {
    if (mutationRunning.current || hasPendingBackground()) return;
    clearSession(); setMode("demo"); setPlayers(initialPlayers); setActivities(makeDemoActivities()); setError("");
  };

  return { ready, endpoint, mode, players, setPlayers, activities, setActivities, snapshot, authenticated, loadPhase, busy, error,
    syncing, syncError, backgroundSave, hasPendingSave, submitMutation, retryBackgroundSave, dismissBackgroundSave, copyBackgroundIntakeInput, credentials, dismissCredentials:() => setCredentials(null), connect, login, logout, refresh, mutate, readManagement, analyzeReviews, readAdvice, analyzeInsights, readInsights, readWritingKit, generateWritingKit, readWritingPreferences, saveWritingPreferences, readSecurity, changePassword, showDemo };
}

function saveLabel(action: string) {
  return ({saveCandidateProfile:"候補者の基本情報",saveClient:"取引先の登録・編集",deleteCandidate:"候補者・提案の削除",updateRecord:"候補者の変更",createCandidate:"候補者の登録",cancelAchievement:"成果の取り消し",restoreChange:"変更の復元",saveActivity:"成果の登録",updateProfile:"プロフィール",updateStatus:"進捗の変更",saveManagementRow:"業務管理表",saveInterviewReview:"面談の振り返り"} as Record<string,string>)[action] || "変更";
}
function saveDetails(action: string, owned: unknown, snapshot: SheetSnapshot): string[] {
  const data = owned as Record<string, unknown>, detail: string[] = [];
  const record = snapshot.records?.find(r => r.recordId === data.recordId);
  if (record) detail.push(`候補者：${record.candidateName}`);
  if(action==="saveCandidateProfile")return [...detail,"面談の基本情報・紹介文を保存します。"];
  if(action==="saveClient")return ["取引先マスターを保存します。登録済みの提案は変更しません。"];
  const names: Record<string,string> = {candidateName:"候補者",company:"会社名",position:"ポジション",playerId:"担当ID",stage:"成果の工程",date:"実績日",source:"紹介元",status:"ステータス",probability:"ヨミ確度",interviewScheduledDate:"C面談予定日",clientInterviewScheduledTime:"C面談予定開始時刻",offerScheduledDate:"オファー予定日",memo:"メモ",category:"理由の分類",nextAction:"次回の対応",name:"氏名",team:"チーム",target:"目標",bio:"プロフィール",sheetNames:"担当者の別名",sheetId:"管理表ID",row:"行",scope:"削除範囲"};
  const source = (action === "saveActivity" ? data.activity : action === "updateProfile" ? data.player : data) as Record<string, unknown>;
  for (const [key,value] of Object.entries(source || {})) {
    if (names[key]) detail.push(`${names[key]}：${Array.isArray(value)?value.join("、"):String(value ?? "") || "（空欄）"}`);
  }
  if (action==="deleteCandidate" && Array.isArray(data.targets)) detail.push(`削除対象：${data.targets.length}件 · 削除済み一覧から復元できます。`);
  if (data.changes && typeof data.changes === "object") for (const [column,value] of Object.entries(data.changes)) {
    detail.push(`${action === "updateRecord" ? matchingFields[Number(column)-1] || `${column}列` : `${column}列`}：${String(value ?? "") || "（空欄に変更）"}`);
  }
  return detail.length ? detail : [action === "restoreChange" ? "直前の変更を元に戻します。" : "入力した内容を保持しています。"];
}

function isUncertainPasswordChange(e: unknown) {
  return !(e instanceof SheetApiError) || ["NETWORK", "TIMEOUT", "HTTP", "NOT_JSON", "INTERNAL", "API", "SHEET_READ_FAILED", "SHEET_WRITE_FAILED", "INVALID_RESPONSE"].includes(e.code);
}


/** Shape check only: no private values are copied into public save state. */
function backgroundIntakeBody(action:string,payload:unknown):Record<string,unknown>|null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const data=payload as Record<string,unknown>;
  const activity=data.activity && typeof data.activity === "object" && !Array.isArray(data.activity) ? data.activity as Record<string,unknown> : null;
  const raw=action === "saveCandidateProfile" ? data : action === "saveActivity" ? activity?.interviewProfile : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body=raw as Record<string,unknown>;
  return body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? body : null;
}
