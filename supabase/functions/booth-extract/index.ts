// booth-extract: อ่านบทสนทนาหน้าบูธ (ข้อความจากการแปลงเสียงในหน้า BoothCRM) แล้วให้ Claude ดึงข้อมูลลูกค้า
//
//   POST { transcript, branches[] } -> { success, data: { name, phone, branch, survey{...}, summary, speakerRoles[] }, model }
//   บทสนทนาจากคลิปเสียง (booth-transcribe) ขึ้นต้นแต่ละบรรทัดด้วย "ผู้พูด N:" — speakerRoles บอกว่าใครคือพนักงาน/ลูกค้า
//
// หน้าเว็บ: https://em-o-cha.github.io/BoothCRM/ (repo Em-O-Cha/BoothCRM) — ผลที่ได้เป็น "AI เดา" ให้พนักงานตรวจก่อนบันทึก
// deploy ด้วย verify_jwt = false (หน้าเว็บไม่มี JWT ของ Supabase) — ใช้ secret ANTHROPIC_API_KEY ตัวเดียวกับ loyalty
// รับเฉพาะคำขอจากหน้า BoothCRM และจำกัดความยาวบทสนทนา เพื่อไม่ให้ถูกใช้เรียก AI จากที่อื่นง่าย ๆ

import Anthropic from "npm:@anthropic-ai/sdk@0.129.0";

type Json = Record<string, any>;

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const MODEL = "claude-opus-5-5";
const ALLOWED_ORIGINS = new Set(["https://em-o-cha.github.io"]);
const MAX_TRANSCRIPT_CHARS = 20000;
const MAX_BRANCHES = 500;

const CORS = {
  "Access-Control-Allow-Origin": "https://em-o-cha.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

const SURVEY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["type", "hasProduct", "refill", "inquiry", "promoWish", "pastPromo", "goodPromo"],
  properties: {
    type: { type: "string", enum: ["คอร์ปอเรท", "แฟรนไชส์", ""] },
    hasProduct: { type: "string", enum: ["มี", "ไม่มี", ""] },
    refill: { type: "string", enum: ["บ่อย", "นาน ๆ ครั้ง", "ไม่ค่อยเติม", ""] },
    inquiry: { type: "string", enum: ["ถามบ่อย", "มีบ้าง", "ไม่มีคนถาม", ""] },
    promoWish: { type: "string" },
    pastPromo: { type: "string" },
    goodPromo: { type: "string" },
  },
};
const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "phone", "branch", "survey", "summary", "speakerRoles"],
  properties: {
    name: { type: "string" },
    phone: { type: "string" },
    branch: { type: "string" },
    survey: SURVEY_SCHEMA,
    summary: { type: "string" },
    speakerRoles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "role"],
        properties: { label: { type: "string" }, role: { type: "string", enum: ["พนักงาน", "ลูกค้า", "อื่น ๆ"] } },
      },
    },
  },
};

