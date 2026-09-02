-- 030 : frais de transaction par passerelle de paiement (estimes)
-- Pour les boutiques sans Shopify Payments (EverHaar : PayPal, Airwallex, Klarna),
-- Shopify ne fournit aucun frais. On applique un taux + fixe par passerelle,
-- marque "estime", sans jamais ecraser un frais reel.

alter table public.orders
  add column if not exists gateway text,
  add column if not exists fee_estimated boolean not null default false;
create index if not exists orders_shop_gateway_idx on public.orders (shop_id, gateway);

create table if not exists public.gateway_fees (
  shop_id    uuid not null references public.shops(id) on delete cascade,
  gateway    text not null,
  rate       numeric(6,3) not null default 0,   -- en % (2.9 = 2,9 %)
  fixed      numeric(10,4) not null default 0,  -- en devise de la boutique
  updated_at timestamptz not null default now(),
  primary key (shop_id, gateway)
);
alter table public.gateway_fees enable row level security;
drop policy if exists gateway_fees_acces on public.gateway_fees;
create policy gateway_fees_acces on public.gateway_fees
  for all using (public.can_access_shop(shop_id)) with check (public.can_access_shop(shop_id));

-- Passerelles vues dans les commandes (liste "tiree de tes commandes Shopify").
create or replace view public.shop_gateways with (security_invoker = true) as
  select shop_id, gateway, count(*) as orders_count, max(order_day) as last_order
    from public.orders where gateway is not null
   group by shop_id, gateway;

-- Rattrapage des passerelles sur l'historique, par lots.
create or replace function public.set_order_gateways(p_shop uuid, p_ids text[], p_gateways text[])
returns integer language plpgsql as $$
declare n integer;
begin
  update public.orders o
     set gateway = v.gateway
    from unnest(p_ids, p_gateways) as v(external_id, gateway)
   where o.shop_id = p_shop and o.external_id = v.external_id
     and o.gateway is distinct from v.gateway;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.orders_fill_computed()
returns trigger language plpgsql as $$
declare
  v_tz   text;
  v_mode text;
  v_rate numeric;
  v_net  numeric;
  v_ship record;
  v_gw   record;
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

  -- Frais de transaction ESTIMES par passerelle (PayPal, Airwallex...) quand
  -- Shopify ne fournit pas de frais reels. Jamais par-dessus un frais reel.
  if new.transaction_fee = 0 or new.fee_estimated then
    select rate, fixed into v_gw from public.gateway_fees
     where shop_id = new.shop_id and gateway = new.gateway;
    if found then
      new.transaction_fee := round(greatest(new.revenue - new.refunded, 0) * v_gw.rate / 100 + case when new.revenue > 0 then v_gw.fixed else 0 end, 4);
      new.fee_estimated := true;
    elsif new.fee_estimated then
      new.transaction_fee := 0;
      new.fee_estimated := false;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.apply_order_fees(
  p_shop uuid, p_ids text[], p_fees numeric[], p_cumuler boolean default false
)
returns integer language plpgsql as $$
declare n integer;
begin
  update public.orders o
     set transaction_fee = case when p_cumuler then o.transaction_fee + v.fee else v.fee end,
         fee_estimated = false
    from unnest(p_ids, p_fees) as v(external_id, fee)
   where o.shop_id = p_shop and o.external_id = v.external_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

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
           sum(transaction_fee) filter (where fee_estimated) as fees_est,
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
      coalesce(c.cogs,0) as cogs, coalesce(f.fees,0) + coalesce(c.fees_est,0) as transaction_fees,
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
