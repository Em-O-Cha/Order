// สร้างอัตโนมัติจาก Members.gs ด้วย tools/gas-port/extract.mjs (target admin-read) — ห้ามแก้ไฟล์นี้ตรงๆ
// ให้รันสคริปต์ใหม่แทน — 86 รายการ (60 ฟังก์ชัน)
/* eslint-disable */
export function createGas(env) {
  const { SpreadsheetApp, CacheService, PropertiesService, Utilities, Logger, LockService, Session, Date,
          verifyLineIdToken_, logErrorToSheet_, ensureDebugLogSheet_, logSlowAction_, logRegistrationQueueWait_, checkAdminPin_, sendLineMessages_ } = env;

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

function resolveTierByStoredValue_(storedValue, lifetimeSpendForFallback, lineUidForFallback) {
  var tierConfig = getTierConfig_();
  var v = String(storedValue || '').trim();
  if (v) {
    var byKey = tierConfig.find(function (t) { return t.key === v; });
    if (byKey) return byKey;
    var byName = tierConfig.find(function (t) { return t.name === v; });
    if (byName) return byName;
    var byNameEn = tierConfig.find(function (t) { return t.nameEn && t.nameEn.toLowerCase() === v.toLowerCase(); });
    if (byNameEn) return byNameEn;
    // ⚡ เพิ่ม (1/9/69) — ถ้าหา key/name/nameEn เดิมไม่เจอเลยใน Tier_Config ปัจจุบัน (เช่น มีคนไปแก้ไข
    // Tier_Config โดยไม่ผ่าน updateTierConfig หรือแก้ตรงชีตเอง) ให้บันทึกลง Debug_Log ทันที จะได้รู้ตัวเร็ว
    // ไม่ปล่อยให้ลูกค้าเจอ Tier ผิด/ต่ำกว่าที่ควรแบบเงียบๆ ซ้ำอีก (กันปัญหา "Tier หายตอน Login" แบบถาวร)
    try {
      logErrorToSheet_('resolveTierByStoredValue_:noMatch', 'storedValue="' + v + '" ไม่ตรงกับ key/name/nameEn ใดใน Tier_Config เลย จะหาจากประวัติแลกคะแนน/ยอดซื้อสะสมแทนชั่วคราว (ควรตรวจสอบ Tier_Config ว่ามีการเปลี่ยน key โดยไม่ migrate หรือไม่)');
    } catch (logErr) {}
  }
  // ⚡ แก้ (1/9/69) — เมื่อหา Tier จาก storedValue ตรงๆ ไม่เจอ ห้ามคำนวณจาก "ยอดซื้อสะสมอย่างเดียว" เด็ดขาด
  // เพราะสมาชิกบางคนได้ระดับมาจาก "การแลกคะแนน" (ของรางวัลหมวด tier_upgrade ในชีต Rewards_Catalog เช่น
  // "เอมแฟน/เอมเลิฟ/เอม VIP") ไม่ใช่จากยอดซื้อ ไม่งั้นจะดูเหมือน "Tier ถูกลบ" ทั้งที่จริงๆ คือคำนวณผิดฐาน
  // หลักการหา Tier ที่ถูกต้องจริงเมื่อ match ตรงๆ ไม่ได้ (เรียงตามที่ผู้ดูแลระบบยืนยัน):
  // 1) เช็คประวัติแลกคะแนนใน Points_Log ก่อนว่าเคยแลกของรางวัลหมวด tier_upgrade ไว้ระดับสูงสุดเท่าไหร่ (ถ้ามี)
  // 2) เทียบกับ Tier ที่คำนวณจากยอดซื้อสะสม แล้ว "ใช้ระดับที่สูงกว่าเสมอ" ไม่ว่าจะมาจากทางไหน
  var tierFromSpend_ = calcEligibleTier_(parseFloat(lifetimeSpendForFallback) || 0, 0);
  var tierFromRedemption_ = lineUidForFallback ? findHighestTierUpgradeRedeemed_(lineUidForFallback, tierConfig) : null;
  if (tierFromRedemption_ && tierFromRedemption_.minSpend > tierFromSpend_.minSpend) {
    return tierFromRedemption_;
  }
  return tierFromSpend_;
}

function findHighestTierUpgradeRedeemed_(lineUid, tierConfig) {
  try {
    var rewardSheet = ensureRewardsCatalogSheet_();
    var rLastRow = rewardSheet.getLastRow();
    if (rLastRow <= 1) return null;
    var rewardRows = rewardSheet.getRange(2, 1, rLastRow - 1, 10).getValues();
    var tierUpgradeTargetKeyByRewardName_ = {};
    rewardRows.forEach(function (r) {
      if (String(r[1]) === 'tier_upgrade') {
        tierUpgradeTargetKeyByRewardName_[String(r[0]).trim()] = String(r[3] || '').trim();
      }
    });
    if (!Object.keys(tierUpgradeTargetKeyByRewardName_).length) return null;

    var logSheet = ensurePointsLogSheet_();
    var lastRow = logSheet.getLastRow();
    if (lastRow <= 1) return null;
    var logData = logSheet.getRange(2, 1, lastRow - 1, 6).getValues();
    var bestTier_ = null;
    logData.forEach(function (row) {
      if (String(row[1]) !== lineUid) return;
      if (String(row[2]) !== 'redeem') return;
      var desc = String(row[3] || '');
      var m = desc.match(/แลก "([^"]+)"/);
      if (!m) return;
      var targetKey = tierUpgradeTargetKeyByRewardName_[m[1]];
      if (!targetKey) return;
      var t = tierConfig.find(function (tc) { return tc.key === targetKey; });
      if (!t) return;
      if (!bestTier_ || t.minSpend > bestTier_.minSpend) bestTier_ = t;
    });
    return bestTier_;
  } catch (e) {
    Logger.log('findHighestTierUpgradeRedeemed_ error: ' + e.toString());
    return null;
  }
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

function getPointsRedeemConfig_() {
  var fallback = { enabled: false, pointsPerBaht: 1, minRedeem: 0, maxRedeemPerOrder: 0 };
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('POINTS_REDEEM_CONFIG');
    if (!raw) return fallback;
    var cfg = JSON.parse(raw);
    var rate = parseFloat(cfg.pointsPerBaht);
    return {
      enabled: !!cfg.enabled,
      pointsPerBaht: rate > 0 ? rate : 1,
      minRedeem: parseInt(cfg.minRedeem) || 0,
      maxRedeemPerOrder: parseInt(cfg.maxRedeemPerOrder) || 0
    };
  } catch (e) {
    return fallback;
  }
}

