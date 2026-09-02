-- ============================================================
-- 007 — Prevision, objectifs, abonnements (MRR)
-- ============================================================

create table if not exists public.monthly_targets (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references public.shops(id) on delete cascade,
  month          date not null,                 -- 1er du mois
  target_revenue numeric(14,4) not null default 0,
  note           text,
  unique (shop_id, month)
);

-- Prevu pour un futur abonnement : aucune donnee aujourd'hui.
create table if not exists public.shop_subscription_stats (
  shop_id      uuid not null references public.shops(id) on delete cascade,
  date         date not null,
  mrr          numeric(14,4) not null default 0,
  active_subs  integer not null default 0,
  new_subs     integer not null default 0,
  churned_subs integer not null default 0,
  primary key (shop_id, date)
);
