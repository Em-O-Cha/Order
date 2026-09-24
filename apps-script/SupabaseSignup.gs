// ==================== สมัครสมาชิกผ่าน Supabase (เฟส 3: ย้ายการสมัครสมาชิก) ====================
//
// วางไฟล์นี้เป็นไฟล์ใหม่ในโปรเจกต์ Apps Script "Members LINE" ต่อจาก Members.gs และ SupabaseSync.gs
// (ลำดับไฟล์สำคัญ: ไฟล์นี้ต้องอยู่หลัง Members.gs) — ไม่ต้องแก้ Members.gs
//
// ส่วนที่ 1 ตัวเขียน: Supabase รับการสมัครและตอบลูกค้าทันที แล้วปลุก Web App นี้ (doPost action signupWriteNow)
//   ให้เขียนแถวลงชีต Members/Member_Privileges ตามที่ registerMember ตัวเดิมคำนวณไว้ แล้วส่งข้อความต้อนรับ/
//   ให้รางวัลผู้แนะนำด้วยฟังก์ชันเดิม มีรอบสำรองทุก 2 นาทีผ่าน trigger คิวสมัคร (processRegistrationQueue)
//   เขียนซ้ำไม่ได้ (เช็ค LINE UID + รหัสสมาชิกในชีตก่อน) ถ้ารหัสสมาชิกชนกับที่ทางเดิมออกระหว่างรอ -> ออกรหัสใหม่
//   และแจ้งกลุ่มแอดมิน ถ้า LINE/เบอร์ซ้ำกับที่ทางเดิมเพิ่งสร้าง -> ไม่เขียน ตั้งสถานะ failed และแจ้งกลุ่มแอดมิน
// ส่วนที่ 2 ตัวเชื่อม (ติดตั้งตอนโหลดไฟล์ ห่อฟังก์ชันเดิมโดยไม่แก้ Members.gs):
//   - doPost: รับ action signupWriteNow
//   - processRegistrationQueue: เรียกรอบสำรองของตัวเขียนก่อน
//   - registerMember (ทางเดิม): เช็คซ้ำนับรวมการสมัครที่ Supabase รับแล้วแต่ยังไม่ลงชีต
//   - generateMemberCode_: รหัสใหม่ต้องมากกว่ารหัสที่ Supabase ออกไปแล้วแต่ยังไม่ลงชีต
//   - ensureMemberFromOrder_ และฟังก์ชันแอดมินที่แก้ค่าตั้งการสมัคร: ตั้งธงให้ Supabase ถอยไปสมัครทาง Apps Script
//     จนกว่าสำเนาจะทัน
// ส่วนที่ 3 ชุดทดสอบ (รันเองจาก editor ไม่แตะชีตจริง ทำงานบนไฟล์ชีตชั่วคราว):
//   - signupCompareDryRun(): Supabase คำนวณการสมัครได้เหมือน registerMember ตัวจริงทุกช่อง
//   - signupWriterTest(): ตัวเขียนลงชีตถูกต้อง เขียนซ้ำไม่ได้ กู้คืนหลังค้างกลางทาง รหัสชน LINE ซ้ำ
//
// signupCompareDryRun():
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


// ==========================================================================================
// ส่วนที่ 1: ตัวเขียนการสมัครจาก Supabase ลงชีต
// ==========================================================================================
var SIGNUP_BACKUP_EVERY_SEC_ = 120;               // รอบสำรอง (ผ่าน trigger คิวสมัครทุก 1 นาที)
var SIGNUP_BACKUP_CACHE_KEY_ = 'signup_writer_backup';
var SIGNUP_KEY_CACHE_KEY_ = 'signup_internal_key';

// doPost action signupWriteNow: Supabase ปลุกหลังรับการสมัคร
function signupWriteNow_(key) {
  if (!signupKeyValid_(key)) return { success: false, error: 'ไม่อนุญาต' };
  return signupWritePending_({ tests: false });
}

