/**
 * Owner-run migration into an already-created EMPTY bound spreadsheet.
 * No web-app route calls these functions. The source is read-only.
 * Only IDs, progress, counts and SHA-256 fingerprints are persisted; never cells.
 */
var NODE_MIGRATION_SOURCE_ID_ = '1AnyvEoUtgUSTnuuJjIjA80XGHw_DaL9fSUoNCrYZ36s';
var NODE_MIGRATION_KEY_ = 'NODE_MIGRATION_V1';
var NODE_MIGRATION_LAST_FETCH_AT_ = 0;
// A live UI review found comments in the source. Native Sheet.copyTo cannot
// prove preservation of comment authors, replies, resolution and anchoring.
// Keep the public migration entry points blocked until a preservation method
// consistent with the user's destination choice has been implemented/reviewed.
var NODE_MIGRATION_BLOCKING_REASON_ = '元ブックにコメントがあることを確認しています。既存の空ブックへタブだけをコピーする方式では、コメント・返信・作成者・解決状態の同一性を確認できません。コメントの保全方法が決まるまで移行は実行しません。元ブックには変更を加えていません。';

function startNodeMigration() {
  if (NODE_MIGRATION_BLOCKING_REASON_) throw new Error(NODE_MIGRATION_BLOCKING_REASON_);
  var ui = SpreadsheetApp.getUi();
  var target = SpreadsheetApp.getActiveSpreadsheet();
  if (!target || target.getId() === NODE_MIGRATION_SOURCE_ID_) throw new Error('移行先の新しい空のスプレッドシートから実行してください。');
  if (PropertiesService.getScriptProperties().getProperty(NODE_MIGRATION_KEY_)) throw new Error('既存の移行記録があります。continueNodeMigration を実行してください。');
  var identity = Session.getEffectiveUser().getEmail();
  if (!identity || !target.getOwner() || target.getOwner().getEmail() !== identity) throw new Error('移行先の所有者が実行してください。');
  var source = nmReadBook_(NODE_MIGRATION_SOURCE_ID_);
  var destination = nmReadBook_(target.getId());
  nmAssertSupportedBook_(source);
  nmAssertEmptyTarget_(destination, target);
  var confirm = ui.prompt('元データを変更せずに移行', '移行先: ' + target.getName() + '\n元ブックの ' + source.sheets.length + ' タブを、この空のブックへ複製します。\n元ブックの値・数式・書式には書き込みません。\n元ブックに名前付き関数・マクロ・独自スクリプトがないことも確認してください。これらはタブ複製で移せません。\n\n開始する場合は「移行」と入力してください。', ui.ButtonSet.OK_CANCEL);
  if (confirm.getSelectedButton() !== ui.Button.OK || confirm.getResponseText().trim() !== '移行') return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('別の処理が実行中です。');
  try {
    if (PropertiesService.getScriptProperties().getProperty(NODE_MIGRATION_KEY_)) throw new Error('移行は既に開始されています。');
    var state = { version: 1, owner: identity, sourceId: NODE_MIGRATION_SOURCE_ID_, targetId: target.getId(), blankId: destination.sheets[0].properties.sheetId, blankTitle: destination.sheets[0].properties.title, phase: 'baseline', cursor: 0, manifestHash: nmHash_(nmBookDefinition_(source)), sheets: source.sheets.map(function (s) { return { id: s.properties.sheetId, title: s.properties.title, hidden: !!s.properties.hidden, rows: s.properties.gridProperties.rowCount, columns: s.properties.gridProperties.columnCount }; }), map: {}, startedAt: new Date().toISOString() };
    nmSave_(state);
  } finally { lock.releaseLock(); }
  continueNodeMigration();
}

/** Re-run until the dialog says VERIFIED. No installable triggers are created. */
function continueNodeMigration() {
  if (NODE_MIGRATION_BLOCKING_REASON_) throw new Error(NODE_MIGRATION_BLOCKING_REASON_);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('別の処理が実行中です。');
  var state;
  try {
    state = nmLoad_();
    nmAssertOwnerTarget_(state);
    if (state.phase === 'VERIFIED') { nmShowProgress_(state); return; }
    var until = Date.now() + 210000;
    while (Date.now() < until && state.phase !== 'VERIFIED') {
      nmStep_(state);
      nmSave_(state);
    }
  } finally { lock.releaseLock(); }
  nmShowProgress_(state);
}

