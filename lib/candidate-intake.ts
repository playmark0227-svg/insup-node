import { introductionHeadings } from "./introduction-style.ts";

/** Candidate information is formatted in this browser. No external service is called. */
export const interviewStringFields = [
  "age", "gender", "residence", "availableFrom", "timeWindow", "daysPerWeek",
  "monthlyHours", "sideJob", "desiredHourlyRate", "pcEnvironment", "networkEnvironment",
  "attendanceConcerns", "workHistory", "achievements", "strengths", "crmOther", "chatOther",
  "interviewAvailability", "workStyle", "pcSkills", "additionalNotes",
  "interviewMemo", "selfReflection", "interviewAdvice",
] as const;

export type InterviewStringField = typeof interviewStringFields[number];
export type InterviewFields = Record<InterviewStringField, string> & {
  crmTools: string[];
  chatTools: string[];
};

export type CandidateProfile = {
  profileId: string;
  playerId: string;
  recordIds: string[];
  version: string;
  updatedAt: string;
  fields: InterviewFields;
  introduction: string;
};

export const pcOptions = ["Windows", "MacBook", "PCなし", "購入予定", "その他"] as const;
export const crmOptions = ["Salesforce", "kintone", "HubSpot", "その他"] as const;
export const chatOptions = ["Slack", "Chatwork", "その他"] as const;
export const genderOptions = ["", "男性", "女性", "その他", "回答しない"] as const;
export const interviewFieldLimits: Record<InterviewStringField,number> = {age:20,gender:20,residence:120,availableFrom:120,timeWindow:200,daysPerWeek:80,monthlyHours:80,sideJob:160,desiredHourlyRate:100,pcEnvironment:30,networkEnvironment:200,attendanceConcerns:600,workHistory:6000,achievements:1500,strengths:1500,crmOther:120,chatOther:120,interviewAvailability:300,workStyle:200,pcSkills:800,additionalNotes:2000,interviewMemo:2000,selfReflection:2000,interviewAdvice:5000};
export const introductionLimit = 1000;

export const interviewFieldLabels: Record<keyof InterviewFields | "candidateName", string> = {
  candidateName: "氏名", age: "年齢", gender: "性別", residence: "居住地",
  availableFrom: "稼働開始", timeWindow: "希望時間帯", daysPerWeek: "週の稼働日数",
  monthlyHours: "月間稼働時間", sideJob: "副業・兼業", desiredHourlyRate: "希望単価",
  pcEnvironment: "PC環境", networkEnvironment: "通信環境", attendanceConcerns: "勤怠・稼働上の確認事項",
  workHistory: "営業経験・職歴", achievements: "実績", strengths: "強み",
  crmOther: "その他のCRM", chatOther: "その他のチャット", crmTools: "CRM",
  chatTools: "チャット", interviewAvailability: "面談可能日", workStyle: "稼働形態", pcSkills: "PC操作・スキル", additionalNotes: "その他・補足",
  interviewMemo: "面談のメモ", selfReflection: "自分の振り返り", interviewAdvice: "保存した面談準備案",
};

export function blankInterviewFields(): InterviewFields {
  return Object.assign(Object.fromEntries(interviewStringFields.map(key => [key, ""])), {
    crmTools: [], chatTools: [],
  }) as unknown as InterviewFields;
}

/** Normalizes the known schema without shortening source information. */
export function normalizeInterviewFields(value: unknown): InterviewFields {
  const result = blankInterviewFields();
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  const source = value as Record<string, unknown>;
  for (const key of interviewStringFields) {
    if (typeof source[key] === "string") result[key] = source[key].replace(/\r\n?/g, "\n");
  }
  for (const key of ["crmTools", "chatTools"] as const) {
    if (Array.isArray(source[key])) {
      result[key] = [...new Set(source[key].filter((item): item is string => typeof item === "string")
        .map(item => item.trim()).filter(Boolean))];
    }
  }
  return result;
}

