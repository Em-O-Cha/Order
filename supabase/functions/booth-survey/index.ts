// booth-survey: ลูกค้าหน้าบูธสแกน QR แล้วกด "แสดงความคิดเห็น" เอง — รับคำตอบจากหน้า survey.html แล้วเพิ่มเป็นแถวในชีต BoothCRM
//
//   POST { event, name, branch, survey{ type, hasProduct, noReason, refill, inquiry, promoWish, goodPromo }, website }
//     -> { success }
//   ผู้บันทึกในชีต = "ลูกค้า (QR)" · ไม่ถามเบอร์โทร · ทุกข้อไม่บังคับ แต่ต้องมีอย่างน้อย 1 ข้อ
//
// หน้าเว็บ: https://em-o-cha.github.io/BoothCRM/survey.html (repo Em-O-Cha/BoothCRM)
// deploy ด้วย verify_jwt = false (ลูกค้าไม่มี JWT) — ใช้ secrets ของชีตตัวเดียวกับ booth-line (../_shared/booth_sheet.ts)
// ไม่เก็บอะไรใน Supabase · รับเฉพาะจากหน้า BoothCRM, จำกัดความยาวทุกช่อง และทิ้งคำขอที่กรอกช่องดักบอท (website)

import type { Json } from "../_shared/booth_ai.ts";
import { sheet } from "../_shared/booth_sheet.ts";

const ALLOWED_ORIGINS = new Set(["https://em-o-cha.github.io"]);
const SURVEY_KEYS = ["type", "hasProduct", "noReason", "refill", "inquiry", "promoWish", "goodPromo"];
const STAFF_NAME = "ลูกค้า (QR)";

const CORS = {
  "Access-Control-Allow-Origin": "https://em-o-cha.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}
// Plain one-line text; a leading = + - @ would turn into a formula in Google Sheets.
function clean(v: unknown, max: number): string {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().replace(/^[=+\-@]+/, "").slice(0, max);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "ใช้ POST เท่านั้น" }, 405);
  if (!ALLOWED_ORIGINS.has(req.headers.get("origin") || "")) return json({ success: false, error: "ไม่อนุญาต" }, 403);

  let body: Json;
  try { body = await req.json(); } catch { return json({ success: false, error: "ข้อมูลไม่ถูกต้อง" }, 400); }
  if (body.website) return json({ success: true });   // bot filled the hidden field: pretend it worked

  const sv: Json = body.survey && typeof body.survey === "object" ? body.survey : {};
  const survey = Object.fromEntries(SURVEY_KEYS.map((k) => [k, clean(sv[k], 300)]));
  const lead = {
    staffName: STAFF_NAME, event: clean(body.event, 80), name: clean(body.name, 80), branch: clean(body.branch, 80),
    survey, rawText: "แสดงความคิดเห็นผ่าน QR",
  };
  if (!lead.name && !lead.branch && !Object.values(survey).some(Boolean)) return json({ success: false, error: "ยังไม่ได้ตอบ" }, 400);

  try {
    await sheet("append", { lead });
    return json({ success: true });
  } catch (e) {
    console.error("booth-survey", e);
    return json({ success: false, error: "บันทึกไม่สำเร็จ ลองอีกครั้ง" }, 502);
  }
});
