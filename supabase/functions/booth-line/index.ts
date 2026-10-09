// booth-line: LINE OA สำหรับพนักงานบูธ — ส่งข้อความ (พิมพ์หรือพิมพ์ด้วยเสียง) หรือคลิปเสียง แล้ว Claude แยกข้อมูลลูกค้า เก็บลง Google Sheet
//
// LINE webhook -> ตรวจลายเซ็น -> Claude (../_shared/booth_ai.ts) -> Apps Script Web App ของชีต BoothCRM -> ตอบกลับใน LINE
// ฟังก์ชันนี้เป็นแค่ทางผ่าน ไม่เก็บข้อมูลลูกค้าใน Supabase (ข้อมูลอยู่ในชีตอย่างเดียว) — โค้ด Apps Script: repo Em-O-Cha/BoothCRM
//
// คำสั่งในแชท
//   ข้อความทั่วไป        -> ลูกค้าใหม่ 1 คน
//   คลิปเสียง            -> แปลงเป็นข้อความแยกคนพูด (ElevenLabs, ../_shared/booth_stt.ts) แล้วเป็นลูกค้าใหม่ 1 คน
//                           (ต้องมี ELEVENLABS_API_KEY ไม่มี = ตอบให้ส่งเป็นข้อความแทน) — ไม่เก็บไฟล์เสียง
//   + ข้อความ / เพิ่ม …  -> ต่อท้ายลูกค้าคนล่าสุดของตัวเอง (ภายใน 2 ชม.) แล้วให้ AI อ่านใหม่ทั้งหมด
//   ลบ                   -> ลบลูกค้าคนล่าสุดของตัวเอง (ภายใน 24 ชม.)
//   ล่าสุด               -> ดูลูกค้าคนล่าสุด
//   งาน: ชื่องาน         -> ตั้งชื่องานให้ลูกค้าที่ส่งต่อจากนี้ ("งาน:" เปล่า ๆ = ล้าง)
//   ชีต                  -> ลิงก์ Google Sheet
//   วิธีใช้              -> คำอธิบาย
//
// deploy ด้วย verify_jwt = false (LINE เรียกเข้ามาเอง) — secrets: BOOTH_LINE_CHANNEL_SECRET, BOOTH_LINE_ACCESS_TOKEN,
// BOOTH_SHEET_URL (URL เว็บแอป Apps Script), BOOTH_SHEET_SECRET (ต้องตรงกับ SECRET ใน Apps Script), ANTHROPIC_API_KEY,
// ELEVENLABS_API_KEY (ไม่บังคับ — เปิดรับคลิปเสียง)

import { extractLead, type Json } from "../_shared/booth_ai.ts";
import { BRAND_KEYTERMS, transcribe } from "../_shared/booth_stt.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const LINE_SECRET = Deno.env.get("BOOTH_LINE_CHANNEL_SECRET") || "";
const LINE_TOKEN = Deno.env.get("BOOTH_LINE_ACCESS_TOKEN") || "";
const SHEET_URL = Deno.env.get("BOOTH_SHEET_URL") || "";
const SHEET_SECRET = Deno.env.get("BOOTH_SHEET_SECRET") || "";
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") || "";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const APPEND_WINDOW_MIN = 120;
const DELETE_WINDOW_MIN = 24 * 60;
const SURVEY_LABELS: [string, string][] = [
  ["type", "คอร์ปอเรท/แฟรนไชส์"], ["hasProduct", "มีสินค้าเอมโอชา"], ["refill", "เติมสินค้า"], ["inquiry", "ลูกค้ามาถาม"],
  ["promoWish", "อยากให้ช่วยโปรโมต"], ["pastPromo", "โปรที่เคยทำ"], ["goodPromo", "โปรที่ได้ผลดี"],
];

