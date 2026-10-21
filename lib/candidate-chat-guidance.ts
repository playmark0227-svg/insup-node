import type { CandidateChatContext, CandidateChatSource } from "./candidate-chat.ts";
import { businessToday } from "./sheets-client.ts";

export type CandidateChatIntent = "missing-information" | "next-actions" | "summary" | "question";
type ChatHistory = Array<{ role: "user" | "assistant"; content: string }>;
type CandidateChatCheck = { field: string; reason: string; question: string; sourceIds: string[] };
export type CandidateChatGuidance = { intent: CandidateChatIntent; instruction: string; checks: CandidateChatCheck[] };

const normalized = (text: string) => text.normalize("NFKC").replace(/[\s\u3000]/g, "").toLowerCase();
const followup = /^(?:他には?|ほかには?|他にも|ほかにも|それ(?:を)?(?:もっと)?詳しく(?:教えて)?|もう少し詳しく(?:教えて)?|具体的には?|例えば|たとえば|続けて|続きを(?:教えて)?)[?？。!！]*$/;
const moreChecks = /^(?:他には?|ほかには?|他にも|ほかにも)[?？。!！]*$/;
const noFurtherChecks = "これまで提示した以外に追加すべき内容は、この範囲では特定できません。";

function explicitQuestion(question: string, history: ChatHistory): string {
  if (!followup.test(normalized(question))) return question;
  for (let index = history.length - 1; index >= Math.max(0, history.length - 30); index--) {
    const message = history[index];
    if (message.role === "user" && message.content.trim() && !followup.test(normalized(message.content))) return message.content;
  }
  return question;
}

function explicitIntent(question: string): CandidateChatIntent {
  const text = normalized(question);
  const asksSummary = /要約|まとめ|整理|概要|状況|全体像|どんな(?:人|候補者)|今どう|今の状態/.test(text);
  const excludesMissing = /不足(?:は|が)?(?:ない|なし)|不足(?:ではなく|じゃなく)|(?:追記|追加|不足確認|確認)(?:は|が)?(?:不要|いらない|要らない)|不足.*(?:聞いてない|聞いていない)|(?:概要|要約|まとめ|状況)(?:だけ|のみ)/.test(text);
  if (asksSummary && excludesMissing) return "summary";
  if (/次(?:に|は|回|の対応|の行動)|今後|これから|どう(?:進め|すれば|したら|動け)|何を(?:すれば|したら)|(?:対応|行動|進め方|連絡|準備).*(?:提案|教え|すべき|したら)|(?:提案|教え).*(?:対応|行動|進め方)/.test(text)
    && !/不足|足り|追記|追加|入れ(?:るべき|た(?:方|ほう)|たら)/.test(text)) return "next-actions";
  // Asking which data to add is different from asking for a profile summary.
  if (/不足|足り(?:る|ない|て(?:いる|る|ない|ます))|十分|不十分|抜け|欠け|追記|追加入力|追加す(?:る|べき)|追加した(?:方|ほう)|追加情報.*必要|もっと.*情報.*必要|入れ(?:るべき|とくべき|た(?:方|ほう)|たら|ると(?:いい|良い))|何(?:か|を).*入れ|他に.*(?:聞く|聞い|確認す|質問)|ほかに.*(?:聞く|聞い|確認す|質問)|(?:聞く|聞いておく|聞いておいた)(?:べき|方がいい|ほうがいい|こと|事|項目|情報)/.test(text)) return "missing-information";
  if (/次(?:に|は|回|の対応|の行動)|今後|これから|どう(?:進め|すれば|したら|動け)|(?:対応|行動|進め方|連絡|準備).*(?:提案|教え|すべき|したら)|(?:提案|教え).*(?:対応|行動|進め方)/.test(text)) return "next-actions";
  if (asksSummary) return "summary";
  return "question";
}

/** History can supply conversational intent, never candidate facts. */
export function classifyCandidateChatIntent(question: string, history: ChatHistory = []): CandidateChatIntent {
  return explicitIntent(explicitQuestion(question, history));
}

function requestedFields(question: string): Set<string> {
  const text = normalized(question), fields = new Set<string>();
  if (/単価|時給|報酬|給与|月給|月額/.test(text)) fields.add("希望単価");
  if (/経験|職歴|経歴|営業歴/.test(text)) fields.add("営業経験・職歴");
  if (/実績|成果|1位|一位|トップ/.test(text)) fields.add("実績");
  if (/時間帯|稼働時間|勤務時間|曜日|週.*(?:日|稼働)|月.*(?:時間|稼働)/.test(text)) for (const field of ["希望時間帯", "週の稼働日数", "月間稼働時間"]) fields.add(field);
  if (/面談(?:可能|日程|日時|候補日)|面談.*(?:空き|いつ)/.test(text)) fields.add("面談可能日");
  if (/稼働開始|いつから.*(?:稼働|働|勤務)|勤務開始|開始可能/.test(text)) fields.add("稼働開始");
  if (/pc環境|パソコン|端末/.test(text)) fields.add("PC環境");
  if (/通信|回線|ネット環境/.test(text)) fields.add("通信環境");
  if (/稼働形態|リモート|出社/.test(text)) fields.add("稼働形態");
  if (/希望条件|勤務条件|稼働条件/.test(text)) for (const field of ["希望単価", "稼働開始", "希望時間帯", "週の稼働日数", "月間稼働時間", "PC環境", "通信環境", "稼働形態"]) fields.add(field);
  return fields;
}

