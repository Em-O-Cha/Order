// shop-order: สั่งซื้อผ่าน Supabase (เฟส 3 ขั้น 4 "ย้ายการสั่งซื้อ")
//
// ลูกค้าไม่ต้องรอ Apps Script: Supabase รัน createShopOrder ตัวเดิมของ Members.gs (gas_port.js — ดึงมาอัตโนมัติ
// ไม่ได้เขียนใหม่) บนสำเนาชีตเพื่อ "ทำนาย" ยอดชำระ/ส่วนลด/สิทธิ์/คูปอง/แต้ม แล้วตอบลูกค้าทันที จากนั้นปลุก
// Apps Script ให้รัน createShopOrder ตัวเดิมบนชีตจริงด้วยข้อมูลชุดเดียวกัน (ตัวจริง: ออกเลข REV ตัดสิทธิ์ นับคูปอง
// แจ้งเตือน เหมือนเดิมทุกอย่าง) แล้วส่งเลข REV + ผลจริงกลับมา หน้าเว็บถามสถานะจนได้เลข REV
//
// action=createShopOrder — พารามิเตอร์เดียวกับที่ส่งให้ Apps Script + clientKey (uuid สุ่มต่อการกดยืนยัน 1 ครั้ง)
//   ตอบ { ...ผลที่ทำนาย (รูปเดียวกับ createShopOrder), orderId: '', pending: true, requestId }
//   หรือ { success:false, needsAppsScript:true, reason } ให้หน้าเว็บสั่งซื้อทาง Apps Script เดิม เมื่อ
//     - สวิตช์ orders.settings.live ยังปิด / แก้ไขออเดอร์เดิม (existingOrderId) / สำเนายังไม่ทัน
//     - ผลที่ทำนายไม่สำเร็จ (เช่น คูปองใช้ไม่ได้) — ให้ Apps Script ตัดสินและตอบข้อความเดิม
//     - ตัวจำลองไม่รองรับสิ่งที่โค้ดทำ / เกิดข้อผิดพลาด
//   คำสั่งซื้อที่รับแล้วแต่ยังไม่ลงชีตถูกเล่นทับสำเนาก่อนคำนวณ (สิทธิ์ใบเดียว/แต้มก้อนเดียวใช้ซ้ำไม่ได้) และ
//   order_insert บันทึกตามลำดับ (มีคำสั่งซื้ออื่นแทรก = คำนวณใหม่) แทน ScriptLock
//   clientKey ซ้ำ = คำสั่งซื้อเดิม (กดซ้ำ/เน็ตหลุดแล้วส่งใหม่ ได้ออเดอร์เดียว)
//   ชุดทดสอบภายใน (x-internal-key + asUid) สั่งได้แม้สวิตช์ปิด แถวถูกติดป้าย is_test (ตัวเขียนของจริงไม่แตะ)
//
// action=orderStatus — requestId=... หรือ clientKey=...
//   ตอบ { success:true, requestId, status: 'pending'|'written'|'failed', orderId, result, changed, error }
//   result = ผลจริงจาก Apps Script (หลัง written), changed = ยอดจริงไม่ตรงกับที่แสดงไว้
//
// action=createShopOrderDryRun — (ทดสอบเท่านั้น ต้องมี x-internal-key) คำนวณโดยไม่บันทึก
//   ตอบ { success:true, dryRun:true, result, journal, baseRows, accessed, notReady, unsupported, blocked }
//
// deploy ด้วย verify_jwt = false เพราะหน้าเว็บไม่มี JWT ของ Supabase มีแต่โทเคน LINE

import { createGas } from "./gas_port.js";
import { createEnv, overlayJournals, PROPS_KEY, SLIM_HIDDEN } from "../_shared/gas_runtime.js";
import {
  baseKey, createTabStore, CORS, getInternalKey, isInternal, json, Owner, P, peekLineSub, propsFrom, readParams,
  rpc, Tab, verifyLineIdToken,
} from "../_shared/mirror_client.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

