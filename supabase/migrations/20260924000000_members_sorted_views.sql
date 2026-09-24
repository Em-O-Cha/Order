-- มุมมองรายชื่อสมาชิกสำหรับเปิดดูใน Table Editor (schema mirror) — เรียงไว้ให้แล้ว เวลาเป็นเวลาไทย
--   สมาชิก_ตามวันที่สมัคร : สมัครล่าสุดขึ้นก่อน
--   สมาชิก_ตามเลขสมาชิก  : เลขสมาชิกน้อยไปมาก
-- อ่านอย่างเดียว ข้อมูลมาจากสำเนาชีต Members (แก้ในชีตเหมือนเดิม)

create or replace view mirror."สมาชิก_ตามวันที่สมัคร" with (security_invoker = true) as
select member_code                                   as "รหัสสมาชิก",
       (registered_at at time zone 'Asia/Bangkok')   as "วันที่สมัคร",
       full_name                                     as "ชื่อ-นามสกุล",
       display_name                                  as "ชื่อ LINE",
       phone                                         as "เบอร์โทร",
       tier                                          as "ระดับ",
       points                                        as "แต้ม",
       total_spent                                   as "ยอดซื้อสะสม",
       birthday                                      as "วันเกิด",
       last_province                                 as "จังหวัดล่าสุด",
       line_uid                                      as "LINE UID"
  from mirror.v_members
 order by registered_at desc nulls last, member_code desc;

create or replace view mirror."สมาชิก_ตามเลขสมาชิก" with (security_invoker = true) as
select *
  from mirror."สมาชิก_ตามวันที่สมัคร"
 order by "รหัสสมาชิก";

revoke all on mirror."สมาชิก_ตามวันที่สมัคร", mirror."สมาชิก_ตามเลขสมาชิก" from public, anon, authenticated;
