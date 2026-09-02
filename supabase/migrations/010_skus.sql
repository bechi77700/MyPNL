-- ============================================================
-- 010 — Libelles des SKU et recalcul des nouveaux clients
-- ============================================================

-- Les SKU de la boutique sont des identifiants numeriques.
-- On garde leur libelle pour que la grille de couts reste lisible.
create table if not exists public.shop_skus (
  shop_id       uuid not null references public.shops(id) on delete cascade,
  sku           text not null,
  title         text,
  variant_title text,
  product_id    text,
  last_seen_at  timestamptz not null default now(),
  primary key (shop_id, sku)
);

alter table public.shop_skus enable row level security;
grant select, insert, update, delete on public.shop_skus to authenticated;
drop policy if exists shop_skus_all on public.shop_skus;
create policy shop_skus_all on public.shop_skus for all to authenticated
  using (public.can_access_shop(shop_id))
  with check (public.can_access_shop(shop_id));

-- Shopify ne donne pas le rang de la commande dans l'historique du client.
-- On le deduit : la plus ancienne commande d'un client = nouveau client.
create or replace function public.recompute_new_customers(p_shop uuid)
returns integer language plpgsql as $$
declare n integer;
begin
  with rangs as (
    select id,
           row_number() over (
             partition by customer_external_id order by order_date, external_id
           ) = 1 as premiere
    from public.orders
    where shop_id = p_shop and customer_external_id is not null
  )
  update public.orders o
     set is_new_customer = r.premiere
    from rangs r
   where o.id = r.id and o.is_new_customer is distinct from r.premiere;
  get diagnostics n = row_count;
  return n;
end;
$$;
