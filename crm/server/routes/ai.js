const express = require('express');
const router = express.Router();
const db = require('../db');
const { analyzeCustomer, analyzeAllOpenCustomers } = require('../services/aiAnalysis');

router.get('/insights', (req, res) => {
  const { customerId } = req.query;
  let list = db.get('ai_insights').value();
  if (customerId) list = list.filter((i) => i.customerId === customerId);
  res.json(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

router.post('/analyze/:customerId', async (req, res) => {
  try {
    const insight = await analyzeCustomer(req.params.customerId);
    res.status(201).json(insight);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/analyze-all-open', async (req, res) => {
  try {
    const results = await analyzeAllOpenCustomers();
    res.status(201).json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