// แท็บที่ createShopOrder ใช้ (Revenue ฉบับย่อ + แถวเต็มของลูกค้า) — ถ้าโค้ดอ่านนอกรายการหรือใช้ช่องที่ซ่อน
// จะคำนวณใหม่ด้วยทุกแท็บแบบเต็ม
const ORDER_TABS = [
  "members/Members", "members/Member_Privileges", "members/Coupons", "members/Tier_Config",
  "members/Points_Promos", "members/Shipping_Config", "master/SKU", "revenue/Revenue#slim", PROPS_KEY,
];
const FULL_TABS = [
  "members/Members", "members/Member_Privileges", "members/Points_Log", "members/Coupons", "members/Tier_Config",
  "members/Signup_Privileges", "members/Points_Promos", "members/Tier_Perks", "members/Point_Rewards",
  "members/Rewards_Catalog", "members/Referral_Log", "members/Purchase_Referral_Log", "members/Redemption_Log",
  "members/Shipping_Config", "revenue/Revenue", "master/SKU", PROPS_KEY,
];
const NOT_LOADED = "gas_runtime: ไม่ได้โหลดแท็บ ";
const MAX_ATTEMPTS = 5;
// พารามิเตอร์ของ createShopOrder ที่เก็บไว้ให้ Apps Script รันซ้ำ (ไม่เก็บโทเคน LINE)
const ORDER_PARAMS = [
  "itemsB64", "paymentMethod", "couponCode", "shippingAddress", "province", "excludePrivilegeName",
  "purchaseReferrerCode", "pointsToRedeem",
];

type Result = Record<string, any>;

// ค่า Date ส่งเป็นรูปเดียวกับ journal
function plain(v: unknown): unknown {
  if (v instanceof Date) return { $date: isNaN(v.getTime()) ? null : v.toISOString() };
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x)]));
  }
  return v;
}

function fallback(reason: string, extra: Record<string, unknown> = {}): Response {
  return json({ success: false, needsAppsScript: true, reason, ...extra }, 200, "fallback");
}

// ---------------------------------------------------------------------------
// โหลดทุกอย่างในคำขอเดียว (order_prepare) แคชแท็บไว้ข้ามคำขอ
// ---------------------------------------------------------------------------
const store = createTabStore();

async function prepare(keys: string[], owner: Owner, includeTests: boolean) {
  const r = await rpc("order_prepare", {
    p_tab_keys: keys, p_cached: store.cachedFor(keys), p_owner: owner, p_include_tests: includeTests,
  });
  const { tabs, dirty } = store.apply(keys, r.load);
  return {
    tabs, dirty, pending: (r.pending || []) as any[], lastSeq: Number(r.last_seq) || 0,
    blocked: (Array.isArray(r.blocked) ? r.blocked : []) as string[], live: r.settings?.live === true,
    appsScriptUrl: typeof r.settings?.apps_script_url === "string" ? r.settings.apps_script_url : "",
  };
}

// รัน createShopOrder ตัวเดิม (โหมดบันทึกการเขียน) — งานแจ้งเตือน/รางวัลแนะนำเพื่อน Apps Script ทำตอนรันจริง
function runOrder(tabs: Map<string, Tab>, keys: string[], profile: Record<string, unknown>, p: P) {
  const { env, tracker } = createEnv({
    tabs, loadedSources: new Set(keys.map(baseKey)), props: propsFrom(tabs.get(PROPS_KEY)), profile, journal: true,
  });
  const noop = () => {};
  const gas = createGas({
    ...env, notifyBuyerOrderConfirmation_: noop, notifyAdminNewOrder_: noop,
    checkAndGrantReferralOnFirstPurchase_: noop, checkAndGrantPurchaseReferral_: noop, sendLineMessages_: noop,
  });
  let result: Result;
  try {
    // ลำดับ/ค่าเหมือน doGet ของ Members.gs ทุกตัวอักษร (existingOrderId ว่างเสมอ: แก้ไขออเดอร์ใช้ทางเดิม)
    result = gas.createShopOrder("supabase", gas.decodeItemsB64_(p.itemsB64), p.paymentMethod, p.couponCode,
      p.shippingAddress, p.province, p.excludePrivilegeName, "", p.purchaseReferrerCode, p.pointsToRedeem);
  } catch (e) {
    result = { thrown: String(e) };
  }
  const baseRows = Object.fromEntries([...tabs].map(([k, t]) => [k, t.lastRow]));
  return { result, tracker, baseRows };
}

