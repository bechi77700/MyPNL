-- ============================================================
-- 006 — Factures fournisseur (le verificateur de COGS)
-- ============================================================

create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  invoice_ref   text not null,
  invoice_date  date,
  supplier      text,
  status        text not null default 'pending' check (status in ('pending','applied')),
  total_billed  numeric(14,4) not null default 0,   -- ce que le fournisseur facture
  expected_cost numeric(14,4) not null default 0,   -- ce que notre grille prevoyait
  ecart         numeric(14,4) not null default 0,   -- billed - expected
  file_name     text,
  applied_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (shop_id, invoice_ref)
);

create table if not exists public.invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  order_external_id text,
  sku               text,
  qty               integer not null default 0,
  country           text,
  billed_cost       numeric(14,4) not null default 0,
  expected_cost     numeric(14,4) not null default 0,
  ecart             numeric(14,4) not null default 0,
  verdict           text  -- overbilled, underbilled, ok, unmatched
);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines (invoice_id);
create index if not exists invoice_lines_order_idx   on public.invoice_lines (order_external_id);
