# Export CRM

ระบบ CRM สำหรับติดตามลูกค้า (บุคคลธรรมดา/บริษัท) ที่ติดต่อขอนำสินค้าไปขายต่างประเทศ

## ฟีเจอร์

1. **ข้อมูลลูกค้า** — บันทึกลูกค้าทั้งแบบบุคคลธรรมดาและบริษัท พร้อมช่องทางที่ติดต่อเข้ามา และ Dropdown เลือกประเทศเป้าหมายที่จะส่งสินค้าไปขาย (`server/constants.js`)
2. **Dashboard + รายงานประจำวัน** — สรุปยอดลูกค้า/ดีล/มูลค่า พร้อมกราฟ และส่งอีเมลรายงานอัตโนมัติทุกวัน (ตั้งเวลาได้ผ่าน cron)
3. **ติดตามลูกค้า + แจ้งเตือน** — แจ้งเตือนใบเสนอราคาใกล้หมดอายุ, วันจัดส่งใกล้ถึง, และนัดติดตามลูกค้าที่ครบกำหนด (แสดงบนแดชบอร์ดและรวมในรายงานประจำวัน)
4. **จัดเก็บเอกสาร** — อัปโหลด/ดาวน์โหลดใบเสนอราคา, ใบสั่งซื้อ (PO), ใบส่งของ, ใบเสร็จ ผูกกับลูกค้าแต่ละราย
5. **AI วิเคราะห์ลูกค้า** — ใช้ Claude API วิเคราะห์ลูกค้าที่ยังไม่ปิดดีล แนะนำแนวทางการนำเสนอและสินค้าที่ควรเสนอ
6. **ข้อมูลสินค้า (SKU)** — ซิงก์จาก Google Sheet "Master Data Sales" แท็บ "SKU ส่งออก" (มีข้อมูลตั้งต้นให้ใช้งานได้ทันทีก่อนเชื่อมต่อจริง)

## เริ่มต้นใช้งาน

```bash
cd crm
npm install
cp .env.example .env   # แก้ไขค่าตามต้องการ
npm start               # หรือ npm run dev สำหรับ auto-reload
```

เปิดเบราว์เซอร์ที่ `http://localhost:4000`

ข้อมูลทั้งหมดเก็บในไฟล์ `data/db.json` (สร้างอัตโนมัติ, ไม่ถูก commit ขึ้น Git) และไฟล์เอกสารที่อัปโหลดเก็บใน `uploads/`

## การตั้งค่าเพิ่มเติม (ไม่บังคับ แต่แนะนำให้ทำเพื่อใช้งานฟีเจอร์เต็มรูปแบบ)

### ส่งอีเมลรายงาน/แจ้งเตือน
ตั้งค่า `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `REPORT_TO_EMAILS` ใน `.env`
ถ้ายังไม่ตั้งค่า ระบบจะยังทำงานได้ปกติ เพียงแต่จะไม่ส่งอีเมลจริง (บันทึกรายงานไว้ในระบบ ดูได้ที่หน้า "รายงาน")

### AI วิเคราะห์ลูกค้า (Claude API)
1. สร้าง API Key ที่ https://console.anthropic.com
2. ใส่ค่าใน `.env`: `ANTHROPIC_API_KEY=...`
3. เลือกโมเดลได้ผ่าน `ANTHROPIC_MODEL` (ค่าเริ่มต้น `claude-sonnet-5`)

### ซิงก์ข้อมูลสินค้าจาก Google Sheet
1. สร้าง Service Account บน Google Cloud Console แล้วเปิดใช้งาน **Google Sheets API**
2. ดาวน์โหลดไฟล์ JSON คีย์ของ Service Account มาวางไว้ที่ `crm/google-service-account.json` (หรือกำหนด path อื่นผ่าน `GOOGLE_SERVICE_ACCOUNT_JSON`)
3. แชร์ไฟล์ Google Sheet "Master Data Sales" ให้กับอีเมลของ Service Account (สิทธิ์ผู้ดูพอ)
4. ตรวจสอบ `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_TAB` (ค่าเริ่มต้น `SKU ส่งออก`) ใน `.env`
5. กดปุ่ม "ซิงก์จาก Google Sheet" ในหน้า "สินค้า (SKU)" หรือรัน `npm run sync:sheet`
6. ระบบจะซิงก์อัตโนมัติทุกวันตามเวลาที่ตั้งใน `SKU_SYNC_CRON`

ก่อนเชื่อมต่อจริง ระบบมีข้อมูลสินค้าตั้งต้น (`server/sku-seed.json`) ให้ใช้งานได้ทันที

## โครงสร้างโปรเจกต์

```
crm/
  server/
    index.js          entry point ของเซิร์ฟเวอร์ (Express)
    db.js              lowdb (เก็บข้อมูลเป็นไฟล์ JSON)
    constants.js        รายชื่อประเทศ/ช่องทาง/สถานะดีล ฯลฯ
    scheduler.js         ตั้งเวลา cron (รายงานประจำวัน, ซิงก์ SKU)
    routes/              REST API endpoints
    services/            business logic (reminders, mailer, AI, Google Sheets)
  public/               หน้าเว็บ (HTML/CSS/JS ธรรมดา ไม่ต้อง build)
  scripts/              สคริปต์ช่วยเหลือ (seed ข้อมูล, ซิงก์ sheet)
  uploads/              ไฟล์เอกสารที่อัปโหลด
  data/                 ฐานข้อมูล JSON (สร้างอัตโนมัติ)
```

## API หลัก

| Method | Endpoint | คำอธิบาย |
|---|---|---|
| GET/POST | `/api/customers` | รายชื่อ/เพิ่มลูกค้า |
| GET/PUT/DELETE | `/api/customers/:id` | ดู/แก้ไข/ลบลูกค้า |
| GET/POST | `/api/customers/:id/deals` | ดีลของลูกค้า |
| PUT/DELETE | `/api/customers/deals/:dealId` | แก้ไข/ลบดีล |
| GET/POST | `/api/customers/:id/followups` | การติดตามลูกค้า |
| GET/POST | `/api/documents` | เอกสาร (multipart/form-data) |
| GET | `/api/dashboard` | สรุปข้อมูลแดชบอร์ด |
| GET | `/api/reminders` | รายการแจ้งเตือนทั้งหมด |
| GET/POST | `/api/reports`, `/api/reports/send-now` | ประวัติ/ส่งรายงานประจำวัน |
| POST | `/api/ai/analyze/:customerId` | วิเคราะห์ลูกค้าด้วย AI |
| GET/POST | `/api/skus`, `/api/skus/sync` | ข้อมูลสินค้า/ซิงก์จาก Google Sheet |

## Deploy

แอปนี้เป็น Node.js/Express ธรรมดา รันได้บนแทบทุกโฮสติ้ง (Render, Railway, VPS, ฯลฯ)
ตั้งค่า environment variables ตาม `.env.example` และรัน `npm start`