// คำนวณคำสั่งซื้อบนสำเนา (+ คำสั่งซื้อที่ยังไม่ลงชีต) — โหลดเต็มแล้วคำนวณใหม่เมื่อฉบับย่อไม่พอ
async function predict(profile: Record<string, unknown>, p: P, isTest: boolean) {
  const owner: Owner = { uid: String(profile.sub) };
  let keys = ORDER_TABS;
  for (;;) {
    const prep = await prepare(keys, owner, isTest);
    const tabs = overlayJournals(prep.tabs, prep.pending);
    const run = runOrder(tabs, keys, profile, p);
    const needFull = run.tracker.unsupported.some((u: string) =>
      String(u).startsWith(NOT_LOADED) || String(u).startsWith(SLIM_HIDDEN));
    if (needFull && keys !== FULL_TABS) {
      keys = FULL_TABS;
      continue;
    }
    const notReady = [...run.tracker.accessed].filter((k) => prep.dirty.has(k) || !tabs.has(k));
    return { prep, tabs, run, notReady, keys };
  }
}

// ปลุก Apps Script ให้รัน createShopOrder ตัวจริงของคำสั่งซื้อที่รอลงชีต (doPost ผ่าน SupabaseOrder.gs) — ไม่ throw
async function kickWriter(url: string): Promise<string> {
  if (!url) return "ยังไม่ได้ตั้ง apps_script_url";
  // Web App ของ Google ตอบ 404 ชั่วคราวได้เป็นครั้งคราว: ลองอีกครั้ง (ถ้ายังไม่ได้ รอบสำรองทุก 1 นาทีจะเก็บงานให้)
  let last = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "text/plain" }, redirect: "follow",
        body: JSON.stringify({ action: "orderWriteNow", key: await getInternalKey() }),
      });
      last = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
      if (res.ok) return last;
    } catch (e) {
      console.error("kickWriter", e);
      last = "ข้อผิดพลาด: " + String(e);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last;
}

// ผลที่ส่งให้หน้าเว็บตอนรับคำสั่งซื้อ: ผลที่ทำนาย แต่เลข REV ยังไม่มี (Apps Script ออกตอนเขียนชีต)
function accepted(requestId: string, predicted: Result, extra: Record<string, unknown> = {}): Response {
  return json({ ...predicted, orderId: "", pending: true, requestId, ...extra });
}

async function createOrder(p: P, profile: Record<string, unknown>, isTest: boolean, t0: number) {
  if (String(p.existingOrderId || "").trim()) return fallback("แก้ไขออเดอร์เดิมใช้ทางเดิม");
  const clientKey = String(p.clientKey || "").trim();
  if (!/^[A-Za-z0-9-]{16,64}$/.test(clientKey)) return fallback("ไม่มี clientKey");
  const timings: Record<string, number> = {};
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const tp = Date.now();
    const { prep, run, notReady } = await predict(profile, p, isTest);
    timings["predict" + attempt] = Date.now() - tp;
    if (!prep.live && !isTest) return fallback("ยังไม่เปิดใช้การสั่งซื้อผ่าน Supabase");
    if (prep.blocked.length) return fallback("สำเนายังไม่ทัน", { detail: prep.blocked });
    if (run.tracker.unsupported.length) return fallback("ตัวจำลองไม่รองรับ", { detail: run.tracker.unsupported.slice(0, 3) });
    if (notReady.length) return fallback("สำเนายังไม่ทัน", { detail: notReady });
    // ไม่สำเร็จ (ที่อยู่ว่าง คูปองใช้ไม่ได้ ยังไม่เป็นสมาชิก ฯลฯ): ให้ Apps Script ตัดสินและตอบข้อความเดิม
    if (!run.result || run.result.success !== true) {
      return fallback("ให้ Apps Script ตัดสิน", { detail: String(run.result?.error || run.result?.thrown || "") });
    }

    const request: Record<string, unknown> = { profileName: String(profile.name || "") };
    for (const k of ORDER_PARAMS) if (p[k] !== undefined) request[k] = p[k];
    const predicted = plain(run.result) as Result;
    const ins = await rpc("order_insert", {
      p_row: {
        client_key: clientKey, line_uid: String(profile.sub), is_test: isTest, request, predicted,
        journal: run.tracker.journal, base_rows: run.baseRows,
      },
      p_last_seq: prep.lastSeq,
    });
    if (ins.ok) {
      // ชุดทดสอบสั่งตัวเขียนเอง (บนไฟล์ชีตชั่วคราว) ไม่ปลุก Web App
      if (!isTest) {
        const kick = kickWriter(prep.appsScriptUrl);
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(kick);
      }
      return accepted(ins.id, predicted, isTest ? { timings, ms: Date.now() - t0 } : {});
    }
    if (ins.conflict === "duplicate") {
      const st = await rpc("order_status", { p_id: ins.id });
      if (!st || st.line_uid !== String(profile.sub)) return fallback("clientKey ซ้ำ");
      return accepted(ins.id, st.predicted, { duplicate: true });
    }
    // มีคำสั่งซื้ออื่นเข้ามาระหว่างคำนวณ: คำนวณใหม่โดยนับรวมคำสั่งซื้อนั้น
  }
  return fallback("มีคำสั่งซื้อพร้อมกันหลายรายการ");
}

