-- เฟส 1: หน้าร้านอ่านประวัติคำสั่งซื้อจาก Supabase แทน Apps Script
--
-- public.shop_order_history(line_uid) คืนค่ารูปแบบเดียวกับ getMyOrderHistory ใน Members.gs ทุกฟิลด์
-- เรียกได้เฉพาะ service_role (Edge Function shop-read ตรวจโทเคน LINE แล้วส่ง LINE UID มาให้)
--
-- ตรรกะเดียวกับ Members.gs:
--   1. หาสมาชิกจาก LINE UID ในแท็บ Members เอาเบอร์โทร (เทียบเฉพาะตัวเลข)
--   2. แถว Revenue ที่เบอร์โทรตรงกัน เอา 25 แถวล่างสุด เรียงจากล่างขึ้นบน
--   3. ข้ามแถวที่ไม่มี Revenue ID แล้วเอาไม่เกิน 20 ออเดอร์
--   วันที่แสดงแบบ toLocaleDateString('th-TH') ของ Apps Script เช่น 23/9/2569
--
-- mirrorAgeMs = สำเนาแท็บ Revenue ถูกอ่านจากชีตมาแล้วกี่มิลลิวินาที หน้าร้านใช้ตัดสินว่าสำเนา
-- ใหม่พอหรือยังหลังเพิ่งสั่งซื้อ/ยกเลิก/แนบสลิป (ถ้ายังไม่ใหม่พอ หน้าร้านถาม Apps Script แทน)

create or replace function mirror.digits(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(t, ''), '\D', '', 'g')
$$;

create or replace function public.shop_order_history(p_line_uid text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (
    select mirror.digits(data ->> 'เบอร์โทร') as phone
      from mirror.rows
     where source = 'members' and tab = 'Members' and data ->> 'LINE UID' = p_line_uid
     order by row_num
     limit 1
  ),
  mine as (
    select r.row_num, r.data
      from mirror.rows r, me
     where me.phone <> ''
       and r.source = 'revenue' and r.tab = 'Revenue'
       and mirror.digits(r.data ->> 'Phone Number') = me.phone
     order by r.row_num desc
     limit 25
  ),
  orders as (
    select row_num, data
      from mine
     where coalesce(data ->> 'Revenue ID', '') <> ''
     order by row_num desc
     limit 20
  )
  select jsonb_build_object(
    'success', true,
    'results', coalesce(jsonb_agg(jsonb_build_object(
        'orderId',       data -> 'Revenue ID',
        'date',          coalesce((
                           select extract(day from t)::int || '/' || extract(month from t)::int || '/'
                                  || (extract(year from t)::int + 543)
                             from (select mirror.ts(data ->> 'Timestamp') at time zone 'Asia/Bangkok' as t) x
                            where t is not null), ''),
        'firstItemName', coalesce(data -> 'ProductName', to_jsonb(''::text)),
        'totalAmount',   coalesce(data -> 'Bill Total', to_jsonb(0)),
        'paymentMethod', coalesce(data -> 'Payment', to_jsonb(''::text)),
        'campaign',      coalesce(data -> 'Campaign', to_jsonb(''::text)),
        'hasSlip',       data ? 'Slip1',
        'isCod',         position('เก็บเงินปลายทาง' in coalesce(data ->> 'Payment', '')) > 0,
        'codStatus',     coalesce(data ->> 'สถานะเก็บเงินปลายทาง', ''),
        'cancelled',     coalesce(data ->> 'ProductName', '') = 'ยกเลิก'
      ) order by row_num desc), '[]'::jsonb),
    'mirrorAgeMs', (select (extract(epoch from now() - read_at) * 1000)::bigint
                      from mirror.tabs
                     where source = 'revenue' and tab = 'Revenue')
  )
  from orders
$$;

revoke all on function public.shop_order_history(text) from public, anon, authenticated;
grant execute on function public.shop_order_history(text) to service_role;
