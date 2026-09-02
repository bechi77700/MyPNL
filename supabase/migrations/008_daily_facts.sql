-- ============================================================
-- 008 — Cache journalier : 1 ligne par jour et par boutique
-- Le dashboard lit CE cache, jamais les commandes brutes.
-- ============================================================

create table if not exists public.daily_facts (
  shop_id          uuid not null references public.shops(id) on delete cascade,
  day              date not null,
  orders_count     integer not null default 0,
  units            integer not null default 0,
  revenue          numeric(14,4) not null default 0,  -- CA TTC
  refunds          numeric(14,4) not null default 0,
  net_revenue      numeric(14,4) not null default 0,  -- CA - remboursements
  vat              numeric(14,4) not null default 0,  -- TVA calculee
  taxes            numeric(14,4) not null default 0,  -- taxes declarees par Shopify
  revenue_ht       numeric(14,4) not null default 0,  -- CA net - taxes
  product_cost     numeric(14,4) not null default 0,
  shipping_cost    numeric(14,4) not null default 0,
  cogs             numeric(14,4) not null default 0,
  transaction_fees numeric(14,4) not null default 0,  -- frais REELS (payouts)
  disputes_lost    numeric(14,4) not null default 0,
  ad_spend_total   numeric(14,4) not null default 0,
  ad_spend         jsonb not null default '{}'::jsonb, -- detail par plateforme
  sessions         bigint not null default 0,
  visitors         bigint not null default 0,
  add_to_carts     bigint not null default 0,
  new_customers    integer not null default 0,
  repeat_orders    integer not null default 0,
  cos              numeric(14,4) not null default 0,  -- cogs + frais de transaction
  gross_margin     numeric(14,4) not null default 0,  -- CA HT - COS
  contribution     numeric(14,4) not null default 0,  -- marge brute - pub
  updated_at       timestamptz not null default now(),
  primary key (shop_id, day)
);

-- Recalcule UNIQUEMENT la fenetre demandee. Le passe reste fige.
create or replace function public.refresh_daily_facts(p_shop uuid, p_from date, p_to date)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from public.daily_facts
   where shop_id = p_shop and day between p_from and p_to;

  with jours as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  cmd as (
    select order_day as day,
           count(*)                          as orders_count,
           sum(units)                        as units,
           sum(revenue)                      as revenue,
           sum(refunded)                     as refunds,
           sum(vat)                          as vat,
           sum(taxes)                        as taxes,
           sum(product_cost)                 as product_cost,
           sum(shipping_cost)                as shipping_cost,
           sum(cogs)                         as cogs,
           count(*) filter (where is_new_customer)          as new_customers,
           count(*) filter (where is_new_customer is false) as repeat_orders
      from public.orders
     where shop_id = p_shop and order_day between p_from and p_to
       and cancelled_at is null
     group by order_day
  ),
  pub as (
    select date as day, sum(amount) as total,
           jsonb_object_agg(platform, amount) as detail
      from public.ad_spend
     where shop_id = p_shop and date between p_from and p_to
     group by date
  ),
  frais as (
    select date as day, fees from public.shop_fees_daily
     where shop_id = p_shop and date between p_from and p_to
  ),
  lit as (
    select date as day, sum(amount) as lost from public.shop_disputes
     where shop_id = p_shop and date between p_from and p_to and status = 'lost'
     group by date
  ),
  traf as (
    select date as day, sessions, visitors, add_to_carts from public.shop_sessions
     where shop_id = p_shop and date between p_from and p_to
  ),
  calc as (
    select j.day,
      coalesce(c.orders_count,0)  as orders_count,
      coalesce(c.units,0)::int    as units,
      coalesce(c.revenue,0)       as revenue,
      coalesce(c.refunds,0)       as refunds,
      coalesce(c.vat,0)           as vat,
      coalesce(c.taxes,0)         as taxes,
      coalesce(c.product_cost,0)  as product_cost,
      coalesce(c.shipping_cost,0) as shipping_cost,
      coalesce(c.cogs,0)          as cogs,
      coalesce(f.fees,0)          as transaction_fees,
      coalesce(l.lost,0)          as disputes_lost,
      coalesce(p.total,0)         as ad_spend_total,
      coalesce(p.detail,'{}'::jsonb) as ad_spend,
      coalesce(t.sessions,0)      as sessions,
      coalesce(t.visitors,0)      as visitors,
      coalesce(t.add_to_carts,0)  as add_to_carts,
      coalesce(c.new_customers,0) as new_customers,
      coalesce(c.repeat_orders,0) as repeat_orders
    from jours j
    left join cmd  c on c.day = j.day
    left join pub  p on p.day = j.day
    left join frais f on f.day = j.day
    left join lit  l on l.day = j.day
    left join traf t on t.day = j.day
  )
  insert into public.daily_facts (
    shop_id, day, orders_count, units, revenue, refunds, net_revenue, vat, taxes,
    revenue_ht, product_cost, shipping_cost, cogs, transaction_fees, disputes_lost,
    ad_spend_total, ad_spend, sessions, visitors, add_to_carts,
    new_customers, repeat_orders, cos, gross_margin, contribution, updated_at)
  select
    p_shop, day, orders_count, units, revenue, refunds,
    revenue - refunds                                            as net_revenue,
    vat, taxes,
    -- On retire les taxes reellement declarees par Shopify ; a defaut, la TVA
    -- calculee depuis la table de taux (evite tout double comptage).
    (revenue - refunds) - coalesce(nullif(taxes,0), vat)          as revenue_ht,
    product_cost, shipping_cost, cogs, transaction_fees, disputes_lost,
    ad_spend_total, ad_spend, sessions, visitors, add_to_carts,
    new_customers, repeat_orders,
    cogs + transaction_fees                                      as cos,
    ((revenue - refunds) - coalesce(nullif(taxes,0), vat))
      - (cogs + transaction_fees)                                as gross_margin,
    (((revenue - refunds) - coalesce(nullif(taxes,0), vat))
      - (cogs + transaction_fees)) - ad_spend_total              as contribution,
    now()
  from calc;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Lecture du cache par le dashboard. RLS applique (security invoker par defaut).
create or replace function public.dashboard_daily(p_shop uuid, p_from date, p_to date)
returns setof public.daily_facts
language sql stable as $$
  select * from public.daily_facts
   where shop_id = p_shop and day between p_from and p_to
   order by day;
$$;
