import test from "node:test";
import assert from "node:assert/strict";
import { answerCandidateFacts, buildCandidateChatContext, candidateChatProfileChoices, type CandidateChatContext } from "../lib/candidate-chat.ts";
import { groupCandidates, type CandidateGroup } from "../lib/candidate-groups.ts";
import { blankInterviewFields, type CandidateProfile } from "../lib/candidate-intake.ts";
import type { CandidateRecord, InterviewReview } from "../lib/sheets-client.ts";

function row(id = "r1", name = "山田太郎", owner = "ND-001", company = "Alpha社"): CandidateRecord {
  const values: CandidateRecord["values"] = Array(26).fill("");
  values[0] = "2026-10-21"; values[1] = company; values[2] = name; values[6] = "提案候補";
  return { recordId: id, candidateName: name, playerId: owner, row: 2, rowVersion: `v-${id}`, source: "紹介経由", values, formulaColumns: [] };
}
function group(records = [row()]): CandidateGroup { return groupCandidates(records, "registration-desc")[0]; }
function profile(id = "p1", ids = ["r1"], owner = "ND-001"): CandidateProfile {
  return { profileId: id, playerId: owner, recordIds: ids, version: "p-v1", updatedAt: "2026-10-21T10:00:00Z", fields: blankInterviewFields(), introduction: "" };
}
function review(id = "r1", owner = "ND-001"): InterviewReview {
  return { recordId: id, playerId: owner, interviewDate: "2026-10-20", category: "条件の不一致", memo: "本人に確認済み：曜日が異なる", nextAction: "保存済みAI改善案", version: "rev1", updatedAt: "2026-10-21T10:00:00Z" };
}
const serialized = (context: CandidateChatContext) => JSON.stringify(context);

test("context uses exact grouped records and excludes another owner and same-name outside profiles", () => {
  const own = row(), foreign = row("other", "山田太郎", "ND-002", "他担当限定会社");
  const selected = { ...group(), records: [own, foreign] };
  const linked = profile(), anotherOwner = profile("foreign", ["r1"], "ND-002"), unlinked = profile("unlinked", ["outside"]);
  linked.fields.workHistory = "この候補者の職歴";
  anotherOwner.fields.workHistory = "他担当者の秘密"; unlinked.fields.workHistory = "別候補者の秘密";
  const context = buildCandidateChatContext({ group: selected, profiles: [linked, anotherOwner, unlinked], reviews: [review(), review("other", "ND-002")] });
  assert.deepEqual(context.sources.filter(source => source.kind === "record").map(source => source.id), ["r1"]);
  assert.match(serialized(context), /この候補者の職歴/);
  assert.doesNotMatch(serialized(context), /他担当者の秘密|別候補者の秘密|他担当限定会社/);
  assert.equal(context.sources.filter(source => source.kind === "review").length, 1);
});

test("normalized names do not let a distinct candidate or an unassigned owner alias leak in", () => {
  const first = row("r1", "山田 太郎", ""); first.values[3] = "担当A";
  const wrongAlias = row("r2", "山田太郎", ""); wrongAlias.values[3] = "担当B";
  const otherName = row("r3", "佐藤花子", ""); otherName.values[3] = "担当A";
  const selected = { ...group([first]), records: [wrongAlias, first, otherName] };
  const context = buildCandidateChatContext({ group: selected, profiles: [] });
  assert.deepEqual(context.sources.map(source => source.id), ["r1"]);
  assert.equal(context.candidateName, "山田太郎");
});

test("distinct linked profiles require an explicit choice before any facts enter an AI context", () => {
  const second = row("r2", "山田太郎", "ND-001", "Beta社"); second.row = 3;
  const a = profile(), b = profile("p2", ["r2"]), outside = profile("p3", ["r9"]);
  a.fields.desiredHourlyRate = "1,500円"; b.fields.desiredHourlyRate = "2,000円";
  outside.fields.desiredHourlyRate = "他の人物の単価";
  const context = buildCandidateChatContext({ group: group([row(), second]), profiles: [a, b, outside] });
  assert.equal(context.identityIssue?.code,"IDENTITY_SELECTION_REQUIRED");assert.deepEqual(context.sources,[]);
  assert.doesNotMatch(serialized(context),/1,500円|2,000円|他の人物の単価/);
  assert.match(answerCandidateFacts(context,"希望条件を教えて").text,/別の人の情報を混ぜない.*1つ選んで/);
  const selected=buildCandidateChatContext({group:group([row(),second]),profiles:[a,b,outside],selectedProfileId:'p2'});
  assert.deepEqual(selected.sources.filter(source=>source.kind==='record').map(source=>source.id),['r2']);
  assert.deepEqual(selected.sources.filter(source=>source.kind==='profile').map(source=>source.id),['profile:p2']);
  assert.match(serialized(selected),/2,000円/);assert.doesNotMatch(serialized(selected),/1,500円|他の人物の単価|Alpha社/);
});

