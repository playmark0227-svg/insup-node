import type { CandidateGroup } from "./candidate-groups.ts";
import { interviewFieldLabels, interviewStringFields, type CandidateProfile } from "./candidate-intake.ts";
import { matchingFields, valueAt } from "./management-data.ts";
import type { CandidateRecord, InterviewReview } from "./sheets-client.ts";

export type CandidateChatSource = {
  id: string;
  label: string;
  kind: "record" | "profile" | "review";
  facts: { label: string; value: string }[];
};
export type CandidateChatContext = { candidateName: string; sources: CandidateChatSource[]; omittedRecords: number };
export type CandidateFactAnswer = { text: string; sourceIds: string[] };

const CONTEXT_LIMIT = 28_000;
const normalizeName = (value: string) => value.replace(/[\s\u3000]/g, "");
const short = (value: string, limit: number) => value.length <= limit ? value : `${value.slice(0, limit - 14)}…（長文のため一部省略）`;
const fact = (label: string, value: unknown) => ({ label: short(label, 200), value: short(String(value ?? "").trim(), 2_500) });
const nonempty = (entry: { value: string }) => !!entry.value;

function recordLabel(record: CandidateRecord): string {
  return short(`${valueAt(record, 2) || "未提案"} · ${valueAt(record, 1) ? `面談 ${valueAt(record, 1)}` : "面談日未登録"} · 記録行 ${record.row}`, 180);
}

/** A context is made only from these exact rows, never a name search across the workspace. */
function ownedRecords(group: CandidateGroup): CandidateRecord[] {
  const seen = new Set<string>();
  let ownerAlias = group.records[0] ? normalizeName(valueAt(group.records[0], 4)) : "";
  try {
    const identity: unknown = JSON.parse(group.key);
    if (Array.isArray(identity) && identity[0] === "unassigned" && typeof identity[1] === "string") ownerAlias = identity[1];
  } catch { /* Older display keys may not be JSON; the first exact row defines the alias. */ }
  return group.records.filter(record => {
    if (!record.recordId || seen.has(record.recordId) || record.playerId !== group.playerId || normalizeName(record.candidateName) !== normalizeName(group.name)) return false;
    if (!group.playerId && normalizeName(valueAt(record, 4)) !== ownerAlias) return false;
    seen.add(record.recordId);
    return true;
  });
}

/** Keep the source ID exact. Large source fields are excerpts with an explicit notice. */
function fitSource(source: CandidateChatSource, budget: number): CandidateChatSource | null {
  if (source.id.length > 200 || budget < 250) return null;
  const result: CandidateChatSource = { ...source, label: short(source.label, 200), facts: [] };
  const notice = fact("省略", "文字数制限により一部の項目を省略しています。詳細は元の記録で確認してください。");
  for (const entry of source.facts.slice(0, 31)) {
    const room = budget - JSON.stringify({ ...result, facts: [...result.facts, entry, notice] }).length;
    if (room >= 0) { result.facts.push(entry); continue; }
    // Preserve a useful excerpt of a long memo, but never turn a date into a partial date.
    if (entry.value.length > 200 && room + entry.value.length > 120) {
      const excerpt = { ...entry, value: short(entry.value, Math.min(entry.value.length, room + entry.value.length - 4)) };
      if (JSON.stringify({ ...result, facts: [...result.facts, excerpt, notice] }).length <= budget) result.facts.push(excerpt);
    }
    break;
  }
  if (result.facts.length < source.facts.length || source.label.includes("長文のため一部省略") || source.facts.some(entry => entry.value.includes("長文のため一部省略"))) result.facts.push(notice);
  return result.facts.length && JSON.stringify(result).length <= budget ? result : null;
}

