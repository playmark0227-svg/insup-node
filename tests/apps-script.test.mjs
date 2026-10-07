import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const CODE_PATH = fileURLToPath(new URL("../google-apps-script/Code.gs", import.meta.url));
const clone = value => structuredClone(value);
const bytes = value => typeof value === "string" ? Buffer.from(value) : Buffer.from(value.map(n => n & 255));
const signedBytes = buffer => [...buffer].map(n => n > 127 ? n - 256 : n);
const columnNumber = name => [...name.toUpperCase()].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0);
const present = value => value !== undefined && value !== null && value !== "";

class MockMetadata {
  constructor(spreadsheet, sheet, row, key, value, visibility = "DOCUMENT") {
    Object.assign(this, { spreadsheet, sheet, row, key, value, visibility, id: spreadsheet.nextMetadataId++ });
  }
  getId() { return this.id; }
  getKey() { return this.key; }
  getValue() { return this.value; }
  getVisibility() { return this.visibility; }
  setValue(value) { this.value = String(value); return this; }
  remove() { this.spreadsheet.metadata = this.spreadsheet.metadata.filter(item => item !== this); }
  getLocation() {
    return { getLocationType: () => this.row ? "ROW" : this.sheet ? "SHEET" : "SPREADSHEET", getRow: () => this.row ? this.sheet.getRange(this.row, 1, 1, this.sheet.getMaxColumns()) : null, getSheet: () => this.sheet, getSpreadsheet: () => this.spreadsheet };
  }
}

class MockMetadataFinder {
  constructor(spreadsheet, sheet = null, range = null) { Object.assign(this, { spreadsheet, sheet, range, filters: [] }); }
  withKey(key) { this.filters.push(item => item.key === key); return this; }
  withValue(value) { this.filters.push(item => item.value === value); return this; }
  withId(id) { this.filters.push(item => item.id === id); return this; }
  withLocationType(type) { this.filters.push(item => item.getLocation().getLocationType() === type); return this; }
  withVisibility(visibility) { this.filters.push(item => item.visibility === visibility); return this; }
  onIntersectingLocations() { return this; }
  find() { return this.spreadsheet.metadata.filter(item => (!this.sheet || item.sheet === this.sheet) && (!this.range || item.row >= this.range.row && item.row < this.range.row + this.range.rows) && this.filters.every(filter => filter(item))); }
}

class MockRange {
  constructor(sheet, row, column, rows = 1, columns = 1) {
    Object.assign(this, { sheet, row, column, rows, columns });
  }
  getRow() { return this.row; }
  getColumn() { return this.column; }
  getNumRows() { return this.rows; }
  getNumColumns() { return this.columns; }
  getSheet() { return this.sheet; }
  getValues() { return this.matrix(this.sheet.values); }
  getDisplayValues() { return this.getValues().map(row => row.map(value => String(value ?? ""))); }
  getValue() { return this.getValues()[0][0]; }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }
  getFormulas() { return this.matrix(this.sheet.formulas); }
  getFormula() { return this.getFormulas()[0][0]; }
  getDeveloperMetadata() { return this.createDeveloperMetadataFinder().find(); }
  createDeveloperMetadataFinder() { return new MockMetadataFinder(this.sheet.spreadsheet, this.sheet, this); }
  addDeveloperMetadata(key, value, visibility) {
    this.sheet.spreadsheet.metadata.push(new MockMetadata(this.sheet.spreadsheet, this.sheet, this.row, key, String(value), visibility));
    return this;
  }
  offset(rows, columns, numRows = this.rows, numColumns = this.columns) { return this.sheet.getRange(this.row + rows, this.column + columns, numRows, numColumns); }
  sort(spec) {
    const rules = (Array.isArray(spec) ? spec : [spec]).map(rule => typeof rule === "number" ? { column: rule, ascending: true } : rule);
    const ordered = Array.from({ length: this.rows }, (_, index) => ({ oldRow: this.row + index, values: this.sheet.values[this.row + index - 1], formulas: this.sheet.formulas[this.row + index - 1] }));
    ordered.sort((a, b) => {
      for (const rule of rules) {
        const compared = String(a.values[rule.column - 1] ?? "").localeCompare(String(b.values[rule.column - 1] ?? ""));
        if (compared) return rule.ascending === false ? -compared : compared;
      }
      return 0;
    });
    const rowMap = new Map(ordered.map((entry, index) => [entry.oldRow, this.row + index]));
    ordered.forEach((entry, index) => { this.sheet.values[this.row + index - 1] = entry.values; this.sheet.formulas[this.row + index - 1] = entry.formulas; });
    this.sheet.spreadsheet.metadata.forEach(item => { if (item.sheet === this.sheet && rowMap.has(item.row)) item.row = rowMap.get(item.row); });
    return this;
  }
  matrix(source) {
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) => source[this.row + r - 1]?.[this.column + c - 1] ?? ""));
  }
  write(matrix, formula = false) {
    assert.equal(matrix.length, this.rows, "The mock rejects invalid setValues row dimensions");
    assert.ok(matrix.every(row => row.length === this.columns), "The mock rejects invalid setValues column dimensions");
    this.sheet.spreadsheet.beforeWrite({ sheet: this.sheet, range: this, values: matrix, formula });
    for (let r = 0; r < this.rows; r++) {
      const index = this.row + r - 1;
      this.sheet.values[index] ??= [];
      this.sheet.formulas[index] ??= [];
      for (let c = 0; c < this.columns; c++) {
        const column = this.column + c - 1;
        const value = matrix[r][c];
        this.sheet.values[index][column] = clone(value);
        this.sheet.formulas[index][column] = formula || (typeof value === "string" && value.startsWith("=")) ? value : "";
      }
    }
    return this;
  }
  setValue(value) { return this.write([[value]]); }
  setValues(values) { return this.write(values); }
  setFormula(value) { return this.write([[value]], true); }
  setFormulas(values) { return this.write(values, true); }
  clearContent() { return this.write(Array.from({ length: this.rows }, () => Array(this.columns).fill(""))); }
  setNumberFormat() { return this; }
  setNumberFormats() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setWrap() { return this; }
  protect() {
    const protection = { range: this, setDescription() { return this; }, setWarningOnly() { return this; } };
    this.sheet.protections.push(protection);
    return protection;
  }
}

class MockSheet {
  constructor(spreadsheet, { id, name, values = [], formulas = [] }) {
    Object.assign(this, { spreadsheet, id, name, values: clone(values), formulas: clone(formulas), protections: [], hidden: false });
    formulas.forEach((row, r) => row.forEach((formula, c) => {
      if (formula) { this.values[r] ??= []; this.values[r][c] ??= formula; }
    }));
  }
  getSheetId() { return this.id; }
  getName() { return this.name; }
  getParent() { return this.spreadsheet; }
  getDeveloperMetadata() { return this.spreadsheet.metadata.filter(item => item.sheet === this); }
  createDeveloperMetadataFinder() { return new MockMetadataFinder(this.spreadsheet, this); }
  addDeveloperMetadata(key, value, visibility) { this.spreadsheet.metadata.push(new MockMetadata(this.spreadsheet, this, null, key, String(value), visibility)); return this; }
  getLastRow() {
    const rows = this.values.map((row, index) => row.some(present) || this.formulas[index]?.some(present) ? index + 1 : 0);
    return Math.max(0, ...rows);
  }
  getLastColumn() { return Math.max(0, ...this.values.map(row => row.reduce((last, value, index) => present(value) ? index + 1 : last, 0)), ...this.formulas.map(row => row.length)); }
  getMaxRows() { return Math.max(1000, this.values.length); }
  getMaxColumns() { return Math.max(26, this.getLastColumn()); }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(row, column, rows = 1, columns = 1) {
    if (typeof row === "string") {
      if (/^\d+:\d+$/.test(row)) { const [start, end] = row.split(":").map(Number); return new MockRange(this, start, 1, end - start + 1, this.getMaxColumns()); }
      if (/^[A-Z]+:[A-Z]+$/i.test(row)) { const [start, end] = row.split(":").map(columnNumber); return new MockRange(this, 1, start, this.getMaxRows(), end - start + 1); }
      const match = row.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
      if (!match) throw new Error(`Unsupported mock range: ${row}`);
      const [, startColumn, startRow, endColumn = startColumn, endRow = startRow] = match;
      return new MockRange(this, Number(startRow), columnNumber(startColumn), Number(endRow) - Number(startRow) + 1, columnNumber(endColumn) - columnNumber(startColumn) + 1);
    }
    return new MockRange(this, row, column, rows, columns);
  }
  appendRow(values) { this.getRange(this.getLastRow() + 1, 1, 1, values.length).setValues([values]); return this; }
  setFrozenRows() { return this; }
  hideSheet() { this.hidden = true; return this; }
  isSheetHidden() { return this.hidden; }
  autoResizeColumns() { return this; }
  deleteRow(row) {
    this.spreadsheet.beforeWrite({ sheet: this, deletion: row });
    this.values.splice(row - 1, 1); this.formulas.splice(row - 1, 1); return this;
  }
  insertRowsAfter() { return this; }
  insertColumnsAfter() { return this; }
  getProtections() { return this.protections; }
  protect() { return this.getDataRange().protect(); }
}