test("a contradictory record.profileId rejects a stale profile even when recordIds includes the row", () => {
  const a = row(); a.profileId = "current";
  const b = row("r2", "山田太郎", "ND-001", "Beta社"); b.row = 3; b.profileId = "separate";
  const current = profile("current", ["r1", "r2"]), stale = profile("old", ["r1"]), separate = profile("separate", ["r2"]);
  current.fields.desiredHourlyRate = "現在の条件"; stale.fields.desiredHourlyRate = "混入してはいけない以前の条件";
  separate.fields.desiredHourlyRate = "別資料に記録した条件";
  const context = buildCandidateChatContext({ group: group([a, b]), profiles: [stale, current, separate],selectedProfileId:'current' });
  assert.doesNotMatch(serialized(context), /混入してはいけない/);
  const source = context.sources.find(entry => entry.id === "profile:current")!;
  assert.match(source.label, /Alpha社.*2026-10-21.*記録行 2/);
  assert.doesNotMatch(source.label, /Beta社/);
  assert.doesNotMatch(serialized(context),/別資料に記録した条件/);
  assert.equal(context.sources.filter(entry => entry.kind === "profile").length, 1);
});

test("explicit identities block a same-name group even when profile documents are unavailable",()=>{
 const first={...row(),profileId:'person-a'},second={...row('r2'),profileId:'person-b'};
 const grouped=group([first,second]),context=buildCandidateChatContext({group:grouped,profiles:[]});
 assert.equal(context.identityIssue?.code,'IDENTITY_SELECTION_REQUIRED');assert.deepEqual(context.sources,[]);
 const choices=candidateChatProfileChoices(grouped,[]);assert.deepEqual(choices.map(choice=>choice.profileId),['person-a','person-b']);
 const selected=buildCandidateChatContext({group:grouped,profiles:[],selectedProfileId:'person-b'});
 assert.equal(selected.identityIssue,undefined);assert.deepEqual(selected.sources.map(source=>source.id),['r2']);
});

test("profile choices exclude foreign owners, outside records, and stale contradictory links",()=>{
 const record={...row(),profileId:'current'},another=row('r2','山田太郎','ND-002','別担当の会社');
 const grouped={...group([record]),records:[record,another]};
 const profiles=[profile('current'),profile('stale'),profile('foreign',['r1'],'ND-002'),profile('outside',['outside'])];
 assert.deepEqual(candidateChatProfileChoices(grouped,profiles).map(choice=>choice.profileId),['current']);
 const context=buildCandidateChatContext({group:grouped,profiles});assert.equal(context.identityIssue,undefined);
 assert.deepEqual(context.sources.map(source=>source.id),['r1']);
 const rejected=buildCandidateChatContext({group:grouped,profiles,selectedProfileId:'foreign'});
 assert.deepEqual(rejected.sources,[]);assert.equal(rejected.identityIssue?.code,'IDENTITY_SELECTION_REQUIRED');
});

test("choosing one profile excludes unlinked rows and another person's review or conditions",()=>{
 const first={...row(),profileId:'person-a'},second={...row('r2','山田太郎','ND-001','Beta社'),profileId:'person-b'},unknown=row('r3');
 const a=profile('person-a',['r1']),b=profile('person-b',['r2']);a.fields.workHistory='人物A限定の職歴';b.fields.workHistory='人物B限定の職歴';
 const context=buildCandidateChatContext({group:group([first,second,unknown]),profiles:[a,b],reviews:[review('r1'),{...review('r2'),memo:'人物B限定の振り返り'}],selectedProfileId:'person-a'});
 assert.deepEqual(context.sources.map(source=>source.id),['r1','profile:person-a','review:r1']);
 assert.match(serialized(context),/人物A限定/);assert.doesNotMatch(serialized(context),/人物B限定|Beta社|r3/);
 assert.equal(context.omittedRecords,0);
});

