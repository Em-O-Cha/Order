const nodemailer = require('nodemailer');

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  if (!isConfigured()) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// ส่งอีเมล ถ้ายังไม่ตั้งค่า SMTP จะไม่ error แต่คืนค่า sent:false (ไว้บันทึกลงระบบแทน)
async function sendMail({ subject, html, to }) {
  const transport = getTransport();
  const recipients = to || (process.env.REPORT_TO_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);

  if (!transport || recipients.length === 0) {
    console.log(`[mailer] ยังไม่ได้ตั้งค่า SMTP หรือไม่มีผู้รับ - ข้ามการส่งอีเมลจริง: ${subject}`);
    return { sent: false, reason: !transport ? 'smtp_not_configured' : 'no_recipients' };
  }

  await transport.sendMail({
    from: process.env.REPORT_FROM_EMAIL || process.env.SMTP_USER,
    to: recipients.join(','),
    subject,
    html,
  });
  return { sent: true };
}

module.exports = { sendMail, isConfigured };
