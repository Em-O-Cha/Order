// ส่วนที่ Edge Function ที่อ่านสำเนาชีตใช้ร่วมกัน (shop-read, member-signup)
// ย้ายมาจาก shop-read/index.ts ตามต้นฉบับ

import { prepareTab } from "./gas_runtime.js";

export const LIFF_CHANNEL_ID = "2010892131";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type P = Record<string, string | undefined>;

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-internal-key",
};

export function json(body: unknown, status = 200, source = "supabase"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "x-source": source },
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
type Version = { source: string; tab: string; spreadsheet_id: string; read_at: string; dirty: boolean };
export type Tab = ReturnType<typeof prepareTab>;

// ตัวโหลดต่อ Edge Function (แคชอยู่ข้ามคำขอในเครื่องเดียวกัน)
export function createTabLoader(tabKeys: string[]) {
  const tabCache = new Map<string, { readAt: string; tab: Tab }>();
  return async function loadTabs(): Promise<{ tabs: Map<string, Tab>; dirty: Set<string> }> {
    const versions: Version[] = await rpc("mirror_tab_versions", {});
    const byKey = new Map(versions.map((v) => [v.source + "/" + v.tab, v]));
    const stale = tabKeys.filter((k) => byKey.has(k) && tabCache.get(k)?.readAt !== byKey.get(k)!.read_at);
    if (stale.length) {
      const fresh = await rpc("mirror_get_tabs", { p_tabs: stale });
      for (const [key, raw] of Object.entries(fresh as Record<string, any>)) {
        tabCache.set(key, { readAt: raw.read_at, tab: prepareTab(key, raw) });
      }
    }
    const tabs = new Map<string, Tab>();
    for (const k of tabKeys) {
      const v = byKey.get(k);
      const c = tabCache.get(k);
      if (v && c && c.readAt === v.read_at) tabs.set(k, c.tab);
    }
    const dirty = new Set(versions.filter((v) => v.dirty).map((v) => v.source + "/" + v.tab));
    return { tabs, dirty };
  };
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
export async function isInternal(req: Request): Promise<boolean> {
  const given = req.headers.get("x-internal-key");
  if (!given) return false;
  if (!internalKey || Date.now() - internalKey.at > 5 * 60 * 1000) {
    internalKey = { value: String(await rpc("mirror_internal_key", {})), at: Date.now() };
  }
  return given.length === internalKey.value.length && given === internalKey.value;
}

// รับได้ทั้ง query string ใน URL และใน body (แบบเดียวกับที่ส่งให้ Apps Script) หรือ body เป็น JSON
export async function readParams(req: Request): Promise<P> {
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

