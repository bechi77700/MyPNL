-- ============================================================
-- 013 — Statut, prix et visuel des SKU (venant de Shopify)
-- Permet de masquer les brouillons et les produits archives.
-- ============================================================

alter table public.shop_skus
  add column if not exists status     text,     -- active | draft | archived
  add column if not exists price      numeric(12,4),
  add column if not exists image_url  text,
  add column if not exists product_title text;

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
  left join public.product_costs pc
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
