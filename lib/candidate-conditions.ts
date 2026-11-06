import type { InterviewFields } from "./candidate-intake.ts";

export type ConditionField = "days" | "hours" | "rate" | "start";
export type ConditionState = "known" | "missing" | "ambiguous";
export type RecordedQuantity = { state: ConditionState; raw: string; minimum?: number; maximum?: number; unit: string };
export type RecordedStart = { state: ConditionState; raw: string; date?: string };
export type CandidateConditionFilter = {
  daysMin?: number; daysMax?: number; hoursMin?: number; hoursMax?: number;
  rateMin?: number; rateMax?: number; availableBy?: string;
  conditionCheck?: "all" | `${ConditionField}:${"missing" | "ambiguous"}`;
};
export const conditionCheckOptions = [
  { value: "all", label: "確認状態を指定しない" },
  { value: "days:missing", label: "週の稼働日数が未記載" }, { value: "days:ambiguous", label: "週の稼働日数が要確認" },
  { value: "hours:missing", label: "月の稼働時間が未記載" }, { value: "hours:ambiguous", label: "月の稼働時間が要確認" },
  { value: "rate:missing", label: "希望時給が未記載" }, { value: "rate:ambiguous", label: "単価・単位が要確認" },
  { value: "start:missing", label: "開始可能日が未記載" }, { value: "start:ambiguous", label: "開始可能日が要確認" },
] as const;
const normalized = (raw: string) => raw.normalize("NFKC").replace(/[,，]/g, "").replace(/[〜～–—−]/g, "~").trim();
const number = "(\\d+(?:\\.\\d+)?)(千|万)?";
const unitNumber = (value: string | undefined, scale: string | undefined) => Number(value) * (scale === "万" ? 10000 : scale === "千" ? 1000 : 1);

/** A value only becomes a searchable number when its period/unit and bounds are explicit.
 * Approximate or contradictory notes stay visible as 'needs confirmation', never guessed. */