// รอบสำรอง: เก็บงานที่ปลุกไม่สำเร็จ/ล็อกไม่ว่าง (ถาม Supabase ไม่เกินทุก 2 นาที ประหยัดโควตา)
function signupWritePendingBackup_() {
  var cache = CacheService.getScriptCache();
  if (cache.get(SIGNUP_BACKUP_CACHE_KEY_)) return;
  cache.put(SIGNUP_BACKUP_CACHE_KEY_, '1', SIGNUP_BACKUP_EVERY_SEC_);
  try {
    signupWritePending_({ tests: false });
  } catch (e) {
    Logger.log('signupWritePendingBackup_ error: ' + e);
  }
}

function signupKeyValid_(key) {
  var cfg = mirrorConfig_();
  if (!cfg || !key) return false;
  var cache = CacheService.getScriptCache();
  var known = cache.get(SIGNUP_KEY_CACHE_KEY_);
  if (!known) {
    known = signupInternalKey_(cfg);
    cache.put(SIGNUP_KEY_CACHE_KEY_, known, 600);
  }
  return String(key) === String(known);
}

// รับงานจาก Supabase แล้วเขียนลงชีต (ใต้ ScriptLock เดียวกับ registerMember/createShopOrder)
// จากนั้นทำงานหลังสมัครหลังปล่อยล็อก (ลำดับเดียวกับ registerMember)
// opts.tests = true: รับเฉพาะแถวทดสอบ (ชุดทดสอบใช้กับไฟล์ชีตชั่วคราว) และไม่ส่งสำเนาไป Supabase
function signupWritePending_(opts) {
  opts = opts || {};
  var cfg = mirrorConfig_();
  if (!cfg) return { success: false, error: 'ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SECRET_KEY' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { success: false, error: 'ระบบไม่ว่าง จะเขียนในรอบสำรอง' };
  var results = [], written = [];
  try {
    var rows = signupRpc_(cfg, 'signup_claim', { p_tests: !!opts.tests, p_limit: 10 }) || [];
    rows.forEach(function (row) {
      var r;
      try {
        r = signupWriteSheet_(cfg, row);
      } catch (e) {
        r = { ok: false, id: row.id, error: String(e) };
        signupRpc_(cfg, 'signup_update', { p_id: row.id, p_patch: { last_error: String(e), release: true } });
      }
      results.push({ id: row.id, ok: r.ok, memberCode: r.row ? r.row.member_code : row.member_code,
                     note: r.note || '', error: r.error || '' });
      if (r.ok) written.push(r.row);
    });
    if (written.length) {
      SpreadsheetApp.flush();
      invalidateMembersIdentityCache_();
    }
  } finally {
    lock.releaseLock();
  }
  written.forEach(function (row) { signupRunDeferred_(cfg, row); });
  // ส่งสำเนาทันที การสมัครจะได้ออกจากรายการ "ยังไม่อยู่ในสำเนา" (ไม่ตั้งธงตัวตน: Supabase รู้จักคนเหล่านี้อยู่แล้ว)
  if (written.length && !opts.tests && typeof mirrorAfterBackgroundWrite_ === 'function') {
    mirrorAfterBackgroundWrite_(MIRROR_SIGNUP_TABS_.filter(function (k) { return k !== MIRROR_IDENTITY_KEY_; }));
  }
  return { success: true, processed: results.length, results: results };
}

// เขียน 1 การสมัคร คืน { ok, row (หลังเปลี่ยนรหัสถ้ามี), note } — ต้องถือ ScriptLock อยู่
function signupWriteSheet_(cfg, row) {
  if (row.sheet_written_at) return { ok: true, row: row, note: 'เขียนชีตไว้แล้ว ทำงานหลังสมัครต่อ' };
  var members = ensureMembersSheet_();
  var last = members.getLastRow();
  var ident = last > 1 ? members.getRange(2, 1, last - 1, 13).getValues() : [];
  var problems = [], codeTaken = false;
  for (var i = 0; i < ident.length; i++) {
    var uid = String(ident[i][0]), phone = String(ident[i][3]), code = String(ident[i][12]);
    if (uid === String(row.line_uid)) {
      // เคยเขียนไปแล้ว (เช่น เขียนเสร็จแต่รายงานผลไม่ทัน) — ไม่เขียนซ้ำ
      if (code === String(row.member_code)) {
        signupRpc_(cfg, 'signup_update', { p_id: row.id, p_patch: { sheet_written: true } });
        return { ok: true, row: row, note: 'พบแถวในชีตแล้ว ไม่เขียนซ้ำ' };
      }
      problems.push('LINE นี้มีในชีตแล้ว (รหัส ' + code + ')');
    } else if (phone === String(row.phone)) {
      problems.push('เบอร์ ' + phone + ' มีในชีตแล้ว (รหัส ' + code + ')');
    }
    if (code === String(row.member_code)) codeTaken = true;
  }
  if (problems.length) {
    var msg = problems.join(' | ');
    signupRpc_(cfg, 'signup_update', { p_id: row.id, p_patch: { status: 'failed', last_error: msg } });
    signupAlertAdmin_('สมัครผ่าน Supabase แล้วแต่ลงชีตไม่ได้: ' + (row.request && row.request.fullName || '') +
      ' (' + row.member_code + ') — ' + msg + ' กรุณาตรวจสอบ');
    return { ok: false, row: row, error: msg };
  }
  var note = '';
  if (codeTaken) {
    // ระหว่างรอลงชีต ทางเดิมออกรหัสเดียวกันไปแล้ว: ออกรหัสใหม่ด้วยฟังก์ชันเดิม (นับรวมรหัสที่ Supabase ออกไปแล้ว)
    var oldCode = row.member_code;
    var newCode = generateMemberCode_(members);
    row = signupReplaceText_(row, oldCode, newCode);
    row.member_code = newCode;
    signupRpc_(cfg, 'signup_update', { p_id: row.id, p_patch: {
      member_code: newCode, result: row.result, deferred: row.deferred, journal: row.journal, renumbered_from: oldCode } });
    signupAlertAdmin_('รหัสสมาชิกชน: ' + (row.request && row.request.fullName || '') + ' เห็นรหัส ' + oldCode +
      ' ตอนสมัคร แต่รหัสนี้ถูกใช้ไปแล้ว ระบบให้รหัสใหม่ ' + newCode + ' (ข้อความต้อนรับใช้รหัสใหม่)');
    note = 'เปลี่ยนรหัส ' + oldCode + ' -> ' + newCode;
  }
  signupApplyJournal_(SpreadsheetApp.openById(MEMBERS_SHEET_ID), row.journal || [], row.base_rows || {});
  SpreadsheetApp.flush();
  signupRpc_(cfg, 'signup_update', { p_id: row.id, p_patch: { sheet_written: true } });
  return { ok: true, row: row, note: note || 'เขียนชีตแล้ว' };
}

// เขียนตาม journal ของ registerMember: แถวที่เกิน base_rows = ต่อท้ายแท็บตามลำดับเดิม
// (แก้แถวเดิมไม่รองรับ — การสมัครไม่มี ถ้าเจอให้หยุดดีกว่าเขียนผิดแถว)
function signupApplyJournal_(ss, journal, baseRows) {
  var sheets = {}, offsets = {};
  journal.forEach(function (e) {
    if (e.tab.indexOf('members/') !== 0) throw new Error('journal เขียนแท็บนอกไฟล์ Members: ' + e.tab);
    var sh = sheets[e.tab] || (sheets[e.tab] = ss.getSheetByName(e.tab.substring(8)));
    if (!sh) throw new Error('ไม่พบแท็บ ' + e.tab);
    var base = Number(baseRows[e.tab] || 0);
    if (!offsets.hasOwnProperty(e.tab)) offsets[e.tab] = sh.getLastRow() - base;
    if (e.op === 'appendRow') {
      sh.appendRow(signupDecode_(e.values));
      return;
    }
    if (e.row <= base) throw new Error('journal แก้แถวเดิม ' + e.tab + ' แถว ' + e.row + ' (ไม่รองรับ)');
    var row = e.row + offsets[e.tab];
    if (e.op === 'setValues') {
      sh.getRange(row, e.col, e.values.length, e.values[0].length).setValues(signupDecode_(e.values));
    } else if (e.op === 'setNumberFormat' || e.op === 'setFontWeight' || e.op === 'setBackground' || e.op === 'setNote') {
      var range = sh.getRange(row, e.col, e.numRows, e.numCols);
      range[e.op].apply(range, signupDecode_(e.args || []));
    } else {
      throw new Error('journal มีคำสั่งที่ไม่รองรับ: ' + e.op);
    }
  });
}

// งานหลังสมัคร (ข้อความต้อนรับ, รางวัลผู้แนะนำ) ด้วยฟังก์ชันเดิม ข้อผิดพลาดจดไว้แต่ไม่หยุด (เหมือน registerMember)
function signupRunDeferred_(cfg, row) {
  var errors = [];
  (row.deferred || []).forEach(function (d) {
    var args = signupDecode_(d.args || []);
    try {
      if (d.fn === 'sendLineMessages_') {
        var r = sendLineMessages_(args[0], args[1]);
        if (r && r.success === false) errors.push('ข้อความต้อนรับ: ' + r.error);
      } else if (d.fn === 'grantReferralRewardOnSignupIfNeeded_') {
        grantReferralRewardOnSignupIfNeeded_.apply(null, args);
      } else {
        errors.push('ไม่รู้จักงาน ' + d.fn);
      }
    } catch (e) {
      errors.push(d.fn + ': ' + e);
    }
  });
  signupRpc_(cfg, 'signup_update', { p_id: row.id, p_patch: {
    deferred_done: true, last_error: errors.length ? errors.join(' | ') : null } });
  if (errors.length) Logger.log('signupRunDeferred_ ' + row.member_code + ': ' + errors.join(' | '));
}

// { $date: ISO } -> Date (ทุกระดับ)
function signupDecode_(v) {
  if (Array.isArray(v)) return v.map(signupDecode_);
  if (v && typeof v === 'object') {
    if (Object.keys(v).length === 1 && v.hasOwnProperty('$date')) return v.$date ? new Date(v.$date) : '';
    var o = {};
    Object.keys(v).forEach(function (k) { o[k] = signupDecode_(v[k]); });
    return o;
  }
  return v;
}

// แทนข้อความ (รหัสสมาชิก) ในทุกสตริงของ journal / result / deferred
function signupReplaceText_(v, from, to) {
  if (typeof v === 'string') return v.split(from).join(to);
  if (Array.isArray(v)) return v.map(function (x) { return signupReplaceText_(x, from, to); });
  if (v && typeof v === 'object') {
    var o = {};
    Object.keys(v).forEach(function (k) { o[k] = signupReplaceText_(v[k], from, to); });
    return o;
  }
  return v;
}

function signupAlertAdmin_(text) {
  Logger.log('signupAlertAdmin_: ' + text);
  try { sendLineMessages_(ADMIN_GROUP_ID, [{ type: 'text', text: '⚠️ ' + text }]); } catch (e) {}
  try { logErrorToSheet_('signup', text); } catch (e2) {}
}

function signupRpc_(cfg, fn, args) {
  var res = UrlFetchApp.fetch(cfg.url + '/rest/v1/rpc/' + fn, {
    method: 'post', contentType: 'application/json', headers: mirrorAuthHeaders_(cfg.key),
    payload: JSON.stringify(args || {}), muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code !== 200 && code !== 204) throw new Error(fn + ': HTTP ' + code + ' ' + res.getContentText().substring(0, 300));
  var text = res.getContentText();
  return text ? JSON.parse(text) : null;
}

// การสมัครที่ Supabase รับแล้วแต่ยังไม่ลงชีต [{ line_uid, phone, member_code }] — จำไว้ 20 วินาทีในรอบทำงานนี้
// ถาม Supabase ไม่ได้ = ถือว่าไม่มี (ไม่ขวางทางเดิม)
var _signupPendingIdentity_ = null;
function signupPendingIdentity_() {
  if (_signupPendingIdentity_ && Date.now() - _signupPendingIdentity_.at < 20000) return _signupPendingIdentity_.rows;
  var rows = [];
  try {
    var cfg = mirrorConfig_();
    if (cfg) rows = signupRpc_(cfg, 'signup_pending_identity', {}) || [];
  } catch (e) {
    Logger.log('signupPendingIdentity_ error: ' + e);
  }
  _signupPendingIdentity_ = { at: Date.now(), rows: rows };
  return rows;
}

function signupMarkDirty_(keys) {
  try {
    if (typeof mirrorMarkDirty_ === 'function') mirrorMarkDirty_(keys);
  } catch (e) {
    Logger.log('signupMarkDirty_ error: ' + e);
  }
}

// ==========================================================================================
// ส่วนที่ 2: ตัวเชื่อม (ห่อฟังก์ชันเดิม ติดตั้งทุกครั้งที่โหลดไฟล์)
// ==========================================================================================
// ฟังก์ชันแอดมินที่แก้ค่าตั้งที่การสมัครใช้ -> แท็บที่ต้องตั้งธง (Supabase ถอยไป Apps Script จนกว่าสำเนาจะทัน)
var SIGNUP_ADMIN_DIRTY_ = {
  updateSignupBonus: ['props/script'],
  updateSignupPrivilegeConfig: ['props/script'],
  toggleSignupPrivilegeConfigEnabled: ['props/script'],
  updateReferralConfig: ['props/script'],
  createSignupPrivilegeItem: ['members/Signup_Privileges'],
  updateSignupPrivilegeItem: ['members/Signup_Privileges'],
  toggleSignupPrivilegeItem: ['members/Signup_Privileges'],
  updateTierConfig: ['members/Tier_Config'],
  backfillMembersFromRevenue: ['members/Members', 'members/Members#identity']
};

function signupInstallHooks_() {
  var G = globalThis;
  if (G.__signupHooksInstalled) return;
  G.__signupHooksInstalled = true;
  function wrap(name, make) {
    if (typeof G[name] !== 'function') { Logger.log('signupInstallHooks_: ไม่พบ ' + name); return; }
    G[name] = make(G[name]);
  }

  // doPost: Supabase ปลุกตัวเขียน
  wrap('doPost', function (orig) {
    return function (e) {
      var body = null;
      try { body = JSON.parse((e && e.postData && e.postData.contents) || 'null'); } catch (x) {}
      if (body && body.action === 'signupWriteNow') {
        var result;
        try { result = signupWriteNow_(body.key); } catch (err) { result = { success: false, error: String(err) }; }
        return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
      }
      return orig.apply(this, arguments);
    };
  });

  // trigger คิวสมัครทุก 1 นาที: รอบสำรองของตัวเขียน
  wrap('processRegistrationQueue', function (orig) {
    return function () {
      try { signupWritePendingBackup_(); } catch (x) { Logger.log('signup backup: ' + x); }
      return orig.apply(this, arguments);
    };
  });

  // ทางเดิม: เช็ค LINE/เบอร์ซ้ำ นับรวมการสมัครที่ Supabase รับแล้วแต่ยังไม่ลงชีต
  // (ต่อท้ายรายการตัวตนที่ registerMember ใช้เช็คซ้ำ เฉพาะระหว่างการเรียกครั้งนั้น — ลำดับข้อความ error เหมือนเดิม)
  wrap('registerMember', function (orig) {
    return function () {
      var pending = signupPendingIdentity_();
      if (!pending.length) return orig.apply(this, arguments);
      var originalRows = G.getCachedMembersIdentityRows_;
      G.getCachedMembersIdentityRows_ = function () {
        return originalRows.apply(this, arguments).concat(pending.map(function (p) {
          return [p.line_uid, '', '', p.phone];
        }));
      };
      try {
        return orig.apply(this, arguments);
      } finally {
        G.getCachedMembersIdentityRows_ = originalRows;
      }
    };
  });

  // รหัสสมาชิกใหม่ต้องมากกว่ารหัสที่ Supabase ออกไปแล้วแต่ยังไม่ลงชีต (ลำดับเลขต่อเนื่องแบบเดิม)
  wrap('generateMemberCode_', function (orig) {
    return function (sheet) {
      var code = orig.apply(this, arguments);
      var seq = parseInt(String(code).substring(11), 10) || 0;
      var maxPending = 0;
      signupPendingIdentity_().forEach(function (p) {
        var c = String(p.member_code || '');
        if (c.indexOf('EM-') === 0) maxPending = Math.max(maxPending, parseInt(c.substring(11), 10) || 0);
      });
      if (maxPending < seq) return code;
      var s = String(maxPending + 1);
      while (s.length < 4) s = '0' + s;
      return String(code).substring(0, 11) + s;
    };
  });

  // สร้างสมาชิกจากออเดอร์ (ทางเดิม): ข้อมูลตัวตนเปลี่ยน
  wrap('ensureMemberFromOrder_', function (orig) {
    return function () {
      var r = orig.apply(this, arguments);
      if (r && r.created) signupMarkDirty_(['members/Members', 'members/Members#identity']);
      return r;
    };
  });

  Object.keys(SIGNUP_ADMIN_DIRTY_).forEach(function (name) {
    wrap(name, function (orig) {
      return function () {
        var r = orig.apply(this, arguments);
        signupMarkDirty_(SIGNUP_ADMIN_DIRTY_[name]);
        return r;
      };
    });
  });
}
signupInstallHooks_();

// ==========================================================================================
// ส่วนที่ 3 (ต่อ): ชุดทดสอบตัวเขียน — signupWriterTest()
// ==========================================================================================
// สมัครทดสอบผ่าน Supabase (แถว is_test ไม่ปนของจริง) แล้วให้ตัวเขียนเขียนลง "ไฟล์ชีตชั่วคราว" เทียบทุกช่องกับที่
// Supabase คำนวณ ทดสอบ: เขียนปกติ / สั่งซ้ำไม่เขียนซ้ำ / ค้างกลางทาง (เขียนชีตแล้วแต่ยังไม่รายงาน) /
// รหัสชนกับที่ทางเดิมออก / LINE ซ้ำกับที่ทางเดิมสร้าง — ไม่ส่งข้อความ LINE จริง (จดไว้เทียบ)
function signupWriterTest() {
  var cfg = mirrorConfig_();
  if (!cfg) throw new Error('ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SECRET_KEY ใน Script Properties');
  var internalKey = signupInternalKey_(cfg);
  signupRpc_(cfg, 'signup_delete_tests', {});
  mirrorSyncTabsNow_(SIGNUP_MIRROR_TABS_, true);

  var originalSheetId = MEMBERS_SHEET_ID;
  var saved = { send: sendLineMessages_, grant: grantReferralRewardOnSignupIfNeeded_ };
  var sent = [], lines = [], fails = 0;
  function check(label, ok, detail) {
    if (!ok) fails++;
    lines.push((ok ? 'ผ่าน  ' : 'ไม่ผ่าน ') + label + (detail ? ' — ' + detail : ''));
  }
  var stamp = String(Date.now()).slice(-6), n = 0;
  function signup() {
    n++;
    var q = { action: 'registerMember', asUid: 'U_signup_writer_' + stamp + '_' + n, asName: 'ทดสอบตัวเขียน',
              asPicture: '', phoneNumber: '09' + stamp + (n < 10 ? '0' + n : String(n)),
              fullName: 'ทดสอบ ตัวเขียน ' + n, birthday: '1990-02-0' + (n % 9 + 1), referrerCode: '' };
    var res = UrlFetchApp.fetch(cfg.url + SIGNUP_EDGE_PATH_, {
      method: 'post', contentType: 'text/plain', headers: { 'x-internal-key': internalKey },
      payload: Object.keys(q).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&'),
      muteHttpExceptions: true
    });
    var r = JSON.parse(res.getContentText());
    if (!r.success) throw new Error('สมัครทดสอบไม่สำเร็จ: ' + res.getContentText().substring(0, 300));
    return { uid: q.asUid, phone: q.phoneNumber, code: r.memberCode, id: r.signupId };
  }
  function row(uid) {
    var sh = ensureMembersSheet_();
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 15).getValues();
    for (var i = 0; i < v.length; i++) if (String(v[i][0]) === uid) return { row: i + 2, values: v[i] };
    return null;
  }
  function countUid(uid) {
    var sh = ensureMembersSheet_();
    return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().filter(function (r) { return String(r[0]) === uid; }).length;
  }

  var copy = DriveApp.getFileById(originalSheetId).makeCopy(
    'ทดสอบตัวเขียนสมัครสมาชิก (ลบได้) ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm'));
  try {
    MEMBERS_SHEET_ID = copy.getId();
    signupResetSheetCache_();
    sendLineMessages_ = function (to, messages) { sent.push({ to: to, messages: messages }); return { success: true }; };
    grantReferralRewardOnSignupIfNeeded_ = function () { sent.push({ grant: Array.prototype.slice.call(arguments) }); };

    // 1) เขียนปกติ 2 คน
    var a = signup(), b = signup();
    var r1 = signupWritePending_({ tests: true });
    check('เขียนปกติ: รับงาน 2 รายการ', r1.processed === 2, JSON.stringify(r1.results));
    [a, b].forEach(function (s) {
      var got = row(s.uid);
      check('แถวสมาชิก ' + s.code + ' อยู่ในชีต', !!got);
      if (!got) return;
      check('รหัส/เบอร์ตรง ' + s.code, String(got.values[12]) === s.code && String(got.values[3]) === s.phone,
        'รหัส ' + got.values[12] + ' เบอร์ ' + got.values[3]);
      var fmt = ensureMembersSheet_().getRange(got.row, 4).getNumberFormat();
      var sh = ensureMembersSheet_(), scratch = sh.getRange(sh.getLastRow() + 5, 4);
      scratch.setNumberFormat('@STRING@');
      var want = scratch.getNumberFormat();
      scratch.clearFormat();
      check('รูปแบบเซลล์เบอร์ ' + s.code, fmt === want, 'ได้ "' + fmt + '" ต้องการ "' + want + '"');
      check('ข้อความต้อนรับส่งถึง ' + s.code, sent.filter(function (m) { return m.to === s.uid; }).length === 1);
    });

    // 2) สั่งซ้ำ: ไม่มีงานค้าง ไม่เขียนซ้ำ
    var r2 = signupWritePending_({ tests: true });
    check('สั่งซ้ำไม่เขียนซ้ำ', r2.processed === 0 && countUid(a.uid) === 1 && countUid(b.uid) === 1, JSON.stringify(r2.results));

    // 3) ค้างกลางทาง: แถวอยู่ในชีตแล้วแต่ยังไม่ได้รายงาน -> ไม่เขียนซ้ำ และส่งข้อความต้อนรับครั้งเดียว
    var c = signup();
    var claimed = signupRpc_(cfg, 'signup_claim', { p_tests: true, p_limit: 1 })[0];
    signupApplyJournal_(SpreadsheetApp.openById(MEMBERS_SHEET_ID), claimed.journal, claimed.base_rows);
    signupRpc_(cfg, 'signup_update', { p_id: claimed.id, p_patch: { release: true } });
    var r3 = signupWritePending_({ tests: true });
    check('ค้างกลางทาง: ไม่เขียนซ้ำ', countUid(c.uid) === 1, JSON.stringify(r3.results));
    check('ค้างกลางทาง: ข้อความต้อนรับครั้งเดียว', sent.filter(function (m) { return m.to === c.uid; }).length === 1);

    // 4) รหัสชน: ทางเดิมออกรหัสเดียวกันไปก่อน -> ได้รหัสใหม่ + แจ้งแอดมิน + ข้อความต้อนรับใช้รหัสใหม่
    var d = signup();
    var sh4 = ensureMembersSheet_();
    sh4.getRange(sh4.getLastRow() + 1, 1, 1, 13).setValues([['U_signup_writer_other_' + stamp, 'ทางเดิม', '', '0990000000',
      new Date(), 0, 'start', '', '', 'ทางเดิม', '1990-01-01', 0, d.code]]);
    SpreadsheetApp.flush();
    var r4 = signupWritePending_({ tests: true });
    var gotD = row(d.uid);
    var newCode = gotD ? String(gotD.values[12]) : '';
    check('รหัสชน: ได้รหัสใหม่', gotD && newCode !== d.code && newCode.indexOf('EM-') === 0, d.code + ' -> ' + newCode);
    check('รหัสชน: แจ้งกลุ่มแอดมิน', sent.some(function (m) { return m.to === ADMIN_GROUP_ID && JSON.stringify(m.messages).indexOf(newCode) !== -1; }));
    var welcomeD = sent.filter(function (m) { return m.to === d.uid; })[0];
    check('รหัสชน: ข้อความต้อนรับใช้รหัสใหม่', welcomeD && JSON.stringify(welcomeD.messages).indexOf(newCode) !== -1 &&
      JSON.stringify(welcomeD.messages).indexOf(d.code) === -1);

    // 5) LINE ซ้ำ: ทางเดิมสร้างสมาชิก LINE เดียวกันไปก่อน -> ไม่เขียน สถานะ failed + แจ้งแอดมิน
    var e = signup();
    var sh5 = ensureMembersSheet_();
    sh5.getRange(sh5.getLastRow() + 1, 1, 1, 13).setValues([[e.uid, 'ทางเดิม', '', '0990000001', new Date(), 0, 'start', '', '',
      'ทางเดิม', '1990-01-01', 0, 'EM-OTHER']]);
    SpreadsheetApp.flush();
    var before5 = sent.length;
    var r5 = signupWritePending_({ tests: true });
    check('LINE ซ้ำ: ไม่เขียนแถวเพิ่ม', countUid(e.uid) === 1, JSON.stringify(r5.results));
    check('LINE ซ้ำ: แจ้งกลุ่มแอดมิน', sent.slice(before5).some(function (m) { return m.to === ADMIN_GROUP_ID; }));
    check('LINE ซ้ำ: ไม่ส่งข้อความต้อนรับ', !sent.slice(before5).some(function (m) { return m.to === e.uid; }));
  } catch (err) {
    fails++;
    lines.push('หยุดกลางทาง: ' + err + (err.stack ? '\n' + err.stack : ''));
  } finally {
    MEMBERS_SHEET_ID = originalSheetId;
    sendLineMessages_ = saved.send;
    grantReferralRewardOnSignupIfNeeded_ = saved.grant;
    signupResetSheetCache_();
    invalidateMembersIdentityCache_();
    try { signupRpc_(cfg, 'signup_delete_tests', {}); } catch (x) { lines.push('ลบแถวทดสอบใน Supabase ไม่สำเร็จ: ' + x); }
    copy.setTrashed(true);
  }
  lines.push(fails ? ('== ไม่ผ่าน ' + fails + ' ข้อ ==') : '== ผ่านทุกข้อ ==');
  Logger.log(lines.join('\n'));
  return { fails: fails, lines: lines };
}
