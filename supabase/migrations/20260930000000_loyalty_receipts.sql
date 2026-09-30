-- สะสมคะแนนจากใบเสร็จ 7-Eleven + แจ้งแลกของพรีเมียม/พิมพ์ใบจัดส่ง
--
-- ลูกค้ากดโลโก้ 7-Eleven ที่หน้าสมาชิก -> ตอบแบบสอบถาม + แนบใบเสร็จ -> Edge Function "loyalty" เก็บไฟล์
-- (bucket receipts), ให้ AI อ่าน/ตรวจใบเสร็จ, ตรวจซ้ำ แล้วบันทึกลง loyalty.receipts -> Apps Script ส่ง Flex
-- เข้ากลุ่มแอดมิน (ผ่าน/ไม่ผ่านก็แจ้ง) -> แอดมินกดลิงก์ในกลุ่มเปิดหน้า receiptReview.html อนุมัติ/ไม่อนุมัติ ->
-- Apps Script เพิ่มคะแนนลงชีต Members + Points_Log แล้วส่ง Flex แจ้งลูกค้า
--
-- ของพรีเมียม: Apps Script (ห่อ redeemReward) บันทึกลง loyalty.shipments แล้วแจ้งกลุ่มแอดมินพร้อมลิงก์
-- shippingLabel.html พิมพ์ใบจัดส่ง
--
-- ลิงก์ในกลุ่มแอดมินใช้โทเคน HMAC (ความลับอยู่ใน loyalty.settings ไม่ออกนอกฐานข้อมูล)
-- ทุกอย่างเรียกได้เฉพาะ service_role

create schema if not exists loyalty;
revoke all on schema loyalty from public, anon, authenticated;
grant usage on schema loyalty to service_role;

-- ---------------------------------------------------------------------------
-- ตั้งค่า
-- ---------------------------------------------------------------------------
create table if not exists loyalty.settings (
  key   text  primary key,
  value jsonb not null
);
alter table loyalty.settings enable row level security;

