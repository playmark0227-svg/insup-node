import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { blankInterviewFields, normalizeInterviewFields, unicodeLength } from "../lib/candidate-intake.ts";
import { defaultWritingPreferences } from "../lib/on-device-ai.ts";

const source = ts.transpileModule(fs.readFileSync(new URL("../components/candidate-ai-assistant.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function flush() { for (let index = 0; index < 20; index++) await Promise.resolve(); }
const preferences = defaultWritingPreferences();
const state = (kit = null) => ({ kit, pending: false, configured: true, preferences,
  usage: { userRemaining: 3, teamRemaining: 10, resetAt: "2026-10-21T00:00:00+09:00" } });
const kit = { style: "standard", preferenceVersion: preferences.version };
const text = node => node == null || typeof node === "boolean" ? "" : typeof node === "string" || typeof node === "number" ? String(node)
  : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]; }

// Run the actual component and event handlers. The small deterministic hook
// runtime makes delayed model responses, cancellation and account changes testable.
function harness(options = {}) {
  let slots = [], effects = [], cursor = 0, currentKey, tree;
  const calls = { read: [], generate: [], deviceIntroduction: [], deviceCoaching: [], applied: [], copied: [] };
  let props = {
    candidateName: "架空の候補者", fields: { ...blankInterviewFields(), workHistory: "本人申告の営業経験" }, memo: "確認済みの社内メモ",
    introduction: "現在の編集済み文章", identityKey: "account-one:candidate-one", preferences,
    onApplyIntroduction: value => calls.applied.push(value),
    onReadKit: (...args) => { calls.read.push(args); return options.read ? options.read(...args) : Promise.resolve(state()); },
    onGenerateKit: (...args) => { calls.generate.push(args); return options.generate ? options.generate(...args) : Promise.resolve(state(kit)); },
  };
  const equal = (left, right) => left && right && left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
  const react = {
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      const slot = slots[index]; return [slot.value, value => { slot.value = typeof value === "function" ? value(slot.value) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] || (slots[index] = { current: initial }); },
    useId() { const index = cursor++; return slots[index] || (slots[index] = "test-assistant"); },
    useEffect(fn, deps) { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) {
      const old = slots[index], slot = { deps }; slots[index] = slot; effects.push(() => { old?.cleanup?.(); slot.cleanup = fn(); }); } },
  };
  const exports = {};
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const local = {
    getOnDeviceAiAvailability: () => options.availabilityPromise || Promise.resolve(options.availability || "available"),
    generateCandidateIntroduction: (...args) => { calls.deviceIntroduction.push(args); return options.deviceIntroduction ? options.deviceIntroduction(...args) : Promise.resolve({ draft: "端末AIの紹介文" }); },
    generateInterviewCoaching: (...args) => { calls.deviceCoaching.push(args); return options.deviceCoaching ? options.deviceCoaching(...args) : Promise.resolve({ summary: "確認事項の要約", questions: ["稼働条件を確認する質問"], actions: ["確認結果を記録する"] }); },
  };
  const writing = {
    composeWritingKitIntroduction: (name, fields) => ({ text: `【基本情報】${name}\n${fields.workHistory}`, truncated: false, omittedFields: [] }),
    selectWritingKitQuestions: (_kit, input) => ({ questions: [input.reflection ? "聞き方を振り返る質問例" : "希望を確認する質問例"], actions: ["事実を確認して記録する"], sourceLabels: ["端末内で選んだ確認事項"] }),
  };
  const context = vm.createContext({ exports, module: { exports }, AbortController, structuredClone, Error, JSON,
    navigator: { clipboard: { writeText: async value => { if (options.clipboardError) throw new Error("denied"); calls.copied.push(value); } } },
    require: name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "lucide-react" ? new Proxy({}, { get: (_, name) => name })
      : name.includes("candidate-intake") ? { normalizeInterviewFields, unicodeLength, introductionLimit: 1000 }
      : name.includes("on-device-ai") ? local : name.includes("writing-ai") ? writing : {},
  });
  vm.runInContext(source, context);
  function unmount() { slots.forEach(slot => slot?.cleanup?.()); }
  function render(next = {}) {
    props = { ...props, ...next };
    const session = exports.CandidateAiAssistant(props);
    if (currentKey !== session.key) { unmount(); slots = []; effects = []; currentKey = session.key; }
    cursor = 0; tree = session.type(session.props); while (effects.length) effects.shift()(); return tree;
  }
  const button = label => nodes(render()).find(node => node.type === "button" && text(node) === label);
  const click = label => { const node = button(label); assert.ok(node, `Button not found: ${label}`); assert.ok(!node.props.disabled, `Button is disabled: ${label}`); node.props.onClick(); };
  const change = (suffix, value) => { const node = nodes(render()).find(node => node.type === "textarea" && node.props.id.endsWith(suffix)); assert.ok(node, suffix); node.props.onChange({ target: { value } }); };
  render();
  return { calls, render, text: () => text(render()), click, button, change, unmount };
}

