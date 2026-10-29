import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as nodeData from "../lib/node-data.ts";
import * as meetingData from "../lib/meeting-data.ts";
import { performanceMetrics } from "../lib/performance-metrics.ts";

const source = ts.transpileModule(fs.readFileSync(new URL("../components/meeting-dashboard.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const text = node => node == null || typeof node === "boolean" ? "" : typeof node === "string" || typeof node === "number" ? String(node)
  : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const hasClass = (node, name) => String(node.props?.className || "").split(" ").includes(name);

// Run the actual component and event handlers with a small hook harness. Counts,
// ranking and target calculation use the same production modules as the UI.
function harness(options = {}) {
  const players = options.players || [
    { id: "ND-001", name: "検証 一郎", color: "mint", team: "NODE", target: 20, bio: "" },
    { id: "ND-002", name: "検証 二郎", color: "blue", team: "NODE", target: 0, bio: "" },
  ];
  const counts = options.counts || {
    "2026-10": { "ND-001": { "候補者面談": 9, "提案": 24 }, "ND-002": { "提案": 3 } },
    "2026-09": { "ND-001": { "候補者面談": 10, "提案": 20 }, "ND-002": { "提案": 5 } },
  };
  const calls = { registered: [], corrected: [], players: 0, records: 0 };
  let cursor = 0;
  const slots = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] || (slots[index] = { current: initial }); },
  };
  const exports = {}, jsx = (type, props, key) => ({ type, props: props || {}, key });
  vm.runInNewContext(source, {
    exports, module: { exports }, Intl, Date,
    require: name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "fragment" }
      : name === "lucide-react" ? new Proxy({}, { get: (_, key) => `icon:${String(key)}` })
        : name === "@/lib/node-data" ? nodeData : name === "@/lib/performance-metrics" ? { performanceMetrics }
          : name === "@/lib/meeting-data" ? meetingData : name.endsWith(".css") ? {}
            : (() => { throw new Error(`Unexpected meeting import: ${name}`); })(),
  });
  let props = {
    players, period: "2026-10", periodLabel: "10月", live: true, syncedAt: "2026-10-30T03:00:00Z", busy: false,
    countAt(stage, id, period) {
      if (id !== null) return counts[period]?.[id]?.[stage] || 0;
      return Object.values(counts[period] || {}).reduce((sum, row) => sum + (row[stage] || 0), 0) + (options.extraTeamCounts?.[stage] || 0);
    },
    onRegister: (...args) => calls.registered.push(args), onCorrect: (...args) => calls.corrected.push(args),
    onManagePlayers: () => calls.players++, onOpenRecords: () => calls.records++, onRefresh() {}, ...options.props,
  };
  const expand = tree => {
    if (!tree || typeof tree !== "object") return tree;
    if (Array.isArray(tree)) return tree.map(expand);
    if (typeof tree.type === "function") return expand(tree.type(tree.props));
    return { ...tree, props: { ...tree.props, children: expand(tree.props.children) } };
  };
  function render(next = {}) { props = { ...props, ...next }; cursor = 0; return expand(exports.MeetingDashboard(props)); }
  const find = predicate => nodes(render()).find(predicate);
  const button = label => find(node => node.type === "button" && (node.props["aria-label"] || text(node)) === label);
  const click = label => { const match = button(label); assert.ok(match, `button exists: ${label}`); assert.ok(!match.props.disabled, `button enabled: ${label}`); match.props.onClick(); };
  const key = (value, options = {}) => {
    let prevented = false;
    render().props.onKeyDown({ key: value, target: { closest: () => options.editable ? {} : null }, preventDefault() { prevented = true; }, ...options });
    return prevented;
  };
  const byClass = name => nodes(render()).filter(node => hasClass(node, name));
  render();
  return { render, button, click, key, byClass, find, calls, text: () => text(render()) };
}

test("monthly comparison exposes official counts, signed differences and current target meaning", () => {
  const h = harness();
  assert.equal(h.byClass("meeting-total").length, 6);
  assert.match(h.text(), /2026年10月/);
  assert.match(h.text(), /2026年9月との比較/);
  assert.match(h.text(), /同日までの比較ではありません/);
  const firstRow = nodes(h.render()).find(node => node.type === "tr" && node.key === "ND-001");
  assert.equal(nodes(firstRow).filter(node => hasClass(node, "meeting-count-cell")).length, 6);
  assert.match(text(firstRow), /前月差\s*-1\s*件/);
  assert.match(text(firstRow), /前月差\s*\+4\s*件/);
  assert.match(text(firstRow), /24 \/ 20件120%/);
  assert.match(text(firstRow), /目標達成 · 4件超過/);
  assert.match(h.text(), /目標未設定 1名/);
  assert.match(h.text(), /過去月を表示しても当時の目標への切り替えは行いません/);
  h.click("目標を確認"); assert.equal(h.calls.players, 1);
  assert.equal(h.find(node => node.props.role === "region").props.tabIndex, 0);
});

