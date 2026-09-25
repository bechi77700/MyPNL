-- ============================================================
-- 037 — Repartition des moyens de paiement
-- La passerelle Shopify (orders.gateway) suffit pour PayPal, Klarna en
-- passerelle tierce, Airwallex... mais pas pour Shopify Payments : carte,
-- Apple Pay, Shop Pay et Klarna y remontent tous sous "shopify_payments".
-- payment_method porte le detail lu sur la transaction (GraphQL), rempli par
-- la synchro pour les seules commandes Shopify Payments.
-- ============================================================

alter table public.orders add column if not exists payment_method text;

-- Les commandes Shopify Payments encore a detailler, les plus recentes d'abord.
create index if not exists orders_moyen_a_detailler_idx
  on public.orders (shop_id, order_date desc)
  where gateway = 'shopify_payments' and payment_method is null;

-- Nom de passerelle Shopify -> cle stable. Meme regle que moyenDepuisPasserelle (sync).
create or replace function public.normalize_gateway(p text)
returns text language sql immutable as $$
  select case
    when p is null or btrim(p) = '' then null
    when lower(p) like '%paypal%' then 'paypal'
    when lower(p) like '%klarna%' then 'klarna'
    when lower(p) like '%afterpay%' or lower(p) like '%clearpay%' then 'afterpay'
    when lower(p) like '%installments%' then 'shop_pay_installments'
    else lower(btrim(p))
  end;
$$;

create or replace function public.set_order_payment_methods(p_shop uuid, p_ids text[], p_methods text[])
returns integer language plpgsql as $$
declare n integer;
begin
  update public.orders o
     set payment_method = v.method
    from unnest(p_ids, p_methods) as v(external_id, method)
   where o.shop_id = p_shop and o.external_id = v.external_id
     and o.payment_method is distinct from v.method;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Memes commandes que le P&L : jour local de la boutique, annulations exclues.
create or replace function public.payment_breakdown(p_shop uuid, p_from date, p_to date)
returns table (method text, orders_count bigint, revenue numeric, refunds numeric)
language sql stable as $$
  select coalesce(o.payment_method, public.normalize_gateway(o.gateway), 'inconnu') as method,
         count(*)                      as orders_count,
         coalesce(sum(o.revenue), 0)   as revenue,
         coalesce(sum(o.refunded), 0)  as refunds
    from public.orders o
   where o.shop_id = p_shop and o.order_day between p_from and p_to
     and o.cancelled_at is null
   group by 1
   order by 2 desc;
$$;

create or replace function public.payment_breakdown_daily(p_shop uuid, p_from date, p_to date)
returns table (day date, method text, orders_count bigint)
language sql stable as $$
  select o.order_day as day,
         coalesce(o.payment_method, public.normalize_gateway(o.gateway), 'inconnu') as method,
         count(*) as orders_count
    from public.orders o
   where o.shop_id = p_shop and o.order_day between p_from and p_to
     and o.cancelled_at is null
   group by 1, 2
   order by 1;
$$;

-- Le Dashboard recoit aussi la repartition, toujours en un seul appel.
create or replace function public.dashboard_data(
  p_shop uuid, p_from date, p_to date, p_prev_from date, p_prev_to date
)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'actuel',    (select to_jsonb(s) from public.pnl_summary(p_shop, p_from, p_to) s),
    'precedent', (select to_jsonb(s) from public.pnl_summary(p_shop, p_prev_from, p_prev_to) s),
    'serie',     (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                    from public.pnl_series(p_shop, p_from, p_to, 'day') x),
    'serie_avant', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                    from public.pnl_series(p_shop, p_prev_from, p_prev_to, 'day') x),
    'horaire',   case when p_from = p_to then
                   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.orders_hourly(p_shop, p_from) x)
                 else null end,
    'horaire_avant', case when p_from = p_to then
                   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.orders_hourly(p_shop, p_prev_from) x)
                 else null end,
    'paiements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                    from public.payment_breakdown(p_shop, p_from, p_to) x),
    'sans_cout', (select count(*) from public.shop_skus k
                   where k.shop_id = p_shop and (k.status is null or k.status = 'active')
                     and not k.exclude_from_shipping
                     and not exists (select 1 from public.product_costs pc
                                      where pc.shop_id = k.shop_id and pc.sku = k.sku and pc.cost > 0)),
    'renouvellements', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                          from public.connecteurs_a_renouveler(p_shop, 10) r),
    'derniere_synchro', (select last_sync_at from public.connectors
                          where shop_id = p_shop and platform = 'shopify')
  );
$$;
