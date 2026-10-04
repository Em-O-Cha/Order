// เทียบผล Members.gs (gasmock) กับ gas_port.js บนตัวจำลองของ Edge Function (gas_runtime) — ในเครื่อง ไม่แตะระบบจริง
// node port_test.mjs <Members.gs> <dir>  — dir: สำเนา gas_port.js ของ shop-order/shop-read และ _shared/gas_runtime.js
//   ตั้งชื่อเป็น shop-order.mjs / shop-read.mjs / gas_runtime.mjs (Node ต้องเป็น .mjs) เช่น
//   mkdir -p /tmp/edge && cp ../../supabase/functions/shop-order/gas_port.js /tmp/edge/shop-order.mjs && ...
import { createGas as createMock, loadBookFromMirror, loadPropsFromMirror } from './gasmock.mjs';
import { sql } from './sql.mjs';
const GS = process.argv[2], DIR = process.argv[3];
const { createEnv, prepareTab, PROPS_KEY } = await import(DIR + '/gas_runtime.mjs');
const portOrder = (await import(DIR + '/shop-order.mjs')).createGas;
const portRead = (await import(DIR + '/shop-read.mjs')).createGas;
const MB = '15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk', REVID = '1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY', MASTER = '1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w';
// หัวตารางของแต่ละแท็บ (ชื่อคีย์ที่สำเนาใช้) ดึงจากสำเนาเดียวกับที่ gasmock โหลด
const fx = Object.assign({}, ...['members', 'revenue', 'master'].map(src =>
  sql(`select public.mirror_get_tabs(array(select source||'/'||tab from mirror.tabs where source='${src}')) t`)[0].t));
