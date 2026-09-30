// ==================== สะสมคะแนนจากใบเสร็จ 7-Eleven + แจ้งแลกของพรีเมียม ====================
//
// วางไฟล์นี้เป็นไฟล์ใหม่ในโปรเจกต์ Apps Script "Members LINE" ต่อจาก SupabaseSync.gs, SupabaseSignup.gs,
// SupabaseOrder.gs (ไฟล์นี้ต้องอยู่หลังไฟล์เหล่านั้น) — ไม่ต้องแก้ Members.gs แล้ว Deploy > Manage deployments >
// แก้ Web App ตัวเดิมเป็น New version (URL เดิม)
//
// ใบเสร็จ 7-Eleven (Supabase schema loyalty, Edge Function "loyalty")
//   ลูกค้าส่งใบเสร็จที่หน้าสมาชิก -> Supabase เก็บไฟล์ + AI ตรวจ -> ปลุกไฟล์นี้ (doPost action loyaltyWorkNow)
//   ไฟล์นี้รับงานจากคิว loyalty_work_claim แล้วทำตามลำดับ:
//     1. แจ้งกลุ่มแอดมิน (Flex + รูปใบเสร็จ + ผล AI + ปุ่มเปิดหน้าตรวจ) — ผ่านหรือไม่ผ่านก็แจ้ง
//     2. แอดมินกดอนุมัติที่หน้า receiptReview.html -> เพิ่มคะแนนลงชีต Members + Points_Log (ผ่าน
//        addPointsAndCheckRewards_ ตัวเดิม ระดับสมาชิก/ของรางวัลตามแต้มทำงานเหมือนได้แต้มจากออเดอร์)
//     3. แจ้งผลในกลุ่มแอดมิน และส่ง Flex ไล่สีแจ้งลูกค้า (ได้กี่คะแนน / ไม่ผ่านเพราะอะไร)
//   ให้คะแนนซ้ำไม่ได้: ก่อนเขียนเช็คใน Points_Log ว่ามีรายการ [7-11 R7-xxxxx] ของใบนี้แล้วหรือยัง
//   รอบสำรอง: ทุก 1 นาทีผ่าน trigger คิวสมัคร (processRegistrationQueue) เก็บงานที่ปลุกไม่สำเร็จ
//
// ของพรีเมียม
//   ห่อ doGet/doPost action redeemReward: แลกสำเร็จและเป็นหมวด premium -> บันทึกใบจัดส่งใน Supabase
//   (ชื่อ/เบอร์/ที่อยู่จากชีต Members) แล้วแจ้งกลุ่มแอดมินพร้อมปุ่มพิมพ์ใบจัดส่ง (shippingLabel.html)
//   แอดมินใส่เลขพัสดุแล้วกด "จัดส่งแล้ว" ในหน้าใบจัดส่ง -> ไฟล์นี้ส่ง Flex แจ้งลูกค้าพร้อมเลขพัสดุ
//
// ใช้จาก Members.gs: ADMIN_GROUP_ID, LINE_CHANNEL_ACCESS_TOKEN (หรือ sendLineMessages_), getMemberRowByUid_,
// ensureMembersSheet_, ensurePointsLogSheet_, addPointsAndCheckRewards_, logPointsTransaction_
// ใช้จากไฟล์ Supabase*.gs: mirrorConfig_, signupRpc_, signupKeyValid_, mirrorAfterBackgroundWrite_
//
// ทดสอบ: รัน loyaltyTestFlex() จาก editor — ส่งตัวอย่าง Flex ทุกแบบเข้ากลุ่มแอดมิน (ไม่แตะคะแนน)

var LOYALTY_BACKUP_EVERY_SEC_ = 60;
var LOYALTY_BACKUP_CACHE_KEY_ = 'loyalty_work_backup';
var LOYALTY_POINTS_TABS_ = ['members/Members', 'members/Points_Log', 'members/Member_Privileges'];
var LOYALTY_LOG_OVERRIDE_ = null;   // { uid, desc } ระหว่างเขียนคะแนนจากใบเสร็จ (เปลี่ยนคำอธิบายใน Points_Log)
var LOYALTY_LOG_CAPTURE_ = null;    // [] ระหว่าง redeemReward รัน (เก็บรายการแต้มที่ถูกตัด)

// ==========================================================================================
// ส่วนที่ 1: คิวงานจาก Supabase
// ==========================================================================================
function loyaltyWorkNow_(key) {
  if (!signupKeyValid_(key)) return { success: false, error: 'ไม่อนุญาต' };
  return loyaltyWorkPending_();
}

function loyaltyWorkPendingBackup_() {
  var cache = CacheService.getScriptCache();
  if (cache.get(LOYALTY_BACKUP_CACHE_KEY_)) return;
  cache.put(LOYALTY_BACKUP_CACHE_KEY_, '1', LOYALTY_BACKUP_EVERY_SEC_);
  try {
    loyaltyWorkPending_();
  } catch (e) {
    Logger.log('loyaltyWorkPendingBackup_ error: ' + e);
  }
}

