// ทดสอบ: แอดมินแนบสลิปแทนลูกค้า (แท็บคีย์ออเดอร์มือ) / ตอนสั่งซื้อ+ยกเลิกเอง ส่ง LINE หาลูกค้าเท่านั้น (กลุ่มแอดมินได้เฉพาะตอนแนบสลิป)
// node admin_slip_test.mjs <โฟลเดอร์ที่มีไฟล์ .gs ของ Members LINE>
import { createGas, loadBookFromMirror, loadPropsFromMirror } from './gasmock.mjs';
const MB = '15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk';
const D = process.argv[2].replace(/\/?$/, '/');
let fails = 0; const check = (l, ok, d) => { console.log((ok ? '✅ ' : '❌ ') + l + (d !== undefined ? ' → ' + d : '')); if (!ok) fails++; };
function fresh() {
  loadBookFromMirror(MB, 'members', 'Members'); loadBookFromMirror('1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY', 'revenue', 'Revenue'); loadBookFromMirror('1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w', 'master', 'Master');
  loadPropsFromMirror();
  const { ctx: c, books } = createGas(['Members.gs', 'SupabaseSync.gs', 'SupabaseOrder.gs'].map(f => D + f));
  const sent = [], mirrored = [];
  c.sendLineMessages_ = (to, messages) => { sent.push({ to, messages }); return { success: true }; };
  c.mirrorAfterBackgroundWrite_ = (tabs) => mirrored.push(tabs);
  c.checkAdminPin_ = (p) => p === 'PIN';
  let n = 0;
  c.DriveApp.getFolderById = () => ({ createFile: () => ({ getId: () => 'slipfile' + (++n) }) });
  c.ensureSlipFileShared_ = () => {};
  c.ScriptApp = { newTrigger: () => ({ timeBased: () => ({ after: () => ({ create: () => ({}) }) }) }), getProjectTriggers: () => [], deleteTrigger() {} };
  const bk = books.get(MB);
  const uid = bk.sheets.get('Members')._st.grid[3][0];
  c.verifyLineIdToken_ = () => ({ sub: uid, name: 'x' });
  const cg = bk.sheets.get('Coupons')._st.grid; for (let r = 1; r < cg.length; r++) cg[r][7] = false;
  const pg = bk.sheets.get('Member_Privileges')._st.grid; for (let r = 1; r < pg.length; r++) pg[r][7] = false;
  const ca = c.CacheService.getScriptCache(); ['coupons_raw_v3', 'active_coupons_v2', 'active_coupons_v3'].forEach(k => ca.remove(k));
  return { c, sent, mirrored, uid, bk };
}
const items = JSON.stringify([{ name: 'หมี่ชมพูน้ำพริกหนังแซลมอน บรรจุ 4 ซอง', qty: 2 }, { name: 'หมี่คลุก หนังปลาแซลมอน บรรจุ 4 ซอง', qty: 1 }]);
const text = (s) => s.messages.map(m => m.text || m.altText || m.type).join(' | ');
const toGroup = (c, sent) => sent.filter(s => s.to === c.ADMIN_GROUP_ID);
const revRow = (c, id) => { const sh = c.ensureRevenueSheet_(); const r = c.findRevenueRowByOrderId_(sh, id); return sh.getRange(r, 1, 1, 32).getValues()[0]; };

