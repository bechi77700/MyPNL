"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recalculerBoutique } from "@/lib/recalcul";

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
  await recalculerBoutique(supabase, shopId);
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
    if (error) retour("cost-of-goods", slug, "erreur", error.message);
  }
  for (const d of drapeaux) {
    await supabase.from("shop_skus")
      .update({ exclude_from_shipping: d.exclude })
      .eq("shop_id", shopId).eq("sku", d.sku);
  }

  await recalculer(supabase, shopId);
  revalidatePath(`/dashboard/${slug}/cost-of-goods`);
  retour("cost-of-goods", slug, "ok", `${couts.length} coûts enregistrés.`, voir ? { voir } : undefined);
}

export async function enregistrerShipping(slug: string, form: FormData): Promise<void> {
  const { supabase, shopId } = await boutique(slug);
  const pays = String(form.get("pays") ?? "");
  if (!pays) retour("shipping-costs", slug, "erreur", "Pays manquant.");

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
    if (error) retour("shipping-costs", slug, "erreur", error.message, { pays });
  }

  await recalculer(supabase, shopId);
  revalidatePath(`/dashboard/${slug}/shipping-costs`);
  retour("shipping-costs", slug, "ok", `Grille ${pays} enregistrée (${lignes.length} lignes).`, { pays });
}

export async function ajouterCharge(slug: string, form: FormData): Promise<void> {
  const { supabase, shopId } = await boutique(slug);
  const debut = String(form.get("effective_from") || new Date().toISOString().slice(0, 10));
  const fin = String(form.get("effective_to") || "") || null;
  if (fin && fin < debut) retour("custom-costs", slug, "erreur", "La date de fin est avant la date de début.");
  const { error } = await supabase.from("costs").insert({
    shop_id: shopId,
    label: String(form.get("label") ?? "").trim() || "Sans nom",
    category: String(form.get("category") ?? "fixed"),
    kind: String(form.get("kind") ?? "monthly"),
    amount: Number(form.get("amount")) || 0,
    effective_from: debut,
    effective_to: fin,
  });
  if (error) retour("custom-costs", slug, "erreur", error.message);
  revalidatePath(`/dashboard/${slug}/custom-costs`);
  retour("custom-costs", slug, "ok", "Charge ajoutée.");
}

export async function supprimerCharge(slug: string, id: string): Promise<void> {
  const { supabase } = await boutique(slug);
  const { error } = await supabase.from("costs").delete().eq("id", id);
  if (error) retour("custom-costs", slug, "erreur", error.message);
  revalidatePath(`/dashboard/${slug}/custom-costs`);
  retour("custom-costs", slug, "ok", "Charge supprimée.");
}

export async function enregistrerTaxes(slug: string, form: FormData): Promise<void> {
  const { supabase, shopId } = await boutique(slug);
  const mode = String(form.get("mode") ?? "none");

  const { error: e1 } = await supabase
    .from("shops").update({ tax_mode: mode }).eq("id", shopId);
  if (e1) retour("taxes", slug, "erreur", e1.message);

  // Un champ vide efface le taux : aucune taxe pour ce pays.
  const aSupprimer: string[] = [];
  const aEcrire: { shop_id: string; country: string; rate: number }[] = [];
  for (const [cle, valeur] of form.entries()) {
    if (!cle.startsWith("taux__")) continue;
    const pays = cle.slice(6);
    const v = String(valeur).trim().replace(",", ".");
    const n = Number(v);
    if (!v || !Number.isFinite(n) || n <= 0) aSupprimer.push(pays);
    else aEcrire.push({ shop_id: shopId, country: pays, rate: n / 100 });
  }

  if (aSupprimer.length)
    await supabase.from("shop_vat_rates").delete()
      .eq("shop_id", shopId).in("country", aSupprimer);
  if (aEcrire.length) {
    const { error } = await supabase
      .from("shop_vat_rates").upsert(aEcrire, { onConflict: "shop_id,country" });
    if (error) retour("taxes", slug, "erreur", error.message);
  }

  await recalculer(supabase, shopId);
  revalidatePath(`/dashboard/${slug}/taxes`);
  retour("taxes", slug, "ok",
    mode === "none"
      ? "Aucune taxe déduite du chiffre d'affaires."
      : `Taxes enregistrées (${aEcrire.length} pays).`);
}


/** Taux + fixe par passerelle de paiement (frais estimes quand Shopify n'en fournit pas). */
export async function enregistrerFraisPasserelles(slug: string, form: FormData): Promise<void> {
  const { supabase, shopId } = await boutique(slug);
  const lignes: { shop_id: string; gateway: string; rate: number; fixed: number }[] = [];
  const vides: string[] = [];
  for (const [cle, val] of form.entries()) {
    if (!cle.startsWith("taux__")) continue;
    const gateway = cle.slice(6);
    const taux = String(val).replace(",", ".").trim();
    const fixe = String(form.get(`fixe__${gateway}`) ?? "").replace(",", ".").trim();
    if (taux === "" && fixe === "") { vides.push(gateway); continue; }
    const rate = Number(taux) || 0, fixed = Number(fixe) || 0;
    if (rate < 0 || rate > 20 || fixed < 0 || fixed > 10)
      retour("custom-costs", slug, "erreur", `Taux invalide pour ${gateway} (0 à 20 %, fixe 0 à 10).`);
    lignes.push({ shop_id: shopId, gateway, rate, fixed });
  }
  if (vides.length) await supabase.from("gateway_fees").delete().eq("shop_id", shopId).in("gateway", vides);
  if (lignes.length) {
    const { error } = await supabase.from("gateway_fees").upsert(lignes, { onConflict: "shop_id,gateway" });
    if (error) retour("custom-costs", slug, "erreur", error.message);
  }
  await recalculer(supabase, shopId);
  revalidatePath(`/dashboard/${slug}/custom-costs`);
  retour("custom-costs", slug, "ok", `Frais de paiement enregistrés (${lignes.length} passerelles), commandes recalculées.`);
}
