/**
 * Em-O-Cha — Dashboard API (Apps Script Web App backend)
 *
 * This is a SEPARATE, READ-MOSTLY backend for the reporting dashboard in /dashboard.
 * It does not touch the shop's live order-taking Apps Script project at all — it only
 * reads from the same 3 Google Sheets the shop already writes to:
 *   - Revenue              (orders / line items)
 *   - Master Data Sales    (product master + monthly sales targets)
 *   - Members Emocha Club  (member registry + privileges)
 *
 * See ../apps-script/README.md for deployment steps.
 *
 * Design notes:
 *  - Instead of hardcoding sheet TAB names (which are easy to get wrong / rename),
 *    every table this script needs is located by scanning for a header row that
 *    contains a known set of required column names (see findTable_). This makes the
 *    script resilient to tabs being renamed or reordered, and to other tabs/tables
 *    existing in the same spreadsheet.
 *  - The Revenue sheet stores ONE ORDER AS MULTIPLE ROWS: only the first row of an
 *    order carries Revenue ID / Timestamp / Ad / Campaign / etc; extra line items are
 *    continuation rows with a BLANK Revenue ID. loadOrders_() forward-fills this.
 *  - Call action=debugSchema (with the correct password) after deploying to confirm
 *    every table was found correctly before trusting any report.
 */

// ==================== CONFIG ====================

var REVENUE_SS_ID = '1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY';   // "Revenue"
var MASTER_SS_ID = '1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w';    // "Master Data Sales"
var MEMBERS_SS_ID = '15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk';   // "Members Emocha Club"

var TZ = 'Asia/Bangkok';

// Exact column header text in the "Revenue" sheet (verbatim — do not translate/rename).
var C = {
  REVENUE_ID: 'Revenue ID',
  TIMESTAMP: 'Timestamp',
  PRODUCT: 'ProductName',
  QTY: 'Qty',
  PRICE: 'Price',
  DISCOUNT: 'Discount',
  AMOUNT: 'Amount',
  DELIVERY: 'Delivery',
  BILL_TOTAL: 'Bill Total',
  PAYMENT: 'Payment',
  CUSTOMER_NAME: 'Customer Name',
  PHONE: 'Phone Number',
  SALES_NAME: 'Sales Name',
  AD: 'Ad',
  CAMPAIGN: 'Campaign',
  CUSTOMER_TYPE: 'CustomerType',
  REMARK: 'Remark',
  ORDER_SHOPEE: 'Order No.Shopee',
  ORDER_TIKTOK: 'Order No.TikTok',
  ORDER_DATE: 'Order Date',
  PROVINCE: 'Province',
  ADDRESS: 'Customer Address',
  LINE_UID: 'LINE UID'
};

// Fields that live on the FIRST row of an order only (forward-filled onto the order object).
var ORDER_HEADER_FIELDS = [
  C.REVENUE_ID, C.TIMESTAMP, C.PAYMENT, C.DELIVERY, C.BILL_TOTAL, C.CUSTOMER_NAME,
  C.PHONE, C.SALES_NAME, C.AD, C.CAMPAIGN, C.CUSTOMER_TYPE, C.REMARK,
  C.ORDER_SHOPEE, C.ORDER_TIKTOK, C.ORDER_DATE, C.PROVINCE, C.ADDRESS, C.LINE_UID
];

var GROUP_SHEET_NAMES = {
  product: 'DashboardKeywordGroups_Product',
  item: 'DashboardKeywordGroups_Item'
};

// ==================== ENTRY POINTS ====================

function doGet(e) {
  return route_((e && e.parameter) || {});
}

function doPost(e) {
  var p = {};
  try {
    if (e && e.postData && e.postData.contents) p = JSON.parse(e.postData.contents);
    else p = (e && e.parameter) || {};
  } catch (err) {
    p = (e && e.parameter) || {};
  }
  return route_(p);
}

