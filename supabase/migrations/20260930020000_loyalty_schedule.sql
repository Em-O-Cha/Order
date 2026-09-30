-- ช่วงวันเปิดรับใบเสร็จ 7-Eleven: live_from / live_until (yyyy-mm-dd เวลาไทย, ว่าง = ไม่จำกัด)
-- เปิดรับจริง = สวิตช์ live เปิด และวันนี้อยู่ในช่วง (รวมวันเริ่มและวันสุดท้าย) — หน้าสมาชิกซ่อนปุ่มนอกช่วงเอง
-- ไม่ต้องจำปิด: หมดช่วงแล้วปุ่มหายและส่งใบเสร็จไม่ได้ทันที

insert into loyalty.settings (key, value) values ('live_from', '""'), ('live_until', '""') on conflict (key) do nothing;

-- yyyy-mm-dd ที่เป็นวันจริง (เช่น 2026-02-30 = ไม่ใช่)
create or replace function loyalty.is_date(t text)
returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  return t ~ '^\d{4}-\d{2}-\d{2}$' and to_char(t::date, 'YYYY-MM-DD') = t;
exception when others then
  return false;
end $$;

create or replace function public.loyalty_public_config()
returns jsonb
language sql stable security definer set search_path = '' as $$
  with c as (
    select coalesce((loyalty.setting('live'))::text = 'true', false) as sw,
           nullif(loyalty.setting('live_from') #>> '{}', '') as f,
           nullif(loyalty.setting('live_until') #>> '{}', '') as u,
           (now() at time zone 'Asia/Bangkok')::date as today
  )
  select jsonb_build_object(
    'live', c.sw and (c.f is null or c.today >= c.f::date) and (c.u is null or c.today <= c.u::date),
    'liveSwitch', c.sw, 'liveFrom', coalesce(c.f, ''), 'liveUntil', coalesce(c.u, ''),
    'liveReason', case when not c.sw then 'off'
                       when c.f is not null and c.today < c.f::date then 'not_started'
                       when c.u is not null and c.today > c.u::date then 'ended'
                       else 'open' end,
    'bahtPerPoint', loyalty.setting('baht_per_point'),
    'maxPerDay', loyalty.setting('max_per_day'),
    'maxReceiptAgeDays', loyalty.setting('max_receipt_age_days'),
    'survey', loyalty.setting('survey'))
  from c
$$;

create or replace function public.loyalty_settings_get()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'settings', coalesce((select jsonb_object_agg(key, value) from loyalty.settings
                           where key in ('admin_group_id', 'live', 'live_from', 'live_until', 'baht_per_point', 'count_spend', 'max_receipt_age_days', 'max_per_day',
                                         'auto_approve', 'notify_customer_reject', 'sender', 'product_keywords', 'survey')),
                         '{}'::jsonb),
    'links', public.loyalty_admin_links(),
    'status', public.loyalty_public_config() - 'survey',
    'stats', jsonb_build_object(
      'total', (select count(*) from loyalty.receipts),
      'approved', (select count(*) from loyalty.receipts where status = 'approved'),
      'rejected', (select count(*) from loyalty.receipts where status = 'rejected'),
      'pointsGiven', (select coalesce(sum(points), 0) from loyalty.receipts where status = 'approved'),
      'emochaAmount', (select coalesce(sum(emocha_amount), 0) from loyalty.receipts where status = 'approved')),
    -- สรุปแบบสอบถาม: คำถาม -> [{ answer, count }]
    'surveySummary', coalesce((select jsonb_object_agg(question, answers) from (
        select question, jsonb_agg(jsonb_build_object('answer', answer, 'count', n) order by n desc) as answers
          from (select question, answer, count(*) as n from loyalty.v_survey_answers
                 where status <> 'rejected' group by 1, 2) x
         group by question) y), '{}'::jsonb))
$$;

create or replace function public.loyalty_settings_save(p jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  k text;
  v jsonb;
  q jsonb;
  n numeric;
  ids text[] := '{}';
begin
  if jsonb_typeof(p) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'ข้อมูลไม่ถูกต้อง');
  end if;
  for k, v in select * from jsonb_each(p) loop
    if k in ('live', 'count_spend', 'auto_approve', 'notify_customer_reject') then
      if jsonb_typeof(v) <> 'boolean' then return jsonb_build_object('ok', false, 'error', k || ' ต้องเป็นเปิด/ปิด'); end if;
    elsif k in ('baht_per_point', 'max_receipt_age_days', 'max_per_day') then
      if jsonb_typeof(v) <> 'number' then return jsonb_build_object('ok', false, 'error', k || ' ต้องเป็นตัวเลข'); end if;
      n := (v #>> '{}')::numeric;
      if (k = 'baht_per_point' and (n < 1 or n > 100000))
         or (k = 'max_receipt_age_days' and (n < 1 or n > 3650 or n <> trunc(n)))
         or (k = 'max_per_day' and (n < 1 or n > 100 or n <> trunc(n))) then
        return jsonb_build_object('ok', false, 'error', 'ค่า ' || k || ' อยู่นอกช่วงที่ใช้ได้');
      end if;
    elsif k in ('live_from', 'live_until') then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}' <> '' and not loyalty.is_date(v #>> '{}')) then
        return jsonb_build_object('ok', false, 'error', 'วันที่ไม่ถูกต้อง');
      end if;
    elsif k = 'admin_group_id' then
      if jsonb_typeof(v) <> 'string' or (btrim(v #>> '{}') <> '' and btrim(v #>> '{}') !~ '^[CRU][0-9a-f]{32}$') then
        return jsonb_build_object('ok', false, 'error', 'Group ID ต้องขึ้นต้นด้วย C ตามด้วยตัวอักษร 32 ตัว (หรือเว้นว่าง)');
      end if;
      v := to_jsonb(btrim(v #>> '{}'));
      p := jsonb_set(p, array[k], v);
    elsif k = 'sender' then
      if jsonb_typeof(v) <> 'object'
         or exists (select 1 from jsonb_each(v) e where e.key not in ('name', 'phone', 'address') or jsonb_typeof(e.value) <> 'string') then
        return jsonb_build_object('ok', false, 'error', 'ข้อมูลผู้ส่งไม่ถูกต้อง');
      end if;
    elsif k = 'product_keywords' then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) = 0
         or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string' or btrim(e #>> '{}') = '') then
        return jsonb_build_object('ok', false, 'error', 'คำค้นสินค้าต้องมีอย่างน้อย 1 คำ');
      end if;
    elsif k = 'survey' then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 10 then
        return jsonb_build_object('ok', false, 'error', 'แบบสอบถามมีได้ไม่เกิน 10 ข้อ');
      end if;
      for q in select * from jsonb_array_elements(v) loop
        if jsonb_typeof(q) <> 'object' or coalesce(q ->> 'id', '') !~ '^[a-z0-9_]{1,30}$'
           or btrim(coalesce(q ->> 'q', '')) = '' or coalesce(q ->> 'type', '') not in ('single', 'multi')
           or jsonb_typeof(q -> 'required') <> 'boolean' or jsonb_typeof(q -> 'options') <> 'array'
           or jsonb_array_length(q -> 'options') < 2 or jsonb_array_length(q -> 'options') > 20
           or exists (select 1 from jsonb_array_elements(q -> 'options') o where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '') then
          return jsonb_build_object('ok', false, 'error', 'คำถาม "' || coalesce(q ->> 'q', '') || '" ต้องมีข้อความและตัวเลือกอย่างน้อย 2 ข้อ');
        end if;
        if (q ->> 'id') = any (ids) then return jsonb_build_object('ok', false, 'error', 'รหัสคำถามซ้ำ'); end if;
        ids := ids || (q ->> 'id');
      end loop;
    else
      return jsonb_build_object('ok', false, 'error', 'ไม่รู้จักค่าตั้ง ' || k);
    end if;
  end loop;
  if coalesce(p ->> 'live_from', loyalty.setting('live_from') #>> '{}', '') <> ''
     and coalesce(p ->> 'live_until', loyalty.setting('live_until') #>> '{}', '') <> ''
     and coalesce(p ->> 'live_until', loyalty.setting('live_until') #>> '{}') < coalesce(p ->> 'live_from', loyalty.setting('live_from') #>> '{}') then
    return jsonb_build_object('ok', false, 'error', 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
  end if;
  insert into loyalty.settings (key, value) select key, value from jsonb_each(p)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true) || public.loyalty_settings_get();
end $$;

revoke all on function public.loyalty_public_config() from public, anon, authenticated;
grant execute on function public.loyalty_public_config() to service_role;
revoke all on function public.loyalty_settings_get() from public, anon, authenticated;
grant execute on function public.loyalty_settings_get() to service_role;
revoke all on function public.loyalty_settings_save(jsonb) from public, anon, authenticated;
grant execute on function public.loyalty_settings_save(jsonb) to service_role;
