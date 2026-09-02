-- ============================================================
-- 004 — Depenses publicitaires, trafic, connecteurs
-- ============================================================

create table if not exists public.ad_spend (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops(id) on delete cascade,
  date       date not null,
  platform   text not null,          -- meta, google, tiktok, snapchat, pinterest, shop, manual
  amount     numeric(14,4) not null default 0,
  updated_at timestamptz not null default now(),
  unique (shop_id, date, platform)
);
create index if not exists ad_spend_shop_date_idx on public.ad_spend (shop_id, date);

create table if not exists public.ad_spend_hourly (
  id       uuid primary key default gen_random_uuid(),
  shop_id  uuid not null references public.shops(id) on delete cascade,
  date     date not null,
  hour     smallint not null check (hour between 0 and 23),
  platform text not null,
  amount   numeric(14,4) not null default 0,
  unique (shop_id, date, hour, platform)
);

-- Metriques pub complementaires (ajouts panier attribues, clics, impressions).
create table if not exists public.ad_insights (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  date         date not null,
  platform     text not null,
  impressions  bigint not null default 0,
  clicks       bigint not null default 0,
  add_to_carts bigint not null default 0,
  purchases    bigint not null default 0,
  unique (shop_id, date, platform)
);

-- Trafic boutique (ShopifyQL).
create table if not exists public.shop_sessions (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  date         date not null,
  sessions     bigint not null default 0,
  visitors     bigint not null default 0,
  add_to_carts bigint not null default 0,
  unique (shop_id, date)
);

-- Connecteurs : identifiants chiffres avec APP_ENCRYPTION_KEY, jamais en clair.
create table if not exists public.connectors (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  platform      text not null,        -- shopify, meta, google
  creds_encrypted text,
  sync_cursor   jsonb not null default '{}'::jsonb,
  status        text not null default 'disconnected'
                check (status in ('connected','disconnected','error')),
  last_error    text,
  last_sync_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (shop_id, platform)
);
