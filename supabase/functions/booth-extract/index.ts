// booth-extract: อ่านบทสนทนาหน้าบูธ (ข้อความจากการแปลงเสียงในหน้า BoothCRM) แล้วให้ Claude ดึงข้อมูลลูกค้า
//
//   POST { transcript, branches[] } -> { success, data: { name, phone, branch, survey{...}, summary, speakerRoles[] }, model }
//   บทสนทนาที่มีป้ายคนพูด ("ผู้พูด N:") ได้ speakerRoles บอกว่าใครคือพนักงาน/ลูกค้า
//
// หน้าเว็บ: https://em-o-cha.github.io/BoothCRM/ (repo Em-O-Cha/BoothCRM) — ผลที่ได้เป็น "AI เดา" ให้พนักงานตรวจก่อนบันทึก
// deploy ด้วย verify_jwt = false (หน้าเว็บไม่มี JWT ของ Supabase) — ใช้ secret ANTHROPIC_API_KEY ตัวเดียวกับ loyalty
// รับเฉพาะคำขอจากหน้า BoothCRM และจำกัดความยาวบทสนทนา เพื่อไม่ให้ถูกใช้เรียก AI จากที่อื่นง่าย ๆ
// prompt + schema อยู่ที่ ../_shared/booth_ai.ts (ใช้ร่วมกับ booth-line)

import { extractLead, type Json, MAX_TRANSCRIPT_CHARS } from "../_shared/booth_ai.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const ALLOWED_ORIGINS = new Set(["https://em-o-cha.github.io"]);
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "ใช้ POST เท่านั้น" }, 405);
  if (!ALLOWED_ORIGINS.has(req.headers.get("origin") || "")) return json({ success: false, error: "ไม่อนุญาต" }, 403);

  let body: Json;
  try { body = await req.json(); } catch { return json({ success: false, error: "ข้อมูลไม่ถูกต้อง" }, 400); }
  const transcript = String(body.transcript ?? "").trim();
  if (!transcript) return json({ success: false, error: "ไม่มีบทสนทนา" }, 400);
  if (transcript.length > MAX_TRANSCRIPT_CHARS) return json({ success: false, error: "บทสนทนายาวเกินไป" }, 413);
  const branches = (Array.isArray(body.branches) ? body.branches : [])
    .map((b: unknown) => String(b ?? "").trim()).filter(Boolean).slice(0, MAX_BRANCHES);

  const r = await extractLead(ANTHROPIC_API_KEY, transcript, branches);
  return r.ok ? json({ success: true, data: r.data, model: r.model, ms: r.ms }) : json({ success: false, error: r.error, ms: r.ms });
});
