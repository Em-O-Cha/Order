// ==================== ระบบงานองค์กร (หลายแผนก) — Web App ====================
//
// โครงหน้าตาเว็บแอป: แต่ละแผนกเข้าด้วยรหัสผ่านของตัวเอง แยกกันโดยสิ้นเชิง
//   - กรอกรหัสผ่านทุกครั้งที่เข้า (ไม่จำรหัส/ไม่จำการเข้าระบบไว้ในเบราว์เซอร์ รีเฟรชหน้า = ต้องกรอกใหม่)
//   - รหัสผ่านไม่อยู่ในโค้ด: เก็บเป็นค่าแฮช (SHA-256 + salt) ใน Script Properties ตั้งด้วย Setup.gs
//   - หลังเข้าระบบ ได้ "ตั๋ว" ที่ใช้ได้กับแผนกนั้นแผนกเดียว ทุกฟังก์ชันที่อ่าน/เขียนข้อมูลต้องตรวจตั๋วก่อน
//     และเปิดได้เฉพาะ Google Sheet ของแผนกในตั๋วเท่านั้น (แผนกอื่นขอข้อมูลข้ามแผนกไม่ได้)
//   - ใส่รหัสผิด 5 ครั้งติด ล็อกแผนกนั้น 10 นาที
//
// ขั้นต่อไป (รอข้อมูลจากผู้ใช้): ใส่ sheetId / ownerEmail ของแต่ละแผนกด้านล่าง แล้วเพิ่มหน้าฟอร์มกรอกข้อมูล

// ==================== CONFIG ====================
var APP_NAME = 'ระบบงานองค์กร';

// โหมดการติดตั้ง
//   ''      = ระบบกลาง (แบบ 1) — ติดตั้งในบัญชีกลาง ทุกแผนกเข้าผ่านลิงก์เดียว
//   'HR' ฯลฯ = ระบบของแผนกเดียว (แบบ 2) — ติดตั้งสำเนาในบัญชีอีเมลของแผนกนั้น ข้อมูลไม่ผ่านบัญชีกลางเลย
// การย้ายแผนกจากแบบ 1 ไปแบบ 2 ดูขั้นตอนใน README.md
var ONLY_DEPT = '';

