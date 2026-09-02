const { v4: uuid } = require('uuid');
const db = require('../db');
const { sendMail } = require('./mailer');
const { computeReminders } = require('./reminders');

function buildReportHtml() {
  const customers = db.get('customers').value();
  const deals = db.get('deals').value();
  const today = new Date().toISOString().slice(0, 10);

  const newToday = customers.filter((c) => (c.createdAt || '').slice(0, 10) === today);
  const openDeals = deals.filter((d) => d.status === 'open');
  const wonToday = deals.filter((d) => d.status === 'won' && (d.updatedAt || '').slice(0, 10) === today);
  const reminders = computeReminders();

  const rows = (arr, fn) => (arr.length ? arr.map(fn).join('') : '<tr><td colspan="3" style="color:#888">- ไม่มีรายการ -</td></tr>');

  const html = `
  <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
    <h2 style="color:#a50d0c">รายงานประจำวัน CRM ส่งออกสินค้า - ${today}</h2>
    <ul>
      <li>ลูกค้าใหม่วันนี้: <b>${newToday.length}</b> ราย</li>
      <li>ดีลที่กำลังเปิดอยู่ทั้งหมด: <b>${openDeals.length}</b> ดีล</li>
      <li>ปิดการขายสำเร็จวันนี้: <b>${wonToday.length}</b> ดีล</li>
      <li>รายการที่ต้องแจ้งเตือน/ติดตามด่วน: <b>${reminders.length}</b> รายการ</li>
    </ul>
    <h3>รายการแจ้งเตือนที่ต้องติดตาม</h3>
    <table style="width:100%;border-collapse:collapse" border="1" cellpadding="6">
      <tr style="background:#f5f5f5"><th>ลูกค้า</th><th>เรื่อง</th><th>กำหนด</th></tr>
      ${rows(reminders.slice(0, 20), (r) => `<tr><td>${r.customerName}</td><td>${r.message}</td><td>${r.dueDate || '-'}</td></tr>`)}
    </table>
    <h3>ลูกค้าใหม่วันนี้</h3>
    <table style="width:100%;border-collapse:collapse" border="1" cellpadding="6">
      <tr style="background:#f5f5f5"><th>ชื่อ</th><th>ประเทศ</th><th>ช่องทาง</th></tr>
      ${rows(newToday, (c) => `<tr><td>${c.type === 'company' ? c.companyName : c.name}</td><td>${c.country || '-'}</td><td>${c.contactChannel || '-'}</td></tr>`)}
    </table>
  </div>`;

  return { html, summary: { newToday: newToday.length, openDeals: openDeals.length, wonToday: wonToday.length, reminders: reminders.length } };
}

async function generateAndSendDailyReport() {
  const { html, summary } = buildReportHtml();
  const today = new Date().toISOString().slice(0, 10);
  const subject = `[CRM] รายงานประจำวัน ${today}`;
  const result = await sendMail({ subject, html });

  const report = {
    id: uuid(),
    reportDate: today,
    summary,
    html,
    sent: result.sent,
    sentReason: result.reason || null,
    createdAt: new Date().toISOString(),
  };
  db.get('reports').push(report).write();
  return report;
}

module.exports = { generateAndSendDailyReport, buildReportHtml };