function showNodeMigrationStatus() {
  var state = nmLoad_();
  nmAssertOwnerTarget_(state);
  nmShowProgress_(state);
}

function nmStep_(state) {
  var source = nmReadBook_(state.sourceId);
  if (nmHash_(nmBookDefinition_(source)) !== state.manifestHash) throw new Error('元ブックのタブ・設定・名前付き範囲が移行開始後に変わりました。移行を停止しています。');
  var target = SpreadsheetApp.getActiveSpreadsheet();
  nmAssertExpectedTabs_(state, target);
  var entry = state.sheets[state.cursor];
  if (state.phase === 'baseline') {
    var original = nmReadSheet_(state.sourceId, entry.title);
    nmAssertSupportedSheet_(original, SpreadsheetApp.openById(state.sourceId).getSheetById(entry.id));
    nmSetHash_('source', entry.id, nmHash_(nmSheetDefinition_(original, nmSourceIds_(state))));
    state.cursor++;
    if (state.cursor === state.sheets.length) { state.phase = 'copy'; state.cursor = 0; }
    return;
  }
  if (state.phase === 'copy') {
    if (state.map[String(entry.id)] !== undefined) {
      var checkpointHash = nmGetHash_('targetCopy', entry.id);
      if (!checkpointHash || nmHash_(nmSheetDefinition_(nmReadSheet_(state.targetId, entry.title), null)) !== checkpointHash) throw new Error('複製後のチェックポイントが未完了または変更されています。二重コピーせず停止しました。');
      state.cursor++;
      if (state.cursor === state.sheets.length) { state.phase = 'references'; state.cursor = 0; }
      return;
    }
    var current = nmReadSheet_(state.sourceId, entry.title);
    nmAssertSourceHash_(state, entry, current);
    if (state.cursor === 0 && target.getSheetById(state.blankId).getName() === state.blankTitle) {
      target.getSheetById(state.blankId).setName('_NODE移行_空シート_' + Utilities.getUuid().slice(0, 8));
    }
    // If execution stops after copyTo and before checkpoint, an unexpected tab
    // stops the next run. It is never silently adopted or copied a second time.
    var copied = SpreadsheetApp.openById(state.sourceId).getSheetById(entry.id).copyTo(target);
    copied.setName(entry.title);
    state.map[String(entry.id)] = copied.getSheetId();
    nmSave_(state);
    nmSetHash_('targetCopy', entry.id, nmHash_(nmSheetDefinition_(nmReadSheet_(state.targetId, entry.title), null)));
    state.cursor++;
    if (state.cursor === state.sheets.length) { state.phase = 'references'; state.cursor = 0; }
    return;
  }
  if (state.phase === 'references') {
    nmRestoreWorkbook_(state, source);
    state.phase = 'repair'; state.cursor = 0;
    return;
  }
  if (state.phase === 'repair') {
    var from = nmReadSheet_(state.sourceId, entry.title);
    nmAssertSourceHash_(state, entry, from);
    var before = nmReadSheet_(state.targetId, entry.title);
    var repairedHash = nmGetHash_('targetRepaired', entry.id);
    if (repairedHash) {
      if (nmHash_(nmSheetDefinition_(before, nmTargetIds_(state))) !== repairedHash) throw new Error('修復後の移行先が変更されています。上書きせず停止しました。');
      state.cursor++;
      if (state.cursor === state.sheets.length) { state.phase = 'verify'; state.cursor = 0; }
      return;
    }
    // Copy fingerprints are before global names/theme restoration, which can
    // alter effective outputs. Only entered data and definitions are compared.
    if (nmHash_(nmSheetDefinition_(before, null)) !== nmGetHash_('targetCopy', entry.id)) throw new Error('移行先の「' + entry.title + '」が複製後に変更されています。上書きせず停止しました。');
    var requests = nmFormulaRequests_(from, state.map[String(entry.id)]);
    nmWrite_(state, requests);
    nmRestoreCrossReferences_(state, from, before);
    nmSetHash_('targetRepaired', entry.id, nmHash_(nmSheetDefinition_(nmReadSheet_(state.targetId, entry.title), nmTargetIds_(state))));
    state.cursor++;
    if (state.cursor === state.sheets.length) { state.phase = 'verify'; state.cursor = 0; }
    return;
  }
  if (state.phase === 'verify') {
    var actualSource = nmReadSheet_(state.sourceId, entry.title);
    nmAssertSourceHash_(state, entry, actualSource);
    var actualTarget = nmReadSheet_(state.targetId, entry.title);
    var expectedHash = nmHash_(nmSheetDefinition_(actualSource, nmSourceIds_(state)));
    if (nmHash_(nmSheetDefinition_(actualTarget, nmTargetIds_(state))) !== expectedHash) throw new Error('「' + entry.title + '」の値・数式・書式・構造に差分があります。自動で補正せず停止しました。');
    nmAssertNoNewFormulaErrors_(actualSource, actualTarget, entry.title);
    state.cursor++;
    if (state.cursor === state.sheets.length) { state.phase = 'source-final'; state.cursor = 0; }
    return;
  }
  if (state.phase === 'source-final') {
    nmAssertSourceHash_(state, entry, nmReadSheet_(state.sourceId, entry.title));
    state.cursor++;
    if (state.cursor === state.sheets.length) { state.phase = 'finish'; state.cursor = 0; }
    return;
  }
  if (state.phase === 'finish') {
    var blank = target.getSheetById(state.blankId);
    if (state.blankId !== null && (!blank || blank.getLastRow() !== 0 || blank.getLastColumn() !== 0 || blank.getImages().length || blank.getDrawings().length || blank.getCharts().length)) throw new Error('移行先の初期の空タブが変更されています。削除せず停止しました。');
    // Keep at least one copied source tab visible before removing the blank.
    state.sheets.forEach(function (s) { if (!s.hidden) target.getSheetById(state.map[String(s.id)]).showSheet(); });
    if (state.blankId !== null) { target.deleteSheet(blank); state.blankId = null; nmSave_(state); }
    state.sheets.forEach(function (s, i) {
      var tab = target.getSheetById(state.map[String(s.id)]);
      target.setActiveSheet(tab); target.moveActiveSheet(i + 1);
      if (s.hidden) tab.hideSheet(); else tab.showSheet();
    });
    var finalBook = nmReadBook_(state.targetId);
    if (nmHash_(nmBookDefinition_(source, nmSourceIds_(state))) !== nmHash_(nmBookDefinition_(finalBook, nmTargetIds_(state)))) throw new Error('ブックのタブ順・設定・名前付き範囲の最終照合に差分があります。');
    state.phase = 'VERIFIED'; state.verifiedAt = new Date().toISOString();
    return;
  }
  throw new Error('移行状態が不正です。');
}

