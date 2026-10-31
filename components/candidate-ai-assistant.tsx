"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Download, FileText, LoaderCircle, Monitor, Sparkles, X } from "lucide-react";
import { normalizeInterviewFields, unicodeLength, introductionLimit, type InterviewFields, type InterviewStringField } from "@/lib/candidate-intake";
import {
  composeWritingKitIntroduction, selectWritingKitQuestions,
  type WritingPreferences, type WritingStyle, type WritingKitState,
} from "@/lib/writing-ai";
import { getOnDeviceAiAvailability, generateCandidateIntroduction, generateInterviewCoaching } from "@/lib/on-device-ai";
import {introductionDocument,reviewIntroductionSource,type IntroductionReview} from "@/lib/introduction-review";
import "@/app/candidate-ai.css";

type AssistantTab = "introduction" | "coaching";
type AssistantEngine = "device" | "structure";
type Availability = "checking" | "available" | "downloadable" | "downloading" | "unavailable";
type Progress = { phase: "checking" | "downloading" | "generating"; downloadProgress?: number };
type Inputs = { candidateName: string; fields: InterviewFields; memo: string; reflection: string; preferences: WritingPreferences; style: WritingStyle };
type Preview = {
  kind: AssistantTab; engine: AssistantEngine; fingerprint: string; introductionAtStart: string;
  draft?: string; summary?: string; questions: string[]; actions: string[]; sourceLabels: string[];
  truncated: boolean; applied: boolean; generatedAt?: string; review?: IntroductionReview;
};

export type CandidateAiAssistantProps = {
  candidateName: string;
  fields: InterviewFields;
  memo?: string;
  introduction: string;
  onApplyIntroduction: (text: string) => void;
  disabled?: boolean;
  identityKey: string;
  preferences: WritingPreferences;
  onReadKit: (style: WritingStyle) => Promise<WritingKitState>;
  onGenerateKit: (style: WritingStyle) => Promise<WritingKitState>;
  onNotesChange?: (value: { memo: string; reflection: string }) => void;
  onSaveAdvice?: (text: string) => void;
  onFocusField?: (field:InterviewStringField) => void;
};

const localError = (error: unknown): string => {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const phase = error && typeof error === "object" && "phase" in error ? error.phase : "";
  if(code==="INVALID_RESPONSE"&&error&&typeof error==="object"&&"evidenceIssues" in error&&Array.isArray(error.evidenceIssues)){
    const labels:Record<string,string>={"source-number":"原文にない数値・期間","source-tool":"原文にない使用ツール","availability-as-start":"稼働開始可能日を開始済みとする表現","time-unit-changed":"月間・週間の時間数の取り違え","employment-type":"原文にない雇用形態","rate-unit-changed":"時給・月額などの単位の取り違え","self-report-removed":"本人申告という出所の省略","metric-period-changed":"日次・月次など実績の集計単位の変更","metric-qualifier-changed":"最大・平均・目標・実績の取り違え","experience-negation-changed":"未経験・未使用という記録と異なる表現","company-metric-changed":"会社ごとの実績の取り違え","metric-context-changed":"数値が表す業務・実績の取り違え","source-achievement":"原文にない研修・資格・受賞・役職"};
    const issues=[...new Set(error.evidenceIssues.filter((value):value is string=>typeof value==="string"&&Object.hasOwn(labels,value)).map(value=>labels[value]))].slice(0,2);
    if(issues.length)return `AIの文章に${issues.join("・")}があるため、候補を採用せず止めました。原文と現在の文章は残っています。もう一度作成するか、入力を確認してください。`;
  }
  if (code === "TIMEOUT" && phase === "preparation") return "AIモデルの準備に時間がかかったため、待機を終了しました。入力内容と現在の文章は残っています。もう一度作成すると、Chromeの準備状況を確認して進められます。";
  if (code === "TIMEOUT" && phase === "generation") return "文章の作成に時間がかかったため中止しました。入力内容と現在の文章は残っています。もう一度作成できます。";
  return ({ UNAVAILABLE: "このブラウザでは端末AIを利用できません。『AI文章構成』を選ぶと、候補者情報を送らずに作成できます。",
    ABORTED: "作成をキャンセルしました。入力内容と現在の文章は残っています。",
    TIMEOUT: "端末AIの応答に時間がかかっています。入力内容は残っています。少し待ってから再度お試しください。",
    INVALID_INPUT: "入力内容を確認してください。長いメモは短くしてから、再度お試しください。",
    INVALID_RESPONSE: "端末AIの文章を確認できませんでした。現在の文章は変更していません。",
    MODEL_ERROR: "端末AIを実行できませんでした。モデルの準備が終わってから再度お試しください。" } as Record<string, string>)[code]
    || "端末AIを実行できませんでした。入力内容と現在の文章は残っています。";
};
const fingerprint = (input: Inputs): string => JSON.stringify({ ...input,
  fields: Object.fromEntries(Object.entries(input.fields).filter(([key]) => key !== "interviewAdvice")),
});
const safeCopy = async (value: string) => {
  if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
  await navigator.clipboard.writeText(value);
};