class MockSpreadsheet {
  constructor(id, sheets, writes) {
    this.id = id; this.sheets = sheets.map(sheet => new MockSheet(this, sheet)); this.writes = writes; this.failure = null; this.metadata = []; this.nextMetadataId = 1;
  }
  beforeWrite(operation) {
    if (this.failure?.(operation)) throw new Error("Injected spreadsheet write failure");
    this.writes.push({ sheetId: operation.sheet.id, sheetName: operation.sheet.name, row: operation.range?.row, column: operation.range?.column, rows: operation.range?.rows, columns: operation.range?.columns, values: clone(operation.values), formula: operation.formula, deletion: operation.deletion });
  }
  getId() { return this.id; }
  getDeveloperMetadata() { return this.metadata; }
  createDeveloperMetadataFinder() { return new MockMetadataFinder(this); }
  getSheets() { return this.sheets; }
  getSheetByName(name) { return this.sheets.find(sheet => sheet.name === name) ?? null; }
  getSheetById(id) { return this.sheets.find(sheet => sheet.id === Number(id)) ?? null; }
  insertSheet(name) {
    if (this.getSheetByName(name)) throw new Error(`Duplicate sheet: ${name}`);
    const sheet = new MockSheet(this, { id: 900000000 + this.sheets.length, name });
    this.sheets.push(sheet); return sheet;
  }
  getSpreadsheetTimeZone() { return "Asia/Tokyo"; }
  setSpreadsheetTimeZone() { return this; }
  batchUpdate(body) {
    const saved = this.sheets.map(sheet => ({ sheet, values: clone(sheet.values), formulas: clone(sheet.formulas) }));
    const oldMetadata = this.metadata.map(item => ({ item, value: item.value, row: item.row }));
    const initialWrites = this.writes.length;
    const initialMetadataId = this.nextMetadataId;
    const replies = [];
    try {
      for (const request of body.requests ?? []) {
        if (request.updateCells || request.appendCells) {
          const input = request.updateCells ?? request.appendCells;
          const sheet = this.getSheetById(input.sheetId ?? input.range?.sheetId ?? input.start?.sheetId);
          if (!sheet) throw new Error("Unknown destination sheet");
          const row = request.appendCells ? sheet.getLastRow() + 1 : (input.range?.startRowIndex ?? input.start?.rowIndex ?? 0) + 1;
          const column = (input.range?.startColumnIndex ?? input.start?.columnIndex ?? 0) + 1;
          const cells = input.rows ?? [];
          if (cells.length) {
            const maxColumns = Math.max(...cells.map(entry => entry.values?.length ?? 0));
            const values = cells.map(entry => Array.from({ length: maxColumns }, (_, i) => {
              const cell = entry.values?.[i] ?? {};
              const value = cell.userEnteredValue ?? {};
              const format = cell.userEnteredFormat?.numberFormat?.type;
              if (typeof value.numberValue === "number" && ["DATE", "DATE_TIME", "TIME"].includes(format)) {
                return new Date((value.numberValue - 25569) * 86400000 - 9 * 3600 * 1000);
              }
              return value.stringValue ?? value.numberValue ?? value.boolValue ?? value.formulaValue ?? "";
            }));
            sheet.getRange(row, column, values.length, maxColumns).setValues(values);
            cells.forEach((entry, r) => (entry.values ?? []).forEach((cell, c) => {
              sheet.formulas[row + r - 1][column + c - 1] = cell.userEnteredValue?.formulaValue ?? "";
            }));
          }
          replies.push({});
        } else if (request.createDeveloperMetadata) {
          const input = request.createDeveloperMetadata.developerMetadata;
          const dimension = input.location?.dimensionRange;
          const sheet = this.getSheetById(dimension?.sheetId ?? input.location?.sheetId);
          const metadata = new MockMetadata(this, sheet, dimension ? dimension.startIndex + 1 : null, input.metadataKey, input.metadataValue, input.visibility);
          this.metadata.push(metadata);
          replies.push({ createDeveloperMetadata: { developerMetadata: { ...input, metadataId: metadata.id } } });
        } else if (request.updateDeveloperMetadata) {
          const input = request.updateDeveloperMetadata;
          const matched = this.metadata.filter(item => (input.dataFilters ?? []).some(filter => {
            const lookup = filter.developerMetadataLookup ?? {};
            return (lookup.metadataId === undefined || lookup.metadataId === item.id) && (lookup.metadataKey === undefined || lookup.metadataKey === item.key) && (lookup.metadataValue === undefined || lookup.metadataValue === item.value);
          }));
          matched.forEach(item => { if (input.developerMetadata.metadataValue !== undefined) item.value = input.developerMetadata.metadataValue; });
          replies.push({ updateDeveloperMetadata: { developerMetadata: matched.map(item => ({ metadataId: item.id, metadataValue: item.value })) } });
        } else {
          throw new Error(`Unsupported mock Sheets request: ${Object.keys(request).join(",")}`);
        }
      }
      return { status: 200, body: JSON.stringify({ spreadsheetId: this.id, replies }) };
    } catch (error) {
      saved.forEach(({ sheet, values, formulas }) => Object.assign(sheet, { values, formulas }));
      this.metadata = oldMetadata.map(({ item, value, row }) => Object.assign(item, { value, row }));
      this.nextMetadataId = initialMetadataId;
      this.writes.splice(initialWrites);
      return { status: 500, body: JSON.stringify({ error: { code: 500, message: error.message } }) };
    }
  }
}

