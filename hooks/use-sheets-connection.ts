import { useCallback, useEffect, useRef, useState } from "react";
import { initialPlayers, makeDemoActivities, type Activity } from "../lib/node-data";
import { assertSnapshot, sheetRequest, validateEndpoint, SheetApiError, type MutationResult, type SheetSnapshot, type SheetPlayer, type InterviewAdvice, type InterviewAdviceState } from "../lib/sheets-client";

const ENDPOINT_KEY = "insup.node.endpoint.v1";
const SESSION_KEY = "insup.node.session.v1";
const isExpired = (e: unknown) => e instanceof SheetApiError && ["AUTH_REQUIRED", "UNAUTHENTICATED", "UNAUTHORIZED", "SESSION_EXPIRED"].includes(e.code);
export type ConnectionLoadPhase = "authenticating" | "loading" | "restoring" | null;
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
  const [credentials, setCredentials] = useState<{id: string; password: string} | null>(null);
  const token = useRef("");
  const generation = useRef(0);
  const requestVersion = useRef(0);
  const mutationRunning = useRef(false);
  const loginRunning = useRef(false);
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
    setSnapshot(data); setPlayers(data.players); setActivities(data.activities); setError("");
  }, []);

  const clearSession = useCallback(() => {
    activeRequest.current?.abort(); activeRequest.current = null; loginRunning.current = false;
    generation.current++; token.current = "";
    ++requestVersion.current;
    writeStorage(sessionStorage, SESSION_KEY, null);
    setAuthenticated(false); setLoadPhase(null);
    setSnapshot(null); setPlayers([]); setActivities([]); setCredentials(null); setBusy(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const {controller, g} = beginLoad(null);
    (async () => {
      let target = readStorage(localStorage, ENDPOINT_KEY) || "";
      if (!target) {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}connection.json`, { cache: "no-store", signal: controller.signal });
          if (response.ok) target = (await response.json()).endpoint || "";
        } catch { /* No live endpoint has been configured. */ }
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
          }
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
    };
  }, [applySnapshot, beginLoad, clearSession, finishLoad, isCurrent]);

  const connect = async (value: string) => {
    if (mutationRunning.current) throw new Error("保存が完了してから接続先を変更してください。");
    let target: string;
    try { target = validateEndpoint(value); }
    catch (e) { setError(e instanceof Error ? e.message : "接続先を確認してください。"); throw e; }
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
    if (mutationRunning.current) throw new Error("保存が完了してからログインしてください。");
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

  const refresh = async () => {
    if (!token.current || mutationRunning.current || loginRunning.current) return;
    const {controller, g} = beginLoad("loading"), version = requestVersion.current;
    try {
      const data = await sheetRequest<SheetSnapshot>(endpoint, "snapshot", {}, {token: token.current, signal: controller.signal});
      if (isCurrent(g) && version === requestVersion.current) applySnapshot(data);
    } catch (e) {
      if (isCurrent(g) && version === requestVersion.current) {
        if(isExpired(e)) clearSession();
        setError(e instanceof Error ? e.message : "再取得できませんでした。"); throw e;
      }
    } finally { if (version === requestVersion.current) finishLoad(g, controller); }
  };

  const mutate = async (action: string, payload: unknown, operationId: string) => {
    if (!snapshot || !token.current) throw new Error("ログインしてください。");
    if (!snapshot.writesEnabled) throw new Error("現在は読み取り接続です。管理者が書き込みを有効にしてから登録してください。");
    if (loginRunning.current) throw new Error("ログインの確認が完了するまでお待ちください。");
    if (mutationRunning.current) throw new Error("前の保存が完了するまでお待ちください。");
    mutationRunning.current = true; const g = generation.current;
    ++requestVersion.current; activeRequest.current?.abort(); activeRequest.current = null;
    setLoadPhase(null); setBusy(true); setError("");
    try {
      const data = await sheetRequest<MutationResult>(endpoint, action, payload, {token:token.current, operationId});
      if (isCurrent(g)) { applySnapshot(data.snapshot); if (data.credentials) setCredentials(data.credentials); }
      return data;
    } catch (e) { if (isCurrent(g)) { if(isExpired(e)) clearSession(); setError(e instanceof Error ? e.message : "保存できませんでした。"); } throw e; }
    finally { mutationRunning.current = false; if (isCurrent(g)) setBusy(false); }
  };

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

  const readManagement = async <T,>(action: "managementTables" | "managementTable", payload: unknown = {}): Promise<T> => {
    if (!token.current || snapshot?.self.role!=="admin") throw new Error("管理者でログインしてください。");
    const g=generation.current;
    const data=await sheetRequest<T>(endpoint,action,payload,{token:token.current});
    if (!isCurrent(g)) throw new Error("ログイン状態が変更されました。");
    return data;
  };

  const logout = async () => {
    const oldToken = token.current; clearSession(); setBusy(false); setCredentials(null);
    if (oldToken) { try { await sheetRequest(endpoint, "logout", {}, {token:oldToken}); } catch { /* Local session already removed; server session has an expiry. */ } }
  };

  const showDemo = () => {
    if (mutationRunning.current) return;
    clearSession(); setMode("demo"); setPlayers(initialPlayers); setActivities(makeDemoActivities()); setError("");
  };

  return { ready, endpoint, mode, players, setPlayers, activities, setActivities, snapshot, authenticated, loadPhase, busy, error,
    credentials, dismissCredentials:() => setCredentials(null), connect, login, logout, refresh, mutate, readManagement, analyzeReviews, readAdvice, showDemo };
}