function loyaltyWorkPending_() {
  var cfg = mirrorConfig_();
  if (!cfg) return { success: false, error: 'ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SECRET_KEY' };
  var work = signupRpc_(cfg, 'loyalty_work_claim', { p_limit: 10 }) || {};
  var receipts = work.receipts || [], shipments = work.shipments || [];
  var results = [], pointsWritten = false;
  receipts.forEach(function (r) {
    try {
      if (loyaltyProcessReceipt_(cfg, r)) pointsWritten = true;
      results.push({ ref: r.ref, ok: true });
    } catch (e) {
      Logger.log('loyalty receipt ' + r.ref + ': ' + e);
      loyaltyUpdate_(cfg, 'receipt', r.id, { last_error: String(e).substring(0, 500), release: true });
      results.push({ ref: r.ref, ok: false, error: String(e) });
      if (r.attempts >= 5 && r.attempts % 5 === 0) {
        loyaltyAlertAdmin_('ใบเสร็จ ' + r.ref + ' ทำงานไม่สำเร็จ ' + r.attempts + ' ครั้ง: ' + String(e).substring(0, 200));
      }
    }
  });
  shipments.forEach(function (s) {
    try {
      loyaltyProcessShipment_(cfg, s);
      results.push({ ref: s.ref, ok: true });
    } catch (e) {
      Logger.log('loyalty shipment ' + s.ref + ': ' + e);
      loyaltyUpdate_(cfg, 'shipment', s.id, { last_error: String(e).substring(0, 500), release: true });
      results.push({ ref: s.ref, ok: false, error: String(e) });
    }
  });
  if (pointsWritten && typeof mirrorAfterBackgroundWrite_ === 'function') mirrorAfterBackgroundWrite_(LOYALTY_POINTS_TABS_);
  return { success: true, processed: results.length, results: results };
}

function loyaltyUpdate_(cfg, kind, id, patch) {
  try {
    signupRpc_(cfg, 'loyalty_work_update', { p_kind: kind, p_id: id, p_patch: patch });
  } catch (e) {
    Logger.log('loyaltyUpdate_ ' + kind + ' ' + id + ': ' + e);
  }
}

// ทำงานของใบเสร็จ 1 ใบ (แต่ละขั้นรายงานผลทันที ขั้นที่สำเร็จแล้วไม่ทำซ้ำรอบหน้า) — คืน true ถ้าเขียนคะแนน
function loyaltyProcessReceipt_(cfg, r) {
  var needs = r.needs || {};
  var wrote = false;
  if (needs.admin) {
    loyaltyPush_(ADMIN_GROUP_ID, [loyaltyAdminReceiptFlex_(r)], r.id + ':admin', loyaltyAdminReceiptText_(r));
    loyaltyUpdate_(cfg, 'receipt', r.id, { admin_notified: true });
  }
  var pointsDone = r.status !== 'approved' || !needs.points;
  if (r.status === 'approved' && needs.points) {
    r.balanceAfter = loyaltyWritePoints_(r);
    loyaltyUpdate_(cfg, 'receipt', r.id, { points_written: true, balance_after: r.balanceAfter });
    pointsDone = true;
    wrote = true;
  }
  if (needs.decision && pointsDone) {
    loyaltyPush_(ADMIN_GROUP_ID, [{ type: 'text', text: loyaltyDecisionText_(r) }], r.id + ':decision:' + r.status);
    loyaltyUpdate_(cfg, 'receipt', r.id, { decision_notified: true });
  }
  if (needs.customer && pointsDone) {
    var msg = r.status === 'approved' ? loyaltyCustomerApprovedFlex_(r) : loyaltyCustomerRejectedFlex_(r);
    var fallback = r.status === 'approved'
      ? '🎉 ใบเสร็จ 7-Eleven ' + r.ref + ' ผ่านการตรวจสอบ ได้รับ ' + r.points + ' คะแนน'
      : 'ใบเสร็จ 7-Eleven ' + r.ref + ' ยังไม่ผ่านการตรวจสอบ: ' + (r.reviewNote || '');
    loyaltyPush_(r.lineUid, [msg], r.id + ':customer:' + r.status, fallback);
    loyaltyUpdate_(cfg, 'receipt', r.id, { customer_notified: true });
  }
  loyaltyUpdate_(cfg, 'receipt', r.id, { last_error: null, release: true });
  return wrote;
}

function loyaltyProcessShipment_(cfg, s) {
  var needs = s.needs || {};
  if (needs.admin) {
    loyaltyPush_(ADMIN_GROUP_ID, [loyaltyAdminShipmentFlex_(s)], s.id + ':admin', loyaltyAdminShipmentText_(s));
    loyaltyUpdate_(cfg, 'shipment', s.id, { admin_notified: true });
  }
  if (needs.customer) {
    loyaltyPush_(s.lineUid, [loyaltyCustomerShippedFlex_(s)], s.id + ':shipped',
      '📦 ของพรีเมียม "' + s.rewardName + '" จัดส่งแล้ว' + (s.trackingNo ? ' เลขพัสดุ ' + s.trackingNo : ''));
    loyaltyUpdate_(cfg, 'shipment', s.id, { customer_notified: true });
  }
  loyaltyUpdate_(cfg, 'shipment', s.id, { last_error: null, release: true });
}