function route_(p) {
  try {
    var action = p.action;
    if (action === 'ping') {
      return jsonOut_({ success: true, message: 'pong', time: new Date().toISOString() });
    }
    if (!checkPassword_(p.password)) {
      return jsonOut_({ success: false, error: 'รหัสผ่านไม่ถูกต้อง หรือยังไม่ได้ตั้งค่า ADMIN_PASSWORD ใน Script Properties' });
    }
    switch (action) {
      case 'verifyPassword':
        return jsonOut_({ success: true });
      case 'debugSchema':
        return jsonOut_(actionDebugSchema_());
      case 'getDashboardData':
        return jsonOut_(actionGetDashboardData_(p));
      case 'getTargetsReport':
        return jsonOut_(actionGetTargets_());
      case 'getCustomerReport':
        return jsonOut_(actionGetCustomers_());
      case 'getSignupReport':
        return jsonOut_(actionGetSignups_(p));
      case 'getKeywordGroups':
        return jsonOut_(actionGetKeywordGroups_(p));
      case 'saveKeywordGroups':
        return jsonOut_(actionSaveKeywordGroups_(p));
      case 'aiAnalyze':
        return jsonOut_(actionAiAnalyze_(p));
      case 'aiAnalyzeAll':
        return jsonOut_(actionAiAnalyzeAll_(p));
      default:
        return jsonOut_({ success: false, error: 'ไม่รู้จัก action: ' + action });
    }
  } catch (err) {
    return jsonOut_({ success: false, error: String((err && err.message) || err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkPassword_(pw) {
  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!real) return false; // not configured yet -> deny everything by default
  return String(pw || '') === String(real);
}

// ==================== GENERIC TABLE DISCOVERY ====================

/**
 * Scans every sheet/tab of a spreadsheet for a header row that contains ALL of
 * requiredHeaders (exact string match, any order, anywhere in the row). Reads rows
 * below that header until the first row that is entirely blank (marks end of table,
 * since several tables can be stacked in one tab). Returns null if not found.
 */
function findTable_(spreadsheetId, requiredHeaders) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (!lastRow || !lastCol) continue;
    var scanRows = Math.min(lastRow, 40);
    var head = sheet.getRange(1, 1, scanRows, lastCol).getValues();
    for (var r = 0; r < head.length; r++) {
      var rowStrs = head[r].map(function (c) { return String(c).trim(); });
      var ok = requiredHeaders.every(function (h) { return rowStrs.indexOf(h) !== -1; });
      if (!ok) continue;

      var headerRowNum = r + 1;
      var colIndex = {};
      rowStrs.forEach(function (h, i) { if (h && colIndex[h] === undefined) colIndex[h] = i; });

      var dataStartRow = headerRowNum + 1;
      var rows = [];
      if (dataStartRow <= lastRow) {
        var block = sheet.getRange(dataStartRow, 1, lastRow - headerRowNum, lastCol).getValues();
        for (var d = 0; d < block.length; d++) {
          var blank = block[d].every(function (c) { return c === '' || c === null || c === undefined; });
          if (blank) break;
          rows.push(block[d]);
        }
      }
      return { sheetName: sheet.getName(), headerRowNum: headerRowNum, headers: rowStrs, colIndex: colIndex, rows: rows, lastCol: lastCol };
    }
  }
  return null;
}

function actionDebugSchema_() {
  function tryFind(ssId, headers, label) {
    try {
      var t = findTable_(ssId, headers);
      if (!t) return { label: label, found: false };
      return { label: label, found: true, sheetName: t.sheetName, headerRowNum: t.headerRowNum, headers: t.headers.filter(function (h) { return h; }), rowCount: t.rows.length };
    } catch (e) {
      return { label: label, found: false, error: String(e) };
    }
  }
  var props = PropertiesService.getScriptProperties();
  return {
    success: true,
    revenue: tryFind(REVENUE_SS_ID, [C.REVENUE_ID, C.TIMESTAMP, C.PRODUCT, C.AD, C.CAMPAIGN, C.BILL_TOTAL], 'Revenue orders table'),
    targets: tryFind(MASTER_SS_ID, ['Month', 'Total'], 'Monthly sales target table'),
    members: tryFind(MEMBERS_SS_ID, ['LINE UID', 'วันที่สมัคร', 'รหัสสมาชิก'], 'Members main table'),
    privileges: tryFind(MEMBERS_SS_ID, ['LINE UID', 'ชื่อสิทธิ์', 'ให้โดย', 'เปิดใช้งาน(TRUE/FALSE)'], 'Member privileges table'),
    scriptProperties: {
      ADMIN_PASSWORD_set: !!props.getProperty('ADMIN_PASSWORD'),
      ANTHROPIC_API_KEY_set: !!props.getProperty('ANTHROPIC_API_KEY'),
      ANTHROPIC_MODEL: props.getProperty('ANTHROPIC_MODEL') || '(default: claude-sonnet-5)'
    }
  };
}

// ==================== DATE HELPERS ====================

function parseCellDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return normalizeYear_(v);
  if (!v) return null;
  var s = String(v).trim();
  if (!s) return null;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    var day = +m[1], mon = +m[2], yr = +m[3];
    if (yr < 100) yr += 2000;
    if (yr > 2400) yr -= 543; // Buddhist-era safety net
    var hh = +(m[4] || 0), mi = +(m[5] || 0), ss = +(m[6] || 0);
    var d1 = new Date(yr, mon - 1, day, hh, mi, ss);
    return isNaN(d1.getTime()) ? null : d1;
  }
  var d2 = new Date(s);
  if (!isNaN(d2.getTime())) return normalizeYear_(d2);
  return null;
}
function normalizeYear_(d) {
  if (d.getFullYear() > 2400) {
    return new Date(d.getFullYear() - 543, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  }
  return d;
}
function weekStartKey_(date) {
  var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  var dow = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - dow);
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}
function monthKey_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM'); }
function shiftMonthKey_(mk, delta) {
  var parts = mk.split('-');
  var y = +parts[0], m = +parts[1] - 1;
  var d = new Date(y, m + delta, 1);
  return Utilities.formatDate(d, TZ, 'yyyy-MM');
}
function normalizePhone_(v) {
  var digits = String(v || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.substring(0, 2) === '66') digits = '0' + digits.substring(2);
  if (digits.length > 10) digits = digits.slice(-10);
  if (digits.length < 8) return null;
  return digits;
}

