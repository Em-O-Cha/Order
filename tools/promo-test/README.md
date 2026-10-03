# เครื่องมือทดสอบโปรโมชั่น / ส่วนลด

ใช้ทดสอบ `Members.gs` (Apps Script โปรเจกต์ Members LINE) ก่อนส่งให้วาง และใช้เทียบ Edge Function บน Supabase ตัวใหม่ (`-next`) กับตัวที่ลูกค้าใช้อยู่
ทุกสคริปต์เรียก Supabase Management API ผ่าน connector ของเซสชัน (ไม่มีโทเคนในไฟล์) และอ่านข้อมูลจริงจาก `mirror.rows`

## ขั้นตอนทำงานที่ใช้มาตลอด
1. **ดาวน์โหลด Apps Script ปัจจุบัน** ผ่าน Google Drive connector (`download_file_content`, `exportMimeType: application/vnd.google-apps.script+json`) แล้วแตกไฟล์:
   `python3 unpack_gas.py <ผลดาวน์โหลด> <โฟลเดอร์>` แล้วตรวจว่าตรงกับเวอร์ชันล่าสุดที่ส่งไป
2. แก้ `Members.gs` / `admin.html` ในโฟลเดอร์สำเนา แล้วทดสอบกติกาในเครื่องจำลอง (ไม่แตะระบบจริง):
   - `node excl_test.mjs <Members.gs>` กติกาใช้ร่วมกับโปรอื่นได้/ไม่ได้ (ปิดคูปอง/สิทธิ์เดิมในชีตจำลองก่อนทดสอบ)
   - `node ship_test.mjs <Members.gs>` ส่วนลดค่าส่งราคาพิเศษ
   - `node recheck_compare.mjs <เดิม/Members.gs> <ใหม่/Members.gs>` ตรวจยอดซ้ำออเดอร์ที่รอแนบสลิป ต้องได้ "same N of N"
   - `node slip_notify_test.mjs <โฟลเดอร์ .gs>` แนบสลิปผ่านคิว Supabase ส่งแจ้งเตือนทันที และ trigger ไม่ส่งซ้ำ
   - `node admin_slip_test.mjs <โฟลเดอร์ .gs>` แอดมินแนบสลิปแทนลูกค้า (รายการรอแนบสลิป, แนบ/แจ้งเตือน/ให้แต้มทันที, แนบซ้ำ/ใบยกเลิก/COD ไม่ได้) และลูกค้ายกเลิกเองแจ้งกลุ่มแอดมิน
   - `node price_tier_test.mjs <Members.gs>` โปรขายราคาพิเศษแยกราคา/ของแถมตามขนาด (คูปอง/สิทธิ์/โค้ดพิมพ์เอง/แจกทุกคน) ต้องได้ "ผ่านทั้งหมด"
3. สร้าง `gas_port.js` ใหม่: `node ../gas-port/extract.mjs <Members.gs> <out.js> <shop-read|shop-order|admin-read|member-signup>`
4. Deploy เป็นตัวทดสอบ: `./deploy_next.sh shop-read-next <โฟลเดอร์ที่มี index.ts + gas_port.js>` (และ shop-order-next)
5. เทียบกับตัวจริง (**ห้ามรันสคริปต์ที่ใช้ callEdge พร้อมกัน 2 ตัว** เพราะแต่ละตัวสร้าง/ลบ pg_net เอง):
   - `node compare_excl.mjs` หน้าร้าน + คำนวณส่วนลด (ไม่นับฟิลด์ exclusive/typedOnly)
   - `node compare_next_nostack.mjs` ทุก action ของ shop-read
   - `node compare_order_next.mjs <Members.gs> [nobogo]` สั่งซื้อแบบ dry-run
   - `node cmp_admin_next.mjs` admin-read
   - `node signup_compare_next.mjs` member-signup สมัครจำลอง (ไม่บันทึก) เทียบผลทั้งหมด ยกเว้นข้อความต้อนรับ
6. ส่งไฟล์ให้ผู้ใช้วาง → Deploy → **Manage deployments → Edit → New version** (ห้าม New deployment; โปรเจกต์ Notice แค่บันทึก)
7. ผู้ใช้บอก "เรียบร้อย" → ดาวน์โหลดมาตรวจอีกครั้ง → deploy ตัวจริง (`./deploy_next.sh shop-read supabase/functions/shop-read` ฯลฯ) → `node smoke_live.mjs <Members.gs>`, `node ms_smoke.mjs`, `node admin_live_check.mjs` → ลบ `-next` → commit `gas_port.js`

## ข้อควรระวัง
- repo เป็นสาธารณะ: ห้าม commit ความลับ/ค่าโทเคน/ข้อมูลลูกค้า
- ชีต Coupons คอลัมน์ O หัวชื่อ "แจ้งเตือนแล้ว" แต่เก็บ % ส่วนลดของแถม (bogo) ห้ามใช้ทำอย่างอื่น
- โปรขายราคาพิเศษ (price) แยกราคา/ของแถมตามสินค้า เก็บเป็น JSON ในคอลัมน์ L "สินค้าที่แถม" (ชีต Coupons และ Member_Privileges) `{"mode":"item|order","items":[{"p","price","gift","giftQty","unit"}]}` — ว่าง = ราคาเดียวตามช่องมูลค่าแบบเดิม
- เวลาในเครื่องจำลองเป็น UTC: วันที่ที่พิมพ์ออกมาอาจช้ากว่าเวลาไทย 1 วัน (ระบบจริงใช้เวลาไทย)
- หน้าร้าน (`index.html`) ขึ้น GitHub Pages จาก main: แก้บน branch แล้วเปิด PR
