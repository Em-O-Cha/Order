-- เฟส 1-2: ให้ Edge Function รันฟังก์ชันเดิมของ Members.gs บนสำเนาชีตได้ตรงกับของจริง
--
-- 1. เก็บค่าในเซลล์ตามจริง (ไม่ตัดช่องว่างหัวท้าย) และเก็บหัวคอลัมน์ต้นฉบับ (raw_headers)
--    ตัวจำลองชีตจะคืนค่า getValues() ได้เหมือน Google Sheets ทุกตัวอักษร
-- 2. ธงข้อมูลเปลี่ยน (mirror.dirty): Apps Script ตั้งทันทีตอนเขียนชีต แท็บที่ถูกตั้งธงหลังจากการอ่าน
--    ครั้งล่าสุด (dirty_at > read_at) ถือว่าสำเนายังไม่ทัน Edge Function จะให้หน้าเว็บถาม Apps Script แทน
-- 3. RPC ให้ Edge Function อ่านเวอร์ชันและเนื้อหาแท็บ
-- 4. internal key สำหรับชุดเทียบผลใน Apps Script (เรียกแทนลูกค้าคนไหนก็ได้โดยไม่ต้องมีโทเคน LINE)
-- ทุกอย่างเรียกได้เฉพาะ service_role

alter table mirror.tabs add column if not exists raw_headers jsonb;

create table if not exists mirror.dirty (
  source   text        not null,
  tab      text        not null,
  dirty_at timestamptz not null,
  primary key (source, tab)
);
alter table mirror.dirty enable row level security;

