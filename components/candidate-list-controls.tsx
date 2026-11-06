import { useId, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, Filter, SlidersHorizontal, X } from "lucide-react";
import { candidateAppointmentFilters, candidateFilterCount, candidateProfileFilters, candidateSortFields, type CandidateGroupFilter, type CandidateGroupSort } from "@/lib/candidate-groups";
import type { SheetPlayer } from "@/lib/sheets-client";
import { pcOptions, crmOptions } from "@/lib/candidate-intake";
import { conditionCheckOptions, validConditionDate } from "@/lib/candidate-conditions";
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
  const pcChoices=unique([...pcOptions,...(typeof filter.pcEnvironment==="string"?[filter.pcEnvironment]:[])]),crmChoices=unique([...crmOptions,...(typeof filter.crmTool==="string"?[filter.crmTool]:[])]);
  const missingOwner = admin && !["all", "unassigned", ...players.map(player => player.id)].includes(filter.owner);
  const sortLabel = candidateSortFields.find(option => option.value === sort.field)?.label || "最終面談日";
  const patch = (next: Partial<CandidateGroupFilter>) => onFilterChange({ ...filter, ...next });
  const ranges = [{label:"週の稼働日数",unit:"日/週",min:"daysMin",max:"daysMax",cap:7,step:1},{label:"月の稼働時間",unit:"時間/月",min:"hoursMin",max:"hoursMax",cap:744,step:0.5},{label:"希望時給",unit:"円/時",min:"rateMin",max:"rateMax",cap:1000000,step:1}] as const;
  function changeBound(key: typeof ranges[number]["min"] | typeof ranges[number]["max"], value: string, cap: number) {
    if (!value) { patch({[key]:undefined}); return; }
    const number=Number(value);if(/^\d+(?:\.\d+)?$/.test(value)&&Number.isFinite(number)&&number>=0&&number<=cap)patch({[key]:number});
  }
  const invalidRange=ranges.find(range=>filter[range.min]!==undefined&&filter[range.max]!==undefined&&filter[range.min]!>filter[range.max]!);
  const invalidDays=[filter.daysMin,filter.daysMax].some(value=>value!==undefined&&!Number.isInteger(value));
  const confirmationField=filter.conditionCheck?.split(":")[0];
  const confirmationRange=confirmationField==="days"?ranges[0]:confirmationField==="hours"?ranges[1]:confirmationField==="rate"?ranges[2]:undefined;
  const conflictingConfirmation=confirmationRange&&(filter[confirmationRange.min]!==undefined||filter[confirmationRange.max]!==undefined)||confirmationField==="start"&&!!filter.availableBy;
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
        {intakeEnabled&&<fieldset className="candidate-profile-options"><legend>基本情報の登録内容から探す</legend><p>追加入力は不要です。記載された言葉・選択値で絞り込み、経験や適性は推定しません。</p><div>
          <label>PC環境<select aria-label="候補者のPC環境で絞り込み" value={companyValue(filter.pcEnvironment)} onChange={event=>{const value=event.target.value;if(value==="all")patch({pcEnvironment:undefined});else if(value==="none")patch({pcEnvironment:null});else{const choice=pcChoices.find(item=>companyValue(item)===value);if(choice!==undefined)patch({pcEnvironment:choice});}}}><option value="all">すべてのPC環境</option><option value="none">PC環境の記載なし</option>{pcChoices.map(choice=><option key={choice} value={companyValue(choice)}>{choice}</option>)}</select></label>
          <label>登録されたCRM<select aria-label="候補者の登録CRMで絞り込み" value={companyValue(filter.crmTool)} onChange={event=>{const value=event.target.value;if(value==="all")patch({crmTool:undefined});else if(value==="none")patch({crmTool:null});else{const choice=crmChoices.find(item=>companyValue(item)===value);if(choice!==undefined)patch({crmTool:choice});}}}><option value="all">すべてのCRM</option><option value="none">CRMの登録なし</option>{crmChoices.map(choice=><option key={choice} value={companyValue(choice)}>{choice}</option>)}</select></label>
          <label>経験・強みの記載キーワード<input aria-label="候補者の経験・強みの記載で絞り込み" type="search" value={filter.experienceKeyword||""} onChange={event=>patch({experienceKeyword:event.target.value})} maxLength={200} placeholder="例：法人営業 テレアポ"/><small>営業経験・職歴、実績、強み、PCスキルを検索。SaaS・サース等の表記違いにも対応</small></label>
          <label>稼働条件の記載キーワード<input aria-label="候補者の稼働条件の記載で絞り込み" type="search" value={filter.availabilityKeyword||""} onChange={event=>patch({availabilityKeyword:event.target.value})} maxLength={200} placeholder="例：平日 週3日"/><small>開始可能日、時間帯、日数、時間数、稼働形態などを検索</small></label>
        </div><div className="candidate-numeric-conditions">
          {ranges.map(range=><fieldset key={range.min}><legend>{range.label}<small>{range.unit}</small></legend><div><label>下限<input type="number" inputMode="decimal" min={0} max={range.cap} step={range.step} aria-label={`${range.label}の下限`} value={filter[range.min]??""} onChange={event=>changeBound(range.min,event.target.value,range.cap)} placeholder="指定なし"/></label><span aria-hidden="true">〜</span><label>上限<input type="number" inputMode="decimal" min={0} max={range.cap} step={range.step} aria-label={`${range.label}の上限`} value={filter[range.max]??""} onChange={event=>changeBound(range.max,event.target.value,range.cap)} placeholder="指定なし"/></label></div></fieldset>)}
          <label>この日までに開始可能<input aria-label="候補者の開始可能日の上限" type="date" value={filter.availableBy||""} onChange={event=>{const value=event.target.value;if(!value||validConditionDate(value))patch({availableBy:value||undefined});}}/></label>
          <label>条件の記載・確認状態<select aria-label="候補者の条件の確認状態" value={filter.conditionCheck||"all"} onChange={event=>{const option=conditionCheckOptions.find(option=>option.value===event.target.value);if(option)patch({conditionCheck:option.value});}}>{conditionCheckOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>{invalidDays&&<p className="form-error" role="alert">週の稼働日数は0〜7の整数で指定してください。現在の条件では表示しません。</p>}{invalidRange&&<p className="form-error" role="alert">{invalidRange.label}は下限を上限以下にしてください。現在の条件では表示しません。</p>}{conflictingConfirmation&&<p className="info-box">未記載・要確認の項目には、同じ項目の範囲条件を同時に適用できません。<button type="button" className="text-button" onClick={()=>confirmationRange?patch({[confirmationRange.min]:undefined,[confirmationRange.max]:undefined}):patch({availableBy:undefined})}>その項目の範囲だけ解除</button></p>}<details className="candidate-condition-explanation"><summary>数値条件と原文の確認について</summary><p>すべての条件を同じ基本情報で満たす候補者を表示します。記載範囲がある場合は、その全体が指定した範囲内にあるものが対象です。希望時給は「時給」「円/時」など単位が明記された値だけを使い、月額から換算しません。「程度」「応相談」や年のない開始日は「要確認」に分けます。原文は候補者の「基本情報・紹介文」から確認できます。</p><p>表記違いは限定した辞書で照合し、経験や適性は推定しません。経験キーワードの「未経験」「経験なし」等の記載は、経験がある候補として扱いません。</p></details></fieldset>}
        <fieldset className="candidate-progress-options"><legend>企業ごとの進捗 <small>複数選択可・未選択ですべて</small></legend><div>{statusOptions.map(status => <label key={status || "empty-status"}><input type="checkbox" aria-label={`進捗：${status || "未設定"}`} checked={selectedStatuses.includes(status)} onChange={event => statusChanged(status, event.target.checked)}/><span>{status || "進捗未設定"}</span></label>)}</div></fieldset>
      </div><footer><p>予定は未完了のC面談・合否回答期日・稼働開始予定です。該当する方の他の履歴も残して表示します。</p><button type="button" className="text-button" disabled={!count} onClick={reset}><X size={14}/>フィルターを解除</button></footer>
    </section>}
    {open === "sort" && <section className="candidate-control-panel candidate-sort-panel" id={`${id}-sort`} aria-label="候補者の並べ替え設定"><header><div><h3>表示する順番</h3><p>並べ替える項目が未登録の場合は、昇順・降順のどちらでも最後に表示します。</p></div><button type="button" className="candidate-panel-close" aria-label="並べ替えを閉じる" onClick={close}><X size={18}/></button></header><div className="candidate-sort-fields"><label>並べ替える項目<select aria-label="候補者の並び順" value={sort.field} onChange={event => { const option = candidateSortFields.find(option => option.value === event.target.value); if (option) onSortChange({ ...sort, field: option.value }); }}>{candidateSortFields.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><div className="candidate-sort-directions" role="group" aria-label="候補者の並べ替え方向"><button type="button" aria-pressed={sort.direction === "asc"} onClick={() => onSortChange({ ...sort, direction: "asc" })}><ArrowUpNarrowWide size={16}/>昇順{sort.direction === "asc" && <Check size={14}/>}</button><button type="button" aria-pressed={sort.direction === "desc"} onClick={() => onSortChange({ ...sort, direction: "desc" })}><ArrowDownWideNarrow size={16}/>降順{sort.direction === "desc" && <Check size={14}/>}</button></div></div><p className="candidate-sort-help">{sort.field === "name" ? "昇順は氏名の文字順、降順はその逆です。" : sort.field === "records" ? "人物に紐づく提案・記録の件数です。昇順は少ない順、降順は多い順です。" : sort.field === "appointment" ? "未完了の予定のうち最も早い日付で並べます。昇順は近い日付から、降順は遠い日付からです。" : "一覧に表示する最終面談日で並べます。昇順は古い日付から、降順は新しい日付からです。"}</p></section>}
  </div>;
}
