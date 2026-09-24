// ==================== สั่งซื้อผ่าน Supabase (เฟส 3 ขั้น 4: ย้ายการสั่งซื้อ) ====================
//
// วางไฟล์นี้เป็นไฟล์ใหม่ในโปรเจกต์ Apps Script "Members LINE" ต่อจาก Members.gs, SupabaseSync.gs และ
// SupabaseSignup.gs (ลำดับไฟล์สำคัญ: ไฟล์นี้ต้องอยู่ท้ายสุด) — ไม่ต้องแก้ Members.gs
//
// ลูกค้ากดสั่งซื้อ -> Supabase (Edge Function shop-order) คำนวณยอดด้วย createShopOrder ตัวเดิมบนสำเนาชีตแล้วตอบ
// ลูกค้าทันที -> ปลุก Web App นี้ (doPost action orderWriteNow) -> ไฟล์นี้รัน createShopOrder ตัวเดิมบนชีตจริง
// ด้วยข้อมูลชุดเดียวกัน (ออกเลข REV ตัดสิทธิ์ นับคูปอง แจ้งเตือน เหมือนสั่งซื้อทาง Apps Script ทุกอย่าง) แล้วส่ง
// เลข REV + ผลจริงกลับไปให้หน้าเว็บ
//
// ส่วนที่ 1 ตัวเขียน
//   - เขียนตามลำดับที่ Supabase รับเสมอ (คำสั่งซื้อหลังถูกคำนวณโดยถือว่าคำสั่งซื้อก่อนหน้าลงชีตแล้ว)
//   - เขียนซ้ำไม่ได้: จำผลไว้ใน Script Properties ทันทีหลัง createShopOrder สำเร็จ ถ้ารายงานกลับไม่สำเร็จ รอบถัดไป
//     ใช้ผลที่จำไว้ (ไม่สั่งซื้อซ้ำ) และถ้าหยุดกลางทางก่อนจำผล จะหาออเดอร์ของลูกค้าคนนั้นในชีตก่อนสั่งใหม่
//   - ผลจริงต่างจากที่แสดงไว้ (เช่น แอดมินปิดสิทธิ์ระหว่างนั้น) -> ตั้ง changed หน้าเว็บแสดงยอดใหม่
//   - createShopOrder ไม่สำเร็จ (เช่น คูปองหมดพอดี) -> สถานะ failed หน้าเว็บแจ้งลูกค้าให้สั่งใหม่
//   - รอบสำรองผ่าน trigger คิวสมัคร (processRegistrationQueue ทุก 1 นาที) เก็บงานที่ปลุกไม่สำเร็จ
// ส่วนที่ 2 ตัวเชื่อม (ติดตั้งตอนโหลดไฟล์ ห่อฟังก์ชันเดิมโดยไม่แก้ Members.gs):
//   - doPost: รับ action orderWriteNow
//   - processRegistrationQueue: เรียกรอบสำรองของตัวเขียน
//   - verifyLineIdToken_: ตอนตัวเขียนรัน createShopOrder ใช้โปรไฟล์ที่ Supabase ตรวจโทเคนแล้ว (ไม่เก็บโทเคน)
// ส่วนที่ 3 ชุดทดสอบ orderWriterTest() (รันเองจาก editor ไม่แตะชีตจริง ทำงานบนไฟล์ชีตชั่วคราว)

var ORDER_EDGE_PATH_ = '/functions/v1/shop-order?forceFunctionRegion=ap-northeast-2';
var ORDER_BACKUP_EVERY_SEC_ = 60;
var ORDER_BACKUP_CACHE_KEY_ = 'order_writer_backup';
var ORDER_DONE_PREFIX_ = 'order_done:';              // + id คำสั่งซื้อ -> ผล createShopOrder (JSON)
var ORDER_LOCK_BUSY_TEXT_ = 'ระบบมีคนสั่งซื้อพร้อมกันหลายคน';
var ORDER_MAX_ATTEMPTS_ = 5;
// ช่องที่ลูกค้าเห็น — ถ้าผลจริงต่างจากที่ Supabase คำนวณไว้ในช่องเหล่านี้ = changed
var ORDER_COMPARE_FIELDS_ = ['subtotal', 'discount', 'cashDiscount', 'shippingCost', 'codFee', 'isCod', 'totalAmount',
  'pointsEarned', 'skipSlipUpload', 'freebieItems', 'physicalFreebieItems', 'discountDetail', 'pointsRedeemed',
  'pointsRedeemDiscount'];
// แท็บที่ createShopOrder อ่าน (ชุดทดสอบส่งสำเนาให้สดก่อนเริ่ม)
var ORDER_MIRROR_TABS_ = ['members/Members', 'members/Member_Privileges', 'members/Coupons', 'members/Tier_Config',
  'members/Points_Promos', 'members/Shipping_Config', 'revenue/Revenue', 'master/SKU', 'props/script'];
