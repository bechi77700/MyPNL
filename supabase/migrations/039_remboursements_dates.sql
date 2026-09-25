-- ============================================================
-- 039 — Remboursements dates au jour du remboursement
-- Avant : rattaches au jour de la COMMANDE, donc quasi nuls sur les periodes
-- recentes et reecrivant le passe. Maintenant : un remboursement pese sur le
-- jour ou il est fait, comme dans Shopify Analytics.
-- + Moyens de paiement : nouvelle tentative de detail (3 sources), trace brute.
-- ============================================================

create table if not exists public.order_refunds (
  shop_id           uuid not null references public.shops(id) on delete cascade,
  refund_id         text not null,
  order_external_id text not null,
  refunded_at       timestamptz not null,
  amount            numeric(14,4) not null default 0,   -- devise de la boutique
  primary key (shop_id, refund_id)
);
create index if not exists order_refunds_commande_idx on public.order_refunds (shop_id, order_external_id);
create index if not exists order_refunds_date_idx on public.order_refunds (shop_id, refunded_at);
alter table public.order_refunds enable row level security;
drop policy if exists order_refunds_acces on public.order_refunds;
create policy order_refunds_acces on public.order_refunds
  for all using (public.can_access_shop(shop_id)) with check (public.can_access_shop(shop_id));

-- true = le detail des remboursements de la commande est dans order_refunds.
alter table public.orders add column if not exists refunds_synced boolean not null default false;
create index if not exists orders_remb_a_rapatrier_idx
  on public.orders (shop_id, order_date desc)
  where refunded > 0 and not refunds_synced;

create or replace function public.set_refunds_synced(p_shop uuid, p_ids text[])
returns integer language plpgsql as $$
declare n integer;
begin
  update public.orders set refunds_synced = true
   where shop_id = p_shop and external_id = any(p_ids) and not refunds_synced;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Moyens de paiement : les commandes marquees "non detaillees" sont retentees
-- avec la nouvelle lecture ; payment_raw garde ce que Shopify a renvoye si ca echoue encore.
alter table public.orders add column if not exists payment_raw jsonb;
update public.orders set payment_method = null where payment_method = 'shopify_payments';

create or replace function public.set_order_payment_raw(p_shop uuid, p_ids text[], p_raws jsonb[])
returns integer language plpgsql as $$
declare n integer;
begin
  update public.orders o set payment_raw = v.raw
    from unnest(p_ids, p_raws) as v(external_id, raw)
   where o.shop_id = p_shop and o.external_id = v.external_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.refresh_daily_facts(p_shop uuid, p_from date, p_to date)
returns integer language plpgsql as $$
declare
  n    integer;
  v_tz text;
begin
  select coalesce(timezone, 'UTC') into v_tz from public.shops where id = p_shop;

  delete from public.daily_facts
   where shop_id = p_shop and day between p_from and p_to;

  with jours as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  cmd as (
    select order_day as day,
           count(*) as orders_count, sum(units) as units,
           sum(revenue) as revenue,
           sum(vat) as vat, sum(taxes) as taxes,
           sum(product_cost) as product_cost, sum(shipping_cost) as shipping_cost,
           sum(cogs) as cogs,
           sum(transaction_fee) filter (where fee_estimated) as fees_est,
           count(*) filter (where is_new_customer)          as new_customers,
           count(*) filter (where is_new_customer is false) as repeat_orders
      from public.orders
     where shop_id = p_shop and order_day between p_from and p_to
       and cancelled_at is null
     group by order_day
  ),
  -- Remboursements au jour ou ils sont faits (fuseau de la boutique). Une commande
  -- dont le detail n'est pas encore rapatrie garde l'ancienne regle : jour de commande.
  remb as (
    select x.day, sum(x.amount) as refunds from (
      select (r.refunded_at at time zone v_tz)::date as day, r.amount
        from public.order_refunds r
        join public.orders o
          on o.shop_id = r.shop_id and o.external_id = r.order_external_id
         and o.cancelled_at is null and o.refunds_synced
       where r.shop_id = p_shop
         and r.refunded_at >= (p_from - 1)::timestamptz and r.refunded_at < (p_to + 2)::timestamptz
      union all
      select o.order_day, o.refunded from public.orders o
       where o.shop_id = p_shop and o.order_day between p_from and p_to
         and o.cancelled_at is null and o.refunded > 0 and not o.refunds_synced
    ) x
    where x.day between p_from and p_to
    group by x.day
  ),
  pub as (
    select date as day, sum(amount) as total, jsonb_object_agg(platform, amount) as detail
      from public.ad_spend
     where shop_id = p_shop and date between p_from and p_to group by date
  ),
  frais as (
    select date as day, fees from public.shop_fees_daily
     where shop_id = p_shop and date between p_from and p_to
  ),
  lit as (
    select date as day, sum(amount) as lost from public.shop_disputes
     where shop_id = p_shop and date between p_from and p_to and status in ('lost', 'accepted') group by date
  ),
  traf as (
    select date as day, sessions, visitors, add_to_carts from public.shop_sessions
     where shop_id = p_shop and date between p_from and p_to
  ),
  calc as (
    select j.day,
      coalesce(c.orders_count,0) as orders_count, coalesce(c.units,0)::int as units,
      coalesce(c.revenue,0) as revenue, coalesce(r.refunds,0) as refunds,
      coalesce(c.vat,0) as vat, coalesce(c.taxes,0) as taxes,
      coalesce(c.product_cost,0) as product_cost, coalesce(c.shipping_cost,0) as shipping_cost,
      coalesce(c.cogs,0) as cogs, coalesce(f.fees,0) + coalesce(c.fees_est,0) as transaction_fees,
      coalesce(l.lost,0) as disputes_lost, coalesce(p.total,0) as ad_spend_total,
      coalesce(p.detail,'{}'::jsonb) as ad_spend,
      coalesce(t.sessions,0) as sessions, coalesce(t.visitors,0) as visitors,
      coalesce(t.add_to_carts,0) as add_to_carts,
      coalesce(c.new_customers,0) as new_customers, coalesce(c.repeat_orders,0) as repeat_orders
    from jours j
    left join cmd c on c.day = j.day
    left join remb r on r.day = j.day
    left join pub p on p.day = j.day
    left join frais f on f.day = j.day
    left join lit l on l.day = j.day
    left join traf t on t.day = j.day
  )
  insert into public.daily_facts (
    shop_id, day, orders_count, units, revenue, refunds, net_revenue, vat, taxes,
    revenue_ht, product_cost, shipping_cost, cogs, transaction_fees, disputes_lost,
    ad_spend_total, ad_spend, sessions, visitors, add_to_carts,
    new_customers, repeat_orders, cos, gross_margin, contribution, updated_at)
  select
    p_shop, day, orders_count, units, revenue, refunds,
    revenue - refunds                                as net_revenue,
    vat, taxes,
    (revenue - refunds) - vat                        as revenue_ht,
    product_cost, shipping_cost, cogs, transaction_fees, disputes_lost,
    ad_spend_total, ad_spend, sessions, visitors, add_to_carts,
    new_customers, repeat_orders,
    cogs + transaction_fees                          as cos,
    ((revenue - refunds) - vat) - (cogs + transaction_fees) as gross_margin,
    (((revenue - refunds) - vat) - (cogs + transaction_fees)) - ad_spend_total as contribution,
    now()
  from calc;

  get diagnostics n = row_count;
  return n;
end;
$$;
