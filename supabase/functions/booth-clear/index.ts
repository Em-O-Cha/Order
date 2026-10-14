// booth-clear: ล้างข้อมูลลูกค้าทั้งหมดในชีต BoothCRM (แท็บ "ลูกค้า" — หัวคอลัมน์และแท็บ "พนักงาน" ยังอยู่)
//
//   POST + header x-clear-token -> { success, cleared }
//   เรียกโดย pg_cron ตามเวลาที่ผู้ใช้สั่ง (migration 20261014010000_booth_clear_schedule.sql) ไม่ได้เปิดให้หน้าเว็บเรียก
//   token เก็บใน Supabase Vault (booth_clear_token) ตรวจผ่าน public.booth_clear_token_ok ด้วย service role
//
// deploy ด้วย verify_jwt = false (pg_cron ไม่มี JWT) — ไม่มี token ที่ถูกต้อง = ปฏิเสธ

import { sheet } from "../_shared/booth_sheet.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

async function tokenOk(token: string): Promise<boolean> {
  if (!token || !SUPABASE_URL || !SERVICE_KEY) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/booth_clear_token_ok`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token }),
  });
  return res.ok && (await res.json()) === true;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, error: "ใช้ POST เท่านั้น" }, 405);
  if (!(await tokenOk(req.headers.get("x-clear-token") || ""))) return json({ success: false, error: "ไม่อนุญาต" }, 403);
  try {
    const r = await sheet("clear", { confirm: "CLEAR_ALL_LEADS" });
    console.log("booth-clear done", JSON.stringify(r));
    return json({ success: true, cleared: r?.cleared ?? 0 });
  } catch (e) {
    console.error("booth-clear", e);
    return json({ success: false, error: String((e as Error)?.message || e) }, 502);
  }
});
