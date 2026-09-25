// admin-read: หน้าแอดมิน (ลิงก์เดิมของ Apps Script) อ่าน/ค้นหาข้อมูลจาก Supabase ให้เร็วขึ้น
//
// รันฟังก์ชันอ่านตัวเดิมของ Members.gs (gas_port.js target admin-read — ดึงมาอัตโนมัติ) บนสำเนาชีต ผลจึงเหมือน
// google.script.run เรียก Apps Script ทุกช่อง ปุ่มที่แก้ข้อมูลยังเรียก Apps Script เหมือนเดิม
//
// ความปลอดภัย: ไม่เก็บ PIN แอดมินใน Supabase — หลังกรอก PIN ถูก Apps Script ออก "ตั๋ว" ให้หน้าแอดมิน
//   ตั๋ว = <หมดอายุ ms>.<HMAC-SHA256(internal key, "admin-read:" + หมดอายุ) เป็น hex>
//   (internal key อยู่ใน mirror.secrets เรียกได้แค่ service_role / Apps Script ที่มี secret key)
//
// คำขอ: POST JSON { action: 'call', fn, args: JSON array (ไม่รวม PIN), token }
// คำตอบ: { success:true, result } | { success:true, fallback:true, reason } (หน้าแอดมินเรียก Apps Script แทน)
//        | { success:false, error } (ตั๋วไม่ถูกต้อง/หมดอายุ -> หน้าแอดมินเรียก Apps Script แทนเช่นกัน)
// deploy ด้วย verify_jwt = false

import { createGas } from "./gas_port.js";
import { createEnv, PROPS_KEY } from "../_shared/gas_runtime.js";
import { CORS, createTabLoader, getInternalKey, json, propsFrom, readParams, Tab } from "../_shared/mirror_client.ts";

// ฟังก์ชันอ่านที่รองรับ -> รับ PIN เป็นพารามิเตอร์แรกหรือไม่
const READS: Record<string, boolean> = {
  searchMembers: true, getMemberPrivileges: true, getBlockedMembers: true, getCampaignAudience: true,
  getAutoMemberConfig: true, getBirthdayPromoConfigForAdmin: true, getCodConfigForAdmin: true,
  getPurchaseReferralConfigForAdmin: true, getReferralConfigForAdmin: true, getShippingConfigForAdmin: true,
  getShopProducts: false, getTierConfigForAdmin: true, listCodBlockedMembers: true, listCodOrders: true,
  listGlobalCoupons: true, listPointsPromos: true, listPurchaseReferrals: true, listRedemptionLog: true,
  listReferrals: true, listRewardsCatalogAdmin: true, listSignupPrivilegeItems: true, listTierPerks: true,
  findLineUidByPhoneFromRevenue: true,
};

const TAB_KEYS = [
  "members/Members", "members/Member_Privileges", "members/Points_Log", "members/Coupons", "members/Tier_Config",
  "members/Signup_Privileges", "members/Points_Promos", "members/Tier_Perks", "members/Point_Rewards",
  "members/Rewards_Catalog", "members/Referral_Log", "members/Purchase_Referral_Log", "members/Redemption_Log",
  "members/Shipping_Config", "members/Registration_Queue", "members/Expiry_Disable_Log",
  "revenue/Revenue", "master/SKU", PROPS_KEY,
];
const loadTabs = createTabLoader(TAB_KEYS);

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function tokenValid(token: string): Promise<boolean> {
  const m = /^(\d{13})\.([0-9a-f]{64})$/.exec(String(token || ""));
  if (!m || Number(m[1]) < Date.now()) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(await getInternalKey()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("admin-read:" + m[1])));
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= sig.charCodeAt(i) ^ m[2].charCodeAt(i);
  return diff === 0;
}

function fallback(reason: string, extra: Record<string, unknown> = {}): Response {
  return json({ success: true, fallback: true, reason, ...extra }, 200, "fallback");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const t0 = Date.now();
  try {
    const p = await readParams(req);
    if (p.action === "health") {
      const { tabs } = await loadTabs();
      return json({ success: true, tabs: tabs.size, ms: Date.now() - t0 });
    }
    if (p.action !== "call") return json({ success: false, error: "ไม่รองรับ action" }, 400);
    if (!(await tokenValid(String(p.token || "")))) return json({ success: false, error: "ตั๋วไม่ถูกต้องหรือหมดอายุ" }, 401);
    const fn = String(p.fn || "");
    if (!Object.prototype.hasOwnProperty.call(READS, fn)) return fallback("ไม่ใช่ฟังก์ชันอ่าน: " + fn);
    let args: unknown[] = [];
    try { args = JSON.parse(String(p.args || "[]")); } catch { return fallback("args ไม่ถูกต้อง"); }
    if (!Array.isArray(args)) return fallback("args ไม่ถูกต้อง");

    const { tabs, dirty } = await loadTabs();
    const { env, tracker } = createEnv({ tabs, loadedSources: new Set(TAB_KEYS), props: propsFrom(tabs.get(PROPS_KEY)), profile: null });
    const gas: Record<string, (...a: unknown[]) => unknown> = createGas({
      ...env, checkAdminPin_: () => true, sendLineMessages_: () => { throw new Error("ห้ามส่งข้อความจากฟังก์ชันอ่าน"); },
    });
    let result: unknown;
    try {
      result = READS[fn] ? gas[fn]("verified-by-token", ...args) : gas[fn](...args);
    } catch (e) {
      return fallback("ข้อผิดพลาด: " + String(e));
    }
    if (tracker.unsupported.length) return fallback("ตัวจำลองไม่รองรับ", { detail: tracker.unsupported.slice(0, 3) });
    if (tracker.writes.length) return fallback("ต้องเขียนชีต", { detail: tracker.writes.slice(0, 3) });
    const notReady = [...tracker.accessed].filter((k) => dirty.has(k) || !tabs.has(k));
    if (notReady.length) return fallback("สำเนายังไม่ทัน", { detail: notReady });
    return json({ success: true, result, ms: Date.now() - t0 });
  } catch (e) {
    console.error(e);
    return fallback("ข้อผิดพลาด: " + String(e));
  }
});
