import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as reviewUtils from "../lib/interview-review-utils.ts";
import { valueAt } from "../lib/management-data.ts";

const source = ts.transpileModule(fs.readFileSync(new URL("../components/interview-reviews.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const nodes = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === "boolean" ? "" : typeof tree === "string" || typeof tree === "number" ? String(tree)
  : Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children);
const record = (id, month = "2026-10") => {
  const values = Array(26).fill(""); values[1] = `架空会社${id}`; values[6] = "辞退（他決）"; values[16] = `${month}-10`;
  return { recordId: id, rowVersion: `row-${id}`, row: 2, candidateName: `架空候補者${id}`, playerId: "ND-001", source: "", values, formulaColumns: [] };
};
async function flush() { for (let index = 0; index < 20; index++) await Promise.resolve(); }
const review = { recordId: "A", playerId: "ND-001", interviewDate: "2026-10-10", category: "条件のずれ", memo: "確認した事実は保持する", nextAction: "既存の対応は保持する", version: "review-a", updatedAt: "2026-10-11T00:00:00Z" };
const adviceState = (overrides = {}) => ({ advice: { summary: "条件を再確認する", actions: ["提案前に稼働曜日を確認する"], count: 1, aggregate: [{ category: "条件のずれ", count: 1 }], generatedAt: "2026-10-12T00:00:00Z" }, count: 1, stale: false, pending: false, configured: true, usage: { userRemaining: 2, teamRemaining: 9, resetAt: "" }, ...overrides });
function harness(overrides = {}) {
  let slots = [], cursor = 0, effects = [], tree;
  const calls = { save: [], analyze: [], read: [] };
  let props = { records: [record("A"), record("B")], reviews: [], players: [{ id: "ND-001", name: "架空担当者" }], period: "2026-10", live: false, enabled: true, canWrite: true,
    onSave: async (...args) => { calls.save.push(args); }, onAnalyze: async (...args) => { calls.analyze.push(args); }, onReadAdvice: async (...args) => { calls.read.push(args); }, ...overrides };
  const equal = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { value: typeof initial === "function" ? initial() : initial }; const slot = slots[index]; return [slot.value, value => { slot.value = typeof value === "function" ? value(slot.value) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] || (slots[index] = { current: initial }); },
    useMemo(fn, deps) { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value; },
    useEffect(fn, deps) { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) { const old = slots[index], slot = { deps }; slots[index] = slot; effects.push(() => { old?.cleanup?.(); slot.cleanup = fn(); }); } },
  };
  const exports = {}, jsx = (type, props, key) => ({ type, props: props || {}, key });
  vm.runInNewContext(source, { exports, module: { exports }, Error, Date, Set, Map, JSON, setInterval, clearInterval, setTimeout,
    window: { addEventListener() {}, removeEventListener() {} }, crypto: { randomUUID: (() => { let n = 0; return () => `operation-${++n}`; })() },
    require: name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "lucide-react" ? new Proxy({}, { get: (_, key) => key })
      : name.includes("interview-review-utils") ? reviewUtils : name.includes("management-data") ? { valueAt }
        : name.includes("sheets-client") ? { isUncertainWrite: error => error?.uncertain === true, SheetApiError: Error } : (() => { throw new Error(`Unexpected review import: ${name}`); })(),
  });
  function render(next = {}) { props = { ...props, ...next }; cursor = 0; tree = exports.InterviewReviews(props); while (effects.length) effects.shift()(); return tree; }
  const button = label => nodes(render()).find(node => node.type === "button" && (node.props["aria-label"] === label || text(node).trim() === label));
  const choose = id => { const target = nodes(render()).find(node => node.type === "button" && String(node.props.className).includes("review-candidate") && text(node).includes(`架空候補者${id}`)); assert.ok(target); target.props.onClick(); };
  const selected = () => text(nodes(render()).find(node => node.props.className === "review-selected"));
  const memo = () => nodes(render()).find(node => node.type === "textarea" && node.props.maxLength === 2000);
  const unmount = () => slots.forEach(slot => slot?.cleanup?.());
  render(); return { calls, props: () => props, render, button, choose, selected, memo, unmount, text: () => text(render()) };
}

test("an exact follow-up request opens once, supports a repeated request, and never saves automatically", () => {
  const h = harness({ initialRecordId: "B", initialRecordRequest: 1 });
  assert.match(h.selected(), /架空候補者B/);
  h.choose("A"); assert.match(h.selected(), /架空候補者A/);
  h.render({ records: [...h.props().records] }); assert.match(h.selected(), /架空候補者A/, "snapshot updates cannot repeat an already handled navigation request");
  h.render({ initialRecordRequest: 2 }); assert.match(h.selected(), /架空候補者B/);
  assert.equal(h.calls.save.length, 0); assert.equal(h.calls.analyze.length, 0); h.unmount();
});

