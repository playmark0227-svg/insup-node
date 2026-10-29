import type { CandidateRecord, InterviewAdviceUsage, SheetSnapshot } from "./sheets-client.ts";

export const insightMetrics = [
  { key: "interviews", stage: "候補者面談", label: "面談実施" },
  { key: "proposals", stage: "提案", label: "提案数" },
  { key: "booked", stage: "C面談予約", label: "C面談予約" },
  { key: "clientInterviews", stage: "クライアント面談", label: "C面談実施" },
  { key: "matches", stage: "内定承諾", label: "マッチ数" },
  { key: "starts", stage: "稼働開始", label: "稼働開始" },
] as const;
export const insightReviewCategories = ["条件のずれ", "事前確認不足", "面談準備不足", "仕事内容の認識違い", "連絡・日程調整", "募集枠・タイミング", "他案件との比較", "理由未確認", "その他"] as const;
export type InsightMetricKey = typeof insightMetrics[number]["key"];
export type WorkspaceEvidenceKey = InsightMetricKey | "interviewsToday" | "interviewsOverdue" | "resultsWaiting" | "startsOverdue" | "missingReviews" | "proposalTarget" | "reviewReasons";
export const workspaceEvidenceKeys: readonly WorkspaceEvidenceKey[] = [...insightMetrics.map(metric => metric.key), "interviewsToday", "interviewsOverdue", "resultsWaiting", "startsOverdue", "missingReviews", "proposalTarget", "reviewReasons"];
export type WorkspaceInsightAggregate = {
  role: "admin" | "player";
  period: string;
  asOf: string;
  metrics: { key: InsightMetricKey; count: number; previousCount: number | null }[];
  proposalTarget: number | null;
  memberCount: number;
  pipeline: { interviewsToday: number; interviewsOverdue: number; resultsWaiting: number; startsOverdue: number; missingReviews: number };
  reviewReasons: { category: string; count: number }[];
};
export type WorkspaceInsightAdvice = {
  summary: string;
  priorities: { title: string; action: string; evidenceKey: WorkspaceEvidenceKey }[];
  meetingQuestions: string[];
  generatedAt: string;
  period: string;
  source?: "generated" | "saved";
  aggregate: WorkspaceInsightAggregate;
  usage?: InterviewAdviceUsage;
};
export type WorkspaceInsightState = { advice: WorkspaceInsightAdvice | null; stale: boolean; configured: boolean; pending: boolean; usage: InterviewAdviceUsage };
export type FollowUpTask = {
  id: string;
  recordId: string;
  candidateName: string;
  companyName: string;
  playerId: string;
  kind: "interview_overdue" | "interview_today" | "result_waiting" | "start_overdue" | "missing_review" | "schedule_missing";
  urgency: "overdue" | "today" | "followup";
  title: string;
  evidence: string;
  suggestedAction: string;
  date: string;
};

