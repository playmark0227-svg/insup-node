import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as management from "../lib/management-data.ts";
import * as performance from "../lib/performance-metrics.ts";
import * as candidateGroups from "../lib/candidate-groups.ts";
import { businessToday } from "../lib/sheets-client.ts";
import { linkedCandidateProfile } from "../lib/candidate-intake.ts";

const source = ts.transpileModule(fs.readFileSync(new URL("../components/candidate-directory.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const nodes = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === "boolean" ? "" : typeof tree === "string" || typeof tree === "number" ? String(tree)
  : Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children);
const hasClass = (node, name) => String(node.props?.className || "").split(/\s+/).includes(name);

function record(id, company, row, owner = "ND-001", name = "架空候補者") {
  const values = Array(26).fill("");
  values[0] = "2026-10-01";
  values[1] = company;
  values[2] = name;
  values[3] = "検証担当";
  values[5] = "アポインター";
  values[6] = company === "架空会社A" ? "提案候補" : "面談実施（合否待ち）";
  return { recordId: id, rowVersion: `version-${id}`, row, playerId: owner, candidateName: name, source: "", values, formulaColumns: [] };
}

function harness(overrides = {}) {
  const contexts = new Map();
  let active, cursor = 0, idCount = 0;
  const calls = { edit: [], basic: [], delete: [] };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in active.slots)) active.slots[index] = { value: typeof initial === "function" ? initial() : initial };
      const slot = active.slots[index];
      return [slot.value, value => { slot.value = typeof value === "function" ? value(slot.value) : value; }];
    },
    useId() { const index = cursor++; return active.slots[index] || (active.slots[index] = `candidate-directory-${++idCount}`); },
    useRef(initial) { const index = cursor++; return active.slots[index] || (active.slots[index] = { current: initial }); },
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
  };
  const exports = {}, jsx = (type, props, key) => ({ type, props: props || {}, key });
  vm.runInNewContext(source, {
    exports, module: { exports },
    require: name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "Fragment" }
      : name === "lucide-react" ? new Proxy({}, { get: (_, key) => key })
        : name.includes("management-data") ? management
          : name.includes("performance-metrics") ? performance
            : name.includes("candidate-groups") ? candidateGroups
              : name.includes("sheets-client") ? { businessToday }
                : name.endsWith(".css") ? {}
                  : (() => { throw new Error(`Unexpected candidate directory import: ${name}`); })(),
  });
  let props = {
    groups: candidateGroups.groupCandidates([record("proposal-a", "架空会社A", 3), record("proposal-b", "架空会社B", 2)], "registration-desc"),
    players: [{ id: "ND-001", name: "検証担当", team: "検証", color: "blue", target: 20, bio: "" }],
    busy: false, intakeEnabled: true, canDelete: true,
    onEdit: id => calls.edit.push(id), onBasic: id => calls.basic.push(id), onDelete: id => calls.delete.push(id), ...overrides,
  };
  function invoke(component, input, key) {
    const previous = active, previousCursor = cursor;
    active = contexts.get(key) || { slots: [] };
    contexts.set(key, active);
    cursor = 0;
    const output = component(input);
    active = previous; cursor = previousCursor;
    return output;
  }
  function resolve(tree, path = "root") {
    if (Array.isArray(tree)) return tree.map((child, index) => resolve(child, `${path}/${child?.key ?? index}`));
    if (!tree || typeof tree !== "object") return tree;
    if (typeof tree.type === "function") return resolve(invoke(tree.type, tree.props, `${path}:${tree.type.name}`), path);
    return { ...tree, props: { ...tree.props, children: resolve(tree.props?.children, `${path}/children`) } };
  }
  function render(next = {}) { props = { ...props, ...next }; return resolve(invoke(exports.CandidateDirectory, props, "directory")); }
  const surface = mode => {
    const found = nodes(render()).find(node => hasClass(node, `candidate-${mode}-list`));
    assert.ok(found, `${mode} directory exists`); return found;
  };
  const toggles = mode => nodes(surface(mode)).filter(node => node.type === "button" && typeof node.props["aria-expanded"] === "boolean");
  const click = node => { assert.ok(node, "button exists"); assert.ok(!node.props.disabled, "button is enabled"); node.props.onClick(); };
  const history = (mode, id) => nodes(surface(mode)).find(node => node.props.id === id);
  const actions = (tree, label) => nodes(tree).filter(node => node.type === "button" && text(node).includes(label));
  return { render, props: () => props, calls, surface, toggles, click, history, actions };
}