function nmAssertOwnerTarget_(state) {
  var target = SpreadsheetApp.getActiveSpreadsheet();
  if (!target || target.getId() !== state.targetId || state.targetId === state.sourceId || state.sourceId !== NODE_MIGRATION_SOURCE_ID_) throw new Error('移行先が一致しません。元ブックへの書き込みは禁止されています。');
  var email = Session.getEffectiveUser().getEmail();
  if (!email || email !== state.owner || !target.getOwner() || target.getOwner().getEmail() !== email) throw new Error('移行を開始した移行先所有者だけが実行できます。');
}
function nmAssertExpectedTabs_(state, target) {
  var allowed = Object.keys(state.map).map(function (key) { return state.map[key]; });
  if (state.blankId !== null) allowed.push(state.blankId);
  if (target.getSheets().some(function (s) { return allowed.indexOf(s.getSheetId()) < 0; })) throw new Error('未記録のタブがあります。コピー途中の中断または手動変更の可能性があるため、二重コピーせず停止しました。');
  if (target.getSheets().length !== allowed.length) throw new Error('移行先のタブが削除されています。停止しました。');
}
function nmAssertEmptyTarget_(book, target) {
  if (!book.sheets || book.sheets.length !== 1 || (book.namedRanges || []).length) throw new Error('移行先はタブが 1 枚の空のブックである必要があります。既存データは上書きしません。');
  var sheet = target.getSheets()[0];
  var full = nmReadSheet_(target.getId(), sheet.getName());
  if (sheet.getLastRow() || sheet.getLastColumn() || sheet.getImages().length || sheet.getDrawings().length || sheet.getCharts().length || (full.merges || []).length || (full.conditionalFormats || []).length || (full.bandedRanges || []).length || full.basicFilter || (full.filterViews || []).length || (full.protectedRanges || []).length || nmHasEnteredCells_(full)) throw new Error('移行先の初期タブに値・数式・書式・設定があります。上書きせず停止しました。');
}
function nmHasEnteredCells_(sheet) {
  return (sheet.data || []).some(function (grid) { return (grid.rowData || []).some(function (row) { return (row.values || []).some(function (cell) { return !!(cell.userEnteredValue || cell.userEnteredFormat || cell.note || cell.dataValidation || cell.textFormatRuns || cell.chipRuns); }); }); });
}
function nmAssertSupportedBook_(book) {
  if (!book.sheets || !book.sheets.length || (book.dataSources || []).length || (book.dataSourceSchedules || []).length) throw new Error('外部データ接続付きブック等は自動移行できません。');
  if (book.sheets.some(function (s) { return s.properties.sheetType !== 'GRID'; })) throw new Error('通常の表以外のタブがあり、自動移行できません。');
}
function nmAssertSupportedSheet_(sheet, nativeSheet) {
  if (nativeSheet.getImages().length || nativeSheet.getDrawings().length || nativeSheet.getFormUrl() || (sheet.slicers || []).length || (sheet.tables || []).length || (sheet.commentAnchors || []).length) throw new Error('「' + sheet.properties.title + '」に画像・図形・フォーム連携・スライサー・テーブル・コメントがあり、同一性を自動検証できません。コピー開始前に停止しました。');
  (sheet.data || []).forEach(function (grid) { (grid.rowData || []).forEach(function (row) { (row.values || []).forEach(function (cell) { if (cell.pivotTable || cell.dataSourceTable || cell.dataSourceFormula || cell.chipRuns) throw new Error('ピボット・データ接続・スマートチップがあり、同一性を自動検証できません。'); }); }); });
}
function nmAssertSourceHash_(state, entry, sheet) {
  if (nmHash_(nmSheetDefinition_(sheet, nmSourceIds_(state))) !== nmGetHash_('source', entry.id)) throw new Error('元ブックの「' + entry.title + '」が移行開始後に変更されました。混在した状態での移行を防ぐため停止しました。元ブックへの書き込みはしていません。');
}

