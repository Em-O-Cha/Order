import { createGas, loadBookFromMirror, loadPropsFromMirror } from './gasmock.mjs';
import { sql } from './sql.mjs';
loadBookFromMirror('15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk', 'members', 'Members'); loadBookFromMirror('1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY', 'revenue', 'Revenue'); loadBookFromMirror('1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w', 'master', 'Master');
loadPropsFromMirror();
// เทียบผล "ตรวจยอดซ้ำก่อนแนบสลิป" ของออเดอร์ล่าสุดระหว่าง Members.gs 2 เวอร์ชัน: node recheck_compare.mjs <เดิม/Members.gs> <ใหม่/Members.gs>
const A = createGas([process.argv[2]]).ctx, B = createGas([process.argv[3]]).ctx;
const orders = sql(`select data->>'Revenue ID' id, data->>'LINE UID' u, left(data->>'Remark',90) rm from mirror.rows where source='revenue' and tab='Revenue' and coalesce(data->>'LINE UID','')<>'' and coalesce(data->>'Revenue ID','')<>'' order by row_num desc limit 120`);
let same = 0;
for (const o of orders) {
  const r = [A, B].map(c => { c.verifyLineIdToken_ = () => ({ sub: o.u }); c.getSlipCheck = null; return JSON.stringify(c.checkPendingOrderPromoStillValid('t', o.id)); });
  if (r[0] === r[1]) { same++; continue; }
  console.log(o.id, '\n  เดิม', r[0], '\n  ใหม่', r[1], '\n  ', o.rm);
}
console.log('same', same, 'of', orders.length);
