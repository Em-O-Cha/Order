// ==================== AFFILIATE: รายงานคำสั่งซื้อ (แบบใหม่ของ TikTok Shop) ====================
//
// วางไฟล์นี้เป็นไฟล์ใหม่ในโปรเจกต์ Apps Script "Revenue Spunky Online" (ใช้ REVENUE_SHEET_ID,
// parseAffDateStr_ และ formatAffDateDisplay_ จาก Code.gs)
//
// TikTok เลิกให้ดาวน์โหลดรายงานสินค้า Affiliate แบบเดิม (สรุปต่อสินค้า) แล้วให้รายงานรายคำสั่งซื้อแทน
// 1 แถว = 1 SKU ใน 1 คำสั่งซื้อ ที่มาจากครีเอเตอร์ 1 คน/คอนเทนต์ 1 ชิ้น หน้าเว็บ (index.html) อ่านไฟล์/ตารางที่วาง
// แล้วส่งแถวที่แปลงแล้วมาให้ saveAffiliateOrderImport() เก็บในชีต Affiliate_Orders
//
// - กันซ้ำด้วยคีย์ หมายเลขคำสั่งซื้อ|SKU|ครีเอเตอร์|รหัสเนื้อหา: นำเข้าไฟล์ช่วงวันที่ทับกันได้ แถวเดิมจะถูกอัปเดต
//   (สถานะคำสั่งซื้อ/ค่าคอมจริง/เวลาจ่ายค่าคอม ล่าสุด) ไม่บวกยอดซ้ำ
// - รหัสยาว (คำสั่งซื้อ/สินค้า/SKU/คอนเทนต์) และวันเวลา เก็บเป็นข้อความ (@) กัน Sheets ปัดเลขหลักท้ายเป็น 000
// - ชีตข้อมูลเดิม (Affiliate_Creators / Affiliate_Content) ไม่ถูกแตะ Dashboard รวมยอดทั้งสองแบบ
//   ผ่าน mergeAffiliateOrderData_() ที่ getAffiliateDashboardData() ใน Code.gs เรียก

var AFFILIATE_ORDER_SHEET_NAME = 'Affiliate_Orders';
var AFFILIATE_ORDER_IMPORT_SHEET_NAME = 'Affiliate_Order_Imports';

