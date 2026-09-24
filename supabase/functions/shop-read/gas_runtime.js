// ตัวจำลอง Google Apps Script สำหรับรันฟังก์ชันจาก Members.gs (gas_port.js) บนสำเนาชีตใน Supabase
//
// จำลองเท่าที่ฟังก์ชันอ่าน/คำนวณใช้: SpreadsheetApp (อ่านอย่างเดียว), PropertiesService, CacheService (ไม่จำ),
// LockService, Utilities, Logger, Session และ Date ที่เป็นเวลาไทยเหมือน Apps Script (timeZone Asia/Bangkok)
//
// การเขียนใดๆ (setValue, appendRow, insertSheet, ...) ไม่ทำจริง แต่ถูกจดไว้ใน tracker.writes และเมธอดที่ไม่รู้จัก
// จะถูกจดไว้ใน tracker.unsupported — Edge Function จะไม่ใช้ผลลัพธ์นั้นและให้หน้าเว็บถาม Apps Script แทน
// ใช้ได้ทั้ง Deno (Edge Function) และ Node (ทดสอบ)

const BKK_OFFSET_MS = 7 * 3600 * 1000;
// Script Properties ที่ Apps Script คัดลอกมาเก็บเป็นแท็บพิเศษ (คอลัมน์ key, value)
export const PROPS_KEY = 'props/script';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RealDate = globalThis.Date;

// ---------------------------------------------------------------------------
// Date เวลาไทย (ไทยไม่มีเวลาออมแสง จึงบวก 7 ชั่วโมงคงที่ได้)
// ---------------------------------------------------------------------------
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n, w = 2) => String(n).padStart(w, '0');

// เวลาที่เขียนโดยไม่ระบุโซน ("2026-09-23 10:00", "Sep 23 2026") ต้องตีความเป็นเวลาไทยเหมือน Apps Script
function parseAsBangkok(s) {
  const trimmed = String(s).trim();
  const t = RealDate.parse(trimmed);
  if (isNaN(t)) return NaN;
  const hasZone = /(Z|[+-]\d{2}:?\d{2}|GMT[+-]?\d*|UTC)\s*(\([^)]*\))?$/i.test(trimmed);
  const dateOnlyIso = /^\d{4}-\d{2}(-\d{2})?$/.test(trimmed); // ตามมาตรฐาน JS ตีความเป็น UTC
  if (hasZone || dateOnlyIso) return t;
  // RealDate.parse ตีความตามโซนของเครื่องที่รัน แปลงกลับเป็น "เวลาบนหน้าปัด" แล้วตีเป็นเวลาไทย
  const hostOffsetMs = -new RealDate(t).getTimezoneOffset() * 60000;
  return t + hostOffsetMs - BKK_OFFSET_MS;
}

