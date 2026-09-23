-- เฟส 0: Supabase เป็น "สำเนาไว้ค้นหา" ของ Google Sheets (Sheets ยังเป็นตัวหลัก)
--
-- โครงสร้าง
--   mirror.tabs        1 แถวต่อ 1 แท็บชีต: หัวคอลัมน์, จำนวนแถว, hash ของเนื้อหา, เวลาที่อ่านชีต
--   mirror.rows        1 แถวต่อ 1 แถวชีต: data เป็น jsonb ที่ใช้ "ชื่อหัวคอลัมน์" เป็น key (ไม่ผูกกับตำแหน่งคอลัมน์)
--   mirror.tab_config  ตั้งค่าต่อแท็บ: คอลัมน์ที่ใช้เป็น row_key และคอลัมน์ที่ห้ามคัดลอก
--   mirror.v_*         view แบบมี type ของแท็บหลัก
--   public.mirror_replace_tab()  ทางเข้าเดียวของตัวคัดลอก: แทนที่ข้อมูลทั้งแท็บในธุรกรรมเดียว
--
-- ความปลอดภัย: schema mirror ไม่ได้เปิดผ่าน Data API และทุกตารางเปิด RLS โดยไม่มี policy
-- ฟังก์ชันใน public เรียกได้เฉพาะ service_role เท่านั้น (anon / authenticated เรียกไม่ได้)

create schema if not exists mirror;
revoke all on schema mirror from public, anon, authenticated;
grant usage on schema mirror to service_role;

-- ---------------------------------------------------------------------------
-- ตาราง
-- ---------------------------------------------------------------------------

create table if not exists mirror.tab_config (
  source           text    not null,           -- 'members' | 'revenue' | 'master'
  tab              text    not null,           -- ชื่อแท็บในชีต
  key_header       text,                       -- หัวคอลัมน์ที่ใช้เป็น row_key (ว่าง = ไม่มี key)
  carry_forward    boolean not null default false,
                                               -- true = แถวที่ key ว่างเป็นของแถวที่มี key ก่อนหน้า
                                               -- (Revenue: เลข Revenue ID อยู่เฉพาะแถวแรกของออเดอร์)
  excluded_headers text[]  not null default '{}',
  primary key (source, tab)
);

create table if not exists mirror.tabs (
  source         text        not null,
  tab            text        not null,
  spreadsheet_id text,
  headers        text[]      not null,         -- ชื่อ key ใน data ตามลำดับคอลัมน์ (หลังแก้ชื่อซ้ำ/ว่าง)
  first_row      int         not null,         -- เลขแถวชีตของแถวข้อมูลแรก
  row_count      int         not null,         -- จำนวนแถวที่มีข้อมูล (ไม่นับแถวว่าง)
  content_hash   text,                         -- hash ที่ตัวคัดลอกคำนวณจากค่าในแท็บ
  read_at        timestamptz not null,         -- เวลาที่ตัวคัดลอกอ่านชีต
  synced_at      timestamptz not null default now(),
  primary key (source, tab)
);

create table if not exists mirror.rows (
  source  text  not null,
  tab     text  not null,
  row_num int   not null,                      -- เลขแถวในชีต ณ เวลาที่อ่าน (เปลี่ยนได้ ห้ามใช้เป็น key ถาวร)
  row_key text,                                -- เช่น LINE UID หรือ 'REV6907001#2'
  data    jsonb not null,                      -- {"หัวคอลัมน์": ค่า} เฉพาะช่องที่ไม่ว่าง
  primary key (source, tab, row_num),
  foreign key (source, tab) references mirror.tabs (source, tab) on delete cascade
);

alter table mirror.tab_config enable row level security;
alter table mirror.tabs       enable row level security;
alter table mirror.rows       enable row level security;

revoke all on all tables in schema mirror from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema mirror to service_role;

-- ตั้งค่าแท็บที่รู้จัก (แท็บอื่นคัดลอกได้ตามปกติ แค่ไม่มี row_key)
insert into mirror.tab_config (source, tab, key_header, carry_forward, excluded_headers) values
  ('members', 'Members',            'LINE UID',   false, '{}'),
  ('members', 'Registration_Queue', 'รหัสคำขอ',   false, '{"ID Token"}'),
  ('revenue', 'Revenue',            'Revenue ID', true,  '{}')