// ไฟล์ชีตจริง (จำไว้ตอนโหลดไฟล์) — ตัวเขียนของจริงไม่ทำงานถ้ากำลังสลับไปไฟล์ชั่วคราวของชุดทดสอบ
var ORDER_REAL_IDS_ = { members: MEMBERS_SHEET_ID, revenue: REVENUE_SHEET_ID_SHOP, master: MASTER_SHEET_ID_SHOP };
var ORDER_INJECT_ = null;      // { token, profile } ระหว่างตัวเขียนรัน createShopOrder
var ORDER_TEST_MODE_ = false;


// ==========================================================================================
// ส่วนที่ 1: ตัวเขียนคำสั่งซื้อจาก Supabase ลงชีต
// ==========================================================================================

// doPost action orderWriteNow: Supabase ปลุกหลังรับคำสั่งซื้อ
function orderWriteNow_(key) {
  if (!signupKeyValid_(key)) return { success: false, error: 'ไม่อนุญาต' };
  return orderWritePending_({ tests: false });
}

// รอบสำรอง: เก็บงานที่ปลุกไม่สำเร็จ (ถาม Supabase ไม่เกินทุก 1 นาที)
function orderWritePendingBackup_() {
  var cache = CacheService.getScriptCache();
  if (cache.get(ORDER_BACKUP_CACHE_KEY_)) return;
  cache.put(ORDER_BACKUP_CACHE_KEY_, '1', ORDER_BACKUP_EVERY_SEC_);
  try {
    orderWritePending_({ tests: false });
  } catch (e) {
    Logger.log('orderWritePendingBackup_ error: ' + e);
  }
}

function orderIdsAreReal_() {
  return MEMBERS_SHEET_ID === ORDER_REAL_IDS_.members && REVENUE_SHEET_ID_SHOP === ORDER_REAL_IDS_.revenue &&
         MASTER_SHEET_ID_SHOP === ORDER_REAL_IDS_.master;
}

// รับงานจาก Supabase ตามลำดับแล้วรัน createShopOrder ตัวเดิมทีละรายการ
// ตัวเขียนทำงานทีละตัว (UserLock — createShopOrder ใช้ ScriptLock ของมันเองอยู่แล้ว)
// opts.tests = true: รับเฉพาะแถวทดสอบ (ชุดทดสอบใช้กับไฟล์ชีตชั่วคราว) ไม่ตั้งธง/ไม่ส่งสำเนาไป Supabase
function orderWritePending_(opts) {
  opts = opts || {};
  var cfg = mirrorConfig_();
  if (!cfg) return { success: false, error: 'ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SECRET_KEY' };
  if (!opts.tests && (ORDER_TEST_MODE_ || !orderIdsAreReal_())) {
    return { success: false, error: 'กำลังทดสอบอยู่ ไม่เขียนคำสั่งซื้อจริง' };
  }
  var lock = LockService.getUserLock();
  if (!lock.tryLock(25000)) return { success: false, error: 'ตัวเขียนอื่นทำงานอยู่ จะเขียนในรอบถัดไป' };
  var results = [], wrote = false, stop = false;
  try {
    for (var round = 0; round < 3 && !stop; round++) {
      var rows = signupRpc_(cfg, 'order_claim', { p_tests: !!opts.tests, p_limit: 5 }) || [];
      if (!rows.length) break;
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i], r;
        try {
          r = orderWriteOne_(cfg, row, opts);
        } catch (e) {
          r = { ok: false, id: row.id, error: String(e), stop: true };
          orderGiveUpOrRelease_(cfg, row, String(e));
        }
        results.push(r);
        if (r.written) wrote = true;
        // ยังไม่ได้ลงชีต (ระบบไม่ว่าง/ผิดพลาด): หยุด คำสั่งซื้อถัดไปต้องรอให้รายการนี้ลงก่อน
        if (r.stop) { stop = true; break; }
      }
    }
  } finally {
    lock.releaseLock();
  }
  // ส่งสำเนาทันที (ธงข้อมูลเปลี่ยนตั้งไว้แล้วก่อนรายงานผล) — ถ้าไม่สำเร็จ รอบคัดลอก 5 นาทีจะตามเก็บ
  if (wrote && !opts.tests) {
    try { mirrorSyncTabsNow_(MIRROR_ORDER_TABS_, true); } catch (e) { Logger.log('order mirror sync: ' + e); }
  }
  return { success: true, processed: results.length, results: results };
}

