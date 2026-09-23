// member-signup: สมัครสมาชิกบน Supabase (เฟส 3 ขั้น "ย้ายการสมัครสมาชิก")
//
// รัน registerMember ตัวเดิมของ Members.gs (gas_port.js — ดึงมาอัตโนมัติ ไม่ได้เขียนใหม่) บนสำเนาชีต
// ผ่านตัวจำลองในโหมดบันทึกการเขียน: ได้คำตอบเหมือน Apps Script ทุกช่อง และได้รายการที่ต้องเขียนลงชีต
// (แถวสมาชิก สิทธิ์ต้อนรับ ฯลฯ) ครบทุกค่า งานหลังสมัคร (ข้อความต้อนรับ LINE, รางวัลผู้แนะนำ) ถูกจดไว้
// ให้ Apps Script ทำหลังเขียนชีตเสร็จ
//
// action=registerMember — สมัครจริง (ตาราง signup.requests) แล้วตอบบัตรสมาชิกทันที
//   หน้าเว็บ: idToken=...&phoneNumber=...&fullName=...&birthday=...&referrerCode=...
//   ตอบเหมือน registerMember ของ Apps Script ทุกช่อง หรือ { success:false, needsAppsScript:true, reason } เมื่อ
//     - สวิตช์ signup.settings.live ยังปิด
//     - แท็บใน block_dirty_keys มีธงข้อมูลเปลี่ยน (สำเนายังไม่ทัน เช่น แอดมินเพิ่งแก้ค่าตั้งการสมัคร)
//     - ตัวจำลองไม่รองรับสิ่งที่โค้ดทำ / เกิดข้อผิดพลาด
//     หน้าเว็บจะสมัครทาง Apps Script เดิมแทนทุกกรณี
//   การสมัครที่รับแล้วแต่ยังไม่อยู่ในสำเนา ถูกเล่นทับสำเนาก่อนรัน (overlayJournals) จึงเช็คซ้ำ/ออกรหัสสมาชิก
//   ต่อเนื่องถูกต้อง และดัชนีไม่ซ้ำใน signup.requests กันคนสมัครพร้อมกัน (รหัสชน = คำนวณใหม่)
//   ชุดทดสอบภายใน (x-internal-key + asUid) สมัครได้แม้สวิตช์ปิด แถวจะถูกติดป้าย is_test (แยกจากของจริงทั้งหมด:
//   ของจริงไม่นับแถวทดสอบ ตัวเขียนของจริงไม่แตะแถวทดสอบ)
//   บันทึกสำเร็จแล้วปลุก Web App "Members LINE" (signup.settings.apps_script_url) ให้เขียนแถวลงชีตทันที
//   เบื้องหลัง — ลูกค้าไม่ต้องรอ ถ้าปลุกไม่สำเร็จ Apps Script มีรอบสำรองมาเก็บ
//
// action=registerMemberDryRun — (ทดสอบเท่านั้น ต้องมี x-internal-key) รัน registerMember โดยไม่บันทึกอะไร
//   สำหรับ signupCompareDryRun() ใน apps-script/SupabaseSignup.gs
//   asUid=...&asName=...&asPicture=...&phoneNumber=...&fullName=...&birthday=...&referrerCode=...[&simulate=JSON]
//   simulate: สมมติค่าตั้งโดยไม่แตะของจริง ใช้ทดสอบโปรที่ปิดอยู่
//     { props: { SIGNUP_PRIVILEGE_CONFIG: "...", ... },      Script Properties ที่จะใช้แทน
//       tabs:  { "members/Signup_Privileges": [[...], ...] } แถวข้อมูล (ไม่รวมหัวตาราง) ที่จะใช้แทนทั้งแท็บ
//     }                                                      ค่า Date ในแถวส่งเป็นสตริง ISO แบบเดียวกับสำเนา
//   คำตอบ: { success:true, dryRun:true, result, journal, deferred, baseRows, accessed, notReady, unsupported, logs }
//     journal  = การเขียนชีตตามลำดับ (ดู gas_runtime.js) ค่า Date อยู่ในรูป { $date: ISO }
//     deferred = งานหลังสมัครที่ Apps Script ต้องทำต่อ
//     baseRows = แถวสุดท้ายของแต่ละแท็บก่อนรัน (แถวใน journal ที่เกินค่านี้ = ต่อท้ายชีต)
//     notReady = แท็บที่ใช้แล้วสำเนายังไม่ทัน

