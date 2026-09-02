-- ============================================================
-- 023 — Date d'expiration des jetons, consultable
-- Un jeton Meta expire au bout de 60 jours : sans alerte, la depense
-- publicitaire s'arreterait de remonter sans que personne ne le voie.
-- ============================================================

alter table public.connectors
  add column if not exists expires_at timestamptz;

drop function if exists public.integrations_status(uuid);

create or replace function public.integrations_status(p_shop uuid)
returns table (
  platform text, status text, last_sync_at timestamptz, last_error text,
  expires_at timestamptz, jours_restants integer,
  comptes bigint, depense_30j numeric
)
language sql stable as $$
  select c.platform, c.status, c.last_sync_at, c.last_error,
         c.expires_at,
         case when c.expires_at is null then null
              else floor(extract(epoch from (c.expires_at - now())) / 86400)::int end,
         (select count(*) from public.ad_accounts a
           where a.shop_id = p_shop and a.platform = c.platform and a.enabled),
         (select coalesce(sum(s.amount), 0) from public.ad_spend s
           where s.shop_id = p_shop and s.platform = c.platform
             and s.date >= current_date - 30)
  from public.connectors c
  where c.shop_id = p_shop
  order by c.platform;
$$;

-- Connecteurs a renouveler : utilise par le bandeau d'alerte du Dashboard.
create or replace function public.connecteurs_a_renouveler(p_shop uuid, p_seuil_jours integer default 10)
returns table (platform text, expires_at timestamptz, jours_restants integer, expire boolean)
language sql stable as $$
  select platform, expires_at,
         floor(extract(epoch from (expires_at - now())) / 86400)::int,
         expires_at <= now()
  from public.connectors
  where shop_id = p_shop
    and expires_at is not null
    and expires_at <= now() + (p_seuil_jours || ' days')::interval
  order by expires_at;
$$;
