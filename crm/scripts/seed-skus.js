// เติมข้อมูลสินค้าเริ่มต้น (จากไฟล์ Master Data Sales / SKU ส่งออก) ลง local DB
// ใช้เป็นข้อมูลตั้งต้นก่อนเชื่อมต่อ Google Sheet จริงผ่าน `npm run sync:sheet`
const { v4: uuid } = require('uuid');
const db = require('../server/db');
const seed = require('../server/sku-seed.json');

const existing = db.get('skus').value();
if (existing.length > 0) {
  console.log(`มีข้อมูลสินค้าอยู่แล้ว ${existing.length} รายการ - ข้ามการ seed (ลบไฟล์ data/db.json หากต้องการเริ่มใหม่)`);
  process.exit(0);
}

const rows = seed.map((s) => ({ id: uuid(), status: '', priceOnLine: '', link: '', ...s, syncedAt: new Date().toISOString() }));
db.set('skus', rows).write();
console.log(`เพิ่มข้อมูลสินค้าเริ่มต้นแล้ว ${rows.length} รายการ`);
