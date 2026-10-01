import { sql } from './sql.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = sql(`select data->>'LINE UID' u from mirror.rows where source='members' and tab='Members' and coalesce(data->>'LINE UID','')<>'' order by row_num limit 1`)[0].u;
sql('create extension if not exists pg_net'); await sleep(1500);
try {
  for (const body of [{ action: 'health' }, { action: 'registerMemberDryRun', asUid: uid, phoneNumber: '0800000000', fullName: 'ทดสอบ' }]) {
    const [{ id }] = sql(`select net.http_post(url := 'https://qotlepudmkuniyjvqmle.supabase.co/functions/v1/member-signup?forceFunctionRegion=ap-northeast-2',
      body := '${JSON.stringify(body)}'::jsonb,
      headers := jsonb_build_object('content-type','application/json','x-internal-key',(select value from mirror.secrets where name='internal_key'))) id`);
    let r; for (let w = 0; w < 60 && !r; w++) { await sleep(500); r = sql(`select status_code, headers->>'x-sb-edge-region' reg, left(content::text, 400) c from net._http_response where id=${id}`)[0]; }
    console.log(body.action, r);
  }
} finally { sql('drop extension if exists pg_net'); }
