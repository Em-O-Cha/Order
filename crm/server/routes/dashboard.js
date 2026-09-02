const express = require('express');
const router = express.Router();
const db = require('../db');
const { computeReminders } = require('../services/reminders');
const { OPEN_STAGES } = require('../constants');

router.get('/', (req, res) => {
  const customers = db.get('customers').value();
  const deals = db.get('deals').value();
  const documents = db.get('documents').value();

  const byCountry = {};
  customers.forEach((c) => {
    if (!c.country) return;
    byCountry[c.country] = (byCountry[c.country] || 0) + 1;
  });

  const byType = { individual: 0, company: 0 };
  customers.forEach((c) => { if (byType[c.type] !== undefined) byType[c.type] += 1; });

  const byStage = {};
  deals.forEach((d) => { byStage[d.stage] = (byStage[d.stage] || 0) + 1; });

  const openDeals = deals.filter((d) => d.status === 'open');
  const wonDeals = deals.filter((d) => d.status === 'won');
  const lostDeals = deals.filter((d) => d.status === 'lost');

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const wonThisMonth = wonDeals.filter((d) => (d.updatedAt || '').slice(0, 7) === thisMonth);
  const revenueThisMonth = wonThisMonth.reduce((sum, d) => sum + (Number(d.estimatedValue) || 0), 0);
  const pipelineValue = openDeals.reduce((sum, d) => sum + (Number(d.estimatedValue) || 0), 0);

  const newCustomersLast30 = customers.filter((c) => {
    const created = new Date(c.createdAt);
    return (now - created) / (1000 * 60 * 60 * 24) <= 30;
  }).length;

  res.json({
    totals: {
      customers: customers.length,
      openDeals: openDeals.length,
      wonDeals: wonDeals.length,
      lostDeals: lostDeals.length,
      documents: documents.length,
      newCustomersLast30,
    },
    revenue: {
      pipelineValue,
      revenueThisMonth,
      wonThisMonthCount: wonThisMonth.length,
    },
    byCountry,
    byType,
    byStage,
    reminders: computeReminders(),
    openStages: OPEN_STAGES,
  });
});

module.exports = router;
