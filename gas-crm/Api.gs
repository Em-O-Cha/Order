/**
 * ตัวกลางเรียกฟังก์ชันฝั่งเซิร์ฟเวอร์จากหน้าเว็บ (Index.html)
 * หน้าเว็บเรียกผ่าน apiCall('ชื่อฟังก์ชัน', [อาร์กิวเมนต์]) เพียงจุดเดียว เพื่อให้โค้ดฝั่ง client เรียบง่าย
 */
var API_FUNCTIONS = {
  getMeta: getMeta,
  listCustomers: listCustomers,
  createCustomer: createCustomer,
  updateCustomer: updateCustomer,
  updateCustomerStatus: updateCustomerStatus,
  deleteCustomer: deleteCustomer,
  getCustomerDetail: getCustomerDetail,
  createDeal: createDeal,
  updateDeal: updateDeal,
  deleteDeal: deleteDeal,
  createFollowup: createFollowup,
  updateFollowup: updateFollowup,
  deleteFollowup: deleteFollowup,
  uploadDocument: uploadDocument,
  deleteDocument: deleteDocument,
  getDashboard: getDashboard,
  sendDailyReportNow: sendDailyReportNow,
  installDailyTrigger: installDailyTrigger,
  removeDailyTrigger: removeDailyTrigger,
  installWeeklyTrigger: installWeeklyTrigger,
  removeWeeklyTrigger: removeWeeklyTrigger,
  installMonthlyTrigger: installMonthlyTrigger,
  removeMonthlyTrigger: removeMonthlyTrigger,
  analyzeCustomerAI: analyzeCustomerAI,
  analyzeAllOpenCustomers: analyzeAllOpenCustomers,
  getSkus: getSkus,
  testExportDealToRevenue: testExportDealToRevenue,
  testMasterDataConnection: testMasterDataConnection,
  testLogoConnection: testLogoConnection,
  previewDailyReport: previewDailyReport,
  getAdOptions: getAdOptions,
  getPaymentOptions: getPaymentOptions,
  closeDealWon: closeDealWon,
  getSettings: getSettings,
  saveSettings: saveSettings,
  generateApiToken: generateApiToken,
  getWebAppUrl: getWebAppUrl,
};

function apiCall(name, args) {
  var fn = API_FUNCTIONS[name];
  if (!fn) throw new Error('ไม่พบฟังก์ชัน: ' + name);
  return fn.apply(null, args || []);
}

/**
 * จุดเข้าถึงแบบ HTTP API สำหรับหน้าเว็บที่ฝากไว้ที่อื่น (เช่น GitHub Pages) เรียกเข้ามาผ่าน fetch()
 * ต้องส่ง JSON แบบ POST มาเป็น { token, fn, args } — token ต้องตรงกับ API_TOKEN ที่ตั้งไว้ในหน้าตั้งค่า
 * ใช้ content-type "text/plain" ฝั่ง client เพื่อเลี่ยง CORS preflight (ตัว Apps Script เองไม่รองรับ custom header ใน OPTIONS)
 */
function doPost(e) {
  var response;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var storedToken = PROPS.getProperty('API_TOKEN');
    if (body.fn === 'generateApiToken') {
      // สร้าง Token ครั้งแรกได้โดยไม่ต้องมี Token เดิม แต่ถ้ามีอยู่แล้วต้องยืนยันด้วย Token เดิมก่อน กันคนอื่นมาสร้างทับ
      if (storedToken && body.token !== storedToken) throw new Error('API Token ไม่ถูกต้อง (มี Token อยู่แล้ว ต้องยืนยันด้วย Token เดิมก่อนสร้างใหม่)');
      response = { ok: true, result: generateApiToken() };
    } else {
      checkApiToken(body.token);
      response = { ok: true, result: apiCall(body.fn, body.args) };
    }
  } catch (err) {
    response = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

function checkApiToken(token) {
  var expected = PROPS.getProperty('API_TOKEN');
  if (!expected) throw new Error('ยังไม่ได้สร้าง API Token ในหน้าตั้งค่า (กด "สร้าง API Token" ก่อน)');
  if (!token || token !== expected) throw new Error('API Token ไม่ถูกต้อง');
}

/** สุ่ม Token ใหม่สำหรับให้หน้าเว็บภายนอก (เช่น GitHub Pages) ใช้เรียก API นี้ */
function generateApiToken() {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PROPS.setProperty('API_TOKEN', token);
  return token;
}

/** คืนค่า URL ของเว็บแอปนี้เอง (ใช้ก็อปไปตั้งเป็น Web App URL ในหน้าเว็บที่ฝากไว้บน GitHub Pages) */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}
