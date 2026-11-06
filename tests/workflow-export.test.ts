import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { validateDataExport, validateWorkflowDataExport } from "../lib/operations.ts";
import { blankIntroductionV2Profile, blankIntroductionV2Settings } from "../lib/introduction-v2.ts";
import { emptyMetricTargets } from "../lib/metric-goals.ts";
import { blankWorkJob } from "../lib/sales-workflow.ts";

const stamp = "2026-11-06T04:00:00.000Z", revision = "R".repeat(43);
const id = (kind: string) => `fictional-${kind}-00000000000001`;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const emptyWorkflow = () => ({ feature: true as const, schemaVersion: 1 as const, scope: "all-saved-private-workflows" as const, metricGoals: [], salesWorkflow: { jobs: [], plans: [], reports: [] }, introductionV2: { drafts: [], settings: [] }, matchEvidence: { scope: "metadata-only" as const, files: [] } });
const backup = (workflow: unknown) => ({ schemaVersion: 1, exportedAt: stamp, scope: "application-data", snapshot: { players: [] }, managementTables: [], limits: { maxCells: 50000, maxCharacters: 2000000 }, workflow });
function workflowFixture() {
  const profile = blankIntroductionV2Profile("架空の確認候補者"); profile.internalMemo = "管理者の保管用であり企業には出さない架空の原文";
  const settings = blankIntroductionV2Settings(); settings.version = revision; settings.blockedTerms = ["架空の社内語句"];
  const goal = { playerId: "ND-001", month: "2025-04", targets: { ...emptyMetricTargets(), 提案: 0 }, dailyBasis: "calendar" as const, customBusinessDays: null, version: revision, updatedAt: stamp, actorId: "ADMIN" };
  const job = { ...blankWorkJob(), jobId: id("job"), company: "架空企業", title: "架空の募集", version: id("revision"), createdBy: "ADMIN", updatedBy: "ADMIN", createdAt: stamp, updatedAt: stamp };
  const plan = { planId: id("plan"), ownerId: "ND-001", recordId: id("record"), profileId: "", company: "架空企業", jobId: job.jobId, status: "hold" as const, reason: "架空の保留理由", comment: "管理者・担当者のみの架空コメント", sentDate: "", sentRecordId: "", version: id("plan-version"), createdAt: stamp, updatedAt: stamp };
  const report = { reportId: id("report"), ownerId: "ND-001", recordId: id("record"), profileId: "", company: "架空企業", candidateName: "架空の確認候補者", agent: "架空の紹介元", sale: { amount: 2800, unit: "hour" as const, tax: "excluded" as const }, wholesale: { amount: 2200, unit: "hour" as const, tax: "excluded" as const }, matchDate: "2026-11-05", comment: "未提出の架空原稿", candidateEvidenceId: "", clientEvidenceId: "", status: "draft" as const, confirmedBy: "", confirmedAt: "", version: id("report-version"), createdAt: stamp, updatedAt: stamp };
  const evidence = { evidenceId: id("evidence"), ownerId: "ND-001", recordId: id("record"), profileId: "", kind: "candidate" as const, mime: "image/webp" as const, size: 1200, status: "pending" as const, generation: "", createdAt: stamp, expiresAt: "2026-11-06T04:30:00.000Z", completedAt: "", version: id("evidence-version"), updatedAt: stamp };
  return { ...emptyWorkflow(), metricGoals: [goal], salesWorkflow: { jobs: [job], plans: [plan], reports: [report] }, introductionV2: { drafts: [{ draftKey: id("record"), playerId: "ND-001", profile, version: revision, updatedAt: stamp, actorId: "ND-001" }], settings: [{ id: "shared" as const, settings, version: revision, updatedAt: stamp, actorId: "ADMIN" }] }, matchEvidence: { scope: "metadata-only" as const, files: [evidence] } };
}

