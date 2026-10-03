// ทดสอบ: ออเดอร์โอน/พร้อมเพย์ แจ้งกลุ่มแอดมินทันทีตอนสั่ง (ก่อนแนบสลิป) / COD กับยอด 0 บาทไม่ส่งซ้ำ / ยกเลิกเองแจ้งกลุ่ม
// node pending_order_notify_test.mjs <Members.gs>
import { createGas, loadBookFromMirror, loadPropsFromMirror } from './gasmock.mjs';
const MB = '15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk';
const GS = process.argv[2];
let fails = 0; const check = (l, ok, d) => { console.log((ok ? '✅ ' : '❌ ') + l + (d !== undefined ? ' → ' + d : '')); if (!ok) fails++; };
function fresh() {
  loadBookFromMirror(MB, 'members', 'Members'); loadBookFromMirror('1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY', 'revenue', 'Revenue'); loadBookFromMirror('1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w', 'master', 'Master');
  loadPropsFromMirror();
  const { ctx: c, books } = createGas([GS]);
  const sent = [];
  c.sendLineMessages_ = (to, messages) => { sent.push({ to, messages }); return { success: true }; };
  const bk = books.get(MB);
  const uid = bk.sheets.get('Members')._st.grid[3][0];
  c.verifyLineIdToken_ = () => ({ sub: uid, name: 'x' });
  const cg = bk.sheets.get('Coupons')._st.grid; for (let r = 1; r < cg.length; r++) cg[r][7] = false;
  const pg = bk.sheets.get('Member_Privileges')._st.grid; for (let r = 1; r < pg.length; r++) pg[r][7] = false;
  const ca = c.CacheService.getScriptCache(); ['coupons_raw_v3', 'active_coupons_v2', 'active_coupons_v3'].forEach(k => ca.remove(k));
  return { c, sent };
}
const items = JSON.stringify([{ name: 'หมี่ชมพูน้ำพริกหนังแซลมอน บรรจุ 4 ซอง', qty: 2 }, { name: 'หมี่คลุก หนังปลาแซลมอน บรรจุ 4 ซอง', qty: 1 }]);
const toGroup = (c, sent) => sent.filter(s => s.to === c.ADMIN_GROUP_ID);
const text = (s) => s.messages.map(m => m.text || m.altText || m.type).join(' | ');

// 1) พร้อมเพย์ -> ส่งข้อความรอแนบสลิป 1 ข้อความ
{
  const { c, sent } = fresh();
  const o = c.createShopOrder('t', items, 'promptpay', '', 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0);
  check('สั่งพร้อมเพย์สำเร็จ', o.success, o.error);
  const g = toGroup(c, sent);
  check('ส่งเข้ากลุ่มแอดมิน 1 ข้อความ', g.length === 1 && sent.length === 1, sent.length);
  const t = g[0] ? g[0].messages[0].text : '';
  console.log('---\n' + t + '\n---');
  check('มีเลขออเดอร์ ยอด ชื่อสินค้า และคำว่ารอแนบสลิป', t.includes(o.orderId) && t.includes('฿' + Number(o.totalAmount).toLocaleString('en-US')) && t.includes('หมี่ชมพู') && t.includes('x2') && t.includes('รอลูกค้าแนบสลิป') && t.includes('พร้อมเพย์'));
  // 2) ยกเลิกเอง -> แจ้งกลุ่ม
  sent.length = 0;
  const x = c.cancelShopOrder('t', o.orderId);
  check('ยกเลิกสำเร็จ', x.success, x.error);
  const tx = toGroup(c, sent).map(text).join('\n');
  console.log('---\n' + tx + '\n---');
  check('แจ้งกลุ่มว่ายกเลิก', tx.includes('ยกเลิก') && tx.includes(o.orderId) && tx.includes('฿' + Number(o.totalAmount).toLocaleString('en-US')));
  // 3) ยกเลิกซ้ำ -> ไม่สำเร็จ ไม่แจ้ง
  sent.length = 0;
  const x2 = c.cancelShopOrder('t', o.orderId);
  check('ยกเลิกซ้ำไม่สำเร็จและไม่แจ้ง', !x2.success && sent.length === 0, x2.error);
}
// 4) โอนธนาคาร
{
  const { c, sent } = fresh();
  const o = c.createShopOrder('t', items, 'transfer', '', 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0);
  check('โอนธนาคาร: แจ้งรอแนบสลิป 1 ข้อความ', o.success && toGroup(c, sent).length === 1 && text(toGroup(c, sent)[0]).includes('โอนเงินธนาคาร'), text(toGroup(c, sent)[0] || { messages: [] }));
  // 5) แนบสลิปแล้ว -> ยกเลิกเองไม่ได้ ไม่แจ้ง
}
// 6) COD -> การ์ดเต็มเหมือนเดิม ไม่มีข้อความรอแนบสลิป
{
  const { c, sent } = fresh();
  c.evaluateCodEligibility_ = () => ({ allowed: true });
  const o = c.createShopOrder('t', items, 'cod', '', 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0);
  const all = sent.map(text).join('\n');
  check('COD: ส่งการ์ดเต็มทันที ไม่มีข้อความรอแนบสลิป', o.success && toGroup(c, sent).length >= 1 && !all.includes('รอลูกค้าแนบสลิป'), (o.error || '') + ' ' + all.slice(0, 80));
}
// 7) สั่งไม่สำเร็จ -> ไม่แจ้ง
{
  const { c, sent } = fresh();
  const o = c.createShopOrder('t', 'ไม่ใช่ JSON', 'transfer', '', 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0);
  check('สั่งไม่สำเร็จไม่แจ้ง', !o.success && sent.length === 0, JSON.stringify(o).slice(0, 200) + ' sent=' + sent.length);
}
// 8) ข้อความแก้ไขออเดอร์ + รายการเกิน 8
{
  const { c } = fresh();
  const many = Array.from({ length: 10 }, (_, i) => ({ name: 'สินค้า' + i, qty: 1 }));
  const t = c.buildPendingSlipOrderText_('REV1', 'คุณเอ', '0812345678', many, 'พร้อมเพย์ (LINE Shop)', 1234.5, true);
  console.log('---\n' + t + '\n---');
  check('ข้อความแก้ไข/ตัดรายการ', t.startsWith('✏️') && t.includes('…อีก 2 รายการ') && t.includes('฿1,234.5') && t.includes('คุณเอ · 0812345678') && !t.includes('คุณคุณ'));
}
// 9) ลูกค้าแก้ไขออเดอร์ที่ยังไม่แนบสลิป -> ข้อความ "แก้ไขออเดอร์" เลขเดิม
{
  const { c, sent } = fresh();
  const o = c.createShopOrder('t', items, 'promptpay', '', 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0);
  sent.length = 0;
  const e = c.createShopOrder('t', JSON.stringify([{ name: 'หมี่คลุก หนังปลาแซลมอน บรรจุ 4 ซอง', qty: 3 }]), 'promptpay', '', 'ที่อยู่', 'กรุงเทพมหานคร', '', o.orderId, '', 0);
  const t = toGroup(c, sent).map(text).join('\n');
  check('แก้ไขออเดอร์: เลขเดิม ข้อความแก้ไข', e.success && e.orderId === o.orderId && t.startsWith('✏️') && t.includes(o.orderId) && t.includes('x3'), t.split('\n').slice(0, 2).join(' / '));
}
console.log(fails ? '❌ ไม่ผ่าน ' + fails : '✅ ผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
