// ==================== เทียบผลการสมัครสมาชิกบน Supabase (เฟส 3: ย้ายการสมัครสมาชิก) ====================
//
// วางไฟล์นี้เป็นไฟล์ใหม่ในโปรเจกต์ Apps Script "Members LINE" (ใช้ฟังก์ชันจาก Members.gs และ SupabaseSync.gs)
// ไฟล์นี้มีแค่ชุดทดสอบ ไม่เปลี่ยนการทำงานของระบบที่ลูกค้าใช้ ไม่ต้อง Deploy เวอร์ชันใหม่
//
// signupCompareDryRun(): พิสูจน์ว่า Edge Function member-signup (รัน registerMember ตัวเดิมบนสำเนาใน
// Supabase) ได้ผลเหมือน Apps Script ทุกช่อง โดยไม่แตะชีตจริง
//   1. ส่งสำเนาแท็บที่การสมัครใช้ไป Supabase ให้สดก่อน
//   2. คัดลอกไฟล์ชีต Members เป็นไฟล์ชั่วคราว
//   3. ทุกกรณีทดสอบ: ถาม Supabase (โหมดทดลอง ไม่บันทึกอะไร) แล้วรัน registerMember ตัวจริงบนไฟล์ชั่วคราว
//      (ไม่ส่งข้อความ LINE ไม่ให้รางวัลผู้แนะนำ — แค่จดไว้เทียบ) แล้วเทียบ คำตอบ / ทุกช่องที่เขียน /
//      รูปแบบเซลล์ / งานหลังสมัคร จากนั้นลบแถวที่เพิ่มในไฟล์ชั่วคราว
//   4. ย้ายไฟล์ชั่วคราวไปถังขยะ ผลอยู่ใน Execution log
// กรณีทดสอบใช้ LINE UID/เบอร์ปลอม และข้อมูลสมาชิกจริงเฉพาะที่ต้องใช้ทดสอบ "ซ้ำ" / "ผู้แนะนำ"
// กรณี "สมมติเปิดโปร" ใช้ค่าตั้งสมมติชุดเดียวกันทั้งสองฝั่ง (สิทธิ์ต้อนรับ, แนะนำเพื่อน, แต้มต้อนรับ)
// ฝั่ง Apps Script เขียนแถวสมมติลง Signup_Privileges ของไฟล์ชั่วคราวเท่านั้น และแทนฟังก์ชันอ่านค่าตั้งชั่วคราว
// ระหว่างรัน (Script Properties จริงไม่ถูกแตะ)

var SIGNUP_EDGE_PATH_ = '/functions/v1/member-signup';
// แท็บที่ registerMember ใช้ (ตรงกับ TAB_KEYS ใน supabase/functions/member-signup/index.ts)
var SIGNUP_MIRROR_TABS_ = [
  'members/Members', 'members/Member_Privileges', 'members/Signup_Privileges', 'members/Tier_Config',
  'members/Points_Log', 'members/Referral_Log', 'props/script'
];
// เวลาในแถวที่เขียน (วันที่สมัคร/วันที่ให้สิทธิ์) ต่างกันได้เท่าเวลาที่ห่างกันระหว่างสองฝั่ง
var SIGNUP_DATE_TOLERANCE_MS_ = 10 * 60 * 1000;

