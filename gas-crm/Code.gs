/**
 * CRM Spunky Food - Google Apps Script version
 * ระบบ CRM สำหรับติดตามลูกค้าที่ติดต่อขอนำสินค้าไปขายต่างประเทศ
 * ฐานข้อมูล: Google Sheet (สร้างอัตโนมัติเมื่อรัน setup() ครั้งแรก)
 */

var PROPS = PropertiesService.getScriptProperties();

var SHEETS = {
  CUSTOMERS: 'Customers',
  DEALS: 'Deals',
  DOCUMENTS: 'Documents',
  FOLLOWUPS: 'Followups',
  AI_INSIGHTS: 'AIInsights',
};

var HEADERS = {
  Customers: ['ID', 'Type', 'Status', 'Name', 'CompanyName', 'TaxID', 'ContactPerson', 'Phone', 'Email', 'LineID', 'Address', 'Country', 'ContactChannel', 'SourceDetail', 'Notes', 'CreatedAt', 'UpdatedAt'],
  Deals: ['ID', 'CustomerID', 'Title', 'Stage', 'ProductInterest', 'ActualProducts', 'EstimatedValue', 'Currency', 'ExpectedCloseDate', 'DeliveryDate', 'Status', 'Notes', 'RevenueExported', 'CreatedAt', 'UpdatedAt'],
  Documents: ['ID', 'CustomerID', 'DealID', 'DocType', 'DocNumber', 'FileUrl', 'FileName', 'IssueDate', 'ExpiryDate', 'DeliveryDate', 'Amount', 'Currency', 'Notes', 'CreatedAt'],
  Followups: ['ID', 'CustomerID', 'DealID', 'Type', 'Note', 'FollowUpDate', 'Done', 'CreatedAt'],
  AIInsights: ['ID', 'CustomerID', 'Approach', 'RecommendedProducts', 'RiskLevel', 'NextAction', 'CreatedAt'],
};

// ===================== ตั้งค่าเริ่มต้น =====================

/**
 * รันฟังก์ชันนี้ 1 ครั้งจากเมนู Run เพื่อสร้าง Google Sheet ฐานข้อมูล
 * (ครั้งแรกจะขอสิทธิ์การเข้าถึง กด Allow ได้เลย)
 */
function setup() {
  var ss = getOrCreateSpreadsheet();
  Object.keys(HEADERS).forEach(function (name) {
    ensureSheet(ss, name, HEADERS[name]);
  });
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
  Logger.log('ตั้งค่าเสร็จแล้ว เปิดฐานข้อมูลได้ที่: ' + ss.getUrl());
  return ss.getUrl();
}

// แคชไว้ในตัวแปรระดับสคริปต์ เพื่อไม่ต้องเปิดสเปรดชีตซ้ำหลายรอบในคำขอเดียวกัน (แต่ละคำขอ/แต่ละครั้งที่เว็บเรียกมา
// จะเริ่มบริบทการทำงานใหม่อยู่แล้ว ตัวแปรนี้จึงไม่มีข้อมูลค้างข้ามคำขอ) การเปิดสเปรดชีตคือส่วนที่ช้าที่สุด
// (ต้องติดต่อ Google ผ่านเน็ตเวิร์ก) ในขณะที่ getCustomerDetail/getDashboard เรียก getSheet() หลายสิบครั้งต่อครั้ง
// ถ้าเปิดใหม่ทุกครั้งจะทำให้เว็บหน่วงมากแม้ข้อมูลจะยังน้อยก็ตาม
var _cachedSpreadsheet = null;
var _cachedSheets = {};

function getOrCreateSpreadsheet() {
  if (_cachedSpreadsheet) return _cachedSpreadsheet;
  var id = PROPS.getProperty('SPREADSHEET_ID');
  if (id) {
    try {
      _cachedSpreadsheet = SpreadsheetApp.openById(id);
      return _cachedSpreadsheet;
    } catch (e) { /* fallthrough */ }
  }
  var ss = SpreadsheetApp.create('CRM Spunky Food Database');
  PROPS.setProperty('SPREADSHEET_ID', ss.getId());
  _cachedSpreadsheet = ss;
  return ss;
}

function ensureSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    SpreadsheetApp.flush();
    return sheet;
  }
  // ถ้าเคยสร้างชีตนี้ไว้แล้วแต่ยังขาดคอลัมน์ใหม่ (เช่นอัปเดตโค้ดภายหลัง) ให้เติมคอลัมน์ที่ขาดไปต่อท้าย
  // โดยไม่แตะข้อมูลเดิม
  var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var missing = headers.filter(function (h) { return existingHeaders.indexOf(h) === -1; });
  if (missing.length) {
    sheet.getRange(1, existingHeaders.length + 1, 1, missing.length).setValues([missing]);
    SpreadsheetApp.flush();
  }
  return sheet;
}

function getSheet(name) {
  if (_cachedSheets[name]) return _cachedSheets[name];
  var ss = getOrCreateSpreadsheet();
  var sheet = ensureSheet(ss, name, HEADERS[name]);
  _cachedSheets[name] = sheet;
  return sheet;
}

// ===================== Sheet helper ทั่วไป =====================

// Google Sheets แปลงข้อความที่หน้าตาเหมือนวันที่ (เช่น "2026-09-05" จาก <input type="date">)
// ให้กลายเป็นเซลล์ชนิด Date ให้เองอัตโนมัติ ทำให้ตอนอ่านกลับมาได้ Date object แทนสตริง
// ซึ่ง google.script.run บางครั้งส่งค่ากลับไปฝั่งหน้าเว็บไม่สำเร็จ (ได้ null แทน) จึงต้องแปลงกลับเป็น
// ข้อความรูปแบบ yyyy-MM-dd เสมอก่อนส่งออกจากชั้นนี้
function normalizeCellValue(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return v;
}

function sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var rows = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = normalizeCellValue(row[i]); });
    rows.push(obj);
  }
  return rows;
}

function appendObject(sheet, obj) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  sheet.appendRow(row);
  SpreadsheetApp.flush();
}

function findRowById(sheet, id) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('ID');
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][idCol]) === String(id)) return r + 1; // 1-based sheet row
  }
  return -1;
}

