import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Le RLS suffit : une boutique non autorisee ne remonte pas, meme en tapant l'URL.
  const { data: boutique } = await supabase
    .from("shops")
    .select("id, slug, name, currency, timezone")
    .eq("slug", slug)
    .maybeSingle();

  if (!boutique) notFound();

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="flex w-60 shrink-0 flex-col bg-neutral-950 px-4 py-6">
        <div className="px-2">
          <p className="text-sm font-semibold text-neutral-100">MyPNL</p>
          <p className="mt-0.5 truncate text-xs text-neutral-500">
            {boutique.name}
          </p>
        </div>
        <nav className="mt-8 space-y-0.5 text-sm">
          {[
            ["Vue d'ensemble", true],
            ["Calendrier", false],
            ["Coûts", false],
            ["Fournisseurs", false],
            ["Prévisionnel", false],
            ["Planification", false],
            ["Sources", false],
          ].map(([label, actif]) => (
            <span
              key={String(label)}
              className={`block rounded-lg px-3 py-2 ${
                actif
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-500"
              }`}
            >
              {String(label)}
            </span>
          ))}
        </nav>
        <div className="mt-auto space-y-1 px-1">
          <Link
            href="/select"
            className="block rounded-lg px-2 py-1.5 text-xs text-neutral-500 transition hover:text-neutral-300"
          >
            Changer de boutique
          </Link>
          <form action="/auth/signout" method="post">
            <button className="block rounded-lg px-2 py-1.5 text-xs text-neutral-500 transition hover:text-neutral-300">
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-8 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          {boutique.name}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {boutique.currency} · {boutique.timezone}
        </p>
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center">
          <p className="text-neutral-700">Les onglets arrivent.</p>
          <p className="mt-2 text-sm text-neutral-500">
            Prochaine étape : connecter Shopify pour remplir ce tableau de bord.
          </p>
        </div>
      </main>
    </div>
  );
}
