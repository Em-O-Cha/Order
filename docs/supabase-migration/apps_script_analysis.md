# Apps Script "Members LINE" — Full Analysis for Supabase Migration

Source: `Members.js` (~8537 lines), `admin.html` (~4215 lines), `appsscript.json`.
Spreadsheet "Members Emocha Club" — `MEMBERS_SHEET_ID = 15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk`.
A **second, separate** spreadsheet is used for orders: `REVENUE_SHEET_ID_SHOP = 1SSUCIrTUVe-dDB4pZF73uCG7d-SoZ-k04fM8pln6ZRY` (tab `Revenue`), and a **third** for the product catalog: `MASTER_SHEET_ID_SHOP = 1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w` (tab `SKU`).

The `Revenue` sheet is shared with other sales channels (Shopee, TikTok, "Bulk Buyers", and a companion "Revenue Spunky Online" system) — it is NOT exclusive to the LINE shop, which is why so much of the code defends against "someone else's rows" living in the same columns.

---

## 1. Google Sheet Tabs and Columns

### 1.1 Members Spreadsheet (`15yYmENUcxz...`)

#### `Members` (one row per member; keyed by LINE UID)
1. **A** LINE UID
2. **B** ชื่อที่แสดงใน LINE (LINE display name)
3. **C** รูปโปรไฟล์ (LINE profile picture URL)
4. **D** เบอร์โทร (phone, force-text formatted)
5. **E** วันที่สมัคร (join date, Date)
6. **F** แต้มสะสม (points balance, integer)
7. **G** ระดับ Tier (tier **key**, resolved against `Tier_Config`)
8. **H** ที่อยู่จัดส่งล่าสุด (last shipping address)
9. **I** จังหวัดล่าสุด (last province)
10. **J** ชื่อ-นามสกุล (full name)
11. **K** วันเกิด (birthday, stored as string `YYYY-MM-DD` or `dd/MM/yyyy`, forced text)
12. **L** ยอดซื้อสะสม (lifetime spend, float)
13. **M** รหัสสมาชิก (member code `EM-YYYYMMDDNNNN`, forced text)
14. **N** แนะนำโดย (LINE UID of referrer, MGM signup referral)
15. **O** ให้รางวัลแนะนำเพื่อนแล้ว (TRUE/FALSE — signup-referral reward already granted)
16. **P** บล็อก LINE OA แล้ว (TRUE/FALSE — has blocked the LINE Official Account)
17. **Q** วันที่เช็ค (last time block-status was checked)
18. **R** บล็อกครั้งแรกเมื่อ (approx. first-seen-blocked timestamp)
19. **S** บล็อกเก็บเงินปลายทาง (TRUE/FALSE — COD blocked for this member)
20. **T** เหตุผล/วันที่บล็อกเก็บเงินปลายทาง (COD block reason + timestamp text)

#### `Tier_Config` (membership tier definitions)
Key, ชื่อระดับ(ไทย), ชื่อระดับ(อังกฤษ), สีบัตร(HEX), สีตัวอักษร(HEX), ยอดซื้อสะสมขั้นต่ำ(บาท), คะแนนสะสมขั้นต่ำ, ตัวคูณแต้ม (point multiplier).
Default seed rows: start/เอมสตาร์ท (0฿), silver/เอมแฟน (1000฿, x1), gold/เอมเลิฟ (2000฿, x1.5), platinum/เอม VIP (3000฿, x2). Tier is resolved by minSpend threshold ("no downgrade" rule — see §3).

#### `Signup_Privileges` (multiple simultaneous "welcome gift" definitions for new signups)
ชื่อสิทธิ์, ประเภท(percent/fixed/bogo/ship_percent/ship_fixed), มูลค่า, หมดอายุใน(วัน), เฉพาะสินค้า(หรือที่ต้องซื้อถ้า bogo), สินค้าที่แถม(bogo), จำนวนที่แถม(bogo), เปิดใช้งาน, วันที่สร้าง, ยอดซื้อขั้นต่ำ, วันเริ่มโปร(usage window start), วันสิ้นสุดโปร(usage window end).
(There is also a legacy single-item config stored in Script Properties `SIGNUP_PRIVILEGE_CONFIG` — both are granted together at signup.)

#### `Referral_Log` (member-get-member "sign up" referral history)
วันที่แนะนำสำเร็จ, ผู้แนะนำ(UID), ชื่อผู้แนะนำ, รหัสผู้แนะนำ, เพื่อนที่ถูกแนะนำ(UID), ชื่อเพื่อน, สถานะให้รางวัล, วันที่ให้รางวัล, รายละเอียดรางวัล.

