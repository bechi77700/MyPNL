-- ============================================================
-- 005 — Frais de transaction REELS et litiges (Shopify Payments)
-- ============================================================

-- Versements Shopify Payments : la source de verite des frais.
create table if not exists public.shop_payouts (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  external_id text not null,
  date        date not null,
  gross       numeric(14,4) not null default 0,
  fees        numeric(14,4) not null default 0,
  adjustments numeric(14,4) not null default 0,
  net         numeric(14,4) not null default 0,
  currency    text,
  status      text,
  unique (shop_id, external_id)
);
create index if not exists shop_payouts_shop_date_idx on public.shop_payouts (shop_id, date);

-- Frais reels agreges par jour : ce que lit le dashboard.
create table if not exists public.shop_fees_daily (
  shop_id    uuid not null references public.shops(id) on delete cascade,
  date       date not null,
  fees       numeric(14,4) not null default 0,
  is_real    boolean not null default true,  -- false = estimation de repli
  updated_at timestamptz not null default now(),
  primary key (shop_id, date)
);

-- Litiges / chargebacks. Seuls les perdus sont deduits du profit.
create table if not exists public.shop_disputes (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  external_id text not null,
  order_external_id text,
  date        date not null,
  amount      numeric(14,4) not null default 0,
  reason      text,
  status      text,           -- won, lost, needs_response, under_review
  currency    text,
  unique (shop_id, external_id)
);
create index if not exists shop_disputes_shop_date_idx on public.shop_disputes (shop_id, date);