test("one record with multiple linked profiles still requires choosing a profile",()=>{
 const a=profile(),b=profile('p2');a.fields.age='20';b.fields.age='40';
 const context=buildCandidateChatContext({group:group(),profiles:[a,b]});assert.deepEqual(context.sources,[]);
 const selected=buildCandidateChatContext({group:group(),profiles:[a,b],selectedProfileId:'p2'});
 assert.deepEqual(selected.sources.filter(source=>source.kind==='profile').map(source=>source.id),['profile:p2']);
 assert.match(serialized(selected),/40/);assert.doesNotMatch(serialized(selected),/"value":"20"/);
});

test("multiple proposals sharing one profile remain usable without an unnecessary selection guard",()=>{
 const first={...row(),profileId:'shared'},second={...row('r2'),profileId:'shared'},p=profile('shared',['r1','r2']);p.fields.age='20';
 const context=buildCandidateChatContext({group:group([first,second]),profiles:[p,{...p}]});
 assert.equal(context.identityIssue,undefined);assert.deepEqual(context.sources.map(source=>source.id),['r1','r2','profile:shared']);
 assert.equal(candidateChatProfileChoices(group([first,second]),[p]).length,1);
});

test("single long field truncation and omitted profile documents have an explicit omission fact", () => {
  const p = profile(); p.fields.workHistory = "営業経験".repeat(2_000);
  const one = buildCandidateChatContext({ group: group(), profiles: [p] });
  assert.equal(one.omittedRecords, 0);
  assert.ok(one.sources.some(source => source.facts.some(entry => entry.label === "省略")));
  const many = buildCandidateChatContext({ group: group(), profiles: Array.from({ length: 25 }, (_, index) => profile(`p${index}`)) });
  assert.equal(many.identityIssue?.code,'IDENTITY_SELECTION_REQUIRED');assert.deepEqual(many.sources,[]);
  assert.ok(serialized(many).length <= 28_000);
});

test("saved generated prose and advice are never recycled as factual evidence", () => {
  const p = profile();
  p.introduction = "以前にAIが作った紹介文";
  p.fields.interviewAdvice = "以前にAIが作った面談準備案";
  p.fields.interviewMemo = "実際に面談で確認したこと";
  const context = buildCandidateChatContext({ group: group(), profiles: [p], reviews: [review()] });
  assert.doesNotMatch(serialized(context), /以前にAIが作った|保存済みAI改善案/);
  assert.match(serialized(context), /実際に面談で確認したこと|本人に確認済み/);
  assert.match(serialized(context), /記録された未マッチ理由/);
});

test("all company stages, exact dates, source, probability and notes are available on a short record", () => {
  const r = row();
  r.values[5] = "アポインター"; r.values[7] = "2026-10-22"; r.values[8] = "2026-10-23";
  r.values[9] = "2026-11-01"; r.values[10] = "15:30"; r.values[11] = "Aヨミ";
  r.values[12] = "次回は勤務曜日を確認"; r.values[16] = "2026-10-24";
  r.values[18] = "条件回答待ち"; r.values[20] = "2026-10-25"; r.values[21] = "2026-10-26";
  r.values[22] = "2026-12-01"; r.values[23] = "2026-11-03";
  const context = buildCandidateChatContext({ group: group([r]), profiles: [] });
  const facts = Object.fromEntries(context.sources[0].facts.map(entry => [entry.label, entry.value]));
  assert.equal(facts["提案完了日"], "2026-10-22"); assert.equal(facts["C面談予約獲得日"], "2026-10-23");
  assert.equal(facts["C面談予定日"], "2026-11-01"); assert.equal(facts["C面談実施日"], "2026-10-24");
  assert.equal(facts["合格日（クライアント側オファー日）"], "2026-10-25"); assert.equal(facts["候補者承諾日・マッチ日"], "2026-10-26");
  assert.equal(facts["稼働開始予定日"], "2026-12-01"); assert.equal(facts["稼働開始日"], "2026-11-03");
  assert.equal(facts["メモ"], "次回は勤務曜日を確認"); assert.equal(facts["合否メモ"], "条件回答待ち");
  assert.equal(facts["ヨミ確度"], "Aヨミ"); assert.equal(facts["紹介元"], "紹介経由");
});

