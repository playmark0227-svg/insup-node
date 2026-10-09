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
  getValues() { this.sheet.spreadsheet.beforeRead(this, "getValues"); return this.matrix(this.sheet.values); }
  getDisplayValues() { return this.getValues().map(row => row.map(value => String(value ?? ""))); }
  getValue() { return this.getValues()[0][0]; }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }
  getFormulas() { this.sheet.spreadsheet.beforeRead(this, "getFormulas"); return this.matrix(this.sheet.formulas); }
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
        const rule = this.sheet.validations[`${index + 1},${column + 1}`];
        if (present(value) && rule?.strict && rule.condition?.type === "ONE_OF_LIST" && !rule.condition.values.some(option => option.userEnteredValue === value)) throw new Error("Strict dropdown rejected test value");
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
    const protection = { range: this, setDescription() { return this; }, setWarningOnly() { return this; }, addEditor() { return this; }, getEditors() { return []; }, canDomainEdit() { return false; } };
    this.sheet.protections.push(protection);
    return protection;
  }
}

class MockSheet {
  constructor(spreadsheet, { id, name, values = [], formulas = [] }) {
    Object.assign(this, { spreadsheet, id, name, values: clone(values), formulas: clone(formulas), validations: {}, formats: {}, maxRows: Math.max(1000, values.length), protections: [], hidden: false });
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
    const rows = Array.from(this.values, (row, index) => row?.some(present) || this.formulas[index]?.some(present) ? index + 1 : 0);
    return Math.max(0, ...rows);
  }
  getLastColumn() { return Math.max(0, ...this.values.filter(Boolean).map(row => row.reduce((last, value, index) => present(value) ? index + 1 : last, 0)), ...this.formulas.filter(Boolean).map(row => row.length)); }
  getMaxRows() { return Math.max(this.maxRows, this.values.length); }
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
    this.id = id; this.sheets = sheets.map(sheet => new MockSheet(this, sheet)); this.writes = writes; this.reads = []; this.failure = null; this.metadata = []; this.nextMetadataId = 1;
  }
  beforeRead(range, method) {
    const read = { method, sheetId: range.sheet.id, row: range.row, column: range.column, rows: range.rows, columns: range.columns };
    this.reads.push(read);
    this.readObserver?.(read);
  }
  beforeWrite(operation) {
    if (this.failure?.(operation)) throw new Error("Injected spreadsheet write failure");
    this.writes.push({ sheetId: operation.sheet.id, sheetName: operation.sheet.name, row: operation.range?.row, column: operation.range?.column, rows: operation.range?.rows, columns: operation.range?.columns, values: clone(operation.values), formula: operation.formula, deletion: operation.deletion });
  }
  getId() { return this.id; }
  getName() { return "test management spreadsheet"; }
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
    const saved = this.sheets.map(sheet => ({ sheet, values: clone(sheet.values), formulas: clone(sheet.formulas), validations: clone(sheet.validations), maxRows: sheet.maxRows }));
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
              const format = cell.userEnteredFormat?.numberFormat?.type ?? sheet.formats[`${row+cells.indexOf(entry)},${column+i}`]?.numberFormat?.type;
              if (typeof value.numberValue === "number" && ["DATE", "DATE_TIME", "TIME"].includes(format)) {
                return new Date((value.numberValue - 25569) * 86400000 - 9 * 3600 * 1000);
              }
              return value.stringValue ?? value.numberValue ?? value.boolValue ?? value.formulaValue ?? "";
            }));
            sheet.getRange(row, column, values.length, maxColumns).setValues(values);
            cells.forEach((entry, r) => (entry.values ?? []).forEach((cell, c) => {
              sheet.formulas[row + r - 1][column + c - 1] = cell.userEnteredValue?.formulaValue ?? "";
              if(cell.userEnteredFormat)sheet.formats[`${row+r},${column+c}`]=clone(cell.userEnteredFormat);
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
        } else if (request.appendDimension) {
          const input = request.appendDimension, sheet = this.getSheetById(input.sheetId), previous = Math.max(sheet.maxRows, sheet.values.length);
          assert.equal(input.dimension, "ROWS");
          sheet.maxRows = previous + input.length;
          for (let row = previous + 1; row <= sheet.maxRows; row++) for (let column = 1; column <= sheet.getMaxColumns(); column++) {
            const inherited = sheet.validations[`${previous},${column}`];
            if (inherited) sheet.validations[`${row},${column}`] = clone(inherited);
          }
          replies.push({});
        } else if (request.setDataValidation) {
          const { range, rule } = request.setDataValidation, sheet = this.getSheetById(range.sheetId);
          for (let row = range.startRowIndex + 1; row <= range.endRowIndex; row++) for (let column = range.startColumnIndex + 1; column <= range.endColumnIndex; column++) {
            if (rule) sheet.validations[`${row},${column}`] = clone(rule); else delete sheet.validations[`${row},${column}`];
          }
          replies.push({});
        } else if (request.deleteDeveloperMetadata) {
          const lookup = request.deleteDeveloperMetadata.dataFilter?.developerMetadataLookup;
          assert.ok(Number.isInteger(lookup?.metadataId));
          this.metadata = this.metadata.filter(item => item.id !== lookup.metadataId);
          replies.push({});
        } else {
          throw new Error(`Unsupported mock Sheets request: ${Object.keys(request).join(",")}`);
        }
      }
      return { status: 200, body: JSON.stringify({ spreadsheetId: this.id, replies }) };
    } catch (error) {
      saved.forEach(({ sheet, values, formulas, validations, maxRows }) => Object.assign(sheet, { values, formulas, validations, maxRows }));
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
  const metadataReads = [];
  const sheetReads = [];
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
    Sheets: { Spreadsheets: { get: (id, options) => {
      sheetReads.push({ spreadsheetId: id, options: clone(options) });
      const book = context.SpreadsheetApp.openById(id);
      if(options.ranges){return {sheets:options.ranges.map(range=>{
        const match=range.match(/^'(.+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);assert.ok(match,range);const sheet=book.getSheetByName(match[1].replace(/''/g,"'")),start=Number(match[3]),end=Number(match[5]),width=columnNumber(match[4]);
        return {properties:{sheetId:sheet.id},data:[{startRow:start-1,startColumn:0,rowData:Array.from({length:end-start+1},(_,i)=>({values:Array.from({length:width},(_,j)=>{
          const v=sheet.values[start+i-1]?.[j]??"",f=sheet.formulas[start+i-1]?.[j],key=`${start+i},${j+1}`,fmt=sheet.formats[key];
          const raw=f?{formulaValue:f}:v instanceof Date?{numberValue:(v.getTime()+9*3600*1000)/86400000+25569}:typeof v==="number"?{numberValue:v}:typeof v==="boolean"?{boolValue:v}:v!==""?{stringValue:v}:{};
          return {userEnteredValue:raw,formattedValue:String(v),...(sheet.validations[key]?{dataValidation:clone(sheet.validations[key])}:{}),...(fmt?{userEnteredFormat:clone(fmt)}:{})};
        })}))}]};
      })};}
      return { sheets: book.getSheets().map(sheet => ({ properties: { sheetId: sheet.id, gridProperties: { rowCount: Math.max(sheet.maxRows, sheet.values.length) } } })) };
    }, DeveloperMetadata: { search: (body, id) => {
      metadataReads.push({ spreadsheetId: id, body: clone(body) });
      const book = context.SpreadsheetApp.openById(id);
      return { matchedDeveloperMetadata: book.metadata.filter(item => body.dataFilters.some(filter => {
        const lookup = filter.developerMetadataLookup;
        return item.key === lookup.metadataKey && (lookup.locationType !== "ROW" || item.row);
      })).map(item => ({ developerMetadata: {
        metadataId: item.id, metadataKey: item.key, metadataValue: item.value, visibility: item.visibility,
        location: item.row ? { locationType: "ROW", dimensionRange: { sheetId: item.sheet.id, dimension: "ROWS", startIndex: item.row - 1, endIndex: item.row } } : { locationType: "SHEET", sheetId: item.sheet.id },
      } })) };
    } } } },
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
    context, spreadsheet, writes, apiCalls, metadataReads, sheetReads, properties: propertyStore, logs, locks, clock,
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
    NODE_DESTINATION_ID: "test-destination",
    NODE_VERIFICATION_ID: SPREADSHEET_ID,
    NODE_CONFIG: JSON.stringify({ spreadsheetId: SPREADSHEET_ID, matchingSheetId: MATCHING_SHEET_ID, kpiSheetId: KPI_SHEET_ID, purpose: "verification", writesEnabled: true, ownerEmail: "owner@example.test", ...overrides }),
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

test("row metadata uses one bulk read for 214 entries without remote per-entry getters", () => {
  const harness = baseHarness(), sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
  for (let row = 2; row <= 215; row++) sheet.getRange(row, 1, 1, 26).addDeveloperMetadata("NODE_RECORD_ID", `record-${row}`);
  sheet.createDeveloperMetadataFinder = () => { throw new Error("Per-entry metadata reads must not be used"); };
  for (const item of harness.spreadsheet.metadata) {
    item.getLocation = item.getValue = item.getId = () => { throw new Error("Remote getter must not be used"); };
  }
  const result = harness.context.metadataMap_(sheet, "NODE_RECORD_ID");
  assert.equal(Object.keys(result).length, 214);
  assert.equal(result[215].value, "record-215");
  assert.equal(result[215].metadataId, harness.spreadsheet.metadata.at(-1).id);
  assert.deepEqual(harness.metadataReads, [{ spreadsheetId: SPREADSHEET_ID, body: { dataFilters: [{ developerMetadataLookup: { metadataKey: "NODE_RECORD_ID", locationType: "ROW" } }] } }]);
  assert.deepEqual(harness.apiCalls, []);
  harness.spreadsheet.metadata[0].row = 300;
  const refreshed = harness.context.metadataMap_(sheet, "NODE_RECORD_ID");
  assert.equal(refreshed[2], undefined);
  assert.equal(refreshed[300].value, "record-2", "Row moves must be reread instead of cached");
});

test("bulk metadata handles first row and sheet zero, ignores other locations, and rejects duplicates", () => {
  const harness = createHarness({ sheets: [{ id: 0, name: "target" }, { id: 99, name: "other" }] });
  const sheet = harness.spreadsheet.getSheetById(0);
  const item = { metadataId: 1, metadataKey: "NODE_RECORD_ID", metadataValue: "first", location: { dimensionRange: { sheetId: 0, dimension: "ROWS", endIndex: 1 } } };
  const entries = [item, { ...item, metadataId: 2, location: { dimensionRange: { sheetId: 99, dimension: "ROWS", endIndex: 1 } } }, { ...item, metadataId: 3, location: { sheetId: 0 } }, { ...item, metadataId: 4, metadataKey: "NODE_SOURCE" }];
  harness.context.Sheets.Spreadsheets.DeveloperMetadata.search = () => ({ matchedDeveloperMetadata: entries.map(developerMetadata => ({ developerMetadata })) });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.context.metadataMap_(sheet, "NODE_RECORD_ID"))), { 1: { value: "first", metadataId: 1 } });
  entries.push({ ...item, metadataId: 5 });
  assert.throws(() => harness.context.metadataMap_(sheet, "NODE_RECORD_ID"), error => error.nodeCode === "METADATA_CONFLICT");
});

test("metadata lookup failure blocks business writes without treating an unreadable map as empty", () => {
  const { harness, player } = signedInFixture();
  harness.context.Sheets.Spreadsheets.DeveloperMetadata.search = () => { throw new Error("private upstream details"); };
  const error = assertFailure(mutate(harness, player.token, "saveActivity", { activity: newCandidate() }));
  assert.equal(error.code, "SHEET_READ_FAILED");
  assert.ok(!error.message.includes("private upstream details"));
  assert.deepEqual(harness.writes, []);
  assert.deepEqual(harness.apiCalls, []);
});

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

