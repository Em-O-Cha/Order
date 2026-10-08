// ตัวเชื่อมผู้ให้บริการรับชำระด้วยบัตร — เลือกด้วย secret CARD_PROVIDER ของ Supabase
//   (ไม่ตั้ง)  ยังไม่เชื่อมต่อ: หน้าแอดมินเปิดใช้ไม่ได้
//   mock       ทดสอบระบบโดยไม่ใช้ธนาคาร (โหมดทดสอบ ไม่มีเงินจริง) — ใช้กับชุดทดสอบภายในเท่านั้น
//   kbank      K Payment Link ของกสิกรไทย — ⚠️ รอเอกสาร API ฉบับจริงจากธนาคาร (ดู KBankProvider ด้านล่าง)
//
// ทุกตัวต้องทำ 3 อย่าง: สร้างลิงก์ชำระเงิน / ถามธนาคารว่าลิงก์นี้จ่ายแล้วหรือยัง (เชื่อผลนี้เท่านั้น) /
// อ่านข้อความที่ธนาคารแจ้งเข้ามาว่าเป็นของลิงก์ไหน (ไม่เชื่อสถานะในข้อความ ต้องถามซ้ำเสมอ)

export type CardRow = {
  id: string; order_id: string; amount: number | string; provider: string; mode: string;
  link_id: string | null; pay_url: string | null; status: string; expires_at: string | null;
  paid_amount: number | string | null; paid_ref: string | null; paid_at: string | null;
  confirmed_at: string | null; raw: unknown;
};
export type CreateLinkInput = {
  orderId: string; amount: number; description: string; returnUrl: string; notifyUrl: string; expiresAt: Date;
};
export type CreateLinkResult = { linkId: string; url: string; expiresAt: string; raw: unknown };
export type InquiryResult = {
  status: "pending" | "paid" | "failed" | "expired";
  paidAmount?: number; paidRef?: string; paidAt?: string; raw?: unknown;
};
export type NotifyRef = { linkId?: string; orderId?: string };

export interface CardProvider {
  name: string;
  mode: "live" | "test";
  ready(): { ready: boolean; message: string };
  createLink(input: CreateLinkInput): Promise<CreateLinkResult>;
  inquire(row: CardRow): Promise<InquiryResult>;
  parseNotify(body: string, headers: Headers): NotifyRef;
  notifyAck(): Response;
}

const env = (k: string) => (Deno.env.get(k) || "").trim();

// ---------------------------------------------------------------------------------------------
// mock: ลิงก์พากลับมาหน้าร้านทันที สถานะ "จ่ายแล้ว" ตั้งได้ด้วย action mockPay ของชุดทดสอบภายในเท่านั้น
// ---------------------------------------------------------------------------------------------
class MockProvider implements CardProvider {
  name = "mock";
  mode = "test" as const;
  ready() { return { ready: true, message: "โหมดทดสอบ (mock) — ไม่มีการตัดเงินจริง" }; }
  async createLink(input: CreateLinkInput): Promise<CreateLinkResult> {
    const linkId = "mock_" + crypto.randomUUID();
    const sep = input.returnUrl.includes("?") ? "&" : "?";
    return { linkId, url: input.returnUrl + sep + "mocklink=" + encodeURIComponent(linkId), expiresAt: input.expiresAt.toISOString(), raw: { mock: true } };
  }
  async inquire(row: CardRow): Promise<InquiryResult> {
    const raw = (row.raw || {}) as Record<string, unknown>;
    if (raw.mock_paid) {
      return { status: "paid", paidAmount: Number(raw.mock_paid), paidRef: "MOCK-" + row.id.slice(0, 8), paidAt: String(raw.mock_paid_at || new Date().toISOString()), raw };
    }
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return { status: "expired", raw };
    return { status: "pending", raw };
  }
  parseNotify(body: string): NotifyRef {
    const j = JSON.parse(body || "{}");
    return { linkId: j.linkId ? String(j.linkId) : undefined, orderId: j.orderId ? String(j.orderId) : undefined };
  }
  notifyAck() { return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } }); }
}

