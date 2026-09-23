// สร้างอัตโนมัติจาก Members.gs ด้วย tools/gas-port/extract.mjs (target member-signup) — ห้ามแก้ไฟล์นี้ตรงๆ
// ให้รันสคริปต์ใหม่แทน — 34 รายการ (24 ฟังก์ชัน)
/* eslint-disable */
export function createGas(env) {
  const { SpreadsheetApp, CacheService, PropertiesService, Utilities, Logger, LockService, Session, Date,
          verifyLineIdToken_, logErrorToSheet_, ensureDebugLogSheet_, logSlowAction_, logRegistrationQueueWait_, sendLineMessages_, grantReferralRewardOnSignupIfNeeded_ } = env;

var MEMBERS_SHEET_ID = '15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk';

var MEMBERS_SHEET_NAME = 'Members';

var _sheetCache_ = {};

function ensureMembersSheet_() {
  if (_sheetCache_.members) return _sheetCache_.members;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName(MEMBERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MEMBERS_SHEET_NAME);
    sheet.appendRow(['LINE UID', 'ชื่อที่แสดงใน LINE', 'รูปโปรไฟล์', 'เบอร์โทร', 'วันที่สมัคร', 'แต้มสะสม', 'ระดับ Tier', 'ที่อยู่จัดส่งล่าสุด', 'จังหวัดล่าสุด', 'ชื่อ-นามสกุล', 'วันเกิด', 'ยอดซื้อสะสม', 'รหัสสมาชิก', 'แนะนำโดย(LINE UID ผู้แนะนำ)', 'ให้รางวัลแนะนำเพื่อนแล้ว(TRUE/FALSE)', 'บล็อก LINE OA แล้ว(TRUE/FALSE)', 'วันที่เช็ค', 'บล็อกครั้งแรกเมื่อ(ประมาณ)', 'บล็อกเก็บเงินปลายทาง(TRUE/FALSE)', 'เหตุผล/วันที่บล็อกเก็บเงินปลายทาง']);
  } else if (sheet.getLastColumn() < 20) {
    if (sheet.getLastColumn() < 8) sheet.getRange(1, 8).setValue('ที่อยู่จัดส่งล่าสุด');
    if (sheet.getLastColumn() < 9) sheet.getRange(1, 9).setValue('จังหวัดล่าสุด');
    if (sheet.getLastColumn() < 12) sheet.getRange(1, 10, 1, 3).setValues([['ชื่อ-นามสกุล', 'วันเกิด', 'ยอดซื้อสะสม']]);
    if (sheet.getLastColumn() < 13) sheet.getRange(1, 13).setValue('รหัสสมาชิก');
    // ⚡ เพิ่ม (25/8/69) — คอลัมน์ 14-15 สำหรับระบบแนะนำเพื่อน (MGM): เก็บว่าใครแนะนำสมาชิกคนนี้มา (LINE UID
    // ของผู้แนะนำ) และเช็คว่าให้รางวัลแนะนำเพื่อนไปแล้วหรือยัง (กันให้รางวัลซ้ำ ถ้าทริกเกอร์เป็น "ซื้อครั้งแรก")
    if (sheet.getLastColumn() < 14) sheet.getRange(1, 14).setValue('แนะนำโดย(LINE UID ผู้แนะนำ)');
    if (sheet.getLastColumn() < 15) sheet.getRange(1, 15).setValue('ให้รางวัลแนะนำเพื่อนแล้ว(TRUE/FALSE)');
    // ⚡ เพิ่ม — คอลัมน์ 16-18: สถานะบล็อก LINE OA ของลูกค้าคนนี้ (TRUE/FALSE), เวลาที่เช็คล่าสุด, และเวลาที่
    // "เช็คเจอว่าบล็อกครั้งแรก" (ประมาณ ไม่ใช่เวลาที่กดบล็อกจริง เพราะ LINE ไม่มี webhook แจ้งตอนนี้ รู้ได้แค่
    // ช่วงระหว่างเช็คสองรอบล่าสุดเท่านั้น) อัปเดตโดย syncBlockedMembersStatus() (เช็คทุกคนพร้อมกัน จาก
    // followers/ids) หรือ markMemberBlockedStatus_() (อัปเดตทันทีทีละคน ตอน sendLineMessages_ ส่งข้อความ
    // แล้วเจอสัญญาณว่าโดนบล็อก) — ถ้าปลดบล็อกแล้วบล็อกใหม่ภายหลัง จะนับเป็นรอบใหม่ (รีเซ็ตเวลาให้)
    if (sheet.getLastColumn() < 16) sheet.getRange(1, 16).setValue('บล็อก LINE OA แล้ว(TRUE/FALSE)');
    if (sheet.getLastColumn() < 17) sheet.getRange(1, 17).setValue('วันที่เช็ค');
    if (sheet.getLastColumn() < 18) sheet.getRange(1, 18).setValue('บล็อกครั้งแรกเมื่อ(ประมาณ)');
    // ⚡ เพิ่ม (19/9/69) — คอลัมน์ 19-20: บล็อกการชำระแบบเก็บเงินปลายทางเป็นรายคน (ใช้กรณีเคยส่งของแล้ว
    // ลูกค้าไม่ชำระเงิน/ตีกลับ) พร้อมเหตุผลและเวลาที่บล็อก — แอดมินเปิด/ปิดเองได้ที่หน้าจัดการสมาชิก และ
    // ระบบจะติ๊กให้เองอัตโนมัติเมื่อกด "ตีกลับ/ไม่ชำระ" ที่ออเดอร์เก็บเงินปลายทาง (ดู markCodReturned)
    if (sheet.getMaxColumns() < 20) sheet.insertColumnsAfter(sheet.getMaxColumns(), 20 - sheet.getMaxColumns());
    if (sheet.getLastColumn() < 19) sheet.getRange(1, 19).setValue('บล็อกเก็บเงินปลายทาง(TRUE/FALSE)');
    if (sheet.getLastColumn() < 20) sheet.getRange(1, 20).setValue('เหตุผล/วันที่บล็อกเก็บเงินปลายทาง');
  }
  _sheetCache_.members = sheet;
  return sheet;
}