var COD_STATUS_PENDING_ = 'รอเก็บเงิน';

var COD_STATUS_COL_ = 33;

var COD_PAID_DATE_COL_ = 34;

var COD_MEMBER_BLOCK_COL_ = 19;

var COD_MEMBER_BLOCK_REASON_COL_ = 20;

function isTrueCell_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

var COD_CONFIG_PROP_ = 'COD_CONFIG_V1';

var COD_CONFIG_CACHE_KEY_ = 'cod_config_v1';

var COD_CONFIG_DEFAULT_NOTE_ = 'ชำระเงินกับพนักงานส่งของตอนได้รับสินค้า';

function normalizeCodConfig_(src) {
  src = src || {};
  return {
    enabled: src.enabled === true || String(src.enabled) === 'true',
    minAmount: Math.max(0, parseFloat(src.minAmount) || 0),
    maxAmount: Math.max(0, parseFloat(src.maxAmount) || 0),   // 0 = ไม่จำกัดเพดาน
    fee: Math.max(0, parseFloat(src.fee) || 0),               // 0 = ไม่เก็บค่าธรรมเนียม
    feeType: src.feeType === 'percent' ? 'percent' : 'fixed',
    note: String(src.note || COD_CONFIG_DEFAULT_NOTE_),
    allowedTierKeys: Array.isArray(src.allowedTierKeys) ? src.allowedTierKeys.filter(Boolean).map(String) : []
  };
}

function getCodConfig_() {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(COD_CONFIG_CACHE_KEY_);
    if (cached) return JSON.parse(cached);
    var raw = PropertiesService.getScriptProperties().getProperty(COD_CONFIG_PROP_);
    var cfg = normalizeCodConfig_(raw ? JSON.parse(raw) : {});
    try { cache.put(COD_CONFIG_CACHE_KEY_, JSON.stringify(cfg), 300); } catch (e) {}
    return cfg;
  } catch (e) {
    return normalizeCodConfig_({});
  }
}

function getCodConfigForAdmin(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  return { success: true, config: getCodConfig_(), tiers: getTierConfig_() };
}

function listCodBlockedMembers(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensureMembersSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, COD_MEMBER_BLOCK_REASON_COL_).getValues();
    var results = [];
    data.forEach(function (row) {
      if (!isTrueCell_(row[COD_MEMBER_BLOCK_COL_ - 1])) return;
      results.push({
        lineUid: String(row[0] || ''),
        displayName: String(row[9] || row[1] || ''),
        phone: String(row[3] || ''),
        reason: String(row[COD_MEMBER_BLOCK_REASON_COL_ - 1] || '')
      });
    });
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
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

