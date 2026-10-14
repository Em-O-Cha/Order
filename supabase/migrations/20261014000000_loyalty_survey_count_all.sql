-- ⚡ (14/10/69) — แบบสอบถาม 7-Eleven นับทุกคนที่แนบคำตอบมา ไม่ว่าใบเสร็จจะอนุมัติหรือถูกปฏิเสธ (ผู้ใช้ขอ)
--   เงื่อนไขคือตอบครั้งเดียว: หน้าสมาชิกใส่คำตอบเดิมให้จาก lastSurvey ของ loyalty_my_receipts ซึ่งไม่สนสถานะอยู่แล้ว
--   คนที่ใบเสร็จถูกปฏิเสธจึงไม่ถูกถามซ้ำ — รายงานต้องนับคำตอบของเขาด้วย
--   ยังนับคนละ 1 คำตอบ (คำตอบล่าสุดของแต่ละคน) เหมือนเดิม

create or replace view loyalty.v_survey_answers with (security_invoker = true) as
  select r.ref, r.created_at, r.line_uid, r.status, q.key as question,
         coalesce(a.value, q.value) #>> '{}' as answer
    from (select distinct on (x.line_uid) x.*
            from loyalty.receipts x
           where jsonb_typeof(x.survey) = 'object' and x.survey <> '{}'::jsonb
           order by x.line_uid, x.created_at desc) r
    cross join lateral jsonb_each(r.survey) q
    left join lateral jsonb_array_elements(case when jsonb_typeof(q.value) = 'array' then q.value end) a on true;

create or replace function public.loyalty_settings_get()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'settings', coalesce((select jsonb_object_agg(key, value) from loyalty.settings
                           where key in ('admin_group_id', 'live', 'live_from', 'live_until', 'baht_per_point', 'count_spend', 'max_receipt_age_days', 'max_per_day',
                                         'auto_approve', 'notify_customer_reject', 'sender', 'product_keywords', 'survey', 'point_promos')),
                         '{}'::jsonb),
    'links', public.loyalty_admin_links(),
    'status', public.loyalty_public_config() - 'survey',
    'stats', jsonb_build_object(
      'total', (select count(*) from loyalty.receipts),
      'approved', (select count(*) from loyalty.receipts where status = 'approved'),
      'rejected', (select count(*) from loyalty.receipts where status = 'rejected'),
      'pointsGiven', (select coalesce(sum(points), 0) from loyalty.receipts where status = 'approved'),
      'emochaAmount', (select coalesce(sum(emocha_amount), 0) from loyalty.receipts where status = 'approved')),
    -- สรุปแบบสอบถาม: คำถาม -> [{ answer, count }] (คำตอบล่าสุดของทุกคน ไม่ดูสถานะใบเสร็จ)
    'surveySummary', coalesce((select jsonb_object_agg(question, answers) from (
        select question, jsonb_agg(jsonb_build_object('answer', answer, 'count', n) order by n desc) as answers
          from (select question, answer, count(*) as n from loyalty.v_survey_answers group by 1, 2) x
         group by question) y), '{}'::jsonb))
$$;

create or replace function public.loyalty_survey_report_claim()
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_at jsonb;
begin
  delete from loyalty.settings where key = 'survey_report_requested_at' returning value into v_at;
  if v_at is null then return null; end if;
  return jsonb_build_object(
    'requestedAt', v_at #>> '{}',
    'survey', loyalty.setting('survey'),
    'respondents', (select count(distinct line_uid) from loyalty.receipts where jsonb_typeof(survey) = 'object' and survey <> '{}'::jsonb),
    'stats', jsonb_build_object(
      'total', (select count(*) from loyalty.receipts),
      'approved', (select count(*) from loyalty.receipts where status = 'approved'),
      'members', (select count(distinct line_uid) from loyalty.receipts where status = 'approved'),
      'pointsGiven', (select coalesce(sum(points), 0) from loyalty.receipts where status = 'approved'),
      'emochaAmount', (select coalesce(sum(emocha_amount), 0) from loyalty.receipts where status = 'approved')),
    'summary', (public.loyalty_settings_get() -> 'surveySummary'));
end $$;

revoke all on function public.loyalty_settings_get() from public, anon, authenticated;
grant execute on function public.loyalty_settings_get() to service_role;
revoke all on function public.loyalty_survey_report_claim() from public, anon, authenticated;
grant execute on function public.loyalty_survey_report_claim() to service_role;