const value = (source: CandidateChatSource, field: string) => source.facts.find(fact => fact.label === field)?.value.trim() ?? "";
const uncertain = /^(?:未定|未確認|不明|確認中|調整中|要確認|応相談|未登録|未入力|[-—ー?？]+)$/;
const hasValue = (text: string) => !!text && !uncertain.test(text.normalize("NFKC").trim());
const quote = (text: string) => `「${text.replace(/[\r\n]+/g, " ").slice(0, 130)}${text.length > 130 ? "…" : ""}」`;
const partial = (source: CandidateChatSource) => source.facts.some(fact => fact.label === "省略" || /長文のため一部省略/.test(fact.value));

function hasPayUnit(text: string): boolean {
  const clean = text.normalize("NFKC").toLowerCase();
  if (/(?:単位|時給|月額|件単価).*(?:不明|未定|未確認)|(?:時給|月額).*(?:か|or).*(?:時給|月額)/.test(clean)) return false;
  return /時給|時間給|時間単価|月給|月額|日給|日額|週給|年俸|年収|件単価|1(?:案)?件|一件|(?:案)?件(?:当たり|あたり)|(?:1|一)\s*時間(?:につき|あたり|当たり)?\s*[\d,]+|(?:月|日|週|年)\s*[\d,]+\s*(?:円|万)|(?:\/|あたり|当たり)\s*(?:1\s*)?(?:時間|時|h(?:our)?|月|日|週|年|件)|[\d,]+\s*円\s*(?:毎時|毎月|毎日)/i.test(clean);
}

function achievementGaps(text: string): string[] {
  if (!/(?:\d+|一)\s*位|トップ|好成績|実績多数|高い実績/.test(text.normalize("NFKC"))) return [];
  const gaps: string[] = [];
  if (!/\d+\s*(?:年|[かヶカ]月|週間)|(?:月間|年間|四半期|期間)/.test(text)) gaps.push("対象期間");
  if (!/\d+\s*(?:人|名|社|チーム)(?:中|の中)|(?:全|約)\s*\d+\s*(?:人|名|社)|母数|対象\s*\d/.test(text)) gaps.push("比較した人数・対象");
  if (!/\d[\d,.]*\s*(?:件|%|％|円|万円)|(?:売上|獲得数|達成率)\s*[\d,.]+/.test(text)) gaps.push("獲得件数・売上などの数値");
  return gaps;
}

function hasLinkedInterviewSchedule(profile: CandidateChatSource, sources: CandidateChatSource[]): boolean {
  const today = businessToday();
  return sources.some(source => {
    // recordLabel includes the row identity. A company-name match alone is never a profile link.
    if (source.kind !== "record" || !/· 記録行 \d+$/.test(source.label) || !profile.label.includes(source.label)) return false;
    const date = value(source, "C面談予定日");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) return false;
    if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return false;
    return !value(source, "C面談実施日") && !/辞退|落選|離脱|停止|終了|枠埋まり/.test(value(source, "ステータス"));
  });
}