create table if not exists mirror.secrets (
  name  text primary key,
  value text not null
);
alter table mirror.secrets enable row level security;
insert into mirror.secrets (name, value)
values ('internal_key', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

revoke all on mirror.dirty, mirror.secrets from public, anon, authenticated;
grant select, insert, update, delete on mirror.dirty to service_role;

-- ---------------------------------------------------------------------------
-- mirror_replace_tab: เก็บค่าตามจริง + raw_headers
-- ---------------------------------------------------------------------------
create or replace function public.mirror_replace_tab(
  p_source         text,
  p_tab            text,
  p_headers        jsonb,
  p_rows           jsonb,
  p_first_row      int         default 2,
  p_spreadsheet_id text        default null,
  p_hash           text        default null,
  p_read_at        timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cfg   mirror.tab_config%rowtype;
  v_prev  mirror.tabs%rowtype;
  v_keys  text[];
  v_count int;
begin
  if coalesce(p_source, '') = '' or coalesce(p_tab, '') = '' then
    raise exception 'p_source และ p_tab ต้องไม่ว่าง';
  end if;
  if jsonb_typeof(p_headers) is distinct from 'array' or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_headers และ p_rows ต้องเป็น JSON array';
  end if;

  -- กันสองคำขอเขียนแท็บเดียวกันพร้อมกัน
  perform pg_advisory_xact_lock(hashtextextended(p_source || '/' || p_tab, 0));

  select * into v_prev from mirror.tabs where source = p_source and tab = p_tab;
  if found and v_prev.read_at > p_read_at then
    return jsonb_build_object('status', 'stale', 'read_at', v_prev.read_at);
  end if;
  if found and p_hash is not null and v_prev.content_hash = p_hash and v_prev.raw_headers is not null then
    update mirror.tabs set read_at = p_read_at, synced_at = now()
     where source = p_source and tab = p_tab;
    return jsonb_build_object('status', 'unchanged', 'rows', v_prev.row_count);
  end if;

  select * into v_cfg from mirror.tab_config where source = p_source and tab = p_tab;

  select array_agg(case when rn = 1 then name else name || ' (' || rn || ')' end order by ord)
    into v_keys
    from (
      select ord, name, row_number() over (partition by name order by ord) as rn
        from (
          select ord, coalesce(nullif(btrim(h), ''), '_col_' || mirror.col_letter(ord::int)) as name
            from jsonb_array_elements_text(p_headers) with ordinality as t(h, ord)
        ) named
    ) deduped;
  v_keys := coalesce(v_keys, '{}');

  insert into mirror.tabs as t (source, tab, spreadsheet_id, headers, raw_headers, first_row, row_count,
                                content_hash, read_at, synced_at)
  values (p_source, p_tab, p_spreadsheet_id, v_keys, p_headers, p_first_row, 0, p_hash, p_read_at, now())
  on conflict (source, tab) do update
    set spreadsheet_id = coalesce(excluded.spreadsheet_id, t.spreadsheet_id),
        headers = excluded.headers, raw_headers = excluded.raw_headers, first_row = excluded.first_row,
        content_hash = excluded.content_hash, read_at = excluded.read_at, synced_at = now();

  delete from mirror.rows where source = p_source and tab = p_tab;

  insert into mirror.rows (source, tab, row_num, row_key, data)
  with cells as (
    select p_first_row + r.idx::int - 1 as row_num,
           (select jsonb_object_agg(v_keys[c.ord], c.val)
              from jsonb_array_elements(r.cells) with ordinality as c(val, ord)
             where c.ord <= coalesce(array_length(v_keys, 1), 0)
               and jsonb_typeof(c.val) <> 'null'
               and not (jsonb_typeof(c.val) = 'string' and c.val #>> '{}' = '')
               and not (v_keys[c.ord] = any (coalesce(v_cfg.excluded_headers, '{}')))
           ) as data
      from jsonb_array_elements(p_rows) with ordinality as r(cells, idx)
     where jsonb_typeof(r.cells) = 'array'
  ),
  kept as (
    select row_num, data, nullif(btrim(data ->> v_cfg.key_header), '') as own_key
      from cells
     where data is not null
  ),
  grouped as (
    select *, count(own_key) over (order by row_num) as grp from kept
  ),
  keyed as (
    select row_num, data,
           case
             when v_cfg.key_header is null then null
             when not v_cfg.carry_forward then own_key
             else max(own_key) over (partition by grp) || '#' ||
                  row_number() over (partition by grp order by row_num)
           end as row_key
      from grouped
  )
  select p_source, p_tab, row_num,
         -- แถวที่อยู่ก่อนแถวแรกที่มี key (carry_forward) ไม่มีเจ้าของ
         case when row_key like '#%' then null else row_key end,
         data
    from keyed;

  get diagnostics v_count = row_count;
  update mirror.tabs set row_count = v_count where source = p_source and tab = p_tab;

  return jsonb_build_object('status', 'replaced', 'rows', v_count, 'headers', to_jsonb(v_keys));
end $$;

-- ---------------------------------------------------------------------------
-- ธงข้อมูลเปลี่ยน
-- ---------------------------------------------------------------------------

-- Apps Script เรียกทันทีหลังเขียนชีต (ก่อนตอบลูกค้า) รับ ['members/Members', 'revenue/Revenue', ...]
create or replace function public.mirror_mark_dirty(p_tabs text[])
returns void
language sql security definer set search_path = '' as $$
  insert into mirror.dirty (source, tab, dirty_at)
  select split_part(k, '/', 1), substr(k, strpos(k, '/') + 1), now()
    from unnest(p_tabs) as k
   where strpos(k, '/') > 1
  on conflict (source, tab) do update set dirty_at = excluded.dirty_at
$$;

-- เวอร์ชันของทุกแท็บ: Edge Function ใช้ตัดสินว่าต้องโหลดแท็บใหม่ไหม และสำเนาทันหรือยัง
create or replace function public.mirror_tab_versions()
returns table (source text, tab text, spreadsheet_id text, read_at timestamptz, dirty boolean)
language sql stable security definer set search_path = '' as $$
  select t.source, t.tab, t.spreadsheet_id, t.read_at,
         coalesce(d.dirty_at > t.read_at, false)
    from mirror.tabs t
    left join mirror.dirty d on d.source = t.source and d.tab = t.tab
$$;

-- เนื้อหาแท็บ: { "members/Members": { spreadsheet_id, raw_headers, headers, read_at, rows: [[row_num, data], ...] } }
create or replace function public.mirror_get_tabs(p_tabs text[])
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(t.source || '/' || t.tab, jsonb_build_object(
           'spreadsheet_id', t.spreadsheet_id,
           'raw_headers',    t.raw_headers,
           'headers',        to_jsonb(t.headers),
           'read_at',        t.read_at,
           'rows', coalesce((select jsonb_agg(jsonb_build_array(r.row_num, r.data) order by r.row_num)
                               from mirror.rows r
                              where r.source = t.source and r.tab = t.tab), '[]'::jsonb))), '{}'::jsonb)
    from mirror.tabs t
   where t.source || '/' || t.tab = any (p_tabs)
$$;

create or replace function public.mirror_internal_key()
returns text
language sql stable security definer set search_path = '' as $$
  select value from mirror.secrets where name = 'internal_key'
$$;

revoke all on function public.mirror_mark_dirty(text[]) from public, anon, authenticated;
revoke all on function public.mirror_tab_versions() from public, anon, authenticated;
revoke all on function public.mirror_get_tabs(text[]) from public, anon, authenticated;
revoke all on function public.mirror_internal_key() from public, anon, authenticated;
grant execute on function public.mirror_mark_dirty(text[]) to service_role;
grant execute on function public.mirror_tab_versions() to service_role;
grant execute on function public.mirror_get_tabs(text[]) to service_role;
grant execute on function public.mirror_internal_key() to service_role;
