/**
 * สรุปออเดอร์ประจำวัน → LINE กลุ่ม (Flex Message ธีมสีรุ้ง)
 * =========================================================
 *
 * สคริปต์นี้อ่านข้อมูลจากชีต "Revenue" (ไฟล์เก็บยอดขายบน Google Drive)
 * แล้วสรุปยอดขายแยกตามสินค้า + ยอดรวม ส่งเป็น Flex Message สีรุ้งเข้ากลุ่ม LINE
 *
 * มี 2 โหมดการทำงาน:
 *   1) สรุปอัตโนมัติทุกเช้า 6-7 โมง เป็นยอดขาย "เมื่อวาน" ทั้งวัน
 *   2) พิมพ์คำสั่งในกลุ่ม LINE เพื่อขอสรุปช่วงวันที่เอง เช่น
 *        "สรุป 01/09/2026-07/09/2026"
 *        "สรุปวันนี้"
 *        "สรุปเมื่อวาน"
 *
 * ─────────────────────────────────────────────────────────
 * ⚠️ เรื่องชื่อชนกัน (สำคัญ ถ้าโปรเจกต์ที่วางมีไฟล์อื่นอยู่แล้ว)
 * ─────────────────────────────────────────────────────────
 * ทุกอย่างในไฟล์นี้ถูกห่อไว้ใน namespace เดียวคือ `EmOChaOrderBot` เพื่อไม่ให้
 * ชื่อตัวแปร/ฟังก์ชันภายใน (TIMEZONE, COL, RAINBOW, ฯลฯ) ไปชนกับไฟล์ .gs อื่น
 * ที่มีอยู่แล้วในโปรเจกต์เดียวกัน (เช่นถ้ามีไฟล์ "Report Sales.gs" ที่ประกาศ
 * ตัวแปรชื่อคล้ายกันอยู่แล้ว จะ error "Identifier ... has already been declared")
 *
 * มีเพียง 2 ชื่อที่ยังอยู่นอก namespace เพราะ Apps Script บังคับให้ต้องเป็น
 * ฟังก์ชัน global ชื่อนี้เป๊ะๆ เท่านั้น (เรียกจากระบบเอง เปลี่ยนชื่อเองไม่ได้):
 *   - doGet(e)   ← ใช้เมื่อ deploy เป็น Web app เท่านั้น
 *   - doPost(e)  ← ใช้รับ Webhook จาก LINE เท่านั้น
 * ถ้าโปรเจกต์ที่คุณวางไฟล์นี้ลงไป "มีฟังก์ชันชื่อ doGet หรือ doPost อยู่แล้ว"
 * (เช่นใช้เสิร์ฟหน้าเว็บสั่งซื้อ index.html) ห้ามวางไฟล์นี้ทับตรงๆ — ให้ลบ
 * doGet/doPost 2 ฟังก์ชันด้านล่างออกจากไฟล์นี้ก่อน แล้วไปเพิ่มโค้ดเรียก
 * EmOChaOrderBot.handleWebhookPost_(e) จากใน doPost เดิมที่มีอยู่แทน (ดู
 * รายละเอียดในคอมเมนต์เหนือ doPost ด้านล่าง) — หรือทางที่ปลอดภัยและง่ายสุด
 * คือสร้างเป็น "โปรเจกต์ Apps Script ใหม่แยกต่างหาก" ที่ script.google.com
 * ไม่เกี่ยวกับโปรเจกต์เดิมเลย (สคริปต์นี้เปิดชีตด้วย SpreadsheetApp.openById
 * ตรงๆ อยู่แล้ว จึงทำงานได้ปกติแม้ไม่ได้อยู่ในโปรเจกต์เดียวกับชีต/เว็บแอปเดิม)
 *
 * ─────────────────────────────────────────────────────────
 * วิธีติดตั้ง (ทำครั้งเดียว)
 * ─────────────────────────────────────────────────────────
 * 1. แนะนำให้สร้างโปรเจกต์ใหม่แยกต่างหากที่ script.google.com (New project)
 *    ตั้งชื่อโปรเจกต์อะไรก็ได้ แล้ววางไฟล์นี้ทั้งไฟล์ลงไป
 *
 * 2. ตั้งค่า Channel Access Token และ Group ID ของ LINE:
 *    เปิดฟังก์ชัน EmOChaOrderBot_setupCredentials() ด้านล่าง ใส่ค่าจริงลงไป
 *    แล้วเลือกฟังก์ชันนี้จากแถบด้านบนของ Apps Script editor แล้วกด ▶ Run
 *    หนึ่งครั้ง จากนั้นค่อยลบค่าที่ใส่ไว้ออก — ค่าจริงจะถูกเก็บอยู่ใน
 *    Script Properties ของโปรเจกต์ ไม่ได้อยู่ในซอร์สโค้ดที่ commit ขึ้น git
 *    ***ห้ามใส่ Token จริงลงไฟล์นี้แล้ว commit ขึ้น git โดยเด็ดขาด***
 *
 * 3. สั่งสรุปอัตโนมัติทุกเช้า: รันฟังก์ชัน EmOChaOrderBot_createDailyTrigger()
 *    หนึ่งครั้ง (ตั้ง trigger แบบ time-driven ทำงานทุกวันช่วง 6:00-7:00 น. เวลาไทย)
 *
 * 4. ทดสอบส่งสรุปเมื่อวานด้วยมือ: รันฟังก์ชัน EmOChaOrderBot_sendDailySummary()
 *
 * 5. (ถ้าต้องการให้พิมพ์ขอสรุปในกลุ่มได้) ตั้งค่า Webhook:
 *    - เมนู Deploy > New deployment > เลือกประเภท "Web app"
 *      Execute as: Me, Who has access: Anyone
 *    - คัดลอก URL ที่ได้ไปวางเป็น Webhook URL ในหน้า LINE Developers Console
 *      ของ Messaging API channel นี้ แล้วเปิด "Use webhook"
 *    - URL นี้ทำหน้าที่เหมือนรหัสลับ (Apps Script ตรวจสอบลายเซ็นของ LINE
 *      ที่ header ไม่ได้ เพราะ Apps Script Web App ไม่รับ header เข้ามา)
 *      จึง**ห้ามเผยแพร่ URL นี้ให้คนอื่น** และสคริปต์จะตอบเฉพาะข้อความที่มา
 *      จาก Group ID ที่ตั้งค่าไว้เท่านั้น เพื่อลดความเสี่ยง
 */

