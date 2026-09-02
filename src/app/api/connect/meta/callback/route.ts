import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { echangerCodeMeta, enregistrerToken, listerComptes } from "@/lib/sync/meta";

/** Retour de Meta apres autorisation. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const slug = state.split(".")[1] ?? "";

  const attendu = request.headers
    .get("cookie")?.match(/meta_oauth_state=([^;]+)/)?.[1];
  if (!attendu || decodeURIComponent(attendu) !== state)
    return retour(request, slug, "Session d'autorisation expirée. Recommence.");

  const refus = url.searchParams.get("error_description");
  if (refus) return retour(request, slug, `Meta a refusé : ${refus}`);

  const code = url.searchParams.get("code");
  if (!code) return retour(request, slug, "Réponse Meta incomplète.");

  try {
    const admin = createAdminClient();
    const { data: shop } = await admin
      .from("shops").select("id").eq("slug", slug).maybeSingle();
    if (!shop) return retour(request, slug, "Boutique introuvable.");

    const { token, expire_le } = await echangerCodeMeta({
      code,
      redirectUri: `${url.origin}/api/connect/meta/callback`,
    });

    const comptes = await listerComptes(token);
    await enregistrerToken(admin, shop.id, token, expire_le);

    // Les comptes arrivent desactives : l'utilisateur choisit lesquels suivre.
    if (comptes.length) {
      await admin.from("ad_accounts").upsert(
        comptes.map((c) => ({
          shop_id: shop.id, platform: "meta", external_id: c.id,
          name: c.name, currency: c.currency, enabled: false,
        })),
        { onConflict: "shop_id,platform,external_id", ignoreDuplicates: true },
      );
    }

    const ok = new URL(`/dashboard/${slug}/integrations`, request.url);
    ok.searchParams.set(
      "ok",
      `Meta connecté — ${comptes.length} comptes trouvés. Active ceux à suivre.`,
    );
    const reponse = NextResponse.redirect(ok, { status: 303 });
    reponse.cookies.delete("meta_oauth_state");
    return reponse;
  } catch (e) {
    return retour(request, slug, e instanceof Error ? e.message : "Échec de la connexion Meta.");
  }
}

function retour(request: Request, slug: string, message: string) {
  const url = new URL(`/dashboard/${slug}/integrations`, request.url);
  url.searchParams.set("erreur", message);
  return NextResponse.redirect(url, { status: 303 });
}
