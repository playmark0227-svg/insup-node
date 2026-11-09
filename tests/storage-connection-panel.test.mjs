import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync(new URL("../components/sheet-connection-panel.tsx", import.meta.url), "utf8").replaceAll("import.meta.env.BASE_URL", '"./"'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exports = {}, jsx = (type, props) => ({ type, props: props || {} });
vm.runInNewContext(source, { exports, module: { exports }, require: name => name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "react" ? { useState: initial => [initial, () => {}] } : name.includes("management-data") ? { matchingFields: ["架空の管理項目"] } : name.includes("sheet-notices") ? { sheetNotices: () => ({ alerts: [], unassignedRows: 0 }) } : new Proxy({}, { get: (_, key) => key }) });
const nodes = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === "boolean" ? "" : typeof tree === "string" || typeof tree === "number" ? String(tree) : Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children);
const destination = { title: "fictional-private-book-title", matchingUrl: "https://docs.google.com/spreadsheets/d/fictional-private-book/edit?gid=1", kpiUrl: "https://docs.google.com/spreadsheets/d/fictional-private-book/edit?gid=2" };
const props = { endpoint: "https://script.google.com/macros/s/fictional-server/exec", mode: "live", busy: false, error: "", connected: false, warnings: [], destination, onConnect: async () => {}, onRefresh: async () => {} };

test("before authentication the connection server is editable without claiming a verified data provider", () => {
  const tree = exports.SheetConnectionPanel(props), body = text(tree), all = nodes(tree);
  assert.match(body, /データ連携/);
  assert.match(body, /接続サーバーURL/);
  assert.ok(all.some(n => n.type === "Input" && n.props.value === props.endpoint));
  assert.equal(body.includes("スプレッドシート"), false);
  assert.equal(body.includes("Firebase"), false);
  assert.equal(body.includes("fictional-private-book-title"), false);
  assert.equal(all.some(n => n.type === "a"), false);
});

test("legacy destination references and migration instructions require an authenticated administrator", () => {
  for (const options of [{ connected: false, admin: true }, { connected: true, admin: false }]) {
    const tree = exports.SheetConnectionPanel({ ...props, ...options });
    assert.equal(nodes(tree).some(n => n.type === "a"), false);
    assert.equal(text(tree).includes("未同期の入力"), false);
  }
  const admin = exports.SheetConnectionPanel({ ...props, connected: true, admin: true });
  const urls = nodes(admin).filter(n => n.type === "a").map(n => n.props.href);
  assert.deepEqual(Array.from(urls), ["./apps-script/SETUP.md", "./apps-script/Code.gs", destination.matchingUrl, destination.kpiUrl]);
  assert.match(text(admin), /未同期の入力と保存結果を先に確認/);
  assert.match(text(admin), /保存IDを保って確認/);
});
