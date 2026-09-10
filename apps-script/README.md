# วิธี Deploy Dashboard API (Apps Script)

ไฟล์ `DashboardApi.gs` เป็น backend ใหม่แยกต่างหาก **ไม่ใช่** Apps Script ตัวเดิมที่ร้านใช้รับออเดอร์อยู่ตอนนี้
มันแค่ "อ่าน" ข้อมูลจาก 3 Google Sheets เดิม (Revenue, Master Data Sales, Members Emocha Club) เพื่อคำนวณ
รายงานให้หน้าแดชบอร์ด `/dashboard/index.html` — ไม่ไปยุ่งกับสคริปต์ที่ใช้รับออเดอร์จริงเลย

ต้องทำตามขั้นตอนด้านล่างนี้ **1 ครั้ง** ก่อนใช้งานแดชบอร์ดได้

## ขั้นตอนที่ 1 — สร้างโปรเจกต์ Apps Script ใหม่

1. ล็อกอินด้วยบัญชี Google ที่เป็นเจ้าของสเปรดชีต Revenue / Master Data Sales / Members Emocha Club
   (บัญชีเดียวกับที่ดูแลร้านอยู่แล้ว)
2. ไปที่ [script.google.com](https://script.google.com) → กด "โปรเจกต์ใหม่" (New project)
3. ตั้งชื่อโปรเจกต์ เช่น "Em-O-Cha Dashboard API"
4. ลบโค้ดเริ่มต้นในไฟล์ `Code.gs` ทั้งหมด แล้วคัดลอกเนื้อหาทั้งหมดจากไฟล์
   [`DashboardApi.gs`](./DashboardApi.gs) ในโฟลเดอร์นี้ ไปวางแทน แล้วกด บันทึก (Ctrl+S)

## ขั้นตอนที่ 2 — ตั้งค่า Script Properties (รหัสผ่าน + API key)

1. ในหน้า Apps Script editor กดไอคอนรูปเฟือง ⚙️ "การตั้งค่าโปรเจกต์" (Project Settings) ทางซ้ายมือ
2. เลื่อนลงมาที่หัวข้อ "Script Properties" → กด "Add script property" แล้วเพิ่มทีละบรรทัด:

   | Property | Value | จำเป็นไหม |
   |---|---|---|
   | `ADMIN_PASSWORD` | รหัสผ่านที่จะใช้ล็อกอินเข้าแดชบอร์ด (ตั้งเองให้คาดเดายาก) | **จำเป็น** — ถ้าไม่ตั้ง แดชบอร์ดจะเข้าไม่ได้เลย |
   | `ANTHROPIC_API_KEY` | API key จาก [console.anthropic.com](https://console.anthropic.com) | จำเป็นถ้าจะใช้ปุ่ม "🤖 วิเคราะห์ด้วย AI" |
   | `ANTHROPIC_MODEL` | เช่น `claude-sonnet-5` (ถ้าไม่ตั้งจะใช้ค่านี้เป็นค่าเริ่มต้นให้อัตโนมัติ) | ไม่จำเป็น |

   ⚠️ **ห้าม**เอารหัสผ่านหรือ API key ไปใส่ในโค้ดหรือ commit ขึ้น GitHub เด็ดขาด — ต้องตั้งผ่าน Script
   Properties เท่านั้น เพราะ Script Properties เก็บอยู่ฝั่งเซิร์ฟเวอร์ (Apps Script) ไม่หลุดออกไปที่เบราว์เซอร์

## ขั้นตอนที่ 3 — Deploy เป็น Web App

1. กดปุ่ม "Deploy" (มุมขวาบน) → "New deployment"
2. กดไอคอนรูปเฟืองข้างคำว่า "Select type" → เลือก **Web app**
3. ตั้งค่า:
   - **Execute as**: Me (บัญชีของคุณ)
   - **Who has access**: Anyone
4. กด "Deploy" → ถ้าเป็นครั้งแรกจะมีหน้าขอสิทธิ์ (Authorize access) ให้กด "Advanced" → "Go to
   [ชื่อโปรเจกต์] (unsafe)" → "Allow" (ปกติของ Apps Script โปรเจกต์ที่เราสร้างเอง ไม่ใช่ของแปลกปลอม)
5. คัดลอก **Web app URL** ที่ได้ (หน้าตาประมาณ
   `https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXX/exec`) เก็บไว้ใช้ในขั้นตอนถัดไป

> ทุกครั้งที่แก้โค้ด `DashboardApi.gs` ในอนาคต ต้องกลับมาที่ "Deploy" → "Manage deployments" → กดไอคอนดินสอ
> ✏️ ที่ deployment เดิม → เปลี่ยน Version เป็น "New version" → Deploy ใหม่ (URL เดิมจะยังใช้ได้)

## ขั้นตอนที่ 4 — ตรวจสอบว่าเชื่อมชีตถูกต้อง

เปิด URL ที่ได้จากขั้นตอนที่ 3 ในเบราว์เซอร์ ต่อท้ายด้วย `?action=ping` เช่น:

```
https://script.google.com/macros/s/XXXXXXXX/exec?action=ping
```

ถ้าเห็น `{"success":true,"message":"pong",...}` แปลว่า deploy สำเร็จ

จากนั้นตรวจสอบว่าสคริปต์หาตารางในชีตทั้ง 3 ไฟล์เจอถูกต้อง โดยเปิด URL ต่อท้ายด้วย
`?action=debugSchema&password=รหัสผ่านที่ตั้งไว้` เช่น:

```
https://script.google.com/macros/s/XXXXXXXX/exec?action=debugSchema&password=xxxxx
```

ควรเห็น `"found":true` ครบทั้ง 4 ส่วน (`revenue`, `targets`, `members`, `privileges`) พร้อมชื่อชีตและจำนวนแถวที่
เจอ — ถ้าส่วนไหน `"found":false` แปลว่าโครงสร้างหัวตารางในชีตจริงถูกเปลี่ยนไปจากตอนที่ตรวจสอบไว้ ต้องดูคอลัมน์
ที่ระบุใน `DashboardApi.gs` (ตัวแปร `C` ที่ต้นไฟล์) เทียบกับหัวตารางในชีตจริงอีกครั้ง

## ขั้นตอนที่ 5 — เชื่อมหน้าแดชบอร์ดเข้ากับ Apps Script

1. เปิดไฟล์ [`dashboard/dashboard.js`](../dashboard/dashboard.js) ในโปรเจกต์นี้
2. แก้บรรทัดบนสุด:
   ```js
   var CONFIG = {
     API_URL: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE'
   };
   ```
   เปลี่ยนเป็น Web app URL ที่ได้จากขั้นตอนที่ 3
3. Commit และ push ขึ้น GitHub (หรือถ้าเว็บ deploy ผ่าน GitHub Pages อยู่แล้ว รอสักครู่ให้ GitHub Pages
   build เสร็จ)
4. เปิดหน้าแดชบอร์ด (`https://<your-github-pages-domain>/dashboard/`) → กรอกรหัสผ่านที่ตั้งไว้ใน
   `ADMIN_PASSWORD` → เข้าสู่ระบบ

## หมายเหตุเกี่ยวกับการทำงาน

- **Keyword groups** (ใช้จัดกลุ่มสินค้าในรายงานข้อ 2/3/7): เมื่อกดบันทึกครั้งแรกจากหน้าแดชบอร์ด สคริปต์จะสร้าง
  แท็บใหม่ชื่อ `DashboardKeywordGroups_Product` และ `DashboardKeywordGroups_Item` ในสเปรดชีต
  **Master Data Sales** ให้อัตโนมัติ — แก้ไขได้ทั้งจากหน้าแดชบอร์ด (ปุ่ม "🏷️ จัดการ Keyword สินค้า") หรือแก้ตรง
  ในชีตนั้นเองก็ได้ (คอลัมน์ B คั่น keyword ด้วยจุลภาค `,`)
- **เป้าหมายยอดขายรายเดือน** (รายงานข้อ 8): อ่านจากตาราง "Month / ... / Total" ในชีต Master Data Sales
  โดยตรง (read-only) — ถ้าต้องการแก้ไขเป้าหมาย ให้แก้ในชีตนั้นตามปกติ
- **ตัวตนลูกค้า** (รายงานข้อ 9): อ้างอิงจาก LINE UID ก่อน ถ้าไม่มีใช้เบอร์โทร ถ้าไม่มีใช้ชื่อลูกค้า —
  ออเดอร์จาก Shopee/TikTok ส่วนใหญ่ไม่มี LINE UID จึงอาจนับคลาดเคลื่อนได้บ้างถ้าลูกค้าใช้เบอร์คนละเบอร์
- **AI วิเคราะห์**: ทุกครั้งที่กดปุ่ม "🤖 วิเคราะห์" คือการเรียก Claude API 1 ครั้ง ซึ่งมีค่าใช้จ่ายตามราคาของ
  Anthropic (ดูที่ [anthropic.com/pricing](https://www.anthropic.com/pricing)) — ปุ่ม "AI สรุปภาพรวมทั้งหมด"
  ใช้ token เยอะกว่าปุ่มรายงานเดี่ยวเพราะส่งข้อมูลทุกรายงานไปพร้อมกัน
- **ความปลอดภัย**: ลิงก์ Web app URL + รหัสผ่านสามารถเข้าดูข้อมูลยอดขาย/ลูกค้าได้ทั้งหมด ควรเก็บรหัสผ่านเป็น
  ความลับ ไม่ส่งต่อให้คนนอกทีม รหัสผ่านจะถูกเก็บไว้ใน `sessionStorage` ของเบราว์เซอร์ (หายไปเองเมื่อปิดแท็บ)
- **ประสิทธิภาพ**: สคริปต์อ่านทั้งชีต Revenue ใหม่ทุกครั้งที่เรียก (ไม่มีการแคช) เหมาะกับข้อมูลระดับพัน-หมื่น
  แถว ถ้าในอนาคตข้อมูลเยอะมากจนโหลดช้า ค่อยพิจารณาเพิ่ม `CacheService` ทีหลังได้
