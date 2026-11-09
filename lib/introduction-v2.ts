import { blankInterviewFields, normalizeInterviewFields, unicodeLength, type InterviewFields } from "./candidate-intake.ts";
import { introductionContentIssues, introductionEvidenceIssues } from "./introduction-review.ts";
import { introductionStartDateState, normalizeIntroductionValue, type IntroductionNormalizationField } from "./introduction-normalization.ts";

export const introductionV2Version = "2026-11-06";
/** A safety/storage limit, not a writing target. Facts are never cut to fit it. */
export const introductionV2MaxLength = 20_000;
export const introductionV2Headings = ["基本情報", "営業経験・職務経歴", "成果を出すための工夫", "使用ツール・環境", "総評"] as const;
export type IntroductionRate = { amount: string; unit: "hour" | "day" | "month" | "project" | "unknown"; tax: "exclusive" | "inclusive" | "unknown" };
export type IntroductionCareer = {
  /** Immutable relationship key. Reordering employers must not change this ID. */
  id: string; company: string; product: string; period: string; salesStyle: string;
  duties: string[]; achievements: string[]; tips: string[];
};
export type IntroductionV2Basic = {
  furigana: string; age: string; residence: string; availableFrom: string; timeWindow: string;
  monthlyHours: string; desiredRate: IntroductionRate; pcEnvironment: string; networkEnvironment: string;
  /** Separately confirmed operational availability, never the legacy private attendance field. */
  shareableAttendanceNote: string; daysPerWeek: string; weekdays: string; sideJob: string; pcCamera: string;
};
export type IntroductionV2Profile = {
  schemaVersion: 2; candidateName: string; source: string; basic: IntroductionV2Basic;
  careers: IntroductionCareer[]; experienceTotal: string; tips: string[]; tools: string[];
  interviewAvailability: string; internalMemo: string;
  /** Reviewed, atom-scoped prose; source fields above are always retained. */
  narrativeEdits?: IntroductionNarrativeRevision;
};
export type IntroductionClientSettings = { id: string; name: string; mentions: string[]; rate?: IntroductionRate };
export type IntroductionV2Settings = {
  version: string; sources: string[]; sourceAliases: Record<string, string>; blockedTerms: string[];
  clients: IntroductionClientSettings[];
};
export type IntroductionV2Check = { code: string; severity: "block" | "review" | "info"; message: string; field?: string; sourceRef?: string };
export type IntroductionV2Question = { id: string; field: string; label: string; prompt: string; required: boolean; careerId?: string };
export type IntroductionFactRef = { id: string; path: string; value: string; original: string };
/** Model edits can only decorate an identified, source-owned narrative atom. */
export type IntroductionNarrativeEdit = { factId: string; text: string };
export type IntroductionNarrativeRevision = { schemaVersion: 1; templateVersion: string; sourceKey: string; settingsVersion: string; edits: IntroductionNarrativeEdit[] };
/** previewHash binds a modern client's exact displayed text. Legacy raw-only
 * publications can omit it; reviewed narrative publications cannot. */
export type IntroductionV2PublicationPayload = { recordId: string; rowVersion: string; introductionVersion: string; settingsVersion: string; previewHash?: string; publicationId?: string; version?: string; confirmPublication: true };
export type IntroductionV2Document = {
  schemaVersion: 2; templateVersion: string; headingLine: string; internalBody: string;
  client: { clientId: string; mentions: string; greeting: string; recommendation: string; closing: string; body: string; text: string };
  checks: IntroductionV2Check[]; questions: IntroductionV2Question[]; factRefs: IntroductionFactRef[];
  sourceKey: string; canCopyClient: boolean; volume: { bodyChars: number; bodyLines: number; withinTarget: boolean };
};
export const blankIntroductionRate = (): IntroductionRate => ({ amount: "", unit: "unknown", tax: "unknown" });
export const blankIntroductionV2Settings = (): IntroductionV2Settings => ({ version: "initial", sources: [], sourceAliases: {}, blockedTerms: [], clients: [] });
export function blankIntroductionCareer(id: string): IntroductionCareer {
  return { id, company: "", product: "", period: "", salesStyle: "", duties: [], achievements: [], tips: [] };
}
export function blankIntroductionV2Profile(candidateName = ""): IntroductionV2Profile {
  return { schemaVersion: 2, candidateName, source: "", basic: { furigana: "", age: "", residence: "", availableFrom: "", timeWindow: "", monthlyHours: "", desiredRate: blankIntroductionRate(), pcEnvironment: "", networkEnvironment: "", shareableAttendanceNote: "", daysPerWeek: "", weekdays: "", sideJob: "", pcCamera: "" }, careers: [], experienceTotal: "", tips: [], tools: [], interviewAvailability: "", internalMemo: "" };
}
export function parseIntroductionRate(raw: string): IntroductionRate {
  const value = raw.normalize("NFKC").trim();
  const unit: IntroductionRate["unit"] = /時給|(?:円\s*)?[\/／]\s*(?:時(?:間)?|h)/i.test(value) ? "hour"
    : /日給|(?:円\s*)?[\/／]\s*日/.test(value) ? "day" : /月給|月額|(?:円\s*)?[\/／]\s*月/.test(value) ? "month"
      : /案件|一式|件単価|円\s*[\/／]\s*件/.test(value) ? "project" : "unknown";
  const tax: IntroductionRate["tax"] = /税込/.test(value) ? "inclusive" : /税抜|税別/.test(value) ? "exclusive" : "unknown";
  const amount = value.replace(/(?:時給|日給|月給|月額|件単価|希望単価|希望)/g, "").replace(/[（(]?(?:税込|税抜|税別)[）)]?/g, "")
    .replace(/[\/／]\s*(?:時間|時|日|月|件|h)/gi, "").trim();
  return { amount: normalizeIntroductionValue("rate", amount).value, unit, tax };
}
/** An explicit import adapter, not a data migration. Private legacy fields stay private. */
export function introductionV2FromLegacy(candidateName: string, raw: InterviewFields, source = ""): IntroductionV2Profile {
  const fields = normalizeInterviewFields(raw), profile = blankIntroductionV2Profile(candidateName);
  profile.source = source;
  for (const key of ["age", "residence", "availableFrom", "timeWindow", "monthlyHours", "pcEnvironment", "networkEnvironment", "daysPerWeek", "sideJob"] as const) profile.basic[key] = fields[key];
  profile.basic.desiredRate = parseIntroductionRate(fields.desiredHourlyRate);
  if (fields.workHistory.trim() || fields.achievements.trim()) profile.careers = [{ ...blankIntroductionCareer("legacy-career"), duties: fields.workHistory.trim() ? [fields.workHistory] : [], achievements: fields.achievements.trim() ? [fields.achievements] : [] }];
  profile.tips = fields.strengths.trim() ? [fields.strengths] : [];
  profile.tools = [...fields.crmTools.filter(tool => tool !== "その他"), fields.crmOther, ...fields.chatTools.filter(tool => tool !== "その他"), fields.chatOther, fields.pcSkills].filter(value => value.trim());
  profile.interviewAvailability = fields.interviewAvailability;
  profile.internalMemo = [fields.attendanceConcerns, fields.additionalNotes, fields.interviewMemo, fields.selfReflection, fields.interviewAdvice].filter(value => value.trim()).join("\n");
  return profile;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit = 6_000): value is string => typeof value === "string" && unicodeLength(value) <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const list = (value: unknown, count = 30): value is string[] => Array.isArray(value) && value.length <= count && value.every(item => text(item));
