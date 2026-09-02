-- ============================================================
-- 021 — La TVA n'est plus jamais calculee automatiquement
-- Par defaut : zero. L'utilisateur decide.
-- ============================================================

-- none    : aucune taxe deduite (defaut)
-- shopify : on deduit ce que Shopify declare avoir reellement collecte
-- manual  : on applique les taux saisis par l'utilisateur, pays par pays
alter table public.shops
  add column if not exists tax_mode text not null default 'none'
    check (tax_mode in ('none', 'shopify', 'manual'));

-- Taux saisis a la main, par boutique. Vide = aucune taxe.
create table if not exists public.shop_vat_rates (
  shop_id uuid not null references public.shops(id) on delete cascade,
  country text not null,
  rate    numeric(6,4) not null,
  primary key (shop_id, country)
);
alter table public.shop_vat_rates enable row level security;
grant select, insert, update, delete on public.shop_vat_rates to authenticated;
drop policy if exists shop_vat_rates_select on public.shop_vat_rates;
drop policy if exists shop_vat_rates_write  on public.shop_vat_rates;
create policy shop_vat_rates_select on public.shop_vat_rates for select to authenticated
  using (public.can_access_shop(shop_id));
create policy shop_vat_rates_write on public.shop_vat_rates for all to authenticated
  using (public.can_access_shop(shop_id) and public.is_admin())
  with check (public.can_access_shop(shop_id) and public.is_admin());

-- La table vat_rates devient un simple CATALOGUE de taux usuels, propose
-- dans l'interface. Elle n'est plus jamais appliquee toute seule.
comment on table public.vat_rates is
  'Catalogue indicatif de taux usuels. Jamais applique automatiquement : voir shop_vat_rates.';

-- Taux effectif : uniquement ce que l'utilisateur a saisi.
create or replace function public.vat_rate_for_shop(p_shop uuid, p_country text)
returns numeric language sql stable as $$
  select coalesce(
    (select rate from public.shop_vat_rates
      where shop_id = p_shop
        and country = upper(regexp_replace(coalesce(p_country, ''), '[0-9]+$', ''))),
    0);
$$;

create or replace function public.orders_fill_computed()
returns trigger language plpgsql as $$
declare
  v_tz   text;
  v_mode text;
  v_rate numeric;
  v_net  numeric;
  v_ship record;
begin
  select timezone, tax_mode into v_tz, v_mode from public.shops where id = new.shop_id;
  new.order_day := (new.order_date at time zone coalesce(v_tz, 'UTC'))::date;

  new.shipping_zone := public.resolve_zone(new.shop_id, new.country, new.postal_code);

  new.units        := public.compute_units(new.items);
  new.product_cost := public.compute_product_cost(new.shop_id, new.items);

  select * into v_ship
    from public.compute_shipping(new.shop_id, new.items, new.shipping_zone);
  new.shipping_cost      := coalesce(v_ship.cost, 0);
  new.shipping_estimated := coalesce(v_ship.estimated, false);

  if new.cogs_source <> 'invoice' then
    new.cogs := new.product_cost + new.shipping_cost;
  end if;

  -- orders.vat = la taxe REELLEMENT deduite du CA, selon le mode choisi.
  v_net := new.revenue - new.refunded;
  if v_mode = 'shopify' then
    new.vat := new.taxes;
  elsif v_mode = 'manual' then
    v_rate := public.vat_rate_for_shop(new.shop_id, new.country);
    new.vat := case when v_rate > 0 then v_net * v_rate / (1 + v_rate) else 0 end;
  else
    new.vat := 0;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Le cache deduit exactement orders.vat, plus de regle implicite.
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
           count(*) as orders_count, sum(units) as units,
           sum(revenue) as revenue, sum(refunded) as refunds,
           sum(vat) as vat, sum(taxes) as taxes,
           sum(product_cost) as product_cost, sum(shipping_cost) as shipping_cost,
           sum(cogs) as cogs,
           count(*) filter (where is_new_customer)          as new_customers,
           count(*) filter (where is_new_customer is false) as repeat_orders
      from public.orders
     where shop_id = p_shop and order_day between p_from and p_to
       and cancelled_at is null
     group by order_day
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
     where shop_id = p_shop and date between p_from and p_to and status = 'lost' group by date
  ),
  traf as (
    select date as day, sessions, visitors, add_to_carts from public.shop_sessions
     where shop_id = p_shop and date between p_from and p_to
  ),
  calc as (
    select j.day,
      coalesce(c.orders_count,0) as orders_count, coalesce(c.units,0)::int as units,
      coalesce(c.revenue,0) as revenue, coalesce(c.refunds,0) as refunds,
      coalesce(c.vat,0) as vat, coalesce(c.taxes,0) as taxes,
      coalesce(c.product_cost,0) as product_cost, coalesce(c.shipping_cost,0) as shipping_cost,
      coalesce(c.cogs,0) as cogs, coalesce(f.fees,0) as transaction_fees,
      coalesce(l.lost,0) as disputes_lost, coalesce(p.total,0) as ad_spend_total,
      coalesce(p.detail,'{}'::jsonb) as ad_spend,
      coalesce(t.sessions,0) as sessions, coalesce(t.visitors,0) as visitors,
      coalesce(t.add_to_carts,0) as add_to_carts,
      coalesce(c.new_customers,0) as new_customers, coalesce(c.repeat_orders,0) as repeat_orders
    from jours j
    left join cmd c on c.day = j.day
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
