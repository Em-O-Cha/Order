-- เฟส 3 ขั้น 4 "ย้ายการสั่งซื้อ": Supabase รับคำสั่งซื้อและตอบยอดชำระทันที แล้วให้ Apps Script รัน
-- createShopOrder ตัวเดิมบนชีตจริงตามหลัง (ออกเลข REV ตัดสิทธิ์ นับคูปอง แจ้งเตือน เหมือนเดิมทุกอย่าง)
--
-- orders.requests  คำสั่งซื้อที่ Supabase รับแล้ว: พารามิเตอร์เดิมของ createShopOrder (ไม่เก็บโทเคน LINE),
--                  ผลที่ทำนายไว้ (ตอบลูกค้าทันที), การเขียนชีตที่ทำนายไว้ (ให้คำสั่งซื้อถัดไปนับรวม),
--                  ผลจริง + เลข REV จาก Apps Script
-- orders.settings  สวิตช์เปิดใช้งาน (live) และแท็บที่ถ้าสำเนายังไม่ทันต้องถอยไปสั่งซื้อทาง Apps Script
-- ทุกอย่างเรียกได้เฉพาะ service_role

create schema if not exists orders;
revoke all on schema orders from public, anon, authenticated;
grant usage on schema orders to service_role;

create table if not exists orders.requests (
  id          uuid        primary key default gen_random_uuid(),
  seq         bigint      generated always as identity,  -- ลำดับรับคำสั่งซื้อ (แทน ScriptLock: คำนวณตามลำดับนี้)
  client_key  text        not null,   -- รหัสสุ่มของการกดยืนยันครั้งนั้นจากหน้าเว็บ (กดซ้ำ/เน็ตหลุดแล้วส่งใหม่ = ออเดอร์เดิม)
  line_uid    text        not null,
  status      text        not null default 'pending_sheet'
              check (status in ('pending_sheet', 'written', 'failed', 'cancelled')),
  is_test     boolean     not null default false,
  request     jsonb       not null,   -- พารามิเตอร์ createShopOrder + ชื่อจาก LINE (ไม่เก็บโทเคน)
  predicted   jsonb       not null,   -- ผลที่ Supabase คำนวณ (ส่งให้ลูกค้าทันที ยกเว้นเลข REV)
  journal     jsonb       not null,   -- การเขียนชีตที่ทำนายไว้ (ดู gas_runtime.js)
  base_rows   jsonb       not null,   -- แถวสุดท้ายของแต่ละแท็บที่ journal อ้างอิง
  result      jsonb,                  -- ผลจริงของ createShopOrder บนชีต
  revenue_id  text,
  changed     boolean,                -- ยอดจริงต่างจากที่แสดงให้ลูกค้า
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  written_at  timestamptz,
  attempts    int         not null default 0,
  last_error  text
);
create unique index if not exists requests_client_key on orders.requests (client_key) where status <> 'cancelled';
create index if not exists requests_status_idx on orders.requests (status, is_test, seq);
alter table orders.requests enable row level security;

create table if not exists orders.settings (
  key   text  primary key,
  value jsonb not null
);
alter table orders.settings enable row level security;
insert into orders.settings (key, value) values
  -- ปิดไว้: หน้าเว็บจะได้คำตอบให้สั่งซื้อทาง Apps Script ทุกครั้ง (ชุดทดสอบภายในยังสั่งได้)
  ('live', 'false'),
  -- แท็บที่ createShopOrder อ่าน: ถ้ามีธงข้อมูลเปลี่ยน (สำเนายังไม่ทัน) ต้องถอยไปสั่งซื้อทาง Apps Script
  ('block_dirty_keys', '["members/Members", "members/Member_Privileges", "members/Coupons", "members/Tier_Config",
                         "members/Points_Promos", "members/Shipping_Config", "revenue/Revenue", "master/SKU",
                         "props/script"]')
on conflict (key) do nothing;

revoke all on all tables in schema orders from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema orders to service_role;

-- คำสั่งซื้อที่รับแล้วแต่ Apps Script ยังไม่เขียนลงชีต (ต้องเล่นทับก่อนคำนวณคำสั่งซื้อถัดไป) ตามลำดับรับ
-- หลังเขียนชีต ตัวเขียนตั้งธงข้อมูลเปลี่ยนก่อนเปลี่ยนสถานะ จึงไม่มีช่วงที่คำสั่งซื้อหายไปจากทั้งสองทาง
-- ชุดทดสอบ: แถวทดสอบที่เขียนแล้วอยู่แค่ในไฟล์ชีตชั่วคราว (ไม่มีวันเข้าสำเนา) จึงเล่นทับต่อไปด้วย
create or replace function orders.pending_rows(p_include_tests boolean)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'seq', q.seq, 'line_uid', q.line_uid, 'journal', q.journal, 'base_rows', q.base_rows)
           order by q.seq), '[]'::jsonb)
    from orders.requests q
   where (q.status = 'pending_sheet' and (not q.is_test or p_include_tests))
      or (q.status = 'written' and q.is_test and p_include_tests)
