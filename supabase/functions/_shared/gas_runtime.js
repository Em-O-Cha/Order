// ตัวจำลอง Google Apps Script สำหรับรันฟังก์ชันจาก Members.gs (gas_port.js) บนสำเนาชีตใน Supabase
//
// จำลองเท่าที่ฟังก์ชันอ่าน/คำนวณใช้: SpreadsheetApp (อ่านอย่างเดียว), PropertiesService, CacheService (ไม่จำ),
// LockService, Utilities, Logger, Session และ Date ที่เป็นเวลาไทยเหมือน Apps Script (timeZone Asia/Bangkok)
//
// การเขียนใดๆ (setValue, appendRow, insertSheet, ...) ไม่ทำจริง แต่ถูกจดไว้ใน tracker.writes และเมธอดที่ไม่รู้จัก
// จะถูกจดไว้ใน tracker.unsupported — Edge Function จะไม่ใช้ผลลัพธ์นั้นและให้หน้าเว็บถาม Apps Script แทน
//
// โหมดบันทึกการเขียน (createEnv({ journal: true })): การเขียนมีผลกับสำเนาในหน่วยความจำของคำขอนั้น
// (อ่านซ้ำแล้วเห็นค่าใหม่เหมือนชีตจริง ไม่แตะแคชที่ใช้ร่วมกัน) และถูกจดครบทุกค่าไว้ใน tracker.journal
// เพื่อนำไปเทียบกับ/เขียนลงชีตจริงภายหลัง การเขียนที่เลื่อนแถว (insertRow/deleteRow/sort) ยังไม่รองรับ
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
  // แท็บแบบ meta_only (signup_prepare): ได้แค่หัวตาราง + แถวสุดท้าย ใช้กับโค้ดที่แค่ต่อท้ายแท็บ
  // อ่านแถวข้อมูลเดิมไม่ได้ (ตัวจำลองจะปฏิเสธแทนการคืนค่าว่างผิดๆ)
  const metaOnly = !!raw.meta_only;
  if (metaOnly && raw.last_row) lastRow = Math.max(lastRow, raw.last_row);
  if (!lastRow && rawHeaders.length) lastRow = 1;
  const slash = key.indexOf('/');
  return {
    key, source: key.slice(0, slash), name: key.slice(slash + 1),
    spreadsheetId: raw.spreadsheet_id, headers: raw.headers || [], rawHeaders, rows, lastRow,
    lastColumn: rawHeaders.length, metaOnly, metaLastRow: metaOnly ? lastRow : 0,
    // ฉบับย่อ (mirror_load 'source/tab#slim'): ทุกแถวมีแค่คอลัมน์เหล่านี้ ช่องอื่นถูกซ่อน
    slimCols: Array.isArray(raw.slim_cols) ? new Set(raw.slim_cols) : null,
    slimRows: null,
  };
}

// รวมฉบับย่อกับแถวเต็มของเจ้าของ (ลูกค้าที่ถาม): แถวเจ้าของอ่านได้ทุกช่อง แถวอื่นอ่านได้แค่คอลัมน์ในฉบับย่อ
// ownerRows: [[rowNum, data], ...] จาก mirror_load (ข้อมูลรอบคัดลอกเดียวกับฉบับย่อ)
export function withOwnerRows(slimTab, key, ownerRows) {
  const rows = new Map(slimTab.rows);
  const slimRows = new Set(slimTab.rows.keys());
  let lastRow = slimTab.lastRow;
  for (const [rowNum, data] of ownerRows || []) {
    rows.set(rowNum, data);
    slimRows.delete(rowNum);
    if (rowNum > lastRow) lastRow = rowNum;
  }
  const slash = key.indexOf('/');
  return { ...slimTab, key, source: key.slice(0, slash), name: key.slice(slash + 1), rows, slimRows, lastRow };
}

function cellValue(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' && ISO_DATE_RE.test(v)) return new BkkDate(v);
  if (typeof v === 'object') return JSON.parse(JSON.stringify(v));
  return v;
}

class UnsupportedError extends Error {}

