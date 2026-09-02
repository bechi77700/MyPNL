-- ============================================================
-- 011 — SKU qui ne s'expedient pas (guides PDF, ebooks…)
-- Ils ne doivent compter ni dans le tarif standard ni dans l'upsell.
-- ============================================================

alter table public.shop_skus
  add column if not exists exclude_from_shipping boolean not null default false;

create or replace function public.compute_shipping_cost(p_shop uuid, p_items jsonb, p_zone text)
returns numeric language plpgsql stable as $$
declare
  v_anchor_sku      text;
  v_anchor_standard numeric;
  v_total           numeric := 0;
  r                 record;
begin
  if p_items is null or p_zone is null or p_zone = '' then
    return 0;
  end if;

  -- SKU ancre : tarif standard le plus eleve, hors produits non expedies.
  select sc.sku, sc.standard
    into v_anchor_sku, v_anchor_standard
  from jsonb_each_text(p_items) it
  join public.shipping_costs sc
    on sc.shop_id = p_shop and sc.sku = it.key and sc.country = p_zone
  where (it.value)::numeric > 0
    and not exists (
      select 1 from public.shop_skus k
       where k.shop_id = p_shop and k.sku = it.key and k.exclude_from_shipping
    )
  order by sc.standard desc, sc.sku
  limit 1;

  if v_anchor_sku is null then
    return 0;
  end if;

  v_total := v_anchor_standard;

  for r in
    select it.key as sku,
           (it.value)::numeric as qty,
           coalesce(sc.upsell, 0) as upsell
    from jsonb_each_text(p_items) it
    left join public.shipping_costs sc
      on sc.shop_id = p_shop and sc.sku = it.key and sc.country = p_zone
    where (it.value)::numeric > 0
      and not exists (
        select 1 from public.shop_skus k
         where k.shop_id = p_shop and k.sku = it.key and k.exclude_from_shipping
      )
  loop
    if r.sku = v_anchor_sku then
      v_total := v_total + r.upsell * (r.qty - 1);
    else
      v_total := v_total + r.upsell * r.qty;
    end if;
  end loop;

  return v_total;
end;
$$;
