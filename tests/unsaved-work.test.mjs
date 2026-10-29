import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync(new URL("../components/unsaved-work.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const nodes = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === "boolean" ? "" : typeof tree === "string" || typeof tree === "number" ? String(tree)
  : Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children);

function harness(overrides = {}) {
  let cursor = 0, closed = 0, added = 0, removed = 0;
  const slots = [], effects = [], listeners = new Set();
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) { const index = cursor++; slots[index] ||= { value: initial }; return [slots[index].value, value => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useCallback(fn, deps) { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
    useEffect(fn, deps) { const index = cursor++, previous = slots[index]; if (!previous || !equal(previous.deps, deps)) { slots[index] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); }); } },
  };
  const window = {
    addEventListener(name, listener) { assert.equal(name, "beforeunload"); listeners.add(listener); added++; },
    removeEventListener(name, listener) { assert.equal(name, "beforeunload"); listeners.delete(listener); removed++; },
  };
  const exports = {}, jsx = (type, props) => ({ type, props: props || {} });
  vm.runInNewContext(source, { exports, module: { exports }, window,
    require: name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name.endsWith(".css") ? {} : assert.fail(name),
  });
  const props = { locked: false, onClose: () => closed++, ...overrides };
  const render = (next = {}) => { Object.assign(props, next); cursor = 0; const result = exports.useUnsavedFormGuard(props); while (effects.length) effects.shift()(); return result; };
  return { render, exports, closed: () => closed, listenerCount: () => listeners.size, changes: () => ({ added, removed }),
    unload() { const event = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } }; for (const listener of listeners) listener(event); return event; },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
  };
}

test("dirty close requires a decision and uses the latest close callback exactly once", () => {
  const h = harness(); const initial = h.render();
  initial.markChanged(); initial.requestClose();
  assert.equal(h.closed(), 0); assert.equal(h.render().dirty, true); assert.equal(h.render().confirming, true);
  initial.keepEditing(); assert.equal(h.render().confirming, false); assert.equal(h.render().dirty, true);
  initial.requestClose(); let latestClosed = 0;
  const current = h.render({ onClose: () => latestClosed++ });
  for (const method of ["markChanged", "reset", "requestClose", "keepEditing", "discardAndClose"]) assert.equal(current[method], initial[method]);
  const prompt = h.exports.UnsavedWorkPrompt({ open: true, locked: false, onKeepEditing: current.keepEditing, onDiscard: current.discardAndClose });
  assert.equal(prompt.props.role, "alert"); assert.match(text(prompt), /入力した変更は保存されません/);
  const discard = nodes(prompt).find(node => node.type === "button" && text(node) === "変更を破棄して閉じる");
  discard.props.onClick(); initial.discardAndClose(); initial.requestClose();
  assert.equal(latestClosed, 1); assert.equal(h.closed(), 0); assert.equal(h.render().dirty, false); assert.equal(h.render().confirming, false);
  assert.equal(h.exports.UnsavedWorkPrompt({ open: false }), null); h.unmount();
});

test("a latest locked state blocks both ordinary close and an already open discard decision", () => {
  const h = harness({ locked: true }); const guard = h.render();
  guard.requestClose(); guard.markChanged(); guard.requestClose();
  assert.equal(h.closed(), 0); assert.equal(h.render().confirming, false);
  h.render({ locked: false }); guard.requestClose(); assert.equal(h.render().confirming, true);
  h.render({ locked: true }); guard.discardAndClose(); guard.requestClose();
  assert.equal(h.closed(), 0); assert.equal(h.render().dirty, true);
  let promptCalls = 0;
  const prompt = h.exports.UnsavedWorkPrompt({ open: true, locked: true, onKeepEditing: () => promptCalls++, onDiscard: () => promptCalls++ });
  assert.match(text(prompt), /保存の確認が終わるまで/);
  const buttons = nodes(prompt).filter(node => node.type === "button"); assert.equal(buttons.length, 2);
  for (const button of buttons) { assert.equal(button.props.disabled, true); button.props.onClick(); }
  assert.equal(promptCalls, 0);
  h.render({ locked: false }); guard.discardAndClose(); assert.equal(h.closed(), 1); h.unmount();
});

test("reset makes a reopened form clean and unload protection stays stable only while dirty", () => {
  const h = harness(); const guard = h.render(); assert.equal(h.listenerCount(), 0);
  guard.markChanged(); h.render(); assert.equal(h.listenerCount(), 1);
  const first = h.changes(); guard.markChanged(); h.render({ locked: true }); h.render({ locked: false });
  assert.deepEqual(h.changes(), first, "changing callbacks or locks does not replace the dirty unload listener");
  const event = h.unload(); assert.equal(event.prevented, true); assert.equal(event.returnValue, "");
  guard.requestClose(); assert.equal(h.render().confirming, true);
  guard.reset(); const reopened = h.render();
  assert.equal(reopened.dirty, false); assert.equal(reopened.confirming, false); assert.equal(h.listenerCount(), 0);
  reopened.requestClose(); reopened.requestClose(); assert.equal(h.closed(), 1);
  reopened.reset(); reopened.markChanged(); reopened.requestClose();
  assert.equal(h.render().confirming, true); assert.equal(h.closed(), 1); assert.equal(h.listenerCount(), 1);
  h.unmount(); assert.equal(h.listenerCount(), 0);
});
