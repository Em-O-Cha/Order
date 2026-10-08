// ตัวเชื่อมผู้ให้บริการรับชำระด้วยบัตร — เลือกด้วย secret CARD_PROVIDER ของ Supabase
//   (ไม่ตั้ง)  ยังไม่เชื่อมต่อ: หน้าแอดมินเปิดใช้ไม่ได้
//   mock       ทดสอบระบบโดยไม่ใช้ธนาคาร (โหมดทดสอบ ไม่มีเงินจริง) — ใช้กับชุดทดสอบภายในเท่านั้น
//   kbank      K Payment Link ของกสิกรไทย — ⚠️ รอเอกสาร API ฉบับจริงจากธนาคาร (ดู KBankProvider ด้านล่าง)
//   stripe     Stripe Checkout (หน้าชำระเงินของ Stripe: บัตร + ช่องทางที่เปิดใน Stripe Dashboard เช่น PromptPay)
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
// วิธีชำระ + ค่าธรรมเนียมที่ผู้ให้บริการหัก (บาท) — fee/net เป็น null ถ้ายังไม่รู้ (ไม่มีสิทธิ์อ่าน หรือยังไม่ตัดยอด)
export type PaymentDetails = { method: string; fee: number | null; net: number | null; note?: string };
export type InquiryResult = {
  status: "pending" | "paid" | "failed" | "expired";
  paidAmount?: number; paidRef?: string; paidAt?: string; raw?: unknown; details?: PaymentDetails | null;
};
export type NotifyRef = { linkId?: string; orderId?: string };

export interface CardProvider {
  name: string;
  mode: "live" | "test";
  ready(): { ready: boolean; message: string };
  createLink(input: CreateLinkInput): Promise<CreateLinkResult>;
  inquire(row: CardRow): Promise<InquiryResult>;
  paymentDetails?(paidRef: string): Promise<PaymentDetails | null>; // อ่านซ้ำทีหลังได้ (ค่าธรรมเนียมที่ยังไม่มาตอนจ่าย)
  checkPermissions?(): Promise<Record<string, boolean | string>>;  // คีย์มีสิทธิ์ที่ระบบใช้ครบไหม (หน้าแอดมิน/ตรวจตอนตั้งค่า)
  parseNotify(body: string, headers: Headers): NotifyRef | Promise<NotifyRef>; // throw = ข้อความปลอม/ลายเซ็นไม่ถูก
  notifyAck(): Response;
}

import Stripe from "npm:stripe@23.0.0";

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

// ---------------------------------------------------------------------------------------------
// stripe: Stripe Checkout Sessions (ตาม best practices ของ Stripe)
//   - 1 Checkout Session ต่อ 1 ลิงก์ (ยอดจากชีต) พากลับหน้าร้านด้วย success_url/cancel_url
//   - ไม่ส่ง payment_method_types: ช่องทางชำระ (บัตร, PromptPay ฯลฯ) เปิด/ปิดได้ที่ Stripe Dashboard
//   - ผลการชำระเชื่อจาก Stripe เท่านั้น: webhook ตรวจลายเซ็นทุกครั้ง แล้ว card-pay ดึง session ซ้ำ (inquire)
//     จ่ายแล้ว = payment_status ไม่ใช่ unpaid (รองรับช่องทางที่ยืนยันทีหลังผ่าน async_payment_succeeded)
// Secrets ใน Supabase (Edge Functions → Secrets) — ห้ามใส่ในโค้ด/แชท:
//   CARD_PROVIDER=stripe
//   STRIPE_API_KEY         Restricted API key (rk_test_… / rk_live_…) สิทธิ์ Checkout Sessions: Write,
//                          PaymentIntents: Read, Charges: Read (วิธีชำระ), Balance: Read (ค่าธรรมเนียม)
//                          (ใช้ sk_ ได้แต่ไม่แนะนำ) — rk_test_/sk_test_ = โหมดทดสอบ
//   STRIPE_WEBHOOK_SECRET  whsec_… ของ webhook endpoint ด้านล่าง
// Webhook endpoint ใน Stripe Dashboard: https://<project>.supabase.co/functions/v1/card-pay?action=notify
//   events: checkout.session.completed, checkout.session.async_payment_succeeded,
//           checkout.session.async_payment_failed, checkout.session.expired
// ---------------------------------------------------------------------------------------------
const STRIPE_EVENTS = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired",
]);
const randomLetters = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => String.fromCharCode(97 + (b % 26))).join("");

