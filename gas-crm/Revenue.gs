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

function generateRevenueId() {
  return 'REVX' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMddHHmmss');
}

/**
 * ตรวจสอบว่าดีลนี้เพิ่งเปลี่ยนเป็น "ปิดการขายสำเร็จ" (won) หรือไม่ (เทียบสถานะก่อน/หลัง)
 * ถ้าใช่และยังไม่เคยส่งออก ให้ส่งเข้า Revenue sheet แล้วติดธง RevenueExported ไว้กันส่งซ้ำ
 * ห่อด้วย try/catch เพื่อไม่ให้การอัปเดตดีลล้มเหลวไปด้วยหาก Revenue sheet มีปัญหา (เช่น สิทธิ์เข้าถึง)
 */
function maybeExportWonDealToRevenue(before, after) {
  if (!after || after.RevenueExported) return;
  var becameWon = after.Status === 'won' && (!before || before.Status !== 'won');
  if (!becameWon) return;
  try {
    var result = exportDealToRevenue(after);
    updateObjectById(SHEETS.DEALS, after.ID, { RevenueExported: result.revenueId });
  } catch (e) {
    Logger.log('ส่งออกดีล ' + after.ID + ' ไปยัง Revenue sheet ไม่สำเร็จ: ' + e.message);
  }
}

function exportDealToRevenue(deal) {
  var customer = getObjectById(SHEETS.CUSTOMERS, deal.CustomerID);
  if (!customer) throw new Error('ไม่พบข้อมูลลูกค้าของดีลนี้');

  var sheet = getRevenueSheet();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var tz = Session.getScriptTimeZone();
  var timestamp = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm:ss');
  var customerName = customer.Type === 'company' ? (customer.CompanyName || customer.Name) : customer.Name;
  var countryLabel = countryLabelFor(customer.Country);
  var amount = Number(deal.EstimatedValue) || 0;

  var receiptDoc = sheetToObjects(getSheet(SHEETS.DOCUMENTS))
    .filter(function (d) { return d.CustomerID === customer.ID && d.DocType === 'receipt'; })
    .sort(function (a, b) { return String(b.CreatedAt).localeCompare(String(a.CreatedAt)); })[0];

  var revenueId = generateRevenueId();
  var rowObj = {
    'Revenue ID': revenueId,
    'Timestamp': timestamp,
    'ProductName': deal.ProductInterest || deal.Title,
    'Qty': 1,
    'Price': amount,
    'Discount': 0,
    'Amount': amount,
    'Delivery': 0,
    'Bill Total': amount,
    'Payment': '',
    'Slip1': receiptDoc ? receiptDoc.FileUrl : '',
    'Customer Name': customerName,
    'Phone Number': customer.Phone || '',
    'Sales Name': (function () { try { return Session.getActiveUser().getEmail() || 'Export CRM'; } catch (e) { return 'Export CRM'; } })(),
    'Campaign': 'Export',
    'CustomerType': 'ลูกค้าส่งออกต่างประเทศ',
    'Remark': (deal.Notes || '') + (countryLabel ? ' | ประเทศปลายทาง: ' + countryLabel : ''),
    'Order Date': timestamp,
    'Customer Address': (customer.Address || '') + (countryLabel ? ' (' + countryLabel + ')' : ''),
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
  return exportDealToRevenue(deal);
}
