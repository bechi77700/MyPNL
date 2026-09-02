-- ============================================================
-- 022 — Frais de transaction rattaches a CHAQUE commande
-- Shopify donne source_order_id sur chaque transaction de solde :
-- on peut donc calculer un profit par commande, pas une estimation.
-- ============================================================

alter table public.orders
  add column if not exists transaction_fee numeric(12,4) not null default 0;

create index if not exists orders_shop_day_profit_idx
  on public.orders (shop_id, order_day desc);

-- Profit d'une commande = CA net - taxe - COGS - frais reels.
create or replace function public.orders_report(
  p_shop uuid, p_from date, p_to date,
  p_limite integer default 100, p_decalage integer default 0,
  p_recherche text default null
)
returns table (
  external_id text, order_number text, order_day date, country text,
  shipping_zone text, units integer, revenue numeric, refunded numeric,
  vat numeric, product_cost numeric, shipping_cost numeric, cogs numeric,
  transaction_fee numeric, profit numeric, marge_pct numeric,
  shipping_estimated boolean, cogs_manquant boolean, is_new_customer boolean,
  total_lignes bigint
)
language sql stable as $$
  with base as (
    select o.*,
           (o.revenue - o.refunded - o.vat - o.cogs - o.transaction_fee) as profit
    from public.orders o
    where o.shop_id = p_shop
      and o.order_day between p_from and p_to
      and o.cancelled_at is null
      and (p_recherche is null or p_recherche = ''
           or o.order_number ilike '%' || p_recherche || '%'
           or o.external_id = p_recherche)
  )
  select b.external_id, b.order_number, b.order_day, b.country, b.shipping_zone,
         b.units, b.revenue, b.refunded, b.vat,
         b.product_cost, b.shipping_cost, b.cogs, b.transaction_fee,
         b.profit,
         case when (b.revenue - b.refunded) > 0
              then b.profit / (b.revenue - b.refunded) * 100 end as marge_pct,
         b.shipping_estimated,
         (b.items <> '{}'::jsonb and b.cogs = 0) as cogs_manquant,
         b.is_new_customer,
         count(*) over () as total_lignes
  from base b
  order by b.order_day desc, b.order_number desc
  limit p_limite offset p_decalage;
$$;

-- Totaux de la periode, pour l'en-tete du rapport.
create or replace function public.orders_report_totaux(p_shop uuid, p_from date, p_to date)
returns table (
  commandes bigint, revenue numeric, cogs numeric, frais numeric,
  profit numeric, perdantes bigint, sans_cogs bigint, shipping_estime bigint
)
language sql stable as $$
  select count(*),
         coalesce(sum(revenue - refunded), 0),
         coalesce(sum(cogs), 0),
         coalesce(sum(transaction_fee), 0),
         coalesce(sum(revenue - refunded - vat - cogs - transaction_fee), 0),
         count(*) filter (where (revenue - refunded - vat - cogs - transaction_fee) < 0),
         count(*) filter (where items <> '{}'::jsonb and cogs = 0),
         count(*) filter (where shipping_estimated)
  from public.orders
  where shop_id = p_shop and order_day between p_from and p_to and cancelled_at is null;
$$;