function signupCompareDryRun() {
  var cfg = mirrorConfig_();
  if (!cfg) throw new Error('ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SECRET_KEY ใน Script Properties');
  var internalKey = signupInternalKey_(cfg);

  mirrorSyncTabsNow_(SIGNUP_MIRROR_TABS_, true);

  var cases = signupCompareCases_();
  var originalSheetId = MEMBERS_SHEET_ID;
  var saved = {
    verify: verifyLineIdToken_, send: sendLineMessages_, grant: grantReferralRewardOnSignupIfNeeded_,
    signupPrivilege: getSignupPrivilegeConfig_, referral: getReferralConfig_, bonus: getSignupBonusPoints_
  };
  var copy = DriveApp.getFileById(originalSheetId).makeCopy(
    'ทดสอบเทียบผลสมัครสมาชิก (ลบได้) ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm'));
  var lines = [], same = 0, diffs = 0;
  try {
    MEMBERS_SHEET_ID = copy.getId();
    cases.forEach(function (c) {
      getSignupPrivilegeConfig_ = saved.signupPrivilege;
      getReferralConfig_ = saved.referral;
      getSignupBonusPoints_ = saved.bonus;
      var problems = signupCompareOne_(cfg, internalKey, c);
      if (problems.length) {
        diffs++;
        lines.push('ต่าง  ' + c.label + '\n      ' + problems.slice(0, 8).join('\n      '));
      } else {
        same++;
        lines.push('ตรง   ' + c.label);
      }
    });
  } finally {
    MEMBERS_SHEET_ID = originalSheetId;
    verifyLineIdToken_ = saved.verify;
    sendLineMessages_ = saved.send;
    grantReferralRewardOnSignupIfNeeded_ = saved.grant;
    getSignupPrivilegeConfig_ = saved.signupPrivilege;
    getReferralConfig_ = saved.referral;
    getSignupBonusPoints_ = saved.bonus;
    signupResetSheetCache_();
    invalidateMembersIdentityCache_();
    copy.setTrashed(true);
  }
  lines.push(diffs ? ('== ต่างกัน ' + diffs + ' จาก ' + cases.length + ' กรณี ==')
                   : ('== ตรงกันทุกกรณี (' + same + ' กรณี) =='));
  Logger.log(lines.join('\n'));
  return { same: same, diffs: diffs, lines: lines };
}

// กรณีทดสอบ: สมัครปกติ, มี/ไม่มีรหัสผู้แนะนำ, เบอร์ไม่มี 0 นำหน้า, และทุกเงื่อนไขที่ต้องปฏิเสธ
function signupCompareCases_() {
  var sheet = ensureMembersSheet_();
  var last = sheet.getLastRow();
  var rows = last > 1 ? sheet.getRange(2, 1, last - 1, 13).getValues() : [];
  var usedPhones = {};
  rows.forEach(function (r) { usedPhones[String(r[3])] = true; });
  var existing = rows.filter(function (r) { return r[0] && r[3] && r[12]; })[0];
  if (!existing) throw new Error('ต้องมีสมาชิกอย่างน้อย 1 คนที่มี LINE UID เบอร์โทร และรหัสสมาชิก');

  var stamp = String(Date.now()).slice(-6);
  var n = 0;
  function freshPhone() {
    for (var i = 0; i < 1000; i++) {
      var p = '09' + String(90000000 + Math.floor(Math.random() * 9999999)).slice(-8);
      if (!usedPhones[p]) { usedPhones[p] = true; return p; }
    }
    throw new Error('หาเบอร์ทดสอบไม่ได้');
  }
  function test(label, over) {
    n++;
    var c = {
      label: label, uid: 'U_signup_compare_' + stamp + '_' + n, name: 'ทดสอบเทียบผล', picture: '',
      phone: freshPhone(), fullName: 'ทดสอบ เทียบผล ' + n, birthday: '1990-01-' + (n < 10 ? '0' + n : n), referrerCode: ''
    };
    Object.keys(over || {}).forEach(function (k) { c[k] = over[k]; });
    return c;
  }
  return [
    test('สมัครปกติ'),
    test('สมัครพร้อมรหัสผู้แนะนำที่มีจริง', { referrerCode: String(existing[12]) }),
    test('รหัสผู้แนะนำที่ไม่มีในระบบ', { referrerCode: 'EM-00000000-0000' }),
    test('เบอร์ 9 หลักไม่มี 0 นำหน้า', { phone: freshPhone().substring(1) }),
    test('เบอร์มีขีดและช่องว่าง', { phone: (function (p) { return p.substring(0, 3) + '-' + p.substring(3, 6) + ' ' + p.substring(6); })(freshPhone()) }),
    test('LINE นี้เป็นสมาชิกแล้ว', { uid: String(existing[0]) }),
    test('เบอร์นี้ถูกใช้แล้ว', { phone: String(existing[3]) }),
    test('เบอร์ไม่ครบ 10 หลัก', { phone: '08123' }),
    test('ไม่กรอกชื่อ', { fullName: '   ' }),
    test('ไม่กรอกวันเกิด', { birthday: '' })
  ].concat(signupSimulatedCases_(test, String(existing[12])));
}

