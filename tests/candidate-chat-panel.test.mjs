import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { unicodeLength } from "../lib/candidate-intake.ts";
import * as chat from "../lib/candidate-chat.ts";
import { valueAt } from "../lib/management-data.ts";

const source = ts.transpileModule(fs.readFileSync(new URL("../components/candidate-chat.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const nodes = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === "boolean" ? "" : typeof tree === "string" || typeof tree === "number" ? String(tree)
  : Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function flush() { for (let index = 0; index < 20; index++) await Promise.resolve(); }
function record(id, company, row) {
  const values = Array(26).fill("");
  values[0] = "2026-10-01"; values[1] = company; values[2] = "架空候補者"; values[3] = "検証担当";
  values[5] = "アポインター"; values[6] = "提案候補";
  return { recordId: id, rowVersion: `version-${id}`, row, playerId: "ND-001", candidateName: "架空候補者", source: "", values, formulaColumns: [] };
}
const initialGroup = () => ({ key: '["assigned","ND-001","架空候補者"]', name: "架空候補者", playerId: "ND-001",
  records: [record("record-a", "架空会社A", 2), record("record-b", "架空会社B", 3)] });

// Execute the real panel and its event handlers. Only the native inference and
// capability boundary are mocked; delayed results exercise cancellation safely.
function harness(options = {}) {
  let slots = [], effects = [], cursor = 0, currentKey, tree;
  const calls = { availability: [], device: [], facts: [], copied: [], close: 0 };
  let props = { group: initialGroup(), profiles: [], reviews: [], identityKey: "account-one", open: true,
    onClose: () => { calls.close++; }, ...options.props };
  const equal = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      const slot = slots[index]; return [slot.value, value => { slot.value = typeof value === "function" ? value(slot.value) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] || (slots[index] = { current: initial }); },
    useId() { const index = cursor++; return slots[index] || (slots[index] = "candidate-chat-test"); },
    useMemo(fn, deps) { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value; },
    useEffect(fn, deps) { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) {
      const old = slots[index], slot = { deps }; slots[index] = slot; effects.push(() => { old?.cleanup?.(); slot.cleanup = fn(); }); } },
  };
  const exports = {}, jsx = (type, props, key) => ({ type, props: props || {}, key });
  const native = {
    getOnDeviceAiAvailability: (...args) => { calls.availability.push(args); return options.availabilityPromise || Promise.resolve(options.availability || "available"); },
    generateCandidateChat: (...args) => { calls.device.push(args); return options.device ? options.device(...args) : Promise.resolve({ answer: "端末AIが記録から整理した回答", sourceIds: ["record-a"] }); },
  };
  vm.runInNewContext(source, { exports, module: { exports }, AbortController, structuredClone, Error, JSON,
    crypto: { randomUUID: (() => { let count = 0; return () => `message-${++count}`; })() },
    navigator: { clipboard: { writeText: async value => { if (options.clipboardError) throw new Error("private clipboard details"); calls.copied.push(value); } } },
    require: name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "lucide-react" ? new Proxy({}, { get: (_, key) => key })
      : name.includes("components/ui/dialog") ? Object.fromEntries(["Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription"].map(key => [key, key]))
        : name.includes("candidate-intake") ? { unicodeLength }
          : name.includes("candidate-chat") ? { ...chat, answerCandidateFacts: (...args) => { calls.facts.push(args); return chat.answerCandidateFacts(...args); } }
            : name.includes("management-data") ? { valueAt }
              : name.includes("on-device-ai") ? native : name.endsWith(".css") ? {} : (() => { throw new Error(`Unexpected chat import: ${name}`); })(),
  });
  function unmount() { slots.forEach(slot => slot?.cleanup?.()); }
  function render(next = {}) {
    props = { ...props, ...next };
    const session = exports.CandidateChat(props);
    if (currentKey !== session.key) { unmount(); slots = []; effects = []; currentKey = session.key; }
    cursor = 0; tree = session.type(session.props); while (effects.length) effects.shift()(); return tree;
  }
  const button = label => nodes(render()).find(node => node.type === "button" && text(node).trim() === label);
  const click = label => { const found = button(label); assert.ok(found, `button exists: ${label}`); assert.ok(!found.props.disabled, `button enabled: ${label}`); found.props.onClick?.(); };
  const input = () => nodes(render()).find(node => node.type === "textarea");
  const change = value => input().props.onChange({ target: { value } });
  const submit = () => { const form = nodes(render()).find(node => node.type === "form"); assert.ok(form); form.props.onSubmit({ preventDefault() {} }); };
  const scope = value => nodes(render()).find(node => node.type === "select").props.onChange({ target: { value } });
  const assistant = () => nodes(render()).filter(node => node.type === "article" && String(node.props.className).includes("is-assistant"));
  render();
  return { calls, render, text: () => text(render()), props: () => props, key: () => currentKey, button, click, input, change, submit, scope, assistant, unmount };
}

test("unsupported browsers keep useful record lookup clearly separate from AI", async () => {
  const h = harness({ availability: "unavailable" }); await flush();
  assert.equal(h.button("端末内AI").props.disabled, true);
  h.change("提案先ごとの進捗は？"); h.submit(); await flush();
  assert.equal(h.calls.device.length, 0); assert.equal(h.calls.facts.length, 1);
  assert.match(h.text(), /登録情報から確認（AI未使用）/);
  assert.match(h.text(), /架空会社A|架空会社B/);
  assert.match(h.text(), /対応するPC版Chrome/);
  assert.equal(h.assistant().length, 1); h.unmount();
});

test("opening checks capability without inference and device answers retain their exact source", async () => {
  const h = harness(); await flush();
  assert.equal(h.calls.device.length, 0);
  assert.equal(h.button("端末内AI").props["aria-pressed"], true);
  h.change("現在の状況を教えて"); h.submit(); await flush();
  assert.equal(h.calls.device.length, 1); assert.equal(h.calls.facts.length, 0);
  assert.equal(h.calls.device[0][0].question, "現在の状況を教えて");
  assert.equal(h.calls.device[0][1].timeoutMs, 120000);
  assert.equal(h.calls.device[0][1].preparationTimeoutMs, 600000);
  assert.match(h.text(), /端末AIが記録から整理した回答/);
  const answer = h.assistant()[0];
  assert.match(text(answer), /参照した記録（1）/);
  assert.match(text(answer), /架空会社A/); assert.doesNotMatch(text(answer), /架空会社B/);
  h.click("コピー"); await flush();
  assert.match(h.calls.copied[0], /端末AIが記録から整理した回答\n\n参照：架空会社A/); h.unmount();
});

test("the same send handler cannot launch overlapping native model calls", async () => {
  const pending = deferred(), h = harness({ device: () => pending.promise }); await flush();
  h.change("現在の状況を教えて");
  const form = nodes(h.render()).find(node => node.type === "form");
  form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.device.length, 1);
  assert.equal(h.button("送信").props.disabled, true);
  pending.resolve({ answer: "重複しない回答", sourceIds: ["record-a"] }); await flush();
  assert.equal(h.assistant().length, 1); h.unmount();
});