test("cloud AI receives only the style enum; its candidate draft needs explicit replacement approval", async () => {
  const pending = deferred(), h = harness({ availability: "unavailable", generate: () => pending.promise }); await flush();
  h.click("AI文章構成で作成"); await flush();
  assert.deepEqual(h.calls.generate, [["standard"]]); assert.deepEqual(h.calls.read, [["standard"]]);
  assert.equal(h.calls.applied.length, 0);
  pending.resolve(state(kit)); await flush();
  assert.match(h.text(), /AIの構成＋原文を端末内で組み合わせ/);
  assert.match(h.text(), /本人申告の営業経験/); assert.equal(h.calls.applied.length, 0);
  h.click("この文章を使う"); assert.equal(h.calls.applied.length, 0);
  h.click("現在の文章を残す"); assert.equal(h.calls.applied.length, 0);
  h.click("この文章を使う"); h.click("確認して置き換える");
  assert.deepEqual(h.calls.applied, ["【基本情報】架空の候補者\n本人申告の営業経験"]);
  h.unmount();
});

test("editing source or the current introduction during generation never gets overwritten", async () => {
  const pending = deferred(), h = harness({ availability: "unavailable", generate: () => pending.promise }); await flush();
  h.click("AI文章構成で作成");
  h.render({ fields: { ...blankInterviewFields(), workHistory: "更新した面談情報" }, introduction: "作成中に手で直した文章" });
  pending.resolve(state(kit)); await flush();
  assert.match(h.text(), /変更前の結果/);
  assert.equal(h.button("この文章を使う").props.disabled, true);
  assert.equal(h.button("コピー").props.disabled, true);
  assert.equal(h.calls.applied.length, 0); h.unmount();
});

test("cancelled cloud responses are ignored and the component does not lock navigation", async () => {
  const pending = deferred(), h = harness({ availability: "unavailable", generate: () => pending.promise }); await flush();
  h.click("AI文章構成で作成"); assert.match(h.text(), /画面の移動は続けられます/);
  h.click("面談準備・振り返り"); h.change("-reflection", "質問の順番を振り返る");
  h.click("キャンセル"); pending.resolve(state(kit)); await flush();
  assert.doesNotMatch(h.text(), /紹介文の候補|次の面談への準備/);
  assert.equal(h.calls.applied.length, 0); assert.match(h.text(), /キャンセルしました/); h.unmount();
});

test("switching candidate/account remounts private notes and rejects previous model results", async () => {
  const pending = deferred(), h = harness({ availability: "available", deviceCoaching: () => pending.promise }); await flush();
  h.click("端末AI対応するPCブラウザ"); h.click("面談準備・振り返り");
  h.change("-memo", "前のアカウントだけのメモ"); h.change("-reflection", "前のアカウントだけの反省");
  h.click("端末AIで次の対応を作成");
  const signal = h.calls.deviceCoaching[0][1].signal;
  h.render({ identityKey: "account-two:candidate-two", candidateName: "次の架空候補者", memo: "次のメモ" }); await flush();
  assert.equal(signal.aborted, true);
  pending.resolve({ summary: "古いアカウントの結果", questions: ["古い質問"], actions: ["古い行動"] }); await flush();
  assert.doesNotMatch(h.text(), /古いアカウントの結果|前のアカウントだけの/);
  h.click("面談準備・振り返り");
  const values = nodes(h.render()).filter(node => node.type === "textarea").map(node => node.props.value);
  assert.ok(values.includes("次のメモ")); assert.ok(!values.some(value => value.includes("前のアカウント")));
  h.unmount();
});

