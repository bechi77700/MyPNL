-- ============================================================
-- 012 — Vues utilisees par l'onglet Couts
-- ============================================================

-- Un SKU, son libelle, son cout produit et son poids reel dans les ventes.
create or replace function public.sku_overview(p_shop uuid)
returns table (
  sku text, title text, variant_title text,
  exclude_from_shipping boolean, cost numeric,
  orders_count bigint, units bigint
)
language sql stable as $$
  select k.sku, k.title, k.variant_title, k.exclude_from_shipping,
         coalesce(pc.cost, 0) as cost,
         count(o.id) as orders_count,
         coalesce(sum((o.items->>k.sku)::numeric), 0)::bigint as units
  from public.shop_skus k
  left join public.product_costs pc
    on pc.shop_id = k.shop_id and pc.sku = k.sku
  left join public.orders o
    on o.shop_id = k.shop_id and o.items ? k.sku
  where k.shop_id = p_shop
  group by k.sku, k.title, k.variant_title, k.exclude_from_shipping, pc.cost
  order by count(o.id) desc, k.title;
$$;

-- Les pays reellement livres, du plus frequent au moins frequent.
create or replace function public.shop_countries(p_shop uuid)
returns table (country text, orders_count bigint)
language sql stable as $$
  select country, count(*) as orders_count
  from public.orders
  where shop_id = p_shop and country is not null
  group by country
  order by count(*) desc;
$$;

-- Combien de commandes ont un COGS incomplet (SKU sans tarif pour leur pays).
create or replace function public.cogs_coverage(p_shop uuid)
returns table (
  total bigint, avec_cout_produit bigint, avec_shipping bigint, sans_sku bigint
)
language sql stable as $$
  select count(*) as total,
         count(*) filter (where product_cost > 0)  as avec_cout_produit,
         count(*) filter (where shipping_cost > 0) as avec_shipping,
         count(*) filter (where items = '{}'::jsonb) as sans_sku
  from public.orders
  where shop_id = p_shop and cancelled_at is null;
$$;
