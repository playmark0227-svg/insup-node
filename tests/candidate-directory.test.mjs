import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as management from "../lib/management-data.ts";
import * as performance from "../lib/performance-metrics.ts";
import * as candidateGroups from "../lib/candidate-groups.ts";
import { businessToday } from "../lib/sheets-client.ts";

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
    assert.equal(h.actions(h.surface(mode), "詳細・修正").length, 0);
    h.click(toggle);
    assert.equal(h.toggles(mode)[0].props["aria-expanded"], true);
    const history = h.history(mode, toggle.props["aria-controls"]);
    assert.ok(history, "expanded content is connected to its trigger");
    assert.match(text(history), /架空会社A/);
    assert.match(text(history), /架空会社B/);
    assert.match(text(history), /提案候補/);
    assert.match(text(history), /面談実施/);
    assert.equal(h.actions(history, "詳細・修正").length, 2);
    h.click(h.toggles(mode)[0]);
    assert.equal(h.toggles(mode)[0].props["aria-expanded"], false);
    assert.equal(h.actions(h.surface(mode), "詳細・修正").length, 0);
    assert.deepEqual(h.calls, { edit: [], basic: [], delete: [] });
  });

  test(`${mode}: every history action routes its exact record ID instead of editing the first company`, () => {
    const h = harness();
    const toggle = h.toggles(mode)[0]; h.click(toggle);
    const history = h.history(mode, toggle.props["aria-controls"]);
    for (const button of h.actions(history, "詳細・修正")) h.click(button);
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
  for (const button of h.actions(expanded, "詳細・修正")) h.click(button);
  assert.deepEqual(h.calls.edit, ["other-person"]);
  assert.equal(h.actions(h.surface("desktop"), "詳細・修正").length, 1);
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