$$;

-- แท็บใน block_dirty_keys ที่สำเนายังไม่ทัน
create or replace function orders.blocked_keys()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(k), '[]'::jsonb)
    from orders.settings s, jsonb_array_elements_text(s.value) as k
   where s.key = 'block_dirty_keys'
     and exists (
       select 1
         from mirror.dirty d
         join mirror.tabs t on t.source = split_part(k, '/', 1)
                           and t.tab = split_part(substr(k, strpos(k, '/') + 1), '#', 1)
        where d.source = split_part(k, '/', 1)
          and d.tab = substr(k, strpos(k, '/') + 1)
          and d.dirty_at > t.read_at)
$$;

-- ---------------------------------------------------------------------------
-- order_prepare: ทุกอย่างที่ shop-order ต้องใช้ในคำขอเดียว
--   load      = mirror_load(p_tab_keys, p_cached, p_owner) (สำเนาแท็บ + แถว Revenue ของลูกค้า)
--   pending   = คำสั่งซื้อที่ยังไม่ลงชีต, last_seq = ลำดับล่าสุดที่เห็น (ใช้ตอนบันทึก กันคำนวณซ้อนกัน)
--   blocked, settings (+ apps_script_url ร่วมกับการสมัคร)
-- ---------------------------------------------------------------------------
create or replace function public.order_prepare(p_tab_keys text[], p_cached jsonb, p_owner jsonb,
                                                p_include_tests boolean default false)
returns json
language plpgsql volatile security definer set search_path = '' as $$
begin
  return ('{"load":' || public.mirror_load(p_tab_keys, p_cached, p_owner)::text ||
          ',"pending":' || orders.pending_rows(p_include_tests)::text ||
          ',"last_seq":' || coalesce((select max(seq) from orders.requests where is_test = p_include_tests), 0)::text ||
          ',"blocked":' || orders.blocked_keys()::text ||
          ',"settings":' || (coalesce((select jsonb_object_agg(s.key, s.value) from orders.settings s), '{}'::jsonb)
                            || jsonb_build_object('apps_script_url',
                                 coalesce((select value from signup.settings where key = 'apps_script_url'), '""'::jsonb)))::text ||
          '}')::json;
end $$;

-- ---------------------------------------------------------------------------
-- order_insert: บันทึกคำสั่งซื้อ ถ้ามีคำสั่งซื้ออื่นเข้ามาหลังจากที่คำนวณ (seq > p_last_seq) ให้คำนวณใหม่
-- (แทน ScriptLock ของ createShopOrder: ทุกคำสั่งซื้อคำนวณโดยเห็นคำสั่งซื้อก่อนหน้าครบ)
-- คืน { ok, id, seq } | { ok:false, conflict:'stale' } | { ok:false, conflict:'duplicate', id }
-- ---------------------------------------------------------------------------
create or replace function public.order_insert(p_row jsonb, p_last_seq bigint)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_test boolean := coalesce((p_row ->> 'is_test')::boolean, false);
  v_id uuid;
  v_seq bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('orders_insert:' || v_test::text, 0));
  select id into v_id from orders.requests where client_key = p_row ->> 'client_key' and status <> 'cancelled';
  if found then return jsonb_build_object('ok', false, 'conflict', 'duplicate', 'id', v_id); end if;
  if exists (select 1 from orders.requests where is_test = v_test and seq > coalesce(p_last_seq, 0)) then
    return jsonb_build_object('ok', false, 'conflict', 'stale');
  end if;
  insert into orders.requests (client_key, line_uid, is_test, request, predicted, journal, base_rows)
  values (p_row ->> 'client_key', p_row ->> 'line_uid', v_test, p_row -> 'request', p_row -> 'predicted',
          p_row -> 'journal', p_row -> 'base_rows')
  returning id, seq into v_id, v_seq;
  return jsonb_build_object('ok', true, 'id', v_id, 'seq', v_seq);
end $$;

