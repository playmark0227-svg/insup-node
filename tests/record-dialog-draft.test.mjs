import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import * as data from "../lib/node-data.ts";
import * as management from "../lib/management-data.ts";
import * as metrics from "../lib/performance-metrics.ts";
import { blankInterviewFields, linkedCandidateProfile } from "../lib/candidate-intake.ts";
import { isUncertainWrite } from "../lib/sheets-client.ts";

const workspace = ts.createSourceFile("node-workspace.tsx", fs.readFileSync(new URL("../components/node-workspace.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = workspace.statements.filter(node => ts.isFunctionDeclaration(node) && ["RecordDialog", "activityTargetRecordId"].includes(node.name?.text)).map(node => node.getText(workspace)).join("\n");
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const dialogSource = transpile(`import { useEffect, useMemo, useRef, useState } from "react";\n${functions}\nexports.RecordDialog = RecordDialog;`);
const guardSource = transpile(fs.readFileSync(new URL("../components/unsaved-work.tsx", import.meta.url), "utf8"));
const nodes = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === "boolean" ? "" : typeof tree === "string" || typeof tree === "number" ? String(tree)
  : Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children);

function harness() {
  let cursor = 0, updated = false;
  const slots = [], effects = [], closed = [], saved = [], listeners = new Set();
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) { const i = cursor++; slots[i] ||= { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, value => { const next = typeof value === "function" ? value(slots[i].value) : value; if (!Object.is(next, slots[i].value)) { slots[i].value = next; updated = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { value: fn, deps }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++, previous = slots[i]; if (!previous || !equal(previous.deps, deps)) { slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const require = name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name.endsWith(".css") ? {} : assert.fail(`Unexpected import: ${name}`);
  const window = { addEventListener(name, fn) { if (name === "beforeunload") listeners.add(fn); }, removeEventListener(name, fn) { if (name === "beforeunload") listeners.delete(fn); } };
  const guard = {}; vm.runInNewContext(guardSource, { exports: guard, module: { exports: guard }, require, window });
  const exports = {}, components = Object.fromEntries(["Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription", "Picker", "Input", "Checkbox", "ClientNameInput", "InterviewIntakeEditor", "CheckCircle2", "Plus"].map(name => [name, name]));
  vm.runInNewContext(dialogSource, { exports, module: { exports }, require, crypto: { randomUUID }, ...components, ...data, ...management, ...metrics, blankInterviewFields, linkedCandidateProfile, isUncertainWrite,
    useUnsavedFormGuard: guard.useUnsavedFormGuard, UnsavedWorkPrompt: guard.UnsavedWorkPrompt, toast: { info() {}, error() {} },
  });
  const props = { today: "2026-10-30", open: true, activities: [], records: [], playerId: "ND-001", players: [{ id: "ND-001", name: "架空担当", team: "架空チーム", color: "blue", target: 20, bio: "" }], admin: false, detail: null, live: true, intakeEnabled: true, profiles: [], clients: [],
    onOpenChange(value) { closed.push(value); props.open = value; }, onCorrect() {}, onSave: async value => { saved.push(value); return true; },
  };
  function resolve(tree) {
    if (Array.isArray(tree)) return tree.map(resolve);
    if (!tree || typeof tree !== "object") return tree;
    if (tree.type === guard.UnsavedWorkPrompt) return resolve(tree.type(tree.props));
    return { ...tree, props: { ...tree.props, children: resolve(tree.props?.children) } };
  }
  function render(next = {}) { Object.assign(props, next); let tree, passes = 0; do { updated = false; cursor = 0; tree = exports.RecordDialog(props); while (effects.length) effects.shift()(); if (++passes > 10) assert.fail("render did not settle"); } while (updated); return resolve(tree); }
  const button = label => nodes(render()).find(node => node.type === "button" && text(node) === label);
  const click = label => { const node = button(label); assert.ok(node, label); assert.ok(!node.props.disabled, `${label} enabled`); node.props.onClick(); };
  const editor = () => nodes(render()).find(node => node.type === "InterviewIntakeEditor");
  const nameInput = () => nodes(render()).find(node => node.type === "Input" && node.props.placeholder === "候補者氏名（スペースなし）");
  const changeName = value => { nameInput().props.onChange({ target: { value } }); nodes(render()).find(node => node.type === "form").props.onChangeCapture(); };
  const dismiss = () => nodes(render()).find(node => node.type === "Dialog").props.onOpenChange(false);
  const submit = () => nodes(render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  return { render, props, saved, closed, button, click, editor, nameInput, changeName, dismiss, submit, unmount() { for (const slot of slots) slot.cleanup?.(); } };
}

test("a typed candidate survives native close and cancel until explicit discard, and reopening is fresh", () => {
  const h = harness(); h.changeName("架空新規候補者"); h.dismiss();
  assert.deepEqual(h.closed, []); assert.ok(h.button("編集を続ける"));
  h.click("編集を続ける"); assert.equal(h.nameInput().props.value, "架空新規候補者");
  h.click("キャンセル"); assert.deepEqual(h.closed, []);
  h.click("変更を破棄して閉じる"); assert.deepEqual(h.closed, [false]); assert.equal(h.saved.length, 0);
  h.render(); h.render({ open: true }); assert.equal(h.nameInput().props.value, "");
  h.dismiss(); assert.deepEqual(h.closed, [false, false]); h.unmount();
});

test("adopting interview fields or an introduction programmatically protects the draft without a native change event", () => {
  for (const kind of ["fields", "introduction"]) {
    const h = harness();
    if (kind === "fields") h.editor().props.onFieldsChange({ ...blankInterviewFields(), workHistory: "架空の経歴を確認して採用した文章" });
    else h.editor().props.onIntroductionChange("確認して採用した架空の紹介文");
    h.dismiss(); assert.deepEqual(h.closed, []); assert.ok(h.button("編集を続ける"));
    h.click("編集を続ける");
    if (kind === "fields") assert.equal(h.editor().props.fields.workHistory, "架空の経歴を確認して採用した文章");
    else assert.equal(h.editor().props.introduction, "確認して採用した架空の紹介文");
    assert.equal(h.saved.length, 0); h.unmount();
  }
});

test("a save in progress and an uncertain receipt lock all closing and discard paths", async () => {
  const h = harness(); h.changeName("架空保存候補者"); h.dismiss();
  let rejectSave; h.props.onSave = value => { h.saved.push(value); return new Promise((_, reject) => { rejectSave = reject; }); };
  const saving = h.submit(); h.render();
  assert.equal(h.saved.length, 1); assert.equal(h.saved[0].candidateName, "架空保存候補者");
  assert.equal(h.button("キャンセル").props.disabled, true);
  const discard = h.button("変更を破棄して閉じる"); assert.equal(discard.props.disabled, true); discard.props.onClick(); h.dismiss();
  assert.deepEqual(h.closed, []);
  rejectSave(new Error("架空の通信結果不明")); await saving; h.render();
  assert.equal(h.button("キャンセル").props.disabled, true); assert.equal(h.button("変更を破棄して閉じる").props.disabled, true);
  h.dismiss(); assert.deepEqual(h.closed, []); assert.match(text(h.render()), /同じ内容で再試行/); h.unmount();
});

function waitingRecord(id, owner = "ND-001") {
  const values = Array(26).fill(""); values[1] = `${id}の架空会社`; values[2] = `${id}の架空候補者`; values[5] = "FS"; values[12] = `${id}の保存済みメモ`;
  return { recordId: `record-${id}`, candidateId: `candidate-${id}`, profileId: `profile-${id}`, rowVersion: `version-${id}`, row: 2, playerId: owner, candidateName: values[2], source: "架空紹介元", values, formulaColumns: [] };
}
function profile(record) {
  return { profileId: record.profileId, recordIds: [record.recordId], playerId: record.playerId, version: `profile-version-${record.recordId}`, updatedAt: "2026-10-30T00:00:00Z", fields: { ...blankInterviewFields(), workHistory: `${record.candidateName}の保存済み経歴` }, introduction: `${record.candidateName}の保存済み紹介文` };
}
const candidateSelect = h => nodes(h.render()).find(node => node.type === "select" && node.props["aria-label"] === "登録済みの候補者");
const picker = (h, label) => nodes(h.render()).find(node => node.type === "Picker" && node.props.label === label);

test("candidate selection prefills only the exact owned profile instead of the first linked document",()=>{
 const h=harness(),item=waitingRecord('A'),current=profile(item);
 const stale={...current,profileId:'stale-profile',introduction:'古い紐づけから混入してはいけない文章'};
 const foreign={...current,playerId:'ND-002',introduction:'別担当から混入してはいけない文章'};
 h.render({records:[item],profiles:[stale,foreign,current]});candidateSelect(h).props.onChange({target:{value:item.candidateId}});
 assert.equal(h.editor().props.introduction,current.introduction);assert.equal(h.editor().props.fields.workHistory,current.fields.workHistory);
 assert.equal(h.saved.length,0);h.unmount();
});

test("candidate or owner changes preserve interview drafts until explicit replacement, and native close shows only the close prompt", () => {
  for (const target of ["candidate", "owner"]) {
    const h = harness(), a = waitingRecord("A"), b = waitingRecord("B");
    h.render({ admin: true, records: [a, b], profiles: [profile(a), profile(b)], players: [...h.props.players, { ...h.props.players[0], id: "ND-002", name: "別の架空担当" }] });
    candidateSelect(h).props.onChange({ target: { value: a.candidateId } });
    h.editor().props.onIntroductionChange("切り替え前の架空の紹介文下書き");
    const request = () => target === "candidate" ? candidateSelect(h).props.onChange({ target: { value: b.candidateId } }) : picker(h, "担当者").props.onChange("ND-002");
    request(); assert.equal(h.editor().props.introduction, "切り替え前の架空の紹介文下書き");
    assert.ok(h.button("入力を破棄して切り替える")); h.click("今の入力を続ける");
    assert.equal(candidateSelect(h).props.value, a.candidateId); assert.equal(picker(h, "担当者").props.value, "ND-001");
    request(); h.dismiss();
    assert.equal(h.button("入力を破棄して切り替える"), undefined, "closing cannot leave two competing confirmations");
    assert.equal(nodes(h.render()).filter(node => node.props.role === "alert").length, 1); h.click("編集を続ける");
    request(); h.click("入力を破棄して切り替える");
    if (target === "candidate") { assert.equal(candidateSelect(h).props.value, b.candidateId); assert.equal(h.editor().props.introduction, profile(b).introduction); }
    else { assert.equal(picker(h, "担当者").props.value, "ND-002"); assert.equal(candidateSelect(h).props.value, ""); assert.equal(h.editor().props.introduction, ""); }
    assert.equal(h.saved.length, 0); h.unmount();
  }
});

test("switching company proposals cannot overwrite a memo draft before confirmation", () => {
  const h = harness();
  const activity = id => ({ id: `activity-${id}`, recordId: `record-${id}`, rowVersion: `version-${id}`, candidateId: "candidate-A", candidateName: "架空候補者A", playerId: "ND-001", source: "架空紹介元", position: "FS", company: `${id}の架空会社`, stage: "提案", date: "2026-10-20", memo: `${id}の保存済みメモ` });
  h.render({ initialStage: "C面談予約", activities: [activity("A"), activity("B")] });
  candidateSelect(h).props.onChange({ target: { value: "candidate-A" } });
  picker(h, "実績を追加する提案").props.onChange("record-A");
  const memo = () => nodes(h.render()).find(node => node.type === "textarea" && node.props.placeholder === "活動の補足（任意）");
  memo().props.onChange({ target: { value: "架空会社Aへの入力中メモ" } }); nodes(h.render()).find(node => node.type === "form").props.onChangeCapture();
  picker(h, "実績を追加する提案").props.onChange("record-B");
  assert.equal(picker(h, "実績を追加する提案").props.value, "record-A"); assert.equal(memo().props.value, "架空会社Aへの入力中メモ");
  h.click("今の入力を続ける"); assert.equal(memo().props.value, "架空会社Aへの入力中メモ");
  picker(h, "実績を追加する提案").props.onChange("record-B"); h.click("入力を破棄して切り替える");
  assert.equal(picker(h, "実績を追加する提案").props.value, "record-B"); assert.equal(memo().props.value, "Bの保存済みメモ");
  assert.equal(h.saved.length, 0); h.unmount();
});