// ---------------------------------------------------------------------------
// กรณี "สมมติเปิดโปร" (ค่าตั้งจริงปิดอยู่ จึงต้องสมมติเพื่อทดสอบทางที่ให้สิทธิ์/บันทึกผู้แนะนำ)
// ค่าตั้งเขียนในรูปที่ฟังก์ชันอ่านค่าตั้งคืนอยู่แล้ว (ทุกช่องครบ ชนิดถูก) Supabase ได้ JSON เดียวกันไปอ่าน
// ผ่านฟังก์ชันเดิม จึงได้ค่าเท่ากัน — ตัวฟังก์ชันอ่านค่าตั้งเองผ่านการเทียบใน mirrorCompareAll แล้ว
// ---------------------------------------------------------------------------
function signupSimulatedCases_(test, referrerCode) {
  var tz = 'Asia/Bangkok';
  function day(offset) {
    var d = new Date();
    d.setDate(d.getDate() + offset);
    return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  }
  function dateAt(offset) { // วันที่ในชีตแบบที่แอดมินกรอก (เที่ยงคืนเวลาไทย)
    var p = day(offset).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function signupPrivilege(over) {
    var c = { enabled: true, name: 'ต้อนรับทดสอบ', type: 'percent', value: 10, expiryDays: 0, expiryDate: '',
              restriction: '', freeProduct: '', freeQty: 0, startDate: '', endDate: '' };
    Object.keys(over || {}).forEach(function (k) { c[k] = over[k]; });
    return c;
  }
  function referral(over) {
    var c = { enabled: true, rewardTrigger: 'signup', rewardTarget: 'both', referrerPoints: 20,
              referrerDiscountType: '', referrerDiscountValue: 0, referredPoints: 10, referredDiscountType: 'fixed',
              referredDiscountValue: 30, minPurchase: 0, restriction: '', discountExpiryDays: 14, startDate: '', endDate: '' };
    Object.keys(over || {}).forEach(function (k) { c[k] = over[k]; });
    return c;
  }
  // คอลัมน์ Signup_Privileges: ชื่อ, ประเภท, มูลค่า, หมดอายุใน(วัน), เฉพาะสินค้า, สินค้าที่แถม, จำนวนที่แถม,
  // เปิดใช้งาน, วันที่สร้าง, ยอดซื้อขั้นต่ำ, วันเริ่มโปร, วันสิ้นสุดโปร
  var itemRows = [
    ['ทดสอบ ลด 50 บาท', 'fixed', 50, 7, '', '', '', true, dateAt(-5), 300, '', ''],
    ['ทดสอบ ส่งฟรี', 'ship_percent', 100, '', '', '', '', true, dateAt(-5), '', dateAt(1), dateAt(37)],
    ['ทดสอบ ซื้อ 2 แถม 1', 'bogo', 2, 30, 'สินค้าทดสอบ ก,สินค้าทดสอบ ข', 'สินค้าทดสอบ ค', 1, true, dateAt(-5), '', '', ''],
    ['ทดสอบ ปิดอยู่', 'percent', 5, 3, '', '', '', false, dateAt(-5), '', '', '']
  ];
  function sim(label, s, over) {
    var c = test('สมมติเปิดโปร: ' + label, over);
    c.sim = { signupPrivilegeRows: [] };
    Object.keys(s).forEach(function (k) { c.sim[k] = s[k]; });
    return c;
  }
  return [
    sim('สิทธิ์ต้อนรับแบบเดี่ยว ลด 10% หมดอายุ 30 วัน + แต้มต้อนรับ 50',
        { signupPrivilege: signupPrivilege({ expiryDays: 30 }), signupBonus: 50 }),
    sim('สิทธิ์ต้อนรับแบบเดี่ยว ซื้อ 2 แถม 1 ใช้ได้ตามช่วงวัน',
        { signupPrivilege: signupPrivilege({ type: 'bogo', value: 2, restriction: 'สินค้าทดสอบ ก,สินค้าทดสอบ ข',
          freeProduct: 'สินค้าทดสอบ ค', freeQty: 1, startDate: day(1), endDate: day(30) }) }),
    sim('สิทธิ์ต้อนรับแบบเดี่ยว กำหนดวันหมดอายุเอง',
        { signupPrivilege: signupPrivilege({ type: 'fixed', value: 30, expiryDate: day(14) }) }),
    sim('รายการสิทธิ์ต้อนรับหลายรายการ (เปิด 3 ปิด 1)', { signupPrivilegeRows: itemRows }),
    sim('แนะนำเพื่อน ให้รางวัลตอนสมัคร', { referral: referral() }, { referrerCode: referrerCode }),
    sim('แนะนำเพื่อน ให้รางวัลตอนซื้อครั้งแรก', { referral: referral({ rewardTrigger: 'first_purchase' }) },
        { referrerCode: referrerCode }),
    sim('แนะนำเพื่อน หมดเขตแล้ว', { referral: referral({ startDate: day(-30), endDate: day(-1) }) },
        { referrerCode: referrerCode }),
    sim('เปิดทุกโปรพร้อมกัน', {
      signupPrivilege: signupPrivilege({ expiryDays: 30 }), signupBonus: 50, signupPrivilegeRows: itemRows,
      referral: referral()
    }, { referrerCode: referrerCode })
  ];
}

// ตั้งค่าสมมติของกรณีนี้ทั้งสองฝั่ง คืน simulate ที่ส่งให้ Supabase
function signupApplySimulation_(ss, sim) {
  var out = { props: {}, tabs: {} };
  if (sim.signupPrivilege) {
    out.props.SIGNUP_PRIVILEGE_CONFIG = JSON.stringify(sim.signupPrivilege);
    getSignupPrivilegeConfig_ = function () { return JSON.parse(JSON.stringify(sim.signupPrivilege)); };
  }
  if (sim.referral) {
    out.props.REFERRAL_CONFIG = JSON.stringify(sim.referral);
    getReferralConfig_ = function () { return JSON.parse(JSON.stringify(sim.referral)); };
  }
  if (sim.signupBonus !== undefined) {
    out.props.SIGNUP_BONUS_POINTS = String(sim.signupBonus);
    getSignupBonusPoints_ = function () { return sim.signupBonus; };
  }
  // แท็บ Signup_Privileges ของไฟล์ชั่วคราว: แทนแถวข้อมูลทั้งหมดด้วยแถวสมมติ แล้วอ่านกลับไปให้ Supabase
  // (อ่านกลับเพื่อให้ได้ค่าตามที่ชีตเก็บจริง เช่น วันที่กลายเป็น Date)
  var sh = ss.getSheetByName('Signup_Privileges');
  var width = sh.getLastColumn();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, width).clearContent();
  var rows = sim.signupPrivilegeRows || [];
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  SpreadsheetApp.flush();
  out.tabs['members/Signup_Privileges'] = rows.length
    ? sh.getRange(2, 1, rows.length, width).getValues().map(function (line) {
        return line.map(function (v) { return v instanceof Date ? v.toISOString() : v; });
      })
    : [];
  return out;
}

