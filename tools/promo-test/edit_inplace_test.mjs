// แก้ไขออเดอร์ที่รอแนบสลิป -> เขียนทับที่ตำแหน่งเดิมในชีต (ไม่ย้ายไปท้ายชีต) — ข้อมูลสมมติ ไม่แตะระบบจริง
//   node edit_inplace_test.mjs <โฟลเดอร์ members-line>
import { createGas, makeEmptyBook } from './gasmock.mjs';
const DIR = process.argv[2];
const MB = '15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk', RV = '1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY', MS = '1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w';
makeEmptyBook(MB, 'Members');
const rv = makeEmptyBook(RV, 'Revenue').api.insertSheet('Revenue');
rv.appendRow(Array.from({ length: 34 }, (_, i) => 'h' + (i + 1)));
const sku = makeEmptyBook(MS, 'Master').api.insertSheet('SKU');
sku.appendRow(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'หมวด', 'ขนาด', 'ราคา', 'รูป', 'น้ำหนัก']);
sku.appendRow(['', '', '', '', '', '', '', 'น้ำพริกหนังปลา', '59', 59, '', 100]);
sku.appendRow(['', '', '', '', '', '', '', 'หมี่คลุก', '200', 200, '', 300]);
sku.appendRow(['', '', '', '', '', '', '', 'น้ำพริกตะไคร้', '45', 45, '', 100]);
const { ctx: c } = createGas([DIR + '/Members.gs']);
let who = 'U1';
c.verifyLineIdToken_ = () => ({ sub: who, name: 'x' });
c.sendLineMessages_ = () => ({ success: true });
c.ensureMembersSheet_().appendRow(['U1', 'ก', '', '0800000001', new Date(), 0, '', 'ที่อยู่', 'กรุงเทพมหานคร', 'ทดสอบ', '', 0, 'M1']);
c.ensureMembersSheet_().appendRow(['U2', 'ข', '', '0800000002', new Date(), 0, '', 'ที่อยู่', 'กรุงเทพมหานคร', 'ทดสอบ', '', 0, 'M2']);
let fails = 0;
const ok = (label, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'ผ่าน ' : 'ไม่ผ่าน ') + label + (extra ? ' | ' + extra : '')); };
const A = (n) => [{ name: 'น้ำพริกหนังปลา 59', qty: 1 }, { name: 'หมี่คลุก 200', qty: 1 }, { name: 'น้ำพริกตะไคร้ 45', qty: 2 }].slice(0, n);
const order = (uid, items, editId) => { who = uid; return c.createShopOrder('t', JSON.stringify(items), 'transfer', '', 'ที่อยู่', 'กรุงเทพมหานคร', '', editId || '', '', 0); };
const colA = () => rv._st.grid.slice(1).map((r) => String((r && r[0]) || ''));
const colC = () => rv._st.grid.slice(1).map((r) => String((r && r[2]) || ''));

const o1 = order('U1', A(2)); const o2 = order('U2', A(1)); const o3 = order('U1', A(1));
ok('0) สร้าง 3 ออเดอร์', o1.success && o2.success && o3.success, [o1.orderId, o2.orderId, o3.orderId].join(','));
ok('0b) เรียงในชีต', colA().join(',') === [o1.orderId, '', o2.orderId, o3.orderId].join(','), colA().join(','));

let r = order('U1', A(3), o1.orderId);
ok('1) แก้ไขออเดอร์แรกเป็น 3 รายการ -> เลขเดิม', r.success && r.orderId === o1.orderId && r.isEdit, r.error || '');
ok('1b) อยู่ที่เดิม (ไม่ย้ายไปท้ายชีต) และออเดอร์อื่นไม่เพี้ยน', colA().join(',') === [o1.orderId, '', '', o2.orderId, o3.orderId].join(','), colA().join(','));
ok('1c) รายการสินค้าครบ 3 แถว', colC().slice(0, 3).join('|') === 'น้ำพริกหนังปลา 59|หมี่คลุก 200|น้ำพริกตะไคร้ 45' && colC()[3] === 'น้ำพริกหนังปลา 59', colC().join('|'));
ok('1d) ยอดใหม่ในแถวแรก', rv._st.grid[1][8] === r.totalAmount, rv._st.grid[1][8] + ' vs ' + r.totalAmount);

r = order('U1', A(1), o1.orderId);
ok('2) แก้ไขลดเหลือ 1 รายการ -> ลบแถวส่วนเกิน ออเดอร์อื่นไม่เพี้ยน', r.success && colA().join(',') === [o1.orderId, o2.orderId, o3.orderId].join(','), colA().join(','));
ok('2b) ข้อมูลออเดอร์ที่ 2 ไม่ถูกทับ', String(rv._st.grid[2][14]).replace(/^0/, '') === '800000002' && rv._st.grid[2][2] === 'น้ำพริกหนังปลา 59', JSON.stringify(rv._st.grid[2].slice(0, 3)));

r = order('U1', A(2), o3.orderId);
ok('3) แก้ไขออเดอร์ล่างสุดเป็น 2 รายการ', r.success && colA().join(',') === [o1.orderId, o2.orderId, o3.orderId, ''].join(','), colA().join(','));
const o4 = order('U2', A(1));
ok('4) ออเดอร์ใหม่ต่อท้าย เลขไม่ซ้ำ', o4.success && colA().join(',') === [o1.orderId, o2.orderId, o3.orderId, '', o4.orderId].join(',') && new Set([o1.orderId, o2.orderId, o3.orderId, o4.orderId]).size === 4, colA().join(','));
ok('5) แถวแรกยังเป็นของ U1', String(rv._st.grid[1][31]) === 'U1', String(rv._st.grid[1][31]));
console.log(fails ? `\nไม่ผ่าน ${fails} ข้อ` : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
