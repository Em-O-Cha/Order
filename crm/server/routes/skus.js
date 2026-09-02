const express = require('express');
const router = express.Router();
const db = require('../db');
const { syncSkuSheet } = require('../services/googleSheetsSync');

router.get('/', (req, res) => {
  res.json({
    lastSyncedAt: db.get('meta.sku_last_synced').value(),
    items: db.get('skus').value(),
  });
});

router.post('/sync', async (req, res) => {
  try {
    const skus = await syncSkuSheet();
    res.json({ ok: true, count: skus.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