/** Suggestions stay source-specific: a condition from one profile never fills another profile. */
export function buildCandidateChatGuidance(context: CandidateChatContext, question: string, history: ChatHistory = []): CandidateChatGuidance {
  const intent = classifyCandidateChatIntent(question, history);
  const focus = requestedFields(explicitQuestion(question, history));
  const candidates: Array<CandidateChatCheck & { priority: number }> = [];
  const profiles = context.sources.filter(source => source.kind === "profile");
  const add = (source: CandidateChatSource, field: string, priority: number, reason: string, nextQuestion: string) => {
    const sourceScope = profiles.length > 1 ? `資料${quote(source.label)}についての確認です。` : "";
    candidates.push({ field, priority, reason: sourceScope + reason, question: nextQuestion, sourceIds: [source.id] });
  };
  const missing = (source: CandidateChatSource, field: string, priority: number, reason: string, nextQuestion: string) => {
    if (hasValue(value(source, field))) return;
    const scope = partial(source)
      ? `この資料の参照範囲では${field}を確認できません。一部省略されているため、未登録とは断定できません。`
      : `この基本情報の参照範囲では${field}を確認できません。`;
    add(source, field, priority, `${scope}${reason}`, nextQuestion);
  };

  for (const source of profiles) {
    const pay = value(source, "希望単価");
    if (hasValue(pay) && !hasPayUnit(pay)) {
      add(source, "希望単価", 100, `希望単価の記録は${quote(pay)}で、時給・月額・件単価のどれかを特定できません。`, "この希望単価は時給・月額・1件あたりのどれですか？ 税込・税別も確認できますか？");
    } else if (!hasValue(pay)) {
      missing(source, "希望単価", 96, "提案条件を合わせるために報酬の金額と単位を確認すると役立ちます。", "希望する報酬の金額と単位（時給・月額・1件あたり）は決まっていますか？");
    }
    const achievement = value(source, "実績");
    const achievementText = achievement || value(source, "営業経験・職歴");
    const gaps = achievementGaps(achievementText);
    if (gaps.length) add(source, achievement ? "実績" : "営業経験・職歴", 94,
      `${quote(achievementText)}はありますが、${gaps.join("・")}が読み取れません。実績を具体的に説明するための確認です。`,
      `この実績の${gaps.join("・")}を教えてもらえますか？`);
    else if (focus.has("実績") && !hasValue(achievement)) missing(source, "実績", 94,
      "経験を具体的に説明できる数値・対象期間があれば、提案時に使えます。実績がない場合は作らず、その状況を記録できます。",
      "担当した業務の対象期間と、獲得件数・売上など説明できる実績はありますか？ まだなければ、未経験・実績未確認などの状況を教えてください。");

    const days = value(source, "週の稼働日数"), hours = value(source, "月間稼働時間");
    const time = value(source, "希望時間帯");
    if (!hasValue(time)) {
      const scheduleDetail = /\d{1,2}(?::\d{2}|時)\s*[〜～~ー-]\s*\d{1,2}(?::\d{2}|時)|(?:終日|時間帯不問|いつでも|曜日不問)/.test(`${days} ${hours}`);
      if (!scheduleDetail) missing(source, "希望時間帯", hasValue(days) && hasValue(hours) ? 92 : 82,
        hasValue(days) && hasValue(hours) ? `週の稼働日数${quote(days)}と月間稼働時間${quote(hours)}だけでは、1日の時間数・稼働時間帯は確定しません。` : "案件と稼働時間を合わせるために、対応できる曜日・時間帯を確認すると役立ちます。",
        "対応できる曜日・時間帯と、1日あたり何時間稼働できるかを教えてもらえますか？");
    }
    if (!hasLinkedInterviewSchedule(source, context.sources)) missing(source, "面談可能日", 84, "提案先との面談調整に使う候補日時を確認すると役立ちます。既に面談予定が決まっている場合は追加確認は不要です。", "提案先との面談ができる候補日時はありますか？ 既に予定が決まっていれば、その予定を確認してください。");
    missing(source, "稼働開始", 83, "案件の開始日と合わせるため、稼働を始められる日を確認すると役立ちます。", "いつから稼働できますか？ 決まっている場合は年月日を教えてもらえますか？");

    const workHistory = value(source, "営業経験・職歴");
    if (hasValue(workHistory) && !/\d+\s*(?:年|[ヶかカ]月)|未経験|経験なし|職歴なし/.test(workHistory)) {
      add(source, "営業経験・職歴", 72, `${quote(workHistory)}からは経験した期間が読み取れません。`, "その業務をいつからいつまで担当し、どんな商材・相手に対応しましたか？");
    } else if (!hasValue(workHistory)) {
      missing(source, "営業経験・職歴", 71, "提案時に説明する経験・担当業務を確認すると役立ちます。", "これまでの担当業務と経験期間を教えてもらえますか？ 未経験の場合はそのまま記録できます。");
    }
    missing(source, "週の稼働日数", 70, "案件の必要稼働日数と合わせるために確認すると役立ちます。", "週に何日程度稼働できますか？");
    missing(source, "PC環境", 66, "業務に使える端末・OSを確認すると、案件の利用ツールと照合できます。", "業務に使うPCとOSは何ですか？ 用意できていない場合はその状況を教えてください。");
    missing(source, "通信環境", 65, "オンライン業務が可能な回線環境を確認すると役立ちます。", "業務をする場所の通信環境はどのような回線ですか？");
    missing(source, "稼働形態", 64, "出社・リモートなどの希望が案件と合うか確認すると役立ちます。", "リモート・出社など、希望する稼働形態はありますか？");
  }
  if (!profiles.length && context.sources.length) {
    const source = context.sources.find(source => source.kind === "record") ?? context.sources[0];
    add(source, "面談の基本情報", 90,
      "参照できる資料には面談の基本情報が含まれていないため、希望条件・経験の不足は判定できません。未登録とは断定できません。",
      "面談の基本情報は別の記録に登録済みですか？ 登録済みならその内容を確認し、未入力なら希望条件・経験を追加してください。");
  }
  const focused = candidates.filter(check => !focus.size || focus.has(check.field) || check.field === "面談の基本情報");
  // Exact prior question text means this suggestion was displayed, not that its underlying data was filled in.
  const isMore = moreChecks.test(normalized(question));
  const remaining = isMore ? focused.filter(check => !history.some(message => message.role === "assistant" && message.content.includes(check.question))) : focused;
  const allDiscussed = isMore && focused.length > 0 && !remaining.length;
  const checks = remaining.sort((a, b) => b.priority - a.priority).slice(0, 5).map(({ priority: _priority, ...check }) => check);
  const base = [
    "最初にユーザーの質問へ直接答える。求められていないプロフィールの再要約をしない。",
    "登録資料だけを根拠にする。会話履歴のassistantの発言は事実の根拠にしない。ユーザーの追質問から意図を引き継いでも新しい事実を作らない。",
    "会社・基本情報の資料ごとに条件を区別し、別資料の項目を合成しない。未記録を未実施と解釈しない。省略された項目を未登録と断定しない。",
    "単価の数値だけから時給・月額・件単価を決めない。年齢・性別・住所などを追加必須にしない。採用可否や人物評価は行わない。",
    "sourceIdsは構造化した根拠情報にのみ入れ、回答本文に内部IDやsourceIdsを露出しない。",
  ];
  if (intent === "missing-information") base.push(
    "質問は『追加するとよい情報・不足・曖昧さの確認』です。候補者の現状説明への置き換えは禁止です。",
    checks.length ? "重要な確認候補を最大5件、優先順に答える。各項目は『確認したいこと → 記録上の理由 → 本人に聞く具体的な一問』で簡潔に書く。確認済み項目を再要求せず、情報が古いと決めつけない。" : "この参照範囲で追加すべき情報を特定できないと伝える。確認済みを再要求せず不足を断定しない。根拠資料がない場合は不足の有無を判断できないと明示する。",
  );
  else if (intent === "next-actions") base.push("質問は『次に何をするか』です。現在の記録に対応する具体的な確認・連絡・準備を優先して答える。未記録を未実施とせず、未確認事項がある場合は確認候補を使う。実行したと装わない。");
  else if (intent === "summary") base.push("ユーザーが要約を求めている。質問された範囲の事実だけを簡潔に整理し、予定と実績・希望条件を区別する。必要以上の不足一覧は付けない。");
  else base.push("ユーザーが指定した論点にだけ答える。答えのない事項は確認できないと伝え、関連の薄い全項目要約へ逃げない。");
  if (focus.size) base.push(`質問の論点は${[...focus].join("・")}。この範囲に絞り、別の項目の確認へ話を広げない。`);
  if (allDiscussed) base.push(`${noFurtherChecks}既出の確認事項が解決したという意味ではない。`);
  if (context.omittedRecords || context.sources.some(partial)) base.push("参照資料に省略があります。不足の断定を避け、必要に応じて元の記録の確認を案内する。");
  return { intent, instruction: base.join("\n"), checks };
}

