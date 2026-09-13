import type { SupabaseClient } from "@supabase/supabase-js";
import { aujourdhui } from "@/lib/periode";

export type Targets = {
  label: string | null; orders: number;
  be: number; cible: number; min: number; moins20: number; coutAtc: number; dispo: number; aov: number;
};

/**
 * Seuils de ROAS du produit principal, sur les 30 derniers jours (formules du
 * calculateur : contribution seulement). null si pas de produit principal
 * ou pas de commande.
 */
export async function calculerTargets(
  supabase: SupabaseClient, shopId: string, timezone: string,
): Promise<Targets | null> {
  const { data: r } = await supabase.from("shop_targets").select("*").eq("shop_id", shopId).maybeSingle();
  const skus = (r?.main_skus as string[] | undefined) ?? [];
  if (!skus.length) return null;
  const auj = aujourdhui(timezone);
  const du = new Date(new Date(auj + "T12:00:00Z").getTime() - 29 * 86400_000).toISOString().slice(0, 10);
  const { data: d } = await supabase.rpc("targets_data", { p_shop: shopId, p_skus: skus, p_from: du, p_to: auj });
  if (!d || !Number(d.orders)) return null;
  const aov = Number(d.aov), cogs = Number(d.cogs), psp = Number(d.psp_rate ?? 0);
  const dispo = aov - cogs - aov * psp;
  if (!(dispo > 0)) return null;
  const mMin = Number(r!.margin_min) / 100, mCible = Number(r!.margin_target) / 100;
  const perte = Number(r!.loss_pct) / 100, atc = Number(r!.atc_pct) / 100;
  return {
    label: (r!.main_label as string | null) ?? null, orders: Number(d.orders), aov, dispo,
    be: aov / dispo, cible: aov / (dispo - mCible * aov), min: aov / (dispo - mMin * aov),
    moins20: aov / (dispo + perte * aov), coutAtc: atc * aov,
  };
}
