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
//   4. รัน mirrorInstallTriggers() ตั้งรอบคัดลอกทุก 10 นาที + คัดลอกทั้งหมดทุกคืน
//   5. ใน doGet และ doPost ของ Members.gs เพิ่มบรรทัดนี้ต่อจาก logSlowAction_(...):
//        mirrorAfterAction_(action);
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
  if (!mirrorConfig_()) return;
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

  mirrorSyncTabsNow_(keys);

  // ลบเฉพาะเครื่องหมายที่ยังเป็นค่าเดิม ถ้ามีคนจดใหม่ระหว่างส่ง ให้รอบถัดไปส่งอีกครั้ง
  var after = props.getProperties();
  keys.forEach(function (k) {
    if (after[MIRROR_DIRTY_PREFIX_ + k] === marks[k]) props.deleteProperty(MIRROR_DIRTY_PREFIX_ + k);
  });
}

// ส่งแท็บที่ระบุทันที (ใช้ใน trigger เบื้องหลังที่เขียนชีตเสร็จแล้ว เช่น runPendingSlipFinalizations_
// หรือ processRegistrationQueue) — รับ ['members/Members', 'revenue/Revenue', ...]
function mirrorSyncTabsNow_(tabKeys) {
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
  Object.keys(bySource).forEach(function (source) {
    var ss = SpreadsheetApp.openById(MIRROR_SOURCES_[source]());
    bySource[source].forEach(function (tab) {
      var sheet = ss.getSheetByName(tab);
      if (sheet) results.push(mirrorSyncSheet_(cfg, source, ss.getId(), sheet, false));
    });
  });
  return results;
}

// ---------------------------------------------------------------------------
// รอบคัดลอกตามเวลา (เก็บตกสิ่งที่ระบบอื่นเขียน)
// ---------------------------------------------------------------------------

// ทุก 10 นาที: อ่านเฉพาะไฟล์ที่ถูกแก้ไขหลังรอบก่อน และส่งเฉพาะแท็บที่ค่าเปลี่ยน
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
  Logger.log(JSON.stringify(results));
  return results;
}

// ---------------------------------------------------------------------------
// ส่ง 1 แท็บ
// ---------------------------------------------------------------------------

function mirrorSyncSheet_(cfg, source, spreadsheetId, sheet, force) {
  var key = source + '/' + sheet.getName();
  try {
    var readAt = new Date();
    var values = sheet.getDataRange().getValues();
    var headers = values.length ? values[0] : [];
    var rows = values.slice(1);
    var payloadValues = JSON.stringify([headers, rows]);
    var hash = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payloadValues, Utilities.Charset.UTF_8));

    var props = PropertiesService.getScriptProperties();
    var hashKey = MIRROR_HASH_PREFIX_ + key;
    if (!force && props.getProperty(hashKey) === hash) return { key: key, status: 'unchanged' };

    var res = UrlFetchApp.fetch(cfg.url + '/rest/v1/rpc/mirror_replace_tab', {
      method: 'post',
      contentType: 'application/json',
      headers: mirrorAuthHeaders_(cfg.key),
      payload: JSON.stringify({
        p_source: source,
        p_tab: sheet.getName(),
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
    mirrorLogError_('mirrorSyncSheet_ ' + key, e);
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
  ScriptApp.newTrigger(MIRROR_PERIODIC_HANDLER_).timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger(MIRROR_NIGHTLY_HANDLER_).timeBased().inTimezone('Asia/Bangkok').atHour(2).everyDays(1).create();
  Logger.log('ตั้ง trigger คัดลอกไป Supabase แล้ว: ทุก 10 นาที + ทุกคืนตี 2');
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
