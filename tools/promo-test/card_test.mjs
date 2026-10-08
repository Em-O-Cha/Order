// ทดสอบชำระด้วยบัตร (ข้อมูลสมมติ ไม่แตะระบบจริง): node card_test.mjs <โฟลเดอร์ members-line>
//   สั่งซื้อแบบบัตร (ปิดอยู่/เปิด+ค่าธรรมเนียม) / ยอดคำนวณใหม่รวมค่าธรรมเนียม / ขอลิงก์ / ยืนยันเมื่อจ่ายแล้ว
//   ยืนยันซ้ำไม่ทำซ้ำ / ยอดไม่ตรง / ยกเลิกแล้ว / คนอื่นขอลิงก์ / ออเดอร์โอนเงินขอลิงก์ไม่ได้
import { createGas, makeEmptyBook } from './gasmock.mjs';
const DIR = process.argv[2];
const MB = '15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk', RV = '1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY', MS = '1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w';
makeEmptyBook(MB, 'Members');
makeEmptyBook(RV, 'Revenue').api.insertSheet('Revenue').appendRow(Array.from({ length: 34 }, (_, i) => 'h' + (i + 1)));
const sku = makeEmptyBook(MS, 'Master').api.insertSheet('SKU');
sku.appendRow(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'หมวด', 'ขนาด', 'ราคา', 'รูป', 'น้ำหนัก']);
sku.appendRow(['', '', '', '', '', '', '', 'น้ำพริกหนังปลา', '59', 59, '', 100]);
sku.appendRow(['', '', '', '', '', '', '', 'หมี่คลุก', '200', 200, '', 300]);
const { ctx: c } = createGas([DIR + '/Members.gs', DIR + '/SupabaseCard.gs']);
const UID = 'Utest', OTHER = 'Uother';
let who = UID;
c.verifyLineIdToken_ = () => ({ sub: who, name: 'x' });
const sent = [];
c.sendLineMessages_ = (to, msgs) => { sent.push({ to, msgs }); return { success: true }; };
c.checkAdminPin_ = () => true;
c.ensureMembersSheet_().appendRow([UID, 'x', '', '0800000000', new Date(), 100, '', 'ที่อยู่', 'กรุงเทพมหานคร', 'ทดสอบ', '', 1000, 'M0001']);
const props = c.PropertiesService.getScriptProperties();
const setCard = (cfg) => { props.setProperty('CARD_CONFIG_V1', JSON.stringify(cfg)); c.CacheService.getScriptCache().remove('card_config_v1'); };

// card-pay จำลอง
let edge = { paid: false, amount: 0 };
const edgeCalls = [];
c.cardEdge_ = (p) => {
  edgeCalls.push(p.action);
  if (p.action === 'status') return { success: true, ready: true, provider: 'mock', mode: 'test' };
  if (p.action === 'createLink') return { success: true, url: 'https://pay.example/' + p.orderId + '?amt=' + p.amount };
  if (p.action === 'check') return edge.paid ? { success: true, paid: true, amount: edge.amount, ref: 'REF123', id: 'id1' } : { success: true, paid: false, status: 'pending' };
  if (p.action === 'confirmed') return { success: true };
  return { success: false, error: 'unknown' };
};

let fails = 0;
const ok = (label, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'ผ่าน ' : 'ไม่ผ่าน ') + label + (extra ? ' | ' + extra : '')); };
const items = [{ name: 'น้ำพริกหนังปลา 59', qty: 1 }, { name: 'หมี่คลุก 200', qty: 1 }];
const order = (pm) => c.createShopOrder('t', JSON.stringify(items), pm, '', 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0);
const rv = () => c.ensureRevenueSheet_();
const rowOf = (id) => c.findRevenueRowByOrderId_(rv(), id);
const cell = (id, col) => rv().getRange(rowOf(id), col).getValue();

// 1) ปิดอยู่ (ค่าเริ่มต้น)
let o = order('card');
ok('1) ร้านยังไม่เปิดบัตร -> สั่งแบบบัตรไม่ได้', !o.success && /ปิดรับชำระด้วยบัตร/.test(o.error), o.error);
const t0 = order('transfer');
ok('1b) โอนเงินยังสั่งได้ปกติ', t0.success && !t0.isCard && t0.cardFee === 0, `ยอด ${t0.totalAmount}`);