insert into loyalty.settings (key, value) values
  ('live', 'true'),                         -- ปิด = หน้าสมาชิกแจ้งว่ายังไม่เปิดรับใบเสร็จ
  ('baht_per_point', '30'),                 -- ยอดสินค้าเอมโอชาทุก 30 บาท = 1 คะแนน (แอดมินแก้คะแนนได้ตอนอนุมัติ)
  ('count_spend', 'false'),                 -- true = นับยอดสินค้าเอมโอชาในใบเสร็จเข้ายอดซื้อสะสม (มีผลกับระดับสมาชิก)
  ('max_receipt_age_days', '30'),           -- ใบเสร็จเก่ากว่านี้ = ติดธงให้แอดมินดู
  ('max_per_day', '5'),                     -- ส่งได้ไม่เกินกี่ใบต่อวันต่อคน
  ('auto_approve', 'false'),                -- true = AI ตรวจผ่านทุกข้อแล้วอนุมัติ+ให้คะแนนเลย (แอดมินยังเห็นในกลุ่ม)
  ('notify_customer_reject', 'true'),       -- แจ้งลูกค้าทาง LINE เมื่อแอดมินกดไม่อนุมัติ
  ('ai_model', '"claude-opus-5-5"'),
  ('pages_base', '"https://em-o-cha.github.io/Order/"'),
  ('member_liff_url', '"https://liff.line.me/2010892131-hMnmdrmH"'),
  ('link_secret', to_jsonb(encode(extensions.gen_random_bytes(32), 'hex'))),
  -- ผู้ส่งบนใบจัดส่งของพรีเมียม
  ('sender', '{"name": "เอมโอชา (Em-O-Cha)", "phone": "", "address": ""}'),
  -- คำที่ใช้หาสินค้าเอมโอชาในใบเสร็จ (บอก AI)
  ('product_keywords', '["เอมโอชา", "EM-O-CHA", "EMOCHA", "น้ำพริกน้ำย้อย", "น้ำย้อย", "ลงเรือ", "ตะไคร้หอม",
                         "ปลาดุกฟู", "ก๋วยเตี๋ยวเรือ", "ก๋วยเตี๋ยวแห้ง", "หมี่คลุก", "หมี่ชมพู", "หนังแซลม่อน",
                         "พริกผัดน้ำมัน", "หม่าล่า", "รำข้าว"]'),
  -- แบบสอบถาม: type single = เลือกได้ข้อเดียว, multi = ติ๊กได้หลายข้อ; ข้อ channel ส่งให้ AI เป็นข้อมูลประกอบ
  ('survey', '[
    {"id": "channel", "q": "ซื้อผ่านช่องทางไหน", "type": "single", "required": true,
     "options": ["ร้าน 7-Eleven (หน้าร้าน)", "7-Delivery / แอป 7-Eleven", "ALL Online", "ช่องทางอื่นของ 7-Eleven"]},
    {"id": "products", "q": "ซื้อสินค้าเอมโอชาอะไรบ้าง", "type": "multi", "required": true,
     "options": ["น้ำพริกน้ำย้อย", "น้ำพริกลงเรือกรอบ", "น้ำพริกตะไคร้หอม", "น้ำพริกปลาดุกฟูผัดพริกขิง",
                 "ก๋วยเตี๋ยวเรือ / ก๋วยเตี๋ยวแห้ง", "หมี่คลุก / หมี่ชมพู น้ำพริกหนังแซลม่อน", "อื่นๆ"]},
    {"id": "source", "q": "รู้จักสินค้าเอมโอชาใน 7-Eleven จากที่ไหน", "type": "multi", "required": true,
     "options": ["เห็นที่ชั้นวางในร้าน", "LINE เอมโอชา", "Facebook", "TikTok", "เพื่อน / ครอบครัวแนะนำ", "อื่นๆ"]},
    {"id": "purpose", "q": "ซื้อไปเพื่อ", "type": "multi", "required": true,
     "options": ["ทานเอง", "ทานกับครอบครัว", "ซื้อเป็นของฝาก", "ติดบ้านไว้ / สำรองอาหาร"]},
    {"id": "frequency", "q": "ซื้อสินค้าเอมโอชาที่ 7-Eleven บ่อยแค่ไหน", "type": "single", "required": true,
     "options": ["ครั้งแรก", "เดือนละ 1-2 ครั้ง", "สัปดาห์ละครั้ง", "มากกว่าสัปดาห์ละครั้ง"]}
  ]')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- ใบเสร็จ