// ==========================================================================================
// ส่วนที่ 2: เพิ่มคะแนนลงชีต
// ==========================================================================================
// คืนคะแนนคงเหลือหลังเพิ่ม — ใบที่เคยเขียนแล้ว (เจอใน Points_Log) ไม่เขียนซ้ำ
function loyaltyWritePoints_(r) {
  var uid = r.lineUid;
  var pts = parseInt(r.points, 10) || 0;
  if (!uid || pts <= 0) throw new Error('ข้อมูลคะแนนไม่ถูกต้อง');
  var tag = '[7-11 ' + r.ref + ']';
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('ระบบไม่ว่าง จะเพิ่มคะแนนในรอบถัดไป');
  try {
    var already = loyaltyFindPointsLog_(uid, tag);
    if (already) return already.balance;
    var found = getMemberRowByUid_(uid, 13);
    if (!found) throw new Error('ไม่พบสมาชิก (LINE UID) นี้ในชีต Members');
    var v = found.values;
    var current = parseInt(v[5], 10) || 0;
    var lifetime = parseFloat(v[11]) || 0;
    var spend = r.countSpend ? (parseFloat(r.emochaAmount) || 0) : 0;
    var desc = tag + ' คะแนนจากใบเสร็จ 7-Eleven' + (r.emochaAmount ? ' (สินค้าเอมโอชา ' + loyaltyBaht_(r.emochaAmount) + ')' : '');
    LOYALTY_LOG_OVERRIDE_ = { uid: uid, desc: desc };
    try {
      addPointsAndCheckRewards_(uid, pts, spend, found.rowIndex, current, lifetime, v[6], null, null);
    } finally {
      LOYALTY_LOG_OVERRIDE_ = null;
    }
    SpreadsheetApp.flush();
    var after = parseInt(ensureMembersSheet_().getRange(found.rowIndex, 6).getValue(), 10) || 0;
    if (after !== current + pts) throw new Error('เขียนคะแนนไม่สำเร็จ (' + current + ' -> ' + after + ')');
    // ป้ายของใบนี้ต้องอยู่ใน Points_Log เสมอ (ใช้กันให้คะแนนซ้ำ)
    if (!loyaltyFindPointsLog_(uid, tag)) logPointsTransaction_(uid, 'adjust_add', desc, 0, after);
    return after;
  } finally {
    lock.releaseLock();
  }
}

// หารายการใน Points_Log (ย้อนหลัง 5,000 แถว) ที่คำอธิบายมีป้ายนี้ -> { balance }
function loyaltyFindPointsLog_(uid, tag) {
  var sheet = ensurePointsLogSheet_();
  var last = sheet.getLastRow();
  if (last <= 1) return null;
  var start = Math.max(2, last - 4999);
  var rows = sheet.getRange(start, 2, last - start + 1, 5).getValues(); // B..F: UID, ประเภท, รายการ, เปลี่ยน, คงเหลือ
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][0] === uid && String(rows[i][2]).indexOf(tag) !== -1) return { balance: parseInt(rows[i][4], 10) || 0 };
  }
  return null;
}

// ==========================================================================================
// ส่วนที่ 3: แลกของพรีเมียม -> ใบจัดส่ง + แจ้งกลุ่มแอดมิน
// ==========================================================================================
function loyaltyAfterRedeem_(params, out, captured) {
  if (!out || typeof out.getContent !== 'function') return;
  var result;
  try { result = JSON.parse(out.getContent()); } catch (e) { return; }
  if (!result || !result.success || result.category !== 'premium') return;
  var redeems = (captured || []).filter(function (c) { return c.type === 'redeem' && c.uid; });
  var uid = redeems.length ? redeems[0].uid : '';
  if (!uid) {
    try { var profile = verifyLineIdToken_(params.idToken); uid = profile ? profile.sub : ''; } catch (e2) {}
  }
  if (!uid) { loyaltyAlertAdmin_('มีการแลกของพรีเมียม "' + result.rewardName + '" แต่หาตัวลูกค้าไม่ได้ กรุณาดูใน Redemption_Log'); return; }
  var pointsUsed = redeems.reduce(function (sum, c) { return sum + Math.abs(parseInt(c.delta, 10) || 0); }, 0);
  var found = getMemberRowByUid_(uid, 13);
  var v = found ? found.values : [];
  var row = {
    line_uid: uid, member_code: String(v[12] || ''), reward_name: String(result.rewardName || ''),
    category: 'premium', qty: parseInt(params.quantity, 10) || 1, points_used: pointsUsed || null,
    recipient_name: String(v[9] || v[1] || ''), recipient_phone: loyaltyPhone_(v[3]),
    address: String(v[7] || ''), province: String(v[8] || '')
  };
  var cfg = mirrorConfig_();
  if (!cfg) {
    loyaltyPush_(ADMIN_GROUP_ID, [{ type: 'text', text: loyaltyAdminShipmentText_({
      rewardName: row.reward_name, qty: row.qty, pointsUsed: row.points_used, recipientName: row.recipient_name,
      recipientPhone: row.recipient_phone, address: row.address, province: row.province, memberCode: row.member_code
    }) }]);
    return;
  }
  var s;
  try {
    s = signupRpc_(cfg, 'loyalty_shipment_add', { p_row: row });
  } catch (e4) {
    loyaltyAlertAdmin_('บันทึกใบจัดส่งไม่สำเร็จ (' + e4 + ')\n' + loyaltyAdminShipmentText_({
      rewardName: row.reward_name, qty: row.qty, pointsUsed: row.points_used, recipientName: row.recipient_name,
      recipientPhone: row.recipient_phone, address: row.address, province: row.province }));
    return;
  }
  // แจ้งทันที (ไม่สำเร็จ = คิวส่งให้ในรอบถัดไป)
  try {
    loyaltyPush_(ADMIN_GROUP_ID, [loyaltyAdminShipmentFlex_(s)], s.id + ':admin', loyaltyAdminShipmentText_(s));
    loyaltyUpdate_(cfg, 'shipment', s.id, { admin_notified: true });
  } catch (e3) {
    Logger.log('loyalty premium notify: ' + e3);
  }
}

