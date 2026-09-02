require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');

const db = require('./db');
const { startScheduler } = require('./scheduler');

// เติมข้อมูลสินค้าเริ่มต้นครั้งแรกที่รัน หากยังไม่มีข้อมูลเลย
if (db.get('skus').value().length === 0) {
  try {
    require('../scripts/seed-skus');
  } catch (err) {
    console.warn('ไม่สามารถ seed ข้อมูลสินค้าเริ่มต้นได้:', err.message);
  }
}

const app = express();
app.use(express.json());

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/meta', require('./routes/meta'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/skus', require('./routes/skus'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์', detail: err.message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Export CRM server running at http://localhost:${PORT}`);
  startScheduler();
});