test("session-only login reads only fresh account rows and bad passwords never open a spreadsheet", () => {
  const harness = baseHarness();
  harness.properties.NODE_PEPPER = "test-pepper";
  harness.properties["NODE_AUTH_ND-001"] = JSON.stringify(harness.context.makeAuth_("test-password"));
  const opening = harness.context.SpreadsheetApp.openById;
  harness.context.SpreadsheetApp.openById = () => { throw new Error("Bad passwords must not access Sheets"); };
  assert.equal(assertFailure(request(harness, "login", { id: "ND-001", password: "wrong" })).code, "INVALID_CREDENTIALS");
  assert.equal(assertFailure(request(harness, "login", { id: "UNKNOWN", password: "wrong" })).code, "INVALID_CREDENTIALS");
  harness.context.SpreadsheetApp.openById = opening;
  const propertyApi = harness.context.PropertiesService.getScriptProperties(), setProperty = propertyApi.setProperty;
  propertyApi.setProperty = function(key, value) {
    if (key === "NODE_LOGIN_RATE" || key.startsWith("NODE_SESSION_")) assert.equal(harness.locks.held, true, "Rate increments and session issuance keep their write lock");
    return setProperty.call(this, key, value);
  };
  harness.spreadsheet.readObserver = read => {
    assert.equal(read.sheetId, 8001, "Authentication must not load matching/KPI/operations data");
    assert.equal(harness.locks.held, true, "Fresh account validation and session issuance remain atomic");
  };
  const result = assertSuccess(request(harness, "login", { id: "nd-001", password: "test-password", sessionOnly: true, role: "admin" }));
  assert.deepEqual(Object.keys(result), ["token"]);
  assert.match(result.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.parse(harness.properties[harness.context.sessionKey_(result.token)]).id, "ND-001");
  assert.equal(harness.spreadsheet.reads.length, 1);
  assert.deepEqual(harness.metadataReads, []);
  assert.deepEqual(harness.writes, []);
  const account = harness.spreadsheet.getSheetByName("_NODE_players").values.find(row => row[0] === "ND-001");
  account[8] = false;
  assert.equal(assertFailure(request(harness, "login", { id: "ND-001", password: "test-password", sessionOnly: true })).code, "INVALID_CREDENTIALS");
  assert.equal(Object.keys(harness.properties).filter(key => key.startsWith("NODE_SESSION_")).length, 1, "Disabled accounts do not allocate another token");
});

test("a session-only login survives a later data read failure and the same token can retry", () => {
  const harness = baseHarness();
  seedMatchingRows(harness);
  harness.properties.NODE_PEPPER = "test-pepper";
  harness.properties["NODE_AUTH_ND-001"] = JSON.stringify(harness.context.makeAuth_("test-password"));
  const login = assertSuccess(request(harness, "login", { id: "ND-001", password: "test-password", sessionOnly: true }));
  const lookup = harness.context.Sheets.Spreadsheets.DeveloperMetadata.search;
  harness.context.Sheets.Spreadsheets.DeveloperMetadata.search = () => { throw new Error("Temporary Sheets outage"); };
  assert.equal(assertFailure(request(harness, "snapshot", {}, { token: login.token })).code, "SHEET_READ_FAILED");
  assert.ok(harness.properties[harness.context.sessionKey_(login.token)], "A transport/data failure does not revoke a valid session");
  harness.context.Sheets.Spreadsheets.DeveloperMetadata.search = lookup;
  assert.equal(assertSuccess(request(harness, "snapshot", {}, { token: login.token })).self.role, "player");
});

test("legacy login deletes its unreturned token if its data read fails", () => {
  const harness = baseHarness();
  harness.properties.NODE_PEPPER = "test-pepper";
  harness.properties["NODE_AUTH_ND-001"] = JSON.stringify(harness.context.makeAuth_("test-password"));
  harness.context.Sheets.Spreadsheets.DeveloperMetadata.search = () => { throw new Error("Temporary Sheets outage"); };
  assert.equal(assertFailure(request(harness, "login", { id: "ND-001", password: "test-password" })).code, "SHEET_READ_FAILED");
  assert.equal(Object.keys(harness.properties).some(key => key.startsWith("NODE_SESSION_")), false);
});

test("legacy login releases its lock before business reads and snapshots do not wait for a writer", () => {
  const harness = baseHarness();
  seedMatchingRows(harness);
  let businessReads = 0;
  harness.spreadsheet.readObserver = read => {
    if (read.sheetId === MATCHING_SHEET_ID) {
      businessReads++;
      assert.equal(harness.locks.held, false, "The large business read must never serialize player logins");
    }
  };
  const player = authenticate(harness);
  assert.ok(player.snapshot.activities.length > 0, "The existing token+snapshot contract is retained");
  assert.ok(businessReads > 0);
  const before = harness.locks.calls;
  harness.locks.available = false;
  assertSuccess(request(harness, "snapshot", {}, { token: player.token }));
  assert.equal(harness.locks.calls, before, "An independent read does not acquire the script-wide write lock");
  assert.equal(assertFailure(mutate(harness, player.token, "saveActivity", { activity: newCandidate() })).code, "BUSY");
  assert.deepEqual(harness.writes, []);
});

test("read-only snapshots trim formula-only template rows without changing activities or revisions", () => {
  const { harness, player } = signedInFixture();
  const sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
  sheet.values[214] = clone(sheet.values[1]);
  sheet.values[214][2] = "最終候補";
  sheet.formulas[214] = clone(sheet.formulas[1]);
  sheet.getRange(215, 1, 1, 26).addDeveloperMetadata("NODE_RECORD_ID", "ROW-LAST");
  sheet.getRange(215, 1, 1, 26).addDeveloperMetadata("NODE_SOURCE", "最終紹介元");
  sheet.values[215] = clone(sheet.values[1]);
  sheet.values[215][2] = "未知担当候補";
  sheet.values[215][3] = "未知担当";
  for (let index = 216; index < 3948; index++) {
    sheet.values[index] = Array(26).fill("");
    sheet.formulas[index] = Array(26).fill("");
    sheet.formulas[index][13] = '=IF(C' + (index + 1) + '="","",1)';
  }
  const fullStore = harness.context.readStore_();
  const expected = JSON.parse(JSON.stringify(harness.context.buildSnapshot_(fullStore, { id: "ND-001", role: "player" })));
  harness.spreadsheet.reads.length = 0;
  harness.metadataReads.length = 0;
  const result = assertSuccess(request(harness, "snapshot", {}, { token: player.token }));
  assert.deepEqual(result, expected);
  assert.ok(result.activities.some(activity => activity.recordId === "ROW-LAST"));
  assert.ok(result.warnings.some(warning => warning.includes("対応しない行が1行")), "The last unknown-owner row is still included in schema/account warnings");
  assert.equal(activityFor(result).rowVersion, activityFor(player.snapshot).rowVersion);
  const reads = harness.spreadsheet.reads.filter(read => read.sheetId === MATCHING_SHEET_ID);
  assert.deepEqual(reads.map(({ method, rows, columns }) => [method, rows, columns]), [["getValues", 3948, 4], ["getValues", 216, 26], ["getFormulas", 216, 26]]);
  const cells = reads.reduce((sum, read) => sum + read.rows * read.columns, 0);
  assert.ok(cells < 3948 * 26 * 2 * 0.14, "The realistic formula-heavy sheet reads at least 86% fewer cells");
  assert.equal(harness.metadataReads.length, 1, "Record IDs and source metadata are fetched in one request");
  assert.deepEqual(harness.metadataReads[0].body.dataFilters.map(filter => filter.developerMetadataLookup.metadataKey), ["NODE_RECORD_ID", "NODE_SOURCE"]);
});

test("unlocked snapshots fail closed if a session or account permissions change during the read", () => {
  for (const change of ["revoked", "expired", "disabled", "role", "aliases", "destination"]) {
    const { harness, player, admin } = signedInFixture();
    const token = change === "role" ? admin.token : player.token;
    let changed = false;
    harness.spreadsheet.readObserver = read => {
      if (changed || read.sheetId !== MATCHING_SHEET_ID) return;
      changed = true;
      const account = harness.spreadsheet.getSheetByName("_NODE_players").values.find(row => row[0] === (change === "role" ? "ADMIN" : "ND-001"));
      if (change === "revoked") delete harness.properties[harness.context.sessionKey_(token)];
      if (change === "expired") harness.clock.milliseconds += 6 * 3600 * 1000 + 1;
      if (change === "disabled") account[8] = false;
      if (change === "role") account[7] = "player";
      if (change === "aliases") account[6] = JSON.stringify(["担当二"]);
      if (change === "destination") harness.properties.NODE_CONFIG = JSON.stringify({ ...JSON.parse(harness.properties.NODE_CONFIG), spreadsheetId: "another-file" });
    };
    const error = assertFailure(request(harness, "snapshot", {}, { token }));
    assert.equal(error.code, ["revoked", "expired", "disabled"].includes(change) ? "UNAUTHENTICATED" : "BUSY", change);
    assert.deepEqual(harness.writes, []);
    assert.deepEqual(harness.apiCalls, []);
  }
});

test("final authorization follows snapshot aggregation and its last spreadsheet reads", () => {
  for (const change of ["revoked", "role"]) {
    const { harness, admin } = signedInFixture();
    const getName = harness.spreadsheet.getName;
    harness.spreadsheet.getName = () => {
      if (change === "revoked") delete harness.properties[harness.context.sessionKey_(admin.token)];
      else harness.spreadsheet.getSheetByName("_NODE_players").values.find(row => row[0] === "ADMIN")[7] = "player";
      return getName();
    };
    const error = assertFailure(request(harness, "snapshot", {}, { token: admin.token }));
    assert.equal(error.code, change === "revoked" ? "UNAUTHENTICATED" : "BUSY");
  }
});

