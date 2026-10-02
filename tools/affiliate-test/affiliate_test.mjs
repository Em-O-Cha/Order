// ทดสอบการนำเข้ารายงานคำสั่งซื้อ Affiliate (แบบใหม่ของ TikTok Shop) ของโปรเจกต์ Apps Script "Revenue Spunky Online"
//   node affiliate_test.mjs <โฟลเดอร์ที่แตกไฟล์ Apps Script แล้ว (มี index.html, Code.gs)> [AffiliateOrders.gs]
// - ฝั่งหน้าเว็บ: ดึงบล็อก AFFILIATE ORDER PARSER จาก index.html มารันกับข้อมูลที่วาง (tab) และไฟล์ .xlsx ที่สร้างด้วย SheetJS
// - ฝั่งเซิร์ฟเวอร์: รัน Code.gs + AffiliateOrders.gs บนชีตจำลอง (บันทึก, นำเข้าซ้ำ, Dashboard, ลบชุด)
// ข้อมูลทดสอบเป็นข้อมูลสมมติทั้งหมด
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';

const dir = process.argv[2];
const gsPath = process.argv[3] || new URL('../../apps-script/revenue/AffiliateOrders.gs', import.meta.url).pathname;
if (!dir) { console.error('usage: node affiliate_test.mjs <unpacked-script-dir> [AffiliateOrders.gs]'); process.exit(1); }
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n     ')); }
}

// ---------- ฝั่งหน้าเว็บ ----------
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const m = html.match(/\/\/ =+ AFFILIATE ORDER PARSER[\s\S]*?\/\/ =+ END AFFILIATE ORDER PARSER =+/);
if (!m) throw new Error('ไม่พบบล็อก AFFILIATE ORDER PARSER ใน index.html');
const web = vm.createContext({});
vm.runInContext(m[0], web);

const HEAD = ['หมายเลขคำสั่งซื้อ', 'รหัสสินค้า', 'ชื่อสินค้า', 'ID ของ SKU', 'ราคา', 'Payment Amount', 'สกุลเงิน', 'ปริมาณ',
  'คืนสินค้าหรือคืนเงินทั้งหมดแล้ว', 'วิธีการชำระเงิน', 'สถานะคำสั่งซื้อ', 'ชื่อผู้ใช้ของครีเอเตอร์', 'ประเภทเนื้อหา', 'รูปภาพแบบเลื่อน',
  'รหัสเนื้อหา', 'commission model', 'อัตราการหัก ณ ที่จ่ายสำหรับ PIT', 'PIT โดยประมาณ', 'PIT จริง', 'อัตราค่าคอมมิชชั่นมาตรฐาน',
  'ฐานค่าคอมมิชชั่นโดยประมาณ', 'การจ่ายค่าคอมมิชชั่นมาตรฐานโดยประมาณ', 'ฐานค่าคอมมิชชั่นจริง', 'ค่าคอมมิชชั่นที่ต้องชำระจริง',
  'อัตราค่าคอมมิชชั่นโฆษณาร้านค้า', 'การจ่ายค่าคอมมิชชั่นโฆษณาร้านค้าโดยประมาณ', 'การจ่ายค่าคอมมิชชั่นโฆษณาร้านค้าที่ต้องชำระจริง',
  'โบนัสครีเอเตอร์แบบร่วมทุนโดยประมาณ', 'โบนัสครีเอเตอร์แบบร่วมทุนตามจริง', 'เวลาที่สร้าง', 'เวลาชำระเงิน', 'Order Delivery Time',
  'เวลาที่ชำระค่าคอมมิชชั่น', 'Platform'];
