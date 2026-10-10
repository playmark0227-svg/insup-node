import type { CandidateRecord, InterviewReview } from "./sheets-client.ts";
import { valueAt } from "./management-data.ts";

export type ReviewDraft = { category: string; memo: string; nextAction: string };
export type ReviewAggregateItem = { category: string; count: number };
export type ReviewAdvice = { summary: string; actions: string[]; count: number; generatedAt: string };

export function eligibleReviewRecords(records: readonly CandidateRecord[], period: string): CandidateRecord[] {
  if (period !== "all" && !/^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(period)) return [];
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  return records.filter(record => {
    const interviewedAt = valueAt(record, 17);
    return isDate(interviewedAt) && !isDate(valueAt(record, 22)) && !isDate(valueAt(record, 24))
      && (period === "all" || interviewedAt.startsWith(period));
  });
}

export function reviewAggregateFingerprint(aggregate: readonly ReviewAggregateItem[]): string {
  const counts = new Map<string, number>();
  for (const item of aggregate) {
    if (Number.isFinite(item.count) && item.count > 0) counts.set(item.category, (counts.get(item.category) ?? 0) + item.count);
  }
  return JSON.stringify([...counts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function draftDirty(draft: ReviewDraft, savedReview?: Pick<InterviewReview, "category" | "memo" | "nextAction"> | null): boolean {
  return draft.category !== (savedReview?.category || "理由未確認")
    || draft.memo !== (savedReview?.memo || "")
    || draft.nextAction !== (savedReview?.nextAction || "");
}

export function reportCopyText(advice: ReviewAdvice, periodLabel: string): string {
  const date = new Date(advice.generatedAt);
  let generatedAt = "日時不明";
  if (Number.isFinite(date.getTime())) {
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value ?? "";
    generatedAt = `${part("year")}年${part("month")}月${part("day")}日 ${part("hour")}:${part("minute")}（日本時間）`;
  }
  return [
    "INSUP NODE 面談の振り返り",
    `対象期間：${periodLabel}`,
    `対象：${advice.count}件の理由記録`,
    `生成日時：${generatedAt}`,
    "",
    "理由の傾向",
    advice.summary,
    "",
    "次回の対応",
    ...advice.actions.map((action, index) => `${index + 1}. ${action}`),
    "",
    "理由の分類と件数から作成した改善案です。詳細な原因は記録と本人・クライアントへの確認をもとに判断してください。",
  ].join("\n");
}