-- ---------------------------------------------------------------------------
create table if not exists loyalty.receipts (
  id             uuid        primary key default gen_random_uuid(),
  seq            bigint      generated always as identity,
  ref            text        not null unique,       -- เลขอ้างอิงที่คนเห็น R7-00001
  client_key     text        not null unique,       -- สุ่มต่อการกดส่ง 1 ครั้ง (กดซ้ำ/เน็ตหลุด = ใบเดิม)
  line_uid       text        not null,
  member         jsonb       not null default '{}', -- ชื่อ/เบอร์/รหัสสมาชิก ณ ตอนส่ง
  survey         jsonb       not null default '{}',
  -- ไฟล์ (bucket receipts)
  file_path      text,
  file_mime      text,
  file_name      text,
  file_size      int,
  file_sha256    text,
  preview_path   text,                              -- JPEG ย่อ (ใช้ให้ AI อ่าน และแสดงใน LINE)
  preview_url    text,                              -- signed URL อายุยาว ให้ LINE โหลดรูป
  -- ผลอ่านใบเสร็จ
  receipt_no     text,
  receipt_key    text,                              -- สาขา|เลขใบเสร็จ|วันที่ (ใช้ตรวจซ้ำ)
  loose_key      text,                              -- เลขใบเสร็จ|วันที่ (อาจซ้ำ)
  store          text,
  receipt_at     timestamptz,
  receipt_total  numeric,
  emocha_amount  numeric,
  emocha_items   jsonb,
  ai             jsonb,                             -- ผลเต็มจาก AI + ธงจากไฟล์
  ai_verdict     text        not null default 'unchecked'
                 check (ai_verdict in ('pass', 'suspect', 'fail', 'unchecked')),
  ai_flags       jsonb       not null default '[]', -- เหตุผลที่ต้องระวัง (ภาษาไทย)
  suggested_points int       not null default 0,
  duplicate_of   uuid,
  -- การตัดสิน
  status         text        not null default 'pending_review'
                 check (status in ('pending_review', 'approved', 'rejected')),
  points         int,
  review_note    text,
  reviewer       text,
  reviewed_at    timestamptz,
  -- งานของ Apps Script
  admin_notified_at     timestamptz,
  decision_notified_at  timestamptz,
  points_written_at     timestamptz,
  balance_after         int,
  customer_notified_at  timestamptz,
  claimed_at     timestamptz,
  attempts       int         not null default 0,
  last_error     text,
  created_at     timestamptz not null default now()
);
create unique index if not exists receipts_key_uniq on loyalty.receipts (receipt_key)
  where receipt_key is not null and status <> 'rejected';
create unique index if not exists receipts_sha_uniq on loyalty.receipts (file_sha256)
  where file_sha256 is not null and status <> 'rejected';
create index if not exists receipts_loose_idx on loyalty.receipts (loose_key) where loose_key is not null;
create index if not exists receipts_uid_idx on loyalty.receipts (line_uid, created_at desc);
create index if not exists receipts_status_idx on loyalty.receipts (status, created_at);
alter table loyalty.receipts enable row level security;

-- ---------------------------------------------------------------------------
-- ของพรีเมียมที่ต้องจัดส่ง
-- ---------------------------------------------------------------------------
create table if not exists loyalty.shipments (
  id              uuid        primary key default gen_random_uuid(),
  seq             bigint      generated always as identity,
  ref             text        not null unique,      -- PM-00001
  line_uid        text        not null,
  member_code     text,
  reward_name     text        not null,
  category        text,
  qty             int         not null default 1,
  points_used     int,
  recipient_name  text,
  recipient_phone text,
  address         text,
  province        text,
  status          text        not null default 'pending'
                  check (status in ('pending', 'printed', 'shipped', 'cancelled')),
  tracking_no     text,
  carrier         text,
  printed_at      timestamptz,
  shipped_at      timestamptz,
  admin_notified_at    timestamptz,
  customer_notified_at timestamptz,
  claimed_at      timestamptz,
  attempts        int         not null default 0,
  last_error      text,
  created_at      timestamptz not null default now()
);
create index if not exists shipments_status_idx on loyalty.shipments (status, created_at);
alter table loyalty.shipments enable row level security;

revoke all on all tables in schema loyalty from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema loyalty to service_role;

-- คำตอบแบบสอบถามแบบแถวละคำตอบ ไว้สรุปผล (select question, answer, count(*) ... group by 1, 2)
create or replace view loyalty.v_survey_answers with (security_invoker = true) as
  select r.ref, r.created_at, r.line_uid, r.status, q.key as question,
         coalesce(a.value, q.value) #>> '{}' as answer
    from loyalty.receipts r
    cross join lateral jsonb_each(r.survey) q
    left join lateral jsonb_array_elements(case when jsonb_typeof(q.value) = 'array' then q.value end) a on true;