/** Private input is used by the device only. Cloud callbacks accept a fixed style enum. */
export function CandidateAiAssistant(props: CandidateAiAssistantProps) {
  return <CandidateAiAssistantSession key={props.identityKey} {...props}/>;
}

function CandidateAiAssistantSession({ candidateName, fields, memo = "", introduction, onApplyIntroduction,
  disabled = false, identityKey, preferences, onReadKit, onGenerateKit, onNotesChange, onSaveAdvice,onFocusField }: CandidateAiAssistantProps) {
  const id = useId();
  const [tab, setTab] = useState<AssistantTab>("introduction");
  const [engine, setEngine] = useState<AssistantEngine>("structure");
  const [style, setStyle] = useState<WritingStyle>("standard");
  const [memoInput, setMemoInput] = useState(fields.interviewMemo || memo);
  const [reflection, setReflection] = useState(fields.selfReflection || "");
  const [availability, setAvailability] = useState<Availability>("checking");
  const [kitState, setKitState] = useState<WritingKitState | null>(null);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runningEngine, setRunningEngine] = useState<AssistantEngine>("structure");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [previousIntroduction,setPreviousIntroduction]=useState<string|null>(null);
  const generation = useRef(0);
  const readGeneration = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const active = useRef(true);
  const currentIdentity = useRef(identityKey);
  const memoTouched = useRef(false);
  const reflectionTouched = useRef(false);
  const engineTouched = useRef(false);
  const readKit = useRef(onReadKit);
  readKit.current = onReadKit;
  currentIdentity.current = identityKey;

  const currentInputs: Inputs = { candidateName, fields, memo: memoInput, reflection, preferences, style };
  const currentFingerprint = fingerprint(currentInputs);
  const stale = !!preview && preview.fingerprint !== currentFingerprint;
  const currentReview=reviewIntroductionSource(fields,[candidateName]);
  const editedAfterStart = !!preview && introduction !== preview.introductionAtStart && introduction !== preview.draft;
  const supported = availability !== "checking" && availability !== "unavailable";
  const kitAvailable = !!kitState?.kit && kitState.kit.style === style && kitState.kit.preferenceVersion === preferences.version;
  const profilePresent = Object.values(fields).some(value => Array.isArray(value) ? value.length > 0 : value.trim());
  const sourcePresent = !!candidateName.trim() || profilePresent;
  const deviceInputPresent = tab === "introduction" ? !!candidateName.trim() && (profilePresent || !!memoInput.trim()) : profilePresent || !!memoInput.trim() || !!reflection.trim();
  const hasQuota = !kitState || kitState.usage.userRemaining > 0 && kitState.usage.teamRemaining > 0;
  const canGenerate = !disabled && !running && !(engine === "structure" && reading) && (tab === "coaching" ? sourcePresent || !!memoInput.trim() || !!reflection.trim() : sourcePresent)
    && (engine === "device" ? supported && deviceInputPresent : (kitState?.configured !== false || kitAvailable) && (kitAvailable || hasQuota));

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void getOnDeviceAiAvailability({ signal: controller.signal, timeoutMs: 8000 }).then(value => {
      if (active.current && !controller.signal.aborted) {
        setAvailability(value);
        if (!engineTouched.current) setEngine(value === "unavailable" ? "structure" : "device");
      }
    }).catch(() => {
      if (active.current && !controller.signal.aborted) {
        setAvailability("unavailable");
        if (!engineTouched.current) setEngine("structure");
      }
    });
    return () => { active.current = false; controller.abort(); pending.current?.abort(); generation.current++; readGeneration.current++; };
  }, []);

  useEffect(() => {
    generation.current++; readGeneration.current++; pending.current?.abort(); pending.current = null;
    setRunning(false); setProgress(null); setPreview(null); setPreviousIntroduction(null); setError(""); setNotice(""); setCopied(false); setReplaceConfirm(false);
    setMemoInput(fields.interviewMemo || memo); memoTouched.current = false; setReflection(fields.selfReflection || ""); reflectionTouched.current = false;
  }, [identityKey]); // A new candidate or login must never inherit private drafts or late AI results.

  useEffect(() => { if (!memoTouched.current) setMemoInput(fields.interviewMemo || memo); }, [memo, fields.interviewMemo]);
  useEffect(() => { if (!reflectionTouched.current) setReflection(fields.selfReflection || ""); }, [fields.selfReflection]);

  useEffect(() => {
    const request = ++readGeneration.current, identity = identityKey;
    let disposed = false;
    setReading(true); setKitState(null);
    void readKit.current(style).then(state => {
      if (!disposed && active.current && request === readGeneration.current && currentIdentity.current === identity) setKitState(state);
    }).catch(() => {
      if (!disposed && active.current && request === readGeneration.current && currentIdentity.current === identity) setNotice("保存済みのAI構成を読み込めませんでした。入力内容は残っています。作成ボタンから再度確認できます。");
    }).finally(() => {
      if (!disposed && active.current && request === readGeneration.current && currentIdentity.current === identity) setReading(false);
    });
    return () => { disposed = true; };
  }, [style, identityKey, preferences.version]);

  function cancel() {
    generation.current++; pending.current?.abort(); pending.current = null;
    setRunning(false); setProgress(null); setError("");
    setNotice(runningEngine === "device" ? "作成をキャンセルしました。入力内容と現在の文章は残っています。" : "作成をキャンセルしました。結果が保存された場合は、保存済みの構成を再取得できます。");
  }

  async function generate() {
    if (!canGenerate || pending.current) return;
    engineTouched.current = true;
    const request = ++generation.current, identity = identityKey, controller = new AbortController();
    pending.current = controller;
    // Capture immutable input once; edits during generation remain separate from the result.
    const input: Inputs = { candidateName, fields: normalizeInterviewFields(fields), memo: memoInput, reflection,
      preferences: structuredClone(preferences), style };
    const kind = tab, selectedEngine = engine, originalIntroduction = introduction, signature = fingerprint(input);
    const current = () => active.current && !controller.signal.aborted && request === generation.current && currentIdentity.current === identity;
    setRunning(true); setRunningEngine(selectedEngine); setProgress({ phase: "checking" }); setError(""); setNotice(""); setCopied(false); setReplaceConfirm(false);
    try {
      let result: Preview;
      if (selectedEngine === "device") {
        const options = { signal: controller.signal, preparationTimeoutMs: 600000, timeoutMs: 120000, onProgress: (value: Progress) => { if (current()) setProgress(value); } };
        if (kind === "introduction") {
          const value = await generateCandidateIntroduction({ candidateName: input.candidateName, profile: input.fields,
            memo: input.memo, preferences: input.preferences }, options);
          if (typeof value.draft !== "string" || !value.draft.trim() || unicodeLength(value.draft) > introductionLimit) throw { code: "INVALID_RESPONSE" };
          result = { kind, engine: selectedEngine, fingerprint: signature, introductionAtStart: originalIntroduction,
            draft: value.draft, review:reviewIntroductionSource(input.fields,[input.candidateName]), questions: [], actions: [], sourceLabels: ["入力した面談情報", ...(input.memo.trim() ? ["面談メモ"] : [])], truncated: false, applied: false };
        } else {
          const value = await generateInterviewCoaching({ candidateName: input.candidateName, profile: input.fields,
            memo: input.memo, selfReflection: input.reflection }, options);
          result = { kind, engine: selectedEngine, fingerprint: signature, introductionAtStart: originalIntroduction,
            summary: value.summary, questions: value.questions, actions: value.actions,
            sourceLabels: ["入力した面談情報", ...(input.memo.trim() ? ["面談メモ"] : []), ...(input.reflection.trim() ? ["自分の振り返り"] : [])], truncated: false, applied: false };
        }
        if (current()) setAvailability("available");
      } else {
        // Only the allowlisted style crosses this boundary. Private input stays here.
        const state = kitAvailable ? kitState! : await onGenerateKit(input.style);
        if (!current()) return;
        setKitState(state);
        if (!state.kit || state.kit.style !== input.style) throw new Error(state.pending ? "AI構成を作成中です。少し待ってから保存済みの構成を再取得してください。" : "AI構成を取得できませんでした。入力内容は残っています。");
        if (state.kit.preferenceVersion !== input.preferences.version) throw new Error("共有の書式設定が更新されました。最新の設定を取得してから作成し直してください。現在の文章は残っています。");
        if (kind === "introduction") {
          const value = composeWritingKitIntroduction(input.candidateName, input.fields, state.kit, input.preferences);
          result = { kind, engine: selectedEngine, fingerprint: signature, introductionAtStart: originalIntroduction,
            draft: value.text, review:reviewIntroductionSource(input.fields,[input.candidateName]), questions: [], actions: [], sourceLabels: ["入力した面談情報を端末内で整理", "保存した共通書式"], truncated: value.truncated, applied: false };
        } else {
          const value = selectWritingKitQuestions(state.kit, { fields: input.fields, memo: input.memo, reflection: input.reflection });
          result = { kind, engine: selectedEngine, fingerprint: signature, introductionAtStart: originalIntroduction,
            questions: value.questions, actions: value.actions, sourceLabels: value.sourceLabels, truncated: false, applied: false };
        }
      }
      if (current()) { setPreview({ ...result, generatedAt: new Date().toISOString() }); setNotice("作成しました。入力した事実と照らし合わせて確認してください。"); }
    } catch (value) {
      if (current()) setError(selectedEngine === "device" ? localError(value) : value instanceof Error ? value.message : "AI構成を作成できませんでした。入力内容と現在の文章は残っています。");
    } finally {
      if (current()) { setRunning(false); setProgress(null); pending.current = null; }
    }
  }

  async function refreshKit() {
    const request = ++readGeneration.current, identity = identityKey;
    setReading(true); setError(""); setNotice("");
    try { const state = await onReadKit(style); if (active.current && request === readGeneration.current && currentIdentity.current === identity) { setKitState(state); setNotice(state.kit ? "保存済みのAI構成を取得しました。作成ボタンで現在の入力に使えます。" : "保存済みのAI構成はまだありません。"); } }
    catch { if (active.current && request === readGeneration.current && currentIdentity.current === identity) setError("保存済みのAI構成を取得できませんでした。少し待って再度お試しください。"); }
    finally { if (active.current && request === readGeneration.current && currentIdentity.current === identity) setReading(false); }
  }

  function apply() {
    if (!preview?.draft || stale || disabled || running || unicodeLength(preview.draft) > introductionLimit) return;
    if (introduction.trim() && introduction !== preview.draft && !replaceConfirm) { setReplaceConfirm(true); return; }
    setPreviousIntroduction(introduction); onApplyIntroduction(preview.draft); setPreview({ ...preview, applied: true }); setReplaceConfirm(false); setNotice("現在の紹介文に反映しました。保存はまだ行っていません。");
  }
  async function copyPreview() {
    if (!preview || stale) return;
    const value = preview.draft ?? [preview.summary || "", "面談で確認すること", ...preview.questions.map((text, index) => `${index + 1}. ${text}`), "次の行動", ...preview.actions.map((text, index) => `${index + 1}. ${text}`)].filter(Boolean).join("\n");
    try { await safeCopy(value); setCopied(true); setError(""); }
    catch { setError("コピーできませんでした。下の文章を選択してコピーしてください。"); }
  }

  async function copyNotes() {
    try { await safeCopy(["面談メモ", memoInput, "", "自分の振り返り", reflection].join("\n")); setNotice("作成用のメモと振り返りをコピーしました。"); setError(""); }
    catch { setError("コピーできませんでした。入力したメモを選択してコピーしてください。"); }
  }

  function saveAdvice() {
    if (!preview || preview.kind !== "coaching" || stale || disabled || running || !onSaveAdvice) return;
    const created = preview.generatedAt ? new Date(preview.generatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";
    const value = ["面談準備・振り返り", created ? `作成日時：${created}（日本時間）` : "", preview.engine === "device" ? "端末AIが入力を読んで作成" : "端末内で分類し、AIの質問例から選択", "", preview.summary || "",
      "面談で確認すること", ...preview.questions.map((line, index) => `${index + 1}. ${line}`), "", "次の行動", ...preview.actions.map((line, index) => `${index + 1}. ${line}`),
      "", `もとにした情報：${preview.sourceLabels.join("・")}`].filter((line, index, lines) => line || index > 0 && lines[index - 1]).join("\n");
    if (unicodeLength(value) > 5000) { setError("準備案が5000文字を超えるため、保存欄は変更していません。結果をコピーし、必要な内容に絞って保存欄へ入力してください。"); return; }
    onSaveAdvice(value); setNotice("準備案を保存欄に反映しました。内容を確認し、基本情報を保存すると残せます。"); setError("");
  }

  function renderReview(review:IntroductionReview,generated:boolean){
    return <aside className="candidate-ai-review" aria-label={generated?"紹介文の確認と整理内容":"作成前の入力チェック"}>
      <div className="candidate-ai-review-heading"><strong>{generated?"本文と分けて確認すること":"作成前の入力チェック"}</strong><span>{review.checks.length?`${review.checks.length}件の確認事項`:"入力の矛盾・単位を確認"}</span></div>
      {review.checks.length>0?<ul>{review.checks.map(check=><li key={check.code}><strong>{check.title}</strong><p>{check.detail}</p>{onFocusField&&<button type="button" className="text-button" disabled={disabled||running} onClick={()=>onFocusField(check.fields[0])}>該当する入力を確認</button>}</li>)}</ul>:<p>機械的な入力チェックでは、明らかな時間の矛盾や単価の単位不足は見つかりませんでした。共有前に原文と照合してください。</p>}
      {review.revisions.length>0&&<details className="candidate-ai-revisions"><summary>表記を整理した箇所（{review.revisions.length}項目）</summary><p>共有文に使う表記の案です。元の入力は書き換えていません。</p>{review.revisions.map(item=><div key={item.field}><h5>{item.label}</h5><dl><dt>原文</dt><dd>{item.before}</dd><dt>整理案</dt><dd>{item.after}</dd></dl></div>)}</details>}
      {review.notes.length>0&&<details className="candidate-ai-review-notes"><summary>事実の取り扱い</summary><ul>{review.notes.map((note,index)=><li key={index}>{note}</li>)}</ul></details>}
    </aside>;
  }

  const progressLabel = progress?.phase === "downloading" ? (progress.downloadProgress === 1 ? "端末AIを起動中" : "端末AIをダウンロード中") : progress?.phase === "generating" ? "端末AIで作成中" : runningEngine === "device" ? "端末AIを準備中" : "AI文章構成を作成中";
  return <section className="candidate-ai" aria-labelledby={`${id}-title`}>
    <header className="candidate-ai-heading"><div><h3 id={`${id}-title`}><Sparkles size={18}/>伝わる紹介文を作り、次の面談を準備</h3><p>作成した結果は別に表示します。確認してから紹介文に反映できます。</p></div></header>
    <div className="candidate-ai-tabs" role="group" aria-label="AIで準備する内容">
      <button type="button" aria-pressed={tab === "introduction"} className={tab === "introduction" ? "selected" : ""} onClick={() => { setTab("introduction"); setReplaceConfirm(false); }}><FileText size={16}/>紹介文</button>
      <button type="button" aria-pressed={tab === "coaching"} className={tab === "coaching" ? "selected" : ""} onClick={() => { setTab("coaching"); setReplaceConfirm(false); }}>面談準備・振り返り</button>
    </div>
    {tab === "introduction" && <p className="candidate-ai-method">共通の紹介文ルールと保存済みの書式を毎回使います。参考文の再入力は不要です。端末AIが経歴・実績・条件を整理し、総評を自然な文章につなぎます。入力原文は変更しません。</p>}
    <div className="candidate-ai-engine" role="group" aria-label="AIの実行方法">
      <button type="button" aria-pressed={engine === "device"} className={engine === "device" ? "selected" : ""} onClick={() => { engineTouched.current = true; setEngine("device"); }}><Monitor size={17}/><span><strong>端末AI</strong><small>対応するPCブラウザ</small></span></button>
      <button type="button" aria-pressed={engine === "structure"} className={engine === "structure" ? "selected" : ""} onClick={() => { engineTouched.current = true; setEngine("structure"); }}><Sparkles size={17}/><span><strong>書式で下書き</strong><small>PC・スマートフォン</small></span></button>
    </div>
    {engine === "device" ? <div className="candidate-ai-method"><p>入力した事実を端末AIが読み、意味を保ちながら自然な日本語へ組み直します。ひらがなの業務用語は整理し、人名・社名の漢字は推測しません。候補者情報を外部AIへ送りません。</p>
      {availability === "checking" && <p role="status">このブラウザで端末AIを使えるか確認中です。</p>}
      {availability === "unavailable" && <p className="candidate-ai-warning" role="status">この端末・ブラウザでは端末AIを利用できません。対応するPC版Chromeなどで開くか、「AI文章構成」を選んでください。候補者情報をクラウドAIへ送る切り替えは行いません。</p>}
      {(availability === "downloadable" || availability === "downloading") && <p className="candidate-ai-warning"><Download size={16}/>初回はAIモデルをダウンロードするため、準備に数分かかることがあります。途中でキャンセルできます。下の作成ボタンを押すと準備を開始します。</p>}
    </div> : <div className="candidate-ai-method"><p>GoogleのAIで保存した共通書式・質問例を使い、面談情報はこの端末で整理します。個別の文章をAIが書き直す方式とは分けて表示します。Googleへ送るのは「標準／簡潔」と共通書式の固定設定だけです。</p><p>{tab === "coaching" ? "メモのキーワードを端末内で分類し、AIが作った質問例から選びます。個別のメモをAIが読んだ助言とは区別して表示します。" : "業務用語の表記だけを整理し、未確認の単価や矛盾する条件は本文から省いて確認欄に表示します。入力にない事実や評価は補いません。文章全体の自然な書き直しには端末AIを選んでください。"}</p>
      <label className="candidate-ai-style" htmlFor={`${id}-style`}>文章の長さ<select id={`${id}-style`} value={style} onChange={event => setStyle(event.target.value as WritingStyle)}><option value="standard">標準</option><option value="concise">簡潔</option></select></label>
      {kitState?.configured === false && !kitAvailable && <p className="candidate-ai-warning">AI文章構成の接続が未設定です。入力と端末内の整形は引き続き使えます。</p>}
      {kitState?.pending && <p className="candidate-ai-warning">この構成を別の画面で作成中です。少し待って「保存済みを再取得」を押してください。</p>}
      {kitState?.usage && <p className="candidate-ai-usage">本日の新規作成：あなた 残り{kitState.usage.userRemaining}回 · チーム 残り{kitState.usage.teamRemaining}回。保存済みの構成は再利用できます。</p>}
      {!hasQuota && !kitAvailable && <p className="candidate-ai-warning">本日の新規作成の上限です。保存済みの構成を再取得するか、端末AIを利用できます。回数は翌日の0時に戻ります。</p>}
    </div>}
    {tab === "coaching" && <div className="candidate-ai-notes"><label htmlFor={`${id}-memo`}>候補者・面談についてのメモ<textarea id={`${id}-memo`} rows={4} maxLength={2000} disabled={disabled} value={memoInput} onChange={event => { const value = event.target.value; memoTouched.current = true; setMemoInput(value); onNotesChange?.({ memo: value, reflection }); }} placeholder="確認できた事実、まだ分からないこと、本人から聞いた希望など"/></label><label htmlFor={`${id}-reflection`}>自分の振り返り・次に相談したいこと<textarea id={`${id}-reflection`} rows={3} maxLength={2000} disabled={disabled} value={reflection} onChange={event => { const value = event.target.value; reflectionTouched.current = true; setReflection(value); onNotesChange?.({ memo: memoInput, reflection: value }); }} placeholder="聞き方を変えたいこと、うまくいった確認方法、次回準備したいことなど"/></label><p>{onNotesChange ? "メモと振り返りは、基本情報を保存すると残せます。次回もこの画面で確認・編集できます。" : "ここで加えたメモと振り返りは作成用です。閉じると消えるため、残したい内容はコピーして記録してください。"}</p><div><button type="button" className="secondary-button" disabled={!memoInput.trim() && !reflection.trim()} onClick={() => void copyNotes()}><Copy size={15}/>このメモをコピー</button></div>
      {onSaveAdvice && <label className="candidate-ai-saved-advice" htmlFor={`${id}-saved-advice`}>保存した前回の準備案<textarea id={`${id}-saved-advice`} rows={7} maxLength={5000} disabled={disabled} value={fields.interviewAdvice || ""} onChange={event => onSaveAdvice(event.target.value)} placeholder="作成した準備案を確認して保存欄へ反映すると、ここに表示されます。直接の入力・編集もできます。"/><small>前回保存した内容です。今の面談情報と一致するとは限りません。変更後は基本情報を保存してください。</small></label>}
    </div>}
    {tab==="introduction"&&!preview&&renderReview(currentReview,false)}
    <div className="candidate-ai-actions"><button type="button" className="primary-button" disabled={!canGenerate} onClick={() => void generate()}>{running ? <LoaderCircle size={16} className="candidate-ai-spin"/> : <Sparkles size={16}/>}{running ? progressLabel : engine === "device" ? (availability === "downloadable" || availability === "downloading" ? "モデルを準備して作成" : tab === "introduction" ? "文章をAIで整理・仕上げる" : "端末AIで次の対応を作成") : kitAvailable ? "保存した書式で下書き" : "書式を取得して下書き"}</button>
      {running && <button type="button" className="secondary-button" onClick={cancel}><X size={16}/>キャンセル</button>}
      {engine === "structure" && <button type="button" className="text-button" disabled={reading || running} onClick={() => void refreshKit()}>{reading ? "取得中…" : "保存済みを再取得"}</button>}
    </div>
    {running && <div className="candidate-ai-progress" role="status"><span>{progressLabel}。入力や画面の移動は続けられます。</span>{progress?.phase === "downloading" && typeof progress.downloadProgress === "number" && <progress max={1} value={Math.min(1, Math.max(0, progress.downloadProgress))} aria-label="AIモデルのダウンロード"/>}</div>}
    {notice && <p className="candidate-ai-notice" role="status">{notice}</p>}{error && <p className="candidate-ai-error" role="alert">{error}</p>}
    {preview && <section className="candidate-ai-preview" aria-labelledby={`${id}-preview`}><header><div><h4 id={`${id}-preview`}>{preview.kind === "introduction" ? "共有する紹介文の候補" : "次の面談への準備"}</h4><p>{preview.engine === "device" ? "端末AIが入力を読み直し、整理・再構成" : preview.kind === "introduction" ? "共通書式＋端末内の表記整理（個別文章のAI生成は未使用）" : "メモを端末内で分類し、AIの質問例から選択"}</p></div><button type="button" className="secondary-button" disabled={stale} onClick={() => void copyPreview()}>{copied ? <Check size={15}/> : <Copy size={15}/>}{copied ? "コピー済み" : "コピー"}</button></header>
      {stale && <p className="candidate-ai-warning" role="status">作成後に入力・設定が変わりました。これは変更前の結果です。現在の入力で作成し直すと、紹介文への反映とコピーができます。</p>}
      {editedAfterStart && !stale && <p className="candidate-ai-warning">作成中に現在の紹介文が編集されました。編集した文章は保持しています。「この文章を使う」で置き換える前に比較してください。</p>}
      {preview.summary && <p className="candidate-ai-summary">{preview.summary}</p>}
      {preview.review&&renderReview(preview.review,true)}
      {preview.draft !== undefined && <div className="candidate-ai-draft" tabIndex={0} aria-label="クライアント共有用の本文">{preview.draft ? introductionDocument(preview.draft).map((section,index)=><section className="candidate-ai-document-section" key={index}>{section.heading&&<h5>{section.heading}</h5>}<p>{section.body}</p></section>) : "紹介文に含める情報がありません。面談情報を入力してください。"}</div>}
      {preview.questions.length > 0 && <div><h5>面談で確認すること</h5><ol>{preview.questions.map((text, index) => <li key={index}>{text}</li>)}</ol></div>}
      {preview.actions.length > 0 && <div><h5>次の行動</h5><ol>{preview.actions.map((text, index) => <li key={index}>{text}</li>)}</ol></div>}
      {preview.sourceLabels.length > 0 && <p className="candidate-ai-sources">もとにした情報：{preview.sourceLabels.join("・")}</p>}
      {preview.truncated && <p className="candidate-ai-warning">1000文字以内に収めるため、一部を省略しています。面談情報の原文は残っています。</p>}
      {preview.draft && <div className="candidate-ai-apply">{replaceConfirm && <p role="alert">現在の紹介文をこの候補に置き換えます。面談情報の原文は保持します。</p>}<div><button type="button" className="primary-button" disabled={disabled || running || stale || preview.applied} onClick={apply}>{preview.applied ? <><Check size={16}/>現在の紹介文に反映済み</> : replaceConfirm ? "確認して置き換える" : "この文章を使う"}</button>{replaceConfirm && <button type="button" className="secondary-button" onClick={() => setReplaceConfirm(false)}>現在の文章を残す</button>}</div>{preview.applied&&previousIntroduction!==null&&<button type="button" className="secondary-button" disabled={disabled||running||introduction!==preview.draft} onClick={()=>{if(disabled||running||introduction!==preview.draft)return;onApplyIntroduction(previousIntroduction);setPreviousIntroduction(null);setPreview({...preview,applied:false});setNotice("採用前の紹介文に戻しました。入力した面談情報は変更していません。");}}>採用前の文章に戻す</button>}<small>反映後、基本情報を保存するとスプレッドシートにも残せます。</small></div>}
      {preview.kind === "coaching" && onSaveAdvice && <div className="candidate-ai-apply"><button type="button" className="primary-button" disabled={disabled || running || stale} onClick={saveAdvice}>この準備案を保存欄に反映</button><small>前回の準備案は置き換わります。反映後、基本情報を保存するとスプレッドシートにも残せます。</small></div>}
      <p className="candidate-ai-final-note">候補者の適性や採否を判断する機能ではありません。入力した事実にない内容は使わず、共有前に内容を確認してください。</p>
    </section>}
  </section>;
}