export function unicodeLength(value: string): number { return Array.from(value).length; }

export type IntroductionComposition = {
  text: string;
  /** True if any supplied field was shortened in the formatted introduction. */
  truncated: boolean;
  /** Field keys with omitted text. The original fields remain intact. */
  omittedFields: Array<keyof InterviewFields | "candidateName">;
};

type IntroductionEntry = {
  keys: Array<keyof InterviewFields | "candidateName">;
  label: string;
  value: string;
  weight: number;
};
type IntroductionSection = { title: string; entries: IntroductionEntry[] };

/**
 * A factual, immediate template. It does not score, infer, or recommend people.
 * Long source fields are retained by the caller; omissions are returned explicitly.
 */
export function composeCandidateIntroduction(candidateName: string, rawFields: InterviewFields): IntroductionComposition {
  const fields = normalizeInterviewFields(rawFields);
  const entry = (key: keyof InterviewFields | "candidateName", weight = 1): IntroductionEntry => ({
    keys: [key], label: interviewFieldLabels[key], weight,
    value: (key === "candidateName" ? candidateName : fields[key] as string).trim(),
  });
  const tools = (key: "crmTools" | "chatTools", otherKey: "crmOther" | "chatOther"): IntroductionEntry => {
    const other = fields[otherKey].trim();
    const values = fields[key].filter(value => value !== "その他" || !other);
    if (other) values.push(`その他：${other}`);
    return { keys: [...(fields[key].length ? [key] : []), ...(other ? [otherKey] : [])],
      label: interviewFieldLabels[key], value: values.join("・"), weight: 2 };
  };
  const sections: IntroductionSection[] = [
    { title: introductionHeadings.basic, entries: [entry("candidateName"), entry("age"), entry("gender"), entry("residence"),
      entry("availableFrom"), entry("timeWindow"), entry("daysPerWeek"), entry("monthlyHours"),
      entry("sideJob"), entry("desiredHourlyRate"), entry("workStyle")] },
    { title: introductionHeadings.experience, entries: [{ ...entry("workHistory", 3), label: "" }] },
    { title: introductionHeadings.results, entries: [entry("achievements", 2), entry("strengths", 2)] },
    { title: introductionHeadings.tools, entries: [entry("pcEnvironment"), entry("networkEnvironment"), entry("pcSkills"),
      tools("crmTools", "crmOther"), tools("chatTools", "chatOther")] },
    { title: introductionHeadings.availability, entries: [{ ...entry("interviewAvailability", 2), label: "" }] },
    // Attendance concerns, internal source notes and saved AI advice stay private.
    // They remain in the profile and are never automatically put in client copy.
  ].map(section => ({ ...section, entries: section.entries.filter(item => item.value) }))
    .filter(section => section.entries.length);
  const render = (baseLimit: number): string => sections.map(section => `【${section.title}】\n${section.entries.map(item => {
    const points = Array.from(item.value), limit = Math.max(1, baseLimit * item.weight);
    const value = points.length <= limit ? item.value : points.slice(0, limit - 1).join("") + "…";
    return `${item.label ? `${item.label}：` : ""}${value}`;
  }).join("\n")}`).join("\n\n");
  const longest = Math.max(1, ...sections.flatMap(section => section.entries.map(item => unicodeLength(item.value))));
  const full = render(longest);
  if (unicodeLength(full) <= introductionLimit) return { text: full, truncated: false, omittedFields: [] };

  // Fit all populated sections together. Longer narrative fields get a larger share.
  let low = 0, high = longest;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (unicodeLength(render(middle)) <= introductionLimit) low = middle;
    else high = middle - 1;
  }
  const omittedFields = [...new Set(sections.flatMap(section => section.entries
    .filter(item => unicodeLength(item.value) > Math.max(1, low * item.weight)).flatMap(item => item.keys)))];
  return { text: render(low), truncated: true, omittedFields };
}