test("the private workflow archive retains old months, zero goals, draft reports, raw profiles and administrator settings", () => {
  const workflow = workflowFixture(), before = copy(workflow), result = validateDataExport(backup(workflow));
  assert.deepEqual(result.workflow, workflow); assert.deepEqual(workflow, before);
  const data = validateWorkflowDataExport(workflow);
  assert.equal(data.metricGoals[0].month, "2025-04"); assert.equal(data.metricGoals[0].targets.提案, 0); assert.equal(data.metricGoals[0].actorId, "ADMIN");
  assert.equal(data.salesWorkflow.reports[0].status, "draft"); assert.equal(data.salesWorkflow.reports[0].sale.amount, 2800); assert.equal(data.salesWorkflow.reports[0].wholesale.amount, 2200);
  assert.ok(data.introductionV2.drafts[0].profile.internalMemo.includes("架空の原文")); assert.equal(data.introductionV2.settings[0].settings.blockedTerms[0], "架空の社内語句");
  assert.deepEqual(validateWorkflowDataExport(emptyWorkflow()), emptyWorkflow());
});

test("archive parsing fails on unknown or missing fields instead of silently dropping saved information", () => {
  for (const mutate of [
    (w: any) => { w.metricGoals[0].unexpected = "unrecognized history"; },
    (w: any) => { w.metricGoals.push(copy(w.metricGoals[0])); },
    (w: any) => { w.salesWorkflow.jobs[0].unknownRequirement = "unrecognized saved field"; },
    (w: any) => { delete w.salesWorkflow.reports[0].wholesale; },
    (w: any) => { w.introductionV2.drafts[0].profile.unknownFact = "must not be lost"; },
    (w: any) => { w.introductionV2.settings[0].settings.unknownSetting = true; },
    (w: any) => { w.introductionV2.drafts.push(copy(w.introductionV2.drafts[0])); },
    (w: any) => { w.matchEvidence.files[0].fileBytes = "encoded-content"; },
    (w: any) => { w.feature = "true"; },
    (w: any) => { w.scope = "public"; },
  ]) { const workflow = workflowFixture(); mutate(workflow); assert.throws(() => validateDataExport(backup(workflow))); }
});

test("credentials, upload capabilities, GCS names and file bytes cannot be exported inside a valid workflow", () => {
  for (const key of ["token", "outboxKey", "apiKey", "password", "cacheAccess", "uploadUrl", "downloadUrl", "signedUrl", "base64", "bucket", "objectName", "objectPath"]) {
    const workflow = workflowFixture(); Object.assign(workflow.matchEvidence.files[0], { [key]: "must-not-export" });
    assert.throws(() => validateDataExport(backup(workflow)), key);
  }
});

test("evidence exports preserve decimal generation strings and validate pending/completed metadata", () => {
  const workflow: any = workflowFixture(), e = workflow.matchEvidence.files[0]; e.status = "completed"; e.generation = "18446744073709551615"; e.completedAt = stamp;
  assert.equal(validateWorkflowDataExport(workflow).matchEvidence.files[0].generation, "18446744073709551615");
  for (const override of [{ generation: 18446744073709551615 }, { generation: "0" }, { generation: "" }, { completedAt: "" }, { mime: "application/pdf" }, { size: 0 }, { size: 5 * 1024 * 1024 + 1 }]) assert.throws(() => validateWorkflowDataExport({ ...workflow, matchEvidence: { ...workflow.matchEvidence, files: [{ ...e, ...override }] } }));
});

