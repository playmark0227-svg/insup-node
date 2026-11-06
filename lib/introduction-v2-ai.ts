import { blankInterviewFields } from "./candidate-intake.ts";
import { introductionEvidenceIssues } from "./introduction-review.ts";
import { OnDeviceAiError, runOnDeviceStructuredTask, type OnDeviceAiOptions } from "./on-device-ai.ts";
import { blankIntroductionV2Settings, composeIntroductionV2, introductionV2NarrativeFacts, markValidatedIntroductionNarrativeEdit,
  parseIntroductionV2Profile, type IntroductionNarrativeEdit, type IntroductionV2Document, type IntroductionV2Profile, type IntroductionV2Settings } from "./introduction-v2.ts";

export type IntroductionV2Generation = {
  document: IntroductionV2Document; method: "on-device" | "deterministic";
  edits: IntroductionNarrativeEdit[]; appliedCount: number; preservedCount: number;
  notice: string;
};
const schema = { type: "object", additionalProperties: false, required: ["edits"], properties: {
  edits: { type: "array", maxItems: 60, items: { type: "object", additionalProperties: false, required: ["factId", "text"], properties: { factId: { type: "string" }, text: { type: "string" } } } },
} };
const task = "候補者の紹介文の一部分を、自然で読みやすい日本語に整えてください。JSONのeditsだけを返してください。" +
  "各項目は別の事実資料です。factIdとcareerIdの所属を絶対に変えず、他の項目の事実を混ぜないでください。" +
  "入力の項目ごとに一件、同じfactIdでtextを返してください。事実、否定、本人申告、未確認、希望、条件、数字、単位、期間はそのまま保持してください。" +
  "架電や提案などの業務内容と、本人が行った具体的な工夫だけを文章として整えます。" +
  "新しい会社名・商材・ツール・担当役割・成果・数値・評価・性格・能力を加えないでください。" +
  "見出し、あいさつ、総評、推薦、採用可否は書きません。書き換えの根拠がなければ原文のままで構いません。";

const significantQualifiers = ["未確認", "不明", "確認中", "本人申告", "希望", "予定", "候補", "最大", "最小", "平均", "約", "以上", "以下", "未満", "目標"];
/** Validation is scoped to one source atom, never the combined employment
 * history. A rejected atom reuses its original; other employers can still pass. */
export function introductionV2NarrativeIssues(candidate: string, source: string, otherEmployerNames: readonly string[] = []): string[] {
  const issues: string[] = [];
  if (!candidate.trim() || Array.from(candidate).length > Math.max(400, Array.from(source).length * 3) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(candidate)) issues.push("invalid-text");
  const fields = { ...blankInterviewFields(), workHistory: source };
  issues.push(...introductionEvidenceIssues(candidate, "", fields));
  const normalized = (text: string) => text.normalize("NFKC").toLocaleLowerCase("ja");
  const before = normalized(source), after = normalized(candidate);
  for (const name of otherEmployerNames.map(value => value.trim()).filter(Boolean)) if (!source.includes(name) && candidate.includes(name)) issues.push("employer-mixed");
  for (const identifier of candidate.match(/[A-Za-z][A-Za-z0-9.+-]{1,}/g) ?? []) if (!before.includes(identifier.toLowerCase())) issues.push("identifier-added");
  for (const qualifier of significantQualifiers) if (source.includes(qualifier) && !candidate.includes(qualifier) && !(qualifier === "本人申告" && /本人から|本人による|との申告|と伺|とのこと/.test(candidate))) issues.push("qualification-removed");
  // Metrics are renderer-owned. Keep the complete original numerical facts if
  // an old free-text duty contains them instead of inviting model recalculation.
  const sourceNumbers = source.normalize("NFKC").match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  const candidateNumbers = candidate.normalize("NFKC").match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  const key = (numbers: string[]) => numbers.map(value => value.replace(/,/g, "")).sort().join("|");
  if (key(sourceNumbers) !== key(candidateNumbers)) issues.push("number-omitted-or-changed");
  const inventedRoles = /リーダー|マネジメント|マネージャー|管理職|教育担当|研修担当|責任者|チームを牽引|部下|自動化|効率化|受注|成約|達成|改善率/g;
  for (const term of candidate.match(inventedRoles) ?? []) if (!source.includes(term)) issues.push("role-or-result-added");
  // A complete unrelated rewrite must not pass simply because it contains no
  // numbers. Functional particles/endings may change; source content must remain.
  const tokens = (value: string) => [...new Set(value.match(/[一-龠々]{2,}|[ァ-ヴー]{3,}|[A-Za-z]{2,}/g) ?? [])];
  const sourceTokens = tokens(before), targetTokens = tokens(after);
  if (sourceTokens.length && targetTokens.length && !sourceTokens.some(token => targetTokens.some(target => target.includes(token) || token.includes(target)))) issues.push("source-topic-lost");
  return [...new Set(issues)];
}

