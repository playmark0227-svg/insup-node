import test from "node:test";
import assert from "node:assert/strict";
import { candidateConditionFacts, matchesCandidateConditions, matchesCandidateWords, recordedQuantity, recordedStart } from "../lib/candidate-conditions.ts";
import { blankInterviewFields, type CandidateProfile } from "../lib/candidate-intake.ts";
import { filterCandidateGroups, groupCandidates, candidateFilterCount } from "../lib/candidate-groups.ts";
import type { CandidateRecord } from "../lib/sheets-client.ts";

test("explicit daily, monthly and hourly ranges retain units and whole ranges", () => {
  for (const value of ["週3〜5日", "3日〜5日", "３～５日/週"]) { const fact = recordedQuantity(value, "days"); assert.equal(fact.state, "known", value); assert.equal(fact.minimum, 3); assert.equal(fact.maximum, 5); assert.equal(fact.raw, value); }
  assert.equal(recordedQuantity("月80時間", "hours").minimum, 80);
  assert.equal(recordedQuantity("80h/月", "hours").minimum, 80);
  assert.equal(recordedQuantity("80〜120時間", "hours").maximum, 120);
  assert.equal(recordedQuantity("時給2,000〜2,500円", "rate").minimum, 2000);
  assert.equal(recordedQuantity("2千円/時", "rate").maximum, 2000);
  assert.equal(recordedQuantity("時給2000円以上", "rate").minimum, 2000);
  assert.equal(recordedQuantity("週3日以上", "days").maximum, 7);
});

test("ambiguous periods, approximations, invalid quantities and unitless pay never become numeric facts", () => {
  for (const value of ["3000", "3000円", "月額20万円", "時給2000円くらい", "時給2000円（相談）", "時給2000〜1500円", "時給3000円 税別"]) assert.equal(recordedQuantity(value, "rate").state, "ambiguous", value);
  for (const value of ["週8日", "週3.5日", "週3日程度", "週3日、繁忙期5日", "月3日", "週3日と週4日"]) assert.equal(recordedQuantity(value, "days").state, "ambiguous", value);
  for (const value of ["週20時間", "月80時間程度", "月800時間", "80時間（週20時間）"]) assert.equal(recordedQuantity(value, "hours").state, "ambiguous", value);
  assert.equal(recordedQuantity("", "rate").state, "missing");
});

test("start dates need an explicit valid year and never turn relative language into a date", () => {
  assert.equal(recordedStart("2026/11/10から").date, "2026-11-10");
  assert.equal(recordedStart("2028年2月29日以降").date, "2028-02-29");
  for (const value of ["11月10日", "即日", "来週", "2026/2/29", "2026-11-10か11-20"]) assert.equal(recordedStart(value).state, "ambiguous", value);
  assert.equal(recordedStart("").state, "missing");
});

test("all numeric conditions must be satisfied by the full recorded range; missing or ambiguous values can be reviewed separately", () => {
  const fields = { ...blankInterviewFields(), daysPerWeek: "週3〜5日", monthlyHours: "月80〜120時間", desiredHourlyRate: "時給2000〜2500円", availableFrom: "2026年11月10日" };
  const filter = { daysMin: 3, daysMax: 5, hoursMin: 80, hoursMax: 120, rateMax: 2500, availableBy: "2026-11-10" };
  assert.equal(matchesCandidateConditions(fields, filter), true);
  for (const next of [{ daysMin: 4 }, { hoursMax: 100 }, { rateMax: 2300 }, { availableBy: "2026-11-09" }, { rateMin: 3000, rateMax: 2000 }, { daysMin: NaN }]) assert.equal(matchesCandidateConditions(fields, { ...filter, ...next }), false);
  assert.equal(matchesCandidateConditions({ ...fields, desiredHourlyRate: "2500円" }, { rateMax: 3000 }), false);
  assert.equal(matchesCandidateConditions({ ...fields, desiredHourlyRate: "2500円" }, { conditionCheck: "rate:ambiguous" }), true);
  assert.equal(matchesCandidateConditions(undefined, { conditionCheck: "days:missing" }), true);
  assert.equal(matchesCandidateConditions(undefined, { daysMin: 1 }), false);
  assert.equal(matchesCandidateConditions(fields, { conditionCheck: "rate:missing" }), false);
  assert.equal(candidateConditionFacts(fields).rate.raw, "時給2000〜2500円");
});

test("search aliases are deterministic and a negated skill is not treated as positive experience", () => {
  assert.equal(matchesCandidateWords("法人向けサースのテレアポを2年担当", "SaaS 架電", true), true);
  assert.equal(matchesCandidateWords("SaaSは未経験、架電は3年", "サース", true), false);
  assert.equal(matchesCandidateWords("SaaSは未経験、架電は3年", "架電", true), true);
  assert.equal(matchesCandidateWords("SaaS経験なし。テレアポ経験3年", "架電", true), true);
  assert.equal(matchesCandidateWords("SaaS未経験", "SaaS未経験", true), true);
  assert.equal(matchesCandidateWords("法人営業3年", "SaaS", true), false);
  assert.equal(matchesCandidateWords("SaaS未経験 法人営業3年", "法人営業", true), true);
  assert.equal(matchesCandidateWords("未経験のSaaS", "SaaS", true), false);
  assert.equal(matchesCandidateWords("SaaSの経験がない", "SaaS", true), false);
  assert.equal(matchesCandidateWords("SaaS経験あり、テレアポ未経験", "SaaS", true), true);
});

test("conditions cannot be combined across different same-name profiles or unrelated proposals", () => {
  const make = (id: string, profileId: string): CandidateRecord => ({ recordId: id, candidateId: `candidate-${id}`, profileId, playerId: "ND-001", candidateName: "架空候補", rowVersion: id, row: 2, source: "", values: Array(26).fill(""), formulaColumns: [] });
  const a = make("record-A", "profile-A"), b = make("record-B", "profile-B");
  const profiles: CandidateProfile[] = [{ profileId: "profile-A", playerId: "ND-001", recordIds: [a.recordId], fields: { ...blankInterviewFields(), daysPerWeek: "週5日", desiredHourlyRate: "時給5000円" }, introduction: "", version: "v1", updatedAt: "" }, { profileId: "profile-B", playerId: "ND-001", recordIds: [b.recordId], fields: { ...blankInterviewFields(), daysPerWeek: "週1日", desiredHourlyRate: "時給1500円" }, introduction: "", version: "v2", updatedAt: "" }];
  const groups = groupCandidates([a, b], "registration-desc"), all = { owner: "all", status: "all", search: "" };
  assert.equal(filterCandidateGroups(groups, { ...all, daysMin: 5, rateMax: 2000 }, "2026-11-06", profiles).length, 0);
  assert.equal(filterCandidateGroups(groups, { ...all, daysMin: 5, rateMax: 5000 }, "2026-11-06", profiles)[0].records.length, 2);
  assert.equal(candidateFilterCount({ ...all, daysMin: 3, daysMax: 5, rateMax: 2500, availableBy: "2026-11-10", conditionCheck: "hours:missing" }), 4);
});