test("an unavailable device AI never falls back to sending private content to the cloud", async () => {
  const h = harness({ availability: "unavailable" }); await flush(); h.click("端末AI対応するPCブラウザ");
  assert.match(h.text(), /この端末・ブラウザでは端末AIを利用できません/);
  assert.equal(h.button("端末AIで紹介文を作成").props.disabled, true);
  assert.equal(h.calls.generate.length, 0); assert.equal(h.calls.deviceIntroduction.length, 0);
  h.unmount();
});

test("saved preferences apply to successive candidates without any daily reference input", async () => {
  const saved = { ...preferences, version: "saved_version_123456", tone: "plain", targetLength: 600 };
  const h = harness({ availability: "available" }); await flush();
  h.render({ preferences: saved });
  assert.match(h.text(), /登録済みの紹介文書式を自動使用/);
  assert.ok(!nodes(h.render()).some(node => node.type === "textarea" && node.props.id.endsWith("-reference")));
  h.click("端末AIで紹介文を作成"); await flush();
  h.render({ identityKey: "account-one:next-candidate", candidateName: "次の架空候補者", preferences: saved }); await flush();
  h.click("端末AIで紹介文を作成"); await flush();
  assert.equal(h.calls.deviceIntroduction.length, 2);
  for (const [input] of h.calls.deviceIntroduction) {
    assert.equal(input.preferences.version, saved.version); assert.equal(input.preferences.tone, "plain");
    assert.equal(input.preferences.targetLength, 600); assert.ok(!Object.hasOwn(input, "referenceText"));
  }
  assert.equal(h.calls.deviceIntroduction[1][0].candidateName, "次の架空候補者"); h.unmount();
});

test("device coaching uses an immutable source snapshot with the user's own reflection", async () => {
  const pending = deferred(), h = harness({ availability: "available", deviceCoaching: () => pending.promise }); await flush();
  h.click("端末AI対応するPCブラウザ"); h.click("面談準備・振り返り");
  h.change("-memo", "初めに確認した希望条件"); h.change("-reflection", "最後まで質問を聞けなかった");
  h.click("端末AIで次の対応を作成"); h.change("-memo", "生成中に追加したメモ");
  const input = h.calls.deviceCoaching[0][0];
  assert.equal(input.memo, "初めに確認した希望条件"); assert.equal(input.selfReflection, "最後まで質問を聞けなかった");
  assert.equal(input.profile.workHistory, "本人申告の営業経験");
  assert.equal(h.calls.generate.length, 0);
  h.unmount(); assert.equal(h.calls.deviceCoaching[0][1].signal.aborted, true);
  pending.resolve({ summary: "遅れて返った結果", questions: ["確認"], actions: ["記録"] }); await flush();
  assert.equal(h.calls.applied.length, 0);
});

test("copy errors retain the generated draft and working notes can be copied explicitly", async () => {
  const h = harness({ availability: "unavailable" }); await flush(); h.click("面談準備・振り返り"); h.change("-reflection", "次回は希望曜日を確認");
  h.click("このメモをコピー"); await flush();
  assert.equal(h.calls.copied[0], "面談メモ\n確認済みの社内メモ\n\n自分の振り返り\n次回は希望曜日を確認");
  assert.equal(h.calls.generate.length, 0); h.unmount();
  const failed = harness({ availability: "unavailable", clipboardError: true }); await flush(); failed.click("AI文章構成で作成"); await flush();
  failed.click("コピー"); await flush(); assert.match(failed.text(), /コピーできませんでした/);
  assert.match(failed.text(), /本人申告の営業経験/); assert.equal(failed.calls.applied.length, 0); failed.unmount();
});