-- ---------------------------------------------------------------------------
-- ไฟล์ใบเสร็จ (ส่วนตัว อ่านได้ผ่าน signed URL เท่านั้น)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('receipts', 'receipts', false, 15728640)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- ตัวช่วย
-- ---------------------------------------------------------------------------
create or replace function loyalty.setting(p_key text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from loyalty.settings where key = p_key
$$;

-- โทเคนของลิงก์แอดมิน: kind r = ใบเสร็จ 1 ใบ, rl = รายการรอตรวจทั้งหมด, s = ใบจัดส่ง 1 ใบ, sl = ใบจัดส่งทั้งหมด
create or replace function loyalty.link_token(p_kind text, p_id text)
returns text
language sql stable security definer set search_path = '' as $$
  select left(encode(extensions.hmac(p_kind || ':' || p_id, (select value #>> '{}' from loyalty.settings
                                                               where key = 'link_secret'), 'sha256'), 'hex'), 32)
$$;

create or replace function loyalty.link(p_page text, p_kind text, p_id text)
returns text
language sql stable security definer set search_path = '' as $$
  select (loyalty.setting('pages_base') #>> '{}') || p_page || '?' ||
         case when p_id = '-' then 'all=1' else 'id=' || p_id end || '&t=' || loyalty.link_token(p_kind, p_id)
$$;

-- ข้อมูลสมาชิกจากสำเนาชีต (หรือการสมัครที่ยังไม่ลงชีต)
create or replace function loyalty.member_of(p_uid text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object(
              'name', coalesce(nullif(r.data ->> 'ชื่อ-นามสกุล', ''), r.data ->> 'ชื่อที่แสดงใน LINE', ''),
              'displayName', coalesce(r.data ->> 'ชื่อที่แสดงใน LINE', ''),
              'phone', coalesce(mirror.phone(r.data ->> 'เบอร์โทร'), ''),
              'memberCode', coalesce(r.data ->> 'รหัสสมาชิก', ''),
              'tier', coalesce(r.data ->> 'ระดับ Tier', ''),
              'points', coalesce(mirror.num(r.data ->> 'แต้มสะสม'), 0),
              'address', coalesce(r.data ->> 'ที่อยู่จัดส่งล่าสุด', ''),
              'province', coalesce(r.data ->> 'จังหวัดล่าสุด', ''))
       from mirror.rows r
      where r.source = 'members' and r.tab = 'Members' and r.row_key = p_uid
      limit 1),
    (select jsonb_build_object(
              'name', coalesce(q.request ->> 'fullName', q.request ->> 'displayName', ''),
              'displayName', coalesce(q.request ->> 'displayName', ''),
              'phone', coalesce(q.phone, ''), 'memberCode', coalesce(q.member_code, ''), 'pendingSignup', true)
       from signup.requests q
      where q.line_uid = p_uid and q.status in ('pending_sheet', 'written') and not q.is_test
      limit 1))
$$;

create or replace function loyalty.receipt_json(r loyalty.receipts)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'ref', r.ref, 'lineUid', r.line_uid, 'member', r.member, 'survey', r.survey,
    'fileMime', r.file_mime, 'fileName', r.file_name, 'fileSize', r.file_size,
    'filePath', r.file_path, 'previewPath', r.preview_path, 'previewUrl', r.preview_url,
    'receiptNo', r.receipt_no, 'store', r.store, 'receiptAt', r.receipt_at, 'receiptTotal', r.receipt_total,
    'emochaAmount', r.emocha_amount, 'emochaItems', r.emocha_items, 'ai', r.ai, 'aiVerdict', r.ai_verdict,
    'aiFlags', r.ai_flags, 'suggestedPoints', r.suggested_points,
    'duplicateOf', (select d.ref from loyalty.receipts d where d.id = r.duplicate_of),
    'status', r.status, 'points', r.points, 'reviewNote', r.review_note, 'reviewer', r.reviewer,
    'reviewedAt', r.reviewed_at, 'pointsWrittenAt', r.points_written_at, 'balanceAfter', r.balance_after,
    'customerNotifiedAt', r.customer_notified_at, 'lastError', r.last_error, 'createdAt', r.created_at)