/** No network or browser dependency. Generated introductions and saved AI advice are not evidence. */
export function buildCandidateChatContext({ group, profiles, reviews = [] }: {
  group: CandidateGroup; profiles: CandidateProfile[]; reviews?: InterviewReview[];
}): CandidateChatContext {
  const owned = ownedRecords(group);
  const records = owned.filter(record => record.recordId.length <= 200).slice(0, 30);
  const ids = new Set(records.map(record => record.recordId));
  const recordSources: CandidateChatSource[] = records.map(record => ({
    id: record.recordId, label: recordLabel(record), kind: "record",
    facts: [2, 7, 6, 1, 10, 11, 17, 8, 9, 21, 22, 23, 24, 25, 26, 12, 13, 18, 19, 20, 5, 14, 15, 16, 3]
      .map(column => fact(matchingFields[column - 1], valueAt(record, column)))
      .concat([fact("紹介元", record.source), fact("担当", record.playerId || valueAt(record, 4)), fact("記録行", record.row)]).filter(nonempty),
  }));
  const seenProfiles = new Set<string>();
  const linkedRecords = (profile: CandidateProfile) => records.filter(record => profile.recordIds.includes(record.recordId) && (!record.profileId || record.profileId === profile.profileId));
  const eligibleProfiles = profiles.filter(profile => {
    if (!profile.profileId || seenProfiles.has(profile.profileId) || profile.playerId !== group.playerId || !linkedRecords(profile).length) return false;
    seenProfiles.add(profile.profileId); return true;
  });
  const profileSources: CandidateChatSource[] = eligibleProfiles.slice(0, 20).map(profile => ({
    id: `profile:${profile.profileId}`, kind: "profile",
    label: short(`基本情報 · ${linkedRecords(profile).map(recordLabel).join(" / ")}`, 200),
    facts: interviewStringFields.filter(key => key !== "interviewAdvice")
      .map(key => fact(interviewFieldLabels[key], profile.fields[key]))
      .concat([fact("CRM", profile.fields.crmTools.join("・")), fact("チャット", profile.fields.chatTools.join("・"))]).filter(nonempty),
  }));
  const seenReviews = new Set<string>();
  const eligibleReviews = [...reviews].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).filter(review => {
    if (!ids.has(review.recordId) || review.playerId !== group.playerId || seenReviews.has(review.recordId)) return false;
    seenReviews.add(review.recordId); return true;
  });
  const reviewSources: CandidateChatSource[] = eligibleReviews.slice(0, 30).map(review => ({
    id: `review:${review.recordId}`, kind: "review",
    label: short(`面談の振り返り · ${recordLabel(records.find(record => record.recordId === review.recordId)!)}`, 200),
    // nextAction may contain an earlier generated AI recommendation; do not re-ground it as fact.
    facts: [fact("C面談実施日", review.interviewDate), fact("記録された未マッチ理由", review.category), fact("確認した理由・事実", review.memo)].filter(nonempty),
  }));
  const context: CandidateChatContext = { candidateName: short(group.name, 120), sources: [], omittedRecords: group.records.length };
  const profileBudget = profileSources.length ? 7_000 : 0;
  const reviewBudget = reviewSources.length ? 2_500 : 0;
  const buckets: [CandidateChatSource[], number][] = [
    [recordSources, 26_000 - profileBudget - reviewBudget], [profileSources, profileBudget], [reviewSources, reviewBudget],
  ];
  for (const [sources, allocated] of buckets) {
    let remaining = allocated;
    for (let index = 0; index < sources.length; index++) {
      const packed = fitSource(sources[index], Math.floor(remaining / (sources.length - index)));
      if (!packed) continue;
      const next = { ...context, sources: [...context.sources, packed] };
      if (JSON.stringify(next).length > CONTEXT_LIMIT) break;
      context.sources.push(packed);
      remaining -= JSON.stringify(packed).length;
    }
  }
  context.omittedRecords = group.records.length - context.sources.filter(source => source.kind === "record").length;
  const omittedProfiles = eligibleProfiles.length - context.sources.filter(source => source.kind === "profile").length;
  const omittedReviews = eligibleReviews.length - context.sources.filter(source => source.kind === "review").length;
  if ((omittedProfiles || omittedReviews) && context.sources[0]) {
    const facts = context.sources[0].facts;
    const notice = fact("省略", `件数・文字数の制限により基本情報 ${omittedProfiles}件、振り返り ${omittedReviews}件を省略しています。詳細は元の記録で確認してください。`);
    const existing = facts.find(entry => entry.label === "省略");
    if (existing) existing.value += ` ${notice.value}`;
    else { if (facts.length >= 32) facts.pop(); facts.push(notice); }
  }
  return context;
}

