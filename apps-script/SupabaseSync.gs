// ==================== คัดลอกชีตไป Supabase (เฟส 0: สำเนาไว้ค้นหา) ====================
//
// วางไฟล์นี้เป็นไฟล์ใหม่ในโปรเจกต์ Apps Script "Members LINE" (ใช้ตัวแปร MEMBERS_SHEET_ID,
// REVENUE_SHEET_ID_SHOP, MASTER_SHEET_ID_SHOP และ logErrorToSheet_ จาก Members.gs)
//
// Google Sheets ยังเป็นตัวหลักเหมือนเดิม ไฟล์นี้แค่อ่านชีตแล้วส่งสำเนาทั้งแท็บไปที่
// public.mirror_replace_tab ใน Supabase (ดู supabase/migrations/*_sheet_mirror.sql)
//
// ตั้งค่าครั้งแรก
//   1. Project Settings > Script Properties เพิ่ม
//        SUPABASE_URL         https://<project-ref>.supabase.co
//        SUPABASE_SECRET_KEY  secret key (sb_secret_...) หรือ service_role key
//   2. รัน mirrorSyncAllForce() หนึ่งครั้งจาก editor (คัดลอกทุกแท็บครั้งแรก + ขออนุญาตสิทธิ์)
//   3. รัน mirrorCheckCounts() ดูผลใน Execution log ว่าจำนวนแถวตรงกับชีต
//   4. รัน mirrorInstallTriggers() ตั้งรอบคัดลอกทุก 5 นาที + คัดลอกทั้งหมดทุกคืน
//   5. ใน doGet และ doPost ของ Members.gs เพิ่มบรรทัดนี้ต่อจาก logSlowAction_(...):
//        if (typeof mirrorAfterAction_ === 'function') mirrorAfterAction_(action);
//   6. ก่อนเปิดให้หน้าเว็บอ่านจาก Supabase รัน mirrorCompareAll() จนขึ้นว่าตรวจครบ (เทียบผลทุกฟังก์ชัน)
//
// ความสดของข้อมูล: ทุกครั้งที่เขียนชีตผ่าน doGet/doPost (และ trigger คิวสมัคร/แนบสลิป) จะตั้งธง "ข้อมูลเปลี่ยน"
// ใน Supabase ทันทีก่อนตอบลูกค้า ระหว่างที่สำเนายังไม่ทัน Supabase จะให้หน้าเว็บถาม Apps Script แทน
// ส่วนการแก้ชีตด้วยมือ/หน้าแอดมิน/ระบบอื่น จะเข้า Supabase ในรอบคัดลอกถัดไป (ไม่เกิน 5 นาที)
//
// ประหยัดโควตา trigger (~90 นาที/วัน ทั้งบัญชี)
//   - รอบ 10 นาทีเช็คเวลาแก้ไขล่าสุดของไฟล์ (Drive) ก่อน ไฟล์ไหนไม่เปลี่ยนไม่อ่านเลย
//   - แท็บที่ค่าไม่เปลี่ยน (hash เท่าเดิม) ไม่ส่งไป Supabase
//   - ส่งทันทีหลังเขียนชีต: แค่จดชื่อแท็บไว้ แล้วให้ trigger ครั้งเดียวมาส่งเบื้องหลัง
//     ลูกค้าจึงไม่ต้องรอ Supabase ตอบ

var MIRROR_SOURCES_ = {
  members: function () { return MEMBERS_SHEET_ID; },
  revenue: function () { return REVENUE_SHEET_ID_SHOP; },
  master:  function () { return MASTER_SHEET_ID_SHOP; }
};

// แท็บที่ไม่คัดลอก (log ภายในที่เปลี่ยนบ่อยและไม่มีใครค้นหา)
var MIRROR_SKIP_TABS_ = {
  'members/Debug_Log': true
};

