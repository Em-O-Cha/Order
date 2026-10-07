// ตรวจไฟล์/ใบเสร็จสำหรับ loyalty (แยกไว้ให้ทดสอบได้โดยไม่ต้องต่อฐานข้อมูล)
//   sniffMime / scanMetadata  ชนิดไฟล์จริง + ร่องรอยโปรแกรมแต่งรูป/เครื่องมือ AI ในไฟล์
//   aiCheck                   ให้ Claude อ่านใบเสร็จ (โครงสร้างผลตาม RECEIPT_SCHEMA)
//   evaluate                  สรุปผล pass / suspect / fail / unchecked + ธงเหตุผล + คีย์ตรวจซ้ำ + คะแนนที่แนะนำ
//                             (รวมโปรคะแนนพิเศษ: คิดคะแนนจากยอดสินค้าในโปรก่อนแล้วค่อยคูณ ติดป้าย promo ไว้ในรายการสินค้า)
//   validateSurvey            ตรวจคำตอบแบบสอบถามกับค่าตั้ง

import Anthropic from "npm:@anthropic-ai/sdk@0.129.0";

// deno-lint-ignore no-explicit-any
export type Json = Record<string, any>;

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function extOf(name: string, mime: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name || "");
  if (m) return m[1].toLowerCase();
  if (mime === "application/pdf") return "pdf";
  const t = (mime.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "");
  return t === "jpeg" ? "jpg" : (t || "bin");
}

// เดาชนิดไฟล์จากเนื้อไฟล์ (มือถือบางรุ่นส่ง type ว่าง / application/octet-stream)
export function sniffMime(bytes: Uint8Array, declared: string, name: string): string {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  const brand = String.fromCharCode(...b.subarray(4, 12));
  if (brand.startsWith("ftyp") && /heic|heix|hevc|mif1|msf1|heim|heis/.test(brand)) return "image/heic";
  if (brand.startsWith("ftyp") && /avif/.test(brand)) return "image/avif";
  if (/\.(heic|heif)$/i.test(name)) return "image/heic";
  return declared || "application/octet-stream";
}

// ร่องรอยในไฟล์: โปรแกรมแต่งรูป / ป้าย "สร้างด้วย AI" (EXIF Software, XMP, C2PA, PDF Producer)
export const EDITOR_MARKERS: [RegExp, string][] = [
  [/Adobe Photoshop/i, "Adobe Photoshop"], [/Picsart/i, "Picsart"], [/Canva/i, "Canva"], [/GIMP/, "GIMP"],
  [/Snapseed/i, "Snapseed"], [/Lightroom/i, "Lightroom"], [/Meitu/i, "Meitu"], [/Pixelmator/i, "Pixelmator"],
  [/Affinity Photo/i, "Affinity Photo"], [/Illustrator/i, "Adobe Illustrator"], [/Microsoft.{0,4}Word/i, "Microsoft Word"],
  [/PDFescape/i, "PDFescape"], [/Sejda/i, "Sejda"], [/Photopea/i, "Photopea"], [/PhotoRoom/i, "PhotoRoom"],
];
export const AI_MARKERS: [RegExp, string][] = [
  [/trainedAlgorithmicMedia/, "ป้ายกำกับว่าสร้างด้วย AI (IPTC trainedAlgorithmicMedia)"],
  [/DALL[-·]?E|OpenAI|ChatGPT/i, "OpenAI / DALL-E"], [/Midjourney/i, "Midjourney"],
  [/Stable Diffusion|stability\.ai|ComfyUI|Automatic1111/i, "Stable Diffusion"], [/Firefly/i, "Adobe Firefly"],
  [/Imagen|SynthID|Gemini/i, "Google AI (Imagen/Gemini)"], [/Ideogram/i, "Ideogram"], [/Leonardo\.ai/i, "Leonardo.ai"],
];

export function scanMetadata(bytes: Uint8Array): { editors: string[]; ai: string[]; hasCamera: boolean } {
  const head = bytes.subarray(0, Math.min(bytes.length, 512 * 1024));
  const tail = bytes.length > 512 * 1024 ? bytes.subarray(bytes.length - 64 * 1024) : new Uint8Array();
  const text = new TextDecoder("latin1").decode(head) + new TextDecoder("latin1").decode(tail);
  const editors = EDITOR_MARKERS.filter(([re]) => re.test(text)).map(([, n]) => n);
  const ai = AI_MARKERS.filter(([re]) => re.test(text)).map(([, n]) => n);
  // มี Make/Model ของกล้องใน EXIF (ถ่ายจากกล้องจริง) — ใช้แค่ประกอบการตัดสินใจของแอดมิน
  const hasCamera = /Exif\0\0/.test(text) && /(Apple|samsung|Xiaomi|OPPO|vivo|HUAWEI|Google|realme|OnePlus|Sony)/i.test(text);
  return { editors: [...new Set(editors)], ai: [...new Set(ai)], hasCamera };
}

