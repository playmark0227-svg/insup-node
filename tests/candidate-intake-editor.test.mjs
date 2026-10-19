import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as intake from "../lib/candidate-intake.ts";

const source = ts.transpileModule(fs.readFileSync(new URL("../components/candidate-intake.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];

// The real intake component is run with controlled parent props and a fake clock.
// This tests its delayed edits rather than looking for implementation strings.
function harness(initial = {}) {
  const slots = [], effects = [], timers = new Map(), introductions = [], fieldChanges = [];
  let cursor = 0, now = 0, timerId = 0, tree;
  let props = {
    candidateName: "架空の候補者", fields: { ...intake.blankInterviewFields(), workHistory: "最初の職歴" }, introduction: "",
    ai: { enabled: true, identityKey: "test-account:test-candidate", preferences: {}, onReadKit: async () => null, onGenerateKit: async () => null },
    onIntroductionChange: value => { introductions.push(value); props = { ...props, introduction: value }; },
    onFieldsChange: value => { fieldChanges.push(value); props = { ...props, fields: value }; },
    ...initial,
  };
  const equal = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const react = {
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      const slot = slots[index]; return [slot.value, value => { slot.value = typeof value === "function" ? value(slot.value) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] || (slots[index] = { current: initial }); },
    useId() { const index = cursor++; return slots[index] || (slots[index] = "test-intake"); },
    useEffect(fn, deps) { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) {
      const old = slots[index], slot = { deps }; slots[index] = slot; effects.push(() => { old?.cleanup?.(); slot.cleanup = fn(); }); } },
  };
  const exports = {}, jsx = (type, props, key) => ({ type, props: props || {}, key });
  const context = vm.createContext({ exports, module: { exports }, JSON, Error,
    navigator: { clipboard: { writeText: async () => {} } },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout: id => timers.delete(id),
    require: name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "lucide-react" ? new Proxy({}, { get: (_, name) => name })
      : name.includes("candidate-intake") ? intake : name.includes("candidate-ai-assistant") ? { CandidateAiAssistant: "CandidateAiAssistant" } : {},
  });
  vm.runInContext(source, context);
  function render(next = {}) { props = { ...props, ...next }; cursor = 0; tree = exports.InterviewIntakeEditor(props); while (effects.length) effects.shift()(); return tree; }
  function advance(milliseconds) {
    const target = now + milliseconds;
    while (true) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); now = due[1].at; due[1].fn();
    }
    now = target;
  }
  function change(suffix, value) { const node = nodes(render()).find(node => node.props.id?.endsWith(suffix)); assert.ok(node, suffix); node.props.onChange({ target: { value } }); render(); }
  function adoptAi(value) { const node = nodes(render()).find(node => node.type === "CandidateAiAssistant"); assert.ok(node); node.props.onApplyIntroduction(value); render(); }
  function unmount() { slots.forEach(slot => slot?.cleanup?.()); }
  render();
  return { render, advance, change, adoptAi, unmount, introductions, fieldChanges, pendingTimers: () => timers.size,
    introduction: () => props.introduction, fields: () => props.fields };
}

test("untouched intake drafts follow the latest input after 250ms without generating every keystroke", () => {
  const h = harness(); h.advance(249); assert.equal(h.introductions.length, 0);
  h.change("-workHistory", "途中の職歴"); h.advance(249); assert.equal(h.introductions.length, 0);
  h.change("-workHistory", "最新の確認済み職歴"); h.advance(250);
  assert.equal(h.introductions.length, 1); assert.match(h.introduction(), /最新の確認済み職歴/);
  assert.doesNotMatch(h.introduction(), /最初の職歴|途中の職歴/);
  h.render(); h.change("-timeWindow", "平日午後"); h.advance(250);
  assert.equal(h.introductions.length, 2); assert.match(h.introduction(), /平日午後/); h.unmount();
});

test("an existing saved introduction is never replaced by the automatic template", () => {
  const h = harness({ introduction: "保存済みの紹介文を保持" });
  h.change("-workHistory", "保存後に更新した原文"); h.advance(2000);
  assert.equal(h.introductions.length, 0); assert.equal(h.introduction(), "保存済みの紹介文を保持");
  assert.equal(h.fields().workHistory, "保存後に更新した原文"); h.unmount();
});

test("a manually edited introduction stops automatic replacement while source edits remain intact", () => {
  const h = harness(); h.advance(250); h.render();
  h.change("-introduction", "手で整えた文章を保持");
  const updates = h.introductions.length; h.change("-workHistory", "編集後の新しい事実"); h.advance(2000);
  assert.equal(h.introductions.length, updates); assert.equal(h.introduction(), "手で整えた文章を保持");
  assert.equal(h.fields().workHistory, "編集後の新しい事実"); h.unmount();
});

test("adopting an AI preview preserves it through later source edits and cancels a queued automatic draft", () => {
  const h = harness(); assert.equal(h.pendingTimers(), 1);
  h.adoptAi("確認して採用したAI文章"); const updates = h.introductions.length;
  h.advance(250); assert.equal(h.introductions.length, updates);
  h.change("-workHistory", "AI採用後の修正原文"); h.advance(2000);
  assert.equal(h.introduction(), "確認して採用したAI文章"); assert.equal(h.introductions.length, updates);
  assert.equal(h.fields().workHistory, "AI採用後の修正原文"); h.unmount();
});

test("unmounting or disabling the editor cancels pending automatic drafts", () => {
  const closed = harness(); assert.equal(closed.pendingTimers(), 1); closed.unmount();
  assert.equal(closed.pendingTimers(), 0); closed.advance(1000); assert.equal(closed.introductions.length, 0);
  const disabled = harness(); disabled.render({ disabled: true }); assert.equal(disabled.pendingTimers(), 0);
  disabled.advance(1000); assert.equal(disabled.introductions.length, 0);
  disabled.render({ disabled: false }); disabled.advance(250); assert.equal(disabled.introductions.length, 1); disabled.unmount();
});
