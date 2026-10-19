"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, FileText } from "lucide-react";
import {
  chatOptions, composeCandidateIntroduction, crmOptions, genderOptions, introductionLimit,
  interviewFieldLabels, interviewFieldLimits, pcOptions, unicodeLength,
  type InterviewFields, type InterviewStringField, type IntroductionComposition,
} from "@/lib/candidate-intake";
import "@/app/intake.css";
import { CandidateAiAssistant } from "@/components/candidate-ai-assistant";
import type { CandidateAiConnection } from "@/lib/writing-ai";

export type InterviewIntakeEditorProps = {
  candidateName: string;
  fields: InterviewFields;
  onFieldsChange: (fields: InterviewFields) => void;
  introduction: string;
  onIntroductionChange: (introduction: string) => void;
  disabled?: boolean;
  ai?: CandidateAiConnection;
  memo?: string;
};

/** Inline content: the parent supplies the dialog and save operation. */
export function InterviewIntakeEditor({ candidateName, fields, onFieldsChange, introduction,
  onIntroductionChange, disabled = false, ai, memo }: InterviewIntakeEditorProps) {
  const id = useId();
  const [formatResult, setFormatResult] = useState<IntroductionComposition | null>(null);
  const [formatSource, setFormatSource] = useState("");
  const [replaceDraft, setReplaceDraft] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [inputError, setInputError] = useState("");
  const autoManaged = useRef(!introduction.trim());
  const currentSource = JSON.stringify([candidateName, fields]);
  // Only the untouched immediate template follows input. User/AI drafts are explicit.
  useEffect(() => {
    if (!autoManaged.current || disabled) return;
    const timer = setTimeout(() => {
      const result = composeCandidateIntroduction(candidateName, fields);
      if (result.text !== introduction) onIntroductionChange(result.text);
      setFormatResult(result); setFormatSource(currentSource);
    }, 250);
    return () => clearTimeout(timer);
  }, [currentSource, introduction, disabled, onIntroductionChange]);
  const changedAfterFormat = !!formatResult && formatSource !== currentSource;
  const set = (key: InterviewStringField, value: string) => onFieldsChange({ ...fields, [key]: value });
  const field = (key: InterviewStringField, options?: { placeholder?: string; multiline?: boolean; maxLength?: number; hint?: string; inputMode?: "numeric" }) => {
    const fieldId = `${id}-${key}`, hintId = `${fieldId}-hint`;
    return <label className={options?.multiline ? "intake-field intake-wide" : "intake-field"} htmlFor={fieldId} key={key}>
      <span>{interviewFieldLabels[key]} <small>任意</small></span>
      {options?.multiline ? <textarea id={fieldId} rows={key === "workHistory" ? 6 : 3} value={fields[key]}
        maxLength={Math.min(options.maxLength ?? interviewFieldLimits[key],interviewFieldLimits[key])} placeholder={options.placeholder} onChange={event => set(key, event.target.value)}
        aria-describedby={options.hint ? hintId : undefined}/>
        : <input id={fieldId} value={fields[key]} maxLength={Math.min(options?.maxLength ?? interviewFieldLimits[key],interviewFieldLimits[key])} placeholder={options?.placeholder}
          inputMode={options?.inputMode} onChange={event => set(key, event.target.value)}
          aria-describedby={options?.hint ? hintId : undefined}/>}
      {options?.hint && <small id={hintId} className="intake-hint">{options.hint}</small>}
    </label>;
  };
  function toggle(key: "crmTools" | "chatTools", value: string) {
    onFieldsChange({ ...fields, [key]: fields[key].includes(value) ? fields[key].filter(item => item !== value) : [...fields[key], value] });
  }
  function format() {
    autoManaged.current = false;
    const result = composeCandidateIntroduction(candidateName, fields);
    onIntroductionChange(result.text); setFormatResult(result); setFormatSource(currentSource);
    setReplaceDraft(false); setInputError(""); setCopied(false); setCopyError("");
  }
  function requestFormat() {
    const result = composeCandidateIntroduction(candidateName, fields);
    if (introduction.trim() && introduction !== result.text) setReplaceDraft(true);
    else format();
  }
  async function copy() {
    setCopyError(""); setCopied(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(introduction); setCopied(true);
    } catch { setCopyError("コピーできませんでした。文章を選択してコピーしてください。"); }
  }
  return <div className="interview-intake">
    <p className="intake-context">{candidateName || "この候補者"}の面談情報をまとめます。分かる項目だけ入力してください。</p>
    <fieldset disabled={disabled} className="intake-section"><legend>基本情報・稼働条件</legend><div className="intake-grid">
      {field("age", { inputMode: "numeric", maxLength: 20 })}
      <label className="intake-field" htmlFor={`${id}-gender`}><span>性別 <small>任意</small></span><select id={`${id}-gender`} value={fields.gender} onChange={event => set("gender", event.target.value)}>{genderOptions.map(option => <option key={option} value={option}>{option || "未回答"}</option>)}</select></label>
      {field("residence", { placeholder: "都道府県・市区町村など" })}
      {field("availableFrom", { placeholder: "即日／2026年11月から など" })}
      {field("timeWindow", { placeholder: "平日 9:00〜17:00 など" })}
      {field("daysPerWeek", { placeholder: "週3日／曜日相談 など" })}
      {field("monthlyHours", { placeholder: "月80時間 など" })}
      {field("workStyle", { placeholder: "業務委託／在宅 など" })}
      {field("sideJob", { placeholder: "副業なし／本業と兼業 など" })}
      {field("desiredHourlyRate", { placeholder: "2,000円/時 など", hint: "円/時・円/月など、単位も入力してください。" })}
      {field("attendanceConcerns", { multiline: true, maxLength: 400, placeholder: "稼働上の配慮・事前に確認したいことなど", hint: "社内確認用として保存し、共有文に自動挿入しません。" })}
    </div></fieldset>

    <fieldset disabled={disabled} className="intake-section"><legend>営業経験・実績</legend><div className="intake-grid">
      {field("workHistory", { multiline: true, maxLength: 6000, placeholder: "経験期間／商材／営業手法／担当した業務など。複数の職歴をそのまま入力できます。", hint: "入力内容をもとに文章を整えます。実績や評価は追加しません。" })}
      {field("achievements", { multiline: true, maxLength: 1500, placeholder: "架電数・アポ率・過去の順位など、確認できた実績" })}
      {field("strengths", { multiline: true, maxLength: 1500, placeholder: "本人が話した強み・面談で確認できたことなど" })}
    </div></fieldset>

    <fieldset disabled={disabled} className="intake-section"><legend>PC・使用ツール</legend><div className="intake-grid">
      <label className="intake-field" htmlFor={`${id}-pc`}><span>PC環境 <small>任意</small></span><select id={`${id}-pc`} value={fields.pcEnvironment} onChange={event => set("pcEnvironment", event.target.value)}><option value="">未確認</option>{pcOptions.map(option => <option key={option}>{option}</option>)}</select></label>
      {field("networkEnvironment", { placeholder: "光回線／Wi-Fiなど" })}
      {field("pcSkills", { multiline: true, maxLength: 400, placeholder: "タイピング、表計算、オンライン面談の操作など" })}
      <div className="intake-tool-group intake-wide" role="group" aria-labelledby={`${id}-crm-label`}><span id={`${id}-crm-label`}>CRM経験 <small>複数選択可</small></span><div className="intake-checks">{crmOptions.map(option => <label key={option}><input type="checkbox" checked={fields.crmTools.includes(option)} onChange={() => toggle("crmTools", option)}/><span>{option}</span></label>)}</div>{(fields.crmTools.includes("その他") || !!fields.crmOther) && field("crmOther", { placeholder: "使用したCRM名" })}</div>
      <div className="intake-tool-group intake-wide" role="group" aria-labelledby={`${id}-chat-label`}><span id={`${id}-chat-label`}>チャット経験 <small>複数選択可</small></span><div className="intake-checks">{chatOptions.map(option => <label key={option}><input type="checkbox" checked={fields.chatTools.includes(option)} onChange={() => toggle("chatTools", option)}/><span>{option}</span></label>)}</div>{(fields.chatTools.includes("その他") || !!fields.chatOther) && field("chatOther", { placeholder: "使用したチャット名" })}</div>
    </div></fieldset>

    <fieldset disabled={disabled} className="intake-section"><legend>面談可能日</legend><div className="intake-grid">{field("interviewAvailability", { multiline: true, maxLength: 400, placeholder: "候補日・時間帯・調整が必要な条件など" })}</div></fieldset>

    <fieldset disabled={disabled} className="intake-section"><legend>その他・補足</legend><div className="intake-grid">{field("additionalNotes", { multiline: true, maxLength: 2000, placeholder: "他の項目に当てはまらない情報、元シートの補足など。出所の行番号もそのまま残せます。", hint: "元の記載を社内確認用として保存し、共有文に自動挿入しません。内容や評価を推測して追加しません。" })}</div></fieldset>

    {ai?.enabled && <CandidateAiAssistant candidateName={candidateName} fields={fields} memo={memo}
      introduction={introduction} disabled={disabled} identityKey={ai.identityKey}
      preferences={ai.preferences} onReadKit={ai.onReadKit} onGenerateKit={ai.onGenerateKit}
      onNotesChange={({memo: note,reflection})=>onFieldsChange({...fields,interviewMemo:note,selfReflection:reflection})}
      onSaveAdvice={text=>onFieldsChange({...fields,interviewAdvice:text})}
      onApplyIntroduction={text=>{autoManaged.current=false;setFormatResult(null);setCopied(false);onIntroductionChange(text);}}/>}
    <section className="intake-introduction" aria-labelledby={`${id}-intro-heading`}><div className="intake-introduction-heading"><div><h3 id={`${id}-intro-heading`}>クライアント共有用の基本情報</h3><p>入力中は基本情報の下書きを自動作成します。直接編集・AI案の採用後は上書きしません。</p></div><button type="button" className="secondary-button" disabled={disabled} onClick={requestFormat}><FileText size={16}/>入力から整形</button></div>
      <p className="intake-privacy">この整形は端末内で行います。外部AIには送信しません。</p>
      {replaceDraft && <div className="intake-replace" role="alert"><p>現在の編集文を、入力情報から整形し直します。</p><div><button type="button" className="secondary-button" disabled={disabled} onClick={() => setReplaceDraft(false)}>編集文を残す</button><button type="button" className="primary-button" disabled={disabled} onClick={format}>整形し直す</button></div></div>}
      {formatResult?.truncated && <p className="intake-notice" role="status">1000文字以内に収めるため、一部を省略しました。{formatResult.omittedFields.map(key => interviewFieldLabels[key]).join("・")}の入力原文は残っています。内容を確認して調整してください。</p>}
      {changedAfterFormat && <p className="intake-notice" role="status">面談情報を変更しました。共有用の文章は前回のままです。必要に応じて整形し直してください。</p>}
      <label className="intake-field" htmlFor={`${id}-introduction`}><span>基本情報の文章</span><textarea id={`${id}-introduction`} rows={13} value={introduction} disabled={disabled}
        placeholder="面談情報を入力し「入力から整形」を押すと、共有用の文章を作れます。直接の入力・修正もできます。"
        aria-describedby={`${id}-counter${inputError ? ` ${id}-input-error` : ""}`} onChange={event => {
          const value = event.target.value;
          if (unicodeLength(value) > introductionLimit) { setInputError("1000文字を超えるため、変更を反映していません。現在の文章を残しました。短くして入力してください。"); return; }
          autoManaged.current = false; setInputError(""); setCopied(false); onIntroductionChange(value);
        }}/></label>
      <div className="intake-copy-row"><span id={`${id}-counter`} className={unicodeLength(introduction) > introductionLimit ? "intake-error" : ""}>{unicodeLength(introduction).toLocaleString()} / {introductionLimit.toLocaleString()}文字</span><button type="button" className="secondary-button" disabled={!introduction.trim() || unicodeLength(introduction) > introductionLimit} onClick={() => void copy()}>{copied ? <Check size={16}/> : <Copy size={16}/>}{copied ? "コピー済み" : "文章をコピー"}</button></div>
      {inputError && <p className="intake-error" id={`${id}-input-error`} role="alert">{inputError}</p>}{copyError && <p className="intake-error" role="alert">{copyError}</p>}<span className="intake-sr-only" role="status">{copied ? "基本情報の文章をコピーしました" : ""}</span>
    </section>
  </div>;
}