const EmOChaOrderBot = (() => {
  // ── ค่าคงที่ที่แก้ไขได้ ────────────────────────────────────
  const REVENUE_SPREADSHEET_ID = '1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY';
  const REVENUE_SHEET_NAME = 'Revenue'; // ถ้าชื่อแท็บในชีตไม่ตรง จะ fallback ไปใช้แท็บแรกให้อัตโนมัติ
  const TIMEZONE = 'Asia/Bangkok';
  const COMMAND_KEYWORD = 'สรุป'; // คำเริ่มต้นข้อความที่บอทจะตอบในกลุ่ม
  const MAX_PRODUCT_ROWS = 20; // จำนวนแถวสินค้าสูงสุดที่แสดงในการ์ด กันการ์ดยาวเกินไป
  const DAILY_TRIGGER_HANDLER = 'EmOChaOrderBot_sendDailySummary';

  const RAINBOW = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#0A84FF', '#5E5CE6', '#AF52DE'];

  const COL = {
    REVENUE_ID: 0,
    TIMESTAMP: 1,
    PRODUCT_NAME: 2,
    QTY: 3,
    PRICE: 4,
    DISCOUNT: 5,
    AMOUNT: 6,
    DELIVERY: 7,
    BILL_TOTAL: 8,
  };

  const THAI_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];

  // ── ขั้นตอนติดตั้งครั้งเดียว ───────────────────────────────

  function setupCredentials(channelAccessToken, groupId) {
    const props = PropertiesService.getScriptProperties();
    if (channelAccessToken) props.setProperty('LINE_CHANNEL_ACCESS_TOKEN', channelAccessToken);
    if (groupId) props.setProperty('LINE_GROUP_ID', groupId);
  }

  function createDailyTrigger() {
    deleteDailyTrigger();
    ScriptApp.newTrigger(DAILY_TRIGGER_HANDLER)
      .timeBased()
      .atHour(6) // เวลา trigger ของ Google จะสุ่มเริ่มทำงานภายในชั่วโมงนี้ (~6:00-7:00 น.)
      .everyDays(1)
      .inTimezone(TIMEZONE)
      .create();
  }

  function deleteDailyTrigger() {
    ScriptApp.getProjectTriggers().forEach((t) => {
      if (t.getHandlerFunction() === DAILY_TRIGGER_HANDLER) ScriptApp.deleteTrigger(t);
    });
  }

  // ── โหมดที่ 1: สรุปอัตโนมัติทุกเช้า (ยอดขายเมื่อวาน) ────────

  function sendDailySummary() {
    const yesterday = addDays(todayBangkok(), -1);
    const summary = buildSummaryForRange(yesterday, yesterday);
    pushLineMessage(buildRainbowFlexMessage(summary), summary);
  }

  // ทดสอบ/ดูสรุปของ "วันนี้" ทันที (ยอดขายจะยังไม่ครบเต็มวันถ้ารันก่อนหมดวัน)
  function sendTodaySummary() {
    const today = todayBangkok();
    const summary = buildSummaryForRange(today, today);
    pushLineMessage(buildRainbowFlexMessage(summary), summary);
  }

  // ── โหมดที่ 2: ขอสรุปช่วงวันที่เองผ่านข้อความในกลุ่ม LINE ──

  function handleWebhookPost(e) {
    try {
      const body = JSON.parse(e.postData.contents);
      (body.events || []).forEach(handleLineEvent);
    } catch (err) {
      Logger.log('handleWebhookPost error: ' + err);
    }
    return ContentService.createTextOutput('ok');
  }

  function handleLineEvent(event) {
    if (event.type !== 'message' || !event.message || event.message.type !== 'text') return;

    const groupId = event.source && event.source.groupId;
    const configuredGroupId = PropertiesService.getScriptProperties().getProperty('LINE_GROUP_ID');
    if (!groupId || groupId !== configuredGroupId) return; // ตอบเฉพาะในกลุ่มที่ตั้งค่าไว้เท่านั้น

    const text = event.message.text.trim();
    if (text.slice(0, COMMAND_KEYWORD.length) !== COMMAND_KEYWORD) return;

    const range = parseRangeCommand(text);
    if (!range) {
      replyLineMessage(event.replyToken, {
        type: 'text',
        text: 'พิมพ์ "สรุป" ตามด้วยช่วงวันที่ เช่น\n"สรุป 01/09/2026-07/09/2026"\nหรือ "สรุปวันนี้" / "สรุปเมื่อวาน"',
      });
      return;
    }

    const summary = buildSummaryForRange(range.start, range.end);
    replyLineMessage(event.replyToken, {
      type: 'flex',
      altText: buildAltText(summary),
      contents: buildRainbowFlexMessage(summary),
    });
  }

  function parseRangeCommand(text) {
    if (/เมื่อวาน/.test(text)) {
      const y = addDays(todayBangkok(), -1);
      return { start: y, end: y };
    }
    if (/วันนี้/.test(text)) {
      const t = todayBangkok();
      return { start: t, end: t };
    }

    const tokens = text.match(/\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?/g);
    if (!tokens || tokens.length === 0) return null;

    const refYear = Number(Utilities.formatDate(new Date(), TIMEZONE, 'yyyy'));
    let start = parseDateToken(tokens[0], refYear);
    let end = tokens[1] ? parseDateToken(tokens[1], refYear) : start;
    if (!start || !end) return null;
    if (start.getTime() > end.getTime()) { const tmp = start; start = end; end = tmp; }
    return { start, end };
  }

  function parseDateToken(token, referenceYear) {
    const m = token.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
    if (!m) return null;
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = m[3] ? Number(m[3]) : referenceYear;
    if (year < 100) year += 2000;
    return bangkokMidnight(year, month, day);
  }

  // ── เข้าถึง/สรุปข้อมูลจากชีต Revenue ────────────────────────

  function getRevenueSheet() {
    const ss = SpreadsheetApp.openById(REVENUE_SPREADSHEET_ID);
    return ss.getSheetByName(REVENUE_SHEET_NAME) || ss.getSheets()[0];
  }

  /**
   * รวมยอดขาย/สินค้าในช่วง [startDate, endDate] (รวมวันที่ปลายทั้งสองด้าน)
   * รองรับแถวสินค้าเพิ่มเติมของออเดอร์เดียวกัน (แถวที่ไม่มี Revenue ID/Timestamp
   * ของตัวเอง) โดยยึดวันที่ของแถวหลักของออเดอร์นั้น
   */
  function buildSummaryForRange(startDate, endDate) {
    const sheet = getRevenueSheet();
    const values = sheet.getDataRange().getValues();
    const startKey = dateKeyOf(startDate);
    const endKey = dateKeyOf(endDate);

    const products = [];
    const productIndex = {};
    let orderCount = 0;
    let totalAmount = 0;
    let currentOrderInRange = false;

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const revenueId = row[COL.REVENUE_ID];
      const productName = row[COL.PRODUCT_NAME];
      const qty = Number(row[COL.QTY]) || 0;
      const billTotal = Number(row[COL.BILL_TOTAL]) || 0;

      const isNewOrder = revenueId !== '' && revenueId != null;
      if (isNewOrder) {
        const key = toDateKey(row[COL.TIMESTAMP]);
        currentOrderInRange = key != null && key >= startKey && key <= endKey;
        if (currentOrderInRange) {
          orderCount++;
          totalAmount += billTotal;
        }
      }

      if (!productName || !currentOrderInRange) continue;

      if (!(productName in productIndex)) {
        productIndex[productName] = products.length;
        products.push({ name: productName, qty: 0 });
      }
      products[productIndex[productName]].qty += qty;
    }

    const isSingleDay = startKey === endKey;
    const dateLabel = isSingleDay
      ? formatThaiDate(startDate)
      : `${formatThaiDate(startDate)} - ${formatThaiDate(endDate)}`;

    return { dateLabel, isSingleDay, products, orderCount, totalAmount };
  }

  function toDateKey(value) {
    if (Object.prototype.toString.call(value) === '[object Date]') {
      return Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd');
    }
    const m = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // รูปแบบ dd/MM/yyyy
    if (!m) return null;
    const d = ('0' + m[1]).slice(-2);
    const mo = ('0' + m[2]).slice(-2);
    return `${m[3]}-${mo}-${d}`;
  }

  function dateKeyOf(date) {
    return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
  }

  function bangkokMidnight(year, month, day) {
    const pad = (n) => ('0' + n).slice(-2);
    return new Date(`${year}-${pad(month)}-${pad(day)}T00:00:00+07:00`); // Bangkok = UTC+7 คงที่ ไม่มี DST
  }

  function todayBangkok() {
    const [y, m, d] = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd').split('-').map(Number);
    return bangkokMidnight(y, m, d);
  }

  function addDays(date, n) {
    return new Date(date.getTime() + n * 86400000);
  }

  function formatThaiDate(date) {
    const d = Number(Utilities.formatDate(date, TIMEZONE, 'd'));
    const m = Number(Utilities.formatDate(date, TIMEZONE, 'M')) - 1;
    const y = Number(Utilities.formatDate(date, TIMEZONE, 'yyyy'));
    return `${d} ${THAI_MONTHS[m]} ${y}`;
  }

  function formatBaht(amount) {
    return Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── สร้าง Flex Message ธีมสีรุ้ง ─────────────────────────────

  function buildRainbowFlexMessage(summary) {
    const headerBox = {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      spacing: 'sm',
      background: {
        type: 'linearGradient',
        angle: '135deg',
        startColor: '#8E2DE2',
        centerColor: '#F857A6',
        endColor: '#FF8008',
      },
      contents: [
        { type: 'text', text: '🧾 สรุปออเดอร์' + (summary.isSingleDay ? 'ประจำวัน' : ''), color: '#FFFFFF', weight: 'bold', size: 'lg' },
        { type: 'text', text: summary.dateLabel, color: '#FFFFFFCC', size: 'sm', margin: 'xs' },
      ],
    };

    let productRows;
    if (summary.products.length === 0) {
      productRows = [
        { type: 'text', text: 'ไม่มีออเดอร์ในช่วงเวลานี้', color: '#8A8A8E', size: 'sm', align: 'center', margin: 'md' },
      ];
    } else {
      const sorted = summary.products.slice().sort((a, b) => b.qty - a.qty);
      const shown = sorted.slice(0, MAX_PRODUCT_ROWS);
      productRows = shown.map((p, idx) => ({
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        alignItems: 'center',
        contents: [
          { type: 'box', layout: 'vertical', width: '8px', height: '8px', cornerRadius: '4px', backgroundColor: RAINBOW[idx % RAINBOW.length], contents: [] },
          { type: 'text', text: p.name, wrap: true, size: 'sm', color: '#1C1C1E', flex: 5 },
          { type: 'text', text: 'x' + p.qty, size: 'sm', color: '#1C1C1E', weight: 'bold', align: 'end', flex: 1 },
        ],
      }));
      if (sorted.length > MAX_PRODUCT_ROWS) {
        productRows.push({
          type: 'text',
          text: `และอีก ${sorted.length - MAX_PRODUCT_ROWS} รายการ`,
          size: 'xs',
          color: '#8A8A8E',
          margin: 'sm',
        });
      }
    }

    const bodyBox = {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      spacing: 'md',
      contents: [
        { type: 'box', layout: 'vertical', spacing: 'sm', contents: productRows },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'lg',
          contents: [
            { type: 'text', text: 'ยอดรวมทั้งหมด', size: 'md', weight: 'bold', color: '#1C1C1E' },
            { type: 'text', text: formatBaht(summary.totalAmount) + ' บาท', size: 'md', weight: 'bold', color: '#FF3B30', align: 'end' },
          ],
        },
        { type: 'text', text: `จำนวน ${summary.orderCount} ออเดอร์`, size: 'xs', color: '#8A8A8E', align: 'end' },
      ],
    };

    return {
      type: 'bubble',
      header: headerBox,
      body: bodyBox,
    };
  }

  function buildAltText(summary) {
    const text = `สรุปออเดอร์ ${summary.dateLabel} รวม ${summary.orderCount} ออเดอร์ ยอดขาย ${formatBaht(summary.totalAmount)} บาท`;
    return text.length > 400 ? text.slice(0, 397) + '...' : text;
  }

  // ── เรียก LINE Messaging API ───────────────────────────────

  function pushLineMessage(flexContents, summary) {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    const groupId = props.getProperty('LINE_GROUP_ID');
    if (!token || !groupId) {
      throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN / LINE_GROUP_ID — เรียก EmOChaOrderBot_setupCredentials() ก่อน');
    }

    const payload = {
      to: groupId,
      messages: [{ type: 'flex', altText: buildAltText(summary), contents: flexContents }],
    };

    const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('LINE push failed (%s): %s', response.getResponseCode(), response.getContentText());
      throw new Error('ส่งข้อความ LINE ไม่สำเร็จ: ' + response.getContentText());
    }
  }

  function replyLineMessage(replyToken, message) {
    const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ replyToken, messages: [message] }),
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('LINE reply failed (%s): %s', response.getResponseCode(), response.getContentText());
    }
  }

  return {
    setupCredentials,
    createDailyTrigger,
    deleteDailyTrigger,
    sendDailySummary,
    sendTodaySummary,
    handleWebhookPost,
  };
})();