test("context budgets are explicit and bounded even for many very long records and profiles", () => {
  const records = Array.from({ length: 40 }, (_, index) => {
    const r = row(`r${index}`); r.row = index + 2; r.values[12] = "非常に長いメモ".repeat(3_000); return r;
  });
  const profiles = [profile('shared-profile',records.map(record=>record.recordId))];profiles[0].fields.workHistory="長い職歴".repeat(3_000);
  const context = buildCandidateChatContext({ group: group(records), profiles, reviews: records.map(r => review(r.recordId)) });
  assert.ok(serialized(context).length <= 28_000);
  assert.ok(context.sources.length <= 80);
  assert.ok(context.sources.filter(source => source.kind === "record").length <= 30);
  assert.ok(context.omittedRecords >= 10);
  assert.match(serialized(context), /省略/);
  for (const source of context.sources) {
    assert.ok(source.id.length <= 200); assert.ok(source.label.length <= 200); assert.ok(source.facts.length <= 32);
    for (const entry of source.facts) { assert.ok(entry.label.length <= 200); assert.ok(entry.value.length <= 2_500); }
  }
});

test("oversized record IDs are omitted without truncating IDs into another source identity", () => {
  const oversized = row("x".repeat(201));
  const context = buildCandidateChatContext({ group: group([oversized]), profiles: [profile("p1", [oversized.recordId])] });
  assert.equal(context.sources.length, 0); assert.equal(context.omittedRecords, 1);
});

test("empty context and empty questions produce a factual absence without invented answers", () => {
  const empty: CandidateChatContext = { candidateName: "山田太郎", sources: [], omittedRecords: 0 };
  assert.match(answerCandidateFacts(empty, "状況を教えて").text, /根拠にできる記録はありません/);
  assert.match(answerCandidateFacts(empty, "　").text, /入力してください/);
  assert.deepEqual(answerCandidateFacts(empty, "状況を教えて").sourceIds, []);
});

test("company lookup cites only matching proposals, leaving another company's statuses out", () => {
  const a = row(), b = row("r2", "山田太郎", "ND-001", "Beta社"); b.row = 3; b.values[6] = "辞退（他社）";
  const context = buildCandidateChatContext({ group: group([a, b]), profiles: [] });
  const answer = answerCandidateFacts(context, "Alpha社の進捗を教えて");
  assert.match(answer.text, /Alpha社|提案候補/); assert.doesNotMatch(answer.text, /Beta社|辞退/);
  assert.deepEqual(answer.sourceIds, ["r1"]);
});

test("company-specific conditions use that company's explicitly linked profile only", () => {
  const a = row(), b = row("r2", "山田太郎", "ND-001", "Alpha社第二支店"); b.row = 3;
  const p = profile(), second = profile("p2", ["r2"]);
  p.fields.desiredHourlyRate = "1,500円"; second.fields.desiredHourlyRate = "2,000円";
  const context = buildCandidateChatContext({ group: group([a, b]), profiles: [p, second],selectedProfileId:'p2' });
  const answer = answerCandidateFacts(context, "Alpha社第二支店の希望条件は？");
  assert.match(answer.text, /2,000円/); assert.doesNotMatch(answer.text, /1,500円/);
  assert.deepEqual(answer.sourceIds, ["profile:p2"]);
});

test("future scheduled dates remain schedules and are not represented as completed results", () => {
  const r = row(); r.values[9] = "2099-11-10"; r.values[10] = "12:00"; r.values[22] = "2099-12-01";
  const context = buildCandidateChatContext({ group: group([r]), profiles: [] });
  const schedule = answerCandidateFacts(context, "次の予定はいつ？");
  assert.match(schedule.text, /C面談予定日：2099-11-10/);
  assert.match(schedule.text, /稼働開始予定日：2099-12-01/);
  assert.doesNotMatch(schedule.text, /C面談実施日：2099|稼働開始日：2099/);
  const results = answerCandidateFacts(context, "面談の実績は？");
  assert.doesNotMatch(results.text, /2099-/);
});