for (const changed of ["candidate", "account"]) {
  test(`${changed} switches remount the private conversation and reject late answers`, async () => {
    const pending = deferred(), h = harness({ device: () => pending.promise }); await flush();
    h.change("前の候補者だけの質問"); h.submit();
    const signal = h.calls.device[0][1].signal, oldKey = h.key();
    h.render(changed === "candidate" ? { group: { ...initialGroup(), key: "another-candidate", name: "次の架空候補者" } } : { identityKey: "account-two" }); await flush();
    assert.notEqual(h.key(), oldKey); assert.equal(signal.aborted, true);
    pending.resolve({ answer: "前の候補者だけの秘密の回答", sourceIds: ["record-a"] }); await flush();
    assert.doesNotMatch(h.text(), /前の候補者だけ/);
    assert.equal(h.assistant().length, 0); assert.equal(h.input().props.value, ""); h.unmount();
  });
}

for (const ending of ["open-false", "unmount", "close-control"]) {
  test(`${ending} aborts inference and ignores its late response`, async () => {
    const pending = deferred(), h = harness({ device: () => pending.promise }); await flush();
    h.change("状況を教えて"); h.submit(); const signal = h.calls.device[0][1].signal;
    if (ending === "unmount") h.unmount();
    else if (ending === "open-false") h.render({ open: false });
    else nodes(h.render()).find(node => node.type === "Dialog").props.onOpenChange(false);
    assert.equal(signal.aborted, true);
    if (ending === "close-control") assert.equal(h.calls.close, 1);
    pending.resolve({ answer: "閉じたあとに届いた回答", sourceIds: ["record-a"] }); await flush();
    assert.doesNotMatch(h.text(), /閉じたあとに届いた回答/);
    assert.equal(h.assistant().length, 0); h.unmount();
  });
}

