/**
 * สรุปออเดอร์ประจำวัน → LINE กลุ่ม (Flex Message ธีมสีรุ้ง)
 * =========================================================
 *
 * สคริปต์นี้อ่านข้อมูลจากชีต "Revenue" (ไฟล์เก็บยอดขายบน Google Drive)
 * แล้วสรุปเป็นรายออเดอร์ (แต่ละคนสั่งอะไรบ้าง สูงสุด 10 ออเดอร์ต่อการ์ด) + ยอดรวม
 * ส่งเป็น Flex Message สีรุ้งเข้ากลุ่ม LINE
 *
 * ค่า default นับเฉพาะออเดอร์ที่คอลัมน์ Ad เป็น "Line shop" เท่านั้น (ตัด Shopee/
 * TikTok ออก) — ถ้าอยากดูช่องทางอื่นเป็นครั้งคราว พิมพ์ชื่อช่องทางต่อท้ายคำสั่งได้
 * เช่น "สรุป shopee วันนี้" หรือ "สรุป ทั้งหมด เมื่อวาน" (ดูโหมดที่ 2 ด้านล่าง)
 *
 * มี 2 โหมดการทำงาน:
 *   1) สรุปอัตโนมัติทุกเช้า 6-7 โมง เป็นยอดขาย "เมื่อวาน" ทั้งวัน (เฉพาะ Line shop)
 *   2) พิมพ์คำสั่งในกลุ่ม LINE เพื่อขอสรุปช่วงวันที่/ช่องทางเอง เช่น
 *        "สรุป 01/09/69-07/09/69" (ปีพิมพ์เป็น พ.ศ. แบบเต็ม 2569 หรือ ค.ศ. 2026 ก็ได้)
 *        "สรุปวันนี้" / "สรุปเมื่อวาน"
 *        "สรุป shopee วันนี้" / "สรุป tiktok 01/09/69-07/09/69"
 *        "สรุป ทั้งหมด เมื่อวาน" (รวมทุกช่องทาง ไม่กรอง)
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
  const MAX_ORDER_ROWS = 10; // จำนวนออเดอร์สูงสุดที่แสดงในการ์ด กันการ์ดยาวเกินไป
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
    CUSTOMER_NAME: 13, // คอลัมน์ "Customer Name" ในชีต Revenue
    AD: 16, // คอลัมน์ "Ad" ในชีต Revenue — ใช้บอกช่องทางขาย เช่น Shopee, TikTok, Line shop
  };

  // นับเฉพาะออเดอร์ที่คอลัมน์ Ad ตรงกับค่านี้เท่านั้น (ไม่สนตัวพิมพ์เล็ก-ใหญ่/เว้นวรรคหน้า-หลัง)
  // ถ้าในชีตจริงสะกดคำนี้ต่างจากนี้ (เช่น "LINE Shop" ตัวใหญ่ทั้งหมด หรือ "ไลน์ช้อป") ให้แก้ค่านี้ให้ตรง
  const AD_FILTER = 'line shop';

  // ออเดอร์ที่ถูกยกเลิก: คอลัมน์ ProductName ของแถวจะขึ้นคำนี้แทนชื่อสินค้าจริง
  // ออเดอร์แบบนี้จะไม่โชว์รายละเอียดในการ์ด ไม่นับยอดขาย/จำนวนออเดอร์ปกติ แต่นับแยกไว้เป็นจำนวนอย่างเดียว
  const CANCELLED_LABEL = 'ยกเลิก';

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
        text: 'พิมพ์ "สรุป" ตามด้วยช่วงวันที่ เช่น\n'
          + '"สรุป 01/09/69-07/09/69" (ปี พ.ศ. แบบเต็ม 2569 ก็ได้)\n'
          + 'หรือ "สรุปวันนี้" / "สรุปเมื่อวาน"\n\n'
          + 'ถ้าอยากดูช่องทางอื่นที่ไม่ใช่ Line shop พิมพ์ชื่อช่องทางต่อท้ายได้ เช่น\n'
          + '"สรุป shopee วันนี้"\n'
          + '"สรุป tiktok 01/09/69-07/09/69"\n'
          + '"สรุป ทั้งหมด เมื่อวาน" (รวมทุกช่องทาง)',
      });
      return;
    }

    const summary = buildSummaryForRange(range.start, range.end, range.adFilter);
    replyLineMessage(event.replyToken, {
      type: 'flex',
      altText: buildAltText(summary),
      contents: buildRainbowFlexMessage(summary),
    });
  }

  /**
   * แกะข้อความคำสั่งเป็นช่วงวันที่ + ช่องทาง (Ad) ที่ต้องการดูแทนค่า default
   * รูปแบบ: "สรุป [ชื่อช่องทาง] [ช่วงวันที่ หรือ วันนี้/เมื่อวาน]" — ชื่อช่องทางใส่หรือไม่ใส่ก็ได้
   * เช่น "สรุป shopee 01/09/69-07/09/69", "สรุป tiktok วันนี้", "สรุป ทั้งหมด เมื่อวาน"
   */
  function parseRangeCommand(text) {
    let rest = text.slice(COMMAND_KEYWORD.length).trim();
    let start = null;
    let end = null;

    if (/เมื่อวาน/.test(rest)) {
      start = end = addDays(todayBangkok(), -1);
      rest = rest.replace(/เมื่อวาน/, '').trim();
    } else if (/วันนี้/.test(rest)) {
      start = end = todayBangkok();
      rest = rest.replace(/วันนี้/, '').trim();
    } else {
      // จับวันที่ 1 หรือ 2 ตัวพร้อมตัวคั่นระหว่างกลาง (เช่น "-") ไว้ในแมตช์เดียว
      // เพื่อลบทิ้งทั้งก้อนทีเดียว ไม่ให้เหลือตัวคั่นตกค้างปนไปกับชื่อช่องทางที่พิมพ์ต่อท้าย
      const dateToken = '\\d{1,2}[\\/\\-]\\d{1,2}(?:[\\/\\-]\\d{2,4})?';
      const rangeMatch = rest.match(new RegExp(`(${dateToken})(?:[\\s\\-]*(${dateToken}))?`));
      if (rangeMatch) {
        const refYear = Number(Utilities.formatDate(new Date(), TIMEZONE, 'yyyy'));
        start = parseDateToken(rangeMatch[1], refYear);
        end = rangeMatch[2] ? parseDateToken(rangeMatch[2], refYear) : start;
        if (start && end) {
          if (start.getTime() > end.getTime()) { const tmp = start; start = end; end = tmp; }
          rest = (rest.slice(0, rangeMatch.index) + rest.slice(rangeMatch.index + rangeMatch[0].length)).trim();
        } else {
          start = end = null;
        }
      }
    }

    // ข้อความที่เหลือหลังตัดส่วนวันที่ออก ถือเป็นชื่อช่องทาง (Ad) ที่ต้องการแทนค่า default
    const channelText = rest.trim();
    let adFilter = null; // null = ใช้ค่า default (AD_FILTER คือ "line shop")
    if (channelText) {
      adFilter = /^(ทั้งหมด|all|รวม)$/i.test(channelText) ? '*' : channelText.toLowerCase();
    }

    if (!start || !end) {
      if (!channelText) return null; // ไม่มีทั้งวันที่และชื่อช่องทาง แสดงคำแนะนำการใช้งาน
      start = end = todayBangkok(); // พิมพ์แค่ชื่อช่องทางมาเฉยๆ (ไม่ระบุวันที่) ถือว่าหมายถึงวันนี้
    }

    return { start, end, adFilter };
  }

  function parseDateToken(token, referenceYear) {
    const m = token.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
    if (!m) return null;
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = m[3] ? toGregorianYear(Number(m[3])) : referenceYear;
    return bangkokMidnight(year, month, day);
  }

  // รับปีได้ทั้ง พ.ศ. เต็ม (2569), พ.ศ. ย่อ (69) หรือ ค.ศ. เต็ม (2026) แล้วแปลงเป็น ค.ศ. เสมอ
  // เพื่อให้ตรงกับปีจริงในคอลัมน์ Timestamp ของชีต Revenue
  function toGregorianYear(year) {
    if (year >= 2400) return year - 543; // พ.ศ. เต็ม เช่น 2569 → 2026
    if (year < 100) return year + 2500 - 543; // พ.ศ. ย่อ เช่น 69 → 2569 พ.ศ. → 2026
    return year; // ค.ศ. เต็ม เช่น 2026
  }

  // ── เข้าถึง/สรุปข้อมูลจากชีต Revenue ────────────────────────

  function getRevenueSheet() {
    const ss = SpreadsheetApp.openById(REVENUE_SPREADSHEET_ID);
    return ss.getSheetByName(REVENUE_SHEET_NAME) || ss.getSheets()[0];
  }

  /**
   * รวบรวมออเดอร์ (แต่ละออเดอร์แยกกัน พร้อมรายการสินค้าของออเดอร์นั้น) ในช่วง
   * [startDate, endDate] (รวมวันที่ปลายทั้งสองด้าน) นับเฉพาะออเดอร์ที่คอลัมน์ Ad
   * ตรงกับ adFilter เท่านั้น — ไม่ระบุ (undefined/null) จะใช้ค่า default คือ
   * AD_FILTER ("line shop"); ส่ง '*' เพื่อรวมทุกช่องทาง
   * รองรับแถวสินค้าเพิ่มเติมของออเดอร์เดียวกัน (แถวที่ไม่มี Revenue ID/Timestamp
   * ของตัวเอง) โดยผูกเข้ากับออเดอร์หลักแถวก่อนหน้า
   * ออเดอร์ที่ถูกยกเลิก (ProductName = CANCELLED_LABEL) จะไม่รวมในยอด/รายการ
   * แต่นับแยกไว้ที่ cancelledCount
   */
  function buildSummaryForRange(startDate, endDate, adFilter) {
    const sheet = getRevenueSheet();
    const values = sheet.getDataRange().getValues();
    const startKey = dateKeyOf(startDate);
    const endKey = dateKeyOf(endDate);
    const effectiveAdFilter = adFilter || AD_FILTER;

    const orders = [];
    let currentOrder = null;
    let orderCount = 0;
    let totalAmount = 0;
    let cancelledCount = 0;

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const revenueId = row[COL.REVENUE_ID];
      const productName = String(row[COL.PRODUCT_NAME] || '').trim();
      const qty = Number(row[COL.QTY]) || 0;
      const billTotal = Number(row[COL.BILL_TOTAL]) || 0;

      const isNewOrder = revenueId !== '' && revenueId != null;
      if (isNewOrder) {
        currentOrder = null;
        const key = toDateKey(row[COL.TIMESTAMP]);
        const inRange = key != null && key >= startKey && key <= endKey;
        const adValue = String(row[COL.AD] || '').trim().toLowerCase();
        const adMatches = effectiveAdFilter === '*' || adValue === effectiveAdFilter;
        if (inRange && adMatches) {
          if (productName === CANCELLED_LABEL) {
            cancelledCount++;
          } else {
            orderCount++;
            totalAmount += billTotal;
            currentOrder = {
              id: revenueId,
              customerName: String(row[COL.CUSTOMER_NAME] || '').trim(),
              items: [],
              subtotal: billTotal,
              dateKey: key,
            };
            orders.push(currentOrder);
          }
        }
      }

      if (!productName || !currentOrder || productName === CANCELLED_LABEL) continue;
      currentOrder.items.push({ name: productName, qty });
    }

    const isSingleDay = startKey === endKey;
    const dateLabel = isSingleDay
      ? formatThaiDate(startDate)
      : `${formatThaiDate(startDate)} - ${formatThaiDate(endDate)}`;

    return { dateLabel, isSingleDay, orders, orderCount, totalAmount, cancelledCount, adFilter: effectiveAdFilter };
  }

  // ชื่อช่องทางแบบสวยๆ ไว้โชว์บนการ์ด/altText เช่น "line shop" → "Line Shop", '*' → "ทุกช่องทาง"
  function channelLabel(adFilter) {
    if (adFilter === '*') return 'ทุกช่องทาง';
    return adFilter
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
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
    const y = Number(Utilities.formatDate(date, TIMEZONE, 'yyyy')) + 543; // แสดงเป็นปี พ.ศ.
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
        { type: 'text', text: '🧾 สรุปออเดอร์' + (summary.isSingleDay ? 'ประจำวัน' : ''), color: '#FFFFFF', weight: 'bold', size: 'lg', wrap: true },
        { type: 'text', text: `${channelLabel(summary.adFilter)} · ${summary.dateLabel}`, color: '#FFFFFFCC', size: 'sm', margin: 'xs', wrap: true },
      ],
    };

    let orderBlocks;
    if (summary.orders.length === 0) {
      orderBlocks = [
        { type: 'text', text: 'ไม่มีออเดอร์ในช่วงเวลานี้', color: '#8A8A8E', size: 'sm', align: 'center', margin: 'md' },
      ];
    } else if (summary.isSingleDay) {
      orderBlocks = buildOrderListContents(summary.orders);
    } else {
      orderBlocks = buildOrdersGroupedByDay(summary.orders);
    }

    const footerContents = [
      { type: 'text', text: `จำนวน ${summary.orderCount} ออเดอร์`, size: 'xs', color: '#8A8A8E', align: 'end' },
    ];
    if (summary.cancelledCount > 0) {
      footerContents.push({ type: 'text', text: `ยกเลิก ${summary.cancelledCount} ออเดอร์ (ไม่รวมในยอด)`, size: 'xs', color: '#8A8A8E', align: 'end' });
    }

    const bodyBox = {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      spacing: 'md',
      contents: [
        { type: 'box', layout: 'vertical', spacing: 'sm', contents: orderBlocks },
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
        { type: 'box', layout: 'vertical', contents: footerContents },
      ],
    };

    return {
      type: 'bubble',
      header: headerBox,
      body: bodyBox,
    };
  }

  // รายการออเดอร์แบบเรียบๆ (ใช้ตอนขอสรุปแค่วันเดียว) จำกัดไว้ MAX_ORDER_ROWS ออเดอร์
  function buildOrderListContents(orders) {
    const shown = orders.slice(0, MAX_ORDER_ROWS);
    const blocks = [];
    shown.forEach((order, idx) => {
      if (idx > 0) blocks.push({ type: 'separator', margin: 'sm' });
      blocks.push(buildOrderBlock(order, idx));
    });
    if (orders.length > MAX_ORDER_ROWS) {
      blocks.push({
        type: 'text',
        text: `และอีก ${orders.length - MAX_ORDER_ROWS} ออเดอร์`,
        size: 'xs',
        color: '#8A8A8E',
        margin: 'sm',
      });
    }
    return blocks;
  }

  // เมื่อขอสรุปเป็นช่วงหลายวัน ให้แยกกลุ่มออเดอร์ตามวันที่ (มีหัวข้อวันที่คั่นแต่ละกลุ่ม)
  // เรียงตามลำดับที่เจอในชีต (เรียงตามวันที่อยู่แล้วเพราะแถวในชีตเรียงตามเวลา)
  // แต่ยังจำกัดจำนวนออเดอร์รวมทั้งการ์ดไว้ที่ MAX_ORDER_ROWS เหมือนเดิม กันการ์ดยาวเกินไป
  function buildOrdersGroupedByDay(orders) {
    const groups = [];
    const groupIndexByKey = {};
    orders.forEach((order) => {
      if (!(order.dateKey in groupIndexByKey)) {
        groupIndexByKey[order.dateKey] = groups.length;
        groups.push({ dateKey: order.dateKey, orders: [] });
      }
      groups[groupIndexByKey[order.dateKey]].orders.push(order);
    });

    const blocks = [];
    let shownCount = 0;
    for (let g = 0; g < groups.length && shownCount < MAX_ORDER_ROWS; g++) {
      const group = groups[g];
      if (g > 0) blocks.push({ type: 'separator', margin: 'md' });
      blocks.push({
        type: 'text',
        text: formatThaiDateFromKey(group.dateKey),
        size: 'xs',
        weight: 'bold',
        color: '#48484A',
        margin: g > 0 ? 'md' : 'none',
      });
      for (let j = 0; j < group.orders.length && shownCount < MAX_ORDER_ROWS; j++) {
        blocks.push(buildOrderBlock(group.orders[j], shownCount));
        shownCount++;
      }
    }
    if (orders.length > shownCount) {
      blocks.push({
        type: 'text',
        text: `และอีก ${orders.length - shownCount} ออเดอร์`,
        size: 'xs',
        color: '#8A8A8E',
        margin: 'sm',
      });
    }
    return blocks;
  }

  function formatThaiDateFromKey(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return formatThaiDate(bangkokMidnight(y, m, d));
  }

  // การ์ดของ 1 ออเดอร์: หัวแถวเป็น "ชื่อลูกค้า · #เลขออเดอร์" ตามด้วยรายการสินค้า
  // ของออเดอร์นั้น แล้วปิดท้ายด้วยยอดรวมเฉพาะออเดอร์นี้
  function buildOrderBlock(order, idx) {
    const whoLabel = order.customerName ? `${order.customerName} · #${order.id}` : `#${order.id}`;
    return {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'xs',
          alignItems: 'center',
          contents: [
            { type: 'box', layout: 'vertical', width: '6px', height: '6px', cornerRadius: '3px', backgroundColor: RAINBOW[idx % RAINBOW.length], contents: [] },
            { type: 'text', text: whoLabel, size: 'xs', weight: 'bold', color: '#1C1C1E', wrap: true, flex: 1 },
          ],
        },
        ...order.items.map((item) => ({
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: item.name, wrap: true, size: 'xs', color: '#48484A', flex: 5 },
            { type: 'text', text: 'x' + item.qty, size: 'xs', color: '#48484A', align: 'end', flex: 1 },
          ],
        })),
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: 'ยอดออเดอร์นี้', size: 'xs', color: '#8A8A8E' },
            { type: 'text', text: formatBaht(order.subtotal) + ' บาท', size: 'xs', color: '#8A8A8E', align: 'end' },
          ],
        },
      ],
    };
  }

  function buildAltText(summary) {
    const text = `สรุปออเดอร์ (${channelLabel(summary.adFilter)}) ${summary.dateLabel} รวม ${summary.orderCount} ออเดอร์ ยอดขาย ${formatBaht(summary.totalAmount)} บาท`;
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
