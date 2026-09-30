-- หน้าแอดมินเดิม (Apps Script) -> เมนู "ใบเสร็จ 7-Eleven & ของพรีเมียม" + หน้าตั้งค่า loyaltySettings.html
--
-- loyalty_admin_links()   ลิงก์ (มีโทเคน) ไปหน้าตรวจใบเสร็จ / ใบจัดส่ง / ตั้งค่า + จำนวนที่ค้าง
--                         Apps Script เรียกหลังตรวจ PIN / ตั๋วแอดมินแล้วเท่านั้น
-- loyalty_settings_get()  ค่าตั้งที่แก้ได้ (ไม่รวม link_secret / pages_base / ai_model)
-- loyalty_settings_save() ตรวจชนิด/ช่วงค่าทุกช่องก่อนบันทึก
--
-- กลุ่ม LINE ที่รับแจ้งเตือนใบเสร็จ/ของพรีเมียม: ค่าตั้ง admin_group_id (ว่าง = ยังไม่ส่งเข้ากลุ่ม
-- งานแจ้งกลุ่มค้างไว้ในคิว พอใส่ Group ID แล้วส่งตามให้ครบ) — คิวนับ attempts เฉพาะครั้งที่ผิดพลาด

insert into loyalty.settings (key, value) values ('admin_group_id', '""') on conflict (key) do nothing;

create or replace function public.loyalty_admin_links()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'receipts', loyalty.link('receiptReview.html', 'rl', '-'),
    'shipments', loyalty.link('shippingLabel.html', 'sl', '-'),
    'settings', loyalty.link('loyaltySettings.html', 'cfg', '-'),
    'pendingReceipts', (select count(*) from loyalty.receipts where status = 'pending_review'),
    'pendingShipments', (select count(*) from loyalty.shipments where status in ('pending', 'printed')))
$$;

create or replace function public.loyalty_settings_get()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'settings', coalesce((select jsonb_object_agg(key, value) from loyalty.settings
                           where key in ('admin_group_id', 'live', 'baht_per_point', 'count_spend', 'max_receipt_age_days', 'max_per_day',
                                         'auto_approve', 'notify_customer_reject', 'sender', 'product_keywords', 'survey')),
                         '{}'::jsonb),
    'links', public.loyalty_admin_links(),
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
  insert into loyalty.settings (key, value) select key, value from jsonb_each(p)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true) || public.loyalty_settings_get();
end $$;