export function createHarness({ spreadsheetId = "test-spreadsheet", sheets = [], properties = {}, now = "2026-10-07T06:00:00.000Z", code } = {}) {
  const writes = [];
  const spreadsheet = new MockSpreadsheet(spreadsheetId, sheets, writes);
  const propertyStore = { ...properties };
  const cacheStore = new Map();
  const clock = { milliseconds: new Date(now).getTime() };
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [clock.milliseconds])); }
    static now() { return clock.milliseconds; }
    static [Symbol.hasInstance](value) { return value instanceof RealDate; }
  }
  const logs = [];
  const apiCalls = [];
  const locks = { held: false, calls: 0, available: true };
  const propertyApi = {
    getProperty: key => propertyStore[key] ?? null,
    getProperties: () => ({ ...propertyStore }),
    setProperty(key, value) { propertyStore[key] = String(value); return this; },
    setProperties(values, deleteAll = false) { if (deleteAll) Object.keys(propertyStore).forEach(key => delete propertyStore[key]); Object.entries(values).forEach(([key, value]) => propertyStore[key] = String(value)); return this; },
    deleteProperty(key) { delete propertyStore[key]; return this; },
    deleteAllProperties() { Object.keys(propertyStore).forEach(key => delete propertyStore[key]); return this; },
  };
  const context = vm.createContext({
    Date: FixedDate,
    console,
    NODE_TESTS: {},
    Logger: { log: (...args) => logs.push(args) },
    ScriptApp: { getOAuthToken: () => "test-oauth-token" },
    UrlFetchApp: { fetch: (url, options) => {
      assert.equal(url, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, "The API must target the configured spreadsheet batchUpdate endpoint");
      const body = JSON.parse(options.payload);
      apiCalls.push({ url, body: clone(body) });
      const response = spreadsheet.batchUpdate(body);
      return { getResponseCode: () => response.status, getContentText: () => response.body };
    } },
    Session: { getScriptTimeZone: () => "Asia/Tokyo", getEffectiveUser: () => ({ getEmail: () => "owner@example.test" }), getActiveUser: () => ({ getEmail: () => "owner@example.test" }) },
    PropertiesService: { getScriptProperties: () => propertyApi },
    SpreadsheetApp: {
      openById: id => { assert.equal(id, spreadsheetId, "The API must address its configured spreadsheet"); return spreadsheet; },
      getActiveSpreadsheet: () => spreadsheet,
      getActive: () => spreadsheet,
      getUi: () => ({ ButtonSet: { YES_NO: "YES_NO" }, Button: { YES: "YES", NO: "NO" }, alert: () => "YES" }),
      flush: () => {},
      ProtectionType: { RANGE: "RANGE", SHEET: "SHEET" },
      DeveloperMetadataVisibility: { DOCUMENT: "DOCUMENT", PROJECT: "PROJECT" },
      DeveloperMetadataLocationType: { ROW: "ROW", SHEET: "SHEET", SPREADSHEET: "SPREADSHEET" },
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: content => ({ content: String(content), setMimeType() { return this; }, getContent() { return this.content; } }),
    },
    LockService: { getScriptLock: () => ({
      waitLock() { locks.calls++; if (!locks.available || locks.held) throw new Error("Lock timeout"); locks.held = true; },
      tryLock() { locks.calls++; if (!locks.available || locks.held) return false; locks.held = true; return true; },
      hasLock: () => locks.held,
      releaseLock() { locks.held = false; },
    }) },
    CacheService: { getScriptCache: () => ({
      get: key => cacheStore.get(key)?.expiry > clock.milliseconds ? cacheStore.get(key).value : null,
      put: (key, value, ttl = 600) => cacheStore.set(key, { value: String(value), expiry: clock.milliseconds + ttl * 1000 }),
      remove: key => cacheStore.delete(key),
    }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF-8" },
      getUuid: () => randomUUID(),
      computeDigest: (_algorithm, value) => signedBytes(createHash("sha256").update(bytes(value)).digest()),
      computeHmacSha256Signature: (value, key) => signedBytes(createHmac("sha256", bytes(key)).update(bytes(value)).digest()),
      base64Encode: value => bytes(value).toString("base64"),
      base64EncodeWebSafe: value => bytes(value).toString("base64url"),
      base64Decode: value => signedBytes(Buffer.from(value, "base64")),
      base64DecodeWebSafe: value => signedBytes(Buffer.from(value, "base64url")),
      newBlob: value => ({ getBytes: () => signedBytes(bytes(value)), getDataAsString: () => bytes(value).toString() }),
      formatDate: (value, timezone, pattern) => {
        const date = new RealDate(value.getTime());
        const offset = timezone === "Asia/Tokyo" ? 9 * 3600 * 1000 : 0;
        const iso = new RealDate(date.getTime() + offset).toISOString();
        const replacements = { yyyy: iso.slice(0, 4), MM: iso.slice(5, 7), dd: iso.slice(8, 10), HH: iso.slice(11, 13), mm: iso.slice(14, 16), ss: iso.slice(17, 19) };
        return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, part => replacements[part]).replace(/'/g, "");
      },
      sleep: () => {},
    },
  });
  vm.runInContext(code ?? readFileSync(CODE_PATH, "utf8"), context, { filename: CODE_PATH, timeout: 5000 });
  return {
    context, spreadsheet, writes, apiCalls, properties: propertyStore, logs, locks, clock,
    json(body) {
      const output = context.doPost({ postData: { contents: JSON.stringify(body), type: "text/plain" }, parameter: {}, parameters: {} });
      return JSON.parse(output.getContent());
    },
    raw(contents) {
      const output = context.doPost({ postData: { contents, type: "text/plain" }, parameter: {}, parameters: {} });
      return JSON.parse(output.getContent());
    },
    evaluate(expression) { return vm.runInContext(expression, context, { timeout: 5000 }); },
  };
}

const MATCHING_SHEET_ID = 286330650;
const KPI_SHEET_ID = 2007683505;
const SPREADSHEET_ID = "test-spreadsheet";
const PROTECTED_COLUMNS = [5, 14, 15, 16, 18, 19, 20];
const MATCHING_HEADERS = [
  "面談実施", "会社名", "候補者氏名（スペースなし）", "担当", "集計E", "担当ポジ", "ステータス", "提案完了日", "C面談予約獲得日", "C面談予定日", "C面談予定開始時刻", "ヨミ確度", "メモ", "集計N", "集計O", "集計P", "C面談実施日", "集計R", "集計S", "集計T", "クライアント側オファー日＝合格日", "候補者承諾日＝マッチ日", "稼働開始予定日", "稼働開始日", "離脱予定日", "離脱日",
];
const PLAYER_HEADERS = ["id", "name", "team", "color", "target", "bio", "sheetNames", "role", "active"];

function configProperties(overrides = {}) {
  return {
    NODE_CONFIG: JSON.stringify({ spreadsheetId: SPREADSHEET_ID, matchingSheetId: MATCHING_SHEET_ID, kpiSheetId: KPI_SHEET_ID, writesEnabled: true, ownerEmail: "owner@example.test", ...overrides }),
  };
}

function baseHarness(overrides = {}) {
  return createHarness({
    properties: configProperties(),
    sheets: [
      { id: MATCHING_SHEET_ID, name: "2期目マッチングDB", values: [MATCHING_HEADERS] },
      { id: KPI_SHEET_ID, name: "2期目月間KPI・KGI", values: [["KPI", "計算結果"], ["目標", 42]], formulas: [[], ["", "=COUNTA('2期目マッチングDB'!C:C)"]] },
      { id: 8001, name: "_NODE_players", values: [PLAYER_HEADERS, ["ADMIN", "社長", "NODE", "blue", 0, "", "[]", "admin", true], ["ND-001", "担当一", "NODE", "blue", 20, "本人bio", JSON.stringify(["担当一"]), "player", true], ["ND-002", "担当二", "NODE", "mint", 20, "他者bio", JSON.stringify(["担当二"]), "player", true]] },
      { id: 8002, name: "_NODE_operations", values: [["operationId", "actorId", "action", "payloadHash", "result", "committedAt"]] },
    ],
    ...overrides,
  });
}

function request(harness, action, payload = {}, { token, operationId, ...extra } = {}) {
  return harness.json({ version: 1, action, payload, ...(token ? { token } : {}), ...(operationId ? { operationId } : {}), ...extra });
}

function assertFailure(result) {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(typeof result.error?.code, "string");
  assert.equal(typeof result.error?.message, "string");
  assert.ok(!("data" in result), "Failed requests must not contain success data");
  return result.error;
}

function assertSuccess(result) {
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok("data" in result, "Successful requests must use the documented data envelope");
  return result.data;
}

function seedMatchingRows(harness) {
  const sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
  const records = [
    { owner: "担当一", candidate: "本人候補", company: "株式会社本人", memo: "本人メモ", id: "ROW-11111111-1111-4111-8111-111111111111", status: "提案完了（面談日確定待ち）" },
    { owner: "担当二", candidate: "他者秘密候補", company: "秘密クライアント", memo: "他者秘密メモ", id: "ROW-22222222-2222-4222-8222-222222222222", status: "提案完了（面談日確定待ち）" },
    { owner: "担当一", candidate: "本人候補", company: "株式会社別提案", memo: "別提案メモ", id: "ROW-33333333-3333-4333-8333-333333333333", status: "提案完了（面談日確定待ち）" },
    { owner: "担当一", candidate: "停止候補", company: "停止クライアント", memo: "停止メモ", id: "ROW-44444444-4444-4444-8444-444444444444", status: "提案候補", proposalDate: "停止" },
  ];
  records.forEach((record, index) => {
    const row = Array(26).fill("");
    Object.assign(row, { 0: "2026-10-04", 1: record.company, 2: record.candidate, 3: record.owner, 5: "FS", 6: record.status, 7: record.proposalDate ?? "2026-10-05", 12: record.memo });
    PROTECTED_COLUMNS.forEach(column => row[column - 1] = `=ROW()+${column}`);
    sheet.getRange(index + 2, 1, 1, 26).setValues([row]);
    sheet.getRange(index + 2, 1, 1, sheet.getMaxColumns()).addDeveloperMetadata("NODE_RECORD_ID", record.id);
    sheet.getRange(index + 2, 1, 1, sheet.getMaxColumns()).addDeveloperMetadata("NODE_SOURCE", `紹介元${index + 1}`);
  });
  harness.writes.length = 0;
  return records;
}

