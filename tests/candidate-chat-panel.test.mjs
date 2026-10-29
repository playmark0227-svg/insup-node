import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { blankInterviewFields, unicodeLength } from "../lib/candidate-intake.ts";
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
const profileWithAmbiguities = () => ({ profileId: "profile-a", playerId: "ND-001", recordIds: ["record-a"],
  version: "profile-version", updatedAt: "2026-10-21T10:00:00Z", introduction: "",
  fields: { ...blankInterviewFields(), age: "20", gender: "男性", residence: "北海道札幌市",
    availableFrom: "2026-11-01", daysPerWeek: "週5日", monthlyHours: "80時間", desiredHourlyRate: "3000円",
    workHistory: "営業職でテレアポを担当", achievements: "営業会社で1位", strengths: "コミュニケーション能力・Adobe・Claude",
    pcEnvironment: "MacBook", networkEnvironment: "光回線", crmTools: ["Salesforce", "kintone"], chatTools: ["Chatwork"] } });

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
  const button = label => nodes(render()).find(node => node.type === "button" && (node.props["aria-label"] === label || node.props["aria-label"]?.endsWith(`：${label}`) || text(node).trim() === label));
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

test("same-name profiles cannot be sent together and choosing a profile scopes every source",async()=>{
 const group=initialGroup();group.records[0].profileId='profile-a';group.records[1].profileId='profile-b';
 const a=profileWithAmbiguities(),b={...profileWithAmbiguities(),profileId:'profile-b',recordIds:['record-b'],fields:{...blankInterviewFields(),age:'40',workHistory:'人物B専用の職歴'}};
 const h=harness({props:{group,profiles:[a,b]}});await flush();
 assert.match(h.text(),/別の人の情報を混ぜない/);assert.equal(h.button('追加入力したほうがいい情報は？').props.disabled,true);
 h.change('希望条件と職歴を整理して');assert.equal(h.button('送信').props.disabled,true);h.submit();await flush();
 assert.equal(h.calls.device.length,0);assert.equal(h.calls.facts.length,0);assert.equal(h.input().props.value,'希望条件と職歴を整理して');
 h.scope('profile:profile-b');h.submit();await flush();
 assert.equal(h.calls.device.length,1);assert.equal(h.calls.device[0][0].question,'希望条件と職歴を整理して');
 const context=h.calls.device[0][0].context;
 assert.deepEqual(Array.from(context.sources,source=>source.id),['record-b','profile:profile-b']);
 assert.match(JSON.stringify(context),/人物B専用/);assert.doesNotMatch(JSON.stringify(context),/Salesforce|3000円|架空会社A/);
 h.unmount();
});

test("selecting one record resolves multiple explicit identities without requiring profile documents",async()=>{
 const group=initialGroup();group.records[0].profileId='person-a';group.records[1].profileId='person-b';
 const h=harness({availability:'unavailable',props:{group}});await flush();
 h.scope('record-b');h.change('提案先ごとの進捗は？');h.submit();await flush();
 assert.equal(h.calls.device.length,0);assert.equal(h.calls.facts.length,1);
 assert.deepEqual(Array.from(h.calls.facts[0][0].sources,source=>source.id),['record-b']);
 assert.match(text(h.assistant()[0]),/架空会社B/);assert.doesNotMatch(text(h.assistant()[0]),/架空会社A/);h.unmount();
});

test("selecting another identity cancels inference and excludes prior identity history from the next question",async()=>{
 const group=initialGroup();group.records[0].profileId='profile-a';group.records[1].profileId='profile-b';
 const pending=deferred();let first=true;
 const h=harness({props:{group},device:()=>first?(first=false,pending.promise):Promise.resolve({answer:'選択した記録のみ',sourceIds:['record-b']})});await flush();
 h.scope('profile:profile-a');h.change('現在の状況を教えて');h.submit();await flush();assert.equal(h.calls.device.length,1);
 h.scope('profile:profile-b');assert.equal(h.calls.device[0][1].signal.aborted,true);
 pending.resolve({answer:'前の人に関する回答',sourceIds:['record-a']});await flush();assert.equal(h.assistant().length,0);
 h.change('希望条件は？');h.submit();await flush();assert.equal(h.calls.device.length,2);
 assert.equal(h.calls.device[1][0].history.length,0);assert.deepEqual(Array.from(h.calls.device[1][0].context.sources,source=>source.id),['record-b']);
 assert.doesNotMatch(h.text(),/前の人に関する回答/);h.unmount();
});