{
  const { c, sent, mirrored, uid } = fresh();
  // 1) สั่งพร้อมเพย์ 2 ใบ (เหมือนเคสลูกค้ากดซ้ำ) -> ไม่มีข้อความเข้ากลุ่ม
  const o1 = c.createShopOrder('t', items, 'promptpay', '', 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0);
  const o2 = c.createShopOrder('t', items, 'promptpay', '', 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0);
  check('สั่งพร้อมเพย์ 2 ใบสำเร็จ', o1.success && o2.success && o1.orderId !== o2.orderId, o1.orderId + ' ' + o2.orderId);
  check('ตอนสั่งซื้อไม่ส่งเข้ากลุ่มแอดมิน', toGroup(c, sent).length === 0, toGroup(c, sent).length);
  const pm = sent.filter(s => s.to === uid);
  check('ตอนสั่งซื้อส่งหาลูกค้าใบละ 1 ข้อความ', pm.length === 2 && sent.length === 2, sent.length);
  const b0 = pm[0] && pm[0].messages[0];
  const btns = b0 ? b0.contents.footer.contents.map(x => x.action) : [];
  check('ข้อความรอแนบสลิป: ปุ่มแนบสลิปพาไปออเดอร์นี้ + ปุ่มดู/ยกเลิก', b0 && /รอแนบสลิป/.test(b0.altText) && b0.altText.includes(o1.orderId)
    && btns[0].uri === 'https://liff.line.me/2010892131-3XYQXNzq?slip=' + o1.orderId && btns[1].uri.endsWith('?view=cart'), JSON.stringify(btns));
  const flat = JSON.stringify(b0);
  check('ข้อความรอแนบสลิป: มีสินค้า ยอด ช่องทางชำระ', flat.includes('หมี่ชมพูน้ำพริกหนังแซลมอน บรรจุ 4 ซอง x2') && flat.includes(c.fmtOrderBaht_(o1.totalAmount)) && flat.includes('ช่องทางชำระเงิน: พร้อมเพย์'));
  if (process.env.FLEX_OUT) (await import('fs')).writeFileSync(process.env.FLEX_OUT, JSON.stringify({ pending: b0 }, null, 1));
  sent.length = 0;
  // 2) รายการรอแนบสลิป
  const bad = c.listPendingSlipOrders('ผิด');
  check('PIN ผิด -> ไม่ให้ดู', !bad.success);
  const L = c.listPendingSlipOrders('PIN');
  const ids = L.results.map(r => r.orderId);
  check('รายการรอแนบสลิปมีทั้ง 2 ใบ ใหม่สุดก่อน', L.success && ids[0] === o2.orderId && ids[1] === o1.orderId, ids.slice(0, 3).join(','));
  const r1 = L.results[1];
  check('ข้อมูลในรายการครบ', r1.amount === o1.totalAmount && r1.items.length === 2 && r1.items[0].qty === 2 && r1.phone && r1.customerName && /พร้อมเพย์/.test(r1.paymentLabel), JSON.stringify(r1).slice(0, 200));
  // ไม่มีออเดอร์ที่แนบสลิปแล้ว/ยกเลิก/COD ปนมา
  const sh = c.ensureRevenueSheet_();
  const all = sh.getRange(2, 1, sh.getLastRow() - 1, 32).getValues();
  const wrong = L.results.filter(r => { const row = all.find(x => String(x[0]) === r.orderId); return !row || row[10] || row[2] === 'ยกเลิก' || /เก็บเงินปลายทาง/.test(row[9]); });
  check('รายการไม่มีออเดอร์ที่แนบแล้ว/ยกเลิก/COD', wrong.length === 0, wrong.map(r => r.orderId).join(','));
  // 3) แนบสลิปแทนลูกค้า
  check('PIN ผิด -> แนบไม่ได้', !c.adminAttachSlip('ผิด', o1.orderId, 'AA==', 's.jpg', 'image/jpeg').success);
  check('ไม่ใช่รูป -> แนบไม่ได้', !c.adminAttachSlip('PIN', o1.orderId, 'AA==', 's.pdf', 'application/pdf').success);
  check('ไม่มีเลขออเดอร์นี้ -> แนบไม่ได้', !c.adminAttachSlip('PIN', 'REV0000000', 'AA==', 's.jpg', 'image/jpeg').success);
  sent.length = 0;
  const pointsBefore = c.getMemberRowByUid_(uid, 6).values[5];
  const a = c.adminAttachSlip('PIN', o1.orderId, 'AA==', 's.jpg', 'image/jpeg');
  check('แนบสลิปสำเร็จ และส่งแจ้งเตือนทันที', a.success && a.notified === true, JSON.stringify(a));
  const row = revRow(c, o1.orderId);
  check('ชีต: มีลิงก์สลิป วันชำระเงิน และหมายเหตุ', /slipfile/.test(row[10]) && row[30] && /รอตรวจสอบสลิป/.test(row[19]) && /แอดมินแนบสลิปแทนลูกค้า/.test(row[19]), String(row[19]).slice(-90));
  const buyerMsgs = sent.filter(s => s.to === uid), groupMsgs = toGroup(c, sent);
  check('ลูกค้าได้ LINE ยืนยัน', buyerMsgs.length >= 1, buyerMsgs.map(text).join(' / ').slice(0, 100));
  check('กลุ่มแอดมินได้การ์ดออเดอร์ + รูปสลิป', groupMsgs.length === 2 && groupMsgs[1].messages[0].type === 'image' && text(groupMsgs[0]).includes(o1.orderId), groupMsgs.map(text).join(' / ').slice(0, 120));
  const pointsAfter = c.getMemberRowByUid_(uid, 6).values[5];
  check('ลูกค้าได้แต้ม', Number(pointsAfter) > Number(pointsBefore), pointsBefore + ' -> ' + pointsAfter);
  check('ส่งสำเนาไป Supabase', mirrored.length === 1, JSON.stringify(mirrored).slice(0, 80));
  const pend = c.PropertiesService.getScriptProperties().getProperty(c.PENDING_SLIP_FINALIZE_PROP_);
  check('ไม่ค้างในคิว trigger (ไม่ส่งซ้ำ)', !pend || JSON.parse(pend).indexOf(o1.orderId) === -1, pend);
  c.runPendingSlipFinalizations_ && c.runPendingSlipFinalizations_();
  check('trigger ตามมาไม่ส่งซ้ำ', toGroup(c, sent).length === 2, toGroup(c, sent).length);
  // 4) แนบซ้ำ -> ไม่ได้
  const n0 = sent.length;
  const a2 = c.adminAttachSlip('PIN', o1.orderId, 'AA==', 's.jpg', 'image/jpeg');
  check('แนบซ้ำไม่ได้', !a2.success && /แนบสลิปไปแล้ว/.test(a2.error) && sent.length === n0, a2.error);
  check('ใบที่แนบแล้วหายจากรายการ', c.listPendingSlipOrders('PIN').results.every(r => r.orderId !== o1.orderId));
  // 5) ลูกค้ายกเลิกใบซ้ำเอง -> แจ้งกลุ่ม, หายจากรายการ, แนบไม่ได้
  sent.length = 0;
  const x = c.cancelShopOrder('t', o2.orderId);
  const tx = toGroup(c, sent).map(text).join('\n');
  const cm = sent.filter(s => s.to === uid);
  const cflat = JSON.stringify(cm);
  check('ยกเลิกเอง -> ไม่แจ้งกลุ่มแอดมิน', x.success && tx === '', tx);
  check('ยกเลิกเอง -> ลูกค้าได้ข้อความยกเลิก ไม่มีปุ่ม', cm.length === 1 && /ยกเลิกคำสั่งซื้อ/.test(cm[0].messages[0].altText) && cflat.includes(o2.orderId)
    && cflat.includes('หมี่ชมพูน้ำพริกหนังแซลมอน บรรจุ 4 ซอง x2') && !cm[0].messages[0].contents.footer && !cflat.includes('"uri"'), cm.length);
  if (process.env.FLEX_OUT) { const fs = await import('fs'); const j = JSON.parse(fs.readFileSync(process.env.FLEX_OUT, 'utf8')); j.cancelled = cm[0].messages[0]; fs.writeFileSync(process.env.FLEX_OUT, JSON.stringify(j, null, 1)); }
  check('ใบที่ยกเลิกหายจากรายการ', c.listPendingSlipOrders('PIN').results.every(r => r.orderId !== o2.orderId));
  const a3 = c.adminAttachSlip('PIN', o2.orderId, 'AA==', 's.jpg', 'image/jpeg');
  check('ใบที่ยกเลิกแนบไม่ได้', !a3.success && /ยกเลิก/.test(a3.error), a3.error);
  sent.length = 0;
  check('ยกเลิกซ้ำไม่สำเร็จ ไม่แจ้ง', !c.cancelShopOrder('t', o2.orderId).success && sent.length === 0);
}
// 6) COD แนบไม่ได้ / ไม่อยู่ในรายการ
{
  const { c, sent } = fresh();
  c.evaluateCodEligibility_ = () => ({ allowed: true });
  const o = c.createShopOrder('t', items, 'cod', '', 'ที่อยู่', 'กรุงเทพมหานคร', '', '', '', 0);
  check('COD: การ์ดเต็มยังส่งทันทีเหมือนเดิม ไม่มีข้อความรอแนบสลิป', o.success && toGroup(c, sent).length >= 1 && !JSON.stringify(sent).includes('รอแนบสลิป'));
  const a = c.adminAttachSlip('PIN', o.orderId, 'AA==', 's.jpg', 'image/jpeg');
  check('COD: แนบสลิปไม่ได้ ไม่อยู่ในรายการ', !a.success && c.listPendingSlipOrders('PIN').results.every(r => r.orderId !== o.orderId), a.error);
}
console.log(fails ? '❌ ไม่ผ่าน ' + fails : '✅ ผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