// action ของ doGet/doPost ที่เขียนชีต -> แท็บที่ต้องส่งต่อ (ส่งเกินได้ แท็บที่ไม่เปลี่ยนถูกข้ามด้วย hash)
var MIRROR_ORDER_TABS_ = [
  'revenue/Revenue', 'members/Members', 'members/Member_Privileges', 'members/Points_Log',
  'members/Coupons', 'members/Purchase_Referral_Log'
];
var MIRROR_SIGNUP_TABS_ = [
  'members/Members', 'members/Registration_Queue', 'members/Member_Privileges',
  'members/Points_Log', 'members/Referral_Log'
];
// Script Properties ที่ฟังก์ชันอ่าน/คำนวณใช้ (คัดลอกเฉพาะรายการนี้เท่านั้น ห้ามใส่ token/PIN/key)
var MIRROR_PROPS_KEY_ = 'props/script';
function mirrorPropKeys_() {
  return ['SIGNUP_BONUS_POINTS', 'SIGNUP_PRIVILEGE_CONFIG', 'POINTS_REDEEM_CONFIG', 'REFERRAL_CONFIG',
          'PURCHASE_REFERRAL_CONFIG', COD_CONFIG_PROP_];
}

var MIRROR_WRITE_ACTIONS_ = {
  registerMember:            MIRROR_SIGNUP_TABS_,
  enqueueMemberRegistration: ['members/Registration_Queue'],
  processRegistrationQueue:  MIRROR_SIGNUP_TABS_,
  updateMemberProfile:       ['members/Members', 'revenue/Revenue'],
  createShopOrder:           MIRROR_ORDER_TABS_,
  cancelShopOrder:           MIRROR_ORDER_TABS_,
  confirmPendingOrderRecalc: MIRROR_ORDER_TABS_,
  uploadShopSlip:            ['revenue/Revenue'],
  redeemReward:              ['members/Members', 'members/Points_Log', 'members/Redemption_Log',
                              'members/Rewards_Catalog', 'members/Member_Privileges'],
  updateTierConfig:          ['members/Tier_Config'],
  updateSignupBonus:         [MIRROR_PROPS_KEY_],
  updateSignupPrivilegeConfig: [MIRROR_PROPS_KEY_],
  updatePointsRedeemConfig:  [MIRROR_PROPS_KEY_],
  runBlockSyncNow:           ['members/Members']
};

var MIRROR_DIRTY_PREFIX_       = 'mirror_dirty:';        // + 'source/tab' -> เวลาที่จด (ms)
var MIRROR_HASH_PREFIX_        = 'mirror_hash:';         // + 'source/tab' -> hash ที่ส่งไปแล้ว
var MIRROR_FILE_UPDATED_PREFIX_ = 'mirror_file_updated:'; // + source     -> เวลาแก้ไขไฟล์ที่เห็นรอบก่อน
var MIRROR_FLUSH_SCHEDULED_PROP_ = 'mirror_flush_scheduled_at';
var MIRROR_FLUSH_HANDLER_      = 'mirrorFlushDirty_';
var MIRROR_PERIODIC_HANDLER_   = 'mirrorSyncChanged';
var MIRROR_NIGHTLY_HANDLER_    = 'mirrorSyncAllForce';

// ---------------------------------------------------------------------------
// ส่งทันทีหลังเขียนชีต
// ---------------------------------------------------------------------------

// เรียกจาก doGet/doPost หลังทำ action เสร็จ ไม่ throw ไม่ว่ากรณีใด (ห้ามทำให้คำตอบถึงลูกค้าพัง)
function mirrorAfterAction_(action) {
  try {
    var tabs = MIRROR_WRITE_ACTIONS_[action];
    if (tabs) mirrorMarkDirty_(tabs);
  } catch (e) {
    Logger.log('mirrorAfterAction_ error: ' + e);
  }
}

// จดแท็บที่ต้องส่ง แล้วตั้ง trigger ครั้งเดียวให้มาส่งเบื้องหลัง (ไม่ตั้งซ้ำถ้ามีรอคิวอยู่แล้ว)
// ใช้ property แยกต่อแท็บ จึงไม่ต้องล็อก และไม่แย่ง ScriptLock กับ createShopOrder
function mirrorMarkDirty_(tabKeys) {
  var cfg = mirrorConfig_();
  if (!cfg) return;
  mirrorMarkDirtyRemote_(cfg, tabKeys);
  var props = PropertiesService.getScriptProperties();
  var now = String(Date.now());
  var batch = {};
  tabKeys.forEach(function (k) { batch[MIRROR_DIRTY_PREFIX_ + k] = now; });
  props.setProperties(batch);

  var scheduledAt = Number(props.getProperty(MIRROR_FLUSH_SCHEDULED_PROP_) || 0);
  if (Date.now() - scheduledAt < 5 * 60 * 1000) return; // มี trigger รออยู่แล้ว
  props.setProperty(MIRROR_FLUSH_SCHEDULED_PROP_, now);
  ScriptApp.newTrigger(MIRROR_FLUSH_HANDLER_).timeBased().after(1000).create();
}

