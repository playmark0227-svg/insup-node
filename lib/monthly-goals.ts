export type MonthlyGoal = { playerId: string; month: string; target: number; version: string; updatedAt: string };
export type MonthlyGoalPlayer = { id: string; name?: string; target: number; active?: boolean };
export type MonthlyGoalResolution = { target: number | null; status: "confirmed" | "standard" | "unset"; version: string; goal: MonthlyGoal | null };
export type MonthlyGoalPayload = { playerId: string; month: string; target: number; expectedVersion: string };
export type MonthlyGoalSaveResult = MonthlyGoal & { operationId: string };
export const validGoalMonth = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && Number(month.slice(0, 4)) >= 1900 && Number(month.slice(0, 4)) <= 2100;
export const validMonthlyGoalTarget = (target: unknown): target is number => typeof target === "number" && Number.isSafeInteger(target) && target >= 0 && target <= 9999;
export const monthlyGoalKey = (playerId: string, month: string) => `${month}:${playerId}`;
export function goalBusinessMonth(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(now);
}
export function validMonthlyGoal(value: unknown): value is MonthlyGoal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const goal = value as MonthlyGoal;
  return typeof goal.playerId === "string" && !!goal.playerId && goal.playerId !== "ADMIN" && typeof goal.month === "string" && validGoalMonth(goal.month) && validMonthlyGoalTarget(goal.target) && typeof goal.version === "string" && !!goal.version && typeof goal.updatedAt === "string" && Number.isFinite(Date.parse(goal.updatedAt));
}
/** A month without its own saved goal never inherits a historical target. */
export function resolveMonthlyGoal(goals: readonly MonthlyGoal[], player: MonthlyGoalPlayer, month: string, currentMonth = goalBusinessMonth()): MonthlyGoalResolution {
  if (!validGoalMonth(month) || !validGoalMonth(currentMonth)) return { target: null, status: "unset", version: "", goal: null };
  const goal = monthlyGoalHistory(goals, [player.id]).find(goal => goal.month === month);
  if (goal) return { target: goal.target, status: "confirmed", version: goal.version, goal };
  if (month >= currentMonth && validMonthlyGoalTarget(player.target)) return { target: player.target, status: "standard", version: "", goal: null };
  return { target: null, status: "unset", version: "", goal: null };
}
export function monthlyGoalHistory(goals: readonly MonthlyGoal[], playerIds?: readonly string[]): MonthlyGoal[] {
  const allowed = playerIds ? new Set(playerIds) : null, byKey = new Map<string, MonthlyGoal>();
  for (const goal of goals) {
    if (!validMonthlyGoal(goal) || allowed && !allowed.has(goal.playerId)) continue;
    const key = monthlyGoalKey(goal.playerId, goal.month), previous = byKey.get(key);
    if (!previous || Date.parse(goal.updatedAt) > Date.parse(previous.updatedAt) || goal.updatedAt === previous.updatedAt && goal.version > previous.version) byKey.set(key, goal);
  }
  return [...byKey.values()].sort((a, b) => b.month.localeCompare(a.month) || a.playerId.localeCompare(b.playerId));
}
export function monthlyGoalAttainment(count: number, goal: Pick<MonthlyGoalResolution, "target" | "status">): number | null {
  return goal.status === "confirmed" && goal.target !== null && goal.target > 0 && Number.isFinite(count) && count >= 0 ? Math.round(count / goal.target * 100) : null;
}
export function monthlyGoalStatusLabel(status: MonthlyGoalResolution["status"]): string {
  return status === "confirmed" ? "確定済み" : status === "standard" ? "標準目標・未確定" : "未設定";
}
export function assertMonthlyGoalSaveResult(value: unknown, payload: MonthlyGoalPayload, operationId: string): asserts value is MonthlyGoalSaveResult {
  if (!validMonthlyGoal(value)) throw new Error("目標の保存結果を確認できませんでした。同じ内容で再試行してください。");
  const result = value as MonthlyGoalSaveResult;
  if (result.operationId !== operationId || result.playerId !== payload.playerId || result.month !== payload.month || result.target !== payload.target || result.version === payload.expectedVersion) throw new Error("目標の保存結果が一致しません。同じ内容で再試行してください。");
}
