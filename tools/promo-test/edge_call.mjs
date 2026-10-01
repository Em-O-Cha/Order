// เรียก Edge Function ผ่าน pg_net ชั่วคราว: callEdge(fn, [bodies]) -> [{status, headers, body}]
import { sql, lit } from './sql.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function callEdge(fn, bodies, { internal = true } = {}) {
  sql('create extension if not exists pg_net'); await sleep(1500);
  try {
    const vals = bodies.map((b, j) => `(${j}, ${lit(b)}::jsonb)`).join(',');
    const hdr = internal ? `jsonb_build_object('content-type','application/json','x-internal-key',(select value from mirror.secrets where name='internal_key'))` : `'{"content-type":"application/json"}'::jsonb`;
    const ids = sql(`select c.j, net.http_post(url := 'https://qotlepudmkuniyjvqmle.supabase.co/functions/v1/${fn}?forceFunctionRegion=ap-northeast-2', body := c.b, headers := ${hdr}, timeout_milliseconds := 60000) id from (values ${vals}) c(j, b)`);
    let rows = [];
    for (let w = 0; w < 120; w++) { await sleep(700); rows = sql(`select id, status_code, content::text c, error_msg from net._http_response where id = any(array[${ids.map((r) => r.id).join(',')}]::bigint[])`); if (rows.length === ids.length) break; }
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    return ids.sort((a, b) => a.j - b.j).map((x) => { const r = byId.get(String(x.id)); let body = null; try { body = JSON.parse(r.c); } catch { body = r?.c || r?.error_msg; } return { status: r?.status_code, body }; });
  } finally { sql('drop extension if exists pg_net'); }
}
