-- ============================================================
-- 001 — Boutiques, utilisateurs, controle d'acces
-- ============================================================

create extension if not exists pgcrypto;

-- Les boutiques. Une ligne par boutique Shopify connectee.
create table if not exists public.shops (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  domain       text unique,                 -- ex : looma.myshopify.com
  currency     text not null default 'USD', -- devise de reporting DE CETTE boutique
  timezone     text not null default 'UTC', -- iana_timezone recupere de Shopify
  cogs_mode    text not null default 'stock'
               check (cogs_mode in ('stock','agent')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Les utilisateurs du dashboard, adosses a Supabase Auth.
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  role          text not null default 'member' check (role in ('admin','member')),
  allowed_shops uuid[] not null default '{}',  -- vide + role admin = acces a tout
  created_at    timestamptz not null default now()
);

-- Creation automatique du profil a l'inscription.
-- Le tout premier compte cree devient administrateur.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  select count(*) = 0 into is_first from public.profiles;
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when is_first then 'admin' else 'member' end)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers d'autorisation, utilises par toutes les policies RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_access_shop(p_shop uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.role = 'admin' or p_shop = any(p.allowed_shops)
    from public.profiles p where p.id = auth.uid()
  ), false);
$$;