for (const mode of ["desktop", "mobile"]) {
  test(`${mode}: one candidate name is shown initially and expanding retains both proposal histories`, () => {
    const h = harness();
    assert.equal(text(h.surface(mode)).split("架空候補者").length - 1, 1);
    const [toggle] = h.toggles(mode);
    assert.equal(h.toggles(mode).length, 1);
    assert.equal(toggle.props["aria-expanded"], false);
    assert.match(text(toggle), /提案・履歴\s*2件/);
    assert.ok(toggle.props["aria-controls"]);
    assert.equal(h.actions(h.surface(mode), "基本情報").length, 0, "different profiles cannot be edited through an arbitrary first record");
    assert.equal(h.actions(h.surface(mode), "進捗・実績を編集").length, 0);
    h.click(toggle);
    assert.equal(h.toggles(mode)[0].props["aria-expanded"], true);
    const history = h.history(mode, toggle.props["aria-controls"]);
    assert.ok(history, "expanded content is connected to its trigger");
    assert.match(text(history), /架空会社A/);
    assert.match(text(history), /架空会社B/);
    assert.match(text(history), /提案候補/);
    assert.match(text(history), /面談実施/);
    assert.equal(h.actions(history, "進捗・実績を編集").length, 2);
    h.click(h.toggles(mode)[0]);
    assert.equal(h.toggles(mode)[0].props["aria-expanded"], false);
    assert.equal(h.actions(h.surface(mode), "進捗・実績を編集").length, 0);
    assert.deepEqual(h.calls, { edit: [], basic: [], delete: [] });
  });

  test(`${mode}: every history action routes its exact record ID instead of editing the first company`, () => {
    const h = harness();
    const toggle = h.toggles(mode)[0]; h.click(toggle);
    const history = h.history(mode, toggle.props["aria-controls"]);
    for (const button of h.actions(history, "進捗・実績を編集")) h.click(button);
    for (const button of h.actions(history, "基本情報")) h.click(button);
    for (const button of h.actions(history, "削除")) h.click(button);
    assert.deepEqual(h.calls.edit, ["proposal-a", "proposal-b"]);
    assert.deepEqual(h.calls.basic, ["proposal-a", "proposal-b"]);
    assert.deepEqual(h.calls.delete, ["proposal-a", "proposal-b"]);
  });
}

test("desktop and mobile expansion controls have unique content IDs", () => {
  const h = harness();
  const desktop = h.toggles("desktop")[0], mobile = h.toggles("mobile")[0];
  assert.notEqual(desktop.props["aria-controls"], mobile.props["aria-controls"]);
});

test("desktop and mobile AI actions precede history and route the exact candidate group key", () => {
  const called = [], groups = candidateGroups.groupCandidates([
    record("first-person", "架空会社A", 2), record("other-person", "架空会社B", 3, "ND-002", "別の架空候補者"),
  ], "registration-desc");
  const h = harness({ groups, onChat: key => called.push(key) });
  for (const mode of ["desktop", "mobile"]) {
    const buttons = nodes(h.surface(mode)).filter(node => node.type === "button" &&
      (text(node) === "AIに相談" || typeof node.props["aria-expanded"] === "boolean"));
    assert.equal(buttons.length, groups.length * 2);
    groups.forEach((group, index) => {
      const ai = buttons[index * 2], history = buttons[index * 2 + 1];
      assert.equal(text(ai), "AIに相談", `${mode}: AI precedes its own history action`);
      assert.equal(history.props["aria-expanded"], false);
      assert.equal(ai.props["aria-label"], `${group.name}についてAIに相談`);
      h.click(ai);
      assert.equal(called.at(-1), group.key, "the display group key is used rather than name or first record ID");
    });
  }
  assert.deepEqual(called, [...groups.map(group => group.key), ...groups.map(group => group.key)]);
});