#### `Purchase_Referral_Log` (member-get-member "refer a purchase" history — different feature)
วันที่, ผู้แนะนำ(UID), ชื่อผู้แนะนำ, รหัสผู้แนะนำ, ผู้ซื้อ(UID), ชื่อผู้ซื้อ, เลขที่ออเดอร์, ยอดซื้อ, สถานะให้รางวัล, รายละเอียดรางวัล.

#### `Debug_Log` (perf/error log)
เวลา, ประเภท(doGet/doPost/error/register/queue), action, ระยะเวลา(ms), ข้อผิดพลาด(ถ้ามี).

#### `Registration_Queue` (async signup queue — see §2 dispatcher)
รหัสคำขอ, สถานะ(PENDING/PROCESSING/COMPLETED/FAILED), เวลารับคำขอ, เวลาอัปเดต, จำนวนครั้ง(retry count), LINE UID, ID Token, เบอร์โทร, ชื่อ-นามสกุล, วันเกิด, รหัสผู้แนะนำ, ผลลัพธ์/ข้อผิดพลาด, รหัสสมาชิก.

#### `Points_Promos` (bonus-points campaigns, 2 types: `multiplier` / `repeat`)
ชื่อโปร, ประเภท(multiplier/repeat), เปิดใช้งาน, วันเริ่ม, วันหมดอายุ, ตัวคูณแต้ม(multiplier only), ยอดซื้อขั้นต่ำ(multiplier only), เฉพาะสินค้า(both), แต้มโบนัส(repeat only), ประเภทส่วนลดโบนัส(repeat), มูลค่าส่วนลดโบนัส(repeat), วันที่สร้าง, ข้อความหัวการ์ด(custom UI stub text).

#### `Tier_Perks` (plain-text perks unlocked at a given tier — display only)
ข้อความสิทธิ์, ระดับที่ต้องถึงจะปลดล็อค(key), เปิดใช้งาน, วันที่สร้าง.

#### `Coupons` (store-wide discount codes)
โค้ด, ประเภท(percent/fixed/bogo/ship_percent/ship_fixed), มูลค่า, ยอดซื้อขั้นต่ำ, ใช้ได้สูงสุด(ครั้ง), ใช้ไปแล้ว, วันหมดอายุ, เปิดใช้งาน, ใช้อัตโนมัติทุกคน(auto-apply flag), เฉพาะสินค้า/สินค้าที่ต้องซื้อ(bogo), วันเริ่มต้น, สินค้าที่แถม(bogo), จำนวนที่แถมต่อรอบ(bogo), จำกัดเฉพาะระดับสมาชิก(comma-separated tier keys), ส่วนลดของแถม(%)(bogo, default 100), ข้อความหัวการ์ด.

#### `Member_Privileges` (per-member issued privileges — the highest-priority discount mechanism)
LINE UID, ชื่อสิทธิ์, ประเภท(percent/fixed/bogo/ship_percent/ship_fixed), มูลค่า, วันหมดอายุ, ให้โดย(source label), วันที่ให้, เปิดใช้งาน(used-up = FALSE), แจ้งเตือนแล้ว(notified via LINE), วันที่เริ่มใช้ได้, สินค้าที่ต้องซื้อ(bogo), สินค้าที่แถม(bogo), จำนวนที่แถมต่อรอบ(bogo), ยอดซื้อขั้นต่ำ, ส่วนลดของแถม(%)(bogo), (col 16 = "ประกาศโปรใหม่แล้ว" — separate flag), **Q(17)** ใช้สิทธิ์เมื่อ (used-at timestamp).

#### `Point_Rewards` (auto-unlock a privilege once lifetime points reach a threshold)
คะแนนที่ต้องการ, ชื่อสิทธิ์ที่จะได้, ประเภท(percent/fixed), มูลค่า, สิทธิ์หมดอายุใน(วัน), เปิดใช้งาน.

#### `Points_Log` (append-only ledger for every point change)
วันเวลา, LINE UID, ประเภท(earn/redeem/adjust_add/adjust_sub), รายการ(description, tagged `[orderId]`), คะแนนเปลี่ยนแปลง(+/-), คะแนนคงเหลือหลังรายการ.

#### `Expiry_Disable_Log`
เวลาที่ปิด, ชีต, แถวที่, ชื่อรายการ, วันหมดอายุ — audit trail for the daily auto-disable job (§5).

#### `Birthday_Promo_Log`
LINE UID, โหมด(birthday/birthMonth), รอบสิทธิ์(cycle key), Tier ตอนให้, รหัสสิทธิ์, วันที่ให้, วันเริ่มใช้, วันหมดอายุ, ส่ง LINE แล้ว, รายละเอียด.

#### `Shipping_Config` (weight-tiered flat shipping rate table)
น้ำหนักไม่เกิน(กรัม), ราคา(บาท). Seed: 15 brackets from 20 g/32฿ up to 6000 g/140฿. Highest bracket rate applies to anything heavier.

