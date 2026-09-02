"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listerComptes, enregistrerToken, syncSpendMeta } from "@/lib/sync/meta";
import { syncBoutique } from "@/lib/sync/shopify";

async function contexte(slug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profil } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profil?.role !== "admin") throw new Error("Réservé aux administrateurs.");
  const { data: shop } = await supabase
    .from("shops").select("id, currency").eq("slug", slug).maybeSingle();
  if (!shop) throw new Error("Boutique introuvable");
  return { admin: createAdminClient(), shopId: shop.id as string };
}

function retour(slug: string, cle: "ok" | "erreur", msg: string) {
  redirect(`/dashboard/${slug}/integrations?${new URLSearchParams({ [cle]: msg })}`);
}

export async function connecterMeta(slug: string, form: FormData): Promise<void> {
  const token = String(form.get("token") ?? "").trim();
  if (!token) retour(slug, "erreur", "Jeton manquant.");

  const { admin, shopId } = await contexte(slug);
  let comptes;
  try {
    comptes = await listerComptes(token);
  } catch (e) {
    retour(slug, "erreur", e instanceof Error ? e.message : "Jeton refusé par Meta.");
    return;
  }
  if (!comptes.length) retour(slug, "erreur", "Ce jeton ne donne accès à aucun compte publicitaire.");

  await enregistrerToken(admin, shopId, token);
  await admin.from("ad_accounts").upsert(
    comptes.map((c) => ({
      shop_id: shopId, platform: "meta", external_id: c.id,
      name: c.name, currency: c.currency,
      enabled: false, // l'utilisateur choisit lesquels suivre
    })),
    { onConflict: "shop_id,platform,external_id", ignoreDuplicates: true },
  );

  revalidatePath(`/dashboard/${slug}/integrations`);
  retour(slug, "ok", `Meta connecté — ${comptes.length} comptes trouvés. Active ceux à suivre.`);
}

export async function basculerCompte(slug: string, id: string, actif: boolean): Promise<void> {
  const { admin } = await contexte(slug);
  await admin.from("ad_accounts").update({ enabled: actif }).eq("id", id);
  revalidatePath(`/dashboard/${slug}/integrations`);
  redirect(`/dashboard/${slug}/integrations`);
}

export async function synchroniserMaintenant(slug: string, form: FormData): Promise<void> {
  const quoi = String(form.get("quoi") ?? "tout");
  const { admin, shopId } = await contexte(slug);
  const messages: string[] = [];
  void admin;

  try {
    if (quoi === "shopify" || quoi === "tout") {
      const r = await syncBoutique(shopId);
      messages.push(`Shopify : ${r.commandes} commandes`);
      if (r.erreurs.length) messages.push(...r.erreurs);
    }
    if (quoi === "meta" || quoi === "tout") {
      const r = await syncSpendMeta(createAdminClient(), shopId, { jours: 60 });
      messages.push(`Meta : ${r.jours} jours de dépense`);
      if (r.erreurs.length) messages.push(...r.erreurs);
    }
  } catch (e) {
    retour(slug, "erreur", e instanceof Error ? e.message : "Échec de la synchro.");
  }
  revalidatePath(`/dashboard/${slug}/integrations`);
  retour(slug, "ok", messages.join(" · "));
}

/** Saisie manuelle : un montant total reparti au prorata sur la periode. */
export async function ajouterDepenseManuelle(slug: string, form: FormData): Promise<void> {
  const { admin, shopId } = await contexte(slug);
  const plateforme = String(form.get("platform") ?? "manual");
  const debut = String(form.get("du") ?? "");
  const fin = String(form.get("au") ?? "");
  const total = Number(form.get("montant")) || 0;
  if (!debut || !fin || total <= 0) retour(slug, "erreur", "Période ou montant invalide.");

  const d0 = new Date(debut + "T00:00:00Z");
  const d1 = new Date(fin + "T00:00:00Z");
  const nb = Math.floor((d1.getTime() - d0.getTime()) / 86400_000) + 1;
  if (nb <= 0 || nb > 400) retour(slug, "erreur", "Période invalide.");

  const parJour = total / nb;
  const lignes = Array.from({ length: nb }, (_, i) => ({
    shop_id: shopId,
    date: new Date(d0.getTime() + i * 86400_000).toISOString().slice(0, 10),
    platform: plateforme,
    amount: parJour,
    source: "manual",
    updated_at: new Date().toISOString(),
  }));

  const { error } = await admin
    .from("ad_spend").upsert(lignes, { onConflict: "shop_id,date,platform" });
  if (error) retour(slug, "erreur", error.message);

  await admin.rpc("refresh_daily_facts", { p_shop: shopId, p_from: debut, p_to: fin });
  revalidatePath(`/dashboard/${slug}/integrations`);
  retour(slug, "ok", `${total.toLocaleString("fr-FR")} réparti sur ${nb} jours (${plateforme}).`);
}
