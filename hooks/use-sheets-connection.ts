import type {StartupTiming} from "../lib/startup-diagnostics";
import {persistSnapshotCache,readSnapshotCache,purgeSnapshotCache,validSnapshotCacheAccess,type SnapshotCacheAccess} from "../lib/snapshot-cache";
import {createDeadlineSignal, type RequestDeadline} from "../lib/abort-signal";
import { persistPendingSave, readPendingSaves, removePendingSave, replacePendingSave, pendingSaveResources, unlockPendingSaves, lockPendingSaves, purgeExpiredPendingSaves, type PendingSave } from "../lib/pending-saves";
import { correctionFields, correctedPayload, mutationDateErrors, type SaveCorrectionDraft } from "../lib/save-correction";
import { useCallback, useEffect, useRef, useState } from "react";
import { initialPlayers, makeDemoActivities, type Activity } from "../lib/node-data";
import {storageBackendOf} from "../lib/storage-backend";
import { assertSnapshot, validSnapshotVersion, mergeSnapshotUnchanged, assertMutationReceipt, isUncertainWrite, sheetRequest, validateEndpoint, SheetApiError, sheetExtensionMutationActions, isSheetExtensionReadAction, sheetExtensionMutationEnabled, type SheetExtensionReadAction, type SheetExtensionMutationAction, type MutationResult, type MutationReceipt, type SheetSnapshot, type SnapshotUnchanged, type SheetPlayer, type InterviewAdvice, type InterviewAdviceState } from "../lib/sheets-client";
import { matchingFields } from "../lib/management-data";
import { interviewFieldLabels, interviewStringFields } from "../lib/candidate-intake";
import { assertWritingKitState, validateWritingPreferences, type WritingKitState, type WritingPreferences, type WritingStyle } from "../lib/writing-ai";

const timingNow=()=>typeof performance==="undefined"?Date.now():performance.now();
const ENDPOINT_KEY = "insup.node.endpoint.v1";
const SESSION_KEY = "insup.node.session.v1";
// Signed by the server after a successful login. It only exempts this device from
// lockouts caused by other people's failed guesses; it is not a credential.
const DEVICE_KEY = "insup.node.devices.v1";
const DEVICE_TOKEN = /^d1\.\d{13}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/;
const isExpired = (e: unknown) => e instanceof SheetApiError && ["AUTH_REQUIRED", "UNAUTHENTICATED", "UNAUTHORIZED", "SESSION_EXPIRED"].includes(e.code);
// An issued password is valid, but the server opens only password change and logout until it is replaced.
const isPasswordChangeRequired = (e: unknown) => e instanceof SheetApiError && e.code === "PASSWORD_CHANGE_REQUIRED";
export type ConnectionLoadPhase = "authenticating" | "loading" | "restoring" | null;
export type BackgroundSaveState = {
  operationId: string; action: string; label: string; status: "saving" | "saved" | "failed";
  details: string[]; error: string; uncertain: boolean; changeId?: string; intakeInput?: boolean; refreshing?: boolean; localSaved?: boolean; pendingCount?: number; editable?: boolean; waitingForConnection?: boolean;
};
type BackgroundJob = { state: BackgroundSaveState; payload: unknown; endpoint: string; token: string; generation: number; account: string; savedInput: PendingSave; resources: string[] };
const extensionActions=new Set<string>(sheetExtensionMutationActions);
const backgroundActions = new Set([...sheetExtensionMutationActions,"saveCandidateProfile", "saveClient", "deleteCandidate", "updateRecord", "createCandidate", "cancelAchievement", "restoreChange", "saveActivity", "updateProfile", "updateStatus", "saveManagementRow", "saveInterviewReview"]);
// An open dialog or a focused field: background work must not change what someone is editing.
const editing = () => typeof document !== "undefined" && !!(document.querySelector('[role="dialog"], [role="alertdialog"]') || document.activeElement?.matches('input, textarea, select, [contenteditable="true"]'));
const readStorage = (storage: Storage, key: string) => { try { return storage.getItem(key); } catch { return null; } };
const writeStorage = (storage: Storage, key: string, value: string | null) => {
  try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* A memory-only session remains usable. */ }
};
const deviceSlot = (endpoint: string, id: string) => `${endpoint}|${id.trim().toUpperCase()}`;
function deviceTokens(): Record<string, string> {
  try { const map = JSON.parse(readStorage(localStorage, DEVICE_KEY) || "{}"); return map && typeof map === "object" && !Array.isArray(map) ? map : {}; } catch { return {}; }
}
function readDeviceToken(endpoint: string, id: string): string | undefined {
  const token = deviceTokens()[deviceSlot(endpoint, id)];
  return typeof token === "string" && DEVICE_TOKEN.test(token) ? token : undefined;
}
function writeDeviceToken(endpoint: string, id: string, token: unknown): void {
  if (typeof token !== "string" || !DEVICE_TOKEN.test(token)) return;
  const map = deviceTokens(), slot = deviceSlot(endpoint, id);
  delete map[slot]; map[slot] = token;
  const kept = Object.entries(map).filter(([, value]) => typeof value === "string" && DEVICE_TOKEN.test(value)).slice(-20);
  try { writeStorage(localStorage, DEVICE_KEY, JSON.stringify(Object.fromEntries(kept))); } catch { /* Login works without device trust. */ }
}

