import { OnDeviceAiError, runOnDeviceStructuredTask, type OnDeviceAiOptions } from "./on-device-ai.ts";
import { blankIntroductionV2Settings, composeIntroductionV2, introductionV2NarrativeFacts, validateIntroductionNarrativeEdit,
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
  "語順・助詞・内容語・ひらがなの固有名詞・数字と指標の対応を変えず、文末だけを自然な丁寧表現へ整えてください。時制と否定も保持してください。" +
  "見出し、あいさつ、総評、推薦、採用可否は書きません。書き換えの根拠がなければ原文のままで構いません。";

export { introductionV2NarrativeIssues } from "./introduction-v2.ts";

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
  if (!facts.length) return deterministic("入力内容を紹介文にまとめました。業務内容や工夫を追記すると、より詳しく紹介できます。");
  try {
    // Do not send candidate identity, conditions, private notes, prices, company
    // settings or another person's facts. The native runner never uses fetch.
    const output = await runOnDeviceStructuredTask(task, { atoms: facts.slice(0, 60) }, schema, options, 3_000);
    const candidates = readEdits(output);
    if (!candidates) return deterministic("AIで文章を整えられなかったため、元の入力から紹介文を作成しました。");
    const sourceById = new Map(facts.map(fact => [fact.factId, fact]));
    const edits: IntroductionNarrativeEdit[] = [];
    for (const edit of candidates) {
      const source = sourceById.get(edit.factId);
      if (!source) continue;
      if (validateIntroductionNarrativeEdit(edit, profile, settings)) edits.push(edit);
    }
    const changed = edits.filter(edit => edit.text !== sourceById.get(edit.factId)!.sourceText).length;
    if (!changed) return deterministic("入力内容を紹介文にまとめました。意味が変わる可能性のある箇所は、元の文章を残しています。");
    const document = composeIntroductionV2(profile, settings, clientId, new Date(), edits);
    return { document, method: "on-device", edits, appliedCount: changed, preservedCount: facts.length - changed,
      notice: `${changed}項目の文章を整えました。共有前に内容をご確認ください。` };
  } catch (error) {
    if (error instanceof OnDeviceAiError && error.code === "ABORTED") throw error;
    return deterministic(error instanceof OnDeviceAiError && error.code === "UNAVAILABLE"
      ? "この端末ではAIを利用できないため、元の入力から紹介文を作成しました。"
      : "AIで文章を整えられなかったため、元の入力から紹介文を作成しました。");
  }
}