function signupCompareOne_(cfg, internalKey, c) {
  var problems = [];
  signupResetSheetCache_();
  invalidateMembersIdentityCache_();
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var simulate = c.sim ? signupApplySimulation_(ss, c.sim) : null;

  // ฝั่ง Supabase (ไม่บันทึกอะไร)
  var q = { action: 'registerMemberDryRun', asUid: c.uid, asName: c.name, asPicture: c.picture,
            phoneNumber: c.phone, fullName: c.fullName, birthday: c.birthday, referrerCode: c.referrerCode };
  if (simulate) q.simulate = JSON.stringify(simulate);
  var res = UrlFetchApp.fetch(cfg.url + SIGNUP_EDGE_PATH_, {
    method: 'post', contentType: 'text/plain', headers: { 'x-internal-key': internalKey },
    payload: Object.keys(q).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&'),
    muteHttpExceptions: true
  });
  var remote;
  try { remote = JSON.parse(res.getContentText()); } catch (e) { return ['Supabase ตอบไม่ใช่ JSON: ' + res.getContentText().substring(0, 200)]; }
  if (!remote.success) return ['Supabase error: ' + JSON.stringify(remote).substring(0, 200)];
  if (remote.unsupported && remote.unsupported.length) problems.push('ตัวจำลองไม่รองรับ: ' + remote.unsupported.join(' | '));
  if (remote.notReady && remote.notReady.length) problems.push('สำเนายังไม่ทัน: ' + remote.notReady.join(', '));

  // ฝั่ง Apps Script: registerMember ตัวจริงบนไฟล์ชั่วคราว
  var before = {};
  SIGNUP_MIRROR_TABS_.forEach(function (key) {
    if (key.indexOf('members/') !== 0) return;
    var sh = ss.getSheetByName(key.substring(8));
    before[key] = sh ? sh.getLastRow() : 0;
  });
  var localDeferred = [];
  verifyLineIdToken_ = function () { return { sub: c.uid, name: c.name, picture: c.picture }; };
  sendLineMessages_ = function (to, messages) { localDeferred.push({ fn: 'sendLineMessages_', args: [to, messages] }); };
  grantReferralRewardOnSignupIfNeeded_ = function () {
    localDeferred.push({ fn: 'grantReferralRewardOnSignupIfNeeded_', args: Array.prototype.slice.call(arguments) });
  };
  var local;
  try { local = registerMember('dry-run', c.phone, c.fullName, c.birthday, c.referrerCode); }
  catch (e) { local = { thrown: String(e) }; }
  SpreadsheetApp.flush();

  // 1) คำตอบที่ส่งให้หน้าเว็บ
  var d = signupDiff_(JSON.parse(JSON.stringify(local)), remote.result, 'คำตอบ');
  if (d) problems.push(d);

  // 2) ทุกช่องที่เขียน + รูปแบบเซลล์ (แถวที่ต่อท้าย เทียบตามลำดับ: แถวแรกที่ Supabase ต่อท้าย = แถวแรกที่ต่อท้ายไฟล์)
  var expected = signupExpectedCells_(remote.journal || [], remote.baseRows || {}, before);
  Object.keys(before).forEach(function (key) {
    var sh = ss.getSheetByName(key.substring(8));
    if (!sh) return;
    var added = sh.getLastRow() - before[key];
    var exp = expected[key] || { appended: 0, cells: {}, formats: {} };
    if (added !== exp.appended) {
      problems.push(key + ' ต่อท้าย: Apps Script ' + added + ' แถว / Supabase ' + exp.appended + ' แถว');
    }
    Object.keys(exp.cells).forEach(function (rc) {
      var p = rc.split(':'), row = +p[0], col = +p[1];
      var got = sh.getRange(row, col).getValue();
      var want = exp.cells[rc];
      if (!signupSameValue_(got, want)) {
        problems.push(key + ' แถว ' + row + ' คอลัมน์ ' + col + ': Apps Script ' + signupShort_(got) + ' / Supabase ' + signupShort_(want));
      }
    });
    if (added > 0) {
      // ช่องที่ Apps Script เขียนแต่ Supabase ไม่ได้เขียน
      var width = sh.getLastColumn();
      var vals = sh.getRange(before[key] + 1, 1, added, width).getValues();
      vals.forEach(function (line, i) {
        line.forEach(function (v, j) {
          var rc = (before[key] + 1 + i) + ':' + (j + 1);
          if (v !== '' && !exp.cells.hasOwnProperty(rc)) {
            problems.push(key + ' แถว ' + (before[key] + 1 + i) + ' คอลัมน์ ' + (j + 1) + ': Apps Script เขียน ' + signupShort_(v) + ' / Supabase ไม่ได้เขียน');
          }
        });
      });
    }
    // รูปแบบเซลล์: ชีตอ่านค่ากลับไม่ตรงกับที่ตั้ง (ตั้ง '@STRING@' อ่านได้ '') จึงเทียบกับการตั้งรูปแบบเดียวกัน
    // ในเซลล์ว่างใต้ข้อมูลของไฟล์ชั่วคราว แล้วอ่านกลับด้วยวิธีเดียวกัน
    var scratchRow = sh.getLastRow() + 5;
    Object.keys(exp.formats).forEach(function (rc) {
      var p = rc.split(':');
      var got = sh.getRange(+p[0], +p[1]).getNumberFormat();
      var scratch = sh.getRange(scratchRow, +p[1]);
      scratch.setNumberFormat(exp.formats[rc]);
      var want = scratch.getNumberFormat();
      scratch.clearFormat();
      if (got !== want) {
        problems.push(key + ' แถว ' + p[0] + ' คอลัมน์ ' + p[1] + ' รูปแบบ: Apps Script "' + got + '" / Supabase "' + want + '" (' + exp.formats[rc] + ')');
      }
    });
    if (added > 0) sh.deleteRows(before[key] + 1, added); // คืนไฟล์ชั่วคราวให้เหมือนก่อนกรณีนี้
  });
  if (expected.otherTabs.length) problems.push('Supabase เขียนแท็บอื่น: ' + expected.otherTabs.join(', '));
  if (expected.existingRows.length) problems.push('Supabase แก้แถวเดิม (ไม่คาดว่าจะมีตอนสมัคร): ' + expected.existingRows.slice(0, 5).join(', '));

  // 3) งานหลังสมัคร (ข้อความต้อนรับ, รางวัลผู้แนะนำ)
  var dd = signupDiff_(JSON.parse(JSON.stringify(localDeferred)), signupUnwrapDates_(remote.deferred || []), 'งานหลังสมัคร');
  if (dd) problems.push(dd);

  SpreadsheetApp.flush();
  return problems;
}

