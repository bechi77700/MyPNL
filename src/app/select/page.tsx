import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { Bouton, Carte, Champ, Message, Pastille } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SelectPage({
  searchParams,
}: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  const { data: boutiques } = await supabase
    .from("shops").select("id, slug, name, currency, timezone")
    .eq("is_active", true).order("name");

  const estAdmin = profil?.role === "admin";
  if (boutiques?.length === 1 && !estAdmin && !erreur)
    redirect(`/dashboard/${boutiques[0].slug}`);

  return (
    <main className="min-h-screen px-6 py-14">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-9 flex items-start justify-between gap-4">
          <div>
            <Logo />
            <p className="mt-3 flex items-center gap-2 text-sm text-doux">
              {profil?.email}
              {estAdmin && <Pastille ton="vert">admin</Pastille>}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <Bouton variante="discret">Se déconnecter</Bouton>
          </form>
        </header>

        <Message erreur={erreur} />

        {boutiques && boutiques.length > 0 ? (
          <ul className="space-y-2">
            {boutiques.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/dashboard/${b.slug}`}
                  className="flex items-center justify-between rounded-2xl border border-bord bg-carte px-5 py-4 transition hover:border-bord-fort hover:bg-carte-haut"
                >
                  <span className="font-medium text-texte">{b.name}</span>
                  <span className="text-sm text-faible">
                    {b.currency} · {b.timezone}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Carte className="border-dashed px-6 py-12 text-center">
            <p className="text-doux">
              {estAdmin
                ? "Aucune boutique connectée."
                : "Aucune boutique ne t'a été attribuée."}
            </p>
          </Carte>
        )}

        {estAdmin && (
          <Carte className="mt-8 px-5 py-5">
            <h2 className="text-sm font-medium text-texte">Ajouter une boutique</h2>
            <p className="mt-1 text-sm text-faible">
              Entre son adresse Shopify. Tu seras redirigé vers Shopify pour
              autoriser l&apos;accès en lecture.
            </p>
            <form
              action="/api/connect/shopify/start"
              method="post"
              className="mt-4 flex flex-col gap-2 sm:flex-row"
            >
              <Champ name="domaine" required placeholder="ma-boutique.myshopify.com" className="flex-1" />
              <Bouton type="submit">Connecter</Bouton>
            </form>
          </Carte>
        )}
      </div>
    </main>
  );
}
