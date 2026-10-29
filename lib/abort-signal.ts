/** Portable cancellation and deadlines for browsers without AbortSignal.any/timeout/throwIfAborted.
 * A combined signal never aborts its callers. Dispose detaches every source listener and clears
 * our fallback timer; it is also called as soon as a cancellation wins. */
export type RequestDeadline = {signal: AbortSignal; timedOut: () => boolean; dispose: () => void};
type AbortState = {reason?: unknown; timeout: boolean};
const owned = new WeakMap<AbortSignal, AbortState>();
function namedError(name: string, message: string): Error { const error = new Error(message); error.name = name; return error; }
export function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? owned.get(signal)?.reason ?? namedError("AbortError", "The request was cancelled.");
}
export function isTimeoutSignal(signal?: AbortSignal): boolean {
  if (!signal?.aborted) return false;
  return owned.get(signal)?.timeout === true || (abortReason(signal) as {name?: string})?.name === "TimeoutError";
}
export function throwIfAborted(signal: AbortSignal): void { if (signal.aborted) throw abortReason(signal); }
export function createDeadlineSignal(milliseconds: number, sources: readonly AbortSignal[] = []): RequestDeadline {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new RangeError("A positive request deadline is required.");
  const controller = new AbortController(), state: AbortState = {timeout: false};
  owned.set(controller.signal, state);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners: {source: AbortSignal; listener: () => void}[] = [];
  const dispose = () => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    for (const entry of listeners.splice(0)) entry.source.removeEventListener("abort", entry.listener);
  };
  const abort = (reason: unknown, timeout: boolean) => {
    if (controller.signal.aborted) return;
    state.reason = reason; state.timeout = timeout;
    try { controller.abort(reason); } finally { dispose(); }
  };
  try {
    const nativeTimeout = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(milliseconds) : null;
    const inputs = [...sources, ...(nativeTimeout ? [nativeTimeout] : [])];
    for (const source of inputs) {
      const listener = () => abort(abortReason(source), source === nativeTimeout || isTimeoutSignal(source));
      if (source.aborted) { listener(); break; }
      source.addEventListener("abort", listener, {once: true}); listeners.push({source, listener});
    }
    if (!controller.signal.aborted && !nativeTimeout) timer = setTimeout(() => abort(namedError("TimeoutError", "The request deadline expired."), true), milliseconds);
  } catch (error) { dispose(); throw error; }
  return {signal: controller.signal, timedOut: () => state.timeout, dispose};
}