function loyaltyPhone_(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (d.length === 9) d = '0' + d;
  if (d.length === 11 && d.indexOf('66') === 0) d = '0' + d.substring(2);
  return d;
}

// ==========================================================================================
// ส่วนที่ 4: ส่ง LINE
// ==========================================================================================
// ส่งด้วย Messaging API โดยตรงเพื่อรู้ผล (Flex ผิดรูปแบบ -> ส่งข้อความธรรมดาแทน) และใส่ X-Line-Retry-Key
// กันส่งซ้ำเมื่อรอบก่อนส่งสำเร็จแต่รายงานผลไม่ทัน
function loyaltyPush_(to, messages, retrySeed, fallbackText) {
  if (!to) throw new Error('ไม่มีผู้รับ');
  var token = (typeof LINE_CHANNEL_ACCESS_TOKEN !== 'undefined') ? LINE_CHANNEL_ACCESS_TOKEN : '';
  if (!token) {
    sendLineMessages_(to, messages);
    return;
  }
  var send = function (msgs, seed) {
    var headers = { Authorization: 'Bearer ' + token };
    if (seed) headers['X-Line-Retry-Key'] = loyaltyUuid_(seed);
    return UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post', contentType: 'application/json', headers: headers, muteHttpExceptions: true,
      payload: JSON.stringify({ to: to, messages: msgs })
    });
  };
  var res = send(messages, retrySeed);
  var code = res.getResponseCode();
  if (code === 200 || code === 409) return; // 409 = ส่งด้วย retry key นี้ไปแล้ว
  var body = res.getContentText().substring(0, 400);
  if (code === 400 && fallbackText) {
    Logger.log('loyaltyPush_ Flex ถูกปฏิเสธ: ' + body);
    var res2 = send([{ type: 'text', text: String(fallbackText).substring(0, 4900) }], retrySeed ? retrySeed + ':text' : '');
    if (res2.getResponseCode() === 200 || res2.getResponseCode() === 409) return;
    body = res2.getContentText().substring(0, 400);
    code = res2.getResponseCode();
  }
  throw new Error('ส่ง LINE ไม่สำเร็จ HTTP ' + code + ' ' + body);
}

function loyaltyUuid_(seed) {
  var h = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(seed), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  return h.substring(0, 8) + '-' + h.substring(8, 12) + '-4' + h.substring(13, 16) + '-a' + h.substring(17, 20) + '-' + h.substring(20, 32);
}

function loyaltyAlertAdmin_(text) {
  Logger.log('loyaltyAlertAdmin_: ' + text);
  try { sendLineMessages_(ADMIN_GROUP_ID, [{ type: 'text', text: '⚠️ ' + text }]); } catch (e) {}
  try { logErrorToSheet_('loyalty', text); } catch (e2) {}
}

// ==========================================================================================
// ส่วนที่ 5: ข้อความ Flex
// ==========================================================================================
var LOYALTY_VERDICT_ = {
  pass:      { label: 'AI ตรวจเบื้องต้น: ผ่าน', icon: '✅', start: '#11998E', end: '#38EF7D' },
  suspect:   { label: 'AI ตรวจเบื้องต้น: น่าสงสัย ตรวจละเอียด', icon: '⚠️', start: '#F7971E', end: '#F2542D' },
  fail:      { label: 'AI ตรวจเบื้องต้น: ไม่ผ่าน', icon: '❌', start: '#CB2D3E', end: '#EF473A' },
  unchecked: { label: 'AI ยังไม่ได้ตรวจ (ตรวจเอง)', icon: '🔎', start: '#536976', end: '#292E49' }
};

function loyaltyBaht_(n) {
  var x = parseFloat(n);
  if (isNaN(x)) return '-';
  return x.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' บาท';
}