function authenticate(harness, id = "ND-001", password = "correct-test-password") {
  harness.properties.NODE_PEPPER ??= "test-pepper-keep-fixtures-out-of-production";
  const auth = harness.context.NODE_TESTS.makeAuth(password);
  harness.properties[`NODE_AUTH_${id}`] = JSON.stringify(auth);
  return assertSuccess(request(harness, "login", { id, password }));
}

function signedInFixture(options = {}) {
  const harness = baseHarness(options);
  const records = seedMatchingRows(harness);
  const player = authenticate(harness);
  const admin = authenticate(harness, "ADMIN");
  harness.writes.length = 0;
  harness.apiCalls.length = 0;
  return { harness, records, player, admin };
}

function newCandidate(overrides = {}) {
  return { id: "client-ignored-id", playerId: "ND-001", candidateId: "", candidateName: "新規本人候補", source: "本人入力の紹介元", company: "", position: "FS", stage: "候補者面談", date: "2026-10-07", status: "提案候補", memo: "本人入力メモ", ...overrides };
}

function mutate(harness, token, action, payload, operationId = randomUUID()) {
  return request(harness, action, payload, { token, operationId });
}

function rowWithCandidate(harness, name) {
  return harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values.find(row => row[2] === name);
}

function activityFor(snapshot, company = "株式会社本人") {
  const activity = snapshot.activities.find(activity => activity.company === company && activity.stage === "提案");
  assert.ok(activity, `Expected fixture proposal for ${company}`);
  assert.ok(activity.recordId, "Existing proposals must have a stable record ID");
  assert.ok(activity.rowVersion, "Existing proposals must have a revision for conflict detection");
  return activity;
}

test("doPost returns the error envelope for malformed JSON, unsupported version, and unknown actions", () => {
  const harness = baseHarness();
  for (const contents of ["not-json", "null", "[]", "{\"version\":99,\"action\":\"health\"}", "{\"version\":1,\"action\":\"executeAnything\"}"]) {
    assertFailure(harness.raw(contents));
  }
  assert.deepEqual(harness.writes, []);
  assert.deepEqual(harness.apiCalls, []);
});

test("unauthenticated requests cannot read private data, mutate rows, issue IDs, or choose an admin role", () => {
  const harness = baseHarness();
  const attempts = [
    ["snapshot", {}],
    ["snapshot", { role: "admin", playerId: "ADMIN" }],
    ["saveActivity", { activity: { playerId: "ND-001", candidateName: "秘密候補者", stage: "候補者面談", date: "2026-10-07" } }],
    ["updateStatus", { recordId: "ROW-other", status: "稼働開始", rowVersion: "forged" }],
    ["updateProfile", { player: { id: "ND-001", name: "偽の管理者", role: "admin" } }],
    ["createPlayer", { name: "新担当", team: "NODE", target: 20, sheetNames: [] }],
  ];
  for (const [action, payload] of attempts) {
    assertFailure(request(harness, action, payload, { operationId: randomUUID() }));
    assertFailure(request(harness, action, payload, { token: "forged-session", operationId: randomUUID() }));
  }
  assert.deepEqual(harness.writes, []);
  assert.deepEqual(harness.apiCalls, []);
});

test("login rejects wrong credentials without exposing user existence or credential hashes", () => {
  const harness = baseHarness();
  authenticate(harness);
  const wrong = assertFailure(request(harness, "login", { id: "ND-001", password: "incorrect-test-password" }));
  const missing = assertFailure(request(harness, "login", { id: "ND-999", password: "incorrect-test-password" }));
  assert.deepEqual(wrong, missing);
  assert.ok(!JSON.stringify(wrong).includes("NODE_AUTH"));
  assert.ok(!JSON.stringify(wrong).includes("salt"));
});

test("player snapshots and login data contain only that player's private activities; rankings include public counts", () => {
  const { harness, player, admin } = signedInFixture();
  for (const snapshot of [player.snapshot, assertSuccess(request(harness, "snapshot", {}, { token: player.token }))]) {
    assert.deepEqual(snapshot.self, { playerId: "ND-001", role: "player" });
    assert.ok(snapshot.activities.length > 0);
    assert.ok(snapshot.activities.every(activity => activity.playerId === "ND-001"));
    for (const secret of ["他者秘密候補", "秘密クライアント", "他者秘密メモ", "紹介元2"]) assert.ok(!JSON.stringify(snapshot).includes(secret), `Player response leaked ${secret}`);
    assert.equal(snapshot.players.length, 2, "Rankings expose player public fields without admin accounts");
    assert.ok(snapshot.players.every(person => !("hash" in person) && !("password" in person) && !("salt" in person)));
    assert.ok(snapshot.counts["2026-10"]["ND-002"]["提案"] > 0, "Ranking aggregation includes other players without their records");
  }
  assert.ok(admin.snapshot.activities.some(activity => activity.playerId === "ND-002"));
  assert.ok(JSON.stringify(admin.snapshot).includes("他者秘密候補"));
});

test("player cannot create accounts, update another player, or elevate its role", () => {
  const { harness, player } = signedInFixture();
  assertFailure(mutate(harness, player.token, "createPlayer", { name: "偽管理者", team: "NODE", target: 20, sheetNames: [] }));
  assertFailure(mutate(harness, player.token, "updateProfile", { player: { id: "ND-002", bio: "他者書換え" } }));
  const forged = mutate(harness, player.token, "updateProfile", { player: { id: "ND-001", name: "担当一", team: "NODE", target: 20, bio: "本人更新", role: "admin", active: true } });
  if (forged.ok) {
    assert.equal(forged.data.snapshot.self.role, "player");
  } else {
    assertFailure(forged);
  }
  const snapshot = assertSuccess(request(harness, "snapshot", { role: "admin", playerId: "ADMIN" }, { token: player.token }));
  assert.equal(snapshot.self.role, "player");
  assert.ok(snapshot.activities.every(activity => activity.playerId === "ND-001"));
});

test("logout and six-hour expiry invalidate sessions", () => {
  const { harness, player } = signedInFixture();
  assertSuccess(request(harness, "logout", {}, { token: player.token }));
  assertFailure(request(harness, "snapshot", {}, { token: player.token }));
  const fresh = authenticate(harness);
  harness.clock.milliseconds += 6 * 3600 * 1000 + 1;
  assertFailure(request(harness, "snapshot", {}, { token: fresh.token }));
});

test("disabled accounts cannot log in or continue using previously issued sessions", () => {
  const { harness, player } = signedInFixture();
  const row = harness.spreadsheet.getSheetByName("_NODE_players").values.find(person => person[0] === "ND-001");
  row[8] = false;
  assertFailure(request(harness, "login", { id: "ND-001", password: "correct-test-password" }));
  assertFailure(request(harness, "snapshot", {}, { token: player.token }));
});

test("repeated password failures are rate limited and never grant a session", () => {
  const harness = baseHarness();
  authenticate(harness);
  const codes = [];
  for (let index = 0; index < 12; index++) {
    codes.push(assertFailure(request(harness, "login", { id: "ND-001", password: "wrong-test-password" })).code);
  }
  assert.ok(codes.some(code => /RATE|LIMIT|TOO_MANY/i.test(code)), `Expected login rate limiting, received ${codes.join(", ")}`);
});

test("mutations require operation IDs and the write-enabled switch", () => {
  const { harness, player } = signedInFixture();
  assertFailure(request(harness, "saveActivity", { activity: newCandidate() }, { token: player.token }));
  assert.equal(harness.apiCalls.length, 0);
  harness.properties.NODE_CONFIG = JSON.stringify({ ...JSON.parse(harness.properties.NODE_CONFIG), writesEnabled: false });
  assertFailure(mutate(harness, player.token, "saveActivity", { activity: newCandidate() }));
  assert.equal(harness.apiCalls.length, 0);
  assert.ok(!rowWithCandidate(harness, "新規本人候補"));
});