// รัน/เก็บผล 1 คำสั่งซื้อ คืน { ok, written, stop, id, orderId, changed, error }
function orderWriteOne_(cfg, row, opts) {
  var props = PropertiesService.getScriptProperties();
  var doneKey = ORDER_DONE_PREFIX_ + row.id;
  var actual = null, note = '';
  var done = props.getProperty(doneKey);
  if (done) {
    actual = JSON.parse(done);
    note = 'สั่งซื้อไว้แล้ว รายงานผลต่อ';
  } else if (row.attempts > 1) {
    actual = orderFindWritten_(row);
    if (actual) note = 'พบออเดอร์ในชีตแล้ว (หยุดกลางทางรอบก่อน) ไม่สั่งซ้ำ';
  }
  if (!actual) {
    var req = row.request || {};
    var token = 'supabase-order:' + row.id;
    ORDER_INJECT_ = { token: token, profile: { sub: row.line_uid, name: req.profileName || '', picture: '' } };
    try {
      // ลำดับ/ค่าเหมือน doGet ของ Members.gs (existingOrderId ว่างเสมอ: แก้ไขออเดอร์ใช้ทางเดิม)
      actual = createShopOrder(token, decodeItemsB64_(req.itemsB64), req.paymentMethod, req.couponCode,
        req.shippingAddress, req.province, req.excludePrivilegeName, '', req.purchaseReferrerCode, req.pointsToRedeem);
    } finally {
      ORDER_INJECT_ = null;
    }
    if (actual && actual.success) props.setProperty(doneKey, JSON.stringify(actual));
  }

  if (!actual || !actual.success) {
    var err = String((actual && actual.error) || 'สั่งซื้อไม่สำเร็จ');
    if (err.indexOf(ORDER_LOCK_BUSY_TEXT_) !== -1) {
      orderGiveUpOrRelease_(cfg, row, err);
      return { ok: false, id: row.id, error: err, stop: true };
    }
    signupRpc_(cfg, 'order_update', { p_id: row.id, p_patch: { status: 'failed', last_error: err, result: actual || null } });
    return { ok: false, id: row.id, error: err };
  }

  var changed = orderChanged_(row.predicted, actual);
  // ตั้งธงข้อมูลเปลี่ยนก่อนรายงาน: คำสั่งซื้อถัดไปจะไม่คำนวณจากสำเนาเก่า (ช่วงนี้ถอยไปทาง Apps Script)
  if (!opts.tests) mirrorMarkDirtyRemote_(cfg, MIRROR_ORDER_TABS_);
  signupRpc_(cfg, 'order_update', { p_id: row.id, p_patch: {
    status: 'written', revenue_id: String(actual.orderId), result: actual, changed: changed } });
  props.deleteProperty(doneKey);
  if (changed) Logger.log('order ' + row.id + ' ' + actual.orderId + ': ยอดจริงต่างจากที่แสดงไว้');
  return { ok: true, written: true, id: row.id, orderId: String(actual.orderId), changed: changed, note: note };
}

// ผิดพลาด/ระบบไม่ว่าง: ปล่อยให้รอบถัดไปลองใหม่ ครบ ORDER_MAX_ATTEMPTS_ ครั้งแล้วเลิก (failed + แจ้งกลุ่มแอดมิน)
function orderGiveUpOrRelease_(cfg, row, err) {
  if ((row.attempts || 0) >= ORDER_MAX_ATTEMPTS_) {
    signupRpc_(cfg, 'order_update', { p_id: row.id, p_patch: { status: 'failed', last_error: err } });
    orderAlertAdmin_('สั่งซื้อผ่าน Supabase ลงชีตไม่สำเร็จ ' + ORDER_MAX_ATTEMPTS_ + ' ครั้ง (LINE ' + row.line_uid +
      ', ยอด ' + ((row.predicted || {}).totalAmount) + ' บาท) — ' + err + ' กรุณาตรวจสอบ');
  } else {
    signupRpc_(cfg, 'order_update', { p_id: row.id, p_patch: { last_error: err, release: true } });
  }
}

// หยุดกลางทางรอบก่อน (createShopOrder อาจเขียนชีตไปแล้วแต่ยังไม่ได้จำผล): หาออเดอร์ของลูกค้าคนนี้ที่สร้างหลังรับ
// คำสั่งซื้อ และรายการสินค้าตรงกัน ถ้าเจอใช้ออเดอร์นั้น (ไม่สั่งซ้ำ)
function orderFindWritten_(row) {
  var sheet = ensureRevenueSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var start = Math.max(2, last - 80 + 1);
  var v = sheet.getRange(start, 1, last - start + 1, 32).getValues();
  var since = new Date(row.created_at).getTime() - 60 * 1000;
  var wanted = [];
  try { wanted = JSON.parse(decodeItemsB64_((row.request || {}).itemsB64) || '[]'); } catch (e) {}
  var wantSig = wanted.map(function (it) { return it.name + '×' + (parseFloat(it.qty) || 0); }).sort().join('|');
  for (var i = v.length - 1; i >= 0; i--) {
    if (!v[i][0] || String(v[i][31]) !== String(row.line_uid)) continue;
    var ts = v[i][1] instanceof Date ? v[i][1].getTime() : 0;
    if (ts < since) continue;
    var items = [];
    for (var j = i; j < v.length && (j === i || !v[j][0]); j++) items.push(v[j][2] + '×' + (parseFloat(v[j][3]) || 0));
    if (items.sort().join('|') !== wantSig) continue;
    var found = JSON.parse(JSON.stringify(row.predicted || {}));
    found.success = true;
    found.orderId = String(v[i][0]);
    found.totalAmount = Number(v[i][8]) || 0;
    found.recovered = true;
    return found;
  }
  return null;
}