// [field, หัวคอลัมน์ในชีต, ชนิด] — ชนิด id/dt เก็บเป็นข้อความ, num = ตัวเลข (ว่างได้), txt = ข้อความ
// หัวคอลัมน์ของข้อมูลจาก TikTok ใช้ชื่อเดียวกับในไฟล์ต้นฉบับ
var AFF_ORDER_FIELDS_ = [
  ['key', 'Key', 'txt'],
  ['firstImportId', 'ชุดนำเข้าแรก', 'txt'],
  ['lastImportId', 'ชุดนำเข้าล่าสุด', 'txt'],
  ['firstImportedAt', 'นำเข้าครั้งแรก', 'dt'],
  ['updatedAt', 'อัปเดตล่าสุด', 'dt'],
  ['refDate', 'วันที่อ้างอิง', 'dt'],
  ['commissionStatus', 'สถานะค่าคอม', 'txt'],
  ['gmvCounted', 'GMV ที่นับ', 'num'],
  ['refundGmv', 'GMV คืนเงิน', 'num'],
  ['qtyCounted', 'จำนวนที่นับ', 'num'],
  ['commissionCounted', 'ค่าคอมที่นับ', 'num'],
  ['bonusCounted', 'โบนัสร่วมทุนที่นับ', 'num'],
  ['orderId', 'หมายเลขคำสั่งซื้อ', 'id'],
  ['productId', 'รหัสสินค้า', 'id'],
  ['productName', 'ชื่อสินค้า', 'txt'],
  ['skuId', 'ID ของ SKU', 'id'],
  ['price', 'ราคา', 'num'],
  ['paymentAmount', 'Payment Amount', 'num'],
  ['currency', 'สกุลเงิน', 'txt'],
  ['qty', 'ปริมาณ', 'num'],
  ['refundedAll', 'คืนสินค้าหรือคืนเงินทั้งหมดแล้ว', 'txt'],
  ['paymentMethod', 'วิธีการชำระเงิน', 'txt'],
  ['orderStatus', 'สถานะคำสั่งซื้อ', 'txt'],
  ['creator', 'ชื่อผู้ใช้ของครีเอเตอร์', 'txt'],
  ['contentType', 'ประเภทเนื้อหา', 'txt'],
  ['carousel', 'รูปภาพแบบเลื่อน', 'txt'],
  ['contentId', 'รหัสเนื้อหา', 'id'],
  ['commissionModel', 'commission model', 'txt'],
  ['pitRate', 'อัตราการหัก ณ ที่จ่ายสำหรับ PIT', 'num'],
  ['pitEst', 'PIT โดยประมาณ', 'num'],
  ['pitActual', 'PIT จริง', 'num'],
  ['stdRate', 'อัตราค่าคอมมิชชั่นมาตรฐาน', 'num'],
  ['stdBaseEst', 'ฐานค่าคอมมิชชั่นโดยประมาณ', 'num'],
  ['stdEst', 'การจ่ายค่าคอมมิชชั่นมาตรฐานโดยประมาณ', 'num'],
  ['stdBaseActual', 'ฐานค่าคอมมิชชั่นจริง', 'num'],
  ['stdActual', 'ค่าคอมมิชชั่นที่ต้องชำระจริง', 'num'],
  ['adsRate', 'อัตราค่าคอมมิชชั่นโฆษณาร้านค้า', 'num'],
  ['adsEst', 'การจ่ายค่าคอมมิชชั่นโฆษณาร้านค้าโดยประมาณ', 'num'],
  ['adsActual', 'การจ่ายค่าคอมมิชชั่นโฆษณาร้านค้าที่ต้องชำระจริง', 'num'],
  ['bonusEst', 'โบนัสครีเอเตอร์แบบร่วมทุนโดยประมาณ', 'num'],
  ['bonusActual', 'โบนัสครีเอเตอร์แบบร่วมทุนตามจริง', 'num'],
  ['createdAt', 'เวลาที่สร้าง', 'dt'],
  ['paidAt', 'เวลาชำระเงิน', 'dt'],
  ['deliveredAt', 'Order Delivery Time', 'dt'],
  ['commissionPaidAt', 'เวลาที่ชำระค่าคอมมิชชั่น', 'dt'],
  ['platform', 'Platform', 'txt']
];
var AFF_ORDER_IMPORT_HEADERS_ = ['ชุดนำเข้า', 'นำเข้าเมื่อ', 'ชื่อไฟล์', 'วันที่เริ่ม', 'วันที่สิ้นสุด', 'จำนวนแถว', 'เพิ่มใหม่', 'อัปเดต',
  'ครีเอเตอร์', 'GMV ที่นับ', 'ค่าคอมที่นับ', 'คำเตือน'];

// คืน { sheet, col: {field: index 0-based}, width } — เพิ่มหัวคอลัมน์ที่ขาดต่อท้ายให้อัตโนมัติ (ชีตที่สร้างจากเวอร์ชันก่อน)
function ensureAffiliateOrderSheet_() {
  var ss = SpreadsheetApp.openById(REVENUE_SHEET_ID);
  var sh = ss.getSheetByName(AFFILIATE_ORDER_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(AFFILIATE_ORDER_SHEET_NAME);
    sh.getRange(1, 1, 1, AFF_ORDER_FIELDS_.length).setValues([AFF_ORDER_FIELDS_.map(function (f) { return f[1]; })]);
    sh.setFrozenRows(1);
  }
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var add = AFF_ORDER_FIELDS_.filter(function (f) { return headers.indexOf(f[1]) < 0; }).map(function (f) { return f[1]; });
  if (add.length) {
    sh.getRange(1, headers.length + 1, 1, add.length).setValues([add]);
    headers = headers.concat(add);
  }
  var col = {};
  AFF_ORDER_FIELDS_.forEach(function (f) { col[f[0]] = headers.indexOf(f[1]); });
  return { sheet: sh, col: col, width: headers.length };
}

