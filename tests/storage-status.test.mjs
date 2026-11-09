import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync(new URL("../components/storage-status.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exports = {}, jsx = (type, props) => ({ type, props: props || {} });
vm.runInNewContext(source, { exports, module: { exports }, require: name => name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : new Proxy({}, { get: (_, key) => key }) });
const nodes = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === "boolean" ? "" : typeof tree === "string" || typeof tree === "number" ? String(tree) : Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children);
const props = { backend: { kind: "firestore", projectId: "fictional-insup-node", migratedAt: "2026-11-06T04:00:00.000Z" }, admin: false, cached: false, busy: false, error: "", writesEnabled: true, syncedAt: "2026-11-06T04:00:00.000Z", onRefresh: async () => {} };

test("Firebase connection UI cannot redirect users to a legacy endpoint editor or spreadsheet", () => {
  const tree = exports.StorageStatus(props), all = nodes(tree), body = text(tree);
  assert.match(body, /データの保存・同期/);
  assert.doesNotMatch(body, /Firebase|Firestore|プロジェクト|移行/);
  assert.match(body, /クラウドに保存・同期/);
  assert.equal(all.some(n => ["input", "textarea", "form", "a"].includes(n.type)), false);
  assert.equal(body.includes(props.backend.projectId), false);
  assert.equal(body.includes("スプレッドシート"), false);
  const admin = text(exports.StorageStatus({ ...props, admin: true }));
  assert.doesNotMatch(admin, /fictional-insup-node|スプレッドシート|Firebase|Firestore|移行/);
});

test("a cached or read-only connection cannot appear as a current writable Firebase connection", () => {
  const cached = text(exports.StorageStatus({ ...props, cached: true }));
  assert.match(cached, /前回の集計を表示・接続確認中/);
  assert.match(cached, /最新の接続確認が完了すると/);
  assert.equal(cached.includes("クラウドに保存・同期"), false);
  const readonly = text(exports.StorageStatus({ ...props, writesEnabled: false }));
  assert.match(readonly, /クラウドデータを閲覧中/);
  assert.equal(readonly.includes("クラウドに保存・同期"), false);
});

test("connection refresh uses the existing authenticated refresh and surfaces its supplied error", async () => {
  let calls = 0;
  const tree = exports.StorageStatus({ ...props, error: "接続を確認してください", onRefresh: async () => { calls++; throw new Error("known"); } });
  const button = nodes(tree).find(n => n.type === "button");
  button.props.onClick();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls, 1);
  assert.ok(nodes(tree).some(n => n.props?.role === "alert" && text(n) === "接続を確認してください"));
  assert.equal(nodes(exports.StorageStatus({ ...props, busy: true })).find(n => n.type === "button").props.disabled, true);
});
