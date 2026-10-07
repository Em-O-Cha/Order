// ทดสอบสูตรแต้มออเดอร์ร้านค้า (ไม่ต้องใช้ข้อมูลจริง): node points_test.mjs <Members.gs>
//   - แต้มคิดจากยอดสินค้าหลังส่วนลด ไม่รวมค่าส่ง/ค่าเก็บเงินปลายทาง (30 บาท = 1 แต้ม ปัดลง)
//   - โปรคูณแต้ม "สินค้าเฉพาะ" คูณเฉพาะแต้มของสินค้าโปร: (ยอดสินค้าโปร ÷ 30 ปัดลง) × (ตัวคูณ − 1)
//   - โปรคูณแต้มทั้งบิล (ไม่จำกัดสินค้า) คูณทั้งบิลเหมือนเดิม
import { createGas } from './gasmock.mjs';
const GS = process.argv[2];
const { ctx: c } = createGas([GS]);

const day = 24 * 3600 * 1000;
const from = new Date(Date.now() - day), until = new Date(Date.now() + 30 * day);
// แถวชีต Points_Promos: ชื่อ, ประเภท, เปิดใช้, วันเริ่ม, วันหมดอายุ, ตัวคูณ, ยอดขั้นต่ำ, เฉพาะสินค้า, ...
const promo = (name, mult, restriction = '', minPurchase = '') => [name, 'multiplier', true, from, until, mult, minPurchase, restriction, '', '', '', new Date(), ''];

const A = { name: 'น้ำพริกหนังปลา 59', qty: 1, price: 59 };
const B = { name: 'หมี่คลุก 200', qty: 1, price: 200 };
let fails = 0;
function check(label, rows, items, billTotal, deliveryAndCod, tier, repeat, want) {
  c.getCachedPointsPromosRawData_ = () => rows;
  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const info = c.getActivePointsMultiplier_(items, subtotal, new Date());
  const got = c.calcShopOrderPoints_(c.pointsBaseAmount_(billTotal, deliveryAndCod), info, tier, repeat);
  const ok = got === want;
  if (!ok) fails++;
  console.log((ok ? 'ผ่าน ' : 'ไม่ผ่าน ') + label + ' → ได้ ' + got + ' แต้ม' + (ok ? '' : ' (ต้องได้ ' + want + ')') + ' | ' + c.pointsMultiplierNoteParts_(info).join(', '));
}

check('1) ไม่มีโปร บิล 299 (ค่าส่ง 40) → 259 ÷ 30 = 8', [], [A, B], 299, 40, 1, null, 8);
check('2) น้ำพริก x2 เฉพาะสินค้า → 8 + 59÷30(1)×1 = 9', [promo('น้ำพริก x2', 2, 'น้ำพริก')], [A, B], 299, 40, 1, null, 9);
check('3) สินค้าโปรอย่างเดียว 59 บาท x2 ไม่มีค่าส่ง → 1 × 2 = 2', [promo('น้ำพริก x2', 2, 'น้ำพริก')], [A], 59, 0, 1, null, 2);
check('4) ไม่มีสินค้าโปรในตะกร้า → ไม่คูณ 200÷30 = 6', [promo('น้ำพริก x2', 2, 'น้ำพริก')], [B], 240, 40, 1, null, 6);
check('5) น้ำพริก 3 ชิ้น (177) x2 + หมี่ → 377÷30=12 + 177÷30(5) = 17', [promo('น้ำพริก x2', 2, 'น้ำพริก')], [{ ...A, qty: 3 }, B], 417, 40, 1, null, 17);
check('6) ทั้งบิล x2 (ไม่จำกัดสินค้า) → 8 × 2 = 16 เหมือนเดิม', [promo('ทั้งร้าน x2', 2)], [A, B], 299, 40, 1, null, 16);
check('7) ทั้งบิล x2 + น้ำพริก x3 → 8×2 + 1×(3−2) = 17', [promo('ทั้งร้าน x2', 2), promo('น้ำพริก x3', 3, 'น้ำพริก')], [A, B], 299, 40, 1, null, 17);
check('8) สินค้าเข้า 2 โปร (x2, x3) นับโปรสูงสุดโปรเดียว → 8 + 1×2 = 10', [promo('น้ำพริก x2', 2, 'น้ำพริก'), promo('หนังปลา x3', 3, 'หนังปลา')], [A, B], 299, 40, 1, null, 10);
check('9) ส่วนลดเยอะจนยอดสินค้าเหลือ 40 (สินค้าโปร 59) → 1 + 40÷30(1)×1 = 2', [promo('น้ำพริก x2', 2, 'น้ำพริก')], [A, B], 80, 40, 1, null, 2);
check('10) ระดับสมาชิก x1.5 + น้ำพริก x2 → (8 + 1) × 1.5 = 13', [promo('น้ำพริก x2', 2, 'น้ำพริก')], [A, B], 299, 40, 1.5, null, 13);
check('11) ซื้อซ้ำ x2 + โบนัส 5 + น้ำพริก x2 → (8 + 1) × 2 + 5 = 23', [promo('น้ำพริก x2', 2, 'น้ำพริก')], [A, B], 299, 40, 1, { multiplier: 2, bonusPoints: 5 }, 23);
check('12) โปรทั้งบิลยอดขั้นต่ำ 500 ไม่ถึง → 8', [promo('ครบ 500 x2', 2, '', 500)], [A, B], 299, 40, 1, null, 8);
check('13) ค่าส่ง+COD 70 → (329 − 70) ÷ 30 = 8', [], [A, B], 329, 70, 1, null, 8);
check('14) โปรปิดใช้งาน → 8', [[...promo('น้ำพริก x2', 2, 'น้ำพริก').slice(0, 2), false, ...promo('', 2).slice(3)]], [A, B], 299, 40, 1, null, 8);

// ตอนให้แต้มจริง (แนบสลิป / ยืนยันเก็บเงินปลายทาง): creditOrderPointsAndReferrals_ อ่านบิลจากชีต
c.getCachedPointsPromosRawData_ = () => [promo('น้ำพริก x2', 2, 'น้ำพริก')];
const credited = [];
Object.assign(c, {
  hasPointsAlreadyCreditedForOrder_: () => false, findMemberRowIndex_: () => 2,
  ensureMembersSheet_: () => ({ getRange: () => ({ getValues: () => [[0, 0, 0, 0, 0, 100, 'bronze', 0, 0, 0, 0, 1000]] }) }),
  resolveTierByStoredValue_: () => ({ pointMultiplier: 1 }), countPriorOrdersThisMonth_: () => 0,
  addPointsAndCheckRewards_: (uid, pts, spend, row, cur, life, tier, orderId, note) => credited.push({ pts, spend, note }),
  checkAndGrantReferralOnFirstPurchase_: () => {}, checkAndGrantPurchaseReferral_: () => {},
});
c.creditOrderPointsAndReferrals_('REV-T', { items: [A, B], subtotal: 259, billTotal: 299, shippingCost: 40, phone: '0800000000' }, 'Uxxx');
const cr = credited[0] || {};
const okCredit = cr.pts === 9 && cr.spend === 299;
if (!okCredit) fails++;
console.log((okCredit ? 'ผ่าน ' : 'ไม่ผ่าน ') + '15) ให้แต้มตอนแนบสลิป บิล 299 ค่าส่ง 40 น้ำพริก x2 → ' + cr.pts + ' แต้ม (ต้องได้ 9) ยอดซื้อสะสม +' + cr.spend + ' | ' + cr.note);

console.log(fails ? `\nไม่ผ่าน ${fails} ข้อ` : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
