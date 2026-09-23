-- เฟส 3 ขั้น 3.2b: Apps Script เขียนการสมัครที่ Supabase รับแล้วลงชีต + ความปลอดภัยของทางเดิม
--
-- 1. แถวทดสอบ (is_test) แยกจากของจริงทั้งหมด: ดัชนีไม่ซ้ำแยกกัน และไม่ถูกนับรวมตอนออกรหัส/เช็คซ้ำของจริง
-- 2. สถานะการเขียน: sheet_written_at (เขียนแถวลงชีตแล้ว) -> deferred_done_at (ส่งข้อความ/ให้รางวัลแล้ว) -> written
-- 3. signup_claim / signup_update: ตัวเขียนใน Apps Script รับงานและรายงานผล (มีระยะจอง กันสองตัวทำซ้ำ)
-- 4. signup_pending_identity: ทางเดิม (Apps Script) ใช้เช็คซ้ำ/ออกรหัสให้นับรวมการสมัครที่ยังไม่ลงชีต
-- 5. signup_prepare คืนรายการแท็บที่ "สำเนายังไม่ทัน" เอง รองรับธงระดับย่อย เช่น members/Members#identity
--    (ธงที่ตั้งเฉพาะตอนข้อมูลตัวตนสมาชิกเปลี่ยน — ถือว่าไม่ทันถ้าตั้งหลังการอ่านแท็บ members/Members ล่าสุด)

alter table signup.requests add column if not exists sheet_written_at timestamptz;
alter table signup.requests add column if not exists deferred_done_at timestamptz;
alter table signup.requests add column if not exists claimed_at timestamptz;
alter table signup.requests add column if not exists renumbered_from text;

drop index if exists signup.requests_line_uid_key;
drop index if exists signup.requests_phone_key;
drop index if exists signup.requests_member_code_key;
create unique index if not exists requests_line_uid_key on signup.requests (line_uid) where status <> 'cancelled' and not is_test;
create unique index if not exists requests_phone_key on signup.requests (phone) where status <> 'cancelled' and not is_test;
create unique index if not exists requests_member_code_key on signup.requests (member_code) where status <> 'cancelled' and not is_test;
create unique index if not exists requests_test_line_uid_key on signup.requests (line_uid) where status <> 'cancelled' and is_test;
create unique index if not exists requests_test_phone_key on signup.requests (phone) where status <> 'cancelled' and is_test;
create unique index if not exists requests_test_member_code_key on signup.requests (member_code) where status <> 'cancelled' and is_test;

-- URL ของ Web App "Members LINE" (/exec) ที่ Supabase ปลุกให้เขียนชีตทันทีหลังรับการสมัคร (ว่าง = ไม่ปลุก
-- รอรอบสำรองของ Apps Script)
insert into signup.settings (key, value) values ('apps_script_url', '""') on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- การสมัครที่ยังไม่อยู่ในสำเนา (ต้องเล่นทับก่อนรัน registerMember)
-- ---------------------------------------------------------------------------
create or replace function signup.pending_rows(p_include_tests boolean)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'line_uid', q.line_uid, 'phone', q.phone, 'member_code', q.member_code, 'is_test', q.is_test,
           'journal', q.journal, 'base_rows', q.base_rows) order by q.created_at), '[]'::jsonb)
    from signup.requests q
   where q.status in ('pending_sheet', 'written')
     and (not q.is_test or p_include_tests)
     and q.created_at > now() - interval '7 days'
     and not exists (select 1 from mirror.rows r
                      where r.source = 'members' and r.tab = 'Members' and r.data ->> 'LINE UID' = q.line_uid)
$$;

-- แท็บที่สำเนายังไม่ทันตาม block_dirty_keys ('source/tab' หรือ 'source/tab#ย่อย')
create or replace function signup.blocked_keys()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(k), '[]'::jsonb)
    from signup.settings s, jsonb_array_elements_text(s.value) as k
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

drop function if exists public.signup_prepare(text[], text[], jsonb);
create or replace function public.signup_prepare(p_tab_keys text[], p_meta_only text[], p_cached jsonb,
                                                 p_include_tests boolean default false)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with v as (
    select t.source || '/' || t.tab as key, t.source, t.tab, t.spreadsheet_id, t.read_at, t.raw_headers, t.headers,
           coalesce(d.dirty_at > t.read_at, false) as dirty
      from mirror.tabs t
      left join mirror.dirty d on d.source = t.source and d.tab = t.tab
     where t.source || '/' || t.tab = any (p_tab_keys)
  )
  select jsonb_build_object(
    'versions', coalesce((select jsonb_object_agg(v.key, jsonb_build_object('read_at', v.read_at, 'dirty', v.dirty)) from v), '{}'::jsonb),
    'tabs', coalesce((
      select jsonb_object_agg(v.key, jsonb_build_object(
               'spreadsheet_id', v.spreadsheet_id,
               'raw_headers',    v.raw_headers,
               'headers',        to_jsonb(v.headers),
               'read_at',        v.read_at,
               'meta_only',      v.key = any (p_meta_only),
               'last_row',       (select max(r.row_num) from mirror.rows r where r.source = v.source and r.tab = v.tab),
               'rows', case when v.key = any (p_meta_only) then '[]'::jsonb else
                         coalesce((select jsonb_agg(jsonb_build_array(r.row_num, r.data) order by r.row_num)
                                     from mirror.rows r where r.source = v.source and r.tab = v.tab), '[]'::jsonb) end))
        from v
       where (p_cached ->> v.key) is distinct from to_jsonb(v.read_at) #>> '{}'), '{}'::jsonb),
    'pending', signup.pending_rows(p_include_tests),
    'blocked', signup.blocked_keys(),
    'settings', coalesce((select jsonb_object_agg(s.key, s.value) from signup.settings s), '{}'::jsonb)
  )
$$;

-- shop-read: การสมัครที่ยังไม่อยู่ในสำเนาของ LINE UID นี้ (ให้หน้าสมาชิกเห็นบัตรทันทีหลังสมัคร)
create or replace function public.signup_pending_for(p_line_uid text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(p) filter (where p ->> 'line_uid' = p_line_uid), '[]'::jsonb)
    from jsonb_array_elements(signup.pending_rows(false)) as p
$$;

-- ทางเดิม (Apps Script registerMember / สร้างสมาชิกจากออเดอร์): การสมัครที่รับแล้วแต่ยังไม่ลงชีต
create or replace function public.signup_pending_identity()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('line_uid', q.line_uid, 'phone', q.phone, 'member_code', q.member_code)), '[]'::jsonb)
    from signup.requests q
   where q.status = 'pending_sheet' and q.sheet_written_at is null and not q.is_test
