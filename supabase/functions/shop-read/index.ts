// shop-read: ให้หน้าร้านและหน้าสมาชิกอ่าน/คำนวณจาก Supabase แทนการถาม Apps Script
//
// รันฟังก์ชันเดิมของ Members.gs (gas_port.js — ดึงมาอัตโนมัติ ไม่ได้เขียนใหม่) บนสำเนาชีตผ่านตัวจำลอง
// (gas_runtime.js) ผลลัพธ์จึงเหมือน Apps Script ทุกช่อง แต่ตอบเร็วกว่ามาก
//
// คำขอ: POST body เป็น query string แบบเดียวกับที่ส่งให้ Apps Script (text/plain ไม่มี preflight)
//   action=getShopBootstrap&idToken=...
// คำตอบ: เหมือน Apps Script ทุกช่อง หรือ { success:false, needsAppsScript:true, reason } เมื่อ
//   - ฟังก์ชันพยายามเขียนชีต (เช่น ซ่อมคอลัมน์ Tier) หรือใช้ความสามารถที่ตัวจำลองไม่มี
//   - แท็บที่ใช้มีการเขียนหลังการคัดลอกล่าสุด (สำเนายังไม่ทัน)
//   หน้าเว็บจะถาม Apps Script แทนทุกกรณีที่ไม่สำเร็จ
//
// ตรวจโทเคน LINE กับ LINE ทุกครั้ง แล้วใช้ LINE UID จากโทเคนเท่านั้น
// ยกเว้นคำขอจากชุดเทียบผลใน Apps Script ที่แนบ x-internal-key (ค่าเก็บใน Supabase เรียกได้แค่ service_role)
// deploy ด้วย verify_jwt = false เพราะหน้าเว็บไม่มี JWT ของ Supabase มีแต่โทเคน LINE

import { createGas } from "./gas_port.js";
import { createEnv, overlayJournals, PROPS_KEY } from "../_shared/gas_runtime.js";
import {
  createTabLoader, isInternal, json, P, propsFrom, readParams, rpc, Tab, verifyLineIdToken, CORS,
} from "../_shared/mirror_client.ts";

// แท็บที่ฟังก์ชันใน gas_port.js อ่าน (แท็บที่ไม่อยู่ในรายการ ตัวจำลองจะปฏิเสธและให้ถาม Apps Script)
const TAB_KEYS = [
  "members/Members", "members/Member_Privileges", "members/Points_Log", "members/Coupons",
  "members/Tier_Config", "members/Signup_Privileges", "members/Points_Promos", "members/Tier_Perks",
  "members/Point_Rewards", "members/Rewards_Catalog", "members/Referral_Log",
  "members/Purchase_Referral_Log", "members/Redemption_Log", "members/Shipping_Config",
  "members/Registration_Queue", "revenue/Revenue", "master/SKU", PROPS_KEY,
];

// แท็บที่แต่ละ action ใช้ (วัดจากการรันกับสมาชิกทุกคน) — โหลดแค่นี้ก่อน เครื่องที่เพิ่งเปิดจะดึงข้อมูลน้อยลง
// ถ้าฟังก์ชันไปอ่านแท็บนอกรายการ ตัวจำลองจะหยุด แล้วรันใหม่ด้วยทุกแท็บ (ผลเหมือนเดิมเสมอ แค่ช้าลงครั้งนั้น)
const T = (...keys: string[]) => [...keys, PROPS_KEY];
const M = "members/Members", MP = "members/Member_Privileges", TC = "members/Tier_Config", CP = "members/Coupons";
const PP = "members/Points_Promos", SKU = "master/SKU", REV = "revenue/Revenue";