// ก่อนเขียนข้อมูล nRows แถว (เริ่มแถว 2): เพิ่มแถวให้พอ และตั้งคอลัมน์รหัสยาว/วันเวลาเป็นข้อความ (@)
function affOrderPrepareRows_(t, nRows) {
  var sh = t.sheet, need = nRows + 1;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  AFF_ORDER_FIELDS_.forEach(function (f) {
    if (f[2] === 'id' || f[2] === 'dt' || f[0] === 'key') sh.getRange(2, t.col[f[0]] + 1, nRows, 1).setNumberFormat('@');
  });
  SpreadsheetApp.flush();
}

function ensureAffiliateOrderImportSheet_() {
  var ss = SpreadsheetApp.openById(REVENUE_SHEET_ID);
  var sh = ss.getSheetByName(AFFILIATE_ORDER_IMPORT_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(AFFILIATE_ORDER_IMPORT_SHEET_NAME);
    sh.getRange(1, 1, 1, AFF_ORDER_IMPORT_HEADERS_.length).setValues([AFF_ORDER_IMPORT_HEADERS_]);
    sh.setFrozenRows(1);
    sh.getRange(1, 4, sh.getMaxRows(), 2).setNumberFormat('@');
  }
  return sh;
}

function affOrderCell_(type, v) {
  if (v === null || v === undefined) return '';
  if (type === 'num') { var n = Number(v); return (v === '' || !isFinite(n)) ? '' : n; }
  return String(v);
}