function loyaltyDate_(iso, withTime) {
  if (!iso) return '-';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return Utilities.formatDate(d, 'Asia/Bangkok', withTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy');
}

function loyaltyText_(text, opts) {
  var t = { type: 'text', text: String(text == null || text === '' ? '-' : text).substring(0, 2000), wrap: true };
  Object.keys(opts || {}).forEach(function (k) { t[k] = opts[k]; });
  return t;
}

function loyaltyRow_(label, value, opts) {
  opts = opts || {};
  return {
    type: 'box', layout: 'baseline', spacing: 'sm', margin: opts.margin || 'sm',
    contents: [
      loyaltyText_(label, { size: 'sm', color: '#8A8A8A', flex: 3 }),
      loyaltyText_(value, { size: 'sm', color: opts.color || '#222222', flex: 5, weight: opts.bold ? 'bold' : 'regular', align: 'end' })
    ]
  };
}

function loyaltyGradient_(start, end, angle, center) {
  var g = { type: 'linearGradient', angle: angle || '135deg', startColor: start, endColor: end };
  if (center) { g.centerColor = center; g.centerPosition = '50%'; }
  return g;
}

function loyaltyButton_(label, uri, color) {
  return { type: 'button', style: 'primary', height: 'sm', color: color || '#00A86B',
           action: { type: 'uri', label: label, uri: uri } };
}

function loyaltyItemsText_(items) {
  if (!items || !items.length) return '';
  return items.slice(0, 5).map(function (i) {
    return '• ' + i.name + (i.qty ? ' x' + i.qty : '') + (i.amount ? ' = ' + loyaltyBaht_(i.amount) : '');
  }).join('\n');
}

// ---- กลุ่มแอดมิน: ใบเสร็จใหม่ ----
function loyaltyAdminReceiptFlex_(r) {
  var v = LOYALTY_VERDICT_[r.aiVerdict] || LOYALTY_VERDICT_.unchecked;
  if (r.status === 'rejected' && r.duplicateOf) v = { label: 'ใบเสร็จซ้ำ — ระบบไม่อนุมัติอัตโนมัติ', icon: '⛔', start: '#CB2D3E', end: '#EF473A' };
  var m = r.member || {};
  var survey = r.survey || {};
  var body = [
    loyaltyText_('👤 ' + (m.name || m.lineName || '-') + (m.memberCode ? '  (' + m.memberCode + ')' : ''), { weight: 'bold', size: 'md' }),
    loyaltyText_('📞 ' + (m.phone || '-') + (survey.channel ? '  ·  ' + survey.channel : ''), { size: 'xs', color: '#8A8A8A', margin: 'xs' }),
    { type: 'separator', margin: 'md' },
    loyaltyRow_('สาขา', r.store || '-', { margin: 'md' }),
    loyaltyRow_('เลขที่ใบเสร็จ', r.receiptNo || '-'),
    loyaltyRow_('วันที่ซื้อ', loyaltyDate_(r.receiptAt, true)),
    loyaltyRow_('ยอดรวม', r.receiptTotal ? loyaltyBaht_(r.receiptTotal) : '-'),
    loyaltyRow_('สินค้าเอมโอชา', r.emochaAmount != null ? loyaltyBaht_(r.emochaAmount) : '-', { bold: true, color: '#00875A' }),
    loyaltyRow_(r.status === 'approved' ? 'ให้คะแนน' : 'คะแนนที่แนะนำ',
      (r.status === 'approved' ? r.points : r.suggestedPoints) + ' คะแนน', { bold: true, color: '#E8590C' })
  ];
  var items = loyaltyItemsText_(r.emochaItems);
  if (items) body.push(loyaltyText_(items, { size: 'xs', color: '#555555', margin: 'md' }));
  var flags = (r.aiFlags || []).slice(0, 6);
  if (flags.length) {
    body.push({ type: 'box', layout: 'vertical', margin: 'md', paddingAll: '10px', cornerRadius: '8px',
                backgroundColor: '#FFF4E5',
                contents: flags.map(function (f) { return loyaltyText_('• ' + String(f).substring(0, 160), { size: 'xs', color: '#B54708' }); }) });
  }
  if (r.ai && r.ai.result && r.ai.result.summary_th) {
    body.push(loyaltyText_('🤖 ' + r.ai.result.summary_th, { size: 'xs', color: '#555555', margin: 'md' }));
  }
  var bubble = {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '16px', background: loyaltyGradient_(v.start, v.end),
      contents: [
        loyaltyText_('🧾 ใบเสร็จ 7-Eleven ' + r.ref, { color: '#FFFFFF', weight: 'bold', size: 'lg' }),
        loyaltyText_(v.icon + ' ' + v.label, { color: '#FFFFFF', size: 'sm', margin: 'sm' })
      ]
    },
    body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: body },
    footer: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        loyaltyButton_(r.status === 'pending_review' ? '🔍 ตรวจสอบ/อนุมัติ' : '🔍 ดูรายละเอียด', r.reviewLink, '#00A86B'),
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: '📋 รายการรอตรวจ', uri: r.listLink } }
      ]
    }
  };
  if (r.previewUrl) {
    bubble.hero = { type: 'image', url: r.previewUrl, size: 'full', aspectRatio: '3:4', aspectMode: 'fit',
                    backgroundColor: '#F2F2F2', action: { type: 'uri', label: 'ดูรูป', uri: r.previewUrl } };
  } else {
    body.unshift(loyaltyText_('📄 ไฟล์ ' + (r.fileMime || '') + ' — กดตรวจสอบเพื่อเปิดไฟล์', { size: 'xs', color: '#8A8A8A' }));
  }
  return { type: 'flex', altText: '🧾 ใบเสร็จ 7-Eleven ใหม่ ' + r.ref + ' — ' + v.label, contents: bubble };
}

