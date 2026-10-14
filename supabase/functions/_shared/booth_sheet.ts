// booth_sheet: ส่งคำสั่งไป Apps Script Web App ของชีต BoothCRM (โค้ด: repo Em-O-Cha/BoothCRM, apps-script/BoothCRM.gs)
// ใช้ร่วมกันโดย booth-line (LINE OA ของพนักงาน) และ booth-survey (ลูกค้าสแกน QR แสดงความคิดเห็น)
// secrets: BOOTH_SHEET_URL (URL เว็บแอป), BOOTH_SHEET_SECRET (ต้องตรงกับ SECRET ใน Apps Script)

import type { Json } from "./booth_ai.ts";

const SHEET_URL = Deno.env.get("BOOTH_SHEET_URL") || "";
const SHEET_SECRET = Deno.env.get("BOOTH_SHEET_SECRET") || "";

type SheetReply = { ok: true; result: any } | { ok: false; error: string; retry: boolean };

async function sheetOnce(action: string, args: Json): Promise<SheetReply> {
  let res: Response;
  try {
    res = await fetch(SHEET_URL, {
      method: "POST", headers: { "Content-Type": "application/json" }, redirect: "follow", signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({ action, secret: SHEET_SECRET, ...args }),
    });
  } catch (e) {
    console.error("booth sheet", action, e);
    return { ok: false, error: "ติดต่อ Google Sheet ไม่ได้", retry: true };
  }
  const text = await res.text();
  let j: Json;
  try { j = JSON.parse(text); } catch {
    // Apps Script reports an uncaught error (e.g. a lock timeout) as an HTML page; keep its readable text.
    const plain = text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    console.error("booth sheet", action, res.status, res.url.replace(/\?.*/, ""), plain.slice(0, 500));
    const why = plain.match(/(Exception|Error|ข้อผิดพลาด)[^.]{0,120}/)?.[0];
    return { ok: false, error: `Google Sheet ตอบไม่ถูกรูปแบบ (HTTP ${res.status}${why ? `: ${why}` : ""})`, retry: true };
  }
  if (!j.success) return { ok: false, error: `Google Sheet: ${j.error}`, retry: false };
  // doGet's reply (no "result") means the POST was turned into a GET somewhere along the redirect.
  if (!("result" in j)) {
    console.error("booth sheet", action, "reply without result", text.slice(0, 200));
    return { ok: false, error: "Google Sheet ตอบผิดคำสั่ง", retry: true };
  }
  return { ok: true, result: j.result };
}

// Apps Script answers a POST with a redirect to a one-time result page, and now and then that hop fails
// (HTTP 404, an HTML page, or doGet's reply), so a failed call is tried once more. An append is retried only
// after checking the first attempt didn't land, so a slow sheet doesn't get the same customer twice.
export async function sheet(action: string, args: Json = {}): Promise<any> {
  if (!SHEET_URL) throw new Error("ยังไม่ได้ตั้งค่า BOOTH_SHEET_URL");
  let r = await sheetOnce(action, args);
  // An append can only be retried when the first attempt can be looked up (LINE leads); QR answers aren't, so a
  // slow sheet never gets the same answer twice.
  if (!r.ok && r.retry && action !== "delete" && (action !== "append" || args.lead?.lineUserId)) {
    await new Promise((ok) => setTimeout(ok, 1500));
    if (action === "append" && args.lead?.lineUserId) {
      const got = await sheetOnce("latest", { lineUserId: args.lead.lineUserId, withinMinutes: 5 });
      if (got.ok && got.result && got.result.rawText === args.lead.rawText) return got.result;
    }
    r = await sheetOnce(action, args);
    console.warn("booth sheet retry", action, r.ok ? "ok" : r.error);
  }
  if (!r.ok) throw new Error(r.error);
  return r.result;
}
