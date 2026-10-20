"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Download, LoaderCircle, Monitor, RefreshCw, Save, Sparkles, X } from "lucide-react";
import { validateWritingPreferences, type WritingPreferences } from "@/lib/writing-ai";
import { extractWritingPreferences, getOnDeviceAiAvailability, type OnDeviceAiAvailability, type OnDeviceAiProgress } from "@/lib/on-device-ai";
import { introductionHeadings } from "@/lib/introduction-style";
import "@/app/writing-preferences.css";

export type WritingPreferencesEditorProps = {
  preferences: WritingPreferences;
  identityKey: string;
  disabled?: boolean;
  onRead: () => Promise<WritingPreferences>;
  onSave: (preferences: WritingPreferences) => Promise<WritingPreferences>;
};

const sectionLabels = introductionHeadings;
const contentKey = (value: WritingPreferences): string => JSON.stringify([value.tone, value.targetLength, value.includeSummary, value.sectionOrder]);
const isConflict = (error: unknown): boolean => !!error && typeof error === "object" && "code" in error && error.code === "VERSION_CONFLICT";
const safeLocalError = (error: unknown): string => {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const phase = error && typeof error === "object" && "phase" in error ? error.phase : "";
  if (code === "TIMEOUT" && phase === "preparation") return "AIモデルの準備に時間がかかったため、待機を終了しました。参考文と編集中の設定は残っています。もう一度抽出すると、Chromeの準備状況を確認して進められます。";
  if (code === "TIMEOUT" && phase === "generation") return "書式の抽出に時間がかかったため中止しました。参考文と編集中の設定は残っています。もう一度抽出できます。";
  return ({
    UNAVAILABLE: "この端末・ブラウザでは端末内AIを利用できません。PC版Chromeでお試しいただくか、上の設定を手動で調整してください。",
    ABORTED: "書式の抽出を中止しました。参考文と編集中の設定は残っています。",
    TIMEOUT: "端末内AIの準備に時間がかかっています。抽出を中止しました。参考文を短くして再度お試しください。",
    INVALID_INPUT: "参考文を確認してください。12,000文字以内の文章でお試しください。",
    INVALID_RESPONSE: "AIの書式案を確認できませんでした。編集中の設定は変更していません。",
    MODEL_ERROR: "端末内AIを実行できませんでした。編集中の設定は残っています。",
  } as Record<string, string>)[code] || "書式を抽出できませんでした。参考文と編集中の設定は残っています。";
};

/** Keying the private session discards reference text on logout/account changes. */
export function WritingPreferencesEditor(props: WritingPreferencesEditorProps) {
  return <WritingPreferencesEditorSession key={props.identityKey} {...props}/>;
}