#### `Rewards_Catalog` (point-redeemable rewards catalog)
ชื่อของรางวัล, หมวดหมู่(coupon/buy_product/free_product/premium/tier_upgrade/activity), ประเภทส่วนลด(percent/fixed — or target tier key for tier_upgrade), มูลค่า/ระดับเป้าหมาย, รายละเอียดเพิ่มเติม, คะแนนที่ต้องใช้แลก, อายุสิทธิ์(วัน, coupon only), เปิดใช้งาน, จำนวนจำกัด(0=unlimited), แลกไปแล้ว(count), รูปภาพ(URL), วันเริ่มโปร, วันสิ้นสุดโปร.

#### `Redemption_Log` (non-coupon/non-tier_upgrade reward redemptions needing manual fulfillment)
วันเวลาที่แลก, LINE UID, ชื่อสมาชิก, เบอร์โทร, ชื่อของรางวัล, หมวดหมู่, จำนวนที่แลก, สถานะ(รอดำเนินการ/...).

#### `Campaign_Log` (bulk marketing blast to an audience segment)
เวลา, กลุ่มเป้าหมาย, จำนวนเป้าหมาย, ส่งสำเร็จ, ส่งไม่สำเร็จ, แจกสิทธิ์(bool), ชื่อสิทธิ์, หัวข้อข้อความ, หมายเหตุ.

### 1.2 Revenue Spreadsheet (`1SSUCIrTUVe...`), tab `Revenue`
Shared by all sales channels. One row per line item; only the **first row of an order** carries the order-level columns (A, and H onward) — subsequent item rows of a multi-item order have column A blank and only populate C–G. Column map used by this script (A=1 ... AH=34):