on conflict (source, tab) do update
  set key_header       = excluded.key_header,
      carry_forward    = excluded.carry_forward,
      excluded_headers = excluded.excluded_headers;

-- ---------------------------------------------------------------------------
-- ตัวช่วยแปลงค่า (ใช้ใน view และ index)
-- ---------------------------------------------------------------------------

-- 1 -> A, 27 -> AA
create or replace function mirror.col_letter(n int) returns text
language plpgsql immutable strict set search_path = '' as $$
declare
  s text := '';
  m int  := n;
begin
  while m > 0 loop
    s := chr(65 + (m - 1) % 26) || s;
    m := (m - 1) / 26;
  end loop;
  return s;
end $$;

-- เบอร์โทรเหลือแต่ตัวเลข รูปแบบ 0xxxxxxxxx (รับทั้ง +66 และเบอร์ที่ชีตตัด 0 หน้าทิ้งเพราะเก็บเป็นตัวเลข)
create or replace function mirror.phone(t text) returns text
language sql immutable set search_path = '' as $$
  select case
    when d = ''                                   then null
    when length(d) = 11 and left(d, 2) = '66'     then '0' || substr(d, 3)
    when length(d) = 9  and left(d, 1) in ('6', '8', '9', '2') then '0' || d
    else d
  end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x
$$;

-- ตัวเลขจากชีต: รับทั้ง number และข้อความอย่าง "1,234.50" / "฿68"
create or replace function mirror.num(t text) returns numeric
language plpgsql immutable set search_path = '' as $$
declare
  s text := regexp_replace(coalesce(t, ''), '[,\s฿]', '', 'g');
begin
  if s ~ '^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$' then
    return s::numeric;
  end if;
  return null;
end $$;

create or replace function mirror.bool(t text) returns boolean
language sql immutable set search_path = '' as $$
  select case upper(btrim(coalesce(t, '')))
    when 'TRUE'  then true  when '1' then true  when 'YES' then true
    when 'FALSE' then false when '0' then false when 'NO'  then false
  end
$$;

-- วันเวลาจากชีต: ISO (Apps Script ส่ง Date มาเป็น ISO UTC) หรือ dd/mm/yyyy[ hh:mm[:ss]] เวลาไทย
-- ปี พ.ศ. (> 2400) แปลงเป็น ค.ศ. ให้ ค่าที่อ่านไม่ออกคืน null (ไม่ทำให้ view พัง)
create or replace function mirror.ts(t text) returns timestamptz
language plpgsql immutable set search_path = '' as $$
declare
  s text := btrim(coalesce(t, ''));
  m text[];
  y int;
begin
  if s = '' then return null; end if;

  if s ~ '^\d{4}-\d{2}-\d{2}T' then
    return s::timestamptz;
  end if;

  m := regexp_match(s, '^(\d{4})-(\d{1,2})-(\d{1,2})$');
  if m is not null then
    y := m[1]::int; if y > 2400 then y := y - 543; end if;
    return make_timestamptz(y, m[2]::int, m[3]::int, 0, 0, 0, 'Asia/Bangkok');
  end if;

  m := regexp_match(s, '^(\d{1,2})/(\d{1,2})/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$');
  if m is not null then
    y := m[3]::int; if y > 2400 then y := y - 543; end if;
    return make_timestamptz(y, m[2]::int, m[1]::int,
                            coalesce(m[4], '0')::int, coalesce(m[5], '0')::int,
                            coalesce(m[6], '0')::double precision, 'Asia/Bangkok');
  end if;

  return null;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: แทนที่ข้อมูลทั้งแท็บในธุรกรรมเดียว