function WritingPreferencesEditorSession({ preferences, disabled = false, onRead, onSave }: WritingPreferencesEditorProps) {
  const id = useId();
  const [baseline, setBaseline] = useState(() => validateWritingPreferences(preferences));
  const [draft, setDraft] = useState(() => validateWritingPreferences(preferences));
  const [operation, setOperation] = useState<"reading" | "saving" | "extracting" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [reference, setReference] = useState("");
  const [availability, setAvailability] = useState<OnDeviceAiAvailability | "checking">("checking");
  const [progress, setProgress] = useState<OnDeviceAiProgress | null>(null);
  const [preview, setPreview] = useState<{ preferences: WritingPreferences; referenceRevision: number } | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const request = useRef(0);
  const referenceRevision = useRef(0);
  const extraction = useRef<AbortController | null>(null);
  const latestRead = useRef(onRead); latestRead.current = onRead;
  const latestSave = useRef(onSave); latestSave.current = onSave;
  const dirty = contentKey(draft) !== contentKey(baseline);
  const seenPropVersion = useRef(preferences.version);
  const current = useRef({ dirty, baselineVersion: baseline.version }); current.current = { dirty, baselineVersion: baseline.version };
  const changedElsewhere = remoteVersion !== null && remoteVersion !== baseline.version;
  const controlsDisabled = disabled || operation !== null;
  const supported = availability !== "checking" && availability !== "unavailable";
  const referenceStale = !!preview && preview.referenceRevision !== referenceRevision.current;

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void getOnDeviceAiAvailability({ signal: controller.signal }).then(value => {
      if (mounted.current && !controller.signal.aborted) setAvailability(value);
    }).catch(() => { if (mounted.current && !controller.signal.aborted) setAvailability("unavailable"); });
    return () => { mounted.current = false; request.current++; controller.abort(); extraction.current?.abort(); extraction.current = null; };
  }, []);

  useEffect(() => {
    // A background refresh cannot replace an edited form or move its frozen version.
    if (seenPropVersion.current === preferences.version) return;
    seenPropVersion.current = preferences.version;
    if (busy.current || current.current.dirty) {
      setRemoteVersion(preferences.version === current.current.baselineVersion ? null : preferences.version);
      return;
    }
    try {
      const fresh = validateWritingPreferences(preferences);
      setBaseline(fresh); setDraft(fresh); setConflict(false); setReloadConfirm(false); setRemoteVersion(null);
    } catch { /* The parent keeps the last validated settings. */ }
  }, [preferences]);

  useEffect(() => { if (disabled) extraction.current?.abort(); }, [disabled]);

  function edit(patch: Partial<Pick<WritingPreferences, "tone" | "targetLength" | "includeSummary" | "sectionOrder">>) {
    if (controlsDisabled) return;
    setDraft(previous => ({ ...previous, ...patch, version: baseline.version }));
    setNotice(""); setReloadConfirm(false);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.sectionOrder.length) return;
    const order = draft.sectionOrder.slice(); [order[index], order[target]] = [order[target], order[index]];
    edit({ sectionOrder: order });
  }

  async function readLatest(discard = false) {
    if (busy.current) return;
    if (dirty && !discard) { setReloadConfirm(true); return; }
    busy.current = true; const generation = ++request.current;
    setOperation("reading"); setError(""); setNotice("");
    try {
      const fresh = validateWritingPreferences(await latestRead.current());
      if (!mounted.current || request.current !== generation) return;
      setBaseline(fresh); setDraft(fresh); setConflict(false); setRemoteVersion(null); setReloadConfirm(false);
      setNotice(preview ? "保存済み設定を取得しました。取り込み済みの書式案は残っています。参考文の再読み込みは不要です。" : "保存済みの共通ルールを取得しました。");
    } catch (cause) {
      if (mounted.current && request.current === generation) setError(cause instanceof Error ? cause.message : "最新の設定を取得できませんでした。編集中の設定は残っています。");
    } finally { busy.current = false; if (mounted.current && request.current === generation) setOperation(null); }
  }

  async function save(fromReference = false) {
    if (controlsDisabled || busy.current || (fromReference ? !preview || referenceStale : !dirty)) return;
    // This strict clone contains enums/boolean/order/version only. Never attach reference text.
    const submitted = validateWritingPreferences({ ...(fromReference ? preview!.preferences : draft), version: baseline.version });
    busy.current = true; const generation = ++request.current;
    setOperation("saving"); setError(""); setNotice(""); setReloadConfirm(false);
    try {
      const saved = validateWritingPreferences(await latestSave.current(submitted));
      if (!mounted.current || request.current !== generation) return;
      setBaseline(saved); setDraft(saved); setConflict(false); setRemoteVersion(null); setNotice("書き方を保存しました。今後は全プレイヤーの紹介文に自動で使われます。参考文の再入力は不要です。");
      if (fromReference) { referenceRevision.current++; setReference(""); setPreview(null); }
    } catch (cause) {
      if (!mounted.current || request.current !== generation) return;
      setConflict(isConflict(cause));
      setError(isConflict(cause) ? "共有設定が変更されています。編集中の設定は残しています。最新を読み直してから保存してください。" : cause instanceof Error ? cause.message : "保存できませんでした。書式案は残っています。参考文を読み込み直さず、もう一度保存できます。");
    } finally { busy.current = false; if (mounted.current && request.current === generation) setOperation(null); }
  }

  async function extract() {
    if (controlsDisabled || busy.current || !reference.trim() || !supported) return;
    busy.current = true; const generation = ++request.current, revision = referenceRevision.current;
    const controller = new AbortController(); extraction.current = controller;
    setOperation("extracting"); setError(""); setNotice(""); setProgress({ phase: "checking" }); setPreview(null);
    try {
      const extracted = await extractWritingPreferences(reference, { signal: controller.signal, preparationTimeoutMs: 600000, timeoutMs: 120000, onProgress: value => {
        if (mounted.current && request.current === generation && !controller.signal.aborted) setProgress(value);
      } });
      const result = validateWritingPreferences({ ...extracted, version: baseline.version });
      if (!mounted.current || request.current !== generation || controller.signal.aborted) return;
      setPreview({ preferences: result, referenceRevision: revision });
      setNotice("書式案を作成しました。確認して「この書き方を保存して今後も使う」を押すと、次回以降に自動で使えます。");
    } catch (cause) {
      if (mounted.current && request.current === generation) setError(safeLocalError(cause));
    } finally {
      if (extraction.current === controller) extraction.current = null;
      busy.current = false;
      if (mounted.current && request.current === generation) { setOperation(null); setProgress(null); }
    }
  }

  return <section className="writing-preferences card" aria-labelledby={`${id}-heading`}>
    <header className="writing-preferences-heading"><div><h3 id={`${id}-heading`}>紹介文の共通ルール</h3><p>以前共有いただいた紹介文の構成を標準登録済みです。保存した口調・長さ・項目順は、全プレイヤーの次回以降の文章作成に自動で使います。</p></div><button type="button" className="secondary-button" disabled={operation !== null} onClick={() => void readLatest()}><RefreshCw size={16} className={operation === "reading" ? "review-spinner" : ""}/>{operation === "reading" ? "取得中…" : "保存済み設定を確認"}</button></header>
    {disabled && <p className="writing-preferences-notice">現在は読み取り専用です。設定の更新は接続状態を確認してから行ってください。</p>}
    {(changedElsewhere || conflict) && <div className="writing-preferences-warning" role="status"><p>共有設定が更新されています。編集中の内容はそのまま残しています。</p><button type="button" className="secondary-button" disabled={operation !== null} onClick={() => void readLatest()}>最新を読み直す</button></div>}
    {reloadConfirm && <div className="writing-preferences-warning" role="alert"><p>編集中の設定を破棄し、保存済みの設定を取得します。</p><div><button type="button" className="secondary-button" onClick={() => setReloadConfirm(false)}>編集を続ける</button><button type="button" className="secondary-button" onClick={() => void readLatest(true)}>下書きを破棄して取得</button></div></div>}
    <fieldset className="writing-preferences-fields" disabled={controlsDisabled}>
      <legend className="writing-preferences-sr-only">文章の書式</legend>
      <div className="writing-preferences-options"><label htmlFor={`${id}-tone`}>口調<select id={`${id}-tone`} value={draft.tone} onChange={event => edit({ tone: event.target.value as WritingPreferences["tone"] })}><option value="formal">丁寧語（です・ます）</option><option value="plain">常体（だ・である）</option></select></label><label htmlFor={`${id}-length`}>文章の長さ<select id={`${id}-length`} value={draft.targetLength} onChange={event => edit({ targetLength: Number(event.target.value) as WritingPreferences["targetLength"] })}><option value={600}>短め・600文字以内</option><option value={1000}>標準・1,000文字以内</option></select></label></div>
      <label className="writing-preferences-summary"><input type="checkbox" checked={draft.includeSummary} onChange={event => edit({ includeSummary: event.target.checked })}/><span>総評を含める（端末AIは入力した事実の要約、AI文章構成は共通の導入句）</span></label>
      <div className="writing-preferences-order"><h4>項目の順序</h4><p>上下のボタンで並び替えます。未入力の項目は文章から省略します。</p><ol>{draft.sectionOrder.map((section, index) => <li key={section}><span className="writing-preferences-number">{index + 1}</span><span className="writing-preferences-section-label">{sectionLabels[section]}{section === "summary" && !draft.includeSummary && <small>文章には含めない</small>}</span><div><button type="button" className="writing-preferences-move" disabled={index === 0 || controlsDisabled} aria-label={`${sectionLabels[section]}を上へ`} onClick={() => move(index, -1)}><ArrowUp size={16}/></button><button type="button" className="writing-preferences-move" disabled={index === draft.sectionOrder.length - 1 || controlsDisabled} aria-label={`${sectionLabels[section]}を下へ`} onClick={() => move(index, 1)}><ArrowDown size={16}/></button></div></li>)}</ol></div>
    </fieldset>
    <div className="writing-preferences-save"><button type="button" className="primary-button" disabled={controlsDisabled || !dirty} onClick={() => void save()}>{operation === "saving" ? <LoaderCircle size={16} className="review-spinner"/> : <Save size={16}/>}{operation === "saving" ? "保存中…" : "共通ルールを保存"}</button><span>{dirty ? "未保存の変更があります" : "この書き方を毎回自動使用・参考文の再入力は不要"}</span></div>
    <details className="writing-preferences-reference"><summary><Monitor size={17}/>書き方を変更するときだけ参考文を取り込む <small>一度保存すれば自動使用</small></summary><p>参考文は一度取り込んで書き方を保存すれば完了です。口調・長さ・項目順・総評の有無を共通設定として保存します。元の参考文に含まれる候補者情報は保存せず、書式だけを今後の紹介文に使います。</p><label htmlFor={`${id}-reference`}>参考にする紹介文<textarea id={`${id}-reference`} rows={6} maxLength={12000} value={reference} disabled={disabled} readOnly={operation !== null} placeholder="普段使っている紹介文を貼り付けてください。一度取り込んで保存すると、毎回の貼り付けは不要になります。" onChange={event => { referenceRevision.current++; setReference(event.target.value); setNotice(""); }}/></label><div className="writing-preferences-reference-actions"><span>{Array.from(reference).length.toLocaleString()} / 12,000文字</span><button type="button" className="text-button" disabled={!reference || operation !== null} onClick={() => { referenceRevision.current++; setReference(""); setPreview(null); }}>参考文を消去</button></div>
      {availability === "checking" ? <p className="writing-preferences-capability">端末内AIが使えるか確認しています…</p> : availability === "unavailable" ? <p className="writing-preferences-capability">この端末・ブラウザでは端末内AIを利用できません。対応するPC版Chromeでお試しください。上の設定は手動でも調整できます。</p> : <p className="writing-preferences-capability">{availability === "downloadable" || availability === "downloading" ? "初回はブラウザのAIモデルをダウンロードするため、準備に数分かかることがあります。途中で中止できます。" : "この端末のAIで書式を抽出できます。"} 参考文をクラウドAIへ送信することはありません。</p>}
      <div className="writing-preferences-extract-actions"><button type="button" className="secondary-button" disabled={controlsDisabled || !reference.trim() || !supported} onClick={() => void extract()}>{operation === "extracting" ? <LoaderCircle size={16} className="review-spinner"/> : availability === "downloadable" ? <Download size={16}/> : <Sparkles size={16}/>}{operation === "extracting" ? "書式を抽出中…" : "参考文から書式案を作る"}</button>{operation === "extracting" && <button type="button" className="secondary-button" onClick={() => extraction.current?.abort()}><X size={16}/>中止</button>}</div>
      {progress && <div className="writing-preferences-progress" role="status"><span>{progress.phase === "checking" ? "端末内AIを確認しています…" : progress.phase === "generating" ? "参考文の書式を読み取っています…" : progress.downloadProgress === 1 ? "ダウンロード完了。端末AIを起動しています…" : `AIモデルを準備しています${typeof progress.downloadProgress === "number" ? `… ${Math.round(progress.downloadProgress * 100)}%` : "…"}`}</span>{progress.phase === "downloading" && <progress max={1} value={progress.downloadProgress} aria-label="AIモデルのダウンロード進捗"/>}</div>}
      {preview && <div className="writing-preferences-preview"><h4>抽出した書式案</h4><dl><div><dt>口調</dt><dd>{preview.preferences.tone === "formal" ? "丁寧語（です・ます）" : "常体（だ・である）"}</dd></div><div><dt>長さ</dt><dd>{preview.preferences.targetLength.toLocaleString()}文字以内</dd></div><div><dt>総評</dt><dd>{preview.preferences.includeSummary ? "含める" : "含めない"}</dd></div><div><dt>項目順</dt><dd>{preview.preferences.sectionOrder.map(section => sectionLabels[section]).join(" → ")}</dd></div></dl>{referenceStale && <p className="writing-preferences-warning">参考文が変更されています。書式案を作り直してください。</p>}<button type="button" className="secondary-button" disabled={controlsDisabled || referenceStale} onClick={() => void save(true)}>{operation === "saving" ? <LoaderCircle size={16} className="review-spinner"/> : <Check size={16}/>}{operation === "saving" ? "保存中…" : "この書き方を保存して今後も使う"}</button><p>保存後は再ログインや画面の移動後も自動で使います。</p></div>}
    </details>
    {notice && <p className="writing-preferences-notice" role="status">{notice}</p>}{error && <p className="writing-preferences-error" role="alert">{error}</p>}
  </section>;
}