// ---------------------------------------------------------------------------
// AI อ่านและตรวจใบเสร็จ
// ---------------------------------------------------------------------------
export const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_receipt", "is_7eleven", "document_type", "channel", "receipt_no", "store_name", "store_code", "pos_no",
    "purchased_at", "total_amount", "items", "emocha_amount", "readability", "tampering_signs", "ai_generated_signs",
    "authenticity", "confidence", "summary_th",
  ],
  properties: {
    is_receipt: { type: "boolean", description: "true if this is a purchase receipt / e-receipt / tax invoice" },
    is_7eleven: { type: "boolean", description: "true if issued by 7-Eleven Thailand (CP ALL) incl. 7-Delivery, 7-Eleven app, ALL Online" },
    document_type: { type: "string", enum: ["paper_receipt_photo", "e_receipt", "app_screenshot", "tax_invoice", "not_a_receipt", "other"] },
    channel: { type: "string", enum: ["store", "7delivery", "allonline", "7app", "unknown"] },
    receipt_no: { type: "string", description: "Receipt / bill number exactly as printed (e.g. the R# number). Empty string if not visible." },
    store_name: { type: "string", description: "Branch name as printed, empty if not visible" },
    store_code: { type: "string", description: "Branch / store number, empty if not visible" },
    pos_no: { type: "string", description: "POS / machine number, empty if not visible" },
    purchased_at: { type: "string", description: "Purchase date-time as YYYY-MM-DDTHH:MM in Gregorian (CE) calendar, Thailand local time. Convert Buddhist years (e.g. 2569 -> 2026, 69 -> 2026). Empty if not visible." },
    total_amount: { type: "number", description: "Grand total paid in THB; 0 if not visible" },
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["name", "qty", "amount", "is_emocha", "promo_id"],
        properties: {
          name: { type: "string" }, qty: { type: "number" }, amount: { type: "number", description: "Line total in THB after line discounts" },
          is_emocha: { type: "boolean", description: "true if this line is an Em-O-Cha (เอมโอชา) product" },
          promo_id: { type: "string", description: "id of the special-points promo product this Em-O-Cha line is, from the list in the user message. Empty string if none." },
        },
      },
    },
    emocha_amount: { type: "number", description: "Sum of amounts of Em-O-Cha lines in THB" },
    readability: { type: "string", enum: ["clear", "partial", "unreadable"] },
    tampering_signs: { type: "array", items: { type: "string" }, description: "Concrete signs of editing, in Thai. Empty if none." },
    ai_generated_signs: { type: "array", items: { type: "string" }, description: "Concrete signs the image was generated by AI, in Thai. Empty if none." },
    authenticity: { type: "string", enum: ["genuine", "suspicious", "likely_fake"] },
    confidence: { type: "number", description: "0 to 1 confidence in the extracted receipt number, date and Em-O-Cha amount" },
    summary_th: { type: "string", description: "One or two short Thai sentences for the admin summarising the receipt and any concern" },
  },
};

export const SYSTEM_PROMPT = `You check purchase receipts that members of the Thai food brand Em-O-Cha (เอมโอชา) upload to earn loyalty points for buying Em-O-Cha products at 7-Eleven Thailand. Points are paid only for Em-O-Cha items, so the admin relies on you to read the receipt accurately and to point out anything that looks fake.

Read the attached file and fill in every field of the output schema.

Reading the receipt
- 7-Eleven receipts can be a photo of the thermal paper slip from the store, an e-receipt or order summary from 7-Delivery / the 7-Eleven app / ALL Online, or a tax invoice. Treat all of these as 7-Eleven receipts.
- 7-Eleven prints product names abbreviated and without spaces. A line is an Em-O-Cha product when it contains the brand (เอมโอชา, EMOCHA, EM-O-CHA) or clearly matches one of the brand's products listed in the user message. Do not count other brands' chili paste or noodles.
- Use the amount actually charged for each Em-O-Cha line (after line discounts). emocha_amount is their sum.
- Some Em-O-Cha products currently earn extra points. The user message lists them with an id, a name and words that appear in the product name. Set promo_id on a line only when that line is clearly that product; otherwise leave it empty.
- Report the receipt number exactly as printed. Leave a field empty (or 0) when it is not visible rather than guessing.

Checking authenticity
Look for concrete evidence, and describe each sign you list in Thai so a shop admin can verify it:
- editing: mismatched fonts or font sizes, digits that are misaligned or differently sharp, smudged or patched areas, inconsistent background texture on thermal paper, totals that do not add up, VAT or change amounts that do not match the total.
- AI generation: garbled or nonsensical Thai text, invented store layouts, impossible dates, overly clean or synthetic look for a thermal slip, repeated patterns.
- a photo of a screen, a screenshot, or a crop that hides the header or the receipt number is not fake by itself, but mention it.
Use authenticity "genuine" when you see no concrete problem, "suspicious" when something needs a human look, and "likely_fake" only for clear evidence. Ordinary blur, creases and shadows are not tampering.`;