// ==================== ORDERS (Revenue sheet) ====================

var __ordersCache = null;
function getAllOrders_() {
  if (__ordersCache) return __ordersCache;
  var orders = loadOrders_();
  orders.forEach(function (o) {
    o.__date = parseCellDate_(o[C.ORDER_DATE]) || parseCellDate_(o[C.TIMESTAMP]);
  });
  var skipped = orders.filter(function (o) { return !o.__date; }).length;
  orders = orders.filter(function (o) { return !!o.__date; });
  orders.sort(function (a, b) { return a.__date - b.__date; });
  orders.__skippedRows = skipped;
  __ordersCache = orders;
  return orders;
}

function loadOrders_() {
  var t = findTable_(REVENUE_SS_ID, [C.REVENUE_ID, C.TIMESTAMP, C.PRODUCT, C.QTY, C.AMOUNT, C.BILL_TOTAL, C.AD, C.CAMPAIGN, C.LINE_UID]);
  if (!t) throw new Error('ไม่พบตารางออเดอร์ในชีต Revenue (โครงสร้างหัวตารางอาจเปลี่ยนไป) — ลองเรียก action=debugSchema เพื่อตรวจสอบ');
  var ci = t.colIndex;
  var orders = [];
  var current = null;
  t.rows.forEach(function (row) {
    var revId = String(row[ci[C.REVENUE_ID]] || '').trim();
    if (revId) {
      current = { orderId: revId, items: [] };
      ORDER_HEADER_FIELDS.forEach(function (f) {
        if (ci[f] !== undefined) current[f] = row[ci[f]];
      });
      orders.push(current);
    }
    if (!current) return; // stray row before any order id seen — ignore
    var productName = row[ci[C.PRODUCT]];
    if (productName === '' || productName === null || productName === undefined) return; // header-only row, no line item here
    current.items.push({
      name: String(productName),
      qty: Number(row[ci[C.QTY]]) || 0,
      price: Number(row[ci[C.PRICE]]) || 0,
      discount: Number(row[ci[C.DISCOUNT]]) || 0,
      amount: Number(row[ci[C.AMOUNT]]) || 0
    });
  });
  return orders;
}

function filterByDateRange_(orders, dateFrom, dateTo) {
  var from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
  var to = dateTo ? new Date(dateTo + 'T23:59:59') : null;
  return orders.filter(function (o) {
    if (from && o.__date < from) return false;
    if (to && o.__date > to) return false;
    return true;
  });
}

// ==================== REPORT 1: SALES OVERVIEW ====================

function bump_(map, key, amount) {
  if (!map[key]) map[key] = { orders: 0, revenue: 0 };
  map[key].orders++;
  map[key].revenue += amount;
}
function toSortedSeries_(map, keyName) {
  return Object.keys(map).sort().map(function (k) {
    var o = {};
    o[keyName] = k;
    o.orders = map[k].orders;
    o.revenue = map[k].revenue;
    return o;
  });
}

function reportSalesOverview_(filtered, all, dateFrom, dateTo) {
  var totalRevenue = 0;
  var totalOrders = filtered.length;
  var daily = {}, weekly = {}, monthly = {};
  filtered.forEach(function (o) {
    var bt = Number(o[C.BILL_TOTAL]) || 0;
    totalRevenue += bt;
    bump_(daily, Utilities.formatDate(o.__date, TZ, 'yyyy-MM-dd'), bt);
    bump_(weekly, weekStartKey_(o.__date), bt);
    bump_(monthly, Utilities.formatDate(o.__date, TZ, 'yyyy-MM'), bt);
  });
  var aov = totalOrders ? totalRevenue / totalOrders : 0;

  var previousPeriod = null;
  if (dateFrom && dateTo) {
    var from = new Date(dateFrom + 'T00:00:00');
    var to = new Date(dateTo + 'T23:59:59');
    var spanMs = to.getTime() - from.getTime();
    var prevTo = new Date(from.getTime() - 1000);
    var prevFrom = new Date(prevTo.getTime() - spanMs);
    var prevOrders = filterByDateRange_(all, Utilities.formatDate(prevFrom, TZ, 'yyyy-MM-dd'), Utilities.formatDate(prevTo, TZ, 'yyyy-MM-dd'));
    var prevRevenue = prevOrders.reduce(function (s, o) { return s + (Number(o[C.BILL_TOTAL]) || 0); }, 0);
    previousPeriod = {
      dateFrom: Utilities.formatDate(prevFrom, TZ, 'yyyy-MM-dd'),
      dateTo: Utilities.formatDate(prevTo, TZ, 'yyyy-MM-dd'),
      orders: prevOrders.length,
      revenue: prevRevenue,
      aov: prevOrders.length ? prevRevenue / prevOrders.length : 0,
      revenueChangePct: prevRevenue ? ((totalRevenue - prevRevenue) / prevRevenue * 100) : null,
      ordersChangePct: prevOrders.length ? ((totalOrders - prevOrders.length) / prevOrders.length * 100) : null
    };
  }

  return {
    totalRevenue: totalRevenue,
    totalOrders: totalOrders,
    aov: aov,
    daily: toSortedSeries_(daily, 'date'),
    weekly: toSortedSeries_(weekly, 'week'),
    monthly: toSortedSeries_(monthly, 'month'),
    previousPeriod: previousPeriod
  };
}

