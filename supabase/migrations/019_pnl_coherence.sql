-- ============================================================
-- 019 — La TVA affichee est exactement celle deduite
-- Sinon la cascade CA → EBITDA ne tombe pas juste.
-- ============================================================

create or replace function public.pnl_summary(p_shop uuid, p_from date, p_to date)
returns table (
  orders_count bigint, units bigint, new_customers bigint, repeat_orders bigint,
  gross_sales numeric, refunds numeric, net_revenue numeric,
  taxes numeric, revenue_ht numeric,
  product_cost numeric, shipping_cost numeric, cogs numeric,
  transaction_fees numeric, disputes_lost numeric, cos numeric,
  gross_margin numeric, ad_spend numeric, contribution numeric,
  opex numeric, owner_salary numeric, ebitda numeric, net_after_owner numeric,
  sessions bigint, add_to_carts bigint, ad_spend_detail jsonb, opex_detail jsonb
)
language sql stable as $$
  with f as (
    select
      coalesce(sum(orders_count), 0)::bigint  as orders_count,
      coalesce(sum(units), 0)::bigint         as units,
      coalesce(sum(new_customers), 0)::bigint as new_customers,
      coalesce(sum(repeat_orders), 0)::bigint as repeat_orders,
      coalesce(sum(revenue), 0)               as gross_sales,
      coalesce(sum(refunds), 0)               as refunds,
      coalesce(sum(net_revenue), 0)           as net_revenue,
      coalesce(sum(revenue_ht), 0)            as revenue_ht,
      coalesce(sum(product_cost), 0)          as product_cost,
      coalesce(sum(shipping_cost), 0)         as shipping_cost,
      coalesce(sum(cogs), 0)                  as cogs,
      coalesce(sum(transaction_fees), 0)      as transaction_fees,
      coalesce(sum(disputes_lost), 0)         as disputes_lost,
      coalesce(sum(ad_spend_total), 0)        as ad_spend,
      coalesce(sum(sessions), 0)::bigint      as sessions,
      coalesce(sum(add_to_carts), 0)::bigint  as add_to_carts
    from public.daily_facts
    where shop_id = p_shop and day between p_from and p_to
  ),
  pub as (
    select coalesce(jsonb_object_agg(platform, montant), '{}'::jsonb) as detail
    from (
      select platform, sum(amount) as montant
      from public.ad_spend
      where shop_id = p_shop and date between p_from and p_to
      group by platform
    ) x
  ),
  ch as (select * from public.allocated_costs(p_shop, p_from, p_to)),
  agg as (
    select
      coalesce(sum(amount) filter (where category = 'owner_salary'), 0) as remuneration,
      coalesce(sum(amount) filter (where category <> 'owner_salary'), 0) as charges,
      coalesce(jsonb_object_agg(category, round(amount, 2)), '{}'::jsonb) as detail
    from ch
  )
  select
    f.orders_count, f.units, f.new_customers, f.repeat_orders,
    f.gross_sales, f.refunds, f.net_revenue,
    -- Deduite par difference : ce qui est affiche est ce qui est retire.
    f.net_revenue - f.revenue_ht                                  as taxes,
    f.revenue_ht,
    f.product_cost, f.shipping_cost, f.cogs,
    f.transaction_fees, f.disputes_lost,
    f.cogs + f.transaction_fees                                   as cos,
    f.revenue_ht - (f.cogs + f.transaction_fees)                  as gross_margin,
    f.ad_spend,
    f.revenue_ht - (f.cogs + f.transaction_fees) - f.ad_spend     as contribution,
    agg.charges + f.disputes_lost                                 as opex,
    agg.remuneration                                              as owner_salary,
    f.revenue_ht - (f.cogs + f.transaction_fees) - f.ad_spend
      - (agg.charges + f.disputes_lost)                           as ebitda,
    f.revenue_ht - (f.cogs + f.transaction_fees) - f.ad_spend
      - (agg.charges + f.disputes_lost) - agg.remuneration        as net_after_owner,
    f.sessions, f.add_to_carts, pub.detail, agg.detail
  from f, pub, agg;
$$;

create or replace function public.pnl_series(
  p_shop uuid, p_from date, p_to date, p_grain text default 'day'
)
returns table (
  bucket date, orders_count bigint, units bigint,
  gross_sales numeric, refunds numeric, net_revenue numeric, taxes numeric,
  revenue_ht numeric, product_cost numeric, shipping_cost numeric, cogs numeric,
  transaction_fees numeric, disputes_lost numeric, ad_spend numeric,
  gross_margin numeric, contribution numeric,
  sessions bigint, add_to_carts bigint
)
language sql stable as $$
  select
    case when p_grain = 'month' then date_trunc('month', day)::date else day end,
    sum(orders_count)::bigint, sum(units)::bigint,
    sum(revenue), sum(refunds), sum(net_revenue),
    sum(net_revenue) - sum(revenue_ht), sum(revenue_ht),
    sum(product_cost), sum(shipping_cost), sum(cogs),
    sum(transaction_fees), sum(disputes_lost), sum(ad_spend_total),
    sum(gross_margin), sum(contribution),
    sum(sessions)::bigint, sum(add_to_carts)::bigint
  from public.daily_facts
  where shop_id = p_shop and day between p_from and p_to
  group by 1
  order by 1;
$$;