const valueAt = (record: CandidateRecord, column: number) => String(record.values[column - 1] ?? "").trim();
export function validInsightDate(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2100) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validInsightPeriod(period: string): boolean {
  return period === "all" || /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && Number(period.slice(0, 4)) >= 1900 && Number(period.slice(0, 4)) <= 2100 || validInsightDate(period);
}
export function insightToday(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function previousInsightPeriod(period: string): string | null {
  if (period === "all") return null;
  if (!validInsightPeriod(period)) throw new Error("集計期間を確認してください。");
  const date = new Date(`${period.length === 7 ? `${period}-01` : period}T00:00:00.000Z`);
  if (period.length === 7) date.setUTCMonth(date.getUTCMonth() - 1);
  else date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, period.length);
}
const daysBetween = (earlier: string, later: string) => Math.floor((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
const endedStatus = (record: CandidateRecord) => /^(落選|辞退|案件枠埋まり|合格後離脱|稼働後離脱|C面談ブッチ)/.test(valueAt(record, 7)) || validInsightDate(valueAt(record, 26));
const finishedRecord = (record: CandidateRecord) => endedStatus(record) || validInsightDate(valueAt(record, 24)) || valueAt(record, 7) === "稼働開始";

/** Restrict records again even when a malformed client snapshot contains other owners. */
export function scopedInsightRecords(snapshot: SheetSnapshot): CandidateRecord[] {
  const owners = new Set(snapshot.players.filter(player => player.id !== "ADMIN" && (snapshot.self.role === "admin" || player.id === snapshot.self.playerId)).map(player => player.id));
  return (snapshot.records || []).filter(record => owners.has(record.playerId));
}

/** Dates indicate missing recorded milestones, not an inferred failure or a contact history. */
export function buildFollowUpTasks(snapshot: SheetSnapshot, today = insightToday()): FollowUpTask[] {
  if (!validInsightDate(today)) throw new Error("本日の日付を確認してください。");
  const reviewed = new Set((snapshot.interviewReviews || []).filter(review => snapshot.self.role === "admin" || review.playerId === snapshot.self.playerId).map(review => review.recordId));
  const tasks: FollowUpTask[] = [];
  const seen = new Set<string>();
  for (const record of scopedInsightRecords(snapshot)) {
    if (seen.has(record.recordId)) continue;
    seen.add(record.recordId);
    const proposed = valueAt(record, 8), interviewed = valueAt(record, 17), scheduled = valueAt(record, 10), plannedStart = valueAt(record, 23), offered = valueAt(record, 21), matched = valueAt(record, 22);
    const base = { recordId: record.recordId, candidateName: record.candidateName, companyName: valueAt(record, 2), playerId: record.playerId };
    const add = (task: Omit<FollowUpTask, keyof typeof base | "id">) => tasks.push({ ...base, ...task, id: `${record.recordId}:${task.kind}` });
    if (!finishedRecord(record)) {
      if (validInsightDate(plannedStart) && plannedStart < today) {
        add({ kind: "start_overdue", urgency: "overdue", title: "稼働開始の状況を確認", evidence: `稼働予定 ${plannedStart} · 開始日は未記録`, suggestedAction: "実際の開始日、または予定の変更を確認して記録する。", date: plannedStart });
      } else if (validInsightDate(scheduled) && !validInsightDate(interviewed) && scheduled <= today) {
        add({ kind: scheduled === today ? "interview_today" : "interview_overdue", urgency: scheduled === today ? "today" : "overdue", title: scheduled === today ? "今日のC面談を確認" : "C面談の実施状況を確認", evidence: `C面談予定 ${scheduled}${valueAt(record, 11) ? ` ${valueAt(record, 11)}` : ""} · 実施日は未記録`, suggestedAction: scheduled === today ? "参加意思と日時を確認し、面談後に実施日を記録する。" : "実施、延期、辞退のいずれかを確認し、日付と進捗を更新する。", date: scheduled });
      } else if (validInsightDate(proposed) && proposed <= today && !scheduled && !interviewed && !offered && !matched && !plannedStart && !/^(提案なし|面談実施|合格|マッチ|稼働予定)/.test(valueAt(record, 7))) {
        add({ kind: "schedule_missing", urgency: "followup", title: "C面談の予定日時を確認", evidence: `提案完了 ${proposed} · C面談の予定日は未登録`, suggestedAction: "クライアントと候補者に面談日時を確認し、決まった予定を登録する。", date: proposed });
      } else if (validInsightDate(interviewed) && interviewed <= today && !validInsightDate(offered) && !validInsightDate(matched)) {
        const deadline = valueAt(record, 18);
        const deadlineDue = validInsightDate(deadline) && deadline <= today;
        if (deadlineDue || daysBetween(interviewed, today) >= 3) add({ kind: "result_waiting", urgency: deadlineDue ? deadline < today ? "overdue" : "today" : "followup", title: "面談結果の状況を確認", evidence: `C面談実施 ${interviewed}${validInsightDate(deadline) ? ` · 回答期日 ${deadline}` : ""} · 合格・承諾日は未記録`, suggestedAction: "結果と回答予定をクライアントに確認する。合否待ちは不成立と判断しない。", date: deadlineDue ? deadline : interviewed });
      }
    }
    if (endedStatus(record) && validInsightDate(interviewed) && interviewed <= today && !validInsightDate(matched) && !validInsightDate(valueAt(record, 24)) && !reviewed.has(record.recordId)) {
      add({ kind: "missing_review", urgency: "followup", title: "確認できた理由を振り返りに残す", evidence: `C面談実施 ${interviewed} · ${valueAt(record, 7) || "離脱日を記録済み"} · 振り返り未記録`, suggestedAction: "不成立の理由を事実と推測に分け、次回の対応を記録する。", date: interviewed });
    }
  }
  const order = { overdue: 0, today: 1, followup: 2 };
  return tasks.sort((left, right) => order[left.urgency] - order[right.urgency] || left.date.localeCompare(right.date) || left.recordId.localeCompare(right.recordId));
}

const nonnegativeCount = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

/** Safe preview of the server aggregate; raw records never become an AI request body. */
export function buildWorkspaceInsightAggregate(snapshot: SheetSnapshot, period: string, today = insightToday()): WorkspaceInsightAggregate {
  if (!validInsightPeriod(period) || !validInsightDate(today)) throw new Error("集計期間と本日の日付を確認してください。");
  const members = snapshot.players.filter(player => player.id !== "ADMIN" && (snapshot.self.role === "admin" || player.id === snapshot.self.playerId));
  const owners = new Set(members.map(player => player.id));
  const previous = previousInsightPeriod(period);
  const count = (target: string, stage: typeof insightMetrics[number]["stage"]) => [...owners].reduce((total, owner) => total + nonnegativeCount(snapshot.counts[target]?.[owner]?.[stage]), 0);
  const records = scopedInsightRecords(snapshot);
  const tasks = buildFollowUpTasks(snapshot, today);
  const eligibleIds = new Set(records.filter(record => {
    const date = valueAt(record, 17);
    return validInsightDate(date) && !validInsightDate(valueAt(record, 22)) && !validInsightDate(valueAt(record, 24)) && (period === "all" || date.startsWith(period));
  }).map(record => record.recordId));
  const reasonCounts = new Map<string, number>();
  const reviewedIds = new Set<string>();
  for (const review of snapshot.interviewReviews || []) {
    if (!owners.has(review.playerId) || !eligibleIds.has(review.recordId) || reviewedIds.has(review.recordId) || !(insightReviewCategories as readonly string[]).includes(review.category)) continue;
    reviewedIds.add(review.recordId);
    reasonCounts.set(review.category, (reasonCounts.get(review.category) || 0) + 1);
  }
  return {
    role: snapshot.self.role,
    period,
    asOf: today,
    metrics: insightMetrics.map(metric => ({ key: metric.key, count: count(period, metric.stage), previousCount: previous ? count(previous, metric.stage) : null })),
    proposalTarget: period.length !== 7 ? null : snapshot.monthlyGoalsFeature
      ? members.every(member => (snapshot.monthlyGoals || []).some(goal => goal.playerId === member.id && goal.month === period))
        ? members.reduce((total, member) => total + (snapshot.monthlyGoals || []).find(goal => goal.playerId === member.id && goal.month === period)!.target, 0) : null
      : members.reduce((total, member) => total + (Number.isSafeInteger(member.target) && member.target > 0 && member.target <= 9999 ? member.target : 0), 0),
    memberCount: members.length,
    pipeline: {
      interviewsToday: tasks.filter(task => task.kind === "interview_today").length,
      interviewsOverdue: tasks.filter(task => task.kind === "interview_overdue").length,
      resultsWaiting: tasks.filter(task => task.kind === "result_waiting").length,
      startsOverdue: tasks.filter(task => task.kind === "start_overdue").length,
      missingReviews: tasks.filter(task => task.kind === "missing_review").length,
    },
    reviewReasons: insightReviewCategories.filter(category => reasonCounts.has(category)).map(category => ({ category, count: reasonCounts.get(category)! })),
  };
}

export function workspaceInsightFingerprint(aggregate: WorkspaceInsightAggregate): string {
  return JSON.stringify({
    role: aggregate.role, period: aggregate.period, asOf: aggregate.asOf,
    metrics: insightMetrics.map(metric => {
      const found = aggregate.metrics.find(item => item.key === metric.key);
      return { key: metric.key, count: found?.count ?? 0, previousCount: found?.previousCount ?? null };
    }),
    proposalTarget: aggregate.proposalTarget, memberCount: aggregate.memberCount,
    pipeline: { interviewsToday: aggregate.pipeline.interviewsToday, interviewsOverdue: aggregate.pipeline.interviewsOverdue, resultsWaiting: aggregate.pipeline.resultsWaiting, startsOverdue: aggregate.pipeline.startsOverdue, missingReviews: aggregate.pipeline.missingReviews },
    reviewReasons: insightReviewCategories.map(category => ({ category, count: aggregate.reviewReasons.filter(reason => reason.category === category).reduce((sum, reason) => sum + reason.count, 0) })).filter(reason => reason.count > 0),
  });
}

export function insightPeriodLabel(period: string): string {
  if (period === "all") return "累計";
  if (!validInsightPeriod(period)) return "期間未確認";
  return period.length === 7 ? `${period.slice(0, 4)}年${Number(period.slice(5))}月` : period.replaceAll("-", "/");
}
export function workspaceEvidenceLabel(key: WorkspaceEvidenceKey, aggregate: WorkspaceInsightAggregate): string {
  const metric = insightMetrics.find(item => item.key === key);
  if (metric) return `${metric.label} ${aggregate.metrics.find(item => item.key === key)?.count ?? 0}件`;
  const labels = { interviewsToday: "今日のC面談", interviewsOverdue: "予定日を過ぎたC面談・実施日未記録", resultsWaiting: "結果の確認対象", startsOverdue: "稼働予定日を過ぎた・開始日未記録", missingReviews: "不成立の振り返り未記録" };
  if (key === "proposalTarget") return aggregate.proposalTarget === null ? "月別目標は未確定または集計対象外" : `月間提案目標 ${aggregate.proposalTarget}件`;
  if (key === "reviewReasons") return aggregate.reviewReasons.length ? aggregate.reviewReasons.map(reason => `${reason.category} ${reason.count}件`).join(" / ") : "理由の記録なし";
  return `${labels[key as keyof typeof labels]} ${aggregate.pipeline[key as keyof WorkspaceInsightAggregate["pipeline"]]}件`;
}

export function workspaceInsightCopyText(advice: WorkspaceInsightAdvice): string {
  const date = new Date(advice.generatedAt);
  const generated = Number.isFinite(date.getTime()) ? date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "日時未確認";
  return [
    `INSUP NODE ${advice.aggregate.role === "admin" ? "成果ミーティングの準備" : "活動と面談の準備"}`,
    `対象期間：${insightPeriodLabel(advice.period)}`, `生成日時：${generated}（日本時間）`,
    "", "記録済みの成果", ...advice.aggregate.metrics.map(metric => workspaceEvidenceLabel(metric.key, advice.aggregate)),
    "", "AIによる整理", advice.summary,
    "", "次の行動の提案", ...advice.priorities.flatMap((priority, index) => [`${index + 1}. ${priority.title}`, priority.action, `根拠：${workspaceEvidenceLabel(priority.evidenceKey, advice.aggregate)}`]),
    "", advice.aggregate.role === "admin" ? "会議で確認すること" : "面談前に確認すること", ...advice.meetingQuestions.map((question, index) => `${index + 1}. ${question}`),
    "", "成果は各工程の日付による件数です。同じ候補者が同じ月に工程を進んだ割合ではありません。AIの提案は記録を確認して判断してください。",
  ].join("\n");
}
