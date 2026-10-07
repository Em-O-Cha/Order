-- ⚡ เพิ่ม (7/10/69) — ใบเสร็จ 7-Eleven ที่วันที่ซื้อย้อนหลังจากวันที่ส่งเกิน max_receipt_age_days วัน (ตั้งเป็น 7)
--   ไม่อนุมัติทันทีตอนส่ง เหตุผล "ใบเสร็จที่สามารถนำมาสะสมคะแนนได้ต้องไม่เกิน 7 วัน" (ลูกค้าเห็นบนหน้าจอ + LINE)
--   ซื้อวันที่ 1 ส่งได้ถึงวันที่ 8 — เดิมใบเก่าแค่ติดธงให้แอดมินดู

update loyalty.settings set value = '7' where key = 'max_receipt_age_days';

create or replace function public.loyalty_receipt_insert(p_row jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dup loyalty.receipts;
  v_loose text;
  v_flags jsonb := coalesce(p_row -> 'ai_flags', '[]'::jsonb);
  v_verdict text := coalesce(p_row ->> 'ai_verdict', 'unchecked');
  v_status text := 'pending_review';
  v_note text;
  v_points int;
  v_reviewer text;
  v_reviewed timestamptz;
  v_id uuid;
  v_seq bigint;
  v_ym text;
  v_no int;
  v_ref text;
  v_max_age int := greatest(coalesce((loyalty.setting('max_receipt_age_days') #>> '{}')::int, 7), 1);
  v_age int;
begin
  perform pg_advisory_xact_lock(hashtextextended('loyalty_receipt_insert', 0));

  select * into v_dup from loyalty.receipts where client_key = p_row ->> 'client_key';
  if found then
    return jsonb_build_object('ok', true, 'existing', true, 'receipt', loyalty.receipt_json(v_dup));
  end if;

  select * into v_dup from loyalty.receipts r
   where r.status <> 'rejected'
     and ((p_row ->> 'file_sha256' is not null and r.file_sha256 = p_row ->> 'file_sha256')
       or (p_row ->> 'receipt_key' is not null and r.receipt_key = p_row ->> 'receipt_key'))
   order by r.created_at limit 1;
  if found then
    v_status := 'rejected';
    v_verdict := 'fail';
    v_note := 'ใบเสร็จซ้ำกับ ' || v_dup.ref || ' ที่ส่งเข้ามาแล้ว';
    v_flags := jsonb_build_array(v_note) || v_flags;
  else
    select string_agg(r.ref, ', ') into v_loose from loyalty.receipts r
     where r.status <> 'rejected' and p_row ->> 'loose_key' is not null and r.loose_key = p_row ->> 'loose_key';
    if v_loose is not null then
      v_flags := jsonb_build_array('เลขที่ใบเสร็จและวันที่ตรงกับ ' || v_loose || ' (อาจเป็นใบเดียวกัน)') || v_flags;
      if v_verdict = 'pass' then v_verdict := 'suspect'; end if;
    end if;
  end if;

  -- วันที่ซื้อ (ที่ AI อ่านได้) ย้อนหลังจากวันที่ส่งเกิน max_receipt_age_days วัน (นับตามวันที่เวลาไทย) = ไม่อนุมัติเลย
  -- ไม่เห็นวันที่ = ให้แอดมินตรวจเอง, แอดมินกดอนุมัติทับได้ถ้า AI อ่านวันที่ผิด
  if v_status = 'pending_review' and p_row ->> 'receipt_at' is not null then
    v_age := (now() at time zone 'Asia/Bangkok')::date
             - ((p_row ->> 'receipt_at')::timestamptz at time zone 'Asia/Bangkok')::date;
    if v_age > v_max_age then
      v_status := 'rejected';
      v_note := 'ใบเสร็จที่สามารถนำมาสะสมคะแนนได้ต้องไม่เกิน ' || v_max_age || ' วัน';
      v_reviewer := 'ระบบ (อัตโนมัติ)';
      v_reviewed := now();
      v_flags := jsonb_build_array('ซื้อก่อนวันที่ส่ง ' || v_age || ' วัน (เกิน ' || v_max_age || ' วัน)') || v_flags;
    end if;
  end if;

  if v_status = 'pending_review' and v_verdict = 'pass' and (loyalty.setting('auto_approve'))::text = 'true'
     and coalesce((p_row ->> 'suggested_points')::int, 0) > 0 then
    v_status := 'approved';
    v_points := (p_row ->> 'suggested_points')::int;
    v_reviewer := 'AI (อนุมัติอัตโนมัติ)';
    v_reviewed := now();
  end if;

  insert into loyalty.receipts (
    ref, client_key, line_uid, member, survey, file_path, file_mime, file_name, file_size, file_sha256,
    preview_path, preview_url, receipt_no, receipt_key, loose_key, store, receipt_at, receipt_total,
    emocha_amount, emocha_items, ai, ai_verdict, ai_flags, suggested_points, duplicate_of,
    status, points, review_note, reviewer, reviewed_at)
  values (
    'R7-pending-' || gen_random_uuid(), p_row ->> 'client_key', p_row ->> 'line_uid',
    coalesce(p_row -> 'member', '{}'), coalesce(p_row -> 'survey', '{}'),
    p_row ->> 'file_path', p_row ->> 'file_mime', p_row ->> 'file_name', (p_row ->> 'file_size')::int,
    p_row ->> 'file_sha256', p_row ->> 'preview_path', p_row ->> 'preview_url', p_row ->> 'receipt_no',
    p_row ->> 'receipt_key', p_row ->> 'loose_key',
    p_row ->> 'store', (p_row ->> 'receipt_at')::timestamptz, (p_row ->> 'receipt_total')::numeric,
    (p_row ->> 'emocha_amount')::numeric, p_row -> 'emocha_items', p_row -> 'ai', v_verdict, v_flags,
    coalesce((p_row ->> 'suggested_points')::int, 0), v_dup.id, v_status, v_points, v_note, v_reviewer, v_reviewed)
  returning id, seq into v_id, v_seq;
  v_ym := to_char(now() at time zone 'Asia/Bangkok', 'MM')
        || (extract(year from now() at time zone 'Asia/Bangkok')::int + 543)::text;
  select coalesce(max(right(r.ref, 5)::int), 0) + 1 into v_no
    from loyalty.receipts r where r.ref ~ ('^7E' || v_ym || '[0-9]{5}$');
  v_ref := '7E' || v_ym || lpad(v_no::text, 5, '0');
  update loyalty.receipts set ref = v_ref where id = v_id;

  return jsonb_build_object('ok', true, 'receipt',
    (select loyalty.receipt_json(r) from loyalty.receipts r where r.id = v_id));
end $$;