test("a refreshed or reordered directory keeps expansion on the candidate key and preserves exact record actions", () => {
  const first = record("first-person", "架空会社A", 2);
  const second = record("other-person", "架空会社B", 3, "ND-001", "別の架空候補者");
  const groups = candidateGroups.groupCandidates([first, second], "registration-desc");
  const h = harness({ groups });
  h.click(h.toggles("desktop")[0]);
  h.render({ groups: [...groups].reverse() });
  const toggles = h.toggles("desktop");
  assert.deepEqual(toggles.map(button => button.props["aria-expanded"]), [false, true]);
  const expanded = h.history("desktop", toggles[1].props["aria-controls"]);
  for (const button of h.actions(expanded, "進捗・実績を編集")) h.click(button);
  assert.deepEqual(h.calls.edit, ["other-person"]);
  assert.equal(h.actions(h.surface("desktop"), "進捗・実績を編集").length, 1);
});

test("a single-record candidate exposes a safe parent basic-information action", () => {
  const only = record("only-record", "架空会社A", 2);
  const h = harness({ groups: candidateGroups.groupCandidates([only], "registration-desc") });
  for (const mode of ["desktop", "mobile"]) {
    const buttons = h.actions(h.surface(mode), "基本情報");
    assert.equal(buttons.length, 1);
    h.click(buttons[0]);
  }
  assert.deepEqual(h.calls.basic, ["only-record", "only-record"]);
});

test("hidden features and busy state keep history actions unavailable", () => {
  const hidden = harness({ intakeEnabled: false, canDelete: false });
  hidden.click(hidden.toggles("desktop")[0]);
  assert.equal(hidden.actions(hidden.surface("desktop"), "基本情報").length, 0);
  assert.equal(hidden.actions(hidden.surface("desktop"), "削除").length, 0);
  const busy = harness(); busy.click(busy.toggles("desktop")[0]); busy.render({ busy: true });
  const disabled = busy.actions(busy.surface("desktop"), "基本情報").concat(busy.actions(busy.surface("desktop"), "削除"));
  assert.equal(disabled.length, 4);
  assert.ok(disabled.every(button => button.props.disabled));
  assert.deepEqual(busy.calls, { edit: [], basic: [], delete: [] });
});

test("past unfinished appointments stay visible with a warning, while completed or closed appointments are omitted", () => {
  for (const [scheduledColumn, completedColumn, label] of [[10, 17, "C面談"], [23, 24, "稼働開始予定"]]) {
    const completed = record("completed", "実施済みの架空会社", 2);
    completed.values[scheduledColumn - 1] = "2000-01-01";
    completed.values[completedColumn - 1] = "2000-01-01";
    const closed = record("closed", "辞退した架空会社", 3);
    closed.values[scheduledColumn - 1] = "2000-01-02";
    closed.values[6] = "辞退（本人希望）";
    const pending = record("pending", "確認が必要な架空会社", 4);
    pending.values[scheduledColumn - 1] = "2000-01-03";
    const h = harness({ groups: candidateGroups.groupCandidates([completed, closed, pending], "registration-desc") });
    for (const mode of ["desktop", "mobile"]) {
      const summary = text(h.surface(mode));
      assert.match(summary, /2000-01-03/, `${mode}: overdue ${label} remains visible`);
      assert.match(summary, /予定日経過・要確認/, `${mode}: overdue ${label} needs confirmation`);
      assert.ok(summary.includes(label), `${mode}: the appointment type is identified`);
      assert.doesNotMatch(summary, /2000-01-01|2000-01-02/, `${mode}: completed or closed appointments cannot displace the pending appointment`);
    }
    h.render({ groups: candidateGroups.groupCandidates([completed, closed], "registration-desc") });
    for (const mode of ["desktop", "mobile"]) {
      const summary = text(h.surface(mode));
      assert.doesNotMatch(summary, /2000-01-01|2000-01-02|予定日経過・要確認/);
      if (mode === "desktop") assert.match(summary, /予定なし/);
      else assert.doesNotMatch(summary, /次の予定：/);
    }
  }
});