test("a saved activity and its idempotency record commit once, and retries do not duplicate rows", () => {
  const { harness, player } = signedInFixture();
  const activity = newCandidate();
  const operationId = randomUUID();
  const first = assertSuccess(mutate(harness, player.token, "saveActivity", { activity }, operationId));
  assert.ok(first.snapshot.activities.some(item => item.candidateName === activity.candidateName));
  const successfulCalls = harness.apiCalls.length;
  const replay = assertSuccess(mutate(harness, player.token, "saveActivity", { activity }, operationId));
  assert.ok(replay.snapshot.activities.some(item => item.candidateName === activity.candidateName));
  assert.equal(harness.apiCalls.length, successfulCalls, "Replay must not issue another Google write");
  assert.equal(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values.filter(row => row[2] === activity.candidateName).length, 1);
  assert.equal(harness.spreadsheet.getSheetByName("_NODE_operations").values.filter(row => row[0] === operationId).length, 1);
  assertFailure(mutate(harness, player.token, "saveActivity", { activity: { ...activity, candidateName: "改竄候補" } }, operationId));
  assert.ok(!rowWithCandidate(harness, "改竄候補"));
});

test("another actor cannot retrieve a saved operation's private response by reusing its ID", () => {
  const { harness, player } = signedInFixture();
  const otherPlayer = authenticate(harness, "ND-002");
  const activity = newCandidate();
  const operationId = randomUUID();
  assertSuccess(mutate(harness, player.token, "saveActivity", { activity }, operationId));
  const attemptedReplay = mutate(harness, otherPlayer.token, "saveActivity", { activity }, operationId);
  assertFailure(attemptedReplay);
  assert.ok(!JSON.stringify(attemptedReplay).includes(activity.candidateName));
  assertFailure(mutate(harness, player.token, "updateProfile", { player: { id: "ND-001", bio: "異なる操作" } }, operationId));
});

test("atomic Google failure leaves both matching rows and operation ledger unchanged and allows retry", () => {
  const { harness, player } = signedInFixture();
  const beforeRows = clone(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values);
  const beforeOperations = clone(harness.spreadsheet.getSheetByName("_NODE_operations").values);
  const activity = newCandidate();
  const operationId = randomUUID();
  harness.spreadsheet.failure = operation => operation.sheet.name === "_NODE_operations";
  const error = assertFailure(mutate(harness, player.token, "saveActivity", { activity }, operationId));
  assert.ok(!error.message.includes("Injected"), "Internal Google errors must not leak provider detail");
  assert.deepEqual(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values, beforeRows);
  assert.deepEqual(harness.spreadsheet.getSheetByName("_NODE_operations").values, beforeOperations);
  assert.equal(harness.locks.held, false, "Failed requests must release their lock");
  harness.spreadsheet.failure = null;
  assertSuccess(mutate(harness, player.token, "saveActivity", { activity }, operationId));
  assert.equal(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values.filter(row => row[2] === activity.candidateName).length, 1);
});

test("lock contention rejects a mutation without changing data", () => {
  const { harness, player } = signedInFixture();
  const before = clone(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values);
  harness.locks.available = false;
  assertFailure(mutate(harness, player.token, "saveActivity", { activity: newCandidate() }));
  assert.deepEqual(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values, before);
  assert.equal(harness.apiCalls.length, 0);
});

test("JST today and valid calendar dates govern actual activity dates", () => {
  const { harness, player } = signedInFixture({ now: "2026-10-06T15:10:00.000Z" });
  const today = newCandidate({ date: "2026-10-07" });
  assertSuccess(mutate(harness, player.token, "saveActivity", { activity: today }));
  for (const date of ["2026-10-08", "2026-02-30", "2026-13-01", "not-a-date"]) {
    assertFailure(mutate(harness, player.token, "saveActivity", { activity: newCandidate({ candidateName: `無効日候補${date}`, date }) }));
  }
  assert.ok(!harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values.some(row => String(row[2]).startsWith("無効日候補")));
});

test("typed Sheet dates are interpreted in JST rather than the UTC calendar day", () => {
  const { harness, player } = signedInFixture();
  const row = rowWithCandidate(harness, "本人候補");
  row[0] = new Date("2026-10-03T15:00:00.000Z");
  row[7] = new Date("2026-10-04T15:00:00.000Z");
  const snapshot = assertSuccess(request(harness, "snapshot", {}, { token: player.token }));
  assert.equal(activityFor(snapshot).date, "2026-10-05");
  assert.ok(snapshot.activities.some(activity => activity.candidateName === "本人候補" && activity.stage === "候補者面談" && activity.date === "2026-10-04"));
});

test("future planned start dates are accepted without counting them as an actual start", () => {
  const { harness, player } = signedInFixture();
  const proposal = activityFor(player.snapshot);
  const activity = { ...proposal, id: "ignored-client-event", stage: "稼働開始予定", date: "2026-11-01", status: "稼働予定日確定（稼働開始待ち）" };
  const saved = assertSuccess(mutate(harness, player.token, "saveActivity", { activity }));
  assert.ok(saved.snapshot.activities.some(item => item.recordId === proposal.recordId && item.stage === "稼働開始予定" && item.date === "2026-11-01"));
  assert.equal(saved.snapshot.counts.all["ND-001"]["稼働開始"], player.snapshot.counts.all["ND-001"]["稼働開始"]);
});

test("saving a player-owned record preserves formula columns, KPI cells, and other proposals", () => {
  const { harness, player } = signedInFixture();
  const matching = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
  const formulas = clone(matching.formulas);
  const kpi = clone(harness.spreadsheet.getSheetById(KPI_SHEET_ID).values);
  const otherProposal = clone(rowWithCandidate(harness, "本人候補").slice());
  const proposal = activityFor(player.snapshot);
  const beforeOther = clone(matching.values.find(row => row[1] === "株式会社別提案"));
  assertSuccess(mutate(harness, player.token, "saveActivity", { activity: { ...proposal, stage: "クライアント面談", date: "2026-10-07", status: "面談実施（合否待ち）", memo: "追記済み" } }));
  assert.deepEqual(matching.formulas, formulas, "Existing formulas must remain byte-for-byte unchanged");
  assert.deepEqual(harness.spreadsheet.getSheetById(KPI_SHEET_ID).values, kpi);
  assert.deepEqual(matching.values.find(row => row[1] === "株式会社別提案"), beforeOther);
  assert.notDeepEqual(rowWithCandidate(harness, "本人候補"), otherProposal);
  for (const write of harness.writes.filter(write => write.sheetId === MATCHING_SHEET_ID)) {
    const writtenColumns = Array.from({ length: write.columns }, (_, index) => write.column + index);
    assert.ok(writtenColumns.every(column => !PROTECTED_COLUMNS.includes(column)), `Write touched protected column(s): ${writtenColumns}`);
  }
});

test("existing formulas in normally writable input columns cannot be overwritten", () => {
  const { harness, player } = signedInFixture();
  const sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
  sheet.getRange(2, 17).setFormula("=TODAY()");
  const snapshot = assertSuccess(request(harness, "snapshot", {}, { token: player.token }));
  const proposal = activityFor(snapshot);
  const before = clone(sheet.values);
  harness.writes.length = 0;
  assertFailure(mutate(harness, player.token, "saveActivity", { activity: { ...proposal, stage: "クライアント面談", date: "2026-10-07", status: "面談実施（合否待ち）" } }));
  assert.deepEqual(sheet.values, before);
  assert.equal(sheet.getRange(2, 17).getFormula(), "=TODAY()");
  assert.equal(harness.apiCalls.length, 0);
});

test("ownership is enforced for status updates and activity writes even with forged player IDs", () => {
  const { harness, player, admin } = signedInFixture();
  const other = activityFor(admin.snapshot, "秘密クライアント");
  const before = clone(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values);
  assertFailure(mutate(harness, player.token, "updateStatus", { recordId: other.recordId, rowVersion: other.rowVersion, status: "停止" }));
  assertFailure(mutate(harness, player.token, "saveActivity", { activity: { ...other, playerId: "ND-001", stage: "クライアント面談", date: "2026-10-07" } }));
  assertFailure(mutate(harness, player.token, "saveActivity", { activity: newCandidate({ playerId: "ND-002" }) }));
  assert.deepEqual(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values, before);
});