const summaryLabels = new Set(["会社名", "ステータス", "担当ポジション", "面談実施日", "C面談予定日", "C面談予定開始時刻", "C面談実施日", "候補者承諾日・マッチ日", "稼働開始予定日", "稼働開始日"]);
const conditionLabels = new Set(["居住地", "稼働開始", "希望時間帯", "週の稼働日数", "月間稼働時間", "副業・兼業", "希望単価", "PC環境", "通信環境", "勤怠・稼働上の確認事項", "面談可能日", "稼働形態"]);
const experienceLabels = new Set(["営業経験・職歴", "実績", "強み", "PC操作・スキル", "CRM", "その他のCRM", "チャット", "その他のチャット"]);

function specificConditionLabels(query: string): Set<string> {
  const labels = new Set<string>();
  if (/単価|時給|時間給|希望報酬/.test(query)) labels.add("希望単価");
  if (/(?:週|週間).*(?:何日|何回|日数)|週の稼働日数|勤務日数|稼働日数|曜日/.test(query)) labels.add("週の稼働日数");
  if (/(?:月|ヶ月|か月|カ月).*(?:何時間|稼働時間)|月間稼働|月間.*時間/.test(query)) labels.add("月間稼働時間");
  if (/時間帯|希望時間|勤務時間|何時(?!間)/.test(query) && !/(?:C面談|面談).*(?:何時|開始時刻)/.test(query)) labels.add("希望時間帯");
  if (/面談可能|面談できる|面談.*空いて/.test(query)) labels.add("面談可能日");
  if (/いつから.*(?:働|稼働)|(?:稼働|勤務)開始(?:可能|できる)|働き始め/.test(query)) labels.add("稼働開始");
  if (/副業|兼業/.test(query)) labels.add("副業・兼業");
  if (/PC環境|パソコン.*(?:持|ある|環境)/.test(query)) labels.add("PC環境");
  if (/通信環境|ネット環境|回線/.test(query)) labels.add("通信環境");
  if (/住まい|居住|住んで/.test(query)) labels.add("居住地");
  if (/稼働形態|出社|リモート/.test(query)) labels.add("稼働形態");
  return labels;
}

