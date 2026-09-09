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

  // Date d'effet : vide = on corrige le palier en vigueur ; remplie = nouveau
  // palier a cette date, le passe garde l'ancien tarif.
  const aPartirDu: string | null = null; // le tableau corrige le tarif en vigueur ; les paliers dates passent par ajouterPalierProduit
  const { data: enVigueur } = await supabase
    .from("product_costs_current").select("sku, cost, effective_from").eq("shop_id", shopId);
  const courant = new Map((enVigueur ?? []).map((c) => [c.sku as string, { cost: Number(c.cost), from: c.effective_from as string }]));
  const lignes = couts
    .filter((c) => !aPartirDu || (courant.get(c.sku)?.cost ?? 0) !== c.cost) // nouveau palier seulement si ca change
    .map((c) => ({ ...c, effective_from: aPartirDu ?? courant.get(c.sku)?.from ?? "2000-01-01", source: "manual" }));
  if (lignes.length) {
    const { error } = await supabase
      .from("product_costs").upsert(lignes, { onConflict: "shop_id,sku,effective_from" });
    if (error) retour("cost-of-goods", slug, "erreur", error.message);
  }
  for (const d of drapeaux) {
    await supabase.from("shop_skus")
      .update({ exclude_from_shipping: d.exclude })
      .eq("shop_id", shopId).eq("sku", d.sku);
  }

  await recalculer(supabase, shopId);
  revalidatePath(`/dashboard/${slug}/cost-of-goods`);
  retour("cost-of-goods", slug, "ok", aPartirDu
    ? `${lignes.length} nouveau${lignes.length > 1 ? "x" : ""} palier${lignes.length > 1 ? "s" : ""} à partir du ${aPartirDu}.`
    : `${lignes.length} coûts enregistrés.`, voir ? { voir } : undefined);
}

