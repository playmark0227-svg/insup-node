import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual nested renderer without mounting the unrelated live workspace.
const workspace = ts.createSourceFile("node-workspace.tsx", fs.readFileSync(new URL("../components/node-workspace.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let declaration;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(workspace) === "podium") declaration = node.getText(workspace);
  ts.forEachChild(node, visit);
}
visit(workspace);
assert.ok(declaration, "the workspace podium renderer exists");
const source = ts.transpileModule(`const ranking = []; export const ${declaration};`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {}, jsx = (type, props, key) => ({ type, props: props || {}, key });
vm.runInNewContext(source, { exports, module: { exports }, Trophy: "Trophy", Avatar: "Avatar",
  require: name => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
});
const nodes = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === "boolean" ? "" : typeof tree === "string" || typeof tree === "number" ? String(tree)
  : Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children);
const player = (id, count, rank) => ({ id, name: `架空担当${id}`, team: "架空チーム", count, rank });
const cards = list => nodes(exports.podium(list)).filter(node => String(node.props.className || "").split(" ").includes("podium-player"));

test("zero results are never awarded a podium place even when another player has results", () => {
  assert.equal(cards([]).length, 0);
  assert.equal(cards([player("A", 0, 1), player("B", 0, 1)]).length, 0);
  const result = cards([player("A", 5, 1), player("B", 2, 2), player("C", 0, 3)]);
  assert.deepEqual(result.map(card => card.key), ["B", "A"]);
  assert.ok(result.every(card => !text(card).includes("架空担当C")));
});

test("a sole positive player retains the first-place layout and trophy after filtering", () => {
  for (const ranking of [[player("A", 1, 1)], [player("A", 1, 1), player("B", 0, 2), player("C", 0, 2)]]) {
    const result = cards(ranking); assert.equal(result.length, 1);
    assert.equal(result[0].props.className, "podium-player podium-first");
    assert.equal(nodes(result[0]).filter(node => node.type === "Trophy").length, 1);
  }
});

test("explicit podium positions preserve the server-derived shared ranks", () => {
  const result = cards([player("A", 4, 1), player("B", 4, 1), player("C", 2, 3)]);
  assert.deepEqual(result.map(card => card.props.className), ["podium-player podium-second", "podium-player podium-first", "podium-player podium-third"]);
  assert.deepEqual(result.map(card => text(nodes(card).find(node => node.props.className === "place-badge"))), ["1", "1", "3"]);
});