// ตั้งธง "ข้อมูลเปลี่ยน" ใน Supabase ทันที (ก่อนตอบลูกค้า) ให้หน้าเว็บถาม Apps Script จนกว่าสำเนาจะทัน
function mirrorMarkDirtyRemote_(cfg, tabKeys) {
  try {
    UrlFetchApp.fetch(cfg.url + '/rest/v1/rpc/mirror_mark_dirty', {
      method: 'post', contentType: 'application/json', headers: mirrorAuthHeaders_(cfg.key),
      payload: JSON.stringify({ p_tabs: tabKeys }), muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('mirrorMarkDirtyRemote_ error: ' + e);
  }
}

// ใช้ใน trigger เบื้องหลังที่เพิ่งเขียนชีตเสร็จ (คิวสมัครสมาชิก, แจ้งเตือน/ให้คะแนนหลังแนบสลิป):
// ตั้งธงแล้วส่งสำเนาทันทีในรอบเดียวกัน ไม่ throw
function mirrorAfterBackgroundWrite_(tabKeys) {
  try {
    var cfg = mirrorConfig_();
    if (!cfg) return;
    mirrorMarkDirtyRemote_(cfg, tabKeys);
    mirrorSyncTabsNow_(tabKeys, true);
  } catch (e) {
    Logger.log('mirrorAfterBackgroundWrite_ error: ' + e);
  }
}

// trigger ครั้งเดียว: ส่งทุกแท็บที่จดไว้ แล้วลบ trigger ของตัวเอง
function mirrorFlushDirty_() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(MIRROR_FLUSH_SCHEDULED_PROP_);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === MIRROR_FLUSH_HANDLER_) {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });

  var all = props.getProperties();
  var marks = {};
  Object.keys(all).forEach(function (p) {
    if (p.indexOf(MIRROR_DIRTY_PREFIX_) === 0) marks[p.substring(MIRROR_DIRTY_PREFIX_.length)] = all[p];
  });
  var keys = Object.keys(marks);
  if (!keys.length) return;

  mirrorSyncTabsNow_(keys, true);

  // ลบเฉพาะเครื่องหมายที่ยังเป็นค่าเดิม ถ้ามีคนจดใหม่ระหว่างส่ง ให้รอบถัดไปส่งอีกครั้ง
  var after = props.getProperties();
  keys.forEach(function (k) {
    if (after[MIRROR_DIRTY_PREFIX_ + k] === marks[k]) props.deleteProperty(MIRROR_DIRTY_PREFIX_ + k);
  });
}

// ส่งแท็บที่ระบุทันที (ใช้ใน trigger เบื้องหลังที่เขียนชีตเสร็จแล้ว เช่น runPendingSlipFinalizations_
// หรือ processRegistrationQueue) — รับ ['members/Members', 'revenue/Revenue', ...]
// touch = ส่งไปแม้ค่าไม่เปลี่ยน เพื่อให้ Supabase จดเวลาอ่านล่าสุด (หน้าร้านใช้เช็คว่าสำเนาใหม่กว่าการแก้ออเดอร์)
function mirrorSyncTabsNow_(tabKeys, touch) {
  var cfg = mirrorConfig_();
  if (!cfg) return [];
  var bySource = {};
  tabKeys.forEach(function (k) {
    var i = k.indexOf('/');
    var source = k.substring(0, i), tab = k.substring(i + 1);
    if (!MIRROR_SOURCES_[source] || MIRROR_SKIP_TABS_[k]) return;
    (bySource[source] = bySource[source] || []).push(tab);
  });
  var results = [];
  if (tabKeys.indexOf(MIRROR_PROPS_KEY_) !== -1) results.push(mirrorSyncProps_(cfg, false, touch));
  Object.keys(bySource).forEach(function (source) {
    var ss = SpreadsheetApp.openById(MIRROR_SOURCES_[source]());
    bySource[source].forEach(function (tab) {
      var sheet = ss.getSheetByName(tab);
      if (sheet) results.push(mirrorSyncSheet_(cfg, source, ss.getId(), sheet, false, touch));
    });
  });
  return results;
}