export function recordedQuantity(raw: string, kind: "days" | "hours" | "rate"): RecordedQuantity {
  const unit = kind === "days" ? "日/週" : kind === "hours" ? "時間/月" : "円/時";
  const result: RecordedQuantity = { state: raw.trim() ? "ambiguous" : "missing", raw, unit };
  if (result.state === "missing") return result;
  let input = normalized(raw).replace(/\s+/g, "");
  if (/(?:約|程度|目安|前後|未定|応相談|相談|可変|変動|未確認|くらい|ぐらい|以内でも|次第)/.test(input)) return result;
  if (kind === "rate") {
    // The legacy field's name does not establish an hourly unit. '3000円' remains ambiguous.
    if (/月給|月額|日給|年収|税別|税込|手取り/.test(input)) return result;
    if (/時給/.test(input)) input = input.replace(/^(?:希望)?時給/, "").replace(/円(?=[~以上以下]|$)/g, "");
    else if (/(?:円\/(?:時|時間)|円毎時|円\/h)$/i.test(input)) input = input.replace(/円\/(?:時|時間|h)$|円毎時$/i, "");
    else return result;
  } else if (kind === "days") {
    if (/月|時間|h|隔週|日数未/.test(input)) return result;
    input = input.replace(/^(?:平日)?週/, "").replace(/日\/(?:週|week)$/i, "").replace(/日$/, "").replace(/日(?=[~以上以下])/g, "");
  } else {
    if (/週|日|年/.test(input)) return result;
    input = input.replace(/^(?:月間|月)/, "").replace(/(?:時間|h)\/(?:月|month)$/i, "").replace(/(?:時間|h)$/i, "").replace(/(?:時間|h)(?=[~以上以下])/gi, "");
  }
  const match = new RegExp(`^${number}(?:~${number})?(以上|以下)?$`).exec(input);
  if (!match || match[3] && match[5]) return result;
  const first = unitNumber(match[1], match[2]), second = match[3] ? unitNumber(match[3], match[4]) : first;
  const cap = kind === "days" ? 7 : kind === "hours" ? 744 : 1000000;
  if (![first, second].every(value => Number.isFinite(value) && value >= 0 && value <= cap) || first > second || kind === "days" && (!Number.isInteger(first) || !Number.isInteger(second))) return result;
  return { state: "known", raw, unit, minimum: match[5] === "以下" ? 0 : first, maximum: match[5] === "以上" ? cap : second };
}
export function recordedStart(raw: string): RecordedStart {
  const value = normalized(raw).replace(/\s+/g, ""), result: RecordedStart = { state: value ? "ambiguous" : "missing", raw };
  const match = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})(?:日)?(?:から|以降|開始可能|開始可)?$/.exec(value);
  if (!match) return result;
  const date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  return validConditionDate(date) ? { state: "known", raw, date } : result;
}
export const validConditionDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function candidateConditionFacts(fields: InterviewFields | undefined) {
  return { days: recordedQuantity(fields?.daysPerWeek || "", "days"), hours: recordedQuantity(fields?.monthlyHours || "", "hours"), rate: recordedQuantity(fields?.desiredHourlyRate || "", "rate"), start: recordedStart(fields?.availableFrom || "") };
}
export function candidateConditionFilterCount(filter: CandidateConditionFilter): number {
  return Number(filter.daysMin !== undefined || filter.daysMax !== undefined) + Number(filter.hoursMin !== undefined || filter.hoursMax !== undefined)
    + Number(filter.rateMin !== undefined || filter.rateMax !== undefined) + Number(!!filter.availableBy) + Number(!!filter.conditionCheck && filter.conditionCheck !== "all");
}
export function matchesCandidateConditions(fields: InterviewFields | undefined, filter: CandidateConditionFilter): boolean {
  if (!candidateConditionFilterCount(filter)) return true;
  const facts = candidateConditionFacts(fields);
  for (const [field, minimum, maximum, cap] of [["days", filter.daysMin, filter.daysMax, 7], ["hours", filter.hoursMin, filter.hoursMax, 744], ["rate", filter.rateMin, filter.rateMax, 1000000]] as const) {
    if (minimum === undefined && maximum === undefined) continue;
    if ([minimum, maximum].some(value => value !== undefined && (!Number.isFinite(value) || value < 0 || value > cap || field === "days" && !Number.isInteger(value))) || minimum !== undefined && maximum !== undefined && minimum > maximum) return false;
    const fact = facts[field];
    if (fact.state !== "known" || minimum !== undefined && fact.minimum! < minimum || maximum !== undefined && fact.maximum! > maximum) return false;
  }
  if (filter.availableBy && (!validConditionDate(filter.availableBy) || facts.start.state !== "known" || facts.start.date! > filter.availableBy)) return false;
  if (filter.conditionCheck && filter.conditionCheck !== "all") {
    if (!conditionCheckOptions.some(option => option.value === filter.conditionCheck)) return false;
    const [field, state] = filter.conditionCheck.split(":") as [ConditionField, ConditionState];
    if (facts[field].state !== state) return false;
  }
  return true;
}

/** A small explicit vocabulary, not a classifier of experience or suitability. */
export function normalizeCandidateSearch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja")
    .replace(/saas|サース|サーズ/g, "saas")
    .replace(/テレフォンアポイント(?:メント)?|電話アポイント(?:メント)?|テレアポ|架電/g, "架電");
}
export function matchesCandidateWords(value: string, query: string, experience = false): boolean {
  const recorded = normalizeCandidateSearch(value), words = normalizeCandidateSearch(query).trim().split(/\s+/).filter(Boolean);
  return words.every(word => {
    let index = recorded.indexOf(word);
    while (index >= 0) {
      const after=recorded.slice(index+word.length,index+word.length+40).replace(/^[\s、,:：]+/,""),before=recorded.slice(Math.max(0,index-20),index);
      const negated=/^(?:(?:の|は|が|について|業務は|はまだ|まだ)\s*)?(?:未経験|経験なし|経験無し|経験はない|経験がない|経験はありません|経験がありません|未対応|使ったことがない)/.test(after)
        ||/(?:未経験|経験なし|経験無し|未対応)(?:の|：|:)\s*$/.test(before)
        ||/(?:^|[\s。、])(?:未経験|経験なし|経験無し|未対応)\s*$/.test(before);
      if (!experience || /未経験|経験なし|経験無し|未対応/.test(word) || !negated) return true;
      index = recorded.indexOf(word, index + word.length);
    }
    return false;
  });
}