// sheetId    = ID ของ Google Sheet ของแผนก (ส่วนยาวๆ ใน URL ระหว่าง /d/ กับ /edit) — ใส่ภายหลัง
// ownerEmail = อีเมลเจ้าของข้อมูลของแผนก (ต้องแชร์ชีตให้บัญชีเจ้าของสคริปต์เป็น "ผู้แก้ไข")
// menus      = เมนูในหน้าแผนก (ตอนนี้เป็นตัวอย่าง รอกำหนดฟอร์มจริง)
// appUrl     = (เฉพาะระบบกลาง) ลิงก์ /exec ของระบบที่แผนกย้ายไปติดตั้งเองแล้ว (แบบ 2) — ใส่แล้วการ์ดในหน้าแรก
//              จะพาไปลิงก์นั้นแทน และระบบกลางจะไม่ให้เข้าแผนกนี้/ไม่แตะชีตของแผนกนี้อีก เว้นว่าง = ใช้ระบบกลาง
var DEPARTMENTS = [
  { key: 'HR',   name: 'ฝ่ายบุคคล',          en: 'Human Resources',     color: '#2563eb',
    sheetId: '', ownerEmail: '', appUrl: '',
    menus: ['ข้อมูลพนักงาน', 'ลงเวลา / การลา', 'สวัสดิการ', 'ประเมินผลงาน'] },
  { key: 'ACC',  name: 'ฝ่ายบัญชี',          en: 'Accounting',          color: '#059669',
    sheetId: '', ownerEmail: '', appUrl: '',
    menus: ['รายรับ - รายจ่าย', 'ใบแจ้งหนี้ / ใบเสร็จ', 'เจ้าหนี้ / ลูกหนี้', 'รายงานภาษี'] },
  { key: 'PUR',  name: 'จัดซื้อ & สต๊อกสินค้า', en: 'Purchasing & Stock',  color: '#d97706',
    sheetId: '', ownerEmail: '', appUrl: '',
    menus: ['ใบขอซื้อ (PR)', 'ใบสั่งซื้อ (PO)', 'รับสินค้าเข้าสต๊อก', 'เบิก-จ่าย / คงเหลือ'] },
  { key: 'QA',   name: 'ฝ่ายประกันคุณภาพ',   en: 'Quality Assurance',   color: '#7c3aed',
    sheetId: '', ownerEmail: '', appUrl: '',
    menus: ['ตรวจรับวัตถุดิบ', 'ตรวจสินค้าสำเร็จรูป', 'ข้อร้องเรียน / NC', 'เอกสารมาตรฐาน'] },
  { key: 'RD',   name: 'วิจัยและพัฒนา',       en: 'Research & Development', color: '#db2777',
    sheetId: '', ownerEmail: '', appUrl: '',
    menus: ['โครงการพัฒนา', 'สูตร / ส่วนผสม', 'ผลการทดสอบ', 'ตัวอย่างสินค้า'] },
  { key: 'PROD', name: 'ฝ่ายผลิต',           en: 'Production',          color: '#0891b2',
    sheetId: '', ownerEmail: '', appUrl: '',
    menus: ['แผนการผลิต', 'บันทึกการผลิต', 'เครื่องจักร / ซ่อมบำรุง', 'ของเสีย / สูญเสีย'] },
  { key: 'SHE',  name: 'ความปลอดภัยและสิ่งแวดล้อม', en: 'Safety & Environment', color: '#65a30d',
    sheetId: '', ownerEmail: '', appUrl: '',
    menus: ['อุบัติเหตุ / เหตุการณ์เกือบเกิด', 'ตรวจความปลอดภัย', 'อบรมความปลอดภัย', 'ของเสีย / สิ่งแวดล้อม'] },
  { key: 'LOG',  name: 'ขนส่งและคลัง',       en: 'Logistics & Warehouse', color: '#475569',
    sheetId: '', ownerEmail: '', appUrl: '',
    menus: ['รับสินค้าเข้าคลัง', 'จ่ายสินค้า / ส่งของ', 'ตารางรถขนส่ง', 'สินค้าคงคลัง'] }
];

var SESSION_TTL_SEC_ = 30 * 60;     // ไม่ได้ใช้งาน 30 นาที ต้องเข้าใหม่
var MAX_FAILS_ = 5;                  // ใส่รหัสผิดได้กี่ครั้งก่อนล็อก
var LOCK_SEC_ = 10 * 60;             // ล็อกนานเท่าไร
var HASH_ROUNDS_ = 300;

// ==================== Web App ====================
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// รายชื่อแผนกสำหรับหน้าแรก (ไม่มี sheetId / อีเมล)
function getDepartments() {
  return activeDepartments_().map(function (d) {
    return { key: d.key, name: d.name, en: d.en, color: d.color, appUrl: ONLY_DEPT ? '' : (d.appUrl || '') };
  });
}

function login(deptKey, password) {
  var dept = findDept_(deptKey);
  if (!dept) return { ok: false, error: 'ไม่พบแผนก' };
  password = String(password || '');
  if (!password) return { ok: false, error: 'กรุณากรอกรหัสผ่าน' };

  var cache = CacheService.getScriptCache();
  var lockKey = 'lock_' + dept.key, failKey = 'fail_' + dept.key;
  if (cache.get(lockKey)) {
    return { ok: false, error: 'ใส่รหัสผิดหลายครั้ง แผนกนี้ถูกล็อกชั่วคราว ลองใหม่ในอีก 10 นาที' };
  }
  var stored = PropertiesService.getScriptProperties().getProperty(pwPropKey_(dept.key));
  if (!stored) return { ok: false, error: 'แผนกนี้ยังไม่ได้ตั้งรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบ' };

  if (!verifyPassword_(password, stored)) {
    var fails = Number(cache.get(failKey) || 0) + 1;
    if (fails >= MAX_FAILS_) {
      cache.put(lockKey, '1', LOCK_SEC_);
      cache.remove(failKey);
      return { ok: false, error: 'ใส่รหัสผิด ' + MAX_FAILS_ + ' ครั้ง แผนกนี้ถูกล็อก 10 นาที' };
    }
    cache.put(failKey, String(fails), LOCK_SEC_);
    return { ok: false, error: 'รหัสผ่านไม่ถูกต้อง (เหลือ ' + (MAX_FAILS_ - fails) + ' ครั้ง)' };
  }

  cache.remove(failKey);
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  cache.put('sess_' + token, dept.key, SESSION_TTL_SEC_);
  return { ok: true, token: token, dept: deptView_(dept) };
}