// ---------------------------------------------------------------------------
// รอบคัดลอกตามเวลา (เก็บตกสิ่งที่ระบบอื่นเขียน)
// ---------------------------------------------------------------------------

// ทุก 5 นาที: อ่านเฉพาะไฟล์ที่ถูกแก้ไขหลังรอบก่อน และส่งเฉพาะแท็บที่ค่าเปลี่ยน
function mirrorSyncChanged() {
  return mirrorSyncAll_(false);
}

// ทุกคืน / ครั้งแรก: อ่านทุกไฟล์ทุกแท็บ และส่งทุกแท็บแม้ hash เท่าเดิม (ซ่อมสำเนาที่อาจหลุด)
function mirrorSyncAllForce() {
  return mirrorSyncAll_(true);
}

function mirrorSyncAll_(force) {
  var cfg = mirrorConfig_();
  if (!cfg) return [];
  var props = PropertiesService.getScriptProperties();
  var results = [];
  Object.keys(MIRROR_SOURCES_).forEach(function (source) {
    try {
      var fileId = MIRROR_SOURCES_[source]();
      var updated = String(DriveApp.getFileById(fileId).getLastUpdated().getTime());
      var seenKey = MIRROR_FILE_UPDATED_PREFIX_ + source;
      if (!force && props.getProperty(seenKey) === updated) return;

      var ss = SpreadsheetApp.openById(fileId);
      var ok = true;
      ss.getSheets().forEach(function (sheet) {
        if (MIRROR_SKIP_TABS_[source + '/' + sheet.getName()]) return;
        var r = mirrorSyncSheet_(cfg, source, fileId, sheet, force);
        if (r.status === 'error') ok = false;
        results.push(r);
      });
      // จำเวลาแก้ไขไฟล์ก็ต่อเมื่อทุกแท็บส่งสำเร็จ ไม่งั้นรอบหน้าจะลองใหม่
      if (ok) props.setProperty(seenKey, updated);
    } catch (e) {
      mirrorLogError_('mirrorSyncAll_ ' + source, e);
      results.push({ key: source, status: 'error', error: String(e) });
    }
  });
  // Script Properties ไม่มีเวลาแก้ไขไฟล์ให้เช็ค จึงเทียบ hash ทุกรอบ (ถูกมาก)
  results.push(mirrorSyncProps_(cfg, force, false));
  Logger.log(JSON.stringify(results));
  return results;
}

// ---------------------------------------------------------------------------
// ส่ง 1 แท็บ
// ---------------------------------------------------------------------------

function mirrorSyncSheet_(cfg, source, spreadsheetId, sheet, force, touch) {
  var readAt = new Date();
  var values;
  try {
    values = sheet.getDataRange().getValues();
  } catch (e) {
    mirrorLogError_('mirrorSyncSheet_ ' + source + '/' + sheet.getName(), e);
    return { key: source + '/' + sheet.getName(), status: 'error', error: String(e) };
  }
  return mirrorSendValues_(cfg, source, sheet.getName(), spreadsheetId,
    values.length ? values[0] : [], values.slice(1), readAt, force, touch);
}

function mirrorSyncProps_(cfg, force, touch) {
  var readAt = new Date();
  var all = PropertiesService.getScriptProperties().getProperties();
  var rows = mirrorPropKeys_().filter(function (k) { return Object.prototype.hasOwnProperty.call(all, k); })
    .map(function (k) { return [k, all[k]]; });
  var i = MIRROR_PROPS_KEY_.indexOf('/');
  return mirrorSendValues_(cfg, MIRROR_PROPS_KEY_.substring(0, i), MIRROR_PROPS_KEY_.substring(i + 1), null,
    ['key', 'value'], rows, readAt, force, touch);
}

