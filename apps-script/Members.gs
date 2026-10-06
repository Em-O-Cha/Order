// ==================== CONFIG ====================
// วางค่าให้ครบก่อนใช้งาน:
var MEMBERS_SHEET_ID = '15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk';
var MEMBERS_SHEET_NAME = 'Members';
// LIFF ID จากขั้นตอนที่ 1 (ใช้ verify LINE Login token ฝั่ง server)
var LIFF_CHANNEL_ID = '2010892131';

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

// ⚡ เพิ่ม — แคชคอลัมน์ LINE UID/เบอร์โทรของชีต Members ไว้ใน CacheService สั้นๆ (30 วิ) เพื่อใช้เช็ค
// สมาชิกซ้ำ/เบอร์ซ้ำตอนสมัคร แทนการอ่านทั้งชีตสดทุกครั้งขณะถือ LockService lock อยู่ (ยิ่งสมาชิกเยอะ
// ยิ่งอ่านช้า ยิ่งถือ lock นาน คนสมัครพร้อมกันหลายคนก็ยิ่งเสี่ยงรอ lock เกิน 30 วิแล้วสมัครไม่ได้)
// ต้องเรียก invalidateMembersIdentityCache_() ทันทีหลัง append สมาชิกใหม่สำเร็จ ก่อนปล่อย lock เสมอ
// ไม่งั้นคนที่รอ lock อยู่ถัดไปจะเห็นข้อมูลเก่าค้างอยู่ในหน้าต่าง 30 วิ แล้วสมัครเบอร์/UID ซ้ำหลุดผ่านได้
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

var TIER_CARD_KEY_BY_NAME_EN_ = { 'Members': 'start', 'Silver': 'silver', 'Gold': 'gold', 'Platinum': 'platinum' };
function migrateTierConfigKeysToCardNames_() {
  var sheet = ensureTierConfigSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 'ไม่มีข้อมูลระดับสมาชิกในชีต Tier_Config';
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var updates = [];
  data.forEach(function (row, idx) {
    var currentKey = String(row[0] || '').trim();
    var nameEn = String(row[2] || '').trim();
    var targetKey = TIER_CARD_KEY_BY_NAME_EN_[nameEn];
    if (!targetKey) { updates.push('แถว ' + (idx + 2) + ': ⚠️ ไม่รู้จักชื่ออังกฤษ "' + nameEn + '" ข้ามไป'); return; }
    if (currentKey === targetKey) { updates.push('แถว ' + (idx + 2) + ': "' + nameEn + '" เป็น key "' + targetKey + '" ถูกต้องอยู่แล้ว ไม่แตะ'); return; }
    sheet.getRange(idx + 2, 1).setValue(targetKey);
    updates.push('แถว ' + (idx + 2) + ': "' + nameEn + '" เปลี่ยน key จาก "' + currentKey + '" → "' + targetKey + '"');
  });
  CacheService.getScriptCache().remove(TIER_CONFIG_CACHE_KEY_);
  var summary = 'migrateTierConfigKeysToCardNames_ เสร็จสิ้น\n\n' + updates.join('\n');
  Logger.log(summary);
  return summary;
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

function clearTierConfigCache() {
  CacheService.getScriptCache().remove(TIER_CONFIG_CACHE_KEY_);
  return 'ล้างแคช Tier_Config เรียบร้อยแล้ว';
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

// ⚡ เพิ่ม (1/9/69) — ไล่ดูประวัติแลกคะแนนของสมาชิกคนนี้ใน Points_Log ว่าเคยแลกของรางวัลหมวด "tier_upgrade"
// (อัปเกรดระดับด้วยคะแนน เช่น "เอมแฟน ระดับ Silver", "เอมเลิฟ ระดับ Gold", "เอม VIP ระดับ Platinum") ไว้
// ระดับไหนสูงสุดบ้าง โดยเทียบชื่อของรางวัลที่แลก (parse จากข้อความ 'แลก "ชื่อของรางวัล"' ใน Points_Log)
// กับ Rewards_Catalog เพื่อหาระดับเป้าหมายจริง (คอลัมน์ "มูลค่า/ระดับเป้าหมาย") ใช้เป็นหลักฐานสำรองตอนหา
// Tier ที่ถูกต้องของสมาชิก เผื่อคอลัมน์ Tier ในชีต Members หลุด/ไม่ตรงกับ Tier_Config ปัจจุบัน — คืนค่า null
// ถ้าไม่เคยแลกอัปเกรดระดับเลย หรือหาไม่เจอด้วยเหตุผลใดก็ตาม (ไม่ทำให้ทั้งระบบพังถ้าอ่านชีตพลาด)
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

// ⚡ เพิ่ม (1/9/69) — รันครั้งเดียวจาก Apps Script editor (เลือกฟังก์ชันนี้แล้วกด Run) เพื่อซ่อมคอลัมน์ Tier (G)
// ของสมาชิกที่ตอนนี้ว่างเปล่าอยู่ (เกิดจาก Tier_Config เคยมี key ว่างชั่วคราวตอนสมัคร) ให้กลับมาถูกต้องทันที
// โดยไม่ต้องรอให้ลูกค้าคนนั้น login ใหม่เอง ไม่ต้อง Deploy เว็บแอปใหม่ — แค่รันฟังก์ชันนี้ตรงๆ ในหน้า Editor
function fixBlankMemberTiers_() {
  var sheet = ensureMembersSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 'ไม่มีข้อมูลสมาชิก';
  var data = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  var fixed = [];
  var unfixable = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rawTierValue_ = String(row[6] || '').trim();
    if (rawTierValue_) continue; // มี Tier อยู่แล้ว ไม่ต้องแตะ
    var lifetimeSpendRaw = row[11] || 0;
    var tierInfo = resolveTierByStoredValue_('', lifetimeSpendRaw, row[0]);
    if (tierInfo && tierInfo.key) {
      sheet.getRange(i + 2, 7).setValue(tierInfo.key);
      fixed.push('แถว ' + (i + 2) + ' (' + (row[1] || row[0]) + '): ซ่อมเป็น "' + tierInfo.key + '"');
    } else {
      // ⚡ แก้ (1/9/69) — เดิมถ้า resolveTierByStoredValue_ คืนระดับที่ key ว่างเปล่าด้วย (แปลว่า Tier_Config เอง
      // มีแถวที่ Key ว่างอยู่ในชีตจริงตอนนี้) ฟังก์ชันจะข้ามเงียบๆ ไม่เขียนอะไร "และ" ไม่นับว่าเจอด้วย ทำให้สรุปผล
      // ผิดว่า "ไม่พบสมาชิกที่ Tier ว่างเปล่าเลย" ทั้งที่จริงๆ เจอแต่ซ่อมให้ไม่ได้ — แยกแจ้งเคสนี้ให้ชัดเจนแทน
      unfixable.push('แถว ' + (i + 2) + ' (' + (row[1] || row[0]) + '): Tier ว่างเปล่า แต่ซ่อมให้ไม่ได้ เพราะ Tier_Config เองมี Key ว่างอยู่ (ไปเช็คชีต Tier_Config แถวที่ยอดซื้อขั้นต่ำ = 0 ว่าคอลัมน์ Key ว่างอยู่หรือไม่ แล้วพิมพ์ "start" ใส่ก่อน แล้วรันฟังก์ชันนี้ใหม่)');
    }
  }
  var parts = [];
  if (fixed.length) parts.push('ซ่อม Tier ว่างเปล่าเรียบร้อย ' + fixed.length + ' แถว:\n' + fixed.join('\n'));
  if (unfixable.length) parts.push('⚠️ พบ ' + unfixable.length + ' แถวที่ Tier ว่างเปล่าแต่ซ่อมให้ไม่ได้:\n' + unfixable.join('\n'));
  var summary = parts.length ? parts.join('\n\n') : 'ไม่พบสมาชิกที่ Tier ว่างเปล่าเลย';
  Logger.log(summary);
  return summary;
}

// ⚡ เพิ่ม (1/9/69) — ตัวเรียกฟังก์ชันด้านบนแบบไม่มี "_" ต่อท้ายชื่อ เพราะ Apps Script editor จะซ่อนฟังก์ชันที่ชื่อ
// ลงท้ายด้วย "_" ออกจาก dropdown เลือกฟังก์ชันที่จะ Run โดยอัตโนมัติ (ถือเป็นฟังก์ชันภายใน) — ให้เลือกรันตัวนี้แทน
function runFixBlankMemberTiers() {
  return fixBlankMemberTiers_();
}

function updateTierConfig(pin, tiersJson) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var tiers = JSON.parse(tiersJson);
    if (!Array.isArray(tiers) || !tiers.length) return { success: false, error: 'ข้อมูลระดับไม่ถูกต้อง' };
    // ⚡ เพิ่ม (1/9/69) — กันต้นตอจริงของ "Tier หาย": เดิมไม่เคยเช็คเลยว่า key ของแต่ละระดับว่างหรือไม่ก่อนเขียนทับ
    // Tier_Config ถ้ามี key ว่าง (พิมพ์ตกหรือฟอร์มส่งค่าว่างมา) สมาชิกที่สมัครช่วงนั้นจะได้ Tier ว่างเปล่าไปเลย
    // (คำนวณจาก calcEligibleTier_ ที่ดึง key ตรงจากแถวที่ minSpend ต่ำสุดใน Tier_Config) ปฏิเสธการบันทึกทันทีถ้า
    // เจอ key ว่างแม้แต่ระดับเดียว ดีกว่าปล่อยให้เขียนทับแล้วไปเจอปัญหาตอนสมาชิกสมัคร/login ทีหลัง
    for (var vi_ = 0; vi_ < tiers.length; vi_++) {
      if (!String(tiers[vi_].key || '').trim()) {
        return { success: false, error: 'ระดับ "' + (tiers[vi_].name || '(ไม่มีชื่อ)') + '" ไม่มี Key กรุณาระบุ Key ให้ครบทุกระดับก่อนบันทึก' };
      }
    }
    var sheet = ensureTierConfigSheet_();
    var lastRow = sheet.getLastRow();
    // ⚡ แก้ (1/9/69) — เก็บ key+minSpend เดิมของทุกระดับไว้ก่อนเขียนทับ เพื่อ auto-migrate สมาชิกที่อ้างอิง key เดิมอยู่
    // กันปัญหา "Tier หายตอน Login" ที่เกิดซ้ำทุกครั้งที่มีการแก้ไข/เปลี่ยนชื่อ key ของ Tier_Config โดยไม่ได้อัปเดต
    // คอลัมน์ Tier ของสมาชิกเดิมให้ตรงกัน (สมาชิกจะ match ไม่เจอ แล้วถูกคำนวณใหม่จากยอดซื้อสะสมแทน ซึ่งมักจะต่ำกว่า
    // ที่ควรจะเป็น ดูเหมือน "Tier ถูกลบ")
    var oldTiersForMigration_ = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 8).getValues().map(function (r) {
      return { key: String(r[0] || '').trim(), minSpend: parseFloat(r[5]) || 0 };
    }) : [];
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 8).clearContent();
    var rows = tiers.map(function (t) {
      return [t.key, t.name, t.nameEn, t.color, t.textColor, parseFloat(t.minSpend) || 0, parseInt(t.minPoints) || 0, parseFloat(t.pointMultiplier) || 1];
    });
    sheet.getRange(2, 1, rows.length, 8).setValues(rows);
    CacheService.getScriptCache().remove(TIER_CONFIG_CACHE_KEY_);

    // ⚡ แก้ (1/9/69) — auto-migrate: หา "ระดับเดียวกัน" ของเดิม/ใหม่ด้วย 2 หลักเรียงลำดับความน่าเชื่อถือ:
    // หลักที่ 1 (แม่นกว่า) เทียบด้วย "ยอดซื้อขั้นต่ำ (minSpend)" เดิม เพราะค่านี้มักไม่เปลี่ยนตอนแค่เปลี่ยนชื่อ/key
    // — ถ้า minSpend เดิมตรงกับ tier ใหม่ตัวไหนเป๊ะ ถือว่าเป็นระดับเดียวกันแน่นอน ไม่สนใจว่าตำแหน่งจะสลับ/ขยับหรือไม่
    // หลักที่ 2 (สำรอง) ถ้าหา minSpend ตรงกันไม่เจอเลย (เช่น แก้ minSpend พร้อมกันด้วย) ค่อย fallback ไปเทียบตาม
    // "ตำแหน่งลำดับ" เดิม (แถวที่ N เดิม กับแถวที่ N ใหม่) แทน — จุดอ่อนของหลักนี้คือถ้ามีการสลับลำดับ/แทรก-ลบ
    // ระดับตรงกลางพร้อมกับเปลี่ยน key ในการบันทึกครั้งเดียวกัน อาจจับคู่ผิดได้ จึงให้ minSpend เป็นหลักหลักเสมอ
    var newTiersForMigration_ = tiers.map(function (t) {
      return { key: String(t.key || '').trim(), minSpend: parseFloat(t.minSpend) || 0 };
    });
    var tierKeyMigrationMap_ = {};
    oldTiersForMigration_.forEach(function (oldTier_, oi_) {
      if (!oldTier_.key) return;
      var matched_ = newTiersForMigration_.find(function (t) { return t.minSpend === oldTier_.minSpend; });
      if (!matched_ && oi_ < newTiersForMigration_.length) matched_ = newTiersForMigration_[oi_];
      if (matched_ && matched_.key && matched_.key !== oldTier_.key) {
        tierKeyMigrationMap_[oldTier_.key] = matched_.key;
      }
    });
    if (Object.keys(tierKeyMigrationMap_).length) {
      migrateMemberTierKeys_(tierKeyMigrationMap_);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ⚡ เพิ่ม (1/9/69) — แก้คอลัมน์ Tier (G) ของสมาชิกที่ยังอ้างอิง key เดิม (จาก keyMap: {oldKey: newKey})
// ให้ตรงกับ key ใหม่ทันที ป้องกันปัญหา Tier หายเมื่อ Login หลังแก้ไข Tier_Config
function migrateMemberTierKeys_(keyMap) {
  try {
    var sheet = ensureMembersSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var range = sheet.getRange(2, 7, lastRow - 1, 1);
    var values = range.getValues();
    var changed = false;
    for (var vi = 0; vi < values.length; vi++) {
      var v_ = String(values[vi][0] || '').trim();
      if (keyMap.hasOwnProperty(v_)) {
        values[vi][0] = keyMap[v_];
        changed = true;
      }
    }
    if (changed) range.setValues(values);
  } catch (e) {
    Logger.log('migrateMemberTierKeys_ ล้มเหลว: ' + e.toString());
  }
}

function updateSignupBonus(pin, points) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var p = parseInt(points);
    if (isNaN(p) || p < 0) return { success: false, error: 'จำนวนแต้มไม่ถูกต้อง' };
    PropertiesService.getScriptProperties().setProperty('SIGNUP_BONUS_POINTS', String(p));
    CacheService.getScriptCache().remove(SIGNUP_BONUS_CACHE_KEY_);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ⚡ เพิ่ม (29/9/69) — 'price' = ขายราคาพิเศษต่อชิ้น (กำหนดราคาขายเป็นตัวเลข เช่น ปกติ 500 ขาย 300) ต้องเลือกสินค้า
// ⚡ เพิ่ม (29/9/69) — 'ship_price' = ค่าส่งราคาพิเศษ (ลูกค้าจ่ายค่าส่งตามตัวเลขที่กำหนด เช่น 20 บาท ไม่ว่าน้ำหนักเท่าไหร่)
var VALID_PRIVILEGE_TYPES_ = ['percent', 'fixed', 'bogo', 'ship_percent', 'ship_fixed', 'price', 'ship_price'];
function getSignupPrivilegeConfig_() {
  var fallback = { enabled: false, name: '', type: 'percent', value: 0, expiryDays: 0, expiryDate: '', restriction: '', freeProduct: '', freeQty: 0, freeDiscountPercent: '', startDate: '', endDate: '' };
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
      // ⚡ เพิ่ม (4/10/69) — ส่วนลดชิ้นถัดไป % ของ bogo (ว่าง = 100% แถมฟรี)
      freeDiscountPercent: (cfg.freeDiscountPercent === undefined || cfg.freeDiscountPercent === null) ? '' : cfg.freeDiscountPercent,
      // ⚡ เพิ่ม (25/8/69) — ช่วงวันเริ่ม-สิ้นสุดของ "โปรนี้" (ตอนรับสมัครสมาชิกใหม่) เว้นว่างทั้งคู่ = ใช้ได้
      // ตลอดไม่มีกำหนด — คนละเรื่องกับ expiryDate ด้านบนที่คือวันหมดอายุของสิทธิ์ที่สมาชิกแต่ละคนได้รับไปแล้ว
      startDate: String(cfg.startDate || ''),
      endDate: String(cfg.endDate || '')
    };
  } catch (e) {
    return fallback;
  }
}

function updateSignupPrivilegeConfig(pin, enabled, name, type, value, expiryDays, expiryDate, restriction, freeProduct, freeQty, startDate, endDate, freeDiscountPercent) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var isEnabled = (enabled === true || enabled === 'true');
    var nameValue = String(name || '').trim();
    var typeValue = VALID_PRIVILEGE_TYPES_.indexOf(type) !== -1 ? type : 'percent';
    if (isEnabled) {
      if (!nameValue) return { success: false, error: 'กรุณากรอกชื่อสิทธิ์' };
      if (value === '' || value === null || value === undefined || isNaN(parseFloat(value))) return { success: false, error: 'กรุณากรอกมูลค่า (หรือจำนวนที่ต้องซื้อครบ ถ้าเป็นโปรซื้อครบแถม)' };
      if (bogoNeedsFreeProduct_(typeValue, freeDiscountPercent, freeProduct)) return { success: false, error: 'กรุณาเลือกสินค้าที่จะแถม' };
    }
    if (startDate && endDate && startDate > endDate) return { success: false, error: 'วันเริ่มโปรต้องมาก่อนวันสิ้นสุด' };
    var cfg = {
      enabled: isEnabled,
      name: nameValue,
      type: typeValue,
      value: parseFloat(value) || 0,
      expiryDays: parseInt(expiryDays) || 0,
      expiryDate: String(expiryDate || '').trim(),
      restriction: String(restriction || '').trim(),
      freeProduct: typeValue === 'bogo' ? String(freeProduct || '').trim() : '',
      freeQty: couponFreeQtyCell_(typeValue, freeQty) || 0,
      // หน้าแอดมินรุ่นเก่าที่ไม่ส่งค่านี้มา = คงค่าเดิม
      freeDiscountPercent: (freeDiscountPercent === undefined || freeDiscountPercent === null)
        ? signupDiscountCell_(typeValue, getSignupPrivilegeConfig_().freeDiscountPercent) : signupDiscountCell_(typeValue, freeDiscountPercent),
      startDate: String(startDate || '').trim(),
      endDate: String(endDate || '').trim()
    };
    PropertiesService.getScriptProperties().setProperty('SIGNUP_PRIVILEGE_CONFIG', JSON.stringify(cfg));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ⚡ เพิ่ม — ปิด/เปิดใช้งานสิทธิ์ต้อนรับสมาชิกใหม่แบบเดี่ยว (legacy) โดยแก้เฉพาะ enabled เท่านั้น
// ไม่แตะฟิลด์อื่น (name/type/value/freeProduct ฯลฯ) ต่างจาก updateSignupPrivilegeConfig() ด้านบนที่ต้อง
// รับค่าทุกฟิลด์มาจากฟอร์มแก้ไขพร้อมกัน — ถ้าฟอร์มยังโหลด checkbox สินค้าที่แถมไม่ทันตอนกดปิดใช้งานเร็วๆ
// อาจทำให้ freeProduct ถูกบันทึกเป็นค่าว่างไปด้วยโดยไม่ตั้งใจ ฟังก์ชันนี้จึงปลอดภัยกว่าเวลาแค่ต้องการปิด/เปิด
function toggleSignupPrivilegeConfigEnabled(pin, enabled) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var cfg = getSignupPrivilegeConfig_();
    cfg.enabled = (enabled === true || enabled === 'true');
    PropertiesService.getScriptProperties().setProperty('SIGNUP_PRIVILEGE_CONFIG', JSON.stringify(cfg));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==================== แลกคะแนนเป็นส่วนลดเงินสด (ตั้งค่าได้จากหน้า Admin) ====================
// ⚡ เพิ่ม (19/8/69) — นอกจาก "ของรางวัลแลกคะแนน" (Rewards_Catalog — รายการตายตัวที่ admin กำหนดไว้ล่วงหน้า
// เช่น "คูปองลด 50 บาท" ใช้ 150 คะแนน) แล้ว เพิ่มกลไกใหม่ที่ยืดหยุ่นกว่า: ให้ลูกค้า "พิมพ์จำนวนคะแนนที่จะ
// แลกเอง" ที่หน้าชำระเงินได้เลย แปลงเป็นส่วนลดเงินสดตามอัตราที่ตั้งไว้ (ค่าเริ่มต้น 1 คะแนน = 1 บาท) เก็บเป็น
// JSON ก้อนเดียวใน Script Properties แบบเดียวกับ SIGNUP_PRIVILEGE_CONFIG ด้านบน
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

function updatePointsRedeemConfig(pin, enabled, pointsPerBaht, minRedeem, maxRedeemPerOrder) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var isEnabled = (enabled === true || enabled === 'true');
    var rate = parseFloat(pointsPerBaht);
    if (isEnabled && (!rate || rate <= 0)) return { success: false, error: 'กรุณากรอกอัตราแลก (กี่คะแนนต่อ 1 บาท) ให้ถูกต้อง มากกว่า 0' };
    var cfg = {
      enabled: isEnabled,
      pointsPerBaht: rate > 0 ? rate : 1,
      minRedeem: parseInt(minRedeem) || 0,
      maxRedeemPerOrder: parseInt(maxRedeemPerOrder) || 0
    };
    PropertiesService.getScriptProperties().setProperty('POINTS_REDEEM_CONFIG', JSON.stringify(cfg));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// คำนวณส่วนลดเงินสดจากคะแนนที่ลูกค้าต้องการแลก พร้อมตรวจสอบเงื่อนไขทั้งหมดให้ครบในจุดเดียว (เปิดใช้งานอยู่
// ไหม/ครบขั้นต่ำไหม/เกินเพดานต่อออเดอร์ไหม/พอกับคะแนนที่มีอยู่จริงไหม/เกินยอดที่ต้องจ่ายไหม) เรียกใช้ร่วมกัน
// ทั้ง checkShopDiscounts (แสดงตัวอย่างตอนดูหน้าชำระเงิน) และ createShopOrder (คำนวณจริงตอนยืนยันสั่งซื้อ)
// กันตรรกะเพี้ยนไปคนละแบบ — maxPayable คือยอดสูงสุดที่ส่วนลดนี้จะลดได้ (ยอดที่เหลือต้องจ่ายหลังหักส่วนลด/
// สิทธิ์/โปรอื่นๆ ทั้งหมดไปแล้ว กันลดจนติดลบ) คืนค่า { discount, pointsUsed, error } — ถ้ามี error (ไม่ว่าง)
// แปลว่าใช้ไม่ได้เลย ส่วนกรณีที่เกินคะแนนคงเหลือจะไม่ปรับลดให้เอง เพื่อไม่ให้ลูกค้าเข้าใจว่าระบบรับจำนวนที่กรอก
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

// ==================== ⚡ เพิ่ม (23/8/69) — สิทธิ์ต้อนรับสมาชิกใหม่ "หลายรายการพร้อมกัน" ====================
// ==================== ⚡ เพิ่ม (19/9/69) — ชำระเงินแบบเก็บเงินปลายทาง (COD) ====================
// การรับรู้ยอด (ตกลงกันไว้):
//   • "ยอดขาย" รับรู้ทันทีที่ลูกค้ากดสั่งซื้อ — เขียนคอลัมน์ AE "วันที่ชำระเงิน" = วันที่สั่งซื้อไปเลย เหมือน
//     ออเดอร์โอนเงินที่แนบสลิปแล้ว เพื่อให้รายงานยอดขายรายวันนับออเดอร์นี้ตั้งแต่วันที่สั่ง และรายการพิมพ์
//     ใบจัดส่ง (Revenue Spunky Online ซึ่งกรองเฉพาะออเดอร์ที่มีวันที่ชำระเงิน) เห็นออเดอร์นี้ได้ทันที
//     — วันที่สั่งซื้อจริงยังดูได้จากคอลัมน์ W (Order Date) และ B (Timestamp) เหมือนเดิมทุกออเดอร์
//   • "เงินเข้าจริง" รับรู้ทีหลัง ตอนแอดมินกดยืนยันว่าเก็บเงินได้แล้ว — เก็บแยกที่คอลัมน์ใหม่ 2 ช่อง
//       AG (33) = สถานะเก็บเงินปลายทาง (รอเก็บเงิน / เก็บเงินแล้ว / ตีกลับ)
//       AH (34) = วันที่ได้รับเงินเก็บเงินปลายทาง
//   • แต้มสะสม / ยอดซื้อสะสม / รางวัลแนะนำเพื่อน จะให้ตอน "เก็บเงินได้จริง" เท่านั้น (ดู confirmCodPayment)
//     ระหว่างรอเก็บเงิน คะแนนที่ลูกค้าเลือกแลกเป็นส่วนลดจะถูก "กันไว้" กับออเดอร์เหมือนออเดอร์ที่รอแนบสลิป
// ค่าที่เขียนลงคอลัมน์ J (Payment) ของชีต Revenue — ใช้คำเดียวกับรายการวิธีชำระเงินมาตรฐานในไฟล์
// Master Data Sales เป๊ะๆ เพื่อให้แดชบอร์ด/รายงานที่จัดกลุ่มตามวิธีชำระเงินนับรวมเป็นก้อนเดียวกันได้
// (ต่างจากช่องทางอื่นของ LINE Shop ที่ต่อท้ายว่า "(LINE Shop)" — ช่องทางขายยังดูได้จากคอลัมน์ Q = Ad อยู่แล้ว)
var COD_PAYMENT_LABEL_ = 'เก็บเงินปลายทาง';
var COD_SLIP_PLACEHOLDER_ = 'เก็บเงินปลายทาง (ไม่มีสลิป)';
var COD_STATUS_PENDING_ = 'รอเก็บเงิน';
var COD_STATUS_PAID_ = 'เก็บเงินแล้ว';
var COD_STATUS_RETURNED_ = 'ตีกลับ';
var COD_STATUS_COL_ = 33;             // ชีต Revenue คอลัมน์ AG
var COD_PAID_DATE_COL_ = 34;          // ชีต Revenue คอลัมน์ AH
var REVENUE_TOTAL_COLS_ = 34;         // จำนวนคอลัมน์ที่ออเดอร์ LINE Shop เขียนลงชีต Revenue (A-AH)
var COD_REMARK_PENDING_ = 'รอเก็บเงินปลายทาง - LINE Shop';
var COD_MEMBER_BLOCK_COL_ = 19;        // ชีต Members คอลัมน์ S
var COD_MEMBER_BLOCK_REASON_COL_ = 20; // ชีต Members คอลัมน์ T

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

// ค่าธรรมเนียมเก็บเงินปลายทาง — คิดจากยอดที่ลูกค้าต้องจ่ายก่อนบวกค่าธรรมเนียม แล้วนำไปบวกรวมกับค่าจัดส่ง
// (คอลัมน์ H) เพื่อให้ Amount + Delivery = Bill Total เหมือนออเดอร์ปกติทุกประการ ไม่ทำให้รายงานยอดเพี้ยน
// ตั้งค่าเริ่มต้นไว้ที่ 0 = ไม่เก็บ พฤติกรรมจึงเหมือนเดิมทุกอย่างจนกว่าจะตั้งค่าเอง
function calcCodFee_(amountBeforeFee, cfg) {
  cfg = cfg || getCodConfig_();
  if (!cfg.fee) return 0;
  if (cfg.feeType === 'percent') return Math.round((parseFloat(amountBeforeFee) || 0) * cfg.fee / 100);
  return Math.round(cfg.fee);
}

/**
 * เช็คว่าสมาชิกคนนี้ใช้ "เก็บเงินปลายทาง" กับยอดนี้ได้ไหม — ใช้ร่วมกัน 2 จุด: ตอนส่งค่าไปให้หน้าร้านตัดสิน
 * ว่าจะโชว์ปุ่มไหม (getShopBootstrap) และตอนสั่งซื้อจริง (createShopOrder) เพื่อกันคนแก้หน้าเว็บส่งค่ามาเอง
 */
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

function getCodConfigForAdmin(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  return { success: true, config: getCodConfig_(), tiers: getTierConfig_() };
}

function updateCodConfig(pin, configJson) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var cfg = normalizeCodConfig_(JSON.parse(configJson || '{}'));
    PropertiesService.getScriptProperties().setProperty(COD_CONFIG_PROP_, JSON.stringify(cfg));
    try { CacheService.getScriptCache().remove(COD_CONFIG_CACHE_KEY_); } catch (e) {}
    return { success: true, config: cfg };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ---------- บล็อกเก็บเงินปลายทางรายบุคคล (ชีต Members คอลัมน์ S/T) ----------
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

function setMemberCodBlock_(lineUid, blocked, reason) {
  var uid = String(lineUid || '').trim();
  if (!uid) return false;
  var rowIndex = findMemberRowIndex_(uid);
  if (rowIndex === -1) return false;
  var sheet = ensureMembersSheet_();
  var note = blocked
    ? (String(reason || 'ระงับโดยแอดมิน') + ' (' + Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm') + ')')
    : '';
  sheet.getRange(rowIndex, COD_MEMBER_BLOCK_COL_, 1, 2).setValues([[blocked ? true : false, note]]);
  return true;
}

function setMemberCodBlock(pin, lineUid, blocked, reason) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var willBlock = (blocked === true || String(blocked) === 'true');
    if (!setMemberCodBlock_(lineUid, willBlock, reason)) return { success: false, error: 'ไม่พบสมาชิกคนนี้ในระบบ' };
    return { success: true, status: getMemberCodBlock_(lineUid) };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
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

// ⚡ เพิ่ม (4/10/69) — สิทธิ์ต้อนรับสมาชิกใหม่แบบ "ซื้อครบ X ชิ้น ชิ้นถัดไปลด Y%" เก็บส่วนลด % ในคอลัมน์ท้ายชีต
// Signup_Privileges (หาจากชื่อหัวคอลัมน์ เพราะคอลัมน์ 13-14 โปรเจกต์แจ้งเตือนใช้อยู่) แล้วคัดลอกไปคอลัมน์ 15
// ของ Member_Privileges ตอนแจก — ว่าง = 100% แถมฟรีเหมือนเดิม
var SIGNUP_ITEM_DISCOUNT_HEADER_ = 'ส่วนลดชิ้นถัดไป(%)(เฉพาะ bogo — เว้นว่าง=100% ฟรี)';
function signupItemDiscountCol_(sheet, create) {
  var width = Math.max(sheet.getLastColumn(), 12);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var c = header.indexOf(SIGNUP_ITEM_DISCOUNT_HEADER_) + 1;
  if (!c && create) { c = width + 1; sheet.getRange(1, c).setValue(SIGNUP_ITEM_DISCOUNT_HEADER_); }
  return c;
}
// ค่าที่เก็บ: เฉพาะ bogo ที่กรอกส่วนลดไว้ (ว่าง = แถมฟรี 100%)
function signupDiscountCell_(type, freeDiscountPercent) {
  if (type !== 'bogo' || freeDiscountPercent === '' || freeDiscountPercent === null || freeDiscountPercent === undefined) return '';
  var n = parseFloat(freeDiscountPercent);
  return isNaN(n) ? '' : Math.max(0, Math.min(100, n));
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

function createSignupPrivilegeItem(pin, name, type, value, expiryDays, restriction, freeProduct, freeQty, minPurchase, startDate, endDate, notifyLine, freeDiscountPercent) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    name = String(name || '').trim();
    if (!name) return { success: false, error: 'กรุณากรอกชื่อสิทธิ์' };
    if (value === '' || value === null || value === undefined || isNaN(parseFloat(value))) return { success: false, error: 'กรุณากรอกมูลค่า (หรือจำนวนที่ต้องซื้อครบ ถ้าเป็นโปรซื้อครบแถม)' };
    var typeValue = VALID_PRIVILEGE_TYPES_.indexOf(type) !== -1 ? type : 'percent';
    if (bogoNeedsFreeProduct_(typeValue, freeDiscountPercent, freeProduct)) return { success: false, error: 'กรุณาเลือกสินค้าที่จะแถม' };
    if (startDate && endDate && startDate > endDate) return { success: false, error: 'วันเริ่มโปรต้องมาก่อนวันสิ้นสุด' };
    ensureSignupPrivilegesSheet_().appendRow([
      name, typeValue, parseFloat(value) || 0, parseInt(expiryDays) || '',
      String(restriction || '').trim(),
      typeValue === 'bogo' ? String(freeProduct || '').trim() : '',
      couponFreeQtyCell_(typeValue, freeQty),
      true, new Date(), parseFloat(minPurchase) || '',
      String(startDate || '').trim(), String(endDate || '').trim()
    ]);
    if (!wantsLineAnnouncement_(notifyLine)) skipLineAnnouncement_(ensureSignupPrivilegesSheet_(), ensureSignupPrivilegesSheet_().getLastRow(), 1);
    var discountCell_ = signupDiscountCell_(typeValue, freeDiscountPercent);
    if (discountCell_ !== '') { var sh_ = ensureSignupPrivilegesSheet_(); sh_.getRange(sh_.getLastRow(), signupItemDiscountCol_(sh_, true)).setValue(discountCell_); }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function updateSignupPrivilegeItem(pin, rowIndex, name, type, value, expiryDays, restriction, freeProduct, freeQty, minPurchase, startDate, endDate, freeDiscountPercent, notifyLine) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    name = String(name || '').trim();
    if (!name) return { success: false, error: 'กรุณากรอกชื่อสิทธิ์' };
    if (value === '' || value === null || value === undefined || isNaN(parseFloat(value))) return { success: false, error: 'กรุณากรอกมูลค่า (หรือจำนวนที่ต้องซื้อครบ ถ้าเป็นโปรซื้อครบแถม)' };
    var typeValue = VALID_PRIVILEGE_TYPES_.indexOf(type) !== -1 ? type : 'percent';
    if (bogoNeedsFreeProduct_(typeValue, freeDiscountPercent, freeProduct)) return { success: false, error: 'กรุณาเลือกสินค้าที่จะแถม' };
    if (startDate && endDate && startDate > endDate) return { success: false, error: 'วันเริ่มโปรต้องมาก่อนวันสิ้นสุด' };
    var sheet = ensureSignupPrivilegesSheet_();
    var ri = parseInt(rowIndex);
    if (!ri || ri < 2 || ri > sheet.getLastRow()) return { success: false, error: 'ไม่พบรายการนี้' };
    sheet.getRange(ri, 1, 1, 7).setValues([[
      name, typeValue, parseFloat(value) || 0, parseInt(expiryDays) || '',
      String(restriction || '').trim(),
      typeValue === 'bogo' ? String(freeProduct || '').trim() : '',
      couponFreeQtyCell_(typeValue, freeQty)
    ]]);
    sheet.getRange(ri, 10).setValue(parseFloat(minPurchase) || '');
    sheet.getRange(ri, 11).setValue(String(startDate || '').trim());
    sheet.getRange(ri, 12).setValue(String(endDate || '').trim());
    // หน้าแอดมินรุ่นเก่าที่ไม่ส่งค่านี้มา (undefined) = ไม่แตะค่าเดิม
    if (freeDiscountPercent !== undefined && freeDiscountPercent !== null) {
      var discountCell_ = signupDiscountCell_(typeValue, freeDiscountPercent);
      var discountCol_ = signupItemDiscountCol_(sheet, discountCell_ !== '');
      if (discountCol_) sheet.getRange(ri, discountCol_).setValue(discountCell_);
    }
    if (notifyLine === true || notifyLine === 'true') requestLineAnnouncement_(sheet, ri, 1, false);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function listSignupPrivilegeItems(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensureSignupPrivilegesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
    var discountCol_ = signupItemDiscountCol_(sheet);
    var discountVals_ = discountCol_ ? sheet.getRange(2, discountCol_, lastRow - 1, 1).getValues() : [];
    var results = data.map(function (row, idx) {
      return {
        freeDiscountPercent: discountVals_[idx] ? discountVals_[idx][0] : '',
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

function toggleSignupPrivilegeItem(pin, rowIndex, active) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    ensureSignupPrivilegesSheet_().getRange(parseInt(rowIndex), 8).setValue(active === true || active === 'true');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==================== ⚡ เพิ่ม (25/8/69) — ระบบแนะนำเพื่อน (MGM: Member-Get-Member) ====================
// แนวคิด: ใช้ "รหัสสมาชิก" (memberCode เช่น EM-20260825001) ที่มีอยู่แล้วเป็นรหัสแนะนำเพื่อนไปเลย ไม่ต้อง
// สร้างรหัสใหม่ซ้ำซ้อน — ลูกค้าเก่าแชร์ลิงก์ที่มี ?ref=รหัสสมาชิกของตัวเอง ต่อท้าย ให้เพื่อนเปิดสมัคร
//
// การตรวจสอบว่า "ใครแนะนำใคร": ตอนสมัครสมาชิกใหม่ (registerMember) ถ้ามี referrerCode ส่งมาด้วย ระบบจะ
// หาสมาชิกที่มี memberCode ตรงกัน แล้วบันทึก LINE UID ของคนแนะนำไว้ในคอลัมน์ 14 ของสมาชิกใหม่ทันที
// (ตรวจสอบจากรหัสสมาชิกที่มีอยู่แล้วในระบบ ไม่ใช่การเดา/พิมพ์ชื่อเอง จึงมั่นใจได้ว่าตรงตัวจริง)
//
// การให้รางวัล เลือกได้ 2 แบบ (ตั้งค่าได้ในหน้า Admin):
// 1) rewardTrigger = 'signup' — ให้รางวัลทันทีตอนเพื่อนสมัครเสร็จ (เร็ว แต่เสี่ยงคนปลอมสมัครหลายบัญชี)
// 2) rewardTrigger = 'first_purchase' — ให้รางวัลก็ต่อเมื่อเพื่อนที่ถูกแนะนำ "สั่งซื้อสำเร็จครั้งแรก" เท่านั้น
//    (ตรวจสอบจากออเดอร์จริงในชีต Revenue ของเพื่อนคนนั้น ป้องกันการปลอมยอดแนะนำได้ดีกว่า) และเลือกได้ว่า
//    ต้องซื้อสินค้าเฉพาะ (restriction) หรือซื้อสินค้าอะไรก็ได้ (เว้นว่าง) ถึงจะนับ พร้อมยอดซื้อขั้นต่ำได้ด้วย
//
// เลือกได้ว่าจะให้รางวัลใคร (rewardTarget): 'referrer' (คนแนะนำ) / 'referred' (คนที่ถูกแนะนำ) / 'both' (ทั้งคู่)
// รางวัลแต่ละฝ่ายแยกตั้งค่าได้อิสระ เป็นได้ทั้ง "แต้มสะสม" และ/หรือ "ส่วนลด" (percent/fixed) พร้อมกัน
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

function updateReferralConfig(pin, enabled, rewardTrigger, rewardTarget, referrerPoints, referrerDiscountType, referrerDiscountValue, referredPoints, referredDiscountType, referredDiscountValue, minPurchase, restriction, discountExpiryDays, startDate, endDate) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var cfg = {
      enabled: (enabled === true || enabled === 'true'),
      rewardTrigger: rewardTrigger === 'first_purchase' ? 'first_purchase' : 'signup',
      rewardTarget: ['referrer', 'referred', 'both'].indexOf(rewardTarget) !== -1 ? rewardTarget : 'both',
      referrerPoints: parseInt(referrerPoints) || 0,
      referrerDiscountType: (referrerDiscountType === 'percent' || referrerDiscountType === 'fixed') ? referrerDiscountType : '',
      referrerDiscountValue: parseFloat(referrerDiscountValue) || 0,
      referredPoints: parseInt(referredPoints) || 0,
      referredDiscountType: (referredDiscountType === 'percent' || referredDiscountType === 'fixed') ? referredDiscountType : '',
      referredDiscountValue: parseFloat(referredDiscountValue) || 0,
      minPurchase: parseFloat(minPurchase) || 0,
      restriction: String(restriction || '').trim(),
      discountExpiryDays: parseInt(discountExpiryDays) || 0,
      startDate: String(startDate || '').trim(),
      endDate: String(endDate || '').trim()
    };
    PropertiesService.getScriptProperties().setProperty('REFERRAL_CONFIG', JSON.stringify(cfg));
    try { CacheService.getScriptCache().remove(REFERRAL_CONFIG_CACHE_KEY_); } catch (e4) {}
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getReferralConfigForAdmin(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  return { success: true, config: getReferralConfig_() };
}

// ⚡ เพิ่ม (25/8/69) — เอ็นด์พอยต์สาธารณะ (ไม่ต้องใช้ PIN) ให้หน้าสมัครสมาชิกเรียกเช็คได้ว่าระบบแนะนำเพื่อน
// สมัครสมาชิกเปิดอยู่หรือไม่ เพื่อซ่อน/โชว์ช่องกรอก "รหัสผู้แนะนำ" ในฟอร์มสมัครให้ตรงกับสถานะจริง — คืนค่า
// แค่ true/false เท่านั้น ไม่เปิดเผยรายละเอียดรางวัล/เงื่อนไขอื่นใดที่อาจเป็นข้อมูลอ่อนไหวทางธุรกิจ
function getReferralPublicStatus() {
  var cfg = getReferralConfig_();
  return { success: true, enabled: cfg.enabled && isDateRangeActive_(cfg.startDate, cfg.endDate) };
}

// หาแถวสมาชิกจากรหัสสมาชิก (memberCode) — ใช้ตอนสมัครใหม่/ใส่รหัสแนะนำเพื่อยืนยันว่ารหัสที่ส่งมาเป็นของ
// สมาชิกจริงในระบบ ⚡ เพิ่ม (25/8/69) — cache ผลลัพธ์แบบเดียวกับ findMemberRowIndex_ (600 วิ) เพราะฟังก์ชันนี้
// ถูกเรียกทุกครั้งที่มีคนสมัครสมาชิก/สั่งซื้อพร้อมกรอกรหัสแนะนำ ไม่งั้นต้องอ่านทั้งคอลัมน์รหัสสมาชิกซ้ำทุกครั้ง
// ซึ่งจะช้าลงเรื่อยๆ เมื่อจำนวนสมาชิกเพิ่มขึ้น
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

function ensureReferralLogSheet_() {
  if (_sheetCache_.referralLog) return _sheetCache_.referralLog;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Referral_Log');
  if (!sheet) {
    sheet = ss.insertSheet('Referral_Log');
    sheet.appendRow(['วันที่แนะนำสำเร็จ', 'ผู้แนะนำ(LINE UID)', 'ชื่อผู้แนะนำ', 'รหัสผู้แนะนำ', 'เพื่อนที่ถูกแนะนำ(LINE UID)', 'ชื่อเพื่อน', 'สถานะให้รางวัล', 'วันที่ให้รางวัล', 'รายละเอียดรางวัล']);
  }
  _sheetCache_.referralLog = sheet;
  return sheet;
}

// ให้รางวัล (แต้ม +/- ส่วนลด) แก่สมาชิกคนหนึ่ง ใช้ร่วมกันได้ทั้งฝั่งผู้แนะนำและเพื่อนที่ถูกแนะนำ
function grantReferralRewardToMember_(lineUid, points, discountType, discountValue, discountExpiryDays, reasonLabel) {
  var parts = [];
  try {
    if (points > 0) {
      var rowIndex = findMemberRowIndex_(lineUid);
      if (rowIndex !== -1) {
        var sheet = ensureMembersSheet_();
        var current = parseInt(sheet.getRange(rowIndex, 6).getValue()) || 0;
        var updated = current + points;
        sheet.getRange(rowIndex, 6).setValue(updated);
        logPointsTransaction_(lineUid, 'adjust_add', reasonLabel + ' (+' + points + ' แต้ม)', points, updated);
        parts.push('+' + points + ' แต้ม');
      }
    }
    if (discountType && discountValue > 0) {
      var expiry = expiryFromDays_(new Date(), discountExpiryDays);
      ensurePrivilegesSheet_().appendRow([
        lineUid, reasonLabel, discountType, discountValue, expiry || '', 'ระบบแนะนำเพื่อน (อัตโนมัติ)', new Date(), true, false, '',
        '', '', '', ''
      ]);
      parts.push(discountType === 'percent' ? ('ลด ' + discountValue + '%') : ('ลด ' + discountValue + ' บาท'));
    }
  } catch (e) {
    Logger.log('grantReferralRewardToMember_ error: ' + e.toString());
  }
  return parts.join(' + ');
}

// เรียกตอนสมัครสมาชิกใหม่ (ใน registerMember) — ตรวจสอบรหัสผู้แนะนำ บันทึกความสัมพันธ์ และถ้าทริกเกอร์เป็น
// "ตอนสมัคร" ก็ให้รางวัลทันที คืนค่า LINE UID ของผู้แนะนำ (หรือ '' ถ้าไม่มี/รหัสไม่ถูกต้อง) ให้ registerMember
// เก็บไปบันทึกลงแถวสมาชิกใหม่ที่กำลังจะสร้าง
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

// เรียกหลังสมัครสมาชิกใหม่สำเร็จแล้ว (มี LINE UID ของสมาชิกใหม่แน่นอนแล้ว) — ให้รางวัลทันทีถ้าทริกเกอร์เป็น
// "ตอนสมัคร" แล้วบันทึกลง Referral_Log ไว้ดูในหน้า Admin ด้วย
function grantReferralRewardOnSignupIfNeeded_(referrerUid, referrerName, newMemberUid, newMemberName) {
  if (!referrerUid) return;
  var cfg = getReferralConfig_();
  if (!cfg.enabled || cfg.rewardTrigger !== 'signup' || !isDateRangeActive_(cfg.startDate, cfg.endDate)) return;

  var rewardDetailParts = [];
  if (cfg.rewardTarget === 'referrer' || cfg.rewardTarget === 'both') {
    var d1 = grantReferralRewardToMember_(referrerUid, cfg.referrerPoints, cfg.referrerDiscountType, cfg.referrerDiscountValue, cfg.discountExpiryDays, 'แนะนำเพื่อนสำเร็จ: ' + (newMemberName || 'เพื่อนใหม่'));
    if (d1) rewardDetailParts.push('ผู้แนะนำได้ ' + d1);
  }
  if (cfg.rewardTarget === 'referred' || cfg.rewardTarget === 'both') {
    var d2 = grantReferralRewardToMember_(newMemberUid, cfg.referredPoints, cfg.referredDiscountType, cfg.referredDiscountValue, cfg.discountExpiryDays, 'สมัครผ่านการแนะนำของเพื่อน');
    if (d2) rewardDetailParts.push('เพื่อนใหม่ได้ ' + d2);
  }

  try {
    ensureMembersSheet_(); // เผื่อยังไม่เคย ensure คอลัมน์ 15
    var newMemberRowIdx = findMemberRowIndex_(newMemberUid);
    if (newMemberRowIdx !== -1) ensureMembersSheet_().getRange(newMemberRowIdx, 15).setValue(true);
  } catch (e) {}

  try {
    ensureReferralLogSheet_().appendRow([
      new Date(), referrerUid, referrerName || '', '', newMemberUid, newMemberName || '',
      'ให้รางวัลแล้ว (ตอนสมัคร)', new Date(), rewardDetailParts.join(' | ') || '(ไม่มีรางวัลตั้งค่าไว้)'
    ]);
  } catch (e) {
    Logger.log('grantReferralRewardOnSignupIfNeeded_: บันทึก log ไม่สำเร็จ: ' + e.toString());
  }
}

// ⚡ ตรวจสอบตอนลูกค้าสั่งซื้อสำเร็จ (เรียกจาก createShopOrder เส้นทางยอด 0 บาท และ uploadShopSlip เส้นทาง
// ยอด >0 บาทที่แนบสลิปแล้ว) — เช็คว่า:
// 1) ลูกค้าคนนี้มีคนแนะนำ (คอลัมน์ 14 ไม่ว่าง) และยังไม่เคยได้รับรางวัลแนะนำเพื่อน (คอลัมน์ 15 = FALSE)
// 2) ระบบเปิดใช้งาน + ทริกเกอร์ตั้งเป็น "ซื้อครั้งแรก" (ถ้าตั้งเป็น "ตอนสมัคร" แล้ว จะให้ไปแล้วตั้งแต่ตอน
//    สมัคร ไม่ต้องเช็คซ้ำตรงนี้)
// 3) ยอดซื้อและสินค้าที่ซื้อเข้าเงื่อนไข (ยอดขั้นต่ำ + สินค้าเฉพาะถ้าตั้งไว้ — เว้นว่าง = สินค้าอะไรก็ได้)
// ถ้าผ่านทุกเงื่อนไข ให้รางวัลตามที่ตั้งค่าไว้ แล้วปิดธงกันให้ซ้ำ
function checkAndGrantReferralOnFirstPurchase_(buyerUid, orderTotal, items) {
  try {
    var cfg = getReferralConfig_();
    if (!cfg.enabled || cfg.rewardTrigger !== 'first_purchase' || !isDateRangeActive_(cfg.startDate, cfg.endDate)) return;

    var rowIndex = findMemberRowIndex_(buyerUid);
    if (rowIndex === -1) return;
    var row = ensureMembersSheet_().getRange(rowIndex, 1, 1, 15).getValues()[0];
    var referrerUid = String(row[13] || '').trim();
    var alreadyRewarded = row[14] === true || String(row[14]).toUpperCase() === 'TRUE';
    if (!referrerUid || alreadyRewarded) return;

    if (cfg.minPurchase > 0 && (orderTotal || 0) < cfg.minPurchase) return;
    if (cfg.restriction) {
      var eligible = computeEligibleInfo_(items || [], cfg.restriction);
      if (eligible.qty <= 0) return; // ไม่ได้ซื้อสินค้าที่กำหนดไว้ ยังไม่เข้าเงื่อนไข รอบิลถัดไป
    }

    var referrerRowIndex = findMemberRowIndex_(referrerUid);
    var referrerName = '';
    if (referrerRowIndex !== -1) {
      var referrerRow = ensureMembersSheet_().getRange(referrerRowIndex, 1, 1, 10).getValues()[0];
      referrerName = referrerRow[9] || referrerRow[1] || '';
    }
    var newMemberName = row[9] || row[1] || '';

    var rewardDetailParts = [];
    if (cfg.rewardTarget === 'referrer' || cfg.rewardTarget === 'both') {
      var d1 = grantReferralRewardToMember_(referrerUid, cfg.referrerPoints, cfg.referrerDiscountType, cfg.referrerDiscountValue, cfg.discountExpiryDays, 'เพื่อนที่แนะนำซื้อของสำเร็จ: ' + (newMemberName || 'เพื่อน'));
      if (d1) rewardDetailParts.push('ผู้แนะนำได้ ' + d1);
    }
    if (cfg.rewardTarget === 'referred' || cfg.rewardTarget === 'both') {
      var d2 = grantReferralRewardToMember_(buyerUid, cfg.referredPoints, cfg.referredDiscountType, cfg.referredDiscountValue, cfg.discountExpiryDays, 'ซื้อของครั้งแรกผ่านการแนะนำ');
      if (d2) rewardDetailParts.push('เพื่อนใหม่ได้ ' + d2);
    }

    ensureMembersSheet_().getRange(rowIndex, 15).setValue(true);

    ensureReferralLogSheet_().appendRow([
      new Date(), referrerUid, referrerName, '', buyerUid, newMemberName,
      'ให้รางวัลแล้ว (ซื้อของครั้งแรก)', new Date(), rewardDetailParts.join(' | ') || '(ไม่มีรางวัลตั้งค่าไว้)'
    ]);
  } catch (e) {
    Logger.log('checkAndGrantReferralOnFirstPurchase_ error: ' + e.toString());
  }
}

// รายการแนะนำเพื่อนทั้งหมด (ใครแนะนำใคร + สถานะรางวัล) ให้แอดมินดูภาพรวมในแท็บ MGM
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

// ==================== ⚡ เพิ่ม (25/8/69) — ระบบแนะนำเพื่อนซื้อสินค้า (Purchase Referral) ====================
// แยกอิสระจากระบบ "แนะนำเพื่อนสมัครสมาชิก" ด้านบนโดยสิ้นเชิง — ใช้สำหรับกรณีที่ "ทั้งคู่เป็นสมาชิกอยู่แล้ว"
// (A แนะนำ B ที่เป็นสมาชิกอยู่แล้วให้มาซื้อสินค้า ไม่ใช่แนะนำให้สมัครใหม่) ตรวจสอบจาก: ตอนลูกค้า (B) กำลัง
// จะชำระเงิน จะมีช่องให้กรอก "รหัสสมาชิกของเพื่อนที่แนะนำ" (เหมือนกรอกโค้ดส่วนลด) ระบบเช็คว่ารหัสนั้นเป็น
// สมาชิกจริงในระบบ และไม่ใช่รหัสของตัวเอง แล้วผูกรหัสนี้ไว้กับออเดอร์นั้น (เก็บไว้ในหมายเหตุของบิล) พอบิล
// นั้น "ซื้อสำเร็จจริง" (ยอด 0 บาทเสร็จทันที หรือแนบสลิปแล้ว) ถึงจะให้รางวัลตามเงื่อนไข ป้องกันการปลอมยอด
//
// โหมดความถี่การให้รางวัล เลือกได้ 3 แบบ (แอดมินเลือกเองได้ตามที่ต้องการ เผื่อใช้กระตุ้นยอดขายได้หลายรูปแบบ):
// - once_per_pair: ให้รางวัลแค่ครั้งแรกที่คู่ A-B นี้ใช้รหัสร่วมกัน (กันสมาชิก 2 คนสลับกันกดหาแต้มไม่จำกัด)
// - every_purchase: ให้รางวัลทุกครั้งที่ B ซื้อโดยใส่รหัส A (เหมาะกับร้านที่อยากกระตุ้นยอดขายเต็มที่)
// - monthly_limit: จำกัดจำนวนครั้งต่อเดือนต่อคู่ (เช่น สูงสุด 1 ครั้ง/เดือน) แอดมินตั้งจำนวนได้เอง
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

function updatePurchaseReferralConfig(pin, enabled, frequencyMode, monthlyLimitCount, rewardTarget, referrerPoints, referrerDiscountType, referrerDiscountValue, referredPoints, referredDiscountType, referredDiscountValue, minPurchase, restriction, discountExpiryDays, startDate, endDate) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var validModes = ['once_per_pair', 'every_purchase', 'monthly_limit'];
    var cfg = {
      enabled: (enabled === true || enabled === 'true'),
      frequencyMode: validModes.indexOf(frequencyMode) !== -1 ? frequencyMode : 'once_per_pair',
      monthlyLimitCount: Math.max(1, parseInt(monthlyLimitCount) || 1),
      rewardTarget: ['referrer', 'referred', 'both'].indexOf(rewardTarget) !== -1 ? rewardTarget : 'both',
      referrerPoints: parseInt(referrerPoints) || 0,
      referrerDiscountType: (referrerDiscountType === 'percent' || referrerDiscountType === 'fixed') ? referrerDiscountType : '',
      referrerDiscountValue: parseFloat(referrerDiscountValue) || 0,
      referredPoints: parseInt(referredPoints) || 0,
      referredDiscountType: (referredDiscountType === 'percent' || referredDiscountType === 'fixed') ? referredDiscountType : '',
      referredDiscountValue: parseFloat(referredDiscountValue) || 0,
      minPurchase: parseFloat(minPurchase) || 0,
      restriction: String(restriction || '').trim(),
      discountExpiryDays: parseInt(discountExpiryDays) || 0,
      startDate: String(startDate || '').trim(),
      endDate: String(endDate || '').trim()
    };
    PropertiesService.getScriptProperties().setProperty('PURCHASE_REFERRAL_CONFIG', JSON.stringify(cfg));
    try { CacheService.getScriptCache().remove(PURCHASE_REFERRAL_CONFIG_CACHE_KEY_); } catch (e4) {}
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getPurchaseReferralConfigForAdmin(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  return { success: true, config: getPurchaseReferralConfig_() };
}

// ⚡ เพิ่ม (25/8/69) — เอ็นด์พอยต์สาธารณะ (ไม่ต้องใช้ PIN) ให้หน้าสั่งซื้อสินค้าเรียกเช็คได้ว่าระบบแนะนำเพื่อน
// ซื้อสินค้าเปิดอยู่หรือไม่ (รวมเช็คช่วงวันที่โปรด้วย) เพื่อซ่อน/โชว์ช่องกรอก "รหัสสมาชิกเพื่อนแนะนำ" ที่
// หน้าชำระเงินให้ตรงกับสถานะจริง — คืนค่าแค่ true/false เท่านั้น ไม่เปิดเผยรายละเอียดรางวัล/เงื่อนไขอื่น
function getPurchaseReferralPublicStatus() {
  var cfg = getPurchaseReferralConfig_();
  return { success: true, enabled: cfg.enabled && isDateRangeActive_(cfg.startDate, cfg.endDate) };
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

// นับ (ที่จริงแค่เช็คว่า "เคยมีหรือไม่") ว่าคู่ผู้แนะนำ-ผู้ซื้อคู่นี้เคยได้รับรางวัลไปแล้วหรือยัง — ใช้กับ
// โหมด once_per_pair ⚡ เพิ่ม (25/8/69) — เช็ค cache ก่อนเสมอ (เขียนไว้ตอนให้รางวัลสำเร็จ อายุยาว 6 ชม.
// ซึ่งพอสำหรับกันคู่เดิมมาซื้อซ้ำถี่ๆ) ถ้า cache ไม่มีค่อยไล่อ่านชีตจริง แต่ break ทันทีที่เจอแถวแรกที่ตรง
// (ไม่ต้องอ่านจนจบชีตทุกครั้งเหมือนเดิม เพราะแค่ต้องการรู้ว่า "เคยมีไหม" ไม่ใช่นับให้ครบทุกแถว)
function countPurchaseReferralRewardedPairAllTime_(referrerUid, buyerUid) {
  try {
    var cache = CacheService.getScriptCache();
    var cacheKey = 'prefpair_' + referrerUid.substring(0, 20) + '_' + buyerUid.substring(0, 20);
    if (cache.get(cacheKey)) return 1;

    var sheet = ensurePurchaseReferralLogSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return 0;
    var data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][1]) === referrerUid && String(data[i][4]) === buyerUid && String(data[i][8]) === 'ให้รางวัลแล้ว') {
        try { cache.put(cacheKey, '1', 21600); } catch (e) {}
        return 1;
      }
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

// นับจำนวนครั้งที่คู่นี้ได้รับรางวัลไปแล้ว "ภายในเดือนปฏิทินปัจจุบัน" — ใช้กับโหมด monthly_limit
// ⚡ แก้ (25/8/69) — เปลี่ยนจากอ่านทั้งชีตทุกครั้ง มาเป็นไล่อ่านย้อนจากท้ายชีตเป็นก้อนๆ (chunk) แบบเดียวกับที่
// getMyOrderHistory/getPointsHistory ใช้อยู่แล้วในระบบ เพราะรายการที่เกี่ยวกับ "เดือนนี้" อยู่ท้ายชีตเสมอ
// (เรียงตามเวลาที่เพิ่มเข้ามา) ไม่ต้องไล่อ่านย้อนไปถึงรายการเก่าๆ หลายเดือนก่อนที่ไม่เกี่ยวข้องแล้ว
function countPurchaseReferralRewardedPairThisMonth_(referrerUid, buyerUid) {
  try {
    var sheet = ensurePurchaseReferralLogSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return 0;
    var monthKey = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM');
    var CHUNK_SIZE = 300;
    var MAX_CHUNKS = 10; // ครอบคลุมสูงสุด 3000 แถวล่าสุด พอเผื่อเดือนที่มีรายการเยอะมากๆ
    var count = 0;
    var scanEnd = lastRow;
    var chunkCount = 0;
    var passedThisMonth = false;
    while (scanEnd > 1 && chunkCount < MAX_CHUNKS) {
      var scanStart = Math.max(2, scanEnd - CHUNK_SIZE + 1);
      var chunk = sheet.getRange(scanStart, 1, scanEnd - scanStart + 1, 9).getValues();
      for (var i = chunk.length - 1; i >= 0; i--) {
        var row = chunk[i];
        var d = row[0] ? new Date(row[0]) : null;
        if (!d) continue;
        var rowMonthKey = Utilities.formatDate(d, 'GMT+7', 'yyyy-MM');
        if (rowMonthKey === monthKey) {
          passedThisMonth = true;
          if (String(row[1]) === referrerUid && String(row[4]) === buyerUid && String(row[8]) === 'ให้รางวัลแล้ว') count++;
        } else if (passedThisMonth) {
          // ไล่ย้อนออกนอกเดือนนี้แล้ว (วันที่เก่ากว่าเดือนปัจจุบัน) ไม่ต้องอ่านต่อ หยุดได้เลย
          return count;
        }
      }
      scanEnd = scanStart - 1;
      chunkCount++;
    }
    return count;
  } catch (e) {
    return 0;
  }
}

// กันประมวลผลออเดอร์เดียวกันซ้ำ (เผื่อ uploadShopSlip ถูกเรียกซ้ำ หรือ retry จากฝั่ง client)
// ⚡ แก้ (25/8/69) — เปลี่ยนจากอ่านทั้งคอลัมน์มาเป็น chunk ย้อนจากท้ายชีตเหมือนกัน เพราะออเดอร์ที่กำลังเช็ค
// อยู่ตอนนี้เพิ่งเกิดขึ้นเมื่อครู่ ต้องอยู่ใกล้ท้ายชีตเสมอ ไม่มีทางไปอยู่แถวเก่าๆ ด้านบน
function purchaseReferralAlreadyLoggedForOrder_(orderId) {
  try {
    var sheet = ensurePurchaseReferralLogSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return false;
    var CHUNK_SIZE = 300;
    var MAX_CHUNKS = 10;
    var scanEnd = lastRow;
    var chunkCount = 0;
    while (scanEnd > 1 && chunkCount < MAX_CHUNKS) {
      var scanStart = Math.max(2, scanEnd - CHUNK_SIZE + 1);
      var ids = sheet.getRange(scanStart, 7, scanEnd - scanStart + 1, 1).getValues();
      for (var i = ids.length - 1; i >= 0; i--) {
        if (String(ids[i][0]) === String(orderId)) return true;
      }
      scanEnd = scanStart - 1;
      chunkCount++;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// ⚡ ตรวจสอบและให้รางวัลระบบ "แนะนำเพื่อนซื้อสินค้า" — เรียกตอนออเดอร์ "ซื้อสำเร็จจริง" แล้วเท่านั้น
// (ยอด 0 บาทที่เสร็จทันที หรือแนบสลิปแล้วในเส้นทาง uploadShopSlip) purchaseReferrerCode มาจากรหัสสมาชิกที่
// ผู้ซื้อกรอกไว้ตอนชำระเงิน (เก็บไว้ในหมายเหตุของบิลระหว่างรอสลิป แล้วดึงกลับมาใช้ตรงนี้)
function checkAndGrantPurchaseReferral_(purchaseReferrerCode, buyerUid, orderId, orderTotal, items) {
  try {
    var code = String(purchaseReferrerCode || '').trim();
    if (!code) return;
    var cfg = getPurchaseReferralConfig_();
    if (!cfg.enabled || !isDateRangeActive_(cfg.startDate, cfg.endDate)) return;
    if (purchaseReferralAlreadyLoggedForOrder_(orderId)) return; // กันประมวลผลออเดอร์เดิมซ้ำ

    var referrerRowIndex = findMemberRowByMemberCode_(code);
    if (referrerRowIndex === -1) return; // รหัสไม่ตรงกับสมาชิกคนไหน ไม่ต้องทำอะไร (ไม่ error กันลูกค้าสับสน)
    var referrerRow = ensureMembersSheet_().getRange(referrerRowIndex, 1, 1, 10).getValues()[0];
    var referrerUid = referrerRow[0];
    if (!referrerUid || referrerUid === buyerUid) return; // กันแนะนำตัวเอง
    var referrerName = referrerRow[9] || referrerRow[1] || '';

    if (cfg.minPurchase > 0 && (orderTotal || 0) < cfg.minPurchase) return;
    if (cfg.restriction) {
      var eligible = computeEligibleInfo_(items || [], cfg.restriction);
      if (eligible.qty <= 0) return; // ไม่ได้ซื้อสินค้าที่กำหนดไว้ ไม่เข้าเงื่อนไข
    }

    var buyerRowIndex = findMemberRowIndex_(buyerUid);
    var buyerName = '';
    if (buyerRowIndex !== -1) {
      var buyerRow = ensureMembersSheet_().getRange(buyerRowIndex, 1, 1, 10).getValues()[0];
      buyerName = buyerRow[9] || buyerRow[1] || '';
    }

    // เช็คโหมดความถี่ — ถ้าเกินโควต้าแล้ว บันทึกสถานะ "ไม่ได้รับรางวัล" ไว้เป็นหลักฐาน แต่ไม่ให้รางวัลซ้ำ
    var skipReason = '';
    if (cfg.frequencyMode === 'once_per_pair') {
      if (countPurchaseReferralRewardedPairAllTime_(referrerUid, buyerUid) > 0) skipReason = 'ใช้สิทธิ์ครั้งแรกไปแล้ว (โหมด: ครั้งแรกของคู่นี้เท่านั้น)';
    } else if (cfg.frequencyMode === 'monthly_limit') {
      if (countPurchaseReferralRewardedPairThisMonth_(referrerUid, buyerUid) >= cfg.monthlyLimitCount) skipReason = 'ครบโควต้าเดือนนี้แล้ว (สูงสุด ' + cfg.monthlyLimitCount + ' ครั้ง/เดือน)';
    }
    // frequencyMode === 'every_purchase' ไม่มีการจำกัด ให้รางวัลได้ทุกครั้งที่เข้าเงื่อนไข

    if (skipReason) {
      ensurePurchaseReferralLogSheet_().appendRow([
        new Date(), referrerUid, referrerName, code, buyerUid, buyerName, orderId, orderTotal || 0,
        'ไม่ได้รับรางวัล', skipReason
      ]);
      return;
    }

    var rewardDetailParts = [];
    if (cfg.rewardTarget === 'referrer' || cfg.rewardTarget === 'both') {
      var d1 = grantReferralRewardToMember_(referrerUid, cfg.referrerPoints, cfg.referrerDiscountType, cfg.referrerDiscountValue, cfg.discountExpiryDays, 'แนะนำเพื่อนซื้อสินค้าสำเร็จ: ' + (buyerName || 'เพื่อน'));
      if (d1) rewardDetailParts.push('ผู้แนะนำได้ ' + d1);
    }
    if (cfg.rewardTarget === 'referred' || cfg.rewardTarget === 'both') {
      var d2 = grantReferralRewardToMember_(buyerUid, cfg.referredPoints, cfg.referredDiscountType, cfg.referredDiscountValue, cfg.discountExpiryDays, 'ซื้อสินค้าผ่านการแนะนำของเพื่อน');
      if (d2) rewardDetailParts.push('ผู้ซื้อได้ ' + d2);
    }

    ensurePurchaseReferralLogSheet_().appendRow([
      new Date(), referrerUid, referrerName, code, buyerUid, buyerName, orderId, orderTotal || 0,
      'ให้รางวัลแล้ว', rewardDetailParts.join(' | ') || '(ไม่มีรางวัลตั้งค่าไว้)'
    ]);
    // ⚡ เพิ่ม (25/8/69) — ตั้ง cache flag ทันทีหลังให้รางวัลสำเร็จ กันโหมด once_per_pair ต้องไล่อ่านชีตซ้ำ
    // ตอนคู่นี้มาซื้อซ้ำในอนาคต (ดู countPurchaseReferralRewardedPairAllTime_ ด้านบน)
    try {
      CacheService.getScriptCache().put('prefpair_' + referrerUid.substring(0, 20) + '_' + buyerUid.substring(0, 20), '1', 21600);
    } catch (cacheErr) {}
  } catch (e) {
    Logger.log('checkAndGrantPurchaseReferral_ error: ' + e.toString());
  }
}

// แยกรหัสผู้แนะนำซื้อสินค้าออกจากหมายเหตุของบิล (ที่บันทึกไว้ตอนสร้างออเดอร์) — ใช้ตอน uploadShopSlip
// เพื่อดึงรหัสกลับมาให้รางวัลได้ตอนแนบสลิปสำเร็จ (สำหรับบิลที่ไม่ใช่ยอด 0 บาท)
function parsePurchaseReferrerCodeFromRemark_(remark) {
  var m = String(remark || '').match(/🤝 รหัสแนะนำซื้อ:\s*([^\s|]+)/);
  return m ? m[1].trim() : '';
}

// รายการแนะนำซื้อสินค้าทั้งหมด ให้แอดมินดูในแท็บ MGM (คนละตารางกับแนะนำสมัครสมาชิก)
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


function ensureDebugLogSheet_() {
  if (_sheetCache_.debugLog) return _sheetCache_.debugLog;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Debug_Log');
  if (!sheet) {
    sheet = ss.insertSheet('Debug_Log');
    sheet.appendRow(['เวลา', 'ประเภท(doGet/doPost)', 'action', 'ระยะเวลา(ms)', 'ข้อผิดพลาด(ถ้ามี)']);
  } else if (sheet.getLastColumn() < 5) {
    sheet.getRange(1, 5).setValue('ข้อผิดพลาด(ถ้ามี)');
  }
  _sheetCache_.debugLog = sheet;
  return sheet;
}
// ⚡ แก้ (perf) — เดิมพอคำขอไหนช้าเกิน 2 วินาที ระบบจะ "เปิดสเปรดชีต + appendRow" ต่อท้ายทันทีก่อนส่งคำตอบ
// กลับไปหาลูกค้า เท่ากับไปบวกเวลาเพิ่มอีกหลายร้อย ms ให้กับคำขอที่ช้าอยู่แล้วโดยเฉพาะ (ยิ่งช้ายิ่งโดนลงโทษ
// ซ้ำ) — เปลี่ยนมาพักไว้ใน ScriptProperties ก่อน (เร็วกว่ามาก ไม่ต้องแตะ Sheets API เลย) แล้วค่อยเขียนลงชีต
// ทีเดียวรวดเมื่อสะสมครบ 10 รายการ ข้อมูลที่ได้ในชีต Debug_Log ยังเหมือนเดิมทุกคอลัมน์ แค่มาเป็นชุดแทน
var SLOW_LOG_BUFFER_PROP_ = 'slow_log_buffer_v1';
var SLOW_LOG_FLUSH_SIZE_ = 10;
function logSlowAction_(kind, action, ms) {
  try {
    if (ms < 2000) return;
    var props = PropertiesService.getScriptProperties();
    var buffered = [];
    try { buffered = JSON.parse(props.getProperty(SLOW_LOG_BUFFER_PROP_) || '[]'); } catch (e) {}
    if (!Array.isArray(buffered)) buffered = [];
    buffered.push([new Date().toISOString(), kind, action, ms]);
    if (buffered.length < SLOW_LOG_FLUSH_SIZE_) {
      props.setProperty(SLOW_LOG_BUFFER_PROP_, JSON.stringify(buffered));
      return;
    }
    props.setProperty(SLOW_LOG_BUFFER_PROP_, '[]');
    var sheet = ensureDebugLogSheet_();
    sheet.getRange(sheet.getLastRow() + 1, 1, buffered.length, 4).setValues(buffered.map(function (entry) {
      return [new Date(entry[0]), entry[1], entry[2], entry[3]];
    }));
  } catch (e) { }
}

// ⚡ เพิ่ม — บันทึก "คำขอสมัครนี้รอกี่วินาทีกว่าจะได้บัตร" ลง Debug_Log ตรงๆ (ไม่ผ่านบัฟเฟอร์ เพราะมีแค่ไม่กี่
// ครั้งต่อวัน และต้องเห็นทันทีตอนตามเรื่องย้อนหลัง) — เดิม logSlowAction_ ถูกเรียกจาก doGet/doPost เท่านั้น
// งานที่สั่งโดย trigger จึงไม่เหลือร่องรอยใน Debug_Log เลยสักบรรทัด ทำให้ตอนลูกค้าแจ้งว่า "รอนาน" เราตรวจ
// ย้อนหลังไม่ได้เลยว่าบัตรถูกสร้างตอนกี่โมงและรอไปกี่วินาทีกันแน่
function logRegistrationQueueWait_(requestCode, receivedAt, finishedAt, note) {
  try {
    var waitMs = '';
    if (receivedAt) {
      var t0 = new Date(receivedAt).getTime();
      if (!isNaN(t0)) waitMs = finishedAt.getTime() - t0;
    }
    ensureDebugLogSheet_().appendRow([finishedAt, 'queue', 'สร้างบัตรเสร็จ ' + String(requestCode || ''), waitMs, note || '']);
  } catch (e) {
    Logger.log('logRegistrationQueueWait_ error: ' + e.toString());
  }
}

function logErrorToSheet_(action, errorText) {
  try {
    ensureDebugLogSheet_().appendRow([new Date(), 'error', action, '', String(errorText || '')]);
  } catch (e) { }
}

function doGet(e) {
  var page = e.parameter.page;
  if (page === 'uploadSlip') {
    var tmpl = HtmlService.createTemplateFromFile('slipUpload');
    tmpl.orderId = e.parameter.orderId || '';
    return tmpl.evaluate()
      .setTitle('แนบสลิปการโอนเงิน - Spunky Food')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  if (page === 'admin') {
    return HtmlService.createHtmlOutputFromFile('admin')
      .setTitle('จัดการสมาชิก - Em-O-Cha')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var action = e.parameter.action;
  if (action) {
    var _t0 = Date.now();
    var result;
    if (action === 'checkMemberStatus') {
      result = checkMemberStatus(e.parameter.idToken);
    } else if (action === 'registerMember') {
      result = registerMember(e.parameter.idToken, e.parameter.phoneNumber, e.parameter.fullName, e.parameter.birthday, e.parameter.referrerCode);
    } else if (action === 'updateMemberProfile') {
      result = updateMemberProfile(e.parameter.idToken, e.parameter.fullName, e.parameter.phone, e.parameter.birthday, e.parameter.address, e.parameter.province);
    } else if (action === 'getTierConfig') {
      result = { success: true, tiers: getTierConfig_(), signupBonus: getSignupBonusPoints_(), signupPrivilege: getSignupPrivilegeConfig_(), pointsRedeemConfig: getPointsRedeemConfig_() };
    } else if (action === 'updateTierConfig') {
      result = updateTierConfig(e.parameter.pin, e.parameter.tiersJson);
    } else if (action === 'updateSignupBonus') {
      result = updateSignupBonus(e.parameter.pin, e.parameter.points);
    } else if (action === 'updateSignupPrivilegeConfig') {
      result = updateSignupPrivilegeConfig(e.parameter.pin, e.parameter.enabled, e.parameter.name, e.parameter.type, e.parameter.value, e.parameter.expiryDays, e.parameter.expiryDate, e.parameter.restriction, e.parameter.freeProduct, e.parameter.freeQty);
    } else if (action === 'updatePointsRedeemConfig') {
      result = updatePointsRedeemConfig(e.parameter.pin, e.parameter.enabled, e.parameter.pointsPerBaht, e.parameter.minRedeem, e.parameter.maxRedeemPerOrder);
    } else if (action === 'getShopBootstrap') {
      result = getShopBootstrap(e.parameter.idToken);
    } else if (action === 'getShopProducts') {
      result = getShopProducts();
    } else if (action === 'getMyPrivileges') {
      result = getMyPrivileges(e.parameter.idToken);
    } else if (action === 'getPrivilegesPanelData') {
      result = getPrivilegesPanelData(e.parameter.idToken);
    } else if (action === 'getPointsHistory') {
      result = getPointsHistory(e.parameter.idToken);
    } else if (action === 'getMyOrderHistory') {
      result = getMyOrderHistory(e.parameter.idToken);
    } else if (action === 'cancelShopOrder') {
      result = cancelShopOrder(e.parameter.idToken, e.parameter.orderId);
    } else if (action === 'getActiveCoupons') {
      result = getActiveCoupons();
    } else if (action === 'getRewardsCatalog') {
      result = getRewardsCatalog();
    } else if (action === 'redeemReward') {
      result = redeemReward(e.parameter.idToken, e.parameter.rewardRowIndex, e.parameter.quantity);
    } else if (action === 'getMyShippingAddress') {
      result = getMyShippingAddress(e.parameter.idToken);
    } else if (action === 'checkShopDiscounts') {
      result = checkShopDiscounts(e.parameter.idToken, e.parameter.couponCode, e.parameter.subtotal, decodeItemsB64_(e.parameter.itemsB64), e.parameter.excludePrivilegeName, e.parameter.pointsToRedeem, e.parameter.existingOrderId);
    } else if (action === 'createShopOrder') {
      result = createShopOrder(e.parameter.idToken, decodeItemsB64_(e.parameter.itemsB64), e.parameter.paymentMethod, e.parameter.couponCode, e.parameter.shippingAddress, e.parameter.province, e.parameter.excludePrivilegeName, e.parameter.existingOrderId, e.parameter.purchaseReferrerCode, e.parameter.pointsToRedeem, e.parameter.giftChoices);
    } else if (action === 'checkPendingOrderPromoStillValid') {
      result = checkPendingOrderPromoStillValid(e.parameter.idToken, e.parameter.orderId);
    } else if (action === 'getPendingOrderForEdit') {
      result = getPendingOrderForEdit(e.parameter.idToken, e.parameter.orderId);
    } else if (action === 'confirmPendingOrderRecalc') {
      result = confirmPendingOrderRecalc(e.parameter.idToken, e.parameter.orderId);
    } else if (action === 'getShopPaymentInfo') {
      result = { success: true, promptPayId: SHOP_PROMPTPAY_ID, bankName: SHOP_BANK_NAME, bankAccount: SHOP_BANK_ACCOUNT, accountName: SHOP_ACCOUNT_NAME };
    } else if (action === 'logPromoClick') {
      result = logPromoClick(e.parameter.idToken, e.parameter.src);
    } else if (action === 'getReferralPublicStatus') {
      result = getReferralPublicStatus();
    } else if (action === 'getPurchaseReferralPublicStatus') {
      result = getPurchaseReferralPublicStatus();
    } else if (action === 'enqueueMemberRegistration') {
      result = enqueueMemberRegistration(e.parameter.idToken, e.parameter.phoneNumber, e.parameter.fullName, e.parameter.birthday, e.parameter.referrerCode);
    } else if (action === 'getRegistrationQueueStatus') {
      result = getRegistrationQueueStatus(e.parameter.idToken);
    } else if (action === 'processRegistrationQueue') {
      processRegistrationQueue();
      result = { success: true };
    } else if (action === 'setupBlockSyncTrigger') {
      // ⚡ เพิ่ม — ทางลัดตั้ง trigger เช็คบล็อกรายวัน ผ่าน URL โดยตรง เผื่อ editor ของ Apps Script ค้าง/ดรอปดาวน์
      // เลือกฟังก์ชันไม่ยอมโผล่ (บั๊กที่รู้จักกันดีของ Apps Script editor เวลาไฟล์ใหญ่) ไม่ต้องพึ่ง UI ของ editor เลย
      if (!checkAdminPin_(e.parameter.pin)) {
        result = { success: false, error: 'PIN ไม่ถูกต้อง' };
      } else {
        setupDailyBlockSyncTrigger();
        result = { success: true, message: 'ตั้ง trigger เช็คบล็อกรายวันเรียบร้อยแล้ว' };
      }
    } else if (action === 'runBlockSyncNow') {
      // ⚡ เพิ่ม — ทางลัดกดเช็คบล็อกทันทีผ่าน URL โดยตรง (ผลลัพธ์เดียวกับปุ่ม "เช็คสถานะบล็อกตอนนี้" ในหน้าแอดมิน)
      result = runBlockedMembersSync(e.parameter.pin);
    } else if (action === 'listActiveTriggers') {
      // ⚡ เพิ่ม — ถามตรงๆ กับระบบว่ามี trigger อะไรตั้งอยู่จริงบ้าง ไม่ต้องพึ่งหน้า Triggers ของ Apps Script
      // editor ที่บางทีจอค้างไม่ยอมอัปเดต (ดูปัญหาที่เจอมาตลอด) ตอบเป็น JSON ตรงๆ เชื่อถือได้กว่า
      if (!checkAdminPin_(e.parameter.pin)) {
        result = { success: false, error: 'PIN ไม่ถูกต้อง' };
      } else {
        var triggerList_ = ScriptApp.getProjectTriggers().map(function (t) {
          return { function: t.getHandlerFunction(), eventType: String(t.getEventType()) };
        });
        result = { success: true, triggers: triggerList_ };
      }
    } else {
      result = { success: false, error: 'ไม่รู้จัก action: ' + action };
    }
    Logger.log('doGet action=' + action + ' took ' + (Date.now() - _t0) + 'ms');
    logSlowAction_('doGet', action, Date.now() - _t0);
    if (typeof mirrorAfterAction_ === 'function') mirrorAfterAction_(action);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('สมัครสมาชิก - Spunky Food')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    var action = body.action;
    var _t0 = Date.now();
    var result;
    if (action === 'registerMember') {
      result = registerMember(body.idToken, body.phoneNumber, body.fullName, body.birthday, body.referrerCode);
    } else if (action === 'checkMemberStatus') {
      result = checkMemberStatus(body.idToken);
    } else if (action === 'uploadShopSlip') {
      result = uploadShopSlip(body.orderId, body.base64, body.fileName, body.mimeType);
    } else if (action === 'checkSlipAttached') {
      result = checkSlipAttached(body.orderId);
    } else {
      result = { success: false, error: 'ไม่รู้จัก action: ' + action };
    }
    Logger.log('doPost action=' + action + ' took ' + (Date.now() - _t0) + 'ms');
    logSlowAction_('doPost', action, Date.now() - _t0);
    if (typeof mirrorAfterAction_ === 'function') mirrorAfterAction_(action);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==================== ตรวจสอบ LINE Login Token ====================
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

function decodeJwtPayload_(token) {
  try {
    var parts = String(token).split('.');
    if (parts.length !== 3) return null;
    var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return JSON.parse(Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString('UTF-8'));
  } catch (e) { return null; }
}

function verifyLineIdToken_(idToken) {
  idToken = String(idToken || '').trim();
  var clientId = String(LIFF_CHANNEL_ID || '').trim();

  if (!/^\d+$/.test(clientId)) {
    lastLineVerifyError_ = 'LIFF_CHANNEL_ID ใน Code.gs ต้องเป็นตัวเลขล้วนเท่านั้น แต่ตอนนี้เป็น "' + clientId + '"';
    return null;
  }

  var claims = decodeJwtPayload_(idToken);
  if (!claims) {
    lastLineVerifyError_ = 'idToken ไม่ใช่ JWT ที่ถูกต้อง (ถอด payload ไม่ได้) | ' + tokenDiag_(idToken);
    return null;
  }

  if (String(claims.aud) !== clientId) {
    lastLineVerifyError_ = 'client_id ไม่ตรงกับโทเคน — โทเคนนี้ออกโดย Channel "' + claims.aud
      + '" แต่ Code.gs ตั้ง LIFF_CHANNEL_ID ไว้เป็น "' + clientId + '" → แก้ LIFF_CHANNEL_ID ใน Code.gs ให้เป็น ' + claims.aud + ' แล้ว Deploy ใหม่';
    return null;
  }

  if (claims.exp && claims.exp * 1000 < Date.now()) {
    lastLineVerifyError_ = 'idToken หมดอายุแล้ว (หมดเมื่อ ' + new Date(claims.exp * 1000).toLocaleString('th-TH') + ') กรุณาปิดหน้านี้แล้วเปิดใหม่ผ่าน LINE';
    return null;
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = 'lv_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, idToken)).substring(0, 40);
  var cachedResult = cache.get(cacheKey);
  if (cachedResult) {
    lastLineVerifyError_ = '';
    return JSON.parse(cachedResult);
  }

  var lineVerifyStart_ = Date.now();
  var res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: { id_token: idToken, client_id: clientId },
    muteHttpExceptions: true
  });
  Logger.log('verifyLineIdToken_: เรียก LINE verify API ใช้เวลา ' + (Date.now() - lineVerifyStart_) + 'ms (cache miss)');
  var code = res.getResponseCode();
  var bodyText = res.getContentText();
  if (code !== 200) {
    lastLineVerifyError_ = 'LINE verify ตอบกลับสถานะ ' + code + ': ' + bodyText;
    return null;
  }
  lastLineVerifyError_ = '';
  // ⚡ แคชผล verify ไว้จนหมดอายุจริงของ idToken (สูงสุด 21600 วิ = ลิมิตของ CacheService) แทนที่จะตายตัว
  // แค่ 5 นาที เพราะ exp/aud ก็เช็คซ้ำจาก claims ที่ decode ในเครื่องอยู่แล้วทุกครั้งก่อนถึงจุดนี้ (ด้านบน)
  // ยิ่ง cache นาน ยิ่งลดจำนวนครั้งที่ต้องยิง UrlFetchApp ไปหา LINE ซึ่งเป็นคอขวดหลักของความช้าตอน login
  var ttlSeconds_ = 300;
  if (claims.exp) {
    var remainingSeconds_ = claims.exp - Math.floor(Date.now() / 1000);
    if (remainingSeconds_ > 0) ttlSeconds_ = Math.min(remainingSeconds_, 21600);
  }
  try { cache.put(cacheKey, bodyText, ttlSeconds_); } catch (e) {}
  return JSON.parse(bodyText);
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

// วันเดือนปีเกิดสำหรับรายงานฝั่ง Admin — dd/MM/yyyy (พ.ศ.) ให้ตรงกับวันที่อื่นๆ ในหน้า Admin
// ค่าในชีตเป็นได้ทั้งสตริง 'YYYY-MM-DD' (ที่ registerMember/คีย์ออเดอร์เขียนไว้) และ Date (ถ้า Sheets แปลงให้เอง)
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
// ⚡ เพิ่ม (1/9/69) — หน้า HTML สมัครสมาชิก (ไฟล์ index.html บน GitHub Em-O-Cha/Members ที่เปิดผ่านลิงก์ LIFF
// สมัครสมาชิก) เขียนไว้ให้เรียก action "enqueueMemberRegistration" เพื่อลงคิวสมัครก่อน (ไม่ใช้ registerMember
// ตรงๆ) แล้วเปิดหน้าบัตรสมาชิกระดับ Start ชั่วคราวทันที พร้อม poll เช็คสถานะเป็นระยะจนกว่าจะสมัครเสร็จจริง
// (กันปัญหา timeout ตอนคนสมัครพร้อมกันเยอะๆ) — ลงคิวใน Registration_Queue ให้ processRegistrationQueue ที่มีอยู่แล้ว
// เป็นคนประมวลผลจริงทีหลัง เบราว์เซอร์เป็นคนยิง processRegistrationQueue เองหลังลงคิวสำเร็จทุกครั้ง (fire-and-forget)
// ⚡ เพิ่ม (16/9/69) — คำขอสมัครที่ "ตกตั้งแต่ยังไม่ทันลงคิว" (ยืนยัน LINE ไม่ผ่าน / เบอร์ซ้ำ / รอ ScriptLock
// ไม่ทัน) เดิมไม่ทิ้งร่องรอยไว้ที่ไหนเลย ไม่มีแถวในคิว ไม่มีบรรทัดใน Debug_Log เวลาลูกค้าแจ้งว่า
// "สมัครไม่ได้" จึงตรวจสอบย้อนหลังไม่ได้เลยว่าติดตรงไหน — บันทึกไว้ทุกครั้งที่ตกก่อนจะลงคิวสำเร็จ
function logRegistrationIssue_(stage, detail) {
  try {
    ensureDebugLogSheet_().appendRow([new Date(), 'register', String(stage || ''), '', String(detail || '')]);
  } catch (e) {
    Logger.log('logRegistrationIssue_ error: ' + e.toString());
  }
}

function enqueueMemberRegistration(idToken, phoneNumber, fullName, birthday, referrerCode) {
  var profile;
  try {
    profile = verifyLineIdToken_(idToken);
  } catch (e) {
    return { success: false, error: e.toString() };
  }
  if (!profile) {
    logRegistrationIssue_('enqueue: ยืนยันตัวตนกับ LINE ไม่สำเร็จ', lastLineVerifyError_ + ' | ' + tokenDiag_(idToken));
    return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ') | ' + tokenDiag_(idToken) };
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    logRegistrationIssue_('enqueue: รอ ScriptLock ไม่ทัน (ปฏิเสธคำขอ)', String(profile.sub || ''));
    return { success: false, error: 'ระบบมีคนสมัครพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' };
  }
  try {
    var phone = String(phoneNumber || '').replace(/[^0-9]/g, '');
    if (phone.length > 0 && phone.charAt(0) !== '0') phone = '0' + phone;
    if (!/^0\d{9}$/.test(phone)) {
      logRegistrationIssue_('enqueue: เบอร์โทรไม่ถูกต้อง', String(phoneNumber || ''));
      return { success: false, error: 'เบอร์โทรไม่ถูกต้อง กรุณากรอกให้ครบ 10 หลัก' };
    }

    var fullNameValue = String(fullName || '').trim();
    if (!fullNameValue) return { success: false, error: 'กรุณากรอกชื่อ-นามสกุล' };
    var birthdayValue = String(birthday || '').trim();
    if (!birthdayValue) return { success: false, error: 'กรุณากรอกวันเกิด' };

    var membersData = getCachedMembersIdentityRows_();
    for (var mi = 0; mi < membersData.length; mi++) {
      if (membersData[mi][0] === profile.sub) return { success: true, alreadyMember: true };
      if (String(membersData[mi][3]) === phone) {
        logRegistrationIssue_('enqueue: เบอร์โทรซ้ำกับสมาชิกเดิม', phone + ' (คนขอสมัคร: ' + String(profile.sub || '') + ' / เจ้าของเบอร์เดิม: ' + String(membersData[mi][0] || '') + ')');
        return { success: false, error: 'เบอร์โทรนี้ถูกใช้สมัครสมาชิกไปแล้ว' };
      }
    }

    var queueSheet = ensureRegistrationQueueSheet_();
    var queueLastRow = queueSheet.getLastRow();
    if (queueLastRow > 1) {
      var queueData = queueSheet.getRange(2, 1, queueLastRow - 1, 6).getValues();
      for (var qi = 0; qi < queueData.length; qi++) {
        var qStatus = String(queueData[qi][1] || '').trim().toUpperCase();
        if (String(queueData[qi][5]) === profile.sub && (qStatus === 'PENDING' || qStatus === 'PROCESSING')) {
          return { success: true, queued: true }; // มีคำขอค้างอยู่แล้ว ไม่ต้องลงคิวซ้ำ
        }
      }
    }

    var requestCode = 'REQ-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
    var now = new Date();
    // ⚡ แก้ (1/9/69) — เดิมใช้ appendRow ตรงๆ ทำให้คอลัมน์ H (เบอร์โทร) และ J (วันเกิด) ที่เป็นข้อความ เช่น
    // "13/06/1979" ถูก Google Sheets ตรวจจับรูปแบบแล้วแปลงเป็นวันที่/ตัวเลขจริงในเซลล์เองอัตโนมัติ (auto-detect
    // ของ Sheets) พอ processRegistrationQueue อ่านค่ากลับมาทีหลังเลยได้ Date object แทนข้อความเดิม ส่งต่อเข้า
    // registerMember แล้ว String(dateObject) กลายเป็น "Wed Jun 13 1979 00:00:00 GMT+0700 ..." ผิดรูปแบบไปเลย
    // (ปัญหาคล้าย Members sheet ที่ registerMember มี setNumberFormat('@STRING@') ป้องกันไว้อยู่แล้วในคอลัมน์
    // เดียวกัน แต่ Registration_Queue ไม่เคยมีการป้องกันนี้มาก่อน) — บังคับฟอร์แมตข้อความก่อนเขียนค่า กันเหตุซ้ำ
    var queueNextRow_ = queueSheet.getLastRow() + 1;
    queueSheet.getRange(queueNextRow_, 8).setNumberFormat('@STRING@'); // H = เบอร์โทร
    queueSheet.getRange(queueNextRow_, 10).setNumberFormat('@STRING@'); // J = วันเกิด
    queueSheet.getRange(queueNextRow_, 3, 1, 2).setNumberFormat('dd/MM/yyyy HH:mm:ss'); // C/D = เวลารับคำขอ/เวลาอัปเดต
    queueSheet.getRange(queueNextRow_, 1, 1, 11).setValues([[
      requestCode, 'PENDING', now, now, 0, profile.sub, idToken, phone, fullNameValue, birthdayValue, String(referrerCode || '').trim()
    ]]);
    return { success: true, queued: true };
  } catch (e) {
    logRegistrationIssue_('enqueue: ผิดพลาดระหว่างลงคิว', e.toString());
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ⚡ เพิ่ม (1/9/69) — หน้าเว็บ poll ฟังก์ชันนี้เป็นระยะหลังลงคิวสมัคร เพื่อรู้ว่าคิวประมวลผลเสร็จหรือยัง
function getRegistrationQueueStatus(idToken) {
  var profile;
  try {
    profile = verifyLineIdToken_(idToken);
  } catch (e) {
    return { success: false, error: e.toString() };
  }
  if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ' };

  var sheet = ensureRegistrationQueueSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, status: 'PENDING' };
  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var latest = null;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][5]) === profile.sub) latest = data[i]; // เอาแถวล่าสุดที่ตรง (ไล่จากบนลงล่างตามลำดับสมัคร)
  }
  if (!latest) return { success: true, status: 'PENDING' };
  var status = String(latest[1] || '').trim().toUpperCase();
  if (status === 'FAILED') return { success: true, status: 'FAILED', error: 'สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' };
  return { success: true, status: status || 'PENDING' };
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
          signupPrivilegeConfig_.restriction || '', signupPrivilegeConfig_.freeProduct || '', signupPrivilegeConfig_.freeQty || '', '',
          signupDiscountCell_(signupPrivilegeConfig_.type, signupPrivilegeConfig_.freeDiscountPercent)
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
        var signupPrivItemsDiscountCol_ = signupItemDiscountCol_(signupPrivItemsSheet_);
        var signupPrivItemsDiscount_ = signupPrivItemsDiscountCol_ ? signupPrivItemsSheet_.getRange(2, signupPrivItemsDiscountCol_, signupPrivItemsLastRow_ - 1, 1).getValues() : [];
        signupPrivItemsData_.forEach(function (row, rowIdx_) {
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
            row[4] || '', row[5] || '', row[6] || '', row[9] || '',
            signupDiscountCell_(row[1], signupPrivItemsDiscount_[rowIdx_] ? signupPrivItemsDiscount_[rowIdx_][0] : '')
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
        privSheetForWrite_.getRange(privSheetForWrite_.getLastRow() + 1, 1, pendingPrivilegeRows_.length, 15)
                          .setValues(pendingPrivilegeRows_);
        // ⚡ เพิ่ม (4/10/69) — ข้อความบนตั๋วอัตโนมัติ (ลด % เฉพาะสินค้า / ชิ้นถัดไปลด %) ให้หน้าร้านเห็นสินค้าที่ร่วมโปร
        var firstWritten_ = privSheetForWrite_.getLastRow() - pendingPrivilegeRows_.length + 1;
        pendingPrivilegeRows_.forEach(function (r_, i_) { var t_ = autoPrivilegeTicketText_(r_); if (t_) setPrivilegeDetailText_(privSheetForWrite_, firstWritten_ + i_, 1, t_); });
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

// ==================== ประมวลผลคิวสมัครสมาชิก (Registration Queue) ====================
// ⚡ กู้คืน (1/9/69) — ฟังก์ชันนี้หายไปจากโค้ด (ถูกลบโดยไม่ตั้งใจในบางรอบแก้ไข) ทำให้ trigger แบบ time-driven
// ที่ตั้งไว้ทำงานทุก 1 นาที error "ไม่พบฟังก์ชันของสคริปต์" ต่อเนื่องตั้งแต่ 31/8/69 17:09 น. เป็นต้นมา แถวคำขอ
// สมัครสมาชิกที่เข้าคิวไว้ในชีตนี้จึงไม่เคยถูกประมวลผลเป็นสมาชิกจริงเลยตลอดช่วงเวลาที่ผ่านมา — เขียนใหม่ให้
// ทำงานแบบเดิม โดยเรียก registerMember() ตรงๆ (ใช้ตรรกะ/ฟิลด์เดียวกับที่ระบบอื่นเรียกใช้อยู่แล้วทุกอย่าง ไม่มี
// ความเสี่ยงที่ตรรกะสมัครสมาชิกจะเพี้ยนไปจากเดิม) วนประมวลผลทีละแถวที่สถานะยังไม่ใช่ COMPLETED เท่านั้น
var REGISTRATION_QUEUE_SHEET_NAME_ = 'Registration_Queue';
var REGISTRATION_QUEUE_MAX_ATTEMPTS_ = 5; // ลองซ้ำสูงสุดกี่ครั้งต่อแถว ก่อนหยุดพยายาม (กันวนซ้ำไม่มีที่สิ้นสุดถ้าข้อมูลแถวนั้นพังจริง)

// ⚡ เพิ่ม (1/9/69) — สร้างชีตคิวสมัครสมาชิกอัตโนมัติถ้ายังไม่มี (เผื่อกรณีชื่อแท็บผิด/ถูกลบไปโดยไม่ตั้งใจ)
// แทนที่จะแค่ log แล้ว return เฉยๆ แบบเดิม กันปัญหา enqueueMemberRegistration ใช้งานไม่ได้เพราะหาชีตไม่เจอ
function ensureRegistrationQueueSheet_() {
  if (_sheetCache_.registrationQueue) return _sheetCache_.registrationQueue;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName(REGISTRATION_QUEUE_SHEET_NAME_);
  if (!sheet) {
    sheet = ss.insertSheet(REGISTRATION_QUEUE_SHEET_NAME_);
    sheet.appendRow(['รหัสคำขอ', 'สถานะ', 'เวลารับคำขอ', 'เวลาอัปเดต', 'จำนวนครั้ง', 'LINE UID', 'ID Token', 'เบอร์โทร', 'ชื่อ-นามสกุล', 'วันเกิด', 'รหัสผู้แนะนำ', 'ผลลัพธ์/ข้อผิดพลาด', 'รหัสสมาชิก']);
    // ⚡ แก้ — คอลัมน์ C/D เก็บ Date เต็ม (มีเวลาครบ) แต่ถ้าไม่ตั้งรูปแบบไว้ Google Sheets จะเดาให้เป็น
    // "วันที่อย่างเดียว" แล้วซ่อนเวลาไว้ ทำให้ตอนตามเรื่องย้อนหลังว่า "ผู้สมัครรอกี่นาที" ดูไม่ได้เลย
    sheet.getRange(2, 3, sheet.getMaxRows() - 1, 2).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  }
  _sheetCache_.registrationQueue = sheet;
  return sheet;
}

// ⚡ เพิ่ม (perf) — กันไม่ให้มีหลายรอบไล่คิวพร้อมกัน: ฟังก์ชันนี้ถูกยิงจาก 2 ทางพร้อมกันได้เสมอ คือหน้าเว็บ
// ยิงทันทีที่ผู้สมัครกดส่ง (kickRegistrationQueue_) และตัวตั้งเวลาทุก 1 นาที ถ้าทั้งสองรอบหยิบแถวเดียวกันไป
// พร้อมกัน จะเรียก registerMember ซ้อนกัน 2 รอบ ซึ่งแต่ละรอบแย่ง ScriptLock ตัวเดียวกัน = ผู้สมัครรอนานขึ้น
// เท่าตัว และคนอื่นทั้งระบบที่กำลังสั่งซื้อ/แนบสลิปอยู่ก็ถูกล็อกค้างตามไปด้วย
// ⚡ เพิ่ม — กดรันฟังก์ชันนี้ครั้งเดียวจากหน้า Apps Script เพื่อ "เปิดเวลา" ให้แถวเก่าทั้งหมดในคิว
// (ค่าเวลาถูกบันทึกไว้ครบอยู่แล้วตั้งแต่แรก แค่ถูกรูปแบบเซลล์ซ่อนไว้ ฟังก์ชันนี้ไม่ได้แก้ข้อมูลใดๆ
// เปลี่ยนแค่วิธีแสดงผล) — ตั้งชื่อไม่มี _ ต่อท้าย เพื่อให้เลือกรันจากเมนู Run ได้
function fixRegistrationQueueTimeFormat() {
  var sheet = ensureRegistrationQueueSheet_();
  var lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, 3, lastRow - 1, 2).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  return { success: true, rows: lastRow - 1 };
}

function processRegistrationQueue() {
  try {
    var sheet = ensureRegistrationQueueSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    // คอลัมน์: A=รหัสคำขอ B=สถานะ C=เวลารับคำขอ D=เวลาอัปเดต E=จำนวนครั้ง F=LINE UID G=ID Token
    //          H=เบอร์โทร I=ชื่อ-นามสกุล J=วันเกิด K=รหัสผู้แนะนำ
    // ⚡ แก้ (perf) — อ่านแค่คอลัมน์ 1-5 ก่อนเพื่อดูว่าแถวไหนต้องทำจริง เดิมลากทั้ง 11 คอลัมน์ของทุกแถวมา
    // ซึ่งรวมคอลัมน์ G (ID Token) ที่ยาวเป็นพันตัวอักษรต่อแถว คิวที่สะสมมาหลักร้อยแถวจึงกลายเป็นข้อมูลหลายแสน
    // ตัวอักษรที่ต้องดึงมาทุกครั้งที่มีคนสมัคร (และทุก 1 นาทีจากตัวตั้งเวลา) ทั้งที่แทบทุกแถวเป็น COMPLETED
    // ไปแล้วและถูกข้ามทิ้งทันที — ตอนนี้จะอ่านแถวเต็มเฉพาะแถวที่ต้องประมวลผลจริงเท่านั้น (ปกติคือแถวเดียว)
    var meta = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    var mirrorTouched_ = false; // มีแถวที่ถูกประมวลผลรอบนี้ ต้องส่งสำเนาไป Supabase

    for (var i = 0; i < meta.length; i++) {
      var status = String(meta[i][1] || '').trim().toUpperCase();
      if (status === 'COMPLETED') continue; // ทำสำเร็จไปแล้ว ข้าม

      var rowNumber = i + 2;
      var attempts = parseInt(meta[i][4]) || 0;
      if (attempts >= REGISTRATION_QUEUE_MAX_ATTEMPTS_) continue; // ลองมาเกินโควตาแล้ว ข้ามไว้ก่อน รอแอดมินเช็คเอง

      var row = sheet.getRange(rowNumber, 1, 1, 11).getValues()[0];
      var idToken = row[6];
      var phone = row[7];
      var fullName = row[8];
      // ⚡ แก้ (1/9/69) — กันไว้อีกชั้น เผื่อแถวเก่าที่ลงคิวไว้ก่อนแก้ปัญหา auto-detect ของ Sheets (หรือกรณีอื่นที่
      // ทำให้ค่าที่อ่านได้กลายเป็น Date object แทนข้อความ "วัน/เดือน/ปี") แปลงกลับเป็นข้อความรูปแบบเดิมก่อนส่งต่อ
      // ให้ registerMember เสมอ ไม่ให้หลุดไปเป็น "Wed Jun 13 1979 ..." อีก
      var birthdayRaw_ = row[9];
      var birthday = (birthdayRaw_ instanceof Date)
        ? Utilities.formatDate(birthdayRaw_, 'Asia/Bangkok', 'dd/MM/yyyy')
        : birthdayRaw_;
      var referrerCode = row[10];

      var result;
      try {
        result = registerMember(idToken, phone, fullName, birthday, referrerCode);
      } catch (e) {
        result = { success: false, error: e.toString() };
      }

      var now = new Date();
      mirrorTouched_ = true;
      // ⚡ เพิ่ม — เขียนสรุปผลลัพธ์ (คอลัมน์ L) และรหัสสมาชิก (คอลัมน์ M) กลับเข้าคิวทุกครั้งที่ประมวลผลจบ
      // เพื่อให้แอดมินเห็นผลตรงนี้ได้เลยไม่ต้องเปิดชีต Members คู่กัน — ใช้ค่าจาก result ที่ registerMember()
      // คืนมาอยู่แล้วโดยตรง ไม่ต้องเสีย quota ไปเปิดชีต Members ซ้ำเพื่อค้นหาอีกรอบ
      // ⚡ แก้ (perf) — รวมการเขียนสถานะกลับเข้าคิวจาก 4 รอบเหลือ 2 รอบ (คอลัมน์ C คงค่าเดิมที่อ่านมา)
      if (result && result.success) {
        sheet.getRange(rowNumber, 2, 1, 3).setValues([['COMPLETED', row[2], now]]);
        sheet.getRange(rowNumber, 12, 1, 2).setValues([['สมัครสมาชิกสำเร็จ', result.memberCode || '']]);
        logRegistrationQueueWait_(row[0], row[2], now, 'สำเร็จ ' + (result.memberCode || ''));
      } else {
        // ⚡ ถ้าสาเหตุคือ "เป็นสมาชิกอยู่แล้ว" หรือ "เบอร์นี้ถูกใช้สมัครไปแล้ว" ถือว่าจบงานแล้วจริงๆ (ไม่ใช่ระบบพัง
        // แค่สมัครซ้ำ/มีคนสมัครสำเร็จไปก่อนหน้าด้วยเบอร์เดียวกัน) ต้องปิดเป็น COMPLETED ไปเลย ไม่งั้นจะค้างวนลองซ้ำ
        // ไม่มีที่สิ้นสุดจนครบโควตา error อื่นๆ ถือเป็นปัญหาจริง นับจำนวนครั้งไว้แล้วลองใหม่รอบถัดไป
        var isAlreadyMemberError = result && result.error && (
          result.error.indexOf('เป็นสมาชิกอยู่แล้ว') !== -1 ||
          result.error.indexOf('ถูกใช้สมัครสมาชิกไปแล้ว') !== -1
        );
        sheet.getRange(rowNumber, 2, 1, 4).setValues([[isAlreadyMemberError ? 'COMPLETED' : 'FAILED', row[2], now, attempts + 1]]);
        sheet.getRange(rowNumber, 12).setValue(result ? result.error : 'ไม่ทราบสาเหตุ');
        logRegistrationQueueWait_(row[0], row[2], now, 'ไม่สำเร็จ: ' + (result ? result.error : 'ไม่ทราบสาเหตุ'));
        if (!isAlreadyMemberError) {
          Logger.log('processRegistrationQueue: แถว ' + rowNumber + ' ล้มเหลว: ' + (result ? result.error : 'ไม่ทราบสาเหตุ'));
        }
      }
    }
    // สมาชิกใหม่ถูกเขียนลงชีตจาก trigger (ไม่ผ่าน doGet) จึงต้องส่งสำเนาไป Supabase เอง
    if (mirrorTouched_ && typeof mirrorAfterBackgroundWrite_ === 'function') mirrorAfterBackgroundWrite_(MIRROR_SIGNUP_TABS_);
  } catch (e) {
    Logger.log('processRegistrationQueue error: ' + e.toString());
    logErrorToSheet_('processRegistrationQueue', e.toString());
  }
}

function updateMemberProfile(idToken, fullName, phone, birthday, address, province) {
  var profile;
  try {
    profile = verifyLineIdToken_(idToken);
  } catch (e) {
    return { success: false, error: e.toString() };
  }
  if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ')' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนแก้ไขพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    var fullNameValue = String(fullName || '').trim();
    if (!fullNameValue) return { success: false, error: 'กรุณากรอกชื่อ-นามสกุล' };

    var phoneValue = String(phone || '').replace(/[^0-9]/g, '');
    if (phoneValue.length > 0 && phoneValue.charAt(0) !== '0') phoneValue = '0' + phoneValue;
    if (!/^0\d{9}$/.test(phoneValue)) return { success: false, error: 'เบอร์โทรไม่ถูกต้อง กรุณากรอกให้ครบ 10 หลัก' };

    // ⚡ แก้ (31/8/69) — วันเกิดไม่บังคับตอน "แก้ไขข้อมูล" อีกต่อไป เพราะฟอร์มแก้ไขข้อมูล
    // ไม่มีช่องกรอกวันเกิด (วันเกิดกรอกครั้งเดียวตอนสมัครสมาชิกเท่านั้น) ถ้าไม่ได้ส่งมาใหม่
    // ให้คงค่าวันเกิดเดิมไว้ และบล็อกการบันทึกเฉพาะกรณีที่ยังไม่เคยมีวันเกิดในระบบเลยเท่านั้น
    var birthdayValue = String(birthday || '').trim();

    var addressValue = String(address || '').trim();
    var provinceValue = String(province || '').trim();

    var sheet = ensureMembersSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, error: 'ไม่พบข้อมูลสมาชิก' };
    var data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();

    var rowIndex = -1;
    var existingBirthday_ = '';
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === profile.sub) { rowIndex = i + 2; existingBirthday_ = String(data[i][10] || '').trim(); continue; }
      if (String(data[i][3]) === phoneValue) return { success: false, error: 'เบอร์โทรนี้ถูกใช้โดยสมาชิกคนอื่นแล้ว' };
    }
    if (rowIndex === -1) return { success: false, error: 'ไม่พบบัญชีสมาชิกของคุณ' };

    if (!birthdayValue) birthdayValue = existingBirthday_;
    if (!birthdayValue) return { success: false, error: 'กรุณากรอกวันเกิด' };

    sheet.getRange(rowIndex, 4).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, 11).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, 4).setValue(phoneValue);
    sheet.getRange(rowIndex, 8).setValue(addressValue);
    sheet.getRange(rowIndex, 9).setValue(provinceValue);
    sheet.getRange(rowIndex, 10).setValue(fullNameValue);
    sheet.getRange(rowIndex, 11).setValue(birthdayValue);

    try { syncAddressToPendingOrders_(phoneValue, addressValue, provinceValue); } catch (syncErr) {
      Logger.log('updateMemberProfile: sync ที่อยู่ไปยังบิลที่รอพิมพ์ใบจัดส่งไม่สำเร็จ: ' + syncErr.toString());
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function syncAddressToPendingOrders_(phone, address, province) {
  var phoneClean = String(phone || '').replace(/[^0-9]/g, '');
  if (!phoneClean) return;
  var ss = SpreadsheetApp.openById(REVENUE_SHEET_ID_SHOP);
  var sheet = ss.getSheetByName(REVENUE_SHEET_NAME_SHOP);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  var data = sheet.getRange(2, 1, lastRow - 1, 27).getValues();
  var updatedCount = 0;
  data.forEach(function (row, idx) {
    if (!row[0]) return;
    var rowPhone = String(row[14] || '').replace(/[^0-9]/g, '');
    if (rowPhone !== phoneClean) return;
    var orderShopee = row[20], orderTiktok = row[21];
    if (orderShopee || orderTiktok) return;

    var rowIndex = idx + 2;
    sheet.getRange(rowIndex, 24).setValue(province);
    sheet.getRange(rowIndex, 25).setValue(address);
    updatedCount++;
  });
  if (updatedCount > 0) {
    Logger.log('syncAddressToPendingOrders_: อัปเดตที่อยู่ในบิล LINE Shop แล้ว ' + updatedCount + ' บิล (เบอร์ ' + phoneClean + ')');
  }
}

// ==================== SHOP (สั่งซื้อผ่าน LINE) ====================
var REVENUE_SHEET_ID_SHOP   = '1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY';
var REVENUE_SHEET_NAME_SHOP = 'Revenue';
var MASTER_SHEET_ID_SHOP    = '1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w';
var SLIP_FOLDER_ID_SHOP     = '1aQQYvzFyZ79GDFQO352RdBPzdnCb0MnH';

var SHOP_PROMPTPAY_ID = '0105555177061';
var SHOP_BANK_NAME    = 'กสิกรไทย (K-Bank)';
var SHOP_BANK_ACCOUNT = '0698834641';
var SHOP_ACCOUNT_NAME = 'บริษัท สปังกี้ ฟู้ด จำกัด';

var BAHT_PER_POINT = 30;

var LINE_CHANNEL_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '';
var ADMIN_GROUP_ID = 'Ca97de41b95824b5a9001c58bcbd6108f';

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

function hasPointsAlreadyCreditedForOrder_(lineUid, orderId) {
  try {
    var sheet = ensurePointsLogSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return false;
    var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    var tag = '[' + orderId + ']';
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][1]) === lineUid && String(data[i][2]) === 'earn' && String(data[i][3] || '').indexOf(tag) !== -1) return true;
    }
    return false;
  } catch (e) {
    Logger.log('hasPointsAlreadyCreditedForOrder_ error: ' + e.toString());
    return false;
  }
}

// ⚡ เพิ่ม (19/8/69) — คืนคะแนนที่เคย "แลกเป็นส่วนลดเงินสด" ไว้ให้ออเดอร์นี้ (ถ้ามี) กลับเข้ายอดคงเหลือของ
// สมาชิก ใช้ตอนแก้ไขออเดอร์เดิม (isEditingExistingOrder) กันหักคะแนนซ้ำสองรอบถ้าลูกค้าแก้ไขจำนวนคะแนนที่จะ
// แลกใหม่ — แยกจาก deleteExistingOrderPointsLog_ โดยเจาะจงเฉพาะ type='redeem' เท่านั้น (ของเดิมไม่กรอง
// ประเภท ใช้กับรายการ 'earn' อย่างเดียว จะเผลอไปรวม/ลบรายการ redeem ที่ไม่เกี่ยวข้องได้ถ้าเรียกปนกัน)
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
// ==================== ⚡ เพิ่ม (23/8/69) — โปรแต้มสะสม 2 แบบ: คูณแต้ม (points_multiplier) และซื้อซ้ำในเดือน
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

var VALID_POINTS_PROMO_TYPES_ = ['multiplier', 'repeat'];

function createPointsPromo(pin, name, type, startDate, expiryDate, multiplierValue, minPurchase, restriction, bonusPoints, bonusDiscountType, bonusDiscountValue, stubText) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    name = String(name || '').trim();
    if (!name) return { success: false, error: 'กรุณากรอกชื่อโปร' };
    var typeValue = VALID_POINTS_PROMO_TYPES_.indexOf(type) !== -1 ? type : 'multiplier';
    if (typeValue === 'multiplier') {
      if (!startDate || !expiryDate) return { success: false, error: 'โปรคูณแต้มต้องระบุช่วงเวลา (วันเริ่ม-วันหมดอายุ) เสมอ' };
      if (!multiplierValue || parseFloat(multiplierValue) <= 1) return { success: false, error: 'กรุณากรอกตัวคูณแต้มที่มากกว่า 1 (เช่น 2 = x2 เท่า)' };
      if (minPurchase && restriction) return { success: false, error: 'เลือกได้แค่อย่างใดอย่างหนึ่ง: ยอดซื้อขั้นต่ำ หรือ สินค้าเฉพาะ ไม่ใช่ทั้งคู่พร้อมกัน' };
    } else {
      if (!bonusPoints && !bonusDiscountValue) return { success: false, error: 'กรุณากรอกอย่างน้อย 1 อย่าง: แต้มโบนัส หรือ ส่วนลดโบนัส' };
    }
    var startDateVal = startDate ? parseDateInputStr_(startDate) : '';
    var expiryDateVal = expiryDate ? parseDateInputStr_(expiryDate) : '';
    ensurePointsPromosSheet_().appendRow([
      name, typeValue, true, startDateVal, expiryDateVal,
      typeValue === 'multiplier' ? (parseFloat(multiplierValue) || 0) : (parseFloat(multiplierValue) || ''),
      parseFloat(minPurchase) || '',
      String(restriction || '').trim(),
      typeValue === 'repeat' ? (parseInt(bonusPoints) || 0) : '',
      typeValue === 'repeat' ? (bonusDiscountType || '') : '',
      typeValue === 'repeat' ? (parseFloat(bonusDiscountValue) || 0) : '',
      new Date(),
      String(stubText || '').trim()
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function updatePointsPromo(pin, rowIndex, name, type, startDate, expiryDate, multiplierValue, minPurchase, restriction, bonusPoints, bonusDiscountType, bonusDiscountValue, stubText) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensurePointsPromosSheet_();
    var ri = parseInt(rowIndex);
    if (!ri || ri < 2 || ri > sheet.getLastRow()) return { success: false, error: 'ไม่พบโปรนี้' };

    name = String(name || '').trim();
    if (!name) return { success: false, error: 'กรุณากรอกชื่อโปร' };
    var typeValue = VALID_POINTS_PROMO_TYPES_.indexOf(type) !== -1 ? type : 'multiplier';
    if (typeValue === 'multiplier') {
      if (!startDate || !expiryDate) return { success: false, error: 'โปรคูณแต้มต้องระบุช่วงเวลา (วันเริ่ม-วันหมดอายุ) เสมอ' };
      if (!multiplierValue || parseFloat(multiplierValue) <= 1) return { success: false, error: 'กรุณากรอกตัวคูณแต้มที่มากกว่า 1 (เช่น 2 = x2 เท่า)' };
      if (minPurchase && restriction) return { success: false, error: 'เลือกได้แค่อย่างใดอย่างหนึ่ง: ยอดซื้อขั้นต่ำ หรือ สินค้าเฉพาะ ไม่ใช่ทั้งคู่พร้อมกัน' };
    } else {
      if (!bonusPoints && !bonusDiscountValue) return { success: false, error: 'กรุณากรอกอย่างน้อย 1 อย่าง: แต้มโบนัส หรือ ส่วนลดโบนัส' };
    }
    var startDateVal = startDate ? parseDateInputStr_(startDate) : '';
    var expiryDateVal = expiryDate ? parseDateInputStr_(expiryDate) : '';
    sheet.getRange(ri, 1, 1, 2).setValues([[ name, typeValue ]]);
    sheet.getRange(ri, 4, 1, 2).setValues([[ startDateVal, expiryDateVal ]]);
    sheet.getRange(ri, 6, 1, 3).setValues([[
      typeValue === 'multiplier' ? (parseFloat(multiplierValue) || 0) : (parseFloat(multiplierValue) || ''),
      parseFloat(minPurchase) || '',
      String(restriction || '').trim()
    ]]);
    sheet.getRange(ri, 9, 1, 3).setValues([[
      typeValue === 'repeat' ? (parseInt(bonusPoints) || 0) : '',
      typeValue === 'repeat' ? (bonusDiscountType || '') : '',
      typeValue === 'repeat' ? (parseFloat(bonusDiscountValue) || 0) : ''
    ]]);
    sheet.getRange(ri, 13).setValue(String(stubText || '').trim());
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
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

function togglePointsPromo(pin, rowIndex, active) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    ensurePointsPromosSheet_().getRange(parseInt(rowIndex), 3).setValue(active === true || active === 'true');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==================== ⚡ เพิ่ม (23/8/69) — "สิทธิ์ตามระดับสมาชิก" แบบข้อความล้วน
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

function createTierPerk(pin, text, tierKey) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    text = String(text || '').trim();
    if (!text) return { success: false, error: 'กรุณากรอกข้อความสิทธิ์' };
    if (!tierKey) return { success: false, error: 'กรุณาเลือกระดับสมาชิก' };
    ensureTierPerksSheet_().appendRow([text, tierKey, true, new Date()]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function updateTierPerk(pin, rowIndex, text, tierKey) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    text = String(text || '').trim();
    if (!text) return { success: false, error: 'กรุณากรอกข้อความสิทธิ์' };
    if (!tierKey) return { success: false, error: 'กรุณาเลือกระดับสมาชิก' };
    var sheet = ensureTierPerksSheet_();
    var ri = parseInt(rowIndex);
    if (!ri || ri < 2 || ri > sheet.getLastRow()) return { success: false, error: 'ไม่พบรายการนี้' };
    sheet.getRange(ri, 1, 1, 2).setValues([[ text, tierKey ]]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
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

function toggleTierPerk(pin, rowIndex, active) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    ensureTierPerksSheet_().getRange(parseInt(rowIndex), 3).setValue(active === true || active === 'true');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
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


// ⚡ เพิ่ม (1/9/69) — เดิม getActivePointsMultiplier_ กับ getActiveRepeatBonusConfig_ อ่านชีต Points_Promos
// เองแยกกันคนละรอบ ทั้งที่ทั้ง checkShopDiscounts (ดูตัวอย่างราคา) และ createShopOrder (สั่งซื้อจริง ตอนถือ
// lock อยู่) เรียกทั้งคู่พร้อมกันเสมอ กลายเป็นอ่านชีตเดียวกันซ้ำ 2 รอบไม่จำเป็นทุกครั้งที่คำนวณราคา — cache
// ข้อมูลดิบไว้ 15 วินาที ให้ใช้ร่วมกัน
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

// ⚡ เพิ่ม — สำหรับโชว์เป็นการ์ดคูปองบนหน้าแรก (ก่อนลูกค้าเลือกสินค้า จึงยังไม่มีตะกร้า/ยอดซื้อจริง) ต่างจาก
// getActivePointsMultiplier_ ที่กรองด้วยตะกร้าจริงเพื่อ "ใช้คำนวณแต้ม" ฟังก์ชันนี้แค่ "ประกาศว่ามีโปรอะไร
// เปิดอยู่บ้าง" (ไม่กรองด้วยยอดซื้อขั้นต่ำ/สินค้าเฉพาะ — โชว์เป็นข้อความเงื่อนไขในการ์ดแทน เหมือนที่กล่อง
// คูปองอัตโนมัติ (renderAutoPromoBox_) ทำอยู่แล้ว) และคืนทุกโปรที่เข้าเงื่อนไขวันที่ ไม่ใช่แค่ตัวคูณสูงสุด
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

// ⚡ เพิ่ม — เหมือน getActivePointsMultiplierPromosForDisplay_ แต่สำหรับโปร "ซื้อซ้ำ" (repeat) ใช้โชว์เป็น
// ตั๋วคูปองบนหน้าแรกเหมือนกัน (แค่ประกาศว่ามีโปรนี้เปิดอยู่ ไม่ได้เช็คว่าลูกค้าคนนี้ซื้อครั้งแรกไปแล้วหรือยัง
// — เงื่อนไข "ต้องซื้อครั้งแรกก่อนถึงจะได้สิทธิ์ตอนซื้อซ้ำ" ยังคงเช็คจริงด้วย getActiveRepeatBonusConfig_ ตอน
// คำนวณราคา/สั่งซื้อเหมือนเดิมทุกประการ ฟังก์ชันนี้ไม่ได้แก้ไขตรรกะการให้รางวัลเลย)
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

// ชีต Revenue เก็บยอดขายรวมทุกช่องทาง (Shopee/TikTok/LINE) ไม่ใช่แค่ออเดอร์จาก LINE จึงมีแถวเพิ่มทุกวัน
// ไม่มีวันเบาลง การอ่านทั้งชีตหรือทั้งคอลัมน์ทุกคำขอจึงช้าลงเรื่อยๆ ตามอายุร้าน — ทุกจุดที่ต้องหาแถวของลูกค้า
// คนหนึ่งในชีตนี้ให้ผ่าน getRevenueRowNumbersForPhone_ (ดัชนีรายเบอร์ที่แคชได้จริง) เสมอ
var REVENUE_PHONE_COL_ = 15; // คอลัมน์ O = Phone Number
// ⚡ เพิ่ม (perf) — ชีต Revenue เป็นคนละไฟล์กับชีต Members การ SpreadsheetApp.openById() แต่ละครั้งมีต้นทุน
// จริง (หลักร้อย ms) แต่เดิมคำขอเดียวเปิดซ้ำได้ถึง 3 รอบ (getMyOrderHistory เปิดเอง 1 → getRevenueRowsForPhone_
// เปิดอีก 1 → ตัวอ่านคอลัมน์เบอร์โทรเปิดอีก 1) — เก็บ handle ไว้ใน _sheetCache_ แบบเดียวกับชีตอื่นๆ
// ในไฟล์นี้ เปิดครั้งเดียวพอต่อ 1 การทำงาน
// ⚡ เพิ่ม (perf) — ตัวช่วยกลางสำหรับ "อ่านหลายแถวที่กระจัดกระจายอยู่ในชีตเดียวกัน"
// ต้นทุนจริงของ Google Sheets API อยู่ที่ "จำนวนครั้งที่ยิง" (แต่ละครั้งมี overhead คงที่หลักร้อย ms) มากกว่า
// "จำนวนช่องที่อ่าน" — เดิมโค้ดรวมเฉพาะแถวที่ "ติดกันเป๊ะ" เท่านั้น ลูกค้าประจำที่ออเดอร์กระจายอยู่ทั่วชีต
// (ปนกับออเดอร์ช่องทางอื่นที่แทรกเข้ามาระหว่างกัน) จึงต้องยิงแยกกันได้ถึง 25-30 รอบต่อการเปิดหน้า 1 ครั้ง
// ตัวนี้จะกวาดรวบช่วงที่อยู่ในงบ "จำนวนช่องต่อ 1 รอบ" ให้อ่านทีเดียวแล้วค่อยคัดเฉพาะแถวที่ต้องการในหน่วยความจำ
// (ข้อมูลส่วนเกินที่อ่านติดมาด้วยถูกทิ้งไปเฉยๆ ไม่กระทบผลลัพธ์) — ผลที่ได้เหมือนเดิมทุกแถวและเรียงเหมือนเดิม
// เกณฑ์การรวบ: ยอมอ่านแถวส่วนเกินที่คั่นกลางได้ไม่เกิน MERGED_READ_GAP_ROWS_ แถว (คุ้มกว่าเสียเวลายิงเพิ่ม
// อีก 1 รอบ) และแต่ละรอบต้องไม่เกิน MERGED_READ_MAX_CELLS_ ช่อง (กันดึงข้อมูลก้อนใหญ่เกินจนกินหน่วยความจำ
// และกันกรณีสุดโต่งที่แถวของลูกค้าคนเดียวกระจายห่างกันมากๆ ทั่วทั้งชีต)
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

// ⚡ เพิ่ม (perf) — ดัชนี "แถวไหนบ้างที่คอลัมน์ keyCol มีค่าเท่ากับ key" เก็บไว้ใน CacheService แยกรายคีย์
// เก็บแค่ลิสต์ตัวเลขแถว จึงเล็กมากและเก็บลง cache ได้จริงเสมอ (ต่างจากการแคชทั้งคอลัมน์ซึ่งพอชีตโตเกิน
// ~3,000 แถวก็ทะลุลิมิต 100KB ต่อ key ของ CacheService แล้วเก็บไม่ติดเลยสักครั้ง)
// เก็บ upTo (แถวสุดท้ายที่เคยสแกนถึง) ไว้ด้วย รอบถัดไปจึงอ่านเฉพาะแถวที่เพิ่มเข้ามาใหม่หลังจากนั้นแล้วต่อท้าย
// ดัชนีเดิม ผลจึงตรงกับชีตจริงเสมอ ใช้ได้เฉพาะกับชีตที่ "ต่อท้ายอย่างเดียว ไม่แทรกกลาง และไม่แก้ค่าในคอลัมน์
// คีย์ของแถวเก่า" ซึ่งเป็นจริงทั้งชีต Revenue (คอลัมน์เบอร์โทร) และ Member_Privileges (คอลัมน์ LINE UID)
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

// ⚡ เพิ่ม (19/9/69) — เตรียมคอลัมน์ AG "สถานะเก็บเงินปลายทาง" และ AH "วันที่ได้รับเงินปลายทาง" ให้ชีต Revenue
// (เดิมชีตใช้ถึงคอลัมน์ AF) สร้างหัวตารางให้เองครั้งแรกที่มีออเดอร์เก็บเงินปลายทางเข้ามา ไม่ต้องไปเพิ่มมือ
// ตั้งใจไม่แตะคอลัมน์เดิมเลยแม้แต่ช่องเดียว ระบบอื่นที่อ่านชีตนี้อยู่ (Revenue Spunky Online / รายงานรายวัน)
// จึงทำงานเหมือนเดิมทุกประการ
var _revenueCodColsReady_ = false;
// จำนวนคอลัมน์ที่ "อ่าน" ได้จริงในชีตตอนนี้ — ใช้กับจุดที่อ่านข้อมูลอย่างเดียวและยังไม่ได้เรียก
// ensureRevenueCodColumns_ มาก่อน (ถ้าชีตยังไม่มีคอลัมน์ AG/AH การขอ getRange เกินขอบชีตจะโยน error)
// ค่าที่อ่านไม่ถึงจะกลายเป็น undefined ซึ่งทุกจุดที่ใช้ห่อด้วย String(x || '') อยู่แล้ว จึงปลอดภัย
function revenueReadCols_(wanted) {
  try { return Math.min(wanted, ensureRevenueSheet_().getMaxColumns()); } catch (e) { return 32; }
}

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

// ⚡ เพิ่ม (perf) — แคช "เลขแถวในชีต Revenue ที่เป็นของเบอร์นี้" แยกรายเบอร์ แทนการแคชคอลัมน์เบอร์โทรทั้ง
// คอลัมน์แบบที่เคยทำ ซึ่งพอร้านขายมานานจนเกิน 100KB ต่อ key แล้ว CacheService
// จะเก็บไม่ติดเลยสักครั้ง กลายเป็นอ่านคอลัมน์ทั้งชีตสดใหม่ทุกคำขอโดยที่ตั้งใจจะแคชไว้ — เก็บเป็นรายเบอร์แบบนี้
// ข้อมูลเล็กมาก (แค่ลิสต์ตัวเลข) เก็บได้จริงเสมอ
// สำคัญ: เก็บ upTo (แถวสุดท้ายที่เคยสแกนถึง) ไว้ด้วย รอบถัดไปจึงอ่านเฉพาะ "แถวที่เพิ่มเข้ามาใหม่หลังจากนั้น"
// แล้วต่อท้ายดัชนีเดิม ผลลัพธ์จึงตรงกับชีตจริงเสมอ ไม่ใช่ข้อมูลเก่าค้าง (ข้อมูลในชีตนี้ต่อท้ายล่างสุดเสมอ
// ไม่มีการแทรกกลาง) — ข้อจำกัดเดียวคือถ้ามีคนไป "แก้เบอร์ในแถวเก่า" ด้วยมือ ดัชนีจะตามไม่ทันจนกว่าแคชจะหมดอายุ
var REVENUE_PHONE_ROWS_CACHE_TTL_ = 600;
function getRevenueRowNumbersForPhone_(phoneClean) {
  return getKeyRowIndexCached_(ensureRevenueSheet_(), REVENUE_PHONE_COL_, phoneClean, 'revrows_', REVENUE_PHONE_ROWS_CACHE_TTL_, normalizeDigits_);
}

// ⚡ แก้ (perf) — ใช้ดัชนีแถวรายเบอร์ (แคชได้จริง) แทนการอ่านคอลัมน์เบอร์โทรทั้งชีตทุกครั้ง แล้วอ่านแถวที่
// ต้องการผ่าน readRowsMerged_ เพื่อลดจำนวนรอบที่ยิง Sheets API ให้เหลือน้อยที่สุด
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

// ⚡ แก้ (perf) — จำแถวเริ่มต้นของ "เดือนนี้" ไว้ถาวรใน PropertiesService (คนละแบบกับ CacheService ที่หมดอายุ
// ไว) เพราะข้อมูลในชีต Revenue ต่อท้ายล่างสุดเสมอ แถวเริ่มต้นเดือนที่เคยหาไว้แล้วจะไม่มีวันขยับตลอดเดือนนั้น
// (ไม่มีการแทรก/ลบแถวก่อนหน้า) พอรู้แล้วครั้งเดียวก็ใช้ซ้ำได้ทั้งเดือนโดยไม่ต้องอ่านชีตหาใหม่เลย — พอขึ้นเดือนใหม่
// ก็แค่ไล่หา "ต่อจากแถวเริ่มต้นเดือนก่อน" (ไม่ใช่ไล่จากแถว 2 ใหม่ทุกครั้ง) เพราะรู้แน่ๆ ว่าเดือนใหม่ต้องเริ่มไม่ก่อน
// จุดนั้น ช่วงที่ต้องอ่านจึงเท่ากับ "ยอดขายตั้งแต่ต้นเดือนก่อนมาจนถึงตอนนี้" เท่านั้น ไม่ใช่ทั้งประวัติทั้งหมด
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

// ⚡ แก้ (perf) — เวอร์ชันจำกัดขอบเขตของ getRevenueRowsForPhone_ เฉพาะสำหรับ countPriorOrdersThisMonth_
// (เช็คแค่ "เคยซื้อเดือนนี้ไหม") ไม่ใช้กับที่อื่นที่ต้องการประวัติทั้งหมดย้อนหลัง (เช่นหน้าประวัติคำสั่งซื้อ) — ใช้
// getRevenueMonthStartRow_ หาว่าควรเริ่มอ่านจากแถวไหน แล้วอ่านแค่ตั้งแต่แถวนั้นถึงล่างสุดเท่านั้น
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
// ==================== แจ้งเตือน LINE ====================
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

function fmtOrderBaht_(v) { return '฿' + Math.round(v || 0).toLocaleString('th-TH'); }

function buildOrderItemRow_(item, amountColor, oneLine) {
  // oneLine (การ์ดแอดมิน): ชื่อสินค้าอยู่บรรทัดเดียว กินพื้นที่เต็มเหลือแค่ช่องราคา ชื่อยาวเกินให้ตัวอักษรย่อลงเอง
  var nameText = oneLine
    ? { type: 'text', text: item.name + ' x' + item.qty, size: 'sm', color: '#424242', flex: 1, wrap: false, adjustMode: 'shrink-to-fit' }
    : { type: 'text', text: item.name + ' x' + item.qty, size: 'sm', color: '#424242', flex: 4, wrap: true };
  var priceText = { type: 'text', text: fmtOrderBaht_(item.qty * item.price), size: 'sm', color: amountColor || '#a50d0c', weight: 'bold', align: 'end', flex: oneLine ? 0 : 2 };
  if (oneLine) priceText.margin = 'md';
  return { type: 'box', layout: 'horizontal', margin: 'sm', contents: [ nameText, priceText ] };
}

function buildOrderSummaryRow_(label, value, opts) {
  opts = opts || {};
  // oneLine: ป้ายกว้างเท่าที่ใช้จริง ค่า (เช่น ชื่อลูกค้า) อยู่บรรทัดเดียว ยาวเกินให้ตัวอักษรย่อลงเอง
  if (opts.oneLine) {
    return {
      type: 'box', layout: 'horizontal', margin: opts.margin || 'xs',
      contents: [
        { type: 'text', text: label, size: opts.size || 'xs', color: opts.labelColor || '#9e9e9e', flex: 0 },
        { type: 'text', text: value, size: opts.size || 'xs', color: opts.valueColor || '#424242', weight: opts.bold ? 'bold' : 'regular', align: 'end', flex: 1, margin: 'md', wrap: false, adjustMode: 'shrink-to-fit' }
      ]
    };
  }
  return {
    type: 'box', layout: 'horizontal', margin: opts.margin || 'xs',
    contents: [
      { type: 'text', text: label, size: opts.size || 'xs', color: opts.labelColor || '#9e9e9e', flex: 3, wrap: opts.labelWrap === true },
      { type: 'text', text: value, size: opts.size || 'xs', color: opts.valueColor || '#424242', weight: opts.bold ? 'bold' : 'regular', align: 'end', flex: 2, wrap: true }
    ]
  };
}

function buildFreebieBox_(freebieItems, headerText, theme) {
  if (!freebieItems || !freebieItems.length) return null;
  theme = theme || { text: '#a50d0c', background: '#fff0ef' };
  var contents = [ { type: 'text', text: headerText, size: 'xs', color: theme.text, weight: 'bold', wrap: true } ];
  freebieItems.forEach(function (f) {
    contents.push({ type: 'text', text: '• ' + f, size: 'xs', color: theme.text, wrap: true, margin: 'xs' });
  });
  return {
    type: 'box', layout: 'vertical', margin: 'md', cornerRadius: '8px', backgroundColor: theme.background, paddingAll: '10px',
    contents: contents
  };
}

function buildWelcomeFlexMessage_(displayName, memberCode, signupBonusPoints, grantedPrivileges) {
  var body = [ buildOrderHeaderCard_('🎉', 'สมัครสมาชิกสำเร็จแล้ว!', 'ยินดีต้อนรับสู่ คลับคนรักเอมโอชา 💚') ];

  body.push({
    type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents: [
      // ⚡ แก้ (3/10/69) — ชื่อ/รหัสสมาชิกอยู่บรรทัดเดียว (ชื่อยาวให้ตัวอักษรย่อลงเอง ไม่ตกบรรทัด)
      buildOrderSummaryRow_('ชื่อสมาชิก', displayName || '-', { size: 'sm', valueColor: '#424242', bold: true, oneLine: true }),
      buildOrderSummaryRow_('รหัสสมาชิก', memberCode || '-', { size: 'sm', valueColor: '#424242', oneLine: true }),
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

function buildBuyerOrderFlexMessage_(revenueId, items, paymentLabel, subtotal, discount, shippingCost, finalAmount, freebieItems, physicalFreebieItems) {
  var body = [ buildOrderHeaderCard_('🧾', 'ยืนยันคำสั่งซื้อ', '#' + revenueId + ' · Em-O-Cha') ];
  var itemBox = { type: 'box', layout: 'vertical', margin: 'lg', contents: items.map(function(item){ return buildOrderItemRow_(item); }) };
  body.push(itemBox);
  var freebieBoxBuyer_ = buildFreebieBox_(freebieItems, '🎁 ส่วนลดโปรซื้อครบที่คุณได้รับ');
  if (freebieBoxBuyer_) body.push(freebieBoxBuyer_);
  var physicalFreebieBoxBuyer_ = buildFreebieBox_(physicalFreebieItems, '📦 ของแถมที่คุณจะได้รับเพิ่ม (ทีมงานเตรียมให้)');
  if (physicalFreebieBoxBuyer_) body.push(physicalFreebieBoxBuyer_);
  body.push({ type: 'separator', margin: 'lg' });
  var summary = { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents: [
    buildOrderSummaryRow_('ยอดสินค้ารวม', fmtOrderBaht_(subtotal))
  ]};
  if (discount > 0) summary.contents.push(buildOrderSummaryRow_('ส่วนลด', '-' + fmtOrderBaht_(discount), { valueColor: '#a50d0c' }));
  summary.contents.push(buildOrderSummaryRow_('ค่าจัดส่ง', fmtOrderBaht_(shippingCost)));
  body.push(summary);
  body.push({ type: 'separator', margin: 'lg' });
  body.push({
    type: 'box', layout: 'horizontal', margin: 'lg', alignItems: 'center', contents: [
      { type: 'text', text: 'ยอดชำระทั้งหมด', size: 'sm', weight: 'bold', color: '#a50d0c', flex: 3 },
      { type: 'text', text: fmtOrderBaht_(finalAmount), size: 'xl', weight: 'bold', color: '#a50d0c', align: 'end', flex: 3 }
    ]
  });
  // ⚡ เพิ่ม (19/9/69) — ออเดอร์เก็บเงินปลายทางใช้กล่องเน้นสีส้มแทนบรรทัด "ช่องทางชำระเงิน" ธรรมดา เพื่อให้
  // ลูกค้าเห็นชัดตั้งแต่ข้อความยืนยันว่าต้องเตรียมเงินเท่าไรให้พนักงานส่งของ ไม่ต้องรอโอนหรือแนบสลิป
  var isCodBuyerCard_ = isCodPaymentLabel_(paymentLabel);
  body.push(isCodBuyerCard_ ? {
    type: 'box', layout: 'vertical', margin: 'md', cornerRadius: '8px', backgroundColor: '#fff3e0', paddingAll: '12px', spacing: 'xs',
    contents: [
      { type: 'text', text: '💵 ชำระแบบเก็บเงินปลายทาง', size: 'sm', weight: 'bold', color: '#e65100', align: 'center' },
      { type: 'text', text: 'กรุณาเตรียมเงิน ' + fmtOrderBaht_(finalAmount) + ' ให้พนักงานส่งของตอนรับสินค้า', size: 'xs', color: '#e65100', align: 'center', wrap: true }
    ]
  } : {
    type: 'box', layout: 'vertical', margin: 'md', cornerRadius: '8px', backgroundColor: '#fff0ef', paddingAll: '8px',
    contents: [ { type: 'text', text: 'ช่องทางชำระเงิน: ' + paymentLabel, size: 'xs', color: '#a50d0c', align: 'center' } ]
  });
  body.push({
    type: 'text', text: 'เราจะเตรียมจัดส่งให้เร็วที่สุดค่ะ ขอบคุณที่รักเอมโอชานะคะ 🙏', size: 'xs', color: '#757575',
    margin: 'lg', wrap: true, align: 'center'
  });

  var bubble = { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md', contents: body } };
  var buyerAltText_ = 'ยืนยันคำสั่งซื้อ #' + revenueId + (isCodBuyerCard_ ? ' เก็บเงินปลายทาง ' : ' ยอดชำระ ') + fmtOrderBaht_(finalAmount);
  return { type: 'flex', altText: buyerAltText_, contents: bubble };
}

var THAI_PROVINCES_ = ['กรุงเทพมหานคร','กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร','ขอนแก่น','จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ชัยนาท','ชัยภูมิ','ชุมพร','เชียงราย','เชียงใหม่','ตรัง','ตราด','ตาก','นครนายก','นครปฐม','นครพนม','นครราชสีมา','นครศรีธรรมราช','นครสวรรค์','นนทบุรี','นราธิวาส','น่าน','บึงกาฬ','บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์','ปราจีนบุรี','ปัตตานี','พระนครศรีอยุธยา','พะเยา','พังงา','พัทลุง','พิจิตร','พิษณุโลก','เพชรบุรี','เพชรบูรณ์','แพร่','ภูเก็ต','มหาสารคาม','มุกดาหาร','แม่ฮ่องสอน','ยโสธร','ยะลา','ร้อยเอ็ด','ระนอง','ระยอง','ราชบุรี','ลพบุรี','ลำปาง','ลำพูน','เลย','ศรีสะเกษ','สกลนคร','สงขลา','สตูล','สมุทรปราการ','สมุทรสงคราม','สมุทรสาคร','สระแก้ว','สระบุรี','สิงห์บุรี','สุโขทัย','สุพรรณบุรี','สุราษฎร์ธานี','สุรินทร์','หนองคาย','หนองบัวลำภู','อ่างทอง','อำนาจเจริญ','อุดรธานี','อุตรดิตถ์','อุทัยธานี','อุบลราชธานี'];
// ⚡ เพิ่ม (3/10/69) — ข้อความหาลูกค้า: สั่งซื้อแล้วรอแนบสลิป (ปุ่มแนบสลิป/ดูคำสั่งซื้อ-ยกเลิก) และยืนยันการยกเลิก
var SHOP_LIFF_URL_ = 'https://liff.line.me/2010892131-3XYQXNzq';
function buildBuyerPendingSlipFlexMessage_(revenueId, items, paymentLabel, subtotal, discount, shippingCost, finalAmount, isEdit) {
  var body = [ buildOrderHeaderCard_('🕒', isEdit ? 'แก้ไขคำสั่งซื้อแล้ว รอแนบสลิป' : 'รอแนบสลิปการโอนเงิน', '#' + revenueId + ' · Em-O-Cha') ];
  body.push({ type: 'box', layout: 'vertical', margin: 'lg', contents: (items || []).map(function (item) { return buildOrderItemRow_(item); }) });
  body.push({ type: 'separator', margin: 'lg' });
  var summary = { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents: [ buildOrderSummaryRow_('ยอดสินค้ารวม', fmtOrderBaht_(subtotal)) ] };
  if (discount > 0) summary.contents.push(buildOrderSummaryRow_('ส่วนลด', '-' + fmtOrderBaht_(discount), { valueColor: '#a50d0c' }));
  summary.contents.push(buildOrderSummaryRow_('ค่าจัดส่ง', fmtOrderBaht_(shippingCost)));
  body.push(summary);
  body.push({ type: 'separator', margin: 'lg' });
  body.push({
    type: 'box', layout: 'horizontal', margin: 'lg', alignItems: 'center', contents: [
      { type: 'text', text: 'ยอดที่ต้องชำระ', size: 'sm', weight: 'bold', color: '#a50d0c', flex: 3 },
      { type: 'text', text: fmtOrderBaht_(finalAmount), size: 'xl', weight: 'bold', color: '#a50d0c', align: 'end', flex: 3 }
    ]
  });
  body.push({
    type: 'box', layout: 'vertical', margin: 'md', cornerRadius: '8px', backgroundColor: '#fff0ef', paddingAll: '8px',
    contents: [ { type: 'text', text: 'ช่องทางชำระเงิน: ' + String(paymentLabel || '').replace(/\s*\(LINE Shop\)$/, ''), size: 'xs', color: '#a50d0c', align: 'center' } ]
  });
  body.push({
    type: 'box', layout: 'vertical', margin: 'lg', cornerRadius: '8px', backgroundColor: '#fff8e1', paddingAll: '12px', spacing: 'xs',
    contents: [
      { type: 'text', text: '📎 โอนแล้ว กด "แนบสลิป" ด้านล่างได้เลย', size: 'sm', weight: 'bold', color: '#8d6e00', wrap: true },
      { type: 'text', text: 'คำสั่งซื้อจะยืนยันเมื่อแนบสลิปในระบบแล้วเท่านั้น (ส่งสลิปในแชทระบบไม่เห็น) ถ้าไม่ต้องการสินค้าแล้ว กด "ดูคำสั่งซื้อ / ยกเลิก"', size: 'xs', color: '#8d6e00', wrap: true }
    ]
  });
  var bubble = {
    type: 'bubble', size: 'giga',
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md', contents: body },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', paddingTop: '0px', contents: [
      { type: 'button', style: 'primary', color: '#a50d0c', height: 'md',
        action: { type: 'uri', label: '📎 แนบสลิป', uri: SHOP_LIFF_URL_ + '?slip=' + encodeURIComponent(revenueId) } },
      { type: 'button', style: 'secondary', height: 'sm',
        action: { type: 'uri', label: 'ดูคำสั่งซื้อ / ยกเลิก', uri: SHOP_LIFF_URL_ + '?view=cart' } }
    ]}
  };
  return { type: 'flex', altText: 'รอแนบสลิป #' + revenueId + ' ยอดชำระ ' + fmtOrderBaht_(finalAmount) + ' — กดแนบสลิปเพื่อยืนยันคำสั่งซื้อ', contents: bubble };
}

function buildBuyerOrderCancelledFlexMessage_(revenueId, items, amount) {
  var body = [ buildOrderHeaderCard_('❌', 'ยกเลิกคำสั่งซื้อแล้ว', '#' + revenueId + ' · Em-O-Cha') ];
  if (items && items.length) body.push({ type: 'box', layout: 'vertical', margin: 'lg', contents: items.map(function (item) { return buildOrderItemRow_(item, '#9e9e9e'); }) });
  body.push({ type: 'separator', margin: 'lg' });
  body.push({
    type: 'box', layout: 'horizontal', margin: 'lg', alignItems: 'center', contents: [
      { type: 'text', text: 'ยอดคำสั่งซื้อที่ยกเลิก', size: 'sm', weight: 'bold', color: '#757575', flex: 3 },
      { type: 'text', text: fmtOrderBaht_(amount), size: 'lg', weight: 'bold', color: '#757575', align: 'end', flex: 2, decoration: 'line-through' }
    ]
  });
  body.push({
    type: 'text', text: 'ยกเลิกคำสั่งซื้อนี้ตามที่คุณกดยกเลิกเรียบร้อยแล้ว ไม่ต้องชำระเงินค่ะ หากต้องการสั่งใหม่ เลือกสินค้าได้ที่ร้านค้าในเมนูได้เลย 🙏',
    size: 'xs', color: '#757575', margin: 'lg', wrap: true, align: 'center'
  });
  var bubble = { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md', contents: body } };
  return { type: 'flex', altText: 'ยกเลิกคำสั่งซื้อ #' + revenueId + ' เรียบร้อยแล้ว', contents: bubble };
}

// ⚡ แก้ (4/10/69) — ไม่ส่ง "รอแนบสลิป" ทันทีทุกออเดอร์แล้ว: เข้าคิวไว้ SLIP_REMINDER_DELAY_MIN_ นาที แล้วส่งเฉพาะออเดอร์
// ที่ถึงตอนนั้นยังไม่แนบสลิป (ลูกค้าปิดหน้าไปก่อนแนบ) — แนบแล้ว/ยกเลิกแล้ว = ไม่ส่ง
// (ชุดทดสอบ orderWriterTest ยังส่งทันทีเหมือนเดิม / เข้าคิวไม่ได้ = ส่งทันทีแบบเดิม กันลูกค้าไม่ได้รับเลย)
function notifyBuyerPendingSlip_(lineUid, revenueId, items, paymentLabel, subtotal, discount, shippingCost, finalAmount, isEdit) {
  if (!lineUid || !revenueId) return { success: false, error: 'ไม่มี LINE UID/เลขออเดอร์' };
  var testMode_ = typeof ORDER_TEST_MODE_ !== 'undefined' && ORDER_TEST_MODE_;
  if (!testMode_ && queueSlipReminder_(lineUid, revenueId, isEdit)) return { success: true, queued: true };
  return sendPendingSlipNow_(lineUid, revenueId, items, paymentLabel, subtotal, discount, shippingCost, finalAmount, isEdit);
}

var SLIP_REMINDER_QUEUE_PROP_ = 'pending_slip_reminders';
var SLIP_REMINDER_TRIGGER_HANDLER_ = 'runDueSlipReminders_';
var SLIP_REMINDER_DELAY_MIN_ = 10;
var SLIP_REMINDER_MAX_QUEUE_ = 120; // คิวเก็บใน Script Properties (จำกัด ~9KB) — เต็มแล้วส่งทันทีแบบเดิม

function readSlipReminderQueue_(props) {
  try { return JSON.parse(props.getProperty(SLIP_REMINDER_QUEUE_PROP_) || '[]'); } catch (e) { return []; }
}

// ตั้ง trigger ครั้งเดียวให้ปลุก runDueSlipReminders_ ตอนคิวใบแรกครบกำหนด (มีอยู่แล้ว = ไม่ตั้งซ้ำ)
function ensureSlipReminderTrigger_(dueAtMs) {
  var exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === SLIP_REMINDER_TRIGGER_HANDLER_; });
  if (exists) return;
  ScriptApp.newTrigger(SLIP_REMINDER_TRIGGER_HANDLER_).timeBased().after(Math.max(60000, dueAtMs - Date.now() + 5000)).create();
}

function queueSlipReminder_(lineUid, revenueId, isEdit) {
  var lock = LockService.getScriptLock();
  try {
    try { lock.waitLock(5000); } catch (e) { return false; }
    var props = PropertiesService.getScriptProperties();
    var all_ = readSlipReminderQueue_(props);
    // ⚡ แก้ (4/10/69) — แก้ไขออเดอร์ที่ข้อความแรกยังรอส่งอยู่ในคิว (ลูกค้ายังไม่เคยเห็น) ใช้หัวข้อความปกติตามใบเดิม
    // หัว "แก้ไขคำสั่งซื้อแล้ว" ใช้เฉพาะเมื่อข้อความแรกส่งไปแล้ว (ไม่อยู่ในคิวแล้ว)
    var queued_ = all_.filter(function (x) { return x.o === String(revenueId); })[0];
    var q = all_.filter(function (x) { return x.o !== String(revenueId); });
    if (q.length >= SLIP_REMINDER_MAX_QUEUE_) return false;
    var due = Date.now() + SLIP_REMINDER_DELAY_MIN_ * 60000;
    q.push({ o: String(revenueId), u: String(lineUid), t: due, e: (queued_ ? queued_.e : (isEdit ? 1 : 0)) ? 1 : 0 });
    props.setProperty(SLIP_REMINDER_QUEUE_PROP_, JSON.stringify(q));
    ensureSlipReminderTrigger_(due);
    return true;
  } catch (err) {
    Logger.log('queueSlipReminder_ ไม่สำเร็จ: ' + err);
    return false;
  } finally {
    try { lock.releaseLock(); } catch (e3) {}
  }
}

// trigger: ส่ง "รอแนบสลิป" ให้ออเดอร์ที่ครบกำหนดแล้วแต่ยังไม่แนบสลิป/ไม่ยกเลิก แล้วตั้งปลุกรอบถัดไปถ้ายังเหลือคิว
function runDueSlipReminders_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === SLIP_REMINDER_TRIGGER_HANDLER_) { try { ScriptApp.deleteTrigger(t); } catch (e0) {} }
  });
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  var due = [], rest = [];
  try {
    try { lock.waitLock(20000); } catch (e) { ensureSlipReminderTrigger_(Date.now()); return; }
    var now = Date.now();
    readSlipReminderQueue_(props).forEach(function (x) { (x.t <= now ? due : rest).push(x); });
    if (rest.length) props.setProperty(SLIP_REMINDER_QUEUE_PROP_, JSON.stringify(rest));
    else props.deleteProperty(SLIP_REMINDER_QUEUE_PROP_);
    if (rest.length) ensureSlipReminderTrigger_(Math.min.apply(null, rest.map(function (x) { return x.t; })));
  } finally {
    try { lock.releaseLock(); } catch (e3) {}
  }
  if (!due.length) return;
  var sheet = SpreadsheetApp.openById(REVENUE_SHEET_ID_SHOP).getSheetByName(REVENUE_SHEET_NAME_SHOP);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  var probeStart = Math.max(2, lastRow - PENDING_SLIP_SCAN_ROWS_ + 1);
  var ids = sheet.getRange(probeStart, 1, lastRow - probeStart + 1, 1).getValues().map(function (r) { return String(r[0]); });
  due.forEach(function (x) {
    try {
      var idx = ids.lastIndexOf(x.o);
      if (idx === -1) return; // ไม่พบออเดอร์ (ถูกลบ) = ไม่ส่ง
      var rowNum = probeStart + idx;
      var head = sheet.getRange(rowNum, 1, 1, 11).getValues()[0];
      if (String(head[2]) === CANCELLED_ORDER_MARK_ || head[10]) return; // ยกเลิกแล้ว / แนบสลิปแล้ว
      var bill = getBillDataForNotify_(sheet, rowNum);
      sendPendingSlipNow_(x.u, x.o, bill.items, bill.paymentLabel, bill.subtotal, bill.discountTotal, bill.shippingCost, bill.billTotal, !!x.e);
    } catch (err) {
      logErrorToSheet_('runDueSlipReminders_', 'orderId="' + x.o + '" — ' + err.toString());
    }
  });
}

function sendPendingSlipNow_(lineUid, revenueId, items, paymentLabel, subtotal, discount, shippingCost, finalAmount, isEdit) {
  var res = sendLineMessages_(lineUid, [buildBuyerPendingSlipFlexMessage_(revenueId, items, paymentLabel, subtotal, discount, shippingCost, finalAmount, isEdit)]);
  if (!res.success) Logger.log('notifyBuyerPendingSlip_ ส่งไม่สำเร็จ: ' + res.error);
  return res;
}

function notifyBuyerOrderCancelled_(lineUid, revenueId, items, amount) {
  if (!lineUid || !revenueId) return { success: false, error: 'ไม่มี LINE UID/เลขออเดอร์' };
  var res = sendLineMessages_(lineUid, [buildBuyerOrderCancelledFlexMessage_(revenueId, items, amount)]);
  if (!res.success) Logger.log('notifyBuyerOrderCancelled_ ส่งไม่สำเร็จ: ' + res.error);
  return res;
}

function notifyBuyerOrderConfirmation_(lineUid, revenueId, items, paymentLabel, subtotal, discount, shippingCost, finalAmount, freebieItems, physicalFreebieItems) {
  try {
    if (!lineUid) {
      Logger.log('notifyBuyerOrderConfirmation_ ข้ามการส่ง: ไม่พบ LINE UID ของลูกค้า');
      logErrorToSheet_('notifyBuyerOrderConfirmation_:noLineUid', 'orderId="' + revenueId + '" — ไม่พบ LINE UID ของลูกค้า ไม่ได้ส่งข้อความยืนยันคำสั่งซื้อ');
      alertAdminBuyerNotifyFailed_(revenueId, 'ไม่พบ LINE UID ของลูกค้า');
      return { success: false, error: 'ไม่พบ LINE UID ของลูกค้า' };
    }
    var result = sendLineMessages_(lineUid, [
      buildBuyerOrderFlexMessage_(revenueId, items, paymentLabel, subtotal, discount, shippingCost, finalAmount, freebieItems, physicalFreebieItems)
    ]);
    if (!result.success) {
      Logger.log('notifyBuyerOrderConfirmation_ ส่งไม่สำเร็จ: ' + result.error);
      // ⚡ เพิ่ม — เดิม error ตรงนี้อยู่แค่ใน Logger.log ชั่วคราว (หายไปเมื่อ log หมดอายุ) ไม่มีใครเห็นว่าลูกค้า
      // คนไหนไม่ได้รับข้อความ เปลี่ยนให้บันทึกลง Error Log sheet ถาวรด้วย เผื่อ LINE push ล้มเหลว (เช่น
      // ลูกค้าบล็อกบัญชี, token หมดอายุ, ข้อความผิดรูปแบบ) จะได้ตามไปแจ้งลูกค้าเองได้
      logErrorToSheet_('notifyBuyerOrderConfirmation_:sendFailed', 'orderId="' + revenueId + '" lineUid="' + lineUid + '" — ' + result.error);
      // ⚡ เพิ่ม (1/9/69) — เดิมถ้าส่งข้อความยืนยันให้ลูกค้าไม่สำเร็จ จะรู้ก็ต่อเมื่อมีคนมาเปิด Debug_Log ดูเอง
      // (ซึ่งแทบไม่มีใครเปิดดู) ทำให้กว่าจะรู้ว่าลูกค้าไม่ได้รับข้อความคือต้องรอลูกค้ามาทักถาม เปลี่ยนให้แจ้งเตือน
      // เข้ากลุ่มแอดมินทันทีทุกครั้งที่ส่งไม่สำเร็จ จะได้ตามไปแจ้งลูกค้าเองได้ทันเวลา ไม่ต้องรอให้ใครมาเทสระบบ
      alertAdminBuyerNotifyFailed_(revenueId, result.error);
    }
    return result;
  } catch (e) {
    Logger.log('notifyBuyerOrderConfirmation_ error: ' + e.toString());
    try { logErrorToSheet_('notifyBuyerOrderConfirmation_:exception', 'orderId="' + revenueId + '" lineUid="' + lineUid + '" — ' + e.toString()); } catch (logErr) {}
    alertAdminBuyerNotifyFailed_(revenueId, e.toString());
    return { success: false, error: e.toString() };
  }
}

// ⚡ เพิ่ม (1/9/69) — แจ้งเตือนกลุ่มแอดมินทันทีเมื่อส่งข้อความยืนยันคำสั่งซื้อให้ลูกค้าไม่สำเร็จ ไม่ว่าจะด้วย
// สาเหตุอะไรก็ตาม (หา LINE UID ไม่เจอ, LINE API ปฏิเสธข้อความ, exception อื่นๆ) กันปัญหาแบบ
// notifyBuyerOrderConfirmation_ ล้มเหลวเงียบๆ ไม่มีใครรู้จนกว่าลูกค้าจะทักมาถาม
function alertAdminBuyerNotifyFailed_(revenueId, errorText) {
  try {
    if (!ADMIN_GROUP_ID || ADMIN_GROUP_ID.indexOf('ใส่ Group ID') === 0) return;
    sendLineMessages_(ADMIN_GROUP_ID, [{
      type: 'text',
      text: '⚠️ ส่งข้อความยืนยันคำสั่งซื้อให้ลูกค้าไม่สำเร็จ\nออเดอร์: #' + revenueId + '\nสาเหตุ: ' + String(errorText || '-') + '\n\nกรุณาตรวจสอบและแจ้งลูกค้าเองก่อนที่ลูกค้าจะทักถามครับ'
    }]);
  } catch (e) {
    Logger.log('alertAdminBuyerNotifyFailed_ ล้มเหลว: ' + e.toString());
  }
}

function buildAddressWithProvince_(address, province) {
  var addr = String(address || '').trim();
  var prov = String(province || '').trim();
  if (!prov) return addr;

  var postal = '';
  var addrBody = addr;
  var pm = addr.match(/(\d{4,7})\s*$/);
  if (pm) { postal = pm[1]; addrBody = addr.slice(0, addr.length - postal.length).trim(); }

  if (addrBody.indexOf(prov) !== -1) {
    return postal ? (addrBody + ' ' + postal) : addrBody;
  }

  var words = addrBody.split(/\s+/).filter(Boolean);
  for (var take = 3; take >= 1; take--) {
    if (words.length < take) continue;
    var tail = words.slice(words.length - take).join(' ').replace(/^จ\.\s*/, '').trim();
    if (tail.length < 2) continue;
    var isProvinceFragment = THAI_PROVINCES_.some(function (p) {
      return p !== tail && (p.indexOf(tail) === 0 || tail.indexOf(p) === 0);
    });
    if (isProvinceFragment) {
      words = words.slice(0, words.length - take);
      break;
    }
  }
  addrBody = words.join(' ').replace(/,\s*$/, '').trim();

  var result = addrBody ? (addrBody + ' ' + prov) : prov;
  if (postal) result += ' ' + postal;
  return result.trim();
}

// billDetail (ไม่บังคับ) = { subtotal, shippingCost, discountNotes } — ใส่มาเมื่อไร การ์ดจะโชว์ที่มาของยอด
// ให้ครบตั้งแต่ยอดสินค้า → ส่วนลดแต่ละตัว → ค่าจัดส่ง → ยอดชำระ แอดมินจะได้ตรวจยอดได้เองโดยไม่ต้องเปิดชีต
function buildAdminOrderFlexMessage_(revenueId, customerName, phone, items, paymentLabel, finalAmount, address, province, freebieItems, physicalFreebieItems, billDetail)  {
  var headerCard = {
    type: 'box', layout: 'vertical', paddingAll: '20px', cornerRadius: '24px',
    background: { type: 'linearGradient', angle: '135deg', startColor: '#f4511e', endColor: '#ffbe4d' },
    contents: [
      { type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'md', contents: [
          { type: 'box', layout: 'vertical', width: '48px', height: '48px', cornerRadius: '24px',
            backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center',
            contents: [ { type: 'text', text: '🛒', size: 'xl', align: 'center' } ]
          },
          { type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: 'ออเดอร์ใหม่ พร้อมแพ็ค', color: '#ffffff', weight: 'bold', size: 'lg', wrap: true },
              { type: 'text', text: '#' + revenueId, color: '#fff3e0', size: 'sm' }
          ]}
      ]}
    ]
  };

  var body = [ headerCard ];
  // ⚡ เพิ่ม (19/9/69) — ป้ายเก็บเงินปลายทางติดไว้บนสุดใต้หัวการ์ด ให้คนแพ็คของเห็นทันทีว่าบิลนี้ต้องเก็บเงิน
  // ปลายทางกี่บาท (ต้องติดใบเก็บเงิน/แจ้งขนส่งให้ถูก) ต่างจากบิลโอนเงินที่จ่ายมาเรียบร้อยแล้ว
  var isCodAdminCard_ = isCodPaymentLabel_(paymentLabel);
  if (isCodAdminCard_) {
    body.push({
      type: 'box', layout: 'vertical', margin: 'md', cornerRadius: '10px', backgroundColor: '#c62828', paddingAll: '12px', spacing: 'xs',
      contents: [
        { type: 'text', text: '💵 เก็บเงินปลายทาง (COD)', size: 'sm', weight: 'bold', color: '#ffffff', align: 'center' },
        { type: 'text', text: 'ต้องเก็บเงินจากลูกค้า ' + fmtOrderBaht_(finalAmount), size: 'lg', weight: 'bold', color: '#ffffff', align: 'center', wrap: true },
        { type: 'text', text: 'ยังไม่ได้รับเงิน — กดยืนยัน "เก็บเงินแล้ว" ที่หน้าจัดการสมาชิกเมื่อได้รับเงินจริง', size: 'xxs', color: '#ffcdd2', align: 'center', wrap: true }
      ]
    });
  }
  body.push({
    type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents: [
      buildOrderSummaryRow_('ลูกค้า', customerName || '-', { size: 'sm', valueColor: '#424242', bold: true, oneLine: true }),
      buildOrderSummaryRow_('โทร', phone || '-', { size: 'sm', valueColor: '#424242', oneLine: true })
    ]
  });
  body.push({ type: 'separator', margin: 'lg' });
  // สีข้อความภายในการ์ดอ้างอิงแบบเดิม: ราคาสินค้า/โปรเป็นเขียว, ยอดชำระเป็นส้ม
  body.push({ type: 'box', layout: 'vertical', margin: 'lg', contents: items.map(function(item){ return buildOrderItemRow_(item, '#006c39', true); }) });
  var adminOrangeTheme_ = { text: '#006c39', background: '#e8f5e9' };
  var freebieBoxAdmin_ = buildFreebieBox_(freebieItems, '🏷️ มีส่วนลดโปรซื้อครบในบิลนี้:', adminOrangeTheme_);
  if (freebieBoxAdmin_) body.push(freebieBoxAdmin_);
  var physicalFreebieBoxAdmin_ = buildFreebieBox_(physicalFreebieItems, '📦 ต้องหยิบของแถมใส่กล่องเพิ่ม (ยังไม่ได้ลดราคา):', adminOrangeTheme_);
  if (physicalFreebieBoxAdmin_) body.push(physicalFreebieBoxAdmin_);
  // ⚡ เพิ่ม — ที่มาของยอด: ยอดสินค้า → ส่วนลดที่ลูกค้าใช้ทุกตัว → ค่าจัดส่ง
  var detail_ = billDetail || {};
  var discountNotes_ = detail_.discountNotes || [];
  var breakdown_ = [];
  if (detail_.subtotal) {
    breakdown_.push(buildOrderSummaryRow_('ยอดสินค้า', fmtOrderBaht_(detail_.subtotal), { size: 'sm' }));
  }
  // ⚡ เพิ่ม (25/9/69) — ยอดสินค้า + ค่าส่ง มากกว่ายอดชำระ แต่ไม่มีบรรทัดส่วนลดอธิบายเลย (เช่น ออเดอร์ที่บันทึก
  // ส่วนลดไว้โดยไม่มีรายละเอียด) แสดงเป็นบรรทัด "ส่วนลด" รวมไว้ให้เห็น ยอดในการ์ดจะได้บวกลบกันลงตัวเสมอ
  if (!discountNotes_.length && detail_.subtotal) {
    var unexplained_ = Math.round((Number(detail_.subtotal) || 0) + (Number(detail_.shippingCost) || 0) - (Number(finalAmount) || 0));
    if (unexplained_ >= 1) discountNotes_ = ['ส่วนลด (-' + unexplained_ + ')'];
  }
  if (discountNotes_.length) {
    breakdown_.push({ type: 'text', text: '🏷️ ส่วนลด/สิทธิ์ที่ลูกค้าใช้', size: 'xs', weight: 'bold', color: '#c62828', margin: 'md' });
    discountNotes_.forEach(function (note) {
      var parsed = splitDiscountNote_(note);
      // ตัวเลขที่เป็น "เงินที่ลดจริง" ใช้สีแดงให้เด่น ส่วนรายการที่ไม่ใช่เงิน (คูณแต้ม x2, โบนัส +50 แต้ม)
      // ใช้สีเทา กันแอดมินอ่านผิดว่าเป็นส่วนลดเงินอีกก้อน
      var isMoney_ = parsed.amount.indexOf('-฿') === 0;
      breakdown_.push(buildOrderSummaryRow_('• ' + parsed.label, parsed.amount || '-', {
        size: 'xs', valueColor: isMoney_ ? '#c62828' : '#9e9e9e', labelWrap: true
      }));
    });
  }
  if (detail_.shippingCost !== undefined && detail_.shippingCost !== null && detail_.shippingCost !== '') {
    breakdown_.push(buildOrderSummaryRow_('🚚 ค่าจัดส่ง', fmtOrderBaht_(detail_.shippingCost), { size: 'sm', margin: 'md' }));
  }
  if (breakdown_.length) {
    body.push({ type: 'separator', margin: 'lg' });
    body.push({ type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents: breakdown_ });
  }

  body.push({ type: 'separator', margin: 'lg' });
  body.push({
    type: 'box', layout: 'horizontal', margin: 'lg', contents: [
      { type: 'text', text: 'ยอดชำระ', size: 'sm', weight: 'bold', color: '#e87500', flex: 3 },
      { type: 'text', text: fmtOrderBaht_(finalAmount), size: 'lg', weight: 'bold', color: '#e87500', align: 'end', flex: 3 }
    ]
  });
  body.push({ type: 'text', text: 'ช่องทางชำระเงิน: ' + paymentLabel, size: 'xs', color: '#9e9e9e', margin: 'sm' });
  body.push({
    type: 'box', layout: 'vertical', margin: 'md', cornerRadius: '8px', backgroundColor: '#fff2dc', paddingAll: '10px',
    contents: [
      { type: 'text', text: '📍 ' + (buildAddressWithProvince_(address, province) || '-'), size: 'xs', color: '#424242', wrap: true }
    ]
  });

    var bubble = { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md', contents: body } };
  var adminAltText_ = 'ออเดอร์ใหม่ #' + revenueId + ' ยอด ' + fmtOrderBaht_(finalAmount)
    + (isCodAdminCard_ ? ' — 💵 เก็บเงินปลายทาง' : ' — เตรียมจัดส่ง');
  return { type: 'flex', altText: adminAltText_, contents: bubble };
}

function notifyAdminNewOrder_(revenueId, customerName, phone, items, paymentLabel, finalAmount, address, province, freebieItems, slipImageUrl, physicalFreebieItems, billDetail) {
  try {
    if (!ADMIN_GROUP_ID || ADMIN_GROUP_ID.indexOf('ใส่ Group ID') === 0) {
      Logger.log('notifyAdminNewOrder_ ข้ามการส่ง: ยังไม่ได้ตั้งค่า ADMIN_GROUP_ID');
      return { success: false, error: 'ยังไม่ได้ตั้งค่า ADMIN_GROUP_ID' };
    }

    var orderResult = sendLineMessages_(ADMIN_GROUP_ID, [
      buildAdminOrderFlexMessage_(revenueId, customerName, phone, items, paymentLabel, finalAmount, address, province, freebieItems, physicalFreebieItems, billDetail)
    ]);
    if (!orderResult.success) {
      Logger.log('notifyAdminNewOrder_ ส่งการ์ดออเดอร์ไม่สำเร็จ: ' + orderResult.error);
      return orderResult;
    }

    var slipImageMsg = buildSlipImageMessage_(slipImageUrl);
    if (!slipImageMsg) return { success: true, orderSent: true, imageSent: false };

    var imageResult = sendLineMessages_(ADMIN_GROUP_ID, [slipImageMsg]);
    if (!imageResult.success) {
      Logger.log('notifyAdminNewOrder_ ส่งรูปสลิปไม่สำเร็จ: ' + imageResult.error);
    }
    return { success: true, orderSent: true, imageSent: imageResult.success, imageError: imageResult.error || '' };
  } catch (e) {
    Logger.log('notifyAdminNewOrder_ error: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}
function buildSlipImageMessage_(slipImageUrl) {
  var m = String(slipImageUrl || '').match(/[?&]id=([^&]+)|\/file\/d\/([^\/?#]+)/);
  var fileId = m && (m[1] || m[2]);
  if (!fileId) {
    Logger.log('buildSlipImageMessage_ ข้ามรูป: ไม่พบ Google Drive file ID จาก ' + slipImageUrl);
    return null;
  }
  var base = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId);
  return {
    type: 'image',
    originalContentUrl: base + '&sz=w1000',
    previewImageUrl: base + '&sz=w240'
  };
}

// opts.unit (ไม่บังคับ) = ชื่อหน่วยรายงานของ LINE (customAggregationUnits) — ใช้นับยอดเปิดอ่าน/กดปุ่มของการยิงโปรแต่ละครั้ง
function sendLineMessages_(to, messages, opts) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || LINE_CHANNEL_ACCESS_TOKEN.indexOf('ใส่ Channel') === 0) {
    Logger.log('sendLineMessages_ ข้ามการส่ง: ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN');
    return { success: false, error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN' };
  }
  try {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN },
      payload: JSON.stringify(opts && opts.unit ? { to: to, messages: messages, customAggregationUnits: [opts.unit] } : { to: to, messages: messages }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code !== 200) {
      var body_ = res.getContentText();
      Logger.log('sendLineMessages_ ล้มเหลว (' + code + '): ' + body_);
      // ⚡ เพิ่ม — LINE ตอบ 400 พร้อมข้อความทำนองนี้เฉพาะตอนผู้รับบล็อก/ยังไม่ได้เป็นเพื่อนกับ OA เท่านั้น
      // ใช้เป็นสัญญาณอัปเดตสถานะบล็อกทันที ไม่ต้องรอ syncBlockedMembersStatus รอบถัดไป (ดูฟังก์ชันด้านล่าง)
      if (code === 400 && /blocked|hasn't added the LINE Official Account as a friend/i.test(body_)) {
        markMemberBlockedStatus_(to, true);
      }
      return { success: false, error: 'LINE push ตอบกลับ ' + code + ': ' + body_ };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function sendLinePush_(lineUid, text) {
  return sendLineMessages_(lineUid, [{ type: 'text', text: text }]);
}

// ==================== เช็คลูกค้าที่บล็อก LINE OA ไปแล้ว ====================
// วิธีหลัก (แม่นสุด เช็คได้ทุกคนพร้อมกัน): ดึงรายชื่อ LINE UID ที่ "ยังเป็นเพื่อน" กับ OA อยู่จาก Messaging
// API (/v2/bot/followers/ids) แล้วเทียบกับสมาชิกทั้งหมดในชีต Members — ใครไม่อยู่ในลิสต์นี้ = บล็อกแล้ว
// (หรือกดลบเพื่อนไปแล้ว ซึ่ง LINE ไม่แยกสองกรณีนี้ให้ผ่าน API นี้)
function getAllFollowerLineUids_() {
  var ids = {};
  var next = null;
  var guard = 0;
  do {
    var url = 'https://api.line.me/v2/bot/followers/ids?limit=1000' + (next ? '&start=' + encodeURIComponent(next) : '');
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('เรียก followers/ids ล้มเหลว (' + res.getResponseCode() + '): ' + res.getContentText());
    }
    var body = JSON.parse(res.getContentText());
    (body.userIds || []).forEach(function (uid) { ids[uid] = true; });
    next = body.next || null;
    guard++; // กันลูปไม่รู้จบถ้า LINE ส่ง next ผิดปกติ
  } while (next && guard < 500);
  return ids;
}

// เทียบสมาชิกทั้งหมดกับลิสต์ผู้ติดตามล่าสุด แล้วอัปเดตคอลัมน์ 16-18 ของชีต Members ทีเดียวทั้งชีต
// เรียกเองได้จากแท็บ "ลูกค้าบล็อกเรา" ในหน้าแอดมิน หรือปล่อยให้ trigger รายวันเรียกอัตโนมัติ (ดู
// setupDailyBlockSyncTrigger ด้านล่าง — ต้องกดรันฟังก์ชันนั้นเองครั้งเดียวจาก Apps Script editor ก่อน)

// ==================== ⚡ เพิ่ม — ปิดใช้งานอัตโนมัติเมื่อหมดอายุ ====================
// กติกา: ทุกอย่างที่มี "วันหมดอายุที่แน่นอน" พอเลยวันนั้นแล้ว ช่องเปิดใช้งานต้องเป็น FALSE เสมอ
// เดิมระบบไม่เคยปิดให้ ใช้วิธีกรองทิ้งตอนอ่าน (isExpired_) แทน ซึ่งทำงานถูกต้องก็จริง แต่เปิดชีตมาแล้ว
// อ่านไม่ออกว่าใบไหนยังใช้ได้อยู่ เพราะเห็น TRUE เต็มไปหมด
//
// ปิดตอนไหน: หลังเลย 23:59:59 ของวันหมดอายุแล้วเท่านั้น (ใช้ isExpired_ ตัวเดียวกับที่ทุกจุดใช้อยู่
// จึงไม่มีทางปิดก่อนเวลา และไม่ทำให้พฤติกรรมเดิมเปลี่ยน เพราะของเดิมกรองแถวพวกนี้ทิ้งอยู่แล้ว)
// แถวที่ยังไม่ถึงวันเริ่มใช้ / ไม่ได้กำหนดวันหมดอายุ จะไม่ถูกแตะ

var EXPIRY_DISABLE_LOG_SHEET_ = 'Expiry_Disable_Log';

// nameCol/activeCol/expiryCol เป็นเลขคอลัมน์แบบ 1-based ตามหัวตารางจริงของแต่ละชีต
var EXPIRY_AUTO_DISABLE_TARGETS_ = [
  { sheet: 'Member_Privileges', label: 'สิทธิพิเศษสมาชิก',        nameCol: 2, activeCol: 8, expiryCol: 5  },
  { sheet: 'Coupons',           label: 'คูปองทั้งร้าน',           nameCol: 1, activeCol: 8, expiryCol: 7  },
  { sheet: 'Signup_Privileges', label: 'สิทธิ์ต้อนรับสมาชิกใหม่', nameCol: 1, activeCol: 8, expiryCol: 12 },
  { sheet: 'Points_Promos',     label: 'โปรแต้มสะสม',             nameCol: 1, activeCol: 3, expiryCol: 5  },
  { sheet: 'Rewards_Catalog',   label: 'ของรางวัลแลกคะแนน',       nameCol: 1, activeCol: 8, expiryCol: 13 }
];

function ensureExpiryDisableLogSheet_() {
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName(EXPIRY_DISABLE_LOG_SHEET_);
  if (!sheet) {
    sheet = ss.insertSheet(EXPIRY_DISABLE_LOG_SHEET_);
    sheet.appendRow(['เวลาที่ปิด', 'ชีต', 'แถวที่', 'ชื่อรายการ', 'วันหมดอายุ']);
  }
  return sheet;
}

// ไล่ปิดทุกชีตในลิสต์ คืนสรุปว่าปิดไปกี่รายการต่อชีต
function deactivateExpiredRows_() {
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var now = new Date();
  var logRows = [];
  var summary = [];
  var total = 0;

  EXPIRY_AUTO_DISABLE_TARGETS_.forEach(function (t) {
    try {
      var sheet = ss.getSheetByName(t.sheet);
      if (!sheet) return;
      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) return;

      var maxCol = Math.max(t.nameCol, t.activeCol, t.expiryCol);
      if (sheet.getLastColumn() < maxCol) return;   // ชีตเก่ายังไม่มีคอลัมน์นั้น ข้ามไปเฉยๆ

      var data = sheet.getRange(2, 1, lastRow - 1, maxCol).getValues();
      var activeCol = sheet.getRange(2, t.activeCol, lastRow - 1, 1).getValues();
      var changed = 0;

      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var isActive = row[t.activeCol - 1] === true || String(row[t.activeCol - 1]).toUpperCase() === 'TRUE';
        if (!isActive) continue;
        var expiry = row[t.expiryCol - 1];
        if (!(expiry instanceof Date)) continue;    // ไม่ได้กำหนดวันหมดอายุ = ไม่มีกำหนด ไม่ต้องปิด
        if (!isExpired_(expiry, now)) continue;     // ยังไม่เลย 23:59:59 ของวันหมดอายุ

        activeCol[i][0] = false;
        changed++;
        logRows.push([now, t.sheet, i + 2, String(row[t.nameCol - 1] || ''), expiry]);
      }

      if (changed) {
        sheet.getRange(2, t.activeCol, activeCol.length, 1).setValues(activeCol);
        summary.push({ sheet: t.sheet, label: t.label, disabled: changed });
        total += changed;
      }
    } catch (e) {
      Logger.log('deactivateExpiredRows_ ชีต ' + t.sheet + ' ไม่สำเร็จ: ' + e.toString());
    }
  });

  if (logRows.length) {
    try {
      var logSheet = ensureExpiryDisableLogSheet_();
      logSheet.getRange(logSheet.getLastRow() + 1, 1, logRows.length, 5).setValues(logRows);
    } catch (e) {
      Logger.log('deactivateExpiredRows_ บันทึก log ไม่สำเร็จ: ' + e.toString());
    }
  }
  return { total: total, summary: summary };
}

// เรียกจากหน้า Admin (กดเองเมื่อไหร่ก็ได้)
function runExpiryAutoDisable(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var r = deactivateExpiredRows_();
    return { success: true, total: r.total, summary: r.summary };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ให้ trigger รายวันเรียก (ไม่มีพารามิเตอร์ ตามข้อกำหนดของ time-driven trigger)
function runExpiryAutoDisableDaily() {
  var r = deactivateExpiredRows_();
  Logger.log('ปิดรายการที่หมดอายุอัตโนมัติ: ' + r.total + ' รายการ');
}

// รันเองครั้งเดียวจาก Apps Script editor เพื่อตั้งให้ปิดอัตโนมัติทุกวันตอนตี 1
// (ตี 1 = ก่อนงานอื่นของระบบ และเลยเที่ยงคืนมาแล้ว สิทธิ์ที่หมดเมื่อวานจึงถูกปิดตั้งแต่ต้นวัน)
function installExpiryAutoDisableTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runExpiryAutoDisableDaily') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runExpiryAutoDisableDaily').timeBased().everyDays(1).atHour(1).create();
  return { success: true };
}

function syncBlockedMembersStatus() {
  var followerIds = getAllFollowerLineUids_();
  var sheet = ensureMembersSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, checked: 0, blockedCount: 0 };
  var uidCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var statusCol = sheet.getRange(2, 16, lastRow - 1, 3).getValues(); // [บล็อก, เช็คล่าสุด, บล็อกครั้งแรก]
  var now = new Date();
  var checked = 0, blockedCount = 0;
  for (var i = 0; i < uidCol.length; i++) {
    var uid = uidCol[i][0];
    if (!uid) continue;
    var isBlocked = !followerIds[uid];
    var wasBlocked = statusCol[i][0] === true;
    if (isBlocked) blockedCount++;
    checked++;
    statusCol[i][0] = isBlocked;
    // ⚡ แก้ — คอลัมน์ 17 "วันที่เช็ค": ถ้าบล็อกอยู่แล้วจากรอบก่อน ต้องคงวันที่เดิมไว้ ไม่เดินตามวันที่เช็ค
    // ทุกวัน (เดิมเขียนทับด้วย now ทุกรอบ ทำให้ดูไม่ออกว่าลูกค้าบล็อกเรามาตั้งแต่เมื่อไหร่)
    // คนที่ยังไม่บล็อก ยังอัปเดตเป็นวันที่เช็คล่าสุดตามปกติ
    if (!isBlocked) statusCol[i][1] = now;
    else if (!wasBlocked || !statusCol[i][1]) statusCol[i][1] = now;
    // ⚡ เพิ่ม — "บล็อกครั้งแรกเมื่อ" คือเวลาที่ระบบเช็คเจอว่าเปลี่ยนจาก "ยังไม่บล็อก" เป็น "บล็อก" (ประมาณ
    // ไม่ใช่เวลาที่ลูกค้ากดบล็อกจริง เพราะไม่มี webhook เรียลไทม์) ถ้าบล็อกอยู่แล้วจากรอบก่อน ไม่แตะวันที่เดิม
    // ถ้าปลดบล็อกแล้ว เคลียร์ทิ้ง เผื่อบล็อกใหม่ภายหลังจะได้นับเป็นรอบใหม่ ไม่ใช้วันที่รอบเก่าค้างอยู่
    if (isBlocked && !wasBlocked) statusCol[i][2] = now;
    else if (!isBlocked) statusCol[i][2] = '';
  }
  sheet.getRange(2, 16, statusCol.length, 3).setValues(statusCol);

  // ⚡ เพิ่ม — เกาะ trigger รายวันตัวนี้ไปปิดรายการที่หมดอายุให้ด้วย เผื่อยังไม่ได้ติดตั้ง trigger แยกของ
  // runExpiryAutoDisableDaily (ติดตั้งได้ที่ installExpiryAutoDisableTrigger) จะได้ทำงานแน่นอนทุกวัน
  // ถ้าติดตั้งทั้งสองตัว รันซ้ำก็ไม่มีผลเสีย เพราะแถวที่ปิดไปแล้วจะถูกข้ามในรอบถัดไป
  try { deactivateExpiredRows_(); } catch (e) { Logger.log('ปิดรายการหมดอายุอัตโนมัติไม่สำเร็จ: ' + e.toString()); }

  return { success: true, checked: checked, blockedCount: blockedCount };
}

// อัปเดตสถานะบล็อกทันทีทีละคน (ใช้เมื่อรู้ผลจากการส่งข้อความจริง — ดูจุดเรียกใน sendLineMessages_)
function markMemberBlockedStatus_(lineUid, isBlocked) {
  try {
    var rowIndex = findMemberRowIndex_(lineUid);
    if (rowIndex < 2) return; // ไม่ใช่สมาชิก (เช่น ADMIN_GROUP_ID) หรือหาไม่เจอ ข้ามไปเฉยๆ
    var sheet = ensureMembersSheet_();
    var prev = sheet.getRange(rowIndex, 16, 1, 3).getValues()[0];
    var wasBlocked = prev[0] === true;
    var now = new Date();
    var firstBlockedAt = (isBlocked && !wasBlocked) ? now : (isBlocked ? prev[2] : '');
    // ⚡ แก้ — กติกาเดียวกับ syncBlockedMembersStatus: คนที่บล็อกอยู่แล้วคงวันที่เดิมไว้ ไม่เดินตามวันที่เช็ค
    var checkedAt = (!isBlocked || !wasBlocked || !prev[1]) ? now : prev[1];
    sheet.getRange(rowIndex, 16, 1, 3).setValues([[isBlocked, checkedAt, firstBlockedAt]]);
  } catch (e) {
    Logger.log('markMemberBlockedStatus_ ล้มเหลว: ' + e.toString());
  }
}

// รันเองครั้งเดียวจาก Apps Script editor (เลือกฟังก์ชันนี้แล้วกด ▶ Run) เพื่อตั้งให้เช็คบล็อกอัตโนมัติทุกวัน
// ตอนตี 3 — รันซ้ำได้เรื่อยๆ ไม่สร้าง trigger ซ้ำซ้อน (ลบของเก่าก่อนเสมอ)
function setupDailyBlockSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncBlockedMembersStatus') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncBlockedMembersStatus').timeBased().everyDays(1).atHour(3).create();
}

// ให้แอดมินเรียกจากหน้า admin.html (ตรวจ PIN ก่อนเสมอเหมือนฟังก์ชันแอดมินตัวอื่นๆ ในไฟล์นี้)
function runBlockedMembersSync(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    return syncBlockedMembersStatus();
  } catch (e) {
    return { success: false, error: e.toString() };
  }
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

function checkAndNotifyNewPrivileges_() {
  try {
    var sheet = ensurePrivilegesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var data = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
    var now = new Date();

    data.forEach(function (row, idx) {
      var lineUid = row[0];
      var privilegeName = row[1];
      var type = row[2];
      var value = row[3];
      var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
      var notified = row[8] === true || String(row[8]).toUpperCase() === 'TRUE';
      var startDate = row[9];
      var restriction = row[10], freeProduct = row[11], freeQty = row[12], freeDiscountPercent = row[14];
      if (!lineUid || !privilegeName || !active || notified) return;
      if (startDate && new Date(startDate) > now) return;

      var valueText = privilegeValueText_(type, value, restriction, freeProduct, freeQty, freeDiscountPercent);
      var message = '🎉 ยินดีด้วยค่ะ! คุณได้รับสิทธิ์พิเศษใหม่:\n\n"' + privilegeName + '" (' + valueText + ')\n\nสิทธิ์นี้จะถูกใช้อัตโนมัติตอนคุณสั่งซื้อสินค้าครั้งถัดไปในหน้าร้าน Em-O-Cha ไม่ต้องกรอกโค้ดใดๆ เลย ขอบคุณที่รักเอมโอชานะคะ 🙏';

      var result = sendLinePush_(lineUid, message);
      if (result.success) {
        sheet.getRange(idx + 2, 9).setValue(true);
      }
    });
  } catch (e) {
    Logger.log('checkAndNotifyNewPrivileges_ error: ' + e.toString());
  }
}

function createPrivilegeNotifyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkAndNotifyNewPrivileges_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkAndNotifyNewPrivileges_')
    .timeBased()
    .everyMinutes(10)
    .create();
  return 'ตั้งเวลาสแกนแจ้งเตือนสิทธิ์ใหม่ทุก 10 นาทีเรียบร้อยแล้ว';
}

// ==================== โปรโมชั่นวันเกิด / เดือนเกิด ====================
// ตั้งค่าจากหน้า Admin เก็บเป็น JSON เดียว เพื่อให้เพิ่ม/ลดสิทธิ์ราย Tier ได้โดยไม่ต้องแก้โค้ด
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
  var allowed = ['none', 'percent', 'fixed', 'bogo', 'ship_percent', 'ship_fixed', 'gift', 'price', 'ship_price'];
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
    freeQty: Math.max(0, parseFloat(src.freeQty) || 0),
    // ⚡ เพิ่ม (29/9/69) — ติ๊ก = สิทธิ์วันเกิดใบนี้ใช้ร่วมกับคูปอง/ส่วนลดอื่นได้ (เหมือนช่องติ๊กของสิทธิพิเศษสมาชิก)
    stackable: src.stackable === true || src.stackable === 'true'
  };
}

function getBirthdayPromoConfigForAdmin(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  return { success: true, config: getBirthdayPromoConfig_(), tiers: getTierConfig_() };
}

function updateBirthdayPromoConfig(pin, configJson) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var incoming = typeof configJson === 'string' ? JSON.parse(configJson) : (configJson || {});
    var normalized = { birthday: {}, birthMonth: {} };
    ['birthday', 'birthMonth'].forEach(function (mode) {
      var src = incoming[mode] || {};
      normalized[mode] = {
        enabled: src.enabled === true || src.enabled === 'true',
        notifyDays: isNaN(parseInt(src.notifyDays)) ? 3 : Math.max(0, parseInt(src.notifyDays)),
        lineMessage: String(src.lineMessage || '').trim(),
        rewards: (Array.isArray(src.rewards) ? src.rewards : []).map(normalizeBirthdayPromoReward_)
      };
      if (mode === 'birthday') {
        normalized[mode].beforeDays = isNaN(parseInt(src.beforeDays)) ? 3 : Math.max(0, parseInt(src.beforeDays));
        normalized[mode].afterDays = isNaN(parseInt(src.afterDays)) ? 3 : Math.max(0, parseInt(src.afterDays));
      }
      normalized[mode].rewards.forEach(function (r) {
        if (!r.enabled) return;
        if (!r.id) r.id = 'promo_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1000000);
        if (!r.tierKey) throw new Error('กรุณาเลือกระดับสมาชิกของสิทธิ์วันเกิดให้ครบ');
        if (!r.name && (r.type !== 'none' || r.points > 0)) throw new Error('กรุณากรอกชื่อสิทธิ์ของระดับ ' + r.tierKey);
        if (r.type === 'gift' && !r.freeProduct) throw new Error('กรุณาระบุชื่อสินค้าหรือของพรีเมียมที่จะแถม');
        if (r.type === 'gift' && !r.freeQty) r.freeQty = 1;
      });
    });
    PropertiesService.getScriptProperties().setProperty(BIRTHDAY_PROMO_CONFIG_KEY_, JSON.stringify(normalized));
    createBirthdayPromoTrigger_();
    return { success: true, message: 'บันทึกและตั้งเวลาตรวจโปรวันเกิดทุกวันเรียบร้อยแล้ว' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function ensureBirthdayGrantLogSheet_() {
  if (_sheetCache_.birthdayGrantLog) return _sheetCache_.birthdayGrantLog;
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName('Birthday_Promo_Log');
  if (!sheet) {
    sheet = ss.insertSheet('Birthday_Promo_Log');
    sheet.appendRow(['LINE UID', 'โหมด', 'รอบสิทธิ์', 'Tier ตอนให้', 'รหัสสิทธิ์', 'วันที่ให้', 'วันเริ่มใช้', 'วันหมดอายุ', 'ส่ง LINE แล้ว(TRUE/FALSE)', 'รายละเอียด']);
  }
  _sheetCache_.birthdayGrantLog = sheet;
  return sheet;
}

function birthdayDateForYear_(birthValue, year) {
  if (!birthValue) return null;
  // ⚡ แก้ (29/9/69) — หน้าสมัครสมาชิกเก็บวันเกิดเป็น "วัน/เดือน/ปี" (เช่น 09/03/2001 = 9 มี.ค.) เดิมใช้ new Date()
  // ซึ่งอ่านเป็น "เดือน/วัน" (ได้ 3 ก.ย.) และอ่านไม่ออกเลยถ้าวันเกิน 12 — แยกวัน/เดือนเองทุกรูปแบบที่มีในชีต
  var month, day;
  if (birthValue instanceof Date) {
    if (isNaN(birthValue.getTime())) return null;
    month = birthValue.getMonth(); day = birthValue.getDate();
  } else {
    var text = String(birthValue).trim(), mt;
    if ((mt = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(text))) { day = parseInt(mt[1], 10); month = parseInt(mt[2], 10) - 1; }
    else if ((mt = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text))) { day = parseInt(mt[3], 10); month = parseInt(mt[2], 10) - 1; }
    else return null;
    if (!(month >= 0 && month <= 11) || !(day >= 1 && day <= 31)) return null;
  }
  // 29 ก.พ. ในปีที่ไม่อธิกสุรทิน ให้ถือเป็นวันสุดท้ายของเดือน ก.พ.
  var lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

function dateOnly_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addCalendarDays_(d, days) { var r = dateOnly_(d); r.setDate(r.getDate() + days); return r; }
function sameDate_(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function birthdayDateLabel_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Bangkok', 'd/M/yyyy'); }

function getBirthdayGrantKeys_() {
  var sheet = ensureBirthdayGrantLogSheet_();
  var last = sheet.getLastRow();
  var keys = {};
  if (last <= 1) return keys;
  sheet.getRange(2, 1, last - 1, 5).getValues().forEach(function (row) {
    keys[String(row[0]) + '|' + String(row[1]) + '|' + String(row[2]) + '|' + String(row[4])] = true;
  });
  return keys;
}

function renderBirthdayLineMessage_(template, memberName, tierName, startDate, endDate, rewardText, mode) {
  var fallback = mode === 'birthday'
    ? '🎂 สุขสันต์วันเกิดค่ะ {name}!\n\nสิทธิพิเศษวันเกิดของคุณ: {rewards}\nใช้ได้ {startDate} ถึง {endDate}\n\nใช้พร้อมคูปองอื่นได้เลยค่ะ 💚'
    : '🎉 เดือนเกิดของคุณใกล้มาแล้ว {name}!\n\nสิทธิพิเศษเดือนเกิด: {rewards}\nใช้ได้ {startDate} ถึง {endDate}\n\nใช้พร้อมคูปองอื่นได้เลยค่ะ 💚';
  var text = String(template || fallback);
  var values = { name: memberName || 'สมาชิกคนพิเศษ', tier: tierName || '-', startDate: birthdayDateLabel_(startDate), endDate: birthdayDateLabel_(endDate), rewards: rewardText || 'สิทธิพิเศษสำหรับคุณ' };
  return text.replace(/\{(name|tier|startDate|endDate|rewards)\}/g, function (_, key) { return values[key]; });
}

// คะแนนที่ผูกไว้กับออเดอร์ซึ่งยังรอแนบสลิป: ยังไม่ตัดออกจากยอดสมาชิกจริง
// แต่ต้องไม่นำไปใช้ซ้ำกับออเดอร์ใหม่ระหว่างรอชำระเงิน
function parsePendingPointsReservation_(remark) {
  var match = String(remark || '').match(/🎯 คะแนนรอหัก:\s*(\d+)\s*คะแนน\s*\(-฿([\d.]+)\)/);
  return match ? { points: parseInt(match[1], 10) || 0, discount: parseFloat(match[2]) || 0 } : { points: 0, discount: 0 };
}

// ⚡ แก้ (บั๊ก) — เดิมมองหา "คะแนนที่จองไว้กับออเดอร์ที่ยังไม่จ่าย" จากท้ายชีตแค่ 1,500 แถวสุดท้ายเท่านั้น
// แต่ชีต Revenue ใช้ร่วมกับช่องทางอื่น (Shopee/TikTok) ที่มีแถวเพิ่มเร็วกว่ามาก ถ้าลูกค้ามีออเดอร์ค้างจ่าย
// ที่เก่ากว่านั้น ระบบจะมองไม่เห็นคะแนนที่จองไว้เลย แล้วปล่อยให้เอาคะแนนก้อนเดิมไปใช้ซ้ำในออเดอร์ใหม่ได้
// (คะแนนหายไปจากระบบจริงตอนแนบสลิป แต่ตอนคำนวณกลับนับว่ายังมีอยู่) — เป็นเรื่องตัวเลขคะแนน จึงต้องครอบคลุมจริง
//
// วิธีแก้แบบไม่แลกกับความเร็ว: ยังกวาดท้ายชีตรวดเดียวเหมือนเดิม (ยิง API รอบเดียว ครอบคลุมเคสปกติเกือบทั้งหมด)
// แล้ว "เก็บตก" เฉพาะแถวของเบอร์นี้ที่อยู่เหนือหน้าต่างนั้นขึ้นไป ผ่านดัชนีแถวรายเบอร์ที่แคชไว้อยู่แล้ว (ตัวเดียว
// กับที่หน้ารถเข็นใช้ จึงมักอุ่นอยู่แล้ว) — ถ้าไม่มีแถวเก่าเลยก็ไม่ต้องอ่านเพิ่มสักรอบ ซึ่งเป็นกรณีส่วนใหญ่
var PENDING_POINTS_RECENT_WINDOW_ = 1500;
var PENDING_POINTS_OLDER_ROWS_MAX_ = 12; // เก็บตกย้อนหลังไม่เกินกี่แถวของเบอร์นี้ กันเคสลูกค้าเก่าที่มีประวัติยาวมาก

// อ่านคะแนนที่จองไว้จากแถว Revenue 1 แถว (คอลัมน์ 1 เลขที่ออเดอร์, 3 ชื่อสินค้า/สถานะยกเลิก, 11 สลิป, 20 หมายเหตุ)
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

// allowCache = true ใช้ได้เฉพาะ "จุดที่เอาไปแสดงผล" เท่านั้น (หน้าคำนวณยอด/หน้าสิทธิพิเศษ ซึ่งลูกค้ากดปรับ
// ตะกร้า/คูปอง/คะแนนทีละนิดทำให้ถูกเรียกซ้ำหลายรอบติดๆ กัน) — จุดที่ "ตัดสินใจจริง" คือ createShopOrder
// ต้องเรียกแบบไม่ใช้แคชเสมอ เพราะเป็นจังหวะที่จองคะแนนลงชีตจริง ห้ามตัดสินจากตัวเลขเก่าแม้แต่วินาทีเดียว
// แคชจะถูกล้างทันทีที่มีการสั่งซื้อ/แนบสลิปสำเร็จ (ดู invalidatePendingPointsCache_) ตัวเลขจึงตามทันเสมอ
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

// ภาพเค้กวันเกิดที่อัปโหลดไว้ใน GitHub (ต้องเป็นไฟล์ public และเปิดผ่าน raw URL ได้)
var BIRTHDAY_CAKE_IMAGE_URL_ = 'https://raw.githubusercontent.com/Em-O-Cha/Order/main/cake.png';

function buildBirthdayPromoFlexMessage_(template, memberName, tierName, startDate, endDate, rewardText, mode) {
  var isMonth = mode === 'birthMonth';
  var title = isMonth ? 'เดือนเกิดของคุณมาถึงแล้ว!' : 'สุขสันต์วันเกิดค่ะ!';
  var subtitle = isMonth ? 'สิทธิพิเศษเดือนเกิดเฉพาะคุณ' : 'สิทธิพิเศษวันเกิดเฉพาะคุณ';
  var customText = renderBirthdayLineMessage_(template, memberName, tierName, startDate, endDate, rewardText, mode);
  var body = [ buildOrderHeaderCard_('🎂', title, subtitle) ];
  body.push({ type: 'text', text: 'คุณ' + (memberName || 'สมาชิกคนพิเศษ') + ' · ' + (tierName || 'สมาชิก'), size: 'sm', weight: 'bold', color: '#424242', margin: 'lg', wrap: true });
  body.push({
    type: 'box', layout: 'vertical', margin: 'md', cornerRadius: '12px', backgroundColor: '#fff0ef', paddingAll: '12px',
    contents: [
      { type: 'text', text: '🎁 สิทธิพิเศษของคุณ', size: 'xs', color: '#a50d0c', weight: 'bold' },
      { type: 'text', text: rewardText || '-', size: 'sm', color: '#a50d0c', weight: 'bold', margin: 'xs', wrap: true }
    ]
  });
  body.push({ type: 'separator', margin: 'lg' });
  body.push({ type: 'text', text: 'ใช้สิทธิ์ได้', size: 'xs', color: '#757575', margin: 'lg' });
  body.push({ type: 'text', text: birthdayDateLabel_(startDate) + ' – ' + birthdayDateLabel_(endDate), size: 'md', color: '#a50d0c', weight: 'bold', margin: 'xs', wrap: true });
  body.push({ type: 'text', text: 'ใช้ร่วมกับคูปองอื่นได้', size: 'xs', color: '#9c3e3c', margin: 'xs' });
  // เก็บข้อความที่แอดมินกำหนดไว้ใน Flex ด้วย เพื่อไม่ให้ข้อความสำคัญหายไป
  if (String(template || '').trim()) body.push({ type: 'text', text: customText, size: 'xxs', color: '#757575', margin: 'lg', wrap: true });
  var bubble = {
    type: 'bubble', size: 'giga',
    hero: { type: 'image', url: BIRTHDAY_CAKE_IMAGE_URL_, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' },
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md', contents: body }
  };
  return { type: 'flex', altText: title + ' · ใช้สิทธิ์ได้ ' + birthdayDateLabel_(startDate) + ' ถึง ' + birthdayDateLabel_(endDate), contents: bubble };
}

function grantBirthdayPromoReward_(memberRowIndex, memberRow, tier, mode, cycleKey, reward, startDate, endDate, logSheet) {
  var uid = String(memberRow[0] || '');
  var details = [];
  if (reward.points > 0) {
    var points = parseInt(memberRow[5]) || 0;
    var spend = parseFloat(memberRow[11]) || 0;
    var newPoints = points + reward.points;
    ensureMembersSheet_().getRange(memberRowIndex, 6).setValue(newPoints);
    logPointsTransaction_(uid, 'earn', 'โบนัส' + (mode === 'birthday' ? 'วันเกิด' : 'เดือนเกิด') + ' (' + reward.name + ')', reward.points, newPoints);
    var upgraded = resolveTierNoDowngrade_(memberRow[6], spend, newPoints);
    if (upgraded && upgraded.key !== memberRow[6]) ensureMembersSheet_().getRange(memberRowIndex, 7).setValue(upgraded.key);
    details.push('+' + reward.points + ' คะแนน');
  }
  if (reward.type !== 'none') {
    var storedType = reward.type === 'gift' ? 'bogo' : reward.type;
    var storedValue = reward.type === 'gift' ? 1 : reward.value;
    var storedRestriction = reward.type === 'gift' ? '' : reward.restriction;
    var storedFreeQty = reward.type === 'gift' ? (reward.freeQty || 1) : reward.freeQty;
    ensurePrivilegesSheet_().appendRow([
      uid, reward.name, storedType, storedValue, endDate,
      mode === 'birthday' ? 'ระบบโปรวันเกิดอัตโนมัติ' : 'ระบบโปรเดือนเกิดอัตโนมัติ', new Date(), true, true,
      startDate, storedRestriction, reward.freeProduct || '', storedFreeQty || '', reward.minPurchase || ''
    ]);
    var privSheet_ = ensurePrivilegesSheet_();
    setPrivilegeStackable_(privSheet_, privSheet_.getLastRow(), 1, reward.stackable);
    details.push(privilegeValueText_(storedType, storedValue, storedRestriction, reward.freeProduct, storedFreeQty));
  }
  logSheet.appendRow([uid, mode, cycleKey, tier.key, reward.id, new Date(), startDate, endDate, false, details.join(' · ')]);
  return details.join(' · ') || reward.name;
}

// ⚡ เพิ่ม (29/9/69) — หน้าแอดมิน แท็บโปรวันเกิด: สมาชิกที่เกิดในเดือนที่เลือก มีกี่คน ใครบ้าง และได้สิทธิ์/ส่ง LINE/ใช้สิทธิ์ของปีนี้แล้วหรือยัง
// (อ่านอย่างเดียว ไม่สร้างชีต/ไม่แก้ข้อมูล)
function listBirthdayMembers(pin, month) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var now = new Date();
    var year = now.getFullYear();
    var m = parseInt(month, 10);
    if (!(m >= 1 && m <= 12)) m = now.getMonth() + 1;
    var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);

    // ประวัติการให้สิทธิ์วันเกิด/เดือนเกิดของปีนี้ (รอบของเดือนที่เลือก)
    var grantsByUid = {};
    var logSheet = ss.getSheetByName('Birthday_Promo_Log');
    if (logSheet && logSheet.getLastRow() > 1) {
      logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 10).getValues().forEach(function (r) {
        var uid = String(r[0] || ''), cycle = String(r[2] || '');
        if (!uid || cycle.indexOf(String(year)) !== 0) return;
        if (cycle.indexOf('-birthday-' + m + '-') === -1 && cycle !== year + '-birthmonth-' + m) return;
        (grantsByUid[uid] = grantsByUid[uid] || []).push({
          mode: String(r[1]) === 'birthday' ? 'วันเกิด' : 'เดือนเกิด', detail: String(r[9] || ''), lineSent: r[8] === true || String(r[8]).toUpperCase() === 'TRUE'
        });
      });
    }

    // สิทธิ์วันเกิด/เดือนเกิดที่ระบบสร้างให้ในปีนี้ -> ใช้แล้วหรือยัง
    var privByUid = {};
    var privSheet = ss.getSheetByName('Member_Privileges');
    if (privSheet && privSheet.getLastRow() > 1) {
      var pw = Math.max(Math.min(privSheet.getLastColumn(), 17), 8);
      privSheet.getRange(2, 1, privSheet.getLastRow() - 1, pw).getValues().forEach(function (r) {
        var by = String(r[5] || '');
        if (by !== 'ระบบโปรวันเกิดอัตโนมัติ' && by !== 'ระบบโปรเดือนเกิดอัตโนมัติ') return;
        var given = r[6] instanceof Date ? r[6] : new Date(r[6]);
        if (isNaN(given.getTime()) || given.getFullYear() !== year) return;
        var active = r[7] === true || String(r[7]).toUpperCase() === 'TRUE';
        var usedAt = pw >= 17 ? r[16] : '';
        var uid = String(r[0] || '');
        (privByUid[uid] = privByUid[uid] || []).push({ name: String(r[1] || ''), used: !active && !!usedAt, closed: !active && !usedAt });
      });
    }

    var memberSheet = ensureMembersSheet_();
    var last = memberSheet.getLastRow();
    var rows = last > 1 ? memberSheet.getRange(2, 1, last - 1, 16).getValues() : [];
    var results = [], noBirthday = 0, total = 0;
    rows.forEach(function (row) {
      var uid = String(row[0] || '');
      if (!uid) return;
      total++;
      var d = birthdayDateForYear_(row[10], year);
      if (!d) { noBirthday++; return; }
      if (d.getMonth() + 1 !== m) return;
      var tier = resolveTierByStoredValue_(row[6], row[11] || 0, uid);
      results.push({
        day: d.getDate(), name: String(row[9] || row[1] || ''), lineName: String(row[1] || ''), phone: String(row[3] || ''),
        memberCode: String(row[12] || ''), tier: tier.name || '', birthday: String(row[10] || ''),
        blocked: row[15] === true || String(row[15]).toUpperCase() === 'TRUE',
        grants: grantsByUid[uid] || [], privileges: privByUid[uid] || [] // 1 คนมีวันเกิดปีละครั้ง: สิทธิ์วันเกิดของปีนี้คือรอบนี้
      });
    });
    results.sort(function (a, b) { return a.day - b.day || String(a.name).localeCompare(String(b.name)); });
    var cfg = getBirthdayPromoConfig_();
    return {
      success: true, month: m, year: year, count: results.length, totalMembers: total, noBirthdayCount: noBirthday,
      birthdayEnabled: cfg.birthday.enabled, birthMonthEnabled: cfg.birthMonth.enabled, results: results
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ตั้ง Trigger ครั้งเดียว แล้วรันทุกวันเพื่อแจก/แจ้งสิทธิ์ในเวลาตามรอบปฏิทิน
function createBirthdayPromoTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runBirthdayPromotionsDaily_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runBirthdayPromotionsDaily_').timeBased().inTimezone('Asia/Bangkok').atHour(9).everyDays(1).create();
}

function runBirthdayPromotionsDaily_() {
  var config = getBirthdayPromoConfig_();
  if (!config.birthday.enabled && !config.birthMonth.enabled) return { success: true, granted: 0, notified: 0 };
  var today = dateOnly_(new Date());
  var memberSheet = ensureMembersSheet_();
  var lastRow = memberSheet.getLastRow();
  if (lastRow <= 1) return { success: true, granted: 0, notified: 0 };
  var members = memberSheet.getRange(2, 1, lastRow - 1, 12).getValues();
  var grantKeys = getBirthdayGrantKeys_();
  var grantSheet = ensureBirthdayGrantLogSheet_();
  var granted = 0, notified = 0;

  members.forEach(function (member, index) {
    var uid = String(member[0] || '');
    var birth = birthdayDateForYear_(member[10], today.getFullYear());
    if (!uid || !birth) return;
    var tier = resolveTierByStoredValue_(member[6], member[11] || 0, uid);
    ['birthday', 'birthMonth'].forEach(function (mode) {
      var section = config[mode];
      if (!section.enabled) return;
      var startDate, endDate, grantDate, cycleKey;
      if (mode === 'birthday') {
        // ช่วง 3 วันก่อนวันเกิดอาจข้ามปี (เช่น เกิด 1 ม.ค.) จึงเลือกวันเกิดรอบถัดไปเมื่อรอบปีนี้ผ่านไปแล้ว
        var currentStart = addCalendarDays_(birth, -section.beforeDays);
        var currentEnd = addCalendarDays_(birth, section.afterDays);
        if (today.getTime() > currentEnd.getTime()) birth = birthdayDateForYear_(member[10], today.getFullYear() + 1);
        startDate = addCalendarDays_(birth, -section.beforeDays);
        endDate = addCalendarDays_(birth, section.afterDays);
        grantDate = startDate;
        cycleKey = birth.getFullYear() + '-birthday-' + (birth.getMonth() + 1) + '-' + birth.getDate();
      } else {
        startDate = new Date(today.getFullYear(), birth.getMonth(), 1);
        endDate = new Date(today.getFullYear(), birth.getMonth() + 1, 0);
        grantDate = addCalendarDays_(startDate, -section.notifyDays);
        cycleKey = today.getFullYear() + '-birthmonth-' + (birth.getMonth() + 1);
      }
      // ถ้าติดตั้งระบบระหว่างช่วงใช้สิทธิ์ ยังแจกให้ได้ แต่จะไม่ย้อนส่ง LINE หลังวันแจ้งเตือน
      if (today.getTime() < grantDate.getTime() || today.getTime() > endDate.getTime()) return;
      var rewardLines = [];
      section.rewards.forEach(function (reward) {
        if (!reward.enabled || (reward.tierKey !== 'all' && reward.tierKey !== tier.key)) return;
        var key = uid + '|' + mode + '|' + cycleKey + '|' + reward.id;
        if (grantKeys[key]) return;
        rewardLines.push(grantBirthdayPromoReward_(index + 2, member, tier, mode, cycleKey, reward, startDate, endDate, grantSheet));
        grantKeys[key] = true;
        granted++;
      });
      if (rewardLines.length && sameDate_(today, grantDate)) {
        var flexMessage = buildBirthdayPromoFlexMessage_(section.lineMessage, member[9] || member[1], tier.name, startDate, endDate, rewardLines.join(', '), mode);
        var sent = sendLineMessages_(uid, [flexMessage]);
        if (sent && sent.success) {
          notified++;
          var logLast = grantSheet.getLastRow();
          if (logLast > 1) grantSheet.getRange(logLast - rewardLines.length + 1, 9, rewardLines.length, 1).setValue(true);
        }
      }
    });
  });
  return { success: true, granted: granted, notified: notified };
}
// ⚡ แก้ (perf) — ค้นเฉพาะแถวสิทธิ์ของ LINE UID นี้ด้วย TextFinder (ค้นในชั้น Sheets service เลย ไม่ต้อง
// โอนข้อมูลทั้งชีตมาที่สคริปต์ก่อน) แทนที่จะดึงสิทธิ์ "ของสมาชิกทุกคนที่เคยให้มาทั้งหมด" (รวมแถวที่หมดอายุ
// ไปนานแล้วแต่ไม่เคยลบออก) มาเช็คทีละแถวว่าเป็นของ UID นี้หรือเปล่า — ยิ่งร้านมีสมาชิกสมัครเพิ่มเรื่อยๆ
// (สมัครแต่ละคนได้สิทธิ์ต้อนรับอัตโนมัติ 2 แถว) ชีตนี้ก็ยิ่งโตและยิ่งอ่านช้าลงเรื่อยๆ ไม่มีวันเบา
// ⚡ แก้ (perf) — จุดนี้คือคอขวดที่หนักที่สุดของหน้าคำนวณยอดชำระและหน้าเปิดร้าน: เดิมใช้ createTextFinder()
// ไล่หาทั้งชีต (ตัว finder เองก็ช้าอยู่แล้ว) แล้ว "ยิง getRange().getValues() แยกอีก 1 รอบต่อสิทธิ์ 1 ใบ"
// ลูกค้าที่มีสิทธิ์ 8 ใบ = ยิง Google Sheets API 9 รอบต่อการคำนวณยอด 1 ครั้ง (รอบละ ~100-300ms) — หนักขึ้น
// เรื่อยๆ ตามจำนวนสิทธิ์ที่ลูกค้าสะสมไว้
// เปลี่ยนมาใช้ดัชนี "แถวของ UID นี้" ที่แคชไว้ (getKeyRowIndexCached_ — เก็บแค่ลิสต์เลขแถว จึงเล็กพอจะเก็บลง
// CacheService ได้จริงแม้ชีตจะโตแค่ไหน และตามแถวใหม่ที่ต่อท้ายมาได้เสมอ) แล้วอ่านค่าจริงของแถวเหล่านั้นผ่าน
// readRowsMerged_ ซึ่งรวบช่วงที่ใกล้กันให้อ่านทีเดียว — เหลือยิง API ไม่กี่รอบแทนที่จะเป็น 1 รอบต่อสิทธิ์ 1 ใบ
// สำคัญ: ค่าในแถว (โดยเฉพาะคอลัมน์ 8 "เปิดใช้งาน") ยังอ่านสดจากชีตทุกครั้ง ไม่ได้เอามาจากแคช สิทธิ์ที่เพิ่งถูก
// ใช้ไป/ถูกปิดโดยแอดมินจึงมีผลทันที ส่วนที่แคชไว้คือ "อยู่แถวไหน" เท่านั้น ซึ่งไม่มีวันเปลี่ยน (ชีตนี้ต่อท้าย
// อย่างเดียว ไม่เคยลบแถว และไม่มีจุดไหนเขียนทับคอลัมน์ LINE UID ของแถวเก่าเลย)
var PRIVILEGE_ROWS_CACHE_TTL_ = 600;
function getPrivilegeRowsForLineUid_(lineUid) {
  if (!lineUid) return [];
  var sheet = ensurePrivilegesSheet_();
  var rowNumbers = getKeyRowIndexCached_(sheet, 1, String(lineUid), 'privrows_', PRIVILEGE_ROWS_CACHE_TTL_, normalizeAsString_);
  if (!rowNumbers.length) return [];
  // อ่านกว้างพอให้ถึงคอลัมน์ "ใช้ร่วมกับคูปองได้" (ถ้ามี) ด้วย
  return readRowsMerged_(sheet, rowNumbers, Math.max(15, privilegeStackableCol_(), privilegeDetailCol_()));
}

// ==================== ⚡ เพิ่ม (26/9/69) — สิทธิพิเศษที่ "ใช้ร่วมกับคูปอง/ส่วนลดอื่นได้" ====================
// กติกาเดิม: ลูกค้าถือสิทธิพิเศษ = ตัดคูปอง/ส่วนลดอื่นทั้งหมด — ตอนนี้แอดมินเลือกได้ต่อสิทธิ์ (คอลัมน์ท้ายชีต
// Member_Privileges หาจากชื่อหัวคอลัมน์) ติ๊ก = สิทธิ์นี้ไม่ล็อกคูปอง ลูกค้าได้ทั้งสิทธิ์และคูปองพร้อมกัน
// ว่าง/FALSE (สิทธิ์เดิมทั้งหมด) = กติกาเดิมทุกประการ
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

// ⚡ เพิ่ม (1/10/69) — "ข้อความรายละเอียดบนตั๋ว" ที่แอดมินพิมพ์เอง (เว้นว่าง = หน้าร้านสร้างข้อความจากค่าโปรให้เอง)
// คอลัมน์ท้ายชีต Member_Privileges / Coupons หาจากชื่อหัวคอลัมน์ สร้างเมื่อมีคนกรอกครั้งแรก
var PROMO_DETAIL_HEADER_ = 'ข้อความรายละเอียดบนตั๋ว(เว้นว่าง=ระบบสร้างให้)';
var privilegeDetailColCache_ = null;
function privilegeDetailCol_(create) {
  if (privilegeDetailColCache_ !== null && (privilegeDetailColCache_ > 0 || !create)) return privilegeDetailColCache_;
  var sheet = ensurePrivilegesSheet_();
  var width = Math.max(sheet.getLastColumn(), 15);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var c = header.indexOf(PROMO_DETAIL_HEADER_) + 1;
  if (!c && create) { c = width + 1; sheet.getRange(1, c).setValue(PROMO_DETAIL_HEADER_); }
  privilegeDetailColCache_ = c;
  return c;
}
function privilegeDetailText_(row) {
  var c = privilegeDetailCol_();
  return c ? String(row[c - 1] || '').trim() : '';
}
// บันทึกข้อความ (undefined = หน้าแอดมินรุ่นเก่า ไม่แตะค่าเดิม / ว่างและยังไม่มีคอลัมน์ = ไม่ต้องสร้าง)
function setPrivilegeDetailText_(sheet, firstRow, numRows, detailText) {
  if (detailText === undefined || detailText === null || !numRows) return;
  var text = String(detailText).trim();
  if (!text && !privilegeDetailCol_()) return;
  sheet.getRange(firstRow, privilegeDetailCol_(true), numRows, 1).setValue(text);
}
function cleanPromoDetailText_(v) {
  return (v === undefined || v === null) ? v : String(v).replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
}

function isStackablePrivilegeRow_(row) {
  var c = privilegeStackableCol_();
  if (!c) return false;
  var v = row[c - 1];
  return v === true || String(v).toUpperCase() === 'TRUE';
}

// ตั้งค่า "ใช้ร่วมกับคูปองได้" ให้แถวสิทธิ์ (ไม่ติ๊กและยังไม่มีคอลัมน์ = ไม่ต้องสร้างคอลัมน์)
function setPrivilegeStackable_(sheet, firstRow, numRows, stackable) {
  var on = (stackable === true || stackable === 'true');
  if (!numRows || (!on && !privilegeStackableCol_())) return;
  var c = privilegeStackableCol_(true);
  sheet.getRange(firstRow, c, numRows, 1).setValue(on);
}

function getAllPrivilegesWithDiscount_(lineUid, subtotal, items, priceMap, shippingCost, usedByOrderRows) {
  try {
    var rows = getPrivilegeRowsForLineUid_(lineUid);
    if (!rows.length) return [];
    var now = new Date();
    var itemsSafe = items || [];
    var results = [];
    // สิทธิ์ที่ออเดอร์ที่กำลังตรวจยอดซ้ำใช้ไปเองตอนสั่งซื้อ (ระบบปิดไว้แล้ว) นับว่ายังใช้ได้กับออเดอร์นั้น
    var usedByOrder_ = {};
    (usedByOrderRows || []).forEach(function (n) { usedByOrder_[String(n)] = true; });
    rows.forEach(function (entry) {
      var row = entry.values;
      var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
      if (!active && !usedByOrder_[String(entry.rowIndex)]) return;
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
        stackable: isStackablePrivilegeRow_(row), restriction: String(row[10] || ''), freeGifts: calc.freeGifts
      });
    });
    return results;
  } catch (e) {
    return [];
  }
}

function getAppliedPrivileges_(lineUid, subtotal, excludeRowIndexes, items, priceMap, shippingCost, usedByOrderRows) {
  var excludeList = Array.isArray(excludeRowIndexes) ? excludeRowIndexes : (excludeRowIndexes ? [excludeRowIndexes] : []);
  var excludeSet = {};
  excludeList.forEach(function (n) { if (n !== '' && n !== null && n !== undefined) excludeSet[String(n)] = true; });
  var all = getAllPrivilegesWithDiscount_(lineUid, subtotal, items, priceMap, shippingCost, usedByOrderRows);
  return all.filter(function (p) { return !excludeSet[String(p.rowIndex)]; });
}

// ⚡ เพิ่ม (4/10/69) — ข้อความบนตั๋วหน้าร้าน (เมื่อแอดมินไม่ได้พิมพ์เอง) ของสิทธิ์ที่หน้าร้านไม่รู้รายละเอียด:
// ลด % เฉพาะสินค้า / ซื้อครบ X ชิ้น ชิ้นถัดไปลด Y% — ประเภทอื่นคืนค่าว่าง (หน้าร้านสร้างข้อความเองเหมือนเดิม)
function autoPrivilegeTicketText_(row) {
  return autoTicketTextFor_(row[2], row[3], row[10], row[12], row[14]);
}
function autoTicketTextFor_(type, value, restriction, freeQty, freeDiscountPercent) {
  type = String(type || '');
  var products = String(restriction || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  if (type === 'percent' && products.length) return 'ลด ' + (parseFloat(value) || 0) + '% เฉพาะ ' + products.join(', ');
  // ⚡ เพิ่ม (6/10/69) — ค่าส่งราคาพิเศษที่ส่งฟรีเมื่อซื้อครบ N ชิ้น (หน้าร้านไม่รู้ N เอง)
  if (type === 'ship_price' && (parseFloat(freeQty) || 0) > 0 && (parseFloat(value) || 0) > 0) return 'ค่าส่ง ' + (parseFloat(value) || 0) + ' บาท · ซื้อครบ ' + (parseFloat(freeQty) || 0) + ' ชิ้นส่งฟรี';
  if (type === 'bogo' && freeDiscountPercent !== '' && freeDiscountPercent !== null && freeDiscountPercent !== undefined) {
    var pct = parseFloat(freeDiscountPercent);
    var qty = parseFloat(freeQty) || 1;
    if (!isNaN(pct) && pct < 100) {
      return 'ซื้อ' + (products.length ? products.join(' หรือ ') + ' ' : '') + 'ครบ ' + (parseFloat(value) || 0) + ' ชิ้น ชิ้นถัดไปลด ' + pct + '%' + (qty > 1 ? ' (' + qty + ' ชิ้น)' : '');
    }
  }
  return '';
}
// ⚡ เพิ่ม (4/10/69) — ช่อง "ข้อความบนตั๋ว" ว่าง = เก็บข้อความอัตโนมัติลงชีตไว้เลย หน้าร้าน (ที่อ่านผ่าน Supabase)
// จึงแสดงสินค้าที่ร่วมโปรได้ทันทีโดยไม่ต้องแก้ฝั่ง Supabase — undefined (หน้าแอดมินรุ่นเก่า) = ไม่แตะ
function privilegeDetailOrAuto_(detailText, type, value, restriction, freeQty, freeDiscountPercent) {
  var cleaned = cleanPromoDetailText_(detailText);
  if (cleaned === undefined || cleaned === null || cleaned) return cleaned;
  return autoTicketTextFor_(type, value, restriction, freeQty, freeDiscountPercent);
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
      restriction: row[2] === 'price' ? String(row[10] || '') : '', // ขายราคาพิเศษ: หน้าร้านใช้ขึ้นราคาแดงบนการ์ดสินค้า
      priceSpec: row[2] === 'price' ? (parsePriceSpec_(row[11]) || undefined) : undefined, // ⚡ เพิ่ม (1/10/69) — ราคา/ของแถมแยกตามสินค้า
      detailText: privilegeDetailText_(row) || autoPrivilegeTicketText_(row) || undefined, // ⚡ เพิ่ม (1/10/69) — ข้อความบนตั๋วที่แอดมินพิมพ์เอง (4/10/69: ว่าง = ข้อความอัตโนมัติของ ลด % เฉพาะสินค้า / ชิ้นถัดไปลด %)
      stackable: isStackablePrivilegeRow_(row), // ⚡ เพิ่ม (29/9/69) — หน้าร้านขึ้นป้าย "ใช้ร่วมกับโปรอื่นได้/ไม่ได้" บนตั๋วสิทธิ์
      exclusive: isExclusivePromo_(String(row[2] || ''), row[10], isStackablePrivilegeRow_(row)),
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

// ข้อมูลที่หน้าสั่งซื้อจำเป็นต้องใช้ตอนเปิดหน้า รวมเป็นคำขอเดียวเพื่อลดเวลารอ LIFF
// (เดิมเบราว์เซอร์เรียก API 7 ตัวพร้อมกัน ทำให้ Apps Script และ LINE verify ทำงานซ้ำโดยไม่จำเป็น)
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

    // ⚡ แก้ (29/9/69) — เลิกซ่อนคูปองตอนถือสิทธิพิเศษ ทุกโปรใช้ได้ ตัดสินตอนชำระเงินจากช่องติ๊กใช้ร่วมได้
    // (ดู applyPromoExclusivity_) หน้าร้านขึ้นป้ายบนตั๋วจาก stackable/exclusive แทน
    var privilegesForShop_ = getMyPrivilegesForLineUid_(profile.sub);
    var shopPrivilegeLocked_ = false;
    var couponsResult = getActiveCoupons();
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

// ==================== เมนู "คะแนนสะสม" ====================
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

// ⚡ เพิ่ม (25/8/69) — ให้ลูกค้ายกเลิกคำสั่งซื้อของตัวเองได้ (เฉพาะออเดอร์ที่ "ยังไม่แนบสลิป" เท่านั้น — ถ้า
// แนบสลิปแล้วถือว่าอยู่ระหว่างตรวจสอบเงินจริง ให้ติดต่อทีมงานแทน กันลูกค้ายกเลิกเองหลังโอนเงินไปแล้วจริง)
// ตรวจสอบว่าเป็นเจ้าของออเดอร์จริง (เทียบเบอร์โทร) ก่อนทำรายการเสมอ กันยกเลิกออเดอร์คนอื่น
//
// ⚡ แก้ (25/8/69 รอบ 2) — ปรับตามที่ขอให้ชัดเจน: ไม่ลบทั้งแถว (กันเลขที่ออเดอร์กระโดดหาย) และไม่ใช้คอลัมน์ L
// แยกต่างหากแล้ว แต่ทำตามสเปกนี้แทน: (1) แทนที่ชื่อสินค้าในคอลัมน์ C ทุกแถวของออเดอร์นี้ด้วยคำว่า "ยกเลิก"
// (2) ล้างยอดเงินที่เกี่ยวข้องทั้งหมดเป็น 0 (ส่วนลดต่อรายการ, ยอดต่อรายการ, ค่าจัดส่ง, ยอดรวม) กันไม่ให้ถูก
// นับไปรวมในยอดขาย/รายงานใดๆ ต่อ (3) เก็บข้อความ "ลูกค้ายกเลิกเอง + วันเวลา" ไว้ที่คอลัมน์ T (Remark) แทนที่
// ข้อความเดิมทั้งหมด — แถวและเลขที่ออเดอร์ (คอลัมน์ A) ยังอยู่ครบเหมือนเดิม ไม่กระทบเลขที่ออเดอร์อื่นในชีตเลย
// การเช็คว่าออเดอร์นี้ถูกยกเลิกไปแล้วหรือยัง ใช้วิธีเช็คคอลัมน์ C ว่าเป็นคำว่า "ยกเลิก" อยู่แล้วหรือไม่
//
// หมายเหตุ: ยังไม่คืนสิทธิ์/คูปองที่ถูกใช้ไปตอนสั่งซื้อกลับให้อัตโนมัติ (ระบบไม่ได้เก็บ rowIndex ของสิทธิ์ที่
// ใช้ไว้แยกต่างหากสำหรับดึงกลับมาคืนทีหลัง) ถ้าลูกค้ายกเลิกออเดอร์ที่เคยใช้สิทธิ์พิเศษไป แอดมินอาจต้องเข้าไป
// เปิดใช้งานสิทธิ์นั้นคืนให้เองที่แท็บ "สมาชิก" หากต้องการให้ลูกค้าใช้สิทธิ์นั้นได้อีกครั้ง
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

    // ⚡ เพิ่ม (4/10/69) — หาสิทธิ์/คูปองที่ออเดอร์นี้จองไว้ก่อน Remark ถูกเขียนทับ แล้วคืนให้ลูกค้าหลังยกเลิก
    var reservedByCancel_ = promoReservedByOrder_(profile.sub, String(mainRow[19] || ''), mainRow[1]);
    var cancelledItems_ = sheet.getRange(targetRow, 3, numRows, 3).getValues()
      .filter(function (it) { return it[0]; })
      .map(function (it) { return { name: String(it[0]), qty: parseFloat(it[1]) || 0, price: parseFloat(it[2]) || 0 }; });
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

    var cancelDiff_ = diffReservedPromos_(reservedByCancel_, [], []);
    releaseReservedPromos_(cancelDiff_, profile.sub, orderId);
    var cancelledInfo_ = { lineUid: profile.sub, amount: Number(mainRow[8]) || 0, items: cancelledItems_ };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }

  // ⚡ เพิ่ม (3/10/69) — ส่ง LINE ยืนยันการยกเลิกให้ลูกค้า (ไม่แจ้งกลุ่มแอดมิน — กลุ่มได้ข้อความเฉพาะตอนแนบสลิป)
  try {
    notifyBuyerOrderCancelled_(cancelledInfo_.lineUid, orderId, cancelledInfo_.items, cancelledInfo_.amount);
  } catch (cancelNotifyErr) {
    Logger.log('cancelShopOrder: ส่งข้อความยกเลิกให้ลูกค้าไม่สำเร็จ: ' + cancelNotifyErr.toString());
  }
  return { success: true, returned: cancelDiff_.returned };
}


// ==================== เมนู "คูปอง" ====================
var ACTIVE_COUPONS_CACHE_KEY_ = 'active_coupons_v3';
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
    var stackableByCode_ = getCouponStackableByCode_();
    var detailByCode_ = getCouponDetailTextByCode_(); // ⚡ เพิ่ม (1/10/69)
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
        stubText: row[15] || '', stackable: !!stackableByCode_[String(row[0]).trim().toUpperCase()],
        exclusive: isExclusivePromo_(String(row[1] || ''), row[9], !!stackableByCode_[String(row[0]).trim().toUpperCase()]),
        priceSpec: row[1] === 'price' ? (parsePriceSpec_(row[11]) || undefined) : undefined, // ⚡ เพิ่ม (1/10/69)
        detailText: detailByCode_[String(row[0]).trim().toUpperCase()] || undefined
      });
    });
    var result = { success: true, results: results };
    try { CacheService.getScriptCache().put(ACTIVE_COUPONS_CACHE_KEY_, JSON.stringify(result), 60); } catch (e) {}
    return result;
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getTierConfigForAdmin() {
  return { success: true, tiers: getTierConfig_(), signupBonus: getSignupBonusPoints_(), signupPrivilege: getSignupPrivilegeConfig_(), pointsRedeemConfig: getPointsRedeemConfig_() };
}
// ==================== Migration ====================
var LEGACY_TIER_ALIASES_ = {
  'เอม silver': 'silver', 'silver': 'silver', 'fan': 'silver', 'members': 'start',
  'เอม gold': 'gold', 'gold': 'gold', 'love': 'gold',
  'เอม vip': 'platinum', 'เอม platinum': 'platinum', 'platinum': 'platinum', 'vip': 'platinum',
  'เอมสตาร์ท': 'start', 'เอม start': 'start', 'start': 'start'
};
function migrateMemberTierColumnToKeys_() {
  var tierConfig = getTierConfig_();
  var validKeys = tierConfig.map(function (t) { return t.key; });
  var sheet = ensureMembersSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 'ไม่มีสมาชิกในระบบ ไม่ต้องทำอะไร';
  var data = sheet.getRange(2, 1, lastRow - 1, 12).getValues();

  var updates = [];
  var alreadyOk = 0;

  data.forEach(function (row, idx) {
    var rawValue = String(row[6] || '').trim();
    var lifetimeSpend = parseFloat(row[11]) || 0;
    var rowNumber = idx + 2;

    if (validKeys.indexOf(rawValue) !== -1) { alreadyOk++; return; }

    var byName = tierConfig.find(function (t) { return t.name === rawValue || (t.nameEn && t.nameEn.toLowerCase() === rawValue.toLowerCase()); });
    if (byName) { updates.push({ rowIndex: rowNumber, newKey: byName.key, reason: 'จับคู่ชื่อแสดงผล/ชื่ออังกฤษได้ตรง ("' + rawValue + '")' }); return; }

    var aliasKey = LEGACY_TIER_ALIASES_[rawValue.toLowerCase()];
    if (aliasKey && validKeys.indexOf(aliasKey) !== -1) { updates.push({ rowIndex: rowNumber, newKey: aliasKey, reason: 'จับคู่จากรายการคำเก่า' }); return; }

    var fallbackTier = calcEligibleTier_(lifetimeSpend, 0);
    updates.push({ rowIndex: rowNumber, newKey: fallbackTier.key, reason: '⚠️ หาไม่เจอเลย คำนวณจากยอดซื้อสะสมแทน' });
  });

  updates.forEach(function (u) {
    sheet.getRange(u.rowIndex, 7).setValue(u.newKey);
  });

  var logLines = ['migrateMemberTierColumnToKeys_ เสร็จสิ้น', 'ถูกต้องอยู่แล้ว (ไม่แตะ): ' + alreadyOk + ' แถว', 'แปลงแล้ว: ' + updates.length + ' แถว'];
  var summary = logLines.join('\n');
  Logger.log(summary);
  return summary;
}

function migrateRewardsCatalogTierKeys_() {
  var tierConfig = getTierConfig_();
  var validKeys = tierConfig.map(function (t) { return t.key; });
  var sheet = ensureRewardsCatalogSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 'ไม่มีของรางวัลในระบบ ไม่ต้องทำอะไร';
  var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

  var updates = [];
  var alreadyOk = 0;
  var skipped = 0;

  data.forEach(function (row, idx) {
    var category = String(row[1] || '').trim();
    if (category !== 'tier_upgrade') { skipped++; return; }
    var rawValue = String(row[3] || '').trim();
    var rowNumber = idx + 2;

    if (validKeys.indexOf(rawValue) !== -1) { alreadyOk++; return; }

    var byName = tierConfig.find(function (t) { return t.name === rawValue || (t.nameEn && t.nameEn.toLowerCase() === rawValue.toLowerCase()); });
    if (byName) { updates.push({ rowIndex: rowNumber, newKey: byName.key }); return; }

    var aliasKey = LEGACY_TIER_ALIASES_[rawValue.toLowerCase()];
    if (aliasKey && validKeys.indexOf(aliasKey) !== -1) { updates.push({ rowIndex: rowNumber, newKey: aliasKey }); return; }

    updates.push({ rowIndex: rowNumber, newKey: null });
  });

  updates.forEach(function (u) {
    if (u.newKey) sheet.getRange(u.rowIndex, 4).setValue(u.newKey);
  });

  var summary = 'migrateRewardsCatalogTierKeys_ เสร็จสิ้น ถูกต้องอยู่แล้ว: ' + alreadyOk + ', ข้าม: ' + skipped + ', แปลงแล้ว: ' + updates.filter(function(u){return u.newKey;}).length;
  Logger.log(summary);
  return summary;
}

// ==================== ค่าจัดส่ง ====================
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

function getShippingConfigForAdmin() {
  return { success: true, brackets: getShippingConfig_() };
}

function debugShippingConfig_(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
    var sheet = ss.getSheetByName('Shipping_Config');
    if (!sheet) return { success: true, sheetExists: false, rawRows: [], cachedValue: null };
    var lastRow = sheet.getLastRow();
    var headerRow = sheet.getRange(1, 1, 1, 2).getValues()[0];
    var rawRows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 2).getValues() : [];
    var cached = CacheService.getScriptCache().get(SHIPPING_CONFIG_CACHE_KEY_);
    return {
      success: true, sheetExists: true, lastRow: lastRow, headerRow: headerRow,
      rawRows: rawRows, cachedValue: cached ? JSON.parse(cached) : null,
      liveCalc: getShippingConfig_()
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function updateShippingConfig(pin, bracketsJson) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var brackets = JSON.parse(bracketsJson);
    if (!Array.isArray(brackets) || !brackets.length) return { success: false, error: 'ข้อมูลตารางราคาไม่ถูกต้อง' };
    var rows = brackets.map(function (b) {
      return [parseFloat(b.maxWeightG) || 0, parseFloat(b.rate) || 0];
    });
    if (rows.some(function (r) { return r[0] <= 0 || r[1] < 0; })) {
      return { success: false, error: 'น้ำหนักต้องมากกว่า 0 และราคาต้องไม่ติดลบทุกแถว' };
    }
    var sheet = ensureShippingConfigSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    CacheService.getScriptCache().remove(SHIPPING_CONFIG_CACHE_KEY_);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==================== ของรางวัลแลกด้วยแต้ม ====================
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

function getRewardsCatalog() {
  try {
    var sheet = ensureRewardsCatalogSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
    var results = [];
    data.forEach(function (row, idx) {
      var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
      if (!active) return;
      if (!isDateRangeActive_(row[11], row[12])) return; // นอกช่วงวันที่โปร (ยังไม่เริ่ม/หมดโปรแล้ว)
      var maxStock = parseInt(row[8]) || 0;
      var redeemedCount = parseInt(row[9]) || 0;
      if (maxStock > 0 && redeemedCount >= maxStock) return;
      results.push({
        rowIndex: idx + 2, name: row[0], category: row[1], categoryLabel: REWARD_CATEGORIES_[row[1]] || row[1],
        type: row[2], value: row[3], detail: row[4] || '',
        pointCost: parseInt(row[5]) || 0, validDays: parseInt(row[6]) || 0,
        remaining: maxStock > 0 ? (maxStock - redeemedCount) : -1,
        image: row[10] ? toDirectImageUrl_(String(row[10]).trim()) : ''
      });
    });
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ⚡ เพิ่ม (perf) — หา "แถวของสมาชิกคนนี้ + ค่าในแถวนั้น" ให้จบในการยิง Sheets API รอบเดียว
// เดิมทุก endpoint ทำ 3 รอบสำหรับข้อมูลแถวเดียวกัน: findMemberRowIndex_ ยิง 2 รอบ (getMaxRows() เช็คขอบเขต
// + getRange(row,1).getValue() เช็คว่า UID ตรงไหม) แล้วผู้เรียกยิง getRange(row,1,1,n).getValues() ต่ออีก 1 รอบ
// ทั้งที่รอบสุดท้ายรอบเดียวก็ตอบได้ครบทั้ง "ตรงไหม" และ "ค่าคืออะไร" อยู่แล้ว (เช็คจาก values[0] === UID)
// ส่วนการเช็คขอบเขตแถวก็ไม่ต้องยิง getMaxRows() ถามก่อน แค่ปล่อยให้ getRange พังแล้วจับด้วย try/catch
// (ถ้าพังก็แปลว่า cache เสีย ไล่สแกนใหม่ตามปกติ ผลลัพธ์เหมือนเดิมเป๊ะ)
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

// คงชื่อเดิมไว้ให้จุดเรียกเดิมทั้ง 20 กว่าจุดใช้ได้เหมือนเดิม แต่ข้างในเหลือการยิง Sheets API รอบเดียวแล้ว
function findMemberRowIndex_(lineUid) {
  var found = getMemberRowByUid_(lineUid, 1);
  return found ? found.rowIndex : -1;
}

function redeemReward(idToken, rewardRowIndex, quantity) {
  var profile;
  try {
    profile = verifyLineIdToken_(idToken);
  } catch (e) {
    return { success: false, error: e.toString() };
  }
  if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ')' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนแลกพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    var qty = Math.max(1, parseInt(quantity) || 1);
    var rewardSheet = ensureRewardsCatalogSheet_();
    var rowIdx = parseInt(rewardRowIndex);
    if (!rowIdx || rowIdx < 2 || rowIdx > rewardSheet.getLastRow()) return { success: false, error: 'ไม่พบของรางวัลนี้' };
    var rewardRow = rewardSheet.getRange(rowIdx, 1, 1, 10).getValues()[0];
    var active = rewardRow[7] === true || String(rewardRow[7]).toUpperCase() === 'TRUE';
    if (!active) return { success: false, error: 'ของรางวัลนี้ปิดใช้งานแล้ว' };
    var maxStock = parseInt(rewardRow[8]) || 0;
    var redeemedCount = parseInt(rewardRow[9]) || 0;
    if (maxStock > 0 && redeemedCount + qty > maxStock) return { success: false, error: 'ของรางวัลนี้เหลือไม่พอ (เหลือ ' + Math.max(0, maxStock - redeemedCount) + ' ชิ้น)' };
    var category = String(rewardRow[1] || 'coupon');

    var pointCost = (parseInt(rewardRow[5]) || 0) * qty;

    var memberSheet = ensureMembersSheet_();
    var memberRowIndex = findMemberRowIndex_(profile.sub);
    var currentPoints = 0, memberName = '', memberPhone = '', memberLifetimeSpend = 0, memberTierName = '';
    if (memberRowIndex !== -1) {
      var mRow = memberSheet.getRange(memberRowIndex, 1, 1, 12).getValues()[0];
      currentPoints = parseInt(mRow[5]) || 0;
      memberName = mRow[9] || mRow[1] || ''; memberPhone = mRow[3] || '';
      memberTierName = mRow[6] || ''; memberLifetimeSpend = parseFloat(mRow[11]) || 0;
    }
    if (memberRowIndex === -1) return { success: false, error: 'กรุณาสมัครสมาชิกก่อนแลกของรางวัล' };
    // ห้ามใช้แคชตรงนี้: เป็นจุดที่ "ตัดสินใจหักคะแนนจริง" เหมือน createShopOrder ถ้าใช้ตัวเลขเก่าแม้แต่
    // วินาทีเดียว ลูกค้าที่เพิ่งสั่งซื้อโดยจองคะแนนไว้ อาจเอาคะแนนก้อนเดิมมาแลกของรางวัลซ้ำได้อีกรอบ
    var reservedPendingPoints_ = getPendingPointsReservedForPhone_(memberPhone, '');
    var availablePointsForReward_ = Math.max(0, currentPoints - reservedPendingPoints_);
    if (availablePointsForReward_ < pointCost) return { success: false, error: 'คะแนนไม่พอ (ใช้ได้ ' + availablePointsForReward_ + ' คะแนน จากคะแนนคงเหลือ ' + currentPoints + ' คะแนน)' };

    if (category === 'tier_upgrade') {
      var tierConfigCheck_ = getTierConfig_();
      var targetTierKeyCheck_ = String(rewardRow[3] || '').trim();
      var targetTierCheck_ = tierConfigCheck_.find(function (t) { return t.key === targetTierKeyCheck_; });
      if (!targetTierCheck_) {
        var aliasedKeyCheck_ = LEGACY_TIER_ALIASES_[targetTierKeyCheck_.toLowerCase()];
        if (aliasedKeyCheck_) targetTierCheck_ = tierConfigCheck_.find(function (t) { return t.key === aliasedKeyCheck_; });
      }
      if (!targetTierCheck_) return { success: false, error: 'ของรางวัลนี้ตั้งค่าระดับเป้าหมายไม่ถูกต้อง กรุณาแจ้งผู้ดูแลระบบ' };
      var currentTierResolvedCheck_ = resolveTierByStoredValue_(memberTierName, memberLifetimeSpend, profile.sub);
      var currentIndexCheck_ = tierConfigCheck_.findIndex(function (t) { return t.key === currentTierResolvedCheck_.key; });
      var targetIndexCheck_ = tierConfigCheck_.indexOf(targetTierCheck_);
      if (targetIndexCheck_ <= currentIndexCheck_) {
        return { success: false, error: 'คุณอยู่ในระดับ "' + currentTierResolvedCheck_.name + '" ซึ่งเท่ากับหรือสูงกว่าระดับ "' + targetTierCheck_.name + '" อยู่แล้ว ไม่สามารถแลกระดับนี้ได้' };
      }
    }

    memberSheet.getRange(memberRowIndex, 6).setValue(currentPoints - pointCost);
    rewardSheet.getRange(rowIdx, 10).setValue(redeemedCount + qty);
    logPointsTransaction_(profile.sub, 'redeem', 'แลก "' + rewardRow[0] + '"' + (qty > 1 ? ' x' + qty : ''), -pointCost, currentPoints - pointCost);

    if (category === 'coupon') {
      var validDays = parseInt(rewardRow[6]) || 0;
      var expiryDate = expiryFromDays_(new Date(), validDays);
      var privilegeSheet = ensurePrivilegesSheet_();
      var rowsToAdd = [];
      for (var q = 0; q < qty; q++) {
        rowsToAdd.push([profile.sub, rewardRow[0], rewardRow[2], rewardRow[3], expiryDate, 'แลกด้วยแต้ม', new Date(), true, false]);
      }
      privilegeSheet.getRange(privilegeSheet.getLastRow() + 1, 1, rowsToAdd.length, 9).setValues(rowsToAdd);
    } else if (category === 'tier_upgrade') {
      var targetTierKey = String(rewardRow[3] || '').trim();
      var tierConfig = getTierConfig_();
      var targetTier = tierConfig.find(function (t) { return t.key === targetTierKey; });
      if (!targetTier) {
        var aliasedKey = LEGACY_TIER_ALIASES_[targetTierKey.toLowerCase()];
        if (aliasedKey) targetTier = tierConfig.find(function (t) { return t.key === aliasedKey; });
      }
      if (targetTier) {
        var currentIndex = tierConfig.findIndex(function (t) { return t.key === memberTierName || t.name === memberTierName; });
        var targetIndex = tierConfig.indexOf(targetTier);
        if (targetIndex > currentIndex) {
          memberSheet.getRange(memberRowIndex, 7).setValue(targetTier.key);
        }
      }
    } else {
      var logSheet = ensureRedemptionLogSheet_();
      logSheet.appendRow([new Date(), profile.sub, memberName, memberPhone, rewardRow[0], category, qty, 'รอดำเนินการ']);
    }

    return { success: true, newPoints: currentPoints - pointCost, rewardName: rewardRow[0], category: category };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
// ==================== หน้า Admin — ตรวจสอบ PIN ====================
// ⚡ เพิ่ม (25/8/69) — ฟังก์ชันกลางเช็คว่า "ตอนนี้อยู่ในช่วงวันเริ่ม-วันสิ้นสุดของโปรนี้หรือไม่" ใช้ร่วมกันได้
// ทุกระบบโปรที่มีช่วงเวลา (สิทธิ์ต้อนรับสมาชิกใหม่, ของรางวัลแลกคะแนน, แนะนำเพื่อนสมัคร, แนะนำเพื่อนซื้อ ฯลฯ)
// แทนที่จะเขียนตรรกะเช็ควันที่ซ้ำๆ กันในแต่ละจุด — startDateStr/endDateStr เป็น string รูปแบบ yyyy-MM-dd
// (จาก input type="date") เว้นว่างได้ทั้งคู่ = ไม่จำกัดช่วงเวลา (ใช้ได้ตลอด)
// ⚡ เพิ่ม (26/8/69) — Google Sheets จะ "แปลง string วันที่ (yyyy-MM-dd) ให้กลายเป็น Date object โดยอัตโนมัติ"
// ทันทีที่บันทึกลงเซลล์ (แม้เราจะ setValue เป็น string ชัดเจนก็ตาม) ทำให้ตอนอ่านกลับมาด้วย getValues()
// ได้ Date object ดิบๆ แทนที่จะเป็น string เหมือนที่คาดไว้ — ถ้าส่ง Date object ดิบแบบนี้กลับไปให้ฝั่งหน้าเว็บ
// ผ่าน google.script.run ตรงๆ จะทำให้ผลลัพธ์ที่ฝั่งเบราว์เซอร์ได้รับกลายเป็น null ทั้งก้อน (ปัญหาที่เจอจริง
// กับ listSignupPrivilegeItems) — ฟังก์ชันนี้แปลงกลับเป็น string 'yyyy-MM-dd' อย่างปลอดภัยเสมอ ไม่ว่าค่าเดิม
// จะเป็น Date object หรือ string อยู่แล้วก็ตาม ใช้แทนการอ่านค่า startDate/endDate ดิบจากชีตทุกจุด
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

function checkAdminPin_(pin) {
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  if (!stored) stored = '1234';
  return String(pin || '').trim() === String(stored).trim();
}

// ⚡ เพิ่ม — แปลง "อายุสิทธิ์ N วัน" เป็นวันหมดอายุจริง
// กติกา: นับวันแรกรวมด้วย และจบที่ 23:59:59 ของวันสุดท้ายเสมอ
//   N = 1  ->  ใช้ได้ถึงสิ้นวันที่ให้/วันที่เริ่ม (ไม่ใช่ข้ามไปเที่ยงคืนวันถัดไป)
//   N = 2  ->  ใช้ได้ถึงสิ้นวันถัดไป
// เดิมใช้ base + N*86400000 ตรงๆ ทำให้ "1 วัน" กลายเป็นใช้ได้ 2 วัน (ถึงเที่ยงคืนของวันถัดไป)
// และได้เวลาเป็น 00:00 ซึ่งอ่านในชีตแล้วสับสนว่าหมดวันไหนกันแน่
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
    var data = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
    var stackCol_ = privilegeStackableCol_();
    var stackVals_ = stackCol_ ? sheet.getRange(2, stackCol_, lastRow - 1, 1).getValues() : [];
    var detailCol_ = privilegeDetailCol_();
    var detailVals_ = detailCol_ ? sheet.getRange(2, detailCol_, lastRow - 1, 1).getValues() : [];
    var now = new Date();
    var results = [];
    data.forEach(function (row, idx) {
      if (String(row[0]) !== String(lineUid)) return;
      var stackRaw_ = stackVals_[idx] ? stackVals_[idx][0] : '';
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
        restriction: row[10] || '', freeProduct: row[11] || '', freeQty: row[12] || '', freeDiscountPercent: row[14],
        stackable: stackRaw_ === true || String(stackRaw_).toUpperCase() === 'TRUE',
        detailText: (function (d) { return d && d === autoPrivilegeTicketText_(row) ? '' : d; })(detailVals_[idx] ? String(detailVals_[idx][0] || '') : '')
      });
    });
    results.sort(function (a, b) { return b.rowIndex - a.rowIndex; });
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ⚡ เพิ่ม (4/10/69) — ส่วนลด % ของชิ้นที่แถม (เฉพาะ bogo · เว้นว่าง = 100% แถมฟรี) ต่ำกว่า 100 = โปร
// "ซื้อครบ X ชิ้น ชิ้นถัดไปลด Y%" ซึ่งไม่ต้องเลือกสินค้าที่แถม (calcPromoDiscount_ ลดจากสินค้าที่ต้องซื้อที่ถูกที่สุด)
function bogoFreeDiscountPercentValue_(type, freeDiscountPercent) {
  if (type !== 'bogo') return '';
  if (freeDiscountPercent === '' || freeDiscountPercent === null || freeDiscountPercent === undefined) return 100;
  return Math.max(0, Math.min(100, parseFloat(freeDiscountPercent) || 0));
}
function bogoNeedsFreeProduct_(type, freeDiscountPercent, freeProduct) {
  return type === 'bogo' && bogoFreeDiscountPercentValue_(type, freeDiscountPercent) >= 100 && !String(freeProduct || '').trim();
}

function addMemberPrivilege(pin, lineUid, name, type, value, expiryDays, startDate, restriction, freeProduct, freeQty, endDate, notifyLine, stackable, detailText, freeDiscountPercent) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    name = String(name || '').trim();
    if (!name) return { success: false, error: 'กรุณากรอกชื่อสิทธิ์' };
    value = priceSpecFallbackValue_(type, value, restriction, freeProduct); // ⚡ เพิ่ม (1/10/69) — ราคาแยกตามสินค้าครบ = ไม่ต้องกรอกมูลค่า
    if (value === '' || value === null || value === undefined) return { success: false, error: 'กรุณากรอกมูลค่า (หรือจำนวนที่ต้องซื้อครบ ถ้าเป็นโปรซื้อครบแถม)' };
    var typeValue = VALID_PRIVILEGE_TYPES_.indexOf(type) !== -1 ? type : 'percent';
    if (bogoNeedsFreeProduct_(typeValue, freeDiscountPercent, freeProduct)) return { success: false, error: 'กรุณาเลือกสินค้าที่จะแถม' };
    var startDateVal = startDate ? parseDateInputStr_(startDate) : '';
    var baseForExpiry = startDateVal || new Date();
    // แก้ — เดิมหน้า Admin ส่ง "วันสิ้นสุด" มาเป็นอาร์กิวเมนต์ตัวสุดท้าย แต่ฟังก์ชันนี้ไม่ได้ประกาศรับไว้
    // JavaScript เลยทิ้งค่านั้นเงียบๆ ผลคือสิทธิ์ที่แอดมินกรอกวันสิ้นสุด (แต่เว้นช่องจำนวนวันไว้) ถูกบันทึก
    // วันหมดอายุเป็นค่าว่าง แล้วไปโผล่ที่หน้าลูกค้าว่า "ไม่มีวันหมดอายุ" ส่วนวันที่กรอกไปอยู่คอลัมน์
    // "วันที่เริ่มใช้ได้" แทน (เพราะ startDate เป็นพารามิเตอร์ที่ประกาศไว้ เลยรอด)
    // ตอนนี้รับ endDate แล้วใช้เป็นวันหมดอายุก่อน ปัดเป็น 23:59:59 ของวันนั้นให้ใช้ได้ทั้งวัน
    // (วิธีเดียวกับสิทธิ์ต้อนรับสมาชิกใหม่ใน registerMember ที่ทำถูกอยู่แล้ว) ไม่ได้กรอกค่อยคิดจากจำนวนวันเหมือนเดิม
    var endDateVal = endDate ? parseDateInputStr_(endDate) : '';
    if (endDateVal) endDateVal.setHours(23, 59, 59, 999);
    var expiryVal = endDateVal || (expiryFromDays_(baseForExpiry, expiryDays));
    ensurePrivilegesSheet_().appendRow([
      lineUid, name, typeValue, parseFloat(value) || 0, expiryVal, 'พนักงาน (Admin Panel)', new Date(), true, false, startDateVal || '',
      String(restriction || '').trim(), storedFreeProductFor_(typeValue, freeProduct), couponFreeQtyCell_(typeValue, freeQty),
      '', bogoFreeDiscountPercentValue_(typeValue, freeDiscountPercent)
    ]);
    var newPrivRow_ = ensurePrivilegesSheet_().getLastRow();
    setPrivilegeStackable_(ensurePrivilegesSheet_(), newPrivRow_, 1, stackable);
    setPrivilegeDetailText_(ensurePrivilegesSheet_(), newPrivRow_, 1, privilegeDetailOrAuto_(detailText, typeValue, value, restriction, freeQty, bogoFreeDiscountPercentValue_(typeValue, freeDiscountPercent)));
    if (!wantsLineAnnouncement_(notifyLine)) skipLineAnnouncement_(ensurePrivilegesSheet_(), newPrivRow_, 1);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function updateMemberPrivilege(pin, rowIndex, name, type, value, expiryDays, startDate, restriction, freeProduct, freeQty, endDate, stackable, detailText, freeDiscountPercent, notifyLine) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    name = String(name || '').trim();
    if (!name) return { success: false, error: 'กรุณากรอกชื่อสิทธิ์' };
    value = priceSpecFallbackValue_(type, value, restriction, freeProduct); // ⚡ เพิ่ม (1/10/69) — ราคาแยกตามสินค้าครบ = ไม่ต้องกรอกมูลค่า
    if (value === '' || value === null || value === undefined) return { success: false, error: 'กรุณากรอกมูลค่า (หรือจำนวนที่ต้องซื้อครบ ถ้าเป็นโปรซื้อครบแถม)' };
    var typeValue = VALID_PRIVILEGE_TYPES_.indexOf(type) !== -1 ? type : 'percent';
    if (bogoNeedsFreeProduct_(typeValue, freeDiscountPercent, freeProduct)) return { success: false, error: 'กรุณาเลือกสินค้าที่จะแถม' };
    var sheet = ensurePrivilegesSheet_();
    var ri = parseInt(rowIndex);
    if (!ri || ri < 2 || ri > sheet.getLastRow()) return { success: false, error: 'ไม่พบสิทธิ์นี้' };
    var startDateVal = startDate ? parseDateInputStr_(startDate) : '';
    var baseForExpiry = startDateVal || new Date();
    // แก้ — เดิมหน้า Admin ส่ง "วันสิ้นสุด" มาเป็นอาร์กิวเมนต์ตัวสุดท้าย แต่ฟังก์ชันนี้ไม่ได้ประกาศรับไว้
    // JavaScript เลยทิ้งค่านั้นเงียบๆ ผลคือสิทธิ์ที่แอดมินกรอกวันสิ้นสุด (แต่เว้นช่องจำนวนวันไว้) ถูกบันทึก
    // วันหมดอายุเป็นค่าว่าง แล้วไปโผล่ที่หน้าลูกค้าว่า "ไม่มีวันหมดอายุ" ส่วนวันที่กรอกไปอยู่คอลัมน์
    // "วันที่เริ่มใช้ได้" แทน (เพราะ startDate เป็นพารามิเตอร์ที่ประกาศไว้ เลยรอด)
    // ตอนนี้รับ endDate แล้วใช้เป็นวันหมดอายุก่อน ปัดเป็น 23:59:59 ของวันนั้นให้ใช้ได้ทั้งวัน
    // (วิธีเดียวกับสิทธิ์ต้อนรับสมาชิกใหม่ใน registerMember ที่ทำถูกอยู่แล้ว) ไม่ได้กรอกค่อยคิดจากจำนวนวันเหมือนเดิม
    var endDateVal = endDate ? parseDateInputStr_(endDate) : '';
    if (endDateVal) endDateVal.setHours(23, 59, 59, 999);
    var expiryVal = endDateVal || (expiryFromDays_(baseForExpiry, expiryDays));
    sheet.getRange(ri, 2, 1, 3).setValues([[name, typeValue, parseFloat(value) || 0]]);
    sheet.getRange(ri, 5).setValue(expiryVal);
    sheet.getRange(ri, 10).setValue(startDateVal || '');
    sheet.getRange(ri, 11).setValue(String(restriction || '').trim());
    sheet.getRange(ri, 12).setValue(storedFreeProductFor_(typeValue, freeProduct));
    sheet.getRange(ri, 13).setValue(couponFreeQtyCell_(typeValue, freeQty));
    // หน้าแอดมินรุ่นเก่าที่ไม่ส่งค่านี้มา (undefined) = ไม่แตะค่าเดิม
    if (freeDiscountPercent !== undefined && freeDiscountPercent !== null) sheet.getRange(ri, 15).setValue(bogoFreeDiscountPercentValue_(typeValue, freeDiscountPercent));
    if (stackable !== undefined && stackable !== null) setPrivilegeStackable_(sheet, ri, 1, stackable);
    var storedPct_ = (freeDiscountPercent === undefined || freeDiscountPercent === null) ? sheet.getRange(ri, 15).getValue() : bogoFreeDiscountPercentValue_(typeValue, freeDiscountPercent);
    setPrivilegeDetailText_(sheet, ri, 1, privilegeDetailOrAuto_(detailText, typeValue, value, restriction, freeQty, storedPct_));
    if (notifyLine === true || notifyLine === 'true') requestLineAnnouncement_(sheet, ri, 1, false);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function deactivatePrivilege(pin, rowIndex) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    ensurePrivilegesSheet_().getRange(parseInt(rowIndex), 8).setValue(false);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ⚡ เพิ่ม — ปิด "เปิดใช้งาน" ทีเดียวให้สิทธิ์ที่แจกไปแล้วทุกแถวใน Member_Privileges ที่ชื่อตรงกันและยังไม่ได้ใช้
// (ยัง TRUE อยู่) ใช้ตอนโปรหมดเวลาไปแล้วแต่มีสมาชิกที่ยังไม่ทันใช้สิทธิ์ค้างอยู่จำนวนมาก — การปิด "เปิดใช้งาน"
// ที่ต้นแบบ (Signup_Privileges/แจกสิทธิ์พิเศษให้ทุกคน) มีผลแค่กับคนที่จะได้รับสิทธิ์ใหม่ต่อจากนี้เท่านั้น
// ไม่ย้อนกลับไปแก้สิทธิ์ที่แจกไปแล้วให้เลย ฟังก์ชันนี้จึงจำเป็นสำหรับการเก็บกวาดสิทธิ์เก่าที่ยังค้างอยู่
function deactivateIssuedPrivilegesByName(pin, name) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    name = String(name || '').trim();
    if (!name) return { success: false, error: 'ไม่พบชื่อสิทธิ์' };
    var sheet = ensurePrivilegesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, count: 0 };
    var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    var count = 0;
    data.forEach(function (row, idx) {
      var rowName = String(row[1] || '').trim();
      var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
      if (rowName === name && active) {
        sheet.getRange(idx + 2, 8).setValue(false);
        count++;
      }
    });
    return { success: true, count: count };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function adjustMemberPoints(pin, lineUid, points, reason) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนแก้ไขพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    var delta = parseInt(points);
    if (isNaN(delta) || delta === 0) return { success: false, error: 'กรุณากรอกจำนวนคะแนน' };
    var sheet = ensureMembersSheet_();
    var rowIndex = findMemberRowIndex_(lineUid);
    if (rowIndex === -1) return { success: false, error: 'ไม่พบสมาชิกนี้' };
    var currentPoints = parseInt(sheet.getRange(rowIndex, 6).getValue()) || 0;
    var newPoints = Math.max(0, currentPoints + delta);
    sheet.getRange(rowIndex, 6).setValue(newPoints);
    var desc = (reason ? String(reason).trim() : '') || (delta > 0 ? 'พนักงานเพิ่มคะแนนให้' : 'พนักงานหักคะแนน');
    logPointsTransaction_(lineUid, delta > 0 ? 'adjust_add' : 'adjust_sub', desc, newPoints - currentPoints, newPoints);
    var notify = delta > 0 ? { added: newPoints - currentPoints, reason: reason ? String(reason).trim() : '', balance: newPoints } : null;
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
  // ⚡ เพิ่ม (6/10/69) — เพิ่มคะแนนให้รายคนจากหน้าแอดมินแล้วส่ง LINE (Flex) แจ้งลูกค้า (ส่งหลังปลดล็อก ไม่ให้ LINE ช้า
  // แล้วถ่วงคนอื่น ส่งไม่สำเร็จก็ไม่กระทบคะแนนที่บันทึกไปแล้ว) — หักคะแนนไม่ส่งแจ้ง
  var lineSent = false;
  if (notify) {
    lineSent = sendLineMessages_(lineUid, [buildPointsAddedFlexMessage_(notify.added, notify.reason, notify.balance)]).success;
  }
  return { success: true, newPoints: newPoints, lineSent: lineSent, lineNotified: !!notify };
}

// การ์ดแจ้งลูกค้าว่าได้รับคะแนนเพิ่ม (แอดมินเพิ่มให้รายคน) — หน้าตาชุดเดียวกับการ์ดคำสั่งซื้อ/พัสดุจัดส่งแล้ว
function buildPointsAddedFlexMessage_(added, reason, balance) {
  var body = [ buildOrderHeaderCard_('🎁', 'ได้รับคะแนนสะสมเพิ่ม', 'Em-O-Cha Club') ];
  body.push({
    type: 'box', layout: 'vertical', margin: 'lg', cornerRadius: '12px', backgroundColor: '#fff0ef', paddingAll: '14px',
    contents: [
      { type: 'text', text: 'คะแนนที่ได้รับ', size: 'xs', color: '#a50d0c', weight: 'bold', align: 'center' },
      { type: 'text', text: '+' + added.toLocaleString('th-TH') + ' คะแนน', size: 'xxl', weight: 'bold', color: '#a50d0c', align: 'center', margin: 'sm' }
    ]
  });
  if (reason) {
    body.push({
      type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents: [
        { type: 'text', text: 'รายละเอียด', size: 'xs', color: '#9e9e9e' },
        { type: 'text', text: reason, size: 'sm', color: '#424242', wrap: true }
      ]
    });
  }
  body.push({ type: 'separator', margin: 'lg' });
  body.push({
    type: 'box', layout: 'horizontal', margin: 'lg', alignItems: 'center', contents: [
      { type: 'text', text: 'คะแนนสะสมคงเหลือ', size: 'sm', weight: 'bold', color: '#a50d0c', flex: 3 },
      { type: 'text', text: balance.toLocaleString('th-TH') + ' คะแนน', size: 'lg', weight: 'bold', color: '#a50d0c', align: 'end', flex: 3 }
    ]
  });
  body.push({
    type: 'button', style: 'primary', color: '#a50d0c', height: 'md', margin: 'lg',
    action: { type: 'uri', label: '🛒 ไปช้อปที่ร้านเอมโอชา', uri: SHOP_LIFF_URL_ }
  });
  body.push({
    type: 'text', text: 'ขอบคุณที่รักเอมโอชานะคะ 🙏', size: 'xs', color: '#757575',
    margin: 'lg', wrap: true, align: 'center'
  });
  var bubble = { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md', contents: body } };
  return {
    type: 'flex', contents: bubble,
    altText: '🎁 ได้รับคะแนนสะสมเพิ่ม ' + added.toLocaleString('th-TH') + ' คะแนน คงเหลือ ' + balance.toLocaleString('th-TH') + ' คะแนน'
  };
}

function addPointsToAllMembers(pin, points, reason) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนแก้ไขพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    var delta = parseInt(points);
    if (isNaN(delta) || delta <= 0) return { success: false, error: 'กรุณากรอกจำนวนคะแนนที่จะแจก (มากกว่า 0)' };
    var sheet = ensureMembersSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, error: 'ยังไม่มีสมาชิกในระบบ' };
    var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    var desc = (reason ? String(reason).trim() : '') || 'กิจกรรมแจกคะแนนทั้งร้าน';
    var newPointsCol = [];
    var logRows = [];
    var now = new Date();
    var memberCount = 0;
    data.forEach(function (row) {
      var uid = row[0];
      if (!uid) { newPointsCol.push([row[5]]); return; }
      var current = parseInt(row[5]) || 0;
      var updated = current + delta;
      newPointsCol.push([updated]);
      logRows.push([now, uid, 'adjust_add', desc, delta, updated]);
      memberCount++;
    });
    sheet.getRange(2, 6, newPointsCol.length, 1).setValues(newPointsCol);
    if (logRows.length) {
      var logSheet = ensurePointsLogSheet_();
      logSheet.getRange(logSheet.getLastRow() + 1, 1, logRows.length, 6).setValues(logRows);
    }
    return { success: true, memberCount: memberCount };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ⚡ แก้ (26/8/69) — เพิ่ม joinDateFrom/joinDateTo (ไม่บังคับ) ให้แจกสิทธิ์แบบ "ย้อนหลัง" ได้ เจาะจงเฉพาะ
// สมาชิกที่ "สมัครไปแล้วในช่วงวันที่ที่กำหนด" เท่านั้น — ใช้แก้ปัญหากรณีอยากให้โปรครอบคลุมทั้งสมาชิกใหม่เดือน
// นี้ (ผ่านระบบสิทธิ์ต้อนรับสมาชิกใหม่อัตโนมัติ) และสมาชิกเก่าที่สมัครไปแล้วก่อนหน้า (เดือนที่แล้ว) ไปพร้อมกัน
// — เพราะสิทธิ์ต้อนรับสมาชิกใหม่ทำงานแค่ตอนสมัครครั้งแรกเท่านั้น ไม่มีทางย้อนไปแจกสมาชิกเก่าได้เองอัตโนมัติ
// ต้องใช้ปุ่มนี้แจกย้อนหลังแยกต่างหาก เว้นว่างทั้งคู่ = แจกทุกคนในระบบเหมือนพฤติกรรมเดิมทุกประการ
function addPrivilegeToAllMembers(pin, name, type, value, expiryDays, startDate, restriction, freeProduct, freeQty, freeDiscountPercent, joinDateFrom, joinDateTo, endDate, notifyLine, stackable, detailText) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนแก้ไขพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    name = String(name || '').trim();
    if (!name) return { success: false, error: 'กรุณากรอกชื่อสิทธิ์' };
    value = priceSpecFallbackValue_(type, value, restriction, freeProduct); // ⚡ เพิ่ม (1/10/69) — ราคาแยกตามสินค้าครบ = ไม่ต้องกรอกมูลค่า
    if (value === '' || value === null || value === undefined) return { success: false, error: 'กรุณากรอกมูลค่า (หรือจำนวนที่ต้องซื้อครบ ถ้าเป็นโปรซื้อครบแถม)' };
    var typeValue = VALID_PRIVILEGE_TYPES_.indexOf(type) !== -1 ? type : 'percent';
    if (bogoNeedsFreeProduct_(typeValue, freeDiscountPercent, freeProduct)) return { success: false, error: 'กรุณาเลือกสินค้าที่จะแถม' };

    var memberSheet = ensureMembersSheet_();
    var memberLastRow = memberSheet.getLastRow();
    if (memberLastRow <= 1) return { success: false, error: 'ยังไม่มีสมาชิกในระบบ' };

    // คอลัมน์ 1 = LINE UID, คอลัมน์ 5 = วันที่สมัคร — อ่านทั้งคู่มาพร้อมกันเพื่อกรองตามวันที่สมัครได้
    var memberRows = memberSheet.getRange(2, 1, memberLastRow - 1, 5).getValues();
    var joinFromDate_ = joinDateFrom ? parseDateInputStr_(joinDateFrom) : null;
    var joinToDate_ = joinDateTo ? parseDateInputStr_(joinDateTo) : null;
    if (joinToDate_) joinToDate_.setHours(23, 59, 59, 999);
    var uids = memberRows.filter(function (r) {
      if (!r[0]) return false;
      if (!joinFromDate_ && !joinToDate_) return true; // ไม่ได้กรอง = แจกทุกคนเหมือนพฤติกรรมเดิม
      var joinDate = r[4] ? new Date(r[4]) : null;
      if (!joinDate) return false; // ไม่มีวันที่สมัครบันทึกไว้ (ไม่ควรเกิดขึ้น) กันไว้ไม่ให้หลุดเข้ามาตอนกรอง
      if (joinFromDate_ && joinDate < joinFromDate_) return false;
      if (joinToDate_ && joinDate > joinToDate_) return false;
      return true;
    }).map(function (r) { return r[0]; });
    if (!uids.length) return { success: false, error: 'ไม่พบสมาชิกที่ตรงเงื่อนไข (ลองเช็คช่วงวันที่สมัครที่กรอกไว้อีกครั้ง)' };

    var startDateVal = startDate ? parseDateInputStr_(startDate) : '';
    var baseForExpiry = startDateVal || new Date();
    // แก้ — เดิมหน้า Admin ส่ง "วันสิ้นสุด" มาเป็นอาร์กิวเมนต์ตัวสุดท้าย แต่ฟังก์ชันนี้ไม่ได้ประกาศรับไว้
    // JavaScript เลยทิ้งค่านั้นเงียบๆ ผลคือสิทธิ์ที่แอดมินกรอกวันสิ้นสุด (แต่เว้นช่องจำนวนวันไว้) ถูกบันทึก
    // วันหมดอายุเป็นค่าว่าง แล้วไปโผล่ที่หน้าลูกค้าว่า "ไม่มีวันหมดอายุ" ส่วนวันที่กรอกไปอยู่คอลัมน์
    // "วันที่เริ่มใช้ได้" แทน (เพราะ startDate เป็นพารามิเตอร์ที่ประกาศไว้ เลยรอด)
    // ตอนนี้รับ endDate แล้วใช้เป็นวันหมดอายุก่อน ปัดเป็น 23:59:59 ของวันนั้นให้ใช้ได้ทั้งวัน
    // (วิธีเดียวกับสิทธิ์ต้อนรับสมาชิกใหม่ใน registerMember ที่ทำถูกอยู่แล้ว) ไม่ได้กรอกค่อยคิดจากจำนวนวันเหมือนเดิม
    var endDateVal = endDate ? parseDateInputStr_(endDate) : '';
    if (endDateVal) endDateVal.setHours(23, 59, 59, 999);
    var expiryVal = endDateVal || (expiryFromDays_(baseForExpiry, expiryDays));
    var now = new Date();
    var restrictionValue = String(restriction || '').trim();
    var freeProductValue = storedFreeProductFor_(typeValue, freeProduct);
    var freeQtyValue = couponFreeQtyCell_(typeValue, freeQty);
    var freeDiscountPercentValue = typeValue === 'bogo'
      ? ((freeDiscountPercent === '' || freeDiscountPercent === null || freeDiscountPercent === undefined) ? 100 : Math.max(0, Math.min(100, parseFloat(freeDiscountPercent) || 0)))
      : '';

    var rows = uids.map(function (uid) {
      return [uid, name, typeValue, parseFloat(value) || 0, expiryVal, 'พนักงาน (แจกทั้งร้าน - Admin Panel)', now, true, false, startDateVal || '', restrictionValue, freeProductValue, freeQtyValue, '', freeDiscountPercentValue];
    });
    var privilegeSheet = ensurePrivilegesSheet_();
    var firstNewRow_ = privilegeSheet.getLastRow() + 1;
    privilegeSheet.getRange(firstNewRow_, 1, rows.length, 15).setValues(rows);
    setPrivilegeStackable_(privilegeSheet, firstNewRow_, rows.length, stackable);
    setPrivilegeDetailText_(privilegeSheet, firstNewRow_, rows.length, privilegeDetailOrAuto_(detailText, typeValue, value, restrictionValue, freeQty, freeDiscountPercentValue));
    if (!wantsLineAnnouncement_(notifyLine)) skipLineAnnouncement_(privilegeSheet, firstNewRow_, rows.length);

    return { success: true, memberCount: rows.length };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
// ==================== หน้า Admin — โค้ดส่วนลดทั้งร้าน / เฉพาะสินค้า ====================
// ช่อง "จำนวนที่แถมต่อรอบ" (คอลัมน์ M) ของ Coupons: bogo = จำนวนที่แถม / ship_price = ส่งฟรีเมื่อซื้อครบกี่ชิ้น (⚡ 6/10/69)
function couponFreeQtyCell_(type, freeQty) {
  if (type === 'bogo') return parseFloat(freeQty) || 0;
  if (type === 'ship_price') return (parseFloat(freeQty) || 0) > 0 ? parseFloat(freeQty) : '';
  return '';
}

function createGlobalCoupon(pin, code, type, value, minPurchase, maxUses, expiry, autoApply, restriction, startDate, freeProduct, freeQty, tierRestriction, freeDiscountPercent, stubText, notifyLine, stackable, detailText) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    code = String(code || '').trim().toUpperCase();
    if (!code) return { success: false, error: 'กรุณากรอกโค้ด' };
    value = priceSpecFallbackValue_(type, value, restriction, freeProduct); // ⚡ เพิ่ม (1/10/69) — ราคาแยกตามสินค้าครบ = ไม่ต้องกรอกมูลค่า
    if (value === '' || value === null || value === undefined) return { success: false, error: 'กรุณากรอกมูลค่าส่วนลด (หรือจำนวนที่ต้องซื้อครบ ถ้าเป็นโปรซื้อครบแถม)' };
    if (type === 'bogo' && !String(freeProduct || '').trim()) return { success: false, error: 'กรุณาเลือกสินค้าที่จะแถม' };
    var sheet = ensureCouponsSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var existingCodes = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) { return String(r[0]).trim().toUpperCase(); });
      if (existingCodes.indexOf(code) !== -1) return { success: false, error: 'มีโค้ดนี้อยู่แล้ว กรุณาใช้ชื่ออื่น' };
    }
    var freeDiscountPercentValue = type === 'bogo'
      ? ((freeDiscountPercent === '' || freeDiscountPercent === null || freeDiscountPercent === undefined) ? 100 : Math.max(0, Math.min(100, parseFloat(freeDiscountPercent) || 0)))
      : '';
    sheet.appendRow([
      code, type, parseFloat(value) || 0, parseFloat(minPurchase) || 0, parseInt(maxUses) || 0, 0,
      expiry ? parseDateInputStr_(expiry) : '', true, !!autoApply, String(restriction || '').trim(),
      startDate ? parseDateInputStr_(startDate) : '',
      storedFreeProductFor_(type, freeProduct),
      couponFreeQtyCell_(type, freeQty),
      String(tierRestriction || '').trim(),
      freeDiscountPercentValue,
      String(stubText || '').trim()
    ]);
    try { CacheService.getScriptCache().remove(ACTIVE_COUPONS_CACHE_KEY_); CacheService.getScriptCache().remove(COUPONS_RAW_CACHE_KEY_); } catch (e2) {}
    // ⚡ เพิ่ม (25/9/69) — จดเวลาสร้างไว้ให้ Notice รู้ว่าเป็นโค้ดใหม่ (ประกาศได้ทั้งโค้ดอัตโนมัติและโค้ดที่ลูกค้าพิมพ์เอง)
    var newCouponRow_ = sheet.getLastRow();
    setCouponCreatedAt_(sheet, newCouponRow_);
    if (!wantsLineAnnouncement_(notifyLine)) skipLineAnnouncement_(sheet, newCouponRow_, 1);
    setCouponStackable_(sheet, newCouponRow_, stackable);
    setCouponDetailText_(sheet, newCouponRow_, cleanPromoDetailText_(detailText));
    try { CacheService.getScriptCache().remove(ACTIVE_COUPONS_CACHE_KEY_); CacheService.getScriptCache().remove(COUPONS_RAW_CACHE_KEY_); } catch (e3) {}
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function updateGlobalCoupon(pin, rowIndex, type, value, minPurchase, maxUses, expiry, autoApply, restriction, startDate, freeProduct, freeQty, tierRestriction, freeDiscountPercent, stubText, stackable, detailText, notifyLine, newCode) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    value = priceSpecFallbackValue_(type, value, restriction, freeProduct); // ⚡ เพิ่ม (1/10/69) — ราคาแยกตามสินค้าครบ = ไม่ต้องกรอกมูลค่า
    if (value === '' || value === null || value === undefined) return { success: false, error: 'กรุณากรอกมูลค่าส่วนลด (หรือจำนวนที่ต้องซื้อครบ ถ้าเป็นโปรซื้อครบแถม)' };
    if (type === 'bogo' && !String(freeProduct || '').trim()) return { success: false, error: 'กรุณาเลือกสินค้าที่จะแถม' };
    var sheet = ensureCouponsSheet_();
    var ri = parseInt(rowIndex);
    if (!ri || ri < 2 || ri > sheet.getLastRow()) return { success: false, error: 'ไม่พบโค้ดนี้' };
    // ⚡ เพิ่ม (6/10/69) — เปลี่ยนชื่อโค้ดได้ (หน้าแอดมินรุ่นเก่าไม่ส่งมา = ไม่แตะชื่อเดิม) ห้ามว่าง/ห้ามซ้ำกับโค้ดอื่น
    if (newCode !== undefined && newCode !== null) {
      var codeValue_ = String(newCode).trim().toUpperCase();
      if (!codeValue_) return { success: false, error: 'กรุณากรอกโค้ด' };
      var codes_ = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim().toUpperCase(); });
      if (codes_[ri - 2] !== codeValue_) {
        if (codes_.some(function (c, idx) { return idx !== ri - 2 && c === codeValue_; })) return { success: false, error: 'มีโค้ดนี้อยู่แล้ว กรุณาใช้ชื่ออื่น' };
        sheet.getRange(ri, 1).setValue(codeValue_);
      }
    }
    sheet.getRange(ri, 2, 1, 3).setValues([[type, parseFloat(value) || 0, parseFloat(minPurchase) || 0]]);
    sheet.getRange(ri, 5).setValue(parseInt(maxUses) || 0);
    sheet.getRange(ri, 7).setValue(expiry ? parseDateInputStr_(expiry) : '');
    sheet.getRange(ri, 9).setValue(!!autoApply);
    sheet.getRange(ri, 10).setValue(String(restriction || '').trim());
    sheet.getRange(ri, 11).setValue(startDate ? parseDateInputStr_(startDate) : '');
    sheet.getRange(ri, 12).setValue(storedFreeProductFor_(type, freeProduct));
    sheet.getRange(ri, 13).setValue(couponFreeQtyCell_(type, freeQty));
    sheet.getRange(ri, 14).setValue(String(tierRestriction || '').trim());
    var freeDiscountPercentValue = type === 'bogo'
      ? ((freeDiscountPercent === '' || freeDiscountPercent === null || freeDiscountPercent === undefined) ? 100 : Math.max(0, Math.min(100, parseFloat(freeDiscountPercent) || 0)))
      : '';
    sheet.getRange(ri, 15).setValue(freeDiscountPercentValue);
    sheet.getRange(ri, 16).setValue(String(stubText || '').trim());
    // หน้าแอดมินรุ่นเก่าที่ไม่ส่งค่านี้มา (undefined) = ไม่แตะค่าเดิม
    if (stackable !== undefined && stackable !== null) setCouponStackable_(sheet, ri, stackable);
    setCouponDetailText_(sheet, ri, cleanPromoDetailText_(detailText));
    if (notifyLine === true || notifyLine === 'true') requestLineAnnouncement_(sheet, ri, 1, true);
    try { CacheService.getScriptCache().remove(ACTIVE_COUPONS_CACHE_KEY_); CacheService.getScriptCache().remove(COUPONS_RAW_CACHE_KEY_); } catch (e2) {}
    return { success: true };
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
    var audienceInfo_ = getCouponAudienceInfoByCode_();
    var stackableByCode_ = getCouponStackableByCode_();
    var detailByCode_ = getCouponDetailTextByCode_(); // ⚡ เพิ่ม (1/10/69)
    var tierConfig = getTierConfig_();
    var now = new Date();
    var results = data.map(function (row, idx) {
      var audInfo_ = audienceInfo_[String(row[0]).trim().toUpperCase()] || { audienceCount: 0, usedCount: 0 };
      var audienceCount_ = audInfo_.audienceCount;
      var usedByCount_ = audInfo_.usedCount;
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
        stubText: row[15] || '',
        audienceCount: audienceCount_, audienceUsedCount: usedByCount_,
        stackable: !!stackableByCode_[String(row[0]).trim().toUpperCase()],
        detailText: detailByCode_[String(row[0]).trim().toUpperCase()] || ''
      };
    });
    results.reverse();
    return { success: true, results: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function toggleGlobalCoupon(pin, rowIndex, active) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    ensureCouponsSheet_().getRange(parseInt(rowIndex), 8).setValue(active === true || active === 'true');
    try { CacheService.getScriptCache().remove(ACTIVE_COUPONS_CACHE_KEY_); CacheService.getScriptCache().remove(COUPONS_RAW_CACHE_KEY_); } catch (e2) {}
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==================== หน้า Admin — จัดการของรางวัลแลกคะแนน ====================
function createRewardCatalogItem(pin, name, category, type, value, detail, pointCost, validDays, maxStock, imageUrl, startDate, endDate) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    if (!name || !category || !pointCost) return { success: false, error: 'ข้อมูลไม่ครบ (ต้องมีชื่อ/หมวดหมู่/คะแนนที่ใช้แลก)' };
    if (!REWARD_CATEGORIES_[category]) return { success: false, error: 'หมวดหมู่ไม่ถูกต้อง' };
    if ((category === 'coupon' || category === 'buy_product') && (!type || !value)) {
      return { success: false, error: 'หมวดนี้ต้องระบุประเภทส่วนลดและมูลค่าด้วย' };
    }
    if (category === 'tier_upgrade' && !value) {
      return { success: false, error: 'กรุณาเลือกระดับเป้าหมาย' };
    }
    if (startDate && endDate && startDate > endDate) return { success: false, error: 'วันเริ่มโปรต้องมาก่อนวันสิ้นสุด' };
    var sheet = ensureRewardsCatalogSheet_();
    sheet.appendRow([
      String(name).trim(), category, type || '', value || '', detail ? String(detail).trim() : '',
      parseInt(pointCost) || 0, parseInt(validDays) || 0, true, parseInt(maxStock) || 0, 0,
      imageUrl ? String(imageUrl).trim() : '', String(startDate || '').trim(), String(endDate || '').trim()
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function updateRewardCatalogItem(pin, rowIndex, name, category, type, value, detail, pointCost, validDays, maxStock, imageUrl, startDate, endDate) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    if (!name || !category || !pointCost) return { success: false, error: 'ข้อมูลไม่ครบ (ต้องมีชื่อ/หมวดหมู่/คะแนนที่ใช้แลก)' };
    if (!REWARD_CATEGORIES_[category]) return { success: false, error: 'หมวดหมู่ไม่ถูกต้อง' };
    if ((category === 'coupon' || category === 'buy_product') && (!type || !value)) {
      return { success: false, error: 'หมวดนี้ต้องระบุประเภทส่วนลดและมูลค่าด้วย' };
    }
    if (category === 'tier_upgrade' && !value) {
      return { success: false, error: 'กรุณาเลือกระดับเป้าหมาย' };
    }
    if (startDate && endDate && startDate > endDate) return { success: false, error: 'วันเริ่มโปรต้องมาก่อนวันสิ้นสุด' };
    var sheet = ensureRewardsCatalogSheet_();
    var row = parseInt(rowIndex);
    if (!row || row < 2 || row > sheet.getLastRow()) return { success: false, error: 'ไม่พบของรางวัลนี้' };
    sheet.getRange(row, 1, 1, 7).setValues([[
      String(name).trim(), category, type || '', value || '', detail ? String(detail).trim() : '',
      parseInt(pointCost) || 0, parseInt(validDays) || 0
    ]]);
    sheet.getRange(row, 9).setValue(parseInt(maxStock) || 0);
    sheet.getRange(row, 11).setValue(imageUrl ? String(imageUrl).trim() : '');
    sheet.getRange(row, 12).setValue(String(startDate || '').trim());
    sheet.getRange(row, 13).setValue(String(endDate || '').trim());
    return { success: true };
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

function toggleRewardCatalogItem(pin, rowIndex, active) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensureRewardsCatalogSheet_();
    sheet.getRange(parseInt(rowIndex), 8).setValue(active === true || active === 'true');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==================== หน้า Admin — คำขอแลกของรางวัลที่รอดำเนินการ ====================
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

function markRedemptionFulfilled(pin, rowIndex) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    ensureRedemptionLogSheet_().getRange(parseInt(rowIndex), 8).setValue('ดำเนินการแล้ว');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
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

// ⚡ เพิ่ม (1/10/69) — ขายราคาพิเศษ (price) แยกราคา/ของแถมตามสินค้า เช่น 4 ซอง = 125 บาท แถมน้ำพริก 2 ซอง,
// 12 ซอง = 375 บาท แถม 6 ซอง — เก็บเป็น JSON ในคอลัมน์ "สินค้าที่แถม" (L) ของชีต Coupons / Member_Privileges
// (คอลัมน์นี้เดิมใช้แค่กับ bogo / โปร price เดิมเป็นค่าว่าง = ราคาเดียวตามช่องมูลค่า ทำงานเหมือนเดิมทุกอย่าง)
// { mode: 'item' = ของแถมคูณจำนวนชิ้นที่ซื้อ | 'order' = ได้ครั้งเดียวต่อออเดอร์,
//   items: [{ p: สินค้า (คำเดียวกับที่ติ๊กเลือก), price: ราคาขาย (null = ใช้ช่องมูลค่า), gift, giftQty, unit }] }
function cleanPriceGiftText_(v) {
  // หมายเหตุออเดอร์แยกรายการด้วย , และ | — ตัดตัวคั่นออกจากชื่อของแถม กันรายการแตก
  return String(v === null || v === undefined ? '' : v).replace(/[,|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parsePriceSpec_(raw) {
  var s = String(raw || '').trim();
  if (s.charAt(0) !== '{') return null;
  var o;
  try { o = JSON.parse(s); } catch (e) { return null; }
  if (!o || !Array.isArray(o.items)) return null;
  var items = [];
  o.items.forEach(function (it) {
    if (!it) return;
    var p = String(it.p || '').trim();
    if (!p) return;
    var price = (it.price === '' || it.price === null || it.price === undefined) ? NaN : parseFloat(it.price);
    var gift = cleanPriceGiftText_(it.gift);
    var giftQty = parseFloat(it.giftQty) || 0;
    if (!gift || giftQty <= 0) { gift = ''; giftQty = 0; }
    items.push({ p: p, price: (isNaN(price) || price < 0) ? null : price, gift: gift, giftQty: giftQty, unit: gift ? cleanPriceGiftText_(it.unit) : '' });
  });
  if (!items.length) return null;
  return { mode: o.mode === 'order' ? 'order' : 'item', items: items };
}

// เก็บเฉพาะสินค้าที่ใส่ราคาเฉพาะหรือมีของแถม — ไม่เหลือเลย = ค่าว่าง (ราคาเดียวแบบเดิม)
function normalizePriceSpec_(raw) {
  var spec = parsePriceSpec_(raw);
  if (!spec) return '';
  var items = spec.items.filter(function (it) { return it.price !== null || it.gift; });
  if (!items.length) return '';
  return JSON.stringify({ mode: spec.mode, items: items });
}

// ค่าที่บันทึกลงคอลัมน์ "สินค้าที่แถม" ตามประเภทโปร
function storedFreeProductFor_(type, freeProduct) {
  if (type === 'bogo') return String(freeProduct || '').trim();
  if (type === 'price') return normalizePriceSpec_(freeProduct);
  return '';
}

// ขายราคาพิเศษที่ใส่ราคาให้ "ทุก" สินค้าที่เลือกแล้ว ช่องมูลค่าเว้นว่างได้ — ใช้ราคาต่ำสุดเป็นมูลค่าโปร (ไว้แสดงผล)
function priceSpecFallbackValue_(type, value, restriction, freeProduct) {
  if (type !== 'price' || !(value === '' || value === null || value === undefined)) return value;
  var spec = parsePriceSpec_(freeProduct);
  if (!spec) return value;
  var keywords = String(restriction || '').split(',').map(function (k) { return k.trim(); }).filter(Boolean);
  var prices = [];
  var allPriced = keywords.length > 0 && keywords.every(function (k) {
    var it = spec.items.filter(function (x) { return x.p === k; })[0];
    if (!it || it.price === null) return false;
    prices.push(it.price);
    return true;
  });
  return allPriced ? Math.min.apply(null, prices) : value;
}

// สินค้าในตะกร้าตรงกับรายการไหนของโปร — คำที่ยาวกว่า (เจาะจงกว่า) มาก่อน เช่น ติ๊กทั้ง "ก๋วยเตี๋ยวเรือ" (ทุกขนาด)
// และ "ก๋วยเตี๋ยวเรือ บรรจุ 12 ซอง" ขนาด 12 ซองใช้ราคา/ของแถมของตัวเอง
function priceSpecMatch_(spec, itemName) {
  var out = { price: null, gift: null };
  if (!spec) return out;
  var name = String(itemName || '').toLowerCase();
  spec.items.filter(function (it) { return name.indexOf(it.p.toLowerCase()) !== -1; })
    .sort(function (a, b) { return b.p.length - a.p.length; })
    .forEach(function (it) {
      if (out.price === null && it.price !== null) out.price = it.price;
      if (!out.gift && it.gift) out.gift = it;
    });
  return out;
}

// ของแถมหลายรายการ (ชื่อคั่นด้วย " หรือ " แบบเดียวกับซื้อครบแถม) = ลูกค้าเลือกได้ เช่น "2 ชิ้น เลือกได้: A / B"
function priceGiftLabel_(name, qty, unit) {
  var opts = String(name || '').split(' หรือ ').map(function (x) { return x.trim(); }).filter(Boolean);
  var u = unit || 'ชิ้น';
  if (opts.length > 1) return qty + ' ' + u + ' เลือกได้: ' + opts.join(' / ');
  return name + ' ' + qty + ' ' + u;
}

function priceGiftsText_(gifts) {
  return (gifts || []).map(function (g) {
    if (!g.picks) return priceGiftLabel_(g.name, g.qty, g.unit);
    // ลูกค้าเลือกรสเองแล้ว เช่น "4 ชิ้น: น้ำพริกน้ำย้อย บรรจุ 6 ซอง ×2 / น้ำพริกตะไคร้หอม บรรจุ 6 ซอง ×1 / ทีมงานเลือกให้ ×1"
    var picked = 0;
    var parts = g.picks.map(function (x) { picked += x.qty; return x.name + ' ×' + x.qty; });
    if (g.qty - picked > 0) parts.push('ทีมงานเลือกให้ ×' + (g.qty - picked));
    return g.qty + ' ' + (g.unit || 'ชิ้น') + ': ' + parts.join(' / ');
  }).join(' + ');
}

// ⚡ เพิ่ม (1/10/69) — ลูกค้าเลือกรสของแถม (โปรขายราคาพิเศษที่ตั้งสินค้าแถมไว้หลายรายการ) ที่หน้าชำระเงิน
// giftChoices = JSON { "<คีย์>": { "<ชื่อสินค้าแถม>": จำนวน } } คีย์ = giftChoiceKey_ (หน้าร้านสร้างแบบเดียวกัน)
// ตรวจกับของแถมที่คำนวณได้จริงเสมอ: รสที่ไม่อยู่ในรายการไม่นับ / เลือกเกินจำนวนตัดทิ้ง / เลือกไม่ครบ = ทีมงานเลือกให้
function giftChoiceKey_(p, g) {
  return (p.code ? 'c:' + p.code : 'p:' + p.rowIndex) + '|' + g.name;
}
function applyGiftChoices_(privileges, coupons, giftChoices) {
  var choices = {};
  try { choices = giftChoices ? (typeof giftChoices === 'string' ? JSON.parse(giftChoices) : giftChoices) : {}; } catch (e) { choices = {}; }
  if (!choices || typeof choices !== 'object') return;
  (privileges || []).concat(coupons || []).forEach(function (p) {
    if (!p || p.type !== 'price' || !p.freeGifts) return;
    p.freeGifts = p.freeGifts.map(function (g) {
      var opts = String(g.name || '').split(' หรือ ').map(function (x) { return x.trim(); }).filter(Boolean);
      var want = choices[giftChoiceKey_(p, g)];
      if (opts.length < 2 || !want || typeof want !== 'object') return g;
      var left = g.qty, picks = [];
      opts.forEach(function (o) {
        var q = Math.max(0, Math.floor(parseFloat(want[o]) || 0));
        q = Math.min(q, left);
        if (q > 0) { picks.push({ name: o, qty: q }); left -= q; }
      });
      var copy = {};
      Object.keys(g).forEach(function (k) { copy[k] = g[k]; });
      copy.picks = picks;
      return copy;
    });
  });
}

// ข้อความโปรแบบแยกราคา เช่น "ราคาพิเศษ ก๋วยเตี๋ยวเรือ บรรจุ 4 ซอง 125 บาท แถม น้ำพริกน้ำย้อย 2 ซอง/ชิ้น, ..."
function priceSpecSummaryText_(value, restriction, spec) {
  var keywords = String(restriction || '').split(',').map(function (k) { return k.trim(); }).filter(Boolean);
  var per = spec.mode === 'order' ? ' ต่อออเดอร์' : ' ต่อชิ้นที่ซื้อ';
  var parts = keywords.map(function (k) {
    var it = spec.items.filter(function (x) { return x.p === k; })[0];
    var price = it && it.price !== null ? it.price : value;
    return k + ' ' + price + ' บาท' + (it && it.gift ? (' แถม ' + priceGiftLabel_(it.gift, it.giftQty, it.unit) + per) : '');
  });
  return 'ราคาพิเศษ ' + parts.join(', ');
}

// หมายเหตุ "📦 ต้องหยิบของแถมเพิ่ม" ของโปร 1 ใบ (ว่าง = ไม่มีของต้องหยิบ)
function physicalFreebieNotePart_(label, p) {
  if (!p) return '';
  if (p.type === 'bogo' && p.physicalFreeQty > 0) return label + ' (แถม ' + p.physicalFreeQty + ' ชิ้น — หยิบใส่ให้ลูกค้าด้วย)';
  if (p.type === 'price' && p.freeGifts && p.freeGifts.length) return label + ' (แถม ' + priceGiftsText_(p.freeGifts) + ' — หยิบใส่ให้ลูกค้าด้วย)';
  return '';
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
  // ⚡ เพิ่ม (29/9/69) — ค่าส่งราคาพิเศษ: ค่าส่งเหลือ value บาท (ค่าส่งจริงถูกกว่าอยู่แล้ว = ไม่ลด)
  if (type === 'ship_price') {
    // ⚡ เพิ่ม (6/10/69) — "ซื้อครบ N ชิ้นส่งฟรี" (N เก็บในช่องจำนวนที่แถม — ว่าง = ค่าส่ง value บาททุกกรณีเหมือนเดิม)
    var shipPrice_ = Math.max(0, value);
    var shipFreeAt_ = parseFloat(promo.freeQty) || 0;
    if (shipFreeAt_ > 0 && computeEligibleInfo_(items || [], restriction).qty >= shipFreeAt_) shipPrice_ = 0;
    result.shippingDiscount = Math.max(0, (shippingCost || 0) - shipPrice_);
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

  // ⚡ เพิ่ม (29/9/69) — ขายราคาพิเศษ: สินค้าที่เลือกทุกชิ้นขายราคา value (ส่วนลด = ราคาปกติ - ราคาพิเศษ ต่อชิ้น)
  // สินค้าที่ราคาปกติต่ำกว่าราคาพิเศษอยู่แล้วไม่ลด / ไม่ได้เลือกสินค้า = ไม่ลด (กันลดทั้งร้านโดยไม่ตั้งใจ)
  if (type === 'price') {
    if (!String(restriction || '').trim()) return result;
    var keywordsPrice = String(restriction).split(',').map(function (k) { return k.trim().toLowerCase(); }).filter(Boolean);
    // ⚡ เพิ่ม (1/10/69) — ราคา/ของแถมแยกตามสินค้า (ไม่มี = ราคาเดียว value เหมือนเดิม)
    var priceSpec = parsePriceSpec_(promo.freeProduct);
    var priceDiscount = 0, gifts = [], giftIndex = {}, giftOrderDone = {};
    (items || []).forEach(function (it) {
      var name = String(it.name).toLowerCase();
      if (!keywordsPrice.some(function (k) { return name.indexOf(k) !== -1; })) return;
      var m = priceSpecMatch_(priceSpec, it.name);
      var unitPrice = m.price !== null ? m.price : value;
      var qty = parseFloat(it.qty) || 0;
      priceDiscount += Math.max(0, (parseFloat(it.price) || 0) - unitPrice) * qty;
      if (!m.gift || qty <= 0) return;
      // ต่อออเดอร์ = ของแถมของสินค้ารายการนั้นได้ครั้งเดียว ไม่ว่าจะซื้อกี่ชิ้น / ต่อชิ้น = คูณจำนวนที่ซื้อ
      var giftQty = priceSpec.mode === 'order' ? (giftOrderDone[m.gift.p] ? 0 : m.gift.giftQty) : m.gift.giftQty * qty;
      giftOrderDone[m.gift.p] = true;
      if (giftQty <= 0) return;
      var gKey = m.gift.gift + '|' + m.gift.unit;
      if (giftIndex[gKey] === undefined) { giftIndex[gKey] = gifts.length; gifts.push({ name: m.gift.gift, qty: 0, unit: m.gift.unit }); }
      gifts[giftIndex[gKey]].qty += giftQty;
    });
    result.productDiscount = priceDiscount;
    if (gifts.length) {
      result.freeGifts = gifts;
      result.physicalFreeQty = gifts.reduce(function (s, g) { return s + g.qty; }, 0);
      result.freeProductName = priceGiftsText_(gifts);
    }
    return result;
  }

  var eligibleInfo = computeEligibleInfo_(items, restriction);
  result.productDiscount = calcDiscountAmount_(type, value, eligibleInfo, !!restriction);
  return result;
}

function dedupeBogoFreebies_(appliedPrivileges, couponEntry) {
  return { privileges: appliedPrivileges, coupon: couponEntry };
}

function privilegeValueText_(type, value, restriction, freeProduct, freeQty, freeDiscountPercent) {
  if (type === 'percent') return 'ลด ' + value + '%' + (String(restriction || '').trim() ? ' (เฉพาะ ' + String(restriction).split(',').map(function (x) { return x.trim(); }).filter(Boolean).join(', ') + ')' : '');
  if (type === 'fixed') return 'ลด ' + value + ' บาท';
  if (type === 'ship_percent') return 'ลดค่าส่ง ' + value + '%';
  if (type === 'ship_fixed') return 'ลดค่าส่ง ' + value + ' บาท';
  if (type === 'ship_price') {
    var shipFreeAtText_ = parseFloat(freeQty) || 0;
    if (!((parseFloat(value) || 0) > 0)) return 'ฟรีค่าจัดส่ง';
    return 'ค่าส่ง ' + value + ' บาท' + (shipFreeAtText_ > 0 ? (' · ซื้อครบ ' + shipFreeAtText_ + ' ชิ้นส่งฟรี') : ' ทุกกรณี');
  }
  if (type === 'price') {
    var priceSpecText_ = parsePriceSpec_(freeProduct);
    if (priceSpecText_ && restriction) return priceSpecSummaryText_(value, restriction, priceSpecText_);
    return 'ราคาพิเศษ ' + value + ' บาท' + (restriction ? ' (' + String(restriction).split(',').map(function (x) { return x.trim(); }).filter(Boolean).join(', ') + ')' : '');
  }
  if (type === 'bogo') {
    var pct = (freeDiscountPercent === '' || freeDiscountPercent === null || freeDiscountPercent === undefined) ? 100 : parseFloat(freeDiscountPercent);
    if (isNaN(pct)) pct = 100;
    var freeText = pct >= 100 ? 'แถม' : ('ลด ' + pct + '%');
    return 'ซื้อ' + (restriction ? restriction + ' ' : '') + 'ครบ ' + value + ' ชิ้น ' + freeText + ' ' + (freeQty || 1) + ' ชิ้นถัดไป';
  }
  return String(type);
}

// ⚡ เพิ่ม (1/9/69) — เดิม findAutoCoupons_ กับ validateCoupon_ อ่านชีต Coupons เองแยกกันคนละรอบ ทั้งที่ถูก
// เรียกพร้อมกันเสมอทุกครั้งที่คำนวณราคา (ทั้งตอนดูตัวอย่างและตอนสั่งซื้อจริงที่ถือ lock อยู่) — cache ข้อมูลดิบ
// ไว้ 15 วินาที (รูปแบบเดียวกับจุดอื่นๆ ที่แก้ไปแล้ว) ให้ใช้ร่วมกัน ลดรอบอ่านชีตซ้ำโดยไม่จำเป็น
// ⚡ แก้ (25/9/69) — อ่านทุกคอลัมน์ (เดิม 15) เพราะมีคอลัมน์ "โค้ดเฉพาะผู้รับ" 2 คอลัมน์ต่อท้าย (หาจากชื่อหัวคอลัมน์
// เพราะคอลัมน์ท้ายชีตมีโปรเจกต์อื่นเพิ่มไว้ด้วย) — เปลี่ยนชื่อ cache key เพราะรูปแบบข้อมูลใน cache เปลี่ยน
var COUPONS_RAW_CACHE_KEY_ = 'coupons_raw_v3';
function getCachedCouponsRawData_() {
  return getCouponsRawBundle_().rows;
}

// { rows: แถวคูปองทุกคอลัมน์, a: index คอลัมน์ผู้รับ (-1 = ไม่มี), u: index คอลัมน์ใช้แล้วโดย (-1 = ไม่มี) }
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
    u: header.indexOf(COUPON_USED_BY_HEADER_),
    s: header.indexOf(COUPON_STACKABLE_HEADER_),
    d: header.indexOf(PROMO_DETAIL_HEADER_) // ⚡ เพิ่ม (1/10/69) — ข้อความบนตั๋วที่แอดมินพิมพ์เอง
  };
  try {
    CacheService.getScriptCache().put(COUPONS_RAW_CACHE_KEY_, JSON.stringify(bundle), 15);
  } catch (e) {
    // ชีตใหญ่เกิน 100KB ต่อ cache key ก็แค่ข้าม cache ไปเฉยๆ ไม่กระทบความถูกต้องของข้อมูลเลย
  }
  return bundle;
}

// ==================== ⚡ เพิ่ม (25/9/69) — โค้ดส่วนลดเฉพาะผู้รับ (สร้างจาก "ยิงโปรตามกลุ่ม") ====================
// โค้ดอยู่ในชีต Coupons เหมือนคูปองทั่วไป (ลดแบบเดียวกันทุกประการ) ต่างกันแค่ 2 คอลัมน์ท้ายชีต:
//   COUPON_AUDIENCE_HEADER_ = LINE UID ของคนที่ได้รับข้อความ (คั่นด้วยจุลภาค) — ว่าง = คูปองปกติ ทุกคนใช้ได้
//   COUPON_USED_BY_HEADER_  = UID@เลขออเดอร์ ที่ใช้โค้ดไปแล้ว (ระบบบันทึกเอง) — ใช้ได้คนละ 1 ครั้ง
//     แก้ไขออเดอร์เดิมยังใช้โค้ดเดิมได้ (เลขออเดอร์ตรงกัน) / ยกเลิกออเดอร์ไม่คืนสิทธิ์ (เหมือนจำนวนครั้งของคูปองปกติ)
// โค้ดเฉพาะผู้รับไม่ขึ้นในรายการคูปองหน้าร้าน และไม่ใช้อัตโนมัติ ลูกค้าต้องกรอกเอง
var COUPON_AUDIENCE_HEADER_ = 'เฉพาะผู้รับ(LINE UID คั่นด้วยจุลภาค — ระบบใส่ให้ตอนยิงโปร เว้นว่าง=ทุกคน)';
var COUPON_USED_BY_HEADER_ = 'ใช้แล้วโดย(LINE UID@เลขออเดอร์ — ระบบบันทึกเอง)';

// ==================== ⚡ เพิ่ม (29/9/69) — คูปองที่ "ใช้ร่วมกับสิทธิพิเศษสมาชิกได้" ====================
// กติกาเดิม: ลูกค้าถือสิทธิพิเศษ (ที่ไม่ได้ติ๊กใช้ร่วมกับคูปองได้) = ตัดคูปองทุกใบ — ตอนนี้แอดมินเลือกได้ต่อคูปอง
// (คอลัมน์ท้ายชีต Coupons หาจากชื่อหัวคอลัมน์) ติ๊ก = คูปองนี้ยังใช้ได้แม้ลูกค้าถือ/ใช้สิทธิพิเศษอยู่
// ว่าง/FALSE (คูปองเดิมทั้งหมด) = กติกาเดิมทุกประการ
var COUPON_STACKABLE_HEADER_ = 'ใช้ร่วมกับสิทธิพิเศษสมาชิกได้(TRUE/FALSE)';

function couponRowStackable_(bundle, row) {
  if (!bundle || !(bundle.s >= 0)) return false;
  var v = row[bundle.s];
  return v === true || String(v).toUpperCase() === 'TRUE';
}

// โค้ด (ตัวพิมพ์ใหญ่) -> true สำหรับคูปองที่ติ๊กใช้ร่วมกับสิทธิพิเศษได้
function getCouponStackableByCode_() {
  var bundle = getCouponsRawBundle_();
  var out = {};
  if (!(bundle.s >= 0)) return out;
  bundle.rows.forEach(function (row) {
    if (couponRowStackable_(bundle, row)) out[String(row[0]).trim().toUpperCase()] = true;
  });
  return out;
}

// มีโค้ดที่ลูกค้าพิมพ์เองได้ และใช้ร่วมกับสิทธิพิเศษได้ เปิดอยู่ไหม (หน้าชำระเงินจะยังโชว์ช่องกรอกโค้ดให้คนที่ถือสิทธิ์)
function hasTypeableStackableCoupon_() {
  var bundle = getCouponsRawBundle_();
  if (!(bundle.s >= 0)) return false;
  var now = new Date();
  return bundle.rows.some(function (row) {
    if (!couponRowStackable_(bundle, row)) return false;
    var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
    var autoApply = row[8] === true || String(row[8]).toUpperCase() === 'TRUE';
    if (!active || autoApply) return false;
    if (row[10] && new Date(row[10]) > now) return false;
    return !isExpired_(row[6], now);
  });
}

// ตั้งค่า "ใช้ร่วมกับสิทธิพิเศษได้" ให้แถวคูปอง (ไม่ติ๊กและยังไม่มีคอลัมน์ = ไม่ต้องสร้างคอลัมน์)
// ข้อความบนตั๋วของคูปอง (undefined = หน้าแอดมินรุ่นเก่า ไม่แตะค่าเดิม / ว่างและยังไม่มีคอลัมน์ = ไม่ต้องสร้าง)
function setCouponDetailText_(sheet, rowNumber, detailText) {
  if (detailText === undefined || detailText === null) return;
  var text = String(detailText).trim();
  var width = Math.max(sheet.getLastColumn(), 16);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var c = header.indexOf(PROMO_DETAIL_HEADER_) + 1;
  if (!c) {
    if (!text) return;
    c = width + 1;
    sheet.getRange(1, c).setValue(PROMO_DETAIL_HEADER_);
  }
  sheet.getRange(rowNumber, c).setValue(text);
}
// โค้ด (ตัวพิมพ์ใหญ่) -> ข้อความบนตั๋วที่แอดมินพิมพ์เอง
function getCouponDetailTextByCode_() {
  var bundle = getCouponsRawBundle_();
  var out = {};
  if (!(bundle.d >= 0)) return out;
  bundle.rows.forEach(function (row) {
    var t = String(row[bundle.d] || '').trim();
    if (t) out[String(row[0]).trim().toUpperCase()] = t;
  });
  return out;
}

function setCouponStackable_(sheet, rowNumber, stackable) {
  var on = (stackable === true || stackable === 'true');
  var width = Math.max(sheet.getLastColumn(), 16);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var c = header.indexOf(COUPON_STACKABLE_HEADER_) + 1;
  if (!c) {
    if (!on) return;
    c = width + 1;
    sheet.getRange(1, c).setValue(COUPON_STACKABLE_HEADER_);
  }
  sheet.getRange(rowNumber, c).setValue(on);
}

function parseCouponUidList_(value) {
  return String(value || '').split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
}

function parseCouponUsedBy_(value) {
  return parseCouponUidList_(value).map(function (entry) {
    var at = entry.indexOf('@');
    return at === -1 ? { uid: entry, orderId: '' } : { uid: entry.substring(0, at), orderId: entry.substring(at + 1) };
  });
}

// หา/สร้าง 2 คอลัมน์ท้ายชีต Coupons (คืนเลขคอลัมน์แบบนับจาก 1)
function ensureCouponAudienceColumns_(sheet) {
  var width = Math.max(sheet.getLastColumn(), 16);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var a = header.indexOf(COUPON_AUDIENCE_HEADER_) + 1;
  var u = header.indexOf(COUPON_USED_BY_HEADER_) + 1;
  if (!a) { a = width + 1; sheet.getRange(1, a).setValue(COUPON_AUDIENCE_HEADER_); width = a; }
  if (!u) { u = width + 1; sheet.getRange(1, u).setValue(COUPON_USED_BY_HEADER_); }
  return { audienceCol: a, usedByCol: u };
}

// สร้างโค้ดเฉพาะผู้รับจากหน้า "ยิงโปรตามกลุ่ม" — ค่าส่วนลดใช้ช่องเดียวกับการแจกสิทธิพิเศษ
function createAudienceCoupon_(uids, cfg) {
  var code = String(cfg.code || '').trim().toUpperCase();
  var typeValue = VALID_PRIVILEGE_TYPES_.indexOf(cfg.type) !== -1 ? cfg.type : 'percent';
  var startDateVal = cfg.startDate ? parseDateInputStr_(cfg.startDate) : '';
  var endDateVal = cfg.endDate ? parseDateInputStr_(cfg.endDate) : '';
  if (endDateVal) endDateVal.setHours(23, 59, 59, 999);
  var days = parseInt(cfg.expiryDays) || 0;
  var expiryVal = endDateVal || expiryFromDays_(startDateVal || new Date(), days);

  var sheet = ensureCouponsSheet_();
  var cols = ensureCouponAudienceColumns_(sheet);
  var width = Math.max(sheet.getLastColumn(), cols.usedByCol);
  var row = [];
  for (var i = 0; i < width; i++) row.push('');
  var values = [
    code, typeValue, parseFloat(cfg.value) || 0, parseFloat(cfg.minPurchase) || 0, 0, 0,
    expiryVal || '', true, false, String(cfg.restriction || '').trim(), startDateVal || '',
    typeValue === 'bogo' ? String(cfg.freeProduct || '').trim() : '',
    couponFreeQtyCell_(typeValue, cfg.freeQty),
    '', typeValue === 'bogo' ? 100 : '', String(cfg.name || '').trim()
  ];
  for (var j = 0; j < values.length; j++) row[j] = values[j];
  row[cols.audienceCol - 1] = uids.join(',');
  var newRow_ = sheet.getLastRow() + 1;
  sheet.getRange(newRow_, 1, 1, width).setValues([row]);
  // โค้ดเฉพาะผู้รับ ห้าม Notice ประกาศหาทุกคนเด็ดขาด (การ์ดส่งให้เฉพาะผู้รับจากหน้ายิงโปรแล้ว)
  skipLineAnnouncement_(sheet, newRow_, 1);
  try { CacheService.getScriptCache().remove(ACTIVE_COUPONS_CACHE_KEY_); CacheService.getScriptCache().remove(COUPONS_RAW_CACHE_KEY_); } catch (e) {}
  return code;
}

// โค้ด (ตัวพิมพ์ใหญ่) -> { audienceCount, usedCount } เฉพาะโค้ดเฉพาะผู้รับ
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

// ตัดส่วนลดค่าส่งของคูปองตามลำดับ ให้รวมกับของสิทธิพิเศษแล้วไม่เกินค่าส่งจริง (คืนสำเนา ไม่แก้ของเดิม)
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

// คูปองอัตโนมัติที่ยังให้อะไรลูกค้าจริง (ลดเงิน หรือมีของแถมให้หยิบ) — ใบที่ถูกตัดค่าส่งจนเหลือ 0 ไม่ต้องแสดง
function isUsefulAutoCoupon_(c) {
  return !!c && ((c.discount || 0) > 0 || (c.physicalFreeQty || 0) > 0);
}

// คูปองอัตโนมัติที่ไม่ใช่ใบเดียวกับโค้ดที่ลูกค้าพิมพ์ (พิมพ์โค้ดของคูปองอัตโนมัติเองจะได้ไม่ลดซ้ำ 2 รอบ)
function withoutSameCoupon_(autoCoupons, manual) {
  return (autoCoupons || []).filter(function (c) { return String(c.rowIndex) !== String(manual.rowIndex); });
}

function couponCodeExists_(code) {
  var sheet = ensureCouponsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;
  var wanted = String(code || '').trim().toUpperCase();
  return sheet.getRange(2, 1, lastRow - 1, 1).getValues().some(function (r) { return String(r[0]).trim().toUpperCase() === wanted; });
}

// บันทึกว่าลูกค้าใช้โค้ดเฉพาะผู้รับกับออเดอร์ไหน (เรียกตอนสั่งซื้อสำเร็จ รวมตอนแก้ไขออเดอร์เดิม)
function recordAudienceCouponUse_(couponResults, lineUid, orderId) {
  var used = (couponResults || []).filter(function (c) { return c.audience && c.rowIndex; });
  if (!used.length) return;
  var sheet = ensureCouponsSheet_();
  var cols = ensureCouponAudienceColumns_(sheet);
  used.forEach(function (c) {
    var cell = sheet.getRange(parseInt(c.rowIndex, 10), cols.usedByCol);
    var entries = parseCouponUidList_(cell.getValue());
    var entry = String(lineUid) + '@' + String(orderId);
    if (entries.indexOf(entry) === -1) {
      entries.push(entry);
      cell.setValue(entries.join(','));
    }
  });
  try { CacheService.getScriptCache().remove(COUPONS_RAW_CACHE_KEY_); } catch (e) {}
}

// stackableOnly = เอาเฉพาะคูปองที่ใช้ร่วมกับสิทธิพิเศษได้ (ใช้ตอนลูกค้าถือสิทธิพิเศษที่ล็อกคูปองอยู่)
// countedCodes = โค้ดที่ออเดอร์ที่กำลังแก้ไขนับจำนวนครั้งไปแล้ว (ครั้งนั้นเป็นของออเดอร์นี้เอง ไม่นับว่าเต็ม)
function findAutoCoupons_(subtotal, items, priceMap, shippingCost, memberTierKey, stackableOnly, countedCodes) {
  try {
    var bundle_ = getCouponsRawBundle_();
    var data = bundle_.rows;
    if (!data.length) return [];
    var now = new Date();

    function isEligibleRow_(row) {
      var autoApply = row[8] === true || String(row[8]).toUpperCase() === 'TRUE';
      if (!autoApply) return false;
      if (bundle_.a >= 0 && parseCouponUidList_(row[bundle_.a]).length) return false; // โค้ดเฉพาะผู้รับ ต้องกรอกเอง
      if (stackableOnly && !couponRowStackable_(bundle_, row)) return false;
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
      if (codeInList_(row[0], countedCodes)) usedCount = Math.max(0, usedCount - 1);
      if (maxUses > 0 && usedCount >= maxUses) return false;
      return true;
    }

    var shippingMetas = [], specificMetas = [], generalMetas = [];
    data.forEach(function (row, idx) {
      if (!isEligibleRow_(row)) return;
      var type = String(row[1]);
      var restriction = String(row[9] || '').trim();
      var meta = { row: row, idx: idx, type: type, restriction: restriction };
      if (isShippingPromoType_(type)) shippingMetas.push(meta);
      else if (restriction) specificMetas.push(meta);
      else generalMetas.push(meta);
    });

    function calcEntry_(meta, itemsForCalc) {
      var row = meta.row;
      if ((meta.type === 'percent' || meta.type === 'fixed' || meta.type === 'price') && meta.restriction) {
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
        physicalFreeQty: calc.physicalFreeQty || 0, freeDiscountPercent: calc.freeDiscountPercent || 100,
        stackable: couponRowStackable_(bundle_, row), freeGifts: calc.freeGifts
      };
    }

    // ⚡ แก้ (29/9/69) — เดิมเลือกคูปองอัตโนมัติได้แค่ใบที่ลดมากสุดของแต่ละกลุ่ม (เฉพาะสินค้า 1 / ทั้งร้าน 1 / ค่าส่ง 1)
    // เช่น ตะกร้ามีทั้งสินค้าโปร "ซื้อชิ้นที่ 2 ลด 50%" และ "ราคาพิเศษยกลัง" ได้แค่ใบเดียว ทั้งที่แอดมินติ๊กใช้ร่วมได้
    // ตอนนี้ส่งทุกใบที่ลดได้ออกไป แล้ว applyPromoExclusivity_ เลือกให้ตามช่องติ๊กใช้ร่วมได้ (ชนกันได้ใบที่ลดมากกว่า)
    // ส่วนลดค่าส่งเกินค่าส่ง trimCouponShippingDiscounts_ ตัดให้
    var stackableEntries = [], exclusiveEntries = [];
    specificMetas.concat(generalMetas, shippingMetas).forEach(function (meta) {
      var entry = calcEntry_(meta, items);
      if (!entry) return;
      (entry.stackable ? stackableEntries : exclusiveEntries).push(entry);
    });
    exclusiveEntries.sort(function (x, y) { return (y.discount || 0) - (x.discount || 0); });
    return exclusiveEntries.concat(stackableEntries);
  } catch (e) {
    return [];
  }
}

// lineUid / opts.orderId ใช้กับโค้ดเฉพาะผู้รับ (opts.orderId = ออเดอร์ที่กำลังแก้ไข/คำนวณใหม่ — ใช้โค้ดซ้ำกับออเดอร์เดิมได้)
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
      // ตรวจยอดซ้ำของออเดอร์ที่ใช้โค้ดนี้ไปแล้ว: ครั้งที่นับไปตอนสั่งซื้อคือของออเดอร์นี้เอง ไม่นับว่าเต็ม
      if (opts && opts.countedInOrder) usedCount = Math.max(0, usedCount - 1);
      if (maxUses > 0 && usedCount >= maxUses) return { error: 'โค้ดนี้ถูกใช้ครบจำนวนแล้ว' };
      var type = String(row[1]);
      var restriction = row[9];
      if ((type === 'percent' || type === 'fixed' || type === 'price') && restriction) {
        var eligibleInfo = items ? computeEligibleInfo_(items, restriction) : { subtotal: 0, qty: 0 };
        if (eligibleInfo.subtotal <= 0) {
          var restrictionValueText_ = type === 'percent' ? ('ลด ' + row[2] + '%') : (type === 'price' ? ('ราคาพิเศษ ' + row[2] + ' บาท') : ('ลด ' + row[2] + ' บาท'));
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
        audience: audience_.length > 0, stackable: couponRowStackable_(bundle_, row), freeGifts: calc.freeGifts,
        typedOnly: !(row[8] === true || String(row[8]).toUpperCase() === 'TRUE') // โค้ดที่ลูกค้าต้องพิมพ์เอง (ไม่ใช่คูปองอัตโนมัติ)
      };
    }
    return { error: 'ไม่พบโค้ดนี้' };
  } catch (e) {
    return { error: e.toString() };
  }
}
// ==================== เพิ่ม — Member Privileges มาก่อนเสมอ ตัดส่วนลดอื่นออกทั้งหมด ====================
// กติกาที่ตกลงไว้ (ใช้ร่วมกันทั้งตอนดูราคา ตอนสั่งจริง และตอนคำนวณยอดออเดอร์ใหม่ จะได้ไม่เพี้ยนคนละแบบ):
//   1. ลูกค้าถือสิทธิ์ใน Member_Privileges ที่ยังไม่ได้ใช้ -> ใช้สิทธิ์เท่านั้น ตัดส่วนลดอื่นออกให้หมด
//      (โค้ดที่กรอกเอง / คูปองอัตโนมัติ / คูปองลดค่าส่ง / ส่วนลดของโปรซื้อซ้ำ)
//   2. สิทธิ์ใน Member_Privileges ด้วยกันเองยังรวมกันได้ทุกใบที่เข้าเงื่อนไข (เหมือนเดิม)
//   3. สิ่งที่ "ไม่ใช่ส่วนลด" ไม่โดนตัด: แลกคะแนนเป็นส่วนลดเงินสด (แต้มของลูกค้าเอง),
//      คะแนนพิเศษ/ตัวคูณคะแนน และคะแนนโบนัสจากโปรซื้อซ้ำ (โปรซื้อซ้ำโดนตัดเฉพาะ "ส่วนลด")
//   4. สิทธิ์ถูกใช้จนหมดเมื่อไหร่ คูปองกลับมาใช้ได้เองอัตโนมัติ ไม่ต้องไปตั้งค่าอะไรเพิ่ม
//   5. ถ้าลูกค้าถือสิทธิ์ที่ยังใช้ไม่ได้ (เช่น ยอดยังไม่ถึงขั้นต่ำ) คูปองก็ยังถูกบล็อก แต่จะขึ้นข้อความ
//      บอกให้ชัดว่าติดเงื่อนไขอะไร และให้ติดต่อแอดมิน จะได้ไม่งงว่าทำไมไม่ได้ส่วนลดอะไรเลย

// ถือสิทธิ์ไว้เฉยๆ แต่ใช้กับตะกร้าใบนี้ไม่ได้ จะบล็อกคูปองด้วยหรือไม่
//   true  = บล็อก (ค่าที่ใช้อยู่ ตามกติกา "สิทธิ์เป็นหลักก่อนที่สุด" ลูกค้าที่อยากใช้ให้ติดต่อแอดมิน)
//   false = บล็อกเฉพาะตอนที่สิทธิ์ลดได้จริงกับตะกร้าใบนี้
var PRIVILEGE_BLOCKS_COUPONS_EVEN_IF_UNUSABLE_ = true;

// สิทธิ์ที่ "ยังไม่ได้ใช้" = ใช้งานอยู่ (คอลัมน์ H) + ถึงวันเริ่มใช้แล้ว (คอลัมน์ J) + ยังไม่หมดอายุ (คอลัมน์ E)
// จงใจไม่เช็คยอดขั้นต่ำ/สินค้าที่กำหนด ต่างจาก getAllPrivilegesWithDiscount_ เพราะกติกาคือ "ถือสิทธิ์ไว้ = ไม่ขึ้นคูปอง"
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

// หัวใจของกติกา — จุดเดียวที่ตัดสินว่าออเดอร์นี้ "ล็อก" อยู่กับสิทธิพิเศษหรือไม่
// pending = true หมายถึงถือสิทธิ์ไว้แต่ยังใช้กับตะกร้าใบนี้ไม่ได้ (ข้อความจะบอกเงื่อนไข + ให้ติดต่อแอดมิน)
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

// ==================== ⚡ แก้ (29/9/69) — กติกา "ใช้ร่วมกับโปรอื่นไม่ได้" แบบใหม่ (แทนการที่สิทธิพิเศษตัดคูปองทั้งออเดอร์) ====================
// ทุกโปร (สิทธิ์สมาชิก/คูปอง/ส่วนลดค่าส่ง) ตัดสินจากช่องติ๊ก "ใช้ร่วมกับโปรอื่นได้":
//   • ติ๊กทั้งคู่                  → ใช้ซ้อนกันได้
//   • มีใบใดใบหนึ่งไม่ติ๊ก + ครอบสินค้าชนกันแม้ชิ้นเดียว → ได้ใบเดียว
// ขอบเขตของแต่ละใบ: เลือกสินค้า = เฉพาะสินค้านั้นในตะกร้า / ไม่เลือกสินค้า = สินค้าทุกชิ้น /
//   ส่วนลดค่าส่งที่ติ๊ก = ใช้ได้กับทุกโปรเสมอ ไม่ว่าอีกใบจะติ๊กหรือไม่ / ไม่ติ๊ก = ครอบทั้งออเดอร์ ใช้ร่วมกับอะไรไม่ได้เลย
// ชนกันแล้วใครได้: สิทธิ์สมาชิกก่อนเสมอ (ตามลำดับในชีต) แล้วคูปองใบที่ลดมากสุดก่อน
// โค้ดที่ลูกค้าพิมพ์เอง (คูปองที่ไม่ได้ตั้งใช้อัตโนมัติ) + ติ๊กใช้ร่วมได้ = ส่วนลดเพิ่ม ใช้ร่วมกับคูปองได้ทุกใบ (ติ๊กหรือไม่ก็ตาม)
// ตรวจชนเฉพาะกับสิทธิ์สมาชิก / ไม่ติ๊ก = ใช้กติกาเดียวกับคูปองทั่วไป
// ใบที่ไม่ได้ ถูกตัดออกทั้งใบ (สิทธิ์ไม่ถูกใช้ทิ้ง / คูปองไม่ถูกนับว่าใช้)
function isShippingPromoType_(type) { return type === 'ship_percent' || type === 'ship_fixed' || type === 'ship_price'; }

// หน้าร้านขึ้นป้าย "ใช้ร่วมกับโปรอื่นไม่ได้" (type/restriction เก็บไว้ในพารามิเตอร์เผื่อปรับกติกาป้ายภายหลัง)
function isExclusivePromo_(type, restriction, stackable) {
  return !stackable;
}

function promoMatchesItem_(restriction, itemName) {
  var keywords = String(restriction || '').split(',').map(function (k) { return k.trim().toLowerCase(); }).filter(Boolean);
  var name = String(itemName || '').toLowerCase();
  return keywords.some(function (k) { return name.indexOf(k) !== -1; });
}

function promoScope_(p, items) {
  var restriction = String(p.restriction || '').trim();
  var ship = isShippingPromoType_(p.type);
  var names;
  if (ship) names = (items || []).map(function (it) { return it.name; }); // ใช้เฉพาะใบที่ไม่ติ๊ก (ใบที่ติ๊กไม่ถูกตรวจชนเลย)
  else if (!restriction) names = (items || []).map(function (it) { return it.name; });
  else names = (items || []).filter(function (it) { return promoMatchesItem_(restriction, it.name); }).map(function (it) { return it.name; });
  return { names: names, ship: ship, exclusive: !p.stackable };
}

function promoScopesConflict_(x, y) {
  if (!x.exclusive && !y.exclusive) return false;
  if (x.ship && y.ship) return true;
  return x.names.some(function (n) { return y.names.indexOf(n) !== -1; });
}

// คืน { privileges, coupons (ลำดับเดิม), dropped: [โปรที่ถูกตัด], exclusivePrivilegeUsed: มีสิทธิ์ไม่ติ๊กที่ได้ใช้จริง }
function applyPromoExclusivity_(privileges, coupons, items) {
  var acceptedPriv = [], acceptedAuto = [], dropped = [], exclusivePrivilegeUsed = false;
  // kind: 'priv' = สิทธิ์สมาชิก / 'typed' = โค้ดที่พิมพ์เองที่ติ๊กใช้ร่วมได้ (ตรวจชนแค่กับสิทธิ์) / 'auto' = คูปองอื่นทั้งหมด
  function tryAccept(p, kind) {
    if (!p) return true;
    if (!(p.discount > 0) && !(p.physicalFreeQty > 0)) return true; // ลดไม่ได้อยู่แล้ว ไม่ครอบอะไร ปล่อยตามเดิม
    if (p.stackable && isShippingPromoType_(p.type)) return true;   // ส่วนลดค่าส่งที่ติ๊ก ใช้ได้กับทุกโปรเสมอ
    var sc = promoScope_(p, items);
    var against = kind === 'auto' ? acceptedPriv.concat(acceptedAuto) : acceptedPriv;
    if (against.some(function (a) { return promoScopesConflict_(a, sc); })) return false;
    if (kind === 'priv') acceptedPriv.push(sc);
    else if (kind === 'auto') acceptedAuto.push(sc);
    return true;
  }
  var outPriv = (privileges || []).filter(function (p) {
    var ok = tryAccept(p, 'priv');
    if (!ok) dropped.push(p);
    else if (p && !p.stackable && (p.discount > 0 || p.physicalFreeQty > 0)) exclusivePrivilegeUsed = true;
    return ok;
  });
  // คูปอง: ใบที่ลดมากกว่าได้พิจารณาก่อน (เท่ากัน = ตามลำดับเดิม) แต่คืนผลตามลำดับเดิม
  var list = (coupons || []).map(function (c, i) { return { c: c, i: i }; });
  list.sort(function (x, y) { return ((y.c && y.c.discount) || 0) - ((x.c && x.c.discount) || 0) || x.i - y.i; });
  var keep = {};
  list.forEach(function (e) { if (tryAccept(e.c, e.c && e.c.typedOnly && e.c.stackable ? 'typed' : 'auto')) keep[e.i] = true; else dropped.push(e.c); });
  var outCp = (coupons || []).filter(function (c, i) { return keep[i]; });
  return { privileges: outPriv, coupons: outCp, dropped: dropped, exclusivePrivilegeUsed: exclusivePrivilegeUsed };
}

// ข้อความบอกลูกค้าว่าสิทธิ์ไหนไม่ได้ใช้กับออเดอร์นี้ (ชนกับโปรที่ใช้ร่วมกันไม่ได้) — สิทธิ์ยังอยู่ ใช้ครั้งหน้าได้
function exclusivityDroppedPrivilegeNote_(excl) {
  var names = (excl.dropped || []).filter(function (p) { return p && p.name && !p.code; }).map(function (p) { return '"' + p.name + '"'; });
  if (!names.length) return '';
  return 'สิทธิ์ ' + names.join(', ') + ' ใช้ร่วมกับโปรอื่นในออเดอร์นี้ไม่ได้ สิทธิ์ยังไม่ถูกใช้ เก็บไว้ใช้ครั้งหน้าได้';
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

    // ⚡ เพิ่ม (4/10/69) — กำลังแก้ไขออเดอร์ที่รอแนบสลิป: สิทธิ์/คูปองที่ออเดอร์นี้จองไว้ยังใช้กับออเดอร์นี้ได้
    // (ถ้ายังไม่หมดอายุ) และบอกหน้าเว็บว่าโปรเดิมตัวไหนหลุด/คืนให้ (ป๊อปอัปยอดชำระมีการเปลี่ยนแปลง)
    existingOrderId = String(existingOrderId || '').trim();
    var editTarget_ = null, reservedByEdit_ = null;
    if (existingOrderId) {
      editTarget_ = getEditableShopOrder_(profile.sub, memberRow_ ? memberRow_[3] : '', existingOrderId);
      if (editTarget_.error) return { success: false, error: editTarget_.error, editBlocked: true };
      reservedByEdit_ = promoReservedByOrder_(profile.sub, editTarget_.remark, editTarget_.bill.orderTime);
    }

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
    var allPrivileges = getAllPrivilegesWithDiscount_(profile.sub, subtotal, items, priceMap, shippingCost, reservedByEdit_ ? reservedByEdit_.privilegeRows : null);
    var appliedPrivileges = allPrivileges.filter(function (p) { return !excludeSet_[String(p.rowIndex)]; });
    var coupon = null, couponError = null;
    if (couponCode) {
      var manual = validateCoupon_(couponCode, subtotal, items, priceMap, shippingCost, memberTierKey_, profile.sub,
        { orderId: existingOrderId, countedInOrder: !!reservedByEdit_ && codeInList_(couponCode, reservedByEdit_.couponCodes) });
      if (manual && manual.error) couponError = manual.error; else coupon = manual;
    }

    var rawAutoCoupons = findAutoCoupons_(subtotal, items, priceMap, shippingCost, memberTierKey_, false, reservedByEdit_ ? reservedByEdit_.couponCodes : null);
    // ⚡ แก้ (25/9/69) — โค้ดที่ลูกค้าพิมพ์เอง "ลดเพิ่ม" จากคูปองอัตโนมัติทุกใบ (เดิมตัดคูปองอัตโนมัติที่ลดค่าสินค้าออก
    // เหลือแค่ลดค่าส่ง) — ตัดเฉพาะกรณีพิมพ์โค้ดของคูปองอัตโนมัติใบเดียวกันซ้ำ กันลดซ้ำ 2 รอบ (ใช้ร่วมกับ createShopOrder)
    var autoCoupons = coupon ? withoutSameCoupon_(rawAutoCoupons, coupon) : rawAutoCoupons;

    // ⚡ แก้ (29/9/69) — เลิกกติกา "มีสิทธิพิเศษ = ตัดคูปองทั้งออเดอร์" ใช้ช่องติ๊ก "ใช้ร่วมกับโปรอื่นได้" ของแต่ละโปรแทน
    // (ดู applyPromoExclusivity_) โปรที่ชนกันแล้วไม่ได้ใช้ บอกลูกค้าว่ายังเก็บไว้ใช้ครั้งหน้าได้
    var excl_ = applyPromoExclusivity_(appliedPrivileges, coupon ? [coupon].concat(autoCoupons) : autoCoupons, items);
    var privilegeLock_ = { locked: false, pending: false, note: exclusivityDroppedPrivilegeNote_(excl_) };
    appliedPrivileges = excl_.privileges;
    // หน้าเว็บคำนวณสิทธิ์ชั่วคราวเองตอนกดเอาสิทธิ์ออก/คืน — ใบที่ชนกันแล้วไม่ได้ใช้ต้องไม่ถูกนับกลับเข้าไป
    var droppedPrivRows_ = {};
    excl_.dropped.forEach(function (p) { if (p && !p.code) droppedPrivRows_[String(p.rowIndex)] = true; });
    allPrivileges = allPrivileges.map(function (p) {
      if (!droppedPrivRows_[String(p.rowIndex)]) return p;
      var cp = {}; Object.keys(p).forEach(function (k) { cp[k] = p[k]; }); cp.exclusivityDropped = true; return cp;
    });
    if (coupon) {
      var manualAfter_ = excl_.coupons.filter(function (c) { return String(c.rowIndex) === String(coupon.rowIndex); })[0];
      autoCoupons = excl_.coupons.filter(function (c) { return String(c.rowIndex) !== String(coupon.rowIndex); });
      if (!manualAfter_) { couponError = 'โค้ด ' + coupon.code + ' ใช้ร่วมกับสิทธิ์/โปรอื่นในออเดอร์นี้ไม่ได้ (โค้ดยังไม่ถูกใช้ เก็บไว้ใช้ครั้งหน้าได้)'; }
      coupon = manualAfter_ || null;
    } else {
      autoCoupons = excl_.coupons;
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
      if (phoneForPromo_ && countPriorOrdersThisMonth_(phoneForPromo_, existingOrderId) > 0) {
        var repeatDiscountPreview_ = 0;
        // bonusPoints/multiplier ส่งกลับไปเสมอ (กติกายกเว้น "การให้คะแนนพิเศษ" ไว้)
        // ส่วนลดโปรซื้อซ้ำถูกตัดเมื่อใช้สิทธิ์สมาชิกที่ไม่ติ๊กใช้ร่วมได้ (กติกาเดิม — คะแนนโบนัส/ตัวคูณยังได้)
        if (!excl_.exclusivePrivilegeUsed && repeatConfigPreview_.discountValue > 0) {
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
      var reservedPoints_ = getPendingPointsReservedForPhone_(memberRow_[3], existingOrderId, true);
      memberPointsBalance_ = Math.max(0, (memberRow_[5] || 0) - reservedPoints_);
    }
    var pointsRedeemResult_ = calcPointsRedeemDiscount_(pointsToRedeem, memberPointsBalance_, payableBeforePoints_);

    var editChanges_ = null;
    if (reservedByEdit_) {
      var editDiff_ = diffReservedPromos_(reservedByEdit_, appliedPrivileges, coupon ? [coupon].concat(autoCoupons) : autoCoupons);
      editChanges_ = { orderId: existingOrderId, oldAmount: editTarget_.bill.billTotal, lost: editDiff_.lost, returned: editDiff_.returned };
    }

    return { success: true, editChanges: editChanges_, privileges: appliedPrivileges, privilegeDiscount: privilegeDiscount, allPrivileges: allPrivileges, privilegeLockNote: privilegeLock_.note, privilegeLocked: false, coupon: coupon, autoCoupons: autoCoupons, couponError: couponError, shippingCost: shippingCost, shippingDiscount: totalShippingDiscount, finalShippingCost: finalShippingCost, totalWeightG: totalWeightG, repeatPromo: repeatPromo,
      memberPoints: memberPointsBalance_, pointsRedeemConfig: getPointsRedeemConfig_(), pointsRedeemDiscount: pointsRedeemResult_.discount, pointsUsed: pointsRedeemResult_.pointsUsed, pointsRedeemError: pointsRedeemResult_.error };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function createShopOrder(idToken, itemsJson, paymentMethod, couponCode, shippingAddress, province, excludePrivilegeName, existingOrderId, purchaseReferrerCode, pointsToRedeem, giftChoices) {
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
    var editTarget_ = null;
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
        // ⚡ เพิ่ม (4/10/69) — แก้ไขได้เฉพาะออเดอร์ของตัวเองที่ยังไม่ยกเลิก/ยังไม่แนบสลิป (เช็คก่อนแตะชีตใดๆ)
        editTarget_ = getEditableShopOrder_(profile.sub, phone, existingOrderId);
        if (editTarget_.error) return { success: false, error: editTarget_.error, editBlocked: true };
        var refundedPoints_ = reverseRedeemedPointsForOrder_(profile.sub, existingOrderId);
        if (refundedPoints_ > 0) memberPoints += refundedPoints_;
      }
    }
    if (!phone) return { success: false, error: 'กรุณาสมัครสมาชิกก่อนค่ะ' };
    if (existingOrderId && !editTarget_) return { success: false, error: 'ไม่มีสิทธิ์แก้ไขออเดอร์นี้', editBlocked: true };
    // สิทธิ์/คูปองที่ออเดอร์เดิมจองไว้ ยังใช้กับออเดอร์ที่แก้ไขได้ (ถ้ายังไม่หมดอายุ)
    var reservedByEdit_ = editTarget_ ? promoReservedByOrder_(profile.sub, editTarget_.remark, editTarget_.bill.orderTime) : null;

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

    var appliedPrivileges = getAppliedPrivileges_(profile.sub, subtotal, excludeRowIndexes, items, priceMap, shippingCost, reservedByEdit_ ? reservedByEdit_.privilegeRows : null);
    var countedCodes_ = reservedByEdit_ ? reservedByEdit_.couponCodes : null;
    var couponResults = [];
    if (couponCode) {
      var manualResult = validateCoupon_(couponCode, subtotal, items, priceMap, shippingCost, memberTierKeyForCoupon_, profile.sub,
        { orderId: existingOrderId, countedInOrder: codeInList_(couponCode, countedCodes_) });
      if (manualResult && manualResult.error) return { success: false, error: manualResult.error };
      if (manualResult) couponResults = [manualResult];
      // ⚡ แก้ (25/9/69) — โค้ดที่พิมพ์เองลดเพิ่มจากคูปองอัตโนมัติทุกใบ (กติกาเดียวกับ checkShopDiscounts)
      var rawAutoForOrder_ = findAutoCoupons_(subtotal, items, priceMap, shippingCost, memberTierKeyForCoupon_, false, countedCodes_);
      couponResults = couponResults.concat(manualResult ? withoutSameCoupon_(rawAutoForOrder_, manualResult) : rawAutoForOrder_);
    } else {
      couponResults = findAutoCoupons_(subtotal, items, priceMap, shippingCost, memberTierKeyForCoupon_, false, countedCodes_);
    }

    // เพิ่ม — กติกาเดียวกับ checkShopDiscounts: มีสิทธิพิเศษอยู่ = คูปองทุกใบตกหมด
    // ต้องทำซ้ำตรงนี้ด้วย ไม่งั้นยอดที่ตัดจริงจะไม่ตรงกับที่ลูกค้าเห็นตอนกดยืนยัน และคูปองจะโดนนับ usedCount ทิ้งฟรีๆ
    // ⚡ แก้ (29/9/69) — ใช้ช่องติ๊ก "ใช้ร่วมกับโปรอื่นได้" ของแต่ละโปร (กติกาเดียวกับ checkShopDiscounts)
    var privilegeLock_ = { locked: false, pending: false, note: '' };
    var exclOrder_ = applyPromoExclusivity_(appliedPrivileges, couponResults, items);
    appliedPrivileges = exclOrder_.privileges;
    // โค้ดที่พิมพ์เองแต่สินค้าถูกโปรอื่นจองไว้หมด: ตัดโค้ดออกเงียบๆ ไม่นับว่าใช้ (หน้าชำระเงินขึ้นคำเตือนให้เห็นแล้ว
    // เหมือนกติกาเดิมตอนสิทธิพิเศษตัดคูปอง — ไม่ปฏิเสธออเดอร์ ลูกค้าจะได้ไม่ติดกดสั่งไม่ได้)
    couponResults = exclOrder_.coupons;
    if (manualResult && !manualResult.error) manualResult = couponResults.filter(function (c) { return String(c.rowIndex) === String(manualResult.rowIndex); })[0] || null;
    // ส่วนลดค่าส่งรวมกันไม่เกินค่าส่ง (กติกาเดียวกับ checkShopDiscounts) — โค้ดที่พิมพ์เองอยู่ลำดับแรกเสมอ ไม่ถูกตัดทิ้ง
    couponResults = trimCouponShippingDiscounts_(appliedPrivileges, couponResults, shippingCost)
      .filter(function (c) { return (manualResult && String(c.rowIndex) === String(manualResult.rowIndex)) || isUsefulAutoCoupon_(c); });

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
    // ใช้สิทธิ์สมาชิกที่ไม่ติ๊กใช้ร่วมได้ = ตัดส่วนลดโปรซื้อซ้ำ แต่คะแนนโบนัส/ตัวคูณยังได้ตามเดิม
    if (!exclOrder_.exclusivePrivilegeUsed && repeatConfig_ && repeatConfig_.discountValue > 0) {
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

    applyGiftChoices_(appliedPrivileges, couponResults, giftChoices); // ⚡ เพิ่ม (1/10/69) — รสของแถมที่ลูกค้าเลือก
    var paymentLabel = isCodOrder
      ? COD_PAYMENT_LABEL_
      : (paymentMethod === 'promptpay' ? 'พร้อมเพย์ (LINE Shop)' : 'โอนเงินธนาคาร (LINE Shop)');
    var discountNoteParts = [];
    var freebieNoteParts = [];
    var physicalFreebieNoteParts = [];
    appliedPrivileges.forEach(function (p) {
      if (p.discount > 0) discountNoteParts.push('สิทธิ์: ' + p.name + ' (-' + Math.round(p.discount) + ')');
      if (p.type === 'bogo' && p.freeQtyGranted > 0) freebieNoteParts.push(p.name + ' (ลดราคา ' + p.freeQtyGranted + ' ชิ้น)');
      var physicalNote_ = physicalFreebieNotePart_(p.name, p); // ⚡ แก้ (1/10/69) — รวมของแถมโปรขายราคาพิเศษ
      if (physicalNote_) physicalFreebieNoteParts.push(physicalNote_);
    });
    couponResults.forEach(function (c) {
      if (c.discount > 0) discountNoteParts.push('คูปอง: ' + c.code + ' (-' + Math.round(c.discount) + ')');
      if (c.type === 'bogo' && c.freeQtyGranted > 0) freebieNoteParts.push(c.code + ' (ลดราคา ' + c.freeQtyGranted + ' ชิ้น)');
      var physicalNote_ = physicalFreebieNotePart_(c.code, c);
      if (physicalNote_) physicalFreebieNoteParts.push(physicalNote_);
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
    // ⚡ แก้ (4/10/69) — แก้ไขออเดอร์: นับเฉพาะคูปองที่เพิ่งใช้ใหม่ (ใบที่ออเดอร์เดิมนับไปแล้วไม่นับซ้ำ)
    var couponsToCount_ = isEditingExistingOrder
      ? couponResults.filter(function (c) { return !codeInList_(c.code, countedCodes_); })
      : couponResults;
    if (couponsToCount_.length) {
      var couponSheet = ensureCouponsSheet_();
      var couponRows_ = couponsToCount_.filter(function (c) { return c.rowIndex; })
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
    // ⚡ เพิ่ม (25/9/69) — โค้ดเฉพาะผู้รับ: จำว่าลูกค้าคนนี้ใช้กับออเดอร์ไหน (ทำทั้งตอนสั่งใหม่และตอนแก้ไขออเดอร์เดิม)
    recordAudienceCouponUse_(couponResults, profile.sub, revenueId);
    // ⚡ เพิ่ม (4/10/69) — แก้ไขออเดอร์แล้วไม่ได้ใช้สิทธิ์/คูปองที่เคยจองไว้: คืนให้ลูกค้า (เฉพาะที่ยังไม่หมดอายุ)
    var editChanges_ = null;
    if (isEditingExistingOrder && reservedByEdit_) {
      var editDiff_ = diffReservedPromos_(reservedByEdit_, appliedPrivileges, couponResults);
      releaseReservedPromos_(editDiff_, profile.sub, revenueId);
      editChanges_ = { orderId: revenueId, oldAmount: oldFinalAmount, lost: editDiff_.lost, returned: editDiff_.returned };
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
    var finalReturnPayload_ = { success: true, orderId: revenueId, subtotal: subtotal, discount: totalDiscount, cashDiscount: cashDiscountOnly_, shippingCost: deliveryColValue_, codFee: codFee, isCod: isCodOrder, totalAmount: finalAmount, pointsEarned: pointsEarned, skipSlipUpload: skipSlipUpload, freebieItems: freebieNoteParts, physicalFreebieItems: physicalFreebieNoteParts, discountDetail: discountNoteParts, pointsRedeemed: pointsRedeemResult_.pointsUsed, pointsRedeemDiscount: pointsRedeemResult_.discount, isEdit: isEditingExistingOrder, editChanges: editChanges_ };
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
  } else if (finalReturnPayload_ && finalReturnPayload_.success) {
    // ⚡ เพิ่ม (3/10/69) — ออเดอร์โอน/พร้อมเพย์: ส่ง LINE หาลูกค้าทันที ให้แนบสลิป (ปุ่มพาไปหน้าแนบสลิปของ
    // ออเดอร์นี้) หรือยกเลิก — กันลูกค้าโอนแล้วส่งสลิปในแชทแทนการแนบในระบบ (กลุ่มแอดมินได้การ์ดตอนแนบสลิปตามเดิม)
    try {
      notifyBuyerPendingSlip_(profile.sub, finalReturnPayload_.orderId, items, paymentLabel, finalReturnPayload_.subtotal,
        finalReturnPayload_.discount, finalReturnPayload_.shippingCost, finalReturnPayload_.totalAmount, isEditingExistingOrder);
    } catch (pendingNotifyErr) {
      Logger.log('createShopOrder: ส่งข้อความรอแนบสลิปให้ลูกค้าไม่สำเร็จ: ' + pendingNotifyErr.toString());
    }
  }

  return finalReturnPayload_;
}

// ⚡ เพิ่ม — แกนคำนวณสิทธิ์/คูปอง/โปรซื้อซ้ำ "ใหม่" ให้ออเดอร์ที่มีอยู่แล้ว (ใช้สินค้า/จำนวนเดิมของออเดอร์นั้น
// เป๊ะๆ ไม่คำนวณราคาสินค้าใหม่ ค่าส่งก็คงเดิมเพราะขึ้นกับน้ำหนักไม่ใช่โปร) ใช้ร่วมกันทั้งตอน "ดูตัวอย่างยอดใหม่"
// (checkPendingOrderPromoStillValid) และตอน "บันทึกจริง" (confirmPendingOrderRecalc) กันตรรกะเพี้ยนไปคนละทาง
// ระหว่าง 2 จุดนี้ — คูปองที่เคยใช้ (ทั้งพิมพ์เองและอัตโนมัติ) ดึงชื่อ/โค้ดกลับมาจากข้อความหมายเหตุเดิม (remark)
// แล้วเช็คทีละตัวว่ายังใช้ได้อยู่ไหมด้วย validateCoupon_ ตัวเดียวกับตอนสั่งซื้อจริง ถ้าหมดอายุ/ถูกปิดใช้งานไป
// หมดทุกตัวแล้ว ค่อย fallback ไปหาโปรอัตโนมัติที่เปิดใช้งานอยู่ตอนนี้แทน (โปรใหม่แทนโปรเก่าที่หมดอายุ)
// แถวสิทธิพิเศษที่ออเดอร์นี้ใช้ไปตอนสั่งซื้อ: ชื่อตรงกับ "สิทธิ์: ชื่อ (-n)" ใน Remark, ถูกปิดแล้ว และเวลาใช้สิทธิ์
// (คอลัมน์ Q "ใช้สิทธิ์เมื่อ") ใกล้เวลาสั่งซื้อที่สุด (ไม่เกิน 1 วัน) — ชื่อเดียวกันหลายใบเลือกใบที่ใกล้ที่สุดตามจำนวนที่ใช้
function privilegeRowsUsedByOrder_(lineUid, remark, orderTime) {
  try {
    var want = {};
    var re = /สิทธิ์:\s*([^\(]+?)\s*\(-\d/g, m;
    while ((m = re.exec(remark || '')) !== null) want[m[1].trim()] = (want[m[1].trim()] || 0) + 1;
    if (!Object.keys(want).length) return [];
    var t0 = orderTime ? new Date(orderTime).getTime() : NaN;
    if (isNaN(t0)) return [];
    var sheet = ensurePrivilegesSheet_();
    if (String(sheet.getRange(1, 17).getValue() || '').trim() !== 'ใช้สิทธิ์เมื่อ') return [];
    var rowNumbers = getKeyRowIndexCached_(sheet, 1, String(lineUid), 'privrows_', PRIVILEGE_ROWS_CACHE_TTL_, normalizeAsString_);
    if (!rowNumbers.length) return [];
    var byName = {};
    readRowsMerged_(sheet, rowNumbers, 17).forEach(function (entry) {
      var row = entry.values;
      if (row[7] === true || String(row[7]).toUpperCase() === 'TRUE') return;
      var name = String(row[1] || '').trim();
      if (!want[name] || !row[16]) return;
      var gap = Math.abs(new Date(row[16]).getTime() - t0);
      if (isNaN(gap) || gap > 24 * 3600 * 1000) return;
      (byName[name] = byName[name] || []).push({ rowIndex: entry.rowIndex, gap: gap });
    });
    var out = [];
    Object.keys(byName).forEach(function (name) {
      byName[name].sort(function (a, b) { return a.gap - b.gap; }).slice(0, want[name]).forEach(function (x) { out.push(x.rowIndex); });
    });
    return out;
  } catch (e) {
    return [];
  }
}

// ==================== ⚡ เพิ่ม (4/10/69) — แก้ไขออเดอร์ที่รอแนบสลิป / คืนสิทธิ์-คูปอง ====================
// กติกา: สิทธิ์ (ใช้ครั้งเดียว) และคูปอง (นับจำนวนครั้ง) ถูก "จอง" ไว้กับออเดอร์ที่ยังไม่แนบสลิป
//   - แก้ไขออเดอร์: ของที่จองไว้ยังใช้กับออเดอร์นี้ได้ ถ้ายังไม่หมดอายุ
//   - แก้ไขแล้วไม่ได้ใช้ / ยกเลิกออเดอร์: คืนให้ลูกค้า เฉพาะที่ยังไม่หมดอายุ (หมดอายุแล้ว = ไม่คืน)

// ออเดอร์ที่ลูกค้าแก้ไขได้: ของลูกค้าคนนี้ ยังไม่ยกเลิก ยังไม่แนบสลิป (ออเดอร์เก็บเงินปลายทางมีข้อความในช่องสลิป = แก้ไม่ได้)
function getEditableShopOrder_(lineUid, phone, orderId) {
  orderId = String(orderId || '').trim();
  if (!orderId) return { error: 'ไม่พบเลขที่ออเดอร์' };
  var sheet = SpreadsheetApp.openById(REVENUE_SHEET_ID_SHOP).getSheetByName(REVENUE_SHEET_NAME_SHOP);
  var lastRow = sheet.getLastRow();
  var targetRow = -1;
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === orderId) { targetRow = i + 2; break; }
    }
  }
  if (targetRow === -1) return { error: 'ไม่พบออเดอร์นี้ในระบบ' };
  if (String(sheet.getRange(targetRow, 3).getValue()) === CANCELLED_ORDER_MARK_) return { error: 'คำสั่งซื้อนี้ถูกยกเลิกไปแล้ว' };
  var bill = getBillDataForNotify_(sheet, targetRow);
  var isOwner_ = bill.lineUid ? bill.lineUid === String(lineUid) : (!!phone && bill.phone === String(phone));
  if (!isOwner_) return { error: 'ไม่มีสิทธิ์แก้ไขออเดอร์นี้' };
  if (bill.slipImageUrl) return { error: 'ออเดอร์นี้แนบสลิปแล้ว แก้ไขรายการไม่ได้ กรุณาติดต่อทีมงาน' };
  return { row: targetRow, orderId: orderId, bill: bill, remark: String(sheet.getRange(targetRow, 20).getValue() || '') };
}

// สิทธิ์/คูปองที่ออเดอร์นี้จองไว้ (อ่านจาก Remark แบบเดียวกับ recalcOrderDiscounts_)
function promoReservedByOrder_(lineUid, remark, orderTime) {
  var codes = [];
  var re = /คูปอง:\s*([^\(]+?)\s*\(-\d/g, m;
  while ((m = re.exec(remark || '')) !== null) codes.push(m[1].trim());
  return { privilegeRows: privilegeRowsUsedByOrder_(lineUid, remark, orderTime), couponCodes: codes };
}

function codeInList_(code, list) {
  var c = String(code || '').trim().toUpperCase();
  return !!c && (list || []).some(function (x) { return String(x).trim().toUpperCase() === c; });
}

function promoUntilText_(value) {
  if (!value) return '';
  var d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

// เทียบของที่ออเดอร์เดิมจองไว้กับชุดที่ใช้จริงหลังแก้ไข (ยกเลิกออเดอร์ = ส่งชุดว่าง)
//   lost: หมดอายุ/ถูกปิดแล้ว ใช้ไม่ได้ (ไม่คืน) / returned: ยังไม่หมดอายุแต่ไม่ได้ใช้ (คืนให้ลูกค้า)
function diffReservedPromos_(reserved, appliedPrivileges, appliedCoupons) {
  var out = { lost: [], returned: [], privilegeRows: [], couponRows: [] };
  if (!reserved) return out;
  var now = new Date();
  var usedPriv_ = {};
  (appliedPrivileges || []).forEach(function (p) { usedPriv_[String(p.rowIndex)] = true; });
  if (reserved.privilegeRows.length) {
    readRowsMerged_(ensurePrivilegesSheet_(), reserved.privilegeRows, 10).forEach(function (entry) {
      if (usedPriv_[String(entry.rowIndex)]) return;
      var row = entry.values;
      var name = String(row[1] || '').trim();
      if (isExpired_(row[4], now)) {
        out.lost.push({ kind: 'privilege', name: name, reason: 'expired' });
      } else {
        out.returned.push({ kind: 'privilege', name: name, until: promoUntilText_(row[4]) });
        out.privilegeRows.push(entry.rowIndex);
      }
    });
  }
  if (reserved.couponCodes.length) {
    var usedCodes_ = (appliedCoupons || []).map(function (c) { return c.code; });
    var bundle_ = getCouponsRawBundle_();
    reserved.couponCodes.forEach(function (code) {
      if (codeInList_(code, usedCodes_)) return;
      var idx = -1;
      for (var i = 0; i < bundle_.rows.length; i++) {
        if (codeInList_(bundle_.rows[i][0], [code])) { idx = i; break; }
      }
      if (idx === -1) { out.lost.push({ kind: 'coupon', name: code, reason: 'inactive' }); return; }
      var row = bundle_.rows[idx];
      var expired_ = isExpired_(row[6], now);
      var active_ = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
      if (!expired_) out.couponRows.push(idx + 2); // ยังไม่หมดอายุ = คืนจำนวนครั้งที่ใช้
      if (expired_ || !active_) out.lost.push({ kind: 'coupon', name: code, reason: expired_ ? 'expired' : 'inactive' });
      else out.returned.push({ kind: 'coupon', name: code, until: promoUntilText_(row[6]) });
    });
  }
  return out;
}

// คืนของที่ diffReservedPromos_ บอกว่าคืนได้: เปิดสิทธิ์กลับ (ล้างวันที่ใช้สิทธิ์) / ลดจำนวนครั้งที่ใช้คูปอง
// และลบบันทึก "ใช้กับออเดอร์นี้" ของโค้ดเฉพาะผู้รับ
function releaseReservedPromos_(diff, lineUid, orderId) {
  if (diff.privilegeRows.length) {
    var privSheet = ensurePrivilegesSheet_();
    privSheet.getRangeList(diff.privilegeRows.map(function (r) { return 'H' + r; })).setValue(true);
    if (String(privSheet.getRange(1, 17).getValue() || '').trim() === 'ใช้สิทธิ์เมื่อ') {
      privSheet.getRangeList(diff.privilegeRows.map(function (r) { return 'Q' + r; })).setValue('');
    }
  }
  if (diff.couponRows.length) {
    var couponSheet = ensureCouponsSheet_();
    var usedByCol_ = getCouponsRawBundle_().u + 1;
    var entry_ = String(lineUid) + '@' + String(orderId);
    diff.couponRows.forEach(function (r) {
      var countCell = couponSheet.getRange(r, 6);
      var n = parseInt(countCell.getValue(), 10) || 0;
      if (n > 0) countCell.setValue(n - 1);
      if (usedByCol_ > 0) {
        var usedCell = couponSheet.getRange(r, usedByCol_);
        var entries = parseCouponUidList_(usedCell.getValue());
        if (entries.indexOf(entry_) !== -1) usedCell.setValue(entries.filter(function (x) { return x !== entry_; }).join(','));
      }
    });
    try { CacheService.getScriptCache().removeAll([COUPONS_RAW_CACHE_KEY_, ACTIVE_COUPONS_CACHE_KEY_]); } catch (e) {}
  }
}

// ข้อมูลออเดอร์ที่รอแนบสลิป สำหรับปุ่ม "แก้ไขรายการ" ในหน้ารถเข็น: รายการสินค้า + ค่าที่ใช้ตอนสั่ง (ใส่ไว้ให้ในหน้าชำระเงิน)
function getPendingOrderForEdit(idToken, orderId) {
  try {
    var profile = verifyLineIdToken_(idToken);
    if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ (' + lastLineVerifyError_ + ')' };
    var memberFound_ = getMemberRowByUid_(profile.sub, 4);
    var target = getEditableShopOrder_(profile.sub, memberFound_ ? memberFound_.values[3] : '', orderId);
    if (target.error) return { success: false, error: target.error };
    var bill = target.bill;
    // โค้ดที่ลูกค้าพิมพ์เอง (คูปองอัตโนมัติระบบหาให้เองอยู่แล้ว)
    var typedCode = '';
    var bundle_ = getCouponsRawBundle_();
    promoReservedByOrder_(profile.sub, target.remark, '').couponCodes.some(function (code) {
      return bundle_.rows.some(function (row) {
        if (!codeInList_(row[0], [code])) return false;
        var autoApply = row[8] === true || String(row[8]).toUpperCase() === 'TRUE';
        if (!autoApply) typedCode = String(row[0]).trim();
        return true;
      }) && !!typedCode;
    });
    var pending = parsePendingPointsReservation_(target.remark);
    return {
      success: true, orderId: target.orderId,
      items: bill.items.map(function (it) { return { name: it.name, qty: it.qty }; }),
      couponCode: typedCode,
      paymentMethod: bill.paymentLabel.indexOf('พร้อมเพย์') !== -1 ? 'promptpay' : 'bank',
      shippingAddress: bill.address, province: bill.province,
      pointsToRedeem: pending.points || 0, purchaseReferrerCode: bill.purchaseReferrerCode || '',
      totalAmount: bill.billTotal
    };
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

  // ⚡ แก้ (27/9/69) — สิทธิ์/โค้ดที่ออเดอร์นี้ใช้ไปเองตอนสั่งซื้อ ต้องนับว่ายังใช้ได้กับออเดอร์นี้ (เดิมระบบเห็นว่า
  // สิทธิ์ถูกปิด/โค้ดถูกใช้ครบแล้ว จึงตัดส่วนลดออก ลูกค้ากดแนบสลิปจากรถเข็นแล้วเจอ "ยอดชำระเปลี่ยนแปลง" ทั้งที่ไม่มีอะไรเปลี่ยน)
  var usedByThisOrder_ = privilegeRowsUsedByOrder_(lineUid, remark, billInfo.orderTime);
  var appliedPrivileges = getAppliedPrivileges_(lineUid, subtotal, [], items, priceMap, shippingCost, usedByThisOrder_);

  var usedCouponCodes = [];
  var couponRegex = /คูปอง:\s*([^\(]+?)\s*\(-\d/g;
  var m;
  while ((m = couponRegex.exec(remark || '')) !== null) usedCouponCodes.push(m[1].trim());

  var couponResults = [];
  usedCouponCodes.forEach(function (code) {
    var r = validateCoupon_(code, subtotal, items, priceMap, shippingCost, memberTierKey_, lineUid, { orderId: excludeOrderId, countedInOrder: true });
    if (r && !r.error) couponResults.push(r);
  });
  if (!couponResults.length) {
    couponResults = findAutoCoupons_(subtotal, items, priceMap, shippingCost, memberTierKey_);
  }

  // ⚡ แก้ (29/9/69) — กติกาเดียวกับ 2 จุดข้างบน: ใช้ช่องติ๊ก "ใช้ร่วมกับโปรอื่นได้" (สิทธิ์สมาชิกก่อนเสมอ)
  var exclRecalc_ = applyPromoExclusivity_(appliedPrivileges, couponResults, items);
  appliedPrivileges = exclRecalc_.privileges;
  couponResults = exclRecalc_.coupons;
  couponResults = trimCouponShippingDiscounts_(appliedPrivileges, couponResults, shippingCost);

  var privilegeProductDiscount = appliedPrivileges.reduce(function (s, p) { return s + (p.productDiscount || 0); }, 0);
  var privilegeShippingDiscount = appliedPrivileges.reduce(function (s, p) { return s + (p.shippingDiscount || 0); }, 0);
  var couponProductDiscount = couponResults.reduce(function (s, c) { return s + (c.productDiscount || 0); }, 0);
  var couponShippingDiscount = couponResults.reduce(function (s, c) { return s + (c.shippingDiscount || 0); }, 0);

  var repeatCandidate_ = getActiveRepeatBonusConfig_(items, subtotal, new Date());
  var priorOrdersThisMonth_ = repeatCandidate_ ? countPriorOrdersThisMonth_(billInfo.phone, excludeOrderId) : 0;
  var repeatConfig_ = priorOrdersThisMonth_ > 0 ? repeatCandidate_ : null;
  var repeatBonusDiscount_ = 0;
  if (!exclRecalc_.exclusivePrivilegeUsed && repeatConfig_ && repeatConfig_.discountValue > 0) {
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

// ⚡ เพิ่ม — เช็คว่าออเดอร์ที่ยังไม่จ่ายเงิน (รอแนบสลิป) นี้ ยังได้สิทธิ์/โปรโมชั่นเดิมอยู่ไหม เรียกเฉพาะตอนลูกค้า
// กด "ดำเนินการต่อ" จากหน้ารถเข็น (ไม่เรียกตอนกด "แนบสลิปการโอนเงิน" ทันทีหลังสั่งซื้อ เพราะเพิ่งคำนวณสดๆ ไป
// เมื่อกี้ไม่มีทางเปลี่ยน) แค่ "ดูตัวอย่าง" เฉยๆ ยังไม่เขียนอะไรลงชีต ต้องเรียก confirmPendingOrderRecalc
// ยืนยันอีกทีถึงจะบันทึกยอดใหม่จริง (กันเคสลูกค้าเปิดเข้ามาดูเฉยๆ แล้วโดนเปลี่ยนยอดไปเองโดยไม่ได้ตั้งใจ)
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

// ⚡ เพิ่ม — ลูกค้ากด "ยืนยันยอดใหม่" หลังเห็นป๊อปอัปเตือนจาก checkPendingOrderPromoStillValid แล้ว คำนวณซ้ำ
// อีกรอบด้วยข้อมูลสดจากเซิร์ฟเวอร์เอง (ไม่เชื่อค่าที่ฝั่งลูกค้าส่งมา กันการปลอมยอด) แล้วบันทึกทับของเดิมจริง —
// เขียนทับเฉพาะคอลัมน์ที่เกี่ยวกับยอดเงิน/ส่วนลด/หมายเหตุ ไม่แตะคอลัมน์อื่น (เลขที่ออเดอร์ วันที่สั่งซื้อเดิม
// เบอร์โทร ที่อยู่ ฯลฯ) เพื่อไม่ให้ประวัติจริงของออเดอร์เพี้ยนไปจากที่ลูกค้าสั่งจริง
function confirmPendingOrderRecalc(idToken, orderId) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return { success: false, error: 'ระบบไม่ว่าง กรุณาลองใหม่อีกครั้ง' }; }
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
    if (billInfo.slipImageUrl) return { success: true, changed: false, amount: billInfo.billTotal }; // แนบสลิปไปแล้ว
    if (billInfo.lineUid && billInfo.lineUid !== profile.sub) {
      return { success: false, error: 'ไม่มีสิทธิ์เข้าถึงออเดอร์นี้' };
    }

    var oldRemark = String(sheet.getRange(targetRow, 20).getValue() || '');
    var recalc = recalcOrderDiscounts_(profile.sub, billInfo, oldRemark, orderId);

    if (Math.abs(recalc.finalAmount - billInfo.billTotal) < 1) {
      return { success: true, changed: false, amount: billInfo.billTotal };
    }

    // หาทุกแถวของออเดอร์นี้ (ออเดอร์หลายรายการมีหลายแถว แถวถัดจากแถวแรกจะว่างคอลัมน์ A)
    var lastItemRow = targetRow;
    for (var r = targetRow + 1; r <= lastRow; r++) {
      var idCell = sheet.getRange(r, 1).getValue();
      if (idCell !== '' && idCell !== null && idCell !== undefined) break;
      lastItemRow = r;
    }
    var itemRows = sheet.getRange(targetRow, 1, lastItemRow - targetRow + 1, 5).getValues(); // A-E
    for (var ri = 0; ri < itemRows.length; ri++) {
      var qty = parseFloat(itemRows[ri][3]) || 0; // D
      var price = parseFloat(itemRows[ri][4]) || 0; // E
      var amt = qty * price;
      var itemDiscount = recalc.subtotal > 0 ? Math.round(recalc.totalDiscount * (amt / recalc.subtotal) * 100) / 100 : 0;
      sheet.getRange(targetRow + ri, 6).setValue(itemDiscount); // F
      sheet.getRange(targetRow + ri, 7).setValue(amt - itemDiscount); // G
    }

    var discountNoteParts = [];
    var freebieNoteParts = [];
    var physicalFreebieNoteParts = [];
    recalc.appliedPrivileges.forEach(function (p) {
      if (p.discount > 0) discountNoteParts.push('สิทธิ์: ' + p.name + ' (-' + Math.round(p.discount) + ')');
      if (p.type === 'bogo' && p.freeQtyGranted > 0) freebieNoteParts.push(p.name + ' (ลดราคา ' + p.freeQtyGranted + ' ชิ้น)');
      var physicalNote_ = physicalFreebieNotePart_(p.name, p); // ⚡ แก้ (1/10/69) — รวมของแถมโปรขายราคาพิเศษ
      if (physicalNote_) physicalFreebieNoteParts.push(physicalNote_);
    });
    recalc.couponResults.forEach(function (c) {
      if (c.discount > 0) discountNoteParts.push('คูปอง: ' + c.code + ' (-' + Math.round(c.discount) + ')');
      if (c.type === 'bogo' && c.freeQtyGranted > 0) freebieNoteParts.push(c.code + ' (ลดราคา ' + c.freeQtyGranted + ' ชิ้น)');
      var physicalNote_ = physicalFreebieNotePart_(c.code, c);
      if (physicalNote_) physicalFreebieNoteParts.push(physicalNote_);
    });
    if (recalc.repeatConfig) {
      if (recalc.repeatBonusDiscount > 0) discountNoteParts.push('ซื้อซ้ำเดือนนี้: ' + recalc.repeatConfig.name + ' (-' + Math.round(recalc.repeatBonusDiscount) + ')');
      if (recalc.repeatConfig.bonusPoints > 0) discountNoteParts.push('ซื้อซ้ำเดือนนี้: ' + recalc.repeatConfig.name + ' (+' + recalc.repeatConfig.bonusPoints + ' แต้ม)');
    }
    var shippingDiscountAmt_ = recalc.shippingCost - recalc.finalShippingCost;
    var shippingLine = shippingDiscountAmt_ > 0
      ? ('ค่าจัดส่ง: ' + Math.round(recalc.shippingCost) + ' บาท ลด ' + Math.round(shippingDiscountAmt_) + ' บาท เหลือ ' + Math.round(recalc.finalShippingCost) + ' บาท')
      : ('ค่าจัดส่ง: ' + Math.round(recalc.finalShippingCost) + ' บาท');
    var statusText_ = oldRemark.indexOf('รอตรวจสอบสลิป') !== -1 ? 'รอตรวจสอบสลิป - LINE Shop' : 'รอแนบสลิป - LINE Shop';

    var newRemark = shippingLine + ' (น้ำหนักรวม ' + recalc.totalWeightG + ' กรัม) | ' + statusText_
      + (discountNoteParts.length ? ' | ' + discountNoteParts.join(', ') : '')
      + (recalc.pendingPoints.points > 0 ? ' | 🎯 คะแนนรอหัก: ' + recalc.pendingPoints.points + ' คะแนน (-฿' + Math.round(recalc.pendingPoints.discount) + ')' : '')
      + (freebieNoteParts.length ? ' | 🎁 แถม (ลดราคาแล้ว): ' + freebieNoteParts.join(', ') : '')
      + (physicalFreebieNoteParts.length ? ' | 📦 ต้องหยิบของแถมเพิ่ม: ' + physicalFreebieNoteParts.join(', ') : '')
      + (billInfo.purchaseReferrerCode ? ' | 🤝 รหัสแนะนำซื้อ: ' + billInfo.purchaseReferrerCode : '')
      + ' | ⚡ คำนวณยอดใหม่ (สิทธิ์/โปรเปลี่ยนแปลง) เมื่อ ' + Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm')
      + ': จาก ฿' + Math.round(billInfo.billTotal) + ' เป็น ฿' + Math.round(recalc.finalAmount);

    var campaignNameParts = recalc.appliedPrivileges.map(function (p) { return p.name; });
    recalc.couponResults.forEach(function (c) { campaignNameParts.push(c.code); });
    var campaignValue = campaignNameParts.join(' + ');

    sheet.getRange(targetRow, 8).setValue(recalc.finalShippingCost); // H
    sheet.getRange(targetRow, 9).setValue(recalc.finalAmount); // I
    sheet.getRange(targetRow, 18).setValue(campaignValue); // R
    sheet.getRange(targetRow, 20).setValue(newRemark); // T

    return { success: true, changed: true, amount: recalc.finalAmount };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ⚡ เพิ่ม — ดึง "รายการส่วนลด/โปรที่ลูกค้าใช้" ออกจากข้อความหมายเหตุในชีต Revenue เพื่อเอาไปแสดงในข้อความ
// แจ้งเตือนกลุ่มแอดมิน เดิมการ์ดแอดมินโชว์แค่ยอดชำระสุทธิ แอดมินจึงดูไม่ออกว่าทำไมยอดถึงน้อยกว่าราคาสินค้า
// และลูกค้าใช้สิทธิ์อะไรไปบ้าง (ต้องไปเปิดชีตดูเองทุกครั้ง)
//
// รูปแบบที่ createShopOrder เขียนไว้: "สิทธิ์: ชื่อ (-100), คูปอง: CODE (-50), แลกคะแนน: 20 คะแนน (-20)"
// คั่นแต่ละกลุ่มด้วย " | " — จึงคัดเฉพาะกลุ่มที่ขึ้นต้นด้วยป้ายกำกับที่รู้จักเท่านั้น (ไม่ใช้วิธีไล่ข้ามกลุ่มอื่น
// เพราะถ้ามีการเพิ่มกลุ่มใหม่ในอนาคตจะหลุดมาปนได้) และตอนแยกรายการย่อยใช้ lookahead แยกเฉพาะลูกน้ำที่ตาม
// ด้วยป้ายกำกับจริงๆ กันชื่อโปรที่มีลูกน้ำอยู่ข้างในถูกหั่นกลางชื่อ
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

// แยกข้อความ 1 รายการออกเป็น "ชื่อ" กับ "จำนวน" เพื่อจัดคอลัมน์ให้อ่านง่าย
// "สิทธิ์: ลดวันเกิด (-60)" → { label: 'สิทธิ์: ลดวันเกิด', amount: '-฿60' }
// "คูณแต้ม: โปรปีใหม่ (x2)" → { label: 'คูณแต้ม: โปรปีใหม่', amount: 'x2' }
function splitDiscountNote_(note) {
  var text = String(note || '').trim();
  var money = text.match(/^(.*?)\s*\(-\s*([\d,.]+)\)$/);
  if (money) return { label: money[1].trim(), amount: '-฿' + money[2] };
  var other = text.match(/^(.*?)\s*\(([^()]*)\)$/);
  if (other) return { label: other[1].trim(), amount: other[2].trim() };
  return { label: text, amount: '' };
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
    orderTime: mainRow[1] || '', // คอลัมน์ B: เวลาสั่งซื้อ
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

// ⚡ แก้ (6/9/69) — ฟังก์ชันนี้ถูกเรียกใช้ใน uploadShopSlip มานานแล้วแต่ไม่เคยถูกสร้างขึ้นจริง ทำให้ทุกครั้งที่
// มีคนแนบสลิป โค้ดจะพังตรงจุดที่เรียกฟังก์ชันนี้ (ฟังก์ชันไม่มีอยู่จริง) ก่อนจะไปถึงส่วนแจ้งเตือน LINE เลย —
// นี่คือสาเหตุที่วันที่ชำระเงินไม่ถูกบันทึกและไม่มีการแจ้งเตือนใด ๆ เลยหลังแนบสลิปสำเร็จ คอลัมน์ 31 (AE) คือ
// คอลัมน์ "วันที่ชำระเงิน" ที่ว่างไว้ (อ้างอิงจากคอมเมนต์ตอนย้าย LINE UID ไปคอลัมน์ AF ด้านบน)
function recordPaymentDateIfMissing_(sheet, row) {
  try {
    var cell = sheet.getRange(row, 31);
    if (!cell.getValue()) {
      cell.setNumberFormat('dd/MM/yyyy HH:mm:ss');
      cell.setValue(new Date());
    }
  } catch (e) {
    Logger.log('recordPaymentDateIfMissing_ error: ' + e.toString());
  }
}

// ⚡ เพิ่ม (6/9/69) — ฟังก์ชันซ่อมออเดอร์ที่ติดปัญหา recordPaymentDateIfMissing_ หายไป (ดูคอมเมนต์ด้านบน)
// ก่อนแก้ไข ทุกออเดอร์ที่แนบสลิปสำเร็จ (มีลิงก์สลิปในคอลัมน์ K) แต่โค้ดพังก่อนถึงขั้นตอนถัดไป จะไม่ได้รับทั้ง
// วันที่ชำระเงิน, สถานะที่อัปเดต, แต้มสะสม, สิทธิ์แนะนำเพื่อน และการแจ้งเตือน LINE เลย — ฟังก์ชันนี้ไล่หาออเดอร์
// ที่มีลักษณะนี้ (มีลิงก์สลิปแล้ว แต่วันที่ชำระเงินว่าง) แล้วรันขั้นตอนที่เคยพังไปให้ครบใหม่ทุกอย่าง
//
// วิธีใช้ (รันจาก Apps Script editor: เลือกฟังก์ชันนี้จาก dropdown ด้านบน แล้วกด ▶️ Run):
//   1. รันแบบ dry run ก่อนเสมอ: repairMissedSlipNotifications_(false)
//      แล้วเปิดดู Logger (มุมมอง > บันทึก หรือ Ctrl+Enter) จะเห็นรายการออเดอร์ที่เจอ ยังไม่มีการแก้ไข/ส่งอะไรจริง
//   2. ตรวจสอบรายการแล้วถูกต้อง ค่อยรันจริง: repairMissedSlipNotifications_(true)
//      ตอนนี้จะบันทึกวันที่ชำระเงิน, แก้สถานะ, ให้แต้ม/สิทธิ์แนะนำเพื่อน (ถ้ายังไม่เคยได้), และส่งแจ้งเตือน LINE
//      จริงให้ทุกออเดอร์ที่เจอ — ฟังก์ชันย่อยด้านในกันการให้แต้ม/สิทธิ์ซ้ำอยู่แล้ว รันซ้ำได้อย่างปลอดภัยถ้าจำเป็น
function repairMissedSlipNotifications_(reallySend) {
  var ss = SpreadsheetApp.openById(REVENUE_SHEET_ID_SHOP);
  var sheet = ss.getSheetByName(REVENUE_SHEET_NAME_SHOP);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) { Logger.log('ไม่พบข้อมูลออเดอร์เลย'); return []; }

  // ⚡ แก้ (7/9/69) — เดิมกรองแค่ "มีลิงก์สลิปแต่ไม่มีวันที่ชำระเงิน" เฉย ๆ โดยไม่เช็คว่าเป็นออเดอร์ LINE Shop
  // จริงไหม ชีต Revenue นี้มีออเดอร์จากหลายช่องทางปนกัน (Shopee, TikTok, Bulk Buyers ฯลฯ) ทำให้ครั้งก่อนไป
  // จับออเดอร์ Bulk Buyers ที่บังเอิญมีลักษณะตรงเงื่อนไขเดียวกันมาซ่อม/แจ้งเตือนซ้ำโดยไม่ตั้งใจ เพิ่มเช็ค
  // CustomerType (คอลัมน์ S) ต้องเป็น "สมาชิก LINE" เท่านั้น — ค่านี้ Members.gs เขียนตายตัวทุกครั้งที่สร้าง
  // ออเดอร์ LINE Shop เอง จึงใช้แยกออเดอร์ช่องทางอื่นออกได้แม่นยำ
  var data = sheet.getRange(2, 1, lastRow - 1, 31).getValues(); // คอลัมน์ A ถึง AE
  var affected = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var orderIdCell = row[0];
    if (!orderIdCell) continue; // แถวรายการย่อยของออเดอร์เดิม (มากกว่า 1 ชิ้น) ไม่ใช่แถวหลักของออเดอร์
    var slipUrlCell = row[10];   // คอลัมน์ K
    var paymentDateCell = row[30]; // คอลัมน์ AE
    var customerTypeCell = row[18]; // คอลัมน์ S
    // ⚡ เพิ่ม (19/9/69) — ข้ามออเดอร์เก็บเงินปลายทางเสมอ: คอลัมน์ K ของออเดอร์แบบนั้นเป็นข้อความกำกับ
    // ไม่ใช่ลิงก์สลิป และออเดอร์ที่ถูกบันทึกว่า "ตีกลับ" จะถูกล้างวันที่ชำระเงินทิ้ง ซึ่งเข้าเงื่อนไขนี้พอดี
    // ถ้าไม่กันไว้ เครื่องมือซ่อมจะไปเติมวันที่ชำระเงินและส่งแจ้งเตือนให้ออเดอร์ที่ตีกลับไปแล้ว
    if (slipUrlCell && !paymentDateCell && customerTypeCell === 'สมาชิก LINE' && !isCodPaymentLabel_(row[9])) {
      affected.push({ orderId: String(orderIdCell), rowNumber: i + 2 });
    }
  }

  Logger.log('เจอออเดอร์ที่ติดปัญหาทั้งหมด ' + affected.length + ' รายการ:');
  affected.forEach(function (o) { Logger.log('- ' + o.orderId + ' (แถวที่ ' + o.rowNumber + ')'); });

  if (!reallySend) {
    Logger.log('นี่คือ dry run เท่านั้น ยังไม่ได้แก้ไขหรือส่งแจ้งเตือนอะไรจริง ถ้ารายการด้านบนถูกต้องแล้ว ให้รันอีกครั้งด้วย repairMissedSlipNotifications_(true)');
    return affected;
  }

  affected.forEach(function (o) {
    try {
      var payCell_ = sheet.getRange(o.rowNumber, 31);
      if (!payCell_.getValue()) {
        var orderCreatedDate_ = sheet.getRange(o.rowNumber, 23).getValue();
        var realPaymentDate_ = orderCreatedDate_ || new Date();
        payCell_.setNumberFormat('dd/MM/yyyy HH:mm:ss');
        payCell_.setValue(realPaymentDate_);
      }

      var existingRemark = String(sheet.getRange(o.rowNumber, 20).getValue() || '');
      var updatedRemark = existingRemark.indexOf('รอแนบสลิป - LINE Shop') !== -1
        ? existingRemark.replace('รอแนบสลิป - LINE Shop', 'รอตรวจสอบสลิป - LINE Shop')
        : existingRemark;
      if (updatedRemark !== existingRemark) sheet.getRange(o.rowNumber, 20).setValue(updatedRemark);

      var billInfo = getBillDataForNotify_(sheet, o.rowNumber);
      var buyerUid = billInfo.lineUid || findMemberLineUidByPhone_(billInfo.phone);
      if (!buyerUid) {
        logErrorToSheet_('repairMissedSlipNotifications_:buyerUidNotFound', 'orderId="' + o.orderId + '" phone="' + billInfo.phone + '"');
      }
      if (buyerUid) {
        notifyBuyerOrderConfirmation_(buyerUid, o.orderId, billInfo.items, billInfo.paymentLabel, billInfo.subtotal, billInfo.discountTotal, billInfo.shippingCost, billInfo.billTotal, billInfo.freebieItems, billInfo.physicalFreebieItems);

        try {
          if (!hasPointsAlreadyCreditedForOrder_(buyerUid, o.orderId)) {
            var buyerRowIndex_ = findMemberRowIndex_(buyerUid);
            if (buyerRowIndex_ !== -1) {
              var buyerRow_ = ensureMembersSheet_().getRange(buyerRowIndex_, 1, 1, 12).getValues()[0];
              var buyerPoints_ = buyerRow_[5] || 0;
              var buyerLifetimeSpend_ = buyerRow_[11] || 0;
              var buyerTierName_ = buyerRow_[6];
              var buyerTierInfo_ = resolveTierByStoredValue_(buyerTierName_, buyerLifetimeSpend_, buyerUid);
              var basePoints_ = Math.floor((billInfo.billTotal || 0) / BAHT_PER_POINT);
              var slipItemsForPromo_ = billInfo.items.map(function (it) { return { name: it.name, qty: it.qty, price: it.price }; });
              var slipMultiplierInfo_ = getActivePointsMultiplier_(slipItemsForPromo_, billInfo.subtotal);
              var slipRepeatBonus_ = countPriorOrdersThisMonth_(billInfo.phone, o.orderId) > 0
                ? getActiveRepeatBonusConfig_(slipItemsForPromo_, billInfo.subtotal)
                : null;
              var pointsEarned_ = Math.floor(basePoints_ * buyerTierInfo_.pointMultiplier * slipMultiplierInfo_.multiplier * (slipRepeatBonus_ ? (slipRepeatBonus_.multiplier || 1) : 1))
                + (slipRepeatBonus_ ? (slipRepeatBonus_.bonusPoints || 0) : 0);
              var slipPromoNoteParts_ = [];
              if (slipMultiplierInfo_.multiplier > 1) slipPromoNoteParts_.push('คูณแต้ม x' + slipMultiplierInfo_.multiplier + ' (' + slipMultiplierInfo_.name + ')');
              if (slipRepeatBonus_ && slipRepeatBonus_.multiplier > 1) slipPromoNoteParts_.push('ซื้อซ้ำคูณแต้ม x' + slipRepeatBonus_.multiplier + ' (' + slipRepeatBonus_.name + ')');
              if (slipRepeatBonus_ && slipRepeatBonus_.bonusPoints > 0) slipPromoNoteParts_.push('โบนัสซื้อซ้ำ +' + slipRepeatBonus_.bonusPoints + ' แต้ม (' + slipRepeatBonus_.name + ')');
              var slipPromoNote_ = slipPromoNoteParts_.length ? ('— รวม ' + slipPromoNoteParts_.join(', ')) : '';
              addPointsAndCheckRewards_(buyerUid, pointsEarned_, billInfo.billTotal, buyerRowIndex_, buyerPoints_, buyerLifetimeSpend_, buyerTierName_, o.orderId, slipPromoNote_);
            }
          }
        } catch (pointsErr) {
          Logger.log('repairMissedSlipNotifications_: ให้คะแนนไม่สำเร็จ (' + o.orderId + '): ' + pointsErr.toString());
          logErrorToSheet_('repairMissedSlipNotifications_:points', 'orderId="' + o.orderId + '" — ' + pointsErr.toString());
        }

        try {
          checkAndGrantReferralOnFirstPurchase_(buyerUid, billInfo.subtotal, billInfo.items);
        } catch (refPurchErr2) {
          Logger.log('repairMissedSlipNotifications_: เช็ครางวัลแนะนำเพื่อนไม่สำเร็จ (' + o.orderId + '): ' + refPurchErr2.toString());
        }
        try {
          checkAndGrantPurchaseReferral_(billInfo.purchaseReferrerCode, buyerUid, o.orderId, billInfo.billTotal, billInfo.items);
        } catch (purchRefErr2) {
          Logger.log('repairMissedSlipNotifications_: เช็ครางวัลแนะนำซื้อสินค้าไม่สำเร็จ (' + o.orderId + '): ' + purchRefErr2.toString());
        }
      }
      notifyAdminNewOrder_(o.orderId, billInfo.customerName, billInfo.phone, billInfo.items, billInfo.paymentLabel, billInfo.billTotal, billInfo.address, billInfo.province, billInfo.freebieItems, billInfo.slipImageUrl, billInfo.physicalFreebieItems, billInfo);

      Logger.log('ซ่อมออเดอร์ ' + o.orderId + ' สำเร็จ');
    } catch (e) {
      Logger.log('ซ่อมออเดอร์ ' + o.orderId + ' ไม่สำเร็จ: ' + e.toString());
      logErrorToSheet_('repairMissedSlipNotifications_', 'orderId="' + o.orderId + '" — ' + e.toString());
    }
  });

  Logger.log('ซ่อมเสร็จสิ้น รวม ' + affected.length + ' ออเดอร์');
  return affected;
}

// ⚡ เพิ่ม (6/9/69) — ปุ่ม ▶️ Run ในหน้า Apps Script editor รันได้แค่ฟังก์ชันที่ไม่มีพารามิเตอร์เท่านั้น
// สร้างฟังก์ชันครอบไว้ 2 ตัวนี้เพื่อให้เลือกจาก dropdown แล้วกด Run ได้ตรง ๆ โดยไม่ต้องพิมพ์โค้ดเอง
// ใช้งาน: เลือก runRepairDryRun_ ก่อน ดูผลใน Logger (มุมมอง > บันทึก) ตรวจสอบรายการให้ถูกต้อง
// แล้วค่อยเลือก runRepairForReal_ เพื่อรันจริง
function runRepairDryRun_() {
  repairMissedSlipNotifications_(false);
}
function runRepairForReal_() {
  repairMissedSlipNotifications_(true);
}

// ⚡ เพิ่ม — เช็คสถานะ "แนบสลิปแล้วหรือยัง" ของออเดอร์นี้ แบบเบาที่สุดเท่าที่จะทำได้ เพราะถูกเรียกซ้ำๆ ทุก
// ไม่กี่วินาที (จากหน้าสั่งซื้อ ระหว่างรอลูกค้าแนบสลิป) — ใช้ตอนลูกค้าแนบสลิปจากหน้าต่าง/แท็บแยกต่างหาก
// (slipUpload.html ที่เปิดจากลิงก์ใน LINE) ให้หน้าสั่งซื้อเดิมรู้ตัวและปิดตามได้เอง โดยไม่ต้องพึ่ง
// window.opener/postMessage ที่ไม่เสถียรในแอป LINE บนมือถือ — ค้นแค่ช่วง 300 แถวท้ายสุดของชีต (ออเดอร์ที่
// เพิ่งสั่งย่อมอยู่ใกล้ท้ายชีตเสมอ) ไม่ใช่ไล่ทั้งคอลัมน์ กันเป็นภาระเพิ่มตอนถูกเรียกถี่ๆ
function checkSlipAttached(orderId) {
  try {
    var sheet = SpreadsheetApp.openById(REVENUE_SHEET_ID_SHOP).getSheetByName(REVENUE_SHEET_NAME_SHOP);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, attached: false };
    var windowSize = 300;
    var probeStart = Math.max(2, lastRow - windowSize + 1);
    var ids = sheet.getRange(probeStart, 1, lastRow - probeStart + 1, 1).getValues();
    for (var i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(orderId)) {
        var slipUrl = String(sheet.getRange(probeStart + i, 11).getValue() || '');
        return { success: true, attached: !!slipUrl };
      }
    }
    return { success: true, attached: false };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
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

// ⚡ เพิ่ม (perf) — คิว orderId ที่รอส่งแจ้งเตือน/ให้คะแนน/เช็ครางวัลแนะนำเพื่อน (เก็บใน PropertiesService กัน
// พลาดถ้ามีคนแนบสลิปพร้อมกันหลายคนในเวลาไล่เลี่ยกัน) แล้วตั้ง trigger ครั้งเดียวให้รันอีก ~1 วิถัดไป
var PENDING_SLIP_FINALIZE_PROP_ = 'pending_slip_finalize_ids';
var SLIP_FINALIZE_TRIGGER_HANDLER_ = 'runPendingSlipFinalizations_';
// ⚡ เพิ่ม (perf) — หาแถวของออเดอร์ในชีต Revenue โดย "ส่องท้ายชีตก่อน" แทนการอ่านคอลัมน์ A ทั้งชีตทุกครั้ง
// ออเดอร์ที่กำลังแนบสลิป/กำลังส่งแจ้งเตือน เป็นออเดอร์ที่เพิ่งสั่งไปไม่นาน จึงอยู่ใกล้ท้ายชีตแทบทุกครั้ง
// ถ้าไม่เจอในช่วงท้าย ค่อยไล่อ่านทั้งคอลัมน์ตามเดิม (ผลลัพธ์เหมือนกันเป๊ะ แค่กรณีส่วนใหญ่ไม่ต้องลากข้อมูลทั้งชีต)
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

function scheduleSlipFinalize_(orderId) {
  var lock = LockService.getScriptLock();
  try {
    try { lock.waitLock(5000); } catch (e) { /* ล็อกไม่ได้ก็ยังตั้ง trigger ต่อเลย ดีกว่าไม่ส่งแจ้งเตือนไปเลย */ }
    var props = PropertiesService.getScriptProperties();
    var pending = [];
    try { pending = JSON.parse(props.getProperty(PENDING_SLIP_FINALIZE_PROP_) || '[]'); } catch (e2) {}
    if (pending.indexOf(orderId) === -1) pending.push(orderId);
    props.setProperty(PENDING_SLIP_FINALIZE_PROP_, JSON.stringify(pending));
  } finally {
    try { lock.releaseLock(); } catch (e3) {}
  }
  ScriptApp.newTrigger(SLIP_FINALIZE_TRIGGER_HANDLER_).timeBased().after(1000).create();
}

// ⚡ เพิ่ม (perf) — ฟังก์ชันนี้ถูกเรียกโดย trigger แบบครั้งเดียวเท่านั้น (ไม่ใช่ google.script.run จากลูกค้า
// โดยตรง) จึงต้องลบ trigger ของตัวเองทิ้งทุกครั้งหลังทำงานเสร็จ กันสะสม trigger ค้างจนเกินโควตาของ Apps Script
// — ดึงคิว orderId ที่ค้างอยู่ทั้งหมดมาประมวลผลรวดเดียว (เผื่อมีหลายออเดอร์คิวมาพร้อมกัน)
function runPendingSlipFinalizations_() {
  var props = PropertiesService.getScriptProperties();
  var pending = [];
  var lock = LockService.getScriptLock();
  try {
    try { lock.waitLock(10000); } catch (e) { return; } // ล็อกไม่ได้ ปล่อยให้ trigger รอบอื่นที่ค้างอยู่จัดการแทน
    try { pending = JSON.parse(props.getProperty(PENDING_SLIP_FINALIZE_PROP_) || '[]'); } catch (e2) {}
    props.deleteProperty(PENDING_SLIP_FINALIZE_PROP_);
  } finally {
    try { lock.releaseLock(); } catch (e3) {}
  }
  pending.forEach(function (orderId) {
    try { finalizeSlipNotifications_(orderId); } catch (err) {
      logErrorToSheet_('runPendingSlipFinalizations_', 'orderId="' + orderId + '" — ' + err.toString());
    }
  });
  // ให้คะแนน/รางวัลแนะนำเพื่อนถูกเขียนจาก trigger นี้ (ไม่ผ่าน doGet) จึงต้องส่งสำเนาไป Supabase เอง
  if (pending.length && typeof mirrorAfterBackgroundWrite_ === 'function') {
    mirrorAfterBackgroundWrite_(MIRROR_ORDER_TABS_.concat(['members/Referral_Log']));
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === SLIP_FINALIZE_TRIGGER_HANDLER_) {
      try { ScriptApp.deleteTrigger(t); } catch (e4) {}
    }
  });
}

// ⚡ เพิ่ม (perf) — เนื้อหาเดิมทุกบรรทัดของ uploadShopSlip ส่วนแจ้งเตือน/ให้คะแนน/เช็ครางวัลแนะนำเพื่อน ย้ายมา
// อยู่ตรงนี้ แค่ต้องหา targetRow ใหม่จาก orderId เอง (เพราะรันคนละรอบ execution กับตอนบันทึกสลิปแล้ว) —
// ป้องกันการให้คะแนนซ้ำอยู่แล้วด้วย hasPointsAlreadyCreditedForOrder_ เหมือนเดิมทุกประการ ต่อให้ trigger
// นี้ถูกเรียกซ้ำโดยไม่ตั้งใจก็จะไม่ให้คะแนนซ้ำ (อย่างมากแค่ส่งไลน์แจ้งเตือนซ้ำซึ่งไม่กระทบข้อมูล)
// ⚡ เพิ่ม (perf) — เปิดสิทธิ์ "ใครมีลิงก์ก็ดูได้" ให้ไฟล์สลิป ย้ายมาทำตรงนี้แทนที่จะทำตอนลูกค้ากดยืนยัน
// (ดูเหตุผลใน uploadShopSlip) ต้องทำก่อนส่งข้อความไลน์เสมอ เพราะ LINE ต้องโหลดรูปจากลิงก์นี้ไปแสดง
function ensureSlipFileShared_(slipImageUrl) {
  try {
    var m = String(slipImageUrl || '').match(/\/file\/d\/([^\/]+)\//);
    if (!m) return;
    DriveApp.getFileById(m[1]).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log('ensureSlipFileShared_ error: ' + e.toString());
  }
}

/**
 * ⚡ เพิ่ม (19/9/69) — ให้แต้มสะสม/ยอดซื้อสะสม + เช็ครางวัลแนะนำเพื่อน ของออเดอร์ที่ "ได้รับเงินจริงแล้ว"
 * แยกออกมาเป็นฟังก์ชันกลาง เพราะตอนนี้มี 2 จังหวะที่ถือว่าได้รับเงินจริง และต้องทำเหมือนกันเป๊ะๆ:
 *   1) ออเดอร์โอนเงิน — ตอนลูกค้าแนบสลิปสำเร็จ (finalizeSlipNotifications_)
 *   2) ออเดอร์เก็บเงินปลายทาง — ตอนแอดมินกดยืนยันว่าเก็บเงินได้แล้ว (confirmCodPayment)
 * ภายในกันการให้ซ้ำอยู่แล้ว (hasPointsAlreadyCreditedForOrder_ และฟังก์ชันรางวัลแนะนำเพื่อนเช็คซ้ำเอง)
 * จึงเรียกซ้ำได้อย่างปลอดภัย
 */
function creditOrderPointsAndReferrals_(orderId, billInfo, buyerUid) {
  if (!buyerUid) return;
  try {
    if (!hasPointsAlreadyCreditedForOrder_(buyerUid, orderId)) {
      var buyerRowIndex_ = findMemberRowIndex_(buyerUid);
      if (buyerRowIndex_ !== -1) {
        var buyerRow_ = ensureMembersSheet_().getRange(buyerRowIndex_, 1, 1, 12).getValues()[0];
        var buyerPoints_ = buyerRow_[5] || 0;
        var buyerLifetimeSpend_ = buyerRow_[11] || 0;
        var buyerTierName_ = buyerRow_[6];
        var buyerTierInfo_ = resolveTierByStoredValue_(buyerTierName_, buyerLifetimeSpend_, buyerUid);
        var basePoints_ = Math.floor((billInfo.billTotal || 0) / BAHT_PER_POINT);
        var slipItemsForPromo_ = billInfo.items.map(function (it) { return { name: it.name, qty: it.qty, price: it.price }; });
        var slipMultiplierInfo_ = getActivePointsMultiplier_(slipItemsForPromo_, billInfo.subtotal);
        var slipRepeatBonus_ = countPriorOrdersThisMonth_(billInfo.phone, orderId) > 0
          ? getActiveRepeatBonusConfig_(slipItemsForPromo_, billInfo.subtotal)
          : null;
        var pointsEarned_ = Math.floor(basePoints_ * buyerTierInfo_.pointMultiplier * slipMultiplierInfo_.multiplier * (slipRepeatBonus_ ? (slipRepeatBonus_.multiplier || 1) : 1))
          + (slipRepeatBonus_ ? (slipRepeatBonus_.bonusPoints || 0) : 0);
        var slipPromoNoteParts_ = [];
        if (slipMultiplierInfo_.multiplier > 1) slipPromoNoteParts_.push('คูณแต้ม x' + slipMultiplierInfo_.multiplier + ' (' + slipMultiplierInfo_.name + ')');
        if (slipRepeatBonus_ && slipRepeatBonus_.multiplier > 1) slipPromoNoteParts_.push('ซื้อซ้ำคูณแต้ม x' + slipRepeatBonus_.multiplier + ' (' + slipRepeatBonus_.name + ')');
        if (slipRepeatBonus_ && slipRepeatBonus_.bonusPoints > 0) slipPromoNoteParts_.push('โบนัสซื้อซ้ำ +' + slipRepeatBonus_.bonusPoints + ' แต้ม (' + slipRepeatBonus_.name + ')');
        var slipPromoNote_ = slipPromoNoteParts_.length ? ('— รวม ' + slipPromoNoteParts_.join(', ')) : '';
        addPointsAndCheckRewards_(buyerUid, pointsEarned_, billInfo.billTotal, buyerRowIndex_, buyerPoints_, buyerLifetimeSpend_, buyerTierName_, orderId, slipPromoNote_);
      }
    }
  } catch (pointsErr) {
    Logger.log('creditOrderPointsAndReferrals_: ให้คะแนนไม่สำเร็จ: ' + pointsErr.toString());
    logErrorToSheet_('creditOrderPointsAndReferrals_:points', pointsErr.toString() + ' | stack: ' + (pointsErr.stack || '-'));
  }

  // ⚡ เพิ่ม (25/8/69) — ออเดอร์แนบสลิปสำเร็จแล้วถือว่า "ซื้อสำเร็จ" เช็คให้รางวัลแนะนำเพื่อนได้เลย
  try {
    checkAndGrantReferralOnFirstPurchase_(buyerUid, billInfo.subtotal, billInfo.items);
  } catch (refPurchErr2) {
    Logger.log('creditOrderPointsAndReferrals_: เช็ครางวัลแนะนำเพื่อนไม่สำเร็จ: ' + refPurchErr2.toString());
  }
  // ⚡ เพิ่ม (25/8/69) — เช็ค "แนะนำเพื่อนซื้อสินค้า" ด้วย (ดึงรหัสที่ผูกไว้กับบิลนี้กลับมาใช้)
  try {
    checkAndGrantPurchaseReferral_(billInfo.purchaseReferrerCode, buyerUid, orderId, billInfo.billTotal, billInfo.items);
  } catch (purchRefErr2) {
    Logger.log('creditOrderPointsAndReferrals_: เช็ครางวัลแนะนำซื้อสินค้าไม่สำเร็จ: ' + purchRefErr2.toString());
  }
}

function finalizeSlipNotifications_(orderId) {
  try {
    var sheet = ensureRevenueSheet_();
    var targetRow = findRevenueRowByOrderId_(sheet, orderId);
    if (targetRow === -1) {
      logErrorToSheet_('finalizeSlipNotifications_', 'orderId="' + orderId + '" — ไม่พบแถวออเดอร์นี้ตอนจะส่งแจ้งเตือน (ข้อมูลหลักบันทึกไปแล้วก่อนหน้านี้แล้ว ไม่กระทบยอด/สถานะออเดอร์)');
      return;
    }

    var billInfo = getBillDataForNotify_(sheet, targetRow);
    ensureSlipFileShared_(billInfo.slipImageUrl);
    // ⚡ แก้ — ใช้ LINE UID ที่บันทึกไว้ตอนสั่งซื้อโดยตรงก่อนเสมอ (แม่นยำกว่า ไม่มีวันคลาดเพราะเบอร์โทรเปลี่ยน)
    // fallback ไปเช็คจากเบอร์โทรเฉพาะออเดอร์เก่าที่สั่งไว้ก่อนแก้โค้ดจุดนี้ (ยังไม่มีคอลัมน์ LINE UID บันทึกไว้)
    var buyerUid = billInfo.lineUid || findMemberLineUidByPhone_(billInfo.phone);
    if (!buyerUid) {
      // ⚡ เพิ่ม — เดิมจุดนี้ถ้าหา LINE UID ไม่เจอจะข้ามการแจ้งเตือนลูกค้าไปเงียบๆ ไม่มีร่องรอยให้ตรวจสอบเลย
      // เปลี่ยนเป็นบันทึกลง Error Log sheet ไว้เสมอ เพื่อให้แอดมินตามไปแจ้งลูกค้าเองได้ทันถ้าเกิดกรณีนี้อีก
      logErrorToSheet_('finalizeSlipNotifications_:buyerUidNotFound', 'orderId="' + orderId + '" phone="' + billInfo.phone + '" — ไม่พบ LINE UID ทั้งจากคอลัมน์ที่บันทึกไว้และจากการค้นเบอร์โทร ลูกค้าจะไม่ได้รับข้อความคอนเฟิร์ม กรุณาตรวจสอบ/แจ้งลูกค้าด้วยตนเอง');
    }
    if (buyerUid) {
      notifyBuyerOrderConfirmation_(buyerUid, orderId, billInfo.items, billInfo.paymentLabel, billInfo.subtotal, billInfo.discountTotal, billInfo.shippingCost, billInfo.billTotal, billInfo.freebieItems, billInfo.physicalFreebieItems);

      creditOrderPointsAndReferrals_(orderId, billInfo, buyerUid);

    }
    notifyAdminNewOrder_(orderId, billInfo.customerName, billInfo.phone, billInfo.items, billInfo.paymentLabel, billInfo.billTotal, billInfo.address, billInfo.province, billInfo.freebieItems, billInfo.slipImageUrl, billInfo.physicalFreebieItems, billInfo);
  } catch (notifyErr) {
    Logger.log('finalizeSlipNotifications_: แจ้งเตือน LINE ไม่สำเร็จ: ' + notifyErr.toString());
    logErrorToSheet_('finalizeSlipNotifications_', notifyErr.toString() + ' | stack: ' + (notifyErr.stack || '-'));
  }
}

// ⚡ เพิ่ม — คีย์ออเดอร์มือสำหรับลูกค้าที่สมัครสมาชิกผ่าน LINE ไม่ได้ แต่มี LINE UID ที่ยืนยันแล้วจาก
// แหล่งอื่น (เช่น webhook ของ LINE OA) เขียนลงชีต Revenue ด้วยโครงสร้างคอลัมน์และค่าเดียวกับออเดอร์
// อัตโนมัติของ LINE Shop ทุกประการ (A-AF รวม LINE UID ที่คอลัมน์ AF, Sales Name/Ad/CustomerType เหมือน
// ออเดอร์อัตโนมัติเป๊ะๆ) ตั้งใจไม่ยุ่งกับระบบแต้ม/คูปอง/สิทธิ์สมาชิกใดๆ เพราะลูกค้ากลุ่มนี้ไม่ใช่สมาชิกใน
// ระบบ — แต่ละรายการสินค้ามีธง isFree แยกอิสระต่อรายการ (ไม่ผูกกับ "ซื้อสินค้าตัวเดิม") เพื่อรองรับโปร
// ซื้อครบแถมที่ของแถมเป็นคนละ SKU กับของที่ซื้อได้ (พนักงานเพิ่ม 2 รายการแยกกัน: รายการที่จ่ายเงินปกติ
// กับรายการที่ติ๊กแถมฟรี) และส่วนลดท้ายบิลแยกต่างหาก (กระจายตามสัดส่วนยอดแต่ละรายการ เหมือนที่
// createShopOrder ทำกับส่วนลดจากคูปอง/สิทธิ์) พนักงานยืนยันว่าจ่ายเงินแล้วเองตอนคีย์ (ต่างจากออเดอร์
// อัตโนมัติที่ต้องรอลูกค้าแนบสลิปก่อน) จึงแจ้งเตือนทั้งลูกค้า (notifyBuyerOrderConfirmation_) และกลุ่ม
// แอดมิน (notifyAdminNewOrder_) ทันทีเหมือนช่วงที่ออเดอร์อัตโนมัติเพิ่งแนบสลิปสำเร็จ

// ==================== ⚡ เพิ่ม (3/10/69) — แอดมินแนบสลิปแทนลูกค้า ====================
// ใช้จากแท็บ "คีย์ออเดอร์มือ" ในหน้าจัดการสมาชิก (admin.html): ลูกค้าโอนแล้วแต่ส่งสลิปมาทางแชทแทนการแนบใน
// ระบบ แอดมินเลือกออเดอร์ที่รอแนบสลิป แล้วแนบรูปให้ — ใช้ uploadShopSlip ตัวเดียวกับที่ลูกค้าแนบเอง (บันทึกสลิป
// วันชำระเงิน ตัดคะแนนที่แลกไว้) แล้วส่ง LINE ยืนยันลูกค้า + การ์ดเข้ากลุ่มแอดมิน + ให้แต้มทันที
var PENDING_SLIP_SCAN_ROWS_ = 3000;
function isPendingSlipOrderRow_(row) {
  return !!row[0] && String(row[2]) !== CANCELLED_ORDER_MARK_ && !row[10] && !isCodPaymentLabel_(row[9])
    && String(row[19] || '').indexOf('รอแนบสลิป') !== -1;
}

function listPendingSlipOrders(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var sheet = ensureRevenueSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var firstRow = Math.max(2, lastRow - PENDING_SLIP_SCAN_ROWS_ + 1);
    var data = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, 32).getValues();
    var fmtDate_ = function (v) {
      if (!v) return '';
      try { return Utilities.formatDate(new Date(v), 'GMT+7', 'dd/MM/yyyy HH:mm'); } catch (e) { return String(v); }
    };
    var results = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!isPendingSlipOrderRow_(row)) continue;
      var items = [];
      if (row[2]) items.push({ name: String(row[2]), qty: parseFloat(row[3]) || 0 });
      for (var j = i + 1; j < data.length && !data[j][0]; j++) {
        if (data[j][2]) items.push({ name: String(data[j][2]), qty: parseFloat(data[j][3]) || 0 });
      }
      results.push({
        orderId: String(row[0]),
        orderDate: fmtDate_(row[1]),
        amount: parseFloat(row[8]) || 0,
        paymentLabel: String(row[9] || ''),
        customerName: String(row[13] || ''),
        phone: String(row[14] || ''),
        items: items
      });
    }
    results.reverse(); // ใหม่สุดก่อน
    return { success: true, results: results.slice(0, 200) };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function adminAttachSlip(pin, orderId, base64Data, fileName, mimeType) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  orderId = String(orderId || '').trim();
  if (!orderId) return { success: false, error: 'ไม่พบเลขที่ออเดอร์' };
  if (!base64Data) return { success: false, error: 'กรุณาเลือกรูปสลิป' };
  if (!/^image\//.test(String(mimeType || ''))) return { success: false, error: 'ไฟล์สลิปต้องเป็นรูปภาพ' };
  try {
    var sheet = ensureRevenueSheet_();
    var targetRow = findRevenueRowByOrderId_(sheet, orderId);
    if (targetRow === -1) return { success: false, error: 'ไม่พบเลขที่ออเดอร์ "' + orderId + '" ในระบบ' };
    var row = sheet.getRange(targetRow, 1, 1, 20).getValues()[0];
    if (String(row[2]) === CANCELLED_ORDER_MARK_) return { success: false, error: 'ออเดอร์นี้ถูกยกเลิกไปแล้ว' };
    if (isCodPaymentLabel_(row[9])) return { success: false, error: 'ออเดอร์นี้เป็นเก็บเงินปลายทาง ไม่ต้องแนบสลิป' };
    if (row[10]) return { success: false, error: 'ออเดอร์นี้แนบสลิปไปแล้ว' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }

  var up = uploadShopSlip(orderId, base64Data, String(fileName || (orderId + '-slip.jpg')), mimeType);
  if (!up || !up.success) return up || { success: false, error: 'แนบสลิปไม่สำเร็จ' };
  try {
    var remarkCell = sheet.getRange(up.rowIndex, 20);
    remarkCell.setValue(String(remarkCell.getValue() || '') + ' | แอดมินแนบสลิปแทนลูกค้า ('
      + Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm') + ')');
  } catch (remarkErr) {
    Logger.log('adminAttachSlip: เขียนหมายเหตุไม่สำเร็จ: ' + remarkErr);
  }
  // ส่งแจ้งเตือน/ให้แต้มทันที (ไม่รอ trigger 1-2 นาที) — ถ้าไม่ได้ trigger ที่ uploadShopSlip ตั้งไว้จะส่งให้แทน
  var notified = false;
  try {
    if (typeof orderFinalizeSlipNow_ === 'function') notified = orderFinalizeSlipNow_(orderId);
  } catch (finErr) {
    Logger.log('adminAttachSlip: ส่งแจ้งเตือนทันทีไม่สำเร็จ: ' + finErr);
  }
  return { success: true, orderId: orderId, slipUrl: up.slipUrl, notified: notified };
}

// ==================== ⚡ เพิ่ม (19/9/69) — จัดการออเดอร์เก็บเงินปลายทาง (ฝั่งแอดมิน) ====================
// ใช้จากแท็บ "เก็บเงินปลายทาง" ในหน้าจัดการสมาชิก (admin.html): ดูรายการที่ยังรอเก็บเงิน แล้วกดยืนยันว่า
// "เก็บเงินแล้ว" (เงินเข้าจริง) หรือ "ตีกลับ/ไม่ชำระ" — จังหวะที่กดยืนยันเก็บเงินได้คือจังหวะเดียวกับที่ออเดอร์
// โอนเงินแนบสลิปสำเร็จ: ลูกค้าได้แต้ม ยอดซื้อสะสมขยับ และได้รางวัลแนะนำเพื่อน (ถ้ามี)
var COD_SCAN_ROWS_ = 3000; // ไล่ดูย้อนหลังจากท้ายชีตกี่แถว (ออเดอร์ COD ที่ยังค้างเก็บเงินย่อมอยู่ช่วงท้ายชีตเสมอ)

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

/**
 * ยืนยันว่าเก็บเงินปลายทางของออเดอร์นี้ได้แล้วจริง = รับรู้ "เงินเข้า" ณ วินาทีนี้
 * เขียนคอลัมน์ AG = เก็บเงินแล้ว, AH = เวลาที่กดยืนยัน แล้วทำสิ่งที่ออเดอร์โอนเงินทำตอนแนบสลิปสำเร็จ:
 * ตัดคะแนนที่ลูกค้าเลือกแลกไว้ (ถูกกันไว้ตั้งแต่ตอนสั่งซื้อ), ให้แต้ม/ยอดซื้อสะสม, รางวัลแนะนำเพื่อน
 * กดซ้ำไม่ได้ (เช็คสถานะก่อนเสมอ) จึงไม่มีทางให้แต้มซ้ำ
 * หมายเหตุ: ตั้งใจ "ไม่ส่งข้อความหาลูกค้า" ในจังหวะนี้ตามที่ตกลงกันไว้ — ลูกค้าจ่ายเงินกับพนักงานส่งของ
 * ต่อหน้าอยู่แล้ว จึงไม่ต้องมีข้อความยืนยันซ้ำอีก (ลูกค้ายังเห็นแต้มที่ได้รับในหน้าสมาชิกตามปกติ)
 */
function confirmCodPayment(pin, orderId) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  orderId = String(orderId || '').trim();
  if (!orderId) return { success: false, error: 'ไม่พบเลขที่ออเดอร์' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนทำรายการพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  var sheet = null;
  var targetRow = -1;
  try {
    sheet = ensureRevenueSheet_();
    ensureRevenueCodColumns_(sheet);
    targetRow = findRevenueRowByOrderId_(sheet, orderId);
    if (targetRow === -1) return { success: false, error: 'ไม่พบเลขที่ออเดอร์ "' + orderId + '" ในระบบ' };

    var rowVals = sheet.getRange(targetRow, 1, 1, COD_PAID_DATE_COL_).getValues()[0];
    if (!isCodPaymentLabel_(rowVals[9])) return { success: false, error: 'ออเดอร์นี้ไม่ใช่ออเดอร์เก็บเงินปลายทาง' };
    if (String(rowVals[2]) === CANCELLED_ORDER_MARK_) return { success: false, error: 'ออเดอร์นี้ถูกยกเลิกไปแล้ว' };
    var statusNow = String(rowVals[COD_STATUS_COL_ - 1] || '');
    if (statusNow === COD_STATUS_PAID_) return { success: false, error: 'ออเดอร์นี้ยืนยันรับเงินไปแล้ว' };
    if (statusNow === COD_STATUS_RETURNED_) return { success: false, error: 'ออเดอร์นี้ถูกบันทึกว่าตีกลับไปแล้ว' };

    // ตัดคะแนนที่ลูกค้าเลือกแลกเป็นส่วนลด ณ ตอนที่ได้รับเงินจริง (ตรรกะเดียวกับตอนแนบสลิปสำเร็จ)
    var existingRemark_ = String(rowVals[19] || '');
    var pendingPoints_ = parsePendingPointsReservation_(existingRemark_);
    if (pendingPoints_.points > 0) {
      var pendingPhone_ = String(rowVals[14] || '');
      var pendingBuyerUid_ = String(rowVals[31] || '').trim() || findMemberLineUidByPhone_(pendingPhone_);
      var pendingBuyerFound_ = pendingBuyerUid_ ? getMemberRowByUid_(pendingBuyerUid_, 6) : null;
      if (!pendingBuyerFound_) return { success: false, error: 'ไม่พบข้อมูลสมาชิกสำหรับตัดคะแนนของออเดอร์นี้' };
      var pointsBefore_ = parseInt(pendingBuyerFound_.values[5]) || 0;
      if (pointsBefore_ < pendingPoints_.points) {
        return { success: false, error: 'คะแนนคงเหลือของลูกค้าไม่พอสำหรับออเดอร์นี้ (ต้องใช้ ' + pendingPoints_.points + ' คะแนน, คงเหลือ ' + pointsBefore_ + ' คะแนน)' };
      }
      var pointsAfter_ = pointsBefore_ - pendingPoints_.points;
      invalidatePendingPointsCache_(pendingPhone_);
      ensureMembersSheet_().getRange(pendingBuyerFound_.rowIndex, 6).setValue(pointsAfter_);
      logPointsTransaction_(pendingBuyerUid_, 'redeem', '[' + orderId + '] แลกคะแนนเป็นส่วนลด ' + Math.round(pendingPoints_.discount) + ' บาท', -pendingPoints_.points, pointsAfter_);
      existingRemark_ = existingRemark_.replace(/🎯 คะแนนรอหัก:\s*\d+\s*คะแนน\s*\(-฿[\d.]+\)/, '🎯 หักคะแนนแล้ว: ' + pendingPoints_.points + ' คะแนน (-฿' + Math.round(pendingPoints_.discount) + ')');
    }

    sheet.getRange(targetRow, COD_STATUS_COL_).setValue(COD_STATUS_PAID_);
    var paidCell_ = sheet.getRange(targetRow, COD_PAID_DATE_COL_);
    paidCell_.setNumberFormat('dd/MM/yyyy HH:mm:ss');
    paidCell_.setValue(new Date());
    sheet.getRange(targetRow, 11).setValue('เก็บเงินปลายทางแล้ว (ไม่มีสลิป)');
    var updatedRemark_ = existingRemark_.indexOf(COD_REMARK_PENDING_) !== -1
      ? existingRemark_.replace(COD_REMARK_PENDING_, 'เก็บเงินปลายทางแล้ว - LINE Shop')
      : (existingRemark_ ? (existingRemark_ + ' | เก็บเงินปลายทางแล้ว - LINE Shop') : 'เก็บเงินปลายทางแล้ว - LINE Shop');
    sheet.getRange(targetRow, 20).setValue(updatedRemark_);
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }

  // ให้แต้ม/รางวัลนอก lock (เหมือน finalizeSlipNotifications_) เพื่อไม่ถือ lock ค้างไว้ระหว่างอ่าน/เขียนชีตหลายรอบ
  var buyerUid_ = '';
  var pointsErrText_ = '';
  try {
    var billInfo_ = getBillDataForNotify_(sheet, targetRow);
    buyerUid_ = billInfo_.lineUid || findMemberLineUidByPhone_(billInfo_.phone);
    if (buyerUid_) {
      // ออเดอร์คีย์มือของลูกค้าที่ยังไม่มีแถวในชีต Members ใช้ applyOrderToMember_ ซึ่งสร้างสมาชิกให้ก่อน
      // แล้วค่อยบวกแต้ม (ตามค่าที่ตั้งไว้ในหน้า Admin) ส่วนสมาชิกที่มีอยู่แล้วใช้เส้นทางเดียวกับการแนบสลิป
      if (findMemberRowIndex_(buyerUid_) === -1) {
        applyOrderToMember_(buyerUid_, billInfo_.billTotal, orderId, billInfo_.customerName, billInfo_.phone, billInfo_.address, billInfo_.province, {});
      } else {
        creditOrderPointsAndReferrals_(orderId, billInfo_, buyerUid_);
      }
    } else {
      logErrorToSheet_('confirmCodPayment:buyerUidNotFound', 'orderId="' + orderId + '" — ไม่พบ LINE UID ของลูกค้า จึงยังไม่ได้ให้แต้มสะสม (เงินบันทึกเรียบร้อยแล้ว)');
    }
  } catch (pointsErr2) {
    pointsErrText_ = pointsErr2.toString();
    Logger.log('confirmCodPayment: ให้แต้มไม่สำเร็จ: ' + pointsErrText_);
    logErrorToSheet_('confirmCodPayment:points', 'orderId="' + orderId + '" — ' + pointsErrText_);
  }

  return { success: true, orderId: orderId, pointsCredited: !!buyerUid_ && !pointsErrText_, warning: pointsErrText_ };
}

/**
 * บันทึกว่าออเดอร์เก็บเงินปลายทางนี้ "ตีกลับ/ลูกค้าไม่ชำระ"
 * ตัดยอดออกจากยอดขายด้วยกลไกเดียวกับการยกเลิกออเดอร์ (ชื่อสินค้าเป็น "ยกเลิก" + ล้างยอดเป็น 0) เพื่อให้
 * รายงานทุกตัวเลิกนับออเดอร์นี้ทันที แล้วบล็อกการชำระแบบเก็บเงินปลายทางของลูกค้ารายนี้โดยอัตโนมัติ
 * (แอดมินปลดบล็อกเองได้ภายหลังที่หน้าจัดการสมาชิก)
 */
function markCodReturned(pin, orderId, reason) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  orderId = String(orderId || '').trim();
  if (!orderId) return { success: false, error: 'ไม่พบเลขที่ออเดอร์' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนทำรายการพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  var blockedUid_ = '';
  var customerName_ = '';
  var amount_ = 0;
  try {
    var sheet = ensureRevenueSheet_();
    ensureRevenueCodColumns_(sheet);
    var targetRow = findRevenueRowByOrderId_(sheet, orderId);
    if (targetRow === -1) return { success: false, error: 'ไม่พบเลขที่ออเดอร์ "' + orderId + '" ในระบบ' };

    var rowVals = sheet.getRange(targetRow, 1, 1, COD_PAID_DATE_COL_).getValues()[0];
    if (!isCodPaymentLabel_(rowVals[9])) return { success: false, error: 'ออเดอร์นี้ไม่ใช่ออเดอร์เก็บเงินปลายทาง' };
    var statusNow = String(rowVals[COD_STATUS_COL_ - 1] || '');
    if (statusNow === COD_STATUS_PAID_) return { success: false, error: 'ออเดอร์นี้ยืนยันรับเงินไปแล้ว ถ้าต้องการคืนเงิน/แก้ไข กรุณาแก้ที่ชีตโดยตรง' };
    if (statusNow === COD_STATUS_RETURNED_) return { success: false, error: 'ออเดอร์นี้ถูกบันทึกว่าตีกลับไปแล้ว' };

    customerName_ = String(rowVals[13] || '');
    amount_ = parseFloat(rowVals[8]) || 0;

    // นับจำนวนแถวของออเดอร์นี้ (สินค้าหลายรายการต่อกันหลายแถว โดยแถวถัดไปคอลัมน์ A ว่าง)
    var numRows = 1;
    while (targetRow + numRows <= sheet.getLastRow()) {
      if (sheet.getRange(targetRow + numRows, 1).getValue()) break;
      numRows++;
    }
    for (var r = 0; r < numRows; r++) {
      var rowNum = targetRow + r;
      sheet.getRange(rowNum, 3).setValue(CANCELLED_ORDER_MARK_);
      sheet.getRange(rowNum, 6).setValue(0);
      sheet.getRange(rowNum, 7).setValue(0);
    }
    sheet.getRange(targetRow, 8).setValue(0);
    sheet.getRange(targetRow, 9).setValue(0);
    sheet.getRange(targetRow, 31).setValue(''); // ล้างวันที่ชำระเงินที่ใส่ไว้ตอนสั่ง — ไม่เคยได้รับเงินจริง
    sheet.getRange(targetRow, COD_STATUS_COL_).setValue(COD_STATUS_RETURNED_);
    var reasonClean_ = String(reason || '').trim();
    sheet.getRange(targetRow, 20).setValue('ตีกลับ/ไม่ได้รับชำระเงินปลายทาง (' + Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm') + ')'
      + (reasonClean_ ? ' — ' + reasonClean_ : ''));

    // บล็อกการใช้เก็บเงินปลายทางของลูกค้ารายนี้อัตโนมัติ
    blockedUid_ = String(rowVals[31] || '').trim() || findMemberLineUidByPhone_(String(rowVals[14] || '')) || '';
    if (blockedUid_) {
      setMemberCodBlock_(blockedUid_, true, 'ตีกลับ/ไม่ชำระเงินปลายทาง ออเดอร์ ' + orderId + (reasonClean_ ? ' — ' + reasonClean_ : ''));
    }
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }

  try {
    if (ADMIN_GROUP_ID && ADMIN_GROUP_ID.indexOf('ใส่ Group ID') !== 0) {
      sendLineMessages_(ADMIN_GROUP_ID, [{
        type: 'text',
        text: '↩️ บันทึกตีกลับ/ไม่ชำระเงินปลายทาง\nออเดอร์: #' + orderId + '\nลูกค้า: ' + (customerName_ || '-')
          + '\nยอดที่ต้องเก็บ: ' + fmtOrderBaht_(amount_)
          + '\n\nตัดออกจากยอดขายแล้ว และ' + (blockedUid_ ? 'บล็อกการใช้เก็บเงินปลายทางของลูกค้ารายนี้เรียบร้อย' : 'ไม่พบ LINE UID จึงยังไม่ได้บล็อกลูกค้ารายนี้')
      }]);
    }
  } catch (e) {
    Logger.log('markCodReturned: แจ้งกลุ่มแอดมินไม่สำเร็จ: ' + e.toString());
  }

  return { success: true, orderId: orderId, blocked: !!blockedUid_ };
}

// ==================== ⚡ เพิ่ม — สมาชิกจากออเดอร์ + ยิงโปรตามกลุ่ม ====================
// ที่มา: ออเดอร์ที่คีย์มือ (createManualShopOrder) เดิมไม่แตะชีต Members เลย ลูกค้าที่ซื้อทางนี้จึงไม่ได้แต้ม
// ยอดซื้อสะสมไม่ขยับ ระดับสมาชิกไม่อัปเกรด และถ้ายังไม่เคยสมัครก็ไม่มีแถวในชีต Members เลย ทำให้รายงาน
// ฝั่งสมาชิกกับฝั่งยอดขายไม่ตรงกัน และแบ่งกลุ่ม "ซื้อแล้ว/ยังไม่ซื้อ" เพื่อยิงโปรไม่ได้
//
// ขอบเขตที่ตกลงกันไว้: ชีต Members เก็บเฉพาะคนที่ "มี LINE UID" เท่านั้น
// ออเดอร์ Shopee/TikTok ไม่มี LINE UID จึงไม่ถูกดึงเข้ามา (ส่งไลน์ไม่ได้อยู่แล้ว) ยังอยู่ในชีต Revenue ตามเดิม

// ⚡ เพิ่ม — ค่าเริ่มต้นของวันเกิด เมื่อคีย์ออเดอร์มือแล้วไม่ได้กรอกช่องวันเกิด
// ตั้งเป็นเว้นว่างไว้ตั้งใจ: มาตรฐานสากลที่ใช้กับ "วันเกิดไม่ทราบ" คือ 1 ม.ค. ก็จริง แต่ถ้าใส่ค่านั้นลงไป
// ระบบโปรวันเกิดจะยิงโปรให้ลูกค้ากลุ่มนี้พร้อมกันทั้งหมดทุกวันที่ 1 ม.ค. = จ่ายค่าโปรให้คนที่ไม่ใช่วันเกิดจริง
// ถ้าต้องการให้ลงเป็น 1 ม.ค. จริงๆ เปลี่ยนค่าข้างล่างเป็น '2000-01-01' ได้เลย (รูปแบบ YYYY-MM-DD)
var MANUAL_ORDER_DEFAULT_BIRTHDAY_ = '';

var AUTO_MEMBER_CONFIG_PROP_ = 'AUTO_MEMBER_FROM_ORDER_CONFIG';

// enabled     = คีย์ออเดอร์มือแล้วสร้างสมาชิกให้อัตโนมัติถ้ายังไม่มี
// notify      = ส่งข้อความต้อนรับทางไลน์ให้สมาชิกที่เพิ่งถูกสร้าง (เฉพาะของใหม่ — backfill ไม่ส่งเสมอ)
// grantWelcome= ให้ของขวัญต้อนรับสมาชิกใหม่ (แต้มโบนัส + สิทธิ์ต้อนรับ) เหมือนคนที่สมัครเอง
// เบอร์โทรจากชีต Revenue มาได้หลายแบบ: มีขีดคั่น (081-398-6796), เป็นตัวเลขจน Sheets กินเลข 0 หน้าไป
// (639139333) หรือมี +66 นำหน้า — ทำให้เป็นรูปแบบเดียวกันก่อนเก็บ ไม่งั้นจับคู่กับออเดอร์ไม่เจอและดูไม่เรียบร้อย
function normalizeThaiPhone_(raw) {
  var d = String(raw || '').replace(/[^0-9]/g, '');
  if (!d) return '';
  if (d.length > 10 && d.indexOf('66') === 0) d = '0' + d.substring(2);   // +66xxxxxxxxx
  if (d.length === 9 && d.charAt(0) !== '0') d = '0' + d;                 // Sheets กินเลข 0 หน้าไป
  return d;
}

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

function updateAutoMemberConfig(pin, enabled, notify, grantWelcome) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    PropertiesService.getScriptProperties().setProperty(AUTO_MEMBER_CONFIG_PROP_, JSON.stringify({
      enabled: (enabled === true || enabled === 'true'),
      notify: (notify === true || notify === 'true'),
      grantWelcome: (grantWelcome === true || grantWelcome === 'true')
    }));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// แจกของขวัญต้อนรับสมาชิกใหม่ให้ uid นี้ — ใช้ config ชุดเดียวกับตอนสมัครเองทุกประการ
// คืนรายการสิทธิ์ที่แจกไป เพื่อเอาไปใส่ในข้อความต้อนรับให้ตรงกับของจริง
function grantSignupGiftPrivileges_(lineUid) {
  var granted = [];
  var pendingRows = [];
  try {
    var cfg = getSignupPrivilegeConfig_();
    if (cfg.enabled && cfg.name && cfg.value) {
      var usableFrom = cfg.startDate ? parseDateInputStr_(cfg.startDate) : '';
      var usageEnd = cfg.endDate ? parseDateInputStr_(cfg.endDate) : null;
      var expiry;
      if (usageEnd) { usageEnd.setHours(23, 59, 59, 999); expiry = usageEnd; }
      else {
        expiry = cfg.expiryDate ? parseDateInputStr_(cfg.expiryDate)
          : expiryFromDays_(new Date(), cfg.expiryDays);
      }
      pendingRows.push([lineUid, cfg.name, cfg.type, cfg.value, expiry || '',
        'ของขวัญต้อนรับสมาชิกใหม่ (อัตโนมัติ)', new Date(), true, false, usableFrom || '',
        cfg.restriction || '', cfg.freeProduct || '', cfg.freeQty || '', '', signupDiscountCell_(cfg.type, cfg.freeDiscountPercent)]);
      granted.push({ name: cfg.name, type: cfg.type, value: cfg.value, restriction: cfg.restriction || '',
        freeProduct: cfg.freeProduct || '', freeQty: cfg.freeQty || '', expiry: expiry || '', minPurchase: 0 });
    }
  } catch (e) {
    Logger.log('grantSignupGiftPrivileges_ (แบบเดี่ยว) ไม่สำเร็จ: ' + e.toString());
  }
  try {
    var itemSheet = ensureSignupPrivilegesSheet_();
    var lastRow = itemSheet.getLastRow();
    if (lastRow > 1) {
      var discountCol = signupItemDiscountCol_(itemSheet);
      var discountVals = discountCol ? itemSheet.getRange(2, discountCol, lastRow - 1, 1).getValues() : [];
      itemSheet.getRange(2, 1, lastRow - 1, 12).getValues().forEach(function (row, rowIdx) {
        var active = row[7] === true || String(row[7]).toUpperCase() === 'TRUE';
        if (!active) return;
        var startStr = normalizeDateCell_(row[10]);
        var endStr = normalizeDateCell_(row[11]);
        var usableFrom = startStr ? parseDateInputStr_(startStr) : '';
        var usageEnd = endStr ? parseDateInputStr_(endStr) : null;
        var days = parseInt(row[3]) || 0;
        var expiry;
        if (usageEnd) { usageEnd.setHours(23, 59, 59, 999); expiry = usageEnd; }
        else expiry = expiryFromDays_(new Date(), days);
        pendingRows.push([lineUid, row[0], row[1], row[2], expiry || '',
          'ของขวัญต้อนรับสมาชิกใหม่ (อัตโนมัติ)', new Date(), true, false, usableFrom || '',
          row[4] || '', row[5] || '', row[6] || '', row[9] || '', signupDiscountCell_(row[1], discountVals[rowIdx] ? discountVals[rowIdx][0] : '')]);
        granted.push({ name: row[0], type: row[1], value: row[2], restriction: row[4] || '',
          freeProduct: row[5] || '', freeQty: row[6] || '', expiry: expiry || '', minPurchase: row[9] || 0 });
      });
    }
  } catch (e) {
    Logger.log('grantSignupGiftPrivileges_ (หลายรายการ) ไม่สำเร็จ: ' + e.toString());
  }
  if (pendingRows.length) {
    try {
      var privSheet = ensurePrivilegesSheet_();
      privSheet.getRange(privSheet.getLastRow() + 1, 1, pendingRows.length, 15).setValues(pendingRows);
      // ⚡ เพิ่ม (4/10/69) — ข้อความบนตั๋วอัตโนมัติ (ลด % เฉพาะสินค้า / ชิ้นถัดไปลด %) ให้หน้าร้านเห็นสินค้าที่ร่วมโปร
      var firstWritten_ = privSheet.getLastRow() - pendingRows.length + 1;
      pendingRows.forEach(function (r_, i_) { var t_ = autoPrivilegeTicketText_(r_); if (t_) setPrivilegeDetailText_(privSheet, firstWritten_ + i_, 1, t_); });
    } catch (e) {
      Logger.log('grantSignupGiftPrivileges_ เขียนชีตไม่สำเร็จ: ' + e.toString());
      return [];
    }
  }
  return granted;
}

// หาแถวสมาชิกจาก LINE UID ถ้ายังไม่มีก็สร้างให้
// opts = { silent: true = ไม่ส่งข้อความต้อนรับ (ใช้ตอน backfill ข้อมูลเก่า), grantWelcome: true/false }
// คืน { rowIndex, values, created, memberCode, welcomeMsg }  — welcomeMsg ส่งทีหลังนอก lock
function ensureMemberFromOrder_(lineUid, displayName, phone, address, province, opts) {
  opts = opts || {};
  var uid = String(lineUid || '').trim();
  if (!uid) return null;

  var phoneClean_ = normalizeThaiPhone_(phone);
  var addressClean_ = String(address || '').trim();
  var provinceClean_ = String(province || '').trim();
  var birthdayClean_ = String(opts.birthday || '').trim();

  var found = getMemberRowByUid_(uid, 15);
  if (found) {
    try {
      var sheet0 = ensureMembersSheet_();
      // เติมเบอร์ให้ถ้าของเดิมว่าง จะได้ใช้จับคู่ออเดอร์ช่องทางอื่นได้
      if (!String(found.values[3] || '').trim() && phoneClean_) {
        sheet0.getRange(found.rowIndex, 4).setNumberFormat('@STRING@').setValue(phoneClean_);
        found.values[3] = phoneClean_;
      }
      // ⚡ เพิ่ม — อัปเดตที่อยู่/จังหวัดล่าสุดให้เหมือนออเดอร์ผ่านหน้าร้าน (ดู createShopOrder)
      // เดิมออเดอร์คีย์มือไม่เคยแตะ 2 ช่องนี้เลย ลูกค้าเก่าที่ย้ายที่อยู่จึงค้างเป็นของเดิมตลอด
      if (addressClean_ || provinceClean_) {
        sheet0.getRange(found.rowIndex, 8, 1, 2).setValues([[
          addressClean_ || found.values[7] || '',
          provinceClean_ || found.values[8] || ''
        ]]);
        if (addressClean_) found.values[7] = addressClean_;
        if (provinceClean_) found.values[8] = provinceClean_;
      }
      // ⚡ เพิ่ม — เติมวันเกิดให้ถ้าของเดิมว่าง (ไม่เขียนทับของที่ลูกค้ากรอกเองไว้แล้ว)
      if (birthdayClean_ && !String(found.values[10] || '').trim()) {
        sheet0.getRange(found.rowIndex, 11).setValue(birthdayClean_);
        found.values[10] = birthdayClean_;
      }
    } catch (e) {
      Logger.log('ensureMemberFromOrder_ อัปเดตข้อมูลสมาชิกเดิมไม่สำเร็จ: ' + e.toString());
    }
    return { rowIndex: found.rowIndex, values: found.values, created: false, memberCode: found.values[12] || '', welcomeMsg: null };
  }

  var sheet = ensureMembersSheet_();
  var grantWelcome = opts.grantWelcome !== false;
  var bonus = grantWelcome ? getSignupBonusPoints_() : 0;
  // ยอดซื้อสะสม/แต้มจากประวัติเดิม (ใช้ตอน backfill ข้อมูลเก่า) — ถ้าไม่ได้ส่งมาก็เริ่มที่ 0 เหมือนคนสมัครใหม่
  var seedSpend_ = parseFloat(opts.lifetimeSpend) || 0;
  var seedPoints_ = parseInt(opts.points) || 0;
  var totalPoints_ = bonus + seedPoints_;
  var tier = calcEligibleTier_(seedSpend_, totalPoints_);
  var memberCode = generateMemberCode_(sheet);
  var joinedAt_ = opts.joinedAt instanceof Date ? opts.joinedAt : new Date();
  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 13).setNumberFormat('@STRING@');
  // เบอร์โทรต้องบังคับเป็นข้อความ ไม่งั้น Sheets แปลงเป็นตัวเลขแล้วเลข 0 ตัวหน้าหายไป (0639139333 -> 639139333)
  sheet.getRange(startRow, 4).setNumberFormat('@STRING@');
  var birthdayToSave_ = birthdayClean_ || MANUAL_ORDER_DEFAULT_BIRTHDAY_;
  sheet.getRange(startRow, 1, 1, 15).setValues([[
    uid, String(displayName || '').trim(), '', phoneClean_,
    joinedAt_, totalPoints_, tier.key, addressClean_, provinceClean_,
    String(displayName || '').trim(), birthdayToSave_, seedSpend_, memberCode, '', false
  ]]);
  invalidateMembersIdentityCache_();

  var grantedPrivileges = grantWelcome ? grantSignupGiftPrivileges_(uid) : [];
  var welcomeMsg = null;
  if (!opts.silent) {
    try { welcomeMsg = buildWelcomeFlexMessage_(displayName || '', memberCode, bonus, grantedPrivileges); }
    catch (e) { Logger.log('ensureMemberFromOrder_ สร้างข้อความต้อนรับไม่สำเร็จ: ' + e.toString()); }
  }

  return {
    rowIndex: startRow,
    values: [uid, String(displayName || '').trim(), '', phoneClean_, joinedAt_, totalPoints_, tier.key,
             addressClean_, provinceClean_, String(displayName || '').trim(), birthdayToSave_, seedSpend_, memberCode, '', false],
    created: true, memberCode: memberCode, welcomeMsg: welcomeMsg
  };
}

// บันทึกออเดอร์เข้าโปรไฟล์สมาชิก: สร้างสมาชิกถ้ายังไม่มี แล้วบวกแต้ม/ยอดซื้อสะสม/เลื่อนระดับ
// คืน { created, pointsEarned, welcomeMsg } — ผู้เรียกเป็นคนส่ง welcomeMsg เองหลังปล่อย lock
function applyOrderToMember_(lineUid, finalAmount, orderId, displayName, phone, address, province, opts) {
  opts = opts || {};
  var uid = String(lineUid || '').trim();
  if (!uid) return { created: false, pointsEarned: 0, welcomeMsg: null };

  var cfg = getAutoMemberConfig_();
  var member = getMemberRowByUid_(uid, 15);
  var welcomeMsg = null;
  var created = false;

  // ⚡ เพิ่ม — สมาชิกเดิมก็ต้องได้อัปเดตที่อยู่/จังหวัด/เบอร์/วันเกิดล่าสุดจากออเดอร์นี้ด้วย
  if (member) {
    var refreshed = ensureMemberFromOrder_(uid, displayName, phone, address, province, { birthday: opts.birthday || '' });
    if (refreshed) member = { rowIndex: refreshed.rowIndex, values: refreshed.values };
  }

  if (!member) {
    if (!cfg.enabled && !opts.forceCreate) return { created: false, pointsEarned: 0, welcomeMsg: null };
    var made = ensureMemberFromOrder_(uid, displayName, phone, address, province, {
      silent: opts.silent === true || !cfg.notify,
      grantWelcome: opts.grantWelcome !== undefined ? opts.grantWelcome : cfg.grantWelcome,
      birthday: opts.birthday || ''
    });
    if (!made) return { created: false, pointsEarned: 0, welcomeMsg: null };
    created = true;
    welcomeMsg = made.welcomeMsg;
    member = { rowIndex: made.rowIndex, values: made.values };
  }

  var amount = parseFloat(finalAmount) || 0;
  var pointsEarned = 0;
  if (amount > 0) {
    var row = member.values;
    var tierNow = resolveTierByStoredValue_(row[6], row[11] || 0, uid);
    pointsEarned = Math.floor(Math.floor(amount / BAHT_PER_POINT) * (tierNow.pointMultiplier || 1));
    try {
      addPointsAndCheckRewards_(uid, pointsEarned, amount, member.rowIndex,
        row[5] || 0, row[11] || 0, row[6], orderId || '', opts.promoNote || '');
    } catch (e) {
      Logger.log('applyOrderToMember_ บวกแต้มไม่สำเร็จ: ' + e.toString());
      pointsEarned = 0;
    }
  }
  return { created: created, pointsEarned: pointsEarned, welcomeMsg: welcomeMsg };
}

// ==================== ⚡ เพิ่ม — แบ่งกลุ่มลูกค้า + ยิงโปรตามกลุ่ม ====================
// "ซื้อแล้ว" ตัดสินจากชีต Revenue จริง ไม่ใช้คอลัมน์ยอดซื้อสะสมอย่างเดียว เพราะออเดอร์ที่คีย์มือแต่ก่อน
// ไม่เคยอัปเดตคอลัมน์นั้นเลย และสมาชิกบางคนไปซื้อทาง Shopee/TikTok ด้วย (จับคู่เจอทางเบอร์โทรเท่านั้น)
// จับคู่ 3 ทาง: LINE UID ในออเดอร์ / เบอร์โทรตรงกัน / ยอดซื้อสะสมในชีต Members > 0

var CAMPAIGN_LOG_SHEET_NAME_ = 'Campaign_Log';
var CAMPAIGN_MAX_RECIPIENTS_ = 450; // กันชนกับเพดานเวลาทำงาน 6 นาทีของ Apps Script

function ensureCampaignLogSheet_() {
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = ss.getSheetByName(CAMPAIGN_LOG_SHEET_NAME_);
  if (!sheet) {
    sheet = ss.insertSheet(CAMPAIGN_LOG_SHEET_NAME_);
    sheet.appendRow(['เวลา', 'กลุ่มเป้าหมาย', 'จำนวนเป้าหมาย', 'ส่งสำเร็จ', 'ส่งไม่สำเร็จ',
      'แจกสิทธิ์', 'ชื่อสิทธิ์', 'หัวข้อข้อความ', 'หมายเหตุ', PROMO_STATS_UNIT_HEADER_]);
  } else if (String(sheet.getRange(1, 10).getValue() || '') !== PROMO_STATS_UNIT_HEADER_) {
    sheet.getRange(1, 10).setValue(PROMO_STATS_UNIT_HEADER_);
  }
  return sheet;
}

// ==================== ⚡ เพิ่ม (25/9/69) — เลือกได้ว่าโปรที่สร้างจะให้ส่ง LINE แจ้งลูกค้าหรือไม่ ====================
// การแจ้ง "โปรใหม่" ทาง LINE ทำโดยโปรเจกต์ Notice Line Privilleges (ดูคอลัมน์ "ประกาศโปรใหม่แล้ว" ของแต่ละแถว)
// ติ๊กออก = ใส่ TRUE ในคอลัมน์นั้นตั้งแต่ตอนสร้าง Notice จึงข้ามไป — ไม่ส่งพารามิเตอร์ (หน้าเว็บเก่า) = ส่งเหมือนเดิม
var PROMO_ANNOUNCED_HEADER_ = 'ประกาศโปรใหม่แล้ว(TRUE/FALSE)';

function wantsLineAnnouncement_(notifyLine) {
  return !(notifyLine === false || notifyLine === 'false');
}

var COUPON_CREATED_AT_HEADER_ = 'วันที่สร้าง(ระบบใส่ให้)';

function setCouponCreatedAt_(sheet, rowNumber) {
  var width = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var c = header.indexOf(COUPON_CREATED_AT_HEADER_) + 1;
  if (!c) { c = width + 1; sheet.getRange(1, c).setValue(COUPON_CREATED_AT_HEADER_); }
  sheet.getRange(rowNumber, c).setValue(new Date());
}

// ⚡ เพิ่ม (4/10/69) — แอดมินติ๊ก "ส่ง LINE แจ้งลูกค้าอีกครั้ง" ตอนแก้ไข: ล้างธง "ประกาศโปรใหม่แล้ว" ให้ระบบ Notice
// ส่งรอบถัดไป — คูปองเก่าที่ไม่มีวันที่สร้าง ใส่ให้ (Notice ใช้วันที่นี้ตัดสินว่าประกาศโค้ดที่ต้องพิมพ์เองได้)
function requestLineAnnouncement_(sheet, rowNumber, numRows, isCoupon) {
  var width = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var c = header.indexOf(PROMO_ANNOUNCED_HEADER_) + 1;
  if (c) sheet.getRange(rowNumber, c, numRows, 1).setValue(false);
  if (isCoupon) {
    var cc = header.indexOf(COUPON_CREATED_AT_HEADER_) + 1;
    if (!cc || !(sheet.getRange(rowNumber, cc).getValue() instanceof Date)) setCouponCreatedAt_(sheet, rowNumber);
  }
}

function skipLineAnnouncement_(sheet, firstRow, numRows) {
  if (!numRows) return;
  var width = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var c = header.indexOf(PROMO_ANNOUNCED_HEADER_) + 1;
  if (!c) { c = width + 1; sheet.getRange(1, c).setValue(PROMO_ANNOUNCED_HEADER_); }
  sheet.getRange(firstRow, c, numRows, 1).setValue(true);
}

// ==================== ⚡ เพิ่ม (25/9/69) — รายงานเปิดอ่าน/กดปุ่มของข้อความโปรโมชั่น ====================
// ตอนส่งติดป้าย "หน่วยรายงาน" (customAggregationUnits) ให้ LINE นับยอดแยกต่อการส่งแต่ละครั้ง แล้วดึงยอดด้วย
// Insight API (/v2/bot/insight/message/event/aggregation) — LINE ให้แค่ตัวเลขรวม ไม่บอกว่าใครเปิด
// และถ้าน้อยกว่า 20 คน LINE ไม่เปิดเผยตัวเลข (ได้ null) — ตัวเลขอัปเดตช้ากว่าเวลาส่ง (ไม่ใช่เรียลไทม์)
// แหล่งข้อมูล: Campaign_Log (ยิงโปรตามกลุ่ม) + Notice_Log (โปรเจกต์ Notice Line Privilleges บันทึกเอง)
var PROMO_STATS_UNIT_HEADER_ = 'หน่วยรายงาน LINE';
var NOTICE_LOG_SHEET_NAME_ = 'Notice_Log';

function newPromoStatsUnit_(prefix) {
  return prefix + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMddHHmmss');
}

// ยอดของหน่วยรายงาน 1 หน่วย — { opened, clicked } (null = น้อยกว่า 20 คน LINE ไม่เปิดเผย) หรือ { error }
function getLineUnitStats_(unit, sentAt) {
  var cacheKey = 'line_unit_stats_' + unit;
  try {
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  var result;
  try {
    var dayMs = 24 * 3600 * 1000;
    var from = new Date(sentAt);
    var to = new Date(Math.min(Date.now(), from.getTime() + 29 * dayMs));
    var fmt = function (d) { return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyyMMdd'); }; // LINE ใช้วันที่เวลาญี่ปุ่น (UTC+9)
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/insight/message/event/aggregation?customAggregationUnit=' +
      encodeURIComponent(unit) + '&from=' + fmt(from) + '&to=' + fmt(to), {
      headers: { Authorization: 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN }, muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code !== 200) {
      result = { error: 'LINE ตอบ ' + code + ': ' + res.getContentText().substring(0, 200) };
    } else {
      var body = JSON.parse(res.getContentText() || '{}');
      var ov = body.overview || {};
      result = {
        opened: ov.uniqueImpression === undefined ? null : ov.uniqueImpression,
        clicked: ov.uniqueClick === undefined ? null : ov.uniqueClick
      };
    }
  } catch (e) {
    result = { error: String(e) };
  }
  try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), result.error ? 300 : 1200); } catch (e) {}
  return result;
}

// ==================== ⚡ เพิ่ม (29/9/69) — นับคนกดปุ่มในข้อความโปรแบบรายชื่อ (เป๊ะ ไม่มีขั้นต่ำ 20 คน) ====================
// ปุ่มในข้อความโปร (ยิงโปรตามกลุ่ม + Notice) พาไปหน้าร้านพร้อม ?src=<หน่วยรายงานของข้อความนั้น> หน้าร้านรู้อยู่แล้วว่า
// ลูกค้าเป็นใคร (ล็อกอิน LINE) จึงส่งกลับมาจดใน Promo_Click_Log ได้ว่าใครกดจากข้อความไหน — LINE ไม่บอกว่าใคร "เปิดอ่าน"
// จึงนับแบบรายชื่อได้เฉพาะ "กดปุ่ม"
var PROMO_CLICK_LOG_SHEET_ = 'Promo_Click_Log';
var PROMO_SHOP_LIFF_PREFIX_ = 'https://liff.line.me/2010892131-3XYQXNzq';

// ต่อ ?src= เฉพาะลิงก์หน้าร้านของเราเอง (ลิงก์อื่นที่แอดมินใส่ เช่น Facebook ไม่แตะ)
function withPromoClickSource_(url, unit) {
  url = String(url || '');
  if (!unit || url.indexOf(PROMO_SHOP_LIFF_PREFIX_) !== 0) return url;
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 'src=' + encodeURIComponent(unit);
}

// หน้าร้านเรียกตอนลูกค้าเปิดจากปุ่มในข้อความโปร (ไม่ต้องรอผล) — กดซ้ำจากข้อความเดิมจดครั้งเดียว
function logPromoClick(idToken, src) {
  try {
    var unit = String(src || '').trim();
    if (!/^[A-Za-z]{1,12}\d{14}$/.test(unit)) return { success: false, error: 'รหัสข้อความไม่ถูกต้อง' };
    var profile = verifyLineIdToken_(idToken);
    if (!profile) return { success: false, error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ' };
    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch (e) { return { success: false, error: 'ระบบไม่ว่าง' }; }
    try {
      var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
      var sheet = ss.getSheetByName(PROMO_CLICK_LOG_SHEET_);
      if (!sheet) {
        sheet = ss.insertSheet(PROMO_CLICK_LOG_SHEET_);
        sheet.appendRow(['เวลาที่กด', 'หน่วยรายงาน (ข้อความ)', 'LINE UID', 'ชื่อ']);
      }
      var last = sheet.getLastRow();
      if (last > 1) {
        var seen = sheet.getRange(2, 2, last - 1, 2).getValues().some(function (r) { return String(r[0]) === unit && String(r[1]) === profile.sub; });
        if (seen) return { success: true, duplicate: true };
      }
      var found = getMemberRowByUid_(profile.sub, 10);
      var name = found ? String(found.values[9] || found.values[1] || '') : String(profile.name || '');
      sheet.appendRow([new Date(), unit, profile.sub, name]);
      return { success: true };
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// หน่วยรายงาน -> [{ name, time }] คนที่กดปุ่ม (ไม่ซ้ำคน)
function getPromoClickersByUnit_() {
  var out = {};
  var sheet = SpreadsheetApp.openById(MEMBERS_SHEET_ID).getSheetByName(PROMO_CLICK_LOG_SHEET_);
  if (!sheet || sheet.getLastRow() <= 1) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach(function (r) {
    var unit = String(r[1] || ''), uid = String(r[2] || '');
    if (!unit || !uid) return;
    var list = out[unit] = out[unit] || [];
    if (list.some(function (x) { return x.uid === uid; })) return;
    list.push({ uid: uid, name: String(r[3] || ''), time: r[0] instanceof Date ? Utilities.formatDate(r[0], 'Asia/Bangkok', 'dd/MM HH:mm') : '' });
  });
  return out;
}

// หน้าแอดมิน: รายงานข้อความโปรโมชั่นที่ส่งล่าสุด (ยิงโปรตามกลุ่ม + ประกาศของ Notice)
function listPromoMessageReports(pin) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  try {
    var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
    var fmtTime = function (d) { return Utilities.formatDate(new Date(d), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'); };
    var rows = [];
    var camp = ss.getSheetByName(CAMPAIGN_LOG_SHEET_NAME_);
    if (camp && camp.getLastRow() > 1) {
      camp.getRange(2, 1, camp.getLastRow() - 1, 10).getValues().forEach(function (r) {
        if (!(r[0] instanceof Date) || !(Number(r[3]) > 0)) return; // เฉพาะรอบที่ส่งข้อความจริง
        var grant = String(r[6] || '');
        rows.push({
          at: r[0].getTime(), time: fmtTime(r[0]), source: 'ยิงโปรตามกลุ่ม', group: String(r[1] || ''),
          title: String(r[7] || ''), grant: grant, sent: Number(r[3]) || 0, unit: String(r[9] || ''),
          code: grant.indexOf('โค้ด ') === 0 ? grant.substring(5) : ''
        });
      });
    }
    var notice = ss.getSheetByName(NOTICE_LOG_SHEET_NAME_);
    if (notice && notice.getLastRow() > 1) {
      notice.getRange(2, 1, notice.getLastRow() - 1, 5).getValues().forEach(function (r) {
        if (!(r[0] instanceof Date)) return;
        rows.push({
          at: r[0].getTime(), time: fmtTime(r[0]), source: 'Notice: ' + String(r[1] || ''), group: '',
          title: String(r[2] || ''), grant: '', sent: Number(r[3]) || 0, unit: String(r[4] || ''), code: ''
        });
      });
    }
    rows.sort(function (a, b) { return b.at - a.at; });
    rows = rows.slice(0, 20);
    var audienceInfo = getCouponAudienceInfoByCode_();
    var clickers = getPromoClickersByUnit_();
    rows.forEach(function (row) {
      if (row.unit) {
        row.clickers = (clickers[row.unit] || []).map(function (c) { return { name: c.name, time: c.time }; });
        var st = getLineUnitStats_(row.unit, row.at);
        row.statsError = st.error || '';
        row.opened = st.error ? null : st.opened;
        row.clicked = st.error ? null : st.clicked;
      }
      if (row.code) {
        var info = audienceInfo[String(row.code).trim().toUpperCase()];
        row.codeUsed = info ? info.usedCount : 0;
      }
    });
    return { success: true, results: rows };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// อ่าน Members + Revenue รอบเดียว แล้วแยกกลุ่มให้เสร็จในที่เดียว
// คืน { members: [...], boughtUids: {}, stats: {...} }
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

// การ์ดโปรโมชั่นแบบ Flex — หัวข้อ/รายละเอียด/รูป/ปุ่ม ตั้งได้จากหน้า Admin
// ⚡ แก้ (25/9/69) — โทนเขียวอบอุ่นแทนสีแดง (แดงให้ความรู้สึกเหมือนคำเตือน) + หัวการ์ด (ไม่บังคับ):
//   headerText = ป้ายแดงเม็ดยาในแถบเขียวบนสุด เช่น "พิเศษสำหรับคุณเท่านั้น" (ขึ้นนำหน้าแจ้งเตือน LINE ด้วย)
//   เว้นว่าง = ไม่มีแถบหัว
function buildPromoFlexMessage_(cfg) {
  cfg = cfg || {};
  var title = String(cfg.title || 'โปรโมชั่นพิเศษ').trim();
  var detail = String(cfg.detail || '').trim();
  var privilegeText = String(cfg.privilegeText || '').trim();
  var imageUrl = String(cfg.imageUrl || '').trim();
  var linkUrl = withPromoClickSource_(String(cfg.linkUrl || '').trim(), cfg.trackUnit);
  var linkLabel = String(cfg.linkLabel || 'สั่งซื้อเลย').trim();
  var headerText = String(cfg.headerText || '').trim().substring(0, 60);

  var body = [{ type: 'text', text: title, weight: 'bold', size: 'lg', color: '#1b5e20', wrap: true }];
  if (detail) body.push({ type: 'text', text: detail, size: 'sm', color: '#616161', wrap: true, margin: 'sm' });
  if (privilegeText) {
    body.push({ type: 'separator', margin: 'lg', color: '#e8f5e9' });
    body.push({ type: 'text', text: '🎁 ' + privilegeText, size: 'md', color: '#1b5e20', wrap: true, weight: 'bold', margin: 'lg' });
  }
  // โค้ดส่วนลดเฉพาะผู้รับ (ยิงโปรแบบ "ให้กรอกโค้ด") — กล่องโค้ดตัวใหญ่ แตะกล่อง/ป้ายเล็ก "📋 คัดลอก" เพื่อคัดลอก
  var code = String(cfg.code || '').trim();
  if (code) {
    var copyAction_ = { type: 'clipboard', label: 'คัดลอกโค้ด', clipboardText: code };
    body.push({
      type: 'box', layout: 'vertical', margin: 'lg', cornerRadius: '10px', backgroundColor: '#f1f8e9',
      borderWidth: '1px', borderColor: '#a5d6a7', paddingAll: '12px', spacing: 'xs', action: copyAction_,
      contents: [
        { type: 'text', text: 'โค้ดส่วนลดของคุณ', size: 'xs', color: '#558b2f', align: 'center' },
        { type: 'text', text: code, size: 'xxl', weight: 'bold', color: '#1b5e20', align: 'center', wrap: true },
        { type: 'box', layout: 'horizontal', justifyContent: 'center', margin: 'sm', contents: [{
          type: 'box', layout: 'vertical', flex: 0, cornerRadius: '12px', backgroundColor: '#ffffff',
          borderWidth: '1px', borderColor: '#a5d6a7', paddingTop: '3px', paddingBottom: '3px', paddingStart: '10px', paddingEnd: '10px',
          action: copyAction_,
          contents: [{ type: 'text', text: '📋 คัดลอก', size: 'xxs', color: '#2e7d32', weight: 'bold' }]
        }] },
        { type: 'text', text: 'กรอกโค้ดนี้ตอนชำระเงิน · ใช้ได้ 1 ครั้ง', size: 'xxs', color: '#757575', align: 'center', wrap: true, margin: 'sm' }
      ]
    });
  }

  var bubble = {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', contents: body, paddingAll: '18px' }
  };
  if (headerText) {
    bubble.header = {
      type: 'box', layout: 'vertical', alignItems: 'center', paddingAll: '20px',
      background: { type: 'linearGradient', angle: '135deg', startColor: '#1b5e20', endColor: '#4caf50' },
      contents: [{
        type: 'box', layout: 'vertical', cornerRadius: '30px', backgroundColor: '#b71c1c',
        paddingTop: '10px', paddingBottom: '10px', paddingStart: '24px', paddingEnd: '24px',
        contents: [{ type: 'text', text: headerText, color: '#ffffff', weight: 'bold', size: 'xl', wrap: true, align: 'center' }]
      }]
    };
  }
  if (imageUrl.indexOf('https://') === 0) {
    bubble.hero = { type: 'image', url: imageUrl, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' };
  }
  var foot = [];
  if (linkUrl.indexOf('https://') === 0) {
    foot.push({
      type: 'button', style: 'primary', color: '#2e9e44', height: 'md', margin: foot.length ? 'sm' : 'none',
      action: { type: 'uri', label: linkLabel.substring(0, 20), uri: linkUrl }
    });
  }
  foot.push({ type: 'text', text: 'เอมโอชาคลับ · Em-O-Cha Club', size: 'xxs', color: '#9e9e9e', align: 'center', margin: foot.length ? 'md' : 'none' });
  bubble.footer = { type: 'box', layout: 'vertical', paddingAll: '14px', paddingTop: '0px', contents: foot };
  return { type: 'flex', altText: (headerText ? headerText + ' ' + title : title).substring(0, 400), contents: bubble };
}

// แจกสิทธิ์ให้กลุ่มที่เลือก (ใช้โครงเดียวกับ addPrivilegeToAllMembers แต่ระบุรายชื่อเองได้)
function grantPrivilegeToUids_(uids, cfg) {
  if (!uids.length) return 0;
  var typeValue = VALID_PRIVILEGE_TYPES_.indexOf(cfg.type) !== -1 ? cfg.type : 'percent';
  var startDateVal = cfg.startDate ? parseDateInputStr_(cfg.startDate) : '';
  var endDateVal = cfg.endDate ? parseDateInputStr_(cfg.endDate) : '';
  if (endDateVal) endDateVal.setHours(23, 59, 59, 999);
  var days = parseInt(cfg.expiryDays) || 0;
  var base = startDateVal || new Date();
  var expiryVal = endDateVal || expiryFromDays_(base, days);
  var now = new Date();

  var rows = uids.map(function (uid) {
    return [uid, cfg.name, typeValue, parseFloat(cfg.value) || 0, expiryVal || '',
      'พนักงาน (ยิงโปรตามกลุ่ม - Admin Panel)', now, true, false, startDateVal || '',
      String(cfg.restriction || '').trim(),
      typeValue === 'bogo' ? String(cfg.freeProduct || '').trim() : '',
      couponFreeQtyCell_(typeValue, cfg.freeQty),
      parseFloat(cfg.minPurchase) || '', ''];
  });
  var sheet = ensurePrivilegesSheet_();
  var firstNewRow_ = sheet.getLastRow() + 1;
  sheet.getRange(firstNewRow_, 1, rows.length, 15).setValues(rows);
  // ยิงโปรตามกลุ่มมีช่อง "ส่งข้อความไลน์" ของตัวเองอยู่แล้ว — ไม่ให้ Notice ประกาศซ้ำหรือประกาศเองตอนไม่ได้ติ๊กส่ง
  skipLineAnnouncement_(sheet, firstNewRow_, rows.length);
  setPrivilegeStackable_(sheet, firstNewRow_, rows.length, cfg.stackable);
  return rows.length;
}

// ยิงโปรจริง — แจกสิทธิ์ และ/หรือ ส่งข้อความไลน์ ให้กลุ่มที่เลือก
function runPromoCampaign(pin, group, doGrant, privilegeJson, doSend, messageJson) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  var wantGrant = (doGrant === true || doGrant === 'true');
  var wantSend = (doSend === true || doSend === 'true');
  if (!wantGrant && !wantSend) return { success: false, error: 'กรุณาเลือกอย่างน้อย 1 อย่าง: แจกสิทธิ์ หรือ ส่งข้อความ' };

  var privCfg = {}, msgCfg = {};
  try { privCfg = privilegeJson ? JSON.parse(privilegeJson) : {}; } catch (e) { return { success: false, error: 'ข้อมูลสิทธิ์ไม่ถูกต้อง' }; }
  try { msgCfg = messageJson ? JSON.parse(messageJson) : {}; } catch (e) { return { success: false, error: 'ข้อมูลข้อความไม่ถูกต้อง' }; }

  // ⚡ เพิ่ม (25/9/69) — privCfg.mode === 'code' = แจกเป็น "โค้ดส่วนลดเฉพาะผู้รับ" ให้ลูกค้ากรอกเองตอนสั่งซื้อ
  // (ลดเหมือนคูปอง ใช้ได้เฉพาะคนในกลุ่มนี้ คนละ 1 ครั้ง) แทนสิทธิพิเศษที่ใช้อัตโนมัติ
  var codeMode = wantGrant && privCfg.mode === 'code';
  if (codeMode) {
    privCfg.code = String(privCfg.code || '').trim().toUpperCase();
    if (privCfg.code.length < 2 || privCfg.code.length > 30 || privCfg.code.indexOf(',') !== -1) return { success: false, error: 'โค้ดต้องยาว 2-30 ตัวอักษร และห้ามมีเครื่องหมายจุลภาค (,)' };
    if (couponCodeExists_(privCfg.code)) return { success: false, error: 'มีโค้ด ' + privCfg.code + ' อยู่แล้ว กรุณาใช้โค้ดอื่น' };
  }
  if (wantGrant) {
    if (!codeMode && !String(privCfg.name || '').trim()) return { success: false, error: 'กรุณากรอกชื่อสิทธิ์' };
    if (privCfg.value === '' || privCfg.value === null || privCfg.value === undefined) return { success: false, error: 'กรุณากรอกมูลค่าสิทธิ์' };
    if (privCfg.type === 'bogo' && !String(privCfg.freeProduct || '').trim()) return { success: false, error: 'กรุณาเลือกสินค้าที่จะแถม' };
  }
  if (wantSend && !String(msgCfg.title || '').trim()) return { success: false, error: 'กรุณากรอกหัวข้อข้อความ' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนใช้งานพร้อมกันหลายคน กรุณาลองใหม่' }; }

  var targets, granted = 0;
  try {
    var index = buildAudienceIndex_();
    targets = pickAudience_(index, group || 'all');
    if (!targets.length) return { success: false, error: 'ไม่มีลูกค้าในกลุ่มที่เลือก' };
    if (targets.length > CAMPAIGN_MAX_RECIPIENTS_) {
      return { success: false, error: 'กลุ่มนี้มี ' + targets.length + ' คน เกินที่ส่งได้ต่อรอบ (' + CAMPAIGN_MAX_RECIPIENTS_ + ' คน) กรุณาแบ่งกลุ่มให้เล็กลง' };
    }
    if (codeMode) {
      if (couponCodeExists_(privCfg.code)) return { success: false, error: 'มีโค้ด ' + privCfg.code + ' อยู่แล้ว กรุณาใช้โค้ดอื่น' };
      createAudienceCoupon_(targets.map(function (m) { return m.uid; }), privCfg);
      granted = targets.length;
    } else if (wantGrant) {
      granted = grantPrivilegeToUids_(targets.map(function (m) { return m.uid; }), privCfg);
    }
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }

  // ส่งข้อความหลังปล่อย lock แล้ว — ยิง LINE ทีละคนช้ากว่าการเขียนชีตมาก ไม่ควรถือ lock ค้างไว้
  var sent = 0, failed = 0;
  if (wantSend) {
    if (codeMode) msgCfg.code = privCfg.code;
    var statsUnit = newPromoStatsUnit_('promo');
    msgCfg.trackUnit = statsUnit; // ปุ่มในข้อความพาไปหน้าร้านพร้อมรหัสข้อความ นับคนกดได้เป๊ะ (ดู logPromoClick)
    var messages = [buildPromoFlexMessage_(msgCfg)];
    if (String(msgCfg.extraText || '').trim()) messages.push({ type: 'text', text: String(msgCfg.extraText).trim() });
    targets.forEach(function (m) {
      try {
        var r = sendLineMessages_(m.uid, messages, { unit: statsUnit });
        if (r && r.success === false) failed++; else sent++;
      } catch (e) {
        failed++;
      }
    });
  }

  try {
    ensureCampaignLogSheet_().appendRow([new Date(),
      group === 'bought' ? 'ซื้อแล้ว' : (group === 'notBought' ? 'ยังไม่เคยซื้อ' : 'ทั้งหมด'),
      targets.length, sent, failed, wantGrant ? granted : 0,
      wantGrant ? (codeMode ? 'โค้ด ' + privCfg.code : String(privCfg.name || '')) : '', wantSend ? String(msgCfg.title || '') : '', '',
      wantSend ? statsUnit : '']);
  } catch (e) {
    Logger.log('runPromoCampaign บันทึก log ไม่สำเร็จ: ' + e.toString());
  }

  return { success: true, targetCount: targets.length, granted: granted, sent: sent, failed: failed, code: codeMode ? privCfg.code : '' };
}

// ดึงลูกค้าที่ซื้อแล้วและมี LINE UID แต่ยังไม่มีในชีต Members เข้ามาเป็นสมาชิก — เงียบเสมอ ไม่ส่งไลน์
// (ตกลงกันไว้ว่าข้อมูลเก่าห้ามส่งข้อความรบกวนลูกค้า) dryRun = ดูก่อนว่าจะได้กี่คน ยังไม่เขียนอะไร
function backfillMembersFromRevenue(pin, dryRun) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  var preview = (dryRun === true || dryRun === 'true');
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนใช้งานพร้อมกันหลายคน กรุณาลองใหม่' }; }
  try {
    var memberSheet = ensureMembersSheet_();
    var known = {};
    var lastRow = memberSheet.getLastRow();
    if (lastRow > 1) {
      memberSheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(function (r) {
        var uid = String(r[0] || '').trim();
        if (uid) known[uid] = true;
      });
    }

    var revSheet = ensureRevenueSheet_();
    var revLast = revSheet.getLastRow();
    if (revLast <= 1) return { success: true, created: 0, skippedNoUid: 0, candidates: [] };
    var rev = revSheet.getRange(2, 1, revLast - 1, 32).getValues();

    // รวมประวัติของแต่ละ LINE UID: ยอดซื้อรวม + วันที่ซื้อครั้งแรก + ข้อมูลติดต่อล่าสุด
    var hist = {}, skippedNoUid = 0;
    rev.forEach(function (r) {
      if (!String(r[0] || '').trim()) return;
      var uid = String(r[31] || '').trim();
      if (!uid) { skippedNoUid++; return; }      // Shopee/TikTok — ไม่มี UID ข้ามตามที่ตกลงไว้
      var amount = parseFloat(r[8]) || 0;        // คอลัมน์ I = Bill Total (ยอดรวมทั้งบิล)
      var when = r[1] instanceof Date ? r[1] : null;
      if (!hist[uid]) hist[uid] = { uid: uid, spend: 0, firstOrder: null, name: '', phone: '', address: '', province: '' };
      var h = hist[uid];
      h.spend += amount;
      if (when && (!h.firstOrder || when < h.firstOrder)) h.firstOrder = when;
      // เก็บข้อมูลติดต่อจากออเดอร์ล่าสุดที่มีค่า (แถวล่างสุดคือใหม่สุด)
      if (String(r[13] || '').trim()) h.name = String(r[13]).trim();
      if (String(r[14] || '').trim()) h.phone = String(r[14]).trim();
      if (String(r[24] || '').trim()) h.address = String(r[24]).trim();
      if (String(r[23] || '').trim()) h.province = String(r[23]).trim();
    });

    var all = Object.keys(hist).map(function (k) { return hist[k]; });
    var toCreate = all.filter(function (h) { return !known[h.uid]; });
    var toRepair = all.filter(function (h) { return known[h.uid]; });

    if (preview) {
      return { success: true, preview: true, created: 0, wouldCreate: toCreate.length,
        wouldRepair: toRepair.length, skippedNoUid: skippedNoUid,
        candidates: toCreate.slice(0, 30).map(function (h) {
          return { name: h.name, phone: normalizeThaiPhone_(h.phone), spend: Math.round(h.spend) };
        }) };
    }

    var created = 0;
    toCreate.forEach(function (h) {
      try {
        // silent: true = ไม่ส่งข้อความต้อนรับ / grantWelcome: false = ไม่แจกของขวัญต้อนรับย้อนหลัง
        // แต่ยอดซื้อสะสมกับแต้มต้องลงตามประวัติจริง ไม่งั้นรายงานไม่ตรงและแบ่งกลุ่มผิด
        var made = ensureMemberFromOrder_(h.uid, h.name, h.phone, h.address, h.province, {
          silent: true, grantWelcome: false,
          lifetimeSpend: h.spend,
          points: Math.floor(h.spend / BAHT_PER_POINT),
          joinedAt: h.firstOrder || new Date()
        });
        if (made && made.created) created++;
      } catch (e) {
        Logger.log('backfillMembersFromRevenue สร้างสมาชิกไม่สำเร็จ (' + h.uid + '): ' + e.toString());
      }
    });

    // ซ่อมแถวสมาชิกเดิมที่ข้อมูลขาด: ยอดซื้อสะสมเป็น 0 ทั้งที่มีประวัติซื้อจริง (ออเดอร์คีย์มือรุ่นเก่า
    // ไม่เคยอัปเดตคอลัมน์นี้) และเบอร์โทรที่ผิดรูปแบบ (มีขีด / เลข 0 ตัวหน้าหายเพราะถูกเก็บเป็นตัวเลข)
    var repaired = 0;
    toRepair.forEach(function (h) {
      try {
        var found = getMemberRowByUid_(h.uid, 15);
        if (!found) return;
        var curSpend = parseFloat(found.values[11]) || 0;
        var curPhone = String(found.values[3] || '');
        var wantPhone = normalizeThaiPhone_(h.phone) || normalizeThaiPhone_(curPhone);
        var sheetM = ensureMembersSheet_();
        var touched = false;
        if (curSpend <= 0 && h.spend > 0) {
          var pts = Math.floor(h.spend / BAHT_PER_POINT);
          var curPts = parseInt(found.values[5]) || 0;
          var newTier = calcEligibleTier_(h.spend, curPts + pts);
          sheetM.getRange(found.rowIndex, 6).setValue(curPts + pts);
          sheetM.getRange(found.rowIndex, 12).setValue(h.spend);
          sheetM.getRange(found.rowIndex, 7).setValue(newTier.key);
          touched = true;
        }
        if (wantPhone && wantPhone !== curPhone) {
          sheetM.getRange(found.rowIndex, 4).setNumberFormat('@STRING@').setValue(wantPhone);
          touched = true;
        }
        if (touched) repaired++;
      } catch (e) {
        Logger.log('backfillMembersFromRevenue ซ่อมแถวเดิมไม่สำเร็จ (' + h.uid + '): ' + e.toString());
      }
    });
    if (created || repaired) invalidateMembersIdentityCache_();
    return { success: true, created: created, repaired: repaired, skippedNoUid: skippedNoUid };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function createManualShopOrder(pin, lineUid, customerName, phone, itemsJson, paymentLabel, province, address, shippingCost, extraDiscount, remark, slipBase64, slipFileName, slipMimeType, birthday) {
  if (!checkAdminPin_(pin)) return { success: false, error: 'PIN ไม่ถูกต้อง' };
  var lineUidClean = String(lineUid || '').trim();
  if (!lineUidClean) return { success: false, error: 'กรุณากรอก LINE UID ของลูกค้า' };
  var customerNameClean = String(customerName || '').trim();
  if (!customerNameClean) return { success: false, error: 'กรุณากรอกชื่อลูกค้า' };
  var addressClean = String(address || '').trim();
  if (!addressClean) return { success: false, error: 'กรุณากรอกที่อยู่จัดส่ง' };
  var phoneClean = String(phone || '').trim();
  var provinceClean = String(province || '').trim();

  var items;
  try { items = JSON.parse(itemsJson); } catch (e) { return { success: false, error: 'ข้อมูลสินค้าไม่ถูกต้อง' }; }
  if (!items || !items.length) return { success: false, error: 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ' };

  var slipUrl = '';
  if (slipBase64) {
    try {
      var folder = DriveApp.getFolderById(SLIP_FOLDER_ID_SHOP);
      var decoded = Utilities.base64Decode(slipBase64);
      var blob = Utilities.newBlob(decoded, slipMimeType || 'image/jpeg', slipFileName || 'slip.jpg');
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      slipUrl = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    } catch (uploadErr) {
      return { success: false, error: 'อัปโหลดสลิปไม่สำเร็จ: ' + uploadErr.toString() };
    }
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนคีย์ออเดอร์พร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    var ss = SpreadsheetApp.openById(REVENUE_SHEET_ID_SHOP);
    var sheet = ss.getSheetByName(REVENUE_SHEET_NAME_SHOP);
    // ⚡ เพิ่ม (19/9/69) — ออเดอร์คีย์มือที่เลือกช่องทาง "เก็บเงินปลายทาง" ถือว่ายังไม่ได้รับเงิน จึงตั้งสถานะ
    // AG = รอเก็บเงิน และยังไม่ให้แต้ม/ยอดซื้อสะสม จนกว่าแอดมินจะกดยืนยันว่าเก็บเงินได้แล้ว เหมือนออเดอร์
    // เก็บเงินปลายทางที่ลูกค้าสั่งเองจากหน้าร้านทุกประการ
    var isCodManual_ = isCodPaymentLabel_(paymentLabel);
    var codStatusManual_ = isCodManual_ ? COD_STATUS_PENDING_ : '';
    ensureRevenueCodColumns_(sheet); // แถวคีย์มือก็กว้าง 34 คอลัมน์เท่ากัน ต้องมีคอลัมน์ครบก่อนเขียนเสมอ
    var revenueId = generateShopRevenueId_(sheet);
    var timestamp = new Date();
    var shippingCostVal = parseFloat(shippingCost) || 0;
    var extraDiscountVal = parseFloat(extraDiscount) || 0;

    var rawGrossTotal = 0;
    var bogoDiscountTotal = 0;
    var itemCalc = items.map(function (item) {
      var qty = parseFloat(item.qty) || 0;
      var price = parseFloat(item.price) || 0;
      var isFree = !!item.isFree;
      var lineGross = qty * price;
      var lineBogoDiscount = isFree ? lineGross : 0;
      rawGrossTotal += lineGross;
      bogoDiscountTotal += lineBogoDiscount;
      return { name: item.name, totalQty: qty, price: price, lineGross: lineGross, lineBogoDiscount: lineBogoDiscount, netBeforeExtra: lineGross - lineBogoDiscount };
    });
    var subtotalAfterBogo = rawGrossTotal - bogoDiscountTotal;
    var totalDiscount = bogoDiscountTotal + extraDiscountVal;
    var netProductAmount = rawGrossTotal - totalDiscount;
    var finalAmount = netProductAmount + shippingCostVal;

    var remarkClean = String(remark || '').trim();
    var baseRemark = 'คีย์ออเดอร์มือโดยแอดมิน' + (slipUrl ? ' — แนบสลิปแล้ว' : ' — รับชำระเป็นเงินสด/ไม่มีสลิป');
    // ⚡ เพิ่ม (26/9/69) — รายละเอียดส่วนลดของออเดอร์คีย์มือ เขียนลง Remark รูปแบบเดียวกับออเดอร์หน้าร้าน
    // ("ชื่อ: รายละเอียด (-ยอด)") ให้การ์ดกลุ่มแอดมิน รายงานสรุปยอดขายประจำวัน (Line Bot Report) และคนอ่านชีต
    // เห็นว่ายอดลดมาจากอะไร — เดิม Remark มีแค่ "คีย์ออเดอร์มือโดยแอดมิน" ส่วนลดจึงหายจากทุกรายงาน
    var manualDiscountNotes_ = [];
    itemCalc.forEach(function (calc) {
      if (calc.lineBogoDiscount > 0) manualDiscountNotes_.push('แถมฟรี: ' + calc.name + ' x' + calc.totalQty + ' (-' + Math.round(calc.lineBogoDiscount * 100) / 100 + ')');
    });
    if (extraDiscountVal > 0) manualDiscountNotes_.push('ส่วนลดท้ายบิล: ลดพิเศษจากร้าน (-' + Math.round(extraDiscountVal * 100) / 100 + ')');
    var fullRemark = baseRemark + (manualDiscountNotes_.length ? ' | ' + manualDiscountNotes_.join(', ') : '') + (remarkClean ? ' | ' + remarkClean : '');

    var rows = [];
    itemCalc.forEach(function (calc, idx) {
      var extraShare = subtotalAfterBogo > 0 ? Math.round(extraDiscountVal * (calc.netBeforeExtra / subtotalAfterBogo) * 100) / 100 : 0;
      var totalItemDiscount = calc.lineBogoDiscount + extraShare;
      var amount = calc.lineGross - totalItemDiscount;
      if (idx === 0) {
        rows.push([
          revenueId, timestamp, calc.name, calc.totalQty, calc.price, totalItemDiscount, amount,
          shippingCostVal, finalAmount, paymentLabel || '', slipUrl, '', '',
          customerNameClean, phoneClean, 'LINE Shop (อัตโนมัติ)', 'LINE Shop', '',
          'สมาชิก LINE', fullRemark, '', '', timestamp, provinceClean,
          addressClean, '', '', '', '', '', timestamp, lineUidClean,
          codStatusManual_, '' // ⚡ เพิ่ม (19/9/69) — AG สถานะเก็บเงินปลายทาง / AH วันที่ได้รับเงินปลายทาง
        ]);
      } else {
        rows.push(['', '', calc.name, calc.totalQty, calc.price, totalItemDiscount, amount, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      }
    });

    var startRow = sheet.getLastRow() + 1;
    // ⚡ เพิ่ม — ตั้งฟอร์แมตคอลัมน์ก่อนเขียนค่าเสมอ เหมือนที่ createShopOrder ทำ กัน 2 ปัญหา: (1) เบอร์โทร
    // ขึ้นต้นด้วย 0 โดนตัดเลข 0 หายเพราะ Sheets เข้าใจว่าเป็นตัวเลข ถ้าไม่บังคับ @STRING@ ไว้ก่อน (2) วันที่
    // ไม่ถูกฟอร์แมตเป็นวันที่ให้ถูกต้อง — ที่สำคัญคือคอลัมน์ AE "วันที่ชำระเงิน" (คอลัมน์ 31) ซึ่งแดชบอร์ด
    // สรุปยอดขายใช้เช็คว่าออเดอร์ไหน "ชำระเงินแล้วจริง" ถ้าไม่มีค่านี้แดชบอร์ดจะไม่นับออเดอร์นั้นเข้ายอดขายเลย
    // — ออเดอร์คีย์มือถือว่าชำระเงินแล้วทันทีตอนบันทึก (พนักงานยืนยันเองแล้ว) จึงใส่เวลาปัจจุบันไปตรงๆ เหมือน
    // ตอนที่ recordPaymentDateIfMissing_ ทำงานให้ออเดอร์อัตโนมัติตอนแนบสลิปสำเร็จ
    sheet.getRange(startRow, 15, rows.length, 1).setNumberFormat('@STRING@');
    sheet.getRange(startRow, 2, rows.length, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sheet.getRange(startRow, 23, rows.length, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sheet.getRange(startRow, 31, 1, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sheet.getRange(startRow, 1, rows.length, REVENUE_TOTAL_COLS_).setValues(rows);

    // ⚡ เพิ่ม — บันทึกออเดอร์นี้เข้าโปรไฟล์สมาชิกด้วย (เดิมฟังก์ชันนี้ไม่แตะชีต Members เลย ลูกค้าที่ซื้อ
    // ทางนี้จึงไม่ได้แต้ม ยอดซื้อสะสมไม่ขยับ ระดับสมาชิกไม่อัปเกรด และถ้ายังไม่เคยสมัครก็ไม่มีแถวในระบบ
    // ทำให้รายงานฝั่งสมาชิกไม่ตรงกับยอดขายจริง) ถ้ายังไม่เป็นสมาชิกจะสร้างให้ใหม่ตามค่าที่ตั้งไว้ในหน้า Admin
    var memberApply_ = { created: false, pointsEarned: 0, welcomeMsg: null };
    // ⚡ แก้ (19/9/69) — ออเดอร์เก็บเงินปลายทางข้ามขั้นนี้ไปก่อน (ยังไม่ได้รับเงินจริง) ไปให้แต้ม/ยอดซื้อสะสม
    // ตอนกดยืนยัน "เก็บเงินแล้ว" ที่แท็บเก็บเงินปลายทางแทน — ดู confirmCodPayment
    if (!isCodManual_) {
      try {
        memberApply_ = applyOrderToMember_(lineUidClean, finalAmount, revenueId, customerNameClean, phoneClean, addressClean, provinceClean, { birthday: String(birthday || '').trim() });
      } catch (memberErr) {
        Logger.log('createManualShopOrder: อัปเดตโปรไฟล์สมาชิกไม่สำเร็จ: ' + memberErr.toString());
      }
    }

    var notifyItems = itemCalc.map(function (calc) { return { name: calc.name, qty: calc.totalQty, price: calc.price }; });
    // ส่งข้อความต้อนรับก่อนใบเสร็จ ถ้าออเดอร์นี้ทำให้เขากลายเป็นสมาชิกใหม่
    if (memberApply_.welcomeMsg) {
      try { sendLineMessages_(lineUidClean, [memberApply_.welcomeMsg]); }
      catch (welcomeErr) { Logger.log('createManualShopOrder: ส่งข้อความต้อนรับไม่สำเร็จ: ' + welcomeErr.toString()); }
    }
    var notifyResult = notifyBuyerOrderConfirmation_(lineUidClean, revenueId, notifyItems, paymentLabel || '', rawGrossTotal, totalDiscount, shippingCostVal, finalAmount, [], []);
    // ⚡ แก้ (25/9/69) — การ์ดแจ้งกลุ่มแอดมินของออเดอร์คีย์มือ เดิมส่งรายการส่วนลดว่างเปล่า (ยอดสินค้ากับยอดชำระ
    // ไม่ตรงกันโดยไม่มีบรรทัดอธิบาย) — ใส่รายการแถมฟรีและส่วนลดท้ายบิลให้เห็นว่ายอดลดมาจากอะไร
    notifyAdminNewOrder_(revenueId, customerNameClean, phoneClean, notifyItems, paymentLabel || '', finalAmount, addressClean, provinceClean, [], slipUrl, [],
      { subtotal: rawGrossTotal, shippingCost: shippingCostVal, discountNotes: manualDiscountNotes_ });

    return {
      success: true,
      orderId: revenueId,
      memberCreated: memberApply_.created,
      pointsEarned: memberApply_.pointsEarned,
      notifySuccess: !!(notifyResult && notifyResult.success),
      notifyError: notifyResult && notifyResult.error
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
// ⚡ เพิ่ม — ค้นหา LINE UID จากเบอร์โทรที่เคยคีย์ออเดอร์มือหรือสั่งผ่านหน้าร้านมาก่อน ใช้กรณีพนักงานจำ
// LINE UID ของลูกค้าประจำไม่ได้ — LINE ไม่มีทาง "ค้นหา UID จากเบอร์โทร" ให้โดยตรง (ข้อจำกัดของแพลตฟอร์ม
// เพื่อความเป็นส่วนตัว) ทำได้แค่ย้อนดูจากประวัติที่เราเคยบันทึกไว้เองเท่านั้น
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


