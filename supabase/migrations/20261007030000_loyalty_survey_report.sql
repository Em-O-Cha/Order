-- ⚡ เพิ่ม (7/10/69) — ปุ่ม "ส่งรายงานแบบสอบถามเข้า LINE" ที่หน้าตั้งค่า
--   หน้าตั้งค่า -> Edge Function loyalty action=surveyReport -> loyalty_survey_report_request (จดเวลาที่ขอ)
--   -> ปลุก Apps Script -> loyalty_survey_report_claim (รับข้อมูลสรุป + ล้างคำขอในคราวเดียว) -> Flex เข้ากลุ่มแอดมิน

create or replace function public.loyalty_survey_report_request()
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if coalesce(loyalty.setting('admin_group_id') #>> '{}', '') = '' then
    return jsonb_build_object('ok', false, 'error', 'ยังไม่ได้ใส่ Group ID กลุ่ม LINE แจ้งเตือน');
  end if;
  insert into loyalty.settings (key, value) values ('survey_report_requested_at', to_jsonb(now()))
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true);
end $$;

-- คืน null ถ้าไม่มีคำขอค้าง (Apps Script เรียกทุกรอบทำงาน)
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
    'respondents', (select count(*) from loyalty.receipts where status <> 'rejected' and survey <> '{}'::jsonb),
    'stats', jsonb_build_object(
      'total', (select count(*) from loyalty.receipts),
      'approved', (select count(*) from loyalty.receipts where status = 'approved'),
      'members', (select count(distinct line_uid) from loyalty.receipts where status = 'approved'),
      'pointsGiven', (select coalesce(sum(points), 0) from loyalty.receipts where status = 'approved'),
      'emochaAmount', (select coalesce(sum(emocha_amount), 0) from loyalty.receipts where status = 'approved')),
    'summary', (public.loyalty_settings_get() -> 'surveySummary'));
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.loyalty_survey_report_request()', 'public.loyalty_survey_report_claim()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