// ช่องที่ถูกซ่อนในฉบับย่อ: โค้ดเดิมอ่านแถวเป็นก้อนแล้วทิ้งแถวของคนอื่นไปได้ตามปกติ แต่ถ้าเอาค่าไปใช้จริง
// (แปลงเป็นข้อความ/ตัวเลข/วันที่/JSON) จะถูกจดว่า "ข้อมูลย่อ" แล้ว shop-read จะโหลดแท็บเต็มแล้วรันใหม่
export const SLIM_HIDDEN = 'gas_runtime: ข้อมูลย่อ ';
function hiddenCell(tracker, key, row, header) {
  const trip = () => {
    const msg = `${SLIM_HIDDEN}${key} แถว ${row} ${header}`;
    tracker.unsupported.push(msg);
    throw new UnsupportedError(msg);
  };
  return Object.freeze({ [Symbol.toPrimitive]: trip, toString: trip, valueOf: trip, toJSON: trip });
}

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

// โหมดบันทึกการเขียน: เมธอดที่เปลี่ยนค่าในเซลล์ (มีผลกับการอ่านครั้งถัดไป)
const JOURNAL_VALUE_METHODS = new Set(['setValue', 'setValues', 'clearContent']);
// เมธอดรูปแบบ/การแสดงผล: จดไว้อย่างเดียว ไม่เปลี่ยนค่า
const JOURNAL_FORMAT_METHODS = new Set(['setNumberFormat', 'setNumberFormats', 'setFontWeight', 'setBackground',
  'setNote', 'setFrozenRows', 'setColumnWidth', 'hideColumns', 'autoResizeColumns']);

// ค่าในบันทึกการเขียน: Date เป็น { $date: ISO } ที่เหลือเป็นค่า JSON ตามจริง
function journalValue(v) {
  if (v instanceof RealDate) return { $date: isNaN(v.getTime()) ? null : v.toISOString() };
  if (v === undefined) return null;
  return v;
}
// ค่าที่เก็บในสำเนา: รูปแบบเดียวกับ mirror.rows (Date เป็น ISO, ช่องว่างไม่เก็บ)
function storedValue(v) {
  if (v instanceof RealDate) return isNaN(v.getTime()) ? '' : v.toISOString();
  if (v === undefined || v === null) return '';
  return v;
}

