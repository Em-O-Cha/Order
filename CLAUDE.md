# คำสั่งประจำของเจ้าของ repo (Owner's standing instructions)

## การส่งมอบโค้ดที่แก้ไข (Delivering code changes)

**ถ้าแก้เกิน 2 บรรทัด ให้ส่งเป็น "ไฟล์เต็ม" เสมอ เพื่อเซฟทับได้ทันที**
ห้ามส่งเป็นคำสั่ง find/replace, diff, หรือ snippet ให้ไปไล่แก้เอง

- If a change touches more than 2 lines, deliver the **complete file** via `SendUserFile`,
  ready to save over the original. Never hand over find/replace steps or partial snippets.
- ใช้ได้กับทุกไฟล์ รวมถึงโค้ดที่อยู่นอก repo นี้ เช่น Google Apps Script ใน Google Drive
  (`Stock Flow — ระบบสต๊อก`) — ดึงไฟล์มา แก้ แล้วส่งไฟล์เต็มกลับไป
- แก้ไม่เกิน 2 บรรทัด → บอกเป็นข้อความตรง ๆ ได้
- ก่อนส่งไฟล์ ต้องตรวจ syntax ให้ผ่านก่อน (เช่น `node --check`) และถ้าไฟล์ถูกดึงมาแบบ
  decode/transcribe ต้องตรวจว่าตัวอักษรภาษาไทยไม่เพี้ยน
- สรุปให้ชัดว่าไฟล์นั้นแก้อะไรไปบ้าง

## ภาษา

ตอบเป็นภาษาไทย