function orderChanged_(predicted, actual) {
  predicted = predicted || {};
  for (var i = 0; i < ORDER_COMPARE_FIELDS_.length; i++) {
    var k = ORDER_COMPARE_FIELDS_[i];
    if (JSON.stringify(predicted[k]) !== JSON.stringify(actual[k])) return true;
  }
  return false;
}

function orderAlertAdmin_(text) {
  Logger.log('orderAlertAdmin_: ' + text);
  try { sendLineMessages_(ADMIN_GROUP_ID, [{ type: 'text', text: '⚠️ ' + text }]); } catch (e) {}
  try { logErrorToSheet_('order', text); } catch (e2) {}
}


// ==========================================================================================
// ส่วนที่ 2: ตัวเชื่อม (ห่อฟังก์ชันเดิม ติดตั้งทุกครั้งที่โหลดไฟล์)
// ==========================================================================================
function orderInstallHooks_() {
  var G = globalThis;
  if (G.__orderHooksInstalled) return;
  G.__orderHooksInstalled = true;
  function wrap(name, make) {
    if (typeof G[name] !== 'function') { Logger.log('orderInstallHooks_: ไม่พบ ' + name); return; }
    G[name] = make(G[name]);
  }

  // doPost: Supabase ปลุกตัวเขียน
  wrap('doPost', function (orig) {
    return function (e) {
      var body = null;
      try { body = JSON.parse((e && e.postData && e.postData.contents) || 'null'); } catch (x) {}
      if (body && body.action === 'orderWriteNow') {
        var result;
        try { result = orderWriteNow_(body.key); } catch (err) { result = { success: false, error: String(err) }; }
        return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
      }
      return orig.apply(this, arguments);
    };
  });

  // trigger คิวสมัครทุก 1 นาที: รอบสำรองของตัวเขียน
  wrap('processRegistrationQueue', function (orig) {
    return function () {
      try { orderWritePendingBackup_(); } catch (x) { Logger.log('order backup: ' + x); }
      return orig.apply(this, arguments);
    };
  });

  // ตัวเขียนรัน createShopOrder ด้วยโปรไฟล์ที่ Supabase ตรวจโทเคน LINE แล้ว (เฉพาะโทเคนหลอกของรอบนั้น)
  wrap('verifyLineIdToken_', function (orig) {
    return function (idToken) {
      if (ORDER_INJECT_ && idToken === ORDER_INJECT_.token) return ORDER_INJECT_.profile;
      return orig.apply(this, arguments);
    };
  });
}
orderInstallHooks_();


