// ==================== CONFIG ====================
var REVENUE_SHEET_ID   = '1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY'; 
var MASTER_SHEET_ID    = '1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w'; 
var REVENUE_SHEET_NAME = 'Revenue'; 
var LOGO_FOLDER_ID     = '14r9DbRMF4p4UVUE4q1WFB5ltXCOlVM1m'; 
var SLIP_FOLDER_ID     = '1aQQYvzFyZ79GDFQO352RdBPzdnCb0MnH'; 
var TARGET_SHEET_NAME  = 'Target';  
// LINE tokens เก็บใน Project Settings → Script Properties (ไม่เขียนไว้ในโค้ด)
var LINE_CHANNEL_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '';
var LINE_GROUP_ID      = 'Cd8827e043ea1e9176f100349c077d3ad';  
var LINE_CHANNEL_ACCESS_TOKEN_MEMBER = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN_MEMBER') || '';
var MEMBERS_SHEET_ID_FOR_NOTIFY = '15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk';

// ⚡ แก้ (22/8/69) — ตัดปุ่ม/ไอคอน "คัดลอก" ที่ใช้ LINE clipboard action ออกทั้งหมด (ดูเหตุผลที่
// setTrackingNumber / buildShippedFlexMessage_ ด้านล่าง) เพราะยืนยันแล้วจากภาพจริงว่า LINE บนคอมพิวเตอร์
// ไม่รองรับ clipboard action เลย — กดแล้วขึ้น popup ของ LINE เองว่า "Check it out on your mobile device."
// แทนที่จะคัดลอกให้ ไม่ใช่บั๊กของเรา แต่เป็นข้อจำกัดของ LINE บนคอมที่แก้จากฝั่งเราไม่ได้ จึงเลิกใช้วิธีนี้ไป
// เลย เปลี่ยนไปส่งเลขพัสดุเป็น "ข้อความล้วน" แยกต่างหากอีกข้อความหนึ่งแทน (ดูรายละเอียดที่ setTrackingNumber)
// เพราะข้อความล้วนในแชท LINE คัดลอกได้เองอยู่แล้วโดยธรรมชาติทั้งบนมือถือ (กดค้าง) และคอมพิวเตอร์ (คลิกขวา/
// เลือกข้อความ) ไม่ต้องพึ่ง action พิเศษใดๆ เลย ใช้ได้แน่นอนทุกอุปกรณ์