const PINK = 'หมี่ชมพูน้ำพริกหนังแซลมอน บรรจุ 4 ซอง', KLUK = 'หมี่คลุก หนังปลาแซลมอน บรรจุ 4 ซอง';
let fails = 0;
const check = (label, ok, extra) => { if (!ok) fails++; console.log((ok ? '  ✅ ' : '  ❌ ') + label + (ok || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); };

function fresh() {
  loadBookFromMirror(MB, 'members', 'Members'); loadBookFromMirror(REVID, 'revenue', 'Revenue'); loadBookFromMirror(MASTER, 'master', 'Master');
  loadPropsFromMirror();
  const { ctx: c, books } = createMock([GS]);
  c.checkAdminPin_ = () => true; c.sendLineMessages_ = () => ({ success: true });
  const uid = books.get(MB).sheets.get('Members')._st.grid[3][0];
  c.verifyLineIdToken_ = () => ({ sub: uid, name: 'x' });
  for (const n of ['Coupons', 'Member_Privileges']) { const g = books.get(MB).sheets.get(n)._st.grid; for (let r = 1; r < g.length; r++) if (g[r]) g[r][7] = false; }
  const clear = () => { const ca = c.CacheService.getScriptCache(); ['coupons_raw_v3', 'active_coupons_v3'].forEach(k => ca.remove(k)); };
  return { c, books, uid, clear };
}
// สถานะชีตใน gasmock -> แท็บของตัวจำลอง Edge Function
function snapshotTabs(books) {
  const tabs = new Map();
  const add = (id, source) => {
    for (const [name, sh] of books.get(id).sheets) {
      const key = source + '/' + name;
      const f = fx[key];
      if (!f) continue;
      const grid = sh._st.grid;
      let width = f.headers.length;
      for (let r = 0; r < grid.length; r++) if (grid[r]) width = Math.max(width, grid[r].length);
      const headers = Array.from({ length: width }, (_, i) => f.headers[i] || ('__col' + (i + 1)));
      const raw = (grid[0] || []).slice();
      const rows = [];
      for (let r = 1; r < grid.length; r++) {
        const line = grid[r]; if (!line || !line.some(v => v !== '' && v !== null && v !== undefined)) continue;
        const data = {};
        line.forEach((v, i) => { if (v === '' || v === null || v === undefined) return; data[headers[i]] = v instanceof Date ? v.toISOString() : v; });
        rows.push([r + 1, data]);
      }
      tabs.set(key, prepareTab(key, { headers, raw_headers: raw, rows, spreadsheet_id: id }));
    }
  };
  add(MB, 'members'); add(REVID, 'revenue'); add(MASTER, 'master');
  const props = sql(`select data from mirror.rows where source='props' and tab='script'`).map((r, i) => [i + 2, r.data]);
  tabs.set(PROPS_KEY, prepareTab(PROPS_KEY, { headers: ['key', 'value'], raw_headers: ['key', 'value'], rows: props }));
  return tabs;
}
function runPort(kind, tabs, uid, call) {
  const props = {}; for (const d of tabs.get(PROPS_KEY).rows.values()) props[d.key] = String(d.value);
  const { env, tracker } = createEnv({ tabs, loadedSources: new Set(tabs.keys()), props, profile: { sub: uid, name: 'x', picture: '' }, journal: kind === 'order' });
  const noop = () => {};
  const extra = kind === 'order' ? {
    notifyBuyerOrderConfirmation_: noop, notifyAdminNewOrder_: noop, checkAndGrantReferralOnFirstPurchase_: noop,
    checkAndGrantPurchaseReferral_: noop, sendLineMessages_: noop, notifyBuyerPendingSlip_: noop, notifyBuyerOrderCancelled_: noop,
    DriveApp: { getFolderById: () => ({ createFile: () => ({ getId: () => 'x' }) }) }, scheduleSlipFinalize_: noop,
    deleteExistingOrderRows_: () => true, reverseRedeemedPointsForOrder_: () => 0,
  } : {};
  const gas = (kind === 'order' ? portOrder : portRead)({ ...env, ...extra });
  let result; try { result = call(gas); } catch (e) { result = { thrown: String(e) }; }
  return { result, unsupported: tracker.unsupported };
}
const pick = (r) => r && ({ success: r.success, error: r.error, orderId: r.orderId, totalAmount: r.totalAmount, discountDetail: r.discountDetail, editChanges: r.editChanges, isEdit: r.isEdit });
const pickD = (r) => r && ({ success: r.success, error: r.error, privileges: (r.privileges || []).map(p => p.name + ':' + p.discount), auto: (r.autoCoupons || []).map(x => x.code + ':' + x.discount), coupon: r.coupon && r.coupon.code, editChanges: r.editChanges, memberPoints: r.memberPoints });

function scenario(label, setup, editItems, code = '') {
  console.log('\n' + label);
  const e = fresh();
  setup(e);
  e.clear();
  const o = e.c.createShopOrder('t', JSON.stringify([{ name: PINK, qty: 3 }, { name: KLUK, qty: 1 }]), 'transfer', code, 'ที่อยู่ทดสอบ', 'กรุงเทพมหานคร', '', '', '', 0);
  check('สร้างออเดอร์ตั้งต้น (gasmock)', o.success, o);
  if (!o.success) return;
  if (setup.after) setup.after(e);
  e.clear();
  const tabs = snapshotTabs(e.books);
  const sub = editItems.reduce((s, it) => s + it.qty * 140, 0);
  // ดูยอด (shop-read)
  const pd = runPort('read', tabs, e.uid, g => g.checkShopDiscounts('t', code, sub, JSON.stringify(editItems), '', 0, o.orderId));
  const md = e.c.checkShopDiscounts('t', code, sub, JSON.stringify(editItems), '', 0, o.orderId);
  check('checkShopDiscounts: ตัวจำลองรองรับครบ', !pd.unsupported.length, pd.unsupported);
  check('checkShopDiscounts: ผลตรงกับ Apps Script', JSON.stringify(pickD(pd.result)) === JSON.stringify(pickD(md)), { port: pickD(pd.result), gas: pickD(md) });
  // ดึงข้อมูลไปแก้ไข (shop-read)
  const pg = runPort('read', tabs, e.uid, g => g.getPendingOrderForEdit('t', o.orderId));
  const mg = e.c.getPendingOrderForEdit('t', o.orderId);
  check('getPendingOrderForEdit: ตัวจำลองรองรับครบ', !pg.unsupported.length, pg.unsupported);
  check('getPendingOrderForEdit: ผลตรงกัน', JSON.stringify(pg.result) === JSON.stringify(mg), { port: pg.result, gas: mg });
  // แก้ไข (shop-order ทำนาย) เทียบกับ Apps Script แก้จริง
  const po = runPort('order', tabs, e.uid, g => g.createShopOrder('supabase', JSON.stringify(editItems), 'transfer', code, 'ที่อยู่ทดสอบ', 'กรุงเทพมหานคร', '', o.orderId, '', 0));
  const mo = e.c.createShopOrder('t', JSON.stringify(editItems), 'transfer', code, 'ที่อยู่ทดสอบ', 'กรุงเทพมหานคร', '', o.orderId, '', 0);
  check('createShopOrder(แก้ไข): ตัวจำลองรองรับครบ', !po.unsupported.length, po.unsupported);
  check('createShopOrder(แก้ไข): ทำนายตรงกับ Apps Script', JSON.stringify(pick(po.result)) === JSON.stringify(pick(mo)), { port: pick(po.result), gas: pick(mo) });
  // ยกเลิก (shop-order) บนสถานะหลังแก้ไข
  e.clear();
  const tabs2 = snapshotTabs(e.books);
  const pc = runPort('order', tabs2, e.uid, g => g.cancelShopOrder('supabase', o.orderId));
  const mc = e.c.cancelShopOrder('t', o.orderId);
  check('cancelShopOrder: ตัวจำลองรองรับครบ', !pc.unsupported.length, pc.unsupported);
  check('cancelShopOrder: ผลตรงกัน (รวมของที่คืน)', JSON.stringify(pc.result) === JSON.stringify(mc), { port: pc.result, gas: mc });
}

const priv = (e, name, type, value, min) => { e.c.addMemberPrivilege('x', e.uid, name, type, value, 30, '', '', '', '', '', false, true); if (min) { const g = e.books.get(MB).sheets.get('Member_Privileges')._st.grid; g.find(r => r && r[0] === e.uid && r[1] === name)[13] = min; } };
const cp = (e, code, type, value, max, restr = '', auto = true) => e.c.createGlobalCoupon('x', code, type, value, 0, max, '', auto, restr, '', '', '', '', '', '', false, true);

scenario('A) สิทธิ์ส่งฟรี(ขั้นต่ำ 500) + คูปองอัตโนมัติใช้ได้ 1 ครั้ง → แก้ให้ยอดต่ำกว่าขั้นต่ำ', (e) => { priv(e, 'SHIPFREE', 'ship_percent', 100, 500); cp(e, 'AUTO10', 'percent', 10, 1); }, [{ name: PINK, qty: 1 }]);
scenario('B) คงสินค้าเดิม (โปรเดิมต้องยังได้ครบ)', (e) => { priv(e, 'P10', 'percent', 10); cp(e, 'KLUK10', 'percent', 10, 1, 'หมี่คลุก'); }, [{ name: PINK, qty: 3 }, { name: KLUK, qty: 1 }]);
const sC = (e) => { priv(e, 'P10', 'percent', 10); cp(e, 'KLUK10', 'percent', 10, 5, 'หมี่คลุก'); };
sC.after = (e) => { const d = new Date(); d.setDate(d.getDate() - 2); e.books.get(MB).sheets.get('Coupons')._st.grid.find(r => r && r[0] === 'KLUK10')[6] = d; };
scenario('C) คูปองหมดอายุระหว่างรอ + เอาหมี่คลุกออก', sC, [{ name: PINK, qty: 4 }]);
scenario('D) โค้ดพิมพ์เอง', (e) => { cp(e, 'TYPED5', 'percent', 5, 0, '', false); }, [{ name: PINK, qty: 2 }, { name: KLUK, qty: 2 }], 'TYPED5');

console.log(fails ? `\n❌ ไม่ผ่าน ${fails} ข้อ` : '\n✅ ผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