// ==========================================================================================
// ส่วนที่ 3: ชุดทดสอบ — orderWriterTest()
// ==========================================================================================
// สั่งซื้อทดสอบผ่าน Supabase (แถว is_test ไม่ปนของจริง) แล้วให้ตัวเขียนรัน createShopOrder ตัวจริงบน "ไฟล์ชีต
// ชั่วคราว" (สำเนาของ Members / Revenue / Master Data Sales) เทียบยอดที่ Supabase แสดงกับผลจริงทุกช่อง
// ทดสอบ: สั่งปกติ / สั่งต่อกันหลายรายการ (สิทธิ์ใบเดียว คูปอง แต้มไม่ใช้ซ้ำ) / พร้อมเพย์ / เก็บเงินปลายทาง /
// คูปองที่พิมพ์เอง / แลกคะแนน / กดซ้ำ / หยุดกลางทางแล้วไม่สั่งซ้ำ / ยอดเปลี่ยนเพราะแอดมินแก้ระหว่างรอ /
// คูปองหมดระหว่างรอ (สั่งไม่สำเร็จ) / กรณีที่ Supabase ต้องถอยให้ Apps Script ตัดสิน
// ไม่ส่งข้อความ LINE จริง (จดไว้เฉยๆ) ไฟล์ชั่วคราวถูกย้ายไปถังขยะเมื่อจบ
function orderWriterTest() {
  var cfg = mirrorConfig_();
  if (!cfg) throw new Error('ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SECRET_KEY ใน Script Properties');
  var internalKey = signupInternalKey_(cfg);
  signupRpc_(cfg, 'order_delete_tests', {});
  mirrorSyncTabsNow_(ORDER_MIRROR_TABS_, true);

  var saved = { members: MEMBERS_SHEET_ID, revenue: REVENUE_SHEET_ID_SHOP, master: MASTER_SHEET_ID_SHOP,
                send: sendLineMessages_ };
  var copies = [], sent = [], lines = [], fails = 0;
  function check(label, ok, detail) {
    if (!ok) fails++;
    lines.push((ok ? 'ผ่าน  ' : 'ไม่ผ่าน ') + label + (detail ? ' — ' + detail : ''));
  }
  var stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  var touched = { phones: {}, uids: {} };
  ORDER_TEST_MODE_ = true;
  orderTestClearCaches_(touched);
  try {
    ['members', 'revenue', 'master'].forEach(function (k) {
      var f = DriveApp.getFileById(saved[k]).makeCopy('ทดสอบสั่งซื้อ ' + k + ' (ลบได้) ' + stamp);
      copies.push(f);
    });
    MEMBERS_SHEET_ID = copies[0].getId();
    REVENUE_SHEET_ID_SHOP = copies[1].getId();
    MASTER_SHEET_ID_SHOP = copies[2].getId();
    signupResetSheetCache_();
    sendLineMessages_ = function (to, messages) { sent.push({ to: to, messages: messages }); return true; };

    orderTestRun_(cfg, internalKey, check, touched);
  } catch (e) {
    check('ชุดทดสอบทำงานจบ', false, String(e && e.stack || e));
  } finally {
    MEMBERS_SHEET_ID = saved.members;
    REVENUE_SHEET_ID_SHOP = saved.revenue;
    MASTER_SHEET_ID_SHOP = saved.master;
    sendLineMessages_ = saved.send;
    ORDER_TEST_MODE_ = false;
    signupResetSheetCache_();
    orderTestClearCaches_(touched);
    try { signupRpc_(cfg, 'order_delete_tests', {}); } catch (x) {}
    copies.forEach(function (f) { try { f.setTrashed(true); } catch (x) {} });
  }
  lines.push('(ข้อความ LINE ที่จะส่งถ้าเป็นของจริง: ' + sent.length + ' ข้อความ)');
  lines.push(fails ? '== ไม่ผ่าน ' + fails + ' ข้อ ==' : '== ผ่านทุกข้อ ==');
  Logger.log(lines.join('\n'));
  return { fails: fails, lines: lines };
}

// แคชของ Members.gs ใช้ร่วมกับของจริง: ระหว่างทดสอบค่าที่แคชไว้มาจากไฟล์ชั่วคราว (มีออเดอร์ทดสอบ) ต้องล้างก่อน/หลัง
// ทดสอบทุกครั้ง ลูกค้าจริงจะได้ไม่เห็นข้อมูลทดสอบแม้ชั่วขณะ (แคชแถวสมาชิกตาม LINE UID ไม่ต้องล้าง: ลำดับแถวเท่าเดิม)
function orderTestClearCaches_(touched) {
  var keys = [COUPONS_RAW_CACHE_KEY_, ACTIVE_COUPONS_CACHE_KEY_, POINTS_PROMOS_RAW_CACHE_KEY_, 'shop_products_v2'];
  Object.keys(touched.phones).forEach(function (p) {
    keys.push('revrows_' + p.substring(0, 40));
    keys.push(pendingPointsCacheKey_(p, ''));
  });
  Object.keys(touched.uids).forEach(function (u) { keys.push('privrows_' + u.substring(0, 40)); });
  try { CacheService.getScriptCache().removeAll(keys); } catch (e) { Logger.log('orderTestClearCaches_: ' + e); }
  try { invalidateMembersIdentityCache_(); } catch (e2) {}
}

// เรียก shop-order แบบชุดทดสอบ (x-internal-key + asUid -> แถว is_test)
function orderTestEdge_(cfg, internalKey, q) {
  var res = UrlFetchApp.fetch(cfg.url + ORDER_EDGE_PATH_, {
    method: 'post', contentType: 'text/plain', headers: { 'x-internal-key': internalKey },
    payload: Object.keys(q).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&'),
    muteHttpExceptions: true
  });
  try { return JSON.parse(res.getContentText()); } catch (e) { return { success: false, error: res.getContentText().substring(0, 300) }; }
}

function orderTestB64_(items) {
  return Utilities.base64Encode(JSON.stringify(items), Utilities.Charset.UTF_8);
}