// 2) เปิด + ค่าธรรมเนียม 3%
setCard({ enabled: true, fee: 3, feeType: 'percent', minAmount: 0, maxAmount: 0 });
o = order('card');
const base = t0.totalAmount; // 259 + ค่าส่ง
const fee = Math.round(base * 3 / 100);
ok('2) สั่งแบบบัตร: ค่าธรรมเนียม 3% บวกในยอดและช่องค่าส่ง', o.success && o.isCard && o.cardFee === fee && o.totalAmount === base + fee && o.shippingCost === t0.shippingCost + fee,
  `ยอด ${o.totalAmount} ค่าธรรมเนียม ${o.cardFee} ช่อง H ${o.shippingCost}`);
ok('2b) แต้มไม่นับค่าธรรมเนียมบัตร', o.pointsEarned === t0.pointsEarned, `แต้ม ${o.pointsEarned} (โอนได้ ${t0.pointsEarned})`);
const cardId = o.orderId;
ok('2c) ชีต: ช่องทาง "บัตรเครดิต/เดบิต" หมายเหตุรอแนบสลิป', /บัตรเครดิต\/เดบิต/.test(cell(cardId, 10)) && /รอแนบสลิป - LINE Shop/.test(cell(cardId, 20)) && /ค่าธรรมเนียมชำระด้วยบัตร/.test(cell(cardId, 20)), cell(cardId, 10));
const cardMsg = JSON.stringify(c.buildBuyerPendingSlipFlexMessage_(cardId, [], 'บัตรเครดิต/เดบิต (LINE Shop)', 259, 0, 61, 320, false));
const slipMsg = JSON.stringify(c.buildBuyerPendingSlipFlexMessage_('REV1', [], 'โอนเงินธนาคาร (LINE Shop)', 259, 0, 52, 311, false));
ok('2d) LINE หาลูกค้า: ออเดอร์บัตรปุ่ม "ชำระด้วยบัตร" / ออเดอร์โอนยังเป็น "แนบสลิป"',
  cardMsg.includes('💳 ชำระด้วยบัตร') && cardMsg.includes('รอชำระด้วยบัตร') && !cardMsg.includes('📎 แนบสลิป') && slipMsg.includes('📎 แนบสลิป') && !slipMsg.includes('ชำระด้วยบัตร'));

// 3) ยอดขั้นต่ำ
setCard({ enabled: true, fee: 3, feeType: 'percent', minAmount: 1000 });
o = order('card');
ok('3) ยอดไม่ถึงขั้นต่ำ -> สั่งแบบบัตรไม่ได้', !o.success && /ขั้นต่ำ/.test(o.error), o.error);
setCard({ enabled: true, fee: 3, feeType: 'percent' });

// 4) คำนวณยอดใหม่ (ปุ่มดำเนินการต่อ) ต้องรวมค่าธรรมเนียม -> ไม่ขึ้นว่ายอดเปลี่ยน
const re = c.checkPendingOrderPromoStillValid('t', cardId);
ok('4) เช็คยอดออเดอร์บัตรที่รอจ่าย -> ยอดไม่เปลี่ยน', re.success && re.changed === false, JSON.stringify(re));

// 5) ขอลิงก์
let r = c.cardHandleShopAction_('startCardPayment', 't', cardId);
ok('5) ขอลิงก์ชำระเงิน: ยอดจากชีต', r.success && r.url === 'https://pay.example/' + cardId + '?amt=' + (base + fee), r.url || r.error);
who = OTHER;
r = c.cardHandleShopAction_('startCardPayment', 't', cardId);
ok('5b) คนอื่นขอลิงก์ออเดอร์นี้ไม่ได้', !r.success && /ไม่มีสิทธิ์/.test(r.error), r.error);
who = UID;
r = c.cardHandleShopAction_('startCardPayment', 't', t0.orderId);
ok('5c) ออเดอร์โอนเงินขอลิงก์บัตรไม่ได้', !r.success && /ไม่ได้เลือกชำระด้วยบัตร/.test(r.error), r.error);

