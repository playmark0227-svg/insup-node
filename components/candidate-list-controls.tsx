import { useId, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, Filter, SlidersHorizontal, X } from "lucide-react";
import { candidateAppointmentFilters, candidateFilterCount, candidateProfileFilters, candidateSortFields, type CandidateGroupFilter, type CandidateGroupSort } from "@/lib/candidate-groups";
import type { SheetPlayer } from "@/lib/sheets-client";
import "./candidate-list-controls.css";

export type CandidateListControlsProps = {
  filter: CandidateGroupFilter; onFilterChange: (filter: CandidateGroupFilter) => void;
  sort: CandidateGroupSort; onSortChange: (sort: CandidateGroupSort) => void;
  players: SheetPlayer[]; statuses: string[]; companies: string[]; admin: boolean; intakeEnabled: boolean;
};

const unique = (items: string[]) => [...new Set(items)].sort((a, b) => a.localeCompare(b, "ja"));
const companyValue = (company: string | null | undefined) => company === undefined ? "all" : company === null ? "none" : JSON.stringify([company]);

/** Inline panels keep the current results visible while changing one condition at a time. */
export function CandidateListControls({ filter, onFilterChange, sort, onSortChange, players, statuses, companies, admin, intakeEnabled }: CandidateListControlsProps) {
  const [open, setOpen] = useState<"filter" | "sort" | null>(null), id = useId();
  const filterButton = useRef<HTMLButtonElement>(null), sortButton = useRef<HTMLButtonElement>(null);
  const count = candidateFilterCount(filter), selectedStatuses = filter.statuses || (filter.status !== "all" ? [filter.status] : []);
  const knownCompanies = unique(companies.filter(company => !!company.trim()));
  const companyOptions = unique([...knownCompanies, ...(typeof filter.company === "string" ? [filter.company] : [])]), statusOptions = unique([...statuses, ...selectedStatuses]);
  const missingOwner = admin && !["all", "unassigned", ...players.map(player => player.id)].includes(filter.owner);
  const sortLabel = candidateSortFields.find(option => option.value === sort.field)?.label || "最終面談日";
  const patch = (next: Partial<CandidateGroupFilter>) => onFilterChange({ ...filter, ...next });
  function close() { const previous = open; setOpen(null); (previous === "filter" ? filterButton : sortButton).current?.focus(); }
  function reset() { onFilterChange({ owner: "all", status: "all", statuses: [], search: filter.search, appointment: "all", profile: "all" }); }
  function statusChanged(value: string, checked: boolean) {
    if (!statusOptions.includes(value)) return;
    patch({ status: "all", statuses: checked ? [...new Set([...selectedStatuses, value])] : selectedStatuses.filter(item => item !== value) });
  }
  return <div className="candidate-list-controls" onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <button ref={filterButton} type="button" className={`candidate-control-trigger${count ? " has-conditions" : ""}`} aria-label="候補者のフィルター" aria-expanded={open === "filter"} aria-controls={`${id}-filters`} onClick={() => setOpen(previous => previous === "filter" ? null : "filter")}><Filter size={16}/><span>フィルター</span>{count > 0 && <strong aria-label={`${count}種類の条件を適用中`}>{count}</strong>}</button>
    <button ref={sortButton} type="button" className="candidate-control-trigger" aria-label="候補者の並べ替え" aria-expanded={open === "sort"} aria-controls={`${id}-sort`} onClick={() => setOpen(previous => previous === "sort" ? null : "sort")}><SlidersHorizontal size={16}/><span>並べ替え</span><small>{sortLabel} · {sort.direction === "asc" ? "昇順" : "降順"}</small></button>
    {open === "filter" && <section className="candidate-control-panel" id={`${id}-filters`} aria-label="候補者フィルター"><header><div><h3>候補者を絞り込む</h3><p>選ぶと一覧にすぐ反映します。条件に合う提案が1件以上ある候補者を表示します。</p></div><button type="button" className="candidate-panel-close" aria-label="フィルターを閉じる" onClick={close}><X size={18}/></button></header>
      <div className="candidate-filter-grid">
        {admin && <label>担当者<select aria-label="候補者の担当者" value={filter.owner} onChange={event => { if (["all", "unassigned", ...players.map(player => player.id)].includes(event.target.value)) patch({ owner: event.target.value }); }}><option value="all">すべての担当者</option><option value="unassigned">担当者の対応が未設定</option>{missingOwner && <option value={filter.owner}>以前の担当者（現在は名簿なし）</option>}{players.map(player => <option key={player.id} value={player.id}>{player.name}{player.active === false ? "（停止中）" : ""}</option>)}</select></label>}
        <label>提案先<select aria-label="候補者の提案先で絞り込み" value={companyValue(filter.company)} onChange={event => { const value = event.target.value; if (value === "all") patch({ company: undefined }); else if (value === "none") patch({ company: null }); else { const company = companyOptions.find(item => companyValue(item) === value); if (company !== undefined) patch({ company }); } }}><option value="all">すべての提案先</option><option value="none">提案先が未登録</option>{companyOptions.map(company => <option key={company} value={companyValue(company)}>{company}{!knownCompanies.includes(company) ? "（現在は該当なし）" : ""}</option>)}</select></label>
        <label>次の予定<select aria-label="候補者の予定で絞り込み" value={filter.appointment || "all"} onChange={event => { const option = candidateAppointmentFilters.find(option => option.value === event.target.value); if (option) patch({ appointment: option.value }); }}>{candidateAppointmentFilters.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {intakeEnabled && <label>面談の基本情報<select aria-label="候補者の基本情報で絞り込み" value={filter.profile || "all"} onChange={event => { const option = candidateProfileFilters.find(option => option.value === event.target.value); if (option) patch({ profile: option.value }); }}>{candidateProfileFilters.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
        <fieldset className="candidate-progress-options"><legend>企業ごとの進捗 <small>複数選択可・未選択ですべて</small></legend><div>{statusOptions.map(status => <label key={status || "empty-status"}><input type="checkbox" aria-label={`進捗：${status || "未設定"}`} checked={selectedStatuses.includes(status)} onChange={event => statusChanged(status, event.target.checked)}/><span>{status || "進捗未設定"}</span></label>)}</div></fieldset>
      </div><footer><p>予定は未完了のC面談・合否回答期日・稼働開始予定です。該当する方の他の履歴も残して表示します。</p><button type="button" className="text-button" disabled={!count} onClick={reset}><X size={14}/>フィルターを解除</button></footer>
    </section>}
    {open === "sort" && <section className="candidate-control-panel candidate-sort-panel" id={`${id}-sort`} aria-label="候補者の並べ替え設定"><header><div><h3>表示する順番</h3><p>並べ替える項目が未登録の場合は、昇順・降順のどちらでも最後に表示します。</p></div><button type="button" className="candidate-panel-close" aria-label="並べ替えを閉じる" onClick={close}><X size={18}/></button></header><div className="candidate-sort-fields"><label>並べ替える項目<select aria-label="候補者の並び順" value={sort.field} onChange={event => { const option = candidateSortFields.find(option => option.value === event.target.value); if (option) onSortChange({ ...sort, field: option.value }); }}>{candidateSortFields.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><div className="candidate-sort-directions" role="group" aria-label="候補者の並べ替え方向"><button type="button" aria-pressed={sort.direction === "asc"} onClick={() => onSortChange({ ...sort, direction: "asc" })}><ArrowUpNarrowWide size={16}/>昇順{sort.direction === "asc" && <Check size={14}/>}</button><button type="button" aria-pressed={sort.direction === "desc"} onClick={() => onSortChange({ ...sort, direction: "desc" })}><ArrowDownWideNarrow size={16}/>降順{sort.direction === "desc" && <Check size={14}/>}</button></div></div><p className="candidate-sort-help">{sort.field === "name" ? "昇順は氏名の文字順、降順はその逆です。" : sort.field === "records" ? "人物に紐づく提案・記録の件数です。昇順は少ない順、降順は多い順です。" : sort.field === "appointment" ? "未完了の予定のうち最も早い日付で並べます。昇順は近い日付から、降順は遠い日付からです。" : "一覧に表示する最終面談日で並べます。昇順は古い日付から、降順は新しい日付からです。"}</p></section>}
  </div>;
}
