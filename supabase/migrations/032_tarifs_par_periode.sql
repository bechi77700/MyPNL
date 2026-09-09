-- 032 : tarifs par periode (cout produit et port).
-- Chaque tarif porte une date d'effet ; une commande prend le tarif en vigueur
-- a sa date. Les lignes existantes deviennent le palier "depuis toujours".

alter table public.product_costs
  add column if not exists effective_from date not null default '2000-01-01';
alter table public.product_costs drop constraint if exists product_costs_shop_id_sku_key;
alter table public.product_costs drop constraint if exists product_costs_shop_sku_from_key;
alter table public.product_costs add constraint product_costs_shop_sku_from_key unique (shop_id, sku, effective_from);

alter table public.shipping_costs
  add column if not exists effective_from date not null default '2000-01-01';
alter table public.shipping_costs drop constraint if exists shipping_costs_shop_id_sku_country_key;
alter table public.shipping_costs drop constraint if exists shipping_costs_shop_sku_country_from_key;
alter table public.shipping_costs add constraint shipping_costs_shop_sku_country_from_key unique (shop_id, sku, country, effective_from);
create index if not exists shipping_costs_lookup_idx on public.shipping_costs (shop_id, sku, country, effective_from desc);
create index if not exists product_costs_lookup_idx on public.product_costs (shop_id, sku, effective_from desc);

-- Tarif en vigueur aujourd'hui (ce que montrent les ecrans).
create or replace view public.product_costs_current with (security_invoker = true) as
  select distinct on (shop_id, sku) *
    from public.product_costs
   where effective_from <= current_date
   order by shop_id, sku, effective_from desc;

create or replace view public.shipping_costs_current with (security_invoker = true) as
  select distinct on (shop_id, sku, country) *
    from public.shipping_costs
   where effective_from <= current_date
   order by shop_id, sku, country, effective_from desc;

-- Cout produit a une date donnee.
drop function if exists public.compute_product_cost(uuid, jsonb);
create or replace function public.compute_product_cost(p_shop uuid, p_items jsonb, p_day date default current_date)
returns numeric language sql stable as $$
  select coalesce(sum((it.value)::numeric * coalesce(pc.cost, 0)), 0)
  from jsonb_each_text(coalesce(p_items, '{}'::jsonb)) it
  left join lateral (
    select cost from public.product_costs
     where shop_id = p_shop and sku = it.key and effective_from <= p_day
     order by effective_from desc limit 1
  ) pc on true;
$$;

-- Port a une date donnee : meme regle (standard max une fois, le reste en upsell),
-- chaque SKU prenant sa grille en vigueur ce jour-la, avec repli pays.
drop function if exists public.compute_shipping(uuid, jsonb, text);
create or replace function public.compute_shipping(p_shop uuid, p_items jsonb, p_zone text, p_day date default current_date)
returns table (cost numeric, estimated boolean)
language sql stable as $$
  with repli as (
    select coalesce(fallback_country, 'US') as pays from public.shops where id = p_shop
  ),
  lignes as (
    select it.key as sku, (it.value)::numeric as qty
    from jsonb_each_text(coalesce(p_items, '{}'::jsonb)) it
    where (it.value)::numeric > 0
      and not exists (
        select 1 from public.shop_skus k
         where k.shop_id = p_shop and k.sku = it.key and k.exclude_from_shipping
      )
  ),
  tarifs as (
    select l.sku, l.qty,
           coalesce(d.standard, s.standard) as standard,
           coalesce(d.upsell,   s.upsell)   as upsell,
           (d.standard is null and s.standard is not null) as repli
    from lignes l
    cross join repli r
    left join lateral (
      select standard, upsell from public.shipping_costs
       where shop_id = p_shop and sku = l.sku and country = p_zone and effective_from <= p_day
       order by effective_from desc limit 1
    ) d on true
    left join lateral (
      select standard, upsell from public.shipping_costs
       where shop_id = p_shop and sku = l.sku and country = r.pays and effective_from <= p_day
       order by effective_from desc limit 1
    ) s on true
  ),
  ancre as (
    select sku, standard from tarifs
    where standard is not null
    order by standard desc, sku limit 1
  )
  select
    case when (select sku from ancre) is null then 0 else
      (select standard from ancre)
      + coalesce((
          select sum(coalesce(t.upsell, 0)
                     * (t.qty - case when t.sku = (select sku from ancre) then 1 else 0 end))
          from tarifs t), 0)
    end,
    case when (select sku from ancre) is null then false
         else coalesce((select bool_or(t.repli) from tarifs t), false) end;
$$;

create or replace function public.compute_shipping_cost(p_shop uuid, p_items jsonb, p_zone text)
returns numeric language sql stable as $$
  select cost from public.compute_shipping(p_shop, p_items, p_zone, current_date);
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
  new.product_cost := public.compute_product_cost(new.shop_id, new.items, new.order_day);

  select * into v_ship
    from public.compute_shipping(new.shop_id, new.items, new.shipping_zone, new.order_day);
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

create or replace function public.sku_overview(p_shop uuid, p_actifs_seulement boolean default true)
returns table (
  sku text, title text, variant_title text, product_title text,
  status text, price numeric, image_url text,
  exclude_from_shipping boolean, cost numeric,
  orders_count bigint, units bigint
)
language sql stable as $$
  select k.sku, k.title, k.variant_title, k.product_title,
         k.status, k.price, k.image_url,
         k.exclude_from_shipping,
         coalesce(pc.cost, 0) as cost,
         count(o.id) as orders_count,
         coalesce(sum((o.items->>k.sku)::numeric), 0)::bigint as units
  from public.shop_skus k
  left join public.product_costs_current pc
    on pc.shop_id = k.shop_id and pc.sku = k.sku
  left join public.orders o
    on o.shop_id = k.shop_id and o.items ? k.sku
  where k.shop_id = p_shop
    -- un SKU dont le statut est inconnu reste visible : on ne cache jamais
    -- un produit par accident.
    and (not p_actifs_seulement or k.status is null or k.status = 'active')
  group by k.sku, k.title, k.variant_title, k.product_title, k.status,
           k.price, k.image_url, k.exclude_from_shipping, pc.cost
  order by count(o.id) desc, k.product_title, k.title;
$$;
