import { createGas, loadBookFromMirror, loadPropsFromMirror } from './gasmock.mjs';
const MB = '15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk';
const GS = process.argv[2]; // node excl_test.mjs <Members.gs>
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
  return { c, uid };
}
const PINK = 'หมี่ชมพูน้ำพริกหนังแซลมอน บรรจุ 4 ซอง', KLUK = 'หมี่คลุก หนังปลาแซลมอน บรรจุ 4 ซอง';
const items = [{ name: PINK, qty: 1 }, { name: KLUK, qty: 1 }];
function run(label, setup, code = '') {
  const { c, uid } = fresh();
  setup(c, uid);
  const ca = c.CacheService.getScriptCache(); ['coupons_raw_v3', 'active_coupons_v3'].forEach(k => ca.remove(k));
  const d = c.checkShopDiscounts('t', code, 280, JSON.stringify(items), '', 0, '');
  const o = c.createShopOrder('t', JSON.stringify(items), 'transfer', code, 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0);
  const bs = c.getShopBootstrap('t');
  console.log('\n' + label);
  console.log('  ดูราคา: สิทธิ์', d.privileges.map(p => p.name + ' -' + p.discount).join(', ') || '-', '| โค้ด', d.coupon ? d.coupon.code + ' -' + d.coupon.discount : '-', '| อัตโนมัติ', (d.autoCoupons || []).map(x => x.code + ' -' + x.discount).join(', ') || '-', d.couponError ? '| error: ' + d.couponError : '');
  console.log('  สั่งจริง:', o.success ? ('ยอด ' + (o.finalAmount ?? o.totalAmount) + ' ส่วนลด ' + (o.discount ?? o.totalDiscount)) : ('ERROR ' + o.error), d.privilegeLockNote ? '| note: ' + d.privilegeLockNote : '');
  console.log('  หน้าแรก: คูปอง', bs.coupons.map(x => x.code + (x.stackable ? '[ร่วมได้]' : '') + (x.exclusive ? '[เฉพาะ]' : '')).join(', ') || '-', '| สิทธิ์', bs.privileges.map(x => x.name + (x.stackable ? '[ร่วมได้]' : '') + (x.exclusive ? '[เฉพาะ]' : '')).join(', ') || '-');
}
const priv = (c, uid, name, type, value, restr, stack) => c.addMemberPrivilege('x', uid, name, type, value, 7, '', restr, '', '', '', false, stack);
const cp = (c, code, type, value, auto, restr, stack) => c.createGlobalCoupon('x', code, type, value, 0, 0, '', auto, restr, '', '', '', '', '', '', false, stack);
run('A) สิทธิ์ 50% หมี่ชมพู + คูปองอัตโนมัติ 10% ทั้งร้าน (ไม่ติ๊กทั้งคู่) → หวัง: สิทธิ์อย่างเดียว 313', (c, u) => { priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); cp(c, 'AUTO10', 'percent', 10, true, '', false); });
run('B) เหมือน A แต่คูปองติ๊ก (สิทธิ์ไม่ติ๊ก) → หวัง: สิทธิ์อย่างเดียว 313', (c, u) => { priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); cp(c, 'AUTO10S', 'percent', 10, true, '', true); });
run('C) สิทธิ์ 50% หมี่ชมพู + พิมพ์โค้ด 20% หมี่ชมพู → หวัง: โค้ดใช้ไม่ได้ 313', (c, u) => { priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); cp(c, 'PINK20', 'percent', 20, false, 'หมี่ชมพู', false); }, 'PINK20');
run('D) สิทธิ์ 50% หมี่ชมพู + พิมพ์โค้ด 20% หมี่ (ทั้ง 2 อย่าง) ไม่ติ๊ก → หวัง: โค้ดใช้ไม่ได้ 313', (c, u) => { priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); cp(c, 'MEE20', 'percent', 20, false, 'หมี่', false); }, 'MEE20');
run('D2) เหมือน D แต่โค้ดติ๊ก (สิทธิ์ไม่ติ๊ก) → หวัง: โค้ดใช้ไม่ได้ 313', (c, u) => { priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); cp(c, 'MEE20S', 'percent', 20, false, 'หมี่', true); }, 'MEE20S');
run('E) สิทธิ์ 10% ทั้งร้าน + คูปองอัตโนมัติ 50% หมี่ชมพู (ไม่ติ๊ก) → หวัง: สิทธิ์อย่างเดียว -28 = 355', (c, u) => { priv(c, u, 'P10ALL', 'percent', 10, '', false); cp(c, 'AUTOPINK50', 'percent', 50, true, 'หมี่ชมพู', false); });
run('F) สิทธิ์ส่งฟรี + สิทธิ์ 50% หมี่ชมพู + คูปอง 10% (ไม่ติ๊กทั้งหมด) → หวัง: ส่งฟรีอย่างเดียว 280', (c, u) => { priv(c, u, 'SHIP', 'ship_percent', 100, '', false); priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); cp(c, 'AUTO10', 'percent', 10, true, '', false); });
run('F2) เหมือน F แต่ส่งฟรีติ๊ก → หวัง: ส่งฟรี + -70 = 210', (c, u) => { priv(c, u, 'SHIP', 'ship_percent', 100, '', true); priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); cp(c, 'AUTO10', 'percent', 10, true, '', false); });
run('G) ไม่มีสิทธิ์ + คูปองอัตโนมัติ 10% ทั้งร้าน → หวัง: 355 (เหมือนเดิม)', (c, u) => { cp(c, 'AUTO10', 'percent', 10, true, '', false); });
run('H) สิทธิ์ราคาพิเศษ 100 หมี่ชมพู + คูปองราคาพิเศษ 120 หมี่ชมพู → หวัง: สิทธิ์ -40 = 343', (c, u) => { priv(c, u, 'PRICE100', 'price', 100, 'หมี่ชมพู', false); cp(c, 'AUTOP120', 'price', 120, true, 'หมี่ชมพู', false); });
run('I) สิทธิ์ 50% หมี่ชมพู + คูปองอัตโนมัติ 20% หมี่คลุก (ไม่ติ๊ก ไม่ชนกัน) → หวัง: -70 -28 = 285', (c, u) => { priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); cp(c, 'KLUK20', 'percent', 20, true, 'หมี่คลุก', false); });
run('J) สิทธิ์ 50% หมี่ชมพู + คูปองลดค่าส่ง 60% (ไม่ติ๊ก) → หวัง: สิทธิ์อย่างเดียว 313', (c, u) => { priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); cp(c, 'SHIP60', 'ship_percent', 60, true, '', false); });
run('K) เหมือน J แต่คูปองค่าส่งติ๊ก → หวัง: -70 และค่าส่ง -61.8 = 251', (c, u) => { priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); cp(c, 'SHIP60S', 'ship_percent', 60, true, '', true); });
run('L) สิทธิ์ 2 ใบ: 50% หมี่ชมพู + 10% ทั้งร้าน (ไม่ติ๊ก) → หวัง: ใบแรก -70 = 313', (c, u) => { priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); priv(c, u, 'P10ALL', 'percent', 10, '', false); });
run('M) ไม่มีสิทธิ์ + คูปองอัตโนมัติค่าส่ง 60% + 10% ทั้งร้าน (ไม่ติ๊กทั้งคู่) → หวัง: ได้ 10% อย่างเดียว 355', (c, u) => { cp(c, 'AUTO10', 'percent', 10, true, '', false); cp(c, 'SHIP60', 'ship_percent', 60, true, '', false); });
run('N) สิทธิ์ 50% หมี่ชมพู (ติ๊ก) + โค้ด 20% หมี่ (ติ๊ก) → หวัง: ซ้อนได้ -70 -56 = 257', (c, u) => { priv(c, u, 'P50S', 'percent', 50, 'หมี่ชมพู', true); cp(c, 'MEE20S', 'percent', 20, false, 'หมี่', true); }, 'MEE20S');
run('O) ไม่มีสิทธิ์: คูปองอัตโนมัติ 50% หมี่ (ติ๊ก) + ราคาพิเศษ 120 หมี่ชมพู (ไม่ติ๊ก) → หวัง: ได้ใบลดมากกว่า = 50% -140 → 243', (c, u) => { cp(c, 'MEE50S', 'percent', 50, true, 'หมี่', true); cp(c, 'PINK120', 'price', 120, true, 'หมี่ชมพู', false); });
run('P) ไม่มีสิทธิ์: 2 ใบติ๊กทั้งคู่ 10% ทั้งร้าน + 20% หมี่คลุก → หวัง: ซ้อนได้ -28 -28 = 327', (c, u) => { cp(c, 'ALL10S', 'percent', 10, true, '', true); cp(c, 'KLUK20S', 'percent', 20, true, 'หมี่คลุก', true); });
run('Q) สิทธิ์ส่งฟรี (ไม่ติ๊ก) + คูปองค่าส่ง 60% (ติ๊ก) + สิทธิ์ 50% หมี่ชมพู → หวัง: ส่งฟรีอย่างเดียวจากสิทธิ์ + คูปองค่าส่งติ๊กใช้ได้ (ค่าส่งเหลือ 0) → 280', (c, u) => { priv(c, u, 'SHIP', 'ship_percent', 100, '', false); priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); cp(c, 'SHIP60S', 'ship_percent', 60, true, '', true); });
run('R) คูปองค่าส่ง 60% (ติ๊ก) + คูปองค่าส่ง 30 บาท (ไม่ติ๊ก) → หวัง: ใช้ได้ทั้งคู่ ค่าส่งไม่ติดลบ', (c, u) => { cp(c, 'SHIP60S', 'ship_percent', 60, true, '', true); cp(c, 'SHIP30', 'ship_fixed', 30, true, '', false); });
run('S) ไม่มีสิทธิ์: คูปองอัตโนมัติ 50% หมี่ชมพู (ไม่ติ๊ก) + พิมพ์โค้ด 20% หมี่ (ไม่ติ๊ก) → หวัง: ชนกัน ได้ใบลดมากกว่า (อัตโนมัติ -70) 313 โค้ดขึ้นเตือน', (c, u) => { cp(c, 'AUTOPINK50', 'percent', 50, true, 'หมี่ชมพู', false); cp(c, 'MEE20', 'percent', 20, false, 'หมี่', false); }, 'MEE20');
run('T) ไม่มีสิทธิ์: คูปองอัตโนมัติค่าส่ง 60% (ไม่ติ๊ก) + พิมพ์โค้ด 10% ทั้งร้าน (ไม่ติ๊ก) → หวัง: ชนกัน ได้ค่าส่ง -61.8 → 321 โค้ดขึ้นเตือน', (c, u) => { cp(c, 'SHIP60', 'ship_percent', 60, true, '', false); cp(c, 'ALL10', 'percent', 10, false, '', false); }, 'ALL10');
run('S2) เหมือน S แต่โค้ดพิมพ์ติ๊ก → หวัง: ลดเพิ่มได้ -70 -56 = 257', (c, u) => { cp(c, 'AUTOPINK50', 'percent', 50, true, 'หมี่ชมพู', false); cp(c, 'MEE20S', 'percent', 20, false, 'หมี่', true); }, 'MEE20S');
run('T2) เหมือน T แต่โค้ดพิมพ์ติ๊ก → หวัง: ได้ทั้งคู่ 293', (c, u) => { cp(c, 'SHIP60', 'ship_percent', 60, true, '', false); cp(c, 'ALL10S', 'percent', 10, false, '', true); }, 'ALL10S');