test("conditions, experience and memos return actual recorded fields while unknown facts stay unknown", () => {
  const r = row(); r.values[12] = "会社担当者に確認中";
  const p = profile(); p.fields.workHistory = "営業経験3年"; p.fields.desiredHourlyRate = "1,800円"; p.fields.timeWindow = "平日10〜16時";
  const context = buildCandidateChatContext({ group: group([r]), profiles: [p] });
  assert.match(answerCandidateFacts(context, "希望条件は？").text, /1,800円|平日10〜16時/);
  assert.match(answerCandidateFacts(context, "営業経験は？").text, /営業経験3年/);
  assert.match(answerCandidateFacts(context, "メモを教えて").text, /会社担当者に確認中/);
  const unknown = answerCandidateFacts(context, "前職の年収はいくら？");
  assert.match(unknown.text, /記録は見つかりません/); assert.deepEqual(unknown.sourceIds, []);
});

test("specific missing conditions name the exact requested field instead of the first six general conditions", () => {
  const context = buildCandidateChatContext({ group: group(), profiles: [] });
  const questions = [
    ["希望単価はいくら？", "希望単価"], ["希望時給は？", "希望単価"],
    ["週何日稼働できる？", "週の稼働日数"], ["1週間に何日働ける？", "週の稼働日数"],
    ["月何時間働ける？", "月間稼働時間"], ["1ヶ月で何時間稼働できる？", "月間稼働時間"],
    ["希望の時間帯は？", "希望時間帯"], ["何時から何時まで働ける？", "希望時間帯"],
    ["面談可能日はいつ？", "面談可能日"], ["いつから働ける？", "稼働開始"],
  ];
  for (const [question, label] of questions) {
    const answer = answerCandidateFacts(context, question);
    assert.equal(answer.text, `${label}：記録なし。`, question);
    assert.deepEqual(answer.sourceIds, [], question);
  }
});

test("a concrete condition query returns only that condition while condition and career overviews retain both topics", () => {
  const p = profile();
  p.fields.desiredHourlyRate = "1,800円"; p.fields.timeWindow = "平日10〜16時"; p.fields.daysPerWeek = "週3日";
  p.fields.monthlyHours = "月80時間"; p.fields.workHistory = "営業経験3年"; p.fields.interviewAvailability = "火曜午後";
  const context = buildCandidateChatContext({ group: group(), profiles: [p] });
  const direct = answerCandidateFacts(context, "希望単価はいくら？");
  assert.match(direct.text, /希望単価：1,800円/); assert.doesNotMatch(direct.text, /営業経験3年|週3日|平日10〜16時/);
  assert.match(answerCandidateFacts(context, "週何日？").text, /週の稼働日数：週3日/);
  assert.match(answerCandidateFacts(context, "月何時間？").text, /月間稼働時間：月80時間/);
  const availability = answerCandidateFacts(context, "面談可能日はいつ？");
  assert.match(availability.text, /面談可能日：火曜午後/); assert.doesNotMatch(availability.text, /C面談実施日|面談実施日/);
  const overview = answerCandidateFacts(context, "希望条件と職歴を整理して");
  assert.match(overview.text, /1,800円/); assert.match(overview.text, /平日10〜16時/); assert.match(overview.text, /営業経験3年/);
});

test("next checks identify missing recorded conditions without inferring personal suitability", () => {
  const context = buildCandidateChatContext({ group: group(), profiles: [] });
  const answer = answerCandidateFacts(context, "次に確認することは？");
  assert.match(answer.text, /希望単価|希望時間帯|本人・担当者に確認/);
  assert.doesNotMatch(answer.text, /不採用|適性が|優秀|C面談実施日が未登録/);
  assert.match(answerCandidateFacts(context, "採用すべき？").text, /採用判断や人物評価は行いません/);
  assert.deepEqual(answerCandidateFacts(context, "適性を評価して").sourceIds, []);
});

test("answers bound lengthy excerpts and cite displayed sources only; source records are not mutated", () => {
  const records = Array.from({ length: 20 }, (_, index) => { const r = row(`r${index}`, "山田太郎", "ND-001", `会社${index}`); r.values[12] = "長いメモ".repeat(500); return r; });
  const before = structuredClone(records);
  const context = buildCandidateChatContext({ group: group(records), profiles: [] });
  const answer = answerCandidateFacts(context, "メモを教えて");
  assert.ok(answer.text.length < 8_000); assert.ok(answer.sourceIds.length <= 10); assert.match(answer.text, /省略/);
  assert.ok(answer.sourceIds.every(id => context.sources.some(source => source.id === id && answer.text.includes(source.label))));
  assert.deepEqual(records, before);
});
