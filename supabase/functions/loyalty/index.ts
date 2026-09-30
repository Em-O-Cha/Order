// loyalty: สะสมคะแนนจากใบเสร็จ 7-Eleven + ใบจัดส่งของพรีเมียม (ดู migrations/*_loyalty_receipts.sql)
//
// ลูกค้า (หน้าสมาชิก, โทเคน LINE)
//   action=config                                  -> { config } เปิดรับใบเสร็จไหม (หน้าสมาชิกซ่อน/แสดงปุ่ม 7-Eleven)
//   action=myReceipts  idToken                    -> { config (แบบสอบถาม/กติกา), receipts (ประวัติ 30 ใบล่าสุด) }
//   action=submitReceipt (multipart/form-data)     idToken, clientKey, survey (JSON), file (ไฟล์ต้นฉบับ),
//                                                  preview (JPEG ย่อที่หน้าเว็บทำให้ ถ้าทำได้)
//     เก็บไฟล์ใน bucket receipts -> AI อ่านและตรวจใบเสร็จ -> ตรวจซ้ำ -> บันทึก -> ปลุก Apps Script ให้แจ้งกลุ่มแอดมิน
//     ตอบ { success, ref, status, message }
//
// แอดมิน (ลิงก์ในกลุ่ม LINE แอดมิน มีโทเคน t ที่ฐานข้อมูลเซ็นให้)
//   action=review      id, t          -> ใบเสร็จ + ผล AI + ลิงก์รูป (อายุ 1 ชม.) + ใบที่อาจซ้ำ + ประวัติลูกค้า
//   action=reviewList  t (ของ all=1)  -> รายการรอตรวจ + 7 วันล่าสุด
//   action=decide      id, t, decision (approve|reject), points, note, reviewer
//   action=labels      id หรือ all=1, t -> ข้อมูลใบจัดส่งของพรีเมียม
//   action=shipUpdate  id, t (ของใบนั้น หรือของ all=1 + id), status, tracking, carrier
//   action=settingsGet  t (ของหน้าตั้งค่า)              -> ค่าตั้ง + ลิงก์ + สถิติ + สรุปแบบสอบถาม
//   action=settingsSave t, settings (JSON เฉพาะช่องที่แก้) -> ตรวจค่าในฐานข้อมูลก่อนบันทึก
//
// deploy ด้วย verify_jwt = false (หน้าเว็บไม่มี JWT ของ Supabase) — ต้องตั้ง secret ANTHROPIC_API_KEY
// ให้ AI ตรวจใบเสร็จ (ไม่ได้ตั้ง = รับใบเสร็จได้ตามปกติ แต่ขึ้นว่า "AI ยังไม่ได้ตรวจ" ให้แอดมินตรวจเอง)

import { CORS, getInternalKey, json, P, readParams, rpc, verifyLineIdToken } from "../_shared/mirror_client.ts";
import {
  aiCheck, type AiResult, evaluate, extOf, type Json, scanMetadata, sniffMime, toBase64, validateSurvey,
} from "./check.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const BUCKET = "receipts";
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;
const AI_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const LINE_PREVIEW_TTL_SEC = 365 * 24 * 3600;

function fail(error: string, extra: Json = {}): Response {
  return json({ success: false, error, ...extra });
}

function background(p: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(p);
}

