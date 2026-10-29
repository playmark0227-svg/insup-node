import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as goals from '../lib/monthly-goals.ts';
import { isUncertainWrite, SheetApiError } from '../lib/sheets-client.ts';
const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const source = compile('../components/monthly-goals.tsx'), warningSource = compile('../components/unsaved-work.tsx');
const text = tree => tree == null || typeof tree === 'boolean' ? '' : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
const nodes = tree => tree && typeof tree === 'object' ? Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)] : [];
const players = [{ id: 'ND-001', name: '合成担当1', target: 20 }, { id: 'ND-002', name: '合成担当2', target: 30 }, { id: 'ND-003', name: '停止担当', target: 10, active: false }];
const goal = (target = 20, month = '2026-10', version = 'v1') => ({ playerId: 'ND-001', month, target, version, updatedAt: '2026-10-30T01:00:00Z' });
function harness(overrides = {}) {
 let cursor = 0, nextId = 0; const slots = [], effects = [], dirty = [], pending = [], calls = [], listeners = new Set();
 const react = {
  useState(initial) { const i = cursor++, slot = slots[i] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }]; },
  useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
  useEffect(fn, deps) { const i = cursor++, previous = slots[i]; if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) { slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
 };
 const jsx = (type, props, key) => ({ type, props: props || {}, key }), warning = {};
 const require = name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : name.includes('monthly-goals') && !name.endsWith('.css') ? goals : name.includes('sheets-client') ? { isUncertainWrite } : name.includes('unsaved-work') ? warning : name.endsWith('.css') ? {} : new Proxy({}, { get: (_, key) => key });
 vm.runInNewContext(warningSource, { exports: warning, module: { exports: warning }, require, window: { addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) } });
 const exports = {};
 vm.runInNewContext(source, { Error, exports, module: { exports }, require, crypto: { randomUUID: () => `operation-${++nextId}` } });
 const props = { players, goals: [], admin: true, selfPlayerId: 'ADMIN', currentMonth: '2026-10', onDirtyChange: value => dirty.push(value), onPendingChange: value => pending.push(value), onSave: async (payload, operationId) => { calls.push({ payload, operationId }); return { ...goal(payload.target, payload.month, 'v2'), playerId: payload.playerId, operationId, updatedAt: '2026-10-30T02:00:00Z' }; }, ...overrides };
 const render = (next = {}) => { Object.assign(props, next); cursor = 0; const tree = exports.MonthlyGoals(props); while (effects.length) effects.shift()(); return tree; };
 const row = id => nodes(render()).find(node => node.type === 'article' && text(node).includes(id));
 const input = id => nodes(row(id)).find(node => node.type === 'input');
 return { props, render, row, input, dirty, pending, calls,
  change(id, value) { const node = input(id); assert.ok(node && !node.props.disabled); node.props.onChange({ target: { value } }); render(); },
  month(value) { nodes(render()).find(node => node.type === 'input' && node.props.type === 'month').props.onChange({ target: { value } }); render(); },
  submit(id) { return nodes(row(id)).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); },
  button(id, label) { return nodes(row(id)).find(node => node.type === 'button' && text(node).includes(label)); },
  unload() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; listeners.forEach(fn => fn(event)); return event.prevented; },
  unmount() { slots.forEach(slot => slot.cleanup?.()); },
 };
}
const flush = async h => { for (let i = 0; i < 5; i++) { await Promise.resolve(); h.render(); } };
test('monthly target editor scopes active players, keeps past blanks distinct from zero and never calculates provisional attainment', () => {
 const h = harness({ admin: false, selfPlayerId: 'ND-001' }); assert.ok(h.row('ND-001')); assert.equal(h.row('ND-002'), undefined); assert.equal(h.row('ND-003'), undefined);
 assert.equal(h.input('ND-001').props.value, '20'); assert.match(text(h.row('ND-001')), /標準目標・未確定/); assert.equal(h.dirty.at(-1), false);
 h.month('2026-09'); assert.equal(h.input('ND-001').props.value, ''); assert.match(text(h.row('ND-001')), /未設定/);
 h.change('ND-001', '0'); assert.equal(h.input('ND-001').props.value, '0'); assert.equal(h.dirty.at(-1), true); assert.equal(h.unload(), true);
 h.change('ND-001', ''); assert.equal(h.dirty.at(-1), false); assert.equal(h.unload(), false); h.unmount();
});
test('month changes preserve per-row drafts and original versions while other target saves run', async () => {
 let complete; const calls = [], h = harness({ goals: [goal()], onSave: (payload, operationId) => { calls.push({ payload, operationId }); return new Promise(resolve => { complete = resolve; }); } });
 h.change('ND-001', '25'); h.render({ goals: [goal(21, '2026-10', 'arrived-v2')] });
 h.submit('ND-001'); h.render(); assert.equal(h.pending.at(-1), true); assert.equal(h.input('ND-001').props.disabled, true); assert.equal(calls[0].payload.expectedVersion, 'v1');
 h.month('2026-09'); h.change('ND-001', '5'); h.month('2026-10'); assert.equal(h.input('ND-001').props.value, '25');
 complete({ ...goal(25, '2026-10', 'saved-v3'), operationId: calls[0].operationId, updatedAt: '2026-10-30T03:00:00Z' }); await flush(h);
 assert.equal(h.pending.at(-1), false); assert.equal(h.input('ND-001').props.value, '25'); assert.equal(h.dirty.at(-1), true, 'September remains unsaved');
 h.month('2026-09'); assert.equal(h.input('ND-001').props.value, '5'); h.unmount();
});
test('a lost save response retains the exact operation and keeps pending true until verified same-ID retry succeeds', async () => {
 const calls = []; let fail = true;
 const h = harness({ onSave: async (payload, operationId) => { calls.push({ payload, operationId }); if (fail) throw new SheetApiError('TIMEOUT', '応答待ち'); return { ...goal(payload.target, payload.month, 'saved'), operationId, updatedAt: '2026-10-30T03:00:00Z' }; } });
 h.change('ND-001', '0'); h.submit('ND-001'); await flush(h);
 assert.equal(h.pending.at(-1), true); assert.equal(h.dirty.at(-1), true); assert.equal(h.input('ND-001').props.disabled, true); assert.match(text(h.row('ND-001')), /同じ内容で再試行/); assert.equal(h.unload(), true);
 fail = false; h.submit('ND-001'); await flush(h); assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
 assert.equal(h.pending.at(-1), false); assert.equal(h.dirty.at(-1), false); assert.match(text(h.row('ND-001')), /確定済み/); assert.match(text(h.row('ND-001')), /目標0件・達成率の計算対象外/); h.unmount();
});
test('conflicts preserve editable input and receipt mismatch never reports successful saving', async () => {
 const conflict = new SheetApiError('VERSION_CONFLICT', '先に更新されています'); let invalid = false;
 const h = harness({ goals: [goal()], onSave: async (payload, operationId) => { if (!invalid) throw conflict; return { ...goal(payload.target), operationId: operationId + '-wrong' }; } });
 h.change('ND-001', '25'); h.submit('ND-001'); await flush(h); assert.equal(h.pending.at(-1), false); assert.equal(h.input('ND-001').props.value, '25'); assert.equal(h.input('ND-001').props.disabled, false); assert.match(text(h.row('ND-001')), /最新の目標を確認/);
 invalid = true; h.submit('ND-001'); await flush(h); assert.equal(h.pending.at(-1), true); assert.match(text(h.row('ND-001')), /保存結果が一致しません/); h.unmount();
});


