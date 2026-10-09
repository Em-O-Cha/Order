-- ลูกค้าหน้าบูธจาก LINE เก็บใน Google Sheet แทน (ร้านเลือกเก็บใน Google Drive) — booth-line เป็นแค่ทางผ่านให้ Claude อ่าน
-- ลบตารางและฟังก์ชันที่ 20261009000000_booth_leads สร้างไว้ (ยังไม่เคยมีข้อมูลลูกค้า)
drop function if exists public.booth_staff_touch(text, text, text);
drop function if exists public.booth_lead_insert(jsonb);
drop function if exists public.booth_lead_update(bigint, jsonb);
drop function if exists public.booth_lead_latest(text, int);
drop function if exists public.booth_lead_delete(bigint, text);
drop function if exists public.booth_leads_list(int);
drop schema if exists booth cascade;