var MEMBERS_IDENTITY_CACHE_KEY_ = 'members_identity_v1';

function getCachedMembersIdentityRows_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(MEMBERS_IDENTITY_CACHE_KEY_);
  if (cached) return JSON.parse(cached);
  var sheet = ensureMembersSheet_();
  var lastRow = sheet.getLastRow();
  var data = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 4).getValues() : [];
  try { cache.put(MEMBERS_IDENTITY_CACHE_KEY_, JSON.stringify(data), 30); } catch (e) {}
  return data;
}

function invalidateMembersIdentityCache_() {
  try { CacheService.getScriptCache().remove(MEMBERS_IDENTITY_CACHE_KEY_); } catch (e) {}
}

var TIER_CONFIG_CACHE_KEY_ = 'tier_config_v1';

var SIGNUP_BONUS_CACHE_KEY_ = 'signup_bonus_v1';

function ensureTierConfigSheet_() {
  if (_sheetCache_.tierConfig) return _sheetCache_.tierConfig;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Tier_Config');
  if (!sheet) {
    sheet = ss.insertSheet('Tier_Config');
    sheet.appendRow(['Key', 'ชื่อระดับ(ไทย)', 'ชื่อระดับ(อังกฤษ)', 'สีบัตร(HEX)', 'สีตัวอักษร(HEX)', 'ยอดซื้อสะสมขั้นต่ำ(บาท)', 'คะแนนสะสมขั้นต่ำ', 'ตัวคูณแต้ม']);
    sheet.appendRow(['start', 'เอมสตาร์ท', 'Members', '#2e7d32', '#ffffff', 0, 0, 1]);
    sheet.appendRow(['silver', 'เอมแฟน', 'Silver', '#9e9e9e', '#2b2b2b', 1000, 200, 1]);
    sheet.appendRow(['gold', 'เอมเลิฟ', 'Gold', '#c9a227', '#3a2a05', 2000, 500, 1.5]);
    sheet.appendRow(['platinum', 'เอม VIP', 'Platinum', '#8c7853', '#fff8e8', 3000, 700, 2]);
  }
  _sheetCache_.tierConfig = sheet;
  return sheet;
}

function getTierConfig_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(TIER_CONFIG_CACHE_KEY_);
  if (cached) return JSON.parse(cached);
  var sheet = ensureTierConfigSheet_();
  var lastRow = sheet.getLastRow();
  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  // ⚡ แก้ — กันแถวว่าง (เช่น มีการจัดฟอร์แมตเซลล์ค้างไว้ทำให้ getLastRow() นับรวมแถวที่ไม่มีข้อมูลจริง)
  // ไม่ให้กลายเป็นระดับสมาชิกผีที่ไม่มีชื่อ (โชว์เป็น "()" ในช่องเลือกระดับของหน้าแอดมิน)
  var tiers = data.filter(function (row) { return String(row[0] || '').trim() !== ''; }).map(function (row) {
    return {
      key: row[0], name: row[1], nameEn: row[2], color: row[3], textColor: row[4],
      minSpend: parseFloat(row[5]) || 0, minPoints: parseInt(row[6]) || 0, pointMultiplier: parseFloat(row[7]) || 1
    };
  });
  try { cache.put(TIER_CONFIG_CACHE_KEY_, JSON.stringify(tiers), 300); } catch (e) {}
  return tiers;
}

function getSignupBonusPoints_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(SIGNUP_BONUS_CACHE_KEY_);
  if (cached) return parseInt(cached);
  var v = PropertiesService.getScriptProperties().getProperty('SIGNUP_BONUS_POINTS');
  var points = v ? parseInt(v) : 20;
  try { cache.put(SIGNUP_BONUS_CACHE_KEY_, String(points), 300); } catch (e) {}
  return points;
}

function calcEligibleTier_(lifetimeSpend, points) {
  var tierConfig = getTierConfig_().filter(function(t){ return String(t.key || '').trim() !== ''; });  // 👈 บรรทัดใหม่ที่เพิ่มเข้ามา
  if (!tierConfig.length) tierConfig = getTierConfig_();
  var sorted = tierConfig.slice().sort(function (a, b) { return a.minSpend - b.minSpend; });
  var eligible = sorted[0];
  sorted.forEach(function (t) {
    if (lifetimeSpend >= t.minSpend) eligible = t;
  });
  return eligible;
}

var VALID_PRIVILEGE_TYPES_ = ['percent', 'fixed', 'bogo', 'ship_percent', 'ship_fixed'];

function getSignupPrivilegeConfig_() {
  var fallback = { enabled: false, name: '', type: 'percent', value: 0, expiryDays: 0, expiryDate: '', restriction: '', freeProduct: '', freeQty: 0, startDate: '', endDate: '' };
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('SIGNUP_PRIVILEGE_CONFIG');
    if (!raw) return fallback;
    var cfg = JSON.parse(raw);
    return {
      enabled: !!cfg.enabled,
      name: String(cfg.name || ''),
      type: VALID_PRIVILEGE_TYPES_.indexOf(cfg.type) !== -1 ? cfg.type : 'percent',
      value: parseFloat(cfg.value) || 0,
      expiryDays: parseInt(cfg.expiryDays) || 0,
      expiryDate: String(cfg.expiryDate || ''), // วันหมดอายุของ "สิทธิ์ที่ได้รับ" (คนละเรื่องกับ endDate ด้านล่าง)
      restriction: String(cfg.restriction || ''),
      freeProduct: String(cfg.freeProduct || ''),
      freeQty: parseFloat(cfg.freeQty) || 0,
      // ⚡ เพิ่ม (25/8/69) — ช่วงวันเริ่ม-สิ้นสุดของ "โปรนี้" (ตอนรับสมัครสมาชิกใหม่) เว้นว่างทั้งคู่ = ใช้ได้
      // ตลอดไม่มีกำหนด — คนละเรื่องกับ expiryDate ด้านบนที่คือวันหมดอายุของสิทธิ์ที่สมาชิกแต่ละคนได้รับไปแล้ว
      startDate: String(cfg.startDate || ''),
      endDate: String(cfg.endDate || '')
    };
  } catch (e) {
    return fallback;
  }
}

