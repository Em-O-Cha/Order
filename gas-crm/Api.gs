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
  updateDocument: updateDocument,
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
  getCampaignOptions: getCampaignOptions,
  getCustomerTypeOptions: getCustomerTypeOptions,
  getProvinces: getProvinces,
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
 * จุดเข้าถึงแบบ HTTP API สำหรับหน้าเว็บที่ฝากไว้ที่อื่น (เช่น GitHub Pages)
 * ต้องส่งมาเป็น form field ชื่อ "payload" ที่เป็น JSON string ของ { token, fn, args } — token ต้องตรงกับ API_TOKEN ที่ตั้งไว้ในหน้าตั้งค่า
 * ถ้ามี viaIframe: true และ requestId มาด้วย จะตอบกลับเป็นหน้า HTML เล็ก ๆ ที่เรียก top.postMessage() แทนการตอบ JSON ตรง ๆ
 * (ใช้แก้ปัญหา Apps Script Web App ไม่ส่ง CORS header ที่เชื่อถือได้เวลาเรียกข้ามโดเมนด้วย fetch — ฟอร์ม/iframe/postMessage ไม่ถูกจำกัดโดย CORS)
 *
 * สำคัญ: Apps Script เปลี่ยน POST เป็น GET ระหว่าง redirect ภายในได้ (ทำให้ doGet ถูกเรียกแทน doPost จริง ๆ)
 * เพื่อไม่ให้พังตอนนั้น ทั้ง doGet และ doPost จะเช็คว่ามี e.parameter.payload มาไหม ถ้ามีคือ "เรียก API" ให้ประมวลผลแบบเดียวกันเสมอ
 * ไม่ว่าจริง ๆ แล้ว Apps Script จะเรียกเข้าทาง handler ไหนก็ตาม — ต่างจากตอนเปิดแอปปกติที่ doGet จะ serve หน้าเว็บแทน
 */
function handleApiRequest(e) {
  var response;
  var body = {};
  try {
    var rawPayload = (e && e.parameter && e.parameter.payload)
      ? e.parameter.payload
      : ((e && e.postData && e.postData.contents) || '{}');
    body = JSON.parse(rawPayload);
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

  if (body.viaIframe) {
    var messageObj = { __crmApiResponse: true, requestId: body.requestId, ok: response.ok, result: response.result, error: response.error };
    // กัน payload ที่มี "</script" อยู่ข้างในทำลาย HTML ก่อนถึง JS parser (เช่น หมายเหตุลูกค้าที่พิมพ์คำนี้ไว้)
    var safeJson = JSON.stringify(messageObj).replace(/<\/script/gi, '<\\/script');
    // ใช้ top.postMessage (ไม่ใช่ parent) เพราะ Apps Script serve หน้า HtmlService ผ่าน iframe sandbox
    // ของ Google เองอีกชั้นเสมอ — parent จะชี้ไปที่ iframe ของ Google เอง ไม่ใช่หน้าเว็บของเราจริง ๆ
    var html = '<script>top.postMessage(' + safeJson + ", '*');<\/script>";
    return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  return handleApiRequest(e);
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