// ข้อมูลสำหรับทดสอบจากไฟล์ชั่วคราว: สินค้า สมาชิก (มีเบอร์) สมาชิกที่มีสิทธิ์ใช้งานได้ สมาชิกที่มีแต้ม คูปองที่พิมพ์เอง
function orderTestData_() {
  var products = getShopProducts();
  var skus = [];
  (products.categories || []).forEach(function (c) {
    (c.variants || []).forEach(function (v) { if (v.price > 0) skus.push(v.skuName); });
  });
  var m = ensureMembersSheet_();
  var mv = m.getRange(2, 1, m.getLastRow() - 1, 12).getValues();
  var members = mv.filter(function (r) { return r[0] && String(r[3] || '').replace(/[^0-9]/g, '').length >= 9; });
  var p = ensurePrivilegesSheet_();
  var pv = p.getLastRow() > 1 ? p.getRange(2, 1, p.getLastRow() - 1, 8).getValues() : [];
  var now = new Date();
  var withPriv = {};
  pv.forEach(function (r, i) {
    var exp = r[4] ? new Date(r[4]) : null;
    if (r[0] && r[7] === true && (!exp || exp > now)) withPriv[String(r[0])] = (withPriv[String(r[0])] || 0) + 1;
  });
  var privMember = members.filter(function (r) { return withPriv[String(r[0])]; })[0] || null;
  var pointsMember = members.slice().sort(function (a, b) { return (Number(b[5]) || 0) - (Number(a[5]) || 0); })[0];
  var c = ensureCouponsSheet_();
  var cv = c.getLastRow() > 1 ? c.getRange(2, 1, c.getLastRow() - 1, 9).getValues() : [];
  var manualCoupon = null;
  cv.forEach(function (r, i) {
    if (manualCoupon || !r[0] || r[7] !== true || r[8] === true) return;
    var exp = r[6] ? new Date(r[6]) : null;
    if (exp && exp < now) return;
    if (r[4] && Number(r[5]) >= Number(r[4])) return;
    manualCoupon = { code: String(r[0]), row: i + 2 };
  });
  return { skus: skus, members: members, privMember: privMember, pointsMember: pointsMember, manualCoupon: manualCoupon };
}