test("the next confirmation opens the company with the pending appointment, even when it is not the first record", () => {
  const finished = record("finished-company", "架空会社A", 3);
  finished.values[6] = "辞退（本人希望）";
  const pending = record("pending-company", "架空会社B", 2);
  pending.values[6] = "面談確定(面談実施待ち）";
  pending.values[9] = "2000-01-03";
  const h = harness({ groups: candidateGroups.groupCandidates([finished, pending], "registration-desc") });
  for (const mode of ["desktop", "mobile"]) {
    const next = nodes(h.surface(mode)).find(node => node.type === "button" && hasClass(node, "candidate-follow-up"));
    assert.match(text(next), /C面談の実施状況を確認/);
    assert.match(next.props["aria-label"], /架空会社B/);
    h.click(next);
    assert.equal(h.calls.edit.at(-1), "pending-company");
  }
});

test("a recorded status does not invent a missing actual date, and ongoing and closed records get different confirmations", () => {
  const cases = [
    ["面談実施（合否待ち）", "C面談の実施日を確認"],
    ["合格（シフト入力待ち）", "合格日を確認"],
    ["稼働開始", "稼働開始日を確認"],
    ["辞退（本人希望）", "終了した提案の履歴を確認"],
    ["案件枠埋まり", "終了した提案の履歴を確認"],
  ];
  for (const [status, expected] of cases) {
    const item = record("status-only", "架空会社", 2); item.values[6] = status;
    const h = harness({ groups: candidateGroups.groupCandidates([item], "registration-desc") });
    for (const mode of ["desktop", "mobile"]) {
      const next = nodes(h.surface(mode)).find(node => node.type === "button" && hasClass(node, "candidate-follow-up"));
      assert.equal(text(next), expected);
      if (/辞退|枠埋まり/.test(status)) assert.ok(hasClass(next, "is-complete"));
      h.click(next); assert.equal(h.calls.edit.at(-1), "status-only");
    }
  }
});

test("all edit actions including direct confirmations are disabled while saving", () => {
  const h = harness(); h.click(h.toggles("desktop")[0]); h.render({ busy: true });
  const edits = nodes(h.surface("desktop")).filter(node => node.type === "button" &&
    (hasClass(node, "candidate-follow-up") || text(node).includes("進捗・実績を編集")));
  assert.equal(edits.length, 3);
  assert.ok(edits.every(node => node.props.disabled));
});

