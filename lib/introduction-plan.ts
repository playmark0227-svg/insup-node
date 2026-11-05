import { unicodeLength, type InterviewFields } from "./candidate-intake.ts";
import { introductionHeadings } from "./introduction-style.ts";
import { introductionRankQualifications, missingIntroductionRankQualification } from "./introduction-review.ts";

export type IntroductionNarrativeSection = "experience" | "results" | "summary";
export type IntroductionFixedSection = "basic" | "tools" | "availability";
export type IntroductionPlanSection = IntroductionNarrativeSection | IntroductionFixedSection;
export type IntroductionPlanSettings = {
  sectionOrder: readonly IntroductionPlanSection[];
  tone: "formal" | "plain";
  targetLength: 600 | 1000;
  includeSummary: boolean;
};
export type IntroductionPlan = {
  fixed: Record<IntroductionFixedSection, string>;
  narrativeSections: IntroductionNarrativeSection[];
  narrativeFacts: Partial<Record<"職歴" | "実績" | "強み", string>>;
  attributionNotes: Record<IntroductionNarrativeSection, string>;
  rankQualifications: Record<IntroductionNarrativeSection, string[]>;
  sectionOrder: IntroductionPlanSection[];
  tone: IntroductionPlanSettings["tone"];
  limit: number;
  /** Characters left for all model-written bodies, after headings and source notes. */
  budget: number;
  overflow: boolean;
};

const narrativeKeys = new Set<IntroductionPlanSection>(["experience", "results", "summary"]);
const hasText = (value: string) => !!value.trim();
const emptyEvidence = /^(?:[（(【\[]\s*)?(?:(?:未確認|確認中|未記入|未入力|記載なし|記載無し|情報なし|情報無し|データなし|データ無し|空欄|特になし)(?:です|でした)?|これから確認します)[。．.!！]?(?:\s*[）)】\]])?$/;
const hasNarrativeEvidence = (value: string) => hasText(value) && !emptyEvidence.test(value.trim());
function lines(entries: readonly (readonly [string, string])[]): string {
  // Check emptiness without trimming or shortening the supplied factual value.
  return entries.filter(([, value]) => hasText(value)).map(([label, value]) => `${label}：${value}`).join("\n");
}
function section(id: IntroductionPlanSection, body: string): string {
  return `【${introductionHeadings[id]}】\n${body}`;
}

/**
 * Prepare local, already-reviewed facts for a small writing task. This does not
 * call an AI, rewrite facts, store references, or mutate the supplied profile.
 */