const isPermissionError = (e: unknown) => (e as { type?: string; statusCode?: number })?.type === "StripePermissionError" ||
  (e as { statusCode?: number })?.statusCode === 403;
const FUNDING_TH: Record<string, string> = { credit: "เครดิต", debit: "เดบิต", prepaid: "เติมเงิน" };
const WALLET_TH: Record<string, string> = { apple_pay: "Apple Pay", google_pay: "Google Pay", samsung_pay: "Samsung Pay", link: "Link" };
export function stripeMethodLabel(d: Stripe.Charge.PaymentMethodDetails | null | undefined): string {
  if (!d) return "";
  if (d.type === "card" && d.card) {
    const c = d.card;
    const brand = ({ visa: "Visa", mastercard: "Mastercard", amex: "Amex", jcb: "JCB", unionpay: "UnionPay", discover: "Discover", diners: "Diners" } as Record<string, string>)[c.brand || ""] || (c.brand || "บัตร");
    const parts = [brand + (c.last4 ? " •••• " + c.last4 : "")];
    if (c.funding && FUNDING_TH[c.funding]) parts.push(FUNDING_TH[c.funding]);
    if (c.country && c.country !== "TH") parts.push("บัตรต่างประเทศ " + c.country);
    const wallet = c.wallet?.type ? WALLET_TH[c.wallet.type] || c.wallet.type : "";
    return (wallet ? wallet + " · " : "") + parts.join(" · ");
  }
  if (d.type === "promptpay") return "PromptPay";
  if (d.type === "link") return "Link (บัตรที่ลูกค้าบันทึกไว้กับ Stripe)";
  return d.type;
}

