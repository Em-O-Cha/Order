// แก้ไขออเดอร์ที่รอแนบสลิป + คืนสิทธิ์/คูปองตอนแก้ไข/ยกเลิก: node edit_test.mjs <Members.gs>
import { createGas, loadBookFromMirror, loadPropsFromMirror } from './gasmock.mjs';
const MB = '15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk';
const REV = '1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY';
const GS = process.argv[2];
const PINK = 'หมี่ชมพูน้ำพริกหนังแซลมอน บรรจุ 4 ซอง', KLUK = 'หมี่คลุก หนังปลาแซลมอน บรรจุ 4 ซอง';
let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✅ ' : '  ❌ ') + label + (ok || extra === undefined ? '' : ' → ' + JSON.stringify(extra)));
}
function fresh() {
  loadBookFromMirror(MB, 'members', 'Members'); loadBookFromMirror(REV, 'revenue', 'Revenue'); loadBookFromMirror('1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w', 'master', 'Master');
  loadPropsFromMirror();
  const { ctx: c, books } = createGas([GS]);
  c.checkAdminPin_ = () => true; c.sendLineMessages_ = () => ({ success: true });
  const bk = books.get(MB);
  const uid = bk.sheets.get('Members')._st.grid[3][0];
  let who = uid;
  c.verifyLineIdToken_ = () => ({ sub: who, name: 'x' });
  const cg = bk.sheets.get('Coupons')._st.grid; for (let r = 1; r < cg.length; r++) cg[r][7] = false;
  const pg = bk.sheets.get('Member_Privileges')._st.grid; for (let r = 1; r < pg.length; r++) pg[r][7] = false;
  const env = {
    c, uid, bk, rev: books.get(REV).sheets.get('Revenue'),
    as: (u) => { who = u; },
    clearCache: () => { const ca = c.CacheService.getScriptCache(); ['coupons_raw_v3', 'active_coupons_v3'].forEach(k => ca.remove(k)); },
    priv: (name) => { const g = bk.sheets.get('Member_Privileges')._st.grid; const r = g.findIndex((row, i) => i > 0 && row && row[0] === uid && row[1] === name); return { row: r + 1, v: g[r] }; },
    coupon: (code) => { const g = bk.sheets.get('Coupons')._st.grid; const r = g.findIndex((row, i) => i > 0 && row && String(row[0]) === code); return { row: r + 1, v: g[r] }; },
    order: (items, code = '', existing = '') => { env.clearCache(); return c.createShopOrder('t', JSON.stringify(items), 'transfer', code, 'ที่อยู่ทดสอบ', 'กรุงเทพมหานคร', '', existing, '', 0); },
    preview: (items, code = '', existing = '') => { env.clearCache(); const sub = items.reduce((s, it) => s + it.qty * 140, 0); return c.checkShopDiscounts('t', code, sub, JSON.stringify(items), '', 0, existing); },
    revRows: (id) => env.rev._st.grid.map((row, i) => [i + 1, row]).filter(([, row]) => row && String(row[0]) === id),
  };
  return env;
}
const addPriv = (e, name, type, value, opts = {}) => {
  e.c.addMemberPrivilege('x', e.uid, name, type, value, 30, '', opts.restr || '', '', '', '', false, opts.stack !== false);
  const p = e.priv(name);
  if (opts.min) p.v[13] = opts.min;
  return p;
};
const addCoupon = (e, code, type, value, opts = {}) => {
  e.c.createGlobalCoupon('x', code, type, value, 0, opts.max || 0, opts.expiry || '', opts.auto !== false, opts.restr || '', '', '', '', '', '', '', false, opts.stack !== false);
  return e.coupon(code);
};
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 2); return d; };
const active = (v) => v === true || String(v).toUpperCase() === 'TRUE';

