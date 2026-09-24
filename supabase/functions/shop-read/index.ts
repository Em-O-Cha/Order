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
import { createEnv, prepareTab, PROPS_KEY } from "./gas_runtime.js";

const LIFF_CHANNEL_ID = "2010892131";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
type P = Record<string, string | undefined>;
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-internal-key",
};

function json(body: unknown, status = 200, source = "supabase"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "x-source": source },
  });
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

// ---------------------------------------------------------------------------
// สำเนาแท็บในหน่วยความจำ โหลดใหม่เฉพาะแท็บที่ read_at เปลี่ยน
// ---------------------------------------------------------------------------
type Version = { source: string; tab: string; spreadsheet_id: string; read_at: string; dirty: boolean };
const tabCache = new Map<string, { readAt: string; tab: ReturnType<typeof prepareTab> }>();

async function loadTabs(): Promise<{ tabs: Map<string, ReturnType<typeof prepareTab>>; dirty: Set<string> }> {
  const versions: Version[] = await rpc("mirror_tab_versions", {});
  const byKey = new Map(versions.map((v) => [v.source + "/" + v.tab, v]));
  const stale = TAB_KEYS.filter((k) => byKey.has(k) && tabCache.get(k)?.readAt !== byKey.get(k)!.read_at);
  if (stale.length) {
    const fresh = await rpc("mirror_get_tabs", { p_tabs: stale });
    for (const [key, raw] of Object.entries(fresh as Record<string, any>)) {
      tabCache.set(key, { readAt: raw.read_at, tab: prepareTab(key, raw) });
    }
  }
  const tabs = new Map<string, ReturnType<typeof prepareTab>>();
  for (const k of TAB_KEYS) {
    const v = byKey.get(k);
    const c = tabCache.get(k);
    if (v && c && c.readAt === v.read_at) tabs.set(k, c.tab);
  }
  const dirty = new Set(versions.filter((v) => v.dirty).map((v) => v.source + "/" + v.tab));
  return { tabs, dirty };
}

function propsFrom(tab: ReturnType<typeof prepareTab> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!tab) return out;
  for (const data of tab.rows.values()) {
    if (data && data.key !== undefined) out[String(data.key)] = data.value === undefined ? "" : String(data.value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ตรวจตัวตน
// ---------------------------------------------------------------------------
const verified = new Map<string, { profile: Record<string, unknown>; exp: number }>();

async function verifyLineIdToken(idToken: string): Promise<{ profile?: Record<string, unknown>; error?: string }> {
  const hit = verified.get(idToken);
  if (hit && hit.exp * 1000 > Date.now()) return { profile: hit.profile };
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: LIFF_CHANNEL_ID }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.sub) return { error: String(body.error_description || body.error || `HTTP ${res.status}`) };
  if (verified.size > 1000) verified.clear();
  verified.set(idToken, { profile: body, exp: Number(body.exp) || 0 });
  return { profile: body };
}

let internalKey: { value: string; at: number } | null = null;
async function isInternal(req: Request): Promise<boolean> {
  const given = req.headers.get("x-internal-key");
  if (!given) return false;
  if (!internalKey || Date.now() - internalKey.at > 5 * 60 * 1000) {
    internalKey = { value: String(await rpc("mirror_internal_key", {})), at: Date.now() };
  }
  return given.length === internalKey.value.length && given === internalKey.value;
}

// รับได้ทั้ง query string ใน URL และใน body (แบบเดียวกับที่ส่งให้ Apps Script) หรือ body เป็น JSON
async function readParams(req: Request): Promise<P> {
  const out: P = Object.fromEntries(new URL(req.url).searchParams);
  if (req.method !== "GET") {
    const text = (await req.text()).trim();
    if (text.startsWith("{")) {
      for (const [k, v] of Object.entries(JSON.parse(text))) if (v !== undefined && v !== null) out[k] = String(v);
    } else {
      Object.assign(out, Object.fromEntries(new URLSearchParams(text)));
    }
  }
  return out;
}

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
