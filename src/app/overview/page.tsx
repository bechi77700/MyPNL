import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { Bouton, Carte, Pastille } from "@/components/ui";
import BarreRapport from "@/components/barre-rapport";
import {
  formaterMontant, formaterNombre, formaterPourcent,
  periodePrecedente, resoudrePeriode,
} from "@/lib/periode";

export const dynamic = "force-dynamic";

type Pnl = {
  orders_count: number; gross_sales: number; refunds: number; revenue_ht: number;
  cogs: number; transaction_fees: number; gross_margin: number;
  ad_spend: number; contribution: number; opex: number; owner_salary: number;
  ebitda: number; sessions: number;
};

type Boutique = {
  id: string; slug: string; name: string; currency: string; timezone: string;
};

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; du?: string; au?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();

  const { data: brutes } = await supabase
    .from("shops").select("id, slug, name, currency, timezone")
    .eq("is_active", true).order("name");
  const boutiques = (brutes ?? []) as Boutique[];

  if (boutiques.length === 0) redirect("/select");
  if (boutiques.length === 1) redirect(`/dashboard/${boutiques[0].slug}`);

  // Le fuseau de la premiere boutique sert de reference pour la periode.
  const periode = resoudrePeriode(boutiques[0].timezone, sp);
  const avant = periodePrecedente(periode.du, periode.au);

  const lignes = await Promise.all(
    boutiques.map(async (b) => {
      const [{ data: a }, { data: p }] = await Promise.all([
        supabase.rpc("pnl_summary", { p_shop: b.id, p_from: periode.du, p_to: periode.au }),
        supabase.rpc("pnl_summary", { p_shop: b.id, p_from: avant.du, p_to: avant.au }),
      ]);
      return {
        boutique: b,
        actuel: (a?.[0] ?? {}) as Partial<Pnl>,
        avant: (p?.[0] ?? {}) as Partial<Pnl>,
      };
    }),
  );

  const n = (v: unknown) => Number(v ?? 0);

  // Les devises ne s'additionnent pas : on totalise par devise, jamais entre elles.
  const parDevise = new Map<string, { ca: number; cogs: number; frais: number; pub: number; ebitda: number; cmd: number; ebitdaAvant: number }>();
  for (const l of lignes) {
    const d = l.boutique.currency;
    const t = parDevise.get(d) ?? { ca: 0, cogs: 0, frais: 0, pub: 0, ebitda: 0, cmd: 0, ebitdaAvant: 0 };
    t.ca += n(l.actuel.gross_sales);
    t.cogs += n(l.actuel.cogs);
    t.frais += n(l.actuel.transaction_fees);
    t.pub += n(l.actuel.ad_spend);
    t.ebitda += n(l.actuel.ebitda);
    t.cmd += n(l.actuel.orders_count);
    t.ebitdaAvant += n(l.avant.ebitda);
    parDevise.set(d, t);
  }
  const devises = [...parDevise.entries()];
  const maxCa = Math.max(1, ...lignes.map((l) => n(l.actuel.gross_sales)));

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Logo />
            <p className="mt-3 flex items-center gap-2 text-[13px] text-doux">
              Vue consolidée · {boutiques.length} boutiques
              {profil?.role === "admin" && <Pastille ton="vert">admin</Pastille>}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/select">
              <Bouton variante="discret">Choisir une boutique</Bouton>
            </Link>
            <form action="/auth/signout" method="post">
              <Bouton variante="discret">Se déconnecter</Bouton>
            </form>
          </div>
        </header>

        <BarreRapport
          slug="" actif={periode.preset} du={periode.du} au={periode.au}
          derniereSynchro={null} sansActualisation
        />

        {devises.length > 1 && (
          <Carte className="mb-4 border-alerte/30 bg-alerte/5 px-5 py-4">
            <p className="font-medium text-alerte">
              Tes boutiques n&apos;ont pas la même devise
            </p>
            <p className="mt-1 text-[13px] text-doux">
              Les totaux sont donnés <b className="text-texte">par devise</b>, jamais
              additionnés entre elles. Convertir demanderait un taux de change au jour
              le jour que je n&apos;ai pas — et un total faux serait pire que deux
              totaux justes.
            </p>
          </Carte>
        )}

        {devises.map(([devise, t]) => {
          const m = (v: number) => formaterMontant(v, devise, true);
          const evo = t.ebitdaAvant
            ? ((t.ebitda - t.ebitdaAvant) / Math.abs(t.ebitdaAvant)) * 100
            : null;
          return (
            <Carte key={devise} className="mb-4 px-6 py-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_1fr]">
                <div>
                  <p className="text-[13px] text-doux">
                    Profit net cumulé{devises.length > 1 && ` · ${devise}`}
                  </p>
                  <p className={`chiffres mt-2 text-[36px] font-semibold leading-none tracking-tight ${
                    t.ebitda < 0 ? "text-negatif" : "text-texte"
                  }`}>
                    {m(t.ebitda)}
                  </p>
                  {evo !== null && (
                    <span className={`chiffres mt-3 inline-block rounded-md px-1.5 py-0.5 text-[11.5px] ${
                      evo >= 0 ? "bg-accent/10 text-accent" : "bg-negatif/10 text-negatif"
                    }`}>
                      {evo >= 0 ? "↑" : "↓"} {Math.abs(evo).toFixed(1).replace(".", ",")} %
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                  <Bloc label="Commandes" valeur={formaterNombre(t.cmd)} />
                  <Bloc label="Chiffre d'affaires" valeur={m(t.ca)} />
                  <Bloc label="COGS" valeur={m(t.cogs)} />
                  <Bloc label="Frais réels" valeur={m(t.frais)} />
                  <Bloc label="Dépense pub" valeur={m(t.pub)} />
                  <Bloc
                    label="ROAS blended"
                    valeur={t.pub ? (t.ca / t.pub).toFixed(2) : "—"}
                  />
                  <Bloc
                    label="Panier moyen"
                    valeur={t.cmd ? m(t.ca / t.cmd) : "—"}
                  />
                  <Bloc
                    label="Marge nette"
                    valeur={t.ca ? formaterPourcent((t.ebitda / t.ca) * 100) : "—"}
                  />
                </div>
              </div>
            </Carte>
          );
        })}

        <Carte className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-[13px]">
              <thead className="bg-carte-haut surtitre">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Boutique</th>
                  <th className="px-4 py-2.5 text-left font-medium">Part du CA</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cmd</th>
                  <th className="px-4 py-2.5 text-right font-medium">CA</th>
                  <th className="px-4 py-2.5 text-right font-medium">COGS</th>
                  <th className="px-4 py-2.5 text-right font-medium">Pub</th>
                  <th className="px-4 py-2.5 text-right font-medium">Profit net</th>
                  <th className="px-4 py-2.5 text-right font-medium">Marge</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map(({ boutique, actuel }) => {
                  const m = (v: number) => formaterMontant(v, boutique.currency, true);
                  const ca = n(actuel.gross_sales);
                  const ebitda = n(actuel.ebitda);
                  return (
                    <tr key={boutique.id} className="border-t border-bord transition-colors hover:bg-carte-haut/50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/dashboard/${boutique.slug}`}
                          className="font-medium text-texte underline-offset-4 hover:underline"
                        >
                          {boutique.name}
                        </Link>
                        <p className="text-[11.5px] text-faible">{boutique.currency}</p>
                      </td>
                      <td className="w-40 px-4 py-3">
                        <div className="h-2 overflow-hidden rounded-full bg-carte-haut">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${Math.max(2, (ca / maxCa) * 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="chiffres px-4 py-3 text-right text-doux">
                        {formaterNombre(n(actuel.orders_count))}
                      </td>
                      <td className="chiffres px-4 py-3 text-right text-texte">{m(ca)}</td>
                      <td className="chiffres px-4 py-3 text-right text-faible">{m(n(actuel.cogs))}</td>
                      <td className="chiffres px-4 py-3 text-right text-faible">{m(n(actuel.ad_spend))}</td>
                      <td className={`chiffres px-4 py-2.5 text-right font-medium ${
                        ebitda < 0 ? "text-negatif" : "text-texte"
                      }`}>
                        {m(ebitda)}
                      </td>
                      <td className={`chiffres px-5 py-3 text-right ${ebitda < 0 ? "text-negatif" : "text-doux"}`}>
                        {ca ? formaterPourcent((ebitda / ca) * 100, 0) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Carte>

        <p className="mt-4 text-[11.5px] text-faible">
          Clique sur une boutique pour ouvrir son tableau de bord détaillé.
        </p>
      </div>
    </main>
  );
}

function Bloc({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div>
      <p className="text-[11.5px] text-faible">{label}</p>
      <p className="chiffres mt-1 text-lg text-texte">{valeur}</p>
    </div>
  );
}
