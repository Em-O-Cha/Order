const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateAndSendDailyReport } = require('../services/dailyReport');

router.get('/', (req, res) => {
  const list = db.get('reports').value().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(list);
});

router.post('/send-now', async (req, res) => {
  try {
    const report = await generateAndSendDailyReport();
    res.status(201).json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ไม่สามารถสร้าง/ส่งรายงานได้', detail: err.message });
  }
});

module.exports = router;
