-- ============================================================
-- 014 — Tarif de repli : un pays sans grille utilise celle des US
-- Mieux vaut une estimation transparente qu'un COGS a zero.
-- ============================================================

alter table public.shops
  add column if not exists fallback_country text not null default 'US';

alter table public.orders
  add column if not exists shipping_estimated boolean not null default false;

-- Renvoie le cout ET s'il repose sur le tarif de repli.
create or replace function public.compute_shipping(p_shop uuid, p_items jsonb, p_zone text)
returns table (cost numeric, estimated boolean)
language plpgsql stable as $$
declare
  v_repli   text;
  v_ancre   text;
  v_std     numeric;
  v_total   numeric := 0;
  v_estime  boolean := false;
  r         record;
begin
  cost := 0; estimated := false;
  if p_items is null or p_zone is null or p_zone = '' then
    return next; return;
  end if;

  select coalesce(fallback_country, 'US') into v_repli from public.shops where id = p_shop;

  create temporary table if not exists tarifs_tmp (
    sku text, qty numeric, standard numeric, upsell numeric, repli boolean
  ) on commit drop;
  delete from tarifs_tmp;

  insert into tarifs_tmp
  select l.sku, l.qty,
         coalesce(direct.standard, secours.standard),
         coalesce(direct.upsell,   secours.upsell),
         (direct.sku is null and secours.sku is not null)
  from (
    select it.key as sku, (it.value)::numeric as qty
    from jsonb_each_text(p_items) it
    where (it.value)::numeric > 0
      and not exists (
        select 1 from public.shop_skus k
         where k.shop_id = p_shop and k.sku = it.key and k.exclude_from_shipping
      )
  ) l
  left join public.shipping_costs direct
    on direct.shop_id = p_shop and direct.sku = l.sku and direct.country = p_zone
  left join public.shipping_costs secours
    on secours.shop_id = p_shop and secours.sku = l.sku and secours.country = v_repli;

  -- Ancre : le tarif standard le plus eleve de la commande.
  select sku, standard into v_ancre, v_std
  from tarifs_tmp where standard is not null
  order by standard desc, sku limit 1;

  if v_ancre is null then
    return next; return;
  end if;

  v_total := v_std;
  for r in select * from tarifs_tmp loop
    if r.repli then v_estime := true; end if;
    if r.sku = v_ancre then
      v_total := v_total + coalesce(r.upsell, 0) * (r.qty - 1);
    else
      v_total := v_total + coalesce(r.upsell, 0) * r.qty;
    end if;
  end loop;

  cost := v_total; estimated := v_estime;
  return next;
end;
$$;

-- Compatibilite : l'ancienne fonction devient un simple raccourci.
create or replace function public.compute_shipping_cost(p_shop uuid, p_items jsonb, p_zone text)
returns numeric language sql stable as $$
  select cost from public.compute_shipping(p_shop, p_items, p_zone);
$$;

-- Le trigger memorise desormais si le shipping repose sur une estimation.
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

  if new.shipping_zone is null or new.shipping_zone = '' then
    new.shipping_zone := new.country;
  end if;

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
