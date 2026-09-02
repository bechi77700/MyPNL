import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncBoutique } from "@/lib/sync/shopify";
import { syncSpendMeta } from "@/lib/sync/meta";

export const maxDuration = 60;

/**
 * Synchronisation automatique, appelee toutes les heures par GitHub Actions.
 * Incrementale : on ne rappelle Shopify que sur les jours recents,
 * le passe reste fige.
 */
async function executer(request: Request) {
  const attendu = process.env.CRON_SECRET;
  const recu = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!attendu || recu !== attendu)
    return NextResponse.json({ erreur: "Non autorisé." }, { status: 401 });

  const admin = createAdminClient();
  const cible = new URL(request.url).searchParams.get("shop");

  let q = admin.from("shops").select("id, slug, name").eq("is_active", true);
  if (cible) q = q.eq("slug", cible);
  const { data: boutiques, error } = await q;
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  const debut = Date.now();
  const resultats: Record<string, unknown>[] = [];

  for (const b of boutiques ?? []) {
    // On garde 8 s de marge avant la coupure a 60 s : la boutique non traitee
    // sera reprise a l'heure suivante, la synchro etant incrementale.
    if (Date.now() - debut > 52_000) {
      resultats.push({ boutique: b.slug, ignore: "temps imparti atteint" });
      continue;
    }
    const r: Record<string, unknown> = { boutique: b.slug };
    try {
      const s = await syncBoutique(b.id);
      r.commandes = s.commandes;
      r.jours_frais = s.jours_frais;
      if (s.erreurs.length) r.erreurs_shopify = s.erreurs;
    } catch (e) {
      r.erreur_shopify = e instanceof Error ? e.message : String(e);
    }
    try {
      const m = await syncSpendMeta(admin, b.id, { jours: 14 });
      r.jours_pub = m.jours;
      if (m.erreurs.length) r.erreurs_meta = m.erreurs;
    } catch (e) {
      // Meta absent ou jeton expire : ce n'est pas un echec de la synchro.
      r.meta = e instanceof Error ? e.message : String(e);
    }
    resultats.push(r);
  }

  return NextResponse.json({
    duree_s: Math.round((Date.now() - debut) / 1000),
    boutiques: resultats,
  });
}

export const GET = executer;
export const POST = executer;