export function useSheetsConnection() {
  const [ready, setReady] = useState(false);
  const [startupTiming,setStartupTiming]=useState<StartupTiming|null>(null);
  const [endpoint, setEndpoint] = useState("");
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [players, setPlayers] = useState<SheetPlayer[]>(initialPlayers);
  const [activities, setActivities] = useState<Activity[]>(makeDemoActivities);
  const [snapshot, setSnapshot] = useState<SheetSnapshot | null>(null);
  const [snapshotSource,setSnapshotSource]=useState<"cache"|"live"|null>(null),[cachedAt,setCachedAt]=useState<number|null>(null);
  const sourceRef=useRef<"cache"|"live"|null>(null),cacheAccessRef=useRef<SnapshotCacheAccess|null>(null),cacheEndpoint=useRef("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loadPhase, setLoadPhase] = useState<ConnectionLoadPhase>(null);
  const [busy, setBusy] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [credentials, setCredentials] = useState<{id: string; password: string} | null>(null);
  // Never persisted: the server re-derives it from the account on every request.
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [backgroundSave, setBackgroundSave] = useState<BackgroundSaveState | null>(null);
  const backgroundJob = useRef<BackgroundJob | null>(null);
  const extensionWaiters=useRef(new Map<string,{resolve:()=>void;reject:(error:unknown)=>void}>());
  const backgroundQueue = useRef<BackgroundJob[]>([]);
  const admissions = useRef(0);
  const correctionRunning = useRef<string|null>(null);
  const outboxLoad = useRef<{generation:number;promise:Promise<void>} | null>(null);
  const latestSnapshot = useRef(snapshot); latestSnapshot.current = snapshot;
  const liveSnapshotBinding=useRef<{snapshot:SheetSnapshot;endpoint:string;token:string;generation:number}|null>(null);
  const hasPendingBackground = () => backgroundQueue.current.length > 0 || admissions.current > 0;
  const token = useRef("");
  const pinnedEndpoint = useRef("");
  const generation = useRef(0);
  const requestVersion = useRef(0);
  const mutationRunning = useRef(false);
  const loginRunning = useRef(false);
  const refreshRunning = useRef(false);
  const refreshLatest = useRef<(background?: boolean) => Promise<boolean | undefined>>(async () => undefined);
  const resumeBackgroundLatest = useRef<() => void>(() => undefined);
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  // The server ends a session after 60 minutes without activity. Every request counts except an
  // automatic poll marked background, so a poll reports activity only when someone has pointed,
  // typed or scrolled since the last request that reached the server.
  const inputSeq = useRef(0);
  const reportedInput = useRef(0);
  const lastTouch = useRef(-Infinity);
  const keepAliveLatest = useRef<() => void>(() => undefined);
  const report = (seen: number) => { reportedInput.current = Math.max(reportedInput.current, seen); };
  // Other requests also refresh the session on the server, but cannot tell whether that refresh was
  // deferred. Only polls and keep-alives, which can, mark input as reported; the next one re-sends it.
  const reporting = <T,>(request: Promise<T>) => request;

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
    sourceRef.current="live";setSnapshotSource("live");setCachedAt(null);
    const access=validSnapshotCacheAccess(data.cacheAccess)?data.cacheAccess:null;cacheAccessRef.current=access;
    const cacheGeneration=generation.current;latestSnapshot.current=data;
    liveSnapshotBinding.current={snapshot:data,endpoint:pinnedEndpoint.current||cacheEndpoint.current,token:token.current,generation:cacheGeneration};
    if(access)void persistSnapshotCache(pinnedEndpoint.current||cacheEndpoint.current,access,data,()=>isCurrent(cacheGeneration)&&sourceRef.current==="live"&&cacheAccessRef.current===access&&latestSnapshot.current===data&&!mutationRunning.current&&!hasPendingBackground()).catch(()=>undefined);
    latestSnapshot.current = data; setSnapshot(data); setPlayers(data.players); setActivities(data.activities); setError(""); setSyncError("");
    const job = backgroundJob.current;
    if (job?.state.status === "saved" && job.state.refreshing) {
      job.state = {...job.state, refreshing:false}; setBackgroundSave(job.state);
    }
  }, []);

  const applyCachedSnapshot=(cached:{snapshot:SheetSnapshot;savedAt:number})=>{
    sourceRef.current="cache";setSnapshotSource("cache");setCachedAt(cached.savedAt);liveSnapshotBinding.current=null;
    latestSnapshot.current=cached.snapshot;setSnapshot(cached.snapshot);setPlayers(cached.snapshot.players);setActivities([]);setError("");setSyncError("");
  };

  const clearSession = useCallback(() => {
    extensionWaiters.current.forEach(waiter=>waiter.reject(new SheetApiError("STALE_SESSION","ログイン状態が変わりました。保存結果は再ログイン後に確認してください。")));extensionWaiters.current.clear();
    activeRequest.current?.abort(); activeRequest.current = null; loginRunning.current = false;
    generation.current++; token.current = "";
    ++requestVersion.current;
    writeStorage(sessionStorage, SESSION_KEY, null);
    lockPendingSaves();cacheAccessRef.current=null;sourceRef.current=null;liveSnapshotBinding.current=null;setSnapshotSource(null);setCachedAt(null);
    setAuthenticated(false); setLoadPhase(null); setSyncing(false); setSyncError("");
    setSnapshot(null); latestSnapshot.current=null; setPlayers([]); setActivities([]); setCredentials(null); setMustChangePassword(false); setBusy(false); setLocalSaving(false);
    backgroundJob.current = null; backgroundQueue.current = []; outboxLoad.current = null; mutationRunning.current = false; setBackgroundSave(null);
  }, []);
  // The login screen replaces the view that failed, so the reason must be shown there.
  const expire = useCallback((e: unknown) => { clearSession(); setError(e instanceof Error && e.message ? e.message : "ログインの有効期限が切れました。もう一度ログインしてください。"); }, [clearSession]);

  useEffect(() => {
    mounted.current = true;
    // Expired drafts are removed on every start, even before anyone signs in.
    void purgeExpiredPendingSaves().catch(() => undefined);
    void purgeSnapshotCache().catch(()=>undefined);
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
        else if (import.meta.env.PROD) throw new Error("現在アプリに接続できません。管理者にお問い合わせください。");
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
        setEndpoint(target);cacheEndpoint.current=target; setMode("live"); setPlayers([]); setActivities([]);
        // The login/recovery screen can explain progress while the Sheet loads.
        setReady(true);
        const stored = readStorage(sessionStorage, SESSION_KEY);
        if (stored) {
          let session: {endpoint?: string; token?: string;cacheAvailable?:boolean} | null = null;
          try { session = JSON.parse(stored); } catch { writeStorage(sessionStorage, SESSION_KEY, null); }
          if (session?.endpoint === target && typeof session.token === "string" && session.token.length >= 32) {
            token.current = session.token;
            setAuthenticated(true); setLoadPhase("restoring");
            if(session.cacheAvailable===true){
              try{
                const resumed=await sheetRequest<{cacheAccess?:SnapshotCacheAccess}>(target,"resumeSession",{},{token:session.token,signal:controller.signal});
                if(!isCurrent(g))return;
                if(validSnapshotCacheAccess(resumed?.cacheAccess)){
                  cacheAccessRef.current=resumed.cacheAccess;const cached=await readSnapshotCache(target,resumed.cacheAccess,()=>isCurrent(g),controller.signal);
                  if(!isCurrent(g))return;
                  if(cached){applyCachedSnapshot(cached);finishLoad(g,controller);void refreshLatest.current(true);return;}
                }
              }catch(e){if(!(e instanceof SheetApiError&&e.code==="BAD_REQUEST"))throw e;}
            }
            const data = await sheetRequest<SheetSnapshot>(target, "snapshot", {}, {token: session.token, signal: controller.signal});
            if (isCurrent(g)) applySnapshot(data);
          } else writeStorage(sessionStorage, SESSION_KEY, null);
        }
      } catch (e) {
        if (isCurrent(g)) {
          // An issued password keeps its session, but only for the forced change screen.
          if (isPasswordChangeRequired(e)) setMustChangePassword(true);
          else {
            // A network failure does not invalidate a successfully issued session.
            if (isExpired(e)) clearSession();
            setError(e instanceof Error ? e.message : "接続を確認できませんでした。");
          }
        }
      } finally { if (isCurrent(g)) { setReady(true); finishLoad(g, controller); } }
    })();
    return () => {
      extensionWaiters.current.forEach(waiter=>waiter.reject(new SheetApiError("STALE_SESSION","画面が閉じられました。保存結果は再ログイン後に確認してください。")));extensionWaiters.current.clear();
      mounted.current = false; ++generation.current; ++requestVersion.current;
      activeRequest.current?.abort(); activeRequest.current = null; loginRunning.current = false;
      backgroundJob.current = null; backgroundQueue.current = []; outboxLoad.current = null;cacheAccessRef.current=null;sourceRef.current=null;liveSnapshotBinding.current=null;
    };
  }, [applySnapshot, beginLoad, clearSession, finishLoad, isCurrent]);

  const connect = async (value: string) => {
    if (mutationRunning.current || hasPendingBackground()) throw new Error("保存が完了してから接続先を変更してください。");
    let target: string;
    try { target = validateEndpoint(value); }
    catch (e) { setError(e instanceof Error ? e.message : "接続先を確認してください。"); throw e; }
    if (pinnedEndpoint.current && target !== pinnedEndpoint.current) throw new Error("指定された接続先を使用してください。変更が必要な場合は管理者にお問い合わせください。");
    loginRunning.current = false;
    const {controller, g} = beginLoad(null);
    try {
      const health = await sheetRequest<{configured: boolean}>(target, "health", {}, {signal: controller.signal});
      if (!isCurrent(g)) return;
      if (!health.configured) throw new Error("現在このアプリを利用できません。管理者にお問い合わせください。");
      clearSession(); setEndpoint(target); setMode("live");
      writeStorage(localStorage, ENDPOINT_KEY, target);
    } catch (e) { if (isCurrent(g)) { setError(e instanceof Error ? e.message : "接続できませんでした。"); throw e; } }
    finally { finishLoad(g, controller); }
  };

  const login = async (id: string, password: string) => {
    if (loginRunning.current) return;
    if (mutationRunning.current || hasPendingBackground()) throw new Error("保存が完了してからログインしてください。");
    clearSession();loginRunning.current = true;cacheEndpoint.current=endpoint;
    const {controller, g} = beginLoad("authenticating");
    // Authentication and its first read share one deadline, so splitting the
    // requests cannot double the total time before the recovery screen appears.
    const timingStart=timingNow();let readStart=timingStart;
    const timing:StartupTiming={checkedAt:new Date().toISOString(),authenticationMs:null,cacheReadMs:null,dataReadMs:null,firstDisplayMs:null,totalMs:0,source:'failed'};setStartupTiming(null);
    let accepted = false, deadline: RequestDeadline | undefined;
    try {
      deadline = createDeadlineSignal(45_000, [controller.signal]);
      const signal = deadline.signal;
      const deviceToken = readDeviceToken(endpoint, id);
      const data = await sheetRequest<{token: string; deviceToken?: string; snapshot?: SheetSnapshot; mustChangePassword?: boolean;cacheAccess?:SnapshotCacheAccess}>(endpoint, "login", {id, password, sessionOnly: true, cacheSnapshot:true, idleAware: true, ...(deviceToken ? {deviceToken} : {})}, {signal});
      if (!isCurrent(g)) return;
      timing.authenticationMs=timingNow()-timingStart;
      if (!data || typeof data.token !== "string" || data.token.length < 32) throw new Error("ログイン結果を確認できませんでした。");
      const cacheAccepted=validSnapshotCacheAccess(data.cacheAccess)&&data.cacheAccess.self.playerId===id.trim().toUpperCase();
      writeDeviceToken(endpoint, id, data.deviceToken);
      token.current = data.token;
      writeStorage(sessionStorage, SESSION_KEY, JSON.stringify({endpoint, token: data.token,...(cacheAccepted?{cacheAvailable:true}:{})}));
      setAuthenticated(true); accepted = true;
      // An issued password only opens the change screen; no business data is requested.
      if (data.mustChangePassword === true) { timing.source="password-change";timing.firstDisplayMs=timingNow()-timingStart;setMustChangePassword(true); return; }
      if(cacheAccepted&&data.cacheAccess){
        cacheAccessRef.current=data.cacheAccess;
        readStart=timingNow();
        const cached=await readSnapshotCache(endpoint,data.cacheAccess,()=>isCurrent(g),signal);
        timing.cacheReadMs=timingNow()-readStart;
        if(!isCurrent(g))return;
        if(cached){timing.source="cache";timing.firstDisplayMs=timingNow()-timingStart;applyCachedSnapshot(cached);loginRunning.current=false;finishLoad(g,controller);void refreshLatest.current(true);return;}
      }
      setLoadPhase("loading");
      // Older deployments include a snapshot; updated ones authenticate first.
      readStart=timingNow();
      const dataSnapshot = data.snapshot === undefined
        ? await sheetRequest<SheetSnapshot>(endpoint, "snapshot", {}, {token: data.token, signal})
        : data.snapshot;
      timing.dataReadMs=timingNow()-readStart;
      if (isCurrent(g)) {applySnapshot(dataSnapshot);timing.source="latest";timing.firstDisplayMs=timingNow()-timingStart;}
    } catch (e) {
      if (!isCurrent(g)) return;
      // A server that reports the requirement only on the first read still opens the change screen.
      if (accepted && isPasswordChangeRequired(e)) {timing.source="password-change";timing.firstDisplayMs=timingNow()-timingStart;setMustChangePassword(true); return; }
      if (accepted && isExpired(e)) clearSession();
      setError(e instanceof Error ? e.message : accepted ? "実績を取得できませんでした。再取得してください。" : "ログインできませんでした。");
      timing.failureCode=e instanceof SheetApiError?e.code:"CLIENT_ERROR";
      // Keep the token and clear the submitted password after successful auth.
      // The recovery screen retries data retrieval without sending credentials.
      if (!accepted || isExpired(e)) throw e;
    } finally {
      deadline?.dispose();
      if (isCurrent(g)) {timing.totalMs=timingNow()-timingStart;setStartupTiming(timing); loginRunning.current = false; finishLoad(g, controller); }
    }
  };

  const refresh = async (background = false): Promise<boolean | undefined> => {
    if (!token.current || mutationRunning.current || hasPendingBackground() || loginRunning.current || refreshRunning.current || activeRequest.current) return;
    const refreshEndpoint=pinnedEndpoint.current||cacheEndpoint.current;
    if(!refreshEndpoint||(endpoint&&endpoint!==refreshEndpoint))return;
    // Avoid changing an editor's baseline or row revision while someone types,
    // including an editor opened while this request was already in flight.
    if (background && sourceRef.current!=="cache" && editing()) return;
    const seen = inputSeq.current, passive = background && seen === reportedInput.current;
    refreshRunning.current = true;
    const controller = new AbortController(), g = generation.current, version = ++requestVersion.current;
    activeRequest.current = controller;
    setSyncing(true);
    if (!background) { setBusy(true); setLoadPhase("loading"); setError(""); }
    const savedToken=token.current,baseline=latestSnapshot.current,binding=liveSnapshotBinding.current;
    // A display-cache projection has no private records. Only this session's complete network
    // snapshot can prove that retaining the current data is safe; manual reads always fetch all data.
    const conditional=!!(background&&passive&&sourceRef.current==="live"&&baseline&&binding?.snapshot===baseline&&
      binding.endpoint===refreshEndpoint&&binding.token===savedToken&&binding.generation===g&&storageBackendOf(baseline)&&
      validSnapshotVersion(baseline.snapshotVersion)&&validSnapshotCacheAccess(baseline.cacheAccess)&&baseline.cacheAccess===cacheAccessRef.current&&
      baseline.cacheAccess.self.playerId===baseline.self.playerId&&baseline.cacheAccess.self.role===baseline.self.role);
    const mayApply=()=>isCurrent(g)&&version===requestVersion.current&&token.current===savedToken&&!mutationRunning.current&&!hasPendingBackground()&&
      (!background||sourceRef.current==="cache"||!editing());
    const unchanged=(value:unknown)=>!!value&&typeof value==="object"&&"snapshotUnchanged" in value;
    const requestSnapshot=(payload:unknown)=>sheetRequest<SheetSnapshot|SnapshotUnchanged>(refreshEndpoint,"snapshot",payload,{token:savedToken,signal:controller.signal,...(passive?{background:true}:{})});
    try {
      let data=await requestSnapshot(conditional?{ifSnapshotVersion:baseline!.snapshotVersion}:{});
      if(unchanged(data)){
        if(!mayApply())return undefined;
        try{
          if(!conditional||!baseline||sourceRef.current!=="live"||latestSnapshot.current!==baseline||liveSnapshotBinding.current!==binding)throw new SheetApiError("INVALID_RESPONSE","同期の確認結果を確認できませんでした。");
          data=mergeSnapshotUnchanged(data,baseline);
        }catch{
          // Do not attach a changed grant to retained private data. Retry one complete read first,
          // and leave dirty forms and encrypted pending saves untouched if that read also fails.
          liveSnapshotBinding.current=null;
          data=await requestSnapshot({});
          if(unchanged(data))throw new SheetApiError("INVALID_RESPONSE","最新のデータを確認できませんでした。再取得してください。");
        }
      }
      // A server that could not record the activity (busy lock) says so; the next poll reports the input again.
      if (!passive && data?.activityDeferred !== true) report(seen);
      if (mayApply()) { applySnapshot(data); setSyncError(""); }
      return true;
    } catch (e) {
      if (isCurrent(g) && version === requestVersion.current) {
        if (isPasswordChangeRequired(e)) setMustChangePassword(true);
        // The login screen explains why, including the server's idle-timeout message.
        else if (isExpired(e)) { clearSession(); setError(e instanceof Error && e.message ? e.message : "ログインの有効期限が切れました。もう一度ログインしてください。"); }
        // A read budget names its own wait, which the generic retry notice would hide.
        else if (background) setSyncError(e instanceof SheetApiError && e.code === "RATE_LIMITED" ? e.message : "自動同期を再試行しています。表示中のデータは前回取得した内容です。");
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

  // Reports real input whenever the automatic poll did not: an open editor, a pending or failed save,
  // another request in flight, or a failed read. It reads no business data and never closes an editor.
  // Only saves that go through the encrypted outbox survive an expired session; a dialog that saves
  // directly (player issue, settings) loses its input when the session is cleared, so the notice says so.
  // With a pending or failed save the polls stop, so when nobody is typing and no editor is open it sends
  // a passive check instead: the server's idle logout then clears the screen and locks the outbox.
  const keepAlive = () => {
    const current = token.current, seen = inputSeq.current, g = generation.current, input = seen !== reportedInput.current;
    const check = !input && hasPendingBackground() && !mutationRunning.current && !editing();
    if (!current || !input && !check || Date.now() - lastTouch.current < 60_000) return;
    lastTouch.current = Date.now();
    // An Apps Script deployment without touch answers BAD_REQUEST, which is ignored like any other failure.
    void sheetRequest<{touched?: boolean; deferred?: boolean} | undefined>(endpoint, "touch", {}, {token: current, ...(input ? {} : {background: true})}).then(data => {
      // A busy server lock can defer the refresh; that input is then reported again on a later tick.
      if (input && data?.deferred !== true) report(seen);
    }, e => {
      if (!isCurrent(g) || token.current !== current || !isExpired(e)) return;
      if (check && !editing() && inputSeq.current === seen) {
        clearSession();
        setError(`${e instanceof Error && e.message ? e.message : "ログインの有効期限が切れました。"}未同期の入力はこの端末に残っています。再ログインすると確認できます。`);
      } else setSyncError("ログインの有効期限が切れています。保存するとログイン画面に戻り、画面によっては入力中の内容が残りません。必要な内容を控えてから、もう一度ログインしてください。");
    });
  };
  keepAliveLatest.current = keepAlive;

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
        // Whatever stopped the poll, input since the last report still keeps the session alive.
        if (success !== true && !stopped) keepAliveLatest.current();
      }
      if (!stopped) schedule();
    };
    const resume = () => {
      if (navigator.onLine !== false) resumeBackgroundLatest.current();
      if (!refreshRunning.current && !mutationRunning.current && document.visibilityState === "visible" && navigator.onLine !== false && Date.now() - lastAttempt >= 10_000) void tick();
    };
    // Focus and visibility stay passive: clicking into the window already produces a pointerdown.
    const markInput = () => { inputSeq.current++; };
    const inputEvents = ["pointerdown", "keydown", "wheel", "input"];
    inputEvents.forEach(name => window.addEventListener(name, markInput, {capture: true, passive: true}));
    schedule();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); window.removeEventListener("online", resume); inputEvents.forEach(name => window.removeEventListener(name, markInput, {capture: true})); };
  }, [authenticated, mode, endpoint, hasSnapshot]);

  const mutate = async (action: string, payload: unknown, operationId: string) => {
    if (!snapshot || !token.current) throw new Error("ログインしてください。");
    if (!snapshot.writesEnabled) throw new Error("現在は閲覧のみ利用できます。登録・編集については管理者にお問い合わせください。");
    if (loginRunning.current) throw new Error("ログインの確認が完了するまでお待ちください。");
    if (mutationRunning.current || hasPendingBackground()) throw new SheetApiError("MUTATION_PENDING", "右上の保存結果を確認してから、次の変更を保存してください。");
    mutationRunning.current = true; const g = generation.current;
    ++requestVersion.current; activeRequest.current?.abort(); activeRequest.current = null;
    setLoadPhase(null); setBusy(true); setError("");
    try {
      const data = await reporting(sheetRequest<MutationResult>(endpoint, action, payload, {token:token.current, operationId}));
      if (!isCurrent(g)) throw new SheetApiError("STALE_SESSION", "ログイン状態が変更されました。");
      applySnapshot(data.snapshot); if (data.credentials) setCredentials(data.credentials);
      return data;
    } catch (e) { if (isCurrent(g)) { if(isExpired(e)) clearSession(); setError(e instanceof Error ? e.message : "保存できませんでした。"); } throw e; }
    finally { if (isCurrent(g)) { mutationRunning.current = false; setBusy(false); } }
  };

  const publishQueue = () => {
    const head = backgroundQueue.current[0] || backgroundJob.current;
    backgroundJob.current = head || null;
    setBackgroundSave(head ? {...head.state, pendingCount:backgroundQueue.current.length} : null);
  };
  const online = () => typeof navigator === "undefined" || navigator.onLine !== false;
  const resumeBackground = () => {
    const next = backgroundQueue.current[0];
    // Never replay a possibly transmitted operation without the user's explicit retry.
    if (online() && latestSnapshot.current?.writesEnabled && next?.state.localSaved && !next.savedInput.attempted && next.state.status !== "failed") void runBackground(next);
  };
  resumeBackgroundLatest.current = resumeBackground;
  // Google writes are serialized; accepting another independent input waits only
  // for its encrypted local transaction, never for this network worker.
  const runBackground = async (job: BackgroundJob) => {
    if (mutationRunning.current || backgroundQueue.current[0] !== job || !isCurrent(job.generation)) return;
    if (!online()) {
      if (!job.savedInput.attempted) job.state = {...job.state, status:"saving", error:"", uncertain:false, waitingForConnection:true};
      else job.state = {...job.state, status:"failed", error:"オフラインです。接続後に同じ内容で保存結果を確認してください。", waitingForConnection:false};
      publishQueue(); return;
    }
    let updateAfterCommit = false, posted = false;const wasUncertain=job.state.uncertain;
    mutationRunning.current = true;
    ++requestVersion.current; activeRequest.current?.abort(); activeRequest.current = null;
    setSyncing(false); setLoadPhase(null); setBusy(false);
    job.state = {...job.state, status:"saving", error:"", uncertain:false, waitingForConnection:false}; publishQueue();
    try {
      job.savedInput.attempted = true;
      await persistPendingSave(job.endpoint, job.account, job.savedInput);
      if (!isCurrent(job.generation)) return;
      if (!online()) {
        // The network disappeared before fetch. Persist that no POST was made so a later
        // connection may safely resume it, including after a tab restart.
        job.savedInput.attempted = false;
        await persistPendingSave(job.endpoint, job.account, job.savedInput);
        if (!isCurrent(job.generation)) return;
        job.state = {...job.state, waitingForConnection:true}; publishQueue(); return;
      }
      posted = true;
      const data = await reporting(sheetRequest<MutationResult | MutationReceipt>(job.endpoint, job.state.action, job.payload, {token:job.token, operationId:job.state.operationId, responseMode:"receipt"}));
      if (!isCurrent(job.generation) || backgroundQueue.current[0] !== job) return;
      if (data && "snapshot" in data) { assertSnapshot(data.snapshot); applySnapshot(data.snapshot); }
      else { assertMutationReceipt(data, job.state.operationId); updateAfterCommit = true; }
      await removePendingSave(job.endpoint, job.account, job.state.operationId).catch(() => {
        if (isCurrent(job.generation)) setSyncError("保存は完了しました。次回の接続時に保存状況を再確認します。");
      });
      if (!isCurrent(job.generation) || backgroundQueue.current[0] !== job) return;
      job.state = {...job.state, status:"saved", changeId:data.changeId, intakeInput:false, refreshing:updateAfterCommit};
      job.payload = null; job.savedInput.payload = null;
      backgroundQueue.current.shift(); backgroundJob.current = job; publishQueue();
      extensionWaiters.current.get(job.state.operationId)?.resolve();extensionWaiters.current.delete(job.state.operationId);
    } catch (e) {
      if (!isCurrent(job.generation) || backgroundQueue.current[0] !== job) return;
      if (isExpired(e)) { clearSession(); setError("ログインの有効期限が切れました。入力はこの端末に残っています。再ログインすると未同期の入力を確認できます。"); return; }
      job.state = {...job.state, status:"failed", error:e instanceof Error?e.message:"保存結果を確認できませんでした。", uncertain:wasUncertain||posted&&isUncertainWrite(e),editable:!!latestSnapshot.current&&correctionFields(job.state.action,job.payload,latestSnapshot.current).length>0};
      if(extensionActions.has(job.state.action)){
        extensionWaiters.current.get(job.state.operationId)?.reject(wasUncertain&&!isUncertainWrite(e)?new SheetApiError("INTERNAL",`前回の保存結果はまだ未確認です。入力は保持しています。${e instanceof Error?e.message:"接続状態を確認してください。"}`):e);extensionWaiters.current.delete(job.state.operationId);
        if(!job.state.uncertain){await removePendingSave(job.endpoint,job.account,job.state.operationId);if(isCurrent(job.generation)&&backgroundQueue.current[0]===job){backgroundQueue.current.shift();backgroundJob.current=null;}}
      }
      publishQueue();
    } finally {
      if (isCurrent(job.generation)) {
        mutationRunning.current = false;
        const next = backgroundQueue.current[0];
        if (next && (next !== job || next.state.waitingForConnection)) resumeBackground();
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
      unlockPendingSaves(endpoint, account, current.outboxKey);
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
    if (!current.writesEnabled) throw new SheetApiError("READ_ONLY", "現在は閲覧のみ利用できます。");
    if (loginRunning.current || busy) throw new SheetApiError("MUTATION_PENDING", "ログインと画面の取得が完了してから保存してください。");
    if (!backgroundActions.has(action)) throw new SheetApiError("INVALID_ACTION", "この操作は専用の設定画面から実行してください。");
    let owned: unknown;
    try { owned = JSON.parse(JSON.stringify(payload)); } catch { throw new SheetApiError("INVALID_PAYLOAD", "入力内容を確認してください。"); }
    if (!operationId || !owned || typeof owned !== "object") throw new SheetApiError("INVALID_PAYLOAD", "入力内容を確認してください。");
    if(action==="createCandidate"&&Object.hasOwn(owned,"fields")&&!current.candidateRegistrationFeature)throw new SheetApiError("FEATURE_UNAVAILABLE","現在この登録方法を利用できません。入力を控えて管理者にお問い合わせください。");
    const dateErrors=mutationDateErrors(action,owned);
    if(Object.keys(dateErrors).length)throw new SheetApiError("INVALID_DATE",Object.values(dateErrors)[0]);
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
      catch (error) { backgroundQueue.current=backgroundQueue.current.filter(item=>item!==job); publishQueue(); resumeBackground(); throw error; }
      if (!isCurrent(g) || token.current !== savedToken) throw new SheetApiError("STALE_SESSION", "ログイン状態が変更されました。未同期の入力はこの端末に残っています。");
      job.state.localSaved=true; publishQueue();
      if (backgroundQueue.current[0]===job) void runBackground(job);
    } finally { admissions.current--; if (isCurrent(g) && admissions.current === 0) setLocalSaving(false); }
  };
  useEffect(() => {
    if (!authenticated || !snapshot || snapshotSource==="cache") return;
    void ensureOutbox().catch(error => { if (mounted.current) setSyncError(error instanceof Error?error.message:"端末の保存状況を確認できませんでした。"); });
  }, [authenticated, snapshot?.self.role, snapshot?.self.playerId, endpoint, snapshotSource]);

  const retryBackgroundSave = () => {
    const job = backgroundQueue.current[0];
    if (!job || job.state.status !== "failed" || mutationRunning.current || correctionRunning.current) return;
    if (!isCurrent(job.generation) || job.token !== token.current || job.endpoint !== endpoint) throw new SheetApiError("STALE_SESSION", "再ログインして保存結果を確認してください。");
    void runBackground(job);
  };
  // The original private input is materialized only by an explicit user action.
  // A callback retained by an older login or view must not expose a newer job.
  const copyGeneration = generation.current, copyOperation = backgroundSave?.operationId;
  const correctionJob = (operationId:string) => {
    const job=backgroundQueue.current[0],current=latestSnapshot.current;
    if(!job||!current||!authenticated||!isCurrent(copyGeneration)||!isCurrent(job.generation)||job.token!==token.current||job.endpoint!==endpoint||job.account!==`${current.self.role}:${current.self.playerId}`)throw new SheetApiError("STALE_SESSION","ログイン状態が変わりました。保存状況を開き直してください。");
    if(job.state.operationId!==operationId||operationId!==copyOperation||job.state.status!=="failed")throw new SheetApiError("STALE_SAVE","保存状況が変わりました。メニューを開き直してください。");
    if(job.state.uncertain)throw new SheetApiError("MUTATION_PENDING","保存結果が未確認です。先に同じ内容で保存を確認してください。");
    if(mutationRunning.current||correctionRunning.current)throw new SheetApiError("MUTATION_PENDING","修正内容を保存中です。");
    return {job,current};
  };
  const readBackgroundSaveCorrection = (operationId:string):SaveCorrectionDraft => {
    const {job,current}=correctionJob(operationId);
    return {operationId,fields:correctionFields(job.state.action,job.payload,current)};
  };
  const correctBackgroundSave = async (operationId:string,values:Record<string,string>):Promise<void> => {
    const {job,current}=correctionJob(operationId);
    if(!current.writesEnabled)throw new SheetApiError("READ_ONLY","現在は閲覧のみ利用できます。");
    const owned=correctedPayload(job.state.action,job.payload,values,current),resources=pendingSaveResources(job.state.action,owned,current);
    if(backgroundQueue.current.slice(1).some(other=>resources.includes("*")||other.resources.includes("*")||other.resources.some(key=>resources.includes(key))))throw new SheetApiError("MUTATION_PENDING","修正先の候補者・項目に別の未同期の入力があります。そちらの同期後に修正してください。");
    const nextId=crypto.randomUUID(),input:PendingSave={...job.savedInput,operationId:nextId,payload:owned,details:saveDetails(job.state.action,owned,current),attempted:false};
    const previousResources=job.resources;job.resources=[...new Set([...previousResources,...resources])];
    correctionRunning.current=operationId;admissions.current++;setLocalSaving(true);
    try {
      await replacePendingSave(job.endpoint,job.account,operationId,input);
      if(!isCurrent(job.generation)||backgroundQueue.current[0]!==job||job.token!==token.current)throw new SheetApiError("STALE_SESSION","ログイン状態が変わりました。修正内容は端末に保存しています。");
      job.payload=owned;job.savedInput=input;job.resources=resources;
      job.state={...job.state,operationId:nextId,details:input.details,status:"saving",error:"",uncertain:false,localSaved:true};publishQueue();
      void runBackground(job);
    } catch(error){job.resources=previousResources;throw error;}
    finally{if(correctionRunning.current===operationId)correctionRunning.current=null;admissions.current--;if(isCurrent(job.generation)&&admissions.current===0)setLocalSaving(false);}
  };
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
    if(correctionRunning.current)throw new SheetApiError("MUTATION_PENDING","修正内容を保存中です。");
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
      const data=await reporting(sheetRequest<T>(endpoint,action,{period},{token:token.current}));
      if(!isCurrent(g))throw new Error("ログイン状態が変更されました。");
      return data;
    }catch(e){if(isCurrent(g)&&isExpired(e))expire(e);throw e;}
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
      const data=await reporting(sheetRequest<T>(endpoint,action,payload,{token:token.current}));
      if(!isCurrent(g))throw new Error("ログイン状態が変更されました。");
      return data;
    }catch(e){if(isCurrent(g)&&isExpired(e))expire(e);throw e;}
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
      const data = await reporting(sheetRequest<T>(endpoint, "auditSecurity", {}, {token:token.current}));
      if (!isCurrent(g)) throw new Error("ログイン状態が変更されました。");
      return data;
    } catch (e) { if (isCurrent(g) && isExpired(e)) expire(e); throw e; }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!token.current || (!snapshot && !mustChangePassword)) throw new Error("ログインしてください。");
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
    } finally { if (isCurrent(g)) { mutationRunning.current = false; setBusy(false); } }
  };

  const readManagement = async <T,>(action: "managementTables" | "managementTable", payload: unknown = {}): Promise<T> => {
    if (!token.current || snapshot?.self.role!=="admin") throw new Error("管理者でログインしてください。");
    const g=generation.current;
    let data:T;
    try{data=await reporting(sheetRequest<T>(endpoint,action,payload,{token:token.current}));}
    catch(e){if(isCurrent(g)&&isExpired(e))expire(e);throw e;}
    if (!isCurrent(g)) throw new Error("ログイン状態が変更されました。");
    return data;
  };

  const readOperational = async <T,>(action:"readAccountManagement"|"readOperationHistory"|"readDataExport",payload:unknown={}):Promise<T> => {
    if(!token.current||snapshot?.self.role!=="admin")throw new Error("管理者でログインしてください。");
    const g=generation.current;
    try{const data=await reporting(sheetRequest<T>(endpoint,action,payload,{token:token.current}));if(!isCurrent(g))throw new Error("ログイン状態が変更されました。");return data;}
    catch(e){if(isCurrent(g)&&isExpired(e))expire(e);throw e;}
  };
  const mutateOperational = async <T,>(action:"manageAccount"|"saveMonthlyTarget",payload:unknown,operationId:string):Promise<T> => {
    if(!token.current||!snapshot)throw new Error("ログインしてください。");
    if(action==="manageAccount"&&snapshot.self.role!=="admin")throw new Error("管理者でログインしてください。");
    if(!snapshot.writesEnabled)throw new Error("現在の接続は閲覧のみです。");
    if(mutationRunning.current||hasPendingBackground()||loginRunning.current)throw new SheetApiError("MUTATION_PENDING","保存を完了してから操作してください。");
    const g=generation.current;
    mutationRunning.current=true;++requestVersion.current;activeRequest.current?.abort();activeRequest.current=null;setBusy(true);
    try{const data=await sheetRequest<T>(endpoint,action,payload,{token:token.current,operationId});if(!isCurrent(g))throw new Error("ログイン状態が変更されました。操作結果を再確認してください。");return data;}
    catch(e){if(isCurrent(g)&&isExpired(e))expire(e);throw e;}
    finally{if(isCurrent(g)){mutationRunning.current=false;setBusy(false);}}
  };

  // Bind collaborative requests to this exact login, including callbacks held by a hidden panel.
  const teamGeneration=generation.current,teamToken=token.current;
  const readTeamWorkspace=async<T,>():Promise<T>=>{
    if(!teamToken||!snapshot||!isCurrent(teamGeneration)||token.current!==teamToken)throw new SheetApiError("STALE_SESSION","ログイン状態が変わりました。社内共有を開き直してください。");
    try{const result=await sheetRequest<T>(endpoint,"readTeamWorkspace",{},{token:teamToken,background:true});if(!isCurrent(teamGeneration)||token.current!==teamToken)throw new SheetApiError("STALE_SESSION","ログイン状態が変わりました。");return result;}
    catch(error){if(isCurrent(teamGeneration)&&isExpired(error))expire(error);throw error;}
  };
  const mutateTeam=async(action:"publishTeamCandidate"|"unpublishTeamCandidate"|"saveTeamComment"|"saveTeamJob",payload:unknown,operationId:string):Promise<void>=>{
    if(!teamToken||!snapshot||!isCurrent(teamGeneration)||token.current!==teamToken)throw new SheetApiError("STALE_SESSION","ログイン状態が変わりました。社内共有を開き直してください。");
    if(!latestSnapshot.current?.teamWorkspaceFeature||!latestSnapshot.current.writesEnabled)throw new SheetApiError("READ_ONLY","社内共有は現在保存できません。接続状態を確認してください。");
    if(!["publishTeamCandidate","unpublishTeamCandidate","saveTeamComment","saveTeamJob"].includes(action))throw new SheetApiError("INVALID_ACTION","社内共有の操作を確認してください。");
    if(mutationRunning.current||hasPendingBackground()||loginRunning.current)throw new SheetApiError("MUTATION_PENDING","右上の保存結果を確認してから社内共有を保存してください。");
    mutationRunning.current=true;++requestVersion.current;activeRequest.current?.abort();activeRequest.current=null;setBusy(true);
    try{const result=await sheetRequest<MutationReceipt>(endpoint,action,payload,{token:teamToken,operationId,responseMode:"receipt"});if(!isCurrent(teamGeneration)||token.current!==teamToken)throw new SheetApiError("STALE_SESSION","ログイン状態が変わりました。保存結果を確認してください。");assertMutationReceipt(result,operationId);}
    catch(error){if(isCurrent(teamGeneration)&&isExpired(error))expire(error);throw error;}
    finally{if(isCurrent(teamGeneration)){mutationRunning.current=false;setBusy(false);resumeBackgroundLatest.current();}}
  };

  const readExtension=async<T,>(action:SheetExtensionReadAction,payload:unknown={}):Promise<T>=>{
    if(!teamToken||!snapshot||!isCurrent(teamGeneration)||token.current!==teamToken)throw new SheetApiError("STALE_SESSION","ログイン状態が変わりました。画面を開き直してください。");
    if(!isSheetExtensionReadAction(action))throw new SheetApiError("INVALID_ACTION","連携データの取得操作を確認してください。");
    try{const result=await sheetRequest<T>(endpoint,action,payload,{token:teamToken});if(!isCurrent(teamGeneration)||token.current!==teamToken)throw new SheetApiError("STALE_SESSION","ログイン状態が変わりました。");return result;}
    catch(error){if(isCurrent(teamGeneration)&&isExpired(error))expire(error);throw error;}
  };
  const mutateExtension=async(action:SheetExtensionMutationAction,payload:unknown,operationId:string):Promise<void>=>{
    if(!teamToken||!snapshot||!isCurrent(teamGeneration)||token.current!==teamToken)throw new SheetApiError("STALE_SESSION","ログイン状態が変わりました。画面を開き直してください。");
    if(!sheetExtensionMutationEnabled(action,latestSnapshot.current))throw new SheetApiError("READ_ONLY","連携が更新されていないか、現在は閲覧のみです。");
    if(mutationRunning.current||loginRunning.current)throw new SheetApiError("MUTATION_PENDING","右上の保存結果を確認してから操作してください。");
    await ensureOutbox();if(!isCurrent(teamGeneration)||token.current!==teamToken)throw new SheetApiError("STALE_SESSION","ログイン状態が変わりました。");
    const queued=backgroundQueue.current.find(job=>job.state.operationId===operationId);
    if(hasPendingBackground()&&(!queued||backgroundQueue.current[0]!==queued))throw new SheetApiError("MUTATION_PENDING","右上の保存結果を確認してから操作してください。");
    if(queued&&(queued.state.action!==action||JSON.stringify(queued.payload)!==JSON.stringify(payload)))throw new SheetApiError("OPERATION_CONFLICT","前の保存が完了してから内容を変更してください。");
    if(extensionWaiters.current.has(operationId))throw new SheetApiError("MUTATION_PENDING","この保存を確認中です。");
    let resolve!:()=>void,reject!:(error:unknown)=>void;const done=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
    // Attach a handler before asynchronous local persistence can reject the waiter.
    const observed=done.then(()=>undefined,error=>{throw error;});void observed.catch(()=>{});
    extensionWaiters.current.set(operationId,{resolve,reject});
    try{if(queued)void runBackground(queued);else await submitMutation(action,payload,operationId,saveLabel(action));await observed;}
    catch(error){extensionWaiters.current.delete(operationId);throw error;}
  };

  const logout = async () => {
    // Older deployments return no outbox secret and cannot accept new local
    // saves. They must still let the user clear this session without deleting
    // drafts; a supplied key that cannot unlock existing input still fails.
    if (latestSnapshot.current?.outboxKey !== undefined) await ensureOutbox();
    if (hasPendingBackground()) throw new SheetApiError("MUTATION_PENDING", "右上の保存結果を確認してからログアウトしてください。");
    const oldToken = token.current; clearSession(); setBusy(false); setCredentials(null);
    if (oldToken) { try { await sheetRequest(endpoint, "logout", {}, {token:oldToken}); } catch { /* Local session already removed; server session has an expiry. */ } }
  };

  const showDemo = () => {
    if (mutationRunning.current || hasPendingBackground()) return;
    clearSession(); setMode("demo"); setPlayers(initialPlayers); setActivities(makeDemoActivities()); setError("");
  };

  return { ready, startupTiming, endpoint, mode, players, setPlayers, activities, setActivities, snapshot, snapshotSource, cachedAt, authenticated, mustChangePassword, loadPhase, busy, error,
    syncing, syncError, backgroundSave, hasPendingSave, submitMutation, retryBackgroundSave, dismissBackgroundSave, readBackgroundSaveCorrection, correctBackgroundSave, copyBackgroundIntakeInput, credentials, dismissCredentials:() => setCredentials(null), connect, login, logout, refresh, mutate, readManagement, readOperational, mutateOperational, readTeamWorkspace, mutateTeam, readExtension, mutateExtension, analyzeReviews, readAdvice, analyzeInsights, readInsights, readWritingKit, generateWritingKit, readWritingPreferences, saveWritingPreferences, readSecurity, changePassword, showDemo };
}