function nmRestoreWorkbook_(state, source) {
  var desired = nmRemap_(source.properties, state.map);
  var fields = ['locale', 'timeZone', 'autoRecalc', 'iterativeCalculationSettings', 'spreadsheetTheme'];
  var properties = {}; fields.forEach(function (key) { if (desired[key] !== undefined) properties[key] = desired[key]; });
  nmWrite_(state, [{ updateSpreadsheetProperties: { properties: properties, fields: Object.keys(properties).join(',') } }]);
  var current = nmReadBook_(state.targetId);
  var expectedNames = (source.namedRanges || []).map(function (r) { return r.name; });
  if ((current.namedRanges || []).some(function (r) { return expectedNames.indexOf(r.name) < 0; })) throw new Error('複製先に想定外の名前付き範囲があります。削除せず停止しました。');
  var requests = (source.namedRanges || []).map(function (range) {
    var existing = (current.namedRanges || []).filter(function (r) { return r.name === range.name; })[0];
    var definition = { name: range.name, range: nmRemap_(range.range, state.map) };
    if (!existing) return { addNamedRange: { namedRange: definition } };
    definition.namedRangeId = existing.namedRangeId;
    return { updateNamedRange: { namedRange: definition, fields: 'name,range' } };
  });
  nmWrite_(state, requests);
}
function nmRestoreCrossReferences_(state, from, before) {
  var id = state.map[String(from.properties.sheetId)];
  var requests = [];
  (before.conditionalFormats || []).forEach(function (_, i) { requests.unshift({ deleteConditionalFormatRule: { sheetId: id, index: i } }); });
  (from.conditionalFormats || []).forEach(function (rule, i) { requests.push({ addConditionalFormatRule: { rule: nmRemap_(rule, state.map), index: i } }); });
  if ((from.charts || []).length !== (before.charts || []).length) throw new Error('コピーされたグラフ数が一致しません。');
  (from.charts || []).forEach(function (chart, i) { requests.push({ updateChartSpec: { chartId: before.charts[i].chartId, spec: nmRemap_(chart.spec, state.map) } }); });
  // Formula-based validation can be rewritten by native copyTo; restore only
  // the original rule, without touching its cell value or formatting.
  (from.data || []).forEach(function (grid) { (grid.rowData || []).forEach(function (row, r) { (row.values || []).forEach(function (cell, c) {
    if (cell.dataValidation) requests.push({ setDataValidation: { range: { sheetId: id, startRowIndex: (grid.startRow || 0) + r, endRowIndex: (grid.startRow || 0) + r + 1, startColumnIndex: (grid.startColumn || 0) + c, endColumnIndex: (grid.startColumn || 0) + c + 1 }, rule: cell.dataValidation } });
  }); }); });
  nmWrite_(state, requests);
}
function nmFormulaRequests_(sheet, targetSheetId) {
  var result = [];
  (sheet.data || []).forEach(function (grid) { (grid.rowData || []).forEach(function (row, r) {
    var values = row.values || [], c = 0;
    while (c < values.length) {
      if (!values[c].userEnteredValue || !values[c].userEnteredValue.formulaValue) { c++; continue; }
      var start = c, cells = [];
      while (c < values.length && values[c].userEnteredValue && values[c].userEnteredValue.formulaValue) { cells.push({ userEnteredValue: { formulaValue: values[c].userEnteredValue.formulaValue } }); c++; }
      result.push({ updateCells: { start: { sheetId: targetSheetId, rowIndex: (grid.startRow || 0) + r, columnIndex: (grid.startColumn || 0) + start }, rows: [{ values: cells }], fields: 'userEnteredValue' } });
    }
  }); });
  return result;
}
function nmAssertNoNewFormulaErrors_(source, target, title) {
  function errors(sheet) {
    var out = {};
    (sheet.data || []).forEach(function (grid) { (grid.rowData || []).forEach(function (row, r) { (row.values || []).forEach(function (cell, c) { if (cell.effectiveValue && cell.effectiveValue.errorValue) out[(grid.startRow || 0) + r + ':' + ((grid.startColumn || 0) + c)] = cell.effectiveValue.errorValue.type; }); }); });
    return out;
  }
  var before = errors(source), after = errors(target);
  if (Object.keys(after).some(function (cell) { return after[cell] !== before[cell]; })) throw new Error('「' + title + '」に元ブックになかった計算エラーがあります。外部参照の承認や再計算を確認し、同じ関数を再実行してください。');
}

