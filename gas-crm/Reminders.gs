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
  var poActionWarnDays = getSettingNumber('PO_ACTION_WARN_DAYS', 3);

  var customers = sheetToObjects(getSheet(SHEETS.CUSTOMERS));
  var customerById = {};
  customers.forEach(function (c) { customerById[c.ID] = c; });

  var documents = sheetToObjects(getSheet(SHEETS.DOCUMENTS));
  var deals = sheetToObjects(getSheet(SHEETS.DEALS));
  var followups = sheetToObjects(getSheet(SHEETS.FOLLOWUPS));
  var reminders = [];

  // ลูกค้าที่มี PO แล้ว = จบขั้นตอนใบเสนอราคาแล้ว ไม่ต้องเตือนใบเสนอราคาหมดอายุอีก
  // ลูกค้าที่มีสลิปการโอนเงิน หรือใบเสร็จแล้ว = จบกระบวนการเอกสารทั้งหมดแล้ว (รวมถึง PO ที่ต้องดำเนินการ) ไม่ต้องเตือนเรื่องเอกสารใด ๆ อีก (เหลือแค่วันจัดส่งของดีล/การติดตาม)
  var hasPOByCustomer = {};
  var hasReceiptByCustomer = {};
  documents.forEach(function (doc) {
    if (doc.DocType === 'po') hasPOByCustomer[doc.CustomerID] = true;
    if (doc.DocType === 'receipt' || doc.DocType === 'payment_slip') hasReceiptByCustomer[doc.CustomerID] = true;
  });

  documents.forEach(function (doc) {
    if (hasReceiptByCustomer[doc.CustomerID]) return; // จบกระบวนการเอกสารแล้ว ข้ามการเตือนเอกสารทั้งหมดของลูกค้ารายนี้
    if (doc.DocType === 'quotation' && doc.ExpiryDate) {
      if (hasPOByCustomer[doc.CustomerID]) return; // มี PO แล้ว แปลว่าปิดขั้นตอนใบเสนอราคาไปแล้ว ไม่ต้องเตือนอีก
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
    // เตือนถ้าได้รับ PO มาแล้วเกินกำหนด (ค่าเริ่มต้น 3 วัน) แต่ยังไม่ได้ดำเนินการต่อ (ยังไม่มีใบแจ้งหนี้/สลิป/ใบส่งของ ฯลฯ)
    if (doc.DocType === 'po' && doc.IssueDate) {
      var daysSinceReceived = -daysUntil(doc.IssueDate);
      if (daysSinceReceived !== null && daysSinceReceived >= poActionWarnDays) {
        reminders.push({
          type: 'po_pending',
          severity: daysSinceReceived >= poActionWarnDays * 2 ? 'overdue' : 'urgent',
          customerId: doc.CustomerID,
          customerName: customerDisplayName(customerById[doc.CustomerID]),
          message: 'ได้รับ PO ' + (doc.DocNumber || '') + ' มาแล้ว ' + daysSinceReceived + ' วัน ยังไม่ได้ดำเนินการต่อ (ออกใบแจ้งหนี้/สลิป/ใบส่งของ)',
          dueDate: doc.IssueDate,
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

// ===================== รายงานประจำวัน (ส่งเข้ากลุ่ม LINE) =====================

function buildDailyReportText() {
  var customers = sheetToObjects(getSheet(SHEETS.CUSTOMERS));
  var deals = sheetToObjects(getSheet(SHEETS.DEALS));
  var today = todayStr();

  var newToday = customers.filter(function (c) { return String(c.CreatedAt).slice(0, 10) === today; });
  var openDeals = deals.filter(function (d) { return d.Status === 'open'; });
  var wonToday = deals.filter(function (d) { return d.Status === 'won' && String(d.UpdatedAt).slice(0, 10) === today; });
  var reminders = computeReminders();

  var lines = [];
  lines.push('📊 รายงานประจำวัน CRM ส่งออกสินค้า');
  lines.push('วันที่ ' + today);
  lines.push('');
  lines.push('ลูกค้าใหม่วันนี้: ' + newToday.length + ' ราย');
  lines.push('ดีลที่กำลังเปิดอยู่: ' + openDeals.length + ' ดีล');
  lines.push('ปิดการขายสำเร็จวันนี้: ' + wonToday.length + ' ดีล');
  lines.push('ต้องติดตามด่วน: ' + reminders.length + ' รายการ');

  if (reminders.length) {
    lines.push('');
    lines.push('🔔 รายการที่ต้องติดตาม:');
    reminders.slice(0, 15).forEach(function (r) {
      lines.push('- ' + r.customerName + ': ' + r.message);
    });
    if (reminders.length > 15) lines.push('...และอีก ' + (reminders.length - 15) + ' รายการ');
  }

  if (newToday.length) {
    lines.push('');
    lines.push('👥 ลูกค้าใหม่วันนี้:');
    newToday.forEach(function (c) {
      lines.push('- ' + (c.Type === 'company' ? c.CompanyName : c.Name) + ' (' + (c.Country || '-') + ')');
    });
  }

  return {
    text: lines.join('\n'),
    summary: { newToday: newToday.length, openDeals: openDeals.length, wonToday: wonToday.length, reminders: reminders.length },
  };
}

/** ส่งข้อความเข้ากลุ่ม LINE ผ่าน Messaging API (ต้องตั้งค่า Channel Access Token + Group ID ในหน้าตั้งค่าก่อน) */
function sendLinePush(text) {
  var token = PROPS.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  var groupId = PROPS.getProperty('LINE_GROUP_ID');
  if (!token || !groupId) return { sent: false, reason: 'line_not_configured' };

  var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ to: groupId, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
    muteHttpExceptions: true,
  });
  var code = response.getResponseCode();
  if (code !== 200) {
    Logger.log('ส่งข้อความ LINE ไม่สำเร็จ (' + code + '): ' + response.getContentText());
    return { sent: false, reason: 'line_error_' + code };
  }
  return { sent: true };
}

/** เรียกจากปุ่มในหน้าเว็บ เพื่อส่งรายงานทันที (ไม่เกี่ยวกับตารางเวลาอัตโนมัติ) */
function sendDailyReportNow() {
  return sendDailyReportInternal();
}

/** สร้างข้อความรายงานตัวอย่างให้ดูในหน้าตั้งค่า โดยไม่ส่งเข้ากลุ่ม LINE จริง (เป็นข้อความเดียวกับที่ตารางเวลาส่งจริงจะส่ง) */
function previewDailyReport() {
  return buildDailyReportText();
}

function sendDailyReportInternal() {
  var built = buildDailyReportText();
  var result = sendLinePush(built.text);
  return { sent: result.sent, reason: result.reason || null, summary: built.summary, reportDate: todayStr() };
}

// ===================== ตารางส่งรายงานอัตโนมัติ (เปิดได้พร้อมกันหลายเงื่อนไข) =====================
// รองรับ 3 เงื่อนไขอิสระต่อกัน: รายวัน, รายสัปดาห์ (เลือกวัน), รายเดือน (วันสุดท้ายของเดือน)
// แต่ละเงื่อนไขเปิด/ปิดแยกกันได้ ไม่ทับกัน

var WEEKDAY_MAP = {
  sunday: 'SUNDAY', monday: 'MONDAY', tuesday: 'TUESDAY', wednesday: 'WEDNESDAY',
  thursday: 'THURSDAY', friday: 'FRIDAY', saturday: 'SATURDAY',
};

function isLastDayOfMonth(date) {
  var tomorrow = new Date(date.getTime());
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getMonth() !== date.getMonth();
}

/** ฟังก์ชันที่ Time-driven Trigger เรียกจริง (ตั้งชื่อแยกกันเพื่อเปิด/ปิดอิสระจากกัน) */
function dailyReportTrigger() {
  sendDailyReportInternal();
}
function weeklyReportTrigger() {
  sendDailyReportInternal();
}
function monthlyReportTrigger() {
  // Apps Script ตั้งทริกเกอร์แบบ "วันสุดท้ายของเดือน" ตรง ๆ ไม่ได้ (บางเดือนมี 28-31 วันไม่เท่ากัน)
  // จึงตั้งให้ทริกเกอร์นี้รันทุกวัน แล้วเช็คเองว่าวันนี้เป็นวันสุดท้ายของเดือนหรือไม่ก่อนส่งจริง
  if (isLastDayOfMonth(new Date())) sendDailyReportInternal();
}

function removeTriggerByHandler(handlerName) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === handlerName) ScriptApp.deleteTrigger(t);
  });
}

function isTriggerActive(handlerName) {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === handlerName; });
}

