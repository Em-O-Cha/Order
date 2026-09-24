begin;

-- shop-read: Revenue แบบ "ฉบับย่อ + แถวเต็มเฉพาะออเดอร์ของลูกค้าคนนั้น" ความเร็วไม่ลดลงตาม Revenue ที่โตขึ้น
--
-- โค้ดเดิม (Members.gs) อ่าน Revenue เป็นก้อน แต่ใช้แถวของคนอื่นแค่คอลัมน์ค้นหา (เลขออเดอร์ เบอร์ วันที่สั่ง
-- LINE UID) แล้วกรองเอาเฉพาะแถวของลูกค้า — จึงส่งให้ Edge Function:
--   'revenue/Revenue#slim'  ทุกแถว เลขแถวเดิม แต่เก็บแค่คอลัมน์ใน mirror.tab_slim (แคชข้ามคำขอได้)
--   owner                   แถวเต็มของออเดอร์ลูกค้า (ตาม LINE UID / เบอร์ในแท็บ Members) + ออเดอร์ที่ถามถึง
-- ช่องที่ถูกซ่อน ตัวจำลองคืนค่าพิเศษที่ถ้าโค้ดเอาไปใช้จริง จะโหลด Revenue เต็มแล้วรันใหม่ (ผลเหมือนเดิมเสมอ)

create table if not exists mirror.tab_slim (
  source  text   not null,
  tab     text   not null,
  columns text[] not null,     -- คอลัมน์ที่เก็บไว้ในฉบับย่อ (ชื่อหัวตารางใน mirror.tabs.headers)
  primary key (source, tab)
);
alter table mirror.tab_slim enable row level security;
revoke all on mirror.tab_slim from public, anon, authenticated;
grant select, insert, update, delete on mirror.tab_slim to service_role;
insert into mirror.tab_slim (source, tab, columns)
values ('revenue', 'Revenue', array['Revenue ID', 'Phone Number', 'Order Date', 'LINE UID'])
on conflict (source, tab) do update set columns = excluded.columns;

-- ข้อความสำเร็จรูปแยกตามแบบ ('' = เต็ม, 'slim' = ฉบับย่อ)
alter table mirror.tab_snapshots add column if not exists variant text not null default '';
alter table mirror.tab_snapshots drop constraint if exists tab_snapshots_pkey;
alter table mirror.tab_snapshots add primary key (source, tab, variant);

-- เปลี่ยนคอลัมน์ในฉบับย่อ: ล้างข้อความสำเร็จรูปเดิม (สร้างใหม่เองในคำขอถัดไป)
delete from mirror.tab_snapshots where variant = 'slim';

