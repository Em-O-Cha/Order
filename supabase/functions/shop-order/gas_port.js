// สร้างอัตโนมัติจาก Members.gs ด้วย tools/gas-port/extract.mjs (target shop-order) — ห้ามแก้ไฟล์นี้ตรงๆ
// ให้รันสคริปต์ใหม่แทน — 121 รายการ (80 ฟังก์ชัน)
/* eslint-disable */
export function createGas(env) {
  const { SpreadsheetApp, CacheService, PropertiesService, Utilities, Logger, LockService, Session, Date,
          verifyLineIdToken_, logErrorToSheet_, ensureDebugLogSheet_, logSlowAction_, logRegistrationQueueWait_, notifyBuyerOrderConfirmation_, notifyAdminNewOrder_, checkAndGrantReferralOnFirstPurchase_, checkAndGrantPurchaseReferral_, sendLineMessages_, DriveApp, scheduleSlipFinalize_ } = env;

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

var COD_PAYMENT_LABEL_ = 'เก็บเงินปลายทาง';

var COD_SLIP_PLACEHOLDER_ = 'เก็บเงินปลายทาง (ไม่มีสลิป)';

var COD_STATUS_PENDING_ = 'รอเก็บเงิน';

var COD_STATUS_COL_ = 33;

var COD_PAID_DATE_COL_ = 34;

var REVENUE_TOTAL_COLS_ = 34;

var COD_REMARK_PENDING_ = 'รอเก็บเงินปลายทาง - LINE Shop';

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

function calcCodFee_(amountBeforeFee, cfg) {
  cfg = cfg || getCodConfig_();
  if (!cfg.fee) return 0;
  if (cfg.feeType === 'percent') return Math.round((parseFloat(amountBeforeFee) || 0) * cfg.fee / 100);
  return Math.round(cfg.fee);
}

function evaluateCodEligibility_(lineUid, memberTierKey, amountBeforeFee, cfg) {
  cfg = cfg || getCodConfig_();
  if (!cfg.enabled) return { allowed: false, reason: 'ขณะนี้ร้านปิดรับชำระแบบเก็บเงินปลายทาง' };
  var block = getMemberCodBlock_(lineUid);
  if (block.blocked) return { allowed: false, blocked: true, reason: 'บัญชีของคุณถูกระงับการชำระแบบเก็บเงินปลายทาง กรุณาติดต่อทีมงาน' };
  if (cfg.allowedTierKeys.length && memberTierKey && cfg.allowedTierKeys.indexOf(String(memberTierKey)) === -1) {
    return { allowed: false, reason: 'ระดับสมาชิกของคุณยังใช้ชำระแบบเก็บเงินปลายทางไม่ได้' };
  }
  var amount = parseFloat(amountBeforeFee) || 0;
  if (cfg.minAmount && amount < cfg.minAmount) {
    return { allowed: false, reason: 'ยอดสั่งซื้อขั้นต่ำสำหรับเก็บเงินปลายทางคือ ' + Math.round(cfg.minAmount).toLocaleString('th-TH') + ' บาท' };
  }
  if (cfg.maxAmount && amount > cfg.maxAmount) {
    return { allowed: false, reason: 'ยอดสั่งซื้อเกินเพดานเก็บเงินปลายทาง (รับสูงสุด ' + Math.round(cfg.maxAmount).toLocaleString('th-TH') + ' บาท)' };
  }
  return { allowed: true, reason: '' };
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

var REVENUE_SHEET_ID_SHOP   = '1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY';

var REVENUE_SHEET_NAME_SHOP = 'Revenue';

var MASTER_SHEET_ID_SHOP    = '1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w';

var SLIP_FOLDER_ID_SHOP     = '1aQQYvzFyZ79GDFQO352RdBPzdnCb0MnH';

var BAHT_PER_POINT = 30;

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

function generateShopRevenueId_(sheet) {
  var today = new Date();
  var buddhist = today.getFullYear() + 543;
  var yy = String(buddhist).slice(-2);
  var mm = String(today.getMonth() + 1); if (mm.length < 2) mm = '0' + mm;
  var prefix = 'REV' + yy + mm;
  // สำคัญ: ต้องอิงจากข้อมูลจริงในชีต Revenue ทุกครั้ง ห้ามใช้ cache เพียงอย่างเดียว
  // เพราะออเดอร์ไม่ได้เข้ามาทางช่องทางนี้ทางเดียว ยังมีระบบอื่น (เช่น Revenue Spunky Online)
  // ที่เขียนแถวใหม่ลงชีตเดียวกันนี้ด้วย ถ้าเชื่อ cache ของสคริปต์นี้ฝ่ายเดียว เลขที่จะเพี้ยน/ชนกับ
  // เลขที่ที่ถูกใช้ไปแล้วจากอีกช่องทางได้ จึงต้องอิงข้อมูลจริงในชีตเสมอ (อยู่ภายใต้ ScriptLock
  // ของ createShopOrder อยู่แล้ว จึงไม่ชนกันเองภายในระบบนี้)
  // ⚡ แก้ (ตามที่ขอ) — ทางด่วนก่อนเสมอ: เช็คแค่ "แถวสุดท้ายของชีต" ถ้าตรงกับเดือนนี้พอดี เอาเลขนั้น+1 ได้เลย
  // เร็วที่สุด — เคสส่วนใหญ่เกือบทั้งหมดเข้าทางนี้ เพราะข้อมูลต่อท้ายล่างสุดเสมอ แถวสุดท้ายจึงมีเลขสูงสุดของทุก
  // เดือนที่ผ่านมาอยู่แล้วโดยปกติ
  // ⚡ แก้เพิ่ม — แต่ถ้าออเดอร์ล่าสุดมีหลายรายการ (หลายแถว) เลขที่ออเดอร์จะอยู่แค่แถวแรกของออเดอร์นั้นเท่านั้น
  // แถวถัด ๆ ไปของรายการอื่นในออเดอร์เดียวกันจะว่างคอลัมน์ A (รูปแบบเดียวกับที่ deleteExistingOrderRows_/
  // getBillDataForNotify_ ใช้อยู่แล้ว) ถ้าแถวสุดท้ายดันว่างแบบนี้แล้วเช็คแค่แถวเดียวจะพลาด จึงอ่านย้อนขึ้นไปเป็น
  // ก้อนเล็ก ๆ (PROBE แถว ในการอ่าน 1 ครั้ง — ออเดอร์นึงไม่เกิน 5 รายการ 10 แถวพอเหลือเฟือ) หาแถวที่ไม่ว่างล่าสุด
  // ก่อน แล้วค่อยเอามาเทียบเดือน — ถ้าตรงเดือนนี้เอาเลขนั้น+1 เลย ยังเร็วเหมือนเดิม (อ่านทีเดียวจบ ไม่ต้องวนหลายรอบ)
  // ถ้าในช่วง PROBE แถวนี้ไม่เจอเลขที่เลย
  // (หรือเจอแต่ไม่ตรงเดือนนี้) ค่อย fallback ไปไล่สแกนย้อนหลังเป็นก้อนๆ แบบเดิม (ช้ากว่าแต่ชัวร์กว่า) — เกิดขึ้น
  // ไม่บ่อย (แค่ออเดอร์แรกๆ ของแต่ละเดือน หรือออเดอร์ล่าสุดมีรายการเยอะเกิน PROBE แถว) ยอมรับได้ที่จะช้าเฉพาะรอบนั้น
  var lastRow = sheet.getLastRow();
  var maxNum = 0;
  if (lastRow > 1) {
    var PROBE = 10;
    var probeStart = Math.max(2, lastRow - PROBE + 1);
    var probeIds = sheet.getRange(probeStart, 1, lastRow - probeStart + 1, 1).getValues();
    var lastId = '';
    for (var p = probeIds.length - 1; p >= 0; p--) {
      var probeVal = String(probeIds[p][0] || '');
      if (probeVal) { lastId = probeVal; break; }
    }
    if (lastId && lastId.indexOf(prefix) === 0) {
      maxNum = parseInt(lastId.slice(prefix.length), 10) || 0;
    } else {
      var CHUNK = 1000;
      var SAFETY_MARGIN = 20;
      var row = lastRow;
      var consecutiveMiss = 0;
      var stop = false;
      while (row >= 2 && !stop) {
        var chunkStart = Math.max(2, row - CHUNK + 1);
        var numRows = row - chunkStart + 1;
        var ids = sheet.getRange(chunkStart, 1, numRows, 1).getValues().map(function (r) { return String(r[0]); });
        for (var i = ids.length - 1; i >= 0; i--) {
          var id = ids[i];
          if (id && id.indexOf(prefix) === 0) {
            consecutiveMiss = 0;
            var n = parseInt(id.slice(prefix.length), 10) || 0;
            if (n > maxNum) maxNum = n;
          } else if (id) {
            consecutiveMiss++;
            if (consecutiveMiss >= SAFETY_MARGIN) { stop = true; break; }
          }
        }
        row = chunkStart - 1;
      }
    }
  }
  var seq = maxNum + 1;
  var seqStr = seq < 10 ? '00' + seq : seq < 100 ? '0' + seq : String(seq);
  return prefix + seqStr;
}

function deleteExistingOrderRows_(sheet, orderId) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var startRow = -1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(orderId)) { startRow = i + 2; break; }
  }
  if (startRow === -1) return false;
  var numRows = 1;
  while (startRow + numRows <= sheet.getLastRow()) {
    var nextId = sheet.getRange(startRow + numRows, 1).getValue();
    if (nextId) break;
    numRows++;
  }
  sheet.deleteRows(startRow, numRows);
  return true;
}