function ensureSignupPrivilegesSheet_() {
  if (_sheetCache_.signupPrivileges) return _sheetCache_.signupPrivileges;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Signup_Privileges');
  if (!sheet) {
    sheet = ss.insertSheet('Signup_Privileges');
    sheet.appendRow([
      'ชื่อสิทธิ์', 'ประเภท(percent/fixed/bogo/ship_percent/ship_fixed)', 'มูลค่า',
      'หมดอายุใน(วัน นับจากวันสมัคร — เว้นว่าง=ไม่หมดอายุ)', 'เฉพาะสินค้า(หรือที่ต้องซื้อถ้าเป็น bogo)',
      'สินค้าที่แถม(เฉพาะ bogo)', 'จำนวนที่แถม(เฉพาะ bogo)', 'เปิดใช้งาน(TRUE/FALSE)', 'วันที่สร้าง',
      'ยอดซื้อขั้นต่ำ(เว้นว่าง=ไม่กำหนด)', 'วันเริ่มโปร(เว้นว่าง=เริ่มทันที)', 'วันสิ้นสุดโปร(เว้นว่าง=ไม่มีกำหนด)'
    ]);
  } else if (sheet.getLastColumn() < 12) {
    if (sheet.getLastColumn() < 10) sheet.getRange(1, 10).setValue('ยอดซื้อขั้นต่ำ(เว้นว่าง=ไม่กำหนด)');
    if (sheet.getLastColumn() < 11) sheet.getRange(1, 11).setValue('วันเริ่มโปร(เว้นว่าง=เริ่มทันที)');
    if (sheet.getLastColumn() < 12) sheet.getRange(1, 12).setValue('วันสิ้นสุดโปร(เว้นว่าง=ไม่มีกำหนด)');
  }
  _sheetCache_.signupPrivileges = sheet;
  return sheet;
}

var REFERRAL_CONFIG_CACHE_KEY_ = 'referral_config_v1';

function getReferralConfig_() {
  var fallback = {
    enabled: false, rewardTrigger: 'signup', rewardTarget: 'both',
    referrerPoints: 0, referrerDiscountType: '', referrerDiscountValue: 0,
    referredPoints: 0, referredDiscountType: '', referredDiscountValue: 0,
    minPurchase: 0, restriction: '', discountExpiryDays: 0, startDate: '', endDate: ''
  };
  try {
    // ⚡ เพิ่ม (25/8/69) — cache 300 วิ กันอ่าน PropertiesService + JSON.parse ซ้ำทุกครั้งที่มีคนสั่งซื้อ/สมัคร
    // (ฟังก์ชันนี้ถูกเรียกทุกออเดอร์ที่ปิดจบสำเร็จ) ตั้งค่าใหม่แล้วรอสูงสุด 5 นาทีค่อยมีผล ยอมรับได้เพราะ
    // ไม่ใช่ค่าที่ต้องเป๊ะแบบเรียลไทม์
    var cache = CacheService.getScriptCache();
    var cached = cache.get(REFERRAL_CONFIG_CACHE_KEY_);
    if (cached) return JSON.parse(cached);
    var raw = PropertiesService.getScriptProperties().getProperty('REFERRAL_CONFIG');
    if (!raw) { try { cache.put(REFERRAL_CONFIG_CACHE_KEY_, JSON.stringify(fallback), 300); } catch (e2) {} return fallback; }
    var cfg = JSON.parse(raw);
    var result = {
      enabled: !!cfg.enabled,
      rewardTrigger: cfg.rewardTrigger === 'first_purchase' ? 'first_purchase' : 'signup',
      rewardTarget: ['referrer', 'referred', 'both'].indexOf(cfg.rewardTarget) !== -1 ? cfg.rewardTarget : 'both',
      referrerPoints: parseInt(cfg.referrerPoints) || 0,
      referrerDiscountType: (cfg.referrerDiscountType === 'percent' || cfg.referrerDiscountType === 'fixed') ? cfg.referrerDiscountType : '',
      referrerDiscountValue: parseFloat(cfg.referrerDiscountValue) || 0,
      referredPoints: parseInt(cfg.referredPoints) || 0,
      referredDiscountType: (cfg.referredDiscountType === 'percent' || cfg.referredDiscountType === 'fixed') ? cfg.referredDiscountType : '',
      referredDiscountValue: parseFloat(cfg.referredDiscountValue) || 0,
      minPurchase: parseFloat(cfg.minPurchase) || 0,
      restriction: String(cfg.restriction || '').trim(),
      discountExpiryDays: parseInt(cfg.discountExpiryDays) || 0,
      // ⚡ เพิ่ม (25/8/69) — ช่วงวันที่เปิดใช้งานโปรนี้ (เว้นว่างทั้งคู่ = ใช้ได้ตลอดไม่มีกำหนด)
      startDate: String(cfg.startDate || ''),
      endDate: String(cfg.endDate || '')
    };
    try { cache.put(REFERRAL_CONFIG_CACHE_KEY_, JSON.stringify(result), 300); } catch (e3) {}
    return result;
  } catch (e) {
    return fallback;
  }
}

