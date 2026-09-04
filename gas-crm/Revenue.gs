/**
 * ส่งออกข้อมูลดีลที่ "ปิดการขายสำเร็จ" ไปบันทึกในระบบ Revenue (Google Sheet แยกต่างหาก) โดยอัตโนมัติ
 * เพิ่มแถวใหม่ตามโครงสร้างคอลัมน์ของชีต Revenue ที่มีอยู่แล้ว โดยไม่แตะข้อมูลเดิม
 */

var REVENUE_SHEET_ID_DEFAULT = '1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY';
var REVENUE_TAB_DEFAULT = 'Revenue';

function getRevenueSettings() {
  return {
    sheetId: PROPS.getProperty('REVENUE_SHEET_ID') || REVENUE_SHEET_ID_DEFAULT,
    tabName: PROPS.getProperty('REVENUE_SHEET_TAB') || REVENUE_TAB_DEFAULT,
  };
}

function getRevenueSheet() {
  var settings = getRevenueSettings();
  var ss = SpreadsheetApp.openById(settings.sheetId);
  return ss.getSheetByName(settings.tabName) || ss.getSheets()[0];
}

function countryLabelFor(code) {
  var found = COUNTRIES.filter(function (c) { return c.code === code; })[0];
  return found ? found.th : (code || '');
}

function findRevenueRowIndex(sheet, revenueId) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('Revenue ID');
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][idCol]) === String(revenueId)) return r + 1; // 1-based sheet row
  }
  return -1;
}

/**
 * เมื่อแก้ไขดีล/ลูกค้าที่ปิดการขายสำเร็จไปแล้ว (มีแถวใน Revenue อยู่แล้ว) ให้ซิงก์ข้อมูลกลับไปที่แถวนั้นด้วย
 * ซิงก์เฉพาะคอลัมน์ที่มีข้อมูลต้นทางอยู่จริงในระบบ CRM (ชื่อ/เบอร์โทร/ที่อยู่/LINE/สินค้า/หมายเหตุ)
 * ไม่แตะคอลัมน์ที่กรอกเฉพาะในชีต Revenue เอง เช่น Bill Total, Payment, เลขพัสดุ, สถานะจัดส่ง ฯลฯ
 * เพราะไม่มีข้อมูลต้นทางฝั่ง CRM ให้ซิงก์กลับ (กรอกครั้งเดียวตอนปิดการขาย หรือกรอกตรงในชีตโดยทีมอื่น)
 */
function syncDealToRevenueRow(dealId) {
  var deal = getObjectById(SHEETS.DEALS, dealId);
  if (!deal || !deal.RevenueExported) return;
  var customer = getObjectById(SHEETS.CUSTOMERS, deal.CustomerID);
  if (!customer) return;

  var sheet = getRevenueSheet();
  var rowIndex = findRevenueRowIndex(sheet, deal.RevenueExported);
  if (rowIndex === -1) return; // แถวอาจถูกลบ/เปลี่ยนเลขไปแล้วในชีตโดยตรง ข้ามได้ ไม่ต้อง error

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var customerName = customer.Type === 'company' ? (customer.CompanyName || customer.Name) : customer.Name;
  var customerCountryLabel = countryLabelFor(customer.Country);
  var exportCountryLabel = countryLabelFor(deal.ExportCountry || customer.Country);

  var patch = {
    'ProductName': deal.ActualProducts || deal.ProductInterest || deal.Title,
    'Customer Name': customerName,
    'Phone Number': customer.Phone || '',
    'Customer Address': (customer.Address || '') + (customerCountryLabel ? ' (' + customerCountryLabel + ')' : ''),
    'LINE UID': customer.LineID || '',
    'Remark': (deal.Notes || '') + (exportCountryLabel ? ' | ประเทศปลายทาง: ' + exportCountryLabel : ''),
  };

  headers.forEach(function (h, i) {
    if (patch.hasOwnProperty(h)) sheet.getRange(rowIndex, i + 1).setValue(patch[h]);
  });
  SpreadsheetApp.flush();
}

/** เรียกตอนแก้ไขข้อมูลลูกค้า เพื่อซิงก์ทุกดีลที่ปิดการขายสำเร็จแล้วของลูกค้ารายนี้กลับไปที่ Revenue */
function syncCustomerDealsToRevenue(customerId) {
  var deals = sheetToObjects(getSheet(SHEETS.DEALS))
    .filter(function (d) { return d.CustomerID === customerId && d.RevenueExported; });
  deals.forEach(function (d) { syncDealToRevenueRow(d.ID); });
}

