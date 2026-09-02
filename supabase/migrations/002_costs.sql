-- ============================================================
-- 002 — Couts : produit, shipping, charges fixes, TVA
-- ============================================================

-- Cout produit : fixe par SKU, identique dans tous les pays.
create table if not exists public.product_costs (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops(id) on delete cascade,
  sku        text not null,
  cost       numeric(12,4) not null default 0,
  source     text not null default 'manual' check (source in ('manual','invoice')),
  updated_at timestamptz not null default now(),
  unique (shop_id, sku)
);

-- Cout shipping : depend du SKU ET du pays (ou de la zone tarifaire).
--   standard = tarif du 1er article du colis
--   upsell   = tarif de chaque article supplementaire
create table if not exists public.shipping_costs (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  sku          text not null,
  country      text not null,               -- code ISO, ou zone tarifaire (AU1, AU2...)
  standard     numeric(12,4) not null default 0,
  upsell       numeric(12,4) not null default 0,
  is_estimated boolean not null default true, -- false = confirme par facture
  confirmations int not null default 0,        -- nb de factures appliquees qui confirment
  updated_at   timestamptz not null default now(),
  unique (shop_id, sku, country)
);

-- Charges de structure et couts variables saisis a la main.
create table if not exists public.costs (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references public.shops(id) on delete cascade,
  label          text not null,
  category       text not null check (category in
                   ('wages','partner','fixed','shopify','owner_salary',
                    'exceptional','logistics','payment','taxes','ad_spend')),
  kind           text not null check (kind in
                   ('one_off','monthly','per_order','per_unit','percent_revenue')),
  amount         numeric(14,4) not null default 0,
  effective_from date not null default current_date,
  effective_to   date,
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists costs_shop_period_idx
  on public.costs (shop_id, effective_from, effective_to);

-- Taux de TVA par pays. Prix TTC : tva = net * taux / (1 + taux).
create table if not exists public.vat_rates (
  country text primary key,
  rate    numeric(6,4) not null
);

insert into public.vat_rates (country, rate) values
  ('GB',0.20),('IE',0.23),('DE',0.19),('FR',0.20),('IT',0.22),('ES',0.21),
  ('NL',0.21),('BE',0.21),('AT',0.20),('PL',0.23),('PT',0.23),('SE',0.25),
  ('DK',0.25),('FI',0.255),('CZ',0.21),('LU',0.17),('HU',0.27),('GR',0.24),
  ('RO',0.19),('SK',0.23),('SI',0.22),('HR',0.25),('BG',0.20),('LT',0.21),
  ('LV',0.21),('EE',0.22),('CY',0.19),('MT',0.18),('NO',0.25),('CH',0.081),
  ('IS',0.24),('AU',0.10),('NZ',0.15),('CA',0.05),('ZA',0.15),('MX',0.16),
  ('AE',0.05),('SG',0.09),('JP',0.10)
on conflict (country) do update set rate = excluded.rate;

-- Ramene une zone tarifaire a son pays pour la TVA : AU1 -> AU, US -> US.
-- Un pays absent de la table (dont les Etats-Unis) donne un taux de 0.
create or replace function public.vat_rate_for(p_country text)
returns numeric
language sql
stable
as $$
  select coalesce(
    (select rate from public.vat_rates
      where country = upper(regexp_replace(coalesce(p_country,''), '[0-9]+$', ''))),
    0);
$$;