test("switching the source scope aborts the old answer and limits subsequent inference to the selected record", async () => {
  const pending = deferred(); let call = 0;
  const h = harness({ device: () => ++call === 1 ? pending.promise : Promise.resolve({ answer: "選択した記録の回答", sourceIds: ["record-b"] }) }); await flush();
  h.change("現在の状況を教えて"); h.submit(); const signal = h.calls.device[0][1].signal;
  h.scope("record-b"); h.render(); assert.equal(signal.aborted, true);
  pending.resolve({ answer: "全件を参照した古い回答", sourceIds: ["record-a"] }); await flush();
  assert.doesNotMatch(h.text(), /全件を参照した古い回答/);
  h.change("この会社の状況は？"); h.submit(); await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.device[1][0].context.sources.map(source => source.id))), ["record-b"]);
  assert.equal(h.calls.device[1][0].history.length, 0, "questions from the previous source scope are not retained as current model history");
  assert.match(h.text(), /選択した記録の回答/); h.unmount();
});

test("source updates mark previous answers stale, disable copy, and exclude them from new model history", async () => {
  const h = harness(); await flush(); h.change("現在の状況を教えて"); h.submit(); await flush();
  assert.equal(h.button("コピー").props.disabled, false);
  const group = structuredClone(h.props().group); group.records[0].values[6] = "面談確定(面談実施待ち)";
  h.render({ group });
  assert.match(h.text(), /更新前の参照情報/);
  assert.equal(h.button("コピー").props.disabled, true);
  h.change("最新の状況を教えて"); h.submit(); await flush();
  assert.equal(h.calls.device[1][0].history.length, 0);
  assert.equal(h.calls.device[1][0].context.sources[0].facts.find(fact => fact.label === "ステータス").value, "面談確定(面談実施待ち)"); h.unmount();
});

test("source updates during inference cancel the result before it can be shown", async () => {
  const pending = deferred(), h = harness({ device: () => pending.promise }); await flush(); h.change("状況を教えて"); h.submit();
  const signal = h.calls.device[0][1].signal, group = structuredClone(h.props().group); group.records[0].values[6] = "提案完了（面談日確定待ち）";
  h.render({ group }); assert.equal(signal.aborted, true);
  pending.resolve({ answer: "変更前の情報の回答", sourceIds: ["record-a"] }); await flush();
  assert.doesNotMatch(h.text(), /変更前の情報の回答/); assert.equal(h.assistant().length, 0); h.unmount();
});

test("unexpected model errors never expose raw details and allow a clearly labelled local retry", async () => {
  const h = harness({ device: () => Promise.reject(new Error("secret-token=https://private.example.invalid/internal")) }); await flush();
  h.change("提案先の進捗は？"); h.submit(); await flush();
  assert.match(h.text(), /回答を作成できませんでした/);
  assert.doesNotMatch(h.text(), /secret-token|private\.example|internal/);
  h.click("登録情報で確認"); await flush();
  assert.equal(h.calls.device.length, 1); assert.equal(h.calls.facts.length, 1);
  assert.match(h.text(), /登録情報から確認（AI未使用）/);
  assert.equal(h.assistant().length, 1); h.unmount();
});

test("plain Enter and IME composition do not submit, while Ctrl or Command Enter does", async () => {
  for (const modifier of ["ctrlKey", "metaKey"]) {
    const h = harness({ availability: "unavailable" }); await flush(); h.change("提案先を教えて");
    let prevented = 0;
    const key = (options = {}) => h.input().props.onKeyDown({ key: "Enter", nativeEvent: { isComposing: false }, preventDefault() { prevented++; }, ...options });
    key(); key({ [modifier]: true, nativeEvent: { isComposing: true } });
    assert.equal(h.calls.facts.length, 0); assert.equal(prevented, 0);
    key({ [modifier]: true }); await flush();
    assert.equal(h.calls.facts.length, 1); assert.equal(prevented, 1); h.unmount();
  }
});

test("Unicode question limits reject overlong and empty submission without losing the draft", async () => {
  const h = harness({ availability: "unavailable" }); await flush();
  h.change(" "); h.submit(); assert.equal(h.calls.facts.length, 0);
  const long = "😀".repeat(1001); h.change(long); h.submit();
  assert.equal(h.calls.facts.length, 0); assert.equal(h.input().props.value, long); assert.equal(h.input().props["aria-invalid"], true);
  assert.equal(h.button("送信").props.disabled, true); h.unmount();
});

test("a capability response cannot override the user's explicit record-lookup selection", async () => {
  const pending = deferred(), h = harness({ availabilityPromise: pending.promise });
  h.click("登録情報を確認"); pending.resolve("available"); await flush();
  assert.equal(h.button("登録情報を確認").props["aria-pressed"], true);
  h.change("現在の状況を教えて"); h.submit(); await flush();
  assert.equal(h.calls.facts.length, 1); assert.equal(h.calls.device.length, 0); h.unmount();
});
