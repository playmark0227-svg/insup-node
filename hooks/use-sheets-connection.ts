import { useCallback, useEffect, useRef, useState } from "react";
import { initialPlayers, makeDemoActivities, type Activity } from "../lib/node-data";
import { assertSnapshot, sheetRequest, validateEndpoint, SheetApiError, type MutationResult, type SheetSnapshot, type SheetPlayer } from "../lib/sheets-client";

const ENDPOINT_KEY = "insup.node.endpoint.v1";
const SESSION_KEY = "insup.node.session.v1";
const isExpired = (e: unknown) => e instanceof SheetApiError && ["AUTH_REQUIRED", "UNAUTHENTICATED", "UNAUTHORIZED", "SESSION_EXPIRED"].includes(e.code);
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<{id: string; password: string} | null>(null);
  const token = useRef("");
  const generation = useRef(0);
  const requestVersion = useRef(0);
  const mutationRunning = useRef(false);

  const applySnapshot = useCallback((data: unknown) => {
    assertSnapshot(data);
    setSnapshot(data); setPlayers(data.players); setActivities(data.activities); setError("");
  }, []);

  const clearSession = useCallback(() => {
    generation.current++; token.current = "";
    writeStorage(sessionStorage, SESSION_KEY, null);
    setSnapshot(null); setPlayers([]); setActivities([]); setCredentials(null); setBusy(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let target = readStorage(localStorage, ENDPOINT_KEY) || "";
      if (!target) {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}connection.json`, { cache: "no-store" });
          if (response.ok) target = (await response.json()).endpoint || "";
        } catch { /* No live endpoint has been configured. */ }
      }
      if (cancelled) return;
      if (!target) { setReady(true); return; }
      setMode("live"); setPlayers([]); setActivities([]);
      try {
        target = validateEndpoint(target);
        setEndpoint(target); setMode("live"); setPlayers([]); setActivities([]);
        const stored = readStorage(sessionStorage, SESSION_KEY);
        if (stored) {
          const session = JSON.parse(stored);
          if (session.endpoint === target && typeof session.token === "string") {
            token.current = session.token;
            const data = await sheetRequest<SheetSnapshot>(target, "snapshot", {}, {token: session.token});
            if (!cancelled) applySnapshot(data);
          }
        }
      } catch (e) {
        if (!cancelled) { clearSession(); setError(e instanceof Error ? e.message : "接続を確認できませんでした。"); }
      } finally { if (!cancelled) setReady(true); }
    })();
    return () => { cancelled = true; };
  }, [applySnapshot, clearSession]);

  const connect = async (value: string) => {
    if (mutationRunning.current) throw new Error("保存が完了してから接続先を変更してください。");
    setBusy(true); setError("");
    try {
      const target = validateEndpoint(value);
      const health = await sheetRequest<{configured: boolean}>(target, "health");
      if (!health.configured) throw new Error("Google側の初期設定が完了していません。");
      clearSession(); setEndpoint(target); setMode("live");
      writeStorage(localStorage, ENDPOINT_KEY, target);
    } catch (e) { setError(e instanceof Error ? e.message : "接続できませんでした。"); throw e; }
    finally { setBusy(false); }
  };

  const login = async (id: string, password: string) => {
    setBusy(true); setError(""); const g = ++generation.current;
    try {
      const data = await sheetRequest<{token: string; snapshot: SheetSnapshot}>(endpoint, "login", {id, password});
      assertSnapshot(data.snapshot);
      if (typeof data.token !== "string" || data.token.length < 32) throw new Error("ログイン結果を確認できませんでした。");
      if (g !== generation.current) return;
      token.current = data.token;
      writeStorage(sessionStorage, SESSION_KEY, JSON.stringify({endpoint, token: data.token}));
      applySnapshot(data.snapshot);
    } catch (e) { if (g === generation.current) setError(e instanceof Error ? e.message : "ログインできませんでした。"); throw e; }
    finally { if (g === generation.current) setBusy(false); }
  };

  const refresh = async () => {
    if (!token.current || mutationRunning.current) return;
    const g = generation.current, version = ++requestVersion.current;
    setBusy(true); setError("");
    try {
      const data = await sheetRequest<SheetSnapshot>(endpoint, "snapshot", {}, {token: token.current});
      if (g === generation.current && version === requestVersion.current) applySnapshot(data);
    } catch (e) { if (g === generation.current) { if(isExpired(e)) clearSession(); setError(e instanceof Error ? e.message : "再取得できませんでした。"); } throw e; }
    finally { if (g === generation.current && version === requestVersion.current) setBusy(false); }
  };

  const mutate = async (action: string, payload: unknown, operationId: string) => {
    if (!snapshot || !token.current) throw new Error("ログインしてください。");
    if (!snapshot.writesEnabled) throw new Error("現在は読み取り接続です。管理者が書き込みを有効にしてから登録してください。");
    if (mutationRunning.current) throw new Error("前の保存が完了するまでお待ちください。");
    mutationRunning.current = true; const g = generation.current;
    ++requestVersion.current; setBusy(true); setError("");
    try {
      const data = await sheetRequest<MutationResult>(endpoint, action, payload, {token:token.current, operationId});
      if (g === generation.current) { applySnapshot(data.snapshot); if (data.credentials) setCredentials(data.credentials); }
      return data;
    } catch (e) { if (g === generation.current) { if(isExpired(e)) clearSession(); setError(e instanceof Error ? e.message : "保存できませんでした。"); } throw e; }
    finally { mutationRunning.current = false; if (g === generation.current) setBusy(false); }
  };

  const logout = async () => {
    const oldToken = token.current; clearSession(); setBusy(false); setCredentials(null);
    if (oldToken) { try { await sheetRequest(endpoint, "logout", {}, {token:oldToken}); } catch { /* Local session already removed; server session has an expiry. */ } }
  };

  const showDemo = () => {
    if (mutationRunning.current) return;
    clearSession(); setMode("demo"); setPlayers(initialPlayers); setActivities(makeDemoActivities()); setError("");
  };

  return { ready, endpoint, mode, players, setPlayers, activities, setActivities, snapshot, busy, error,
    credentials, dismissCredentials:() => setCredentials(null), connect, login, logout, refresh, mutate, showDemo };
}