const PRODUCT = '[น้ำพริกทดสอบ] ตราเอมโอชา ซองละ 20 กรัม';
function line(o) {
  const d = { order: '', pid: '1700000000000000101', sku: '1700000000000000201', price: 90, pay: 90, qty: 1, ref: 'ไม่มี',
    status: 'ชำระเงินแล้ว', creator: 'creator_a', ctype: 'วิดีโอ', cid: '7600000000000000301', stdEst: 9, stdAct: '', adsEst: '', adsAct: '',
    created: '2026/10/01 15:20:32', paid: '', comPaid: '', ...o };
  return [d.order, d.pid, PRODUCT, d.sku, d.price, d.pay, 'THB', d.qty, d.ref, 'การเก็บเงินปลายทาง', d.status, d.creator, d.ctype, '',
    d.cid, 'fixed commission', '', 0, '', '10%', d.pay, d.stdEst, d.stdAct === '' ? '' : d.pay, d.stdAct, '', d.adsEst, d.adsAct, '', '',
    d.created, d.paid, '', d.comPaid, 'TTS'];
}
const FILE1 = [
  line({ order: '580000000000000123' }),
  line({ order: '580000000000000124', creator: 'creator_b', cid: '7600000000000000302', qty: 2, pay: 180, stdEst: 18, created: '01/10/2026 09:00:00' }),
  line({ order: '580000000000000124', creator: 'creator_b', cid: '7600000000000000302', sku: '1700000000000000202', pay: 50, stdEst: 5, adsEst: 2, created: '01/10/2026 09:00:00' }),
  line({ order: '580000000000000125', status: 'ยกเลิกแล้ว', created: '2026-09-30 10:00:00' }),
  line({ order: '580000000000000126', ref: 'ใช่', created: '2026-09-29 08:00' }),
  line({ order: '580000000000000127', created: '-152032' }),
];

test('หัวตาราง 34 คอลัมน์ ตรงกับรายงาน', () => assert.equal(HEAD.length, 34));

test('วางตาราง (tab) — แถวตัวอย่างจริงที่ผู้ใช้คัดลอกมา: ตรวจพบเลขถูกปัด + วันที่อ่านไม่ได้', () => {
  const H = HEAD.join('\t');
  const R = '586353944826382000\t1731808492184770000\t[น้ำพริกน้ำย้อย] ตราเอมโอชา แซ่บ จัดจ้าน อาหารพร้อมทาน ซองละ 20 กรัม\t1736242120048350000\t90\t90\tTHB\t1\tไม่มี\tการเก็บเงินปลายทาง\tลูกค้ายังไม่ได้ชำระเงิน\tkung159rich\tวิดีโอ\t\t7643130760639070000\tfixed commission\t\t0\t\t0\t90\t9\t\t\t\t\t\t\t\t-152032\t\t\t\tTTS';
  const res = web.parseAffiliateOrderMatrix([H, R].map((l) => l.split('\t')), null, { fallbackDate: '2026-10-01' });
  assert.equal(res.rows.length, 1);
  const r = res.rows[0];
  assert.equal(r.orderId, '586353944826382000');
  assert.equal(r.creator, 'kung159rich');
  assert.equal(r.gmvCounted, 90);
  assert.equal(r.commissionCounted, 9);
  assert.equal(r.commissionStatus, 'ประมาณการ');
  assert.equal(r.refDate, '2026-10-01');
  assert.equal(res.warn.lossyId, 1);
  assert.equal(res.warn.noDate, 1);
  assert.deepEqual([...res.missing], []);
});

test('วางตาราง (tab) — กติกายกเลิก/คืนเงิน/ค่าคอมโฆษณา/วันที่ไทย', () => {
  const res = web.parseAffiliateOrderMatrix([HEAD, ...FILE1].map((r) => r.map(String)), null, { fallbackDate: '2026-10-02' });
  const by = Object.fromEntries(res.rows.map((r) => [r.orderId + '/' + r.skuId.slice(-3), r]));
  assert.equal(res.rows.length, 6);
  assert.equal(by['580000000000000124/201'].refDate, '2026-10-01');
  assert.equal(by['580000000000000124/201'].createdAt, '2026-10-01 09:00:00');
  assert.equal(by['580000000000000124/202'].commissionCounted, 7);     // มาตรฐาน 5 + โฆษณาร้านค้า 2
  assert.equal(by['580000000000000125/201'].gmvCounted, 0);             // ยกเลิก
  assert.equal(by['580000000000000125/201'].commissionStatus, 'ยกเลิก');
  assert.equal(by['580000000000000126/201'].refundGmv, 90);             // คืนเงินทั้งหมด
  assert.equal(by['580000000000000126/201'].commissionCounted, 0);
  assert.equal(by['580000000000000126/201'].createdAt, '2026-09-29 08:00:00');
  assert.equal(by['580000000000000127/201'].refDate, '2026-10-02');     // -152032 → ใช้วันที่ใช้แทน
  assert.equal(by['580000000000000123/201'].stdRate, 10);
  assert.equal(res.warn.lossyId, 0);
  assert.equal(res.warn.noDate, 1);
  assert.equal(res.warn.canceled, 1);
  assert.equal(res.warn.refunded, 1);
});

