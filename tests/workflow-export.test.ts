import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { validateDataExport, validateWorkflowDataExport } from "../lib/operations.ts";
import { blankIntroductionCareer, blankIntroductionV2Profile, blankIntroductionV2Settings, composeIntroductionV2, withIntroductionNarrativeEdits } from "../lib/introduction-v2.ts";
import { emptyMetricTargets } from "../lib/metric-goals.ts";
import { blankWorkJob } from "../lib/sales-workflow.ts";

const stamp = "2026-11-06T04:00:00.000Z", revision = "R".repeat(43);
const id = (kind: string) => `fictional-${kind}-00000000000001`;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const emptyWorkflow = () => ({ feature: true as const, schemaVersion: 1 as const, scope: "all-saved-private-workflows" as const, metricGoals: [], salesWorkflow: { jobs: [], plans: [], reports: [] }, matchReportComments: { schemaVersion: 1 as const, comments: [] }, introductionV2: { drafts: [], settings: [] }, matchEvidence: { scope: "metadata-only" as const, files: [] } });
const backup = (workflow: unknown) => ({ schemaVersion: 1, exportedAt: stamp, scope: "application-data", snapshot: { players: [] }, managementTables: [], limits: { maxCells: 50000, maxCharacters: 2000000 }, workflow });
function workflowFixture() {
  const profile = blankIntroductionV2Profile("架空の確認候補者"); profile.internalMemo = "管理者の保管用であり企業には出さない架空の原文";
  const settings = blankIntroductionV2Settings(); settings.version = revision; settings.blockedTerms = ["架空の社内語句"];
  const goal = { playerId: "ND-001", month: "2025-04", targets: { ...emptyMetricTargets(), 提案: 0 }, dailyBasis: "calendar" as const, customBusinessDays: null, version: revision, updatedAt: stamp, actorId: "ADMIN" };
  const job = { ...blankWorkJob(), jobId: id("job"), company: "架空企業", title: "架空の募集", version: id("revision"), createdBy: "ADMIN", updatedBy: "ADMIN", createdAt: stamp, updatedAt: stamp };
  const plan = { planId: id("plan"), ownerId: "ND-001", recordId: id("record"), profileId: "", company: "架空企業", jobId: job.jobId, status: "hold" as const, reason: "架空の保留理由", comment: "管理者・担当者のみの架空コメント", sentDate: "", sentRecordId: "", version: id("plan-version"), createdAt: stamp, updatedAt: stamp };
  const report = { reportId: id("report"), ownerId: "ND-001", recordId: id("record"), profileId: "", company: "架空企業", candidateName: "架空の確認候補者", agent: "架空の紹介元", sale: { amount: 2800, unit: "hour" as const, tax: "excluded" as const }, wholesale: { amount: 2200, unit: "hour" as const, tax: "excluded" as const }, matchDate: "2026-11-05", comment: "未提出の架空原稿", candidateEvidenceId: "", clientEvidenceId: "", status: "draft" as const, confirmedBy: "", confirmedAt: "", version: id("report-version"), createdAt: stamp, updatedAt: stamp };
  const evidence = { evidenceId: id("evidence"), ownerId: "ND-001", recordId: id("record"), profileId: "", kind: "candidate" as const, mime: "image/webp" as const, size: 1200, status: "pending" as const, generation: "", createdAt: stamp, expiresAt: "2026-11-06T04:30:00.000Z", completedAt: "", version: id("evidence-version"), updatedAt: stamp };
  const rootComment = { commentId: id("root-comment"), reportId: report.reportId, parentId: "", authorId: "ND-001", body: "提出前の確認事項\n単価と証拠を確認してください。", deleted: false, version: id("root-comment-version"), createdAt: stamp, updatedAt: stamp };
  const reply = { ...rootComment, commentId: id("reply-comment"), parentId: rootComment.commentId, authorId: "ADMIN", body: "双方の資料を確認しました。", version: id("reply-comment-version") };
  const deleted = { ...rootComment, commentId: id("deleted-comment"), parentId: rootComment.commentId, body: "", deleted: true, version: id("deleted-comment-version") };
  return { ...emptyWorkflow(), matchReportComments: { schemaVersion: 1 as const, comments: [rootComment, reply, deleted] }, metricGoals: [goal], salesWorkflow: { jobs: [job], plans: [plan], reports: [report] }, introductionV2: { drafts: [{ draftKey: id("record"), playerId: "ND-001", profile, version: revision, updatedAt: stamp, actorId: "ND-001" }], settings: [{ id: "shared" as const, settings, version: revision, updatedAt: stamp, actorId: "ADMIN" }] }, matchEvidence: { scope: "metadata-only" as const, files: [evidence] } };
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

test("workflow archives retain every report comment and reply, including redacted deletion markers", () => {
  const workflow = workflowFixture(), before = copy(workflow), parsed = validateWorkflowDataExport(workflow);
  assert.deepEqual(parsed.matchReportComments, workflow.matchReportComments); assert.deepEqual(workflow, before);
  const comments = parsed.matchReportComments!.comments;
  assert.equal(comments.length, 3); assert.equal(comments[1].parentId, comments[0].commentId);
  assert.equal(comments[1].authorId, "ADMIN"); assert.equal(comments[0].body, "提出前の確認事項\n単価と証拠を確認してください。");
  assert.equal(comments[2].deleted, true); assert.equal(comments[2].body, ""); assert.equal(comments[2].parentId, comments[0].commentId);
});

test("older workflow archives that predate report discussions keep their omitted field unchanged", () => {
  const { matchReportComments: _comments, ...legacy } = workflowFixture();
  assert.deepEqual(validateWorkflowDataExport(legacy), legacy);
  assert.deepEqual(validateDataExport(backup(legacy)).workflow, legacy);
  assert.equal(Object.hasOwn(validateWorkflowDataExport(legacy), "matchReportComments"), false);
  const { matchReportComments: _emptyComments, ...legacyEmpty } = emptyWorkflow();
  assert.deepEqual(validateWorkflowDataExport(legacyEmpty), legacyEmpty);
});

test("comment archives reject malformed schema, state, IDs and private or unrecognized fields without dropping them", () => {
  const mutations: Array<(workflow: any) => void> = [
    w => { w.matchReportComments.schemaVersion = 2; },
    w => { w.matchReportComments.schemaVersion = "1"; },
    w => { w.matchReportComments = null; },
    w => { w.matchReportComments.comments = {}; },
    w => { w.matchReportComments.nextCursor = "page-one"; },
    w => { w.matchReportComments.comments[0].deleted = "false"; },
    w => { w.matchReportComments.comments[0].deleted = 0; },
    w => { w.matchReportComments.comments[0].commentId = "short"; },
    w => { w.matchReportComments.comments[0].reportId = "../another-report"; },
    w => { w.matchReportComments.comments[0].parentId = "not an ID"; },
    w => { w.matchReportComments.comments[0].parentId = w.matchReportComments.comments[0].commentId; },
    w => { w.matchReportComments.comments[0].authorId = "other owner"; },
    w => { w.matchReportComments.comments[0].version = ""; },
    w => { w.salesWorkflow.reports[0].status = "published"; },
    w => { w.salesWorkflow.reports[0].sale.unit = "day"; },
    w => { w.salesWorkflow.jobs[0].jobId = "../../job"; },
    w => { w.matchReportComments.comments[0].createdAt = "yesterday"; },
    w => { w.matchReportComments.comments[0].updatedAt = ""; },
    w => { w.matchReportComments.comments[0].body = "   "; },
    w => { w.matchReportComments.comments[0].body = "a".repeat(2001); },
    w => { w.matchReportComments.comments[0].body = "control\u0000character"; },
    w => { w.matchReportComments.comments[0].canManage = true; },
    w => { w.matchReportComments.comments[0].token = "must-not-export"; },
    w => { w.matchReportComments.comments[2].body = "削除された本文"; },
    w => { delete w.matchReportComments.comments[1].parentId; },
    w => { w.matchReportComments.comments.push(copy(w.matchReportComments.comments[0])); },
  ];
  for (const mutate of mutations) { const workflow = workflowFixture(); mutate(workflow); assert.throws(() => validateDataExport(backup(workflow))); }
});

const fragment = readFileSync(new URL("../google-apps-script/ExportWorkflow.fragment.gs", import.meta.url), "utf8");
function backendFixture(data = workflowFixture()) {
  const states = new Map<string, any>(), reads: string[] = [];
  const state = (title: string, entries: any[], width: number, actorColumn?: number) => {
    const rows = entries.map(entry => { const row = Array(width).fill(""); if (actorColumn !== undefined) row[actorColumn] = entry.actorId; return row; });
    const value = { sheet: { getSheetId: () => 100 + states.size }, rows, entries: entries.map((entry, index) => { const copy = { ...entry, row: index + 2 }; delete copy.actorId; return copy; }), fingerprint: `fingerprint:${title}` }; states.set(title, value); return value;
  };
  state("_NODE_metric_goals", [...data.metricGoals, { ...data.metricGoals[0], month: "2026-11", targets: { ...emptyMetricTargets(), 提案: 9 } }], 8, 7);
  state("_NODE_work_jobs", data.salesWorkflow.jobs, 4); state("_NODE_proposal_plans", data.salesWorkflow.plans, 4); state("_NODE_match_reports", data.salesWorkflow.reports, 4);
  state("_NODE_introduction_v2", data.introductionV2.drafts, 15, 14); state("_NODE_introduction_settings", data.introductionV2.settings, 14, 13);
  state("_NODE_match_report_comments", data.matchReportComments.comments.map(entry => ({ ...entry, body: entry.deleted ? "削除済みの保存原文は書き出さない" : entry.body, canManage: true })), 9);
  state("_NODE_match_evidence", data.matchEvidence.files.map(entry => ({ ...entry, uploadUrl: "must-not-copy-upload-capability", objectName: "must-not-copy-object-path" })), 4);
  const table = (title: string) => { reads.push(title); return states.get(title) ?? { sheet: null, rows: [], entries: [], fingerprint: "empty" }; };
  const context = vm.createContext({ requireAdmin_: (actor: { role: string }) => { if (actor.role !== "admin") throw Error("admin required"); }, fail_: (code: string) => { throw Error(code); }, intakeTable_: (_book: unknown, title: string) => table(title), metricGoalTable_: () => table("_NODE_metric_goals"), salesTable_: (_book: unknown, title: string) => table(title), introductionV2Table_: () => table("_NODE_introduction_v2"), introductionSettingsTable_: () => table("_NODE_introduction_settings"), matchReportCommentTable_: () => table("_NODE_match_report_comments"), matchEvidenceTable_: () => table("_NODE_match_evidence") });
  vm.runInContext(fragment, context); return { context, states, reads, store: { book: {} }, data };
}

test("the GAS export reads every private workflow table only for administrators, without initializing tables", () => {
  const f = backendFixture(); assert.throws(() => f.context.workflowDataExport_(f.store, { role: "player" }), /admin/); assert.equal(f.reads.length, 0);
  const result = copy<any>(f.context.workflowDataExport_(f.store, { role: "admin" }));
  assert.equal(result.data.metricGoals.length, 2); assert.equal(result.data.metricGoals[0].targets.提案, 0); assert.equal(result.data.metricGoals[1].targets.提案, 9);
  assert.deepEqual(result.data.introductionV2.drafts[0].profile, f.data.introductionV2.drafts[0].profile);
  assert.equal(result.data.introductionV2.drafts[0].actorId, "ND-001"); assert.equal(result.data.introductionV2.settings[0].actorId, "ADMIN");
  assert.equal(result.checks.length, 8); assert.equal(result.cells, 150); assert.ok(result.checks.every((check: any) => check.fingerprint.startsWith("fingerprint:")));
  assert.deepEqual(result.data.matchReportComments, f.data.matchReportComments);
  assert.doesNotMatch(JSON.stringify(result.data.matchReportComments), /削除済みの保存原文|canManage|"row"/);
  assert.ok(result.checks.some((check: any) => check.title === "_NODE_match_report_comments"));
  assert.doesNotMatch(JSON.stringify(result.data), /must-not-copy|objectName|uploadUrl/); assert.deepEqual(validateWorkflowDataExport(result.data), result.data);
});

test("missing workflow tables export safely as empty without creating storage; a missing reader cannot hide existing data", () => {
  const f = backendFixture(); f.states.clear(); for (const name of ["metricGoalTable_", "salesTable_", "introductionV2Table_", "introductionSettingsTable_", "matchReportCommentTable_", "matchEvidenceTable_"]) delete f.context[name];
  const result = copy<any>(f.context.workflowDataExport_(f.store, { role: "admin" })); assert.deepEqual(result.data, emptyWorkflow()); assert.equal(result.cells, 0); assert.equal(f.states.size, 0);
  f.states.set("_NODE_metric_goals", { sheet: { getSheetId: () => 20 }, rows: [], entries: [], fingerprint: "exists" });
  assert.throws(() => f.context.workflowDataExport_(f.store, { role: "admin" }), /NOT_CONFIGURED/);
});

test("the full administrator export retains more than a UI page of comments across reports without truncation", () => {
  const workflow = workflowFixture(), first = workflow.matchReportComments.comments[0];
  workflow.salesWorkflow.reports.push({ ...workflow.salesWorkflow.reports[0], reportId: id("older-report"), status: "draft" });
  workflow.matchReportComments.comments = Array.from({ length: 125 }, (_, index) => ({ ...first, commentId: id(`comment-${index}`), reportId: index % 2 ? first.reportId : id("older-report"), parentId: index > 1 ? id(`comment-${index % 2}`) : "", authorId: index % 2 ? "ADMIN" : "ND-001", body: `保管する確認事項 ${index}`, deleted: false }));
  const before = copy(workflow), f = backendFixture(workflow);
  const result = copy<any>(f.context.workflowDataExport_(f.store, { role: "admin" }));
  assert.equal(result.data.matchReportComments.comments.length, 125);
  assert.deepEqual(result.data.matchReportComments.comments, workflow.matchReportComments.comments);
  assert.deepEqual(validateDataExport(backup(result.data)).workflow, result.data);
  assert.equal(result.cells, 118 + (125 + 1) * 9); assert.deepEqual(workflow, before);
});

test("saved discussions cannot disappear from a backup when their table reader is unavailable", () => {
  const f = backendFixture(); delete f.context.matchReportCommentTable_;
  assert.throws(() => f.context.workflowDataExport_(f.store, { role: "admin" }), /NOT_CONFIGURED/);
  assert.ok(f.reads.includes("_NODE_match_report_comments"));
});

test("the GAS export and archive validation preserve saved AI prose and both generated output variants", () => {
  const workflow = workflowFixture(), entry = workflow.introductionV2.drafts[0], settings = workflow.introductionV2.settings[0].settings;
  settings.clients = [{ id: "fictional-client", name: "架空企業", mentions: ["@架空の担当者"], rate: { amount: "2400", unit: "hour", tax: "exclusive" } }];
  entry.profile.careers = [{ ...blankIntroductionCareer("export-career"), company: "架空の勤務先", product: "架空の法人サービス", period: "2024/04〜2025/03", salesStyle: "電話営業", duties: ["架電業務を担当。"] }];
  const edits = [{ factId: "introduction:careers.export-career.duties.0", text: "架電業務を担当していました。" }];
  entry.profile = withIntroductionNarrativeEdits(entry.profile, settings, edits);
  const before = composeIntroductionV2(entry.profile, settings, "fictional-client"), f = backendFixture(workflow);
  const result = copy<any>(f.context.workflowDataExport_(f.store, { role: "admin" }));
  const archive = validateWorkflowDataExport(JSON.parse(JSON.stringify(result.data)));
  const restoredProfile = archive.introductionV2.drafts[0].profile, restoredSettings = archive.introductionV2.settings[0].settings;
  assert.deepEqual(restoredProfile, entry.profile); assert.deepEqual(restoredProfile.narrativeEdits!.edits, edits);
  assert.equal(restoredProfile.narrativeEdits!.settingsVersion, revision);
  assert.equal(restoredProfile.careers[0].duties[0], "架電業務を担当。");
  const after = composeIntroductionV2(restoredProfile, restoredSettings, "fictional-client");
  assert.equal(after.internalBody, before.internalBody); assert.equal(after.client.text, before.client.text);
  assert.match(after.internalBody, /架電業務を担当していました。/); assert.match(after.client.text, /架電業務を担当していました。/);
  assert.doesNotMatch(after.client.text, /管理者の保管用/);
  assert.deepEqual(validateDataExport(backup(result.data)).workflow, result.data);
  const malformed = copy(result.data); malformed.introductionV2.drafts[0].profile.narrativeEdits.unrecognizedText = "must-not-drop";
  assert.throws(() => validateWorkflowDataExport(malformed));
  const changedSource = copy(result.data); changedSource.introductionV2.drafts[0].profile.careers[0].duties[0] = "架電業務の事前確認を担当。";
  const historical = validateWorkflowDataExport(changedSource), retained = historical.introductionV2.drafts[0].profile;
  assert.deepEqual(retained.narrativeEdits, entry.profile.narrativeEdits);
  assert.ok(composeIntroductionV2(retained, restoredSettings).checks.some(check => check.code === "narrative-stale"));
  assert.doesNotMatch(composeIntroductionV2(retained, restoredSettings).internalBody, /担当していました/);
});
