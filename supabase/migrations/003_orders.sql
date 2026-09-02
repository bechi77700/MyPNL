-- ============================================================
-- 003 — Commandes et calcul du COGS
-- ============================================================

-- Nombre total d'articles d'une commande.
create or replace function public.compute_units(p_items jsonb)
returns integer language sql immutable as $$
  select coalesce(sum((value)::numeric), 0)::int
  from jsonb_each_text(coalesce(p_items, '{}'::jsonb));
$$;

-- Cout produit : somme des (quantite x cout du SKU). Ne depend pas du pays.
create or replace function public.compute_product_cost(p_shop uuid, p_items jsonb)
returns numeric language sql stable as $$
  select coalesce(sum((it.value)::numeric * coalesce(pc.cost, 0)), 0)
  from jsonb_each_text(coalesce(p_items, '{}'::jsonb)) it
  left join public.product_costs pc
    on pc.shop_id = p_shop and pc.sku = it.key;
$$;

-- Cout shipping.
-- Regle : on paie UNE SEULE FOIS le tarif standard, celui du SKU dont le standard
-- est le plus eleve dans la commande. Toutes les autres unites — y compris les
-- autres unites de ce meme SKU — passent au tarif upsell de LEUR propre SKU.
-- Exemple (creme 7/2, savon 5/1,80) : 2 savons + 1 creme = 7 + 1,80 + 1,80 = 10,60.
create or replace function public.compute_shipping_cost(p_shop uuid, p_items jsonb, p_zone text)
returns numeric language plpgsql stable as $$
declare
  v_anchor_sku      text;
  v_anchor_standard numeric;
  v_total           numeric := 0;
  r                 record;
begin
  if p_items is null or p_zone is null or p_zone = '' then
    return 0;
  end if;

  select sc.sku, sc.standard
    into v_anchor_sku, v_anchor_standard
  from jsonb_each_text(p_items) it
  join public.shipping_costs sc
    on sc.shop_id = p_shop and sc.sku = it.key and sc.country = p_zone
  where (it.value)::numeric > 0
  order by sc.standard desc, sc.sku
  limit 1;

  -- Aucun SKU de la commande n'a de tarif pour ce pays : on ne devine pas.
  if v_anchor_sku is null then
    return 0;
  end if;

  v_total := v_anchor_standard;

  for r in
    select it.key as sku,
           (it.value)::numeric as qty,
           coalesce(sc.upsell, 0) as upsell
    from jsonb_each_text(p_items) it
    left join public.shipping_costs sc
      on sc.shop_id = p_shop and sc.sku = it.key and sc.country = p_zone
    where (it.value)::numeric > 0
  loop
    if r.sku = v_anchor_sku then
      v_total := v_total + r.upsell * (r.qty - 1);   -- la 1re unite est deja au standard
    else
      v_total := v_total + r.upsell * r.qty;
    end if;
  end loop;

  return v_total;
end;
$$;

create table if not exists public.orders (
  id                   uuid primary key default gen_random_uuid(),
  shop_id              uuid not null references public.shops(id) on delete cascade,
  external_id          text not null,              -- id Shopify
  order_number         text,
  order_date           timestamptz not null,
  order_day            date,                       -- jour dans le fuseau de la boutique
  country              text,                       -- pays de livraison (ISO)
  shipping_zone        text,                       -- zone tarifaire, = country par defaut
  items                jsonb not null default '{}'::jsonb,  -- { "SKU": quantite }
  units                integer not null default 0,
  revenue              numeric(14,4) not null default 0,  -- TTC, en devise de reporting
  refunded             numeric(14,4) not null default 0,
  taxes                numeric(14,4) not null default 0,  -- taxes declarees par Shopify
  vat                  numeric(14,4) not null default 0,  -- TVA calculee via vat_rates
  shipping_charged     numeric(14,4) not null default 0,  -- port paye par le client
  currency             text,
  product_cost         numeric(14,4) not null default 0,
  shipping_cost        numeric(14,4) not null default 0,
  cogs                 numeric(14,4) not null default 0,
  cogs_source          text not null default 'estimated'
                       check (cogs_source in ('estimated','invoice')),
  customer_external_id text,
  is_new_customer      boolean,
  financial_status     text,
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (shop_id, external_id)
);

create index if not exists orders_shop_day_idx  on public.orders (shop_id, order_day);
create index if not exists orders_shop_date_idx on public.orders (shop_id, order_date);
create index if not exists orders_customer_idx  on public.orders (shop_id, customer_external_id);

-- Precalcul a l'ecriture : on ne recalcule jamais a l'affichage.
create or replace function public.orders_fill_computed()
returns trigger language plpgsql as $$
declare
  v_tz   text;
  v_rate numeric;
  v_net  numeric;
begin
  select timezone into v_tz from public.shops where id = new.shop_id;
  new.order_day := (new.order_date at time zone coalesce(v_tz, 'UTC'))::date;

  if new.shipping_zone is null or new.shipping_zone = '' then
    new.shipping_zone := new.country;
  end if;

  new.units         := public.compute_units(new.items);
  new.product_cost  := public.compute_product_cost(new.shop_id, new.items);
  new.shipping_cost := public.compute_shipping_cost(new.shop_id, new.items, new.shipping_zone);

  -- Une facture fournisseur validee prime toujours sur l'estimation.
  if new.cogs_source <> 'invoice' then
    new.cogs := new.product_cost + new.shipping_cost;
  end if;

  -- TVA sur prix TTC : net x taux / (1 + taux). US et pays non liste = 0.
  v_rate := public.vat_rate_for(new.country);
  v_net  := new.revenue - new.refunded;
  new.vat := case when v_rate > 0 then v_net * v_rate / (1 + v_rate) else 0 end;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_fill_computed on public.orders;
create trigger orders_fill_computed
  before insert or update on public.orders
  for each row execute function public.orders_fill_computed();

-- Recalcule les commandes d'une boutique (apres modification de la grille de couts).
create or replace function public.recompute_orders_cogs(p_shop uuid)
returns integer language plpgsql as $$
declare n integer;
begin
  update public.orders set updated_at = now() where shop_id = p_shop;
  get diagnostics n = row_count;
  return n;
end;
$$;
