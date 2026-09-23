-- Only LINE-shop orders live in `orders`; the old Revenue sheet also holds Shopee/TikTok/manual rows that are not migrated.

create extension if not exists pgcrypto;

-- ============================================================
-- Membership tiers
-- ============================================================
create table tier_config (
  key text primary key,
  name_th text not null,
  name_en text not null,
  card_color_hex text,
  text_color_hex text,
  min_spend numeric(12,2) not null default 0,
  min_points integer not null default 0,
  point_multiplier numeric(6,3) not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table tier_config is 'Tier ladder. Members never downgrade below their current tier even if lifetime spend would compute lower (see business logic doc).';

-- ============================================================
-- Members
-- ============================================================
create table members (
  id uuid primary key default gen_random_uuid(),
  line_uid text unique not null,
  display_name text,
  profile_pic_url text,
  phone text unique,
  full_name text,
  birthday date,
  joined_at timestamptz not null default now(),
  points_balance integer not null default 0,
  tier_key text references tier_config(key),
  last_shipping_address text,
  last_province text,
  lifetime_spend numeric(12,2) not null default 0,
  member_code text unique,
  referred_by_line_uid text references members(line_uid),
  referral_reward_granted boolean not null default false,
  line_oa_blocked boolean not null default false,
  line_oa_blocked_checked_at timestamptz,
  line_oa_first_blocked_at timestamptz,
  cod_blocked boolean not null default false,
  cod_block_reason text,
  cod_block_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index members_phone_idx on members(phone);
create index members_tier_idx on members(tier_key);

-- ============================================================
-- Signup welcome privileges (config, not per-member grants)
-- ============================================================
create table signup_privileges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  discount_type text not null check (discount_type in ('percent','fixed','bogo','ship_percent','ship_fixed')),
  value numeric(12,2) not null default 0,
  expires_in_days integer,
  restricted_product text,
  bogo_buy_product text,
  bogo_free_qty integer,
  min_purchase numeric(12,2) not null default 0,
  promo_start date,
  promo_end date,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Referral programs
-- ============================================================
create table referral_log (
  id uuid primary key default gen_random_uuid(),
  referred_at timestamptz not null default now(),
  referrer_id uuid references members(id),
  referred_id uuid references members(id),
  reward_status text not null default 'pending',
  reward_at timestamptz,
  reward_detail text
);

create table purchase_referral_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  referrer_id uuid references members(id),
  buyer_id uuid references members(id),
  order_id uuid,
  purchase_amount numeric(12,2),
  reward_status text not null default 'pending',
  reward_detail text
);

-- ============================================================
-- Async signup queue
-- ============================================================
create table registration_queue (
  id uuid primary key default gen_random_uuid(),
  request_code text unique not null,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','COMPLETED','FAILED')),
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retry_count integer not null default 0,
  line_uid text not null,
  id_token text not null,
  phone text,
  full_name text,
  birthday date,
  referrer_code text,
  result jsonb,
  member_code text
);

-- ============================================================
-- Points promos (multiplier / repeat-purchase bonus campaigns)
-- ============================================================
create table points_promos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  promo_type text not null check (promo_type in ('multiplier','repeat')),
  enabled boolean not null default true,
  start_date date,
  end_date date,
  point_multiplier numeric(6,3),
  min_purchase numeric(12,2),
  restricted_product text,
  bonus_points integer,
  bonus_discount_type text check (bonus_discount_type in ('percent','fixed')),
  bonus_discount_value numeric(12,2),
  card_header_text text,
  created_at timestamptz not null default now()
);

create table tier_perks (
  id uuid primary key default gen_random_uuid(),
  perk_text text not null,
  tier_key text not null references tier_config(key),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Store-wide coupons
-- ============================================================
create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_type text not null check (discount_type in ('percent','fixed','bogo','ship_percent','ship_fixed')),
  value numeric(12,2) not null default 0,
  min_purchase numeric(12,2) not null default 0,
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  starts_at timestamptz,
  enabled boolean not null default true,
  auto_apply boolean not null default false,
  restricted_product text,
  bogo_free_product text,
  bogo_free_qty integer,
  bogo_free_discount_percent numeric(5,2) not null default 100,
  tier_restriction text[],
  card_header_text text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Per-member issued privileges (highest-priority discount mechanism)
-- ============================================================
create table member_privileges (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  name text not null,
  discount_type text not null check (discount_type in ('percent','fixed','bogo','ship_percent','ship_fixed')),
  value numeric(12,2) not null default 0,
  granted_by text,
  granted_at timestamptz not null default now(),
  usable_from date,
  expires_at timestamptz,
  active boolean not null default true,
  notified boolean not null default false,
  new_promo_announced boolean not null default false,
  bogo_buy_product text,
  bogo_free_product text,
  bogo_free_qty integer,
  bogo_free_discount_percent numeric(5,2),
  min_purchase numeric(12,2) not null default 0,
  used_at timestamptz
);

create index member_privileges_member_idx on member_privileges(member_id);
create index member_privileges_active_idx on member_privileges(member_id, active) where active;

comment on table member_privileges is 'If a member holds ANY active row here, ALL coupons and the repeat-purchase discount are blocked store-wide for that member (see business logic doc, section 3.2).';

-- ============================================================
-- Points-threshold auto rewards
-- ============================================================
create table point_rewards (
  id uuid primary key default gen_random_uuid(),
  points_required integer not null,
  privilege_name text not null,
  discount_type text not null check (discount_type in ('percent','fixed')),
  value numeric(12,2) not null default 0,
  privilege_expiry_days integer,
  enabled boolean not null default true
);

-- ============================================================
-- Points ledger (append-only)
-- ============================================================
create table points_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  member_id uuid not null references members(id) on delete cascade,
  entry_type text not null check (entry_type in ('earn','redeem','adjust_add','adjust_sub')),
  description text,
  order_id uuid,
  points_delta integer not null,
  balance_after integer not null
);

