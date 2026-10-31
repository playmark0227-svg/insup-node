import { sortCandidateRecords, statusTone, valueAt, type CandidateSort } from "./management-data.ts";
import type { CandidateRecord } from "./sheets-client.ts";

export type CandidateGroup = {
  key: string;
  name: string;
  playerId: string;
  records: CandidateRecord[];
};

export type CandidateAppointmentFilter = "all" | "overdue" | "today" | "future" | "none";
export type CandidateProfileFilter = "all" | "with" | "without";
export type CandidateGroupFilter = {
  owner: string; status: string; search: string;
  statuses?: string[]; company?: string | null;
  appointment?: CandidateAppointmentFilter; profile?: CandidateProfileFilter;
};
export type CandidateGroupSort = { field: "interview" | "name" | "appointment" | "records"; direction: "asc" | "desc" };
export const candidateSortFields = [
  { value: "interview", label: "最終面談日" },
  { value: "name", label: "候補者名" },
  { value: "appointment", label: "次の予定日" },
  { value: "records", label: "提案・記録数" },
] as const;
export const candidateAppointmentFilters = [
  { value: "all", label: "すべての予定" },
  { value: "overdue", label: "予定日を過ぎたもの" },
  { value: "today", label: "今日の予定" },
  { value: "future", label: "明日以降の予定" },
  { value: "none", label: "予定の登録なし" },
] as const;
export const candidateProfileFilters = [
  { value: "all", label: "すべての基本情報" },
  { value: "with", label: "基本情報あり" },
  { value: "without", label: "基本情報なし" },
] as const;

const withoutSpaces = (value: string) => value.replace(/[\s\u3000]/g, "");
const businessDate = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** Only recorded, unfinished appointments are eligible; a past plan never proves failure. */
export function candidateAppointments(records: readonly CandidateRecord[], today = businessDate()) {
  return records.flatMap(record => {
    if (["closed", "filled"].includes(statusTone(valueAt(record, 7)))) return [];
    return [
      { date: valueAt(record, 10), time: valueAt(record, 11), label: "C面談", done: valueAt(record, 17) },
      { date: valueAt(record, 18), time: valueAt(record, 20), label: "合否回答期日", done: valueAt(record, 21) },
      { date: valueAt(record, 23), time: "", label: "稼働開始予定", done: valueAt(record, 24) },
    ].filter(item => !item.done && validDate(item.date))
      .map(item => ({ ...item, recordId: record.recordId, company: valueAt(record, 2), overdue: item.date < today }));
  }).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) || a.recordId.localeCompare(b.recordId));
}

export function candidateFilterCount(filter: CandidateGroupFilter): number {
  return Number(filter.owner !== "all") + Number(!!filter.statuses?.length || filter.status !== "all")
    + Number(filter.company !== undefined) + Number(!!filter.appointment && filter.appointment !== "all")
    + Number(!!filter.profile && filter.profile !== "all");
}

/** Optional dates/names stay at the end in both directions; equal values use a stable identity order. */
export function sortCandidateGroups(groups: readonly CandidateGroup[], sort: CandidateGroupSort, today = businessDate()): CandidateGroup[] {
  const compareName = (a: CandidateGroup, b: CandidateGroup) => a.name.localeCompare(b.name, "ja", { numeric: true, sensitivity: "base" }) || a.key.localeCompare(b.key);
  const value = (group: CandidateGroup): string | number | null => {
    if (sort.field === "name") return group.name || null;
    if (sort.field === "records") return group.records.length;
    if (sort.field === "appointment") return candidateAppointments(group.records, today)[0]?.date || null;
    return group.records.map(record => valueAt(record, 1)).filter(validDate).sort().at(-1) || null;
  };
  const values = new Map(groups.map(group => [group.key, value(group)]));
  return [...groups].sort((a, b) => {
    const av = values.get(a.key)!, bv = values.get(b.key)!;
    if (av === null || bv === null) return av === null ? bv === null ? compareName(a, b) : 1 : -1;
    const order = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "ja", { numeric: true, sensitivity: "base" });
    return (sort.direction === "asc" ? order : -order) || compareName(a, b);
  });
}

/** A display grouping only: each proposal keeps its own record ID, version and profile. */
export function groupCandidates(records: CandidateRecord[], sort: CandidateSort): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  for (const record of sortCandidateRecords(records, sort)) {
    const name = withoutSpaces(record.candidateName);
    // Unmapped owners can belong to different people despite sharing an empty player ID.
    const identity = !name
      ? ["unnamed", record.recordId]
      : record.playerId
        ? ["assigned", record.playerId, name]
        : ["unassigned", withoutSpaces(valueAt(record, 4)), name];
    const key = JSON.stringify(identity);
    const existing = groups.get(key);
    if (existing) existing.records.push(record);
    else groups.set(key, { key, name, playerId: record.playerId, records: [record] });
  }
  return [...groups.values()];
}

/** Keep all proposals when one proposal matches both the progress and search filters. */
export function filterCandidateGroups(groups: CandidateGroup[], filter: CandidateGroupFilter, today = businessDate()): CandidateGroup[] {
  const search = filter.search.trim().toLowerCase();
  const statuses = filter.statuses?.length ? filter.statuses : filter.status !== "all" ? [filter.status] : [];
  function appointmentMatches(record: CandidateRecord): boolean {
    const choice = filter.appointment || "all";
    if (choice === "all") return true;
    if (!["overdue", "today", "future", "none"].includes(choice)) return false;
    const appointments = candidateAppointments([record], today);
    if (choice === "none") return !appointments.length;
    return appointments.some(item => choice === "overdue" ? item.date < today : choice === "today" ? item.date === today : item.date > today);
  }
  return groups.filter(group =>
    (filter.owner === "all" || (filter.owner === "unassigned" ? !group.playerId : group.playerId === filter.owner)) &&
    group.records.some(record =>
      (!statuses.length || statuses.includes(valueAt(record, 7))) &&
      (filter.company === undefined || (filter.company === null ? !valueAt(record, 2).trim() : valueAt(record, 2) === filter.company)) &&
      (filter.profile === undefined || filter.profile === "all" || (filter.profile === "with" ? !!record.profileId : !record.profileId)) &&
      appointmentMatches(record) &&
      (!search || `${record.candidateName} ${record.values.join(" ")}`.toLowerCase().includes(search))
    )
  );
}
