-- ⚡ (14/10/69) ผู้ใช้สั่ง: "ตั้งเวลา 3 ทุ่มของ 15/10 ให้ลบข้อมูลใน Google Sheet ออกให้หมด"
--   15/10/2569 21:00 เวลาไทย = 2026-10-15 14:00 UTC -> pg_cron เรียก Edge Function booth-clear ครั้งเดียว แล้วลบตารางเวลานี้ทิ้งเอง
--   booth-clear ล้างแถวลูกค้าทั้งหมดในแท็บ "ลูกค้า" ของชีต BoothCRM (หัวคอลัมน์ + แท็บ "พนักงาน" ยังอยู่)
--   token สำหรับเรียก booth-clear สุ่มสร้างใน Vault (ไม่อยู่ในโค้ด) — ตรวจผ่าน booth_clear_token_ok (service_role เท่านั้น)

create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'booth_clear_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'booth_clear_token', 'x-clear-token for Edge Function booth-clear');
  end if;
end $$;

create or replace function public.booth_clear_token_ok(p_token text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_token <> '' and p_token = (select decrypted_secret from vault.decrypted_secrets where name = 'booth_clear_token'), false)
$$;
revoke all on function public.booth_clear_token_ok(text) from public, anon, authenticated;
grant execute on function public.booth_clear_token_ok(text) to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'booth-clear-2026-10-15';
select cron.schedule('booth-clear-2026-10-15', '0 14 15 10 *', $job$
  do $do$
  begin
    -- cron has no year: only act in 2026, and remove the job either way so it never repeats
    if now() < timestamptz '2026-10-16 00:00+07' then
      perform net.http_post(
        url := 'https://qotlepudmkuniyjvqmle.supabase.co/functions/v1/booth-clear',
        headers := jsonb_build_object('Content-Type', 'application/json',
                     'x-clear-token', (select decrypted_secret from vault.decrypted_secrets where name = 'booth_clear_token')),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000);
    end if;
    perform cron.unschedule('booth-clear-2026-10-15');
  end $do$;
$job$);