test("a stable record ID survives sheet row sorting and status changes affect only that proposal", () => {
  const { harness, player } = signedInFixture();
  const proposal = activityFor(player.snapshot);
  const sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
  const other = clone(sheet.values.find(row => row[1] === "株式会社別提案"));
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 26).sort({ column: 2, ascending: false });
  const saved = assertSuccess(mutate(harness, player.token, "updateStatus", { recordId: proposal.recordId, rowVersion: proposal.rowVersion, status: "辞退（本人希望）" }));
  assert.equal(sheet.values.find(row => row[1] === "株式会社本人")[6], "辞退（本人希望）");
  assert.deepEqual(sheet.values.find(row => row[1] === "株式会社別提案"), other);
  assert.ok(saved.snapshot.activities.filter(item => item.recordId === proposal.recordId).every(item => item.status === "辞退（本人希望）"));
});

test("a stale revision cannot overwrite an intervening spreadsheet edit", () => {
  const { harness, player } = signedInFixture();
  const proposal = activityFor(player.snapshot);
  const row = rowWithCandidate(harness, "本人候補");
  row[12] = "別担当によるシート直接更新";
  const before = clone(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values);
  assertFailure(mutate(harness, player.token, "updateStatus", { recordId: proposal.recordId, rowVersion: proposal.rowVersion, status: "停止" }));
  assert.deepEqual(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values, before);
});

test("formula-like user input is rejected before any Google write", () => {
  const { harness, player } = signedInFixture();
  for (const field of ["candidateName", "memo", "source", "position"]) {
    assertFailure(mutate(harness, player.token, "saveActivity", { activity: newCandidate({ [field]: '=IMPORTXML("https://example.test","//a")' }) }));
  }
  assert.equal(harness.apiCalls.length, 0);
});

test("changed or missing input headers fail closed rather than writing to a guessed column", () => {
  const { harness, player } = signedInFixture();
  harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values[0][2] = "新しい未知の候補者列";
  assertFailure(mutate(harness, player.token, "saveActivity", { activity: newCandidate() }));
  assert.equal(harness.apiCalls.length, 0);
});

test("non-date stop sentinels are excluded from stage and introduction totals", () => {
  const { harness, player } = signedInFixture();
  const initial = assertSuccess(request(harness, "snapshot", {}, { token: player.token }));
  assert.equal(initial.counts["2026-10"]["ND-001"]["提案"], 2);
  assert.equal(initial.counts["2026-10"]["ND-001"]["紹介人数"], 1, "Two proposals for one candidate count as one introduction");
  assert.ok(!initial.activities.some(activity => activity.candidateName === "停止候補" && activity.stage === "提案"));
  rowWithCandidate(harness, "本人候補")[7] = "停止";
  const stopped = assertSuccess(request(harness, "snapshot", {}, { token: player.token }));
  assert.equal(stopped.counts["2026-10"]["ND-001"]["提案"], 1);
  assert.equal(stopped.counts["2026-10"]["ND-001"]["紹介人数"], 1);
});

test("a missing explicit record ID fails instead of creating a replacement proposal or interview", () => {
  const { harness, player } = signedInFixture();
  const before = clone(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values);
  for (const stage of ["候補者面談", "提案"]) {
    assertFailure(mutate(harness, player.token, "saveActivity", { activity: newCandidate({ recordId: "ROW-deleted-record", candidateName: stage === "提案" ? "本人候補" : "削除行候補", company: stage === "提案" ? "株式会社新規" : "", stage }) }));
  }
  assert.deepEqual(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values, before);
  assert.equal(harness.apiCalls.length, 0);
});

test("admin issues server-assigned player IDs and replayable credentials without storing plaintext passwords in sheets", () => {
  const { harness, admin } = signedInFixture();
  const payload = { name: "新担当", team: "新チーム", target: 15, sheetNames: ["新担当シート名"], id: "ADMIN", role: "admin" };
  const operationId = randomUUID();
  const first = assertSuccess(mutate(harness, admin.token, "createPlayer", payload, operationId));
  assert.equal(first.credentials.id, "ND-003", "The client cannot choose account IDs");
  assert.ok(first.credentials.password.length >= 32);
  assert.ok(!JSON.stringify(harness.spreadsheet.sheets.map(sheet => sheet.values)).includes(first.credentials.password), "Sheet cells and operation history must not contain plaintext credentials");
  const newLogin = assertSuccess(request(harness, "login", { id: first.credentials.id, password: first.credentials.password }));
  assert.equal(newLogin.snapshot.self.role, "player", "New accounts cannot receive a client-specified admin role");
  assert.equal(newLogin.snapshot.self.playerId, first.credentials.id);
  assert.deepEqual(newLogin.snapshot.activities, []);
  const apiCalls = harness.apiCalls.length;
  const replay = assertSuccess(mutate(harness, admin.token, "createPlayer", payload, operationId));
  assert.deepEqual(replay.credentials, first.credentials);
  assert.equal(harness.apiCalls.length, apiCalls);
  const next = assertSuccess(mutate(harness, admin.token, "createPlayer", { name: "次担当", team: "NODE", target: 10, sheetNames: ["次担当"] }));
  assert.equal(next.credentials.id, "ND-004");
});

test("failed player creation cannot grant login and a retry commits one active account", () => {
  const { harness, admin } = signedInFixture();
  const operationId = randomUUID();
  const payload = { name: "障害時担当", team: "NODE", target: 20, sheetNames: ["障害時担当"] };
  harness.spreadsheet.failure = operation => operation.sheet.name === "_NODE_operations";
  assertFailure(mutate(harness, admin.token, "createPlayer", payload, operationId));
  const expectedPassword = harness.evaluate(`credentialPassword_("ADMIN", ${JSON.stringify(operationId)})`);
  assertFailure(request(harness, "login", { id: "ND-003", password: expectedPassword }));
  assert.equal(harness.spreadsheet.getSheetByName("_NODE_players").values.filter(row => row[0] === "ND-003").length, 0);
  harness.spreadsheet.failure = null;
  const saved = assertSuccess(mutate(harness, admin.token, "createPlayer", payload, operationId));
  assert.equal(saved.credentials.id, "ND-003");
  assertSuccess(request(harness, "login", { id: "ND-003", password: saved.credentials.password }));
  assert.equal(harness.spreadsheet.getSheetByName("_NODE_players").values.filter(row => row[0] === "ND-003").length, 1);
});

test("shared sheet-name aliases are rejected to prevent ambiguous ownership", () => {
  const { harness, admin } = signedInFixture();
  assertFailure(mutate(harness, admin.token, "createPlayer", { name: "重複担当", team: "NODE", target: 20, sheetNames: ["担 当 一"] }));
  assert.equal(harness.apiCalls.length, 0);
});

test("profile updates preserve role and aliases so renamed profiles keep existing activities", () => {
  const { harness, player } = signedInFixture();
  const before = clone(player.snapshot.activities);
  const profile = { id: "ND-001", name: "表示名変更", target: 25, bio: "本人が書いた紹介文", team: "権限外チーム", sheetNames: ["担当二"], role: "admin", active: false };
  const saved = assertSuccess(mutate(harness, player.token, "updateProfile", { player: profile }));
  const own = saved.snapshot.players.find(person => person.id === "ND-001");
  assert.equal(own.name, profile.name);
  assert.equal(own.target, 25);
  assert.equal(own.bio, profile.bio);
  assert.equal(own.team, "NODE");
  assert.deepEqual(own.sheetNames, ["担当一"]);
  assert.equal(saved.snapshot.self.role, "player");
  assert.deepEqual(saved.snapshot.activities, before);
});

test("an original spreadsheet ID cannot enable writes without copy verification and owner authorization", () => {
  const originalId = "1AnyvEoUtgUSTnuuJjIjA80XGHw_DaL9fSUoNCrYZ36s";
  const { harness, player } = signedInFixture({ spreadsheetId: originalId, properties: configProperties({ spreadsheetId: originalId, writesEnabled: true }) });
  assert.equal(player.snapshot.writesEnabled, false);
  assertFailure(mutate(harness, player.token, "saveActivity", { activity: newCandidate() }));
  assert.equal(harness.apiCalls.length, 0);
});

test("changing the configured business sheet to KPI fails closed", () => {
  const { harness, player } = signedInFixture();
  harness.properties.NODE_CONFIG = JSON.stringify({ ...JSON.parse(harness.properties.NODE_CONFIG), matchingSheetId: KPI_SHEET_ID });
  const before = clone(harness.spreadsheet.getSheetById(KPI_SHEET_ID).values);
  assertFailure(mutate(harness, player.token, "saveActivity", { activity: newCandidate() }));
  assert.equal(harness.apiCalls.length, 0);
  assert.deepEqual(harness.spreadsheet.getSheetById(KPI_SHEET_ID).values, before);
});

