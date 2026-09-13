-- 033 : Targets — ROAS BE / target / range / -20 % / cout ATC, calcules sur le
-- produit principal de la boutique a partir des VRAIES commandes (mix reel).
create table if not exists public.shop_targets (
  shop_id       uuid primary key references public.shops(id) on delete cascade,
  main_skus     text[] not null default '{}',
  main_label    text,
  margin_min    numeric(5,2) not null default 15,   -- % du prix
  margin_target numeric(5,2) not null default 20,
  loss_pct      numeric(5,2) not null default 20,   -- "ROAS -20 % de perte"
  atc_pct       numeric(5,2) not null default 20,   -- cout ATC max = % de l'AOV
  updated_at    timestamptz not null default now()
);
alter table public.shop_targets enable row level security;
drop policy if exists shop_targets_acces on public.shop_targets;
create policy shop_targets_acces on public.shop_targets
  for all using (public.can_access_shop(shop_id)) with check (public.can_access_shop(shop_id));

-- Donnees brutes de la periode pour les commandes contenant le produit principal.
create or replace function public.targets_data(p_shop uuid, p_skus text[], p_from date, p_to date)
returns jsonb language sql stable as $$
  with cmd as (
    select o.revenue - o.refunded as net, o.cogs, o.product_cost, o.shipping_cost,
           o.transaction_fee, o.fee_estimated, o.revenue,
           least((select coalesce(sum((o.items->>s)::numeric), 0) from unnest(p_skus) s), 4)::int as qte
      from public.orders o
     where o.shop_id = p_shop and o.order_day between p_from and p_to
       and o.cancelled_at is null and o.items ?| p_skus
  ),
  tot as (select count(*) as n from cmd),
  mix as (
    select c.qte, count(*) as n, avg(c.net) as aov, avg(c.cogs) as cogs
      from cmd c group by c.qte
  )
  select jsonb_build_object(
    'orders',        (select n from tot),
    'aov',           (select avg(net) from cmd),
    'cogs',          (select avg(cogs) from cmd),
    'product_cost',  (select avg(product_cost) from cmd),
    'shipping_cost', (select avg(shipping_cost) from cmd),
    'psp_rate',      (select sum(transaction_fee) / nullif(sum(revenue), 0) from cmd),
    'fee_estimated', (select coalesce(bool_or(fee_estimated), false) from cmd),
    'mix', (select coalesce(jsonb_agg(jsonb_build_object(
              'qty', m.qte, 'orders', m.n, 'share', m.n::numeric / nullif(t.n, 0),
              'aov', m.aov, 'cogs', m.cogs) order by m.qte), '[]'::jsonb)
            from mix m cross join tot t),
    'shop', (select jsonb_build_object(
              'revenue', coalesce(sum(net_revenue), 0), 'ad_spend', coalesce(sum(ad_spend_total), 0),
              'orders', coalesce(sum(orders_count), 0), 'add_to_carts', coalesce(sum(add_to_carts), 0))
             from public.daily_facts where shop_id = p_shop and day between p_from and p_to)
  );
$$;
