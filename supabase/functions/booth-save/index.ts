// booth-save: หน้าพนักงาน BoothCRM (index.html) ส่งรายชื่อที่บันทึก/แก้/ลบในเครื่อง เข้าชีต BoothCRM ให้หน้าสรุปนับด้วย
//
//   POST { op: "upsert", lead: { id, created, staff, event, name, phone, branch, survey{...}, details, flags[] } } -> { success }
//   POST { op: "delete", id } -> { success }
//   id = รหัสในเครื่อง — ชีตเก็บเป็น "W" + id: ส่งซ้ำ (ลองใหม่/แก้ไข/ส่งทั้งหมด) แก้แถวเดิม ไม่เพิ่มแถวซ้ำ
//   ลบได้เฉพาะแถวที่มาจากหน้าพนักงาน (รหัส W…) — แถวจาก LINE/QR ลบผ่านทางนี้ไม่ได้
//
// หน้าเว็บ: https://em-o-cha.github.io/BoothCRM/ (repo Em-O-Cha/BoothCRM) · ชีต: Apps Script action upsert/delete (../_shared/booth_sheet.ts)
// deploy ด้วย verify_jwt = false · รับเฉพาะจากหน้า BoothCRM · จำกัดความยาวทุกช่อง · ไม่เก็บอะไรใน Supabase

import type { Json } from "../_shared/booth_ai.ts";
import { sheet } from "../_shared/booth_sheet.ts";

const ALLOWED_ORIGINS = new Set(["https://em-o-cha.github.io"]);
// same order as the sheet; "type" is no longer asked but older leads on a device may still carry it
const SURVEY_KEYS = ["type", "hasProduct", "noReason", "refill", "inquiry", "promoWish", "goodPromo"];
const LOCAL_ID = /^[A-Za-z0-9]{4,40}$/;

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

  try {
    if (body.op === "delete") {
      const id = String(body.id || "");
      if (!LOCAL_ID.test(id)) return json({ success: false, error: "รหัสไม่ถูกต้อง" }, 400);
      await sheet("delete", { id: "W" + id, lineUserId: "" });
      return json({ success: true });
    }
    if (body.op !== "upsert") return json({ success: false, error: "ไม่รู้จักคำสั่ง" }, 400);

    const l: Json = body.lead && typeof body.lead === "object" ? body.lead : {};
    const id = String(l.id || "");
    if (!LOCAL_ID.test(id)) return json({ success: false, error: "รหัสไม่ถูกต้อง" }, 400);
    const sv: Json = l.survey && typeof l.survey === "object" ? l.survey : {};
    const created = Number(l.created);
    const lead = {
      id: "W" + id,
      created: Number.isFinite(created) && created > 0 ? new Date(created).toISOString() : "",
      staffName: clean(l.staff, 60) || "พนักงาน (หน้าเว็บ)",
      event: clean(l.event, 80), name: clean(l.name, 80), phone: clean(l.phone, 20), branch: clean(l.branch, 80),
      survey: Object.fromEntries(SURVEY_KEYS.map((k) => [k, clean(sv[k], 300)])),
      summary: clean(l.details, 1000),
      rawText: "บันทึกจากหน้าพนักงาน",
      note: clean(Array.isArray(l.flags) ? l.flags.join("; ") : "", 300),
    };
    await sheet("upsert", { lead });
    return json({ success: true });
  } catch (e) {
    console.error("booth-save", e);
    return json({ success: false, error: "ส่งเข้าชีตไม่สำเร็จ ระบบจะลองใหม่เอง" }, 502);
  }
});