function findMemberRowByMemberCode_(memberCode) {
  var code = String(memberCode || '').trim().toUpperCase();
  if (!code) return -1;
  var cache = CacheService.getScriptCache();
  var cacheKey = 'mcoderow_' + code.substring(0, 40);
  var sheet = ensureMembersSheet_();
  var cached = cache.get(cacheKey);
  if (cached) {
    var cachedRow = parseInt(cached);
    // ⚡ แก้ (26/8/69) — เหมือนแก้ใน findMemberRowIndex_ ด้านบน: กัน exception หลุดออกไปถ้าแถวที่ cache ไว้
    // เกินขอบเขตจริงของชีต (เช่น ลบแถวด้วยมือ) — ถ้าเจอปัญหาก็แค่ล้าง cache แล้วไล่สแกนใหม่แทน
    try {
      if (cachedRow > 0 && cachedRow <= sheet.getMaxRows() && String(sheet.getRange(cachedRow, 13).getValue()).trim().toUpperCase() === code) return cachedRow;
    } catch (e) {
      try { cache.remove(cacheKey); } catch (e2) {}
    }
  }
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  var codes = sheet.getRange(2, 13, lastRow - 1, 1).getValues();
  for (var i = 0; i < codes.length; i++) {
    if (String(codes[i][0] || '').trim().toUpperCase() === code) {
      var rowIndex = i + 2;
      try { cache.put(cacheKey, String(rowIndex), 600); } catch (e) {}
      return rowIndex;
    }
  }
  return -1;
}

function processReferralOnSignup_(referrerCode, newMemberDisplayName) {
  var result = { referrerUid: '', referrerName: '', immediateRewardGranted: false };
  var code = String(referrerCode || '').trim();
  if (!code) return result;

  var cfg = getReferralConfig_();
  if (!cfg.enabled || !isDateRangeActive_(cfg.startDate, cfg.endDate)) return result; // ปิดระบบ/นอกช่วงโปร ไม่บันทึกความสัมพันธ์เลย

  var referrerRowIndex = findMemberRowByMemberCode_(code);
  if (referrerRowIndex === -1) return result; // รหัสไม่ตรงกับสมาชิกคนไหนในระบบ ไม่บันทึก ไม่ error (สมัครต่อได้ปกติ)

  var referrerSheet = ensureMembersSheet_();
  var referrerRow = referrerSheet.getRange(referrerRowIndex, 1, 1, 13).getValues()[0];
  result.referrerUid = referrerRow[0];
  result.referrerName = referrerRow[9] || referrerRow[1] || '';

  if (cfg.rewardTrigger === 'signup' && result.referrerUid) {
    result.immediateRewardGranted = true; // ธงบอก registerMember ว่าให้รางวัลไปแล้วตอนนี้ ไม่ต้องรอซื้อของ
  }
  return result;
}

var lastLineVerifyError_ = '';

function tokenDiag_(idToken) {
  var dotCount = idToken ? (String(idToken).match(/\./g) || []).length : 0;
  return 'เซิร์ฟเวอร์เห็น idToken ยาว ' + (idToken ? String(idToken).length : 0) + ' ตัวอักษร, มี ' + dotCount + ' จุด';
}

var THAI_MONTHS_ = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function formatBirthdayThai_(value) {
  if (!value) return '';
  var y, m, d;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    y = value.getUTCFullYear(); m = value.getUTCMonth() + 1; d = value.getUTCDate();
  } else {
    var parts = String(value).split('-');
    if (parts.length !== 3) return String(value);
    y = parseInt(parts[0], 10); m = parseInt(parts[1], 10); d = parseInt(parts[2], 10);
  }
  if (!y || !m || !d) return String(value);
  return d + ' ' + (THAI_MONTHS_[m - 1] || m) + ' ' + (y + 543);
}

function generateMemberCode_(sheet) {
  var lastRow = sheet.getLastRow();
  var maxSeq = 0;
  if (lastRow > 1) {
    var codes = sheet.getRange(2, 13, lastRow - 1, 1).getValues();
    codes.forEach(function (r) {
      var code = String(r[0] || '');
      if (code.indexOf('EM-') !== 0) return;
      var seqPart = code.substring(11);
      var n = parseInt(seqPart, 10) || 0;
      if (n > maxSeq) maxSeq = n;
    });
  }
  var seqStr = String(maxSeq + 1);
  while (seqStr.length < 4) seqStr = '0' + seqStr;
  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1); if (mm.length < 2) mm = '0' + mm;
  var dd = String(today.getDate()); if (dd.length < 2) dd = '0' + dd;
  return 'EM-' + yyyy + mm + dd + seqStr;
}