// ---------------------------------------------------------------------------
// ไฟล์
// ---------------------------------------------------------------------------
async function storagePut(path: string, bytes: Uint8Array<ArrayBuffer>, mime: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": mime, "x-upsert": "true" },
    body: bytes,
  });
  if (!res.ok) throw new Error(`อัปโหลดไฟล์ไม่สำเร็จ: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function signedUrl(path: string | null | undefined, expiresIn: number): Promise<string> {
  if (!path) return "";
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) return "";
  const body = await res.json().catch(() => ({}));
  const rel = String(body.signedURL || body.signedUrl || "");
  return rel ? `${SUPABASE_URL}/storage/v1${rel.startsWith("/") ? "" : "/"}${rel}` : "";
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// ปลุก Apps Script ให้ทำคิว (แจ้งกลุ่มแอดมิน / ให้คะแนน / แจ้งลูกค้า) — ไม่ throw
// ถ้าปลุกไม่สำเร็จ รอบสำรองของ Apps Script (ทุก ~1 นาที) จะทำให้
// ---------------------------------------------------------------------------
async function kickAppsScript(): Promise<void> {
  try {
    const url = String(await rpc("loyalty_apps_script_url", {}) || "");
    if (!url) return;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "text/plain" }, redirect: "follow",
        body: JSON.stringify({ action: "loyaltyWorkNow", key: await getInternalKey() }),
      });
      await res.text();
      if (res.ok) return;
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch (e) {
    console.error("kickAppsScript", e);
  }
}

// ---------------------------------------------------------------------------
// ลูกค้า
// ---------------------------------------------------------------------------
async function customerProfile(idToken: string): Promise<{ uid?: string; profile?: Json; error?: string }> {
  if (!idToken) return { error: "กรุณาเข้าสู่ระบบ LINE ใหม่" };
  const v = await verifyLineIdToken(idToken);
  if (!v.profile) return { error: "เซสชัน LINE หมดอายุ กรุณาปิดแล้วเปิดหน้านี้ใหม่" };
  return { uid: String(v.profile.sub), profile: v.profile };
}

async function myReceipts(p: P) {
  const c = await customerProfile(String(p.idToken || ""));
  if (!c.uid) return fail(c.error!);
  const r = await rpc("loyalty_my_receipts", { p_uid: c.uid });
  return json({ success: true, ...r });
}

function customerMessage(receipt: Json, soft: string[]): string {
  if (receipt.status === "rejected") return "ใบเสร็จนี้เคยถูกส่งเข้ามาแล้ว ไม่สามารถใช้สะสมคะแนนซ้ำได้";
  if (receipt.status === "approved") return `ใบเสร็จผ่านการตรวจสอบ ได้รับ ${receipt.points} คะแนน (กำลังเพิ่มเข้าบัญชี)`;
  const base = "ส่งใบเสร็จเรียบร้อย เจ้าหน้าที่จะตรวจสอบและแจ้งผลทาง LINE";
  return soft.length ? `${base}\n(หมายเหตุ: ${soft.join(", ")})` : base;
}

async function submitReceipt(req: Request) {
  let form: FormData;
  try { form = await req.formData(); } catch { return fail("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const field = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : ""; };
  const c = await customerProfile(field("idToken"));
  if (!c.uid) return fail(c.error!);
  const clientKey = field("clientKey");
  if (!/^[A-Za-z0-9-]{16,64}$/.test(clientKey)) return fail("กรุณาลองใหม่อีกครั้ง (ไม่มีรหัสคำขอ)");

  const prep = await rpc("loyalty_submit_prepare", { p_uid: c.uid, p_client_key: clientKey });
  if (prep.existing) {
    return json({ success: true, ref: prep.existing.ref, status: prep.existing.status, message: customerMessage(prep.existing, []) });
  }
  const cfg = prep.config || {};
  if (!cfg.live) return fail("ยังไม่เปิดรับใบเสร็จในขณะนี้");
  if (!prep.member) return fail("กรุณาสมัครสมาชิกก่อนส่งใบเสร็จ");
  if (Number(prep.todayCount) >= (parseInt(String(cfg.maxPerDay)) || 5)) {
    return fail(`วันนี้ส่งใบเสร็จครบ ${cfg.maxPerDay} ใบแล้ว กรุณาส่งใหม่พรุ่งนี้`);
  }
  const survey = validateSurvey(field("survey"), cfg.survey || []);
  if (!survey.ok) return fail(survey.error);

  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return fail("กรุณาแนบไฟล์ใบเสร็จ");
  if (file.size > MAX_FILE_BYTES) return fail("ไฟล์ใหญ่เกิน 12 MB กรุณาถ่ายรูปใหม่หรือย่อไฟล์");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes, file.type, file.name);
  if (!mime.startsWith("image/") && mime !== "application/pdf") {
    return fail("รองรับเฉพาะรูปภาพ (JPG, PNG, HEIC, WEBP ฯลฯ) หรือไฟล์ PDF");
  }
  const previewFile = form.get("preview");
  let preview: Uint8Array<ArrayBuffer> | null = null;
  if (previewFile instanceof File && previewFile.size && previewFile.size <= MAX_PREVIEW_BYTES) {
    const pb = new Uint8Array(await previewFile.arrayBuffer());
    if (sniffMime(pb, previewFile.type, "") === "image/jpeg") preview = pb;
  }

  // เก็บไฟล์
  const sha = await sha256Hex(bytes);
  const month = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
  const base = `${c.uid!.replace(/[^A-Za-z0-9]/g, "")}/${month}/${crypto.randomUUID()}`;
  const filePath = `${base}.${extOf(file.name, mime)}`;
  const previewPath = preview ? `${base}-preview.jpg` : null;
  await storagePut(filePath, bytes, mime);
  if (preview && previewPath) await storagePut(previewPath, preview, "image/jpeg");
  // รูปให้ LINE แสดงในกลุ่มแอดมิน: รูปย่อ หรือไฟล์เดิมถ้าเป็น JPEG/PNG ไม่เกิน 10 MB
  const lineImagePath = previewPath || ((mime === "image/jpeg" || mime === "image/png") && bytes.length <= 10 * 1024 * 1024 ? filePath : null);
  const previewUrl = await signedUrl(lineImagePath, LINE_PREVIEW_TTL_SEC);

  // AI
  const extraFlags: string[] = [];
  let block: Json | null = null;
  if (preview) block = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: toBase64(preview) } };
  else if (mime === "application/pdf") block = { type: "document", source: { type: "base64", media_type: "application/pdf", data: toBase64(bytes) } };
  else if (AI_IMAGE_TYPES.has(mime) && bytes.length <= 5 * 1024 * 1024) block = { type: "image", source: { type: "base64", media_type: mime, data: toBase64(bytes) } };
  const meta = scanMetadata(bytes);
  if (form.get("originalReplaced") === "1") extraFlags.push("ไฟล์ต้นฉบับใหญ่เกิน หน้าเว็บย่อรูปก่อนส่ง (ตรวจร่องรอยในไฟล์ไม่ได้)");
  const channel = String(survey.answers.channel || "");
  const ai: AiResult = block
    ? await aiCheck(ANTHROPIC_API_KEY, block, (prep.productKeywords || []).map(String), channel, String(prep.aiModel || "claude-opus-5-5"))
    : { ok: false, error: `ไฟล์ชนิด ${mime} ให้ AI อ่านไม่ได้`, ms: 0 };
  const ev = evaluate(ai, meta, cfg, extraFlags);

  const member = prep.member || {};
  const row = {
    client_key: clientKey, line_uid: c.uid!,
    member: { ...member, lineName: String(c.profile?.name || "") },
    survey: survey.answers,
    file_path: filePath, file_mime: mime, file_name: String(file.name || "").slice(0, 200), file_size: bytes.length,
    file_sha256: sha, preview_path: lineImagePath, preview_url: previewUrl,
    receipt_no: ev.receipt_no || null, receipt_key: ev.receipt_key, loose_key: ev.loose_key, store: ev.store || null,
    receipt_at: ev.receipt_at, receipt_total: ev.receipt_total, emocha_amount: ev.emocha_amount,
    emocha_items: ev.emocha_items,
    ai: { result: ai.ok ? ai.data : null, error: ai.ok ? null : ai.error, model: ai.ok ? ai.model : null, ms: ai.ms, meta },
    ai_verdict: ev.verdict, ai_flags: ev.flags, suggested_points: ev.suggested_points,
  };
  const ins = await rpc("loyalty_receipt_insert", { p_row: row });
  const receipt = ins.receipt || {};
  background(kickAppsScript());
  return json({ success: true, ref: receipt.ref, status: receipt.status,
                message: customerMessage(receipt, ins.existing ? [] : ev.soft) });
}

// ---------------------------------------------------------------------------
// แอดมิน
// ---------------------------------------------------------------------------
async function tokenOk(kind: string, id: string, token: string): Promise<boolean> {
  if (!token || !id) return false;
  return (await rpc("loyalty_check_token", { p_kind: kind, p_id: id, p_token: token })) === true;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ใบเดียว: โทเคนของใบนั้น หรือโทเคนรายการทั้งหมด (เปิดจากหน้ารายการ)
async function receiptAccess(p: P): Promise<boolean> {
  const id = String(p.id || "");
  if (!UUID_RE.test(id)) return false;
  return (await tokenOk("r", id, String(p.t || ""))) || (!!p.lt && await tokenOk("rl", "-", String(p.lt)));
}

async function review(p: P) {
  if (!await receiptAccess(p)) return fail("ลิงก์ไม่ถูกต้องหรือหมดอายุ");
  const r = await rpc("loyalty_review_get", { p_id: p.id });
  if (!r || !r.receipt) return fail("ไม่พบใบเสร็จ");
  const [fileUrl, previewUrl] = await Promise.all([
    signedUrl(r.receipt.filePath, 3600),
    signedUrl(r.receipt.previewPath, 3600),
  ]);
  return json({ success: true, ...r, fileUrl, previewUrl });
}

async function reviewList(p: P) {
  if (!await tokenOk("rl", "-", String(p.t || ""))) return fail("ลิงก์ไม่ถูกต้องหรือหมดอายุ");
  return json({ success: true, receipts: await rpc("loyalty_review_list", {}) });
}

async function decide(p: P) {
  if (!await receiptAccess(p)) return fail("ลิงก์ไม่ถูกต้องหรือหมดอายุ");
  const decision = String(p.decision || "");
  const r = await rpc("loyalty_receipt_decide", {
    p_id: p.id, p_decision: decision, p_points: parseInt(String(p.points || "0")) || 0,
    p_note: String(p.note || "").slice(0, 500), p_reviewer: String(p.reviewer || "").slice(0, 80),
  });
  if (!r.ok) return fail(r.error);
  background(kickAppsScript());
  return json({ success: true, receipt: r.receipt });
}

async function labels(p: P) {
  const all = String(p.all || "") === "1";
  const id = String(p.id || "");
  const ok = all ? await tokenOk("sl", "-", String(p.t || "")) : UUID_RE.test(id) && await tokenOk("s", id, String(p.t || ""));
  if (!ok) return fail("ลิงก์ไม่ถูกต้องหรือหมดอายุ");
  return json({ success: true, ...(await rpc("loyalty_shipments_get", { p_id: all ? null : id })) });
}

async function shipUpdate(p: P) {
  const id = String(p.id || "");
  if (!UUID_RE.test(id)) return fail("ไม่พบรายการ");
  const ok = (await tokenOk("s", id, String(p.t || ""))) || (await tokenOk("sl", "-", String(p.t || "")));
  if (!ok) return fail("ลิงก์ไม่ถูกต้องหรือหมดอายุ");
  const r = await rpc("loyalty_shipment_update", {
    p_id: id, p_status: String(p.status || ""), p_tracking: String(p.tracking || "").slice(0, 60),
    p_carrier: String(p.carrier || "").slice(0, 60),
  });
  if (!r.ok) return fail(r.error);
  if (r.shipment?.status === "shipped") background(kickAppsScript());
  return json({ success: true, shipment: r.shipment });
}

async function settingsGet(p: P) {
  if (!await tokenOk("cfg", "-", String(p.t || ""))) return fail("ลิงก์ไม่ถูกต้องหรือหมดอายุ");
  return json({ success: true, ...(await rpc("loyalty_settings_get", {})) });
}

async function settingsSave(p: P) {
  if (!await tokenOk("cfg", "-", String(p.t || ""))) return fail("ลิงก์ไม่ถูกต้องหรือหมดอายุ");
  let settings: unknown;
  try { settings = JSON.parse(String(p.settings || "")); } catch { return fail("ข้อมูลไม่ถูกต้อง"); }
  const r = await rpc("loyalty_settings_save", { p: settings });
  if (!r.ok) return fail(r.error);
  // ใส่ Group ID ใหม่ -> ส่งแจ้งเตือนที่ค้างเข้ากลุ่มเลย
  background(kickAppsScript());
  return json({ success: true, ...r });
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const ct = req.headers.get("content-type") || "";
    if (req.method === "POST" && ct.includes("multipart/form-data")) return await submitReceipt(req);
    const p = await readParams(req);
    switch (p.action) {
      case "config": return json({ success: true, config: await rpc("loyalty_public_config", {}) });
      case "myReceipts": return await myReceipts(p);
      case "review": return await review(p);
      case "reviewList": return await reviewList(p);
      case "decide": return await decide(p);
      case "labels": return await labels(p);
      case "shipUpdate": return await shipUpdate(p);
      case "settingsGet": return await settingsGet(p);
      case "settingsSave": return await settingsSave(p);
      default: return fail("ไม่รู้จักคำสั่ง");
    }
  } catch (e) {
    console.error("loyalty", e);
    return fail("ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
});
