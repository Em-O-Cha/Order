// Minimal Google Apps Script mock for running Members.gs + SupabaseSync.gs + SupabaseSignup.gs in Node (TZ=Asia/Bangkok)
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { sql, lit } from './sql.mjs';

const FAKE_URL = 'https://fake.supabase.co';
export const log = [];
const unsupported = [];

// ---------- spreadsheets ----------
const books = new Map(); // id -> { id, name, sheets: Map(name -> sheet) }
function cellEmpty(v) { return v === '' || v === null || v === undefined; }
function makeSheetObj(book, name, grid) {
  const st = { name, grid: grid || [], fmt: new Map() }; // grid[r][c] (0-based)
  const lastRow = () => { for (let r = st.grid.length - 1; r >= 0; r--) if ((st.grid[r] || []).some(v => !cellEmpty(v))) return r + 1; return 0; };
  const lastCol = () => { let m = 0; st.grid.forEach(row => (row || []).forEach((v, c) => { if (!cellEmpty(v)) m = Math.max(m, c + 1); })); return m; };
  const get = (r, c) => { const row = st.grid[r - 1]; const v = row ? row[c - 1] : undefined; return cellEmpty(v) ? '' : v; };
  const set = (r, c, v) => {
    while (st.grid.length < r) st.grid.push([]);
    const f = st.fmt.get(r + ':' + c);
    if (typeof v === 'string' && f !== '@STRING@' && f !== '@' && /^-?\d+(\.\d+)?$/.test(v.trim())) v = Number(v); // Sheets parses numbers
    st.grid[r - 1][c - 1] = v;
  };
  function range(r, c, nr = 1, nc = 1) {
    const R = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = get(r + i, c + j); return v instanceof Date ? new Date(v.getTime()) : v; })),
      getValue: () => get(r, c),
      setValues: (vals) => { if (vals.length !== nr || vals.some(l => l.length !== nc)) throw new Error(`setValues size mismatch ${name} ${r},${c} ${nr}x${nc}`); vals.forEach((l, i) => l.forEach((v, j) => set(r + i, c + j, v))); return R; },
      setValue: (v) => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) set(r + i, c + j, v); return R; },
      setNumberFormat: (f) => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) st.fmt.set((r + i) + ':' + (c + j), f); return R; },
      getNumberFormat: () => { const f = st.fmt.get(r + ':' + c); return f === '@STRING@' ? '' : (f || '0.###############'); },
      clearFormat: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) st.fmt.delete((r + i) + ':' + (c + j)); return R; },
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) set(r + i, c + j, ''); return R; },
      setFontWeight: () => R, setBackground: () => R, setNote: () => R,
      getRow: () => r, getColumn: () => c, getNumRows: () => nr, getNumColumns: () => nc,
    };
    return R;
  }
  const S = {
    getName: () => name, getLastRow: lastRow, getLastColumn: lastCol,
    getMaxRows: () => Math.max(st.grid.length, 1000), getMaxColumns: () => Math.max(lastCol(), 26),
    getRange: (r, c, nr, nc) => { if (typeof r !== 'number') throw new Error('A1 range not mocked'); return range(r, c, nr, nc); },
    getDataRange: () => range(1, 1, Math.max(lastRow(), 1), Math.max(lastCol(), 1)),
    getRangeList: (list) => { const rs = list.map((a1) => { const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a1); const cn = (L) => [...L].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); const r1 = +m[2], c1 = cn(m[1]), r2 = m[4] ? +m[4] : r1, c2 = m[3] ? cn(m[3]) : c1; return range(r1, c1, r2 - r1 + 1, c2 - c1 + 1); }); const RL = { setValue: (v) => { rs.forEach((r) => r.setValue(v)); return RL; }, setNumberFormat: (f) => { rs.forEach((r) => r.setNumberFormat(f)); return RL; } }; return RL; },
    appendRow: (vals) => { const r = lastRow() + 1; vals.forEach((v, j) => set(r, j + 1, v)); return S; },
    deleteRows: (start, n) => { st.grid.splice(start - 1, n); const nf = new Map(); for (const [k, f] of st.fmt) { const [rr, cc] = k.split(':').map(Number); if (rr < start) nf.set(k, f); else if (rr >= start + n) nf.set((rr - n) + ':' + cc, f); } st.fmt = nf; return S; },
    insertRowsAfter: (after, n) => { st.grid.splice(after, 0, ...Array.from({ length: n }, () => [])); const nf = new Map(); for (const [k, f] of st.fmt) { const [rr, cc] = k.split(':').map(Number); nf.set((rr > after ? rr + n : rr) + ':' + cc, f); } st.fmt = nf; return S; },
    insertColumnsAfter: () => S, setFrozenRows: () => S, setColumnWidth: () => S, autoResizeColumns: () => S, getSheetId: () => 1,
    _st: st,
  };
  return S;
}
function makeBook(id, name) {
  const book = { id, name, sheets: new Map() };
  book.api = {
    getId: () => id, getName: () => name,
    getSheetByName: (n) => book.sheets.get(n) || null,
    getSheets: () => [...book.sheets.values()],
    insertSheet: (n) => { const s = makeSheetObj(book, n, []); book.sheets.set(n, s); return s; },
  };
  books.set(id, book);
  return book;
}
// สมุดเปล่า (ไม่ดึงข้อมูลจริง) สำหรับทดสอบด้วยข้อมูลสมมติ
export function makeEmptyBook(id, name) { return makeBook(id, name); }
export function loadBookFromMirror(id, source, name) {
  const tabs = sql(`select public.mirror_get_tabs(array(select source||'/'||tab from mirror.tabs where source='${source}')) t`)[0].t;
  const book = makeBook(id, name);
  for (const [key, t] of Object.entries(tabs)) {
    const tabName = key.slice(key.indexOf('/') + 1);
    const grid = [t.raw_headers.slice()];
    for (const [rowNum, data] of t.rows) {
      const line = t.headers.map(h => { const v = data[h]; if (v === undefined || v === null) return ''; if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) return new Date(v); return v; });
      grid[rowNum - 1] = line;
    }
    const sh = makeSheetObj(book, tabName, grid);
    // phone / birthday / member code columns are text in the real sheet
    if (tabName === 'Members') for (let r = 2; r <= grid.length; r++) for (const c of [4, 11, 13]) sh._st.fmt.set(r + ':' + c, '@STRING@');
    book.sheets.set(tabName, sh);
  }
  return book;
}
function copyBook(id) {
  const src = books.get(id); const nid = 'copy_' + crypto.randomBytes(6).toString('hex');
  const b = makeBook(nid, 'copy of ' + src.name);
  for (const [n, s] of src.sheets) { const ns = makeSheetObj(b, n, s._st.grid.map(r => (r || []).map(v => v instanceof Date ? new Date(v.getTime()) : v))); ns._st.fmt = new Map(s._st.fmt); b.sheets.set(n, ns); }
  return b;
}