export function validIntroductionRate(value: unknown): value is IntroductionRate {
  return record(value) && text(value.amount, 200) && !/[\r\n]/.test(value.amount) && ["hour", "day", "month", "project", "unknown"].includes(String(value.unit)) && ["exclusive", "inclusive", "unknown"].includes(String(value.tax));
}
/** Whitelist persisted fields. Unknown properties, especially copied source documents,
 * are not retained in the returned object. Invalid payloads fail rather than truncate. */
export function parseIntroductionV2Profile(value: unknown): IntroductionV2Profile | null {
  if (!record(value) || value.schemaVersion !== 2 || !record(value.basic) || !Array.isArray(value.careers) || value.careers.length > 30) return null;
  const result = blankIntroductionV2Profile();
  for (const key of ["candidateName", "source", "experienceTotal", "interviewAvailability", "internalMemo"] as const) { if (!text(value[key]) || ["candidateName", "source"].includes(key) && /[\r\n]/.test(value[key])) return null; result[key] = value[key]; }
  for (const key of Object.keys(result.basic) as Array<keyof IntroductionV2Basic>) {
    if (key === "desiredRate") { if (!validIntroductionRate(value.basic[key])) return null; result.basic.desiredRate = { amount: value.basic[key].amount, unit: value.basic[key].unit, tax: value.basic[key].tax }; }
    else { if (!text(value.basic[key])) return null; result.basic[key] = value.basic[key]; }
  }
  for (const key of ["tips", "tools"] as const) { if (!list(value[key])) return null; result[key] = [...value[key]]; }
  const ids = new Set<string>();
  for (const item of value.careers) {
    if (!record(item) || !text(item.id, 120) || !item.id.trim() || ids.has(item.id)) return null;
    ids.add(item.id); const career = blankIntroductionCareer(item.id);
    for (const key of ["company", "product", "period", "salesStyle"] as const) { if (!text(item[key])) return null; career[key] = item[key]; }
    for (const key of ["duties", "achievements", "tips"] as const) { if (!list(item[key])) return null; career[key] = [...item[key]]; }
    result.careers.push(career);
  }
  if (value.narrativeEdits !== undefined) {
    const revision = parseIntroductionNarrativeRevision(value.narrativeEdits);
    if (!revision) return null;
    result.narrativeEdits = revision;
  }
  return unicodeLength(JSON.stringify(result)) <= 100_000 ? result : null;
}
export function parseIntroductionV2Settings(value: unknown): IntroductionV2Settings | null {
  if (!record(value) || !text(value.version, 200) || !list(value.sources, 300) || !list(value.blockedTerms, 500) || !record(value.sourceAliases) || Object.keys(value.sourceAliases).length > 500 || !Array.isArray(value.clients) || value.clients.length > 500) return null;
  const aliases: Record<string, string> = {};
  for (const [key, item] of Object.entries(value.sourceAliases)) { if (!text(key, 200) || !text(item, 200) || ["__proto__", "prototype", "constructor"].includes(key)) return null; aliases[key] = item; }
  const clients: IntroductionClientSettings[] = [], ids = new Set<string>();
  for (const item of value.clients) {
    if (!record(item) || !text(item.id, 200) || !item.id.trim() || ids.has(item.id) || !text(item.name, 200) || !list(item.mentions, 50) || item.rate !== undefined && !validIntroductionRate(item.rate)) return null;
    ids.add(item.id); clients.push({ id: item.id, name: item.name, mentions: [...item.mentions], ...(item.rate ? { rate: { amount: item.rate.amount, unit: item.rate.unit, tax: item.rate.tax } } : {}) });
  }
  return { version: value.version, sources: [...value.sources], sourceAliases: aliases, blockedTerms: [...value.blockedTerms], clients };
}

