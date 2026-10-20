import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { defaultWritingPreferences, validateWritingPreferences } from "../lib/writing-ai.ts";
import { introductionHeadings } from "../lib/introduction-style.ts";

const source = ts.transpileModule(fs.readFileSync(new URL("../components/writing-preferences-editor.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const extracted = { ...defaultWritingPreferences(), tone: "plain", targetLength: 600, sectionOrder: ["tools", "basic", "experience", "results", "availability", "summary"] };
const reference = "【使用ツール】架空の参考ツール\n【基本情報】参考だけの氏名";
const saveLabel = "この書き方を保存して今後も使う";
const text = node => node == null || typeof node === "boolean" ? "" : typeof node === "string" || typeof node === "number" ? String(node)
  : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
const nodes = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function harness(options = {}) {
  let slots = [], effects = [], cursor = 0, key, tree;
  const calls = { extract: [], save: [], read: 0 };
  let props = { identityKey: "admin-one", preferences: options.preferences || defaultWritingPreferences(),
    onRead: async () => { calls.read++; return options.read ? options.read() : props.preferences; },
    onSave: async value => { calls.save.push(value); return options.save ? options.save(value) : { ...value, version: "saved_version_123456" }; } };
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial };
      const slot = slots[i]; return [slot.value, value => { slot.value = typeof value === "function" ? value(slot.value) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useId() { const i = cursor++; return slots[i] || (slots[i] = "test-preferences"); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) {
      const old = slots[i], slot = { deps }; slots[i] = slot; effects.push(() => { old?.cleanup?.(); slot.cleanup = fn(); }); } },
  };
  const exports = {}, jsx = (type, props, key) => ({ type, props: props || {}, key });
  const context = vm.createContext({ exports, module: { exports }, AbortController, Error, JSON,
    require: name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "lucide-react" ? new Proxy({}, { get: (_, name) => name })
      : name.includes("introduction-style") ? { introductionHeadings } : name.includes("writing-ai") ? { validateWritingPreferences }
      : name.includes("on-device-ai") ? {
        getOnDeviceAiAvailability: async () => "available",
        extractWritingPreferences: async (...args) => { calls.extract.push(args); return options.extract ? options.extract(...args) : structuredClone(extracted); },
      } : {},
  });
  vm.runInContext(source, context);
  function unmount() { slots.forEach(slot => slot?.cleanup?.()); }
  function render(next = {}) {
    props = { ...props, ...next }; const session = exports.WritingPreferencesEditor(props);
    if (key !== session.key) { unmount(); slots = []; effects = []; key = session.key; }
    cursor = 0; tree = session.type(session.props); while (effects.length) effects.shift()(); return tree;
  }
  const button = label => nodes(render()).find(node => node.type === "button" && text(node) === label);
  const click = label => { const node = button(label); assert.ok(node, label); assert.ok(!node.props.disabled, label); node.props.onClick(); };
  const change = value => { nodes(render()).find(node => node.type === "textarea").props.onChange({ target: { value } }); };
  const referenceValue = () => nodes(render()).find(node => node.type === "textarea").props.value;
  render(); return { render, calls, click, button, change, referenceValue, text: () => text(render()), unmount };
}

test("one extraction and one save persist only format settings and reopen without another reference", async () => {
  const h = harness(); await flush(); h.change(reference); h.click("参考文から書式案を作る"); await flush();
  assert.equal(h.calls.extract.length, 1); assert.equal(h.calls.save.length, 0);
  h.click(saveLabel); await flush();
  assert.equal(h.calls.save.length, 1); assert.deepEqual(h.calls.save[0], extracted);
  assert.deepEqual(Object.keys(h.calls.save[0]).sort(), ["includeSummary", "sectionOrder", "targetLength", "tone", "version"]);
  assert.ok(!JSON.stringify(h.calls.save).includes("参考だけの氏名"));
  assert.equal(h.referenceValue(), ""); assert.match(h.text(), /今後は全プレイヤーの紹介文に自動/);
  assert.equal(h.button(saveLabel), undefined); h.unmount();
  const reopened = harness({ preferences: { ...extracted, version: "saved_version_123456" } }); await flush();
  assert.match(reopened.text(), /この書き方を毎回自動使用/); assert.equal(reopened.referenceValue(), "");
  assert.equal(reopened.calls.extract.length, 0); assert.equal(reopened.button("共通ルールを保存").props.disabled, true); reopened.unmount();
});

test("failed saves retain the parsed format and retry without extracting the reference again", async () => {
  let attempts = 0;
  const h = harness({ save: async value => { if (!attempts++) throw new Error("一時的な通信エラー"); return { ...value, version: "saved_version_123456" }; } });
  await flush(); h.change(reference); h.click("参考文から書式案を作る"); await flush(); h.click(saveLabel); await flush();
  assert.equal(h.referenceValue(), reference); assert.match(h.text(), /一時的な通信エラー/);
  h.click(saveLabel); await flush(); assert.equal(h.calls.extract.length, 1); assert.equal(h.calls.save.length, 2);
  assert.equal(h.referenceValue(), ""); h.unmount();
});

test("version conflict refresh keeps the parsed reference and saves it against the explicitly refreshed version", async () => {
  let attempts = 0; const version = "remote_version_123456";
  const h = harness({ read: async () => ({ ...defaultWritingPreferences(), version }), save: async value => {
    if (!attempts++) throw Object.assign(new Error("conflict"), { code: "VERSION_CONFLICT" }); return { ...value, version: "saved_version_123456" };
  } });
  await flush(); h.change(reference); h.click("参考文から書式案を作る"); await flush(); h.click(saveLabel); await flush();
  h.click("最新を読み直す"); await flush(); assert.match(h.text(), /再読み込みは不要/);
  h.click(saveLabel); await flush(); assert.equal(h.calls.extract.length, 1); assert.equal(h.calls.save[1].version, version);
  assert.deepEqual(h.calls.save[1].sectionOrder, extracted.sectionOrder); h.unmount();
});

test("editing a parsed reference requires re-extraction before it can be saved", async () => {
  const h = harness(); await flush(); h.change(reference); h.click("参考文から書式案を作る"); await flush();
  h.change(reference + "変更"); assert.equal(h.button(saveLabel).props.disabled, true); assert.equal(h.calls.save.length, 0); h.unmount();
});

test("switching identities aborts an extraction and cannot apply another account's format", async () => {
  let complete; const h = harness({ extract: () => new Promise(resolve => { complete = resolve; }) });
  await flush(); h.change(reference); h.click("参考文から書式案を作る");
  const signal = h.calls.extract[0][1].signal; h.render({ identityKey: "another-admin" }); await flush();
  assert.equal(signal.aborted, true); complete(extracted); await flush();
  assert.equal(h.referenceValue(), ""); assert.equal(h.button(saveLabel), undefined); assert.equal(h.calls.save.length, 0); h.unmount();
});

test("the already registered standard needs no import and read-only settings cannot save a preview", async () => {
  const h = harness(); await flush(); assert.match(h.text(), /以前共有いただいた紹介文の構成を標準登録済み/);
  assert.equal(h.calls.extract.length, 0); h.change(reference); h.click("参考文から書式案を作る"); await flush();
  h.render({ disabled: true }); assert.equal(h.button(saveLabel).props.disabled, true); assert.equal(h.calls.save.length, 0); h.unmount();
});