// ---------- services ----------
const cache = new Map();
const props = { SUPABASE_URL: FAKE_URL, SUPABASE_SECRET_KEY: 'sb_secret_fake', LINE_CHANNEL_ACCESS_TOKEN: '' };
// Script Properties ที่ฟังก์ชันคำนวณใช้ (ชุดเดียวกับที่คัดลอกไป Supabase)
export function loadPropsFromMirror() {
  for (const r of sql(`select data from mirror.rows where source='props' and tab='script'`)) props[r.data.key] = String(r.data.value ?? '');
}
export const trashed = [];
export const fetchLog = [];
function rpcSql(fn, a) {
  switch (fn) {
    case 'signup_claim': return sql(`select public.signup_claim(${!!a.p_tests}, ${Number(a.p_limit)}) r`)[0].r;
    case 'signup_update': sql(`select public.signup_update('${a.p_id}'::uuid, ${lit(a.p_patch)}::jsonb)`); return null;
    case 'signup_delete_tests': return sql(`select public.signup_delete_tests() r`)[0].r;
    case 'signup_pending_identity': return sql(`select public.signup_pending_identity() r`)[0].r;
    case 'mirror_internal_key': return process.env.REAL_INTERNAL_KEY ? sql(`select value from mirror.secrets where name='internal_key'`)[0].value : 'fake-internal-key';
    case 'order_claim': return sql(`select public.order_claim(${!!a.p_tests}, ${Number(a.p_limit)}) r`)[0].r;
    case 'order_update': sql(`select public.order_update('${a.p_id}'::uuid, ${lit(a.p_patch)}::jsonb)`); return null;
    case 'order_status': return sql(`select public.order_status(${a.p_id ? `'${a.p_id}'::uuid` : 'null'}, ${a.p_client_key ? lit(a.p_client_key) : 'null'}) r`)[0].r;
    case 'order_delete_tests': return sql(`select public.order_delete_tests() r`)[0].r;
    case 'mirror_mark_dirty': fetchLog.push('mark_dirty ' + JSON.stringify(a.p_tabs)); return null; // never touch the real mirror
    case 'mirror_replace_tab': fetchLog.push('replace_tab ' + a.p_source + '/' + a.p_tab); return { status: 'unchanged' };
    default: throw new Error('rpc not mocked: ' + fn);
  }
}
const UrlFetchApp = {
  fetch(url, opt = {}) {
    let body, code = 200;
    if (url.startsWith(FAKE_URL + '/rest/v1/rpc/')) {
      const fn = url.slice((FAKE_URL + '/rest/v1/rpc/').length);
      const r = rpcSql(fn, JSON.parse(opt.payload || '{}'));
      body = r === null ? '' : JSON.stringify(r); code = r === null ? 204 : 200;
    } else if (url.startsWith(FAKE_URL + '/functions/v1/admin-read')) {
      body = execFileSync('node', [new URL('./edge_cli.mjs', import.meta.url).pathname, 'admin-read', opt.payload]).toString().trim();
    } else if (url.startsWith(FAKE_URL + '/functions/v1/shop-order')) {
      const q = Object.fromEntries(new URLSearchParams(opt.payload));
      body = execFileSync('node', [new URL('./order_cli.mjs', import.meta.url).pathname, JSON.stringify(q)]).toString().trim();
    } else if (url === FAKE_URL + '/functions/v1/member-signup') {
      const q = Object.fromEntries(new URLSearchParams(opt.payload));
      if (q.action !== 'registerMember') throw new Error('edge action not mocked: ' + q.action);
      body = execFileSync('node', [new URL('./signup_cli.mjs', import.meta.url).pathname, JSON.stringify(q)]).toString().trim();
    } else {
      throw new Error('UrlFetch not mocked: ' + url);
    }
    fetchLog.push(url.replace(FAKE_URL, '') + ' -> ' + code);
    return { getResponseCode: () => code, getContentText: () => body };
  },
  fetchAll(reqs) { return reqs.map(r => this.fetch(r.url, r)); },
};
function formatDate(d, tz, pat) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d).map(p => [p.type, p.value]));
  return pat.replace(/yyyy|MM|dd|HH|mm|ss/g, t => ({ yyyy: parts.year, MM: parts.month, dd: parts.day, HH: parts.hour === '24' ? '00' : parts.hour, mm: parts.minute, ss: parts.second }[t]));
}
function guard(obj, label) { return new Proxy(obj, { get(t, p) { if (p in t || typeof p === 'symbol') return t[p]; return (...a) => { unsupported.push(label + '.' + String(p)); throw new Error('GAS mock: ' + label + '.' + String(p) + ' not mocked'); }; } }); }

