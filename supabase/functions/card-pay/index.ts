// card-pay: ชำระด้วยบัตรเครดิต/เดบิต (Stripe Checkout / K Payment Link กสิกรไทย) — คีย์อยู่ที่นี่ที่เดียว (Supabase Secrets)
//
// เรียกด้วย x-internal-key เท่านั้น (Apps Script SupabaseCard.gs / ชุดทดสอบ) ยกเว้น action=notify (ธนาคารแจ้งผล)
//   status                     เชื่อมต่อธนาคารแล้วหรือยัง { ready, provider, mode, message }
//   createLink  orderId amount lineUid description returnUrl
//                              ลิงก์ชำระเงินของออเดอร์ (ยอดจากชีตที่ Apps Script ส่งมา) — ลิงก์เดิมที่ยอดเท่าเดิมและยัง
//                              ไม่หมดอายุใช้ซ้ำ ยอดเปลี่ยน (แก้ไขออเดอร์) = ลิงก์ใหม่ ลิงก์เก่าใช้ไม่ได้ จ่ายแล้ว = { paid: true }
//   check       orderId        จ่ายแล้วหรือยัง (ถามธนาคารเมื่อยังไม่รู้ผล) { paid, status, amount, ref, id, method, fee, net }
//                              method = วิธีชำระ (Visa •••• 4242 · เครดิต / PromptPay) fee/net = ค่าธรรมเนียม/ยอดสุทธิ (บาท)
//   confirmed   orderId id     Apps Script ยืนยันออเดอร์ในชีตแล้ว
//   unconfirmed                จ่ายแล้วแต่ Apps Script ยังไม่ยืนยัน (รอบสำรอง)
//   mockPay     orderId        (ลิงก์ทดสอบ mock เท่านั้น) ทำเหมือนลูกค้าจ่ายแล้ว
//   ชุดทดสอบส่ง testProvider=mock กับ createLink ได้ (ลิงก์ทดสอบ ไม่มีเงินจริง) — Apps Script ไม่เคยส่งค่านี้
//   notify                     ธนาคารแจ้งผล -> ถามธนาคารยืนยันซ้ำ -> ปลุก Apps Script (doPost action cardPaid)
//
// deploy ด้วย verify_jwt = false (ธนาคารและ Apps Script ไม่มี JWT ของ Supabase)

import { CORS, getInternalKey, isInternal, json, P, readParams, rpc } from "../_shared/mirror_client.ts";
import { CardRow, getProvider, InquiryResult, PaymentDetails } from "./providers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const NOTIFY_URL = `${SUPABASE_URL}/functions/v1/card-pay?action=notify`;
const LINK_TTL_MIN = 60;            // ลิงก์ชำระเงินใช้ได้ 60 นาที
const REUSE_MIN_LEFT_MS = 5 * 60 * 1000;

const provider = getProvider();
const num = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

async function getRow(orderId: string): Promise<{ row: CardRow | null; appsScriptUrl: string }> {
  const r = await rpc("card_pay_get", { p_order_id: orderId });
  return { row: r?.row || null, appsScriptUrl: String(r?.apps_script_url || "") };
}

const detailsOf = (row: CardRow): PaymentDetails | null =>
  ((row.raw as { details?: PaymentDetails } | null)?.details) || null;

function paidOut(row: CardRow) {
  const d = detailsOf(row);
  return {
    success: true, paid: true, status: "paid", orderId: row.order_id, amount: num(row.paid_amount ?? row.amount), ref: row.paid_ref || "", id: row.id, mode: row.mode,
    method: d?.method || "", fee: d?.fee ?? null, net: d?.net ?? null,
  };
}

// จ่ายแล้วแต่ยังไม่รู้วิธีชำระ/ค่าธรรมเนียม (จ่ายก่อนมีระบบนี้ หรือผู้ให้บริการยังไม่ตัดยอด) -> ถามซ้ำแล้วบันทึก ไม่ throw
async function fillDetails(row: CardRow): Promise<CardRow> {
  const d = detailsOf(row);
  if (row.status !== "paid" || !row.paid_ref || (d && d.fee !== null && d.method)) return row;
  const prov = getProvider(row.provider);
  if (!prov.paymentDetails) return row;
  try {
    const fresh = await prov.paymentDetails(row.paid_ref);
    if (!fresh || (d && fresh.fee === d.fee && fresh.method === d.method)) return row;
    return await rpc("card_pay_update", { p_id: row.id, p_patch: { raw: { ...(row.raw as object || {}), details: fresh } } });
  } catch (e) {
    console.error("fillDetails", row.order_id, e);
    return row;
  }
}