// action -> วิธีเรียก (ตรงกับ doGet ใน Members.gs ทุกตัวอักษร) และต้องมีโทเคน LINE ไหม
type Gas = ReturnType<typeof createGas>;
const ACTIONS: Record<string, { auth: boolean; tabs: string[]; run: (g: Gas, p: P) => unknown }> = {
  checkMemberStatus: { auth: true, tabs: T(M, TC), run: (g, p) => g.checkMemberStatus(p.idToken) },
  getTierConfig: {
    auth: false,
    tabs: T(TC),
    run: (g) => ({
      success: true, tiers: g.getTierConfig_(), signupBonus: g.getSignupBonusPoints_(),
      signupPrivilege: g.getSignupPrivilegeConfig_(), pointsRedeemConfig: g.getPointsRedeemConfig_(),
    }),
  },
  getShopBootstrap: { auth: true, tabs: T(M, MP, TC, CP, PP, SKU), run: (g, p) => g.getShopBootstrap(p.idToken) },
  getMyPrivileges: { auth: true, tabs: T(M, MP), run: (g, p) => g.getMyPrivileges(p.idToken) },
  getPrivilegesPanelData: {
    auth: true,
    tabs: T(M, MP, TC, PP, "members/Rewards_Catalog", "members/Tier_Perks"),
    run: (g, p) => g.getPrivilegesPanelData(p.idToken),
  },
  getPointsHistory: { auth: true, tabs: T(M, "members/Points_Log"), run: (g, p) => g.getPointsHistory(p.idToken) },
  getMyOrderHistory: { auth: true, tabs: T(M, REV), run: (g, p) => g.getMyOrderHistory(p.idToken) },
  getActiveCoupons: { auth: false, tabs: T(CP), run: (g) => g.getActiveCoupons() },
  getMyShippingAddress: { auth: true, tabs: T(M), run: (g, p) => g.getMyShippingAddress(p.idToken) },
  getReferralPublicStatus: { auth: false, tabs: T(), run: (g) => g.getReferralPublicStatus() },
  checkShopDiscounts: {
    auth: true,
    tabs: T(M, MP, TC, CP, PP, SKU, REV, "members/Shipping_Config"),
    run: (g, p) =>
      g.checkShopDiscounts(p.idToken, p.couponCode, p.subtotal, g.decodeItemsB64_(p.itemsB64),
        p.excludePrivilegeName, p.pointsToRedeem),
  },
  checkPendingOrderPromoStillValid: {
    auth: true,
    tabs: T(M, REV),
    run: (g, p) => g.checkPendingOrderPromoStillValid(p.idToken, p.orderId),
  },
};

const loadTabs = createTabLoader(TAB_KEYS);
const NOT_LOADED = "gas_runtime: ไม่ได้โหลดแท็บ ";

// เวลาที่ใช้แต่ละช่วงของคำขอ (ส่งกลับใน header x-timings ไว้วัดผล ไม่กระทบเนื้อคำตอบ)
type Timings = Record<string, number>;
const timingHeader = (t: Timings) => ({ "x-timings": Object.entries(t).map(([k, v]) => `${k}=${v}`).join(",") });

