const { v4: uuid } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');
const { OPEN_STAGES } = require('../constants');

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function buildPrompt(customer, deals, followups, documents, skus) {
  const skuList = skus.slice(0, 60).map((s) => (
    `- ${s.productNameTh || s.productNameEn} (${s.category || 'ไม่ระบุหมวด'}) ราคา ${s.price || '-'} บาท`
  )).join('\n');

  return `คุณเป็นที่ปรึกษาฝ่ายขายส่งออกสินค้าอาหารไทยไปต่างประเทศ ช่วยวิเคราะห์ลูกค้ารายนี้ที่ยังปิดการขายไม่สำเร็จ
แล้วแนะนำ "แนวทางการนำเสนอ" และ "สินค้าที่ควรเสนอ" อย่างเจาะจง เป็นภาษาไทย กระชับ ใช้งานได้จริง

ข้อมูลลูกค้า:
- ชื่อ: ${customer.type === 'company' ? customer.companyName : customer.name}
- ประเภท: ${customer.type === 'company' ? 'บริษัท' : 'บุคคลธรรมดา'}
- ประเทศเป้าหมาย: ${customer.country || 'ไม่ระบุ'}
- ช่องทางติดต่อ: ${customer.contactChannel || 'ไม่ระบุ'}
- หมายเหตุ: ${customer.notes || '-'}

ดีล/โอกาสการขาย:
${deals.map((d) => `- ${d.title} | สถานะ: ${d.stage} | สนใจสินค้า: ${d.productInterest || '-'} | มูลค่าประมาณ: ${d.estimatedValue || '-'} ${d.currency || ''}`).join('\n') || '- ยังไม่มีดีล'}

ประวัติการติดตาม:
${followups.map((f) => `- [${f.type}] ${f.note || ''} (${f.followUpDate || 'ไม่ระบุวัน'})`).join('\n') || '- ยังไม่มีประวัติการติดตาม'}

เอกสารที่เคยส่งให้ลูกค้า:
${documents.map((doc) => `- ${doc.docType} เลขที่ ${doc.docNumber || '-'} วันที่ ${doc.issueDate || '-'}`).join('\n') || '- ยังไม่มีเอกสาร'}

รายการสินค้าที่มีขายส่งออก (เลือกจากรายการนี้เท่านั้นเวลาแนะนำสินค้า):
${skuList || '- ไม่มีข้อมูลสินค้าในระบบ'}

กรุณาตอบเป็น JSON เท่านั้น ไม่ต้องมีข้อความอื่นนอก JSON รูปแบบดังนี้:
{
  "approach": "แนวทางการนำเสนอ/เจรจาที่ควรทำต่อไป (2-4 ประโยค)",
  "recommendedProducts": ["ชื่อสินค้า 1", "ชื่อสินค้า 2"],
  "riskLevel": "low|medium|high",
  "nextAction": "สิ่งที่ควรทำเป็นลำดับถัดไป (1 ประโยค)"
}`;
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e2) { /* fall through */ }
    }
    return { approach: text, recommendedProducts: [], riskLevel: 'medium', nextAction: '' };
  }
}

async function analyzeCustomer(customerId) {
  const customer = db.get('customers').find({ id: customerId }).value();
  if (!customer) throw new Error('ไม่พบลูกค้า');

  const deals = db.get('deals').filter({ customerId }).value();
  const followups = db.get('followups').filter({ customerId }).value();
  const documents = db.get('documents').filter({ customerId }).value();
  const skus = db.get('skus').value();

  const client = getClient();
  let parsed;
  if (!client) {
    parsed = {
      approach: 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY จึงไม่สามารถวิเคราะห์ด้วย AI ได้ กรุณาตั้งค่าในไฟล์ .env',
      recommendedProducts: [],
      riskLevel: 'medium',
      nextAction: 'ตั้งค่า ANTHROPIC_API_KEY แล้วลองวิเคราะห์อีกครั้ง',
      unavailable: true,
    };
  } else {
    const prompt = buildPrompt(customer, deals, followups, documents, skus);
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
    const message = await client.messages.create({
      model,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = message.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
    parsed = safeParseJson(text);
  }

  const insight = {
    id: uuid(),
    customerId,
    ...parsed,
    createdAt: new Date().toISOString(),
  };
  db.get('ai_insights').push(insight).write();
  return insight;
}

function listOpenDealCustomerIds() {
  const deals = db.get('deals').value();
  const ids = new Set(deals.filter((d) => d.status === 'open' && OPEN_STAGES.includes(d.stage)).map((d) => d.customerId));
  return Array.from(ids);
}

async function analyzeAllOpenCustomers() {
  const ids = listOpenDealCustomerIds();
  const results = [];
  for (const id of ids) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const insight = await analyzeCustomer(id);
      results.push(insight);
    } catch (err) {
      results.push({ customerId: id, error: err.message });
    }
  }
  return results;
}

module.exports = { analyzeCustomer, analyzeAllOpenCustomers };
