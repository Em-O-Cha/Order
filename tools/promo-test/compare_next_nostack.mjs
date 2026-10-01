// เทียบ shop-read (ที่ลูกค้าใช้) กับ shop-read-next ทุกสมาชิก ผ่าน pg_net ชั่วคราว (ยิงเป็นชุดเล็ก)
// node compare_next.mjs [batchPairs=10]
import { sql, lit } from './sql.mjs';
const BATCH = Number(process.argv[2] || 10);
const BASE = 'https://qotlepudmkuniyjvqmle.supabase.co/functions/v1/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const uids = sql(`select data->>'LINE UID' u from mirror.rows where source='members' and tab='Members'
                  and coalesce(data->>'LINE UID','')<>'' order by row_num`).map((r) => r.u);
uids.push('U_not_member_test');
const acts = ['checkMemberStatus', 'getShopBootstrap', 'getPrivilegesPanelData', 'getMyPrivileges',
  'getPointsHistory', 'getMyShippingAddress', 'getMyOrderHistory'];
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const cases = [];
for (const u of uids) for (const a of acts) cases.push(`action=${a}&asUid=${encodeURIComponent(u)}`);
for (const a of ['getTierConfig', 'getActiveCoupons', 'getReferralPublicStatus']) cases.push(`action=${a}`);
// ส่วนลดตะกร้าตัวอย่าง (สมาชิกทุก 5 คน)
const items = b64([{ name: 'ก๋วยเตี๋ยวเรือ จำนวน 12 ซอง', qty: 2 }, { name: 'ก๋วยเตี๋ยวเรือ ยกลัง จำนวน 24 ซอง', qty: 1 }]);
uids.forEach((u, i) => {
  cases.push(`action=checkShopDiscounts&asUid=${encodeURIComponent(u)}&couponCode=&subtotal=1670&itemsB64=${encodeURIComponent(items)}&excludePrivilegeName=&pointsToRedeem=0`);
});

// คูปองที่กรอกเอง (ทุกโค้ด) สมาชิกทุก 4 คน + ส่งเลขออเดอร์เดิมมาด้วย
const codes = sql(`select data->>'โค้ด' c from mirror.rows where source='members' and tab='Coupons' and coalesce(data->>'โค้ด','')<>''`).map((r) => r.c);
uids.forEach((u, i) => { if (i % 4) return; for (const c of codes) {
  cases.push(`action=checkShopDiscounts&asUid=${encodeURIComponent(u)}&couponCode=${encodeURIComponent(c)}&subtotal=1670&itemsB64=${encodeURIComponent(items)}&excludePrivilegeName=&pointsToRedeem=0`);
  cases.push(`action=checkShopDiscounts&asUid=${encodeURIComponent(u)}&couponCode=${encodeURIComponent(c)}&subtotal=1670&itemsB64=${encodeURIComponent(items)}&excludePrivilegeName=&pointsToRedeem=0&existingOrderId=REV6909141`);
} });
// ตรวจโปรของออเดอร์ที่ค้างอยู่ (ออเดอร์จริงล่าสุด 30 รายการ ตามเจ้าของ) — ทางนี้มักต้องรันใหม่ด้วยทุกแท็บ
for (const r of sql(`select data->>'Revenue ID' id, data->>'LINE UID' u from mirror.rows where source='revenue' and tab='Revenue'
                      and coalesce(data->>'LINE UID','')<>'' and coalesce(data->>'Revenue ID','')<>'' order by row_num desc limit 30`))
{
  cases.push(`action=checkPendingOrderPromoStillValid&asUid=${encodeURIComponent(r.u)}&orderId=${encodeURIComponent(r.id)}`);
  cases.push(`action=checkPendingOrderPromoStillValid&asUid=${encodeURIComponent(uids[0])}&orderId=${encodeURIComponent(r.id)}`);
}
sql('create extension if not exists pg_net');
await sleep(1500);
let same = 0, diff = 0, failed = 0;
const timings = { live: [], next: [] };
const sources = { live: {}, next: {} };
try {
  for (let i = 0; i < cases.length; i += BATCH) {
    const chunk = cases.slice(i, i + BATCH);
    const vals = chunk.map((body, j) => `(${j}, ${lit(Object.fromEntries(new URLSearchParams(body)))}::jsonb)`).join(',');
    const ids = sql(`with k as (select value as key from mirror.secrets where name = 'internal_key' limit 1),
      c(j, body) as (values ${vals})
      select c.j, f.fn, net.http_post(url := '${BASE}' || f.fn || '?forceFunctionRegion=ap-northeast-2', body := c.body,
             headers := jsonb_build_object('content-type','application/json','x-internal-key',(select key from k)),
             timeout_milliseconds := 30000) as id
        from c cross join (values ('shop-read'),('shop-read-next')) f(fn)`);
    let rows = [];
    for (let w = 0; w < 60; w++) {
      await sleep(1000);
      rows = sql(`select id, status_code, content::text as content, headers, error_msg, timed_out
                    from net._http_response where id = any(array[${ids.map((r) => r.id).join(',')}]::bigint[])`);
      if (rows.length === ids.length) break;
    }
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    for (let j = 0; j < chunk.length; j++) {
      const L = byId.get(String(ids.find((r) => r.j === j && r.fn === 'shop-read').id));
      const N = byId.get(String(ids.find((r) => r.j === j && r.fn === 'shop-read-next').id));
      if (!L || !N || L.status_code !== 200 || N.status_code !== 200) {
        failed++; console.log('FAIL', chunk[j].slice(0, 60), L?.status_code, L?.error_msg, N?.status_code, N?.error_msg); continue;
      }
      const sl = L.headers['x-source'], sn = N.headers['x-source'];
      sources.live[sl] = (sources.live[sl] || 0) + 1; sources.next[sn] = (sources.next[sn] || 0) + 1;
      if (N.headers['x-timings']) timings.next.push(N.headers['x-timings']);
      const ns_ = (t) => { try { return JSON.stringify(JSON.parse(t), (k, v) => ((k === "stackable" && v === false) || (k === "restriction" && v === "") || (k === "exclusive" && v === false) ? undefined : v)); } catch (e) { return t; } };
      if (ns_(L.content) === ns_(N.content) && sl === sn) same++;
      else { diff++; if (diff <= 5) console.log('DIFF', chunk[j].slice(0, 70), '\n  live', sl, L.content.slice(0, 300), '\n  next', sn, N.content.slice(0, 300)); }
    }
    process.stdout.write(`\r${Math.min(i + BATCH, cases.length)}/${cases.length} same=${same} diff=${diff} fail=${failed}   `);
    await sleep(500);
  }
} finally {
  sql('drop extension if exists pg_net');
}
console.log('\ncases', cases.length, 'same', same, 'diff', diff, 'fail', failed);
console.log('sources', JSON.stringify(sources));
const parse = (s) => Object.fromEntries(s.split(',').map((kv) => kv.split('=')).map(([k, v]) => [k, Number(v)]));
const tt = timings.next.map(parse);
console.log('reruns with all tabs', tt.filter((x) => x.full !== undefined).length, 'of', tt.length);
for (const k of ['load', 'fetch', 'run', 'total']) {
  const v = tt.map((x) => x[k]).filter((x) => x >= 0).sort((a, b) => a - b);
  if (v.length) console.log(k, 'median', v[v.length >> 1], 'p90', v[Math.floor(v.length * 0.9)], 'max', v[v.length - 1]);
}
