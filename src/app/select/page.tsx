import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SelectPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { erreur } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single();

  // Le RLS filtre : on ne recoit que les boutiques autorisees.
  const { data: boutiques } = await supabase
    .from("shops")
    .select("id, slug, name, currency, timezone")
    .eq("is_active", true)
    .order("name");

  const estAdmin = profil?.role === "admin";

  // Une seule boutique et rien a ajouter : on y va directement.
  if (boutiques?.length === 1 && !estAdmin && !erreur)
    redirect(`/dashboard/${boutiques[0].slug}`);

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-16">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
              Tes boutiques
            </h1>
            <p className="mt-1.5 text-sm text-neutral-500">
              {profil?.email}
              {estAdmin && (
                <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                  admin
                </span>
              )}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="rounded-lg border border-neutral-800 px-3 py-1.5 text-sm text-neutral-400 transition hover:border-neutral-700 hover:text-neutral-200">
              Se déconnecter
            </button>
          </form>
        </header>

        {erreur && (
          <p className="mb-6 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {erreur}
          </p>
        )}

        {boutiques && boutiques.length > 0 ? (
          <ul className="space-y-2">
            {boutiques.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/dashboard/${b.slug}`}
                  className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 px-5 py-4 transition hover:border-neutral-700 hover:bg-neutral-900"
                >
                  <span className="font-medium text-neutral-100">{b.name}</span>
                  <span className="text-sm text-neutral-500">
                    {b.currency} · {b.timezone}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-neutral-800 px-6 py-10 text-center">
            <p className="text-neutral-300">
              {estAdmin
                ? "Aucune boutique connectée pour l'instant."
                : "Aucune boutique ne t'a encore été attribuée."}
            </p>
            {!estAdmin && (
              <p className="mt-2 text-sm text-neutral-500">
                Demande à un administrateur de te donner accès.
              </p>
            )}
          </div>
        )}

        {estAdmin && (
          <section className="mt-10 rounded-xl border border-neutral-800 bg-neutral-900/40 px-5 py-5">
            <h2 className="text-sm font-medium text-neutral-200">
              Ajouter une boutique
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Entre son adresse Shopify. Tu seras redirigé vers Shopify pour
              autoriser l&apos;accès en lecture.
            </p>
            <form
              action="/api/connect/shopify/start"
              method="post"
              className="mt-4 flex flex-col gap-2 sm:flex-row"
            >
              <input
                name="domaine"
                required
                placeholder="ma-boutique.myshopify.com"
                className="flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-neutral-600"
              />
              <button className="rounded-lg bg-neutral-100 px-4 py-2.5 font-medium text-neutral-900 transition hover:bg-white">
                Connecter
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
