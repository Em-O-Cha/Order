// ดึงฟังก์ชันที่หน้าเว็บใช้อ่าน/คำนวณ ออกจาก Members.gs (Apps Script "Members LINE") มาเป็นโมดูลให้
// Edge Function shop-read รันบนสำเนาชีตใน Supabase — โค้ดถูกคัดลอกตามต้นฉบับทุกตัวอักษร ไม่แปลงตรรกะ
//
// ใช้: npm install && node extract.mjs <path/to/Members.gs> ../../supabase/functions/shop-read/gas_port.js
//
// ทุกครั้งที่แก้ Members.gs ในส่วนที่เกี่ยวกับส่วนลด/สิทธิ์/แต้ม/ระดับสมาชิก ต้องรันสคริปต์นี้ใหม่แล้ว deploy
// shop-read ใหม่ ไม่งั้นหน้าเว็บจะเห็นตรรกะเก่า (ตอนสั่งซื้อจริง Apps Script คำนวณซ้ำเสมอจึงไม่เก็บเงินผิด)

import fs from 'node:fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

// action ที่ Edge Function ให้บริการ (ชื่อฟังก์ชันใน Members.gs)
const ROOTS = [
  'getShopBootstrap', 'getPrivilegesPanelData', 'checkMemberStatus', 'getMyPrivileges',
  'getPointsHistory', 'getActiveCoupons', 'getReferralPublicStatus', 'getMyShippingAddress',
  'getMyOrderHistory', 'checkShopDiscounts', 'checkPendingOrderPromoStillValid',
  'getTierConfig_', 'getSignupBonusPoints_', 'getSignupPrivilegeConfig_', 'getPointsRedeemConfig_',
  'decodeItemsB64_',
];

// ฟังก์ชันที่ตัวจำลองเขียนแทน (ตรวจโทเคน LINE ทำใน Edge Function แล้ว, log ส่งไป console แทนชีต)
const REPLACED = new Set([
  'verifyLineIdToken_', 'logErrorToSheet_', 'ensureDebugLogSheet_', 'logSlowAction_',
  'logRegistrationQueueWait_',
]);

// ตัวแปรที่ห้ามติดไปด้วย (ความลับ) — ถ้าโค้ดที่ดึงมาอ้างถึง ให้หยุดทำงานแทนที่จะคัดลอก
const FORBIDDEN = new Set(['LINE_CHANNEL_ACCESS_TOKEN', 'ADMIN_PIN']);

const [,, inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('ใช้: node extract.mjs <Members.gs> <output.js>');
  process.exit(1);
}
const src = fs.readFileSync(inputPath, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script' });

// รายการระดับบนสุด: ชื่อที่ประกาศ -> node
const items = [];
const byName = new Map();
for (const node of ast.body) {
  let names = [];
  if (node.type === 'FunctionDeclaration') names = [node.id.name];
  else if (node.type === 'VariableDeclaration') names = node.declarations.map((d) => d.id.name);
  else continue;
  const item = { node, names, refs: null };
  items.push(item);
  for (const n of names) byName.set(n, item);
}

function referencedNames(node) {
  const out = new Set();
  walk.full(node, (n) => { if (n.type === 'Identifier') out.add(n.name); });
  // ชื่อ property (a.b) และ key ของ object ก็เป็น Identifier ด้วย เก็บเกินไว้ก่อนได้ (ดึงโค้ดเกินมานิดหน่อย
  // ไม่ทำให้ผิด) แต่ตัดชื่อที่ตรงกับ property ล้วนๆ ของ GAS ออกไม่ได้ จึงใช้ closure ด้านล่างกรองเฉพาะชื่อที่
  // ประกาศไว้ระดับบนสุดใน Members.gs เท่านั้น
  return out;
}

const needed = new Set();
const stack = [...ROOTS];
while (stack.length) {
  const name = stack.pop();
  if (REPLACED.has(name)) continue;
  const item = byName.get(name);
  if (!item) throw new Error('ไม่พบ ' + name + ' ใน Members.gs');
  if (needed.has(item)) continue;
  needed.add(item);
  item.refs = item.refs || referencedNames(item.node);
  for (const r of item.refs) {
    if (byName.has(r) && !REPLACED.has(r)) {
      if (FORBIDDEN.has(r)) throw new Error('โค้ดที่ดึงมาอ้างถึง ' + r + ' (ความลับ) — ตรวจสอบก่อน');
      if (!needed.has(byName.get(r))) stack.push(r);
    }
  }
}

const chosen = items.filter((it) => needed.has(it));
const body = chosen.map((it) => src.slice(it.node.start, it.node.end)).join('\n\n');
const exported = ROOTS.join(', ');

const out = `// สร้างอัตโนมัติจาก Members.gs ด้วย tools/gas-port/extract.mjs — ห้ามแก้ไฟล์นี้ตรงๆ ให้รันสคริปต์ใหม่แทน
// ${chosen.length} รายการ (${chosen.filter((it) => it.node.type === 'FunctionDeclaration').length} ฟังก์ชัน)
/* eslint-disable */
export function createGas(env) {
  const { SpreadsheetApp, CacheService, PropertiesService, Utilities, Logger, LockService, Session, Date,
          verifyLineIdToken_, logErrorToSheet_, ensureDebugLogSheet_, logSlowAction_, logRegistrationQueueWait_ } = env;

${body}

  return { ${exported} };
}
`;
fs.writeFileSync(outputPath, out);
console.log(`เขียน ${outputPath}: ${chosen.length} รายการ, ${out.split('\n').length} บรรทัด`);