$$;

create or replace function loyalty.shipment_json(s loyalty.shipments)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'ref', s.ref, 'lineUid', s.line_uid, 'memberCode', s.member_code, 'rewardName', s.reward_name,
    'category', s.category, 'qty', s.qty, 'pointsUsed', s.points_used, 'recipientName', s.recipient_name,
    'recipientPhone', s.recipient_phone, 'address', s.address, 'province', s.province, 'status', s.status,
    'trackingNo', s.tracking_no, 'carrier', s.carrier, 'printedAt', s.printed_at, 'shippedAt', s.shipped_at,
    'createdAt', s.created_at)
$$;

-- ---------------------------------------------------------------------------
-- Edge Function: ลูกค้า
-- ---------------------------------------------------------------------------

-- ค่าตั้งที่หน้าสมาชิกเห็น (ไม่มีความลับ)
create or replace function public.loyalty_public_config()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'live', coalesce((loyalty.setting('live'))::text = 'true', false),
    'bahtPerPoint', loyalty.setting('baht_per_point'),
    'maxPerDay', loyalty.setting('max_per_day'),
    'maxReceiptAgeDays', loyalty.setting('max_receipt_age_days'),
    'survey', loyalty.setting('survey'))
$$;

-- ก่อนรับใบเสร็จ: ค่าตั้ง + สมาชิก + จำนวนที่ส่งวันนี้ + ใบเดิมของ client_key นี้ (ถ้ามี)
create or replace function public.loyalty_submit_prepare(p_uid text, p_client_key text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'config', public.loyalty_public_config(),
    'productKeywords', loyalty.setting('product_keywords'),
    'aiModel', loyalty.setting('ai_model'),
    'member', loyalty.member_of(p_uid),
    'todayCount', (select count(*) from loyalty.receipts r
                    where r.line_uid = p_uid
                      and r.created_at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'),
    'existing', (select loyalty.receipt_json(r) from loyalty.receipts r where r.client_key = p_client_key))
$$;

-- บันทึกใบเสร็จ: ตรวจซ้ำ (ไฟล์เดียวกัน / สาขา+เลขใบเสร็จ+วันที่เดียวกัน = ไม่อนุมัติอัตโนมัติ, เลขใบเสร็จ+วันที่
-- ตรงกันแต่สาขาต่าง/อ่านไม่ได้ = ติดธงอาจซ้ำ) ทำใต้ล็อกเดียวกันทุกใบ ไม่มีสองใบซ้ำกันหลุดพร้อมกัน
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
  v_ref text;
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
  v_ref := 'R7-' || lpad(v_seq::text, 5, '0');
  update loyalty.receipts set ref = v_ref where id = v_id;

  return jsonb_build_object('ok', true, 'receipt',
    (select loyalty.receipt_json(r) from loyalty.receipts r where r.id = v_id));
end $$;

-- ประวัติใบเสร็จของลูกค้า (หน้าสมาชิก) — ไม่ส่งผลตรวจของ AI ให้ลูกค้าเห็น
create or replace function public.loyalty_my_receipts(p_uid text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'config', public.loyalty_public_config(),
    'receipts', coalesce((select jsonb_agg(jsonb_build_object(
        'ref', r.ref, 'createdAt', r.created_at, 'status', r.status, 'points', r.points,
        'pointsAdded', r.points_written_at is not null, 'store', r.store, 'receiptAt', r.receipt_at,
        'note', case when r.status = 'rejected' then r.review_note end) order by r.created_at desc)
      from (select * from loyalty.receipts where line_uid = p_uid order by created_at desc limit 30) r), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- Edge Function: แอดมิน (ผ่านลิงก์ที่มีโทเคน)
-- ---------------------------------------------------------------------------
create or replace function public.loyalty_check_token(p_kind text, p_id text, p_token text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_token) = 32 and loyalty.link_token(p_kind, p_id) = p_token, false)
$$;

create or replace function public.loyalty_review_get(p_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'receipt', loyalty.receipt_json(r),
    'memberNow', loyalty.member_of(r.line_uid),
    'bahtPerPoint', loyalty.setting('baht_per_point'),
    'survey', loyalty.setting('survey'),
    -- ใบอื่นที่อาจเป็นใบเดียวกัน
    'related', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'ref', o.ref, 'status', o.status,
                                   'createdAt', o.created_at, 'memberName', o.member ->> 'name',
                                   'link', loyalty.link('receiptReview.html', 'r', o.id::text)))
                         from loyalty.receipts o
                        where o.id <> r.id
                          and (o.id = r.duplicate_of
                               or (r.loose_key is not null and o.loose_key = r.loose_key)
                               or (r.file_sha256 is not null and o.file_sha256 = r.file_sha256))), '[]'::jsonb),
    -- สถิติของลูกค้าคนนี้
    'history', (select jsonb_build_object(
                  'total', count(*), 'approved', count(*) filter (where o.status = 'approved'),
                  'rejected', count(*) filter (where o.status = 'rejected'),
                  'points30d', coalesce(sum(o.points) filter (where o.status = 'approved'
                                          and o.created_at > now() - interval '30 days'), 0))
                  from loyalty.receipts o where o.line_uid = r.line_uid and o.id <> r.id),
    'listLink', loyalty.link('receiptReview.html', 'rl', '-'))
    from loyalty.receipts r where r.id = p_id
