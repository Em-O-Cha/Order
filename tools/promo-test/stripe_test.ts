// ทดสอบตัวเชื่อม Stripe ของ card-pay กับเซิร์ฟเวอร์ Stripe จำลอง (ไม่ใช้คีย์จริง ไม่ต่อ Stripe):
//   deno run --allow-net --allow-env tools/promo-test/stripe_test.ts
// สร้าง Checkout Session (พารามิเตอร์ตาม best practices) / ถามสถานะ (รอจ่าย จ่ายแล้ว หมดอายุ ยืนยันทีหลังไม่สำเร็จ)
// / ตรวจลายเซ็น webhook (ถูก ปลอม event ที่ไม่เกี่ยว)
import Stripe from "npm:stripe@23.0.0";
import { StripeProvider } from "../../supabase/functions/card-pay/providers.ts";

let fails = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (!cond) fails++;
  console.log((cond ? "ผ่าน " : "ไม่ผ่าน ") + label + (extra ? " | " + extra : ""));
};

// ---------- เซิร์ฟเวอร์ Stripe จำลอง ----------
const sessions = new Map<string, Record<string, unknown>>();
let lastCreate: URLSearchParams | null = null;
let denyBalance = false;
let chargePmd: Record<string, unknown> = { type: "card", card: { brand: "visa", last4: "4242", funding: "credit", country: "TH", wallet: null } };
const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
  const url = new URL(req.url);
  if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
    lastCreate = new URLSearchParams(await req.text());
    const id = "cs_test_" + crypto.randomUUID().replaceAll("-", "");
    const s = {
      id, object: "checkout.session", url: "https://checkout.stripe.com/c/pay/" + id, status: "open", payment_status: "unpaid",
      amount_total: Number(lastCreate.get("line_items[0][price_data][unit_amount]")), expires_at: Number(lastCreate.get("expires_at")),
      client_reference_id: lastCreate.get("client_reference_id"), payment_intent: null,
    };
    sessions.set(id, s);
    return Response.json(s);
  }
  if (req.method === "GET" && ["/v1/checkout/sessions", "/v1/payment_intents", "/v1/charges", "/v1/balance_transactions"].includes(url.pathname)) {
    if (url.pathname === "/v1/balance_transactions" && denyBalance) return Response.json({ error: { type: "invalid_request_error", message: "The provided key does not have the required permissions" } }, { status: 403 });
    return Response.json({ object: "list", data: [], has_more: false, url: url.pathname });
  }
  const pm = url.pathname.match(/^\/v1\/payment_intents\/([^/]+)$/);
  if (req.method === "GET" && pm) return Response.json({ id: pm[1], object: "payment_intent", status: "succeeded", latest_charge: "ch_1" });
  if (req.method === "GET" && url.pathname === "/v1/charges/ch_1") {
    const wantsBt = url.searchParams.getAll("expand[]").includes("balance_transaction") || url.search.includes("balance_transaction");
    if (wantsBt && denyBalance) return Response.json({ error: { type: "invalid_request_error", message: "The provided key does not have the required permissions" } }, { status: 403 });
    return Response.json({
      id: "ch_1", object: "charge", payment_method_details: chargePmd,
      balance_transaction: wantsBt ? { id: "txn_1", object: "balance_transaction", fee: 1077, net: 31173, currency: "thb" } : "txn_1",
    });
  }
  const m = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)$/);
  if (req.method === "GET" && m && sessions.has(m[1])) return Response.json(sessions.get(m[1]));
  return Response.json({ error: { message: "not found " + req.method + " " + url.pathname } }, { status: 404 });
});
const port = (server.addr as Deno.NetAddr).port;
const client = new Stripe("rk_test_fake", { host: "localhost", port, protocol: "http", httpClient: Stripe.createFetchHttpClient() });
const WHSEC = "whsec_test_secret";
const prov = new StripeProvider({ key: "rk_test_fake", webhookSecret: WHSEC, client });

// ---------- ทดสอบ ----------
ok("1) คีย์ rk_test_ = โหมดทดสอบ, พร้อมใช้", prov.mode === "test" && prov.ready().ready, prov.ready().message);
ok("1b) คีย์ live = โหมดจริง", new StripeProvider({ key: "rk_live_x", webhookSecret: WHSEC, client }).mode === "live");
ok("1c) ไม่มี webhook secret = ยังไม่พร้อม", !new StripeProvider({ key: "rk_test_x", webhookSecret: "", client }).ready().ready);
ok("1d) ใส่ publishable key ผิดช่อง = ยังไม่พร้อม", !new StripeProvider({ key: "pk_test_x", webhookSecret: WHSEC, client }).ready().ready);

const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
const link = await prov.createLink({
  orderId: "REV6910050", amount: 332.5, description: "Em-O-Cha #REV6910050",
  returnUrl: "https://liff.line.me/x?cardpay=REV6910050", notifyUrl: "https://example/notify", expiresAt,
});
const q = lastCreate as unknown as URLSearchParams;
ok("2) สร้าง Checkout Session ได้ลิงก์ของ Stripe", link.url.startsWith("https://checkout.stripe.com/") && link.linkId.startsWith("cs_test_"), link.url);
ok("2b) ยอดเป็นสตางค์ สกุล THB โหมด payment", q.get("line_items[0][price_data][unit_amount]") === "33250" && q.get("line_items[0][price_data][currency]") === "thb" && q.get("mode") === "payment");
ok("2c) ไม่ส่ง payment_method_types (ช่องทางชำระตั้งที่ Dashboard)", ![...q.keys()].some((k) => k.startsWith("payment_method_types")));
ok("2d) อ้างอิงออเดอร์ + พากลับหน้าร้าน", q.get("client_reference_id") === "REV6910050" && q.get("metadata[orderId]") === "REV6910050" && q.get("success_url") === "https://liff.line.me/x?cardpay=REV6910050" && q.get("cancel_url") === q.get("success_url"));
ok("2e) integration_identifier ลงท้ายตัวอักษรสุ่ม 8 ตัว", /^emocha_line_shop_[a-z]{8}$/.test(q.get("integration_identifier") || ""), q.get("integration_identifier") || "");
ok("2f) หมดอายุตามที่ขอ", q.get("expires_at") === String(Math.floor(expiresAt.getTime() / 1000)));