export async function enregistrerShipping(slug: string, form: FormData): Promise<void> {
  const { supabase, shopId } = await boutique(slug);
  const pays = String(form.get("pays") ?? "");
  if (!pays) retour("shipping-costs", slug, "erreur", "Pays manquant.");

  const aPartirDu: string | null = null; // idem : les paliers dates passent par ajouterPalierShipping
  const { data: enVigueur } = await supabase
    .from("shipping_costs_current").select("sku, standard, upsell, effective_from")
    .eq("shop_id", shopId).eq("country", pays);
  const courant = new Map((enVigueur ?? []).map((c) => [c.sku as string, { standard: Number(c.standard), upsell: Number(c.upsell), from: c.effective_from as string }]));

  const lignes = [];
  for (const [cle] of form.entries()) {
    if (!cle.startsWith("std__")) continue;
    const id = cle.slice(5);
    const standard = Number(form.get(`std__${id}`)) || 0;
    const upsell = Number(form.get(`ups__${id}`)) || 0;
    if (standard === 0 && upsell === 0) continue;
    // Ligne "produit" : un tarif pour toutes ses variantes. Sinon, un SKU seul.
    const skus = id.startsWith("grp__")
      ? String(form.get(`skus__${id}`) ?? "").split(",").filter(Boolean)
      : [id];
    for (const sku of skus) {
      const c = courant.get(sku);
      if (aPartirDu && c && c.standard === standard && c.upsell === upsell) continue; // inchange : pas de palier
      lignes.push({
        shop_id: shopId, sku, country: pays, standard, upsell, is_estimated: true,
        effective_from: aPartirDu ?? c?.from ?? "2000-01-01",
      });
    }
  }

  if (lignes.length) {
    const { error } = await supabase
      .from("shipping_costs").upsert(lignes, { onConflict: "shop_id,sku,country,effective_from" });
    if (error) retour("shipping-costs", slug, "erreur", error.message, { pays });
  }

  await recalculer(supabase, shopId);
  revalidatePath(`/dashboard/${slug}/shipping-costs`);
  retour("shipping-costs", slug, "ok", aPartirDu
    ? `Grille ${pays} : ${lignes.length} nouveau${lignes.length > 1 ? "x" : ""} palier${lignes.length > 1 ? "s" : ""} à partir du ${aPartirDu}.`
    : `Grille ${pays} enregistrée (${lignes.length} lignes).`, { pays });
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


/* ── Changements de prix programmes (paliers dates) ───────────────── */

const dateValide = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Nouveau cout produit a partir d'une date. Le passe garde l'ancien tarif. */
export async function ajouterPalierProduit(slug: string, form: FormData): Promise<void> {
  const { supabase, shopId } = await boutique(slug);
  const sku = String(form.get("sku") ?? "");
  const date = String(form.get("date") ?? "");
  const cost = Number(String(form.get("cost") ?? "").replace(",", "."));
  if (!sku) retour("cost-of-goods", slug, "erreur", "Choisis un produit.");
  if (!dateValide(date) || date <= "2000-01-01") retour("cost-of-goods", slug, "erreur", "Date invalide.");
  if (!Number.isFinite(cost) || cost < 0) retour("cost-of-goods", slug, "erreur", "Coût invalide.");
  const { error } = await supabase.from("product_costs")
    .upsert({ shop_id: shopId, sku, cost, effective_from: date, source: "manual" }, { onConflict: "shop_id,sku,effective_from" });
  if (error) retour("cost-of-goods", slug, "erreur", error.message);
  await recalculer(supabase, shopId);
  revalidatePath(`/dashboard/${slug}/cost-of-goods`);
  retour("cost-of-goods", slug, "ok", `Changement enregistré : nouveau coût à partir du ${date}. Commandes recalculées.`);
}

export async function supprimerPalierProduit(slug: string, sku: string, date: string): Promise<void> {
  const { supabase, shopId } = await boutique(slug);
  if (date <= "2000-01-01") retour("cost-of-goods", slug, "erreur", "Le tarif d'origine ne se supprime pas, modifie-le dans le tableau.");
  const { error } = await supabase.from("product_costs").delete()
    .eq("shop_id", shopId).eq("sku", sku).eq("effective_from", date);
  if (error) retour("cost-of-goods", slug, "erreur", error.message);
  await recalculer(supabase, shopId);
  revalidatePath(`/dashboard/${slug}/cost-of-goods`);
  retour("cost-of-goods", slug, "ok", "Changement supprimé, commandes recalculées.");
}

/** Nouveau port (standard / upsell) pour un produit et un pays, a partir d'une date. */
export async function ajouterPalierShipping(slug: string, form: FormData): Promise<void> {
  const { supabase, shopId } = await boutique(slug);
  const pays = String(form.get("pays") ?? "");
  const skus = String(form.get("skus") ?? "").split(",").filter(Boolean);
  const date = String(form.get("date") ?? "");
  const standard = Number(String(form.get("standard") ?? "").replace(",", "."));
  const upsell = Number(String(form.get("upsell") ?? "").replace(",", "."));
  if (!pays || !skus.length) retour("shipping-costs", slug, "erreur", "Choisis un produit.", { pays });
  if (!dateValide(date) || date <= "2000-01-01") retour("shipping-costs", slug, "erreur", "Date invalide.", { pays });
  if (![standard, upsell].every((v) => Number.isFinite(v) && v >= 0)) retour("shipping-costs", slug, "erreur", "Tarif invalide.", { pays });
  const { error } = await supabase.from("shipping_costs").upsert(
    skus.map((sku) => ({ shop_id: shopId, sku, country: pays, standard, upsell, is_estimated: true, effective_from: date })),
    { onConflict: "shop_id,sku,country,effective_from" });
  if (error) retour("shipping-costs", slug, "erreur", error.message, { pays });
  await recalculer(supabase, shopId);
  revalidatePath(`/dashboard/${slug}/shipping-costs`);
  retour("shipping-costs", slug, "ok", `Changement enregistré : nouveau port ${pays} à partir du ${date}.`, { pays });
}

export async function supprimerPalierShipping(slug: string, skusCsv: string, pays: string, date: string): Promise<void> {
  const { supabase, shopId } = await boutique(slug);
  if (date <= "2000-01-01") retour("shipping-costs", slug, "erreur", "Le tarif d'origine ne se supprime pas, modifie-le dans la grille.", { pays });
  const { error } = await supabase.from("shipping_costs").delete()
    .eq("shop_id", shopId).eq("country", pays).eq("effective_from", date).in("sku", skusCsv.split(",").filter(Boolean));
  if (error) retour("shipping-costs", slug, "erreur", error.message, { pays });
  await recalculer(supabase, shopId);
  revalidatePath(`/dashboard/${slug}/shipping-costs`);
  retour("shipping-costs", slug, "ok", "Changement supprimé, commandes recalculées.", { pays });
}
