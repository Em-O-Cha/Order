-- ⚡ (4/11/69) รายงานแบบสอบถาม 7-Eleven แบบอ่านอย่างเดียว (ไม่ล้างคำขอส่ง LINE) — Members LINE ดึงไปเขียนลงชีต
-- ให้ Dashboard ประชุมแสดง (ยอดรวมทั้งหมด ไม่ขึ้นกับช่วงวันที่) · เรียกได้เฉพาะ service_role
create or replace function public.loyalty_survey_report_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return jsonb_build_object(
    'requestedAt', now(),
    'survey', loyalty.setting('survey'),
    'respondents', (select count(distinct line_uid) from loyalty.receipts where jsonb_typeof(survey) = 'object' and survey <> '{}'::jsonb),
    'stats', jsonb_build_object(
      'total', (select count(*) from loyalty.receipts),
      'approved', (select count(*) from loyalty.receipts where status = 'approved'),
      'members', (select count(distinct line_uid) from loyalty.receipts where status = 'approved'),
      'pointsGiven', (select coalesce(sum(points), 0) from loyalty.receipts where status = 'approved'),
      'emochaAmount', (select coalesce(sum(emocha_amount), 0) from loyalty.receipts where status = 'approved')),
    'summary', (public.loyalty_settings_get() -> 'surveySummary'));
end $function$;

revoke all on function public.loyalty_survey_report_snapshot() from public, anon, authenticated;
grant execute on function public.loyalty_survey_report_snapshot() to service_role;
