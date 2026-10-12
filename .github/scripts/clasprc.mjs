// เขียน ~/.clasprc.json ให้ clasp 2.4.2 จาก secret CLASPRC_JSON
// รับได้ทั้งไฟล์จาก `clasp login` เวอร์ชัน 2 ({"token": …}) และเวอร์ชัน 3 ({"tokens": {"default": …}})
// ถ้าค่าไม่ถูกต้อง จะบอกว่าผิดตรงไหนโดยไม่พิมพ์ค่าลับออกมา
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fail = (msg) => { console.log(`::error::${msg}`); process.exit(1); };

const raw = String(process.env.CLASPRC_JSON || '').replace(/^﻿/, '').trim();
if (!raw) fail('ยังไม่ได้ตั้ง secret CLASPRC_JSON — ดูขั้นตอนที่หัวไฟล์ .github/workflows/deploy-revenue.yml');

let rc;
try {
  rc = JSON.parse(raw);
} catch (e) {
  const hint = raw.includes('refresh_token')
    ? 'มีคำว่า refresh_token อยู่ แต่คัดลอกมาไม่ครบหรือมีข้อความอื่นปน — เปิดไฟล์ .clasprc.json ด้วย Notepad แล้วกด Ctrl+A, Ctrl+C วางใหม่ทั้งหมด'
    : 'ไม่ใช่เนื้อหาของไฟล์ .clasprc.json — ต้องคัดลอกเนื้อหาในไฟล์ (ขึ้นต้นด้วย {) ไม่ใช่ชื่อไฟล์หรือข้อความจากหน้าจอ';
  fail(`CLASPRC_JSON อ่านเป็น JSON ไม่ได้ (ยาว ${raw.length} ตัวอักษร ขึ้นต้นด้วย "${raw[0]}"): ${hint}`);
}

const v3 = rc && rc.tokens && (rc.tokens.default || Object.values(rc.tokens)[0]);
if (v3) {
  if (!v3.refresh_token || !v3.client_id) fail('CLASPRC_JSON (clasp 3) ไม่มี refresh_token/client_id — login ใหม่แล้ววางไฟล์ใหม่');
  rc = {
    token: {
      access_token: v3.access_token,
      refresh_token: v3.refresh_token,
      scope: v3.scope,
      token_type: v3.token_type || 'Bearer',
      id_token: v3.id_token,
      expiry_date: v3.expiry_date || 0,
    },
    oauth2ClientSettings: { clientId: v3.client_id, clientSecret: v3.client_secret, redirectUri: 'http://localhost' },
    isLocalCreds: true,
  };
  console.log('ใช้ไฟล์ login ของ clasp 3 (แปลงให้ clasp 2.4.2 แล้ว)');
} else if (rc && rc.token && rc.token.refresh_token) {
  console.log('ใช้ไฟล์ login ของ clasp 2');
} else {
  fail(`CLASPRC_JSON เป็น JSON แต่ไม่ใช่ไฟล์ login ของ clasp (มีแค่ key: ${Object.keys(rc || {}).join(', ') || '-'}) — วางเนื้อหาไฟล์ .clasprc.json หลัง login`);
}

fs.writeFileSync(path.join(os.homedir(), '.clasprc.json'), JSON.stringify(rc), { mode: 0o600 });