// ถามธนาคาร (เฉพาะแถวที่ยังรอจ่าย) แล้วบันทึกผล
async function refresh(row: CardRow): Promise<CardRow> {
  if (row.status !== "pending") return row;
  let q: InquiryResult;
  try {
    q = await getProvider(row.provider).inquire(row);
  } catch (e) {
    console.error("inquire", row.order_id, e);
    return row;
  }
  if (q.status === "pending") return row;
  const raw = q.raw ?? row.raw;
  const patch: Record<string, unknown> = { status: q.status, raw: q.details ? { ...(raw as object || {}), details: q.details } : raw };
  if (q.status === "paid") {
    patch.paid_amount = q.paidAmount;
    patch.paid_ref = q.paidRef || "";
    patch.paid_at = q.paidAt || new Date().toISOString();
  }
  return await rpc("card_pay_update", { p_id: row.id, p_patch: patch });
}

// ปลุก Apps Script ให้ยืนยันออเดอร์ (Apps Script ถาม check ซ้ำเองก่อนยืนยัน) — ไม่ throw
async function kickAppsScript(url: string, orderId: string): Promise<string> {
  if (!url) return "ยังไม่ได้ตั้ง apps_script_url";
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "text/plain" }, redirect: "follow",
      body: JSON.stringify({ action: "cardPaid", key: await getInternalKey(), orderId }),
    });
    return `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
  } catch (e) {
    console.error("kickAppsScript", e);
    return "ข้อผิดพลาด: " + String(e); // รอบสำรองของ Apps Script (ทุก 5 นาที) จะเก็บให้
  }
}

async function createLink(p: P) {
  const orderId = String(p.orderId || "");
  const amount = num(p.amount);
  if (!/^REV\d{4,}$/.test(orderId)) return json({ success: false, error: "เลขที่ออเดอร์ไม่ถูกต้อง" });
  if (!(amount > 0)) return json({ success: false, error: "ยอดชำระไม่ถูกต้อง" });
  const prov = p.testProvider === "mock" ? getProvider("mock") : provider;
  const st = prov.ready();
  if (!st.ready) return json({ success: false, error: st.message });

  let { row } = await getRow(orderId);
  if (row) row = await refresh(row);
  if (row?.status === "paid") return json(paidOut(row));
  if (row && row.status === "pending" && row.provider === prov.name && num(row.amount) === amount && row.pay_url &&
      row.expires_at && new Date(row.expires_at).getTime() - Date.now() > REUSE_MIN_LEFT_MS) {
    return json({ success: true, url: row.pay_url, expiresAt: row.expires_at, reused: true });
  }
  const expiresAt = new Date(Date.now() + LINK_TTL_MIN * 60 * 1000);
  let link;
  try {
    link = await prov.createLink({
      orderId, amount, description: String(p.description || `Order ${orderId}`).slice(0, 100),
      returnUrl: String(p.returnUrl || ""), notifyUrl: NOTIFY_URL, expiresAt,
    });
  } catch (e) {
    console.error("createLink", orderId, e);
    return json({ success: false, error: "สร้างลิงก์ชำระเงินไม่สำเร็จ: " + String((e as Error).message || e) });
  }
  const saved = await rpc("card_pay_insert", { p_row: {
    order_id: orderId, line_uid: p.lineUid || "", amount, provider: prov.name, mode: prov.mode,
    link_id: link.linkId, pay_url: link.url, expires_at: link.expiresAt, raw: link.raw ?? null,
  } });
  return json({ success: true, url: link.url, expiresAt: link.expiresAt, id: saved?.id });
}

async function check(p: P) {
  const orderId = String(p.orderId || "");
  let { row } = await getRow(orderId);
  if (!row) return json({ success: true, paid: false, status: "none" });
  row = await refresh(row);
  if (row.status === "paid") return json(paidOut(await fillDetails(row)));
  return json({ success: true, paid: false, status: row.status, expiresAt: row.expires_at });
}

async function notify(req: Request) {
  const body = await req.text();
  let ref: { linkId?: string; orderId?: string } = {};
  try {
    ref = await provider.parseNotify(body, req.headers);
  } catch (e) {
    // ลายเซ็นไม่ถูก/ข้อความปลอม: ไม่ทำอะไรต่อ (ผู้ให้บริการจะเห็นว่าส่งไม่สำเร็จ)
    console.error("parseNotify", e);
    await rpc("card_pay_log", { p_provider: provider.name, p_order_id: null, p_payload: null, p_result: "ปฏิเสธ: " + String((e as Error).message || e).slice(0, 200) })
      .catch((err) => console.error("card_pay_log", err));
    return new Response("invalid notification", { status: 400 });
  }
  let payload: unknown = body;
  try { payload = JSON.parse(body); } catch { /* ข้อความแบบฟอร์ม เก็บเป็นข้อความ */ }

  let row: CardRow | null = null;
  if (ref.linkId) row = await rpc("card_pay_find", { p_provider: provider.name, p_link_id: ref.linkId });
  if (!row && ref.orderId) row = (await getRow(ref.orderId)).row;
  let result = "ไม่พบรายการ";
  if (row) {
    row = await refresh(row);
    result = "สถานะ " + row.status;
    if (row.status === "paid" && !row.confirmed_at) {
      result += " | ปลุก Apps Script: " + await kickAppsScript((await getRow(row.order_id)).appsScriptUrl, row.order_id);
    }
  }
  await rpc("card_pay_log", { p_provider: provider.name, p_order_id: row?.order_id || ref.orderId || null, p_payload: payload, p_result: result })
    .catch((e) => console.error("card_pay_log", e));
  return provider.notifyAck();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    if (new URL(req.url).searchParams.get("action") === "notify") return await notify(req);
    if (!(await isInternal(req))) return json({ success: false, error: "ไม่อนุญาต" }, 403);
    const p = await readParams(req);
    const action = String(p.action || "");
    if (action === "status") {
      const st = provider.ready();
      return json({ success: true, ready: st.ready, provider: provider.name, mode: provider.mode, message: st.message });
    }
    if (action === "createLink") return await createLink(p);
    if (action === "check") return await check(p);
    if (action === "confirmed") {
      let id = String(p.id || "");
      if (!id) id = (await getRow(String(p.orderId || ""))).row?.id || "";
      if (!id) return json({ success: false, error: "ไม่พบรายการ" });
      await rpc("card_pay_update", { p_id: id, p_patch: { confirmed_at: new Date().toISOString() } });
      return json({ success: true });
    }
    if (action === "unconfirmed") {
      const rows: CardRow[] = await rpc("card_pay_unconfirmed", {});
      return json({ success: true, orders: rows.map((r) => {
        const d = detailsOf(r);
        return { orderId: r.order_id, amount: num(r.paid_amount), ref: r.paid_ref || "", id: r.id, mode: r.mode, method: d?.method || "", fee: d?.fee ?? null, net: d?.net ?? null };
      }) });
    }
    if (action === "mockPay") {
      const { row, appsScriptUrl } = await getRow(String(p.orderId || ""));
      if (!row || row.status !== "pending" || row.provider !== "mock") return json({ success: false, error: "ไม่มีลิงก์ทดสอบ (mock) ที่รอจ่าย" });
      const amount = p.amount !== undefined ? num(p.amount) : num(row.amount);
      await rpc("card_pay_update", { p_id: row.id, p_patch: { raw: { ...(row.raw as object || {}), mock_paid: amount, mock_paid_at: new Date().toISOString() } } });
      const kick = p.kick === "1" ? await kickAppsScript(appsScriptUrl, row.order_id) : "";
      return json({ success: true, kick });
    }
    return json({ success: false, error: "ไม่รู้จัก action: " + action });
  } catch (e) {
    console.error("card-pay", e);
    return json({ success: false, error: String((e as Error).message || e) }, 500);
  }
});