test("an inactive or out-of-period request waits for the matching visible period", () => {
  const h = harness({ active: false, initialRecordId: "B", initialRecordRequest: 1, records: [record("A"), record("B", "2026-09")] });
  assert.equal(h.selected(), "");
  h.render({ active: true }); assert.equal(h.selected(), "");
  h.render({ period: "2026-09" }); assert.match(h.selected(), /架空候補者B/);
  assert.equal(h.calls.save.length, 0); h.unmount();
});

test("opening another requested proposal retains the first proposal's unsaved review", () => {
  const h = harness({ initialRecordId: "A", initialRecordRequest: 1 });
  assert.match(h.selected(), /架空候補者A/);
  h.memo().props.onChange({ target: { value: "架空の確認済み事実。曜日の条件を再確認する。" } });
  h.render({ initialRecordId: "B", initialRecordRequest: 2 }); assert.match(h.selected(), /架空候補者B/);
  h.choose("A"); assert.equal(h.memo().props.value, "架空の確認済み事実。曜日の条件を再確認する。");
  assert.equal(h.calls.save.length, 0); assert.match(h.text(), /まだスプレッドシートには保存していません/); h.unmount();
});

test("the empty review editor offers a concrete first proposal without starting AI or saving", () => {
  const h = harness();
  const open = h.button("未記録の提案を開く"); assert.ok(open); open.props.onClick();
  assert.match(h.selected(), /架空候補者A/);
  assert.equal(h.calls.save.length, 0); assert.equal(h.calls.analyze.length, 0); h.unmount();
});

test("an AI improvement is appended to the selected proposal's draft while preserving the saved facts", async () => {
  const h = harness({ live: true, initialRecordId: "A", reviews: [review], onReadAdvice: async () => adviceState() }); await flush();
  const add = h.button("架空候補者Aの「次回の対応」に追加"); assert.ok(add); assert.equal(add.props.disabled, false); add.props.onClick();
  const action = nodes(h.render()).find(node => node.type === "textarea" && node.props.maxLength === 1000);
  assert.equal(action.props.value, "既存の対応は保持する\n提案前に稼働曜日を確認する");
  assert.equal(h.memo().props.value, "確認した事実は保持する");
  assert.equal(h.calls.save.length, 0); assert.match(h.text(), /下書きとして内容を確認/); h.unmount();
});

test("an improvement based on an older reason aggregate cannot be added to the next action", async () => {
  const h = harness({ live: true, initialRecordId: "A", reviews: [{ ...review, category: "事前確認不足" }], onReadAdvice: async () => adviceState() }); await flush();
  const add = h.button("架空候補者Aの「次回の対応」に追加"); assert.ok(add); assert.equal(add.props.disabled, true);
  assert.match(h.text(), /現在の集計と異なる改善案/);
  assert.equal(h.calls.save.length, 0); h.unmount();
});

test("checking a pending improvement retrieves saved state without requesting another AI generation", async () => {
  let reads = 0;
  const h = harness({ live: true, reviews: [review], onReadAdvice: async () => { reads++; return adviceState({ advice: null, pending: true }); } }); await flush();
  const retry = h.button("作成済みか確認"); assert.ok(retry); assert.equal(retry.props.disabled, false); retry.props.onClick(); await flush();
  assert.equal(reads, 2); assert.equal(h.calls.analyze.length, 0); assert.equal(h.calls.save.length, 0); h.unmount();
});

test("dirty notifications include cached drafts outside the selected proposal and period, without exposing content", () => {
  const changes = [], h = harness({ onDirtyChange: value => changes.push(value), initialRecordId: "A", records: [record("A"), record("B", "2026-09")] });
  assert.deepEqual(changes, [false]);
  h.memo().props.onChange({ target: { value: "外へ渡さない架空の確認メモ" } }); h.render(); assert.deepEqual(changes, [false, true]);
  h.render({ initialRecordId: "B", initialRecordRequest: 2, period: "2026-09" });
  assert.match(h.selected(), /架空候補者B/); assert.equal(h.memo().props.value, ""); assert.equal(changes.at(-1), true);
  h.render(); assert.deepEqual(changes, [false, true]); assert.ok(changes.every(value => typeof value === "boolean"));
  assert.equal(h.calls.save.length, 0); h.unmount(); assert.equal(changes.at(-1), false);
});

test("saving a review clears its dirty state and cleanup uses the latest listener", async () => {
  const changes = [], latest = [], h = harness({ onDirtyChange: value => changes.push(value), initialRecordId: "A" });
  h.memo().props.onChange({ target: { value: "保存する架空の確認メモ" } }); h.render(); assert.deepEqual(changes, [false, true]);
  h.render({ onDirtyChange: value => latest.push(value) }); h.render(); assert.deepEqual(latest, []);
  const form = nodes(h.render()).find(node => node.type === "form"); form.props.onSubmit({ preventDefault() {} }); await flush(); h.render();
  assert.deepEqual(latest, [false]); assert.equal(h.calls.save.length, 1);
  h.unmount(); assert.deepEqual(latest, [false, false]);
});