-- หน้าเว็บถามสถานะด้วยรหัสคำสั่งซื้อ หรือรหัสการกดจากหน้าเว็บ (ทั้งคู่เป็น uuid สุ่ม รู้เฉพาะคนที่สั่ง)
-- ใช้ client_key ตอนเน็ตหลุดระหว่างรอคำตอบ: รู้ได้ว่า Supabase รับไปแล้วหรือยัง (กันสั่งซ้ำทางเดิม)
create or replace function public.order_status(p_id uuid, p_client_key text default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', q.id, 'status', q.status, 'revenue_id', q.revenue_id, 'result', q.result,
                            'predicted', q.predicted, 'changed', q.changed, 'error', q.last_error,
                            'line_uid', q.line_uid, 'is_test', q.is_test)
    from orders.requests q
   where (p_id is not null and q.id = p_id)
      or (p_id is null and p_client_key is not null and q.client_key = p_client_key and q.status <> 'cancelled')
   limit 1
$$;

-- ตัวเขียน: รับงานที่ยังไม่เสร็จตามลำดับรับ (จองไว้ 2 นาที) — p_tests = true รับเฉพาะแถวทดสอบ
-- ต้องเขียนตามลำดับเสมอ (คำสั่งซื้อหลังคำนวณโดยถือว่าคำสั่งซื้อก่อนหน้าลงชีตแล้ว) จึงไม่ข้ามงานที่ตัวเขียนอื่น
-- จองอยู่: รับเฉพาะงานก่อนหน้างานแรกที่ถูกจอง
create or replace function public.order_claim(p_tests boolean, p_limit int)
returns jsonb
language sql volatile security definer set search_path = '' as $$
  with blocker as (
    select min(seq) as s from orders.requests
     where status = 'pending_sheet' and is_test = p_tests and attempts < 20
       and claimed_at is not null and claimed_at >= now() - interval '2 minutes'
  ),
  c as (
    update orders.requests q
       set claimed_at = now(), attempts = q.attempts + 1
     where q.id in (select r.id from orders.requests r, blocker b
                     where r.status = 'pending_sheet' and r.is_test = p_tests and r.attempts < 20
                       and (b.s is null or r.seq < b.s)
                     order by r.seq
                     limit greatest(p_limit, 1)
                     for update of r skip locked)
    returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'seq', c.seq, 'line_uid', c.line_uid, 'request', c.request, 'predicted', c.predicted,
           'attempts', c.attempts, 'created_at', c.created_at) order by c.seq), '[]'::jsonb)
    from c
$$;

-- ตัวเขียน: รายงานผล — p_patch รับได้แค่ช่องเหล่านี้
--   status ('written' | 'failed' | 'pending_sheet'), revenue_id, result, changed, last_error, release (ปล่อยจอง)
create or replace function public.order_update(p_id uuid, p_patch jsonb)
returns void
language sql volatile security definer set search_path = '' as $$
  update orders.requests q set
    status = case when p_patch ->> 'status' in ('written', 'failed', 'pending_sheet', 'cancelled')
                  then p_patch ->> 'status' else q.status end,
    written_at = case when p_patch ->> 'status' = 'written' then coalesce(q.written_at, now()) else q.written_at end,
    revenue_id = coalesce(p_patch ->> 'revenue_id', q.revenue_id),
    result = coalesce(p_patch -> 'result', q.result),
    changed = coalesce((p_patch ->> 'changed')::boolean, q.changed),
    last_error = case when p_patch ? 'last_error' then p_patch ->> 'last_error' else q.last_error end,
    claimed_at = case when (p_patch ->> 'release')::boolean then null else q.claimed_at end
  where q.id = p_id
$$;

-- ล้างแถวทดสอบ (ชุดทดสอบเรียกเมื่อเริ่ม/จบ)
create or replace function public.order_delete_tests()
returns int
language sql volatile security definer set search_path = '' as $$
  with d as (delete from orders.requests where is_test returning 1) select count(*)::int from d
$$;

revoke all on function orders.pending_rows(boolean) from public, anon, authenticated;
revoke all on function orders.blocked_keys() from public, anon, authenticated;
revoke all on function public.order_prepare(text[], jsonb, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.order_insert(jsonb, bigint) from public, anon, authenticated;
revoke all on function public.order_status(uuid, text) from public, anon, authenticated;
revoke all on function public.order_claim(boolean, int) from public, anon, authenticated;
revoke all on function public.order_update(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.order_delete_tests() from public, anon, authenticated;
grant execute on function orders.pending_rows(boolean) to service_role;
grant execute on function orders.blocked_keys() to service_role;
grant execute on function public.order_prepare(text[], jsonb, jsonb, boolean) to service_role;
grant execute on function public.order_insert(jsonb, bigint) to service_role;
grant execute on function public.order_status(uuid, text) to service_role;
grant execute on function public.order_claim(boolean, int) to service_role;
grant execute on function public.order_update(uuid, jsonb) to service_role;
grant execute on function public.order_delete_tests() to service_role;