const row = { id: "r1", order_id: "REV6910050", amount: 332.5, provider: "stripe", mode: "test", link_id: link.linkId, pay_url: link.url, status: "pending", expires_at: expiresAt.toISOString(), paid_amount: null, paid_ref: null, paid_at: null, confirmed_at: null, raw: null };
let r = await prov.inquire(row);
ok("3) ยังไม่จ่าย -> pending", r.status === "pending");
const s = sessions.get(link.linkId)!;
s.status = "complete"; s.payment_status = "unpaid"; s.payment_intent = { id: "pi_123", object: "payment_intent", status: "processing" };
r = await prov.inquire(row);
ok("3b) complete แต่ยัง unpaid (รอยืนยันทีหลัง) -> pending ไม่ยืนยันออเดอร์", r.status === "pending");
s.payment_intent = { id: "pi_123", object: "payment_intent", status: "requires_payment_method" };
r = await prov.inquire(row);
ok("3c) ยืนยันทีหลังไม่สำเร็จ -> failed", r.status === "failed");
s.payment_status = "paid"; s.payment_intent = { id: "pi_123", object: "payment_intent", status: "succeeded" };
r = await prov.inquire(row);
ok("3d) จ่ายแล้ว -> paid ยอด 332.5 อ้างอิง pi_123", r.status === "paid" && r.paidAmount === 332.5 && r.paidRef === "pi_123", JSON.stringify(r));
ok("3f) วิธีชำระ + ค่าธรรมเนียม", r.details?.method === "Visa •••• 4242 · เครดิต" && r.details?.fee === 10.77 && r.details?.net === 311.73, JSON.stringify(r.details));
denyBalance = true;
let d = await prov.paymentDetails("pi_123");
ok("3g) คีย์ไม่มีสิทธิ์ Balance -> ได้วิธีชำระ ไม่มีค่าธรรมเนียม ไม่พัง", d?.method === "Visa •••• 4242 · เครดิต" && d?.fee === null && !!d?.note, JSON.stringify(d));
denyBalance = false;
chargePmd = { type: "promptpay", promptpay: {} };
d = await prov.paymentDetails("pi_123");
ok("3h) PromptPay", d?.method === "PromptPay" && d?.fee === 10.77, JSON.stringify(d));
chargePmd = { type: "card", card: { brand: "mastercard", last4: "1234", funding: "debit", country: "JP", wallet: { type: "apple_pay" } } };
d = await prov.paymentDetails("pi_123");
ok("3i) Apple Pay บัตรเดบิตต่างประเทศ", d?.method === "Apple Pay · Mastercard •••• 1234 · เดบิต · บัตรต่างประเทศ JP", d?.method);
s.status = "expired"; s.payment_status = "unpaid"; s.payment_intent = null;
r = await prov.inquire(row);
ok("3e) หมดอายุ -> expired", r.status === "expired");

const payload = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.completed", data: { object: { id: link.linkId, object: "checkout.session", client_reference_id: "REV6910050" } } });
const header = await Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: WHSEC, cryptoProvider: Stripe.createSubtleCryptoProvider() });
const ref = await prov.parseNotify(payload, new Headers({ "stripe-signature": header }));
ok("4) webhook ลายเซ็นถูก -> ได้รหัส session + เลขออเดอร์", ref.linkId === link.linkId && ref.orderId === "REV6910050", JSON.stringify(ref));
let rejected = false;
try { await prov.parseNotify(payload.replace("REV6910050", "REV0000001"), new Headers({ "stripe-signature": header })); } catch { rejected = true; }
ok("4b) แก้ข้อความหลังเซ็น -> ปฏิเสธ", rejected);
rejected = false;
try { await prov.parseNotify(payload, new Headers({})); } catch { rejected = true; }
ok("4c) ไม่มีลายเซ็น -> ปฏิเสธ", rejected);
const other = JSON.stringify({ id: "evt_2", object: "event", type: "customer.created", data: { object: { id: "cus_1" } } });
const h2 = await Stripe.webhooks.generateTestHeaderStringAsync({ payload: other, secret: WHSEC, cryptoProvider: Stripe.createSubtleCryptoProvider() });
ok("4d) event อื่นที่ไม่เกี่ยว -> ไม่ทำอะไร", JSON.stringify(await prov.parseNotify(other, new Headers({ "stripe-signature": h2 }))) === "{}");

let perms = await prov.checkPermissions();
ok("5) ตรวจสิทธิ์คีย์ครบ", perms.checkoutSessions === true && perms.paymentIntents === true && perms.charges === true && perms.balance === true, JSON.stringify(perms));
denyBalance = true;
perms = await prov.checkPermissions();
ok("5b) ไม่มีสิทธิ์ Balance -> balance=false", perms.balance === false && perms.charges === true, JSON.stringify(perms));
denyBalance = false;

await server.shutdown();
console.log(fails ? `\nไม่ผ่าน ${fails} ข้อ` : "\nผ่านทั้งหมด");
Deno.exit(fails ? 1 : 0);
