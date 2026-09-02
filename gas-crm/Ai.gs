/**
 * AI วิเคราะห์ลูกค้าที่ยังไม่ปิดดีล ด้วย Claude API (Anthropic)
 * ต้องตั้งค่า ANTHROPIC_API_KEY ในหน้า "ตั้งค่า" ก่อนใช้งาน
 */

function buildAiPrompt(customer, deals, followups, documents, skus) {
  var skuList = skus.slice(0, 60).map(function (s) {
    return '- ' + (s.productNameTh || s.productNameEn) + ' (' + (s.category || 'ไม่ระบุหมวด') + ') ราคา ' + (s.price || '-') + ' บาท';
  }).join('\n');

  var dealsText = deals.map(function (d) {
    return '- ' + d.Title + ' | สถานะ: ' + d.Stage + ' | สนใจสินค้า: ' + (d.ProductInterest || '-') + ' | มูลค่าประมาณ: ' + (d.EstimatedValue || '-') + ' ' + (d.Currency || '');
  }).join('\n') || '- ยังไม่มีดีล';

  var followupsText = followups.map(function (f) {
    return '- [' + f.Type + '] ' + (f.Note || '') + ' (' + (f.FollowUpDate || 'ไม่ระบุวัน') + ')';
  }).join('\n') || '- ยังไม่มีประวัติการติดตาม';

  var docsText = documents.map(function (doc) {
    return '- ' + doc.DocType + ' เลขที่ ' + (doc.DocNumber || '-') + ' วันที่ ' + (doc.IssueDate || '-');
  }).join('\n') || '- ยังไม่มีเอกสาร';

  return 'คุณเป็นที่ปรึกษาฝ่ายขายส่งออกสินค้าอาหารไทยไปต่างประเทศ ช่วยวิเคราะห์ลูกค้ารายนี้ที่ยังปิดการขายไม่สำเร็จ\n' +
    'แล้วแนะนำ "แนวทางการนำเสนอ" และ "สินค้าที่ควรเสนอ" อย่างเจาะจง เป็นภาษาไทย กระชับ ใช้งานได้จริง\n\n' +
    'ข้อมูลลูกค้า:\n' +
    '- ชื่อ: ' + (customer.Type === 'company' ? customer.CompanyName : customer.Name) + '\n' +
    '- ประเภท: ' + (customer.Type === 'company' ? 'บริษัท' : 'บุคคลธรรมดา') + '\n' +
    '- ประเทศเป้าหมาย: ' + (customer.Country || 'ไม่ระบุ') + '\n' +
    '- ช่องทางติดต่อ: ' + (customer.ContactChannel || 'ไม่ระบุ') + '\n' +
    '- หมายเหตุ: ' + (customer.Notes || '-') + '\n\n' +
    'ดีล/โอกาสการขาย:\n' + dealsText + '\n\n' +
    'ประวัติการติดตาม:\n' + followupsText + '\n\n' +
    'เอกสารที่เคยส่งให้ลูกค้า:\n' + docsText + '\n\n' +
    'รายการสินค้าที่มีขายส่งออก (เลือกจากรายการนี้เท่านั้นเวลาแนะนำสินค้า):\n' + (skuList || '- ไม่มีข้อมูลสินค้าในระบบ') + '\n\n' +
    'กรุณาตอบเป็น JSON เท่านั้น ไม่ต้องมีข้อความอื่นนอก JSON รูปแบบดังนี้:\n' +
    '{\n' +
    '  "approach": "แนวทางการนำเสนอ/เจรจาที่ควรทำต่อไป (2-4 ประโยค)",\n' +
    '  "recommendedProducts": ["ชื่อสินค้า 1", "ชื่อสินค้า 2"],\n' +
    '  "riskLevel": "low|medium|high",\n' +
    '  "nextAction": "สิ่งที่ควรทำเป็นลำดับถัดไป (1 ประโยค)"\n' +
    '}';
}

function safeParseJson(text) {
  try { return JSON.parse(text); } catch (e) { /* try to extract */ }
  var match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (e2) { /* fall through */ }
  }
  return { approach: text, recommendedProducts: [], riskLevel: 'medium', nextAction: '' };
}

function analyzeCustomerAI(customerId) {
  var customer = getObjectById(SHEETS.CUSTOMERS, customerId);
  if (!customer) throw new Error('ไม่พบลูกค้า');

  var deals = sheetToObjects(getSheet(SHEETS.DEALS)).filter(function (d) { return d.CustomerID === customerId; });
  var followups = sheetToObjects(getSheet(SHEETS.FOLLOWUPS)).filter(function (f) { return f.CustomerID === customerId; });
  var documents = sheetToObjects(getSheet(SHEETS.DOCUMENTS)).filter(function (d) { return d.CustomerID === customerId; });
  var skus = getSkus();

  var apiKey = PROPS.getProperty('ANTHROPIC_API_KEY');
  var parsed;
  if (!apiKey) {
    parsed = {
      approach: 'ยังไม่ได้ตั้งค่า Anthropic API Key กรุณาตั้งค่าในหน้า "ตั้งค่า" ก่อน',
      recommendedProducts: [],
      riskLevel: 'medium',
      nextAction: 'ใส่ API Key แล้วลองวิเคราะห์อีกครั้ง',
      unavailable: true,
    };
  } else {
    var model = PROPS.getProperty('ANTHROPIC_MODEL') || 'claude-sonnet-5';
    var prompt = buildAiPrompt(customer, deals, followups, documents, skus);
    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ model: model, max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
      muteHttpExceptions: true,
    });
    var code = response.getResponseCode();
    var body = response.getContentText();
    if (code !== 200) {
      throw new Error('เรียก Claude API ไม่สำเร็จ (' + code + '): ' + body.slice(0, 300));
    }
    var json = JSON.parse(body);
    var text = (json.content || []).map(function (c) { return c.type === 'text' ? c.text : ''; }).join('\n');
    parsed = safeParseJson(text);
  }

  var insight = {
    ID: Utilities.getUuid(),
    CustomerID: customerId,
    Approach: parsed.approach || '',
    RecommendedProducts: JSON.stringify(parsed.recommendedProducts || []),
    RiskLevel: parsed.riskLevel || 'medium',
    NextAction: parsed.nextAction || '',
    CreatedAt: nowIso(),
  };
  appendObject(getSheet(SHEETS.AI_INSIGHTS), insight);
  insight.recommendedProductsList = parsed.recommendedProducts || [];
  return insight;
}

function analyzeAllOpenCustomers() {
  var deals = sheetToObjects(getSheet(SHEETS.DEALS));
  var ids = [];
  deals.forEach(function (d) {
    if (d.Status === 'open' && OPEN_STAGES.indexOf(d.Stage) !== -1 && ids.indexOf(d.CustomerID) === -1) {
      ids.push(d.CustomerID);
    }
  });
  var results = [];
  ids.forEach(function (id) {
    try {
      results.push(analyzeCustomerAI(id));
    } catch (err) {
      results.push({ customerId: id, error: err.message });
    }
  });
  return results;
}
