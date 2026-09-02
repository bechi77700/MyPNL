import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normaliserDomaine, urlAutorisation } from "@/lib/shopify";

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

  const clientId = process.env.SHOPIFY_API_KEY;
  if (!clientId || !process.env.SHOPIFY_API_SECRET)
    return erreur(request, "Les cles Shopify ne sont pas encore configurees.");

  const form = await request.formData();
  const domaine = normaliserDomaine(String(form.get("domaine") ?? ""));
  if (!domaine)
    return erreur(request, "Adresse invalide. Format attendu : ma-boutique.myshopify.com");

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
  return reponse;
}

function erreur(request: Request, message: string) {
  const url = new URL("/select", request.url);
  url.searchParams.set("erreur", message);
  return NextResponse.redirect(url, { status: 303 });
}
