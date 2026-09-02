-- ============================================================
-- 020 — Serie P&L complete : charges reparties par jour
-- Les colonnes du tableau doivent additionner exactement le total.
-- ============================================================

drop function if exists public.pnl_series(uuid, date, date, text);

create or replace function public.pnl_series(
  p_shop uuid, p_from date, p_to date, p_grain text default 'day'
)
returns table (
  bucket date, orders_count bigint, units bigint,
  gross_sales numeric, refunds numeric, net_revenue numeric, taxes numeric,
  revenue_ht numeric, product_cost numeric, shipping_cost numeric, cogs numeric,
  transaction_fees numeric, disputes_lost numeric, ad_spend numeric,
  gross_margin numeric, contribution numeric,
  opex numeric, owner_salary numeric, ebitda numeric,
  sessions bigint, add_to_carts bigint
)
language sql stable as $$
  with j as (
    select * from public.daily_facts
    where shop_id = p_shop and day between p_from and p_to
  ),
  -- Meme regle d'allocation que allocated_costs, mais jour par jour.
  alloc as (
    select j.day,
           sum(case when c.category = 'owner_salary' then v.montant else 0 end) as remuneration,
           sum(case when c.category <> 'owner_salary' then v.montant else 0 end) as charges
    from j
    join public.costs c
      on c.shop_id = p_shop
     and c.effective_from <= j.day
     and (c.effective_to is null or c.effective_to >= j.day)
    cross join lateral (
      select case c.kind
               when 'monthly'         then c.amount / 30.436875
               when 'one_off'         then case when c.effective_from = j.day then c.amount else 0 end
               when 'per_order'       then c.amount * j.orders_count
               when 'per_unit'        then c.amount * j.units
               when 'percent_revenue' then c.amount / 100.0 * j.net_revenue
               else 0
             end as montant
    ) v
    group by j.day
  ),
  fusion as (
    select j.*,
           coalesce(a.charges, 0)      as charges,
           coalesce(a.remuneration, 0) as remuneration
    from j left join alloc a on a.day = j.day
  )
  select
    case when p_grain = 'month' then date_trunc('month', day)::date else day end,
    sum(orders_count)::bigint, sum(units)::bigint,
    sum(revenue), sum(refunds), sum(net_revenue),
    sum(net_revenue) - sum(revenue_ht), sum(revenue_ht),
    sum(product_cost), sum(shipping_cost), sum(cogs),
    sum(transaction_fees), sum(disputes_lost), sum(ad_spend_total),
    sum(gross_margin), sum(contribution),
    sum(charges) + sum(disputes_lost)                                as opex,
    sum(remuneration)                                                as owner_salary,
    sum(contribution) - (sum(charges) + sum(disputes_lost))          as ebitda,
    sum(sessions)::bigint, sum(add_to_carts)::bigint
  from fusion
  group by 1
  order by 1;
$$;