function xlsxMatrices(rows, { idsAsNumbers = false, datesAsSerial = false } = {}) {
  const aoa = [HEAD, ...rows.map((r) => r.map((v, j) => {
    if (idsAsNumbers && [0, 1, 3, 14].includes(j) && v !== '') return Number(v);
    if (datesAsSerial && j === 29 && /^\d{4}\//.test(v)) { const [d, t] = v.split(' '); const [y, mo, da] = d.split('/').map(Number); const [h, mi, s] = t.split(':').map(Number); return { t: 'n', v: (Date.UTC(y, mo - 1, da, h, mi, s) / 86400000) + 25569, z: 'yyyy-mm-dd hh:mm:ss' }; }
    if (j === 19 && /%$/.test(v)) return { t: 'n', v: parseFloat(v) / 100, z: '0%' };
    return v;
  }))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const wb2 = XLSX.read(buf, { type: 'array' }), ws2 = wb2.Sheets[wb2.SheetNames[0]];
  return [XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '', raw: false }), XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '', raw: true })];
}

test('ไฟล์ .xlsx — รหัสเป็นข้อความ + เวลาเป็นเลขวันที่ Excel + อัตรา %', () => {
  const [t, r] = xlsxMatrices(FILE1, { datesAsSerial: true });
  const res = web.parseAffiliateOrderMatrix(t, r, { fallbackDate: '2026-10-02' });
  const a = res.rows[0];
  assert.equal(a.orderId, '580000000000000123');
  assert.equal(a.contentId, '7600000000000000301');
  assert.equal(a.createdAt, '2026-10-01 15:20:32');
  assert.equal(a.stdRate, 10);
  assert.equal(res.warn.lossyId, 0);
});

test('ไฟล์ .xlsx — รหัสถูกเก็บเป็นตัวเลข → แจ้งเตือนเลขถูกปัด', () => {
  const [t, r] = xlsxMatrices(FILE1, { idsAsNumbers: true });
  const res = web.parseAffiliateOrderMatrix(t, r, { fallbackDate: '2026-10-02' });
  assert.ok(res.warn.lossyId >= 5, 'lossy=' + res.warn.lossyId);
  assert.ok(/^\d{18}$/.test(res.rows[0].orderId), res.rows[0].orderId);
});