// data = { rows:[...จาก parseAffiliateOrderMatrix()...], fileName, warnText }
function saveAffiliateOrderImport(data) {
  var rows = (data && data.rows) || [];
  if (!rows.length) return { success: false, error: 'ไม่พบข้อมูลคำสั่งซื้อ' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนบันทึกพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    var t = ensureAffiliateOrderSheet_(), sh = t.sheet, col = t.col, width = t.width;
    var now = new Date();
    var importId = 'AFO' + Utilities.formatDate(now, 'GMT+7', 'yyMMddHHmmss') + ('00' + (now.getTime() % 1000)).slice(-3);
    var nowStr = Utilities.formatDate(now, 'GMT+7', 'yyyy-MM-dd HH:mm:ss');
    var lastRow = sh.getLastRow();
    var existing = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, width).getValues() : [];
    var byKey = {};
    existing.forEach(function (r, i) { var k = String(r[col.key]); if (k) byKey[k] = i; });
    var inserted = 0, updated = 0, creators = {}, gmv = 0, commission = 0, minDate = '', maxDate = '';
    rows.forEach(function (o) {
      if (!o || !o.key) return;
      var idx = byKey[o.key], r;
      if (idx === undefined) {
        r = new Array(width); for (var c = 0; c < width; c++) r[c] = '';
        r[col.firstImportId] = importId; r[col.firstImportedAt] = nowStr;
        existing.push(r); byKey[o.key] = existing.length - 1; inserted++;
      } else { r = existing[idx]; updated++; }
      AFF_ORDER_FIELDS_.forEach(function (f) {
        if (f[0] === 'firstImportId' || f[0] === 'firstImportedAt' || f[0] === 'lastImportId' || f[0] === 'updatedAt') return;
        r[col[f[0]]] = affOrderCell_(f[2], o[f[0]]);
      });
      r[col.lastImportId] = importId; r[col.updatedAt] = nowStr;
      creators[String(o.creator || '').toLowerCase()] = 1;
      gmv += Number(o.gmvCounted) || 0; commission += Number(o.commissionCounted) || 0;
      if (o.refDate) { if (!minDate || o.refDate < minDate) minDate = o.refDate; if (!maxDate || o.refDate > maxDate) maxDate = o.refDate; }
    });
    affOrderPrepareRows_(t, existing.length);
    sh.getRange(2, 1, existing.length, width).setValues(existing);
    ensureAffiliateOrderImportSheet_().appendRow([importId, nowStr, data.fileName || '', minDate, maxDate, rows.length, inserted, updated,
      Object.keys(creators).length, Math.round(gmv * 100) / 100, Math.round(commission * 100) / 100, data.warnText || '']);
    return { success: true, id: importId, inserted: inserted, updated: updated };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// แสดงในรูปแบบเดียวกับประวัติแบบเดิม (getAffiliateProductImportHistory): ช่วงวันที่ yyyy-MM-dd,
// นำเข้าเมื่อแบบ toLocaleString('th-TH'), ชื่อสินค้า และจำนวนคำสั่งซื้อของแต่ละชุด
function getAffiliateOrderImportHistory(limit) {
  try {
    var sh = ensureAffiliateOrderImportSheet_(), lastRow = sh.getLastRow();
    if (lastRow <= 1) return { success: true, results: [] };
    var n = Math.min(lastRow - 1, limit || 100);
    var data = sh.getRange(lastRow - n + 1, 1, n, AFF_ORDER_IMPORT_HEADERS_.length).getValues();
    // ชื่อสินค้า/คำสั่งซื้อ/ครีเอเตอร์ ของแต่ละชุด จากแถวที่ชุดนั้นเพิ่มหรืออัปเดต
    var byImport = {};
    var t = ensureAffiliateOrderSheet_(), oLast = t.sheet.getLastRow(), col = t.col;
    if (oLast > 1) t.sheet.getRange(2, 1, oLast - 1, t.width).getValues().forEach(function (r) {
      [String(r[col.firstImportId]), String(r[col.lastImportId])].forEach(function (id, i, ids) {
        if (!id || (i === 1 && id === ids[0])) return;
        var b = byImport[id] || (byImport[id] = { products: [], orders: {}, creators: [] });
        var name = String(r[col.productName] || '').trim(), creator = String(r[col.creator] || '').trim();
        if (name && b.products.indexOf(name) < 0) b.products.push(name);
        if (creator && b.creators.indexOf('@' + creator) < 0) b.creators.push('@' + creator);
        if (String(r[col.commissionStatus]) !== 'ยกเลิก' && r[col.orderId]) b.orders[String(r[col.orderId])] = 1;
      });
    });
    var results = data.map(function (r) {
      var id = String(r[0]), b = byImport[id] || { products: [], orders: {}, creators: [] };
      return { id: id, importedAt: affThaiDateTime_(r[1]), fileName: String(r[2] || ''), periodStart: affYmd_(r[3]),
        periodEnd: affYmd_(r[4]), rowCount: r[5], inserted: r[6], updated: r[7], creatorCount: r[8],
        gmv: r[9], commission: r[10], warn: String(r[11] || ''), productCount: b.products.length,
        productNames: b.products.join(' • '), creators: b.creators.join(', '), orders: Object.keys(b.orders).length };
    });
    results.reverse();
    return { success: true, results: results };
  } catch (e) { return { success: false, error: e.toString() }; }
}

// ค่าในชีตอาจเป็นข้อความ 'yyyy-MM-dd ...' หรือถูก Sheets แปลงเป็น Date ไปแล้ว — คืน 'yyyy-MM-dd' เสมอ
function affYmd_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'GMT+7', 'yyyy-MM-dd');
  var s = String(v).trim(), m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : s.slice(0, 10);
}

// แบบเดียวกับ "บันทึกเมื่อ" ของข้อมูลแบบเดิม: new Date(...).toLocaleString('th-TH') เช่น 30/9/2569 10:23:48
function affThaiDateTime_(v) {
  if (!v) return '';
  var d = Object.prototype.toString.call(v) === '[object Date]' ? v : new Date(String(v).trim().replace(' ', 'T') + '+07:00');
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
}