// ── จุดเข้าที่ต้องอยู่นอก namespace (เรียกจาก UI / trigger / Apps Script เอง) ──

function EmOChaOrderBot_setupCredentials() {
  // ใส่ค่าจริงตรงนี้ชั่วคราว แล้วเลือกฟังก์ชันนี้จากแถบด้านบนแล้วกด Run
  // หนึ่งครั้ง จากนั้นลบค่าออกทันที (ค่าจริงจะถูกเก็บใน Script Properties แทน)
  EmOChaOrderBot.setupCredentials(
    'PASTE_YOUR_LINE_CHANNEL_ACCESS_TOKEN_HERE',
    'PASTE_YOUR_LINE_GROUP_ID_HERE'
  );
}

function EmOChaOrderBot_createDailyTrigger() {
  EmOChaOrderBot.createDailyTrigger();
}

function EmOChaOrderBot_deleteDailyTrigger() {
  EmOChaOrderBot.deleteDailyTrigger();
}

function EmOChaOrderBot_sendDailySummary() {
  EmOChaOrderBot.sendDailySummary();
}

// รันฟังก์ชันนี้เพื่อดูสรุปของ "วันนี้" ทันที (เช่นเทสดูวันที่ 7 ก.ย.)
function EmOChaOrderBot_sendTodaySummary() {
  EmOChaOrderBot.sendTodaySummary();
}

// ⚠️ ลบ 2 ฟังก์ชันด้านล่างนี้ทิ้งถ้าโปรเจกต์นี้มี doGet/doPost อยู่แล้ว
// (ดูคำอธิบายเต็มในคอมเมนต์หัวไฟล์) แล้วเรียก EmOChaOrderBot.handleWebhookPost(e)
// จากใน doPost เดิมแทน

function doGet() {
  return ContentService.createTextOutput('Order LINE bot webhook is running.');
}

function doPost(e) {
  return EmOChaOrderBot.handleWebhookPost(e);
}