function loyaltyAdminReceiptText_(r) {
  var m = r.member || {};
  var v = LOYALTY_VERDICT_[r.aiVerdict] || LOYALTY_VERDICT_.unchecked;
  return '🧾 ใบเสร็จ 7-Eleven ใหม่ ' + r.ref + '\n' + v.label +
    '\nลูกค้า: ' + (m.name || '-') + ' ' + (m.memberCode || '') +
    '\nสินค้าเอมโอชา: ' + (r.emochaAmount != null ? loyaltyBaht_(r.emochaAmount) : '-') +
    ' แนะนำ ' + r.suggestedPoints + ' คะแนน' +
    ((r.aiFlags || []).length ? '\n⚠️ ' + r.aiFlags.slice(0, 4).join('\n⚠️ ') : '') +
    '\nตรวจสอบ: ' + r.reviewLink;
}

function loyaltyDecisionText_(r) {
  var m = r.member || {};
  var who = r.reviewer ? ' (โดย ' + r.reviewer + ')' : '';
  if (r.status === 'approved') {
    return '✅ ' + r.ref + ' อนุมัติแล้ว' + who + '\nเพิ่ม ' + r.points + ' คะแนนให้ ' + (m.name || '-') +
      (r.balanceAfter != null ? ' (คงเหลือ ' + r.balanceAfter + ' คะแนน)' : '');
  }
  return '❌ ' + r.ref + ' ไม่อนุมัติ' + who + '\nลูกค้า: ' + (m.name || '-') + '\nเหตุผล: ' + (r.reviewNote || '-');
}

// ---- ลูกค้า: ผ่านการตรวจสอบ (ไล่สี) ----
function loyaltyCustomerApprovedFlex_(r) {
  var rows = [
    loyaltyRow_('เลขอ้างอิง', r.ref),
    loyaltyRow_('สาขา', r.store || '7-Eleven'),
    loyaltyRow_('วันที่ซื้อ', loyaltyDate_(r.receiptAt, false))
  ];
  if (r.emochaAmount) rows.push(loyaltyRow_('ยอดสินค้าเอมโอชา', loyaltyBaht_(r.emochaAmount)));
  if (r.balanceAfter != null) rows.push(loyaltyRow_('คะแนนสะสมล่าสุด', Number(r.balanceAfter).toLocaleString('en-US') + ' คะแนน', { bold: true, color: '#E8590C' }));
  var bubble = {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '22px',
      background: loyaltyGradient_('#FF8A00', '#C2185B', '135deg', '#FF3D6E'),
      contents: [
        loyaltyText_('🎉 ใบเสร็จผ่านการตรวจสอบแล้ว', { color: '#FFFFFF', weight: 'bold', size: 'md' }),
        { type: 'box', layout: 'baseline', margin: 'lg', contents: [
          loyaltyText_('+' + r.points, { color: '#FFFFFF', weight: 'bold', size: '5xl', flex: 0, wrap: false }),
          loyaltyText_('คะแนน', { color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'md', flex: 0, wrap: false })
        ] },
        loyaltyText_('ขอบคุณที่อุดหนุนเอมโอชาที่ 7-Eleven 💚', { color: '#FFFFFFE6', size: 'sm', margin: 'md' })
      ]
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px',
      contents: [
        { type: 'box', layout: 'vertical', height: '6px', cornerRadius: '3px',
          background: loyaltyGradient_('#FFB347', '#00B894', '90deg', '#FF6F91'), contents: [{ type: 'filler' }] }
      ].concat(rows).concat([
        loyaltyText_('สะสมคะแนนต่อ แลกของรางวัลและของพรีเมียมได้ที่หน้าสมาชิก', { size: 'xs', color: '#8A8A8A', margin: 'lg' })
      ])
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '14px',
      contents: [{
        type: 'box', layout: 'vertical', cornerRadius: '24px', paddingAll: '12px',
        background: loyaltyGradient_('#00B894', '#00796B', '90deg'),
        action: { type: 'uri', label: 'ดูคะแนนของฉัน', uri: r.memberLiffUrl },
        contents: [loyaltyText_('⭐ ดูคะแนนของฉัน', { color: '#FFFFFF', weight: 'bold', align: 'center', size: 'md' })]
      }]
    }
  };
  return { type: 'flex', altText: '🎉 ใบเสร็จ 7-Eleven ผ่านการตรวจสอบ ได้รับ ' + r.points + ' คะแนน', contents: bubble };
}

// ---- ลูกค้า: ไม่ผ่านการตรวจสอบ ----
function loyaltyCustomerRejectedFlex_(r) {
  var bubble = {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '20px', background: loyaltyGradient_('#757F9A', '#4B5563'),
      contents: [
        loyaltyText_('🧾 ใบเสร็จยังไม่ผ่านการตรวจสอบ', { color: '#FFFFFF', weight: 'bold', size: 'md' }),
        loyaltyText_('เลขอ้างอิง ' + r.ref, { color: '#FFFFFFD9', size: 'sm', margin: 'sm' })
      ]
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px',
      contents: [
        loyaltyText_('เหตุผล', { size: 'sm', color: '#8A8A8A' }),
        loyaltyText_(r.reviewNote || 'ใบเสร็จไม่ผ่านเงื่อนไขการสะสมคะแนน', { size: 'md', weight: 'bold', margin: 'sm' }),
        loyaltyText_('หากมีข้อสงสัย ทักแชทแอดมินได้เลย หรือส่งใบเสร็จที่ชัดเจนอีกครั้งที่หน้าสมาชิก', { size: 'xs', color: '#8A8A8A', margin: 'lg' })
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '14px',
      contents: [loyaltyButton_('ไปหน้าสมาชิก', r.memberLiffUrl, '#4B5563')]
    }
  };
  return { type: 'flex', altText: 'ใบเสร็จ 7-Eleven ' + r.ref + ' ยังไม่ผ่านการตรวจสอบ', contents: bubble };
}

