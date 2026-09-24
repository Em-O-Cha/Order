// ส่วนที่ Edge Function ที่อ่านสำเนาชีตใช้ร่วมกัน (shop-read, member-signup)
// ย้ายมาจาก shop-read/index.ts ตามต้นฉบับ

import { prepareTab, withOwnerRows } from "./gas_runtime.js";

export const LIFF_CHANNEL_ID = "2010892131";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type P = Record<string, string | undefined>;

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-internal-key",
};

export function json(body: unknown, status = 200, source = "supabase", extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "x-source": source, ...extraHeaders },
  });
}

export async function rpc(fn: string, args: Record<string, unknown>): Promise<any> {
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
export type Tab = ReturnType<typeof prepareTab>;

// ตัวโหลดต่อ Edge Function (แคชอยู่ข้ามคำขอในเครื่องเดียวกัน)
// - เวอร์ชันแท็บ + เนื้อหาแท็บที่เปลี่ยนมาในคำขอเดียว (mirror_load)
// - ขอเฉพาะบางแท็บได้ (loadTabs(keys)) เครื่องที่เพิ่งเปิดจะได้ไม่ต้องดึงทุกแท็บ
// - 'source/tab#slim' = ฉบับย่อ (แคชได้) + owner = แถวเต็มของลูกค้าที่ถาม (ต่อคำขอ) รวมเป็นแท็บ 'source/tab'
// - คำขอที่เข้ามาพร้อมกันและขอชุดเดียวกันใช้ผลโหลดรอบเดียวกัน ไม่ต่างคนต่างโหลด
// ผลลัพธ์ใช้ชื่อแท็บจริงเสมอ (tabs/dirty ของ 'revenue/Revenue#slim' อยู่ที่ 'revenue/Revenue')
export type Owner = { uid?: string; order_id?: string };
export type Loaded = { tabs: Map<string, Tab>; dirty: Set<string>; ms: number; fetched: number; fetchMs: number };
export const baseKey = (k: string) => k.split("#")[0];
export function createTabLoader(tabKeys: string[]) {
  const tabCache = new Map<string, { readAt: string; tab: Tab }>();
  const inFlight = new Map<string, Promise<Loaded>>();
  async function load(keys: string[], owner: Owner | null): Promise<Loaded> {
    const t0 = Date.now();
    const cached = Object.fromEntries(keys.filter((k) => tabCache.has(k)).map((k) => [k, tabCache.get(k)!.readAt]));
    const r = await rpc("mirror_load", { p_tab_keys: keys, p_cached: cached, p_owner: owner });
    const fetchMs = Date.now() - t0;
    for (const [key, raw] of Object.entries(r.tabs as Record<string, any>)) {
      tabCache.set(key, { readAt: raw.read_at, tab: prepareTab(baseKey(key), raw) });
    }
    const versions = r.versions as Record<string, { read_at: string; dirty: boolean }>;
    const ownerRows = (r.owner || {}) as Record<string, [number, unknown][]>;
    const tabs = new Map<string, Tab>();
    for (const k of keys) {
      const v = versions[k];
      const c = tabCache.get(k);
      if (!v || !c || c.readAt !== v.read_at) continue;
      const base = baseKey(k);
      tabs.set(base, k === base ? c.tab : withOwnerRows(c.tab, base, ownerRows[base]));
    }
    const dirty = new Set(Object.keys(versions).filter((k) => versions[k].dirty).map(baseKey));
    return { tabs, dirty, ms: Date.now() - t0, fetched: Object.keys(r.tabs).length, fetchMs };
  }
  return function loadTabs(keys: string[] = tabKeys, owner: Owner | null = null): Promise<Loaded> {
    const id = keys.join("|") + (owner ? "|" + JSON.stringify(owner) : "");
    let p = inFlight.get(id);
    if (!p) {
      p = load(keys, owner).finally(() => inFlight.delete(id));
      inFlight.set(id, p);
    }
    return p;
  };
}

// LINE UID จากโทเคนโดยยังไม่ตรวจ — ใช้แค่เริ่มโหลดข้อมูลล่วงหน้าไปพร้อมกับการตรวจโทเคนกับ LINE
// (ผลที่ตอบลูกค้าต้องมาจากโปรไฟล์ที่ตรวจแล้วเสมอ ถ้าไม่ตรงกันต้องโหลดใหม่)
export function peekLineSub(idToken: string): string {
  try {
    const part = idToken.split(".")[1] || "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4);
    const sub = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))).sub;
    return typeof sub === "string" ? sub : "";
  } catch {
    return "";
  }
}

export function propsFrom(tab: Tab | undefined): Record<string, string> {
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

export async function verifyLineIdToken(idToken: string): Promise<{ profile?: Record<string, unknown>; error?: string }> {
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
// internal key (เก็บใน Supabase เรียกได้แค่ service_role) — ใช้ยืนยันคำขอจากชุดทดสอบ และแนบไปตอนปลุก Apps Script
export async function getInternalKey(): Promise<string> {
  if (!internalKey || Date.now() - internalKey.at > 5 * 60 * 1000) {
    internalKey = { value: String(await rpc("mirror_internal_key", {})), at: Date.now() };
  }
  return internalKey.value;
}

export async function isInternal(req: Request): Promise<boolean> {
  const given = req.headers.get("x-internal-key");
  if (!given) return false;
  const key = await getInternalKey();
  return given.length === key.length && given === key;
}

// รับได้ทั้ง query string ใน URL และใน body (แบบเดียวกับที่ส่งให้ Apps Script) หรือ body เป็น JSON
export async function readParams(req: Request): Promise<P> {
  const out: P = Object.fromEntries(new URL(req.url).searchParams);
  delete out.forceFunctionRegion; // ตัวเลือกภูมิภาคของ Supabase ใน URL ไม่ใช่พารามิเตอร์ของคำขอ
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

