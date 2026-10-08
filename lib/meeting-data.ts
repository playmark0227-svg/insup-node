import type { Stage } from "./node-data";

export function previousMeetingMonth(period: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return null;
  const [year, month] = period.split("-").map(Number);
  return `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, "0")}`;
}

export function proposalAchievement(count: number, target: number): number | null {
  return Number.isFinite(target) && target > 0 ? Math.round(count / target * 100) : null;
}

type ExportRow = {
  id: string;
  name: string;
  target: number;
  counts: Record<string, number>;
  previous: Record<string, number>;
};

function csvCell(value: string | number): string {
  let text = String(value);
  // Player names are editable. Neutralize spreadsheet formulas before quoting.
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function meetingCsv(rows: ExportRow[], metrics: ReadonlyArray<{ stage: Stage; label: string }>, period: string): string {
  const monthly = previousMeetingMonth(period) !== null;
  const header = ["対象期間", "プレイヤーID", "氏名", ...metrics.map(metric => metric.label), ...(monthly ? [...metrics.map(metric => `${metric.label} 前月差`), "月間提案目標", "提案達成率（%）"] : [])];
  const body = rows.map(row => [period, row.id, row.name, ...metrics.map(metric => row.counts[metric.stage]), ...(monthly ? [...metrics.map(metric => row.counts[metric.stage] - row.previous[metric.stage]), row.target > 0 ? row.target : "未設定", proposalAchievement(row.counts["提案"], row.target) ?? "未設定"] : [])]);
  return [header, ...body].map(row => row.map(csvCell).join(",")).join("\r\n");
}

export function meetingCsvFilename(period: string): string {
  const safePeriod = previousMeetingMonth(period) || /^\d{4}-\d{2}-\d{2}$/.test(period) || period === "all" ? period : "period";
  return `insup-node-meeting-${safePeriod}.csv`;
}