function nmBookDefinition_(book, ids) {
  var props = JSON.parse(JSON.stringify(book.properties || {})); delete props.title;
  var sheets = (book.sheets || []).map(function (sheet) { var p = JSON.parse(JSON.stringify(sheet.properties)); if (ids) p.sheetId = ids[String(p.sheetId)]; return p; });
  var ranges = (book.namedRanges || []).map(function (r) { return { name: r.name, range: ids ? nmRemap_(r.range, ids) : r.range }; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  return { properties: props, sheets: sheets, namedRanges: ranges };
}
function nmSheetDefinition_(sheet, ids) {
  var transient = { effectiveValue: 1, formattedValue: 1, effectiveFormat: 1, hyperlink: 1, chartId: 1, filterViewId: 1, bandedRangeId: 1, protectedRangeId: 1, metadataId: 1, requestingUserCanEdit: 1 };
  // File sharing / collaborators are intentionally not migrated. Rule locations
  // and descriptions remain compared; a mismatch halts instead of weakening it.
  function clean(value, parentKey) {
    if (Array.isArray(value)) return value.map(function (v) { return clean(v, parentKey); });
    if (!value || typeof value !== 'object') return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      if (transient[key] || key === 'editors' || (parentKey === 'properties' && (key === 'index' || key === 'hidden'))) return;
      if (key === 'sheetId' && ids) { if (ids[String(value[key])] === undefined) throw new Error('未解決の別タブ参照があります。'); out[key] = ids[String(value[key])]; }
      else out[key] = clean(value[key], key);
    });
    return out;
  }
  return clean(sheet, 'sheet');
}
function nmRemap_(value, mapping) {
  if (Array.isArray(value)) return value.map(function (v) { return nmRemap_(v, mapping); });
  if (!value || typeof value !== 'object') return value;
  var output = {};
  Object.keys(value).forEach(function (key) { if (key === 'sheetId') { if (mapping[String(value[key])] === undefined) throw new Error('元タブに対応する移行先がありません。'); output[key] = mapping[String(value[key])]; } else output[key] = nmRemap_(value[key], mapping); });
  return output;
}
function nmSourceIds_(state) { var map = {}; state.sheets.forEach(function (s) { map[String(s.id)] = s.title; }); return map; }
function nmTargetIds_(state) { var map = {}; state.sheets.forEach(function (s) { if (state.map[String(s.id)] !== undefined) map[String(state.map[String(s.id)])] = s.title; }); return map; }
function nmCanonical_(value) {
  if (Array.isArray(value)) return '[' + value.map(nmCanonical_).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + nmCanonical_(value[key]); }).join(',') + '}';
  return JSON.stringify(value);
}
function nmHash_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, nmCanonical_(value), Utilities.Charset.UTF_8).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function nmReadBook_(id) { return nmRequest_('get', id, '?includeGridData=false', null); }
function nmReadSheet_(id, title) {
  var response = nmRequest_('get', id, '?includeGridData=true&ranges=' + encodeURIComponent("'" + title.replace(/'/g, "''") + "'"), null);
  if (!response.sheets || response.sheets.length !== 1) throw new Error('対象タブを一意に読み込めません。');
  return response.sheets[0];
}
function nmWrite_(state, requests) {
  nmAssertOwnerTarget_(state);
  if (state.targetId === NODE_MIGRATION_SOURCE_ID_) throw new Error('元ブックへの書き込みは禁止されています。');
  for (var i = 0; i < requests.length; i += 250) nmRequest_('post', state.targetId, ':batchUpdate', { requests: requests.slice(i, i + 250) });
}
function nmRequest_(method, id, suffix, body) {
  if (method !== 'get' && id === NODE_MIGRATION_SOURCE_ID_) throw new Error('元ブックへの API 書き込みは禁止されています。');
  var options = { method: method, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
  var pause = 1100 - (Date.now() - NODE_MIGRATION_LAST_FETCH_AT_);
  if (pause > 0) Utilities.sleep(pause);
  NODE_MIGRATION_LAST_FETCH_AT_ = Date.now();
  var response = UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(id) + suffix, options);
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('Google Sheets API が失敗しました（HTTP ' + response.getResponseCode() + '）。実行ログにセル内容や応答本文は出力していません。');
  return JSON.parse(response.getContentText());
}
function nmSave_(state) { PropertiesService.getScriptProperties().setProperty(NODE_MIGRATION_KEY_, JSON.stringify(state)); }
function nmLoad_() { var value = PropertiesService.getScriptProperties().getProperty(NODE_MIGRATION_KEY_); if (!value) throw new Error('先に startNodeMigration を実行してください。'); return JSON.parse(value); }
function nmSetHash_(kind, id, hash) { PropertiesService.getScriptProperties().setProperty(NODE_MIGRATION_KEY_ + '_' + kind + '_' + id, hash); }
function nmGetHash_(kind, id) { return PropertiesService.getScriptProperties().getProperty(NODE_MIGRATION_KEY_ + '_' + kind + '_' + id); }
function nmShowProgress_(state) {
  var message = state.phase === 'VERIFIED' ? 'VERIFIED: 全 ' + state.sheets.length + ' タブの値・数式・書式・構造・名前付き範囲を照合しました。元ブックへの書き込みはしていません。\n移行先の共有・名前付き関数等は別途確認し、アプリ接続は新しいブックだけに設定してください。' : '工程: ' + state.phase + '\n' + state.cursor + ' / ' + state.sheets.length + '\n続きは continueNodeMigration を再実行してください。途中ではアプリを接続しないでください。';
  SpreadsheetApp.getUi().alert('NODE データ移行', message, SpreadsheetApp.getUi().ButtonSet.OK);
}