import { createGas } from "./gas_port.js";
import { createEnv, overlayJournals, prepareTab, PROPS_KEY } from "../_shared/gas_runtime.js";
import {
  createTabLoader, CORS, getInternalKey, isInternal, json, P, propsFrom, readParams, rpc, Tab, verifyLineIdToken,
} from "../_shared/mirror_client.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

// แท็บที่ registerMember ใช้ (แท็บอื่นตัวจำลองจะปฏิเสธ แล้วถอยไป Apps Script)
const TAB_KEYS = [
  "members/Members", "members/Member_Privileges", "members/Signup_Privileges", "members/Tier_Config", PROPS_KEY,
];
// registerMember แค่ต่อท้ายสิทธิ์ต้อนรับใน Member_Privileges ไม่อ่านแถวเดิม — โหลดแค่หัวตาราง + แถวสุดท้าย
const META_ONLY = ["members/Member_Privileges"];
const MAX_ATTEMPTS = 5;

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

// รัน registerMember ตัวเดิมบนแท็บที่ให้มา (โหมดบันทึกการเขียน) งานหลังสมัครถูกจดไว้ใน deferred
function runRegisterMember(tabs: Map<string, Tab>, props: Record<string, string>, profile: Record<string, unknown>, p: P) {
  const { env, tracker } = createEnv({ tabs, loadedSources: new Set(TAB_KEYS), props, profile, journal: true });
  const deferred: unknown[] = [];
  const gas = createGas({
    ...env,
    sendLineMessages_: (to: unknown, messages: unknown) => {
      deferred.push({ fn: "sendLineMessages_", args: plain([to, messages]) });
    },
    grantReferralRewardOnSignupIfNeeded_: (...args: unknown[]) => {
      deferred.push({ fn: "grantReferralRewardOnSignupIfNeeded_", args: plain(args) });
    },
  });
  let result: any;
  try {
    result = gas.registerMember("supabase", p.phoneNumber, p.fullName, p.birthday, p.referrerCode);
  } catch (e) {
    result = { thrown: String(e) };
  }
  const baseRows = Object.fromEntries([...tabs].map(([k, t]) => [k, t.lastRow]));
  return { result, tracker, deferred, baseRows };
}

// ---------------------------------------------------------------------------
// สมัครจริง: โหลดทุกอย่างในคำขอเดียว (signup_prepare) แคชแท็บไว้ข้ามคำขอ
// ---------------------------------------------------------------------------
const tabCache = new Map<string, { readAt: string; tab: Tab }>();

async function prepare(includeTests = false) {
  const cached = Object.fromEntries([...tabCache].map(([k, v]) => [k, v.readAt]));
  const r = await rpc("signup_prepare", {
    p_tab_keys: TAB_KEYS, p_meta_only: META_ONLY, p_cached: cached, p_include_tests: includeTests,
  });
  for (const [key, raw] of Object.entries(r.tabs as Record<string, any>)) {
    tabCache.set(key, { readAt: raw.read_at, tab: prepareTab(key, raw) });
  }
  const versions = r.versions as Record<string, { read_at: string; dirty: boolean }>;
  const tabs = new Map<string, Tab>();
  for (const k of TAB_KEYS) {
    const c = tabCache.get(k);
    if (c && versions[k] && c.readAt === versions[k].read_at) tabs.set(k, c.tab);
  }
  const blocked: string[] = Array.isArray(r.blocked) ? r.blocked : TAB_KEYS.filter((k) => versions[k]?.dirty);
  return {
    tabs, blocked, pending: r.pending as any[], live: r.settings?.live === true,
    appsScriptUrl: typeof r.settings?.apps_script_url === "string" ? r.settings.apps_script_url : "",
  };
}