function getOrderFinalAmount_(sheet, orderId) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(orderId)) {
      return parseFloat(sheet.getRange(i + 2, 9).getValue()) || 0;
    }
  }
  return 0;
}

function deleteExistingOrderPointsLog_(lineUid, orderId) {
  try {
    var sheet = ensurePointsLogSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return 0;
    var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    var tag = '[' + orderId + ']';
    var rowsToDelete = [];
    var totalOldPoints = 0;
    data.forEach(function (row, idx) {
      if (String(row[1]) !== lineUid) return;
      if (String(row[3] || '').indexOf(tag) === -1) return;
      rowsToDelete.push(idx + 2);
      totalOldPoints += parseFloat(row[4]) || 0;
    });
    rowsToDelete.sort(function (a, b) { return b - a; });
    rowsToDelete.forEach(function (r) { sheet.deleteRow(r); });
    return totalOldPoints;
  } catch (e) {
    Logger.log('deleteExistingOrderPointsLog_ error: ' + e.toString());
    return 0;
  }
}

function reverseRedeemedPointsForOrder_(lineUid, orderId) {
  try {
    var sheet = ensurePointsLogSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return 0;
    var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    var tag = '[' + orderId + ']';
    var rowsToDelete = [];
    var totalPointsToRefund = 0;
    data.forEach(function (row, idx) {
      if (String(row[1]) !== lineUid) return;
      if (String(row[2]) !== 'redeem') return;
      if (String(row[3] || '').indexOf(tag) === -1) return;
      rowsToDelete.push(idx + 2);
      totalPointsToRefund += Math.abs(parseFloat(row[4]) || 0);
    });
    rowsToDelete.sort(function (a, b) { return b - a; });
    rowsToDelete.forEach(function (r) { sheet.deleteRow(r); });
    return totalPointsToRefund;
  } catch (e) {
    Logger.log('reverseRedeemedPointsForOrder_ error: ' + e.toString());
    return 0;
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

function getActivePointsMultiplier_(items, subtotal, now) {
  try {
    var data = getCachedPointsPromosRawData_();
    if (!data.length) return { multiplier: 1, name: null };
    now = now || new Date();
    var best = { multiplier: 1, name: null };
    data.forEach(function (row) {
      if (row[1] !== 'multiplier') return;
      var active = row[2] === true || String(row[2]).toUpperCase() === 'TRUE';
      if (!active) return;
      var startDateVal = row[3], expiryDateVal = row[4];
      if (startDateVal && new Date(startDateVal) > now) return;
      if (expiryDateVal && isExpired_(expiryDateVal, now)) return;
      var minPurchase = parseFloat(row[6]) || 0;
      var restriction = String(row[7] || '').trim();
      if (restriction) {
        var eligible = computeEligibleInfo_(items || [], restriction);
        if (eligible.qty <= 0) return;
      } else if (minPurchase > 0) {
        if ((subtotal || 0) < minPurchase) return;
      }
      var mult = parseFloat(row[5]) || 1;
      if (mult > best.multiplier) best = { multiplier: mult, name: row[0] };
    });
    return best;
  } catch (e) {
    return { multiplier: 1, name: null };
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

var REVENUE_PHONE_ROWS_CACHE_TTL_ = 600;

function getRevenueRowNumbersForPhone_(phoneClean) {
  return getKeyRowIndexCached_(ensureRevenueSheet_(), REVENUE_PHONE_COL_, phoneClean, 'revrows_', REVENUE_PHONE_ROWS_CACHE_TTL_, normalizeDigits_);
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

function ensurePointRewardsSheet_() {
  if (_sheetCache_.pointRewards) return _sheetCache_.pointRewards;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Point_Rewards');
  if (!sheet) {
    sheet = ss.insertSheet('Point_Rewards');
    sheet.appendRow(['คะแนนที่ต้องการ', 'ชื่อสิทธิ์ที่จะได้', 'ประเภท(percent/fixed)', 'มูลค่า', 'สิทธิ์หมดอายุใน(วัน, ว่าง=ไม่หมดอายุ)', 'เปิดใช้งาน(TRUE/FALSE)']);
  }
  _sheetCache_.pointRewards = sheet;
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

function logPointsTransaction_(lineUid, type, description, delta, balanceAfter) {
  try {
    ensurePointsLogSheet_().appendRow([new Date(), lineUid, type, description, delta, balanceAfter]);
  } catch (e) {
    Logger.log('logPointsTransaction_ error: ' + e.toString());
  }
}

function addPointsAndCheckRewards_(lineUid, pointsToAdd, spendAmount, memberRowIndex, currentPoints, currentLifetimeSpend, currentTierName, orderId, promoNote) {
  try {
    if (!lineUid) return;
    if (!memberRowIndex || memberRowIndex < 2) return;
    var memberSheet = ensureMembersSheet_();
    var newTotalPoints = (parseInt(currentPoints) || 0) + (pointsToAdd > 0 ? pointsToAdd : 0);
    var newLifetimeSpend = (parseFloat(currentLifetimeSpend) || 0) + (parseFloat(spendAmount) || 0);

    memberSheet.getRange(memberRowIndex, 6).setValue(newTotalPoints);
    memberSheet.getRange(memberRowIndex, 12).setValue(newLifetimeSpend);

    if (pointsToAdd > 0) {
      var orderTag = orderId ? ('[' + orderId + '] ') : '';
      logPointsTransaction_(lineUid, 'earn', orderTag + 'ได้รับจากการสั่งซื้อ (ยอด ' + Math.round(spendAmount) + ' บาท)' + (promoNote ? ' ' + promoNote : ''), pointsToAdd, newTotalPoints);
    }

    var newTier = resolveTierNoDowngrade_(currentTierName, newLifetimeSpend, newTotalPoints);
    if (newTier.key !== currentTierName && newTier.name !== currentTierName) {
      memberSheet.getRange(memberRowIndex, 7).setValue(newTier.key);
    }

    if (pointsToAdd <= 0) return;

    var rewardSheet = ensurePointRewardsSheet_();
    var rLastRow = rewardSheet.getLastRow();
    if (rLastRow <= 1) return;
    var rData = rewardSheet.getRange(2, 1, rLastRow - 1, 6).getValues();

    var privilegeSheet = ensurePrivilegesSheet_();
    var pLastRow = privilegeSheet.getLastRow();
    var existingPrivileges = pLastRow > 1 ? privilegeSheet.getRange(2, 1, pLastRow - 1, 2).getValues() : [];

    rData.forEach(function (row) {
      var threshold = parseInt(row[0]) || 0;
      var rewardName = String(row[1] || '').trim();
      if (!threshold || !rewardName) return;
      var active = row[5] === true || String(row[5]).toUpperCase() === 'TRUE';
      if (!active) return;
      if (newTotalPoints < threshold) return;

      var alreadyGranted = existingPrivileges.some(function (p) {
        return String(p[0]) === lineUid && String(p[1]) === rewardName;
      });
      if (alreadyGranted) return;

      var expiryDays = parseInt(row[4]) || 0;
      var expiry = expiryFromDays_(new Date(), expiryDays);
      privilegeSheet.appendRow([lineUid, rewardName, row[2], row[3], expiry, 'ระบบแต้มสะสมอัตโนมัติ', new Date(), true, false]);
    });
  } catch (e) {
    Logger.log('addPointsAndCheckRewards_ error: ' + e.toString());
  }
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

function invalidatePendingPointsCache_(phone) {
  var phoneClean = String(phone || '').replace(/[^0-9]/g, '');
  if (!phoneClean) return;
  try { CacheService.getScriptCache().remove(pendingPointsCacheKey_(phoneClean, '')); } catch (e) {}
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
  return readRowsMerged_(sheet, rowNumbers, 15);
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
        physicalFreeQty: calc.physicalFreeQty || 0, minPurchase: minPurchase, freeDiscountPercent: calc.freeDiscountPercent || 100
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

var CANCELLED_ORDER_MARK_ = 'ยกเลิก';

function cancelShopOrder(idToken, orderId) {
  var profile;
  try {
    profile = verifyLineIdToken_(idToken);
  } catch (e) {
    return { success: false, error: e.toString() };
  }
  if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ')' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนทำรายการพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    orderId = String(orderId || '').trim();
    if (!orderId) return { success: false, error: 'ไม่พบเลขที่ออเดอร์' };

    var memberRowIndex = findMemberRowIndex_(profile.sub);
    if (memberRowIndex === -1) return { success: false, error: 'ไม่พบบัญชีสมาชิกของคุณ' };
    var myPhone = String(ensureMembersSheet_().getRange(memberRowIndex, 4).getValue() || '');
    if (!myPhone) return { success: false, error: 'ไม่พบบัญชีสมาชิกของคุณ' };

    var ss = SpreadsheetApp.openById(REVENUE_SHEET_ID_SHOP);
    var sheet = ss.getSheetByName(REVENUE_SHEET_NAME_SHOP);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, error: 'ไม่พบคำสั่งซื้อนี้ในระบบ' };

    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var targetRow = -1;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === orderId) { targetRow = i + 2; break; }
    }
    if (targetRow === -1) return { success: false, error: 'ไม่พบคำสั่งซื้อนี้ในระบบ (อาจถูกยกเลิกไปแล้ว)' };

    // ⚡ แก้ (19/9/69) — อ่านถึงคอลัมน์ AG เพื่อเช็คสถานะเก็บเงินปลายทางด้วย
    var mainRow = sheet.getRange(targetRow, 1, 1, Math.min(COD_STATUS_COL_, sheet.getMaxColumns())).getValues()[0];
    var rowPhone = String(mainRow[14] || '');
    if (rowPhone !== myPhone) return { success: false, error: 'ไม่สามารถยกเลิกคำสั่งซื้อนี้ได้ (ไม่ใช่ของคุณ)' };
    // ⚡ เพิ่ม (19/9/69) — ออเดอร์เก็บเงินปลายทางไม่มีสลิป (คอลัมน์ K เป็นข้อความกำกับไว้แทน) จึงต้องแยกเงื่อนไข
    // ออกมาต่างหาก: ยกเลิกเองได้ตราบใดที่ยังอยู่สถานะ "รอเก็บเงิน" (ยังไม่ได้รับเงินจากลูกค้าจริง)
    var codStatusNow_ = String(mainRow[COD_STATUS_COL_ - 1] || '');
    var isCodOrderRow_ = isCodPaymentLabel_(mainRow[9]);
    if (isCodOrderRow_) {
      if (codStatusNow_ && codStatusNow_ !== COD_STATUS_PENDING_) {
        return { success: false, error: 'คำสั่งซื้อนี้ปิดรายการเก็บเงินปลายทางไปแล้ว ไม่สามารถยกเลิกเองได้ กรุณาติดต่อทีมงาน' };
      }
    } else if (mainRow[10]) {
      return { success: false, error: 'คำสั่งซื้อนี้แนบสลิปไปแล้ว อยู่ระหว่างตรวจสอบ ไม่สามารถยกเลิกเองได้ กรุณาติดต่อทีมงาน' };
    }
    if (String(mainRow[2]) === CANCELLED_ORDER_MARK_) return { success: false, error: 'คำสั่งซื้อนี้ถูกยกเลิกไปแล้ว' };

    // หาว่าออเดอร์นี้มีกี่แถว (สินค้าหลายรายการจะต่อกันหลายแถว โดยแถวถัดๆ ไปจะมีคอลัมน์ A ว่างไว้)
    var numRows = 1;
    while (targetRow + numRows <= sheet.getLastRow()) {
      var nextId = sheet.getRange(targetRow + numRows, 1).getValue();
      if (nextId) break;
      numRows++;
    }

    for (var r = 0; r < numRows; r++) {
      var rowNum = targetRow + r;
      sheet.getRange(rowNum, 3).setValue(CANCELLED_ORDER_MARK_); // ชื่อสินค้า (คอลัมน์ C) -> "ยกเลิก"
      sheet.getRange(rowNum, 6).setValue(0); // ส่วนลดต่อรายการ (คอลัมน์ F)
      sheet.getRange(rowNum, 7).setValue(0); // ยอดสุทธิต่อรายการ (คอลัมน์ G) — ค่าที่รายงานยอดขายมักไปรวม
    }
    sheet.getRange(targetRow, 8).setValue(0); // ค่าจัดส่ง (คอลัมน์ H)
    sheet.getRange(targetRow, 9).setValue(0); // ยอดชำระรวม (คอลัมน์ I)

    var cancelNote_ = 'ลูกค้ายกเลิกเอง (' + Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm') + ')';
    sheet.getRange(targetRow, 20).setValue(cancelNote_); // หมายเหตุ (คอลัมน์ T) -> แทนที่ทั้งหมดด้วยข้อความนี้
    // ⚡ เพิ่ม (19/9/69) — ออเดอร์เก็บเงินปลายทางที่ถูกยกเลิก: ล้างสถานะ COD และวันที่ชำระเงินที่เคยใส่ไว้ตอนสั่ง
    // ออกด้วย เพื่อไม่ให้ค้างอยู่ในรายการ "รอเก็บเงิน" และไม่ถูกนับเป็นยอดขายที่ไหนอีก
    if (isCodOrderRow_) {
      sheet.getRange(targetRow, 31).setValue('');
      sheet.getRange(targetRow, COD_STATUS_COL_).setValue('');
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
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

function expiryFromDays_(baseDate, days) {
  var n = parseInt(days, 10) || 0;
  if (n <= 0) return '';
  var base = (baseDate instanceof Date) ? new Date(baseDate.getTime()) : new Date();
  base.setDate(base.getDate() + (n - 1));
  base.setHours(23, 59, 59, 999);
  return base;
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

var COUPONS_RAW_CACHE_KEY_ = 'coupons_raw_v1';

function getCachedCouponsRawData_() {
  try {
    var cached = CacheService.getScriptCache().get(COUPONS_RAW_CACHE_KEY_);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  var sheet = ensureCouponsSheet_();
  var lastRow = sheet.getLastRow();
  var data = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 15).getValues() : [];
  try {
    CacheService.getScriptCache().put(COUPONS_RAW_CACHE_KEY_, JSON.stringify(data), 15);
  } catch (e) {
    // ชีตใหญ่เกิน 100KB ต่อ cache key ก็แค่ข้าม cache ไปเฉยๆ ไม่กระทบความถูกต้องของข้อมูลเลย
  }
  return data;
}

function findAutoCoupons_(subtotal, items, priceMap, shippingCost, memberTierKey) {
  try {
    var data = getCachedCouponsRawData_();
    if (!data.length) return [];
    var now = new Date();

    function isEligibleRow_(row) {
      var autoApply = row[8] === true || String(row[8]).toUpperCase() === 'TRUE';
      if (!autoApply) return false;
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

function validateCoupon_(code, subtotal, items, priceMap, shippingCost, memberTierKey) {
  if (!code) return null;
  try {
    var data = getCachedCouponsRawData_();
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
        physicalFreeQty: calc.physicalFreeQty || 0, freeDiscountPercent: calc.freeDiscountPercent || 100
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
      out.push({ name: String(row[1] || ''), minPurchase: parseFloat(row[13]) || 0, restriction: String(row[10] || '') });
    });
    return out;
  } catch (e) {
    return [];
  }
}

function bahtText_(n) {
  return '฿' + (Math.round(Number(n) || 0)).toLocaleString('th-TH');
}

function getPrivilegeLockState_(lineUid, appliedPrivileges, subtotal) {
  if (appliedPrivileges && appliedPrivileges.length) {
    return {
      locked: true, pending: false,
      note: 'ออเดอร์นี้ใช้สิทธิพิเศษสมาชิก จึงใช้ร่วมกับคูปองและโปรโมชั่นอื่นไม่ได้ — คูปองที่มีอยู่ยังไม่ถูกใช้ จะกลับมาใช้ได้หลังใช้สิทธิพิเศษหมดแล้ว'
    };
  }
  if (!PRIVILEGE_BLOCKS_COUPONS_EVEN_IF_UNUSABLE_) return { locked: false, pending: false, note: '' };

  var pendingList = getUnusedMemberPrivileges_(lineUid);
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

function createShopOrder(idToken, itemsJson, paymentMethod, couponCode, shippingAddress, province, excludePrivilegeName, existingOrderId, purchaseReferrerCode, pointsToRedeem) {
  var profile;
  try {
    profile = verifyLineIdToken_(idToken);
  } catch (e) {
    return { success: false, error: e.toString() };
  }
  if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ') | ' + tokenDiag_(idToken) };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนสั่งซื้อพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    var excludeRowIndexes = String(excludePrivilegeName || '').split('|').filter(Boolean);
    existingOrderId = String(existingOrderId || '').trim();

    var address = String(shippingAddress || '').trim();
    if (!address) return { success: false, error: 'กรุณากรอกที่อยู่จัดส่ง' };
    var provinceValue = String(province || '').trim();
    if (!provinceValue) return { success: false, error: 'กรุณาเลือกจังหวัด' };

    var memberSheet = ensureMembersSheet_();
    var customerName = profile.name || '';
    var phone = '';
    // ⚡ แก้ (perf) — หาแถวสมาชิกและอ่านค่าในแถวนั้นให้จบในการยิง Sheets API รอบเดียว (เดิม 3 รอบ)
    var memberFound_ = getMemberRowByUid_(profile.sub, 12);
    var memberRowIndex = memberFound_ ? memberFound_.rowIndex : -1;
    var memberTierName = '';
    var memberPoints = 0;
    var memberLifetimeSpend = 0;
    if (memberRowIndex !== -1) {
      var mRow = memberFound_.values;
      phone = String(mRow[3] || ''); memberTierName = mRow[6];
      memberPoints = mRow[5]; memberLifetimeSpend = mRow[11];
      var fullNameFromProfile = String(mRow[9] || '').trim();
      if (fullNameFromProfile) customerName = fullNameFromProfile;

      // ⚡ เพิ่ม (19/8/69) — ถ้ากำลังแก้ไขออเดอร์เดิม (มี existingOrderId) ต้องคืนคะแนนที่เคย "แลกเป็นส่วนลด
      // เงินสด" ไว้ให้ออเดอร์นี้กลับเข้ายอดคงเหลือก่อน แล้วค่อยคำนวณ/หักคะแนนใหม่ตามจำนวนที่ระบุมาล่าสุด กัน
      // หักคะแนนซ้ำสองรอบถ้าลูกค้าแก้ไขจำนวนคะแนนที่จะแลกหลังจากที่เคยยืนยันสั่งซื้อไปแล้วครั้งหนึ่ง
      if (existingOrderId) {
        var refundedPoints_ = reverseRedeemedPointsForOrder_(profile.sub, existingOrderId);
        if (refundedPoints_ > 0) memberPoints += refundedPoints_;
      }
    }
    if (!phone) return { success: false, error: 'กรุณาสมัครสมาชิกก่อนค่ะ' };

    // ⚡ เพิ่ม (25/8/69) — หาระดับสมาชิกปัจจุบัน เพื่อใช้เช็คคูปองที่จำกัดเฉพาะบางระดับ
    var memberTierKeyForCoupon_ = memberRowIndex !== -1 ? resolveTierByStoredValue_(memberTierName, memberLifetimeSpend, profile.sub).key : '';

    var itemsInput;
    try { itemsInput = JSON.parse(itemsJson || '[]'); } catch (e) { return { success: false, error: 'ข้อมูลตะกร้าไม่ถูกต้อง' }; }
    if (!itemsInput.length) return { success: false, error: 'ไม่มีสินค้าในตะกร้า' };

    var productsResult = getShopProducts();
    if (!productsResult.success) return { success: false, error: 'ดึงข้อมูลสินค้าไม่สำเร็จ' };
    var priceMap = {}, weightMap = {};
    productsResult.categories.forEach(function (cat) {
      cat.variants.forEach(function (v) { priceMap[v.skuName] = v.price; weightMap[v.skuName] = v.weightG || 0; });
    });

    var subtotal = 0;
    var totalWeightG = 0;
    var items = itemsInput.map(function (item) {
      var qty = parseFloat(item.qty) || 0;
      var price = priceMap.hasOwnProperty(item.name) ? priceMap[item.name] : 0;
      subtotal += qty * price;
      totalWeightG += qty * (weightMap.hasOwnProperty(item.name) ? weightMap[item.name] : 0);
      return { name: item.name, qty: qty, price: price };
    });
    var shippingCost = calcShippingCost_(totalWeightG);

    var appliedPrivileges = getAppliedPrivileges_(profile.sub, subtotal, excludeRowIndexes, items, priceMap, shippingCost);
    var couponResults = [];
    if (couponCode) {
      var manualResult = validateCoupon_(couponCode, subtotal, items, priceMap, shippingCost, memberTierKeyForCoupon_);
      if (manualResult && manualResult.error) return { success: false, error: manualResult.error };
      if (manualResult) couponResults = [manualResult];
      var manualIsShipping_ = manualResult && (manualResult.type === 'ship_percent' || manualResult.type === 'ship_fixed');
      if (!manualIsShipping_) {
        var rawAutoForOrder_ = findAutoCoupons_(subtotal, items, priceMap, shippingCost, memberTierKeyForCoupon_);
        var shipAutoForOrder_ = rawAutoForOrder_.filter(function (c) { return c.type === 'ship_percent' || c.type === 'ship_fixed'; });
        couponResults = couponResults.concat(shipAutoForOrder_);
      }
    } else {
      couponResults = findAutoCoupons_(subtotal, items, priceMap, shippingCost, memberTierKeyForCoupon_);
    }

    // เพิ่ม — กติกาเดียวกับ checkShopDiscounts: มีสิทธิพิเศษอยู่ = คูปองทุกใบตกหมด
    // ต้องทำซ้ำตรงนี้ด้วย ไม่งั้นยอดที่ตัดจริงจะไม่ตรงกับที่ลูกค้าเห็นตอนกดยืนยัน และคูปองจะโดนนับ usedCount ทิ้งฟรีๆ
    var privilegeLock_ = getPrivilegeLockState_(profile.sub, appliedPrivileges, subtotal);
    if (privilegeLock_.locked) couponResults = [];

    var privilegeProductDiscount = appliedPrivileges.reduce(function (sum, p) { return sum + (p.productDiscount || 0); }, 0);
    var privilegeShippingDiscount = appliedPrivileges.reduce(function (sum, p) { return sum + (p.shippingDiscount || 0); }, 0);
    var couponProductDiscount = couponResults.reduce(function (sum, c) { return sum + (c.productDiscount || 0); }, 0);
    var couponShippingDiscount = couponResults.reduce(function (sum, c) { return sum + (c.shippingDiscount || 0); }, 0);

    var nowForPromoCheck_ = new Date();
    // อ่านประวัติออเดอร์เฉพาะเมื่อมีโปรซื้อซ้ำที่ใช้ได้กับตะกร้านี้จริงเท่านั้น
    var repeatCandidate_ = getActiveRepeatBonusConfig_(items, subtotal, nowForPromoCheck_);
    var priorOrdersThisMonth_ = repeatCandidate_ ? countPriorOrdersThisMonth_(phone, existingOrderId) : 0;
    var repeatConfig_ = priorOrdersThisMonth_ > 0 ? repeatCandidate_ : null;
    var repeatBonusDiscount_ = 0;
    // แก้ — ล็อกด้วยสิทธิพิเศษ = ตัดส่วนลดโปรซื้อซ้ำ แต่คะแนนโบนัส/ตัวคูณยังได้ตามเดิม
    if (!privilegeLock_.locked && repeatConfig_ && repeatConfig_.discountValue > 0) {
      repeatBonusDiscount_ = repeatConfig_.discountType === 'percent'
        ? subtotal * repeatConfig_.discountValue / 100
        : Math.min(subtotal, repeatConfig_.discountValue);
    }
    var pointsMultiplierInfo_ = getActivePointsMultiplier_(items, subtotal, nowForPromoCheck_);

    var totalDiscount = Math.min(subtotal, privilegeProductDiscount + couponProductDiscount + repeatBonusDiscount_);
    var totalShippingDiscount = Math.min(shippingCost, privilegeShippingDiscount + couponShippingDiscount);
    var finalShippingCost = Math.max(0, shippingCost - totalShippingDiscount);
    var finalAmount = subtotal - totalDiscount + finalShippingCost;

    var cashDiscountOnly_ = 0;
    appliedPrivileges.forEach(function (p) { cashDiscountOnly_ += (p.productDiscount || 0); });
    couponResults.forEach(function (c) { cashDiscountOnly_ += (c.productDiscount || 0); });
    cashDiscountOnly_ += repeatBonusDiscount_;

    // แลกคะแนนเป็นส่วนลด: จองคะแนนไว้กับออเดอร์ระหว่างรอแนบสลิป แต่จะตัดคะแนนจริงตอนแนบสลิปสำเร็จเท่านั้น
    var availablePointsForThisOrder_ = Math.max(0, memberPoints - getPendingPointsReservedForPhone_(phone, existingOrderId));
    var pointsRedeemResult_ = calcPointsRedeemDiscount_(pointsToRedeem, availablePointsForThisOrder_, Math.max(0, finalAmount));
    finalAmount = Math.max(0, finalAmount - pointsRedeemResult_.discount);
    cashDiscountOnly_ += pointsRedeemResult_.discount;
    // ⚡ แก้ — ปัดเศษสตางค์ทิ้งด้วย Math.floor (ไม่ปัดขึ้น) ก่อนบันทึกลงชีต Revenue และส่งกลับไปแสดงผลที่ลูกค้า
    // เพราะออเดอร์ที่มีส่วนลด % ของแถมแบบ bogo กับสินค้าราคาไม่ลงตัว จะได้ finalAmount เป็นเศษสตางค์ (เช่น
    // 393.833) ทำให้ยอดที่บันทึกไว้กับยอดที่หน้าร้านแสดง (ซึ่งปัดเศษทิ้งฝั่ง client เหมือนกันอยู่แล้ว) ไม่ตรงกัน
    finalAmount = Math.floor(finalAmount);

    // ⚡ เพิ่ม (19/9/69) — เก็บเงินปลายทาง: เช็คสิทธิ์ซ้ำฝั่ง backend เสมอ ไม่เชื่อค่าที่ส่งมาจากหน้าเว็บ
    // (กันคนแก้หน้าเว็บเองแล้วสั่งซื้อทั้งที่ร้านปิดรับ/ถูกบล็อก/ยอดไม่เข้าเงื่อนไข) แล้วค่อยบวกค่าธรรมเนียม
    var isCodOrder = String(paymentMethod || '') === 'cod';
    var codFee = 0;
    if (isCodOrder) {
      var codEligibility_ = evaluateCodEligibility_(profile.sub, memberTierKeyForCoupon_, finalAmount);
      if (!codEligibility_.allowed) return { success: false, error: codEligibility_.reason };
      codFee = calcCodFee_(finalAmount);
      finalAmount = finalAmount + codFee;
    }

    var sheet = ensureRevenueSheet_();
    // เรียกทุกออเดอร์ (ไม่ใช่เฉพาะ COD) เพราะแถวที่เขียนลงชีตกว้าง 34 คอลัมน์เท่ากันหมดแล้ว
    // ถ้าชีตยังมีคอลัมน์ไม่ถึง AH การเขียนจะพังทั้งออเดอร์ปกติด้วย
    ensureRevenueCodColumns_(sheet);

    var isEditingExistingOrder = false;
    var oldFinalAmount = 0;
    var revenueId;
    if (existingOrderId) {
      oldFinalAmount = getOrderFinalAmount_(sheet, existingOrderId);
      if (deleteExistingOrderRows_(sheet, existingOrderId)) {
        revenueId = existingOrderId;
        isEditingExistingOrder = true;
      } else {
        revenueId = generateShopRevenueId_(sheet);
      }
    } else {
      revenueId = generateShopRevenueId_(sheet);
    }
    var timestamp = new Date();
    var startRow = sheet.getLastRow() + 1;

    // ⚡ แก้ (perf) — คอลัมน์ 2 (B) กับ 23 (W) ใช้รูปแบบวันที่เหมือนกัน รวมเป็นการยิงรอบเดียวด้วย getRangeList
    sheet.getRange(startRow, 15, 100, 1).setNumberFormat('@STRING@');
    sheet.getRangeList(['B' + startRow + ':B' + (startRow + 99), 'W' + startRow + ':W' + (startRow + 99),
                        'AE' + startRow + ':AE' + (startRow + 99), 'AH' + startRow + ':AH' + (startRow + 99)])
         .setNumberFormat('dd/MM/yyyy HH:mm:ss');

    var paymentLabel = isCodOrder
      ? COD_PAYMENT_LABEL_
      : (paymentMethod === 'promptpay' ? 'พร้อมเพย์ (LINE Shop)' : 'โอนเงินธนาคาร (LINE Shop)');
    var discountNoteParts = [];
    var freebieNoteParts = [];
    var physicalFreebieNoteParts = [];
    appliedPrivileges.forEach(function (p) {
      if (p.discount > 0) discountNoteParts.push('สิทธิ์: ' + p.name + ' (-' + Math.round(p.discount) + ')');
      if (p.type === 'bogo' && p.freeQtyGranted > 0) freebieNoteParts.push(p.name + ' (ลดราคา ' + p.freeQtyGranted + ' ชิ้น)');
      if (p.type === 'bogo' && p.physicalFreeQty > 0) physicalFreebieNoteParts.push(p.name + ' (แถม ' + p.physicalFreeQty + ' ชิ้น — หยิบใส่ให้ลูกค้าด้วย)');
    });
    couponResults.forEach(function (c) {
      if (c.discount > 0) discountNoteParts.push('คูปอง: ' + c.code + ' (-' + Math.round(c.discount) + ')');
      if (c.type === 'bogo' && c.freeQtyGranted > 0) freebieNoteParts.push(c.code + ' (ลดราคา ' + c.freeQtyGranted + ' ชิ้น)');
      if (c.type === 'bogo' && c.physicalFreeQty > 0) physicalFreebieNoteParts.push(c.code + ' (แถม ' + c.physicalFreeQty + ' ชิ้น — หยิบใส่ให้ลูกค้าด้วย)');
    });
    if (repeatConfig_) {
      if (repeatBonusDiscount_ > 0) discountNoteParts.push('ซื้อซ้ำเดือนนี้: ' + repeatConfig_.name + ' (-' + Math.round(repeatBonusDiscount_) + ')');
      if (repeatConfig_.bonusPoints > 0) discountNoteParts.push('ซื้อซ้ำเดือนนี้: ' + repeatConfig_.name + ' (+' + repeatConfig_.bonusPoints + ' แต้ม)');
    }
    if (pointsMultiplierInfo_.multiplier > 1) discountNoteParts.push('คูณแต้ม: ' + pointsMultiplierInfo_.name + ' (x' + pointsMultiplierInfo_.multiplier + ')');
    if (pointsRedeemResult_.pointsUsed > 0) {
      discountNoteParts.push('แลกคะแนน: ' + pointsRedeemResult_.pointsUsed + ' คะแนน (-' + Math.round(pointsRedeemResult_.discount) + ')');
    }
    var shippingLine = totalShippingDiscount > 0
      ? ('ค่าจัดส่ง: ' + Math.round(shippingCost) + ' บาท ลด ' + Math.round(totalShippingDiscount) + ' บาท เหลือ ' + Math.round(finalShippingCost) + ' บาท')
      : ('ค่าจัดส่ง: ' + Math.round(finalShippingCost) + ' บาท');
    // ค่าธรรมเนียมเก็บเงินปลายทางบวกรวมไปกับค่าจัดส่งในคอลัมน์ H เพื่อให้ยอดในชีตบวกกันได้ลงตัวเหมือนเดิม
    // (Amount + Delivery = Bill Total) แต่เขียนแยกไว้ในหมายเหตุให้เห็นชัดว่ามาจากค่าธรรมเนียมเท่าไร
    if (codFee > 0) shippingLine += ' + ค่าธรรมเนียมเก็บเงินปลายทาง ' + Math.round(codFee) + ' บาท';
    var deliveryColValue_ = finalShippingCost + codFee;
    var purchaseReferrerCodeClean_ = String(purchaseReferrerCode || '').trim();
    var remark = shippingLine + ' (น้ำหนักรวม ' + totalWeightG + ' กรัม) | ' + (isCodOrder ? COD_REMARK_PENDING_ : 'รอแนบสลิป - LINE Shop')
      + (discountNoteParts.length ? ' | ' + discountNoteParts.join(', ') : '')
      + (pointsRedeemResult_.pointsUsed > 0 ? ' | 🎯 คะแนนรอหัก: ' + pointsRedeemResult_.pointsUsed + ' คะแนน (-฿' + Math.round(pointsRedeemResult_.discount) + ')' : '')
      + (freebieNoteParts.length ? ' | 🎁 แถม (ลดราคาแล้ว): ' + freebieNoteParts.join(', ') : '')
      + (physicalFreebieNoteParts.length ? ' | 📦 ต้องหยิบของแถมเพิ่ม: ' + physicalFreebieNoteParts.join(', ') : '')
      + (purchaseReferrerCodeClean_ ? ' | 🤝 รหัสแนะนำซื้อ: ' + purchaseReferrerCodeClean_ : '');

    var campaignNameParts = appliedPrivileges.map(function (p) { return p.name; });
    couponResults.forEach(function (c) { campaignNameParts.push(c.code); });
    var campaignValue = campaignNameParts.join(' + ');

    // ⚡ เพิ่ม (19/9/69) — ค่าเฉพาะของออเดอร์เก็บเงินปลายทาง:
    //   • คอลัมน์ K (Slip1) ใส่ข้อความกำกับไว้แทนลิงก์สลิป (แนวเดียวกับออเดอร์ยอด 0 บาทที่ทำอยู่เดิม) เพื่อให้
    //     หน้า "รอแนบสลิป" ของลูกค้าไม่ไปหยิบออเดอร์นี้มาแสดง และประวัติการสั่งซื้อยังเห็นออเดอร์นี้ตามปกติ
    //   • คอลัมน์ AE (วันที่ชำระเงิน) ใส่เวลาที่สั่งซื้อไปเลย = รับรู้ยอดขายทันทีตั้งแต่วันที่สั่ง (ดูหมายเหตุ
    //     ที่หัวข้อ COD ด้านบน) — เงินเข้าจริงดูที่ AH ซึ่งจะถูกเขียนตอนแอดมินกดยืนยันว่าเก็บเงินได้แล้ว
    var codSlipValue_ = isCodOrder ? COD_SLIP_PLACEHOLDER_ : '';
    var codPaymentDateValue_ = isCodOrder ? timestamp : '';
    var codStatusValue_ = isCodOrder ? COD_STATUS_PENDING_ : '';

    var rows = [];
    items.forEach(function (item, idx) {
      var amt = item.qty * item.price;
      var itemDiscount = subtotal > 0 ? Math.round(totalDiscount * (amt / subtotal) * 100) / 100 : 0;
      if (idx === 0) {
        rows.push([
          revenueId, timestamp, item.name, item.qty, item.price, itemDiscount, amt - itemDiscount,
          deliveryColValue_, finalAmount, paymentLabel, codSlipValue_, '', '',
          customerName, phone, 'LINE Shop (อัตโนมัติ)', 'LINE Shop', campaignValue,
          'สมาชิก LINE', remark, '', '', timestamp, provinceValue,
          address, '', '', '', '', '', codPaymentDateValue_, profile.sub, // ⚡ แก้ (1/9/69) — ย้าย LINE UID จากคอลัมน์ Z (ชนกับ "วันที่พิมพ์ใบจัดส่ง" ของ Revenue Spunky Online) มาไว้คอลัมน์ AF แทน (ถัดจากวันที่ชำระเงินที่ว่างอยู่)
          codStatusValue_, '' // ⚡ เพิ่ม (19/9/69) — AG สถานะเก็บเงินปลายทาง / AH วันที่ได้รับเงินปลายทาง (ว่างทั้งคู่ถ้าไม่ใช่ออเดอร์ COD)
        ]);
      } else {
        rows.push(['', '', item.name, item.qty, item.price, itemDiscount, amt - itemDiscount, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']); // ⚡ แก้ (19/9/69) — ขยายจาก 32 เป็น 34 คอลัมน์ (A-AH) ให้ตรงกับ setValues ด้านล่าง กันบั๊ก 'จำนวนคอลัมน์ไม่ตรง' ตอนออเดอร์มีมากกว่า 1 รายการ
      }
    });

    sheet.getRange(startRow, 1, rows.length, REVENUE_TOTAL_COLS_).setValues(rows);

    // ⚡ แก้ (perf) — เดิมยิงเขียนชีตแยก 1 รอบต่อสิทธิ์ 1 ใบ (ลูกค้าที่ใช้สิทธิ์หลายใบพร้อมกันยิ่งรอนาน)
    // เปลี่ยนมาใช้ getRangeList().setValue() ซึ่งเซ็ตค่าเดียวกันให้ทุกช่องพร้อมกันในการยิงรอบเดียว
    if (appliedPrivileges.length) {
      var privCells_ = appliedPrivileges.map(function (p) { return 'H' + p.rowIndex; });
      ensurePrivilegesSheet_().getRangeList(privCells_).setValue(false);
      // บันทึกวันที่ใช้สิทธิ์จริงแยกไว้คอลัมน์ Q (17) — ต่างจากคอลัมน์ "เปิดใช้งาน" (H) ที่ถูกปิดได้จาก
      // หลายสาเหตุ (ลูกค้าใช้สิทธิ์จริง, แอดมินปิดเอง, แอดมินปิดทั้งชุดหลังโปรหมดเวลา) คอลัมน์นี้เขียน
      // เฉพาะกรณีลูกค้าใช้สิทธิ์จริงตอนสั่งซื้อเท่านั้น ให้แดชบอร์ดแยก "ใช้แล้ว" ออกจาก "หมดอายุ/ปิดโดย
      // แอดมิน" ได้ตรง ๆ — ใช้คอลัมน์ Q ไม่ใช่ P เพราะคอลัมน์ P มีข้อมูล "ประกาศโปรใหม่แล้ว" อยู่แล้ว
      //
      // ⚠️ เช็คหัวคอลัมน์ Q สด ๆ ก่อนเขียนทุกครั้ง — ถ้าไม่ตรงกับที่ตั้งใจไว้ (เช่น มีคนเอาคอลัมน์นี้ไปใช้
      // เก็บอย่างอื่นในอนาคตโดยที่โค้ดจุดนี้ไม่ได้ถูกแก้ตาม) จะข้ามการเขียนไปเฉย ๆ ไม่เขียนทับข้อมูลเดิม
      // และไม่ทำให้ออเดอร์ล้มเหลว (แลกกับการที่ยอด "ใช้แล้ว" ในแดชบอร์ดจะไม่นับรายการนั้น ซึ่งปลอดภัยกว่า)
      var privSheetForUsage_ = ensurePrivilegesSheet_();
      var qHeader_ = String(privSheetForUsage_.getRange(1, 17).getValue() || '').trim();
      if (qHeader_ === 'ใช้สิทธิ์เมื่อ') {
        var usedAtCells_ = appliedPrivileges.map(function (p) { return 'Q' + p.rowIndex; });
        privSheetForUsage_.getRangeList(usedAtCells_).setValue(new Date());
      }
    }

    if (memberRowIndex > 0) {
      memberSheet.getRange(memberRowIndex, 8, 1, 2).setValues([[address, provinceValue]]);
    }

    // ⚡ แก้ (perf) — เดิมยิงอ่าน 1 รอบ + เขียน 1 รอบ ต่อคูปอง 1 ใบ เปลี่ยนมาอ่านช่วงที่ครอบคลุมทุกใบรวดเดียว
    // แล้วค่อยเขียนทีละใบ (เขียนเฉพาะช่องของคูปองที่ใช้จริง ไม่ไปแตะแถวคูปองอื่นที่คั่นอยู่ระหว่างกลาง)
    if (!isEditingExistingOrder && couponResults.length) {
      var couponSheet = ensureCouponsSheet_();
      var couponRows_ = couponResults.filter(function (c) { return c.rowIndex; })
                                     .map(function (c) { return parseInt(c.rowIndex, 10); });
      if (couponRows_.length) {
        var minCouponRow_ = Math.min.apply(null, couponRows_);
        var maxCouponRow_ = Math.max.apply(null, couponRows_);
        var usedCounts_ = couponSheet.getRange(minCouponRow_, 6, maxCouponRow_ - minCouponRow_ + 1, 1).getValues();
        couponRows_.forEach(function (r) {
          var idx_ = r - minCouponRow_;
          var next_ = (parseInt(usedCounts_[idx_][0], 10) || 0) + 1;
          usedCounts_[idx_][0] = next_;
          couponSheet.getRange(r, 6).setValue(next_);
        });
      }
    }

    var tierBeforeOrder = resolveTierByStoredValue_(memberTierName, memberLifetimeSpend, profile.sub);
    var basePoints = Math.floor(finalAmount / BAHT_PER_POINT);
    var repeatMultiplier_ = repeatConfig_ ? (repeatConfig_.multiplier || 1) : 1;
    var pointsEarned = Math.floor(basePoints * tierBeforeOrder.pointMultiplier * pointsMultiplierInfo_.multiplier * repeatMultiplier_)
      + (repeatConfig_ ? (repeatConfig_.bonusPoints || 0) : 0);

    var promoNoteParts_ = [];
    if (pointsMultiplierInfo_.multiplier > 1) promoNoteParts_.push('คูณแต้ม x' + pointsMultiplierInfo_.multiplier + ' (' + pointsMultiplierInfo_.name + ')');
    if (repeatConfig_ && repeatConfig_.multiplier > 1) promoNoteParts_.push('ซื้อซ้ำคูณแต้ม x' + repeatConfig_.multiplier + ' (' + repeatConfig_.name + ')');
    if (repeatConfig_ && repeatConfig_.bonusPoints > 0) promoNoteParts_.push('โบนัสซื้อซ้ำ +' + repeatConfig_.bonusPoints + ' แต้ม (' + repeatConfig_.name + ')');
    var promoNote_ = promoNoteParts_.length ? ('— รวม ' + promoNoteParts_.join(', ')) : '';

    // ยอด 0 บาทไม่มีขั้นตอนแนบสลิป จึงถือว่าสำเร็จทันทีและตัดคะแนนในจุดนี้
    if (finalAmount <= 0 && pointsRedeemResult_.pointsUsed > 0 && memberRowIndex !== -1) {
      memberPoints = Math.max(0, memberPoints - pointsRedeemResult_.pointsUsed);
      memberSheet.getRange(memberRowIndex, 6).setValue(memberPoints);
      logPointsTransaction_(profile.sub, 'redeem', '[' + revenueId + '] แลกคะแนนเป็นส่วนลด ' + Math.round(pointsRedeemResult_.discount) + ' บาท', -pointsRedeemResult_.pointsUsed, memberPoints);
    }

    if (finalAmount <= 0) {
      if (isEditingExistingOrder) {
        var oldPointsFromLog = deleteExistingOrderPointsLog_(profile.sub, existingOrderId);
        var amountDelta = finalAmount - oldFinalAmount;
        var pointsBalanceAfterReversal = Math.max(0, memberPoints - oldPointsFromLog);
        var newPointsBalance = Math.max(0, pointsBalanceAfterReversal + pointsEarned);
        var newLifetimeSpendAdjusted = Math.max(0, memberLifetimeSpend + amountDelta);

        memberSheet.getRange(memberRowIndex, 6).setValue(newPointsBalance);
        memberSheet.getRange(memberRowIndex, 12).setValue(newLifetimeSpendAdjusted);
        if (pointsEarned > 0) {
          logPointsTransaction_(profile.sub, 'earn', '[' + revenueId + '] ได้รับจากการสั่งซื้อ (ยอด ' + Math.round(finalAmount) + ' บาท)' + (promoNote_ ? ' ' + promoNote_ : ''), pointsEarned, newPointsBalance);
        }

        var newTierAfterEdit = resolveTierNoDowngrade_(memberTierName, newLifetimeSpendAdjusted, newPointsBalance);
        if (newTierAfterEdit.key !== memberTierName && newTierAfterEdit.name !== memberTierName) {
          memberSheet.getRange(memberRowIndex, 7).setValue(newTierAfterEdit.key);
        }

        pointsEarned = pointsEarned - oldPointsFromLog;
      } else {
        addPointsAndCheckRewards_(profile.sub, pointsEarned, finalAmount, memberRowIndex, memberPoints, memberLifetimeSpend, memberTierName, revenueId, promoNote_);
      }
    }

    var immediateNotifyData_ = null;
    var skipSlipUpload = false;
    if (finalAmount <= 0) {
      skipSlipUpload = true;
      try {
        sheet.getRange(startRow, 11).setValue('ไม่มีค่าใช้จ่าย (ยอด 0 บาท)');
        sheet.getRange(startRow, 20).setValue('เสร็จสมบูรณ์ (ยอด 0 บาท) - LINE Shop');
        immediateNotifyData_ = { revenueId: revenueId, paymentLabel: paymentLabel, lineUid: profile.sub };
      } catch (zeroErr) {
        Logger.log('createShopOrder: เตรียมข้อมูลแจ้งเตือนออเดอร์ยอด 0 บาทไม่สำเร็จ: ' + zeroErr.toString());
      }
      // ⚡ เพิ่ม (25/8/69) — ออเดอร์ยอด 0 บาทถือว่า "ซื้อสำเร็จ" ทันที เช็คให้รางวัลแนะนำเพื่อนได้เลย
      // (ถ้าทริกเกอร์ตั้งเป็น "ซื้อครั้งแรก" — ถ้าตั้งเป็น "ตอนสมัคร" ฟังก์ชันนี้จะข้ามให้เองอัตโนมัติ)
      try {
        checkAndGrantReferralOnFirstPurchase_(profile.sub, subtotal, items);
      } catch (refPurchErr) {
        Logger.log('createShopOrder: เช็ครางวัลแนะนำเพื่อนไม่สำเร็จ: ' + refPurchErr.toString());
      }
      // ⚡ เพิ่ม (25/8/69) — เช็ค "แนะนำเพื่อนซื้อสินค้า" ด้วย (คนละระบบกับด้านบน ถ้ามีรหัสส่งมา)
      try {
        checkAndGrantPurchaseReferral_(purchaseReferrerCodeClean_, profile.sub, revenueId, subtotal, items);
      } catch (purchRefErr) {
        Logger.log('createShopOrder: เช็ครางวัลแนะนำซื้อสินค้าไม่สำเร็จ: ' + purchRefErr.toString());
      }
    }

    // ⚡ เพิ่ม (19/9/69) — ออเดอร์เก็บเงินปลายทางไม่มีขั้นตอนแนบสลิป ถือว่าสั่งซื้อเสร็จสมบูรณ์ทันที จึงแจ้ง
    // ลูกค้าและกลุ่มแอดมินได้เลย (แอดมินต้องเห็นตั้งแต่ตอนแพ็คว่าบิลนี้ต้องเก็บเงินปลายทางกี่บาท) — แต่ยัง
    // ไม่ให้แต้ม/ยอดซื้อสะสม/รางวัลแนะนำเพื่อน และยังไม่ตัดคะแนนที่ลูกค้าเลือกแลก (คะแนนถูก "กันไว้" กับ
    // ออเดอร์นี้เหมือนออเดอร์ที่รอแนบสลิป) จนกว่าจะเก็บเงินได้จริง — ดู confirmCodPayment
    if (isCodOrder && finalAmount > 0) {
      skipSlipUpload = true;
      immediateNotifyData_ = { revenueId: revenueId, paymentLabel: paymentLabel, lineUid: profile.sub };
    }

    invalidatePendingPointsCache_(phone); // เพิ่งจองคะแนนก้อนใหม่ลงชีต ตัวเลขที่แคชไว้ใช้ไม่ได้แล้ว
    var finalReturnPayload_ = { success: true, orderId: revenueId, subtotal: subtotal, discount: totalDiscount, cashDiscount: cashDiscountOnly_, shippingCost: deliveryColValue_, codFee: codFee, isCod: isCodOrder, totalAmount: finalAmount, pointsEarned: pointsEarned, skipSlipUpload: skipSlipUpload, freebieItems: freebieNoteParts, physicalFreebieItems: physicalFreebieNoteParts, discountDetail: discountNoteParts, pointsRedeemed: pointsRedeemResult_.pointsUsed, pointsRedeemDiscount: pointsRedeemResult_.discount };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }

  if (immediateNotifyData_) {
    try {
      var billInfoNow_ = getBillDataForNotify_(sheet, startRow);
      notifyBuyerOrderConfirmation_(immediateNotifyData_.lineUid, immediateNotifyData_.revenueId, billInfoNow_.items, immediateNotifyData_.paymentLabel, billInfoNow_.subtotal, billInfoNow_.discountTotal, billInfoNow_.shippingCost, billInfoNow_.billTotal, billInfoNow_.freebieItems, billInfoNow_.physicalFreebieItems);
      notifyAdminNewOrder_(immediateNotifyData_.revenueId, billInfoNow_.customerName, billInfoNow_.phone, billInfoNow_.items, immediateNotifyData_.paymentLabel, billInfoNow_.billTotal, billInfoNow_.address, billInfoNow_.province, billInfoNow_.freebieItems, billInfoNow_.slipImageUrl, billInfoNow_.physicalFreebieItems, billInfoNow_);
    } catch (immediateNotifyErr) {
      Logger.log('createShopOrder: แจ้งเตือนออเดอร์ที่ไม่ต้องแนบสลิปไม่สำเร็จ: ' + immediateNotifyErr.toString());
    }
  }

  return finalReturnPayload_;
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

function findMemberLineUidByPhone_(phone) {
  var phoneClean = String(phone || '').replace(/[^0-9]/g, '');
  if (!phoneClean) return null;
  var sheet = ensureMembersSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  for (var i = 0; i < data.length; i++) {
    var rowPhone = String(data[i][3] || '').replace(/[^0-9]/g, '');
    if (rowPhone && rowPhone === phoneClean) return data[i][0];
  }
  return null;
}

function uploadShopSlip(orderId, base64Data, fileName, mimeType) {
  var slipUrl;
  try {
    Logger.log('uploadShopSlip: เริ่มทำงาน orderId="' + orderId + '"');
    var folder = DriveApp.getFolderById(SLIP_FOLDER_ID_SHOP);
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);
    var file = folder.createFile(blob);
    // ⚡ แก้ (perf) — ย้าย setSharing() ไปทำตอนส่งแจ้งเตือน (finalizeSlipNotifications_) แทน
    // การเปิดสิทธิ์ให้ไฟล์ใน Drive เป็นคำสั่งที่ช้ามาก (มักกินเวลา 1-2 วินาที) และคนที่ต้องใช้ลิงก์นี้จริงๆ คือ
    // ข้อความแจ้งเตือนในไลน์กับแอดมิน ซึ่งทำงานทีหลังอยู่แล้ว ไม่มีใครต้องเปิดลิงก์ ณ วินาทีที่ลูกค้ากดยืนยัน
    // ลูกค้าจึงไม่ต้องยืนรอคำสั่งนี้เปล่าๆ (ตัว URL ไม่ต้องรอ setSharing ก็ประกอบขึ้นจาก id ได้เลย)
    slipUrl = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    Logger.log('uploadShopSlip: อัปโหลดไฟล์สำเร็จ ' + slipUrl);
  } catch (uploadErr) {
    return { success: false, error: 'อัปโหลดไฟล์ไม่สำเร็จ: ' + uploadErr.toString() };
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนอัปโหลดพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  var targetRow = -1;
  try {
    var sheet = ensureRevenueSheet_();
    if (sheet.getLastRow() <= 1) return { success: false, error: 'ไม่พบเลขที่ออเดอร์นี้ในระบบ' };

    targetRow = findRevenueRowByOrderId_(sheet, orderId);
    if (targetRow === -1) return { success: false, error: 'ไม่พบเลขที่ออเดอร์ "' + orderId + '" ในระบบ' };

    // ⚡ แก้ (perf) — อ่านคอลัมน์ 11-31 ของแถวนี้รวดเดียว เดิมยิงอ่านแยกกัน 3 รอบสำหรับข้อมูลแถวเดียวกัน
    // (หมายเหตุ คอลัมน์ 20, เบอร์โทร คอลัมน์ 15, วันชำระเงิน คอลัมน์ 31)
    var rowData_ = sheet.getRange(targetRow, 11, 1, 21).getValues()[0]; // index 0 = คอลัมน์ 11
    var existingRemark_ = String(rowData_[9] || '');   // คอลัมน์ 20
    var pendingPoints_ = parsePendingPointsReservation_(existingRemark_);
    // ตัดคะแนนจริง ณ เวลาที่แนบสลิปสำเร็จเท่านั้น
    if (pendingPoints_.points > 0) {
      var pendingPhone_ = String(rowData_[4] || '');   // คอลัมน์ 15
      var pendingBuyerUid_ = findMemberLineUidByPhone_(pendingPhone_);
      var pendingBuyerFound_ = pendingBuyerUid_ ? getMemberRowByUid_(pendingBuyerUid_, 6) : null;
      var pendingBuyerRow_ = pendingBuyerFound_ ? pendingBuyerFound_.rowIndex : -1;
      if (pendingBuyerRow_ === -1) return { success: false, error: 'ไม่พบข้อมูลสมาชิกสำหรับตัดคะแนนของออเดอร์นี้' };
      var pointsBeforeDeduct_ = parseInt(pendingBuyerFound_.values[5]) || 0;
      if (pointsBeforeDeduct_ < pendingPoints_.points) {
        return { success: false, error: 'คะแนนคงเหลือไม่เพียงพอสำหรับออเดอร์นี้ (ต้องใช้ ' + pendingPoints_.points + ' คะแนน, คงเหลือ ' + pointsBeforeDeduct_ + ' คะแนน)' };
      }
      var pointsAfterDeduct_ = pointsBeforeDeduct_ - pendingPoints_.points;
      invalidatePendingPointsCache_(pendingPhone_); // ตัดคะแนนจริงแล้ว คะแนนที่ "รอหัก" ของเบอร์นี้เปลี่ยนไป
      ensureMembersSheet_().getRange(pendingBuyerRow_, 6).setValue(pointsAfterDeduct_);
      logPointsTransaction_(pendingBuyerUid_, 'redeem', '[' + orderId + '] แลกคะแนนเป็นส่วนลด ' + Math.round(pendingPoints_.discount) + ' บาท', -pendingPoints_.points, pointsAfterDeduct_);
      existingRemark_ = existingRemark_.replace(/🎯 คะแนนรอหัก:\s*\d+\s*คะแนน\s*\(-฿[\d.]+\)/, '🎯 หักคะแนนแล้ว: ' + pendingPoints_.points + ' คะแนน (-฿' + Math.round(pendingPoints_.discount) + ')');
    }

    sheet.getRange(targetRow, 11).setValue(slipUrl);
    // บันทึกวันชำระเงินจริงครั้งแรกเมื่อแนบสลิปสำเร็จ เพื่อใช้กับรายงานชำระเงินรายวัน
    // ไม่เขียนทับวันที่เดิม หากลูกค้าอัปโหลดสลิปซ้ำภายหลัง
    // ⚡ แก้ (perf) — รู้ค่าคอลัมน์ 31 อยู่แล้วจาก rowData_ ที่อ่านรวดเดียวด้านบน ไม่ต้องยิงอ่านซ้ำอีกรอบ
    if (!rowData_[20]) {
      var payDateCell_ = sheet.getRange(targetRow, 31);
      payDateCell_.setNumberFormat('dd/MM/yyyy HH:mm:ss');
      payDateCell_.setValue(new Date());
    }
    var updatedRemark_ = existingRemark_.indexOf('รอแนบสลิป - LINE Shop') !== -1
      ? existingRemark_.replace('รอแนบสลิป - LINE Shop', 'รอตรวจสอบสลิป - LINE Shop')
      : (existingRemark_ ? (existingRemark_ + ' | รอตรวจสอบสลิป - LINE Shop') : 'รอตรวจสอบสลิป - LINE Shop');
    sheet.getRange(targetRow, 20).setValue(updatedRemark_);
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }

  // ⚡ แก้ (perf) — เดิมส่งไลน์แจ้งเตือนลูกค้า+แอดมิน คำนวณ/ให้คะแนน และเช็ครางวัลแนะนำเพื่อน แบบ synchronous
  // ตรงนี้เลยก่อน return ทำให้ลูกค้าต้องรอจนกว่าทุกอย่างเสร็จ (รวม LINE push API เรียก 2 รอบ) ทั้งที่ข้อมูลจริง
  // (สลิป/สถานะออเดอร์/ตัดคะแนนที่รอหัก) บันทึกเสร็จสมบูรณ์ตั้งแต่ปล่อย lock ด้านบนไปแล้ว ทำให้ลูกค้าเห็นว่า
  // "ยังบันทึกไม่เสร็จ" อยู่นานทั้งที่จริงๆ บันทึกเสร็จไปแล้ว — ย้ายส่วนแจ้งเตือน/ให้คะแนน/เช็ครางวัลไปทำผ่าน
  // trigger แยกแทน (ดู scheduleSlipFinalize_/finalizeSlipNotifications_ ด้านล่าง) ตอบกลับลูกค้าได้ทันทีที่
  // บันทึกเสร็จจริง ส่วนแจ้งเตือนจะตามมาไม่กี่วินาทีถัดไปแบบไม่ต้องรอ
  try {
    scheduleSlipFinalize_(orderId);
  } catch (scheduleErr) {
    Logger.log('uploadShopSlip: ตั้งเวลาส่งแจ้งเตือนไม่สำเร็จ: ' + scheduleErr.toString());
    logErrorToSheet_('uploadShopSlip:schedule', 'orderId="' + orderId + '" — ' + scheduleErr.toString());
  }

  return { success: true, slipUrl: slipUrl, rowIndex: targetRow };
}

var REVENUE_ORDER_PROBE_ROWS_ = 3000;

function findRevenueRowByOrderId_(sheet, orderId) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  var target = String(orderId);
  var probeStart = Math.max(2, lastRow - REVENUE_ORDER_PROBE_ROWS_ + 1);
  var probe = sheet.getRange(probeStart, 1, lastRow - probeStart + 1, 1).getValues();
  for (var i = 0; i < probe.length; i++) {
    if (String(probe[i][0]) === target) return probeStart + i;
  }
  if (probeStart === 2) return -1; // ส่องครบทั้งชีตไปแล้ว ไม่ต้องอ่านซ้ำ
  var ids = sheet.getRange(2, 1, probeStart - 2, 1).getValues();
  for (var j = 0; j < ids.length; j++) {
    if (String(ids[j][0]) === target) return j + 2;
  }
  return -1;
}

  return { createShopOrder, decodeItemsB64_, uploadShopSlip, cancelShopOrder };
}