// ==================== REPORT 2/3/7: KEYWORD-GROUPED PRODUCTS ====================

function matchGroup_(groups, productName) {
  var name = String(productName);
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    for (var k = 0; k < g.keywords.length; k++) {
      if (g.keywords[k] && name.indexOf(g.keywords[k]) !== -1) return g.name;
    }
  }
  return null;
}

function aggregateByKeywordGroups_(orders, groups) {
  var buckets = {};
  orders.forEach(function (o) {
    o.items.forEach(function (it) {
      var g = matchGroup_(groups, it.name);
      var key = g || ('__ungrouped__:' + it.name);
      if (!buckets[key]) buckets[key] = { label: g || it.name, grouped: !!g, qty: 0, amount: 0, orderIds: {} };
      buckets[key].qty += it.qty;
      buckets[key].amount += it.amount;
      buckets[key].orderIds[o.orderId] = true;
    });
  });
  var list = Object.keys(buckets).map(function (k) {
    var b = buckets[k];
    return { name: b.label, grouped: b.grouped, qty: b.qty, amount: b.amount, orderCount: Object.keys(b.orderIds).length };
  });
  list.sort(function (a, b) { return b.amount - a.amount; });
  return list;
}

function getOrCreateConfigSheet_(name) {
  var ss = SpreadsheetApp.openById(MASTER_SS_ID);
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, 2).setValues([['GroupName', 'Keywords (คั่นด้วยจุลภาค ,)']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function getKeywordGroupsInternal_(context) {
  var sh = getOrCreateConfigSheet_(GROUP_SHEET_NAMES[context]);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var values = sh.getRange(2, 1, lastRow - 1, 2).getValues();
  var groups = [];
  values.forEach(function (row) {
    var name = String(row[0] || '').trim();
    if (!name) return;
    var keywords = String(row[1] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    groups.push({ name: name, keywords: keywords });
  });
  return groups;
}

function saveKeywordGroupsInternal_(context, groups) {
  var sh = getOrCreateConfigSheet_(GROUP_SHEET_NAMES[context]);
  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, 2).clearContent();
  if (!groups || !groups.length) return;
  var rows = groups.map(function (g) { return [g.name, (g.keywords || []).join(', ')]; });
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
}

function actionGetKeywordGroups_(p) {
  var context = p.context === 'item' ? 'item' : 'product';
  var groups = getKeywordGroupsInternal_(context);
  var all = getAllOrders_();
  var filtered = filterByDateRange_(all, p.dateFrom, p.dateTo);
  var raw = {};
  filtered.forEach(function (o) {
    o.items.forEach(function (it) {
      if (!raw[it.name]) raw[it.name] = { qty: 0, amount: 0, orders: {} };
      raw[it.name].qty += it.qty;
      raw[it.name].amount += it.amount;
      raw[it.name].orders[o.orderId] = true;
    });
  });
  var rawList = Object.keys(raw).map(function (name) {
    return {
      name: name, qty: raw[name].qty, amount: raw[name].amount,
      orderCount: Object.keys(raw[name].orders).length, matchedGroup: matchGroup_(groups, name)
    };
  });
  rawList.sort(function (a, b) { return b.amount - a.amount; });
  return { success: true, context: context, groups: groups, rawProductNames: rawList };
}

function actionSaveKeywordGroups_(p) {
  var context = p.context === 'item' ? 'item' : 'product';
  var groups = typeof p.groups === 'string' ? JSON.parse(p.groups) : p.groups;
  if (!Array.isArray(groups)) throw new Error('รูปแบบ groups ไม่ถูกต้อง');
  groups.forEach(function (g) {
    if (!g || typeof g.name !== 'string') throw new Error('แต่ละกลุ่มต้องมีชื่อ (name)');
    if (!Array.isArray(g.keywords)) g.keywords = [];
  });
  saveKeywordGroupsInternal_(context, groups);
  return { success: true, saved: groups.length };
}

// ==================== REPORT 4/5: BY AD CHANNEL ====================

function reportByAd_(orders) {
  var map = {};
  var totalRevenue = 0, totalOrders = orders.length;
  orders.forEach(function (o) {
    var ad = String(o[C.AD] || '').trim() || 'ไม่ระบุช่องทาง';
    if (!map[ad]) map[ad] = { orders: 0, revenue: 0 };
    var bt = Number(o[C.BILL_TOTAL]) || 0;
    map[ad].orders++;
    map[ad].revenue += bt;
    totalRevenue += bt;
  });
  var list = Object.keys(map).map(function (k) {
    return {
      ad: k, orders: map[k].orders, revenue: map[k].revenue,
      aov: map[k].orders ? map[k].revenue / map[k].orders : 0,
      revenueSharePct: totalRevenue ? (map[k].revenue / totalRevenue * 100) : 0,
      orderSharePct: totalOrders ? (map[k].orders / totalOrders * 100) : 0
    };
  });
  list.sort(function (a, b) { return b.revenue - a.revenue; });
  return list;
}

// ==================== REPORT 6: BEST-SELLING TIME SLOTS ====================

function reportTimeSlots_(orders) {
  var DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var hourMap = {}, dowHourMap = {};
  orders.forEach(function (o) {
    var d = o.__date;
    var hr = d.getHours();
    var dow = d.getDay();
    var bt = Number(o[C.BILL_TOTAL]) || 0;
    if (!hourMap[hr]) hourMap[hr] = { orders: 0, revenue: 0 };
    hourMap[hr].orders++;
    hourMap[hr].revenue += bt;
    var key = dow + '-' + hr;
    if (!dowHourMap[key]) dowHourMap[key] = { orders: 0, revenue: 0 };
    dowHourMap[key].orders++;
    dowHourMap[key].revenue += bt;
  });
  var hourly = [];
  for (var h = 0; h < 24; h++) {
    hourly.push({ hour: h, orders: (hourMap[h] || { orders: 0 }).orders, revenue: (hourMap[h] || { revenue: 0 }).revenue });
  }
  var heatmap = [];
  for (var dw = 0; dw < 7; dw++) {
    for (var h2 = 0; h2 < 24; h2++) {
      var k = dw + '-' + h2;
      var cell = dowHourMap[k] || { orders: 0, revenue: 0 };
      heatmap.push({ dow: dw, dowLabel: DOW[dw], hour: h2, orders: cell.orders, revenue: cell.revenue });
    }
  }
  return { hourly: hourly, heatmap: heatmap, dowLabels: DOW };
}

// ==================== REPORT 8: MONTHLY TARGET VS ACTUAL (all-time) ====================

var EN_MONTHS_ = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function reportTargets_() {
  var t = findTable_(MASTER_SS_ID, ['Month', 'Total']);
  if (!t) return { months: [], channelNames: [], note: 'ไม่พบตารางเป้าหมายยอดขาย (Month/Total) ในชีต Master Data Sales' };
  var ci = t.colIndex;
  var monthCol = ci['Month'], totalCol = ci['Total'];
  var channelCols = [];
  Object.keys(ci).forEach(function (hName) {
    var idx = ci[hName];
    if (idx > monthCol && idx < totalCol) channelCols.push({ name: hName, idx: idx });
  });

  var targets = t.rows.map(function (row) {
    var monthLabel = String(row[monthCol] || '').trim();
    if (!monthLabel) return null;
    var channels = {};
    channelCols.forEach(function (c) { channels[c.name] = Number(row[c.idx]) || 0; });
    return { monthLabel: monthLabel, channels: channels, total: Number(row[totalCol]) || 0 };
  }).filter(Boolean);

  var actualsByMonthName = {};
  getAllOrders_().forEach(function (o) {
    var mName = EN_MONTHS_[o.__date.getMonth()];
    if (!actualsByMonthName[mName]) actualsByMonthName[mName] = { revenue: 0, orders: 0, channels: {} };
    var bt = Number(o[C.BILL_TOTAL]) || 0;
    actualsByMonthName[mName].revenue += bt;
    actualsByMonthName[mName].orders++;
    var ad = String(o[C.AD] || '').trim() || 'ไม่ระบุช่องทาง';
    actualsByMonthName[mName].channels[ad] = (actualsByMonthName[mName].channels[ad] || 0) + bt;
  });

  var result = targets.map(function (row) {
    var a = actualsByMonthName[row.monthLabel] || { revenue: 0, orders: 0, channels: {} };
    return {
      month: row.monthLabel, targetTotal: row.total, actualTotal: a.revenue, actualOrders: a.orders,
      targetChannels: row.channels, actualChannels: a.channels,
      pct: row.total ? (a.revenue / row.total * 100) : null, noTarget: false
    };
  });
  Object.keys(actualsByMonthName).forEach(function (mName) {
    var already = targets.some(function (row) { return row.monthLabel.toLowerCase() === mName.toLowerCase(); });
    if (!already) {
      var a = actualsByMonthName[mName];
      result.push({ month: mName, targetTotal: 0, actualTotal: a.revenue, actualOrders: a.orders, targetChannels: {}, actualChannels: a.channels, pct: null, noTarget: true });
    }
  });
  result.sort(function (a, b) { return EN_MONTHS_.indexOf(a.month) - EN_MONTHS_.indexOf(b.month); });
  return { months: result, channelNames: channelCols.map(function (c) { return c.name; }) };
}

function actionGetTargets_() {
  return Object.assign({ success: true }, reportTargets_());
}

// ==================== REPORT 9: NEW / REPEAT / CONTINUING CUSTOMERS (all-time) ====================

function customerIdFor_(o) {
  var uid = String(o[C.LINE_UID] || '').trim();
  if (uid) return 'uid:' + uid;
  var phone = normalizePhone_(o[C.PHONE]);
  if (phone) return 'phone:' + phone;
  var name = String(o[C.CUSTOMER_NAME] || '').trim();
  if (name) return 'name:' + name;
  return 'order:' + o.orderId;
}

function reportCustomers_(allOrders) {
  var byCustomer = {};
  allOrders.forEach(function (o) {
    var id = customerIdFor_(o);
    if (!byCustomer[id]) byCustomer[id] = [];
    byCustomer[id].push(o);
  });
  var firstMonthByCustomer = {};
  Object.keys(byCustomer).forEach(function (id) {
    var orders = byCustomer[id];
    orders.sort(function (a, b) { return a.__date - b.__date; });
    firstMonthByCustomer[id] = monthKey_(orders[0].__date);
  });

  var monthly = {};
  allOrders.forEach(function (o) {
    var id = customerIdFor_(o);
    var mk = monthKey_(o.__date);
    if (!monthly[mk]) monthly[mk] = {};
    monthly[mk][id] = (monthly[mk][id] || 0) + 1;
  });

  var monthKeys = Object.keys(monthly).sort();
  var series = monthKeys.map(function (mk) {
    var custCounts = monthly[mk];
    var custIds = Object.keys(custCounts);
    var newCount = 0, repeatSameMonth = 0, continuing = 0;
    custIds.forEach(function (id) {
      if (firstMonthByCustomer[id] === mk) newCount++;
      if (custCounts[id] >= 2) repeatSameMonth++;
    });
    var prevMk = shiftMonthKey_(mk, -1);
    if (monthly[prevMk]) {
      custIds.forEach(function (id) { if (monthly[prevMk][id]) continuing++; });
    }
    var totalOrders = custIds.reduce(function (s, id) { return s + custCounts[id]; }, 0);
    return { month: mk, totalActiveCustomers: custIds.length, totalOrders: totalOrders, newCustomers: newCount, repeatSameMonth: repeatSameMonth, continuingFromPrevMonth: continuing };
  });

  return {
    monthly: series,
    note: 'ตัวตนลูกค้าอิงจาก LINE UID ก่อน ถ้าไม่มีใช้เบอร์โทร ถ้าไม่มีใช้ชื่อลูกค้า — ออเดอร์จาก Shopee/TikTok ส่วนใหญ่ไม่มี LINE UID จึงอาจนับซ้ำ/ตกหล่นได้บ้างถ้าลูกค้าใช้เบอร์คนละเบอร์ในการสั่งแต่ละครั้ง'
  };
}

function actionGetCustomers_() {
  return { success: true, result: reportCustomers_(getAllOrders_()) };
}

// ==================== REPORT 10: WEEKLY NEW MEMBER SIGNUPS + WELCOME PROMO ====================

function actionGetSignups_(p) {
  var t = findTable_(MEMBERS_SS_ID, ['LINE UID', 'วันที่สมัคร', 'รหัสสมาชิก']);
  if (!t) return { success: true, weeks: [], totalNewMembers: 0, note: 'ไม่พบตารางสมาชิกหลักในชีต Members Emocha Club' };
  var ci = t.colIndex;
  var members = t.rows.map(function (row) {
    return { uid: String(row[ci['LINE UID']] || '').trim(), signupDate: parseCellDate_(row[ci['วันที่สมัคร']]) };
  }).filter(function (m) { return m.signupDate; });

  var inRange = filterByDateRangeGeneric_(members, function (m) { return m.signupDate; }, p.dateFrom, p.dateTo);

  var weekMap = {};
  inRange.forEach(function (m) {
    var wk = weekStartKey_(m.signupDate);
    weekMap[wk] = (weekMap[wk] || 0) + 1;
  });
  var weeks = Object.keys(weekMap).sort().map(function (wk) { return { weekStart: wk, newMembers: weekMap[wk] }; });

  var welcomeStillActive = 0, welcomeUsedOrExpired = 0;
  var priv = findTable_(MEMBERS_SS_ID, ['LINE UID', 'ชื่อสิทธิ์', 'ให้โดย', 'เปิดใช้งาน(TRUE/FALSE)']);
  if (priv) {
    var pci = priv.colIndex;
    var inRangeUidSet = {};
    inRange.forEach(function (m) { if (m.uid) inRangeUidSet[m.uid] = true; });
    var seen = {};
    priv.rows.forEach(function (row) {
      var uid = String(row[pci['LINE UID']] || '').trim();
      var givenBy = String(row[pci['ให้โดย']] || '');
      var isActive = String(row[pci['เปิดใช้งาน(TRUE/FALSE)']]).toUpperCase() === 'TRUE';
      if (uid && inRangeUidSet[uid] && givenBy.indexOf('ต้อนรับสมาชิกใหม่') !== -1 && !seen[uid]) {
        seen[uid] = true;
        if (isActive) welcomeStillActive++; else welcomeUsedOrExpired++;
      }
    });
  }

  return {
    success: true,
    weeks: weeks,
    totalNewMembers: inRange.length,
    welcomePromo: {
      stillActive: welcomeStillActive,
      usedOrExpired: welcomeUsedOrExpired,
      note: '"usedOrExpired" อิงจากสถานะ "เปิดใช้งาน = FALSE" ของสิทธิ์ต้อนรับสมาชิกใหม่ ซึ่งอาจหมายถึงลูกค้าใช้สิทธิ์ไปแล้ว หรือสิทธิ์หมดอายุแล้วก็ได้ ควรตรวจสอบกับข้อมูลจริงอีกครั้งก่อนสรุป'
    }
  };
}

function filterByDateRangeGeneric_(list, dateFn, dateFrom, dateTo) {
  var from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
  var to = dateTo ? new Date(dateTo + 'T23:59:59') : null;
  return list.filter(function (item) {
    var d = dateFn(item);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

// ==================== REPORT 11: CAMPAIGNS / PROMOTIONS ====================

function reportCampaigns_(orders) {
  var map = {};
  orders.forEach(function (o) {
    var camp = String(o[C.CAMPAIGN] || '').trim() || 'ไม่ระบุแคมเปญ';
    if (!map[camp]) map[camp] = { orders: 0, revenue: 0 };
    map[camp].orders++;
    map[camp].revenue += Number(o[C.BILL_TOTAL]) || 0;
  });
  var list = Object.keys(map).map(function (k) { return { campaign: k, orders: map[k].orders, revenue: map[k].revenue }; });
  list.sort(function (a, b) { return b.revenue - a.revenue; });
  return list;
}

// ==================== BUNDLE ENDPOINT (reports 1,2,3,4,5,6,7,11 — all date-range dependent) ====================

function actionGetDashboardData_(p) {
  var all = getAllOrders_();
  var filtered = filterByDateRange_(all, p.dateFrom, p.dateTo);
  var productGroups = getKeywordGroupsInternal_('product');
  var itemGroups = getKeywordGroupsInternal_('item');
  return {
    success: true,
    dateFrom: p.dateFrom || null,
    dateTo: p.dateTo || null,
    ordersInRange: filtered.length,
    skippedRowsNoDate: all.__skippedRows || 0,
    overview: reportSalesOverview_(filtered, all, p.dateFrom, p.dateTo),
    productGroups: aggregateByKeywordGroups_(filtered, productGroups),
    itemGroups: aggregateByKeywordGroups_(filtered, itemGroups),
    byAd: reportByAd_(filtered),
    timeSlots: reportTimeSlots_(filtered),
    campaigns: reportCampaigns_(filtered)
  };
}

// ==================== AI ANALYSIS (report 12) ====================

function callClaude_(prompt, maxTokens) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ใน Script Properties ของโปรเจกต์นี้');
  var model = props.getProperty('ANTHROPIC_MODEL') || 'claude-sonnet-5';
  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: model, max_tokens: maxTokens || 2500, messages: [{ role: 'user', content: prompt }] }),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  var body = resp.getContentText();
  if (code !== 200) throw new Error('เรียก Claude API ไม่สำเร็จ (HTTP ' + code + '): ' + body.substring(0, 400));
  var data = JSON.parse(body);
  return (data.content && data.content[0] && data.content[0].text) || '';
}

function extractJson_(text) {
  var s = String(text || '').trim();
  var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch (e) { return null; }
}

function buildAnalysisPrompt_(title, dataJson, dateFrom, dateTo, isOverall) {
  var rangeTxt = (dateFrom && dateTo)
    ? ('ช่วงวันที่ของข้อมูล: ' + dateFrom + ' ถึง ' + dateTo)
    : 'ข้อมูลนี้เป็นข้อมูลสะสมทั้งหมด (ไม่ขึ้นกับช่วงวันที่ที่เลือกในแดชบอร์ด)';
  var scope = isOverall
    ? 'นี่คือข้อมูลสรุปจาก "ทุกรายงาน" ของแดชบอร์ดร้าน Em-O-Cha (ร้านขายน้ำพริก/ก๋วยเตี๋ยว ขายผ่านหลายช่องทาง เช่น Shopee, TikTok, Line Shop, Facebook) ในช่วงเวลาเดียวกัน กรุณาเชื่อมโยงข้อมูลระหว่างรายงานต่างๆ เข้าด้วยกัน (เช่น ช่วงเวลาขายดีสัมพันธ์กับช่องทางไหน สินค้าขายดีสัมพันธ์กับแคมเปญหรือช่วงเวลาไหน) ไม่ใช่วิเคราะห์แยกทีละรายงานเฉยๆ'
    : ('นี่คือข้อมูลจากรายงาน "' + title + '" ของแดชบอร์ดร้าน Em-O-Cha (ร้านขายน้ำพริก/ก๋วยเตี๋ยว ขายผ่านหลายช่องทาง)');
  return [
    'คุณเป็นนักวิเคราะห์ข้อมูลธุรกิจอีคอมเมิร์ซอาวุโส ช่วยวิเคราะห์ข้อมูลยอดขายให้เจ้าของร้านค้าปลีกขนาดเล็กในไทยอย่างละเอียดและเจาะลึกจริงๆ ไม่ใช่คำตอบผิวเผิน',
    scope,
    rangeTxt,
    'ข้อมูล (JSON):',
    dataJson,
    '',
    'กรุณาตอบกลับเป็น JSON เท่านั้น (ห้ามมีข้อความอื่นนอก JSON ก้อนเดียวนี้) ตามโครงสร้างนี้:',
    '{"summary": "สรุปภาพรวม 3-5 ประโยค พูดถึงตัวเลขสำคัญจริงจากข้อมูลที่ให้มา",',
    ' "insights": ["ข้อสังเกต/แนวโน้ม/ความเป็นไปได้เชิงลึกแต่ละข้อ ต้องอ้างอิงตัวเลขจริงจากข้อมูล อย่างน้อย 4-6 ข้อ"],',
    ' "risks": ["ความเสี่ยงหรือสัญญาณเตือนที่สังเกตเห็น ถ้ามี (ปล่อยว่างได้ถ้าไม่มี)"],',
    ' "recommendations": [{"title": "ชื่อแนวทาง", "rationale": "เหตุผลที่แนะนำ อ้างอิงข้อมูล", "steps": ["ขั้นตอนที่ 1", "ขั้นตอนที่ 2"], "tradeoffs": "ข้อดี/ข้อเสีย/ความเสี่ยงของแนวทางนี้"}]}',
    'ข้อกำหนดสำคัญ: recommendations ต้องมีอย่างน้อย 3 แนวทางที่แตกต่างกันจริงๆ (ไม่ใช่พูดซ้ำความหมายเดิมคนละคำ) ให้เจ้าของร้านเลือกดำเนินการได้ตามบริบท/ทรัพยากรที่มี'
  ].join('\n');
}

function actionAiAnalyze_(p) {
  var reportTitle = p.reportTitle || p.reportKey || 'รายงาน';
  var dataStr = typeof p.reportData === 'string' ? p.reportData : JSON.stringify(p.reportData);
  if (dataStr.length > 40000) dataStr = dataStr.substring(0, 40000) + ' ...(ตัดข้อมูลบางส่วนเนื่องจากยาวเกินไป)';
  var prompt = buildAnalysisPrompt_(reportTitle, dataStr, p.dateFrom, p.dateTo, false);
  var text = callClaude_(prompt, 3000);
  var json = extractJson_(text);
  return { success: true, analysis: json || { summary: text, insights: [], risks: [], recommendations: [] } };
}

function actionAiAnalyzeAll_(p) {
  var dataStr = typeof p.bundle === 'string' ? p.bundle : JSON.stringify(p.bundle);
  if (dataStr.length > 60000) dataStr = dataStr.substring(0, 60000) + ' ...(ตัดข้อมูลบางส่วนเนื่องจากยาวเกินไป)';
  var prompt = buildAnalysisPrompt_('ภาพรวมทุกรายงาน', dataStr, p.dateFrom, p.dateTo, true);
  var text = callClaude_(prompt, 3500);
  var json = extractJson_(text);
  return { success: true, analysis: json || { summary: text, insights: [], risks: [], recommendations: [] } };
}