// ปลุก Apps Script ให้เขียนการสมัครที่รอลงชีต (Members.gs doPost ผ่าน SupabaseSignup.gs) — ไม่ throw
async function kickWriter(url: string): Promise<string> {
  if (!url) return "ยังไม่ได้ตั้ง apps_script_url";
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "text/plain" }, redirect: "follow",
      body: JSON.stringify({ action: "signupWriteNow", key: await getInternalKey() }),
    });
    return `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
  } catch (e) {
    console.error("kickWriter", e);
    return "ข้อผิดพลาด: " + String(e);
  }
}

const DUPLICATE_ERRORS: Record<string, string> = {
  // ข้อความเดียวกับ registerMember
  line_uid: "บัญชี LINE นี้เป็นสมาชิกอยู่แล้ว",
  phone: "เบอร์โทรนี้ถูกใช้สมัครสมาชิกไปแล้ว",
};

async function registerMemberLive(p: P, profile: Record<string, unknown>, isTest: boolean, t0: number) {
  const timings: Record<string, number> = {};
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const tp = Date.now();
    const prep = await prepare(isTest);
    timings["prepare" + attempt] = Date.now() - tp;
    if (!prep.live && !isTest) return fallback("ยังไม่เปิดใช้การสมัครผ่าน Supabase");
    if (prep.blocked.length) return fallback("สำเนายังไม่ทัน", { detail: prep.blocked });
    const missing = TAB_KEYS.filter((k) => !prep.tabs.has(k));
    if (missing.length) return fallback("สำเนาไม่ครบ", { detail: missing });

    const tr = Date.now();
    const tabs = overlayJournals(prep.tabs, prep.pending);
    const run = runRegisterMember(tabs, propsFrom(tabs.get(PROPS_KEY)), profile, p);
    timings["run" + attempt] = Date.now() - tr;
    if (run.tracker.unsupported.length) {
      return fallback("ตัวจำลองไม่รองรับ", { detail: run.tracker.unsupported.slice(0, 3) });
    }
    if (!run.result || run.result.thrown) return fallback("ข้อผิดพลาด: " + String(run.result?.thrown));
    // เงื่อนไขไม่ผ่าน (เบอร์ผิด/ซ้ำ, ไม่กรอกชื่อ ฯลฯ): ตอบข้อความเดิมของ registerMember ได้เลย ไม่มีอะไรต้องบันทึก
    if (!run.result.success) return json({ ...run.result, ...(isTest ? { timings, ms: Date.now() - t0 } : {}) });

    const ti = Date.now();
    const ins = await rpc("signup_insert", {
      p_row: {
        line_uid: profile.sub, phone: run.result.member?.phone, member_code: run.result.memberCode, is_test: isTest,
        request: {
          phoneNumber: p.phoneNumber || "", fullName: p.fullName || "", birthday: p.birthday || "",
          referrerCode: p.referrerCode || "", displayName: profile.name || "", picture: profile.picture || "",
        },
        result: plain(run.result), journal: run.tracker.journal, deferred: run.deferred, base_rows: run.baseRows,
      },
    });
    timings["insert" + attempt] = Date.now() - ti;
    if (ins.ok) {
      // ปลุกตัวเขียนเบื้องหลัง (ตอบลูกค้าก่อน) — แถวทดสอบไม่ปลุก ชุดทดสอบสั่งตัวเขียนเอง
      if (!isTest && prep.appsScriptUrl) {
        const kick = kickWriter(prep.appsScriptUrl);
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(kick);
      }
      return json({ ...run.result, ...(isTest ? { signupId: ins.id, timings, ms: Date.now() - t0 } : {}) });
    }
    if (DUPLICATE_ERRORS[ins.conflict]) {
      return json({ success: false, error: DUPLICATE_ERRORS[ins.conflict], ...(isTest ? { timings } : {}) });
    }
    // รหัสสมาชิกชนกับคนที่สมัครพร้อมกัน: โหลดใหม่ (รวมคนนั้นแล้ว) แล้วคำนวณอีกรอบ
  }
  return fallback("ออกรหัสสมาชิกไม่สำเร็จ (มีคนสมัครพร้อมกันหลายคน)");
}

// ---------------------------------------------------------------------------
// ทดลองโดยไม่บันทึก (ชุดเทียบผล)
// ---------------------------------------------------------------------------
const loadTabsForDryRun = createTabLoader([...TAB_KEYS, "members/Points_Log", "members/Referral_Log"]);
type Simulate = { props?: Record<string, string>; tabs?: Record<string, unknown[][]> };

// แทนที่แท็บด้วยแถวที่สมมติ (หัวตารางเดิม) ในสำเนาของคำขอนี้เท่านั้น
function simulateTabs(tabs: Map<string, Tab>, sim: Simulate): Map<string, Tab> {
  const out = new Map(tabs);
  for (const [key, lines] of Object.entries(sim.tabs || {})) {
    const orig = tabs.get(key);
    if (!orig) throw new Error("simulate: ไม่มีแท็บ " + key);
    const rows = lines.map((line, i) => {
      const data: Record<string, unknown> = {};
      line.forEach((v, c) => {
        if (v !== "" && v !== null && v !== undefined) data[orig.headers[c] ?? "__col" + (c + 1)] = v;
      });
      return [i + 2, data];
    });
    out.set(key, prepareTab(key, {
      spreadsheet_id: orig.spreadsheetId, raw_headers: orig.rawHeaders, headers: orig.headers, rows,
    }));
  }
  return out;
}

async function registerMemberDryRun(p: P, profile: Record<string, unknown>) {
  const loaded = await loadTabsForDryRun();
  const sim: Simulate = p.simulate ? JSON.parse(p.simulate) : {};
  const tabs = simulateTabs(loaded.tabs, sim);
  const props = { ...propsFrom(tabs.get(PROPS_KEY)), ...(sim.props || {}) };
  const run = runRegisterMember(tabs, props, profile, p);
  const accessed = [...run.tracker.accessed];
  return json({
    success: true, dryRun: true, result: run.result, journal: run.tracker.journal, deferred: run.deferred,
    baseRows: run.baseRows, accessed, notReady: accessed.filter((k) => loaded.dirty.has(k) || !tabs.has(k)),
    unsupported: run.tracker.unsupported, logs: run.tracker.logs.slice(0, 20),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const t0 = Date.now();

  try {
    const p = await readParams(req);
    const action = String(p.action || "");
    const internal = await isInternal(req);

    if (action === "registerMember") {
      let profile: Record<string, unknown>;
      if (internal && p.asUid) {
        profile = { sub: p.asUid, name: p.asName || "", picture: p.asPicture || "" };
      } else {
        const idToken = String(p.idToken || "").trim();
        if (!idToken) return fallback("ไม่พบโทเคน LINE");
        const who = await verifyLineIdToken(idToken);
        // โทเคนไม่ผ่าน: ให้ Apps Script ตอบข้อความ error ตามรูปแบบเดิม
        if (!who.profile) return fallback("ยืนยันตัวตนกับ LINE ไม่สำเร็จ: " + who.error);
        profile = who.profile;
      }
      return await registerMemberLive(p, profile, internal && !!p.asUid, t0);
    }

    if (!internal) return json({ success: false, error: "ไม่รองรับ" }, 403);
    if (action === "health") {
      const prep = await prepare();
      return json({
        success: true, tabs: prep.tabs.size, live: prep.live, pending: prep.pending.length, blocked: prep.blocked,
        appsScriptUrl: !!prep.appsScriptUrl, ms: Date.now() - t0,
      });
    }
    // ตรวจตอนเปิดใช้งาน: ปลุก Apps Script แล้วดูคำตอบ
    if (action === "kickWriter") {
      const prep = await prepare();
      return json({ success: true, kick: await kickWriter(prep.appsScriptUrl) });
    }
    if (action === "registerMemberDryRun") {
      if (!p.asUid) return json({ success: false, error: "ต้องระบุ asUid" }, 400);
      return await registerMemberDryRun(p, { sub: p.asUid, name: p.asName || "", picture: p.asPicture || "" });
    }
    return json({ success: false, error: "ไม่รองรับ action: " + action }, 400);
  } catch (e) {
    console.error(e);
    return fallback("ข้อผิดพลาด: " + String(e));
  }
});
