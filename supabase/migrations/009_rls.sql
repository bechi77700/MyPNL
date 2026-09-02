-- ============================================================
-- 009 — Row Level Security sur TOUTES les tables
-- Sans ca, le dashboard s'affiche vide cote utilisateur connecte.
-- ============================================================

-- 1) RLS active partout, sans exception.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t.tablename);
  end loop;
end $$;

-- 2) Tables rattachees a une boutique : acces filtre par can_access_shop().
--    Un membre limite a une marque ne voit qu'elle, meme en tapant l'URL.
do $$
declare
  t text;
  lecture_seule_admin boolean;
  tables_boutique text[] := array[
    'orders','product_costs','shipping_costs','costs','ad_spend','ad_spend_hourly',
    'ad_insights','shop_sessions','connectors','shop_payouts','shop_fees_daily',
    'shop_disputes','invoices','monthly_targets','shop_subscription_stats','daily_facts'
  ];
  -- Seul l'admin edite les couts et les COGS.
  tables_admin text[] := array['product_costs','shipping_costs','costs'];
begin
  foreach t in array tables_boutique loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_write',  t);

    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (public.can_access_shop(shop_id))
    $f$, t||'_select', t);

    lecture_seule_admin := t = any(tables_admin);
    if lecture_seule_admin then
      execute format($f$
        create policy %I on public.%I for all to authenticated
        using (public.can_access_shop(shop_id) and public.is_admin())
        with check (public.can_access_shop(shop_id) and public.is_admin())
      $f$, t||'_write', t);
    else
      execute format($f$
        create policy %I on public.%I for all to authenticated
        using (public.can_access_shop(shop_id))
        with check (public.can_access_shop(shop_id))
      $f$, t||'_write', t);
    end if;
  end loop;
end $$;

-- 3) Boutiques : visibles si autorisees ; seul l'admin en cree ou en modifie.
drop policy if exists shops_select on public.shops;
drop policy if exists shops_write  on public.shops;
create policy shops_select on public.shops for select to authenticated
  using (public.can_access_shop(id));
create policy shops_write on public.shops for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 4) Profils : chacun voit le sien, l'admin voit et gere tout le monde.
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_self   on public.profiles;
drop policy if exists profiles_admin  on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 5) Lignes de facture : pas de shop_id, on passe par la facture parente.
drop policy if exists invoice_lines_all on public.invoice_lines;
create policy invoice_lines_all on public.invoice_lines for all to authenticated
  using (exists (select 1 from public.invoices i
                  where i.id = invoice_id and public.can_access_shop(i.shop_id)))
  with check (exists (select 1 from public.invoices i
                  where i.id = invoice_id and public.can_access_shop(i.shop_id)));

-- 6) Taux de TVA : table de reference, lisible par tous, modifiable par l'admin.
drop policy if exists vat_rates_select on public.vat_rates;
drop policy if exists vat_rates_write  on public.vat_rates;
create policy vat_rates_select on public.vat_rates for select to authenticated using (true);
create policy vat_rates_write  on public.vat_rates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
