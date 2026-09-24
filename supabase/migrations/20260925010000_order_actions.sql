-- เฟส 3 ขั้น 5: แนบสลิป / ยกเลิกออเดอร์ผ่าน Supabase — ใช้คิวเดียวกับคำสั่งซื้อ (orders.requests)
-- ลำดับเดียวกันทั้งหมด: คำสั่งซื้อ -> แนบสลิป/ยกเลิก ถูกคำนวณและเขียนลงชีตตามลำดับรับเสมอ
--   kind      'order' | 'slip' | 'cancel'
--   order_id  เลข REV ของออเดอร์ที่แนบสลิป/ยกเลิก
--   payload   รูปสลิป (base64) — ลบทิ้งทันทีหลังเขียนชีตเสร็จ/ล้มเหลว
-- สวิตช์แยก actions_live (แนบสลิป/ยกเลิก) จาก live (สั่งซื้อ)

alter table orders.requests add column if not exists kind text not null default 'order'
  check (kind in ('order', 'slip', 'cancel'));
alter table orders.requests add column if not exists order_id text;
alter table orders.requests add column if not exists payload text;
-- แนบสลิปจากลิงก์ในไลน์ไม่มีโทเคน LINE (ทางเดิมก็ไม่ต้องใช้) — line_uid ว่างได้
alter table orders.requests alter column line_uid drop not null;

insert into orders.settings (key, value) values ('actions_live', 'false') on conflict (key) do nothing;

-- บันทึก (เพิ่ม kind / order_id / payload)
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
  insert into orders.requests (client_key, line_uid, is_test, kind, order_id, payload, request, predicted, journal, base_rows)
  values (p_row ->> 'client_key', nullif(p_row ->> 'line_uid', ''), v_test, coalesce(p_row ->> 'kind', 'order'),
          nullif(p_row ->> 'order_id', ''), p_row ->> 'payload', p_row -> 'request', p_row -> 'predicted',
          p_row -> 'journal', p_row -> 'base_rows')
  returning id, seq into v_id, v_seq;
  return jsonb_build_object('ok', true, 'id', v_id, 'seq', v_seq);
end $$;

create or replace function public.order_status(p_id uuid, p_client_key text default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', q.id, 'kind', q.kind, 'order_id', q.order_id, 'status', q.status,
                            'revenue_id', q.revenue_id, 'result', q.result, 'predicted', q.predicted,
                            'changed', q.changed, 'error', q.last_error, 'line_uid', q.line_uid, 'is_test', q.is_test)
    from orders.requests q
   where (p_id is not null and q.id = p_id)
      or (p_id is null and p_client_key is not null and q.client_key = p_client_key and q.status <> 'cancelled')
   limit 1
$$;

-- ตัวเขียน: รับงานตามลำดับ (+ kind / order_id / payload) — ไม่ข้ามงานที่ตัวเขียนอื่นจองอยู่
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
           'id', c.id, 'seq', c.seq, 'kind', c.kind, 'order_id', c.order_id, 'line_uid', c.line_uid,
           'request', c.request, 'predicted', c.predicted, 'payload', c.payload,
           'attempts', c.attempts, 'created_at', c.created_at) order by c.seq), '[]'::jsonb)
    from c
$$;

-- ตัวเขียน: รายงานผล — รูปสลิปถูกลบทิ้งเมื่อเสร็จ (written/failed)
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
    claimed_at = case when (p_patch ->> 'release')::boolean then null else q.claimed_at end,
    payload = case when p_patch ->> 'status' in ('written', 'failed') then null else q.payload end
  where q.id = p_id
$$;