console.log('\n1) สิทธิ์ส่งฟรี (ขั้นต่ำ 400) + คูปองอัตโนมัติ 10% (ใช้ได้ 1 ครั้ง) — แก้ไขไปมา');
{
  const e = fresh();
  addPriv(e, 'SHIPFREE', 'ship_percent', 100, { min: 400 });
  addCoupon(e, 'AUTO10', 'percent', 10, { max: 1 });
  const o = e.order([{ name: PINK, qty: 3 }]);
  check('สั่งซื้อสำเร็จ', o.success, o);
  const id = o.orderId;
  check('สิทธิ์ถูกจอง (ปิดไว้)', !active(e.priv('SHIPFREE').v[7]));
  check('คูปองนับ 1 ครั้ง', Number(e.coupon('AUTO10').v[5]) === 1, e.coupon('AUTO10').v[5]);
  const p1 = e.preview([{ name: PINK, qty: 3 }], '', id);
  check('ดูยอดตอนแก้ไข: สิทธิ์ที่จองไว้ยังใช้ได้', p1.success && p1.privileges.some(p => p.name === 'SHIPFREE'), p1.error || p1.privileges);
  check('ดูยอดตอนแก้ไข: คูปองที่ครบจำนวนด้วยออเดอร์นี้เองยังใช้ได้', (p1.autoCoupons || []).some(x => x.code === 'AUTO10'), p1.autoCoupons);
  check('ไม่มีโปรเปลี่ยน', p1.editChanges && !p1.editChanges.lost.length && !p1.editChanges.returned.length, p1.editChanges);
  const pNew = e.preview([{ name: PINK, qty: 3 }], '', '');
  check('ออเดอร์ใหม่ (ไม่ใช่แก้ไข): คูปองเต็มแล้ว ใช้ไม่ได้', !(pNew.autoCoupons || []).some(x => x.code === 'AUTO10'), pNew.autoCoupons);
  const p2 = e.preview([{ name: PINK, qty: 1 }], '', id);
  check('ลดเหลือ 140: บอกว่าจะคืนสิทธิ์ส่งฟรี', p2.editChanges && p2.editChanges.returned.some(x => x.kind === 'privilege' && x.name === 'SHIPFREE'), p2.editChanges);
  const o2 = e.order([{ name: PINK, qty: 1 }], '', id);
  check('แก้ไขสำเร็จ เลขเดิม', o2.success && o2.orderId === id && o2.isEdit === true, o2);
  check('ผลแก้ไขบอกสิทธิ์ที่คืน', o2.editChanges && o2.editChanges.returned.some(x => x.name === 'SHIPFREE'), o2.editChanges);
  check('สิทธิ์ส่งฟรีเปิดคืนแล้ว', active(e.priv('SHIPFREE').v[7]) && !e.priv('SHIPFREE').v[16], e.priv('SHIPFREE').v);
  check('คูปองยังนับ 1 (ไม่นับซ้ำ)', Number(e.coupon('AUTO10').v[5]) === 1, e.coupon('AUTO10').v[5]);
  check('ชีตมีออเดอร์นี้แถวเดียว', e.revRows(id).length === 1, e.revRows(id).length);
  const o3 = e.order([{ name: PINK, qty: 3 }], '', id);
  check('แก้กลับเป็น 3 ชิ้น: ได้สิทธิ์ส่งฟรีอีกครั้ง', o3.success && !active(e.priv('SHIPFREE').v[7]) && /SHIPFREE/.test(e.revRows(id)[0][1][19]), o3);
  check('คูปองยังนับ 1', Number(e.coupon('AUTO10').v[5]) === 1, e.coupon('AUTO10').v[5]);
}

console.log('\n2) คูปองหลุดเพราะเอาสินค้าที่ร่วมโปรออก → คืนจำนวนครั้ง');
{
  const e = fresh();
  addCoupon(e, 'PINK10', 'percent', 10, { max: 5, restr: 'หมี่ชมพู' });
  const o = e.order([{ name: PINK, qty: 1 }, { name: KLUK, qty: 1 }]);
  check('สั่งซื้อสำเร็จ + คูปองนับ 1', o.success && Number(e.coupon('PINK10').v[5]) === 1, [o.error, e.coupon('PINK10').v[5]]);
  const o2 = e.order([{ name: KLUK, qty: 2 }], '', o.orderId);
  check('แก้ไขสำเร็จ', o2.success, o2);
  check('คูปองคืน (นับ 0)', Number(e.coupon('PINK10').v[5]) === 0, e.coupon('PINK10').v[5]);
  check('ผลแก้ไขบอกคูปองที่คืน', o2.editChanges && o2.editChanges.returned.some(x => x.kind === 'coupon' && x.name === 'PINK10'), o2.editChanges);
}