function mirrorSendValues_(cfg, source, tabName, spreadsheetId, headers, rows, readAt, force, touch) {
  var key = source + '/' + tabName;
  try {
    var payloadValues = JSON.stringify([headers, rows]);
    var hash = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payloadValues, Utilities.Charset.UTF_8));

    var props = PropertiesService.getScriptProperties();
    var hashKey = MIRROR_HASH_PREFIX_ + key;
    if (!force && !touch && props.getProperty(hashKey) === hash) return { key: key, status: 'unchanged' };

    var res = UrlFetchApp.fetch(cfg.url + '/rest/v1/rpc/mirror_replace_tab', {
      method: 'post',
      contentType: 'application/json',
      headers: mirrorAuthHeaders_(cfg.key),
      payload: JSON.stringify({
        p_source: source,
        p_tab: tabName,
        p_headers: headers,
        p_rows: rows,
        p_first_row: 2,
        p_spreadsheet_id: spreadsheetId,
        p_hash: force ? null : hash,
        p_read_at: readAt.toISOString()
      }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code !== 200) throw new Error('HTTP ' + code + ': ' + res.getContentText().substring(0, 500));

    var body = JSON.parse(res.getContentText());
    // stale = มีสำเนาที่อ่านทีหลังกว่าอยู่แล้ว ไม่ต้องจำ hash ของรอบนี้
    if (body.status !== 'stale') props.setProperty(hashKey, hash);
    return { key: key, status: body.status, rows: body.rows };
  } catch (e) {
    mirrorLogError_('mirrorSendValues_ ' + key, e);
    return { key: key, status: 'error', error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// ตั้งค่า / ตรวจสอบ
// ---------------------------------------------------------------------------

function mirrorInstallTriggers() {
  var handlers = {};
  handlers[MIRROR_PERIODIC_HANDLER_] = true;
  handlers[MIRROR_NIGHTLY_HANDLER_] = true;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers[t.getHandlerFunction()]) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(MIRROR_PERIODIC_HANDLER_).timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger(MIRROR_NIGHTLY_HANDLER_).timeBased().inTimezone('Asia/Bangkok').atHour(2).everyDays(1).create();
  Logger.log('ตั้ง trigger คัดลอกไป Supabase แล้ว: ทุก 5 นาที + ทุกคืนตี 2');
}

function mirrorRemoveTriggers() {
  var handlers = {};
  handlers[MIRROR_PERIODIC_HANDLER_] = true;
  handlers[MIRROR_NIGHTLY_HANDLER_] = true;
  handlers[MIRROR_FLUSH_HANDLER_] = true;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers[t.getHandlerFunction()]) ScriptApp.deleteTrigger(t);
  });
}

// เทียบจำนวนแถวที่มีข้อมูลในชีตกับสำเนาใน Supabase ทุกแท็บ ผลอยู่ใน Execution log
function mirrorCheckCounts() {
  var cfg = mirrorConfig_();
  if (!cfg) throw new Error('ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SECRET_KEY ใน Script Properties');
  var res = UrlFetchApp.fetch(cfg.url + '/rest/v1/rpc/mirror_status', {
    method: 'post', contentType: 'application/json', payload: '{}',
    headers: mirrorAuthHeaders_(cfg.key), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode() + ': ' + res.getContentText());
  var remote = {};
  JSON.parse(res.getContentText()).forEach(function (r) { remote[r.source + '/' + r.tab] = r.row_count; });

  var lines = [], mismatches = 0;
  Object.keys(MIRROR_SOURCES_).forEach(function (source) {
    SpreadsheetApp.openById(MIRROR_SOURCES_[source]()).getSheets().forEach(function (sheet) {
      var key = source + '/' + sheet.getName();
      if (MIRROR_SKIP_TABS_[key]) return;
      var values = sheet.getDataRange().getValues().slice(1);
      var local = values.filter(function (row) {
        return row.some(function (v) { return v !== '' && v !== null && String(v).trim() !== ''; });
      }).length;
      var inDb = remote.hasOwnProperty(key) ? remote[key] : 'ไม่มี';
      var same = inDb === local;
      if (!same) mismatches++;
      lines.push((same ? 'ตรง   ' : 'ไม่ตรง ') + key + ': ชีต ' + local + ' / Supabase ' + inDb);
    });
  });
  Logger.log(lines.join('\n'));
  Logger.log(mismatches ? ('ไม่ตรง ' + mismatches + ' แท็บ') : 'ตรงกันทุกแท็บ');
  return { mismatches: mismatches, lines: lines };
}

function mirrorConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
  var key = String(props.getProperty('SUPABASE_SECRET_KEY') || '').trim();
  if (!url || !key) return null;
  return { url: url, key: key };
}