function updateObjectById(sheetName, id, patch) {
  var sheet = getSheet(sheetName);
  var row = findRowById(sheet, id);
  if (row === -1) throw new Error('ไม่พบข้อมูล id=' + id + ' ใน ' + sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  headers.forEach(function (h, i) {
    if (patch.hasOwnProperty(h)) sheet.getRange(row, i + 1).setValue(patch[h]);
  });
  SpreadsheetApp.flush();
  return getObjectById(sheetName, id);
}

function deleteObjectById(sheetName, id) {
  var sheet = getSheet(sheetName);
  var row = findRowById(sheet, id);
  if (row !== -1) sheet.deleteRow(row);
  SpreadsheetApp.flush();
  return { ok: true };
}

function getObjectById(sheetName, id) {
  var list = sheetToObjects(getSheet(sheetName));
  for (var i = 0; i < list.length; i++) if (String(list[i].ID) === String(id)) return list[i];
  return null;
}

function nowIso() {
  return new Date().toISOString();
}

function todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ===================== Web app entry =====================

function doGet(e) {
  // Apps Script อาจเปลี่ยน POST เป็น GET ระหว่าง redirect ภายใน (ทำให้ doGet ถูกเรียกแทน doPost จริง ๆ)
  // ถ้ามี e.parameter.payload มาด้วย แปลว่านี่คือการเรียก API ไม่ใช่การเปิดหน้าเว็บปกติ ให้ประมวลผลแบบ API แทน
  if (e && e.parameter && e.parameter.payload) {
    return handleApiRequest(e);
  }
  // Index.html ไม่มี GAS scriptlet แล้ว (ย้ายไปเรียกทุกอย่างผ่าน API แทน เพื่อให้ไฟล์เดียวกัน
  // ใช้ได้ทั้งตอนเปิดตรงจาก Apps Script และตอนฝากไว้ที่อื่น เช่น GitHub Pages)
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('CRM Spunky Food')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** โหลดโลโก้บริษัทจาก Google Drive มาฝังในหน้าเว็บโดยตรง (แปลงเป็น base64) */
function getLogoDataUri() {
  var fileId = PROPS.getProperty('LOGO_FILE_ID') || '19swmOZR5ClYcKqzUuMJLo7kkIaZ-vK7u';
  try {
    var blob = DriveApp.getFileById(fileId).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    Logger.log('โหลดโลโก้ไม่สำเร็จ: ' + e.message);
    return '';
  }
}

/** ทดสอบว่าโหลดโลโก้จาก Google Drive ได้จริงหรือไม่ พร้อมข้อความ error ที่ชัดเจนสำหรับผู้ใช้ */
function testLogoConnection() {
  var fileId = PROPS.getProperty('LOGO_FILE_ID') || '19swmOZR5ClYcKqzUuMJLo7kkIaZ-vK7u';
  try {
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var byteCount = blob.getBytes().length;
    var okData = byteCount > 0 && String(blob.getContentType() || '').indexOf('image/') === 0;
    return {
      ok: okData,
      fileId: fileId,
      fileName: file.getName ? file.getName() : '',
      contentType: blob.getContentType(),
      byteCount: byteCount,
      message: okData
        ? 'โหลดโลโก้สำเร็จ (' + (file.getName ? file.getName() : fileId) + ', ' + blob.getContentType() + ', ' + byteCount + ' bytes)'
        : 'เปิดไฟล์ได้ แต่ไฟล์นี้ไม่ใช่รูปภาพที่ใช้งานได้ (ประเภทไฟล์: ' + blob.getContentType() + ', ขนาด: ' + byteCount + ' bytes) — ลองอัปโหลดไฟล์ PNG/JPG ใหม่แทนไฟล์เดิม'
    };
  } catch (e) {
    return {
      ok: false,
      fileId: fileId,
      message: 'โหลดโลโก้ไม่สำเร็จ: ' + e.message + ' — ตรวจสอบว่า Share ไฟล์นี้ให้บัญชีที่รัน Apps Script นี้เห็น (อย่างน้อยระดับ "ดูได้"/Viewer) และ File ID ถูกต้อง'
    };
  }
}

// ===================== Meta / dropdown =====================

function getMeta() {
  var currentUser = '';
  try { currentUser = Session.getActiveUser().getEmail(); } catch (e) { /* ไม่มีสิทธิ์อ่าน ก็ข้ามได้ */ }
  return {
    currentUser: currentUser || 'ผู้ใช้งาน',
    countries: COUNTRIES,
    channels: CONTACT_CHANNELS,
    customerTypes: [
      { value: 'individual', label: 'บุคคลธรรมดา' },
      { value: 'company', label: 'บริษัท' },
    ],
    dealStages: DEAL_STAGES,
    documentTypes: [
      { value: 'quotation', label: 'ใบเสนอราคา' },
      { value: 'po', label: 'ใบสั่งซื้อ (PO)' },
      { value: 'invoice', label: 'ใบแจ้งหนี้' },
      { value: 'payment_slip', label: 'สลิปการโอนเงิน' },
      { value: 'delivery_note', label: 'ใบส่งของ' },
      { value: 'goods_receipt', label: 'ใบรับสินค้า' },
      { value: 'receipt', label: 'ใบเสร็จ' },
    ],
    followupTypes: [
      { value: 'call', label: 'โทรศัพท์' },
      { value: 'email', label: 'อีเมล' },
      { value: 'meeting', label: 'นัดพบ/ประชุม' },
      { value: 'line_oa', label: 'LINE Official' },
      { value: 'messenger', label: 'Messenger (Facebook)' },
      { value: 'tiktok', label: 'TikTok' },
      { value: 'note', label: 'บันทึกอื่น ๆ' },
    ],
  };
}

var OPEN_STAGES = ['new', 'contacted', 'quoted', 'negotiating', 'po_received'];

var DEAL_STAGES = [
  { value: 'new', label: 'ลูกค้าใหม่' },
  { value: 'contacted', label: 'ติดต่อแล้ว' },
  { value: 'quoted', label: 'ส่งใบเสนอราคาแล้ว' },
  { value: 'negotiating', label: 'กำลังเจรจา' },
  { value: 'po_received', label: 'ได้รับ PO แล้ว' },
  { value: 'won', label: 'ปิดการขายสำเร็จ' },
  { value: 'lost', label: 'ปิดดีลไม่สำเร็จ' },
];

var CONTACT_CHANNELS = [
  'Facebook', 'Line', 'Line Shop', 'Website', 'Email', 'โทรศัพท์',
  'Shopee', 'TikTok', 'Google', '7-Eleven',
  'Alibaba.com', 'LinkedIn', 'WhatsApp', 'WeChat',
  'งานแสดงสินค้า (Trade Show)', 'เพื่อนแนะนำ (Referral)', 'อื่น ๆ',
];

// ===================== Customers =====================

function listCustomers(filter) {
  filter = filter || {};
  var customers = sheetToObjects(getSheet(SHEETS.CUSTOMERS));
  var deals = sheetToObjects(getSheet(SHEETS.DEALS));

  if (filter.query) {
    var q = filter.query.toLowerCase();
    customers = customers.filter(function (c) {
      return [c.Name, c.CompanyName, c.ContactPerson, c.Phone, c.Email].some(function (v) {
        return v && String(v).toLowerCase().indexOf(q) !== -1;
      });
    });
  }
  if (filter.country) customers = customers.filter(function (c) { return c.Country === filter.country; });
  if (filter.type) customers = customers.filter(function (c) { return c.Type === filter.type; });

  var reminderCountByCustomer = {};
  computeReminders().forEach(function (r) { reminderCountByCustomer[r.customerId] = (reminderCountByCustomer[r.customerId] || 0) + 1; });

  customers.forEach(function (c) {
    var cDeals = deals.filter(function (d) { return d.CustomerID === c.ID; });
    var mainDeal = cDeals[0];
    c.dealCount = cDeals.length;
    c.currentStage = c.Status || (mainDeal ? mainDeal.Stage : 'new');
    c.reminderCount = reminderCountByCustomer[c.ID] || 0;
    // สินค้า: ถ้าปิดการขายสำเร็จแล้วโชว์สินค้าที่ขายได้จริง ถ้ายังไม่ปิดโชว์สินค้าที่เสนอราคาไป
    c.products = mainDeal ? (mainDeal.Status === 'won' ? (mainDeal.ActualProducts || mainDeal.ProductInterest) : mainDeal.ProductInterest) : '';
  });

  customers.sort(function (a, b) { return (b.UpdatedAt || '').localeCompare(a.UpdatedAt || ''); });
  return customers;
}

function createCustomer(data) {
  if (!data.Type || !data.Name) throw new Error('ต้องระบุประเภทลูกค้าและชื่อ');
  var obj = {
    ID: Utilities.getUuid(),
    Type: data.Type,
    Status: data.Status || 'new',
    Name: data.Name,
    CompanyName: data.CompanyName || '',
    TaxID: data.TaxID || '',
    ContactPerson: data.ContactPerson || '',
    Phone: data.Phone || '',
    Email: data.Email || '',
    LineID: data.LineID || '',
    Address: data.Address || '',
    Country: data.Country || '',
    ContactChannel: data.ContactChannel || '',
    SourceDetail: data.SourceDetail || '',
    Notes: data.Notes || '',
    CreatedAt: nowIso(),
    UpdatedAt: nowIso(),
  };
  appendObject(getSheet(SHEETS.CUSTOMERS), obj);
  return obj;
}

function updateCustomer(id, data) {
  data.UpdatedAt = nowIso();
  return updateObjectById(SHEETS.CUSTOMERS, id, data);
}

/**
 * เปลี่ยน "สถานะลูกค้า" จุดเดียวจากหน้ารายชื่อ/รายละเอียดลูกค้า
 * ถ้าลูกค้ามีดีลที่เปิดอยู่ จะอัปเดตสถานะของดีลนั้นให้ตรงกันอัตโนมัติ (เพื่อให้สถิติในแดชบอร์ดถูกต้อง)
 */
function updateCustomerStatus(customerId, status) {
  updateObjectById(SHEETS.CUSTOMERS, customerId, { Status: status, UpdatedAt: nowIso() });
  var openDeal = sheetToObjects(getSheet(SHEETS.DEALS))
    .filter(function (d) { return d.CustomerID === customerId && d.Status === 'open'; })[0];
  if (openDeal) {
    var patch = { Stage: status, UpdatedAt: nowIso() };
    if (status === 'won' || status === 'lost') patch.Status = status;
    var updatedDeal = updateObjectById(SHEETS.DEALS, openDeal.ID, patch);
    maybeExportWonDealToRevenue(openDeal, updatedDeal);
  }
  return getObjectById(SHEETS.CUSTOMERS, customerId);
}

function deleteCustomer(id) {
  deleteObjectById(SHEETS.CUSTOMERS, id);
  ['Deals', 'Documents', 'Followups', 'AIInsights'].forEach(function (sheetName) {
    var sheet = getSheet(sheetName);
    var rows = sheetToObjects(sheet);
    rows.forEach(function (row) {
      if (row.CustomerID === id) deleteObjectById(sheetName, row.ID);
    });
  });
  return { ok: true };
}

function getCustomerDetail(id) {
  var customer = getObjectById(SHEETS.CUSTOMERS, id);
  if (!customer) throw new Error('ไม่พบลูกค้า');
  var deals = sheetToObjects(getSheet(SHEETS.DEALS)).filter(function (d) { return d.CustomerID === id; });
  var documents = sheetToObjects(getSheet(SHEETS.DOCUMENTS)).filter(function (d) { return d.CustomerID === id; });
  var followups = sheetToObjects(getSheet(SHEETS.FOLLOWUPS)).filter(function (f) { return f.CustomerID === id; });
  var insights = sheetToObjects(getSheet(SHEETS.AI_INSIGHTS)).filter(function (i) { return i.CustomerID === id; })
    .sort(function (a, b) { return b.CreatedAt.localeCompare(a.CreatedAt); });
  customer.deals = deals;
  customer.documents = documents;
  customer.followups = followups;
  customer.insights = insights;
  customer.reminders = computeReminders().filter(function (r) { return r.customerId === id; });
  return customer;
}

// ===================== Deals =====================

function createDeal(customerId, data) {
  var customer = getObjectById(SHEETS.CUSTOMERS, customerId);
  if (!customer) throw new Error('ไม่พบลูกค้า');
  var obj = {
    ID: Utilities.getUuid(),
    CustomerID: customerId,
    Title: data.Title || ('ดีล ' + customer.Name),
    Stage: data.Stage || 'new',
    ProductInterest: data.ProductInterest || '',
    EstimatedValue: Number(data.EstimatedValue) || 0,
    Currency: data.Currency || 'THB',
    ExpectedCloseDate: data.ExpectedCloseDate || '',
    DeliveryDate: data.DeliveryDate || '',
    Status: data.Status || 'open',
    Notes: data.Notes || '',
    CreatedAt: nowIso(),
    UpdatedAt: nowIso(),
  };
  appendObject(getSheet(SHEETS.DEALS), obj);
  updateObjectById(SHEETS.CUSTOMERS, customerId, { UpdatedAt: nowIso() });
  return obj;
}

function updateDeal(id, data) {
  var before = getObjectById(SHEETS.DEALS, id);
  data.UpdatedAt = nowIso();
  if (data.Stage === 'won' || data.Stage === 'lost') data.Status = data.Stage;
  var updated = updateObjectById(SHEETS.DEALS, id, data);
  maybeExportWonDealToRevenue(before, updated);
  if (data.Stage) {
    updateObjectById(SHEETS.CUSTOMERS, updated.CustomerID, { Status: data.Stage, UpdatedAt: nowIso() });
  }
  return updated;
}

function deleteDeal(id) {
  return deleteObjectById(SHEETS.DEALS, id);
}

// ===================== Followups =====================

function createFollowup(customerId, data) {
  var customer = getObjectById(SHEETS.CUSTOMERS, customerId);
  if (!customer) throw new Error('ไม่พบลูกค้า');
  var obj = {
    ID: Utilities.getUuid(),
    CustomerID: customerId,
    DealID: data.DealID || '',
    Type: data.Type || 'note',
    Note: data.Note || '',
    FollowUpDate: data.FollowUpDate || '',
    Done: false,
    CreatedAt: nowIso(),
  };
  appendObject(getSheet(SHEETS.FOLLOWUPS), obj);
  return obj;
}

function updateFollowup(id, data) {
  return updateObjectById(SHEETS.FOLLOWUPS, id, data);
}

function deleteFollowup(id) {
  return deleteObjectById(SHEETS.FOLLOWUPS, id);
}
