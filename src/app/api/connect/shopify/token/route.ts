import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { infosBoutique, normaliserDomaine, slugifier } from "@/lib/shopify";

/**
 * Plan B : connexion par jeton Admin API (app personnalisee creee dans
 * l'admin de la boutique). Ne depend pas de la distribution de l'app
 * Shopify : marche pour toute boutique dont on est proprietaire.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return erreur(request, "Connecte-toi d'abord.");
  const { data: profil } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profil?.role !== "admin") return erreur(request, "Seul un administrateur peut ajouter une boutique.");

  const form = await request.formData();
  const domaine = normaliserDomaine(String(form.get("domaine") ?? ""));
  const token = String(form.get("token") ?? "").trim();
  if (!domaine) return erreur(request, "Adresse invalide. Format attendu : ma-boutique.myshopify.com");
  if (!/^shpat_[a-f0-9]{20,}$/i.test(token))
    return erreur(request, "Le jeton doit commencer par shpat_ (jeton d'accès à l'API Admin).");

  try {
    // Le jeton est teste AVANT d'etre stocke : on lit la boutique avec.
    const infos = await infosBoutique(domaine, token);
    const admin = createAdminClient();

    const { data: existante } = await admin
      .from("shops").select("id, slug").eq("domain", domaine).maybeSingle();
    let shopId = existante?.id as string | undefined;
    let slug = existante?.slug as string | undefined;

    if (!shopId) {
      const base = slugifier(infos.name);
      let essai = base;
      for (let i = 2; i < 50; i++) {
        const { data } = await admin.from("shops").select("id").eq("slug", essai).maybeSingle();
        if (!data) break;
        essai = `${base}-${i}`;
      }
      const { data, error } = await admin.from("shops").insert({
        slug: essai, name: infos.name, domain: domaine,
        currency: infos.currency, timezone: infos.iana_timezone,
      }).select("id, slug").single();
      if (error) throw new Error(error.message);
      shopId = data.id; slug = data.slug;
    } else {
      await admin.from("shops").update({
        name: infos.name, currency: infos.currency, timezone: infos.iana_timezone, is_active: true,
      }).eq("id", shopId);
    }

    await admin.from("connectors").upsert(
      {
        shop_id: shopId, platform: "shopify",
        creds_encrypted: encrypt(JSON.stringify({ token, domaine })),
        status: "connected", last_error: null,
      },
      { onConflict: "shop_id,platform" },
    );

    const ok = new URL(`/dashboard/${slug}/integrations`, request.url);
    ok.searchParams.set("ok", `${infos.name} connectée. Lance « Synchroniser maintenant » pour rapatrier l'historique.`);
    return NextResponse.redirect(ok, { status: 303 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Jeton refusé par Shopify.";
    return erreur(request, /401|403/.test(msg) ? "Shopify refuse ce jeton : vérifie qu'il vient bien de cette boutique et que les permissions sont accordées." : msg);
  }
}

function erreur(request: Request, message: string) {
  const url = new URL("/select", request.url);
  url.searchParams.set("erreur", message);
  return NextResponse.redirect(url, { status: 303 });
}
