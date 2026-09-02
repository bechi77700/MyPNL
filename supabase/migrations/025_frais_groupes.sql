-- ============================================================
-- 025 — Report des frais par commande en UNE requete
-- 2 400 UPDATE unitaires prenaient plus d'une minute : la synchro
-- depassait la limite de 60 s de Vercel et echouait en silence.
-- ============================================================
create or replace function public.apply_order_fees(p_shop uuid, p_ids text[], p_fees numeric[])
returns integer language plpgsql as $$
declare n integer;
begin
  update public.orders o
     set transaction_fee = v.fee
    from unnest(p_ids, p_fees) as v(external_id, fee)
   where o.shop_id = p_shop
     and o.external_id = v.external_id
     and o.transaction_fee is distinct from v.fee;
  get diagnostics n = row_count;
  return n;
end;
$$;
