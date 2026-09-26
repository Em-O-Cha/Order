// สร้างอัตโนมัติจาก Members.gs ด้วย tools/gas-port/extract.mjs (target shop-read) — ห้ามแก้ไฟล์นี้ตรงๆ
// ให้รันสคริปต์ใหม่แทน — 146 รายการ (99 ฟังก์ชัน)
/* eslint-disable */
export function createGas(env) {
  const { SpreadsheetApp, CacheService, PropertiesService, Utilities, Logger, LockService, Session, Date,
          verifyLineIdToken_, logErrorToSheet_, ensureDebugLogSheet_, logSlowAction_, logRegistrationQueueWait_ } = env;

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

function resolveTierNoDowngrade_(currentTierKeyOrName, lifetimeSpend, points) {
  var sorted = getTierConfig_().slice().sort(function (a, b) { return a.minSpend - b.minSpend; });
  var eligible = calcEligibleTier_(lifetimeSpend, points);
  var currentIndex = sorted.findIndex(function (t) { return t.key === currentTierKeyOrName || t.name === currentTierKeyOrName; });
  var eligibleIndex = sorted.findIndex(function (t) { return t.key === eligible.key; });
  if (currentIndex >= 0 && currentIndex > eligibleIndex) return sorted[currentIndex];
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

function calcPointsRedeemDiscount_(pointsToRedeem, memberPoints, maxPayable) {
  var cfg = getPointsRedeemConfig_();
  var requested = parseInt(pointsToRedeem) || 0;
  if (requested <= 0) return { discount: 0, pointsUsed: 0, error: '' };
  if (!cfg.enabled) return { discount: 0, pointsUsed: 0, error: 'ระบบแลกคะแนนเป็นส่วนลดเงินสดยังไม่เปิดใช้งาน' };
  if (cfg.minRedeem > 0 && requested < cfg.minRedeem) return { discount: 0, pointsUsed: 0, error: 'ต้องแลกอย่างน้อย ' + cfg.minRedeem + ' คะแนน' };
  if (requested > memberPoints) return { discount: 0, pointsUsed: 0, error: 'ไม่สามารถใช้คะแนนได้: คุณมีคะแนนคงเหลือ ' + (parseInt(memberPoints) || 0) + ' คะแนน' };
  if (cfg.maxRedeemPerOrder > 0 && requested > cfg.maxRedeemPerOrder) requested = cfg.maxRedeemPerOrder;
  var discount = requested / cfg.pointsPerBaht;
  if (discount > maxPayable) {
    requested = Math.min(memberPoints, Math.ceil(maxPayable * cfg.pointsPerBaht));
    discount = requested / cfg.pointsPerBaht;
    if (discount > maxPayable) discount = maxPayable;
  }
  return { discount: discount, pointsUsed: requested, error: '' };
}

var COD_STATUS_COL_ = 33;

var COD_MEMBER_BLOCK_COL_ = 19;

var COD_MEMBER_BLOCK_REASON_COL_ = 20;

function isCodPaymentLabel_(label) { return String(label || '').indexOf('เก็บเงินปลายทาง') !== -1; }

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

function getMemberCodBlock_(lineUid) {
  var uid = String(lineUid || '').trim();
  if (!uid) return { blocked: false, reason: '' };
  try {
    var found = getMemberRowByUid_(uid, COD_MEMBER_BLOCK_REASON_COL_);
    if (!found) return { blocked: false, reason: '' };
    return {
      blocked: isTrueCell_(found.values[COD_MEMBER_BLOCK_COL_ - 1]),
      reason: String(found.values[COD_MEMBER_BLOCK_REASON_COL_ - 1] || ''),
      rowIndex: found.rowIndex
    };
  } catch (e) {
    Logger.log('getMemberCodBlock_ error: ' + e.toString());
    return { blocked: false, reason: '' };
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

function getReferralPublicStatus() {
  var cfg = getReferralConfig_();
  return { success: true, enabled: cfg.enabled && isDateRangeActive_(cfg.startDate, cfg.endDate) };
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

function getPurchaseReferralPublicStatus() {
  var cfg = getPurchaseReferralConfig_();
  return { success: true, enabled: cfg.enabled && isDateRangeActive_(cfg.startDate, cfg.endDate) };
}

function parsePurchaseReferrerCodeFromRemark_(remark) {
  var m = String(remark || '').match(/🤝 รหัสแนะนำซื้อ:\s*([^\s|]+)/);
  return m ? m[1].trim() : '';
}

var lastLineVerifyError_ = '';

function decodeItemsB64_(b64) {
  try {
    if (!b64) return '[]';
    var bytes = Utilities.base64Decode(b64);
    return Utilities.newBlob(bytes).getDataAsString('UTF-8');
  } catch (e) {
    return '[]';
  }
}

function tokenDiag_(idToken) {
  var dotCount = idToken ? (String(idToken).match(/\./g) || []).length : 0;
  return 'เซิร์ฟเวอร์เห็น idToken ยาว ' + (idToken ? String(idToken).length : 0) + ' ตัวอักษร, มี ' + dotCount + ' จุด';
}

function getMyShippingAddress(idToken) {
  try {
    var profile = verifyLineIdToken_(idToken);
    if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ')' };
    var memberFound = getMemberRowByUid_(profile.sub, 9);
    if (!memberFound) return { success: true, address: '', province: '' };
    return { success: true, address: String(memberFound.values[7] || ''), province: String(memberFound.values[8] || '') };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
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

function checkMemberStatus(idToken) {
  try {
    var t0_ = Date.now();
    var profile = verifyLineIdToken_(idToken);
    if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ กรุณาเปิดผ่านแอป LINE เท่านั้น (' + lastLineVerifyError_ + ') | ' + tokenDiag_(idToken) };

    var rowIndex = findMemberRowIndex_(profile.sub);
    if (rowIndex !== -1) {
      var membersSheet = ensureMembersSheet_();
      var row = membersSheet.getRange(rowIndex, 1, 1, 13).getValues()[0];
      var lifetimeSpendRaw = row[11] || 0;
      var rawTierValue_ = String(row[6] || '').trim();
      var tierInfo = resolveTierByStoredValue_(rawTierValue_, lifetimeSpendRaw, profile.sub);

      // ⚡ แก้ (1/9/69) — ถ้า key ดิบที่เก็บไว้ใน Members ไม่ตรงกับที่ resolve ได้ (แปลว่า match ตรงๆ ไม่เจอ
      // แล้วต้อง fallback ไปหาจากประวัติแลกคะแนน/ยอดซื้อสะสม) ให้ซ่อมคอลัมน์ Tier ให้ตรงทันทีตั้งแต่ login
      // ครั้งนี้เลย จะได้ไม่ต้องพึ่ง fallback ทุกครั้งที่ login ต่อไป (ซ่อมข้อมูลถาวร ไม่ใช่แค่ซ่อนปัญหา)
      if (tierInfo.key && rawTierValue_ !== tierInfo.key) {
        membersSheet.getRange(rowIndex, 7).setValue(tierInfo.key);
      }

      var correctedTier = resolveTierNoDowngrade_(tierInfo.key, lifetimeSpendRaw, row[5] || 0);
      if (correctedTier.key && correctedTier.key !== tierInfo.key) {
        membersSheet.getRange(rowIndex, 7).setValue(correctedTier.key);
        tierInfo = correctedTier;
      }

      return {
        success: true, isMember: true,
        member: {
          displayName: row[1], picture: row[2] || profile.picture || '', phone: row[3],
          joinDate: row[4], points: row[5] || 0, tier: tierInfo.name,
          tierColor: tierInfo.color, tierTextColor: tierInfo.textColor, tierNameEn: tierInfo.nameEn, tierKey: tierInfo.key,
          pointMultiplier: tierInfo.pointMultiplier,
          fullName: row[9] || '', birthday: formatBirthdayThai_(row[10]), birthdayRaw: String(row[10] || ''),
          lifetimeSpend: row[11] || 0, address: row[7] || '', province: row[8] || '',
          memberCode: row[12] || ''
        }
      };
    }
    return { success: true, isMember: false, lineProfile: { displayName: profile.name, picture: profile.picture || '' } };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

var REVENUE_SHEET_ID_SHOP   = '1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY';

var REVENUE_SHEET_NAME_SHOP = 'Revenue';

var MASTER_SHEET_ID_SHOP    = '1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w';

var SHOP_PROMPTPAY_ID = '0105555177061';

var SHOP_BANK_NAME    = 'กสิกรไทย (K-Bank)';

var SHOP_BANK_ACCOUNT = '0698834641';

var SHOP_ACCOUNT_NAME = 'บริษัท สปังกี้ ฟู้ด จำกัด';

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

function getTierPerksForMember_(memberTierKey) {
  try {
    var sheet = ensureTierPerksSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    var tierConfig = getTierConfig_();
    var memberIdx = tierConfig.findIndex(function (t) { return t.key === memberTierKey; });
    var results = [];
    data.forEach(function (row) {
      var active = row[2] === true || String(row[2]).toUpperCase() === 'TRUE';
      if (!active) return;
      var tierObj = tierConfig.find(function (t) { return t.key === row[1]; });
      var perkIdx = tierObj ? tierConfig.indexOf(tierObj) : -1;
      results.push({
        text: row[0], tierName: tierObj ? tierObj.name : row[1],
        unlocked: perkIdx !== -1 && memberIdx !== -1 && memberIdx >= perkIdx
      });
    });
    return results;
  } catch (e) {
    return [];
  }
}

var POINTS_PROMOS_RAW_CACHE_KEY_ = 'points_promos_raw_v1';

function getCachedPointsPromosRawData_() {
  try {
    var cached = CacheService.getScriptCache().get(POINTS_PROMOS_RAW_CACHE_KEY_);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  var sheet = ensurePointsPromosSheet_();
  var lastRow = sheet.getLastRow();
  var data = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 13).getValues() : [];
  try {
    CacheService.getScriptCache().put(POINTS_PROMOS_RAW_CACHE_KEY_, JSON.stringify(data), 15);
  } catch (e) {
    // ชีตใหญ่เกิน 100KB ต่อ cache key ก็แค่ข้าม cache ไปเฉยๆ ไม่กระทบความถูกต้องของข้อมูลเลย
  }
  return data;
}

function getActivePointsMultiplierPromosForDisplay_() {
  try {
    var data = getCachedPointsPromosRawData_();
    if (!data.length) return [];
    var now = new Date();
    var results = [];
    data.forEach(function (row) {
      if (row[1] !== 'multiplier') return;
      var active = row[2] === true || String(row[2]).toUpperCase() === 'TRUE';
      if (!active) return;
      var startDateVal = row[3], expiryDateVal = row[4];
      if (startDateVal && new Date(startDateVal) > now) return;
      if (expiryDateVal && isExpired_(expiryDateVal, now)) return;
      var multiplier = parseFloat(row[5]) || 1;
      if (multiplier <= 1) return;
      results.push({
        name: row[0], multiplier: multiplier,
        minPurchase: parseFloat(row[6]) || 0, restriction: String(row[7] || '').trim(),
        expiry: expiryDateVal ? new Date(expiryDateVal).toLocaleDateString('th-TH') : '',
        stubText: row[12] || ''
      });
    });
    return results;
  } catch (e) {
    return [];
  }
}

function getActiveRepeatBonusConfig_(items, subtotal, now) {
  try {
    var data = getCachedPointsPromosRawData_();
    if (!data.length) return null;
    now = now || new Date();
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (row[1] !== 'repeat') continue;
      var active = row[2] === true || String(row[2]).toUpperCase() === 'TRUE';
      if (!active) continue;
      var startDateVal = row[3], expiryDateVal = row[4];
      if (startDateVal && new Date(startDateVal) > now) continue;
      if (expiryDateVal && isExpired_(expiryDateVal, now)) continue;
      var minPurchase = parseFloat(row[6]) || 0;
      if (minPurchase > 0 && (subtotal || 0) < minPurchase) continue;
      var restriction = String(row[7] || '').trim();
      if (restriction) {
        var eligible = computeEligibleInfo_(items || [], restriction);
        if (eligible.qty <= 0) continue;
      }
      return {
        name: row[0], bonusPoints: parseInt(row[8]) || 0,
        discountType: row[9] || '', discountValue: parseFloat(row[10]) || 0,
        minPurchase: minPurchase, multiplier: parseFloat(row[5]) || 1
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

function getActiveRepeatPromosForDisplay_() {
  try {
    var data = getCachedPointsPromosRawData_();
    if (!data.length) return [];
    var now = new Date();
    var results = [];
    data.forEach(function (row) {
      if (row[1] !== 'repeat') return;
      var active = row[2] === true || String(row[2]).toUpperCase() === 'TRUE';
      if (!active) return;
      var startDateVal = row[3], expiryDateVal = row[4];
      if (startDateVal && new Date(startDateVal) > now) return;
      if (expiryDateVal && isExpired_(expiryDateVal, now)) return;
      var bonusPoints = parseInt(row[8]) || 0;
      var discountValue = parseFloat(row[10]) || 0;
      var multiplier = parseFloat(row[5]) || 1;
      if (bonusPoints <= 0 && discountValue <= 0 && multiplier <= 1) return;
      results.push({
        name: row[0], bonusPoints: bonusPoints,
        discountType: row[9] || '', discountValue: discountValue, multiplier: multiplier,
        minPurchase: parseFloat(row[6]) || 0, restriction: String(row[7] || '').trim(),
        expiry: expiryDateVal ? new Date(expiryDateVal).toLocaleDateString('th-TH') : '',
        stubText: row[12] || ''
      });
    });
    return results;
  } catch (e) {
    return [];
  }
}

var REVENUE_PHONE_COL_ = 15;

var MERGED_READ_MAX_CELLS_ = 60000;

var MERGED_READ_GAP_CELLS_ = 20000;

function readRowsMerged_(sheet, rowNumbers, numCols) {
  var results = [];
  var k = 0;
  while (k < rowNumbers.length) {
    var start = rowNumbers[k], end = start, j = k + 1;
    while (j < rowNumbers.length
        && (rowNumbers[j] - end - 1) * numCols <= MERGED_READ_GAP_CELLS_
        && (rowNumbers[j] - start + 1) * numCols <= MERGED_READ_MAX_CELLS_) {
      end = rowNumbers[j]; j++;
    }
    var wanted = {};
    for (var w = k; w < j; w++) wanted[rowNumbers[w]] = true;
    var chunk = sheet.getRange(start, 1, end - start + 1, numCols).getValues();
    for (var i = 0; i < chunk.length; i++) {
      if (wanted[start + i]) results.push({ rowIndex: start + i, values: chunk[i] });
    }
    k = j;
  }
  return results;
}

function getKeyRowIndexCached_(sheet, keyCol, key, cacheKeyPrefix, ttlSeconds, normalizer) {
  if (!key) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var cache = CacheService.getScriptCache();
  var cacheKey = cacheKeyPrefix + String(key).substring(0, 40);
  var cached = null;
  try {
    var raw = cache.get(cacheKey);
    if (raw) cached = JSON.parse(raw);
  } catch (e) {}

  if (cached && cached.upTo >= 1 && cached.upTo <= lastRow) {
    if (cached.upTo === lastRow) return cached.rows;
    var addl = sheet.getRange(cached.upTo + 1, keyCol, lastRow - cached.upTo, 1).getValues();
    var rows = cached.rows.slice();
    for (var i = 0; i < addl.length; i++) {
      if (normalizer(addl[i][0]) === key) rows.push(cached.upTo + 1 + i);
    }
    try { cache.put(cacheKey, JSON.stringify({ upTo: lastRow, rows: rows }), ttlSeconds); } catch (e) {}
    return rows;
  }

  var col = sheet.getRange(2, keyCol, lastRow - 1, 1).getValues();
  var found = [];
  for (var j = 0; j < col.length; j++) {
    if (normalizer(col[j][0]) === key) found.push(j + 2);
  }
  try { cache.put(cacheKey, JSON.stringify({ upTo: lastRow, rows: found }), ttlSeconds); } catch (e) {}
  return found;
}

function normalizeDigits_(v) { return String(v || '').replace(/[^0-9]/g, ''); }

function normalizeAsString_(v) { return String(v || ''); }

function ensureRevenueSheet_() {
  if (_sheetCache_.revenueShop) return _sheetCache_.revenueShop;
  _sheetCache_.revenueShop = SpreadsheetApp.openById(REVENUE_SHEET_ID_SHOP).getSheetByName(REVENUE_SHEET_NAME_SHOP);
  return _sheetCache_.revenueShop;
}

function revenueReadCols_(wanted) {
  try { return Math.min(wanted, ensureRevenueSheet_().getMaxColumns()); } catch (e) { return 32; }
}

var REVENUE_PHONE_ROWS_CACHE_TTL_ = 600;

function getRevenueRowNumbersForPhone_(phoneClean) {
  return getKeyRowIndexCached_(ensureRevenueSheet_(), REVENUE_PHONE_COL_, phoneClean, 'revrows_', REVENUE_PHONE_ROWS_CACHE_TTL_, normalizeDigits_);
}

function getRevenueRowsForPhone_(phone, maxRecentOrders, numCols) {
  var phoneClean = String(phone || '').replace(/[^0-9]/g, '');
  if (!phoneClean) return [];
  var sheet = ensureRevenueSheet_();
  var rowNumbers = getRevenueRowNumbersForPhone_(phoneClean);
  if (!rowNumbers.length) return [];
  // ⚡ แก้ (perf) — ถ้าระบุ maxRecentOrders มา เอาแค่ N ออเดอร์ล่าสุดของเบอร์นี้ (แถวเลขมากสุด = ใหม่สุด เพราะ
  // ข้อมูลต่อท้ายชีตเสมอ) แทนที่จะอ่านทุกออเดอร์ย้อนหลังทั้งหมด — ใช้ตอนสนใจแค่ "ออเดอร์ล่าสุดไม่กี่รายการ"
  // (เช่น หน้ารถเข็นแสดงแค่ 20 ออเดอร์ล่าสุด) ยิ่งลูกค้าประจำมีประวัติกระจายทั่วชีต เดิมต้องยิง getRange แยกกัน
  // หลายรอบ (ไม่ต่อเนื่องกัน) ยิ่งมีประวัติเยอะยิ่งช้า ตัดให้เหลือแค่ไม่กี่ออเดอร์ล่าสุดช่วยลดรอบที่ต้องยิงได้มาก
  if (maxRecentOrders && rowNumbers.length > maxRecentOrders) {
    rowNumbers = rowNumbers.slice(rowNumbers.length - maxRecentOrders);
  }
  return readRowsMerged_(sheet, rowNumbers, numCols || 24);
}

var REVENUE_MONTH_START_ROW_PROP_ = 'revenue_month_start_row';

var REVENUE_MONTH_START_KEY_PROP_ = 'revenue_month_start_key';

function getRevenueMonthStartRow_(sheet, lastRow, monthKey) {
  var props = PropertiesService.getScriptProperties();
  var storedKey = props.getProperty(REVENUE_MONTH_START_KEY_PROP_);
  var storedRow = parseInt(props.getProperty(REVENUE_MONTH_START_ROW_PROP_), 10) || 0;

  if (storedKey === monthKey && storedRow >= 2 && storedRow <= lastRow) {
    return storedRow; // เดือนเดียวกับที่เคยหาไว้ — จุดเริ่มต้นไม่มีวันขยับ ใช้ค่าเดิมได้เลยไม่ต้องอ่านชีตซ้ำ
  }

  // เดือนเปลี่ยนไปแล้ว (หรือยังไม่เคยหาเลย) — เริ่มไล่หาต่อจากแถวเริ่มต้นเดือนก่อน (ถ้ามี) แทนที่จะไล่จากบนสุด
  var searchStart = (storedRow >= 2 && storedRow <= lastRow) ? storedRow : 2;
  var dates = sheet.getRange(searchStart, 23, lastRow - searchStart + 1, 1).getValues();
  var foundRow = null;
  for (var i = 0; i < dates.length; i++) {
    var d = dates[i][0];
    if (d && Utilities.formatDate(new Date(d), 'GMT+7', 'yyyy-MM') === monthKey) { foundRow = searchStart + i; break; }
  }
  if (!foundRow) return lastRow + 1; // ยังไม่มีออเดอร์เดือนนี้เลย — ยังไม่บันทึกค่าไว้ถาวร รอมีออเดอร์แรกค่อยหาใหม่

  props.setProperty(REVENUE_MONTH_START_ROW_PROP_, String(foundRow));
  props.setProperty(REVENUE_MONTH_START_KEY_PROP_, monthKey);
  return foundRow;
}

function getRevenueRowsForPhoneRecentWindow_(phone, monthKey) {
  var phoneClean = String(phone || '').replace(/[^0-9]/g, '');
  if (!phoneClean) return [];
  var sheet = ensureRevenueSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var monthStartRow = getRevenueMonthStartRow_(sheet, lastRow, monthKey);
  if (monthStartRow > lastRow) return []; // ยังไม่มีออเดอร์เดือนนี้เลย
  var phoneCol = sheet.getRange(monthStartRow, REVENUE_PHONE_COL_, lastRow - monthStartRow + 1, 1).getValues();
  var rowNumbers = [];
  for (var i = 0; i < phoneCol.length; i++) {
    var clean = String(phoneCol[i][0] || '').replace(/[^0-9]/g, '');
    if (clean && clean === phoneClean) rowNumbers.push(monthStartRow + i);
  }
  if (!rowNumbers.length) return [];
  return readRowsMerged_(sheet, rowNumbers, 24);
}

function countPriorOrdersThisMonth_(phone, excludeOrderId) {
  try {
    var phoneClean = String(phone || '').replace(/[^0-9]/g, '');
    if (!phoneClean) return 0;
    var now = new Date();
    var monthKey = Utilities.formatDate(now, 'GMT+7', 'yyyy-MM');
    var rows = getRevenueRowsForPhoneRecentWindow_(phone, monthKey);
    if (!rows.length) return 0;
    var seenIds = {};
    rows.forEach(function (entry) {
      var row = entry.values;
      if (!row[0]) return;
      var revenueId = String(row[0]);
      if (excludeOrderId && revenueId === String(excludeOrderId)) return;
      var orderDate = row[22] ? new Date(row[22]) : (row[1] ? new Date(row[1]) : null);
      if (!orderDate) return;
      if (Utilities.formatDate(orderDate, 'GMT+7', 'yyyy-MM') !== monthKey) return;
      seenIds[revenueId] = true;
    });
    return Object.keys(seenIds).length;
  } catch (e) {
    return 0;
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

function parsePendingPointsReservation_(remark) {
  var match = String(remark || '').match(/🎯 คะแนนรอหัก:\s*(\d+)\s*คะแนน\s*\(-฿([\d.]+)\)/);
  return match ? { points: parseInt(match[1], 10) || 0, discount: parseFloat(match[2]) || 0 } : { points: 0, discount: 0 };
}

var PENDING_POINTS_RECENT_WINDOW_ = 1500;

var PENDING_POINTS_OLDER_ROWS_MAX_ = 12;

function pendingReservationFromRevenueRow_(row, excludeOrderId) {
  var orderId = String(row[0] || '');
  if (!orderId || (excludeOrderId && orderId === String(excludeOrderId))) return 0;
  if (String(row[2] || '') === CANCELLED_ORDER_MARK_) return 0; // ยกเลิกแล้ว ไม่ได้จองคะแนนไว้
  // ⚡ แก้ (19/9/69) — เดิมถือว่า "คอลัมน์ K (สลิป) มีค่า = ตัดคะแนนไปแล้ว" ซึ่งใช้กับออเดอร์เก็บเงินปลายทาง
  // ไม่ได้ เพราะออเดอร์แบบนั้นใส่ข้อความกำกับไว้ในคอลัมน์ K ตั้งแต่ตอนสั่งซื้อ (ไม่มีสลิปให้แนบ) แต่คะแนนยัง
  // ไม่ถูกตัดจริงจนกว่าแอดมินจะยืนยันว่าเก็บเงินได้ — ถ้านับผิดตรงนี้ ลูกค้าจะเอาคะแนนก้อนเดิมไปใช้ซ้ำกับ
  // ออเดอร์ใหม่ได้ระหว่างรอเก็บเงิน แล้วตอนยืนยันรับเงินจะตัดคะแนนไม่พอ (ตอนเก็บเงินได้จริง ข้อความ
  // "คะแนนรอหัก" จะถูกเปลี่ยนเป็น "หักคะแนนแล้ว" ซึ่งทำให้ฟังก์ชันนี้คืน 0 ได้เองอยู่แล้ว)
  if (row[10] && !isCodPaymentLabel_(row[9])) return 0; // แนบสลิปแล้ว = ตัดคะแนนไปแล้ว
  return parsePendingPointsReservation_(row[19]).points;
}

var PENDING_POINTS_CACHE_TTL_ = 60;

function pendingPointsCacheKey_(phoneClean, excludeOrderId) {
  return 'pendpts_' + phoneClean + '_' + String(excludeOrderId || '');
}

function getPendingPointsReservedForPhone_(phone, excludeOrderId, allowCache) {
  try {
    var phoneClean = String(phone || '').replace(/[^0-9]/g, '');
    if (!phoneClean) return 0;
    var cacheKey_ = pendingPointsCacheKey_(phoneClean, excludeOrderId);
    if (allowCache) {
      try {
        var hit_ = CacheService.getScriptCache().get(cacheKey_);
        if (hit_ !== null && hit_ !== undefined) return parseInt(hit_, 10) || 0;
      } catch (e) {}
    }
    var sheet = ensureRevenueSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return 0;

    var windowStart = Math.max(2, lastRow - PENDING_POINTS_RECENT_WINDOW_ + 1);
    var data = sheet.getRange(windowStart, 1, lastRow - windowStart + 1, 20).getValues();
    var total = 0;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][REVENUE_PHONE_COL_ - 1] || '').replace(/[^0-9]/g, '') !== phoneClean) continue;
      total += pendingReservationFromRevenueRow_(data[i], excludeOrderId);
    }

    if (windowStart > 2) {
      var olderRows = getRevenueRowNumbersForPhone_(phoneClean).filter(function (r) { return r < windowStart; });
      if (olderRows.length > PENDING_POINTS_OLDER_ROWS_MAX_) {
        olderRows = olderRows.slice(olderRows.length - PENDING_POINTS_OLDER_ROWS_MAX_);
      }
      if (olderRows.length) {
        var olderData = readRowsMerged_(sheet, olderRows, 20);
        for (var j = 0; j < olderData.length; j++) {
          total += pendingReservationFromRevenueRow_(olderData[j].values, excludeOrderId);
        }
      }
    }
    try { CacheService.getScriptCache().put(cacheKey_, String(total), PENDING_POINTS_CACHE_TTL_); } catch (e) {}
    return total;
  } catch (e) {
    Logger.log('getPendingPointsReservedForPhone_ error: ' + e.toString());
    return 0;
  }
}

var PRIVILEGE_ROWS_CACHE_TTL_ = 600;

function getPrivilegeRowsForLineUid_(lineUid) {
  if (!lineUid) return [];
  var sheet = ensurePrivilegesSheet_();
  var rowNumbers = getKeyRowIndexCached_(sheet, 1, String(lineUid), 'privrows_', PRIVILEGE_ROWS_CACHE_TTL_, normalizeAsString_);
  if (!rowNumbers.length) return [];
  // อ่านกว้างพอให้ถึงคอลัมน์ "ใช้ร่วมกับคูปองได้" (ถ้ามี) ด้วย
  return readRowsMerged_(sheet, rowNumbers, Math.max(15, privilegeStackableCol_()));
}

var PRIVILEGE_STACKABLE_HEADER_ = 'ใช้ร่วมกับคูปอง/ส่วนลดอื่นได้(TRUE/FALSE)';

var privilegeStackableColCache_ = null;

function privilegeStackableCol_(create) {
  if (privilegeStackableColCache_ !== null && (privilegeStackableColCache_ > 0 || !create)) return privilegeStackableColCache_;
  var sheet = ensurePrivilegesSheet_();
  var width = Math.max(sheet.getLastColumn(), 15);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var c = header.indexOf(PRIVILEGE_STACKABLE_HEADER_) + 1;
  if (!c && create) { c = width + 1; sheet.getRange(1, c).setValue(PRIVILEGE_STACKABLE_HEADER_); }
  privilegeStackableColCache_ = c;
  return c;
}

function isStackablePrivilegeRow_(row) {
  var c = privilegeStackableCol_();
  if (!c) return false;
  var v = row[c - 1];
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function getAllPrivilegesWithDiscount_(lineUid, subtotal, items, priceMap, shippingCost) {
  try {
    var rows = getPrivilegeRowsForLineUid_(lineUid);
    if (!rows.length) return [];
    var now = new Date();
    var itemsSafe = items || [];
    var results = [];
    rows.forEach(function (entry) {
      var row = entry.values;
      var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
      if (!active) return;
      var startDate = row[9];
      if (startDate && new Date(startDate) > now) return;
      var expiry = row[4];
      if (isExpired_(expiry, now)) return;
      var minPurchase = parseFloat(row[13]) || 0;
      if (minPurchase > 0 && (subtotal || 0) < minPurchase) return;
      var type = String(row[2]);
      var value = parseFloat(row[3]) || 0;
      var promo = { type: type, value: value, restriction: row[10], freeProduct: row[11], freeQty: row[12], freeDiscountPercent: row[14] };
      var calc = calcPromoDiscount_(promo, itemsSafe, priceMap || {}, shippingCost || 0);
      var discount = calc.productDiscount + calc.shippingDiscount;
      results.push({
        rowIndex: entry.rowIndex, name: row[1], type: type, value: value,
        productDiscount: calc.productDiscount, shippingDiscount: calc.shippingDiscount,
        discount: discount, givenBy: row[5],
        freeProduct: row[11] || '', freeQty: row[12] || '', freeQtyGranted: calc.freeQtyGranted,
        physicalFreeQty: calc.physicalFreeQty || 0, minPurchase: minPurchase, freeDiscountPercent: calc.freeDiscountPercent || 100,
        stackable: isStackablePrivilegeRow_(row)
      });
    });
    return results;
  } catch (e) {
    return [];
  }
}

function getAppliedPrivileges_(lineUid, subtotal, excludeRowIndexes, items, priceMap, shippingCost) {
  var excludeList = Array.isArray(excludeRowIndexes) ? excludeRowIndexes : (excludeRowIndexes ? [excludeRowIndexes] : []);
  var excludeSet = {};
  excludeList.forEach(function (n) { if (n !== '' && n !== null && n !== undefined) excludeSet[String(n)] = true; });
  var all = getAllPrivilegesWithDiscount_(lineUid, subtotal, items, priceMap, shippingCost);
  return all.filter(function (p) { return !excludeSet[String(p.rowIndex)]; });
}

function getMyPrivilegesForLineUid_(lineUid) {
  var rows = getPrivilegeRowsForLineUid_(lineUid);
  if (!rows.length) return [];
  var now = new Date();
  var results = [];
  rows.forEach(function (entry) {
    var row = entry.values;
    var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
    if (!active) return;
    var expiry = row[4];
    if (isExpired_(expiry, now)) return;
    // ⚡ แก้ — เดิมข้ามสิทธิ์ที่ยังไม่ถึงวันเริ่มใช้ไปเลย (return ก่อน push) ทำให้ popup ต้อนรับสมาชิกใหม่ที่สมัคร
    // ก่อนวันเริ่มใช้จริงของโปร (เช่น สมัคร 5 ก.ย. แต่โปรเริ่มใช้ 7 ก.ย.) ไม่เห็นชื่อโปรที่ตัวเองได้รับเลยทั้งที่
    // ได้สิทธิ์ติดตัวไปแล้วจริง — เปลี่ยนมาส่งกลับไปด้วยเสมอพร้อม flag isUpcoming ให้ฝั่งหน้าเว็บตัดสินใจเอง
    // ว่าจะซ่อนหรือโชว์แบบบอกวันที่เริ่มใช้ (ผู้ใช้เดิมของฟังก์ชันนี้ที่ไม่เช็ค isUpcoming ต้องกรองออกเองฝั่ง
    // client ถ้าไม่อยากให้พฤติกรรมเปลี่ยน — ดู renderMyPrivileges_ ในหน้าสั่งซื้อที่กรองออกไว้แล้ว)
    var startDate = row[9];
    var isUpcoming = !!(startDate && new Date(startDate) > now);
    results.push({
      name: row[1], type: row[2], value: row[3],
      expiry: expiry ? new Date(expiry).toLocaleDateString('th-TH') : 'ไม่มีวันหมดอายุ',
      // ⚡ เพิ่ม — ส่ง "ให้โดย" (คอลัมน์ 6 ในชีต) กลับไปด้วย เพื่อให้ฝั่งหน้าเว็บกรองแยกได้ว่าสิทธิ์ไหนมาจาก
      // การสมัครสมาชิก (ของขวัญต้อนรับสมาชิกใหม่) ต่างจากสิทธิ์ที่มาจากแหล่งอื่น (แนะนำเพื่อน/วันเกิด/แอดมินให้เอง)
      // ไม่กระทบผู้ใช้เดิมของฟังก์ชันนี้เลยเพราะเป็นแค่ field เสริม ไม่ได้ตัด field เดิมออก
      reason: row[5] || '',
      isUpcoming: isUpcoming,
      startDateText: startDate ? new Date(startDate).toLocaleDateString('th-TH') : ''
    });
  });
  return results;
}

function getMyPrivileges(idToken) {
  try {
    var profile = verifyLineIdToken_(idToken);
    if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ')' };
    return { success: true, results: getMyPrivilegesForLineUid_(profile.sub) };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getShopBootstrap(idToken) {
  try {
    var profile = verifyLineIdToken_(idToken);
    if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ')' };

    var memberFound = getMemberRowByUid_(profile.sub, 13);
    if (!memberFound) {
      return { success: true, isMember: false, lineProfile: { displayName: profile.name || '', picture: profile.picture || '' } };
    }

    var memberRowIndex = memberFound.rowIndex;
    var memberSheet = ensureMembersSheet_();
    var row = memberFound.values;
    var lifetimeSpend = row[11] || 0;
    var rawTierValue_ = String(row[6] || '').trim();
    var tierInfo = resolveTierByStoredValue_(rawTierValue_, lifetimeSpend, profile.sub);
    // ⚡ แก้ (1/9/69) — ซ่อมคอลัมน์ Tier ให้ตรงทันทีถ้า key ดิบไม่ตรงกับที่ resolve ได้ (ดูรายละเอียดเหตุผล
    // เดียวกับใน checkMemberStatus)
    if (tierInfo.key && rawTierValue_ !== tierInfo.key) {
      memberSheet.getRange(memberRowIndex, 7).setValue(tierInfo.key);
    }
    var correctedTier = resolveTierNoDowngrade_(tierInfo.key, lifetimeSpend, row[5] || 0);
    if (correctedTier.key && correctedTier.key !== tierInfo.key) {
      memberSheet.getRange(memberRowIndex, 7).setValue(correctedTier.key);
      tierInfo = correctedTier;
    }

    var productsResult = getShopProducts();
    if (!productsResult.success) return productsResult;

    // เพิ่ม — หน้าสั่งซื้อหน้าแรก: ถ้าลูกค้ายังถือสิทธิพิเศษที่ยังไม่ได้ใช้ จะไม่ส่งคูปองไปเลย
    // หน้าเว็บจึงไม่มีกล่องโปรอัตโนมัติและไม่มีป้าย "ราคาหลังลด" บนการ์ดสินค้า
    // กันลูกค้าเห็นราคาที่สุดท้ายไม่ตรงกับหน้าชำระเงิน (ตรงกับกติกาข้อ 3)
    var privilegesForShop_ = getMyPrivilegesForLineUid_(profile.sub);
    var shopPrivilegeLocked_ = hasUnusedMemberPrivilege_(profile.sub);
    var couponsResult = shopPrivilegeLocked_ ? null : getActiveCoupons();
    var referralStatus = getPurchaseReferralPublicStatus();

    return {
      success: true, isMember: true,
      member: {
        displayName: row[1], picture: row[2] || profile.picture || '', phone: row[3],
        joinDate: row[4], points: row[5] || 0, tier: tierInfo.name,
        tierColor: tierInfo.color, tierTextColor: tierInfo.textColor, tierNameEn: tierInfo.nameEn, tierKey: tierInfo.key,
        pointMultiplier: tierInfo.pointMultiplier,
        fullName: row[9] || '', birthday: formatBirthdayThai_(row[10]), birthdayRaw: String(row[10] || ''),
        lifetimeSpend: lifetimeSpend, address: row[7] || '', province: row[8] || '', memberCode: row[12] || ''
      },
      categories: productsResult.categories || [],
      coupons: couponsResult && couponsResult.success ? couponsResult.results : [],
      privilegeLocked: shopPrivilegeLocked_,
      privileges: privilegesForShop_,
      pointsMultiplierPromos: getActivePointsMultiplierPromosForDisplay_(),
      repeatPurchasePromos: getActiveRepeatPromosForDisplay_(),
      address: String(row[7] || ''), province: String(row[8] || ''),
      paymentInfo: { promptPayId: SHOP_PROMPTPAY_ID, bankName: SHOP_BANK_NAME, bankAccount: SHOP_BANK_ACCOUNT, accountName: SHOP_ACCOUNT_NAME },
      // ⚡ เพิ่ม (19/9/69) — ข้อมูลเก็บเงินปลายทางสำหรับหน้าร้าน: เปิดใช้อยู่ไหม, คนนี้ถูกบล็อกไหม, เงื่อนไข
      // ยอดขั้นต่ำ/เพดาน และค่าธรรมเนียม เพื่อให้หน้าชำระเงินตัดสินใจได้เองว่าจะโชว์ปุ่มไหมและคิดยอดเท่าไร
      // (ฝั่ง backend เช็คซ้ำทุกครั้งตอนสั่งซื้อจริงอยู่แล้ว ค่าที่ส่งไปนี้มีไว้เพื่อการแสดงผลเท่านั้น)
      cod: (function () {
        var codCfg = getCodConfig_();
        var codBlock = getMemberCodBlock_(profile.sub);
        return {
          enabled: codCfg.enabled,
          blocked: codBlock.blocked,
          minAmount: codCfg.minAmount,
          maxAmount: codCfg.maxAmount,
          fee: codCfg.fee,
          feeType: codCfg.feeType,
          note: codCfg.note,
          tierAllowed: !(codCfg.allowedTierKeys.length && tierInfo.key && codCfg.allowedTierKeys.indexOf(String(tierInfo.key)) === -1)
        };
      })(),
      purchaseReferralEnabled: !!(referralStatus && referralStatus.enabled)
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getPrivilegesPanelData(idToken) {
  try {
    var profile = verifyLineIdToken_(idToken);
    if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ')' };
    var now = new Date();

    var privData = getPrivilegeRowsForLineUid_(profile.sub).map(function (e) { return e.values; });
    var privileges = [];
    if (privData.length) {
      privData.forEach(function (row) {
        var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
        if (!active) return;
        var expiry = row[4];
        if (isExpired_(expiry, now)) return;
        // ⚡ แก้ (26/8/69) — เดิมกรองสิทธิ์ที่ยังไม่ถึงวันเริ่มใช้ (startDate ในอนาคต) ออกไปเลย ทำให้สมาชิกไม่
        // เห็นเลยว่าตัวเองมีสิทธิ์นี้ติดตัวอยู่จนกว่าจะถึงวันที่กำหนด — ตอนนี้เปลี่ยนให้ "โชว์ไว้แต่บอกด้วยว่า
        // ใช้ได้ตั้งแต่วันไหน" แทนการซ่อนไปเงียบๆ (isUpcoming + startDateText ให้ฝั่งหน้าเว็บเอาไปแสดงต่อ)
        var startDate = row[9];
        var isUpcoming = !!(startDate && new Date(startDate) > now);
        privileges.push({
          name: row[1], type: row[2], value: row[3],
          expiry: expiry ? new Date(expiry).toLocaleDateString('th-TH') : 'ไม่มีวันหมดอายุ',
          restriction: row[10] || '', freeProduct: row[11] || '', freeQty: row[12] || '',
          isUpcoming: isUpcoming,
          startDateText: isUpcoming ? new Date(startDate).toLocaleDateString('th-TH') : ''
        });
      });
    }

    var points = 0, tier = '';
    var memberTierResolved_ = null;
    var memberRowIdx = findMemberRowIndex_(profile.sub);
    if (memberRowIdx !== -1) {
      var mRow = ensureMembersSheet_().getRange(memberRowIdx, 1, 1, 12).getValues()[0];
      points = mRow[5] || 0;
      memberTierResolved_ = resolveTierByStoredValue_(mRow[6], mRow[11] || 0, profile.sub);
      tier = memberTierResolved_.name;
    }

    var rewardSheet = ensureRewardsCatalogSheet_();
    var rLastRow = rewardSheet.getLastRow();
    var rewards = [];
    var tierConfigForFilter_ = getTierConfig_();
    if (rLastRow > 1) {
      var rData = rewardSheet.getRange(2, 1, rLastRow - 1, 13).getValues();
      rData.forEach(function (row, idx) {
        var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
        if (!active) return;
        if (!isDateRangeActive_(row[11], row[12])) return; // นอกช่วงวันที่โปร (ยังไม่เริ่ม/หมดโปรแล้ว)
        var maxStock = parseInt(row[8]) || 0;
        var redeemedCount = parseInt(row[9]) || 0;
        if (maxStock > 0 && redeemedCount >= maxStock) return;
        if (String(row[1]) === 'tier_upgrade' && memberTierResolved_) {
          var targetTierKey_ = String(row[3] || '').trim();
          var targetTierObj_ = tierConfigForFilter_.find(function (t) { return t.key === targetTierKey_; });
          if (!targetTierObj_) {
            var aliasedKey_ = LEGACY_TIER_ALIASES_[targetTierKey_.toLowerCase()];
            if (aliasedKey_) targetTierObj_ = tierConfigForFilter_.find(function (t) { return t.key === aliasedKey_; });
          }
          var currentIdx_ = tierConfigForFilter_.findIndex(function (t) { return t.key === memberTierResolved_.key; });
          var targetIdx_ = targetTierObj_ ? tierConfigForFilter_.indexOf(targetTierObj_) : -1;
          if (targetIdx_ <= currentIdx_) return;
        }
        rewards.push({
          rowIndex: idx + 2, name: row[0], category: row[1], categoryLabel: REWARD_CATEGORIES_[row[1]] || row[1],
          type: row[2], value: row[3], detail: row[4] || '',
          pointCost: parseInt(row[5]) || 0, validDays: parseInt(row[6]) || 0,
          remaining: maxStock > 0 ? (maxStock - redeemedCount) : -1,
          image: row[10] ? toDirectImageUrl_(String(row[10]).trim()) : ''
        });
      });
    }

    var pointsPromosForMember_ = [];
    try {
      var ppSheet_ = ensurePointsPromosSheet_();
      var ppLastRow_ = ppSheet_.getLastRow();
      if (ppLastRow_ > 1) {
        var ppData_ = ppSheet_.getRange(2, 1, ppLastRow_ - 1, 11).getValues();
        ppData_.forEach(function (row) {
          var active = row[2] === true || String(row[2]).toUpperCase() === 'TRUE';
          if (!active) return;
          var startDateVal = row[3], expiryDateVal = row[4];
          if (startDateVal && new Date(startDateVal) > now) return;
          if (expiryDateVal && isExpired_(expiryDateVal, now)) return;
          pointsPromosForMember_.push({
            name: row[0], type: row[1],
            multiplierValue: row[5] || '', minPurchase: row[6] || '', restriction: row[7] || '',
            bonusPoints: row[8] || '', bonusDiscountType: row[9] || '', bonusDiscountValue: row[10] || '',
            startDate: startDateVal ? Utilities.formatDate(new Date(startDateVal), 'GMT+7', 'dd/MM/yyyy') : '',
            expiryDate: expiryDateVal ? Utilities.formatDate(new Date(expiryDateVal), 'GMT+7', 'dd/MM/yyyy') : ''
          });
        });
      }
    } catch (ppErr) {
      Logger.log('getPrivilegesPanelData: ดึงโปรแต้มสะสมไม่สำเร็จ: ' + ppErr.toString());
    }

    var tierPerksForMember_ = [];
    try {
      tierPerksForMember_ = getTierPerksForMember_(memberTierResolved_ ? memberTierResolved_.key : '');
    } catch (perkErr) {
      Logger.log('getPrivilegesPanelData: ดึงสิทธิ์ตามระดับไม่สำเร็จ: ' + perkErr.toString());
    }

    return { success: true, privileges: privileges, points: points, tier: tier, rewards: rewards, pointsPromos: pointsPromosForMember_, tierPerks: tierPerksForMember_ };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getPointsHistory(idToken) {
  try {
    var profile = verifyLineIdToken_(idToken);
    if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ')' };

    var points = 0;
    var memberRowIdx = findMemberRowIndex_(profile.sub);
    if (memberRowIdx !== -1) {
      points = ensureMembersSheet_().getRange(memberRowIdx, 6).getValue() || 0;
    }

    var logSheet = ensurePointsLogSheet_();
    var lastRow = logSheet.getLastRow();
    var results = [];
    if (lastRow > 1) {
      var CHUNK_SIZE = 500;
      var MAX_CHUNKS = 10;
      var scanEnd = lastRow;
      var chunkCount = 0;
      while (scanEnd > 1 && results.length < 20 && chunkCount < MAX_CHUNKS) {
        var scanStart = Math.max(2, scanEnd - CHUNK_SIZE + 1);
        var chunk = logSheet.getRange(scanStart, 1, scanEnd - scanStart + 1, 6).getValues();
        for (var i = chunk.length - 1; i >= 0 && results.length < 20; i--) {
          var row = chunk[i];
          if (String(row[1]) !== profile.sub) continue;
          results.push({
            date: row[0] ? (new Date(row[0]).toLocaleDateString('th-TH') + ' ' + new Date(row[0]).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })) : '',
            type: row[2], desc: row[3], delta: row[4], balanceAfter: row[5]
          });
        }
        scanEnd = scanStart - 1;
        chunkCount++;
      }
    }

    return { success: true, points: points, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getMyOrderHistory(idToken) {
  try {
    var profile = verifyLineIdToken_(idToken);
    if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ')' };

    var memberFound = getMemberRowByUid_(profile.sub, 4);
    if (!memberFound) return { success: true, results: [] };
    var myPhone = String(memberFound.values[3] || '');
    if (!myPhone) return { success: true, results: [] };

    // ⚡ แก้ (perf) — เดิมไล่อ่านชีต Revenue ย้อนจากท้ายชีตทีละ 1,000 แถว สูงสุด 15 รอบ (15,000 แถว x 24
    // คอลัมน์) กว่าจะเจอ/หมดสิทธิ์หา ยิ่งร้านมียอดขายสะสมเยอะ (รวมทุกช่องทาง ไม่ใช่แค่ LINE) ยิ่งช้า
    // เปลี่ยนมาค้นเฉพาะแถวที่ตรงกับเบอร์นี้ก่อนด้วย getRevenueRowsForPhone_ แล้วค่อยเรียงเอาอันล่าสุดก่อน
    // ⚡ แก้เพิ่ม (perf รอบ 2) — หน้านี้แสดงแค่ 20 ออเดอร์ล่าสุดอยู่แล้ว (ดู results.length < 20 ด้านล่าง) แต่
    // เดิมยังคงอ่าน "ทุกออเดอร์ย้อนหลังทั้งหมด" ของเบอร์นี้มาก่อนเสมอ แล้วค่อยตัดเอา 20 อันหลังสุด ถ้าลูกค้า
    // ประจำมีประวัติกระจายอยู่ทั่วชีต (ปนกับช่องทางอื่นที่ขายมานาน) ยิ่งต้องยิง getRange แยกกันหลายรอบไม่ต่อเนื่อง
    // กัน ยิ่งช้ามาก — จำกัดแค่ 25 ออเดอร์ล่าสุดของเบอร์นี้พอ (เผื่อรวมออเดอร์ที่ถูกยกเลิกไปแล้วปนอยู่บ้าง) ลดรอบ
    // ที่ต้องยิง API ไปได้มากสำหรับลูกค้าประจำที่สั่งซื้อมาเยอะ
    // ⚡ แก้ (19/9/69) — ดึงถึงคอลัมน์ AG (33) ด้วย เพื่ออ่านสถานะเก็บเงินปลายทางมาแสดงในประวัติ
    var rows = getRevenueRowsForPhone_(myPhone, 25, revenueReadCols_(COD_STATUS_COL_));
    rows.sort(function (a, b) { return b.rowIndex - a.rowIndex; });

    var results = [];
    for (var i = 0; i < rows.length && results.length < 20; i++) {
      var row = rows[i].values;
      var orderId = row[0];
      if (!orderId) continue;
      results.push({
        orderId: orderId,
        date: row[1] ? new Date(row[1]).toLocaleDateString('th-TH') : '',
        firstItemName: row[2] || '',
        totalAmount: row[8] || 0,
        paymentMethod: row[9] || '',
        campaign: row[17] || '',
        hasSlip: !!row[10],
        isCod: isCodPaymentLabel_(row[9]),
        codStatus: String(row[COD_STATUS_COL_ - 1] || ''),
        cancelled: String(row[2]) === CANCELLED_ORDER_MARK_
      });
    }

    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

var CANCELLED_ORDER_MARK_ = 'ยกเลิก';

var ACTIVE_COUPONS_CACHE_KEY_ = 'active_coupons_v1';

function getActiveCoupons() {
  try {
    // ⚡ เพิ่ม (26/8/69) — ผลลัพธ์นี้เหมือนกันสำหรับทุกคน (ไม่ขึ้นกับผู้ใช้) แต่ถูกเรียกทุกครั้งที่มีคนเปิด
    // หน้าสั่งซื้อ — เพิ่ม cache 60 วิ กันอ่านทั้งชีตซ้ำๆ ทุกครั้งโดยไม่จำเป็น ล้าง cache ทันทีตอนแอดมินสร้าง/
    // แก้ไข/เปิดปิดโค้ดใหม่ (ดู createGlobalCoupon/updateGlobalCoupon/toggleGlobalCoupon) จึงไม่มีปัญหาข้อมูล
    // เก่าค้างจนแอดมินสงสัยว่าทำไมโค้ดที่เพิ่งแก้ยังไม่มีผล
    var cached = CacheService.getScriptCache().get(ACTIVE_COUPONS_CACHE_KEY_);
    if (cached) return JSON.parse(cached);
    var sheet = ensureCouponsSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) { var emptyResult_ = { success: true, results: [] }; try { CacheService.getScriptCache().put(ACTIVE_COUPONS_CACHE_KEY_, JSON.stringify(emptyResult_), 60); } catch (e) {} return emptyResult_; }
    // ⚡ แก้ — ต้องอ่านให้ครบ 15 คอลัมน์ (เดิมอ่านแค่ 13 คอลัมน์ ตกหล่นคอลัมน์ 14-15 ที่เพิ่มมาทีหลังสำหรับ
    // โค้ด bogo แบบ "ลด X%" ของแถม) ไม่งั้นหน้าร้าน (getShopBootstrap → activeAutoCoupons) จะไม่เห็นค่า
    // freeDiscountPercent เลย ทำให้การ์ดคูปองหน้าแรกขึ้นข้อความ "แถม 1" (ของฟรี 100%) ผิดๆ ทั้งที่โค้ดนั้น
    // ตั้งเป็น "ชิ้นที่ 2 ลด 50%" — ฝั่งคำนวณส่วนลดตอนชำระเงิน (findAutoCoupons_) ไม่กระทบ เพราะอ่านจาก
    // getCachedCouponsRawData_() ซึ่งอ่านครบ 15 คอลัมน์อยู่แล้ว
    var data = sheet.getRange(2, 1, lastRow - 1, 16).getValues();
    // ⚡ เพิ่ม (25/9/69) — โค้ดเฉพาะผู้รับ (จากยิงโปรตามกลุ่ม) ห้ามขึ้นในรายการคูปองหน้าร้าน คนอื่นจะเห็นโค้ด
    var audienceInfo_ = getCouponAudienceInfoByCode_();
    var now = new Date();
    var results = [];
    data.forEach(function (row) {
      if (audienceInfo_[String(row[0]).trim().toUpperCase()]) return;
      var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
      if (!active) return;
      var startDate = row[10];
      if (startDate && new Date(startDate) > now) return;
      var expiry = row[6];
      if (isExpired_(expiry, now)) return;
      var maxUses = parseInt(row[4]) || 0;
      var usedCount = parseInt(row[5]) || 0;
      if (maxUses > 0 && usedCount >= maxUses) return;
      results.push({
        code: row[0], type: row[1], value: row[2],
        minPurchase: row[3] || 0,
        expiry: expiry ? new Date(expiry).toLocaleDateString('th-TH') : '',
        autoApply: row[8] === true || String(row[8]).toUpperCase() === 'TRUE',
        restriction: row[9] || '', freeProduct: row[11] || '', freeQty: row[12] || '',
        tierRestriction: row[13] || '', freeDiscountPercent: row[14] === '' || row[14] === null ? '' : row[14],
        stubText: row[15] || ''
      });
    });
    var result = { success: true, results: results };
    try { CacheService.getScriptCache().put(ACTIVE_COUPONS_CACHE_KEY_, JSON.stringify(result), 60); } catch (e) {}
    return result;
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

var LEGACY_TIER_ALIASES_ = {
  'เอม silver': 'silver', 'silver': 'silver', 'fan': 'silver', 'members': 'start',
  'เอม gold': 'gold', 'gold': 'gold', 'love': 'gold',
  'เอม vip': 'platinum', 'เอม platinum': 'platinum', 'platinum': 'platinum', 'vip': 'platinum',
  'เอมสตาร์ท': 'start', 'เอม start': 'start', 'start': 'start'
};

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

function calcShippingCost_(totalWeightG) {
  var brackets = getShippingConfig_();
  if (!brackets.length) return 0;
  for (var i = 0; i < brackets.length; i++) {
    if (totalWeightG <= brackets[i].maxWeightG) return brackets[i].rate;
  }
  return brackets[brackets.length - 1].rate;
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

function getMemberRowByUid_(lineUid, numCols) {
  if (!lineUid) return null;
  numCols = numCols || 15;
  var sheet = ensureMembersSheet_();
  var cache = CacheService.getScriptCache();
  var cacheKey = 'mrow_' + String(lineUid).substring(0, 35);
  var cached = cache.get(cacheKey);
  if (cached) {
    var cachedRow = parseInt(cached, 10);
    if (cachedRow > 1) {
      try {
        var vals = sheet.getRange(cachedRow, 1, 1, numCols).getValues()[0];
        if (vals[0] === lineUid) return { rowIndex: cachedRow, values: vals };
      } catch (e) {}
    }
    try { cache.remove(cacheKey); } catch (e2) {}
  }
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  var uidCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < uidCol.length; i++) {
    if (uidCol[i][0] === lineUid) {
      var rowIndex = i + 2;
      try { cache.put(cacheKey, String(rowIndex), 600); } catch (e) {}
      return { rowIndex: rowIndex, values: sheet.getRange(rowIndex, 1, 1, numCols).getValues()[0] };
    }
  }
  return null;
}

function findMemberRowIndex_(lineUid) {
  var found = getMemberRowByUid_(lineUid, 1);
  return found ? found.rowIndex : -1;
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

function parseDateInputStr_(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function isExpired_(expiryValue, now) {
  if (!expiryValue) return false;
  var d = new Date(expiryValue);
  d.setHours(23, 59, 59, 999);
  return d < (now || new Date());
}

function computeEligibleInfo_(items, restrictionText) {
  var restriction = String(restrictionText || '').trim();
  if (!restriction) {
    var total = 0, totalQty = 0, minPrice = Infinity;
    items.forEach(function (it) {
      total += it.qty * it.price; totalQty += it.qty;
      if (it.qty > 0 && it.price < minPrice) minPrice = it.price;
    });
    return { subtotal: total, qty: totalQty, minPrice: totalQty > 0 ? minPrice : 0 };
  }
  var keywords = restriction.split(',').map(function (k) { return k.trim().toLowerCase(); }).filter(Boolean);
  var eligible = 0, eligibleQty = 0, minPrice = Infinity;
  items.forEach(function (it) {
    var name = String(it.name).toLowerCase();
    if (keywords.some(function (k) { return name.indexOf(k) !== -1; })) {
      eligible += it.qty * it.price; eligibleQty += it.qty;
      if (it.qty > 0 && it.price < minPrice) minPrice = it.price;
    }
  });
  // ⚡ แก้ — เพิ่ม minPrice (ราคาต่อชิ้นที่ถูกที่สุดในบรรดาสินค้าที่เข้าเงื่อนไข) ใช้เป็นฐานคิดส่วนลด bogo
  // (ดู calcPromoDiscount_) แทนราคาเฉลี่ยแบบเดิม ตามที่ตกลงกับแอดมิน — ฟิลด์นี้ไม่กระทบ caller อื่นที่ใช้แค่
  // subtotal/qty เหมือนเดิม
  return { subtotal: eligible, qty: eligibleQty, minPrice: eligibleQty > 0 ? minPrice : 0 };
}

function calcDiscountAmount_(type, value, eligibleInfo, hasRestriction) {
  if (type === 'percent') return eligibleInfo.subtotal * value / 100;
  if (hasRestriction) return Math.min(value * eligibleInfo.qty, eligibleInfo.subtotal);
  return Math.min(value, eligibleInfo.subtotal);
}

function calcPromoDiscount_(promo, items, priceMap, shippingCost) {
  var type = String(promo.type || '');
  var value = parseFloat(promo.value) || 0;
  var restriction = promo.restriction || '';
  var result = { productDiscount: 0, shippingDiscount: 0, freeQtyGranted: 0, physicalFreeQty: 0, freeProductName: '' };

  if (type === 'ship_percent') {
    result.shippingDiscount = Math.max(0, (shippingCost || 0) * value / 100);
    return result;
  }
  if (type === 'ship_fixed') {
    result.shippingDiscount = Math.min(shippingCost || 0, Math.max(0, value));
    return result;
  }
  if (type === 'bogo') {
    var eligibleInfoBogo = computeEligibleInfo_(items, restriction);
    var requiredQty = value > 0 ? value : 1;
    var freeQtyPerBundle = parseFloat(promo.freeQty) || 0;
    var blockSize = requiredQty + freeQtyPerBundle;
    var freeProductName = String(promo.freeProduct || '').trim();
    // ⚡ เพิ่ม — ส่วนลดของแถมเป็น % (ไม่ระบุ = 100% คือแถมฟรีเหมือนเดิม) รองรับโปร "ซื้อครบ N ชิ้นถัดไปลด X%"
    var freeDiscountPercent = (promo.freeDiscountPercent === '' || promo.freeDiscountPercent === null || promo.freeDiscountPercent === undefined)
      ? 100 : parseFloat(promo.freeDiscountPercent);
    if (isNaN(freeDiscountPercent)) freeDiscountPercent = 100;
    freeDiscountPercent = Math.max(0, Math.min(100, freeDiscountPercent));

    var fullBundles = blockSize > 0 ? Math.floor(eligibleInfoBogo.qty / blockSize) : 0;
    var cashFreeQty = fullBundles * freeQtyPerBundle;
    var remainderQty = eligibleInfoBogo.qty - fullBundles * blockSize;
    // "ของแถมที่ต้องหยิบให้ลูกค้า" มีความหมายเฉพาะตอนแถมฟรี 100% เท่านั้น — ถ้าเป็นแค่ส่วนลด %
    // ลูกค้าจ่ายเงินซื้อชิ้นนั้นเองอยู่แล้ว ไม่มีของที่ต้องหยิบเพิ่ม
    var physicalFreeQty = (freeDiscountPercent >= 100 && remainderQty >= requiredQty) ? freeQtyPerBundle : 0;

    // ⚡ แก้ — เดิมคิดจาก "ราคาเฉลี่ย" ของสินค้าที่เข้าเงื่อนไขทั้งหมด เปลี่ยนเป็นคิดจาก "ราคาที่ถูกที่สุด"
    // ในบรรดาสินค้าที่เข้าเงื่อนไขที่ลูกค้าเลือกมาแทน ตามที่ตกลงกับแอดมิน (ราคาต่อหน่วยของแถม/ที่ลด จะอิง
    // สินค้าที่ถูกที่สุดเสมอ ไม่ว่าจะหยิบชิ้นไหนจริงๆ ก็ตาม)
    var cheapestUnitPrice = eligibleInfoBogo.minPrice || 0;
    var bogoDiscount = Math.min(eligibleInfoBogo.subtotal, cashFreeQty * cheapestUnitPrice * freeDiscountPercent / 100);

    result.productDiscount = bogoDiscount;
    result.freeQtyGranted = cashFreeQty;
    result.physicalFreeQty = physicalFreeQty;
    result.freeProductName = freeProductName;
    result.freeDiscountPercent = freeDiscountPercent;
    return result;
  }

  var eligibleInfo = computeEligibleInfo_(items, restriction);
  result.productDiscount = calcDiscountAmount_(type, value, eligibleInfo, !!restriction);
  return result;
}

var COUPONS_RAW_CACHE_KEY_ = 'coupons_raw_v2';

function getCouponsRawBundle_() {
  try {
    var cached = CacheService.getScriptCache().get(COUPONS_RAW_CACHE_KEY_);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  var sheet = ensureCouponsSheet_();
  var lastRow = sheet.getLastRow();
  var width = Math.max(sheet.getLastColumn(), 16);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var bundle = {
    rows: lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [],
    a: header.indexOf(COUPON_AUDIENCE_HEADER_),
    u: header.indexOf(COUPON_USED_BY_HEADER_)
  };
  try {
    CacheService.getScriptCache().put(COUPONS_RAW_CACHE_KEY_, JSON.stringify(bundle), 15);
  } catch (e) {
    // ชีตใหญ่เกิน 100KB ต่อ cache key ก็แค่ข้าม cache ไปเฉยๆ ไม่กระทบความถูกต้องของข้อมูลเลย
  }
  return bundle;
}

var COUPON_AUDIENCE_HEADER_ = 'เฉพาะผู้รับ(LINE UID คั่นด้วยจุลภาค — ระบบใส่ให้ตอนยิงโปร เว้นว่าง=ทุกคน)';

var COUPON_USED_BY_HEADER_ = 'ใช้แล้วโดย(LINE UID@เลขออเดอร์ — ระบบบันทึกเอง)';

function parseCouponUidList_(value) {
  return String(value || '').split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
}

function parseCouponUsedBy_(value) {
  return parseCouponUidList_(value).map(function (entry) {
    var at = entry.indexOf('@');
    return at === -1 ? { uid: entry, orderId: '' } : { uid: entry.substring(0, at), orderId: entry.substring(at + 1) };
  });
}

function getCouponAudienceInfoByCode_() {
  var bundle = getCouponsRawBundle_();
  var out = {};
  if (bundle.a < 0) return out;
  bundle.rows.forEach(function (row) {
    var n = parseCouponUidList_(row[bundle.a]).length;
    if (!n) return;
    out[String(row[0]).trim().toUpperCase()] = {
      audienceCount: n, usedCount: bundle.u >= 0 ? parseCouponUsedBy_(row[bundle.u]).length : 0
    };
  });
  return out;
}

function trimCouponShippingDiscounts_(privileges, coupons, shippingCost) {
  var remaining = Math.max(0, (Number(shippingCost) || 0) - (privileges || []).reduce(function (s, p) { return s + (p.shippingDiscount || 0); }, 0));
  return (coupons || []).map(function (c) {
    if (!c || !(c.shippingDiscount > 0)) return c;
    var take = Math.min(c.shippingDiscount, remaining);
    remaining -= take;
    if (take === c.shippingDiscount) return c;
    var copy = {};
    Object.keys(c).forEach(function (k) { copy[k] = c[k]; });
    copy.shippingDiscount = take;
    copy.discount = (copy.productDiscount || 0) + take;
    return copy;
  });
}

function isUsefulAutoCoupon_(c) {
  return !!c && ((c.discount || 0) > 0 || (c.physicalFreeQty || 0) > 0);
}

function withoutSameCoupon_(autoCoupons, manual) {
  return (autoCoupons || []).filter(function (c) { return String(c.rowIndex) !== String(manual.rowIndex); });
}

function findAutoCoupons_(subtotal, items, priceMap, shippingCost, memberTierKey) {
  try {
    var bundle_ = getCouponsRawBundle_();
    var data = bundle_.rows;
    if (!data.length) return [];
    var now = new Date();

    function isEligibleRow_(row) {
      var autoApply = row[8] === true || String(row[8]).toUpperCase() === 'TRUE';
      if (!autoApply) return false;
      if (bundle_.a >= 0 && parseCouponUidList_(row[bundle_.a]).length) return false; // โค้ดเฉพาะผู้รับ ต้องกรอกเอง
      var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
      if (!active) return false;
      var startDate = row[10];
      if (startDate && new Date(startDate) > now) return false;
      var expiry = row[6];
      if (isExpired_(expiry, now)) return false;
      // ⚡ เพิ่ม (25/8/69) — จำกัดเฉพาะระดับสมาชิก (คอลัมน์ 14) ถ้าตั้งไว้ ต้องตรงกับระดับปัจจุบันของลูกค้า
      var tierRestrictionText = String(row[13] || '').trim();
      if (tierRestrictionText) {
        var allowedTierKeys = tierRestrictionText.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        if (allowedTierKeys.indexOf(String(memberTierKey || '')) === -1) return false;
      }
      var minPurchase = parseFloat(row[3]) || 0;
      if (subtotal < minPurchase) return false;
      var maxUses = parseInt(row[4]) || 0;
      var usedCount = parseInt(row[5]) || 0;
      if (maxUses > 0 && usedCount >= maxUses) return false;
      return true;
    }

    var shippingMetas = [], specificMetas = [], generalMetas = [];
    data.forEach(function (row, idx) {
      if (!isEligibleRow_(row)) return;
      var type = String(row[1]);
      var restriction = String(row[9] || '').trim();
      var meta = { row: row, idx: idx, type: type, restriction: restriction };
      if (type === 'ship_percent' || type === 'ship_fixed') shippingMetas.push(meta);
      else if (restriction) specificMetas.push(meta);
      else generalMetas.push(meta);
    });

    function calcEntry_(meta, itemsForCalc) {
      var row = meta.row;
      if ((meta.type === 'percent' || meta.type === 'fixed') && meta.restriction) {
        var eligibleCheck = itemsForCalc ? computeEligibleInfo_(itemsForCalc, meta.restriction) : { subtotal: 0, qty: 0 };
        if (eligibleCheck.subtotal <= 0) return null;
      }
      var promo = { type: meta.type, value: row[2], restriction: meta.restriction, freeProduct: row[11], freeQty: row[12], freeDiscountPercent: row[14] };
      var calc = calcPromoDiscount_(promo, itemsForCalc || [], priceMap || {}, shippingCost || 0);
      var totalDiscount = calc.productDiscount + calc.shippingDiscount;
      if (totalDiscount <= 0 && !(calc.physicalFreeQty > 0)) return null;
      return {
        rowIndex: meta.idx + 2, code: row[0], type: meta.type, value: parseFloat(row[2]) || 0,
        productDiscount: calc.productDiscount, shippingDiscount: calc.shippingDiscount,
        discount: totalDiscount, restriction: meta.restriction,
        freeProduct: row[11] || '', freeQty: row[12] || '', freeQtyGranted: calc.freeQtyGranted,
        physicalFreeQty: calc.physicalFreeQty || 0, freeDiscountPercent: calc.freeDiscountPercent || 100
      };
    }

    var bestShipping = null;
    shippingMetas.forEach(function (meta) {
      var entry = calcEntry_(meta, items);
      if (!entry) return;
      if (!bestShipping || entry.shippingDiscount > bestShipping.shippingDiscount) bestShipping = entry;
    });

    var bestSpecific = null;
    specificMetas.forEach(function (meta) {
      var entry = calcEntry_(meta, items);
      if (!entry) return;
      if (!bestSpecific || entry.productDiscount > bestSpecific.productDiscount) bestSpecific = entry;
    });

    var itemsForGeneral = items;
    if (bestSpecific && bestSpecific.restriction) {
      var keywords = bestSpecific.restriction.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      itemsForGeneral = (items || []).filter(function (it) {
        var nameLow = String(it.name).toLowerCase();
        return !keywords.some(function (kw) { return nameLow.indexOf(kw) !== -1; });
      });
    }
    var bestGeneral = null;
    generalMetas.forEach(function (meta) {
      var entry = calcEntry_(meta, itemsForGeneral);
      if (!entry) return;
      if (!bestGeneral || entry.productDiscount > bestGeneral.productDiscount) bestGeneral = entry;
    });

    var result = [];
    if (bestSpecific) result.push(bestSpecific);
    if (bestGeneral) result.push(bestGeneral);
    if (bestShipping) result.push(bestShipping);
    return result;
  } catch (e) {
    return [];
  }
}

function validateCoupon_(code, subtotal, items, priceMap, shippingCost, memberTierKey, lineUid, opts) {
  if (!code) return null;
  try {
    var bundle_ = getCouponsRawBundle_();
    var data = bundle_.rows;
    if (!data.length) return { error: 'ไม่พบโค้ดนี้' };
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (String(row[0]).trim().toUpperCase() !== String(code).trim().toUpperCase()) continue;
      var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
      if (!active) return { error: 'โค้ดนี้ถูกปิดใช้งานแล้ว' };
      var startDate = row[10];
      if (startDate && new Date(startDate) > new Date()) return { error: 'โค้ดนี้ยังไม่เริ่มใช้งาน (เริ่ม ' + new Date(startDate).toLocaleDateString('th-TH') + ')' };
      var expiry = row[6];
      if (isExpired_(expiry)) return { error: 'โค้ดนี้หมดอายุแล้ว' };

      var audience_ = bundle_.a >= 0 ? parseCouponUidList_(row[bundle_.a]) : [];
      if (audience_.length) {
        var uid_ = String(lineUid || '');
        if (!uid_ || audience_.indexOf(uid_) === -1) return { error: 'โค้ดนี้เป็นสิทธิ์พิเศษเฉพาะลูกค้าที่ได้รับข้อความเท่านั้น' };
        var editingOrderId_ = String((opts && opts.orderId) || '');
        var usedElsewhere_ = (bundle_.u >= 0 ? parseCouponUsedBy_(row[bundle_.u]) : []).some(function (e) {
          return e.uid === uid_ && (!editingOrderId_ || e.orderId !== editingOrderId_);
        });
        if (usedElsewhere_) return { error: 'คุณใช้โค้ดนี้ไปแล้ว (ใช้ได้คนละ 1 ครั้ง)' };
      }

      // ⚡ เพิ่ม (25/8/69) — จำกัดเฉพาะระดับสมาชิก (คอลัมน์ 14) ถ้าตั้งไว้ ต้องตรงกับระดับปัจจุบันของลูกค้า
      var tierRestrictionText = String(row[13] || '').trim();
      if (tierRestrictionText) {
        var allowedTierKeys = tierRestrictionText.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        if (allowedTierKeys.indexOf(String(memberTierKey || '')) === -1) {
          var tierConfigForMsg = getTierConfig_();
          var allowedNames = allowedTierKeys.map(function (k) {
            var t = tierConfigForMsg.find(function (tc) { return tc.key === k; });
            return t ? t.name : k;
          }).join(', ');
          return { error: 'โค้ดนี้ใช้ได้เฉพาะสมาชิกระดับ ' + allowedNames + ' เท่านั้น' };
        }
      }

      var minPurchase = parseFloat(row[3]) || 0;
      if (subtotal < minPurchase) return { error: 'ยอดซื้อขั้นต่ำ ฿' + minPurchase.toLocaleString('th-TH') + ' จึงจะใช้โค้ดนี้ได้' };
      var maxUses = parseInt(row[4]) || 0;
      var usedCount = parseInt(row[5]) || 0;
      if (maxUses > 0 && usedCount >= maxUses) return { error: 'โค้ดนี้ถูกใช้ครบจำนวนแล้ว' };
      var type = String(row[1]);
      var restriction = row[9];
      if ((type === 'percent' || type === 'fixed') && restriction) {
        var eligibleInfo = items ? computeEligibleInfo_(items, restriction) : { subtotal: 0, qty: 0 };
        if (eligibleInfo.subtotal <= 0) {
          var restrictionValueText_ = type === 'percent' ? ('ลด ' + row[2] + '%') : ('ลด ' + row[2] + ' บาท');
          return { error: 'โค้ดนี้' + restrictionValueText_ + ' เฉพาะสินค้า: ' + restriction + ' (ไม่มีสินค้านี้ในตะกร้า)' };
        }
      }
      if (type === 'bogo') {
        var eligibleBogo = items ? computeEligibleInfo_(items, restriction) : { subtotal: 0, qty: 0 };
        var requiredQty = parseFloat(row[2]) || 1;
        if (eligibleBogo.qty < requiredQty) {
          return { error: 'โค้ดนี้ต้องซื้อ' + (restriction ? (restriction + ' ') : '') + 'ให้ครบ ' + requiredQty + ' ชิ้นก่อน (ตอนนี้มี ' + eligibleBogo.qty + ' ชิ้น)' };
        }
      }
      var promo = { type: type, value: row[2], restriction: restriction, freeProduct: row[11], freeQty: row[12], freeDiscountPercent: row[14] };
      var calc = calcPromoDiscount_(promo, items || [], priceMap || {}, shippingCost || 0);
      return {
        rowIndex: i + 2, code: row[0], type: type, value: parseFloat(row[2]) || 0,
        productDiscount: calc.productDiscount, shippingDiscount: calc.shippingDiscount,
        discount: calc.productDiscount + calc.shippingDiscount, restriction: restriction || '',
        freeProduct: row[11] || '', freeQty: row[12] || '', freeQtyGranted: calc.freeQtyGranted,
        physicalFreeQty: calc.physicalFreeQty || 0, freeDiscountPercent: calc.freeDiscountPercent || 100,
        audience: audience_.length > 0
      };
    }
    return { error: 'ไม่พบโค้ดนี้' };
  } catch (e) {
    return { error: e.toString() };
  }
}

var PRIVILEGE_BLOCKS_COUPONS_EVEN_IF_UNUSABLE_ = true;

function getUnusedMemberPrivileges_(lineUid) {
  try {
    var rows = getPrivilegeRowsForLineUid_(lineUid);
    if (!rows.length) return [];
    var now = new Date();
    var out = [];
    rows.forEach(function (entry) {
      var row = entry.values;
      var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
      if (!active) return;                                   // ใช้ไปแล้ว / ถูกปิด
      var startDate = row[9];
      if (startDate && new Date(startDate) > now) return;    // ยังไม่ถึงวันเริ่มใช้
      if (isExpired_(row[4], now)) return;                   // หมดอายุแล้ว
      out.push({ name: String(row[1] || ''), minPurchase: parseFloat(row[13]) || 0, restriction: String(row[10] || ''), stackable: isStackablePrivilegeRow_(row) });
    });
    return out;
  } catch (e) {
    return [];
  }
}

function hasUnusedMemberPrivilege_(lineUid) {
  // ⚡ แก้ (26/9/69) — สิทธิ์ที่แอดมินติ๊ก "ใช้ร่วมกับคูปองได้" ไม่ซ่อนคูปอง/โปรหน้าแรก (ตรงกับกติกาหน้าชำระเงิน)
  return getUnusedMemberPrivileges_(lineUid).some(function (p) { return !p.stackable; });
}

function bahtText_(n) {
  return '฿' + (Math.round(Number(n) || 0)).toLocaleString('th-TH');
}

function getPrivilegeLockState_(lineUid, appliedPrivileges, subtotal) {
  // ⚡ แก้ (26/9/69) — สิทธิ์ที่แอดมินติ๊ก "ใช้ร่วมกับคูปองได้" ไม่นับเป็นตัวล็อก (ทั้งสิทธิ์ที่ใช้กับตะกร้านี้และที่ถือค้าง)
  appliedPrivileges = (appliedPrivileges || []).filter(function (p) { return !p.stackable; });
  if (appliedPrivileges && appliedPrivileges.length) {
    return {
      locked: true, pending: false,
      note: 'ออเดอร์นี้ใช้สิทธิพิเศษสมาชิก จึงใช้ร่วมกับคูปองและโปรโมชั่นอื่นไม่ได้ — คูปองที่มีอยู่ยังไม่ถูกใช้ จะกลับมาใช้ได้หลังใช้สิทธิพิเศษหมดแล้ว'
    };
  }
  if (!PRIVILEGE_BLOCKS_COUPONS_EVEN_IF_UNUSABLE_) return { locked: false, pending: false, note: '' };

  var pendingList = getUnusedMemberPrivileges_(lineUid).filter(function (p) { return !p.stackable; });
  if (!pendingList.length) return { locked: false, pending: false, note: '' };

  // เลือกใบที่ "ใกล้ใช้ได้ที่สุด" (ยอดขั้นต่ำน้อยสุด) มาอธิบายให้ลูกค้าฟัง
  var nearest = pendingList[0];
  pendingList.forEach(function (p) { if (p.minPurchase < nearest.minPurchase) nearest = p; });

  var msg = 'คุณมีสิทธิพิเศษ "' + nearest.name + '" อยู่ ';
  if (nearest.minPurchase > 0) {
    msg += 'ใช้ได้เมื่อยอดซื้อครบ ' + bahtText_(nearest.minPurchase) + ' (ตอนนี้ ' + bahtText_(subtotal) + ') ';
  } else {
    msg += 'แต่ยังใช้กับรายการในตะกร้านี้ไม่ได้ ';
  }
  msg += '— ระหว่างที่ยังมีสิทธิพิเศษค้างอยู่จะใช้คูปองร่วมไม่ได้ หากต้องการใช้สิทธิ์นี้ กรุณาติดต่อแอดมินค่ะ';

  return { locked: true, pending: true, note: msg, pendingName: nearest.name, pendingMinPurchase: nearest.minPurchase };
}

function privilegeLockCouponError_(lockState, couponCode) {
  if (lockState && lockState.pending) return lockState.note;
  return 'ออเดอร์นี้ใช้สิทธิพิเศษสมาชิกอยู่ จึงใช้ร่วมกับโค้ดส่วนลดไม่ได้ค่ะ'
    + (couponCode ? (' (โค้ด ' + couponCode + ' ยังไม่ถูกใช้ เก็บไว้ใช้หลังใช้สิทธิพิเศษหมดแล้วได้เลย)') : '');
}

function checkShopDiscounts(idToken, couponCode, subtotal, itemsJson, excludePrivilegeName, pointsToRedeem, existingOrderId) {
  try {
    var profile = verifyLineIdToken_(idToken);
    if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ') | ' + tokenDiag_(idToken) };
    subtotal = parseFloat(subtotal) || 0;
    var excludeRowIndexes = String(excludePrivilegeName || '').split('|').filter(Boolean);

    // ⚡ แก้ (perf) — อ่านแถวสมาชิกจากชีต Members ครั้งเดียว (คอลัมน์ 1-12 ครอบคลุมทุกค่าที่ใช้ในฟังก์ชันนี้:
    // เบอร์โทร col4/index3, แต้มคงเหลือ col6/index5, ระดับสมาชิก col7/index6, ยอดซื้อสะสม col12/index11)
    // เดิมโค้ดด้านล่างเรียก findMemberRowIndex_ ซ้ำ 2 ครั้ง + getRange().getValues()/getValue() แยกอีก
    // 3 ครั้งสำหรับข้อมูลแถวเดียวกัน รวมเป็น 5 รอบเรียก Google Sheets API ต่อ 1 คำขอ ตอนนี้เหลือรอบเดียว
    var memberFound_ = getMemberRowByUid_(profile.sub, 12);
    var memberRowIndex_ = memberFound_ ? memberFound_.rowIndex : -1;
    var memberRow_ = memberFound_ ? memberFound_.values : null;
    var memberTierKey_ = memberRow_ ? resolveTierByStoredValue_(memberRow_[6], memberRow_[11] || 0, profile.sub).key : '';

    var rawItems = [];
    try { rawItems = JSON.parse(itemsJson || '[]'); } catch (e) {}
    var priceMap = {}, weightMap = {};
    var productsResult = getShopProducts();
    if (productsResult.success) {
      productsResult.categories.forEach(function (cat) {
        cat.variants.forEach(function (v) { priceMap[v.skuName] = v.price; weightMap[v.skuName] = v.weightG || 0; });
      });
    }
    var items = rawItems.map(function (it) {
      return { name: it.name, qty: parseFloat(it.qty) || 0, price: priceMap.hasOwnProperty(it.name) ? priceMap[it.name] : 0 };
    });

    var totalWeightG = 0;
    rawItems.forEach(function (it) {
      totalWeightG += (parseFloat(it.qty) || 0) * (weightMap.hasOwnProperty(it.name) ? weightMap[it.name] : 0);
    });
    var shippingCost = calcShippingCost_(totalWeightG);

    // ⚡ แก้ (perf) — คำนวณสิทธิพิเศษทั้งหมดครั้งเดียวแล้วกรอง exclude เอง (logic เดียวกับใน
    // getAppliedPrivileges_ ทุกประการ) แทนที่จะเรียกทั้ง getAppliedPrivileges_ และ
    // getAllPrivilegesWithDiscount_ แยกกัน ซึ่งเดิมคำนวณส่วนลดของสิทธิพิเศษชุดเดียวกันซ้ำสองรอบ
    var excludeSet_ = {};
    excludeRowIndexes.forEach(function (n) { if (n !== '' && n !== null && n !== undefined) excludeSet_[String(n)] = true; });
    var allPrivileges = getAllPrivilegesWithDiscount_(profile.sub, subtotal, items, priceMap, shippingCost);
    var appliedPrivileges = allPrivileges.filter(function (p) { return !excludeSet_[String(p.rowIndex)]; });
    var coupon = null, couponError = null;
    if (couponCode) {
      var manual = validateCoupon_(couponCode, subtotal, items, priceMap, shippingCost, memberTierKey_, profile.sub, { orderId: existingOrderId });
      if (manual && manual.error) couponError = manual.error; else coupon = manual;
    }

    var rawAutoCoupons = findAutoCoupons_(subtotal, items, priceMap, shippingCost, memberTierKey_);
    // ⚡ แก้ (25/9/69) — โค้ดที่ลูกค้าพิมพ์เอง "ลดเพิ่ม" จากคูปองอัตโนมัติทุกใบ (เดิมตัดคูปองอัตโนมัติที่ลดค่าสินค้าออก
    // เหลือแค่ลดค่าส่ง) — ตัดเฉพาะกรณีพิมพ์โค้ดของคูปองอัตโนมัติใบเดียวกันซ้ำ กันลดซ้ำ 2 รอบ (ใช้ร่วมกับ createShopOrder)
    var autoCoupons = coupon ? withoutSameCoupon_(rawAutoCoupons, coupon) : rawAutoCoupons;

    // เพิ่ม — มีสิทธิพิเศษสมาชิกอยู่ = ตัดคูปองทุกใบออก (ทั้งโค้ดที่กรอกเอง คูปองอัตโนมัติ และคูปองลดค่าส่ง)
    // โค้ดที่ถูกปัดตกตรงนี้ไม่โดนนับ usedCount เพราะไม่ได้เข้าไปอยู่ใน couponResults ตอนสั่งซื้อจริง
    var privilegeLock_ = getPrivilegeLockState_(profile.sub, appliedPrivileges, subtotal);
    if (privilegeLock_.locked) {
      if (coupon) { couponError = privilegeLockCouponError_(privilegeLock_, coupon.code); coupon = null; }
      else if (couponCode && !couponError) { couponError = privilegeLockCouponError_(privilegeLock_, couponCode); }
      autoCoupons = [];
    }
    // ⚡ เพิ่ม (26/9/69) — ส่วนลดค่าส่งหลายก้อนรวมกันเกินค่าส่ง (เช่น สิทธิ์ส่งฟรี + คูปองลดค่าส่ง) ตัดยอดของคูปองให้
    // เหลือเท่าที่ลดได้จริง บรรทัดส่วนลดในหน้าชำระเงิน/บิล/รายงานจะได้บวกกันตรงกับยอดจริง
    var trimmedShip_ = trimCouponShippingDiscounts_(appliedPrivileges, coupon ? [coupon].concat(autoCoupons) : autoCoupons, shippingCost);
    if (coupon) { coupon = trimmedShip_[0]; autoCoupons = trimmedShip_.slice(1); } else { autoCoupons = trimmedShip_; }
    autoCoupons = autoCoupons.filter(isUsefulAutoCoupon_);

    var privilegeDiscount = appliedPrivileges.reduce(function (sum, p) { return sum + p.discount; }, 0);
    var privilegeShippingDiscount = appliedPrivileges.reduce(function (sum, p) { return sum + (p.shippingDiscount || 0); }, 0);

    var couponShippingDiscount = (coupon ? (coupon.shippingDiscount || 0) : 0) + autoCoupons.reduce(function (sum, c) { return sum + (c.shippingDiscount || 0); }, 0);
    var totalShippingDiscount = Math.min(shippingCost, privilegeShippingDiscount + (couponShippingDiscount || 0));
    var finalShippingCost = Math.max(0, shippingCost - totalShippingDiscount);

    var repeatPromo = null;
    // เช็คก่อนว่ามีโปรซื้อซ้ำที่เข้าเงื่อนไขหรือไม่ แล้วค่อยอ่านประวัติ Revenue ทั้งชีต
    // ถ้าไม่มีโปรนี้ จะไม่ต้องสแกนออเดอร์เก่าเลย ทำให้เข้าหน้าชำระเงินเร็วขึ้นมาก
    var repeatConfigPreview_ = getActiveRepeatBonusConfig_(items, subtotal);
    if (repeatConfigPreview_ && memberRow_) {
      var phoneForPromo_ = String(memberRow_[3] || '');
      if (phoneForPromo_ && countPriorOrdersThisMonth_(phoneForPromo_, '') > 0) {
        var repeatDiscountPreview_ = 0;
        // แก้ — ถ้าล็อกด้วยสิทธิพิเศษ ตัดเฉพาะ "ส่วนลด" ของโปรซื้อซ้ำออก
        // ส่วน bonusPoints/multiplier ยังส่งกลับไปเหมือนเดิม (กติกายกเว้น "การให้คะแนนพิเศษ" ไว้)
        if (!privilegeLock_.locked && repeatConfigPreview_.discountValue > 0) {
          repeatDiscountPreview_ = repeatConfigPreview_.discountType === 'percent'
            ? subtotal * repeatConfigPreview_.discountValue / 100
            : Math.min(subtotal, repeatConfigPreview_.discountValue);
        }
        repeatPromo = { name: repeatConfigPreview_.name, discount: repeatDiscountPreview_, bonusPoints: repeatConfigPreview_.bonusPoints || 0, multiplier: repeatConfigPreview_.multiplier || 1 };
      }
    }

    // ⚡ เพิ่ม (19/8/69) — แลกคะแนนเป็นส่วนลดเงินสด: คำนวณ "ยอดที่ยังต้องจ่าย" หลังหักสิทธิ์/คูปอง/โปรซื้อซ้ำ
    // ไปแล้วทั้งหมด (ก่อนหักคะแนน) ไว้เป็นเพดานสูงสุดที่คะแนนจะลดได้ (กันลดจนติดลบ) แล้วเรียก
    // calcPointsRedeemDiscount_ จุดเดียวกับที่ createShopOrder ใช้ กันตรรกะเพี้ยนไปคนละแบบระหว่างตอน
    // "ดูตัวอย่าง" กับตอน "สั่งซื้อจริง"
    var privilegeProductDiscount_ = appliedPrivileges.reduce(function (sum, p) { return sum + (p.productDiscount || 0); }, 0);
    var couponProductDiscount_ = (coupon ? (coupon.productDiscount || 0) : 0) + autoCoupons.reduce(function (sum, c) { return sum + (c.productDiscount || 0); }, 0);
    var repeatDiscountForPoints_ = repeatPromo ? (repeatPromo.discount || 0) : 0;
    var totalProductDiscount_ = Math.min(subtotal, privilegeProductDiscount_ + couponProductDiscount_ + repeatDiscountForPoints_);
    var payableBeforePoints_ = Math.max(0, subtotal - totalProductDiscount_) + finalShippingCost;

    var memberPointsBalance_ = 0;
    if (memberRow_) {
      var reservedPoints_ = getPendingPointsReservedForPhone_(memberRow_[3], '', true);
      memberPointsBalance_ = Math.max(0, (memberRow_[5] || 0) - reservedPoints_);
    }
    var pointsRedeemResult_ = calcPointsRedeemDiscount_(pointsToRedeem, memberPointsBalance_, payableBeforePoints_);

    return { success: true, privileges: appliedPrivileges, privilegeDiscount: privilegeDiscount, allPrivileges: allPrivileges, privilegeLockNote: privilegeLock_.note, privilegeLocked: privilegeLock_.locked, coupon: coupon, autoCoupons: autoCoupons, couponError: couponError, shippingCost: shippingCost, shippingDiscount: totalShippingDiscount, finalShippingCost: finalShippingCost, totalWeightG: totalWeightG, repeatPromo: repeatPromo,
      memberPoints: memberPointsBalance_, pointsRedeemConfig: getPointsRedeemConfig_(), pointsRedeemDiscount: pointsRedeemResult_.discount, pointsUsed: pointsRedeemResult_.pointsUsed, pointsRedeemError: pointsRedeemResult_.error };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function recalcOrderDiscounts_(lineUid, billInfo, remark, excludeOrderId) {
  var items = billInfo.items;
  var subtotal = billInfo.subtotal;

  var productsResult = getShopProducts();
  var priceMap = {}, weightMap = {};
  if (productsResult.success) {
    productsResult.categories.forEach(function (cat) {
      cat.variants.forEach(function (v) { priceMap[v.skuName] = v.price; weightMap[v.skuName] = v.weightG || 0; });
    });
  }
  var totalWeightG = items.reduce(function (s, it) { return s + it.qty * (weightMap[it.name] || 0); }, 0);
  var shippingCost = calcShippingCost_(totalWeightG);

  var memberRowIndex = findMemberRowIndex_(lineUid);
  var memberTierKey_ = '';
  if (memberRowIndex !== -1) {
    var mRow = ensureMembersSheet_().getRange(memberRowIndex, 1, 1, 12).getValues()[0];
    memberTierKey_ = resolveTierByStoredValue_(mRow[6], mRow[11] || 0, lineUid).key;
  }

  var appliedPrivileges = getAppliedPrivileges_(lineUid, subtotal, [], items, priceMap, shippingCost);

  var usedCouponCodes = [];
  var couponRegex = /คูปอง:\s*([^\(]+?)\s*\(-\d/g;
  var m;
  while ((m = couponRegex.exec(remark || '')) !== null) usedCouponCodes.push(m[1].trim());

  var couponResults = [];
  usedCouponCodes.forEach(function (code) {
    var r = validateCoupon_(code, subtotal, items, priceMap, shippingCost, memberTierKey_, lineUid, { orderId: excludeOrderId });
    if (r && !r.error) couponResults.push(r);
  });
  if (!couponResults.length) {
    couponResults = findAutoCoupons_(subtotal, items, priceMap, shippingCost, memberTierKey_);
  }

  // เพิ่ม — กติกาเดียวกับ 2 จุดข้างบน: มีสิทธิพิเศษอยู่ = ตัดคูปองทุกใบ + ตัดส่วนลดโปรซื้อซ้ำ
  var privilegeLock_ = getPrivilegeLockState_(lineUid, appliedPrivileges, subtotal);
  if (privilegeLock_.locked) couponResults = [];
  couponResults = trimCouponShippingDiscounts_(appliedPrivileges, couponResults, shippingCost);

  var privilegeProductDiscount = appliedPrivileges.reduce(function (s, p) { return s + (p.productDiscount || 0); }, 0);
  var privilegeShippingDiscount = appliedPrivileges.reduce(function (s, p) { return s + (p.shippingDiscount || 0); }, 0);
  var couponProductDiscount = couponResults.reduce(function (s, c) { return s + (c.productDiscount || 0); }, 0);
  var couponShippingDiscount = couponResults.reduce(function (s, c) { return s + (c.shippingDiscount || 0); }, 0);

  var repeatCandidate_ = getActiveRepeatBonusConfig_(items, subtotal, new Date());
  var priorOrdersThisMonth_ = repeatCandidate_ ? countPriorOrdersThisMonth_(billInfo.phone, excludeOrderId) : 0;
  var repeatConfig_ = priorOrdersThisMonth_ > 0 ? repeatCandidate_ : null;
  var repeatBonusDiscount_ = 0;
  if (!privilegeLock_.locked && repeatConfig_ && repeatConfig_.discountValue > 0) {
    repeatBonusDiscount_ = repeatConfig_.discountType === 'percent'
      ? subtotal * repeatConfig_.discountValue / 100
      : Math.min(subtotal, repeatConfig_.discountValue);
  }

  var totalDiscount = Math.min(subtotal, privilegeProductDiscount + couponProductDiscount + repeatBonusDiscount_);
  var totalShippingDiscount = Math.min(shippingCost, privilegeShippingDiscount + couponShippingDiscount);
  var finalShippingCost = Math.max(0, shippingCost - totalShippingDiscount);
  var finalAmount = subtotal - totalDiscount + finalShippingCost;

  // คะแนนที่แลกไว้แล้ว (ถ้ามี) ยังกันไว้เหมือนเดิม ไม่คำนวณใหม่ — หักออกจากยอดใหม่เหมือนที่หักไว้ตอนแรก
  var pendingPoints_ = parsePendingPointsReservation_(remark);
  if (pendingPoints_.points > 0) finalAmount = Math.max(0, finalAmount - pendingPoints_.discount);
  finalAmount = Math.floor(finalAmount);

  return {
    appliedPrivileges: appliedPrivileges, couponResults: couponResults,
    repeatConfig: repeatConfig_, repeatBonusDiscount: repeatBonusDiscount_,
    totalDiscount: totalDiscount, shippingCost: shippingCost, finalShippingCost: finalShippingCost,
    finalAmount: finalAmount, pendingPoints: pendingPoints_, totalWeightG: totalWeightG, subtotal: subtotal
  };
}

function checkPendingOrderPromoStillValid(idToken, orderId) {
  try {
    var profile = verifyLineIdToken_(idToken);
    if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ')' };

    var sheet = SpreadsheetApp.openById(REVENUE_SHEET_ID_SHOP).getSheetByName(REVENUE_SHEET_NAME_SHOP);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, error: 'ไม่พบออเดอร์นี้ในระบบ' };

    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var targetRow = -1;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(orderId)) { targetRow = i + 2; break; }
    }
    if (targetRow === -1) return { success: false, error: 'ไม่พบเลขที่ออเดอร์นี้ในระบบ' };

    if (String(sheet.getRange(targetRow, 3).getValue()) === CANCELLED_ORDER_MARK_) {
      return { success: false, error: 'คำสั่งซื้อนี้ถูกยกเลิกไปแล้ว' };
    }
    var billInfo = getBillDataForNotify_(sheet, targetRow);
    if (billInfo.slipImageUrl) return { success: true, changed: false }; // แนบสลิปไปแล้ว ไม่ต้องเช็คซ้ำ
    if (billInfo.lineUid && billInfo.lineUid !== profile.sub) {
      return { success: false, error: 'ไม่มีสิทธิ์เข้าถึงออเดอร์นี้' };
    }

    var remark = String(sheet.getRange(targetRow, 20).getValue() || '');
    var recalc = recalcOrderDiscounts_(profile.sub, billInfo, remark, orderId);

    if (Math.abs(recalc.finalAmount - billInfo.billTotal) < 1) {
      return { success: true, changed: false };
    }
    return {
      success: true, changed: true, orderId: orderId,
      oldAmount: billInfo.billTotal, newAmount: recalc.finalAmount
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

var DISCOUNT_NOTE_LABEL_RE_ = /^(สิทธิ์|คูปอง|ซื้อซ้ำเดือนนี้|คูณแต้ม|แลกคะแนน):/;

var DISCOUNT_NOTE_SPLIT_RE_ = /,\s*(?=(?:สิทธิ์|คูปอง|ซื้อซ้ำเดือนนี้|คูณแต้ม|แลกคะแนน):)/;

function parseDiscountNotesFromRemark_(remark) {
  var notes = [];
  String(remark || '').split('|').forEach(function (chunk) {
    chunk = chunk.trim();
    if (!DISCOUNT_NOTE_LABEL_RE_.test(chunk)) return;
    chunk.split(DISCOUNT_NOTE_SPLIT_RE_).forEach(function (part) {
      part = String(part).trim();
      if (part) notes.push(part);
    });
  });
  return notes;
}

function parseFreebieItemsFromRemark_(remark) {
  var m = String(remark || '').match(/🎁 แถม \(ลดราคาแล้ว\):\s*([^|]+)/);
  if (!m) return [];
  return m[1].trim().split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function parsePhysicalFreebieItemsFromRemark_(remark) {
  var m = String(remark || '').match(/📦 ต้องหยิบของแถมเพิ่ม:\s*([^|]+)/);
  if (!m) return [];
  return m[1].trim().split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function getBillDataForNotify_(sheet, targetRow) {
  var lastRow = sheet.getLastRow();
  var mainRow = sheet.getRange(targetRow, 1, 1, 32).getValues()[0];
  var items = [];
  if (mainRow[2]) items.push({ name: String(mainRow[2]), qty: parseFloat(mainRow[3]) || 0, price: parseFloat(mainRow[4]) || 0 });
  var discountTotal = parseFloat(mainRow[5]) || 0;

  for (var i = targetRow + 1; i <= lastRow; i++) {
    var nextId = sheet.getRange(i, 1).getValue();
    if (nextId !== '' && nextId !== null && nextId !== undefined) break;
    var row = sheet.getRange(i, 3, 1, 4).getValues()[0];
    if (row[0]) items.push({ name: String(row[0]), qty: parseFloat(row[1]) || 0, price: parseFloat(row[2]) || 0 });
    discountTotal += parseFloat(row[3]) || 0;
  }

  var subtotal = items.reduce(function (s, it) { return s + it.qty * it.price; }, 0);
  return {
    items: items,
    customerName: String(mainRow[13] || ''),
    phone: String(mainRow[14] || ''),
    paymentLabel: String(mainRow[9] || ''),
    shippingCost: parseFloat(mainRow[7]) || 0,
    billTotal: parseFloat(mainRow[8]) || 0,
    province: String(mainRow[23] || ''),
    address: String(mainRow[24] || ''),
    discountTotal: discountTotal,
    subtotal: subtotal,
    discountNotes: parseDiscountNotesFromRemark_(mainRow[19]),
    freebieItems: parseFreebieItemsFromRemark_(mainRow[19]),
    physicalFreebieItems: parsePhysicalFreebieItemsFromRemark_(mainRow[19]),
    purchaseReferrerCode: parsePurchaseReferrerCodeFromRemark_(mainRow[19]),
    slipImageUrl: String(mainRow[10] || ''),
    lineUid: String(mainRow[31] || '') // ⚡ คอลัมน์ AF: LINE UID ที่บันทึกไว้ตอนสั่งซื้อ (ย้ายมาจากคอลัมน์ Z เดิมเมื่อ 1/9/69 กันชนกับ Revenue Spunky Online — ออเดอร์เก่าก่อนแก้จะว่าง ให้ fallback ไปหาเบอร์โทรแทน)
  };
}

  return { getShopBootstrap, getPrivilegesPanelData, checkMemberStatus, getMyPrivileges, getPointsHistory, getActiveCoupons, getReferralPublicStatus, getMyShippingAddress, getMyOrderHistory, checkShopDiscounts, checkPendingOrderPromoStillValid, getTierConfig_, getSignupBonusPoints_, getSignupPrivilegeConfig_, getPointsRedeemConfig_, decodeItemsB64_ };
}
