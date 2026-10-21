import { sortCandidateRecords, valueAt, type CandidateSort } from "./management-data.ts";
import type { CandidateRecord } from "./sheets-client.ts";

export type CandidateGroup = {
  key: string;
  name: string;
  playerId: string;
  records: CandidateRecord[];
};

export type CandidateGroupFilter = { owner: string; status: string; search: string };

const withoutSpaces = (value: string) => value.replace(/[\s\u3000]/g, "");

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
export function filterCandidateGroups(groups: CandidateGroup[], filter: CandidateGroupFilter): CandidateGroup[] {
  const search = filter.search.trim().toLowerCase();
  return groups.filter(group =>
    (filter.owner === "all" || (filter.owner === "unassigned" ? !group.playerId : group.playerId === filter.owner)) &&
    group.records.some(record =>
      (filter.status === "all" || valueAt(record, 7) === filter.status) &&
      (!search || `${record.candidateName} ${record.values.join(" ")}`.toLowerCase().includes(search))
    )
  );
}