console.log('\n3) โปรเดิมหมดอายุระหว่างรอ → หลุด ไม่คืน');
{
  const e = fresh();
  addPriv(e, 'P10', 'percent', 10);
  addCoupon(e, 'KLUK10', 'percent', 10, { max: 5, restr: 'หมี่คลุก' });
  const o = e.order([{ name: PINK, qty: 1 }, { name: KLUK, qty: 1 }]);
  check('สั่งซื้อสำเร็จ ได้ทั้งสิทธิ์และคูปอง', o.success && /P10/.test(e.revRows(o.orderId)[0][1][19]) && /KLUK10/.test(e.revRows(o.orderId)[0][1][19]), e.revRows(o.orderId)[0][1][19]);
  e.priv('P10').v[4] = yesterday();
  e.coupon('KLUK10').v[6] = yesterday();
  const p = e.preview([{ name: PINK, qty: 1 }, { name: KLUK, qty: 1 }], '', o.orderId);
  const lost = (p.editChanges || {}).lost || [];
  check('ดูยอด: บอกว่าสิทธิ์และคูปองหมดอายุ', lost.some(x => x.name === 'P10' && x.reason === 'expired') && lost.some(x => x.name === 'KLUK10' && x.reason === 'expired'), p.editChanges);
  check('ดูยอด: ยอดเดิมส่งมาให้ป๊อปอัป', p.editChanges && p.editChanges.oldAmount === o.totalAmount, p.editChanges);
  const o2 = e.order([{ name: PINK, qty: 1 }, { name: KLUK, qty: 1 }], '', o.orderId);
  check('แก้ไขสำเร็จ ยอดเพิ่มขึ้น', o2.success && o2.totalAmount > o.totalAmount, [o.totalAmount, o2.totalAmount]);
  check('สิทธิ์หมดอายุไม่ถูกเปิดคืน', !active(e.priv('P10').v[7]));
  check('คูปองหมดอายุไม่คืนจำนวนครั้ง', Number(e.coupon('KLUK10').v[5]) === 1, e.coupon('KLUK10').v[5]);
}

console.log('\n4) ตัวกันความปลอดภัย');
{
  const e = fresh();
  const o = e.order([{ name: PINK, qty: 1 }]);
  const other = e.bk.sheets.get('Members')._st.grid[4][0];
  e.as(other);
  const r1 = e.order([{ name: PINK, qty: 2 }], '', o.orderId);
  check('คนอื่นแก้ไม่ได้', !r1.success && r1.editBlocked, r1);
  const r1b = e.preview([{ name: PINK, qty: 2 }], '', o.orderId);
  check('คนอื่นดูยอดแก้ไขไม่ได้', !r1b.success && r1b.editBlocked, r1b);
  e.as(e.uid);
  check('ชีตออเดอร์เดิมไม่ถูกแตะ', e.revRows(o.orderId).length === 1 && Number(e.revRows(o.orderId)[0][1][3]) === 1);
  e.revRows(o.orderId)[0][1][10] = 'https://slip';
  const r2 = e.order([{ name: PINK, qty: 2 }], '', o.orderId);
  check('แนบสลิปแล้วแก้ไม่ได้', !r2.success && /แนบสลิปแล้ว/.test(r2.error), r2);
  e.revRows(o.orderId)[0][1][10] = '';
  const cx = e.c.cancelShopOrder('t', o.orderId);
  check('ยกเลิกสำเร็จ', cx.success, cx);
  const r3 = e.order([{ name: PINK, qty: 2 }], '', o.orderId);
  check('ยกเลิกแล้วแก้ไม่ได้', !r3.success && /ยกเลิก/.test(r3.error), r3);
  const r4 = e.order([{ name: PINK, qty: 2 }], '', 'REV0000001');
  check('เลขออเดอร์ไม่มีจริง', !r4.success, r4);
}

