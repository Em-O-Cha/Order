// member-signup: สมัครสมาชิกบน Supabase (เฟส 3 ขั้น "ย้ายการสมัครสมาชิก")
//
// รัน registerMember ตัวเดิมของ Members.gs (gas_port.js — ดึงมาอัตโนมัติ ไม่ได้เขียนใหม่) บนสำเนาชีต
// ผ่านตัวจำลองในโหมดบันทึกการเขียน: ได้คำตอบเหมือน Apps Script ทุกช่อง และได้รายการที่ต้องเขียนลงชีต
// (แถวสมาชิก สิทธิ์ต้อนรับ ฯลฯ) ครบทุกค่า งานหลังสมัคร (ข้อความต้อนรับ LINE, รางวัลผู้แนะนำ) ถูกจดไว้
// ให้ Apps Script ทำหลังเขียนชีตเสร็จ
//
// ตอนนี้เปิดแค่โหมดทดลอง (ไม่บันทึกอะไร ไม่ตอบลูกค้า) สำหรับชุดเทียบผล signupCompareDryRun() ใน
// apps-script/SupabaseSignup.gs เท่านั้น — ทุกคำขอต้องแนบ x-internal-key
//
// คำขอ: POST body เป็น query string หรือ JSON
//   action=registerMemberDryRun&asUid=...&asName=...&asPicture=...&phoneNumber=...&fullName=...
//          &birthday=...&referrerCode=...
// คำตอบ: { success:true, dryRun:true, result, journal, deferred, baseRows, accessed, notReady, unsupported, logs }
//   result   = สิ่งที่ registerMember คืน (เหมือน Apps Script)
//   journal  = การเขียนชีตตามลำดับ (ดู gas_runtime.js) ค่า Date อยู่ในรูป { $date: ISO }
//   deferred = งานหลังสมัครที่ Apps Script ต้องทำต่อ
//   baseRows = แถวสุดท้ายของแต่ละแท็บในสำเนาก่อนรัน (แถวใน journal ที่เกินค่านี้ = ต่อท้ายชีต)
//   notReady = แท็บที่ใช้แล้วสำเนายังไม่ทัน (มีธง dirty หรือยังไม่มีในสำเนา) — ใช้จริงต้องถอยไป Apps Script

import { createGas } from "./gas_port.js";
import { createEnv, PROPS_KEY } from "../_shared/gas_runtime.js";
import { createTabLoader, isInternal, json, propsFrom, readParams, CORS } from "../_shared/mirror_client.ts";

// แท็บที่ registerMember อ่าน/เขียน (แท็บอื่นตัวจำลองจะปฏิเสธ แล้วคำตอบจะมี unsupported)
const TAB_KEYS = [
  "members/Members", "members/Member_Privileges", "members/Signup_Privileges", "members/Tier_Config",
  "members/Points_Log", "members/Referral_Log", PROPS_KEY,
];
const loadTabs = createTabLoader(TAB_KEYS);

// ค่า Date ในงานหลังสมัครส่งเป็นรูปเดียวกับ journal
function plain(v: unknown): unknown {
  if (v instanceof Date) return { $date: isNaN(v.getTime()) ? null : v.toISOString() };
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x)]));
  }
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    if (!(await isInternal(req))) return json({ success: false, error: "ยังไม่เปิดให้ใช้งาน" }, 403);
    const p = await readParams(req);
    const action = String(p.action || "");

    if (action === "health") {
      const { tabs } = await loadTabs();
      return json({ success: true, tabs: tabs.size });
    }
    if (action !== "registerMemberDryRun") return json({ success: false, error: "ไม่รองรับ action: " + action }, 400);
    if (!p.asUid) return json({ success: false, error: "ต้องระบุ asUid" }, 400);

    const profile = { sub: p.asUid, name: p.asName || "", picture: p.asPicture || "" };
    const { tabs, dirty } = await loadTabs();
    const { env, tracker } = createEnv({
      tabs, loadedSources: new Set(TAB_KEYS), props: propsFrom(tabs.get(PROPS_KEY)), profile, journal: true,
    });
    const deferred: unknown[] = [];
    const envWithDeferred = {
      ...env,
      sendLineMessages_: (to: unknown, messages: unknown) => {
        deferred.push({ fn: "sendLineMessages_", args: plain([to, messages]) });
      },
      grantReferralRewardOnSignupIfNeeded_: (...args: unknown[]) => {
        deferred.push({ fn: "grantReferralRewardOnSignupIfNeeded_", args: plain(args) });
      },
    };

    let result: unknown;
    try {
      result = createGas(envWithDeferred).registerMember(
        "dry-run", p.phoneNumber, p.fullName, p.birthday, p.referrerCode,
      );
    } catch (e) {
      result = { thrown: String(e) };
    }

    const accessed = [...tracker.accessed];
    const baseRows = Object.fromEntries([...tabs].map(([k, t]) => [k, t.lastRow]));
    return json({
      success: true, dryRun: true, result, journal: tracker.journal, deferred, baseRows,
      accessed, notReady: accessed.filter((k) => dirty.has(k) || !tabs.has(k)),
      unsupported: tracker.unsupported, logs: tracker.logs.slice(0, 20),
    });
  } catch (e) {
    console.error(e);
    return json({ success: false, error: "ข้อผิดพลาด: " + String(e) }, 500);
  }
});
