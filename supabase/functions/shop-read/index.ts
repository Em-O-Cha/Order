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
import { createEnv, PROPS_KEY } from "../_shared/gas_runtime.js";
import {
  createTabLoader, isInternal, json, P, propsFrom, readParams, verifyLineIdToken, CORS,
} from "../_shared/mirror_client.ts";

// แท็บที่ฟังก์ชันใน gas_port.js อ่าน (แท็บที่ไม่อยู่ในรายการ ตัวจำลองจะปฏิเสธและให้ถาม Apps Script)
const TAB_KEYS = [
  "members/Members", "members/Member_Privileges", "members/Points_Log", "members/Coupons",
  "members/Tier_Config", "members/Signup_Privileges", "members/Points_Promos", "members/Tier_Perks",
  "members/Point_Rewards", "members/Rewards_Catalog", "members/Referral_Log",
  "members/Purchase_Referral_Log", "members/Redemption_Log", "members/Shipping_Config",
  "members/Registration_Queue", "revenue/Revenue", "master/SKU", PROPS_KEY,
];

// action -> วิธีเรียก (ตรงกับ doGet ใน Members.gs ทุกตัวอักษร) และต้องมีโทเคน LINE ไหม
type Gas = ReturnType<typeof createGas>;
const ACTIONS: Record<string, { auth: boolean; run: (g: Gas, p: P) => unknown }> = {
  checkMemberStatus: { auth: true, run: (g, p) => g.checkMemberStatus(p.idToken) },
  getTierConfig: {
    auth: false,
    run: (g) => ({
      success: true, tiers: g.getTierConfig_(), signupBonus: g.getSignupBonusPoints_(),
      signupPrivilege: g.getSignupPrivilegeConfig_(), pointsRedeemConfig: g.getPointsRedeemConfig_(),
    }),
  },
  getShopBootstrap: { auth: true, run: (g, p) => g.getShopBootstrap(p.idToken) },
  getMyPrivileges: { auth: true, run: (g, p) => g.getMyPrivileges(p.idToken) },
  getPrivilegesPanelData: { auth: true, run: (g, p) => g.getPrivilegesPanelData(p.idToken) },
  getPointsHistory: { auth: true, run: (g, p) => g.getPointsHistory(p.idToken) },
  getMyOrderHistory: { auth: true, run: (g, p) => g.getMyOrderHistory(p.idToken) },
  getActiveCoupons: { auth: false, run: (g) => g.getActiveCoupons() },
  getMyShippingAddress: { auth: true, run: (g, p) => g.getMyShippingAddress(p.idToken) },
  getReferralPublicStatus: { auth: false, run: (g) => g.getReferralPublicStatus() },
  checkShopDiscounts: {
    auth: true,
    run: (g, p) =>
      g.checkShopDiscounts(p.idToken, p.couponCode, p.subtotal, g.decodeItemsB64_(p.itemsB64),
        p.excludePrivilegeName, p.pointsToRedeem),
  },
  checkPendingOrderPromoStillValid: {
    auth: true,
    run: (g, p) => g.checkPendingOrderPromoStillValid(p.idToken, p.orderId),
  },
};

const loadTabs = createTabLoader(TAB_KEYS);

function fallback(reason: string, extra: Record<string, unknown> = {}): Response {
  return json({ success: false, needsAppsScript: true, reason, ...extra }, 200, "fallback");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const p = await readParams(req);
    const action = String(p.action || "");

    if (action === "health") {
      const { tabs } = await loadTabs();
      return json({ success: true, tabs: tabs.size });
    }

    const spec = ACTIONS[action];
    if (!spec) return fallback("ไม่รองรับ action: " + action);

    let profile: Record<string, unknown> | null = null;
    if (p.asUid && (await isInternal(req))) {
      profile = { sub: p.asUid, name: p.asName || "", picture: p.asPicture || "" };
    } else if (spec.auth) {
      const idToken = String(p.idToken || "").trim();
      if (!idToken) return fallback("ไม่พบโทเคน LINE");
      const who = await verifyLineIdToken(idToken);
      // โทเคนไม่ผ่าน: ให้ Apps Script ตอบข้อความ error ตามรูปแบบเดิม
      if (!who.profile) return fallback("ยืนยันตัวตนกับ LINE ไม่สำเร็จ: " + who.error);
      profile = who.profile;
    }

    const { tabs, dirty } = await loadTabs();
    const { env, tracker } = createEnv({
      tabs, loadedSources: new Set(TAB_KEYS), props: propsFrom(tabs.get(PROPS_KEY)), profile,
    });
    const result = spec.run(createGas(env), p);

    if (tracker.unsupported.length) return fallback("ตัวจำลองไม่รองรับ", { detail: tracker.unsupported.slice(0, 3) });
    if (tracker.writes.length) return fallback("ต้องเขียนชีต", { detail: tracker.writes.slice(0, 3) });
    const notReady = [...tracker.accessed].filter((k) => dirty.has(k) || !tabs.has(k));
    if (notReady.length) return fallback("สำเนายังไม่ทัน", { detail: notReady });
    // "ยังไม่เป็นสมาชิก" ให้ Apps Script ยืนยันเสมอ: คนที่เพิ่งสมัครเสร็จ (คิวสมัครเขียนชีตจาก trigger)
    // อาจยังไม่มีในสำเนา และคนที่ยังไม่สมัครมีไม่มาก ถามช้าลงนิดเดียวไม่เป็นไร
    if (result && typeof result === "object" && (result as { isMember?: boolean }).isMember === false) {
      return fallback("ยืนยันสถานะสมาชิกกับชีต");
    }

    return json(result);
  } catch (e) {
    console.error(e);
    return fallback("ข้อผิดพลาด: " + String(e));
  }
});
