-- ============================================================
-- 038 — Chargebacks
-- - Un litige "accepted" (on renonce a contester) est une perte au meme titre
--   que "lost" : il n'etait pas deduit du P&L.
-- - type (chargeback / inquiry), echeance de reponse et date de cloture, pour
--   la page Chargebacks et l'alerte "a contester" du Dashboard.
-- ============================================================

alter table public.shop_disputes
  add column if not exists type text,
  add column if not exists evidence_due_by timestamptz,
  add column if not exists finalized_on date;

create or replace function public.refresh_daily_facts(p_shop uuid, p_from date, p_to date)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from public.daily_facts
   where shop_id = p_shop and day between p_from and p_to;

  with jours as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  cmd as (
    select order_day as day,
           count(*) as orders_count, sum(units) as units,
           sum(revenue) as revenue, sum(refunded) as refunds,
           sum(vat) as vat, sum(taxes) as taxes,
           sum(product_cost) as product_cost, sum(shipping_cost) as shipping_cost,
           sum(cogs) as cogs,
           sum(transaction_fee) filter (where fee_estimated) as fees_est,
           count(*) filter (where is_new_customer)          as new_customers,
           count(*) filter (where is_new_customer is false) as repeat_orders
      from public.orders
     where shop_id = p_shop and order_day between p_from and p_to
       and cancelled_at is null
     group by order_day
  ),
  pub as (
    select date as day, sum(amount) as total, jsonb_object_agg(platform, amount) as detail
      from public.ad_spend
     where shop_id = p_shop and date between p_from and p_to group by date
  ),
  frais as (
    select date as day, fees from public.shop_fees_daily
     where shop_id = p_shop and date between p_from and p_to
  ),
  lit as (
    select date as day, sum(amount) as lost from public.shop_disputes
     where shop_id = p_shop and date between p_from and p_to and status in ('lost', 'accepted') group by date
  ),
  traf as (
    select date as day, sessions, visitors, add_to_carts from public.shop_sessions
     where shop_id = p_shop and date between p_from and p_to
  ),
  calc as (
    select j.day,
      coalesce(c.orders_count,0) as orders_count, coalesce(c.units,0)::int as units,
      coalesce(c.revenue,0) as revenue, coalesce(c.refunds,0) as refunds,
      coalesce(c.vat,0) as vat, coalesce(c.taxes,0) as taxes,
      coalesce(c.product_cost,0) as product_cost, coalesce(c.shipping_cost,0) as shipping_cost,
      coalesce(c.cogs,0) as cogs, coalesce(f.fees,0) + coalesce(c.fees_est,0) as transaction_fees,
      coalesce(l.lost,0) as disputes_lost, coalesce(p.total,0) as ad_spend_total,
      coalesce(p.detail,'{}'::jsonb) as ad_spend,
      coalesce(t.sessions,0) as sessions, coalesce(t.visitors,0) as visitors,
      coalesce(t.add_to_carts,0) as add_to_carts,
      coalesce(c.new_customers,0) as new_customers, coalesce(c.repeat_orders,0) as repeat_orders
    from jours j
    left join cmd c on c.day = j.day
    left join pub p on p.day = j.day
    left join frais f on f.day = j.day
    left join lit l on l.day = j.day
    left join traf t on t.day = j.day
  )
  insert into public.daily_facts (
    shop_id, day, orders_count, units, revenue, refunds, net_revenue, vat, taxes,
    revenue_ht, product_cost, shipping_cost, cogs, transaction_fees, disputes_lost,
    ad_spend_total, ad_spend, sessions, visitors, add_to_carts,
    new_customers, repeat_orders, cos, gross_margin, contribution, updated_at)
  select
    p_shop, day, orders_count, units, revenue, refunds,
    revenue - refunds                                as net_revenue,
    vat, taxes,
    (revenue - refunds) - vat                        as revenue_ht,
    product_cost, shipping_cost, cogs, transaction_fees, disputes_lost,
    ad_spend_total, ad_spend, sessions, visitors, add_to_carts,
    new_customers, repeat_orders,
    cogs + transaction_fees                          as cos,
    ((revenue - refunds) - vat) - (cogs + transaction_fees) as gross_margin,
    (((revenue - refunds) - vat) - (cogs + transaction_fees)) - ad_spend_total as contribution,
    now()
  from calc;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Synthese d'une periode. Le taux se calcule sur les commandes Shopify Payments :
-- ce sont les seules dont on voit les litiges (PayPal, Klarna... n'en remontent pas).
create or replace function public.chargeback_summary(p_shop uuid, p_from date, p_to date)
returns jsonb language sql stable as $$
  with d as (
    select * from public.shop_disputes
     where shop_id = p_shop and date between p_from and p_to
  )
  select jsonb_build_object(
    'ouverts',         (select count(*) from d where coalesce(type, 'chargeback') = 'chargeback'),
    'montant_ouverts', (select coalesce(sum(amount), 0) from d where coalesce(type, 'chargeback') = 'chargeback'),
    'demandes',        (select count(*) from d where type = 'inquiry'),
    'en_cours',        (select count(*) from d where status in ('needs_response', 'under_review')),
    'montant_en_cours',(select coalesce(sum(amount), 0) from d where status in ('needs_response', 'under_review')),
    'gagnes',          (select count(*) from d where status = 'won'),
    'montant_gagnes',  (select coalesce(sum(amount), 0) from d where status = 'won'),
    'perdus',          (select count(*) from d where status in ('lost', 'accepted')),
    'montant_perdus',  (select coalesce(sum(amount), 0) from d where status in ('lost', 'accepted')),
    'commandes_sp',    (select count(*) from public.orders
                         where shop_id = p_shop and order_day between p_from and p_to
                           and gateway = 'shopify_payments' and cancelled_at is null),
    'a_repondre',      (select count(*) from public.shop_disputes
                         where shop_id = p_shop and status = 'needs_response'),
    'prochaine_echeance', (select min(evidence_due_by) from public.shop_disputes
                         where shop_id = p_shop and status = 'needs_response'),
    'shopify_payments', exists (select 1 from public.orders
                         where shop_id = p_shop and gateway = 'shopify_payments')
  );
$$;

create or replace function public.disputes_report(p_shop uuid, p_from date, p_to date)
returns table (
  external_id text, date date, type text, status text, reason text, amount numeric,
  currency text, evidence_due_by timestamptz, finalized_on date,
  order_external_id text, order_number text, order_day date, payment_method text
)
language sql stable as $$
  select d.external_id, d.date, coalesce(d.type, 'chargeback'), d.status, d.reason, d.amount,
         d.currency, d.evidence_due_by, d.finalized_on,
         d.order_external_id, o.order_number, o.order_day,
         coalesce(o.payment_method, public.normalize_gateway(o.gateway))
    from public.shop_disputes d
    left join public.orders o on o.shop_id = d.shop_id and o.external_id = d.order_external_id
   where d.shop_id = p_shop and d.date between p_from and p_to
   order by d.date desc;
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
    'paiements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                    from public.payment_breakdown(p_shop, p_from, p_to) x),
    'litiges',   public.chargeback_summary(p_shop, p_from, p_to),
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

-- Les litiges acceptes passent en perte sur tout l'historique.
select public.refresh_daily_facts(s.id, public.shop_first_order_day(s.id), current_date + 1)
  from public.shops s
 where exists (select 1 from public.shop_disputes d where d.shop_id = s.id and d.status = 'accepted');
