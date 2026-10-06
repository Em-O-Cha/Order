-- ⚡ เพิ่ม (6/10/69) — ย้ายรูปใบเสร็จ 7-Eleven ไปเก็บใน Google Drive ไม่ให้เปลืองพื้นที่ Supabase
--
-- ลูกค้าส่งรูปเข้า bucket receipts เหมือนเดิม (AI ตรวจทันที แจ้งกลุ่มแอดมินพร้อมรูป) แล้วเมื่อตัดสินใบนั้นครบ
-- archive_after_days วัน (ค่าเริ่ม 3 วัน ให้รูปในกลุ่ม LINE ยังเปิดได้ช่วงที่แอดมินยังดูอยู่) Apps Script จะ
--   1. loyalty_archive_claim  รับรายการใบที่ถึงเวลาย้าย (+ ไฟล์ที่ไม่มีใบเสร็จอ้างถึง เช่น ใบทดสอบที่ลบไปแล้ว)
--   2. ดาวน์โหลดจาก Supabase -> บันทึกลงโฟลเดอร์ "ใบเสร็จ 7-Eleven" ใน Drive -> loyalty_archive_saved (จด id ไฟล์)
--   3. ลบไฟล์ออกจาก bucket -> loyalty_archive_done
-- หน้าตรวจใบเสร็จ (Edge Function loyalty action=review) เห็น drive_file_id แล้วเปิดรูปจาก Drive แทน

alter table loyalty.receipts add column if not exists drive_file_id    text;
alter table loyalty.receipts add column if not exists drive_preview_id text;
alter table loyalty.receipts add column if not exists archived_at      timestamptz;

insert into loyalty.settings (key, value) values ('archive_after_days', '3') on conflict (key) do nothing;

create or replace function loyalty.receipt_json(r loyalty.receipts)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'ref', r.ref, 'lineUid', r.line_uid, 'member', r.member, 'survey', r.survey,
    'fileMime', r.file_mime, 'fileName', r.file_name, 'fileSize', r.file_size,
    'filePath', r.file_path, 'previewPath', r.preview_path, 'previewUrl', r.preview_url,
    'driveFileId', r.drive_file_id, 'drivePreviewId', r.drive_preview_id, 'archivedAt', r.archived_at,
    'receiptNo', r.receipt_no, 'store', r.store, 'receiptAt', r.receipt_at, 'receiptTotal', r.receipt_total,
    'emochaAmount', r.emocha_amount, 'emochaItems', r.emocha_items, 'ai', r.ai, 'aiVerdict', r.ai_verdict,
    'aiFlags', r.ai_flags, 'suggestedPoints', r.suggested_points,
    'duplicateOf', (select d.ref from loyalty.receipts d where d.id = r.duplicate_of),
    'status', r.status, 'points', r.points, 'reviewNote', r.review_note, 'reviewer', r.reviewer,
    'reviewedAt', r.reviewed_at, 'pointsWrittenAt', r.points_written_at, 'balanceAfter', r.balance_after,
    'customerNotifiedAt', r.customer_notified_at, 'lastError', r.last_error, 'createdAt', r.created_at)
$$;

-- ใบที่ถึงเวลาย้าย: ตัดสินแล้ว (อนุมัติ = เขียนคะแนนแล้ว) แจ้งกลุ่มแล้ว และตัดสินมาครบ archive_after_days วัน
-- orphans = ไฟล์ใน bucket ที่ไม่มีใบเสร็จอ้างถึง อายุเกิน 1 ชม. (ไฟล์ที่กำลังส่งอยู่ยังไม่มีแถว จึงรอ 1 ชม.)
create or replace function public.loyalty_archive_claim(p_limit int)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'receipts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'ref', r.ref, 'createdAt', r.created_at, 'memberName', coalesce(r.member ->> 'name', ''),
        'memberCode', coalesce(r.member ->> 'memberCode', ''), 'fileMime', r.file_mime,
        'filePath', r.file_path, 'previewPath', nullif(r.preview_path, r.file_path),
        'driveFileId', r.drive_file_id, 'drivePreviewId', r.drive_preview_id) order by r.seq)
      from (select * from loyalty.receipts x
             where x.archived_at is null and x.file_path is not null
               and x.admin_notified_at is not null and x.reviewed_at is not null
               and (x.status = 'rejected' or x.points_written_at is not null)
               and x.reviewed_at < now() - make_interval(days =>
                     greatest(coalesce((loyalty.setting('archive_after_days') #>> '{}')::int, 3), 0))
             order by x.seq limit greatest(p_limit, 1)) r), '[]'::jsonb),
    'orphans', coalesce((select jsonb_agg(jsonb_build_object('path', o.name, 'createdAt', o.created_at,
                                                             'mime', o.metadata ->> 'mimetype') order by o.created_at)
      from (select * from storage.objects so
             where so.bucket_id = 'receipts' and so.created_at < now() - interval '1 hour'
               and not exists (select 1 from loyalty.receipts r
                                where r.file_path = so.name or r.preview_path = so.name)
             order by so.created_at limit greatest(p_limit, 1)) o), '[]'::jsonb))
$$;

create or replace function public.loyalty_archive_saved(p_id uuid, p_file_id text, p_preview_id text)
returns void
language sql volatile security definer set search_path = '' as $$
  update loyalty.receipts set
    drive_file_id = coalesce(drive_file_id, nullif(p_file_id, '')),
    drive_preview_id = coalesce(drive_preview_id, nullif(p_preview_id, ''))
  where id = p_id
$$;

-- ลบไฟล์ออกจาก bucket แล้ว: ลิงก์รูปเดิม (signed URL) ใช้ไม่ได้อีก
create or replace function public.loyalty_archive_done(p_id uuid)
returns void
language sql volatile security definer set search_path = '' as $$
  update loyalty.receipts set archived_at = coalesce(archived_at, now()), preview_url = null
  where id = p_id and drive_file_id is not null
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.loyalty_archive_claim(int)', 'public.loyalty_archive_saved(uuid, text, text)',
    'public.loyalty_archive_done(uuid)', 'loyalty.receipt_json(loyalty.receipts)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
