import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as intake from '../lib/candidate-intake.ts';
import * as management from '../lib/management-data.ts';
import * as nodeData from '../lib/node-data.ts';
import * as sheets from '../lib/sheets-client.ts';
import * as correction from '../lib/save-correction.ts';

const transpile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const source = transpile('../components/candidate-manager.tsx');
const unsavedSource = transpile('../components/unsaved-work.tsx');
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === 'boolean' ? '' : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
const plain = value => JSON.parse(JSON.stringify(value));

/** Exercise the actual parent form and its shared-editor contract. The child
 * editor's own typing/debounce behavior is covered by candidate-intake-editor. */
function registration(overrides = {}) {
  let cursor = 0, saveResult = true;
  const slots = [], effects = [], listeners = new Set(), saved = [], closed = [], registered = [];
  const react = {
    useState(initial) { const index = cursor++, slot = slots[index] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useId() { return `registration-${cursor++}`; },
    useEffect(fn, deps) { const index = cursor++, previous = slots[index]; if (!previous || !deps || deps.some((value, offset) => !Object.is(value, previous.deps[offset]))) { const slot = { deps }; slots[index] = slot; effects.push(() => { previous?.cleanup?.(); slot.cleanup = fn(); }); } },
  };
  const save = { busy: false, uncertain: false, error: '', save: async (action, payload, label) => {
    saved.push({ action, payload: plain(payload), label });
    save.error = saveResult ? '' : '検証用：保存を開始できませんでした。';
    return saveResult;
  } };
  const props = {
    players: [{ id: 'ND-001', name: '架空担当A', active: true }, { id: 'ND-002', name: '架空担当B', active: true }],
    records: [], clients: [], knownNames: [], intakeEnabled: true, save,
    ai: { enabled: true, identityKey: 'fictional-test-session', preferences: {}, onReadKit: async () => null, onGenerateKit: async () => null },
    onClose: () => closed.push(true), onExisting: () => {}, onRegistered: (...args) => registered.push(args), ...overrides,
  };
  const jsx = (type, input, key) => ({ type, props: input || {}, key }), unsaved = {}, exports = {};
  const dependencies = name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx }
    : name.includes('unsaved-work') ? unsaved : name === '@/lib/candidate-intake' ? intake
      : name === '@/components/candidate-intake' ? { InterviewIntakeEditor: 'InterviewIntakeEditor' }
        : name === '@/lib/management-data' ? management : name === '@/lib/node-data' ? nodeData
          : name === '@/lib/sheets-client' ? sheets : name === '@/lib/save-correction' ? correction
            : name.endsWith('.css') ? {} : new Proxy({}, { get: (_, key) => key });
  const window = { addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) };
  vm.runInNewContext(unsavedSource, { exports: unsaved, module: { exports: unsaved }, require: dependencies, window });
  vm.runInNewContext(source, { exports, module: { exports }, require: dependencies });
  function render(next = {}) { Object.assign(props, next); cursor = 0; const tree = exports.CreateCandidate(props); while (effects.length) effects.shift()(); return tree; }
  const all = () => nodes(render());
  const input = suffix => { const node = all().find(node => node.props.id?.endsWith(suffix)); assert.ok(node, suffix); return node; };
  const editor = () => { const node = all().find(node => node.type === 'InterviewIntakeEditor'); assert.ok(node, 'shared interview editor exists'); return node; };
  const button = label => { const node = all().find(node => node.type === 'button' && text(node) === label); assert.ok(node, label); return node; };
  const click = label => { const node = button(label); assert.ok(!node.props.disabled, `${label} is enabled`); node.props.onClick(); render(); };
  function change(suffix, value) { input(suffix).props.onChange({ target: { value } }); render(); }
  async function submit() { await all().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); render(); }
  render();
  return { props, render, all, input, editor, button, click, change, submit, saved, closed, registered,
    setSaveResult: value => { saveResult = value; },
    unload: () => { const event = { prevented: false, preventDefault() { this.prevented = true; } }; listeners.forEach(listener => listener(event)); return event.prevented; },
    unmount: () => slots.forEach(slot => slot.cleanup?.()),
  };
}

test('candidate names with an internal space are rejected before any save or navigation', async () => {
  for (const value of ['架空 太郎', '架空　太郎']) {
    const h = registration(); h.change('-name', value);
    assert.equal(h.input('-name').props['aria-invalid'], true);
    assert.equal(h.button('候補者を登録').props.disabled, true);
    assert.match(text(h.render()), /スペースを削除.*まだ保存は開始していません/);
    await h.submit();
    assert.equal(h.saved.length, 0); assert.equal(h.closed.length, 0); assert.equal(h.registered.length, 0);
    assert.equal(h.input('-name').props.value, value); h.unmount();
  }
});

test('a future interview completion date is rejected locally and the typed date remains editable', async () => {
  const h = registration(); h.change('-name', '架空太郎'); h.change('-interview', '2099-12-31');
  assert.equal(h.input('-interview').props.max, sheets.businessToday());
  assert.equal(h.button('候補者を登録').props.disabled, true);
  assert.ok(h.all().some(node => node.props.role === 'alert' && /今日.*以前の日付/.test(text(node))));
  await h.submit();
  assert.equal(h.saved.length, 0); assert.equal(h.registered.length, 0); assert.equal(h.input('-interview').props.value, '2099-12-31');
  h.change('-interview', ''); assert.equal(h.button('候補者を登録').props.disabled, false); h.unmount();
});