function saveLabel(action: string) {
  return ({saveMatchReportComment:"マッチ報告のコメント",deleteMatchReportComment:"マッチ報告コメントの削除",publishIntroductionV2:"紹介文を社内共有",saveMetricGoals:"月別・工程別目標の保存",saveWorkJob:"募集案件の保存",saveProposalPlan:"提案予定の保存",recordProposalSent:"提案送付の記録",saveMatchReport:"マッチング報告の保存",completeMatchEvidence:"合意確認資料の保存",saveIntroductionV2:"候補者の紹介文・確認事項",saveIntroductionSettings:"紹介文の共有設定",mutateRewards:"ポイント・特典の保存",stageMigrationBatch:"過去データの原文保管",applyMigrationItem:"過去データの登録",saveCandidateProfile:"候補者の基本情報",saveClient:"取引先の登録・編集",deleteCandidate:"候補者・提案の削除",updateRecord:"候補者の変更",createCandidate:"候補者の登録",cancelAchievement:"成果の取り消し",restoreChange:"変更の復元",saveActivity:"成果の登録",updateProfile:"プロフィール",updateStatus:"進捗の変更",saveManagementRow:"業務管理表",saveInterviewReview:"面談の振り返り"} as Record<string,string>)[action] || "変更";
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
  const raw=(action === "saveCandidateProfile" || action === "createCandidate") ? data : action === "saveActivity" ? activity?.interviewProfile : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body=raw as Record<string,unknown>;
  return body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? body : null;
}
