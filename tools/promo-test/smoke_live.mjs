import { loadSkus } from './skus.mjs';
import { sql } from './sql.mjs';
import { callEdge } from './edge_call.mjs';
// node smoke_live.mjs <Members.gs>
const skus = loadSkus(process.argv[2]);
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const uid = sql(`select data->>'LINE UID' u from mirror.rows where source='members' and tab='Members' and coalesce(data->>'LINE UID','')<>'' order by row_num limit 1 offset 2`)[0].u;
const items = b64([{ name: skus[0][0], qty: 2 }]);
const r1 = await callEdge('shop-read', [{ action: 'checkShopDiscounts', asUid: uid, couponCode: 'ลดค่าจัดส่ง 60%', subtotal: '0', itemsB64: items, excludePrivilegeName: '', pointsToRedeem: '0', existingOrderId: '' }, { action: 'getActiveCoupons' }]);
console.log('shop-read', r1.map(r => r.status + ' ' + JSON.stringify(r.body).slice(0, 160)).join('\n '));
const r2 = await callEdge('shop-order', [{ action: 'health' }, { action: 'createShopOrderDryRun', asUid: uid, itemsB64: items, paymentMethod: 'transfer', couponCode: '', shippingAddress: 'x', province: 'กรุงเทพมหานคร', excludePrivilegeName: '', purchaseReferrerCode: '', pointsToRedeem: '0' }]);
console.log('shop-order', r2.map(r => r.status + ' ' + JSON.stringify(r.body?.result ?? r.body).slice(0, 160)).join('\n '));
const r3 = await callEdge('admin-read', [{ action: 'health' }], { internal: false });
console.log('admin-read', r3[0].status, JSON.stringify(r3[0].body));