export type AiResult = { ok: true; data: Json; model: string; ms: number } | { ok: false; error: string; ms: number };

export async function aiCheck(apiKey: string, block: Json, keywords: string[], model: string,
                              promos: Json[] = []): Promise<AiResult> {
  const t0 = Date.now();
  if (!apiKey) return { ok: false, error: "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY", ms: 0 };
  try {
    const client = new Anthropic({ apiKey, timeout: 100_000, maxRetries: 1 });
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const userText = `Today in Thailand is ${today}.
Em-O-Cha brand words and product names to look for: ${keywords.join(", ")}.
Special-points promo products: ${promos.length
      ? promos.map((p) => `[${p.id}] ${p.name} (words: ${(p.keywords || []).join(", ")})`).join("; ")
      : "(none)"}.`;
    const params: Json = {
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: RECEIPT_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [block, { type: "text", text: userText }] }],
    };
    // deno-lint-ignore no-explicit-any
    const response: any = await client.beta.messages.create(params as any);
    if (response.stop_reason === "refusal") {
      return { ok: false, error: "AI ปฏิเสธการตรวจไฟล์นี้", ms: Date.now() - t0 };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, error: "AI ตอบไม่จบ (ยาวเกิน)", ms: Date.now() - t0 };
    }
    const text = (response.content || []).filter((b: Json) => b.type === "text").map((b: Json) => b.text).join("");
    return { ok: true, data: JSON.parse(text), model: String(response.model || model), ms: Date.now() - t0 };
  } catch (e) {
    let msg = String(e);
    if (e instanceof Anthropic.AuthenticationError) msg = "ANTHROPIC_API_KEY ไม่ถูกต้อง";
    else if (e instanceof Anthropic.RateLimitError) msg = "AI ถูกจำกัดการใช้งานชั่วคราว";
    else if (e instanceof Anthropic.APIConnectionTimeoutError) msg = "AI ตอบช้าเกินเวลา";
    else if (e instanceof Anthropic.APIError) msg = `AI ผิดพลาด (HTTP ${e.status})`;
    else if (e instanceof SyntaxError) msg = "อ่านผลจาก AI ไม่ได้";
    console.error("aiCheck", e);
    return { ok: false, error: msg, ms: Date.now() - t0 };
  }
}

