-- ============================================================
-- 017 — Comptes publicitaires rattaches a une boutique
-- Une boutique peut avoir plusieurs comptes Meta / Google.
-- ============================================================

create table if not exists public.ad_accounts (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  platform     text not null,              -- meta, google
  external_id  text not null,              -- id du compte publicitaire
  name         text,
  currency     text,
  enabled      boolean not null default true,
  last_sync_at timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  unique (shop_id, platform, external_id)
);

alter table public.ad_accounts enable row level security;
grant select, insert, update, delete on public.ad_accounts to authenticated;
drop policy if exists ad_accounts_select on public.ad_accounts;
drop policy if exists ad_accounts_write  on public.ad_accounts;
create policy ad_accounts_select on public.ad_accounts for select to authenticated
  using (public.can_access_shop(shop_id));
create policy ad_accounts_write on public.ad_accounts for all to authenticated
  using (public.can_access_shop(shop_id) and public.is_admin())
  with check (public.can_access_shop(shop_id) and public.is_admin());

-- D'ou vient une depense : synchro automatique ou saisie manuelle.
alter table public.ad_spend
  add column if not exists source text not null default 'api'
    check (source in ('api', 'manual'));

-- Etat des connecteurs, pour l'onglet Integrations.
create or replace function public.integrations_status(p_shop uuid)
returns table (
  platform text, status text, last_sync_at timestamptz, last_error text,
  comptes bigint, depense_30j numeric
)
language sql stable as $$
  select c.platform, c.status, c.last_sync_at, c.last_error,
         (select count(*) from public.ad_accounts a
           where a.shop_id = p_shop and a.platform = c.platform and a.enabled),
         (select coalesce(sum(s.amount), 0) from public.ad_spend s
           where s.shop_id = p_shop and s.platform = c.platform
             and s.date >= current_date - 30)
  from public.connectors c
  where c.shop_id = p_shop
  order by c.platform;
$$;
