/**
 * อ่านข้อมูลสินค้าโดยตรงจาก Google Sheet "Master Data Sales" > แท็บ "SKU ส่งออก"
 * (เนื่องจากเป็นไฟล์ Google Sheet ของผู้ใช้เอง จึงอ่านได้ทันทีไม่ต้องตั้งค่า Service Account)
 */

function getSkuSettings() {
  return {
    sheetId: PROPS.getProperty('SKU_SHEET_ID') || '1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w',
    tabName: PROPS.getProperty('SKU_SHEET_TAB') || 'SKU ส่งออก',
  };
}

function mapSkuRow(headers, row) {
  function get(name) {
    var idx = -1;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i] || '').trim().toLowerCase() === name.toLowerCase()) { idx = i; break; }
    }
    return idx >= 0 ? (row[idx] || '') : '';
  }
  return {
    productNameTh: get('ProductName') || get('Product_Name'),
    productNameEn: get('ProductName (Eng)'),
    category: get('Category'),
    price: Number(String(get('Price')).replace(/,/g, '')) || 0,
    pack: get('Pack'),
    weight: get('Weight'),
    packingSize: get('Packing size'),
  };
}

function findSkuSheet(ss, configuredTabName) {
  var candidates = [configuredTabName, 'SKU ส่งออก', 'SKU', 'Sheet1'];
  for (var i = 0; i < candidates.length; i++) {
    var sheet = ss.getSheetByName(candidates[i]);
    if (sheet) return sheet;
  }
  // ลองหาแท็บที่หัวตารางมีคอลัมน์ "ProductName" จริง ๆ ก่อนจะยอมใช้แท็บแรกสุดแบบเดา
  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var headerRow = sheets[j].getRange(1, 1, 1, Math.min(sheets[j].getLastColumn(), 20)).getValues()[0];
    if (headerRow.some(function (h) { return String(h || '').trim().toLowerCase() === 'productname'; })) {
      return sheets[j];
    }
  }
  return sheets[0];
}

/** อ่านสด ๆ จาก Google Sheet ต้นทาง ทุกครั้งที่เรียก (ไม่ต้องกดซิงก์) */
function getSkus() {
  var settings = getSkuSettings();
  try {
    var ss = SpreadsheetApp.openById(settings.sheetId);
    var sheet = findSkuSheet(ss, settings.tabName);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    var headers = data[0];
    return data.slice(1)
      .filter(function (r) { return r.some(function (c) { return c !== '' && c !== null; }); })
      .map(function (r) { return mapSkuRow(headers, r); })
      .filter(function (s) { return s.productNameTh; });
  } catch (e) {
    Logger.log('อ่านชีตสินค้าไม่สำเร็จ: ' + e.message);
    return [];
  }
}