function listSignupPrivilegeItems(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensureSignupPrivilegesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
    var results = data.map(function (row, idx) {
      return {
        rowIndex: idx + 2, name: row[0], type: row[1], value: row[2],
        expiryDays: row[3] || '', restriction: row[4] || '', freeProduct: row[5] || '', freeQty: row[6] || '',
        active: row[7] === true || String(row[7]).toUpperCase() === 'TRUE',
        minPurchase: row[9] || '', startDate: normalizeDateCell_(row[10]), endDate: normalizeDateCell_(row[11])
      };
    });
    results.reverse();
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
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

function getReferralConfigForAdmin(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  return { success: true, config: getReferralConfig_() };
}

function listReferrals(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensureMembersSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
    var uidToName = {};
    data.forEach(function (row) { if (row[0]) uidToName[row[0]] = row[9] || row[1] || ''; });

    var cfg = getReferralConfig_();
    var results = [];
    data.forEach(function (row) {
      var referrerUid = String(row[13] || '').trim();
      if (!referrerUid) return;
      var rewarded = row[14] === true || String(row[14]).toUpperCase() === 'TRUE';
      results.push({
        referrerUid: referrerUid,
        referrerName: uidToName[referrerUid] || '(ไม่พบชื่อ — อาจลบสมาชิกไปแล้ว)',
        referredName: row[9] || row[1] || '',
        referredPhone: row[3] || '',
        joinDate: row[4] ? new Date(row[4]).toLocaleDateString('th-TH') : '',
        rewarded: rewarded,
        pendingReason: rewarded ? '' : (cfg.rewardTrigger === 'first_purchase' ? 'รอเพื่อนซื้อของครั้งแรก' : 'รอระบบประมวลผล')
      });
    });
    results.reverse();
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

var PURCHASE_REFERRAL_CONFIG_CACHE_KEY_ = 'purchase_referral_config_v1';

function getPurchaseReferralConfig_() {
  var fallback = {
    enabled: false, frequencyMode: 'once_per_pair', monthlyLimitCount: 1, rewardTarget: 'both',
    referrerPoints: 0, referrerDiscountType: '', referrerDiscountValue: 0,
    referredPoints: 0, referredDiscountType: '', referredDiscountValue: 0,
    minPurchase: 0, restriction: '', discountExpiryDays: 0, startDate: '', endDate: ''
  };
  try {
    // ⚡ เพิ่ม (25/8/69) — cache 300 วิ เหมือน getReferralConfig_ กันอ่าน Properties+parse ซ้ำทุกออเดอร์
    var cache = CacheService.getScriptCache();
    var cached = cache.get(PURCHASE_REFERRAL_CONFIG_CACHE_KEY_);
    if (cached) return JSON.parse(cached);
    var raw = PropertiesService.getScriptProperties().getProperty('PURCHASE_REFERRAL_CONFIG');
    if (!raw) { try { cache.put(PURCHASE_REFERRAL_CONFIG_CACHE_KEY_, JSON.stringify(fallback), 300); } catch (e2) {} return fallback; }
    var cfg = JSON.parse(raw);
    var validModes = ['once_per_pair', 'every_purchase', 'monthly_limit'];
    var result = {
      enabled: !!cfg.enabled,
      frequencyMode: validModes.indexOf(cfg.frequencyMode) !== -1 ? cfg.frequencyMode : 'once_per_pair',
      monthlyLimitCount: Math.max(1, parseInt(cfg.monthlyLimitCount) || 1),
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
      startDate: String(cfg.startDate || ''),
      endDate: String(cfg.endDate || '')
    };
    try { cache.put(PURCHASE_REFERRAL_CONFIG_CACHE_KEY_, JSON.stringify(result), 300); } catch (e3) {}
    return result;
  } catch (e) {
    return fallback;
  }
}

function getPurchaseReferralConfigForAdmin(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  return { success: true, config: getPurchaseReferralConfig_() };
}

function ensurePurchaseReferralLogSheet_() {
  if (_sheetCache_.purchaseReferralLog) return _sheetCache_.purchaseReferralLog;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Purchase_Referral_Log');
  if (!sheet) {
    sheet = ss.insertSheet('Purchase_Referral_Log');
    sheet.appendRow(['วันที่', 'ผู้แนะนำ(LINE UID)', 'ชื่อผู้แนะนำ', 'รหัสผู้แนะนำ', 'ผู้ซื้อ(LINE UID)', 'ชื่อผู้ซื้อ', 'เลขที่ออเดอร์', 'ยอดซื้อ', 'สถานะให้รางวัล', 'รายละเอียดรางวัล']);
  }
  _sheetCache_.purchaseReferralLog = sheet;
  return sheet;
}

function listPurchaseReferrals(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensurePurchaseReferralLogSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    var results = data.map(function (row) {
      return {
        date: row[0] ? new Date(row[0]).toLocaleString('th-TH') : '',
        referrerName: row[2] || '', referrerCode: row[3] || '',
        buyerName: row[5] || '', orderId: row[6] || '',
        orderTotal: row[7] || 0, status: row[8] || '', detail: row[9] || ''
      };
    });
    results.reverse();
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function formatBirthdayReport_(value) {
  if (!value) return '';
  var y, m, d;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    y = value.getUTCFullYear(); m = value.getUTCMonth() + 1; d = value.getUTCDate();
  } else {
    var parts = String(value).trim().split('-');
    if (parts.length !== 3) return String(value);
    y = parseInt(parts[0], 10); m = parseInt(parts[1], 10); d = parseInt(parts[2], 10);
  }
  if (!y || !m || !d) return String(value);
  return d + '/' + m + '/' + (y + 543);
}

var REVENUE_SHEET_ID_SHOP   = '1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY';

var REVENUE_SHEET_NAME_SHOP = 'Revenue';

var MASTER_SHEET_ID_SHOP    = '1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w';

function toDirectImageUrl_(url) {
  if (!url) return '';
  var match = url.match(/drive\.google\.com\/file\/d\/([^\/]+)/);
  if (match) return 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=w600';
  return url;
}

function getShopProducts() {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('shop_products_v2');
    if (cached) return JSON.parse(cached);

    var ss = SpreadsheetApp.openById(MASTER_SHEET_ID_SHOP);
    var sheet = ss.getSheetByName('SKU');
    if (!sheet) return { success: false, error: 'ไม่พบชีต SKU ใน Master Data' };
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, categories: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 12).getValues();

    var categoryMap = {};
    var order = [];
    data.forEach(function (row) {
      var category = row[7] ? String(row[7]).trim() : '';
      var variantLabel = row[8] ? String(row[8]).trim() : '';
      if (!category || !variantLabel) return;

      var price = parseFloat(row[9]) || 0;
      var image = toDirectImageUrl_(row[10] ? String(row[10]).trim() : '');
      var weightG = parseFloat(row[11]) || 0;
      var skuName = category + ' ' + variantLabel;

      if (!categoryMap[category]) {
        categoryMap[category] = { name: category, image: image, variants: [] };
        order.push(category);
      }
      if (image && !categoryMap[category].image) categoryMap[category].image = image;
      categoryMap[category].variants.push({
        skuName: skuName,
        label: variantLabel,
        price: price,
        weightG: weightG
      });
    });

    var categories = order.map(function (key) { return categoryMap[key]; });
    var result = { success: true, categories: categories };
    try { cache.put('shop_products_v2', JSON.stringify(result), 180); } catch (e) {}
    return result;
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function ensurePointsPromosSheet_() {
  if (_sheetCache_.pointsPromos) return _sheetCache_.pointsPromos;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Points_Promos');
  if (!sheet) {
    sheet = ss.insertSheet('Points_Promos');
    sheet.appendRow([
      'ชื่อโปร', 'ประเภท(multiplier/repeat)', 'เปิดใช้งาน(TRUE/FALSE)', 'วันเริ่ม', 'วันหมดอายุ',
      'ตัวคูณแต้ม(เฉพาะ multiplier)', 'ยอดซื้อขั้นต่ำ(เฉพาะ multiplier — เลือกอย่างใดอย่างหนึ่งกับสินค้าเฉพาะ)',
      'เฉพาะสินค้า(ใช้ได้ทั้ง 2 ประเภท)', 'แต้มโบนัส(เฉพาะ repeat)',
      'ประเภทส่วนลดโบนัส(percent/fixed — เฉพาะ repeat)', 'มูลค่าส่วนลดโบนัส(เฉพาะ repeat)', 'วันที่สร้าง',
      'ข้อความหัวการ์ด(กำหนดเอง — เว้นว่าง=ให้ระบบสร้างให้อัตโนมัติ)'
    ]);
  } else if (sheet.getLastColumn() < 13) {
    sheet.getRange(1, 13).setValue('ข้อความหัวการ์ด(กำหนดเอง — เว้นว่าง=ให้ระบบสร้างให้อัตโนมัติ)');
  }
  _sheetCache_.pointsPromos = sheet;
  return sheet;
}

function listPointsPromos(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensurePointsPromosSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
    var now = new Date();
    var results = data.map(function (row, idx) {
      var startDateVal = row[3], expiryDateVal = row[4];
      return {
        rowIndex: idx + 2, name: row[0], type: row[1],
        active: row[2] === true || String(row[2]).toUpperCase() === 'TRUE',
        startDate: startDateVal ? Utilities.formatDate(new Date(startDateVal), 'GMT+7', 'yyyy-MM-dd') : '',
        expiryDate: expiryDateVal ? Utilities.formatDate(new Date(expiryDateVal), 'GMT+7', 'yyyy-MM-dd') : '',
        multiplierValue: row[5] || '', minPurchase: row[6] || '', restriction: row[7] || '',
        bonusPoints: row[8] || '', bonusDiscountType: row[9] || '', bonusDiscountValue: row[10] || '',
        stubText: row[12] || '',
        isExpiredNow: expiryDateVal ? isExpired_(expiryDateVal, now) : false
      };
    });
    results.reverse();
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function ensureTierPerksSheet_() {
  if (_sheetCache_.tierPerks) return _sheetCache_.tierPerks;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Tier_Perks');
  if (!sheet) {
    sheet = ss.insertSheet('Tier_Perks');
    sheet.appendRow(['ข้อความสิทธิ์', 'ระดับที่ต้องถึงจะปลดล็อค(key)', 'เปิดใช้งาน(TRUE/FALSE)', 'วันที่สร้าง']);
  }
  _sheetCache_.tierPerks = sheet;
  return sheet;
}

function listTierPerks(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensureTierPerksSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    var tierConfig = getTierConfig_();
    var results = data.map(function (row, idx) {
      var tierObj = tierConfig.find(function (t) { return t.key === row[1]; });
      return {
        rowIndex: idx + 2, text: row[0], tierKey: row[1],
        tierName: tierObj ? tierObj.name : row[1],
        active: row[2] === true || String(row[2]).toUpperCase() === 'TRUE'
      };
    });
    results.reverse();
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function normalizeDigits_(v) { return String(v || '').replace(/[^0-9]/g, ''); }

function ensureRevenueSheet_() {
  if (_sheetCache_.revenueShop) return _sheetCache_.revenueShop;
  _sheetCache_.revenueShop = SpreadsheetApp.openById(REVENUE_SHEET_ID_SHOP).getSheetByName(REVENUE_SHEET_NAME_SHOP);
  return _sheetCache_.revenueShop;
}

var _revenueCodColsReady_ = false;

function ensureRevenueCodColumns_(sheet) {
  if (_revenueCodColsReady_) return;
  try {
    if (sheet.getMaxColumns() < COD_PAID_DATE_COL_) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), COD_PAID_DATE_COL_ - sheet.getMaxColumns());
    }
    var headers = sheet.getRange(1, 1, 1, COD_PAID_DATE_COL_).getValues()[0];
    var statusHeader_ = String(headers[COD_STATUS_COL_ - 1] || '').trim();
    var paidHeader_ = String(headers[COD_PAID_DATE_COL_ - 1] || '').trim();
    if (!statusHeader_) sheet.getRange(1, COD_STATUS_COL_).setValue('สถานะเก็บเงินปลายทาง');
    if (!paidHeader_) sheet.getRange(1, COD_PAID_DATE_COL_).setValue('วันที่ได้รับเงินปลายทาง');
    // กันกรณีมีคนไปแทรก/เพิ่มคอลัมน์อื่นมาอยู่ตำแหน่ง AG/AH ทีหลัง — ระบบเก็บเงินปลายทางยึดตำแหน่งคอลัมน์นี้
    // ตายตัว ถ้าชื่อไม่ตรงแปลว่ากำลังจะเขียนทับข้อมูลของระบบอื่น ต้องรู้ทันทีไม่ใช่ปล่อยให้พังเงียบๆ
    if ((statusHeader_ && statusHeader_ !== 'สถานะเก็บเงินปลายทาง') || (paidHeader_ && paidHeader_ !== 'วันที่ได้รับเงินปลายทาง')) {
      logErrorToSheet_('ensureRevenueCodColumns_', 'คอลัมน์ AG/AH ของชีต Revenue ถูกใช้ชื่ออื่นอยู่แล้ว ("' + statusHeader_ + '" / "' + paidHeader_ + '") — ระบบเก็บเงินปลายทางจะเขียนทับคอลัมน์นี้ กรุณาย้ายข้อมูลเดิมไปคอลัมน์อื่นก่อน');
    }
    _revenueCodColsReady_ = true;
  } catch (e) {
    Logger.log('ensureRevenueCodColumns_ error: ' + e.toString());
  }
}

function ensureCouponsSheet_() {
  if (_sheetCache_.coupons) return _sheetCache_.coupons;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Coupons');
  if (!sheet) {
    sheet = ss.insertSheet('Coupons');
    sheet.appendRow(['โค้ด', 'ประเภท(percent/fixed/bogo/ship_percent/ship_fixed)', 'มูลค่า', 'ยอดซื้อขั้นต่ำ', 'ใช้ได้สูงสุด(ครั้ง)', 'ใช้ไปแล้ว', 'วันหมดอายุ', 'เปิดใช้งาน(TRUE/FALSE)', 'ใช้อัตโนมัติทุกคน(TRUE/FALSE)', 'เฉพาะสินค้า/สินค้าที่ต้องซื้อ(bogo)', 'วันเริ่มต้น(เว้นว่าง=เริ่มทันที)', 'สินค้าที่แถม(เฉพาะ bogo)', 'จำนวนที่แถมต่อรอบ(เฉพาะ bogo)', 'จำกัดเฉพาะระดับสมาชิก(key คั่นด้วยจุลภาค — เว้นว่าง=ทุกระดับ)', 'ส่วนลดของแถม(%)(เฉพาะ bogo — เว้นว่าง=100% ฟรี)', 'ข้อความหัวการ์ด(กำหนดเอง — เว้นว่าง=ให้ระบบสร้างให้อัตโนมัติ)']);
  } else if (sheet.getLastColumn() < 16) {
    if (sheet.getLastColumn() < 10) {
      sheet.getRange(1, 9, 1, 2).setValues([['ใช้อัตโนมัติทุกคน(TRUE/FALSE)', 'เฉพาะสินค้า/สินค้าที่ต้องซื้อ(bogo)']]);
    }
    if (sheet.getLastColumn() < 11) sheet.getRange(1, 11).setValue('วันเริ่มต้น(เว้นว่าง=เริ่มทันที)');
    if (sheet.getLastColumn() < 13) sheet.getRange(1, 12, 1, 2).setValues([['สินค้าที่แถม(เฉพาะ bogo)', 'จำนวนที่แถมต่อรอบ(เฉพาะ bogo)']]);
    if (sheet.getLastColumn() < 14) sheet.getRange(1, 14).setValue('จำกัดเฉพาะระดับสมาชิก(key คั่นด้วยจุลภาค — เว้นว่าง=ทุกระดับ)');
    if (sheet.getLastColumn() < 15) sheet.getRange(1, 15).setValue('ส่วนลดของแถม(%)(เฉพาะ bogo — เว้นว่าง=100% ฟรี)');
    sheet.getRange(1, 16).setValue('ข้อความหัวการ์ด(กำหนดเอง — เว้นว่าง=ให้ระบบสร้างให้อัตโนมัติ)');
  }
  _sheetCache_.coupons = sheet;
  return sheet;
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

function ensurePointsLogSheet_() {
  if (_sheetCache_.pointsLog) return _sheetCache_.pointsLog;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Points_Log');
  if (!sheet) {
    sheet = ss.insertSheet('Points_Log');
    sheet.appendRow(['วันเวลา', 'LINE UID', 'ประเภท(earn/redeem/adjust_add/adjust_sub)', 'รายการ', 'คะแนนเปลี่ยนแปลง(+/-)', 'คะแนนคงเหลือหลังรายการ']);
  }
  _sheetCache_.pointsLog = sheet;
  return sheet;
}

function getBlockedMembers(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensureMembersSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [], checkedAt: null };
    var data = sheet.getRange(2, 1, lastRow - 1, 18).getValues();
    var results = [];
    var lastCheckedAt = null;
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      if (row[15] === true) {
        var lifetimeSpend = parseFloat(row[11]) || 0; // ยอดซื้อสะสม (คอลัมน์ 12) — ใช้ตัดสินว่าเคยซื้อของกับร้านหรือยัง
        results.push({
          lineUid: row[0],
          displayName: row[9] || row[1] || '',
          phone: String(row[3] || ''),
          memberCode: row[12] || '',
          joinedAt: row[4] ? Utilities.formatDate(new Date(row[4]), 'Asia/Bangkok', 'dd/MM/yyyy') : '', // วันที่สมัครสมาชิก (คอลัมน์ 5)
          blockedCheckedAt: row[16] ? Utilities.formatDate(new Date(row[16]), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') : '',
          blockedSince: row[17] ? Utilities.formatDate(new Date(row[17]), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') : '',
          hasPurchased: lifetimeSpend > 0,
          lifetimeSpend: lifetimeSpend
        });
      }
      if (row[16] && (!lastCheckedAt || new Date(row[16]) > lastCheckedAt)) lastCheckedAt = new Date(row[16]);
    }
    return { success: true, results: results, checkedAt: lastCheckedAt ? Utilities.formatDate(lastCheckedAt, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') : null };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

var BIRTHDAY_PROMO_CONFIG_KEY_ = 'BIRTHDAY_PROMO_CONFIG_V1';

function getBirthdayPromoConfig_() {
  var fallback = {
    birthday: { enabled: false, notifyDays: 3, beforeDays: 3, afterDays: 3, lineMessage: '', rewards: [] },
    birthMonth: { enabled: false, notifyDays: 3, lineMessage: '', rewards: [] }
  };
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(BIRTHDAY_PROMO_CONFIG_KEY_);
    if (!raw) return fallback;
    var cfg = JSON.parse(raw);
    ['birthday', 'birthMonth'].forEach(function (mode) {
      var src = cfg[mode] || {};
      fallback[mode].enabled = src.enabled === true || src.enabled === 'true';
      fallback[mode].notifyDays = isNaN(parseInt(src.notifyDays)) ? 3 : Math.max(0, parseInt(src.notifyDays));
      if (mode === 'birthday') {
        fallback[mode].beforeDays = isNaN(parseInt(src.beforeDays)) ? 3 : Math.max(0, parseInt(src.beforeDays));
        fallback[mode].afterDays = isNaN(parseInt(src.afterDays)) ? 3 : Math.max(0, parseInt(src.afterDays));
      }
      fallback[mode].lineMessage = String(src.lineMessage || '');
      fallback[mode].rewards = (Array.isArray(src.rewards) ? src.rewards : []).map(normalizeBirthdayPromoReward_);
    });
  } catch (e) {
    Logger.log('getBirthdayPromoConfig_ error: ' + e.toString());
  }
  return fallback;
}

function normalizeBirthdayPromoReward_(src) {
  src = src || {};
  var allowed = ['none', 'percent', 'fixed', 'bogo', 'ship_percent', 'ship_fixed', 'gift'];
  var type = allowed.indexOf(String(src.type || 'none')) !== -1 ? String(src.type || 'none') : 'none';
  return {
    // id ต้องไม่ซ้ำภายในโปรเดียวกัน เพราะ 1 Tier สร้างหลายโปรพร้อมกันได้
    id: String(src.id || src.tierKey || '').trim(),
    enabled: src.enabled === true || src.enabled === 'true',
    tierKey: String(src.tierKey || '').trim(),
    name: String(src.name || '').trim(),
    points: Math.max(0, parseInt(src.points) || 0),
    type: type,
    value: Math.max(0, parseFloat(src.value) || 0),
    minPurchase: Math.max(0, parseFloat(src.minPurchase) || 0),
    restriction: String(src.restriction || '').trim(),
    freeProduct: String(src.freeProduct || '').trim(),
    freeQty: Math.max(0, parseFloat(src.freeQty) || 0)
  };
}

function getBirthdayPromoConfigForAdmin(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  return { success: true, config: getBirthdayPromoConfig_(), tiers: getTierConfig_() };
}

var CANCELLED_ORDER_MARK_ = 'ยกเลิก';

function getTierConfigForAdmin() {
  return { success: true, tiers: getTierConfig_(), signupBonus: getSignupBonusPoints_(), signupPrivilege: getSignupPrivilegeConfig_(), pointsRedeemConfig: getPointsRedeemConfig_() };
}

function ensureShippingConfigSheet_() {
  if (_sheetCache_.shipping) return _sheetCache_.shipping;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Shipping_Config');
  if (!sheet) {
    sheet = ss.insertSheet('Shipping_Config');
    sheet.appendRow(['น้ำหนักไม่เกิน(กรัม)', 'ราคา(บาท)']);
    var defaultRates = [
      [20, 32], [100, 37], [250, 42], [500, 52], [1000, 67], [1500, 82], [2000, 97],
      [2500, 100], [3000, 105], [3500, 110], [4000, 120], [4500, 120], [5000, 120], [5500, 130], [6000, 140]
    ];
    sheet.getRange(2, 1, defaultRates.length, 2).setValues(defaultRates);
  }
  _sheetCache_.shipping = sheet;
  return sheet;
}

var SHIPPING_CONFIG_CACHE_KEY_ = 'shipping_config_v2';

function getShippingConfig_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(SHIPPING_CONFIG_CACHE_KEY_);
  if (cached) return JSON.parse(cached);
  var sheet = ensureShippingConfigSheet_();
  var lastRow = sheet.getLastRow();
  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var brackets = data
    .map(function (row) { return { maxWeightG: parseFloat(row[0]) || 0, rate: parseFloat(row[1]) || 0 }; })
    .filter(function (b) { return b.maxWeightG > 0; })
    .sort(function (a, b) { return a.maxWeightG - b.maxWeightG; });
  try { cache.put(SHIPPING_CONFIG_CACHE_KEY_, JSON.stringify(brackets), 300); } catch (e) {}
  return brackets;
}

function getShippingConfigForAdmin() {
  return { success: true, brackets: getShippingConfig_() };
}

function ensureRewardsCatalogSheet_() {
  if (_sheetCache_.rewards) return _sheetCache_.rewards;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Rewards_Catalog');
  if (!sheet) {
    sheet = ss.insertSheet('Rewards_Catalog');
    sheet.appendRow(['ชื่อของรางวัล', 'หมวดหมู่', 'ประเภทส่วนลด(percent/fixed)', 'มูลค่า/ระดับเป้าหมาย', 'รายละเอียดเพิ่มเติม', 'คะแนนที่ต้องใช้แลก', 'อายุสิทธิ์(วัน, เฉพาะ coupon)', 'เปิดใช้งาน(TRUE/FALSE)', 'จำนวนจำกัด(0=ไม่จำกัด)', 'แลกไปแล้ว(ครั้ง)', 'รูปภาพ(URL)', 'วันเริ่มโปร(เว้นว่าง=เริ่มทันที)', 'วันสิ้นสุดโปร(เว้นว่าง=ไม่มีกำหนด)']);
  } else if (sheet.getLastColumn() < 13) {
    if (sheet.getLastColumn() < 11) sheet.getRange(1, 11).setValue('รูปภาพ(URL)');
    if (sheet.getLastColumn() < 12) sheet.getRange(1, 12).setValue('วันเริ่มโปร(เว้นว่าง=เริ่มทันที)');
    if (sheet.getLastColumn() < 13) sheet.getRange(1, 13).setValue('วันสิ้นสุดโปร(เว้นว่าง=ไม่มีกำหนด)');
  }
  _sheetCache_.rewards = sheet;
  return sheet;
}

var REWARD_CATEGORIES_ = {
  coupon: 'คูปองส่วนลดซื้อครั้งถัดไป',
  buy_product: 'แลกซื้อสินค้าที่กำหนด (ราคาพิเศษ)',
  free_product: 'แลกเป็นสินค้าที่กำหนด (ฟรี)',
  premium: 'แลกของพรีเมียม',
  tier_upgrade: 'แลกเพื่อเพิ่มระดับสมาชิก',
  activity: 'แลกเพื่อทำกิจกรรม'
};

function ensureRedemptionLogSheet_() {
  if (_sheetCache_.redemptionLog) return _sheetCache_.redemptionLog;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Redemption_Log');
  if (!sheet) {
    sheet = ss.insertSheet('Redemption_Log');
    sheet.appendRow(['วันเวลาที่แลก', 'LINE UID', 'ชื่อสมาชิก', 'เบอร์โทร', 'ชื่อของรางวัล', 'หมวดหมู่', 'จำนวนที่แลก', 'สถานะ']);
  }
  _sheetCache_.redemptionLog = sheet;
  return sheet;
}

function normalizeDateCell_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, 'GMT+7', 'yyyy-MM-dd');
  }
  return String(v).trim();
}