// secret key แบบใหม่ (sb_secret_...) ส่งใน apikey อย่างเดียว; service_role key แบบเก่าเป็น JWT ส่งทั้งสองที่
function mirrorAuthHeaders_(key) {
  var h = { apikey: key };
  if (key.indexOf('eyJ') === 0) h.Authorization = 'Bearer ' + key;
  return h;
}

function mirrorLogError_(where, e) {
  Logger.log(where + ': ' + e);
  try { logErrorToSheet_(where, String(e)); } catch (ignored) {}
}

// ---------------------------------------------------------------------------
// ตรวจเทียบก่อนเปิดให้หน้าเว็บอ่านจาก Supabase
// ---------------------------------------------------------------------------
var MIRROR_COMPARE_STATE_PROP_ = 'mirror_compare_state';
var MIRROR_COMPARE_EDGE_PATH_ = '/functions/v1/shop-read';

// เทียบผลทุกฟังก์ชันที่หน้าเว็บจะอ่านจาก Supabase ของสมาชิกทุกคน: ฟังก์ชันเดิมใน Apps Script (อ่านชีตตรง)
// กับ Edge Function shop-read (อ่านสำเนา) รวมตะกร้าทดสอบสำหรับคำนวณส่วนลด ผลอยู่ใน Execution log
// ทำงานได้ราว 4 นาทีต่อครั้ง ถ้ายังไม่ครบให้กด Run ซ้ำ จะทำต่อจากเดิมจนขึ้นว่า "ตรวจครบ"
// ครั้งแรกจะคัดลอกทุกแท็บใหม่ทั้งหมดก่อน (mirrorSyncAllForce) ใช้เวลาเพิ่มราว 1 นาที
// ฟังก์ชันเดิมทำงานตามปกติทุกอย่างระหว่างเทียบ (เช่น ซ่อมคอลัมน์ Tier ถ้าไม่ตรง)
function mirrorCompareAll() {
  var t0 = Date.now();
  var cfg = mirrorConfig_();
  if (!cfg) throw new Error('ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SECRET_KEY ใน Script Properties');
  var props = PropertiesService.getScriptProperties();
  var state = null;
  try { state = JSON.parse(props.getProperty(MIRROR_COMPARE_STATE_PROP_) || 'null'); } catch (e) {}
  if (!state) state = { offset: 0, synced: false, cases: 0, same: 0, fallback: {}, diffs: [] };

  if (!state.synced) {
    mirrorSyncAllForce();
    state.synced = true;
    props.setProperty(MIRROR_COMPARE_STATE_PROP_, JSON.stringify(state));
  }

  var keyRes = UrlFetchApp.fetch(cfg.url + '/rest/v1/rpc/mirror_internal_key', {
    method: 'post', contentType: 'application/json', payload: '{}',
    headers: mirrorAuthHeaders_(cfg.key), muteHttpExceptions: true
  });
  if (keyRes.getResponseCode() !== 200) throw new Error('อ่าน internal key ไม่ได้: ' + keyRes.getContentText());
  var internalKey = JSON.parse(keyRes.getContentText());

  var sheet = ensureMembersSheet_();
  var uids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues()
    .map(function (r) { return String(r[0] || ''); })
    .filter(function (u) { return u; });
  uids.push('U_mirror_compare_not_a_member');

  var variants = [];
  (getShopProducts().categories || []).forEach(function (c) {
    (c.variants || []).forEach(function (v) { variants.push(v); });
  });
  var couponSheet = ensureCouponsSheet_();
  var codes = couponSheet.getLastRow() > 1
    ? couponSheet.getRange(2, 1, couponSheet.getLastRow() - 1, 1).getValues()
        .map(function (r) { return String(r[0] || ''); }).filter(function (c) { return c; })
    : [];

  if (state.offset === 0 && !state.globalsDone) {
    mirrorCompareCases_(cfg, internalKey, null, [
      { action: 'getActiveCoupons', params: {}, local: function () { return getActiveCoupons(); } },
      { action: 'getReferralPublicStatus', params: {}, local: function () { return getReferralPublicStatus(); } },
      { action: 'getTierConfig', params: {}, local: function () {
        return { success: true, tiers: getTierConfig_(), signupBonus: getSignupBonusPoints_(),
          signupPrivilege: getSignupPrivilegeConfig_(), pointsRedeemConfig: getPointsRedeemConfig_() };
      } }
    ], state, 'ทั่วไป');
    state.globalsDone = true;
  }

  while (state.offset < uids.length && Date.now() - t0 < 240000) {
    var i = state.offset;
    var uid = uids[i];
    var cases = [];
    ['checkMemberStatus', 'getShopBootstrap', 'getPrivilegesPanelData', 'getMyPrivileges', 'getPointsHistory',
     'getMyShippingAddress', 'getMyOrderHistory'].forEach(function (action) {
      cases.push({ action: action, params: { idToken: 'x' }, local: function () { return this_[action]('x'); } });
    });
    for (var k = 0; k < 3 && variants.length; k++) {
      var items = [];
      var v1 = variants[(i * 3 + k) % variants.length];
      items.push({ name: v1.skuName, qty: k + 1 });
      if (k === 1 && variants.length > 1) items.push({ name: variants[(i * 3 + k + 7) % variants.length].skuName, qty: 1 });
      var subtotal = 0;
      items.forEach(function (it) {
        var v = variants.filter(function (x) { return x.skuName === it.name; })[0];
        subtotal += (v ? v.price : 0) * it.qty;
      });
      var params = {
        idToken: 'x',
        couponCode: k === 1 && codes.length ? codes[i % codes.length] : (k === 2 ? 'NOT_A_REAL_CODE' : ''),
        subtotal: String(subtotal),
        itemsB64: Utilities.base64Encode(JSON.stringify(items), Utilities.Charset.UTF_8),
        excludePrivilegeName: '',
        pointsToRedeem: k === 2 ? '10' : '0'
      };
      cases.push({ action: 'checkShopDiscounts', params: params, local: (function (p) {
        return function () {
          return checkShopDiscounts(p.idToken, p.couponCode, p.subtotal, decodeItemsB64_(p.itemsB64),
            p.excludePrivilegeName, p.pointsToRedeem);
        };
      })(params) });
    }
    mirrorCompareCases_(cfg, internalKey, uid, cases, state, 'สมาชิก ' + uid.substring(0, 7) + '…');

    // ออเดอร์ที่ยังรอแนบสลิป: เช็คโปรโมชั่นซ้ำ
    var pending = [];
    try {
      var hist = mirrorWithProfile_(uid, function () { return getMyOrderHistory('x'); });
      pending = ((hist && hist.results) || []).filter(function (o) { return !o.hasSlip && !o.cancelled; }).slice(0, 2);
    } catch (e) {}
    if (pending.length) {
      mirrorCompareCases_(cfg, internalKey, uid, pending.map(function (o) {
        return { action: 'checkPendingOrderPromoStillValid', params: { idToken: 'x', orderId: String(o.orderId) },
          local: function () { return checkPendingOrderPromoStillValid('x', String(o.orderId)); } };
      }), state, 'สมาชิก ' + uid.substring(0, 7) + '…');
    }

    state.offset = i + 1;
    props.setProperty(MIRROR_COMPARE_STATE_PROP_, JSON.stringify(state));
  }

  var done = state.offset >= uids.length;
  var lines = ['ตรวจแล้ว ' + state.offset + ' / ' + uids.length + ' คน, ' + state.cases + ' กรณี',
               'ตรงกัน ' + state.same + ' กรณี, ต่างกัน ' + state.diffs.length + ' กรณี'];
  Object.keys(state.fallback).forEach(function (r) {
    lines.push('Supabase ให้ถาม Apps Script แทน (' + r + '): ' + state.fallback[r] + ' กรณี');
  });
  if (state.diffs.length) lines.push('จุดที่ต่าง:\n' + state.diffs.slice(0, 40).join('\n'));
  lines.push(done ? '== ตรวจครบแล้ว ==' : '== ยังไม่ครบ กด Run ซ้ำเพื่อทำต่อ ==');
  Logger.log(lines.join('\n'));
  if (done) props.deleteProperty(MIRROR_COMPARE_STATE_PROP_);
  return state;
}