test("an explicit return-to-draft request restores the dirty proposal once after choosing another proposal", () => {
  const h = harness({ initialRecordId: "A" });
  h.memo().props.onChange({ target: { value: "Aに残した下書き" } }); h.choose("B");
  const editing = nodes(h.render()).find(node => node.props.className === "card review-panel review-editor");
  const focusCalls = [];
  editing.props.ref.current = { scrollIntoView: () => focusCalls.push("scroll"), focus: options => focusCalls.push(options.preventScroll ? "focus-without-scroll" : "focus") };
  h.render({ active: false, restoreDraftRequest: 1 }); assert.match(h.selected(), /架空候補者B/);
  h.render({ active: true }); assert.match(h.selected(), /架空候補者A/); assert.equal(h.memo().props.value, "Aに残した下書き");
  assert.deepEqual(focusCalls, ["scroll", "focus-without-scroll"]);
  h.choose("B"); h.render({ records: [...h.props().records] }); assert.match(h.selected(), /架空候補者B/, "refresh cannot replay a consumed restore request");
  h.render({ restoreDraftRequest: 2 }); assert.match(h.selected(), /架空候補者A/);
  assert.equal(h.calls.save.length, 0); assert.equal(h.calls.analyze.length, 0); h.unmount();
});

test("returning to an out-of-period draft opens its retained content and explains the period mismatch", () => {
  const h = harness({ initialRecordId: "A", records: [record("A"), record("B", "2026-09")] });
  h.memo().props.onChange({ target: { value: "10月の下書きを保持" } });
  h.render({ initialRecordId: "B", initialRecordRequest: 1, period: "2026-09" }); assert.match(h.selected(), /架空候補者B/);
  h.render({ restoreDraftRequest: 1 }); assert.match(h.selected(), /架空候補者A/); assert.equal(h.memo().props.value, "10月の下書きを保持");
  assert.equal(h.props().period, "2026-09"); assert.match(h.text(), /現在の集計期間外.*入力内容は保持/);
  assert.equal(h.calls.save.length, 0); h.unmount();
});

test("draft restoration skips records outside the current authorized record scope", () => {
  const h = harness({ initialRecordId: "A", records: [record("A"), record("B"), record("C")] });
  h.memo().props.onChange({ target: { value: "復帰範囲から外れるAの下書き" } }); h.choose("B");
  h.memo().props.onChange({ target: { value: "閲覧できるBの下書き" } }); h.choose("C");
  h.render({ records: h.props().records.filter(item => item.recordId !== "A"), restoreDraftRequest: 1 });
  assert.match(h.selected(), /架空候補者B/); assert.equal(h.memo().props.value, "閲覧できるBの下書き");
  assert.doesNotMatch(h.text(), /復帰範囲から外れるAの下書き/); assert.equal(h.calls.save.length, 0); h.unmount();
});

test("draft restoration waits for an in-progress save and chooses the first remaining dirty proposal", async () => {
  let complete;
  const h = harness({ initialRecordId: "A", backgroundSave: () => new Promise(resolve => { complete = resolve; }) });
  h.memo().props.onChange({ target: { value: "残すAの下書き" } }); h.choose("B");
  h.memo().props.onChange({ target: { value: "Bは保存を開始" } });
  nodes(h.render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  h.render({ restoreDraftRequest: 1 }); assert.match(h.selected(), /架空候補者B/);
  complete(); await flush(); h.render(); assert.match(h.selected(), /架空候補者A/); assert.equal(h.memo().props.value, "残すAの下書き");
  h.unmount();
});

test("an uncertain save keeps the restore request pending until the same save is resolved", async () => {
  let attempts = 0;
  const h = harness({ initialRecordId: "A", onSave: async () => { if (!attempts++) throw Object.assign(new Error("通信結果が未確認"), { uncertain: true }); } });
  h.memo().props.onChange({ target: { value: "Aの未保存内容" } }); h.choose("B");
  h.memo().props.onChange({ target: { value: "Bの保存結果が未確認" } });
  const submit = () => nodes(h.render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  submit(); await flush(); h.render({ restoreDraftRequest: 1 }); assert.match(h.selected(), /架空候補者B/);
  assert.match(h.text(), /保存結果が未確認/);
  submit(); await flush(); h.render(); assert.match(h.selected(), /架空候補者A/); assert.equal(h.memo().props.value, "Aの未保存内容");
  assert.equal(attempts, 2); h.unmount();
});
