-- shop_order_history (SQL ที่เขียนเลียนแบบ getMyOrderHistory) ไม่ใช้แล้ว: Edge Function shop-read
-- รันฟังก์ชันเดิมของ Members.gs โดยตรง (ดู 20260923020000_mirror_runtime.sql)
drop function if exists public.shop_order_history(text);
drop function if exists mirror.digits(text);
