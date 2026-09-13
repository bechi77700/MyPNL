"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Reglages de l'onglet Targets : produit principal + marges. */
export async function enregistrerTargets(slug: string, form: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: shop } = await supabase.from("shops").select("id").eq("slug", slug).maybeSingle();
  if (!shop) throw new Error("Boutique introuvable");
  const skus = String(form.get("skus") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const label = String(form.get("label") ?? "").trim() || null;
  const pct = (k: string, def: number) => {
    const v = Number(String(form.get(k) ?? "").replace(",", "."));
    return Number.isFinite(v) && v >= 0 && v <= 90 ? v : def;
  };
  if (!skus.length) redirect(`/dashboard/${slug}/targets?erreur=${encodeURIComponent("Choisis le produit principal.")}`);
  const { error } = await supabase.from("shop_targets").upsert({
    shop_id: shop.id, main_skus: skus, main_label: label,
    margin_min: pct("margin_min", 15), margin_target: pct("margin_target", 20),
    loss_pct: pct("loss_pct", 20), atc_pct: pct("atc_pct", 20),
    updated_at: new Date().toISOString(),
  }, { onConflict: "shop_id" });
  if (error) redirect(`/dashboard/${slug}/targets?erreur=${encodeURIComponent(error.message)}`);
  revalidatePath(`/dashboard/${slug}/targets`);
  redirect(`/dashboard/${slug}/targets?ok=${encodeURIComponent("Réglages enregistrés.")}`);
}
