/**
 * แจ้งเตือน: ใบเสนอราคาใกล้หมดอายุ, วันจัดส่งใกล้ถึง, นัดติดตามลูกค้าที่ครบกำหนด
 */

function getSettingNumber(key, defaultVal) {
  var v = PROPS.getProperty(key);
  return v ? Number(v) : defaultVal;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  var target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function customerDisplayName(customer) {
  if (!customer) return 'ไม่ทราบชื่อลูกค้า';
  return customer.Type === 'company' ? (customer.CompanyName || customer.Name) : customer.Name;
}

function computeReminders() {
  var quotationWarnDays = getSettingNumber('QUOTATION_EXPIRY_WARN_DAYS', 3);
  var deliveryWarnDays = getSettingNumber('DELIVERY_WARN_DAYS', 2);

  var customers = sheetToObjects(getSheet(SHEETS.CUSTOMERS));
  var customerById = {};
  customers.forEach(function (c) { customerById[c.ID] = c; });

  var documents = sheetToObjects(getSheet(SHEETS.DOCUMENTS));
  var deals = sheetToObjects(getSheet(SHEETS.DEALS));
  var followups = sheetToObjects(getSheet(SHEETS.FOLLOWUPS));
  var reminders = [];

  documents.forEach(function (doc) {
    if (doc.DocType === 'quotation' && doc.ExpiryDate) {
      var d = daysUntil(doc.ExpiryDate);
      if (d !== null && d <= quotationWarnDays) {
        reminders.push({
          type: 'quotation_expiry',
          severity: d < 0 ? 'overdue' : (d <= 1 ? 'urgent' : 'warning'),
          customerId: doc.CustomerID,
          customerName: customerDisplayName(customerById[doc.CustomerID]),
          message: d < 0
            ? 'ใบเสนอราคา ' + (doc.DocNumber || '') + ' หมดอายุแล้ว ' + Math.abs(d) + ' วัน'
            : 'ใบเสนอราคา ' + (doc.DocNumber || '') + ' จะหมดอายุใน ' + d + ' วัน',
          dueDate: doc.ExpiryDate,
        });
      }
    }
    if ((doc.DocType === 'po' || doc.DocType === 'delivery_note') && doc.DeliveryDate) {
      var d2 = daysUntil(doc.DeliveryDate);
      if (d2 !== null && d2 <= deliveryWarnDays) {
        reminders.push({
          type: 'delivery_due',
          severity: d2 < 0 ? 'overdue' : (d2 <= 1 ? 'urgent' : 'warning'),
          customerId: doc.CustomerID,
          customerName: customerDisplayName(customerById[doc.CustomerID]),
          message: d2 < 0
            ? 'กำหนดจัดส่งของเอกสาร ' + (doc.DocNumber || '') + ' เลยกำหนดแล้ว ' + Math.abs(d2) + ' วัน'
            : 'ใกล้ถึงกำหนดจัดส่ง (' + (doc.DocNumber || '') + ') ในอีก ' + d2 + ' วัน',
          dueDate: doc.DeliveryDate,
        });
      }
    }
  });

  deals.forEach(function (deal) {
    if (deal.Status === 'open' && deal.DeliveryDate) {
      var d3 = daysUntil(deal.DeliveryDate);
      if (d3 !== null && d3 <= deliveryWarnDays) {
        reminders.push({
          type: 'delivery_due',
          severity: d3 < 0 ? 'overdue' : (d3 <= 1 ? 'urgent' : 'warning'),
          customerId: deal.CustomerID,
          customerName: customerDisplayName(customerById[deal.CustomerID]),
          message: d3 < 0
            ? 'ดีล "' + deal.Title + '" เลยกำหนดจัดส่งแล้ว ' + Math.abs(d3) + ' วัน'
            : 'ดีล "' + deal.Title + '" ใกล้ถึงกำหนดจัดส่งในอีก ' + d3 + ' วัน',
          dueDate: deal.DeliveryDate,
        });
      }
    }
  });

  followups.forEach(function (f) {
    if (!f.Done && f.FollowUpDate) {
      var d4 = daysUntil(f.FollowUpDate);
      if (d4 !== null && d4 <= 1) {
        reminders.push({
          type: 'followup_due',
          severity: d4 < 0 ? 'overdue' : 'warning',
          customerId: f.CustomerID,
          customerName: customerDisplayName(customerById[f.CustomerID]),
          message: d4 < 0
            ? 'เลยกำหนดติดตามลูกค้า: ' + (f.Note || '') + ' (' + Math.abs(d4) + ' วันก่อน)'
            : 'ถึงกำหนดติดตามลูกค้าวันนี้/พรุ่งนี้: ' + (f.Note || ''),
          dueDate: f.FollowUpDate,
        });
      }
    }
  });

  var order = { overdue: 0, urgent: 1, warning: 2 };
  reminders.sort(function (a, b) {
    return (order[a.severity] - order[b.severity]) || String(a.dueDate).localeCompare(String(b.dueDate));
  });
  return reminders;
}

// ===================== Dashboard =====================

function getDashboard() {
  var customers = sheetToObjects(getSheet(SHEETS.CUSTOMERS));
  var deals = sheetToObjects(getSheet(SHEETS.DEALS));
  var documents = sheetToObjects(getSheet(SHEETS.DOCUMENTS));

  var byCountry = {};
  customers.forEach(function (c) { if (c.Country) byCountry[c.Country] = (byCountry[c.Country] || 0) + 1; });

  var byType = { individual: 0, company: 0 };
  customers.forEach(function (c) { if (byType[c.Type] !== undefined) byType[c.Type]++; });

  var byStage = {};
  deals.forEach(function (d) { byStage[d.Stage] = (byStage[d.Stage] || 0) + 1; });

  var openDeals = deals.filter(function (d) { return d.Status === 'open'; });
  var wonDeals = deals.filter(function (d) { return d.Status === 'won'; });
  var lostDeals = deals.filter(function (d) { return d.Status === 'lost'; });

  var now = new Date();
  var thisMonth = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM');
  var wonThisMonth = wonDeals.filter(function (d) { return String(d.UpdatedAt || '').slice(0, 7) === thisMonth; });
  var revenueThisMonth = wonThisMonth.reduce(function (sum, d) { return sum + (Number(d.EstimatedValue) || 0); }, 0);
  var pipelineValue = openDeals.reduce(function (sum, d) { return sum + (Number(d.EstimatedValue) || 0); }, 0);

  var newCustomersLast30 = customers.filter(function (c) {
    var created = new Date(c.CreatedAt);
    return (now - created) / (1000 * 60 * 60 * 24) <= 30;
  }).length;

  return {
    totals: {
      customers: customers.length,
      openDeals: openDeals.length,
      wonDeals: wonDeals.length,
      lostDeals: lostDeals.length,
      documents: documents.length,
      newCustomersLast30: newCustomersLast30,
    },
    revenue: { pipelineValue: pipelineValue, revenueThisMonth: revenueThisMonth, wonThisMonthCount: wonThisMonth.length },
    byCountry: byCountry,
    byType: byType,
    byStage: byStage,
    reminders: computeReminders(),
  };
}

// ===================== รายงานประจำวัน =====================

function buildDailyReportHtml() {
  var customers = sheetToObjects(getSheet(SHEETS.CUSTOMERS));
  var deals = sheetToObjects(getSheet(SHEETS.DEALS));
  var today = todayStr();

  var newToday = customers.filter(function (c) { return String(c.CreatedAt).slice(0, 10) === today; });
  var openDeals = deals.filter(function (d) { return d.Status === 'open'; });
  var wonToday = deals.filter(function (d) { return d.Status === 'won' && String(d.UpdatedAt).slice(0, 10) === today; });
  var reminders = computeReminders();

  function rows(arr, fn) {
    if (!arr.length) return '<tr><td colspan="3" style="color:#888">- ไม่มีรายการ -</td></tr>';
    return arr.map(fn).join('');
  }

  var html = '' +
    '<div style="font-family:sans-serif;max-width:640px;margin:0 auto">' +
    '<h2 style="color:#a50d0c">รายงานประจำวัน CRM ส่งออกสินค้า - ' + today + '</h2>' +
    '<ul>' +
    '<li>ลูกค้าใหม่วันนี้: <b>' + newToday.length + '</b> ราย</li>' +
    '<li>ดีลที่กำลังเปิดอยู่ทั้งหมด: <b>' + openDeals.length + '</b> ดีล</li>' +
    '<li>ปิดการขายสำเร็จวันนี้: <b>' + wonToday.length + '</b> ดีล</li>' +
    '<li>รายการที่ต้องแจ้งเตือน/ติดตามด่วน: <b>' + reminders.length + '</b> รายการ</li>' +
    '</ul>' +
    '<h3>รายการแจ้งเตือนที่ต้องติดตาม</h3>' +
    '<table style="width:100%;border-collapse:collapse" border="1" cellpadding="6">' +
    '<tr style="background:#f5f5f5"><th>ลูกค้า</th><th>เรื่อง</th><th>กำหนด</th></tr>' +
    rows(reminders.slice(0, 20), function (r) { return '<tr><td>' + r.customerName + '</td><td>' + r.message + '</td><td>' + (r.dueDate || '-') + '</td></tr>'; }) +
    '</table>' +
    '<h3>ลูกค้าใหม่วันนี้</h3>' +
    '<table style="width:100%;border-collapse:collapse" border="1" cellpadding="6">' +
    '<tr style="background:#f5f5f5"><th>ชื่อ</th><th>ประเทศ</th><th>ช่องทาง</th></tr>' +
    rows(newToday, function (c) { return '<tr><td>' + (c.Type === 'company' ? c.CompanyName : c.Name) + '</td><td>' + (c.Country || '-') + '</td><td>' + (c.ContactChannel || '-') + '</td></tr>'; }) +
    '</table></div>';

  return { html: html, summary: { newToday: newToday.length, openDeals: openDeals.length, wonToday: wonToday.length, reminders: reminders.length } };
}

/** เรียกจากปุ่มในหน้าเว็บ เพื่อส่งรายงานทันที */
function sendDailyReportNow() {
  return sendDailyReportInternal();
}

/** ฟังก์ชันนี้จะถูกเรียกอัตโนมัติทุกวันโดย Time-driven Trigger (ดู installDailyTrigger) */
function dailyReportTrigger() {
  sendDailyReportInternal();
}

function sendDailyReportInternal() {
  var built = buildDailyReportHtml();
  var recipients = (PROPS.getProperty('REPORT_EMAILS') || Session.getActiveUser().getEmail() || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var sent = false;
  if (recipients.length) {
    MailApp.sendEmail({
      to: recipients.join(','),
      subject: '[CRM] รายงานประจำวัน ' + todayStr(),
      htmlBody: built.html,
    });
    sent = true;
  }
  return { sent: sent, summary: built.summary, reportDate: todayStr() };
}

/** ตั้งค่า Time-driven Trigger ให้ส่งรายงานอัตโนมัติทุกวัน ตามชั่วโมงที่กำหนด (0-23) */
function installDailyTrigger(hour) {
  removeDailyTrigger();
  ScriptApp.newTrigger('dailyReportTrigger')
    .timeBased()
    .everyDays(1)
    .atHour(hour === undefined || hour === null ? 8 : Number(hour))
    .create();
  return { ok: true };
}

function removeDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyReportTrigger') ScriptApp.deleteTrigger(t);
  });
  return { ok: true };
}

function isDailyTriggerActive() {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'dailyReportTrigger'; });
}
