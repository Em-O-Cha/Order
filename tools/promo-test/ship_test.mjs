import { createGas, loadBookFromMirror, loadPropsFromMirror } from './gasmock.mjs';
const MB = '15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk';
const GS = process.argv[2]; // node ship_test.mjs <Members.gs>
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
run('1) คูปองอัตโนมัติ ค่าส่ง 20 บาท (ไม่ติ๊ก) ตะกร้าหมี่ 2 อย่าง → หวัง: ค่าส่ง 103 → 20 ยอด 300', (c, u) => { cp(c, 'SHIP20', 'ship_price', 20, true, '', false); });
run('2) คูปองค่าส่ง 20 บาท (ติ๊ก) + สิทธิ์ 50% หมี่ชมพู (ไม่ติ๊ก) → หวัง: ได้ทั้งคู่ 280-70+20 = 230', (c, u) => { cp(c, 'SHIP20S', 'ship_price', 20, true, '', true); priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); });
run('3) คูปองค่าส่ง 20 บาท (ไม่ติ๊ก) + สิทธิ์ 50% หมี่ชมพู (ไม่ติ๊ก) → หวัง: สิทธิ์อย่างเดียว 313', (c, u) => { cp(c, 'SHIP20', 'ship_price', 20, true, '', false); priv(c, u, 'P50ชมพู', 'percent', 50, 'หมี่ชมพู', false); });
run('4) สิทธิ์สมาชิก ค่าส่ง 0 บาท (ส่งฟรี) → หวัง: 280', (c, u) => { priv(c, u, 'SHIP0', 'ship_price', 0, '', true); });
run('5) คูปองค่าส่ง 20 (ติ๊ก) + คูปองลดค่าส่ง 60% (ติ๊ก) → หวัง: ค่าส่งไม่ติดลบ ≥ 0', (c, u) => { cp(c, 'SHIP20S', 'ship_price', 20, true, '', true); cp(c, 'SHIP60S', 'ship_percent', 60, true, '', true); });
run('6) พิมพ์โค้ดค่าส่ง 20 (ติ๊ก) → หวัง: 300', (c, u) => { cp(c, 'SHIPCODE', 'ship_price', 20, false, '', true); }, 'SHIPCODE');