async function orderStatus(p: P) {
  const id = String(p.requestId || "").trim();
  const key = String(p.clientKey || "").trim();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id) && !/^[A-Za-z0-9-]{16,64}$/.test(key)) return json({ success: false, error: "ไม่พบคำสั่งซื้อ" });
  const st = await rpc("order_status", { p_id: uuidRe.test(id) ? id : null, p_client_key: key || null });
  if (!st) return json({ success: true, found: false });
  const status = st.status === "pending_sheet" ? "pending" : st.status;
  return json({
    success: true, found: true, requestId: st.id, status, orderId: st.revenue_id || "",
    result: st.status === "written" ? st.result : null, changed: !!st.changed,
    predicted: st.predicted, error: st.status === "failed" ? (st.error || "สั่งซื้อไม่สำเร็จ") : "",
  });
}

async function dryRun(p: P, profile: Record<string, unknown>) {
  const { prep, run, notReady, keys } = await predict(profile, p, true);
  return json({
    success: true, dryRun: true, result: plain(run.result), journal: run.tracker.journal, baseRows: run.baseRows,
    accessed: [...run.tracker.accessed], notReady, unsupported: run.tracker.unsupported, blocked: prep.blocked,
    full: keys === FULL_TABS, logs: run.tracker.logs.slice(0, 20),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const t0 = Date.now();
  try {
    const p = await readParams(req);
    const action = String(p.action || "");

    if (action === "health") {
      const r = await rpc("order_prepare", {
        p_tab_keys: ORDER_TABS, p_cached: {}, p_owner: null, p_include_tests: false,
      });
      return json({
        success: true, live: r.settings?.live === true, pending: (r.pending || []).length, blocked: r.blocked,
        appsScriptUrl: !!r.settings?.apps_script_url, ms: Date.now() - t0,
      });
    }
    if (action === "orderStatus") return await orderStatus(p);
    if (action === "kickWriter") {
      if (!(await isInternal(req))) return json({ success: false, error: "ไม่อนุญาต" }, 403);
      const r = await rpc("order_prepare", { p_tab_keys: [], p_cached: {}, p_owner: null, p_include_tests: false });
      return json({ success: true, kick: await kickWriter(String(r.settings?.apps_script_url || "")) });
    }
    if (action !== "createShopOrder" && action !== "createShopOrderDryRun") {
      return fallback("ไม่รองรับ action: " + action);
    }

    // ชุดทดสอบภายใน: ใช้ asUid แทนโทเคน (แถวทดสอบ) — ของจริงต้องมีโทเคน LINE ที่ตรวจแล้วเสมอ
    let profile: Record<string, unknown> | null = null;
    let isTest = false;
    if (p.asUid && (await isInternal(req))) {
      profile = { sub: p.asUid, name: p.asName || "", picture: p.asPicture || "" };
      isTest = true;
    } else {
      if (action === "createShopOrderDryRun") return json({ success: false, error: "ไม่อนุญาต" }, 403);
      const idToken = String(p.idToken || "").trim();
      if (!idToken || !peekLineSub(idToken)) return fallback("ไม่พบโทเคน LINE");
      const who = await verifyLineIdToken(idToken);
      // โทเคนไม่ผ่าน: ให้ Apps Script ตอบข้อความ error ตามรูปแบบเดิม
      if (!who.profile) return fallback("ยืนยันตัวตนกับ LINE ไม่สำเร็จ: " + who.error);
      profile = who.profile;
    }

    if (action === "createShopOrderDryRun") return await dryRun(p, profile);
    return await createOrder(p, profile, isTest, t0);
  } catch (e) {
    console.error(e);
    return fallback("ข้อผิดพลาด: " + String(e));
  }
});
