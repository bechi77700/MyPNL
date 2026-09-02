-- 031 : recalcul des commandes par periode.
-- PostgREST coupe toute requete a 8 s : sur une grosse boutique (EverHaar,
-- 28 000 commandes) le recalcul complet echouait en silence. On recalcule
-- par tranche de dates, l'appelant boucle mois par mois.
create or replace function public.recompute_orders_cogs(p_shop uuid, p_from date, p_to date)
returns integer language plpgsql as $$
declare n integer;
begin
  update public.orders set updated_at = now()
   where shop_id = p_shop and order_day between p_from and p_to;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Bornes utiles a l'appelant : premiere commande de la boutique.
create or replace function public.shop_first_order_day(p_shop uuid)
returns date language sql stable as $$
  select coalesce(min(order_day), current_date) from public.orders where shop_id = p_shop;
$$;