-- ---------------------------------------------------------------------------
--
-- p_headers   แถวหัวคอลัมน์ ["LINE UID", "ชื่อที่แสดงใน LINE", ...]
-- p_rows      แถวข้อมูลเป็น array ของ array ตามลำดับคอลัมน์ (เหมือน getValues())
-- p_first_row เลขแถวชีตของ p_rows[0] (ปกติ 2)
-- p_hash      hash ของเนื้อหาแท็บ ถ้าตรงกับครั้งก่อนจะไม่เขียนซ้ำ
-- p_read_at   เวลาที่อ่านชีต ถ้าในฐานข้อมูลมีสำเนาที่อ่านทีหลังกว่าแล้ว คำขอนี้จะถูกข้าม (stale)
--             กันกรณีรอบคัดลอกตามเวลากับการส่งทันทีหลังเขียนชีตมาถึงสลับลำดับกัน
--
-- ชื่อ key ใน data: หัวคอลัมน์ที่ตัดช่องว่างหัวท้าย, หัวว่าง = "_col_<ตัวอักษรคอลัมน์>",
-- ชื่อซ้ำตัวที่ 2 เป็นต้นไปต่อท้าย " (2)", " (3)" ...  ช่องว่าง/ข้อความว่างไม่ถูกเก็บ
-- แถวที่ว่างทั้งแถวไม่ถูกเก็บ (row_num ยังตรงกับเลขแถวจริงในชีต)
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
  if found and p_hash is not null and v_prev.content_hash = p_hash then
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

  insert into mirror.tabs as t (source, tab, spreadsheet_id, headers, first_row, row_count,
                                content_hash, read_at, synced_at)
  values (p_source, p_tab, p_spreadsheet_id, v_keys, p_first_row, 0, p_hash, p_read_at, now())
  on conflict (source, tab) do update
    set spreadsheet_id = coalesce(excluded.spreadsheet_id, t.spreadsheet_id),
        headers = excluded.headers, first_row = excluded.first_row,
        content_hash = excluded.content_hash, read_at = excluded.read_at, synced_at = now();

  delete from mirror.rows where source = p_source and tab = p_tab;

  insert into mirror.rows (source, tab, row_num, row_key, data)
  with cells as (
    select p_first_row + r.idx::int - 1 as row_num,
           (select jsonb_object_agg(v_keys[c.ord],
                                    case when jsonb_typeof(c.val) = 'string'
                                         then to_jsonb(btrim(c.val #>> '{}')) else c.val end)
              from jsonb_array_elements(r.cells) with ordinality as c(val, ord)
             where c.ord <= coalesce(array_length(v_keys, 1), 0)
               and jsonb_typeof(c.val) <> 'null'
               and not (jsonb_typeof(c.val) = 'string' and btrim(c.val #>> '{}') = '')
               and not (v_keys[c.ord] = any (coalesce(v_cfg.excluded_headers, '{}')))
           ) as data
      from jsonb_array_elements(p_rows) with ordinality as r(cells, idx)
     where jsonb_typeof(r.cells) = 'array'
  ),
  kept as (
    select row_num, data, data ->> v_cfg.key_header as own_key
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

-- สถานะสำเนาทุกแท็บ ใช้เทียบจำนวนแถวกับชีต
create or replace function public.mirror_status()
returns table (source text, tab text, row_count int, content_hash text, read_at timestamptz, synced_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select source, tab, row_count, content_hash, read_at, synced_at
    from mirror.tabs order by source, tab
$$;

revoke all on function public.mirror_replace_tab(text, text, jsonb, jsonb, int, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.mirror_status() from public, anon, authenticated;
grant execute on function public.mirror_replace_tab(text, text, jsonb, jsonb, int, text, text, timestamptz)
  to service_role;
grant execute on function public.mirror_status() to service_role;

-- ---------------------------------------------------------------------------
-- index สำหรับค้นหา (expression ตรงกับที่ view ใช้ เพื่อให้ planner ใช้ index ได้)
-- ---------------------------------------------------------------------------

create index if not exists rows_key_idx
  on mirror.rows (source, tab, row_key) where row_key is not null;
create index if not exists rows_line_uid_idx
  on mirror.rows (source, tab, (data ->> 'LINE UID'));
create index if not exists rows_members_phone_idx
  on mirror.rows (mirror.phone(data ->> 'เบอร์โทร'))
  where source = 'members' and tab = 'Members';
create index if not exists rows_revenue_phone_idx
  on mirror.rows (mirror.phone(data ->> 'Phone Number'))
  where source = 'revenue' and tab = 'Revenue';
create index if not exists rows_revenue_id_idx
  on mirror.rows ((data ->> 'Revenue ID'))
  where source = 'revenue' and tab = 'Revenue' and data ? 'Revenue ID';
create index if not exists rows_data_gin
  on mirror.rows using gin (data jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- view แบบมี type ของแท็บหลัก
-- ---------------------------------------------------------------------------

create or replace view mirror.v_members with (security_invoker = true) as
select data ->> 'LINE UID'                                       as line_uid,
       data ->> 'รหัสสมาชิก'                                      as member_code,
       data ->> 'ชื่อที่แสดงใน LINE'                               as display_name,
       data ->> 'ชื่อ-นามสกุล'                                     as full_name,
       mirror.phone(data ->> 'เบอร์โทร')                           as phone,
       data ->> 'เบอร์โทร'                                        as phone_raw,
       data ->> 'รูปโปรไฟล์'                                       as picture_url,
       mirror.ts(data ->> 'วันที่สมัคร')                           as registered_at,
       (mirror.ts(data ->> 'วันเกิด') at time zone 'Asia/Bangkok')::date as birthday,
       mirror.num(data ->> 'แต้มสะสม')                            as points,
       data ->> 'ระดับ Tier'                                       as tier,
       mirror.num(data ->> 'ยอดซื้อสะสม')                         as total_spent,
       data ->> 'ที่อยู่จัดส่งล่าสุด'                                as last_address,
       data ->> 'จังหวัดล่าสุด'                                     as last_province,
       data ->> 'แนะนำโดย(LINE UID ผู้แนะนำ)'                      as referred_by,
       mirror.bool(data ->> 'ให้รางวัลแนะนำเพื่อนแล้ว(TRUE/FALSE)') as referral_rewarded,
       mirror.bool(data ->> 'บล็อก LINE OA แล้ว(TRUE/FALSE)')       as blocked_oa,
       mirror.ts(data ->> 'เช็คบล็อกล่าสุดเมื่อ')                   as block_checked_at,
       mirror.ts(data ->> 'บล็อกครั้งแรกเมื่อ(ประมาณ)')              as first_blocked_at,
       mirror.bool(data ->> 'บล็อกเก็บเงินปลายทาง(TRUE/FALSE)')     as cod_blocked,
       data ->> 'เหตุผล/วันที่บล็อกเก็บเงินปลายทาง'                  as cod_block_reason,
       row_num, data
  from mirror.rows
 where source = 'members' and tab = 'Members';

create or replace view mirror.v_member_privileges with (security_invoker = true) as
select data ->> 'LINE UID'                                                 as line_uid,
       data ->> 'ชื่อสิทธิ์'                                                  as name,
       data ->> 'ประเภท(percent/fixed)'                                      as type,
       mirror.num(data ->> 'มูลค่า')                                         as value,
       mirror.ts(data ->> 'วันหมดอายุ')                                      as expires_at,
       mirror.ts(data ->> 'วันที่เริ่มใช้ได้(เว้นว่าง=ใช้ได้ทันที)')              as starts_at,
       data ->> 'ให้โดย'                                                     as granted_by,
       mirror.ts(data ->> 'วันที่ให้')                                        as granted_at,
       mirror.bool(data ->> 'เปิดใช้งาน(TRUE/FALSE)')                         as active,
       mirror.num(data ->> 'ยอดซื้อขั้นต่ำ(เว้นว่าง=ไม่กำหนด)')                 as min_spend,
       data ->> 'สินค้าที่ต้องซื้อ(เฉพาะ bogo)'                                as bogo_buy,
       data ->> 'สินค้าที่แถม(เฉพาะ bogo)'                                    as bogo_free,
       mirror.num(data ->> 'จำนวนที่แถมต่อรอบ(เฉพาะ bogo)')                   as bogo_free_qty,
       mirror.num(data ->> 'ส่วนลดของแถม(%)(เฉพาะ bogo — เว้นว่าง=100% ฟรี)') as bogo_free_discount_pct,
       mirror.ts(data ->> 'ใช้สิทธิ์เมื่อ')                                    as used_at,
       mirror.bool(data ->> 'แจ้งเตือนแล้ว(TRUE/FALSE)')                      as notified,
       mirror.bool(data ->> 'ประกาศโปรใหม่แล้ว(TRUE/FALSE)')                  as announced,
       row_num, data
  from mirror.rows
 where source = 'members' and tab = 'Member_Privileges';

create or replace view mirror.v_points_log with (security_invoker = true) as
select mirror.ts(data ->> 'วันเวลา')                                          as at,
       data ->> 'LINE UID'                                                   as line_uid,
       data ->> 'ประเภท(earn/redeem/adjust_add/adjust_sub)'                  as type,
       data ->> 'รายการ'                                                     as description,
       mirror.num(data ->> 'คะแนนเปลี่ยนแปลง(+/-)')                          as delta,
       mirror.num(data ->> 'คะแนนคงเหลือหลังรายการ')                          as balance_after,
       row_num, data
  from mirror.rows
 where source = 'members' and tab = 'Points_Log';

-- 1 แถวต่อ 1 สินค้าในออเดอร์ (order_id เติมให้ทุกแถวจาก row_key)
create or replace view mirror.v_revenue_lines with (security_invoker = true) as
select split_part(row_key, '#', 1)                   as order_id,
       split_part(row_key, '#', 2)::int              as line_no,
       data ->> 'ProductName'                        as product_name,
       mirror.num(data ->> 'Qty')                    as qty,
       mirror.num(data ->> 'Price')                  as price,
       mirror.num(data ->> 'Discount')               as discount,
       mirror.num(data ->> 'Amount')                 as amount,
       data ->> 'FREE'                               as free,
       row_num, data
  from mirror.rows
 where source = 'revenue' and tab = 'Revenue' and row_key is not null;

-- 1 แถวต่อ 1 ออเดอร์ (ข้อมูลระดับออเดอร์อยู่ที่แถวแรกของออเดอร์)
create or replace view mirror.v_revenue_orders with (security_invoker = true) as
select data ->> 'Revenue ID'                            as order_id,
       mirror.ts(data ->> 'Timestamp')                  as recorded_at,
       mirror.ts(data ->> 'Order Date')                 as order_date,
       data ->> 'LINE UID'                              as line_uid,
       data ->> 'Customer Name'                         as customer_name,
       mirror.phone(data ->> 'Phone Number')            as phone,
       data ->> 'Phone Number'                          as phone_raw,
       data ->> 'Customer Address'                      as address,
       data ->> 'Province'                              as province,
       mirror.num(data ->> 'Delivery')                  as delivery,
       mirror.num(data ->> 'Bill Total')                as bill_total,
       data ->> 'Payment'                               as payment,
       mirror.ts(data ->> 'วันที่ชำระเงิน')              as paid_at,
       data ->> 'Slip1'                                 as slip1,
       data ->> 'Slip2'                                 as slip2,
       data ->> 'Slip3'                                 as slip3,
       data ->> 'Remark'                                as remark,
       data ->> 'Sales Name'                            as sales_name,
       data ->> 'Ad'                                    as ad_channel,
       data ->> 'Campaign'                              as campaign,
       data ->> 'CustomerType'                          as customer_type,
       data ->> 'Order No.Shopee'                       as shopee_order_no,
       data ->> 'Order No.TikTok'                       as tiktok_order_no,
       mirror.ts(data ->> 'Label Printed At')           as label_printed_at,
       data ->> 'เลขพัสดุ'                               as tracking_no,
       data ->> 'ชื่อขนส่ง'                              as carrier,
       data ->> 'แจ้งพัสดุแล้ว'                          as tracking_notified,
       data ->> 'สถานะเก็บเงินปลายทาง'                    as cod_status,
       mirror.ts(data ->> 'วันที่ได้รับเงินปลายทาง')        as cod_received_at,
       row_num, data
  from mirror.rows
 where source = 'revenue' and tab = 'Revenue' and data ? 'Revenue ID';

-- สินค้าที่หน้าร้านขาย (แท็บ SKU คอลัมน์ H-L ชุดเดียวกับที่ getShopProducts อ่าน)
create or replace view mirror.v_products with (security_invoker = true) as
select data ->> 'Product_Name'                                  as category,
       data ->> 'Pack'                                          as variant,
       (data ->> 'Product_Name') || ' ' || (data ->> 'Pack')    as sku_name,
       mirror.num(data ->> 'Price on Line')                     as price,
       data ->> 'Link'                                          as image_url,
       mirror.num(data ->> 'Weight')                            as weight_g,
       row_num, data
  from mirror.rows
 where source = 'master' and tab = 'SKU'
   and data ? 'Product_Name' and data ? 'Pack';

revoke all on all tables in schema mirror from public, anon, authenticated;
grant select on all tables in schema mirror to service_role;
grant select, insert, update, delete on mirror.tab_config, mirror.tabs, mirror.rows to service_role;