test("actual dates cannot precede earlier actual stages while planned dates do not constrain later actual dates", () => {
  const { harness, player } = signedInFixture();
  const proposal = activityFor(player.snapshot);
  assertFailure(mutate(harness, player.token, "saveActivity", { activity: { ...proposal, probability: undefined, stage: "クライアント面談", date: "2026-10-04" } }));
  assert.equal(harness.apiCalls.length, 0);
  const planned = assertSuccess(mutate(harness, player.token, "saveActivity", { activity: { ...proposal, probability: undefined, stage: "稼働開始予定", date: "2026-11-01" } }));
  const current = activityFor(planned.snapshot);
  const actual = assertSuccess(mutate(harness, player.token, "saveActivity", { activity: { ...current, probability: undefined, stage: "稼働開始", date: "2026-10-07" } }));
  assert.ok(actual.snapshot.activities.some(activity => activity.recordId === proposal.recordId && activity.stage === "稼働開始" && activity.date === "2026-10-07"));
});

function copyProofFixture(harness) {
  const sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
  const schemaHash = harness.context.schemaHash_(sheet);
  const proof = harness.context.NODE_TESTS.makeCopyProof(SPREADSHEET_ID, schemaHash, "owner@example.test");
  return { sheet, proof, schemaHash };
}

function resignProof(harness, proof) {
  const body = { ...proof }; delete body.signature;
  return { ...body, signature: harness.context.hmac_(harness.context.stableJson_(body), harness.properties.NODE_PEPPER) };
}

function originalAuthorizedFixture() {
  const originalId = "1AnyvEoUtgUSTnuuJjIjA80XGHw_DaL9fSUoNCrYZ36s";
  const fixture = signedInFixture({ spreadsheetId: originalId, properties: configProperties({ spreadsheetId: originalId, writesEnabled: true }) });
  const { harness } = fixture;
  const { proof } = copyProofFixture(harness);
  const authorizedAt = new Date(harness.clock.milliseconds).toISOString();
  const config = {
    ...JSON.parse(harness.properties.NODE_CONFIG), originalWriteVerified: true, verifiedCopyId: proof.copyId, originalAuthorizedAt: authorizedAt,
    originalAuthorizationSeal: harness.context.NODE_TESTS.originalAuthorization(proof, "owner@example.test", authorizedAt),
  };
  harness.properties.NODE_COPY_PROOF = JSON.stringify(proof);
  harness.properties.NODE_CONFIG = JSON.stringify(config);
  return { ...fixture, proof, config };
}

test("copy verification proof requires a valid signature, owner, sheet IDs, checks, and recent verification", () => {
  const { harness } = signedInFixture();
  const { proof } = copyProofFixture(harness);
  const valid = candidate => harness.context.NODE_TESTS.validCopyProof(candidate, "owner@example.test");
  assert.equal(valid(proof), true);
  for (const candidate of [null, {}, { ...proof, signature: "forged-signature" }, { ...proof, schemaHash: "tampered-schema" }]) assert.equal(valid(candidate), false);
  const invalidFields = [
    { copyId: proof.originalId }, { originalId: "different-original" }, { matchingSheetId: KPI_SHEET_ID }, { kpiSheetId: MATCHING_SHEET_ID },
    { ownerEmail: "other-owner@example.test" }, { checks: proof.checks.filter(check => check !== "cleanup") }, { verifiedAt: "invalid-date" },
    { verifiedAt: new Date(harness.clock.milliseconds + 1).toISOString() }, { verifiedAt: new Date(harness.clock.milliseconds - 7 * 86400000 - 1).toISOString() },
  ];
  for (const fields of invalidFields) assert.equal(valid(resignProof(harness, { ...proof, ...fields })), false, JSON.stringify(fields));
  assert.equal(harness.context.NODE_TESTS.validCopyProof(proof, "other-owner@example.test"), false);
  assert.deepEqual(harness.apiCalls, [], "Proof validation must not write or run probes on original data");
});

test("original migration readiness requires proof for the configured copy and an identical original header", () => {
  const { harness } = signedInFixture();
  const { proof, sheet } = copyProofFixture(harness);
  const config = JSON.parse(harness.properties.NODE_CONFIG);
  const ready = (overrides = {}, candidate = proof, target = sheet, owner = "owner@example.test") => harness.context.NODE_TESTS.verifyOriginalReadiness({ ...config, ...overrides }, candidate, target, owner);
  assert.equal(ready(), true);
  for (const fields of [{ spreadsheetId: "different-copy" }, { spreadsheetId: proof.originalId }, { matchingSheetId: KPI_SHEET_ID }, { kpiSheetId: MATCHING_SHEET_ID }]) assert.throws(() => ready(fields));
  assert.throws(() => ready({}, null));
  assert.throws(() => ready({}, proof, sheet, "other-owner@example.test"));
  assert.throws(() => ready({}, proof, harness.spreadsheet.getSheetById(KPI_SHEET_ID)));
  const oldHeader = sheet.values[0][12];
  sheet.values[0][12] = "メモ列の変更";
  assert.throws(() => ready());
  sheet.values[0][12] = oldHeader;
  assert.equal(ready(), true);
  assert.deepEqual(harness.apiCalls, []);
});

test("original writes require both signed copy proof and a signed owner migration authorization", () => {
  const { harness, player, config, proof } = originalAuthorizedFixture();
  const enabled = candidate => harness.context.NODE_TESTS.writesEnabled(candidate);
  assert.equal(enabled(config), true);
  for (const fields of [
    { writesEnabled: false }, { originalWriteVerified: false }, { originalAuthorizedAt: "" }, { originalAuthorizedAt: "invalid-date" },
    { originalAuthorizationSeal: "forged" }, { verifiedCopyId: "unverified-copy" }, { ownerEmail: "other-owner@example.test" },
    { originalAuthorizedAt: new Date(Date.parse(proof.verifiedAt) + 7 * 86400000 + 1).toISOString() },
  ]) assert.equal(enabled({ ...config, ...fields }), false, JSON.stringify(fields));
  for (const storedProof of [null, "not-json", JSON.stringify({ ...proof, signature: "forged" })]) {
    if (storedProof === null) delete harness.properties.NODE_COPY_PROOF; else harness.properties.NODE_COPY_PROOF = storedProof;
    assert.equal(enabled(config), false);
  }
  harness.properties.NODE_COPY_PROOF = JSON.stringify(proof);
  const saved = assertSuccess(mutate(harness, player.token, "saveActivity", { activity: newCandidate() }));
  assert.equal(saved.snapshot.writesEnabled, true);
  assert.ok(saved.snapshot.activities.some(activity => activity.candidateName === "新規本人候補"));
  assert.equal(harness.apiCalls.length, 1, "Only the authorized application mutation runs in the mock; no original-sheet probe is executed");
});

test("a completed original migration stays authorized after the copy-proof migration window expires", () => {
  const { harness, config } = originalAuthorizedFixture();
  harness.clock.milliseconds += 8 * 86400000;
  assert.equal(harness.context.NODE_TESTS.validCopyProof(JSON.parse(harness.properties.NODE_COPY_PROOF), config.ownerEmail), false, "Expired proofs cannot authorize new migrations");
  assert.equal(harness.context.NODE_TESTS.writesEnabled(config), true, "An owner-authorized production connection must not unexpectedly stop one week later");
});

test("web requests cannot call owner-only verification or original-migration setup functions", () => {
  const { harness, admin } = signedInFixture();
  for (const action of ["verifyNodeCopyIntegration", "enableNodeOriginalAfterVerifiedCopy", "setupNode", "enableNodeWritesForCopy", "rotateNodePassword"]) assertFailure(request(harness, action, {}, { token: admin.token, operationId: randomUUID() }));
  assert.deepEqual(harness.apiCalls, []);
});