function registerMember(idToken, phoneNumber, fullName, birthday, referrerCode) {
  var profile;
  try {
    profile = verifyLineIdToken_(idToken);
  } catch (e) {
    return { success: false, error: e.toString() };
  }
  if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ') | ' + tokenDiag_(idToken) };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนสมัครพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  var successPayload_ = null;
  var welcomeMsgToSend_ = null;
  // ⚡ เพิ่ม (25/8/69) — ข้อมูลผู้แนะนำ (ถ้ามี) เตรียมไว้ให้รางวัลหลัง lock ปล่อยแล้ว (เหมือน welcomeMsgToSend_)
  var referralInfo_ = { referrerUid: '', referrerName: '' };
  try {
    var phone = String(phoneNumber || '').replace(/[^0-9]/g, '');
    if (phone.length > 0 && phone.charAt(0) !== '0') phone = '0' + phone;
    if (!/^0\d{9}$/.test(phone)) return { success: false, error: 'เบอร์โทรไม่ถูกต้อง กรุณากรอกให้ครบ 10 หลัก' };

    var fullNameValue = String(fullName || '').trim();
    if (!fullNameValue) return { success: false, error: 'กรุณากรอกชื่อ-นามสกุล' };
    var birthdayValue = String(birthday || '').trim();
    if (!birthdayValue) return { success: false, error: 'กรุณากรอกวันเกิด' };

    var sheet = ensureMembersSheet_();
    var lastRow = sheet.getLastRow();

    var identityRows_ = getCachedMembersIdentityRows_();
    for (var i = 0; i < identityRows_.length; i++) {
      if (identityRows_[i][0] === profile.sub) return { success: false, error: 'บัญชี LINE นี้เป็นสมาชิกอยู่แล้ว' };
      if (String(identityRows_[i][3]) === phone) return { success: false, error: 'เบอร์โทรนี้ถูกใช้สมัครสมาชิกไปแล้ว' };
    }

    // ⚡ เพิ่ม (25/8/69) — ตรวจสอบรหัสผู้แนะนำ (ถ้ามีส่งมา) ก่อนสร้างแถวสมาชิกใหม่ เผื่อต้องบันทึกคอลัมน์ 14
    referralInfo_ = processReferralOnSignup_(referrerCode, fullNameValue || profile.name);

    var startRow = lastRow + 1;
    sheet.getRange(startRow, 4).setNumberFormat('@STRING@');
    sheet.getRange(startRow, 11).setNumberFormat('@STRING@');

    var signupBonus = getSignupBonusPoints_();
    var startingTier = calcEligibleTier_(0, signupBonus);
    var memberCode = generateMemberCode_(sheet);
    sheet.getRange(startRow, 13).setNumberFormat('@STRING@');
    var joinedAt_ = new Date();
    sheet.getRange(startRow, 1, 1, 15).setValues([[
      profile.sub, profile.name || '', profile.picture || '', phone,
      joinedAt_, signupBonus, startingTier.key, '', '',
      fullNameValue, birthdayValue, 0, memberCode,
      referralInfo_.referrerUid || '', false
    ]]);
    // ⚡ ต้องล้างแคชทันทีหลังเขียนแถวสมาชิกใหม่สำเร็จ ก่อนปล่อย lock เสมอ ไม่งั้นคนที่รอ lock อยู่ถัดไป
    // (เช่นสมัครพร้อมกันหลายคน) จะยังเห็นข้อมูลเก่าจาก getCachedMembersIdentityRows_() ค้างอยู่ในหน้าต่าง
    // 30 วิ ทำให้เช็คเบอร์โทร/LINE UID ซ้ำหลุดผ่านไปได้
    invalidateMembersIdentityCache_();

    var grantedPrivilegesDetailed_ = [];
    // ⚡ แก้ (perf) — เดิมสิทธิ์ต้อนรับแต่ละใบถูก appendRow() แยกกันคนละรอบ ขณะที่ยังถือ ScriptLock อยู่
    // ร้านที่ตั้งสิทธิ์ต้อนรับไว้หลายรายการ = ยิงเขียนชีตหลายรอบต่อการสมัคร 1 คน และตลอดเวลานั้นคนอื่นทั้งระบบ
    // (สั่งซื้อ/แนบสลิป/แลกของรางวัล) ที่ต้องใช้ ScriptLock ตัวเดียวกันต้องรอค้างไปด้วย — รวบเขียนทีเดียวตอนท้าย
    var pendingPrivilegeRows_ = [];
    try {
      var signupPrivilegeConfig_ = getSignupPrivilegeConfig_();
      // ⚡ แก้ (26/8/69) — เปลี่ยนความหมายของ "วันเริ่มโปร/วันสิ้นสุดโปร" ใหม่ตามที่ต้องการจริง: เดิมผมเข้าใจ
      // ผิดว่าเป็น "ช่วงวันที่ต้องสมัครถึงจะได้สิทธิ์" (eligibility gate ตอนสมัคร) — ที่ถูกต้องคือ "ช่วงวันที่
      // ใช้สิทธิ์ได้ตอนสั่งซื้อ" (usage window) สมัครเมื่อไหร่ก็ได้สิทธิ์ติดตัวไปเสมอ (ถ้าเปิดใช้งานอยู่) แต่
      // เอาไปใช้ตอนสั่งซื้อได้เฉพาะช่วงวันที่กำหนดเท่านั้น — ใช้กลไก "วันที่เริ่มใช้ได้" (คอลัมน์ 10) +
      // "วันหมดอายุ" (คอลัมน์ 5) ที่มีอยู่แล้วในชีต Member_Privileges (เช็คจริงตอนสั่งซื้อที่
      // getAllPrivilegesWithDiscount_) แทนการกรองตอนสมัครแบบเดิม ถ้าไม่ได้ตั้งช่วงวันที่ไว้ (เว้นว่างทั้งคู่)
      // จะ fallback ไปใช้ค่าหมดอายุแบบเดิม (expiryDate/expiryDays) เหมือนก่อนหน้านี้
      if (signupPrivilegeConfig_.enabled && signupPrivilegeConfig_.name && signupPrivilegeConfig_.value) {
        var usableFromDate_ = signupPrivilegeConfig_.startDate ? parseDateInputStr_(signupPrivilegeConfig_.startDate) : '';
        var usageEndDate_ = signupPrivilegeConfig_.endDate ? parseDateInputStr_(signupPrivilegeConfig_.endDate) : null;
        var signupPrivilegeExpiry_;
        if (usageEndDate_) {
          usageEndDate_.setHours(23, 59, 59, 999);
          signupPrivilegeExpiry_ = usageEndDate_;
        } else {
          signupPrivilegeExpiry_ = signupPrivilegeConfig_.expiryDate
            ? parseDateInputStr_(signupPrivilegeConfig_.expiryDate)
            : expiryFromDays_(new Date(), signupPrivilegeConfig_.expiryDays);
        }
        pendingPrivilegeRows_.push([
          profile.sub, signupPrivilegeConfig_.name, signupPrivilegeConfig_.type, signupPrivilegeConfig_.value,
          signupPrivilegeExpiry_ || '', 'ของขวัญต้อนรับสมาชิกใหม่ (อัตโนมัติ)', new Date(), true, false, usableFromDate_ || '',
          signupPrivilegeConfig_.restriction || '', signupPrivilegeConfig_.freeProduct || '', signupPrivilegeConfig_.freeQty || '', ''
        ]);
        grantedPrivilegesDetailed_.push({
          name: signupPrivilegeConfig_.name, type: signupPrivilegeConfig_.type, value: signupPrivilegeConfig_.value,
          restriction: signupPrivilegeConfig_.restriction || '', freeProduct: signupPrivilegeConfig_.freeProduct || '',
          freeQty: signupPrivilegeConfig_.freeQty || '', expiryDays: signupPrivilegeConfig_.expiryDays || 0,
          // เก็บวันที่ที่บันทึกจริงลง Member_Privileges เพื่อใช้ในข้อความต้อนรับด้วย
          expiry: signupPrivilegeExpiry_ || '', minPurchase: 0,
          startDate: usableFromDate_ || '',
          startDateText: signupPrivilegeConfig_.startDate || '', endDateText: signupPrivilegeConfig_.endDate || ''
        });
      }
    } catch (privErr) {
      Logger.log('registerMember: ให้สิทธิ์พิเศษต้อนรับสมาชิกใหม่ (แบบเดิม) ไม่สำเร็จ: ' + privErr.toString());
    }
    try {
      var signupPrivItemsSheet_ = ensureSignupPrivilegesSheet_();
      var signupPrivItemsLastRow_ = signupPrivItemsSheet_.getLastRow();
      if (signupPrivItemsLastRow_ > 1) {
        var signupPrivItemsData_ = signupPrivItemsSheet_.getRange(2, 1, signupPrivItemsLastRow_ - 1, 12).getValues();
        signupPrivItemsData_.forEach(function (row) {
          var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
          if (!active) return;
          // ⚡ แก้ (26/8/69) — เหมือนแก้ในสิทธิ์แบบเดี่ยวด้านบน: "วันเริ่มโปร/วันสิ้นสุดโปร" (คอลัมน์ 11-12 ของ
          // Signup_Privileges) หมายถึง "ช่วงวันที่ใช้สิทธิ์ได้ตอนสั่งซื้อ" ไม่ใช่ตัวกรองว่าใครจะได้รับสิทธิ์
          // สมาชิกใหม่ทุกคนที่สมัครตอนรายการนี้ยัง active อยู่จะได้รับสิทธิ์นี้ติดตัวไปเสมอ แต่จะเอาไปใช้ตอน
          // สั่งซื้อได้เฉพาะช่วงวันที่กำหนดเท่านั้น (ผูกกับคอลัมน์ "วันที่เริ่มใช้ได้"+"วันหมดอายุ" ในชีต
          // Member_Privileges ที่มีกลไกเช็คอยู่แล้วตอนสั่งซื้อจริงที่ getAllPrivilegesWithDiscount_)
          var itemStartDateStr_ = normalizeDateCell_(row[10]);
          var itemEndDateStr_ = normalizeDateCell_(row[11]);
          var usableFromDate_ = itemStartDateStr_ ? parseDateInputStr_(itemStartDateStr_) : '';
          var usageEndDate_ = itemEndDateStr_ ? parseDateInputStr_(itemEndDateStr_) : null;
          var expiryDaysVal = parseInt(row[3]) || 0;
          var itemExpiry_;
          if (usageEndDate_) {
            usageEndDate_.setHours(23, 59, 59, 999);
            itemExpiry_ = usageEndDate_;
          } else {
            itemExpiry_ = expiryFromDays_(new Date(), expiryDaysVal);
          }
          pendingPrivilegeRows_.push([
            profile.sub, row[0], row[1], row[2],
            itemExpiry_ || '', 'ของขวัญต้อนรับสมาชิกใหม่ (อัตโนมัติ)', new Date(), true, false, usableFromDate_ || '',
            row[4] || '', row[5] || '', row[6] || '', row[9] || ''
          ]);
          grantedPrivilegesDetailed_.push({
            name: row[0], type: row[1], value: row[2], restriction: row[4] || '',
            freeProduct: row[5] || '', freeQty: row[6] || '', expiryDays: expiryDaysVal,
            // ใช้วันหมดอายุที่คำนวณ/บันทึกให้สมาชิกคนนี้จริง ไม่เดาจาก expiryDays เพียงอย่างเดียว
            expiry: itemExpiry_ || '', startDate: usableFromDate_ || '', minPurchase: row[9] || 0
          });
        });
      }
    } catch (privItemsErr) {
      Logger.log('registerMember: ให้สิทธิ์พิเศษต้อนรับสมาชิกใหม่ (หลายรายการ) ไม่สำเร็จ: ' + privItemsErr.toString());
    }

    // เขียนสิทธิ์ต้อนรับทั้งหมดลงชีตรอบเดียว (ทุกแถวกว้าง 14 คอลัมน์เท่ากัน คอลัมน์ 14 = ยอดซื้อขั้นต่ำ)
    if (pendingPrivilegeRows_.length) {
      try {
        var privSheetForWrite_ = ensurePrivilegesSheet_();
        privSheetForWrite_.getRange(privSheetForWrite_.getLastRow() + 1, 1, pendingPrivilegeRows_.length, 14)
                          .setValues(pendingPrivilegeRows_);
      } catch (privWriteErr) {
        Logger.log('registerMember: บันทึกสิทธิ์ต้อนรับลงชีตไม่สำเร็จ: ' + privWriteErr.toString());
      }
    }

    welcomeMsgToSend_ = buildWelcomeFlexMessage_(fullNameValue || profile.name, memberCode, signupBonus, grantedPrivilegesDetailed_);

    // ส่งข้อมูลสมาชิกที่เพิ่งบันทึกกลับไปพร้อมผลสำเร็จเลย เพื่อให้หน้า LIFF แสดงบัตรสมาชิกได้ทันที
    // ไม่ต้องยิง checkMemberStatus ซ้ำอีกครั้ง ซึ่งอาจช้าระหว่างที่ระบบกำลังส่งข้อความ LINE
    successPayload_ = {
      success: true, displayName: profile.name, fullName: fullNameValue,
      tier: startingTier.name, points: signupBonus, memberCode: memberCode,
      member: {
        displayName: profile.name || '', picture: profile.picture || '', phone: phone,
        joinDate: joinedAt_, points: signupBonus, tier: startingTier.name,
        tierColor: startingTier.color, tierTextColor: startingTier.textColor,
        tierNameEn: startingTier.nameEn, tierKey: startingTier.key,
        pointMultiplier: startingTier.pointMultiplier,
        fullName: fullNameValue, birthday: formatBirthdayThai_(birthdayValue), birthdayRaw: birthdayValue,
        lifetimeSpend: 0, address: '', province: '', memberCode: memberCode
      }
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }

  if (welcomeMsgToSend_) {
    try {
      sendLineMessages_(profile.sub, [welcomeMsgToSend_]);
    } catch (welcomeErr) {
      Logger.log('registerMember: ส่งข้อความยืนยันการสมัครสมาชิกไม่สำเร็จ: ' + welcomeErr.toString());
    }
  }

  // ⚡ เพิ่ม (25/8/69) — ให้รางวัลแนะนำเพื่อนทันที ถ้าตั้งค่าทริกเกอร์เป็น "ตอนสมัคร" (ทำหลัง lock ปล่อยแล้ว
  // เหมือนการส่งข้อความต้อนรับ เพื่อไม่ให้ล็อกชีตนานเกินจำเป็น)
  if (referralInfo_ && referralInfo_.referrerUid) {
    try {
      grantReferralRewardOnSignupIfNeeded_(referralInfo_.referrerUid, referralInfo_.referrerName, profile.sub, fullNameValue || profile.name);
    } catch (refErr) {
      Logger.log('registerMember: ให้รางวัลแนะนำเพื่อนไม่สำเร็จ: ' + refErr.toString());
    }
  }

  return successPayload_;
}