test("row presentation, previous/next and keyboard navigation preserve speaker and stop at boundaries", () => {
  const h = harness();
  h.click("検証 二郎の発表画面を開く");
  assert.match(text(h.byClass("meeting-speaker-kicker")[0]), /2 \/ 2/);
  assert.equal(h.button("次の人").props.disabled, true);
  assert.equal(h.key("ArrowRight"), true);
  assert.match(text(h.byClass("meeting-speaker-kicker")[0]), /2 \/ 2/);
  h.click("前の人");
  assert.match(text(h.byClass("meeting-speaker-kicker")[0]), /1 \/ 2/);
  assert.equal(h.button("前の人").props.disabled, true);
  assert.equal(h.key("ArrowRight", { editable: true }), false);
  assert.equal(h.key("ArrowRight", { ctrlKey: true }), false);
  assert.match(text(h.byClass("meeting-speaker-kicker")[0]), /1 \/ 2/);
  assert.equal(h.key("ArrowRight"), true);
  assert.match(text(h.byClass("meeting-speaker-kicker")[0]), /2 \/ 2/);
  h.click("全員の比較"); h.click("一人ずつ発表");
  assert.match(text(h.byClass("meeting-speaker-kicker")[0]), /2 \/ 2/);
  h.click("全員の比較に戻る");
  assert.equal(h.byClass("meeting-table").length, 1);
});

test("meeting display hides mutation controls and Escape restores them without changing counts", () => {
  const h = harness();
  assert.ok(h.button("検証 一郎の提案数を記録"));
  h.click("会議用表示");
  assert.equal(h.render().props.className.includes("is-presenting"), true);
  assert.equal(h.button("検証 一郎の提案数を記録"), undefined);
  assert.equal(h.button("検証 一郎の提案数を減らす・修正"), undefined);
  assert.match(h.text(), /会議用表示中 · Escで終了/);
  assert.equal(h.key("Escape"), true);
  assert.ok(h.button("検証 一郎の提案数を記録"));
  h.click("検証 一郎の提案数を記録");
  h.click("検証 一郎の提案数を減らす・修正");
  assert.deepEqual(h.calls.registered, [["ND-001", "提案"]]);
  assert.deepEqual(h.calls.corrected, [["ND-001", "提案"]]);
  assert.equal(h.button("検証 一郎のマッチ数を減らす・修正").props.disabled, true);
  h.render({ canRegister: false });
  assert.equal(h.button("検証 一郎の提案数を記録"), undefined);
});

test("presentation follows selected sorting and keeps selected speaker through roster changes", () => {
  const h = harness({ counts: { "2026-10": { "ND-001": { "提案": 3 }, "ND-002": { "提案": 24 } } } });
  h.find(node => node.type === "select").props.onChange({ target: { value: "提案" } });
  h.click("一人ずつ発表");
  assert.match(text(h.byClass("meeting-speaker-heading")[0]), /検証 二郎/);
  h.click("次の人");
  assert.match(text(h.byClass("meeting-speaker-heading")[0]), /検証 一郎/);
  h.render({ players: [{ id: "ND-002", name: "検証 二郎", color: "blue", team: "NODE", target: 20, bio: "" }] });
  assert.match(text(h.byClass("meeting-speaker-kicker")[0]), /1 \/ 1/);
  assert.equal(h.button("次の人").props.disabled, true);
  assert.equal(h.button("前の人").props.disabled, true);
});

test("missing targets remain unset in the table and presentation, including non-finite settings", () => {
  for (const target of [0, -1, NaN, Infinity]) {
    const h = harness({ players: [{ id: "ND-001", name: "検証 一郎", color: "mint", team: "NODE", target, bio: "" }] });
    assert.match(text(h.byClass("meeting-target-cell")[0]), /24 \/ —件目標未設定/);
    h.click("一人ずつ発表");
    assert.match(text(h.byClass("meeting-person-goal")[0]), /目標未設定/);
    assert.doesNotMatch(h.text(), /NaN|Infinity|0% 達成/);
    const progress = h.find(node => node.props["aria-label"] === "検証 一郎の月間提案目標達成率");
    assert.equal(progress.props["aria-valuenow"], undefined);
    assert.equal(progress.props["aria-valuetext"], "目標未設定");
  }
});

test("roster and period empty states provide the correct follow-up action", () => {
  const noPlayers = harness({ players: [], counts: {} });
  assert.match(noPlayers.text(), /比較するプレイヤーがまだいません/);
  assert.equal(noPlayers.button("CSV保存").props.disabled, true);
  assert.equal(noPlayers.button("一人ずつ発表").props.disabled, true);
  noPlayers.click("プレイヤー管理を開く"); assert.equal(noPlayers.calls.players, 1);
  const noCounts = harness({ counts: {} });
  assert.match(noCounts.text(), /2026年10月の6項目はすべて0件です/);
  assert.match(noCounts.text(), /各工程の日付を確認/);
  noCounts.click("人材・進捗を確認"); assert.equal(noCounts.calls.records, 1);
});

test("different team and roster totals identify their scope without silently changing goal math", () => {
  const h = harness({ extraTeamCounts: { "提案": 4 } });
  assert.match(text(h.byClass("meeting-scope-note")[0]), /チーム合計と名簿の担当者別合計に差があります/);
  assert.match(text(h.byClass("meeting-goal-amount")[0]), /27\/ 20 件/);
  assert.equal(text(h.byClass("meeting-goal-percent")[0]), "135%");
  h.click("担当者の対応を確認"); assert.equal(h.calls.players, 1);
});

test("daily and all-time periods do not display monthly targets or differences", () => {
  for (const period of ["2026-10-30", "all"]) {
    const h = harness({ props: { period, periodLabel: period === "all" ? "累計" : "今日" } });
    assert.equal(h.byClass("meeting-difference").length, 0);
    assert.equal(h.byClass("meeting-target-cell").length, 0);
    assert.equal(h.byClass("meeting-team-goal").length, 0);
    h.click("一人ずつ発表");
    assert.equal(h.byClass("meeting-person-goal").length, 0);
    assert.equal(h.byClass("meeting-difference").length, 0);
    assert.match(h.text(), period === "all" ? /全期間の累計/ : /2026年10月30日/);
  }
});
