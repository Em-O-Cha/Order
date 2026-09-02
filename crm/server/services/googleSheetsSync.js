const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { v4: uuid } = require('uuid');
const db = require('../db');

function loadCredentials() {
  const credPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credPath) return null;
  const resolved = path.isAbsolute(credPath) ? credPath : path.join(__dirname, '..', '..', credPath);
  if (!fs.existsSync(resolved)) return null;
  return JSON.parse(fs.readFileSync(resolved, 'utf-8'));
}

async function getSheetsClient() {
  const credentials = loadCredentials();
  if (!credentials) return null;
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

// แปลงหัวตารางแบบยืดหยุ่น รองรับชื่อคอลัมน์จาก Google Sheet "Master Data Sales" > "SKU ส่งออก"
function mapRow(headers, row) {
  const get = (name) => {
    const idx = headers.findIndex((h) => (h || '').trim().toLowerCase() === name.toLowerCase());
    return idx >= 0 ? (row[idx] || '') : '';
  };
  return {
    productNameTh: get('ProductName') || get('Product_Name'),
    productNameEn: get('ProductName (Eng)'),
    category: get('Category'),
    price: Number(String(get('Price')).replace(/,/g, '')) || 0,
    status: get('Status'),
    pack: get('Pack'),
    priceOnLine: get('Price on Line'),
    link: get('Link'),
    weight: get('Weight'),
    packingSize: get('Packing size'),
  };
}

async function syncSkuSheet() {
  const sheets = await getSheetsClient();
  if (!sheets) {
    throw new Error('ยังไม่ได้ตั้งค่า GOOGLE_SERVICE_ACCOUNT_JSON - ดูวิธีตั้งค่าใน README');
  }
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'SKU ส่งออก';
  const range = process.env.GOOGLE_SHEET_RANGE || 'A1:M500';

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tab}'!${range}`,
  });

  const rows = resp.data.values || [];
  if (rows.length < 2) throw new Error(`ไม่พบข้อมูลในแท็บ "${tab}"`);
  const headers = rows[0];
  const skus = rows.slice(1)
    .filter((r) => r.some((cell) => cell))
    .map((r) => ({ id: uuid(), ...mapRow(headers, r), syncedAt: new Date().toISOString() }));

  db.set('skus', skus).write();
  db.set('meta.sku_last_synced', new Date().toISOString()).write();
  return skus;
}

module.exports = { syncSkuSheet };
