-- ⚡ แก้ (7/10/69) — โปรคะแนนพิเศษ 1 โปรใช้กับสินค้าได้หลายตัว: name = ชื่อโปร, keywords = สินค้าที่ร่วมโปร (สูงสุด 30)

create or replace function public.loyalty_settings_save(p jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  k text;
  v jsonb;
  q jsonb;
  n numeric;
  ids text[] := '{}';
  pr jsonb;
  pids text[] := '{}';
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
    elsif k = 'point_promos' then
      -- [{ id, name (ชื่อโปร), keywords: [สินค้าที่ร่วมโปร..], multiplier, from, until, active }]
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 20 then
        return jsonb_build_object('ok', false, 'error', 'โปรคะแนนพิเศษมีได้ไม่เกิน 20 รายการ');
      end if;
      for pr in select * from jsonb_array_elements(v) loop
        if jsonb_typeof(pr) <> 'object' or coalesce(pr ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,40}$'
           or btrim(coalesce(pr ->> 'name', '')) = '' or length(pr ->> 'name') > 80
           or jsonb_typeof(pr -> 'active') <> 'boolean' then
          return jsonb_build_object('ok', false, 'error', 'โปรคะแนนพิเศษ: กรุณาใส่ชื่อโปร');
        end if;
        if jsonb_typeof(pr -> 'keywords') <> 'array' or jsonb_array_length(pr -> 'keywords') = 0
           or jsonb_array_length(pr -> 'keywords') > 30
           or exists (select 1 from jsonb_array_elements(pr -> 'keywords') e
                       where jsonb_typeof(e) <> 'string' or btrim(e #>> '{}') = '' or length(e #>> '{}') > 80) then
          return jsonb_build_object('ok', false, 'error', 'โปร "' || (pr ->> 'name') || '": ใส่สินค้าที่ร่วมโปร 1-30 รายการ');
        end if;
        if jsonb_typeof(pr -> 'multiplier') <> 'number' or (pr ->> 'multiplier')::numeric <= 1
           or (pr ->> 'multiplier')::numeric > 10 then
          return jsonb_build_object('ok', false, 'error', 'โปร "' || (pr ->> 'name') || '": คูณคะแนนได้มากกว่า 1 ถึง 10 เท่า');
        end if;
        if jsonb_typeof(pr -> 'from') <> 'string' or jsonb_typeof(pr -> 'until') <> 'string'
           or ((pr ->> 'from') <> '' and not loyalty.is_date(pr ->> 'from'))
           or ((pr ->> 'until') <> '' and not loyalty.is_date(pr ->> 'until'))
           or ((pr ->> 'from') <> '' and (pr ->> 'until') <> '' and (pr ->> 'until') < (pr ->> 'from')) then
          return jsonb_build_object('ok', false, 'error', 'โปร "' || (pr ->> 'name') || '": วันที่ไม่ถูกต้อง');
        end if;
        if (pr ->> 'id') = any (pids) then return jsonb_build_object('ok', false, 'error', 'รหัสโปรซ้ำ'); end if;
        pids := pids || (pr ->> 'id');
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

revoke all on function public.loyalty_settings_save(jsonb) from public, anon, authenticated;
grant execute on function public.loyalty_settings_save(jsonb) to service_role;
