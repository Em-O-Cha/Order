-- เฟส 3 ขั้น "ย้ายการสมัครสมาชิก": Supabase รับการสมัครและตอบลูกค้าทันที แล้วให้ Apps Script เขียนแถวลงชีตตามหลัง
--
-- signup.requests  การสมัครที่ Supabase รับแล้ว (ผลของ registerMember ตัวเดิมที่รันในตัวจำลอง) + สิ่งที่ต้องเขียนลงชีต
--                  ดัชนีไม่ซ้ำกัน LINE UID / เบอร์โทร / รหัสสมาชิก ซ้ำแม้มีคนสมัครพร้อมกัน
-- signup.settings  สวิตช์เปิดใช้งาน (live) และแท็บที่ถ้าสำเนายังไม่ทันต้องถอยไปสมัครทาง Apps Script
-- signup_prepare   ทุกอย่างที่ Edge Function ต้องใช้ในคำขอเดียว (ลดเวลา): เวอร์ชันแท็บ, เนื้อหาแท็บที่เปลี่ยน,
--                  การสมัครที่ยังไม่อยู่ในสำเนา (ต้องนับรวมตอนเช็คซ้ำ/ออกรหัส), ค่าตั้ง
-- signup_insert    บันทึกการสมัคร คืนชื่อช่องที่ซ้ำถ้าชนกัน
-- ทุกอย่างเรียกได้เฉพาะ service_role

create schema if not exists signup;
revoke all on schema signup from public, anon, authenticated;
grant usage on schema signup to service_role;

create table if not exists signup.requests (
  id           uuid        primary key default gen_random_uuid(),
  line_uid     text        not null,
  phone        text        not null,
  member_code  text        not null,
  status       text        not null default 'pending_sheet'
               check (status in ('pending_sheet', 'written', 'failed', 'cancelled')),
  is_test      boolean     not null default false,
  request      jsonb       not null,   -- ข้อมูลที่ลูกค้ากรอก + ชื่อ/รูปจาก LINE (ไม่เก็บโทเคน)
  result       jsonb       not null,   -- คำตอบที่ส่งให้หน้าเว็บ (บัตรสมาชิก)
  journal      jsonb       not null,   -- การเขียนชีตจาก registerMember (ดู gas_runtime.js)
  deferred     jsonb       not null,   -- งานหลังสมัครที่ Apps Script ต้องทำ (ข้อความต้อนรับ, รางวัลผู้แนะนำ)
  base_rows    jsonb       not null,   -- แถวสุดท้ายของแต่ละแท็บที่ journal อ้างอิง (รวมการสมัครที่ยังไม่อยู่ในสำเนา)
  created_at   timestamptz not null default now(),
  written_at   timestamptz,
  attempts     int         not null default 0,
  last_error   text
);
-- การสมัครที่ยกเลิกแล้วไม่นับ (เช่น แอดมินลบสมาชิกแล้วให้สมัครใหม่)
create unique index if not exists requests_line_uid_key on signup.requests (line_uid) where status <> 'cancelled';
create unique index if not exists requests_phone_key on signup.requests (phone) where status <> 'cancelled';
create unique index if not exists requests_member_code_key on signup.requests (member_code) where status <> 'cancelled';
create index if not exists requests_status_idx on signup.requests (status, created_at);
alter table signup.requests enable row level security;

create table if not exists signup.settings (
  key   text  primary key,
  value jsonb not null
);
alter table signup.settings enable row level security;
insert into signup.settings (key, value) values
  -- ปิดไว้: หน้าเว็บจะได้คำตอบให้ถาม Apps Script ทุกครั้ง (ชุดทดสอบภายในยังสมัครได้)
  ('live', 'false'),
  -- แท็บที่ถ้ามีธงข้อมูลเปลี่ยน (สำเนายังไม่ทัน) ต้องถอยไปสมัครทาง Apps Script
  ('block_dirty_keys', '["members/Members", "members/Signup_Privileges", "members/Tier_Config", "props/script"]')
on conflict (key) do nothing;

revoke all on all tables in schema signup from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema signup to service_role;

-- ---------------------------------------------------------------------------
-- signup_prepare
--   p_tab_keys   แท็บที่ต้องใช้
--   p_meta_only  แท็บที่ต้องการแค่หัวตาราง + แถวสุดท้าย (โค้ดแค่ต่อท้าย ไม่อ่านแถว)
--   p_cached     { "source/tab": read_at } ที่ Edge Function มีในหน่วยความจำ — ไม่ส่งเนื้อหาแท็บที่ยังเหมือนเดิม
-- คืน { versions: {key: {read_at, dirty}}, tabs: {key: เนื้อหา (รูปเดียวกับ mirror_get_tabs)},
--       pending: [การสมัครที่ยังไม่อยู่ในสำเนา ตามลำดับเวลา], settings: {key: value} }
-- ---------------------------------------------------------------------------
create or replace function public.signup_prepare(p_tab_keys text[], p_meta_only text[], p_cached jsonb)
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
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'line_uid', q.line_uid, 'phone', q.phone, 'member_code', q.member_code,
               'journal', q.journal, 'base_rows', q.base_rows) order by q.created_at)
        from signup.requests q
       where q.status in ('pending_sheet', 'written')
         and q.created_at > now() - interval '7 days'
         and not exists (select 1 from mirror.rows r
                          where r.source = 'members' and r.tab = 'Members' and r.data ->> 'LINE UID' = q.line_uid)),
      '[]'::jsonb),
    'settings', coalesce((select jsonb_object_agg(s.key, s.value) from signup.settings s), '{}'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------
-- signup_insert: บันทึกการสมัคร คืน { ok: true, id } หรือ { ok: false, conflict: 'line_uid' | 'phone' | 'member_code' }
-- ---------------------------------------------------------------------------
create or replace function public.signup_insert(p_row jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_constraint text;
begin
  insert into signup.requests (line_uid, phone, member_code, is_test, request, result, journal, deferred, base_rows)
  values (p_row ->> 'line_uid', p_row ->> 'phone', p_row ->> 'member_code', coalesce((p_row ->> 'is_test')::boolean, false),
          p_row -> 'request', p_row -> 'result', p_row -> 'journal', p_row -> 'deferred', p_row -> 'base_rows')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  return jsonb_build_object('ok', false, 'conflict',
    case v_constraint when 'requests_line_uid_key' then 'line_uid'
                      when 'requests_phone_key' then 'phone'
                      when 'requests_member_code_key' then 'member_code'
                      else v_constraint end);
end
$$;

revoke all on function public.signup_prepare(text[], text[], jsonb) from public, anon, authenticated;
revoke all on function public.signup_insert(jsonb) from public, anon, authenticated;
grant execute on function public.signup_prepare(text[], text[], jsonb) to service_role;
grant execute on function public.signup_insert(jsonb) to service_role;