// ---- กลุ่มแอดมิน: ลูกค้าแลกของพรีเมียม ----
function loyaltyAdminShipmentFlex_(s) {
  var addr = [s.address, s.province].filter(function (x) { return x; }).join(' ');
  var body = [
    loyaltyText_('🎁 ' + s.rewardName + '  x' + (s.qty || 1), { weight: 'bold', size: 'lg' }),
    loyaltyText_(s.pointsUsed ? 'ใช้ ' + Number(s.pointsUsed).toLocaleString('en-US') + ' คะแนน' : '', { size: 'sm', color: '#8A8A8A', margin: 'xs' }),
    { type: 'separator', margin: 'md' },
    loyaltyRow_('ผู้รับ', s.recipientName || '-', { margin: 'md', bold: true }),
    loyaltyRow_('เบอร์โทร', s.recipientPhone || '-'),
    loyaltyRow_('รหัสสมาชิก', s.memberCode || '-'),
    loyaltyText_('📍 ' + (addr || 'ลูกค้ายังไม่มีที่อยู่จัดส่ง — กรุณาติดต่อลูกค้า'),
      { size: 'sm', margin: 'md', color: addr ? '#222222' : '#C92A2A', weight: addr ? 'regular' : 'bold' })
  ];
  var bubble = {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '16px', background: loyaltyGradient_('#8E2DE2', '#FF6A88', '135deg'),
      contents: [
        loyaltyText_('🎁 ลูกค้าแลกของพรีเมียม', { color: '#FFFFFF', weight: 'bold', size: 'lg' }),
        loyaltyText_('ใบจัดส่ง ' + s.ref + ' · ' + loyaltyDate_(s.createdAt, true), { color: '#FFFFFFE6', size: 'sm', margin: 'sm' })
      ]
    },
    body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: body },
    footer: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        loyaltyButton_('🖨️ พิมพ์ใบจัดส่ง', s.labelLink, '#8E2DE2'),
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: '📦 ใบจัดส่งทั้งหมด', uri: s.listLink } }
      ]
    }
  };
  return { type: 'flex', altText: '🎁 ลูกค้าแลกของพรีเมียม: ' + s.rewardName + ' (' + (s.recipientName || '') + ')', contents: bubble };
}

function loyaltyAdminShipmentText_(s) {
  return '🎁 ลูกค้าแลกของพรีเมียม ' + (s.ref || '') + '\n' + s.rewardName + ' x' + (s.qty || 1) +
    (s.pointsUsed ? ' (ใช้ ' + s.pointsUsed + ' คะแนน)' : '') +
    '\nผู้รับ: ' + (s.recipientName || '-') + ' ' + (s.recipientPhone || '') +
    '\nที่อยู่: ' + ([s.address, s.province].filter(function (x) { return x; }).join(' ') || '-') +
    (s.labelLink ? '\nพิมพ์ใบจัดส่ง: ' + s.labelLink : '');
}

// ---- ลูกค้า: ของพรีเมียมจัดส่งแล้ว ----
function loyaltyCustomerShippedFlex_(s) {
  var rows = [loyaltyRow_('ของพรีเมียม', s.rewardName + ' x' + (s.qty || 1), { bold: true })];
  if (s.carrier) rows.push(loyaltyRow_('ขนส่ง', s.carrier));
  rows.push(loyaltyRow_('เลขพัสดุ', s.trackingNo || '-', { bold: true, color: '#E8590C' }));
  var bubble = {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '20px', background: loyaltyGradient_('#00B4DB', '#0083B0', '135deg'),
      contents: [
        loyaltyText_('📦 ของพรีเมียมจัดส่งแล้ว', { color: '#FFFFFF', weight: 'bold', size: 'lg' }),
        loyaltyText_('ขอบคุณที่สะสมคะแนนกับเอมโอชา 💚', { color: '#FFFFFFE6', size: 'sm', margin: 'sm' })
      ]
    },
    body: { type: 'box', layout: 'vertical', paddingAll: '18px', contents: rows },
    footer: { type: 'box', layout: 'vertical', paddingAll: '14px', contents: [loyaltyButton_('ไปหน้าสมาชิก', s.memberLiffUrl, '#0083B0')] }
  };
  return { type: 'flex', altText: '📦 ของพรีเมียม "' + s.rewardName + '" จัดส่งแล้ว', contents: bubble };
}

