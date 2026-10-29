import { useCallback, useEffect, useRef, useState } from "react";
import "./unsaved-work.css";

type UnsavedFormOptions = { onClose: () => void; locked: boolean };

/** Warn only while the caller's current values differ from their saved baseline. */
export function useUnsavedChangesWarning(dirty: boolean) {
  const latest = useRef(dirty);
  latest.current = dirty;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!latest.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

/** A close safeguard only. Form values stay with the caller and are never stored here. */
export function useUnsavedFormGuard({ onClose, locked }: UnsavedFormOptions) {
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const latest = useRef({ onClose, locked });
  latest.current = { onClose, locked };
  const changed = useRef(false);
  const confirmationOpen = useRef(false);
  const closeSent = useRef(false);

  const markChanged = useCallback(() => {
    changed.current = true;
    setDirty(true);
  }, []);

  // Call when opening a fresh form or after the caller has accepted a successful save.
  const reset = useCallback(() => {
    changed.current = false;
    confirmationOpen.current = false;
    closeSent.current = false;
    setDirty(false);
    setConfirming(false);
  }, []);

  const requestClose = useCallback(() => {
    if (latest.current.locked || closeSent.current) return;
    if (changed.current) {
      confirmationOpen.current = true;
      setConfirming(true);
      return;
    }
    closeSent.current = true;
    latest.current.onClose();
  }, []);

  const keepEditing = useCallback(() => {
    confirmationOpen.current = false;
    setConfirming(false);
  }, []);

  const discardAndClose = useCallback(() => {
    if (latest.current.locked || closeSent.current || !confirmationOpen.current) return;
    changed.current = false;
    confirmationOpen.current = false;
    closeSent.current = true;
    setDirty(false);
    setConfirming(false);
    latest.current.onClose();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!changed.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return { dirty, confirming, markChanged, reset, requestClose, keepEditing, discardAndClose };
}

type UnsavedWorkPromptProps = {
  open: boolean;
  locked: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
};

export function UnsavedWorkPrompt({ open, locked, onKeepEditing, onDiscard }: UnsavedWorkPromptProps) {
  if (!open) return null;
  return <div className="unsaved-work-prompt" role="alert">
    <div className="unsaved-work-prompt__message">
      <strong>保存していない変更があります。</strong>
      <p>{locked
        ? "保存の確認が終わるまで、閉じる操作はできません。"
        : "閉じると、入力した変更は保存されません。編集を続けるか、変更を破棄して閉じてください。"}</p>
    </div>
    <div className="unsaved-work-prompt__actions">
      <button type="button" className="secondary-button" disabled={locked} onClick={() => { if (!locked) onKeepEditing(); }}>編集を続ける</button>
      <button type="button" className="secondary-button unsaved-work-prompt__discard" disabled={locked} onClick={() => { if (!locked) onDiscard(); }}>変更を破棄して閉じる</button>
    </div>
  </div>;
}