export class StripeProvider implements CardProvider {
  name = "stripe";
  mode: "live" | "test";
  private key: string;
  private webhookSecret: string;
  private client: Stripe | null;
  // client ส่งเข้ามาได้เฉพาะชุดทดสอบ (ชี้ไปเซิร์ฟเวอร์จำลอง)
  constructor(opts: { key?: string; webhookSecret?: string; client?: Stripe } = {}) {
    this.key = opts.key ?? env("STRIPE_API_KEY");
    this.webhookSecret = opts.webhookSecret ?? env("STRIPE_WEBHOOK_SECRET");
    this.mode = /^(rk|sk)_live_/.test(this.key) ? "live" : "test";
    this.client = opts.client ?? (this.key ? new Stripe(this.key, { httpClient: Stripe.createFetchHttpClient() }) : null);
  }
  ready() {
    if (!this.key) return { ready: false, message: "ยังไม่ได้ใส่ STRIPE_API_KEY ใน Supabase Secrets" };
    if (/^pk_/.test(this.key)) return { ready: false, message: "STRIPE_API_KEY ต้องเป็น restricted key (rk_) หรือ secret key (sk_) ไม่ใช่ publishable key (pk_)" };
    if (!this.webhookSecret) return { ready: false, message: "ยังไม่ได้ใส่ STRIPE_WEBHOOK_SECRET ใน Supabase Secrets" };
    return { ready: true, message: this.mode === "test" ? "เชื่อมต่อ Stripe (โหมดทดสอบ)" : "เชื่อมต่อ Stripe" };
  }
  async createLink(input: CreateLinkInput): Promise<CreateLinkResult> {
    if (!this.client) throw new Error("ยังไม่ได้ใส่ STRIPE_API_KEY");
    const session = await this.client.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: { currency: "thb", unit_amount: Math.round(input.amount * 100), product_data: { name: input.description } },
      }],
      client_reference_id: input.orderId,
      metadata: { orderId: input.orderId },
      payment_intent_data: { description: input.description, metadata: { orderId: input.orderId } },
      success_url: input.returnUrl,
      cancel_url: input.returnUrl,
      expires_at: Math.floor(input.expiresAt.getTime() / 1000),
      locale: "th",
      integration_identifier: "emocha_line_shop_" + randomLetters(8),
    });
    if (!session.url) throw new Error("Stripe ไม่ได้ส่งลิงก์ชำระเงินกลับมา");
    return {
      linkId: session.id, url: session.url,
      expiresAt: new Date((session.expires_at || Math.floor(input.expiresAt.getTime() / 1000)) * 1000).toISOString(),
      raw: { id: session.id, status: session.status, payment_status: session.payment_status },
    };
  }
  async inquire(row: CardRow): Promise<InquiryResult> {
    if (!this.client) throw new Error("ยังไม่ได้ใส่ STRIPE_API_KEY");
    if (!row.link_id) return { status: "pending" };
    const s = await this.client.checkout.sessions.retrieve(row.link_id, { expand: ["payment_intent"] });
    const pi = s.payment_intent && typeof s.payment_intent === "object" ? s.payment_intent : null;
    const raw = { id: s.id, status: s.status, payment_status: s.payment_status, payment_intent: pi?.id ?? s.payment_intent ?? null };
    if (s.status === "complete" && s.payment_status !== "unpaid") {
      const paidRef = pi?.id || (typeof s.payment_intent === "string" ? s.payment_intent : s.id);
      return {
        status: "paid", paidAmount: (s.amount_total ?? 0) / 100, paidRef,
        paidAt: new Date().toISOString(), raw, details: await this.paymentDetails(paidRef),
      };
    }
    if (s.status === "expired") return { status: "expired", raw };
    // ช่องทางยืนยันทีหลังแล้วไม่สำเร็จ (async_payment_failed) = session complete แต่ยัง unpaid และ PaymentIntent ใช้ต่อไม่ได้
    if (s.status === "complete" && pi && (pi.status === "canceled" || pi.status === "requires_payment_method")) return { status: "failed", raw };
    return { status: "pending", raw };
  }
  // ลองอ่านแบบไม่แก้ข้อมูลอะไร: true = มีสิทธิ์, false = ไม่มีสิทธิ์, ข้อความ = ผิดพลาดอย่างอื่น
  async checkPermissions(): Promise<Record<string, boolean | string>> {
    if (!this.client) return {};
    const c = this.client;
    const probe = async (fn: () => Promise<unknown>) => {
      try { await fn(); return true; } catch (e) { return isPermissionError(e) ? false : String((e as Error).message || e).slice(0, 120); }
    };
    return {
      checkoutSessions: await probe(() => c.checkout.sessions.list({ limit: 1 })),
      paymentIntents: await probe(() => c.paymentIntents.list({ limit: 1 })),
      charges: await probe(() => c.charges.list({ limit: 1 })),
      balance: await probe(() => c.balanceTransactions.list({ limit: 1 })),
    };
  }
  // วิธีชำระ (Visa •••• 4242 เครดิต / PromptPay) + ค่าธรรมเนียมจาก balance transaction
  // คีย์ต้องมีสิทธิ์อ่าน Charges (วิธีชำระ) และ Balance (ค่าธรรมเนียม) — ไม่มีสิทธิ์ก็ไม่ทำให้การยืนยันออเดอร์พัง
  async paymentDetails(paidRef: string): Promise<PaymentDetails | null> {
    if (!this.client || !/^pi_/.test(paidRef)) return null;
    try {
      const pi = await this.client.paymentIntents.retrieve(paidRef);
      const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
      if (!chargeId) return null;
      let charge: Stripe.Charge;
      let note = "";
      try {
        charge = await this.client.charges.retrieve(chargeId, { expand: ["balance_transaction"] });
      } catch (e) {
        if (!isPermissionError(e)) throw e;
        charge = await this.client.charges.retrieve(chargeId); // ไม่มีสิทธิ์ Balance: ได้แค่วิธีชำระ
        note = "คีย์ Stripe ยังไม่มีสิทธิ์อ่าน Balance (ค่าธรรมเนียม)";
      }
      const bt = charge.balance_transaction && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
      const toBaht = (v: number) => Math.round(v) / 100;
      return {
        method: stripeMethodLabel(charge.payment_method_details),
        fee: bt ? toBaht(bt.fee) : null,
        net: bt ? toBaht(bt.net) : null,
        ...(note ? { note } : bt && bt.currency !== "thb" ? { note: "สกุลเงิน " + bt.currency.toUpperCase() } : {}),
      };
    } catch (e) {
      console.error("stripe paymentDetails", paidRef, e);
      return isPermissionError(e) ? { method: "", fee: null, net: null, note: "คีย์ Stripe ยังไม่มีสิทธิ์อ่าน Charges (วิธีชำระ)" } : null;
    }
  }
  async parseNotify(body: string, headers: Headers): Promise<NotifyRef> {
    const event = await Stripe.webhooks.constructEventAsync(
      body, headers.get("stripe-signature") || "", this.webhookSecret, undefined, Stripe.createSubtleCryptoProvider(),
    );
    if (!STRIPE_EVENTS.has(event.type)) return {};
    const obj = event.data.object as { id?: string; client_reference_id?: string | null };
    return { linkId: obj.id, orderId: obj.client_reference_id || undefined };
  }
  notifyAck() { return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } }); }
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
  if (name === "stripe") return new StripeProvider();
  if (name === "mock") return new MockProvider();
  return new NoProvider();
}