$$;

create or replace function public.loyalty_review_list()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'ref', r.ref, 'createdAt', r.created_at, 'memberName', r.member ->> 'name',
           'memberCode', r.member ->> 'memberCode', 'status', r.status, 'aiVerdict', r.ai_verdict,
           'emochaAmount', r.emocha_amount, 'suggestedPoints', r.suggested_points, 'points', r.points,
           'link', loyalty.link('receiptReview.html', 'r', r.id::text))
           order by (r.status = 'pending_review') desc, r.created_at desc), '[]'::jsonb)
    from (select * from loyalty.receipts
           where status = 'pending_review' or created_at > now() - interval '7 days'
           order by created_at desc limit 200) r
$$;

-- อนุมัติ / ไม่อนุมัติ — ใบที่อนุมัติแล้วเปลี่ยนไม่ได้ (คะแนนเข้าไปแล้ว), ใบที่ไม่อนุมัติกลับมาอนุมัติได้
create or replace function public.loyalty_receipt_decide(p_id uuid, p_decision text, p_points int, p_note text,
                                                         p_reviewer text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r loyalty.receipts;
begin
  select * into r from loyalty.receipts where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'ไม่พบใบเสร็จ'); end if;
  if r.status = 'approved' then
    return jsonb_build_object('ok', false, 'error', 'ใบนี้อนุมัติไปแล้ว (' || coalesce(r.reviewer, '') || ')');
  end if;
  if p_decision = 'approve' then
    if coalesce(p_points, 0) <= 0 or p_points > 100000 then
      return jsonb_build_object('ok', false, 'error', 'กรุณาระบุคะแนนที่จะให้ (มากกว่า 0)');
    end if;
    begin
      update loyalty.receipts set
        status = 'approved', points = p_points, review_note = nullif(btrim(coalesce(p_note, '')), ''),
        reviewer = nullif(btrim(coalesce(p_reviewer, '')), ''), reviewed_at = now(),
        -- ใบที่ถูกตัดว่าซ้ำตอนส่งยังเก็บ receipt_key / file_sha256 ไว้ อนุมัติไม่ได้ถ้าใบเดิมยังไม่ถูกปฏิเสธ
        decision_notified_at = null, customer_notified_at = null, claimed_at = null, attempts = 0, last_error = null
      where id = p_id;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'มีใบเสร็จเดียวกันที่ยังไม่ถูกปฏิเสธอยู่แล้ว');
    end;
  elsif p_decision = 'reject' then
    if r.status = 'rejected' and r.reviewed_at is not null then
      return jsonb_build_object('ok', false, 'error', 'ใบนี้ไม่อนุมัติไปแล้ว');
    end if;
    update loyalty.receipts set
      status = 'rejected', points = null,
      review_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'ใบเสร็จไม่ผ่านการตรวจสอบ'),
      reviewer = nullif(btrim(coalesce(p_reviewer, '')), ''), reviewed_at = now(),
      decision_notified_at = null, customer_notified_at = null, claimed_at = null, attempts = 0, last_error = null
    where id = p_id;
  else
    return jsonb_build_object('ok', false, 'error', 'คำสั่งไม่ถูกต้อง');
  end if;
  return jsonb_build_object('ok', true, 'receipt', (select loyalty.receipt_json(x) from loyalty.receipts x where x.id = p_id));
