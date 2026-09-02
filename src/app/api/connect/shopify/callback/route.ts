import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import {
  echangerCodeContreToken,
  infosBoutique,
  normaliserDomaine,
  slugifier,
  verifierHmac,
} from "@/lib/shopify";

/** Retour de Shopify apres le clic sur "Installer l'application". */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) return retour(request, "Cles Shopify absentes.");

  if (!verifierHmac(params, secret))
    return retour(request, "Signature Shopify invalide. Installation refusee.");

  const attendu = request.headers
    .get("cookie")
    ?.match(/shopify_oauth_state=([^;]+)/)?.[1];
  if (!attendu || attendu !== params.get("state"))
    return retour(request, "Session d'installation expiree. Recommence.");

  const domaine = normaliserDomaine(params.get("shop") ?? "");
  const code = params.get("code");
  if (!domaine || !code) return retour(request, "Reponse Shopify incomplete.");

  try {
    const token = await echangerCodeContreToken(domaine, code);
    const infos = await infosBoutique(domaine, token);
    const admin = createAdminClient();

    // La devise et le fuseau viennent de Shopify : jamais codes en dur.
    const { data: existante } = await admin
      .from("shops")
      .select("id, slug")
      .eq("domain", domaine)
      .maybeSingle();

    let shopId = existante?.id as string | undefined;
    let slug = existante?.slug as string | undefined;

    if (!shopId) {
      slug = await slugLibre(admin, slugifier(infos.name));
      const { data, error } = await admin
        .from("shops")
        .insert({
          slug,
          name: infos.name,
          domain: domaine,
          currency: infos.currency,
          timezone: infos.iana_timezone,
        })
        .select("id, slug")
        .single();
      if (error) throw new Error(error.message);
      shopId = data.id;
      slug = data.slug;
    } else {
      await admin
        .from("shops")
        .update({
          name: infos.name,
          currency: infos.currency,
          timezone: infos.iana_timezone,
          is_active: true,
        })
        .eq("id", shopId);
    }

    await admin.from("connectors").upsert(
      {
        shop_id: shopId,
        platform: "shopify",
        creds_encrypted: encrypt(JSON.stringify({ token, domaine })),
        status: "connected",
        last_error: null,
      },
      { onConflict: "shop_id,platform" },
    );

    const ok = new URL(`/dashboard/${slug}`, request.url);
    ok.searchParams.set("connecte", "1");
    const reponse = NextResponse.redirect(ok, { status: 303 });
    reponse.cookies.delete("shopify_oauth_state");
    return reponse;
  } catch (e) {
    return retour(request, e instanceof Error ? e.message : "Echec de l'installation.");
  }
}

async function slugLibre(
  admin: ReturnType<typeof createAdminClient>,
  base: string,
) {
  for (let i = 0; i < 50; i++) {
    const essai = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await admin
      .from("shops")
      .select("id")
      .eq("slug", essai)
      .maybeSingle();
    if (!data) return essai;
  }
  return `${base}-${Date.now()}`;
}

function retour(request: Request, message: string) {
  const url = new URL("/select", request.url);
  url.searchParams.set("erreur", message);
  return NextResponse.redirect(url, { status: 303 });
}