/** เปิดใช้งานส่งรายงานทุกวัน ตามชั่วโมงที่กำหนด (0-23) */
function installDailyTrigger(hour) {
  removeTriggerByHandler('dailyReportTrigger');
  ScriptApp.newTrigger('dailyReportTrigger').timeBased()
    .everyDays(1).atHour(hour === undefined || hour === null || hour === '' ? 8 : Number(hour))
    .create();
  return { ok: true };
}
function removeDailyTrigger() {
  removeTriggerByHandler('dailyReportTrigger');
  return { ok: true };
}

/** เปิดใช้งานส่งรายงานทุกสัปดาห์ ในวัน+เวลาที่กำหนด เช่น ทุกวันเสาร์ 10 โมงเช้า */
function installWeeklyTrigger(weekday, hour) {
  removeTriggerByHandler('weeklyReportTrigger');
  var wd = ScriptApp.WeekDay[WEEKDAY_MAP[weekday]] || ScriptApp.WeekDay.SATURDAY;
  ScriptApp.newTrigger('weeklyReportTrigger').timeBased()
    .onWeekDay(wd).atHour(hour === undefined || hour === null || hour === '' ? 10 : Number(hour))
    .create();
  return { ok: true };
}
function removeWeeklyTrigger() {
  removeTriggerByHandler('weeklyReportTrigger');
  return { ok: true };
}

/** เปิดใช้งานส่งรายงานทุกสิ้นเดือน ตามชั่วโมงที่กำหนด */
function installMonthlyTrigger(hour) {
  removeTriggerByHandler('monthlyReportTrigger');
  ScriptApp.newTrigger('monthlyReportTrigger').timeBased()
    .everyDays(1).atHour(hour === undefined || hour === null || hour === '' ? 18 : Number(hour))
    .create();
  return { ok: true };
}
function removeMonthlyTrigger() {
  removeTriggerByHandler('monthlyReportTrigger');
  return { ok: true };
}

function getTriggerStatuses() {
  return {
    daily: isTriggerActive('dailyReportTrigger'),
    weekly: isTriggerActive('weeklyReportTrigger'),
    monthly: isTriggerActive('monthlyReportTrigger'),
  };
}