console.log('\n5) ยกเลิกออเดอร์ → คืนสิทธิ์/คูปอง (เฉพาะที่ยังไม่หมดอายุ)');
{
  const e = fresh();
  addPriv(e, 'P10', 'percent', 10);
  addCoupon(e, 'KLUK10', 'percent', 10, { max: 5, restr: 'หมี่คลุก' });
  addCoupon(e, 'PINK5', 'percent', 5, { max: 5, restr: 'หมี่ชมพู' });
  const o = e.order([{ name: PINK, qty: 1 }, { name: KLUK, qty: 1 }]);
  check('สั่งซื้อสำเร็จ ใช้ครบ 3 โปร', o.success && Number(e.coupon('KLUK10').v[5]) === 1 && Number(e.coupon('PINK5').v[5]) === 1 && !active(e.priv('P10').v[7]), e.revRows(o.orderId)[0][1][19]);
  e.coupon('PINK5').v[6] = yesterday();
  e.clearCache();
  const cx = e.c.cancelShopOrder('t', o.orderId);
  check('ยกเลิกสำเร็จ', cx.success, cx);
  check('สิทธิ์ P10 เปิดคืน', active(e.priv('P10').v[7]));
  check('คูปอง KLUK10 คืน (นับ 0)', Number(e.coupon('KLUK10').v[5]) === 0, e.coupon('KLUK10').v[5]);
  check('คูปอง PINK5 หมดอายุ ไม่คืน (นับ 1)', Number(e.coupon('PINK5').v[5]) === 1, e.coupon('PINK5').v[5]);
  check('ผลยกเลิกบอกของที่คืน', (cx.returned || []).length === 2, cx.returned);
}

console.log('\n6) ดึงข้อมูลออเดอร์ไปแก้ไข (หน้ารถเข็น)');
{
  const e = fresh();
  addCoupon(e, 'TYPED5', 'percent', 5, { auto: false });
  addCoupon(e, 'AUTO3', 'percent', 3, {});
  const o = e.order([{ name: PINK, qty: 2 }, { name: KLUK, qty: 1 }], 'TYPED5');
  check('สั่งซื้อสำเร็จ', o.success, o);
  const d = e.c.getPendingOrderForEdit('t', o.orderId);
  check('ได้รายการสินค้าครบ', d.success && d.items.length === 2 && d.items.some(i => i.name === PINK && i.qty === 2), d);
  check('ได้โค้ดที่พิมพ์เอง (ไม่เอาคูปองอัตโนมัติ)', d.couponCode === 'TYPED5', d.couponCode);
  check('ได้ที่อยู่/จังหวัด/วิธีชำระ', d.shippingAddress === 'ที่อยู่ทดสอบ' && d.province === 'กรุงเทพมหานคร' && d.paymentMethod === 'bank', d);
  e.as(e.bk.sheets.get('Members')._st.grid[4][0]);
  const d2 = e.c.getPendingOrderForEdit('t', o.orderId);
  check('คนอื่นดึงไม่ได้', !d2.success, d2);
}

console.log('\n7) หัวข้อความ LINE "แก้ไขคำสั่งซื้อแล้ว" เฉพาะเมื่อเคยส่งข้อความแรกไปแล้ว');
{
  const e = fresh();
  const q = () => JSON.parse(e.c.PropertiesService.getScriptProperties().getProperty('pending_slip_reminders') || '[]');
  const o = e.order([{ name: PINK, qty: 1 }]);
  check('ออเดอร์ใหม่เข้าคิว หัวปกติ', q().some(x => x.o === o.orderId && x.e === 0), q());
  e.order([{ name: PINK, qty: 2 }], '', o.orderId);
  check('แก้ไขก่อนส่ง: ยังหัวปกติ และมีในคิวใบเดียว', q().filter(x => x.o === o.orderId).length === 1 && q().find(x => x.o === o.orderId).e === 0, q());
  e.c.PropertiesService.getScriptProperties().deleteProperty('pending_slip_reminders'); // ส่งข้อความแรกไปแล้ว
  e.order([{ name: PINK, qty: 3 }], '', o.orderId);
  check('แก้ไขหลังส่งแล้ว: หัว "แก้ไขคำสั่งซื้อแล้ว"', q().some(x => x.o === o.orderId && x.e === 1), q());
}

console.log(fails ? `\n❌ ไม่ผ่าน ${fails} ข้อ` : '\n✅ ผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