test("newly ambiguous refreshed data blocks further questions and preserves the typed draft",async()=>{
 const h=harness();await flush();h.change('入力中の質問');
 const group=initialGroup();group.records[0].profileId='profile-a';group.records[1].profileId='profile-b';
 h.render({group});h.submit();await flush();
 assert.equal(h.calls.device.length,0);assert.equal(h.calls.facts.length,0);assert.equal(h.input().props.value,'入力中の質問');
 assert.match(h.text(),/参照する記録または基本情報を1つ選んで/);h.unmount();
});

test("a native record-check response is labelled accurately and retains record citations when copied", async () => {
  const answer = "はい。希望単価の単位と、稼働できる曜日・時間帯を確認してください。";
  const h = harness({ device: () => Promise.resolve({ answer, sourceIds: ["record-b"], method: "record-check" }) }); await flush();
  h.change("何か入れるべき情報ある？"); h.submit(); await flush();
  assert.equal(h.calls.device.length, 1); assert.equal(h.calls.facts.length, 0);
  const message = h.assistant()[0];
  assert.equal(text(nodes(message).find(node => node.type === "strong")), "入力内容のチェック（AI未使用）");
  assert.match(text(message), /参照した記録（1）/); assert.match(text(message), /架空会社B/);
  assert.doesNotMatch(text(message), /架空会社A|sourceIds|record-b/);
  h.click("コピー"); await flush();
  assert.equal(h.calls.copied[0], `${answer}\n\n参照：架空会社B · 面談 2026-10-01 · 記録行 3`);
  assert.doesNotMatch(h.calls.copied[0], /sourceIds|record-b/); h.unmount();
});

test("the missing-information suggestion asks a useful input question directly instead of requesting a summary", async () => {
  const h = harness({ availability: "unavailable", props: { profiles: [profileWithAmbiguities()] } }); await flush();
  assert.ok(h.button("追加入力したほうがいい情報は？"));
  assert.equal(h.button("現在の状況は？"), undefined);
  h.click("追加入力したほうがいい情報は？"); await flush();
  assert.equal(h.calls.facts.length, 1); assert.equal(h.calls.device.length, 0);
  assert.equal(h.calls.facts[0][1], "追加入力したほうがいい情報は？");
  assert.match(text(h.assistant()[0]), /入力内容のチェック（AI未使用）/); h.unmount();
});

test("purpose-based suggestions explain their output and keep missing information separate from a summary", async () => {
  const h = harness({ availability: "unavailable", props: { profiles: [profileWithAmbiguities()] } }); await flush();
  assert.match(h.text(), /不足・あいまいな情報/);
  assert.match(h.text(), /確認する項目・理由・本人への質問/);
  assert.match(h.text(), /登録内容を要約/);
  assert.match(h.text(), /参照中：提案・履歴 2件 · 基本情報 1件 · 振り返り 0件/);
  h.click("希望条件と職歴を整理して"); await flush();
  assert.equal(h.calls.facts[0][1], "希望条件と職歴を整理して");
  assert.match(h.text(), /続けて|実際の状況に合わせて次の対応/);
  assert.ok(h.button("追加入力したほうがいい情報は？")); h.unmount();
});

test("record-check answers explain manual correction and offer a source-grounded follow-up", async () => {
  const h = harness({ availability: "unavailable", props: { profiles: [profileWithAmbiguities()] } }); await flush();
  h.click("追加入力したほうがいい情報は？"); await flush();
  assert.match(h.text(), /「基本情報・紹介文」や「進捗・実績を編集」で記録/);
  assert.match(h.text(), /相談の回答だけでは登録内容は変わりません/);
  h.click("他には？"); await flush();
  assert.equal(h.calls.facts.length, 2);
  assert.equal(h.calls.facts[1][1], "他には？");
  assert.equal(h.calls.facts[1][2][0].content, "追加入力したほうがいい情報は？");
  assert.match(text(h.assistant()[1]), /確認する質問/); h.unmount();
});

test("a failed question can be edited without silently resubmitting it", async () => {
  const h = harness({ device: () => Promise.reject(new Error("temporary model failure")) }); await flush();
  h.change("C面談前に確認することは？"); h.submit(); await flush();
  assert.equal(h.input().props.value, "");
  h.click("質問を編集");
  assert.equal(h.input().props.value, "C面談前に確認することは？");
  assert.equal(h.calls.device.length, 1);
  assert.doesNotMatch(h.text(), /回答を作成できませんでした/); h.unmount();
});

