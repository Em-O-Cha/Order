const db = require('../db');

const QUOTATION_EXPIRY_WARN_DAYS = Number(process.env.QUOTATION_EXPIRY_WARN_DAYS || 3);
const DELIVERY_WARN_DAYS = Number(process.env.DELIVERY_WARN_DAYS || 2);

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function customerName(customerId) {
  const c = db.get('customers').find({ id: customerId }).value();
  if (!c) return 'ไม่ทราบชื่อลูกค้า';
  return c.type === 'company' ? (c.companyName || c.name) : c.name;
}

// รวมรายการแจ้งเตือนทั้งหมด: ใบเสนอราคาใกล้หมดอายุ, วันจัดส่งใกล้ถึง, นัดติดตามลูกค้าที่ครบกำหนด
function computeReminders() {
  const documents = db.get('documents').value();
  const deals = db.get('deals').value();
  const followups = db.get('followups').value();
  const reminders = [];

  documents.forEach((doc) => {
    if (doc.docType === 'quotation' && doc.expiryDate) {
      const d = daysUntil(doc.expiryDate);
      if (d !== null && d <= QUOTATION_EXPIRY_WARN_DAYS) {
        reminders.push({
          id: `quo-${doc.id}`,
          type: 'quotation_expiry',
          severity: d < 0 ? 'overdue' : (d <= 1 ? 'urgent' : 'warning'),
          customerId: doc.customerId,
          customerName: customerName(doc.customerId),
          message: d < 0
            ? `ใบเสนอราคา ${doc.docNumber || ''} หมดอายุแล้ว ${Math.abs(d)} วัน`
            : `ใบเสนอราคา ${doc.docNumber || ''} จะหมดอายุใน ${d} วัน`,
          dueDate: doc.expiryDate,
          refId: doc.id,
        });
      }
    }
    if ((doc.docType === 'po' || doc.docType === 'delivery_note') && doc.deliveryDate) {
      const d = daysUntil(doc.deliveryDate);
      if (d !== null && d <= DELIVERY_WARN_DAYS) {
        reminders.push({
          id: `del-${doc.id}`,
          type: 'delivery_due',
          severity: d < 0 ? 'overdue' : (d <= 1 ? 'urgent' : 'warning'),
          customerId: doc.customerId,
          customerName: customerName(doc.customerId),
          message: d < 0
            ? `กำหนดจัดส่งของเอกสาร ${doc.docNumber || ''} เลยกำหนดแล้ว ${Math.abs(d)} วัน`
            : `ใกล้ถึงกำหนดจัดส่ง (${doc.docNumber || ''}) ในอีก ${d} วัน`,
          dueDate: doc.deliveryDate,
          refId: doc.id,
        });
      }
    }
  });

  deals.forEach((deal) => {
    if (deal.status === 'open' && deal.deliveryDate) {
      const d = daysUntil(deal.deliveryDate);
      if (d !== null && d <= DELIVERY_WARN_DAYS) {
        reminders.push({
          id: `deal-del-${deal.id}`,
          type: 'delivery_due',
          severity: d < 0 ? 'overdue' : (d <= 1 ? 'urgent' : 'warning'),
          customerId: deal.customerId,
          customerName: customerName(deal.customerId),
          message: d < 0
            ? `ดีล "${deal.title}" เลยกำหนดจัดส่งแล้ว ${Math.abs(d)} วัน`
            : `ดีล "${deal.title}" ใกล้ถึงกำหนดจัดส่งในอีก ${d} วัน`,
          dueDate: deal.deliveryDate,
          refId: deal.id,
        });
      }
    }
  });

  followups.forEach((f) => {
    if (!f.done && f.followUpDate) {
      const d = daysUntil(f.followUpDate);
      if (d !== null && d <= 1) {
        reminders.push({
          id: `fu-${f.id}`,
          type: 'followup_due',
          severity: d < 0 ? 'overdue' : 'warning',
          customerId: f.customerId,
          customerName: customerName(f.customerId),
          message: d < 0
            ? `เลยกำหนดติดตามลูกค้า: ${f.note || ''} (${Math.abs(d)} วันก่อน)`
            : `ถึงกำหนดติดตามลูกค้าวันนี้/พรุ่งนี้: ${f.note || ''}`,
          dueDate: f.followUpDate,
          refId: f.id,
        });
      }
    }
  });

  const severityOrder = { overdue: 0, urgent: 1, warning: 2 };
  reminders.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.dueDate.localeCompare(b.dueDate));
  return reminders;
}

module.exports = { computeReminders, daysUntil };
