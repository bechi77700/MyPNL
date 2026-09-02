-- ============================================================
-- 016 — Rendre le repli visible : quels marches sont estimes
-- ============================================================

create or replace function public.shipping_fallback_usage(p_shop uuid)
returns table (country text, zone text, orders_count bigint, estimees bigint)
language sql stable as $$
  select country,
         coalesce(shipping_zone, country) as zone,
         count(*) as orders_count,
         count(*) filter (where shipping_estimated) as estimees
  from public.orders
  where shop_id = p_shop and cancelled_at is null and items <> '{}'::jsonb
  group by country, coalesce(shipping_zone, country)
  having count(*) filter (where shipping_estimated) > 0
  order by count(*) filter (where shipping_estimated) desc;
$$;

-- Les zones tarifaires reellement utilisees par les commandes,
-- pour que l'onglet Shipping Costs affiche AU1..AU4 et pas juste AU.
create or replace function public.shop_countries(p_shop uuid)
returns table (country text, orders_count bigint)
language sql stable as $$
  select coalesce(shipping_zone, country) as country, count(*) as orders_count
  from public.orders
  where shop_id = p_shop and country is not null and cancelled_at is null
  group by coalesce(shipping_zone, country)
  order by count(*) desc;
$$;