| Col | Field | Notes |
|---|---|---|
| A | เลขที่ออเดอร์ (revenueId) | `REV{YY}{MM}{NNN}` sequence, shared across channels |
| B | Timestamp | order-created datetime |
| C | ชื่อสินค้า (item name) | set to literal `"ยกเลิก"` when order is cancelled |
| D | Qty | |
| E | Price (unit) | |
| F | ส่วนลดต่อรายการ (item discount) | zeroed on cancel |
| G | ยอดสุทธิต่อรายการ (net line amount) | zeroed on cancel |
| H | ค่าจัดส่ง+ค่าธรรมเนียม COD (Delivery) | shipping + COD fee combined; zeroed on cancel |
| I | ยอดชำระรวม (Bill Total) | `Amount + Delivery = Bill Total`; zeroed on cancel |
| J | Payment (label) | e.g. "พร้อมเพย์ (LINE Shop)", "โอนเงินธนาคาร (LINE Shop)", "เก็บเงินปลายทาง" |
| K | Slip1 (slip URL or placeholder text) | Drive `file/d/{id}/view` link; COD orders store `"เก็บเงินปลายทาง (ไม่มีสลิป)"` here instead |
| L, M | (unused by this script) | |
| N | ชื่อลูกค้า (customer name) | |
| O | เบอร์โทร (phone) | primary customer-matching key across channels |
| P | Sales Name | fixed `"LINE Shop (อัตโนมัติ)"` for auto orders |
| Q | Ad / channel | fixed `"LINE Shop"` |
| R | Campaign | joined names of privileges/coupons applied |
| S | CustomerType | fixed `"สมาชิก LINE"` — used to distinguish LINE-shop rows from other channels |
| T | Remark | free-text, encodes discount breakdown, pending-points reservation tag `🎯 คะแนนรอหัก: N คะแนน (-฿X)`, freebie/physical-freebie notes, purchase-referral code tag `🤝 รหัสแนะนำซื้อ: CODE`, cancel note, recalculation note |
| U, V | orderShopee / orderTiktok flags | read by `syncAddressToPendingOrders_` to avoid touching non-LINE orders |
| W | Order Date | duplicate of order date, used by month-window scans |
| X | จังหวัด (province) | |
| Y | ที่อยู่ (address) | |
| Z, AA(tracking#), AB, AC, AD | other channel-specific columns (not written by this script; AA read as `trackingNumber` for COD list) |
| AE(31) | วันที่ชำระเงิน (payment-received date) | written immediately for 0-baht/COD orders; written on slip-upload success for bank-transfer orders; cleared on cancel/COD-returned |
| AF(32) | LINE UID | added later in the project's life — legacy rows may be blank (fallback: match by phone) |
| AG(33) | สถานะเก็บเงินปลายทาง | `รอเก็บเงิน` / `เก็บเงินแล้ว` / `ตีกลับ` (COD only) |
| AH(34) | วันที่ได้รับเงินปลายทาง | COD actual-cash-received timestamp |

### 1.3 Master Data Spreadsheet (`1aZ3wp-9dU1jNoQ...`), tab `SKU`
Product catalog. Columns read (1-based): H(8)=Category, I(9)=Variant label, J(10)=Price, K(11)=Image URL, L(12)=Weight(g). SKU name shown to customer = `Category + " " + VariantLabel`.

---

## 2. API Dispatcher — Full Action List

Frontend `index.html` calls a Google Apps Script Web App `doGet`/`doPost` with `action=...`. **`admin.html` does NOT go through this HTTP API** — it is served as an `HtmlService` page (`doGet?page=admin`) and its buttons call Apps Script server functions directly via `google.script.run`. This is an important distinction for the Supabase rewrite: admin operations need their own authenticated API surface (PIN-based today — very weak, stored in Script Properties, default `"1234"`), separate from the public LINE-authenticated shop API.

### 2.1 Customer-facing (via `doGet`/`doPost`, LINE ID-token authenticated)
| Action | Method | Description | Sheets touched |
|---|---|---|---|
| `checkMemberStatus` | GET | Verify LINE token, return member profile or "not a member yet" | Members, Tier_Config |
| `registerMember` | GET & POST | Direct signup (also called internally by the queue processor) | Members, Signup_Privileges, Member_Privileges, Referral_Log |
| `enqueueMemberRegistration` | GET | Queues a signup request (avoids lock contention under signup bursts) | Registration_Queue, Members (identity check) |
| `getRegistrationQueueStatus` | GET | Poll signup queue status | Registration_Queue |
| `updateMemberProfile` | GET | Edit name/phone/birthday/address/province | Members, Revenue (syncs address to pending unpaid orders) |
| `getTierConfig` | GET | Public tier ladder + signup bonus + signup privilege + points-redeem config | Tier_Config |
| `getShopBootstrap` | GET | Combined bootstrap payload for the shop page (member, products, coupons, privileges, COD eligibility, promos) | Members, SKU, Coupons, Member_Privileges, Points_Promos |
| `getShopProducts` | GET | Product catalog (cached 180s) | SKU |
| `getMyPrivileges` | GET | List member's active privileges | Member_Privileges |
| `getPrivilegesPanelData` | GET | Privileges + points + tier + rewards catalog + points promos + tier perks, for the "My Privileges" panel | Member_Privileges, Members, Rewards_Catalog, Points_Promos, Tier_Perks |
| `getPointsHistory` | GET | Last 20 point ledger entries | Points_Log, Members |
| `getMyOrderHistory` | GET | Last 20 orders (by phone) | Revenue, Members |
| `cancelShopOrder` | GET | Customer self-cancel (only if no slip attached / COD still pending) | Revenue |
| `getActiveCoupons` | GET | Public list of active coupons (cached 60s) | Coupons |
| `getRewardsCatalog` | GET | Point-redeemable rewards catalog | Rewards_Catalog |
| `redeemReward` | GET | Redeem a reward with points | Rewards_Catalog, Members, Points_Log, Member_Privileges, Redemption_Log |
| `getMyShippingAddress` | GET | Last saved address/province | Members |
| `checkShopDiscounts` | GET | Live price preview (privileges/coupons/points/COD/shipping) — no writes | (reads many) |
| `createShopOrder` | GET | **Core order-creation function** (see §3) | Revenue, Members, Member_Privileges, Coupons, Points_Log, Referral_Log, Purchase_Referral_Log |
| `checkPendingOrderPromoStillValid` | GET | Preview whether an unpaid order's promos are still valid (read-only) | Revenue |
| `confirmPendingOrderRecalc` | GET | Recalculate & persist a new total for an unpaid order | Revenue |
| `getShopPaymentInfo` | GET | Static PromptPay/bank account info | (Script constants) |
| `getReferralPublicStatus` | GET | Is signup-referral program enabled (bool only) | (Script Properties) |
| `getPurchaseReferralPublicStatus` | GET | Is purchase-referral program enabled (bool only) | (Script Properties) |
| `uploadShopSlip` | POST | Upload payment slip image (base64) to Drive, mark order as paid-pending-review | Revenue, Drive |
| `checkSlipAttached` | POST | Poll whether slip has been attached (used by the separate slip-upload popup page) | Revenue |

Also served via `doGet?page=uploadSlip` (separate `slipUpload.html` template — not exported but referenced) and `doGet?page=admin` (`admin.html`) and bare `doGet` (serves `index.html`, i.e. the shop frontend itself, from this same Apps Script project).

### 2.2 Admin-only (PIN-protected, called via `google.script.run` from `admin.html`, NOT part of the public HTTP API)
Grouped by feature — all take `pin` as first argument, checked with `checkAdminPin_`:

- **Tier & signup config**: `updateTierConfig`, `updateSignupBonus`, `updateSignupPrivilegeConfig`, `toggleSignupPrivilegeConfigEnabled`, `createSignupPrivilegeItem`, `updateSignupPrivilegeItem`, `listSignupPrivilegeItems`, `toggleSignupPrivilegeItem`, `getTierConfigForAdmin`.
- **Points redemption config**: `updatePointsRedeemConfig`.
- **COD config**: `getCodConfigForAdmin`, `updateCodConfig`, `setMemberCodBlock`, `listCodBlockedMembers`, `listCodOrders`, `confirmCodPayment`, `markCodReturned`.
- **Referral programs**: `updateReferralConfig`, `getReferralConfigForAdmin`, `listReferrals`, `updatePurchaseReferralConfig`, `getPurchaseReferralConfigForAdmin`, `listPurchaseReferrals`.
- **Points promos**: `createPointsPromo`, `updatePointsPromo`, `listPointsPromos`, `togglePointsPromo`.
- **Tier perks**: `createTierPerk`, `updateTierPerk`, `listTierPerks`, `toggleTierPerk`.
- **Blocked members (LINE OA)**: `runBlockedMembersSync`, `getBlockedMembers`, `setupBlockSyncTrigger`(also GET action), `runBlockSyncNow`(also GET action).
- **Birthday promos**: `getBirthdayPromoConfigForAdmin`, `updateBirthdayPromoConfig`.
- **Shipping config**: `getShippingConfigForAdmin`, `updateShippingConfig`, `debugShippingConfig_`.
- **Rewards catalog**: `createRewardCatalogItem`, `updateRewardCatalogItem`, `listRewardsCatalogAdmin`, `toggleRewardCatalogItem`, `listRedemptionLog`, `markRedemptionFulfilled`.
- **Global coupons**: `createGlobalCoupon`, `updateGlobalCoupon`, `listGlobalCoupons`, `toggleGlobalCoupon`.
- **Member management**: `searchMembers`, `getMemberPrivileges`, `addMemberPrivilege`, `updateMemberPrivilege`, `deactivatePrivilege`, `deactivateIssuedPrivilegesByName`, `adjustMemberPoints`, `addPointsToAllMembers`, `addPrivilegeToAllMembers`.
- **Manual/offline order entry**: `createManualShopOrder` (keys in a Shopee/TikTok/cash order, optionally uploads a slip, creates the member if needed), `findLineUidByPhoneFromRevenue`, `backfillMembersFromRevenue` (bulk-creates Members rows from historic Revenue rows), `getAutoMemberConfig`, `updateAutoMemberConfig`.
- **Marketing campaigns**: `getCampaignAudience`, `runPromoCampaign` (bulk LINE push + optional privilege grant to a customer segment, capped at 450 recipients per run to respect the 6-minute execution limit).
- **Migrations / maintenance (also runnable directly from the Apps Script editor)**: `migrateTierConfigKeysToCardNames_`, `runFixBlankMemberTiers`/`fixBlankMemberTiers_`, `migrateMemberTierColumnToKeys_`, `migrateRewardsCatalogTierKeys_`, `runExpiryAutoDisable`/`runExpiryAutoDisableDaily`, `installExpiryAutoDisableTrigger`, `runRepairDryRun_`/`runRepairForReal_` (`repairMissedSlipNotifications_`), `listActiveTriggers` (also a GET action).

---

## 3. Core Business Logic

### 3.1 Membership tiers & points
- Tier is stored per member as a **key** (`start`/`silver`/`gold`/`platinum` by default, but fully admin-configurable in `Tier_Config`), resolved to a display tier via `resolveTierByStoredValue_`.
- **"No downgrade" rule**: `resolveTierNoDowngrade_` always keeps the member at least at their current tier even if lifetime spend alone would compute a lower tier — because a tier can also be reached by *redeeming points* for a `tier_upgrade` reward (see Rewards_Catalog), not just by spend. On any mismatch it repairs the stored key.
- Points earned per order: `basePoints = floor(finalAmount / BAHT_PER_POINT)` (default `BAHT_PER_POINT = 30`, i.e. 1 point per ฿30), then multiplied by `tier.pointMultiplier × activePointsMultiplierPromo × repeatPurchaseMultiplier`, plus any flat "repeat purchase" bonus points. Points are earned on `finalAmount` (after all discounts), not subtotal.
- **Points redemption for cash discount** (separate from Rewards_Catalog): configurable `POINTS_REDEEM_CONFIG` (`pointsPerBaht` rate, `minRedeem`, `maxRedeemPerOrder`). Computed centrally in `calcPointsRedeemDiscount_`, capped so it can never make the order negative, and never silently over-redeems the member's balance.
- All point changes are appended to `Points_Log` (types: `earn`, `redeem`, `adjust_add`, `adjust_sub`), tagged with `[orderId]` so they can be found/reversed later (e.g. when editing a pending order).

### 3.2 Discount/coupon calculation — priority order
Central rule (documented in code, enforced identically in `checkShopDiscounts`, `createShopOrder`, and `recalcOrderDiscounts_` to avoid divergent math):
1. **If the member holds ANY unused `Member_Privileges` row** (active, past start date, not expired) — even one that isn't usable for the current cart — **all coupons (manual code, auto-apply, shipping) and the "repeat purchase" discount are blocked entirely.** The customer is shown a message telling them to contact an admin, or that their privilege becomes usable once they reach its minimum purchase amount.
2. If not locked, all qualifying `Member_Privileges` rows apply simultaneously (they stack with each other).
3. If no privileges apply, coupons are evaluated: a manually entered code (validated by `validateCoupon_`) plus separately-stacking **auto-apply** coupons (`autoApply=TRUE`), split into "specific-product" vs "general" vs "shipping" categories — at most one of each category wins (the best by discount amount), and once a specific-restricted coupon is chosen its matched items are excluded from the general-coupon calculation.
4. Discount types: `percent`, `fixed`, `bogo` (buy N get M with %-off, default 100% free — "of the cheapest eligible item"), `ship_percent`, `ship_fixed`.
5. Points-redeemed-as-cash and points-multiplier/repeat-purchase-bonus **points** are NOT considered "discounts" and are never blocked by the privilege lock — only the repeat-purchase **cash discount** portion is blocked.
6. `computeEligibleInfo_` restricts a promo to items whose name contains any of a comma-separated keyword list ("restriction"); BOGO free-quantity price is based on the *cheapest* eligible unit price, not an average.

### 3.3 Membership privileges (`Member_Privileges`)
Granted from many sources: signup welcome gifts (single + multi-item config), points-threshold auto-rewards (`Point_Rewards`), referral rewards, birthday/birth-month promos, reward-catalog `coupon` redemptions, and manual admin grants (single member or bulk "grant to all"). Each privilege has an activation window (`startDate`..`expiry`), an active flag that is cleared to FALSE the instant it's consumed by an order, and can restrict to specific products/min-purchase. A daily trigger (`runExpiryAutoDisableDaily`, 01:00 Asia/Bangkok) also force-flips `active=FALSE` on anything whose expiry date has passed (across `Member_Privileges`, `Coupons`, `Signup_Privileges`, `Points_Promos`, `Rewards_Catalog`), logging to `Expiry_Disable_Log`.

### 3.4 Order creation — pricing, payment, and lifecycle (`createShopOrder`)
1. Verifies LINE ID token → resolves member row (must be a registered member; phone required).
2. Prices items from the live `SKU` sheet, computes subtotal + total weight → shipping cost from `Shipping_Config` weight brackets.
3. Applies privileges → then coupons (subject to the lock rule) → then repeat-purchase discount/bonus (if the phone already ordered ≥1 time this calendar month) → then points-multiplier promo → then points-redeemed-as-cash (computed last, capped to the remaining payable amount).
4. `finalAmount` is floored (not rounded) to avoid fractional-baht mismatches from % promos.
5. **COD path**: if `paymentMethod === 'cod'`, backend re-validates eligibility server-side regardless of what the client claims (`evaluateCodEligibility_`: feature enabled, member not COD-blocked, tier allow-list, min/max order amount), then adds a configurable COD fee (`fixed` or `percent`) to the shipping column so `Amount + Delivery` still equals `Bill Total`.
6. Writes one or more rows to `Revenue` (multi-item orders: first row carries all order-level fields; subsequent rows only carry item name/qty/price/discount). Order ID format: `REV{YY-Buddhist}{MM}{seq3}`, globally sequential across all sales channels sharing that sheet (looked up by scanning the tail of the sheet, with a slow full-scan fallback).
7. **Payment/finality semantics** (documented business rule):
   - **Bank transfer / PromptPay, amount > 0**: order is written as "pending" (`รอแนบสลิป`); no points/lifetime-spend/referral credit yet; customer must call `uploadShopSlip` next. Points chosen for redemption are "reserved" (parsed out of the Remark text via a `🎯 คะแนนรอหัก: N คะแนน` tag) but not actually deducted from the balance until the slip is confirmed — this prevents a customer from spending the same points twice while an order is unpaid.
   - **Zero-baht order** (100% covered by discounts/points): treated as paid immediately — points/spend/referral credit all happen synchronously inside `createShopOrder`.
   - **COD, amount > 0**: also treated as sale-recognized-immediately for reporting purposes (payment date column AE is stamped at order time) but points/spend/referral are deferred until an admin calls `confirmCodPayment` (mirrors the slip-confirmation flow). COD status starts at `รอเก็บเงิน` (pending).
8. Sends a LINE Flex confirmation message to the buyer and a separate Flex "new order, ready to pack" card to the admin group (`ADMIN_GROUP_ID`), including a fully itemized discount/points/shipping breakdown built from the Remark text so admins never need to open the sheet.

### 3.5 Payment slip handling (`uploadShopSlip` / Google Drive)
- Frontend posts base64 image data + filename + mimetype (separate `slipUpload.html` popup, not exported).
- Image is uploaded to a fixed Drive folder: `SLIP_FOLDER_ID_SHOP = 1aQQYvzFyZ79GDFQO352RdBPzdnCb0MnH`.
- **The slip's canonical reference is a Google Drive file URL string** stored in Revenue column K (`Slip1`): `https://drive.google.com/file/d/{fileId}/view`. The file ID is later extracted with a regex (`/file\/d\/([^\/]+)\//` or `/[?&]id=([^&]+)|\/file\/d\/([^\/?#]+)/`) wherever the image needs to be rendered (LINE image message thumbnails use `https://drive.google.com/thumbnail?id={fileId}&sz=wNNN`). **For the Supabase migration, only this file ID/URL needs to move — the binary stays in Drive.**
- File sharing (`ANYONE_WITH_LINK` / VIEW) is deliberately deferred until the async finalize step (`ensureSlipFileShared_`), not done synchronously at upload time, purely for perceived latency.
- On successful attach: reserved points are deducted for real, payment-date column stamped (if not already), Remark status flipped from "รอแนบสลิป" to "รอตรวจสอบสลิป", then a **1-second time-based trigger** (`scheduleSlipFinalize_` → `runPendingSlipFinalizations_` → `finalizeSlipNotifications_`) asynchronously sends the buyer/admin LINE notifications and credits points/lifetime-spend/referral rewards (`creditOrderPointsAndReferrals_`), idempotently (`hasPointsAlreadyCreditedForOrder_` guards double-crediting even if the trigger fires more than once).
- `checkSlipAttached` is polled by the ordering page (opened in a separate tab/window from the slip-upload popup, since `window.opener` is unreliable inside the LINE in-app browser).

### 3.6 Order cancellation (`cancelShopOrder`)
- Customer self-service, only allowed while: no slip has been attached (bank transfer) OR COD status is still "รอเก็บเงิน" (COD). Once a slip is uploaded or COD money is confirmed, cancellation requires contacting an admin (no self-service `updateOrder`/void action exists for that state in this codebase).
- Cancellation does **not** delete rows (to avoid renumbering order IDs) — instead every item row's product name is overwritten with the literal string `"ยกเลิก"`, all money columns (discount, net, shipping, bill total) are zeroed, and Remark is replaced with a "customer cancelled + timestamp" note. COD-specific columns (AE payment date, AG status) are also cleared.
- **Known gap** (documented in code comments): cancellation does **not** automatically restore any consumed `Member_Privileges`/coupon usage counts — an admin must manually re-enable them if the customer should be able to reuse them.
- Admin-side equivalent for COD non-payment is `markCodReturned` (same row-mutation mechanic, plus it auto-sets the member's COD block flag).

### 3.7 Promo re-check on resuming a pending order (`checkPendingOrderPromoStillValid` / `confirmPendingOrderRecalc`)
- When a customer returns to a cart with an unpaid order still open, `checkPendingOrderPromoStillValid` re-derives the discount stack from scratch using **live** promo/coupon state (via the shared `recalcOrderDiscounts_` helper) and compares it to the amount stored on the order; if it differs by ≥ ฿1 it flags `changed: true` with old/new amounts, purely for display (no writes).
- If the customer accepts the new total, `confirmPendingOrderRecalc` repeats the same computation (never trusting client-submitted numbers) and persists it: updates per-item discount/net columns, shipping, bill total, campaign label, and appends an audit line to Remark recording the recalculation timestamp and old→new amounts. Coupon codes previously applied are re-derived by regex-parsing the Remark text (`คูปอง: CODE (-N)`) and re-validating them; if none still validate, it falls back to whatever auto-apply coupons are active *now*.
- This exists because promos can be edited/expired by an admin *while* a customer is mid-checkout with an unpaid cart.

---

## 4. External Integrations

- **LINE Login / LIFF**: `LIFF_CHANNEL_ID = '2010892131'`. ID tokens are JWTs decoded locally for `aud`/`exp` checks, then verified against `https://api.line.me/oauth2/v2.1/verify` (result cached in `CacheService` up to the token's own remaining TTL, max 21600s, to minimize LINE API calls).
- **LINE Messaging API (push)**: `LINE_CHANNEL_ACCESS_TOKEN` (channel access token, hardcoded in source — should become a secret in the new backend) used via `https://api.line.me/v2/bot/message/push` for: welcome Flex messages, order-confirmation Flex messages (buyer), new-order Flex + slip-image messages (admin group `ADMIN_GROUP_ID`), new-privilege notifications, birthday/birth-month promo Flex messages, and plain-text admin alerts (e.g. failed buyer notification, COD returned).
- **LINE Messaging API (followers)**: `https://api.line.me/v2/bot/followers/ids` used to detect which members have blocked/un-friended the Official Account (`syncBlockedMembersStatus`, daily trigger at 03:00). A 400 response containing "blocked"/"hasn't added..." from a push call also immediately flags that member as blocked (`markMemberBlockedStatus_`) without waiting for the daily sync.
- **Google Drive**: slip images stored in folder `SLIP_FOLDER_ID_SHOP = 1aQQYvzFyZ79GDFQO352RdBPzdnCb0MnH`; sharing is set to "anyone with link, view" only when a LINE image message actually needs to reference it.
- **PromptPay / bank account** (static display data only, no payment gateway API): PromptPay ID `0105555177061`, Kasikorn Bank account `0698834641`, account name "บริษัท สปังกี้ ฟู้ด จำกัด" — payment confirmation is entirely manual (customer uploads a slip photo; there is no automated bank/PromptPay verification).
- **GitHub raw content**: birthday cake hero image fetched from `https://raw.githubusercontent.com/Em-O-Cha/Order/main/cake.png`.

---

## 5. Scheduled / Trigger Functions (separate from the web-app API)

| Trigger function | Schedule | Purpose |
|---|---|---|
| `runExpiryAutoDisableDaily` (`installExpiryAutoDisableTrigger`) | daily @ 01:00 | Force `active=FALSE` on any expired row across Member_Privileges/Coupons/Signup_Privileges/Points_Promos/Rewards_Catalog; logs to `Expiry_Disable_Log` |
| `syncBlockedMembersStatus` (`setupDailyBlockSyncTrigger`) | daily @ 03:00 | Refresh LINE-block status for every member via the followers/ids API; also re-runs `deactivateExpiredRows_` as a safety net |
| `checkAndNotifyNewPrivileges_` (`createPrivilegeNotifyTrigger`) | every 10 minutes | Push a LINE message for any newly-granted, not-yet-notified `Member_Privileges` row whose start date has arrived |
| `runBirthdayPromotionsDaily_` (`createBirthdayPromoTrigger_`) | daily @ 09:00 Asia/Bangkok | Grant birthday/birth-month rewards (points and/or a privilege) per tier, once per cycle (dedup key uses `Birthday_Promo_Log`), and send the Flex "Happy Birthday" card on the grant day |
| `runPendingSlipFinalizations_` (`SLIP_FINALIZE_TRIGGER_HANDLER_`, created ad hoc by `scheduleSlipFinalize_`) | one-off, ~1s after each slip upload | Deferred (non-blocking) LINE notifications + point crediting + referral checks after a slip is attached; deletes its own trigger after running |

Additionally there is a **1-minute time-driven trigger on `processRegistrationQueue`** (referenced extensively in comments as the mechanism that drains `Registration_Queue`, but its `ScriptApp.newTrigger` installer call was not found in the exported source — it appears to have been set up manually once from the Apps Script editor UI rather than programmatically). The web frontend also fire-and-forgets a call to the `processRegistrationQueue` GET action itself right after enqueueing, so the queue is drained both by that manual trigger and by client-triggered kicks.

---

## 6. Other Notable Findings for the Postgres/Supabase Design

- **No true row-level locking exists today** — Apps Script's `LockService.getScriptLock()` (global, single mutex, 15–30s timeout) serializes essentially all writes (signup, order creation, cancellation, reward redemption, profile update). A Postgres design should replace this with either row-level locks/transactions or optimistic concurrency per order/member, not a single global mutex.
- **The admin PIN (`ADMIN_PIN` script property, default `"1234"`) is the only admin auth** — this needs to become real authentication (e.g. Supabase Auth + role) in the rewrite.
- Member identity is LINE UID; there is no email/password. Phone number must be unique across members and is the join key used to match orders in the shared `Revenue` sheet back to a member (since Shopee/TikTok/manual orders may not carry a LINE UID at all — see `ensureMemberFromOrder_`/`applyOrderToMember_`/`backfillMembersFromRevenue`).
- Dates are stored inconsistently as both `Date` objects and formatted strings across sheets (lots of defensive `normalizeDateCell_`/`parseDateInputStr_` code) — the new schema should normalize this with proper `date`/`timestamptz` columns.
- Many "cached" reads (`CacheService`, 15s–600s TTLs) exist purely to work around Google Sheets API latency and row-scan cost; none of that caching strategy needs to carry over to Postgres, which can just use indexed queries.
