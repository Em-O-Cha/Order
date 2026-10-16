// booth-stats: ข้อมูลสำหรับ Dashboard แสดงความคิดเห็นหน้าบูธ (https://em-o-cha.github.io/BoothCRM/dashboard.html)
//
//   GET -> { success, updatedAt, keys[], rows: [[เวลา ISO, ช่องทาง "qr"|"line", งาน, ...คำตอบตาม keys]] }
//   อ่านจากชีต BoothCRM ผ่าน Apps Script action "rows" (../_shared/booth_sheet.ts)
//   ส่งออกเฉพาะเวลา ช่องทาง ชื่องาน และคำตอบ — ไม่มีชื่อ เบอร์ สาขา ข้อความ หรือชื่อพนักงาน
//
// deploy ด้วย verify_jwt = false · รับเฉพาะจากหน้า BoothCRM · เก็บผลไว้ในหน่วยความจำ 30 วินาที กันชีตถูกเรียกถี่

import { sheet } from "../_shared/booth_sheet.ts";

const ALLOWED_ORIGINS = new Set(["https://em-o-cha.github.io"]);
const KEYS = ["type", "hasProduct", "noReason", "refill", "inquiry", "promoWish", "goodPromo"];
const QR_STAFF = "ลูกค้า (QR)";
const CACHE_MS = 30_000;

const CORS = {
  "Access-Control-Allow-Origin": "https://em-o-cha.github.io",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

let cache: { at: number; body: unknown } | null = null;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ success: false, error: "ใช้ GET เท่านั้น" }, 405);
  if (!ALLOWED_ORIGINS.has(req.headers.get("origin") || "")) return json({ success: false, error: "ไม่อนุญาต" }, 403);
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  // "fresh" (the page's refresh button) still reuses anything newer than 5 s, so it can't hammer the sheet
  if (cache && Date.now() - cache.at < (fresh ? 5_000 : CACHE_MS)) return json(cache.body);
  try {
    const raw: string[][] = await sheet("rows");
    // sheet row: [created, staffName, event, ...answers in KEYS order]
    // ⚡ (16/10/69) every customer counts, even with no answers yet (the dashboard shows them as "รอเติม")
    const rows = (Array.isArray(raw) ? raw : [])
      .map((r) => [String(r[0] || ""), r[1] === QR_STAFF ? "qr" : "line", String(r[2] || ""), ...KEYS.map((_, i) => String(r[3 + i] || ""))]);
    const body = { success: true, updatedAt: new Date().toISOString(), keys: KEYS, rows };
    cache = { at: Date.now(), body };
    return json(body);
  } catch (e) {
    console.error("booth-stats", e);
    if (cache) return json({ ...(cache.body as Record<string, unknown>), stale: true });
    return json({ success: false, error: "อ่านข้อมูลจาก Google Sheet ไม่สำเร็จ" }, 502);
  }
});