// ลบเฉพาะแถวที่ชุดนี้ "เพิ่มเข้ามาครั้งแรก" — แถวที่มีอยู่ก่อนแล้วและชุดนี้แค่อัปเดต จะคงไว้ (ค่าตามชุดนี้)
function deleteAffiliateOrderImport(importId) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, error: 'ระบบมีคนบันทึกพร้อมกันหลายคน กรุณาลองใหม่อีกครั้ง' }; }
  try {
    importId = String(importId || '');
    if (importId.indexOf('AFO') !== 0) return { success: false, error: 'รหัสชุดนำเข้าไม่ถูกต้อง' };
    var t = ensureAffiliateOrderSheet_(), sh = t.sheet, lastRow = sh.getLastRow(), removed = 0;
    if (lastRow > 1) {
      var all = sh.getRange(2, 1, lastRow - 1, t.width).getValues();
      var keep = all.filter(function (r) { return String(r[t.col.firstImportId]) !== importId; });
      removed = all.length - keep.length;
      if (removed) {
        sh.getRange(2, 1, all.length, t.width).clearContent();
        if (keep.length) sh.getRange(2, 1, keep.length, t.width).setValues(keep);
      }
    }
    var log = ensureAffiliateOrderImportSheet_(), logLast = log.getLastRow();
    if (logLast > 1) {
      var ids = log.getRange(2, 1, logLast - 1, 1).getValues();
      for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === importId) log.deleteRow(i + 2);
    }
    return { success: true, removed: removed };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// รวมยอดจาก Affiliate_Orders ในช่วงวันที่ (ตาม "วันที่อ้างอิง" = เวลาที่สร้างคำสั่งซื้อ) เข้าไปในผลของ