// เริ่มเทียบใหม่ตั้งแต่ต้น
function mirrorCompareReset() {
  PropertiesService.getScriptProperties().deleteProperty(MIRROR_COMPARE_STATE_PROP_);
}

// ฟังก์ชันใน Members.gs เรียกผ่านชื่อ (ใช้ใน cases ข้างบน)
var this_ = this;

// เรียกฟังก์ชันเดิมโดยสมมติว่าตรวจโทเคน LINE ผ่านแล้วเป็นสมาชิก uid
function mirrorWithProfile_(uid, fn) {
  if (!uid) return fn();
  var original = verifyLineIdToken_;
  verifyLineIdToken_ = function () { return { sub: uid, name: 'ทดสอบเทียบผล', picture: '' }; };
  try { return fn(); } finally { verifyLineIdToken_ = original; }
}

function mirrorCompareCases_(cfg, internalKey, uid, cases, state, label) {
  var requests = cases.map(function (c) {
    var q = { action: c.action };
    Object.keys(c.params).forEach(function (k) { q[k] = c.params[k]; });
    if (uid) { q.asUid = uid; q.asName = 'ทดสอบเทียบผล'; q.asPicture = ''; }
    return {
      url: cfg.url + MIRROR_COMPARE_EDGE_PATH_, method: 'post', contentType: 'text/plain',
      headers: { 'x-internal-key': internalKey },
      payload: Object.keys(q).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&'),
      muteHttpExceptions: true
    };
  });
  var responses = UrlFetchApp.fetchAll(requests);
  cases.forEach(function (c, idx) {
    state.cases++;
    var remote;
    try { remote = JSON.parse(responses[idx].getContentText()); } catch (e) { remote = { parseError: responses[idx].getContentText().substring(0, 200) }; }
    if (remote && remote.needsAppsScript) {
      var reason = String(remote.reason || '') + (remote.detail ? ' ' + JSON.stringify(remote.detail).substring(0, 120) : '');
      state.fallback[reason] = (state.fallback[reason] || 0) + 1;
      return;
    }
    var local;
    try { local = JSON.parse(JSON.stringify(mirrorWithProfile_(uid, c.local))); } catch (e) { local = { localError: String(e) }; }
    var diff = mirrorFirstDiff_(local, remote, c.action);
    if (!diff) { state.same++; return; }
    if (state.diffs.length < 200) state.diffs.push(label + ' ' + diff);
  });
}