// ctx: { tabs (Map ของคำขอนี้), tracker, journal, writable(key) }
function makeRange(key, ctx, row, col, numRows, numCols) {
  const { tracker } = ctx;
  const tab = () => ctx.tabs.get(key);
  const range = {
    getValues() {
      const t = tab();
      if (t.metaOnly) {
        for (let r = Math.max(row, 2); r < row + numRows && r <= t.metaLastRow; r++) {
          if (!t.rows.has(r)) {
            const msg = `gas_runtime: ${key} โหลดมาแค่แถวสุดท้าย อ่านแถว ${r} ไม่ได้`;
            tracker.unsupported.push(msg);
            throw new UnsupportedError(msg);
          }
        }
      }
      const out = [];
      for (let r = row; r < row + numRows; r++) {
        const line = new Array(numCols);
        const data = r === 1 ? null : t.rows.get(r);
        for (let c = col; c < col + numCols; c++) {
          let v;
          if (r === 1) v = t.rawHeaders[c - 1];
          else if (t.slimRows && t.slimRows.has(r) && !t.slimCols.has(t.headers[c - 1])) {
            line[c - col] = hiddenCell(tracker, key, r, t.headers[c - 1]);
            continue;
          } else v = data ? data[t.headers[c - 1]] : undefined;
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
  for (const m of WRITE_METHODS) {
    range[m] = (...args) => {
      tracker.writes.push(`${key} range.${m}`);
      if (!ctx.journal) return range;
      if (JOURNAL_VALUE_METHODS.has(m)) {
        let values;
        if (m === 'setValues') values = args[0];
        else if (m === 'setValue') values = Array.from({ length: numRows }, () => new Array(numCols).fill(args[0]));
        else values = Array.from({ length: numRows }, () => new Array(numCols).fill(''));
        if (!Array.isArray(values) || values.length !== numRows || values.some((l) => !Array.isArray(l) || l.length !== numCols)) {
          const msg = `gas_runtime: ${key} range.${m} ขนาดข้อมูลไม่ตรงกับช่วง`;
          tracker.unsupported.push(msg);
          throw new UnsupportedError(msg);
        }
        applyValues(ctx, key, row, col, values);
        tracker.journal.push({ tab: key, op: 'setValues', row, col, values: values.map((l) => l.map(journalValue)) });
      } else if (JOURNAL_FORMAT_METHODS.has(m)) {
        tracker.journal.push({ tab: key, op: m, row, col, numRows, numCols, args: args.map(journalValue) });
      } else {
        const msg = `gas_runtime: ${key} range.${m} ยังไม่รองรับในโหมดบันทึกการเขียน`;
        tracker.unsupported.push(msg);
        throw new UnsupportedError(msg);
      }
      return range;
    };
  }
  return guard(range, 'Range', tracker);
}

// ctx.writable(key): คืนแท็บที่แก้ได้ของคำขอนี้ (คัดลอกก่อนแก้ครั้งแรก จึงไม่กระทบแคชที่ใช้ร่วมกันระหว่างคำขอ)
function attachWritable(ctx) {
  ctx.writable = (key) => {
    if (!ctx.cloned.has(key)) {
      const t = ctx.tabs.get(key);
      ctx.tabs.set(key, { ...t, rows: new Map(t.rows), headers: [...t.headers], rawHeaders: [...t.rawHeaders] });
      ctx.cloned.add(key);
    }
    return ctx.tabs.get(key);
  };
  return ctx;
}

// ค่าจาก journal ({ $date: ISO } -> Date) ก่อนเขียนซ้ำ
function fromJournal(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, '$date')) {
    return v.$date ? new RealDate(v.$date) : '';
  }
  return v;
}

// เล่น journal ของการสมัครที่ Supabase รับแล้วแต่ยังไม่อยู่ในสำเนาทับลงไป (ตามลำดับเวลา) ให้การเช็คซ้ำและการออก
// รหัสสมาชิกนับรวมด้วย — แถวที่เกิน base_rows (ต่อท้าย) จะต่อท้ายแท็บปัจจุบันตามลำดับเดิม, แถวเดิมแก้ที่เดิม
// pending: [{ journal, base_rows }] คืน Map ใหม่ (แท็บที่ไม่ถูกแตะใช้ object เดิม)
export function overlayJournals(tabs, pending) {
  const ctx = attachWritable({ tabs: new Map(tabs), cloned: new Set() });
  for (const p of pending || []) {
    const offsets = {};
    for (const e of p.journal || []) {
      if ((e.op !== 'setValues' && e.op !== 'appendRow') || !ctx.tabs.has(e.tab)) continue;
      const base = (p.base_rows && p.base_rows[e.tab]) || 0;
      if (!(e.tab in offsets)) offsets[e.tab] = ctx.tabs.get(e.tab).lastRow - base;
      const values = (e.op === 'appendRow' ? [e.values] : e.values).map((line) => line.map(fromJournal));
      const row = e.row > base ? e.row + offsets[e.tab] : e.row;
      applyValues(ctx, e.tab, row, e.op === 'appendRow' ? 1 : e.col, values);
    }
  }
  return ctx.tabs;
}

// เขียนค่าลงสำเนาของคำขอนี้
function applyValues(ctx, key, row, col, values) {
  const t = ctx.writable(key);
  for (let i = 0; i < values.length; i++) {
    const r = row + i;
    let data = null;
    if (r !== 1) data = { ...(t.rows.get(r) || {}) };
    for (let j = 0; j < values[i].length; j++) {
      const c = col + j;
      const v = storedValue(values[i][j]);
      if (r === 1) {
        t.rawHeaders[c - 1] = v;
        if (t.headers[c - 1] === undefined) t.headers[c - 1] = String(v);
      } else {
        if (t.headers[c - 1] === undefined) t.headers[c - 1] = '__col' + c;
        if (v === '') delete data[t.headers[c - 1]];
        else data[t.headers[c - 1]] = v;
      }
      if (v !== '' && c > t.lastColumn) t.lastColumn = c;
    }
    if (r === 1) {
      if (r > t.lastRow) t.lastRow = r;
      continue;
    }
    if (Object.keys(data).length) {
      t.rows.set(r, data);
      if (r > t.lastRow) t.lastRow = r;
    } else {
      t.rows.delete(r);
      if (r === t.lastRow) {
        let last = 1;
        for (const k of t.rows.keys()) if (k > last) last = k;
        t.lastRow = t.rawHeaders.length ? last : (t.rows.size ? last : 0);
      }
    }
  }
}

function makeSheet(key, ctx) {
  const { tracker } = ctx;
  tracker.accessed.add(key);
  const tab = () => ctx.tabs.get(key);
  const sheet = {
    getName: () => tab().name,
    getLastRow: () => tab().lastRow,
    getLastColumn: () => tab().lastColumn,
    getMaxRows: () => Math.max(tab().lastRow, 1000),
    getMaxColumns: () => Math.max(tab().lastColumn, 26),
    getRange(a, b, c, d) {
      if (typeof a !== 'number') {
        tracker.unsupported.push('gas_runtime: getRange แบบ A1 ยังไม่รองรับ');
        throw new UnsupportedError('gas_runtime: getRange แบบ A1 ยังไม่รองรับ');
      }
      return makeRange(key, ctx, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
    },
    getDataRange() { return makeRange(key, ctx, 1, 1, Math.max(tab().lastRow, 1), Math.max(tab().lastColumn, 1)); },
  };
  for (const m of SHEET_WRITE_METHODS) {
    sheet[m] = (...args) => {
      tracker.writes.push(`${key} sheet.${m}`);
      if (!ctx.journal) return sheet;
      if (m === 'appendRow') {
        const values = Array.isArray(args[0]) ? args[0] : [];
        const row = tab().lastRow + 1;
        applyValues(ctx, key, row, 1, [values]);
        tracker.journal.push({ tab: key, op: 'appendRow', row, values: values.map(journalValue) });
      } else if (JOURNAL_FORMAT_METHODS.has(m)) {
        tracker.journal.push({ tab: key, op: m, args: args.map(journalValue) });
      } else {
        const msg = `gas_runtime: ${key} sheet.${m} ยังไม่รองรับในโหมดบันทึกการเขียน`;
        tracker.unsupported.push(msg);
        throw new UnsupportedError(msg);
      }
      return sheet;
    };
  }
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
// journal: เปิดโหมดบันทึกการเขียน (ดูหัวไฟล์) — ผลอยู่ใน tracker.journal
export function createEnv({ tabs, loadedSources, props, profile, journal = false }) {
  // loadedSources: แท็บทั้งหมดที่ขอโหลดมา (แท็บที่ขอแล้วแต่ไม่มีในสำเนา = ไม่มีอยู่จริงในชีต)
  const tracker = { accessed: new Set(), writes: [], unsupported: [], logs: [], journal: [] };
  const ctx = attachWritable({ tabs: new Map(tabs), tracker, journal, cloned: new Set() });
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
        if (ctx.tabs.has(key)) return makeSheet(key, ctx);
        // แท็บที่ไม่ได้โหลดมา: ถ้ามีอยู่จริงในสำเนาแต่ไม่ได้โหลด ถือว่ารองรับไม่ครบ ให้ถาม Apps Script แทน
        if (!loadedSources.has(key)) {
          tracker.unsupported.push('gas_runtime: ไม่ได้โหลดแท็บ ' + key);
          throw new UnsupportedError('gas_runtime: ไม่ได้โหลดแท็บ ' + key);
        }
        return null;
      },
      insertSheet(name) {
        const key = source + '/' + name;
        tracker.writes.push(`${key} insertSheet`);
        const tab = emptyTab(source, name);
        tab.spreadsheetId = id;
        ctx.tabs.set(key, tab);
        ctx.cloned.add(key);
        if (journal) tracker.journal.push({ tab: key, op: 'insertSheet' });
        return makeSheet(key, ctx);
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
