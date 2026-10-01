// ทดสอบโปร "ขายราคาพิเศษต่อชิ้น" (price) แบบแยกราคา/ของแถมตามขนาด ในเครื่องจำลอง (ไม่แตะระบบจริง)
// node price_tier_test.mjs <Members.gs>
import { createGas, loadBookFromMirror, loadPropsFromMirror } from './gasmock.mjs';
const MB = '15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk';
const GS = process.argv[2];
if (!GS) { console.error('ใช้: node price_tier_test.mjs <Members.gs>'); process.exit(1); }
function fresh() {
  loadBookFromMirror(MB, 'members', 'Members'); loadBookFromMirror('1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY', 'revenue', 'Revenue'); loadBookFromMirror('1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w', 'master', 'Master');
  loadPropsFromMirror();
  const { ctx: c, books } = createGas([GS]);
  c.checkAdminPin_ = () => true; c.sendLineMessages_ = () => ({ success: true });
  const bk = books.get(MB);
  const uid = bk.sheets.get('Members')._st.grid[3][0];
  c.verifyLineIdToken_ = () => ({ sub: uid, name: 'x' });
  // ปิดคูปอง/สิทธิ์เดิมทั้งหมด ให้เหลือเฉพาะที่ทดสอบ
  const cg = bk.sheets.get('Coupons')._st.grid; for (let r = 1; r < cg.length; r++) cg[r][7] = false;
  const pg = bk.sheets.get('Member_Privileges')._st.grid; for (let r = 1; r < pg.length; r++) pg[r][7] = false;
  const ca = c.CacheService.getScriptCache(); ['coupons_raw_v3', 'active_coupons_v2', 'active_coupons_v3'].forEach(k => ca.remove(k));
  return { c, uid, bk };
}
const S4 = 'ก๋วยเตี๋ยวเรือ บรรจุ 4 ซอง', S12 = 'ก๋วยเตี๋ยวเรือ บรรจุ 12 ซอง', KLUK = 'หมี่คลุก หนังปลาแซลมอน บรรจุ 4 ซอง';
const RESTR = S4 + ',' + S12;
const spec = (mode, g4 = 2, g12 = 6, p4 = 125, p12 = 375) => JSON.stringify({ mode, items: [
  { p: S4, price: p4, gift: 'น้ำพริกน้ำย้อย', giftQty: g4, unit: 'ซอง' },
  { p: S12, price: p12, gift: 'น้ำพริกน้ำย้อย', giftQty: g12, unit: 'ซอง' }] });
let fails = 0;
function check(label, cond, detail) { console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail !== undefined ? ' → ' + detail : '')); if (!cond) fails++; }
function run(label, setup, items, code, expect) {
  const { c, uid, bk } = fresh();
  const setupOut = setup(c, uid, bk);
  const ca = c.CacheService.getScriptCache(); ['coupons_raw_v3', 'active_coupons_v3'].forEach(k => ca.remove(k));
  const subtotal = items.reduce((s, it) => s + it.qty * ({ [S4]: 140, [S12]: 420, [KLUK]: 140 })[it.name], 0);
  const d = c.checkShopDiscounts('t', code || '', subtotal, JSON.stringify(items), '', 0, '');
  const bs = c.getShopBootstrap('t'); // ก่อนสั่งซื้อ (สั่งแล้วสิทธิ์ถูกใช้ไป)
  const o = c.createShopOrder('t', JSON.stringify(items), 'transfer', code || '', 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0);
  console.log('\n' + label);
  if (!d.success) { check('checkShopDiscounts', false, d.error); return; }
  const all = d.privileges.concat(d.coupon ? [d.coupon] : [], d.autoCoupons || []);
  const disc = all.reduce((s, p) => s + (p.productDiscount || 0), 0);
  const gifts = all.flatMap(p => p.freeGifts || []).map(g => g.name + ' ' + g.qty + ' ' + g.unit).join(' + ');
  console.log('  ดูราคา: ใช้', all.map(p => (p.code || p.name) + ' -' + p.discount).join(', ') || '-', '| ของแถม', gifts || '-', d.couponError ? '| error: ' + d.couponError : '');
  if (!o.success) { check('createShopOrder', false, o.error); return; }
  console.log('  สั่งจริง: ยอด', o.totalAmount, 'ส่วนลด', o.discount, '| 📦', (o.physicalFreebieItems || []).join(', ') || '-');
  expect({ d, o, bs, disc, gifts, c, bk, setupOut });
}
const priv = (c, uid, name, value, freeProduct, stack, restr = RESTR) => c.addMemberPrivilege('x', uid, name, 'price', value, 7, '', restr, freeProduct, '', '', false, stack);
const cp = (c, code, value, auto, freeProduct, stack, restr = RESTR) => c.createGlobalCoupon('x', code, 'price', value, 0, 0, '', auto, restr, '', freeProduct, '', '', '', '', false, stack);
const cart = [{ name: S4, qty: 2 }, { name: S12, qty: 1 }];

