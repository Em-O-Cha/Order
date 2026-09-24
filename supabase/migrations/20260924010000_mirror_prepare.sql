-- shop-read เร็วขึ้น
-- 1. เวอร์ชันแท็บ + เนื้อหาแท็บที่เปลี่ยน ในคำขอเดียว (เดิม mirror_tab_versions แล้วค่อย mirror_get_tabs)
-- 2. เนื้อหาแท็บเก็บเป็นข้อความ JSON สำเร็จรูป (mirror.tab_snapshots) ไม่ต้องประกอบจากแถวทุกคำขอ
--    Edge Function เปิดเครื่องใหม่ต่อคำขอพร้อมกันแทบทุกครั้ง แต่ละเครื่องต้องโหลดทุกแท็บ — ประกอบจากแถว
--    ใช้ CPU ฐานข้อมูลราว 35 ms ต่อครั้ง พร้อมกัน 20 คำขอรอกันถึง 0.4 วินาที; อ่านข้อความสำเร็จรูปราว 6 ms
--    สร้างใหม่เองครั้งแรกที่มีคนอ่านหลังแท็บถูกคัดลอกใหม่ (read_at เปลี่ยน) ไม่ต้องแก้ตัวคัดลอก
--
-- mirror_prepare(p_tab_keys, p_cached)
--   p_tab_keys  แท็บที่ต้องใช้
--   p_cached    { "source/tab": read_at } ที่ Edge Function มีในหน่วยความจำ — ไม่ส่งเนื้อหาแท็บที่ยังเหมือนเดิม
-- คืน { versions: { key: { read_at, dirty, spreadsheet_id } }, tabs: { key: เนื้อหา (รูปเดียวกับ mirror_get_tabs) } }
-- เรียกได้เฉพาะ service_role

create table if not exists mirror.tab_snapshots (
  source   text        not null,
  tab      text        not null,
  read_at  timestamptz not null,   -- ตรงกับ mirror.tabs.read_at ตอนสร้าง (ไม่ตรง = เก่า ต้องสร้างใหม่)
  payload  text        not null,   -- JSON ของแท็บ รูปเดียวกับค่าหนึ่งช่องใน mirror_get_tabs
  built_at timestamptz not null default now(),
  primary key (source, tab)
);
alter table mirror.tab_snapshots enable row level security;
revoke all on mirror.tab_snapshots from public, anon, authenticated;
grant select, insert, update, delete on mirror.tab_snapshots to service_role;

drop function if exists public.mirror_prepare(text[], jsonb);
create or replace function public.mirror_prepare(p_tab_keys text[], p_cached jsonb)
returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_stale text[];
  v_key   text;
begin
  select array_agg(t.source || '/' || t.tab order by t.source, t.tab) into v_stale
    from mirror.tabs t
    left join mirror.tab_snapshots s on s.source = t.source and s.tab = t.tab
   where t.source || '/' || t.tab = any (p_tab_keys)
     and s.read_at is distinct from t.read_at;

  -- สร้างข้อความสำเร็จรูปของแท็บที่เก่า (ล็อกต่อแท็บ คำขอที่มาพร้อมกันสร้างครั้งเดียว)
  -- อ่าน mirror.tabs กับ mirror.rows ในคำสั่งเดียว จึงได้ข้อมูลรอบคัดลอกเดียวกันเสมอ
  foreach v_key in array coalesce(v_stale, '{}') loop
    perform pg_advisory_xact_lock(hashtextextended('mirror_snapshot:' || v_key, 0));
    insert into mirror.tab_snapshots as s (source, tab, read_at, payload, built_at)
    select t.source, t.tab, t.read_at,
           jsonb_build_object(
             'spreadsheet_id', t.spreadsheet_id,
             'raw_headers',    t.raw_headers,
             'headers',        to_jsonb(t.headers),
             'read_at',        t.read_at,
             'rows', coalesce((select jsonb_agg(jsonb_build_array(r.row_num, r.data) order by r.row_num)
                                 from mirror.rows r where r.source = t.source and r.tab = t.tab), '[]'::jsonb))::text,
           now()
      from mirror.tabs t
     where t.source || '/' || t.tab = v_key
       and not exists (select 1 from mirror.tab_snapshots x
                        where x.source = t.source and x.tab = t.tab and x.read_at = t.read_at)
    on conflict (source, tab) do update
      set read_at = excluded.read_at, payload = excluded.payload, built_at = excluded.built_at
      where s.read_at is null or s.read_at < excluded.read_at;
  end loop;

  -- versions จาก mirror.tabs (ตัดสินธงสำเนาไม่ทัน) + เนื้อหาจากข้อความสำเร็จรูป
  -- ถ้ามีการคัดลอกใหม่แทรกระหว่างทาง read_at ในเนื้อหาจะไม่ตรง versions แล้ว Edge Function จะไม่ใช้แท็บนั้น
  -- (ตอบ "สำเนายังไม่ทัน" ให้หน้าเว็บถาม Apps Script) — ปลอดภัยเหมือนเดิม
  return (
    with v as (
      select t.source || '/' || t.tab as key, t.source, t.tab, t.spreadsheet_id, t.read_at,
             coalesce(d.dirty_at > t.read_at, false) as dirty
        from mirror.tabs t
        left join mirror.dirty d on d.source = t.source and d.tab = t.tab
       where t.source || '/' || t.tab = any (p_tab_keys)
    )
    select ('{"versions":' ||
            coalesce((select jsonb_object_agg(v.key, jsonb_build_object(
                        'read_at', v.read_at, 'dirty', v.dirty, 'spreadsheet_id', v.spreadsheet_id)) from v), '{}'::jsonb)::text ||
            ',"tabs":{' ||
            coalesce((select string_agg(to_json(v.key)::text || ':' || s.payload, ',')
                        from v join mirror.tab_snapshots s on s.source = v.source and s.tab = v.tab
                       where (p_cached ->> v.key) is distinct from to_jsonb(s.read_at) #>> '{}'), '') ||
            '}}')::json
  );
end $$;

revoke all on function public.mirror_prepare(text[], jsonb) from public, anon, authenticated;
grant execute on function public.mirror_prepare(text[], jsonb) to service_role;
