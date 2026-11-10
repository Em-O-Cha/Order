// ==================== ตั้งรหัสผ่านแต่ละแผนก (ผู้ดูแลระบบรันเองจาก editor) ====================
//
// วิธีตั้ง/เปลี่ยนรหัสผ่าน:
//   1) พิมพ์รหัสใหม่ใน NEW_PASSWORDS ด้านล่าง (เว้นว่างแผนกที่ไม่ต้องการเปลี่ยน)
//   2) เลือกฟังก์ชัน setupPasswords ด้านบน editor แล้วกด Run
//   3) ดูผลใน Execution log แล้ว "ลบรหัสออกจากไฟล์นี้ทันที" แล้วกดบันทึก
//      (ระบบเก็บไว้เป็นค่าแฮชใน Script Properties แล้ว ไม่ต้องเก็บรหัสจริงไว้ในโค้ด)
//
// กติกา: อย่างน้อย 6 ตัวอักษร และห้ามซ้ำกับรหัสของแผนกอื่น (แยกรหัสกันโดยสิ้นเชิง)

var NEW_PASSWORDS = {
  HR:   '',
  ACC:  '',
  PUR:  '',
  QA:   '',
  RD:   '',
  PROD: '',
  SHE:  '',
  LOG:  ''
};

function setupPasswords() {
  var props = PropertiesService.getScriptProperties();
  var keys = Object.keys(NEW_PASSWORDS).filter(function (k) { return NEW_PASSWORDS[k]; });
  if (!keys.length) { Logger.log('ยังไม่ได้ใส่รหัสผ่านใน NEW_PASSWORDS'); return; }

  // รหัสใหม่ในรอบนี้ห้ามซ้ำกันเอง
  var seen = {};
  keys.forEach(function (k) {
    var pw = String(NEW_PASSWORDS[k]);
    if (!findDept_(k)) throw new Error('ไม่รู้จักแผนก ' + k);
    if (pw.length < 6) throw new Error(k + ': รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
    if (seen[pw]) throw new Error(k + ': รหัสซ้ำกับแผนก ' + seen[pw]);
    seen[pw] = k;
  });

  // และห้ามซ้ำกับรหัสที่ตั้งไว้แล้วของแผนกอื่น
  keys.forEach(function (k) {
    DEPARTMENTS.forEach(function (d) {
      if (d.key === k || NEW_PASSWORDS[d.key]) return;
      var stored = props.getProperty(pwPropKey_(d.key));
      if (stored && verifyPassword_(String(NEW_PASSWORDS[k]), stored)) {
        throw new Error(k + ': รหัสซ้ำกับแผนก ' + d.key + ' ที่ตั้งไว้แล้ว');
      }
    });
  });

  keys.forEach(function (k) {
    var salt = Utilities.getUuid();
    props.setProperty(pwPropKey_(k), salt + '$' + hashPassword_(String(NEW_PASSWORDS[k]), salt));
    CacheService.getScriptCache().removeAll(['fail_' + k, 'lock_' + k]);
    Logger.log('ตั้งรหัสผ่านแผนก ' + k + ' แล้ว');
  });
  Logger.log('เสร็จแล้ว — อย่าลืมลบรหัสออกจาก NEW_PASSWORDS แล้วกดบันทึก');
}

// ดูว่าแผนกไหนตั้งรหัสแล้ว / ชีตเปิดได้หรือยัง
function checkSetup() {
  var props = PropertiesService.getScriptProperties();
  DEPARTMENTS.forEach(function (d) {
    var s = sheetStatus_(d);
    Logger.log(d.key + ' (' + d.name + ')  รหัสผ่าน: ' + (props.getProperty(pwPropKey_(d.key)) ? 'ตั้งแล้ว' : 'ยังไม่ตั้ง') +
      '  |  ชีต: ' + (s.connected ? 'เปิดได้ — ' + s.title : s.message) +
      (d.ownerEmail ? '  |  เจ้าของ: ' + d.ownerEmail : ''));
  });
}

// ปลดล็อกแผนกที่ถูกล็อกจากการใส่รหัสผิด (แก้ชื่อแผนกแล้วกด Run)
function unlockDepartment() {
  var key = 'HR';
  CacheService.getScriptCache().removeAll(['fail_' + key, 'lock_' + key]);
  Logger.log('ปลดล็อกแผนก ' + key + ' แล้ว');
}