end $$;

-- ---------------------------------------------------------------------------
-- Apps Script: คิวงาน (แจ้งกลุ่มแอดมิน / เขียนคะแนนลงชีต / แจ้งลูกค้า)
-- ---------------------------------------------------------------------------
create or replace function public.loyalty_work_claim(p_limit int)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_receipts jsonb;
  v_ships jsonb;
  v_reject_notify boolean := (loyalty.setting('notify_customer_reject'))::text = 'true';
begin
  with c as (
    update loyalty.receipts q set claimed_at = now(), attempts = q.attempts + 1
     where q.id in (
       select r.id from loyalty.receipts r
        where r.attempts < 20
          and (r.claimed_at is null or r.claimed_at < now() - interval '2 minutes')
          and r.created_at > now() - interval '60 days'
          and (r.admin_notified_at is null
               or (r.reviewed_at is not null and r.decision_notified_at is null)
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
           'notifyCustomerReject', v_reject_notify,
           'needs', jsonb_build_object(
             'admin', c.admin_notified_at is null,
             'decision', c.reviewed_at is not null and c.decision_notified_at is null,
             'points', c.status = 'approved' and c.points_written_at is null,
             'customer', c.customer_notified_at is null and c.reviewed_at is not null
                         and ((c.status = 'approved') or (c.status = 'rejected' and v_reject_notify))))
           order by c.seq), '[]'::jsonb)
    into v_receipts from c;

  with c as (
    update loyalty.shipments q set claimed_at = now(), attempts = q.attempts + 1
     where q.id in (
       select s.id from loyalty.shipments s
        where s.attempts < 20
          and (s.claimed_at is null or s.claimed_at < now() - interval '2 minutes')
          and (s.admin_notified_at is null
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
           'needs', jsonb_build_object('admin', c.admin_notified_at is null,
                                       'customer', c.status = 'shipped' and c.customer_notified_at is null))
           order by c.seq), '[]'::jsonb)
    into v_ships from c;

  return jsonb_build_object('receipts', v_receipts, 'shipments', v_ships);
end $$;

-- รายงานผล: p_patch = { admin_notified, decision_notified, points_written, balance_after, customer_notified,
--                        last_error, release }
create or replace function public.loyalty_work_update(p_kind text, p_id uuid, p_patch jsonb)
returns void
language plpgsql volatile security definer set search_path = '' as $$
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
      claimed_at = case when (p_patch ->> 'release')::boolean then null else q.claimed_at end
    where q.id = p_id;
  elsif p_kind = 'shipment' then
    update loyalty.shipments q set
      admin_notified_at = case when (p_patch ->> 'admin_notified')::boolean then coalesce(q.admin_notified_at, now())
                               else q.admin_notified_at end,
      customer_notified_at = case when (p_patch ->> 'customer_notified')::boolean
                                  then coalesce(q.customer_notified_at, now()) else q.customer_notified_at end,
      last_error = case when p_patch ? 'last_error' then p_patch ->> 'last_error' else q.last_error end,
      claimed_at = case when (p_patch ->> 'release')::boolean then null else q.claimed_at end
    where q.id = p_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ของพรีเมียม