test("session cleanup scans properties at most once a minute and expired tokens remain invalid immediately", () => {
  const harness = baseHarness(), propertyApi = harness.context.PropertiesService.getScriptProperties();
  const getProperties = propertyApi.getProperties;
  let scans = 0;
  propertyApi.getProperties = () => { scans++; return getProperties(); };
  authenticate(harness);
  const now = harness.clock.milliseconds;
  const expiredToken = "E".repeat(43);
  harness.properties[harness.context.sessionKey_(expiredToken)] = JSON.stringify({ id: "ND-001", expiresAt: now - 1 });
  authenticate(harness, "ND-002");
  assert.equal(scans, 1);
  assert.equal(assertFailure(request(harness, "snapshot", {}, { token: expiredToken })).code, "UNAUTHENTICATED");
  const secondExpired = "F".repeat(43);
  harness.properties[harness.context.sessionKey_(secondExpired)] = JSON.stringify({ id: "ND-001", expiresAt: now - 1 });
  harness.clock.milliseconds += 60000;
  authenticate(harness);
  assert.equal(scans, 2);
  assert.equal(harness.properties[harness.context.sessionKey_(secondExpired)], undefined);
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

test("all six KPI stages round-trip into one proposal row and count only their recorded dates", () => {
  const harness = baseHarness();
  const matching = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
  const template = Array(26).fill("");
  PROTECTED_COLUMNS.forEach(column => template[column - 1] = `=ROW()+${column}`);
  matching.getRange(2, 1, 1, 26).setValues([template]);
  const protectedFormulas = clone(matching.formulas[1]);
  const kpiBefore = clone(harness.spreadsheet.getSheetById(KPI_SHEET_ID).values);
  const player = authenticate(harness);
  let snapshot = player.snapshot;
  let recordId;
  const stages = [
    { stage: "候補者面談", column: 1, date: "2026-10-01" },
    { stage: "提案", column: 8, date: "2026-10-02" },
    { stage: "C面談予約", column: 9, date: "2026-10-03" },
    { stage: "クライアント面談", column: 17, date: "2026-10-04" },
    { stage: "内定承諾", column: 22, date: "2026-10-05" },
    { stage: "稼働開始", column: 24, date: "2026-10-06" },
  ];
  harness.writes.length = 0;
  harness.apiCalls.length = 0;
  for (const [index, step] of stages.entries()) {
    const current = snapshot.activities.find(item => item.recordId === recordId);
    const activity = newCandidate({
      candidateName: "六工程候補者", company: index === 0 ? "" : "六工程クライアント",
      stage: step.stage, date: step.date,
      ...(current ? { recordId: current.recordId, rowVersion: current.rowVersion } : {}),
    });
    snapshot = assertSuccess(mutate(harness, player.token, "saveActivity", { activity })).snapshot;
    const recorded = snapshot.activities.find(item => item.candidateName === activity.candidateName && item.stage === step.stage);
    assert.ok(recorded, `Saved ${step.stage} must return as an activity`);
    recordId ??= recorded.recordId;
    assert.equal(recorded.recordId, recordId, "Later stages must update the original proposal rather than create another row");
    assert.equal(recorded.date, step.date);
    const row = rowWithCandidate(harness, activity.candidateName);
    assert.equal(harness.context.NODE_TESTS.day(row[step.column - 1]), step.date, `${step.stage} must save its actual date to the agreed DB column`);
    for (const [metricIndex, metric] of stages.entries()) {
      const expected = metricIndex <= index ? 1 : 0;
      assert.equal(snapshot.counts.all["ND-001"][metric.stage], expected);
      assert.equal(snapshot.counts["2026-10"]["ND-001"][metric.stage], expected);
      assert.equal(snapshot.counts[metric.date]?.["ND-001"]?.[metric.stage] ?? 0, expected);
      if (metricIndex > index) assert.equal(row[metric.column - 1], "", "Unrecorded stages must leave their date cells empty");
    }
    assert.equal(snapshot.counts.all["ND-001"]["内定"], 0, "An acceptance date must not invent a client-offer date");
    assert.equal(snapshot.counts.all["ND-001"]["稼働開始予定"], 0, "An actual start must not invent a planned start date");
    assert.equal(snapshot.counts.all["ND-001"]["紹介人数"], index > 0 ? 1 : 0);
    assert.equal(matching.values.filter(item => item[2] === activity.candidateName).length, 1);
    assert.deepEqual(matching.formulas[1], protectedFormulas, "Business formulas outside input cells must survive all six saves");
    assert.deepEqual(harness.spreadsheet.getSheetById(KPI_SHEET_ID).values, kpiBefore, "The API must write DB dates and leave KPI formulas to recalculate");

    const callsBeforeDuplicate = harness.apiCalls.length;
    const currentVersion = snapshot.activities.find(item => item.recordId === recordId).rowVersion;
    assert.equal(assertFailure(mutate(harness, player.token, "saveActivity", { activity: { ...activity, recordId, rowVersion: currentVersion } })).code, "ALREADY_RECORDED");
    assert.equal(harness.apiCalls.length, callsBeforeDuplicate, "Repeated stage entry must not write another date or operation");

    if (index === 0) {
      const beforeStatus = clone(snapshot.counts);
      snapshot = assertSuccess(mutate(harness, player.token, "updateStatus", { recordId, rowVersion: currentVersion, status: "稼働開始" })).snapshot;
      assert.equal(rowWithCandidate(harness, activity.candidateName)[6], "稼働開始");
      assert.deepEqual(snapshot.counts, beforeStatus, "A status label alone must not count the remaining five KPI stages");
    }
  }
  const finalCounts = clone(snapshot.counts);
  const finalVersion = snapshot.activities.find(item => item.recordId === recordId).rowVersion;
  snapshot = assertSuccess(mutate(harness, player.token, "updateStatus", { recordId, rowVersion: finalVersion, status: "辞退（本人希望）" })).snapshot;
  assert.deepEqual(snapshot.counts, finalCounts, "A later status change must preserve already-recorded historical outcomes");
  assert.equal(harness.spreadsheet.getSheetByName("_NODE_operations").values.filter(row => row[2] === "saveActivity").length, 6);
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

test("the migration source is permanently read-only even if its configuration requests writes", () => {
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

function destinationAuthorizedFixture() {
  const destinationId = "test-destination";
  const fixture = signedInFixture({ spreadsheetId: destinationId, properties: configProperties({ spreadsheetId: destinationId, purpose: "production", writesEnabled: true }) });
  const { harness } = fixture;
  const { proof } = copyProofFixture(harness);
  const authorizedAt = new Date(harness.clock.milliseconds).toISOString();
  const config = {
    ...JSON.parse(harness.properties.NODE_CONFIG), verifiedCopyId: proof.copyId, destinationAuthorizedAt: authorizedAt,
    destinationAuthorizationSeal: harness.context.NODE_TESTS.destinationAuthorization(proof, "owner@example.test", authorizedAt),
  };
  harness.properties.NODE_COPY_PROOF = JSON.stringify(proof);
  harness.properties.NODE_CONFIG = JSON.stringify(config);
  return { ...fixture, proof, config };
}

function bulkPasswordFixture() {
  const fixture = destinationAuthorizedFixture(), { harness } = fixture;
  const players = harness.spreadsheet.getSheetByName("_NODE_players");
  for (let i = 3; i <= 7; i++) players.getRange(players.getLastRow() + 1, 1, 1, 9).setValues([[`ND-00${i}`,`担当${i}`,"NODE","blue",20,"",JSON.stringify([`担当${i}`]),"player",true]]);
  players.getRange(players.getLastRow() + 1, 1, 1, 9).setValues([["ND-099","停止済み","NODE","blue",20,"","[]","player",false]]);
  const ids = ["ADMIN",...Array.from({length:7},(_,i) => `ND-00${i+1}`)];
  for (const id of ids) harness.properties[`NODE_AUTH_${id}`] = JSON.stringify(harness.context.makeAuth_(`old-${id}`));
  harness.properties.NODE_AUTH_ND_IGNORED = "unrelated-auth";
  harness.properties.NODE_SESSION_inactive = JSON.stringify({id:"ND-099",expiresAt:Date.now()+60_000});
  const shown = [];
  harness.context.showCredentials_ = credentials => { assert.equal(harness.locks.held,false); shown.push(clone(credentials)); };
  harness.writes.length = 0; harness.apiCalls.length = 0;
  return {...fixture,ids,players,shown};
}

test("bulk password menu registration and cancellation change no credentials, sessions, or sheets", () => {
  for (const answer of ["NO","CLOSE",undefined]) {
    const { harness, ids, shown } = bulkPasswordFixture(), before = clone(harness.properties), items = [];
    const menu = {addItem(name,action){items.push([name,action]);return this;},addToUi(){return this;}};
    harness.context.SpreadsheetApp.getUi = () => ({createMenu:()=>menu,ButtonSet:{YES_NO:"YES_NO"},Button:{YES:"YES"},alert:(_title,message)=>{
      assert.equal(harness.locks.held,false); assert.equal(harness.locks.calls,2);
      ids.forEach(id => assert.ok(message.includes(id)));
      assert.ok(message.includes("旧パスワード") && message.includes("ログインセッション"));
      assert.deepEqual(harness.properties,before); return answer;
    }});
    harness.context.onOpen();
    assert.ok(items.some(([name,action]) => name === "全員のパスワードを再発行" && action === "rotateAllNodePasswords"));
    assert.equal(harness.context.rotateAllNodePasswords().rotated,0);
    assert.deepEqual(harness.properties,before); assert.deepEqual(shown,[]);
    assert.deepEqual(harness.writes,[]); assert.deepEqual(harness.apiCalls,[]);
  }
});

test("bulk password rotation updates all eight active accounts and revokes their sessions without touching business or configuration", () => {
  const { harness, ids, shown, player, admin } = bulkPasswordFixture();
  const before = clone(harness.properties), sheets = clone(harness.spreadsheet.sheets.map(sheet => ({values:sheet.values,formulas:sheet.formulas,validations:sheet.validations})));
  const propertyApi = harness.context.PropertiesService.getScriptProperties(), setProperties = propertyApi.setProperties;
  const batches = [];
  propertyApi.setProperties = function(values,deleteAll){assert.equal(harness.locks.held,true);assert.equal(deleteAll,false);batches.push(clone(values));return setProperties.call(this,values,deleteAll);};
  assert.equal(harness.context.rotateAllNodePasswords().rotated,8);
  assert.equal(shown.length,1); assert.deepEqual(shown[0].map(row => row.id),ids);
  assert.equal(new Set(shown[0].map(row => row.password)).size,8);
  assert.equal(batches.length,2);
  assert.ok(Object.keys(batches[0]).every(key => key.startsWith("NODE_SESSION_")));
  assert.deepEqual(Object.keys(batches[1]),ids.flatMap(id => [`NODE_AUTH_${id}`,`NODE_RATE_${harness.context.hash_(id)}`]));
  for (const key of Object.keys(before)) {
    if (ids.some(id => key === `NODE_AUTH_${id}`)) { assert.notEqual(harness.properties[key],before[key]); continue; }
    if (key.startsWith("NODE_SESSION_") && ids.includes(JSON.parse(before[key]).id)) { assert.equal(JSON.parse(harness.properties[key]).expiresAt,0); continue; }
    assert.equal(harness.properties[key],before[key],key);
  }
  assert.deepEqual(harness.spreadsheet.sheets.map(sheet => ({values:sheet.values,formulas:sheet.formulas,validations:sheet.validations})),sheets);
  assert.deepEqual(harness.writes,[]); assert.deepEqual(harness.apiCalls,[]);
  assert.equal(assertFailure(request(harness,"snapshot",{},{token:player.token})).code,"UNAUTHENTICATED");
  assert.equal(assertFailure(request(harness,"snapshot",{},{token:admin.token})).code,"UNAUTHENTICATED");
  for (const credential of shown[0]) {
    assert.equal(assertFailure(request(harness,"login",{id:credential.id,password:`old-${credential.id}`})).code,"INVALID_CREDENTIALS");
    assert.equal(assertSuccess(request(harness,"login",credential)).snapshot.self.playerId,credential.id);
    assert.ok(!JSON.stringify(harness.properties).includes(credential.password));
    assert.ok(!JSON.stringify(harness.logs).includes(credential.password));
  }
});

test("bulk rotation refuses non-owner, original, verification, and a changed destination before credential writes", () => {
  for (const condition of ["owner","original","verification","destination"]) {
    const { harness } = bulkPasswordFixture();
    if (condition === "owner") harness.context.Session.getActiveUser = () => ({getEmail:()=>"different@example.test"});
    else {
      const config = JSON.parse(harness.properties.NODE_CONFIG);
      if (condition === "original") config.spreadsheetId = harness.context.NODE.originalId;
      if (condition === "verification") config.purpose = "verification";
      if (condition === "destination") harness.properties.NODE_DESTINATION_ID = "another-destination";
      harness.properties.NODE_CONFIG = JSON.stringify(config);
    }
    const before = clone(harness.properties);
    harness.context.SpreadsheetApp.getUi = () => { throw new Error("Invalid target must not reach confirmation"); };
    assert.throws(() => harness.context.rotateAllNodePasswords(),error => ["FORBIDDEN","PROTECTED_SOURCE","PRODUCTION_REQUIRED","UNAPPROVED_DESTINATION"].includes(error.nodeCode));
    assert.deepEqual(harness.properties,before); assert.deepEqual(harness.writes,[]); assert.deepEqual(harness.apiCalls,[]);
  }
});

test("bulk rotation rechecks the owner, destination, and entire active roster after confirmation", () => {
  for (const change of ["owner","destination","name","active","new-player"]) {
    const { harness, players, shown } = bulkPasswordFixture();
    const original = clone(harness.properties);
    harness.context.SpreadsheetApp.getUi = () => ({ButtonSet:{YES_NO:"YES_NO"},Button:{YES:"YES"},alert:()=>{
      assert.equal(harness.locks.held,false);
      if (change === "owner") harness.context.Session.getActiveUser = () => ({getEmail:()=>"different@example.test"});
      if (change === "destination") harness.properties.NODE_DESTINATION_ID = "changed-destination";
      if (change === "name") players.values[2][1] = "変更後の名前";
      if (change === "active") players.values[2][8] = false;
      if (change === "new-player") players.values.push(["ND-011","追加担当","NODE","blue",20,"","[]","player",true]);
      return "YES";
    }});
    assert.throws(() => harness.context.rotateAllNodePasswords(),error => ["CONFLICT","FORBIDDEN","UNAPPROVED_DESTINATION"].includes(error.nodeCode));
    Object.keys(original).filter(key => key.startsWith("NODE_AUTH_") || key.startsWith("NODE_SESSION_")).forEach(key => assert.equal(harness.properties[key],original[key]));
    assert.deepEqual(shown,[]); assert.equal(harness.locks.held,false);
  }
});

test("bulk rotation restores previous hashes after partial auth failure while keeping sessions revoked", () => {
  const { harness, ids, shown } = bulkPasswordFixture();
  delete harness.properties["NODE_AUTH_ND-002"];
  const rateKey = `NODE_RATE_${harness.context.hash_("ADMIN")}`;
  harness.properties[rateKey] = JSON.stringify({start:harness.clock.milliseconds,failures:5});
  const before = clone(harness.properties), api = harness.context.PropertiesService.getScriptProperties(), setProperties = api.setProperties;
  let authBatches = 0;
  api.setProperties = function(values,deleteAll){
    assert.equal(deleteAll,false);
    if(Object.keys(values).some(key => key.startsWith("NODE_AUTH_")) && ++authBatches === 1){
      Object.entries(values).slice(0,6).forEach(([key,value]) => harness.properties[key]=value);
      throw new Error("simulated partial update");
    }
    return setProperties.call(this,values,deleteAll);
  };
  assert.throws(() => harness.context.rotateAllNodePasswords(),error => error.nodeCode === "PASSWORD_ROTATION_FAILED");
  ids.forEach(id => assert.equal(harness.properties[`NODE_AUTH_${id}`],before[`NODE_AUTH_${id}`]));
  ids.forEach(id => {const key=`NODE_RATE_${harness.context.hash_(id)}`;assert.equal(harness.properties[key],before[key]);});
  Object.keys(before).filter(key => key.startsWith("NODE_SESSION_") && ids.includes(JSON.parse(before[key]).id)).forEach(key => assert.equal(JSON.parse(harness.properties[key]).expiresAt,0));
  assert.deepEqual(shown,[]); assert.equal(harness.locks.held,false);
  assert.deepEqual(harness.writes,[]); assert.deepEqual(harness.apiCalls,[]);
});

test("bulk rotation verifies an ambiguous completed auth update instead of issuing a second password set", () => {
  const { harness, shown } = bulkPasswordFixture(), api = harness.context.PropertiesService.getScriptProperties(), setProperties = api.setProperties;
  let authBatches = 0;
  api.setProperties = function(values,deleteAll){const result=setProperties.call(this,values,deleteAll);if(Object.keys(values).some(key => key.startsWith("NODE_AUTH_"))){authBatches++;throw new Error("response lost after commit");}return result;};
  assert.equal(harness.context.rotateAllNodePasswords().rotated,8);
  assert.equal(authBatches,1); assert.equal(shown.length,1);
});

test("bulk rotation stops before auth changes if session revocation cannot be confirmed", () => {
  const { harness, ids, shown } = bulkPasswordFixture(), before = clone(harness.properties), api = harness.context.PropertiesService.getScriptProperties();
  api.setProperties = () => {throw new Error("property write unavailable");};
  assert.throws(() => harness.context.rotateAllNodePasswords(),error => error.nodeCode === "PASSWORD_ROTATION_FAILED");
  ids.forEach(id => assert.equal(harness.properties[`NODE_AUTH_${id}`],before[`NODE_AUTH_${id}`]));
  assert.deepEqual(shown,[]); assert.equal(harness.locks.held,false);
});

test("bulk rotation clears only target account failure counters so fresh passwords work immediately", () => {
  const { harness, ids, shown } = bulkPasswordFixture();
  ids.forEach(id => harness.properties[`NODE_RATE_${harness.context.hash_(id)}`] = JSON.stringify({start:harness.clock.milliseconds,failures:5}));
  const otherRate = `NODE_RATE_${harness.context.hash_("ND-099")}`;
  harness.properties[otherRate] = JSON.stringify({start:harness.clock.milliseconds,failures:5});
  harness.properties.NODE_RATE_UNKNOWN = JSON.stringify({start:harness.clock.milliseconds,failures:4});
  const global = harness.properties.NODE_LOGIN_RATE, unknown = harness.properties.NODE_RATE_UNKNOWN, other = harness.properties[otherRate];
  assert.equal(harness.context.rotateAllNodePasswords().rotated,8);
  ids.forEach(id => assert.equal(JSON.parse(harness.properties[`NODE_RATE_${harness.context.hash_(id)}`]).failures,0));
  assert.equal(harness.properties.NODE_LOGIN_RATE,global);
  assert.equal(harness.properties.NODE_RATE_UNKNOWN,unknown); assert.equal(harness.properties[otherRate],other);
  shown[0].forEach(credential => assert.equal(assertSuccess(request(harness,"login",credential)).snapshot.self.playerId,credential.id));
});

test("bulk rotation never reports success when partial credential writes cannot be restored", () => {
  const { harness, shown } = bulkPasswordFixture(), api = harness.context.PropertiesService.getScriptProperties(), setProperties = api.setProperties;
  let authBatches = 0;
  api.setProperties = function(values,deleteAll){
    if(Object.keys(values).some(key => key.startsWith("NODE_AUTH_"))){
      if(++authBatches === 1){const [key,value]=Object.entries(values)[0];harness.properties[key]=value;}
      throw new Error("unavailable");
    }
    return setProperties.call(this,values,deleteAll);
  };
  assert.throws(() => harness.context.rotateAllNodePasswords(),error => error.nodeCode === "PASSWORD_ROTATION_INCOMPLETE");
  assert.deepEqual(shown,[]); assert.equal(harness.locks.held,false);
  assert.deepEqual(harness.writes,[]); assert.deepEqual(harness.apiCalls,[]);
});

test("bulk rotation distinguishes committed credentials from a failed credentials dialog without exposing passwords", () => {
  const { harness, ids } = bulkPasswordFixture(), before = clone(harness.properties);
  harness.context.showCredentials_ = () => {throw new Error("dialog unavailable");};
  assert.throws(() => harness.context.rotateAllNodePasswords(),error => error.nodeCode === "PASSWORD_DISPLAY_FAILED" && error.message.includes("再発行は完了しました") && !error.message.includes("dialog unavailable"));
  ids.forEach(id => assert.notEqual(harness.properties[`NODE_AUTH_${id}`],before[`NODE_AUTH_${id}`]));
  Object.keys(before).filter(key => key.startsWith("NODE_SESSION_") && ids.includes(JSON.parse(before[key]).id)).forEach(key => assert.equal(JSON.parse(harness.properties[key]).expiresAt,0));
  assert.deepEqual(harness.logs,[]); assert.equal(harness.locks.held,false);
});

function destinationBook(harness, { id = "test-destination", matchingId = 1234, kpiId = 5678 } = {}) {
  return new MockSpreadsheet(id, [
    { id: matchingId, name: "2期目マッチングDB", values: [MATCHING_HEADERS] },
    { id: kpiId, name: "2期目月間KPI・KGI", values: [["KPI"]] },
  ], harness.writes);
}

test("copy proof binds the registered destination, a different verification file, owner, and recent checks", () => {
  const { harness } = signedInFixture();
  const { proof } = copyProofFixture(harness);
  const valid = candidate => harness.context.NODE_TESTS.validCopyProof(candidate, "owner@example.test");
  assert.equal(valid(proof), true);
  for (const candidate of [null, {}, { ...proof, signature: "forged-signature" }, { ...proof, schemaHash: "tampered-schema" }]) assert.equal(valid(candidate), false);
  const invalidFields = [
    { copyId: harness.context.NODE.originalId }, { copyId: proof.destinationId }, { destinationId: "different-destination" },
    { matchingSheetId: KPI_SHEET_ID }, { kpiSheetId: MATCHING_SHEET_ID },
    { ownerEmail: "other-owner@example.test" }, { checks: proof.checks.filter(check => check !== "cleanup") }, { verifiedAt: "invalid-date" },
    { verifiedAt: new Date(harness.clock.milliseconds + 1).toISOString() }, { verifiedAt: new Date(harness.clock.milliseconds - 7 * 86400000 - 1).toISOString() },
  ];
  for (const fields of invalidFields) assert.equal(valid(resignProof(harness, { ...proof, ...fields })), false, JSON.stringify(fields));
  assert.equal(harness.context.NODE_TESTS.validCopyProof(proof, "other-owner@example.test"), false);
  assert.deepEqual(harness.apiCalls, []);
});

test("destination readiness resolves copied tab names despite changed gids and requires identical headers", () => {
  const { harness } = signedInFixture();
  const { proof } = copyProofFixture(harness);
  const book = destinationBook(harness);
  const config = JSON.parse(harness.properties.NODE_CONFIG);
  const ready = (overrides = {}, candidate = proof, target = book, owner = "owner@example.test") => harness.context.NODE_TESTS.verifyDestinationReadiness({ ...config, ...overrides }, candidate, target, owner);
  assert.equal(ready(), true);
  assert.equal(harness.context.NODE_TESTS.resolveBusinessTabs(book).matchingSheetId, 1234);
  assert.equal(harness.context.NODE_TESTS.resolveBusinessTabs(book).kpiSheetId, 5678);
  for (const fields of [{ purpose: "production" }, { spreadsheetId: "different-copy" }, { spreadsheetId: proof.destinationId }, { matchingSheetId: KPI_SHEET_ID }, { kpiSheetId: MATCHING_SHEET_ID }]) assert.throws(() => ready(fields));
  assert.throws(() => ready({}, null));
  assert.throws(() => ready({}, proof, book, "other-owner@example.test"));
  assert.throws(() => ready({}, proof, destinationBook(harness, { id: "unregistered-destination" })));
  const sheet = book.getSheetById(1234), oldHeader = sheet.values[0][12];
  sheet.values[0][12] = "メモ列の変更";
  assert.throws(() => ready());
  sheet.values[0][12] = oldHeader;
  assert.equal(ready(), true);
  assert.deepEqual(harness.apiCalls, []);
});

test("production writes require registered destination and signed owner authorization after separate-copy verification", () => {
  const { harness, player, config, proof } = destinationAuthorizedFixture();
  const enabled = candidate => harness.context.NODE_TESTS.writesEnabled(candidate);
  assert.equal(enabled(config), true);
  for (const fields of [
    { writesEnabled: false }, { purpose: "unknown" }, { spreadsheetId: "another-file" }, { destinationAuthorizedAt: "" }, { destinationAuthorizedAt: "invalid-date" },
    { destinationAuthorizationSeal: "forged" }, { verifiedCopyId: "unverified-copy" }, { ownerEmail: "other-owner@example.test" },
    { destinationAuthorizedAt: new Date(Date.parse(proof.verifiedAt) + 7 * 86400000 + 1).toISOString() },
  ]) assert.equal(enabled({ ...config, ...fields }), false, JSON.stringify(fields));
  for (const storedProof of [null, "not-json", JSON.stringify({ ...proof, signature: "forged" })]) {
    if (storedProof === null) delete harness.properties.NODE_COPY_PROOF; else harness.properties.NODE_COPY_PROOF = storedProof;
    assert.equal(enabled(config), false);
  }
  harness.properties.NODE_COPY_PROOF = JSON.stringify(proof);
  const saved = assertSuccess(mutate(harness, player.token, "saveActivity", { activity: newCandidate() }));
  assert.equal(saved.snapshot.writesEnabled, true);
  assert.ok(saved.snapshot.activities.some(activity => activity.candidateName === "新規本人候補"));
  assert.equal(harness.apiCalls.length, 1);
});

test("a completed destination activation stays authorized after the initial proof window expires", () => {
  const { harness, config } = destinationAuthorizedFixture();
  harness.clock.milliseconds += 8 * 86400000;
  assert.equal(harness.context.NODE_TESTS.validCopyProof(JSON.parse(harness.properties.NODE_COPY_PROOF), config.ownerEmail), false);
  assert.equal(harness.context.NODE_TESTS.writesEnabled(config), true);
});

test("all original write paths remain blocked even with forged legacy migration configuration", () => {
  const { harness, config } = destinationAuthorizedFixture();
  const originalId = harness.context.NODE.originalId;
  const source = destinationBook(harness, { id: originalId });
  assert.equal(harness.context.NODE_TESTS.writesEnabled({ ...config, spreadsheetId: originalId, originalWriteVerified: true, originalAuthorizationSeal: "legacy-seal" }), false);
  assert.throws(() => harness.context.enableNodeOriginalAfterVerifiedCopy(), error => error.nodeCode === "PROTECTED_SOURCE");
  assert.throws(() => harness.context.sheetsBatch_(originalId, [{ appendCells: {} }]), error => error.nodeCode === "PROTECTED_SOURCE");
  assert.throws(() => harness.context.syncRowIds_(source, source.getSheetById(1234)), error => error.nodeCode === "PROTECTED_SOURCE");
  assert.throws(() => harness.context.protectAppSheet_(source.getSheetById(1234), "owner@example.test"), error => error.nodeCode === "PROTECTED_SOURCE");
  harness.context.SpreadsheetApp.getActiveSpreadsheet = () => source;
  assert.throws(() => harness.context.setupNode(), error => error.nodeCode === "PROTECTED_SOURCE");
  assert.equal(source.getSheets().length, 2);
  assert.deepEqual(source.metadata, []);
  assert.deepEqual(harness.apiCalls, []);
  assert.deepEqual(harness.writes, []);
});

test("production destination cannot be used for test data or copy-probe cleanup", () => {
  const { harness } = destinationAuthorizedFixture();
  assert.throws(() => harness.context.enableNodeWritesForCopy(), error => error.nodeCode === "WRITES_DISABLED");
  assert.throws(() => harness.context.verifyNodeCopyIntegration(), error => error.nodeCode === "COPY_VERIFICATION_REQUIRED");
  assert.throws(() => harness.context.cleanupCopyProbe_("ND-001"), error => error.nodeCode === "COPY_VERIFICATION_REQUIRED");
  assert.deepEqual(harness.apiCalls, []);
  assert.deepEqual(harness.writes, []);
});

test("web requests cannot invoke any owner setup or verification functions", () => {
  const { harness, admin } = signedInFixture();
  for (const action of ["verifyNodeCopyIntegration", "enableNodeOriginalAfterVerifiedCopy", "enableNodeDestinationAfterVerifiedCopy", "setupNode", "setupNodeVerificationCopy", "enableNodeWritesForCopy", "rotateNodePassword", "rotateAllNodePasswords"]) assertFailure(request(harness, action, {}, { token: admin.token, operationId: randomUUID() }));
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

test("owner cannot enable verification writes or authorize destination with incompatible mapped headers", () => {
  const { harness } = signedInFixture();
  const sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
  sheet.values[0][16] = "C面談実施日未知の説明";
  const config = { ...JSON.parse(harness.properties.NODE_CONFIG), writesEnabled: false };
  harness.properties.NODE_CONFIG = JSON.stringify(config);
  assert.throws(() => harness.context.enableNodeWritesForCopy(), error => error.nodeCode === "SCHEMA_MISMATCH");
  assert.equal(JSON.parse(harness.properties.NODE_CONFIG).writesEnabled, false);
  const { proof } = copyProofFixture(harness);
  const target = destinationBook(harness); target.getSheetById(1234).values[0][16] = "C面談実施日未知の説明";
  assert.throws(() => harness.context.NODE_TESTS.verifyDestinationReadiness(config, proof, target, "owner@example.test"), error => error.nodeCode === "SCHEMA_MISMATCH", "A signed schema hash alone cannot approve an unsupported mapped header");
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


test("only authenticated admins receive the current destination URLs, using actual configured copied gids", () => {
  const { harness, player, admin } = signedInFixture();
  const sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID), kpi = harness.spreadsheet.getSheetById(KPI_SHEET_ID);
  sheet.id = 34567; kpi.id = 89012;
  harness.properties.NODE_CONFIG = JSON.stringify({ ...JSON.parse(harness.properties.NODE_CONFIG), matchingSheetId: sheet.id, kpiSheetId: kpi.id });
  const administrator = assertSuccess(request(harness, "snapshot", {}, { token: admin.token }));
  assert.deepEqual(administrator.destination, { title: "test management spreadsheet", matchingUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=34567`, kpiUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=89012` });
  const personal = assertSuccess(request(harness, "snapshot", {}, { token: player.token }));
  assert.equal(Object.hasOwn(personal, "destination"), false);
  assert.equal(JSON.stringify(personal).includes(SPREADSHEET_ID), false);
  const publicHealth = assertSuccess(request(harness, "health"));
  assert.deepEqual(Object.keys(publicHealth).sort(), ["configured", "protocol", "writesEnabled"]);
  assert.equal(JSON.stringify(publicHealth).includes(SPREADSHEET_ID), false);
});

test("new destination setup preserves every business value and formula while resolving copied gids", () => {
  const copiedRows = [MATCHING_HEADERS, ["2026/10/01", "移行した会社", "移行した候補者", "越前祐美"]];
  const harness = createHarness({ spreadsheetId: "new-private-destination-id", sheets: [
    { id: 34567, name: "2期目マッチングDB", values: copiedRows, formulas: [[], ["", "", "", "", "=ROW()"]] },
    { id: 89012, name: "2期目月間KPI・KGI", values: [["KPI", "表示値"]], formulas: [["", "=COUNTA('2期目マッチングDB'!C:C)"]] },
  ] });
  const business = harness.spreadsheet.getSheets().map(sheet => ({ sheet, values: clone(sheet.values), formulas: clone(sheet.formulas) }));
  harness.context.SpreadsheetApp.getUi = () => ({ ButtonSet: { OK_CANCEL: "OK_CANCEL" }, Button: { OK: "OK" }, prompt: () => ({ getSelectedButton: () => "OK", getResponseText: () => "new-private-destination-id" }) });
  harness.context.showCredentials_ = () => {};
  harness.context.setupNode();
  const config = JSON.parse(harness.properties.NODE_CONFIG);
  assert.equal(harness.properties.NODE_DESTINATION_ID, "new-private-destination-id");
  assert.equal(config.matchingSheetId, 34567); assert.equal(config.kpiSheetId, 89012);
  assert.equal(config.purpose, "production"); assert.equal(config.writesEnabled, false);
  business.forEach(({ sheet, values, formulas }) => { assert.deepEqual(sheet.values, values); assert.deepEqual(sheet.formulas, formulas); });
  assert.ok(harness.writes.every(write => write.sheetName.startsWith("_NODE_")));
  assert.ok(harness.apiCalls.flatMap(call => call.body.requests).every(request => Object.hasOwn(request, "createDeveloperMetadata")));
  assert.equal(harness.spreadsheet.metadata.length, 1);
});

test("wrong copied tab name or any mismatched mapped header stops destination setup before adding tabs or metadata", () => {
  for (const variant of ["tab", "header"]) {
    const header = [...MATCHING_HEADERS]; if (variant === "header") header[16] = "未確認列";
    const harness = createHarness({ spreadsheetId: "new-private-destination-id", sheets: [
      { id: 34567, name: variant === "tab" ? "2期目マッチングDB のコピー" : "2期目マッチングDB", values: [header] },
      { id: 89012, name: "2期目月間KPI・KGI", values: [["KPI"]] },
    ] });
    assert.throws(() => harness.context.setupNode(), error => error.nodeCode === "SCHEMA_MISMATCH");
    assert.equal(harness.spreadsheet.getSheets().length, 2);
    assert.deepEqual(harness.apiCalls, []); assert.deepEqual(harness.writes, []);
    assert.equal(harness.properties.NODE_DESTINATION_ID, undefined);
  }
});


test("verified activation changes only destination configuration and missing row metadata, never migrated business data", () => {
  const { harness } = signedInFixture();
  const { proof } = copyProofFixture(harness);
  harness.properties.NODE_COPY_PROOF = JSON.stringify(proof);
  const destination = destinationBook(harness), matching = destination.getSheetById(1234);
  matching.values.push(["2026/10/01", "そのまま移行した会社", "そのまま移行した候補者", "担当一"]);
  matching.formulas.push([], ["", "", "", "", "=ROW()+100"]);
  const playerSheet = destination.insertSheet("_NODE_players");
  playerSheet.values = clone(harness.spreadsheet.getSheetByName("_NODE_players").values);
  playerSheet.values[2][5] = "移行先側のプロフィールを保持";
  const ledger = destination.insertSheet("_NODE_operations");
  ledger.values = clone(harness.spreadsheet.getSheetByName("_NODE_operations").values);
  const before = destination.getSheets().map(sheet => ({ sheet, values: clone(sheet.values), formulas: clone(sheet.formulas) }));
  harness.context.SpreadsheetApp.openById = id => { assert.equal(id, "test-destination"); return destination; };
  harness.context.SpreadsheetApp.getUi = () => ({ ButtonSet: { OK_CANCEL: "OK_CANCEL" }, Button: { OK: "OK" }, alert() {}, prompt: () => ({ getSelectedButton: () => "OK", getResponseText: () => "test-destination" }) });
  harness.context.UrlFetchApp.fetch = (url, options) => {
    assert.equal(url, "https://sheets.googleapis.com/v4/spreadsheets/test-destination:batchUpdate");
    const body = JSON.parse(options.payload); harness.apiCalls.push({ url, body: clone(body) });
    const response = destination.batchUpdate(body); return { getResponseCode: () => response.status };
  };
  const result = harness.context.enableNodeDestinationAfterVerifiedCopy();
  assert.equal(result.writesEnabled, true);
  const config = JSON.parse(harness.properties.NODE_CONFIG);
  assert.equal(config.spreadsheetId, "test-destination"); assert.equal(config.purpose, "production");
  assert.equal(config.matchingSheetId, 1234); assert.equal(config.kpiSheetId, 5678);
  assert.equal(harness.context.NODE_TESTS.writesEnabled(config), true);
  before.forEach(({ sheet, values, formulas }) => { assert.deepEqual(sheet.values, values); assert.deepEqual(sheet.formulas, formulas); });
  assert.deepEqual(harness.writes, []);
  assert.ok(harness.apiCalls.flatMap(call => call.body.requests).every(request => Object.hasOwn(request, "createDeveloperMetadata")));
  assert.equal(destination.metadata.length, 1);
  assert.equal(Object.keys(harness.properties).some(key => key.startsWith("NODE_SESSION_")), false);
});

test("the complete verification-copy probe logs in, writes and reads back, refuses formulas, cleans up, and seals proof", () => {
  const { harness } = signedInFixture();
  const business = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
  const originalValues = clone(business.values), originalFormulas = clone(business.formulas), originalMetadata = harness.spreadsheet.metadata.map(item => item.id);
  const result = harness.context.verifyNodeCopyIntegration();
  assert.equal(result.verified, true);
  const proof = JSON.parse(harness.properties.NODE_COPY_PROOF);
  assert.equal(proof.destinationId, "test-destination");
  assert.equal(harness.context.NODE_TESTS.validCopyProof(proof, "owner@example.test"), true);
  assert.deepEqual(business.values.slice(0, originalValues.length), originalValues);
  assert.deepEqual(business.formulas.slice(0, originalFormulas.length), originalFormulas);
  assert.ok(business.values.slice(originalValues.length).every(row => row.every(value => value === "")));
  assert.equal(harness.properties.NODE_COPY_PROBE, undefined);
  assert.deepEqual(harness.spreadsheet.metadata.map(item => item.id), originalMetadata);
  assert.ok(harness.spreadsheet.getSheetByName("_NODE_players").values.slice(1).filter(row => String(row[1]).startsWith("連携検証")).every(row => row[8] === false));
  assert.equal(harness.logs.length, 0);
  assert.ok(harness.apiCalls.every(call => call.url.includes(`/spreadsheets/${SPREADSHEET_ID}:batchUpdate`)));
});


test("connection guidance distinguishes the new management sheet, verification copy, and permanently read-only source", () => {
  const production = destinationAuthorizedFixture();
  const actual = assertSuccess(request(production.harness, "snapshot", {}, { token: production.player.token }));
  assert.ok(actual.warnings.includes("現在の接続先は登録済みの新しい管理シートです。"));
  assert.ok(!actual.warnings.some(message => message.includes("検証用") || message.includes("保存先は原本")));
  const verification = signedInFixture();
  assert.ok(verification.player.snapshot.warnings.includes("現在の接続先は独立した検証用コピーです。"));
  const originalId = production.harness.context.NODE.originalId;
  const source = signedInFixture({ spreadsheetId: originalId, properties: configProperties({ spreadsheetId: originalId }) });
  assert.ok(source.player.snapshot.warnings.includes("現在の接続先は移行元の原本です。書き込みはできません。"));
  assert.equal(source.player.snapshot.writesEnabled, false);
});

test("header and timezone warnings refer to the connected management sheet without suggesting source edits", () => {
  const { harness, player } = destinationAuthorizedFixture();
  harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values[0][16] = "未確認列";
  harness.spreadsheet.getSpreadsheetTimeZone = () => "Etc/UTC";
  const snapshot = assertSuccess(request(harness, "snapshot", {}, { token: player.token }));
  assert.equal(snapshot.writesEnabled, false);
  assert.ok(snapshot.warnings.some(message => message.includes("管理者が接続先の列を確認")));
  assert.ok(snapshot.warnings.some(message => message.includes("接続先スプレッドシートのタイムゾーンがAsia/Tokyoではない")));
  assert.ok(!snapshot.warnings.some(message => message.includes("原本の列") || message.includes("複製側")));
  assert.deepEqual(harness.writes, []); assert.deepEqual(harness.apiCalls, []);
});

test("the 19 exact live-observed input headers accept their existing annotations without changing sheet cells", () => {
  const { harness, player } = signedInFixture();
  const observed = {
    1: "面談実施", 2: "会社名", 3: "候補者氏名\nスペースいれない", 4: "担当\n\n",
    6: "項目\n担当ポジ\n(アポインター/D/FS)", 7: "ステータス\n\n", 8: "提案完了日",
    9: "C面談予約獲得日\n（アポ獲得日）", 10: "C面談予定日 （予定がわかったら入力）", 11: "C面談予定開始時刻",
    12: "ヨミ確度\nA:95％\nB:70％\nC:50％\nD:10％", 13: "メモ", 17: "C面談実施日\n（実施したら入力）",
    21: "クライアント側オファー日=合格日", 22: "候補者承諾日=マッチ日\n", 23: "稼働開始\n予定日", 24: "稼働開始日", 25: "離脱予定日", 26: "離脱日",
  };
  const sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID), header = [...MATCHING_HEADERS];
  for (const [column, value] of Object.entries(observed)) header[Number(column) - 1] = value;
  sheet.values[0] = header;
  const beforeValues = clone(sheet.values), beforeFormulas = clone(sheet.formulas);
  assert.equal(harness.context.NODE_TESTS.mappedHeadersMatch(header), true);
  assert.equal(harness.context.NODE_TESTS.resolveBusinessTabs(harness.spreadsheet).matchingSheetId, MATCHING_SHEET_ID);
  const snapshot = assertSuccess(request(harness, "snapshot", {}, { token: player.token }));
  assert.equal(snapshot.writesEnabled, true);
  assert.deepEqual(snapshot.activities, player.snapshot.activities);
  for (const column of [3, 6, 10, 12, 17]) {
    const changed = [...header]; changed[column - 1] += "未確認の説明";
    assert.equal(harness.context.NODE_TESTS.mappedHeadersMatch(changed), false);
  }
  const swapped = [...header]; [swapped[9], swapped[16]] = [swapped[16], swapped[9]];
  assert.equal(harness.context.NODE_TESTS.mappedHeadersMatch(swapped), false);
  assert.deepEqual(sheet.values, beforeValues); assert.deepEqual(sheet.formulas, beforeFormulas);
  assert.deepEqual(harness.writes, []); assert.deepEqual(harness.apiCalls, []);
});


test("realistic strict dropdowns stay unchanged while probe writes use only two newly appended copy rows", () => {
  const { harness } = signedInFixture(), sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID), oldMax = sheet.getMaxRows();
  sheet.createDeveloperMetadataFinder = () => { throw new Error("Probe cleanup must also use bulk metadata reads"); };
  const rule = { strict: true, condition: { type: "ONE_OF_LIST", values: [{ userEnteredValue: "担当一" }, { userEnteredValue: "担当二" }] } };
  for (let row = 2; row <= oldMax; row++) sheet.validations[`${row},4`] = clone(rule);
  const beforeRules = clone(sheet.validations), beforeValues = clone(sheet.values), beforeFormulas = clone(sheet.formulas);
  assert.equal(harness.context.verifyNodeCopyIntegration().verified, true);
  assert.deepEqual(sheet.validations, beforeRules);
  assert.deepEqual(sheet.values.slice(0, beforeValues.length), beforeValues);
  assert.deepEqual(sheet.formulas.slice(0, beforeFormulas.length), beforeFormulas);
  const businessWrites = harness.writes.filter(write => write.sheetId === MATCHING_SHEET_ID);
  assert.ok(businessWrites.length > 0 && businessWrites.every(write => [oldMax + 1, oldMax + 2].includes(write.row)));
  const validationWrites = harness.apiCalls.flatMap(call => call.body.requests).filter(request => request.setDataValidation);
  assert.equal(validationWrites.length, 1);
  assert.equal(validationWrites[0].setDataValidation.range.startRowIndex, oldMax);
  assert.equal(validationWrites[0].setDataValidation.range.endRowIndex, oldMax + 2);
  assert.equal(sheet.getMaxRows(), oldMax + 2);
  assert.equal(harness.properties.NODE_COPY_PROBE, undefined);
});

test("copy verification succeeds with stale SpreadsheetApp row counts without appending extra rows or skipping cleanup", () => {
  const { harness } = signedInFixture(), sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID), oldMax = sheet.getMaxRows();
  const beforeValues = clone(sheet.values), beforeFormulas = clone(sheet.formulas), fetch = harness.context.UrlFetchApp.fetch;
  const flushedBatches = [];
  let pendingBatch;
  // Model the live failure: REST has appended rows, but getMaxRows stays cached even after flush.
  sheet.getMaxRows = () => oldMax;
  harness.context.UrlFetchApp.fetch = (url, options) => {
    const response = fetch(url, options);
    pendingBatch = JSON.parse(options.payload);
    return response;
  };
  harness.context.SpreadsheetApp.flush = () => { if (pendingBatch) { flushedBatches.push(pendingBatch); pendingBatch = null; } };
  assert.equal(harness.context.verifyNodeCopyIntegration().verified, true);
  assert.equal(sheet.maxRows, oldMax + 2);
  const additions = harness.apiCalls.flatMap(call => call.body.requests).filter(request => request.appendDimension);
  assert.deepEqual(additions.map(request => request.appendDimension.length), [2]);
  assert.deepEqual(sheet.values.slice(0, beforeValues.length), beforeValues);
  assert.deepEqual(sheet.formulas.slice(0, beforeFormulas.length), beforeFormulas);
  assert.ok(harness.writes.filter(write => write.sheetId === MATCHING_SHEET_ID).every(write => [oldMax + 1, oldMax + 2].includes(write.row)));
  for (const row of [oldMax + 1, oldMax + 2]) {
    assert.ok(sheet.getRange(row, 1, 1, 26).getValues()[0].every(value => value === ""));
    assert.ok(sheet.getRange(row, 1, 1, 26).getFormulas()[0].every(value => value === ""));
  }
  assert.ok(flushedBatches.some(body => body.requests.some(request => request.appendDimension)));
  assert.ok(flushedBatches.some(body => body.requests.some(request => request.updateCells?.rows?.some(row => row.values?.some(cell => cell.userEnteredValue?.formulaValue === "=1")))));
  assert.equal(flushedBatches.length, harness.apiCalls.length, "Every successful REST batch must be followed by flush");
  assert.equal(harness.properties.NODE_COPY_PROBE, undefined);
  assert.ok(harness.sheetReads.every(read => read.spreadsheetId === SPREADSHEET_ID && read.options.fields === "sheets(properties(sheetId,gridProperties(rowCount)))"));
});

test("a fresh row-count read failure prevents adding verification rows and preserves the reservation state", () => {
  const { harness, admin } = signedInFixture();
  const created = assertSuccess(mutate(harness, admin.token, "createPlayer", { name: "連携検証abcdef123456", team: "検証用", target: 1, sheetNames: ["連携検証abcdef123456"] }));
  harness.apiCalls.length = 0; harness.writes.length = 0;
  harness.context.Sheets.Spreadsheets.get = () => { throw new Error("private upstream details"); };
  assert.throws(() => harness.context.reserveCopyProbeRows_(created.credentials.id), error => error.nodeCode === "SHEET_READ_FAILED" && !error.message.includes("private upstream details"));
  assert.deepEqual(harness.apiCalls, []); assert.deepEqual(harness.writes, []);
  assert.equal(harness.properties.NODE_COPY_PROBE, undefined);
});

function reserveFixture() {
  const fixture = signedInFixture(), { harness, admin } = fixture;
  const created = assertSuccess(mutate(harness, admin.token, "createPlayer", { name: "連携検証abcdef123456", team: "検証用", target: 1, sheetNames: ["連携検証abcdef123456"] }));
  const reservation = harness.context.reserveCopyProbeRows_(created.credentials.id);
  const player = assertSuccess(request(harness, "login", created.credentials));
  harness.writes.length = 0; harness.apiCalls.length = 0;
  return { ...fixture, probePlayer: player, reservation };
}

test("a missing appended row in the live API refuses probe writes even when SpreadsheetApp reports it exists", () => {
  const { harness, probePlayer, reservation } = reserveFixture();
  harness.context.Sheets.Spreadsheets.get = () => ({ sheets: [{ properties: { sheetId: MATCHING_SHEET_ID, gridProperties: { rowCount: reservation.originalMaxRows } } }] });
  const result = mutate(harness, probePlayer.token, "saveActivity", { activity: newCandidate({ playerId: probePlayer.snapshot.self.playerId }) });
  assert.equal(assertFailure(result).code, "COPY_PROBE_INVALID");
  assert.deepEqual(harness.apiCalls, []); assert.deepEqual(harness.writes, []);
  assert.deepEqual(JSON.parse(harness.properties.NODE_COPY_PROBE).recordIds, {});
});

test("probe row allocation requires the owner and a dedicated actor in the registered verification copy", () => {
  const { harness } = signedInFixture();
  assert.throws(() => harness.context.reserveCopyProbeRows_("ND-001"), error => error.nodeCode === "FORBIDDEN");
  harness.context.Session.getActiveUser = () => ({ getEmail: () => "different@example.test" });
  assert.throws(() => harness.context.reserveCopyProbeRows_("ND-001"), error => error.nodeCode === "FORBIDDEN");
  const production = destinationAuthorizedFixture();
  assert.throws(() => production.harness.context.reserveCopyProbeRows_("ND-001"), error => error.nodeCode === "COPY_VERIFICATION_REQUIRED");
  assert.deepEqual(harness.apiCalls, []); assert.deepEqual(production.harness.apiCalls, []);
});

test("client-supplied row numbers cannot select probe rows or change a production write destination", () => {
  const { harness, player } = destinationAuthorizedFixture();
  assertSuccess(mutate(harness, player.token, "saveActivity", { activity: newCandidate({ row: 999, rowIndex: 998, probeRow: 999 }) }));
  assert.ok(harness.writes.filter(write => write.sheetId === MATCHING_SHEET_ID).every(write => write.row !== 999));
  assert.equal(harness.properties.NODE_COPY_PROBE, undefined);
});

test("expired reserved rows refuse new probe writes, then owner cleanup removes allocation and disables actor", () => {
  const { harness, probePlayer } = reserveFixture();
  harness.clock.milliseconds += 30 * 60000 + 1;
  const error = assertFailure(mutate(harness, probePlayer.token, "saveActivity", { activity: newCandidate({ playerId: probePlayer.snapshot.self.playerId }) }));
  assert.equal(error.code, "COPY_PROBE_EXPIRED"); assert.deepEqual(harness.apiCalls, []);
  harness.context.cleanupCopyProbe_(probePlayer.snapshot.self.playerId);
  assert.equal(harness.properties.NODE_COPY_PROBE, undefined);
  assert.equal(harness.spreadsheet.getSheetByName("_NODE_players").values.find(row => row[0] === probePlayer.snapshot.self.playerId)[8], false);
  assert.ok(harness.writes.every(write => write.sheetId !== MATCHING_SHEET_ID));
});

test("cleanup never removes pre-existing rows associated with a probe actor", () => {
  const { harness, probePlayer, reservation } = reserveFixture(), sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
  const actor = harness.spreadsheet.getSheetByName("_NODE_players").values.find(row => row[0] === probePlayer.snapshot.self.playerId);
  // Simulate a pre-existing matching alias; cleanup must use only reserved IDs, not all actor-owned rows.
  const existing = sheet.getRange(2, 1, 1, 26).getValues()[0]; existing[3] = actor[1]; sheet.getRange(2, 1, 1, 26).setValues([existing]);
  harness.writes.length = 0;
  const saved = assertSuccess(mutate(harness, probePlayer.token, "saveActivity", { activity: newCandidate({ playerId: actor[0] }) }));
  assert.ok(saved.snapshot.activities.some(activity => activity.candidateName === "新規本人候補"));
  harness.context.cleanupCopyProbe_(actor[0]);
  assert.deepEqual(sheet.getRange(2, 1, 1, 26).getValues()[0], existing);
  assert.ok(harness.writes.filter(write => write.sheetId === MATCHING_SHEET_ID).every(write => reservation.rows.includes(write.row)));
});


test("even an admin cannot impersonate the reserved probe actor to use its two rows", () => {
  const { harness, admin, probePlayer } = reserveFixture();
  const error = assertFailure(mutate(harness, admin.token, "saveActivity", { activity: newCandidate({ playerId: probePlayer.snapshot.self.playerId }) }));
  assert.equal(error.code, "FORBIDDEN"); assert.deepEqual(harness.apiCalls, []);
});

test("a probe reservation cannot move to another file, tab, or application purpose", () => {
  const { harness, probePlayer } = reserveFixture();
  const original = JSON.parse(harness.properties.NODE_COPY_PROBE), actorId = probePlayer.snapshot.self.playerId;
  for (const patch of [{ spreadsheetId: "wrong-copy" }, { matchingSheetId: KPI_SHEET_ID }, { ownerEmail: "different-owner@example.test" }]) {
    harness.properties.NODE_COPY_PROBE = JSON.stringify({ ...original, ...patch });
    assert.equal(assertFailure(mutate(harness, probePlayer.token, "saveActivity", { activity: newCandidate({ playerId: actorId }) })).code, "COPY_PROBE_INVALID");
  }
  assert.deepEqual(harness.apiCalls, []);
});

test("new player masters seed strict-dropdown names first and verification copies preserve that order for new D writes", () => {
  const expected = [["越前", "越前祐美"], ["鈴木", "鈴木楓"], ["櫻庭", "櫻庭奈々"], ["高田", "髙田侑弥"], ["佐藤", "佐藤光"], ["倉島", "倉島颯汰"], ["佐々木駿"]];
  const destinationId = "test-new-management-spreadsheet", copyId = "test-new-verification-spreadsheet";
  const harness = createHarness({ spreadsheetId: destinationId, sheets: [
    { id: 34567, name: "2期目マッチングDB", values: [MATCHING_HEADERS] },
    { id: 89012, name: "2期目月間KPI・KGI", values: [["KPI"]] },
  ] });
  let promptText = destinationId, credentials;
  harness.context.SpreadsheetApp.getUi = () => ({ ButtonSet: { OK_CANCEL: "OK_CANCEL" }, Button: { OK: "OK" }, prompt: () => ({ getSelectedButton: () => "OK", getResponseText: () => promptText }) });
  harness.context.showCredentials_ = value => { credentials = value; };
  harness.context.setupNode();
  const masters = harness.spreadsheet.getSheetByName("_NODE_players").values.slice(2);
  assert.deepEqual(masters.map(row => JSON.parse(row[6])), expected);
  const destinationValues = clone(harness.spreadsheet.getSheetById(34567).values);
  const copy = destinationBook(harness, { id: copyId });
  harness.context.SpreadsheetApp.openById = id => {
    if (id === destinationId) return harness.spreadsheet;
    assert.equal(id, copyId); return copy;
  };
  harness.context.UrlFetchApp.fetch = (url, options) => {
    assert.equal(url, `https://sheets.googleapis.com/v4/spreadsheets/${copyId}:batchUpdate`);
    const body = JSON.parse(options.payload); harness.apiCalls.push({ url, body: clone(body) });
    const response = copy.batchUpdate(body); return { getResponseCode: () => response.status };
  };
  promptText = copyId;
  harness.context.setupNodeVerificationCopy();
  assert.deepEqual(copy.getSheetByName("_NODE_players").values.slice(2).map(row => JSON.parse(row[6])), expected);
  harness.properties.NODE_CONFIG = JSON.stringify({ ...JSON.parse(harness.properties.NODE_CONFIG), writesEnabled: true });
  const matching = copy.getSheetById(1234);
  const validation = { strict: true, condition: { type: "ONE_OF_LIST", values: expected.map(names => ({ userEnteredValue: names[0] })) } };
  for (let row = 2; row <= 20; row++) matching.validations[`${row},4`] = clone(validation);
  for (let i = 0; i < 7; i++) {
    const id = `ND-00${i + 1}`, login = assertSuccess(request(harness, "login", { id, password: credentials.find(item => item.id === id).password }));
    const candidateName = `架空候補者${i + 1}`;
    assertSuccess(mutate(harness, login.token, "saveActivity", { activity: newCandidate({ playerId: id, candidateName }) }));
    assert.equal(matching.values.find(row => row[2] === candidateName)[3], expected[i][0]);
  }
  assert.deepEqual(harness.spreadsheet.getSheetById(34567).values, destinationValues);
  assert.deepEqual(masters.map(row => JSON.parse(row[6])), expected);
});

test("copy verification refuses proof and retains reservation when assigned record metadata disappears or moves", () => {
  for (const change of ["deleted", "moved"]) {
    const { harness } = signedInFixture(), cleanup = harness.context.cleanupCopyProbe_;
    let reserved;
    harness.context.cleanupCopyProbe_ = id => {
      reserved = JSON.parse(harness.properties.NODE_COPY_PROBE);
      if (change === "deleted") harness.spreadsheet.metadata = harness.spreadsheet.metadata.filter(item => !(item.key === "NODE_RECORD_ID" && reserved.rows.includes(item.row)));
      else harness.spreadsheet.metadata.filter(item => item.key === "NODE_RECORD_ID" && reserved.rows.includes(item.row)).forEach(item => { item.row += 10; });
      return cleanup(id);
    };
    assert.throws(() => harness.context.verifyNodeCopyIntegration(), error => error.nodeCode === "CONFLICT");
    assert.ok(harness.properties.NODE_COPY_PROBE, "The failed cleanup retains its allocation for owner review");
    assert.equal(harness.properties.NODE_COPY_PROOF, undefined);
    assert.ok(reserved.rows.some(row => harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).getRange(row, 3).getValue() !== ""));
    const actor = harness.spreadsheet.getSheetByName("_NODE_players").values.find(row => row[0] === reserved.actorId);
    assert.equal(actor[8], true, "Missing IDs stop cleanup before actor deactivation can hide remaining rows");
    assert.equal(harness.locks.held, false);
  }
});

test("cleanup checks raw values, formulas, and source metadata after clearing before it can discard a reservation or issue proof", () => {
  for (const leftover of ["value", "formula", "sourceMetadata"]) {
    const { harness } = signedInFixture(), fetch = harness.context.UrlFetchApp.fetch;
    harness.context.UrlFetchApp.fetch = (url, options) => {
      const response = fetch(url, options), body = JSON.parse(options.payload);
      if (body.requests.some(request => request.deleteDeveloperMetadata)) {
        const reserved = JSON.parse(harness.properties.NODE_COPY_PROBE), sheet = harness.spreadsheet.getSheetById(MATCHING_SHEET_ID), row = reserved.rows[0];
        if (leftover === "value") sheet.values[row - 1][12] = "後始末を確認できない値";
        if (leftover === "formula") { sheet.formulas[row - 1][12] = "=1"; sheet.values[row - 1][12] = ""; }
        if (leftover === "sourceMetadata") sheet.getRange(row, 1, 1, 26).addDeveloperMetadata("NODE_SOURCE", "残存メタデータ");
      }
      return response;
    };
    assert.throws(() => harness.context.verifyNodeCopyIntegration(), error => error.nodeCode === "CONFLICT");
    assert.ok(harness.properties.NODE_COPY_PROBE);
    assert.equal(harness.properties.NODE_COPY_PROOF, undefined, "An inactive actor must not hide raw leftover cells or metadata from verification");
  }
});

test("an expired verification actor cannot update an existing reserved status or add its next activity stage", () => {
  const { harness, probePlayer } = reserveFixture(), id = probePlayer.snapshot.self.playerId;
  const saved = assertSuccess(mutate(harness, probePlayer.token, "saveActivity", { activity: newCandidate({ playerId: id }) }));
  const record = saved.snapshot.activities.find(activity => activity.playerId === id);
  harness.clock.milliseconds += 30 * 60000 + 1;
  const before = clone(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values);
  harness.apiCalls.length = 0; harness.writes.length = 0;
  assert.equal(assertFailure(mutate(harness, probePlayer.token, "updateStatus", { recordId: record.recordId, rowVersion: record.rowVersion, status: "辞退（本人希望）" })).code, "COPY_PROBE_EXPIRED");
  assert.equal(assertFailure(mutate(harness, probePlayer.token, "saveActivity", { activity: { ...record, stage: "提案", company: "架空検証会社", date: "2026-10-07" } })).code, "COPY_PROBE_EXPIRED");
  assert.deepEqual(harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values, before);
  assert.deepEqual(harness.apiCalls, []); assert.deepEqual(harness.writes, []);
  assert.ok(harness.properties.NODE_COPY_PROBE);
});

test("an unexpired probe actor still cannot update an existing record outside its reserved row and record IDs", () => {
  const { harness, probePlayer } = reserveFixture(), id = probePlayer.snapshot.self.playerId;
  const master = harness.spreadsheet.getSheetByName("_NODE_players").values.find(row => row[0] === id);
  harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).values[1][3] = master[1];
  const ownSnapshot = assertSuccess(request(harness, "snapshot", {}, { token: probePlayer.token }));
  const existing = ownSnapshot.activities.find(activity => activity.playerId === id && activity.stage === "提案");
  assert.ok(existing);
  harness.apiCalls.length = 0; harness.writes.length = 0;
  assert.equal(assertFailure(mutate(harness, probePlayer.token, "updateStatus", { recordId: existing.recordId, rowVersion: existing.rowVersion, status: "辞退（本人希望）" })).code, "CONFLICT");
  assert.equal(assertFailure(mutate(harness, probePlayer.token, "saveActivity", { activity: { ...existing, stage: "クライアント面談", date: "2026-10-07" } })).code, "CONFLICT");
  assert.deepEqual(harness.apiCalls, []); assert.deepEqual(harness.writes, []);
});

test("candidate records include undated and unmapped rows for admin and retain player privacy",()=>{
 const f=signedInFixture(),sheet=f.harness.spreadsheet.getSheetById(MATCHING_SHEET_ID);
 sheet.getRange(2,1).clearContent();sheet.getRange(2,8).clearContent();sheet.getRange(3,4).setValue("旧担当");
 const admin=assertSuccess(request(f.harness,"snapshot",{}, {token:f.admin.token}));
 assert.equal(admin.records.length,4);assert.equal(admin.records.find(r=>r.row===2).candidateName,"本人候補");assert.equal(admin.records.find(r=>r.row===3).playerId,"");
 const player=assertSuccess(request(f.harness,"snapshot",{}, {token:f.player.token}));
 assert.equal(player.records.length,3);assert.ok(player.records.every(r=>r.playerId==="ND-001"));assert.ok(!JSON.stringify(player).includes("他者秘密候補"));
});
test("canceling a deduplicated interview clears all matching proposal dates once, supports replay and restore",()=>{
 const f=signedInFixture();const before=assertSuccess(request(f.harness,"snapshot",{}, {token:f.player.token}));
 assert.equal(before.counts["2026-10"]["ND-001"]["候補者面談"],2);
 const r=before.records.find(r=>r.row===2),id=randomUUID(),payload={recordId:r.recordId,rowVersion:r.rowVersion,stage:"候補者面談"};
 const result=assertSuccess(request(f.harness,"cancelAchievement",payload,{token:f.player.token,operationId:id}));
 assert.equal(result.snapshot.counts["2026-10"]["ND-001"]["候補者面談"],1);
 assert.equal(result.snapshot.records.find(r=>r.row===2).values[0],"");assert.equal(result.snapshot.records.find(r=>r.row===4).values[0],"");
 assert.equal(result.snapshot.records.find(r=>r.row===2).values[7],"2026-10-05");assert.equal(result.changeId,id);
 const calls=f.harness.apiCalls.length;assertSuccess(request(f.harness,"cancelAchievement",payload,{token:f.player.token,operationId:id}));assert.equal(f.harness.apiCalls.length,calls);
 const restored=assertSuccess(request(f.harness,"restoreChange",{changeId:id},{token:f.player.token,operationId:randomUUID()}));
 assert.equal(restored.snapshot.counts["2026-10"]["ND-001"]["候補者面談"],2);
});
test("proposal cancellation touches only its row and other owners, formulas and KPI remain intact",()=>{
 const f=signedInFixture(),before=assertSuccess(request(f.harness,"snapshot",{}, {token:f.player.token})),r=before.records.find(r=>r.row===2);
 const sheet=f.harness.spreadsheet.getSheetById(MATCHING_SHEET_ID),formulas=clone(sheet.formulas),kpi=clone(f.harness.spreadsheet.getSheetById(KPI_SHEET_ID).values);
 const result=assertSuccess(request(f.harness,"cancelAchievement",{recordId:r.recordId,rowVersion:r.rowVersion,stage:"提案"},{token:f.player.token,operationId:randomUUID()}));
 assert.equal(result.snapshot.counts["2026-10"]["ND-001"]["提案"],1);assert.equal(sheet.getRange(4,8).getValue(),"2026-10-05");assert.equal(sheet.getRange(3,8).getValue(),"2026-10-05");
 assert.deepEqual(sheet.formulas,formulas);assert.deepEqual(f.harness.spreadsheet.getSheetById(KPI_SHEET_ID).values,kpi);
});
test("candidate edit validates ownership, stale versions, formulas, stage dates, renames and restores",()=>{
 const f=signedInFixture(),snapshot=assertSuccess(request(f.harness,"snapshot",{}, {token:f.player.token})),r=snapshot.records.find(r=>r.row===2),foreign=f.admin.snapshot.records.find(r=>r.row===3);
 const update=(record,changes)=>request(f.harness,"updateRecord",{recordId:record.recordId,rowVersion:record.rowVersion,changes},{token:f.player.token,operationId:randomUUID()});
 assert.equal(assertFailure(update(foreign,{13:"侵入"})).code,"FORBIDDEN");assert.equal(assertFailure(update(r,{5:"数式を破壊"})).code,"FORMULA_PROTECTED");
 assert.equal(assertFailure(update({...r,rowVersion:"old"},{13:"メモ"})).code,"CONFLICT");assert.equal(assertFailure(update(r,{17:"2026-11-01"})).code,"INVALID_DATE");
 const edited=assertSuccess(update(r,{3:"修正候補",13:"進捗メモ",17:"2026-10-06"}));
 const fresh=edited.snapshot.records.find(a=>a.recordId===r.recordId);assert.equal(fresh.candidateName,"修正候補");assert.equal(fresh.values[16],"2026-10-06");assert.equal(edited.snapshot.counts["2026-10"]["ND-001"]["クライアント面談"],1);
 const restored=assertSuccess(request(f.harness,"restoreChange",{changeId:edited.changeId},{token:f.player.token,operationId:randomUUID()}));assert.equal(restored.snapshot.records.find(a=>a.recordId===r.recordId).candidateName,"本人候補");
});
test("restore rejects another actor and refuses to overwrite a later direct spreadsheet edit",()=>{
 const f=signedInFixture(),r=f.player.snapshot.records.find(r=>r.row===2),changed=assertSuccess(request(f.harness,"cancelAchievement",{recordId:r.recordId,rowVersion:r.rowVersion,stage:"提案"},{token:f.player.token,operationId:randomUUID()}));
 const other=authenticate(f.harness,"ND-002");assert.equal(assertFailure(request(f.harness,"restoreChange",{changeId:changed.changeId},{token:other.token,operationId:randomUUID()})).code,"FORBIDDEN");
 f.harness.spreadsheet.getSheetById(MATCHING_SHEET_ID).getRange(2,13).setValue("後からの変更");
 assert.equal(assertFailure(request(f.harness,"restoreChange",{changeId:changed.changeId},{token:f.player.token,operationId:randomUUID()})).code,"CONFLICT");
});
test("candidates may be created without achievements and cannot be assigned to another player",()=>{
 const f=signedInFixture(),data={candidateName:"未面談の人",playerId:"ND-001",company:"",position:"FS"};
 assert.equal(assertFailure(request(f.harness,"createCandidate",{...data,playerId:"ND-002"},{token:f.player.token,operationId:randomUUID()})).code,"FORBIDDEN");
 const result=assertSuccess(request(f.harness,"createCandidate",data,{token:f.player.token,operationId:randomUUID()}));assert.ok(result.snapshot.records.some(r=>r.candidateName===data.candidateName&&r.values[0]===""));assert.equal(result.snapshot.counts["2026-10"]["ND-001"]["候補者面談"],2);
});
test("administrative table reads are bounded, exclude app secrets and recheck access",()=>{
 const f=signedInFixture();
 assert.equal(assertFailure(request(f.harness,"managementTables",{}, {token:f.player.token})).code,"FORBIDDEN");
 const list=assertSuccess(request(f.harness,"managementTables",{}, {token:f.admin.token}));assert.ok(list.tables.every(t=>!t.title.startsWith("_NODE_")));
 assert.equal(assertFailure(request(f.harness,"managementTable",{sheetId:8001},{token:f.admin.token})).code,"PROTECTED_SHEET");
 assert.equal(assertFailure(request(f.harness,"managementTable",{sheetId:KPI_SHEET_ID,startRow:0},{token:f.admin.token})).code,"VALIDATION");
 const read=assertSuccess(request(f.harness,"managementTable",{sheetId:KPI_SHEET_ID,startRow:1},{token:f.admin.token}));assert.equal(read.rows.length,50);assert.equal(read.rows[1].cells[1].readonly,true);assert.ok(f.harness.sheetReads.at(-1).options.ranges[0].endsWith("A1:Z50"));
});
test("administrative input changes preserve formulas, validation and literal formula-looking text",()=>{
 const f=signedInFixture(),sheet=f.harness.spreadsheet.insertSheet("案件管理表");sheet.getRange(2,1,1,3).setValues([["案件","ステータス","原価"]]);sheet.getRange(3,1,1,3).setValues([["案件A","募集中","=1+2"]]);sheet.validations["3,2"]={strict:true,condition:{type:"ONE_OF_LIST",values:[{userEnteredValue:"募集中"},{userEnteredValue:"停止"}]}};
 const read=()=>assertSuccess(request(f.harness,"managementTable",{sheetId:sheet.id,startRow:1},{token:f.admin.token})).rows.find(r=>r.row===3);
 const initial=read(),id=randomUUID();const save=changes=>request(f.harness,"saveManagementRow",{sheetId:sheet.id,row:3,rowVersion:initial.version,changes},{token:f.admin.token,operationId:randomUUID()});
 assert.equal(assertFailure(save({2:"不正選択"})).code,"VALIDATION");assert.equal(assertFailure(save({3:1})).code,"FORMULA_PROTECTED");
 const result=assertSuccess(request(f.harness,"saveManagementRow",{sheetId:sheet.id,row:3,rowVersion:initial.version,changes:{1:"=literal",2:"停止"}},{token:f.admin.token,operationId:id}));
 // The mock's setValues parses formulas; inspect the actual request instead.
 const literal=f.harness.apiCalls.at(-1).body.requests[0].updateCells.rows[0].values[0];assert.deepEqual(literal.userEnteredValue,{stringValue:"=literal"});assert.equal(sheet.formulas[2][0],"");assert.equal(sheet.formulas[2][2],"=1+2");assert.equal(result.changeId,id);
 assert.equal(assertFailure(save({2:"募集中"})).code,"CONFLICT");
 assertSuccess(request(f.harness,"restoreChange",{changeId:id},{token:f.admin.token,operationId:randomUUID()}));assert.equal(sheet.values[2][0],"案件A");
});

test("a waiting candidate records its first interview on the existing row",()=>{
 const f=signedInFixture();
 const created=assertSuccess(request(f.harness,"createCandidate",{candidateName:"面談予定候補",playerId:"ND-001",company:"予定企業",position:"FS"},{token:f.player.token,operationId:randomUUID()}));
 const r=created.snapshot.records.find(r=>r.candidateName==="面談予定候補");assert.ok(r.candidateId);
 const saved=assertSuccess(request(f.harness,"saveActivity",{activity:{playerId:"ND-001",recordId:r.recordId,rowVersion:r.rowVersion,candidateId:r.candidateId,candidateName:r.candidateName,source:r.source,company:"",position:"FS",stage:"候補者面談",date:"2026-10-06"}},{token:f.player.token,operationId:randomUUID()}));
 assert.equal(saved.snapshot.records.length,created.snapshot.records.length);
 const after=saved.snapshot.records.find(x=>x.recordId===r.recordId);assert.equal(after.values[0],"2026-10-06");assert.equal(after.values[1],"予定企業");
 assert.equal(saved.snapshot.counts["2026-10"]["ND-001"]["候補者面談"],3);
});
test("later management pages retain the original field headings",()=>{
 const f=signedInFixture(),sheet=f.harness.spreadsheet.insertSheet("案件管理表");sheet.getRange(2,1,1,3).setValues([["案件名","ステータス","原価"]]);
 const page=assertSuccess(request(f.harness,"managementTable",{sheetId:sheet.id,startRow:51},{token:f.admin.token}));
 assert.equal(page.rows[0].row,51);assert.equal(page.headers[0],"案件名");assert.equal(page.headers[2],"原価");
 assert.ok(f.harness.sheetReads.some(read=>read.options.ranges?.[0]?.endsWith("A2:Z2")));
});