// 6) ยังไม่จ่าย
r = c.cardHandleShopAction_('checkCardPayment', 't', cardId);
ok('6) ยังไม่จ่าย -> paid=false ไม่แตะชีต', r.success && r.paid === false && !cell(cardId, 11), JSON.stringify(r));

// 7) ยอดที่จ่ายไม่ตรง -> ไม่ยืนยัน แจ้งแอดมิน
edge = { paid: true, amount: base + fee - 50 };
const sentBefore = sent.length;
r = c.cardHandleShopAction_('checkCardPayment', 't', cardId);
ok('7) จ่ายยอดไม่ตรง -> ไม่ยืนยันออเดอร์ + แจ้งกลุ่มแอดมิน', !r.success && !cell(cardId, 11) && sent.slice(sentBefore).some((x) => x.to === c.ADMIN_GROUP_ID), r.error);

// 8) จ่ายครบ -> ยืนยัน
edge = { paid: true, amount: base + fee };
r = c.cardHandleShopAction_('checkCardPayment', 't', cardId);
ok('8) จ่ายครบ -> ยืนยันออเดอร์', r.success && r.paid === true, JSON.stringify(r));
ok('8b) ชีต: K = ชำระด้วยบัตรแล้ว, หมายเหตุเปลี่ยน, มีวันชำระเงิน', /^ชำระด้วยบัตรแล้ว \(อ้างอิง REF123\)/.test(cell(cardId, 11)) && /ชำระด้วยบัตรแล้ว - LINE Shop/.test(cell(cardId, 20)) && !/รอแนบสลิป/.test(cell(cardId, 20)) && !!cell(cardId, 31),
  cell(cardId, 11));
const pend = JSON.parse(props.getProperty('pending_slip_finalize_ids') || '[]');
ok('8c) ตั้งคิวส่ง LINE ยืนยัน/ให้แต้ม (ตัวเดียวกับแนบสลิป)', pend.includes(cardId));

// 9) ยืนยันซ้ำ (ธนาคารแจ้งซ้ำ / รอบสำรอง) -> ไม่ทำซ้ำ
const k1 = cell(cardId, 11);
r = c.cardConfirmOrder_(cardId, { amount: base + fee, ref: 'REF999' });
ok('9) ยืนยันซ้ำ -> already ไม่เขียนทับ', r.success && r.already && cell(cardId, 11) === k1);
r = c.cardHandleShopAction_('startCardPayment', 't', cardId);
ok('9b) ขอลิงก์หลังจ่ายแล้ว -> paid', r.success && r.paid === true);

// 10) ออเดอร์ที่ยกเลิกแล้วแต่ลูกค้าจ่าย -> แจ้งแอดมิน
o = order('card');
const cId = o.orderId;
rv().getRange(rowOf(cId), 3).setValue(c.CANCELLED_ORDER_MARK_);
const sb2 = sent.length;
r = c.cardConfirmOrder_(cId, { amount: o.totalAmount, ref: 'REF555' });
ok('10) ยกเลิกแล้วแต่จ่าย -> ไม่ยืนยัน + แจ้งแอดมินคืนเงิน', !r.success && sent.slice(sb2).some((x) => x.to === c.ADMIN_GROUP_ID && JSON.stringify(x.msgs).includes('ยกเลิก')), r.error);

// 11) เปิดใช้ไม่ได้ถ้ายังไม่เชื่อมต่อธนาคาร
c.CacheService.getScriptCache().remove('card_provider_status');
const realEdge = c.cardEdge_;
c.cardEdge_ = (p) => p.action === 'status' ? { success: true, ready: false, provider: '', message: 'รอเอกสาร API' } : realEdge(p);
r = c.updateCardConfig('pin', JSON.stringify({ enabled: true }));
ok('11) ยังไม่เชื่อมต่อธนาคาร -> เปิดใช้ไม่ได้', !r.success && /รอเอกสาร API/.test(r.error), r.error);
r = c.updateCardConfig('pin', JSON.stringify({ enabled: false, fee: 2 }));
ok('11b) บันทึกค่าตั้งแบบปิดได้', r.success && r.config.enabled === false && r.config.fee === 2);

console.log(fails ? `\nไม่ผ่าน ${fails} ข้อ` : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
