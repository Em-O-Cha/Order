const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const db = require('../db');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uuid()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

function now() {
  return new Date().toISOString();
}

// GET /api/documents?customerId=&type=
router.get('/', (req, res) => {
  const { customerId, type } = req.query;
  let list = db.get('documents').value();
  if (customerId) list = list.filter((d) => d.customerId === customerId);
  if (type) list = list.filter((d) => d.docType === type);
  res.json(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

// POST /api/documents  (multipart/form-data, field name: file)
router.post('/', upload.single('file'), (req, res) => {
  const b = req.body || {};
  if (!b.customerId || !b.docType) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'ต้องระบุ customerId และ docType' });
  }
  const customer = db.get('customers').find({ id: b.customerId }).value();
  if (!customer) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'ไม่พบลูกค้า' });
  }

  const doc = {
    id: uuid(),
    customerId: b.customerId,
    dealId: b.dealId || null,
    docType: b.docType, // quotation | po | delivery_note | receipt
    docNumber: b.docNumber || '',
    fileName: req.file ? req.file.originalname : (b.fileName || null),
    filePath: req.file ? `/uploads/${path.basename(req.file.path)}` : null,
    issueDate: b.issueDate || null,
    expiryDate: b.expiryDate || null, // สำหรับใบเสนอราคา
    deliveryDate: b.deliveryDate || null, // สำหรับใบสั่งซื้อ/ใบส่งของ
    amount: b.amount ? Number(b.amount) : null,
    currency: b.currency || 'THB',
    notes: b.notes || '',
    createdAt: now(),
  };
  db.get('documents').push(doc).write();
  res.status(201).json(doc);
});

router.delete('/:id', (req, res) => {
  const doc = db.get('documents').find({ id: req.params.id }).value();
  if (doc && doc.filePath) {
    const p = path.join(uploadDir, path.basename(doc.filePath));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  db.get('documents').remove({ id: req.params.id }).write();
  res.json({ ok: true });
});

module.exports = router;
