# ทดสอบนำเข้ารายงานคำสั่งซื้อ Affiliate (Revenue Spunky Online)

TikTok เลิกให้ดาวน์โหลดรายงานสินค้า Affiliate แบบเดิม แล้วให้รายงานรายคำสั่งซื้อแทน (1 แถว = 1 SKU ใน 1 คำสั่งซื้อ จากครีเอเตอร์ 1 คน)

- ฝั่งหน้าเว็บ (`index.html` ของโปรเจกต์ Apps Script "Revenue Spunky Online"): บล็อก `AFFILIATE ORDER PARSER` อ่านไฟล์/ตารางที่วาง ตามชื่อหัวตาราง
- ฝั่งเซิร์ฟเวอร์: [`apps-script/revenue/AffiliateOrders.gs`](../../apps-script/revenue/AffiliateOrders.gs) เก็บในชีต `Affiliate_Orders` (กันซ้ำด้วย หมายเลขคำสั่งซื้อ|SKU|ครีเอเตอร์|รหัสเนื้อหา) + log ชุดนำเข้าในชีต `Affiliate_Order_Imports`
- `Code.gs` → `getAffiliateDashboardData()` เรียก `mergeAffiliateOrderData_()` รวมยอดกับข้อมูลแบบเดิม (Affiliate_Creators/Affiliate_Content ไม่ถูกแตะ)
- ชีตใหม่ถูกคัดลอกไป Supabase (`mirror.rows` source `revenue`) อัตโนมัติ เหมือนแท็บอื่นของ Revenue

## กติกาคำนวณ
| ค่า | วิธีคิด |
|---|---|
| วันที่อ้างอิง (กรอง Dashboard) | เวลาที่สร้าง → เวลาชำระเงิน → "วันที่ใช้แทน" ที่กรอกตอนนำเข้า |
| GMV ที่นับ | Payment Amount (ไม่มี = ราคา × ปริมาณ) — สถานะมีคำว่า "ยกเลิก" = 0 |
| GMV คืนเงิน | Payment Amount ถ้า "คืนสินค้าหรือคืนเงินทั้งหมดแล้ว" ไม่ใช่ ไม่มี/ว่าง |
| ค่าคอมที่นับ | มาตรฐาน + โฆษณาร้านค้า ใช้ยอด "จริง" ถ้ามี ไม่งั้นใช้ "โดยประมาณ" (ยกเลิก = 0, คืนเงินทั้งหมดที่ยังไม่มียอดจริง = 0) |
| โบนัสร่วมทุน | เก็บแยก ไม่รวมในค่าคอม |
| สถานะค่าคอม | ยกเลิก / จ่ายแล้ว (มีเวลาที่ชำระค่าคอม) / ยืนยันแล้ว (มียอดจริง) / ประมาณการ |

ไฟล์ `.csv` อ่านเองเป็นข้อความ UTF-8 (`affParseCsv`) ไม่ผ่าน SheetJS — SheetJS อ่าน CSV ที่ไม่มี BOM เป็นภาษาไทยเพี้ยน แปลงเลขคำสั่งซื้อเป็นตัวเลข (หลักท้ายหาย) และอ่าน `01/10/2026` เป็น 10 ม.ค.

รหัสยาว 18-19 หลัก (คำสั่งซื้อ/สินค้า/SKU/คอนเทนต์) ถ้าผ่าน Excel ที่แปลงเป็นตัวเลข หลักท้ายจะกลายเป็น 000 — หน้าเว็บเตือนและแนะนำให้เลือกไฟล์จาก TikTok โดยตรง

## รันทดสอบ
1. ดาวน์โหลด Apps Script ผ่าน Google Drive connector (`exportMimeType: application/vnd.google-apps.script+json`) แล้ว `python3 ../promo-test/unpack_gas.py <ผลดาวน์โหลด> <โฟลเดอร์>`
2. `npm ci && node affiliate_test.mjs <โฟลเดอร์> [AffiliateOrders.gs]` ต้องได้ "ผ่านทั้งหมด"