// จำลอง journal เป็น "ค่าสุดท้ายของแต่ละช่อง" โดยแปลงเลขแถวของสำเนา Supabase เป็นเลขแถวในไฟล์ชั่วคราว
function signupExpectedCells_(journal, baseRows, before) {
  var out = { otherTabs: [], existingRows: [] };
  function tabOut(key) {
    if (!out[key]) out[key] = { appended: 0, cells: {}, formats: {}, maxRow: 0 };
    return out[key];
  }
  function mapRow(key, row) {
    var base = baseRows[key] || 0;
    if (row <= base) { out.existingRows.push(key + ' แถว ' + row); return row; }
    return before[key] + (row - base);
  }
  journal.forEach(function (w) {
    if (!before.hasOwnProperty(w.tab)) { if (out.otherTabs.indexOf(w.tab) === -1) out.otherTabs.push(w.tab); return; }
    var t = tabOut(w.tab);
    if (w.op === 'setValues' || w.op === 'appendRow') {
      var values = w.op === 'appendRow' ? [w.values] : w.values;
      var col0 = w.op === 'appendRow' ? 1 : w.col;
      values.forEach(function (line, i) {
        var row = mapRow(w.tab, w.row + i);
        line.forEach(function (v, j) { t.cells[row + ':' + (col0 + j)] = v; });
        if (w.row + i > (baseRows[w.tab] || 0)) t.maxRow = Math.max(t.maxRow, w.row + i - (baseRows[w.tab] || 0));
      });
    } else if (w.op === 'setNumberFormat') {
      for (var r = 0; r < w.numRows; r++) {
        for (var c = 0; c < w.numCols; c++) {
          t.formats[mapRow(w.tab, w.row + r) + ':' + (w.col + c)] = w.args[0];
        }
      }
    }
  });
  Object.keys(out).forEach(function (k) { if (out[k] && out[k].maxRow !== undefined) out[k].appended = out[k].maxRow; });
  return out;
}

