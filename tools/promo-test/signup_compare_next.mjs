// เทียบ member-signup (ตัวจริง) กับ member-signup-next ด้วย registerMemberDryRun (ไม่บันทึกอะไร)
// สมัครจำลองด้วย UID ที่ยังไม่เป็นสมาชิก + ชื่อยาว — เทียบผลทั้งหมด ยกเว้นข้อความต้อนรับ (deferred) ที่ตั้งใจแก้
// node signup_compare_next.mjs
import { sql } from './sql.mjs';
import { callEdge } from './edge_call.mjs';
const body = { action: 'registerMemberDryRun', asUid: 'U_signup_compare_test_0001', asName: 'ทดสอบ', phoneNumber: '0899999999',
  fullName: 'ธัญญารัตน์ เหล่านายอ ทดสอบชื่อยาวมากเป็นพิเศษ', birthday: '1990-05-01', referrerCode: '' };
const [L, N] = [await callEdge('member-signup', [body]), await callEdge('member-signup-next', [body])];
const strip = (b) => JSON.stringify(b, (k, v) => (k === 'deferred' ? undefined : v)).replace(/\{"\$date":"[^"]+"\}/g, 'D').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z/g, 'T');
console.log('status', L[0].status, N[0].status);
console.log('result live:', JSON.stringify(L[0].body?.result).slice(0, 200));
console.log('same (ไม่นับข้อความต้อนรับ):', strip(L[0].body) === strip(N[0].body));
const welcome = (b) => JSON.stringify(b?.deferred || '');
const nameRow = (s) => (s.match(/"text":"ธัญญารัตน์[^"]*"[^}]*\}/) || [''])[0];
console.log('live ชื่อ:', nameRow(welcome(L[0].body)));
console.log('next ชื่อ:', nameRow(welcome(N[0].body)));