export const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
export const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[,฿\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export type Verdict = "pass" | "suspect" | "fail" | "unchecked";
export type Evaluation = {
  verdict: Verdict; flags: string[]; soft: string[]; receipt_no: string; store: string; receipt_at: string | null;
  receipt_total: number | null; emocha_amount: number | null; emocha_items: Json[] | null; receipt_key: string | null;
  loose_key: string | null; suggested_points: number; bonus_points: number;
};

// โปรคะแนนพิเศษที่ใช้กับวันที่ซื้อนี้ (ไม่เห็นวันที่ซื้อ = ใช้วันนี้)
export function promosFor(cfg: Json, date: string): Json[] {
  const day = date || new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  return (Array.isArray(cfg.pointPromos) ? cfg.pointPromos : []).filter((p: Json) =>
    p && p.active !== false && num(p.multiplier) > 1 && (!p.from || day >= String(p.from)) && (!p.until || day <= String(p.until)));
}

// สินค้าบรรทัดนี้อยู่ในโปรไหน: AI บอก promo_id มา หรือชื่อสินค้ามีคำของโปร (เทียบแบบไม่สนช่องว่าง/ตัวพิมพ์)
function promoOf(item: Json, promos: Json[]): Json | null {
  const name = String(item.name || "").replace(/\s+/g, "").toLowerCase();
  let best: Json | null = null;
  for (const p of promos) {
    const hit = (item.promo_id && String(item.promo_id) === String(p.id)) ||
      (p.keywords || []).some((k: string) => {
        const w = String(k || "").replace(/\s+/g, "").toLowerCase();
        return w && name.includes(w);
      });
    if (hit && (!best || num(p.multiplier) > num(best.multiplier))) best = p;
  }
  return best;
}

export function evaluate(ai: AiResult, meta: ReturnType<typeof scanMetadata> | null, cfg: Json, extraFlags: string[]): Evaluation {
  const flags: string[] = [...extraFlags];
  const soft: string[] = []; // เหตุผลที่บอกลูกค้าได้
  const state: { verdict: Verdict } = { verdict: "pass" };
  const worsen = (v: "suspect" | "fail") => {
    if (state.verdict === "unchecked") return;
    if (v === "fail" || state.verdict === "pass") state.verdict = v;
  };
  if (meta) {
    if (meta.ai.length) { flags.push("ไฟล์มีร่องรอยเครื่องมือสร้างภาพ AI: " + meta.ai.join(", ")); worsen("suspect"); }
    if (meta.editors.length) { flags.push("ไฟล์ผ่านโปรแกรมแต่ง/สร้างเอกสาร: " + meta.editors.join(", ")); worsen("suspect"); }
  }
  const out: Evaluation = { verdict: "pass", flags, soft, receipt_no: "", store: "", receipt_at: null,
                            receipt_total: null, emocha_amount: null, emocha_items: null, receipt_key: null,
                            loose_key: null, suggested_points: 0, bonus_points: 0 };
  if (!ai.ok) {
    flags.unshift("AI ยังไม่ได้ตรวจ: " + ai.error);
    return { ...out, verdict: "unchecked" };
  }
  const d = ai.data;
  const items = Array.isArray(d.items) ? d.items : [];
  const emochaItems = items.filter((i: Json) => i && i.is_emocha);
  const emochaAmount = Math.max(num(d.emocha_amount), 0);
  const total = num(d.total_amount);
  const receiptNo = String(d.receipt_no || "").trim();
  const date = /^\d{4}-\d{2}-\d{2}/.test(String(d.purchased_at || "")) ? String(d.purchased_at).slice(0, 10) : "";
  const time = /T(\d{2}:\d{2})/.exec(String(d.purchased_at || ""))?.[1] || "12:00";

  if (!d.is_receipt) { flags.push("AI: ไฟล์นี้ไม่ใช่ใบเสร็จ"); soft.push("ระบบตรวจเบื้องต้นไม่พบว่าเป็นใบเสร็จ"); worsen("fail"); }
  else if (!d.is_7eleven) { flags.push("AI: ไม่ใช่ใบเสร็จของ 7-Eleven"); soft.push("ระบบตรวจเบื้องต้นไม่พบว่าเป็นใบเสร็จ 7-Eleven"); worsen("fail"); }
  if (d.is_receipt && emochaAmount <= 0) { flags.push("AI: ไม่พบสินค้าเอมโอชาในใบเสร็จ"); soft.push("ระบบตรวจเบื้องต้นไม่พบสินค้าเอมโอชาในใบเสร็จ"); worsen("fail"); }
  if (d.authenticity === "likely_fake") { flags.push("AI: น่าจะเป็นใบเสร็จปลอม/แก้ไข"); worsen("fail"); }
  else if (d.authenticity === "suspicious") { flags.push("AI: มีจุดน่าสงสัย ควรตรวจละเอียด"); worsen("suspect"); }
  for (const s of (d.tampering_signs || []).slice(0, 5)) { flags.push("ร่องรอยแก้ไข: " + s); worsen("suspect"); }
  for (const s of (d.ai_generated_signs || []).slice(0, 5)) { flags.push("ร่องรอยภาพ AI: " + s); worsen("suspect"); }
  if (d.readability === "unreadable") { flags.push("AI: อ่านใบเสร็จไม่ออก"); soft.push("รูปใบเสร็จไม่ชัด"); worsen("fail"); }
  else if (d.readability === "partial") { flags.push("AI: อ่านได้บางส่วน"); worsen("suspect"); }
  if (digits(receiptNo).length < 4) { flags.push("ไม่เห็นเลขที่ใบเสร็จ (ตรวจซ้ำอัตโนมัติไม่ได้)"); worsen("suspect"); }
  if (!date) { flags.push("ไม่เห็นวันที่ซื้อ"); worsen("suspect"); }
  if (total > 0 && emochaAmount > total + 0.01) { flags.push("ยอดสินค้าเอมโอชามากกว่ายอดรวม"); worsen("suspect"); }
  if (num(d.confidence) < 0.7) { flags.push(`AI มั่นใจต่ำ (${Math.round(num(d.confidence) * 100)}%)`); worsen("suspect"); }

  let receiptAt: string | null = null;
  if (date) {
    receiptAt = `${date}T${time}:00+07:00`;
    const at = new Date(receiptAt).getTime();
    const maxAge = Math.max(parseInt(String(cfg.maxReceiptAgeDays)) || 7, 1);
    // นับเป็นวันตามปฏิทินไทย: วันที่ส่ง - วันที่ซื้อ (ฐานข้อมูลใช้กติกาเดียวกันตัดสินไม่อนุมัติอัตโนมัติ)
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const ageDays = Math.round((Date.parse(today) - Date.parse(date)) / (24 * 3600 * 1000));
    if (cfg.liveFrom && date < String(cfg.liveFrom)) {
      flags.push("ซื้อก่อนวันเริ่มรับใบเสร็จ (" + cfg.liveFrom + ")"); soft.push("ใบเสร็จซื้อก่อนวันเริ่มกิจกรรม"); worsen("suspect");
    }
    if (Number.isNaN(at)) receiptAt = null;
    else if (at > Date.now() + 24 * 3600 * 1000) { flags.push("วันที่ในใบเสร็จอยู่ในอนาคต"); worsen("suspect"); }
    else if (ageDays > maxAge) {
      flags.push(`ใบเสร็จเก่ากว่า ${maxAge} วัน`); soft.push(`ใบเสร็จเก่ากว่า ${maxAge} วัน`); worsen("suspect");
    }
  }
  const rn = digits(receiptNo);
  const bahtPerPoint = Math.max(num(cfg.bahtPerPoint) || 30, 1);
  out.receipt_no = receiptNo;
  out.store = [String(d.store_name || "").trim(), d.store_code ? `(${d.store_code})` : ""].filter(Boolean).join(" ");
  out.receipt_at = receiptAt;
  out.receipt_total = total || null;
  out.emocha_amount = emochaAmount;
  // โปรคะแนนพิเศษ: คิดคะแนนจากยอดสินค้าในโปรก่อน (ปัดลง) แล้วค่อยคูณ — เช่น x2 สินค้าโปร 59 บาท = 1 คะแนน x2 = 2
  // คะแนนปกติคิดจากยอดสินค้าเอมโอชาทั้งใบ + โบนัส = คะแนนของยอดในโปร x (คูณ - 1) แยกตามตัวคูณ
  const promos = promosFor(cfg, date);
  const promoAmount = new Map<number, number>();
  out.emocha_items = emochaItems.map((i: Json) => {
    const { promo_id: _id, ...item } = i;
    const p = promoOf(i, promos);
    if (!p) return item;
    const m = num(p.multiplier);
    promoAmount.set(m, (promoAmount.get(m) || 0) + Math.max(num(i.amount), 0));
    return { ...item, promo: String(p.name), multiplier: m };
  });
  out.receipt_key = rn.length >= 4 && date ? `${digits(d.store_code) || "-"}|${rn}|${date}` : null;
  out.loose_key = rn.length >= 4 && date ? `${rn}|${date}` : null;
  out.bonus_points = 0;
  for (const [m, amount] of promoAmount) out.bonus_points += Math.floor(Math.floor(amount / bahtPerPoint) * (m - 1));
  out.suggested_points = Math.floor(emochaAmount / bahtPerPoint) + out.bonus_points;
  if (out.suggested_points <= 0 && emochaAmount > 0) { flags.push(`ยอดสินค้าเอมโอชาไม่ถึง ${bahtPerPoint} บาท`); worsen("suspect"); }
  return { ...out, verdict: state.verdict };
}

// ---------------------------------------------------------------------------
// แบบสอบถาม
// ---------------------------------------------------------------------------
export function validateSurvey(raw: string, questions: Json[]): { ok: true; answers: Json } | { ok: false; error: string } {
  let given: Json = {};
  try { given = JSON.parse(raw || "{}") || {}; } catch { return { ok: false, error: "แบบสอบถามไม่ถูกต้อง" }; }
  const answers: Json = {};
  for (const q of questions || []) {
    const v = given[q.id];
    const opts: string[] = q.options || [];
    if (q.type === "multi") {
      const arr = (Array.isArray(v) ? v : []).map(String).filter((x: string) => opts.includes(x));
      if (q.required && !arr.length) return { ok: false, error: `กรุณาตอบ: ${q.q}` };
      if (arr.length) answers[q.id] = [...new Set(arr)];
    } else {
      const s = typeof v === "string" && opts.includes(v) ? v : "";
      if (q.required && !s) return { ok: false, error: `กรุณาตอบ: ${q.q}` };
      if (s) answers[q.id] = s;
    }
  }
  return { ok: true, answers };
}