test('admin can complete stopped player monthly goals while history and player scope remain protected',async()=>{
 const stopped={...goal(12,'2026-09','stopped-goal'),playerId:'ND-003'};
 const h=harness({goals:[stopped],counts:{'2026-09':{'ND-003':{'提案':6}}}});
 assert.ok(h.row('ND-003'),'admin can complete a stopped player monthly goal');assert.match(text(h.row('ND-003')),/停止担当（停止中）/);assert.equal(h.input('ND-003').props.disabled,false);assert.match(text(h.render()),/停止中の担当者も、管理者は月別目標を補完できます/);
 const history=nodes(h.render()).find(node=>node.type==='details');assert.match(text(history),/停止担当（停止中）/);assert.match(text(history),/12件6件50%/);
 const own=harness({admin:false,selfPlayerId:'ND-001',goals:[stopped]});assert.doesNotMatch(text(own.render()),/停止担当|stopped-goal|12件6件50%/);
 h.month('2026-09');h.change('ND-003','13');h.submit('ND-003');await flush(h);assert.equal(h.calls.at(-1).payload.playerId,'ND-003');assert.equal(h.calls.at(-1).payload.expectedVersion,'stopped-goal');assert.equal(h.input('ND-003').props.value,'13');assert.equal(h.pending.at(-1),false);
 const stoppedSelf=harness({admin:false,selfPlayerId:'ND-003',goals:[stopped]});assert.equal(stoppedSelf.row('ND-003'),undefined,'inactive player never gets a goal editor');
 h.unmount();own.unmount();stoppedSelf.unmount();
});
