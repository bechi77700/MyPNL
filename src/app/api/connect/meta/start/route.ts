import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlAutorisationMeta } from "@/lib/sync/meta";

/** Envoie l'admin vers Meta pour autoriser la lecture de ses comptes pub. */
export async function POST(request: Request) {
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return erreur(request, slug, "Connecte-toi d'abord.");

  const { data: profil } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profil?.role !== "admin")
    return erreur(request, slug, "Seul un administrateur peut connecter Meta.");

  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET)
    return erreur(request, slug, "L'application Meta n'est pas encore configurée.");

  const origine = new URL(request.url).origin;
  const state = `${crypto.randomBytes(20).toString("hex")}.${slug}`;

  const reponse = NextResponse.redirect(
    urlAutorisationMeta({
      clientId: process.env.META_APP_ID,
      redirectUri: `${origine}/api/connect/meta/callback`,
      state,
    }),
    { status: 303 },
  );
  reponse.cookies.set("meta_oauth_state", state, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600,
  });
  return reponse;
}

function erreur(request: Request, slug: string, message: string) {
  const url = new URL(`/dashboard/${slug}/integrations`, request.url);
  url.searchParams.set("erreur", message);
  return NextResponse.redirect(url, { status: 303 });
}