// ---------------------------------------------------------------------------------------------
// kbank: K Payment Link (K Payment Gateway) กสิกรไทย
// ⚠️ ยังไม่ได้เขียนส่วนเรียก API จริง — เอกสาร API ของ Payment Link ธนาคารให้หลังอนุมัติร้านค้า
// ได้เอกสารแล้วให้เติม 4 จุดที่มี TODO ด้านล่าง แล้วตั้ง secret ใน Supabase (Edge Functions → Secrets):
//   CARD_PROVIDER=kbank
//   KBANK_API_BASE      ที่อยู่ API (sandbox หรือ production ตามเอกสาร)
//   KBANK_SECRET_KEY    คีย์ลับของร้าน (ห้ามใส่ในโค้ด/แชท)
//   KBANK_MERCHANT_ID   รหัสร้านค้า (ถ้าเอกสารกำหนด)
//   KBANK_MODE          test = sandbox (หน้าแอดมินขึ้นว่าโหมดทดสอบ) / live = เงินจริง
// URL แจ้งผล (notify/webhook) ที่ต้องให้ธนาคาร: https://<project>.supabase.co/functions/v1/card-pay?action=notify
// ---------------------------------------------------------------------------------------------
class KBankProvider implements CardProvider {
  name = "kbank";
  mode = (env("KBANK_MODE") === "live" ? "live" : "test") as "live" | "test";
  private implemented = false; // TODO: เปลี่ยนเป็น true เมื่อเติม createLink / inquire / parseNotify ตามเอกสารจริงแล้ว
  ready() {
    if (!this.implemented) return { ready: false, message: "รอเอกสาร API K Payment Link จากธนาคารเพื่อเชื่อมต่อ" };
    if (!env("KBANK_API_BASE") || !env("KBANK_SECRET_KEY")) return { ready: false, message: "ยังไม่ได้ใส่คีย์ธนาคารใน Supabase Secrets" };
    return { ready: true, message: this.mode === "test" ? "เชื่อมต่อ K Payment Link (sandbox)" : "เชื่อมต่อ K Payment Link" };
  }
  async createLink(_input: CreateLinkInput): Promise<CreateLinkResult> {
    // TODO: เรียก API สร้าง Payment Link: ยอด (บาท), เลขอ้างอิง = orderId, คำอธิบาย, วันหมดอายุ,
    //       redirect/return URL = _input.returnUrl, notify URL = _input.notifyUrl
    //       คืน { linkId: รหัสลิงก์ของธนาคาร, url: ลิงก์ให้ลูกค้าเปิด, expiresAt, raw: คำตอบเต็ม }
    throw new Error("ยังไม่ได้เชื่อมต่อ K Payment Link");
  }
  async inquire(_row: CardRow): Promise<InquiryResult> {
    // TODO: เรียก API ตรวจสถานะลิงก์/รายการด้วย _row.link_id แล้วแปลงเป็น pending / paid / failed / expired
    //       paid ต้องมี paidAmount (บาท), paidRef (เลขอ้างอิงธนาคาร), paidAt
    throw new Error("ยังไม่ได้เชื่อมต่อ K Payment Link");
  }
  parseNotify(_body: string, _headers: Headers): NotifyRef {
    // TODO: อ่านรหัสลิงก์/เลขอ้างอิงจากข้อความแจ้งผลของธนาคาร (ตรวจลายเซ็นถ้าเอกสารกำหนด)
    //       ไม่ต้องเชื่อสถานะในข้อความ — card-pay ถามซ้ำด้วย inquire เสมอ
    return {};
  }
  notifyAck() { return new Response("OK"); } // TODO: ตอบกลับตามรูปแบบที่ธนาคารกำหนด
}

class NoProvider implements CardProvider {
  name = "";
  mode = "test" as const;
  ready() { return { ready: false, message: "ยังไม่ได้เลือกผู้ให้บริการ (ตั้ง secret CARD_PROVIDER ใน Supabase)" }; }
  createLink(): Promise<CreateLinkResult> { return Promise.reject(new Error("ยังไม่ได้เชื่อมต่อธนาคาร")); }
  inquire(): Promise<InquiryResult> { return Promise.reject(new Error("ยังไม่ได้เชื่อมต่อธนาคาร")); }
  parseNotify(): NotifyRef { return {}; }
  notifyAck() { return new Response("OK"); }
}

export function getProvider(name = env("CARD_PROVIDER")): CardProvider {
  if (name === "kbank") return new KBankProvider();
  if (name === "mock") return new MockProvider();
  return new NoProvider();
}