function rowToObject(row, rowIndex) {
  var ts = '';
  if (row[1]) {
    try { ts = new Date(row[1]).toLocaleString('th-TH'); } catch(e) { ts = String(row[1]); }
  }
  var orderDateDisplay = '';
  var orderDateInput   = '';
  if (row[22]) {
    try {
      var odDate = new Date(row[22]);
      orderDateDisplay = odDate.toLocaleString('th-TH');
      orderDateInput   = Utilities.formatDate(odDate, 'GMT+7', "yyyy-MM-dd'T'HH:mm");
    } catch(e) { orderDateDisplay = String(row[22]); }
  }
  var labelPrintedAtDisplay = '';
  if (row[25]) {
    try { labelPrintedAtDisplay = new Date(row[25]).toLocaleString('th-TH'); } catch(e) { labelPrintedAtDisplay = String(row[25]); }
  }
  return {
    trackingNumber: row[26] || '',
    freeFee:      (row[27] === undefined || row[27] === null || row[27] === '') ? '' : row[27],
    rowIndex:     rowIndex,
    revenueId:    row[0]  || '',
    timestamp:    ts,
    productName:  row[2]  || '',
    qty:          row[3]  || '',
    price:        row[4]  || '',
    discount:     row[5]  || '',
    amount:       row[6]  || '',
    shipping:     row[7]  || '',
    billTotal:    row[8]  || '',
    payment:      row[9]  || '',
    slip1:        row[10] || '',
    slip2:        row[11] || '',
    slip3:        row[12] || '',
    customerName: row[13] || '',
    phoneNumber:  row[14] || '',
    salesName:    row[15] || '',
    ad:           row[16] || '',
    campaign:     row[17] || '',
    customerType: row[18] || '',
    remark:       row[19] || '',
    orderShopee:  row[20] || '',
    orderTiktok:  row[21] || '',
    orderDate:       orderDateDisplay,
    orderDateInput:  orderDateInput,
    province:        row[23] || '',
    customerAddress: row[24] || '',
    labelPrintedAt:  labelPrintedAtDisplay
  };
}

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Revenue Management System - Spunky Food')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getMasterData() {
  try {
    var ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
    var simpleConfig = {
      'Payment':    { fieldId: 'payment',      col: 1 },
      'Sales Name': { fieldId: 'salesName',    col: 1 },
      'Campaign':   { fieldId: 'campaign',     col: 1 },
      'AD':         { fieldId: 'ad',           col: 1 },
      'Customer':   { fieldId: 'customerType', col: 1 }
    };
    var result = {};
    var sheets  = ss.getSheets();
    sheets.forEach(function(sheet) {
      var name    = sheet.getName().trim();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return;
      if (name === 'SKU') {
        var data     = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
        var products = [];
        data.forEach(function(row) {
          var pName  = row[1];
          var pPrice = row[3];
          if (pName && pName !== '') products.push({ name: String(pName), price: parseFloat(pPrice) || 0 });
        });
        result['products'] = products;
        return;
      }
      var cfg = simpleConfig[name];
      if (!cfg) return;
      var vals = sheet.getRange(2, cfg.col, lastRow - 1, 1).getValues()
                      .map(function(r) { return r[0]; })
                      .filter(function(v) { return v !== '' && v !== null && v !== undefined; });
      result[cfg.fieldId] = vals;
    });
    return { success: true, data: result };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function getLogoUrl() {
  try {
    var f = DriveApp.getFileById('19swmOZR5ClYcKqzUuMJLo7kkIaZ-vK7u');
    if (f.getMimeType().indexOf('image/') !== 0) throw new Error('ไฟล์โลโก้ไม่ใช่รูปภาพ');
    return { success: true, files: [{
      id: f.getId(), name: f.getName(),
      url: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w200'
    }] };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function uploadSlip(base64Data, fileName, mimeType) {
  try {
    var folder  = DriveApp.getFolderById(SLIP_FOLDER_ID);
    var decoded = Utilities.base64Decode(base64Data);
    var blob    = Utilities.newBlob(decoded, mimeType, fileName);
    var file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var fileId  = file.getId();
    return { success: true, url: 'https://drive.google.com/file/d/' + fileId + '/view', fileId: fileId };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function formatPhone(phone) {
  if (!phone) return '';
  var p = String(phone).replace(/[^0-9]/g, '');
  if (p.length > 0 && p.charAt(0) !== '0') p = '0' + p;
  return p;
}

function parseDateTimeLocalStr_(s) {
  if (!s) return null;
  var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(parseInt(m[1],10), parseInt(m[2],10) - 1, parseInt(m[3],10), parseInt(m[4],10), parseInt(m[5],10));
}

function fixAllPhoneNumbers() {
  try {
    var ss      = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet   = ss.getSheetByName(REVENUE_SHEET_NAME);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return 'ไม่มีข้อมูล';
    var phoneCol = 15;
    sheet.getRange(1, phoneCol, sheet.getMaxRows(), 1).setNumberFormat('@STRING@');
    SpreadsheetApp.flush();
    var data  = sheet.getRange(2, phoneCol, lastRow - 1, 1).getValues();
    var fixed = 0;
    data.forEach(function(row, idx) {
      var phone = String(row[0] || '').trim();
      if (!phone) return;
      var formatted = formatPhone(phone);
      sheet.getRange(idx + 2, phoneCol).setValue(formatted);
      if (formatted !== phone) fixed++;
    });
    return 'แก้ไขเบอร์โทรสำเร็จ ' + fixed + ' รายการ';
  } catch(e) {
    return 'Error: ' + e.toString();
  }
}

function fixAllTimestampFormat() {
  try {
    var ss      = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet   = ss.getSheetByName(REVENUE_SHEET_NAME);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return 'ไม่มีข้อมูล';
    sheet.getRange(1, 2, sheet.getMaxRows(), 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    return 'ตั้ง format คอลัมน์ Timestamp เป็นวันที่+เวลาแล้วทั้งชีต (' + lastRow + ' แถว)';
  } catch(e) {
    return 'Error: ' + e.toString();
  }
}

function generateRevenueId() {
  try {
    var ss      = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet   = ss.getSheetByName(REVENUE_SHEET_NAME);
    var lastRow = sheet.getLastRow();
    var today    = new Date();
    var buddhist = today.getFullYear() + 543;
    var yy       = String(buddhist).slice(-2);
    var mm       = String(today.getMonth() + 1); if (mm.length < 2) mm = '0' + mm;
    var prefix   = 'REV' + yy + mm;
    var maxNum   = 0;
    if (lastRow > 1) {
      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function(r) { return String(r[0]); });
      ids.forEach(function(id) {
        if (id.indexOf(prefix) === 0) {
          var n = parseInt(id.slice(prefix.length), 10) || 0;
          if (n > maxNum) maxNum = n;
        }
      });
    }
    var seq    = maxNum + 1;
    var seqStr = seq < 10 ? '00' + seq : seq < 100 ? '0' + seq : String(seq);
    return { success: true, id: prefix + seqStr };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function saveRevenue(data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนบันทึกพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    var ss    = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet = ss.getSheetByName(REVENUE_SHEET_NAME);
    var idResult = generateRevenueId();
    if (!idResult.success) throw new Error(idResult.error);
    var revenueId = idResult.id;
    var timestamp = new Date();
    var phone     = formatPhone(data.phoneNumber);
    var orderDate = data.orderDate ? parseDateTimeLocalStr_(data.orderDate) : timestamp;
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 15, 100, 1).setNumberFormat('@STRING@');
    sheet.getRange(startRow, 2, 100, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sheet.getRange(startRow, 23, 100, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    SpreadsheetApp.flush();
    var names     = String(data.productName || '').split('|').map(function(s){ return s.trim(); });
    var qtys      = String(data.qty         || '').split('|').map(function(s){ return s.trim(); });
    var prices    = String(data.price       || '').split('|').map(function(s){ return s.trim(); });
    var discounts = String(data.discount    || '').split('|').map(function(s){ return s.trim(); });
    var rowsToInsert = [];
    for (var i = 0; i < names.length; i++) {
      var pName     = names[i]     || '';
      var pQty      = parseFloat(qtys[i])      || 0;
      var pPrice    = parseFloat(prices[i])    || 0;
      var pDiscount = parseFloat(discounts[i]) || 0;
      var pAmt      = (pQty * pPrice) - pDiscount;
      if (i === 0) {
        rowsToInsert.push([
          revenueId, timestamp, pName, pQty, pPrice, pDiscount, pAmt,
          data.shipping || '', data.billTotal || '', data.payment || '',
          data.slip1 || '', data.slip2 || '', data.slip3 || '',
          data.customerName || '', phone, data.salesName || '', data.ad || '',
          data.campaign || '', data.customerType || '', data.remark || '',
          data.orderShopee || '', data.orderTiktok || '', orderDate,
          data.province || '', data.customerAddress || '', '', '',
          (data.freeFee !== undefined && data.freeFee !== null && data.freeFee !== '') ? data.freeFee : ''
        ]);
      } else {
        // ⚡ แก้ (24/8/69) — เดิมอาร์เรย์แถวนี้มีแค่ 27 ช่อง แต่ตอนนี้ชีตมี 28 คอลัมน์ (หลังเพิ่มคอลัมน์
        // Free เป็นคอลัมน์ที่ 28) ทำให้ setValues() พังตอนบิลมีสินค้ามากกว่า 1 รายการ เพราะแถวแรกของ
        // rowsToInsert มี 28 ช่อง แต่แถวนี้ (สินค้ารายการที่ 2 เป็นต้นไปของบิลเดียวกัน) มีแค่ 27 ช่อง —
        // เพิ่ม '' อีก 1 ช่องท้ายอาร์เรย์ให้ครบ 28 ช่องเท่ากับแถวแรกและเท่ากับ range ที่ประกาศไว้
        rowsToInsert.push(['', '', pName, pQty, pPrice, pDiscount, pAmt, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      }
    }
    if (rowsToInsert.length === 1) {
      sheet.getRange(startRow, 1, 1, 28).setValues([rowsToInsert[0]]);
    } else {
      sheet.getRange(startRow, 1, rowsToInsert.length, 28).setValues(rowsToInsert);
    }
    sheet.getRange(startRow, 15).setNumberFormat('@STRING@');
    SpreadsheetApp.flush();
    sheet.getRange(startRow, 15).setValue(phone);
    SpreadsheetApp.flush();
    return { success: true, id: revenueId, timestamp: timestamp.toLocaleString('th-TH') };
  } catch(e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function checkDuplicateRevenue(data) {
  try {
    var ss      = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet   = ss.getSheetByName(REVENUE_SHEET_NAME);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, duplicates: [] };
    var raw = sheet.getRange(2, 1, lastRow - 1, 31).getValues();
    var bills = [];
    var current = null;
    raw.forEach(function(row, idx) {
      if (row[0]) {
        current = {
          rowIndex: idx + 2, revenueId: String(row[0]),
          timestamp: row[1] ? new Date(row[1]) : null,
          orderDate: getEffectiveReportDate_(row),
          customerName: String(row[13] || ''), phoneNumber: String(row[14] || ''),
          orderShopee: String(row[20] || ''), orderTiktok: String(row[21] || ''),
          amount: 0, products: []
        };
        bills.push(current);
      }
      if (current) {
        current.amount += parseFloat(row[6]) || 0;
        if (row[2]) current.products.push(String(row[2]) + (row[3] ? ' x' + row[3] : ''));
      }
    });
    var newOrderShopee = String(data.orderShopee || '').trim();
    var newOrderTiktok = String(data.orderTiktok || '').trim();
    var newPhone       = formatPhone(data.phoneNumber);
    var newName        = String(data.customerName || '').trim().toLowerCase();
    var newAmount      = parseFloat(data.amount) || 0;
    var now            = new Date();
    var todayKey       = Utilities.formatDate(now, 'GMT+7', 'yyyy-MM-dd');
    var duplicates = [];
    bills.forEach(function(bill) {
      var reasons = [];
      if (newOrderShopee && bill.orderShopee && bill.orderShopee === newOrderShopee) {
        reasons.push({ confidence: 'high', reason: 'เลข Order Shopee ตรงกัน (' + newOrderShopee + ')' });
      }
      if (newOrderTiktok && bill.orderTiktok && bill.orderTiktok === newOrderTiktok) {
        reasons.push({ confidence: 'high', reason: 'เลข Order TikTok ตรงกัน (' + newOrderTiktok + ')' });
      }
      if (newPhone && bill.phoneNumber && bill.phoneNumber === newPhone && bill.timestamp) {
        var billDateKey = Utilities.formatDate(bill.timestamp, 'GMT+7', 'yyyy-MM-dd');
        if (billDateKey === todayKey && Math.abs(bill.amount - newAmount) <= 1) {
          reasons.push({ confidence: 'medium', reason: 'เบอร์โทรเดียวกัน + วันเดียวกัน + ยอดใกล้เคียงกัน' });
        }
      }
      if (newName && bill.customerName && bill.customerName.trim().toLowerCase() === newName && bill.timestamp) {
        var minutesDiff = Math.abs(now - bill.timestamp) / 60000;
        if (minutesDiff <= 15 && Math.abs(bill.amount - newAmount) <= 1) {
          reasons.push({ confidence: 'medium', reason: 'ชื่อลูกค้าเดียวกัน + ยอดเท่ากัน + เพิ่งบันทึกไปเมื่อไม่กี่นาทีก่อน' });
        }
      }
      if (reasons.length) {
        var hasHigh = reasons.some(function(r) { return r.confidence === 'high'; });
        duplicates.push({
          confidence: hasHigh ? 'high' : 'medium', reasons: reasons.map(function(r) { return r.reason; }),
          rowIndex: bill.rowIndex, revenueId: bill.revenueId,
          timestamp: bill.timestamp ? bill.timestamp.toLocaleString('th-TH') : '',
          orderDate: bill.orderDate ? bill.orderDate.toLocaleString('th-TH') : '',
          customerName: bill.customerName, phoneNumber: bill.phoneNumber, amount: bill.amount,
          products: bill.products.join(', ')
        });
      }
    });
    duplicates.sort(function(a, b) { if (a.confidence === b.confidence) return 0; return a.confidence === 'high' ? -1 : 1; });
    return { success: true, duplicates: duplicates };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function searchRevenue(query, startDateStr, endDateStr) {
  try {
    var ss      = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet   = ss.getSheetByName(REVENUE_SHEET_NAME);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 31).getValues();
    var q    = query ? String(query).toLowerCase().trim() : '';
    var rangeStart = null, rangeEnd = null;
    if (startDateStr) { rangeStart = parseDateStr_(startDateStr); rangeStart.setHours(0, 0, 0, 0); }
    if (endDateStr)   { rangeEnd   = parseDateStr_(endDateStr);   rangeEnd.setHours(23, 59, 59, 999); }
    var matchedIds    = {};
    var currentId     = '';
    var dateForFilter = null;
    var currentDateOk = false;
    data.forEach(function(row) {
      if (row[0]) {
        currentId = String(row[0]);
        dateForFilter = getEffectiveReportDate_(row);
        currentDateOk = !!dateForFilter;
        if (rangeStart && (!dateForFilter || dateForFilter < rangeStart)) currentDateOk = false;
        if (rangeEnd   && (!dateForFilter || dateForFilter > rangeEnd))   currentDateOk = false;
      }
      if (!currentDateOk) return;
      var textOk = true;
      if (q) {
        var cName  = String(row[13] || '').toLowerCase();
        var phone  = String(row[14] || '').toLowerCase();
        var rid    = String(row[0]  || '').toLowerCase();
        var ordShp = String(row[20] || '').toLowerCase();
        var ordTik = String(row[21] || '').toLowerCase();
        textOk = cName.indexOf(q) !== -1 || phone.indexOf(q) !== -1 || rid.indexOf(q) !== -1 ||
                 ordShp.indexOf(q) !== -1 || ordTik.indexOf(q) !== -1;
      }
      if (textOk) matchedIds[currentId] = true;
    });
    var results = [];
    currentId = '';
    data.forEach(function(row, index) {
      if (row[0]) currentId = String(row[0]);
      if (matchedIds[currentId]) results.push(rowToObject(row, index + 2));
    });
    return { success: true, results: results };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function updateRevenue(rowIndex, data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนบันทึกพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    var ss      = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet   = ss.getSheetByName(REVENUE_SHEET_NAME);
    var lastRow = sheet.getLastRow();
    var keepId        = sheet.getRange(rowIndex, 1).getValue();
    var keepTs         = sheet.getRange(rowIndex, 2).getValue();
    var keepOrderDate  = sheet.getRange(rowIndex, 23).getValue();
    var keepProvince   = sheet.getRange(rowIndex, 24).getValue();
    var keepLabelPrinted = sheet.getRange(rowIndex, 26).getValue();
    var keepTrackingNumber = sheet.getRange(rowIndex, 27).getValue();
    var keepFreeFee = sheet.getRange(rowIndex, 28).getValue();
    sheet.getRange(rowIndex, 2).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sheet.getRange(rowIndex, 23).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sheet.getRange(rowIndex, 15).setNumberFormat('@STRING@');
    SpreadsheetApp.flush();
    var billRowCount = 1;
    for (var i = rowIndex + 1; i <= lastRow; i++) {
      var nextId = sheet.getRange(i, 1).getValue();
      if (nextId === '' || nextId === null || nextId === undefined) { billRowCount++; } else { break; }
    }
    var names     = data._rows ? data._rows.map(function(r){ return r.name||''; }) : String(data.productName||'').split('|').map(function(s){return s.trim();});
    var qtys      = data._rows ? data._rows.map(function(r){ return r.qty||''; }) : String(data.qty||'').split('|').map(function(s){return s.trim();});
    var prices    = data._rows ? data._rows.map(function(r){ return r.price||''; }) : String(data.price||'').split('|').map(function(s){return s.trim();});
    var discounts = data._rows ? data._rows.map(function(r){ return r.discount||0; }) : String(data.discount||'').split('|').map(function(s){return parseFloat(s.trim())||0;});
    var phone     = formatPhone(data.phoneNumber);
    var orderDate = data.orderDate ? parseDateTimeLocalStr_(data.orderDate) : keepOrderDate;
    var province  = data.province ? data.province : keepProvince;
    var address   = data.customerAddress !== undefined ? (data.customerAddress || '') : (sheet.getRange(rowIndex, 25).getValue() || '');
    var newRowCount = names.length;
    var newRows = [];
    for (var j = 0; j < newRowCount; j++) {
      var pName     = names[j]  || '';
      var pQty      = parseFloat(qtys[j])      || 0;
      var pPrice    = parseFloat(prices[j])    || 0;
      var pDiscount = parseFloat(discounts[j]) || 0;
      var pAmt      = (pQty * pPrice) - pDiscount;
      if (j === 0) {
        newRows.push([
          keepId, keepTs, pName, pQty, pPrice, pDiscount, pAmt,
          data.shipping || '', data.billTotal || '', data.payment || '',
          data.slip1 || '', data.slip2 || '', data.slip3 || '',
          data.customerName || '', phone, data.salesName || '', data.ad || '',
          data.campaign || '', data.customerType || '', data.remark || '',
          data.orderShopee || '', data.orderTiktok || '', orderDate, province, address,
          keepLabelPrinted, keepTrackingNumber,
          // ⚡ แก้ (2/9/69) — เดิมเขียน keepFreeFee ตายตัวเสมอ (ค่าที่เคยมีอยู่แล้วในชีตก่อนแก้ไข) เพราะฟอร์ม
          // แก้ไขบิลไม่เคยมีช่องให้แก้ Free เลย ทำให้แก้ไขบิล (เช่น re-parse ข้อความ TikTok ใหม่ หรือแก้เลข
          // Free เอง) แล้วคอลัมน์ AB ไม่เคยอัปเดตตามเลย — ตอนนี้ฟอร์มแก้ไขมีช่อง Free แล้ว (e_freeFee) ให้ใช้
          // ค่าที่ส่งมาจากฟอร์มก่อนเสมอถ้ามีการส่งมาจริง (รวมถึงกรณีตั้งใจลบเป็นค่าว่าง) เหลือแค่กรณีข้อมูลเก่า
          // ที่ยังไม่เคยผ่านฟอร์มนี้ (data.freeFee เป็น undefined จริงๆ) เท่านั้นที่ fallback ไปคงค่าเดิมไว้
          (data.freeFee !== undefined) ? data.freeFee : keepFreeFee
        ]);
      } else {
        // ⚡ แก้ (24/8/69) — บั๊กเดียวกับใน saveRevenue: อาร์เรย์แถวนี้เดิมมีแค่ 27 ช่อง ไม่ครบ 28
        // คอลัมน์ตามที่ชีตมีจริงตอนนี้ (หลังเพิ่มคอลัมน์ Free) ทำให้แก้ไขบิลที่มีสินค้ามากกว่า 1 รายการ
        // แล้ว error "columns does not match" — เพิ่ม '' อีก 1 ช่องท้ายอาร์เรย์ให้ครบ 28 ช่อง
        newRows.push(['', '', pName, pQty, pPrice, pDiscount, pAmt, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      }
    }
    if (newRowCount === billRowCount) {
      sheet.getRange(rowIndex, 1, newRowCount, 28).setValues(newRows);
    } else if (newRowCount > billRowCount) {
      sheet.getRange(rowIndex, 1, billRowCount, 28).setValues(newRows.slice(0, billRowCount));
      for (var k = billRowCount; k < newRowCount; k++) {
        sheet.insertRowAfter(rowIndex + k - 1);
        sheet.getRange(rowIndex + k, 1, 1, 28).setValues([newRows[k]]);
      }
    } else {
      sheet.getRange(rowIndex, 1, newRowCount, 28).setValues(newRows);
      for (var m = rowIndex + billRowCount - 1; m >= rowIndex + newRowCount; m--) sheet.deleteRow(m);
    }
    sheet.getRange(rowIndex, 15).setNumberFormat('@STRING@');
    SpreadsheetApp.flush();
    sheet.getRange(rowIndex, 15).setValue(phone);
    SpreadsheetApp.flush();
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ⚡ เพิ่ม (12/10/69) — ปุ่ม "ยกเลิกออเดอร์" ในหน้าแก้ไข สำหรับออเดอร์ที่ลูกค้ายกเลิกในแพลตฟอร์ม (Shopee/
// TikTok ฯลฯ) แล้วต้องยกเลิกในระบบเราตาม — ใช้หลักเดียวกับ cancelShopOrder ของระบบ LINE Shop (Members.gs):
// ไม่ลบแถว (Revenue ID ไม่หาย) แต่ (1) เขียนคำว่า "ยกเลิก" ทับชื่อสินค้าคอลัมน์ C ทุกแถวของบิล (2) ล้างยอดเงิน
// เป็น 0 (ส่วนลด F, ยอดต่อรายการ G, ค่าจัดส่ง H, ยอดรวม I) (3) บันทึกเหตุผล + วันเวลาที่คอลัมน์ T
// Dashboard/รายงาน/ใบจัดส่งตัดบิลที่ชื่อสินค้าเป็น "ยกเลิก" ออกเองอยู่แล้ว (isCancelledDashboardItem_,
// listShippingLabelOrders) ต่างจาก LINE Shop ตรงที่หมายเหตุเดิมไม่ถูกลบทิ้ง — ต่อท้ายไว้หลังข้อความยกเลิก
// ส่วนออเดอร์เก็บเงินปลายทาง ล้างสถานะ COD (คอลัมน์ AG) ออกด้วย จะได้ไม่ค้างอยู่ในรายการ "รอเก็บเงิน"
var CANCELLED_REVENUE_MARK_ = 'ยกเลิก';
var REVENUE_COD_STATUS_COL_ = 33; // คอลัมน์ AG "สถานะเก็บเงินปลายทาง" (สร้างโดยระบบ Members LINE)
function cancelRevenue(rowIndex, revenueId, reason) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนบันทึกพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    revenueId = String(revenueId || '').trim();
    if (!revenueId) return { success: false, error: 'ไม่พบ Revenue ID ของบิลนี้' };
    var ss      = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet   = ss.getSheetByName(REVENUE_SHEET_NAME);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, error: 'ไม่พบบิลนี้ในชีต' };
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

    // แถวอาจเลื่อนไปแล้วถ้ามีคนเพิ่ม/ลบแถวหลังกดค้นหา — ใช้ rowIndex เดิมเฉพาะเมื่อ Revenue ID ยังตรงกัน
    // ไม่อย่างนั้นหาแถวใหม่จาก Revenue ID กันยกเลิกผิดบิล
    var startRow = parseInt(rowIndex, 10) || 0;
    if (startRow < 2 || startRow > lastRow || String(ids[startRow - 2][0]) !== revenueId) {
      startRow = -1;
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === revenueId) { startRow = i + 2; break; }
      }
      if (startRow === -1) return { success: false, error: 'ไม่พบบิล ' + revenueId + ' ในชีต' };
    }
    // สินค้าหลายรายการต่อกันหลายแถว แถวถัดๆ ไปมีคอลัมน์ A ว่าง
    var numRows = 1;
    while (startRow + numRows <= lastRow && !ids[startRow + numRows - 2][0]) numRows++;

    var mainRow = sheet.getRange(startRow, 1, 1, 20).getValues()[0];
    if (String(mainRow[2]) === CANCELLED_REVENUE_MARK_) return { success: false, error: 'บิลนี้ถูกยกเลิกไปแล้ว' };

    var marks = [], zeros = [];
    for (var r = 0; r < numRows; r++) { marks.push([CANCELLED_REVENUE_MARK_]); zeros.push([0, 0]); }
    sheet.getRange(startRow, 3, numRows, 1).setValues(marks); // ชื่อสินค้า (C) -> "ยกเลิก"
    sheet.getRange(startRow, 6, numRows, 2).setValues(zeros); // ส่วนลด (F), ยอดต่อรายการ (G)
    sheet.getRange(startRow, 8, 1, 2).setValues([[0, 0]]);    // ค่าจัดส่ง (H), ยอดรวม (I)

    reason = String(reason || '').trim();
    var oldRemark = String(mainRow[19] || '').trim();
    var note = 'ยกเลิก' + (reason ? ': ' + reason : '') + ' (' + Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm') + ')'
      + (oldRemark ? ' | หมายเหตุเดิม: ' + oldRemark : '');
    sheet.getRange(startRow, 20).setValue(note); // หมายเหตุ (T)

    if (String(mainRow[9] || '').indexOf('เก็บเงินปลายทาง') !== -1 && sheet.getMaxColumns() >= REVENUE_COD_STATUS_COL_) {
      sheet.getRange(startRow, REVENUE_COD_STATUS_COL_).setValue('');
    }
    SpreadsheetApp.flush();
    return { success: true, revenueId: revenueId, rows: numRows, previousTotal: Number(mainRow[8]) || 0 };
  } catch(e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getAllRevenue(limit) {
  try {
    var ss      = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet   = ss.getSheetByName(REVENUE_SHEET_NAME);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 31).getValues();
    var maxBills  = limit || 50;
    var seenIds   = [];
    var seenSet   = {};
    var currentId = '';
    for (var i = data.length - 1; i >= 0; i--) {
      var rid = String(data[i][0] || '');
      if (rid) currentId = rid;
      if (currentId && !seenSet[currentId]) {
        seenSet[currentId] = true; seenIds.push(currentId);
        if (seenIds.length >= maxBills) break;
      }
    }
    var results = [];
    currentId = '';
    data.forEach(function(row, idx) {
      if (row[0]) currentId = String(row[0]);
      if (seenSet[currentId]) results.push(rowToObject(row, idx + 2));
    });
    results.reverse();
    return { success: true, results: results };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function getMonthlyTargets(monthDate) {
  var empty = { total: 0, channels: {} };
  try {
    var ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
    var sheet = ss.getSheetByName(TARGET_SHEET_NAME);
    if (!sheet) return empty;
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return empty;
    var COL_MONTH = 0;
    var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var totalColIdx = -1;
    var channelCols = [];
    for (var i = 1; i < lastCol; i++) {
      var h = String(headerRow[i] || '').trim();
      if (!h) continue;
      var hLower = h.toLowerCase();
      if (hLower.indexOf('total') !== -1 || h.indexOf('รวม') !== -1) { totalColIdx = i; continue; }
      channelCols.push({ idx: i, name: h });
    }
    var monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    var mIdx = monthDate.getMonth();
    var yyyy = monthDate.getFullYear();
    var mm = String(mIdx + 1); if (mm.length < 2) mm = '0' + mm;
    var candidates = [monthNames[mIdx], monthNames[mIdx] + yyyy, yyyy + '-' + mm, mm + '/' + yyyy, String(yyyy) + mm]
      .map(function(c){ return String(c).toLowerCase().replace(/[^a-z0-9]/g, ''); });
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var r = 0; r < data.length; r++) {
      var cell = data[r][COL_MONTH];
      var cellStrs = [];
      if (cell instanceof Date) {
        cellStrs.push(monthNames[cell.getMonth()]);
        cellStrs.push(Utilities.formatDate(cell, 'GMT+7', 'yyyy-MM'));
        cellStrs.push(Utilities.formatDate(cell, 'GMT+7', 'MM/yyyy'));
      } else {
        cellStrs.push(String(cell || ''));
      }
      cellStrs = cellStrs.map(function(s){ return s.toLowerCase().replace(/[^a-z0-9]/g, ''); });
      var isMatch = candidates.some(function(c) { return cellStrs.indexOf(c) !== -1; });
      if (isMatch) {
        var channels = {};
        channelCols.forEach(function(c) { channels[c.name] = parseFloat(data[r][c.idx]) || 0; });
        var total = totalColIdx >= 0 ? (parseFloat(data[r][totalColIdx]) || 0) : 0;
        if (!total) total = Object.keys(channels).reduce(function(s, k) { return s + channels[k]; }, 0);
        return { total: total, channels: channels };
      }
    }
    return empty;
  } catch(e) {
    return empty;
  }
}

// ⚡ เพิ่ม (24/8/69) — รวมเป้าหมายของทุกเดือนปฏิทินที่ช่วงวันที่ [rangeStart, rangeEndInclusive] คร่อมอยู่
// เข้าด้วยกัน (เช่น เลือกช่วงคร่อม 2 เดือน ก็เอาเป้าของทั้ง 2 เดือนมาบวกกัน) ใช้แทนการล็อกเป้าหมายไว้กับ
// เดือนปัจจุบันจริงเหมือนเดิม เพื่อให้กล่องเป้าหมายใน Dashboard ปรับตามช่วงวันที่ที่เลือกได้จริง — จำกัด
// จำนวนรอบลูปไว้ (guard) กันลูปยาวเกินไปถ้าช่วงวันที่ผิดพลาด
function getTargetsForRangeSum_(rangeStart, rangeEndInclusive) {
  var totalSum = 0;
  var channelsSum = {};
  var cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  var endMonth = new Date(rangeEndInclusive.getFullYear(), rangeEndInclusive.getMonth(), 1);
  var guard = 0;
  while (cursor <= endMonth && guard < 120) {
    var t = getMonthlyTargets(cursor);
    totalSum += t.total || 0;
    Object.keys(t.channels || {}).forEach(function(k) {
      channelsSum[k] = (channelsSum[k] || 0) + (t.channels[k] || 0);
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    guard++;
  }
  return { total: totalSum, channels: channelsSum };
}

function looseNameMatch_(a, b) {
  var na = String(a || '').toLowerCase().replace(/\s+/g, '');
  var nb = String(b || '').toLowerCase().replace(/\s+/g, '');
  if (!na || !nb) return false;
  return na === nb || na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1;
}

function channelColor_(name) {
  var key = String(name || '').toLowerCase();
  if (key.indexOf('shopee') !== -1) return '#ee4d2d';
  if (key.indexOf('tiktok') !== -1) return '#010101';
  if (key.indexOf('facebook') !== -1 || key === 'fb') return '#1877f2';
  if (key.indexOf('line') !== -1) return '#06c755';
  if (key.indexOf('lazada') !== -1) return '#0f156d';
  if (!key || key.indexOf('ไม่ระบุ') !== -1 || key.indexOf('ขายตรง') !== -1 || key.indexOf('other') !== -1) return '#757575';
  var palette = ['#ff9800', '#9c27b0', '#00acc1', '#8bc34a', '#e91e63', '#3f51b5', '#795548', '#607d8b'];
  var hash = 0;
  for (var i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function campaignGroupKey_(name) {
  var known = ['shopee', 'tiktok', 'facebook', 'line', 'lazada'];
  var trimmed = String(name || '').trim();
  var lower = trimmed.toLowerCase();
  for (var i = 0; i < known.length; i++) {
    var kwEnd = known[i];
    var startIdx = lower.length - kwEnd.length;
    if (startIdx > 0 && lower.substring(startIdx) === kwEnd && lower.charAt(startIdx - 1) === ' ') {
      var restSuffix = trimmed.substring(0, startIdx).trim();
      if (restSuffix) return restSuffix.toLowerCase();
    }
  }
  for (var j = 0; j < known.length; j++) {
    var kwStart = known[j];
    if (lower.indexOf(kwStart) === 0 && (lower.length === kwStart.length || lower.charAt(kwStart.length) === ' ')) {
      var restPrefix = trimmed.substring(kwStart.length).trim();
      if (restPrefix) return restPrefix.toLowerCase();
    }
  }
  return lower;
}

var PRODUCT_GROUP_KEYWORDS_ = [
  { keyword: 'น้ำมันรำข้าว', label: 'น้ำมันรำข้าว' },
  { keyword: 'น้ำมันหม่าล่า', label: 'น้ำมันหม่าล่า' },
  { keyword: 'น้ำมันงา',     label: 'น้ำมันงา' },
  { keyword: 'หมี่คลุก',    label: 'หมี่คลุกน้ำพริกหนังแซลมอนกรอบ' },
  { keyword: 'หมี่ชมพู',    label: 'หมี่ชมพูน้ำพริกหนังแซลมอนกรอบ' },
  { keyword: 'คละรส',      label: 'น้ำพริกคละรส' },
  { keyword: 'น้ำย้อย',     label: 'น้ำพริกน้ำย้อย' },
  { keyword: 'ตะไคร้',      label: 'น้ำพริกตะไคร้หอม' },
  { keyword: 'ลงเรือกรอบ',  label: 'น้ำพริกลงเรือกรอบ' },
  { keyword: 'ปลาดุก',     label: 'น้ำพริกปลาดุกฟูพริกขิง' },
  { keyword: 'เตี๋ยวเรือ',  label: 'ก๋วยเตี๋ยวเรือ' },
  { keyword: 'เตี่ยวเรือ',  label: 'ก๋วยเตี๋ยวเรือ' },
  { keyword: 'เตี๋ยวแห้ง',  label: 'ก๋วยเตี๋ยวแห้ง' },
  { keyword: 'เตี่ยวแห้ง',  label: 'ก๋วยเตี๋ยวแห้ง' }
];

function normalizeCampaignLabel_(name) {
  var label = String(name || '').trim();
  var lower = label.toLowerCase();
  if (lower.indexOf('2 กระปุก') !== -1 && lower.indexOf('1 กระปุก') !== -1) {
    return 'ซื้อน้ำมันพริกผัด 2 กระปุก ฟรี 1 กระปุก';
  }
  return label || 'ไม่ระบุ Campaign';
}

function isCancelledDashboardItem_(productName, remark) {
  var normalizedProduct = String(productName || '').replace(/\s+/g, '').toLowerCase();
  var normalizedRemark = String(remark || '').toLowerCase();
  return normalizedProduct === 'ยกเลิก'
    || normalizedProduct === 'cancelled'
    || normalizedProduct === 'canceled'
    || normalizedRemark.indexOf('ยกเลิก') !== -1
    || normalizedRemark.indexOf('cancelled') !== -1
    || normalizedRemark.indexOf('canceled') !== -1;
}

function collectCancelledOrderIds_(rows) {
  var cancelledOrderIds = {};
  var currentId = '';
  (rows || []).forEach(function(row) {
    if (row[0]) currentId = String(row[0]);
    if (currentId && isCancelledDashboardItem_(row[2], row[19])) cancelledOrderIds[currentId] = true;
  });
  return cancelledOrderIds;
}

function debugTarget() {
  var now = new Date();
  var result = getMonthlyTargets(now);
  Logger.log('เดือนที่เช็ค: ' + now);
  Logger.log('ผลลัพธ์ที่อ่านได้: ' + JSON.stringify(result));
  return result;
}

function parseDateStr_(s) {
  // ⚡ แก้ (24/8/69) — เดิมสร้าง Date จาก new Date(y, m-1, d) ซึ่งตีความปี/เดือน/วันตาม timezone ที่ตั้งไว้ใน
  // Apps Script Project Settings ของโปรเจกต์นี้เอง (ตอนนี้ตั้งเป็น Bangkok/GMT+7 ถูกต้องอยู่แล้ว) — เปลี่ยน
  // มาสร้างวันที่แบบระบุ '+07:00' ต่อท้ายตรงๆ ในสตริงแทน เพื่อให้จุดเที่ยงคืนของวันที่ที่แปลงมา "ล็อกเป็น
  // GMT+7 เสมอ" ไม่ขึ้นกับการตั้งค่า timezone ของ Project อีกต่อไป กันปัญหาช่วงวันที่เพี้ยนถ้าวันใดวันหนึ่งมี
  // คนไปเปลี่ยน Project Settings เป็น timezone อื่นโดยไม่ได้ตั้งใจ
  var parts = String(s).split('-');
  var yyyy = parts[0], mm = parts[1], dd = parts[2];
  return new Date(yyyy + '-' + mm + '-' + dd + 'T00:00:00+07:00');
}

var THAI_MONTHS_ABBR_ = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
var THAI_MONTHS_FULL_ = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function fmtThaiDate_(s) {
  var dt = parseDateStr_(s);
  var by = dt.getFullYear() + 543;
  return dt.getDate() + ' ' + THAI_MONTHS_ABBR_[dt.getMonth()] + ' ' + String(by).slice(-2);
}
function fmtThaiRange_(startStr, endStr) {
  return fmtThaiDate_(startStr) + ' - ' + fmtThaiDate_(endStr);
}

function getDashboardData(startDateStr, endDateStr) {
  try {
    var ss      = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet   = ss.getSheetByName(REVENUE_SHEET_NAME);
    var lastRow = sheet.getLastRow();
    var now = new Date();
    var todayKey = Utilities.formatDate(now, 'GMT+7', 'yyyy-MM-dd');
    var rangeStart = startDateStr ? parseDateStr_(startDateStr) : new Date(now.getFullYear(), now.getMonth(), 1);
    var rangeEnd   = endDateStr   ? parseDateStr_(endDateStr)   : now;
    rangeStart.setHours(0, 0, 0, 0);
    var rangeEndInclusive = new Date(rangeEnd);
    rangeEndInclusive.setHours(23, 59, 59, 999);
    // ⚡ แก้ (24/8/69) — เป้าหมาย (Target) ต้องรวมเป้าของทุกเดือนที่ช่วงวันที่ที่เลือกคร่อมอยู่ (ไม่ใช่ล็อก
    // กับเดือนปัจจุบันจริงเหมือนเดิม) แล้วเทียบกับยอดขายจริงรวมในช่วงที่เลือกนั้นเลย ดูฟังก์ชัน
    // getTargetsForRangeSum_ ด้านบน
    var targets = getTargetsForRangeSum_(rangeStart, rangeEndInclusive);
    var monthlyTarget = targets.total;
    var emptyResult = {
      totalAmount: 0, totalOrders: 0, aov: 0, totalDiscount: 0, totalDelivery: 0,
      pctAmount: 0, pctOrders: 0, dailyTrend: [], rawProducts: [], channel: {}, channelAmount: {}, channelOrderCount: {},
      todayAmount: 0, todayOrders: 0, todayChannelAmount: {},
      monthAmount: 0, monthOrders: 0, monthChannelAmount: {},
      monthlyTarget: monthlyTarget, pctToTarget: null,
      channelTargets: targets, channelTargetBreakdown: [], campaignReport: [],
      rangeStart: Utilities.formatDate(rangeStart, 'GMT+7', 'yyyy-MM-dd'),
      rangeEnd:   Utilities.formatDate(rangeEndInclusive, 'GMT+7', 'yyyy-MM-dd')
    };
    if (lastRow <= 1) return { success: true, data: emptyResult };
    var data = sheet.getRange(2, 1, lastRow - 1, 31).getValues();
    var cancelledOrderIds = collectCancelledOrderIds_(data);
    var rangeDays = Math.max(1, Math.round((rangeEndInclusive - rangeStart) / 86400000) + 1);
    var prevEnd = new Date(rangeStart.getTime() - 1000);
    var prevStart = new Date(rangeStart.getTime() - rangeDays * 86400000);
    var totalAmount = 0, totalDiscount = 0, totalDelivery = 0, prevTotalAmount = 0;
    var nonBulkAmount = 0, nonBulkOrderIdsInPeriod = {};
    var orderIdsInPeriod = {}, prevOrderIdsInPeriod = {};
    var dailyMap = {};
    var rawProducts = [];
    var channelCount = {};
    var channelOrderCount = {};
    var todayAmount = 0;
    var todayOrderIds = {};
    var todayChannelAmount = {};
    var rangeChannelAmount = {};
    var campaignChannelAmount = {};
    var currentId = '';
    var currentOrderDate = null;
    var currentInPeriod = false;
    var currentInPrevPeriod = false;
    var currentIsToday = false;
    var currentChannel = 'ไม่ระบุช่องทาง';
    var currentCampaign = 'ไม่ระบุ Campaign';
    var currentIsCancelled = false;
    data.forEach(function(row) {
      if (row[0]) {
        currentId = String(row[0]);
        currentOrderDate = getEffectiveReportDate_(row);
        currentInPeriod     = !!(currentOrderDate && currentOrderDate >= rangeStart && currentOrderDate <= rangeEndInclusive);
        currentInPrevPeriod = !!(currentOrderDate && currentOrderDate >= prevStart && currentOrderDate <= prevEnd);
        currentIsToday      = !!(currentOrderDate && Utilities.formatDate(currentOrderDate, 'GMT+7', 'yyyy-MM-dd') === todayKey);
        var adRaw = row[16] ? String(row[16]).trim() : '';
        var orderShopee = row[20] || '';
        var orderTiktok = row[21] || '';
        currentCampaign = normalizeCampaignLabel_(row[17] ? String(row[17]) : 'ไม่ระบุ Campaign');
        currentIsCancelled = !!cancelledOrderIds[currentId];
        if (adRaw) currentChannel = adRaw;
        else if (orderShopee) currentChannel = 'Shopee';
        else if (orderTiktok) currentChannel = 'TikTok';
        else currentChannel = 'ไม่ระบุช่องทาง';
        if (currentInPeriod && !currentIsCancelled) {
          if (!orderIdsInPeriod[currentId]) channelOrderCount[currentChannel] = (channelOrderCount[currentChannel] || 0) + 1;
          orderIdsInPeriod[currentId] = true;
          if (row[7]) totalDelivery += parseFloat(row[7]) || 0;
        }
        if (currentInPrevPeriod && !currentIsCancelled) prevOrderIdsInPeriod[currentId] = true;
        if (currentIsToday && !currentIsCancelled)     todayOrderIds[currentId] = true;
      }
      var amount = parseFloat(row[8]) || 0;
      var discount    = parseFloat(row[5]) || 0;
      var qty         = parseFloat(row[3]) || 0;
      var productName = row[2] || '';
      var isCancelledItem = currentIsCancelled || isCancelledDashboardItem_(productName, row[19]);
      if (currentInPeriod && !currentIsCancelled) {
        totalAmount   += amount;
        if (currentChannel !== 'Bulk Buyers') {
          nonBulkAmount += amount;
          nonBulkOrderIdsInPeriod[currentId] = true;
        }
        totalDiscount += discount;
        rangeChannelAmount[currentChannel] = (rangeChannelAmount[currentChannel] || 0) + amount;
        if (currentOrderDate) {
          var dateKey = Utilities.formatDate(currentOrderDate, 'GMT+7', 'dd/MM');
          dailyMap[dateKey] = (dailyMap[dateKey] || 0) + amount;
        }
        if (productName) {
          rawProducts.push({ name: productName, amount: amount, qty: qty, channel: currentChannel });
          if (!isCancelledItem) channelCount[currentChannel] = (channelCount[currentChannel] || 0) + 1;
        }
        if (!isCancelledItem) {
          if (!campaignChannelAmount[currentCampaign]) campaignChannelAmount[currentCampaign] = { total: 0, channels: {} };
          campaignChannelAmount[currentCampaign].channels[currentChannel] = (campaignChannelAmount[currentCampaign].channels[currentChannel] || 0) + amount;
          campaignChannelAmount[currentCampaign].total += amount;
        }
      } else if (currentInPrevPeriod && !currentIsCancelled) {
        prevTotalAmount += amount;
      }
      if (currentIsToday && !currentIsCancelled) {
        todayAmount += amount;
        todayChannelAmount[currentChannel] = (todayChannelAmount[currentChannel] || 0) + amount;
      }
    });
    var totalOrders     = Object.keys(orderIdsInPeriod).length;
    var prevTotalOrders = Object.keys(prevOrderIdsInPeriod).length;
    var nonBulkOrders = Object.keys(nonBulkOrderIdsInPeriod).length;
    var aov = nonBulkOrders > 0 ? nonBulkAmount / nonBulkOrders : 0;
    var todayOrders = Object.keys(todayOrderIds).length;
    // ⚡ แก้ (24/8/69) — เป้าหมาย (Target) เปลี่ยนมาเทียบกับยอดขายจริง "รวมทั้งช่วงวันที่ที่เลือก" แทนยอด
    // เฉพาะเดือนปัจจุบันจริงเหมือนเดิม — ใช้ totalAmount/rangeChannelAmount (ซึ่งคำนวณตามช่วงที่เลือกอยู่
    // แล้วด้านบน) เป็นตัวตั้งแทน ตัวแปร monthAmount/monthOrders/monthChannelAmount ด้านล่างนี้จึงเป็นแค่ชื่อ
    // alias ไว้ให้โค้ดส่วนอื่น (การ์ด Flex LINE / ฟรอนต์เอนด์) ที่อ้างชื่อเดิมยังทำงานต่อได้โดยไม่ต้องแก้
    // ที่อื่นเพิ่ม (ถ้าเรียกด้วยช่วงวันที่ที่ตรงกับ 1 เดือนเป๊ะๆ เหมือนเดิม ผลลัพธ์จะเหมือนของเดิมทุกประการ)
    var monthAmount = totalAmount;
    var monthOrders = totalOrders;
    var monthChannelAmount = rangeChannelAmount;
    var pctToTarget = monthlyTarget > 0 ? Math.round((monthAmount / monthlyTarget) * 100) : null;
    function pctChange(cur, prev) {
      if (prev === 0) return cur > 0 ? 100 : 0;
      return Math.round(((cur - prev) / prev) * 100);
    }
    var dailyTrend = [];
    Object.keys(dailyMap).forEach(function(k) { dailyTrend.push({ date: k, amount: dailyMap[k] }); });
    dailyTrend.sort(function(a, b) {
      var pa = a.date.split('/'), pb = b.date.split('/');
      return (parseInt(pa[1]) * 100 + parseInt(pa[0])) - (parseInt(pb[1]) * 100 + parseInt(pb[0]));
    });
    var campaignReport = Object.keys(campaignChannelAmount).map(function(name) {
      var c = campaignChannelAmount[name];
      return { campaign: name, total: c.total, channels: c.channels, _groupKey: campaignGroupKey_(name) };
    });
    var campaignGroupTotals = {};
    campaignReport.forEach(function(c) { campaignGroupTotals[c._groupKey] = (campaignGroupTotals[c._groupKey] || 0) + c.total; });
    campaignReport.sort(function(a, b) {
      var groupDiff = campaignGroupTotals[b._groupKey] - campaignGroupTotals[a._groupKey];
      if (groupDiff !== 0) return groupDiff;
      if (a._groupKey !== b._groupKey) return a._groupKey < b._groupKey ? -1 : 1;
      return b.total - a.total;
    });
    campaignReport.forEach(function(c) { delete c._groupKey; });
    var channelTargetBreakdown = [];
    if (targets.channels) {
      Object.keys(targets.channels).forEach(function(tName) {
        var tVal = targets.channels[tName];
        if (!tVal || tVal <= 0) return;
        var actual = 0;
        Object.keys(monthChannelAmount).forEach(function(chName) { if (looseNameMatch_(chName, tName)) actual += monthChannelAmount[chName]; });
        channelTargetBreakdown.push({ name: tName, target: tVal, actual: actual });
      });
      channelTargetBreakdown.sort(function(a, b) { return b.target - a.target; });
    }
    return {
      success: true,
      data: {
        totalAmount: totalAmount, totalOrders: totalOrders, aov: aov,
        totalDiscount: totalDiscount, totalDelivery: totalDelivery,
        pctAmount: pctChange(totalAmount, prevTotalAmount), pctOrders: pctChange(totalOrders, prevTotalOrders),
        dailyTrend: dailyTrend, rawProducts: rawProducts, channel: channelCount,
        todayAmount: todayAmount, todayOrders: todayOrders, todayChannelAmount: todayChannelAmount,
        monthAmount: monthAmount, monthOrders: monthOrders, monthChannelAmount: monthChannelAmount,
        monthlyTarget: monthlyTarget, pctToTarget: pctToTarget,
        channelTargets: targets, channelTargetBreakdown: channelTargetBreakdown, campaignReport: campaignReport,
        channelAmount: rangeChannelAmount, channelOrderCount: channelOrderCount,
        rangeStart: Utilities.formatDate(rangeStart, 'GMT+7', 'yyyy-MM-dd'),
        rangeEnd:   Utilities.formatDate(rangeEndInclusive, 'GMT+7', 'yyyy-MM-dd')
      }
    };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function computeSegmentTotals_(bills, profiles, rangeStartArg, rangeEndArg, lookbackStartArg, lookbackEndArg) {
  var newKeys = {};
  var perCustomer = {};
  bills.forEach(function(b) {
    if (!b.orderDate || b.orderDate < rangeStartArg || b.orderDate > rangeEndArg) return;
    if (!b.customerName) return;
    var key = b.customerName.toLowerCase();
    var firstBillDate = (profiles[key] && profiles[key].bills.length) ? profiles[key].bills[0].orderDate : null;
    var isNew = firstBillDate && firstBillDate >= rangeStartArg && firstBillDate <= rangeEndArg;
    if (isNew) newKeys[key] = true;
    perCustomer[key] = (perCustomer[key] || 0) + 1;
  });
  var repeatCount = Object.keys(perCustomer).filter(function(k) {
    if (perCustomer[k] >= 2) return true;
    if (!lookbackStartArg || !lookbackEndArg || !profiles[k] || !profiles[k].bills) return false;
    return profiles[k].bills.some(function(pb) { return pb.orderDate && pb.orderDate >= lookbackStartArg && pb.orderDate <= lookbackEndArg; });
  }).length;
  return { newCount: Object.keys(newKeys).length, repeatCount: repeatCount };
}

function getMonthlyReportExtras(startDateStr, endDateStr) {
  try {
    var ss      = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet   = ss.getSheetByName(REVENUE_SHEET_NAME);
    var lastRow = sheet.getLastRow();
    var rangeStart = parseDateStr_(startDateStr); rangeStart.setHours(0, 0, 0, 0);
    var rangeEnd    = parseDateStr_(endDateStr);
    var rangeEndInclusive = new Date(rangeEnd);
    rangeEndInclusive.setHours(23, 59, 59, 999);
    var empty = {
      provinceStats: [], customerSegments: [], churnedCustomers: [], crossMonthCustomers: [],
      peakHour: null, topPromotions: [], highlights: {},
      lateNightStats: { count: 0, amount: 0, pctOfBills: 0 },
      customerCompare: { newCount: 0, prevNewCount: 0, pctNew: 0, repeatCount: 0, prevRepeatCount: 0, pctRepeat: 0 }
    };
    if (lastRow <= 1) return { success: true, data: empty };
    var raw = sheet.getRange(2, 1, lastRow - 1, 31).getValues();
    var cancelledOrderIds = collectCancelledOrderIds_(raw);
    var bills = [];
    var current = null;
    raw.forEach(function(row) {
      if (row[0]) {
        var od = getEffectiveReportDate_(row);
        if (cancelledOrderIds[String(row[0])]) {
          current = null;
        } else {
          current = { customerName: String(row[13] || '').trim(), customerType: String(row[18] || '').trim() || 'ไม่ระบุ', ad: String(row[16] || '').trim() || 'ไม่ระบุ Ad',
          province: String(row[23] || '').trim(), orderDate: od, amount: 0, products: [] };
        bills.push(current);
        }
      }
      if (current) {
        current.amount += parseFloat(row[6]) || 0;
        if (row[2]) current.products.push(String(row[2]) + (row[3] ? ' x' + row[3] : ''));
      }
    });
    var profiles = {};
    bills.forEach(function(b) {
      if (!b.customerName) return;
      var key = b.customerName.toLowerCase();
      if (!profiles[key]) profiles[key] = { bills: [] };
      profiles[key].bills.push(b);
    });
    Object.keys(profiles).forEach(function(key) {
      profiles[key].bills.sort(function(x, y) {
        var tx = x.orderDate ? x.orderDate.getTime() : 0;
        var ty = y.orderDate ? y.orderDate.getTime() : 0;
        return tx - ty;
      });
    });
    var refMonthDate_      = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    var prevCalMonthStart_ = new Date(refMonthDate_.getFullYear(), refMonthDate_.getMonth() - 1, 1);
    var prevCalMonthEnd_   = new Date(refMonthDate_.getFullYear(), refMonthDate_.getMonth(), 0, 23, 59, 59, 999);
    var prevPrevCalMonthStart_ = new Date(refMonthDate_.getFullYear(), refMonthDate_.getMonth() - 2, 1);
    var prevPrevCalMonthEnd_   = new Date(refMonthDate_.getFullYear(), refMonthDate_.getMonth() - 1, 0, 23, 59, 59, 999);
    var currentSegTotals_ = computeSegmentTotals_(bills, profiles, rangeStart, rangeEndInclusive, prevCalMonthStart_, prevCalMonthEnd_);
    var prevSegTotals_    = computeSegmentTotals_(bills, profiles, prevCalMonthStart_, prevCalMonthEnd_, prevPrevCalMonthStart_, prevPrevCalMonthEnd_);
    function pctChangeExtras_(cur, prev) { if (!prev) return cur > 0 ? 100 : 0; return Math.round(((cur - prev) / prev) * 100); }
    var customerCompare = {
      newCount: currentSegTotals_.newCount, prevNewCount: prevSegTotals_.newCount,
      pctNew: pctChangeExtras_(currentSegTotals_.newCount, prevSegTotals_.newCount),
      repeatCount: currentSegTotals_.repeatCount, prevRepeatCount: prevSegTotals_.repeatCount,
      pctRepeat: pctChangeExtras_(currentSegTotals_.repeatCount, prevSegTotals_.repeatCount)
    };
    var provinceMap = {};
    var hourCount   = {};
    var hourAmount  = {};
    var segMap      = {};
    var crossMonthMap_ = {};
    var billsInRangeCount = 0;
    var lateNightCount = 0, lateNightAmount = 0;
    bills.forEach(function(b) {
      if (!b.orderDate || b.orderDate < rangeStart || b.orderDate > rangeEndInclusive) return;
      billsInRangeCount++;
      if (b.ad !== 'Bulk Buyers' && b.province) {
        if (!provinceMap[b.province]) provinceMap[b.province] = { amount: 0, count: 0 };
        provinceMap[b.province].amount += b.amount;
        provinceMap[b.province].count++;
      }
      var hr = b.orderDate.getHours();
      var mn = b.orderDate.getMinutes();
      if (b.ad !== 'Bulk Buyers') {
        hourCount[hr] = (hourCount[hr] || 0) + 1;
      hourAmount[hr] = (hourAmount[hr] || 0) + b.amount;
      }
      if (hr < 7 || (hr === 7 && mn < 30)) { lateNightCount++; lateNightAmount += b.amount; }
      if (b.customerName) {
        var key = b.customerName.toLowerCase();
        var firstBillDate = profiles[key].bills[0].orderDate;
        var isNew = firstBillDate && firstBillDate >= rangeStart && firstBillDate <= rangeEndInclusive;
        if (!segMap[b.ad]) segMap[b.ad] = { newNames: {}, newAmt: 0, perCustomer: {} };
        var seg = segMap[b.ad];
        if (isNew) { seg.newNames[key] = true; seg.newAmt += b.amount; }
        if (!seg.perCustomer[key]) seg.perCustomer[key] = { count: 0, amt: 0, name: b.customerName, products: [], hadPrevCalMonth: false };
        seg.perCustomer[key].count++;
        seg.perCustomer[key].amt += b.amount;
        if (b.products && b.products.length) seg.perCustomer[key].products = seg.perCustomer[key].products.concat(b.products);
        var hadPrevMonthBill_ = profiles[key].bills.some(function(pb) { return pb.orderDate && pb.orderDate >= prevCalMonthStart_ && pb.orderDate <= prevCalMonthEnd_; });
        if (hadPrevMonthBill_) seg.perCustomer[key].hadPrevCalMonth = true;
        if (hadPrevMonthBill_) {
          if (!crossMonthMap_[key]) crossMonthMap_[key] = { name: b.customerName, ad: b.ad, count: 0, amt: 0, products: [] };
          crossMonthMap_[key].count++;
          crossMonthMap_[key].amt += b.amount;
          if (b.products && b.products.length) crossMonthMap_[key].products = crossMonthMap_[key].products.concat(b.products);
        }
      }
    });
    var lateNightStats = { count: lateNightCount, amount: Math.round(lateNightAmount), pctOfBills: billsInRangeCount > 0 ? Math.round((lateNightCount / billsInRangeCount) * 100) : 0 };
    var provinceMapKeys = Object.keys(provinceMap);
    var provinceTotalAll = provinceMapKeys.reduce(function(s, p) { return s + provinceMap[p].amount; }, 0);
    var provinceStats = provinceMapKeys.map(function(p) { return { province: p, amount: provinceMap[p].amount, count: provinceMap[p].count }; })
      .sort(function(x, y) { return y.amount - x.amount; }).slice(0, 10);
    var bestHour = null, bestCount = -1;
    Object.keys(hourCount).forEach(function(h) { if (hourCount[h] > bestCount) { bestCount = hourCount[h]; bestHour = parseInt(h, 10); } });
    var peakHour = null;
    if (bestHour !== null) {
      var endH = (bestHour + 1) % 24;
      function pad2(n) { return (n < 10 ? '0' : '') + n; }
      var peakAmount = hourAmount[bestHour] || 0;
      peakHour = {
        label: pad2(bestHour) + ':00 - ' + pad2(endH) + ':00 น.', count: bestCount,
        amount: peakAmount, avgPerBill: bestCount > 0 ? peakAmount / bestCount : 0
      };
    }
    var customerSegments = Object.keys(segMap).map(function(ad) {
      var seg = segMap[ad];
      var newCount = Object.keys(seg.newNames).length;
      var allKeys = Object.keys(seg.perCustomer);
      var totalCustomers = allKeys.length;
      var repeatKeys = allKeys.filter(function(k) { var pc = seg.perCustomer[k]; return pc.count >= 2; });
      var repeatCount = repeatKeys.length;
      var repeatAmt = repeatKeys.reduce(function(s, k) { return s + seg.perCustomer[k].amt; }, 0);
      var repeatCustomers = repeatKeys.map(function(k) { var c = seg.perCustomer[k]; return { name: c.name, count: c.count, amount: Math.round(c.amt), products: c.products }; })
        .sort(function(a, b) { return b.amount - a.amount; });
      return {
        ad: ad, newCount: newCount, newPct: totalCustomers > 0 ? Math.round((newCount / totalCustomers) * 100) : 0,
        newAvgValue: newCount > 0 ? Math.round(seg.newAmt / newCount) : 0,
        repeatCount: repeatCount, repeatPct: totalCustomers > 0 ? Math.round((repeatCount / totalCustomers) * 100) : 0,
        repeatAvgValue: repeatCount > 0 ? Math.round(repeatAmt / repeatCount) : 0, repeatCustomers: repeatCustomers
      };
    }).sort(function(x, y) { return (y.newCount + y.repeatCount) - (x.newCount + x.repeatCount); });
    var crossMonthCustomers = Object.keys(crossMonthMap_).map(function(k) {
      var c = crossMonthMap_[k];
      return { name: c.name, ad: c.ad, count: c.count, amount: Math.round(c.amt), products: c.products };
    }).sort(function(a, b) { return b.amount - a.amount; });
    var churnedMap = {};
    Object.keys(profiles).forEach(function(key) {
      var p = profiles[key];
      if (p.bills.length !== 1) return;
      var onlyBill = p.bills[0];
      if (!onlyBill.orderDate) return;
      var inThisRange = onlyBill.orderDate >= rangeStart && onlyBill.orderDate <= rangeEndInclusive;
      if (inThisRange) return;
      var ad = onlyBill.ad || 'ไม่ระบุ Ad';
      churnedMap[ad] = (churnedMap[ad] || 0) + 1;
    });
    var churnedCustomers = Object.keys(churnedMap).map(function(ad) { return { ad: ad, count: churnedMap[ad] }; }).sort(function(x, y) { return y.count - x.count; });
    var topPromotions = [];
    var campaignTotalAll = 0;
    var dashResult = getDashboardData(startDateStr, endDateStr);
    if (dashResult.success) {
      var allCampaigns = dashResult.data.campaignReport || [];
      campaignTotalAll = allCampaigns.reduce(function(s, c) { return s + c.total; }, 0);
      topPromotions = allCampaigns.slice().sort(function(x, y) { return y.total - x.total; }).slice(0, 3);
    }
    var highlights = {};
    if (provinceStats.length && provinceTotalAll > 0) {
      var pTop = provinceStats[0];
      highlights.province = pTop.province + ' ครองสัดส่วน ' + Math.round((pTop.amount / provinceTotalAll) * 100) + '% ของยอดขายที่ระบุจังหวัดทั้งหมด';
    }
    if (peakHour && billsInRangeCount > 0) highlights.peakHour = 'ช่วงเวลานี้คิดเป็น ' + Math.round((peakHour.count / billsInRangeCount) * 100) + '% ของบิลทั้งหมดในเดือนนี้';
    if (topPromotions.length && campaignTotalAll > 0) highlights.promotion = topPromotions[0].campaign + ' สร้างยอดขาย ' + Math.round((topPromotions[0].total / campaignTotalAll) * 100) + '% ของยอดขายที่มาจาก Campaign ทั้งหมด';
    var segsWithRepeat = customerSegments.filter(function(s) { return s.repeatCount > 0; });
    if (segsWithRepeat.length) {
      var bestSeg = segsWithRepeat.slice().sort(function(x, y) { return y.repeatPct - x.repeatPct; })[0];
      highlights.customer = bestSeg.ad + ' มีอัตราลูกค้าซื้อซ้ำสูงสุด ' + bestSeg.repeatPct + '% (เฉลี่ย ' + bestSeg.repeatAvgValue + ' บาท/คน)';
    }
    if (churnedCustomers.length) {
      var churnedTotal = churnedCustomers.reduce(function(s, c) { return s + c.count; }, 0);
      highlights.churned = 'มีลูกค้าที่ซื้อครั้งเดียวแล้วหายไปสะสมรวม ' + churnedTotal + ' คน';
    }
    if (crossMonthCustomers.length) {
      var crossMonthBillTotal_ = crossMonthCustomers.reduce(function(s, c) { return s + c.count; }, 0);
      highlights.crossMonth = 'มีลูกค้ากลับมาซื้อต่อเนื่องจากเดือนก่อน ' + crossMonthCustomers.length + ' คน รวม ' + crossMonthBillTotal_ + ' บิลในเดือนนี้';
    }
    return {
      success: true,
      data: { provinceStats: provinceStats, customerSegments: customerSegments, customerCompare: customerCompare,
        crossMonthCustomers: crossMonthCustomers, churnedCustomers: churnedCustomers, peakHour: peakHour,
        topPromotions: topPromotions, highlights: highlights, lateNightStats: lateNightStats }
    };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ==================== รายงานขั้นสูง: รายเดือนแยก Ad / สินค้าลดลง / พยากรณ์ / Cohort ====================

// ⚡ เพิ่ม (1/9/69) — ชื่อสินค้าในชีต Revenue เขียนไม่ตรงกันระหว่างช่องทาง (LINE shop / Shopee / TikTok
// ฯลฯ) ทั้งที่เป็นสินค้าตัวเดียวกัน ทำให้รายงาน "สินค้าที่ยอดขายกำลังลดลงต่อเนื่อง" (buildDecliningProducts_)
// เข้าใจผิดว่ายอดหายไป 100% ทั้งที่จริงๆ แค่ย้ายไปนับใต้ชื่ออีกแบบหนึ่ง — จับคู่แบบ "keyword" อัตโนมัติแทน
// (ไม่สร้างชีตใหม่ ตามที่ระบุ — แก้ list นี้ตรงนี้ในโค้ดได้เลยถ้าจะเพิ่ม/ลด keyword) เจอ keyword ไหนอยู่ตรง
// ไหนก็ได้ในชื่อสินค้า ถือว่าเป็นสินค้านั้นเลย ไม่สนใจว่าข้อความที่เหลือเขียนว่าอะไร — เรียงลำดับความสำคัญจาก
// บนลงล่างในลิสต์นี้ (ตัวบนสุดถูกเช็คก่อน) เช่น "คละรส" ต้องอยู่เหนือ "น้ำย้อย" เพราะสินค้าคละรสมีคำว่า
// "น้ำย้อย" ปนอยู่ในชื่อด้วย ถ้าไม่มี keyword ไหนตรงเลยก็ใช้ชื่อเดิม (แค่ตัดช่องว่างซ้ำ/หัวท้ายออก) เหมือนเดิม
// ทุกประการ ไม่กระทบข้อมูลดิบในชีต Revenue เลยสักบรรทัด (แก้แค่ตอนรวมยอดเพื่อออกรายงานเท่านั้น)
// ⚡ แก้ (1/9/69) — ไล่ดึงชื่อสินค้าจริงทุกตัวที่เคยเกิดในชีต Revenue (ก.ค.-ก.ย. 69) มาแล้ว จับกลุ่มสินค้า
// พื้นฐานให้ครบทุกตัวที่เจอ (ไม่ใช่แค่ 2-4 ตัวที่ยกตัวอย่างไว้ก่อนหน้า) กัน keyword ไม่ครบจนรายงานเพี้ยนซ้ำ —
// "คละรส" ต้องอยู่บนสุดเสมอเพราะกล่องคละรสมีทั้งคำว่า "น้ำย้อย" และ "ตะไคร้หอม" ปนอยู่ในชื่อด้วย ถ้าเจอสินค้า
// ใหม่ในอนาคตที่ไม่อยู่ในลิสต์นี้ ต้องมาเพิ่ม keyword เองตรงนี้ (ระบบเดาเองไม่ได้ว่าชื่อไหนคือสินค้าเดียวกัน)
var PRODUCT_KEYWORD_RULES_ = [
  { keyword: 'คละรส', canonical: 'คละรสชาติ น้ำพริกน้ำย้อย ลงเรือ ตะไคร้' },
  { keyword: 'หมี่คลุก', canonical: 'หมี่คลุกน้ำพริกหนังแซลมอนกรอบ' },
  { keyword: 'หมี่ชมพู', canonical: 'หมี่ชมพูน้ำพริกหนังแซลมอนกรอบ' },
  { keyword: 'น้ำย้อย', canonical: 'น้ำพริกน้ำย้อย' },
  { keyword: 'ตะไคร้หอม', canonical: 'น้ำพริกตะไคร้หอม' },
  { keyword: 'ปลาดุกฟู', canonical: 'น้ำพริกปลาดุกฟูพริกขิง' },
  { keyword: 'ลงเรือกรอบ', canonical: 'น้ำพริกลงเรือกรอบ' },
  { keyword: 'ก๋วยเตี๋ยวเรือ', canonical: 'ก๋วยเตี๋ยวเรือเส้นเล็กกึ่งสำเร็จรูปแบบน้ำ' },
  { keyword: 'ก๋วยเตี๋ยวแห้ง', canonical: 'ก๋วยเตี๋ยวแห้งกึ่งสำเร็จ' }
];
function normalizeProductNameKey_(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}
function canonicalProductName_(raw) {
  var cleaned = normalizeProductNameKey_(raw);
  for (var i = 0; i < PRODUCT_KEYWORD_RULES_.length; i++) {
    if (cleaned.indexOf(PRODUCT_KEYWORD_RULES_[i].keyword) !== -1) return PRODUCT_KEYWORD_RULES_[i].canonical;
  }
  return cleaned;
}

function computeBillsFromSheet_() {
  var ss      = SpreadsheetApp.openById(REVENUE_SHEET_ID);
  var sheet   = ss.getSheetByName(REVENUE_SHEET_NAME);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var raw = sheet.getRange(2, 1, lastRow - 1, 31).getValues();
  var cancelledOrderIds = collectCancelledOrderIds_(raw);
  var bills = [];
  var current = null;
  raw.forEach(function(row) {
    if (row[0]) {
      var od = getEffectiveReportDate_(row);
      var adRaw = row[16] ? String(row[16]).trim() : '';
      var orderShopee = row[20] || '';
      var orderTiktok = row[21] || '';
      var channel = adRaw ? adRaw : (orderShopee ? 'Shopee' : (orderTiktok ? 'TikTok' : 'ไม่ระบุช่องทาง'));
      if (cancelledOrderIds[String(row[0])]) {
        current = null;
      } else {
        current = {
          orderDate: od, channel: channel, campaign: normalizeCampaignLabel_(row[17] ? String(row[17]) : 'ไม่ระบุ Campaign'),
        customerName: String(row[13] || '').trim(), customerType: String(row[18] || '').trim(), amount: 0, products: []
      };
      bills.push(current);
      }
    }
    if (current) {
      var amt = parseFloat(row[8]) || 0;
      current.amount += amt;
      if (row[2]) current.products.push({ name: canonicalProductName_(row[2]), amount: amt });
    }
  });
  return bills;
}

function buildMonthlyAdComparison_(bills) {
  var monthsMap = {};
  bills.forEach(function(b) {
    if (!b.orderDate) return;
    var mKey = Utilities.formatDate(b.orderDate, 'GMT+7', 'yyyy-MM');
    if (!monthsMap[mKey]) {
      monthsMap[mKey] = {
        monthKey: mKey, monthDate: new Date(b.orderDate.getFullYear(), b.orderDate.getMonth(), 1),
        totalActual: 0, channelActual: {}, productAmount: {}, campaignAmount: {}, hourCount: {},
        customerChannelCount: {}, billCount: 0
      };
    }
    var m = monthsMap[mKey];
    m.totalActual += b.amount;
    m.billCount++;
    m.channelActual[b.channel] = (m.channelActual[b.channel] || 0) + b.amount;
    m.campaignAmount[b.campaign] = (m.campaignAmount[b.campaign] || 0) + b.amount;
    b.products.forEach(function(p) {
      m.productAmount[p.name] = (m.productAmount[p.name] || 0) + p.amount;
    });
    if (b.orderDate) {
      var hr = b.orderDate.getHours();
      m.hourCount[hr] = (m.hourCount[hr] || 0) + 1;
    }
    if (b.customerName) {
      var custKey = b.channel + '|||' + b.customerName.toLowerCase();
      if (!m.customerChannelCount[custKey]) {
        m.customerChannelCount[custKey] = { channel: b.channel, name: b.customerName, count: 0, products: {} };
      }
      m.customerChannelCount[custKey].count++;
      b.products.forEach(function(p) { m.customerChannelCount[custKey].products[p.name] = true; });
    }
  });

  var monthKeys = Object.keys(monthsMap).sort().reverse();
  var months = monthKeys.map(function(mKey) {
    var m = monthsMap[mKey];
    var targets = getMonthlyTargets(m.monthDate);

    var channels = Object.keys(targets.channels || {}).map(function(tName) {
      var tVal = targets.channels[tName];
      var actual = 0;
      Object.keys(m.channelActual).forEach(function(chName) {
        if (looseNameMatch_(chName, tName)) actual += m.channelActual[chName];
      });
      return { name: tName, target: tVal, actual: actual };
    }).filter(function(c) { return c.target > 0; }).sort(function(a, b) { return b.target - a.target; });
    var targetedNames = channels.map(function(c) { return c.name; });
    Object.keys(m.channelActual).forEach(function(chName) {
      var alreadyCounted = targetedNames.some(function(tn) { return looseNameMatch_(chName, tn); });
      if (!alreadyCounted) channels.push({ name: chName, target: 0, actual: m.channelActual[chName] });
    });

    var topProducts = Object.keys(m.productAmount).map(function(n) { return { name: n, amount: m.productAmount[n] }; })
      .sort(function(a, b) { return b.amount - a.amount; }).slice(0, 3);

    var topPromotions = Object.keys(m.campaignAmount).map(function(n) { return { campaign: n, amount: m.campaignAmount[n] }; })
      .sort(function(a, b) { return b.amount - a.amount; }).slice(0, 3);

    var peakHour = null, bestH = -1, bestC = -1;
    Object.keys(m.hourCount).forEach(function(h) { if (m.hourCount[h] > bestC) { bestC = m.hourCount[h]; bestH = parseInt(h, 10); } });
    if (bestH !== -1) {
      var p2 = function(n) { return (n < 10 ? '0' : '') + n; };
      peakHour = { label: p2(bestH) + ':00 - ' + p2((bestH + 1) % 24) + ':00 น.', count: bestC };
    }

    var byChannelRepeat = {};
    Object.keys(m.customerChannelCount).forEach(function(k) {
      var c = m.customerChannelCount[k];
      if (c.count < 2) return;
      if (!byChannelRepeat[c.channel]) byChannelRepeat[c.channel] = [];
      byChannelRepeat[c.channel].push({ name: c.name, count: c.count, products: Object.keys(c.products) });
    });
    var repeatCustomersByChannel = Object.keys(byChannelRepeat).map(function(ch) {
      var list = byChannelRepeat[ch].sort(function(a, b) { return b.count - a.count; });
      return { channel: ch, repeatCount: list.length, customers: list };
    }).sort(function(a, b) { return b.repeatCount - a.repeatCount; });

    var by = parseInt(mKey.slice(0, 4), 10) + 543;
    var monthLabel = THAI_MONTHS_FULL_[m.monthDate.getMonth()] + ' ' + by;

    return {
      monthKey: mKey, monthLabel: monthLabel, billCount: m.billCount,
      totalActual: m.totalActual, totalTarget: targets.total || 0,
      channels: channels, topProducts: topProducts, topPromotions: topPromotions,
      peakHour: peakHour, repeatCustomersByChannel: repeatCustomersByChannel
    };
  });

  return { months: months };
}

function getMonthlyAdComparisonReport() {
  try {
    var bills = computeBillsFromSheet_();
    var r = buildMonthlyAdComparison_(bills);
    return { success: true, months: r.months };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ⚡ แก้ (1/9/69) — เดิมเทียบยอด 3 เดือน (v0,v1,v2) แล้วโชว์ทั้ง % เทียบเดือนก่อน กับ % เทียบ 3 เดือนก่อน
// พร้อมกัน 2 คอลัมน์ — ตัดคอลัมน์ "เทียบ 3 เดือนก่อน" ออกตามที่ระบุว่าไม่มีประโยชน์ (เทียบผิด เพราะบังคับให้
// ต้องมีข้อมูลครบ 3 เดือนก่อนถึงจะขึ้นรายงานได้ ทำให้เห็นสินค้าที่เพิ่งเริ่มลดยอดช้าไปหนึ่งเดือนเต็มๆ) เหลือ
// แค่เทียบเดือนล่าสุดกับเดือนก่อนหน้าเดือนเดียว คำนวณส่วนต่างเป็นบาทก่อน แล้วค่อยแปลงเป็น % จากเดือนก่อน
//
// ⚡ แก้ (1/9/69, รอบ 2) — เดิมเทียบ "ทั้งเดือนก่อน" กับ "ทั้งเดือนนี้" ตรงๆ (sum ทุกบิลของทั้งเดือนตามปฏิทิน)
// ซึ่งถ้ารันรายงานตอนต้นเดือน (เช่นวันที่ 1) เดือนนี้จะมีข้อมูลแค่ไม่กี่ชั่วโมงเทียบกับเดือนก่อนที่มีครบทั้งเดือน
// ทำให้แทบทุกสินค้าติดลบเกือบ 100% เสมอไม่ว่าจะขายดีจริงแค่ไหน (ไม่ใช่ปัญหาเรื่อง keyword จับชื่อไม่ครบ —
// สังเกตว่าแถว "คละรส" ที่ keyword รวมเป็นแถวเดียวเรียบร้อยแล้วก็ยังติด -100% เหมือนกัน เพราะเป็นปัญหาการเทียบ
// ช่วงเวลาที่ไม่เท่ากัน ไม่เกี่ยวกับการจับคู่ชื่อสินค้าเลย) — แก้เป็นเทียบ "เดือนนี้ตั้งแต่วันที่ 1 ถึงวันนี้"
// กับ "เดือนก่อนช่วงวันที่เดียวกัน" แทน (เช่น รันวันที่ 1 ก.ย. ก็เทียบแค่ 1 ก.ย. กับ 1 ส.ค. วันเดียว ไม่เอาทั้ง
// เดือน ส.ค. มาเทียบ) ทำให้เทียบกันแบบยุติธรรมไม่ว่าจะรันรายงานวันไหนของเดือนก็ตาม
// ⚡ แก้ (1/9/69, รอบ 3) — ตามที่ระบุ: ให้เอาข้อมูล 3 เดือนมาโชว์ แต่ "ห้ามใช้เดือนปัจจุบันมาเทียบ" เพราะ
// เดือนปัจจุบันยังไม่จบ (ข้อมูลไม่ครบ เทียบแล้วเพี้ยนเหมือนที่เจอไปตอนวันที่ 1 ก.ย.) ต้องใช้ "2 เดือนล่าสุดที่
// จบสมบูรณ์แล้ว" มาเทียบกันแทน (เช่น ถ้าวันนี้อยู่ในเดือน ก.ย. ก็ต้องเทียบ ก.ค. กับ ส.ค. — ไม่ใช่ ส.ค. กับ ก.ย.)
// ส่วนเดือนปัจจุบัน (ก.ย.) ยังคงดึงมาโชว์ในตารางเป็นข้อมูลอ้างอิงคอลัมน์ที่ 3 ได้ (ข้อมูลเท่าที่มีถึงวันนี้)
// แต่ไม่เอามาคำนวณ % หรือใช้ตัดสินว่าสินค้าไหน "กำลังลดลง" เพราะยังไม่จบเดือนจริง
// ใช้เฉพาะ Early Warning เพื่อไม่ให้เปลี่ยนผลรายงานส่วนอื่น
var DECLINING_PRODUCT_KEYWORDS_ = [
  { keyword: 'รำข้าว', label: 'น้ำมันรำข้าว' },
  { keyword: 'หม่าล่า', label: 'น้ำมันหม่าล่า' },
  { keyword: 'งา', label: 'น้ำมันงา' },
  { keyword: 'คละรสชาติ', label: 'น้ำพริกคละรส' },
  { keyword: 'น้ำพริกน้ำย้อย', label: 'น้ำพริกน้ำย้อย' },
  { keyword: 'หมี่คลุก', label: 'หมี่คลุกน้ำพริกหนังแซลมอนกรอบ' },
  { keyword: 'หมี่ชมพู', label: 'หมี่ชมพูน้ำพริกหนังแซลมอนกรอบ' },
  
  { keyword: 'ตะไคร้', label: 'น้ำพริกตะไคร้หอม' },
  { keyword: 'ลงเรือกรอบ', label: 'น้ำพริกลงเรือกรอบ' },
  { keyword: 'ปลาดุก', label: 'น้ำพริกปลาดุกฟูพริกขิง' },
  { keyword: 'เตี๋ยวเรือ', label: 'ก๋วยเตี๋ยวเรือ' },
  { keyword: 'เตี่ยวเรือ', label: 'ก๋วยเตี๋ยวเรือ' },
  { keyword: 'เตี๋ยวแห้ง', label: 'ก๋วยเตี๋ยวแห้ง' },
  { keyword: 'เตี่ยวแห้ง', label: 'ก๋วยเตี๋ยวแห้ง' }
];

function normalizeDecliningProductByKeyword_(name) {
  var raw = String(name || '').replace(/[\[\]]/g, '').trim();
  var normalized = raw.toLowerCase();
  for (var i = 0; i < DECLINING_PRODUCT_KEYWORDS_.length; i++) {
    if (normalized.indexOf(DECLINING_PRODUCT_KEYWORDS_[i].keyword.toLowerCase()) !== -1) {
      return DECLINING_PRODUCT_KEYWORDS_[i].label;
    }
  }
  return raw || 'ไม่ระบุสินค้า';
}

function buildDecliningProducts_(bills, now) {
  now = now || new Date();
  function monthRange_(anchorDate) {
    var start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1, 0, 0, 0, 0);
    var end   = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start: start, end: end };
  }
  // เดือนก่อนหน้านี้ 1 เดือน (จบสมบูรณ์แล้วแน่นอน) และเดือนก่อนหน้านั้นอีกเดือน (จบสมบูรณ์แล้วแน่นอน) — 2 เดือน
  // นี้คือคู่ที่ใช้เทียบกันจริง ไม่แตะเดือนปัจจุบันเลย
  var rangeOlder = monthRange_(new Date(now.getFullYear(), now.getMonth() - 2, 1));  // เช่น ก.ค.
  var rangeRecent = monthRange_(new Date(now.getFullYear(), now.getMonth() - 1, 1)); // เช่น ส.ค. (จบแล้ว)
  var rangeCurrent = { start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0), end: now }; // เช่น ก.ย. (ยังไม่จบ อ้างอิงอย่างเดียว)

  var productAmount = {};
  var hasOlderData = false, hasRecentData = false;
  bills.forEach(function(b) {
    if (!b.orderDate) return;
    var inOlder  = b.orderDate >= rangeOlder.start  && b.orderDate <= rangeOlder.end;
    var inRecent = b.orderDate >= rangeRecent.start && b.orderDate <= rangeRecent.end;
    var inCurrent = b.orderDate >= rangeCurrent.start && b.orderDate <= rangeCurrent.end;
    if (!inOlder && !inRecent && !inCurrent) return;
    if (inOlder) hasOlderData = true;
    if (inRecent) hasRecentData = true;
    b.products.forEach(function(p) {
      var productKey = normalizeDecliningProductByKeyword_(p.name);
      if (!productAmount[productKey]) productAmount[productKey] = { older: 0, recent: 0, current: 0 };
      if (inOlder) productAmount[productKey].older += p.amount;
      if (inRecent) productAmount[productKey].recent += p.amount;
      if (inCurrent) productAmount[productKey].current += p.amount;
    });
  });
  if (!hasOlderData || !hasRecentData) return { products: [], monthLabels: [] };

  var results = [];
  Object.keys(productAmount).forEach(function(name) {
    var vOlder = productAmount[name].older, vRecent = productAmount[name].recent, vCurrent = productAmount[name].current;
    if (vOlder <= 0) return;
    var isDeclining = vRecent < vOlder; // เทียบแค่ 2 เดือนที่จบแล้ว (เก่ากว่า vs ล่าสุดที่จบแล้ว) เท่านั้น
    if (!isDeclining) return;
    var diff = vRecent - vOlder;
    var pctVsLastMonth = Math.round((diff / vOlder) * 100);
    results.push({ name: name, monthAmounts: [vOlder, vRecent, vCurrent], diff: diff, pctVsLastMonth: pctVsLastMonth });
  });
  results.sort(function(a, b) { return a.pctVsLastMonth - b.pctVsLastMonth; });
  results = results.slice(0, 10);

  function labelFor_(range) {
    var yy = range.end.getFullYear() + 543;
    var moLabel = THAI_MONTHS_FULL_[range.end.getMonth()] + ' ' + yy;
    var isFullMonth = range.start.getDate() === 1
      && range.end.getDate() === new Date(range.end.getFullYear(), range.end.getMonth() + 1, 0).getDate();
    return isFullMonth ? moLabel : moLabel + ' (1-' + range.end.getDate() + ')';
  }
  var monthLabels = [labelFor_(rangeOlder), labelFor_(rangeRecent), labelFor_(rangeCurrent) + ' (เดือนนี้ ยังไม่จบ)'];
  return { products: results, monthLabels: monthLabels };
}

function computeDecliningProductBillsFromSheet_() {
  var ss = SpreadsheetApp.openById(REVENUE_SHEET_ID);
  var sheet = ss.getSheetByName(REVENUE_SHEET_NAME);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var raw = sheet.getRange(2, 1, lastRow - 1, 31).getValues();
  var cancelledOrderIds = collectCancelledOrderIds_(raw);
  var bills = [];
  var current = null;

  raw.forEach(function(row) {
    if (row[0]) {
      var orderId = String(row[0]);
      var isLineShop = String(row[16] || '').trim().toLowerCase() === 'line shop';
      var hasPaid = String(row[30] || '').trim() !== '';
      current = cancelledOrderIds[orderId] || (isLineShop && !hasPaid) ? null : {
        orderDate: getEffectiveReportDate_(row),
        billTotal: parseFloat(row[8]) || 0,
        products: []
      };
      if (current) bills.push(current);
    }
    if (!current) return;

    var productName = String(row[2] || '').trim();
    if (!productName) return;
    current.products.push({
      name: productName,
      amount: parseFloat(row[6]) || 0
    });
  });

  bills.forEach(function(bill) {
    if (bill.products.length === 1) {
      bill.products[0].amount = bill.billTotal;
    }
  });
  return bills;
}

function getDecliningProductsReport() {
  try {
    var bills = computeDecliningProductBillsFromSheet_();
    var r = buildDecliningProducts_(bills);
    return { success: true, products: r.products, monthLabels: r.monthLabels };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function buildSalesForecast_(bills) {
  var monthTotals = {};
  bills.forEach(function(b) {
    if (!b.orderDate) return;
    var mKey = Utilities.formatDate(b.orderDate, 'GMT+7', 'yyyy-MM');
    monthTotals[mKey] = (monthTotals[mKey] || 0) + b.amount;
  });

  var monthKeys = Object.keys(monthTotals).sort();
  var now = new Date();
  var curKey = Utilities.formatDate(now, 'GMT+7', 'yyyy-MM');
  var historyKeys = monthKeys.filter(function(k) { return k !== curKey; });
  if (historyKeys.length < 2) return { hasEnoughData: false };

  var use = historyKeys.slice(-6);
  var n = use.length;
  var xs = use.map(function(_, i) { return i; });
  var ys = use.map(function(k) { return monthTotals[k]; });
  var sumX = xs.reduce(function(s, x) { return s + x; }, 0);
  var sumY = ys.reduce(function(s, y) { return s + y; }, 0);
  var sumXY = 0, sumXX = 0;
  for (var i = 0; i < n; i++) { sumXY += xs[i] * ys[i]; sumXX += xs[i] * xs[i]; }
  var denom = (n * sumXX - sumX * sumX);
  var slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  var intercept = (sumY - slope * sumX) / n;
  var forecastVal = Math.max(0, slope * n + intercept);

  var lastMonthDate = parseDateStr_(use[use.length - 1] + '-01');
  var nextMonthDate = new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 1);
  var nextTargets = getMonthlyTargets(nextMonthDate);
  var nextBy = nextMonthDate.getFullYear() + 543;
  var nextMonthLabel = THAI_MONTHS_FULL_[nextMonthDate.getMonth()] + ' ' + nextBy;

  var history = use.map(function(k) {
    var yy = parseInt(k.slice(0, 4), 10) + 543;
    var mo = parseInt(k.slice(5, 7), 10) - 1;
    return { label: THAI_MONTHS_FULL_[mo] + ' ' + yy, amount: monthTotals[k] };
  });

  return {
    hasEnoughData: true, history: history,
    forecastAmount: forecastVal, forecastLabel: nextMonthLabel,
    target: nextTargets.total || 0,
    pctToTarget: nextTargets.total > 0 ? Math.round((forecastVal / nextTargets.total) * 100) : null
  };
}

function getSalesForecastReport() {
  try {
    var bills = computeBillsFromSheet_();
    var r = buildSalesForecast_(bills);
    if (!r.hasEnoughData) return { success: true, hasEnoughData: false };
    return {
      success: true, hasEnoughData: true, history: r.history,
      forecastAmount: r.forecastAmount, forecastLabel: r.forecastLabel,
      target: r.target, pctToTarget: r.pctToTarget
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function buildCohortRetention_(bills) {
  var profiles = {};
  var allMonthSet = {};
  bills.forEach(function(b) {
    if (!b.customerName || !b.orderDate) return;
    var key = b.customerName.toLowerCase();
    var mKey = Utilities.formatDate(b.orderDate, 'GMT+7', 'yyyy-MM');
    allMonthSet[mKey] = true;
    if (!profiles[key]) profiles[key] = {};
    profiles[key][mKey] = (profiles[key][mKey] || 0) + 1;
  });

  var cohortMap = {};
  Object.keys(profiles).forEach(function(key) {
    var months = Object.keys(profiles[key]).sort();
    var firstMonth = months[0];
    if (!cohortMap[firstMonth]) cohortMap[firstMonth] = [];
    cohortMap[firstMonth].push(key);
  });

  var allMonthKeysSorted = Object.keys(allMonthSet).sort();
  var monthIndex = {};
  allMonthKeysSorted.forEach(function(k, i) { monthIndex[k] = i; });

  var cohortKeysSorted = Object.keys(cohortMap).sort();
  var maxOffsetCap = 11;
  var maxOffset = 0;

  var cohorts = cohortKeysSorted.map(function(cKey) {
    var custKeys = cohortMap[cKey];
    var size = custKeys.length;
    var startIdx = monthIndex[cKey];
    var availableOffset = Math.min(maxOffsetCap, (allMonthKeysSorted.length - 1) - startIdx);
    if (availableOffset > maxOffset) maxOffset = availableOffset;
    var retention = [];
    for (var off = 0; off <= availableOffset; off++) {
      var targetMonthKey = allMonthKeysSorted[startIdx + off];
      var retainedCount = 0;
      var repeatWithinMonthCount = 0;
      custKeys.forEach(function(ck) {
        var cnt = profiles[ck][targetMonthKey] || 0;
        if (cnt > 0) retainedCount++;
        if (cnt >= 2) repeatWithinMonthCount++;
      });
      retention.push({
        offset: off,
        pct: size > 0 ? Math.round((retainedCount / size) * 100) : 0,
        count: retainedCount,
        repeatWithinMonthCount: repeatWithinMonthCount,
        repeatWithinMonthPct: size > 0 ? Math.round((repeatWithinMonthCount / size) * 100) : 0
      });
    }
    var yy = parseInt(cKey.slice(0, 4), 10) + 543;
    var mo = parseInt(cKey.slice(5, 7), 10) - 1;
    return { cohortKey: cKey, cohortLabel: THAI_MONTHS_FULL_[mo] + ' ' + yy, size: size, retention: retention };
  });

  return { cohorts: cohorts, maxOffset: maxOffset };
}

function getCohortRetentionReport() {
  try {
    var bills = computeBillsFromSheet_();
    var r = buildCohortRetention_(bills);
    return { success: true, cohorts: r.cohorts, maxOffset: r.maxOffset };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getAdvancedReportsBundle() {
  try {
    var bills = computeBillsFromSheet_();
    return {
      success: true,
      monthlyAdComparison: buildMonthlyAdComparison_(bills),
      decliningProducts: buildDecliningProducts_(computeDecliningProductBillsFromSheet_()),
      salesForecast: buildSalesForecast_(bills),
      cohortRetention: buildCohortRetention_(bills)
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function pctChangeColor_(pct) {
  if (pct < 0)    return '#e53935';
  if (pct === 0)  return '#9e9e9e';
  if (pct <= 49)  return '#1a5c2a';
  if (pct <= 100) return '#00c853';
  return '#00b0ff';
}
function targetPctColor_(pct) {
  if (pct < 50)   return '#e53935';
  if (pct < 80)   return '#fb8c00';
  if (pct < 100)  return '#fbc02d';
  if (pct <= 104) return '#00c853';
  return '#00b0ff';
}
function weekMonthTrendColor_(pct) {
  if (pct > 0) return '#2e7d32';
  if (pct < 0) return '#e53935';
  return '#9e9e9e';
}
function pctChangeCalc_(cur, prev) {
  if (!prev || prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}
function mondayOfWeek_(d) {
  var date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var day = date.getDay();
  var diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date;
}
function computeWeekCompare_() {
  var now = new Date();
  var thisWeekStart = mondayOfWeek_(now);
  var prevWeekStart = new Date(thisWeekStart.getTime() - 7 * 86400000);
  var prevWeekEnd   = new Date(now.getTime() - 7 * 86400000);
  var fmt = function(dt) { return Utilities.formatDate(dt, 'GMT+7', 'yyyy-MM-dd'); };
  var thisRes = getDashboardData(fmt(thisWeekStart), fmt(now));
  var prevRes = getDashboardData(fmt(prevWeekStart), fmt(prevWeekEnd));
  var thisAmt = (thisRes.success ? thisRes.data.totalAmount : 0) || 0;
  var prevAmt = (prevRes.success ? prevRes.data.totalAmount : 0) || 0;
  var rangeLabel = fmtThaiDate_(fmt(thisWeekStart)) + ' - ' + fmtThaiDate_(fmt(now));
  return { label: '📅 ยอดขายสัปดาห์นี้ (' + rangeLabel + ') เทียบสัปดาห์ที่แล้ว', thisAmt: thisAmt, prevAmt: prevAmt, pct: pctChangeCalc_(thisAmt, prevAmt) };
}
function computeMonthCompare_(monthDate) {
  var y = monthDate.getFullYear(), m = monthDate.getMonth();
  var thisStart = new Date(y, m, 1);
  var thisEnd   = new Date(y, m + 1, 0);
  var prevStart = new Date(y, m - 1, 1);
  var prevEnd   = new Date(y, m, 0);
  var fmt = function(dt) { return Utilities.formatDate(dt, 'GMT+7', 'yyyy-MM-dd'); };
  var thisRes = getDashboardData(fmt(thisStart), fmt(thisEnd));
  var prevRes = getDashboardData(fmt(prevStart), fmt(prevEnd));
  var thisAmt = (thisRes.success ? thisRes.data.totalAmount : 0) || 0;
  var prevAmt = (prevRes.success ? prevRes.data.totalAmount : 0) || 0;
  var monthLabel = THAI_MONTHS_FULL_[m] + ' ' + (y + 543);
  return { label: '📆 ยอดขายเดือน' + monthLabel + ' เทียบเดือนก่อน', thisAmt: thisAmt, prevAmt: prevAmt, pct: pctChangeCalc_(thisAmt, prevAmt) };
}

function buildDashboardFlexMessage(d, compareOverride, affiliateSummary, weeklyExtras) {
  function fmtBaht(v) { return '฿' + Math.round(v || 0).toLocaleString('th-TH'); }
  function fmtBahtExact(v) { var n = parseFloat(v) || 0; return '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 6 }); }
  var thaiMonthsFull  = THAI_MONTHS_FULL_;
  var rangeLabel = fmtThaiRange_(d.rangeStart, d.rangeEnd);
  var nowForLabel = new Date();
  var todayLabel = fmtThaiDate_(Utilities.formatDate(nowForLabel, 'GMT+7', 'yyyy-MM-dd'));
  var thisMonthLabel = thaiMonthsFull[nowForLabel.getMonth()] + ' ' + (nowForLabel.getFullYear() + 543);
  var compare = compareOverride || computeWeekCompare_();
  function progressBar(pct, color) {
    var clamped = Math.max(0, Math.min(100, pct));
    return { type: 'box', layout: 'vertical', height: '8px', cornerRadius: '4px', backgroundColor: '#E0E0E0',
      contents: [ { type: 'box', layout: 'vertical', height: '8px', width: clamped + '%', cornerRadius: '4px', backgroundColor: color, contents: [ { type: 'filler' } ] } ] };
  }
  function compareBlock(cmp) {
    var pct = cmp.pct;
    var color = weekMonthTrendColor_(pct);
    var arrow = pct > 0 ? '▲' : (pct < 0 ? '▼' : '●');
    var sign = pct > 0 ? '+' : '';
    return { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs',
      contents: [
        { type: 'separator', margin: 'none' },
        { type: 'text', text: cmp.label, size: 'xs', color: '#616161', margin: 'md', wrap: true },
        { type: 'box', layout: 'horizontal', margin: 'sm', alignItems: 'center', contents: [
            { type: 'text', text: fmtBaht(cmp.thisAmt), size: 'lg', weight: 'bold', color: '#1a5c2a', flex: 2 },
            { type: 'text', text: arrow + ' ' + sign + pct + '%', size: 'sm', weight: 'bold', color: color, align: 'end', flex: 1 }
        ]},
        { type: 'text', text: 'ก่อนหน้า: ' + fmtBaht(cmp.prevAmt), size: 'xxs', color: '#9e9e9e' }
      ] };
  }
  function kpiRow(icon, label, value, valueColor, chipBg) {
    return { type: 'box', layout: 'horizontal', alignItems: 'center', contents: [
        { type: 'text', text: icon + ' ' + label, size: 'sm', color: '#616161', flex: 3, wrap: true },
        { type: 'box', layout: 'vertical', flex: 2, cornerRadius: '12px', backgroundColor: chipBg || '#e8f5e9', paddingAll: '6px',
          contents: [ { type: 'text', text: value, size: 'sm', color: valueColor || '#1a5c2a', weight: 'bold', align: 'end' } ] }
      ] };
  }
  function channelBlock(label, actual, target) {
    var pct = target > 0 ? Math.round((actual / target) * 100) : 0;
    var color = targetPctColor_(pct);
    return { type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs',
      contents: [
        { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: label, size: 'xs', color: '#424242', weight: 'bold', flex: 3 },
            { type: 'text', text: pct + '%', size: 'xs', color: color, weight: 'bold', align: 'end', flex: 1 }
        ]},
        progressBar(pct, color),
        { type: 'text', text: fmtBaht(actual) + ' / ' + fmtBaht(target), size: 'xxs', color: '#9e9e9e' }
      ] };
  }
  function todayChannelText_(dd) {
    var names = Object.keys(dd.todayChannelAmount || {}).sort(function(a, b) { return (dd.todayChannelAmount[b] || 0) - (dd.todayChannelAmount[a] || 0); });
    if (!names.length) return '';
    return names.map(function(n) { return n + ' ' + fmtBaht(dd.todayChannelAmount[n]); }).join('   ·   ');
  }
  var bodyContents = [ kpiRow('🔸', 'ยอดขายวันนี้ (' + todayLabel + ')', fmtBaht(d.todayAmount)) ];
  var todayChText = todayChannelText_(d);
  if (todayChText) bodyContents.push({ type: 'text', text: '　　' + todayChText, size: 'xxs', color: '#9e9e9e', margin: 'xs', wrap: true });
  bodyContents.push(
    kpiRow('🔸', 'ยอดขายรวม (' + rangeLabel + ')', fmtBaht(d.totalAmount), pctChangeColor_(d.pctAmount || 0)),
    kpiRow('🔸', 'จำนวนบิล', d.totalOrders + ' บิล', pctChangeColor_(d.pctOrders || 0)),
    kpiRow('🔸', 'มูลค่าเฉลี่ย/บิล', fmtBaht(d.aov))
  );
  bodyContents.push(compareBlock(compare));
  if (weeklyExtras && weeklyExtras.customerCompare) {
    var customerCompare = weeklyExtras.customerCompare;
    bodyContents.push({ type: 'separator', margin: 'lg' });
    bodyContents.push({ type: 'text', text: '👥 ลูกค้าใหม่ / ซื้อซ้ำ', size: 'sm', weight: 'bold', color: '#1a5c2a', margin: 'lg' });
    bodyContents.push(kpiRow('🔸', 'ลูกค้าใหม่', customerCompare.newCount + ' คน', pctChangeColor_(customerCompare.pctNew || 0)));
    bodyContents.push(kpiRow('🔸', 'ลูกค้าซื้อซ้ำ', customerCompare.repeatCount + ' คน', pctChangeColor_(customerCompare.pctRepeat || 0)));
  }
  if (d.monthlyTarget && d.monthlyTarget > 0) {
    var overallPct = d.pctToTarget || 0;
    var overallColor = targetPctColor_(overallPct);
    bodyContents.push({ type: 'separator', margin: 'lg' });
    bodyContents.push({ type: 'box', layout: 'horizontal', margin: 'lg', contents: [
        { type: 'text', text: '🎯 เป้าหมายยอดขายช่วง ' + rangeLabel + ' (รวม)', size: 'sm', weight: 'bold', color: '#1a5c2a', flex: 3, wrap: true },
        { type: 'text', text: overallPct + '%', size: 'sm', weight: 'bold', color: overallColor, align: 'end', flex: 1 }
      ] });
    bodyContents.push({ type: 'box', layout: 'vertical', margin: 'sm', contents: [progressBar(overallPct, overallColor)] });
    bodyContents.push({ type: 'text', text: fmtBaht(d.monthAmount) + ' / ' + fmtBaht(d.monthlyTarget), size: 'xs', color: '#9e9e9e', margin: 'sm' });
    (d.channelTargetBreakdown || []).forEach(function(item) { bodyContents.push(channelBlock(item.name, item.actual, item.target)); });
  }
  if (affiliateSummary) {
    var hasWeek  = affiliateSummary.thisWeek && (affiliateSummary.thisWeek.productsSold > 0 || affiliateSummary.thisWeek.commission > 0);
    var hasTotal = affiliateSummary.total && (affiliateSummary.total.productsSold > 0 || affiliateSummary.total.commission > 0);
    if (hasWeek || hasTotal) {
      bodyContents.push({ type: 'separator', margin: 'lg' });
      bodyContents.push({ type: 'box', layout: 'horizontal', margin: 'lg', contents: [ { type: 'text', text: '🤝 Affiliate การตลาด', size: 'sm', weight: 'bold', color: '#1a5c2a', flex: 3, wrap: true } ] });
      if (hasWeek) {
        bodyContents.push(kpiRow('🔸', 'สัปดาห์นี้ - สินค้าที่ขายได้', affiliateSummary.thisWeek.productsSold + ' ชิ้น'));
        bodyContents.push(kpiRow('🔸', 'สัปดาห์นี้ - ค่าคอมมิชชั่น', fmtBahtExact(affiliateSummary.thisWeek.commission)));
      }
      if (hasTotal) {
        var totalLbl = affiliateSummary.totalLabel || 'รวม';
        bodyContents.push(kpiRow('🔸', totalLbl + ' - สินค้าที่ขายได้', affiliateSummary.total.productsSold + ' ชิ้น'));
        bodyContents.push(kpiRow('🔸', totalLbl + ' - ค่าคอมมิชชั่น', fmtBahtExact(affiliateSummary.total.commission)));
      }
    }
  }
  var footerContents = [];
  var headerCard = {
    type: 'box', layout: 'vertical', paddingAll: '20px', cornerRadius: '24px',
    background: { type: 'linearGradient', angle: '135deg', startColor: '#1a5c2a', endColor: '#66bb6a' },
    contents: [
      { type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'md', contents: [
          { type: 'box', layout: 'vertical', width: '48px', height: '48px', cornerRadius: '24px', backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center',
            contents: [ { type: 'text', text: '📊', size: 'xl', align: 'center' } ] },
          { type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: 'สรุปยอดขาย', color: '#ffffff', weight: 'bold', size: 'xl' },
              { type: 'text', text: 'Spunky Food', color: '#e8f5e9', size: 'md' }
          ]}
      ]},
      { type: 'box', layout: 'vertical', margin: 'lg', cornerRadius: '20px', backgroundColor: '#ffffff33', paddingAll: '8px',
        contents: [ { type: 'text', text: '🕒 อัปเดตล่าสุด ' + fmtThaiDate_(Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd')) + ' ' + Utilities.formatDate(new Date(), 'GMT+7', 'HH:mm'), color: '#ffffff', size: 'xxs', align: 'center' } ] }
    ]
  };
  var bubble = { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md', contents: [headerCard].concat(bodyContents) } };
  if (footerContents.length) bubble.footer = { type: 'box', layout: 'vertical', paddingAll: '16px', contents: footerContents };
  return { type: 'flex', altText: 'สรุปยอดขายวันนี้ ' + fmtBaht(d.todayAmount) + ' | ยอดรวม ' + rangeLabel + ' ' + fmtBaht(d.totalAmount), contents: bubble };
}

function shortenQuickChart(config, width, height) {
  try {
    var res = UrlFetchApp.fetch('https://quickchart.io/chart/create', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ chart: config, width: width || 800, height: height || 400, backgroundColor: 'white', format: 'png' }),
      muteHttpExceptions: true
    });
    var json = JSON.parse(res.getContentText());
    if (json && json.success && json.url) return json.url;
  } catch (e) {}
  var encoded = encodeURIComponent(JSON.stringify(config));
  return 'https://quickchart.io/chart?width=' + (width || 800) + '&height=' + (height || 400) + '&backgroundColor=white&format=png&c=' + encoded;
}

function buildTrendChartUrl(d) {
  var labels = d.dailyTrend.map(function(p) { return p.date; });
  var values = d.dailyTrend.map(function(p) { return Math.round(p.amount); });
  if (!labels.length) return null;
  var useBar = labels.length < 3;
  var config;
  if (useBar) {
    config = { type: 'bar', data: { labels: labels, datasets: [{ label: 'ยอดขาย', data: values, backgroundColor: '#2e7d32', borderRadius: 4 }] },
      options: { plugins: { title: { display: true, text: 'แนวโน้มยอดขาย ' + fmtThaiRange_(d.rangeStart, d.rangeEnd) }, legend: { display: false } }, scales: { y: { beginAtZero: true } } } };
  } else {
    config = { type: 'line', data: { labels: labels, datasets: [{ label: 'ยอดขาย', data: values, borderColor: '#2e7d32', backgroundColor: 'rgba(46,125,50,0.15)', fill: true, tension: 0.4, lineTension: 0.4, cubicInterpolationMode: 'monotone', pointRadius: 3, pointBackgroundColor: '#2e7d32' }] },
      options: { elements: { line: { tension: 0.4 } }, plugins: { title: { display: true, text: 'แนวโน้มยอดขาย ' + fmtThaiRange_(d.rangeStart, d.rangeEnd) }, legend: { display: false } }, scales: { y: { beginAtZero: true } } } };
  }
  return shortenQuickChart(config, 800, 400);
}

function buildTopProductsChartUrl(d) {
  var mdResult = getMasterData();
  var products = (mdResult.success && mdResult.data.products) ? mdResult.data.products : [];
  function cleanName(s) { return String(s).replace(/[\[\]]/g, '').trim(); }
  function normalizeName(raw) {
    if (!raw) return raw;
    var nameLow = cleanName(raw).toLowerCase();
    for (var k = 0; k < PRODUCT_GROUP_KEYWORDS_.length; k++) {
      if (nameLow.indexOf(PRODUCT_GROUP_KEYWORDS_[k].keyword.toLowerCase()) !== -1) return PRODUCT_GROUP_KEYWORDS_[k].label;
    }
    if (!products.length) return raw;
    for (var i = 0; i < products.length; i++) {
      var skuLow = cleanName(products[i].name).toLowerCase();
      var skuCore = skuLow.split(/\s+(แพ็ค|ยกลัง|กล่อง|ชิ้น|ถุง)/)[0].trim();
      if (skuCore.length >= 4 && nameLow.indexOf(skuCore) !== -1) return products[i].name;
    }
    return raw;
  }
  function wrapLabel(text, maxChars) {
    maxChars = maxChars || 30;
    var words = String(text).split(' ');
    var lines = [], current = '';
    words.forEach(function(w) {
      var test = current ? current + ' ' + w : w;
      if (test.length > maxChars && current) { lines.push(current); current = w; } else current = test;
    });
    if (current) lines.push(current);
    return lines.length ? lines : [String(text)];
  }
  var grouped = {};
  (d.rawProducts || []).forEach(function(p) {
    var name = normalizeName(p.name || 'ไม่ระบุ');
    if (!grouped[name]) grouped[name] = { qty: 0, channels: {} };
    var qty = parseFloat(p.qty) || 0;
    grouped[name].qty += qty;
    var ch = p.channel || 'ไม่ระบุช่องทาง';
    grouped[name].channels[ch] = (grouped[name].channels[ch] || 0) + qty;
  });
  var list = Object.keys(grouped).map(function(name) { var g = grouped[name]; return { name: name, qty: g.qty, channels: g.channels }; });
  list.sort(function(a, b) { return b.qty - a.qty; });
  list = list.slice(0, 10);
  if (!list.length) return null;
  var channelNames = [];
  list.forEach(function(p) { Object.keys(p.channels).forEach(function(ch) { if (channelNames.indexOf(ch) === -1) channelNames.push(ch); }); });
  var datasets = channelNames.map(function(ch) { return { label: ch, data: list.map(function(p) { return Math.round(p.channels[ch] || 0); }), backgroundColor: channelColor_(ch) }; });
  var config = { type: 'bar', data: { labels: list.map(function(p) { return wrapLabel(p.name, 30); }), datasets: datasets },
    options: { indexAxis: 'y', plugins: { title: { display: true, text: 'สินค้าขายดี Top ' + list.length + ' (จำนวนชิ้น)' }, legend: { display: true, position: 'bottom' } }, scales: { x: { title: { display: true, text: 'จำนวนชิ้นที่ขาย' } } } } };
  var height = Math.max(500, list.length * 75);
  return shortenQuickChart(config, 900, height);
}

function buildChannelFlexMessage(d) {
  var channelAmount = d.channelAmount || {};
  var channelOrderCount = d.channelOrderCount || {};
  function shareRows(title, values, valueLabel) {
    var names = Object.keys(values).filter(function(name) { return (values[name] || 0) > 0; });
    var total = names.reduce(function(sum, name) { return sum + (values[name] || 0); }, 0);
    if (total <= 0) return null;
    names.sort(function(a, b) { return (values[b] || 0) - (values[a] || 0); });
    var rows = [ { type: 'text', text: title, size: 'sm', weight: 'bold', color: '#1a5c2a' } ];
    names.forEach(function(name) {
      var value = values[name] || 0;
      var pct = Math.round((value / total) * 100);
      rows.push({ type: 'box', layout: 'horizontal', margin: 'sm', contents: [
        { type: 'text', text: name, size: 'xs', color: '#424242', flex: 3, wrap: true },
        { type: 'text', text: pct + '% (' + valueLabel(value) + ')', size: 'xs', color: '#1a5c2a', weight: 'bold', align: 'end', flex: 2, wrap: true }
      ] });
    });
    return { type: 'box', layout: 'vertical', margin: 'lg', contents: rows };
  }
  var amountRows = shareRows('ยอดขาย (บาท)', channelAmount, function(value) { return '฿' + Math.round(value).toLocaleString('th-TH'); });
  var orderRows = shareRows('จำนวนรายการสั่งซื้อ', channelOrderCount, function(value) { return value + ' ออเดอร์'; });
  if (amountRows || orderRows) {
    var contents = [ { type: 'text', text: '📊 สัดส่วนช่องทางการขาย', weight: 'bold', size: 'md', color: '#1a5c2a' },
      { type: 'text', text: fmtThaiRange_(d.rangeStart, d.rangeEnd), size: 'xxs', color: '#9e9e9e', margin: 'xs' } ];
    if (amountRows) contents.push(amountRows);
    if (amountRows && orderRows) contents.push({ type: 'separator', margin: 'lg' });
    if (orderRows) contents.push(orderRows);
    return { type: 'flex', altText: 'สัดส่วนช่องทางการขาย แยกยอดขายและจำนวนออเดอร์', contents: { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'sm', contents: contents } } };
  }

  var ch = d.channel || {};
  var channelNames = Object.keys(ch);
  var totalBills = channelNames.reduce(function(s, name) { return s + (ch[name] || 0); }, 0);
  if (totalBills <= 0) return null;
  var list = channelNames.map(function(name) { return { label: name, color: channelColor_(name), count: ch[name] || 0 }; })
    .filter(function(c) { return c.count > 0; }).sort(function(a, b) { return b.count - a.count; });
  function progressBar(pct, color) {
    var clamped = Math.max(0, Math.min(100, pct));
    return { type: 'box', layout: 'vertical', height: '8px', cornerRadius: '4px', backgroundColor: '#E0E0E0',
      contents: [ { type: 'box', layout: 'vertical', height: '8px', width: clamped + '%', cornerRadius: '4px', backgroundColor: color, contents: [ { type: 'filler' } ] } ] };
  }
  var rows = list.map(function(c, idx) {
    var pct = Math.round((c.count / totalBills) * 100);
    return { type: 'box', layout: 'vertical', margin: idx === 0 ? 'none' : 'md', spacing: 'xs',
      contents: [
        { type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'sm', contents: [
            { type: 'box', layout: 'vertical', width: '10px', height: '10px', cornerRadius: '5px', backgroundColor: c.color, contents: [ { type: 'filler' } ] },
            { type: 'text', text: c.label, size: 'sm', color: '#424242', weight: 'bold', flex: 3 },
            { type: 'text', text: pct + '%', size: 'sm', color: '#1a5c2a', weight: 'bold', align: 'end', flex: 1 }
        ]},
        progressBar(pct, c.color),
        { type: 'text', text: c.count + ' รายการ', size: 'xxs', color: '#9e9e9e' }
      ] };
  });
  var bubble = { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'sm',
      contents: [ { type: 'text', text: '📊 สัดส่วนช่องทางการขาย (จำนวนรายการสินค้า)', weight: 'bold', size: 'md', color: '#1a5c2a' },
        { type: 'text', text: fmtThaiRange_(d.rangeStart, d.rangeEnd), size: 'xxs', color: '#9e9e9e', margin: 'xs' },
        { type: 'box', layout: 'vertical', margin: 'md', spacing: 'md', contents: rows } ] } };
  return { type: 'flex', altText: 'สัดส่วนช่องทางการขาย: ' + list.map(function(c) { return c.label + ' ' + Math.round((c.count / totalBills) * 100) + '%'; }).join(', '), contents: bubble };
}

function buildCampaignFlexMessage(d) {
  var list = (d.campaignReport || []).slice(0, 8);
  if (!list.length) return null;
  var channelNames = [];
  list.forEach(function(p) { Object.keys(p.channels || {}).forEach(function(ch) { if (channelNames.indexOf(ch) === -1) channelNames.push(ch); }); });
  function fmtNum(v) { return v > 0 ? Math.round(v).toLocaleString('th-TH') : '-'; }
  function tableRow(cells, opts) {
    opts = opts || {};
    var contents = cells.map(function(c, i) {
      return { type: 'text', text: String(c.text), size: 'xxs', color: opts.header ? '#ffffff' : (i === 0 ? '#424242' : '#1a5c2a'),
        weight: (opts.header || i === cells.length - 1) ? 'bold' : 'regular', flex: c.flex, align: i === 0 ? 'start' : 'end', wrap: true };
    });
    return { type: 'box', layout: 'horizontal', contents: contents, paddingAll: '6px', cornerRadius: '6px', backgroundColor: opts.header ? '#2e7d32' : (opts.alt ? '#f5f5f5' : '#ffffff') };
  }
  var nameFlex = 3, colFlex = 2;
  var headerCells = [{ text: 'Campaign', flex: nameFlex }].concat(channelNames.map(function(ch) { return { text: ch.length > 8 ? ch.slice(0, 7) + '…' : ch, flex: colFlex }; })).concat([{ text: 'รวม', flex: colFlex }]);
  var rows = [ tableRow(headerCells, { header: true }) ];
  list.forEach(function(p, idx) {
    var cells = [{ text: p.campaign, flex: nameFlex }].concat(channelNames.map(function(ch) { return { text: fmtNum((p.channels || {})[ch]), flex: colFlex }; })).concat([{ text: fmtNum(p.total), flex: colFlex }]);
    rows.push(tableRow(cells, { alt: idx % 2 === 1 }));
  });
  var bubble = { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'sm',
      contents: [ { type: 'text', text: '📋 ยอดขายตาม Campaign แยกช่องทาง', weight: 'bold', size: 'md', color: '#1a5c2a' },
        { type: 'text', text: fmtThaiRange_(d.rangeStart, d.rangeEnd), size: 'xxs', color: '#9e9e9e', margin: 'xs' },
        { type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs', contents: rows } ] } };
  return { type: 'flex', altText: 'ยอดขายตาม Campaign แยกช่องทาง (' + list.length + ' Campaign)', contents: bubble };
}

function getAffiliateSummaryForLine_(startDateStr, endDateStr) {
  try {
    var r = getAffiliateDashboardData(startDateStr, endDateStr);
    if (!r.success) return null;
    return { totalProductsSold: r.data.totalProductsSold || 0, totalCommission: r.data.totalCommission || 0 };
  } catch (e) {
    return null;
  }
}

// รายงานแยกตาม Ad: ทุก Ad แสดงยอดขาย/จำนวนบิล/สัดส่วนยอดขาย
// Customer Type แสดงเฉพาะ Ad = Bulk Buyers เท่านั้น
function getSalesByAdReportData_(startDateStr, endDateStr) {
  try {
    var ss = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet = ss.getSheetByName(REVENUE_SHEET_NAME);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, groups: [], totalAmount: 0 };

    var rangeStart = parseDateStr_(startDateStr);
    var rangeEnd = parseDateStr_(endDateStr);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd.setHours(23, 59, 59, 999);

    var rows = sheet.getRange(2, 1, lastRow - 1, 31).getValues();
    var bills = [], current = null;
    rows.forEach(function(row) {
      if (row[0]) {
        current = {
          orderDate: getEffectiveReportDate_(row),
          ad: String(row[16] || '').trim(),
          orderShopee: String(row[20] || '').trim(),
          orderTiktok: String(row[21] || '').trim(),
          customerType: String(row[18] || '').trim(),
          amount: 0
        };
        bills.push(current);
      }
      if (current) current.amount += parseFloat(row[6]) || 0;
    });

    function displayAd_(bill) {
      if (bill.ad) return bill.ad;
      if (bill.orderShopee) return 'Shopee';
      if (bill.orderTiktok) return 'TikTok';
      return 'LINE Shop';
    }

    var grouped = {}, totalAmount = 0;
    bills.forEach(function(bill) {
      if (!bill.orderDate || bill.orderDate < rangeStart || bill.orderDate > rangeEnd) return;
      var adName = displayAd_(bill);
      if (!grouped[adName]) grouped[adName] = { ad: adName, amount: 0, bills: 0, customerTypes: {} };
      grouped[adName].amount += bill.amount;
      grouped[adName].bills += 1;
      totalAmount += bill.amount;
      if (String(adName).toLowerCase() === 'bulk buyers') {
        var typeName = bill.customerType || 'ไม่ระบุประเภท';
        grouped[adName].customerTypes[typeName] = (grouped[adName].customerTypes[typeName] || 0) + 1;
      }
    });

    var preferredOrder = { 'Bulk Buyers': 0, 'Shopee': 1, 'LINE Shop': 2, 'TikTok': 3 };
    var groups = Object.keys(grouped).map(function(k) { return grouped[k]; });
    groups.sort(function(a, b) {
      var aRank = preferredOrder.hasOwnProperty(a.ad) ? preferredOrder[a.ad] : 99;
      var bRank = preferredOrder.hasOwnProperty(b.ad) ? preferredOrder[b.ad] : 99;
      if (aRank !== bRank) return aRank - bRank;
      return a.ad.localeCompare(b.ad);
    });
    return { success: true, groups: groups, totalAmount: totalAmount };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function buildSalesByAdFlexMessages_(startDateStr, endDateStr) {
  var result = getSalesByAdReportData_(startDateStr, endDateStr);
  if (!result.success) { Logger.log('สร้างรายงานยอดขายแยกตาม Ad ไม่สำเร็จ: ' + result.error); return []; }
  if (!result.groups.length) return [];

  function fmtBaht(v) { return '฿' + Math.round(v || 0).toLocaleString('th-TH'); }
  function pctOfTotal(v) { return result.totalAmount > 0 ? Math.round((v / result.totalAmount) * 100) : 0; }
  function progressBar(pct) {
    return { type: 'box', layout: 'vertical', height: '6px', cornerRadius: '3px', backgroundColor: '#e8f5e9', contents: [
      { type: 'box', layout: 'vertical', height: '6px', width: Math.max(0, Math.min(100, pct)) + '%', cornerRadius: '3px', backgroundColor: '#e53935', contents: [{ type: 'filler' }] }
    ] };
  }
  function metricRow(label, value) {
    return { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
      { type: 'text', text: label, size: 'xs', color: '#616161', flex: 3 },
      { type: 'text', text: value, size: 'xs', weight: 'bold', color: '#1a5c2a', align: 'end', flex: 2 }
    ] };
  }
  function makeBubble(group) {
    var isBulk = String(group.ad).toLowerCase() === 'bulk buyers';
    var contents = [
      { type: 'text', text: isBulk ? '👥 ' + group.ad : '📦 ' + group.ad, size: 'lg', weight: 'bold', color: '#1a5c2a', wrap: true },
      { type: 'text', text: fmtThaiRange_(startDateStr, endDateStr), size: 'xxs', color: '#9e9e9e', margin: 'xs' },
      { type: 'separator', margin: 'md' },
      metricRow('ยอดขาย', fmtBaht(group.amount)),
      metricRow('สัดส่วนยอดขาย', pctOfTotal(group.amount) + '% ของยอดรวม'),
      metricRow('จำนวนบิล', group.bills + ' บิล')
    ];
    if (isBulk) {
      var types = Object.keys(group.customerTypes).map(function(name) { return { name: name, count: group.customerTypes[name] }; });
      types.sort(function(a, b) { return b.count - a.count; });
      if (types.length) {
        contents.push({ type: 'separator', margin: 'md' });
        contents.push({ type: 'text', text: 'Customer Type (เฉพาะ Bulk Buyers)', size: 'sm', weight: 'bold', color: '#1a5c2a', margin: 'md', wrap: true });
        types.forEach(function(t) {
          var typePct = group.bills > 0 ? Math.round((t.count / group.bills) * 1000) / 10 : 0;
          contents.push({ type: 'box', layout: 'vertical', margin: 'sm', spacing: 'xs', contents: [
            { type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: t.name, size: 'xs', color: '#424242', flex: 3, wrap: true },
              { type: 'text', text: t.count + ' บิล · ' + typePct + '%', size: 'xs', weight: 'bold', color: '#c62828', align: 'end', flex: 2 }
            ] }, progressBar(typePct)
          ] });
        });
      }
    }
    return { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'xs', backgroundColor: isBulk ? '#f6fff7' : '#ffffff', contents: contents } };
  }

  var messages = [];
  for (var i = 0; i < result.groups.length; i += 12) {
    var bubbles = result.groups.slice(i, i + 12).map(makeBubble);
    var contents = bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles };
    messages.push({ type: 'flex', altText: 'รายงานยอดขายแยกตาม Ad ' + fmtThaiRange_(startDateStr, endDateStr), contents: contents });
  }
  return messages;
}

// LINE จำกัดไม่เกิน 5 ข้อความต่อหนึ่ง push จึงแบ่งชุด โดยคงลำดับข้อความไว้
function pushLineMessagesInBatches_(messages) {
  for (var i = 0; i < messages.length; i += 5) pushLineMessages_(messages.slice(i, i + 5));
  return { success: true };
}

// รายงานยอดขายแยกตาม Ad: ทุก Ad แสดงยอดขาย จำนวนบิล และสัดส่วนยอดขาย
// Customer Type แสดงเฉพาะ Bulk Buyers เท่านั้น
function buildSalesByAdFlexMessages_(startDateStr, endDateStr) {
  var rangeStart = parseDateStr_(startDateStr);
    var rangeEnd = parseDateStr_(endDateStr);
      rangeStart.setHours(0, 0, 0, 0);
        rangeEnd.setHours(23, 59, 59, 999);
        
          var grouped = {};
            var totalAmount = 0;
              computeBillsFromSheet_().forEach(function(bill) {
                  if (!bill.orderDate || bill.orderDate < rangeStart || bill.orderDate > rangeEnd) return;
                      var adName = String(bill.channel || 'LINE Shop').trim() || 'LINE Shop';
                          if (!grouped[adName]) grouped[adName] = { ad: adName, amount: 0, bills: 0, customerTypes: {} };
                              grouped[adName].amount += Number(bill.amount) || 0;
                                  grouped[adName].bills += 1;
                                      totalAmount += Number(bill.amount) || 0;
                                          if (adName.toLowerCase() === 'bulk buyers' && bill.customerType) {
                                                var typeName = String(bill.customerType).trim();
                                                      if (typeName) grouped[adName].customerTypes[typeName] = (grouped[adName].customerTypes[typeName] || 0) + 1;
                                                          }
                                                            });
                                                            
                                                              var groups = Object.keys(grouped).map(function(key) { return grouped[key]; });
                                                                if (!groups.length) return [];
                                                                  var preferredOrder = { 'Bulk Buyers': 0, 'Shopee': 1, 'LINE Shop': 2, 'TikTok': 3 };
                                                                    groups.sort(function(a, b) {
                                                                        var ar = preferredOrder.hasOwnProperty(a.ad) ? preferredOrder[a.ad] : 99;
                                                                            var br = preferredOrder.hasOwnProperty(b.ad) ? preferredOrder[b.ad] : 99;
                                                                                return ar !== br ? ar - br : a.ad.localeCompare(b.ad);
                                                                                  });
                                                                                  
                                                                                    function baht_(amount) { return '฿' + Math.round(amount || 0).toLocaleString('th-TH'); }
                                                                                      function salesPct_(amount) { return totalAmount ? Math.round((amount / totalAmount) * 100) : 0; }
                                                                                        function row_(label, value) {
                                                                                            return { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
                                                                                                  { type: 'text', text: label, size: 'xs', color: '#616161', flex: 3 },
                                                                                                        { type: 'text', text: value, size: 'xs', weight: 'bold', color: '#1a5c2a', align: 'end', flex: 2 }
                                                                                                            ] };
                                                                                                              }
                                                                                                                function bar_(percent) {
                                                                                                                    return { type: 'box', layout: 'vertical', height: '6px', cornerRadius: '3px', backgroundColor: '#e8f5e9', contents: [
                                                                                                                          { type: 'box', layout: 'vertical', height: '6px', width: Math.max(0, Math.min(100, percent)) + '%', cornerRadius: '3px', backgroundColor: '#e53935', contents: [{ type: 'filler' }] }
                                                                                                                              ] };
                                                                                                                                }
                                                                                                                                  function bubble_(group) {
                                                                                                                                      var isBulk = group.ad.toLowerCase() === 'bulk buyers';
                                                                                                                                          var contents = [
                                                                                                                                                { type: 'text', text: group.ad, size: 'lg', weight: 'bold', color: '#1a5c2a', wrap: true },
                                                                                                                                                      { type: 'text', text: startDateStr + ' – ' + endDateStr, size: 'xxs', color: '#9e9e9e', margin: 'xs' },
                                                                                                                                                            { type: 'separator', margin: 'md' },
                                                                                                                                                                  row_('ยอดขาย', baht_(group.amount)),
                                                                                                                                                                        row_('สัดส่วนยอดขาย', salesPct_(group.amount) + '% ของยอดรวม'),
                                                                                                                                                                              row_('จำนวนบิล', group.bills + ' บิล')
                                                                                                                                                                                  ];
                                                                                                                                                                                      if (isBulk) {
                                                                                                                                                                                            var types = Object.keys(group.customerTypes).map(function(name) { return { name: name, count: group.customerTypes[name] }; });
                                                                                                                                                                                                  types.sort(function(a, b) { return b.count - a.count; });
                                                                                                                                                                                                        if (types.length) {
                                                                                                                                                                                                                contents.push({ type: 'separator', margin: 'md' });
                                                                                                                                                                                                                        contents.push({ type: 'text', text: 'Customer Type', size: 'sm', weight: 'bold', color: '#1a5c2a', margin: 'md' });
                                                                                                                                                                                                                                types.forEach(function(type) {
                                                                                                                                                                                                                                          var typePct = group.bills ? Math.round((type.count / group.bills) * 1000) / 10 : 0;
                                                                                                                                                                                                                                                    contents.push({ type: 'box', layout: 'vertical', margin: 'sm', spacing: 'xs', contents: [
                                                                                                                                                                                                                                                                { type: 'box', layout: 'horizontal', contents: [
                                                                                                                                                                                                                                                                              { type: 'text', text: type.name, size: 'xs', color: '#424242', flex: 3, wrap: true },
                                                                                                                                                                                                                                                                                            { type: 'text', text: type.count + ' บิล · ' + typePct + '%', size: 'xs', weight: 'bold', color: '#c62828', align: 'end', flex: 2 }
                                                                                                                                                                                                                                                                                                        ] },
                                                                                                                                                                                                                                                                                                                    bar_(typePct)
                                                                                                                                                                                                                                                                                                                              ] });
                                                                                                                                                                                                                                                                                                                                      });
                                                                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                                                                                    return { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'xs', backgroundColor: isBulk ? '#f6fff7' : '#ffffff', contents: contents } };
                                                                                                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                                                                                                      
                                                                                                                                                                                                                                                                                                                                                        var messages = [];
                                                                                                                                                                                                                                                                                                                                                          for (var i = 0; i < groups.length; i += 10) {
                                                                                                                                                                                                                                                                                                                                                              var bubbles = groups.slice(i, i + 10).map(bubble_);
                                                                                                                                                                                                                                                                                                                                                                  messages.push({ type: 'flex', altText: 'รายงานยอดขายแยกตาม Ad ' + startDateStr + ' – ' + endDateStr, contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles } });
                                                                                                                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                                                                                                                      return messages;
                                                                                                                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                                                                                                                      
                                                                                                                                                                                                                                                                                                                                                                      // LINE รับได้สูงสุด 5 ข้อความต่อหนึ่ง push จึงแบ่งเป็นชุดโดยคงลำดับเดิมไว้
                                                                                                                                                                                                                                                                                                                                                                      function pushLineMessagesInBatches_(messages) {
                                                                                                                                                                                                                                                                                                                                                                        for (var i = 0; i < messages.length; i += 5) pushLineMessages_(messages.slice(i, i + 5));
                                                                                                                                                                                                                                                                                                                                                                          return { success: true };
                                                                                                                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                          function sendDashboardToLine(startDateStr, endDateStr) {
  try {
    if (!LINE_CHANNEL_ACCESS_TOKEN || LINE_CHANNEL_ACCESS_TOKEN.indexOf('PUT_YOUR') === 0) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Script Properties');
    if (!LINE_GROUP_ID || LINE_GROUP_ID.indexOf('PUT_YOUR') === 0) throw new Error('ยังไม่ได้ตั้งค่า LINE_GROUP_ID ในไฟล์ Code.gs');
    var dashResult = getDashboardData(startDateStr, endDateStr);
    if (!dashResult.success) throw new Error('ดึงข้อมูล Dashboard ไม่สำเร็จ: ' + dashResult.error);
    var d = dashResult.data;
    var nowForAff = new Date();
    var weekStartForAff = Utilities.formatDate(mondayOfWeek_(nowForAff), 'GMT+7', 'yyyy-MM-dd');
    var weekEndForAff   = Utilities.formatDate(nowForAff, 'GMT+7', 'yyyy-MM-dd');
    var affWeekRaw  = getAffiliateSummaryForLine_(weekStartForAff, weekEndForAff);
    var affTotalRaw = getAffiliateSummaryForLine_(d.rangeStart, d.rangeEnd);
    var affSummary = (affWeekRaw || affTotalRaw) ? { thisWeek: affWeekRaw ? { productsSold: affWeekRaw.totalProductsSold, commission: affWeekRaw.totalCommission } : null,
      total: affTotalRaw ? { productsSold: affTotalRaw.totalProductsSold, commission: affTotalRaw.totalCommission } : null, totalLabel: 'รวมเดือนนี้' } : null;
    var extrasResult = getMonthlyReportExtras(d.rangeStart, d.rangeEnd);
    var weeklyExtras = extrasResult.success ? extrasResult.data : null;
    var messages = [ buildDashboardFlexMessage(d, null, affSummary, weeklyExtras) ];
    messages = messages.concat(buildSalesByAdFlexMessages_(d.rangeStart, d.rangeEnd));    if (d.dailyTrend && d.dailyTrend.length > 0) { var trendUrl = buildTrendChartUrl(d); messages.push({ type: 'image', originalContentUrl: trendUrl, previewImageUrl: trendUrl }); }
    var prodUrl = buildTopProductsChartUrl(d);
    if (prodUrl) messages.push({ type: 'image', originalContentUrl: prodUrl, previewImageUrl: prodUrl });
    var chFlex = buildChannelFlexMessage(d);
    if (chFlex) messages.push(chFlex);
    var campFlex = buildCampaignFlexMessage(d);
    if (campFlex) messages.push(campFlex);
    // รายงานเดิมทั้งหมดจะถูกส่งต่อโดยคงลำดับไว้
    return pushLineMessagesInBatches_(messages);
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function pushLineMessages_(messages) {
  var payload = { to: LINE_GROUP_ID, messages: messages };
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN }, payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code !== 200) {
    Logger.log('LINE push ล้มเหลว — payload ที่ส่งไป: ' + JSON.stringify(payload));
    Logger.log('LINE ตอบกลับ: ' + res.getContentText());
    var failedIndex = -1, failedDetail = '';
    for (var i = 0; i < messages.length; i++) {
      var testRes = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
        method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN }, payload: JSON.stringify({ to: LINE_GROUP_ID, messages: [messages[i]] }), muteHttpExceptions: true
      });
      if (testRes.getResponseCode() !== 200) { failedIndex = i; failedDetail = testRes.getContentText(); break; }
      Utilities.sleep(300);
    }
    if (failedIndex !== -1) {
      var validateRes = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/validate/push', {
        method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN }, payload: JSON.stringify({ messages: [messages[failedIndex]] }), muteHttpExceptions: true
      });
      Logger.log('ผล validate ข้อความที่ ' + (failedIndex + 1) + ': ' + validateRes.getContentText());
      throw new Error('ข้อความลำดับที่ ' + (failedIndex + 1) + ' (ชนิด: ' + messages[failedIndex].type + ') ส่งไม่สำเร็จ — validate: ' + validateRes.getContentText());
    }
    throw new Error('LINE API ตอบกลับ ' + code + ': ' + res.getContentText());
  }
  return { success: true };
}

function buildMonthlyExtrasFlexMessage(extras) {
  if (!extras) return null;
  function fmtBaht(v) { return '฿' + Math.round(v || 0).toLocaleString('th-TH'); }
  var hl = extras.highlights || {};
  function highlightBox(text) {
    if (!text) return null;
    return { type: 'box', layout: 'vertical', margin: 'sm', paddingAll: '8px', cornerRadius: '6px', backgroundColor: '#fff3e0',
      contents: [ { type: 'text', text: '💡 ' + text, size: 'xxs', color: '#e65100', wrap: true } ] };
  }
  var sections = [];
  if (extras.provinceStats && extras.provinceStats.length) {
    var maxAmt = extras.provinceStats[0].amount || 1;
    sections.push({ type: 'text', text: '📍 จังหวัดที่ซื้อเยอะที่สุด', size: 'sm', weight: 'bold', color: '#1a5c2a', margin: 'lg' });
    extras.provinceStats.slice(0, 5).forEach(function(p) {
      var pct = Math.round((p.amount / maxAmt) * 100);
      sections.push({ type: 'box', layout: 'vertical', margin: 'sm', spacing: 'xs',
        contents: [
          { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: p.province, size: 'xs', color: '#424242', flex: 3 }, { type: 'text', text: fmtBaht(p.amount), size: 'xs', color: '#1a5c2a', weight: 'bold', align: 'end', flex: 2 } ] },
          { type: 'box', layout: 'vertical', height: '6px', cornerRadius: '3px', backgroundColor: '#E0E0E0', contents: [ { type: 'box', layout: 'vertical', height: '6px', width: pct + '%', cornerRadius: '3px', backgroundColor: '#2e7d32', contents: [{ type: 'filler' }] } ] }
        ] });
    });
    var provHl = highlightBox(hl.province);
    if (provHl) sections.push(provHl);
  }
  if (extras.customerSegments && extras.customerSegments.length) {
    sections.push({ type: 'separator', margin: 'lg' });
    sections.push({ type: 'text', text: '👥 ลูกค้าใหม่ / ซื้อซ้ำ แยกตาม Ad', size: 'sm', weight: 'bold', color: '#1a5c2a', margin: 'lg', wrap: true });
    extras.customerSegments.forEach(function(seg) {
      sections.push({ type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs',
        contents: [
          { type: 'text', text: 'Ad: ' + seg.ad, size: 'xs', weight: 'bold', color: '#424242' },
          { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: 'ใหม่ ' + seg.newCount + ' (' + seg.newPct + '%)', size: 'xxs', color: '#1a5c2a', flex: 1 }, { type: 'text', text: 'เฉลี่ย ' + fmtBaht(seg.newAvgValue), size: 'xxs', color: '#9e9e9e', align: 'end', flex: 1 } ] },
          { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: 'ซ้ำ ' + seg.repeatCount + ' (' + seg.repeatPct + '%)', size: 'xxs', color: '#1565c0', flex: 1 }, { type: 'text', text: 'เฉลี่ย ' + fmtBaht(seg.repeatAvgValue), size: 'xxs', color: '#9e9e9e', align: 'end', flex: 1 } ] }
        ] });
    });
    var custHl = highlightBox(hl.customer);
    if (custHl) sections.push(custHl);
  }
  if (extras.churnedCustomers && extras.churnedCustomers.length) {
    sections.push({ type: 'separator', margin: 'lg' });
    sections.push({ type: 'text', text: '⚠️ ซื้อครั้งเดียวแล้วหายไป', size: 'sm', weight: 'bold', color: '#c62828', margin: 'lg' });
    extras.churnedCustomers.forEach(function(c) {
      sections.push({ type: 'box', layout: 'horizontal', margin: 'xs', contents: [ { type: 'text', text: 'Ad: ' + c.ad, size: 'xs', color: '#424242', flex: 3 }, { type: 'text', text: c.count + ' คน', size: 'xs', color: '#c62828', weight: 'bold', align: 'end', flex: 1 } ] });
    });
    var churnHl = highlightBox(hl.churned);
    if (churnHl) sections.push(churnHl);
  }
  if (extras.peakHour) {
    sections.push({ type: 'separator', margin: 'lg' });
    sections.push({ type: 'box', layout: 'horizontal', margin: 'lg', alignItems: 'center', contents: [ { type: 'text', text: '🕐 ช่วงเวลาขายดีที่สุด', size: 'sm', weight: 'bold', color: '#1a5c2a', flex: 3, wrap: true }, { type: 'text', text: extras.peakHour.label, size: 'sm', weight: 'bold', color: '#1a5c2a', align: 'end', flex: 2 } ] });
    var hourHl = highlightBox(hl.peakHour);
    if (hourHl) sections.push(hourHl);
  }
  if (extras.topPromotions && extras.topPromotions.length) {
    sections.push({ type: 'separator', margin: 'lg' });
    sections.push({ type: 'text', text: '🏷 โปรโมชั่นขายดีที่สุด', size: 'sm', weight: 'bold', color: '#1a5c2a', margin: 'lg' });
    extras.topPromotions.forEach(function(p) {
      sections.push({ type: 'box', layout: 'horizontal', margin: 'xs', contents: [ { type: 'text', text: p.campaign, size: 'xs', color: '#424242', flex: 3, wrap: true }, { type: 'text', text: fmtBaht(p.total), size: 'xs', color: '#1a5c2a', weight: 'bold', align: 'end', flex: 1 } ] });
    });
    var promoHl = highlightBox(hl.promotion);
    if (promoHl) sections.push(promoHl);
  }
  if (!sections.length) return null;
  var bubble = { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'sm',
      contents: [ { type: 'text', text: '📊 สรุปเชิงลึกประจำเดือน', weight: 'bold', size: 'md', color: '#1a5c2a' } ].concat(sections) } };
  return { type: 'flex', altText: 'สรุปเชิงลึกประจำเดือน: จังหวัด/ลูกค้าใหม่-ซ้ำ/ช่วงเวลาขายดี/โปรโมชั่น', contents: bubble };
}

var AI_MODEL = 'claude-sonnet-5';

function getAIMonthlySummary_(d, extras, monthCompare, monthLabel) {
  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!apiKey) return { success: false, error: 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ใน Script Properties' };
    var trendLines = (d.dailyTrend || []).map(function(t) { return t.date + ': ' + Math.round(t.amount) + ' บาท'; });
    var summary = {
      เดือน: monthLabel, ยอดขายรวม: Math.round(d.totalAmount),
      เทียบเดือนก่อน: monthCompare ? (monthCompare.pct + '% (เดือนก่อนขาย ' + Math.round(monthCompare.prevAmt) + ' บาท)') : 'ไม่มีข้อมูล',
      จำนวนบิล: d.totalOrders, เปอร์เซ็นต์จำนวนบิลเทียบช่วงก่อน: d.pctOrders + '%',
      มูลค่าเฉลี่ยต่อบิล: Math.round(d.aov), ยอดส่วนลดรวม: Math.round(d.totalDiscount), ค่าจัดส่งรวม: Math.round(d.totalDelivery),
      แนวโน้มยอดขายรายวัน: trendLines, สัดส่วนช่องทางการขาย_จำนวนรายการสินค้า: d.channel,
      จังหวัดขายดี: (extras.provinceStats || []).slice(0, 5).map(function(p) { return p.province + ': ' + Math.round(p.amount) + ' บาท (' + p.count + ' บิล)'; }),
      กลุ่มลูกค้าแยกตาม_Ad: (extras.customerSegments || []).map(function(s) { return s.ad + ' — ลูกค้าใหม่ ' + s.newCount + ' คน (' + s.newPct + '%, เฉลี่ย ' + s.newAvgValue + ' บาท/คน), ลูกค้าซื้อซ้ำ ' + s.repeatCount + ' คน (' + s.repeatPct + '%, เฉลี่ย ' + s.repeatAvgValue + ' บาท/คน)'; }),
      ลูกค้าซื้อครั้งเดียวแล้วหายไป_ตลอดประวัติ_แยกตาม_Ad: (extras.churnedCustomers || []).map(function(c) { return c.ad + ': ' + c.count + ' คน'; }),
      ช่วงเวลาขายดีที่สุด: extras.peakHour ? (extras.peakHour.label + ' (' + extras.peakHour.count + ' บิล)') : 'ไม่มีข้อมูล',
      ยอดขายช่วงดึก_00_00_ถึง_07_30: extras.lateNightStats ? (extras.lateNightStats.count + ' บิล (' + extras.lateNightStats.pctOfBills + '% ของบิลทั้งเดือน) รวม ' + extras.lateNightStats.amount + ' บาท') : 'ไม่มีข้อมูล',
      โปรโมชั่นขายดีที่สุด: (extras.topPromotions || []).slice(0, 5).map(function(p) { return p.campaign + ': ' + Math.round(p.total) + ' บาท'; })
    };
    var systemPrompt = 'คุณเป็นนักวิเคราะห์ข้อมูลยอดขายอาวุโสให้ธุรกิจอาหาร (Spunky Food / Em-O-Cha ขายน้ำพริกซอง/ก๋วยเตี๋ยวซองพร้อมทาน ผ่าน Shopee/TikTok เป็นหลัก) '
      + 'วิเคราะห์ข้อมูลสรุปยอดขายรายเดือนที่ให้มาอย่างละเอียดและลึกซึ้ง อ้างอิงตัวเลขจริงที่ให้มาเสมอเวลาพูดถึงยอดขาย ห้ามสมมติหรือกุตัวเลขที่ไม่มีในข้อมูล '
      + 'กฎสำคัญ: ห้ามเอาตัวเลขในข้อมูลมาพูดซ้ำเฉยๆ ต้องตีความ เชื่อมโยงเหตุผล และให้ข้อเสนอแนะเสมอ '
      + 'เขียนเป็นภาษาไทย ห้ามใส่คำนำ ใช้โครงสร้างหัวข้อดังนี้เป๊ะๆ (ขึ้นต้นหัวข้อใหญ่ด้วย "## " และประเด็นย่อยด้วย "- "):\n\n'
      + '## ภาพรวมยอดขาย\n(3-4 ข้อ)\n\n## พฤติกรรมลูกค้า\n(3-4 ข้อ)\n\n## ช่วงเวลาสั่งซื้อ\n(2-3 ข้อ)\n\n'
      + '## บริบทตลาดและเทรนด์การบริโภค\n(3-4 ข้อ)\n\n## จุดที่ควรระวัง\n(2-3 ข้อ)\n\n## พยากรณ์เดือนถัดไป\n\n'
      + '## กลุ่มเป้าหมายทางการตลาด\n(2-3 ข้อ)\n\n## สิ่งที่ควรทำต่อ\n(3-4 ข้อ)';
    var payload = { model: AI_MODEL, max_tokens: 6144, system: systemPrompt, messages: [ { role: 'user', content: 'ข้อมูลสรุปยอดขายเดือนนี้ (JSON):\n' + JSON.stringify(summary, null, 2) } ] };
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', contentType: 'application/json', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, payload: JSON.stringify(payload), muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code !== 200) { Logger.log('Claude API error (' + code + '): ' + res.getContentText()); return { success: false, error: 'Claude API ตอบกลับ ' + code + ': ' + res.getContentText() }; }
    var json = JSON.parse(res.getContentText());
    var text = (json.content || []).filter(function(c) { return c.type === 'text'; }).map(function(c) { return c.text; }).join('\n');
    if (!text) {
      Logger.log('Claude API ตอบกลับสำเร็จแต่ไม่มีข้อความ — response ดิบ: ' + res.getContentText());
      var hint = json.stop_reason === 'max_tokens' ? 'โมเดลใช้โควตา token หมดไปกับการคิดก่อนตอบ — เพิ่มค่า max_tokens' : 'ดู Log เพิ่มเติมที่ Apps Script > Executions';
      return { success: false, error: 'AI ตอบกลับว่างเปล่า (stop_reason: ' + (json.stop_reason || 'ไม่ทราบ') + ') — ' + hint };
    }
    return { success: true, text: text };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getAIMonthlySummary(startDateStr, endDateStr) {
  try {
    var dashResult = getDashboardData(startDateStr, endDateStr);
    if (!dashResult.success) throw new Error(dashResult.error);
    var extrasResult = getMonthlyReportExtras(startDateStr, endDateStr);
    if (!extrasResult.success) throw new Error(extrasResult.error);
    var refDate = parseDateStr_(startDateStr);
    var monthCompare = computeMonthCompare_(refDate);
    var monthLabel = THAI_MONTHS_FULL_[refDate.getMonth()] + ' ' + (refDate.getFullYear() + 543);
    return getAIMonthlySummary_(dashResult.data, extrasResult.data, monthCompare, monthLabel);
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function buildAISummaryFlexMessage_(aiText) {
  if (!aiText) return null;
  var lines = aiText.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l; });
  var sections = [];
  var current = null;
  lines.forEach(function(l) {
    if (l.indexOf('## ') === 0) { current = { title: l.replace(/^##\s*/, ''), bullets: [] }; sections.push(current); }
    else { if (!current) { current = { title: '🤖 วิเคราะห์โดย AI', bullets: [] }; sections.push(current); } current.bullets.push(l.replace(/^-\s*/, '')); }
  });
  if (!sections.length) return null;
  var bubbles = sections.slice(0, 10).map(function(sec, idx) {
    var contents = [ { type: 'text', text: (idx === 0 ? '🤖 ' : '') + sec.title, weight: 'bold', size: 'md', color: '#1a5c2a', wrap: true } ];
    sec.bullets.forEach(function(b) { contents.push({ type: 'text', text: '•  ' + b, size: 'xs', color: '#424242', wrap: true, margin: 'sm' }); });
    return { type: 'bubble', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'xs', contents: contents } };
  });
  if (bubbles.length === 1) return { type: 'flex', altText: 'สรุปวิเคราะห์ยอดขายโดย AI', contents: bubbles[0] };
  return { type: 'flex', altText: 'สรุปวิเคราะห์ยอดขายโดย AI (' + bubbles.length + ' หัวข้อ ปัดดูเพิ่มเติมได้)', contents: { type: 'carousel', contents: bubbles } };
}

function sendMonthlyDashboardToLine() {
  try {
    if (!LINE_CHANNEL_ACCESS_TOKEN || LINE_CHANNEL_ACCESS_TOKEN.indexOf('PUT_YOUR') === 0) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Script Properties');
    if (!LINE_GROUP_ID || LINE_GROUP_ID.indexOf('PUT_YOUR') === 0) throw new Error('ยังไม่ได้ตั้งค่า LINE_GROUP_ID ในไฟล์ Code.gs');
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    var thisStart = new Date(y, m, 1);
    var thisEnd   = new Date(y, m + 1, 0);
    var startStr  = Utilities.formatDate(thisStart, 'GMT+7', 'yyyy-MM-dd');
    var endStr    = Utilities.formatDate(thisEnd,   'GMT+7', 'yyyy-MM-dd');
    var dashResult = getDashboardData(startStr, endStr);
    if (!dashResult.success) throw new Error('ดึงข้อมูล Dashboard ไม่สำเร็จ: ' + dashResult.error);
    var d = dashResult.data;
    var monthCompare = computeMonthCompare_(now);
    var monthLabel = THAI_MONTHS_FULL_[m] + ' ' + (y + 543);
    var extrasResult = getMonthlyReportExtras(startStr, endStr);
    var extras = extrasResult.success ? extrasResult.data : null;
    var affMonthRaw = getAffiliateSummaryForLine_(startStr, endStr);
    var affSummary = affMonthRaw ? { thisWeek: null, total: { productsSold: affMonthRaw.totalProductsSold, commission: affMonthRaw.totalCommission }, totalLabel: 'รวมทั้งเดือน' } : null;
    var messages = [ buildDashboardFlexMessage(d, monthCompare, affSummary) ];
    messages = messages.concat(buildSalesByAdFlexMessages_(d.rangeStart, d.rangeEnd));
    if (extras) {
      var aiResult = getAIMonthlySummary_(d, extras, monthCompare, monthLabel);
      if (aiResult.success) { var aiFlex = buildAISummaryFlexMessage_(aiResult.text); if (aiFlex) messages.push(aiFlex); }
      else Logger.log('AI monthly summary ข้ามไป: ' + aiResult.error);
    }
    if (d.dailyTrend && d.dailyTrend.length > 0) { var trendUrl = buildTrendChartUrl(d); messages.push({ type: 'image', originalContentUrl: trendUrl, previewImageUrl: trendUrl }); }
    var prodUrl = buildTopProductsChartUrl(d);
    if (prodUrl) messages.push({ type: 'image', originalContentUrl: prodUrl, previewImageUrl: prodUrl });
    var extrasFlex = buildMonthlyExtrasFlexMessage(extras);
    if (extrasFlex) messages.push(extrasFlex);
    // รายงานเดิมทั้งหมดจะถูกส่งต่อโดยคงลำดับไว้
    return pushLineMessagesInBatches_(messages);
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function sendDailyDashboardReport() { sendDashboardToLine(); }

function testAuthorizeExternalRequest() {
  var res = UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  Logger.log('เรียกสำเร็จ สถานะ: ' + res.getResponseCode());
  return 'OK';
}

function createDailyLineTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'sendDailyDashboardReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendDailyDashboardReport').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(18).create();
  return 'ตั้งเวลาส่งอัตโนมัติทุกวันศุกร์ 18:00 น. เรียบร้อยแล้ว';
}

function checkAndSendMonthlyReport() {
  var now = new Date();
  var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  var isLastDayOfMonth = tomorrow.getDate() === 1;
  if (!isLastDayOfMonth) return;
  sendMonthlyDashboardToLine();
}

function createMonthlyLineTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'checkAndSendMonthlyReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkAndSendMonthlyReport').timeBased().everyDays(1).atHour(18).create();
  return 'ตั้งเวลาเช็ค+ส่งรายงานสรุปยอดขายรายเดือนอัตโนมัติเรียบร้อยแล้ว';
}

function debugWebAppUrl() {
  var url = '';
  try { url = ScriptApp.getService().getUrl() || '(ว่าง)'; } catch (e) { url = 'Error: ' + e.toString(); }
  Logger.log('Web App URL: ' + url);
  return url;
}

// ==================== AFFILIATE / CREATOR MARKETING ====================
var AFFILIATE_SHEET_NAME = 'Affiliate_Creators';
var AFFILIATE_CONTENT_SHEET_NAME = 'Affiliate_Content';

function ensureAffiliateSheets_() {
  var ss = SpreadsheetApp.openById(REVENUE_SHEET_ID);
  var c = ss.getSheetByName(AFFILIATE_SHEET_NAME);
  if (!c) {
    c = ss.insertSheet(AFFILIATE_SHEET_NAME);
    c.appendRow(['ID','Platform','บันทึกเมื่อ','ช่วงวันที่เริ่ม','ช่วงวันที่สิ้นสุด','ชื่อครีเอเตอร์','Handle',
      'ข้อมูลติดต่อ/โซเชียล','คะแนน','จำนวนรีวิว','ผู้ติดตาม','หมวดหมู่','GMV จากครีเอเตอร์','สัดส่วน GMV ทั้งหมด(%)',
      'สินค้าที่ขายได้','การคืนเงิน','AOV','CTOR(%)','รายการที่มีการคืนเงิน','คำสั่งซื้อที่มาจากครีเอเตอร์',
      'ไลฟ์สตรีม','วิดีโอ','ตัวอย่างสินค้าที่จัดส่งแล้ว','ยอดการรับชม','%การเติบโตยอดการรับชม','ค่าคอมมิชชั่นโดยประมาณ','หมายเหตุ']);
  }
  var p = ss.getSheetByName(AFFILIATE_CONTENT_SHEET_NAME);
  if (!p) {
    p = ss.insertSheet(AFFILIATE_CONTENT_SHEET_NAME);
    p.appendRow(['ID','Creator ID','ประเภท','ชื่อ/หัวข้อ','Content ID','วันที่โพสต์','ชื่อสินค้าที่แท็ก','GMV','ยอดวิว','ข้อมูลดิบ(ตรวจสอบเอง)']);
  }
  return { creators: c, content: p };
}

function saveAffiliateReport(data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success:false, error:'ระบบมีคนบันทึกพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    var sheets = ensureAffiliateSheets_();
    var id = 'AFF' + Utilities.formatDate(new Date(), 'GMT+7', 'yyMMddHHmmss');
    var now = new Date();
    var startRow = sheets.creators.getLastRow() + 1;
    sheets.creators.getRange(startRow, 4, 1, 2).setNumberFormat('@STRING@');
    SpreadsheetApp.flush();
    sheets.creators.getRange(startRow, 1, 1, 27).setValues([[
      id, data.platform || 'TikTok Affiliate', now, data.periodStart || '', data.periodEnd || '',
      data.creatorName || '', data.handle || '', data.contact || '', data.rating || '', parseInt(data.ratingCount) || 0,
      data.followers || '', data.category || '', parseFloat(data.gmv) || 0, parseFloat(data.gmvPct) || 0,
      parseInt(data.productsSold) || 0, parseFloat(data.refund) || 0, parseFloat(data.aov) || 0, parseFloat(data.ctor) || 0,
      parseInt(data.refundItems) || 0, parseInt(data.orders) || 0, parseInt(data.live) || 0, parseInt(data.videos) || 0,
      parseInt(data.samples) || 0, data.views || 0, parseFloat(data.viewsGrowthPct) || 0, parseFloat(data.commission) || 0, data.remark || ''
    ]]);
    var contentRows = data._content || [];
    if (contentRows.length) {
      var contentSheet = sheets.content;
      var startContentRow = contentSheet.getLastRow() + 1;
      contentSheet.getRange(startContentRow, 5, contentRows.length, 2).setNumberFormat('@STRING@');
      SpreadsheetApp.flush();
      var contentValues = contentRows.map(function (item, idx) {
        return [ id + '-' + (idx + 1), id, item.type || '', item.title || '', String(item.contentId || ''), String(item.postDate || ''), item.productName || '', parseFloat(item.gmv) || 0, item.views || '', item.rawExtra || '' ];
      });
      contentSheet.getRange(startContentRow, 1, contentValues.length, 10).setValues(contentValues);
    }
    return { success: true, id: id };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function canonicalizeAffName_(s) { return String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(); }

function checkDuplicateAffiliateReport(data) {
  try {
    var sheets = ensureAffiliateSheets_();
    var sheet = sheets.creators;
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, duplicates: [] };
    var newName   = canonicalizeAffName_(data.creatorName);
    var newHandle = canonicalizeAffName_(data.handle);
    if (!newName) return { success: true, duplicates: [] };
    var newGmv      = parseFloat(data.gmv) || 0;
    var newOrders    = parseInt(data.orders) || 0;
    var newComm      = parseFloat(data.commission) || 0;
    var newProducts  = parseInt(data.productsSold) || 0;
    var rows = sheet.getRange(2, 1, lastRow - 1, 31).getValues();
    var duplicates = [];
    rows.forEach(function (row, idx) {
      var existName   = canonicalizeAffName_(row[5]);
      var existHandle = canonicalizeAffName_(row[6]);
      var nameMatch = existName === newName || (newHandle && existHandle && existHandle === newHandle);
      if (!nameMatch) return;
      var oldGmv      = parseFloat(row[12]) || 0;
      var oldOrders    = parseInt(row[19]) || 0;
      var oldComm      = parseFloat(row[25]) || 0;
      var oldProducts  = parseInt(row[14]) || 0;
      var isSameSnapshot = (Math.abs(oldGmv - newGmv) < 0.01) && (oldOrders === newOrders);
      duplicates.push({
        rowIndex: idx + 2, id: row[0], creatorName: row[5], handle: row[6],
        periodStart: formatAffDateDisplay_(row[3]), periodEnd: formatAffDateDisplay_(row[4]),
        savedAt: row[2] ? new Date(row[2]).toLocaleString('th-TH') : '', isSameSnapshot: isSameSnapshot,
        oldGmv: oldGmv, newGmv: newGmv, oldOrders: oldOrders, newOrders: newOrders,
        oldCommission: oldComm, newCommission: newComm, oldProductsSold: oldProducts, newProductsSold: newProducts
      });
    });
    duplicates.sort(function (a, b) { if (a.isSameSnapshot !== b.isSameSnapshot) return a.isSameSnapshot ? -1 : 1; return 0; });
    return { success: true, duplicates: duplicates };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function updateAffiliateReport(rowIndex, data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนบันทึกพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    var sheets = ensureAffiliateSheets_();
    var creatorSheet = sheets.creators;
    var id = creatorSheet.getRange(rowIndex, 1).getValue();
    var keepSavedAt = creatorSheet.getRange(rowIndex, 3).getValue();
    creatorSheet.getRange(rowIndex, 4, 1, 2).setNumberFormat('@STRING@');
    SpreadsheetApp.flush();
    creatorSheet.getRange(rowIndex, 1, 1, 27).setValues([[
      id, data.platform || 'TikTok Affiliate', keepSavedAt, data.periodStart || '', data.periodEnd || '',
      data.creatorName || '', data.handle || '', data.contact || '', data.rating || '', parseInt(data.ratingCount) || 0,
      data.followers || '', data.category || '', parseFloat(data.gmv) || 0, parseFloat(data.gmvPct) || 0,
      parseInt(data.productsSold) || 0, parseFloat(data.refund) || 0, parseFloat(data.aov) || 0, parseFloat(data.ctor) || 0,
      parseInt(data.refundItems) || 0, parseInt(data.orders) || 0, parseInt(data.live) || 0, parseInt(data.videos) || 0,
      parseInt(data.samples) || 0, data.views || 0, parseFloat(data.viewsGrowthPct) || 0, parseFloat(data.commission) || 0, data.remark || ''
    ]]);
    var contentSheet = sheets.content;
    var cLastRow = contentSheet.getLastRow();
    if (cLastRow > 1) {
      var ids = contentSheet.getRange(2, 2, cLastRow - 1, 1).getValues();
      for (var i = ids.length - 1; i >= 0; i--) { if (ids[i][0] === id) contentSheet.deleteRow(i + 2); }
    }
    var contentRows = data._content || [];
    if (contentRows.length) {
      var startContentRow = contentSheet.getLastRow() + 1;
      contentSheet.getRange(startContentRow, 5, contentRows.length, 2).setNumberFormat('@STRING@');
      SpreadsheetApp.flush();
      var contentValues = contentRows.map(function (item, idx) {
        return [ id + '-' + (idx + 1), id, item.type || '', item.title || '', String(item.contentId || ''), String(item.postDate || ''), item.productName || '', parseFloat(item.gmv) || 0, item.views || '', item.rawExtra || '' ];
      });
      contentSheet.getRange(startContentRow, 1, contentValues.length, 10).setValues(contentValues);
    }
    return { success: true, id: id };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getAllAffiliateReports(limit) {
  try {
    var sheets = ensureAffiliateSheets_();
    var sheet = sheets.creators;
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var maxRows = limit || 100;
    var startRow = Math.max(2, lastRow - maxRows + 1);
    var data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 27).getValues();
    var results = [];
    data.forEach(function (row, idx) {
      results.push({
        rowIndex: startRow + idx, id: row[0], platform: row[1], savedAt: row[2] ? new Date(row[2]).toLocaleString('th-TH') : '',
        periodStart: formatAffDateDisplay_(row[3]), periodEnd: formatAffDateDisplay_(row[4]), creatorName: row[5], handle: row[6],
        followers: row[10], category: row[11], gmv: row[12], productsSold: row[14], orders: row[19], views: row[23], commission: row[25]
      });
    });
    results.reverse();
    return { success: true, results: results };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function deleteAffiliateReport(rowIndex) {
  try {
    var sheets = ensureAffiliateSheets_();
    var creatorSheet = sheets.creators;
    var id = creatorSheet.getRange(rowIndex, 1).getValue();
    creatorSheet.deleteRow(rowIndex);
    var contentSheet = sheets.content;
    var lastRow = contentSheet.getLastRow();
    if (lastRow > 1) {
      var ids = contentSheet.getRange(2, 2, lastRow - 1, 1).getValues();
      for (var i = ids.length - 1; i >= 0; i--) { if (ids[i][0] === id) contentSheet.deleteRow(i + 2); }
    }
    return { success: true };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function parseAffDateStr_(s) {
  if (!s) return null;
  if (Object.prototype.toString.call(s) === '[object Date]') return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  var t = String(s).trim(), m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10));
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(parseInt(m[3],10), parseInt(m[2],10)-1, parseInt(m[1],10)) : null;
}

function formatAffDateDisplay_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'GMT+7', 'dd/MM/yyyy');
  return String(v);
}

function formatAffDateTimeDisplay_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'GMT+7', 'dd/MM/yyyy HH:mm');
  return String(v);
}

function debugAffiliateDashboard() {
  var raw = getAffiliateDashboardData('2026-01-01', '2026-12-31');
  Logger.log('ผลลัพธ์ getAffiliateDashboardData: ' + JSON.stringify(raw));
  var sheets = ensureAffiliateSheets_();
  var lastRow = sheets.creators.getLastRow();
  Logger.log('จำนวนแถวทั้งหมดใน Affiliate_Creators (รวม header): ' + lastRow);
  if (lastRow > 1) {
    var sample = sheets.creators.getRange(2, 1, Math.min(3, lastRow - 1), 27).getValues();
    sample.forEach(function(row, i) { Logger.log('แถวตัวอย่างที่ ' + (i + 1) + ' — ID: ' + row[0] + ', ครีเอเตอร์: ' + row[5] + ', periodStart(index3): ' + row[3] + ', periodEnd(index4): ' + row[4] + ', GMV(index12): ' + row[12]); });
  }
  return raw;
}

// ==================== ผู้ให้บริการขนส่ง + แจ้งเตือนลูกค้าตอนกรอกเลขพัสดุ (จัดส่งแล้ว) ====================
// ⚡ แก้ (31/8/69) — คลีนไฟล์นี้ทั้งไฟล์: เดิม setTrackingNumber / buildShippedFlexMessage_ /
// listShippingLabelOrders / getAffiliateDashboardData ต่างมีนิยามซ้ำกัน 2-5 เวอร์ชันซ้อนกันอยู่ในไฟล์เดิม
// (จากการแก้ไขหลายรอบที่ไม่ได้ลบของเก่าออก) ซึ่งใน Apps Script ตัวที่ทำงานจริงคือ "นิยามตัวสุดท้าย" เสมอ —
// เก็บไว้เฉพาะเวอร์ชันสุดท้าย (ที่ใช้งานจริงอยู่แล้ว) ของแต่ละฟังก์ชันเท่านั้น ตัวอื่นที่ซ้ำถูกลบออกทั้งหมด
// เพื่อไม่ให้สับสนว่าตัวไหนทำงานจริงอีกต่อไป — ไม่ได้เปลี่ยนพฤติกรรมของ Dashboard/รายงานใดๆ เลย
function revenueShippingColumns_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = function(name) { return headers.indexOf(name); };
  var carrierIdx = idx('ชื่อขนส่ง');
  if (carrierIdx < 0) {
    carrierIdx = lastCol;
    sheet.getRange(1, carrierIdx + 1).setValue('ชื่อขนส่ง');
    headers.push('ชื่อขนส่ง');
  }
  return {
    headers: headers,
    id: idx('Revenue ID'), timestamp: idx('Timestamp'), product: idx('ProductName'), qty: idx('Qty'),
    customer: idx('Customer Name'), phone: idx('Phone Number'),
    shopee: idx('Order No.Shopee'), tiktok: idx('Order No.TikTok'), orderDate: idx('Order Date'),
    province: idx('Province'), address: idx('Customer Address'), printed: idx('Label Printed At'),
    tracking: idx('เลขพัสดุ'), carrier: carrierIdx, customerType: idx('CustomerType'),
    lineUid: idx('LINE UID'), paymentDate: idx('วันที่ชำระเงิน'),
    // ⚡ เพิ่ม (19/9/69) — คอลัมน์ที่ใช้กับออเดอร์เก็บเงินปลายทาง เพื่อพิมพ์ยอดที่ต้องเก็บลงใบจัดส่ง
    // คอลัมน์ AG "สถานะเก็บเงินปลายทาง" ถูกสร้างโดยระบบ Members LINE จะยังไม่มีจนกว่าจะมีออเดอร์ COD
    // ใบแรก — idx() คืน -1 ถ้าไม่เจอ ทุกจุดที่ใช้เช็ค >= 0 ก่อนเสมอ จึงไม่พังกับชีตที่ยังไม่มีคอลัมน์นี้
    payment: idx('Payment'), billTotal: idx('Bill Total'), codStatus: idx('สถานะเก็บเงินปลายทาง')
  };
}

function shippingSafeDateText_(value) {
  if (!value) return '';
  var d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

function listShippingLabelOrders(startDateStr, endDateStr, query, onlyUnprinted, onlyNoTracking) {
  try {
    var ss = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet = ss.getSheetByName(REVENUE_SHEET_NAME);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var col = revenueShippingColumns_(sheet);
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    var q = String(query || '').toLowerCase().trim();
    var rangeStart = startDateStr ? parseDateStr_(startDateStr) : null;
    var rangeEnd = endDateStr ? parseDateStr_(endDateStr) : null;
    if (rangeStart) rangeStart.setHours(0, 0, 0, 0);
    if (rangeEnd) rangeEnd.setHours(23, 59, 59, 999);
    var bills = [], current = null;
    data.forEach(function(row, idx) {
      if (row[col.id]) {
        var rawOrderDate = col.orderDate >= 0 && row[col.orderDate] ? row[col.orderDate] : (col.timestamp >= 0 ? row[col.timestamp] : '');
        var billDate = rawOrderDate ? new Date(rawOrderDate) : null;
        var rawPrinted = col.printed >= 0 ? row[col.printed] : '';
        current = {
          rowIndex: idx + 2,
          revenueId: String(row[col.id] || ''),
          orderDate: shippingSafeDateText_(billDate || rawOrderDate),
          customerName: col.customer >= 0 ? String(row[col.customer] || '') : '',
          phoneNumber: col.phone >= 0 ? String(row[col.phone] || '') : '',
          address: col.address >= 0 ? String(row[col.address] || '') : '',
          province: col.province >= 0 ? String(row[col.province] || '') : '',
          labelPrintedAt: shippingSafeDateText_(rawPrinted),
          trackingNumber: col.tracking >= 0 ? String(row[col.tracking] || '') : '',
          carrierName: col.carrier >= 0 ? String(row[col.carrier] || '') : '',
          isLineShop: col.customerType >= 0 && row[col.customerType] === 'สมาชิก LINE',
          // ⚡ เพิ่ม — ตอนลูกค้า/ระบบ LINE Shop ยกเลิกออเดอร์ (cancelShopOrder ใน Members.gs) จะเขียนคำว่า
          // "ยกเลิก" ทับชื่อสินค้า (คอลัมน์ ProductName) ทุกแถวของออเดอร์นั้น ใช้ค่านี้เป็นสัญญาณตัดออเดอร์ที่
          // ยกเลิกแล้วออกจากรายการพิมพ์ใบจัดส่ง ไม่ต้องพิมพ์ใบจัดส่งของที่ไม่ได้ส่งจริง
          isCancelled: col.product >= 0 && String(row[col.product] || '') === 'ยกเลิก',
          // ⚡ เพิ่ม — คอลัมน์ "วันที่ชำระเงิน" (บันทึกโดย recordPaymentDateIfMissing_ ใน Members.gs ตอนลูกค้า
          // แนบสลิปสำเร็จ หรือโดย createManualShopOrder ตอนคีย์ออเดอร์มือที่ยืนยันจ่ายเงินแล้ว) คือสัญญาณเดียว
          // ที่บอกว่าออเดอร์นี้ "ชำระเงินแล้วจริง" — ก่อนหน้านี้รายการพิมพ์ใบจัดส่งไม่ได้เช็คค่านี้เลย ทำให้
          // ออเดอร์ที่ยังไม่จ่ายเงิน (ยังไม่แนบสลิป) หลุดมาปนอยู่ในรายการที่ควรมีแต่ออเดอร์พร้อมส่งเท่านั้น
          isPaid: col.paymentDate >= 0 && !!row[col.paymentDate],
          // ⚡ เพิ่ม (19/9/69) — ออเดอร์เก็บเงินปลายทาง: คนแพ็ค/คนส่งต้องเห็นบนใบจัดส่งว่าต้องเก็บเงินเท่าไร
          // (ออเดอร์แบบนี้มีวันที่ชำระเงินตั้งแต่วันที่สั่งเพื่อให้รับรู้ยอดขายทันที จึงหลุดเข้ามาในรายการนี้
          // ปนกับออเดอร์ที่จ่ายเงินมาแล้ว แยกออกจากกันด้วยคอลัมน์ Payment เท่านั้น)
          isCod: col.payment >= 0 && String(row[col.payment] || '').indexOf('เก็บเงินปลายทาง') !== -1,
          codAmount: col.billTotal >= 0 ? (Number(row[col.billTotal]) || 0) : 0,
          codStatus: col.codStatus >= 0 ? String(row[col.codStatus] || '') : '',
          products: [],
          _billDate: billDate
        };
        bills.push(current);
      }
      if (current && col.product >= 0 && row[col.product]) current.products.push({ name: String(row[col.product]), qty: col.qty >= 0 ? row[col.qty] : '' });
    });
    var results = bills.filter(function(b) {
      if (!b.isLineShop) return false;
      if (b.isCancelled) return false;
      if (!b.isPaid) return false;
      if (rangeStart && (!b._billDate || b._billDate < rangeStart)) return false;
      if (rangeEnd && (!b._billDate || b._billDate > rangeEnd)) return false;
      if (onlyUnprinted && b.labelPrintedAt) return false;
      if (onlyNoTracking && b.trackingNumber) return false;
      if (q) {
        var hay = [b.revenueId, b.customerName, b.phoneNumber, b.address, b.province].concat(b.products.map(function(p) { return p.name; })).join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    results.forEach(function(b) { delete b._billDate; });
    return { success: true, results: results };
  } catch (e) {
    Logger.log('listShippingLabelOrders: ' + e.stack);
    return { success: false, error: String(e && e.message ? e.message : e), results: [] };
  }
}

function markShippingLabelsPrinted(rowIndexes) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนบันทึกพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    var ss    = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet = ss.getSheetByName(REVENUE_SHEET_NAME);
    var now   = new Date();
    (rowIndexes || []).forEach(function(ri) { sheet.getRange(ri, 26).setNumberFormat('dd/MM/yyyy HH:mm:ss'); sheet.getRange(ri, 26).setValue(now); });
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function sendLineMessagesToUid_(lineUid, messages) {
  if (!LINE_CHANNEL_ACCESS_TOKEN_MEMBER || LINE_CHANNEL_ACCESS_TOKEN_MEMBER.indexOf('ใส่ Channel') === 0) {
    return { success: false, error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN_MEMBER ใน Script Properties' };
  }
  try {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN_MEMBER }, payload: JSON.stringify({ to: lineUid, messages: messages }), muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code !== 200) return { success: false, error: 'LINE push ตอบกลับ ' + code + ': ' + res.getContentText() };
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ⚡ แก้ (22/8/69) — ไอคอนคัดลอกเลขพัสดุ: ใช้ไฟล์รูปจริงที่อัปโหลดไว้บน GitHub (Em-O-Cha/Order,
// copy-icon.png) วางเป็นไอคอนเล็กๆ ข้างเลขพัสดุ กดแล้วคัดลอกเลขพัสดุทันทีผ่าน LINE clipboard action
// (ใช้งานได้เต็มที่บนมือถือ บนคอมพิวเตอร์ LINE ไม่รองรับ action นี้ — ข้อจำกัดของแพลตฟอร์ม LINE เอง แก้จาก
// ฝั่งเราไม่ได้ จึงส่งข้อความล้วนที่มีแค่เลขพัสดุตามหลังการ์ดเสมอด้วย ดู setTrackingNumber ด้านล่าง เพื่อให้
// คัดลอกได้แน่นอนทุกอุปกรณ์)
var TRACKING_COPY_ICON_URL_ = 'https://raw.githubusercontent.com/Em-O-Cha/Order/main/copy-icon.png';

function findMemberByPhoneOrName_(phone, customerName) {
  try {
    var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID_FOR_NOTIFY);
    var sheet = ss.getSheetByName('Members');
    if (!sheet) return null;
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;
    var data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    var phoneClean = String(phone || '').replace(/[^0-9]/g, '');
    if (phoneClean) {
      for (var i = 0; i < data.length; i++) {
        var rowPhone = String(data[i][3] || '').replace(/[^0-9]/g, '');
        if (rowPhone && rowPhone === phoneClean) return { lineUid: data[i][0], matchedBy: 'phone' };
      }
    }
    var nameClean = String(customerName || '').trim().toLowerCase();
    if (nameClean) {
      for (var j = 0; j < data.length; j++) {
        var fullName = String(data[j][9] || '').trim().toLowerCase();
        var lineName = String(data[j][1] || '').trim().toLowerCase();
        if ((fullName && fullName === nameClean) || (lineName && lineName === nameClean)) return { lineUid: data[j][0], matchedBy: 'name' };
      }
    }
    return null;
  } catch (e) {
    Logger.log('findMemberByPhoneOrName_ error: ' + e.toString());
    return null;
  }
}

// ⚡ แก้ (31/8/69) — เพิ่มไอคอน Copy กลับมาข้างๆ เลขพัสดุในการ์ด (ใช้ LINE clipboard action, ใช้งานได้เต็มที่
// บนมือถือ) และเพิ่มส่งข้อความ "ข้อความล้วน" ที่มีแค่เลขพัสดุตามหลังการ์ดนี้เสมอด้วย (ดู setTrackingNumber
// ด้านล่าง) เพื่อให้คัดลอกได้แน่นอนทุกอุปกรณ์รวมถึงคอมพิวเตอร์ที่ปุ่มนี้ใช้ไม่ได้ (ข้อจำกัดของ LINE เอง)
function buildShippedFlexMessage_(revenueId, productNames, trackingNumber, carrierName, codAmount) {
  var headerCard = {
    type: 'box', layout: 'vertical', paddingAll: '20px', cornerRadius: '24px',
    background: { type: 'linearGradient', angle: '135deg', startColor: '#a50d0c', endColor: '#e4504d' },
    contents: [
      { type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'md', contents: [
          { type: 'box', layout: 'vertical', width: '48px', height: '48px', cornerRadius: '24px',
            backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center',
            contents: [ { type: 'text', text: '📦', size: 'xl', align: 'center' } ]
          },
          { type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: 'พัสดุจัดส่งแล้ว', color: '#ffffff', weight: 'bold', size: 'lg', wrap: true },
              { type: 'text', text: '#' + revenueId, color: '#ffe4e3', size: 'sm' }
          ]}
      ]}
    ]
  };
  var body = [ headerCard ];
  // ⚡ เพิ่ม (19/9/69) — บิลเก็บเงินปลายทางที่ยังไม่ได้เก็บเงิน ต้องย้ำยอดที่ลูกค้าต้องเตรียมไว้ให้พนักงานส่งของ
  // ตั้งแต่ตอนแจ้งเลขพัสดุ (เป็นข้อความสุดท้ายก่อนของถึงมือลูกค้า) วางไว้บนสุดใต้หัวการ์ดให้เห็นก่อนเลขพัสดุ
  var codAmountValue = Number(codAmount) || 0;
  if (codAmountValue > 0) {
    body.push({
      type: 'box', layout: 'vertical', margin: 'lg', cornerRadius: '12px', backgroundColor: '#fff3e0', paddingAll: '14px', spacing: 'xs',
      contents: [
        { type: 'text', text: '💵 ชำระแบบเก็บเงินปลายทาง', size: 'sm', weight: 'bold', color: '#e65100', align: 'center' },
        { type: 'text', text: 'กรุณาเตรียมเงิน ฿' + Math.round(codAmountValue).toLocaleString('th-TH') + ' ให้พนักงานส่งของตอนรับสินค้า', size: 'xs', color: '#e65100', align: 'center', wrap: true }
      ]
    });
  }
  body.push({
    type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents: [
      { type: 'text', text: 'สินค้า', size: 'xs', color: '#9e9e9e' },
      { type: 'text', text: (productNames || []).join('\n') || '-', size: 'sm', color: '#424242', wrap: true }
    ]
  });
  body.push({
    type: 'box', layout: 'horizontal', margin: 'lg', contents: [
      { type: 'text', text: 'ขนส่ง', size: 'lg', color: '#9e9e9e', flex: 1 },
      { type: 'text', text: carrierName, size: 'lg', color: '#a50d0c', weight: 'bold', align: 'end', flex: 2 }
    ]
  });
  body.push({
    type: 'box', layout: 'vertical', margin: 'lg', cornerRadius: '12px', backgroundColor: '#fff0ef', paddingAll: '14px',
    contents: [
      { type: 'box', layout: 'horizontal', alignItems: 'center', contents: [
          { type: 'text', text: 'เลขพัสดุ', size: 'xs', color: '#a50d0c', weight: 'bold', flex: 1 },
          {
            type: 'box', layout: 'vertical', width: '24px', height: '24px', cornerRadius: '7px',
            backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center',
            action: { type: 'clipboard', label: 'คัดลอกเลขพัสดุ', clipboardText: trackingNumber },
            contents: [ { type: 'image', url: TRACKING_COPY_ICON_URL_, size: '14px', aspectMode: 'fit' } ]
          }
      ]},
      { type: 'text', text: trackingNumber, size: 'xl', weight: 'bold', color: '#a50d0c', align: 'center', margin: 'sm', wrap: true }
    ]
  });
  body.push({
    type: 'text', text: 'สามารถนำเลขพัสดุไปติดตามสถานะได้เลยค่ะ ขอบคุณที่รักเอมโอชาค่ะ 🙏', size: 'xs', color: '#757575',
    margin: 'lg', wrap: true, align: 'center'
  });
  var bubble = { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md', contents: body } };
  var shippedAltText = 'พัสดุจัดส่งแล้ว #' + revenueId + ' เลขพัสดุ ' + trackingNumber
    + (codAmountValue > 0 ? ' · เก็บเงินปลายทาง ฿' + Math.round(codAmountValue).toLocaleString('th-TH') : '');
  return { type: 'flex', altText: shippedAltText, contents: bubble };
}

function setTrackingNumber(rowIndex, trackingNumber, carrierName) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนบันทึกพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    var trackingValue = String(trackingNumber || '').trim();
    var carrierValue = String(carrierName || '').trim();
    var allowedCarriers = ['ไปรษณีย์ไทย', 'SPX', 'J&T', 'Flash'];
    if (!trackingValue) return { success: false, error: 'กรุณากรอกเลขพัสดุ' };
    if (allowedCarriers.indexOf(carrierValue) < 0) return { success: false, error: 'กรุณาเลือกขนส่ง' };
    var ss = SpreadsheetApp.openById(REVENUE_SHEET_ID);
    var sheet = ss.getSheetByName(REVENUE_SHEET_NAME);
    var col = revenueShippingColumns_(sheet);
    var mainRow = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    var customerName = col.customer >= 0 ? String(mainRow[col.customer] || '') : '';
    var phone = col.phone >= 0 ? String(mainRow[col.phone] || '') : '';
    var revenueId = String(mainRow[col.id] || '');
    var productNames = [];
    if (col.product >= 0 && mainRow[col.product]) productNames.push(String(mainRow[col.product]));
    for (var i = rowIndex + 1; i <= sheet.getLastRow(); i++) {
      var nextId = sheet.getRange(i, col.id + 1).getValue();
      if (nextId !== '' && nextId !== null && nextId !== undefined) break;
      var pName = col.product >= 0 ? sheet.getRange(i, col.product + 1).getValue() : '';
      if (pName) productNames.push(String(pName));
    }
    sheet.getRange(rowIndex, col.tracking + 1).setNumberFormat('@').setValue(trackingValue);
    sheet.getRange(rowIndex, col.carrier + 1).setValue(carrierValue);
    // ⚡ แก้ — ใช้ LINE UID ที่บันทึกไว้ในคอลัมน์ AF ของแถวนี้ตรงๆ ก่อนเสมอ (ครอบคลุมทั้งออเดอร์คีย์มือที่ไม่ใช่
    // สมาชิกและออเดอร์อัตโนมัติ) แม่นยำกว่าและไม่ต้องพึ่งว่าลูกค้าต้องเป็นสมาชิกในระบบ — จับคู่เบอร์โทร/ชื่อ
    // เอาไว้ fallback เฉพาะออเดอร์เก่าที่บันทึกมาก่อนมีคอลัมน์นี้เท่านั้น
    // ⚡ เพิ่ม (19/9/69) — ยอดที่ต้องเก็บปลายทางของบิลนี้ (0 = ไม่ใช่บิล COD หรือเก็บเงินไปแล้ว จึงไม่ต้องย้ำ)
    var isCodBill_ = col.payment >= 0 && String(mainRow[col.payment] || '').indexOf('เก็บเงินปลายทาง') !== -1;
    var codCollected_ = col.codStatus >= 0 && String(mainRow[col.codStatus] || '') === 'เก็บเงินแล้ว';
    var codAmountForBill_ = (isCodBill_ && !codCollected_ && col.billTotal >= 0) ? (Number(mainRow[col.billTotal]) || 0) : 0;

    var directLineUid = col.lineUid >= 0 ? String(mainRow[col.lineUid] || '').trim() : '';
    var member = directLineUid ? { lineUid: directLineUid, matchedBy: 'lineUidColumn' } : findMemberByPhoneOrName_(phone, customerName);
    var notifyResult = { success: false, error: 'ไม่พบสมาชิก LINE ที่ตรงกับบิลนี้' };
    if (member && member.lineUid) {
      // ⚡ แก้ (31/8/69) — ส่งข้อความ "ข้อความล้วน" ที่มีแค่เลขพัสดุตามหลังการ์ด Flex เสมอ เพื่อให้คัดลอกได้
      // แน่นอนทุกอุปกรณ์ (ปุ่ม Copy ในการ์ดใช้ได้แค่บนมือถือ เป็นข้อจำกัดของ LINE บนคอมพิวเตอร์)
      notifyResult = sendLineMessagesToUid_(member.lineUid, [
        buildShippedFlexMessage_(revenueId, productNames, trackingValue, carrierValue, codAmountForBill_)
      ]);
    }
    return { success: true, notified: !!(member && notifyResult.success), matchedBy: member ? member.matchedBy : null, notifyError: notifyResult.success ? '' : notifyResult.error };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ==================== AFFILIATE DASHBOARD (สรุปรวม) ====================
// ⚡ แก้ (31/8/69) — ต่อจากการคลีนไฟล์ด้านบน: getAffiliateDashboardData เดิมมีนิยามซ้ำ 5 เวอร์ชันซ้อนกันอยู่
// (จากการรื้อโครงสร้างข้อมูล Affiliate หลายรอบ — ช่วงแรกใช้ชีต Affiliate_Products แยกต่างหาก แล้วภายหลัง
// ย้ายมาใช้ชีต Affiliate_Creators/Affiliate_Content เดิมแทนโดยฝัง JSON ไว้ในคอลัมน์ "ข้อมูลดิบ") เก็บไว้
// เฉพาะเวอร์ชันสุดท้าย (ที่ใช้งานจริง) เท่านั้น พร้อมกับฟังก์ชันที่มันเรียกใช้จริง (getLegacyAffiliateDashboardData_)
// ส่วนฟังก์ชันที่เกี่ยวกับชีต Affiliate_Products/Affiliate_Product_Imports แบบเก่า (ensureAffiliateProductSheets_,
// affProductNumber_, parseAffiliateProductDate_, getAffiliateProductDashboardData_ และนิยามซ้ำอื่นๆ ของ
// saveAffiliateProductImport / getAffiliateProductImportHistory / deleteAffiliateProductImport) ไม่มีจุดไหน
// เรียกใช้แล้วจริงๆ (ถูกแทนที่ด้วยเวอร์ชันที่ใช้ชีต Affiliate_Creators/Affiliate_Content แทน) จึงลบออกทั้งหมด
// — พฤติกรรมของ Dashboard/รายงาน Affiliate ไม่เปลี่ยนแปลงเลย เหมือนของเดิมทุกประการ
function getLegacyAffiliateDashboardData_(startDateStr, endDateStr) {
  try {
    var sheets = ensureAffiliateSheets_();
    var sheet = sheets.creators, lastRow = sheet.getLastRow();
    var empty = { totalGMV:0, totalCommission:0, totalOrders:0, totalViews:0, totalProductsSold:0, creatorCount:0, creators:[], topContent:[] };
    if (lastRow <= 1) return empty;
    var start = parseDateStr_(startDateStr), end = parseDateStr_(endDateStr);
    if (end) end.setHours(23,59,59,999);
    var totals = empty, rows = sheet.getRange(2,1,lastRow-1,27).getValues(), ids = {};
    rows.forEach(function(row) {
      if (start && end) { var periodEnd = parseAffDateStr_(row[4]); if (!periodEnd || periodEnd < start || periodEnd > end) return; }
      var gmv=parseFloat(row[12])||0, commission=parseFloat(row[25])||0, orders=parseInt(row[19])||0, sold=parseInt(row[14])||0, views=parseFloat(String(row[23]).replace(/,/g,''))||0;
      totals.totalGMV+=gmv; totals.totalCommission+=commission; totals.totalOrders+=orders; totals.totalProductsSold+=sold; totals.totalViews+=views;
      totals.creators.push({id:row[0],creatorName:row[5],handle:row[6],followers:row[10],category:row[11],gmv:gmv,productsSold:sold,orders:orders,views:row[23],commission:commission,periodStart:formatAffDateDisplay_(row[3]),periodEnd:formatAffDateDisplay_(row[4])});
      ids[row[0]]=true;
    });
    totals.creators.sort(function(a,b){return b.gmv-a.gmv;});
    totals.creatorCount=totals.creators.length;
    var contentSheet=sheets.content, contentLastRow=contentSheet.getLastRow();
    if(contentLastRow>1) {
      contentSheet.getRange(2,1,contentLastRow-1,10).getValues().forEach(function(row) {
        if(!ids[row[1]])return;
        totals.topContent.push({creatorId:row[1],type:row[2],title:row[3],contentId:String(row[4]||''),postDate:formatAffDateTimeDisplay_(row[5]),productName:row[6],gmv:parseFloat(row[7])||0,views:row[8]});
      });
      totals.topContent.sort(function(a,b){return b.gmv-a.gmv;});
      totals.topContent=totals.topContent.slice(0,10);
    }
    return totals;
  } catch(e) { return { totalGMV:0,totalCommission:0,totalOrders:0,totalViews:0,totalProductsSold:0,creatorCount:0,creators:[],topContent:[] }; }
}

function saveAffiliateProductImport(data) {
  try {
    var rows = data && data.rows ? data.rows : [];
    if (!data.creatorName) return { success:false, error:'กรุณาระบุชื่อ Affiliate' };
    if (!rows.length) return { success:false, error:'ไม่พบข้อมูลสินค้าใน Excel' };
    var t = rows.reduce(function(a,r) {
      a.gmv += affProductNumber_(r.gmv); a.commission += affProductNumber_(r.commission);
      a.orders += affProductNumber_(r.orders); a.productsSold += affProductNumber_(r.productsSold);
      a.impressions += affProductNumber_(r.impressions); a.clicks += affProductNumber_(r.clicks);
      a.refundGmv += affProductNumber_(r.refundGmv); a.refundItems += affProductNumber_(r.refundItems);
      a.videos += affProductNumber_(r.affiliateVideos); a.lives += affProductNumber_(r.affiliateLives);
      return a;
    }, {gmv:0,commission:0,orders:0,productsSold:0,impressions:0,clicks:0,refundGmv:0,refundItems:0,videos:0,lives:0});
    var content = rows.map(function(r) {
      return {
        type:'สินค้า Affiliate', title:r.productName || '', contentId:String(r.productId || ''), postDate:'',
        productName:r.productName || '', gmv:affProductNumber_(r.gmv), views:affProductNumber_(r.impressions),
        rawExtra:JSON.stringify({
          commission:affProductNumber_(r.commission), avgGmvPerCustomer:affProductNumber_(r.avgGmvPerCustomer),
          orders:affProductNumber_(r.orders), productsSold:affProductNumber_(r.productsSold),
          avgAffiliateCustomers:affProductNumber_(r.avgAffiliateCustomers), impressions:affProductNumber_(r.impressions),
          ctr:affProductNumber_(r.ctr), gpm:affProductNumber_(r.gpm), clicks:affProductNumber_(r.clicks),
          refundGmv:affProductNumber_(r.refundGmv), refundItems:affProductNumber_(r.refundItems),
          affiliateVideos:affProductNumber_(r.affiliateVideos), affiliateLives:affProductNumber_(r.affiliateLives)
        })
      };
    });
    return saveAffiliateReport({
      platform:'TikTok Affiliate', periodStart:data.periodStart || '', periodEnd:data.periodEnd || '',
      creatorName:data.creatorName || '', handle:data.handle || '', contact:data.contact || '',
      followers:data.followers || '', category:data.category || '',
      gmv:t.gmv, productsSold:t.productsSold, refund:t.refundGmv,
      aov:t.orders ? t.gmv / t.orders : 0, ctor:t.impressions ? (t.clicks / t.impressions * 100) : 0,
      refundItems:t.refundItems, orders:t.orders, live:t.lives, videos:t.videos, views:t.impressions,
      commission:t.commission,
      remark:'นำเข้ารายงานสินค้า Excel จำนวน '+rows.length+' รายการ',
      _content:content
    });
  } catch(e) { return { success:false, error:e.toString() }; }
}

function affProductNumber_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  var match = String(value == null ? '' : value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : 0;
}

function deleteAffiliateProductImport(id) {
  try {
    var sheet = ensureAffiliateSheets_().creators, lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success:false, error:'ไม่พบข้อมูลที่ต้องการลบ' };
    var ids = sheet.getRange(2,1,lastRow-1,1).getValues();
    for (var i=0;i<ids.length;i++) if (String(ids[i][0]) === String(id)) return deleteAffiliateReport(i+2);
    return { success:false, error:'ไม่พบข้อมูลที่ต้องการลบ' };
  } catch(e) { return { success:false, error:e.toString() }; }
}

// แสดงชื่อสินค้าจริงจากชีต Affiliate_Content ในประวัติการนำเข้า
function getAffiliateProductImportHistory(limit) {
  try {
    var reports = getAllAffiliateReports(limit || 100);
    if (!reports || !reports.success) return reports;
    var contentSheet = ensureAffiliateSheets_().content;
    var productNamesByCreator = {};
    var lastRow = contentSheet.getLastRow();
    if (lastRow > 1) {
      contentSheet.getRange(2, 1, lastRow - 1, 10).getValues().forEach(function(row) {
        var creatorId = String(row[1] || '');
        var productName = String(row[6] || row[3] || '').trim();
        if (!creatorId || !productName) return;
        if (!productNamesByCreator[creatorId]) productNamesByCreator[creatorId] = [];
        if (productNamesByCreator[creatorId].indexOf(productName) < 0) productNamesByCreator[creatorId].push(productName);
      });
    }
    return { success:true, results:(reports.results || []).map(function(row) {
      var names = productNamesByCreator[String(row.id)] || [];
      return {
        id:row.id, importedAt:row.savedAt, periodStart:row.periodStart, periodEnd:row.periodEnd,
        productCount:names.length, productNames:names.join(' • '), gmv:row.gmv,
        commission:row.commission, orders:row.orders, productsSold:row.productsSold
      };
    }) };
  } catch(e) { return { success:false, error:e.toString() }; }
}

// รวมยอด GMV/Commission/Orders/สินค้าที่ขายได้ต่อสินค้า จากชีต Affiliate_Content (นำเข้ารายงานสินค้า Excel เท่านั้น)
function getAffiliateDashboardData(startDateStr, endDateStr) {
  try {
    var legacy = getLegacyAffiliateDashboardData_(startDateStr, endDateStr);
    var productData = {
      totalGMV: 0, totalCommission: 0, totalOrders: 0, totalProductsSold: 0,
      totalImpressions: 0, totalClicks: 0, totalRefundGMV: 0, productCount: 0, products: []
    };
    var idsFromExcelImport = {};
    var sheets = ensureAffiliateSheets_();
    var creatorLastRow = sheets.creators.getLastRow();
    if (creatorLastRow > 1) {
      sheets.creators.getRange(2, 1, creatorLastRow - 1, 27).getValues().forEach(function(row) {
        if (String(row[26]).indexOf('นำเข้ารายงานสินค้า Excel') === 0) idsFromExcelImport[String(row[0])] = 1;
      });
    }
    var productsByKey = {};
    var contentLastRow = sheets.content.getLastRow();
    if (contentLastRow > 1) {
      sheets.content.getRange(2, 1, contentLastRow - 1, 10).getValues().forEach(function(row) {
        if (!idsFromExcelImport[row[1]]) return;
        var key = String(row[4] || row[6] || row[3] || '');
        if (!key) return;
        if (!productsByKey[key]) {
          productsByKey[key] = {
            productId: String(row[4] || ''), productName: String(row[6] || row[3] || ''),
            gmv: 0, commission: 0, orders: 0, productsSold: 0, impressions: 0,
            clicks: 0, refundGmv: 0, affiliateVideos: 0, affiliateLives: 0
          };
        }
        var x = productsByKey[key];
        var extra = {};
        try { extra = row[9] ? JSON.parse(row[9]) : {}; } catch (parseErr) {}
        x.gmv += Number(row[7]) || 0;
        x.impressions += Number(extra.impressions != null ? extra.impressions : row[8]) || 0;
        x.commission += Number(extra.commission) || 0;
        x.orders += Number(extra.orders) || 0;
        x.productsSold += Number(extra.productsSold) || 0;
        x.clicks += Number(extra.clicks) || 0;
        x.refundGmv += Number(extra.refundGmv) || 0;
        x.affiliateVideos += Number(extra.affiliateVideos) || 0;
        x.affiliateLives += Number(extra.affiliateLives) || 0;
      });
    }
    productData.products = Object.keys(productsByKey).map(function(k) { return productsByKey[k]; }).sort(function(a, b) { return b.gmv - a.gmv; });
    productData.products.forEach(function(x) {
      productData.totalGMV += x.gmv; productData.totalCommission += x.commission;
      productData.totalOrders += x.orders; productData.totalProductsSold += x.productsSold;
      productData.totalImpressions += x.impressions; productData.totalClicks += x.clicks;
      productData.totalRefundGMV += x.refundGmv;
    });
    productData.productCount = productData.products.length;
    legacy.productData = productData;
    // รายงานคำสั่งซื้อ Affiliate แบบใหม่ (ชีต Affiliate_Orders — ดูไฟล์ AffiliateOrders.gs)
    mergeAffiliateOrderData_(legacy, startDateStr, endDateStr);
    return { success: true, data: legacy };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    (body.events || []).forEach(function(ev) {
      if (ev.source && ev.source.groupId) Logger.log('พบ Group ID: ' + ev.source.groupId);
      else if (ev.source && ev.source.userId) Logger.log('พบ User ID: ' + ev.source.userId);
    });
  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
  }
  return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
}


// ใช้วันที่ชำระเงิน (คอลัมน์ AE) เป็นวันอ้างอิงสำหรับ LINE Shop
function getEffectiveReportDate_(row) {
  var ad = String(row[16] || '').trim().toLowerCase();
  if (ad === 'line shop') {
    return row[30] ? new Date(row[30]) : null;
  }
  return row[22] ? new Date(row[22]) : (row[1] ? new Date(row[1]) : null);
}