export function createGas(files) {
  const ctx = {
    console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, Intl,
    SpreadsheetApp: guard({ openById: (id) => { const b = books.get(id); if (!b) throw new Error('no spreadsheet ' + id); return guard(b.api, 'Spreadsheet'); }, flush() {} }, 'SpreadsheetApp'),
    PropertiesService: { getScriptProperties: () => guard({ getProperty: k => (k in props ? props[k] : null), getProperties: () => ({ ...props }), setProperty: (k, v) => { props[k] = String(v); }, setProperties: (o) => Object.assign(props, o), deleteProperty: (k) => { delete props[k]; } }, 'Properties') },
    CacheService: { getScriptCache: () => ({ get: k => cache.has(k) ? cache.get(k) : null, put: (k, v) => cache.set(k, String(v)), remove: k => cache.delete(k), removeAll: ks => ks.forEach(k => cache.delete(k)), getAll: () => ({}), putAll() {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {}, hasLock: () => true }), getUserLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {}, hasLock: () => true }) },
    UrlFetchApp,
    Utilities: guard({ formatDate, sleep() {}, getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', String(k)).update(String(v), 'utf8').digest()].map((x) => (x > 127 ? x - 256 : x)),
      base64Decode: (b) => [...Buffer.from(String(b), 'base64')].map((x) => (x > 127 ? x - 256 : x)),
      newBlob: (bytes, mime, name) => ({ getDataAsString: () => Buffer.from(bytes.map((x) => x & 255)).toString('utf8'), mime, name }), computeDigest: (alg, s) => [...crypto.createHash('sha256').update(String(s)).digest()], base64Encode: (b) => Buffer.from(Array.isArray(b) ? b.map(x => x & 255) : String(b)).toString('base64'), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' } }, 'Utilities'),
    Logger: { log: (...a) => log.push(a.map(String).join(' ')) },
    ContentService: { createTextOutput: (s) => ({ _text: s, setMimeType() { return this; }, getContent() { return s; } }), MimeType: { JSON: 'json' } },
    ScriptApp: { newTrigger: () => ({ timeBased() { return this; }, after() { return this; }, everyMinutes() { return this; }, create() { return {}; } }), getProjectTriggers: () => [], deleteTrigger() {} },
    DriveApp: { createFolder: (n) => ({ getId: () => 'folder_' + n, setTrashed: () => trashed.push('folder_' + n) }),
      getFolderById: (id) => ({ createFile: (blob) => ({ getId: () => 'file_' + crypto.randomBytes(4).toString('hex') }) }),
      getFileById: (id) => ({ makeCopy: (n) => { const b = copyBook(id); return { getId: () => b.id, setTrashed: () => trashed.push(b.id) }; }, getLastUpdated: () => new Date() }) },
    Session: { getScriptTimeZone: () => 'Asia/Bangkok', getActiveUser: () => ({ getEmail: () => 'test@example.com' }) },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  return { ctx, unsupported, books };
}