test("all 19 mapped input headers must match their explicit labels and fixed positions", () => {
  const { harness } = signedInFixture();
  const mapped = harness.context.NODE_TESTS.mappedHeadersMatch;
  assert.equal(mapped(MATCHING_HEADERS), true);
  for (const column of harness.context.NODE_TESTS.constants.inputColumns) {
    const changed = [...MATCHING_HEADERS];
    changed[column - 1] = `${changed[column - 1]}未知の追記`;
    assert.equal(mapped(changed), false, `A familiar prefix must not authorize changed column ${column}`);
  }
  const observedHeaders = [...MATCHING_HEADERS];
  observedHeaders[8] = "C面談予約獲得日（アポ獲得日）";
  observedHeaders[16] = "C面談実施日、実施したら入力";
  assert.equal(mapped(observedHeaders), true, "The two labels observed on the actual Sheet are explicitly supported");
});

test("valid primary headers cannot hide swapped or unknown secondary columns; all mutations fail closed", () => {
  const { harness, player, admin } = signedInFixture();
  const sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
  const proposal = activityFor(player.snapshot);
  const mutations = [
    [player.token, "saveActivity", { activity: newCandidate() }],
    [player.token, "updateStatus", { recordId: proposal.recordId, rowVersion: proposal.rowVersion, status: "辞退（本人希望）" }],
    [player.token, "updateProfile", { player: { ...player.snapshot.players.find(person => person.id === "ND-001"), bio: "変更不可" } }],
    [admin.token, "createPlayer", { name: "追加不可", team: "NODE", target: 20, sheetNames: ["追加不可"] }],
  ];
  const variants = [];
  const swapped = [...MATCHING_HEADERS];
  [swapped[8], swapped[16]] = [swapped[16], swapped[8]];
  variants.push(swapped);
  for (const column of harness.context.NODE_TESTS.constants.inputColumns.filter(column => column > 4)) {
    const unknown = [...MATCHING_HEADERS]; unknown[column - 1] = `未知の入力列${column}`; variants.push(unknown);
  }
  for (const header of variants) {
    sheet.values[0] = header;
    assert.equal(harness.context.NODE_TESTS.detectHeader(sheet.values), 1, "The four table-identification headers remain valid");
    const snapshot = assertSuccess(request(harness, "snapshot", {}, { token: player.token }));
    assert.equal(snapshot.writesEnabled, false);
    assert.deepEqual(snapshot.activities, []);
    assert.equal(snapshot.counts.all["ND-001"]["提案"], 0);
    assert.ok(snapshot.warnings.some(message => message.includes("19列")));
    for (const [token, action, payload] of mutations) {
      assert.equal(assertFailure(mutate(harness, token, action, payload)).code, "SCHEMA_MISMATCH");
    }
  }
  assert.deepEqual(harness.writes, []);
  assert.deepEqual(harness.apiCalls, []);
});

test("explicitly supported observed header annotations preserve data visibility and save eligibility", () => {
  const { harness, player } = signedInFixture();
  const header = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values[0];
  header[8] = "C面談予約獲得日（アポ獲得日）";
  header[16] = "C面談実施日、実施したら入力";
  const snapshot = assertSuccess(request(harness, "snapshot", {}, { token: player.token }));
  assert.equal(snapshot.writesEnabled, true);
  assert.deepEqual(snapshot.activities, player.snapshot.activities);
  assertSuccess(mutate(harness, player.token, "saveActivity", { activity: newCandidate() }));
});

test("owner cannot enable copy writes or authorize original migration with incompatible mapped headers", () => {
  const { harness } = signedInFixture();
  const sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
  sheet.values[0][16] = "C面談実施日未知の説明";
  const config = { ...JSON.parse(harness.properties.NODE_CONFIG), writesEnabled: false };
  harness.properties.NODE_CONFIG = JSON.stringify(config);
  assert.throws(() => harness.context.enableNodeWritesForCopy(), error => error.nodeCode === "SCHEMA_MISMATCH");
  assert.equal(JSON.parse(harness.properties.NODE_CONFIG).writesEnabled, false);
  const { proof } = copyProofFixture(harness);
  assert.throws(() => harness.context.NODE_TESTS.verifyOriginalReadiness(config, proof, sheet, "owner@example.test"), error => error.nodeCode === "SCHEMA_MISMATCH", "A signed schema hash alone cannot approve an unsupported mapped header");
  assert.deepEqual(harness.apiCalls, []);
});

test("omitting an activity memo preserves the existing sheet memo and does not write M", () => {
  const { harness, player } = signedInFixture();
  const proposal = activityFor(player.snapshot);
  const saved = assertSuccess(mutate(harness, player.token, "saveActivity", { activity: { ...proposal, stage: "クライアント面談", date: "2026-10-07", memo: undefined } }));
  assert.equal(rowWithCandidate(harness, "本人候補")[12], "本人メモ");
  assert.ok(saved.snapshot.activities.filter(activity => activity.recordId === proposal.recordId).every(activity => activity.memo === "本人メモ"));
  assert.ok(!harness.writes.some(write => write.sheetId === MATCHING_SHEET_ID && write.column <= 13 && write.column + write.columns > 13), "M is not part of the write when the user has not edited the memo");
});

test("an explicit empty activity memo clears M rather than being treated as omitted", () => {
  const { harness, player } = signedInFixture();
  const proposal = activityFor(player.snapshot);
  const saved = assertSuccess(mutate(harness, player.token, "saveActivity", { activity: { ...proposal, stage: "クライアント面談", date: "2026-10-07", memo: "" } }));
  assert.equal(rowWithCandidate(harness, "本人候補")[12], "");
  assert.ok(saved.snapshot.activities.filter(activity => activity.recordId === proposal.recordId).every(activity => activity.memo === ""));
});

test("non-string activity memos are rejected without clearing existing notes or writing Google data", () => {
  const { harness, player } = signedInFixture();
  const proposal = activityFor(player.snapshot);
  const before = clone(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values);
  for (const memo of [null, 0, false, [], {}]) {
    const error = assertFailure(mutate(harness, player.token, "saveActivity", { activity: { ...proposal, stage: "クライアント面談", date: "2026-10-07", memo } }));
    assert.equal(error.code, "VALIDATION");
  }
  assert.deepEqual(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values, before);
  assert.deepEqual(harness.apiCalls, []);
});

test("many different unknown login IDs share one bounded rate bucket", () => {
  const { harness } = signedInFixture();
  const initialPropertyCount = Object.keys(harness.properties).length;
  const codes = [];
  for (let index = 0; index < 100; index++) {
    codes.push(assertFailure(request(harness, "login", { id: `UNKNOWN-${index}`, password: "incorrect-password" })).code);
  }
  const buckets = Object.keys(harness.properties).filter(key => key.startsWith("NODE_RATE_"));
  assert.deepEqual(buckets, ["NODE_RATE_UNKNOWN"], "Untrusted IDs cannot each consume a script property");
  assert.ok(Object.keys(harness.properties).length <= initialPropertyCount + 2);
  assert.ok(codes.slice(0, 5).every(code => code === "INVALID_CREDENTIALS"));
  assert.ok(codes.slice(5).every(code => code === "RATE_LIMITED"), "Changing an unknown ID cannot bypass its shared login rate limit");
  assert.deepEqual(harness.apiCalls, []);
});

test("known accounts retain separate rate limits and successful login clears only the matching bucket", () => {
  const { harness } = signedInFixture();
  authenticate(harness, "ND-002");
  for (let index = 0; index < 5; index++) assert.equal(assertFailure(request(harness, "login", { id: "ND-001", password: "incorrect-password" })).code, "INVALID_CREDENTIALS");
  assert.equal(assertFailure(request(harness, "login", { id: "ND-001", password: "incorrect-password" })).code, "RATE_LIMITED");
  assert.equal(assertFailure(request(harness, "login", { id: "ND-002", password: "incorrect-password" })).code, "INVALID_CREDENTIALS");
  assert.equal(assertFailure(request(harness, "login", { id: "UNKNOWN-ONE", password: "incorrect-password" })).code, "INVALID_CREDENTIALS");
  const otherLogin = assertSuccess(request(harness, "login", { id: "ND-002", password: "correct-test-password" }));
  assert.equal(otherLogin.snapshot.self.playerId, "ND-002");
  assert.ok(harness.properties[`NODE_RATE_${harness.context.NODE_TESTS.hash("ND-001")}`]);
  assert.equal(harness.properties[`NODE_RATE_${harness.context.NODE_TESTS.hash("ND-002")}`], undefined);
  assert.ok(harness.properties.NODE_RATE_UNKNOWN);
});