function orderTestRun_(cfg, internalKey, check, touched) {
  var d = orderTestData_();
  if (d.skus.length < 2 || d.members.length < 3) throw new Error('ข้อมูลไม่พอสำหรับทดสอบ');
  var n = 0;
  function key() { n++; return Utilities.getUuid(); }
  function order(member, opt) {
    opt = opt || {};
    touched.uids[String(member[0])] = true;
    var phoneClean = String(member[3] || '').replace(/[^0-9]/g, '');
    if (phoneClean) touched.phones[phoneClean] = true;
    var q = {
      action: 'createShopOrder', asUid: String(member[0]), asName: 'ทดสอบสั่งซื้อ', clientKey: opt.clientKey || key(),
      itemsB64: orderTestB64_(opt.items || [{ name: d.skus[0], qty: 2 }, { name: d.skus[1], qty: 1 }]),
      paymentMethod: opt.payment || 'transfer', couponCode: opt.coupon || '', shippingAddress: 'ที่อยู่ทดสอบ 99/9',
      province: 'กรุงเทพมหานคร', excludePrivilegeName: '', purchaseReferrerCode: '', pointsToRedeem: String(opt.points || 0)
    };
    var r = orderTestEdge_(cfg, internalKey, q);
    r._q = q;
    return r;
  }
  function status(id) { return signupRpc_(cfg, 'order_status', { p_id: id, p_client_key: null }); }
  function write() { return orderWritePending_({ tests: true }); }
  function revRows(orderId) {
    var sh = ensureRevenueSheet_();
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 32).getValues();
    return v.filter(function (r) { return String(r[0]) === String(orderId); });
  }
  function sameFields(st) {
    var diff = [];
    ORDER_COMPARE_FIELDS_.forEach(function (k) {
      if (JSON.stringify(st.predicted[k]) !== JSON.stringify(st.result[k])) {
        diff.push(k + ': แสดง ' + JSON.stringify(st.predicted[k]) + ' จริง ' + JSON.stringify(st.result[k]));
      }
    });
    return diff;
  }
  function expectWritten(label, acc, wantChanged) {
    if (!acc.pending) { check(label, false, 'Supabase ไม่รับ: ' + JSON.stringify(acc).substring(0, 250)); return null; }
    var st = status(acc.requestId);
    var ok = st && st.status === 'written' && !!st.revenue_id;
    var diff = ok ? sameFields(st) : [];
    var rows = ok ? revRows(st.revenue_id) : [];
    var detail = !ok ? ('สถานะ ' + (st && st.status) + ' ' + (st && st.error || ''))
      : (st.revenue_id + ' ยอด ' + st.result.totalAmount + (diff.length ? ' | ต่าง: ' + diff.join('; ') : ''));
    check(label, ok && rows.length === 1 && String(rows[0][31]) === acc._q.asUid &&
      (wantChanged ? st.changed === true && diff.length > 0 : st.changed === false && !diff.length), detail);
    return st;
  }

  // 1) สั่งปกติ
  var m1 = d.members[0], m2 = d.members[1], m3 = d.members[2];
  var a = order(m1);
  write();
  expectWritten('สั่งปกติ (โอนเงิน)', a, false);

  // 2) สั่งต่อกัน 3 รายการก่อนตัวเขียนทำงาน (ลำดับ/คูปอง/เลข REV ต่อเนื่อง) + พร้อมเพย์
  var b1 = order(m2), b2 = order(m2, { payment: 'promptpay' }), b3 = order(m3);
  write();
  var s1 = expectWritten('สั่งต่อกัน 1/3', b1, false);
  var s2 = expectWritten('สั่งต่อกัน 2/3 (พร้อมเพย์)', b2, false);
  var s3 = expectWritten('สั่งต่อกัน 3/3', b3, false);
  if (s1 && s2 && s3) {
    var nums = [s1, s2, s3].map(function (s) { return parseInt(String(s.revenue_id).slice(-4), 10); });
    check('เลข REV เรียงตามลำดับรับ', nums[0] < nums[1] && nums[1] < nums[2], [s1, s2, s3].map(function (s) { return s.revenue_id; }).join(', '));
  }

  // 3) สิทธิ์: สั่ง 2 รายการติดกัน — รายการที่ 2 ต้องไม่ได้สิทธิ์ใบเดิมซ้ำ (Supabase ทำนายตรงกับของจริง)
  if (d.privMember) {
    var p1 = order(d.privMember), p2 = order(d.privMember);
    write();
    expectWritten('ใช้สิทธิ์ (รายการแรก)', p1, false);
    expectWritten('สั่งซ้ำทันที สิทธิ์ใบเดิมไม่ถูกใช้ซ้ำ', p2, false);
  } else {
    check('ใช้สิทธิ์', true, 'ข้าม: ไม่มีสมาชิกที่มีสิทธิ์ใช้งานได้ตอนนี้');
  }

  // 4) แลกคะแนน (สมาชิกที่แต้มมากที่สุด) สั่ง 2 รายการ — แต้มที่กันไว้กับรายการแรกไม่ถูกนับซ้ำ
  var pts = Math.floor((Number(d.pointsMember[5]) || 0) / 2);
  var r1 = order(d.pointsMember, { points: pts }), r2 = order(d.pointsMember, { points: pts });
  write();
  expectWritten('แลกคะแนน ' + pts + ' (รายการแรก)', r1, false);
  expectWritten('แลกคะแนนต่อทันที (แต้มที่กันไว้ไม่ใช้ซ้ำ)', r2, false);

  // 5) คูปองที่พิมพ์เอง
  if (d.manualCoupon) {
    var c1 = order(m1, { coupon: d.manualCoupon.code });
    if (c1.needsAppsScript) check('คูปองพิมพ์เอง ' + d.manualCoupon.code, true, 'Supabase ให้ Apps Script ตัดสิน: ' + c1.detail);
    else { write(); expectWritten('คูปองพิมพ์เอง ' + d.manualCoupon.code, c1, false); }
  } else {
    check('คูปองพิมพ์เอง', true, 'ข้าม: ไม่มีคูปองที่ใช้ได้ตอนนี้');
  }

  // 6) เก็บเงินปลายทาง: ถ้าใช้ได้ต้องตรงกับของจริง ถ้าใช้ไม่ได้ Supabase ต้องให้ Apps Script ตัดสิน
  var cod = order(m1, { payment: 'cod' });
  if (cod.pending) { write(); expectWritten('เก็บเงินปลายทาง', cod, false); }
  else check('เก็บเงินปลายทาง (ใช้ไม่ได้ตอนนี้) -> ให้ Apps Script ตัดสิน', !!cod.needsAppsScript, cod.detail || cod.reason);

  // 7) คูปองที่ไม่มีอยู่จริง / ไม่ใช่สมาชิก -> ให้ Apps Script ตัดสิน (ไม่บันทึก)
  var bad = order(m1, { coupon: 'ไม่มีคูปองนี้-' + n });
  check('คูปองไม่มีจริง -> ให้ Apps Script ตัดสิน', !!bad.needsAppsScript && !bad.pending, bad.detail || bad.reason);
  var stranger = order(['U_order_test_not_member_' + n, '', '', '0000000000']);
  check('ไม่ใช่สมาชิก -> ให้ Apps Script ตัดสิน', !!stranger.needsAppsScript && !stranger.pending, stranger.detail || stranger.reason);

  // 8) กดซ้ำ (clientKey เดิม) = คำสั่งซื้อเดิม ลงชีตครั้งเดียว
  var k = Utilities.getUuid();
  var dup1 = order(m2, { clientKey: k }), dup2 = order(m2, { clientKey: k });
  write();
  check('กดซ้ำได้คำสั่งซื้อเดิม', dup1.requestId && dup1.requestId === dup2.requestId && dup2.duplicate === true);
  expectWritten('กดซ้ำลงชีตครั้งเดียว', dup1, false);

  // 9) หยุดกลางทาง: createShopOrder เขียนชีตแล้วแต่รายงานกลับไม่สำเร็จ -> รอบถัดไปรายงานผลเดิม ไม่สั่งซ้ำ
  var h = order(m3);
  var realRpc = signupRpc_;
  signupRpc_ = function (c, fn, args) {
    if (fn === 'order_update' && args.p_patch && args.p_patch.status === 'written') throw new Error('จำลองเน็ตหลุด');
    return realRpc.apply(this, arguments);
  };
  try { write(); } finally { signupRpc_ = realRpc; }
  var hs = status(h.requestId);
  check('หยุดกลางทาง: ยังไม่รายงาน', hs.status === 'pending_sheet', hs.status);
  write();
  var hw = expectWritten('หยุดกลางทาง: รอบถัดไปรายงานผลเดิม ไม่สั่งซ้ำ', h, false);

  // 10) แอดมินปิดสิทธิ์/คูปองระหว่างรอ -> ยอดจริงเปลี่ยน (changed) หรือสั่งไม่สำเร็จ (failed)
  if (d.privMember) {
    var x = order(d.privMember);
    if (x.pending && (x.discountDetail || []).some(function (t) { return String(t).indexOf('สิทธิ์:') === 0; })) {
      var ps = ensurePrivilegesSheet_();
      var pv = ps.getRange(2, 1, ps.getLastRow() - 1, 8).getValues();
      pv.forEach(function (r, i) { if (String(r[0]) === String(d.privMember[0])) ps.getRange(i + 2, 8).setValue(false); });
      write();
      expectWritten('แอดมินปิดสิทธิ์ระหว่างรอ -> แสดงยอดใหม่', x, true);
    } else {
      write();
      check('แอดมินปิดสิทธิ์ระหว่างรอ', true, 'ข้าม: สิทธิ์ถูกใช้หมดแล้วในข้อก่อนหน้า');
    }
  }
  // คูปองอัตโนมัติถูกปิดระหว่างรอ -> ยอดจริงเปลี่ยน แสดงยอดใหม่
  var z = order(m1);
  var autoCode = z.pending ? (z.discountDetail || []).map(function (t) {
    var mm = /^คูปอง:\s*(.+?)\s*\(-/.exec(String(t)); return mm ? mm[1] : '';
  }).filter(String)[0] : '';
  if (autoCode) {
    var cs = ensureCouponsSheet_();
    var cv = cs.getRange(2, 1, cs.getLastRow() - 1, 1).getValues();
    cv.forEach(function (r, i) { if (String(r[0]) === autoCode) cs.getRange(i + 2, 8).setValue(false); });
    // แอดมินปิดคูปองผ่านหน้าแอดมินจะล้างแคชคูปองเอง (updateCoupon ฯลฯ) — ทำเหมือนกัน
    CacheService.getScriptCache().removeAll([COUPONS_RAW_CACHE_KEY_, ACTIVE_COUPONS_CACHE_KEY_]);
    write();
    expectWritten('คูปอง "' + autoCode + '" ถูกปิดระหว่างรอ -> แสดงยอดใหม่', z, true);
  } else {
    write();
    check('คูปองถูกปิดระหว่างรอ', true, 'ข้าม: ไม่มีคูปองอัตโนมัติในออเดอร์ทดสอบ');
  }
  // ข้อมูลสมาชิกเปลี่ยนระหว่างรอ (ไม่มีเบอร์แล้ว) -> createShopOrder ไม่สำเร็จ แจ้งลูกค้า ไม่ลงชีต
  var w = order(m3);
  if (w.pending) {
    var ms = ensureMembersSheet_();
    var mv = ms.getRange(2, 1, ms.getLastRow() - 1, 4).getValues();
    mv.forEach(function (r, i) { if (String(r[0]) === String(m3[0])) ms.getRange(i + 2, 4).setValue(''); });
    write();
    var ws = status(w.requestId);
    check('ข้อมูลสมาชิกเปลี่ยนระหว่างรอ -> สั่งไม่สำเร็จ แจ้งลูกค้า', ws.status === 'failed' && !!ws.error, ws.status + ' ' + ws.error);
  }
  if (d.manualCoupon) {
    var y = order(m2, { coupon: d.manualCoupon.code });
    if (y.pending) {
      ensureCouponsSheet_().getRange(d.manualCoupon.row, 8).setValue(false);
      CacheService.getScriptCache().removeAll([COUPONS_RAW_CACHE_KEY_, ACTIVE_COUPONS_CACHE_KEY_]);
      write();
      var ys = status(y.requestId);
      check('คูปองถูกปิดระหว่างรอ -> สั่งไม่สำเร็จ แจ้งลูกค้า', ys.status === 'failed' && !!ys.error, ys.status + ' ' + ys.error);
    }
  }
}
