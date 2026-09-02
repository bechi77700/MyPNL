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
            <p className="mt-3 flex items-center gap-2 text-[13px] text-doux">
              {profil?.email}
              {estAdmin && <Pastille ton="vert">admin</Pastille>}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <Bouton variante="discret">Se déconnecter</Bouton>
          </form>
        </header>

        <Message erreur={erreur} />

        {boutiques && boutiques.length > 1 && (
          <Link
            href="/overview"
            className="mb-3 flex items-center justify-between rounded-[9px] border border-accent/30 bg-accent/5 px-5 py-4 transition-colors hover:border-accent/50"
          >
            <span className="font-medium text-accent">Vue consolidée</span>
            <span className="text-[13px] text-doux">
              les {boutiques.length} boutiques ensemble
            </span>
          </Link>
        )}

        {boutiques && boutiques.length > 0 ? (
          <ul className="space-y-2">
            {boutiques.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/dashboard/${b.slug}`}
                  className="flex items-center justify-between carte rounded-[14px] bg-carte px-5 py-4 transition-colors hover:border-bord-fort hover:bg-carte-haut"
                >
                  <span className="font-medium text-texte">{b.name}</span>
                  <span className="text-[13px] text-faible">
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
            <h2 className="text-[13px] font-medium text-texte">Ajouter une boutique</h2>
            <p className="mt-1 text-[13px] text-faible">
              Entre son adresse Shopify. Tu seras redirigé vers Shopify pour
              autoriser l&apos;accès en lecture.
            </p>
            <form
              action="/api/connect/shopify/start"
              method="post"
              className="mt-4 flex flex-col gap-2"
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <Champ name="domaine" required placeholder="ma-boutique.myshopify.com" className="flex-1" />
                <Bouton type="submit">Connecter</Bouton>
              </div>
              <details className="group">
                <summary className="cursor-pointer text-[12px] text-faible transition-colors hover:text-doux">
                  Boutique d&apos;une autre organisation Shopify ? Identifiants de son app
                </summary>
                <div className="mt-2 rounded-[12px] bg-carte-haut px-4 py-3.5">
                  <p className="text-[12.5px] leading-relaxed text-doux">
                    Une app Shopify ne s&apos;installe que sur les boutiques de son organisation.
                    Pour une autre organisation : Dev Dashboard de cette organisation → créer une app « MyPNL »
                    (App URL <span className="chiffres">https://mypnl-tau.vercel.app</span>, les 8 scopes de lecture,
                    « Use legacy install flow » coché, redirection <span className="chiffres">https://mypnl-tau.vercel.app/api/connect/shopify/callback</span>,
                    Release), puis copie le Client ID et le Secret depuis App settings.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Champ name="client_id" placeholder="Client ID (32 caractères)" autoComplete="off" className="flex-1" />
                    <Champ name="client_secret" type="password" placeholder="Secret" autoComplete="off" className="flex-1" />
                  </div>
                </div>
              </details>
            </form>

            <details className="mt-4 group">
              <summary className="cursor-pointer text-[12px] text-faible transition-colors hover:text-doux">
                Shopify refuse l&apos;installation ? Connecter avec un jeton Admin API
              </summary>
              <div className="mt-3 rounded-[12px] bg-carte-haut px-4 py-3.5">
                <p className="text-[12.5px] leading-relaxed text-doux">
                  Dans l&apos;admin de la boutique : <b className="text-texte">Paramètres → Applications et canaux de vente → Développer des applications → Créer une application</b>.
                  Onglet Configuration → API Admin → coche les 8 permissions de lecture
                  (<span className="chiffres">read_orders, read_all_orders, read_products, read_customers, read_reports, read_fulfillments, read_shopify_payments_payouts, read_shopify_payments_disputes</span>),
                  enregistre, puis <b className="text-texte">Installer l&apos;application</b> et copie le jeton <span className="chiffres">shpat_…</span> (affiché une seule fois).
                </p>
                <form action="/api/connect/shopify/token" method="post" className="mt-3 flex flex-col gap-2">
                  <Champ name="domaine" required placeholder="ma-boutique.myshopify.com" />
                  <Champ name="token" required type="password" placeholder="shpat_…" autoComplete="off" />
                  <Bouton type="submit" variante="discret">Connecter avec le jeton</Bouton>
                </form>
              </div>
            </details>
          </Carte>
        )}
      </div>
    </main>
  );
}