-- ---------------------------------------------------------------------------
-- Apps Script บันทึกหลัง redeemReward สำเร็จ (หมวด premium)
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
                   'listLink', loyalty.link('shippingLabel.html', 'sl', '-'))
            from loyalty.shipments s where s.id = v_id);
end $$;

-- ใบจัดส่ง: 1 ใบ (p_id) หรือทั้งหมดที่ยังไม่ส่ง/ส่งภายใน 14 วัน (p_id null)
create or replace function public.loyalty_shipments_get(p_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sender', loyalty.setting('sender'),
    'listLink', loyalty.link('shippingLabel.html', 'sl', '-'),
    'shipments', coalesce((select jsonb_agg(loyalty.shipment_json(s) order by s.seq)
                             from loyalty.shipments s
                            where (p_id is not null and s.id = p_id)
                               or (p_id is null and (s.status in ('pending', 'printed')
                                                     or s.created_at > now() - interval '14 days'))), '[]'::jsonb))
$$;

create or replace function public.loyalty_shipment_update(p_id uuid, p_status text, p_tracking text, p_carrier text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_status not in ('printed', 'shipped', 'cancelled', 'pending') then
    return jsonb_build_object('ok', false, 'error', 'สถานะไม่ถูกต้อง');
  end if;
  update loyalty.shipments s set
    status = case when p_status = 'printed' and s.status in ('shipped', 'cancelled') then s.status else p_status end,
    printed_at = case when p_status in ('printed', 'shipped') then coalesce(s.printed_at, now()) else s.printed_at end,
    shipped_at = case when p_status = 'shipped' then coalesce(s.shipped_at, now()) else s.shipped_at end,
    tracking_no = coalesce(nullif(btrim(coalesce(p_tracking, '')), ''), s.tracking_no),
    carrier = coalesce(nullif(btrim(coalesce(p_carrier, '')), ''), s.carrier),
    claimed_at = case when p_status = 'shipped' then null else s.claimed_at end,
    attempts = case when p_status = 'shipped' then 0 else s.attempts end
  where s.id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'ไม่พบรายการ'); end if;
  return jsonb_build_object('ok', true, 'shipment', (select loyalty.shipment_json(s) from loyalty.shipments s where s.id = p_id));
end $$;

-- URL Web App "Members LINE" ที่ Edge Function ปลุกให้ทำงานคิว (ใช้ค่าเดียวกับการสมัคร/สั่งซื้อ)
create or replace function public.loyalty_apps_script_url()
returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select value #>> '{}' from signup.settings where key = 'apps_script_url'), '')
$$;

-- ---------------------------------------------------------------------------
-- สิทธิ์: ฟังก์ชัน public ทั้งหมดเรียกได้เฉพาะ service_role
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'loyalty_public_config()', 'loyalty_submit_prepare(text, text)', 'loyalty_receipt_insert(jsonb)',
    'loyalty_my_receipts(text)', 'loyalty_check_token(text, text, text)', 'loyalty_review_get(uuid)',
    'loyalty_review_list()', 'loyalty_receipt_decide(uuid, text, int, text, text)', 'loyalty_work_claim(int)',
    'loyalty_work_update(text, uuid, jsonb)', 'loyalty_shipment_add(jsonb)', 'loyalty_shipments_get(uuid)',
    'loyalty_shipment_update(uuid, text, text, text)', 'loyalty_apps_script_url()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array[
    'loyalty.setting(text)', 'loyalty.link_token(text, text)', 'loyalty.link(text, text, text)',
    'loyalty.member_of(text)', 'loyalty.receipt_json(loyalty.receipts)', 'loyalty.shipment_json(loyalty.shipments)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