function readEdits(value: unknown): IntroductionNarrativeEdit[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, "edits") || Object.keys(value).length !== 1) return null;
  const edits = (value as { edits?: unknown }).edits;
  if (!Array.isArray(edits) || edits.length > 60) return null;
  const result: IntroductionNarrativeEdit[] = [], seen = new Set<string>();
  for (const item of edits) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).length !== 2 || typeof item.factId !== "string" || typeof item.text !== "string" || item.factId.length > 300 || seen.has(item.factId)) return null;
    seen.add(item.factId); result.push({ factId: item.factId, text: item.text.trim() });
  }
  return result;
}
/** Local model only. A capability/model failure returns a useful deterministic
 * document and explicit notice. User cancellation remains cancellation. */
export async function generateIntroductionV2(raw: IntroductionV2Profile, settings: IntroductionV2Settings = blankIntroductionV2Settings(), clientId = "", options: OnDeviceAiOptions = {}): Promise<IntroductionV2Generation> {
  const profile = parseIntroductionV2Profile(raw);
  if (!profile) throw new OnDeviceAiError("INVALID_INPUT");
  const fallback = composeIntroductionV2(profile, settings, clientId), facts = introductionV2NarrativeFacts(profile);
  const deterministic = (notice: string): IntroductionV2Generation => ({ document: fallback, method: "deterministic", edits: [], appliedCount: 0, preservedCount: facts.length, notice });
  if (!facts.length) return deterministic("確認済みの入力を規定の書式で整理しました。文章の根拠となる業務内容や具体的な工夫は、確認項目から追記できます。");
  try {
    // Do not send candidate identity, conditions, private notes, prices, company
    // settings or another person's facts. The native runner never uses fetch.
    const output = await runOnDeviceStructuredTask(task, { atoms: facts.slice(0, 60) }, schema, options, 3_000);
    const candidates = readEdits(output);
    if (!candidates) return deterministic("端末内AIの出力形式を確認できなかったため、原文を規定の書式で整理しました。入力は保持されています。");
    const sourceById = new Map(facts.map(fact => [fact.factId, fact]));
    const edits: IntroductionNarrativeEdit[] = [];
    for (const edit of candidates) {
      const source = sourceById.get(edit.factId);
      if (!source) continue;
      const otherCompanies = profile.careers.filter(career => career.id !== source.careerId).map(career => career.company);
      if (!introductionV2NarrativeIssues(edit.text, source.sourceText, otherCompanies).length) edits.push(markValidatedIntroductionNarrativeEdit(edit, source.sourceText));
    }
    const changed = edits.filter(edit => edit.text !== sourceById.get(edit.factId)!.sourceText).length;
    if (!changed) return deterministic("確認済みの内容を規定の書式で整理しました。根拠を保てない書き換えは採用せず、該当部分の原文を残しています。");
    const document = composeIntroductionV2(profile, settings, clientId, new Date(), edits);
    return { document, method: "on-device", edits, appliedCount: changed, preservedCount: facts.length - changed,
      notice: `端末内AIで${changed}項目の文章を整理しました。会社・期間・実績の数字は原文を保持しています。共有前に確認してください。` };
  } catch (error) {
    if (error instanceof OnDeviceAiError && error.code === "ABORTED") throw error;
    return deterministic(error instanceof OnDeviceAiError && error.code === "UNAVAILABLE"
      ? "この端末では端末内AIを利用できないため、確認済みの情報を規定の書式で整理しました。AIによる文章生成は行っていません。"
      : "端末内AIでの文章整理を完了できなかったため、原文を規定の書式で整理しました。入力は保持されています。");
  }
}