function ensurePrivilegesSheet_() {
  if (_sheetCache_.privileges) return _sheetCache_.privileges;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Member_Privileges');
  if (!sheet) {
    sheet = ss.insertSheet('Member_Privileges');
    sheet.appendRow(['LINE UID', 'ชื่อสิทธิ์', 'ประเภท(percent/fixed/bogo/ship_percent/ship_fixed)', 'มูลค่า', 'วันหมดอายุ', 'ให้โดย', 'วันที่ให้', 'เปิดใช้งาน(TRUE/FALSE)', 'แจ้งเตือนแล้ว(TRUE/FALSE)', 'วันที่เริ่มใช้ได้(เว้นว่าง=ใช้ได้ทันที)', 'สินค้าที่ต้องซื้อ(เฉพาะ bogo)', 'สินค้าที่แถม(เฉพาะ bogo)', 'จำนวนที่แถมต่อรอบ(เฉพาะ bogo)', 'ยอดซื้อขั้นต่ำ(เว้นว่าง=ไม่กำหนด)', 'ส่วนลดของแถม(%)(เฉพาะ bogo — เว้นว่าง=100% ฟรี)']);
  } else if (sheet.getLastColumn() < 17) {
    if (sheet.getLastColumn() < 9) sheet.getRange(1, 9).setValue('แจ้งเตือนแล้ว(TRUE/FALSE)');
    if (sheet.getLastColumn() < 10) sheet.getRange(1, 10).setValue('วันที่เริ่มใช้ได้(เว้นว่าง=ใช้ได้ทันที)');
    if (sheet.getLastColumn() < 13) sheet.getRange(1, 11, 1, 3).setValues([['สินค้าที่ต้องซื้อ(เฉพาะ bogo)', 'สินค้าที่แถม(เฉพาะ bogo)', 'จำนวนที่แถมต่อรอบ(เฉพาะ bogo)']]);
    if (sheet.getLastColumn() < 14) sheet.getRange(1, 14).setValue('ยอดซื้อขั้นต่ำ(เว้นว่าง=ไม่กำหนด)');
    if (sheet.getLastColumn() < 15) sheet.getRange(1, 15).setValue('ส่วนลดของแถม(%)(เฉพาะ bogo — เว้นว่าง=100% ฟรี)');
    // คอลัมน์ 16 (P) มีข้อมูลจริงอยู่แล้วในชีต ("ประกาศโปรใหม่แล้ว(TRUE/FALSE)") — ไม่แตะคอลัมน์นี้
    // เด็ดขาด ใช้คอลัมน์ 17 (Q) ซึ่งว่างจริงแทน
    if (sheet.getLastColumn() < 17) sheet.getRange(1, 17).setValue('ใช้สิทธิ์เมื่อ');
  }
  _sheetCache_.privileges = sheet;
  return sheet;
}