function fallback(reason: string, extra: Record<string, unknown> = {}, t: Timings = {}): Response {
  return json({ success: false, needsAppsScript: true, reason, ...extra }, 200, "fallback", timingHeader(t));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const t0 = Date.now();
  const t: Timings = {};
  const fallback_ = (reason: string, extra: Record<string, unknown> = {}) => {
    t.total = Date.now() - t0;
    return fallback(reason, extra, t);
  };

  try {
    const p = await readParams(req);
    const action = String(p.action || "");

    if (action === "health") {
      const { tabs } = await loadTabs(TAB_KEYS);
      return json({ success: true, tabs: tabs.size });
    }

    const spec = ACTIONS[action];
    if (!spec) return fallback_("ไม่รองรับ action: " + action);

    // เริ่มโหลดสำเนาไปพร้อมกับตรวจโทเคน LINE (ไม่ต้องรอกัน) — ถ้าตรวจไม่ผ่านก็แค่ทิ้งผลโหลด
    const tl = Date.now();
    const loadingFirst = loadTabs(spec.tabs);
    loadingFirst.catch(() => {});

    let profile: Record<string, unknown> | null = null;
    if (p.asUid && (await isInternal(req))) {
      profile = { sub: p.asUid, name: p.asName || "", picture: p.asPicture || "" };
    } else if (spec.auth) {
      const idToken = String(p.idToken || "").trim();
      if (!idToken) return fallback_("ไม่พบโทเคน LINE");
      const tv = Date.now();
      const who = await verifyLineIdToken(idToken);
      t.verify = Date.now() - tv;
      // โทเคนไม่ผ่าน: ให้ Apps Script ตอบข้อความ error ตามรูปแบบเดิม
      if (!who.profile) return fallback_("ยืนยันตัวตนกับ LINE ไม่สำเร็จ: " + who.error);
      profile = who.profile;
    }

    let loaded = await loadingFirst;
    t.load = Date.now() - tl;
    t.prepare = loaded.ms;
    t.fetched = loaded.fetched;
    t.fetch = loaded.fetchMs;
    const tr = Date.now();
    const run = (tabs: Map<string, Tab>, keys: string[]) => {
      const { env, tracker } = createEnv({
        tabs, loadedSources: new Set(keys), props: propsFrom(tabs.get(PROPS_KEY)), profile,
      });
      return { result: spec.run(createGas(env), p), tracker, tabs };
    };
    let out = run(loaded.tabs, spec.tabs);
    // ฟังก์ชันไปอ่านแท็บนอกรายการของ action: โหลดทุกแท็บแล้วรันใหม่
    if (out.tracker.unsupported.some((u: string) => String(u).startsWith(NOT_LOADED))) {
      const tf = Date.now();
      loaded = await loadTabs(TAB_KEYS);
      t.full = Date.now() - tf;
      out = run(loaded.tabs, TAB_KEYS);
    }
    // คนที่เพิ่งสมัครผ่าน Supabase แต่แถวยังไม่ลงชีต/ยังไม่อยู่ในสำเนา: เล่นการสมัครนั้นทับสำเนาแล้วตอบใหม่
    // (บัตรสมาชิก/สิทธิ์ต้อนรับเห็นทันที ไม่ต้องรอตัวเขียนใน Apps Script)
    const notMember = (r: unknown) => !!r && typeof r === "object" && (r as { isMember?: boolean }).isMember === false;
    if (notMember(out.result) && profile?.sub && !out.tracker.unsupported.length && !out.tracker.writes.length) {
      const pending = await rpc("signup_pending_for", { p_line_uid: String(profile.sub) });
      if (Array.isArray(pending) && pending.length) {
        // การสมัครต้องเล่นทับด้วยแท็บครบชุด (journal อ้างอิงแถวของหลายแท็บ)
        if (loaded.tabs.size < TAB_KEYS.length) loaded = await loadTabs(TAB_KEYS);
        out = run(overlayJournals(loaded.tabs, pending), TAB_KEYS);
      }
    }
    const { result, tracker, tabs } = out;
    t.run = Date.now() - tr;

    if (tracker.unsupported.length) return fallback_("ตัวจำลองไม่รองรับ", { detail: tracker.unsupported.slice(0, 3) });
    if (tracker.writes.length) return fallback_("ต้องเขียนชีต", { detail: tracker.writes.slice(0, 3) });
    const notReady = [...tracker.accessed].filter((k) => loaded.dirty.has(k) || !tabs.has(k));
    if (notReady.length) return fallback_("สำเนายังไม่ทัน", { detail: notReady });
    // "ยังไม่เป็นสมาชิก" ให้ Apps Script ยืนยันเสมอ: คนที่เพิ่งสมัครทางเดิม (คิวสมัครเขียนชีตจาก trigger)
    // อาจยังไม่มีในสำเนา และคนที่ยังไม่สมัครมีไม่มาก ถามช้าลงนิดเดียวไม่เป็นไร
    if (notMember(result)) return fallback_("ยืนยันสถานะสมาชิกกับชีต");

    t.total = Date.now() - t0;
    return json(result, 200, "supabase", timingHeader(t));
  } catch (e) {
    console.error(e);
    return fallback_("ข้อผิดพลาด: " + String(e));
  }
});