function logout(token) {
  if (token) CacheService.getScriptCache().remove('sess_' + token);
  return { ok: true };
}

// ข้อมูลหน้าหลักของแผนก — คืนเฉพาะแผนกที่อยู่ในตั๋วเท่านั้น
function getDepartmentHome(token) {
  var dept = requireDept_(token);
  var view = deptView_(dept);
  view.sheet = sheetStatus_(dept);
  return { ok: true, dept: view };
}

// ==================== ใช้ภายใน ====================
// แผนกที่การติดตั้งนี้แสดง (ระบบกลาง = ทุกแผนก, ระบบแผนกเดียว = แผนกนั้น)
function activeDepartments_() {
  if (!ONLY_DEPT) return DEPARTMENTS;
  return DEPARTMENTS.filter(function (d) { return d.key === ONLY_DEPT; });
}

// แผนกที่การติดตั้งนี้ "ดูแลข้อมูล" — แผนกที่ย้ายไปใช้ระบบของตัวเองแล้ว (มี appUrl) ระบบกลางจะหาไม่เจอ
// จึงเข้าระบบ/เปิดชีตของแผนกนั้นผ่านระบบกลางไม่ได้
function findDept_(key) {
  var list = activeDepartments_();
  for (var i = 0; i < list.length; i++) {
    if (list[i].key === key && (ONLY_DEPT || !list[i].appUrl)) return list[i];
  }
  return null;
}

function deptView_(d) {
  return { key: d.key, name: d.name, en: d.en, color: d.color, menus: d.menus.slice(), ownerEmail: d.ownerEmail || '' };
}

// ตรวจตั๋ว + ต่ออายุ (sliding) — คืนแผนกของตั๋ว ใช้ในทุกฟังก์ชันที่แตะข้อมูล
function requireDept_(token) {
  var cache = CacheService.getScriptCache();
  var key = token ? cache.get('sess_' + token) : null;
  var dept = key ? findDept_(key) : null;
  if (!dept) throw new Error('SESSION_EXPIRED');
  cache.put('sess_' + token, key, SESSION_TTL_SEC_);
  return dept;
}

// เปิด Google Sheet ของแผนกในตั๋วเท่านั้น — ฟังก์ชันอ่าน/เขียนข้อมูลในอนาคตให้เรียกผ่านตัวนี้เสมอ
function openDeptSpreadsheet_(dept) {
  if (!dept.sheetId) throw new Error('แผนกนี้ยังไม่ได้เชื่อม Google Sheet');
  return SpreadsheetApp.openById(dept.sheetId);
}

function sheetStatus_(dept) {
  if (!dept.sheetId) return { connected: false, message: 'ยังไม่ได้เชื่อม Google Sheet' };
  try {
    var ss = openDeptSpreadsheet_(dept);
    return { connected: true, title: ss.getName(), tabs: ss.getSheets().map(function (s) { return s.getName(); }) };
  } catch (e) {
    return { connected: false, message: 'เปิดชีตไม่ได้ — ตรวจว่าแชร์ชีตให้บัญชีเจ้าของสคริปต์แล้ว' };
  }
}

function pwPropKey_(deptKey) { return 'PW_' + deptKey; }

function hashPassword_(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  for (var i = 1; i < HASH_ROUNDS_; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes.concat(Utilities.newBlob(salt).getBytes()));
  }
  return Utilities.base64Encode(bytes);
}

function verifyPassword_(password, stored) {
  var parts = String(stored).split('$');
  if (parts.length !== 2) return false;
  var a = hashPassword_(password, parts[0]), b = parts[1];
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
