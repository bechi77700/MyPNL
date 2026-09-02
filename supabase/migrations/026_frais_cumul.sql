-- ============================================================
-- 026 — En incremental, une nouvelle transaction S'AJOUTE aux frais
-- deja connus de la commande (ex. frais de remboursement).
-- ============================================================
drop function if exists public.apply_order_fees(uuid, text[], numeric[]);
create or replace function public.apply_order_fees(
  p_shop uuid, p_ids text[], p_fees numeric[], p_cumuler boolean default false
)
returns integer language plpgsql as $$
declare n integer;
begin
  update public.orders o
     set transaction_fee = case when p_cumuler then o.transaction_fee + v.fee else v.fee end
    from unnest(p_ids, p_fees) as v(external_id, fee)
   where o.shop_id = p_shop and o.external_id = v.external_id;
  get diagnostics n = row_count;
  return n;
end;
$$;