function buildOrderHeaderCard_(icon, title, subtitle) {
  return {
    type: 'box', layout: 'vertical', paddingAll: '20px', cornerRadius: '24px',
    background: { type: 'linearGradient', angle: '135deg', startColor: '#a50d0c', endColor: '#e4504d' },
    contents: [
      { type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'md', contents: [
          { type: 'box', layout: 'vertical', width: '48px', height: '48px', cornerRadius: '24px',
            backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center',
            contents: [ { type: 'text', text: icon, size: 'xl', align: 'center' } ]
          },
          { type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: title, color: '#ffffff', weight: 'bold', size: 'lg', wrap: true },
              { type: 'text', text: subtitle, color: '#ffe4e3', size: 'sm' }
          ]}
      ]}
    ]
  };
}

function buildOrderSummaryRow_(label, value, opts) {
  opts = opts || {};
  return {
    type: 'box', layout: 'horizontal', margin: opts.margin || 'xs',
    contents: [
      { type: 'text', text: label, size: opts.size || 'xs', color: opts.labelColor || '#9e9e9e', flex: 3, wrap: opts.labelWrap === true },
      { type: 'text', text: value, size: opts.size || 'xs', color: opts.valueColor || '#424242', weight: opts.bold ? 'bold' : 'regular', align: 'end', flex: 2, wrap: true }
    ]
  };
}

