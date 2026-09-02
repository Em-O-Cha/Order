const express = require('express');
const router = express.Router();
const { computeReminders } = require('../services/reminders');

router.get('/', (req, res) => {
  res.json(computeReminders());
});

module.exports = router;