// ==========================================================================================
// ส่วนที่ 6: ตัวเชื่อม (ห่อฟังก์ชันเดิม ติดตั้งทุกครั้งที่โหลดไฟล์)
// ==========================================================================================
function loyaltyInstallHooks_() {
  var G = globalThis;
  if (G.__loyaltyHooksInstalled) return;
  G.__loyaltyHooksInstalled = true;
  function wrap(name, make) {
    if (typeof G[name] !== 'function') { Logger.log('loyaltyInstallHooks_: ไม่พบ ' + name); return; }
    G[name] = make(G[name]);
  }

  // redeemReward ผ่าน doGet/doPost: จำรายการแต้มที่ถูกตัด แล้วบันทึกใบจัดส่งถ้าเป็นของพรีเมียม
  function withRedeemHook(orig) {
    return function (e) {
      var action = e && e.parameter && e.parameter.action;
      if (action !== 'redeemReward') return orig.apply(this, arguments);
      LOYALTY_LOG_CAPTURE_ = [];
      var out, captured;
      try {
        out = orig.apply(this, arguments);
      } finally {
        captured = LOYALTY_LOG_CAPTURE_;
        LOYALTY_LOG_CAPTURE_ = null;
      }
      try { loyaltyAfterRedeem_(e.parameter, out, captured); } catch (x) { Logger.log('loyalty premium: ' + x); }
      return out;
    };
  }
  wrap('doGet', withRedeemHook);

  wrap('doPost', function (orig) {
    var hooked = withRedeemHook(orig);
    return function (e) {
      var body = null;
      try { body = JSON.parse((e && e.postData && e.postData.contents) || 'null'); } catch (x) {}
      if (body && body.action === 'loyaltyWorkNow') {
        var result;
        try { result = loyaltyWorkNow_(body.key); } catch (err) { result = { success: false, error: String(err) }; }
        return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
      }
      return hooked.apply(this, arguments);
    };
  });

  wrap('processRegistrationQueue', function (orig) {
    return function () {
      try { loyaltyWorkPendingBackup_(); } catch (x) { Logger.log('loyalty backup: ' + x); }
      return orig.apply(this, arguments);
    };
  });

  wrap('logPointsTransaction_', function (orig) {
    return function (lineUid, type, description, delta, balanceAfter) {
      if (LOYALTY_LOG_CAPTURE_) {
        LOYALTY_LOG_CAPTURE_.push({ uid: lineUid, type: type, description: description, delta: delta, balance: balanceAfter });
      }
      if (LOYALTY_LOG_OVERRIDE_ && type === 'earn' && lineUid === LOYALTY_LOG_OVERRIDE_.uid) {
        description = LOYALTY_LOG_OVERRIDE_.desc;
      }
      return orig.call(this, lineUid, type, description, delta, balanceAfter);
    };
  });
}
loyaltyInstallHooks_();

// ==========================================================================================
// ส่วนที่ 7: ทดสอบ — ส่งตัวอย่าง Flex ทุกแบบเข้ากลุ่มแอดมิน (ไม่แตะชีต/คะแนน)
// ==========================================================================================
function loyaltyTestFlex() {
  var link = 'https://em-o-cha.github.io/Order/receiptReview.html';
  var liff = 'https://liff.line.me/2010892131-hMnmdrmH';
  var r = {
    id: 'test-' + Date.now(), ref: 'R7-TEST', aiVerdict: 'suspect', status: 'pending_review',
    member: { name: 'ทดสอบ ระบบ', memberCode: 'EM-TEST', phone: '0800000000' },
    survey: { channel: 'ร้าน 7-Eleven (หน้าร้าน)' }, store: 'สาขาทดสอบ (01234)', receiptNo: 'R#0001234',
    receiptAt: new Date().toISOString(), receiptTotal: 185, emochaAmount: 90, suggestedPoints: 3, points: 3,
    emochaItems: [{ name: 'เอมโอชาน้ำพริกน้ำย้อย', qty: 2, amount: 90 }],
    aiFlags: ['ตัวอย่างธง: เลขที่ใบเสร็จอ่านได้บางส่วน'], ai: { result: { summary_th: 'ตัวอย่างสรุปจาก AI' } },
    reviewLink: link, listLink: link, memberLiffUrl: liff, balanceAfter: 30, reviewNote: 'ตัวอย่างเหตุผล', reviewer: 'ทดสอบ'
  };
  var s = {
    id: 'test-ship-' + Date.now(), ref: 'PM-TEST', rewardName: 'แก้วเก็บความเย็นเอมโอชา', qty: 1, pointsUsed: 300,
    recipientName: 'ทดสอบ ระบบ', recipientPhone: '0800000000', memberCode: 'EM-TEST', address: '99/9 ถนนทดสอบ',
    province: 'กรุงเทพมหานคร', createdAt: new Date().toISOString(), labelLink: link, listLink: link,
    trackingNo: 'TH0000000000', carrier: 'Flash Express', memberLiffUrl: liff
  };
  var approved = JSON.parse(JSON.stringify(r)); approved.status = 'approved';
  var msgs = [loyaltyAdminReceiptFlex_(r), loyaltyCustomerApprovedFlex_(approved), loyaltyCustomerRejectedFlex_(r),
              loyaltyAdminShipmentFlex_(s), loyaltyCustomerShippedFlex_(s)];
  msgs.forEach(function (m, i) {
    loyaltyPush_(ADMIN_GROUP_ID, [m], '', 'ทดสอบ Flex แบบที่ ' + (i + 1) + ' ถูกปฏิเสธ — ดู Execution log');
  });
  Logger.log('ส่งตัวอย่าง ' + msgs.length + ' แบบเข้ากลุ่มแอดมินแล้ว');
}
