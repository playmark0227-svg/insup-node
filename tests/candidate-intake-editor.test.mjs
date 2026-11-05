import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as intake from "../lib/candidate-intake.ts";
import * as introductionReview from "../lib/introduction-review.ts";

const source = ts.transpileModule(fs.readFileSync(new URL("../components/candidate-intake.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const text = node => node == null || typeof node==='boolean'?'':typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):text(node.props?.children);

// The real intake component is run with controlled parent props and a fake clock.
// This tests its delayed edits rather than looking for implementation strings.
function harness(initial = {}) {
  const slots = [], effects = [], timers = new Map(), introductions = [], fieldChanges = [], copied=[];
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
    navigator: { clipboard: { writeText: async value => {copied.push(value);} } },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout: id => timers.delete(id),
    require: name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "lucide-react" ? new Proxy({}, { get: (_, name) => name })
      : name.includes("introduction-review") ? introductionReview : name.includes("candidate-intake") ? intake : name.includes("candidate-ai-assistant") ? { CandidateAiAssistant: "CandidateAiAssistant" } : {},
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
  function button(label) { const node=nodes(render()).find(node=>node.type==='button'&&text(node)===label);assert.ok(node,label);return node; }
  function unmount() { slots.forEach(slot => slot?.cleanup?.()); }
  render();
  return { render, advance, change, adoptAi, button, copied, text:()=>text(render()), unmount, introductions, fieldChanges, pendingTimers: () => timers.size,
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

test("editing a saved profile preserves its introduction but requires explicit review before copying changed conditions",async()=>{
 const h=harness({fields:{...intake.blankInterviewFields(),desiredHourlyRate:'時給2000円'},introduction:'保存済み本文：時給2000円'});
 assert.equal(h.button('文章をコピー').props.disabled,false);
 h.change('-attendanceConcerns','社内だけの確認');h.change('-additionalNotes','内部メモの更新');
 const ai=nodes(h.render()).find(node=>node.type==='CandidateAiAssistant');ai.props.onNotesChange({memo:'面談の内部メモ',reflection:'内部の振り返り'});
 assert.equal(h.button('文章をコピー').props.disabled,false,'private notes do not invalidate client copy');
 h.change('-desiredHourlyRate','時給3000円');
 assert.equal(h.introduction(),'保存済み本文：時給2000円');assert.match(h.text(),/コピーを保留/);
 assert.equal(h.button('文章をコピー').props.disabled,true);
 await h.button('文章をコピー').props.onClick();assert.deepEqual(h.copied,[],'the handler also rejects a stale copy');
 h.change('-introduction','手修正：時給3000円');assert.equal(h.button('文章をコピー').props.disabled,true,'typing does not silently confirm the new source');
 h.button('本文を確認した').props.onClick();assert.equal(h.button('文章をコピー').props.disabled,false);
 await h.button('文章をコピー').props.onClick();assert.deepEqual(h.copied,['手修正：時給3000円']);
 h.change('-timeWindow','平日午後');assert.equal(h.button('文章をコピー').props.disabled,true,'another condition change needs another review');h.unmount();
});

test("an adopted AI introduction is retained and withheld from copying until the latest candidate is adopted",()=>{
 const h=harness({fields:{...intake.blankInterviewFields(),desiredHourlyRate:'時給2000円'}});
 h.adoptAi('採用済み本文：時給2000円');assert.equal(h.button('文章をコピー').props.disabled,false);
 h.change('-desiredHourlyRate','時給3000円');h.advance(2000);
 assert.equal(h.introduction(),'採用済み本文：時給2000円');assert.equal(h.button('文章をコピー').props.disabled,true);
 h.change('-introduction','採用済み本文：時給2000円。');assert.equal(h.button('文章をコピー').props.disabled,true);
 h.adoptAi('最新の採用本文：時給3000円');assert.equal(h.button('文章をコピー').props.disabled,false);assert.doesNotMatch(h.text(),/コピーを保留/);h.unmount();
});

test("explicit reformatting resets the shared-source baseline only after replacement is confirmed",()=>{
 const h=harness({fields:{...intake.blankInterviewFields(),desiredHourlyRate:'時給2000円'}});
 h.advance(250);h.render();assert.equal(h.button('文章をコピー').props.disabled,false);
 h.change('-introduction','自分で整えた本文：時給2000円');h.change('-desiredHourlyRate','時給3000円');
 assert.equal(h.button('文章をコピー').props.disabled,true);
 h.button('入力から整形').props.onClick();assert.equal(h.button('文章をコピー').props.disabled,true);assert.equal(h.introduction(),'自分で整えた本文：時給2000円');
 h.button('整形し直す').props.onClick();assert.equal(h.button('文章をコピー').props.disabled,false);assert.match(h.introduction(),/時給3000円/);
 h.change('-desiredHourlyRate','時給4000円');assert.equal(h.button('文章をコピー').props.disabled,true);h.unmount();
});

test("the editor notifies its initial review state and clears a temporary auto-template review after updating",()=>{
 const notifications=[],h=harness({onIntroductionReviewChange:required=>notifications.push(required)});
 assert.deepEqual(notifications,[false]);h.advance(250);h.render();
 h.change('-workHistory','最新の確認済み経歴');assert.equal(notifications.at(-1),true);
 h.advance(250);h.render();h.render();assert.equal(notifications.at(-1),false);assert.match(h.introduction(),/最新の確認済み経歴/);
 h.change('-additionalNotes','内部メモの更新');assert.equal(notifications.at(-1),false);assert.equal(h.button('文章をコピー').props.disabled,false);h.unmount();
});

test("unmounting or disabling the editor cancels pending automatic drafts", () => {
  const closed = harness(); assert.equal(closed.pendingTimers(), 1); closed.unmount();
  assert.equal(closed.pendingTimers(), 0); closed.advance(1000); assert.equal(closed.introductions.length, 0);
  const disabled = harness(); disabled.render({ disabled: true }); assert.equal(disabled.pendingTimers(), 0);
  disabled.advance(1000); assert.equal(disabled.introductions.length, 0);
  disabled.render({ disabled: false }); disabled.advance(250); assert.equal(disabled.introductions.length, 1); disabled.unmount();
});


test("only direct shareable profile edits advance automatic AI input revision",()=>{
 const h=harness({introduction:"既存の紹介文"});
 const aiProps=()=>nodes(h.render()).find(node=>node.type==="CandidateAiAssistant").props;
 assert.equal(aiProps().inputRevision,0);
 h.render({fields:{...h.fields(),workHistory:"背景取得した経歴"}});assert.equal(aiProps().inputRevision,0);
 h.change("-workHistory","入力した経歴");assert.equal(aiProps().inputRevision,1);
 h.change("-attendanceConcerns","社内の稼働確認");h.change("-additionalNotes","内部補足");assert.equal(aiProps().inputRevision,1);
 aiProps().onNotesChange({memo:"面談用メモ",reflection:"面談者の振り返り"});assert.equal(aiProps().inputRevision,1);
 aiProps().onSaveAdvice("保存する準備案");assert.equal(aiProps().inputRevision,1);
 h.adoptAi("採用したAI紹介文");h.change("-introduction","手で修正した紹介文");assert.equal(aiProps().inputRevision,1);
 const checkbox=nodes(h.render()).find(node=>node.type==="input"&&node.props.type==="checkbox");checkbox.props.onChange();assert.equal(aiProps().inputRevision,2);h.unmount();
});

test("interview questions begin with PC and tools in reading and keyboard order at every entry point",()=>{
 const h=harness(),sections=nodes(h.render()).filter(node=>node.type==="fieldset");
 const legends=sections.map(section=>nodes(section).find(node=>node.type==="legend")?.props.children);
 assert.deepEqual(legends,["PC・使用ツール","基本情報・稼働条件","営業経験・実績","面談可能日","その他・補足"]);
 const inputs=nodes(sections[0]).filter(node=>["input","select","textarea"].includes(node.type));
 assert.ok(inputs[0].props.id.endsWith("-pc"));
 assert.ok(inputs[1].props.id.endsWith("-networkEnvironment"));
 assert.ok(inputs[2].props.id.endsWith("-pcSkills"));
 assert.ok(inputs.slice(3).every(node=>node.props.type==="checkbox"));
 const allInputs=nodes(h.render()).filter(node=>["input","select","textarea"].includes(node.type));
 assert.ok(allInputs.findIndex(node=>node.props.id?.endsWith("-pc"))<allInputs.findIndex(node=>node.props.id?.endsWith("-age")));
 assert.equal(inputs.some(node=>node.props.tabIndex>0),false);
 h.unmount();
});


test("the immediate shared draft formats explicit clock ranges without rewriting the original intake",()=>{
 const h=harness({fields:{...intake.blankInterviewFields(),timeWindow:"900-1800",workHistory:"法人営業を2年間担当。"}});
 h.advance(250);h.render();assert.match(h.introduction(),/9:00〜18:00/);assert.equal(h.fields().timeWindow,"900-1800");h.unmount();
});
