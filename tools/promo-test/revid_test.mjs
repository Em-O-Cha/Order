// ทดสอบเลขที่ออเดอร์ LINE Shop ไม่ซ้ำ เมื่อแถวล่างสุดเป็นออเดอร์เก่าที่ลูกค้าเพิ่งแก้ไข (ย้ายไปต่อท้ายด้วยเลขเดิม)
//   node revid_test.mjs <โฟลเดอร์ members-line>
import { createGas, makeEmptyBook } from './gasmock.mjs';
const DIR = process.argv[2];
const RV = '1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY';
const sh = makeEmptyBook(RV, 'Revenue').api.insertSheet('Revenue');
sh.appendRow(Array.from({ length: 34 }, (_, i) => 'h' + (i + 1)));
const { ctx: c } = createGas([DIR + '/Members.gs']);
const now = new Date(), yy = String(now.getFullYear() + 543).slice(-2), mm = String(now.getMonth() + 1).padStart(2, '0');
const P = 'REV' + yy + mm, prev = 'REV' + yy + String(((now.getMonth() + 11) % 12) + 1).padStart(2, '0');
let fails = 0;
const ok = (label, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'ผ่าน ' : 'ไม่ผ่าน ') + label + (extra ? ' | ' + extra : '')); };
ok('1) ชีตว่าง -> 001', c.generateShopRevenueId_(sh) === P + '001');
[P + '047', P + '048', '', P + '016'].forEach((id) => sh.appendRow([id]));
let id = c.generateShopRevenueId_(sh);
ok('2) แถวล่างสุดเป็นออเดอร์เก่าที่แก้ไข -> ต่อจากเลขสูงสุด ไม่ซ้ำ', id === P + '049', id);
sh.appendRow([prev + '120']);
id = c.generateShopRevenueId_(sh);
ok('3) แถวล่างสุดเป็นออเดอร์เดือนก่อนที่แก้ไข -> ยังต่อจากเลขเดือนนี้', id === P + '049', id);
console.log(fails ? `\nไม่ผ่าน ${fails} ข้อ` : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