/** A deterministic record lookup fallback, not an AI response or a hiring recommendation. */
export function answerCandidateFacts(context: CandidateChatContext, question: string): CandidateFactAnswer {
  const query = question.trim();
  if (!query) return { text: "確認したいことを入力してください。", sourceIds: [] };
  if (/採用(?:すべき|して|した方)|不採用|合否を(?:決|判)|向いて|適性|優秀|評価して|点数|順位/.test(query)) {
    return { text: "記録だけで採用判断や人物評価は行いません。会社ごとの進捗、希望条件、面談で確認した事実を質問してください。", sourceIds: [] };
  }
  if (!context.sources.length) return { text: "この候補者について、回答の根拠にできる記録はありません。", sourceIds: [] };
  const requested = new Set<string>();
  const specificConditions = specificConditionLabels(query);
  let mode: "facts" | "summary" | "checks" = "facts";
  if (/次に|次回|確認する|確認すべき|足りない|不足/.test(query)) mode = "checks";
  else if (/状況|概要|まとめ|全体|どんな|今どう|今の状態/.test(query)) mode = "summary";
  if (/会社|企業|クライアント|提案先|紹介先/.test(query)) for (const label of ["会社名", "ステータス", "提案完了日"]) requested.add(label);
  if (/進捗|ステータス|状態|マッチ|合否|合格/.test(query) || (/稼働/.test(query) && !specificConditions.size)) for (const label of summaryLabels) requested.add(label);
  if (/実績|成果/.test(query) || (/面談/.test(query) && !specificConditions.has("面談可能日"))) for (const label of ["面談実施日", "C面談実施日", "提案完了日", "合格日（クライアント側オファー日）", "候補者承諾日・マッチ日", "稼働開始日"]) requested.add(label);
  if (/予定|スケジュール|いつ/.test(query) && ((!specificConditions.has("面談可能日") && !specificConditions.has("稼働開始")) || /C面談予定|次の予定|スケジュール/.test(query))) for (const label of ["C面談予定日", "C面談予定開始時刻", "稼働開始予定日", "面談可能日"]) requested.add(label);
  if (/条件|希望|単価|時給|時間|曜日|週|副業|環境|住まい|居住/.test(query) || specificConditions.size) {
    const labels = specificConditions.size && !/希望条件|勤務条件|稼働条件|条件.*(?:整理|まとめ|一覧|全体)/.test(query) ? specificConditions : conditionLabels;
    for (const label of labels) requested.add(label);
  }
  if (/経験|職歴|営業歴|スキル|強み|CRM|ツール|PC操作/.test(query)) for (const label of experienceLabels) requested.add(label);
  if (/メモ|注意|補足|振り返|理由|うまく|マッチしな/.test(query)) for (const label of ["メモ", "合否メモ", "その他・補足", "面談のメモ", "自分の振り返り", "記録された未マッチ理由", "確認した理由・事実"]) requested.add(label);
  if (/紹介元|流入|どこから/.test(query)) requested.add("紹介元");
  if (/名前|氏名/.test(query)) requested.add("候補者氏名");
  if (/担当/.test(query)) requested.add("担当");
  if (/ヨミ|確度|見込/.test(query)) requested.add("ヨミ確度");
  for (const label of Object.values(interviewFieldLabels)) if (query.includes(label) && (label !== "稼働開始" || specificConditions.has(label))) requested.add(label);
  if (mode === "summary") for (const label of summaryLabels) requested.add(label);
  if (mode === "checks") for (const label of ["会社名", "ステータス", "C面談予定日", "C面談実施日", "希望単価", "稼働開始", "希望時間帯", "週の稼働日数", "面談可能日"]) requested.add(label);
  const companies = context.sources.flatMap(source => source.kind === "record" ? source.facts.filter(entry => entry.label === "会社名").map(entry => entry.value) : []);
  const company = companies.sort((a, b) => b.length - a.length).find(value => value && query.toLocaleLowerCase().includes(value.toLocaleLowerCase()));
  if (company && !requested.size) { requested.add("会社名"); requested.add("ステータス"); }
  if (!requested.size) return { text: "その項目に対応する記録は見つかりません。会社・進捗・面談日・予定・希望条件・経験・メモについて確認できます。", sourceIds: [] };
  const matches = context.sources.map(source => ({ source, facts: source.facts.filter(entry => requested.has(entry.label)) }))
    .filter(({ source, facts }) => facts.length && (!company || source.label.toLocaleLowerCase().includes(company.toLocaleLowerCase())));
  const missing = [...requested].filter(label => !matches.some(match => match.facts.some(entry => entry.label === label)));
  const sections: string[] = [], sourceIds: string[] = [];
  let omitted = 0;
  for (const { source, facts } of matches) {
    const section = `【${source.label}】\n${facts.slice(0, 8).map(entry => `・${entry.label}：${short(entry.value, 500)}`).join("\n")}${facts.length > 8 ? "\n・ほかの項目は元の記録で確認してください。" : ""}`;
    if (sections.length >= 10 || sections.join("\n\n").length + section.length > 7_000) { omitted++; continue; }
    sections.push(section); sourceIds.push(source.id);
  }
  let text = sections.join("\n\n");
  if (!text) text = `${[...requested].slice(0, 6).join("・")}${requested.size <= 3 ? "：記録なし。" : "については記録がありません。"}`;
  if (mode === "checks") {
    const checks = missing.filter(label => ["会社名", "ステータス", "希望単価", "稼働開始", "希望時間帯", "週の稼働日数", "面談可能日"].includes(label));
    text += `\n\n記録上の確認事項：${checks.length ? `${checks.join("・")}が未登録です。本人・担当者に確認してください。` : "上記の条件や予定が現在も有効か、本人・担当者に確認してください。"}`;
  } else if (sections.length && missing.length && requested.size <= 3) text += `\n\n${missing.join("・")}：記録なし。`;
  if (omitted || context.omittedRecords || context.sources.some(source => source.facts.some(entry => entry.label === "省略" || entry.value.includes("長文のため一部省略")))) {
    text += `\n\n文字数・件数の上限により一部を省略しています${context.omittedRecords ? `（未参照の記録 ${context.omittedRecords}件）` : ""}。全件の詳細は「提案・履歴」で確認してください。`;
  }
  return { text, sourceIds: [...new Set(sourceIds)] };
}
