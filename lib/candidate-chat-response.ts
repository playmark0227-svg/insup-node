import type { CandidateChatContext } from "./candidate-chat.ts";

type Answer = { answer: string; sourceIds: string[] };

/** This error carries no candidate text, source IDs or native model output. */
class CandidateChatResponseError extends Error {
  readonly code = "INVALID_RESPONSE";
  constructor() { super("候補者への回答を確認できませんでした。"); this.name = "CandidateChatResponseError"; }
}
const reject = (): never => { throw new CandidateChatResponseError(); };
const canonical = (value: string) => value.normalize("NFKC").replace(/[,，]/g, "");
const metadataLabel = /["'`“”‘’]?(?:source[\s_]*ids?|参照\s*ids?|引用\s*ids?)["'`“”‘’]?\s*[:：]/giu;
const technicalKey = /["'`“”‘’]?(?:answer|source[\s_]*ids?|selectedChecks|\$schema|properties|required|additionalProperties|responseConstraint)["'`“”‘’]?\s*[:：]/iu;
const technicalIdentifier = /\b(?:source[\s_]*ids?|selectedChecks)\b|(?:参照|引用)\s*ids?/iu;
const jsonFragment = /[{[]\s*["'][^"'\r\n]{1,120}["']\s*:/u;
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** Repair only a terminal citation list. Any other metadata remains an invalid answer. */
function separateTrailingSources(answer: string, known: Set<string>): { answer: string; ids: string[] } {
  const matches = [...answer.matchAll(metadataLabel)];
  if (!matches.length) return { answer, ids: [] };
  if (matches.length !== 1) return reject();
  const match = matches[0], tail = answer.slice(match.index! + match[0].length).trim();
  const array = tail.match(/^\[([^\[\]]*)\]\s*[。.]?\s*$/u);
  if (!array) return reject();
  const ids = array[1].trim() ? array[1].split(/[,，]/u).map(part => {
    const token = part.trim();
    if (!token) return reject();
    if (token.startsWith('"')) {
      try { const value: unknown = JSON.parse(token); return typeof value === "string" ? value : reject(); }
      catch { return reject(); }
    }
    if (/^[‘'][^‘’']+[’']$/u.test(token)) return token.slice(1, -1);
    if (/^[“][^“”]+[”]$/u.test(token)) return token.slice(1, -1);
    if (/[\s"'`“”‘’]/u.test(token)) return reject();
    return token;
  }) : [];
  if (ids.length > 12 || ids.some(id => !known.has(id))) return reject();
  const prose = answer.slice(0, match.index).trim().replace(/[,，]\s*$/u, "").trim();
  if (!prose) return reject();
  return { answer: prose, ids: [...new Set(ids)] };
}

type PayUnit = "hour" | "day" | "month" | "year" | "piece";
/** Do not infer the unit from the field name: 希望単価 is a free-text field. */
function payUnits(value: string): Set<PayUnit> {
  const text = canonical(value), units = new Set<PayUnit>();
  if (/時給|時間給|円\s*[\/／]\s*(?:h\b|時(?:間)?)|(?:1時間|一時間)(?:あたり|当たり|につき)/iu.test(text)) units.add("hour");
  if (/日給|日額|円\s*[\/／]\s*日|(?:1日|一日)(?:あたり|当たり|につき)|日\s*\d+(?:\.\d+)?\s*(?:万)?円|\d+(?:\.\d+)?\s*(?:万)?円\s*(?:毎日|日あたり|日当たり)/u.test(text)) units.add("day");
  if (/月給|月額|円\s*[\/／]\s*月|(?:1月|1ヶ月|1か月|一ヶ月|一か月)(?:あたり|当たり|につき)|月\s*\d+(?:\.\d+)?\s*(?:万)?円|月\s*\d+(?:\.\d+)?(?=です|で|と|を|[、。\s]|$)|\d+(?:\.\d+)?\s*(?:万)?円\s*(?:毎月|月あたり|月当たり)/u.test(text)) units.add("month");
  if (/年収|年俸|年額|年給|円\s*[\/／]\s*年|(?:1年|一年)(?:あたり|当たり|につき)|年\s*\d+(?:\.\d+)?\s*(?:万)?円/u.test(text)) units.add("year");
  if (/件単価|円\s*[\/／]\s*(?:件|アポ)|(?:1件|一件|件|1アポ)(?:あたり|当たり|につき)/u.test(text)) units.add("piece");
  // Suffix notation without a slash must still not silently create a new unit.
  for (const [unit, suffix] of [["hour", "時(?:間)?"], ["day", "日"], ["month", "月"], ["year", "年"], ["piece", "件"]] as const) {
    if (new RegExp(`\\d+(?:\\.\\d+)?\\s*(?:万)?円\\s*(?:[（(]\\s*)?${suffix}(?:[）)]|あたり|当たり|につき|です|で|と|を|\\s|[、。]|$)`, "u").test(text)) units.add(unit);
  }
  return units;
}

function checkOrUnknown(sentence: string): boolean {
  sentence = canonical(sentence);
  if (/[?？]\s*$/u.test(sentence)) return !/(?:なので|のため|です[、,]|であり|として計算|と計算)/u.test(sentence);
  if (/(?:未記録|未登録|未確認|未確定|未定|不明|記載(?:が|は)?(?:あり|されてい)ません|断定できません|判断できません|分かりません|わかりません|確定していません)/u.test(sentence)) {
    // A disclaimer must not excuse an assertion earlier in the same sentence.
    return !/(?:\d[\d.]*\s*(?:万)?円(?:なので|のため)|として計算|と計算|を希望しています|です[、,])/u.test(sentence);
  }
  return /(?:かどうか|なのか|いずれか|どれか|どちらか|単位|か[、,]|か確認|かを確認).{0,45}(?:確認|質問|聞|明記|追記|記録)/u.test(sentence)
    && !/(?:なので|のため|として計算|と計算|を希望しています|です[、,])/u.test(sentence);
}

function checkPayUnits(answer: string, context: CandidateChatContext): void {
  const rates = context.sources.flatMap(source => source.facts.filter(fact => /希望(?:単価|報酬|時給)|^単価$|^報酬$/u.test(fact.label)));
  if (!rates.length) return;
  const sourceUnits = rates.map(fact => payUnits(fact.value));
  const ambiguous = sourceUnits.some(units => !units.size);
  const allowed = new Set(sourceUnits.flatMap(units => [...units]));
  for (const sentence of answer.split(/\r?\n|(?<=[。！？!?])/u)) {
    const claimed = payUnits(sentence);
    if (claimed.size && !checkOrUnknown(sentence) && (ambiguous || [...claimed].some(unit => !allowed.has(unit)))) reject();
  }
}

function dateKeys(value: string): string[] {
  return [...canonical(value).matchAll(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/gu)]
    .map(match => `${match[1]}-${Number(match[2])}-${Number(match[3])}`);
}

/** The profile's start date is availability, never proof of an actual start. */
function checkAvailabilityClaims(answer: string, context: CandidateChatContext): void {
  const available = context.sources.filter(source => source.kind === "profile").flatMap(source => source.facts
    .filter(fact => /^稼働開始(?:可能日|可能日・希望日|希望日|（本人希望）)?$/u.test(fact.label)).flatMap(fact => dateKeys(fact.value)));
  if (!available.length) return;
  const actual = new Set(context.sources.filter(source => source.kind === "record").flatMap(source => source.facts
    .filter(fact => fact.label === "稼働開始日").flatMap(fact => dateKeys(fact.value))));
  const onlyAvailability = new Set(available.filter(date => !actual.has(date)));
  for (const sentence of answer.split(/\r?\n|(?<=[。！？!?、])|ですが|であり|一方で|しかし/u)) {
    if (!/(?:稼働|勤務|就業|業務)(?:を)?開始|(?:稼働|勤務|就業)(?:を)?始め/u.test(sentence) ||
      /可能|希望|本人申告|未確認|未確定|予定|確認|[?？]/u.test(sentence)) continue;
    if (dateKeys(sentence).some(date => onlyAvailability.has(date))) reject();
  }
}

/**
 * This is a narrow output guard, not a claim that arbitrary model prose is verified.
 * It repairs known terminal citations and rejects unsupported units or actual-start claims.
 */
export function normalizeCandidateChatAnswer(body: Answer, context: CandidateChatContext): Answer {
  const known = new Set(context.sources.map(source => source.id));
  if (!body || typeof body.answer !== "string" || !Array.isArray(body.sourceIds) || body.sourceIds.length > 12 ||
    new Set(body.sourceIds).size !== body.sourceIds.length || body.sourceIds.some(id => typeof id !== "string" || !known.has(id)) || controls.test(body.answer)) return reject();
  const separated = separateTrailingSources(body.answer.trim(), known);
  const answer = separated.answer;
  if (!answer || technicalKey.test(answer) || technicalIdentifier.test(answer) || jsonFragment.test(answer) || /```(?:json)?\s*[\[{]/iu.test(answer) ||
    context.sources.some(source => answer.includes(source.id))) return reject();
  // Whole JSON (including a double-encoded JSON string) cannot be presented as prose.
  let decoded = answer;
  for (let depth = 0; depth < 3; depth++) {
    try {
      const value: unknown = JSON.parse(decoded);
      if (value !== null && typeof value === "object") return reject();
      if (typeof value !== "string" || value === decoded) break;
      decoded = value;
    } catch (error) { if (error instanceof CandidateChatResponseError) throw error; break; }
  }
  const sourceIds = [...new Set([...body.sourceIds, ...separated.ids])];
  if (sourceIds.length > 12) return reject();
  checkPayUnits(answer, context);
  checkAvailabilityClaims(answer, context);
  return { answer, sourceIds };
}
