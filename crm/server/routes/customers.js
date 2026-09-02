const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db');

function now() {
  return new Date().toISOString();
}

// GET /api/customers?query=&country=&stage=&type=
router.get('/', (req, res) => {
  const { query, country, type } = req.query;
  let list = db.get('customers').value();

  if (query) {
    const q = query.toLowerCase();
    list = list.filter((c) =>
      [c.name, c.companyName, c.contactPerson, c.phone, c.email]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q))
    );
  }
  if (country) list = list.filter((c) => c.country === country);
  if (type) list = list.filter((c) => c.type === type);

  const deals = db.get('deals').value();
  const withStage = list.map((c) => {
    const customerDeals = deals.filter((d) => d.customerId === c.id);
    const openDeal = customerDeals.find((d) => d.status === 'open');
    return {
      ...c,
      dealCount: customerDeals.length,
      currentStage: openDeal ? openDeal.stage : (customerDeals[0] ? customerDeals[0].stage : 'new'),
    };
  });

  res.json(withStage.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.type || !b.name) {
    return res.status(400).json({ error: 'ต้องระบุประเภทลูกค้า (type) และชื่อ (name)' });
  }
  const customer = {
    id: uuid(),
    type: b.type, // individual | company
    name: b.name,
    companyName: b.companyName || '',
    taxId: b.taxId || '',
    contactPerson: b.contactPerson || '',
    phone: b.phone || '',
    email: b.email || '',
    lineId: b.lineId || '',
    address: b.address || '',
    country: b.country || '',
    contactChannel: b.contactChannel || '',
    sourceDetail: b.sourceDetail || '',
    notes: b.notes || '',
    createdAt: now(),
    updatedAt: now(),
  };
  db.get('customers').push(customer).write();
  res.status(201).json(customer);
});

router.get('/:id', (req, res) => {
  const customer = db.get('customers').find({ id: req.params.id }).value();
  if (!customer) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
  const deals = db.get('deals').filter({ customerId: customer.id }).value();
  const documents = db.get('documents').filter({ customerId: customer.id }).value();
  const followups = db.get('followups').filter({ customerId: customer.id }).value();
  const insights = db.get('ai_insights').filter({ customerId: customer.id }).value()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ ...customer, deals, documents, followups, insights });
});

router.put('/:id', (req, res) => {
  const customer = db.get('customers').find({ id: req.params.id }).value();
  if (!customer) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
  const b = req.body || {};
  const updated = { ...customer, ...b, id: customer.id, updatedAt: now() };
  db.get('customers').find({ id: req.params.id }).assign(updated).write();
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  db.get('customers').remove({ id: req.params.id }).write();
  db.get('deals').remove({ customerId: req.params.id }).write();
  db.get('documents').remove({ customerId: req.params.id }).write();
  db.get('followups').remove({ customerId: req.params.id }).write();
  res.json({ ok: true });
});

// ---- Deals ----
router.get('/:id/deals', (req, res) => {
  res.json(db.get('deals').filter({ customerId: req.params.id }).value());
});

router.post('/:id/deals', (req, res) => {
  const customer = db.get('customers').find({ id: req.params.id }).value();
  if (!customer) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
  const b = req.body || {};
  const deal = {
    id: uuid(),
    customerId: customer.id,
    title: b.title || `ดีล ${customer.name}`,
    stage: b.stage || 'new',
    productInterest: b.productInterest || '',
    estimatedValue: b.estimatedValue || 0,
    currency: b.currency || 'THB',
    expectedCloseDate: b.expectedCloseDate || null,
    deliveryDate: b.deliveryDate || null,
    status: b.status || 'open', // open | won | lost
    notes: b.notes || '',
    createdAt: now(),
    updatedAt: now(),
  };
  db.get('deals').push(deal).write();
  db.get('customers').find({ id: customer.id }).assign({ updatedAt: now() }).write();
  res.status(201).json(deal);
});

router.put('/deals/:dealId', (req, res) => {
  const deal = db.get('deals').find({ id: req.params.dealId }).value();
  if (!deal) return res.status(404).json({ error: 'ไม่พบดีล' });
  const updated = { ...deal, ...req.body, id: deal.id, updatedAt: now() };
  db.get('deals').find({ id: req.params.dealId }).assign(updated).write();
  res.json(updated);
});

router.delete('/deals/:dealId', (req, res) => {
  db.get('deals').remove({ id: req.params.dealId }).write();
  res.json({ ok: true });
});

// ---- Follow-ups ----
router.get('/:id/followups', (req, res) => {
  res.json(db.get('followups').filter({ customerId: req.params.id }).value());
});

router.post('/:id/followups', (req, res) => {
  const customer = db.get('customers').find({ id: req.params.id }).value();
  if (!customer) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
  const b = req.body || {};
  const followup = {
    id: uuid(),
    customerId: customer.id,
    dealId: b.dealId || null,
    type: b.type || 'note',
    note: b.note || '',
    followUpDate: b.followUpDate || null,
    done: false,
    createdAt: now(),
  };
  db.get('followups').push(followup).write();
  res.status(201).json(followup);
});

router.put('/followups/:followupId', (req, res) => {
  const f = db.get('followups').find({ id: req.params.followupId }).value();
  if (!f) return res.status(404).json({ error: 'ไม่พบข้อมูล' });
  const updated = { ...f, ...req.body, id: f.id };
  db.get('followups').find({ id: req.params.followupId }).assign(updated).write();
  res.json(updated);
});

router.delete('/followups/:followupId', (req, res) => {
  db.get('followups').remove({ id: req.params.followupId }).write();
  res.json({ ok: true });
});

module.exports = router;