const SYSTEM_PROMPT = `You read conversations recorded at an Em-O-Cha trade-show booth in Thailand and fill in a lead form for the staff, who will check your answers before saving.

The transcript comes from speech recognition: one line per utterance. Lines from a recorded clip start with a speaker label such as "ผู้พูด 1:" (the labels come from automatic speaker separation and can occasionally be wrong); lines from live recognition have no labels and mix the booth staff and the customer. Thai words are often misheard or split, and numbers may appear as digits or as Thai number words. Background chatter from other people may be mixed in. Read it the way a person who was standing there would understand it.

Fill each field only from what was actually said. When something was not said, or you cannot tell, return an empty string — staff fill blanks themselves, and a wrong value is worse than a blank.

- name: the customer's name or nickname (not the staff member's), without honorifics such as คุณ/พี่/น้อง and without particles like ครับ/ค่ะ. If the name is said more than once with different spellings, use the clearest one.
- phone: the customer's phone number as digits only (e.g. 0812345678). Convert Thai number words (ศูนย์ หนึ่ง สอง … เก้า, นึง, สูญ). If the number was read back or corrected, use the final confirmed version. Thai mobile numbers have 10 digits starting 06/08/09; landlines 9 digits starting 02-07. If you heard fewer digits than that, still return what you heard.
- branch: the branch (shop) of Em-O-Cha that the customer owns or runs. If a list of known branch names is given, return the matching name from the list exactly as written, allowing for misheard spellings and sound-alike Thai letters; if nothing on the list matches, return the branch as you understood it. If the customer says they do not have a branch yet, return "ยังไม่มีสาขา".
- survey.type: "คอร์ปอเรท" if the customer's branch is company-owned/corporate, "แฟรนไชส์" if they are a franchisee.
- survey.hasProduct: whether their branch currently stocks Em-O-Cha products ("มี"/"ไม่มี"). The brand is often misheard (e.g. "เอ็ม โอชา", "M โอชา", "เอมโอ ชา").
- survey.refill: how often they reorder/restock Em-O-Cha products: "บ่อย", "นาน ๆ ครั้ง", or "ไม่ค่อยเติม".
- survey.inquiry: whether their customers ask about Em-O-Cha products: "ถามบ่อย", "มีบ้าง", or "ไม่มีคนถาม".
- survey.promoWish: what promotion/marketing help they want from Em-O-Cha, as a short Thai phrase.
- survey.pastPromo: promotions they ran before and how those went, as a short Thai phrase.
- survey.goodPromo: which promotions worked well for sales at their branch, as a short Thai phrase.
- speakerRoles: only when lines carry speaker labels — for each label, whether that speaker is the booth staff ("พนักงาน", the one presenting Em-O-Cha, asking the questions, offering samples), the customer ("ลูกค้า", the shop/branch owner being asked), or someone else ("อื่น ๆ"). Use the exact label text without the colon, e.g. "ผู้พูด 1". Return an empty array when the lines have no labels.
- summary: 1–3 short Thai sentences summarising what the customer wants or what was agreed (e.g. what to send, when to follow up). Empty if nothing useful was discussed.

Write all values in Thai, as the customer said them, cleaned of filler words.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "ใช้ POST เท่านั้น" }, 405);
  if (!ALLOWED_ORIGINS.has(req.headers.get("origin") || "")) return json({ success: false, error: "ไม่อนุญาต" }, 403);
  if (!ANTHROPIC_API_KEY) return json({ success: false, error: "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY" }, 500);

  let body: Json;
  try { body = await req.json(); } catch { return json({ success: false, error: "ข้อมูลไม่ถูกต้อง" }, 400); }
  const transcript = String(body.transcript ?? "").trim();
  if (!transcript) return json({ success: false, error: "ไม่มีบทสนทนา" }, 400);
  if (transcript.length > MAX_TRANSCRIPT_CHARS) return json({ success: false, error: "บทสนทนายาวเกินไป" }, 413);
  const branches = (Array.isArray(body.branches) ? body.branches : [])
    .map((b: unknown) => String(b ?? "").trim()).filter(Boolean).slice(0, MAX_BRANCHES);

  const userText = `Known branch names: ${branches.length ? branches.join(" | ") : "(none given)"}

<transcript>
${transcript}
</transcript>`;

  const t0 = Date.now();
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 });
    const params: Json = {
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: RESULT_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
    };
    // deno-lint-ignore no-explicit-any
    const response: any = await client.beta.messages.create(params as any);
    if (response.stop_reason === "refusal") return json({ success: false, error: "AI ปฏิเสธการอ่านบทสนทนานี้" });
    if (response.stop_reason === "max_tokens") return json({ success: false, error: "AI ตอบไม่จบ" });
    const text = (response.content || []).filter((b: Json) => b.type === "text").map((b: Json) => b.text).join("");
    const data = JSON.parse(text);
    data.phone = String(data.phone || "").replace(/\D/g, "");
    return json({ success: true, data, model: String(response.model || MODEL), ms: Date.now() - t0 });
  } catch (e) {
    let msg = String(e);
    if (e instanceof Anthropic.AuthenticationError) msg = "ANTHROPIC_API_KEY ไม่ถูกต้อง";
    else if (e instanceof Anthropic.RateLimitError) msg = "AI ถูกจำกัดการใช้งานชั่วคราว";
    else if (e instanceof Anthropic.APIConnectionTimeoutError) msg = "AI ตอบช้าเกินเวลา";
    else if (e instanceof Anthropic.APIError) msg = `AI ผิดพลาด (HTTP ${e.status})`;
    else if (e instanceof SyntaxError) msg = "อ่านผลจาก AI ไม่ได้";
    console.error("booth-extract", e);
    return json({ success: false, error: msg, ms: Date.now() - t0 });
  }
});