// getLegacyAffiliateDashboardData_() — ครีเอเตอร์คนเดียวกัน (Handle ตรงกัน) รวมเป็นแถวเดียว
function mergeAffiliateOrderData_(totals, startDateStr, endDateStr) {
  var t = ensureAffiliateOrderSheet_(), sh = t.sheet, col = t.col, lastRow = sh.getLastRow();
  if (lastRow <= 1) return totals;
  var start = startDateStr ? String(startDateStr).slice(0, 10) : '', end = endDateStr ? String(endDateStr).slice(0, 10) : '';
  var rows = sh.getRange(2, 1, lastRow - 1, t.width).getValues();

  // ชื่อที่แสดง/ผู้ติดตาม/หมวดหมู่ จากข้อมูลโปรไฟล์ครีเอเตอร์ที่เคยนำเข้าแบบเดิม (จับคู่ด้วย Handle)
  var profile = {};
  try {
    var cs = ensureAffiliateSheets_().creators, cLast = cs.getLastRow();
    if (cLast > 1) cs.getRange(2, 1, cLast - 1, 12).getValues().forEach(function (r) {
      var h = String(r[6] || '').replace(/^@/, '').trim().toLowerCase();
      if (h) profile[h] = { name: r[5], followers: r[10], category: r[11] };
    });
  } catch (e) {}

  var byCreator = {}, byContent = {}, byProduct = {}, orderIds = {};
  var sum = { gmv: 0, commission: 0, sold: 0, refund: 0, bonus: 0 };
  rows.forEach(function (r) {
    var ref = String(r[col.refDate] || '').slice(0, 10);
    if (start && end && (!ref || ref < start || ref > end)) return;
    var status = String(r[col.commissionStatus] || '');
    if (status === 'ยกเลิก') return;
    var creator = String(r[col.creator] || '').replace(/^@/, '').trim(), h = creator.toLowerCase();
    var orderId = String(r[col.orderId] || ''), contentId = String(r[col.contentId] || '');
    var productId = String(r[col.productId] || ''), productName = String(r[col.productName] || '');
    var gmv = Number(r[col.gmvCounted]) || 0, com = Number(r[col.commissionCounted]) || 0, qty = Number(r[col.qtyCounted]) || 0;
    sum.gmv += gmv; sum.commission += com; sum.sold += qty;
    sum.refund += Number(r[col.refundGmv]) || 0; sum.bonus += Number(r[col.bonusCounted]) || 0;
    if (orderId) orderIds[orderId] = 1;

    var c = byCreator[h] || (byCreator[h] = { creator: creator, gmv: 0, commission: 0, sold: 0, orders: {} });
    c.gmv += gmv; c.commission += com; c.sold += qty; if (orderId) c.orders[orderId] = 1;

    var ck = contentId || ('ไม่ระบุ|' + h);
    var ct = byContent[ck] || (byContent[ck] = { contentId: contentId, type: String(r[col.contentType] || '') || 'คอนเทนต์',
      creator: creator, gmv: 0, products: {}, postDate: '' });
    ct.gmv += gmv; ct.products[productName] = (ct.products[productName] || 0) + gmv;
    var created = String(r[col.createdAt] || '');
    if (created && (!ct.postDate || created < ct.postDate)) ct.postDate = created;

    var pk = productId || productName;
    var p = byProduct[pk] || (byProduct[pk] = { productId: productId, productName: productName, gmv: 0, commission: 0,
      orders: {}, productsSold: 0, impressions: 0, clicks: 0, refundGmv: 0, affiliateVideos: 0, affiliateLives: 0 });
    p.gmv += gmv; p.commission += com; p.productsSold += qty; p.refundGmv += Number(r[col.refundGmv]) || 0;
    if (orderId) p.orders[orderId] = 1;
  });

  var orderCount = Object.keys(orderIds).length;
  totals.totalGMV += sum.gmv; totals.totalCommission += sum.commission; totals.totalOrders += orderCount;
  totals.totalProductsSold += sum.sold;
  totals.totalRefundGMV = (totals.totalRefundGMV || 0) + sum.refund;
  totals.totalCreatorBonus = (totals.totalCreatorBonus || 0) + sum.bonus;

  var legacyByHandle = {};
  totals.creators.forEach(function (x) { var h = String(x.handle || '').replace(/^@/, '').trim().toLowerCase(); if (h) legacyByHandle[h] = x; });
  Object.keys(byCreator).forEach(function (h) {
    var c = byCreator[h], n = Object.keys(c.orders).length, x = legacyByHandle[h];
    if (x) {
      x.gmv += c.gmv; x.commission += c.commission; x.productsSold += c.sold; x.orders += n;
    } else {
      var pf = profile[h] || {};
      totals.creators.push({ id: '', creatorName: pf.name || c.creator, handle: '@' + c.creator, followers: pf.followers || '',
        category: pf.category || '', gmv: c.gmv, productsSold: c.sold, orders: n, views: '', commission: c.commission,
        periodStart: '', periodEnd: '' });
    }
  });
  totals.creators.sort(function (a, b) { return b.gmv - a.gmv; });
  totals.creatorCount = totals.creators.length;

  Object.keys(byContent).forEach(function (k) {
    var ct = byContent[k], top = '', topGmv = -1;
    Object.keys(ct.products).forEach(function (n) { if (ct.products[n] > topGmv) { topGmv = ct.products[n]; top = n; } });
    var more = Object.keys(ct.products).length - 1;
    totals.topContent.push({ creatorId: '', type: ct.type, title: '@' + ct.creator, handle: '@' + ct.creator, contentId: ct.contentId,
      postDate: ct.postDate ? ct.postDate.slice(0, 16) : '', productName: top + (more > 0 ? ' (+' + more + ' สินค้า)' : ''), gmv: ct.gmv, views: '' });
  });
  totals.topContent.sort(function (a, b) { return b.gmv - a.gmv; });
  totals.topContent = totals.topContent.slice(0, 10);

  if (totals.productData) {
    var pd = totals.productData, keyed = {};
    pd.products.forEach(function (x) { keyed[x.productId || x.productName] = x; });
    Object.keys(byProduct).forEach(function (k) {
      var p = byProduct[k], n = Object.keys(p.orders).length, x = keyed[k];
      if (x) { x.gmv += p.gmv; x.commission += p.commission; x.orders += n; x.productsSold += p.productsSold; x.refundGmv += p.refundGmv; }
      else { p.orders = n; pd.products.push(p); }
    });
    pd.products.sort(function (a, b) { return b.gmv - a.gmv; });
    pd.totalGMV += sum.gmv; pd.totalCommission += sum.commission; pd.totalOrders += orderCount;
    pd.totalProductsSold += sum.sold; pd.totalRefundGMV += sum.refund; pd.productCount = pd.products.length;
  }
  return totals;
}