function isExpired_(expiryValue, now) {
  if (!expiryValue) return false;
  var d = new Date(expiryValue);
  d.setHours(23, 59, 59, 999);
  return d < (now || new Date());
}

function searchMembers(pin, query) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var q = String(query || '').trim().toLowerCase();
    var sheet = ensureMembersSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    // ⚡ แก้ (19/9/69) — อ่านถึงคอลัมน์ 20 เพื่อเอาสถานะ "บล็อกเก็บเงินปลายทาง" ไปแสดงที่หน้าจัดการสมาชิกด้วย
    var data = sheet.getRange(2, 1, lastRow - 1, COD_MEMBER_BLOCK_REASON_COL_).getValues();
    var results = [];
    for (var i = data.length - 1; i >= 0 && results.length < 30; i--) {
      var row = data[i];
      var lineUid = row[0];
      if (!lineUid) continue;
      var displayName = row[1] || '';
      var phone = row[3] || '';
      var fullName = row[9] || '';
      if (q) {
        var hay = (String(displayName) + ' ' + String(fullName) + ' ' + String(phone)).toLowerCase();
        if (hay.indexOf(q) === -1) continue;
      }
      var tierInfo = resolveTierByStoredValue_(row[6], row[11] || 0, lineUid);
      results.push({
        lineUid: lineUid,
        displayName: fullName || displayName,
        phone: String(phone || ''),
        points: row[5] || 0,
        tier: tierInfo.name,
        // ⚡ เพิ่ม — วันเดือนปีเกิด เอาไว้ดูในรายงาน (ระบบโปรวันเกิดใช้แค่วัน/เดือน แต่รายงานต้องการปีด้วย)
        birthday: formatBirthdayReport_(row[10]),
        birthdayRaw: (Object.prototype.toString.call(row[10]) === '[object Date]')
          ? Utilities.formatDate(row[10], 'GMT+0', 'yyyy-MM-dd')
          : String(row[10] || '').trim(),
        codBlocked: isTrueCell_(row[COD_MEMBER_BLOCK_COL_ - 1]),
        codBlockReason: String(row[COD_MEMBER_BLOCK_REASON_COL_ - 1] || '')
      });
    }
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getMemberPrivileges(pin, lineUid) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensurePrivilegesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
    var now = new Date();
    var results = [];
    data.forEach(function (row, idx) {
      if (String(row[0]) !== String(lineUid)) return;
      var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
      var startDateVal = row[9];
      var expiryVal = row[4];
      var expiryDaysApprox = '';
      if (expiryVal) {
        var base = startDateVal ? new Date(startDateVal) : new Date(row[6] || now);
        // นับวันแรกรวมด้วยให้ตรงกับ expiryFromDays_ (1 วัน = สิ้นวันที่เริ่ม) จึงต้อง +1
        expiryDaysApprox = Math.round((new Date(expiryVal) - base) / 86400000) + 1;
      }
      results.push({
        rowIndex: idx + 2,
        name: row[1], type: row[2], value: row[3],
        expiry: expiryVal ? new Date(expiryVal).toLocaleDateString('th-TH') : '',
        startDate: startDateVal ? new Date(startDateVal).toLocaleDateString('th-TH') : '',
        startDateRaw: startDateVal ? Utilities.formatDate(new Date(startDateVal), 'GMT+7', 'yyyy-MM-dd') : '',
        expiryDaysApprox: expiryDaysApprox,
        active: active,
        isUpcoming: !!(startDateVal && new Date(startDateVal) > now),
        restriction: row[10] || '', freeProduct: row[11] || '', freeQty: row[12] || ''
      });
    });
    results.sort(function (a, b) { return b.rowIndex - a.rowIndex; });
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function listGlobalCoupons(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensureCouponsSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 16).getValues();
    var tierConfig = getTierConfig_();
    var now = new Date();
    var results = data.map(function (row, idx) {
      var startDateVal = row[10];
      var expiryVal = row[6];
      var tierKeys = String(row[13] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var tierNames = tierKeys.map(function (k) {
        var t = tierConfig.find(function (tc) { return tc.key === k; });
        return t ? t.name : k;
      });
      return {
        rowIndex: idx + 2, code: row[0], type: row[1], value: row[2],
        minPurchase: row[3] || 0, maxUses: row[4] || 0, usedCount: row[5] || 0,
        expiry: expiryVal ? new Date(expiryVal).toLocaleDateString('th-TH') : '',
        expiryRaw: expiryVal ? Utilities.formatDate(new Date(expiryVal), 'GMT+7', 'yyyy-MM-dd') : '',
        startDate: startDateVal ? new Date(startDateVal).toLocaleDateString('th-TH') : '',
        startDateRaw: startDateVal ? Utilities.formatDate(new Date(startDateVal), 'GMT+7', 'yyyy-MM-dd') : '',
        autoApply: row[8] === true || String(row[8]).toUpperCase() === 'TRUE',
        active: row[7] === true || String(row[7]).toUpperCase() === 'TRUE',
        isUpcoming: !!(startDateVal && new Date(startDateVal) > now),
        restriction: row[9] || '',
        freeProduct: row[11] || '',
        freeQty: row[12] || '',
        tierRestriction: row[13] || '',
        tierNames: tierNames,
        freeDiscountPercent: (row[14] === '' || row[14] === null || row[14] === undefined) ? 100 : row[14],
        stubText: row[15] || ''
      };
    });
    results.reverse();
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function listRewardsCatalogAdmin(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensureRewardsCatalogSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
    var results = data.map(function (row, idx) {
      return {
        rowIndex: idx + 2, name: row[0], category: row[1], categoryLabel: REWARD_CATEGORIES_[row[1]] || row[1],
        type: row[2], value: row[3], detail: row[4] || '',
        pointCost: parseInt(row[5]) || 0, validDays: parseInt(row[6]) || 0,
        active: row[7] === true || String(row[7]).toUpperCase() === 'TRUE',
        maxStock: parseInt(row[8]) || 0, redeemedCount: parseInt(row[9]) || 0,
        image: row[10] ? toDirectImageUrl_(String(row[10]).trim()) : '',
        startDate: normalizeDateCell_(row[11]), endDate: normalizeDateCell_(row[12])
      };
    });
    results.reverse();
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function listRedemptionLog(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensureRedemptionLogSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    var results = data.map(function (row, idx) {
      return {
        rowIndex: idx + 2, date: row[0] ? new Date(row[0]).toLocaleString('th-TH') : '',
        memberName: row[2], phone: row[3], rewardName: row[4],
        category: row[5], categoryLabel: REWARD_CATEGORIES_[row[5]] || row[5],
        qty: row[6], status: row[7]
      };
    });
    results.reverse();
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

var COD_SCAN_ROWS_ = 3000;

function listCodOrders(pin, statusFilter) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensureRevenueSheet_();
    ensureRevenueCodColumns_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var firstRow = Math.max(2, lastRow - COD_SCAN_ROWS_ + 1);
    var data = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, COD_PAID_DATE_COL_).getValues();
    var wanted = String(statusFilter || COD_STATUS_PENDING_);
    var results = [];
    var fmtDate_ = function (v) {
      if (!v) return '';
      try { return Utilities.formatDate(new Date(v), 'GMT+7', 'dd/MM/yyyy HH:mm'); } catch (e) { return String(v); }
    };
    for (var i = data.length - 1; i >= 0 && results.length < 200; i--) {
      var row = data[i];
      if (!row[0]) continue; // แถวรายการสินค้าเพิ่มเติมของออเดอร์เดิม ไม่ใช่แถวหลัก
      var status = String(row[COD_STATUS_COL_ - 1] || '');
      if (!status) continue;
      if (wanted !== '*' && status !== wanted) continue;
      results.push({
        rowIndex: firstRow + i,
        orderId: String(row[0] || ''),
        orderDate: fmtDate_(row[1]),
        firstItemName: String(row[2] || ''),
        amount: parseFloat(row[8]) || 0,
        customerName: String(row[13] || ''),
        phone: String(row[14] || ''),
        province: String(row[23] || ''),
        address: String(row[24] || ''),
        trackingNumber: String(row[26] || ''),
        lineUid: String(row[31] || ''),
        status: status,
        paidDate: fmtDate_(row[COD_PAID_DATE_COL_ - 1])
      });
    }
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

var AUTO_MEMBER_CONFIG_PROP_ = 'AUTO_MEMBER_FROM_ORDER_CONFIG';

function getAutoMemberConfig_() {
  var fallback = { enabled: true, notify: true, grantWelcome: true };
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(AUTO_MEMBER_CONFIG_PROP_);
    if (!raw) return fallback;
    var cfg = JSON.parse(raw);
    return {
      enabled: cfg.enabled !== false,
      notify: cfg.notify !== false,
      grantWelcome: cfg.grantWelcome !== false
    };
  } catch (e) {
    return fallback;
  }
}

function getAutoMemberConfig(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  return { success: true, config: getAutoMemberConfig_() };
}

function buildAudienceIndex_() {
  var memberSheet = ensureMembersSheet_();
  var lastRow = memberSheet.getLastRow();
  var members = [];
  if (lastRow > 1) {
    memberSheet.getRange(2, 1, lastRow - 1, 16).getValues().forEach(function (row, i) {
      var uid = String(row[0] || '').trim();
      if (!uid) return;
      var blocked = row[15] === true || String(row[15]).toUpperCase() === 'TRUE';
      members.push({
        rowIndex: i + 2, uid: uid,
        name: String(row[9] || row[1] || '').trim(),
        phone: normalizeDigits_(String(row[3] || '')),
        lifetimeSpend: parseFloat(row[11]) || 0,
        blocked: blocked
      });
    });
  }

  // ออเดอร์ทั้งหมด: เก็บ uid และเบอร์ที่เคยซื้อ
  var boughtUids = {}, boughtPhones = {};
  var marketplaceOnly = 0;
  try {
    var revSheet = ensureRevenueSheet_();
    var revLast = revSheet.getLastRow();
    if (revLast > 1) {
      var rev = revSheet.getRange(2, 1, revLast - 1, 32).getValues();
      rev.forEach(function (r) {
        if (!String(r[0] || '').trim()) return;           // แถวต่อของออเดอร์เดิม ข้าม

        // ⚡ แก้ (20/9/69) — เดิมนับว่า "เคยซื้อ" ทันทีที่มีชื่อ/เบอร์โผล่ในชีต Revenue ซึ่งผิด เพราะชีตนี้
        // เก็บออเดอร์ตั้งแต่วินาทีที่ลูกค้ากดสั่งซื้อ ยังไม่ได้จ่ายเงินก็มีแถวแล้ว ผลคือคนที่กดสั่งแล้วทิ้ง
        // ไม่เคยโอนเลยสักบาท ถูกนับเป็น "ลูกค้าเก่า" และไม่เคยได้รับโปรชวนซื้อครั้งแรกอีกเลย
        //   • ออเดอร์ LINE Shop → ยึดคอลัมน์ AE "วันที่ชำระเงิน" เป็นหลัก ว่างเมื่อไหร่ = ยังไม่ได้จ่ายจริง
        //     (ออเดอร์เก็บเงินปลายทางมีวันที่นี้ตั้งแต่วันที่สั่ง ตามหลักการรับรู้ยอดขายที่ตกลงกันไว้
        //     ส่วนออเดอร์ที่ตีกลับ/ยกเลิก วันที่นี้จะถูกล้างทิ้งและชื่อสินค้ากลายเป็น "ยกเลิก")
        //   • ช่องทางอื่น (Shopee/TikTok ฯลฯ) ไม่มีคอลัมน์นี้ให้ใช้ เพราะแพลตฟอร์มเก็บเงินเองอยู่แล้ว
        //     มีแถวอยู่ก็คือซื้อจริง นับตามเดิม
        if (String(r[2] || '').trim() === CANCELLED_ORDER_MARK_) return;   // ยกเลิก/ตีกลับ ไม่นับ
        var isLineShopOrder_ = String(r[16] || '').trim().toLowerCase() === 'line shop'
          || String(r[18] || '').trim() === 'สมาชิก LINE';
        if (isLineShopOrder_ && !r[30]) return;           // สั่งแล้วแต่ยังไม่มีวันที่ชำระเงิน = ยังไม่ซื้อ

        var uid = String(r[31] || '').trim();
        var ph = normalizeDigits_(String(r[14] || ''));
        if (uid) boughtUids[uid] = true;
        if (ph) boughtPhones[ph] = true;
        if (!uid) marketplaceOnly++;
      });
    }
  } catch (e) {
    Logger.log('buildAudienceIndex_ อ่านชีต Revenue ไม่สำเร็จ: ' + e.toString());
  }

  members.forEach(function (m) {
    m.bought = !!(boughtUids[m.uid] || (m.phone && boughtPhones[m.phone]) || m.lifetimeSpend > 0);
  });

  return {
    members: members,
    stats: {
      total: members.length,
      bought: members.filter(function (m) { return m.bought && !m.blocked; }).length,
      notBought: members.filter(function (m) { return !m.bought && !m.blocked; }).length,
      blocked: members.filter(function (m) { return m.blocked; }).length,
      unreachableOrders: marketplaceOnly
    }
  };
}

function pickAudience_(index, group) {
  return index.members.filter(function (m) {
    if (m.blocked) return false;                       // ส่งไปก็ไม่ถึง เสียเงินฟรี
    if (group === 'bought') return m.bought;
    if (group === 'notBought') return !m.bought;
    return true;                                        // 'all'
  });
}

function getCampaignAudience(pin, group) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var index = buildAudienceIndex_();
    var list = pickAudience_(index, group || 'all');
    return {
      success: true,
      stats: index.stats,
      count: list.length,
      sample: list.slice(0, 20).map(function (m) { return { name: m.name || '(ไม่มีชื่อ)', bought: m.bought }; })
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function findLineUidByPhoneFromRevenue(pin, phone) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  var phoneClean = String(phone || '').replace(/[^0-9]/g, '');
  if (!phoneClean) return { success: false, error: 'กรุณากรอกเบอร์โทร' };
  try {
    var ss = SpreadsheetApp.openById(REVENUE_SHEET_ID_SHOP);
    var sheet = ss.getSheetByName(REVENUE_SHEET_NAME_SHOP);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, error: 'ไม่พบประวัติออเดอร์' };
    var data = sheet.getRange(2, 1, lastRow - 1, 32).getValues();
    for (var i = data.length - 1; i >= 0; i--) {
      var rowPhone = String(data[i][14] || '').replace(/[^0-9]/g, '');
      var rowUid = String(data[i][31] || '').trim();
      if (rowPhone === phoneClean && rowUid) {
        return { success: true, lineUid: rowUid, customerName: String(data[i][13] || ''), orderId: String(data[i][0] || '') };
      }
    }
    return { success: false, error: 'ไม่พบเบอร์นี้ในประวัติออเดอร์เก่า (ต้องเป็นออเดอร์ที่เคยบันทึก LINE UID ไว้แล้วเท่านั้น)' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

  return { searchMembers, getMemberPrivileges, getBlockedMembers, getCampaignAudience, getAutoMemberConfig, getBirthdayPromoConfigForAdmin, getCodConfigForAdmin, getPurchaseReferralConfigForAdmin, getReferralConfigForAdmin, getShippingConfigForAdmin, getShopProducts, getTierConfigForAdmin, listCodBlockedMembers, listCodOrders, listGlobalCoupons, listPointsPromos, listPurchaseReferrals, listRedemptionLog, listReferrals, listRewardsCatalogAdmin, listSignupPrivilegeItems, listTierPerks, findLineUidByPhoneFromRevenue };
}