const HELP = `วิธีใช้ BoothCRM 📝
• คุยกับลูกค้าเสร็จ พิมพ์หรือกดไมค์บนคีย์บอร์ดพูดสรุปแล้วส่ง เช่น
  “คุณวีระ 089 123 4567 แฟรนไชส์สาขารังสิต ขายดีเติมทุกอาทิตย์ อยากได้ป้ายหน้าร้าน”
  AI จะแยก ชื่อ เบอร์ สาขา และแบบสอบถาม ลง Google Sheet ให้
• ส่ง “+ ข้อความ” เพื่อเพิ่ม/แก้ข้อมูลลูกค้าคนล่าสุด
• “ลบ” ลบลูกค้าคนล่าสุด · “ล่าสุด” ดูคนล่าสุด
• “งาน: ชื่องาน” ตั้งชื่องาน · “ชีต” ขอลิงก์ Google Sheet
• ส่งคลิปเสียงได้ด้วย (ถ้าเปิดใช้) — ระบบถอดเสียงและแยกคนพูดให้`;

function background(p: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(p);
}

async function validSignature(body: string, sig: string | null): Promise<boolean> {
  if (!sig) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(LINE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function lineApi(method: string, path: string, body?: Json): Promise<any> {
  const res = await fetch(`https://api.line.me${path}`, {
    method,
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`LINE ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// Reply with the event's token; if that fails (e.g. a long clip took too long and the token expired), push instead.
async function respond(ev: Json, text: string) {
  const messages = [{ type: "text", text: text.slice(0, 4900) }];
  try {
    await lineApi("POST", "/v2/bot/message/reply", { replyToken: ev.replyToken, messages });
  } catch (e) {
    const to = ev.source?.groupId || ev.source?.roomId || ev.source?.userId;
    if (!to) throw e;
    console.warn("booth-line reply failed, pushing", e);
    await lineApi("POST", "/v2/bot/message/push", { to, messages });
  }
}

// Typing dots while Claude reads (1:1 chats only; failures don't matter).
function showLoading(source: Json) {
  if (source?.type !== "user" || !source.userId) return;
  lineApi("POST", "/v2/bot/chat/loading/start", { chatId: source.userId, loadingSeconds: 30 }).catch(() => {});
}

async function displayName(source: Json): Promise<string> {
  try {
    const uid = source.userId;
    const path = source.type === "group" ? `/v2/bot/group/${source.groupId}/member/${uid}`
      : source.type === "room" ? `/v2/bot/room/${source.roomId}/member/${uid}`
      : `/v2/bot/profile/${uid}`;
    return String((await lineApi("GET", path)).displayName || "");
  } catch { return ""; }
}

type SheetReply = { ok: true; result: any } | { ok: false; error: string; retry: boolean };

async function sheetOnce(action: string, args: Json): Promise<SheetReply> {
  let res: Response;
  try {
    res = await fetch(SHEET_URL, {
      method: "POST", headers: { "Content-Type": "application/json" }, redirect: "follow", signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({ action, secret: SHEET_SECRET, ...args }),
    });
  } catch (e) {
    console.error("booth-line sheet", action, e);
    return { ok: false, error: "ติดต่อ Google Sheet ไม่ได้", retry: true };
  }
  const text = await res.text();
  let j: Json;
  try { j = JSON.parse(text); } catch {
    console.error("booth-line sheet", action, res.status, res.url.replace(/\?.*/, ""), text.slice(0, 200));
    return { ok: false, error: `Google Sheet ตอบไม่ถูกรูปแบบ (HTTP ${res.status})`, retry: true };
  }
  if (!j.success) return { ok: false, error: `Google Sheet: ${j.error}`, retry: false };
  // doGet's reply (no "result") means the POST was turned into a GET somewhere along the redirect.
  if (!("result" in j)) {
    console.error("booth-line sheet", action, "reply without result", text.slice(0, 200));
    return { ok: false, error: "Google Sheet ตอบผิดคำสั่ง", retry: true };
  }
  return { ok: true, result: j.result };
}

// Apps Script answers a POST with a redirect to a one-time result page, and now and then that hop fails
// (HTTP 404, an HTML page, or doGet's reply), so a failed call is tried once more. An append is retried only
// after checking the first attempt didn't land, so a slow sheet doesn't get the same customer twice.
async function sheet(action: string, args: Json = {}): Promise<any> {
  if (!SHEET_URL) throw new Error("ยังไม่ได้ตั้งค่า BOOTH_SHEET_URL");
  let r = await sheetOnce(action, args);
  if (!r.ok && r.retry && action !== "delete") {
    await new Promise((ok) => setTimeout(ok, 1500));
    if (action === "append" && args.lead?.lineUserId) {
      const got = await sheetOnce("latest", { lineUserId: args.lead.lineUserId, withinMinutes: 5 });
      if (got.ok && got.result && got.result.rawText === args.lead.rawText) return got.result;
    }
    r = await sheetOnce(action, args);
    console.warn("booth-line sheet retry", action, r.ok ? "ok" : r.error);
  }
  if (!r.ok) throw new Error(r.error);
  return r.result;
}

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
function fmtPhone(d: string): string {
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (/^0\d{8}$/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return d;
}
const validPhone = (d: string) => /^0[689]\d{8}$/.test(d) || /^0[2-7]\d{7}$/.test(d);

function fieldsFrom(d: Json): Json {
  const sv = d.survey || {};
  return {
    name: String(d.name || ""), phone: fmtPhone(digits(d.phone)), branch: String(d.branch || ""),
    summary: String(d.summary || ""),
    survey: Object.fromEntries(SURVEY_LABELS.map(([k]) => [k, String(sv[k] || "")])),
  };
}

function relabel(text: string, roles: unknown): string {
  const list = (Array.isArray(roles) ? roles : []).filter((r: Json) => r?.label && r?.role) as Json[];
  if (!list.length) return text;
  return text.split("\n").map((l) => {
    for (const r of list) if (l.startsWith(`${r.label}:`)) return `${r.role}:${l.slice(String(r.label).length + 1)}`;
    return l;
  }).join("\n");
}

function card(title: string, lead: Json): string {
  const L = [title, `👤 ชื่อ: ${lead.name || "—"}`, `📞 เบอร์: ${lead.phone || "—"}`, `🏪 สาขา: ${lead.branch || "—"}`];
  const sv = lead.survey || {};
  const rows = SURVEY_LABELS.filter(([k]) => sv[k]).map(([k, label]) => `• ${label}: ${sv[k]}`);
  if (rows.length) L.push("📋 แบบสอบถาม", ...rows);
  if (lead.summary) L.push(`📝 สรุป: ${lead.summary}`);
  const missing = [!lead.name && "ชื่อ", !lead.phone && "เบอร์"].filter(Boolean);
  if (missing.length) L.push(`⚠ ยังไม่มี: ${missing.join(", ")}`);
  const d = digits(lead.phone);
  if (d && !validPhone(d)) L.push(`⚠ เบอร์มี ${d.length} หลัก ตรวจอีกครั้ง`);
  if (lead.note) L.push(`⚠ ${lead.note}`);
  if (lead.event) L.push(`งาน: ${lead.event}`);
  L.push("—", "เพิ่ม/แก้: ส่ง “+ ข้อความ” · ลบ: พิมพ์ “ลบ”");
  return L.join("\n");
}

async function newLead(source: Json, uid: string, text: string): Promise<string> {
  const [name, ai] = await Promise.all([displayName(source), extractLead(ANTHROPIC_API_KEY, text, [])]);
  const staff = await sheet("staff", { lineUserId: uid, displayName: name, event: null });
  const lead = {
    lineUserId: uid, staffName: staff.displayName || name, event: staff.event || "",
    rawText: ai.ok ? relabel(text, ai.data.speakerRoles) : text,
    ...(ai.ok ? fieldsFrom(ai.data) : {}), note: ai.ok ? "" : `AI อ่านไม่สำเร็จ (${ai.error}) — เก็บข้อความไว้แล้ว`,
  };
  return card("✅ บันทึกลูกค้าแล้ว", await sheet("append", { lead }));
}

async function appendTo(source: Json, uid: string, addition: string): Promise<string> {
  const latest = await sheet("latest", { lineUserId: uid, withinMinutes: APPEND_WINDOW_MIN });
  if (!latest) return "ไม่พบลูกค้าที่คุณส่งใน 2 ชม. ที่ผ่านมา จึงบันทึกเป็นลูกค้าใหม่\n\n" + await newLead(source, uid, addition);
  const rawText = `${latest.rawText}\n${addition}`.trim();
  const ai = await extractLead(ANTHROPIC_API_KEY, rawText, []);
  const lead = { rawText: ai.ok ? relabel(rawText, ai.data.speakerRoles) : rawText, ...(ai.ok ? fieldsFrom(ai.data) : {}), note: ai.ok ? "" : `AI อ่านไม่สำเร็จ (${ai.error}) — เก็บข้อความไว้แล้ว` };
  return card("✏️ อัปเดตลูกค้าแล้ว", await sheet("update", { id: latest.id, lead }));
}

// A voice clip sent to the OA: fetch it from LINE, transcribe with speakers separated, then file it like a note.
async function audioLead(ev: Json, uid: string): Promise<string> {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${ev.message.id}/content`, {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  if (!res.ok) throw new Error(`ดึงคลิปเสียงจาก LINE ไม่ได้ (HTTP ${res.status})`);
  const audio = await res.blob();
  if (audio.size > MAX_AUDIO_BYTES) return "🎧 คลิปยาวเกินไป (เกิน 25 MB) — แบ่งส่งเป็นช่วงสั้น ๆ นะคะ";
  const stt = await transcribe(ELEVENLABS_API_KEY, audio, `line-${ev.message.id}.m4a`, BRAND_KEYTERMS);
  if (!stt.ok) throw new Error(stt.error);
  if (!stt.lines.length) return "🎧 ไม่ได้ยินเสียงพูดในคลิปนี้ ลองอัดใหม่ใกล้ไมค์อีกครั้งนะคะ";
  // One voice = a staff note; several voices = a recorded conversation, kept with speaker labels for Claude.
  const many = new Set(stt.lines.map((l) => l.speaker)).size > 1;
  const text = stt.lines.map((l) => (many ? `${l.speaker}: ${l.text}` : l.text)).join("\n");
  const secs = Math.round(stt.duration ?? (Number(ev.message.duration) || 0) / 1000);
  try {
    return `🎧 ถอดเสียง ${secs} วินาทีแล้ว${many ? " (แยกคนพูดให้แล้ว)" : ""}\n\n` + await newLead(ev.source, uid, text);
  } catch (e) {
    // Hand the transcript back so staff can resend it as text instead of transcribing the clip again.
    console.error("booth-line audio save", e);
    return `⚠ ${String((e as Error)?.message || e).slice(0, 200)}\nถอดเสียงได้แล้ว แต่ยังไม่ได้บันทึกลงชีต — คัดลอกข้อความด้านล่าง แล้วส่งกลับมาเป็นข้อความได้เลย\n\n${text.slice(0, 4500)}`;
  }
}

async function handle(ev: Json) {
  if (ev.deliveryContext?.isRedelivery) return; // LINE retried an event we already processed
  const token = ev.replyToken;
  if (!token) return;
  if (ev.type === "follow") return respond(ev, `สวัสดีค่ะ 🙏 ระบบบันทึกลูกค้าหน้าบูธ Em-O-Cha\n\n${HELP}`);
  if (ev.type !== "message") return;
  const uid = ev.source?.userId;
  if (!uid) return respond(ev, "ระบบไม่เห็นผู้ส่ง — แชทกับบัญชีนี้แบบส่วนตัวแทนนะคะ");
  if (ev.message?.type === "audio" && ELEVENLABS_API_KEY) {
    try {
      showLoading(ev.source);
      return await respond(ev, await audioLead(ev, uid));
    } catch (e) {
      console.error("booth-line audio", e);
      return await respond(ev, `⚠ ${String((e as Error)?.message || e).slice(0, 300)}\nคลิปนี้ยังไม่ถูกบันทึก — ลองส่งใหม่ หรือกดไมค์บนคีย์บอร์ดพิมพ์ด้วยเสียงแทน`).catch(() => {});
    }
  }
  if (ev.message?.type !== "text") {
    return respond(ev, ELEVENLABS_API_KEY
      ? "รับข้อความหรือคลิปเสียงนะคะ 🙏"
      : "รับเฉพาะข้อความนะคะ 🙏\nกดไมค์บนคีย์บอร์ดเพื่อพูดแทนการพิมพ์ ให้กลายเป็นข้อความก่อน แล้วค่อยกดส่ง");
  }
  const text = String(ev.message.text || "").trim();
  try {
    if (/^(วิธีใช้|ช่วยด้วย|help|\?)$/i.test(text)) return await respond(ev, HELP);
    if (/^(ชีต|ชีท|sheet|ลิงก์|ลิ้งค์)$/i.test(text)) return await respond(ev, `📊 Google Sheet: ${(await sheet("ping")).url}`);
    const ev2 = text.match(/^งาน\s*[:：]\s*(.*)$/s);
    if (ev2) {
      const evName = ev2[1].trim();
      await sheet("staff", { lineUserId: uid, displayName: await displayName(ev.source), event: evName });
      return await respond(ev, evName ? `✅ ตั้งชื่องานเป็น “${evName}” แล้ว\nลูกค้าที่ส่งต่อจากนี้จะอยู่ในงานนี้` : "✅ ล้างชื่องานแล้ว");
    }
    if (/^ลบ$/.test(text)) {
      const latest = await sheet("latest", { lineUserId: uid, withinMinutes: DELETE_WINDOW_MIN });
      if (!latest) return await respond(ev, "ไม่พบลูกค้าที่คุณส่งใน 24 ชม. ที่ผ่านมา");
      const ok = await sheet("delete", { id: latest.id, lineUserId: uid });
      return await respond(ev, ok ? `🗑 ลบ ${latest.name || "ลูกค้าคนล่าสุด"} แล้ว` : "ลบไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
    if (/^(ล่าสุด|ดู)$/.test(text)) {
      const latest = await sheet("latest", { lineUserId: uid, withinMinutes: DELETE_WINDOW_MIN });
      return await respond(ev, latest ? card("📄 ลูกค้าคนล่าสุด", latest) : "ไม่พบลูกค้าที่คุณส่งใน 24 ชม. ที่ผ่านมา");
    }
    showLoading(ev.source);
    const add = text.match(/^(?:\+|เพิ่ม)\s*(.*)$/s);
    if (add && add[1].trim()) return await respond(ev, await appendTo(ev.source, uid, add[1].trim()));
    return await respond(ev, await newLead(ev.source, uid, text));
  } catch (e) {
    console.error("booth-line", e);
    await respond(ev, `⚠ บันทึกไม่สำเร็จ: ${String((e as Error)?.message || e).slice(0, 300)}\nข้อความนี้ยังไม่ถูกบันทึก — ลองส่งใหม่อีกครั้ง`).catch(() => {});
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("BoothCRM LINE webhook", { status: 200 });
  if (!LINE_SECRET || !LINE_TOKEN) return new Response("ยังไม่ได้ตั้งค่า BOOTH_LINE_CHANNEL_SECRET / BOOTH_LINE_ACCESS_TOKEN", { status: 500 });
  const body = await req.text();
  if (!(await validSignature(body, req.headers.get("x-line-signature")))) return new Response("invalid signature", { status: 401 });
  let payload: Json;
  try { payload = JSON.parse(body); } catch { return new Response("bad json", { status: 400 }); }
  // Answer LINE right away; Claude + the sheet take several seconds, and the reply token stays valid meanwhile.
  background(Promise.all((payload.events || []).map((ev: Json) => handle(ev).catch((e) => console.error("booth-line", e)))));
  return new Response("ok", { status: 200 });
});
