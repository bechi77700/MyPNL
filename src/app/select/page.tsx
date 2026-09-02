import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SelectPage() {
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

  // Une seule boutique accessible : on y va directement.
  if (boutiques?.length === 1) redirect(`/dashboard/${boutiques[0].slug}`);

  const estAdmin = profil?.role === "admin";

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
          <div className="rounded-xl border border-dashed border-neutral-800 px-6 py-12 text-center">
            <p className="text-neutral-300">
              {estAdmin
                ? "Aucune boutique connectée pour l'instant."
                : "Aucune boutique ne t'a encore été attribuée."}
            </p>
            <p className="mt-2 text-sm text-neutral-500">
              {estAdmin
                ? "La connexion Shopify arrive à l'étape suivante."
                : "Demande à un administrateur de te donner accès."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