test('one registration submits shared interview fields introduction and optional completion date together', async () => {
  const h = registration(); h.change('-name', '架空太郎'); h.change('-owner', 'ND-002');
  h.all().find(node => node.type === 'ClientNameInput').props.onChange('架空商事');
  const fields = { ...intake.blankInterviewFields(), pcEnvironment: 'MacBook', networkEnvironment: '光回線', crmTools: ['kintone'], workHistory: '法人への架電を担当。', timeWindow: '900-1800' };
  h.editor().props.onFieldsChange(fields); h.render();
  h.editor().props.onIntroductionChange('【基本情報】\n氏名：架空太郎\n【営業経験・職務経歴】\n法人への架電を担当しています。');
  const date = sheets.businessToday(); h.change('-interview', date);
  assert.equal(h.editor().props.candidateName, '架空太郎'); assert.match(h.editor().props.ai.identityKey, /:new:ND-002$/);
  assert.equal(h.saved.length, 0, 'entering facts and prose does not save implicitly');
  await h.submit();
  assert.deepEqual(h.saved, [{ action: 'createCandidate', payload: {
    playerId: 'ND-002', candidateName: '架空太郎', company: '架空商事', position: 'アポインター', interviewDate: date,
    fields, introduction: '【基本情報】\n氏名：架空太郎\n【営業経験・職務経歴】\n法人への架電を担当しています。', profileVersion: '',
  }, label: '架空太郎を登録' }]);
  assert.deepEqual(h.registered, [['架空太郎', 'ND-002']]); assert.equal(h.closed.length, 0); h.unmount();
});

test('a refused save preserves candidate profile prose and date and allows retry without retyping', async () => {
  const h = registration(); h.change('-name', '架空花子'); h.change('-interview', sheets.businessToday());
  const fields = { ...intake.blankInterviewFields(), pcEnvironment: 'Windows', strengths: '確認事項を記録する。' };
  h.editor().props.onFieldsChange(fields); h.render(); h.editor().props.onIntroductionChange('共有する文章の下書き'); h.render();
  h.setSaveResult(false); await h.submit();
  assert.equal(h.saved.length, 1); assert.equal(h.closed.length, 0); assert.equal(h.registered.length, 0);
  assert.equal(h.input('-name').props.value, '架空花子'); assert.equal(h.input('-interview').props.value, sheets.businessToday());
  assert.deepEqual(plain(h.editor().props.fields), fields); assert.equal(h.editor().props.introduction, '共有する文章の下書き');
  assert.match(text(h.render()), /保存を開始できませんでした/);
  h.setSaveResult(true); await h.submit();
  assert.deepEqual(h.saved[1].payload, h.saved[0].payload); assert.deepEqual(h.registered, [['架空花子', 'ND-001']]); h.unmount();
});

test('automatic prose callbacks do not save and a cancelled discard keeps all registration inputs', () => {
  const h = registration(); h.change('-name', '架空太郎');
  const fields = { ...intake.blankInterviewFields(), pcEnvironment: 'MacBook', workHistory: '法人への架電を担当。' };
  h.editor().props.onFieldsChange(fields); h.render(); h.editor().props.onIntroductionChange('入力から自動でできた下書き'); h.render();
  assert.equal(h.saved.length, 0); assert.equal(h.unload(), true);
  h.click('閉じる'); assert.match(text(h.render()), /登録前の入力があります/); assert.equal(h.closed.length, 0);
  h.click('入力を続ける'); assert.doesNotMatch(text(h.render()), /登録前の入力があります/);
  assert.equal(h.input('-name').props.value, '架空太郎'); assert.deepEqual(plain(h.editor().props.fields), fields);
  assert.equal(h.editor().props.introduction, '入力から自動でできた下書き'); assert.equal(h.saved.length, 0);
  h.all().find(node => node.type === 'Dialog').props.onOpenChange(false); h.render();
  assert.match(text(h.render()), /登録前の入力があります/); assert.equal(h.closed.length, 0);
  h.click('入力を続ける'); assert.equal(h.editor().props.introduction, '入力から自動でできた下書き'); h.unmount();
});

test('a prose-only registration draft is also protected when closing before typing a candidate name', () => {
  const h = registration(); h.editor().props.onIntroductionChange('先に書き留めた候補者の紹介文'); h.render();
  assert.equal(h.saved.length, 0); assert.equal(h.unload(), true);
  h.click('閉じる'); assert.equal(h.closed.length, 0); assert.match(text(h.render()), /登録前の入力があります/);
  h.click('入力を続ける'); assert.equal(h.editor().props.introduction, '先に書き留めた候補者の紹介文'); h.unmount();
});

test('a protocol downgrade cannot silently drop an open interview draft and an older backend receives only supported fields',async()=>{
 const h=registration();h.change('-name','架空保持');
 const fields={...intake.blankInterviewFields(),workHistory:'保存前の職歴を保持'};h.editor().props.onFieldsChange(fields);h.editor().props.onIntroductionChange('共有用の紹介文を保持');h.render({intakeEnabled:false});
 assert.ok(h.editor());assert.equal(h.button('候補者を登録').props.disabled,true);await h.submit();assert.equal(h.saved.length,0);assert.equal(h.editor().props.introduction,'共有用の紹介文を保持');assert.equal(h.editor().props.fields.workHistory,'保存前の職歴を保持');h.unmount();
 const old=registration({intakeEnabled:false});old.change('-name','架空旧連携');await old.submit();assert.equal(old.saved.length,1);assert.equal(Object.hasOwn(old.saved[0].payload,'fields'),false);assert.equal(Object.hasOwn(old.saved[0].payload,'introduction'),false);assert.equal(Object.hasOwn(old.saved[0].payload,'interviewDate'),false);old.unmount();
});
