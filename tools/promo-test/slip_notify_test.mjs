// ทดสอบ: แนบสลิปผ่านคิว Supabase แล้วส่งแจ้งเตือน LINE ทันที (ไม่รอ trigger 1-2 นาที) และ trigger ไม่ส่งซ้ำ
import { createGas } from './gasmock.mjs';
// node slip_notify_test.mjs <โฟลเดอร์ที่มีไฟล์ .gs ของ Members LINE>
const D = process.argv[2].replace(/\/?$/, '/');
const { ctx: c } = createGas(['Members.gs', 'SupabaseSync.gs', 'SupabaseSignup.gs', 'SupabaseOrder.gs', 'SupabaseAdmin.gs', 'SupabaseLoyalty.gs'].map(f => D + f));
let fails = 0; const check = (l, ok, d) => { console.log((ok ? '✅ ' : '❌ ') + l + (d !== undefined ? ' → ' + d : '')); if (!ok) fails++; };
const sent = [], rpc = [];
let queue = [];
// สิ่งที่ต่อกับภายนอก: จำลอง
c.mirrorConfig_ = () => ({ url: 'x', key: 'y' });
c.orderIdsAreReal_ = () => true;
c.signupRpc_ = (cfg, fn, args) => { rpc.push(fn); if (fn === 'order_claim') { const r = queue; queue = []; return r; } return null; };
c.mirrorMarkDirtyRemote_ = () => {}; c.mirrorSyncTabsNow_ = () => {}; c.mirrorAfterBackgroundWrite_ = () => {};
c.finalizeSlipNotifications_ = (id) => sent.push(id);
c.uploadShopSlip = (orderId) => { c.scheduleSlipFinalize_(orderId); return { success: true, slipUrl: 'u', rowIndex: 5 }; };
const prop = () => c.PropertiesService.getScriptProperties().getProperty(c.PENDING_SLIP_FINALIZE_PROP_);

// 1) แนบสลิปผ่านคิว Supabase -> ส่งทันที
queue = [{ id: 1, kind: 'slip', order_id: 'REV1', request: {}, attempts: 1 }];
let r = c.orderWritePending_({ tests: false });
check('เขียนคิวสำเร็จ', r.success && r.processed === 1, JSON.stringify(r.results));
check('ส่งแจ้งเตือนทันที 1 ครั้ง', sent.length === 1 && sent[0] === 'REV1', JSON.stringify(sent));
check('คิวของ trigger ว่าง', !prop() || prop() === '[]', prop());
// 2) trigger ที่ตั้งไว้ทำงานตามมา -> ไม่ส่งซ้ำ
c.runPendingSlipFinalizations_();
check('trigger ไม่ส่งซ้ำ', sent.length === 1, JSON.stringify(sent));
// 3) มีอีกออเดอร์ค้างในคิว trigger อยู่ก่อน (แนบผ่าน Apps Script ตรง) -> ไม่ไปแตะ ปล่อยให้ trigger ส่ง
c.scheduleSlipFinalize_('REV_OTHER');
queue = [{ id: 2, kind: 'slip', order_id: 'REV2', request: {}, attempts: 1 }];
c.orderWritePending_({ tests: false });
check('ส่งเฉพาะออเดอร์ของคิว Supabase', JSON.stringify(sent) === JSON.stringify(['REV1', 'REV2']), JSON.stringify(sent));
check('ออเดอร์อื่นยังรอ trigger', JSON.parse(prop() || '[]').indexOf('REV_OTHER') !== -1, prop());
c.runPendingSlipFinalizations_();
check('trigger ส่งออเดอร์อื่นตามปกติ', JSON.stringify(sent) === JSON.stringify(['REV1', 'REV2', 'REV_OTHER']), JSON.stringify(sent));
// 4) คำสั่งซื้อ (ไม่ใช่สลิป) -> ไม่ส่งอะไรเพิ่ม
c.createShopOrder = () => ({ success: true, orderId: 'REV3' });
c.orderChanged_ = () => false;
queue = [{ id: 3, kind: 'order', request: { itemsB64: Buffer.from('[]').toString('base64') }, attempts: 1, line_uid: 'U', predicted: {} }];
c.orderWritePending_({ tests: false });
check('คำสั่งซื้อไม่ส่งแจ้งเตือนสลิป', sent.length === 3, JSON.stringify(sent));
// 5) โหมดทดสอบ -> ไม่ส่ง
c.scheduleSlipFinalize_('REVT');
queue = [{ id: 4, kind: 'slip', order_id: 'REVT', request: {}, attempts: 1 }];
c.orderWritePending_({ tests: true });
check('โหมดทดสอบไม่ส่ง', sent.length === 3, JSON.stringify(sent));
console.log(fails ? '❌ ไม่ผ่าน ' + fails : '✅ ผ่านทั้งหมด');
