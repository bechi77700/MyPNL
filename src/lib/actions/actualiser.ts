"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncBoutique } from "@/lib/sync/shopify";
import { syncSpendMeta } from "@/lib/sync/meta";

export type ResultatActualisation = {
  ok: boolean;
  message: string;
  commandes?: number;
  jours_pub?: number;
};

/**
 * Bouton « Actualiser » des rapports : rapatrie les ventes ET la depense pub,
 * puis rafraichit le cache. Appelable par n'importe quel utilisateur ayant
 * acces a la boutique — c'est une lecture, pas une modification de reglage.
 */
export async function actualiser(slug: string): Promise<ResultatActualisation> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Session expirée, reconnecte-toi." };

  // Le RLS filtre : une boutique non autorisee ne remonte pas.
  const { data: shop } = await supabase
    .from("shops").select("id").eq("slug", slug).maybeSingle();
  if (!shop) return { ok: false, message: "Boutique introuvable." };

  const erreurs: string[] = [];
  let commandes = 0, jours_pub = 0;

  try {
    const r = await syncBoutique(shop.id);
    commandes = r.commandes;
    erreurs.push(...r.erreurs);
  } catch (e) {
    erreurs.push(`Shopify : ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const m = await syncSpendMeta(createAdminClient(), shop.id, { jours: 14 });
    jours_pub = m.jours;
    erreurs.push(...m.erreurs);
  } catch (e) {
    // Meta non connecte : ce n'est pas un echec de l'actualisation.
    const msg = e instanceof Error ? e.message : String(e);
    if (!/pas connect/i.test(msg)) erreurs.push(`Meta : ${msg}`);
  }

  revalidatePath(`/dashboard/${slug}`, "layout");
  revalidatePath("/overview");

  if (erreurs.length)
    return { ok: false, message: erreurs.join(" · "), commandes, jours_pub };
  return {
    ok: true,
    message: `${commandes} commandes et ${jours_pub} jours de pub mis à jour.`,
    commandes, jours_pub,
  };
}