function buildWelcomeFlexMessage_(displayName, memberCode, signupBonusPoints, grantedPrivileges) {
  var body = [ buildOrderHeaderCard_('🎉', 'สมัครสมาชิกสำเร็จแล้ว!', 'ยินดีต้อนรับสู่ คลับคนรักเอมโอชา 💚') ];

  body.push({
    type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents: [
      buildOrderSummaryRow_('ชื่อสมาชิก', displayName || '-', { size: 'sm', valueColor: '#424242', bold: true }),
      buildOrderSummaryRow_('รหัสสมาชิก', memberCode || '-', { size: 'sm', valueColor: '#424242' }),
      buildOrderSummaryRow_('แต้มต้อนรับ', (signupBonusPoints || 0) + ' แต้ม', { size: 'sm', valueColor: '#a50d0c', bold: true })
    ]
  });

  if (grantedPrivileges && grantedPrivileges.length) {
    body.push({ type: 'text', text: '🎁 สิทธิพิเศษสำหรับคุณ (' + grantedPrivileges.length + ' รายการ)', size: 'sm', weight: 'bold', color: '#a50d0c', margin: 'lg' });
    grantedPrivileges.forEach(function (p) {
      // ใช้วันหมดอายุที่บันทึกให้สมาชิกจริง: กรณี endDate/expiryDate มีค่า จะไม่ขึ้นว่า "ไม่มีวันหมดอายุ"
      var expiryText = 'ไม่มีวันหมดอายุ';
      var startText = '';
      var endText = '';
      if (p.startDate) {
        try {
          var startDate_ = new Date(p.startDate);
          if (!isNaN(startDate_.getTime())) startText = startDate_.toLocaleDateString('th-TH');
        } catch (e) {}
      }
      if (p.expiry) {
        try {
          var expiryDate_ = new Date(p.expiry);
          if (!isNaN(expiryDate_.getTime())) endText = expiryDate_.toLocaleDateString('th-TH');
        } catch (e) {}
      }
      if (startText && endText) {
        expiryText = 'ใช้ได้วันที่ ' + startText + ' ถึง ' + endText;
      } else if (startText) {
        expiryText = 'เริ่มใช้ได้วันที่ ' + startText;
      } else if (endText) {
        expiryText = 'ใช้ได้ถึง: ' + endText;
      } else if (p.expiryDays > 0) {
        expiryText = 'ใช้ได้ภายใน ' + p.expiryDays + ' วันหลังสมัคร';
      }
      body.push({
        type: 'box', layout: 'vertical', margin: 'sm', cornerRadius: '8px', backgroundColor: '#fff0ef', paddingAll: '10px',
        contents: [
          { type: 'text', text: p.name, size: 'xs', color: '#a50d0c', wrap: true, weight: 'bold' },
          { type: 'text', text: expiryText, size: 'xxs', color: '#9c3e3c', margin: 'xs' }
        ]
      });
    });
  }

  body.push({ type: 'separator', margin: 'lg' });
  body.push({
    type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm', contents: [
      { type: 'text', text: 'สิทธิพิเศษที่เอมโอชามอบให้', size: 'sm', weight: 'bold', color: '#a50d0c' },
      { type: 'text', text: '🎯 สะสมคะแนน', size: 'xs', color: '#424242' },
      { type: 'text', text: '🎟️ เก็บคูปอง', size: 'xs', color: '#424242' },
      { type: 'text', text: '🎁 แลกของรางวัล', size: 'xs', color: '#424242' },
      { type: 'text', text: '🔥 รับโปรพิเศษเฉพาะสมาชิก', size: 'xs', color: '#424242' }
    ]
  });

  body.push({
    type: 'text', text: 'พร้อมแล้ว ไปช้อปแล้วสะสมคะแนนกันเลย! ขอบคุณที่รักเอมโอชานะคะ 🙏', size: 'xs', color: '#757575',
    margin: 'lg', wrap: true, align: 'center'
  });

  var bubble = { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md', contents: body } };
  return { type: 'flex', altText: 'สมัครสมาชิกสำเร็จแล้ว! ยินดีต้อนรับสู่คลับคนรักเอมโอชา 💚', contents: bubble };
}

function normalizeDateCell_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, 'GMT+7', 'yyyy-MM-dd');
  }
  return String(v).trim();
}

function isDateRangeActive_(startDateStr, endDateStr, now) {
  now = now || new Date();
  startDateStr = normalizeDateCell_(startDateStr);
  endDateStr = normalizeDateCell_(endDateStr);
  if (startDateStr) {
    var s = parseDateInputStr_(startDateStr);
    if (s && s > now) return false;
  }
  if (endDateStr) {
    var e = parseDateInputStr_(endDateStr);
    if (e) {
      e.setHours(23, 59, 59, 999); // ใช้ได้ถึงสิ้นวันนั้นจริงๆ (แพทเทิร์นเดียวกับ isExpired_)
      if (e < now) return false;
    }
  }
  return true;
}

function expiryFromDays_(baseDate, days) {
  var n = parseInt(days, 10) || 0;
  if (n <= 0) return '';
  var base = (baseDate instanceof Date) ? new Date(baseDate.getTime()) : new Date();
  base.setDate(base.getDate() + (n - 1));
  base.setHours(23, 59, 59, 999);
  return base;
}

function parseDateInputStr_(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

  return { registerMember };
}