$$;

-- ตัวเขียน: รับงานที่ยังไม่เสร็จ (จองไว้ 2 นาที) — p_tests = true รับเฉพาะแถวทดสอบ, false เฉพาะของจริง
create or replace function public.signup_claim(p_tests boolean, p_limit int)
returns jsonb
language sql volatile security definer set search_path = '' as $$
  with c as (
    update signup.requests q
       set claimed_at = now(), attempts = q.attempts + 1
     where q.id in (select id from signup.requests
                     where status = 'pending_sheet' and is_test = p_tests and attempts < 20
                       and (claimed_at is null or claimed_at < now() - interval '2 minutes')
                     order by created_at
                     limit greatest(p_limit, 1)
                     for update skip locked)
    returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'line_uid', c.line_uid, 'phone', c.phone, 'member_code', c.member_code,
           'request', c.request, 'result', c.result, 'journal', c.journal, 'deferred', c.deferred,
           'base_rows', c.base_rows, 'sheet_written_at', c.sheet_written_at, 'attempts', c.attempts,
           'created_at', c.created_at) order by c.created_at), '[]'::jsonb)
    from c
$$;

-- ตัวเขียน: รายงานผล — p_patch รับได้แค่ช่องเหล่านี้
--   sheet_written (true = ตอนนี้), deferred_done (true = ตอนนี้ และ status = written), status ('failed'),
--   member_code + result + deferred + journal (กรณีต้องเปลี่ยนรหัสเพราะชนกับทางเดิม — journal ต้องเปลี่ยนด้วย
--   ไม่งั้นการสมัครถัดไปที่เล่น journal ทับจะเห็นรหัสเก่าแล้วออกรหัสชนกับรหัสใหม่), renumbered_from, last_error
create or replace function public.signup_update(p_id uuid, p_patch jsonb)
returns void
language sql volatile security definer set search_path = '' as $$
  update signup.requests q set
    sheet_written_at = case when (p_patch ->> 'sheet_written')::boolean then coalesce(q.sheet_written_at, now()) else q.sheet_written_at end,
    deferred_done_at = case when (p_patch ->> 'deferred_done')::boolean then coalesce(q.deferred_done_at, now()) else q.deferred_done_at end,
    status = case when (p_patch ->> 'deferred_done')::boolean then 'written'
                  when p_patch ? 'status' and p_patch ->> 'status' in ('failed', 'cancelled', 'pending_sheet') then p_patch ->> 'status'
                  else q.status end,
    member_code = coalesce(p_patch ->> 'member_code', q.member_code),
    result = coalesce(p_patch -> 'result', q.result),
    deferred = coalesce(p_patch -> 'deferred', q.deferred),
    journal = coalesce(p_patch -> 'journal', q.journal),
    renumbered_from = coalesce(p_patch ->> 'renumbered_from', q.renumbered_from),
    last_error = case when p_patch ? 'last_error' then p_patch ->> 'last_error' else q.last_error end,
    claimed_at = case when (p_patch ->> 'release')::boolean then null else q.claimed_at end
  where q.id = p_id
$$;

-- ล้างแถวทดสอบ (ชุดทดสอบเรียกเมื่อจบ)
create or replace function public.signup_delete_tests()
returns int
language sql volatile security definer set search_path = '' as $$
  with d as (delete from signup.requests where is_test returning 1) select count(*)::int from d
$$;

revoke all on function signup.pending_rows(boolean) from public, anon, authenticated;
revoke all on function signup.blocked_keys() from public, anon, authenticated;
revoke all on function public.signup_prepare(text[], text[], jsonb, boolean) from public, anon, authenticated;
revoke all on function public.signup_pending_for(text) from public, anon, authenticated;
revoke all on function public.signup_pending_identity() from public, anon, authenticated;
revoke all on function public.signup_claim(boolean, int) from public, anon, authenticated;
revoke all on function public.signup_update(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.signup_delete_tests() from public, anon, authenticated;
grant execute on function signup.pending_rows(boolean) to service_role;
grant execute on function signup.blocked_keys() to service_role;
grant execute on function public.signup_prepare(text[], text[], jsonb, boolean) to service_role;
grant execute on function public.signup_pending_for(text) to service_role;
grant execute on function public.signup_pending_identity() to service_role;
grant execute on function public.signup_claim(boolean, int) to service_role;
grant execute on function public.signup_update(uuid, jsonb) to service_role;
grant execute on function public.signup_delete_tests() to service_role;
