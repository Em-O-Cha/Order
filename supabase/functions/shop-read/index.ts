// shop-read: ให้หน้าร้านอ่านข้อมูลจาก Supabase (สำเนาของชีต) แทนการถาม Apps Script
//
// คำขอ: POST (body เป็น JSON แบบ text/plain เพื่อไม่ต้องมี preflight) หรือ GET ?action=&idToken=
//   { "action": "getMyOrderHistory", "idToken": "<LINE ID token>" }
// คำตอบ: รูปแบบเดียวกับ Apps Script ({ success, results } หรือ { success: false, error })
//
// ตรวจโทเคน LINE กับ LINE เสมอ แล้วใช้ LINE UID จากโทเคนเท่านั้น (ไม่รับ UID จากหน้าเว็บ)
// deploy ด้วย verify_jwt = false เพราะหน้าร้านไม่มี JWT ของ Supabase มีแต่โทเคน LINE

const LIFF_CHANNEL_ID = "2010892131";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

// โทเคนที่ตรวจผ่านแล้ว จำไว้จนหมดอายุ (อยู่ในหน่วยความจำของ instance เท่านั้น)
const verified = new Map<string, { sub: string; exp: number }>();

async function verifyLineIdToken(idToken: string): Promise<{ sub?: string; error?: string }> {
  const hit = verified.get(idToken);
  if (hit && hit.exp * 1000 > Date.now()) return { sub: hit.sub };

  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: LIFF_CHANNEL_ID }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.sub) {
    return { error: String(body.error_description || body.error || `HTTP ${res.status}`) };
  }
  if (verified.size > 1000) verified.clear();
  verified.set(idToken, { sub: body.sub, exp: Number(body.exp) || 0 });
  return { sub: body.sub };
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

async function readRequest(req: Request): Promise<Record<string, string>> {
  if (req.method === "GET") return Object.fromEntries(new URL(req.url).searchParams);
  const text = await req.text();
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const params = await readRequest(req);
    const action = String(params.action || "");
    const idToken = String(params.idToken || "").trim();

    // ตรวจว่าฟังก์ชันต่อฐานข้อมูลได้ (ไม่แตะข้อมูลลูกค้า)
    if (action === "health") {
      await rpc("shop_order_history", { p_line_uid: "" });
      return json({ success: true });
    }
    if (action !== "getMyOrderHistory") {
      return json({ success: false, error: "ไม่รู้จัก action: " + action });
    }
    if (!idToken) return json({ success: false, error: "ไม่พบโทเคน LINE" });

    const who = await verifyLineIdToken(idToken);
    if (!who.sub) return json({ success: false, error: "ยืนยันตัวตนกับ LINE ไม่สำเร็จ (" + who.error + ")" });

    return json(await rpc("shop_order_history", { p_line_uid: who.sub }));
  } catch (e) {
    console.error(e);
    return json({ success: false, error: String(e) }, 500);
  }
});
