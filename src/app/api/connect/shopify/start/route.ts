import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normaliserDomaine, urlAutorisation } from "@/lib/shopify";
import { encrypt } from "@/lib/crypto";

/** Demarre l'installation : seul un admin connecte peut brancher une boutique. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erreur(request, "Connecte-toi d'abord.");

  const { data: profil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profil?.role !== "admin")
    return erreur(request, "Seul un administrateur peut ajouter une boutique.");

  const form = await request.formData();
  const domaine = normaliserDomaine(String(form.get("domaine") ?? ""));
  if (!domaine)
    return erreur(request, "Adresse invalide. Format attendu : ma-boutique.myshopify.com");

  // Une app Shopify n'est installable que sur les boutiques de SON organisation.
  // Pour une boutique d'une autre organisation, on accepte les identifiants de
  // l'app MyPNL creee dans le Dev Dashboard de cette organisation.
  const clientIdSaisi = String(form.get("client_id") ?? "").trim();
  const secretSaisi = String(form.get("client_secret") ?? "").trim();
  if ((clientIdSaisi && !secretSaisi) || (!clientIdSaisi && secretSaisi))
    return erreur(request, "Il faut le Client ID ET le Secret de l'app de cette organisation.");
  if (clientIdSaisi && !/^[a-f0-9]{32}$/i.test(clientIdSaisi))
    return erreur(request, "Le Client ID doit faire 32 caracteres (copie-le depuis App settings).");

  const clientId = clientIdSaisi || process.env.SHOPIFY_API_KEY;
  const secret = secretSaisi || process.env.SHOPIFY_API_SECRET;
  if (!clientId || !secret)
    return erreur(request, "Les cles Shopify ne sont pas encore configurees.");

  const state = crypto.randomBytes(24).toString("hex");
  const origine = new URL(request.url).origin;

  const reponse = NextResponse.redirect(
    urlAutorisation({
      domaine,
      clientId,
      redirectUri: `${origine}/api/connect/shopify/callback`,
      state,
    }),
    { status: 303 },
  );

  // Le state protege contre les installations forgees par un tiers.
  reponse.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  // Identifiants de l'app pour le callback, chiffres, uniquement si differents de l'env.
  reponse.cookies.set(
    "shopify_oauth_app",
    clientIdSaisi ? encrypt(JSON.stringify({ clientId, secret })) : "",
    { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: clientIdSaisi ? 600 : 0 },
  );
  return reponse;
}

function erreur(request: Request, message: string) {
  const url = new URL("/select", request.url);
  url.searchParams.set("erreur", message);
  return NextResponse.redirect(url, { status: 303 });
}
