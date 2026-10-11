-- ⚡ (11/10/69) — แบบสอบถาม 7-Eleven นับคนละ 1 คำตอบ (ไม่นับตามจำนวนใบเสร็จ)
--   หน้าสมาชิกส่งคำตอบติดไปกับใบเสร็จทุกใบ (ลูกค้าที่เคยตอบแล้วได้คำตอบเดิมใส่ไว้ให้ แก้ได้)
--   สรุปผล/รายงานจึงใช้เฉพาะคำตอบล่าสุดของแต่ละคน (ใบเสร็จล่าสุดที่ไม่ถูกปฏิเสธและมีคำตอบ)

create or replace view loyalty.v_survey_answers with (security_invoker = true) as
  select r.ref, r.created_at, r.line_uid, r.status, q.key as question,
         coalesce(a.value, q.value) #>> '{}' as answer
    from (select distinct on (x.line_uid) x.*
            from loyalty.receipts x
           where x.status <> 'rejected' and jsonb_typeof(x.survey) = 'object' and x.survey <> '{}'::jsonb
           order by x.line_uid, x.created_at desc) r
    cross join lateral jsonb_each(r.survey) q
    left join lateral jsonb_array_elements(case when jsonb_typeof(q.value) = 'array' then q.value end) a on true;

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
    'respondents', (select count(distinct line_uid) from loyalty.receipts where status <> 'rejected' and survey <> '{}'::jsonb),
    'stats', jsonb_build_object(
      'total', (select count(*) from loyalty.receipts),
      'approved', (select count(*) from loyalty.receipts where status = 'approved'),
      'members', (select count(distinct line_uid) from loyalty.receipts where status = 'approved'),
      'pointsGiven', (select coalesce(sum(points), 0) from loyalty.receipts where status = 'approved'),
      'emochaAmount', (select coalesce(sum(emocha_amount), 0) from loyalty.receipts where status = 'approved')),
    'summary', (public.loyalty_settings_get() -> 'surveySummary'));
end $$;

revoke all on function public.loyalty_survey_report_claim() from public, anon, authenticated;
grant execute on function public.loyalty_survey_report_claim() to service_role;

-- ล้างคำตอบที่ซ้ำของข้อมูลเดิม (ผู้ใช้ขอ 11/10/69): เก็บคำตอบใบแรกของแต่ละคนไว้ใบเดียว
-- (ใบเสร็จ 7E10256900002, 7E10256900003 คำตอบเหมือนใบ 7E10256900001 ทุกข้อ)
update loyalty.receipts set survey = '{}'::jsonb
 where ref in ('7E10256900002', '7E10256900003');
