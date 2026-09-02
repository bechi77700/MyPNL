-- ============================================================
-- 028 — Toutes les donnees du Dashboard en UN appel
-- Sept requetes paralleles depuis Vercel = sept allers-retours et
-- sept connexions PostgREST : 1 a 3,5 s par changement de periode.
-- ============================================================
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