const unitLabels: Record<IntroductionRate["unit"], string> = { hour: "／時", day: "／日", month: "／月", project: "／件", unknown: "（単位未確認）" };
export function formatIntroductionRate(rate: IntroductionRate): string {
  if (!rate.amount.trim()) return "未確認";
  const amount = normalizeIntroductionValue("rate", rate.amount).value;
  return `${amount}${unitLabels[rate.unit]}${rate.tax === "unknown" ? "（税区分未確認）" : rate.tax === "inclusive" ? "（税込）" : "（税抜）"}`;
}
/** Not an authentication hash. A compact local freshness key avoids putting
 * private notes into document metadata as literal JSON. */
export function introductionV2SourceKey(profile: IntroductionV2Profile, settings: IntroductionV2Settings, clientId = ""): string {
  const { narrativeEdits: _revision, ...original } = profile;
  const source = JSON.stringify([original, settings, clientId]); let a = 2166136261, b = 0x9e3779b9;
  for (const char of source) { const code = char.codePointAt(0)!; a = Math.imul(a ^ code, 16777619); b = Math.imul(b ^ code, 2246822519); }
  return `v2:${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
}
export function resolveIntroductionSource(source: string, settings: IntroductionV2Settings): string {
  const raw = source.trim(); return Object.hasOwn(settings.sourceAliases, raw) ? settings.sourceAliases[raw].trim() : raw;
}
const filled = (values: readonly string[]) => values.map(value => value.trim()).filter(Boolean);
const line = (label: string, value: string) => `${label}：${value.trim() || "未確認"}`;
const factId = (path: string) => `introduction:${path}`;

export function introductionV2NarrativeFacts(profile: IntroductionV2Profile): Array<{ factId: string; careerId: string; kind: "duty" | "tip"; sourceText: string }> {
  const facts: ReturnType<typeof introductionV2NarrativeFacts> = [];
  for (const career of profile.careers) for (const [key, kind] of [["duties", "duty"], ["tips", "tip"]] as const) career[key].forEach((value, index) => {
    if (value.trim() && !introductionContentIssues(value).includes("source-private-detail")) facts.push({ factId: factId(`careers.${career.id}.${key}.${index}`), careerId: career.id, kind, sourceText: value.trim() });
  });
  profile.tips.forEach((value, index) => { if (value.trim() && !introductionContentIssues(value).includes("source-private-detail")) facts.push({ factId: factId(`tips.${index}`), careerId: "candidate", kind: "tip", sourceText: value.trim() }); });
  return facts;
}

export function composeIntroductionV2(raw: IntroductionV2Profile, rawSettings: IntroductionV2Settings = blankIntroductionV2Settings(), clientId = "", now = new Date(), edits?: readonly IntroductionNarrativeEdit[]): IntroductionV2Document {
  const profile = parseIntroductionV2Profile(raw), settings = parseIntroductionV2Settings(rawSettings);
  if (!profile || !settings) throw new Error("紹介文の入力または設定の形式を確認してください。原文は保持してください。");
  const checks: IntroductionV2Check[] = [], questions: IntroductionV2Question[] = [], factRefs: IntroductionFactRef[] = [];
  const question = (field: string, label: string, prompt: string, required = true, careerId?: string) => { const id = `${careerId ?? "basic"}:${field}`; if (!questions.some(item => item.id === id)) questions.push({ id, field, label, prompt, required, ...(careerId ? { careerId } : {}) }); };
  const fixed = (path: string, rawValue: string, normField?: IntroductionNormalizationField): string => {
    const normalized = normField ? normalizeIntroductionValue(normField, rawValue) : { raw: rawValue, value: rawValue.trim(), status: "unchanged" as const };
    if (normalized.status === "needs-confirmation") { checks.push({ code: "normalization", severity: "review", field: path, sourceRef: factId(path), message: normalized.question! }); question(path, path, normalized.question!); }
    if (normalized.value.trim()) factRefs.push({ id: factId(path), path, value: normalized.value, original: rawValue });
    return normalized.value.trim();
  };
  // Persisted prose is untrusted JSON. Revalidate it using the same source-atom
  // evidence checks used for fresh native model output, including after reload.
  const selectedEdits = edits ?? getStoredIntroductionNarrativeEdits(profile, settings);
  if (edits === undefined && profile.narrativeEdits && !isIntroductionNarrativeRevisionCurrent(profile, settings)) checks.push({ code: "narrative-stale", severity: "review", message: "原文または共有設定が変わったため、以前の整文を使わず原文を表示しています。必要に応じて整え直して保存してください。" });
  const acceptedEdits = new Map<string, string>(), seenEdits = new Set<string>();
  for (const edit of selectedEdits) {
    if (!seenEdits.has(edit.factId) && validateIntroductionNarrativeEdit(edit, profile, settings)) acceptedEdits.set(edit.factId, edit.text.trim());
    else checks.push({ code: "narrative-rejected", severity: "review", sourceRef: edit.factId, message: "根拠を確認できなかった文章は、その項目の原文を使っています。" });
    seenEdits.add(edit.factId);
  }
  const narrativeValue = (path: string, value: string) => { const original = fixed(path, value); return acceptedEdits.get(factId(path)) ?? original; };
  const name = fixed("candidateName", profile.candidateName);
  if (!name) question("candidateName", "氏名", "候補者の氏名を確認してください。");
  const source = resolveIntroductionSource(profile.source, settings);
  if (!source) question("source", "紹介元", "紹介元を選択してください。未登録の選択肢は管理者に確認してください。");
  if (source && settings.sources.length && !settings.sources.includes(source)) checks.push({ code: "source-unregistered", severity: "review", field: "source", message: "紹介元が登録済みの選択肢と一致していません。正式な表記を確認してください。" });
  if (source) factRefs.push({ id: factId("source"), path: "source", value: source, original: profile.source });
  const basic = profile.basic;
  const basicValues = {
    age: fixed("basic.age", basic.age, "age"), residence: fixed("basic.residence", basic.residence, "residence"),
    availableFrom: fixed("basic.availableFrom", basic.availableFrom, "availableFrom"), timeWindow: fixed("basic.timeWindow", basic.timeWindow, "timeWindow"),
    monthlyHours: fixed("basic.monthlyHours", basic.monthlyHours, "monthlyHours"), pcEnvironment: fixed("basic.pcEnvironment", basic.pcEnvironment, "pcEnvironment"),
    networkEnvironment: fixed("basic.networkEnvironment", basic.networkEnvironment, "networkEnvironment"), shareableAttendanceNote: fixed("basic.shareableAttendanceNote", basic.shareableAttendanceNote, "attendanceNote"),
  };
  const requiredLabels: Record<keyof typeof basicValues, string> = { age: "年齢", residence: "居住地", availableFrom: "稼働開始", timeWindow: "稼働時間", monthlyHours: "月間稼働時間", pcEnvironment: "PC環境", networkEnvironment: "ネット環境", shareableAttendanceNote: "勤怠懸念" };
  for (const key of Object.keys(basicValues) as Array<keyof typeof basicValues>) if (!basicValues[key]) question(`basic.${key}`, requiredLabels[key], `${requiredLabels[key]}を確認してください。分からなければ未確認のまま進められます。`);
  fixed("basic.desiredRate.amount", basic.desiredRate.amount, "rate");
  if (!basic.desiredRate.amount.trim()) question("basic.desiredRate.amount", "希望単価", "希望単価の数値と、時給・日給・月額などの単位を確認してください。");
  if (basic.desiredRate.amount.trim() && basic.desiredRate.unit === "unknown") question("basic.desiredRate.unit", "単価の単位", "この希望単価は時給・日給・月額・案件単価のどれですか？");
  if (basic.desiredRate.amount.trim() && basic.desiredRate.tax === "unknown") checks.push({ code: "tax-unknown", severity: "review", field: "basic.desiredRate.tax", message: "希望単価の税込・税抜が未確認です。企業提示条件とあわせて確認してください。" });
  const dateState = introductionStartDateState(basic.availableFrom, now);
  if (dateState === "past") checks.push({ code: "start-date-past", severity: "review", field: "basic.availableFrom", message: "稼働開始日が過去です。現在の予定を確認してください。" });
  if (dateState === "year-unknown") question("basic.availableFrom.year", "稼働開始の年", "稼働開始の年は何年ですか？年を推測せず、入力どおりの月日で表示しています。", false);
  if (basic.sideJob.trim() && !basic.shareableAttendanceNote.trim()) question("basic.shareableAttendanceNote", "副業の稼働への影響", "副業によって連絡可能時間や勤務時間に影響はありますか？個人的な事情ではなく、共有できる稼働上の影響だけを記入してください。");
  const baseLines = [line("氏名", name), ...(basic.furigana.trim() ? [line("ふりがな", fixed("basic.furigana", basic.furigana))] : []), line("年齢", basicValues.age), line("居住地", basicValues.residence), line("稼働開始", basicValues.availableFrom), line("稼働時間", basicValues.timeWindow), line("月間稼働時間", basicValues.monthlyHours), line("希望単価", formatIntroductionRate(basic.desiredRate)), line("PC環境", basicValues.pcEnvironment), line("ネット環境", basicValues.networkEnvironment), line("勤怠懸念", basicValues.shareableAttendanceNote)];
  for (const [key, label] of [["daysPerWeek", "週の稼働数"], ["weekdays", "稼働曜日"], ["sideJob", "副業"], ["pcCamera", "PCカメラの有無"]] as const) if (basic[key].trim()) baseLines.push(line(label, fixed(`basic.${key}`, basic[key])));
  const experience = fixed("experienceTotal", profile.experienceTotal);
  if (!experience) question("experienceTotal", "営業経験の通算", "通算の営業経験はどのくらいですか？重複する職歴期間を二重に数えず確認してください。", false);
  const careerBlocks: string[] = [], tips = profile.tips.map((value, index) => narrativeValue(`tips.${index}`, value)).filter(Boolean);
  for (const career of profile.careers) {
    const prefix = `careers.${career.id}`, company = fixed(`${prefix}.company`, career.company), product = fixed(`${prefix}.product`, career.product), period = fixed(`${prefix}.period`, career.period), style = fixed(`${prefix}.salesStyle`, career.salesStyle, "salesStyle");
    const duties = career.duties.map((value, index) => narrativeValue(`${prefix}.duties.${index}`, value)).filter(Boolean);
    const achievements = career.achievements.map((value, index) => fixed(`${prefix}.achievements.${index}`, value)).filter(Boolean);
    tips.push(...career.tips.map((value, index) => narrativeValue(`${prefix}.tips.${index}`, value)).filter(Boolean));
    for (const [key, label, prompt] of [["period", "期間", "開始・終了の年月を確認してください。"], ["product", "商材", "扱った商品・サービスを確認してください。"], ["salesStyle", "営業スタイル", "BtoB/BtoCと、テレアポ・商談などの手法を確認してください。"], ["duties", "業務内容", "実際に担当した業務を確認してください。"], ["achievements", "実績", "架電数・アポ数などを、単位と期間を含めて確認してください。"]] as const) if (Array.isArray(career[key]) ? !filled(career[key]).length : !career[key].trim()) question(`${prefix}.${key}`, label, `${company || product || "この職歴"}：${prompt}`, true, career.id);
    const metrics = achievements.join("\n");
    if (/(?:\d+\s*位|首位|トップ|No[.]?\s*\d+)/i.test(metrics) && (!/(?:\d+\s*(?:人|名|社)中|母数|比較対象|全\d+\s*(?:人|名|社))/.test(metrics) || !/(?:\d+年|\d+月|月間|年間|週間|日間|期間)/.test(metrics))) question(`${prefix}.rankContext`, "順位の比較対象と期間", `${company || "この職歴"}の順位について、何人・何社中か、いつの実績かを確認してください。未確認の母数や期間は補いません。`, false, career.id);
    careerBlocks.push([`■${company || "社名不明"}${product ? `／${product}` : ""}`, line("期間", period), line("商材", product), line("営業スタイル", style), "業務内容：", ...(duties.length ? duties : ["未確認"]).map(value => `・${value}`), "実績：", ...(achievements.length ? achievements : ["未確認"]).map(value => `・${value}`)].join("\n"));
  }
  if (!profile.careers.length) { question("careers", "職歴", "営業経験・職歴について、会社・商材・期間・担当業務を確認してください。"); careerBlocks.push("■社名不明\n期間：未確認\n商材：未確認\n営業スタイル：未確認\n業務内容：\n・未確認\n実績：\n・未確認"); }
  if (tips.length < 2) question("tips", "成果を出すための工夫", "成果につながった具体的な行動を確認してください。例文を事実として足さず、分かる範囲を記入してください。", true);
  const tools = [...new Set(profile.tools.map((value, index) => fixed(`tools.${index}`, value, "tool")).filter(Boolean))];
  if (!tools.length) question("tools", "使用ツール", "CRM・チャット・表計算など、実際に使用したツールを確認してください。");
  const summary = renderIntroductionSummary(profile);
  const sections = [`【基本情報】\n${baseLines.join("\n")}`, `【営業経験・職務経歴】\n${line("営業経験", experience)}\n${careerBlocks.join("\n\n")}`, `【成果を出すための工夫】\n${(tips.length ? tips : ["未確認"]).map(value => `・${value}`).join("\n")}`, `【使用ツール・環境】\n${(tools.length ? tools : ["未確認"]).map(value => `・${value}`).join("\n")}`, ...(profile.interviewAvailability.trim() ? [`【面談可能日】\n${fixed("interviewAvailability", profile.interviewAvailability)}`] : []), `【総評】\n${summary}`];
  const internalBody = sections.join("\n\n"), client = settings.clients.find(item => item.id === clientId);
  if (clientId && !client) checks.push({ code: "client-not-found", severity: "block", field: "clientId", message: "選択した企業の設定が見つかりません。企業を選び直してください。" });
  let body = internalBody;
  if (client?.rate) {
    const rateIndex = baseLines.indexOf(line("希望単価", formatIntroductionRate(basic.desiredRate)));
    const clientBaseLines = baseLines.map((value, index) => index === rateIndex ? line("希望単価", formatIntroductionRate(client.rate!)) : value);
    body = [`【基本情報】\n${clientBaseLines.join("\n")}`, ...sections.slice(1)].join("\n\n");
    if (!client.rate.amount.trim()) checks.push({ code: "client-rate-empty", severity: "review", message: "企業別の提示単価が未登録です。" });
    if (client.rate.tax === "unknown" || client.rate.unit === "unknown") checks.push({ code: "client-rate-unconfirmed", severity: "review", message: "企業別の提示単価の単位または税区分が未確認です。" });
  }
  const headingLine = `${name || "未確認"}（${source || "紹介元未確認"}）`;
  const greeting = "お世話になっております。\n下記の人員をご紹介させていただきます。", closing = "ご検討のほどよろしくお願いいたします。";
  const recommendation = renderIntroductionRecommendation(profile);
  const mentions = client?.mentions.map(value => value.trim()).filter(Boolean).join("\n") ?? "";
  const clientText = [mentions, greeting, recommendation, closing, headingLine, body].filter(Boolean).join("\n\n");
  checks.push(...inspectIntroductionV2ClientText(clientText, profile, settings));
  if (!compareIntroductionV2Bodies(internalBody, body, basic.desiredRate, client?.rate)) checks.push({ code: "client-fact-mismatch", severity: "block", message: "設定された単価以外の情報が社内版と企業向け版で異なります。" });
  const bodyChars = unicodeLength(internalBody), bodyLines = internalBody.split("\n").length;
  if (bodyChars > introductionV2MaxLength || unicodeLength(clientText) > introductionV2MaxLength) checks.push({ code: "document-length", severity: "block", message: "文章が保存可能な長さを超えています。原文を削らず、職歴を確認してください。" });
  return { schemaVersion: 2, templateVersion: introductionV2Version, headingLine, internalBody, client: { clientId, mentions, greeting, recommendation, closing, body, text: clientText }, checks, questions, factRefs, sourceKey: introductionV2SourceKey(profile, settings, clientId), canCopyClient: !checks.some(check => check.severity === "block"), volume: { bodyChars, bodyLines, withinTarget: bodyChars >= 764 && bodyChars <= 1125 && bodyLines >= 40 && bodyLines <= 58 } };
}

/** The actual achievements remain verbatim in the career block. The summary
 * selects existing evidence; it never creates a total, rate, rank or strength. */
export function renderIntroductionSummary(profile: IntroductionV2Profile): string {
  const careers = profile.careers.filter(career => career.duties.some(value => value.trim()) || career.product.trim());
  if (!careers.length) return "営業経験・職務経歴と具体的な取り組みは未確認です。確認できた情報をもとに内容を整えます。";
  const statements: string[] = [];
  if (profile.experienceTotal.trim()) statements.push(`営業経験は${profile.experienceTotal.trim()}です。`);
  for (const career of careers) {
    const subject = [career.company, career.product].map(value => value.trim()).filter(Boolean).join("の");
    if (subject || career.salesStyle.trim()) statements.push(`${subject ? `${subject}で` : ""}${normalizeIntroductionValue("salesStyle", career.salesStyle).value || "記載の業務"}の経験があります。`);
  }
  const achievement = careers.flatMap(career => filled(career.achievements))[0];
  if (achievement) statements.push(`実績として「${achievement}」が記録されています。`);
  const tip = [...filled(profile.tips), ...careers.flatMap(career => filled(career.tips))][0];
  if (tip) statements.push(`具体的な取り組みは「${tip}」です。`);
  // A conditional process suggestion, not an aptitude or hiring judgement.
  statements.push("同様の業務を紹介する際は、記載の経験と稼働条件をもとに、案件との具体的な接点を確認できます。");
  return statements.join("");
}
export function renderIntroductionRecommendation(profile: IntroductionV2Profile): string {
  const first = profile.careers.find(career => career.product.trim() || career.salesStyle.trim());
  if (!first) return "候補者の基本情報を下記にまとめております。未確認の項目は確認を進めております。";
  const experience = profile.experienceTotal.trim() ? `${profile.experienceTotal.trim()}の営業経験があり、` : "";
  const fact = [first.product.trim(), normalizeIntroductionValue("salesStyle", first.salesStyle).value].filter(Boolean).join("・");
  const achievement = filled(first.achievements)[0];
  const tip = [...filled(first.tips), ...filled(profile.tips)][0];
  return `${experience}${fact}の経験がある方です。${achievement ? `実績として「${achievement}」が記録されています。` : ""}${tip ? `「${tip}」という取り組みをされています。` : ""}`;
}
export function compareIntroductionV2Bodies(internalBody: string, clientBody: string, sourceRate: IntroductionRate, clientRate?: IntroductionRate): boolean {
  if (!clientRate) return internalBody === clientBody;
  const sourceLine = line("希望単価", formatIntroductionRate(sourceRate)), clientLine = line("希望単価", formatIntroductionRate(clientRate));
  const masked = (body: string, expectedLine: string) => { const lines = body.split("\n"), index = lines.indexOf(expectedLine); if (index < 0) return null; lines[index] = "希望単価：__configured_rate__"; return lines.join("\n"); };
  const sourceMasked = masked(internalBody, sourceLine), clientMasked = masked(clientBody, clientLine);
  return sourceMasked !== null && clientMasked !== null && sourceMasked === clientMasked;
}
/** Call again immediately before copying or sharing manually edited prose. */
export function inspectIntroductionV2ClientText(value: string, profile: IntroductionV2Profile, settings: IntroductionV2Settings): IntroductionV2Check[] {
  const comparable = (text: string) => text.normalize("NFKC").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "").toLocaleLowerCase("ja");
  const checks: IntroductionV2Check[] = [], normalized = comparable(value);
  for (const term of settings.blockedTerms.map(term => term.trim()).filter(Boolean)) if (normalized.includes(comparable(term))) checks.push({ code: "blocked-term", severity: "block", message: `企業向けに出力できない登録語句「${term}」が含まれています。` });
  const privateParts = [profile.internalMemo.trim(), ...profile.internalMemo.split(/[\n。]/).map(part => part.trim())].filter(part => Array.from(part).length >= 4 && !/^(?:特になし|なし|懸念なし|問題なし|未確認|不明|確認中)[。.]?$/.test(part));
  if (privateParts.some(part => normalized.includes(comparable(part)))) checks.push({ code: "private-memo-leak", severity: "block", message: "社内メモと一致する内容が企業向け文章に含まれています。共有する内容を確認してください。" });
  for (const issue of introductionContentIssues(value.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, ""))) checks.push({ code: issue, severity: "block", message: issue === "source-private-detail" ? "個人的な事情が企業向け文章に含まれています。共有できる稼働条件だけを記載してください。" : "根拠のない人物評価、空の例示や機械向けの出力が含まれていないか確認してください。" });
  return checks;
}

/** Exact shape/size checking prevents a stored whole-document or private-field
 * payload from being smuggled into the atom revision. Legacy profiles omit it. */
export function parseIntroductionNarrativeRevision(value: unknown): IntroductionNarrativeRevision | null {
  if (!record(value) || Object.keys(value).sort().join("|") !== "edits|schemaVersion|settingsVersion|sourceKey|templateVersion" || value.schemaVersion !== 1 || !text(value.templateVersion, 200) || !text(value.settingsVersion, 200) || !text(value.sourceKey, 80) || !/^v2:[a-f0-9]+$/.test(value.sourceKey) || !Array.isArray(value.edits) || value.edits.length > 60) return null;
  const edits: IntroductionNarrativeEdit[] = [], seen = new Set<string>();
  for (const edit of value.edits) {
    if (!record(edit) || Object.keys(edit).sort().join("|") !== "factId|text" || !text(edit.factId, 300) || !text(edit.text) || !edit.text.trim() || seen.has(edit.factId)) return null;
    seen.add(edit.factId); edits.push({ factId: edit.factId, text: edit.text.trim() });
  }
  const revision: IntroductionNarrativeRevision = { schemaVersion: 1, templateVersion: value.templateVersion, sourceKey: value.sourceKey, settingsVersion: value.settingsVersion, edits };
  return unicodeLength(JSON.stringify(revision)) <= 60_000 ? revision : null;
}
const significantNarrativeQualifiers = ["未確認", "不明", "確認中", "本人申告", "希望", "予定", "候補", "最大", "最小", "平均", "約", "以上", "以下", "未満", "目標"];
export function introductionV2NarrativeIssues(candidate: string, source: string, otherEmployerNames: readonly string[] = []): string[] {
  const issues: string[] = [];
  if (!candidate.trim() || unicodeLength(candidate) > Math.max(400, unicodeLength(source) * 3) || !text(candidate)) issues.push("invalid-text");
  issues.push(...introductionEvidenceIssues(candidate, "", { ...blankInterviewFields(), workHistory: source }));
  const normalize = (value: string) => value.normalize("NFKC").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "").toLocaleLowerCase("ja");
  const before = normalize(source), after = normalize(candidate);
  for (const name of otherEmployerNames.map(value => value.trim()).filter(Boolean)) if (!before.includes(normalize(name)) && after.includes(normalize(name))) issues.push("employer-mixed");
  for (const identifier of candidate.match(/[A-Za-z][A-Za-z0-9.+-]{1,}/g) ?? []) if (!before.includes(identifier.toLowerCase())) issues.push("identifier-added");
  for (const qualifier of significantNarrativeQualifiers) if (before.includes(qualifier) && !after.includes(qualifier) && !(qualifier === "本人申告" && /本人から|本人による|との申告|と伺|とのこと/.test(candidate))) issues.push("qualification-removed");
  const numberKey = (value: string) => (normalize(value).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(item => item.replace(/,/g, "")).join("|");
  if (numberKey(source) !== numberKey(candidate)) issues.push("number-omitted-or-changed");
  // Negation must stay attached to the same source clause, including verbs not
  // covered by the broader career/tool evidence guard (e.g. 架電していない).
  const negationScopes = (value: string) => {
    const scopes: string[] = [];
    for (const clause of normalize(value).split(/[。！？!?\n、,;；]/)) for (const match of clause.matchAll(/おりませんでした|おりません|おらず|おらない|いませんでした|いません|ありませんでした|ありません|ませんでした|ません|なかった|ない|なく|なし|せず|できず|未経験|未対応|未実施|未使用|不可|除く|以外/g)) {
      const context = clause.slice(0, match.index).match(/[一-龠々]{1,}|[ァ-ヴー]{2,}|[a-z]{2,}|\d+/g) ?? [];
      scopes.push(context.join("|"));
    }
    return scopes.join("\n");
  };
  if (negationScopes(source) !== negationScopes(candidate)) issues.push("negation-changed");
  // A bag of words/numbers cannot prove who did what, nor which metric owns a
  // quantity. Require the complete source wording in the same order, including
  // hiragana names, particles, units, negation and clause boundaries. The only
  // source-to-edit freedom is an explicit, tense-preserving polite ending.
  // When the source is a bare action noun, either descriptive ending is allowed.
  // Anything more ambitious falls back to the unmodified original atom.
  const wordingParts = (value: string) => normalize(value).replace(/[^\S\n]/g, "").trim().replace(/。$/, "").split(/([。！？!?\n、,;；])/);
  const ending = (value: string): { base: string; tense: "past" | "present" | "unspecified" } => {
    const negative = value
      .replace(/(?:しておりませんでした|していませんでした|しておらなかった)$/, "していなかった")
      .replace(/(?:しておりません|していません|しておらず|しておらない)$/, "していない")
      .replace(/(?:しませんでした)$/, "しなかった")
      .replace(/(?:しません|せず)$/, "しない");
    const past = negative.match(/([一-龠々ァ-ヴー])(?:しておりました|していました|していた|しました|した)$/);
    if (past) return { base: negative.slice(0, past.index! + 1), tense: "past" };
    const present = negative.match(/([一-龠々ァ-ヴー])(?:しております|しています|している|します|する)$/);
    if (present) return { base: negative.slice(0, present.index! + 1), tense: "present" };
    return { base: negative, tense: "unspecified" };
  };
  const sourceParts = wordingParts(source), candidateParts = wordingParts(candidate);
  if (sourceParts.length !== candidateParts.length || sourceParts.some((part, index) => {
    if (index % 2) return part !== candidateParts[index];
    const original = ending(part), edited = ending(candidateParts[index]);
    return original.base !== edited.base || original.tense !== "unspecified" && original.tense !== edited.tense;
  })) issues.push("source-wording-changed");
  const inventedRoles = /リーダー|マネジメント|マネージャー|管理職|教育担当|研修担当|責任者|チームを牽引|部下|自動化|効率化|受注|成約|達成|改善率/g;
  for (const term of candidate.match(inventedRoles) ?? []) if (!source.includes(term)) issues.push("role-or-result-added");
  // Restrict lexical content as well as numbers. Only vetted endings may change;
  // a new Japanese company, tool, role, or omitted source fact must fail closed.
  const tokens = (value: string) => [...new Set(value.match(/[一-龠々]{2,}|[ァ-ヴー]{3,}|[A-Za-z]{2,}/g) ?? [])];
  const sourceTokens = tokens(before), targetTokens = tokens(after);
  if (targetTokens.some(token => !before.includes(token))) issues.push("source-content-added");
  if (sourceTokens.some(token => !after.includes(token) && !targetTokens.join("").includes(token))) issues.push("source-content-omitted");
  return [...new Set(issues)];
}
/** Atom relationship, every factual qualifier and sensitive values are checked
 * on the server too. No native-engine capability is accepted as proof. */
export function validateIntroductionNarrativeEdit(edit: unknown, profile: IntroductionV2Profile, settings: IntroductionV2Settings = blankIntroductionV2Settings()): edit is IntroductionNarrativeEdit {
  if (!record(edit) || Object.keys(edit).sort().join("|") !== "factId|text" || !text(edit.factId, 300) || !text(edit.text)) return false;
  const source = introductionV2NarrativeFacts(profile).find(fact => fact.factId === edit.factId);
  if (!source) return false;
  const companies = profile.careers.filter(career => career.id !== source.careerId).map(career => career.company);
  return !introductionV2NarrativeIssues(edit.text, source.sourceText, companies).length && !inspectIntroductionV2ClientText(edit.text, profile, settings).some(check => check.severity === "block");
}
export function isIntroductionNarrativeRevisionCurrent(profile: IntroductionV2Profile, settings: IntroductionV2Settings): boolean {
  const revision = profile.narrativeEdits;
  return !!revision && revision.templateVersion === introductionV2Version && revision.settingsVersion === settings.version && revision.sourceKey === introductionV2SourceKey(profile, settings) && revision.edits.every(edit => validateIntroductionNarrativeEdit(edit, profile, settings));
}
export function getStoredIntroductionNarrativeEdits(profile: IntroductionV2Profile, settings: IntroductionV2Settings): IntroductionNarrativeEdit[] {
  return isIntroductionNarrativeRevisionCurrent(profile, settings) ? profile.narrativeEdits!.edits.map(edit => ({ ...edit })) : [];
}
export function withoutIntroductionNarrativeEdits(profile: IntroductionV2Profile): IntroductionV2Profile { const { narrativeEdits: _revision, ...original } = profile; return original; }
export function withIntroductionNarrativeEdits(profile: IntroductionV2Profile, settings: IntroductionV2Settings, edits: readonly IntroductionNarrativeEdit[]): IntroductionV2Profile {
  const original = withoutIntroductionNarrativeEdits(profile), seen = new Set<string>();
  if (edits.length > 60 || edits.some(edit => seen.has(edit.factId) || (seen.add(edit.factId), !validateIntroductionNarrativeEdit(edit, original, settings)))) throw new Error("整文の根拠を確認できませんでした。原文は保持されています。");
  const revision = parseIntroductionNarrativeRevision({ schemaVersion: 1, templateVersion: introductionV2Version, sourceKey: introductionV2SourceKey(original, settings), settingsVersion: settings.version, edits });
  if (!revision) throw new Error("整文が保存上限を超えています。原文は保持されています。");
  const parsed = parseIntroductionV2Profile({ ...original, narrativeEdits: revision });
  if (!parsed) throw new Error("紹介文が保存上限を超えています。原文は保持されています。");
  return parsed;
}
// Kept for existing callers. It grants no trust: compose always revalidates.
export function markValidatedIntroductionNarrativeEdit(edit: IntroductionNarrativeEdit, _original: string): IntroductionNarrativeEdit { return edit; }

/** Suggestion only: the caller asks the user to confirm the derived total.
 * Inclusive month ranges are merged so overlapping jobs are not double-counted. */
export function suggestIntroductionExperienceTotal(careers: readonly IntroductionCareer[]): { value: string; months: number; careerIds: string[] } | null {
  if (!careers.length) return null;
  const ranges: Array<{ start: number; end: number }> = [];
  for (const career of careers) {
    const match = career.period.normalize("NFKC").trim().match(/^(\d{4})[\/年.-](\d{1,2})月?\s*[〜～~－ー−–—-]\s*(\d{4})[\/年.-](\d{1,2})月?$/);
    if (!match) return null;
    const [, y1, m1, y2, m2] = match.map(Number);
    if (m1 < 1 || m1 > 12 || m2 < 1 || m2 > 12) return null;
    const start = y1 * 12 + m1 - 1, end = y2 * 12 + m2 - 1;
    if (end < start) return null; ranges.push({ start, end });
  }
  const merged: typeof ranges = [];
  for (const range of ranges.sort((a, b) => a.start - b.start)) { const last = merged.at(-1); if (last && range.start <= last.end + 1) last.end = Math.max(last.end, range.end); else merged.push({ ...range }); }
  const months = merged.reduce((sum, range) => sum + range.end - range.start + 1, 0), years = Math.floor(months / 12), rest = months % 12;
  return { value: `${years ? `${years}年` : ""}${rest ? `${rest}か月` : ""}`, months, careerIds: careers.map(career => career.id) };
}