/** Render vetted checks rather than trusting generated prose to invent missing information. Indexes are zero-based. */
export function renderCandidateChatChecks(guidance: CandidateChatGuidance, selectedIndexes?: number[]): { text: string; sourceIds: string[] } {
  const valid = [...new Set((selectedIndexes ?? []).filter(index => Number.isInteger(index) && index >= 0 && index < guidance.checks.length))].sort((a, b) => a - b).slice(0, 3);
  const indexes = valid.length ? valid : guidance.checks.slice(0, 3).map((_, index) => index);
  const selected = indexes.map(index => guidance.checks[index]);
  if (!selected.length) return {
    text: guidance.instruction.includes(noFurtherChecks)
      ? `${noFurtherChecks}先ほどの確認事項が解消されたという意味ではありません。確認済みの記録があれば、その内容を使ってください。`
      : "参照した記録の範囲では、追加すべき情報を特定できませんでした。確認済みの内容を入れ直す必要はありません。資料が省略されている場合や別の記録に情報がある場合は、元の記録も確認してください。",
    sourceIds: [],
  };
  const lines = selected.map((check, index) => `${index + 1}. ${check.field}\n   理由：${check.reason}\n   確認する質問：${check.question}`);
  return {
    text: `はい。まず次の${selected.length}点を追記・確認すると、提案や面談を進めやすくなります。\n\n${lines.join("\n\n")}\n\n既に確認済み・入力済みなら、その記録を使えば大丈夫です。`,
    sourceIds: [...new Set(selected.flatMap(check => check.sourceIds))],
  };
}