export class BkkDate extends RealDate {
  constructor(...a) {
    if (a.length === 0) { super(); return; }
    if (a.length >= 2) {
      const [y, mo, d = 1, h = 0, mi = 0, s = 0, ms = 0] = a.map(Number);
      super(RealDate.UTC(y, mo, d, h, mi, s, ms) - BKK_OFFSET_MS);
      return;
    }
    const v = a[0];
    if (typeof v === 'string') { super(parseAsBangkok(v)); return; }
    super(v instanceof RealDate ? v.getTime() : v);
  }
  static parse(s) { return parseAsBangkok(s); }
  _wall() { return new RealDate(this.getTime() + BKK_OFFSET_MS); }
  _setWall(fn) {
    const w = this._wall();
    fn(w);
    return this.setTime(w.getTime() - BKK_OFFSET_MS);
  }
  getFullYear() { return this._wall().getUTCFullYear(); }
  getMonth() { return this._wall().getUTCMonth(); }
  getDate() { return this._wall().getUTCDate(); }
  getDay() { return this._wall().getUTCDay(); }
  getHours() { return this._wall().getUTCHours(); }
  getMinutes() { return this._wall().getUTCMinutes(); }
  getSeconds() { return this._wall().getUTCSeconds(); }
  getMilliseconds() { return this._wall().getUTCMilliseconds(); }
  getYear() { return this.getFullYear() - 1900; }
  getTimezoneOffset() { return -420; }
  setFullYear(...a) { return this._setWall((w) => w.setUTCFullYear(...a)); }
  setMonth(...a) { return this._setWall((w) => w.setUTCMonth(...a)); }
  setDate(...a) { return this._setWall((w) => w.setUTCDate(...a)); }
  setHours(...a) { return this._setWall((w) => w.setUTCHours(...a)); }
  setMinutes(...a) { return this._setWall((w) => w.setUTCMinutes(...a)); }
  setSeconds(...a) { return this._setWall((w) => w.setUTCSeconds(...a)); }
  setMilliseconds(...a) { return this._setWall((w) => w.setUTCMilliseconds(...a)); }
  toLocaleDateString(loc, opts) { return RealDate.prototype.toLocaleDateString.call(this, loc, { timeZone: 'Asia/Bangkok', ...(opts || {}) }); }
  toLocaleTimeString(loc, opts) { return RealDate.prototype.toLocaleTimeString.call(this, loc, { timeZone: 'Asia/Bangkok', ...(opts || {}) }); }
  toLocaleString(loc, opts) { return RealDate.prototype.toLocaleString.call(this, loc, { timeZone: 'Asia/Bangkok', ...(opts || {}) }); }
  toDateString() {
    if (isNaN(this.getTime())) return 'Invalid Date';
    const w = this._wall();
    return `${DAY_NAMES[w.getUTCDay()]} ${MONTH_NAMES[w.getUTCMonth()]} ${pad(w.getUTCDate())} ${pad(w.getUTCFullYear(), 4)}`;
  }
  toTimeString() {
    if (isNaN(this.getTime())) return 'Invalid Date';
    const w = this._wall();
    return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}:${pad(w.getUTCSeconds())} GMT+0700 (Indochina Time)`;
  }
  toString() {
    if (isNaN(this.getTime())) return 'Invalid Date';
    return this.toDateString() + ' ' + this.toTimeString();
  }
}

// ---------------------------------------------------------------------------
// Utilities.formatDate (รูปแบบ SimpleDateFormat ที่ Members.gs ใช้)
// ---------------------------------------------------------------------------
function tzOffsetMs(tz) {
  const s = String(tz || '').trim();
  const m = s.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (m) return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3] || 0) * 60) * 1000;
  if (/^(GMT|UTC)$/i.test(s)) return 0;
  if (s === 'Asia/Bangkok' || s === '') return BKK_OFFSET_MS;
  throw new Error('gas_runtime: ไม่รองรับ timezone ' + s);
}

function formatDate(date, tz, pattern) {
  const d = date instanceof RealDate ? date : new BkkDate(date);
  const w = new RealDate(d.getTime() + tzOffsetMs(tz));
  const f = {
    yyyy: () => pad(w.getUTCFullYear(), 4), yy: () => pad(w.getUTCFullYear() % 100),
    MMMM: () => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][w.getUTCMonth()],
    MMM: () => MONTH_NAMES[w.getUTCMonth()], MM: () => pad(w.getUTCMonth() + 1), M: () => String(w.getUTCMonth() + 1),
    dd: () => pad(w.getUTCDate()), d: () => String(w.getUTCDate()),
    EEEE: () => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][w.getUTCDay()],
    EEE: () => DAY_NAMES[w.getUTCDay()],
    HH: () => pad(w.getUTCHours()), H: () => String(w.getUTCHours()),
    hh: () => pad(w.getUTCHours() % 12 || 12), h: () => String(w.getUTCHours() % 12 || 12),
    mm: () => pad(w.getUTCMinutes()), m: () => String(w.getUTCMinutes()),
    ss: () => pad(w.getUTCSeconds()), s: () => String(w.getUTCSeconds()),
    SSS: () => pad(w.getUTCMilliseconds(), 3), a: () => (w.getUTCHours() < 12 ? 'AM' : 'PM'),
  };
  return String(pattern).replace(/'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|m|ss|s|SSS|a/g,
    (tok, quoted) => (quoted !== undefined ? quoted : f[tok]()));
}

// ---------------------------------------------------------------------------
// base64 / blob เท่าที่ decodeItemsB64_ ใช้
// ---------------------------------------------------------------------------
function base64ToBytes(b64, webSafe) {
  let s = String(b64 || '');
  if (webSafe) s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    const b = bin.charCodeAt(i);
    out[i] = b > 127 ? b - 256 : b; // Apps Script คืน byte แบบมีเครื่องหมาย
  }
  return out;
}
function newBlob(bytes) {
  const u8 = Uint8Array.from(bytes || [], (b) => b & 0xff);
  return { getDataAsString: () => new TextDecoder('utf-8').decode(u8), getBytes: () => Array.from(bytes || []) };
}

// ---------------------------------------------------------------------------
// ตัวจำลองชีต
// ---------------------------------------------------------------------------

// แปลงข้อมูลแท็บจาก mirror_get_tabs เป็นรูปที่อ่านเร็ว (เก็บไว้ใช้ซ้ำข้ามคำขอได้)
export function prepareTab(key, raw) {
  const rows = new Map();
  let lastRow = 0;
  for (const [rowNum, data] of raw.rows || []) {
    rows.set(rowNum, data);
    if (rowNum > lastRow) lastRow = rowNum;
  }
  const rawHeaders = Array.isArray(raw.raw_headers) ? raw.raw_headers : (raw.headers || []);
  if (!lastRow && rawHeaders.length) lastRow = 1;
  const slash = key.indexOf('/');
  return {
    key, source: key.slice(0, slash), name: key.slice(slash + 1),
    spreadsheetId: raw.spreadsheet_id, headers: raw.headers || [], rawHeaders, rows, lastRow,
    lastColumn: rawHeaders.length,
  };
}

function cellValue(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' && ISO_DATE_RE.test(v)) return new BkkDate(v);
  if (typeof v === 'object') return JSON.parse(JSON.stringify(v));
  return v;
}

class UnsupportedError extends Error {}

// ห่อ object ให้เมธอดที่ไม่ได้จำลองไว้ถูกจดและโยน error (ห้ามเงียบแล้วคืนค่าผิด)
function guard(obj, label, tracker) {
  return new Proxy(obj, {
    get(target, prop) {
      if (prop in target || typeof prop === 'symbol') return target[prop];
      return () => {
        const msg = `gas_runtime: ${label}.${String(prop)} ยังไม่รองรับ`;
        tracker.unsupported.push(msg);
        throw new UnsupportedError(msg);
      };
    },
  });
}

const WRITE_METHODS = ['setValue', 'setValues', 'setNumberFormat', 'setNumberFormats', 'clearContent', 'clear',
  'setFontWeight', 'setBackground', 'setNote', 'setFormula', 'setFormulas', 'setDataValidation', 'insertCheckboxes'];
const SHEET_WRITE_METHODS = ['appendRow', 'insertRowAfter', 'insertRowBefore', 'insertRows', 'insertRowsAfter',
  'deleteRow', 'deleteRows', 'setFrozenRows', 'setColumnWidth', 'hideColumns', 'autoResizeColumns', 'setName',
  'insertColumnAfter', 'insertColumns', 'sort'];

function makeRange(tab, tracker, row, col, numRows, numCols) {
  const range = {
    getValues() {
      const out = [];
      for (let r = row; r < row + numRows; r++) {
        const line = new Array(numCols);
        const data = r === 1 ? null : tab.rows.get(r);
        for (let c = col; c < col + numCols; c++) {
          let v;
          if (r === 1) v = tab.rawHeaders[c - 1];
          else v = data ? data[tab.headers[c - 1]] : undefined;
          line[c - col] = cellValue(v);
        }
        out.push(line);
      }
      return out;
    },
    getValue() { return range.getValues()[0][0]; },
    getRow: () => row, getColumn: () => col, getNumRows: () => numRows, getNumColumns: () => numCols,
    getLastRow: () => row + numRows - 1, getLastColumn: () => col + numCols - 1,
  };
  for (const m of WRITE_METHODS) range[m] = () => { tracker.writes.push(`${tab.key} range.${m}`); return range; };
  return guard(range, 'Range', tracker);
}

function makeSheet(tab, tracker) {
  tracker.accessed.add(tab.key);
  const sheet = {
    getName: () => tab.name,
    getLastRow: () => tab.lastRow,
    getLastColumn: () => tab.lastColumn,
    getMaxRows: () => Math.max(tab.lastRow, 1000),
    getMaxColumns: () => Math.max(tab.lastColumn, 26),
    getRange(a, b, c, d) {
      if (typeof a !== 'number') {
        tracker.unsupported.push('gas_runtime: getRange แบบ A1 ยังไม่รองรับ');
        throw new UnsupportedError('gas_runtime: getRange แบบ A1 ยังไม่รองรับ');
      }
      return makeRange(tab, tracker, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
    },
    getDataRange() { return makeRange(tab, tracker, 1, 1, Math.max(tab.lastRow, 1), Math.max(tab.lastColumn, 1)); },
  };
  for (const m of SHEET_WRITE_METHODS) sheet[m] = () => { tracker.writes.push(`${tab.key} sheet.${m}`); return sheet; };
  return guard(sheet, 'Sheet', tracker);
}

// ชีตว่างที่ใช้ตอนโค้ดสั่ง insertSheet (ถูกจดเป็นการเขียนแล้ว ผลลัพธ์จะไม่ถูกใช้)
function emptyTab(source, name) {
  return prepareTab(source + '/' + name, { rows: [], raw_headers: [], headers: [] });
}

// ---------------------------------------------------------------------------
// สร้าง env ต่อ 1 คำขอ
// ---------------------------------------------------------------------------
// tabs: Map<'source/tab', prepared tab>, props: object ของ Script Properties ที่คัดลอกมา
// profile: ผลตรวจโทเคน LINE (รูปแบบเดียวกับ LINE verify API)
export function createEnv({ tabs, loadedSources, props, profile }) {
  // loadedSources: แท็บทั้งหมดที่ขอโหลดมา (แท็บที่ขอแล้วแต่ไม่มีในสำเนา = ไม่มีอยู่จริงในชีต)
  const tracker = { accessed: new Set(), writes: [], unsupported: [], logs: [] };
  const sourcesById = new Map();
  for (const tab of tabs.values()) if (tab.spreadsheetId) sourcesById.set(tab.spreadsheetId, tab.source);

  function openById(id) {
    const source = sourcesById.get(id);
    if (!source) {
      tracker.unsupported.push('gas_runtime: ไม่รู้จัก spreadsheet ' + id);
      throw new UnsupportedError('gas_runtime: ไม่รู้จัก spreadsheet ' + id);
    }
    const ss = {
      getId: () => id,
      getSheetByName(name) {
        const key = source + '/' + name;
        const tab = tabs.get(key);
        if (tab) return makeSheet(tab, tracker);
        // แท็บที่ไม่ได้โหลดมา: ถ้ามีอยู่จริงในสำเนาแต่ไม่ได้โหลด ถือว่ารองรับไม่ครบ ให้ถาม Apps Script แทน
        if (!loadedSources.has(key)) {
          tracker.unsupported.push('gas_runtime: ไม่ได้โหลดแท็บ ' + key);
          throw new UnsupportedError('gas_runtime: ไม่ได้โหลดแท็บ ' + key);
        }
        return null;
      },
      insertSheet(name) {
        tracker.writes.push(`${source}/${name} insertSheet`);
        return makeSheet(emptyTab(source, name), tracker);
      },
    };
    return guard(ss, 'Spreadsheet', tracker);
  }

  const noCache = { get: () => null, getAll: () => ({}), put() {}, putAll() {}, remove() {}, removeAll() {} };
  const scriptProps = {
    getProperty: (k) => {
      tracker.accessed.add(PROPS_KEY);
      return Object.prototype.hasOwnProperty.call(props, k) ? String(props[k]) : null;
    },
    getProperties: () => ({ ...props }),
    getKeys: () => Object.keys(props),
    // การตั้งค่า property ในฟังก์ชันอ่าน เป็นแค่แคชของ Apps Script ไม่ต้องทำ
    setProperty() { return scriptProps; }, setProperties() { return scriptProps; }, deleteProperty() { return scriptProps; },
  };
  const lock = { waitLock() {}, tryLock: () => true, releaseLock() {}, hasLock: () => true };
  const log = (...a) => { tracker.logs.push(a.map(String).join(' ')); };

  const env = {
    Date: BkkDate,
    SpreadsheetApp: guard({ openById, flush() {} }, 'SpreadsheetApp', tracker),
    CacheService: { getScriptCache: () => noCache, getUserCache: () => noCache, getDocumentCache: () => noCache },
    PropertiesService: { getScriptProperties: () => scriptProps },
    LockService: { getScriptLock: () => lock, getUserLock: () => lock, getDocumentLock: () => lock },
    Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
    Logger: { log },
    Utilities: guard({
      formatDate,
      base64Decode: (s) => base64ToBytes(s, false),
      base64DecodeWebSafe: (s) => base64ToBytes(s, true),
      newBlob,
      sleep() {},
    }, 'Utilities', tracker),
    verifyLineIdToken_: () => profile,
    logErrorToSheet_: (action, text) => log('logErrorToSheet_', action, text),
    ensureDebugLogSheet_: () => {
      tracker.unsupported.push('gas_runtime: ensureDebugLogSheet_');
      throw new UnsupportedError('gas_runtime: ensureDebugLogSheet_');
    },
    logSlowAction_() {},
    logRegistrationQueueWait_() {},
  };
  return { env, tracker };
}