create index points_log_member_idx on points_log(member_id, occurred_at desc);

-- ============================================================
-- Expiry auto-disable audit trail
-- ============================================================
create table expiry_disable_log (
  id uuid primary key default gen_random_uuid(),
  disabled_at timestamptz not null default now(),
  source_table text not null,
  source_id uuid,
  item_name text,
  expiry_date timestamptz
);

-- ============================================================
-- Birthday / birth-month promo grants
-- ============================================================
create table birthday_promo_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  mode text not null check (mode in ('birthday','birthMonth')),
  cycle_key text not null,
  tier_at_grant text,
  privilege_id uuid references member_privileges(id),
  granted_at timestamptz not null default now(),
  usable_from date,
  expires_at timestamptz,
  line_sent boolean not null default false,
  detail text,
  unique (member_id, mode, cycle_key)
);

-- ============================================================
-- Shipping rate table (weight-tiered flat rate)
-- ============================================================
create table shipping_config (
  id uuid primary key default gen_random_uuid(),
  max_weight_g integer not null,
  price numeric(10,2) not null
);

create unique index shipping_config_weight_idx on shipping_config(max_weight_g);

-- ============================================================
-- Point-redeemable rewards catalog
-- ============================================================
create table rewards_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('coupon','buy_product','free_product','premium','tier_upgrade','activity')),
  discount_type text, -- percent/fixed for coupon-like rewards, or a tier_config key for tier_upgrade
  value numeric(12,2),
  detail text,
  points_required integer not null,
  coupon_validity_days integer,
  enabled boolean not null default true,
  redeem_limit integer not null default 0, -- 0 = unlimited
  redeemed_count integer not null default 0,
  image_url text,
  promo_start date,
  promo_end date,
  created_at timestamptz not null default now()
);

create table redemption_log (
  id uuid primary key default gen_random_uuid(),
  redeemed_at timestamptz not null default now(),
  member_id uuid not null references members(id) on delete cascade,
  reward_id uuid references rewards_catalog(id),
  qty integer not null default 1,
  status text not null default 'รอดำเนินการ'
);

-- ============================================================
-- Marketing campaign log
-- ============================================================
create table campaign_log (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  target_segment text,
  target_count integer,
  success_count integer,
  fail_count integer,
  granted_privilege boolean not null default false,
  privilege_name text,
  message_title text,
  note text
);

-- ============================================================
-- Product catalog (from Master Data / SKU sheet)
-- ============================================================
create table products (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  variant_label text not null,
  price numeric(12,2) not null,
  image_url text,
  weight_g integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Orders + items (replaces the one-row-per-item Revenue sheet layout)
-- ============================================================
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null, -- kept for continuity with old REV{YY}{MM}{NNN} numbering during transition
  member_id uuid references members(id),
  customer_name text,
  phone text,
  province text,
  address text,
  sales_channel text not null default 'LINE Shop',
  payment_method text not null check (payment_method in ('bank_transfer','promptpay','cod')),
  payment_label text,
  status text not null default 'pending' check (status in ('pending','awaiting_review','paid','cancelled')),
  slip_url text,
  payment_date timestamptz,
  cod_status text check (cod_status in ('รอเก็บเงิน','เก็บเงินแล้ว','ตีกลับ')),
  cod_received_at timestamptz,
  cod_tracking_number text,
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  shipping_fee numeric(12,2) not null default 0,
  cod_fee numeric(12,2) not null default 0,
  bill_total numeric(12,2) not null default 0,
  points_reserved integer not null default 0,
  points_redeemed_cash numeric(12,2) not null default 0,
  campaign_label text,
  remark text,
  purchase_referral_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_member_idx on orders(member_id);
create index orders_phone_idx on orders(phone);
create index orders_status_idx on orders(status);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  product_name text not null,
  qty integer not null,
  unit_price numeric(12,2) not null,
  item_discount numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null default 0
);

create index order_items_order_idx on order_items(order_id);

alter table purchase_referral_log add constraint purchase_referral_log_order_fk foreign key (order_id) references orders(id);
alter table points_log add constraint points_log_order_fk foreign key (order_id) references orders(id);
create index points_log_order_idx on points_log(order_id);

-- RLS on with zero policies: deny-by-default for anon/authenticated; Edge Functions use service_role, which bypasses RLS.
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename in (
        'tier_config','members','signup_privileges','referral_log',
        'purchase_referral_log','registration_queue','points_promos',
        'tier_perks','coupons','member_privileges','point_rewards',
        'points_log','expiry_disable_log','birthday_promo_log',
        'shipping_config','rewards_catalog','redemption_log',
        'campaign_log','products','orders','order_items'
      )
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
