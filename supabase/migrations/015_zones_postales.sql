-- ============================================================
-- 015 — Zones tarifaires par code postal + repli en SQL pur
-- ============================================================

-- La version precedente creait une table temporaire dans une fonction stable.
-- Reecriture en SQL pur : plus rapide et sans effet de bord.
create or replace function public.compute_shipping(p_shop uuid, p_items jsonb, p_zone text)
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
           (d.sku is null and s.sku is not null) as repli
    from lignes l
    cross join repli r
    left join public.shipping_costs d
      on d.shop_id = p_shop and d.sku = l.sku and d.country = p_zone
    left join public.shipping_costs s
      on s.shop_id = p_shop and s.sku = l.sku and s.country = r.pays
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

-- Table de correspondance code postal -> zone tarifaire.
create table if not exists public.shipping_zones (
  shop_id  uuid not null references public.shops(id) on delete cascade,
  country  text not null,
  postcode text not null,
  zone     text not null,          -- ex : AU1, AU2…
  primary key (shop_id, country, postcode)
);
alter table public.shipping_zones enable row level security;
grant select, insert, update, delete on public.shipping_zones to authenticated;
drop policy if exists shipping_zones_all on public.shipping_zones;
create policy shipping_zones_all on public.shipping_zones for all to authenticated
  using (public.can_access_shop(shop_id)) with check (public.can_access_shop(shop_id));

alter table public.orders add column if not exists postal_code text;

-- Zone d'une commande : la zone du code postal si connue, sinon le pays.
create or replace function public.resolve_zone(p_shop uuid, p_country text, p_postal text)
returns text language sql stable as $$
  select coalesce(
    (select z.zone from public.shipping_zones z
      where z.shop_id = p_shop
        and z.country = p_country
        and z.postcode = lpad(regexp_replace(coalesce(p_postal, ''), '\D', '', 'g'), 4, '0')),
    p_country);
$$;

create or replace function public.orders_fill_computed()
returns trigger language plpgsql as $$
declare
  v_tz   text;
  v_rate numeric;
  v_net  numeric;
  v_ship record;
begin
  select timezone into v_tz from public.shops where id = new.shop_id;
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

  v_rate := public.vat_rate_for(new.country);
  v_net  := new.revenue - new.refunded;
  new.vat := case when v_rate > 0 then v_net * v_rate / (1 + v_rate) else 0 end;

  new.updated_at := now();
  return new;
end;
$$;