/**
 * ต่อเลขที่บิลจากคอลัมน์ "Revenue ID" เดิมในชีต ให้อยู่รูปแบบเดียวกับที่ใช้อยู่แล้ว (เช่น REV6907001)
 * คือ REV + ปี พ.ศ. 2 หลักท้าย + เดือน 2 หลัก + เลขรันต่อจากตัวสูงสุดของเดือนนั้น
 * หมายเหตุ: ถ้ามีระบบอื่น (เช่นตัวซิงก์ออเดอร์ปลีก) เขียนแถวใหม่พร้อมกันในจังหวะเดียวกันพอดี
 * มีโอกาสชนกันได้เล็กน้อย (ข้อจำกัดร่วมของการต่อเลขรันในชีตเดียวกันจากหลายระบบ)
 */
function generateRevenueId(sheet) {
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  // เลขบิลเดิมในชีต Revenue ใช้ปี พ.ศ. ไม่ใช่ปี ค.ศ. (เช่น REV6909xxx = เดือน 09 ปี 2569) ต้องบวก 543 ก่อนตัดปี 2 หลัก
  // ไม่งั้นจะได้ prefix คนละชุดกับเลขบิลเดิม ทำให้เลขบิลไม่ต่อเนื่องกัน
  var buddhistYear = Number(Utilities.formatDate(now, tz, 'yyyy')) + 543;
  var yy = String(buddhistYear).slice(-2);
  var mm = Utilities.formatDate(now, tz, 'MM');
  var prefix = 'REV' + yy + mm;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('Revenue ID');
  var maxSeq = 0;
  if (idCol !== -1) {
    for (var r = 1; r < data.length; r++) {
      var val = String(data[r][idCol] || '');
      if (val.indexOf(prefix) === 0) {
        var seq = parseInt(val.slice(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
  }
  var seqStr = String(maxSeq + 1);
  while (seqStr.length < 3) seqStr = '0' + seqStr;
  return prefix + seqStr;
}

/**
 * อ่านรายการตัวเลือก (คอลัมน์แรก ไม่รวมหัวตาราง) จากแท็บหนึ่ง ๆ ในสเปรดชีต Master Data Sales
 * ใช้กับลิสต์ Ad / Payment ที่ผู้ใช้ดูแลอยู่แล้วในไฟล์นั้น
 */
function getMasterDataList(tabName) {
  try {
    var sheetId = getSkuSettings().sheetId;
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) return [];
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    return values.slice(1)
      .map(function (r) { return r[0]; })
      .filter(function (v) { return v !== '' && v !== null && v !== undefined; })
      .map(String);
  } catch (e) {
    Logger.log('อ่านรายการจากแท็บ "' + tabName + '" ไม่สำเร็จ: ' + e.message);
    return [];
  }
}

function getAdOptions() {
  return getMasterDataList(PROPS.getProperty('AD_LIST_TAB') || 'AD');
}

function getPaymentOptions() {
  var list = getMasterDataList(PROPS.getProperty('PAYMENT_LIST_TAB') || 'Payment');
  if (list.length) return list;
  list = getMasterDataList('PaymentType'); // ชื่อแท็บทางเลือกที่พบได้บ่อย
  if (list.length) return list;
  // ค่าเริ่มต้นสำรอง เผื่อยังหาแท็บที่ถูกต้องไม่เจอ (แก้ชื่อแท็บได้ในหน้าตั้งค่า)
  return ['Transfer', 'Credit Card/ Debit Card', 'Cash', 'Spaylater', 'เก็บเงินปลายทาง',
    'ตัดบัญชีธนาคาร', 'TrueMoney', 'MobileBanking', 'QR พร้อมเพย์'];
}

function getCampaignOptions() {
  return getMasterDataList(PROPS.getProperty('CAMPAIGN_LIST_TAB') || 'Campaign');
}

function getCustomerTypeOptions() {
  var configured = PROPS.getProperty('CUSTOMER_TYPE_LIST_TAB');
  if (configured) return getMasterDataList(configured);
  var list = getMasterDataList('CustomerType');
  if (list.length) return list;
  return getMasterDataList('Customer'); // ชื่อแท็บทางเลือกที่พบได้บ่อย (ไฟล์บางฉบับตั้งชื่อแท็บว่า "Customer" เฉย ๆ)
}

function getProvinces() {
  return THAI_PROVINCES;
}

/**
 * ตรวจสอบว่าดีลนี้เพิ่งเปลี่ยนเป็น "ปิดการขายสำเร็จ" (won) หรือไม่ (เทียบสถานะก่อน/หลัง)
 * ใช้เป็นทางสำรองสำหรับจุดที่ไม่ได้ผ่านหน้าต่างปิดการขาย (closeDealWon) เช่นการตั้งสถานะลูกค้าด่วนจากหน้ารายชื่อ
 * ห่อด้วย try/catch เพื่อไม่ให้การอัปเดตดีลล้มเหลวไปด้วยหาก Revenue sheet มีปัญหา (เช่น สิทธิ์เข้าถึง)
 */
function maybeExportWonDealToRevenue(before, after) {
  if (!after || after.RevenueExported) return;
  var becameWon = after.Status === 'won' && (!before || before.Status !== 'won');
  if (!becameWon) return;
  try {
    var result = exportDealToRevenue(after, {});
    updateObjectById(SHEETS.DEALS, after.ID, { RevenueExported: result.revenueId });
  } catch (e) {
    Logger.log('ส่งออกดีล ' + after.ID + ' ไปยัง Revenue sheet ไม่สำเร็จ: ' + e.message);
  }
}

/**
 * ปิดการขายสำเร็จแบบครบถ้วน: อัปเดตดีล+ลูกค้า, แนบสลิปถ้ามี, บันทึกยอดขายเข้า Revenue
 * พร้อมยอดขายจริง/ช่องทางโฆษณา/วิธีชำระเงินที่กรอกตอนปิดการขาย
 */
function closeDealWon(dealId, extra) {
  extra = extra || {};
  var before = getObjectById(SHEETS.DEALS, dealId);
  if (!before) throw new Error('ไม่พบดีลนี้');

  var patch = { Stage: 'won', Status: 'won', UpdatedAt: nowIso() };
  if (extra.ActualProducts) patch.ActualProducts = extra.ActualProducts;
  var updated = updateObjectById(SHEETS.DEALS, dealId, patch);
  updateObjectById(SHEETS.CUSTOMERS, updated.CustomerID, { Status: 'won', UpdatedAt: nowIso() });

  var slipFileUrl = '';
  if (extra.fileBase64 && extra.fileName) {
    var doc = uploadDocument({
      CustomerID: updated.CustomerID,
      DealID: updated.ID,
      DocType: 'payment_slip',
      DocNumber: '',
      IssueDate: todayStr(),
      fileBase64: extra.fileBase64,
      fileName: extra.fileName,
      mimeType: extra.mimeType,
    });
    slipFileUrl = doc.FileUrl;
  }

  var revenueResult = null;
  if (!updated.RevenueExported) {
    try {
      var subtotalOverride = (extra.Subtotal !== undefined && extra.Subtotal !== '')
        ? extra.Subtotal
        : extra.BillTotal; // เผื่อกรณีเรียกแบบเก่าที่ส่งมาแค่ยอดรวมเดียว (ไม่มี VAT/ค่าขนส่งแยก)
      revenueResult = exportDealToRevenue(updated, {
        subtotal: subtotalOverride,
        vat: extra.Vat,
        shipping: extra.ShippingCost,
        ad: extra.Ad,
        payment: extra.Payment,
        campaign: extra.Campaign,
        customerType: extra.CustomerType,
        province: extra.Province,
        actualProducts: extra.ActualProducts,
        slipFileUrl: slipFileUrl,
      });
      updateObjectById(SHEETS.DEALS, updated.ID, { RevenueExported: revenueResult.revenueId });
    } catch (e) {
      Logger.log('ส่งออกดีล ' + updated.ID + ' ไปยัง Revenue sheet ไม่สำเร็จ: ' + e.message);
    }
  }

  return { deal: getObjectById(SHEETS.DEALS, dealId), revenue: revenueResult };
}

function exportDealToRevenue(deal, overrides) {
  overrides = overrides || {};
  var customer = getObjectById(SHEETS.CUSTOMERS, deal.CustomerID);
  if (!customer) throw new Error('ไม่พบข้อมูลลูกค้าของดีลนี้');

  var sheet = getRevenueSheet();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var tz = Session.getScriptTimeZone();
  var timestamp = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm:ss');
  var customerName = customer.Type === 'company' ? (customer.CompanyName || customer.Name) : customer.Name;
  // ประเทศของ "ลูกค้า" (ที่อยู่/ที่ติดต่อมา) กับ "ปลายทางส่งออก" ของแต่ละดีล เป็นคนละอย่างกัน — ลูกค้ารายเดียวอาจสั่งส่งไปคนละประเทศได้ในแต่ละดีล
  var customerCountryLabel = countryLabelFor(customer.Country);
  var exportCountryLabel = countryLabelFor(deal.ExportCountry || customer.Country); // ดีลเก่าก่อนมีช่องนี้ ใช้ประเทศของลูกค้าแทนไปก่อน
  var hasSubtotal = overrides.subtotal !== undefined && overrides.subtotal !== null && overrides.subtotal !== '';
  var subtotal = hasSubtotal ? Number(overrides.subtotal) : (Number(deal.EstimatedValue) || 0);
  var vat = Number(overrides.vat || 0);
  var shipping = Number(overrides.shipping || 0);
  var amountAfterVat = subtotal + vat;
  var billTotal = amountAfterVat + shipping;

  var slipUrl = overrides.slipFileUrl || '';
  if (!slipUrl) {
    var slipDoc = sheetToObjects(getSheet(SHEETS.DOCUMENTS))
      .filter(function (d) { return d.CustomerID === customer.ID && d.DocType === 'payment_slip'; })
      .sort(function (a, b) { return String(b.CreatedAt).localeCompare(String(a.CreatedAt)); })[0];
    slipUrl = slipDoc ? slipDoc.FileUrl : '';
  }

  var revenueId = generateRevenueId(sheet);
  var rowObj = {
    'Revenue ID': revenueId,
    'Timestamp': timestamp,
    'ProductName': overrides.actualProducts || deal.ProductInterest || deal.Title,
    'Qty': 1,
    'Price': subtotal,
    'Discount': 0,
    'Amount': amountAfterVat,
    'Delivery': shipping,
    'Bill Total': billTotal,
    'Payment': overrides.payment || '',
    'Slip1': slipUrl,
    'Customer Name': customerName,
    'Phone Number': customer.Phone || '',
    'Sales Name': (function () { try { return Session.getActiveUser().getEmail() || 'CRM Spunky Food'; } catch (e) { return 'CRM Spunky Food'; } })(),
    'Ad': overrides.ad || '',
    'Campaign': overrides.campaign || 'Export',
    'CustomerType': overrides.customerType || 'ลูกค้าส่งออกต่างประเทศ',
    'Province': overrides.province || '',
    'Remark': (deal.Notes || '') + (exportCountryLabel ? ' | ประเทศปลายทาง: ' + exportCountryLabel : ''),
    'Order Date': timestamp,
    'Customer Address': (customer.Address || '') + (customerCountryLabel ? ' (' + customerCountryLabel + ')' : ''),
    'LINE UID': customer.LineID || '',
  };

  var row = headers.map(function (h) { return rowObj.hasOwnProperty(h) ? rowObj[h] : ''; });
  sheet.appendRow(row);
  SpreadsheetApp.flush();
  return { ok: true, revenueId: revenueId };
}

/** เรียกทดสอบจากหน้าตั้งค่า เพื่อลองส่งดีลหนึ่ง ๆ เข้า Revenue sheet ทันที (ใช้ debug ได้ ไม่ติดธงกันซ้ำ) */
function testExportDealToRevenue(dealId) {
  var deal = getObjectById(SHEETS.DEALS, dealId);
  if (!deal) throw new Error('ไม่พบดีลนี้');
  return exportDealToRevenue(deal, {});
}

/** ทดสอบการเชื่อมต่อสินค้า/Ad/Payment จาก Master Data Sales เพื่อ debug จากหน้าตั้งค่า */
function testMasterDataConnection() {
  var skuSettings = getSkuSettings();
  var result = { sheetId: skuSettings.sheetId, skuTabConfigured: skuSettings.tabName };
  try {
    var ss = SpreadsheetApp.openById(skuSettings.sheetId);
    result.spreadsheetTitle = ss.getName();
    result.allTabs = ss.getSheets().map(function (s) { return s.getName(); });
  } catch (e) {
    result.error = e.message;
    return result;
  }
  result.skus = getSkus();
  result.skuCount = result.skus.length;
  result.adOptions = getAdOptions();
  result.paymentOptions = getPaymentOptions();
  return result;
}
