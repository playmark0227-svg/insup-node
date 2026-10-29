import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as management from '../lib/management-data.ts';

const transpile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const unsavedSource = transpile('../components/unsaved-work.tsx');
const workbookSource = transpile('../components/workbook-manager.tsx');
const clientsSource = transpile('../components/client-selector.tsx');
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === 'boolean' ? '' : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);

function harness(source, component, props) {
  let cursor = 0;
  const slots = [], effects = [], listeners = new Set();
  const react = {
    useState(initial) { const i = cursor++; const slot = slots[i] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useId() { return `draft-${cursor++}`; },
    useMemo(fn) { return fn(); },
    useEffect(fn, deps) { const i = cursor++, previous = slots[i]; if (!previous || !deps || deps.some((value, index) => !Object.is(value, previous.deps[index]))) { slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const jsx = (type, input, key) => ({ type, props: input || {}, key }), unsaved = {};
  const dependencies = name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : name.includes('unsaved-work') ? unsaved : name.includes('management-data') ? management : name.includes('candidate-manager') ? { useManagementSave: () => props.save } : name.endsWith('.css') ? {} : new Proxy({}, { get: (_, key) => key });
  vm.runInNewContext(unsavedSource, { exports: unsaved, module: { exports: unsaved }, require: dependencies, window: { addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) } });
  const exports = {};
  vm.runInNewContext(source, { exports, module: { exports }, require: dependencies });
  const render = (next = {}) => { Object.assign(props, next); cursor = 0; const tree = exports[component](props); while (effects.length) effects.shift()(); return tree; };
  const button = label => nodes(render()).find(node => node.type === 'button' && text(node) === label);
  const click = label => { const node = button(label); assert.ok(node, label); assert.ok(!node.props.disabled, `${label} is enabled`); node.props.onClick(); };
  return { props, render, button, click, nodes: () => nodes(render()),
    change(label, value) { const node = nodes(render()).find(node => node.type === 'input' && node.props['aria-label'] === label); assert.ok(node, label); node.props.onChange({ target: { value } }); },
    unload() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; listeners.forEach(listener => listener(event)); return event.prevented; },
    listenerCount: () => listeners.size,
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
  };
}
const cell = (column, value, kind = 'text', readonly = false) => ({ column, value, display: String(value), kind, readonly, options: [], note: '' });
const row = { row: 3, version: 'original-row-version', cells: [cell(1, '元の氏名'), cell(2, 10, 'number'), cell(3, '式の結果', 'text', true)] };
function workbook(overrides = {}) {
  const saved = [], closed = [], save = { busy: false, uncertain: false, error: '' };
  const h = harness(workbookSource, 'WorkbookRowEditor', { title: '合成管理表', row, labels: ['氏名', '件数', '計算'], save, disabled: false, onClose: () => closed.push(true), onSave: async changes => saved.push(changes), ...overrides });
  return { ...h, saved, closed };
}
const prompt = h => h.nodes().find(node => typeof node.type === 'function' && node.type.name === 'UnsavedWorkPrompt');

test('workbook dismissal shares one decision for X, outside click, Escape and close, and reverting removes reload protection', () => {
  const h = workbook(); h.render(); assert.equal(h.listenerCount(), 0);
  h.change('氏名', '修正した氏名'); h.render(); assert.equal(h.unload(), true);
  h.nodes().find(node => node.type === 'Dialog').props.onOpenChange(false);
  assert.equal(h.closed.length, 0); assert.equal(prompt(h).props.open, true);
  prompt(h).props.onKeepEditing(); assert.equal(prompt(h).props.open, false);
  h.click('閉じる'); assert.equal(prompt(h).props.open, true); assert.equal(h.closed.length, 0);
  prompt(h).props.onKeepEditing(); h.change('氏名', '元の氏名'); h.render();
  assert.equal(h.listenerCount(), 0); assert.equal(h.unload(), false); assert.equal(h.button('変更を保存').props.disabled, true);
  h.click('閉じる'); assert.equal(h.closed.length, 1); assert.equal(h.saved.length, 0);
  h.unmount();
});

test('workbook discard remains blocked once saving or an uncertain result begins, and saving sends only changed cells', async () => {
  const h = workbook(); h.change('氏名', '一時入力'); h.click('閉じる');
  for (const state of ['busy', 'uncertain']) {
    h.props.save[state] = true; h.render(); assert.equal(prompt(h).props.locked, true);
    prompt(h).props.onDiscard(); h.nodes().find(node => node.type === 'Dialog').props.onOpenChange(false);
    assert.equal(h.closed.length, 0, state); h.props.save[state] = false;
  }
  prompt(h).props.onKeepEditing(); h.change('氏名', '元の氏名'); h.change('件数', '12');
  await h.nodes().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(JSON.parse(JSON.stringify(h.saved)), [{ 2: 12 }]);
  h.unmount(); assert.equal(h.listenerCount(), 0);
});

test('workbook tabs, refresh, other rows and pagination cannot replace an open row editor', async () => {
  const calls = [], info = { sheetId: 1, title: '案件管理表', rowCount: 200, columnCount: 3 }, table = { ...info, readonly: false, startRow: 1, rows: [row], headers: ['氏名', '件数', '計算'] };
  const h = harness(workbookSource, 'WorkbookManager', { onRead: async action => { calls.push(action); return action === 'managementTables' ? { tables: [info, { ...info, sheetId: 2, title: '別の合成管理表' }] } : table; }, onSave: async () => ({}), busy: false, canWrite: true, save: { busy: false, uncertain: false, error: '', undo: null } });
  h.render(); for (let i = 0; i < 5; i++) { await Promise.resolve(); h.render(); }
  h.click('編集'); h.render();
  for (const label of ['再取得', '案件管理表', '別の合成管理表', '編集', '次へ']) assert.equal(h.button(label).props.disabled, true, label);
  const editor = h.nodes().find(node => typeof node.type === 'function' && node.type.name === 'WorkbookRowEditor'); assert.ok(editor);
  editor.props.onClose(); assert.equal(h.button('次へ').props.disabled, false);
  assert.deepEqual(calls, ['managementTables', 'managementTable']); h.unmount();
});

function clients() {
  const dirty = [], saved = [], data = [
    { id: 'client-a', name: '合成会社A', version: 'initial-a', active: true },
    { id: 'client-b', name: '合成会社B', version: 'initial-b', active: true },
  ];
  const h = harness(clientsSource, 'ClientMaster', { clients: data, knownNames: [], busy: false, onDirtyChange: value => dirty.push(value), onSave: async payload => { saved.push(payload); return true; } });
  const edit = name => { const article = h.nodes().find(node => node.type === 'article' && text(node).includes(name)); const button = nodes(article).find(node => node.type === 'button' && /名称を編集|下書きを編集/.test(text(node))); assert.ok(button); button.props.onClick(); };
  const newName = value => { const label = h.nodes().find(node => node.type === 'label' && text(node) === '新しい取引先'); nodes(label).find(node => node.type === 'input').props.onChange({ target: { value } }); };
  return { ...h, dirty, saved, edit, newName };
}

test('client names keep separate unsaved drafts across other rows and search, and cancel requires an explicit discard', () => {
  const h = clients(); h.render(); assert.equal(h.unload(), false);
  h.edit('合成会社A'); h.change('合成会社Aの新しい名称', '修正したA'); h.render(); assert.equal(h.dirty.at(-1), true); assert.equal(h.unload(), true);
  h.edit('合成会社B'); h.change('合成会社Bの新しい名称', '修正したB'); h.render();
  assert.match(text(h.render()), /未保存の名称：修正したA/); assert.match(text(h.render()), /名称の下書きを確認（2件）/);
  const search = h.nodes().find(node => node.type === 'input' && node.props.placeholder === '会社名で検索');
  search.props.onChange({ target: { value: '存在しない会社' } }); assert.match(text(h.render()), /下書きを確認（2件）/);
  h.click('名称の下書きを確認（2件）'); assert.equal(h.nodes().find(node => node.props['aria-label'] === '合成会社Aの新しい名称').props.value, '修正したA');
  h.click('キャンセル'); assert.match(text(h.render()), /変更した取引先名を破棄しますか/); assert.equal(h.unload(), true);
  h.click('編集を続ける'); assert.equal(h.nodes().find(node => node.props['aria-label'] === '合成会社Aの新しい名称').props.value, '修正したA');
  h.click('キャンセル'); h.click('入力を破棄する'); assert.equal(h.dirty.at(-1), true, 'B remains unsaved');
  h.edit('合成会社B'); h.change('合成会社Bの新しい名称', '合成会社B'); h.render(); assert.equal(h.dirty.at(-1), false); assert.equal(h.unload(), false);
  h.click('キャンセル'); assert.doesNotMatch(text(h.render()), /破棄しますか/); h.unmount();
});

test('client saving preserves the original concurrency version and clears only the saved draft', async () => {
  const h = clients(); h.edit('合成会社A'); h.change('合成会社Aの新しい名称', '正式会社A'); h.newName('新規の会社');
  h.render({ clients: h.props.clients.map(client => client.id === 'client-a' ? { ...client, version: 'arrived-later-a' } : client) });
  const edit = h.nodes().find(node => node.type === 'form' && nodes(node).some(node => node.props['aria-label'] === '合成会社Aの新しい名称'));
  await edit.props.onSubmit({ preventDefault() {} }); h.render();
  assert.deepEqual(JSON.parse(JSON.stringify(h.saved)), [{ id: 'client-a', version: 'initial-a', name: '正式会社A', active: true }]);
  assert.equal(h.dirty.at(-1), true, 'the new-client name is a separate unsaved draft');
  h.click('入力を消す'); h.render({ busy: true }); const discard = h.button('入力を破棄する'); assert.equal(discard.props.disabled, true); discard.props.onClick(); assert.equal(h.unload(), true);
  h.render({ busy: false }); h.click('入力を破棄する'); h.render(); assert.equal(h.dirty.at(-1), false); assert.equal(h.unload(), false);
  h.unmount(); assert.equal(h.dirty.at(-1), false); assert.equal(h.listenerCount(), 0);
});
