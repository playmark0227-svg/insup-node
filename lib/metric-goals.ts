/** Seven dated outcomes. Client acceptance and both-side matching remain separate. */
export const goalMetrics = ["候補者面談", "提案", "C面談予約", "クライアント面談", "内定", "内定承諾", "稼働開始"] as const;
export type GoalMetric = typeof goalMetrics[number];
export type MetricTargets = Record<GoalMetric, number | null>;
export type MetricCounts = Record<GoalMetric, number>;
export type GoalDailyBasis = "calendar" | "weekdays" | "custom";
export type MetricGoal = { playerId: string; month: string; targets: MetricTargets; dailyBasis: GoalDailyBasis; customBusinessDays: number | null; version: string; updatedAt: string };
export type ProposalGoal = { playerId: string; month: string; target: number; version: string; updatedAt: string };
export type MetricGoalPlayer = { id: string; name: string; active: boolean };
export type MetricGoalsData = { feature: true; month: string; today: string; checkedAt: string; players: MetricGoalPlayer[]; goals: MetricGoal[]; legacyProposalGoals: ProposalGoal[]; counts: Record<string, MetricCounts>; dailyCounts: Record<string, Record<string, MetricCounts>> };
export type MetricGoalPayload = Pick<MetricGoal, "playerId" | "month" | "targets" | "dailyBasis" | "customBusinessDays"> & { expectedVersion: string; expectedProposalVersion: string };
export const goalMetricLabels: Record<GoalMetric, string> = { 候補者面談: "面談実施", 提案: "提案数", C面談予約: "C面談予約", クライアント面談: "C面談実施", 内定: "合格（クライアント）", 内定承諾: "マッチ数", 稼働開始: "稼働開始" };
export const dailyBasisLabels: Record<GoalDailyBasis, string> = { calendar: "暦日", weekdays: "平日（月〜金・祝日を含む）", custom: "指定営業日数（月内均等配分）" };
export const emptyMetricTargets = (): MetricTargets => Object.fromEntries(goalMetrics.map(metric => [metric, null])) as MetricTargets;
export const emptyMetricCounts = (): MetricCounts => Object.fromEntries(goalMetrics.map(metric => [metric, 0])) as MetricCounts;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const validMetricGoalMonth = (value: unknown): value is string => typeof value === "string" && /^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value);
export function daysInGoalMonth(month: string): number { return validMetricGoalMonth(month) ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate() : 0; }
export const validGoalTarget = (value: unknown): value is number | null => value === null || typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 9999;
export function validMetricTargets(value: unknown): value is MetricTargets { return object(value) && Object.keys(value).length === goalMetrics.length && goalMetrics.every(metric => Object.prototype.hasOwnProperty.call(value, metric) && validGoalTarget(value[metric])); }
export function validGoalDailyBasis(basis: unknown, count: unknown, month: string): basis is GoalDailyBasis { return (basis === "calendar" || basis === "weekdays") && count === null || basis === "custom" && typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= daysInGoalMonth(month); }
export function goalTokyoDay(now = new Date()): string { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export const validGoalDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && validMetricGoalMonth(value.slice(0, 7)) && Number(value.slice(8)) >= 1 && Number(value.slice(8)) <= daysInGoalMonth(value.slice(0, 7));
export function validMetricGoal(value: unknown): value is MetricGoal { return object(value) && typeof value.playerId === "string" && /^ND-\d+$/.test(value.playerId) && validMetricGoalMonth(value.month) && validMetricTargets(value.targets) && validGoalDailyBasis(value.dailyBasis, value.customBusinessDays, value.month) && typeof value.version === "string" && !!value.version && typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)); }
/** The old proposal table is authoritative while old browser versions can still edit it. */
export function resolveMetricGoal(data: Pick<MetricGoalsData, "goals" | "legacyProposalGoals">, playerId: string, month: string): MetricGoalPayload {
  const row = data.goals.find(goal => goal.playerId === playerId && goal.month === month), proposal = data.legacyProposalGoals.find(goal => goal.playerId === playerId && goal.month === month);
  return { playerId, month, targets: { ...(row?.targets ?? emptyMetricTargets()), 提案: proposal?.target ?? null }, dailyBasis: row?.dailyBasis ?? "calendar", customBusinessDays: row?.customBusinessDays ?? null, expectedVersion: row?.version ?? "", expectedProposalVersion: proposal?.version ?? "" };
}
export function goalAttainment(actual: number, target: number | null): number | null { return target !== null && target > 0 && Number.isFinite(actual) && actual >= 0 ? Math.round(actual / target * 100) : null; }
export type GoalDailyProgress = { denominator: number; elapsedDays: number; perDay: number | null; expectedToDate: number | null; remainingTarget: number | null; period: "past" | "current" | "future"; approximate: boolean };
/** No holiday calendar or individual schedule is inferred. Custom days are an explicit monthly divisor. */
export function goalDailyProgress(month: string, target: number | null, basis: GoalDailyBasis, customBusinessDays: number | null, today = goalTokyoDay(), actual = 0): GoalDailyProgress {
  if (!validMetricGoalMonth(month) || !validGoalDay(today) || !validGoalTarget(target) || !validGoalDailyBasis(basis, customBusinessDays, month)) throw new Error("対象月・日割り基準を確認してください。");
  const monthDays = daysInGoalMonth(month), currentMonth = today.slice(0, 7), period = month < currentMonth ? "past" : month > currentMonth ? "future" : "current", lastElapsed = period === "past" ? monthDays : period === "future" ? 0 : Number(today.slice(8));
  let denominator = monthDays, elapsedDays = lastElapsed;
  if (basis === "weekdays") { denominator = 0; elapsedDays = 0; for (let day = 1; day <= monthDays; day++) { const weekday = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, day)).getUTCDay(); if (weekday !== 0 && weekday !== 6) { denominator++; if (day <= lastElapsed) elapsedDays++; } } }
  if (basis === "custom") { denominator = customBusinessDays!; elapsedDays = denominator * lastElapsed / monthDays; }
  return { denominator, elapsedDays, perDay: target === null ? null : target / denominator, expectedToDate: target === null ? null : target * elapsedDays / denominator, remainingTarget: target === null ? null : Math.max(0, target - Math.max(0, actual)), period, approximate: basis === "custom" };
}
function countsValid(value: unknown): value is MetricCounts { return object(value) && Object.keys(value).length === goalMetrics.length && goalMetrics.every(metric => typeof value[metric] === "number" && Number.isSafeInteger(value[metric]) && Number(value[metric]) >= 0); }
export function assertMetricGoalsData(value: unknown, month: string): asserts value is MetricGoalsData {
  const bad = () => { throw new Error("月別目標の取得内容を確認できませんでした。最新の情報を取得してください。"); };
  if (!object(value) || value.feature !== true || value.month !== month || !validGoalDay(value.today) || typeof value.checkedAt !== "string" || !Number.isFinite(Date.parse(value.checkedAt)) || !Array.isArray(value.players) || !Array.isArray(value.goals) || !Array.isArray(value.legacyProposalGoals) || !object(value.counts) || !object(value.dailyCounts)) return bad();
  const ids = new Set<string>(), goalOwners = new Set<string>(), proposalOwners = new Set<string>();
  for (const player of value.players) { if (!object(player) || typeof player.id !== "string" || !/^ND-\d+$/.test(player.id) || ids.has(player.id) || typeof player.name !== "string" || typeof player.active !== "boolean") return bad(); ids.add(player.id); }
  for (const goal of value.goals) { if (!validMetricGoal(goal) || goal.month !== month || !ids.has(goal.playerId) || goalOwners.has(goal.playerId)) return bad(); goalOwners.add(goal.playerId); }
  for (const goal of value.legacyProposalGoals) { if (!object(goal) || typeof goal.playerId !== "string" || !ids.has(goal.playerId) || proposalOwners.has(goal.playerId) || goal.month !== month || goal.target === null || !validGoalTarget(goal.target) || typeof goal.version !== "string" || !goal.version || typeof goal.updatedAt !== "string" || !Number.isFinite(Date.parse(goal.updatedAt))) return bad(); proposalOwners.add(goal.playerId); }
  const monthlyCounts = value.counts;
  if (Object.keys(monthlyCounts).length !== ids.size || Object.keys(monthlyCounts).some(id => !ids.has(id) || !countsValid(monthlyCounts[id]))) return bad();
  for (const [day, counts] of Object.entries(value.dailyCounts)) if (!validGoalDay(day) || day.slice(0, 7) !== month || !object(counts) || Object.keys(counts).length !== ids.size || Object.keys(counts).some(id => !ids.has(id) || !countsValid(counts[id]))) return bad();
}