test('ไฟล์ .csv จาก TikTok (UTF-8 ไม่มี BOM) — รหัสเต็ม, วันที่ dd/MM/yyyy, ชื่อมีจุลภาค/เครื่องหมายคำพูด', () => {
  const csvCell = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const rows = FILE1.slice(0, 2).map((r) => r.slice());
  rows[0][2] = 'น้ำพริก, "สูตรเด็ด" 20 กรัม';
  for (const bom of ['', '﻿']) {
    const text = bom + [HEAD, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    const res = web.parseAffiliateOrderMatrix(web.affParseCsv(text), null, { fallbackDate: '2026-10-02' });
    assert.equal(res.rows.length, 2);
    assert.equal(res.rows[0].orderId, '580000000000000123');
    assert.equal(res.rows[0].productName, 'น้ำพริก, "สูตรเด็ด" 20 กรัม');
    assert.equal(res.rows[1].createdAt, '2026-10-01 09:00:00');   // 01/10/2026 = 1 ต.ค. ไม่ใช่ 10 ม.ค.
    assert.equal(res.rows[0].stdRate, 10);
    assert.equal(res.warn.lossyId, 0); assert.equal(res.warn.noDate, 0);
    assert.deepEqual([...res.missing], []);
  }
});

test('ไม่ใช่รายงานคำสั่งซื้อ → แจ้งหาหัวตารางไม่พบ', () => {
  assert.throws(() => web.parseAffiliateOrderMatrix([['รหัสสินค้า', 'ชื่อสินค้า', 'GMV จากแอฟฟิลิเอต'], ['1', 'x', '10']]), /ไม่พบหัวตาราง/);
});

test('วันเวลาหลายรูปแบบ', () => {
  const p = web.affParseDateTime;
  assert.equal(p('2026-10-01 15:20:32'), '2026-10-01 15:20:32');
  assert.equal(p('2026/10/1'), '2026-10-01 00:00:00');
  assert.equal(p('01/10/2569 15:20'), '2026-10-01 15:20:00');      // พ.ศ.
  assert.equal(p(1790842832), '2026-10-01 15:20:32');                // epoch วินาที (GMT+7)
  assert.equal(p('-152032'), '');
  assert.equal(p('-'), '');
});

// ---------- ฝั่งเซิร์ฟเวอร์ (ชีตจำลอง) ----------
function makeSheet(name, maxRows = 1000) {
  const st = { grid: [], fmt: new Map(), maxRows };
  const empty = (v) => v === '' || v === null || v === undefined;
  const lastRow = () => { for (let r = st.grid.length - 1; r >= 0; r--) if ((st.grid[r] || []).some((v) => !empty(v))) return r + 1; return 0; };
  const lastCol = () => { let m = 0; st.grid.forEach((row) => (row || []).forEach((v, c) => { if (!empty(v)) m = Math.max(m, c + 1); })); return m; };
  const get = (r, c) => { const v = (st.grid[r - 1] || [])[c - 1]; return empty(v) ? '' : v; };
  const set = (r, c, v) => {
    if (r > st.maxRows) throw new Error(`${name}: แถว ${r} เกินขนาดชีต (${st.maxRows})`);
    while (st.grid.length < r) st.grid.push([]);
    // Sheets แปลงข้อความที่เป็นตัวเลขเป็น number (ทศนิยม 15 หลัก) ยกเว้นคอลัมน์ที่ตั้งรูปแบบเป็นข้อความ
    if (typeof v === 'string' && st.fmt.get(r + ':' + c) !== '@' && /^-?\d+(\.\d+)?$/.test(v.trim())) v = Number(Number(v).toPrecision(15));
    st.grid[r - 1][c - 1] = v;
  };
  const range = (r, c, nr = 1, nc = 1) => {
    if (r + nr - 1 > st.maxRows) throw new Error(`${name}: ช่วง ${r}+${nr} เกินขนาดชีต (${st.maxRows})`);
    const R = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => get(r + i, c + j))),
      getValue: () => get(r, c),
      setValues: (vals) => { if (vals.length !== nr || vals.some((l) => l.length !== nc)) throw new Error('setValues size mismatch'); vals.forEach((l, i) => l.forEach((v, j) => set(r + i, c + j, v))); return R; },
      setNumberFormat: (f) => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) st.fmt.set((r + i) + ':' + (c + j), f === '@STRING@' ? '@' : f); return R; },
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (st.grid[r + i - 1]) st.grid[r + i - 1][c + j - 1] = ''; return R; },
    };
    return R;
  };
  return {
    getName: () => name, getLastRow: lastRow, getLastColumn: lastCol, getMaxRows: () => st.maxRows,
    insertRowsAfter: (after, n) => { st.maxRows += n; },
    getRange: range, setFrozenRows: () => {},
    appendRow: (vals) => { const r = lastRow() + 1; vals.forEach((v, j) => set(r, j + 1, v)); },
    deleteRow: (r) => { st.grid.splice(r - 1, 1); },
    _st: st,
  };
}
const sheets = new Map();
const ctx = vm.createContext({
  console, JSON, Math, Date, Object, String, Number, Array, isFinite, parseInt, parseFloat,
  SpreadsheetApp: {
    openById: () => ({
      getSheetByName: (n) => sheets.get(n) || null,
      insertSheet: (n) => { const s = makeSheet(n, n === 'Affiliate_Orders' ? 3 : 1000); sheets.set(n, s); return s; },
    }),
    flush: () => {},
  },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  Utilities: {
    formatDate: (d, tz, f) => {
      const x = new Date(d.getTime() + 7 * 3600000), p = (n) => String(n).padStart(2, '0');
      return f.replace('yyyy', x.getUTCFullYear()).replace('yy', String(x.getUTCFullYear()).slice(2)).replace('MM', p(x.getUTCMonth() + 1))
        .replace('dd', p(x.getUTCDate())).replace('HH', p(x.getUTCHours())).replace('mm', p(x.getUTCMinutes())).replace('ss', p(x.getUTCSeconds()));
    },
  },
  Logger: { log: () => {} },
});
vm.runInContext(fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
vm.runInContext(fs.readFileSync(gsPath, 'utf8'), ctx, { filename: 'AffiliateOrders.gs' });
// ส่งข้อมูลข้ามจาก context หน้าเว็บ → เซิร์ฟเวอร์แบบเดียวกับ google.script.run (ผ่าน JSON)
const viaRun = (o) => JSON.parse(JSON.stringify(o));

// ข้อมูลแบบเดิม 1 ชุด (ครีเอเตอร์ creator_a) ไว้ทดสอบการรวม Dashboard
ctx.ensureAffiliateSheets_();
sheets.get('Affiliate_Creators').appendRow(['AFF260920000000', 'TikTok Affiliate', '', '2026-09-20', '2026-09-21', 'ครีเอเตอร์ A', '@creator_a', '', '', 0,
  '1.2K', 'Food', 100, 0, 1, 0, 100, 0, 0, 1, 0, 1, 0, 50, 0, 10, 'นำเข้ารายงานสินค้า Excel จำนวน 1 รายการ']);

const parsed1 = web.parseAffiliateOrderMatrix([HEAD, ...FILE1].map((r) => r.map(String)), null, { fallbackDate: '2026-10-02' });
let save1;
test('บันทึกครั้งแรก — เพิ่มทุกแถว รหัสยาวไม่ถูกปัด', () => {
  save1 = ctx.saveAffiliateOrderImport(viaRun({ rows: parsed1.rows, fileName: 'file1.xlsx', warnText: '' }));
  assert.equal(save1.success, true, save1.error);
  assert.equal(save1.inserted, 6); assert.equal(save1.updated, 0);
  const sh = sheets.get('Affiliate_Orders'), hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = sh.getRange(2, 1, 1, hdr.length).getValues()[0];
  assert.equal(row[hdr.indexOf('หมายเลขคำสั่งซื้อ')], '580000000000000123');
  assert.equal(row[hdr.indexOf('รหัสเนื้อหา')], '7600000000000000301');
  assert.equal(row[hdr.indexOf('Payment Amount')], 90);
  assert.equal(sh.getLastRow(), 7);
});

test('นำเข้าซ้ำ (ไฟล์ใหม่ทับช่วงเดิม) — อัปเดตแถวเดิม ไม่บวกซ้ำ + ค่าคอมจริงแทนประมาณการ', () => {
  const FILE2 = [
    line({ order: '580000000000000123', stdAct: 8, comPaid: '2026/10/10 00:00:00', status: 'เสร็จสมบูรณ์' }),
    line({ order: '580000000000000128', creator: 'creator_c', cid: '7600000000000000303', created: '2026-10-02 12:00:00' }),
  ];
  const p2 = web.parseAffiliateOrderMatrix([HEAD, ...FILE2].map((r) => r.map(String)), null, { fallbackDate: '2026-10-02' });
  const r = ctx.saveAffiliateOrderImport(viaRun({ rows: p2.rows, fileName: 'file2.xlsx' }));
  assert.equal(r.success, true, r.error);
  assert.equal(r.inserted, 1); assert.equal(r.updated, 1);
  const sh = sheets.get('Affiliate_Orders'), hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const all = sh.getRange(2, 1, sh.getLastRow() - 1, hdr.length).getValues();
  assert.equal(all.length, 7);
  const a = all.find((x) => x[hdr.indexOf('หมายเลขคำสั่งซื้อ')] === '580000000000000123');
  assert.equal(a[hdr.indexOf('ค่าคอมที่นับ')], 8);
  assert.equal(a[hdr.indexOf('สถานะค่าคอม')], 'จ่ายแล้ว');
  assert.equal(a[hdr.indexOf('ชุดนำเข้าแรก')], save1.id);
  const hist = ctx.getAffiliateOrderImportHistory(10);
  assert.equal(hist.results.length, 2);
  assert.equal(hist.results[1].periodStart, '2026-09-29');
});

test('Dashboard — รวมข้อมูลแบบเดิม + รายงานคำสั่งซื้อ (ไม่นับยกเลิก, ครีเอเตอร์ซ้ำรวมแถวเดียว)', () => {
  const d = ctx.getAffiliateDashboardData('2026-09-01', '2026-10-31');
  assert.equal(d.success, true, d.error);
  const x = d.data;
  // ใหม่: 90(123) + 180 + 50 (124) + 0 (126 คืนเงิน → GMV ยังนับ 90) + 90 (127) + 90 (128) — ยกเลิก (125) ไม่นับ
  assert.equal(x.totalGMV, 100 + 90 + 180 + 50 + 90 + 90 + 90);
  assert.equal(x.totalCommission, 10 + 8 + 18 + 7 + 0 + 9 + 9);
  assert.equal(x.totalOrders, 1 + 5);
  assert.equal(x.totalRefundGMV, 90);
  const a = x.creators.find((c) => c.handle === '@creator_a');
  assert.equal(a.creatorName, 'ครีเอเตอร์ A');
  assert.equal(a.gmv, 100 + 90 + 90 + 90);
  assert.equal(x.creators.filter((c) => /creator_a/.test(c.handle)).length, 1);
  assert.equal(x.creatorCount, 3);
  // คอนเทนต์ของ creator_a: 123 + 126 + 127 = 270, creator_b: 124 (2 SKU) = 230
  assert.equal(x.topContent[0].handle, '@creator_a'); assert.equal(x.topContent[0].gmv, 270);
  const b = x.topContent[1];
  assert.equal(b.handle, '@creator_b'); assert.equal(b.gmv, 230); assert.match(b.productName, /น้ำพริกทดสอบ/);
  const w = ctx.getAffiliateDashboardData('2026-10-02', '2026-10-02').data;
  assert.equal(w.totalGMV, 90 + 90); // 127 (วันที่ใช้แทน) + 128
  const line = ctx.getAffiliateSummaryForLine_('2026-10-01', '2026-10-31');
  assert.equal(line.totalProductsSold, 1 + 2 + 1 + 1 + 1);
});

test('ลบชุดนำเข้า — ลบเฉพาะแถวที่ชุดนั้นเพิ่มครั้งแรก', () => {
  const hist = ctx.getAffiliateOrderImportHistory(10).results;
  assert.notEqual(hist[0].id, hist[1].id);
  const r = ctx.deleteAffiliateOrderImport(hist[0].id); // ชุดล่าสุด (file2)
  assert.equal(r.success, true, r.error); assert.equal(r.removed, 1);
  const sh = sheets.get('Affiliate_Orders');
  assert.equal(sh.getLastRow(), 7);
  assert.equal(ctx.getAffiliateOrderImportHistory(10).results.length, 1);
});

console.log(failed ? `\n${failed} รายการไม่ผ่าน` : '\nผ่านทั้งหมด');
process.exit(failed ? 1 : 0);