-- ---------------------------------------------------------------------------
-- mirror_load(p_tab_keys, p_cached, p_owner)  (ตัวใหม่ของ mirror_prepare — ชื่อใหม่ ตัวที่ deploy อยู่ไม่สะดุด)
--   p_tab_keys  แท็บที่ต้องใช้ ('source/tab' หรือ 'source/tab#slim')
--   p_cached    { key: read_at } ที่ Edge Function มีในหน่วยความจำ — ไม่ส่งเนื้อหาแท็บที่ยังเหมือนเดิม
--   p_owner     { uid, order_id } (ไม่บังคับ) — คืนแถวเต็มของออเดอร์ลูกค้าใน owner['revenue/Revenue']
-- คืน { versions: { key: { read_at, dirty, spreadsheet_id } }, tabs: { key: เนื้อหา }, owner: {...} }
--   เนื้อหาแท็บรูปเดียวกับ mirror_get_tabs (+ slim_cols สำหรับฉบับย่อ)
-- ---------------------------------------------------------------------------
create or replace function public.mirror_load(p_tab_keys text[], p_cached jsonb, p_owner jsonb default null)
returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
begin
  -- สร้างข้อความสำเร็จรูปของแท็บที่เก่า (ล็อกต่อแท็บ คำขอที่มาพร้อมกันสร้างครั้งเดียว)
  -- อ่าน mirror.tabs กับ mirror.rows ในคำสั่งเดียว จึงได้ข้อมูลรอบคัดลอกเดียวกันเสมอ
  for r in
    select q.k, t.source, t.tab, split_part(q.k, '#', 2) as variant
      from unnest(p_tab_keys) as q(k)
      join mirror.tabs t on t.source || '/' || t.tab = split_part(q.k, '#', 1)
      left join mirror.tab_snapshots s
             on s.source = t.source and s.tab = t.tab and s.variant = split_part(q.k, '#', 2)
     where split_part(q.k, '#', 2) in ('', 'slim')
       and s.read_at is distinct from t.read_at
     order by q.k
  loop
    perform pg_advisory_xact_lock(hashtextextended('mirror_snapshot:' || r.k, 0));
    insert into mirror.tab_snapshots as s (source, tab, variant, read_at, payload, built_at)
    select t.source, t.tab, r.variant, t.read_at,
           (jsonb_build_object(
              'spreadsheet_id', t.spreadsheet_id,
              'raw_headers',    t.raw_headers,
              'headers',        to_jsonb(t.headers),
              'read_at',        t.read_at,
              'rows', coalesce((
                select jsonb_agg(jsonb_build_array(x.row_num,
                         case when r.variant = 'slim'
                              then (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                                      from jsonb_each(x.data) e where e.key = any (c.columns))
                              else x.data end) order by x.row_num)
                  from mirror.rows x where x.source = t.source and x.tab = t.tab), '[]'::jsonb))
            || case when r.variant = 'slim' then jsonb_build_object('slim_cols', to_jsonb(c.columns))
                    else '{}'::jsonb end)::text,
           now()
      from mirror.tabs t
      left join mirror.tab_slim c on c.source = t.source and c.tab = t.tab
     where t.source = r.source and t.tab = r.tab
       and (r.variant = '' or c.columns is not null)
       and not exists (select 1 from mirror.tab_snapshots z
                        where z.source = t.source and z.tab = t.tab and z.variant = r.variant and z.read_at = t.read_at)
    on conflict (source, tab, variant) do update
      set read_at = excluded.read_at, payload = excluded.payload, built_at = excluded.built_at
      where s.read_at < excluded.read_at;
  end loop;

  -- versions + owner จาก mirror.tabs/mirror.rows ในคำสั่งเดียว (ข้อมูลรอบคัดลอกเดียวกัน)
  -- ถ้ามีการคัดลอกใหม่แทรกระหว่างทาง read_at ในเนื้อหาจะไม่ตรง versions แล้ว Edge Function จะไม่ใช้แท็บนั้น
  -- (ตอบ "สำเนายังไม่ทัน" ให้หน้าเว็บถาม Apps Script) — ปลอดภัยเหมือนเดิม
  return (
    with q as (
      select k, split_part(k, '#', 1) as base, split_part(k, '#', 2) as variant from unnest(p_tab_keys) as k
    ),
    v as (
      select q.k as key, q.variant, t.source, t.tab, t.spreadsheet_id, t.read_at,
             coalesce(d.dirty_at > t.read_at, false) as dirty
        from q
        join mirror.tabs t on t.source || '/' || t.tab = q.base
        left join mirror.dirty d on d.source = t.source and d.tab = t.tab
    ),
    o as (
      select nullif(p_owner ->> 'uid', '') as uid, nullif(p_owner ->> 'order_id', '') as oid
       where p_owner is not null and 'revenue/Revenue#slim' = any (p_tab_keys)
    ),
    heads as (   -- แถวแรกของแต่ละออเดอร์ (row_key = 'REV...#1')
      select split_part(x.row_key, '#', 1) as id, x.data
        from mirror.rows x
       where x.source = 'revenue' and x.tab = 'Revenue' and x.row_key like '%#1'
    ),
    target as (select h.data from heads h join o on h.id = o.oid),
    phones as (
      select m.data ->> 'เบอร์โทร' as ph
        from mirror.rows m join o on m.data ->> 'LINE UID' = o.uid
       where m.source = 'members' and m.tab = 'Members'
      union select data ->> 'Phone Number' from target
    ),
    phone_keys as (
      select regexp_replace(ph, '[^0-9]', '', 'g') as digits, mirror.phone(ph) as norm
        from phones where regexp_replace(coalesce(ph, ''), '[^0-9]', '', 'g') <> ''
    ),
    uids as (select uid from o where uid is not null union select data ->> 'LINE UID' from target),
    ids as (
      select h.id from heads h
       where h.data ->> 'LINE UID' in (select uid from uids where uid is not null)
          or regexp_replace(coalesce(h.data ->> 'Phone Number', ''), '[^0-9]', '', 'g') in (select digits from phone_keys)
          or mirror.phone(h.data ->> 'Phone Number') in (select norm from phone_keys where norm is not null)
      union select oid from o where oid is not null
    ),
    owner_rows as (
      select coalesce(jsonb_agg(jsonb_build_array(x.row_num, x.data) order by x.row_num), '[]'::jsonb) as rows
        from mirror.rows x
       where x.source = 'revenue' and x.tab = 'Revenue' and split_part(x.row_key, '#', 1) in (select id from ids)
    )
    select ('{"versions":' ||
            coalesce((select jsonb_object_agg(v.key, jsonb_build_object(
                        'read_at', v.read_at, 'dirty', v.dirty, 'spreadsheet_id', v.spreadsheet_id)) from v), '{}'::jsonb)::text ||
            ',"tabs":{' ||
            coalesce((select string_agg(to_json(v.key)::text || ':' || s.payload, ',')
                        from v join mirror.tab_snapshots s
                          on s.source = v.source and s.tab = v.tab and s.variant = v.variant
                       where (p_cached ->> v.key) is distinct from to_jsonb(s.read_at) #>> '{}'), '') ||
            '},"owner":' ||
            case when exists (select 1 from o)
                 then jsonb_build_object('revenue/Revenue', (select rows from owner_rows))::text
                 else '{}' end ||
            '}')::json
  );
end $$;

revoke all on function public.mirror_load(text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.mirror_load(text[], jsonb, jsonb) to service_role;

-- ตัวเดิม mirror_prepare: ระหว่าง deploy เคยให้ส่งต่อไป mirror_load (ตัวที่ลูกค้าใช้อยู่ไม่สะดุด)
-- ตอนนี้ shop-read / member-signup เรียก mirror_load แล้ว จึงลบทิ้ง
drop function if exists public.mirror_prepare(text[], jsonb);

commit;