const managerSource = ts.transpileModule(fs.readFileSync(new URL("../components/candidate-manager.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText + "\nexports.RecordEditor = RecordEditor; exports.CreateCandidate = CreateCandidate; exports.BasicInfoDialog = BasicInfoDialog;";

const unsavedSource = ts.transpileModule(fs.readFileSync(new URL("../components/unsaved-work.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function managerHarness(component, overrides = {}) {
  let cursor = 0, closed = 0, consumed = 0;
  const slots = [], effects = [], calls = [], listeners = new Set();
  const react = {
    useState(initial) { const i = cursor++; const slot = slots[i] ||= { value: typeof initial === "function" ? initial() : initial }; return [slot.value, value => { slot.value = typeof value === "function" ? value(slot.value) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useId() { const i = cursor++; return slots[i] ||= `candidate-manager-${i}`; },
    useEffect(fn, deps) { const i = cursor++, previous = slots[i]; if (!previous || !deps || deps.some((value, index) => !Object.is(value, previous[index]))) { slots[i] = deps; effects.push(() => { previous?.cleanup?.(); deps.cleanup = fn(); }); } },
  };
  const exports = {}, jsx = (type, props, key) => ({ type, props: props || {}, key });
  const unsaved = {};
  vm.runInNewContext(unsavedSource, { exports: unsaved, module: { exports: unsaved }, window: { addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }, require: name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : {} });
  vm.runInNewContext(managerSource, {
    exports, module: { exports }, Error,
    require: name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx }
      : name.includes("unsaved-work") ? unsaved
        : name.includes("management-data") ? management
        : name.includes("performance-metrics") ? performance
          : name.includes("sheets-client") ? { businessToday }
            : name.includes("save-correction") ? { mutationDateErrors: () => ({}) }
              : name.includes("candidate-groups") ? candidateGroups
                : name.includes("candidate-intake") && !name.includes("components") ? { linkedCandidateProfile,blankInterviewFields: () => ({ workHistory: "" }) }
                  : name.includes("node-data") ? { statuses: ["提案候補"], positions: ["アポインター", "FS"] }
                    : new Proxy({}, { get: (_, key) => key }),
  });
  const item = record("current-record", "架空会社", 2);
  const props = {
    record: item, records: [item], players: [{ id: "ND-001", name: "検証担当", sheetNames: ["検証担当"] }],
    admin: true, disabled: false, busy: false, live: false, canWrite: true,
    clients: [], knownNames: [], onClose: () => closed++, onExisting: id => calls.push(["existing", id]),
    onCreateRequestHandled: () => consumed++, onSave: async () => ({}),
    save: { busy: false, uncertain: false, error: "", save: async (...args) => { calls.push(args); return true; } },
    ...overrides,
  };
  const render = (next = {}) => { Object.assign(props, next); cursor = 0; const tree = exports[component](props); while (effects.length) effects.shift()(); return tree; };
  const button = label => nodes(render()).find(node => node.type === "button" && text(node) === label);
  const click = label => { const found = button(label); assert.ok(found, label); assert.ok(!found.props.disabled, `${label} is enabled`); found.props.onClick(); };
  const input = label => nodes(render()).find(node => node.type === "input" && node.props["aria-label"] === label);
  const change = (label, value) => { const found = input(label); assert.ok(found, label); found.props.onChange({ target: { value } }); };
  return { render, props, button, click, input, change, calls, listenerCount: () => listeners.size, unload() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; listeners.forEach(listener => listener(event)); return event; }, closed: () => closed, consumed: () => consumed };
}

test("new candidates choose only active players and a later deactivation cannot submit the stale owner",async()=>{
 const stopped={id:'ND-000',name:'停止した担当',active:false,sheetNames:['停止した担当']},active={id:'ND-001',name:'有効な担当',sheetNames:['有効な担当']};
 const h=managerHarness('CreateCandidate',{players:[stopped,active]});
 const owner=()=>nodes(h.render()).find(node=>node.type==='select'&&node.props.id.endsWith('-owner'));
 assert.equal(owner().props.value,active.id);assert.deepEqual(nodes(owner()).filter(node=>node.type==='option').map(node=>node.props.value),[active.id]);
 const name=nodes(h.render()).find(node=>node.type==='input'&&node.props.id?.endsWith('-name'));name.props.onChange({target:{value:'合成人物'}});
 h.render({players:[stopped,{...active,active:false}]});assert.equal(h.button('候補者を登録').props.disabled,true);
 await nodes(h.render()).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});assert.equal(h.calls.length,0);
 assert.match(text(h.render()),/有効な担当者がいません/);
 h.render({players:[stopped,active]});await nodes(h.render()).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(h.calls.length,1);assert.equal(h.calls[0][1].playerId,active.id);
});

test("inactive current owners remain visible while administrators can transfer only to active owners",async()=>{
 const stopped={id:'ND-001',name:'停止した担当',active:false,sheetNames:['停止した担当']},active={id:'ND-002',name:'有効な担当',sheetNames:['有効な担当']};
 const item=record('inactive-owned-record','合成会社',2);item.values[3]=stopped.sheetNames[0];
 const h=managerHarness('RecordEditor',{record:item,players:[stopped,active]});
 const owner=()=>nodes(h.render()).find(node=>node.type==='select'&&node.props['aria-label']===management.matchingFields[3]);
 const options=nodes(owner()).filter(node=>node.type==='option');
 assert.equal(owner().props.value,stopped.sheetNames[0]);assert.equal(options.find(node=>text(node).includes(stopped.name)).props.disabled,true);
 assert.match(text(owner()),/利用停止中・現在の担当/);assert.equal(options.find(node=>text(node)===active.name).props.disabled,false);
 owner().props.onChange({target:{value:active.name}});await nodes(h.render()).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(h.calls.length,1);assert.equal(h.calls[0][1].changes[4],active.name);
 const readonly=managerHarness('RecordEditor',{record:item,players:[stopped,active],admin:false});
 assert.equal(nodes(readonly.render()).some(node=>node.type==='select'&&node.props['aria-label']===management.matchingFields[3]),false);
 assert.match(text(readonly.render()),/停止した担当（利用停止中）/);
});

test("a transfer target deactivated while editing blocks the update without losing the draft",async()=>{
 const first={id:'ND-001',name:'元の担当',sheetNames:['元の担当']},second={id:'ND-002',name:'移管先',sheetNames:['移管先']};
 const h=managerHarness('RecordEditor',{players:[first,second]});
 const owner=()=>nodes(h.render()).find(node=>node.type==='select'&&node.props['aria-label']===management.matchingFields[3]);
 owner().props.onChange({target:{value:second.name}});h.render({players:[first,{...second,active:false}]});
 await nodes(h.render()).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(h.calls.length,0);assert.equal(owner().props.value,second.name);assert.match(text(h.render()),/有効な担当者を選び直して/);
});

test("a deactivated draft owner does not block explicit same-operation confirmation after an uncertain result",async()=>{
 const active={id:'ND-001',name:'検証担当',sheetNames:['検証担当']};
 const h=managerHarness('CreateCandidate',{players:[active]});
 const name=nodes(h.render()).find(node=>node.type==='input'&&node.props.id?.endsWith('-name'));name.props.onChange({target:{value:'合成人物'}});
 h.props.save.uncertain=true;h.render({players:[{...active,active:false}]});
 assert.equal(h.button('同じ内容で再試行').props.disabled,false);
 await nodes(h.render()).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});assert.equal(h.calls.length,1);
 assert.equal(h.calls[0][1].playerId,active.id);
});

test("historical candidate filtering retains inactive owners",()=>{
 const h=managerHarness('CandidateManager',{players:[{id:'ND-001',name:'停止した担当',active:false}]});
 const filter=nodes(h.render()).find(node=>node.type==='select'&&node.props['aria-label']==='候補者の担当者');
 assert.ok(nodes(filter).some(node=>node.type==='option'&&node.props.value==='ND-001'));
});

test("basic information opens the authoritative owned profile instead of the first stale link",()=>{
 const item={...record('current-record','合成会社',2),profileId:'current'};
 const make=(profileId,playerId='ND-001')=>({profileId,playerId,recordIds:[item.recordId],version:profileId,updatedAt:'2026-10-30T00:00:00Z',fields:{workHistory:profileId},introduction:''});
 const stale=make('stale'),foreign=make('current','ND-002'),current=make('current');
 const h=managerHarness('CandidateManager',{records:[item],profiles:[stale,foreign,current],intakeEnabled:true});
 nodes(h.render()).find(node=>node.type==='CandidateDirectory').props.onBasic(item.recordId);
 const panel=nodes(h.render()).find(node=>typeof node.type==='function'&&node.type.name==='BasicInfoDialog');
 assert.ok(panel);assert.equal(panel.props.profile,current);
});

test("progress editing retains every business field and asks before discarding unsaved input", () => {
  const h = managerHarness("RecordEditor");
  const fields = nodes(h.render()).filter(node => node.type === "label" && /-field-\d+$/.test(node.props.htmlFor || ""));
  assert.equal(fields.length, management.matchingFields.length, "none of the 26 business inputs is removed by grouping");
  assert.equal(new Set(fields.map(node => node.props.htmlFor)).size, management.matchingFields.length);
  assert.match(text(h.render()), /実施済みの成果.*今後の予定・回答期日.*提案先・担当・進捗.*面談の調整・連絡メモ.*稼働後の状況/s);
  h.change("C面談予定日", "2099-01-01");
  assert.match(text(h.render()), /1項目の変更が未保存/);
  h.click("閉じる"); assert.equal(h.closed(), 0); assert.equal(h.calls.length, 0);
  assert.match(text(h.render()), /未保存の変更が1項目あります/);
  h.click("編集を続ける"); assert.equal(h.input("C面談予定日").props.value, "2099-01-01");
  h.click("閉じる"); h.click("変更を破棄して閉じる"); assert.equal(h.closed(), 1); assert.equal(h.calls.length, 0);
});

test("basic information retains the initial row and profile versions when saving a draft", async () => {
  const h = managerHarness("BasicInfoDialog", { profile: { version: "initial-profile-version", fields: { workHistory: "登録済みの経歴" }, introduction: "登録済み紹介文" } });
  const editor = nodes(h.render()).find(node => node.type === "InterviewIntakeEditor");
  assert.ok(editor); editor.props.onIntroductionChange("確認した紹介文");
  h.props.record = { ...h.props.record, rowVersion: "arrived-later" };
  h.props.profile = { ...h.props.profile, version: "arrived-later" };
  h.click("閉じる"); assert.equal(h.closed(), 0); assert.match(text(h.render()), /基本情報に未保存の変更/);
  h.click("編集を続ける");
  await nodes(h.render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][0], "saveCandidateProfile");
  assert.equal(h.calls[0][1].recordId, "current-record");
  assert.equal(h.calls[0][1].rowVersion, "version-current-record");
  assert.equal(h.calls[0][1].profileVersion, "initial-profile-version");
  assert.equal(h.calls[0][1].introduction, "確認した紹介文");
});

test("a home registration request waits for eligibility and is consumed only once", () => {
  const h = managerHarness("CandidateManager", { createRequested: true, busy: true });
  const openPanel = () => nodes(h.render()).find(node => typeof node.type === "function" && node.type.name === "CreateCandidate");
  assert.equal(openPanel(), undefined); assert.equal(h.consumed(), 0);
  h.render({ busy: false }); assert.ok(openPanel()); assert.equal(h.consumed(), 1);
  openPanel().props.onClose();
  h.render({ busy: true }); h.render({ busy: false });
  assert.equal(openPanel(), undefined); assert.equal(h.consumed(), 1, "unchanged request cannot reopen after closing");
  h.render({ createRequested: false }); h.render({ createRequested: true });
  assert.ok(openPanel()); assert.equal(h.consumed(), 2);
});

test("searching to zero offers a filter reset and preserves the existing directory", () => {
  const h = managerHarness("CandidateManager");
  h.change("候補者・会社・メモを検索", "一致しない架空検索語");
  assert.match(text(h.render()), /条件に合う候補者が見つかりません/);
  assert.doesNotMatch(text(h.render()), /最初の候補者を登録/);
  h.click("すべての候補者を表示");
  assert.equal(h.input("候補者・会社・メモを検索").props.value, "");
  const directory = nodes(h.render()).find(node => node.type === "CandidateDirectory");
  assert.equal(directory.props.groups.length, 1); assert.equal(directory.props.groups[0].records[0].recordId, "current-record");
});

test("candidate registration warns about an existing same-owner person and can open the exact existing proposal", () => {
  const h = managerHarness("CreateCandidate");
  const name = nodes(h.render()).find(node => node.type === "input" && node.props.required);
  name.props.onChange({ target: { value: "架空 候補者" } });
  assert.match(text(h.render()), /同じ担当者に同名の登録があります/);
  h.click("架空会社の記録を確認");
  assert.deepEqual(h.calls, [], "opening an existing proposal cannot discard registration input silently");
  h.click("入力を続ける");
  assert.equal(nodes(h.render()).find(node => node.type === "input" && node.props.required).props.value, "架空 候補者");
  h.click("架空会社の記録を確認"); h.click("入力を破棄して記録を確認");
  assert.deepEqual(h.calls, [["existing", "current-record"]]);
});

test("all candidate panels intercept native dismissal and retain drafts during saving or an uncertain result", () => {
  for (const component of ["RecordEditor", "BasicInfoDialog", "CreateCandidate"]) {
    const h = managerHarness(component);
    if (component === "RecordEditor") h.change("C面談予定日", "2099-01-01");
    else if (component === "BasicInfoDialog") nodes(h.render()).find(node => node.type === "InterviewIntakeEditor").props.onIntroductionChange("保存前の紹介文");
    else nodes(h.render()).find(node => node.type === "input" && node.props.required).props.onChange({ target: { value: "新しい架空候補者" } });
    const dismiss = () => nodes(h.render()).find(node => node.type === "Dialog").props.onOpenChange(false);
    dismiss(); assert.equal(h.closed(), 0, `${component}: X, outside click and Escape do not silently discard`);
    const continueLabel = component === "CreateCandidate" ? "入力を続ける" : "編集を続ける";
    assert.ok(h.button(continueLabel)); h.click(continueLabel);
    for (const state of ["busy", "uncertain"]) {
      h.props.save[state] = true; dismiss(); assert.equal(h.closed(), 0);
      assert.equal(h.button(continueLabel), undefined, `${component}: ${state} cannot initiate a discard`);
      h.props.save[state] = false;
    }
  }
});

test("a genuinely empty directory starts with registration rather than a filter-recovery message", () => {
  const h = managerHarness("CandidateManager", { records: [] });
  assert.match(text(h.render()), /候補者を登録して、提案の進捗を管理しましょう/);
  h.click("最初の候補者を登録");
  assert.ok(nodes(h.render()).some(node => typeof node.type === "function" && node.type.name === "CreateCandidate"));
});

test("an already open discard confirmation cannot close any panel after a save starts", () => {
  for (const component of ["RecordEditor", "BasicInfoDialog", "CreateCandidate"]) {
    const h = managerHarness(component);
    if (component === "RecordEditor") h.change("C面談予定日", "2099-01-01");
    else if (component === "BasicInfoDialog") nodes(h.render()).find(node => node.type === "InterviewIntakeEditor").props.onIntroductionChange("保存前の紹介文");
    else nodes(h.render()).find(node => node.type === "input" && node.props.required).props.onChange({ target: { value: "新しい架空候補者" } });
    h.click("閉じる");
    const label = component === "CreateCandidate" ? "入力を破棄して閉じる" : "変更を破棄して閉じる";
    for (const state of ["busy", "uncertain"]) {
      h.props.save[state] = true;
      const discard = h.button(label); assert.ok(discard.props.disabled, `${component}: ${state} locks the discard button`);
      discard.props.onClick(); assert.equal(h.closed(), 0);
      h.props.save[state] = false;
    }
  }
});


test("candidate panels warn about reload only while values actually differ from the original", () => {
  for (const component of ["RecordEditor", "BasicInfoDialog", "CreateCandidate"]) {
    const h = managerHarness(component); h.render(); assert.equal(h.listenerCount(), 0, component);
    const change = value => {
      if (component === "RecordEditor") h.change("C面談予定日", value);
      else if (component === "BasicInfoDialog") nodes(h.render()).find(node => node.type === "InterviewIntakeEditor").props.onIntroductionChange(value);
      else nodes(h.render()).find(node => node.type === "input" && node.props.required).props.onChange({ target: { value } });
    };
    change(component === "RecordEditor" ? "2099-01-01" : "保存前の入力"); h.render();
    assert.equal(h.listenerCount(), 1, component); assert.equal(h.unload().prevented, true, component);
    change(""); h.render(); assert.equal(h.listenerCount(), 0, component); assert.equal(h.unload().prevented, false, component);
    h.click("閉じる"); assert.equal(h.closed(), 1, component);
  }
});

test("switching candidate tabs keeps the client component mounted and reports its real draft state", () => {
  const dirty = [], h = managerHarness("CandidateManager", { intakeEnabled: true, onDirtyChange: value => dirty.push(value) });
  const master = () => nodes(h.render()).find(node => node.type === "ClientMaster");
  assert.ok(master(), "the hidden client editor owns drafts across tab switches");
  master().props.onDirtyChange(true); h.render(); assert.equal(dirty.at(-1), true);
  h.click("取引先の管理"); assert.ok(master());
  h.click("候補者 1"); assert.ok(master()); assert.equal(dirty.at(-1), true);
  master().props.onDirtyChange(false); h.render(); assert.equal(dirty.at(-1), false);
});


test("a progress draft keeps its original version across refresh and cannot lose other input through achievement cancellation", async () => {
  const h = managerHarness("RecordEditor");
  h.change("C面談予定日", "2099-01-01");
  h.render({ record: { ...h.props.record, rowVersion: "arrived-later-row" } });
  const cancellations = nodes(h.render()).filter(node => node.type === "button" && text(node).trim() === "取り消す");
  assert.ok(cancellations.length); assert.ok(cancellations.every(node => node.props.disabled));
  assert.match(text(h.render()), /入力中の変更を保存するか戻してから/);
  await nodes(h.render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls[0][0], "updateRecord"); assert.equal(h.calls[0][1].rowVersion, "version-current-record");
});
