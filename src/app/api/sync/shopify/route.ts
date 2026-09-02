import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncBoutique } from "@/lib/sync/shopify";

export const maxDuration = 60;

/** Synchronisation manuelle depuis l'app. Reservee aux admins. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: "Non connecte." }, { status: 401 });

  const { data: profil } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profil?.role !== "admin")
    return NextResponse.json({ erreur: "Reserve aux administrateurs." }, { status: 403 });

  const { slug } = (await request.json().catch(() => ({}))) as { slug?: string };
  if (!slug) return NextResponse.json({ erreur: "slug manquant." }, { status: 400 });

  const admin = createAdminClient();
  const { data: shop } = await admin
    .from("shops").select("id").eq("slug", slug).single();
  if (!shop) return NextResponse.json({ erreur: "Boutique inconnue." }, { status: 404 });

  try {
    const res = await syncBoutique(shop.id);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json(
      { erreur: e instanceof Error ? e.message : "Echec de la synchro." },
      { status: 500 },
    );
  }
}