test("a second click cannot start another request and manual introduction edits stay reviewable", async () => {
  const pending = deferred(), h = harness({ availability: "unavailable", generate: () => pending.promise }); await flush();
  const start = h.button("AI文章構成で作成"); start.props.onClick(); start.props.onClick();
  assert.equal(h.calls.generate.length, 1);
  h.render({ introduction: "AIを待ちながら手動で書いた文章" }); pending.resolve(state(kit)); await flush();
  assert.match(h.text(), /作成中に現在の紹介文が編集されました/);
  assert.equal(h.calls.applied.length, 0);
  h.click("この文章を使う"); assert.match(h.text(), /現在の紹介文をこの候補に置き換えます/);
  assert.equal(h.calls.applied.length, 0); h.unmount();
});

test("cached AI structures remain reusable after the daily generation limit", async () => {
  const h = harness({ availability: "unavailable", read: () => Promise.resolve({ ...state(kit), usage: { userRemaining: 0, teamRemaining: 0, resetAt: "2026-10-21T00:00:00+09:00" } }) });
  await flush(); h.click("保存済みのAI構成で作成"); await flush();
  assert.equal(h.calls.generate.length, 0); assert.match(h.text(), /紹介文の候補/); h.unmount();
});

test("saved interview notes and reflection reopen and edits are handed to the profile owner", async () => {
  const changes = [], advice = [], h = harness({ availability: "unavailable" }); await flush();
  h.render({ fields: { ...blankInterviewFields(), workHistory: "本人申告の営業経験", interviewMemo: "保存済みの候補者メモ", selfReflection: "保存済みの自分の反省", interviewAdvice: "前回の準備案" },
    onNotesChange: value => changes.push(value), onSaveAdvice: value => advice.push(value) });
  h.click("面談準備・振り返り");
  let inputs = nodes(h.render()).filter(node => node.type === "textarea");
  assert.ok(inputs.some(node => node.props.value === "保存済みの候補者メモ"));
  assert.ok(inputs.some(node => node.props.value === "保存済みの自分の反省"));
  assert.ok(inputs.some(node => node.props.value === "前回の準備案"));
  assert.match(h.text(), /基本情報を保存すると残せます/);
  assert.match(h.text(), /今の面談情報と一致するとは限りません/);
  h.change("-memo", "編集したメモ");
  h.change("-reflection", "編集した自分の反省");
  assert.deepEqual(JSON.parse(JSON.stringify(changes)), [{ memo: "編集したメモ", reflection: "保存済みの自分の反省" }, { memo: "編集したメモ", reflection: "編集した自分の反省" }]);
  h.change("-saved-advice", "編集した前回の準備案");
  assert.deepEqual(advice, ["編集した前回の準備案"]); h.unmount();
});

test("approved coaching enters a separate save field and that field never makes the result stale", async () => {
  const saved = [], h = harness({ availability: "unavailable" }); await flush();
  const fields = { ...blankInterviewFields(), workHistory: "本人申告の営業経験" };
  h.render({ fields, onSaveAdvice: value => saved.push(value) });
  h.click("面談準備・振り返り"); h.click("AI文章構成で作成"); await flush();
  assert.equal(saved.length, 0); h.click("この準備案を保存欄に反映");
  assert.equal(saved.length, 1); assert.match(saved[0], /作成日時：/); assert.match(saved[0], /面談で確認すること/); assert.match(saved[0], /次の行動/);
  assert.ok(unicodeLength(saved[0]) <= 5000);
  h.render({ fields: { ...fields, interviewAdvice: saved[0] } });
  assert.doesNotMatch(h.text(), /変更前の結果/);
  assert.equal(h.button("この準備案を保存欄に反映").props.disabled, false);
  assert.equal(h.calls.generate.length, 1); h.unmount();
});

test("supported desktop AI is the initial choice but model preparation still needs an explicit click", async () => {
  for (const availability of ["available", "downloadable", "downloading"]) {
    const h = harness({ availability }); await flush();
    assert.equal(h.button("端末AI対応するPCブラウザ").props["aria-pressed"], true);
    assert.equal(h.button("AI文章構成PC・スマートフォン").props["aria-pressed"], false);
    assert.equal(h.calls.deviceIntroduction.length, 0); assert.equal(h.calls.generate.length, 0);
    h.click(availability === "available" ? "端末AIで紹介文を作成" : "モデルを準備して作成"); await flush();
    assert.equal(h.calls.deviceIntroduction.length, 1); assert.equal(h.calls.generate.length, 0);
    assert.equal(h.calls.deviceIntroduction[0][1].preparationTimeoutMs, 600000);
    assert.equal(h.calls.deviceIntroduction[0][1].timeoutMs, 120000);
    assert.match(h.text(), /端末AIの紹介文/); assert.equal(h.calls.applied.length, 0); h.unmount();
  }
});

