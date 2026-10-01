// เทียบ shop-order (ที่ลูกค้าใช้) กับ shop-order-next ด้วย createShopOrderDryRun (ไม่เขียนอะไร)
import { sql } from './sql.mjs';
import { callEdge } from './edge_call.mjs';
import { loadSkus } from './skus.mjs';
// node compare_order_next.mjs <Members.gs> [nobogo]
const skus = loadSkus(process.argv[2]);
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const uids = sql(`select data->>'LINE UID' u from mirror.rows where source='members' and tab='Members' and coalesce(data->>'LINE UID','')<>'' order by row_num`).map((r) => r.u);
const codes = ['', ...sql(`select data->>'โค้ด' c from mirror.rows where source='members' and tab='Coupons' and coalesce(data->>'โค้ด','')<>''`).map((r) => r.c)];
const items = b64(process.argv[3] === 'nobogo' ? [{ name: skus[9][0], qty: 2 }, { name: skus[3][0], qty: 1 }] : [{ name: skus[0][0], qty: 2 }, { name: skus[3][0], qty: 1 }]);
const bodies = [];
uids.forEach((u, i) => { if (i % 3) return; for (const c of codes) bodies.push({ action: 'createShopOrderDryRun', asUid: u, itemsB64: items, paymentMethod: 'transfer', couponCode: c, shippingAddress: 'ที่อยู่ทดสอบ', province: 'กรุงเทพมหานคร', excludePrivilegeName: '', purchaseReferrerCode: '', pointsToRedeem: '0' }); });
let same = 0, diff = 0;
for (let i = 0; i < bodies.length; i += 15) {
  const chunk = bodies.slice(i, i + 15);
  const [L, N] = [await callEdge('shop-order', chunk), await callEdge('shop-order-next', chunk)];
  chunk.forEach((b, j) => {
    const l = JSON.stringify(L[j].body?.result ?? L[j].body), n = JSON.stringify(N[j].body?.result ?? N[j].body);
    const nd = (x) => JSON.stringify(x).replace(/\{"\$date":"[^"]+"\}/g, 'D'); const lj = nd(L[j].body?.journal), nj = nd(N[j].body?.journal);
    if (L[j].status === N[j].status && l === n && lj === nj) same++; else { diff++; if (diff <= 4) console.log('DIFF', b.asUid.slice(0, 6), b.couponCode, '\n live', L[j].status, l.slice(0, 300), '\n next', N[j].status, n.slice(0, 300)); }
  });
  process.stdout.write(`\r${Math.min(i + 15, bodies.length)}/${bodies.length} same=${same} diff=${diff}  `);
}
console.log('\nsame', same, 'diff', diff);