run('1) คูปองอัตโนมัติ แยกราคา 4 ซอง 125 / 12 ซอง 375 แถมต่อชิ้น (ซื้อ 4 ซอง×2 + 12 ซอง×1)', (c) => cp(c, 'TIER', '', true, spec('item'), false), cart, '', ({ d, o, disc, gifts, bk }) => {
  check('ส่วนลด 15×2 + 45 = 75', disc === 75, disc);
  check('ของแถม 2×2 + 6 = 10 ซอง', gifts === 'น้ำพริกน้ำย้อย 10 ซอง', gifts);
  check('ใบสั่ง/บิลมีชื่อของแถม+หยิบ', (o.physicalFreebieItems || []).some(x => x.includes('น้ำพริกน้ำย้อย 10 ซอง') && x.includes('หยิบใส่ให้ลูกค้า')));
  const row = bk.sheets.get('Coupons')._st.grid.find(r => r[0] === 'TIER');
  check('มูลค่าว่าง = ใช้ราคาต่ำสุด 125', row[2] === 125, row[2]);
  check('คอลัมน์ O ว่าง', row[14] === '' || row[14] === undefined, JSON.stringify(row[14]));
});
run('2) เหมือน 1 แต่แถมต่อออเดอร์', (c) => cp(c, 'TIERO', '', true, spec('order'), false), cart, '', ({ disc, gifts }) => {
  check('ส่วนลดเท่าเดิม 75', disc === 75, disc);
  check('ของแถม 2 + 6 = 8 ซอง', gifts === 'น้ำพริกน้ำย้อย 8 ซอง', gifts);
});
run('3) สิทธิ์สมาชิกแยกราคา (ไม่ติ๊ก) + คูปองอัตโนมัติ 10% ทั้งร้าน (ไม่ติ๊ก) → สิทธิ์อย่างเดียว', (c, u) => { priv(c, u, 'ก๋วยเตี๋ยวราคาพิเศษ', '', spec('item'), false); c.createGlobalCoupon('x', 'ALL10', 'percent', 10, 0, 0, '', true, '', '', '', '', '', '', '', false, false); }, cart, '', ({ d, disc, gifts, o }) => {
  check('ใช้สิทธิ์อย่างเดียว', d.privileges.length === 1 && !(d.autoCoupons || []).length, d.privileges.length + ' / ' + (d.autoCoupons || []).length);
  check('ส่วนลด 75 ของแถม 10 ซอง', disc === 75 && gifts === 'น้ำพริกน้ำย้อย 10 ซอง', disc + ' ' + gifts);
  check('ใบสั่งขึ้นชื่อสิทธิ์+ของแถม', (o.physicalFreebieItems || []).some(x => x.startsWith('ก๋วยเตี๋ยวราคาพิเศษ (แถม น้ำพริกน้ำย้อย 10 ซอง')));
});
run('4) สิทธิ์แยกราคา (ติ๊ก) + คูปองอัตโนมัติ 10% หมี่คลุก (ติ๊ก) → ซ้อนได้', (c, u) => { priv(c, u, 'TIERS', '', spec('item'), true); c.createGlobalCoupon('x', 'KLUK10', 'percent', 10, 0, 0, '', true, 'หมี่คลุก', '', '', '', '', '', '', false, true); }, cart.concat([{ name: KLUK, qty: 1 }]), '', ({ disc, gifts }) => {
  check('ส่วนลด 75 + 14 = 89', disc === 89, disc);
  check('ของแถม 10 ซอง', gifts === 'น้ำพริกน้ำย้อย 10 ซอง', gifts);
});
run('5) โค้ดที่ลูกค้าพิมพ์เอง แยกราคา + ของแถม (ใส่ราคาแค่ 12 ซอง / 4 ซองใช้มูลค่า 130)', (c) => cp(c, 'TYPED', 130, false, JSON.stringify({ mode: 'item', items: [{ p: S4, price: '', gift: 'น้ำพริกน้ำย้อย', giftQty: 2, unit: 'ซอง' }, { p: S12, price: 375 }] }), false), cart, 'TYPED', ({ d, disc, gifts }) => {
  check('โค้ดใช้ได้', d.coupon && d.coupon.code === 'TYPED', d.couponError);
  check('ส่วนลด 10×2 + 45 = 65', disc === 65, disc);
  check('ของแถมเฉพาะ 4 ซอง: 2×2 = 4 ซอง', gifts === 'น้ำพริกน้ำย้อย 4 ซอง', gifts);
});
run('6) ของแถมอย่างเดียว ไม่ลดราคา (ราคาเท่าราคาปกติ) → ยังได้ของแถม', (c) => cp(c, 'GIFTONLY', 999, true, JSON.stringify({ mode: 'order', items: [{ p: S4, gift: 'น้ำพริกน้ำย้อย', giftQty: 2, unit: 'ซอง' }] }), false, S4), [{ name: S4, qty: 3 }], '', ({ disc, gifts, o }) => {
  check('ไม่ลดราคา', disc === 0, disc);
  check('แถม 2 ซอง (ต่อออเดอร์)', gifts === 'น้ำพริกน้ำย้อย 2 ซอง', gifts);
  check('ใบสั่งมีของแถม', (o.physicalFreebieItems || []).length === 1, (o.physicalFreebieItems || []).join(','));
});
run('7) โปรราคาเดียวแบบเดิม (ไม่มีราคาแยก) ทำงานเหมือนเดิม', (c) => cp(c, 'OLD120', 120, true, '', false), cart, '', ({ disc, gifts, bk }) => {
  check('ส่วนลด 20×2 + 300 = 340', disc === 340, disc);
  check('ไม่มีของแถม', gifts === '', gifts);
  const row = bk.sheets.get('Coupons')._st.grid.find(r => r[0] === 'OLD120');
  check('คอลัมน์ L ว่าง', row[11] === '', JSON.stringify(row[11]));
});
run('8) แจกสิทธิ์ทุกคน แยกราคา แถมต่อออเดอร์ + หน้าแรกได้ราคาแยก', (c) => c.addPrivilegeToAllMembers('x', 'ALLTIER', 'price', '', 7, '', RESTR, spec('order'), '', '', '', '', '', false, false), cart, '', ({ disc, gifts, bs }) => {
  check('ส่วนลด 75 ของแถม 8 ซอง', disc === 75 && gifts === 'น้ำพริกน้ำย้อย 8 ซอง', disc + ' ' + gifts);
  const p = (bs.privileges || []).find(x => x.name === 'ALLTIER');
  check('getShopBootstrap ส่ง priceSpec', p && p.priceSpec && p.priceSpec.items.length === 2, JSON.stringify(p && p.priceSpec));
});
run('9) ราคาแยก: ติ๊กทั้ง "ก๋วยเตี๋ยวเรือ" (ทุกขนาด 130) และ 12 ซอง (375) → 12 ซองใช้ราคาของตัวเอง', (c) => cp(c, 'CAT', 130, true, JSON.stringify({ mode: 'item', items: [{ p: 'ก๋วยเตี๋ยวเรือ', price: 130 }, { p: S12, price: 375 }] }), false, 'ก๋วยเตี๋ยวเรือ,' + S12), cart, '', ({ disc, bs }) => {
  check('ส่วนลด 10×2 + 45 = 65', disc === 65, disc);
  const cpn = (bs.coupons || []).find(x => x.code === 'CAT');
  check('คูปองหน้าแรกมี priceSpec', cpn && cpn.priceSpec && cpn.priceSpec.mode === 'item');
});
run('11) ของแถมให้ลูกค้าเลือกรส (เลือกสินค้าแถมได้หลายรายการ)', (c) => cp(c, 'FLAVOR', '', true, JSON.stringify({ mode: 'order', items: [
  { p: S4, price: 125, gift: 'น้ำพริกน้ำย้อย บรรจุ 6 ซอง หรือ น้ำพริกตะไคร้หอม บรรจุ 6 ซอง', giftQty: 2 },
  { p: S12, price: 375, gift: 'น้ำพริกน้ำย้อย บรรจุ 6 ซอง หรือ น้ำพริกตะไคร้หอม บรรจุ 6 ซอง', giftQty: 6 }] }), false), cart, '', ({ o, disc }) => {
  check('ส่วนลด 75', disc === 75, disc);
  const note = (o.physicalFreebieItems || []).join(', ');
  check('ใบสั่งบอกจำนวน + รสให้เลือก', note === 'FLAVOR (แถม 8 ชิ้น เลือกได้: น้ำพริกน้ำย้อย บรรจุ 6 ซอง / น้ำพริกตะไคร้หอม บรรจุ 6 ซอง — หยิบใส่ให้ลูกค้าด้วย)', note);
});
{
  console.log('\n12) ลูกค้าเลือกรสของแถมเองที่หน้าชำระเงิน (giftChoices)');
  const GN = 'น้ำพริกน้ำย้อย บรรจุ 6 ซอง หรือ น้ำพริกตะไคร้หอม บรรจุ 6 ซอง';
  const mk = (c) => cp(c, 'PICK', '', true, JSON.stringify({ mode: 'order', items: [{ p: S4, price: 125, gift: GN, giftQty: 2 }, { p: S12, price: 375, gift: GN, giftQty: 6 }] }), false);
  const order = (choices) => { const { c } = fresh(); mk(c); ['coupons_raw_v3', 'active_coupons_v3'].forEach(k => c.CacheService.getScriptCache().remove(k));
    return c.createShopOrder('t', JSON.stringify(cart), 'transfer', '', 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0, choices); };
  const key = 'c:PICK|' + GN;
  let o = order(JSON.stringify({ [key]: { 'น้ำพริกน้ำย้อย บรรจุ 6 ซอง': 5, 'น้ำพริกตะไคร้หอม บรรจุ 6 ซอง': 3 } }));
  check('เลือกครบ 8', (o.physicalFreebieItems || [])[0] === 'PICK (แถม 8 ชิ้น: น้ำพริกน้ำย้อย บรรจุ 6 ซอง ×5 / น้ำพริกตะไคร้หอม บรรจุ 6 ซอง ×3 — หยิบใส่ให้ลูกค้าด้วย)', (o.physicalFreebieItems || [])[0]);
  o = order(JSON.stringify({ [key]: { 'น้ำพริกน้ำย้อย บรรจุ 6 ซอง': 3, 'รสปลอม': 9 } }));
  check('เลือกไม่ครบ + รสที่ไม่มีในโปรไม่นับ', (o.physicalFreebieItems || [])[0] === 'PICK (แถม 8 ชิ้น: น้ำพริกน้ำย้อย บรรจุ 6 ซอง ×3 / ทีมงานเลือกให้ ×5 — หยิบใส่ให้ลูกค้าด้วย)', (o.physicalFreebieItems || [])[0]);
  o = order(JSON.stringify({ [key]: { 'น้ำพริกน้ำย้อย บรรจุ 6 ซอง': 20, 'น้ำพริกตะไคร้หอม บรรจุ 6 ซอง': 20 } }));
  check('เลือกเกินถูกตัดเหลือ 8', (o.physicalFreebieItems || [])[0] === 'PICK (แถม 8 ชิ้น: น้ำพริกน้ำย้อย บรรจุ 6 ซอง ×8 — หยิบใส่ให้ลูกค้าด้วย)', (o.physicalFreebieItems || [])[0]);
  o = order('');
  check('ไม่ส่งมา (หน้าร้านเก่า) = แบบเดิม', (o.physicalFreebieItems || [])[0] === 'PICK (แถม 8 ชิ้น เลือกได้: น้ำพริกน้ำย้อย บรรจุ 6 ซอง / น้ำพริกตะไคร้หอม บรรจุ 6 ซอง — หยิบใส่ให้ลูกค้าด้วย)', (o.physicalFreebieItems || [])[0]);
}
{
  console.log('\n13) แถมเป็นซอง ให้ลูกค้าเลือกรส (ฟอร์มแอดมินเวอร์ชัน 21: รส + หน่วย "ซอง")');
  const GN = 'น้ำพริกน้ำย้อย หรือ น้ำพริกตะไคร้หอม หรือ น้ำพริกลงเรือกรอบ';
  const { c } = fresh();
  cp(c, 'SACHET', '', true, JSON.stringify({ mode: 'item', items: [{ p: S4, price: 125, gift: GN, giftQty: 2, unit: 'ซอง' }, { p: S12, price: 375, gift: GN, giftQty: 6, unit: 'ซอง' }] }), false);
  ['coupons_raw_v3', 'active_coupons_v3'].forEach(k => c.CacheService.getScriptCache().remove(k));
  const o = c.createShopOrder('t', JSON.stringify(cart), 'transfer', '', 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0,
    JSON.stringify({ ['c:SACHET|' + GN]: { 'น้ำพริกน้ำย้อย': 6, 'น้ำพริกตะไคร้หอม': 4 } }));
  check('ใบสั่ง: แถม 10 ซอง ตามรสที่เลือก', (o.physicalFreebieItems || [])[0] === 'SACHET (แถม 10 ซอง: น้ำพริกน้ำย้อย ×6 / น้ำพริกตะไคร้หอม ×4 — หยิบใส่ให้ลูกค้าด้วย)', (o.physicalFreebieItems || [])[0]);
  const t = c.privilegeValueText_('price', 125, S4, JSON.stringify({ mode: 'item', items: [{ p: S4, price: 125, gift: GN, giftQty: 2, unit: 'ซอง' }] }), '', '');
  check('ข้อความโปร', t === 'ราคาพิเศษ ' + S4 + ' 125 บาท แถม 2 ซอง เลือกได้: น้ำพริกน้ำย้อย / น้ำพริกตะไคร้หอม / น้ำพริกลงเรือกรอบ ต่อชิ้นที่ซื้อ', t);
}
{
  console.log('\n14) ของแถมหน่วยปนกัน (ซอง / กระปุก / ถ้วย) ลูกค้าเลือกรส');
  const GN = 'พริกผัดน้ำมันงา (กระปุก) หรือ เต้าหู้ทอดผัดพริกขิง (เจ) (ถ้วย) หรือ น้ำพริกน้ำย้อย (ซอง)';
  const { c } = fresh();
  cp(c, 'MIX', '', true, JSON.stringify({ mode: 'order', items: [{ p: S4, price: 125, gift: GN, giftQty: 3, unit: 'ชิ้น' }, { p: S12, price: 375 }] }), false);
  ['coupons_raw_v3', 'active_coupons_v3'].forEach(k => c.CacheService.getScriptCache().remove(k));
  const o = c.createShopOrder('t', JSON.stringify(cart), 'transfer', '', 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0,
    JSON.stringify({ ['c:MIX|' + GN]: { 'พริกผัดน้ำมันงา (กระปุก)': 1, 'น้ำพริกน้ำย้อย (ซอง)': 2 } }));
  check('ใบสั่งบอกหน่วยแต่ละรส', (o.physicalFreebieItems || [])[0] === 'MIX (แถม 3 ชิ้น: พริกผัดน้ำมันงา (กระปุก) ×1 / น้ำพริกน้ำย้อย (ซอง) ×2 — หยิบใส่ให้ลูกค้าด้วย)', (o.physicalFreebieItems || [])[0]);
}
{
  const { c } = fresh();
  console.log('\n10) ข้อความโปร');
  const t = c.privilegeValueText_('price', 125, RESTR, spec('item'), '', '');
  check('แยกราคา', t === 'ราคาพิเศษ ' + S4 + ' 125 บาท แถม น้ำพริกน้ำย้อย 2 ซอง ต่อชิ้นที่ซื้อ, ' + S12 + ' 375 บาท แถม น้ำพริกน้ำย้อย 6 ซอง ต่อชิ้นที่ซื้อ', t);
  const t2 = c.privilegeValueText_('price', 100, 'หมี่ชมพู', '', '', '');
  check('ราคาเดียวแบบเดิม', t2 === 'ราคาพิเศษ 100 บาท (หมี่ชมพู)', t2);
  check('ชื่อของแถมมี , ถูกตัด', c.normalizePriceSpec_(JSON.stringify({ items: [{ p: S4, gift: 'น้ำพริก, น้ำย้อย|x', giftQty: 1 }] })).includes('"gift":"น้ำพริก น้ำย้อย x"'));
  check('ไม่มีราคา/ของแถมเลย = ค่าว่าง', c.normalizePriceSpec_(JSON.stringify({ items: [{ p: S4, price: '' }] })) === '');
  const r = c.createGlobalCoupon('x', 'NOVAL', 'price', '', 0, 0, '', true, RESTR, '', JSON.stringify({ items: [{ p: S4, price: 125 }] }), '', '', '', '', false, false);
  check('มูลค่าว่าง + ใส่ราคาไม่ครบทุกสินค้า → ต้องกรอกมูลค่า', !r.success, r.error);
}
console.log(fails ? `\n❌ ไม่ผ่าน ${fails} ข้อ` : '\n✅ ผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
