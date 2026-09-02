-- ============================================================
-- 029 — Ventilation HORAIRE pour les periodes d'un seul jour
-- Un graphique "par jour" sur une journee n'a aucun sens.
-- ============================================================
create or replace function public.orders_hourly(p_shop uuid, p_day date)
returns table (hour integer, orders_count bigint, revenue numeric)
language sql stable as $$
  with tz as (select timezone from public.shops where id = p_shop),
  h as (select generate_series(0, 23) as hour)
  select h.hour,
         count(o.id) as orders_count,
         coalesce(sum(o.revenue), 0) as revenue
  from h
  left join public.orders o
    on o.shop_id = p_shop and o.order_day = p_day and o.cancelled_at is null
   and extract(hour from (o.order_date at time zone (select timezone from tz)))::int = h.hour
  group by h.hour
  order by h.hour;
$$;

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