export function buildIntroductionPlan(name: string, preparedFields: InterviewFields, settings: IntroductionPlanSettings): IntroductionPlan {
  const fields = preparedFields;
  const gender = /^(?:回答しない|回答を控える|未回答)$/.test(fields.gender.trim()) ? "" : fields.gender;
  const fixed: IntroductionPlan["fixed"] = {
    basic: lines([
      ["氏名", name], ["年齢", fields.age], ["性別", gender], ["居住地", fields.residence],
      ["稼働開始可能日（希望）", fields.availableFrom], ["希望時間帯", fields.timeWindow],
      ["週の稼働日数（希望）", fields.daysPerWeek], ["月間稼働時間（希望）", fields.monthlyHours],
      ["稼働形態", fields.workStyle], ["希望単価", fields.desiredHourlyRate], ["副業・兼業", fields.sideJob],
    ]),
    tools: lines([
      ["PC環境", fields.pcEnvironment], ["通信環境", fields.networkEnvironment], ["PC操作・スキル", fields.pcSkills],
      ["CRM", fields.crmTools.filter(value => value !== "その他" && hasText(value)).join("／")],
      ["その他のCRM", fields.crmOther],
      ["チャット", fields.chatTools.filter(value => value !== "その他" && hasText(value)).join("／")],
      ["その他のチャット", fields.chatOther],
    ]),
    availability: hasText(fields.interviewAvailability) ? fields.interviewAvailability : "",
  };
  const narrativeFacts: IntroductionPlan["narrativeFacts"] = {};
  if (hasNarrativeEvidence(fields.workHistory)) narrativeFacts.職歴 = fields.workHistory;
  if (hasNarrativeEvidence(fields.achievements)) narrativeFacts.実績 = fields.achievements;
  if (hasNarrativeEvidence(fields.strengths)) narrativeFacts.強み = fields.strengths;
  const hasExperience = !!narrativeFacts.職歴;
  const hasResults = !!(narrativeFacts.実績 || narrativeFacts.強み);
  const sources = ([['職歴', fields.workHistory], ['実績', fields.achievements], ['強み', fields.strengths]] as const)
    .filter(([, value]) => /本人申告/.test(value)).map(([label]) => label);
  const resultSources = sources.filter(value => value !== "職歴");
  const attributionNotes: IntroductionPlan["attributionNotes"] = {
    experience: sources.includes("職歴") ? "職歴には本人申告の内容を含みます。" : "",
    results: resultSources.length ? `${resultSources.join("・")}には本人申告の内容を含みます。` : "",
    summary: sources.length ? `総評の${sources.join("・")}に関する記載には本人申告を含みます。` : "",
  };
  const rankQualifications:IntroductionPlan["rankQualifications"]={
    experience:introductionRankQualifications(fields.workHistory),
    results:[...introductionRankQualifications(fields.achievements),...introductionRankQualifications(fields.strengths)],
    summary:[...introductionRankQualifications(fields.workHistory),...introductionRankQualifications(fields.achievements),...introductionRankQualifications(fields.strengths)],
  };
  const sectionOrder = [...new Set(settings.sectionOrder)];
  const availableNarrative: Record<IntroductionNarrativeSection, boolean> = {
    experience: hasExperience,
    results: hasResults,
    summary: settings.includeSummary && (hasExperience || hasResults),
  };
  const narrativeSections = sectionOrder.filter((id): id is IntroductionNarrativeSection =>
    narrativeKeys.has(id) && availableNarrative[id as IntroductionNarrativeSection]);
  const limit = Math.min(1000, settings.targetLength);
  // Reserve each planned narrative heading and its fixed provenance note. The
  // remaining budget is for model prose only; fixed facts are never truncated.
  const reserved = sectionOrder.flatMap(id => {
    if (narrativeKeys.has(id)) {
      const key = id as IntroductionNarrativeSection;
      return narrativeSections.includes(key) ? [section(key, [attributionNotes[key],rankQualifications[key].length?`順位の確認範囲：${rankQualifications[key].join("。")}。`:""].filter(Boolean).map(note=>`${note}\n`).join(""))] : [];
    }
    const body = fixed[id as IntroductionFixedSection];
    return body ? [section(id, body)] : [];
  }).join("\n\n");
  const budget = limit - unicodeLength(reserved);
  return { fixed, narrativeSections, narrativeFacts, attributionNotes, rankQualifications, sectionOrder, tone: settings.tone, limit, budget, overflow: budget < 0 };
}

function narrativeSection(plan:IntroductionPlan,key:IntroductionNarrativeSection,value:string|undefined):string|null {
 if(!plan.narrativeSections.includes(key)||!value?.trim())return null;
 const body=value.trim(),note=plan.attributionNotes[key];
 const attributed=/(?:本人申告|本人による|本人から|と伺|と聞|とのこと|との申告)/.test(body);
 const qualification=missingIntroductionRankQualification(body,plan.rankQualifications[key])?`順位の確認範囲：${plan.rankQualifications[key].join("。")}。`:"";
 return section(key,[note&&!attributed?note:"",body,qualification].filter(Boolean).join("\n"));
}

/** The same bounded source notes must be present in validation and presentation. */
export function composeIntroductionNarrative(plan:IntroductionPlan,bodies:Partial<Record<IntroductionNarrativeSection,string>>):string {
 return plan.narrativeSections.map(key=>narrativeSection(plan,key,bodies[key])).filter((text):text is string=>!!text).join("\n\n");
}

/**
 * Assemble only permitted narrative bodies around untouched fixed facts. The
 * caller validates AI prose and the final length; this function never shortens
 * names, dates, units, source qualifications, or model-written sentences.
 */
export function composeIntroductionPlan(plan: IntroductionPlan, narrativeBodies: Partial<Record<IntroductionNarrativeSection, string>>): string {
  return plan.sectionOrder.flatMap(id => {
    if (narrativeKeys.has(id)) {
      const key = id as IntroductionNarrativeSection;
      const value=narrativeSection(plan,key,narrativeBodies[key]);
      return value?[value]:[];
    }
    const body = plan.fixed[id as IntroductionFixedSection];
    return body ? [section(id, body)] : [];
  }).join("\n\n");
}
