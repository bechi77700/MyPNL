"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function boutique(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shops").select("id").eq("slug", slug).maybeSingle();
  if (!data) throw new Error("Boutique introuvable");
  return { supabase, shopId: data.id as string };
}

/** Recalcule les commandes puis le cache. Appele apres tout changement de cout. */
async function recalculer(
  supabase: Awaited<ReturnType<typeof createClient>>, shopId: string,
) {
  await supabase.rpc("recompute_orders_cogs", { p_shop: shopId });
  await supabase.rpc("refresh_daily_facts", {
    p_shop: shopId,
    p_from: "2000-01-01",
    p_to: new Date(Date.now() + 86400_000).toISOString().slice(0, 10),
  });
}

function retour(page: string, slug: string, cle: "ok" | "erreur", msg: string, extra?: Record<string, string>) {
  const p = new URLSearchParams({ [cle]: msg, ...(extra ?? {}) });
  redirect(`/dashboard/${slug}/${page}?${p}`);
}

export async function enregistrerProduits(slug: string, form: FormData): Promise<void> {
  const { supabase, shopId } = await boutique(slug);
  const voir = String(form.get("voir") ?? "");

  const couts: { shop_id: string; sku: string; cost: number }[] = [];
  const drapeaux: { sku: string; exclude: boolean }[] = [];

  for (const [cle, valeur] of form.entries()) {
    if (cle.startsWith("cout__")) {
      const sku = cle.slice(6);
      couts.push({ shop_id: shopId, sku, cost: Number(valeur) || 0 });
    }
    if (cle.startsWith("skus__")) {
      const sku = cle.slice(6);
      drapeaux.push({ sku, exclude: form.get(`nolivraison__${sku}`) === "on" });
    }
  }

  if (couts.length) {
    const { error } = await supabase
      .from("product_costs").upsert(couts, { onConflict: "shop_id,sku" });
    if (error) retour("produits", slug, "erreur", error.message);
  }
  for (const d of drapeaux) {
    await supabase.from("shop_skus")
      .update({ exclude_from_shipping: d.exclude })
      .eq("shop_id", shopId).eq("sku", d.sku);
  }

  await recalculer(supabase, shopId);
  revalidatePath(`/dashboard/${slug}/produits`);
  retour("produits", slug, "ok", `${couts.length} coûts enregistrés.`, voir ? { voir } : undefined);
}

export async function enregistrerShipping(slug: string, form: FormData): Promise<void> {
  const { supabase, shopId } = await boutique(slug);
  const pays = String(form.get("pays") ?? "");
  if (!pays) retour("shipping", slug, "erreur", "Pays manquant.");

  const lignes = [];
  for (const [cle] of form.entries()) {
    if (!cle.startsWith("std__")) continue;
    const sku = cle.slice(5);
    const standard = Number(form.get(`std__${sku}`)) || 0;
    const upsell = Number(form.get(`ups__${sku}`)) || 0;
    if (standard === 0 && upsell === 0) continue;
    lignes.push({ shop_id: shopId, sku, country: pays, standard, upsell, is_estimated: true });
  }

  if (lignes.length) {
    const { error } = await supabase
      .from("shipping_costs").upsert(lignes, { onConflict: "shop_id,sku,country" });
    if (error) retour("shipping", slug, "erreur", error.message, { pays });
  }

  await recalculer(supabase, shopId);
  revalidatePath(`/dashboard/${slug}/shipping`);
  retour("shipping", slug, "ok", `Grille ${pays} enregistrée (${lignes.length} lignes).`, { pays });
}

export async function ajouterCharge(slug: string, form: FormData): Promise<void> {
  const { supabase, shopId } = await boutique(slug);
  const { error } = await supabase.from("costs").insert({
    shop_id: shopId,
    label: String(form.get("label") ?? "").trim() || "Sans nom",
    category: String(form.get("category") ?? "fixed"),
    kind: String(form.get("kind") ?? "monthly"),
    amount: Number(form.get("amount")) || 0,
    effective_from: String(form.get("effective_from") || new Date().toISOString().slice(0, 10)),
  });
  if (error) retour("charges", slug, "erreur", error.message);
  revalidatePath(`/dashboard/${slug}/charges`);
  retour("charges", slug, "ok", "Charge ajoutée.");
}

export async function supprimerCharge(slug: string, id: string): Promise<void> {
  const { supabase } = await boutique(slug);
  const { error } = await supabase.from("costs").delete().eq("id", id);
  if (error) retour("charges", slug, "erreur", error.message);
  revalidatePath(`/dashboard/${slug}/charges`);
  retour("charges", slug, "ok", "Charge supprimée.");
}
