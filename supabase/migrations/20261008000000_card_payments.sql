-- ชำระด้วยบัตรเครดิต/เดบิต (K Payment Link กสิกรไทย) — Edge Function card-pay
--
-- orders.card_payments  ลิงก์ชำระเงินต่อออเดอร์ (ยอด = ยอดในชีตตอนขอลิงก์) + ผลที่ถามธนาคารยืนยันแล้ว
--                       ออเดอร์หนึ่งมีได้หลายแถว (ลูกค้าแก้ไขออเดอร์ = ยอดใหม่ ลิงก์ใหม่ แถวเก่าเป็น superseded)
--                       แต่จ่ายจริงยืนยันได้ครั้งเดียว: Apps Script ยืนยันออเดอร์แล้วตั้ง confirmed_at
-- orders.card_events    บันทึกทุกครั้งที่ธนาคารแจ้งผลเข้ามา (ไว้ตรวจย้อนหลัง)
-- ทุกอย่างเรียกได้เฉพาะ service_role (Edge Function) เหมือน orders.requests

create table if not exists orders.card_payments (
  id            uuid        primary key default gen_random_uuid(),
  order_id      text        not null,
  line_uid      text,
  amount        numeric(12, 2) not null check (amount > 0),
  provider      text        not null,          -- kbank / mock
  mode          text        not null default 'live' check (mode in ('live', 'test')),
  link_id       text,                          -- รหัสลิงก์/รายการฝั่งธนาคาร
  pay_url       text,
  status        text        not null default 'pending'
                check (status in ('pending', 'paid', 'failed', 'expired', 'superseded')),
  paid_amount   numeric(12, 2),
  paid_ref      text,                          -- เลขอ้างอิงการชำระจากธนาคาร
  paid_at       timestamptz,
  confirmed_at  timestamptz,                   -- Apps Script ยืนยันออเดอร์ในชีตแล้ว
  expires_at    timestamptz,
  raw           jsonb,                         -- คำตอบล่าสุดของธนาคาร
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists card_payments_order_idx on orders.card_payments (order_id, created_at desc);
create index if not exists card_payments_link_idx on orders.card_payments (provider, link_id);
create index if not exists card_payments_unconfirmed_idx on orders.card_payments (status) where confirmed_at is null;
alter table orders.card_payments enable row level security;

create table if not exists orders.card_events (
  id           bigint      generated always as identity primary key,
  received_at  timestamptz not null default now(),
  provider     text,
  order_id     text,
  payload      jsonb,
  result       text
);
alter table orders.card_events enable row level security;

revoke all on orders.card_payments, orders.card_events from public, anon, authenticated;
grant select, insert, update, delete on orders.card_payments, orders.card_events to service_role;

-- แถวล่าสุดของออเดอร์ (ทุกสถานะ) + ที่อยู่ Web App ของ Apps Script (signup.settings ที่เดียวกับ order_prepare)
create or replace function public.card_pay_get(p_order_id text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'row', (select to_jsonb(c) from orders.card_payments c where c.order_id = p_order_id
             order by (c.status = 'paid') desc, c.created_at desc limit 1),
    'apps_script_url', (select s.value #>> '{}' from signup.settings s where s.key = 'apps_script_url'))
$$;

-- หาแถวจากรหัสลิงก์ของธนาคาร (ตอนธนาคารแจ้งผล)
create or replace function public.card_pay_find(p_provider text, p_link_id text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(c) from orders.card_payments c
   where c.provider = p_provider and c.link_id = p_link_id
   order by c.created_at desc limit 1
$$;

-- เพิ่มลิงก์ใหม่: ลิงก์ที่ยังรอจ่ายของออเดอร์เดียวกันเป็น superseded (ใช้ไม่ได้อีก)
create or replace function public.card_pay_insert(p_row jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r orders.card_payments;
begin
  update orders.card_payments set status = 'superseded', updated_at = now()
   where order_id = p_row->>'order_id' and status = 'pending';
  insert into orders.card_payments (order_id, line_uid, amount, provider, mode, link_id, pay_url, expires_at, raw)
  values (p_row->>'order_id', p_row->>'line_uid', (p_row->>'amount')::numeric, p_row->>'provider',
          coalesce(p_row->>'mode', 'live'), p_row->>'link_id', p_row->>'pay_url',
          nullif(p_row->>'expires_at', '')::timestamptz, p_row->'raw')
  returning * into r;
  return to_jsonb(r);
end
$$;

-- แก้สถานะ/ผลการชำระ (เฉพาะช่องที่ส่งมา) — แถวที่จ่ายแล้วไม่ถอยกลับเป็นสถานะอื่น
create or replace function public.card_pay_update(p_id uuid, p_patch jsonb)
returns jsonb
language sql volatile security definer set search_path = '' as $$
  update orders.card_payments c set
    status       = case when c.status = 'paid' then 'paid' else coalesce(p_patch->>'status', c.status) end,
    paid_amount  = coalesce((p_patch->>'paid_amount')::numeric, c.paid_amount),
    paid_ref     = coalesce(p_patch->>'paid_ref', c.paid_ref),
    paid_at      = coalesce(c.paid_at, nullif(p_patch->>'paid_at', '')::timestamptz),
    confirmed_at = coalesce(c.confirmed_at, nullif(p_patch->>'confirmed_at', '')::timestamptz),
    raw          = coalesce(p_patch->'raw', c.raw),
    updated_at   = now()
  where c.id = p_id
  returning to_jsonb(c)
$$;

-- จ่ายแล้วแต่ Apps Script ยังไม่ยืนยัน (รอบสำรองของ Apps Script)
create or replace function public.card_pay_unconfirmed()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.paid_at), '[]'::jsonb)
    from orders.card_payments c
   where c.status = 'paid' and c.confirmed_at is null and c.paid_at > now() - interval '30 days'
$$;

create or replace function public.card_pay_log(p_provider text, p_order_id text, p_payload jsonb, p_result text)
returns void
language sql volatile security definer set search_path = '' as $$
  insert into orders.card_events (provider, order_id, payload, result) values (p_provider, p_order_id, p_payload, p_result)
$$;

revoke all on function public.card_pay_get(text) from public, anon, authenticated;
revoke all on function public.card_pay_find(text, text) from public, anon, authenticated;
revoke all on function public.card_pay_insert(jsonb) from public, anon, authenticated;
revoke all on function public.card_pay_update(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.card_pay_unconfirmed() from public, anon, authenticated;
revoke all on function public.card_pay_log(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.card_pay_get(text) to service_role;
grant execute on function public.card_pay_find(text, text) to service_role;
grant execute on function public.card_pay_insert(jsonb) to service_role;
grant execute on function public.card_pay_update(uuid, jsonb) to service_role;
grant execute on function public.card_pay_unconfirmed() to service_role;
grant execute on function public.card_pay_log(text, text, jsonb, text) to service_role;
