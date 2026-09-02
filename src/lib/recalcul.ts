import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Recalcule COGS, TVA et frais de toutes les commandes d'une boutique, puis
 * le cache quotidien. Par tranche de mois : Supabase coupe a 8 s, et une
 * grosse boutique ne passe pas en une seule requete.
 */
export async function recalculerBoutique(
  supabase: SupabaseClient, shopId: string, opts: { depuis?: string } = {},
) {
  const { data: premier } = await supabase.rpc("shop_first_order_day", { p_shop: shopId });
  const debut = new Date(opts.depuis ?? (premier as string) ?? new Date().toISOString().slice(0, 10));
  const fin = new Date(Date.now() + 86400_000);
  let commandes = 0;
  for (let d = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth(), 1)); d <= fin; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const de = d.toISOString().slice(0, 10);
    const a = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc("recompute_orders_cogs", { p_shop: shopId, p_from: de, p_to: a });
    if (error) throw new Error(`recalcul ${de} → ${a} : ${error.message}`);
    commandes += Number(data ?? 0);
  }
  const { data: jours, error } = await supabase.rpc("refresh_daily_facts", {
    p_shop: shopId, p_from: debut.toISOString().slice(0, 10), p_to: fin.toISOString().slice(0, 10),
  });
  if (error) throw new Error(`cache : ${error.message}`);
  return { commandes, jours: Number(jours ?? 0) };
}