-- คิวงานของ Apps Script (แทนตัวเดิม): ไม่มี Group ID = ไม่รับงานที่มีแค่ "แจ้งกลุ่ม" (ค้างไว้จนตั้งค่า)
-- attempts นับเฉพาะครั้งที่ผิดพลาด (loyalty_work_update ที่มี last_error)
create or replace function public.loyalty_work_claim(p_limit int)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_receipts jsonb;
  v_ships jsonb;
  v_reject_notify boolean := (loyalty.setting('notify_customer_reject'))::text = 'true';
  v_group text := coalesce(loyalty.setting('admin_group_id') #>> '{}', '');
  v_has_group boolean := v_group <> '';
begin
  with c as (
    update loyalty.receipts q set claimed_at = now()
     where q.id in (
       select r.id from loyalty.receipts r
        where r.attempts < 20
          and (r.claimed_at is null or r.claimed_at < now() - interval '2 minutes')
          and r.created_at > now() - interval '60 days'
          and ((v_has_group and r.admin_notified_at is null)
               or (v_has_group and r.reviewed_at is not null and r.decision_notified_at is null)
               or (r.status = 'approved' and r.points_written_at is null)
               or (r.customer_notified_at is null and r.reviewed_at is not null
                   and ((r.status = 'approved' and r.points_written_at is not null)
                        or (r.status = 'rejected' and v_reject_notify))))
        order by r.seq
        limit greatest(p_limit, 1)
        for update skip locked)
    returning q.*
  )
  select coalesce(jsonb_agg(loyalty.receipt_json(c) || jsonb_build_object(
           'reviewLink', loyalty.link('receiptReview.html', 'r', c.id::text),
           'listLink', loyalty.link('receiptReview.html', 'rl', '-'),
           'countSpend', (loyalty.setting('count_spend'))::text = 'true',
           'memberLiffUrl', loyalty.setting('member_liff_url') #>> '{}',
           'attempts', c.attempts,
           'needs', jsonb_build_object(
             'admin', v_has_group and c.admin_notified_at is null,
             'decision', v_has_group and c.reviewed_at is not null and c.decision_notified_at is null,
             'points', c.status = 'approved' and c.points_written_at is null,
             'customer', c.customer_notified_at is null and c.reviewed_at is not null
                         and ((c.status = 'approved') or (c.status = 'rejected' and v_reject_notify))))
           order by c.seq), '[]'::jsonb)
    into v_receipts from c;

  with c as (
    update loyalty.shipments q set claimed_at = now()
     where q.id in (
       select s.id from loyalty.shipments s
        where s.attempts < 20
          and (s.claimed_at is null or s.claimed_at < now() - interval '2 minutes')
          and ((v_has_group and s.admin_notified_at is null)
               or (s.status = 'shipped' and s.customer_notified_at is null))
        order by s.seq
        limit greatest(p_limit, 1)
        for update skip locked)
    returning q.*
  )
  select coalesce(jsonb_agg(loyalty.shipment_json(c) || jsonb_build_object(
           'labelLink', loyalty.link('shippingLabel.html', 's', c.id::text),
           'listLink', loyalty.link('shippingLabel.html', 'sl', '-'),
           'memberLiffUrl', loyalty.setting('member_liff_url') #>> '{}',
           'attempts', c.attempts,
           'needs', jsonb_build_object('admin', v_has_group and c.admin_notified_at is null,
                                       'customer', c.status = 'shipped' and c.customer_notified_at is null))
           order by c.seq), '[]'::jsonb)
    into v_ships from c;

  return jsonb_build_object('adminGroupId', v_group, 'receipts', v_receipts, 'shipments', v_ships);
end $$;

create or replace function public.loyalty_work_update(p_kind text, p_id uuid, p_patch jsonb)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_err boolean := p_patch ? 'last_error' and p_patch ->> 'last_error' is not null;
begin
  if p_kind = 'receipt' then
    update loyalty.receipts q set
      admin_notified_at = case when (p_patch ->> 'admin_notified')::boolean then coalesce(q.admin_notified_at, now())
                               else q.admin_notified_at end,
      decision_notified_at = case when (p_patch ->> 'decision_notified')::boolean
                                  then coalesce(q.decision_notified_at, now()) else q.decision_notified_at end,
      points_written_at = case when (p_patch ->> 'points_written')::boolean then coalesce(q.points_written_at, now())
                               else q.points_written_at end,
      balance_after = coalesce((p_patch ->> 'balance_after')::int, q.balance_after),
      customer_notified_at = case when (p_patch ->> 'customer_notified')::boolean
                                  then coalesce(q.customer_notified_at, now()) else q.customer_notified_at end,
      last_error = case when p_patch ? 'last_error' then p_patch ->> 'last_error' else q.last_error end,
      attempts = q.attempts + case when v_err then 1 else 0 end,
      claimed_at = case when (p_patch ->> 'release')::boolean then null else q.claimed_at end
    where q.id = p_id;
  elsif p_kind = 'shipment' then
    update loyalty.shipments q set
      admin_notified_at = case when (p_patch ->> 'admin_notified')::boolean then coalesce(q.admin_notified_at, now())
                               else q.admin_notified_at end,
      customer_notified_at = case when (p_patch ->> 'customer_notified')::boolean
                                  then coalesce(q.customer_notified_at, now()) else q.customer_notified_at end,
      last_error = case when p_patch ? 'last_error' then p_patch ->> 'last_error' else q.last_error end,
      attempts = q.attempts + case when v_err then 1 else 0 end,
      claimed_at = case when (p_patch ->> 'release')::boolean then null else q.claimed_at end
    where q.id = p_id;
  end if;
end $$;

-- บันทึกใบจัดส่ง + คืน Group ID ให้ Apps Script แจ้งกลุ่มทันที (ว่าง = คิวส่งให้ภายหลัง)
create or replace function public.loyalty_shipment_add(p_row jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
  v_seq bigint;
begin
  insert into loyalty.shipments (ref, line_uid, member_code, reward_name, category, qty, points_used,
                                 recipient_name, recipient_phone, address, province)
  values ('PM-pending-' || gen_random_uuid(), p_row ->> 'line_uid', p_row ->> 'member_code', p_row ->> 'reward_name',
          p_row ->> 'category', greatest(coalesce((p_row ->> 'qty')::int, 1), 1), (p_row ->> 'points_used')::int,
          p_row ->> 'recipient_name', p_row ->> 'recipient_phone', p_row ->> 'address', p_row ->> 'province')
  returning id, seq into v_id, v_seq;
  update loyalty.shipments set ref = 'PM-' || lpad(v_seq::text, 5, '0') where id = v_id;
  return (select loyalty.shipment_json(s) || jsonb_build_object(
                   'labelLink', loyalty.link('shippingLabel.html', 's', s.id::text),
                   'listLink', loyalty.link('shippingLabel.html', 'sl', '-'),
                   'adminGroupId', coalesce(loyalty.setting('admin_group_id') #>> '{}', ''))
            from loyalty.shipments s where s.id = v_id);
end $$;

do $$
declare f text;
begin
  foreach f in array array['loyalty_admin_links()', 'loyalty_settings_get()', 'loyalty_settings_save(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