test("a delayed capability result never replaces the user's selected AI method", async () => {
  for (const [choice, resolved] of [["structure", "available"], ["device", "unavailable"]]) {
    const pending = deferred(), h = harness({ availabilityPromise: pending.promise }); await flush();
    h.click(choice === "structure" ? "AI文章構成PC・スマートフォン" : "端末AI対応するPCブラウザ");
    pending.resolve(resolved); await flush();
    assert.equal(h.button(choice === "structure" ? "AI文章構成PC・スマートフォン" : "端末AI対応するPCブラウザ").props["aria-pressed"], true);
    if (choice === "structure") { h.click("AI文章構成で作成"); await flush(); assert.equal(h.calls.generate.length, 1); assert.equal(h.calls.deviceIntroduction.length, 0); }
    else { assert.equal(h.button("端末AIで紹介文を作成").props.disabled, true); assert.match(h.text(), /この端末・ブラウザでは端末AIを利用できません/); }
    h.unmount();
  }
});

test("a late capability check cannot switch methods after a user has already started generation", async () => {
  const capability = deferred(), writing = deferred(), h = harness({ availabilityPromise: capability.promise, generate: () => writing.promise });
  await flush(); h.click("AI文章構成で作成"); capability.resolve("available"); await flush();
  assert.equal(h.button("AI文章構成PC・スマートフォン").props["aria-pressed"], true);
  writing.resolve(state(kit)); await flush();
  assert.match(h.text(), /AIの構成＋原文を端末内で組み合わせ/); assert.equal(h.calls.deviceIntroduction.length, 0); h.unmount();
});

test("model preparation timeout keeps edited notes and offers a retry without implying the download is still running", async () => {
  const pending = deferred(), h = harness({ availability: "downloadable", deviceIntroduction: (_input, options) => {
    options.onProgress({ phase: "downloading", downloadProgress: .42 }); return pending.promise;
  } }); await flush();
  assert.match(h.text(), /準備に数分かかることがあります/); assert.match(h.text(), /途中でキャンセルできます/);
  h.click("モデルを準備して作成"); await flush();
  assert.ok(nodes(h.render()).some(node => node.type === "progress" && node.props.value === .42));
  h.click("面談準備・振り返り"); h.change("-memo", "モデル準備中に追記した原文");
  pending.reject({ code: "TIMEOUT", phase: "preparation" }); await flush();
  assert.match(h.text(), /待機を終了しました/); assert.match(h.text(), /Chromeの準備状況を確認して進められます/);
  assert.doesNotMatch(h.text(), /ダウンロードを継続しています|バックグラウンドでダウンロード/);
  assert.ok(nodes(h.render()).some(node => node.type === "textarea" && node.props.value === "モデル準備中に追記した原文"));
  assert.equal(h.calls.applied.length, 0); assert.equal(h.calls.generate.length, 0);
  assert.equal(h.button("モデルを準備して作成").props.disabled, false); h.unmount();
});

test("generation timeout has a distinct safe message and leaves the existing introduction untouched", async () => {
  const h = harness({ availability: "available", deviceCoaching: () => Promise.reject({ code: "TIMEOUT", phase: "generation" }) }); await flush();
  h.click("面談準備・振り返り"); h.click("端末AIで次の対応を作成"); await flush();
  assert.equal(h.calls.deviceCoaching[0][1].preparationTimeoutMs, 600000);
  assert.equal(h.calls.deviceCoaching[0][1].timeoutMs, 120000);
  assert.match(h.text(), /文章の作成に時間がかかったため中止しました/); assert.match(h.text(), /入力内容と現在の文章は残っています/);
  assert.equal(h.calls.applied.length, 0); assert.equal(h.calls.generate.length, 0); h.unmount();
});