function mirrorFirstDiff_(a, b, path) {
  if (a === b) return '';
  var short = function (v) { var s = JSON.stringify(v); return s === undefined ? 'undefined' : (s.length > 60 ? s.substring(0, 60) + '…' : s); };
  var ta = Object.prototype.toString.call(a), tb = Object.prototype.toString.call(b);
  if (ta !== tb) return path + ' ชนิดต่างกัน ชีต ' + short(a) + ' / Supabase ' + short(b);
  if (Array.isArray(a)) {
    if (a.length !== b.length) return path + ' จำนวน ชีต ' + a.length + ' / Supabase ' + b.length;
    for (var i = 0; i < a.length; i++) {
      var d = mirrorFirstDiff_(a[i], b[i], path + '[' + i + ']');
      if (d) return d;
    }
    return '';
  }
  if (ta === '[object Object]') {
    var keys = {};
    Object.keys(a).forEach(function (k) { keys[k] = true; });
    Object.keys(b).forEach(function (k) { keys[k] = true; });
    var list = Object.keys(keys).sort();
    for (var j = 0; j < list.length; j++) {
      var d2 = mirrorFirstDiff_(a[list[j]], b[list[j]], path + '.' + list[j]);
      if (d2) return d2;
    }
    return '';
  }
  return path + ': ชีต ' + short(a) + ' / Supabase ' + short(b);
}