test("editing a failed question preserves a newer question already being drafted", async () => {
  const pending = deferred(), h = harness({ device: () => pending.promise }); await flush();
  h.change("回答に失敗する最初の質問"); h.submit();
  h.change("手入力で編集中の次の質問");
  pending.reject(new Error("temporary model failure")); await flush();
  h.click("質問を編集");
  assert.equal(h.input().props.value, "手入力で編集中の次の質問");
  assert.equal(h.calls.device.length, 1); h.unmount();
});

test("the reported missing-information question returns specific checks rather than a profile recap in record mode", async () => {
  const h = harness({ availability: "unavailable", props: { profiles: [profileWithAmbiguities()] } }); await flush();
  h.change("何か入れるべき情報ある？"); h.submit(); await flush();
  assert.equal(h.calls.device.length, 0); assert.equal(h.calls.facts.length, 1);
  const message = h.assistant()[0], body = nodes(message).find(node => node.props.className === "candidate-chat-answer");
  assert.match(text(message), /入力内容のチェック（AI未使用）/);
  assert.match(text(body), /希望単価/); assert.match(text(body), /時給・月額・件単価/);
  assert.match(text(body), /実績/); assert.match(text(body), /対象期間/);
  assert.match(text(body), /希望時間帯/); assert.match(text(body), /確認する質問/);
  assert.doesNotMatch(text(body), /年齢20歳|男性|北海道札幌市|現在の状況をご説明|sourceIds|profile-a/);
  assert.match(text(message), /基本情報 · 架空会社A/); h.unmount();
});

test("short follow-ups pass the preceding user intent to the real record helper", async () => {
  const h = harness({ availability: "unavailable", props: { profiles: [profileWithAmbiguities()] } }); await flush();
  h.change("何か入れるべき情報ある？"); h.submit(); await flush();
  h.change("他には？"); h.submit(); await flush();
  assert.equal(h.calls.facts.length, 2);
  const history = h.calls.facts[1][2];
  assert.equal(history.length, 2); assert.equal(history[0].role, "user");
  assert.equal(history[0].content, "何か入れるべき情報ある？");
  assert.equal(history[1].role, "assistant");
  assert.equal(history.some(message => message.role === "user" && message.content === "他には？"), false);
  const reply = h.assistant()[1]; assert.ok(reply);
  assert.match(text(reply), /入力内容のチェック（AI未使用）/);
  assert.match(text(reply), /確認する質問/); assert.doesNotMatch(text(reply), /その項目に対応する記録は見つかりません/); h.unmount();
});

test("native retries exclude the last repeated user question while preserving earlier context", async () => {
  let count = 0;
  const h = harness({ device: () => ++count === 2 ? Promise.reject(new Error("temporary model failure"))
    : Promise.resolve({ answer: "参照した記録の回答", sourceIds: ["record-a"] }) }); await flush();
  h.change("現在の状況を教えて"); h.submit(); await flush();
  h.change("希望時間帯は？"); h.submit(); await flush();
  assert.match(h.text(), /回答を作成できませんでした/);
  h.click("再試行"); await flush();
  assert.equal(h.calls.device.length, 3);
  const request = h.calls.device[2][0];
  assert.equal(request.question, "希望時間帯は？");
  assert.equal(request.history.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(request.history.map(message => message.role))), ["user", "assistant"]);
  assert.equal(request.history[0].content, "現在の状況を教えて");
  assert.equal(request.history.some(message => message.role === "user" && message.content === request.question), false);
  assert.equal(nodes(h.render()).filter(node => node.type === "article" && String(node.props.className).includes("is-user") && text(node).includes("希望時間帯は？")).length, 1);
  h.unmount();
});

test("switching a failed native question to record lookup does not duplicate that question in history", async () => {
  const h = harness({ props: { profiles: [profileWithAmbiguities()] }, device: () => Promise.reject(new Error("temporary model failure")) }); await flush();
  h.change("何か入れるべき情報ある？"); h.submit(); await flush();
  h.click("登録情報で確認"); await flush();
  assert.equal(h.calls.device.length, 1); assert.equal(h.calls.facts.length, 1);
  assert.equal(h.calls.facts[0][1], "何か入れるべき情報ある？");
  assert.equal(h.calls.facts[0][2].length, 0);
  assert.match(text(h.assistant()[0]), /入力内容のチェック（AI未使用）/);
  assert.match(text(h.assistant()[0]), /希望単価/); h.unmount();
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