function signupSameValue_(got, want) {
  if (want && typeof want === 'object' && want.hasOwnProperty('$date')) {
    if (!(got instanceof Date)) return false;
    return Math.abs(got.getTime() - new Date(want.$date).getTime()) <= SIGNUP_DATE_TOLERANCE_MS_;
  }
  if (want === null || want === undefined) want = '';
  return got === want;
}

// { $date: ISO } -> ISO (รูปเดียวกับ JSON.stringify ของ Date ฝั่ง Apps Script)
function signupUnwrapDates_(v) {
  if (Array.isArray(v)) return v.map(signupUnwrapDates_);
  if (v && typeof v === 'object') {
    if (Object.keys(v).length === 1 && v.hasOwnProperty('$date')) return v.$date;
    var o = {};
    Object.keys(v).forEach(function (k) { o[k] = signupUnwrapDates_(v[k]); });
    return o;
  }
  return v;
}

// เทียบแบบ mirrorFirstDiff_ แต่ยอมให้เวลา (สตริง ISO) ต่างกันได้ไม่เกิน SIGNUP_DATE_TOLERANCE_MS_
function signupDiff_(a, b, path) {
  var iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  if (typeof a === 'string' && typeof b === 'string' && iso.test(a) && iso.test(b)) {
    return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= SIGNUP_DATE_TOLERANCE_MS_ ? ''
      : path + ': Apps Script ' + a + ' / Supabase ' + b;
  }
  if (a === b) return '';
  var ta = Object.prototype.toString.call(a), tb = Object.prototype.toString.call(b);
  if (ta !== tb) return path + ' ชนิดต่างกัน Apps Script ' + signupShort_(a) + ' / Supabase ' + signupShort_(b);
  if (Array.isArray(a)) {
    if (a.length !== b.length) return path + ' จำนวน Apps Script ' + a.length + ' / Supabase ' + b.length;
    for (var i = 0; i < a.length; i++) {
      var d = signupDiff_(a[i], b[i], path + '[' + i + ']');
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
      var d2 = signupDiff_(a[list[j]], b[list[j]], path + '.' + list[j]);
      if (d2) return d2;
    }
    return '';
  }
  return path + ': Apps Script ' + signupShort_(a) + ' / Supabase ' + signupShort_(b);
}

function signupShort_(v) {
  var s = v instanceof Date ? v.toISOString() : JSON.stringify(v);
  if (s === undefined) s = 'undefined';
  return s.length > 60 ? s.substring(0, 60) + '…' : s;
}

function signupInternalKey_(cfg) {
  var res = UrlFetchApp.fetch(cfg.url + '/rest/v1/rpc/mirror_internal_key', {
    method: 'post', contentType: 'application/json', payload: '{}',
    headers: mirrorAuthHeaders_(cfg.key), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('อ่าน internal key ไม่ได้: ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

// ensure*Sheet_ ใน Members.gs จำ object ของแท็บไว้ใน _sheetCache_ ต้องล้างทุกครั้งที่สลับไฟล์
function signupResetSheetCache_() {
  Object.keys(_sheetCache_).forEach(function (k) { delete _sheetCache_[k]; });
}