const fragment = readFileSync(new URL("../google-apps-script/ExportWorkflow.fragment.gs", import.meta.url), "utf8");
function backendFixture() {
  const data = workflowFixture(), states = new Map<string, any>(), reads: string[] = [];
  const state = (title: string, entries: any[], width: number, actorColumn?: number) => {
    const rows = entries.map(entry => { const row = Array(width).fill(""); if (actorColumn !== undefined) row[actorColumn] = entry.actorId; return row; });
    const value = { sheet: { getSheetId: () => 100 + states.size }, rows, entries: entries.map((entry, index) => { const copy = { ...entry, row: index + 2 }; delete copy.actorId; return copy; }), fingerprint: `fingerprint:${title}` }; states.set(title, value); return value;
  };
  state("_NODE_metric_goals", [...data.metricGoals, { ...data.metricGoals[0], month: "2026-11", targets: { ...emptyMetricTargets(), 提案: 9 } }], 8, 7);
  state("_NODE_work_jobs", data.salesWorkflow.jobs, 4); state("_NODE_proposal_plans", data.salesWorkflow.plans, 4); state("_NODE_match_reports", data.salesWorkflow.reports, 4);
  state("_NODE_introduction_v2", data.introductionV2.drafts, 15, 14); state("_NODE_introduction_settings", data.introductionV2.settings, 14, 13);
  state("_NODE_match_evidence", data.matchEvidence.files.map(entry => ({ ...entry, uploadUrl: "must-not-copy-upload-capability", objectName: "must-not-copy-object-path" })), 4);
  const table = (title: string) => { reads.push(title); return states.get(title) ?? { sheet: null, rows: [], entries: [], fingerprint: "empty" }; };
  const context = vm.createContext({ requireAdmin_: (actor: { role: string }) => { if (actor.role !== "admin") throw Error("admin required"); }, fail_: (code: string) => { throw Error(code); }, intakeTable_: (_book: unknown, title: string) => table(title), metricGoalTable_: () => table("_NODE_metric_goals"), salesTable_: (_book: unknown, title: string) => table(title), introductionV2Table_: () => table("_NODE_introduction_v2"), introductionSettingsTable_: () => table("_NODE_introduction_settings"), matchEvidenceTable_: () => table("_NODE_match_evidence") });
  vm.runInContext(fragment, context); return { context, states, reads, store: { book: {} }, data };
}

test("the GAS export reads every private workflow table only for administrators, without initializing tables", () => {
  const f = backendFixture(); assert.throws(() => f.context.workflowDataExport_(f.store, { role: "player" }), /admin/); assert.equal(f.reads.length, 0);
  const result = copy<any>(f.context.workflowDataExport_(f.store, { role: "admin" }));
  assert.equal(result.data.metricGoals.length, 2); assert.equal(result.data.metricGoals[0].targets.提案, 0); assert.equal(result.data.metricGoals[1].targets.提案, 9);
  assert.deepEqual(result.data.introductionV2.drafts[0].profile, f.data.introductionV2.drafts[0].profile);
  assert.equal(result.data.introductionV2.drafts[0].actorId, "ND-001"); assert.equal(result.data.introductionV2.settings[0].actorId, "ADMIN");
  assert.equal(result.checks.length, 7); assert.equal(result.cells, 114); assert.ok(result.checks.every((check: any) => check.fingerprint.startsWith("fingerprint:")));
  assert.doesNotMatch(JSON.stringify(result.data), /must-not-copy|objectName|uploadUrl/); assert.deepEqual(validateWorkflowDataExport(result.data), result.data);
});

test("missing workflow tables export safely as empty without creating storage; a missing reader cannot hide existing data", () => {
  const f = backendFixture(); f.states.clear(); for (const name of ["metricGoalTable_", "salesTable_", "introductionV2Table_", "introductionSettingsTable_", "matchEvidenceTable_"]) delete f.context[name];
  const result = copy<any>(f.context.workflowDataExport_(f.store, { role: "admin" })); assert.deepEqual(result.data, emptyWorkflow()); assert.equal(result.cells, 0); assert.equal(f.states.size, 0);
  f.states.set("_NODE_metric_goals", { sheet: { getSheetId: () => 20 }, rows: [], entries: [], fingerprint: "exists" });
  assert.throws(() => f.context.workflowDataExport_(f.store, { role: "admin" }), /NOT_CONFIGURED/);
});
